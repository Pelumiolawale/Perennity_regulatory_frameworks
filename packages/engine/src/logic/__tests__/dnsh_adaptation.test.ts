import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { dnsh_adaptation } from "../dnsh_adaptation";
import type { DNSHCriterion, ProjectInput } from "../../engine";

const criterion: DNSHCriterion = {
  id: "dnsh_8_1_adaptation",
  criterion: "climate_risk_vulnerability_assessment",
  source_reference: "Annex_I_Appendix_A",
  source_text: "...",
  requirement_type: "qualitative_assessment",
  scoring_logic_ref: "logic.dnsh_adaptation.v1",
  objective: "climate_change_adaptation",
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
  return dnsh_adaptation({
    criterion,
    data_points: project.data_points,
    evidence_documents: project.evidence_documents,
    project,
  });
}

describe("dnsh_adaptation — climate risk vulnerability assessment", () => {
  test("data_missing when completion status is absent", () => {
    const r = run(makeProject());
    assert.equal(r.verdict, "data_missing");
  });

  test("fail when assessment is not completed", () => {
    const r = run(makeProject({ climate_risk_assessment_completed: false }));
    assert.equal(r.verdict, "fail");
    assert.equal(r.observed_value, false);
  });

  test("partial with estimation_used when completed but methodology absent", () => {
    const r = run(makeProject({ climate_risk_assessment_completed: true }));
    assert.equal(r.verdict, "partial");
    assert.equal(r.estimation_used, true);
    assert.match(r.gap_summary, /methodology is undocumented/);
  });

  test("partial+estimation when methodology is an empty string", () => {
    const r = run(
      makeProject({
        climate_risk_assessment_completed: true,
        climate_risk_assessment_methodology: "   ",
      }),
    );
    assert.equal(r.verdict, "partial");
    assert.equal(r.estimation_used, true);
  });

  test("pass when completed with a documented methodology", () => {
    const r = run(
      makeProject({
        climate_risk_assessment_completed: true,
        climate_risk_assessment_methodology: "WRI scenario analysis under RCP 8.5",
      }),
    );
    assert.equal(r.verdict, "pass");
    assert.equal(r.estimation_used, false);
  });
});
