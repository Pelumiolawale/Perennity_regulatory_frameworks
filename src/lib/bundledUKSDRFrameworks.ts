// ============================================================================
// BUNDLED_UK_SDR_FRAMEWORKS — browser-safe UK SDR framework bundle
// (v0.6.0 — Phase 2, UK SDR implementation)
// ============================================================================
//
// Static-import bundle of the three UK SDR product_label framework JSONs with
// their criterion refs eagerly resolved against BUNDLED_SFDR_CRITERIA (the
// historical single runtime criterion library — now carries SFDR + UK SDR).
// Consumers (chiefly the SPA's paid Report flow) import a fully-resolved
// object graph and pass it straight to Engine.run; no async I/O.
//
// Browser-safety
//   Every import resolves to JSON or a pure TypeScript constant. No node:*
//   modules pulled in transitively.
//
// Relationship to existing exports
//   - BUNDLED_ACTIVITIES (src/index.ts): activity_aligned frameworks only
//     (EU Tax 8.1). Hash-stable; do not modify.
//   - BUNDLED_SFDR_FRAMEWORKS (src/lib/bundledSFDRFrameworks.ts): two-entry
//     bundle of SFDR Art 8 + Art 9.
//   - BUNDLED_UK_SDR_FRAMEWORKS (this file): three-entry bundle of UK SDR
//     Focus, Improvers, Impact. Same `framework + criteria + methodology_version`
//     per-entry shape as BUNDLED_SFDR_FRAMEWORKS.
// ============================================================================

import type { ProductLabelFramework } from "../framework";
import type { SharedCriterion } from "../knowledge/criterion-library";
import { BUNDLED_SFDR_CRITERIA } from "../sfdr/bundled";
import { METHODOLOGY_VERSION } from "./methodologyVersion";

import focusJSON from "../../regulatory-knowledge/frameworks/uk-sdr/v1/focus.json";
import improversJSON from "../../regulatory-knowledge/frameworks/uk-sdr/v1/improvers.json";
import impactJSON from "../../regulatory-knowledge/frameworks/uk-sdr/v1/impact.json";

export interface BundledUKSDRFramework {
  // The framework JSON itself — directly passable to Engine.run. Criterion
  // refs remain intact; the runtime's scoreProductLabel path resolves them
  // via BUNDLED_SFDR_CRITERIA exactly as for SFDR frameworks.
  framework: ProductLabelFramework;
  // Eagerly resolved criteria, keyed by criterion_id, for downstream
  // consumers that want O(1) lookup without walking the framework's
  // `criteria` array.
  criteria: Record<string, SharedCriterion>;
  methodology_version: string;
}

function resolveCriteria(
  framework: ProductLabelFramework,
): Record<string, SharedCriterion> {
  const refs = framework.criteria ?? [];
  const out: Record<string, SharedCriterion> = {};
  for (const ref of refs) {
    const resolved = BUNDLED_SFDR_CRITERIA.get(ref.ref);
    if (!resolved) {
      throw new Error(
        `BUNDLED_UK_SDR_FRAMEWORKS: framework "${framework.id}" references ` +
          `unknown criterion_id "${ref.ref}". Known criteria: ` +
          `${[...BUNDLED_SFDR_CRITERIA.keys()].sort().join(", ")}.`,
      );
    }
    out[ref.ref] = resolved;
  }
  return out;
}

const focusFramework = focusJSON as unknown as ProductLabelFramework;
const improversFramework = improversJSON as unknown as ProductLabelFramework;
const impactFramework = impactJSON as unknown as ProductLabelFramework;

export const BUNDLED_UK_SDR_FRAMEWORKS: {
  readonly uk_sdr_focus: BundledUKSDRFramework;
  readonly uk_sdr_improvers: BundledUKSDRFramework;
  readonly uk_sdr_impact: BundledUKSDRFramework;
} = Object.freeze({
  uk_sdr_focus: Object.freeze({
    framework: focusFramework,
    criteria: resolveCriteria(focusFramework),
    methodology_version: METHODOLOGY_VERSION,
  }),
  uk_sdr_improvers: Object.freeze({
    framework: improversFramework,
    criteria: resolveCriteria(improversFramework),
    methodology_version: METHODOLOGY_VERSION,
  }),
  uk_sdr_impact: Object.freeze({
    framework: impactFramework,
    criteria: resolveCriteria(impactFramework),
    methodology_version: METHODOLOGY_VERSION,
  }),
});
