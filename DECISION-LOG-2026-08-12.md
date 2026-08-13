# Decision Log — 12 August 2026

**Decided by:** Pels (CPO/COO), founder.
**Context:** Engine v4.0 was complete on a side branch — neutral MetricsCore plus
pluggable framework lenses (EU SFDR 2.0, UK SDR, US stub), thresholds
externalised to a settings file, 419/419 tests green. Six open questions from the
build report needed founder judgment before the work could be integrated. This
log records the six decisions and why each was made.

**Executed under:** the Engine v4.0 Integration Sprint order, same date.
**Canonical copy:** `30_PB Canon` in Drive. This file is the repo copy.

---

## Decision 1 — UK SDR lens re-expression is ACCEPTED as-is

**The question.** The v4 UK SDR lens re-expresses the four-label fit decision at
canonical altitude rather than re-running the 15 existing `uk-sdr-scoring.ts`
criteria. The canonical model deliberately abstracts away the richer SFDR-shaped
inputs those scorers read, so a lens that is pure over canonical cannot call them
faithfully. Should it be rebuilt, or accepted?

**Decision.** Accepted as-is. Do not rebuild. Log a tripwire.

**Rationale.** The parts fixed by regulation — the four labels and the three fit
verdicts, both set by FCA PS23/16 — are preserved exactly. What is re-expressed
is the fit *decision*, and the legacy per-criterion scorers remain the
authoritative engine path, so nothing is lost. Rebuilding would mean widening the
canonical model specifically to serve one framework, which is the exact coupling
the lens architecture exists to avoid. The honest weak point (Impact and Mixed
Goals are approximations, and Mixed Goals has no engine framework at all) is
bounded: it only bites when UK SDR is a client's *primary* framework. That case
gets a tripwire rather than an architecture change.

**Consequence.** Tripwire A, logged in `RUNBOOK-threshold-updates.md`: any ICP 2
engagement where UK SDR is the client's primary framework must have the UK lens
wired to the detailed scorers before delivery.

---

## Decision 2 — The SPA integrates via an ADAPTER layer, not a rewrite

**The question.** Where should the SPA consume v4 — read `assess()` directly, or
project lens verdicts into the existing renderers?

**Decision.** An adapter layer. The SPA's existing rendering code does not change.

**Rationale.** The two paths answer different regulatory questions. The v4 EU lens
assesses the *proposed* SFDR 2.0 category regime; the shipping Art 8/9 scorers
assess the regime actually in force. Both are correct, and they are not
interchangeable — swapping one for the other would silently change what customers
are told they were assessed against. A rewrite would also put the highest-risk
change (customer-visible output) in the same commit as the lowest-risk one (the
engine bump), making it impossible to roll one back without the other. The
adapter keeps the display path unchanged and provably so, while making the flip
to v4 a later, deliberate product decision.

**Consequence.** `src/lib/v4Adapter.js` is the only SPA file that knows v4 exists.
User-facing equivalence is locked by test across all six target labels. Turning v4
on for customers is a surface flip, not a rewrite.

---

## Decision 3 — Benchmark records collected from day one, separate datastore

**The question.** Wire the benchmark residue layer now, or later? Where should the
salt and the sink live?

**Decision.** Collect from day one, into a separate append-only datastore. The
hashing salt lives only as a Vercel environment variable.

**Rationale.** Benchmark data is the one asset that cannot be built
retrospectively — every assessment run without emission is a row that never
exists. The cost of collecting now is small; the cost of starting in six months
is six months of permanently missing data. Separate datastore because this is
longitudinal cross-portfolio residue, not engagement data, and conflating the two
would drag client-confidentiality obligations onto an anonymised research set.

**Consequence.** Append-only Postgres table with three layers of enforcement.
Emission is on by default and requires both a resolved salt and a sink; either
missing means skip and warn, never a weakly-hashed write. Benchmark failures
never break an assessment.

---

## Decision 4 — Rules ownership sits with Pels, supported by runbook + BI watch

**The question.** Who owns updating the threshold config as the SFDR 2.0 trilogue
progresses?

**Decision.** Pels owns it. Supported by a written runbook and a BI agent watch.
The agent flags divergence; it never edits the config.

**Rationale.** Threshold changes are regulatory interpretation calls with direct
consequences for what clients are told, so they need a human owner — and at this
size that owner is the founder. But "Pels owns it" fails silently if it also
means Pels has to *notice* the change, so ownership is split from detection: the
agent watches and flags, Pels decides and edits. Making the edit a documented
10-minute job is what keeps ownership from becoming a bottleneck.

**Consequence.** `RUNBOOK-threshold-updates.md` in the engine repo. `BI-AGENT.md`
v1.1 §3a in Drive — quarterly review floor, event-driven escalation, T1 sourcing
required before any config edit is proposed.

---

## Decision 5 — Taxonomy proxy approved for FREE tier only

**The question.** `derivedAlignmentScorePercent` reuses the EU Taxonomy 8.1
`indicative_score` as the basis for the safe-harbour comparison. Is that the right
proxy, or is a dedicated capex-based alignment % required?

**Decision.** The proxy is approved for the free tier only. The paid report
requires a dedicated calculation before citing the number.

**Rationale.** The two quantities are genuinely different — `indicative_score` is
a banded criterion-satisfaction score; Taxonomy alignment % is a financial ratio
over capex, opex or turnover. They share a 0–100 range and nothing else. As an
internal screening heuristic driving a free diagnostic, the proxy is good enough
and cheap. Printed as a percentage in an £85k investor-grade deliverable it is
neither, and it would not survive technical review by an acquirer or a regulator.
Splitting the decision by tier gets the value of the proxy without the liability.

**Consequence.** Tripwire B: the paid Sustainability Readiness Report must not
cite a taxonomy alignment percentage until the dedicated calculation ships.
`SPEC-taxonomy-alignment-calc.md` drafts it; implementation is a separate order.

---

## Decision 6 — Merge to engine main this sprint; customer-facing release gated

**The question.** Merge v4.0 to `main` now, or hold until the SPA is ready?

**Decision.** Merge this sprint. Customer-facing release stays gated.

**Rationale.** The work is purely additive — zero deletions, the v3.5 default
entrypoint untouched, all 360 baseline tests preserved — so the merge risk is
close to zero while the cost of holding is real: a long-lived branch accumulates
drift and stops being reviewable. Separating "merged" from "released" is what
makes this safe: the package stays private, no version consumed by the SPA
changes, and nothing reaches a customer until the preview is reviewed. The two
decisions were being conflated; splitting them removed the reason to wait.

**Consequence.** v4.0 on `main`, 419/419 green at merge. Pre-release tag
`v4.0.0-alpha.1` intact and unpublished. Customer exposure gated behind review of
the SPA preview.

---

## Two findings added during execution

Not decisions, but they changed the work and belong in the record.

**Finding 1 — duplicated safe-harbour threshold.**
`config/regulatory-thresholds.v1.json` carried the safe-harbour value twice: the
canonical `thresholds.taxonomySafeHarbourPercent` (which drives verdicts) and a
mirrored literal read by nothing. When Parliament's 15→20 change lands, editing
one and not the other would fail silently and leave a stale number in the
settings file. **Pels' call: enforce in code rather than document.** The config
loader now fails fast on divergence.

**Finding 2 — UK lens lacks the EU lens's threshold source-scan test.**
The EU lens is guarded by a test that fails on any hardcoded numeric threshold in
executable code. The UK lens has no equivalent. Its three numeric comparisons are
structural definitions rather than calibrations, so the substance holds today —
but the guard is missing for tomorrow. Open, additive, not blocking.

---

## Status at close

| Decision | Status |
|---|---|
| 1 — UK SDR accepted as-is | Done. Tripwire A live. |
| 2 — SPA adapter | Done. Preview deployed. Awaiting review. |
| 3 — Benchmark from day one | Code done. Awaiting infra + env var. |
| 4 — Rules ownership | Done. Runbook + BI-AGENT v1.1 live. |
| 5 — Proxy free-tier only | Done. Tripwire B live. Spec filed. |
| 6 — Merge, release gated | Done. v4.0 on main, unpublished. |
