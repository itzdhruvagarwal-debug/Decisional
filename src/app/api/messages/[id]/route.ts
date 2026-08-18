import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { apiWrapper } from "@/lib/api-wrapper";
import prisma from "@/lib/db";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { calculateTotalAmount } from "@/lib/razorpay";
import { NotificationService } from "@/services/notification.service";
import { createActivityLog } from "@/lib/audit";

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
    include: {
      sender: {
        include: {
          brandProfile: true,
          influencerProfile: true,
        },
      },
      receiver: {
        include: {
          brandProfile: true,
          influencerProfile: true,
        },
      },
    },
  });

  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  // Ensure the receiver of the message is the one accepting/declining the offer
  if (message.receiverId !== session.user.id) {
    return NextResponse.json(
      { error: "Only the offer receiver can accept or decline it" },
      { status: 403 }
    );
  }

  if (message.messageType !== "OFFER") {
    return NextResponse.json({ error: "Only offers can be updated" }, { status: 400 });
  }

  const currentMetadata = (message.metadata as Prisma.JsonObject) || {};
  if (currentMetadata.status === "ACCEPTED" || currentMetadata.status === "DECLINED") {
    return NextResponse.json(
      { error: `Offer has already been ${(currentMetadata.status as string).toLowerCase()}` },
      { status: 400 }
    );
  }

  // Handle DECLINED
  if (status === "DECLINED") {
    const updatedMetadata: Prisma.JsonObject = {
      ...currentMetadata,
      status: "DECLINED",
      declinedAt: new Date().toISOString(),
      declinedByUserId: session.user.id,
    };

    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: { metadata: updatedMetadata },
    });

    await NotificationService.createNotification({
      userId: message.senderId,
      title: "Proposal Declined",
      message: `Your custom offer "${String(currentMetadata.title || "Custom Deal")}" was declined.`,
      type: "MESSAGE",
    });

    return NextResponse.json({
      success: true,
      message: updatedMessage,
    });
  }

  // Handle ACCEPTED -> Full Escrow & Deal Creation
  const offerAmount = Number(currentMetadata.amount || 0);
  if (offerAmount <= 0) {
    return NextResponse.json(
      { error: "Invalid offer amount. Offer cannot be accepted." },
      { status: 400 }
    );
  }

  const offerTitle = String(currentMetadata.title || "Direct Collaboration Offer");
  const offerDescription = String(
    currentMetadata.description || "Custom deal agreement created from chat."
  );
  const offerDeliverables = String(
    currentMetadata.deliverables || "Deliverables as agreed in conversation."
  );

  // Parse deadlines safely
  const now = new Date();
  const rawContentDeadline = currentMetadata.contentDeadline
    ? new Date(String(currentMetadata.contentDeadline))
    : null;
  const rawPostingDeadline = currentMetadata.postingDeadline
    ? new Date(String(currentMetadata.postingDeadline))
    : null;

  const contentDeadline =
    rawContentDeadline && !isNaN(rawContentDeadline.getTime()) && rawContentDeadline > now
      ? rawContentDeadline
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // default 7 days

  const postingDeadline =
    rawPostingDeadline &&
    !isNaN(rawPostingDeadline.getTime()) &&
    rawPostingDeadline > contentDeadline
      ? rawPostingDeadline
      : new Date(contentDeadline.getTime() + 7 * 24 * 60 * 60 * 1000); // default content + 7 days

  // Identify Brand and Influencer profiles
  let brandProfile = message.sender.brandProfile || message.receiver.brandProfile;
  let influencerProfile =
    message.sender.influencerProfile || message.receiver.influencerProfile;
  let brandUserId = message.sender.brandProfile
    ? message.senderId
    : message.receiver.brandProfile
    ? message.receiverId
    : null;
  let influencerUserId = message.sender.influencerProfile
    ? message.senderId
    : message.receiver.influencerProfile
    ? message.receiverId
    : null;

  // Fallback: If roles aren't clearly separated, look up profiles directly
  if (!brandProfile || !influencerProfile || !brandUserId || !influencerUserId) {
    const brandUser =
      message.sender.userType === "BRAND"
        ? message.sender
        : message.receiver.userType === "BRAND"
        ? message.receiver
        : null;
    const influencerUser =
      message.sender.userType === "INFLUENCER"
        ? message.sender
        : message.receiver.userType === "INFLUENCER"
        ? message.receiver
        : null;

    if (brandUser && influencerUser) {
      brandUserId = brandUser.id;
      influencerUserId = influencerUser.id;
      brandProfile =
        brandUser.brandProfile ||
        (await prisma.brandProfile.findUnique({ where: { userId: brandUser.id } }));
      influencerProfile =
        influencerUser.influencerProfile ||
        (await prisma.influencerProfile.findUnique({ where: { userId: influencerUser.id } }));
    }
  }

  if (!brandProfile || !influencerProfile || !brandUserId || !influencerUserId) {
    return NextResponse.json(
      {
        error:
          "Both a registered Brand profile and Influencer profile are required to form an escrow deal.",
      },
      { status: 400 }
    );
  }

  const paymentAmounts = calculateTotalAmount(offerAmount);
  const totalAmountToLock = paymentAmounts.totalAmount;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Check Brand Wallet
      const brandWallet = await tx.wallet.findUnique({
        where: { userId: brandUserId! },
      });

      if (!brandWallet || brandWallet.balance < totalAmountToLock) {
        const availableInr = brandWallet ? (brandWallet.balance / 100).toLocaleString("en-IN") : "0";
        const requiredInr = (totalAmountToLock / 100).toLocaleString("en-IN");
        throw new Error(
          `Insufficient brand wallet balance (Available: ₹${availableInr}, Required: ₹${requiredInr}). Please top up your wallet to accept this offer.`
        );
      }

      // 2. Lock Funds from Brand Wallet into Escrow
      await tx.wallet.update({
        where: { id: brandWallet.id },
        data: {
          balance: { decrement: totalAmountToLock },
          pendingBalance: { increment: totalAmountToLock },
          totalSpent: { increment: totalAmountToLock },
        },
      });

      // 3. Create Direct Invite Campaign container
      const campaign = await tx.campaign.create({
        data: {
          brandId: brandProfile!.id,
          title: offerTitle,
          description: offerDescription,
          requirements: offerDeliverables,
          deliverables: [
            {
              type: "CUSTOM",
              count: 1,
              specs: offerDeliverables,
            },
          ],
          totalBudget: offerAmount,
          perInfluencerBudget: offerAmount,
          fundedAmount: totalAmountToLock,
          reservedAmount: totalAmountToLock,
          reservedTotalAmount: totalAmountToLock,
          contentDeadline,
          postingDeadline,
          status: "ACTIVE",
          isDirectInvite: true,
          selectedInfluencers: 1,
          maxInfluencers: 1,
        },
      });

      // 4. Create Active Deal Record
      const deal = await tx.deal.create({
        data: {
          campaignId: campaign.id,
          influencerId: influencerProfile!.id,
          brandId: brandProfile!.id,
          amount: offerAmount,
          platformFee: paymentAmounts.platformFee,
          gatewayFee: paymentAmounts.gatewayFee,
          totalAmount: totalAmountToLock,
          influencerPayout: paymentAmounts.influencerReceives,
          reservedFromWallet: true,
          status: "ACTIVE",
          submissionDeadline: contentDeadline,
          postingDeadline,
          startedAt: new Date(),
          contractTerms: {
            title: offerTitle,
            scope: offerDescription,
            deliverables: offerDeliverables,
            dealAmount: offerAmount,
            platformFee: paymentAmounts.platformFee,
            gatewayFee: paymentAmounts.gatewayFee,
            totalAmount: totalAmountToLock,
            influencerPayout: paymentAmounts.influencerReceives,
            source: "in_chat_offer",
          } as unknown as Prisma.InputJsonValue,
        },
      });

      // Update contract terms with dealId
      await tx.deal.update({
        where: { id: deal.id },
        data: {
          contractTerms: {
            dealId: deal.id,
            title: offerTitle,
            scope: offerDescription,
            deliverables: offerDeliverables,
            dealAmount: offerAmount,
            platformFee: paymentAmounts.platformFee,
            gatewayFee: paymentAmounts.gatewayFee,
            totalAmount: totalAmountToLock,
            influencerPayout: paymentAmounts.influencerReceives,
            source: "in_chat_offer",
          } as unknown as Prisma.InputJsonValue,
        },
      });

      // 5. Create Transaction Record
      await tx.transaction.create({
        data: {
          walletId: brandWallet.id,
          dealId: deal.id,
          type: "DEBIT",
          amount: totalAmountToLock,
          status: "COMPLETED",
          description: `Escrow hold for in-chat deal: ${offerTitle}`,
          metadata: {
            source: "in_chat_offer_acceptance",
            dealId: deal.id,
            dealAmount: offerAmount,
            platformFee: paymentAmounts.platformFee,
            gatewayFee: paymentAmounts.gatewayFee,
          },
        },
      });

      // 6. Update Message Record
      const updatedMetadata: Prisma.JsonObject = {
        ...currentMetadata,
        status: "ACCEPTED",
        dealId: deal.id,
        acceptedAt: new Date().toISOString(),
        acceptedByUserId: session.user.id,
      };

      const updatedMessage = await tx.message.update({
        where: { id: messageId },
        data: {
          dealId: deal.id,
          metadata: updatedMetadata,
        },
      });

      // 7. Update Brand active stats
      await tx.brandProfile.update({
        where: { id: brandProfile!.id },
        data: {
          totalCampaigns: { increment: 1 },
          activeCampaigns: { increment: 1 },
          totalSpent: { increment: totalAmountToLock },
        },
      });

      // 8. Update Influencer active stats
      await tx.influencerProfile.update({
        where: { id: influencerProfile!.id },
        data: {
          totalDeals: { increment: 1 },
        },
      });

      return { deal, message: updatedMessage };
    });

    // Send Real-Time Notifications
    await NotificationService.createNotifications([
      {
        userId: message.senderId,
        title: "🎉 Custom Offer Accepted!",
        message: `Your custom offer "${offerTitle}" (₹${(offerAmount / 100).toLocaleString(
          "en-IN"
        )}) has been accepted! Deal #${result.deal.id.slice(-6)} is now active.`,
        type: "DEAL_UPDATE",
        data: { dealId: result.deal.id },
      },
      {
        userId: message.receiverId,
        title: "🤝 Deal Activated!",
        message: `You accepted "${offerTitle}". Escrow funds of ₹${(
          totalAmountToLock / 100
        ).toLocaleString("en-IN")} are locked securely.`,
        type: "DEAL_UPDATE",
        data: { dealId: result.deal.id },
      },
    ]);

    await createActivityLog({
      userId: session.user.id,
      action: "IN_CHAT_OFFER_ACCEPTED",
      entityType: "Deal",
      entityId: result.deal.id,
      metadata: {
        messageId,
        amount: offerAmount,
        totalAmount: totalAmountToLock,
        title: offerTitle,
      },
    });

    return NextResponse.json({
      success: true,
      dealId: result.deal.id,
      message: result.message,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to accept offer and create deal";
    return NextResponse.json({ error: errorMsg }, { status: 400 });
  }
});
