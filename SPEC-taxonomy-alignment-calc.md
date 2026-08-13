# SPEC — Dedicated EU Taxonomy Alignment Calculation

**Status:** DRAFT — for founder review. **Not implemented.** Implementation is a
separate order.
**Raised by:** Engine v4.0 review pack, judgment call D3 (FLAG).
**Decision context:** Decision 5 (12 Aug 2026) — the current proxy is approved
for the **free tier only**; the paid report requires this calculation before it
may cite a taxonomy alignment number.
**Blocks:** Tripwire B in `RUNBOOK-threshold-updates.md`.

---

## 1. Why this exists

### The problem in one paragraph

`derivedAlignmentScorePercent` — the field the EU lens compares against the
safe-harbour threshold — is currently populated by reusing the EU Taxonomy 8.1
`indicative_score` from the legacy engine. That score is a **banded
criterion-satisfaction score**: it measures how well the asset satisfies the
substantial-contribution, DNSH and safeguards criteria. **EU Taxonomy alignment
%** is something else entirely: it is a **financial ratio** — the proportion of
turnover, capex or opex associated with Taxonomy-aligned economic activities,
per the Article 8 Disclosures Delegated Act (EU) 2021/2178.

The two quantities share a 0–100 range and nothing else. Using one where the
regulation means the other is defensible as an internal screening heuristic. It
is not defensible printed as a percentage in an £85k investor-grade deliverable,
and it would not survive technical review by an acquirer or a regulator.

### What "good" looks like

A number we can put in front of a fund manager who will feed it into their own
Article 8 disclosure, with the denominator, the boundary, and the evidence
stated on the face of it. If the FMP cannot reconcile our number to their own
KPI methodology, the number is worse than useless — it is a liability.

### Explicit non-goal

This calculation does **not** replace the existing 8.1 criterion scoring. The
`indicative_score` remains exactly what it is and stays useful for what it was
built for: driving the gap analysis and the heatmap. This spec adds a *second,
differently-defined* number alongside it. **Zero deletions.**

---

## 2. Scope decision: which KPI, and whose

This is the first thing to settle, because everything downstream depends on it.

The Disclosures Delegated Act defines three KPIs for non-financial
undertakings — **turnover**, **capex**, **opex** — each as
`aligned / total`. PB does not assess undertakings; PB assesses **assets**
(one data centre, or one multi-building site under common ownership — the site
boundary rule from methodology v3.4).

**Recommendation: capex-based, asset-scoped.**

| KPI | Fit for PB | Verdict |
|---|---|---|
| **Capex** | A DC under development *is* a capex programme. The FMP's investment decision is a capex decision. Maps directly onto the Art 8 capex KPI, which is also the KPI the Taxonomy uses for assets on a path to alignment. | ✅ **Primary** |
| **Turnover** | Meaningless pre-operational; for operational assets it is colocation/lease revenue, which is a property question rather than a Taxonomy-activity question. | ⚠️ Secondary, operational assets only |
| **Opex** | Narrowly defined in the DA (maintenance, short-term lease, R&D). Small, noisy, and rarely decision-relevant for a DC. | ❌ Out of scope v1 |

**Open question for Pels (Q1):** do we emit a turnover KPI at all for
operational assets, or is capex-only a cleaner, more defensible v1? My
recommendation is **capex-only for v1**, with turnover explicitly reported as
"not calculated" rather than silently absent.

---

## 3. Inputs required

Everything below is **new intake**. None of it exists in the current
`ProjectInput`. This is the honest cost of the calculation: it is not a
computation over data we already hold.

### 3.1 Capex boundary (required)

| Field | Type | Notes |
|---|---|---|
| `totalCapex` | `{ amount: number; currency: string }` | Denominator. Total capex for the asset within the assessment boundary. |
| `capexBasis` | `"committed" \| "incurred_to_date" \| "full_programme"` | **Load-bearing.** Three different denominators give three different percentages. Must be stated on the output. |
| `capexPeriod` | `{ from: string; to: string }` | ISO dates. The DA KPIs are period-scoped. |
| `assessmentBoundary` | `"single_asset" \| "multi_building_site"` | Mirrors the v3.4 site-boundary rule. |
| `capexLineItems` | `CapexLineItem[]` | See below. The heart of the calculation. |

```
CapexLineItem {
  id: string
  description: string
  amount: { amount: number; currency: string }
  category: "it_equipment" | "electrical" | "mechanical_cooling"
          | "building_shell" | "land" | "grid_connection"
          | "onsite_generation" | "water_infrastructure"
          | "software" | "other"
  activityRef: string | null      // e.g. "eu_tax_climate_8_1"; null = not claimed
  evidenceRefs: string[]          // documents supporting the classification
}
```

**Why line items rather than a single pre-computed aligned figure:** if the
client hands us one number we are attesting to their arithmetic, not performing
a calculation. Line-item classification is the work, and it is what makes the
output auditable. It is also the part that will take an analyst a day, and the
spec should not pretend otherwise.

### 3.2 Currency handling (required)

| Field | Type | Notes |
|---|---|---|
| `reportingCurrency` | `string` | ISO 4217. |
| `fxRates` | `Record<string, number>` | Rate to reporting currency, per source currency. |
| `fxRateDate` | `string` | ISO date. Stamped on output for replay. |

FX rates are **supplied, never fetched.** The engine is deterministic: same
input + same KB hash = bit-identical output. A live FX lookup breaks that, and
audit replay of a past engagement must reproduce the rate in force then.

### 3.3 Alignment determinants (required — these gate everything)

These already exist in the engine in some form. The calculation **reuses** the
existing scoring rather than re-deriving it:

| Determinant | Source | Effect |
|---|---|---|
| Substantial contribution (8.1 TSC) | existing `sc_8_1_*` logic | Per-activity gate |
| DNSH (all five other objectives) | existing `dnsh_8_1_*` logic | **Hard gate — any fail ⇒ 0%** |
| Minimum safeguards (Art 18) | existing `minimum_safeguards_rollup` | **Hard gate — fail ⇒ 0%** |

**This is the most important design rule in the spec.** Taxonomy alignment is
not a weighted average that degrades gracefully. It is conjunctive: fail DNSH or
safeguards and the aligned proportion is **zero**, not "reduced". A calculation
that produces 60% for an asset failing DNSH is not conservative-but-wrong; it is
categorically wrong, and it is the single most likely way this feature ships a
defect.

### 3.4 Optional — CapEx Plan (Taxonomy-eligible-but-not-yet-aligned)

Article 8 permits capex counting toward alignment under a **CapEx Plan**: capex
that will bring an activity into alignment within 5 years (extendable to 10 with
justification).

| Field | Type | Notes |
|---|---|---|
| `capexPlan.present` | `boolean` | |
| `capexPlan.horizonYears` | `number` | ≤5, or ≤10 with justification |
| `capexPlan.boardApproved` | `boolean` | |
| `capexPlan.justification` | `string \| null` | Required when horizon >5 |
| `capexPlan.coveredLineItemIds` | `string[]` | |

**Open question for Pels (Q2):** does v1 support CapEx Plans, or report them
separately as "eligible, plan-covered" without folding into the headline aligned
%? **Recommendation: report separately in v1.** Folding plan capex into a
headline percentage is where Taxonomy reporting gets most aggressively gamed in
the market, and PB's positioning is conservatism.

---

## 4. Calculation logic

### 4.1 Sequence

```
1. VALIDATE
   - line items sum to totalCapex (within tolerance) — else fail loudly
   - every currency present in fxRates
   - capexBasis and capexPeriod present
   -> ValidationError, not a silent default

2. GATE — evaluate hard gates ONCE for the asset
   - minimum safeguards pass?           if no -> aligned = 0, halt, reason
   - DNSH pass for all five objectives? if no -> aligned = 0, halt, reason
   - substantial contribution (8.1)?    if no -> aligned = 0, halt, reason
   These are asset-level, not per-line-item.

3. NORMALISE
   - convert every line item to reportingCurrency at fxRates
   - stamp fxRateDate

4. CLASSIFY each line item
   - eligible:   activityRef != null and resolves to a known activity
   - aligned:    eligible AND the step-2 gates passed
   - not_eligible: activityRef == null
   NOTE: land acquisition and non-activity building shell are typically
   NOT eligible under 8.1. See §4.3 — this needs a regulatory ruling.

5. AGGREGATE
   alignedCapex   = sum(amount) where classification == "aligned"
   eligibleCapex  = sum(amount) where classification in {aligned, eligible}
   alignmentPercent = alignedCapex / totalCapex * 100
   eligiblePercent  = eligibleCapex / totalCapex * 100

6. ROUND — one decimal place, half-up, at the LAST step only.
```

### 4.2 Both numbers, always

Emit **eligible %** alongside **aligned %**. They are different regulatory
concepts (eligible = the activity is in the Taxonomy; aligned = it also meets
TSC + DNSH + safeguards), FMPs report both, and an asset can legitimately be
100% eligible and 0% aligned. Reporting only the aligned figure invites the
reader to infer the wrong denominator.

### 4.3 Open regulatory questions (need a ruling before implementation)

**Q3 — Land and building shell.** Activity 8.1 is *"Data processing, hosting and
related activities"*. Is the capex on land and non-technical building shell part
of the aligned activity, or outside it? This materially moves the number: shell
and land can be 30–40% of a DC programme. My reading is that capex must be
"related to" the aligned activity, which pulls in purpose-built shell but likely
excludes land — **but this needs a regulatory determination, not my reading.**

**Q4 — Grid connection and on-site generation.** Potentially aligned under a
*different* activity (e.g. 4.x electricity). Does PB assess multi-activity
alignment, or scope strictly to 8.1 and mark the rest not-eligible? **Scoping to
8.1 only is more conservative and much cheaper**, at the cost of understating
alignment for assets with large on-site renewable capex.

**Q5 — Partial-period capex.** When `capexPeriod` covers part of a multi-year
programme, is the denominator period capex or full-programme capex? The DA says
period. Clients will want full-programme because it flatters. `capexBasis` on
the output exists so the choice is visible rather than assumed.

---

## 5. Output format

```
TaxonomyAlignmentResult {
  schemaVersion: "1.0.0"

  // Headline
  alignmentPercent: number | null      // null when not calculable
  eligiblePercent: number | null

  // The provenance that makes the number citable
  kpi: "capex"
  capexBasis: "committed" | "incurred_to_date" | "full_programme"
  capexPeriod: { from: string; to: string }
  assessmentBoundary: "single_asset" | "multi_building_site"
  reportingCurrency: string
  fxRateDate: string
  activitiesAssessed: string[]         // e.g. ["eu_tax_climate_8_1"]

  // Amounts
  totalCapex: number
  alignedCapex: number
  eligibleCapex: number

  // Gates — WHY the number is what it is
  gates: {
    substantialContribution: GateResult
    dnsh: GateResult
    minimumSafeguards: GateResult
  }

  // Auditability
  lineItemClassifications: {
    id: string
    classification: "aligned" | "eligible" | "not_eligible"
    reason: string
    evidenceRefs: string[]
  }[]

  capexPlan: { present: boolean; planCoveredCapex: number;
               planCoveredPercent: number; horizonYears: number | null } | null

  methodologyVersion: string
  calculationVersion: "taxonomy-alignment-v1"
  notCalculableReason: string | null   // populated iff alignmentPercent is null
}

GateResult { passed: boolean; verdict: string; rationale: string;
             evidenceRefs: string[] }
```

### Entitlement

**Paid tier only.** The whole point of Decision 5 is that the free tier keeps the
proxy and the paid report gets the real number. `alignmentPercent` and every
supporting field must be **excluded from the `SnapshotOutput` allowlist** and
added to `DISALLOWED_KEYS` in `snapshot.gate.test.ts` — atomically with the type,
per the standing rule in `CLAUDE.md`.

### `null` is a first-class outcome

When inputs are insufficient, `alignmentPercent` is `null` with a populated
`notCalculableReason`. **It is never 0, and never a fallback to the proxy.** 0%
means "we calculated it and the asset is not aligned" — a substantive finding.
`null` means "we could not calculate it". Conflating them is how a data gap
becomes a defamatory finding.

---

## 6. Test cases

Minimum set. Every one is a regression risk.

### Gates (the highest-value tests)

| # | Scenario | Expected |
|---|---|---|
| 1 | DNSH fails on one objective, everything else perfect | `alignmentPercent: 0`, gate rationale names the objective |
| 2 | Minimum safeguards fail | `alignmentPercent: 0` |
| 3 | Substantial contribution fails | `alignmentPercent: 0` |
| 4 | All gates pass, all capex classified aligned | `100.0` |
| 5 | All gates pass, 60% of capex classified aligned | `60.0` |

### Classification

| # | Scenario | Expected |
|---|---|---|
| 6 | Land excluded, shell included (per Q3 ruling) | Matches ruling; reason string states it |
| 7 | Grid-connection capex with no 8.1 activityRef | `not_eligible`, excluded from numerator |
| 8 | Eligible but gates failed | `eligiblePercent > 0`, `alignmentPercent = 0` |

### Arithmetic and determinism

| # | Scenario | Expected |
|---|---|---|
| 9 | Line items don't sum to `totalCapex` | `ValidationError` — never a silent reconcile |
| 10 | Multi-currency at supplied FX | Correct conversion; `fxRateDate` stamped |
| 11 | Same input twice | Bit-identical output |
| 12 | Rounding: 66.666…% | `66.7`, rounded once at the end |

### Insufficiency

| # | Scenario | Expected |
|---|---|---|
| 13 | No capex line items | `null` + `notCalculableReason`, **not 0** |
| 14 | Missing FX rate for a present currency | `ValidationError` |
| 15 | Gates indeterminate (insufficient evidence) | `null`, not 0 |

### Entitlement (structural, non-negotiable)

| # | Scenario | Expected |
|---|---|---|
| 16 | Free snapshot rendered from a run containing a result | No alignment field anywhere in output |
| 17 | Magic-marker plant in every alignment field | No marker in snapshot |
| 18 | Content-walk for `\d+(\.\d+)?%` in free-tier `rationale_text` | No leak (extends the v0.6.2 regex walk) |

### Proxy separation

| # | Scenario | Expected |
|---|---|---|
| 19 | Both proxy and real calc present, disagreeing | Both retained, distinctly named; nothing silently overwritten |
| 20 | `derivedAlignmentScorePercent` still drives the free-tier safe-harbour comparison | Unchanged — no regression in the free path |

Test 20 is the no-deletions guarantee in test form.

---

## 7. What this does NOT change

- The EU lens's free-tier safe-harbour comparison keeps using
  `derivedAlignmentScorePercent`. Unchanged.
- `indicative_score` and all existing 8.1 criterion scoring. Unchanged.
- Every existing test. This is purely additive.

---

## 8. Decisions needed before implementation

| # | Question | Recommendation |
|---|---|---|
| Q1 | Turnover KPI for operational assets, or capex-only v1? | **Capex-only**, turnover explicitly "not calculated" |
| Q2 | Fold CapEx Plan capex into the headline %? | **No** — report separately in v1 |
| Q3 | Are land and building shell inside the aligned activity? | **Needs a regulatory determination.** Materially moves the number |
| Q4 | Multi-activity (grid, on-site generation), or 8.1 only? | **8.1 only** for v1 — conservative and much cheaper |
| Q5 | Denominator: period capex or full programme? | **Period**, per the DA; `capexBasis` makes it visible |

**Q3 is the one that needs an actual regulatory opinion rather than a product
decision.** The other four are scope calls Pels can make directly.

### Rough effort, once Q1–Q5 are settled

New intake shape and validation is the bulk of it; the gate logic reuses what
already exists. The line-item classification workflow — analyst-facing, one
engagement at a time — is the part most likely to be underestimated, and it is
delivery cost, not engine cost.

---

## 9. Filing

Spec only. Nothing implemented. Implementation is a separate order after Q1–Q5
are answered.

Until it ships, **Tripwire B stands**: the paid Sustainability Readiness Report
must not cite a taxonomy alignment percentage.
