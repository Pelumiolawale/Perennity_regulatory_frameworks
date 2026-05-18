# Perennity Bridge Engine — Repository Context

This file gives Claude Code persistent context for the engine repo. It is loaded at the start of every session.

## What this is

A deterministic regulatory scoring engine for sustainable finance gap assessment, packaged as `@perennity/engine`. Two outputs from one engine: a free Snapshot (diagnostic) and a paid Project Readiness Report (attestation, signed by Dolapo). The engine is the IP being built toward acquisition by a regulated-finance ratings/data buyer.

Consumed by the customer-facing app at `https://github.com/Pelumiolawale/perennity-capital-readiness-platform` via git-URL pin to this repo's `main`. Currently shipping v0.5.0-alpha.2 (Phase 0 complete + Phase 1 commits 1.0, 1.0.1, 1.1, and 1.2 — multi-archetype framework schema, three input axes, HeatmapCell archetype discriminator, snapshot single-label filter, SFDR label version-stamping, SFDR Articles 8 + 9 declared, and SFDR Article 8 fully scored with deterministic five-band verdicts). SFDR Article 9 criteria 8-11 ship next in commit 1.3; ICMA GBP in Phase 3.

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

## KB access patterns: `activities[]` vs `frameworks[]`

As of v0.5.0-alpha.1, the `KnowledgeBase` returned by `loadKnowledgeBase()` exposes two access paths with deliberately different semantics. New code MUST pick the right one — confusing them leads to either incorrect scoping or a broken hash invariant.

- **`activities[]`** — legacy view, partitioned to activity-aligned frameworks only (currently: EU Taxonomy Activity 8.1). Preserves the EU 8.1 KB hash invariant (`sha256:b3daee…d43`) because `computeKnowledgeBaseHash` continues to hash only this partition. Consumed by EU Taxonomy scoring logic (`src/logic/sc_8_1_*`, `dnsh_8_1_*`, `safeguards_*`), the legacy `Engine.run((ProjectInput, Activity[]))` overload, and the audit replay machinery. Do not add non-activity-aligned frameworks to this view, and do not change what the hash is computed over.

- **`frameworks[]`** — canonical cross-archetype view (paired with `frameworksById: Map<string, AnyFramework>`). Contains every framework regardless of archetype (`activity_aligned`, `product_label`, `issuance_framework`). This is the access path for all post-Phase-0 scoring logic, validator work, ref resolution, and renderer cell production.

**Rule of thumb for new code:**

- Touching EU Taxonomy scoring or audit replay → `activities[]`
- Adding scoring for any new framework (SFDR, UK SDR, ICMA GBP) → `frameworks[]`
- Walking the full KB for any purpose → `frameworks[]`
- Computing hash invariants → must continue to compute over the activity-aligned partition only (i.e. `activities[]`)

If you find yourself reaching for `activities[]` while implementing scoring or rendering for a non-EU-Taxonomy framework, stop — that's a bug waiting to happen. The SFDR criteria in Phase 1 commits 1.2 and 1.3 access frameworks via `frameworks[]`; Phase 2 UK SDR and Phase 3 ICMA GBP work follows the same rule.

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

## v0.4.2 — SFDR label version-stamping (Phase 1, commit 1.0.1)

Patch release. Mechanical rename of two `SupportedLabel` members, supersedes the SFDR label naming in v0.4.1:

- `"sfdr_article_8"` → `"sfdr_v1_article_8"`
- `"sfdr_article_9"` → `"sfdr_v1_article_9"`

The other five labels (`eu_taxonomy_8_1`, `uk_sdr_focus`, `uk_sdr_improvers`, `uk_sdr_impact`, `uk_sdr_mixed_goals`) are unchanged.

Rationale: Commission proposal COM(2025) 841 would repeal Delegated Regulation 2022/1288 and restructure SFDR Art 8/9 into a new category regime ("SFDR 2.0"). Adoption is 18–30 months out; current SFDR (Reg 2019/2088 as consolidated 09/01/2024) remains the operative regime. Building current SFDR support under v1-suffixed labels means (a) every Art 8/9 verdict is unambiguously stamped with regulatory regime on its face, (b) SFDR 2.0 categories — when supported — can be added as `_v2` siblings without retroactive relabelling, (c) no production reports are ever ambiguous about which regime they assessed against.

**Convention going forward**: when a regulatory regime is in active rewrite (proposal tabled but not yet adopted), new labels under that regime carry a `_v1` suffix; siblings under the future regime will carry `_v2` etc. EU Taxonomy and UK SDR labels are not version-stamped — neither has a comparable rewrite proposal tabled (Activity 8.1 is stable under Delegated Regulation 2021/2139; FCA PS23/16 is finalised). Revisit per regime if and when a comparable rewrite surfaces.

**Deferred concept-alignment (commit 1.1 owns the call)**: the strings `"sfdr_article_8"` / `"sfdr_article_9"` still appear in two adjacent-but-distinct concepts that this commit deliberately did NOT rename:
- `ProductLabelFramework.label_id` (framework-internal identifier, used in Phase 0 test fixtures at `src/__tests__/phase_0_3_archetype.test.ts` and `src/knowledge/__tests__/load.test.ts`).
- `Criterion.framework_applicability[]` (cross-framework applicability tags on EU Taxonomy 8.1 safeguards criteria, in `regulatory-knowledge/frameworks/eu_taxonomy_climate/eu_tax_climate_8_1.json`).

Renaming either would either change a different concept's contract (label_id) or alter the EU 8.1 KB hash invariant (framework_applicability). Commit 1.1 introduces the first real SFDR framework JSON and is the right place to decide whether these adjacent concepts should align with `SupportedLabel`'s versioning convention.

EU 8.1 knowledge_base_hash invariant (`sha256:b3daee…d43`) unchanged. `Engine.run`, `HeatmapCell`, and `SnapshotOutput` contracts unchanged. Defensible as a patch (vs. minor) because v0.4.1 was the introduction of `SupportedLabel` and no production consumer pins to it yet — the app stays on `#v0.4.0` until commit 1.5.

## v0.5.0-alpha.1 — SFDR Articles 8 + 9 declared (Phase 1, commit 1.1)

Pre-release tag. The full `v0.5.0` lands at the end of Phase 1 (commit 1.4) once SFDR scoring and the paid PDF renderer changes are in. This commit is intentionally **declarative only**: SFDR criteria ship with `scoring_status: "not_implemented"` and become real in commits 1.2 (Art 8) and 1.3 (Art 9).

**Shared criterion library — new architecture.** Each criterion is a standalone JSON file under `regulatory-knowledge/criteria/<regime>/<criterion_id>.json`, validated by `regulatory-knowledge/criteria/criterion.schema.json`. Framework JSONs become lightweight ref-lists (`criteria: [{ ref, weight }]`). This pattern will be reused in Phase 2 (UK SDR) and Phase 3 (ICMA GBP); the v3.2 inline-criterion shape is retained for EU Taxonomy 8.1 and pre-existing test fixtures (the schema's product_label branch uses `anyOf` to accept either shape).

**New files**:
- `regulatory-knowledge/criteria/criterion.schema.json` — JSON Schema (Draft 2020-12) for shared criterion files. Required fields: `criterion_id`, `name`, `regime`, `regulatory_anchors`, `axes`, `applies_to`, `scoring_status`, `methodology_version_introduced`, `summary`. Optional: `successor_regime_note`. `criterion_id` is version-stamped (pattern `^[a-z]+_v\d+_[a-z][a-z0-9_]*$`); loader cross-checks that `criterion_id` starts with the `regime` slug.
- `regulatory-knowledge/criteria/sfdr-v1/*.json` — 11 SFDR criterion files (7 shared between Art 8 and Art 9; 4 Art 9-only including the PB 90% sustainable-investment floor).
- `regulatory-knowledge/frameworks/sfdr/v1/{art-8,art-9}.json` — two framework JSONs under the v3.3 ref-based shape. Both ship with `verdict_thresholds: { aligned: null, partially_aligned: null, not_aligned: 0 }` — calibration pending.

**Schema additions** (`activity.schema.json`, additive only — EU 8.1 KB hash unchanged):
- Top-level optional fields: `regime`, `label`, `regulatory_anchors`, `criteria` (ref array), `verdict_thresholds`.
- `$defs`: `criterion_ref` (`{ ref, weight }`), `regulatory_anchor` (`{ regulation, celex, article, url? }`).
- The product_label branch in `allOf` switched from `required: [label_id, label_family, eligibility_criteria]` to `anyOf` accepting either that legacy triple or the v3.3 triple `[framework_id, regime, criteria]`. The v3.2-shaped test fixtures in `phase_0_3_archetype.test.ts` / `load.test.ts` continue to validate.

**Loader changes** (`src/knowledge/load.ts`, `src/knowledge/criterion-library.ts`):
- `KnowledgeBase` gains `frameworks: AnyFramework[]` and `frameworksById: Map<string, AnyFramework>` — the full collection across archetypes.
- `KnowledgeBase.activities[]` is now partitioned to activity-aligned frameworks only. This is the load-bearing change that **preserves the EU 8.1 KB hash invariant** (`sha256:b3daee…d43`) even though SFDR JSONs are now part of the KB — `computeKnowledgeBaseHash` continues to hash only activity-aligned bytes. (See "KB access patterns" above for the durable architectural rule.)
- New `loadCriterionLibrary(opts?)` walks `regulatory-knowledge/criteria/**/*.json`, validates each file against `criterion.schema.json`, returns `{ byId: Map<criterion_id, SharedCriterion>, sourceFiles }`. Throws `CriterionLibraryValidationError` on schema failure or `criterion_id`/`regime` mismatch.
- New `resolveCriterionRefs(refs, library, framework)` resolves each `{ ref, weight }` against the criterion library and runs three checks: existence (criterion present in library); `applies_to` membership (referenced criterion's `applies_to` array includes the framework's id); `regime` match (criterion's `regime` equals framework's `regime`). Returns both resolved entries and structured errors.

**Engine changes** (`src/runtime.ts`):
- v3.3-shape product_label frameworks (with a `criteria` ref array) are no longer silently skipped — they emit a `FrameworkResult` carrying one synthetic `CriterionResult` per ref with `scoring_status: "not_implemented"`, `verdict: "data_missing"`, and the ref string as `criterion_id`. A diagnostic warning is pushed onto `EngineRun.warnings` naming the framework and the pending scoring commits.
- `FrameworkResult` gains an optional `archetype?: FrameworkArchetype` field. Populated on product_label results so the renderer can branch. Omitted on activity-aligned results — canonical EU 8.1 output is bit-identical to v0.4.2.
- `synthesizeGaps` skips not_implemented criteria so the snapshot gap list isn't dominated by non-actionable placeholders under SFDR labels.

**Renderer changes** (`src/renderers/snapshot.ts`):
- `buildHeatmap` branches on `FrameworkResult.archetype`. Activity-aligned: one aggregated cell per framework (unchanged). Product_label: one cell per `CriterionResult`, carrying `criterion_id`, `archetype: "product_label"`, and `scoring_status: "not_implemented"` (until 1.2/1.3 promote them).
- `HeatmapCell` gains two new optional fields: `criterion_id?: string` and `scoring_status?: "not_implemented"`. Both are status discriminators (not investor-grade content); both are added to the structural gate test's `ALLOWED_HEATMAP_CELL_KEYS` atomically with the type change. The DISALLOWED_KEYS walk and magic-marker checks are unchanged.
- `CriterionResult` gains `scoring_status?: "not_implemented"`.

**Engine integration helpers**:
- `labelIdToSupportedLabel(label_id: string): SupportedLabel | null` and `labelIdToSupportedLabelWithWarning(label_id)` — the bridge between KB-internal `label_id` (hash-stable, unversioned) and public-facing `SupportedLabel` (version-stamped). Lives in `src/labels.ts`. Defensive on unknowns (returns `null` + optional warning), consistent with commit 1.0's strict-on-unknowns convention. If this mapping ever grows past a handful of entries, the namespace separation is leaking — surface it.
- `filterCellsForSnapshot` does NOT need code changes for v3.3 — the existing archetype + framework matching surfaces SFDR not_implemented cells correctly under `sfdr_v1_article_8` / `sfdr_v1_article_9` labels, and the warning channel only fires on cells with no archetype (not on not_implemented cells, which carry `archetype: "product_label"`).

**Methodology v3.3** (`src/lib/methodologyVersion.ts`):
- `METHODOLOGY_VERSION` bumped from `"v3.2"` to `"v3.3"`.
- File-level doc-comment captures the five framing decisions locked in v3.3: (1) PB scores SFDR for the developer not the FMP; (2) Article 9 90% SI floor (excluding cash + hedging); (3) SFDR 2.0 caveat (COM(2025) 841); (4) shared criterion library architecture; (5) forward-compat versioning convention.
- Tests that hardcode `methodology_version: "v3.2"` in their `EngineDeps` continue to pass — the constant is the default; explicit values override.

**Forward-compat versioning convention** (locked, applies to all future regimes):
- `criterion_id` and `framework_id` carry a regime-version suffix (`<regime>_v<n>_*`).
- `label_id` (KB-internal) deliberately does NOT carry the suffix — it stays hash-stable.
- `SupportedLabel` (public-facing) carries the suffix for regimes in active rewrite (SFDR has SFDR 2.0 proposal → `sfdr_v1_*`; EU Tax and UK SDR have no comparable proposal → unversioned).

**Adjacent concept-alignment from v0.4.2** (deferred again): Phase 0 test fixtures still use `label_id: "sfdr_article_8"` in `ProductLabelFramework` constructors at `src/__tests__/phase_0_3_archetype.test.ts` and `src/knowledge/__tests__/load.test.ts`. The EU 8.1 KB JSON still has `framework_applicability: [..., "sfdr_article_9", ...]` in safeguards criteria. Renaming either would change a different concept's contract or break the KB hash invariant; both remain on the unversioned strings as deliberate design (KB hash stability) and tech-debt-with-rationale (test fixtures). Revisit when SFDR scoring lands (1.2/1.3) if the fixtures need refresh.

**Pre-release vs. stable**: `v0.5.0-alpha.1` is a pre-release. The app's git-URL pin stays on `#v0.4.0` (or `#main` if it tracks); pre-release tags are NOT automatically picked up by npm semver ranges. Full `v0.5.0` ships when commit 1.4 lands snapshot phrases + PDF renderer changes for SFDR.

## v0.5.0-alpha.2 — SFDR Article 8 scoring (Phase 1, commit 1.2)

Pre-release continues. The full `v0.5.0` lands in commit 1.4. This commit converts SFDR Article 8 from declared-only (commit 1.1) to fully scored: 7 deterministic per-criterion functions producing five-band verdicts plus a sixth `not_applicable` band, with rationale text on every cell.

**Structural additions (all additive, EU 8.1 KB hash unchanged):**

- `HeatmapCell.verdict` union widened with the five SFDR bands (`aligned`, `partially_aligned`, `not_aligned`, `insufficient_evidence`) plus `not_applicable`. Activity-aligned cells continue to use the legacy `pass`/`partial`/`fail`/`data_missing` values; both render through the same renderer path.
- `HeatmapCell` gains `rationale_text`, `evidence_refs`, `not_applicable_rationale`, and `numeric_value` (optional). All added to the structural-gate allowlist atomically; magic-marker and DISALLOWED_KEYS walks unchanged.
- `CriterionResult` gains matching `rationale_text`, `not_applicable_rationale`, `numeric_value` (optional) for the engine→renderer plumbing.
- `Verdict` widened with the SFDR band values so the runtime can carry them through.
- `FrameworkResult.archetype` is the renderer's branch switch — already added in commit 1.1 — and now drives the per-criterion-cell emission path for product_label results.

**Dependency support (additive on `criterion.schema.json` and `SharedCriterion`):**

- `depends_on?: string[]` — intra-framework criterion dependencies. Used by SFDR criterion 5 (cascades from criterion 1 when criterion 1 is `not_aligned`) and criterion 7 (reads criterion 1's evidence_refs read-only for indicator-link check).
- `depends_on_framework?: string[]` — cross-framework dependencies. Used by SFDR criterion 6 to read EU Taxonomy 8.1's `FrameworkResult` via `LogicInput.framework_results`. An adapter maps the legacy EU-Tax `Verdict` to SFDR band vocabulary inside the criterion 6 scoring function.
- `topologicalSort` in `src/sfdr/orchestration.ts` orders criteria by `depends_on` and fails loudly on cycles or unresolved deps (loud-fail-at-load-time pattern).
- `validateCrossFrameworkDeps` is the load-time check that every `depends_on_framework` is satisfiable.

**Logic registry call:**

The spec asked for `LogicFn<readonly LogicAxis[]>` widening. We tried it and surfaced a variance issue: widening `Axes` in `LogicFn` makes the type *harder* to call (the input becomes the *intersection* of all axis slots, requiring `project + entity + issuance` together). Reverted that widening and kept the EU registry narrow (`LogicFn<["project"]>`). SFDR scoring lives in a parallel dispatcher under `src/sfdr/` with its own typed `SFDRScoringFn` signature, which is cleaner anyway because SFDR has additional concerns (dependencies, cross-framework, typed band output) that aren't in the EU registry's contract. Documented under "Logic registry call" comment in `src/logic/registry.ts`.

**Constants files (4 + 1 schema):**

Under `regulatory-knowledge/constants/`:
- `eu_non_cooperative_jurisdictions.json` — EU Council Annex I list. **Last verified 2024-02-20** against ECOFIN Council Conclusions. The list refreshes ~twice yearly (February and October); refresh `last_verified` on each verification.
- `sfdr_v1_material_pais_data_centre.json` — 11 PAIs material for data-centre developers. Includes PB framing notes for PAI 3 (developer-as-investee) and PAI 6 (data-centre-as-high-impact).
- `recognised_sustainability_standards.json` — 6 standards (GRI, TCFD, IFRS S1, IFRS S2, EFRAG ESRS, CDP) accepted as named-framework evidence for criteria 5 and 7.
- `data_centre_sector_material_categories.json` — 4 categories (energy, water, biodiversity, community) used by criterion 1's sector-material gate.
- `constants.schema.json` — small shared schema discriminated by `kind`.

The TS mirror at `src/sfdr/constants.ts` is the runtime path; drift is caught by `src/sfdr/__tests__/constants-parity.test.ts`.

**Per-criterion scoring (Article 8):**

All 7 criteria implemented per the locked band definitions in `src/lib/methodologyVersion.ts` (file-level doc):
1. `art8_c1_es_characteristics` — ≥3 quantified + ≥2 sector-material gates
2. `art8_c2_good_governance` — 4-domain rubric (board / employees / remuneration / tax)
3. `art8_c3_pai_policy` — material PAI coverage with numeric output (full count / 11)
4. `art8_c4_dnsh` — per-PAI threshold screen, any harm = not_aligned
5. `art8_c5_pre_contractual` — Annex II 9-element decomposition + cascade from c1
6. `art8_c6_taxonomy` — cross-framework dep on EU Tax 8.1, numeric output, N/A when no claim
7. `art8_c7_periodic_reporting` — operational vs pre-operational paths, reads c1 read-only

**Engine integration:**

- The runtime's product_label scoring path now invokes the SFDR orchestrator (via `scoreSFDRCriteria` + `SFDR_REGISTRY` + `BUNDLED_SFDR_CRITERIA`) rather than emitting placeholder `data_missing` cells.
- Activity-aligned framework_results are passed to the orchestrator's `framework_results` map keyed by `framework.id`, so SFDR criterion 6 finds `eu_tax_climate_8_1`.
- Art 8 frameworks no longer emit the "scoring not yet implemented" warning. Art 9 still does, naming the 4 still-pending criteria.
- `synthesizeGaps` now skips the four SFDR band verdicts (`aligned`/`partially_aligned`/`not_aligned`/`insufficient_evidence`) — SFDR cells carry their own per-cell `rationale_text`, and gap-list narrative is anchored to EU-Tax-style verdicts. SFDR remediation surfaces in the renderer-level band-aware "what's missing" panel scheduled for commit 1.4.

**Aggregate Article 8 verdict NOT computed.** Weights stay `null`; framework `overall_verdict` is `not_applicable` until the calibration commit (post-Phase-1).

**`filterCellsForSnapshot` handles `not_applicable`** the same way it handled `not_implemented` in commit 1.1 — surfaced (visible to user as "Not applicable" with rationale), no warning emitted.

**Input shape extensions (additive on Phase 0 contracts):**

- `EntityInput.sfdr?: EntitySFDRInputs` carrying `governance`, `pai_disclosures`, `disclosures`, `reporting` typed sub-shapes.
- `ProjectInput.sfdr?: ProjectSFDRInputs` carrying `disclosures`, `dnsh`, `taxonomy_claim`.
- All sub-shapes optional — scoring functions resolve to `insufficient_evidence` when the relevant field is undefined, and to `not_applicable` for criterion 6 when no taxonomy claim is made (the absence is the signal).

**Test coverage:**

- 29 new tests across 3 new suites: per-criterion bands (10 tests across criteria 1-7), orchestration (topological sort + cycle detection + cross-framework validation), constants parity (TS ↔ JSON).
- All 153 baseline tests still pass — **total 186/186**.
- Structural gate test green; EU 8.1 KB hash invariant green.

**Open items (deliberately deferred):**

- **Weight calibration** — `weight: null` everywhere; aggregate verdict logic ships post-Phase-1 in a calibration commit.
- **SFDR phrase table** for snapshot — `SNAPSHOT_PHRASES` has no SFDR entries yet; the renderer's gap_list path skips SFDR verdicts in 1.2. Phrase table additions ship in commit 1.4.
- **SFDR remediation panel** in the renderer — band-aware "what's missing" surface lands in commit 1.4 alongside the PDF renderer.
- **Article 8.2 scope** — PB Taxonomy assessment currently covers only Activity 8.1; criterion 6 flags references to 8.2 as `partially_aligned`. Activity 8.2 KB work is a future commit, not in Phase 1.

## v0.5.0-alpha.3 — EU non-cooperative jurisdictions list refresh (Phase 1, commit 1.2.1)

Data-only refresh of `regulatory-knowledge/constants/eu_non_cooperative_jurisdictions.json` to the 17 February 2026 ECOFIN Annex I (Council document 5869/26, ECOFIN 132). The list had drifted two cycles behind (Feb 2024 → Oct 2025 → Feb 2026).

**List delta vs. v0.5.0-alpha.2:**
- Added: Russian Federation (renamed from "Russia"), Turks and Caicos Islands, Viet Nam
- Removed: Antigua and Barbuda, Fiji, Samoa, Trinidad and Tobago
- Unchanged: American Samoa, Anguilla, Guam, Palau, Panama, US Virgin Islands, Vanuatu
- Final count: 10 jurisdictions

Naming convention standardised to the official long forms used in ECOFIN documents (e.g. "Russian Federation", "Viet Nam") — these are the forms regulators, KYC vendors, and corporate structure disclosures use, so the match against developer-supplied jurisdiction strings is more reliable. "US Virgin Islands" stays in the Council document's short form (the doc itself uses that form).

**Scope confirmation (recon before changing anything):**
- Only consumer of `EU_NON_COOPERATIVE_JURISDICTIONS` in code: `src/sfdr/art8-scoring.ts` (criterion 2 Domain D, tax compliance screen). No other framework references this constant.
- No test fixture hard-codes any of the renamed/removed jurisdiction strings — `grep` for `"Russia"`, `"Antigua and Barbuda"`, etc. found only the JSON and TS counterpart themselves.

**Updated:**
- `regulatory-knowledge/constants/eu_non_cooperative_jurisdictions.json` — `annex_i` array, `source`, `source_url`, `last_verified` (2026-02-17). `$schema`, `kind`, `description`, `verification_note` unchanged.
- `src/sfdr/constants.ts` — `EU_NON_COOPERATIVE_JURISDICTIONS` Set + the header comment to reflect the new verification anchor.

**No methodology change** (stays v3.3). **No engine logic change.** **No schema change.** EU 8.1 KB hash invariant (`sha256:b3daee…d43`) unaffected. TS↔JSON parity test green. All 186 tests still pass.

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
