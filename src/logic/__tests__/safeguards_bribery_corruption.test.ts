import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  safeguards_bribery_corruption,
  EXPECTED_BRIBERY_CORRUPTION_ITEMS,
} from "../safeguards_bribery_corruption";
import type { Criterion, ProjectInput } from "../../engine";

const criterion: Criterion = {
  id: "safeguards_bribery_corruption",
  criterion: "minimum_safeguards_bribery_corruption",
  source_reference: "Article_18_Regulation_2020_852",
  source_text: "...",
  requirement_type: "compliance_attestation",
  scoring_logic_ref: "logic.safeguards_bribery_corruption.v1",
  authority_level: 1,
};

function run(items: string[] | undefined) {
  const project: ProjectInput = {
    project_id: "p1",
    intake_timestamp: "2026-05-13T00:00:00Z",
    facility_type: "hyperscale",
    jurisdiction: "DE",
    facility_status: "operational",
    data_points: items === undefined ? {} : { bribery_corruption_compliance_items: items },
    evidence_documents: [],
  };
  return safeguards_bribery_corruption({
    criterion,
    data_points: project.data_points,
    evidence_documents: [],
    project,
  });
}

describe("safeguards_bribery_corruption — pillar 2 (Article 18)", () => {
  test("all three items confirmed → pass", () => {
    const r = run([...EXPECTED_BRIBERY_CORRUPTION_ITEMS]);
    assert.equal(r.verdict, "pass");
    assert.equal(r.observed_value, 3);
  });

  test("two of three items confirmed (≥75% only if ≥75% of total — here 2/3 = 0.67 → fail)", () => {
    const r = run(EXPECTED_BRIBERY_CORRUPTION_ITEMS.slice(0, 2));
    // 2/3 = 0.667 < 0.75 → fail
    assert.equal(r.verdict, "fail");
    assert.equal(r.observed_value, 2);
  });

  test("no input → data_missing", () => {
    const r = run(undefined);
    assert.equal(r.verdict, "data_missing");
  });
});
