import { makePillarLogic } from "./safeguards_common";

export const EXPECTED_HUMAN_RIGHTS_ITEMS = [
  "human_rights_policy_published",
  "due_diligence_process_operational",
  "grievance_mechanism_operational",
  "ilo_core_conventions_compliance",
  "no_ungc_violations_24m",
] as const;

export const safeguards_human_rights = makePillarLogic({
  ref: "logic.safeguards_human_rights.v1",
  version: "v1",
  dataPointKey: "human_rights_compliance_items",
  expectedItems: EXPECTED_HUMAN_RIGHTS_ITEMS,
  pillarName: "human rights",
  citation:
    "Regulation (EU) 2020/852, Article 18; EU Platform on Sustainable Finance Final Report on Minimum Safeguards (October 2022), pillar 1; UN Guiding Principles on Business and Human Rights; eight ILO core conventions; International Bill of Human Rights.",
});
