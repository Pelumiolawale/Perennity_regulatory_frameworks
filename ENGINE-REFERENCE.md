# Engine Reference

Operational reference for `@perennity/engine`. Companion to `CLAUDE.md` (which
records how the engine got here) and `methodology.md` (which records what it
measures). This file records **how to run and operate it**.

---

## Benchmark records datastore

*Added Engine v4.0, Task 3. Decision 3: benchmark records are collected from day
one, in a separate datastore.*

Every assessment emits one anonymised benchmark record. Over time these compound
into Perennity's proprietary cross-portfolio benchmark dataset — the thing that
cannot be rebuilt retrospectively, which is why collection starts now rather
than when it is needed.

### The one rule

**The hashing salt lives only in a Vercel environment variable.** Not in the
repo. Not in `config/regulatory-thresholds.*.json`. Not in a log. If the salt is
absent, the engine **skips emission and logs a warning** — it never writes
weakly-hashed data. A skipped row is recoverable; a reversible hash is not.

| | |
|---|---|
| Env var | `PERENNITY_BENCHMARK_SALT` |
| Minimum length | 16 characters (shorter is rejected as too weak) |
| Set where | Vercel project env vars — **by a human, never by an agent** |
| Rotation | Rotating the salt breaks longitudinal linking to prior rows by design. Rotate only deliberately; append a note to the decision log when you do. |

### Where the salt lives — and why the write path is server-side

The SPA runs the engine **in the browser**. Anything the browser can read is
public, so the salt can never be resolved client-side — it would be in the
bundle. Therefore:

```
browser (SPA)                    serverless function            Postgres
─────────────                    ───────────────────            ────────
runs engine, builds       ──►    resolves salt from env   ──►   INSERT
canonical + verdicts             hashes asset id                (append-only)
                                 builds BenchmarkRecord
```

Raw identity transits to our own serverless function and is hashed in-process.
It is never persisted, never logged, and never sent anywhere else.

### Table schema

Migration: `infra/benchmark/001_benchmark_records.sql`. Target Vercel Postgres;
Supabase works unchanged.

| Column | Type | Notes |
|---|---|---|
| `id` | `BIGINT` identity | Surrogate PK. Append-only, so monotonic. |
| `schema_version` | `TEXT` | Record shape version. Currently `1.0.0`. |
| `asset_hash` | `TEXT` | Salted one-way SHA-256, prefixed `bh1:`. **The only identity in the table.** |
| `region` | `TEXT` | Coarse region enum only (e.g. `MENA`, `UK-EU`). |
| `asset_stage` | `TEXT` | e.g. `design`, `operational`. |
| `assessment_date` | `TIMESTAMPTZ` | When the assessment happened. Engine-supplied, deterministic. |
| `engine_version` | `TEXT` | e.g. `4.0.0-alpha.1`. |
| `config_version` | `TEXT` | Which threshold config produced the verdicts. |
| `metrics` | `JSONB` | Anonymised canonical metrics. |
| `lens_headlines` | `JSONB` | Per-lens headline verdict + confidence. |
| `inserted_at` | `TIMESTAMPTZ` | When we recorded it. Distinct from `assessment_date`. |

**Uniqueness:** `(asset_hash, assessment_date, config_version)`. The adapter's
`INSERT ... ON CONFLICT DO NOTHING` pairs with this, so retries and refreshes
cannot double-write.

**Append-only** is enforced in three places, deliberately redundant:
1. The adapter only ever issues `INSERT` — there is no update or delete method.
2. The migration `REVOKE`s `UPDATE`/`DELETE` from the app role.
3. A `BEFORE UPDATE OR DELETE` trigger raises an exception regardless of grants.

Corrections are made by appending a new row, never by mutating history.

### What is deliberately NOT in a record

Removed upstream by the anonymiser, and must never be added back:

- **`assetId`** — replaced by the salted hash.
- **`context.hostJurisdiction`** — too precise; only the coarse region survives.
- **`carbon.embodiedCarbonMethodology`** — free text, so a leak vector.
- Any company name, contact detail, or free-text narrative.

Guarded by tests that plant a secret company string in both the asset id and the
free-text field and assert neither appears anywhere in the serialised record
(`src/benchmark/__tests__/`).

### Emission behaviour

On by default since Task 3. Two conditions must **both** hold to write:

1. A salt resolved (env var, or an explicit option for tests), **and**
2. A storage adapter is available.

Either missing → skip, warn, carry on. A storage failure is caught and isolated:
**benchmark problems never break an assessment.**

```ts
import { assess, PostgresStorageAdapter } from "@perennity/engine/v4";
import { sql } from "@vercel/postgres";

const result = await assess(input, {
  storageAdapter: new PostgresStorageAdapter({ query: (t, v) => sql.query(t, v) }),
  // salt is read from PERENNITY_BENCHMARK_SALT — never passed from a browser
});

result.benchmarkEmit?.emitted;   // true when a row was written
result.benchmarkSaltSource;      // "env" | "explicit" | "none"
```

`benchmarkSaltSource: "none"` means no usable salt was found, the returned
record was built with a non-secret default for in-memory shape compatibility
**only**, and nothing was written. **Never persist a `"none"` record** — its
hash is not identity-safe.

Opt a single run out with `benchmarkEnabled: false` (dry runs, replays).

### The engine takes no database dependency

`PostgresStorageAdapter` is written against a minimal `SqlClient` interface
(`query(text, values)`) rather than importing `pg` or `@vercel/postgres`. The
host supplies the client. This keeps the engine dependency-light and keeps the
browser-safe import graph clean — the same reason `JsonlStorageAdapter` imports
`node:fs` lazily.

### What actually writes the rows

**Paid engagements only** (decided 15 Aug 2026). Anonymous free-tier snapshots do
NOT accrue records: capturing them would require a browser-reachable write
endpoint, and since this table is append-only, a public write path is an
unfixable pollution vector.

The writer is a nightly Vercel Cron sweep in the SPA repo —
`api/cron/benchmark-sync.js`. It lists active, letter-signed engagements from
Airtable, runs `assess()` over each, and appends one row per engagement. It is
closed by a `CRON_SECRET` bearer check, and closed *by default*: an unset secret
returns 503 rather than running open.

The sweep is safe to run over everything every night. The unique key is
`(asset_hash, assessment_date, config_version)` and `assessment_date` derives
from the engagement's stable intake timestamp, so re-processing is a no-op.

### Setup checklist

1. Provision Postgres on the `perennity-capital-readiness-platform` project
   (Vercel dashboard → Storage → Create Database → Neon). *(Human — billable.)*
   The integration creates `POSTGRES_URL` automatically.
2. Apply `infra/benchmark/001_benchmark_records.sql` via the Neon SQL editor.
3. Uncomment and run the `REVOKE`/`GRANT` lines with your actual app role
   (`SELECT current_user;`).
4. Set `PERENNITY_BENCHMARK_SALT` in Vercel env vars, Production, sensitive.
   *(Human — an agent must never handle the secret value.)* Generate with
   `openssl rand -base64 32`. ✅ *Done 15 Aug 2026.*
5. Set `CRON_SECRET` the same way. Vercel attaches it as a bearer token on cron
   invocations; without it the endpoint refuses every request.
6. Verify the endpoint is closed: `curl <url>/api/cron/benchmark-sync` → expect
   `401` (or `503` if step 5 is not yet done).
7. Verify a run: invoke with the bearer token, then
   `SELECT count(*), max(inserted_at) FROM benchmark_records;`
8. Verify idempotency: invoke twice, confirm the count does not change.
9. Verify append-only: `UPDATE benchmark_records SET region = 'X';` → expect an
   exception.

---

## Test suite

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v24.19.0/installation/bin:$PATH"
npm test         # 434 pass / 0 fail
npm run build    # tsc -> dist/
npm run typecheck
```

Runner is Node's built-in `node:test`, not Vitest.
