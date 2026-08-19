// Module 4 acceptance: all four labels always present; Improvers strongest fit
// for the MENA-profile fixture; anti-greenwashing audit flag on every label
// row; asset-level vs fund-level distinction preserved.

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type {
  CanonicalAssessment,
  GovernanceDisclosureMetrics,
} from "../../core/canonical";
import { loadConfigV1 } from "../../config/thresholds";
import { UKSDRLens } from "../ukSdrLens";

function mkCanonical(o: {
  alignment?: number | null;
  governance?: Partial<GovernanceDisclosureMetrics>;
  region?: CanonicalAssessment["context"]["hostRegion"];
} = {}): CanonicalAssessment {
  return {
    assetId: "UK-TEST",
    context: { assetStage: "operational", hostRegion: o.region ?? "UK-EU", hostJurisdiction: "GB", facilityType: "hyperscale" },
    energy: { pueDesign: null, pueOperational: null, renewableSharePercent: null, ppaStructure: "unknown", ppaTenorYears: null, onSiteGenerationMw: null, hostGridCarbonIntensity: null, behindTheMeterProvision: { state: "unknown", capacityMw: null } },
    water: { wue: null, coolingTechnologyClass: "unknown", waterSourceType: "unknown", consumptiveSharePercent: null, waterStressBand: "unknown" },
    carbon: { scope1: null, scope2Market: null, scope2Location: null, scope3DisclosureCompleteness: "unknown", embodiedCarbonDisclosed: "unknown", embodiedCarbonMethodology: null },
    communityLand: { hostCommunityEngagement: "unknown", localEnergyPriceImpactAssessment: "unknown", noiseLandUsePermittingStatus: "unknown" },
    governance: {
      disclosureCompletenessScore: 0.5,
      thirdPartyVerification: "unknown",
      transitionRoadmap: { present: "absent", capexLinked: null, datedMilestones: null, boardApproved: null },
      ...o.governance,
    },
    derivedAlignmentScorePercent: o.alignment ?? null,
  };
}

const lens = new UKSDRLens(loadConfigV1());

test("all four labels are always present as sections", () => {
  const v = lens.evaluate(mkCanonical());
  const ids = v.sections.map((s) => s.id).sort();
  assert.deepEqual(ids, ["label_focus", "label_impact", "label_improvers", "label_mixed_goals"]);
});

test("anti-greenwashing audit flag appears on EVERY label row", () => {
  const v = lens.evaluate(mkCanonical({ alignment: 40, governance: { thirdPartyVerification: "reasonable", transitionRoadmap: { present: "present", capexLinked: true, datedMilestones: true, boardApproved: true } } }));
  for (const s of v.sections) {
    assert.ok(
      s.details!.some((d) => d.startsWith("Anti-greenwashing audit:")),
      `${s.id} missing anti-greenwashing audit line`,
    );
    assert.ok(s.summary.includes("Anti-greenwashing audit:"));
  }
});

test("Improvers is the strongest fit for the MENA profile", () => {
  // MENA: not yet sustainable (low alignment), credible improvement plan present.
  const v = lens.evaluate(
    mkCanonical({
      region: "MENA",
      alignment: 6,
      governance: {
        thirdPartyVerification: "limited",
        transitionRoadmap: { present: "present", capexLinked: true, datedMilestones: true, boardApproved: null },
      },
    }),
  );
  assert.equal(v.headlineLabel, "Sustainability Improvers");
  assert.equal(v.headline, "qualifies");
  const improvers = v.sections.find((s) => s.id === "label_improvers")!;
  assert.equal(improvers.status, "pass"); // Qualifies Now
  const focus = v.sections.find((s) => s.id === "label_focus")!;
  assert.equal(focus.status, "fail"); // Not A Fit (not sustainable now)
});

test("Focus qualifies now when the asset meets a verified standard", () => {
  const v = lens.evaluate(mkCanonical({ alignment: 45, governance: { thirdPartyVerification: "reasonable" } }));
  const focus = v.sections.find((s) => s.id === "label_focus")!;
  assert.equal(focus.status, "pass");
  assert.equal(v.headlineLabel, "Sustainability Focus");
});

test("asset-level vs fund-level distinction preserved (70% is a FM note, not a section)", () => {
  const v = lens.evaluate(mkCanonical({ alignment: 6, governance: { transitionRoadmap: { present: "present", capexLinked: true, datedMilestones: true, boardApproved: true } } }));
  assert.ok(v.fundManagerNotes.some((n) => n.includes("70%") && n.includes("NOT an asset verdict")));
  assert.ok(v.sections.every((s) => s.summary.includes("asset-level fit")));
});

test("Not A Fit label rows carry an anti-greenwashing FLAG (don't claim it)", () => {
  const v = lens.evaluate(mkCanonical({ alignment: null, governance: { thirdPartyVerification: "none" } }));
  const focus = v.sections.find((s) => s.id === "label_focus")!;
  assert.equal(focus.status, "fail");
  assert.ok(focus.details!.some((d) => d.includes("FLAG")));
});

test("UK SDR verdicts are settled-confidence (FCA regime is finalised)", () => {
  const v = lens.evaluate(mkCanonical({ alignment: 40, governance: { thirdPartyVerification: "reasonable" } }));
  assert.equal(v.confidence, "settled");
});

test("Mixed Goals qualifies when two+ labels fit", () => {
  // Meets standard (Focus now) AND full credible plan with assurance (Impact now).
  const v = lens.evaluate(
    mkCanonical({
      alignment: 50,
      governance: {
        thirdPartyVerification: "reasonable",
        transitionRoadmap: { present: "present", capexLinked: true, datedMilestones: true, boardApproved: true },
      },
    }),
  );
  const mixed = v.sections.find((s) => s.id === "label_mixed_goals")!;
  assert.equal(mixed.status, "pass");
  assert.equal(v.headlineLabel, "Sustainability Mixed Goals");
});

// -- Threshold source-scan guard (review-pack Finding 2) ---------------------
//
// euLens.ts is guarded by a test that fails on ANY numeric comparison against a
// literal >= 2, because every real SFDR 2.0 threshold must come from config.
// ukSdrLens.ts had no equivalent, so a calibration threshold could be hardcoded
// here and nothing would notice.
//
// The UK lens legitimately contains a few numeric comparisons, but they are
// STRUCTURAL DEFINITIONS rather than calibrations: "Mixed Goals means a blend of
// two or more objectives" is how FCA PS23/16 defines the label, not a tunable
// number, and it will not move in a trilogue. So a blanket ban would be wrong.
//
// Instead this pins the exact set. Anything new fails the test, which forces the
// author to either move the value into config or justify it by adding it here
// with a reason. Silence is what we are removing, not numbers.

test("no UNDECLARED numeric thresholds in UK SDR lens logic (source scan)", () => {
  const src = readFileSync(join(__dirname, "..", "ukSdrLens.ts"), "utf8");
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');

  // Every numeric comparison currently in the file, each structural.
  const DECLARED = [
    // Full set of three credibility signals (capex-linked, dated, board-approved).
    // Counts array members; not a threshold.
    "=== 3",
    // At least one credibility signal present — structural floor, not calibration.
    ">= 1",
    // Mixed Goals requires a blend of two or more labels. FCA PS23/16 definition.
    ">= 2",
  ];

  const found = (code.match(/[<>]=?\s*\d+(?:\.\d+)?|[!=]==?\s*\d+(?:\.\d+)?/g) ?? []).map(
    (m) => m.replace(/\s+/g, " ").trim(),
  );
  const undeclared = found.filter((m) => !DECLARED.includes(m));
  assert.deepEqual(
    undeclared,
    [],
    `undeclared numeric comparison(s) in ukSdrLens.ts: ${undeclared.join(", ")}. ` +
      "Move the value into config/regulatory-thresholds.*.json, or add it to " +
      "DECLARED here with a comment explaining why it is structural.",
  );

  // Decimal literals are never structural — PUE/WUE-style values belong in config.
  const decimals = code.match(/(?<![\w.])\d+\.\d+/g) ?? [];
  assert.deepEqual(decimals, [], `decimal literal(s) in UK lens code: ${decimals.join(", ")}`);
});
