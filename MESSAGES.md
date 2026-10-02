# VyaparMedia User Messaging & Error Handling Guidelines (`MESSAGES.md`)

> **Last Updated**: September 24, 2026  
> **Status**: Verified & Synchronized with `src/lib/user-messages.ts` (Zero Technical Stack Leaks)

## 1. Core Principles


1. **Zero Technical Leaks**:
   - Stack traces, database column names, table names, SQL keywords, and internal microservice names must **never** be exposed in the UI.
   - Raw technical exceptions belong solely in structured server logs (`logger.error` / `logger.warn`).
2. **Consistent, Polite & Professional Tone**:
   - Tone is polite, clear, respectful, and reassuring.
   - Avoid robotic phrasing (e.g. `ERR_500: Internal server failure occurred`), accusatory tones (e.g. `You entered invalid data`), or overly informal slang.
3. **Actionability Over Ambiguity**:
   - Every error state should explain **what happened** and suggest **what to do next** (e.g., "Try again", "Refresh page", "Check bank details", or "Contact support").
4. **Informative & Specific Success States**:
   - Success messages must never be generic "Success!". They should provide concrete details (e.g., settlement timeframes, background verification steps, next milestone).

---

## 2. Standardized Message Catalog

### A. Authentication & Account Security
| Scenario | User-Facing Message | Suggested Action |
| :--- | :--- | :--- |
| **Session Expired (401)** | "Your session has expired. Please sign in again to continue." | Sign In |
| **Permission Denied (403)** | "You don't have permission to perform this action. If you believe this is an error, please reach out to support." | Contact Support |
| **Rate Limit Exceeded (429)** | "Too many attempts detected. For your account security, please wait a moment before trying again." | Wait & Retry |
| **Invalid / Expired OTP** | "The OTP entered is incorrect or has expired. Please request a new code and try again." | Resend Code |
| **Expired Reset Link** | "This password reset link has expired or has already been used. Please request a fresh link." | Request Link |
| **Password Changed** | "Password updated successfully. For your security, other active sessions have been signed out." | None |

### B. Wallet, Payments & Escrow
| Scenario | User-Facing Message | Suggested Action |
| :--- | :--- | :--- |
| **Insufficient Balance** | "Your available balance is insufficient for this request. Please review your wallet balance." | View Wallet |
| **Withdrawal Limits** | "Withdrawal must be between ₹500 and ₹5,00,000 per transaction." | Adjust Amount |
| **Gateway Timeout / Ambiguous** | "The payment gateway is taking longer than expected to confirm. Please check your transaction history before initiating a new request." | Check History |
| **Bank Account Verification** | "We couldn't verify this bank account. Please ensure the account number and IFSC code are correct." | Verify Details |
| **Withdrawal Submitted** | "Withdrawal request submitted successfully. Funds will reflect in your bank account within 2-3 business days." | View History |
| **Bank Account Added** | "Bank account saved. Verification penny-drop initiated and will confirm shortly." | Done |

### C. Deals & Deliverables
| Scenario | User-Facing Message | Suggested Action |
| :--- | :--- | :--- |
| **State Conflict / Stale Deal** | "This deal state has updated or this action is no longer permitted. Please refresh the deal details." | Refresh Deal |
| **Deliverables Submitted** | "Deliverables submitted successfully! The brand will review your content." | View Deal |
| **Contract Signed** | "Contract signed successfully. The deal is now active." | View Deal |
| **Dispute Lodged** | "Dispute opened. Our moderation team will review evidence within 24-48 hours." | Track Dispute |

### D. System & Network
| Scenario | User-Facing Message | Suggested Action |
| :--- | :--- | :--- |
| **Offline / Network Drop** | "Unable to connect right now. Please check your internet connection and try again." | Try Again |
| **Internal Server Error (500)** | "We encountered a temporary processing issue. Our team has been notified. Please try again shortly." | Try Again |
| **File Upload Too Large** | "File upload failed. Please ensure your file is under the allowed size limit and in a supported format." | Select File |

### E. Administrative Moderation & Arbitration
| Scenario | User-Facing Message | Suggested Action |
| :--- | :--- | :--- |
| **Payout Rejection Note Too Short** | "Rejection reason must be at least 5 characters." | Edit Note |
| **Razorpay Payout Authorized** | "Payout authorized successfully. Funds transfer has been scheduled via Razorpay Transfers API." | Done |
| **KYC Document Approved** | "Document approved and verified." | Next Document |
| **KYC Document Rejected** | "Document rejected. Applicant notified with explanation." | Next Document |
| **Full KYC Account Verification** | "User account verified and activated. Escrow withdrawals and bidding privileges unlocked." | View Queue |
| **Account Ban Confirmation** | "User account has been banned and active sessions terminated." | Refresh Directory |
| **Account Unban / Activation** | "User account has been reactivated successfully." | Refresh Directory |
| **Badge Awarded** | "Badge awarded successfully to user profile." | Done |
| **Dispute Verdict: Refund Brand** | "Dispute resolved in favor of the brand. Full escrow refunded." | View Dispute |
| **Dispute Verdict: Release Creator** | "Dispute resolved in favor of the creator. Escrow funds released to wallet." | View Dispute |
| **Newsletter Broadcast Dispatched** | "Newsletter dispatched successfully to verified subscribers." | View Stats |
| **Benchmark Configuration Updated** | "Category benchmarks and dynamic ROI weights updated successfully." | View Benchmarks |
| **Suspicious Review Quarantined** | "Review quarantined for administrator review due to collusion flags." | View Queue |

### F. Physical Product Logistics & Shiprocket Fulfillment
| Scenario | User-Facing Message | Suggested Action |
| :--- | :--- | :--- |
| **Delivery Address Missing** | "Please provide your complete delivery address before product dispatch." | Add Address |
| **Insufficient Wallet for Shipping** | "Your wallet balance is insufficient to cover the Shiprocket courier shipping fee. Please deposit funds." | Add Funds |
| **Non-Serviceable Pincode** | "The selected courier cannot service this destination pincode. Please verify or update the delivery address." | Edit Address |
| **Product Dispatched** | "Product sample dispatched! Tracking details and AWB number are now live." | Track Shipment |
| **Product Delivered** | "Shipment verified as delivered. Creator can now submit the content draft." | View Deal |

### G. Razorpay Route Split Settlement & Indian Tax Compliance
| Scenario | User-Facing Message | Suggested Action |
| :--- | :--- | :--- |
| **Creator KYC Tier-2 Required** | "Creator must complete PAN identity verification (KYC Tier-2) before escrow release can be settled directly." | Complete KYC |
| **Route Account Link Required** | "A verified bank account or Razorpay Route linked account is required to receive payout settlements." | Link Account |
| **Route Settlement Initiated** | "Escrow split settlement initiated. Funds transferred directly to creator's linked account after deducting TDS (Sec 194-O) and commission." | View Receipt |
| **Tax Invoice & Form 16A Ready** | "Statutory tax invoice and TDS deduction breakdown are ready for download." | Download Invoice |

### H. Campaign ROI & Benchmarks
| Scenario | User-Facing Message | Suggested Action |
| :--- | :--- | :--- |
| **Campaign In-Progress Disclaimer** | "This campaign is currently active. Metrics reflect real-time live performance estimates until all deliverables are completed." | Refresh Stats |
| **Benchmark Weights Invalid Sum** | "Category benchmark weights must sum to exactly 100%. Please adjust metric component percentages." | Rebalance |

---

## 3. Developer Usage Guide

### Using `formatUserError` in Components:
```typescript
import { formatUserError } from "@/lib/user-messages";

try {
  await apiClient.wallet.withdraw(...);
} catch (err: unknown) {
  const userMessage = formatUserError(err, "Failed to submit withdrawal request.");
  showToast("error", userMessage);
}
```

### Using `getUserFriendlyErrorMessage` with Action Buttons:
```typescript
import { getUserFriendlyErrorMessage } from "@/lib/user-messages";

try {
  await executeAction();
} catch (err: unknown) {
  const { message, actionText, actionType } = getUserFriendlyErrorMessage(err);
  setErrorDisplay({ message, actionText, actionType });
}
```

### Using Specific Success Messages:
```typescript
import { USER_SUCCESS_MESSAGES } from "@/lib/user-messages";

showToast("success", USER_SUCCESS_MESSAGES.WITHDRAWAL_SUBMITTED);
```
