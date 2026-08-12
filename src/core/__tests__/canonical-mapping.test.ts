// Module 1 acceptance: mapping fn from the current input shape, with tests
// covering EVERY existing fixture. Also asserts the canonical model carries
// zero framework-named fields and that community/land + grid-modularity fields
// are present even when no lens fully consumes them.

import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { ProjectInput } from "../../engine";
import { normalise } from "../metricsCore";
import type { CanonicalAssessment } from "../canonical";

const FIXTURE_DIR = join(__dirname, "..", "..", "..", "eval", "fixtures");

function loadFixtureInputs(): { name: string; input: ProjectInput }[] {
  return readdirSync(FIXTURE_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({
      name: d.name,
      input: JSON.parse(
        readFileSync(join(FIXTURE_DIR, d.name, "input.json"), "utf8"),
      ) as ProjectInput,
    }));
}

const fixtures = loadFixtureInputs();

test("there are at least the 6 known fixtures", () => {
  assert.ok(fixtures.length >= 6, `expected ≥6 fixtures, found ${fixtures.length}`);
});

for (const { name, input } of fixtures) {
  test(`normalise() maps fixture "${name}" without throwing and populates every group`, () => {
    const c = normalise(input);
    // Every top-level group present.
    assert.ok(c.context, "context group present");
    assert.ok(c.energy, "energy group present");
    assert.ok(c.water, "water group present");
    assert.ok(c.carbon, "carbon group present");
    assert.ok(c.communityLand, "communityLand group present");
    assert.ok(c.governance, "governance group present");
    // assetId preserved.
    assert.equal(c.assetId, input.project_id);
    // Disclosure completeness is a derived 0–1 score.
    const s = c.governance.disclosureCompletenessScore;
    assert.ok(s >= 0 && s <= 1, `disclosureCompletenessScore in [0,1], got ${s}`);
    // Community/land + grid-modularity fields exist even when unpopulated.
    assert.ok("hostCommunityEngagement" in c.communityLand);
    assert.ok("localEnergyPriceImpactAssessment" in c.communityLand);
    assert.ok("behindTheMeterProvision" in c.energy);
    assert.ok("state" in c.energy.behindTheMeterProvision);
  });
}

test("zero framework-named fields anywhere in the canonical model", () => {
  // Walk the serialised canonical object for any key that names a framework.
  const c = normalise(fixtures[0].input, { alignmentScorePercent: 42 });
  const banned = /sfdr|sdr|taxonomy|article|art[_-]?[89]|icma|gbp|paris|ppa$/i;
  // NB: `ppaStructure`/`ppaTenorYears` are physical-market terms, not a
  // framework name — allow "ppa" as a substring but ban an exact "ppa" key.
  const offenders: string[] = [];
  function walk(obj: unknown, path: string): void {
    if (obj === null || typeof obj !== "object") return;
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      // Allow keys that merely start with "ppa" (PPA = power purchase
      // agreement, a market instrument, not a regulatory framework).
      const isPpaMarketTerm = /^ppa[A-Z]/.test(key) || key === "ppaStructure";
      if (banned.test(key) && !isPpaMarketTerm) offenders.push(`${path}.${key}`);
      walk((obj as Record<string, unknown>)[key], `${path}.${key}`);
    }
  }
  walk(c, "canonical");
  assert.deepEqual(offenders, [], `framework-named fields found: ${offenders.join(", ")}`);
});

test("Frankfurt fixture: PUE + water-stress + region map correctly", () => {
  const fx = fixtures.find((f) => f.name === "hyperscale_frankfurt");
  assert.ok(fx, "frankfurt fixture present");
  const c = normalise(fx!.input);
  assert.equal(c.energy.pueOperational, 1.32);
  assert.equal(c.water.wue, 0.25);
  assert.equal(c.water.waterStressBand, "low");
  assert.equal(c.context.hostRegion, "UK-EU");
  assert.equal(c.context.assetStage, "operational");
  // Independent-audit evidence → at least limited assurance.
  assert.equal(c.governance.thirdPartyVerification, "limited");
});

test("Riyadh fixture: MENA region + extremely-high water stress + design stage", () => {
  const fx =
    fixtures.find((f) => f.name === "greenfield_riyadh") ??
    fixtures.find((f) => f.name === "hyperscale_riyadh");
  assert.ok(fx, "a riyadh fixture present");
  const c = normalise(fx!.input);
  assert.equal(c.context.hostRegion, "MENA");
  assert.equal(c.water.waterStressBand, "extremely_high");
});

test("alignmentScorePercent from ctx is clamped and stored (reuse path)", () => {
  const c1: CanonicalAssessment = normalise(fixtures[0].input, {
    alignmentScorePercent: 73,
  });
  assert.equal(c1.derivedAlignmentScorePercent, 73);
  const c2 = normalise(fixtures[0].input, { alignmentScorePercent: 140 });
  assert.equal(c2.derivedAlignmentScorePercent, 100); // clamped
  const c3 = normalise(fixtures[0].input);
  assert.equal(c3.derivedAlignmentScorePercent, null); // absent → null
});
