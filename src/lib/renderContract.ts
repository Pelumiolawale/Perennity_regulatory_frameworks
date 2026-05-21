// ============================================================================
// Render Contract — canonical structured output for downstream renderers
// (v0.5.0-alpha.6 — Phase 1, commit 1.4)
// ============================================================================
//
// Promotes a structured JSON shape to first-class, documented, externally-
// consumable status. The Vite SPA consumes this contract; the engine emits it.
//
// Architecture (locked):
//   - Engine produces structured JSON only — no SNAPSHOT_PHRASES, no PDF
//     rendering here. SPA owns presentation.
//   - Aggregate verdict is `calibration_pending` in v3.5. No top-line. The
//     absence is a fairness-opinion positioning feature, not a gap to fill.
//   - SFDR framework findings only. Activity 8.1 results reach SFDR criterion
//     6 via cross-framework dep and are reflected in c6's verdict; they do
//     not appear in `framework_findings` directly.
//   - Additive on top of EngineRun. Existing scoring outputs are untouched.
// ============================================================================

import type { EngineRun, FrameworkResult, CriterionResult } from "../engine";
import { METHODOLOGY_VERSION } from "./methodologyVersion";
import { buildPAIDataFile, type PAIDataFile } from "./paiDataFile";

export interface RenderContract {
  schema_version: "1.0.0";
  methodology_version: string;
  generated_at: string;
  project: ProjectMetadata;
  framework_findings: FrameworkFinding[];
  pai_data_file: PAIDataFile;
  evidence_index: EvidenceReference[];
  overall_verdict: "calibration_pending";
}

export interface ProjectMetadata {
  project_id: string;
  project_name: string;
  jurisdiction: string;
  target_label: SupportedRenderLabel;
}

// SFDR label set the contract recognises. EU Tax 8.1, UK SDR, ICMA GBP land
// later; widen here when their RenderContract paths come online.
export type SupportedRenderLabel =
  | "sfdr_v1_article_8"
  | "sfdr_v1_article_9"
  | "sfdr_v1_article_8_and_9";

export interface FrameworkFinding {
  framework: "sfdr_art8" | "sfdr_art9";
  criteria: CriterionVerdict[];
}

// Criterion-level band union. Note: "no_harm" is a per-PAI internal verdict
// used inside DNSH evaluation (evalPAI_*), not a criterion-level band — it
// is deliberately omitted here. Criterion verdicts use the SFDR five-band
// set plus not_applicable.
export type CriterionContractVerdict =
  | "aligned"
  | "partially_aligned"
  | "not_aligned"
  | "not_applicable"
  | "insufficient_evidence";

export interface CriterionVerdict {
  criterion_id: string;
  criterion_label: string;
  verdict: CriterionContractVerdict;
  band_rationale: string;
  evidence_refs: string[];
  inputs_used: Record<string, unknown>;
  numeric_value?: { value: number; unit: string; label: string };
  not_applicable_rationale?: string;
}

// Evidence reference as it appears in the consolidated index. The structure
// is intentionally narrow — it is an addressable handle, not the full
// evidence document. Renderers display the handle and link out.
export interface EvidenceReference {
  ref_id: string;
  cited_by: string[]; // criterion_ids that reference this evidence
}

// Human-readable labels per criterion_id. Source of truth lives here so the
// contract is self-describing; renderers don't need to re-derive labels from
// the criterion library at render time.
const CRITERION_LABELS: Record<string, string> = {
  sfdr_v1_e_s_characteristics_promotion:
    "Promotion of environmental and social characteristics",
  sfdr_v1_good_governance_attestation: "Good-governance attestation",
  sfdr_v1_pai_consideration_policy: "Principal adverse impact consideration policy",
  sfdr_v1_dnsh_assessment: "Do-no-significant-harm assessment",
  sfdr_v1_pre_contractual_disclosure: "Pre-contractual Annex II disclosure",
  sfdr_v1_taxonomy_alignment_disclosure: "EU Taxonomy alignment disclosure",
  sfdr_v1_periodic_reporting_commitment: "Periodic reporting commitment",
  sfdr_v1_si_objective_qualification: "Sustainable-investment objective qualification",
  sfdr_v1_si_eligibility_evidence_pack: "SI-eligibility evidence pack",
  sfdr_v1_project_pai_data_provision: "Project PAI data provision",
};

const ART8_FRAMEWORK_ID = "sfdr_v1_article_8";
const ART9_FRAMEWORK_ID = "sfdr_v1_article_9";

export interface BuildRenderContractOptions {
  // ISO timestamp override (for deterministic tests / replay). Defaults to
  // run.run_timestamp, which is already deterministic via EngineDeps.now().
  generated_at?: string;
  // Project metadata override. When omitted, fields are derived from
  // run.project_input (project_id → project_id, jurisdiction → jurisdiction,
  // project_name defaults to project_id, target_label inferred from which
  // SFDR frameworks were assessed).
  project?: Partial<ProjectMetadata>;
}

export function buildRenderContract(
  run: EngineRun,
  opts: BuildRenderContractOptions = {},
): RenderContract {
  const sfdrResults = filterSFDRFrameworkResults(run.framework_results);
  const framework_findings: FrameworkFinding[] = [];

  const art8 = sfdrResults.get(ART8_FRAMEWORK_ID);
  if (art8) framework_findings.push(toFrameworkFinding("sfdr_art8", art8));

  const art9 = sfdrResults.get(ART9_FRAMEWORK_ID);
  if (art9) framework_findings.push(toFrameworkFinding("sfdr_art9", art9));

  const project = resolveProjectMetadata(run, opts.project, art8, art9);
  const evidence_index = buildEvidenceIndex(framework_findings);
  const pai_data_file = buildPAIDataFile(run);

  return {
    schema_version: "1.0.0",
    methodology_version: METHODOLOGY_VERSION,
    generated_at: opts.generated_at ?? run.run_timestamp,
    project,
    framework_findings,
    pai_data_file,
    evidence_index,
    overall_verdict: "calibration_pending",
  };
}

function filterSFDRFrameworkResults(
  results: FrameworkResult[],
): Map<string, FrameworkResult> {
  const out = new Map<string, FrameworkResult>();
  for (const fr of results) {
    if (fr.archetype !== "product_label") continue;
    if (fr.framework !== "SFDR") continue;
    out.set(fr.activity_id, fr);
  }
  return out;
}

function toFrameworkFinding(
  framework: "sfdr_art8" | "sfdr_art9",
  fr: FrameworkResult,
): FrameworkFinding {
  return {
    framework,
    criteria: fr.sc_results.map(toCriterionVerdict),
  };
}

function toCriterionVerdict(cr: CriterionResult): CriterionVerdict {
  const out: CriterionVerdict = {
    criterion_id: cr.criterion_id,
    criterion_label: CRITERION_LABELS[cr.criterion_id] ?? cr.criterion_id,
    verdict: narrowVerdict(cr.verdict),
    band_rationale: cr.rationale_text ?? cr.gap_summary ?? "",
    evidence_refs: cr.evidence_refs ?? [],
    inputs_used: {},
  };
  if (cr.numeric_value !== undefined) out.numeric_value = cr.numeric_value;
  if (cr.not_applicable_rationale !== undefined) {
    out.not_applicable_rationale = cr.not_applicable_rationale;
  }
  return out;
}

// Map the broader CriterionResult.verdict union down to the contract's
// criterion-level band set. Activity-aligned verdicts (pass/partial/fail/
// data_missing) should not appear here because filterSFDRFrameworkResults
// only retains product_label SFDR results; defensive fallback to
// insufficient_evidence preserves the contract's invariant if a future
// framework slips through.
function narrowVerdict(v: string): CriterionContractVerdict {
  switch (v) {
    case "aligned":
    case "partially_aligned":
    case "not_aligned":
    case "not_applicable":
    case "insufficient_evidence":
      return v;
    default:
      return "insufficient_evidence";
  }
}

function buildEvidenceIndex(findings: FrameworkFinding[]): EvidenceReference[] {
  const byRef = new Map<string, Set<string>>();
  for (const f of findings) {
    for (const c of f.criteria) {
      for (const ref of c.evidence_refs) {
        if (!byRef.has(ref)) byRef.set(ref, new Set());
        byRef.get(ref)!.add(c.criterion_id);
      }
    }
  }
  return [...byRef.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ref_id, citedBy]) => ({
      ref_id,
      cited_by: [...citedBy].sort(),
    }));
}

function resolveProjectMetadata(
  run: EngineRun,
  override: Partial<ProjectMetadata> | undefined,
  art8: FrameworkResult | undefined,
  art9: FrameworkResult | undefined,
): ProjectMetadata {
  const inferred_target_label: SupportedRenderLabel =
    art8 && art9
      ? "sfdr_v1_article_8_and_9"
      : art9
        ? "sfdr_v1_article_9"
        : "sfdr_v1_article_8";
  return {
    project_id: override?.project_id ?? run.project_input.project_id,
    project_name: override?.project_name ?? run.project_input.project_id,
    jurisdiction: override?.jurisdiction ?? run.project_input.jurisdiction,
    target_label: override?.target_label ?? inferred_target_label,
  };
}
