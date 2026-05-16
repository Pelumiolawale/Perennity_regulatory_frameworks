import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { dnsh_8_1_pollution } from "../dnsh_8_1_pollution";
import type { DNSHCriterion, ProjectInput } from "../../engine";

const criterion: DNSHCriterion = {
  id: "dnsh_8_1_pollution",
  objective: "pollution_prevention",
  criterion: "dnsh_not_applicable_per_section_8_1",
  source_reference: "Annex_I_Section_8.1_DNSH_paragraph_5",
  source_text: "N/A",
  requirement_type: "qualitative_assessment",
  scoring_logic_ref: "logic.dnsh_8_1_pollution.v1",
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

describe("dnsh_8_1_pollution — DNSH (5) Pollution prevention and control", () => {
  test("always returns not_applicable regardless of inputs", () => {
    const r = dnsh_8_1_pollution({
      criterion,
      data_points: { some_unrelated_input: 42 },
      evidence_documents: [],
      project,
    });
    assert.equal(r.verdict, "not_applicable");
    assert.equal(r.observed_value, null);
    assert.equal(r.scoring_logic_ref, "logic.dnsh_8_1_pollution.v1");
    assert.match(r.gap_summary, /Pollution prevention/);
    assert.match(r.gap_summary, /not applicable/);
  });
});
