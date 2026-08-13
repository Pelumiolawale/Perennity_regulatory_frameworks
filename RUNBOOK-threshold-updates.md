# Runbook — Updating a Regulatory Threshold

**Owner:** Pels. **Target time: 10 minutes.** If it is taking longer than that,
something is wrong with the runbook — fix the runbook, not just the threshold.

*Decision 4: rules ownership sits with Pels, supported by this runbook plus BI
agent watch.*

---

## When you run this

A threshold moved in the real world and the engine needs to agree with it. Most
commonly: a trilogue outcome changes a SFDR 2.0 number, or a Commission
delegated act publishes the PAI list.

You do **not** run this to change PB methodology calibrations — those are a
methodology version bump, not a config edit, and they touch `methodology.md`.

---

## The 10-minute job

```bash
cd /Users/pels/Developer/Perennity_regulatory_frameworks
export PATH="$HOME/.local/share/fnm/node-versions/v24.19.0/installation/bin:$PATH"
git checkout main && git pull
git checkout -b config/<what-changed>-$(date +%Y%m%d)
```

### 1. Edit `config/regulatory-thresholds.v1.json` (~3 min)

Every threshold entry has the same five fields. Update **all** of them, not just
`value` — a number without a fresh source and date is unauditable:

```json
"taxonomySafeHarbourPercent": {
  "value": 20,                      ← the new number
  "source": "...",                  ← what changed it. Cite the instrument.
  "status": "settled",              ← "contested" -> "settled" once adopted
  "lastReviewed": "2026-08-13",     ← today
  "notes": "..."                    ← what moved, and what is still open
}
```

Also update the top-level `lastReviewed` and, if the regime status changed,
`source`.

> ⚠️ **The safe-harbour number lives in two places.** `thresholds.taxonomySafeHarbourPercent.value`
> is the load-bearing one, but `categories.sustainable.requiresAlignmentScoreAtOrAbovePercent`
> mirrors it. **Change both.** Since Task 5 the loader fails fast if they
> diverge, so you cannot ship the mistake — but you can waste five minutes
> confused by the error if you don't know why it's there. That's this warning.

**`status` is a real signal, not decoration.** `contested` propagates through the
engine: it downgrades lens confidence to `provisional` and softens the headline.
Flipping to `settled` on an adopted item is how the engine stops hedging. Do not
flip it early — a `settled` label on a trilogue-stage number is the kind of thing
an acquirer's technical reviewer finds.

### 2. Re-run the tests (~2 min)

```bash
npm test        # expect 438 pass / 0 fail
```

**Some tests are expected to fail after a real threshold change**, and that is
the system working. Test fixtures encode verdicts at specific thresholds; move
the threshold and a fixture that sat just above the line now sits below it.

For each failure, decide which it is:

| Failure looks like | It means | Do |
|---|---|---|
| A fixture verdict flipped band | The threshold change genuinely changes that case | Update the fixture's expectation. Say why in the commit. |
| "must agree — the ref is the load-bearing one" | You edited one of the mirrored values, not both | Go back to step 1. |
| `ConfigValidationError` on load | Malformed edit — missing field, wrong type | Fix the JSON. |
| A source-scan test fails | Someone hardcoded a number in lens logic | **Stop.** That is a real defect, not a fixture update. |

Never edit a test to make it pass without understanding which of these it is.

### 3. Tag the change (~2 min)

```bash
git add config/ src/
git commit -m "config(thresholds): <what moved> <old> -> <new>

Source: <instrument + date>
Status: contested -> settled | still contested
Fixtures updated: <which, and why the verdict legitimately changed>"

git checkout main && git merge --no-ff config/<branch>
git tag -a config-v1.<n> -m "<what moved>, <date>"
```

The `config-v1.<n>` tag is what makes an assessment replayable: any past run can
be reproduced against the config in force at the time. Do not skip it.

### 4. Log it (~2 min)

One record in the **Airtable Agent Log** (`Pels OS — Agent State`):
Agent `business-intelligence`, Type `log`, Headline `Threshold updated: <what>`,
Detail with old value, new value, source, and which fixtures moved.

Then append a line to `CHANGELOG.md`.

### 5. If the SPA needs it

Only when a customer-facing number changes. Bump the SPA's engine pin, deploy a
preview, eyeball the affected report section, then merge. **A threshold change
never goes straight to production.**

---

## Tripwires

Standing conditions that must be checked before delivery. Both were logged
2026-08-12 as part of the Engine v4.0 integration sprint.

### 🔴 Tripwire A — UK SDR as a client's primary framework

**Condition:** any ICP 2 engagement where **UK SDR is the client's primary
framework**.

**Action:** wire the UK lens to the detailed scorers **before delivery**.

**Why:** the v4 UK SDR lens re-expresses the four-label fit decision at canonical
altitude rather than re-running the 15 legacy `uk-sdr-scoring.ts` criteria (build
report deviation D4). The four labels and three fit verdicts are preserved
exactly — both are fixed by FCA PS23/16 — but **Sustainability Impact** and
**Sustainability Mixed Goals** are approximations from canonical signals, and
Mixed Goals has no engine framework behind it at all.

That is fine when UK SDR is a secondary lens on an EU-primary engagement. It is
not fine when the client's whole question *is* the UK SDR label, because a
re-expressed fit decision is thinner than per-criterion scoring and will not hold
up if the client challenges the label call.

**This is a known, accepted state** (Decision 1: the re-expression is accepted
as-is; do not rebuild it). The tripwire exists so that acceptance stays
deliberate rather than becoming an accident on the one engagement where it bites.

**Check at:** engagement intake, Stage 0, when Target Label is set.

### 🔴 Tripwire B — taxonomy alignment % in the paid report

**Condition:** the paid **Sustainability Readiness Report** is about to cite a
taxonomy alignment percentage.

**Action:** **do not cite the number** until the dedicated calculation from
`SPEC-taxonomy-alignment-calc.md` is implemented and shipped.

**Why:** `derivedAlignmentScorePercent` currently reuses the EU Taxonomy 8.1
`indicative_score` — a banded criterion-satisfaction score. Taxonomy alignment %
is a capex/opex/turnover ratio. They are different quantities that happen to
share a 0–100 range. The proxy is good enough to drive a free-tier safe-harbour
comparison; it is **not** good enough to print as a percentage in an £85k
investor-grade deliverable, and it would not survive technical review by an
acquirer or a regulator.

**This is a known, accepted state** (Decision 5: proxy approved for FREE tier
only). Task 6 drafts the real calculation; implementation is a separate order.

**Check at:** Stage 5 issuance QA, alongside the existing conservative-framing
spot-check.

---

## What the BI agent watches for you

Per `BI-AGENT.md` §3a. You do not have to monitor the trilogue yourself — the
agent flags divergence between live draft thresholds and this config file, on a
quarterly floor with event-driven escalation. When it flags one, you run this
runbook.

---

## Changelog

- **2026-08-12 — v1.0.** Created under the Engine v4.0 integration sprint
  (Task 5). Mirrored-threshold loader guard added the same day, so the
  divergence hazard is enforced rather than merely documented.
