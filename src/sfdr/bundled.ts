// Bundled SFDR criterion library — runtime mirror of the JSON files under
// regulatory-knowledge/criteria/sfdr-v1/. Imports the JSONs at build time so
// Engine.run can resolve refs without async I/O. The async loader at
// src/knowledge/criterion-library.ts remains the canonical loader for
// tooling, drift detection, and tests that exercise the loader path.
//
// v0.6.0 (Phase 2): UK SDR criteria added to the same map. The name
// `BUNDLED_SFDR_CRITERIA` is historical — it became the runtime's single
// criterion library when SFDR was the only product-label regime. UK SDR
// uses the same orchestrator (src/sfdr/orchestration.ts) and the same
// scoring function signature, so adding the 15 UK SDR criteria here keeps
// the runtime resolution path unchanged (no second map to consult).

import type { SharedCriterion } from "../knowledge/criterion-library";

import dnsh_assessment from "../../regulatory-knowledge/criteria/sfdr-v1/sfdr_v1_dnsh_assessment.json";
import e_s_characteristics_promotion from "../../regulatory-knowledge/criteria/sfdr-v1/sfdr_v1_e_s_characteristics_promotion.json";
import good_governance_attestation from "../../regulatory-knowledge/criteria/sfdr-v1/sfdr_v1_good_governance_attestation.json";
import pai_consideration_policy from "../../regulatory-knowledge/criteria/sfdr-v1/sfdr_v1_pai_consideration_policy.json";
import periodic_reporting_commitment from "../../regulatory-knowledge/criteria/sfdr-v1/sfdr_v1_periodic_reporting_commitment.json";
import pre_contractual_disclosure from "../../regulatory-knowledge/criteria/sfdr-v1/sfdr_v1_pre_contractual_disclosure.json";
import project_pai_data_provision from "../../regulatory-knowledge/criteria/sfdr-v1/sfdr_v1_project_pai_data_provision.json";
import si_eligibility_evidence_pack from "../../regulatory-knowledge/criteria/sfdr-v1/sfdr_v1_si_eligibility_evidence_pack.json";
import si_objective_qualification from "../../regulatory-knowledge/criteria/sfdr-v1/sfdr_v1_si_objective_qualification.json";
import taxonomy_alignment_disclosure from "../../regulatory-knowledge/criteria/sfdr-v1/sfdr_v1_taxonomy_alignment_disclosure.json";

// UK SDR criteria (v0.6.0 — 15 criteria across Focus / Improvers / Impact).
import uk_sdr_asset_kpi_reporting from "../../regulatory-knowledge/criteria/uk-sdr-v1/uk_sdr_v1_asset_kpi_reporting.json";
import uk_sdr_asset_sustainability_profile from "../../regulatory-knowledge/criteria/uk-sdr-v1/uk_sdr_v1_asset_sustainability_profile.json";
import uk_sdr_baseline_sustainability_assessment from "../../regulatory-knowledge/criteria/uk-sdr-v1/uk_sdr_v1_baseline_sustainability_assessment.json";
import uk_sdr_credible_sustainability_standard from "../../regulatory-knowledge/criteria/uk-sdr-v1/uk_sdr_v1_credible_sustainability_standard.json";
import uk_sdr_impact_additionality from "../../regulatory-knowledge/criteria/uk-sdr-v1/uk_sdr_v1_impact_additionality.json";
import uk_sdr_impact_measurement from "../../regulatory-knowledge/criteria/uk-sdr-v1/uk_sdr_v1_impact_measurement.json";
import uk_sdr_impact_objective from "../../regulatory-knowledge/criteria/uk-sdr-v1/uk_sdr_v1_impact_objective.json";
import uk_sdr_impact_proportion_threshold from "../../regulatory-knowledge/criteria/uk-sdr-v1/uk_sdr_v1_impact_proportion_threshold.json";
import uk_sdr_impact_reporting from "../../regulatory-knowledge/criteria/uk-sdr-v1/uk_sdr_v1_impact_reporting.json";
import uk_sdr_improvement_kpi_targets from "../../regulatory-knowledge/criteria/uk-sdr-v1/uk_sdr_v1_improvement_kpi_targets.json";
import uk_sdr_improvement_proportion_threshold from "../../regulatory-knowledge/criteria/uk-sdr-v1/uk_sdr_v1_improvement_proportion_threshold.json";
import uk_sdr_improvement_strategy from "../../regulatory-knowledge/criteria/uk-sdr-v1/uk_sdr_v1_improvement_strategy.json";
import uk_sdr_no_significant_harm from "../../regulatory-knowledge/criteria/uk-sdr-v1/uk_sdr_v1_no_significant_harm.json";
import uk_sdr_progress_monitoring from "../../regulatory-knowledge/criteria/uk-sdr-v1/uk_sdr_v1_progress_monitoring.json";
import uk_sdr_sustainable_proportion_threshold from "../../regulatory-knowledge/criteria/uk-sdr-v1/uk_sdr_v1_sustainable_proportion_threshold.json";

const ALL = [
  // SFDR Art 8 (7 criteria, v3.3 — unchanged)
  e_s_characteristics_promotion,
  good_governance_attestation,
  pai_consideration_policy,
  dnsh_assessment,
  pre_contractual_disclosure,
  taxonomy_alignment_disclosure,
  periodic_reporting_commitment,
  // SFDR Art 9 (3 criteria, v3.4 — replaces the 4 v3.3 declarations)
  si_objective_qualification,
  si_eligibility_evidence_pack,
  project_pai_data_provision,
  // UK SDR Sustainability Focus (4 criteria, v3.5)
  uk_sdr_asset_sustainability_profile,
  uk_sdr_credible_sustainability_standard,
  uk_sdr_sustainable_proportion_threshold,
  uk_sdr_asset_kpi_reporting,
  // UK SDR Sustainability Improvers (5 criteria, v3.5)
  uk_sdr_baseline_sustainability_assessment,
  uk_sdr_improvement_strategy,
  uk_sdr_improvement_kpi_targets,
  uk_sdr_progress_monitoring,
  uk_sdr_improvement_proportion_threshold,
  // UK SDR Sustainability Impact (6 criteria, v3.5)
  uk_sdr_impact_objective,
  uk_sdr_impact_measurement,
  uk_sdr_impact_additionality,
  uk_sdr_impact_proportion_threshold,
  uk_sdr_impact_reporting,
  uk_sdr_no_significant_harm,
] as unknown as SharedCriterion[];

export const BUNDLED_SFDR_CRITERIA: ReadonlyMap<string, SharedCriterion> = new Map(
  ALL.map((c) => [c.criterion_id, c]),
);
