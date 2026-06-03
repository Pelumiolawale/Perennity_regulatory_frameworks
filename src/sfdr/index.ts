export type {
  SFDRBand,
  SFDRCriterionScore,
  EntitySFDRInputs,
  ProjectSFDRInputs,
  ESCharacteristic,
  EntityGovernance,
  EntityPAIDisclosures,
  ProjectDNSH,
  TaxonomyClaim,
  EntityReporting,
  SectorMaterialCategoryId,
  // v0.5.0-alpha.4 (Phase 1, commit 1.3): Art 9 input shapes.
  ProjectArt9Inputs,
  Art9SIObjectiveInputs,
  Art9EvidencePackInputs,
  Art9PAIDataInputs,
  SIObjective,
  SIObjectiveCategory,
  DominanceEvidence,
  QuantifiedContributionIndicator,
  QuantifiedIndicatorSource,
  SubCaseACarbonEvidence,
  SubCaseBBenchmarkEvidence,
  BenchmarkType,
  AttestationKind,
  ProjectPAIDatum,
  AssuranceLevel,
  // v0.6.0 (Phase 2 — UK SDR): project-level UK SDR input shapes.
  ProjectUKSDRInputs,
  UKSDRClaimedStandard,
  UKSDRKPIName,
  UKSDRReportingFrequency,
  UKSDRKPIReportingCommitment,
  UKSDRBaselineMetrics,
  UKSDRImprovementStrategy,
  UKSDRImprovementTargets,
  UKSDRImprovementPlan,
  UKSDRQuantifiedImpactIndicator,
  UKSDRImpactPlan,
} from "./types";

export {
  scoreSFDRCriteria,
  topologicalSort,
  validateCrossFrameworkDeps,
  aggregateProductLabelVerdict,
} from "./orchestration";
export type { SFDRScoringFn, SFDRScoringContext } from "./orchestration";

export { SFDR_REGISTRY } from "./registry";

// v0.6.0 (Phase 2 — UK SDR): UK SDR scoring functions + registry.
export {
  UK_SDR_SCORING_REGISTRY,
  uk_sdr_c1_asset_sustainability_profile,
  uk_sdr_c2_credible_sustainability_standard,
  uk_sdr_c3_sustainable_proportion_threshold,
  uk_sdr_c4_asset_kpi_reporting,
  uk_sdr_c5_baseline_sustainability_assessment,
  uk_sdr_c6_improvement_strategy,
  uk_sdr_c7_improvement_kpi_targets,
  uk_sdr_c8_progress_monitoring,
  uk_sdr_c9_improvement_proportion_threshold,
  uk_sdr_c10_impact_objective,
  uk_sdr_c11_impact_measurement,
  uk_sdr_c12_impact_additionality,
  uk_sdr_c13_impact_proportion_threshold,
  uk_sdr_c14_impact_reporting,
  uk_sdr_c15_no_significant_harm,
} from "./uk-sdr-scoring";
