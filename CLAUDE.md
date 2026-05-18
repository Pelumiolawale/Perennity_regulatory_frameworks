# Perennity Bridge Engine — Repository Context

This file gives Claude Code persistent context for the engine repo. It is loaded at the start of every session.

## What this is

A deterministic regulatory scoring engine for sustainable finance gap assessment, packaged as `@perennity/engine`. Two outputs from one engine: a free Snapshot (diagnostic) and a paid Project Readiness Report (attestation, signed by Dolapo). The engine is the IP being built toward acquisition by a regulated-finance ratings/data buyer.

Consumed by the customer-facing app at `https://github.com/Pelumiolawale/perennity-capital-readiness-platform` via git-URL pin to this repo's `main`. Currently shipping v0.4.1 (Phase 0 complete + Phase 1 commit 1.0 — multi-archetype framework schema, three input axes, HeatmapCell archetype discriminator, and the snapshot single-label filter). EU Taxonomy 8.1 is the only framework with scoring logic today; SFDR scoring lands in Phase 1, ICMA GBP in Phase 3.

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

The Snapshot output schema is an allowlist. If a field is not in `SnapshotOutput` (defined in `src/engine.ts`), it does not reach the free tier. This is enforced structurally by `src/renderers/__tests__/snapshot.gate.test.ts` — see the dedicated section below.

## Repo layout

Flat single-package, NOT a monorepo:

- `src/engine.ts` — core types: Activity, ProjectInput, EngineRun, SnapshotOutput, ReportOutput, HeatmapCell, PUESummary, PillarVerdict, CriterionResult, FrameworkResult, plus enums (Verdict, Framework, EnvironmentalObjective, etc.)
- `src/framework.ts` — three-archetype discriminated union (`FrameworkArchetype`, `ActivityAlignedFramework`, `ProductLabelFramework`, `IssuanceFramework`, `AnyFramework`). Added in v0.4.0 / Phase 0. Activity is the activity_aligned arm.
- `src/inputs.ts` — runtime input axis types (`EntityInput`, `IssuanceInput`, `RunInput`). ProjectInput re-exported from engine.ts for colocation. Added in v0.4.0 / Phase 0.
- `src/runtime.ts` — `DeterministicEngine` class + `aggregateVerdict` helper. `Engine.run` has two overloads (legacy `(ProjectInput, Activity[])` and broadened `(RunInput, AnyFramework[])`) since v0.4.0.
- `src/renderers/snapshot.ts` — `SnapshotRenderer` (free tier)
- `src/renderers/report.ts` — `ReportRenderer` (paid tier)
- `src/renderers/filterCells.ts` — `filterCellsForSnapshot` + `SupportedLabel` (v0.4.1, single-label discipline). Pure post-engine-run filter consumed by the app's snapshot renderer (adoption scheduled for commit 1.5). Paid renderer deliberately does NOT call this.
- `src/renderers/index.ts` — public renderer re-exports
- `src/logic/` — per-criterion scoring functions: `sc_8_1_1`, `sc_8_1_2_pue_existing`, `sc_8_1_2_pue_measurement_compliance`, `dnsh_8_1_*`, `safeguards_*`, `minimum_safeguards_rollup`, `pue_performance_band`. Every criterion declares its input axes via `LogicFn<Axes>` since v0.4.0; all current criteria are `LogicFn<["project"]>`.
- `src/logic/types.ts` — `LogicInput<Axes>` and `LogicFn<Axes>` generic over a tuple of input axis names; mapped type narrows the declared axes to required input slots, undeclared axes are type errors.
- `src/knowledge/` — knowledge-base loader, schema validator, hashing. `validateFramework` (returns `AnyFramework`) is the canonical entry point as of v0.4.0; `validateActivity` is `@deprecated`, delegates to `validateFramework`, kept until v1.0.
- `src/lib/methodologyVersion.ts` — `METHODOLOGY_VERSION` constant
- `src/index.ts` — public package surface
- `src/__tests__/` and `src/{renderers,logic,knowledge}/__tests__/` — test files (co-located with source by area)
- `regulatory-knowledge/` — activity JSON, schema, framework PDFs (the IP library)
- `eval/fixtures/` — fixture inputs (e.g. `hyperscale_frankfurt/input.json`)
- `dist/` — TypeScript build output (gitignored; rebuilt by `prepare` script on install)
- `scripts/` — build/maintenance scripts

## Public package shape

Name: `@perennity/engine` (private, version 0.4.0).

Consumed by the app via:
```
"@perennity/engine": "github:Pelumiolawale/Perennity_regulatory_frameworks#main"
```

The `prepare` script builds `dist/` on install, so consumers don't need TypeScript locally.

**Public exports** (from `src/index.ts`):
- Runtime: `DeterministicEngine`, `BUNDLED_ACTIVITIES`, `METHODOLOGY_VERSION`, `METHODOLOGY_VINTAGE`, `METHODOLOGY_VERSION_FULL`
- Renderers: `SnapshotRenderer`, `ReportRenderer`, `SNAPSHOT_PHRASES`, `DEFAULT_PHRASE`
- Knowledge: `loadKnowledgeBase`, `compileValidator`, `validateFramework` (canonical), `validateActivity` (deprecated; delegates internally), `computeKnowledgeBaseHash`, `computeSchemaHash`, `canonicalStringify`, `KnowledgeBaseValidationError`
- Framework archetype types (v0.4.0+): `FrameworkArchetype`, `ActivityAlignedFramework`, `ProductLabelFramework`, `ProductLabelCriterion`, `ProductLabelFamily`, `ProductLabelInputAxis`, `PAIIndicator`, `SustainableInvestmentCommitment`, `IssuanceFramework`, `IssuanceCriterion`, `IssuanceProcessComponent`, `IssuanceProcessComponentId`, `IssuanceInputAxis`, `AnyFramework`
- Runtime input axes (v0.4.0+): `EntityInput`, `IssuanceInput`, `RunInput`, `InputAxis`, `LogicInput`, `LogicFn`
- All other public types: `Activity`, `ProjectInput`, `EngineRun`, `SnapshotOutput`, `HeatmapCell`, `PillarVerdict`, `ReportOutput`, `PUESummary`, `CriterionResult`, `FrameworkResult`, etc.

Consumers should only import from the package entry. No deep imports into `src/logic/*` or internal renderer module paths — those are not API surface.

## Framework archetypes (v0.4.0+)

`FrameworkArchetype = "activity_aligned" | "product_label" | "issuance_framework"`. The JSON schema (`regulatory-knowledge/activity.schema.json`, historical filename retained) validates all three via an `if`/`then`/`else` chain keyed on the optional `archetype` field. Absence of `archetype` is treated as `activity_aligned` for backward compat with the existing EU Taxonomy 8.1 JSON.

- **activity_aligned** — EU Taxonomy and equivalents. Required fields include `activity_code`, `environmental_objective`, and `substantial_contribution_criteria`. Activity (the existing type) is the activity_aligned arm; `ActivityAlignedFramework` adds an optional `archetype` discriminator on top.
- **product_label** — SFDR Article 8/9, UK SDR. Required fields include `label_id`, `label_family` (`"sfdr" | "uk_sdr"`), and `eligibility_criteria`. Criteria declare `input_scope: ("project" | "entity")[]`.
- **issuance_framework** — ICMA GBP, EU GBS. Required fields include `framework_id` and `process_components` (the four ICMA process components: `use_of_proceeds`, `project_evaluation_and_selection`, `management_of_proceeds`, `reporting`). Criteria declare `input_scope: ("project" | "issuance")[]`.

Scoring logic only exists for activity_aligned today. `Engine.run` filters non-activity frameworks out and emits a non-fatal warning on `EngineRun.warnings` (see "v0.4.0 output contracts" below).

## Input axes

Three input axes alongside the existing per-project intake:

- `ProjectInput` — required for every run. Defined in engine.ts.
- `EntityInput` — corporate-parent / fund-manager level data (UNGC compliance, board composition, PAI 13/14, human rights policy). Consumed by product_label criteria. Minimal in v0.4.0; expanded with SFDR scoring in Phase 1.
- `IssuanceInput` — bond / instrument level data (proceeds tracking, reporting commitments). Consumed by issuance_framework criteria. Minimal in v0.4.0; expanded with ICMA scoring in Phase 3.

Each criterion's `LogicFn<Axes>` type parameter declares which axes it reads — a mapped type narrows the declared axes to required input slots, undeclared axes are type errors. EU Taxonomy criteria are `LogicFn<["project"]>`; future SFDR criteria will be `LogicFn<["project", "entity"]>`; future ICMA criteria will be `LogicFn<["project", "issuance"]>`.

`RunInput` is the wrapper `DeterministicEngine.run` accepts under its broadened overload: `{ project: ProjectInput; entity?: EntityInput; issuance?: IssuanceInput }`. The legacy `(ProjectInput, Activity[])` call shape is preserved as overload 1 so v0.3.0-era callers keep type-checking.

## The snapshot allowlist gate

`src/renderers/__tests__/snapshot.gate.test.ts` is the load-bearing structural protection for the free/paid line. It:

1. Constructs a maximally-leaky `EngineRun` with magic markers planted in every field that could plausibly carry source_text, threshold_value, narrative, or methodology_version.
2. Renders through `SnapshotRenderer`.
3. Asserts no magic marker appears in the serialised output.
4. Walks the output tree at every depth and asserts no `DISALLOWED_KEYS` (`source_text`, `threshold_value`, `narrative`, `methodology_version`, `signatory`, `evidence_log`, `gap_summary`, `scoring_logic_ref`, etc.) appear.
5. Asserts every `HeatmapCell` has the required keys and no keys outside the allowlist.

Never skip this test. Never relax it without updating both the type (`SnapshotOutput` / `HeatmapCell`) AND the allowlist constants in the test together.

As of v0.3.0 the per-cell shape check is "required-subset + allowed-subset" (not exact-match), because cells now have variable optional fields (`pillar_verdicts`, `authority_level`). Leak protections (magic markers + DISALLOWED_KEYS walk) are unchanged. v0.4.0 added `archetype` to the per-cell allowlist (atomically with the type change); the DISALLOWED_KEYS walk and magic-marker tests were not touched.

## v0.4.0 output contracts

`HeatmapCell`:
- `framework: Framework | "minimum_safeguards"`
- `verdict: "pass" | "partial" | "fail" | "data_missing"` (data_missing kept distinct from partial)
- `authority_level?: 1 | 2 | 3` (optional)
- `pillar_verdicts?: PillarVerdict[]` (optional, only populated on the `"minimum_safeguards"` cell)
- `archetype?: FrameworkArchetype` (v0.4.0+; populated on framework cells; omitted on the `"minimum_safeguards"` cell which is a cross-cutting pillar summary, not a framework instance)

`PillarVerdict`: `{ pillar_id: "human_rights" | "bribery_corruption" | "taxation" | "fair_competition"; verdict: Verdict }`.

`ReportOutput.pue_summary?: PUESummary` — focused subset of the PUE measurement compliance CriterionResult plus the declared intake values. Deliberately omits scoring internals (`scoring_logic_ref`, `observed_value`) to keep the surface tight for paid-PDF side-by-side render.

`EngineRun.warnings?: string[]` (v0.4.0+) — non-fatal diagnostic warnings from the run. Populated when frameworks are skipped (currently when product_label or issuance_framework entries appear in the frameworks list — their scoring isn't implemented yet). Free-tier `SnapshotRenderer` does NOT propagate this field; it's a diagnostic surface for paid-tier debug pages and engine consumers. Omitted from `EngineRun` (not empty-array) when no warnings were generated, so canonical output of pure activity-aligned runs is unchanged from v0.3.0.

## v0.4.1 — snapshot allowlist single-label discipline (Phase 1, commit 1.0)

Patch release. No contract surface change: `Engine.run`, `SnapshotOutput`, and `HeatmapCell` shapes are unchanged from v0.4.0.

New exported pure function (lives in `src/renderers/filterCells.ts`, re-exported from `@perennity/engine`):

```ts
filterCellsForSnapshot(
  cells: HeatmapCell[],
  targetLabel: SupportedLabel,
): { cells: HeatmapCell[]; warnings: string[] }
```

`SupportedLabel` is a new exported string-literal union with seven members: `"eu_taxonomy_8_1" | "sfdr_article_8" | "sfdr_article_9" | "uk_sdr_focus" | "uk_sdr_improvers" | "uk_sdr_impact" | "uk_sdr_mixed_goals"`. The type was expected from Phase 0 per the framework archetype split but never landed in v0.4.0 — introducing it here rather than silently inlining the string literals. Tracked explicitly so future framework additions widen the type in one place.

Scoping rules:
- `targetLabel = "eu_taxonomy_8_1"` keeps cells where `archetype === "activity_aligned"` AND `framework ∈ {EU_TAXONOMY_CLIMATE, EU_TAXONOMY_ENVIRONMENTAL}`, plus the `minimum_safeguards` cell.
- SFDR labels keep `archetype === "product_label"` AND `framework === "SFDR"`, drop `minimum_safeguards`.
- UK SDR labels keep `archetype === "product_label"` AND `framework === "UK_SDR"`, drop `minimum_safeguards`.

`minimum_safeguards` scoping: Article 18 of EU Regulation 2020/852 is an EU Taxonomy concept, so the safeguards cell is rendered only under EU Taxonomy labels. Identified by the typed discriminator `cell.framework === "minimum_safeguards"` (not by string-name on a separate field). Will be re-evaluated when ICMA GBP lands in Phase 3 (the GBP "alignment with Green Bond Principles" concept overlaps semantically but is structurally separate).

Strict on unknown cells: any `HeatmapCell` with no `archetype` and `framework !== "minimum_safeguards"` is dropped from the rendered output AND pushes a structured warning onto the returned `warnings` array. Warnings flow through the function's return value (Option α from the spec) rather than `console.warn` (Option β) — structured warnings are testable.

Renderer adoption: the engine's `SnapshotRenderer` does NOT call this filter yet — for v0.4.1 the function ships and is exported, and the consuming app continues to render the way it does today. The EU-Tax-only world means there's nothing to filter. App-side adoption is scheduled for commit 1.5 alongside the pin bump (consuming app target version: `@perennity/engine#v0.5.0`).

Paid PDF deliberately bypasses this filter — the £85k report can and should show comparative analysis. Commit 1.4 will make that explicit at the call site.

## Authority labels

Defined in `src/renderers/report.ts:208-212` (`authorityLabel(level)`) and mirrored verbatim by the consuming app:
- `authority_level: 1` → `"Regulatory"`
- `authority_level: 2` → `"Perennity Bridge methodology"`
- `authority_level: 3` → `"Informational"`

Don't drift these without updating the app side in lockstep.

## Determinism rules

- Same input + same `knowledge_base_hash` + same `engine_commit_sha` = bit-identical engine output.
- The scoring engine MUST NOT call the LLM. Narrative is composed in the renderer (paid tier only).
- Threshold evaluation lives in `src/logic/*` functions, not in prompts.
- `Engine.run` returns `Promise<EngineRun>` (async since v0.2.x). Test helpers that assume sync need updating.

## Methodology versioning

- Methodology version is per-activity (e.g. v3.2). Surfaced via `METHODOLOGY_VERSION` constant in `src/lib/methodologyVersion.ts`.
- When a framework instrument is amended, bump `framework_source_hash` and create a new activity definition with `supersedes` pointing to the old one.
- Historical runs always replay against their original manifest's `knowledge_base_hash`.

## Package versioning

- Bump **minor** (0.x.0) for any output-contract addition (new fields on `SnapshotOutput` / `ReportOutput` / `HeatmapCell`, new optional types, etc.) — the consuming app may key on the shape.
- Bump **patch** (0.x.y) for bug fixes, knowledge-base updates, or scoring tweaks that don't change the output shape.
- Don't pre-1.0 prematurely. Semver discipline matters for the consuming app's pin behaviour.

## Article 26 disclaimer

Every PDF (both tiers, rendered by the app) carries the EU Taxonomy Regulation Article 26 disclaimer in the footer. The free/paid line is internal to Perennity. The advisory/assurance line is regulatory. Do not conflate them.

## Testing

- Runner: Node's built-in `node:test` (NOT Vitest). Invoked via `npm test`.
- Baseline: 124 tests across 31 suites (as of v0.4.0).
- Fixtures live in `eval/fixtures/` — e.g. `hyperscale_frankfurt/input.json` is the golden-path integration fixture used by `heatmap-safeguards.test.ts`.
- Drift from expected outputs blocks merge. Update fixtures only with explicit reasoning in the commit message.

## Branching and shipping

Single-developer flow. Direct-push to `main` on this repo (no PR review process). Feature branches OK locally for non-trivial work.

The app pins to `#main`, so any push to `main` here is consumable by the app on its next `npm install @perennity/engine`. Bump the engine version in `package.json` to trigger reliable cache invalidation — npm sometimes skips SHA-only changes on git-URL deps, and the consumer's `vercel.json` enforces `npm ci` as a CI-side backstop.

## What lives in the regulatory-knowledge library

Built today:
- The archetype-discriminated schema: `regulatory-knowledge/activity.schema.json` (historical filename retained from v0.3.0 to keep the `"$schema"` reference stable in `eu_tax_climate_8_1.json`). Validates all three archetypes via an `if`/`then`/`else` chain. See `regulatory-knowledge/README.md` for the note about the filename.
- Verbatim regulation text: `regulatory-knowledge/frameworks/<framework>/<activity>.json`, `source_text` field on each Criterion.
- Activity definitions (currently just `eu_tax_climate_8_1.json` — single-framework scoring proof of concept). The schema can already validate SFDR and ICMA shapes; the JSON files and scoring logic for those land in Phase 1 and Phase 3.

Planned next (schema is ready; scoring logic NOT YET BUILT — tracked separately):
- SFDR Article 8 / Article 9 definitions (product_label archetype). Phase 1.
- UK SDR Focus / Improvers / Impact / Mixed Goals definitions (product_label archetype). Phase 1.
- ICMA Green Bond Principles definition (issuance_framework archetype). Phase 3.

Each new framework will require: an `activity.schema.json`-conforming JSON file under `regulatory-knowledge/frameworks/<framework>/`, a corresponding entry in `BUNDLED_ACTIVITIES`, per-criterion scoring functions under `src/logic/` (each typed with its declared input axes — e.g. `LogicFn<["project", "entity"]>` for SFDR), and (likely) snapshot phrase entries in `SNAPSHOT_PHRASES`. The app intake will likely move to a multi-tab layout (one tab per framework) to match.

Phase 1's first SFDR criterion will force a few cleanups flagged during Phase 0: the registry's `LogicFn<["project"]>` value type needs broadening to accept multi-axis criteria; `scoreCriterion` needs to populate the entity/issuance slots from `RunInput` based on each criterion's declared axes; `FrameworkResult` likely needs to carry the archetype through so `SnapshotRenderer` can stop hardcoding `"activity_aligned"` on cells.

Not yet built (aspirational; tracked in the backlog):
- DNSH Narrative Library — currently inline in renderers; no separate templates.
- IC Defence Pack templates — `buildDefencePack()` in `src/renderers/report.ts` returns a versioned stub with empty `questions[]`. Builder library is a future workstream.

## Working pattern

Founder plans and ideates in chat (claude.ai). Execution happens via Claude Code in the terminal. Code is reviewed via diff before commit. Pushes to `main` here are consumable immediately by the app on next pin bump.
