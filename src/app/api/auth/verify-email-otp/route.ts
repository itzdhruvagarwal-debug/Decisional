/**
 * Email OTP API Route — Send & Verify OTP for email verification during registration
 */

import { NextRequest, NextResponse } from "next/server";
import { randomInt, createHash, timingSafeEqual } from "crypto";
import redis from "@/lib/redis";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/communication";
import prisma from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";

const OTP_TTL = 600; // 10 minutes

// ── PUT: Send Email OTP ──
export async function PUT(request: NextRequest) {
    try {
        let body;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const { email, type } = body;

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return NextResponse.json(
                { error: "Valid email address is required" },
                { status: 400 },
            );
        }

        const allowedTypes = ["registration", "email_verification"];
        if (!type || !allowedTypes.includes(type)) {
            return NextResponse.json(
                { error: "Valid type is required" },
                { status: 400 },
            );
        }

        const ip =
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            "unknown";
        const ipRateLimit = await checkRateLimit(ip, "AUTH");
        if (!ipRateLimit.success) {
            return NextResponse.json(
                { error: "Too many OTP requests. Please try again later." },
                { status: 429 },
            );
        }

        // If registration, check if email is already taken
        if (type === "registration") {
            const existing = await prisma.user.findUnique({
                where: { email: email.toLowerCase().trim() },
                select: { id: true },
            });
            if (existing) {
                return NextResponse.json(
                    { error: "This email is already registered. Please sign in instead." },
                    { status: 409 },
                );
            }
        }

        const key = `email-otp:${type}:${email.toLowerCase().trim()}`;

        // Rate limit: Only allow new OTP after 60 seconds
        const ttl = await redis.ttl(key);
        if (ttl > OTP_TTL - 60) {
            const waitTime = ttl - (OTP_TTL - 60);
            return NextResponse.json(
                { error: `Please wait ${waitTime} seconds before requesting a new OTP` },
                { status: 429 },
            );
        }

        // Generate 6-digit OTP
        const otp = randomInt(100000, 999999).toString();
        const otpHash = createHash("sha256").update(otp).digest("hex");

        // Store hashed OTP in Redis
        await redis.setex(
            key,
            OTP_TTL,
            JSON.stringify({
                otp: otpHash,
                attempts: 0,
                createdAt: new Date().toISOString(),
            }),
        );

        // Send OTP via email
        await sendEmail(
            email,
            `${otp} is your Decisional verification code`,
            `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1f2937;">Verify Your Email</h2>
        <p style="color: #666;">Enter this code to verify your email address:</p>
        <div style="background: #f3f4f6; border-radius: 12px; padding: 24px; text-align: center; margin: 20px 0; border: 2px dashed #d1d5db;">
          <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #1f2937; font-family: 'Courier New', monospace;">${otp}</span>
        </div>
        <p style="color: #999; font-size: 13px;">⏰ This code expires in 10 minutes. Do not share it with anyone.</p>
      </div>`,
        );

        if (process.env.NODE_ENV === "development") {
            logger.debug(`[DEV] Email OTP for ${email}: ${otp}`);
        }

        return NextResponse.json({
            success: true,
            message: "OTP sent to your email",
            ...(process.env.NODE_ENV === "development" && { otp }),
        });
    } catch (error) {
        logger.error("Send email OTP error", error);
        return NextResponse.json(
            { error: "Failed to send OTP. Please try again." },
            { status: 500 },
        );
    }
}

// ── POST: Verify Email OTP ──
export async function POST(request: NextRequest) {
    try {
        let body;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const { email, otp, type } = body;

        if (!email || !otp || !type) {
            return NextResponse.json(
                { error: "Email, OTP, and type are required" },
                { status: 400 },
            );
        }

        const allowedTypes = ["registration", "email_verification"];
        if (!allowedTypes.includes(type)) {
            return NextResponse.json(
                { error: "Invalid OTP verification type" },
                { status: 400 },
            );
        }

        const key = `email-otp:${type}:${email.toLowerCase().trim()}`;
        const storedJson = await redis.get(key);

        if (!storedJson) {
            return NextResponse.json(
                { error: "OTP not found or expired. Please request a new OTP." },
                { status: 400 },
            );
        }

        let storedData;
        try {
            storedData = JSON.parse(storedJson);
        } catch {
            await redis.del(key);
            return NextResponse.json(
                { error: "OTP data corrupted. Please request a new OTP." },
                { status: 400 },
            );
        }

        // Check attempts (max 3)
        if (storedData.attempts >= 3) {
            await redis.del(key);
            return NextResponse.json(
                { error: "Too many failed attempts. Please request a new OTP." },
                { status: 429 },
            );
        }

        // Constant-time comparison
        const submittedHash = createHash("sha256").update(otp).digest("hex");
        const storedHash = storedData.otp;
        const storedBuffer = Buffer.from(storedHash, "utf8");
        const submittedBuffer = Buffer.from(submittedHash, "utf8");

        // Magic bypass for E2E tests in dev/test
        const isMagicCode = otp === "123456" && process.env.NODE_ENV !== "production";

        let isMatch = false;
        if (storedBuffer.length === submittedBuffer.length) {
            isMatch = timingSafeEqual(storedBuffer, submittedBuffer) || isMagicCode;
        } else if (isMagicCode) {
            isMatch = true;
        }

        if (!isMatch) {
            storedData.attempts++;
            const ttl = await redis.ttl(key);
            if (ttl > 0) {
                await redis.setex(key, ttl, JSON.stringify(storedData));
            }
            return NextResponse.json(
                { error: "Invalid OTP. Please try again." },
                { status: 400 },
            );
        }

        // OTP verified — clean up
        await redis.del(key);
        await redis.setex(
            `email-otp-verified:${email.toLowerCase().trim()}`,
            15 * 60,
            "1",
        );

        return NextResponse.json({
            success: true,
            verified: true,
            message: "Email verified successfully!",
        });
    } catch (error) {
        logger.error("Email OTP verification error", error);
        return NextResponse.json(
            { error: "Verification failed. Please try again." },
            { status: 500 },
        );
    }
}
