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

// Product-label set the contract recognises. EU Tax 8.1 is reflected via
// SFDR c6's cross-framework dep, not as a direct entry. ICMA GBP lands later.
// v0.6.1: UK SDR Focus / Improvers / Impact added — contract emits one
// finding per UK SDR framework scored in the same run.
export type SupportedRenderLabel =
  | "sfdr_v1_article_8"
  | "sfdr_v1_article_9"
  | "sfdr_v1_article_8_and_9"
  | "uk_sdr_focus"
  | "uk_sdr_improvers"
  | "uk_sdr_impact";

export interface FrameworkFinding {
  framework:
    | "sfdr_art8"
    | "sfdr_art9"
    | "uk_sdr_focus"
    | "uk_sdr_improvers"
    | "uk_sdr_impact";
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
  // v0.6.0 (E5 follow-up): framework id under which this verdict was
  // produced (e.g. "sfdr_v1_article_8" / "sfdr_v1_article_9"). Forwarded
  // from CriterionResult.applies_under. Consumers route label-aware
  // narrative rendering by branching on this field — see the SPA's
  // snapshotPhrases.js article9_defaults pattern.
  applies_under?: string;
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
  // SFDR Art 8 (7 criteria) + Art 9 (3 criteria)
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
  // UK SDR Sustainability Focus (4 criteria, v0.6.0)
  uk_sdr_v1_asset_sustainability_profile:
    "Asset sustainability profile (credible standard)",
  uk_sdr_v1_credible_sustainability_standard: "Credible standard recognition",
  uk_sdr_v1_sustainable_proportion_threshold:
    "Sustainable proportion (asset-level qualification)",
  uk_sdr_v1_asset_kpi_reporting: "Asset-level KPI reporting commitment",
  // UK SDR Sustainability Improvers (5 criteria, v0.6.0)
  uk_sdr_v1_baseline_sustainability_assessment: "Baseline sustainability assessment",
  uk_sdr_v1_improvement_strategy: "Improvement strategy with timeline",
  uk_sdr_v1_improvement_kpi_targets: "Quantified improvement KPI targets",
  uk_sdr_v1_progress_monitoring: "Progress monitoring + reporting commitment",
  uk_sdr_v1_improvement_proportion_threshold:
    "Improvement proportion (asset-level qualification)",
  // UK SDR Sustainability Impact (6 criteria, v0.6.0)
  uk_sdr_v1_impact_objective: "Defined impact objective",
  uk_sdr_v1_impact_measurement:
    "Impact measurement (theory of change + indicators)",
  uk_sdr_v1_impact_additionality: "Impact additionality evidence",
  uk_sdr_v1_impact_proportion_threshold:
    "Impact proportion (asset-level qualification)",
  uk_sdr_v1_impact_reporting: "Annual impact reporting commitment",
  uk_sdr_v1_no_significant_harm: "No-significant-harm screen (DNSH-equivalent)",
};

const ART8_FRAMEWORK_ID = "sfdr_v1_article_8";
const ART9_FRAMEWORK_ID = "sfdr_v1_article_9";
const UK_SDR_FOCUS_FRAMEWORK_ID = "uk_sdr_focus";
const UK_SDR_IMPROVERS_FRAMEWORK_ID = "uk_sdr_improvers";
const UK_SDR_IMPACT_FRAMEWORK_ID = "uk_sdr_impact";

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
  // v0.6.1: widened from SFDR-only to all product-label frameworks (SFDR
  // Art 8/9 + UK SDR Focus/Improvers/Impact). The filter retains every
  // product_label result; the per-framework-id lookups below pick up
  // whichever frameworks were actually scored in this run.
  const productLabelResults = filterProductLabelFrameworkResults(
    run.framework_results,
  );
  const framework_findings: FrameworkFinding[] = [];

  const art8 = productLabelResults.get(ART8_FRAMEWORK_ID);
  if (art8) framework_findings.push(toFrameworkFinding("sfdr_art8", art8));

  const art9 = productLabelResults.get(ART9_FRAMEWORK_ID);
  if (art9) framework_findings.push(toFrameworkFinding("sfdr_art9", art9));

  const ukSdrFocus = productLabelResults.get(UK_SDR_FOCUS_FRAMEWORK_ID);
  if (ukSdrFocus)
    framework_findings.push(toFrameworkFinding("uk_sdr_focus", ukSdrFocus));

  const ukSdrImprovers = productLabelResults.get(UK_SDR_IMPROVERS_FRAMEWORK_ID);
  if (ukSdrImprovers)
    framework_findings.push(toFrameworkFinding("uk_sdr_improvers", ukSdrImprovers));

  const ukSdrImpact = productLabelResults.get(UK_SDR_IMPACT_FRAMEWORK_ID);
  if (ukSdrImpact)
    framework_findings.push(toFrameworkFinding("uk_sdr_impact", ukSdrImpact));

  const project = resolveProjectMetadata(run, opts.project, {
    art8,
    art9,
    ukSdrFocus,
    ukSdrImprovers,
    ukSdrImpact,
  });
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

// v0.6.1: was filterSFDRFrameworkResults — widened to all product_label
// archetypes. SFDR (framework: "SFDR") and UK SDR (framework: "UK_SDR")
// both flow through. ICMA GBP (issuance_framework archetype) is still
// excluded — it has its own contract path planned for Phase 3.
function filterProductLabelFrameworkResults(
  results: FrameworkResult[],
): Map<string, FrameworkResult> {
  const out = new Map<string, FrameworkResult>();
  for (const fr of results) {
    if (fr.archetype !== "product_label") continue;
    if (fr.framework !== "SFDR" && fr.framework !== "UK_SDR") continue;
    out.set(fr.activity_id, fr);
  }
  return out;
}

function toFrameworkFinding(
  framework: FrameworkFinding["framework"],
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
  if (cr.applies_under !== undefined) out.applies_under = cr.applies_under;
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

interface ScoredFrameworks {
  art8: FrameworkResult | undefined;
  art9: FrameworkResult | undefined;
  ukSdrFocus: FrameworkResult | undefined;
  ukSdrImprovers: FrameworkResult | undefined;
  ukSdrImpact: FrameworkResult | undefined;
}

function resolveProjectMetadata(
  run: EngineRun,
  override: Partial<ProjectMetadata> | undefined,
  scored: ScoredFrameworks,
): ProjectMetadata {
  // Inference priority: a UK SDR result, if scored, drives the target_label
  // (UK SDR engagements always run with EU Tax 8.1 + one UK SDR framework
  // per the SPA's frameworksForLabel routing). SFDR results take over only
  // when no UK SDR framework was scored. Defaults to Art 8 when no
  // product-label framework was scored (degenerate case; preserves the
  // pre-v0.6.1 default).
  const inferred_target_label: SupportedRenderLabel = scored.ukSdrFocus
    ? "uk_sdr_focus"
    : scored.ukSdrImprovers
      ? "uk_sdr_improvers"
      : scored.ukSdrImpact
        ? "uk_sdr_impact"
        : scored.art8 && scored.art9
          ? "sfdr_v1_article_8_and_9"
          : scored.art9
            ? "sfdr_v1_article_9"
            : "sfdr_v1_article_8";
  return {
    project_id: override?.project_id ?? run.project_input.project_id,
    project_name: override?.project_name ?? run.project_input.project_id,
    jurisdiction: override?.jurisdiction ?? run.project_input.jurisdiction,
    target_label: override?.target_label ?? inferred_target_label,
  };
}
