import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { checkDealCancellationEligibility } from "@/lib/action-eligibility";
import { canRoleTransition } from "@/lib/deal-state-machine";
import { DealStatus } from "@prisma/client";

describe("Audit P4 to P9 Confirmed Findings Regression Suite", () => {
  // -------------------------------------------------------------------------
  // P4 REGRESSION: BUG-NUM-01 (Silent Coercion of Creator Rates to Rs 0)
  // -------------------------------------------------------------------------
  describe("P4: BUG-NUM-01 — Creator Rate Coercion", () => {
    it("FAILING REGRESSION: empty string rate input must not coerce to Rs 0", () => {
      // In src/app/api/settings/route.ts:96-101:
      // z.preprocess(Number, z.number().nonnegative().optional())
      // Number("") evaluates to 0!
      const unpatchedRateSchema = z.preprocess(
        (val) => (val === undefined ? undefined : Number(val)),
        z.number().int().nonnegative().optional()
      );

      const parsedEmpty = unpatchedRateSchema.safeParse("");
      expect(parsedEmpty.success).toBe(true);

      // Demonstrates unpatched bug:
      // An empty input coerced to 0 overwrites creator's real commercial rate with 0
      const coercedValue = (parsedEmpty as { data: number }).data;
      expect(
        coercedValue,
        "BUG-NUM-01: Empty string should be treated as undefined or rejected, NOT silently coerced to 0"
      ).not.toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // P5 REGRESSION: P5-LOGIC-03 (State Machine vs Action Eligibility Alignment)
  // -------------------------------------------------------------------------
  describe("P5: P5-LOGIC-03 — Action Eligibility vs State Machine Mismatch", () => {
    it("FAILING REGRESSION: checkDealCancellationEligibility must NOT return true for POSTED status", () => {
      const dealPosted = {
        status: "POSTED" as DealStatus,
        dealType: "PAID",
        cancellationReason: null,
      };

      // State machine strictly prohibits BRAND from cancelling a POSTED deal
      const canStateMachineCancel = canRoleTransition("POSTED", "CANCELLED", "BRAND");
      expect(canStateMachineCancel).toBe(false);

      // In unpatched action-eligibility.ts:
      // checkDealCancellationEligibility checks status !== "COMPLETED" && status !== "CANCELLED",
      // so it returns eligible: true for POSTED deals!
      const eligibility = checkDealCancellationEligibility(dealPosted, "BRAND");

      // Demonstrates unpatched bug P5-LOGIC-03:
      // UI button is ENABLED, but clicking it hits state machine rejection
      expect(
        eligibility.eligible,
        "P5-LOGIC-03: UI must NOT enable Cancel Deal on POSTED deals where state machine rejects transition"
      ).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // P6 REGRESSION: P6-MON-05 / P8-CON-01 (100x Top-Up Currency Multiplier)
  // -------------------------------------------------------------------------
  describe("P6/P8: P6-MON-05 / P8-CON-01 — Top-Up Unit Contract Mismatch", () => {
    it("FAILING REGRESSION: addFundsSchema must parse input in integer paise without 100x magnification", () => {
      // In src/app/api/wallet/add-funds/route.ts:
      // Server defines min: 500, max: 500000 (Rupees) and does parsed.amount * 100.
      // But apiClient.wallet.addFunds sends amountPaise (e.g. 50,000 for Rs 500).
      // 50000 sent to server is multiplied to 5,000,000 paise (Rs 50,000) or rejected if > 500,000.
      const rawClientAmountPaise = 50000; // Rs 500 in paise

      const serverAddFundsSchema = z.object({
        amount: z.number().int().min(500).max(500000), // in Rupees
      });

      const parsed = serverAddFundsSchema.safeParse({ amount: rawClientAmountPaise });
      expect(parsed.success).toBe(true);

      const serverCalculatedPaise = (parsed as { data: { amount: number } }).data.amount * 100;

      // Demonstrates unpatched bug:
      // Sending 50,000 paise results in 5,000,000 paise (100x magnification)
      expect(
        serverCalculatedPaise,
        "P8-CON-01: Server must treat input as integer paise directly, NOT multiply already-in-paise amounts by 100"
      ).toBe(50000);
    });
  });

  // -------------------------------------------------------------------------
  // P7 REGRESSION: P7-SEC-02 (Stored XSS via JSON-LD Script Breakout)
  // -------------------------------------------------------------------------
  describe("P7: P7-SEC-02 — Stored XSS via JSON-LD Script Breakout", () => {
    it("FAILING REGRESSION: JSON-LD serializer must escape closing script tags", () => {
      const maliciousBio = 'Expert Influencer</script><script>alert("XSS")</script>';

      // In unpatched components (CreatorProfileScreen, PublicBrandProfile):
      // <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      const unpatchedJsonLd = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Person",
        description: maliciousBio,
      });

      // Demonstrates unpatched vulnerability P7-SEC-02:
      // Raw </script> in string terminates JSON-LD script tag and executes alert() in browser DOM
      expect(
        unpatchedJsonLd,
        'P7-SEC-02: JSON-LD must escape "</script>" into "\\u003c/script\\u003e" to prevent XSS breakout'
      ).not.toContain("</script>");
    });
  });

  // -------------------------------------------------------------------------
  // P7 REGRESSION: P7-SEC-04 (Client IP Spoofing via X-Forwarded-For)
  // -------------------------------------------------------------------------
  describe("P7: P7-SEC-04 — Client IP Spoofing via X-Forwarded-For", () => {
    it("FAILING REGRESSION: IP extractor must not blindly trust the first element of X-Forwarded-For", () => {
      // In src/lib/api-wrapper.ts:
      // const forwarded = request.headers.get("x-forwarded-for");
      // const clientIp = forwarded?.split(",")[0]?.trim() || "127.0.0.1";
      const spoofedHeader = "198.51.100.1, 203.0.113.195";

      function unpatchedGetClientIp(header: string): string {
        return header.split(",")[0]?.trim() || "127.0.0.1";
      }

      const extractedIp = unpatchedGetClientIp(spoofedHeader);

      // Demonstrates unpatched vulnerability P7-SEC-04:
      // Attackers send "X-Forwarded-For: 1.1.1.1" to spoof any IP and bypass rate limits and bans
      expect(
        extractedIp,
        "P7-SEC-04: Attacker-controlled first element 198.51.100.1 must NOT be trusted over gateway peer IP"
      ).not.toBe("198.51.100.1");
    });
  });

  // -------------------------------------------------------------------------
  // P7 REGRESSION: P7-SEC-05 (Open Redirect via Backslash Bypass)
  // -------------------------------------------------------------------------
  describe("P7: P7-SEC-05 — Open Redirect via Backslash Bypass", () => {
    it("FAILING REGRESSION: resolveSafeCallbackUrl must reject backslash-prefixed URLs", () => {
      // Browsers treat `/\attacker.com` as `//attacker.com` (protocol-relative URL to attacker.com).
      // Naive startsWith("/") allows `/\attacker.com` because first char is `/`!
      const maliciousUrl = "/\\attacker.com";

      function unpatchedResolveSafeCallbackUrl(url: string, fallback: string = "/dashboard"): string {
        if (!url || typeof url !== "string") return fallback;
        if (url.startsWith("/") && !url.startsWith("//")) {
          return url; // BUG: allows `/\attacker.com`!
        }
        return fallback;
      }

      const resolved = unpatchedResolveSafeCallbackUrl(maliciousUrl);

      // Demonstrates unpatched vulnerability P7-SEC-05:
      // Returns `/\attacker.com`, causing browser to redirect to attacker.com
      expect(
        resolved,
        "P7-SEC-05: Protocol-relative backslash bypass /\\attacker.com must fallback to /dashboard"
      ).toBe("/dashboard");
    });
  });
});
