// Module 2 acceptance: interface exported; registry works; failure-isolated
// evaluateAll; provisional-confidence propagation tested (flip a config item to
// contested:true → verdict downgrades).

import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { CanonicalAssessment } from "../../core/canonical";
import { normalise } from "../../core/metricsCore";
import { loadConfigV1, loadConfig, type RegulatoryConfig } from "../../config/thresholds";
import { LensRegistry } from "../registry";
import { LensNotImplementedError } from "../errors";
import { deriveConfidence, type FrameworkLens, type LensVerdict } from "../types";

// A minimal lens that depends on ONE config threshold and cites it. When that
// threshold is contested, the citation carries contested:true → confidence
// derives to "provisional" and the headline downgrades. Demonstrates the
// trilogue-tracking propagation without touching lens code between the two
// config versions.
class ProbeLens implements FrameworkLens {
  readonly id = "probe";
  readonly version = "1.0.0";
  readonly configVersion: string;
  constructor(private readonly config: RegulatoryConfig) {
    this.configVersion = config.configVersion;
  }
  evaluate(_a: CanonicalAssessment): LensVerdict {
    const t = this.config.thresholds.taxonomySafeHarbourPercent;
    const contested = t.status === "contested";
    const citations = [
      {
        source: "SFDR 2.0 proposal",
        reference: "taxonomySafeHarbourPercent",
        note: contested ? "trilogue-live (15%→20% fight)" : "settled",
        contested,
      },
    ];
    return {
      lensId: this.id,
      lensVersion: this.version,
      configVersion: this.configVersion,
      headline: contested ? "qualifies_with_conditions" : "qualifies",
      headlineLabel: contested ? "Qualifies (provisional)" : "Qualifies",
      sections: [],
      evidenceGaps: [],
      citations,
      confidence: deriveConfidence(citations),
      fundManagerNotes: [],
    };
  }
}

function sampleCanonical(): CanonicalAssessment {
  return normalise({
    project_id: "PROBE-1",
    intake_timestamp: "2026-08-12T00:00:00Z",
    facility_type: "hyperscale",
    jurisdiction: "DE",
    facility_status: "operational",
    data_points: {},
    evidence_documents: [],
  });
}

test("FrameworkLens + LensVerdict are usable; registry registers + gets", () => {
  const reg = new LensRegistry();
  reg.register(new ProbeLens(loadConfigV1()));
  assert.deepEqual(reg.ids(), ["probe"]);
  assert.ok(reg.has("probe"));
  const v = reg.get("probe")!.evaluate(sampleCanonical());
  assert.equal(v.lensId, "probe");
});

test("provisional-confidence propagation: contested config → downgrade", () => {
  // Settled config: taxonomySafeHarbour marked settled.
  const settledRaw = structuredClone(loadConfigV1()) as unknown as {
    thresholds: Record<string, { status: string }>;
  };
  settledRaw.thresholds.taxonomySafeHarbourPercent.status = "settled";
  const settled = new ProbeLens(loadConfig(settledRaw)).evaluate(sampleCanonical());
  assert.equal(settled.confidence, "settled");
  assert.equal(settled.headline, "qualifies");

  // Contested config (bundled v1 has it contested): same lens code, downgrade.
  const contested = new ProbeLens(loadConfigV1()).evaluate(sampleCanonical());
  assert.equal(contested.confidence, "provisional");
  assert.equal(contested.headline, "qualifies_with_conditions");
});

test("evaluateAll is failure-isolated (a throwing lens becomes an error entry)", () => {
  const reg = new LensRegistry();
  reg.register(new ProbeLens(loadConfigV1()));
  reg.register({
    id: "explosive",
    version: "0.0.0",
    configVersion: "n/a",
    evaluate() {
      throw new LensNotImplementedError("explosive", "no scoring standard");
    },
  });
  const { verdicts, errors } = reg.evaluateAll(sampleCanonical());
  assert.equal(verdicts.length, 1);
  assert.equal(verdicts[0].lensId, "probe");
  assert.equal(errors.length, 1);
  assert.equal(errors[0].lensId, "explosive");
  assert.equal(errors[0].errorName, "LensNotImplementedError");
});
