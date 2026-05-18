/**
 * Shared criterion library — schema validation + ref resolution tests
 * (Phase 1, commit 1.1).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  loadCriterionLibrary,
  resolveCriterionRefs,
  CriterionLibraryValidationError,
} from "../criterion-library";
import type { SharedCriterion } from "../criterion-library";

const REAL_KB = path.resolve(process.cwd(), "regulatory-knowledge");

const WELL_FORMED_CRITERION: SharedCriterion = {
  criterion_id: "test_v1_example",
  name: "Example criterion",
  regime: "test_v1",
  regulatory_anchors: [
    {
      regulation: "Test Regulation",
      celex: "test_celex",
      article: "Article 1",
    },
  ],
  axes: ["project"],
  applies_to: ["test_v1_framework"],
  scoring_status: "not_implemented",
  methodology_version_introduced: "v3.3",
  summary: "Example summary.",
};

async function makeTempLibrary(
  files: { name: string; data: unknown }[],
): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pb-crit-lib-"));
  const critDir = path.join(root, "criteria", "test-v1");
  await fs.mkdir(critDir, { recursive: true });
  // Mirror the real schema into the temp library root so the loader finds it.
  await fs.mkdir(path.join(root, "criteria"), { recursive: true });
  const realSchema = await fs.readFile(
    path.join(REAL_KB, "criteria", "criterion.schema.json"),
    "utf8",
  );
  await fs.writeFile(path.join(root, "criteria", "criterion.schema.json"), realSchema);
  for (const f of files) {
    await fs.writeFile(
      path.join(critDir, f.name),
      JSON.stringify(f.data, null, 2),
    );
  }
  return root;
}

describe("criterion library — schema validation", () => {
  test("loads the real SFDR v1 criterion library (10 files — Art 8 + v3.4 Art 9)", async () => {
    const lib = await loadCriterionLibrary({ rootDir: REAL_KB });
    // v0.5.0-alpha.4 / commit 1.3: criterion 11 (reference_benchmark) folded
    // into c8 sub-case (b); the 90% floor reframed as methodology preamble.
    // Final count: 7 Art 8 + 3 Art 9 = 10.
    assert.equal(lib.byId.size, 10);
    // Spot-check the load-bearing Art 9 c8 entry.
    const c8 = lib.byId.get("sfdr_v1_si_objective_qualification");
    assert.ok(c8, "expected sfdr_v1_si_objective_qualification in library");
    assert.equal(c8.regime, "sfdr_v1");
    assert.deepEqual(c8.applies_to, ["sfdr_v1_article_9"]);
    assert.equal(c8.scoring_status, "implemented");
    assert.ok(c8.successor_regime_note?.includes("COM(2025) 841"));
  });

  test("loads a well-formed temp criterion", async () => {
    const root = await makeTempLibrary([
      { name: "test_v1_example.json", data: WELL_FORMED_CRITERION },
    ]);
    const lib = await loadCriterionLibrary({ rootDir: root });
    assert.equal(lib.byId.size, 1);
    assert.equal(lib.byId.get("test_v1_example")?.name, "Example criterion");
  });

  test("rejects criterion with missing required field", async () => {
    const broken = { ...WELL_FORMED_CRITERION } as Partial<SharedCriterion>;
    delete broken.summary;
    const root = await makeTempLibrary([{ name: "broken.json", data: broken }]);
    await assert.rejects(
      () => loadCriterionLibrary({ rootDir: root }),
      CriterionLibraryValidationError,
    );
  });

  test("rejects criterion with version-stamp pattern violation", async () => {
    const broken = {
      ...WELL_FORMED_CRITERION,
      criterion_id: "no_version_stamp",
    };
    const root = await makeTempLibrary([{ name: "broken.json", data: broken }]);
    await assert.rejects(
      () => loadCriterionLibrary({ rootDir: root }),
      CriterionLibraryValidationError,
    );
  });

  test("rejects criterion with bad axis value", async () => {
    const broken = {
      ...WELL_FORMED_CRITERION,
      axes: ["invalid_axis"],
    };
    const root = await makeTempLibrary([{ name: "broken.json", data: broken }]);
    await assert.rejects(
      () => loadCriterionLibrary({ rootDir: root }),
      CriterionLibraryValidationError,
    );
  });

  test("rejects criterion where criterion_id does not start with regime", async () => {
    const broken = {
      ...WELL_FORMED_CRITERION,
      regime: "other_v1",
    };
    const root = await makeTempLibrary([{ name: "broken.json", data: broken }]);
    await assert.rejects(
      () => loadCriterionLibrary({ rootDir: root }),
      CriterionLibraryValidationError,
    );
  });
});

describe("criterion library — ref resolution", () => {
  test("resolves SFDR Art 8 refs against the real library (7 refs, no errors)", async () => {
    const lib = await loadCriterionLibrary({ rootDir: REAL_KB });
    const refs = [
      { ref: "sfdr_v1_e_s_characteristics_promotion", weight: null },
      { ref: "sfdr_v1_good_governance_attestation", weight: null },
      { ref: "sfdr_v1_pai_consideration_policy", weight: null },
      { ref: "sfdr_v1_dnsh_assessment", weight: null },
      { ref: "sfdr_v1_pre_contractual_disclosure", weight: null },
      { ref: "sfdr_v1_taxonomy_alignment_disclosure", weight: null },
      { ref: "sfdr_v1_periodic_reporting_commitment", weight: null },
    ];
    const result = resolveCriterionRefs(refs, lib, {
      id: "sfdr_v1_article_8",
      framework_id: "sfdr_v1_article_8",
      regime: "sfdr_v1",
    });
    assert.equal(result.errors.length, 0);
    assert.equal(result.resolved.length, 7);
  });

  test("resolves SFDR Art 9 refs (10 refs, no errors — v3.4 reframe)", async () => {
    const lib = await loadCriterionLibrary({ rootDir: REAL_KB });
    const result = resolveCriterionRefs(
      Array.from(lib.byId.keys()).map((id) => ({ ref: id, weight: null })),
      lib,
      { id: "sfdr_v1_article_9", framework_id: "sfdr_v1_article_9", regime: "sfdr_v1" },
    );
    assert.equal(result.errors.length, 0);
    assert.equal(result.resolved.length, 10);
  });

  test("missing ref surfaces a missing error", async () => {
    const lib = await loadCriterionLibrary({ rootDir: REAL_KB });
    const result = resolveCriterionRefs(
      [{ ref: "sfdr_v1_does_not_exist", weight: null }],
      lib,
      { id: "sfdr_v1_article_8", framework_id: "sfdr_v1_article_8", regime: "sfdr_v1" },
    );
    assert.equal(result.resolved.length, 0);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].kind, "missing");
  });

  test("applies_to mismatch surfaces an applies_to_mismatch error", async () => {
    const lib = await loadCriterionLibrary({ rootDir: REAL_KB });
    // si_objective_qualification is Art 9 only; referencing it from Art 8 must fail.
    const result = resolveCriterionRefs(
      [{ ref: "sfdr_v1_si_objective_qualification", weight: null }],
      lib,
      { id: "sfdr_v1_article_8", framework_id: "sfdr_v1_article_8", regime: "sfdr_v1" },
    );
    assert.equal(result.resolved.length, 0);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].kind, "applies_to_mismatch");
  });

  test("regime mismatch surfaces a regime_mismatch error", async () => {
    const lib = await loadCriterionLibrary({ rootDir: REAL_KB });
    const result = resolveCriterionRefs(
      [{ ref: "sfdr_v1_dnsh_assessment", weight: null }],
      lib,
      // Wrong regime — the criterion is sfdr_v1, but we pretend the framework is uk_sdr_v1.
      { id: "sfdr_v1_article_8", framework_id: "sfdr_v1_article_8", regime: "uk_sdr_v1" },
    );
    assert.equal(result.resolved.length, 0);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].kind, "regime_mismatch");
  });
});
