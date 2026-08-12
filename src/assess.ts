// ============================================================================
// assess() — v4 top-level orchestration (Engine v4.0 — Module 8)
// ============================================================================
//
// Flow (Engine v4.0 spec):
//   MetricsCore.normalise -> CanonicalAssessment
//     -> {EULens, UKSDRLens, USSocialLicenseLens[stub]} -> LensVerdict[]
//     -> legacy adapter (v3.5-shaped projection)
//   Every normalise() run ALSO emits a BenchmarkRecord -> StorageAdapter.
//
// The EU Taxonomy alignment % is REUSED from the existing DeterministicEngine
// (BUNDLED_ACTIVITIES / EU Tax 8.1 indicative_score) — normalisation happens
// once, here, and the lenses stay pure over canonical. The reuse is optional
// (skip via opts.reuseTaxonomyEngine=false or supply opts.alignmentScorePercent
// directly) so assess() has no hard dependency on a full engine run for callers
// that already have the score.
// ============================================================================

import { DeterministicEngine } from "./runtime";
// Import the EU Tax 8.1 KB JSON directly (mirrors how src/index.ts builds
// BUNDLED_ACTIVITIES) to avoid a barrel import cycle: src/index.ts re-exports
// the v4 surface, which reaches assess.ts.
import eu_tax_climate_8_1 from "../regulatory-knowledge/frameworks/eu_taxonomy_climate/eu_tax_climate_8_1.json";
import type { Activity, ProjectInput } from "./engine";
import type { RunInput } from "./inputs";
import { normalise, type NormaliseSource } from "./core/metricsCore";
import type { CanonicalAssessment } from "./core/canonical";
import {
  defaultConfig,
  type RegulatoryConfig,
} from "./config/thresholds";
import { createDefaultLensRegistry } from "./lens/defaults";
import type { LensVerdict } from "./lens/types";
import type { LensRunError } from "./lens/registry";
import { lensVerdictToFrameworkResult } from "./legacy/adapter";
import type { FrameworkResult } from "./engine";
import { buildBenchmarkRecord } from "./benchmark/anonymise";
import { emitBenchmark, type EmitResult } from "./benchmark/emit";
import type { BenchmarkRecord, StorageAdapter } from "./benchmark/types";
import { ENGINE_V4_VERSION } from "./v4/meta";

export interface AssessOptions {
  config?: RegulatoryConfig;
  /** Reuse the existing EU Taxonomy 8.1 engine to derive the alignment %. Default true. */
  reuseTaxonomyEngine?: boolean;
  /** Directly supply the alignment % (overrides the engine reuse). */
  alignmentScorePercent?: number | null;
  /** Storage adapter for the benchmark residue. When omitted, no record is stored (still built). */
  storageAdapter?: StorageAdapter;
  /** Salt for the anonymised asset-id hash. */
  benchmarkSalt?: string;
  /** ISO assessment date. Defaults to the project's intake_timestamp (deterministic). */
  assessmentDate?: string;
  /** Restrict which lenses to run (by id). */
  onlyLenses?: string[];
}

export interface AssessmentResult {
  canonical: CanonicalAssessment;
  verdicts: LensVerdict[];
  lensErrors: LensRunError[];
  /** v3.5-shaped projection of each lens verdict (legacy compatibility). */
  legacyFrameworkResults: FrameworkResult[];
  benchmarkRecord: BenchmarkRecord;
  benchmarkEmit?: EmitResult;
  engineVersion: string;
  configVersion: string;
}

function projectOf(input: NormaliseSource): ProjectInput {
  return "project" in input && !("project_id" in input)
    ? (input as RunInput).project
    : (input as ProjectInput);
}

export async function assess(
  input: NormaliseSource,
  opts: AssessOptions = {},
): Promise<AssessmentResult> {
  const config = opts.config ?? defaultConfig();
  const project = projectOf(input);

  // 1. Reuse the existing EU Taxonomy 8.1 computation for the alignment %.
  let alignmentScorePercent: number | null;
  if (opts.alignmentScorePercent !== undefined) {
    alignmentScorePercent = opts.alignmentScorePercent;
  } else if (opts.reuseTaxonomyEngine === false) {
    alignmentScorePercent = null;
  } else {
    alignmentScorePercent = await deriveTaxonomyAlignment(project);
  }

  // 2. Normalise ONCE.
  const canonical = normalise(input, { alignmentScorePercent });

  // 3. Run the lenses (failure-isolated — the US stub surfaces as an error).
  const registry = createDefaultLensRegistry(config);
  const { verdicts, errors } = registry.evaluateAll(canonical, { only: opts.onlyLenses });

  // 4. Legacy-shaped projection.
  const legacyFrameworkResults = verdicts.map((v) =>
    lensVerdictToFrameworkResult(v, canonical),
  );

  // 5. Emit the benchmark residue (non-blocking + failure-isolated).
  const assessmentDate = opts.assessmentDate ?? project.intake_timestamp;
  const benchmarkRecord = buildBenchmarkRecord(canonical, verdicts, {
    engineVersion: ENGINE_V4_VERSION,
    assessmentDate,
    salt: opts.benchmarkSalt,
  });
  let benchmarkEmit: EmitResult | undefined;
  if (opts.storageAdapter) {
    benchmarkEmit = await emitBenchmark(benchmarkRecord, opts.storageAdapter);
  }

  return {
    canonical,
    verdicts,
    lensErrors: errors,
    legacyFrameworkResults,
    benchmarkRecord,
    benchmarkEmit,
    engineVersion: ENGINE_V4_VERSION,
    configVersion: config.configVersion,
  };
}

// Reuse the existing engine to score EU Taxonomy 8.1 and take its indicative
// score (0–100) as the framework-neutral external-alignment %. Deterministic
// deps: indicative_score does not depend on the run id / timestamp.
async function deriveTaxonomyAlignment(project: ProjectInput): Promise<number | null> {
  try {
    const engine = new DeterministicEngine({
      engine_commit_sha: "v4-reuse",
      knowledge_base_hash: "v4-reuse",
      methodology_version: "v3.5",
      now: () => "1970-01-01T00:00:00.000Z",
      generateId: () => "v4-reuse",
    });
    const activities: Activity[] = [eu_tax_climate_8_1 as unknown as Activity];
    const run = await engine.run(project, activities);
    const euTax = run.framework_results.find(
      (fr) => fr.activity_id === "eu_tax_climate_8_1",
    );
    return euTax ? euTax.indicative_score : null;
  } catch {
    // Reuse is best-effort; if the legacy engine can't score this input, fall
    // back to null (the EU lens treats a null alignment score as a gap).
    return null;
  }
}
