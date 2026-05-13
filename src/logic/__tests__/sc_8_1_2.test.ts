import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sc_8_1_2 } from "../sc_8_1_2";
import type { Criterion, ProjectInput } from "../../engine";

const criterion: Criterion = {
  id: "sc_8_1_2_pue_existing",
  criterion: "pue_threshold_existing_facilities",
  source_reference: "Annex_I_Section_8.1_paragraph_2",
  source_text: "...",
  requirement_type: "numeric_threshold",
  applies_to: "existing_facilities_built_before_2025",
  threshold_value: 1.5,
  threshold_operator: "less_than_or_equal",
  threshold_unit: "ratio",
  threshold_metric: "annualised_pue",
  scoring_logic_ref: "logic.sc_8_1_2.v1",
};

function makeProject(opts: {
  data?: Record<string, unknown>;
  status?: ProjectInput["facility_status"];
  buildYear?: number;
} = {}): ProjectInput {
  return {
    project_id: "p1",
    intake_timestamp: "2026-05-13T00:00:00Z",
    facility_type: "hyperscale",
    jurisdiction: "DE",
    facility_status: opts.status ?? "operational",
    build_completion_year: opts.buildYear ?? 2020,
    data_points: opts.data ?? {},
    evidence_documents: [],
  };
}

function run(project: ProjectInput) {
  return sc_8_1_2({
    criterion,
    data_points: project.data_points,
    evidence_documents: project.evidence_documents,
    project,
  });
}

describe("sc_8_1_2 — PUE threshold (existing facilities)", () => {
  test("not_applicable when build year is 2025 or later", () => {
    const r = run(makeProject({ buildYear: 2026, data: { annualised_pue: 1.3 } }));
    assert.equal(r.verdict, "not_applicable");
  });

  test("not_applicable when facility is not yet operational", () => {
    const r = run(
      makeProject({ status: "construction", data: { annualised_pue: 1.3 } }),
    );
    assert.equal(r.verdict, "not_applicable");
  });

  test("data_missing when annualised_pue is absent", () => {
    const r = run(makeProject());
    assert.equal(r.verdict, "data_missing");
  });

  test("pass when PUE is at or below threshold", () => {
    const r = run(makeProject({ data: { annualised_pue: 1.4 } }));
    assert.equal(r.verdict, "pass");
    assert.equal(r.observed_value, 1.4);
    assert.equal(r.threshold_value, 1.5);
    assert.equal(r.threshold_operator, "less_than_or_equal");
  });

  test("partial when PUE is within 10% of threshold", () => {
    const r = run(makeProject({ data: { annualised_pue: 1.55 } }));
    assert.equal(r.verdict, "partial");
  });

  test("fail when PUE is well above threshold", () => {
    const r = run(makeProject({ data: { annualised_pue: 1.9 } }));
    assert.equal(r.verdict, "fail");
  });

  // estimation_used is not applicable: estimation_allowed=false for this criterion.
});
