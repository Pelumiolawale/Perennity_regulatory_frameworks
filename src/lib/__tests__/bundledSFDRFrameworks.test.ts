/**
 * BUNDLED_SFDR_FRAMEWORKS tests (Phase 1, commit 1.5a — `v0.5.0-alpha.7`).
 *
 * Locks the contract the SPA depends on:
 *   - Both SFDR product_label frameworks present, with the correct
 *     criterion counts (Art 8 = 7, Art 9 = 10).
 *   - All criterion refs eagerly resolved (no `{ref, weight}` placeholders
 *     in the `criteria` record — that record is downstream-consumer-ready).
 *   - methodology_version reads from METHODOLOGY_VERSION (v3.5) rather
 *     than from the per-framework JSON stamps (still v3.3 / v3.4).
 *   - Browser-safety: this module's source has no `node:*` or fast-glob
 *     imports, transitively or directly. SPA can bundle it without
 *     Vite's externalisation warnings firing on this specific path.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { BUNDLED_SFDR_FRAMEWORKS } from "../bundledSFDRFrameworks";
import { METHODOLOGY_VERSION } from "../methodologyVersion";

describe("BUNDLED_SFDR_FRAMEWORKS — structural invariants", () => {
  test("exports exactly two entries: sfdr_v1_article_8 and sfdr_v1_article_9", () => {
    const keys = Object.keys(BUNDLED_SFDR_FRAMEWORKS).sort();
    assert.deepEqual(keys, ["sfdr_v1_article_8", "sfdr_v1_article_9"]);
  });

  test("Art 8 framework references 7 criteria (the SFDR Art 8 baseline)", () => {
    const entry = BUNDLED_SFDR_FRAMEWORKS.sfdr_v1_article_8;
    assert.equal(entry.framework.criteria?.length, 7);
    assert.equal(Object.keys(entry.criteria).length, 7);
  });

  test("Art 9 framework references 10 criteria (7 Art 8 baseline + 3 Art-9-specific)", () => {
    const entry = BUNDLED_SFDR_FRAMEWORKS.sfdr_v1_article_9;
    assert.equal(entry.framework.criteria?.length, 10);
    assert.equal(Object.keys(entry.criteria).length, 10);
    // The 3 Art-9-specific criteria must all be present
    assert.ok(entry.criteria["sfdr_v1_si_objective_qualification"]);
    assert.ok(entry.criteria["sfdr_v1_si_eligibility_evidence_pack"]);
    assert.ok(entry.criteria["sfdr_v1_project_pai_data_provision"]);
  });

  test("every criterion ref in the framework JSON resolves to a real SharedCriterion", () => {
    for (const key of ["sfdr_v1_article_8", "sfdr_v1_article_9"] as const) {
      const entry = BUNDLED_SFDR_FRAMEWORKS[key];
      for (const ref of entry.framework.criteria ?? []) {
        const resolved = entry.criteria[ref.ref];
        assert.ok(
          resolved,
          `${key}: ref "${ref.ref}" did not resolve to a criterion`,
        );
        assert.equal(
          resolved.criterion_id,
          ref.ref,
          `${key}: criterion_id mismatch at ref ${ref.ref}`,
        );
      }
    }
  });

  test("methodology_version reads v3.5 (not the stale per-framework JSON stamp)", () => {
    assert.equal(BUNDLED_SFDR_FRAMEWORKS.sfdr_v1_article_8.methodology_version, METHODOLOGY_VERSION);
    assert.equal(BUNDLED_SFDR_FRAMEWORKS.sfdr_v1_article_9.methodology_version, METHODOLOGY_VERSION);
    assert.equal(METHODOLOGY_VERSION, "v3.5");
  });

  test("the bundle is frozen — consumers can't mutate the object graph", () => {
    assert.ok(Object.isFrozen(BUNDLED_SFDR_FRAMEWORKS));
    assert.ok(Object.isFrozen(BUNDLED_SFDR_FRAMEWORKS.sfdr_v1_article_8));
    assert.ok(Object.isFrozen(BUNDLED_SFDR_FRAMEWORKS.sfdr_v1_article_9));
  });
});

describe("BUNDLED_SFDR_FRAMEWORKS — browser-safety", () => {
  // Static source check: the module's TypeScript source must not import
  // any Node-only modules. Verifying via direct text scan rather than
  // runtime introspection — the latter would only fail if we hit a code
  // path that requires a Node-only module, and the SPA bundle would
  // silently externalise it without complaint until something tries to
  // call it. Static check catches the regression at compile time.
  test("source has no `node:*` imports (direct or transitive via sfdr/bundled, methodologyVersion)", () => {
    const sourceFiles = [
      "src/lib/bundledSFDRFrameworks.ts",
      "src/sfdr/bundled.ts",
      "src/lib/methodologyVersion.ts",
    ];
    const FORBIDDEN_PATTERNS = [
      /from\s+["']node:/, // node: protocol imports
      /from\s+["']fs["']/, // bare 'fs'
      /from\s+["']path["']/, // bare 'path'
      /from\s+["']stream["']/, // bare 'stream'
      /from\s+["']fast-glob["']/, // fast-glob (uses node:fs internally)
      /require\(["']node:/,
      /require\(["']fs["']\)/,
    ];
    for (const file of sourceFiles) {
      const fullPath = path.resolve(process.cwd(), file);
      const text = readFileSync(fullPath, "utf8");
      for (const pattern of FORBIDDEN_PATTERNS) {
        assert.ok(
          !pattern.test(text),
          `${file} contains a forbidden Node-only import matching ${pattern}; ` +
            `this would break browser bundling for SPA consumers`,
        );
      }
    }
  });
});
