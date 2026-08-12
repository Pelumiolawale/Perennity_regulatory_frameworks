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
import { resolveBenchmarkSalt, type SaltSource } from "./benchmark/salt";
import { ENGINE_V4_VERSION } from "./v4/meta";

export interface AssessOptions {
  config?: RegulatoryConfig;
  /** Reuse the existing EU Taxonomy 8.1 engine to derive the alignment %. Default true. */
  reuseTaxonomyEngine?: boolean;
  /** Directly supply the alignment % (overrides the engine reuse). */
  alignmentScorePercent?: number | null;
  /** Storage adapter for the benchmark residue. When omitted, no record is stored (still built). */
  storageAdapter?: StorageAdapter;
  /**
   * Salt for the anonymised asset-id hash. In production this is left unset and
   * resolved from the PERENNITY_BENCHMARK_SALT environment variable instead —
   * the salt must never be passed in from a browser context. See salt.ts.
   */
  benchmarkSalt?: string;
  /**
   * Benchmark emission is ON BY DEFAULT (Task 3). Set false to opt out for a
   * single run — e.g. a dry-run or a replay that must not accrue residue.
   */
  benchmarkEnabled?: boolean;
  /** Environment to resolve the salt from. Injectable for tests. */
  env?: Record<string, string | undefined>;
  /** Sink for benchmark warnings. Defaults to console.warn. Injectable for tests. */
  benchmarkLogger?: (message: string) => void;
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
  /**
   * Where the hashing salt came from. `"none"` means NO usable salt was found,
   * the record was built with the non-secret default for in-memory shape
   * compatibility ONLY, and emission was skipped. A `"none"` record must never
   * be persisted by a caller — its hash is not identity-safe.
   */
  benchmarkSaltSource: SaltSource;
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

  // 5. Emit the benchmark residue — ON BY DEFAULT (Task 3), non-blocking and
  //    failure-isolated. Two independent conditions must BOTH hold to write:
  //      (a) a usable salt resolved (explicit option, or the env var), and
  //      (b) a storage adapter is available.
  //    Either missing => skip + warn. We never write weakly-hashed data, and a
  //    missing sink is not an error the assessment should care about.
  const assessmentDate = opts.assessmentDate ?? project.intake_timestamp;
  const log = opts.benchmarkLogger ?? ((m: string) => console.warn(m));
  const enabled = opts.benchmarkEnabled !== false;

  const saltResolution = resolveBenchmarkSalt({
    explicit: opts.benchmarkSalt,
    env: opts.env,
  });

  const benchmarkRecord = buildBenchmarkRecord(canonical, verdicts, {
    engineVersion: ENGINE_V4_VERSION,
    assessmentDate,
    // null salt => buildBenchmarkRecord uses its non-secret default. The record
    // is still returned for in-memory use, but the guard below refuses to emit
    // it. benchmarkSaltSource on the result makes that state auditable.
    salt: saltResolution.salt ?? undefined,
  });

  let benchmarkEmit: EmitResult | undefined;
  if (!enabled) {
    benchmarkEmit = {
      emitted: false,
      adapter: "none",
      error: "benchmark emission disabled for this run (benchmarkEnabled:false)",
    };
  } else if (saltResolution.salt === null) {
    // FAIL SAFE. This is the load-bearing branch: no salt => no write, ever.
    const reason = saltResolution.reason ?? "no benchmark salt available";
    log(`[benchmark] ${reason}`);
    benchmarkEmit = { emitted: false, adapter: "none", error: reason };
  } else if (!opts.storageAdapter) {
    const reason =
      "benchmark salt resolved but no storage adapter supplied — record built, not stored";
    log(`[benchmark] ${reason}`);
    benchmarkEmit = { emitted: false, adapter: "none", error: reason };
  } else {
    benchmarkEmit = await emitBenchmark(benchmarkRecord, opts.storageAdapter, {
      logger: log,
    });
  }

  return {
    canonical,
    verdicts,
    lensErrors: errors,
    legacyFrameworkResults,
    benchmarkRecord,
    benchmarkEmit,
    benchmarkSaltSource: saltResolution.source,
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
