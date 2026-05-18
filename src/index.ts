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
