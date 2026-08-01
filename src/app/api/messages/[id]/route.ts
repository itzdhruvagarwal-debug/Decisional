import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { apiWrapper } from "@/lib/api-wrapper";
import prisma from "@/lib/db";
import { AppError } from "@/lib/errors";
import { z } from "zod";

const updateMessageSchema = z.object({
  status: z.enum(["ACCEPTED", "DECLINED"]),
});

export const PATCH = apiWrapper(async (req, { params }) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const messageId = (await params).id as string;
  if (!messageId) {
    return NextResponse.json({ error: "Message ID is required" }, { status: 400 });
  }

  const body = await req.json();
  const { status } = updateMessageSchema.parse(body);

  const message = await prisma.message.findUnique({
    where: { id: messageId },
  });

  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  // Ensure the receiver of the message is the one accepting/declining the offer
  if (message.receiverId !== session.user.id) {
    return NextResponse.json({ error: "Only the offer receiver can accept or decline it" }, { status: 403 });
  }

  if (message.messageType !== "OFFER") {
    return NextResponse.json({ error: "Only offers can be updated" }, { status: 400 });
  }

  const currentMetadata = (message.metadata as Record<string, any>) || {};
  const updatedMetadata = {
    ...currentMetadata,
    status,
    updatedAt: new Date().toISOString(),
  };

  const updatedMessage = await prisma.message.update({
    where: { id: messageId },
    data: {
      metadata: updatedMetadata as any,
    },
  });

  return NextResponse.json({
    success: true,
    message: updatedMessage,
  });
});
