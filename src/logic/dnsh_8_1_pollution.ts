import type { LogicFn } from "./types";

const REF = "logic.dnsh_8_1_pollution.v1";
const VERSION = "v1";

// EU Taxonomy 8.1 DNSH (5): Pollution prevention and control.
// Regulation (EU) 2021/2139 Annex I Section 8.1 designates this objective
// as "N/A" for Activity 8.1. Logic returns not_applicable unconditionally;
// the criterion is still rendered in the Report for regulatory completeness.
export const dnsh_8_1_pollution: LogicFn<["project"]> = ({ criterion }) => ({
  criterion_id: criterion.id,
  scoring_logic_ref: REF,
  scoring_logic_version: VERSION,
  evidence_refs: [],
  verdict: "not_applicable",
  observed_value: null,
  gap_summary: "Regulation (EU) 2021/2139 Annex I Section 8.1 designates DNSH objective (5) Pollution prevention and control as not applicable to Activity 8.1.",
});
