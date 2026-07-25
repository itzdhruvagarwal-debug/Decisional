import { DealWithRelations, ExpiredDealCandidate } from "./deal/helpers";
import { listDeals } from "./deal/list";
import { rejectPendingInvite } from "./deal/invite";
import { submitContent, approveContent, reviewContent } from "./deal/content";
import { submitShippingAddress, confirmProductDispatch, confirmProductReceived } from "./deal/product";
import { autoApproveExpiredContent } from "./deal/auto-approve";
import { verifyPost } from "./deal/verify";

export type { DealWithRelations, ExpiredDealCandidate };

export class DealService {
  static listDeals = listDeals;
  static submitContent = submitContent;
  static rejectPendingInvite = rejectPendingInvite;
  static submitShippingAddress = submitShippingAddress;
  static confirmProductDispatch = confirmProductDispatch;
  static confirmProductReceived = confirmProductReceived;
  static approveContent = approveContent;
  static reviewContent = reviewContent;
  static autoApproveExpiredContent = autoApproveExpiredContent;
  static verifyPost = verifyPost;
}
