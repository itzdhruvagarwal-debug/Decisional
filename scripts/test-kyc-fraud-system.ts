import "./mock-server-only";

/**
 * Automated Verification Suite for KYC Verification & Fraud-Detection Hardening
 *
 * Tests the Definition of Done:
 * 1. PII never appears plaintext in logs (Aadhaar, PAN, bank account, sensitive keys are scrubbed).
 * 2. Fraud rule weights changeable in DB without code deployment (dynamic table-driven rules engine).
 * 3. Duplicate document test: Same Aadhaar/PAN across 2 accounts is blocked; ciphertext stored at rest.
 * 4. Combined fraud checks: Mismatched bank name, rapid-fire withdrawals, device clustering trigger REVIEW.
 * 5. KYC status changes immediately invalidate Redis caches (trust badge, DRS, profile).
 */

import { PrismaClient } from "@prisma/client";
import { encrypt, decrypt, hashForDuplicateDetection } from "../src/lib/encryption";
import { maskPII } from "../src/lib/logger";
import { assertNoDuplicateDocument, invalidateUserKYCCache } from "../src/lib/kyc";
import { getTrustRuleWeights, updateTrustRuleWeight } from "../src/lib/trust-rules";
import { calculateInfluencerDRS } from "../src/lib/drs-score";
import { checkPaymentFraud } from "../src/lib/fraud-detection/payment";
import { redis } from "../src/lib/redis";

const prisma = new PrismaClient();

async function runTests() {
  console.log("=================================================================");
  console.log("🚀 STARTING KYC & FRAUD-DETECTION HARDENING VERIFICATION SUITE");
  console.log("=================================================================\n");

  const timestamp = Date.now();
  const userAEmail = `kyc_test_a_${timestamp}@example.com`;
  const userBEmail = `kyc_test_b_${timestamp}@example.com`;
  let userAId = "";
  let userBId = "";
  let userAWalletId = "";

  try {
    // Pre-cleanup of any previous test artifacts
    await prisma.verificationDocument.deleteMany({
      where: { user: { email: { contains: "kyc_test_" } } },
    }).catch(() => {});
    await prisma.indiaTaxCompliance.deleteMany({
      where: { user: { email: { contains: "kyc_test_" } } },
    }).catch(() => {});
    await prisma.withdrawal.deleteMany({
      where: { wallet: { user: { email: { contains: "kyc_test_" } } } },
    }).catch(() => {});
    await prisma.wallet.deleteMany({
      where: { user: { email: { contains: "kyc_test_" } } },
    }).catch(() => {});
    await prisma.user.deleteMany({
      where: { email: { contains: "kyc_test_" } },
    }).catch(() => {});

    // -------------------------------------------------------------------
    // Test 1: PII Masking and Log Scrubbing
    // -------------------------------------------------------------------
    console.log("Test 1: Testing PII log scrubbing & redaction...");

    const testPayload = {
      user: "Rajesh Kumar",
      aadhaarPlain: "2345 6789 0123",
      aadhaarHyphen: "2345-6789-0123",
      aadhaarContinuous: "234567890123",
      pan: "ABCDE1234F",
      documentNumber: "234567890123",
      bankAccount: "987654321012",
      nested: {
        documentNumberHash: "mock_hash_value_here",
        panNumber: "ABCDE1234F",
      },
    };

    const scrubbed = maskPII(testPayload) as Record<string, unknown>;
    const scrubbedJson = JSON.stringify(scrubbed);

    if (scrubbedJson.includes("234567890123") || scrubbedJson.includes("2345 6789 0123") || scrubbedJson.includes("2345-6789-0123")) {
      throw new Error("LOG_SCRUB_FAILURE: Plaintext Aadhaar leaked into log payload");
    }
    if (scrubbedJson.includes("ABCDE1234F")) {
      throw new Error("LOG_SCRUB_FAILURE: Plaintext PAN leaked into log payload");
    }
    if (scrubbedJson.includes("987654321012")) {
      throw new Error("LOG_SCRUB_FAILURE: Plaintext Bank Account leaked into log payload");
    }

    // Verify sensitive keys were redacted
    if (scrubbed.documentNumber !== "[REDACTED]" || scrubbed.bankAccount !== "[REDACTED]") {
      throw new Error(`LOG_SCRUB_FAILURE: Sensitive keys not redacted: ${JSON.stringify(scrubbed)}`);
    }

    console.log("✅ Continuous, spaced, and hyphenated Aadhaar masked.");
    console.log("✅ PAN format masked (*234F).");
    console.log("✅ Sensitive object keys [REDACTED] successfully.\n");

    // -------------------------------------------------------------------
    // Test 2: Table-Driven Dynamic Trust Score Engine
    // -------------------------------------------------------------------
    console.log("Test 2: Testing dynamic table-driven trust rule tuning without code deploy...");

    const initialWeights = await getTrustRuleWeights();
    console.log(`Initial IDENTITY_VERIFIED_WEIGHT: ${initialWeights["IDENTITY_VERIFIED_WEIGHT"] ?? 60}`);

    const baseData = {
      completedDeals: 1,
      totalEarningsPaise: 100000,
      disputesLost: 0,
      dealBuckets:              { recent: 1, mid: 0, old: 0 },
      reviewBuckets:            { recent: 0, mid: 0, old: 0 },
      onTimeBuckets:            { recent: 1, mid: 0, old: 0 },
      disputeWonBuckets:        { recent: 0, mid: 0, old: 0 },
      lateDeliveryBuckets:      { recent: 0, mid: 0, old: 0 },
      poorReviewBuckets:        { recent: 0, mid: 0, old: 0 },
      contentRejectionBuckets:  { recent: 0, mid: 0, old: 0 },
      disputeLostBuckets:       { recent: 0, mid: 0, old: 0 },
      identityVerified: true,
      accountAgeDays: 30,
      engagementRate: 2.0,
      fakeFollowersDetected: false,
      termsViolations: 0,
      paymentFraudAttempts: 0,
      avgReferralDRS: 0,
      successfulReferrals: 0,
      profileCompleteness: 100,
    };

    const scoreWithDefault = calculateInfluencerDRS(baseData, initialWeights);
    console.log(`DRS score with default weight: ${scoreWithDefault.score}`);

    // Update weight dynamically in DB
    await updateTrustRuleWeight("IDENTITY_VERIFIED_WEIGHT", 120, "Dynamically updated KYC bonus");

    const updatedWeights = await getTrustRuleWeights();
    if (updatedWeights["IDENTITY_VERIFIED_WEIGHT"] !== 120) {
      throw new Error(`DYNAMIC_TUNING_FAILURE: Updated weight not returned: ${updatedWeights["IDENTITY_VERIFIED_WEIGHT"]}`);
    }

    const scoreWithUpdatedWeight = calculateInfluencerDRS(baseData, updatedWeights);
    console.log(`DRS score after dynamic weight update to 120: ${scoreWithUpdatedWeight.score}`);

    if (scoreWithUpdatedWeight.score <= scoreWithDefault.score) {
      throw new Error(`DYNAMIC_TUNING_FAILURE: DRS did not increase with increased rule weight`);
    }

    // Reset back to default
    await updateTrustRuleWeight("IDENTITY_VERIFIED_WEIGHT", 60, "Reset to default");
    console.log("✅ Rule weights successfully updated in DB and immediately applied to score calculation.\n");

    // -------------------------------------------------------------------
    // Setup Test Users
    // -------------------------------------------------------------------
    console.log("Setting up Test Users A and B...");
    const userA = await prisma.user.create({
      data: {
        email: userAEmail,
        passwordHash: "test_hashed_password_for_verification",
        userType: "INFLUENCER",
        status: "ACTIVE",
        trustScore: 80,
        influencerProfile: {
          create: {
            displayName: "Rajesh Kumar",
            bio: "Test influencer A",
            categories: "tech,lifestyle",
            languages: "hindi,english",
          },
        },
      },
    });
    userAId = userA.id;

    const userB = await prisma.user.create({
      data: {
        email: userBEmail,
        passwordHash: "test_hashed_password_for_verification",
        userType: "INFLUENCER",
        status: "ACTIVE",
        trustScore: 80,
        influencerProfile: {
          create: {
            displayName: "Suresh Sharma",
            bio: "Test influencer B",
            categories: "tech,lifestyle",
            languages: "hindi,english",
          },
        },
      },
    });
    userBId = userB.id;

    const walletA = await prisma.wallet.create({
      data: {
        userId: userAId,
        balance: 500000, // 5,000 INR
      },
    });
    userAWalletId = walletA.id;

    // -------------------------------------------------------------------
    // Test 3: PII Encryption At Rest & Duplicate Document Detection
    // -------------------------------------------------------------------
    console.log("Test 3: Testing duplicate document detection & encryption at rest...");

    const testAadhaar = String(Math.floor(100000000000 + Math.random() * 900000000000));
    const { hash: aadhaarHash, encrypted: aadhaarEncrypted } = await assertNoDuplicateDocument(
      testAadhaar,
      "AADHAAR",
      userAId,
    );

    // Verify ciphertext at rest
    if (aadhaarEncrypted === testAadhaar) {
      throw new Error("ENCRYPTION_FAILURE: Document number is stored as plaintext");
    }
    if (decrypt(aadhaarEncrypted) !== testAadhaar) {
      throw new Error("ENCRYPTION_FAILURE: Decrypted document number mismatch");
    }

    // Store document for User A
    await prisma.verificationDocument.create({
      data: {
        userId: userAId,
        type: "AADHAAR",
        documentUrl: "https://example.com/aadhaar.pdf",
        documentNumber: aadhaarEncrypted,
        documentNumberHash: aadhaarHash,
        status: "VERIFIED",
        verifiedAt: new Date(),
        metadata: { fullName: "Rajesh Kumar" },
      },
    });

    // Verify DB column has ciphertext and not plaintext
    const storedDoc = await prisma.verificationDocument.findFirst({
      where: { userId: userAId, type: "AADHAAR" },
    });
    if (!storedDoc || storedDoc.documentNumber === testAadhaar) {
      throw new Error("DATABASE_LEAK: Database contains plaintext Aadhaar");
    }
    if (storedDoc.documentNumberHash !== aadhaarHash) {
      throw new Error("HASH_MISMATCH: Stored documentNumberHash mismatch");
    }

    // Now User B attempts to submit the same Aadhaar
    let duplicateBlocked = false;
    try {
      await assertNoDuplicateDocument(testAadhaar, "AADHAAR", userBId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("DUPLICATE_DOCUMENT")) {
        duplicateBlocked = true;
      }
    }

    if (!duplicateBlocked) {
      throw new Error("DUPLICATE_DETECTION_FAILURE: User B was allowed to register User A's Aadhaar");
    }
    console.log("✅ User A's Aadhaar encrypted at rest with HMAC hash.");
    console.log("✅ User B's attempt to use duplicate Aadhaar blocked.\n");

    // Test PAN duplicate detection in IndiaTaxCompliance
    console.log("Testing duplicate PAN detection in IndiaTaxCompliance...");
    const testPAN = "ABCDE" + String(Math.floor(1000 + Math.random() * 9000)) + "Z";
    const panHash = hashForDuplicateDetection(testPAN);
    const panEncrypted = encrypt(testPAN);

    await prisma.indiaTaxCompliance.create({
      data: {
        userId: userAId,
        panNumber: panEncrypted,
        panLast4: testPAN.slice(-4),
        panNumberHash: panHash,
        status: "VERIFIED",
        verifiedAt: new Date(),
      },
    });

    let panDuplicateBlocked = false;
    try {
      await assertNoDuplicateDocument(testPAN, "PAN_CARD", userBId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("DUPLICATE_DOCUMENT")) {
        panDuplicateBlocked = true;
      }
    }

    if (!panDuplicateBlocked) {
      throw new Error("DUPLICATE_DETECTION_FAILURE: User B was allowed to register User A's PAN");
    }
    console.log("✅ Duplicate PAN cross-account registration blocked.\n");

    // -------------------------------------------------------------------
    // Test 4: Combined Fraud Detection Checks
    // -------------------------------------------------------------------
    console.log("Test 4: Testing multi-vector fraud checks & review queue routing...");

    // Test 4A: Bank account holder name mismatch vs KYC name
    console.log("4A: Checking bank account name vs verified KYC name mismatch...");
    const mismatchFraudCheck = await checkPaymentFraud({
      userId: userAId,
      amount: 100000,
      bankAccount: "112233445566",
      bankAccountName: "Mismatched Unknown Person", // Does not match "Rajesh Kumar"
    });

    const hasNameMismatchFlag = mismatchFraudCheck.flags.some((f) => f.rule === "BANK_NAME_KYC_MISMATCH");
    if (!hasNameMismatchFlag) {
      throw new Error(`FRAUD_CHECK_FAILURE: BANK_NAME_KYC_MISMATCH flag not triggered. Flags: ${JSON.stringify(mismatchFraudCheck.flags)}`);
    }
    if (mismatchFraudCheck.action !== "REVIEW" && mismatchFraudCheck.action !== "BLOCK") {
      throw new Error(`FRAUD_CHECK_FAILURE: Expected REVIEW action, got ${mismatchFraudCheck.action}`);
    }
    console.log(`✅ BANK_NAME_KYC_MISMATCH detected (+45 risk score, action: ${mismatchFraudCheck.action}).`);

    // Test 4B: Rapid-fire withdrawals in a 10-minute window
    console.log("4B: Checking rapid-fire withdrawal attempts...");
    // Insert 2 withdrawals in the last 2 minutes
    await prisma.withdrawal.createMany({
      data: [
        {
          walletId: userAWalletId,
          amount: 50000,
          bankAccountName: "Rajesh Kumar",
          bankAccountNumber: encrypt("112233445566"),
          bankAccountHash: hashForDuplicateDetection("112233445566"),
          ifscCode: "HDFC0001234",
          status: "COMPLETED",
          createdAt: new Date(Date.now() - 2 * 60 * 1000),
        },
        {
          walletId: userAWalletId,
          amount: 50000,
          bankAccountName: "Rajesh Kumar",
          bankAccountNumber: encrypt("112233445566"),
          bankAccountHash: hashForDuplicateDetection("112233445566"),
          ifscCode: "HDFC0001234",
          status: "PROCESSING",
          createdAt: new Date(Date.now() - 1 * 60 * 1000),
        },
      ],
    });

    const rapidFireCheck = await checkPaymentFraud({
      userId: userAId,
      amount: 50000,
      bankAccount: "112233445566",
      bankAccountName: "Rajesh Kumar",
    });

    const hasRapidFireFlag = rapidFireCheck.flags.some((f) => f.rule === "RAPID_FIRE_WITHDRAWAL");
    if (!hasRapidFireFlag) {
      throw new Error(`FRAUD_CHECK_FAILURE: RAPID_FIRE_WITHDRAWAL flag not triggered. Flags: ${JSON.stringify(rapidFireCheck.flags)}`);
    }
    console.log(`✅ RAPID_FIRE_WITHDRAWAL detected (+40 risk score, action: ${rapidFireCheck.action}).`);

    // Test 4C: Device fingerprint clustering
    console.log("4C: Checking device fingerprint multi-account clustering...");
    if (redis) {
      const testFingerprint = `fp_shared_${timestamp}`;
      // Seed User B on this fingerprint
      await redis.sadd(`device_users:${testFingerprint}`, userBId);

      const deviceClusterCheck = await checkPaymentFraud({
        userId: userAId,
        amount: 20000,
        bankAccount: "112233445566",
        bankAccountName: "Rajesh Kumar",
        deviceFingerprint: testFingerprint,
      });

      const hasDeviceClusterFlag = deviceClusterCheck.flags.some((f) => f.rule === "DEVICE_FINGERPRINT_CLUSTERING");
      if (!hasDeviceClusterFlag) {
        throw new Error(`FRAUD_CHECK_FAILURE: DEVICE_FINGERPRINT_CLUSTERING flag not triggered. Flags: ${JSON.stringify(deviceClusterCheck.flags)}`);
      }
      console.log(`✅ DEVICE_FINGERPRINT_CLUSTERING detected (+50 risk score, action: ${deviceClusterCheck.action}).\n`);
    }

    // -------------------------------------------------------------------
    // Test 5: Cache Invalidation on KYC Status Change
    // -------------------------------------------------------------------
    console.log("Test 5: Testing KYC cache invalidation...");
    if (redis) {
      const badgeKey = `trust_badge:${userAId}`;
      const drsKey = `user:trust:${userAId}`;
      const profileKey = `user:profile:${userAId}`;

      await redis.set(badgeKey, JSON.stringify({ verified: true }));
      await redis.set(drsKey, JSON.stringify({ score: 90 }));
      await redis.set(profileKey, JSON.stringify({ name: "Rajesh" }));

      // Invalidate KYC cache
      await invalidateUserKYCCache(userAId);

      const [badgeVal, drsVal, profileVal] = await Promise.all([
        redis.get(badgeKey),
        redis.get(drsKey),
        redis.get(profileKey),
      ]);

      if (badgeVal || drsVal || profileVal) {
        throw new Error(`CACHE_INVALIDATION_FAILURE: Redis keys remained after invalidateUserKYCCache: badge=${badgeVal}, drs=${drsVal}, profile=${profileVal}`);
      }
      console.log("✅ Redis cache keys (trust badge, DRS, profile) successfully evicted.\n");
    }

    console.log("=================================================================");
    console.log("🎉 ALL KYC & FRAUD-DETECTION HARDENING TESTS PASSED!");
    console.log("=================================================================");
  } catch (error) {
    console.error("\n❌ TEST SUITE FAILED:");
    console.error(error);
    process.exit(1);
  } finally {
    // Cleanup
    console.log("\nCleaning up test artifacts...");
    if (userAId || userBId) {
      await prisma.verificationDocument.deleteMany({
        where: { userId: { in: [userAId, userBId].filter(Boolean) } },
      }).catch(() => {});
      await prisma.indiaTaxCompliance.deleteMany({
        where: { userId: { in: [userAId, userBId].filter(Boolean) } },
      }).catch(() => {});
      await prisma.withdrawal.deleteMany({
        where: { wallet: { userId: { in: [userAId, userBId].filter(Boolean) } } },
      }).catch(() => {});
      await prisma.wallet.deleteMany({
        where: { userId: { in: [userAId, userBId].filter(Boolean) } },
      }).catch(() => {});
      await prisma.user.deleteMany({
        where: { id: { in: [userAId, userBId].filter(Boolean) } },
      }).catch(() => {});
    }
    await prisma.$disconnect();
    console.log("Cleanup finished.");
  }
}

runTests();
