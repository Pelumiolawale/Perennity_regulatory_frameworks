// ============================================================================
// Legacy compatibility adapter (Engine v4.0 — Module 8)
// ============================================================================
//
// Maps a lens LensVerdict (+ canonical data) back to the v3.5 FrameworkResult
// shape the SPA consumes today. The package's DEFAULT entrypoint continues to
// return the v3.5 shape unchanged (the existing DeterministicEngine is
// untouched); this adapter is the bridge that lets a v4 lens ALSO be projected
// into that shape, so a future SPA migration can swap its data source without a
// contract change. A structural snapshot test (legacy/__tests__) deep-equals
// the key structure against a real current SFDR FrameworkResult.
// ============================================================================

import type {
  CriterionResult,
  Framework,
  FrameworkResult,
  Verdict,
} from "../engine";
import type { CanonicalAssessment } from "../core/canonical";
import type { LensVerdict, SectionStatus, VerdictBand } from "../lens/types";

export interface LegacyAdapterOptions {
  /** Framework enum to stamp (default "SFDR" for the EU lens). */
  framework?: Framework;
  /** activity_id / framework id to stamp (default the lens id). */
  activityId?: string;
  frameworkVersion?: string;
  frameworkSourceHash?: string;
}

/**
 * Project a lens verdict into a v3.5-shaped FrameworkResult (product_label
 * archetype). One sc_result per lens section; the headline maps to
 * overall_verdict. Deliberately mirrors the existing SFDR product_label
 * FrameworkResult so downstream renderers / renderContract consume it unchanged.
 */
export function lensVerdictToFrameworkResult(
  verdict: LensVerdict,
  _canonical: CanonicalAssessment,
  opts: LegacyAdapterOptions = {},
): FrameworkResult {
  const sc_results: CriterionResult[] = verdict.sections.map((s) =>
    toCriterionResult(s, verdict.lensId),
  );
  return {
    framework: opts.framework ?? "SFDR",
    framework_version: opts.frameworkVersion ?? verdict.lensVersion,
    framework_source_hash: opts.frameworkSourceHash ?? "sha256:lens-derived",
    activity_id: opts.activityId ?? verdict.lensId,
    sc_results,
    dnsh_results: [],
    safeguards_results: [],
    methodology_results: [],
    minimum_safeguards_verdict: "not_applicable",
    overall_verdict: headlineToVerdict(verdict.headline),
    indicative_score: 0,
    archetype: "product_label",
  };
}

function toCriterionResult(
  s: LensVerdict["sections"][number],
  lensId: string,
): CriterionResult {
  return {
    criterion_id: `${lensId}.${s.id}`,
    verdict: sectionStatusToVerdict(s.status),
    gap_summary: s.summary,
    evidence_refs: [],
    scoring_logic_ref: `${lensId}.${s.id}.v4`,
    scoring_logic_version: "v4",
    rationale_text: s.summary,
    applies_under: lensId,
  };
}

function sectionStatusToVerdict(status: SectionStatus): Verdict {
  switch (status) {
    case "pass":
      return "aligned";
    case "partial":
      return "partially_aligned";
    case "fail":
      return "not_aligned";
    case "not_applicable":
      return "not_applicable";
    case "informational":
      return "insufficient_evidence";
  }
}

function headlineToVerdict(headline: VerdictBand): Verdict {
  switch (headline) {
    case "qualifies":
      return "aligned";
    case "qualifies_with_conditions":
      return "partially_aligned";
    case "not_a_fit":
      return "not_aligned";
    case "not_scored":
      return "insufficient_evidence";
  }
}
