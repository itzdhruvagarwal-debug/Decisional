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
        "Unsubscribe Failed",
        "Unsubscribe Failed",
        "Invalid or missing unsubscribe token.",
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
        "Unsubscribe Failed",
        "Unsubscribe Failed",
        "This unsubscribe link is invalid or has expired.",
        false,
      ),
      { headers: { "Content-Type": "text/html" } },
    );
  }

  await prisma.blogSubscriber.delete({
    where: { id: subscriber.id },
  });

  return new NextResponse(
    renderResultHtml(
      "Unsubscribed Successfully",
      "Unsubscribed",
      "You have been successfully unsubscribed from the Decisional Blog.",
      true,
    ),
    { headers: { "Content-Type": "text/html" } },
  );
});
