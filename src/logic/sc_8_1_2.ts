import type { LogicFn } from "./types";

const REF = "logic.sc_8_1_2.v1";
const VERSION = "v1";
const PUE_THRESHOLD = 1.5;
// "Partial" band: PUE up to 10% above threshold — close enough that a documented
// remediation path can plausibly close the gap. Anything beyond is a hard fail.
const PARTIAL_MARGIN = 0.1;

// EU Taxonomy 8.1 §2: PUE ≤ 1.5 for existing data centres (built before 2025).
export const sc_8_1_2: LogicFn<["project"]> = ({ criterion, data_points, project }) => {
  const base = {
    criterion_id: criterion.id,
    scoring_logic_ref: REF,
    scoring_logic_version: VERSION,
    evidence_refs: [] as string[],
    threshold_value: criterion.threshold_value ?? PUE_THRESHOLD,
    threshold_operator: criterion.threshold_operator ?? "less_than_or_equal",
  };

  if (project.facility_status !== "operational") {
    return {
      ...base,
      verdict: "not_applicable",
      observed_value: null,
      gap_summary: `Criterion applies to operational facilities; this project is in "${project.facility_status}" status.`,
    };
  }
  if (project.build_completion_year !== undefined && project.build_completion_year >= 2025) {
    return {
      ...base,
      verdict: "not_applicable",
      observed_value: null,
      gap_summary: `Criterion applies to facilities built before 2025; this facility was built in ${project.build_completion_year}.`,
    };
  }

  const pueRaw = data_points["annualised_pue"];
  if (pueRaw === undefined) {
    return {
      ...base,
      verdict: "data_missing",
      observed_value: null,
      gap_summary: "Annualised PUE was not provided.",
    };
  }
  const pue = typeof pueRaw === "number" ? pueRaw : Number(pueRaw);
  if (!Number.isFinite(pue)) {
    return {
      ...base,
      verdict: "data_missing",
      observed_value: String(pueRaw),
      gap_summary: `Annualised PUE value "${pueRaw}" is not a finite number.`,
    };
  }

  if (pue <= PUE_THRESHOLD) {
    return {
      ...base,
      verdict: "pass",
      observed_value: pue,
      gap_summary: `Annualised PUE of ${pue} meets the ${PUE_THRESHOLD} ratio threshold.`,
    };
  }
  if (pue <= PUE_THRESHOLD * (1 + PARTIAL_MARGIN)) {
    return {
      ...base,
      verdict: "partial",
      observed_value: pue,
      gap_summary: `Annualised PUE of ${pue} exceeds the ${PUE_THRESHOLD} threshold by under ${Math.round(PARTIAL_MARGIN * 100)}%; remediation plan required.`,
    };
  }
  return {
    ...base,
    verdict: "fail",
    observed_value: pue,
    gap_summary: `Annualised PUE of ${pue} exceeds the ${PUE_THRESHOLD} ratio threshold; criterion not met.`,
  };
};
