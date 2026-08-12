# Engine v4.0 — Pre-Merge Review Pack

**Prepared for:** Pels (CPO/COO) — merge approval gate
**Branch under review:** `feat/engine-v4-lens-architecture` @ `ecca6ba`
**Target:** `main` @ `e8d1494` (v0.6.2)
**Tag on branch head:** `v4.0.0-alpha.1` (pre-release, unpublished)
**Date:** 2026-08-12

---

## The ask

Read section 1 (the eight judgment calls) and section 3 (the two findings this review adds
beyond the build report). Then approve or withhold merge. Everything else is evidence.

**Six of eight judgment calls are PASS. Two are FLAG** — both already covered by decisions
you have made, and both are tripwired rather than blocking. **Two additional findings** surfaced
during this review that are not in the build report; neither blocks merge, one changes what the
Task 5 runbook must say.

---

## 1. The eight judgment calls

Each of these is a place the overnight build deviated from the written spec and decided for
itself. Verdicts: **PASS** = the call was right, no action. **FLAG** = the call is defensible but
carries a live risk that needs an owner.

### D1 — Did not invoke the interactive plan-mode gate — **PASS**

The spec said "start in plan mode." Plan mode requires a human to approve exiting it; in an
overnight session there was no human, so honouring it literally would have deadlocked the build
at step zero. The agent interpreted the intent (plan thoroughly, write the plan down first) and
delivered the Step-0 Delta Memo plus a 9-step task list before writing code.

**Risk:** low, but real and non-obvious — it means ~2,900 lines of new architecture were written
with no human checkpoint between spec and code. The mitigation is this review pack and the gate
it feeds. There is no code risk; the risk was procedural and is now closed.

**Verdict: PASS.**

### D2 — Additive migration (retain-legacy), not destructive — **PASS**

The spec's migration language implied the new lens *replaces* the Article 8/9 scoring path. The
standing no-deletions rule and the guardrail against breaking the v3.5 entrypoint forbid that.
The build dispositioned every Art 8/9 touchpoint as **retain-legacy**: the old scorers stay
exactly where they are and stay authoritative, while SFDR 2.0 categories are re-expressed in the
new EU lens alongside them.

This is the single most load-bearing call in the build, and it is the correct one. Verified:
**zero files deleted, zero files renamed** between `main` and the branch.

**Risk:** dual-path divergence over time. There are now two live expressions of SFDR logic — the
legacy Art 8/9 scorers and the v4 EU lens — and nothing forces them to agree, because they
answer different regulatory questions (current SFDR vs. proposed SFDR 2.0). That is correct
today and will stay correct until SFDR 2.0 is adopted. At adoption, one of them has to be
retired, and that decision needs an owner. Not a merge blocker; a roadmap item.

**Verdict: PASS.**

### D3 — Taxonomy % is a neutrally-named canonical field reusing the EU Tax 8.1 score — **FLAG**

Module 1 forbade framework-named canonical fields; Module 3 required a reused Taxonomy %. The
build resolved the collision by naming the field `derivedAlignmentScorePercent` and populating
it from the existing EU Taxonomy 8.1 `indicative_score` — a 0–100 banded SC+DNSH+safeguards
score — used as the basis for the safe-harbour comparison.

The naming resolution is clean. **The proxy itself is the issue.** `indicative_score` is not an
EU Taxonomy alignment percentage. Taxonomy alignment % is a capex/opex/turnover-based ratio;
`indicative_score` is a banded criterion-satisfaction score. They are different quantities that
happen to share a 0–100 range, and the engine compares one against a threshold defined in terms
of the other.

**Risk:** high if it reaches a paid deliverable, low while it stays free-tier. A paid
Sustainability Readiness Report citing "X% Taxonomy aligned" on this basis would not survive
technical review by an acquirer or a regulator.

**This is already decided (Decision 5):** proxy approved for FREE tier only; paid report requires
the dedicated calculation. Task 6 drafts that calculation; Task 5 logs the tripwire that stops
the paid report citing the number before then.

**Verdict: FLAG — accepted for free tier, tripwired for paid, spec'd in Task 6.**

### D4 — UK SDR lens re-expresses the label decision rather than re-running the 15 scorers — **FLAG**

The 15 existing `uk-sdr-scoring.ts` functions read richer SFDR-shaped inputs than the canonical
model carries, so a lens that is pure over canonical cannot call them faithfully. The build
preserved the four-label structure and three fit verdicts exactly (both fixed by FCA PS23/16)
and re-expressed the fit *decision* from canonical signals. The legacy scorers remain the
authoritative engine path.

The build report names its own weak point honestly: **Sustainability Impact** and **Sustainability
Mixed Goals** are approximations. Mixed Goals has no engine framework behind it at all.

**Risk:** material but bounded. For any engagement where UK SDR is the client's *primary*
framework, a re-expressed label fit is thinner than the legacy per-criterion scoring and would
not stand up to a client challenging the label call.

**This is already decided (Decision 1):** accepted as-is, do not rebuild. Task 5 logs the
tripwire — any ICP 2 engagement with UK SDR as primary framework wires the UK lens to the
detailed scorers before delivery.

**Verdict: FLAG — accepted by decision, tripwired for ICP 2 primary-framework engagements.**

### D5 — Config-version swap proven in-memory rather than by shipping a second regulation file — **PASS**

Module 6 asked for a config-version swap test. Shipping a `regulatory-thresholds.v2.json` would
imply a second *real* regulation exists — it does not; SFDR 2.0 is still in trilogue. The build
instead loads a modified in-memory clone through the same typed loader under a distinct version
string (`v2-parliament`), proving a threshold change flips a verdict with zero lens-code change.

Correct call, and the honest one. `loadConfig` accepts any versioned object, so a real `.v2.json`
drops in unchanged when the trilogue text firms up.

**Verdict: PASS.**

### D6 — Shared minimal `VerdictBand` union across lenses — **PASS**

`qualifies | qualifies_with_conditions | not_a_fit | not_scored`. The EU category ladder and the
UK label-fit matrix map their different native vocabularies onto this shared headline band;
specifics live in `sections` and `headlineLabel`. `LensVerdict` was also extended with
`headlineLabel` and `fundManagerNotes` beyond the spec's minimal shape.

Both changes are additive and keep the lens interface uniform, which is the whole point of the
lens architecture. The 70% portfolio threshold gets a proper fund-manager-facing home rather
than being smuggled into an asset-level verdict.

**Verdict: PASS.**

### D7 — Feature branch rather than direct commits to `main` — **PASS**

A 2,900-line additive architecture is exactly the "non-trivial work" the repo's own conventions
say belongs on a branch. Nothing was pushed, the tag sits on the branch head, and the work is
reversible. This is the reason a merge gate exists at all.

**Verdict: PASS.**

### D8 — Exclusions screen is structurally real but triggers nothing for DC assets — **PASS, with a copy note**

The canonical model carries no sector-exposure or controversy fields, because a data centre is
not a coal, tobacco, or weapons producer. So the config-driven exclusion lists screen to "no
triggers" for every current asset. The build chose to keep the screen real and wired rather than
manufacture artificial triggers.

That is the honest call and I agree with it. **One copy caution for the customer-facing layer:**
a report line reading "no exclusions triggered" implies an affirmative screen was run against
exposure data. It was not — the screen ran against a model that structurally cannot carry the
signal. The wording in any customer-facing surface should say the screen is not applicable to
this asset class rather than implying a clean pass. Worth carrying into the Task 4 adapter copy
review.

**Verdict: PASS, with a wording note for customer-facing output.**

---

## 2. The four confirmations

### ✅ All 419 tests green

```
ℹ tests 419   ℹ suites 90   ℹ pass 419   ℹ fail 0   ℹ skipped 0   ℹ todo 0
```

Run on branch head `ecca6ba`, Node v24.19.0, 2026-08-12. 360 baseline preserved + 59 new.

### ✅ No deletions

`git diff --diff-filter=D main..feat/engine-v4-lens-architecture` → **empty**.
`git diff --diff-filter=R` (renames) → **empty**.
Diffstat: **33 files changed, 4,322 insertions, 2 deletions**. Both deletions are the two
replaced lines in `package.json` (`version` and `description`). No logic removed anywhere.

### ⚠️ No thresholds hard-coded outside the settings file — **confirmed for the EU lens, partially for the UK lens**

The EU lens is enforced by a source-scan test that strips comments and string literals, then
fails on any numeric comparison against a literal ≥ 2 or any decimal literal in executable code.
That is a genuinely strong guard and it passes.

**The UK lens has no equivalent source-scan test.** It contains three numeric comparisons in
executable code: `signals >= 1` (line 181), `nNow >= 2` (line 199), `nAny >= 2` (line 202).

I read all three. They are **structural definitions, not regulatory calibrations** — "Mixed Goals
requires a blend of two or more objectives" is the FCA's definition of the label, not a tunable
threshold, and it will not move in trilogue. So the substance of the guarantee holds.

But the *guard* does not exist on that file, so nothing stops a future calibration threshold
being added to the UK lens without anyone noticing. Recommend adding the same source-scan test
to `ukSdrLens.ts` (with an allowance for the three structural counts). Small, additive, not a
merge blocker.

### ✅ No identifying data in the benchmark record schema

The schema drops `assetId`, drops `context.hostJurisdiction` (retaining only a coarse region
enum), and drops the free-text `carbon.embodiedCarbonMethodology`. Identity is carried only as a
salted one-way SHA-256 hash for dedup and longitudinal linking. Anonymisation is constructed
explicitly field-by-field rather than by `delete`, so the sanitised shape is type-checked.

Tests plant a secret company string in both the asset id and the free-text methodology field and
assert neither appears anywhere in the serialised record. Storage failures are isolated — a
throwing adapter never propagates into the assessment.

**One caveat, addressed by Task 3:** the salt currently defaults to a non-secret constant
(`"perennity-benchmark-v1"`) when no salt is passed. That is fine for the JSONL dev path but not
for a real datastore — a non-secret salt means hashes are reversible by anyone who can guess
asset ids. Task 3 moves the salt to a Vercel environment variable with a fail-safe: if the env
var is absent, emission is skipped and a warning is logged, never an unhashed or
weakly-hashed write.

---

## 3. Two findings this review adds

Neither is in the build report. Neither blocks merge.

### Finding 1 — the settings file has two sources of truth for the safe-harbour threshold ⚠️

`config/regulatory-thresholds.v1.json` carries the safe-harbour number **twice**:

- `thresholds.taxonomySafeHarbourPercent.value = 15` — the real one; the lens resolves it by
  reference and this is what drives verdicts.
- `categories.sustainable.requiresAlignmentScoreAtOrAbovePercent = 15` — a duplicate literal
  that is schema-validated and type-checked but **read by nothing in the lens logic**.

I verified the second field is unconsumed: the only non-loader references are in the config-swap
test, which defensively sets *both* values and so passes for the right reason — masking the
divergence.

**Why it matters for you specifically:** Parliament wants the safe harbour raised 15 → 20. When
that lands, someone following the Task 5 runbook edits the config, changes
`taxonomySafeHarbourPercent` to 20, and ships. `requiresAlignmentScoreAtOrAbovePercent` stays at
15, no test fails, and the settings file now contains a stale number that reads like a live
threshold to the next person who opens it — including an acquirer's technical reviewer.

**Recommended fix:** delete-by-supersession is off the table under the no-deletions rule, so
either (a) have the loader assert the two agree and fail fast when they diverge, or (b) leave the
field but the runbook must require editing both and the config must comment which one is
load-bearing. **(a) is better** — it is a few lines, additive, and makes divergence impossible
rather than merely documented. Either way **the Task 5 runbook must name this**, because the
10-minute threshold edit is exactly where the mistake gets made.

### Finding 2 — the UK lens lacks the EU lens's threshold source-scan test ⚠️

Covered in confirmation 3 above. Substance holds today; the guard is missing for tomorrow.
Recommend adding it. Additive, small, not a blocker.

---

## 4. Merge recommendation

**Recommend: approve the merge.**

The architecture is sound, the no-deletions rule is honoured exactly, the test suite is green,
and the two genuinely risky judgment calls (D3 taxonomy proxy, D4 UK re-expression) are both
already covered by decisions you have made and are tripwired rather than shipped blind.

What you are approving is a merge to engine `main` of an **unpublished pre-release**. The package
stays `"private": true`, no version consumed by the SPA is bumped, and no release is cut.
Customer-facing exposure remains gated behind Task 4's preview URL and your review of it.

**Carried forward from this review:**

| # | Item | Lands in |
|---|---|---|
| 1 | Salt moves to a Vercel env var with fail-safe skip | Task 3 |
| 2 | Config duplicate-threshold guard + runbook warning | Task 5 (+ loader assert) |
| 3 | UK lens source-scan test | Follow-on, additive |
| 4 | D8 "no exclusions triggered" copy wording | Task 4 adapter copy review |
| 5 | D2 dual-path retirement decision at SFDR 2.0 adoption | Roadmap, owner needed |

---

## 5. How to verify this pack yourself

```bash
cd /Users/pels/Developer/Perennity_regulatory_frameworks
export PATH="$HOME/.local/share/fnm/node-versions/v24.19.0/installation/bin:$PATH"

git diff --diff-filter=D main..feat/engine-v4-lens-architecture   # deletions — expect empty
git diff --stat main..feat/engine-v4-lens-architecture            # expect 33 files, 2 deletions
npm test                                                          # expect 419 pass / 0 fail
grep -rn "requiresAlignmentScoreAtOrAbovePercent" src/ | grep -v thresholds.ts   # Finding 1
```

🔒 **This is a human gate. No merge happens until you approve.**
