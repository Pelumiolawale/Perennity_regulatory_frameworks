import { makePillarLogic } from "./safeguards_common";

export const EXPECTED_BRIBERY_CORRUPTION_ITEMS = [
  "anti_bribery_policy_published",
  "anti_bribery_training_programme",
  "no_bribery_convictions_24m",
] as const;

export const safeguards_bribery_corruption = makePillarLogic({
  ref: "logic.safeguards_bribery_corruption.v1",
  version: "v1",
  dataPointKey: "bribery_corruption_compliance_items",
  expectedItems: EXPECTED_BRIBERY_CORRUPTION_ITEMS,
  pillarName: "bribery and corruption",
  citation:
    "Regulation (EU) 2020/852, Article 18; EU Platform on Sustainable Finance Final Report on Minimum Safeguards (October 2022), pillar 2; OECD Anti-Bribery Convention.",
});
