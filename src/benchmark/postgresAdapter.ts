// ============================================================================
// Postgres storage adapter — append-only (Engine v4.0 — Task 3)
// ============================================================================
//
// One implementation of the StorageAdapter seam, targeting Vercel Postgres
// (Supabase works unchanged — both are Postgres over the same wire protocol).
//
// NO NEW DEPENDENCY. The engine stays dependency-light and browser-safe, so
// this adapter is written against a minimal `SqlClient` interface rather than
// importing `pg` or `@vercel/postgres`. The host supplies the client:
//
//   import { sql } from "@vercel/postgres";
//   new PostgresStorageAdapter({ query: (t, v) => sql.query(t, v) });
//
// APPEND-ONLY is enforced in two places, deliberately:
//   1. Here — the adapter only ever issues INSERT. There is no update or
//      delete method to call.
//   2. In the database — the migration REVOKEs UPDATE/DELETE from the
//      application role. See infra/benchmark/001_benchmark_records.sql.
// Application-layer discipline alone is not append-only; the grant is what
// makes it true.
// ============================================================================

import type { BenchmarkRecord, StorageAdapter } from "./types";

/**
 * Minimal Postgres client surface. Structurally satisfied by `@vercel/postgres`
 * (`sql.query`), `pg` (`Pool.query`), and Supabase's postgres client.
 */
export interface SqlClient {
  query(text: string, values: unknown[]): Promise<unknown>;
}

export const BENCHMARK_TABLE = "benchmark_records";

/**
 * INSERT statement. Columns mirror BenchmarkRecord's top-level shape, with the
 * anonymised metrics + lens headlines held as JSONB so the schema does not have
 * to change every time the canonical model gains a field.
 *
 * ON CONFLICT DO NOTHING makes emission idempotent: re-running the same
 * assessment on the same day does not create a duplicate row, and a retry after
 * a network blip cannot double-write. The uniqueness key is
 * (asset_hash, assessment_date, config_version) — see the migration.
 */
const INSERT_SQL = `
INSERT INTO ${BENCHMARK_TABLE} (
  schema_version, asset_hash, region, asset_stage, assessment_date,
  engine_version, config_version, metrics, lens_headlines
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
ON CONFLICT (asset_hash, assessment_date, config_version) DO NOTHING
`.trim();

export interface PostgresStorageAdapterOptions {
  /** Table name override. Defaults to `benchmark_records`. */
  table?: string;
}

export class PostgresStorageAdapter implements StorageAdapter {
  readonly name = "vercel_postgres";
  private readonly statement: string;

  constructor(
    private readonly client: SqlClient,
    opts: PostgresStorageAdapterOptions = {},
  ) {
    this.statement = opts.table
      ? INSERT_SQL.replace(BENCHMARK_TABLE, opts.table)
      : INSERT_SQL;
  }

  async append(record: BenchmarkRecord): Promise<void> {
    await this.client.query(this.statement, [
      record.schemaVersion,
      record.assetHash,
      record.region,
      record.assetStage,
      record.assessmentDate,
      record.engineVersion,
      record.configVersion,
      JSON.stringify(record.metrics),
      JSON.stringify(record.lensHeadlines),
    ]);
  }
}
