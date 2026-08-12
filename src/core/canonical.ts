// ============================================================================
// MetricsCore — CanonicalAssessment (framework-agnostic asset model)
// (Engine v4.0 — Module 1)
// ============================================================================
//
// THE canonical model. One metrics core, framework-agnostic. Every framework
// lens (EU SFDR 2.0, UK SDR, US social-license) is an adapter that reads THIS
// shape and nothing else.
//
// HARD RULE (Module 1): no canonical field may reference SFDR / SDR / Taxonomy /
// Article 8/9 or any framework by name. The core knows nothing about any
// framework. If you find yourself wanting to add `sfdrArticle` or
// `taxonomyAligned` here, stop — that belongs in a lens, not the core.
//
// All values are nullable: real intake data is sparse, and normalisation must
// never throw on a missing field. `null` = "not provided / not derivable";
// enums carry an explicit `"unknown"` member for the same reason. Lenses treat
// null/unknown as an evidence gap, never as a zero.
// ============================================================================

// -- Coarse enums (framework-neutral) ----------------------------------------

/** WRI Aqueduct-style water-stress band (or equivalent local indicator). */
export type WaterStressBand =
  | "low"
  | "medium"
  | "high"
  | "extremely_high"
  | "unknown";

/** Cooling technology class — physical, not framework-specific. */
export type CoolingTechnologyClass =
  | "air"
  | "dry"
  | "hybrid"
  | "evaporative"
  | "liquid"
  | "unknown";

export type WaterSourceType =
  | "potable"
  | "non_potable"
  | "reclaimed"
  | "seawater"
  | "groundwater"
  | "rainwater"
  | "unknown";

/** Power-purchase-agreement structure. */
export type PPAStructure =
  | "physical"
  | "virtual"
  | "sleeved"
  | "onsite"
  | "none"
  | "unknown";

/** Scope 3 disclosure completeness. */
export type DisclosureCompleteness = "none" | "partial" | "full" | "unknown";

/** Host-community engagement evidence ladder. */
export type CommunityEngagementLevel =
  | "none"
  | "consultation"
  | "binding_agreement"
  | "unknown";

/** Present/absent signal for an assessment artefact. */
export type PresenceState = "present" | "absent" | "unknown";

/** Permitting / land-use posture. */
export type PermittingStatus =
  | "not_started"
  | "in_progress"
  | "granted"
  | "refused"
  | "unknown";

/** Asset lifecycle stage. */
export type AssetStage = "design" | "construction" | "operational" | "unknown";

/**
 * Third-party verification / assurance strength over disclosed metrics.
 * Framework-neutral ladder (none → limited → reasonable).
 */
export type AssuranceStrength = "none" | "limited" | "reasonable" | "unknown";

/**
 * Coarse host region. Deliberately coarse — used for the benchmark residue
 * layer's anonymisation and for regionally-aware lens notes. NOT a precise
 * jurisdiction (that lives in `context.hostJurisdiction`).
 */
export type Region = "US" | "UK-EU" | "MENA" | "Africa" | "APAC" | "other";

// -- Canonical metric groups -------------------------------------------------

export interface EnergyMetrics {
  /** Design-stage PUE (pre-operational commitment). */
  pueDesign: number | null;
  /** Operational (annualised, measured) PUE. */
  pueOperational: number | null;
  /** Renewable electricity share, 0–100. */
  renewableSharePercent: number | null;
  ppaStructure: PPAStructure;
  /** PPA contract tenor in years, where a PPA is in place. */
  ppaTenorYears: number | null;
  /** On-site generation nameplate capacity, MW. */
  onSiteGenerationMw: number | null;
  /** Host-region grid carbon intensity, gCO2/kWh (location-based). */
  hostGridCarbonIntensity: number | null;
  /**
   * Modular / behind-the-meter grid provision the asset brings to the host
   * grid (e.g. co-located generation or grid-firming capacity). Present even
   * though no current lens fully consumes it — the future US social-license
   * lens scores grid contribution.
   */
  behindTheMeterProvision: {
    state: PresenceState;
    capacityMw: number | null;
  };
}

export interface WaterMetrics {
  /** Water Use Effectiveness, L/kWh. */
  wue: number | null;
  coolingTechnologyClass: CoolingTechnologyClass;
  waterSourceType: WaterSourceType;
  /** Share of water draw that is consumptive (not returned), 0–100. */
  consumptiveSharePercent: number | null;
  /** Local water-stress indicator. */
  waterStressBand: WaterStressBand;
}

export interface CarbonMetrics {
  /** Scope 1, tCO2e/yr. */
  scope1: number | null;
  /** Scope 2 market-based, tCO2e/yr. */
  scope2Market: number | null;
  /** Scope 2 location-based, tCO2e/yr. */
  scope2Location: number | null;
  scope3DisclosureCompleteness: DisclosureCompleteness;
  embodiedCarbonDisclosed: PresenceState;
  /** Methodology used for embodied-carbon disclosure, where disclosed. */
  embodiedCarbonMethodology: string | null;
}

export interface CommunityLandMetrics {
  hostCommunityEngagement: CommunityEngagementLevel;
  /** Whether a local energy-price impact assessment exists. */
  localEnergyPriceImpactAssessment: PresenceState;
  noiseLandUsePermittingStatus: PermittingStatus;
}

/**
 * A credible-transition-plan descriptor. The three credibility inputs
 * (capex-linked, dated milestones, board-approved) are the ones the EU lens
 * Transition category and the UK SDR Improvers label both key off. Each is
 * nullable because real disclosures rarely evidence all three.
 */
export interface TransitionRoadmap {
  present: PresenceState;
  capexLinked: boolean | null;
  datedMilestones: boolean | null;
  boardApproved: boolean | null;
}

export interface GovernanceDisclosureMetrics {
  /**
   * Disclosure completeness score, 0–1. DERIVED by normalise() from how many
   * canonical signals are populated — NOT user-entered. Deterministic.
   */
  disclosureCompletenessScore: number;
  thirdPartyVerification: AssuranceStrength;
  transitionRoadmap: TransitionRoadmap;
}

export interface CanonicalContext {
  assetStage: AssetStage;
  /** Coarse host region (benchmark + regional lens notes). */
  hostRegion: Region;
  /** Precise host jurisdiction (ISO country code), where provided. */
  hostJurisdiction: string | null;
  /** Facility archetype string as declared (hyperscale / colocation / …). */
  facilityType: string | null;
}

// -- The canonical assessment ------------------------------------------------

export interface CanonicalAssessment {
  /** Opaque project identifier. Hashed (never stored raw) by the benchmark layer. */
  assetId: string;
  context: CanonicalContext;
  energy: EnergyMetrics;
  water: WaterMetrics;
  carbon: CarbonMetrics;
  communityLand: CommunityLandMetrics;
  governance: GovernanceDisclosureMetrics;
  /**
   * Framework-NEUTRAL external-standard alignment score, 0–100, or null.
   *
   * Populated by normalise() by REUSING the existing EU Taxonomy 8.1
   * technical-screening computation (indicative_score) when a precomputed
   * value is supplied — normalisation happens once, here, never in a lens.
   * The field is named neutrally (no "taxonomy") to honour the Module 1 rule
   * that no canonical field references a framework. The EU lens maps this
   * number onto its Taxonomy safe-harbour finding; other lenses may read it
   * as a generic third-party-alignment signal. null when no upstream
   * computation was available (e.g. bare fixture mapping without an engine run).
   */
  derivedAlignmentScorePercent: number | null;
}
