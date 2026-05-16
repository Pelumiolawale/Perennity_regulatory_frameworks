import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  safeguards_fair_competition,
  EXPECTED_FAIR_COMPETITION_ITEMS,
} from "../safeguards_fair_competition";
import type { Criterion, ProjectInput } from "../../engine";

const criterion: Criterion = {
  id: "safeguards_fair_competition",
  criterion: "minimum_safeguards_fair_competition",
  source_reference: "Article_18_Regulation_2020_852",
  source_text: "...",
  requirement_type: "compliance_attestation",
  scoring_logic_ref: "logic.safeguards_fair_competition.v1",
  authority_level: 1,
};

function run(items: string[] | undefined) {
  const project: ProjectInput = {
    project_id: "p1",
    intake_timestamp: "2026-05-13T00:00:00Z",
    facility_type: "hyperscale",
    jurisdiction: "DE",
    facility_status: "operational",
    data_points: items === undefined ? {} : { fair_competition_compliance_items: items },
    evidence_documents: [],
  };
  return safeguards_fair_competition({
    criterion,
    data_points: project.data_points,
    evidence_documents: [],
    project,
  });
}

describe("safeguards_fair_competition — pillar 4 (Article 18)", () => {
  test("all two items confirmed → pass", () => {
    const r = run([...EXPECTED_FAIR_COMPETITION_ITEMS]);
    assert.equal(r.verdict, "pass");
    assert.equal(r.observed_value, 2);
  });

  test("1 of 2 confirmed → partial (2-item pillar special-case: any single confirmation is partial, not fail)", () => {
    const r = run(["competition_policy_published"]);
    assert.equal(r.verdict, "partial");
    assert.equal(r.observed_value, 1);
    assert.ok(r.missing_items?.includes("no_competition_law_breaches_24m"));
  });

  test("0 of 2 confirmed → fail", () => {
    const r = run([]);
    assert.equal(r.verdict, "fail");
    assert.equal(r.observed_value, 0);
  });

  test("no input → data_missing", () => {
    const r = run(undefined);
    assert.equal(r.verdict, "data_missing");
  });
});
