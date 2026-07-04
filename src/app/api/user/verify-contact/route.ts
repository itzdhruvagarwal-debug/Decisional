import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { createActivityLog } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { createHash } from "node:crypto";
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

async function verifyEmailCode(userId: string, code: string): Promise<boolean> {
    const submittedHash = createHash("sha256").update(code).digest("hex");
    const key = `email-contact-otp:${userId}`;
    const storedHash = await redis.get(key) || "";

    const { timingSafeEqual } = await import("node:crypto");

    let isValidCode = false;
    if (storedHash.length > 0) {
        try {
            const storedBuffer = Buffer.from(storedHash, "utf8");
            const submittedBuffer = Buffer.from(submittedHash, "utf8");
            if (storedBuffer.length === submittedBuffer.length) {
                isValidCode = timingSafeEqual(storedBuffer, submittedBuffer);
            }
        } catch {
            isValidCode = false;
        }
    }

    if (isValidCode) {
        await redis.del(key);
    }
    return isValidCode;
}

async function verifyPhoneCode(phone: string, code: string, userId: string): Promise<boolean> {
    const { verifyOTP } = await import("@/lib/sms");
    const result = await verifyOTP(phone, code, {
        purpose: "phone_verification",
    });

    if (!result.success) {
        logger.warn("Invalid phone OTP verification attempt", {
            userId,
            error: result.error,
        });
    }
    return result.success;
}

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
        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        let isVerified = false;
        if (type === "email") {
            isVerified = await verifyEmailCode(session.user.id, code);
        } else if (type === "phone") {
            isVerified = await verifyPhoneCode(user.phone || "", code, session.user.id);
        }

        if (!isVerified) {
            if (type === "email") {
                logger.warn("Invalid or expired email OTP verification attempt", {
                    userId: session.user.id,
                });
            }
            return NextResponse.json(
                { error: "Invalid or expired verification code" },
                { status: 400 },
            );
        }

        const updateData = type === "email" ? { emailVerified: true } : { phoneVerified: true };

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
