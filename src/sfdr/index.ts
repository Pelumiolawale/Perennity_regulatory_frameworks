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
} from "./types";

export {
  scoreSFDRCriteria,
  topologicalSort,
  validateCrossFrameworkDeps,
} from "./orchestration";
export type { SFDRScoringFn, SFDRScoringContext } from "./orchestration";

export { SFDR_REGISTRY } from "./registry";
