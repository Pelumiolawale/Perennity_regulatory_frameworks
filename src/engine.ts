// ============================================================================
// Perennity Bridge — Engine + Two-Renderer Architecture (sketch)
// ============================================================================
// This file is a scaffolding sketch, not production code. Its purpose is to
// communicate the architectural shape to Claude Code so it can flesh out
// each module with proper implementations, tests, and types.
//
// The core idea: ONE deterministic scoring engine, TWO renderers. The engine
// always runs end-to-end against the full data model. What differs between
// Snapshot (free, diagnostic) and Report (paid, attestation) is which fields
// of the engine output are exposed in the rendered artefact.
//
// This is the technical embodiment of the hard-gate decision in Ask A of the
// strategy. The engine is the diligenceable IP for the Ask C exit thesis.
// ============================================================================

// ----------------------------------------------------------------------------
// 1. CORE TYPES — what the engine consumes and produces
// ----------------------------------------------------------------------------

export interface Activity {
  id: string;
  framework: Framework;
  framework_version: string;
  framework_source_hash: string;
  activity_code: string;
  activity_name: string;
  nace_codes?: string[];
  environmental_objective: EnvironmentalObjective;
  methodology_version: string; // e.g. "v3.2"
  methodology_vintage?: string; // e.g. "May 2026"
  effective_date: string;
  supersedes?: string;
  substantial_contribution_criteria?: Criterion[];
  dnsh_criteria?: DNSHCriterion[];
  methodology_criteria?: Criterion[];
  safeguards_criteria?: Criterion[];
  minimum_safeguards?: MinimumSafeguards;
}

export type Framework =
  | "EU_TAXONOMY_CLIMATE"
  | "EU_TAXONOMY_ENVIRONMENTAL"
  | "SFDR"
  | "UK_SDR"
  | "ICMA_GBP"
  | "EU_GBS"
  | "EIB_CBI"
  | "LEED"
  | "BREEAM";

export type EnvironmentalObjective =
  | "climate_change_mitigation"
  | "climate_change_adaptation"
  | "water_and_marine_resources"
  | "circular_economy"
  | "pollution_prevention"
  | "biodiversity_and_ecosystems"
  | "not_applicable";

export interface Criterion {
  id: string;
  criterion: string;
  source_reference: string;
  source_text: string; // verbatim regulation text
  requirement_type: RequirementType;
  applies_to?: string;
  threshold_value?: number | null;
  threshold_operator?: ThresholdOperator | null;
  threshold_unit?: string | null;
  threshold_metric?: string | null;
  verification_requirement?: VerificationRequirement | null;
  verification_frequency_years?: number | null;
  data_inputs_required?: DataInput[];
  data_points_required?: string[];
  conditional_on?: string | null;
  estimation_allowed?: boolean;
  narrative_template_refs?: string[];
  scoring_logic_ref: string; // points into versioned scoring library

  // v0.2.0 / methodology v3.2 additions
  authority_level?: 1 | 2 | 3;
  authority_source?: string;
  calibration_references?: string[];
  snapshot_inclusion?: boolean;
  depends_on?: string[];
  framework_applicability?: string[];
  render_paths?: ("snapshot" | "paid_report")[];
}

export type RequirementType =
  | "numeric_threshold"
  | "compliance_attestation"
  | "qualitative_assessment"
  | "verification_requirement"
  | "benchmarking"
  | "rollup";

export type ThresholdOperator =
  | "less_than"
  | "less_than_or_equal"
  | "greater_than"
  | "greater_than_or_equal"
  | "equal_to";

export type VerificationRequirement =
  | "independent_third_party"
  | "self_attestation"
  | "regulator_approved";

export type DataInputType =
  | "numeric"
  | "boolean"
  | "structured_list"
  | "free_text"
  | "document_reference";

export interface DataInput {
  field: string;
  type: DataInputType;
  measurement_standard?: string;
  reference_document?: string;
  unit?: string;
  required?: boolean;
}

export interface DNSHCriterion extends Criterion {
  objective: Exclude<EnvironmentalObjective, "not_applicable">;
}

export interface MinimumSafeguards {
  source_reference: string;
  requirements: string[];
}

// User-submitted project data — the intake payload
export interface ProjectInput {
  project_id: string;
  intake_timestamp: string;
  facility_type: "hyperscale" | "colocation" | "edge" | "enterprise";
  jurisdiction: string; // ISO country code
  facility_status: "operational" | "construction" | "design";
  build_completion_year?: number;
  data_points: Record<string, unknown>; // keyed by criterion data_input.field
  evidence_documents: EvidenceReference[];
}

export interface EvidenceReference {
  document_id: string;
  document_type: string;
  uri: string;
  uploaded_at: string;
  sha256: string; // for tamper-evidence
}

// ----------------------------------------------------------------------------
// 2. ENGINE OUTPUT — the full result, before any renderer touches it
// ----------------------------------------------------------------------------

export type Verdict =
  | "pass"
  | "partial"
  | "fail"
  | "not_applicable"
  | "data_missing"
  | "banded"
  | "deprecated";

export interface CriterionResult {
  criterion_id: string;
  verdict: Verdict;
  observed_value?: number | string | boolean | null;
  threshold_value?: number | null;
  threshold_operator?: ThresholdOperator | null;
  gap_summary: string; // one-sentence, IC-voice
  evidence_refs: string[]; // document_ids that informed the verdict
  scoring_logic_ref: string; // for audit trail
  scoring_logic_version: string;
  estimation_used?: boolean; // EU Platform Feb 2025 estimation flag

  // v0.2.0 additions: authority-level provenance, banded results, rollup
  authority_level?: 1 | 2 | 3;
  band_label?: string;
  band_score?: number;
  new_build_read?: { band_label: string; band_score: number } | null;
  climate_k1?: number;
  climate_label?: "cool" | "warm";
  country_code?: string;
  contributing_pillars?: { criterion_id: string; verdict: Verdict }[];
  missing_items?: string[];
}

export interface FrameworkResult {
  framework: Framework;
  framework_version: string;
  framework_source_hash: string;
  activity_id: string;
  sc_results: CriterionResult[];
  dnsh_results: CriterionResult[];
  safeguards_results?: CriterionResult[];
  methodology_results?: CriterionResult[];
  minimum_safeguards_verdict: Verdict;
  overall_verdict: Verdict;
  indicative_score: number; // 0-100, banded by renderer
}

export interface EngineRun {
  run_id: string; // UUID, becomes engagement reference for paid reports
  run_timestamp: string;
  methodology_version: string; // e.g. "v3.1"
  engine_commit_sha: string; // git SHA of engine code at runtime
  knowledge_base_hash: string; // hash of regulatory knowledge base
  project_input: ProjectInput;
  framework_results: FrameworkResult[];
  gap_list: GapItem[]; // synthesised across frameworks, ordered by severity
}

export interface GapItem {
  gap_id: string;
  framework: Framework;
  criterion_id: string;
  severity: "critical" | "material" | "minor";
  ic_voice_description: string; // "Your project does not yet evidence..."
  remediation_summary: string;
}

// ----------------------------------------------------------------------------
// 3. THE ENGINE — deterministic, versioned, audit-logged
// ----------------------------------------------------------------------------

export interface Engine {
  /**
   * Run scoring for a project input against the full set of applicable
   * activities. Returns a complete EngineRun regardless of entitlement.
   * The renderer decides what the user sees.
   *
   * MUST be deterministic: same input + same knowledge base + same engine
   * commit = bit-identical output. This is the core property that makes
   * the IP diligenceable.
   */
  run(input: ProjectInput, activities: Activity[]): Promise<EngineRun>;

  /**
   * Re-run a historical engagement against its captured manifest. Used for
   * the "what changed since 2026?" client question and for audit.
   */
  replay(runId: string, manifest: ReplayManifest): Promise<EngineRun>;
}

export interface ReplayManifest {
  run_id: string;
  engine_commit_sha: string;
  knowledge_base_hash: string;
  project_input_snapshot: ProjectInput;
}

// ----------------------------------------------------------------------------
// 4. RENDERERS — Snapshot (free) and Report (paid). Same input, different output.
// ----------------------------------------------------------------------------

export type Entitlement = "snapshot" | "report";

export interface Renderer<T> {
  entitlement: Entitlement;
  render(run: EngineRun): Promise<T>;
}

// ---- Snapshot renderer (free tier) ----
//
// Strict allowlist of fields. Per strategy Ask A1:
//   - indicative score (banded), heat-map (pass/partial/fail per framework),
//     gap list (3-5 items, one sentence each).
//   - NO thresholds, NO DNSH narrative, NO PAI table, NO signature,
//     NO methodology version stamp, NO Dolapo letterhead.

export interface SnapshotOutput {
  run_id: string;
  indicative_score: number;
  indicative_band: "Green" | "Amber" | "Red";
  heatmap: HeatmapCell[];
  gap_list: SnapshotGap[]; // capped at 5, IC-voice
  disclaimer: string; // Article 26 disclaimer, verbatim
  generated_at: string;
  cta: "request_project_readiness_report";
  // Deliberately absent: methodology_version, signatory, thresholds,
  // source_text quotes, narrative paragraphs, evidence log.
}

export interface HeatmapCell {
  framework: Framework;
  verdict: "pass" | "partial" | "fail";
}

export interface SnapshotGap {
  gap_id: string;
  one_sentence_description: string;
}

// Implementation lives in src/renderers/snapshot.ts. The class is intentionally
// not defined here — keeping the renderer outside engine.ts lets the structural
// gate test in src/renderers/__tests__/snapshot.gate.test.ts treat the renderer
// as a black box and prevents any accidental import cycle between
// engine.ts and the renderer's logic.

// ---- Report renderer (paid tier) ----
//
// Per strategy Ask A1 and D3:
//   - Defence-brief structure: Situation → Frameworks Applied → Evidence
//     Presented → Conclusions → Residual Disclosure.
//   - Methodology version stamp, signatory block, engagement reference.
//   - Full DNSH narrative composed from versioned template library.
//   - Source Evidence Log embedded as appendix.
//   - IC Defence Pack as a separate but co-generated artefact.

export interface ReportOutput {
  run_id: string;
  engagement_reference: string;
  methodology_version: string;
  signatory: Signatory;
  knowledge_base_hash: string;
  engine_commit_sha: string;
  sections: ReportSection[];
  evidence_log: EvidenceLogEntry[];
  ic_defence_pack: ICDefencePack;
  disclaimer: string; // same Article 26 disclaimer
  generated_at: string;
}

export interface Signatory {
  name: string;
  title: string;
  signature_block_uri: string; // signed PDF segment
}

export interface ReportSection {
  section_id: "situation" | "frameworks_applied" | "evidence_presented" | "conclusions" | "residual_disclosure";
  heading: string;
  narrative: string; // composed from templates + evidence
  references: SourceReference[];
}

export interface SourceReference {
  framework: Framework;
  source_reference: string; // e.g. "Annex_I_Section_8.1_paragraph_2"
  source_text_excerpt: string; // verbatim, citable
}

export interface EvidenceLogEntry {
  evidence_id: string;
  document_id: string;
  document_sha256: string;
  fields_supported: string[]; // which data_points this document evidenced
  ingested_at: string;
}

export interface ICDefencePack {
  pack_version: string;
  questions: ICQuestion[];
}

export interface ICQuestion {
  q_id: string;
  question: string;
  ic_voice: "executive" | "technical" | "legal";
  framework_anchor: Framework;
  answer: string;
  evidence_refs: string[];
  template_ref: string;
}

// Implementation lives in src/renderers/report.ts.

// ----------------------------------------------------------------------------
// 5. IC DEFENCE PACK BUILDER — the Ask B2 / Ask D4 franchise asset
// ----------------------------------------------------------------------------

export interface ICDefencePackBuilder {
  /**
   * Generate a defence pack from an engine run. Selects questions from a
   * versioned library indexed by framework + ICP archetype, then composes
   * answers from the engine's evidence log and verdict narratives.
   */
  build(run: EngineRun, archetype: ICArchetype): Promise<ICDefencePack>;
}

export type ICArchetype = "cfo" | "lp_analyst" | "dfi_esg_officer" | "deal_counsel";

// ----------------------------------------------------------------------------
// 6. ENTITLEMENT GATE — the structural enforcement of Ask A's hard gate
// ----------------------------------------------------------------------------

export interface EntitlementService {
  /**
   * Returns the entitlement for a given session. In Phase 1, "report"
   * entitlement is provisioned manually by Dolapo after engagement letter
   * countersignature. Self-serve checkout for £85k is out of scope.
   */
  getEntitlement(sessionId: string): Promise<Entitlement>;
}

/**
 * Top-level orchestration. The engine always runs the same way. The renderer
 * is selected at the very last step based on entitlement. This is the
 * structural guarantee that no free user can extract a paid-tier output.
 */
export async function generateOutput(
  engine: Engine,
  activities: Activity[],
  input: ProjectInput,
  entitlement: Entitlement,
  snapshotRenderer: Renderer<SnapshotOutput>,
  reportRenderer: Renderer<ReportOutput>
): Promise<SnapshotOutput | ReportOutput> {
  const run = await engine.run(input, activities);

  if (entitlement === "snapshot") {
    return snapshotRenderer.render(run);
  }
  return reportRenderer.render(run);
}

// ----------------------------------------------------------------------------
// 7. AUDIT TRAIL — what gets persisted for every run
// ----------------------------------------------------------------------------
//
// Per strategy Ask C4 (methodology IP defensibility) and the recomputability
// requirement: every run produces a manifest that can reconstruct it.

export interface RunManifest {
  run_id: string;
  run_timestamp: string;
  methodology_version: string;
  engine_commit_sha: string;
  knowledge_base_hash: string;
  activity_ids_used: string[];
  scoring_logic_versions_used: Record<string, string>;
  project_input_sha256: string;
  rendered_outputs: {
    snapshot_pdf_sha256?: string;
    report_pdf_sha256?: string;
    ic_defence_pack_sha256?: string;
  };
}

export interface AuditStore {
  persist(manifest: RunManifest): Promise<void>;
  retrieve(runId: string): Promise<RunManifest | null>;
  replayInput(runId: string): Promise<ProjectInput | null>;
}

// ============================================================================
// END OF SCAFFOLDING
// ============================================================================
