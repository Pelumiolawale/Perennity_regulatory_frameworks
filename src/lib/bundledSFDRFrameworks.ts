// ============================================================================
// BUNDLED_SFDR_FRAMEWORKS — browser-safe SFDR framework bundle
// (v0.5.0-alpha.7 — Phase 1, commit 1.5a)
// ============================================================================
//
// Static-import bundle of the two SFDR product_label framework JSONs with
// their criterion refs eagerly resolved against BUNDLED_SFDR_CRITERIA.
// Consumers (chiefly the SPA's paid Report flow) import a fully-resolved
// object graph and pass it straight to Engine.run; no async I/O, no
// criterion-ref dereferencing required in-browser.
//
// Browser-safety
//   Every import in this file resolves to JSON or to a pure TypeScript
//   constant. No `node:*` modules are pulled in transitively from this
//   module's reachable set. The SPA can import BUNDLED_SFDR_FRAMEWORKS
//   without Vite's `node:fs has been externalized` warnings firing on
//   this specific import path.
//
// Relationship to existing exports
//   - BUNDLED_ACTIVITIES (src/index.ts): activity_aligned frameworks only
//     (EU Tax 8.1 today). Hash-stable; do not modify.
//   - BUNDLED_SFDR_CRITERIA (src/sfdr/bundled.ts): Map<criterion_id,
//     SharedCriterion> used by the engine at runtime to resolve refs.
//     This file consumes that map for eager resolution.
//   - BUNDLED_SFDR_FRAMEWORKS (this file): two-entry object keyed by
//     framework id, with `framework` (the JSON, refs intact for
//     Engine.run consumption) and `criteria` (the resolved record for
//     downstream consumers that iterate by id).
//
// Methodology version stamp
//   The framework JSONs at regulatory-knowledge/frameworks/sfdr/v1/
//   currently carry methodology_version "v3.3" (Art 8) and "v3.4"
//   (Art 9) — both stale relative to the v3.5 engine constant. The
//   bundled stamp reads from METHODOLOGY_VERSION so downstream
//   consumers see v3.5 even before the JSON cleanup commit (1.4.1) lands.
// ============================================================================

import type { ProductLabelFramework } from "../framework";
import type { SharedCriterion } from "../knowledge/criterion-library";
import { BUNDLED_SFDR_CRITERIA } from "../sfdr/bundled";
import { METHODOLOGY_VERSION } from "./methodologyVersion";

import art8JSON from "../../regulatory-knowledge/frameworks/sfdr/v1/art-8.json";
import art9JSON from "../../regulatory-knowledge/frameworks/sfdr/v1/art-9.json";

export interface BundledSFDRFramework {
  // The framework JSON itself — directly passable to Engine.run.
  // Criterion refs remain intact; the runtime's scoreProductLabel path
  // resolves them via BUNDLED_SFDR_CRITERIA exactly as it does today.
  framework: ProductLabelFramework;
  // Eagerly resolved criteria, keyed by criterion_id, for downstream
  // consumers (e.g. the SPA PDF renderer) that want O(1) lookup without
  // walking the framework's `criteria` array.
  criteria: Record<string, SharedCriterion>;
  // Reads from METHODOLOGY_VERSION rather than from the framework JSON,
  // which currently carries a stale per-framework v3.3 / v3.4 stamp.
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
        `BUNDLED_SFDR_FRAMEWORKS: framework "${framework.id}" references ` +
          `unknown criterion_id "${ref.ref}". Known criteria: ` +
          `${[...BUNDLED_SFDR_CRITERIA.keys()].sort().join(", ")}.`,
      );
    }
    out[ref.ref] = resolved;
  }
  return out;
}

const art8Framework = art8JSON as unknown as ProductLabelFramework;
const art9Framework = art9JSON as unknown as ProductLabelFramework;

export const BUNDLED_SFDR_FRAMEWORKS: {
  readonly sfdr_v1_article_8: BundledSFDRFramework;
  readonly sfdr_v1_article_9: BundledSFDRFramework;
} = Object.freeze({
  sfdr_v1_article_8: Object.freeze({
    framework: art8Framework,
    criteria: resolveCriteria(art8Framework),
    methodology_version: METHODOLOGY_VERSION,
  }),
  sfdr_v1_article_9: Object.freeze({
    framework: art9Framework,
    criteria: resolveCriteria(art9Framework),
    methodology_version: METHODOLOGY_VERSION,
  }),
});
