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

describe("Engine.run with SFDR Art 8 framework", () => {
  test("produces 7 not_implemented cells (via snapshot) + warning, does not throw", async () => {
    const { art8 } = await loadSfdrFrameworks();
    const engine = makeEngine();
    const run = await engine.run({ project: MINIMAL_PROJECT }, [art8]);

    assert.equal(run.framework_results.length, 1);
    const fr = run.framework_results[0];
    assert.equal(fr.archetype, "product_label");
    assert.equal(fr.framework, "SFDR");
    assert.equal(fr.activity_id, "sfdr_v1_article_8");
    assert.equal(fr.sc_results.length, 7);
    for (const r of fr.sc_results) {
      assert.equal(r.scoring_status, "not_implemented");
      assert.equal(r.verdict, "data_missing");
    }

    assert.ok(run.warnings && run.warnings.length > 0);
    assert.match(run.warnings[0], /sfdr_v1_article_8/);
    assert.match(run.warnings[0], /not yet implemented/i);

    // Render through snapshot — expect 7 cells, all carrying scoring_status
    // and criterion_id.
    const renderer = new SnapshotRenderer({
      disclaimer: "Article 26 disclaimer text.",
      now: () => "2026-05-18T00:00:00Z",
    });
    const snapshot = await renderer.render(run);
    const sfdrCells = snapshot.heatmap.filter((c) => c.framework === "SFDR");
    assert.equal(sfdrCells.length, 7);
    for (const c of sfdrCells) {
      assert.equal(c.archetype, "product_label");
      assert.equal(c.scoring_status, "not_implemented");
      assert.ok(c.criterion_id?.startsWith("sfdr_v1_"));
    }

    // Gap list must NOT be filled with non-actionable not_implemented entries.
    assert.equal(snapshot.gap_list.length, 0);
  });
});

describe("Engine.run with SFDR Art 9 framework", () => {
  test("produces 11 not_implemented cells (via snapshot) + warning", async () => {
    const { art9 } = await loadSfdrFrameworks();
    const engine = makeEngine();
    const run = await engine.run({ project: MINIMAL_PROJECT }, [art9]);

    assert.equal(run.framework_results.length, 1);
    assert.equal(run.framework_results[0].sc_results.length, 11);

    assert.ok(run.warnings && run.warnings.length > 0);
    assert.match(run.warnings[0], /sfdr_v1_article_9/);

    const renderer = new SnapshotRenderer({
      disclaimer: "Article 26 disclaimer text.",
      now: () => "2026-05-18T00:00:00Z",
    });
    const snapshot = await renderer.render(run);
    const sfdrCells = snapshot.heatmap.filter((c) => c.framework === "SFDR");
    assert.equal(sfdrCells.length, 11);

    // The 90% floor criterion must surface as a distinct cell with its id.
    const floor = sfdrCells.find(
      (c) => c.criterion_id === "sfdr_v1_sustainable_investment_floor",
    );
    assert.ok(floor, "sustainable_investment_floor cell must surface in Art 9 snapshot");
  });
});

describe("Engine.run with EU 8.1 + SFDR Art 8 together", () => {
  test("EU 8.1 scores normally; SFDR cells render as not_implemented", async () => {
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

    // The runtime should have produced a warning naming the SFDR framework.
    assert.ok(run.warnings && run.warnings.length > 0);

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
    for (const c of result.cells) {
      assert.equal(c.scoring_status, "not_implemented");
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
