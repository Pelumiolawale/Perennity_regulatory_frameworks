// Module 8 acceptance: assess() orchestration + TRILOGUE_TRACKING derived from
// live config. Also proves the flow: normalise -> lenses -> legacy adapter, and
// benchmark emission is wired + failure-isolated.

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { ProjectInput } from "../engine";
import { assess } from "../assess";
import { InMemoryStorageAdapter } from "../benchmark/jsonlAdapter";
import {
  TRILOGUE_TRACKING,
  buildTrilogueTracking,
  ENGINE_V4_VERSION,
} from "../v4/meta";
import { loadConfig, loadConfigV1 } from "../config/thresholds";

function frankfurt(): ProjectInput {
  return JSON.parse(
    readFileSync(
      join(__dirname, "..", "..", "eval", "fixtures", "hyperscale_frankfurt", "input.json"),
      "utf8",
    ),
  ) as ProjectInput;
}

test("assess() runs normalise -> lenses -> legacy adapter and stores a benchmark record", async () => {
  const adapter = new InMemoryStorageAdapter();
  // Task 3: emission now requires a resolved salt (fail-safe — the engine will
  // not write weakly-hashed data). Supplying one here keeps this test asserting
  // what it always asserted: that assess() wires through to the storage sink.
  const result = await assess(frankfurt(), {
    storageAdapter: adapter,
    env: { PERENNITY_BENCHMARK_SALT: "test-salt-long-enough-for-the-guard" },
  });

  // Canonical produced.
  assert.equal(result.canonical.assetId, "PB-FX-001");
  // EU + UK lenses ran; US stub surfaced as an error (not a crash).
  const lensIds = result.verdicts.map((v) => v.lensId).sort();
  assert.deepEqual(lensIds, ["eu_sfdr_2_0", "uk_sdr"]);
  assert.ok(result.lensErrors.some((e) => e.lensId === "us_social_license"));
  // Legacy-shaped projection per lens verdict.
  assert.equal(result.legacyFrameworkResults.length, 2);
  assert.ok(result.legacyFrameworkResults.every((fr) => fr.archetype === "product_label"));
  // Benchmark record built + emitted.
  assert.equal(result.benchmarkRecord.region, "UK-EU");
  assert.equal(result.benchmarkEmit?.emitted, true);
  assert.equal(adapter.records.length, 1);
  assert.equal(result.engineVersion, ENGINE_V4_VERSION);
});

test("assess() reuses the EU Taxonomy engine for the alignment % (non-null for a rich fixture)", async () => {
  const result = await assess(frankfurt());
  assert.notEqual(result.canonical.derivedAlignmentScorePercent, null);
  assert.ok((result.canonical.derivedAlignmentScorePercent as number) > 0);
});

test("assess() alignment override + reuse-off paths", async () => {
  const overridden = await assess(frankfurt(), { alignmentScorePercent: 55 });
  assert.equal(overridden.canonical.derivedAlignmentScorePercent, 55);
  const noReuse = await assess(frankfurt(), { reuseTaxonomyEngine: false });
  assert.equal(noReuse.canonical.derivedAlignmentScorePercent, null);
});

test("a storage failure never breaks assess()", async () => {
  const result = await assess(frankfurt(), {
    storageAdapter: {
      name: "explosive",
      async append() {
        throw new Error("boom");
      },
    },
  });
  // Assessment still completes with verdicts.
  assert.equal(result.verdicts.length, 2);
  assert.equal(result.benchmarkEmit?.emitted, false);
});

test("TRILOGUE_TRACKING is present and derived from live config (not hardcoded)", () => {
  assert.equal(TRILOGUE_TRACKING.methodologyVersion, "4.0-draft");
  assert.equal(TRILOGUE_TRACKING.configVersion, "v1");
  assert.equal(TRILOGUE_TRACKING.engineVersion, ENGINE_V4_VERSION);
  // Contested items reflect the live config's contested entries.
  const keys = TRILOGUE_TRACKING.contestedItems.map((c) => c.key);
  assert.ok(keys.includes("taxonomySafeHarbourPercent"));
  assert.ok(keys.includes("mandatoryPaiCount"));
  assert.ok(keys.includes("categoryExclusionScope"));

  // Prove it is derived, not hardcoded: mark an item settled → it drops out.
  const raw = structuredClone(loadConfigV1()) as unknown as {
    thresholds: Record<string, { status: string }>;
  };
  raw.thresholds.taxonomySafeHarbourPercent.status = "settled";
  const swapped = buildTrilogueTracking(loadConfig(raw));
  assert.ok(!swapped.contestedItems.map((c) => c.key).includes("taxonomySafeHarbourPercent"));
});
