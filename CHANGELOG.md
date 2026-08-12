# Changelog

All notable changes to `@perennity/engine`.

## 4.0.0-alpha.1 — Framework-modular lens architecture (draft)

**Pre-release. Not published to npm — tag + changelog only.** The default
entrypoint's v3.5 output shape is UNCHANGED; this release is purely additive.
The SPA (`perennity-capital-readiness-platform`) can pin to this tag with zero
code changes and continue consuming the v3.5 surface exactly as before.

### The architecture change

One metrics core. Pluggable framework lenses. Config-driven thresholds. A
benchmark residue layer. The core knows nothing about any framework; frameworks
are adapters.

```
RunInput
  → MetricsCore.normalise() → CanonicalAssessment (framework-agnostic)
      → { EULens (SFDR 2.0), UKSDRLens (Label Fit Matrix), USSocialLicenseLens [STUB] }
          → LensVerdict[]
              → legacy adapter → v3.5-shaped FrameworkResult (SPA compatibility)
  every normalise() also → BenchmarkRecord → StorageAdapter (JSONL v1)
```

### Added

- **MetricsCore** (`@perennity/engine/v4`): `CanonicalAssessment` (framework-
  agnostic asset model, zero framework-named fields) + `normalise()` — a
  lossless map from the current input surface (data_points + typed sfdr/uk_sdr +
  entity). Community/land + grid-modularity fields present for the future US
  lens. EU Taxonomy alignment % is REUSED (not rewritten) from the existing EU
  Tax 8.1 computation.
- **Lens interface + registry**: `FrameworkLens` / `LensVerdict`; `LensRegistry`
  with failure-isolated `evaluateAll()`; contested-config → `provisional`
  confidence propagation.
- **Config layer** (`config/regulatory-thresholds.v1.json` + typed fail-fast
  loader): every SFDR 2.0 threshold, exclusion list, PAI set, and safe-harbour
  percentage. Three named contested items (safe-harbour, mandatory PAI count,
  exclusion scope). Bumping config = new file version, zero lens-code change.
- **EU SFDR 2.0 lens**: three-category eligibility ladder (Sustainable /
  Transition / ESG Basics — asset-level fundability, never categorisation),
  config-driven exclusions screen, 70% test as a fund-manager note only, PAI
  indicator layer (mandatory set from config), Taxonomy-% safe-harbour, and the
  Transition emphasis (PB teach) foregrounding an improvable asset's pathway
  with named evidence-pack gaps. Zero hardcoded numeric thresholds.
- **UK SDR lens**: FCA PS23/16 Label Fit Matrix (Focus / Improvers / Impact /
  Mixed Goals; Qualifies Now / With Roadmap / Not A Fit) re-housed as a lens,
  with an anti-greenwashing audit flag on every label row and the 70% asset-mix
  threshold as a fund-manager note. Settled-confidence (FCA regime finalised).
- **US Social License lens**: typed STUB only — `evaluate()` throws
  `LensNotImplementedError`. No scoring standard exists; a scored stub would
  fake precision.
- **Benchmark residue layer**: `BenchmarkRecord` (anonymised canonical snapshot
  + coarse region/stage + engine/config versions + per-lens headline),
  `StorageAdapter` seam with an append-only JSONL v1 impl, salted one-way
  asset-id hash. Emission is non-blocking + failure-isolated.
- **Legacy compatibility adapter**: `lensVerdictToFrameworkResult()` projects a
  lens verdict into the v3.5 `FrameworkResult` shape; structurally snapshot-
  tested against a real current SFDR result.
- **`assess()`** top-level orchestration + **`TRILOGUE_TRACKING`** metadata
  (derived from live config).
- **`@perennity/engine/v4`** subpath entrypoint; a curated subset is also
  re-exported from the default entrypoint (additive).
- `docs/DELTA-MEMO-audit.md` — Article 8/9 → SFDR 2.0 migration audit.
- `BUILD-REPORT.md` — full build report + deviations + open questions.

### Unchanged (compatibility contract)

- `DeterministicEngine`, `SnapshotRenderer`, `ReportRenderer`,
  `buildRenderContract`, `buildPAIDataFile`, `BUNDLED_ACTIVITIES`,
  `BUNDLED_SFDR_FRAMEWORKS`, `BUNDLED_UK_SDR_FRAMEWORKS`.
- `METHODOLOGY_VERSION` stays `v3.5` (the v4 lens layer is stamped `4.0-draft`
  separately via `TRILOGUE_TRACKING`, not by bumping the constant).
- The EU 8.1 knowledge-base hash invariant (`sha256:b3daee…d43`).
- All pre-existing engine output shapes and the 360 baseline tests.

### Migration notes

No action required for SPA consumers on this tag. To adopt the lens layer,
import from `@perennity/engine/v4` (or the additive named exports on the default
entrypoint) and call `assess(runInput)`. The SFDR 2.0 regime is proposal-stage
(trilogue expected Q4 2026); EU lens verdicts are correctly `provisional`.
Bump `config/regulatory-thresholds.v1.json` as the trilogue text firms up —
`v4.1` for final text, `v4.2` for delegated-act PAI lists.
