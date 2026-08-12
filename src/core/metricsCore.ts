// ============================================================================
// MetricsCore.normalise — lossless map from the current input surface into the
// framework-agnostic CanonicalAssessment. (Engine v4.0 — Module 1)
// ============================================================================
//
// This is the ONLY place normalisation happens. Lenses never re-normalise.
// The mapping reads three sources of the current input surface:
//   1. ProjectInput.data_points  (untyped EU-Taxonomy intake keys)
//   2. ProjectInput.sfdr / uk_sdr (typed SFDR / UK SDR nested inputs)
//   3. EntityInput.sfdr           (typed corporate-parent inputs)
// plus an optional `ctx.alignmentScorePercent` — the REUSED EU Taxonomy 8.1
// score, threaded in by the assess() entrypoint after running the existing
// engine (see src/assess.ts). Keeping it a parameter (not an internal engine
// call) keeps normalise() synchronous, pure over its arguments, and trivially
// testable over the raw fixtures.
// ============================================================================

import type { ProjectInput } from "../engine";
import type { EntityInput, RunInput } from "../inputs";
import type {
  ProjectDNSHEvidence,
  ProjectUKSDRInputs,
} from "../sfdr/types";
import type {
  AssetStage,
  AssuranceStrength,
  CanonicalAssessment,
  CoolingTechnologyClass,
  Region,
  WaterStressBand,
} from "./canonical";

export type NormaliseSource = RunInput | ProjectInput;

export interface NormaliseContext {
  /**
   * Framework-neutral external-standard alignment score, 0–100. Supplied by
   * assess() from the reused EU Taxonomy 8.1 `indicative_score`. Optional —
   * omitted when normalising a bare fixture without an engine run.
   */
  alignmentScorePercent?: number | null;
}

// -- Region mapping (coarse) -------------------------------------------------
// ISO 3166-1 alpha-2 → coarse Region. Deliberately partial: unknown codes fall
// through to "other". Used for benchmark anonymisation + regional lens notes.

const UK_EU = new Set([
  "GB", "IE", "DE", "FR", "NL", "BE", "LU", "DK", "SE", "FI", "NO", "IS",
  "PL", "CZ", "SK", "AT", "CH", "IT", "ES", "PT", "GR", "HU", "RO", "BG",
  "HR", "SI", "EE", "LV", "LT", "CY", "MT",
]);
const MENA = new Set([
  "SA", "AE", "QA", "KW", "OM", "BH", "JO", "LB", "IL", "IQ", "IR", "YE",
  "EG", "MA", "DZ", "TN", "LY", "TR",
]);
const AFRICA = new Set([
  "ZA", "NG", "KE", "GH", "ET", "TZ", "UG", "SN", "CI", "CM", "AO", "MZ",
  "ZM", "ZW", "RW", "BW", "NA", "MU",
]);
const APAC = new Set([
  "SG", "JP", "AU", "NZ", "IN", "CN", "HK", "TW", "KR", "ID", "MY", "TH",
  "VN", "PH", "BD", "PK", "LK",
]);

function toRegion(code: string | null | undefined): Region {
  if (!code) return "other";
  const c = code.toUpperCase();
  if (c === "US" || c === "USA") return "US";
  if (UK_EU.has(c)) return "UK-EU";
  if (MENA.has(c)) return "MENA";
  if (AFRICA.has(c)) return "Africa";
  if (APAC.has(c)) return "APAC";
  return "other";
}

// -- Small coercers ----------------------------------------------------------

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function firstNum(...vals: unknown[]): number | null {
  for (const v of vals) {
    const n = num(v);
    if (n !== null) return n;
  }
  return null;
}

function toAssetStage(status: string | undefined): AssetStage {
  switch (status) {
    case "operational":
      return "operational";
    case "construction":
      return "construction";
    case "design":
      return "design";
    default:
      return "unknown";
  }
}

function toWaterStress(classification: unknown): WaterStressBand {
  if (typeof classification !== "string") return "unknown";
  const s = classification.trim().toLowerCase();
  if (s === "low") return "low";
  if (s === "medium" || s === "medium-high" || s === "low-medium") return "medium";
  if (s === "high") return "high";
  if (s === "extremely high" || s === "extremely_high") return "extremely_high";
  return "unknown";
}

function toCoolingClass(design: unknown): CoolingTechnologyClass {
  switch (design) {
    case "dry":
      return "dry";
    case "hybrid":
      return "hybrid";
    case "evaporative":
      return "evaporative";
    default:
      return "unknown";
  }
}

// -- Source extraction -------------------------------------------------------

function projectOf(input: NormaliseSource): ProjectInput {
  return "project" in input && !("project_id" in input)
    ? (input as RunInput).project
    : (input as ProjectInput);
}

function entityOf(input: NormaliseSource): EntityInput | undefined {
  return "project" in input && !("project_id" in input)
    ? (input as RunInput).entity
    : undefined;
}

// -- The mapping -------------------------------------------------------------

export function normalise(
  input: NormaliseSource,
  ctx: NormaliseContext = {},
): CanonicalAssessment {
  const project = projectOf(input);
  const entity = entityOf(input);
  const dp: Record<string, unknown> = project.data_points ?? {};
  const dnsh: ProjectDNSHEvidence = project.sfdr?.dnsh?.evidence ?? {};
  const ukSdr: ProjectUKSDRInputs | undefined = project.uk_sdr;
  const baseline = ukSdr?.improvement_plan?.baseline_metrics;
  const strategy = ukSdr?.improvement_plan?.strategy;
  const targets = ukSdr?.improvement_plan?.targets;
  const dominance = project.sfdr?.art9?.si_objective?.dominance;
  const gov = entity?.sfdr?.governance;

  const assetStage = toAssetStage(project.facility_status);
  const isOperational = assetStage === "operational";

  // -- Energy --
  const pueAny = firstNum(
    dp["annualised_pue"],
    dp["pue_actual"],
    dnsh.pue,
    baseline?.pue_current,
  );
  const pueOperational = isOperational ? pueAny : firstNum(baseline?.pue_current);
  const pueDesign = isOperational ? null : pueAny;
  const renewableSharePercent = firstNum(
    dnsh.renewable_ppa_coverage_percent,
    baseline?.renewable_pct_current,
    targets?.renewable_pct_target,
  );

  // -- Water --
  const wue = firstNum(dp["wue_annualised"], dnsh.wue_value, baseline?.wue_current);
  const coolingTechnologyClass = toCoolingClass(dnsh.cooling_design);
  const waterStressBand = toWaterStress(dp["site_water_stress_classification"]);

  // -- Carbon --
  const scope12Aggregate = firstNum(baseline?.ghg_current);

  // -- Transition roadmap credibility --
  const roadmapPresent =
    ukSdr?.improvement_plan !== undefined ||
    dnsh.transition_pathway_documented === true ||
    dnsh.decarbonisation_pathway_documented === true ||
    project.sfdr?.art9?.si_objective?.sub_case_a !== undefined;
  const datedMilestones =
    (typeof strategy?.timeline_years === "number" && targets !== undefined) ||
    dnsh.decarbonisation_pathway_documented === true ||
    dnsh.transition_pathway_documented === true
      ? true
      : roadmapPresent
        ? false
        : null;
  // capex-linkage and board-approval are only knowable from the Art 9
  // dominance evidence today (IM/board-paper naming, economics tied to the
  // sustainability contribution). Absent that, null (not derivable).
  const capexLinked = dominance?.economic_rationale_depends_on_si ?? null;
  const boardApproved = dominance?.named_in_investment_memorandum ?? null;

  // -- Third-party verification / assurance strength --
  const thirdPartyVerification = deriveAssurance(input, dp);

  // -- Community & land (mostly future-lens fields; map what exists) --
  const climateRiskDone = dp["climate_risk_assessment_completed"] === true;

  const canonical: CanonicalAssessment = {
    assetId: project.project_id,
    context: {
      assetStage,
      hostRegion: toRegion(project.jurisdiction ?? (dp["country_code"] as string)),
      hostJurisdiction: project.jurisdiction ?? (typeof dp["country_code"] === "string" ? (dp["country_code"] as string) : null),
      facilityType: project.facility_type ?? null,
    },
    energy: {
      pueDesign,
      pueOperational,
      renewableSharePercent,
      // PPA structure/tenor/on-site generation are not carried by the current
      // input surface — modelled here (per Module 1) but null until intake adds
      // them. The future US social-license lens consumes grid provision.
      ppaStructure: "unknown",
      ppaTenorYears: null,
      onSiteGenerationMw: null,
      hostGridCarbonIntensity: null,
      behindTheMeterProvision: { state: "unknown", capacityMw: null },
    },
    water: {
      wue,
      coolingTechnologyClass,
      waterSourceType: "unknown",
      consumptiveSharePercent: null,
      waterStressBand,
    },
    carbon: {
      scope1: null,
      scope2Market: null,
      scope2Location: null,
      // If a single aggregate GHG figure was provided (UK SDR baseline), treat
      // it as a location-based scope 1+2 proxy so the value isn't lost; note
      // it stays partial disclosure.
      scope3DisclosureCompleteness: "unknown",
      embodiedCarbonDisclosed: "unknown",
      embodiedCarbonMethodology: null,
    },
    communityLand: {
      hostCommunityEngagement: "unknown",
      localEnergyPriceImpactAssessment: "unknown",
      noiseLandUsePermittingStatus: climateRiskDone ? "in_progress" : "unknown",
    },
    governance: {
      disclosureCompletenessScore: 0, // filled below
      thirdPartyVerification,
      transitionRoadmap: {
        present: roadmapPresent ? "present" : "absent",
        capexLinked,
        datedMilestones,
        boardApproved,
      },
    },
    derivedAlignmentScorePercent:
      ctx.alignmentScorePercent === undefined || ctx.alignmentScorePercent === null
        ? null
        : clamp0to100(ctx.alignmentScorePercent),
  };

  // Preserve the aggregate GHG proxy without inventing scope splits.
  if (scope12Aggregate !== null) {
    canonical.carbon.scope2Location = scope12Aggregate;
    canonical.carbon.scope3DisclosureCompleteness = "partial";
  }

  // Governance disclosure-completeness is DERIVED, not user-entered.
  canonical.governance.disclosureCompletenessScore =
    deriveDisclosureCompleteness(canonical, { hasGovernance: gov !== undefined });

  return canonical;
}

function clamp0to100(n: number): number {
  return Math.max(0, Math.min(100, n));
}

function deriveAssurance(
  input: NormaliseSource,
  dp: Record<string, unknown>,
): AssuranceStrength {
  const project = projectOf(input);
  const tier = project.sfdr?.art9?.evidence_pack?.assurance_tier;
  if (tier === "reasonable_big4") return "reasonable";
  if (tier === "limited_big4" || tier === "limited_partial") return "limited";
  if (tier === "management_only") return "none";

  const ukVerification =
    project.uk_sdr?.kpi_reporting_commitment?.verification_method ??
    project.uk_sdr?.improvement_plan?.strategy?.verification_method;
  if (ukVerification === "third_party_audit") return "limited";
  if (ukVerification === "internal") return "none";
  if (ukVerification === "none") return "none";

  // An independent-audit evidence document implies at least limited assurance.
  const hasIndependentAudit = (project.evidence_documents ?? []).some(
    (d) => d.document_type === "independent_audit",
  );
  if (hasIndependentAudit || dp["last_independent_audit_date"]) return "limited";

  return "unknown";
}

// Disclosure completeness = fraction of canonical signal slots that carry a
// concrete value. Deterministic, 0–1, two decimal places. Not user-entered.
function deriveDisclosureCompleteness(
  c: CanonicalAssessment,
  extra: { hasGovernance: boolean },
): number {
  const signals: boolean[] = [
    c.energy.pueOperational !== null || c.energy.pueDesign !== null,
    c.energy.renewableSharePercent !== null,
    c.water.wue !== null,
    c.water.waterStressBand !== "unknown",
    c.carbon.scope2Location !== null || c.carbon.scope1 !== null,
    c.governance.thirdPartyVerification !== "unknown" &&
      c.governance.thirdPartyVerification !== "none",
    c.governance.transitionRoadmap.present === "present",
    c.derivedAlignmentScorePercent !== null,
    extra.hasGovernance,
  ];
  const present = signals.filter(Boolean).length;
  return Math.round((present / signals.length) * 100) / 100;
}
