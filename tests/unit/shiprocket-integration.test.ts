import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isShiprocketConfigured,
  createCompleteShipment,
  trackShipment,
  verifyWebhookSecret,
} from "@/lib/shiprocket";

describe("Shiprocket Logistics API Integration", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Configuration detection", () => {
    it("reports not configured when email or password is missing", () => {
      delete process.env.SHIPROCKET_EMAIL;
      delete process.env.SHIPROCKET_PASSWORD;
      expect(isShiprocketConfigured()).toBe(false);
    });

    it("reports configured when both email and password are provided", () => {
      process.env.SHIPROCKET_EMAIL = "shipping@reachout.in";
      process.env.SHIPROCKET_PASSWORD = "supersecretpassword";
      expect(isShiprocketConfigured()).toBe(true);
    });
  });

  describe("Shipment Creation (Mock Mode for Dev & Testing)", () => {
    it("successfully creates a complete shipment with AWB and label in mock mode", async () => {
      delete process.env.SHIPROCKET_EMAIL;
      delete process.env.SHIPROCKET_PASSWORD;

      const sampleAddress = {
        fullName: "Aarav Sharma",
        phone: "9876543210",
        line1: "Flat 402, Sunshine Heights, Andheri West",
        city: "Mumbai",
        state: "Maharashtra",
        pinCode: "400053",
        country: "India",
      };

      const result = await createCompleteShipment({
        dealId: "cuid_deal_test_12345",
        campaignTitle: "Summer Skin Care Product Seeding",
        productName: "Glow Serum 50ml",
        productValuePaise: 250000, // Rs. 2,500
        shippingAddress: sampleAddress,
        creatorEmail: "aarav@influencer.com",
        pickupLocation: "Primary Warehouse",
        length: 15,
        breadth: 12,
        height: 8,
        weight: 0.45,
      });

      expect(result).toBeDefined();
      expect(result.orderId).toContain("MOCK-ORD");
      expect(result.shipmentId).toContain("MOCK-SHIP");
      expect(result.awbCode).toMatch(/^SRDEL\d+/);
      expect(result.courierName).toContain("Delhivery");
      expect(result.labelUrl).toContain(".pdf");
      expect(result.initialStatus).toBe("PICKUP_SCHEDULED");
      expect(result.trackingHistory).toHaveLength(1);
      expect(result.trackingHistory[0]!.status).toBe("PICKUP_SCHEDULED");
    });
  });

  describe("Live Tracking Sync", () => {
    it("returns tracking timeline and current status for simulated shipments", async () => {
      delete process.env.SHIPROCKET_EMAIL;
      delete process.env.SHIPROCKET_PASSWORD;

      const tracking = await trackShipment("SRDEL9988776655", "DISPATCHED");

      expect(tracking.awbCode).toBe("SRDEL9988776655");
      expect(tracking.currentStatus).toBe("OUT_FOR_DELIVERY");
      expect(tracking.scans.length).toBeGreaterThanOrEqual(3);
      expect(tracking.scans[0]!.status).toBe("PICKUP_SCHEDULED");
    });

    it("returns DELIVERED status when stored status is DELIVERED", async () => {
      delete process.env.SHIPROCKET_EMAIL;
      delete process.env.SHIPROCKET_PASSWORD;

      const tracking = await trackShipment("SRDEL9988776655", "DELIVERED");

      expect(tracking.currentStatus).toBe("DELIVERED");
      expect(tracking.deliveredDate).not.toBeNull();
    });
  });

  describe("Webhook Security & Verification", () => {
    it("accepts any header when secret is not configured", () => {
      delete process.env.SHIPROCKET_WEBHOOK_SECRET;
      expect(verifyWebhookSecret(null)).toBe(true);
      expect(verifyWebhookSecret("any_token")).toBe(true);
    });

    it("strictly verifies matching secret when configured", () => {
      process.env.SHIPROCKET_WEBHOOK_SECRET = "shiprocket_secret_token_xyz";

      expect(verifyWebhookSecret("shiprocket_secret_token_xyz")).toBe(true);
      expect(verifyWebhookSecret("Bearer shiprocket_secret_token_xyz")).toBe(true);
      expect(verifyWebhookSecret("wrong_secret")).toBe(false);
      expect(verifyWebhookSecret(null)).toBe(false);
    });
  });
});
