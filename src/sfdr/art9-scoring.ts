// ============================================================================
// SFDR Article 9 scoring functions (v0.5.0-alpha.4 — Phase 1, commit 1.3)
// ============================================================================
//
// Three deterministic scoring functions for the v3.4 Art 9 reframe:
//   - art9_c8_si_objective_qualification
//   - art9_c9_si_eligibility_evidence_pack (cascades from c2, c4, c8)
//   - art9_c10_project_pai_data_provision (verification gate reads c3, no cascade)
//
// Key methodology v3.4 framing operationalised here:
//   - PB certifies Art 9 SI-eligibility at the project (asset) level
//   - The 90% positioning principle informs calibration but is NOT a numeric
//     gate at criterion level (qualitative dominance test instead)
//   - Sub-case (b) of c8 defaults to not_applicable when the engagement
//     scope does not anticipate Art 9(1) benchmark placement
// ============================================================================

import type { SFDRScoringFn, SFDRScoringContext } from "./orchestration";
import type {
  Art9SIObjectiveInputs,
  Art9EvidencePackInputs,
  Art9PAIDataInputs,
  ProjectArt9Inputs,
  SFDRBand,
  SFDRCriterionScore,
  SIObjectiveCategory,
} from "./types";
import { MATERIAL_PAI_NUMBERS } from "./constants";

// -- Helpers -----------------------------------------------------------------

function getArt9(ctx: SFDRScoringContext): ProjectArt9Inputs | undefined {
  return ctx.project.sfdr?.art9;
}

function insufficient(rationale: string): SFDRCriterionScore {
  return { band: "insufficient_evidence", rationale_text: rationale };
}

// Carbon-reduction objectives trigger sub-case (a).
function isCarbonReductionObjective(cat: SIObjectiveCategory | undefined): boolean {
  return cat === "environmental_climate_mitigation";
}

// -- Criterion 8: SI objective qualification ---------------------------------

export const art9_c8_si_objective_qualification: SFDRScoringFn = (ctx) => {
  const a9 = getArt9(ctx);
  const si = a9?.si_objective;
  if (!si || !si.objective) {
    return insufficient(
      "No SI objective declared at project level; no investment memo or pre-contractual material provided.",
    );
  }

  const obj = si.objective;
  const dom = si.dominance;
  const inds = si.quantified_indicators ?? [];

  // Condition 1: named, mappable objective.
  const mappable = Boolean(obj.taxonomy_mapping || obj.social_taxonomy_mapping);
  if (!mappable) {
    return {
      band: "not_aligned",
      rationale_text: `SI objective "${obj.name}" is declared but is not mappable to an EU Taxonomy environmental objective or to a recognised social-taxonomy category.`,
    };
  }

  // Condition 2: dominance test.
  const dominancePass = Boolean(
    dom &&
      dom.named_in_investment_memorandum &&
      dom.economic_rationale_depends_on_si &&
      dom.marketing_leads_with_si,
  );

  // Condition 3: ≥3 quantified indicators from recognised sources.
  const recognisedSourceCount = inds.filter(
    (i) => i.source === "art_2_17_example" || i.source === "l2_rts_annex_i_pai",
  ).length;
  const totalIndicatorsWithBaselineAndTarget = inds.filter(
    (i) => typeof i.baseline === "number" && typeof i.target === "number",
  ).length;
  const condition3 = recognisedSourceCount >= 3;
  const condition3_partial = totalIndicatorsWithBaselineAndTarget >= 3 && recognisedSourceCount < 3;

  // Condition 4: enhanced evidence for sub-case (a) carbon-reduction objectives.
  let condition4a_full = true;
  let condition4a_partial = false;
  if (isCarbonReductionObjective(obj.category)) {
    const sub = si.sub_case_a;
    const sbti = Boolean(sub?.sbti_validated_1_5c && sub?.sbti_includes_net_zero);
    const benchmark = Boolean(sub?.eu_ctb_or_pab_aligned_at_project_level);
    const iea = Boolean(sub?.iea_nze_2050_compatible_with_trajectory);
    const evidenceCount = [sbti, benchmark, iea].filter(Boolean).length;
    condition4a_full = evidenceCount >= 1;
    condition4a_partial = !condition4a_full && evidenceCount > 0;
    // Tighten: aligned requires ≥1; partial signal if a sub-case is asserted
    // but missing pieces — interpret "partial" as exactly half of the
    // intended evidence (e.g. SBTi present but neither benchmark nor IEA).
    if (evidenceCount === 1 && !sbti && !benchmark && !iea) {
      // shouldn't happen; defensive.
    }
    if (sub?.sbti_validated_1_5c && !sub?.sbti_includes_net_zero) {
      condition4a_partial = true;
    }
  }

  // Condition 4b: sub-case (b) — defaults to not_applicable if engagement
  // scope does not anticipate benchmark placement. When it does anticipate,
  // both exclusions cleared AND trajectory consistent with benchmark required.
  const sub_b = si.sub_case_b;
  let condition4b_applicable = false;
  let condition4b_pass = true;
  let benchmark_not_applicable_rationale: string | null = null;
  if (sub_b?.anticipates_benchmark_placement) {
    condition4b_applicable = true;
    const trajectoryThreshold =
      sub_b.benchmark_type === "eu_pab" ? 10 : sub_b.benchmark_type === "eu_ctb" ? 7 : 7;
    condition4b_pass = Boolean(
      sub_b.activity_exclusions_cleared &&
        typeof sub_b.carbon_intensity_yoy_pct === "number" &&
        sub_b.carbon_intensity_yoy_pct >= trajectoryThreshold,
    );
  } else {
    benchmark_not_applicable_rationale =
      "Sub-case (b) (Art 9(1) benchmarked-fund placement) is not_applicable: engagement scope does not anticipate FMP placement in a benchmark-aligned fund. Criterion 8 evaluates the project at the asset level under the general Art 9 SI-objective qualification path.";
  }

  // Band synthesis.
  const allConditionsPass =
    mappable && dominancePass && condition3 && condition4a_full && condition4b_pass;

  let band: SFDRBand;
  let rationale: string;
  if (allConditionsPass) {
    band = "aligned";
    rationale = `SI objective "${obj.name}" qualifies as Art 9 SI-eligible: named and mappable; passes dominance test; ${recognisedSourceCount}/${inds.length} indicators from Art 2(17) or L2 RTS Annex I sources.${
      isCarbonReductionObjective(obj.category)
        ? " 9(3) carbon-reduction sub-case enhanced evidence present (SBTi / EU CTB or PAB / IEA NZE)."
        : ""
    }${
      condition4b_applicable
        ? ` Benchmark-aligned engagement: exclusions cleared and YoY intensity trajectory of ${sub_b?.carbon_intensity_yoy_pct}% meets benchmark threshold.`
        : ""
    }`;
  } else if (condition4b_applicable && !condition4b_pass) {
    band = "not_aligned";
    rationale = `SI objective declared but sub-case (b) fails: benchmark-aligned engagement requires both activity-exclusion clearance and the benchmark's YoY intensity trajectory (7% for EU CTB, 10% for EU PAB). Provided trajectory: ${sub_b?.carbon_intensity_yoy_pct ?? "missing"}%; exclusions cleared: ${sub_b?.activity_exclusions_cleared ? "yes" : "no"}.`;
  } else if (!dominancePass && condition3) {
    band = "partially_aligned";
    rationale = `SI objective "${obj.name}" is named and quantified with ${recognisedSourceCount} indicators, but the dominance test fails — SI appears to be a feature, not the primary commercial rationale of the project. Investment memo / economics / marketing evidence is incomplete.`;
  } else if (dominancePass && condition3_partial) {
    band = "partially_aligned";
    rationale = `SI objective "${obj.name}" passes the dominance test with ${totalIndicatorsWithBaselineAndTarget} quantified indicators, but they use bespoke metrics rather than Art 2(17) examples or L2 RTS Annex I PAI indicators.`;
  } else if (dominancePass && recognisedSourceCount >= 1 && recognisedSourceCount < 3) {
    band = "partially_aligned";
    rationale = `SI objective "${obj.name}" passes the dominance test but offers only ${recognisedSourceCount}/3 required quantified indicators from recognised sources.`;
  } else if (isCarbonReductionObjective(obj.category) && condition4a_partial && dominancePass && condition3) {
    band = "partially_aligned";
    rationale = `9(3) carbon-reduction sub-case applies and is partially evidenced (one of {SBTi-validated + net-zero, EU CTB/PAB alignment, IEA NZE pathway} is present; others incomplete).`;
  } else if (!dominancePass) {
    band = "not_aligned";
    rationale = `SI objective "${obj.name}" fails the dominance test and does not meet the indicator threshold — project economics appear conventional with sustainability as bolt-on.`;
  } else {
    band = "not_aligned";
    rationale = `SI objective "${obj.name}" declared but contribution evidence is below threshold (${recognisedSourceCount}/3 recognised-source quantified indicators).`;
  }

  const score: SFDRCriterionScore = {
    band,
    rationale_text: rationale,
    evidence_refs: dom?.investment_memorandum_ref ? [dom.investment_memorandum_ref] : [],
  };
  if (!condition4b_applicable && benchmark_not_applicable_rationale) {
    score.not_applicable_rationale = benchmark_not_applicable_rationale;
  }
  return score;
};

// -- Criterion 9: SI-eligibility evidence pack (cascades from c2, c4, c8) ---

export const art9_c9_si_eligibility_evidence_pack: SFDRScoringFn = (ctx) => {
  const ep = getArt9(ctx)?.evidence_pack;
  if (!ep) return insufficient("No evidence-pack metadata provided at project level.");

  // ------ Cascade rules (load-bearing per v3.4 methodology) -----------------
  const c8 = ctx.dependencies.get("sfdr_v1_si_objective_qualification");
  const c4 = ctx.dependencies.get("sfdr_v1_dnsh_assessment");
  const c2 = ctx.dependencies.get("sfdr_v1_good_governance_attestation");
  const cascadeTriggers: string[] = [];
  if (c8?.band === "not_aligned") cascadeTriggers.push("criterion 8 (SI objective) is not_aligned");
  if (c4?.band === "not_aligned") cascadeTriggers.push("criterion 4 (DNSH) is not_aligned — Art 2(17) explicit DNSH requirement");
  if (c2?.band === "not_aligned") cascadeTriggers.push("criterion 2 (good governance) is not_aligned — Art 2(17) explicit good-governance requirement");
  if (cascadeTriggers.length > 0) {
    return {
      band: "not_aligned",
      rationale_text:
        `Evidence pack cannot be SI-eligible: ${cascadeTriggers.join("; ")}. ` +
        `Art 2(17) gates are independent and any single failure forces criterion 9 not_aligned.`,
    };
  }

  // ------ Component completeness ------------------------------------------
  const c10 = ctx.dependencies.get("sfdr_v1_project_pai_data_provision");
  const components: { name: string; verdict: SFDRBand | "missing" }[] = [
    { name: "Contribution attestation (criterion 8)", verdict: c8?.band ?? "missing" },
    { name: "DNSH attestation (criterion 4)", verdict: c4?.band ?? "missing" },
    { name: "Good-governance attestation (criterion 2)", verdict: c2?.band ?? "missing" },
    {
      name: "PAI data file (criterion 10)",
      verdict: ep.pai_data_file_ref ? c10?.band ?? "missing" : "missing",
    },
    {
      name: "Documentation completeness",
      verdict: isRecencyAligned(ep) ? "aligned" : isRecencyPartial(ep) ? "partially_aligned" : "not_aligned",
    },
  ];

  const missingComponents = components.filter((c) => c.verdict === "missing");
  if (missingComponents.length >= 2) {
    return insufficient(
      `Evidence pack incomplete: ${missingComponents.length} of 5 components missing or unevaluable (${missingComponents.map((c) => c.name).join("; ")}).`,
    );
  }
  if (missingComponents.length === 1 && missingComponents[0].name.includes("PAI data file")) {
    return {
      band: "not_aligned",
      rationale_text: `Evidence pack missing the PAI data file (criterion 10) — Art 9 FMP lift requires machine-readable PAI data.`,
    };
  }

  // ------ Attestation kind / band aggregation ------------------------------
  const allAligned = components.every((c) => c.verdict === "aligned");
  const anyNotAligned = components.some((c) => c.verdict === "not_aligned");
  const anyPartial = components.some((c) => c.verdict === "partially_aligned");

  const attestationKinds = [
    ep.contribution_attestation,
    ep.dnsh_attestation,
    ep.governance_attestation,
  ];
  const allAuditorOrAdvisor = attestationKinds.every(
    (k) => k === "auditor" || k === "technical_advisor",
  );
  const anyManagementOnly = attestationKinds.some((k) => k === "management_only");

  let band: SFDRBand;
  let rationale: string;
  if (allAligned && allAuditorOrAdvisor) {
    band = "aligned";
    rationale = `Evidence pack complete: all five components aligned, with auditor or technical-advisor attestation on the contribution / DNSH / governance components.`;
  } else if (anyNotAligned) {
    band = "not_aligned";
    rationale = `Evidence pack has a component at not_aligned: ${components.filter((c) => c.verdict === "not_aligned").map((c) => c.name).join("; ")}.`;
  } else if (allAligned && anyManagementOnly) {
    band = "partially_aligned";
    rationale = `All five components aligned but at least one is management-prepared rather than auditor-attested; for SI-eligible Art 9 lift, components 1–3 require auditor or technical-advisor attestation.`;
  } else if (anyPartial) {
    band = "partially_aligned";
    rationale = `Evidence pack has ≥1 component partially_aligned: ${components.filter((c) => c.verdict === "partially_aligned").map((c) => c.name).join("; ")}.`;
  } else {
    band = "partially_aligned";
    rationale = `Evidence pack components present but verdicts uneven across components 1–5.`;
  }

  return {
    band,
    rationale_text: rationale,
    evidence_refs: ep.pai_data_file_ref ? [ep.pai_data_file_ref] : [],
  };
};

function isRecencyAligned(ep: Art9EvidencePackInputs): boolean {
  const op = ep.operational_doc_age_months;
  const ds = ep.design_stage_doc_age_months;
  // If both are provided, both must clear their respective thresholds.
  if (op !== undefined && op > 12) return false;
  if (ds !== undefined && ds > 24) return false;
  return op !== undefined || ds !== undefined;
}

function isRecencyPartial(ep: Art9EvidencePackInputs): boolean {
  const op = ep.operational_doc_age_months;
  if (op !== undefined && op > 12 && op <= 18) return true;
  return false;
}

// -- Criterion 10: Project PAI data provision (verification gate reads c3) --

export const art9_c10_project_pai_data_provision: SFDRScoringFn = (ctx) => {
  const pd = getArt9(ctx)?.pai_data;
  if (!pd) return insufficient("No PAI data file provided at project level.");

  const perPai = pd.per_pai ?? {};
  let withValue = 0;
  let thirdPartyVerified = 0;
  let methodologyRefMissing = 0;
  for (const n of MATERIAL_PAI_NUMBERS) {
    const datum = perPai[String(n)];
    if (!datum) continue;
    if (datum.value !== undefined && datum.value !== null) {
      withValue++;
      if (!datum.methodology_ref) methodologyRefMissing++;
      if (datum.third_party_verified) thirdPartyVerified++;
    }
  }
  const totalMaterial = MATERIAL_PAI_NUMBERS.length;

  // PAI 7 (biodiversity) gate: data MUST be present for projects within 2km
  // of a Key Biodiversity Area.
  const pai7 = perPai["7"];
  const pai7AbsentNearKba =
    pd.within_2km_of_kba === true && (!pai7 || pai7.value === undefined || pai7.value === null);
  if (pai7AbsentNearKba) {
    return {
      band: "not_aligned",
      rationale_text: `PAI 7 (biodiversity) data is absent and the project is within 2km of a Key Biodiversity Area — under the v3.4 methodology this absence is a hard fail regardless of overall PAI coverage.`,
      numeric_value: { value: withValue, unit: `/${totalMaterial}`, label: "Material PAI coverage" },
    };
  }

  // Verification gate: read criterion 3 result.
  const c3 = ctx.dependencies.get("sfdr_v1_pai_consideration_policy");
  const c3Weak = !c3 || c3.band !== "aligned";
  const requiresExtraVerification = c3Weak;
  const meetsExtraVerification = thirdPartyVerified >= 9;

  // Recency / machine-readable gates.
  const recencyOk =
    pd.data_recency_months === undefined || pd.data_recency_months <= 12;
  const recencyPartial =
    pd.data_recency_months !== undefined &&
    pd.data_recency_months > 12 &&
    pd.data_recency_months <= 18;
  const machineReadable = pd.machine_readable_form === "csv" || pd.machine_readable_form === "json";

  // Band synthesis.
  let band: SFDRBand;
  let rationale: string;

  if (withValue < 8) {
    band = "not_aligned";
    rationale = `Only ${withValue}/${totalMaterial} material PAIs have values; minimum threshold for any Art 9 verdict above not_aligned is 8/11.`;
  } else if (methodologyRefMissing > 0) {
    band = "not_aligned";
    rationale = `${methodologyRefMissing} of the provided PAI data points lack methodology references and cannot be FMP-verified.`;
  } else if (withValue === totalMaterial && recencyOk && machineReadable) {
    // Candidate for aligned — verification gate decides.
    if (requiresExtraVerification && !meetsExtraVerification) {
      band = "partially_aligned";
      rationale = `All 11 PAIs present with methodology; recent; machine-readable. But criterion 3 (entity Art 4 policy) is ${c3?.band ?? "missing"}; under v3.4 verification gate this requires ≥9 of 11 PAIs to be third-party-verified. Currently ${thirdPartyVerified}/11 third-party-verified — band caps at partially_aligned.`;
    } else {
      band = "aligned";
      rationale = `All 11 PAIs present with methodology, recent (≤12mo), machine-readable.${
        requiresExtraVerification
          ? ` Verification gate cleared: ${thirdPartyVerified}/11 PAIs third-party-verified (criterion 3 weak — ≥9 required).`
          : " Criterion 3 aligned — no additional verification required."
      }`;
    }
  } else if (withValue >= 8 && withValue <= totalMaterial - 1) {
    band = "partially_aligned";
    rationale = `${withValue}/${totalMaterial} material PAIs have values; 1–3 missing or unevaluable (no significant_harm signal).`;
  } else if (recencyPartial) {
    band = "partially_aligned";
    rationale = `All 11 PAIs present but data recency is ${pd.data_recency_months} months (12–18 month window) — caps at partially_aligned.`;
  } else if (!machineReadable) {
    band = "partially_aligned";
    rationale = `All 11 PAIs present but not delivered in machine-readable form (csv/json) — caps at partially_aligned.`;
  } else {
    band = "partially_aligned";
    rationale = `${withValue}/${totalMaterial} PAIs present; gating conditions partially met.`;
  }

  return {
    band,
    rationale_text: rationale,
    numeric_value: { value: withValue, unit: `/${totalMaterial}`, label: "Material PAI coverage" },
  };
};
