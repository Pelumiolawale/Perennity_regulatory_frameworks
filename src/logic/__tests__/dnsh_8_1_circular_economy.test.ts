import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { dnsh_8_1_circular_economy } from "../dnsh_8_1_circular_economy";
import type { DNSHCriterion, ProjectInput } from "../../engine";

const criterion: DNSHCriterion = {
  id: "dnsh_8_1_circular_economy",
  objective: "circular_economy",
  criterion: "ecodesign_rohs_weee_compliance",
  source_reference: "Annex_I_Section_8.1_DNSH_paragraph_4",
  source_text: "...",
  requirement_type: "compliance_attestation",
  scoring_logic_ref: "logic.dnsh_8_1_circular_economy.v1",
};

function makeProject(data: Record<string, unknown> = {}): ProjectInput {
  return {
    project_id: "p1",
    intake_timestamp: "2026-05-13T00:00:00Z",
    facility_type: "hyperscale",
    jurisdiction: "DE",
    facility_status: "operational",
    data_points: data,
    evidence_documents: [],
  };
}

function run(project: ProjectInput) {
  return dnsh_8_1_circular_economy({
    criterion,
    data_points: project.data_points,
    evidence_documents: project.evidence_documents,
    project,
  });
}

describe("dnsh_8_1_circular_economy — DNSH (4) Transition to a circular economy", () => {
  test("data_missing when circular_economy_compliance_items is absent", () => {
    const r = run(makeProject());
    assert.equal(r.verdict, "data_missing");
    assert.match(r.gap_summary, /circular_economy_compliance_items/);
    assert.equal(r.scoring_logic_ref, "logic.dnsh_8_1_circular_economy.v1");
  });

  test("data_missing when value is not an array", () => {
    const r = run(makeProject({ circular_economy_compliance_items: "ecodesign_2009_125" }));
    assert.equal(r.verdict, "data_missing");
    assert.match(r.gap_summary, /must be an array/);
  });

  test("pass when all 4 required items are present", () => {
    const r = run(
      makeProject({
        circular_economy_compliance_items: [
          "ecodesign_2009_125",
          "rohs_2011_65",
          "waste_management_plan",
          "weee_endoflife_2012_19",
        ],
      }),
    );
    assert.equal(r.verdict, "pass");
    assert.equal(r.observed_value, 4);
  });

  test("pass ignoring extra unknown items beyond the 4 required", () => {
    const r = run(
      makeProject({
        circular_economy_compliance_items: [
          "ecodesign_2009_125",
          "rohs_2011_65",
          "waste_management_plan",
          "weee_endoflife_2012_19",
          "some_other_thing",
        ],
      }),
    );
    assert.equal(r.verdict, "pass");
    assert.equal(r.observed_value, 4);
  });

  test("partial when 2 of 4 items are present", () => {
    const r = run(
      makeProject({
        circular_economy_compliance_items: ["ecodesign_2009_125", "rohs_2011_65"],
      }),
    );
    assert.equal(r.verdict, "partial");
    assert.equal(r.observed_value, 2);
    assert.match(r.gap_summary, /missing/);
  });

  test("partial when 3 of 4 items are present", () => {
    const r = run(
      makeProject({
        circular_economy_compliance_items: [
          "ecodesign_2009_125",
          "rohs_2011_65",
          "waste_management_plan",
        ],
      }),
    );
    assert.equal(r.verdict, "partial");
    assert.equal(r.observed_value, 3);
  });

  test("fail when only 1 item is present", () => {
    const r = run(makeProject({ circular_economy_compliance_items: ["ecodesign_2009_125"] }));
    assert.equal(r.verdict, "fail");
    assert.equal(r.observed_value, 1);
  });

  test("fail when 0 items are present (empty array)", () => {
    const r = run(makeProject({ circular_economy_compliance_items: [] }));
    assert.equal(r.verdict, "fail");
    assert.equal(r.observed_value, 0);
  });
});
