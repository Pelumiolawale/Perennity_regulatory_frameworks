import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sc_8_1_1 } from "../sc_8_1_1";
import type { Criterion, EvidenceReference, ProjectInput } from "../../engine";

const criterion: Criterion = {
  id: "sc_8_1_1_ecocc",
  criterion: "european_code_of_conduct_compliance",
  source_reference: "Annex_I_Section_8.1_paragraph_1",
  source_text: "...",
  requirement_type: "compliance_attestation",
  verification_requirement: "independent_third_party",
  verification_frequency_years: 3,
  scoring_logic_ref: "logic.sc_8_1_1.v2",
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
    data_points: opts.data ?? {},
    evidence_documents: opts.evidence ?? [],
  };
}

function run(project: ProjectInput, c: Criterion = criterion) {
  return sc_8_1_1({
    criterion: c,
    data_points: project.data_points,
    evidence_documents: project.evidence_documents,
    project,
  });
}

const auditDoc = (
  id: string,
  uploaded_at: string,
  document_type: "audit_report" | "independent_audit" | "self_attestation" | "engineering_design" = "independent_audit",
): EvidenceReference => ({
  document_id: id,
  document_type,
  uri: `https://evidence.test/${id}`,
  uploaded_at,
  sha256: "0".repeat(64),
});

describe("sc_8_1_1 — eCoCC compliance", () => {
  test("data_missing when ecocc_practices_implemented is absent", () => {
    const r = run(makeProject());
    assert.equal(r.verdict, "data_missing");
    assert.match(r.gap_summary, /ecocc_practices_implemented/);
    assert.equal(r.scoring_logic_ref, "logic.sc_8_1_1.v2");
  });

  test("fail when practices list is empty (practices gate dominates even with a fresh audit)", () => {
    const r = run(
      makeProject({
        data: { ecocc_practices_implemented: [] },
        evidence: [auditDoc("doc-1", "2025-06-01T00:00:00Z", "independent_audit")],
      }),
    );
    assert.equal(r.verdict, "fail");
    assert.equal(r.observed_value, 0);
  });

  test("data_missing when no qualifying audit doc in evidence", () => {
    const r = run(
      makeProject({
        data: { ecocc_practices_implemented: ["airflow_mgmt", "free_cooling"] },
        evidence: [
          auditDoc("doc-design", "2025-06-01T00:00:00Z", "engineering_design"),
          auditDoc("doc-self", "2025-06-01T00:00:00Z", "self_attestation"),
        ],
      }),
    );
    assert.equal(r.verdict, "data_missing");
    assert.match(r.gap_summary, /No independent audit document/);
    assert.match(r.gap_summary, /audit_report or independent_audit/);
  });

  test("pass when practices populated + fresh independent_audit doc", () => {
    const r = run(
      makeProject({
        data: {
          ecocc_practices_implemented: ["airflow_mgmt", "free_cooling", "heat_reuse"],
        },
        evidence: [auditDoc("doc-good", "2025-06-01T00:00:00Z", "independent_audit")],
      }),
    );
    assert.equal(r.verdict, "pass");
    assert.equal(r.observed_value, 3);
    assert.deepEqual(r.evidence_refs, ["doc-good"]);
  });

  test("pass when practices populated + fresh audit_report doc (both doc_types qualify)", () => {
    const r = run(
      makeProject({
        data: { ecocc_practices_implemented: ["airflow_mgmt"] },
        evidence: [auditDoc("doc-ar", "2025-06-01T00:00:00Z", "audit_report")],
      }),
    );
    assert.equal(r.verdict, "pass");
    assert.deepEqual(r.evidence_refs, ["doc-ar"]);
    assert.match(r.gap_summary, /audit_report/);
  });

  test("fail when most recent audit is older than verification_frequency_years", () => {
    const r = run(
      makeProject({
        data: { ecocc_practices_implemented: ["airflow_mgmt", "free_cooling"] },
        evidence: [auditDoc("doc-old", "2022-01-01T00:00:00Z", "independent_audit")],
        intake: "2026-05-13T00:00:00Z",
      }),
    );
    assert.equal(r.verdict, "fail");
    assert.match(r.gap_summary, /older|years old/);
    assert.deepEqual(r.evidence_refs, ["doc-old"]);
  });

  test("with two audit docs (one stale + one fresh), engine picks the fresh one", () => {
    const r = run(
      makeProject({
        data: { ecocc_practices_implemented: ["airflow_mgmt"] },
        evidence: [
          auditDoc("doc-stale", "2021-01-01T00:00:00Z", "independent_audit"),
          auditDoc("doc-fresh", "2025-06-01T00:00:00Z", "audit_report"),
        ],
        intake: "2026-05-13T00:00:00Z",
      }),
    );
    assert.equal(r.verdict, "pass");
    assert.deepEqual(r.evidence_refs, ["doc-fresh"]);
  });

  test("freshness window is parametrized from criterion.verification_frequency_years", () => {
    const longWindow: Criterion = { ...criterion, verification_frequency_years: 10 };
    const r = run(
      makeProject({
        data: { ecocc_practices_implemented: ["airflow_mgmt"] },
        evidence: [auditDoc("doc-5yo", "2021-05-13T00:00:00Z", "independent_audit")],
        intake: "2026-05-13T00:00:00Z",
      }),
      longWindow,
    );
    assert.equal(r.verdict, "pass");
  });

  test("falls back to 3-year default when criterion.verification_frequency_years is absent", () => {
    const noWindow: Criterion = { ...criterion };
    delete (noWindow as { verification_frequency_years?: number | null }).verification_frequency_years;
    const r = run(
      makeProject({
        data: { ecocc_practices_implemented: ["airflow_mgmt"] },
        evidence: [auditDoc("doc-4yo", "2022-01-01T00:00:00Z", "independent_audit")],
        intake: "2026-05-13T00:00:00Z",
      }),
      noWindow,
    );
    assert.equal(r.verdict, "fail");
  });
});
