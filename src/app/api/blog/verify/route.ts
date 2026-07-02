import { NextRequest, NextResponse } from "next/server";
import { apiWrapper } from "@/lib/api-wrapper";
import prisma from "@/lib/db";
import { renderResultHtml } from "@/lib/html-template";

export const GET = apiWrapper(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return new NextResponse(
      renderResultHtml(
        "Verification Failed",
        "Verification Failed",
        "Invalid or missing verification token.",
        false,
      ),
      { headers: { "Content-Type": "text/html" } },
    );
  }

  const subscriber = await prisma.blogSubscriber.findUnique({
    where: { unsubscribeToken: token },
  });

  if (!subscriber) {
    return new NextResponse(
      renderResultHtml(
        "Verification Failed",
        "Verification Failed",
        "This verification link is invalid or has expired.",
        false,
      ),
      { headers: { "Content-Type": "text/html" } },
    );
  }

  await prisma.blogSubscriber.update({
    where: { id: subscriber.id },
    data: { verified: true },
  });

  return new NextResponse(
    renderResultHtml(
      "Subscription Confirmed",
      "Subscription Confirmed!",
      "Thank you! Your subscription to the Decisional Blog is verified.",
      true,
    ),
    { headers: { "Content-Type": "text/html" } },
  );
});
