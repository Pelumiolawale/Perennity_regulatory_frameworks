import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { dnsh_water } from "../dnsh_water";
import type { DNSHCriterion, ProjectInput } from "../../engine";

const criterion: DNSHCriterion = {
  id: "dnsh_8_1_water",
  criterion: "water_use_effectiveness_stressed_region",
  source_reference: "Annex_I_Appendix_B",
  source_text: "...",
  requirement_type: "numeric_threshold",
  threshold_value: 0.4,
  threshold_operator: "less_than_or_equal",
  threshold_unit: "litres_per_kwh",
  threshold_metric: "wue",
  conditional_on: "water_stressed_region",
  scoring_logic_ref: "logic.dnsh_water.v1",
  objective: "water_and_marine_resources",
};

function makeProject(data: Record<string, unknown>): ProjectInput {
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
  return dnsh_water({
    criterion,
    data_points: project.data_points,
    evidence_documents: project.evidence_documents,
    project,
  });
}

describe("dnsh_water — WUE threshold (water-stressed regions)", () => {
  test("data_missing when water-stress classification is absent", () => {
    const r = run(makeProject({}));
    assert.equal(r.verdict, "data_missing");
  });

  test("not_applicable when site is not in a water-stressed region", () => {
    const r = run(
      makeProject({
        site_water_stress_classification: "Low",
        wue_annualised: 0.5,
      }),
    );
    assert.equal(r.verdict, "not_applicable");
  });

  test("data_missing when in a water-stressed region but WUE is absent", () => {
    const r = run(makeProject({ site_water_stress_classification: "High" }));
    assert.equal(r.verdict, "data_missing");
  });

  test("pass when WUE is at or below threshold", () => {
    const r = run(
      makeProject({
        site_water_stress_classification: "High",
        wue_annualised: 0.3,
      }),
    );
    assert.equal(r.verdict, "pass");
    assert.equal(r.observed_value, 0.3);
    assert.equal(r.estimation_used, false);
  });

  test("partial when WUE is within 10% of threshold", () => {
    const r = run(
      makeProject({
        site_water_stress_classification: "Extremely High",
        wue_annualised: 0.42,
      }),
    );
    assert.equal(r.verdict, "partial");
  });

  test("fail when WUE is well above threshold", () => {
    const r = run(
      makeProject({
        site_water_stress_classification: "High",
        wue_annualised: 0.7,
      }),
    );
    assert.equal(r.verdict, "fail");
  });

  test("estimation_used propagates when the WUE value is flagged as an estimate", () => {
    const r = run(
      makeProject({
        site_water_stress_classification: "High",
        wue_annualised: 0.35,
        wue_annualised_is_estimate: true,
      }),
    );
    assert.equal(r.verdict, "pass");
    assert.equal(r.estimation_used, true);
  });
});
