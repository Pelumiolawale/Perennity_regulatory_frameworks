import { makePillarLogic } from "./safeguards_common";

// Two-item pillar: the 75% partial threshold collapses to "1 of 2 → partial;
// 0 of 2 → fail". The KB narrative documents this so the verdict is not
// surprising.
export const EXPECTED_FAIR_COMPETITION_ITEMS = [
  "competition_policy_published",
  "no_competition_law_breaches_24m",
] as const;

export const safeguards_fair_competition = makePillarLogic({
  ref: "logic.safeguards_fair_competition.v1",
  version: "v1",
  dataPointKey: "fair_competition_compliance_items",
  expectedItems: EXPECTED_FAIR_COMPETITION_ITEMS,
  pillarName: "fair competition",
  citation:
    "Regulation (EU) 2020/852, Article 18; EU Platform on Sustainable Finance Final Report on Minimum Safeguards (October 2022), pillar 4; OECD Guidelines for Multinational Enterprises (competition chapter).",
});
