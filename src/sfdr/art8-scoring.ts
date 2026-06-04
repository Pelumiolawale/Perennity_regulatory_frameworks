// ============================================================================
// SFDR Article 8 scoring functions (v0.5.0-alpha.2 — Phase 1, commit 1.2)
// ============================================================================
//
// Seven deterministic scoring functions, one per Art 8 criterion. Each takes
// the typed SFDRScoringContext and returns SFDRCriterionScore. Bands locked
// upstream — see /methodology.md at the repo root for the verbatim band
// definitions and rationale.
// ============================================================================

import type { SFDRScoringFn, SFDRScoringContext } from "./orchestration";
import type {
  ESCharacteristic,
  EntitySFDRInputs,
  ProjectSFDRInputs,
  SFDRBand,
  SFDRCriterionScore,
} from "./types";
import {
  EU_NON_COOPERATIVE_JURISDICTIONS,
  MATERIAL_PAI_NUMBERS,
  OPERATIONAL_THRESHOLD_MONTHS,
  PAI_POLICY_ALIGNED_RECENCY_DAYS,
  PAI_POLICY_PARTIAL_RECENCY_DAYS,
  PRE_CONTRACTUAL_ALIGNED_RECENCY_DAYS,
  PRE_CONTRACTUAL_PARTIAL_RECENCY_DAYS,
  RECOGNISED_STANDARDS,
  SECTOR_MATERIAL_CATEGORIES,
  TAXONOMY_OVERSTATEMENT_THRESHOLD_PP,
} from "./constants";

// -- Helpers -----------------------------------------------------------------

function daysSince(iso: string | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / (1000 * 60 * 60 * 24));
}

function getEntitySFDR(ctx: SFDRScoringContext): EntitySFDRInputs | undefined {
  return ctx.entity?.sfdr;
}

function getProjectSFDR(ctx: SFDRScoringContext): ProjectSFDRInputs | undefined {
  return ctx.project.sfdr;
}

function insufficient(rationale: string): SFDRCriterionScore {
  return { band: "insufficient_evidence", rationale_text: rationale };
}

// E5: label-aware rationale text. Criteria c1-c7 are shared between Art 8
// and Art 9 (Art 9 funds inherit the Art 8 baseline per SFDR regulatory
// design). Pre-E5, gap_summary text bare-referenced "Article 8" — which
// surfaced in Art 9 PDFs and read as the wrong framework being scored.
// These helpers route phrasing by ctx.framework_id; absence falls back to
// Art 8 phrasing (the criteria's primary regime).
function isArticle9(ctx: SFDRScoringContext): boolean {
  return ctx.framework_id === "sfdr_v1_article_9";
}

function article8BaselineLabel(ctx: SFDRScoringContext): string {
  return isArticle9(ctx)
    ? "the Article 8 baseline standard that Article 9 products must also satisfy"
    : "an Article 8 promotion claim";
}

function article8BaselineSpecificityRequirement(ctx: SFDRScoringContext): string {
  return isArticle9(ctx)
    ? "the Article 8 baseline specificity requirement that Article 9 products inherit"
    : "Article 8's specificity requirement";
}

function noTaxonomyClaimRationale(ctx: SFDRScoringContext): string {
  if (isArticle9(ctx)) {
    return (
      "Developer makes no Taxonomy alignment claim under Activity 8.1. Under SFDR Article 9, " +
      "the SI-objective qualification (criterion 8) is the load-bearing contribution test; a " +
      "separate Taxonomy alignment claim is one possible corroboration path but is not required. " +
      "No corroboration required here."
    );
  }
  return (
    "Developer makes no Taxonomy alignment claim under Activity 8.1; this is permitted under " +
    "SFDR Article 8 (light-green positioning). No corroboration required."
  );
}

// -- Criterion 1: E/S characteristics promotion -----------------------------

export const art8_c1_es_characteristics: SFDRScoringFn = (ctx) => {
  const sfdr = getProjectSFDR(ctx);
  const chars = sfdr?.disclosures?.es_characteristics;
  if (!chars) {
    return insufficient(
      "No E/S characteristics disclosure material provided (developer-supplied or public source).",
    );
  }
  const quantified = chars.filter(isQuantified);
  const quantifiedSectorMaterial = quantified.filter(
    (c) => c.sector_material_category && SECTOR_MATERIAL_CATEGORIES.has(c.sector_material_category),
  );
  let band: SFDRBand;
  let rationale: string;
  if (quantified.length >= 3 && quantifiedSectorMaterial.length >= 2) {
    band = "aligned";
    rationale = `${quantified.length} quantified E/S characteristics disclosed; ${quantifiedSectorMaterial.length} fall into recognised sector-material categories (energy, water, biodiversity, community).`;
  } else if (quantified.length >= 2 || chars.length >= 3) {
    band = "partially_aligned";
    rationale = `${quantified.length} quantified and ${chars.length - quantified.length} qualitative characteristic(s) disclosed; criterion not yet at the sector-material threshold for 'aligned'.`;
  } else {
    band = "not_aligned";
    rationale = `Only ${chars.length} characteristic(s) disclosed, of which ${quantified.length} are quantified — insufficient specificity for ${article8BaselineLabel(ctx)}.`;
  }
  return {
    band,
    rationale_text: rationale,
    evidence_refs: chars.map((c) => c.public_source ?? `disclosure:${c.name}`).filter(Boolean),
  };
};

function isQuantified(c: ESCharacteristic): boolean {
  return (
    c.indicator !== undefined &&
    typeof c.indicator.metric === "string" &&
    typeof c.indicator.target_value === "number" &&
    typeof c.indicator.target_year === "number"
  );
}

// -- Criterion 2: Good governance attestation -------------------------------

type DomainVerdict = "Pass" | "Partial" | "Fail";

export const art8_c2_good_governance: SFDRScoringFn = (ctx) => {
  const sfdr = getEntitySFDR(ctx);
  const gov = sfdr?.governance;
  if (!gov) return insufficient("No entity-level governance disclosures provided.");
  const a = domainA(gov.board_structure);
  const b = domainB(gov.employee_relations);
  const c = domainC(gov.remuneration);
  const d = domainD(gov.tax_compliance);
  const domains: { id: string; v: DomainVerdict | null }[] = [
    { id: "Sound management structures", v: a },
    { id: "Employee relations", v: b },
    { id: "Remuneration of staff", v: c },
    { id: "Tax compliance", v: d },
  ];
  if (domains.some((x) => x.v === null)) {
    return insufficient(
      `Insufficient evidence on ${domains.filter((x) => x.v === null).map((x) => x.id).join(", ")}.`,
    );
  }
  const verdicts = domains.map((x) => x.v as DomainVerdict);
  const passes = verdicts.filter((v) => v === "Pass").length;
  const fails = verdicts.filter((v) => v === "Fail").length;
  const partials = verdicts.filter((v) => v === "Partial").length;
  let band: SFDRBand;
  if (passes === 4) band = "aligned";
  else if (fails > 0) band = "not_aligned";
  else if (partials >= 2) band = "not_aligned";
  else if (passes >= 3 && fails === 0) band = "partially_aligned";
  else band = "not_aligned";
  return {
    band,
    rationale_text:
      `Domain verdicts — ` +
      domains.map((x) => `${x.id}: ${x.v}`).join("; ") +
      `.`,
  };
};

function domainA(b: NonNullable<EntitySFDRInputs["governance"]>["board_structure"]) {
  return ((bb: typeof b | undefined): DomainVerdict | null => {
    if (!bb) return null;
    const checks = [
      bb.independent_ned_count >= 1 && bb.terms_of_reference_documented,
      bb.ceo_chair_separated || bb.lead_independent_director_designated,
      bb.executive_committee_published,
      // Fourth check splits the first compound to keep the rubric symmetric.
      bb.terms_of_reference_documented,
    ];
    const pass = checks.filter(Boolean).length;
    if (pass === 4) return "Pass";
    if (pass >= 2) return "Partial";
    return "Fail";
  })(b);
}

function domainB(e: NonNullable<EntitySFDRInputs["governance"]>["employee_relations"]) {
  return ((ee: typeof e | undefined): DomainVerdict | null => {
    if (!ee) return null;
    if (ee.ungc_violations_5yr_count > 0) return "Fail";
    const otherChecks = [
      ee.ungp_aligned_policy_published,
      ee.grievance_mechanism_documented,
      ee.labour_law_compliance_attested,
    ];
    const failed = otherChecks.filter((x) => !x).length;
    if (failed === 0) return "Pass";
    if (failed === 1) return "Partial";
    return "Fail";
  })(e);
}

function domainC(r: NonNullable<EntitySFDRInputs["governance"]>["remuneration"]) {
  return ((rr: typeof r | undefined): DomainVerdict | null => {
    if (!rr) return null;
    if (!rr.policy_published) return "Fail";
    if (rr.ceo_to_median_ratio_value !== undefined && rr.ceo_to_median_ratio_value > 300) {
      return "Fail";
    }
    const extras = [rr.ceo_to_median_ratio_disclosed, rr.esg_linked_variable_pay];
    if (extras.every(Boolean)) return "Pass";
    return "Partial";
  })(r);
}

function domainD(t: NonNullable<EntitySFDRInputs["governance"]>["tax_compliance"]) {
  return ((tt: typeof t | undefined): DomainVerdict | null => {
    if (!tt) return null;
    if (!tt.tax_policy_published) return "Fail";
    const usesAnnexI = tt.jurisdictions_used.some((j) =>
      EU_NON_COOPERATIVE_JURISDICTIONS.has(j),
    );
    if (usesAnnexI) return "Fail";
    if (tt.unresolved_tax_disputes_eur_max >= 10_000_000) return "Fail";
    if (tt.cbcr_jurisdiction_count < 3) return "Partial";
    return "Pass";
  })(t);
}

// -- Criterion 3: PAI consideration policy ----------------------------------
//
// v3.5 (F2 — developer-investee framing): Article 4 of SFDR is an FMP
// obligation, not an investee obligation. Real DC developers don't reference
// Art 4 in their disclosures because the obligation doesn't apply to them.
// The criterion now tests substance — the four content pillars of an Art 4-
// style policy (material PAIs identified, targets, actions, due-diligence) —
// without requiring an explicit Art 4 citation as evidence. The legacy
// `art_4_explicit_reference` input is retained for backward compatibility
// with v3.4-vintage fixtures but no longer participates in the aligned gate.

export const art8_c3_pai_policy: SFDRScoringFn = (ctx) => {
  const sfdr = getEntitySFDR(ctx);
  const pai = sfdr?.pai_disclosures;
  if (!pai || !pai.statement_url) {
    return insufficient(
      "No entity-level PAI consideration statement URL provided; cannot evaluate PAI policy substance.",
    );
  }
  let pais_full = 0;
  let pais_addressed = 0;
  for (const n of MATERIAL_PAI_NUMBERS) {
    const e = pai.pai_coverage[String(n)];
    if (!e) continue;
    if (e.data_disclosed && e.target_disclosed && e.mitigation_documented) {
      pais_full++;
      pais_addressed++;
    } else if (e.data_disclosed) {
      pais_addressed++;
    }
  }
  const recencyDays = daysSince(pai.statement_published_date) ?? Number.POSITIVE_INFINITY;
  let band: SFDRBand;
  if (pais_full >= 9 && recencyDays <= PAI_POLICY_ALIGNED_RECENCY_DAYS) {
    band = "aligned";
  } else if (
    (pais_full >= 6 || pais_addressed >= 9) &&
    recencyDays <= PAI_POLICY_PARTIAL_RECENCY_DAYS
  ) {
    band = "partially_aligned";
  } else {
    band = "not_aligned";
  }
  return {
    band,
    rationale_text:
      // v0.6.2: stripped methodology version stamp "(v3.5)" from rationale —
      // methodology_version is paid-tier-only per the snapshot allowlist;
      // the stamp leaks the methodology vintage to free-tier consumers. The
      // substance-over-citation framing remains in the rationale; the
      // version anchor lives in paid-tier `methodology_version` on
      // ReportOutput.
      `${pais_full}/${MATERIAL_PAI_NUMBERS.length} material PAIs fully evidenced; ` +
      `statement age ${recencyDays === Number.POSITIVE_INFINITY ? "unknown" : `${recencyDays} days`}. ` +
      `Substance-based assessment: explicit Article 4 citation is not required for developer-investees; the four content pillars (material PAIs identified, targets, actions, due diligence) are the operative test.`,
    evidence_refs: pai.statement_url ? [pai.statement_url] : [],
    numeric_value: {
      value: pais_full,
      unit: `/${MATERIAL_PAI_NUMBERS.length}`,
      label: "Material PAI coverage (full evidence)",
    },
  };
};

// -- Criterion 4: DNSH assessment -------------------------------------------
//
// v3.5 calibration refinements:
//   F3 — PAI 5/6 PUE uses CNDCP cool/warm climate split at no_harm; PB
//        investor-grade conservatism at the aligned band (cool ≤1.2 /
//        warm ≤1.3 for new builds). Existing DCs retain v3.4 path.
//   F4 — PAI 7 biodiversity adds TNFD LEAP Tier 2 evidence acceptance
//        alongside the Tier 1 KBA-buffer test.

type PAIVerdict = "no_harm" | "significant_harm" | "insufficient_evidence";

// Cool = CDD ≤ 49.99, Warm = CDD ≥ 50.00, per CNDCP convention. Unknown zone
// (no climate_zone and no cdd) is treated as warm — the more permissive
// no_harm threshold — so missing climate data doesn't get penalised with the
// stricter cool threshold. Aligned-tier checks (which require zone to be
// known) gate separately below.
function resolveClimateZone(
  d: NonNullable<NonNullable<ProjectSFDRInputs["dnsh"]>["evidence"]>,
): "cool" | "warm" | null {
  if (d.climate_zone === "cool" || d.climate_zone === "warm") return d.climate_zone;
  if (typeof d.cdd === "number") return d.cdd <= 49.99 ? "cool" : "warm";
  return null;
}

export const art8_c4_dnsh: SFDRScoringFn = (ctx) => {
  // Cross-framework DNSH read (E3). When EU Taxonomy Activity 8.1 is scored
  // in the same run, its dnsh_results are the authoritative source for c4.
  // SFDR's c4 doesn't need its own DNSH input shape when an activity-aligned
  // framework has already evaluated the same evidence — depending on the SFDR
  // side to re-collect the inputs would force the SPA to populate two
  // redundant trees, and missing one would produce the bug E3 documents.
  const crossFw = scoreDNSHFromCrossFramework(ctx);
  if (crossFw) return crossFw;

  const dnsh = getProjectSFDR(ctx)?.dnsh?.evidence;
  if (!dnsh) return insufficient("No project-level DNSH evidence provided.");
  const perPai = new Map<number, PAIVerdict>();
  perPai.set(1, evalPAI_GHG(dnsh));
  perPai.set(2, evalPAI_GHG(dnsh));
  perPai.set(3, evalPAI_GHG(dnsh));
  perPai.set(5, evalPAI_Energy(dnsh));
  perPai.set(6, evalPAI_Energy(dnsh));
  perPai.set(7, evalPAI_Biodiversity(dnsh));
  perPai.set(8, evalPAI_Water(dnsh));
  perPai.set(9, evalPAI_Waste(dnsh));
  perPai.set(10, evalPAI_UNGC(dnsh));
  perPai.set(11, evalPAI_UNGC(dnsh));
  perPai.set(13, evalPAI_BoardDiversity(dnsh));

  const harms: number[] = [];
  const insufficientPais: number[] = [];
  let noHarm = 0;
  for (const [n, v] of perPai) {
    if (v === "significant_harm") harms.push(n);
    else if (v === "insufficient_evidence") insufficientPais.push(n);
    else noHarm++;
  }
  let band: SFDRBand;
  let extraRationale = "";
  if (harms.length > 0) {
    band = "not_aligned";
  } else if (insufficientPais.length >= 4) {
    band = "insufficient_evidence";
  } else if (insufficientPais.length >= 3) {
    band = "not_aligned";
  } else if (noHarm === MATERIAL_PAI_NUMBERS.length) {
    // v3.5 (F3): all PAIs no_harm — for new builds, gate aligned on the
    // stricter PB conservatism PUE threshold (cool ≤1.2 / warm ≤1.3).
    // Existing DCs and projects without PUE skip the aligned-tier gate.
    const alignedTier = checkPUEAlignedTier(dnsh);
    if (alignedTier === "below_aligned_tier") {
      band = "partially_aligned";
      // v0.6.2: stripped "v3.5 PB-conservatism gate" methodology stamp +
      // verbatim threshold values "cool ≤1.2 / warm ≤1.3" from rationale.
      // The threshold values are paid-tier-only; their absence here doesn't
      // change the verdict (caller still returns partially_aligned). Paid
      // renderers reading numeric_value can surface the thresholds; the
      // free-tier rationale describes the gate outcome qualitatively.
      extraRationale =
        " PB-conservatism gate: all PAIs clear no_harm but new-build PUE is above the aligned-tier threshold for the project's climate zone; criterion 4 caps at partially_aligned.";
    } else {
      band = "aligned";
    }
  } else {
    band = "partially_aligned";
  }
  return {
    band,
    rationale_text:
      `Per-PAI: ` +
      [...perPai.entries()].map(([n, v]) => `PAI${n}=${v}`).join(", ") +
      ` (${noHarm} no_harm, ${harms.length} significant_harm, ${insufficientPais.length} insufficient).` +
      extraRationale,
  };
};

// E3: read EU Taxonomy 8.1 dnsh_results (when available) and aggregate into
// an SFDR c4 verdict per the v3.5 cross-framework decision logic. Returns
// null when no activity-aligned framework was scored in this run, so the
// caller can fall back to the SFDR-specific dnsh.evidence input path.
function scoreDNSHFromCrossFramework(
  ctx: SFDRScoringContext,
): SFDRCriterionScore | null {
  const euTax = ctx.framework_results.get("eu_tax_climate_8_1");
  if (!euTax) return null;
  const dnshResults = euTax.dnsh_results ?? [];
  if (dnshResults.length === 0) return null;

  const failed: string[] = [];
  const partial: string[] = [];
  const missing: string[] = [];
  for (const r of dnshResults) {
    if (r.verdict === "fail") failed.push(r.criterion_id);
    else if (r.verdict === "partial") partial.push(r.criterion_id);
    else if (r.verdict === "data_missing") missing.push(r.criterion_id);
    // pass and not_applicable are treated as clearing the gate.
  }

  const summary =
    `EU Taxonomy 8.1 DNSH cross-framework read: ` +
    dnshResults.map((r) => `${r.criterion_id}=${r.verdict}`).join(", ") +
    ".";

  if (failed.length > 0) {
    return {
      band: "not_aligned",
      rationale_text: `${summary} Failed DNSH criteria force SFDR c4 not_aligned: ${failed.join(", ")}.`,
    };
  }
  if (partial.length > 0) {
    return {
      band: "partially_aligned",
      rationale_text: `${summary} Partially-aligned DNSH criteria cap SFDR c4 at partially_aligned: ${partial.join(", ")}.`,
    };
  }
  if (missing.length > 0) {
    return {
      band: "insufficient_evidence",
      rationale_text: `${summary} Missing DNSH inputs prevent SFDR c4 alignment: ${missing.join(", ")}.`,
    };
  }
  return {
    band: "aligned",
    rationale_text: `${summary} All criteria pass or are not_applicable; SFDR c4 aligned by cross-framework corroboration.`,
  };
}

// Returns "meets_aligned_tier" if PUE clears the v3.5 PB-conservatism gate
// for the project's climate zone; "below_aligned_tier" if PUE clears no_harm
// but not the stricter aligned-tier threshold; "not_applicable" if the gate
// doesn't apply (existing DC, no PUE, etc.).
function checkPUEAlignedTier(
  d: NonNullable<NonNullable<ProjectSFDRInputs["dnsh"]>["evidence"]>,
): "meets_aligned_tier" | "below_aligned_tier" | "not_applicable" {
  if (d.pue === undefined) return "not_applicable";
  if (!d.new_build) return "not_applicable"; // existing DCs: no aligned-tier upgrade
  const zone = resolveClimateZone(d);
  // Aligned-tier requires zone to be known. Unknown zone with a new build
  // means we evaluated against the permissive warm no_harm threshold but
  // can't fairly upgrade to aligned without zone evidence — stay at
  // partially_aligned via "below_aligned_tier".
  if (zone === null) return "below_aligned_tier";
  const threshold = zone === "cool" ? 1.2 : 1.3;
  return d.pue <= threshold ? "meets_aligned_tier" : "below_aligned_tier";
}

function evalPAI_GHG(d: NonNullable<NonNullable<ProjectSFDRInputs["dnsh"]>["evidence"]>): PAIVerdict {
  if (d.sbti_validated) return "no_harm";
  if (d.offsets_meet_icvcm_ccp) return "no_harm";
  if (d.new_build && (d.renewable_ppa_coverage_percent ?? 0) >= 80) return "no_harm";
  if (d.ghg_intensity_sector_top_quartile && d.decarbonisation_pathway_documented === false) {
    return "significant_harm";
  }
  if (
    d.sbti_validated === undefined &&
    d.offsets_meet_icvcm_ccp === undefined &&
    d.renewable_ppa_coverage_percent === undefined
  ) {
    return "insufficient_evidence";
  }
  // Default to partial signal — neither clean pass nor a fail signal.
  return "insufficient_evidence";
}

function evalPAI_Energy(d: NonNullable<NonNullable<ProjectSFDRInputs["dnsh"]>["evidence"]>): PAIVerdict {
  if (d.pue === undefined) return "insufficient_evidence";
  const isNewBuild = d.new_build ?? false;
  // v3.5 (F3): CNDCP cool/warm split at no_harm. Unknown zone → warm.
  let pueThreshold: number;
  if (isNewBuild) {
    const zone = resolveClimateZone(d) ?? "warm";
    pueThreshold = zone === "cool" ? 1.3 : 1.4;
  } else {
    pueThreshold = 1.5; // existing DC threshold stays universal
  }
  const pueFailThreshold = isNewBuild ? 1.6 : 1.8;
  if (d.pue > pueFailThreshold) return "significant_harm";
  if (d.pue > pueThreshold) return "insufficient_evidence";
  if (d.renewable_tier === 3 && !d.transition_pathway_documented) return "significant_harm";
  return "no_harm";
}

function evalPAI_Biodiversity(d: NonNullable<NonNullable<ProjectSFDRInputs["dnsh"]>["evidence"]>): PAIVerdict {
  // v3.5 (F4): three-tier evidence acceptance. Tier 2 (TNFD LEAP) is selected
  // when biodiversity_assessment_type === "tnfd_leap"; otherwise the Tier 1
  // (KBA buffer) path is run. Absence of either evidence form → Tier 3
  // (insufficient_evidence).
  if (d.biodiversity_assessment_type === "tnfd_leap") {
    if (d.tnfd_leap_risk_level === undefined) return "insufficient_evidence";
    if (d.tnfd_leap_risk_level === "high") return "significant_harm";
    if (!d.site_level_mitigation_committed) return "significant_harm";
    if (d.tnfd_leap_risk_level === "low") return "no_harm";
    // medium risk + mitigation → not significant_harm, but not a clean no_harm
    return "insufficient_evidence";
  }

  // Tier 1 — KBA buffer (PB's preferred quantified evidence form).
  const dist = d.distance_to_biodiversity_sensitive_area_km;
  if (dist === undefined) return "insufficient_evidence";
  if (d.eia_concludes_net_negative_unmitigated) return "significant_harm";
  if (dist > 2) {
    if (d.eia_documented && d.eia_concludes_no_material_disturbance) return "no_harm";
    if (!d.eia_documented) return "insufficient_evidence";
    return "insufficient_evidence";
  }
  // dist <= 2km
  if (!d.eia_documented) return "significant_harm";
  if (!d.mitigation_hierarchy_applied) return "significant_harm";
  if (d.net_positive_biodiversity_commitment_quantified) return "no_harm";
  return "insufficient_evidence";
}

function evalPAI_Water(d: NonNullable<NonNullable<ProjectSFDRInputs["dnsh"]>["evidence"]>): PAIVerdict {
  if (d.water_regulation_breach_documented) return "significant_harm";
  if (d.wue_value === undefined || d.wue_max_threshold === undefined) {
    return "insufficient_evidence";
  }
  if (d.wue_value > 2 * d.wue_max_threshold) return "significant_harm";
  if (
    d.cooling_design === "evaporative" &&
    (d.k2_stress ?? 0) > 1.5 &&
    !d.discharge_within_local_limits
  ) {
    return "significant_harm";
  }
  if (d.wue_value <= d.wue_max_threshold && d.discharge_within_local_limits) {
    return "no_harm";
  }
  return "insufficient_evidence";
}

function evalPAI_Waste(d: NonNullable<NonNullable<ProjectSFDRInputs["dnsh"]>["evidence"]>): PAIVerdict {
  if (d.hazardous_landfill_disposal_documented) return "significant_harm";
  if (!d.waste_management_plan_documented) {
    return d.waste_management_plan_documented === false ? "significant_harm" : "insufficient_evidence";
  }
  if ((d.it_hardware_recovery_rate ?? 0) >= 0.8) return "no_harm";
  return "insufficient_evidence";
}

function evalPAI_UNGC(d: NonNullable<NonNullable<ProjectSFDRInputs["dnsh"]>["evidence"]>): PAIVerdict {
  if (d.ungc_violations_5yr_count === undefined) return "insufficient_evidence";
  if (d.ungc_violations_5yr_count > 0) return "significant_harm";
  if (d.monitoring_process_documented) return "no_harm";
  return "insufficient_evidence";
}

function evalPAI_BoardDiversity(d: NonNullable<NonNullable<ProjectSFDRInputs["dnsh"]>["evidence"]>): PAIVerdict {
  const w = d.board_women_percent;
  if (w === undefined) return "insufficient_evidence";
  if (w >= 30) return "no_harm";
  if (
    d.diversity_policy_published &&
    (d.diversity_target_percent ?? 0) >= 30 &&
    (d.diversity_target_year ?? Number.POSITIVE_INFINITY) <= new Date().getFullYear() + 3
  ) {
    return "no_harm";
  }
  if (w < 20 && !d.diversity_policy_published) return "significant_harm";
  return "insufficient_evidence";
}

// -- Criterion 5: Pre-contractual disclosure (cascades from criterion 1) ----

const ANNEX_II_ELEMENTS: readonly string[] = ["1", "2", "3", "4", "5", "6", "7", "9", "10"];

export const art8_c5_pre_contractual: SFDRScoringFn = (ctx) => {
  const cov = getEntitySFDR(ctx)?.disclosures?.annex_ii_coverage;
  if (!cov) return insufficient("No Annex II pre-contractual disclosure coverage provided.");
  // Cascade: if criterion 1 is not_aligned, criterion 5 cascades to not_aligned.
  const c1 = ctx.dependencies.get("sfdr_v1_e_s_characteristics_promotion");
  if (c1?.band === "not_aligned") {
    return {
      band: "not_aligned",
      rationale_text:
        `Cascade rule: criterion 1 (E/S characteristics promotion) is not_aligned, so pre-contractual disclosure cannot meet ${article8BaselineSpecificityRequirement(ctx)} regardless of other Annex II coverage.`,
    };
  }
  let specificCount = 0;
  let genericCount = 0;
  for (const el of ANNEX_II_ELEMENTS) {
    const ev = cov[el];
    if (!ev) continue;
    if (ev.coverage === "covered_specific") specificCount++;
    else if (ev.coverage === "covered_generic") genericCount++;
  }
  const addressed = specificCount + genericCount;
  const el4 = cov["4"];
  const el6 = cov["6"];
  const el5 = cov["5"];
  const namedFwForEl4 =
    el4?.coverage === "covered_specific" && !!el4.named_framework;
  const namedFwForEl6 =
    el6?.coverage === "covered_specific" && !!el6.named_framework;
  let band: SFDRBand;
  if (
    specificCount >= 7 &&
    namedFwForEl4 &&
    namedFwForEl6 &&
    el5 &&
    el5.coverage !== "absent"
  ) {
    band = "aligned";
  } else if (
    (specificCount >= 5 && specificCount <= 6) ||
    (specificCount >= 7 && (!namedFwForEl4 || !namedFwForEl6)) ||
    (specificCount >= 7 && (!el5 || el5.coverage === "absent"))
  ) {
    band = "partially_aligned";
  } else {
    band = "not_aligned";
  }
  return {
    band,
    rationale_text:
      `${specificCount}/${ANNEX_II_ELEMENTS.length} Annex II elements covered with named-framework specificity; ${genericCount} addressed with generic ESG narrative; ${ANNEX_II_ELEMENTS.length - addressed} absent.`,
  };
};

// -- Criterion 6: Taxonomy alignment disclosure (cross-framework dep on EU 8.1)

export const art8_c6_taxonomy: SFDRScoringFn = (ctx) => {
  const claim = getProjectSFDR(ctx)?.taxonomy_claim;
  if (!claim) {
    const noClaimRationale = noTaxonomyClaimRationale(ctx);
    return {
      band: "not_applicable",
      rationale_text: noClaimRationale,
      not_applicable_rationale: noClaimRationale,
    };
  }
  const euTax = ctx.framework_results.get("eu_tax_climate_8_1");
  if (!euTax) {
    return insufficient(
      "Taxonomy claim made but EU Taxonomy 8.1 framework not scored in this run — cross-framework corroboration unavailable.",
    );
  }
  // Adapter: map legacy EU-Tax Verdict ("pass"/"partial"/"fail"/"data_missing")
  // to the SFDR band vocabulary for comparison purposes.
  const euBand = adaptEuTaxVerdict(euTax.overall_verdict);
  const pbCorroboratedPct = euTax.indicative_score; // 0-100
  const overstatementPp = claim.claimed_percentage - pbCorroboratedPct;
  const recencyDays = daysSince(claim.published_date) ?? Number.POSITIVE_INFINITY;
  let band: SFDRBand;
  if (
    euBand === "aligned" &&
    claim.six_objective_breakdown !== undefined &&
    Object.keys(claim.six_objective_breakdown).length > 0 &&
    claim.minimum_safeguards_attestation &&
    overstatementPp <= TAXONOMY_OVERSTATEMENT_THRESHOLD_PP &&
    recencyDays <= 365
  ) {
    band = "aligned";
  } else if (
    euBand === "not_aligned" ||
    overstatementPp > TAXONOMY_OVERSTATEMENT_THRESHOLD_PP ||
    !claim.minimum_safeguards_attestation
  ) {
    band = "not_aligned";
  } else {
    band = "partially_aligned";
  }
  return {
    band,
    rationale_text:
      `Claimed Taxonomy alignment: ${claim.claimed_percentage}% / PB-corroborated under Activity 8.1: ${pbCorroboratedPct}%. ` +
      `EU 8.1 verdict: ${euBand}. Minimum safeguards attested: ${claim.minimum_safeguards_attestation ? "yes" : "no"}. ` +
      `Overstatement: ${overstatementPp.toFixed(1)}pp (threshold ${TAXONOMY_OVERSTATEMENT_THRESHOLD_PP}pp).`,
    numeric_value: {
      value: claim.claimed_percentage,
      unit: "%",
      label: "Claimed Taxonomy alignment",
    },
  };
};

function adaptEuTaxVerdict(v: string): SFDRBand {
  switch (v) {
    case "pass":
      return "aligned";
    case "partial":
      return "partially_aligned";
    case "fail":
      return "not_aligned";
    case "data_missing":
      return "insufficient_evidence";
    default:
      return "not_aligned";
  }
}

// -- Criterion 7: Periodic reporting commitment (reads criterion 1 read-only)

export const art8_c7_periodic_reporting: SFDRScoringFn = (ctx) => {
  const reporting = getEntitySFDR(ctx)?.reporting;
  if (!reporting) return insufficient("No periodic reporting evidence provided.");
  const c1 = ctx.dependencies.get("sfdr_v1_e_s_characteristics_promotion");
  const c1Characteristics =
    c1?.evidence_refs?.length ?? 0; // proxy: count of evidence refs from criterion 1

  const now = new Date();
  const monthsSinceCommissioning =
    reporting.commissioning_date
      ? Math.floor(
          (now.getTime() - Date.parse(reporting.commissioning_date)) /
            (1000 * 60 * 60 * 24 * 30),
        )
      : null;
  const isOperational =
    reporting.operational_status === "operational" &&
    monthsSinceCommissioning !== null &&
    monthsSinceCommissioning >= OPERATIONAL_THRESHOLD_MONTHS;

  if (isOperational) {
    const reports = reporting.project_reports ?? [];
    const consecutive = countConsecutive(reports.map((r) => r.year));
    const standardMapped = reports.some(
      (r) => r.named_standard && RECOGNISED_STANDARDS.has(r.named_standard),
    );
    const indicatorsLink = reports.some((r) => r.indicator_names.length > 0) && c1Characteristics > 0;
    let band: SFDRBand;
    if (consecutive >= 2 && indicatorsLink && standardMapped) band = "aligned";
    else if (consecutive >= 1) band = "partially_aligned";
    else band = "not_aligned";
    return {
      band,
      rationale_text: `Operational project: ${consecutive} consecutive annual report(s); recognised standard ${standardMapped ? "mapped" : "not mapped"}; indicator-link to criterion 1: ${indicatorsLink ? "present" : "absent"}.`,
    };
  }
  // Pre-operational
  const fw = reporting.reporting_framework_commitment;
  const parentTrack = (reporting.parent_portfolio_reports ?? []).length;
  const parentConsecutive = countConsecutive(
    (reporting.parent_portfolio_reports ?? []).map((r) => r.year),
  );
  if (!fw && parentTrack === 0) {
    return insufficient("Pre-operational project: no reporting framework commitment AND no parent portfolio track record.");
  }
  const allSpecifiers = !!fw && fw.specifies_indicators && fw.specifies_annual_cadence && fw.specifies_assurance;
  const standardOnFw = !!fw?.named_standard && RECOGNISED_STANDARDS.has(fw.named_standard);
  let band: SFDRBand;
  if (allSpecifiers && parentConsecutive >= 2 && standardOnFw) band = "aligned";
  else if (fw || parentTrack > 0) band = "partially_aligned";
  else band = "not_aligned";
  return {
    band,
    rationale_text: `Pre-operational project: framework commitment ${fw ? "present" : "absent"} (${allSpecifiers ? "all specifiers" : "incomplete"}); parent track record ${parentConsecutive} consecutive years.`,
  };
};

function countConsecutive(years: number[]): number {
  if (years.length === 0) return 0;
  const sorted = [...years].sort((a, b) => b - a);
  let count = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] - 1) count++;
    else break;
  }
  return count;
}
