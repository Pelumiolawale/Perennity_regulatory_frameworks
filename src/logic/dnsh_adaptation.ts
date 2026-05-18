import type { LogicFn } from "./types";

const REF = "logic.dnsh_adaptation.v1";
const VERSION = "v1";

// EU Taxonomy 8.1 DNSH (Appendix A): climate change adaptation —
// physical climate risk vulnerability assessment.
export const dnsh_adaptation: LogicFn<["project"]> =({ criterion, data_points }) => {
  const base = {
    criterion_id: criterion.id,
    scoring_logic_ref: REF,
    scoring_logic_version: VERSION,
    evidence_refs: [] as string[],
  };

  const completed = data_points["climate_risk_assessment_completed"];
  const methodology = data_points["climate_risk_assessment_methodology"];

  if (completed === undefined) {
    return {
      ...base,
      verdict: "data_missing",
      observed_value: null,
      gap_summary: "Climate risk assessment completion status was not provided.",
    };
  }
  if (completed !== true) {
    return {
      ...base,
      verdict: "fail",
      observed_value: false,
      gap_summary: "Climate risk vulnerability assessment has not been completed.",
    };
  }
  // Partial path: completion attested but methodology undocumented. The verdict
  // rests on attestation alone — flag estimation_used so the audit trail records
  // that we relied on the Platform Feb 2025 estimation guidance.
  if (typeof methodology !== "string" || methodology.trim().length === 0) {
    return {
      ...base,
      verdict: "partial",
      observed_value: true,
      estimation_used: true,
      gap_summary: "Climate risk assessment attested as completed, but methodology is undocumented; verdict relies on attestation alone.",
    };
  }
  return {
    ...base,
    verdict: "pass",
    observed_value: true,
    estimation_used: false,
    gap_summary: `Climate risk assessment completed using methodology: ${methodology}.`,
  };
};
