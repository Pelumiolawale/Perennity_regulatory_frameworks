// ============================================================================
// FrameworkLens interface + verdict shape (Engine v4.0 — Module 2)
// ============================================================================
//
// A lens is an ADAPTER over the framework-agnostic CanonicalAssessment. Lenses
// are PURE functions of (CanonicalAssessment, config): no I/O, no shared
// mutable state. Config is injected at construction (captured, immutable), so
// the interface method stays `evaluate(a)` while purity holds over
// (canonical, captured-config).
//
// Trilogue-tracking product surface: any verdict that depends on a config
// entry marked `status: "contested"` MUST carry confidence "provisional" and a
// citation with `contested: true` noting trilogue status.
// ============================================================================

import type { CanonicalAssessment } from "../core/canonical";

/**
 * Shared verdict band across lenses. Kept deliberately small so EU (category
 * ladder) and UK SDR (label-fit matrix) map onto the same headline vocabulary:
 *   - qualifies                 — clears the strongest available fit now
 *   - qualifies_with_conditions — fits via a conditional/transition pathway
 *   - not_a_fit                 — no category/label fits
 *   - not_scored                — lens declined to score (e.g. stub)
 */
export type VerdictBand =
  | "qualifies"
  | "qualifies_with_conditions"
  | "not_a_fit"
  | "not_scored";

export type SectionStatus =
  | "pass"
  | "partial"
  | "fail"
  | "not_applicable"
  | "informational";

export type Confidence = "settled" | "provisional";

export type GapSeverity = "critical" | "material" | "minor";

export interface Citation {
  /** Regulatory instrument or standard (e.g. "SFDR 2.0 proposal COM(2025) 841"). */
  source: string;
  /** Specific locus (article, paragraph, config ref). */
  reference: string;
  note?: string;
  /**
   * True when this citation anchors to a contested (trilogue-live) config
   * item. Presence of any contested citation forces confidence "provisional".
   */
  contested?: boolean;
}

export interface EvidenceGap {
  id: string;
  /** Free-form grouping label (e.g. "transition_pathway", "pai:pai_8_water"). */
  category: string;
  description: string;
  severity: GapSeverity;
  remediation: string;
}

export interface VerdictSection {
  id: string;
  title: string;
  status: SectionStatus;
  summary: string;
  details?: string[];
}

export interface LensVerdict {
  lensId: string;
  lensVersion: string;
  configVersion: string;
  headline: VerdictBand;
  /** Human-readable headline label (lens-specific, e.g. "Transition-fundable"). */
  headlineLabel: string;
  sections: VerdictSection[];
  evidenceGaps: EvidenceGap[];
  citations: Citation[];
  confidence: Confidence;
  /**
   * Fund-manager-facing notes. Where a lens computes a fund/portfolio-level
   * figure (e.g. the SFDR 2.0 70% test), it is surfaced HERE as a note —
   * never as a pass/fail on the asset. Keeps the asset-level vs fund-level
   * distinction explicit at the output boundary.
   */
  fundManagerNotes: string[];
}

export interface FrameworkLens {
  id: string;
  version: string;
  configVersion: string;
  evaluate(a: CanonicalAssessment): LensVerdict;
}

/**
 * Derive overall confidence from citations: provisional if ANY cited config
 * item is contested, else settled. Centralised so every lens propagates
 * trilogue status the same way.
 */
export function deriveConfidence(citations: Citation[]): Confidence {
  return citations.some((c) => c.contested === true) ? "provisional" : "settled";
}
