import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { minimum_safeguards_rollup } from "../minimum_safeguards_rollup";
import type { Criterion, CriterionResult, ProjectInput, Verdict } from "../../engine";

const criterion: Criterion = {
  id: "minimum_safeguards",
  criterion: "minimum_safeguards_rollup",
  source_reference: "Article_18_Regulation_2020_852",
  source_text: "...",
  requirement_type: "rollup",
  scoring_logic_ref: "logic.minimum_safeguards_rollup.v1",
  authority_level: 1,
  depends_on: [
    "safeguards_human_rights",
    "safeguards_bribery_corruption",
    "safeguards_taxation",
    "safeguards_fair_competition",
  ],
};

const project: ProjectInput = {
  project_id: "p1",
  intake_timestamp: "2026-05-13T00:00:00Z",
  facility_type: "hyperscale",
  jurisdiction: "DE",
  facility_status: "operational",
  data_points: {},
  evidence_documents: [],
};

function pillar(id: string, verdict: Verdict): CriterionResult {
  return {
    criterion_id: id,
    verdict,
    observed_value: null,
    gap_summary: `stub-${id}-${verdict}`,
    evidence_refs: [],
    scoring_logic_ref: `logic.${id}.v1`,
    scoring_logic_version: "v1",
    authority_level: 1,
  };
}

function run(previous_results: Record<string, CriterionResult>) {
  return minimum_safeguards_rollup({
    criterion,
    data_points: {},
    evidence_documents: [],
    project,
    previous_results,
  });
}

describe("minimum_safeguards_rollup — aggregate across four pillars", () => {
  test("all four pillars pass → pass", () => {
    const r = run({
      safeguards_human_rights: pillar("safeguards_human_rights", "pass"),
      safeguards_bribery_corruption: pillar("safeguards_bribery_corruption", "pass"),
      safeguards_taxation: pillar("safeguards_taxation", "pass"),
      safeguards_fair_competition: pillar("safeguards_fair_competition", "pass"),
    });
    assert.equal(r.verdict, "pass");
    assert.equal(r.authority_level, 1);
    assert.equal(r.contributing_pillars?.length, 4);
  });

  test("one pillar fail (others pass) → fail", () => {
    const r = run({
      safeguards_human_rights: pillar("safeguards_human_rights", "pass"),
      safeguards_bribery_corruption: pillar("safeguards_bribery_corruption", "fail"),
      safeguards_taxation: pillar("safeguards_taxation", "pass"),
      safeguards_fair_competition: pillar("safeguards_fair_competition", "pass"),
    });
    assert.equal(r.verdict, "fail");
  });

  test("one pillar data_missing (no fails) → data_missing", () => {
    const r = run({
      safeguards_human_rights: pillar("safeguards_human_rights", "pass"),
      safeguards_bribery_corruption: pillar("safeguards_bribery_corruption", "pass"),
      safeguards_taxation: pillar("safeguards_taxation", "data_missing"),
      safeguards_fair_competition: pillar("safeguards_fair_competition", "pass"),
    });
    assert.equal(r.verdict, "data_missing");
  });

  test("one pillar partial (no fails or data_missing) → partial", () => {
    const r = run({
      safeguards_human_rights: pillar("safeguards_human_rights", "pass"),
      safeguards_bribery_corruption: pillar("safeguards_bribery_corruption", "pass"),
      safeguards_taxation: pillar("safeguards_taxation", "pass"),
      safeguards_fair_competition: pillar("safeguards_fair_competition", "partial"),
    });
    assert.equal(r.verdict, "partial");
  });

  test("fail dominates data_missing", () => {
    const r = run({
      safeguards_human_rights: pillar("safeguards_human_rights", "fail"),
      safeguards_bribery_corruption: pillar("safeguards_bribery_corruption", "data_missing"),
      safeguards_taxation: pillar("safeguards_taxation", "pass"),
      safeguards_fair_competition: pillar("safeguards_fair_competition", "pass"),
    });
    assert.equal(r.verdict, "fail");
  });

  test("missing pillar results in previous_results → data_missing", () => {
    const r = run({
      safeguards_human_rights: pillar("safeguards_human_rights", "pass"),
      // three other pillars omitted
    });
    assert.equal(r.verdict, "data_missing");
    assert.match(r.gap_summary, /safeguards_bribery_corruption|safeguards_taxation|safeguards_fair_competition/);
  });
});
