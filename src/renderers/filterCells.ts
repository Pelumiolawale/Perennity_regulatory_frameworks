// ============================================================================
// filterCellsForSnapshot — single-label discipline (Phase 1, commit 1.0)
// ============================================================================
//
// Pure post-engine-run filter that narrows a HeatmapCell[] to the user's
// single selected target label before snapshot rendering. The engine still
// scores every applicable framework; this filter is where free-tier
// label-scope enforcement happens.
//
// Today (v0.4.1) the engine only emits cells for EU Taxonomy 8.1 plus the
// minimum_safeguards rollup, so the filter is effectively a no-op under
// targetLabel = "eu_taxonomy_8_1". The structural defence is in place ahead
// of SFDR cells flowing through in Phase 1.1+.
//
// Paid PDF deliberately does NOT call this filter — comparative output across
// labels is the paid deliverable's job (commit 1.4 makes that explicit).
// ============================================================================

import type { Framework, HeatmapCell } from "../engine";

// The seven user-selectable target labels, one per framework / sub-label.
// Phase 0 set up the three framework archetypes (activity_aligned,
// product_label, issuance_framework); the labels here are the user-facing
// projection of that taxonomy across EU Taxonomy and the two product-label
// families.
//
// NOTE (introduced v0.4.1): this type did not exist in v0.4.0. It was
// expected from Phase 0 per the framework archetype split but never landed.
// Adding it here rather than silently inlining the string literals.
export type SupportedLabel =
  | "eu_taxonomy_8_1"
  | "sfdr_article_8"
  | "sfdr_article_9"
  | "uk_sdr_focus"
  | "uk_sdr_improvers"
  | "uk_sdr_impact"
  | "uk_sdr_mixed_goals";

export interface FilterCellsResult {
  cells: HeatmapCell[];
  warnings: string[];
}

const EU_TAX_LABELS: ReadonlySet<SupportedLabel> = new Set<SupportedLabel>([
  "eu_taxonomy_8_1",
]);

const SFDR_LABELS: ReadonlySet<SupportedLabel> = new Set<SupportedLabel>([
  "sfdr_article_8",
  "sfdr_article_9",
]);

const UK_SDR_LABELS: ReadonlySet<SupportedLabel> = new Set<SupportedLabel>([
  "uk_sdr_focus",
  "uk_sdr_improvers",
  "uk_sdr_impact",
  "uk_sdr_mixed_goals",
]);

const EU_TAX_FRAMEWORKS: ReadonlySet<Framework> = new Set<Framework>([
  "EU_TAXONOMY_CLIMATE",
  "EU_TAXONOMY_ENVIRONMENTAL",
]);

const SFDR_FRAMEWORKS: ReadonlySet<Framework> = new Set<Framework>(["SFDR"]);

const UK_SDR_FRAMEWORKS: ReadonlySet<Framework> = new Set<Framework>(["UK_SDR"]);

export function filterCellsForSnapshot(
  cells: HeatmapCell[],
  targetLabel: SupportedLabel,
): FilterCellsResult {
  const out: HeatmapCell[] = [];
  const warnings: string[] = [];

  for (const cell of cells) {
    // minimum_safeguards is an EU Taxonomy concept (Article 18 of Regulation
    // 2020/852). It carries no archetype because it is a cross-cutting pillar
    // summary, not a framework instance. Scoped to EU Taxonomy labels only;
    // dropped for SFDR / UK SDR. Re-evaluate when ICMA GBP lands (the GBP
    // "alignment with Green Bond Principles" concept is structurally separate).
    if (cell.framework === "minimum_safeguards") {
      if (EU_TAX_LABELS.has(targetLabel)) {
        out.push(cell);
      }
      continue;
    }

    // Strict on unknown cells: any cell without an archetype that is not the
    // typed minimum_safeguards discriminator is dropped and a warning is
    // emitted. This catches future regressions where a framework cell is
    // produced without the discriminator being populated.
    if (cell.archetype === undefined) {
      warnings.push(
        `filterCellsForSnapshot: dropped cell with no archetype (framework=${cell.framework}); only "minimum_safeguards" may omit archetype`,
      );
      continue;
    }

    if (EU_TAX_LABELS.has(targetLabel)) {
      if (
        cell.archetype === "activity_aligned" &&
        EU_TAX_FRAMEWORKS.has(cell.framework)
      ) {
        out.push(cell);
      }
      continue;
    }

    if (SFDR_LABELS.has(targetLabel)) {
      if (
        cell.archetype === "product_label" &&
        SFDR_FRAMEWORKS.has(cell.framework)
      ) {
        out.push(cell);
      }
      continue;
    }

    if (UK_SDR_LABELS.has(targetLabel)) {
      if (
        cell.archetype === "product_label" &&
        UK_SDR_FRAMEWORKS.has(cell.framework)
      ) {
        out.push(cell);
      }
      continue;
    }
  }

  return { cells: out, warnings };
}
