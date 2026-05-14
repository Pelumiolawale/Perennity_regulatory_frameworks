import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DeterministicEngine, aggregateVerdict } from "../runtime";
import type { Activity, ProjectInput } from "../engine";

// ============================================================================
// Heatmap aggregation must EXCLUDE minimum_safeguards_verdict.
//
// Contract: per-framework overall_verdict (the value that becomes
// SnapshotOutput.heatmap[].verdict via SnapshotRenderer's collapseVerdict)
// reflects substantial_contribution + dnsh verdicts ONLY. minimum_safeguards
// is reported on FrameworkResult for renderer-side display but is not part of
// the aggregation while substantive safeguards logic is unimplemented.
//
// If this test ever fails, the heatmap will collapse to "partial" / "fail"
// whenever safeguards isn't "pass" — which is always today, since safeguards
// is hardcoded "data_missing". That would be a user-visible regression
// (Day 3 report flagged the symptom).
// ============================================================================

describe("aggregateVerdict — contract", () => {
  test("returns 'pass' for an all-pass input", () => {
    assert.equal(aggregateVerdict(["pass", "pass", "pass"]), "pass");
  });

  test("returns 'fail' when any input is 'fail'", () => {
    assert.equal(aggregateVerdict(["pass", "fail", "pass"]), "fail");
  });

  test("returns 'data_missing' when any input is 'data_missing' (no fail)", () => {
    assert.equal(aggregateVerdict(["pass", "data_missing", "pass"]), "data_missing");
  });

  test("returns 'partial' when only partials present", () => {
    assert.equal(aggregateVerdict(["pass", "partial", "pass"]), "partial");
  });

  test("returns 'not_applicable' when every input is not_applicable", () => {
    assert.equal(aggregateVerdict(["not_applicable", "not_applicable"]), "not_applicable");
  });

  test("not_applicable inputs are ignored among other verdicts", () => {
    assert.equal(aggregateVerdict(["pass", "not_applicable", "pass"]), "pass");
  });

  // The CORE safeguards-exclusion proof: the function is a generic aggregator
  // that operates on its input set. The fix at the call site (scoreActivity in
  // runtime.ts) excludes minimum_safeguards_verdict from the input passed here.
  // If safeguards (always "data_missing") were ever included, the result would
  // collapse to "data_missing" even for an all-pass SC+DNSH run. This pair of
  // assertions locks the call-site contract.
  test("excluding 'data_missing' from input keeps the verdict 'pass'", () => {
    // What the call site passes today: SC + DNSH verdicts only.
    assert.equal(aggregateVerdict(["pass", "pass", "pass", "pass"]), "pass");
    // What it WOULD pass if safeguards were re-included (regression shape):
    assert.equal(aggregateVerdict(["pass", "pass", "pass", "pass", "data_missing"]), "data_missing");
  });

  test("excluding 'fail' from input keeps the verdict 'pass'", () => {
    assert.equal(aggregateVerdict(["pass", "pass", "pass", "pass"]), "pass");
    // Regression shape if a "fail"-flavoured safeguards verdict ever leaked in:
    assert.equal(aggregateVerdict(["pass", "pass", "pass", "pass", "fail"]), "fail");
  });
});

// ----------------------------------------------------------------------------
// Integration test — exercises the actual scoreActivity → aggregateVerdict path
// against a fixture where all SC pass, DNSH water is not_applicable, DNSH
// adaptation passes, and safeguards is the engine-default "data_missing".
//
// Pre-fix this returned overall_verdict === "data_missing" (heatmap "partial").
// Post-fix it returns "pass" (heatmap "pass").
// ----------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, "../..");
const ACTIVITY_PATH = path.join(
  REPO_ROOT,
  "regulatory-knowledge/frameworks/eu_taxonomy_climate/eu_tax_climate_8_1.json",
);
const INPUT_PATH = path.join(
  REPO_ROOT,
  "eval/fixtures/hyperscale_frankfurt/input.json",
);

describe("scoreActivity heatmap excludes safeguards (integration)", () => {
  test("all-pass SC + DNSH + 'data_missing' safeguards → overall_verdict === 'pass'", async () => {
    const activity = JSON.parse(readFileSync(ACTIVITY_PATH, "utf8")) as Activity;
    const input = JSON.parse(readFileSync(INPUT_PATH, "utf8")) as ProjectInput;

    const engine = new DeterministicEngine({
      engine_commit_sha: "test",
      knowledge_base_hash: "sha256:test",
      methodology_version: "v3.1-test",
      now: () => "2026-05-13T00:00:00Z",
      generateId: () => "run-safeguards-test",
    });

    const run = await engine.run(input, [activity]);
    const fr = run.framework_results[0];

    // Sanity-check the fixture: SC and DNSH should all pass (water = n/a)
    assert.ok(
      fr.sc_results.every((r) => r.verdict === "pass"),
      `expected all SC to pass; got ${JSON.stringify(fr.sc_results.map((r) => r.verdict))}`,
    );
    assert.ok(
      fr.dnsh_results.every((r) => r.verdict === "pass" || r.verdict === "not_applicable"),
      `expected DNSH to be pass/n_a; got ${JSON.stringify(fr.dnsh_results.map((r) => r.verdict))}`,
    );

    // Safeguards remains "data_missing" — unchanged
    assert.equal(fr.minimum_safeguards_verdict, "data_missing");

    // The contract: overall_verdict is "pass" despite safeguards being "data_missing"
    assert.equal(
      fr.overall_verdict,
      "pass",
      `heatmap aggregation must exclude safeguards; got overall_verdict=${fr.overall_verdict}`,
    );
  });
});
