import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";
import { createHash, randomInt } from "crypto";
import { sendVerificationEmail } from "@/lib/email";
import { sendOTP, verifyOTP as verifySmsOTP } from "@/lib/sms";
import { z } from "zod";

const changeContactSchema = z.object({
    action: z.enum(['init', 'verify-current', 'send-new', 'confirm-new']),
    currentEmailOtp: z.string().optional(),
    currentPhoneOtp: z.string().optional(),
    type: z.enum(['email', 'phone']).optional(),
    newContact: z.string().optional(),
    newOtp: z.string().optional(),
});

function generateOTP() {
    return randomInt(100000, 999999).toString();
}

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const parsed = changeContactSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json({ error: "Validation failed" }, { status: 400 });
        }

        const { action, currentEmailOtp, currentPhoneOtp, type, newContact, newOtp } = parsed.data;
        const userId = session.user.id;

        const user = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

        const authKey = `contact_change_auth_session_${userId}`;

        if (action === 'init') {
            // Send OTPs to current email and phone
            if (!user.email && !user.phone) {
                return NextResponse.json({ error: "No contact methods available to initiate change." }, { status: 400 });
            }

            // Send Email OTP
            if (user.email) {
                const emailOtp = generateOTP();
                const emailOtpHash = createHash("sha256").update(emailOtp).digest("hex");
                await prisma.user.update({
                    where: { id: userId },
                    data: {
                        resetPasswordToken: emailOtpHash,
                        resetPasswordExpiry: new Date(Date.now() + 10 * 60 * 1000), // 10 mins
                    },
                });
                await sendVerificationEmail(user.email, emailOtp);
            }

            // Send Phone OTP via MSG91
            if (user.phone) {
                await sendOTP(user.phone);
            }

            return NextResponse.json({ success: true, message: "OTPs sent to your current contact method(s)." });
        }

        if (action === 'verify-current') {
            if (user.email && !currentEmailOtp) {
                return NextResponse.json({ error: "Email OTP is required." }, { status: 400 });
            }
            if (user.phone && !currentPhoneOtp) {
                return NextResponse.json({ error: "Phone OTP is required." }, { status: 400 });
            }

            let isValidEmail = true; // default to true if user has no email
            if (user.email) {
                isValidEmail = false;
                // Verify Email OTP
                const submittedHash = createHash("sha256").update(currentEmailOtp || "").digest("hex");
                const isExpired = !user.resetPasswordExpiry || user.resetPasswordExpiry < new Date();
                const storedHash = user.resetPasswordToken || "";

                if (!isExpired && storedHash.length > 0) {
                    try {
                        const { timingSafeEqual } = await import("crypto");
                        const storedBuffer = Buffer.from(storedHash, "utf8");
                        const submittedBuffer = Buffer.from(submittedHash, "utf8");
                        if (storedBuffer.length === submittedBuffer.length) {
                            isValidEmail = timingSafeEqual(storedBuffer, submittedBuffer);
                        }
                    } catch { isValidEmail = false; }
                }
            }

            let isValidPhone = true; // default to true if user has no phone
            if (user.phone) {
                // Verify Phone OTP
                const phoneVerifyResult = await verifySmsOTP(user.phone, currentPhoneOtp || "");
                isValidPhone = phoneVerifyResult.success;
            }

            if (!isValidEmail || !isValidPhone) {
                return NextResponse.json({ error: "Invalid OTP(s)" }, { status: 400 });
            }

            // Set Auth Session
            await redis.setex(authKey, 600, "authorized"); // 10 minutes

            // Clear reset token
            await prisma.user.update({
                where: { id: userId },
                data: { resetPasswordToken: null, resetPasswordExpiry: null },
            });

            return NextResponse.json({ success: true, message: "Current contacts verified" });
        }

        if (action === 'send-new') {
            const isAuthorized = await redis.get(authKey);
            if (!isAuthorized) return NextResponse.json({ error: "Session expired or unauthorized" }, { status: 403 });
            if (!type || !newContact) return NextResponse.json({ error: "Type and new contact are required" }, { status: 400 });

            if (type === 'email') {
                const otp = generateOTP();
                const otpHash = createHash("sha256").update(otp).digest("hex");
                await redis.setex(`contact_change_new_email_otp_${userId}`, 600, otpHash);
                await sendVerificationEmail(newContact, otp);
            } else if (type === 'phone') {
                await sendOTP(newContact);
            }

            return NextResponse.json({ success: true, message: `OTP sent to new ${type}` });
        }

        if (action === 'confirm-new') {
            const isAuthorized = await redis.get(authKey);
            if (!isAuthorized) return NextResponse.json({ error: "Session expired or unauthorized" }, { status: 403 });
            if (!type || !newContact || !newOtp) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

            let isValidNewOtp = false;

            if (type === 'email') {
                const storedHash = await redis.get(`contact_change_new_email_otp_${userId}`);
                if (storedHash) {
                    const submittedHash = createHash("sha256").update(newOtp).digest("hex");
                    try {
                        const { timingSafeEqual } = await import("crypto");
                        const storedBuffer = Buffer.from(storedHash, "utf8");
                        const submittedBuffer = Buffer.from(submittedHash, "utf8");
                        if (storedBuffer.length === submittedBuffer.length) {
                            isValidNewOtp = timingSafeEqual(storedBuffer, submittedBuffer);
                        }
                    } catch { isValidNewOtp = false; }
                }
            } else if (type === 'phone') {
                const phoneVerifyResult = await verifySmsOTP(newContact, newOtp);
                isValidNewOtp = phoneVerifyResult.success;
            }

            if (!isValidNewOtp) {
                return NextResponse.json({ error: "Invalid OTP for new contact" }, { status: 400 });
            }

            // Update Database
            const updateData: any = {};
            if (type === 'email') {
                updateData.email = newContact;
                updateData.emailVerified = true;
            } else {
                updateData.phone = newContact;
                updateData.phoneVerified = true;
            }

            await prisma.user.update({
                where: { id: userId },
                data: updateData,
            });

            // Clean up Redis
            await redis.del(authKey);
            if (type === 'email') await redis.del(`contact_change_new_email_otp_${userId}`);

            return NextResponse.json({ success: true, message: `${type} updated successfully!` });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    } catch (error) {
        logger.error("Change contact error:", error);
        return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
    }
}
