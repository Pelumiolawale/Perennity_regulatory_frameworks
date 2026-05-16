import { makePillarLogic } from "./safeguards_common";

// The third item — country_by_country_reporting_or_below_threshold — is a
// single confirmation that captures either active CbC reporting OR an
// attestation that the entity is below the CbC reporting threshold. Treating
// it as one item keeps the structured-list intake symmetrical across pillars
// while preserving the EU Platform Oct 2022 report's "applicability OR below
// threshold" reading.
export const EXPECTED_TAXATION_ITEMS = [
  "tax_governance_policy_published",
  "no_tax_evasion_findings_24m",
  "country_by_country_reporting_or_below_threshold",
] as const;

export const safeguards_taxation = makePillarLogic({
  ref: "logic.safeguards_taxation.v1",
  version: "v1",
  dataPointKey: "taxation_compliance_items",
  expectedItems: EXPECTED_TAXATION_ITEMS,
  pillarName: "taxation",
  citation:
    "Regulation (EU) 2020/852, Article 18; EU Platform on Sustainable Finance Final Report on Minimum Safeguards (October 2022), pillar 3; OECD Guidelines for Multinational Enterprises (tax chapter).",
});
