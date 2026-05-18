// ============================================================================
// labelIdToSupportedLabel — KB ↔ public namespace bridge (v0.5.0-alpha.1)
// ============================================================================
//
// The KB-internal `label_id` (on ProductLabelFramework JSON, Phase 0 test
// fixtures) and the public-facing `SupportedLabel` (consumed by the snapshot
// filter and the app's intake UI) are deliberately separate namespaces:
//
//   - `label_id` lives in the KB. Its purpose is hash stability: changing
//     a label_id changes the framework_source_hash for any framework that
//     references it. The KB therefore avoids version-stamping label_ids.
//
//   - `SupportedLabel` is the public-facing user-selectable label. It IS
//     version-stamped (v0.4.2 onward — `sfdr_v1_article_8` etc.) for
//     forward-compat with SFDR 2.0 (Commission proposal COM(2025) 841).
//
// This module is the bridge between the two. It is intentionally tiny — if
// it ever grows past a handful of mappings, that's a signal the namespace
// separation is leaking and we should revisit the architecture.
// ============================================================================

import type { SupportedLabel } from "./renderers/filterCells";

// Defensive: unknown label_ids return null so callers can decide how to
// surface the gap (commit 1.0 strict-on-unknown convention). The companion
// `labelIdToSupportedLabelWithWarning` returns a structured-warning shape
// for callers integrating with the EngineRun.warnings channel.
const LABEL_ID_TO_SUPPORTED: Record<string, SupportedLabel> = {
  // SFDR (v0.4.2 introduced the v1 suffix on SupportedLabel; the KB-side
  // label_id stays unversioned for hash stability).
  sfdr_article_8: "sfdr_v1_article_8",
  sfdr_article_9: "sfdr_v1_article_9",
  // EU Taxonomy 8.1 — KB label_id is the same string as the SupportedLabel
  // because there is no SFDR-2.0-style rewrite proposal forcing a version
  // stamp on this regime yet.
  eu_taxonomy_8_1: "eu_taxonomy_8_1",
  // UK SDR labels — KB label_id matches SupportedLabel for the same reason
  // (FCA PS23/16 is finalised; no rewrite proposal pending).
  uk_sdr_focus: "uk_sdr_focus",
  uk_sdr_improvers: "uk_sdr_improvers",
  uk_sdr_impact: "uk_sdr_impact",
  uk_sdr_mixed_goals: "uk_sdr_mixed_goals",
};

export function labelIdToSupportedLabel(label_id: string): SupportedLabel | null {
  return LABEL_ID_TO_SUPPORTED[label_id] ?? null;
}

export interface LabelMappingResult {
  label: SupportedLabel | null;
  warning?: string;
}

// Same mapping but returns a structured warning for unknowns, consistent with
// commit 1.0's filter warning channel and Phase 0's EngineRun.warnings shape.
export function labelIdToSupportedLabelWithWarning(label_id: string): LabelMappingResult {
  const label = LABEL_ID_TO_SUPPORTED[label_id];
  if (label !== undefined) return { label };
  return {
    label: null,
    warning: `labelIdToSupportedLabel: no SupportedLabel mapping for label_id="${label_id}". Known label_ids: ${Object.keys(
      LABEL_ID_TO_SUPPORTED,
    )
      .sort()
      .join(", ")}.`,
  };
}
