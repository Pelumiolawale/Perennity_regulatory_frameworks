// ============================================================================
// Benchmark residue layer — types (Engine v4.0 — Module 7)
// ============================================================================
//
// Every assess() run emits a BenchmarkRecord: an ANONYMISED snapshot of the
// canonical metrics + coarse region/stage + engine/config versions + the
// headline verdict per lens run. This is the longitudinal, cross-portfolio
// residue that compounds into PB's proprietary benchmark dataset.
//
// Anonymisation is structural: NO company name, NO contact data, NO free-text;
// region at COARSE enum only; a SALTED one-way hash of the asset identifier for
// dedup / longitudinal linking WITHOUT identity. See anonymise.ts.
// ============================================================================

import type {
  AssetStage,
  CanonicalAssessment,
  Region,
} from "../core/canonical";
import type { Confidence, VerdictBand } from "../lens/types";

/** Headline verdict of one lens run, retained on the benchmark record. */
export interface BenchmarkLensHeadline {
  lensId: string;
  headline: VerdictBand;
  headlineLabel: string;
  confidence: Confidence;
}

/**
 * The canonical metrics snapshot, with identifying fields removed:
 *   - `assetId` dropped (replaced by the record's salted `assetHash`)
 *   - `context.hostJurisdiction` dropped (too precise — region enum only)
 *   - `carbon.embodiedCarbonMethodology` free-text dropped
 * Everything else (numbers + coarse enums) is retained for analysis.
 */
export type AnonymisedMetrics = Omit<CanonicalAssessment, "assetId" | "context" | "carbon"> & {
  context: { assetStage: AssetStage; hostRegion: Region; facilityType: string | null };
  carbon: Omit<CanonicalAssessment["carbon"], "embodiedCarbonMethodology">;
};

export interface BenchmarkRecord {
  schemaVersion: "1.0.0";
  /** Salted one-way hash of the asset id. Enables dedup/longitudinal linking without identity. */
  assetHash: string;
  region: Region;
  assetStage: AssetStage;
  /** ISO assessment date (deterministic — passed in, never Date.now() inside). */
  assessmentDate: string;
  engineVersion: string;
  configVersion: string;
  metrics: AnonymisedMetrics;
  lensHeadlines: BenchmarkLensHeadline[];
}

/**
 * Pluggable storage for benchmark records. The v1 impl is append-only JSONL
 * (jsonlAdapter.ts). Airtable / DB adapters are future implementations of THIS
 * interface — design the seam, don't build them.
 */
export interface StorageAdapter {
  /** Append one record. May reject; emitBenchmark() isolates the failure. */
  append(record: BenchmarkRecord): Promise<void>;
  /** Human-readable name for logs. */
  readonly name: string;
}
