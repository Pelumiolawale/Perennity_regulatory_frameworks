// ============================================================================
// v4 provenance + trilogue-tracking metadata (Engine v4.0 — Module 8)
// ============================================================================

import {
  contestedItems,
  defaultConfig,
  type RegulatoryConfig,
} from "../config/thresholds";

/** Engine package version for the v4 lens architecture. */
export const ENGINE_V4_VERSION = "4.0.0-alpha.1";

/**
 * Methodology status for the v4 lens layer. Deliberately "4.0-draft" (NOT the
 * v3.5 constant): the SFDR 2.0 regime the EU lens models is proposal-stage,
 * trilogue-live. The v3.5 METHODOLOGY_VERSION constant is untouched — the
 * legacy default entrypoint still stamps v3.5.
 */
export const V4_METHODOLOGY_STATUS = "4.0-draft";

export interface TrilogueTracking {
  engineVersion: string;
  methodologyVersion: string;
  configVersion: string;
  contestedItems: { key: string; kind: string; notes: string }[];
}

/**
 * Build the TRILOGUE_TRACKING metadata from LIVE config (not hardcoded), so the
 * SPA can surface trilogue-tracking status. The contested-items list is derived
 * from config.*.status === "contested" — bumping config changes this output.
 */
export function buildTrilogueTracking(
  config: RegulatoryConfig = defaultConfig(),
): TrilogueTracking {
  return {
    engineVersion: ENGINE_V4_VERSION,
    methodologyVersion: V4_METHODOLOGY_STATUS,
    configVersion: config.configVersion,
    contestedItems: contestedItems(config).map((c) => ({
      key: c.key,
      kind: c.kind,
      notes: c.notes,
    })),
  };
}

/** Convenience: TRILOGUE_TRACKING derived from the bundled v1 config. */
export const TRILOGUE_TRACKING: TrilogueTracking = buildTrilogueTracking();
