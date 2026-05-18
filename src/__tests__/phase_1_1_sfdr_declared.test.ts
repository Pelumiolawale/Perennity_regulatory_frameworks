/**
 * Phase 1, commit 1.1 — SFDR Art 8 + Art 9 declared but not yet scored.
 *
 * Covers the Engine.run + SnapshotRenderer + filter behaviour for the
 * declarative SFDR state shipped in v0.5.0-alpha.1.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { DeterministicEngine } from "../runtime";
import { SnapshotRenderer } from "../renderers/snapshot";
import { filterCellsForSnapshot } from "../renderers/filterCells";
import { loadKnowledgeBase } from "../knowledge/load";
import { BUNDLED_ACTIVITIES } from "../index";
import {
  labelIdToSupportedLabel,
  labelIdToSupportedLabelWithWarning,
} from "../labels";
import type { AnyFramework, ProductLabelFramework } from "../framework";
import type { ProjectInput } from "../engine";

const REAL_KB = path.resolve(process.cwd(), "regulatory-knowledge");

const MINIMAL_PROJECT: ProjectInput = {
  project_id: "p_phase_1_1",
  intake_timestamp: "2026-05-18T00:00:00Z",
  facility_type: "hyperscale",
  jurisdiction: "DE",
  facility_status: "operational",
  data_points: {},
  evidence_documents: [],
};

function makeEngine() {
  return new DeterministicEngine({
    engine_commit_sha: "test_sha",
    knowledge_base_hash: "test_kb_hash",
    methodology_version: "v3.3",
    now: () => "2026-05-18T00:00:00.000Z",
    generateId: () => "test_run_phase_1_1",
  });
}

async function loadSfdrFrameworks(): Promise<{
  art8: ProductLabelFramework;
  art9: ProductLabelFramework;
}> {
  const kb = await loadKnowledgeBase({ rootDir: REAL_KB });
  const art8 = kb.frameworksById.get("sfdr_v1_article_8") as ProductLabelFramework | undefined;
  const art9 = kb.frameworksById.get("sfdr_v1_article_9") as ProductLabelFramework | undefined;
  assert.ok(art8, "SFDR Art 8 not loaded");
  assert.ok(art9, "SFDR Art 9 not loaded");
  return { art8, art9 };
}

describe("Engine.run with SFDR Art 8 framework (v0.5.0-alpha.2 — Art 8 now scored)", () => {
  test("produces 7 scored cells (no scoring_status); no Art-8-specific warning", async () => {
    const { art8 } = await loadSfdrFrameworks();
    const engine = makeEngine();
    const run = await engine.run({ project: MINIMAL_PROJECT }, [art8]);

    assert.equal(run.framework_results.length, 1);
    const fr = run.framework_results[0];
    assert.equal(fr.archetype, "product_label");
    assert.equal(fr.framework, "SFDR");
    assert.equal(fr.activity_id, "sfdr_v1_article_8");
    assert.equal(fr.sc_results.length, 7);
    // Art 8 is fully scored as of commit 1.2 — none of these results should
    // carry scoring_status="not_implemented".
    for (const r of fr.sc_results) {
      assert.notEqual(
        r.scoring_status,
        "not_implemented",
        `criterion ${r.criterion_id} should be scored, not pending`,
      );
      assert.ok(r.rationale_text, `criterion ${r.criterion_id} should carry rationale_text`);
    }

    // With MINIMAL_PROJECT carrying no SFDR inputs, criteria with required
    // entity/project data resolve to insufficient_evidence; criterion 6
    // (taxonomy_alignment_disclosure) resolves to not_applicable because no
    // Taxonomy claim is made (the absence is the signal).
    for (const r of fr.sc_results) {
      if (r.criterion_id === "sfdr_v1_taxonomy_alignment_disclosure") {
        assert.equal(r.verdict, "not_applicable");
        assert.ok(r.not_applicable_rationale);
      } else {
        assert.equal(r.verdict, "insufficient_evidence");
      }
    }

    // No warning specific to Art 8 not being implemented — that message was
    // removed in 1.2 since Art 8 now scores.
    if (run.warnings) {
      for (const w of run.warnings) {
        if (w.includes("sfdr_v1_article_8")) {
          assert.fail(
            `expected no Art 8 "not implemented" warning in commit 1.2; got: ${w}`,
          );
        }
      }
    }

    // Render through snapshot — expect 7 cells with band verdicts.
    const renderer = new SnapshotRenderer({
      disclaimer: "Article 26 disclaimer text.",
      now: () => "2026-05-18T00:00:00Z",
    });
    const snapshot = await renderer.render(run);
    const sfdrCells = snapshot.heatmap.filter((c) => c.framework === "SFDR");
    assert.equal(sfdrCells.length, 7);
    for (const c of sfdrCells) {
      assert.equal(c.archetype, "product_label");
      assert.equal(c.scoring_status, undefined);
      assert.ok(c.criterion_id?.startsWith("sfdr_v1_"));
      assert.ok(c.rationale_text);
    }

    // Gap list must NOT be filled with insufficient_evidence cells (they're
    // not actionable EU-Tax-style gaps).
    assert.equal(snapshot.gap_list.length, 0);
  });
});

describe("Engine.run with SFDR Art 9 framework (still not_implemented in 1.2)", () => {
  test("produces 11 cells — 7 scored shared + 4 still not_implemented; warning naming the framework", async () => {
    const { art9 } = await loadSfdrFrameworks();
    const engine = makeEngine();
    const run = await engine.run({ project: MINIMAL_PROJECT }, [art9]);

    assert.equal(run.framework_results.length, 1);
    const fr = run.framework_results[0];
    assert.equal(fr.sc_results.length, 11);

    // Mix: 7 shared-with-Art-8 criteria now scored; 4 Art-9-only criteria
    // still not_implemented (Phase 1 commit 1.3 implements them).
    const pending = fr.sc_results.filter((r) => r.scoring_status === "not_implemented");
    const scored = fr.sc_results.filter((r) => r.scoring_status !== "not_implemented");
    assert.equal(pending.length, 4, "Art-9-only criteria should still be not_implemented");
    assert.equal(scored.length, 7, "shared criteria should be scored under 1.2");

    assert.ok(run.warnings && run.warnings.length > 0);
    const art9Warning = run.warnings.find((w) => w.includes("sfdr_v1_article_9"));
    assert.ok(art9Warning, "expected a warning naming the Art 9 framework");
    assert.match(art9Warning!, /commit 1\.3/);

    const renderer = new SnapshotRenderer({
      disclaimer: "Article 26 disclaimer text.",
      now: () => "2026-05-18T00:00:00Z",
    });
    const snapshot = await renderer.render(run);
    const sfdrCells = snapshot.heatmap.filter((c) => c.framework === "SFDR");
    assert.equal(sfdrCells.length, 11);

    // The 90% floor criterion must surface as a distinct cell with its id,
    // and remain not_implemented at commit 1.2.
    const floor = sfdrCells.find(
      (c) => c.criterion_id === "sfdr_v1_sustainable_investment_floor",
    );
    assert.ok(floor, "sustainable_investment_floor cell must surface in Art 9 snapshot");
    assert.equal(floor.scoring_status, "not_implemented");
  });
});

describe("Engine.run with EU 8.1 + SFDR Art 8 together", () => {
  test("EU 8.1 scores normally; SFDR Art 8 cells render with scored bands", async () => {
    const { art8 } = await loadSfdrFrameworks();
    const engine = makeEngine();
    const frameworks: AnyFramework[] = [...BUNDLED_ACTIVITIES, art8];
    const run = await engine.run({ project: MINIMAL_PROJECT }, frameworks);

    // EU 8.1 + SFDR Art 8 — both surface in framework_results.
    assert.equal(run.framework_results.length, 2);
    const euResult = run.framework_results.find(
      (r) => r.framework === "EU_TAXONOMY_CLIMATE",
    );
    const sfdrResult = run.framework_results.find((r) => r.framework === "SFDR");
    assert.ok(euResult);
    assert.ok(sfdrResult);
    assert.equal(euResult.archetype, undefined); // unchanged for activity-aligned
    assert.equal(sfdrResult.archetype, "product_label");

    // Art 8 is fully scored — no Art-8-specific "not implemented" warning.
    if (run.warnings) {
      const art8warn = run.warnings.find((w) => w.includes("sfdr_v1_article_8"));
      assert.equal(art8warn, undefined, "no Art 8 not-implemented warning expected in 1.2");
    }

    // Render: heatmap has 1 EU cell (aggregate) + 7 SFDR cells + minimum_safeguards.
    const renderer = new SnapshotRenderer({
      disclaimer: "Article 26 disclaimer text.",
      now: () => "2026-05-18T00:00:00Z",
    });
    const snapshot = await renderer.render(run);
    const euCells = snapshot.heatmap.filter(
      (c) => c.framework === "EU_TAXONOMY_CLIMATE",
    );
    const sfdrCells = snapshot.heatmap.filter((c) => c.framework === "SFDR");
    const safeguardsCells = snapshot.heatmap.filter(
      (c) => c.framework === "minimum_safeguards",
    );
    assert.equal(euCells.length, 1);
    assert.equal(sfdrCells.length, 7);
    assert.equal(safeguardsCells.length, 1);
  });
});

describe("filterCellsForSnapshot — SFDR not_implemented cells", () => {
  test("under sfdr_v1_article_8, keeps all 7 SFDR cells, no warnings emitted", async () => {
    const { art8 } = await loadSfdrFrameworks();
    const engine = makeEngine();
    const run = await engine.run({ project: MINIMAL_PROJECT }, [art8]);
    const renderer = new SnapshotRenderer({
      disclaimer: "Article 26 disclaimer text.",
      now: () => "2026-05-18T00:00:00Z",
    });
    const snapshot = await renderer.render(run);

    const result = filterCellsForSnapshot(snapshot.heatmap, "sfdr_v1_article_8");
    assert.equal(result.cells.length, 7);
    assert.deepEqual(result.warnings, []);
    // Commit 1.2: Art 8 cells now carry band verdicts, not scoring_status.
    for (const c of result.cells) {
      assert.equal(c.scoring_status, undefined);
      assert.ok(c.rationale_text);
    }
  });

  test("under eu_taxonomy_8_1, SFDR not_implemented cells are dropped (label scope)", async () => {
    const { art8 } = await loadSfdrFrameworks();
    const engine = makeEngine();
    const frameworks: AnyFramework[] = [...BUNDLED_ACTIVITIES, art8];
    const run = await engine.run({ project: MINIMAL_PROJECT }, frameworks);
    const renderer = new SnapshotRenderer({
      disclaimer: "Article 26 disclaimer text.",
      now: () => "2026-05-18T00:00:00Z",
    });
    const snapshot = await renderer.render(run);

    const result = filterCellsForSnapshot(snapshot.heatmap, "eu_taxonomy_8_1");
    assert.ok(
      !result.cells.some((c) => c.framework === "SFDR"),
      "SFDR cells must be dropped under eu_taxonomy_8_1 label",
    );
    assert.deepEqual(result.warnings, [], "not_implemented cells must not warn");
  });
});

describe("labelIdToSupportedLabel", () => {
  test("maps known SFDR label_ids to versioned SupportedLabel", () => {
    assert.equal(labelIdToSupportedLabel("sfdr_article_8"), "sfdr_v1_article_8");
    assert.equal(labelIdToSupportedLabel("sfdr_article_9"), "sfdr_v1_article_9");
  });

  test("maps unchanged labels (EU Tax, UK SDR) to themselves", () => {
    assert.equal(labelIdToSupportedLabel("eu_taxonomy_8_1"), "eu_taxonomy_8_1");
    assert.equal(labelIdToSupportedLabel("uk_sdr_focus"), "uk_sdr_focus");
  });

  test("returns null for unknown label_id", () => {
    assert.equal(labelIdToSupportedLabel("not_a_label"), null);
  });

  test("withWarning surfaces structured warning for unknowns", () => {
    const r = labelIdToSupportedLabelWithWarning("not_a_label");
    assert.equal(r.label, null);
    assert.ok(r.warning);
    assert.match(r.warning!, /not_a_label/);
  });

  test("withWarning returns clean result for known label_id", () => {
    const r = labelIdToSupportedLabelWithWarning("sfdr_article_8");
    assert.equal(r.label, "sfdr_v1_article_8");
    assert.equal(r.warning, undefined);
  });
});
