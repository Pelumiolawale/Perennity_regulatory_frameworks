// ============================================================================
// @perennity/engine — public barrel
// Pure re-exports. No logic. Adding logic here breaks the structural gate.
// ============================================================================

// --- Concrete engine implementation ----------------------------------------
// The class is exported under its truthful name. `DeterministicEngine`
// distinguishes this implementation from any future engine variants.
// Consumers targeting the contract (e.g. for mocking) import the `Engine`
// type re-exported below.
export { DeterministicEngine } from "./runtime";
export type { EngineDeps } from "./runtime";

// --- Provenance constants ---------------------------------------------------
// Re-exported from src/lib/methodologyVersion.ts (single source of truth).
// Bumped only when the deterministic rules, thresholds, or regulatory citations
// in the engine change. Paired with engine_commit_sha and knowledge_base_hash
// in EngineDeps to form the full provenance triple on every SnapshotOutput and
// ReportOutput.
export {
  METHODOLOGY_VERSION,
  METHODOLOGY_VINTAGE,
  METHODOLOGY_VERSION_FULL,
} from "./lib/methodologyVersion";

// --- Render contract + FMP-ready PAI data file (v0.5.0-alpha.6, Phase 1, 1.4)
// Structured JSON output the SPA consumes. Engine produces; SPA renders.
// PAI data file mirrors SFDR 2022/1288 Annex I Table 1 — drop-in for FMP
// ingestion into existing Art 9 fund PAI portfolio integration. The F8
// deliverable from the May 2026 pressure-test.
export { buildRenderContract } from "./lib/renderContract";
export type {
  RenderContract,
  ProjectMetadata,
  SupportedRenderLabel,
  FrameworkFinding,
  CriterionVerdict,
  CriterionContractVerdict,
  EvidenceReference as RenderEvidenceReference,
  BuildRenderContractOptions,
} from "./lib/renderContract";
export { buildPAIDataFile } from "./lib/paiDataFile";
export type { PAIDataFile, PAIRow, VerificationStatus } from "./lib/paiDataFile";

// --- BUNDLED_SFDR_FRAMEWORKS (v0.5.0-alpha.7, Phase 1, commit 1.5a) ---------
// Browser-safe bundle of the two SFDR product_label frameworks with their
// criterion refs eagerly resolved. The SPA imports this directly, passes
// `framework` to Engine.run, and uses `criteria` for per-criterion lookups
// in the paid Report renderer. See src/lib/bundledSFDRFrameworks.ts for
// browser-safety notes and the relationship to BUNDLED_ACTIVITIES /
// BUNDLED_SFDR_CRITERIA.
export { BUNDLED_SFDR_FRAMEWORKS } from "./lib/bundledSFDRFrameworks";
export type { BundledSFDRFramework } from "./lib/bundledSFDRFrameworks";

// --- BUNDLED_UK_SDR_FRAMEWORKS (v0.6.0, Phase 2) ----------------------------
// Browser-safe bundle of the three UK SDR product_label frameworks (Focus,
// Improvers, Impact) with their criterion refs eagerly resolved. Same shape
// as BUNDLED_SFDR_FRAMEWORKS. The SPA imports this directly, passes
// `framework` to Engine.run, and uses `criteria` for per-criterion lookups
// in the paid Report renderer. See src/lib/bundledUKSDRFrameworks.ts for
// browser-safety notes.
export { BUNDLED_UK_SDR_FRAMEWORKS } from "./lib/bundledUKSDRFrameworks";
export type { BundledUKSDRFramework } from "./lib/bundledUKSDRFrameworks";

// --- Bundled activities (browser-friendly KB) -------------------------------
// loadKnowledgeBase uses node:fs + fast-glob and cannot run in browser
// contexts. BUNDLED_ACTIVITIES is a build-time-resolved Activity[] that
// browser consumers (Vite/Webpack) can import synchronously. The JSON files
// in regulatory-knowledge/ remain the canonical source of truth; this
// re-export is convenience only.
import eu_tax_climate_8_1 from "../regulatory-knowledge/frameworks/eu_taxonomy_climate/eu_tax_climate_8_1.json";
import type { Activity as ActivityType } from "./engine";

export const BUNDLED_ACTIVITIES: ActivityType[] = [
  eu_tax_climate_8_1 as unknown as ActivityType,
];

// --- Renderers --------------------------------------------------------------
export { SnapshotRenderer, SNAPSHOT_PHRASES, DEFAULT_PHRASE } from "./renderers/snapshot";
export { ReportRenderer } from "./renderers/report";
export type {
  SnapshotPhraseTable,
  SnapshotRendererOptions,
  ReportRendererOptions,
  Severity,
} from "./renderers";

// --- Snapshot single-label filter (v0.4.1, phase 1, commit 1.0) -------------
// Pure post-engine-run filter that narrows HeatmapCell[] to the user's
// selected target label before snapshot rendering. See src/renderers/filterCells.ts
// for the scoping rules. The paid Report renderer deliberately does NOT call
// this filter — comparative output is the paid deliverable's job.
export { filterCellsForSnapshot } from "./renderers/filterCells";
export type { SupportedLabel, FilterCellsResult } from "./renderers/filterCells";

// --- Label namespace bridge (v0.5.0-alpha.1, phase 1, commit 1.1) -----------
// Maps KB-internal `label_id` to public-facing `SupportedLabel`. The two
// namespaces are deliberately separate (hash stability vs. forward compat);
// see src/labels.ts for the full rationale.
export {
  labelIdToSupportedLabel,
  labelIdToSupportedLabelWithWarning,
} from "./labels";
export type { LabelMappingResult } from "./labels";

// --- Shared criterion library (v0.5.0-alpha.1, phase 1, commit 1.1) ---------
// Standalone criterion files + ref resolution. See
// regulatory-knowledge/criteria/criterion.schema.json for the schema and
// src/knowledge/criterion-library.ts for the loader + resolver.
export {
  loadCriterionLibrary,
  resolveCriterionRefs,
  CriterionLibraryValidationError,
} from "./knowledge/criterion-library";
export type {
  SharedCriterion,
  CriterionRef,
  CriterionLibrary,
  CriterionRefResolution,
  RefResolutionError,
  ResolveRefsResult,
  CriterionAxis,
  CriterionScoringStatus,
  RegulatoryAnchor,
} from "./knowledge/criterion-library";

// --- SFDR scoring (v0.5.0-alpha.2+, phase 1, commits 1.2 / 1.3) -------------
// Articles 8 and 9 fully scored under methodology v3.4. See /methodology.md
// at the repo root for the locked band definitions and src/sfdr/ for the
// scoring functions and orchestration.
export {
  SFDR_REGISTRY,
  scoreSFDRCriteria,
  topologicalSort,
  validateCrossFrameworkDeps,
} from "./sfdr";
export type {
  SFDRBand,
  SFDRCriterionScore,
  SFDRScoringFn,
  SFDRScoringContext,
  EntitySFDRInputs,
  ProjectSFDRInputs,
  ESCharacteristic,
  EntityGovernance,
  EntityPAIDisclosures,
  ProjectDNSH,
  TaxonomyClaim,
  EntityReporting,
  SectorMaterialCategoryId,
} from "./sfdr";
export { BUNDLED_SFDR_CRITERIA } from "./sfdr/bundled";

// --- UK SDR scoring (v0.6.0, Phase 2) ---------------------------------------
// UK SDR Sustainability Focus / Improvers / Impact, 15 criteria fully scored
// under methodology v3.5. Routes through the same SFDR orchestrator
// (src/sfdr/orchestration.ts) and the same SFDR_REGISTRY (which carries
// UK SDR entries since v0.6.0). The registry export below is the discrete
// UK-SDR-only map for tooling and tests that want to count UK SDR criteria
// without filtering the combined SFDR_REGISTRY.
export { UK_SDR_SCORING_REGISTRY } from "./sfdr";
export type {
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
} from "./sfdr";

// --- Knowledge-base loader --------------------------------------------------
export {
  loadKnowledgeBase,
  compileValidator,
  validateActivity,
  validateFramework,
  computeKnowledgeBaseHash,
  computeSchemaHash,
  canonicalStringify,
  KnowledgeBaseValidationError,
} from "./knowledge";
export type {
  KnowledgeBase,
  LoadOptions,
  ValidationIssue,
  CompiledValidator,
} from "./knowledge";

// --- Framework archetype types (phase 0, commit 0.1) ------------------------
// Three-archetype discriminated union over Activity. The runtime broadened
// to consume AnyFramework[] in commit 0.2; the legacy (Activity[]) call
// shape is still accepted via overload on DeterministicEngine.run. See
// src/framework.ts for the type definitions and src/prototype/ on branch
// spike/archetype-prototype for the validating spike that informed the design.
export type {
  FrameworkArchetype,
  ActivityAlignedFramework,
  ProductLabelFramework,
  ProductLabelFamily,
  ProductLabelCriterion,
  ProductLabelInputAxis,
  PAIIndicator,
  SustainableInvestmentCommitment,
  IssuanceFramework,
  IssuanceProcessComponent,
  IssuanceProcessComponentId,
  IssuanceCriterion,
  IssuanceInputAxis,
  AnyFramework,
} from "./framework";

// --- Runtime input axes (phase 0, commit 0.2) -------------------------------
// EntityInput and IssuanceInput are the two NEW input axes alongside the
// existing ProjectInput. RunInput is the wrapper Engine.run accepts under
// the broadened overload. LogicInput / LogicFn (in ./logic) carry an axes
// type parameter that gates which axes a criterion is allowed to read.
export type { EntityInput, IssuanceInput, RunInput } from "./inputs";
export type { InputAxis, LogicInput, LogicFn } from "./logic/types";

// --- Contract & domain types ------------------------------------------------
// `Engine` is the interface contract. `DeterministicEngine` (above) is the
// concrete implementation. No name collision: one is a value, the other a
// type — they occupy separate namespaces in TypeScript.
export type { Engine } from "./engine";
export type {
  Renderer,
  Entitlement,
  // Inputs
  Activity,
  Criterion,
  DNSHCriterion,
  MinimumSafeguards,
  ProjectInput,
  EvidenceReference,
  DataInput,
  DataInputType,
  // Engine output
  EngineRun,
  RunManifest,
  ReplayManifest,
  CriterionResult,
  FrameworkResult,
  GapItem,
  Verdict,
  Framework,
  EnvironmentalObjective,
  RequirementType,
  ThresholdOperator,
  VerificationRequirement,
  // Renderer output (the allowlists)
  SnapshotOutput,
  HeatmapCell,
  SnapshotGap,
  ReportOutput,
  ReportSection,
  SourceReference,
  EvidenceLogEntry,
  ICDefencePack,
  ICQuestion,
  ICArchetype,
  Signatory,
} from "./engine";

// --- v4 framework-modular lens architecture (Engine v4.0) -------------------
// ADDITIVE. The default entrypoint's v3.5 output shape (DeterministicEngine,
// renderers, renderContract, BUNDLED_*) is UNCHANGED — the SPA compatibility
// contract holds. These re-exports surface the new lens API alongside it; the
// full v4 surface is also available under the "@perennity/engine/v4" subpath.
export {
  assess,
  normalise,
  EULens,
  UKSDRLens,
  USSocialLicenseLens,
  LensRegistry,
  createDefaultLensRegistry,
  loadConfig,
  loadConfigV1,
  contestedItems,
  buildBenchmarkRecord,
  emitBenchmark,
  JsonlStorageAdapter,
  InMemoryStorageAdapter,
  lensVerdictToFrameworkResult,
  TRILOGUE_TRACKING,
  buildTrilogueTracking,
  ENGINE_V4_VERSION,
} from "./v4";
export type {
  CanonicalAssessment,
  LensVerdict,
  FrameworkLens,
  VerdictBand,
  VerdictSection,
  EvidenceGap,
  Citation,
  RegulatoryConfig,
  BenchmarkRecord,
  StorageAdapter,
  AssessOptions,
  AssessmentResult,
  TrilogueTracking,
} from "./v4";
