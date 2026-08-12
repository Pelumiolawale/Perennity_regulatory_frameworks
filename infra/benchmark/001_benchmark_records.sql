-- ===========================================================================
-- Perennity Bridge — benchmark records store (Engine v4.0, Task 3)
-- Migration 001: create the append-only anonymised benchmark table.
--
-- Target: Vercel Postgres (Supabase works unchanged — same Postgres).
-- Run once, by a human, against the benchmark database. This file is
-- idempotent; re-running it is safe.
--
-- WHAT IS IN HERE: anonymised assessment residue only. No company name, no
-- contact data, no free text, no precise jurisdiction. Identity appears solely
-- as a salted one-way SHA-256 hash. See ENGINE-REFERENCE.md.
--
-- WHAT IS NOT IN HERE: the salt. The salt lives ONLY in the Vercel environment
-- variable PERENNITY_BENCHMARK_SALT. It is never committed, never stored in
-- this database, and never placed in a settings file. If the salt is lost, the
-- hashes cannot be re-derived — that is the intended property.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS benchmark_records (
    -- Surrogate key. Append-only, so this only ever increases.
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- Record schema version. Lets us evolve the shape without rewriting rows.
    schema_version  TEXT        NOT NULL,

    -- Salted one-way hash of the asset identifier, prefixed "bh1:".
    -- Enables dedup + longitudinal linking WITHOUT identity.
    asset_hash      TEXT        NOT NULL,

    -- Coarse region enum only. Precise host jurisdiction is deliberately
    -- dropped upstream by the anonymiser and must never be added here.
    region          TEXT        NOT NULL,
    asset_stage     TEXT        NOT NULL,

    -- ISO date of the assessment (engine-supplied, deterministic).
    assessment_date TIMESTAMPTZ NOT NULL,

    engine_version  TEXT        NOT NULL,
    config_version  TEXT        NOT NULL,

    -- Anonymised canonical metrics + per-lens headline verdicts.
    metrics         JSONB       NOT NULL,
    lens_headlines  JSONB       NOT NULL,

    -- Server-side insert time. Distinct from assessment_date: one is when the
    -- assessment happened, the other when we recorded it.
    inserted_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotent emission. A retry, a page refresh, or a re-run of the same
-- assessment on the same config version must not create a second row. The
-- adapter's INSERT ... ON CONFLICT DO NOTHING pairs with this constraint.
CREATE UNIQUE INDEX IF NOT EXISTS benchmark_records_dedup_idx
    ON benchmark_records (asset_hash, assessment_date, config_version);

-- Query paths we actually expect: cohort analysis by region/stage, and
-- longitudinal tracking of a single (hashed) asset over time.
CREATE INDEX IF NOT EXISTS benchmark_records_cohort_idx
    ON benchmark_records (region, asset_stage, assessment_date);
CREATE INDEX IF NOT EXISTS benchmark_records_asset_idx
    ON benchmark_records (asset_hash, assessment_date);

-- ===========================================================================
-- APPEND-ONLY ENFORCEMENT
--
-- Application-layer discipline is not append-only; the grant is. Replace
-- `perennity_app` with the role your Vercel Postgres connection actually uses
-- (check with: SELECT current_user;).
--
-- The app role may INSERT and SELECT. It may NOT UPDATE or DELETE. Corrections
-- are made by appending a new row, never by mutating history — the same
-- discipline the engine applies to methodology versions.
-- ===========================================================================

-- REVOKE ALL ON benchmark_records FROM perennity_app;
-- GRANT SELECT, INSERT ON benchmark_records TO perennity_app;

-- Belt-and-braces: block UPDATE/DELETE at the table level for every role
-- except the owner, so a mis-granted role still cannot rewrite history.
CREATE OR REPLACE FUNCTION benchmark_records_append_only()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION
        'benchmark_records is append-only: % is not permitted. Append a corrected row instead.',
        TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS benchmark_records_no_update ON benchmark_records;
CREATE TRIGGER benchmark_records_no_update
    BEFORE UPDATE OR DELETE ON benchmark_records
    FOR EACH ROW EXECUTE FUNCTION benchmark_records_append_only();

-- ===========================================================================
-- Verification (run after applying):
--
--   \d benchmark_records
--   SELECT count(*) FROM benchmark_records;              -- expect 0 initially
--   UPDATE benchmark_records SET region = 'X';           -- expect: exception
-- ===========================================================================
