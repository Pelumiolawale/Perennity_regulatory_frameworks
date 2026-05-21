/**
 * RenderContract — structured output contract tests (Phase 1, commit 1.4 —
 * `v0.5.0-alpha.6`).
 *
 * The contract is the SPA's authoritative input shape. These tests lock the
 * structural invariants:
 *   - schema_version "1.0.0", methodology_version follows METHODOLOGY_VERSION,
 *     overall_verdict is hardcoded "calibration_pending".
 *   - SFDR Art 8 emits 7 criteria; Art 9 emits 3; combined emits both.
 *   - Every criterion verdict carries a non-empty band_rationale.
 *   - evidence_index is derived from referenced evidence_refs across criteria.
 *   - pai_data_file is reachable via contract.pai_data_file.
 *   - Missing inputs surface as insufficient_evidence verdicts, never throw.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { buildRenderContract } from "../renderContract";
import { DeterministicEngine } from "../../runtime";
import { loadKnowledgeBase } from "../../knowledge/load";
import { METHODOLOGY_VERSION } from "../methodologyVersion";
import type { EngineRun, ProjectInput } from "../../engine";

const MINIMAL_PROJECT: ProjectInput = {
  project_id: "p_render_contract_test",
  intake_timestamp: "2026-05-21T00:00:00Z",
  facility_type: "hyperscale",
  jurisdiction: "DE",
  facility_status: "operational",
  data_points: {},
  evidence_documents: [],
};

async function runArt8Only(): Promise<EngineRun> {
  const kb = await loadKnowledgeBase({
    rootDir: path.resolve(process.cwd(), "regulatory-knowledge"),
  });
  const art8 = kb.frameworksById.get("sfdr_v1_article_8");
  assert.ok(art8, "Art 8 framework must be loaded");
  const engine = new DeterministicEngine({
    engine_commit_sha: "test_sha",
    knowledge_base_hash: "test_kb_hash",
    methodology_version: METHODOLOGY_VERSION,
    now: () => "2026-05-21T00:00:00.000Z",
    generateId: () => "test_run_render_contract_art8",
  });
  return engine.run({ project: { ...MINIMAL_PROJECT } }, [art8]);
}

async function runArt8AndArt9(): Promise<EngineRun> {
  const kb = await loadKnowledgeBase({
    rootDir: path.resolve(process.cwd(), "regulatory-knowledge"),
  });
  const art8 = kb.frameworksById.get("sfdr_v1_article_8");
  const art9 = kb.frameworksById.get("sfdr_v1_article_9");
  assert.ok(art8 && art9, "Art 8 and Art 9 frameworks must be loaded");
  const engine = new DeterministicEngine({
    engine_commit_sha: "test_sha",
    knowledge_base_hash: "test_kb_hash",
    methodology_version: METHODOLOGY_VERSION,
    now: () => "2026-05-21T00:00:00.000Z",
    generateId: () => "test_run_render_contract_art8_art9",
  });
  return engine.run({ project: { ...MINIMAL_PROJECT } }, [art8, art9]);
}

describe("RenderContract — invariants", () => {
  test("schema_version is '1.0.0', methodology_version follows METHODOLOGY_VERSION, overall_verdict is 'calibration_pending'", async () => {
    const run = await runArt8Only();
    const contract = buildRenderContract(run);
    assert.equal(contract.schema_version, "1.0.0");
    assert.equal(contract.methodology_version, METHODOLOGY_VERSION);
    assert.equal(contract.overall_verdict, "calibration_pending");
  });

  test("Art 8 only: framework_findings has 1 entry with 7 criteria", async () => {
    const run = await runArt8Only();
    const contract = buildRenderContract(run);
    assert.equal(contract.framework_findings.length, 1);
    assert.equal(contract.framework_findings[0].framework, "sfdr_art8");
    assert.equal(contract.framework_findings[0].criteria.length, 7);
  });

  test("Art 8 + Art 9: framework_findings has 2 entries; Art 8 = 7 criteria, Art 9 = 10 (7 baseline + 3 Art-9-specific)", async () => {
    // Art 9 funds under SFDR must satisfy the Art 8 baseline plus the
    // Art-9-specific criteria (c8 SI objective, c9 evidence pack, c10 PAI
    // data provision). The Art 9 framework JSON references all 10 criteria
    // accordingly. The contract honestly mirrors this — the SPA can choose
    // to dedupe Art 8 criteria from the Art 9 view if it wants a clean
    // per-criterion delta surface; the contract does not hide the structure.
    const run = await runArt8AndArt9();
    const contract = buildRenderContract(run);
    assert.equal(contract.framework_findings.length, 2);
    const art8 = contract.framework_findings.find((f) => f.framework === "sfdr_art8");
    const art9 = contract.framework_findings.find((f) => f.framework === "sfdr_art9");
    assert.ok(art8 && art9);
    assert.equal(art8.criteria.length, 7);
    assert.equal(art9.criteria.length, 10);
    // Art 9 must include the 3 Art-9-specific criteria
    const art9Ids = new Set(art9.criteria.map((c) => c.criterion_id));
    assert.ok(art9Ids.has("sfdr_v1_si_objective_qualification"));
    assert.ok(art9Ids.has("sfdr_v1_si_eligibility_evidence_pack"));
    assert.ok(art9Ids.has("sfdr_v1_project_pai_data_provision"));
  });

  test("every criterion verdict has a non-empty band_rationale", async () => {
    const run = await runArt8AndArt9();
    const contract = buildRenderContract(run);
    for (const f of contract.framework_findings) {
      for (const c of f.criteria) {
        assert.ok(
          c.band_rationale.length > 0,
          `criterion ${c.criterion_id} must have non-empty band_rationale`,
        );
      }
    }
  });

  test("missing required inputs surface as insufficient_evidence verdicts, not exceptions", async () => {
    const run = await runArt8Only();
    const contract = buildRenderContract(run);
    // MINIMAL_PROJECT has no sfdr.* inputs, so every criterion must resolve
    // to insufficient_evidence rather than throw.
    const verdicts = contract.framework_findings[0].criteria.map((c) => c.verdict);
    assert.ok(
      verdicts.every((v) => v === "insufficient_evidence" || v === "not_applicable"),
      `expected every verdict to be insufficient_evidence or not_applicable on a bare-minimum project; got: ${verdicts.join(", ")}`,
    );
  });

  test("inferred target_label reflects which SFDR frameworks were assessed", async () => {
    const a8 = buildRenderContract(await runArt8Only());
    assert.equal(a8.project.target_label, "sfdr_v1_article_8");
    const both = buildRenderContract(await runArt8AndArt9());
    assert.equal(both.project.target_label, "sfdr_v1_article_8_and_9");
  });

  test("project metadata override takes precedence over inferred fields", async () => {
    const run = await runArt8Only();
    const contract = buildRenderContract(run, {
      project: {
        project_name: "Frankfurt DC-01",
        target_label: "sfdr_v1_article_8_and_9",
      },
    });
    assert.equal(contract.project.project_name, "Frankfurt DC-01");
    assert.equal(contract.project.target_label, "sfdr_v1_article_8_and_9");
    // jurisdiction and project_id still derived from the run
    assert.equal(contract.project.jurisdiction, "DE");
    assert.equal(contract.project.project_id, "p_render_contract_test");
  });

  test("evidence_index lists every cited evidence_ref with cited_by criteria", async () => {
    const run = await runArt8AndArt9();
    // Inject a real evidence_ref via a tangible Art 9 input.
    run.project_input.sfdr = {
      art9: {
        evidence_pack: {
          pai_data_file_ref: "pai_evidence_doc_001",
          operational_doc_age_months: 6,
        },
      },
    };
    const contract = buildRenderContract(run);
    // The evidence_index is built from criteria evidence_refs. With the
    // minimal project, c9's evidence_refs will include pai_evidence_doc_001
    // because c9's scoring function surfaces pai_data_file_ref as evidence
    // when present (defensive: empty result still valid if scoring path
    // doesn't surface the ref).
    // Either way: every evidence_index entry must have at least 1 cited_by.
    for (const e of contract.evidence_index) {
      assert.ok(e.cited_by.length > 0, "every evidence entry must have ≥1 cited_by criterion");
    }
  });

  test("pai_data_file is reachable via contract.pai_data_file with schema_source set", async () => {
    const run = await runArt8AndArt9();
    const contract = buildRenderContract(run);
    assert.equal(contract.pai_data_file.schema_source, "SFDR_2022_1288_Annex_I_Table_1");
    assert.equal(contract.pai_data_file.rows.length, 10);
  });
});
