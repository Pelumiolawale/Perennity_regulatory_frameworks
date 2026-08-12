# Delta Memo — Article 8/9 → SFDR 2.0 category migration audit

**Status:** Step 0 deliverable for the Engine v4.0 framework-modular build.
**Author:** autonomous overnight build session (Engine v4.0-draft).
**Date basis:** 2026-08-12.
**Drives:** Module 3 (EU SFDR 2.0 lens) migration decisions.

---

## Purpose

The v4.0 spec assumed an "Article 8/9 Delta Memo" already existed. It did not
(confirmed by repo search). This document produces it: an audit of every place
in the engine where the **current** methodology keys off SFDR **Article 8 / Article 9**
logic and the **`sustainable investment` (Art 2(17)) definition** that the SFDR 2.0
proposal (COM(2025) 841, 20 Nov 2025) **deletes**.

Each touchpoint is assigned a migration disposition:

- **(a) re-express** — the concept moves into the SFDR 2.0 **category module** (EU lens).
- **(b) retain-legacy** — the logic stays exactly where it is, reachable **only** through
  the v3.5 legacy path (the existing `DeterministicEngine` + `src/sfdr/` scorers +
  renderers + `renderContract`), which the SPA consumes unchanged.
- **(c) delete** — orphaned logic removed with a comment noting why.

---

## Load-bearing reconciliation (read this first)

The spec's Module 3 migration language ("no orphaned Article 8/9 logic outside the
legacy adapter"; "deleted with a comment noting why") was written against an
assumption that the **lens replaces the engine**. The v4.0 HARD GUARDRAIL contradicts
that assumption:

> Do NOT break the v3.5 output shape on the package's default entrypoint (SPA
> compatibility contract).

The SPA (`perennity-capital-readiness-platform`) pins this repo at `#main` and consumes
the Article 8/9 SFDR scorers **today**, through `Engine.run` → `FrameworkResult` →
`buildRenderContract` / `SnapshotRenderer` / `ReportRenderer` /
`BUNDLED_SFDR_FRAMEWORKS`. Deleting or rewriting the Article 8/9 scorers would break
that contract on the default entrypoint.

**Therefore the migration is additive, not destructive.** The entire existing Article
8/9 scoring surface is dispositioned **(b) retain-legacy**: it becomes "the legacy path"
in the v4.0 two-layer model (MetricsCore → lenses → legacy adapter → v3.5 shape). The
SFDR 2.0 **categories** are dispositioned **(a) re-express** in the new EU lens, which
reads the framework-agnostic `CanonicalAssessment` and never re-runs the Article 8/9
scorers. **No Article 8/9 logic is deleted** (disposition (c) is used for zero
touchpoints), because every piece of it is still load-bearing for the SPA compatibility
contract until Pels chooses to migrate the SPA off it.

This is a deliberate deviation from the literal Module 3 wording and is recorded again
in `BUILD-REPORT.md`. It is the only reading consistent with the guardrail.

The v4.0 EU lens is the **teach** layer: it takes the same canonical metrics and
re-expresses them under the three SFDR 2.0 categories (Sustainable / Transition / ESG
Basics), foregrounding the **Transition** pathway — which the dossier (§1.4) identifies
as purpose-built for non-European DC developers. The legacy Article 8/9 verdicts remain
available for any consumer that still needs the v1 regime view.

---

## Touchpoint inventory

Search basis: `grep -rniE 'article[ _-]?[89]|sustainable[ _]invest|si_objective|si_eligibility|art_?2_?17|2\(17\)'` over `src/` and `regulatory-knowledge/`.

### A. Article 8 scoring (7 criteria) — `src/sfdr/art8-scoring.ts`

| Concept | Where | SFDR 2.0 analogue | Disposition |
|---|---|---|---|
| c1 E/S characteristics promotion | `art8_c1_es_characteristics` | Category positive-contribution test (ESG Basics floor; Sustainable if quantified+material) | (b) retain-legacy + (a) re-express as category **contribution profile** |
| c2 Good governance | `art8_c2_good_governance` | Folded into every category's criteria (2.0 deletes the standalone SI good-governance gate but keeps governance screens) | (b) retain-legacy + (a) re-express as **exclusions/governance screen** |
| c3 PAI consideration policy | `art8_c3_pai_policy` | **PAI indicator layer** (2.0 keeps PAI, contested voluntary vs min-3 vs mandatory) | (b) retain-legacy + (a) re-express in EU lens **PAI layer** |
| c4 DNSH assessment | `art8_c4_dnsh` | DNSH folded into category criteria (2.0 deletes standalone SI-DNSH but retains per-category no-harm) | (b) retain-legacy + (a) re-express as **no-harm screen** feeding category gates |
| c5 Pre-contractual disclosure | `art8_c5_pre_contractual` | Template regime is FMP/product-level; not asset-level in 2.0 category ladder | (b) retain-legacy only (fund-level; out of asset-lens scope) |
| c6 Taxonomy alignment disclosure | `art8_c6_taxonomy` | **Taxonomy % safe-harbour** (15%→20% contested) | (b) retain-legacy + (a) re-express as **safe-harbour finding** |
| c7 Periodic reporting commitment | `art8_c7_periodic_reporting` | Disclosure/reporting; product-level in 2.0 | (b) retain-legacy only |

### B. Article 9 scoring (3 criteria) + the deleted SI definition — `src/sfdr/art9-scoring.ts`

The SFDR 2.0 proposal **deletes the `sustainable investment` (Art 2(17)) definition**
and folds DNSH + good-governance into the **category** criteria. Article 9 becomes the
new **Sustainable** category (voluntary). Every Article 9 touchpoint below keys off the
deleted SI definition.

| Concept | Where | SFDR 2.0 analogue | Disposition |
|---|---|---|---|
| c8 SI objective qualification (`si_objective`, dominance test, Art 2(17) mapping) | `art9_c8_si_objective_qualification` | **Sustainable category** positive-contribution + **Transition** credible-pathway test | (b) retain-legacy + (a) re-express: the dominance/objective test informs Sustainable-fundability; a failing-but-improvable asset routes to **Transition** |
| c9 SI-eligibility evidence pack (5 components, cascade from c8/c4/c2) | `art9_c9_si_eligibility_evidence_pack` | Category **evidence pack gaps** (2.0: evidence, not the SI label) | (b) retain-legacy + (a) re-express as EU lens **EvidenceGap[]** |
| c10 Project PAI data provision | `art9_c10_project_pai_data_provision` | **PAI indicator layer** (data-provision status per indicator) | (b) retain-legacy + (a) re-express in EU lens PAI layer |
| Art 2(17) SI definition itself (the 90% positioning principle, DNSH + good-governance gates) | methodology preamble (`methodology.md` Framing 2) + cascade edges in c9 | **DELETED** by 2.0; DNSH + good-governance move into category criteria; no SI floor | (a) re-express: the EU lens has **no SI definition**. Category gates replace it. Legacy path keeps the v1 90%-principle framing. |

### C. Framework wiring / plumbing (retain-legacy, untouched)

These carry the Article 8/9 strings but are pure routing/labelling for the v1 regime.
All **(b) retain-legacy**, untouched by v4.0:

- `src/sfdr/registry.ts` — `sfdr_v1_*` criterion_id → scoring-fn map.
- `src/sfdr/orchestration.ts` — topo-sort + dispatch (also reused by UK SDR; untouched).
- `src/sfdr/types.ts` — Art 9 input shapes (`ProjectArt9Inputs`, `SIObjective`, …).
- `src/lib/renderContract.ts` — `sfdr_v1_article_8` / `_9` / `_8_and_9` render labels.
- `src/lib/bundledSFDRFrameworks.ts` — `BUNDLED_SFDR_FRAMEWORKS.sfdr_v1_article_8/9`.
- `src/labels.ts` — KB `label_id` ↔ public `SupportedLabel` bridge.
- `src/renderers/filterCells.ts` — `sfdr_v1_article_8` / `_9` snapshot scoping.
- `regulatory-knowledge/frameworks/sfdr/v1/art-8.json`, `art-9.json` + the 10
  `regulatory-knowledge/criteria/sfdr-v1/*.json` — the v1 KB. Untouched (hash-stable).

### D. Config-driven SFDR 2.0 concepts (new; live in config, NOT lens code)

The 2.0 concepts that replace the deleted SI regime are **thresholds/lists**, so per the
guardrail ("Do not hardcode SFDR 2.0 numeric thresholds in lens logic (config only)")
they live in `config/regulatory-thresholds.v1.json`:

- Three category exclusion lists (Sustainable / Transition / ESG Basics).
- 70% portfolio positive-contribution threshold (general).
- Taxonomy safe-harbour % (15% Commission baseline; **contested** — Parliament 20%).
- Mandatory PAI set + count (**contested** — voluntary vs min-3 vs fully-mandatory).
- ESG Basics bottom-20% screen (**contested** — Parliament position).

---

## Migration checklist for Module 3 (EU lens)

Every Article 8/9 touchpoint above is either re-expressed in the category module (a) or
retained solely in the legacy path (b). Zero deletions (c) — see reconciliation.

- [x] Sustainable category ← re-express c1 (quantified+material contribution) + c4 no-harm + c6 taxonomy% ≥ safe-harbour + verification.
- [x] Transition category ← re-express the "failing-but-improvable" route: credible roadmap (capex-linked + dated + board-approved) foregrounded with evidence-pack gaps (re-expresses c8 objective + c9 evidence pack as gaps).
- [x] ESG Basics category ← re-express c1 floor + optional bottom-20% screen (config).
- [x] Exclusions screen per category ← config lists (re-expresses c2 governance + c4 harm screens as exclusion checks).
- [x] PAI indicator layer ← re-express c3 + c10 (per-indicator disclosed/partial/absent; mandatory set from config).
- [x] Taxonomy % safe-harbour ← reuse the existing EU Taxonomy 8.1 computation (`indicative_score`), compared to config safe-harbour threshold.
- [x] No SI definition in the lens ← Art 2(17) is deleted; category gates replace it.
- [x] Legacy Article 8/9 verdicts remain reachable (retain-legacy) for the SPA.
