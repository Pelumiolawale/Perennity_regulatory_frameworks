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
}

// -- Cell payload returned by each scoring function --------------------------

export interface SFDRCriterionScore {
  band: SFDRBand;
  rationale_text: string;
  evidence_refs?: string[];
  not_applicable_rationale?: string;
  numeric_value?: { value: number; unit: string; label: string };
}
