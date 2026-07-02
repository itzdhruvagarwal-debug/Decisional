import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";
import { createHash } from "crypto";
import { sendVerificationEmail } from "@/lib/email";
import { checkRateLimit } from "@/lib/rate-limit";
import { generateOTP } from "@/lib/utils";
import {
    normalizeIndianPhone,
    sendOTP,
    verifyOTP as verifyPhoneOTP,
} from "@/lib/sms";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { apiWrapper, ApiResponse } from "@/lib/api-wrapper";
import { createActivityLog } from "@/lib/audit";

const changeContactSchema = z.object({
    action: z.enum(['init', 'verify-current', 'send-new', 'confirm-new']),
    currentEmailOtp: z.string().optional(),
    currentPhoneOtp: z.string().optional(),
    type: z.enum(['email', 'phone']).optional(),
    newContact: z.string().optional(),
    newOtp: z.string().optional(),
});

export const POST = apiWrapper(async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return ApiResponse.unauthorized();
        }

        const body = await req.json();
        const parsed = changeContactSchema.safeParse(body);

        if (!parsed.success) {
            return ApiResponse.error("Validation failed");
        }

        const { action, currentEmailOtp, currentPhoneOtp, type, newContact, newOtp } = parsed.data;
        const userId = session.user.id;
        const rateLimit = await checkRateLimit(userId, "AUTH");
        if (!rateLimit.success) {
            return ApiResponse.tooManyRequests("Too many attempts. Please try again later.");
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) return ApiResponse.notFound("User not found");

        const authKey = `contact_change_auth_session_${userId}`;
        const currentEmailOtpKey = `contact_change_current_email_otp_${userId}`;
        const newEmailOtpKey = `contact_change_new_email_otp_${userId}`;

        if (action === 'init') {
            // Send OTPs to current email and phone
            if (!user.email && !user.phone) {
                return ApiResponse.error("No contact methods available to initiate change.");
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
                    return result.retryAfterSeconds
                        ? ApiResponse.tooManyRequests("Failed to send phone OTP. Please try again.", result.retryAfterSeconds)
                        : ApiResponse.error("Failed to send phone OTP. Please try again.", 500);
                }
            }

            return ApiResponse.success(null, "OTPs sent to your current contact method(s.");
        }

        if (action === 'verify-current') {
            if (user.email && !currentEmailOtp) {
                return ApiResponse.error("Email OTP is required.");
            }
            if (user.phone && !currentPhoneOtp) {
                return ApiResponse.error("Phone OTP is required.");
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
                return ApiResponse.error("Invalid OTP(s)");
            }

            // Set Auth Session
            await redis.setex(authKey, 600, "authorized"); // 10 minutes

            await redis.del(currentEmailOtpKey);

            return ApiResponse.success(null, "Current contacts verified");
        }

        if (action === 'send-new') {
            const isAuthorized = await redis.get(authKey);
            if (!isAuthorized) return ApiResponse.forbidden("Session expired or unauthorized");
            if (!type || !newContact) return ApiResponse.error("Type and new contact are required");

            if (type === 'email') {
                const otp = generateOTP();
                const otpHash = createHash("sha256").update(otp).digest("hex");
                await redis.setex(newEmailOtpKey, 600, otpHash);
                await sendVerificationEmail(newContact, otp);
            } else if (type === 'phone') {
                const normalizedPhone = normalizeIndianPhone(newContact);
                if (!normalizedPhone) {
                    return ApiResponse.error("Invalid Indian phone number format");
                }
                const result = await sendOTP(normalizedPhone, {
                    purpose: `contact_change:${userId}:new_phone`,
                });
                if (!result.success) {
                    logger.warn("New phone OTP send failed", {
                        userId,
                        error: result.error,
                    });
                    return result.retryAfterSeconds
                        ? ApiResponse.tooManyRequests("Failed to send OTP to new phone.", result.retryAfterSeconds)
                        : ApiResponse.error("Failed to send OTP to new phone.", 500);
                }
            }

            return ApiResponse.success(null, `OTP sent to new ${type}`);
        }

        if (action === 'confirm-new') {
            const isAuthorized = await redis.get(authKey);
            if (!isAuthorized) return ApiResponse.forbidden("Session expired or unauthorized");
            if (!type || !newContact || !newOtp) return ApiResponse.error("Missing required fields");

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
                    return ApiResponse.error("Invalid Indian phone number format");
                }
                const phoneVerifyResult = await verifyPhoneOTP(
                    normalizedPhone,
                    newOtp,
                    { purpose: `contact_change:${userId}:new_phone` },
                );
                isValidNewOtp = phoneVerifyResult.success;
            }

            if (!isValidNewOtp) {
                return ApiResponse.error("Invalid OTP for new contact");
            }

            // Update Database
            const updateData: { email?: string; emailVerified?: boolean; phone?: string; phoneVerified?: boolean } = {};
            if (type === 'email') {
                const existing = await prisma.user.findUnique({
                    where: { email: newContact.toLowerCase().trim() },
                    select: { id: true },
                });
                if (existing && existing.id !== userId) {
                    return ApiResponse.conflict("Contact is already in use");
                }
                updateData.email = newContact;
                updateData.emailVerified = true;
            } else {
                const normalizedPhone = normalizeIndianPhone(newContact);
                if (!normalizedPhone) {
                    return ApiResponse.error("Invalid Indian phone number format");
                }
                const existing = await prisma.user.findUnique({
                    where: { phone: normalizedPhone },
                    select: { id: true },
                });
                if (existing && existing.id !== userId) {
                    return ApiResponse.conflict("Contact is already in use");
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
                await createActivityLog({
                    userId,
                    action: "PROFILE_UPDATE",
                    entityType: "User",
                    entityId: userId,
                }, tx);
            });

            // Clean up Redis
            await redis.del(authKey);
            await redis.del(`active_session:${userId}`);
            if (type === 'email') await redis.del(newEmailOtpKey);

            return ApiResponse.success(null, `${type} updated successfully!`);
        }

        return ApiResponse.error("Invalid action");
    } catch (error) {
        logger.error("Change contact error:", error);
        return ApiResponse.error("An unexpected error occurred.", 500);
    }
});
