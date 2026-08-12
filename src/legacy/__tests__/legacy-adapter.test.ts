// Module 8 acceptance: the legacy adapter maps a lens verdict back to the v3.5
// FrameworkResult shape the SPA consumes. Structural snapshot: deep-equal the
// key STRUCTURE against a REAL current SFDR product_label FrameworkResult
// produced by the untouched DeterministicEngine.

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { DeterministicEngine } from "../../runtime";
import { BUNDLED_SFDR_FRAMEWORKS } from "../../lib/bundledSFDRFrameworks";
import type { ProjectInput, FrameworkResult, CriterionResult } from "../../engine";
import type { RunInput } from "../../inputs";
import { normalise } from "../../core/metricsCore";
import { EULens } from "../../lens/euLens";
import { loadConfigV1 } from "../../config/thresholds";
import { lensVerdictToFrameworkResult } from "../adapter";

const PROJECT: ProjectInput = {
  project_id: "COMPAT-1",
  intake_timestamp: "2026-08-12T00:00:00Z",
  facility_type: "hyperscale",
  jurisdiction: "DE",
  facility_status: "operational",
  data_points: { annualised_pue: 1.3, wue_annualised: 0.3 },
  evidence_documents: [],
};

async function realSfdrFrameworkResult(): Promise<FrameworkResult> {
  const engine = new DeterministicEngine({
    engine_commit_sha: "compat",
    knowledge_base_hash: "compat",
    methodology_version: "v3.5",
    now: () => "1970-01-01T00:00:00.000Z",
    generateId: () => "compat",
  });
  const runInput: RunInput = { project: PROJECT };
  const run = await engine.run(runInput, [BUNDLED_SFDR_FRAMEWORKS.sfdr_v1_article_8.framework]);
  const fr = run.framework_results.find((r) => r.archetype === "product_label");
  assert.ok(fr, "a product_label FrameworkResult was produced");
  return fr!;
}

function legacyFrameworkResult(): FrameworkResult {
  const canonical = normalise(PROJECT, { alignmentScorePercent: 40 });
  const verdict = new EULens(loadConfigV1()).evaluate(canonical);
  return lensVerdictToFrameworkResult(verdict, canonical);
}

test("legacy adapter output has the SAME top-level key structure as a real v3.5 FrameworkResult", async () => {
  const real = await realSfdrFrameworkResult();
  const legacy = legacyFrameworkResult();
  const realKeys = Object.keys(real).sort();
  const legacyKeys = Object.keys(legacy).sort();
  assert.deepEqual(legacyKeys, realKeys, "top-level FrameworkResult keys must match exactly");
});

test("legacy adapter sc_results entries are structurally valid CriterionResults", async () => {
  const real = await realSfdrFrameworkResult();
  const legacy = legacyFrameworkResult();
  // Real CriterionResult keys form the allowed superset.
  const allowed = new Set(
    real.sc_results.flatMap((c) => Object.keys(c)),
  );
  // Required-subset every CriterionResult must carry.
  const required = ["criterion_id", "verdict", "gap_summary", "evidence_refs", "scoring_logic_ref", "scoring_logic_version"];
  assert.ok(legacy.sc_results.length > 0);
  for (const c of legacy.sc_results as CriterionResult[]) {
    for (const r of required) assert.ok(r in c, `missing required key ${r}`);
    for (const k of Object.keys(c)) {
      assert.ok(allowed.has(k), `legacy sc_result key "${k}" is not part of the v3.5 CriterionResult surface`);
    }
  }
});

test("headline maps to overall_verdict; archetype is product_label", () => {
  const canonical = normalise(PROJECT, { alignmentScorePercent: 40 });
  const verdict = new EULens(loadConfigV1()).evaluate(canonical);
  const legacy = lensVerdictToFrameworkResult(verdict, canonical);
  assert.equal(legacy.archetype, "product_label");
  assert.ok(["aligned", "partially_aligned", "not_aligned", "insufficient_evidence"].includes(legacy.overall_verdict));
});
