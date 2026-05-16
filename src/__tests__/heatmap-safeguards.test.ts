import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DeterministicEngine, aggregateVerdict } from "../runtime";
import type { Activity, ProjectInput } from "../engine";

// ============================================================================
// Heatmap aggregation contract — v0.2.0 / methodology v3.2.
//
// Pre-v0.2.0: safeguards was hardcoded "data_missing" and EXCLUDED from
// aggregation (so heatmap didn't collapse to "partial" for every run). The
// exclusion was a temporary unblock — see prior commit log.
//
// As of v0.2.0, safeguards is substantive (four pillars + rollup), and the
// rollup verdict contributes to the heatmap. The new exclusion rule is
// authority_level: criteria with authority_level !== 1 (e.g. the Perennity
// pue_performance_band benchmark, level 2) do NOT contribute to alignment
// routing. Heatmap aggregation = all authority_level=1 verdicts.
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

  test("fail still dominates data_missing", () => {
    assert.equal(aggregateVerdict(["pass", "data_missing", "fail"]), "fail");
  });
});

const REPO_ROOT = path.resolve(__dirname, "../..");
const ACTIVITY_PATH = path.join(
  REPO_ROOT,
  "regulatory-knowledge/frameworks/eu_taxonomy_climate/eu_tax_climate_8_1.json",
);
const INPUT_PATH = path.join(
  REPO_ROOT,
  "eval/fixtures/hyperscale_frankfurt/input.json",
);

describe("scoreActivity heatmap — integration (v3.2)", () => {
  test("fully populated fixture (SC + DNSH + all four safeguards pillars) → overall_verdict 'pass'", async () => {
    const activity = JSON.parse(readFileSync(ACTIVITY_PATH, "utf8")) as Activity;
    const input = JSON.parse(readFileSync(INPUT_PATH, "utf8")) as ProjectInput;

    const engine = new DeterministicEngine({
      engine_commit_sha: "test",
      knowledge_base_hash: "sha256:test",
      methodology_version: "v3.2-test",
      now: () => "2026-05-13T00:00:00Z",
      generateId: () => "run-safeguards-test",
    });

    const run = await engine.run(input, [activity]);
    const fr = run.framework_results[0];

    // SC all pass
    assert.ok(
      fr.sc_results.every((r) => r.verdict === "pass"),
      `expected all SC to pass; got ${JSON.stringify(fr.sc_results.map((r) => ({ id: r.criterion_id, verdict: r.verdict })))}`,
    );
    // DNSH all pass / not_applicable
    assert.ok(
      fr.dnsh_results.every((r) => r.verdict === "pass" || r.verdict === "not_applicable"),
      `expected DNSH to be pass/n_a; got ${JSON.stringify(fr.dnsh_results.map((r) => r.verdict))}`,
    );
    // Safeguards rollup populated and pass
    assert.equal(fr.minimum_safeguards_verdict, "pass");

    const rollup = (fr.safeguards_results ?? []).find((r) => r.criterion_id === "minimum_safeguards");
    assert.ok(rollup, "expected the safeguards rollup criterion to be scored");
    assert.equal(rollup.verdict, "pass");
    assert.equal(rollup.contributing_pillars?.length, 4);

    // Overall verdict is pass — the four pillars all pass, rollup passes,
    // SC/DNSH all pass.
    assert.equal(
      fr.overall_verdict,
      "pass",
      `expected overall_verdict 'pass' under v3.2; got ${fr.overall_verdict}`,
    );

    // pue_performance_band (authority_level 2) does NOT contribute to overall_verdict.
    const band = (fr.methodology_results ?? []).find((r) => r.criterion_id === "pue_performance_band");
    assert.ok(band, "expected the pue_performance_band methodology criterion to be scored");
    assert.equal(band.verdict, "banded");
    assert.equal(band.authority_level, 2);
  });
});
