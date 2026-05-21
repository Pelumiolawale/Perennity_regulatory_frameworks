/**
 * Phase 1 commit 1.4.1 cleanup tests (`v0.5.0-alpha.8`).
 *
 * Three small invariants this commit landed:
 *   1. The v3.2 anyOf branch in the product_label schema is gone — the
 *      validator no longer accepts the legacy [label_id, label_family,
 *      eligibility_criteria] shape.
 *   2. Both SFDR framework JSONs now read methodology_version "v3.5"
 *      (was v3.3 for Art 8, v3.4 for Art 9 — stale relative to the
 *      v3.5 engine constant).
 *   3. The stamps in the framework JSONs and BUNDLED_SFDR_FRAMEWORKS
 *      both agree with METHODOLOGY_VERSION (the source of truth).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync } from "node:fs";
import { compileValidator, validateFramework } from "../knowledge/load";
import { METHODOLOGY_VERSION } from "../lib/methodologyVersion";
import { BUNDLED_SFDR_FRAMEWORKS } from "../lib/bundledSFDRFrameworks";

const REAL_SCHEMA = path.resolve(
  process.cwd(),
  "regulatory-knowledge/activity.schema.json",
);

describe("Phase 1 commit 1.4.1 — v3.2 anyOf removal", () => {
  test("validator rejects the legacy v3.2 product_label shape (label_id + label_family + eligibility_criteria)", async () => {
    const { validate } = await compileValidator(REAL_SCHEMA);
    const legacyV32Shape = {
      archetype: "product_label",
      id: "sfdr_v32_legacy_test",
      framework: "SFDR",
      framework_version: "v1",
      framework_source_hash: "sha256:" + "0".repeat(64),
      methodology_version: "v3.2",
      effective_date: "2026-05-18",
      // v3.2 fields only — no framework_id/regime/criteria
      label_id: "sfdr_article_8",
      label_family: "sfdr",
      eligibility_criteria: [],
    };
    const result = validateFramework(validate, legacyV32Shape);
    assert.equal(
      result.valid,
      false,
      "expected validator to reject the v3.2 shape after the anyOf arm was removed in 1.4.1",
    );
  });
});

describe("Phase 1 commit 1.4.1 — framework JSON methodology_version refresh", () => {
  test("art-8.json reads methodology_version v3.5 (was v3.3 pre-1.4.1)", () => {
    const art8Path = path.resolve(
      process.cwd(),
      "regulatory-knowledge/frameworks/sfdr/v1/art-8.json",
    );
    const art8 = JSON.parse(readFileSync(art8Path, "utf8"));
    assert.equal(art8.methodology_version, "v3.5");
  });

  test("art-9.json reads methodology_version v3.5 (was v3.4 pre-1.4.1)", () => {
    const art9Path = path.resolve(
      process.cwd(),
      "regulatory-knowledge/frameworks/sfdr/v1/art-9.json",
    );
    const art9 = JSON.parse(readFileSync(art9Path, "utf8"));
    assert.equal(art9.methodology_version, "v3.5");
  });

  test("BUNDLED_SFDR_FRAMEWORKS and framework JSONs now agree with METHODOLOGY_VERSION", () => {
    // Source-of-truth invariant: the engine constant, the bundled stamp,
    // and the framework JSON stamp all read the same value now that the
    // JSONs have been refreshed.
    assert.equal(BUNDLED_SFDR_FRAMEWORKS.sfdr_v1_article_8.methodology_version, METHODOLOGY_VERSION);
    assert.equal(BUNDLED_SFDR_FRAMEWORKS.sfdr_v1_article_9.methodology_version, METHODOLOGY_VERSION);
    assert.equal(
      BUNDLED_SFDR_FRAMEWORKS.sfdr_v1_article_8.framework.methodology_version,
      METHODOLOGY_VERSION,
    );
    assert.equal(
      BUNDLED_SFDR_FRAMEWORKS.sfdr_v1_article_9.framework.methodology_version,
      METHODOLOGY_VERSION,
    );
  });
});
