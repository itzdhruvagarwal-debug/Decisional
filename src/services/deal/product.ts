import prisma from "@/lib/db";
import { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { NotificationService } from "@/services/notification.service";
import { invalidateDealCache, lockAndFetchDealForAction, validateShippingAddress } from "./helpers";

export async function submitShippingAddress(
userId: string,
dealId: string,
address: unknown,
) {
const shippingAddress = validateShippingAddress(address);

const updatedDeal = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
const deal = await lockAndFetchDealForAction(tx, dealId);

if (deal.influencer.userId !== userId) throw AppError.forbidden("Unauthorized");
if (!deal.requiresProduct) throw AppError.badRequest("This deal does not require product shipping");
// Guard: no product actions on terminal or disputed deals
if (["CANCELLED", "COMPLETED", "DISPUTED"].includes(deal.status)) {
  throw AppError.badRequest(`Cannot submit shipping address on a deal in ${deal.status} status`);
}
if (!["ADDRESS_PENDING", "READY_TO_DISPATCH"].includes(deal.productFulfillmentStatus)) {
throw AppError.badRequest("Shipping address cannot be changed after dispatch");
}

    const updated = await tx.deal.update({
      where: { id: dealId },
      data: {
        shippingAddress: {
          ...(shippingAddress as Record<string, unknown>),
          submittedAt: new Date().toISOString(),
        },
        productFulfillmentStatus: "READY_TO_DISPATCH",
      },
    });

if (deal.brand?.userId) {
await NotificationService.createNotification({
userId: deal.brand.userId,
type: "deal_update",
title: "Shipping address received",
message: `${deal.influencer.displayName || "Influencer"} added a shipping address for "${deal.campaign.title}".`,
data: { link: `/dashboard/deals/${dealId}` },
}, tx);
}

return updated;
});

await invalidateDealCache(dealId);
return updatedDeal;
}


export async function confirmProductDispatch(
userId: string,
dealId: string,
data: { trackingNumber: string; carrier?: string },
) {
const trackingNumber = data.trackingNumber.trim();
const carrier = data.carrier?.trim();
if (!trackingNumber || trackingNumber.length > 120) {
throw AppError.badRequest("Tracking number is required");
}

const updatedDeal = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
const deal = await lockAndFetchDealForAction(tx, dealId);

if (deal.brand?.userId !== userId) throw AppError.forbidden("Unauthorized");
if (!deal.requiresProduct) throw AppError.badRequest("This deal does not require product shipping");
// Guard: dispatch only permitted when deal is active and payment held
if (["CANCELLED", "COMPLETED", "DISPUTED", "PENDING_SIGNATURE", "PAYMENT_PENDING"].includes(deal.status)) {
  throw AppError.badRequest(`Cannot dispatch product on a deal in ${deal.status} status`);
}
if (deal.productFulfillmentStatus !== "READY_TO_DISPATCH" || !deal.shippingAddress) {
throw AppError.badRequest("Influencer shipping address is required before dispatch");
}

const updated = await tx.deal.update({
where: { id: dealId },
data: {
dispatchTrackingNumber: trackingNumber,
dispatchCarrier: carrier || null,
shippingAwbCode: trackingNumber,
shippingCourierName: carrier || null,
shippingStatus: "DISPATCHED",
dispatchedAt: new Date(),
productFulfillmentStatus: "DISPATCHED",
},
});

await NotificationService.createNotification({
userId: deal.influencer.userId,
type: "deal_update",
title: "Product dispatched",
message: `${deal.brand?.companyName || "Brand"} dispatched the product for "${deal.campaign.title}". Tracking: ${trackingNumber} (${carrier || "Carrier"}).`,
data: { link: `/dashboard/deals/${dealId}` },
}, tx);

return updated;
});

await invalidateDealCache(dealId);
return updatedDeal;
}


export async function createShiprocketShipment(
  userId: string,
  dealId: string,
  options?: {
    pickupLocation?: string | undefined;
    length?: number | undefined;
    breadth?: number | undefined;
    height?: number | undefined;
    weight?: number | undefined;
  },
) {
  // Step 1: Pre-fetch and validate without holding a long database lock
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: {
      brand: { select: { id: true, userId: true, companyName: true } },
      influencer: {
        select: {
          id: true,
          userId: true,
          displayName: true,
          user: { select: { email: true } },
        },
      },
      campaign: { select: { id: true, title: true } },
    },
  });

  if (!deal) throw AppError.notFound("Deal not found");
  if (deal.brand?.userId !== userId) throw AppError.forbidden("Unauthorized: Only the brand can create shipments");
  if (!deal.requiresProduct) throw AppError.badRequest("This deal does not require product shipping");
  if (["CANCELLED", "COMPLETED", "DISPUTED", "PENDING_SIGNATURE", "PAYMENT_PENDING"].includes(deal.status)) {
    throw AppError.badRequest(`Cannot create shipment on a deal in ${deal.status} status`);
  }
  if (deal.productFulfillmentStatus !== "READY_TO_DISPATCH" || !deal.shippingAddress) {
    throw AppError.badRequest("Creator shipping address is required before creating a shipment");
  }

  const rawAddress = deal.shippingAddress as Record<string, unknown>;
  const shippingAddress = {
    fullName: String(rawAddress.fullName || deal.influencer.displayName || "Creator"),
    phone: String(rawAddress.phone || ""),
    line1: String(rawAddress.line1 || ""),
    line2: rawAddress.line2 ? String(rawAddress.line2) : null,
    city: String(rawAddress.city || ""),
    state: String(rawAddress.state || ""),
    pinCode: String(rawAddress.pinCode || ""),
    country: rawAddress.country ? String(rawAddress.country) : "India",
  };

  // Step 2: Call Shiprocket API to create order, assign courier AWB, and fetch label
  const { createCompleteShipment } = await import("@/lib/shiprocket");
  const shipment = await createCompleteShipment({
    dealId: deal.id,
    campaignTitle: deal.campaign.title,
    productName: deal.productName || "Campaign Product Sample",
    productValuePaise: deal.productValue || 10000,
    shippingAddress,
    creatorEmail: deal.influencer.user?.email || undefined,
    pickupLocation: options?.pickupLocation,
    length: options?.length,
    breadth: options?.breadth,
    height: options?.height,
    weight: options?.weight,
  });

  // Step 3: Atomic database transaction to commit the generated shipment
  const updatedDeal = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const lockedDeal = await lockAndFetchDealForAction(tx, dealId);
    if (lockedDeal.productFulfillmentStatus !== "READY_TO_DISPATCH") {
      throw AppError.badRequest("Deal status changed concurrently");
    }

    const updated = await tx.deal.update({
      where: { id: dealId },
      data: {
        productFulfillmentStatus: "DISPATCHED",
        dispatchedAt: new Date(),
        dispatchTrackingNumber: shipment.awbCode,
        dispatchCarrier: shipment.courierName,
        shippingOrderId: shipment.orderId,
        shippingShipmentId: shipment.shipmentId,
        shippingAwbCode: shipment.awbCode,
        shippingCourierName: shipment.courierName,
        shippingLabelUrl: shipment.labelUrl || null,
        shippingManifestUrl: shipment.manifestUrl || null,
        shippingStatus: shipment.initialStatus,
        shippingTrackingHistory: shipment.trackingHistory as unknown as Prisma.InputJsonValue,
      },
    });

    await NotificationService.createNotification({
      userId: deal.influencer.userId,
      type: "deal_update",
      title: "Product dispatched via Shiprocket",
      message: `${deal.brand?.companyName || "Brand"} shipped "${deal.campaign.title}" via ${shipment.courierName}. AWB: ${shipment.awbCode}.`,
      data: { link: `/dashboard/deals/${dealId}` },
    }, tx);

    return updated;
  });

  await invalidateDealCache(dealId);
  return { deal: updatedDeal, shipment };
}


export async function trackDealShipping(userId: string, dealId: string) {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: {
      brand: { select: { id: true, userId: true, companyName: true } },
      influencer: { select: { id: true, userId: true, displayName: true } },
      campaign: { select: { id: true, title: true } },
    },
  });

  if (!deal) throw AppError.notFound("Deal not found");
  const isAuthorized =
    deal.brand?.userId === userId ||
    deal.influencer.userId === userId;

  if (!isAuthorized) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { userType: true } });
    if (user?.userType !== "ADMIN") throw AppError.forbidden("Unauthorized to track shipping for this deal");
  }

  const awbCode = deal.shippingAwbCode || deal.dispatchTrackingNumber;
  if (!awbCode) {
    throw AppError.badRequest("No tracking number or AWB assigned to this deal yet");
  }

  const { trackShipment } = await import("@/lib/shiprocket");
  const tracking = await trackShipment(awbCode, deal.shippingStatus || undefined);

  // If tracking shows DELIVERED, automatically advance product fulfillment
  const isNowDelivered = tracking.currentStatus.toUpperCase().includes("DELIVER");
  const wasNotReceived = deal.productFulfillmentStatus !== "RECEIVED";

  const updatedDeal = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const updateData: Prisma.DealUpdateInput = {
      shippingStatus: tracking.currentStatus,
      shippingTrackingHistory: tracking.scans as unknown as Prisma.InputJsonValue,
    };

    if (isNowDelivered && wasNotReceived) {
      updateData.productFulfillmentStatus = "RECEIVED";
      updateData.productReceivedAt = new Date(tracking.deliveredDate || Date.now());
    }

    const updated = await tx.deal.update({
      where: { id: dealId },
      data: updateData,
    });

    if (isNowDelivered && wasNotReceived) {
      if (deal.brand?.userId) {
        await NotificationService.createNotification({
          userId: deal.brand.userId,
          type: "deal_update",
          title: "Product delivered to creator",
          message: `Shiprocket confirmed delivery of "${deal.productName || "Product"}" to ${deal.influencer.displayName || "Influencer"}.`,
          data: { link: `/dashboard/deals/${dealId}` },
        }, tx);
      }
      await NotificationService.createNotification({
        userId: deal.influencer.userId,
        type: "deal_update",
        title: "Product delivered",
        message: `Your package for "${deal.campaign.title}" has been delivered by ${tracking.courierName || "courier"}.`,
        data: { link: `/dashboard/deals/${dealId}` },
      }, tx);
    }

    return updated;
  });

  await invalidateDealCache(dealId);
  return { deal: updatedDeal, tracking };
}


export async function handleShiprocketWebhook(payload: Record<string, unknown>) {
  const awb = String(payload.awb || payload.awb_code || payload.tracking_number || "").trim();
  const orderId = String(payload.order_id || "").trim();
  const status = String(payload.current_status || payload.status || "").trim().toUpperCase();

  if (!awb && !orderId) {
    throw AppError.badRequest("Webhook payload missing awb and order_id");
  }

  // Find matching deal
  const deal = await prisma.deal.findFirst({
    where: {
      OR: [
        ...(awb ? [{ shippingAwbCode: awb }, { dispatchTrackingNumber: awb }] : []),
        ...(orderId ? [{ shippingOrderId: orderId }] : []),
      ],
    },
    include: {
      brand: { select: { userId: true, companyName: true } },
      influencer: { select: { userId: true, displayName: true } },
      campaign: { select: { title: true } },
    },
  });

  if (!deal) {
    return { matched: false, message: "No deal found matching AWB / Order ID" };
  }

  const isDelivered = status.includes("DELIVER");
  const rawScans = Array.isArray(payload.scans) ? payload.scans : [];

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const updateData: Prisma.DealUpdateInput = {
      shippingStatus: status || deal.shippingStatus,
      ...(rawScans.length > 0 ? { shippingTrackingHistory: rawScans as unknown as Prisma.InputJsonValue } : {}),
    };

    if (isDelivered && deal.productFulfillmentStatus !== "RECEIVED") {
      updateData.productFulfillmentStatus = "RECEIVED";
      updateData.productReceivedAt = new Date();
    }

    await tx.deal.update({
      where: { id: deal.id },
      data: updateData,
    });

    if (isDelivered && deal.productFulfillmentStatus !== "RECEIVED") {
      if (deal.brand?.userId) {
        await NotificationService.createNotification({
          userId: deal.brand.userId,
          type: "deal_update",
          title: "Shiprocket Delivery Confirmed",
          message: `Product for "${deal.campaign.title}" was successfully delivered to creator.`,
          data: { link: `/dashboard/deals/${deal.id}` },
        }, tx);
      }
      await NotificationService.createNotification({
        userId: deal.influencer.userId,
        type: "deal_update",
        title: "Product Delivered",
        message: `Shiprocket courier confirmed package delivery for "${deal.campaign.title}".`,
        data: { link: `/dashboard/deals/${deal.id}` },
      }, tx);
    }
  });

  await invalidateDealCache(deal.id);
  return { matched: true, dealId: deal.id, status };
}


export async function confirmProductReceived(userId: string, dealId: string) {
const updatedDeal = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
const deal = await lockAndFetchDealForAction(tx, dealId);

if (deal.influencer.userId !== userId) throw AppError.forbidden("Unauthorized");
if (!deal.requiresProduct) throw AppError.badRequest("This deal does not require product shipping");
// Guard: receiving not valid on terminal deals
if (["CANCELLED", "COMPLETED", "DISPUTED"].includes(deal.status)) {
  throw AppError.badRequest(`Cannot confirm receipt on a deal in ${deal.status} status`);
}
if (deal.productFulfillmentStatus !== "DISPATCHED") {
throw AppError.badRequest("Product must be dispatched before it can be marked received");
}

const updated = await tx.deal.update({
where: { id: dealId },
data: {
productFulfillmentStatus: "RECEIVED",
productReceivedAt: new Date(),
shippingStatus: "DELIVERED",
},
});

if (deal.brand?.userId) {
await NotificationService.createNotification({
userId: deal.brand.userId,
type: "deal_update",
title: "Product received",
message: `${deal.influencer.displayName || "Influencer"} confirmed product receipt for "${deal.campaign.title}".`,
data: { link: `/dashboard/deals/${dealId}` },
}, tx);
}

return updated;
});

await invalidateDealCache(dealId);
return updatedDeal;
}

