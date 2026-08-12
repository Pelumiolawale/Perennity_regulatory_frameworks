// ============================================================================
// Benchmark anonymisation + record builder (Engine v4.0 — Module 7)
// ============================================================================

import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import type { CanonicalAssessment } from "../core/canonical";
import type { LensVerdict } from "../lens/types";
import type {
  AnonymisedMetrics,
  BenchmarkLensHeadline,
  BenchmarkRecord,
} from "./types";

/**
 * Default salt. A stable, non-secret salt still prevents trivial reversal of
 * short/known asset ids by anyone who only sees the JSONL; deployments should
 * override it with a private salt via BenchmarkOptions.salt so hashes cannot be
 * correlated across datasets by an outsider.
 */
const DEFAULT_SALT = "perennity-benchmark-v1";

export interface BenchmarkOptions {
  /** Private salt for the one-way asset-id hash. Override in production. */
  salt?: string;
  /** Engine version stamp (e.g. package version). */
  engineVersion: string;
  /** ISO assessment date. Passed in for determinism (never Date.now() here). */
  assessmentDate: string;
}

/** Salted one-way hash of an asset identifier. */
export function hashAssetId(assetId: string, salt: string = DEFAULT_SALT): string {
  const digest = bytesToHex(sha256(new TextEncoder().encode(`${salt}::${assetId}`)));
  return `bh1:${digest}`;
}

/** Strip identifying fields from the canonical snapshot. */
function anonymiseMetrics(c: CanonicalAssessment): AnonymisedMetrics {
  // Deep clone so we never mutate the caller's canonical, then rebuild the
  // record OMITTING identifying fields (assetId, precise jurisdiction, and the
  // free-text embodied-carbon methodology). Constructed explicitly rather than
  // via `delete` so the sanitised shape is exact and type-checked.
  const clone = structuredClone(c);
  const { embodiedCarbonMethodology: _dropMethodology, ...carbonRest } = clone.carbon;
  const { hostJurisdiction: _dropJurisdiction, ...contextRest } = clone.context;
  return {
    context: {
      assetStage: contextRest.assetStage,
      hostRegion: contextRest.hostRegion,
      facilityType: contextRest.facilityType,
    },
    energy: clone.energy,
    water: clone.water,
    carbon: carbonRest,
    communityLand: clone.communityLand,
    governance: clone.governance,
    derivedAlignmentScorePercent: clone.derivedAlignmentScorePercent,
  };
}

function toHeadline(v: LensVerdict): BenchmarkLensHeadline {
  return {
    lensId: v.lensId,
    headline: v.headline,
    headlineLabel: v.headlineLabel,
    confidence: v.confidence,
  };
}

/**
 * Build an anonymised BenchmarkRecord from a canonical assessment + the lens
 * verdicts produced for it. Pure + deterministic given its inputs.
 */
export function buildBenchmarkRecord(
  canonical: CanonicalAssessment,
  verdicts: LensVerdict[],
  opts: BenchmarkOptions,
): BenchmarkRecord {
  const configVersion = verdicts.find((v) => v.configVersion && v.configVersion !== "n/a")?.configVersion ?? "unknown";
  return {
    schemaVersion: "1.0.0",
    assetHash: hashAssetId(canonical.assetId, opts.salt),
    region: canonical.context.hostRegion,
    assetStage: canonical.context.assetStage,
    assessmentDate: opts.assessmentDate,
    engineVersion: opts.engineVersion,
    configVersion,
    metrics: anonymiseMetrics(canonical),
    lensHeadlines: verdicts.map(toHeadline),
  };
}
