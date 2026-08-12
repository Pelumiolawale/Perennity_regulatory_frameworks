// Module 3 acceptance tests for the EU SFDR 2.0 lens.

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type {
  CanonicalAssessment,
  EnergyMetrics,
  WaterMetrics,
  GovernanceDisclosureMetrics,
} from "../../core/canonical";
import { loadConfig, loadConfigV1 } from "../../config/thresholds";
import { EULens } from "../euLens";

// -- Canonical factory (lens input contract) ---------------------------------

function mkCanonical(overrides: {
  alignment?: number | null;
  energy?: Partial<EnergyMetrics>;
  water?: Partial<WaterMetrics>;
  governance?: Partial<GovernanceDisclosureMetrics>;
  disclosure?: number;
  region?: CanonicalAssessment["context"]["hostRegion"];
} = {}): CanonicalAssessment {
  return {
    assetId: "TEST-1",
    context: {
      assetStage: "operational",
      hostRegion: overrides.region ?? "UK-EU",
      hostJurisdiction: "DE",
      facilityType: "hyperscale",
    },
    energy: {
      pueDesign: null,
      pueOperational: null,
      renewableSharePercent: null,
      ppaStructure: "unknown",
      ppaTenorYears: null,
      onSiteGenerationMw: null,
      hostGridCarbonIntensity: null,
      behindTheMeterProvision: { state: "unknown", capacityMw: null },
      ...overrides.energy,
    },
    water: {
      wue: null,
      coolingTechnologyClass: "unknown",
      waterSourceType: "unknown",
      consumptiveSharePercent: null,
      waterStressBand: "unknown",
      ...overrides.water,
    },
    carbon: {
      scope1: null,
      scope2Market: null,
      scope2Location: null,
      scope3DisclosureCompleteness: "unknown",
      embodiedCarbonDisclosed: "unknown",
      embodiedCarbonMethodology: null,
    },
    communityLand: {
      hostCommunityEngagement: "unknown",
      localEnergyPriceImpactAssessment: "unknown",
      noiseLandUsePermittingStatus: "unknown",
    },
    governance: {
      disclosureCompletenessScore: overrides.disclosure ?? 0,
      thirdPartyVerification: "unknown",
      transitionRoadmap: {
        present: "absent",
        capexLinked: null,
        datedMilestones: null,
        boardApproved: null,
      },
      ...overrides.governance,
    },
    derivedAlignmentScorePercent: overrides.alignment ?? null,
  };
}

const lens = new EULens(loadConfigV1());

test("all three categories are evaluated on every run", () => {
  const v = lens.evaluate(mkCanonical());
  const catSections = v.sections.filter((s) => s.id.startsWith("category_"));
  const ids = catSections.map((s) => s.id).sort();
  assert.deepEqual(ids, ["category_esg_basics", "category_sustainable", "category_transition"]);
});

test("clean Sustainable pass", () => {
  const v = lens.evaluate(
    mkCanonical({
      alignment: 42,
      governance: {
        disclosureCompletenessScore: 0.8,
        thirdPartyVerification: "reasonable",
        transitionRoadmap: { present: "present", capexLinked: true, datedMilestones: true, boardApproved: true },
      },
    }),
  );
  assert.equal(v.headline, "qualifies");
  assert.equal(v.headlineLabel, "Sustainable-fundable");
  const sus = v.sections.find((s) => s.id === "category_sustainable")!;
  assert.equal(sus.status, "pass");
});

test("Transition-with-roadmap: fails Sustainable, fundable via Transition, foregrounded", () => {
  const v = lens.evaluate(
    mkCanonical({
      alignment: 8, // below 15% safe harbour → Sustainable fails
      governance: {
        disclosureCompletenessScore: 0.6,
        thirdPartyVerification: "limited",
        transitionRoadmap: { present: "present", capexLinked: true, datedMilestones: true, boardApproved: false },
      },
    }),
  );
  assert.equal(v.headline, "qualifies_with_conditions");
  assert.equal(v.headlineLabel, "Transition-fundable");
  // Transition emphasis is the FIRST section (foregrounded).
  assert.equal(v.sections[0].id, "transition_pathway_emphasis");
  // Named gap for the missing board-approval credibility signal.
  assert.ok(v.evidenceGaps.some((g) => g.id === "transition_roadmap_boardApproved"));
});

test("MENA profile (high renewables PPA, water-stressed, roadmap present) → Transition-fundable with named gaps", () => {
  const v = lens.evaluate(
    mkCanonical({
      region: "MENA",
      alignment: 6,
      energy: { renewableSharePercent: 85, pueOperational: 1.45 },
      water: { waterStressBand: "extremely_high", wue: 1.8 },
      governance: {
        disclosureCompletenessScore: 0.5,
        thirdPartyVerification: "limited",
        transitionRoadmap: { present: "present", capexLinked: true, datedMilestones: true, boardApproved: null },
      },
    }),
  );
  assert.equal(v.headlineLabel, "Transition-fundable");
  assert.equal(v.headline, "qualifies_with_conditions");
  assert.ok(v.evidenceGaps.length > 0, "named evidence-pack gaps present");
  assert.equal(v.sections[0].id, "transition_pathway_emphasis");
});

test("ESG-Basics-only: no roadmap, low alignment, but disclosure floor met", () => {
  const v = lens.evaluate(
    mkCanonical({
      alignment: null,
      governance: { disclosureCompletenessScore: 0.5, thirdPartyVerification: "none" },
    }),
  );
  assert.equal(v.headline, "qualifies_with_conditions");
  assert.equal(v.headlineLabel, "ESG-Basics-fundable");
  const esg = v.sections.find((s) => s.id === "category_esg_basics")!;
  assert.equal(esg.status, "pass");
});

test("full fail: nothing qualifies", () => {
  const v = lens.evaluate(mkCanonical({ alignment: null, disclosure: 0.1 }));
  assert.equal(v.headline, "not_a_fit");
  assert.equal(v.headlineLabel, "Not fundable under any category");
});

test("PAI layer: per-indicator status + mandatory set from config", () => {
  const v = lens.evaluate(
    mkCanonical({ energy: { pueOperational: 1.3, renewableSharePercent: 70 } }),
  );
  const pai = v.sections.find((s) => s.id === "pai_layer")!;
  assert.ok(pai, "pai layer section present");
  assert.ok(pai.details && pai.details.length === loadConfigV1().paiIndicators.set.length);
  // Every mandatory indicator from config appears in the details.
  const mandatory = loadConfigV1().paiIndicators.set.filter((p) => p.mandatory);
  for (const m of mandatory) {
    assert.ok(pai.details!.some((d) => d.includes(m.id) && d.includes("[mandatory]")));
  }
});

test("Taxonomy-% safe harbour surfaced; threshold value from config", () => {
  const v = lens.evaluate(mkCanonical({ alignment: 40 }));
  const tax = v.sections.find((s) => s.id === "taxonomy_safe_harbour")!;
  assert.equal(tax.status, "pass"); // 40 >= 15
  assert.ok(tax.summary.includes("15%"), "safe-harbour value (15%) surfaced from config");
});

test("70% test surfaces only as a fund-manager note, never a pass/fail on the asset", () => {
  const v = lens.evaluate(mkCanonical({ alignment: 42, governance: { disclosureCompletenessScore: 0.8, thirdPartyVerification: "reasonable", transitionRoadmap: { present: "absent", capexLinked: null, datedMilestones: null, boardApproved: null } } }));
  assert.ok(v.fundManagerNotes.some((n) => n.includes("70%") && n.includes("NOT an asset verdict")));
  // No section is titled/ided as a 70% pass/fail on the asset.
  assert.ok(!v.sections.some((s) => s.id.includes("seventy")));
});

test("EU verdicts are provisional (whole regime is trilogue-live)", () => {
  const v = lens.evaluate(mkCanonical({ alignment: 42 }));
  assert.equal(v.confidence, "provisional");
  assert.ok(v.citations.some((c) => c.contested === true));
});

test("config swap (safe harbour 15→20) changes the verdict with zero lens-code change", () => {
  const c = mkCanonical({
    alignment: 18, // between 15 and 20
    governance: { disclosureCompletenessScore: 0.8, thirdPartyVerification: "reasonable", transitionRoadmap: { present: "absent", capexLinked: null, datedMilestones: null, boardApproved: null } },
  });
  // v1: safe harbour 15 → 18 >= 15 → Sustainable-fundable.
  const v1 = new EULens(loadConfigV1()).evaluate(c);
  assert.equal(v1.headlineLabel, "Sustainable-fundable");

  // v2 (Parliament variant): safe harbour 20 → 18 < 20 → NOT Sustainable.
  const raw = structuredClone(loadConfigV1()) as unknown as {
    configVersion: string;
    thresholds: Record<string, { value: number }>;
    categories: { sustainable: { requiresAlignmentScoreAtOrAbovePercent: number } };
  };
  raw.configVersion = "v2-parliament";
  raw.thresholds.taxonomySafeHarbourPercent.value = 20;
  raw.categories.sustainable.requiresAlignmentScoreAtOrAbovePercent = 20;
  const v2 = new EULens(loadConfig(raw)).evaluate(c);
  assert.notEqual(v2.headlineLabel, "Sustainable-fundable");
});

test("zero hardcoded numeric thresholds in lens logic (source scan)", () => {
  const src = readFileSync(join(__dirname, "..", "euLens.ts"), "utf8");
  // Strip comments + string literals so we only scan executable code.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
  // No numeric COMPARISON against a literal >= 2 (all real thresholds are
  // config-derived variables). Structural 0/1 counts are allowed.
  const badCompare = code.match(/[<>]=?\s*(?:[2-9]|\d\d+)(?:\.\d+)?/g) ?? [];
  assert.deepEqual(badCompare, [], `hardcoded numeric comparison(s): ${badCompare.join(", ")}`);
  // No decimal PUE/WUE-style literals in code (e.g. 1.2 / 1.3 / 0.4).
  const decimals = code.match(/(?<![\w.])\d+\.\d+/g) ?? [];
  assert.deepEqual(decimals, [], `decimal literal(s) in lens code: ${decimals.join(", ")}`);
});
