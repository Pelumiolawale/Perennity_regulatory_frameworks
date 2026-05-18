// ============================================================================
// SFDR-specific typed input shapes (v0.5.0-alpha.2 — Phase 1, commit 1.2)
// ============================================================================
//
// Typed nested fields read by the SFDR Article 8 scoring functions. These
// types are optional extensions on ProjectInput.sfdr and EntityInput.sfdr.
// When a scoring function reads an undefined nested field, the criterion
// resolves to insufficient_evidence (band-specific behaviour per spec).
//
// PB scores SFDR for the project developer. The entity axis carries the
// developer's corporate-parent / fund-manager-equivalent data; the project
// axis carries the specific project's disclosures and DNSH evidence.
// ============================================================================

// -- Five-band verdict + sixth N/A band --------------------------------------

export type SFDRBand =
  | "aligned"
  | "partially_aligned"
  | "not_aligned"
  | "insufficient_evidence"
  | "not_applicable"
  | "not_implemented";

// -- Criterion 1: E/S characteristics ----------------------------------------

export type SectorMaterialCategoryId =
  | "energy_efficiency"
  | "water_stewardship"
  | "land_use_biodiversity"
  | "community_local_impact";

export interface ESCharacteristic {
  name: string;
  category: "environmental" | "social";
  sector_material_category?: SectorMaterialCategoryId;
  indicator?: {
    metric: string;
    target_value: number;
    target_year: number;
    current_value?: number;
  };
  public_source?: string;
}

export interface ProjectESDisclosures {
  es_characteristics?: ESCharacteristic[];
}

// -- Criterion 2: Good governance --------------------------------------------

export interface BoardStructure {
  independent_ned_count: number;
  terms_of_reference_documented: boolean;
  ceo_chair_separated: boolean;
  lead_independent_director_designated: boolean;
  executive_committee_published: boolean;
}

export interface EmployeeRelations {
  ungp_aligned_policy_published: boolean;
  grievance_mechanism_documented: boolean;
  labour_law_compliance_attested: boolean;
  ungc_violations_5yr_count: number;
}

export interface Remuneration {
  policy_published: boolean;
  ceo_to_median_ratio_disclosed: boolean;
  ceo_to_median_ratio_value?: number;
  esg_linked_variable_pay: boolean;
}

export interface TaxCompliance {
  tax_policy_published: boolean;
  jurisdictions_used: string[];
  cbcr_jurisdiction_count: number;
  unresolved_tax_disputes_eur_max: number;
}

export interface EntityGovernance {
  board_structure?: BoardStructure;
  employee_relations?: EmployeeRelations;
  remuneration?: Remuneration;
  tax_compliance?: TaxCompliance;
}

// -- Criterion 3: PAI consideration policy -----------------------------------

export interface PAICoverageEntry {
  data_disclosed: boolean;
  target_disclosed: boolean;
  mitigation_documented: boolean;
}

export interface EntityPAIDisclosures {
  statement_url?: string;
  statement_published_date?: string; // ISO date
  art_4_explicit_reference: boolean;
  pai_coverage: Record<string, PAICoverageEntry>; // keyed by PAI number as string
}

// -- Criterion 4: DNSH per-PAI evidence (project level) ----------------------

export interface ProjectDNSHEvidence {
  // PAI 1, 2, 3 — GHG
  sbti_validated?: boolean;
  offsets_meet_icvcm_ccp?: boolean;
  new_build?: boolean;
  renewable_ppa_coverage_percent?: number;
  ghg_intensity_sector_top_quartile?: boolean;
  decarbonisation_pathway_documented?: boolean;
  // PAI 5, 6 — Energy
  pue?: number; // for the threshold check (≤1.3 new build / ≤1.5 existing)
  renewable_tier?: 1 | 2 | 3;
  transition_pathway_documented?: boolean;
  // PAI 7 — Biodiversity
  distance_to_biodiversity_sensitive_area_km?: number;
  eia_documented?: boolean;
  eia_concludes_no_material_disturbance?: boolean;
  eia_concludes_net_negative_unmitigated?: boolean;
  mitigation_hierarchy_applied?: boolean;
  net_positive_biodiversity_commitment_quantified?: boolean;
  // PAI 8 — Water
  wue_value?: number;
  wue_max_threshold?: number; // K1*K2*K3 * 0.4
  discharge_within_local_limits?: boolean;
  cooling_design?: "dry" | "hybrid" | "evaporative";
  k2_stress?: number;
  water_regulation_breach_documented?: boolean;
  // PAI 9 — Hazardous waste
  waste_management_plan_documented?: boolean;
  it_hardware_recovery_rate?: number; // 0-1
  hazardous_landfill_disposal_documented?: boolean;
  // PAI 10, 11 — UNGC (shared with criterion 2 Domain B)
  ungc_violations_5yr_count?: number;
  monitoring_process_documented?: boolean;
  // PAI 13 — Board diversity
  board_women_percent?: number;
  diversity_policy_published?: boolean;
  diversity_target_year?: number;
  diversity_target_percent?: number;
}

export interface ProjectDNSH {
  evidence?: ProjectDNSHEvidence;
}

// -- Criterion 5: Pre-contractual disclosure ---------------------------------

export type ElementCoverage = "covered_specific" | "covered_generic" | "absent";

export interface AnnexIIElementEvidence {
  coverage: ElementCoverage;
  named_framework?: string;
}

export interface EntityDisclosures {
  annex_ii_coverage?: Record<string, AnnexIIElementEvidence>; // keyed by element number
  material_published_date?: string;
  material_delivered_to_pb_date?: string;
}

// -- Criterion 6: Taxonomy alignment disclosure ------------------------------

export interface TaxonomyClaim {
  claimed_percentage: number;
  methodology: "capex" | "opex" | "revenue";
  six_objective_breakdown?: Record<string, number>;
  minimum_safeguards_attestation: boolean;
  published_date: string;
}

// -- Criterion 7: Periodic reporting commitment ------------------------------

export interface AnnualReport {
  year: number;
  url?: string;
  indicator_names: string[];
  named_standard?: string;
}

export interface EntityReporting {
  operational_status: "operational" | "pre_operational";
  commissioning_date?: string;
  project_reports?: AnnualReport[];
  parent_portfolio_reports?: AnnualReport[];
  reporting_framework_commitment?: {
    specifies_indicators: boolean;
    specifies_annual_cadence: boolean;
    specifies_assurance: boolean;
    named_standard?: string;
  };
}

// -- Aggregated entity/project SFDR sub-shapes -------------------------------

export interface EntitySFDRInputs {
  governance?: EntityGovernance;
  pai_disclosures?: EntityPAIDisclosures;
  disclosures?: EntityDisclosures;
  reporting?: EntityReporting;
}

export interface ProjectSFDRInputs {
  disclosures?: ProjectESDisclosures;
  dnsh?: ProjectDNSH;
  taxonomy_claim?: TaxonomyClaim | null;
  // v0.5.0-alpha.4 (Phase 1 commit 1.3 — methodology v3.4): Art 9 inputs.
  // Additive nested field; absence means Art 9 scoring resolves to
  // insufficient_evidence at each criterion. EntityInput is not extended in
  // 1.3 because Art 9 c8/c9/c10 all primarily read project-level evidence;
  // entity-side data (good governance, PAI policy) reaches c9 and c10 via
  // their cascade/read of c2 and c3 results.
  art9?: ProjectArt9Inputs;
}

// -- Criterion 8: SI objective qualification (v3.4) --------------------------

export type SIObjectiveCategory =
  | "environmental_climate_mitigation"
  | "environmental_climate_adaptation"
  | "environmental_water_marine"
  | "environmental_circular_economy"
  | "environmental_pollution_prevention"
  | "environmental_biodiversity"
  | "social_decent_work"
  | "social_adequate_standards_of_living"
  | "social_inclusive_communities"
  | "social_other_recognised";

export interface SIObjective {
  name: string;
  category: SIObjectiveCategory;
  // Mappability to EU Taxonomy 6 objectives (Reg 2020/852 Art 9) or to
  // social objectives recognised in the Commission's Feb 2022 draft Social
  // Taxonomy report. Empty/null means no mapping declared.
  taxonomy_mapping?: string | null;
  social_taxonomy_mapping?: string | null;
  declared_in?: string;
}

export interface DominanceEvidence {
  // Named in board paper / IM as the deal thesis.
  named_in_investment_memorandum: boolean;
  investment_memorandum_ref?: string;
  // Project economics depend on the SI contribution (renewable PPA revenue,
  // decarb premium, efficiency-driven cost structure, etc.).
  economic_rationale_depends_on_si: boolean;
  economic_rationale_description?: string;
  // Marketing/disclosure leads with the SI objective, not conventional
  // commercial features.
  marketing_leads_with_si: boolean;
}

export type QuantifiedIndicatorSource =
  | "art_2_17_example"
  | "l2_rts_annex_i_pai"
  | "bespoke";

export interface QuantifiedContributionIndicator {
  name: string;
  baseline: number;
  target: number;
  measurement_methodology: string;
  source: QuantifiedIndicatorSource;
}

export interface SubCaseACarbonEvidence {
  // Applies when the SI objective category is GHG/carbon-reduction.
  sbti_validated_1_5c: boolean;
  sbti_includes_net_zero: boolean;
  eu_ctb_or_pab_aligned_at_project_level: boolean;
  iea_nze_2050_compatible_with_trajectory: boolean;
}

export type BenchmarkType = "eu_ctb" | "eu_pab" | "other_designated";

export interface SubCaseBBenchmarkEvidence {
  // Applies when the engagement scope explicitly anticipates Art 9(1)
  // benchmark-aligned fund placement.
  anticipates_benchmark_placement: boolean;
  benchmark_type?: BenchmarkType;
  // Project clears the chosen benchmark's activity exclusions (typically
  // EU CTB/PAB exclusion list per Delegated Reg 2020/1818 Art 12).
  activity_exclusions_cleared?: boolean;
  // Carbon intensity trajectory consistent with benchmark requirement —
  // 7% YoY for EU CTB, 10% YoY for EU PAB.
  carbon_intensity_yoy_pct?: number;
}

export interface Art9SIObjectiveInputs {
  objective?: SIObjective;
  dominance?: DominanceEvidence;
  quantified_indicators?: QuantifiedContributionIndicator[];
  sub_case_a?: SubCaseACarbonEvidence;
  sub_case_b?: SubCaseBBenchmarkEvidence;
}

// -- Criterion 9: SI-eligibility evidence pack -------------------------------

export type AttestationKind = "auditor" | "technical_advisor" | "management_only";

export interface Art9EvidencePackInputs {
  contribution_attestation?: AttestationKind;
  dnsh_attestation?: AttestationKind;
  governance_attestation?: AttestationKind;
  // Reference to PAI data file (criterion 10 also reads its presence).
  pai_data_file_ref?: string;
  pai_data_file_machine_readable_form?: "csv" | "json";
  // Documentation recency. Operational data: ≤12mo for aligned, 12-18mo for
  // partially_aligned. Design-stage: ≤24mo for both bands.
  operational_doc_age_months?: number;
  design_stage_doc_age_months?: number;
}

// -- Criterion 10: Project PAI data provision --------------------------------

export type AssuranceLevel = "limited" | "reasonable";

export interface ProjectPAIDatum {
  value?: number;
  unit?: string;
  // ISO 8601 date or year — measurement period or reference date.
  period?: string;
  methodology_ref?: string;
  third_party_verified: boolean;
  verifier_name?: string;
  assurance_level?: AssuranceLevel;
  // Pre-operational: projected value with calculation methodology accepted.
  is_projected?: boolean;
}

export interface Art9PAIDataInputs {
  // Keyed by PAI number as string ("1", "2", ...). Material set is
  // MATERIAL_PAI_NUMBERS — same 11 PAIs as criteria 3 and 4.
  per_pai?: Record<string, ProjectPAIDatum>;
  machine_readable_form?: "csv" | "json";
  data_recency_months?: number;
  // Proximity to a Key Biodiversity Area, for the PAI 7 gate.
  within_2km_of_kba?: boolean;
}

export interface ProjectArt9Inputs {
  si_objective?: Art9SIObjectiveInputs;
  evidence_pack?: Art9EvidencePackInputs;
  pai_data?: Art9PAIDataInputs;
}

// -- Cell payload returned by each scoring function --------------------------

export interface SFDRCriterionScore {
  band: SFDRBand;
  rationale_text: string;
  evidence_refs?: string[];
  not_applicable_rationale?: string;
  numeric_value?: { value: number; unit: string; label: string };
}
