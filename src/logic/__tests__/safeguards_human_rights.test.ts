import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  safeguards_human_rights,
  EXPECTED_HUMAN_RIGHTS_ITEMS,
} from "../safeguards_human_rights";
import type { Criterion, ProjectInput } from "../../engine";

const criterion: Criterion = {
  id: "safeguards_human_rights",
  criterion: "minimum_safeguards_human_rights",
  source_reference: "Article_18_Regulation_2020_852",
  source_text: "...",
  requirement_type: "compliance_attestation",
  scoring_logic_ref: "logic.safeguards_human_rights.v1",
  authority_level: 1,
};

function run(items: string[] | undefined): ReturnType<typeof safeguards_human_rights> {
  const project: ProjectInput = {
    project_id: "p1",
    intake_timestamp: "2026-05-13T00:00:00Z",
    facility_type: "hyperscale",
    jurisdiction: "DE",
    facility_status: "operational",
    data_points: items === undefined ? {} : { human_rights_compliance_items: items },
    evidence_documents: [],
  };
  return safeguards_human_rights({
    criterion,
    data_points: project.data_points,
    evidence_documents: [],
    project,
  });
}

describe("safeguards_human_rights — pillar 1 (Article 18)", () => {
  test("all five items confirmed → pass", () => {
    const r = run([...EXPECTED_HUMAN_RIGHTS_ITEMS]);
    assert.equal(r.verdict, "pass");
    assert.equal(r.observed_value, 5);
    assert.equal(r.authority_level, 1);
  });

  test("four of five items confirmed (≥75%) → partial", () => {
    const items = EXPECTED_HUMAN_RIGHTS_ITEMS.slice(0, 4);
    const r = run([...items]);
    assert.equal(r.verdict, "partial");
    assert.equal(r.observed_value, 4);
    assert.ok(r.missing_items?.includes("no_ungc_violations_24m"));
  });

  test("three of five items confirmed (<75%) → fail", () => {
    const items = EXPECTED_HUMAN_RIGHTS_ITEMS.slice(0, 3);
    const r = run([...items]);
    assert.equal(r.verdict, "fail");
    assert.equal(r.observed_value, 3);
  });

  test("no input → data_missing", () => {
    const r = run(undefined);
    assert.equal(r.verdict, "data_missing");
  });

  test("non-array input → data_missing", () => {
    const project: ProjectInput = {
      project_id: "p1",
      intake_timestamp: "2026-05-13T00:00:00Z",
      facility_type: "hyperscale",
      jurisdiction: "DE",
      facility_status: "operational",
      data_points: { human_rights_compliance_items: "not-an-array" },
      evidence_documents: [],
    };
    const r = safeguards_human_rights({
      criterion,
      data_points: project.data_points,
      evidence_documents: [],
      project,
    });
    assert.equal(r.verdict, "data_missing");
  });
});
