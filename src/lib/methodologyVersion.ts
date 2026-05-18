// Single source of truth for the Perennity Bridge methodology version stamp.
// Bump these together when methodology rules, thresholds, or regulatory
// citations change. Imported by the renderer footers, the engine provenance
// triple, the engagement-letter template generator, and the regulatory KB.

export const METHODOLOGY_VERSION = "v3.4";
export const METHODOLOGY_VINTAGE = "May 2026";
export const METHODOLOGY_VERSION_FULL = `${METHODOLOGY_VERSION} — ${METHODOLOGY_VINTAGE}`;

// v3.3 (Phase 1, commit 1.1) — SFDR Articles 8 and 9 declared.
//
// Anchored to:
//   - Regulation (EU) 2019/2088 (SFDR), consolidated 09/01/2024
//     (CELEX: 02019R2088-20240109)
//   - Commission Delegated Regulation (EU) 2022/1288, consolidated
//     20/02/2023 (CELEX: 02022R1288-20230220)
//   - EU Taxonomy Regulation (Regulation (EU) 2020/852, CELEX: 32020R0852),
//     for the Art 2a SFDR-Taxonomy disclosure interface and Article 5/6
//     alignment-disclosure requirements
//
// Framing decisions locked in v3.3:
//
//   1. PB scores SFDR for the project developer, not for the FMP.
//      Where SFDR addresses Financial Market Participants assessing
//      investees, the PB "entity" axis represents the developer's
//      corporate parent (UNGC compliance, board governance, PAI
//      disclosure practices) standing in for what an FMP would assess
//      at the investee level.
//
//   2. SFDR Article 9 sustainable investment threshold. PB requires a
//      minimum 90% sustainable investment proportion (per SFDR Art
//      2(17)) for an Article 9 alignment verdict, excluding cash held
//      for liquidity and instruments held purely for hedging. This
//      threshold sits above the converged market median (~80%) and
//      below the literal reading of the European Commission's June
//      2022 Q&A (effectively 100%). The 90% position is selected to
//      (i) preserve a meaningful qualitative gap between Article 8
//      and Article 9 verdicts, (ii) front-run potential regulatory
//      tightening, and (iii) reflect the investor-grade conservatism
//      appropriate to PB's review function. The threshold is necessary
//      but not sufficient — DNSH, good-governance, and pre-contractual
//      objective tests must independently pass.
//
//   3. SFDR 2.0 caveat. Commission proposal COM(2025) 841 (tabled
//      2025) would repeal Delegated Regulation 2022/1288 and
//      restructure Art 8/9 into a new category regime. Adoption is
//      18-30 months out at the time of v3.3 release. All v3.3 SFDR
//      verdicts are stamped against SFDR v1 (Reg 2019/2088 consolidated
//      09/01/2024) and remain valid as of date of issue.
//
//   4. Shared criterion library architecture. Each SFDR criterion is
//      a standalone JSON file under regulatory-knowledge/criteria/sfdr-v1/.
//      Framework JSONs are lightweight ref-lists. This pattern will
//      be reused in Phase 2 (UK SDR) and Phase 3 (ICMA GBP).
//
//   5. Forward-compat versioning. criterion_id and framework_id are
//      version-stamped (sfdr_v1_*). When SFDR 2.0 lands, new criteria
//      and frameworks ship under v2 suffixes alongside the existing
//      v1 ones; existing v1 verdicts remain valid without retroactive
//      relabelling.
//
// Scoring status as of v0.5.0-alpha.1: declared only. Full Article 8
// scoring lands in commit 1.2; Article 9 in commit 1.3.
//
// ----------------------------------------------------------------------------
// v3.3 — Article 8 scoring (v0.5.0-alpha.2, Phase 1 commit 1.2)
// ----------------------------------------------------------------------------
//
// All 7 Article 8 criteria are scored deterministically with five-band
// verdicts plus a sixth `not_applicable` band. Each scored cell carries
// rationale_text and (where applicable) evidence_refs, numeric_value, and
// not_applicable_rationale.
//
// PB scores SFDR for the project developer, not the FMP. The "entity" axis
// represents the developer's corporate parent (UNGC compliance, board
// governance, PAI disclosure practices). This framing is explicit and
// applies criterion-by-criterion below.
//
// Criterion 1 — sfdr_v1_e_s_characteristics_promotion (axes: project)
//   aligned:            ≥3 quantified characteristics, ≥2 sector-material
//   partially_aligned:  ≥2 quantified OR ≥3 qualitative
//   not_aligned:        <2 specific characteristics
//   insufficient_evidence: no disclosure material provided
//   Sector-material categories: energy_efficiency, water_stewardship,
//     land_use_biodiversity, community_local_impact
//     (regulatory-knowledge/constants/data_centre_sector_material_categories.json)
//
// Criterion 2 — sfdr_v1_good_governance_attestation (axes: entity)
//   Four-domain rubric (board, employee relations, remuneration, tax):
//   aligned:            all 4 domains Pass
//   partially_aligned:  ≥3 Pass, no Fail
//   not_aligned:        any Fail OR ≥2 Partial
//   insufficient_evidence: missing data for ≥1 domain
//   Tax screen uses regulatory-knowledge/constants/eu_non_cooperative_jurisdictions.json
//   (EU Council Annex I — refresh on each semi-annual ECOFIN update).
//   UNGC violation 5-year lookback is shared with criterion 4 PAI 10/11
//   via UNGC_LOOKBACK_YEARS in src/sfdr/constants.ts.
//
// Criterion 3 — sfdr_v1_pai_consideration_policy (axes: entity)
//   Material PAI set for data-centre developers (11 PAIs): 1, 2, 3, 5, 6,
//   7, 8, 9, 10, 11, 13 (regulatory-knowledge/constants/sfdr_v1_material_pais_data_centre.json).
//   PAI 3 reframed as developer's own GHG intensity per unit revenue / IT load
//   (developer-as-investee framing). PAI 6 treated as material for data
//   centres despite NACE ambiguity.
//   aligned:            ≥9 full evidence, ≤12mo recency, Art 4 referenced
//   partially_aligned:  6-8 full OR ≥9 mixed-quality, ≤18mo recency
//   not_aligned:        <6 full OR >18mo
//   insufficient_evidence: no statement URL
//   Numeric output: full-coverage count out of 11.
//
// Criterion 4 — sfdr_v1_dnsh_assessment (axes: project)
//   Per-PAI thresholds (verbatim from spec; see src/sfdr/art8-scoring.ts
//   evalPAI_* functions for the operational checks):
//     PAI 1/2/3 (GHG):    no_harm if SBTi-validated OR offsets meet ICVCM CCP
//                         OR (new build AND PPA coverage ≥80%); significant
//                         harm if top-quartile intensity AND no decarb pathway.
//     PAI 5/6 (Energy):   no_harm if PUE ≤1.3 (new) / ≤1.5 (existing) AND
//                         renewable tier 1/2 (or tier 3 with transition).
//     PAI 7 (Biodiversity): 2km buffer. >2km: EIA + no-material-disturbance.
//                         ≤2km: EIA + mitigation hierarchy (avoid→minimise→
//                         restore→offset) + quantified net-positive commitment.
//     PAI 8 (Water):      WUE ≤ CNDCP threshold (K1*K2*K3*0.4), discharge OK,
//                         evaporative cooling requires K2 ≤1.5 or mitigation.
//     PAI 9 (Hazardous waste): plan documented AND ≥80% hardware recovery.
//     PAI 10/11 (UNGC):   no violations in 5-year window AND monitoring documented.
//     PAI 13 (Board diversity): ≥30% women OR policy + ≤3-year target ≥30%.
//   DNSH is a screen: any single PAI significant_harm = not_aligned.
//   aligned:            all 11 PAIs no_harm
//   partially_aligned:  9-10 no_harm, remaining insufficient_evidence
//   not_aligned:        any significant_harm OR ≥3 insufficient
//   insufficient_evidence: ≥4 PAIs unevaluable
//
// Criterion 5 — sfdr_v1_pre_contractual_disclosure (axes: entity)
//   depends_on: ["sfdr_v1_e_s_characteristics_promotion"]
//   Cascade rule: criterion 1 not_aligned → criterion 5 not_aligned regardless
//   of Annex II coverage. Captures the regulatory truth that pre-contractual
//   disclosure is insufficient if the underlying characteristics fail.
//   Annex II element checklist: 1, 2, 3, 4, 5, 6, 7, 9, 10 (skip 8 and 11
//   — FMP-only). Items 4 and 6 require named framework for covered_specific
//   (recognised standards list: regulatory-knowledge/constants/recognised_sustainability_standards.json).
//   aligned:            ≥7 specific, items 4/6 named-framework, item 5 covered, ≤12mo
//   partially_aligned:  5-6 specific OR weakened items 4/5/6
//   not_aligned:        <5 specific OR cascade from criterion 1
//
// Criterion 6 — sfdr_v1_taxonomy_alignment_disclosure (axes: project)
//   depends_on_framework: ["eu_tax_climate_8_1"]  — cross-framework dep.
//   Reads EU Taxonomy 8.1 framework result via LogicInput.framework_results;
//   adapter maps EU-Tax Verdict ("pass"/"partial"/"fail"/"data_missing")
//   to SFDR bands ("aligned"/"partially_aligned"/"not_aligned"/"insufficient_evidence").
//   PB-corroborated percentage = EU Tax 8.1 indicative_score (0-100).
//   not_applicable when no Taxonomy claim made — populates
//   not_applicable_rationale for the renderer.
//   aligned:            EU 8.1 aligned + complete claim + overstatement ≤10pp + ≤12mo
//   partially_aligned:  EU 8.1 partial OR shallow disclosure OR Activity 8.2 missing
//   not_aligned:        EU 8.1 not_aligned OR overstatement >10pp OR no safeguards attestation
//   not_applicable:     no Taxonomy claim (light-green Article 8 positioning)
//   Numeric output: claimed Taxonomy alignment percentage.
//   10pp overstatement threshold anchors to IFRS materiality guidance.
//   Activity 8.2 scope limitation: PB Taxonomy assessment currently covers
//   only Activity 8.1; references to 8.2 → partially_aligned signal.
//
// Criterion 7 — sfdr_v1_periodic_reporting_commitment (axes: entity)
//   depends_on: ["sfdr_v1_e_s_characteristics_promotion"] (read-only — no
//   cascade; criterion 7 reads criterion 1's characteristics to verify the
//   indicator-link gate).
//   Operational threshold: 18 months since commissioning.
//   Operational case: ≥2 consecutive annual reports + recognised-standard
//   mapping + indicator-link to criterion 1 → aligned. 1 report → partial.
//   Pre-operational case: framework commitment with indicators/cadence/
//   assurance + parent track record ≥2 years + recognised standard → aligned.
//
// ----------------------------------------------------------------------------
// Aggregate Article 8 verdict
// ----------------------------------------------------------------------------
//
// Weight calibration deferred. Framework JSONs ship with `weight: null` for
// every criterion ref and `verdict_thresholds: { aligned: null,
// partially_aligned: null, not_aligned: 0 }`. The aggregate verdict logic
// will land in a post-Phase-1 calibration commit. Until then, the framework's
// overall_verdict is "not_applicable" and the renderer surfaces per-criterion
// cells (the heatmap is the primary surface, not the aggregate).
//
// ----------------------------------------------------------------------------
// Article 9 — see the v3.4 section below.
// ----------------------------------------------------------------------------
//
// ============================================================================
// v3.4 — Article 9 scoring (v0.5.0-alpha.4, Phase 1 commit 1.3)
// ============================================================================
//
// v3.4 is a substantive methodology bump (not a patch on v3.3). Three framing
// statements load the foundation; the per-criterion methodology follows.
//
// ----------------------------------------------------------------------------
// Framing 1 — Art 9 reframe (load-bearing)
// ----------------------------------------------------------------------------
//
// PB certifies Art 9 SI-eligibility at the project (asset) level. The project
// is the asset that an FMP may place in an Art 9 fund; the developer entity
// is the investee. FMP-level disclosure obligations — fund SI proportion
// calculation, portfolio-level PAI integration, reference benchmark
// designation — remain with the FMP. PB's certification answers the question:
// is this project a credible SI-qualifying asset that an FMP could place in
// their Art 9 fund without breaking SFDR? Where Art 9 mechanics are
// intrinsically fund-level (Art 9(1) benchmark designation as a structural
// fund choice; Art 9(3) fund-structural decisions), criteria evaluate
// compatibility at project level where meaningful and return not_applicable
// with rationale where not.
//
// ----------------------------------------------------------------------------
// Framing 2 — the 90% as positioning principle
// ----------------------------------------------------------------------------
//
// PB only certifies projects as Art 9 SI-eligible where SI characterisation
// is unambiguous and where an FMP could defensibly attribute the vast
// majority — operationally, ≥90% — of their investment in this project to
// the SI proportion of their fund. This 90% threshold expresses PB's
// positioning as the more conservative SPO, sitting above the converged
// market median (~80%) and below the European Commission June 2022 Q&A's
// literal reading of Art 2(17) SI definition (effectively 100%). It is a
// positioning principle that informs the calibration of criteria 8 and 9
// (raising the bar for `aligned` verdicts) but is NOT operationalised as a
// per-criterion arithmetic threshold. The principle is necessary but not
// sufficient — Art 2(17)'s DNSH and good-governance requirements must
// independently pass via criteria 4 and 2 respectively.
//
// (This framing supersedes the v3.3 quantitative SI floor at criterion-level;
// the 90% no longer functions as a numeric band gate. Verify by grep: no
// 0.9 / 90 numeric threshold exists in src/sfdr/ for any Art 9 criterion.)
//
// ----------------------------------------------------------------------------
// Framing 3 — site boundary
// ----------------------------------------------------------------------------
//
// Default project scope is asset-level: a single data centre asset, or a
// single site holding multiple buildings under common ownership. Where a
// single SPV holds multiple buildings on a single site, PB treats the site
// as one project; any single building's failure of DNSH (criterion 4) or
// SI-objective contribution (criterion 8) drags the site-level verdict down.
// Portfolio-level certification across multiple sites is available only
// under explicit engagement scope and is verdict-aggregated across
// constituent site-level results.
//
// ----------------------------------------------------------------------------
// Criterion count statement
// ----------------------------------------------------------------------------
//
// v3.4 ships 10 SFDR criteria — Art 8 (criteria 1–7, locked in v3.3) and
// Art 9 (criteria 8, 9, 10). Earlier v3.3 declarations referenced a
// criterion 11 (reference benchmark alignment); v3.4 folds benchmark
// compatibility into criterion 8 condition 4 sub-case (b), removing the
// standalone criterion. Where engagement scope explicitly anticipates Art
// 9(1) benchmarked fund placement, the benchmark compatibility test runs
// within criterion 8. The v3.3 criterion 9 ("sustainable_investment_floor")
// is also removed as a standalone criterion — the 90% concept moved to the
// methodology preamble per Framing 2.
//
// ----------------------------------------------------------------------------
// Criterion 8 — sfdr_v1_si_objective_qualification (axes: project)
// ----------------------------------------------------------------------------
//
// Anchors: SFDR Art 9(1)/(2)/(3); Art 2(17); Art 10(1)(a). Load-bearing
// for Art 9 — the 90% positioning principle expresses itself here as the
// calibration of the "dominant purpose" threshold for the aligned band.
//
// aligned:
//   1. Named single environmental or social objective, mappable to one
//      of the EU Taxonomy's six environmental objectives (Reg 2020/852
//      Art 9) OR to a social objective recognised in the Commission's
//      Feb 2022 draft Social Taxonomy report.
//   2. Dominance test: the SI objective is the primary commercial
//      rationale, evidenced by IM/board paper, project economics
//      dependent on the SI contribution, and marketing leading with the
//      SI objective rather than conventional commercial features.
//   3. ≥3 quantified indicators from Art 2(17) examples OR L2 RTS Annex I
//      Table 1 PAI indicators (NOT bespoke metrics). Each with baseline +
//      target + methodology. For pre-operational projects, design-stage
//      commitments with auditor-attested feasibility study acceptable.
//   4. Enhanced evidence:
//      Sub-case (a) — 9(3) carbon-reduction objectives: ≥1 of
//        {SBTi-validated 1.5°C with net-zero, EU CTB/PAB alignment at
//        project level, IEA NZE 2050 pathway compatibility}.
//      Sub-case (b) — Benchmark-aligned engagements (Art 9(1) placement
//        anticipated): activity exclusions cleared (typically EU CTB/PAB
//        per Delegated Reg 2020/1818 Art 12) AND carbon intensity
//        trajectory consistent with benchmark requirement (7% YoY for
//        EU CTB, 10% YoY for EU PAB).
//      Sub-case (b) defaults to not_applicable for engagements not
//      anticipating benchmark-aligned placement.
//
// partially_aligned: named + mappable BUT one of {dominance fails;
//   indicators bespoke or 1-2 only; sub-case (a) partial evidence}.
//
// not_aligned: no named objective OR not mappable OR sub-case (b) applies
//   and fails on exclusions or trajectory.
//
// insufficient_evidence: no disclosure / IM / pre-contractual material.
//
// Output: band + rationale_text + evidence_refs. No numeric_value.
// not_applicable_rationale populates when sub-case (b) defaults to N/A.
//
// ----------------------------------------------------------------------------
// Criterion 9 — sfdr_v1_si_eligibility_evidence_pack
// (axes: project + entity. Cascade rules LOAD-BEARING)
// ----------------------------------------------------------------------------
//
// Anchors: Art 2(17) DNSH + good-governance gates; L2 RTS Annex II-V
// pre-contractual templates. Evidence-pack quality test.
//
// Five required components:
//   1. Contribution attestation (c8 result, auditor- or technical-advisor-
//      reviewed)
//   2. DNSH attestation (c4 result, packaged for FMP lift)
//   3. Good-governance attestation (c2 result, packaged for FMP lift)
//   4. PAI data file (c10 result, machine-readable form)
//   5. Documentation completeness (dated, version-controlled, recency
//      ≤12mo operational / ≤24mo design-stage)
//
// Cascade rules (load-bearing — Art 2(17) explicit gates):
//   c8 not_aligned → c9 not_aligned
//   c4 not_aligned → c9 not_aligned (DNSH)
//   c2 not_aligned → c9 not_aligned (good governance)
//
// aligned: all 5 components aligned + auditor/advisor attestation on 1-3
//   + recency met.
// partially_aligned: all 5 present but ≥1 partial OR management-only
//   attestation OR operational recency 12-18mo.
// not_aligned: any component not_aligned OR PAI data file missing.
// insufficient_evidence: pack incomplete (≥2 components missing).
//
// Output: band + rationale_text + evidence_refs. No numeric_value.
//
// ----------------------------------------------------------------------------
// Criterion 10 — sfdr_v1_project_pai_data_provision
// (axes: project + entity. Reads c3 read-only via verification gate)
// ----------------------------------------------------------------------------
//
// Anchors: L2 RTS Annex I Table 1; SFDR Art 7. Data-provision test, NOT
// policy integration. Distinct from criterion 3 (which tests entity-level
// Art 4 policy).
//
// For each of the 11 material PAIs (1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 13 —
// same set as criteria 3 and 4 via material_pais_data_centre.json), provide:
//   actual or projected value, measurement period, methodology reference,
//   and where verified — verifier name + assurance level.
//
// aligned: all 11 PAIs with values + methodology + recency ≤12mo +
//   machine-readable. Verification gate: if c3 is aligned, no extra
//   verification required. If c3 partially_aligned or weaker, ≥9 of 11
//   PAIs must be third-party-verified (else caps at partially_aligned).
//
// partially_aligned: 8-10 PAIs OR recency 12-18mo OR not machine-readable
//   OR c3 weak + <9 third-party-verified.
//
// not_aligned: <8 PAIs OR methodology references missing OR PAI 7 absent
//   when project within 2km of a Key Biodiversity Area (hard fail).
//
// insufficient_evidence: no PAI data file at all.
//
// Output: band + rationale_text + evidence_refs + numeric_value (PAI
// coverage count out of 11; populated even for not_aligned bands).
//
// Cross-criterion reads:
//   - Reads c3 result for verification gate (read-only, NO cascade)
//   - Component of c9 evidence pack (c9 reads c10's result)
//
// ----------------------------------------------------------------------------
// Aggregate Art 9 verdict (deferred)
// ----------------------------------------------------------------------------
//
// Weight calibration remains deferred. Framework JSON ships with
// weight: null for every criterion ref and verdict_thresholds.aligned
// /partially_aligned null. The aggregate Art 9 verdict logic will land in
// a post-Phase-1 calibration commit. Until then, framework.overall_verdict
// is "not_applicable" (calibration_pending) and the renderer surfaces
// per-criterion cells — the heatmap is the primary surface.
