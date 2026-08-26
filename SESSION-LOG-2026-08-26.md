# Session Log — Engine v4.0 Integration Sprint

**Period:** 12–26 August 2026
**Status at close:** Engine v4.0 live in production. Benchmark collection running nightly.
**Read this before touching the engine, the SPA, or the benchmark pipeline.**

---

## 1. Read this first — the state in one screen

| | |
|---|---|
| Engine `main` | `0db1893` · v4.0.0-alpha.1 · **442 tests** · unpublished, `private: true` |
| SPA `main` | `3353a08` · **203 tests** · live at `app.perennitybridge.com` |
| SPA engine pin | `#6fcf87a` — one docs-only commit behind engine main. **Deliberate. Do not bump for nothing.** |
| Tag | `v4.0.0-alpha.1` (pre-release, pushed, **never published to npm**) |
| Benchmark cron | `/api/cron/benchmark-sync`, nightly 03:00 UTC |
| Rows at close | 16 (15 engagements + 1 leftover setup test row) |

All feature branches are merged. Nothing is unmerged in either repo.

**What a customer sees: no change.** That is the entire point of the adapter
design. v4 runs alongside the shipping path, not in place of it.

---

## 2. What this sprint actually did

Engine v4.0 (a lens architecture: neutral MetricsCore + pluggable framework
lenses, thresholds externalised to a settings file) had been built overnight on a
side branch and left unmerged pending six founder decisions. This sprint took
those decisions, integrated the work, and stood up benchmark data collection.

Sequence: review pack → merge to engine main → benchmark datastore → SPA adapter
→ runbook + tripwires → taxonomy spec → close-out. Then a follow-on to finish the
benchmark pipeline end-to-end and take it live.

---

## 3. Decisions already made — DO NOT RELITIGATE

Full reasoning in `DECISION-LOG-2026-08-12.md` (also in Drive `30_PB Canon`).

1. **UK SDR lens re-expression accepted as-is.** Do not rebuild. Tripwire logged.
2. **SPA integrates via an ADAPTER, not a rewrite.** The display path is unchanged
   and locked by test.
3. **Benchmark records collected from day one**, separate datastore.
4. **Rules ownership sits with Pels**, supported by runbook + BI agent watch.
5. **Taxonomy proxy approved for FREE tier only.** Paid report needs the dedicated
   calculation first.
6. **Merge to engine main; customer-facing release stays gated.**

Two further decisions taken 15 Aug during the follow-on:

7. **Benchmark scope: paid engagements only.** Anonymous free-tier snapshots do
   NOT accrue records. This removed the need for a public write endpoint — which
   matters because the table is append-only, so a public write path would be an
   unfixable pollution vector.
8. **Neon Postgres** via the Vercel marketplace integration.

---

## 4. Verified vs NOT verified — read before claiming anything works

### Verified

- 442 engine tests, 203 SPA tests, both suites green.
- Zero files deleted or renamed across the whole sprint (`git diff --diff-filter=D`).
- Production: homepage, deep links (`/assessment/report?ref=…`), `/assessment` all 200.
- The v4 lens architecture is genuinely in the live bundle (`eu_sfdr_2_0`, `uk_sdr`).
- Cron endpoint returns **401** unauthenticated and on a wrong token.
- No salt value, no `CRON_SECRET` value, no server-only module in the client bundle.
- First sweep: 15 engagements listed, 15 processed, **0 failed, 0 ineligible**.
- **Deduplication holds** — two consecutive runs produced 15 rows, not 30.

### NOT verified — inherited open questions

- **Is the append-only trigger still enabled?** The setup brief had a browser agent
  disable it briefly to remove a test row. Nobody confirmed it was re-enabled. If
  it is off, the table can be silently rewritten and nothing complains.
  ```sql
  SELECT tgname, tgenabled FROM pg_trigger
  WHERE tgrelid = 'benchmark_records'::regclass AND NOT tgisinternal;
  ```
  `O` = enabled (good). `D` = **protection is off, fix it.**

- **The new insert reporting has never run live.** It is deployed and unit-tested
  but the first sweep on the new code is the 3am run of 27 Aug. Expect
  `inserted: 0, duplicates: 15` on a night with no new engagements. If it reports
  15 fresh inserts every night, deduplication has broken.

- **The stray 16th row.** Almost certainly the setup test row
  (`region = 'TEST'`, `engine_version = 'test'`). Cosmetic. Removing it requires
  briefly disabling the trigger — do that in one block and re-enable in the same
  statement batch.

---

## 5. Gotchas that will cost you an hour

- **`emitted` ≠ `inserted`.** The sweep's INSERT carries `ON CONFLICT DO NOTHING`,
  which succeeds silently when it skips a row. `emitted` counts attempts and looks
  identical on a first run and a re-run. Only `inserted` answers "did anything get
  stored". This bit me once; the log line now reports both.

- **The SPA does NOT pin engine `#main`.** It pins a fixed ref. Pushing to engine
  main does not reach customers. `CLAUDE.md` claimed the opposite until 19 Aug —
  if you read a stale copy anywhere, it is wrong.

- **Vercel cron only runs on PRODUCTION deployments.** A scheduled job on a preview
  branch never fires, no matter how well it works there.

- **Preview URLs are SSO-walled** (`all_except_custom_domains`). Anonymous curl gets
  a 302 to `vercel.com/sso-api`. Use the Vercel MCP `web_fetch_vercel_url`, or
  `get_access_to_vercel_url` for a share token.

- **Do not `git add -A` in the SPA repo.** There is a stray `pnpm-lock.yaml`;
  committing it makes Vercel switch to pnpm and the build fails. It is now
  gitignored, but be deliberate anyway.

- **REVOKE/GRANT is not enforcement here.** Neon-via-Vercel gives one role that
  also owns the table, and a Postgres owner can re-grant to itself. The trigger is
  the real protection.

- **The salt must never reach a browser.** The SPA runs the engine client-side, so
  the write path is server-side only. `v4Adapter` asserts `benchmarkSaltSource ===
  "none"` in the browser — if that test ever fails, the salt has leaked into the
  bundle. Treat it as a security regression, not a broken test.

- **Commit messages are published** verbatim in the public JS bundle
  (`VITE_VERCEL_GIT_COMMIT_MESSAGE`, Vercel + Vite default). Low severity — both
  repos are public — but never put a credential in a commit message.

---

## 6. Open items, most consequential first

### A. Taxonomy alignment calculation — blocks paid-report revenue language

The paid Sustainability Readiness Report **must not cite a taxonomy alignment
percentage** (Tripwire B). The current `derivedAlignmentScorePercent` reuses the
EU Tax 8.1 `indicative_score` — a banded criterion-satisfaction score, not the
capex/opex/turnover ratio the regulation means. Fine as a free-tier screening
heuristic; indefensible in an £85k deliverable.

`SPEC-taxonomy-alignment-calc.md` is written and awaiting review. **It contains
five open questions (Q1–Q5). Q3 needs a regulatory opinion, not a product
decision** — whether land and building shell sit inside the aligned activity can
move the number by 30–40% of a DC programme. Getting that answer is the next step;
writing code before it is wasted work.

### B. Tripwires — check at engagement intake and issuance QA

Both live in `RUNBOOK-threshold-updates.md`.

- **Tripwire A:** any ICP 2 engagement where **UK SDR is the client's primary
  framework** → wire the UK lens to the detailed scorers before delivery. The v4
  lens re-expresses label fit at canonical altitude; Impact and Mixed Goals are
  approximations. Fine as a secondary lens, not when the label *is* the question.
- **Tripwire B:** see A above.

### C. Smaller

- Dual-path retirement: legacy SFDR Art 8/9 scorers and the v4 EU lens both stay
  live until SFDR 2.0 is adopted. Correct now; needs an owner at adoption.
- D8 copy: "no exclusions triggered" implies a screen ran against exposure data the
  canonical model structurally cannot carry. Reword before any customer-facing use.
- `VITE_AIRTABLE_PAT` is exposed in the browser bundle. **Known and accepted**
  (`airtableEngagement.js:5`), not a new finding. The benchmark sweep created the
  server-side path that would let you close it if the blast radius ever justifies it.

---

## 7. Where everything lives

**Engine repo** (`/Users/pels/Developer/Perennity_regulatory_frameworks`)
- `CLAUDE.md` — architecture, conventions, version history. Loaded every session.
- `ENGINE-REFERENCE.md` — **how to operate it.** Benchmark schema, the salt rule,
  setup checklist, how to read the sweep log.
- `RUNBOOK-threshold-updates.md` — the 10-minute threshold edit + both tripwires.
- `SPEC-taxonomy-alignment-calc.md` — spec only, not implemented.
- `DECISION-LOG-2026-08-12.md` — the six decisions and why.
- `REVIEW-v4-judgment-calls.md` — the eight judgment calls, PASS/FLAG.
- `BUILD-REPORT.md` — the overnight v4 build's own account.
- `infra/benchmark/001_benchmark_records.sql` — the migration.

**SPA repo** (`/Users/pels/Developer/perennity-capital-readiness-platform`)
- `src/lib/v4Adapter.js` — **the only file that knows v4 exists.** Translation
  layer. Read its header comment before changing anything about v4 rendering.
- `src/lib/listEngagements.js` — server-side engagement lister.
- `api/cron/benchmark-sync.js` — the nightly sweep.
- `vercel.json` — rewrites (with `/api` exclusion) + cron schedule.

**Drive `Pels OS`**
- `10_Agent Specs/BI-AGENT.md` v1.1 — §3a SFDR 2.0 threshold watch.
- `30_PB Canon/DECISION-LOG-2026-08-12.md` — canonical copy.

**Airtable** — `Pels OS — Agent State` base, Agent Log table (`tblBZ7rS4cOz3V6gm`).

---

## 8. How to run things

```bash
export PATH="$HOME/.local/share/fnm/node-versions/v24.19.0/installation/bin:$PATH"

# Engine
cd /Users/pels/Developer/Perennity_regulatory_frameworks
npm test          # 442 pass
npm run typecheck

# SPA
cd /Users/pels/Developer/perennity-capital-readiness-platform
npx vitest run    # 203 pass
npm run build
```

**Trigger the sweep manually** (needs Vercel CLI authenticated as Pels — an agent
cannot, and should not, hold `CRON_SECRET`):
```bash
npx vercel crons run /api/cron/benchmark-sync
```
Or Vercel dashboard → project → Settings → Cron Jobs → run.

**Read the result without the secret:** Vercel MCP `get_runtime_logs`, project
`prj_oL05YbwMVFtZzJQiONBNYjAbe2FI`, team `team_8tSdc1a29uSLLHWVdZIFXFAm`.

---

## 9. Standing constraints that governed this sprint

Assume they still apply unless Pels says otherwise.

- **Zero deletions of existing logic.** Honoured throughout — verify with
  `git diff --diff-filter=D main..<branch>`.
- **No npm publish, no GitHub release.** Package stays `private: true`.
- **Secrets never pass through an agent.** Pels generates and enters them.
  This applies to browser agents too.
- **No SPA main merge without explicit approval.** Both merges this sprint were
  approved in-session against a reviewed preview.

---

## 10. Mistakes made this sprint — recorded so they are not repeated

- Wrote a migration containing `DROP TABLE IF EXISTS` above the create — would
  have destroyed data on a re-run. Caught before it ran anywhere.
- `git add -A` swept a stray `pnpm-lock.yaml` into a commit; Vercel switched
  package managers and the build failed. Now gitignored.
- Counted `append() didn't throw` as "rows written", which made deduplication
  invisible in the logs. Fixed; see the gotcha above.
- Advised `REVOKE`/`GRANT` for append-only enforcement before checking how Neon
  provisions roles. It would have been security theatre. Corrected in
  `ENGINE-REFERENCE.md`.

Two original tests had their **setup** changed (never their assertions) because
new fail-safes deliberately forbid the behaviour they asserted: emission using the
non-secret default salt, and a config swap that left a mirrored threshold stale.
Both changes are documented in their commit messages.
