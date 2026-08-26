// ============================================================================
// Task 3 acceptance — benchmark datastore + fail-safe salt.
//
// The load-bearing assertions here are the NEGATIVE ones: when the salt env var
// is absent, nothing is written. A test that only proves the happy path would
// miss the failure mode that actually matters.
// ============================================================================

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { assess } from "../../assess";
import { InMemoryStorageAdapter } from "../jsonlAdapter";
import { PostgresStorageAdapter, BENCHMARK_TABLE } from "../postgresAdapter";
import {
  resolveBenchmarkSalt,
  BENCHMARK_SALT_ENV_VAR,
  MIN_SALT_LENGTH,
} from "../salt";
import type { BenchmarkRecord, StorageAdapter } from "../types";

const GOOD_SALT = "a-production-grade-salt-value";
const SECRET_ID = "ACME-SECRET-CORP-PROJECT-42";

function sampleInput() {
  return {
    project_id: SECRET_ID,
    intake_timestamp: "2026-08-12T00:00:00Z",
    facility_type: "hyperscale",
    jurisdiction: "SA",
    facility_status: "design",
    data_points: { site_water_stress_classification: "Extremely High" },
    evidence_documents: [],
  } as unknown as Parameters<typeof assess>[0];
}

// --- salt resolution ------------------------------------------------------

test("salt: resolves from the environment variable", () => {
  const r = resolveBenchmarkSalt({ env: { [BENCHMARK_SALT_ENV_VAR]: GOOD_SALT } });
  assert.equal(r.salt, GOOD_SALT);
  assert.equal(r.source, "env");
});

test("salt: absent env var yields null + a reason (fail safe)", () => {
  const r = resolveBenchmarkSalt({ env: {} });
  assert.equal(r.salt, null);
  assert.equal(r.source, "none");
  assert.match(r.reason!, new RegExp(BENCHMARK_SALT_ENV_VAR));
});

test("salt: blank / whitespace env var is treated as absent", () => {
  assert.equal(resolveBenchmarkSalt({ env: { [BENCHMARK_SALT_ENV_VAR]: "   " } }).salt, null);
});

test("salt: too-short env var is rejected rather than silently accepted", () => {
  const r = resolveBenchmarkSalt({
    env: { [BENCHMARK_SALT_ENV_VAR]: "x".repeat(MIN_SALT_LENGTH - 1) },
  });
  assert.equal(r.salt, null);
  assert.match(r.reason!, /too weak/);
});

test("salt: explicit option takes precedence over the environment", () => {
  const r = resolveBenchmarkSalt({
    explicit: GOOD_SALT,
    env: { [BENCHMARK_SALT_ENV_VAR]: "a-different-env-salt-value" },
  });
  assert.equal(r.salt, GOOD_SALT);
  assert.equal(r.source, "explicit");
});

test("salt: the salt is NEVER read from the regulatory config file", async () => {
  // Structural guard for the standing rule "never place the salt in the
  // settings file". If someone adds a salt key to the config, this fails.
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const cfg = readFileSync(
    join(__dirname, "..", "..", "..", "config", "regulatory-thresholds.v1.json"),
    "utf8",
  );
  assert.ok(!/salt/i.test(cfg), "regulatory config must not mention a salt");
});

// --- the acceptance criterion --------------------------------------------

test("a test assessment produces EXACTLY ONE anonymised row", async () => {
  const adapter = new InMemoryStorageAdapter();
  const result = await assess(sampleInput(), {
    storageAdapter: adapter,
    env: { [BENCHMARK_SALT_ENV_VAR]: GOOD_SALT },
  });

  assert.equal(adapter.records.length, 1, "exactly one row");
  assert.equal(result.benchmarkEmit?.emitted, true);
  assert.equal(result.benchmarkSaltSource, "env");

  // ...and the row is anonymised.
  const json = JSON.stringify(adapter.records[0]);
  assert.ok(!json.includes(SECRET_ID), "raw asset id must not appear");
  assert.ok(!json.includes("ACME-SECRET-CORP"), "no company string anywhere");
  assert.ok(adapter.records[0].assetHash.startsWith("bh1:"), "salted hash present");
  assert.ok(
    !("hostJurisdiction" in (adapter.records[0].metrics.context as Record<string, unknown>)),
    "precise jurisdiction dropped",
  );
});

test("emission is ON BY DEFAULT — no opt-in flag required", async () => {
  const adapter = new InMemoryStorageAdapter();
  const result = await assess(sampleInput(), {
    storageAdapter: adapter,
    env: { [BENCHMARK_SALT_ENV_VAR]: GOOD_SALT },
  });
  assert.equal(result.benchmarkEmit?.emitted, true);
  assert.equal(adapter.records.length, 1);
});

// --- fail safe ------------------------------------------------------------

test("FAIL SAFE: no salt => nothing is written, and a warning is logged", async () => {
  const adapter = new InMemoryStorageAdapter();
  const logs: string[] = [];
  const result = await assess(sampleInput(), {
    storageAdapter: adapter,
    env: {}, // salt absent
    benchmarkLogger: (m) => logs.push(m),
  });

  assert.equal(adapter.records.length, 0, "NOTHING may be written without a salt");
  assert.equal(result.benchmarkEmit?.emitted, false);
  assert.equal(result.benchmarkSaltSource, "none");
  assert.equal(logs.length, 1, "exactly one warning");
  assert.match(logs[0], new RegExp(BENCHMARK_SALT_ENV_VAR));
});

test("FAIL SAFE: a too-weak salt is treated as no salt", async () => {
  const adapter = new InMemoryStorageAdapter();
  const logs: string[] = [];
  await assess(sampleInput(), {
    storageAdapter: adapter,
    env: { [BENCHMARK_SALT_ENV_VAR]: "short" },
    benchmarkLogger: (m) => logs.push(m),
  });
  assert.equal(adapter.records.length, 0);
  assert.match(logs[0], /too weak/);
});

test("FAIL SAFE: the assessment itself still succeeds when emission is skipped", async () => {
  const result = await assess(sampleInput(), {
    env: {},
    benchmarkLogger: () => {},
  });
  // The whole point: benchmark problems never break an assessment.
  assert.ok(result.canonical);
  assert.ok(result.verdicts.length > 0);
  assert.equal(result.benchmarkEmit?.emitted, false);
});

test("benchmarkEnabled:false opts a single run out without touching the sink", async () => {
  const adapter = new InMemoryStorageAdapter();
  const result = await assess(sampleInput(), {
    storageAdapter: adapter,
    env: { [BENCHMARK_SALT_ENV_VAR]: GOOD_SALT },
    benchmarkEnabled: false,
  });
  assert.equal(adapter.records.length, 0);
  assert.match(result.benchmarkEmit!.error!, /disabled/);
});

test("a storage failure never propagates into the assessment", async () => {
  const failing: StorageAdapter = {
    name: "explosive",
    async append() {
      throw new Error("connection refused");
    },
  };
  const result = await assess(sampleInput(), {
    storageAdapter: failing,
    env: { [BENCHMARK_SALT_ENV_VAR]: GOOD_SALT },
    benchmarkLogger: () => {},
  });
  assert.ok(result.canonical, "assessment survived");
  assert.equal(result.benchmarkEmit?.emitted, false);
  assert.match(result.benchmarkEmit!.error!, /connection refused/);
});

// --- Postgres adapter -----------------------------------------------------

test("PostgresStorageAdapter issues a single append-only INSERT", async () => {
  const calls: { text: string; values: unknown[] }[] = [];
  const adapter = new PostgresStorageAdapter({
    async query(text, values) {
      calls.push({ text, values });
    },
  });

  const captured: BenchmarkRecord[] = [];
  const capture = new InMemoryStorageAdapter();
  await assess(sampleInput(), {
    storageAdapter: capture,
    env: { [BENCHMARK_SALT_ENV_VAR]: GOOD_SALT },
  });
  captured.push(...capture.records);

  await adapter.append(captured[0]);

  assert.equal(calls.length, 1, "one statement per record");
  const { text, values } = calls[0];
  assert.match(text, /^INSERT INTO /, "INSERT only");
  assert.ok(!/UPDATE|DELETE/i.test(text), "adapter must never UPDATE or DELETE");
  assert.match(text, /ON CONFLICT .* DO NOTHING/s, "idempotent emission");
  assert.match(text, new RegExp(BENCHMARK_TABLE));
  assert.equal(values.length, 9);
  assert.equal(values[1], captured[0].assetHash);
  // Raw identity must not reach the database driver.
  assert.ok(!JSON.stringify(values).includes(SECRET_ID));
});

test("PostgresStorageAdapter honours a table override", async () => {
  const calls: string[] = [];
  const adapter = new PostgresStorageAdapter(
    {
      async query(text) {
        calls.push(text);
      },
    },
    { table: "benchmark_records_staging" },
  );
  await adapter.append(mkRecord());
  assert.match(calls[0], /benchmark_records_staging/);
});

/** A minimal, correctly-typed record for adapter accounting tests. */
function mkRecord(): BenchmarkRecord {
  return {
    schemaVersion: "1.0.0",
    assetHash: "bh1:abc",
    region: "MENA",
    assetStage: "design",
    assessmentDate: "2026-08-12T00:00:00Z",
    engineVersion: "4.0.0-alpha.1",
    configVersion: "v1",
    metrics: {} as BenchmarkRecord["metrics"],
    lensHeadlines: [],
  };
}

// -- Insert accounting ------------------------------------------------------
//
// ON CONFLICT DO NOTHING succeeds silently when it inserts nothing, so counting
// "append() didn't throw" reports identical numbers for a first run and a
// re-run. These tests pin the distinction, because it is the only signal that
// tells you deduplication is working.

test("adapter counts ACTUAL inserts, not attempts", async () => {
  // Driver reports 1 row inserted, then 0 (conflict), then 0 (conflict).
  const rowCounts = [1, 0, 0];
  let i = 0;
  const adapter = new PostgresStorageAdapter({
    async query() {
      return { rowCount: rowCounts[i++] };
    },
  });
  const rec = mkRecord();
  await adapter.append(rec);
  await adapter.append(rec);
  await adapter.append(rec);

  assert.equal(adapter.attemptedCount, 3, "three calls made");
  assert.equal(adapter.insertedCount, 1, "only one row actually inserted");
  assert.equal(adapter.duplicateCount, 2, "two were conflicts");
  assert.equal(adapter.rowCountUnknown, false);
});

test("a re-run of identical data inserts nothing and says so", async () => {
  const adapter = new PostgresStorageAdapter({
    async query() {
      return { rowCount: 0 };
    },
  });
  const rec = mkRecord();
  await adapter.append(rec);
  await adapter.append(rec);
  assert.equal(adapter.insertedCount, 0, "nothing new written on a re-run");
  assert.equal(adapter.duplicateCount, 2);
});

test("a client that reports no rowCount is flagged UNKNOWN, not assumed zero", async () => {
  const adapter = new PostgresStorageAdapter({
    async query() {
      return {}; // no rowCount — e.g. an unfamiliar driver
    },
  });
  await adapter.append(mkRecord());
  assert.equal(adapter.rowCountUnknown, true, "honesty about not knowing");
  assert.equal(adapter.attemptedCount, 1);
});
