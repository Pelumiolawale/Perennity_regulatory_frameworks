import type { LogicFn } from "./types";
import type { CriterionResult, Verdict } from "../engine";

const REF = "logic.minimum_safeguards_rollup.v1";
const VERSION = "v1";

const PILLAR_IDS = [
  "safeguards_human_rights",
  "safeguards_bribery_corruption",
  "safeguards_taxation",
  "safeguards_fair_competition",
] as const;

// Aggregate verdict across the four minimum-safeguards pillars per Article 18
// of Regulation (EU) 2020/852 as operationalised by the EU Platform on
// Sustainable Finance Final Report on Minimum Safeguards (October 2022):
//   - any pillar fail → fail
//   - any pillar data_missing (no fails) → data_missing
//   - any pillar partial (no fails or data_missing) → partial
//   - otherwise → pass
//
// The engine resolves `depends_on` first and passes the pillar results in via
// `previous_results` on the LogicInput.
export const minimum_safeguards_rollup: LogicFn = ({ criterion, previous_results }) => {
  const base = {
    criterion_id: criterion.id,
    scoring_logic_ref: REF,
    scoring_logic_version: VERSION,
    evidence_refs: [] as string[],
    authority_level: 1 as const,
  };

  const pillarResults = PILLAR_IDS.map((id) => previous_results?.[id]).filter(
    (r): r is CriterionResult => r !== undefined,
  );

  if (pillarResults.length < PILLAR_IDS.length) {
    const missingIds = PILLAR_IDS.filter((id) => !previous_results?.[id]);
    return {
      ...base,
      verdict: "data_missing",
      observed_value: null,
      gap_summary: `Minimum safeguards rollup: missing pillar results for ${missingIds.join(", ")}.`,
      contributing_pillars: pillarResults.map((r) => ({
        criterion_id: r.criterion_id,
        verdict: r.verdict,
      })),
    };
  }

  const verdicts: Verdict[] = pillarResults.map((r) => r.verdict);
  const contributing_pillars = pillarResults.map((r) => ({
    criterion_id: r.criterion_id,
    verdict: r.verdict,
  }));

  const verdict: Verdict = verdicts.includes("fail")
    ? "fail"
    : verdicts.includes("data_missing")
      ? "data_missing"
      : verdicts.includes("partial")
        ? "partial"
        : "pass";

  const summary =
    verdict === "pass"
      ? "Minimum safeguards rollup: all four pillars (human rights, bribery and corruption, taxation, fair competition) confirmed; aggregate verdict pass per Regulation (EU) 2020/852 Article 18 and the EU Platform Final Report on Minimum Safeguards (October 2022)."
      : `Minimum safeguards rollup: aggregate verdict ${verdict} across four pillars — ${contributing_pillars.map((p) => `${shortName(p.criterion_id)}=${p.verdict}`).join(", ")}.`;

  return {
    ...base,
    verdict,
    observed_value: contributing_pillars.filter((p) => p.verdict === "pass").length,
    gap_summary: summary,
    contributing_pillars,
  };
};

function shortName(id: string): string {
  return id.replace(/^safeguards_/, "");
}
