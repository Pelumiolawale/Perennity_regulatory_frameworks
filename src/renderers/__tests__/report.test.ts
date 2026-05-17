import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ReportRenderer } from "../report";
import type { Activity, EngineRun } from "../../engine";

const activity: Activity = {
  id: "test_activity",
  framework: "EU_TAXONOMY_CLIMATE",
  framework_version: "Regulation_2021_2139",
  framework_source_hash: "sha256:" + "0".repeat(64),
  activity_code: "8.1",
  activity_name: "Test data processing",
  environmental_objective: "climate_change_mitigation",
  methodology_version: "v3.1",
  effective_date: "2026-04-01",
  substantial_contribution_criteria: [
    {
      id: "c1",
      criterion: "test_criterion",
      source_reference: "Annex_I_Section_8.1_paragraph_2",
      source_text: "VERBATIM_REGULATION_TEXT_FOR_PAID_TIER",
      requirement_type: "numeric_threshold",
      threshold_value: 1.5,
      threshold_operator: "less_than_or_equal",
      scoring_logic_ref: "logic.test.v1",
    },
  ],
};

const run: EngineRun = {
  run_id: "r1",
  run_timestamp: "2026-05-13T00:00:00Z",
  methodology_version: "v3.1",
  engine_commit_sha: "abc123",
  knowledge_base_hash: "sha256:" + "f".repeat(64),
  project_input: {
    project_id: "p1",
    intake_timestamp: "2026-05-13T00:00:00Z",
    facility_type: "hyperscale",
    jurisdiction: "DE",
    facility_status: "operational",
    build_completion_year: 2022,
    data_points: {},
    evidence_documents: [
      {
        document_id: "doc1",
        document_type: "audit",
        uri: "https://evidence.test/doc1",
        uploaded_at: "2025-01-01T00:00:00Z",
        sha256: "f".repeat(64),
      },
    ],
  },
  framework_results: [
    {
      framework: "EU_TAXONOMY_CLIMATE",
      framework_version: "Regulation_2021_2139",
      framework_source_hash: "sha256:" + "0".repeat(64),
      activity_id: "test_activity",
      sc_results: [
        {
          criterion_id: "c1",
          verdict: "pass",
          observed_value: 1.2,
          threshold_value: 1.5,
          threshold_operator: "less_than_or_equal",
          gap_summary: "PUE 1.2 meets the threshold.",
          evidence_refs: ["doc1"],
          scoring_logic_ref: "logic.test.v1",
          scoring_logic_version: "v1",
        },
      ],
      dnsh_results: [],
      minimum_safeguards_verdict: "pass",
      overall_verdict: "pass",
      indicative_score: 100,
    },
  ],
  gap_list: [],
};

const renderer = new ReportRenderer({
  activities: [activity],
  signatory: {
    name: "Dolapo",
    title: "Director",
    signature_block_uri: "https://sig.test/dolapo.pdf",
  },
  disclaimer: "Article 26 disclaimer.",
  engagement_reference_for: (id) => `ENG-${id}`,
  now: () => "2026-05-13T00:00:00Z",
});

describe("ReportRenderer", () => {
  test("produces ReportOutput with every required field populated", async () => {
    const out = await renderer.render(run);
    assert.equal(out.run_id, "r1");
    assert.equal(out.engagement_reference, "ENG-r1");
    assert.equal(out.methodology_version, "v3.1");
    assert.equal(out.signatory.name, "Dolapo");
    assert.equal(out.knowledge_base_hash, run.knowledge_base_hash);
    assert.equal(out.engine_commit_sha, run.engine_commit_sha);
    assert.equal(out.sections.length, 5);
    assert.deepEqual(
      out.sections.map((s) => s.section_id),
      [
        "situation",
        "frameworks_applied",
        "evidence_presented",
        "conclusions",
        "residual_disclosure",
      ],
    );
    assert.equal(out.disclaimer, "Article 26 disclaimer.");
    assert.equal(out.generated_at, "2026-05-13T00:00:00Z");
  });

  test("paid tier carries verbatim source_text in section references", async () => {
    const out = await renderer.render(run);
    const allRefs = out.sections.flatMap((s) => s.references);
    const hasVerbatim = allRefs.some(
      (r) => r.source_text_excerpt === "VERBATIM_REGULATION_TEXT_FOR_PAID_TIER",
    );
    assert.ok(hasVerbatim, "Report must include verbatim source_text — that's what's being paid for");
  });

  test("evidence_log maps documents to the criteria they supported", async () => {
    const out = await renderer.render(run);
    assert.equal(out.evidence_log.length, 1);
    assert.equal(out.evidence_log[0].document_id, "doc1");
    assert.deepEqual(out.evidence_log[0].fields_supported, ["c1"]);
  });

  test("ic_defence_pack is emitted as a versioned stub", async () => {
    const out = await renderer.render(run);
    assert.equal(out.ic_defence_pack.pack_version, "v1");
    assert.deepEqual(out.ic_defence_pack.questions, []);
  });

  test("pue_summary is undefined when no PUE measurement compliance criterion was scored", async () => {
    const out = await renderer.render(run);
    assert.equal(out.pue_summary, undefined);
  });

  test("pue_summary populates declared block from data_points and verdict block from CriterionResult", async () => {
    const pueRun: EngineRun = {
      ...run,
      project_input: {
        ...run.project_input,
        data_points: {
          pue_measurement_methodology_declared: "EN_50600_4_2",
          pue_measurement_category: "category_2",
          pue_measurement_boundary_documented: true,
          pue_reporting_basis: "annualised",
        },
      },
      framework_results: [
        {
          ...run.framework_results[0],
          methodology_results: [
            {
              criterion_id: "sc_8_1_2_pue_measurement_compliance",
              verdict: "partial",
              gap_summary: "Four of five items confirmed; audit doc stale.",
              evidence_refs: ["doc1", "doc2"],
              scoring_logic_ref: "logic.sc_8_1_2_pue_measurement_compliance.v1",
              scoring_logic_version: "v1",
              authority_level: 1,
              missing_items: ["independent_audit_within_3_years"],
            },
          ],
        },
      ],
    };
    const out = await renderer.render(pueRun);
    assert.ok(out.pue_summary, "expected pue_summary to be populated");
    assert.equal(out.pue_summary.declared.methodology, "EN_50600_4_2");
    assert.equal(out.pue_summary.declared.category, "category_2");
    assert.equal(out.pue_summary.declared.boundary_documented, true);
    assert.equal(out.pue_summary.declared.reporting_basis, "annualised");
    assert.equal(out.pue_summary.verdict.label, "partial");
    assert.equal(out.pue_summary.verdict.evidence_refs_count, 2);
    assert.deepEqual(out.pue_summary.verdict.missing_items, ["independent_audit_within_3_years"]);
    assert.equal(out.pue_summary.verdict.authority_level, 1);
  });
});
