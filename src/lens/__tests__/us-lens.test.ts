// Module 5 acceptance: stub compiles, registered in registry, throws on
// evaluate with a clear message. No scoring, no thresholds, no config section.

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { normalise } from "../../core/metricsCore";
import { LensRegistry } from "../registry";
import { LensNotImplementedError } from "../errors";
import {
  USSocialLicenseLens,
  US_SOCIAL_LICENSE_DIMENSIONS,
} from "../usSocialLicenseLens";

function sample() {
  return normalise({
    project_id: "US-1",
    intake_timestamp: "2026-08-12T00:00:00Z",
    facility_type: "hyperscale",
    jurisdiction: "US",
    facility_status: "operational",
    data_points: {},
    evidence_documents: [],
  });
}

test("US lens implements FrameworkLens and registers in the registry", () => {
  const reg = new LensRegistry();
  reg.register(new USSocialLicenseLens());
  assert.ok(reg.has("us_social_license"));
});

test("evaluate() throws LensNotImplementedError with a clear message", () => {
  const lens = new USSocialLicenseLens();
  assert.throws(
    () => lens.evaluate(sample()),
    (err: unknown) => {
      assert.ok(err instanceof LensNotImplementedError);
      assert.equal((err as LensNotImplementedError).lensId, "us_social_license");
      assert.match((err as Error).message, /specified but not scored/i);
      return true;
    },
  );
});

test("registry.evaluateAll surfaces the US lens as an error, not a crash", () => {
  const reg = new LensRegistry();
  reg.register(new USSocialLicenseLens());
  const { verdicts, errors } = reg.evaluateAll(sample());
  assert.equal(verdicts.length, 0);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].errorName, "LensNotImplementedError");
});

test("the five evidence dimensions are documented", () => {
  assert.equal(US_SOCIAL_LICENSE_DIMENSIONS.length, 5);
});

test("no scoring / thresholds / config in the US lens module (source scan)", () => {
  const src = readFileSync(join(__dirname, "..", "usSocialLicenseLens.ts"), "utf8");
  // No config import (this lens has no config section).
  assert.doesNotMatch(src, /from ["'][^"']*config\/thresholds["']/);
  // No verdict construction / band assignment (no scoring).
  assert.doesNotMatch(src, /headline\s*:/);
  assert.doesNotMatch(src, /return\s*{[\s\S]*headline/);
});
