import type { LogicFn } from "./types";

const REF = "logic.dnsh_8_1_circular_economy.v1";
const VERSION = "v1";

const REQUIRED_ITEMS = [
  "ecodesign_2009_125",
  "rohs_2011_65",
  "waste_management_plan",
  "weee_endoflife_2012_19",
] as const;

// EU Taxonomy 8.1 DNSH (4): Transition to a circular economy.
// Documentary checks against Directives 2009/125/EC (ecodesign),
// 2011/65/EU (RoHS), 2012/19/EU (WEEE Annex VII), plus a waste management plan.
export const dnsh_8_1_circular_economy: LogicFn<["project"]> = ({ criterion, data_points }) => {
  const base = {
    criterion_id: criterion.id,
    scoring_logic_ref: REF,
    scoring_logic_version: VERSION,
    evidence_refs: [] as string[],
  };

  const items = data_points["circular_economy_compliance_items"];
  if (items === undefined) {
    return {
      ...base,
      verdict: "data_missing",
      observed_value: null,
      gap_summary: "Required input missing: circular_economy_compliance_items.",
    };
  }
  if (!Array.isArray(items)) {
    return {
      ...base,
      verdict: "data_missing",
      observed_value: null,
      gap_summary: "circular_economy_compliance_items must be an array of compliance identifiers.",
    };
  }

  const declared = items.map(String);
  const present = REQUIRED_ITEMS.filter((r) => declared.includes(r));
  const missing = REQUIRED_ITEMS.filter((r) => !declared.includes(r));

  if (missing.length === 0) {
    return {
      ...base,
      verdict: "pass",
      observed_value: present.length,
      gap_summary: `All four DNSH (4) circular economy compliance items declared: ${present.join(", ")}.`,
    };
  }
  if (present.length >= 2) {
    return {
      ...base,
      verdict: "partial",
      observed_value: present.length,
      gap_summary: `${present.length} of 4 DNSH (4) circular economy compliance items declared; missing: ${missing.join(", ")}.`,
    };
  }
  return {
    ...base,
    verdict: "fail",
    observed_value: present.length,
    gap_summary: `Only ${present.length} of 4 DNSH (4) circular economy compliance items declared; missing: ${missing.join(", ")}.`,
  };
};
