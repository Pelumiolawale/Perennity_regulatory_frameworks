import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { DeterministicEngine } from "../runtime";
import { SnapshotRenderer } from "../renderers/snapshot";
import { BUNDLED_ACTIVITIES } from "../index";
import type {
  CriterionResult,
  EngineRun,
  FrameworkResult,
  GapItem,
  ProjectInput,
} from "../engine";
import type {
  AnyFramework,
  ProductLabelFramework,
} from "../framework";

const MINIMAL_PROJECT: ProjectInput = {
  project_id: "p_phase_0_3",
  intake_timestamp: "2026-05-18T00:00:00Z",
  facility_type: "hyperscale",
  jurisdiction: "DE",
  facility_status: "operational",
  data_points: {},
  evidence_documents: [],
};

describe("phase 0/0.3 — non-activity frameworks emit a warning and are skipped", () => {
  test("product_label framework is skipped with a warning; activity_aligned still scores", async () => {
    const engine = new DeterministicEngine({
      engine_commit_sha: "test_sha",
      knowledge_base_hash: "test_kb_hash",
      methodology_version: "v3.2",
      now: () => "2026-05-18T00:00:00.000Z",
      generateId: () => "test_run_phase_0_3",
    });

    const productLabelFw: ProductLabelFramework = {
      archetype: "product_label",
      id: "sfdr_test_warn",
      framework: "SFDR",
      framework_version: "v1",
      framework_source_hash: "sha256:" + "0".repeat(64),
      methodology_version: "v3.2",
      effective_date: "2026-05-18",
      label_id: "sfdr_article_8",
      label_family: "sfdr",
      eligibility_criteria: [],
    };

    // Mixed-archetype frameworks list. RunInput / AnyFramework[] overload.
    const frameworks: AnyFramework[] = [...BUNDLED_ACTIVITIES, productLabelFw];
    const run = await engine.run({ project: MINIMAL_PROJECT }, frameworks);

    // Activity-aligned framework still scored (EU 8.1).
    assert.equal(
      run.framework_results.length,
      BUNDLED_ACTIVITIES.length,
      "expected only activity_aligned frameworks in framework_results",
    );
    assert.equal(run.framework_results[0].framework, "EU_TAXONOMY_CLIMATE");

    // Warning emitted naming the skipped framework and its archetype.
    assert.ok(run.warnings && run.warnings.length > 0, "expected warnings array to be populated");
    const warning = run.warnings[0];
    assert.match(warning, /sfdr_test_warn/);
    assert.match(warning, /archetype="product_label"/);
    assert.match(warning, /skipped/i);
  });

  test("warnings is omitted when all frameworks are activity_aligned", async () => {
    const engine = new DeterministicEngine({
      engine_commit_sha: "test_sha",
      knowledge_base_hash: "test_kb_hash",
      methodology_version: "v3.2",
    });
    const run = await engine.run(MINIMAL_PROJECT, BUNDLED_ACTIVITIES);
    // No non-activity frameworks → no warnings field on EngineRun.
    assert.equal(run.warnings, undefined);
  });
});

describe("phase 0/0.3 — adding HeatmapCell.archetype does not loosen the snapshot gate", () => {
  test("archetype is populated on framework cells, absent on safeguards cell, and no investor-grade content leaks", async () => {
    const renderer = new SnapshotRenderer({
      disclaimer: "Article 26 disclaimer text.",
      now: () => "2026-05-18T00:00:00Z",
    });

    // Construct a synthetic EngineRun with both an archetype-bearing
    // framework cell AND magic markers in places the gate should strip.
    // The markers are the same disallowed-content forms the existing
    // structural gate test uses — this assertion proves that adding
    // archetype didn't loosen the per-cell allowlist or open a new
    // leakage path.
    const MAGIC_THRESHOLD = 9999999.999;
    const MAGIC_SOURCE = "MAGIC_SOURCE_PHASE_0_3_DO_NOT_LEAK_8f1a";
    const leakyCriterion = (id: string): CriterionResult => ({
      criterion_id: id,
      verdict: "fail",
      observed_value: MAGIC_SOURCE,
      threshold_value: MAGIC_THRESHOLD,
      gap_summary: `synthetic — ${MAGIC_SOURCE}, threshold ${MAGIC_THRESHOLD}`,
      evidence_refs: [],
      scoring_logic_ref: "logic.test.v1",
      scoring_logic_version: "v1",
    });
    const fr: FrameworkResult = {
      framework: "EU_TAXONOMY_CLIMATE",
      framework_version: "v1",
      framework_source_hash: "sha256:" + "0".repeat(64),
      activity_id: "test_activity",
      sc_results: [leakyCriterion("sc_8_1_1_ecocc")],
      dnsh_results: [leakyCriterion("dnsh_8_1_adaptation")],
      minimum_safeguards_verdict: "data_missing",
      overall_verdict: "fail",
      indicative_score: 0,
    };
    const gap_list: GapItem[] = [
      {
        gap_id: "test_activity.sc_8_1_1_ecocc",
        framework: "EU_TAXONOMY_CLIMATE",
        criterion_id: "sc_8_1_1_ecocc",
        severity: "critical",
        ic_voice_description: `ic-voice ${MAGIC_SOURCE}`,
        remediation_summary: `remediation ${MAGIC_SOURCE}`,
      },
    ];
    const run: EngineRun = {
      run_id: "run-phase-0-3-gate",
      run_timestamp: "2026-05-18T00:00:00Z",
      methodology_version: "v3.2",
      engine_commit_sha: "test_sha",
      knowledge_base_hash: "test_kb_hash",
      project_input: MINIMAL_PROJECT,
      framework_results: [fr],
      gap_list,
    };

    const snapshot = await renderer.render(run);

    // Archetype is populated on framework cells.
    const frameworkCells = snapshot.heatmap.filter((c) => c.framework !== "minimum_safeguards");
    assert.ok(frameworkCells.length > 0, "expected at least one framework cell");
    for (const cell of frameworkCells) {
      assert.equal(
        cell.archetype,
        "activity_aligned",
        `framework cell ${cell.framework} should declare archetype=activity_aligned`,
      );
    }

    // Archetype is NOT set on the minimum_safeguards cell — that cell is a
    // cross-cutting pillar summary, not a framework instance.
    const safeguardsCell = snapshot.heatmap.find((c) => c.framework === "minimum_safeguards");
    if (safeguardsCell) {
      assert.equal(
        safeguardsCell.archetype,
        undefined,
        "minimum_safeguards cell must not carry an archetype",
      );
    }

    // No investor-grade content leaks despite the new field.
    const serialized = JSON.stringify(snapshot);
    assert.ok(
      !serialized.includes(MAGIC_SOURCE),
      `GATE LEAK (regression after archetype addition): MAGIC_SOURCE appears in output\n${serialized}`,
    );
    assert.ok(
      !serialized.includes(String(MAGIC_THRESHOLD)),
      `GATE LEAK (regression after archetype addition): MAGIC_THRESHOLD appears in output\n${serialized}`,
    );
  });
});
