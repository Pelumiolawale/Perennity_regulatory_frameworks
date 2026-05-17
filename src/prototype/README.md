# Phase 0 archetype prototype spike

Throwaway. Branch `spike/archetype-prototype` only. Do not merge to `main`.

## What's here

- `archetype.ts` — `FrameworkArchetype` discriminated union (`activity_aligned`, `product_label`, `issuance_framework`) extending the existing `Activity` type.
- `inputs.ts` — `ProjectInput` (re-exported), `EntityInput` (new), `IssuanceInput` (new), and `InputsFor<S>` for criterion-level input-scope enforcement.
- `stub_sfdr.ts` — SFDR Article 8 stub conforming to `product_label`. PAI Consideration criterion fully stubbed; `@ts-expect-error` line demonstrates the type system rejecting an `IssuanceInput` field read.
- `stub_icma.ts` — ICMA GBP stub conforming to `issuance_framework`. Use of Proceeds criterion fully stubbed; `@ts-expect-error` line demonstrates the type system rejecting an `EntityInput` field read.
- `compat_check.ts` — type-only assertion that `BUNDLED_ACTIVITIES` (EU Taxonomy 8.1) satisfies `ActivityAlignedFramework` and `AnyFramework` without modification.

## Findings

**(a) Does the architecture extend cleanly?** Yes. The discriminated union accommodates all three archetypes; EU 8.1 backward compat preserved via optional `archetype?` on `ActivityAlignedFramework`. Build is green; baseline 112/112 tests still pass.

**(b) Awkwardness?** Three frictions: (1) `activity_aligned`'s discriminator must be optional (for legacy JSON without `archetype`), so narrowing needs a default-to-aligned step; (2) `ProductLabelFramework` / `IssuanceFramework` cannot inherit from `Activity` — too many `Activity` fields (`activity_code`, `environmental_objective`, `nace_codes`) don't apply — so they are siblings, not subclasses, and any activity-aligned-specific tooling (e.g. `aggregateVerdict`) will need an archetype-discriminating layer above; (3) the criterion-level `input_scope` widens to the archetype's full axis set when read off a `ProductLabelCriterion` annotation, so per-criterion narrower scopes need generic plumbing in real code — the spike hardcodes scopes inline at the scoring-fn site, which is fine for type-system validation but not a final pattern.

**(c) Would `activity.schema.json` need changes?** Yes for SFDR / ICMA. The schema currently requires `activity_code` and `environmental_objective` — neither fits a fund label or a bond issuance. Concrete shape change: add a root-level `archetype` enum, then use JSON Schema `oneOf` / `if-then-else` to vary required fields per archetype. Alternative: one schema file per archetype. Not modified per spike scope — flag for Phase 0.

**(d) Outputs — fit the existing allowlist?** Mostly. `HeatmapCell.framework` already accepts `SFDR` / `ICMA_GBP` (both are in the `Framework` enum). But row semantics differ — "SFDR Article 8 eligibility: pass" is not the same statement as "EU Taxonomy 8.1 alignment: pass" — so the renderer needs an optional `archetype` discriminator on `HeatmapCell` to label rows correctly. `PUESummary` stays as a special-case optional alongside future archetype-specific summary blocks. The Snapshot allowlist gate logic (`src/renderers/__tests__/snapshot.gate.test.ts`) is unaffected: the gate enforces *absence* of disallowed keys, and archetype labels are not sensitive.

**(e) Authority levels?** The `1 | 2 | 3` axis (Regulatory / Perennity Bridge methodology / Informational) maps cleanly to `product_label` and `issuance_framework`. SFDR PAI / ICMA UoP categories sit at level 1; any Perennity-derived benchmarks would sit at level 2. No new axis needed.

**(f) Phase 0 plan recommendations.** Sequence in: (i) JSON Schema variant for SFDR / ICMA before any new framework JSON is added; (ii) `HeatmapCell` archetype discriminator coordinated with the app repo (consumer of `SnapshotOutput`) — minor semver bump; (iii) `LogicInput` (`src/logic/types.ts`) extension to optionally carry `entity` and `issuance` alongside `project`, and the `Engine.run` signature to accept `AnyFramework[]` rather than `Activity[]`.

**(g) Go / no-go.** **GO.** The TS type system expresses all three archetypes without modifying `engine.ts` and without breaking EU Taxonomy 8.1 backward compat. The frictions in (b) are solvable within the Phase 0 plan as currently scoped; the schema / output-shape work in (c) and (d) needs to be sequenced explicitly into Phase 0 before any production SFDR / ICMA JSON is added.
