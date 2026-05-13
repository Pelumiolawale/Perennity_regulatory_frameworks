import type { LogicFn } from "./types";

const REF = "logic.dnsh_water.v1";
const VERSION = "v1";
const WUE_THRESHOLD = 0.4;
const PARTIAL_MARGIN = 0.1;

// EU Taxonomy 8.1 DNSH (Appendix B): water-use effectiveness ≤ 0.4 l/kWh,
// conditional on the site being in a water-stressed region (WRI Aqueduct 4.0).
export const dnsh_water: LogicFn = ({ criterion, data_points }) => {
  const base = {
    criterion_id: criterion.id,
    scoring_logic_ref: REF,
    scoring_logic_version: VERSION,
    evidence_refs: [] as string[],
    threshold_value: criterion.threshold_value ?? WUE_THRESHOLD,
    threshold_operator: criterion.threshold_operator ?? "less_than_or_equal",
  };

  const stress = data_points["site_water_stress_classification"];
  if (typeof stress !== "string" || stress.trim().length === 0) {
    return {
      ...base,
      verdict: "data_missing",
      observed_value: null,
      gap_summary: "Site water-stress classification was not provided.",
    };
  }
  if (!isWaterStressed(stress)) {
    return {
      ...base,
      verdict: "not_applicable",
      observed_value: stress,
      gap_summary: `Site is classified as "${stress}"; WUE threshold applies only in water-stressed regions.`,
    };
  }

  const wueRaw = data_points["wue_annualised"];
  if (wueRaw === undefined) {
    return {
      ...base,
      verdict: "data_missing",
      observed_value: null,
      gap_summary: "Annualised WUE was not provided.",
    };
  }
  const wue = typeof wueRaw === "number" ? wueRaw : Number(wueRaw);
  if (!Number.isFinite(wue)) {
    return {
      ...base,
      verdict: "data_missing",
      observed_value: String(wueRaw),
      gap_summary: `Annualised WUE value "${wueRaw}" is not a finite number.`,
    };
  }

  const estimation_used = data_points["wue_annualised_is_estimate"] === true;
  const common = { ...base, observed_value: wue, estimation_used };

  if (wue <= WUE_THRESHOLD) {
    return {
      ...common,
      verdict: "pass",
      gap_summary: `Annualised WUE of ${wue} l/kWh meets the ${WUE_THRESHOLD} threshold for water-stressed regions.`,
    };
  }
  if (wue <= WUE_THRESHOLD * (1 + PARTIAL_MARGIN)) {
    return {
      ...common,
      verdict: "partial",
      gap_summary: `Annualised WUE of ${wue} l/kWh exceeds the ${WUE_THRESHOLD} threshold by under ${Math.round(PARTIAL_MARGIN * 100)}%; remediation plan required.`,
    };
  }
  return {
    ...common,
    verdict: "fail",
    gap_summary: `Annualised WUE of ${wue} l/kWh exceeds the ${WUE_THRESHOLD} threshold; criterion not met in this water-stressed region.`,
  };
};

// WRI Aqueduct 4.0 buckets: Low / Low-Medium / Medium-High / High / Extremely High.
// The criterion's conditional_on trigger fires for High and Extremely High,
// or any classification that explicitly names "water stress".
function isWaterStressed(classification: string): boolean {
  const norm = classification.toLowerCase().replace(/[-_\s]+/g, "");
  return norm === "high" || norm === "extremelyhigh" || norm.includes("waterstress");
}
