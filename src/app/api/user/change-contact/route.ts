import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";
import { createHash, randomInt } from "crypto";
import { sendVerificationEmail } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";
import {
    normalizeIndianPhone,
    sendOTP,
    verifyOTP as verifyPhoneOTP,
} from "@/lib/sms";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { apiWrapper } from "@/lib/api-wrapper";

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

export const POST = apiWrapper(async function POST(req: NextRequest) {
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
        const rateLimit = await checkRateLimit(userId, "AUTH");
        if (!rateLimit.success) {
            return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

        const authKey = `contact_change_auth_session_${userId}`;
        const currentEmailOtpKey = `contact_change_current_email_otp_${userId}`;
        const newEmailOtpKey = `contact_change_new_email_otp_${userId}`;

        if (action === 'init') {
            // Send OTPs to current email and phone
            if (!user.email && !user.phone) {
                return NextResponse.json({ error: "No contact methods available to initiate change." }, { status: 400 });
            }

            // Send Email OTP
            if (user.email) {
                const emailOtp = generateOTP();
                const emailOtpHash = createHash("sha256").update(emailOtp).digest("hex");
                await redis.setex(currentEmailOtpKey, 600, emailOtpHash);
                await sendVerificationEmail(user.email, emailOtp);
            }

            if (user.phone) {
                const result = await sendOTP(user.phone, {
                    purpose: `contact_change:${userId}:current_phone`,
                });
                if (!result.success) {
                    logger.warn("Current phone OTP send failed", {
                        userId,
                        error: result.error,
                    });
                    return NextResponse.json(
                        { error: "Failed to send phone OTP. Please try again." },
                        { status: result.retryAfterSeconds ? 429 : 500 },
                    );
                }
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
                const storedHash = await redis.get(currentEmailOtpKey);

                if (storedHash) {
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
                const phoneVerifyResult = await verifyPhoneOTP(
                    user.phone,
                    currentPhoneOtp || "",
                    { purpose: `contact_change:${userId}:current_phone` },
                );
                isValidPhone = phoneVerifyResult.success;
            }

            if (!isValidEmail || !isValidPhone) {
                return NextResponse.json({ error: "Invalid OTP(s)" }, { status: 400 });
            }

            // Set Auth Session
            await redis.setex(authKey, 600, "authorized"); // 10 minutes

            await redis.del(currentEmailOtpKey);

            return NextResponse.json({ success: true, message: "Current contacts verified" });
        }

        if (action === 'send-new') {
            const isAuthorized = await redis.get(authKey);
            if (!isAuthorized) return NextResponse.json({ error: "Session expired or unauthorized" }, { status: 403 });
            if (!type || !newContact) return NextResponse.json({ error: "Type and new contact are required" }, { status: 400 });

            if (type === 'email') {
                const otp = generateOTP();
                const otpHash = createHash("sha256").update(otp).digest("hex");
                await redis.setex(newEmailOtpKey, 600, otpHash);
                await sendVerificationEmail(newContact, otp);
            } else if (type === 'phone') {
                const normalizedPhone = normalizeIndianPhone(newContact);
                if (!normalizedPhone) {
                    return NextResponse.json(
                        { error: "Invalid Indian phone number format" },
                        { status: 400 },
                    );
                }
                const result = await sendOTP(normalizedPhone, {
                    purpose: `contact_change:${userId}:new_phone`,
                });
                if (!result.success) {
                    logger.warn("New phone OTP send failed", {
                        userId,
                        error: result.error,
                    });
                    return NextResponse.json(
                        { error: "Failed to send OTP to new phone." },
                        { status: result.retryAfterSeconds ? 429 : 500 },
                    );
                }
            }

            return NextResponse.json({ success: true, message: `OTP sent to new ${type}` });
        }

        if (action === 'confirm-new') {
            const isAuthorized = await redis.get(authKey);
            if (!isAuthorized) return NextResponse.json({ error: "Session expired or unauthorized" }, { status: 403 });
            if (!type || !newContact || !newOtp) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

            let isValidNewOtp = false;

            if (type === 'email') {
                const storedHash = await redis.get(newEmailOtpKey);
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
                const normalizedPhone = normalizeIndianPhone(newContact);
                if (!normalizedPhone) {
                    return NextResponse.json(
                        { error: "Invalid Indian phone number format" },
                        { status: 400 },
                    );
                }
                const phoneVerifyResult = await verifyPhoneOTP(
                    normalizedPhone,
                    newOtp,
                    { purpose: `contact_change:${userId}:new_phone` },
                );
                isValidNewOtp = phoneVerifyResult.success;
            }

            if (!isValidNewOtp) {
                return NextResponse.json({ error: "Invalid OTP for new contact" }, { status: 400 });
            }

            // Update Database
            const updateData: any = {};
            if (type === 'email') {
                const existing = await prisma.user.findUnique({
                    where: { email: newContact.toLowerCase().trim() },
                    select: { id: true },
                });
                if (existing && existing.id !== userId) {
                    return NextResponse.json({ error: "Contact is already in use" }, { status: 409 });
                }
                updateData.email = newContact;
                updateData.emailVerified = true;
            } else {
                const normalizedPhone = normalizeIndianPhone(newContact);
                if (!normalizedPhone) {
                    return NextResponse.json(
                        { error: "Invalid Indian phone number format" },
                        { status: 400 },
                    );
                }
                const existing = await prisma.user.findUnique({
                    where: { phone: normalizedPhone },
                    select: { id: true },
                });
                if (existing && existing.id !== userId) {
                    return NextResponse.json({ error: "Contact is already in use" }, { status: 409 });
                }
                updateData.phone = normalizedPhone;
                updateData.phoneVerified = true;
            }

            await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                await tx.user.update({
                    where: { id: userId },
                    data: updateData,
                });
                await tx.refreshToken.updateMany({
                    where: { userId, revoked: false },
                    data: { revoked: true },
                });
                await tx.activityLog.create({
                    data: {
                        userId,
                        action: type === "email" ? "EMAIL_CHANGED" : "PHONE_CHANGED",
                        entityType: "User",
                        entityId: userId,
                    },
                });
            });

            // Clean up Redis
            await redis.del(authKey);
            await redis.del(`active_session:${userId}`);
            if (type === 'email') await redis.del(newEmailOtpKey);

            return NextResponse.json({ success: true, message: `${type} updated successfully!` });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    } catch (error) {
        logger.error("Change contact error:", error);
        return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
    }
});
