import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { createActivityLog } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { createHash } from "crypto";
import { apiWrapper } from "@/lib/api-wrapper";
import { redis } from "@/lib/redis";
import { checkRateLimit } from "@/lib/rate-limit";

const verifyContactSchema = z.object({
    type: z.enum(["email", "phone"]),
    code: z
        .string()
        .min(4, "Verification code is too short")
        .max(10, "Verification code is too long"),
});

export const POST = apiWrapper(async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const limit = await checkRateLimit(session.user.id, "AUTH");
        if (!limit.success) {
            return NextResponse.json({ error: "Too many verification attempts" }, { status: 429 });
        }

        let body: unknown;
        try {
            body = await req.json();
        } catch {
            return NextResponse.json(
                { error: "Invalid request body" },
                { status: 400 },
            );
        }

        const parsed = verifyContactSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json(
                { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
                { status: 400 },
            );
        }

        const { type, code } = parsed.data;

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
        });
        if (!user)
            return NextResponse.json({ error: "User not found" }, { status: 404 });

        const updateData: { emailVerified?: boolean; phoneVerified?: boolean } = {};

        if (type === "email") {
            // OTPs are stored as SHA-256 hashes in Redis
            // Compare the hash of the submitted code against the stored hash
            const submittedHash = createHash("sha256").update(code).digest("hex");
            const key = `email-contact-otp:${session.user.id}`;
            const storedHash = await redis.get(key) || "";

            // Use constant-time comparison via timingSafeEqual to prevent timing attacks
            const { timingSafeEqual } = await import("crypto");

            let isValidCode = false;
            if (storedHash.length > 0) {
                try {
                    const storedBuffer = Buffer.from(storedHash, "utf8");
                    const submittedBuffer = Buffer.from(submittedHash, "utf8");
                    // Only compare if same length to avoid length-leak
                    if (storedBuffer.length === submittedBuffer.length) {
                        isValidCode = timingSafeEqual(storedBuffer, submittedBuffer);
                    }
                } catch {
                    isValidCode = false;
                }
            }

            if (!isValidCode) {
                logger.warn("Invalid or expired email OTP verification attempt", {
                    userId: session.user.id,
                });
                return NextResponse.json(
                    { error: "Invalid or expired verification code" },
                    { status: 400 },
                );
            }

            updateData.emailVerified = true;
            await redis.del(key);
        } else if (type === "phone") {
            const { verifyOTP } = await import("@/lib/sms");
            const result = await verifyOTP(user.phone || "", code, {
                purpose: "phone_verification",
            });

            if (!result.success) {
                logger.warn("Invalid phone OTP verification attempt", {
                    userId: session.user.id,
                    error: result.error,
                });
                // Don't expose the underlying SMS service error to the client
                return NextResponse.json(
                    { error: "Invalid or expired verification code" },
                    { status: 400 },
                );
            }

            updateData.phoneVerified = true;
        }

        if (Object.keys(updateData).length > 0) {
            await prisma.user.update({
                where: { id: session.user.id },
                data: updateData,
            });

            await createActivityLog({
                userId: session.user.id,
                action: "CONTACT_CHANGED",
                entityType: "User",
                entityId: session.user.id,
                metadata: {
                    field: type, // 'email' or 'phone'
                    newValue: type === "email" ? user.email : user.phone,
                    changedAt: new Date().toISOString(),
                    ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
                },
            });
        }

        return NextResponse.json({
            success: true,
            message: `${type} verified successfully!`,
        });
    } catch (error: unknown) {
        logger.error("Verify contact error", error);
        // Never expose internal error details
        return NextResponse.json(
            { error: "Verification failed. Please try again." },
            { status: 500 },
        );
    }
});
