import { ListCampaignsParams, TierError } from "./campaign/types";

import { listCampaigns } from "./campaign/list";
import { createCampaign } from "./campaign/create";
import { getCampaignById, updateDraftCampaign, activateDraftCampaign, cancelCampaign } from "./campaign/manage";

export type { ListCampaignsParams };
export { TierError };

export class CampaignService {
  static listCampaigns = listCampaigns;
  static createCampaign = createCampaign;
  static getCampaignById = getCampaignById;
  static updateDraftCampaign = updateDraftCampaign;
  static activateDraftCampaign = activateDraftCampaign;
  static cancelCampaign = cancelCampaign;
}
