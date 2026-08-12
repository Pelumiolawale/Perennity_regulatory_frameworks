// ============================================================================
// Benchmark emission — non-blocking + failure-isolated (Engine v4.0 — Module 7)
// ============================================================================
//
// A storage failure must NEVER break an assessment. emitBenchmark() catches
// everything, logs, and resolves to a result object — it never rejects. Callers
// may await it (deterministic) or fire-and-forget it.
// ============================================================================

import type { BenchmarkRecord, StorageAdapter } from "./types";

export interface EmitResult {
  emitted: boolean;
  adapter: string;
  error?: string;
}

export interface EmitOptions {
  /** Sink for the failure log line. Defaults to console.warn. Injectable for tests. */
  logger?: (message: string) => void;
}

export async function emitBenchmark(
  record: BenchmarkRecord,
  adapter: StorageAdapter,
  opts: EmitOptions = {},
): Promise<EmitResult> {
  const log = opts.logger ?? ((m: string) => console.warn(m));
  try {
    await adapter.append(record);
    return { emitted: true, adapter: adapter.name };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(
      `[benchmark] emission failed via "${adapter.name}" (isolated — assessment unaffected): ${message}`,
    );
    return { emitted: false, adapter: adapter.name, error: message };
  }
}
