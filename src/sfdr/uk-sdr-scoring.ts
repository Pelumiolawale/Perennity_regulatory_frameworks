// ============================================================================
// UK SDR scoring functions (v0.6.0 — Phase 2, UK SDR implementation)
// ============================================================================
//
// Fifteen deterministic scoring functions across three UK SDR labels:
//   - Sustainability Focus    : c1-c4 (asset profile, credible standard,
//                                proportion, KPI reporting)
//   - Sustainability Improvers: c5-c9 (baseline, strategy, KPI targets,
//                                progress monitoring, proportion)
//   - Sustainability Impact   : c10-c15 (objective, measurement, additionality,
//                                proportion, reporting, DNSH-equivalent)
//
// Each takes SFDRScoringContext and returns SFDRCriterionScore with five-band
// verdicts (aligned, partially_aligned, not_aligned, insufficient_evidence,
// not_applicable). Routes through the same SFDR orchestrator as Art 8 / Art 9.
//
// Cross-framework dependencies:
//   - c1  (asset_sustainability_profile) reads EU Taxonomy 8.1 verdict
//   - c15 (no_significant_harm) reads EU Taxonomy 8.1 dnsh_results
//
// Intra-framework dependencies:
//   - c3  (sustainable_proportion_threshold)        depends on c1, c2
//   - c7  (improvement_kpi_targets)                 depends on c5
//   - c9  (improvement_proportion_threshold)        depends on c5, c6, c7, c8
//   - c11 (impact_measurement)                      depends on c10
//   - c13 (impact_proportion_threshold)             depends on c10, c11, c12
//
// Numeric thresholds in this file are PB methodology v3.5, not regulation —
// FCA PS23/16 does not prescribe sector-specific quantitative thresholds for
// data centres. PB calibration is traceable to EU Taxonomy 8.1, CNDCP, and
// industry-recognised equivalents per the credible-standards constants file.
// ============================================================================

import type { SFDRScoringFn } from "./orchestration";
import type {
  ProjectUKSDRInputs,
  SFDRCriterionScore,
  UKSDRImpactPlan,
  UKSDRImprovementPlan,
  UKSDRKPIName,
} from "./types";
import type { SFDRScoringContext } from "./orchestration";

// -- Helpers -----------------------------------------------------------------

function getProjectUKSDR(ctx: SFDRScoringContext): ProjectUKSDRInputs | undefined {
  return ctx.project.uk_sdr;
}

// v0.6.2: every helper takes an optional `citations` array for paid-tier
// regulatory citation strings. These are forwarded by the orchestrator into
// CriterionResult.regulatory_citations and explicitly blocked from
// SnapshotOutput by the structural gate. NEVER inline citations into the
// `rationale` string — that's the free-tier leak the gate test catches.

function insufficient(rationale: string, citations?: string[]): SFDRCriterionScore {
  const out: SFDRCriterionScore = { band: "insufficient_evidence", rationale_text: rationale };
  if (citations && citations.length > 0) out.regulatory_citations = citations;
  return out;
}

function aligned(
  rationale: string,
  numeric?: SFDRCriterionScore["numeric_value"],
  citations?: string[],
): SFDRCriterionScore {
  const out: SFDRCriterionScore = { band: "aligned", rationale_text: rationale };
  if (numeric) out.numeric_value = numeric;
  if (citations && citations.length > 0) out.regulatory_citations = citations;
  return out;
}

function partially(
  rationale: string,
  numeric?: SFDRCriterionScore["numeric_value"],
  citations?: string[],
): SFDRCriterionScore {
  const out: SFDRCriterionScore = {
    band: "partially_aligned",
    rationale_text: rationale,
  };
  if (numeric) out.numeric_value = numeric;
  if (citations && citations.length > 0) out.regulatory_citations = citations;
  return out;
}

function notAligned(
  rationale: string,
  numeric?: SFDRCriterionScore["numeric_value"],
  citations?: string[],
): SFDRCriterionScore {
  const out: SFDRCriterionScore = {
    band: "not_aligned",
    rationale_text: rationale,
  };
  if (numeric) out.numeric_value = numeric;
  if (citations && citations.length > 0) out.regulatory_citations = citations;
  return out;
}

// -- Recognised credible standards (PB methodology v3.5) ---------------------
//
// These match the constants file at regulatory-knowledge/constants/
// uk_sdr_v1_credible_standards_data_centre.json. FCA PS23/16 requires
// standards to be "robust" but does not enumerate them; this set is PB's
// calibration for data-centre assets. Update both the constants JSON and
// this Set in lockstep when the recognised set changes.

const FULL_CREDIBLE_STANDARDS = new Set<string>([
  "eu_taxonomy_8_1",
  "eu_taxonomy",
  "leed_platinum",
]);

const PARTIAL_CREDIBLE_STANDARDS = new Set<string>(["sbti", "sbti_validated"]);

const REQUIRED_KPIS: readonly UKSDRKPIName[] = [
  "pue",
  "renewable_energy_pct",
  "ghg_emissions",
  "wue",
];

// -- Sustainability Focus criteria -------------------------------------------

/**
 * c1 — Asset sustainability profile (credible standard alignment).
 *
 * Cross-framework: reads EU Taxonomy 8.1 framework result. The data-centre
 * credible-standard calibration is EU Taxonomy 8.1 alignment.
 *
 * Bands:
 *   - aligned                : EU Tax 8.1 verdict = pass (fully aligned)
 *   - partially_aligned      : EU Tax 8.1 verdict = partial
 *   - not_aligned            : EU Tax 8.1 verdict = fail
 *   - insufficient_evidence  : EU Tax 8.1 not scored OR no UK SDR input
 */
export const uk_sdr_c1_asset_sustainability_profile: SFDRScoringFn = (ctx) => {
  if (!getProjectUKSDR(ctx)) {
    return insufficient(
      "No UK SDR input provided. Sustainability Focus label requires evidence the asset " +
        "meets a credible sustainability standard.",
    );
  }
  const euTax = ctx.framework_results.get("eu_tax_climate_8_1");
  if (!euTax) {
    return insufficient(
      "EU Taxonomy 8.1 framework not scored in this run. PB methodology calibrates the " +
        "Sustainability Focus 'credible sustainability standard' as EU Taxonomy Activity 8.1 " +
        "alignment for data centres; the upstream assessment must run.",
      ["FCA PS23/16 ¶4.23"],
    );
  }
  // v0.6.2 (Tier 1 audit item #3): explicit handling for EU Tax 8.1
  // overall_verdict === "not_applicable". This fires when the developer
  // makes no Taxonomy claim under SFDR Art 8 light-green positioning —
  // the regulatorily correct path for many real DC engagements. Pre-v0.6.2
  // this case fell through to the catch-all notAligned branch with
  // rationale claiming "claim made and rejected," which was semantically
  // wrong (no claim was made; nothing was rejected). Now returns
  // not_aligned with rationale citing the unmet credible-standard
  // dependency and pointing at alternative recognised standards.
  if (euTax.overall_verdict === "not_applicable") {
    return notAligned(
      "EU Taxonomy 8.1 verdict is 'not applicable' — the developer made no claim under Activity 8.1. " +
        "Sustainability Focus eligibility requires a credible sustainability standard; absent a " +
        "Taxonomy claim, alternative recognised standards (LEED Platinum with Energy & Atmosphere " +
        "prerequisites, SBTi) must be claimed and evidenced separately for this label to apply.",
      { value: 0, unit: "standard", label: "No Taxonomy claim; alternative standard required" },
      ["FCA PS23/16 ¶4.23"],
    );
  }
  const v = euTax.overall_verdict;
  if (v === "pass" || v === "aligned") {
    return aligned(
      "Asset is aligned with EU Taxonomy Activity 8.1 (data processing, hosting and related " +
        "activities). Under PB methodology, this satisfies the Sustainability Focus " +
        "credible-standard requirement.",
      { value: 1, unit: "standard", label: "Credible standard: EU Taxonomy 8.1" },
      ["FCA PS23/16 ¶4.23"],
    );
  }
  if (v === "partial" || v === "partially_aligned") {
    return partially(
      "Asset is partially aligned with EU Taxonomy Activity 8.1 (substantial contribution met " +
        "but DNSH or safeguards gaps remain). Provisional eligibility pending gap remediation; " +
        "fund manager discretion applies for the 70% sustainable-assets threshold.",
      { value: 0.5, unit: "standard", label: "Credible standard: EU Taxonomy 8.1 (partial)" },
    );
  }
  if (v === "data_missing" || v === "insufficient_evidence") {
    return insufficient(
      "EU Taxonomy Activity 8.1 assessment lacks sufficient evidence to determine alignment. " +
        "Sustainability Focus eligibility cannot be assessed until upstream Taxonomy inputs are complete.",
    );
  }
  return notAligned(
    "Asset does not meet EU Taxonomy Activity 8.1 alignment. PB methodology calibrates the " +
      "Sustainability Focus credible-standard requirement as EU Taxonomy 8.1 for data centres; " +
      "alternative credible standards (LEED Platinum + E&A prerequisites) are recognised but must " +
      "be claimed and evidenced separately.",
    { value: 0, unit: "standard", label: "No credible standard met" },
    ["FCA PS23/16 ¶4.23"],
  );
};

/**
 * c2 — Credible sustainability standard recognition.
 *
 * Tests whether the standard the developer claims is one PB methodology
 * recognises as credible. Pure project-level: no upstream reads needed
 * beyond the UK SDR input.
 */
export const uk_sdr_c2_credible_sustainability_standard: SFDRScoringFn = (ctx) => {
  const uk = getProjectUKSDR(ctx);
  const claimed = uk?.sustainability_standard_claimed;
  if (!claimed) {
    return insufficient(
      "No sustainability standard claimed by the developer. PB methodology recognises EU " +
        "Taxonomy 8.1, LEED Platinum, and (partially) SBTi as credible standards for data-centre " +
        "Sustainability Focus eligibility.",
    );
  }
  const normalised = claimed.toLowerCase();
  if (FULL_CREDIBLE_STANDARDS.has(normalised)) {
    return aligned(
      `Claimed standard "${claimed}" is recognised by PB methodology as a credible ` +
        "sustainability standard for data-centre assets under the UK SDR Sustainability Focus label.",
      { value: 1, unit: "standing", label: `Recognised credible standard: ${claimed}` },
      ["FCA PS23/16 ¶4.23"],
    );
  }
  if (PARTIAL_CREDIBLE_STANDARDS.has(normalised)) {
    return partially(
      `Claimed standard "${claimed}" provides credible coverage of emissions trajectory but ` +
        "does not cover the full sustainability profile required for the Sustainability Focus label. " +
        "Standing for Sustainability Improvers / Impact labels is stronger; for Focus, this caps at " +
        "partially aligned pending complementary evidence (e.g. EU Taxonomy 8.1).",
      { value: 0.5, unit: "standing", label: `Partial credible standard: ${claimed}` },
    );
  }
  return notAligned(
    `Claimed standard "${claimed}" is not recognised by PB methodology as a credible ` +
      "sustainability standard for data-centre assets. Recognised standards: EU Taxonomy 8.1 " +
      "(preferred), LEED Platinum with Energy & Atmosphere prerequisites, SBTi (partial).",
    { value: 0, unit: "standing", label: `Non-recognised standard: ${claimed}` },
  );
};

/**
 * c3 — Sustainable proportion (asset-level qualification for fund 70%).
 *
 * Intra-framework dep: c1, c2. Asset-level qualification is binary: both
 * upstream gates must be aligned for the asset to count toward fund 70%.
 */
export const uk_sdr_c3_sustainable_proportion_threshold: SFDRScoringFn = (ctx) => {
  const c1 = ctx.dependencies.get("uk_sdr_v1_asset_sustainability_profile");
  const c2 = ctx.dependencies.get("uk_sdr_v1_credible_sustainability_standard");
  if (!c1 || !c2) {
    return insufficient(
      "Cannot assess sustainable-proportion qualification without c1 (asset sustainability " +
        "profile) and c2 (credible standard recognition) results.",
    );
  }
  if (c1.band === "aligned" && c2.band === "aligned") {
    return aligned(
      "Asset qualifies toward a Sustainability Focus fund's sustainable-assets threshold. " +
        "Both upstream gates aligned: credible standard met (c1) and standard is recognised (c2). " +
        "FMP counts this asset in the fund numerator.",
      { value: 1, unit: "qualifying_asset", label: "Qualifies for fund threshold" },
      ["FCA PS23/16 ¶4.23"],
    );
  }
  if (
    (c1.band === "aligned" || c1.band === "partially_aligned") &&
    (c2.band === "aligned" || c2.band === "partially_aligned")
  ) {
    return partially(
      "Asset partially qualifies toward fund's 70% threshold. Upstream gates mixed: " +
        `c1=${c1.band}, c2=${c2.band}. FMP discretion applies; may count with disclosure of gaps.`,
      { value: 0.5, unit: "qualifying_asset", label: "Partial qualification" },
    );
  }
  return notAligned(
    "Asset does not qualify toward Sustainability Focus fund's 70% threshold. Upstream gates: " +
      `c1=${c1.band}, c2=${c2.band}. Full qualification requires both aligned.`,
    { value: 0, unit: "qualifying_asset", label: "Does not qualify" },
  );
};

/**
 * c4 — Asset-level KPI reporting commitment.
 *
 * Tests whether developer has committed to annual reporting of the four
 * data-centre KPIs material under PB methodology v3.5.
 */
export const uk_sdr_c4_asset_kpi_reporting: SFDRScoringFn = (ctx) => {
  const uk = getProjectUKSDR(ctx);
  const commit = uk?.kpi_reporting_commitment;
  if (!commit) {
    return insufficient(
      "No KPI reporting commitment provided. Sustainability Focus label requires annual " +
        "disclosure of asset-level KPIs (PB methodology: PUE, renewable energy %, GHG Scope 1+2, WUE).",
    );
  }
  const committed = new Set(commit.kpis_committed ?? []);
  const present = REQUIRED_KPIS.filter((k) => committed.has(k));
  const missing = REQUIRED_KPIS.filter((k) => !committed.has(k));
  const isAnnual = commit.reporting_frequency === "annual";

  if (present.length === REQUIRED_KPIS.length && isAnnual) {
    return aligned(
      "Developer commits to annual reporting of all four required KPIs (PUE, renewable %, " +
        "GHG, WUE). Meets PB methodology reporting expectation for the Sustainability Focus label.",
      {
        value: present.length,
        unit: "KPIs",
        label: `${present.length}/${REQUIRED_KPIS.length} required KPIs committed`,
      },
    );
  }
  if (present.length >= 3 && isAnnual) {
    return partially(
      `Developer commits to ${present.length} of ${REQUIRED_KPIS.length} required KPIs at annual ` +
        `cadence. Missing: ${missing.join(", ")}. Full alignment requires all four KPIs at annual cadence.`,
      {
        value: present.length,
        unit: "KPIs",
        label: `${present.length}/${REQUIRED_KPIS.length} required KPIs committed`,
      },
    );
  }
  return notAligned(
    `Reporting commitment insufficient: ${present.length} of ${REQUIRED_KPIS.length} required KPIs ` +
      `committed${isAnnual ? "" : "; cadence not annual"}. PB methodology requires all four ` +
      "KPIs at annual cadence for Sustainability Focus alignment.",
    {
      value: present.length,
      unit: "KPIs",
      label: `${present.length}/${REQUIRED_KPIS.length} required KPIs committed`,
    },
  );
};

// -- Sustainability Improvers criteria ---------------------------------------

function baselineCompleteness(plan?: UKSDRImprovementPlan): {
  present: string[];
  missing: string[];
} {
  const required = ["pue_current", "renewable_pct_current", "ghg_current"] as const;
  const baseline = plan?.baseline_metrics ?? {};
  const present = required.filter(
    (k) => (baseline as Record<string, unknown>)[k] !== undefined,
  );
  const missing = required.filter(
    (k) => (baseline as Record<string, unknown>)[k] === undefined,
  );
  return { present: [...present], missing: [...missing] };
}

/**
 * c5 — Baseline sustainability assessment.
 */
export const uk_sdr_c5_baseline_sustainability_assessment: SFDRScoringFn = (ctx) => {
  const uk = getProjectUKSDR(ctx);
  const plan = uk?.improvement_plan;
  if (!plan?.baseline_metrics) {
    return insufficient(
      "No baseline metrics provided. Sustainability Improvers label requires baseline " +
        "measurement of current performance against which improvement is assessed (PB methodology: " +
        "current PUE, renewable %, GHG Scope 1+2).",
    );
  }
  const { present, missing } = baselineCompleteness(plan);
  if (missing.length === 0) {
    return aligned(
      "Baseline established with all three required metrics (current PUE, renewable %, GHG). " +
        "Provides credible foundation for improvement trajectory assessment under the UK SDR " +
        "Sustainability Improvers label.",
      { value: present.length, unit: "metrics", label: "Complete baseline" },
      ["FCA PS23/16 ¶4.28"],
    );
  }
  if (present.length >= 2) {
    return partially(
      `Partial baseline: ${present.length} of 3 required metrics present. Missing: ${missing.join(", ")}. ` +
        "Full Improvers alignment requires complete baseline.",
      { value: present.length, unit: "metrics", label: "Partial baseline" },
    );
  }
  return notAligned(
    `Insufficient baseline: only ${present.length} of 3 required metrics present. ` +
      "Sustainability Improvers label requires current PUE, renewable %, and GHG to establish trajectory.",
    { value: present.length, unit: "metrics", label: "Incomplete baseline" },
  );
};

/**
 * c6 — Improvement strategy (credible plan with timeline).
 */
export const uk_sdr_c6_improvement_strategy: SFDRScoringFn = (ctx) => {
  const uk = getProjectUKSDR(ctx);
  const strategy = uk?.improvement_plan?.strategy;
  if (!strategy) {
    return insufficient(
      "No improvement strategy provided. Sustainability Improvers label requires a credible " +
        "plan with defined actions and timeline.",
      ["FCA PS23/16 ¶4.29"],
    );
  }
  const years = strategy.timeline_years;
  const actionCount = strategy.actions?.length ?? 0;
  if (years !== undefined && years <= 3 && actionCount >= 3) {
    return aligned(
      `Credible improvement strategy: ${years}-year timeline with ${actionCount} specific actions. ` +
        "Meets PB methodology aligned-tier expectation for a short-horizon plan with concrete actions " +
        "delivering material improvement.",
      { value: years, unit: "years", label: `${years}-year, ${actionCount}-action plan` },
      ["FCA PS23/16 ¶4.29"],
    );
  }
  if (years !== undefined && years <= 5 && actionCount >= 1) {
    return partially(
      `Improvement strategy with ${years}-year timeline and ${actionCount} action(s). PB methodology ` +
        "aligned tier requires a short-horizon plan with multiple specific actions; current plan falls " +
        "in the partial band (longer horizon acceptable with justification).",
      { value: years, unit: "years", label: "Extended-timeline plan" },
      ["FCA PS23/16 ¶4.29"],
    );
  }
  return notAligned(
    `Improvement strategy does not meet credibility threshold: timeline=${years ?? "unspecified"} years, ` +
      `actions=${actionCount}. PB methodology requires a defined timeline and at least one specific ` +
      "action; aligned tier additionally requires a short horizon with multiple actions.",
    { value: years ?? 0, unit: "years", label: "Insufficient strategy" },
    ["FCA PS23/16 ¶4.29"],
  );
};

/**
 * c7 — Improvement KPI targets (quantified).
 *
 * Intra-framework dep: c5 (baseline must exist to assess target materiality).
 */
export const uk_sdr_c7_improvement_kpi_targets: SFDRScoringFn = (ctx) => {
  const uk = getProjectUKSDR(ctx);
  const targets = uk?.improvement_plan?.targets;
  if (!targets) {
    return insufficient(
      "No quantified improvement targets provided. Sustainability Improvers label requires " +
        "quantified targets for the four data-centre KPIs (PB methodology).",
    );
  }
  const fields = ["pue_target", "renewable_pct_target", "ghg_reduction_pct", "wue_target"];
  const quantified = fields.filter(
    (f) => (targets as Record<string, unknown>)[f] !== undefined,
  );
  const c5 = ctx.dependencies.get("uk_sdr_v1_baseline_sustainability_assessment");
  const baselineWeak = c5 && (c5.band === "not_aligned" || c5.band === "insufficient_evidence");

  if (quantified.length >= 3 && !baselineWeak) {
    return aligned(
      `Quantified targets for ${quantified.length} of 4 data-centre KPIs provided, anchored to ` +
        "a credible baseline (c5). Meets PB methodology aligned-tier expectation for material quantified improvement.",
      { value: quantified.length, unit: "KPIs", label: `${quantified.length}/4 quantified targets` },
    );
  }
  if (quantified.length >= 2) {
    return partially(
      `Partial: ${quantified.length} of 4 KPIs have quantified targets` +
        (baselineWeak ? "; baseline (c5) is incomplete which limits materiality assessment." : "."),
      { value: quantified.length, unit: "KPIs", label: `${quantified.length}/4 quantified targets` },
    );
  }
  return notAligned(
    `Only ${quantified.length} of 4 KPIs have quantified targets. PB methodology requires ` +
      "multiple quantified KPI targets for Sustainability Improvers alignment; the aligned tier " +
      "requires more than the partial band.",
    { value: quantified.length, unit: "KPIs", label: `${quantified.length}/4 quantified targets` },
  );
};

/**
 * c8 — Progress monitoring and reporting commitment.
 */
export const uk_sdr_c8_progress_monitoring: SFDRScoringFn = (ctx) => {
  const uk = getProjectUKSDR(ctx);
  const commit = uk?.kpi_reporting_commitment;
  if (!commit) {
    return insufficient(
      "No progress monitoring commitment provided. Sustainability Improvers label requires " +
        "an explicit reporting commitment against the improvement plan.",
      ["FCA PS23/16 ¶4.31"],
    );
  }
  const isAnnual = commit.reporting_frequency === "annual";
  const hasVerification =
    commit.verification_method !== undefined && commit.verification_method !== "none";

  if (isAnnual && hasVerification) {
    return aligned(
      "Annual progress reporting with stated verification mechanism " +
        `(${commit.verification_method}). Meets PB methodology aligned-tier expectation for ` +
        "Sustainability Improvers progress monitoring.",
      { value: 1, unit: "cadence", label: "Annual + verified" },
      ["FCA PS23/16 ¶4.31"],
    );
  }
  if (isAnnual) {
    return partially(
      "Annual progress reporting committed but no verification mechanism stated. PB methodology " +
        "aligned tier requires both annual cadence and a stated verification mechanism (third-party " +
        "assurance or independent technical audit).",
      { value: 0.5, unit: "cadence", label: "Annual without verification" },
      ["FCA PS23/16 ¶4.31"],
    );
  }
  return notAligned(
    "Progress monitoring commitment does not meet annual cadence (current: " +
      `${commit.reporting_frequency ?? "unspecified"}). UK SDR Sustainability Improvers expects at least ` +
      "annual reporting against the improvement plan.",
    { value: 0, unit: "cadence", label: "Insufficient cadence" },
    ["FCA PS23/16 ¶4.31"],
  );
};

/**
 * c9 — Improvement proportion (asset-level qualification for fund 70%).
 *
 * Intra-framework deps: c5, c6, c7, c8. All four upstream gates must be
 * aligned for the asset to count toward fund 70% threshold; cascade rule
 * means any not_aligned upstream forces this criterion to not_aligned.
 */
export const uk_sdr_c9_improvement_proportion_threshold: SFDRScoringFn = (ctx) => {
  const upstreamIds = [
    "uk_sdr_v1_baseline_sustainability_assessment",
    "uk_sdr_v1_improvement_strategy",
    "uk_sdr_v1_improvement_kpi_targets",
    "uk_sdr_v1_progress_monitoring",
  ];
  const upstream = upstreamIds.map((id) => ctx.dependencies.get(id));
  if (upstream.some((s) => !s)) {
    return insufficient(
      "Cannot assess improvement-proportion qualification without all four upstream Improvers " +
        "criteria results (c5 baseline, c6 strategy, c7 targets, c8 monitoring).",
    );
  }
  const bands = upstream.map((s) => s!.band);
  const notAlignedCount = bands.filter((b) => b === "not_aligned").length;
  const insufficientCount = bands.filter((b) => b === "insufficient_evidence").length;
  const alignedCount = bands.filter((b) => b === "aligned").length;

  if (alignedCount === 4) {
    return aligned(
      "Asset qualifies toward a Sustainability Improvers fund's threshold. All four upstream " +
        "Improvers gates aligned (baseline, strategy, targets, monitoring).",
      { value: 1, unit: "qualifying_asset", label: "Qualifies for fund threshold" },
      ["FCA PS23/16 ¶4.28"],
    );
  }
  if (notAlignedCount > 0) {
    return notAligned(
      `Asset does not qualify toward fund's 70% threshold. ${notAlignedCount} upstream Improvers ` +
        "criteria not aligned; cascade rule prevents qualification.",
      { value: 0, unit: "qualifying_asset", label: "Cascade not_aligned" },
    );
  }
  if (insufficientCount >= 2) {
    return insufficient(
      `Insufficient upstream evidence: ${insufficientCount} of 4 Improvers criteria are ` +
        "insufficient_evidence. Improvement-proportion qualification cannot be assessed.",
    );
  }
  return partially(
    `Asset partially qualifies. Upstream bands: ${bands.join(", ")}. FMP discretion applies.`,
    { value: 0.5, unit: "qualifying_asset", label: "Partial qualification" },
  );
};

// -- Sustainability Impact criteria ------------------------------------------

function hasImpactObjectiveContent(plan?: UKSDRImpactPlan): boolean {
  return !!plan?.impact_objective && plan.impact_objective.trim().length > 0;
}

/**
 * c10 — Defined impact objective.
 */
export const uk_sdr_c10_impact_objective: SFDRScoringFn = (ctx) => {
  const plan = getProjectUKSDR(ctx)?.impact_plan;
  if (!plan) {
    return insufficient(
      "No impact plan provided. Sustainability Impact label requires a specific positive " +
        "sustainability outcome objective.",
      ["FCA PS23/16 ¶4.32"],
    );
  }
  if (!hasImpactObjectiveContent(plan)) {
    return notAligned(
      "Impact plan present but no impact objective named. Sustainability Impact label requires a " +
        "specific, measurable impact objective.",
      undefined,
      ["FCA PS23/16 ¶4.32"],
    );
  }
  const hasCategory = !!plan.objective_category && plan.objective_category.length > 0;
  const declared = !!plan.declared_in && plan.declared_in.length > 0;

  if (hasCategory && declared) {
    return aligned(
      `Impact objective "${plan.impact_objective}" is named, categorised ` +
        `(${plan.objective_category}), and declared in deal-defining documentation (${plan.declared_in}). ` +
        "Meets PB methodology aligned-tier expectation for the Sustainability Impact label.",
      { value: 1, unit: "objective", label: "Categorised and declared" },
      ["FCA PS23/16 ¶4.32"],
    );
  }
  if (hasCategory || declared) {
    return partially(
      `Impact objective named ("${plan.impact_objective}") but ` +
        `${hasCategory ? "not declared in deal-defining documentation" : "not categorised against a recognised taxonomy"}. ` +
        "PB methodology aligned tier requires both.",
      { value: 0.5, unit: "objective", label: "Partial specification" },
      ["FCA PS23/16 ¶4.32"],
    );
  }
  return partially(
    `Impact objective named ("${plan.impact_objective}") but lacks categorisation and deal-documentation ` +
      "anchor. PB methodology aligned tier requires both for full alignment.",
    { value: 0.5, unit: "objective", label: "Named only" },
    ["FCA PS23/16 ¶4.32"],
  );
};

/**
 * c11 — Impact measurement (theory of change + quantified indicators).
 *
 * Intra-framework dep: c10 (objective must exist before measurement is assessable).
 */
export const uk_sdr_c11_impact_measurement: SFDRScoringFn = (ctx) => {
  const plan = getProjectUKSDR(ctx)?.impact_plan;
  const c10 = ctx.dependencies.get("uk_sdr_v1_impact_objective");
  if (!plan) {
    return insufficient(
      "No impact plan provided. Sustainability Impact label requires theory of change with " +
        "quantified indicators.",
      ["FCA PS23/16 ¶4.34"],
    );
  }
  if (c10 && c10.band === "not_aligned") {
    return notAligned(
      "Cascade rule: c10 (impact objective) is not_aligned, so impact measurement cannot be " +
        "satisfied — there is no objective against which to measure.",
      undefined,
      ["FCA PS23/16 ¶4.34"],
    );
  }
  const hasToC = !!plan.theory_of_change && plan.theory_of_change.trim().length > 0;
  const indicators = plan.quantified_indicators ?? [];
  const wellFormedIndicators = indicators.filter(
    (i) =>
      typeof i.baseline === "number" &&
      typeof i.target === "number" &&
      i.name.length > 0 &&
      i.unit.length > 0,
  );

  if (hasToC && wellFormedIndicators.length >= 3) {
    return aligned(
      `Theory of change documented with ${wellFormedIndicators.length} well-formed quantified ` +
        "indicators. Meets PB methodology aligned-tier expectation (written ToC plus multiple quantified indicators).",
      {
        value: wellFormedIndicators.length,
        unit: "indicators",
        label: `${wellFormedIndicators.length} quantified indicators`,
      },
      ["FCA PS23/16 ¶4.34"],
    );
  }
  if (hasToC || wellFormedIndicators.length >= 2) {
    return partially(
      `${hasToC ? "Theory of change present" : "No documented theory of change"}; ` +
        `${wellFormedIndicators.length} quantified indicator(s) provided. PB methodology aligned ` +
        "tier requires both a ToC and multiple quantified indicators.",
      {
        value: wellFormedIndicators.length,
        unit: "indicators",
        label: `${wellFormedIndicators.length} quantified indicators`,
      },
      ["FCA PS23/16 ¶4.34"],
    );
  }
  return notAligned(
    `Insufficient measurement: ToC ${hasToC ? "present" : "absent"}, ` +
      `${wellFormedIndicators.length} quantified indicators. PB methodology requires both ` +
      "a written theory of change and multiple quantified contribution indicators.",
    {
      value: wellFormedIndicators.length,
      unit: "indicators",
      label: `${wellFormedIndicators.length} quantified indicators`,
    },
    ["FCA PS23/16 ¶4.34"],
  );
};

/**
 * c12 — Impact additionality (evidence of contribution to solution).
 */
export const uk_sdr_c12_impact_additionality: SFDRScoringFn = (ctx) => {
  const plan = getProjectUKSDR(ctx)?.impact_plan;
  if (!plan) {
    return insufficient(
      "No impact plan provided. Sustainability Impact label requires explicit additionality evidence.",
      ["FCA PS23/16 ¶4.35"],
    );
  }
  const evidence = plan.additionality_evidence;
  if (!evidence || evidence.trim().length === 0) {
    return notAligned(
      "No additionality evidence provided. The Sustainability Impact label requires the asset's " +
        "contribution to be material and attributable; PB methodology requires written additionality " +
        "narrative (counterfactual, sustainability-linked capital structure, or step-change evidence).",
      undefined,
      ["FCA PS23/16 ¶4.35"],
    );
  }
  if (evidence.length >= 200) {
    return aligned(
      "Substantive additionality evidence provided. Meets PB methodology aligned-tier expectation " +
        "for explicit attribution of impact to this asset/financing.",
      { value: evidence.length, unit: "chars", label: "Substantive narrative" },
      ["FCA PS23/16 ¶4.35"],
    );
  }
  return partially(
    `Additionality narrative is brief (${evidence.length} characters). Acceptable as partial ` +
      "evidence; full alignment requires substantive explanation of counterfactual or attribution mechanism.",
    { value: evidence.length, unit: "chars", label: "Brief narrative" },
    ["FCA PS23/16 ¶4.35"],
  );
};

/**
 * c13 — Impact proportion (asset-level qualification for fund 70%).
 *
 * Intra-framework deps: c10, c11, c12. Cascade: any not_aligned upstream
 * forces this criterion to not_aligned.
 */
export const uk_sdr_c13_impact_proportion_threshold: SFDRScoringFn = (ctx) => {
  const upstreamIds = [
    "uk_sdr_v1_impact_objective",
    "uk_sdr_v1_impact_measurement",
    "uk_sdr_v1_impact_additionality",
  ];
  const upstream = upstreamIds.map((id) => ctx.dependencies.get(id));
  if (upstream.some((s) => !s)) {
    return insufficient(
      "Cannot assess impact-proportion qualification without all three upstream Impact criteria " +
        "results (c10 objective, c11 measurement, c12 additionality).",
    );
  }
  const bands = upstream.map((s) => s!.band);
  const notAlignedCount = bands.filter((b) => b === "not_aligned").length;
  const alignedCount = bands.filter((b) => b === "aligned").length;

  if (alignedCount === 3) {
    return aligned(
      "Asset qualifies toward a Sustainability Impact fund's threshold. All three upstream " +
        "Impact gates aligned (objective, measurement, additionality).",
      { value: 1, unit: "qualifying_asset", label: "Qualifies for fund threshold" },
      ["FCA PS23/16 ¶4.32"],
    );
  }
  if (notAlignedCount > 0) {
    return notAligned(
      `Asset does not qualify toward fund's 70% threshold. ${notAlignedCount} upstream Impact ` +
        "criteria not aligned; cascade rule prevents qualification.",
      { value: 0, unit: "qualifying_asset", label: "Cascade not_aligned" },
    );
  }
  return partially(
    `Asset partially qualifies. Upstream bands: ${bands.join(", ")}. FMP discretion applies.`,
    { value: 0.5, unit: "qualifying_asset", label: "Partial qualification" },
  );
};

/**
 * c14 — Annual impact reporting commitment.
 */
export const uk_sdr_c14_impact_reporting: SFDRScoringFn = (ctx) => {
  const plan = getProjectUKSDR(ctx)?.impact_plan;
  if (!plan?.reporting_commitment) {
    return insufficient(
      "No impact reporting commitment provided. Sustainability Impact label requires annual " +
        "reporting against the theory of change.",
      ["FCA PS23/16 ¶4.37"],
    );
  }
  const c = plan.reporting_commitment;
  const checks: { name: string; ok: boolean }[] = [
    { name: "annual cadence", ok: !!c.annual_cadence },
    { name: "reports against quantified indicators", ok: !!c.reports_against_indicators },
    { name: "outcome-level reporting", ok: !!c.outcome_level_reporting },
    {
      name: "verification mechanism",
      ok: !!c.verification_method && c.verification_method !== "none",
    },
  ];
  const passed = checks.filter((x) => x.ok).length;

  if (passed === 4) {
    return aligned(
      "Annual impact reporting committed with all four elements: annual cadence, reporting against " +
        "quantified indicators, outcome-level (not activity-only), and stated verification mechanism. " +
        "Meets PB methodology aligned-tier expectation for Sustainability Impact reporting.",
      { value: passed, unit: "elements", label: `${passed}/4 reporting elements` },
      ["FCA PS23/16 ¶4.37"],
    );
  }
  if (passed >= 2) {
    const missing = checks.filter((x) => !x.ok).map((x) => x.name);
    return partially(
      `${passed} of 4 reporting elements committed. Missing: ${missing.join(", ")}. ` +
        "PB methodology aligned tier requires all four elements.",
      { value: passed, unit: "elements", label: `${passed}/4 reporting elements` },
      ["FCA PS23/16 ¶4.37"],
    );
  }
  return notAligned(
    `Reporting commitment insufficient: ${passed} of 4 elements committed. The Sustainability ` +
      "Impact label expects annual outcome-level reporting against the theory of change.",
    { value: passed, unit: "elements", label: `${passed}/4 reporting elements` },
    ["FCA PS23/16 ¶4.37"],
  );
};

/**
 * c15 — No-significant-harm screen (DNSH-equivalent).
 *
 * Cross-framework: reads EU Taxonomy 8.1 dnsh_results. Mirrors the SFDR Art 9
 * c4 cross-framework DNSH pattern applied to UK SDR Impact.
 */
export const uk_sdr_c15_no_significant_harm: SFDRScoringFn = (ctx) => {
  const euTax = ctx.framework_results.get("eu_tax_climate_8_1");
  if (!euTax) {
    return insufficient(
      "EU Taxonomy 8.1 framework not scored in this run. PB methodology satisfies the UK SDR " +
        "Impact no-significant-harm screen by reading the EU Taxonomy 8.1 DNSH results; the " +
        "upstream assessment must run.",
      ["FCA PS23/16 ¶4.38"],
    );
  }
  // v0.6.2 (Tier 1 audit item #3): explicit handling for EU Tax 8.1
  // overall_verdict === "not_applicable" — the developer made no Taxonomy
  // claim. Pre-v0.6.2 this case produced empty dnsh_results and fell through
  // to "DNSH results are empty" insufficient_evidence, which mis-named the
  // cause as "data missing" when in fact no DNSH was evaluated upstream
  // because there was no claim to evaluate. Now returns not_aligned with
  // rationale naming the unmet dependency.
  if (euTax.overall_verdict === "not_applicable") {
    return notAligned(
      "EU Taxonomy 8.1 verdict is 'not applicable' — the developer made no claim under Activity 8.1. " +
        "Without Taxonomy alignment, the no-significant-harm screen cannot be satisfied. " +
        "Sustainability Impact eligibility requires DNSH-equivalent screening; this dependency is unmet.",
      undefined,
      ["FCA PS23/16 ¶4.38"],
    );
  }
  const dnshResults = euTax.dnsh_results ?? [];
  if (dnshResults.length === 0) {
    return insufficient(
      "EU Taxonomy 8.1 DNSH results are empty. No-significant-harm screen cannot be assessed.",
      ["FCA PS23/16 ¶4.38"],
    );
  }
  const failed = dnshResults.filter((r) => r.verdict === "fail").map((r) => r.criterion_id);
  const partial = dnshResults.filter((r) => r.verdict === "partial").map((r) => r.criterion_id);
  const missing = dnshResults
    .filter((r) => r.verdict === "data_missing")
    .map((r) => r.criterion_id);

  if (failed.length > 0) {
    return notAligned(
      `EU Taxonomy 8.1 DNSH failures prevent UK SDR Impact no-significant-harm clearance: ` +
        `${failed.join(", ")}. Sustainability Impact label requires the asset to clear DNSH-equivalent screening.`,
      undefined,
      ["FCA PS23/16 ¶4.38"],
    );
  }
  if (partial.length > 0) {
    return partially(
      `EU Taxonomy 8.1 DNSH is partially aligned on ${partial.join(", ")}. No-significant-harm screen ` +
        "caps at partially aligned pending DNSH gap remediation.",
      undefined,
      ["FCA PS23/16 ¶4.38"],
    );
  }
  if (missing.length > 0) {
    return insufficient(
      `EU Taxonomy 8.1 DNSH inputs are missing on ${missing.join(", ")}; cannot confirm no-significant-harm.`,
      ["FCA PS23/16 ¶4.38"],
    );
  }
  return aligned(
    "EU Taxonomy 8.1 DNSH results clear all criteria (pass or not_applicable). UK SDR Impact " +
      "no-significant-harm screen is satisfied by cross-framework corroboration.",
    { value: 1, unit: "screen", label: "DNSH clear" },
    ["FCA PS23/16 ¶4.38"],
  );
};

// -- Registry export ---------------------------------------------------------

import type { SFDRScoringFn as _SFDRScoringFn } from "./orchestration";

export const UK_SDR_SCORING_REGISTRY: ReadonlyMap<string, _SFDRScoringFn> = new Map<
  string,
  _SFDRScoringFn
>([
  // Sustainability Focus (4)
  ["uk_sdr_v1_asset_sustainability_profile", uk_sdr_c1_asset_sustainability_profile],
  ["uk_sdr_v1_credible_sustainability_standard", uk_sdr_c2_credible_sustainability_standard],
  ["uk_sdr_v1_sustainable_proportion_threshold", uk_sdr_c3_sustainable_proportion_threshold],
  ["uk_sdr_v1_asset_kpi_reporting", uk_sdr_c4_asset_kpi_reporting],
  // Sustainability Improvers (5)
  [
    "uk_sdr_v1_baseline_sustainability_assessment",
    uk_sdr_c5_baseline_sustainability_assessment,
  ],
  ["uk_sdr_v1_improvement_strategy", uk_sdr_c6_improvement_strategy],
  ["uk_sdr_v1_improvement_kpi_targets", uk_sdr_c7_improvement_kpi_targets],
  ["uk_sdr_v1_progress_monitoring", uk_sdr_c8_progress_monitoring],
  [
    "uk_sdr_v1_improvement_proportion_threshold",
    uk_sdr_c9_improvement_proportion_threshold,
  ],
  // Sustainability Impact (6)
  ["uk_sdr_v1_impact_objective", uk_sdr_c10_impact_objective],
  ["uk_sdr_v1_impact_measurement", uk_sdr_c11_impact_measurement],
  ["uk_sdr_v1_impact_additionality", uk_sdr_c12_impact_additionality],
  ["uk_sdr_v1_impact_proportion_threshold", uk_sdr_c13_impact_proportion_threshold],
  ["uk_sdr_v1_impact_reporting", uk_sdr_c14_impact_reporting],
  ["uk_sdr_v1_no_significant_harm", uk_sdr_c15_no_significant_harm],
]);
