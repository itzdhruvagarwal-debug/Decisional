import { NextRequest, NextResponse } from "next/server";
import { apiWrapper } from "@/lib/api-wrapper";
import { auth } from "@/lib/auth";
import { requireActiveAdmin } from "@/lib/admin-auth";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";
import { sendBlogNewsletterEmail } from "@/lib/email";

export const maxDuration = 300; // 5 minutes for sending newsletters to large subscriber lists

async function _handler_POST(request: NextRequest) {
  const session = await auth();
  await requireActiveAdmin(session?.user);

  const body = await request.json();
  const { subject, content } = body;

  if (!subject || !content) {
    return NextResponse.json(
      { success: false, message: "Subject and content are required" },
      { status: 400 }
    );
  }

  // Get all verified subscribers
  const subscribers = await prisma.blogSubscriber.findMany({
    where: { verified: true },
    select: { email: true, unsubscribeToken: true },
  });

  if (subscribers.length === 0) {
    return NextResponse.json({
      success: true,
      message: "No verified subscribers to send to",
      sentCount: 0,
    });
  }

  let sentCount = 0;
  let failedCount = 0;

  for (const subscriber of subscribers) {
    try {
      await sendBlogNewsletterEmail(subscriber.email, subject, content, subscriber.unsubscribeToken);
      sentCount++;
    } catch (error) {
      failedCount++;
      logger.error("Failed to send newsletter email", {
        email: subscriber.email,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info("Newsletter sent", {
    subject,
    sentCount,
    failedCount,
    totalSubscribers: subscribers.length,
  });

  return NextResponse.json({
    success: true,
    message: `Newsletter sent to ${sentCount} subscribers`,
    sentCount,
    failedCount,
    totalSubscribers: subscribers.length,
  });
}

export const POST = apiWrapper(_handler_POST);
