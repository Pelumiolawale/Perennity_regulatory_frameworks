// ============================================================================
// @perennity/engine/v4 — the framework-modular lens architecture entrypoint
// (Engine v4.0 — Module 8)
// ============================================================================
//
// NEW named entrypoint, exported ALONGSIDE the v3.5 default entrypoint. The
// default entrypoint (src/index.ts) still returns the v3.5 shape unchanged —
// this barrel exposes the v4 lens API for consumers that opt in. Pure
// re-exports; no logic.
// ============================================================================

// -- MetricsCore (canonical model) -------------------------------------------
export { normalise } from "../core/metricsCore";
export type { NormaliseSource, NormaliseContext } from "../core/metricsCore";
export type {
  CanonicalAssessment,
  CanonicalContext,
  EnergyMetrics,
  WaterMetrics,
  CarbonMetrics,
  CommunityLandMetrics,
  GovernanceDisclosureMetrics,
  TransitionRoadmap,
  Region,
  AssetStage,
  WaterStressBand,
  CoolingTechnologyClass,
  WaterSourceType,
  PPAStructure,
  DisclosureCompleteness,
  CommunityEngagementLevel,
  PresenceState,
  PermittingStatus,
  AssuranceStrength,
} from "../core/canonical";

// -- Lens interface + registry + lenses --------------------------------------
export { deriveConfidence } from "../lens/types";
export type {
  FrameworkLens,
  LensVerdict,
  VerdictBand,
  VerdictSection,
  SectionStatus,
  EvidenceGap,
  Citation,
  Confidence,
  GapSeverity,
} from "../lens/types";
export { LensRegistry } from "../lens/registry";
export type { LensRunResult, LensRunError } from "../lens/registry";
export { LensNotImplementedError } from "../lens/errors";
export { EULens } from "../lens/euLens";
export { UKSDRLens } from "../lens/ukSdrLens";
export {
  USSocialLicenseLens,
  US_SOCIAL_LICENSE_DIMENSIONS,
} from "../lens/usSocialLicenseLens";
export {
  createDefaultLensRegistry,
  EU_LENS_ID,
  UK_SDR_LENS_ID,
  US_SOCIAL_LICENSE_LENS_ID,
} from "../lens/defaults";

// -- Config layer (trilogue thresholds) --------------------------------------
export {
  loadConfig,
  loadConfigV1,
  defaultConfig,
  contestedItems,
  resolveThreshold,
  ConfigValidationError,
} from "../config/thresholds";
export type {
  RegulatoryConfig,
  ThresholdEntry,
  ThresholdStatus,
  ContestedItem,
  PaiIndicatorConfig,
  CategoryExclusionScope,
  SustainableCategoryConfig,
  TransitionCategoryConfig,
  EsgBasicsCategoryConfig,
} from "../config/thresholds";

// -- Benchmark residue layer -------------------------------------------------
export { buildBenchmarkRecord, hashAssetId } from "../benchmark/anonymise";
export type { BenchmarkOptions } from "../benchmark/anonymise";
export { emitBenchmark } from "../benchmark/emit";
export type { EmitResult, EmitOptions } from "../benchmark/emit";
export { JsonlStorageAdapter, InMemoryStorageAdapter } from "../benchmark/jsonlAdapter";
export type {
  BenchmarkRecord,
  BenchmarkLensHeadline,
  AnonymisedMetrics,
  StorageAdapter,
} from "../benchmark/types";

// -- Legacy compatibility adapter --------------------------------------------
export { lensVerdictToFrameworkResult } from "../legacy/adapter";
export type { LegacyAdapterOptions } from "../legacy/adapter";

// -- Top-level orchestration -------------------------------------------------
export { assess } from "../assess";
export type { AssessOptions, AssessmentResult } from "../assess";

// -- Provenance + trilogue tracking ------------------------------------------
export {
  TRILOGUE_TRACKING,
  buildTrilogueTracking,
  ENGINE_V4_VERSION,
  V4_METHODOLOGY_STATUS,
} from "./meta";
export type { TrilogueTracking } from "./meta";
