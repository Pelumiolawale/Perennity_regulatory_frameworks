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
/**
 * Methodology version string. Audit-bearing — bumped only when the deterministic
 * rules, thresholds, or regulatory citations in the engine change. Paired with
 * engine_commit_sha and knowledge_base_hash in EngineDeps to form the full
 * provenance triple on every SnapshotOutput and ReportOutput.
 */
export const METHODOLOGY_VERSION = "v3.1-2026-04";

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
