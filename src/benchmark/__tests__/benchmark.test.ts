// Module 7 acceptance: BenchmarkRecord type + JSONL adapter + interface
// exported; anonymisation tested (no input company/contact strings); a storage
// throw does not propagate to the assessment result.

import { strict as assert } from "node:assert";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { CanonicalAssessment } from "../../core/canonical";
import { normalise } from "../../core/metricsCore";
import { EULens } from "../../lens/euLens";
import { loadConfigV1 } from "../../config/thresholds";
import { buildBenchmarkRecord, hashAssetId } from "../anonymise";
import { emitBenchmark } from "../emit";
import { InMemoryStorageAdapter, JsonlStorageAdapter } from "../jsonlAdapter";
import type { BenchmarkRecord, StorageAdapter } from "../types";

const SECRET_ID = "ACME-SECRET-CORP-PROJECT-42";

function sampleCanonical(): CanonicalAssessment {
  const c = normalise(
    {
      project_id: SECRET_ID,
      intake_timestamp: "2026-08-12T00:00:00Z",
      facility_type: "hyperscale",
      jurisdiction: "SA",
      facility_status: "design",
      data_points: { site_water_stress_classification: "Extremely High" },
      evidence_documents: [],
    },
    { alignmentScorePercent: 40 },
  );
  // Plant a free-text methodology to prove it is stripped.
  c.carbon.embodiedCarbonMethodology = "ACME-SECRET-CORP internal LCA model v2";
  return c;
}

const OPTS = { engineVersion: "4.0.0-alpha.1", assessmentDate: "2026-08-12T00:00:00Z", salt: "test-salt" };

test("buildBenchmarkRecord produces the documented shape", () => {
  const c = sampleCanonical();
  const verdicts = [new EULens(loadConfigV1()).evaluate(c)];
  const rec = buildBenchmarkRecord(c, verdicts, OPTS);
  assert.equal(rec.schemaVersion, "1.0.0");
  assert.equal(rec.region, "MENA");
  assert.equal(rec.assetStage, "design");
  assert.equal(rec.engineVersion, "4.0.0-alpha.1");
  assert.equal(rec.configVersion, "v1");
  assert.equal(rec.lensHeadlines.length, 1);
  assert.equal(rec.lensHeadlines[0].lensId, "eu_sfdr_2_0");
  assert.equal(rec.assetHash, hashAssetId(SECRET_ID, "test-salt"));
});

test("anonymisation: serialised record contains NO input identifier / free-text", () => {
  const c = sampleCanonical();
  const verdicts = [new EULens(loadConfigV1()).evaluate(c)];
  const rec = buildBenchmarkRecord(c, verdicts, OPTS);
  const json = JSON.stringify(rec);
  assert.ok(!json.includes(SECRET_ID), "raw asset id must not appear");
  assert.ok(!json.includes("ACME-SECRET-CORP"), "no company string anywhere");
  assert.ok(!json.includes("internal LCA model"), "free-text methodology stripped");
  // Precise jurisdiction dropped; only coarse region retained.
  assert.ok(!("hostJurisdiction" in (rec.metrics.context as Record<string, unknown>)));
  assert.ok(!("assetId" in (rec.metrics as unknown as Record<string, unknown>)));
  // The salted hash IS present.
  assert.ok(json.includes(rec.assetHash));
});

test("hashAssetId is stable + salt-sensitive (dedup without identity)", () => {
  assert.equal(hashAssetId("X", "s1"), hashAssetId("X", "s1"));
  assert.notEqual(hashAssetId("X", "s1"), hashAssetId("X", "s2"));
  assert.notEqual(hashAssetId("X", "s1"), hashAssetId("Y", "s1"));
});

test("JSONL adapter appends one line per record", async () => {
  const path = join(__dirname, "..", "..", "..", "eval", "fixtures", "..", "__benchmark_test.jsonl");
  rmSync(path, { force: true });
  const adapter = new JsonlStorageAdapter(path);
  const c = sampleCanonical();
  const rec = buildBenchmarkRecord(c, [new EULens(loadConfigV1()).evaluate(c)], OPTS);
  await adapter.append(rec);
  await adapter.append(rec);
  const lines = readFileSync(path, "utf8").trim().split("\n");
  assert.equal(lines.length, 2);
  assert.equal((JSON.parse(lines[0]) as BenchmarkRecord).schemaVersion, "1.0.0");
  rmSync(path, { force: true });
});

test("emitBenchmark is failure-isolated: a throwing adapter never propagates", async () => {
  const failing: StorageAdapter = {
    name: "explosive",
    async append() {
      throw new Error("disk on fire");
    },
  };
  const logs: string[] = [];
  const c = sampleCanonical();
  const rec = buildBenchmarkRecord(c, [new EULens(loadConfigV1()).evaluate(c)], OPTS);
  // Must resolve, not reject.
  const result = await emitBenchmark(rec, failing, { logger: (m) => logs.push(m) });
  assert.equal(result.emitted, false);
  assert.match(result.error!, /disk on fire/);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /isolated/);
});

test("emitBenchmark success path via in-memory adapter", async () => {
  const adapter = new InMemoryStorageAdapter();
  const c = sampleCanonical();
  const rec = buildBenchmarkRecord(c, [new EULens(loadConfigV1()).evaluate(c)], OPTS);
  const result = await emitBenchmark(rec, adapter);
  assert.equal(result.emitted, true);
  assert.equal(adapter.records.length, 1);
});
