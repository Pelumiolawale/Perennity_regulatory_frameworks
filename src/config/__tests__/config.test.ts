// Module 6 acceptance: config schema typed + validated at load (fail fast);
// >=3 named contested items; config-version swap changes verdicts with zero
// lens-code changes (the swap-verdict half is proven in the EU lens tests —
// here we prove the loader half + contested introspection).

import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  ConfigValidationError,
  contestedItems,
  loadConfig,
  loadConfigV1,
  resolveThreshold,
} from "../thresholds";

test("bundled v1 config loads + validates", () => {
  const c = loadConfigV1();
  assert.equal(c.configVersion, "v1");
  assert.equal(c.methodologyStatus, "4.0-draft");
  assert.equal(c.thresholds.taxonomySafeHarbourPercent.value, 15);
  assert.equal(c.thresholds.portfolioPositiveContributionPercent.value, 70);
});

test("the three named contested items are marked contested", () => {
  const c = loadConfigV1();
  assert.equal(c.thresholds.taxonomySafeHarbourPercent.status, "contested");
  assert.equal(c.thresholds.mandatoryPaiCount.status, "contested");
  assert.equal(c.categoryExclusionScope.status, "contested");
  const items = contestedItems(c);
  const keys = items.map((i) => i.key);
  assert.ok(keys.includes("taxonomySafeHarbourPercent"));
  assert.ok(keys.includes("mandatoryPaiCount"));
  assert.ok(keys.includes("categoryExclusionScope"));
  assert.ok(items.length >= 3, `expected >=3 contested items, got ${items.length}`);
});

test("loadConfig fails fast on malformed config", () => {
  assert.throws(() => loadConfig({}), ConfigValidationError);
  assert.throws(
    () => loadConfig({ configVersion: "x" }),
    ConfigValidationError,
    "missing required top-level fields",
  );
  // A threshold entry with a non-numeric value.
  const broken = structuredClone(loadConfigV1()) as unknown as Record<string, unknown>;
  (broken.thresholds as Record<string, { value: unknown }>).taxonomySafeHarbourPercent.value =
    "fifteen";
  assert.throws(() => loadConfig(broken), ConfigValidationError);
});

test("loadConfig fails fast when a named contested threshold is absent", () => {
  const broken = structuredClone(loadConfigV1()) as unknown as {
    thresholds: Record<string, unknown>;
  };
  delete broken.thresholds.mandatoryPaiCount;
  assert.throws(() => loadConfig(broken), ConfigValidationError);
});

test("resolveThreshold returns the entry / throws on unknown ref", () => {
  const c = loadConfigV1();
  assert.equal(resolveThreshold(c, "taxonomySafeHarbourPercent").value, 15);
  assert.throws(() => resolveThreshold(c, "no_such_ref"), ConfigValidationError);
});

test("an arbitrary config version can be loaded via the same loader (swap path)", () => {
  const v2raw = structuredClone(loadConfigV1()) as unknown as {
    configVersion: string;
    thresholds: Record<string, { value: number; status: string }>;
    categories: { sustainable: { requiresAlignmentScoreAtOrAbovePercent: number } };
  };
  v2raw.configVersion = "v2-parliament-variant";
  v2raw.thresholds.taxonomySafeHarbourPercent.value = 20; // Parliament 15→20
  // The mirrored literal must move with it — enforced by the loader since
  // Task 5. This test previously updated only the canonical value, which is
  // precisely the divergence the guard now rejects.
  v2raw.categories.sustainable.requiresAlignmentScoreAtOrAbovePercent = 20;
  const v2 = loadConfig(v2raw);
  assert.equal(v2.configVersion, "v2-parliament-variant");
  assert.equal(v2.thresholds.taxonomySafeHarbourPercent.value, 20);
});

// -- Mirrored-threshold guard (Task 5 / review-pack Finding 1) --------------
//
// config/regulatory-thresholds.v1.json carries the safe-harbour value twice:
// the canonical `thresholds.taxonomySafeHarbourPercent` (which the lens
// resolves by ref and which actually drives verdicts) and the mirrored literal
// `categories.sustainable.requiresAlignmentScoreAtOrAbovePercent`. Nothing read
// the mirror, so it could drift silently. Now it can't.

test("mirrored threshold: bundled v1 config is internally consistent", () => {
  const c = loadConfigV1();
  assert.equal(
    c.categories.sustainable.requiresAlignmentScoreAtOrAbovePercent,
    c.thresholds[c.categories.sustainable.requiresAlignmentScoreThresholdRef].value,
  );
});

test("mirrored threshold: divergence fails fast at load", () => {
  // The exact mistake the runbook warns about: apply Parliament's 15 -> 20 to
  // the canonical threshold and forget the mirror.
  const raw = structuredClone(loadConfigV1()) as unknown as {
    thresholds: Record<string, { value: number }>;
    categories: { sustainable: { requiresAlignmentScoreAtOrAbovePercent: number } };
  };
  raw.thresholds.taxonomySafeHarbourPercent.value = 20;
  // mirror deliberately left at 15
  assert.throws(
    () => loadConfig(raw),
    (err: unknown) =>
      err instanceof ConfigValidationError &&
      /must agree/.test((err as Error).message) &&
      /RUNBOOK-threshold-updates/.test((err as Error).message),
  );
});

test("mirrored threshold: updating BOTH values loads cleanly", () => {
  const raw = structuredClone(loadConfigV1()) as unknown as {
    configVersion: string;
    thresholds: Record<string, { value: number }>;
    categories: { sustainable: { requiresAlignmentScoreAtOrAbovePercent: number } };
  };
  raw.configVersion = "v2-parliament";
  raw.thresholds.taxonomySafeHarbourPercent.value = 20;
  raw.categories.sustainable.requiresAlignmentScoreAtOrAbovePercent = 20;
  const c = loadConfig(raw);
  assert.equal(c.thresholds.taxonomySafeHarbourPercent.value, 20);
});

test("mirrored threshold: a dangling ref fails fast rather than reading undefined", () => {
  const raw = structuredClone(loadConfigV1()) as unknown as {
    categories: { sustainable: { requiresAlignmentScoreThresholdRef: string } };
  };
  raw.categories.sustainable.requiresAlignmentScoreThresholdRef = "noSuchThreshold";
  assert.throws(() => loadConfig(raw), /does not exist in config.thresholds/);
});
