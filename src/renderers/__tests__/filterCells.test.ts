/**
 * filterCellsForSnapshot — single-label discipline (Phase 1, commit 1.0)
 *
 * Regression test for the post-engine-run filter that enforces single-label
 * scope on free-tier snapshot output. Covers:
 *   - EU Taxonomy label keeps activity_aligned + minimum_safeguards
 *   - SFDR labels keep only product_label cells from SFDR framework
 *   - UK SDR labels keep only product_label cells from UK_SDR framework
 *   - minimum_safeguards is dropped for SFDR / UK SDR
 *   - cells with no archetype and framework !== "minimum_safeguards" are
 *     dropped with a structured warning
 *   - empty input returns empty output, no warnings
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { filterCellsForSnapshot } from "../filterCells";
import type { SupportedLabel } from "../filterCells";
import type { HeatmapCell } from "../../engine";

function euTaxCell(verdict: HeatmapCell["verdict"] = "pass"): HeatmapCell {
  return {
    framework: "EU_TAXONOMY_CLIMATE",
    verdict,
    archetype: "activity_aligned",
  };
}

function sfdrCell(verdict: HeatmapCell["verdict"] = "pass"): HeatmapCell {
  return {
    framework: "SFDR",
    verdict,
    archetype: "product_label",
  };
}

function ukSdrCell(verdict: HeatmapCell["verdict"] = "pass"): HeatmapCell {
  return {
    framework: "UK_SDR",
    verdict,
    archetype: "product_label",
  };
}

function safeguardsCell(): HeatmapCell {
  return {
    framework: "minimum_safeguards",
    verdict: "partial",
    pillar_verdicts: [
      { pillar_id: "human_rights", verdict: "pass" },
      { pillar_id: "bribery_corruption", verdict: "pass" },
      { pillar_id: "taxation", verdict: "data_missing" },
      { pillar_id: "fair_competition", verdict: "pass" },
    ],
  };
}

describe("filterCellsForSnapshot — single-label discipline", () => {
  test("targetLabel=eu_taxonomy_8_1 keeps EU-Tax cells + minimum_safeguards", () => {
    const cells: HeatmapCell[] = [
      euTaxCell("pass"),
      sfdrCell("partial"),
      safeguardsCell(),
    ];

    const result = filterCellsForSnapshot(cells, "eu_taxonomy_8_1");

    assert.equal(result.cells.length, 2);
    assert.equal(result.warnings.length, 0);
    assert.ok(
      result.cells.some(
        (c) => c.framework === "EU_TAXONOMY_CLIMATE" && c.archetype === "activity_aligned",
      ),
    );
    assert.ok(result.cells.some((c) => c.framework === "minimum_safeguards"));
    assert.ok(
      !result.cells.some((c) => c.framework === "SFDR"),
      "SFDR cell must not survive under eu_taxonomy_8_1",
    );
  });

  test("targetLabel=sfdr_article_8 keeps only SFDR cells, drops minimum_safeguards", () => {
    const cells: HeatmapCell[] = [
      euTaxCell("pass"),
      sfdrCell("partial"),
      ukSdrCell("pass"),
      safeguardsCell(),
    ];

    const result = filterCellsForSnapshot(cells, "sfdr_article_8");

    assert.equal(result.cells.length, 1);
    assert.equal(result.warnings.length, 0);
    assert.equal(result.cells[0].framework, "SFDR");
    assert.equal(result.cells[0].archetype, "product_label");
    assert.ok(
      !result.cells.some((c) => c.framework === "minimum_safeguards"),
      "minimum_safeguards must be dropped under SFDR label",
    );
    assert.ok(
      !result.cells.some((c) => c.framework === "EU_TAXONOMY_CLIMATE"),
      "EU Tax cell must not survive under SFDR label",
    );
    assert.ok(
      !result.cells.some((c) => c.framework === "UK_SDR"),
      "UK SDR cell must not survive under SFDR label",
    );
  });

  test("targetLabel=sfdr_article_9 behaves like sfdr_article_8 (no minimum_safeguards)", () => {
    const result = filterCellsForSnapshot(
      [sfdrCell("pass"), safeguardsCell()],
      "sfdr_article_9",
    );
    assert.equal(result.cells.length, 1);
    assert.equal(result.cells[0].framework, "SFDR");
  });

  test("UK SDR labels keep only UK_SDR product_label cells, drop minimum_safeguards", () => {
    const ukLabels: SupportedLabel[] = [
      "uk_sdr_focus",
      "uk_sdr_improvers",
      "uk_sdr_impact",
      "uk_sdr_mixed_goals",
    ];

    for (const label of ukLabels) {
      const result = filterCellsForSnapshot(
        [euTaxCell(), sfdrCell(), ukSdrCell(), safeguardsCell()],
        label,
      );
      assert.equal(result.cells.length, 1, `${label}: expected one cell`);
      assert.equal(result.cells[0].framework, "UK_SDR", `${label}: framework`);
      assert.equal(result.warnings.length, 0, `${label}: no warnings`);
    }
  });

  test("cell with no archetype and framework !== 'minimum_safeguards' is dropped with a warning", () => {
    const unknown: HeatmapCell = {
      framework: "EU_TAXONOMY_CLIMATE",
      verdict: "pass",
    };

    const result = filterCellsForSnapshot([unknown], "eu_taxonomy_8_1");

    assert.equal(result.cells.length, 0);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /no archetype/);
    assert.match(result.warnings[0], /EU_TAXONOMY_CLIMATE/);
  });

  test("warnings are emitted regardless of target label, not silenced for non-matching labels", () => {
    const unknown: HeatmapCell = {
      framework: "EU_TAXONOMY_ENVIRONMENTAL",
      verdict: "fail",
    };

    const result = filterCellsForSnapshot([unknown], "sfdr_article_8");

    assert.equal(result.cells.length, 0);
    assert.equal(result.warnings.length, 1);
  });

  test("empty input returns empty output, no warnings", () => {
    const result = filterCellsForSnapshot([], "eu_taxonomy_8_1");
    assert.deepEqual(result.cells, []);
    assert.deepEqual(result.warnings, []);
  });

  test("filter is pure: input array is not mutated", () => {
    const input: HeatmapCell[] = [euTaxCell(), sfdrCell(), safeguardsCell()];
    const snapshot = JSON.parse(JSON.stringify(input));
    filterCellsForSnapshot(input, "sfdr_article_8");
    assert.deepEqual(input, snapshot);
  });
});
