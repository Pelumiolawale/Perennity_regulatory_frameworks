// ============================================================================
// @perennity/engine — public barrel
// Pure re-exports. No logic. Adding logic here breaks the structural gate.
// ============================================================================

// --- Concrete engine implementation ----------------------------------------
// `Engine` is exported as the canonical name (alias of DeterministicEngine).
// `DeterministicEngine` is also exported for callers that prefer the explicit
// name (e.g. when distinguishing future engine variants).
export { DeterministicEngine, DeterministicEngine as Engine } from "./runtime";
export type { EngineDeps } from "./runtime";

// --- Renderers --------------------------------------------------------------
export { SnapshotRenderer, SNAPSHOT_PHRASES, DEFAULT_PHRASE } from "./renderers/snapshot";
export { ReportRenderer } from "./renderers/report";
export type {
  SnapshotPhraseTable,
  SnapshotRendererOptions,
  ReportRendererOptions,
  Severity,
} from "./renderers";

// --- Knowledge-base loader --------------------------------------------------
export {
  loadKnowledgeBase,
  compileValidator,
  validateActivity,
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

// --- Contract & domain types ------------------------------------------------
// The `Engine` interface from engine.ts is re-exported under the name
// `EngineInterface` to avoid shadowing the class export above. Consumers
// implementing alternative engines should target EngineInterface.
export type { Engine as EngineInterface } from "./engine";
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
