// ============================================================================
// Benchmark salt resolution — fail-safe (Engine v4.0 — Task 3)
// ============================================================================
//
// THE RULE: the hashing salt lives ONLY as an environment variable. It is never
// committed, never placed in config/regulatory-thresholds.*.json, and never
// shipped to a browser bundle.
//
// FAIL SAFE: when the env var is absent, emission is SKIPPED and a warning is
// logged. We never fall back to the module-level DEFAULT_SALT for a write —
// a non-secret salt would make asset hashes reversible by anyone who can guess
// an asset id, which is exactly the identity leak the benchmark store exists to
// avoid. Skipping a row is recoverable; writing a weakly-hashed row is not.
//
// WHY THIS FILE IS SERVER-ONLY: the SPA runs the engine in the browser. If the
// salt were resolvable client-side it would be in the bundle, i.e. public. The
// benchmark write path therefore runs in a serverless function, never in the
// browser. See ENGINE-REFERENCE.md § "Where the salt lives".
// ============================================================================

/** The one and only environment variable the salt may come from. */
export const BENCHMARK_SALT_ENV_VAR = "PERENNITY_BENCHMARK_SALT";

/**
 * Minimum acceptable salt length. A short salt is brute-forceable and would
 * defeat the purpose; we reject rather than silently accept a weak one.
 */
export const MIN_SALT_LENGTH = 16;

export type SaltSource = "explicit" | "env" | "none";

export interface SaltResolution {
  /** The salt to hash with, or null when none is usable (=> do not emit). */
  salt: string | null;
  source: SaltSource;
  /** Human-readable reason, present whenever `salt` is null. */
  reason?: string;
}

export interface ResolveSaltOptions {
  /** Caller-supplied salt (tests, or a host that manages its own secrets). */
  explicit?: string;
  /** Environment to read. Injectable so this stays pure and testable. */
  env?: Record<string, string | undefined>;
}

/**
 * Resolve the benchmark hashing salt.
 *
 * Precedence: explicit option > environment variable > none.
 * A `null` salt is not an error — it is the fail-safe signal meaning
 * "do not write anything".
 */
export function resolveBenchmarkSalt(opts: ResolveSaltOptions = {}): SaltResolution {
  const env = opts.env ?? (typeof process !== "undefined" ? process.env : {});

  if (opts.explicit !== undefined) {
    const trimmed = opts.explicit.trim();
    if (trimmed.length === 0) {
      return {
        salt: null,
        source: "none",
        reason: "explicit salt was supplied but is empty",
      };
    }
    return { salt: trimmed, source: "explicit" };
  }

  const raw = env[BENCHMARK_SALT_ENV_VAR];
  if (raw === undefined || raw.trim().length === 0) {
    return {
      salt: null,
      source: "none",
      reason:
        `${BENCHMARK_SALT_ENV_VAR} is not set — benchmark emission skipped ` +
        `(fail-safe: never write weakly-hashed data)`,
    };
  }

  const salt = raw.trim();
  if (salt.length < MIN_SALT_LENGTH) {
    return {
      salt: null,
      source: "none",
      reason:
        `${BENCHMARK_SALT_ENV_VAR} is set but shorter than ${MIN_SALT_LENGTH} ` +
        `characters — rejected as too weak; benchmark emission skipped`,
    };
  }

  return { salt, source: "env" };
}
