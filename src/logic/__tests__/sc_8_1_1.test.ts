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
  scoring_logic_ref: "logic.sc_8_1_1.v1",
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

function run(project: ProjectInput) {
  return sc_8_1_1({
    criterion,
    data_points: project.data_points,
    evidence_documents: project.evidence_documents,
    project,
  });
}

const independentAudit = (id: string, uploaded_at: string): EvidenceReference => ({
  document_id: id,
  document_type: "independent_audit",
  uri: `https://evidence.test/${id}`,
  uploaded_at,
  sha256: "0".repeat(64),
});

describe("sc_8_1_1 — eCoCC compliance", () => {
  test("data_missing when both inputs absent", () => {
    const r = run(makeProject());
    assert.equal(r.verdict, "data_missing");
    assert.match(r.gap_summary, /ecocc_practices_implemented/);
    assert.match(r.gap_summary, /last_independent_audit_date/);
    assert.equal(r.scoring_logic_ref, "logic.sc_8_1_1.v1");
  });

  test("fail when practices list is empty", () => {
    const r = run(
      makeProject({
        data: { ecocc_practices_implemented: [], last_independent_audit_date: "doc-1" },
        evidence: [independentAudit("doc-1", "2025-06-01T00:00:00Z")],
      }),
    );
    assert.equal(r.verdict, "fail");
    assert.equal(r.observed_value, 0);
  });

  test("fail when last independent audit is older than 3 years", () => {
    const r = run(
      makeProject({
        data: {
          ecocc_practices_implemented: ["airflow_mgmt", "free_cooling"],
          last_independent_audit_date: "doc-old",
        },
        evidence: [independentAudit("doc-old", "2022-01-01T00:00:00Z")],
        intake: "2026-05-13T00:00:00Z",
      }),
    );
    assert.equal(r.verdict, "fail");
    assert.match(r.gap_summary, /years ago/);
  });

  test("partial when audit is recent but not independently performed", () => {
    const r = run(
      makeProject({
        data: {
          ecocc_practices_implemented: ["airflow_mgmt"],
          last_independent_audit_date: "doc-self",
        },
        evidence: [
          {
            document_id: "doc-self",
            document_type: "self_attestation",
            uri: "https://evidence.test/doc-self",
            uploaded_at: "2025-06-01T00:00:00Z",
            sha256: "0".repeat(64),
          },
        ],
      }),
    );
    assert.equal(r.verdict, "partial");
    assert.match(r.gap_summary, /independent third-party/);
  });

  test("pass when practices present and audit is recent + independent", () => {
    const r = run(
      makeProject({
        data: {
          ecocc_practices_implemented: ["airflow_mgmt", "free_cooling", "heat_reuse"],
          last_independent_audit_date: "doc-good",
        },
        evidence: [independentAudit("doc-good", "2025-06-01T00:00:00Z")],
      }),
    );
    assert.equal(r.verdict, "pass");
    assert.equal(r.observed_value, 3);
    assert.deepEqual(r.evidence_refs, ["doc-good"]);
  });

  // estimation_used is not applicable: estimation_allowed=false for this criterion.
});
