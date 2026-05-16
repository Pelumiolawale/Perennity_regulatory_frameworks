import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sc_8_1_2_pue_measurement_compliance } from "../sc_8_1_2_pue_measurement_compliance";
import type { Criterion, EvidenceReference, ProjectInput } from "../../engine";

const criterion: Criterion = {
  id: "sc_8_1_2_pue_measurement_compliance",
  criterion: "pue_measurement_compliance",
  source_reference: "Annex_I_Section_8.1_paragraph_1__plus__ECoCC_section_9.3.5",
  source_text: "...",
  requirement_type: "compliance_attestation",
  verification_requirement: "independent_third_party",
  verification_frequency_years: 3,
  scoring_logic_ref: "logic.sc_8_1_2_pue_measurement_compliance.v1",
  authority_level: 1,
};

function makeProject(opts: {
  data?: Record<string, unknown>;
  evidence?: EvidenceReference[];
  intake?: string;
} = {}): ProjectInput {
  return {
    project_id: "p1",
    intake_timestamp: opts.intake ?? "2026-05-13T00:00:00Z",
    facility_type: "hyperscale",
    jurisdiction: "DE",
    facility_status: "operational",
    build_completion_year: 2022,
    data_points: opts.data ?? {},
    evidence_documents: opts.evidence ?? [],
  };
}

function run(project: ProjectInput) {
  return sc_8_1_2_pue_measurement_compliance({
    criterion,
    data_points: project.data_points,
    evidence_documents: project.evidence_documents,
    project,
  });
}

const auditDoc = (
  id: string,
  uploaded_at: string,
  document_type: "audit_report" | "independent_audit" | "self_attestation" = "independent_audit",
): EvidenceReference => ({
  document_id: id,
  document_type,
  uri: `https://evidence.test/${id}`,
  uploaded_at,
  sha256: "0".repeat(64),
});

const ALL_FIVE = {
  pue_measurement_methodology_declared: "EN_50600_4_2",
  pue_measurement_category: "category_2",
  pue_measurement_boundary_documented: true,
  pue_reporting_basis: "annualised",
};

describe("sc_8_1_2_pue_measurement_compliance — measurement-attestation logic", () => {
  test("all five items present + fresh audit → pass", () => {
    const r = run(
      makeProject({
        data: { ...ALL_FIVE },
        evidence: [auditDoc("doc-good", "2025-01-01T00:00:00Z", "independent_audit")],
      }),
    );
    assert.equal(r.verdict, "pass");
    assert.equal(r.observed_value, 5);
    assert.equal(r.scoring_logic_ref, "logic.sc_8_1_2_pue_measurement_compliance.v1");
    assert.equal(r.authority_level, 1);
    assert.deepEqual(r.evidence_refs, ["doc-good"]);
  });

  test("four items present, audit stale > 3 years → partial", () => {
    const r = run(
      makeProject({
        data: { ...ALL_FIVE },
        evidence: [auditDoc("doc-old", "2021-01-01T00:00:00Z", "independent_audit")],
      }),
    );
    assert.equal(r.verdict, "partial");
    assert.equal(r.observed_value, 4);
    assert.deepEqual(r.evidence_refs, []);
    assert.ok(r.missing_items?.includes("audit"));
  });

  test("three items present → fail (< 4 of 5)", () => {
    const r = run(
      makeProject({
        data: {
          pue_measurement_methodology_declared: "EN_50600_4_2",
          pue_measurement_category: "category_2",
          pue_measurement_boundary_documented: true,
          // reporting basis missing; no audit
        },
        evidence: [],
      }),
    );
    assert.equal(r.verdict, "fail");
    assert.equal(r.observed_value, 3);
  });

  test("no inputs at all → data_missing", () => {
    const r = run(makeProject());
    assert.equal(r.verdict, "data_missing");
    assert.match(r.gap_summary, /EN 50600-4-2|ISO\/IEC 30134-2/);
  });

  test("audit is discovered by document_type — regression on P0 #2 bug", () => {
    const r = run(
      makeProject({
        data: { ...ALL_FIVE },
        evidence: [
          // document_id is irrelevant — discovery is by document_type
          auditDoc("any-id-string", "2025-01-01T00:00:00Z", "audit_report"),
        ],
      }),
    );
    assert.equal(r.verdict, "pass");
    assert.deepEqual(r.evidence_refs, ["any-id-string"]);
  });

  test("methodology must be one of the recognised standards", () => {
    const r = run(
      makeProject({
        data: { ...ALL_FIVE, pue_measurement_methodology_declared: "some_homebrew_method" },
        evidence: [auditDoc("doc-good", "2025-01-01T00:00:00Z", "independent_audit")],
      }),
    );
    // 4 of 5: methodology fails, others pass → partial
    assert.equal(r.verdict, "partial");
    assert.ok(r.missing_items?.includes("methodology"));
  });

  test("reporting basis must be 'annualised' — design_point_only is partial-shy", () => {
    const r = run(
      makeProject({
        data: { ...ALL_FIVE, pue_reporting_basis: "design_point_only" },
        evidence: [auditDoc("doc-good", "2025-01-01T00:00:00Z", "independent_audit")],
      }),
    );
    assert.equal(r.verdict, "partial");
    assert.ok(r.missing_items?.includes("reporting"));
  });
});
