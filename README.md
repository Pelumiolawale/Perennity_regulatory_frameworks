# Perennity Bridge — Architecture Handoff

Three artefacts. Drop them into your repo, then drive Claude Code from your terminal against them.

## What's here

1. **`activity.schema.json`** — The contract every framework parsed into the regulatory knowledge base must satisfy. JSON Schema 2020-12. This is the artefact you'd hand an S&P diligence team to demonstrate the engine's discipline.

2. **`eu_tax_climate_8_1.json`** — A worked example of Activity 8.1 instantiated against the schema. Two SC criteria (ECoCC + PUE), two DNSH criteria (adaptation + water), minimum safeguards. The verbatim `source_text` fields are stubbed — fill them from CELEX_32021R2139 yourself, because the verbatim regulation text is the authoritative bit and must not be paraphrased.

3. **`engine.ts`** — TypeScript scaffolding for the engine + two-renderer architecture. Not production code. It communicates shape to Claude Code so it can flesh out implementations.

## How to use this with Claude Code

### Setup

```bash
cd ~/projects/perennity
mkdir -p regulatory-knowledge/frameworks/eu_taxonomy_climate
cp /path/to/activity.schema.json regulatory-knowledge/
cp /path/to/eu_tax_climate_8_1.json regulatory-knowledge/frameworks/eu_taxonomy_climate/
cp /path/to/engine.ts packages/engine/src/

claude
```

### CLAUDE.md to drop at the repo root

```markdown
# Perennity Bridge — Repository Context

## What this is
A regulatory engine for sustainable finance gap assessment. Two outputs from one engine: a free Snapshot (diagnostic) and a paid Project Readiness Report (attestation, signed by Dolapo). The engine is the IP being built toward acquisition by a regulated-finance ratings/data buyer.

## Architecture rule (non-negotiable)
ONE deterministic scoring engine. TWO renderers. The engine always runs end-to-end. Entitlement is checked at the renderer boundary, never inside the engine.

A free user must NEVER be able to extract:
- Numeric thresholds from any framework
- Verbatim source_text quotes
- DNSH narrative paragraphs
- Methodology version stamps
- A signature block
- The PAI table
- Anything that looks like a Second Party Opinion

The Snapshot output schema is an allowlist. If a field is not in `SnapshotOutput`, it does not reach the free tier.

## Repo layout
- `/regulatory-knowledge` — separate versioned library. Activity JSON files, the schema, framework source PDFs (hashed). Treat as IP, not as application code.
- `/packages/engine` — the deterministic scoring engine. Pure logic. No LLM calls. No I/O beyond reading activities and writing results.
- `/packages/renderers` — Snapshot and Report renderers. Renderers may call the LLM for narrative composition, but only the Report renderer ever sees full engine output.
- `/packages/web` — Next.js app. The /assessment/snapshot route is free; /assessment/report is gated.
- `/packages/eval` — evaluation harness. Fixture cases (hyperscale Frankfurt, colocation Dublin, etc.) with expected outputs.

## Determinism rules
- Same input + same knowledge_base_hash + same engine_commit_sha = bit-identical engine output.
- Every run produces a RunManifest persisted to AuditStore.
- The scoring engine MUST NOT call the LLM. Narrative is composed in the renderer.
- Threshold evaluation lives in `logic.*.v*` functions, not in prompts.

## Methodology versioning
- Methodology version is per-activity, e.g. v3.1.
- When a framework instrument is amended, bump framework_source_hash and create a new activity definition with `supersedes` pointing to the old one.
- Historical runs always replay against their original manifest's knowledge_base_hash.

## Article 26 disclaimer
Every PDF (both tiers) carries the EU Taxonomy Regulation Article 26 disclaimer in the footer. This is the regulatory line. The free/paid line is internal. Do not conflate them.

## Testing approach
Every change to scoring logic runs against `/packages/eval/fixtures`. Drift from expected outputs blocks merge. Update fixtures only with explicit reasoning in the PR description.

## What lives where
- Verbatim regulation text: `regulatory-knowledge/frameworks/<framework>/<activity>.json`, `source_text` field.
- Narrative templates: `regulatory-knowledge/narrative-library/<framework>/<criterion>/<version>.md`.
- IC Defence Pack templates: `regulatory-knowledge/ic-defence/<framework>/<archetype>/<version>.md`.
```

### First prompts to give Claude Code

Run these in sequence. Don't skip the plan step.

**Prompt 1 — Parser scaffold**
```
Read activity.schema.json and eu_tax_climate_8_1.json. Write a plan (do not implement yet) for a TypeScript module that:

1. Validates an activity JSON file against the schema using Ajv.
2. Loads all activities from regulatory-knowledge/frameworks/**/*.json into memory.
3. Computes a deterministic knowledge_base_hash from the loaded set.

Write the plan to PLAN-parser.md. List the dependencies you'll add, the public API, and any open questions. Stop after writing the plan.
```

**Prompt 2 — Implement the parser**
```
Review PLAN-parser.md with me. [Iterate.] Now implement against the plan. Add tests for: valid file loads, invalid file rejects with a precise error, hash stability across runs.
```

**Prompt 3 — Scoring engine for Activity 8.1 only**
```
Read engine.ts. Implement the Engine interface for a single activity (eu_tax_climate_8_1) only. For each criterion in that activity, implement the function referenced by scoring_logic_ref in /packages/engine/src/logic/. Each function takes the relevant data_inputs and returns a CriterionResult. No LLM calls. Pure functions. Add unit tests for each logic function covering pass, partial, fail, data_missing, and (where applicable) estimation_used cases.
```

**Prompt 4 — Renderers**
```
Implement SnapshotRenderer and ReportRenderer. For the Snapshot, write a test that asserts no source_text, no threshold_value, no narrative paragraph, and no methodology_version ever appears in SnapshotOutput. This test is the structural enforcement of the gate; it must never be skipped or relaxed.
```

**Prompt 5 — Evaluation harness**
```
Create /packages/eval/fixtures/. Each fixture is a folder containing input.json (a ProjectInput) and expected.json (the expected EngineRun for that input). Create six fixtures: hyperscale_frankfurt, colocation_dublin, greenfield_riyadh, retrofit_dublin, hyperscale_riyadh, edge_sao_paulo. Then write a test runner that loads every fixture, runs the engine, and asserts the engine output equals expected (deep equality on verdicts, gap_ids, scoring_logic_versions).
```

## What this gives you

After roughly two weeks of focused work driven by these prompts, you'll have:

- A versioned regulatory knowledge base for Activity 8.1 (extensible to every other framework by repeating the pattern).
- A deterministic scoring engine that produces identical output for identical inputs.
- Two enforced renderers — the Snapshot can't leak paid-tier data because the type system won't allow it.
- An evaluation harness that catches regressions automatically.
- A run manifest for every assessment, enabling replay 18 months later when a client comes back with a question.

This is the architecture that lets you say to an S&P diligence team: "Our methodology is versioned, our scoring is deterministic, every claim cites a primary source, and every report we have ever issued can be reconstructed exactly." That is what makes the engine the asset.

## What to defer

Don't build SFDR, SDR, LEED, or the bond frameworks until Activity 8.1 is end-to-end clean. The pattern extends; the discipline doesn't, if you rush parallel framework parsing before the first one is solid.

Don't build the IC Defence Pack templates until you've shipped one paid Report against the new structure. Real client feedback shapes the templates better than speculation.

Don't build self-serve £85k checkout. Per strategy Ask A3, paid entitlement is provisioned manually after engagement letter countersignature in Phase 1.
