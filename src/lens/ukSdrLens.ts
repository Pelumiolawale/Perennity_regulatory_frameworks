// ============================================================================
// UK SDR Lens — FCA PS23/16 Label Fit Matrix (Engine v4.0 — Module 4)
// ============================================================================
//
// Re-houses the existing UK SDR Label Fit Matrix logic as a FrameworkLens over
// the framework-agnostic CanonicalAssessment. This is a PORT, not a redesign:
// the four-label structure (Sustainability Focus / Improvers / Impact / Mixed
// Goals) and the three fit verdicts (Qualifies Now / Qualifies With Roadmap /
// Not A Fit) are fixed by FCA PS23/16 and must not be changed. The
// cross-cutting fields — an anti-greenwashing audit flag on EVERY label row and
// a fund-manager-facing 70% note — are carried through.
//
// ASSET-LEVEL vs FUND-LEVEL: the labels are FUND (product) labels under FCA
// PS23/16. This lens assesses whether the ASSET is a fit for a fund carrying
// each label — never that the asset "is" the label. `LabelFit` = "would this
// asset support a fund using this label?". The 70% is the FUND's asset-mix
// threshold, surfaced as a note, never a pass/fail on the asset.
//
// PORT NOTE (deviation, see BUILD-REPORT.md): the authoritative per-criterion
// UK SDR scorers (src/sfdr/uk-sdr-scoring.ts, 15 criteria) remain the legacy
// path. This lens re-expresses the four-label DECISION at canonical altitude —
// it does not re-run those 15 functions (they read the richer SFDR-shaped
// inputs the canonical model deliberately abstracts away). Impact fit and Mixed
// Goals (which has no engine framework) are approximated from canonical signals.
// ============================================================================

import type { CanonicalAssessment } from "../core/canonical";
import type { RegulatoryConfig } from "../config/thresholds";
import { defaultConfig, resolveThreshold } from "../config/thresholds";
import {
  type Citation,
  type EvidenceGap,
  type FrameworkLens,
  type LensVerdict,
  type SectionStatus,
  type VerdictBand,
  type VerdictSection,
} from "./types";

const LENS_ID = "uk_sdr";
const LENS_VERSION = "4.0.0-alpha.1";

type LabelId = "focus" | "improvers" | "impact" | "mixed_goals";
type FitVerdict = "qualifies_now" | "qualifies_with_roadmap" | "not_a_fit";
type GreenwashFlag = "clear" | "caution" | "flag";

interface LabelRow {
  id: LabelId;
  label: string;
  fit: FitVerdict;
  antiGreenwashing: GreenwashFlag;
  reasons: string[];
}

const LABEL_NAMES: Record<LabelId, string> = {
  focus: "Sustainability Focus",
  improvers: "Sustainability Improvers",
  impact: "Sustainability Impact",
  mixed_goals: "Sustainability Mixed Goals",
};

export class UKSDRLens implements FrameworkLens {
  readonly id = LENS_ID;
  readonly version = LENS_VERSION;
  readonly configVersion: string;

  constructor(private readonly config: RegulatoryConfig = defaultConfig()) {
    this.configVersion = config.configVersion;
  }

  evaluate(a: CanonicalAssessment): LensVerdict {
    // FCA PS23/16 is finalised (no comparable rewrite tabled), so UK SDR
    // citations are SETTLED — this lens demonstrates the settled-confidence
    // path (contrast: the EU SFDR 2.0 lens is always provisional).
    const citations: Citation[] = [
      {
        source: "FCA PS23/16 — Sustainability Disclosure Requirements (SDR) and investment labels",
        reference: "four investment labels + anti-greenwashing rule (ESG 4.3)",
        note: "Finalised regime; no comparable rewrite proposal tabled.",
        contested: false,
      },
    ];

    const focus = this.evalFocus(a);
    const improvers = this.evalImprovers(a);
    const impact = this.evalImpact(a);
    const mixed = this.evalMixedGoals(focus, improvers, impact);

    const rows: LabelRow[] = [focus, improvers, impact, mixed];
    const sections = rows.map((r) => this.toLabelSection(r));
    const evidenceGaps = this.deriveGaps(rows, a);

    const { headline, headlineLabel } = this.deriveHeadline(focus, impact, improvers, mixed);

    const fundManagerNotes = this.seventyPercentNotes(rows);

    return {
      lensId: this.id,
      lensVersion: this.version,
      configVersion: this.configVersion,
      headline,
      headlineLabel,
      sections,
      evidenceGaps,
      citations,
      confidence: citations.some((c) => c.contested) ? "provisional" : "settled",
      fundManagerNotes,
    };
  }

  // -- Sustainability Focus: asset meets a credible sustainability standard now
  private evalFocus(a: CanonicalAssessment): LabelRow {
    const safeHarbour = resolveThreshold(
      this.config,
      this.config.categories.sustainable.requiresAlignmentScoreThresholdRef,
    );
    const score = a.derivedAlignmentScorePercent;
    const verified =
      a.governance.thirdPartyVerification === "limited" ||
      a.governance.thirdPartyVerification === "reasonable";
    const meetsStandard = score !== null && score >= safeHarbour.value;

    let fit: FitVerdict;
    const reasons: string[] = [];
    if (meetsStandard && verified) {
      fit = "qualifies_now";
      reasons.push("Asset meets a credible sustainability standard now, with third-party verification.");
    } else if (meetsStandard && !verified) {
      fit = "qualifies_with_roadmap";
      reasons.push("Asset meets the standard on self-reported data; independent verification would confirm the Focus claim.");
    } else {
      fit = "not_a_fit";
      reasons.push(
        score === null
          ? "No credible-standard alignment score evidenced — Focus requires the asset to already meet a standard."
          : `Alignment (${score}%) is below the credible-standard threshold; Focus is for assets that meet a standard now.`,
      );
    }
    return { id: "focus", label: LABEL_NAMES.focus, fit, antiGreenwashing: greenwash(fit, verified), reasons };
  }

  // -- Sustainability Improvers: credible improvement plan toward sustainability
  private evalImprovers(a: CanonicalAssessment): LabelRow {
    const minSignals = this.config.categories.transition.roadmapMinCredibilitySignals;
    const rm = a.governance.transitionRoadmap;
    const roadmapPresent = rm.present === "present";
    const signals = [rm.capexLinked, rm.datedMilestones, rm.boardApproved].filter((x) => x === true).length;
    const verified =
      a.governance.thirdPartyVerification === "limited" ||
      a.governance.thirdPartyVerification === "reasonable";

    let fit: FitVerdict;
    const reasons: string[] = [];
    if (roadmapPresent && signals >= minSignals) {
      fit = "qualifies_now";
      reasons.push(`Credible improvement plan in place now (${signals} credibility signals evidenced).`);
    } else if (roadmapPresent) {
      fit = "qualifies_with_roadmap";
      reasons.push(`Improvement plan present but only ${signals}/${minSignals} credibility signals evidenced.`);
    } else {
      fit = "not_a_fit";
      reasons.push("No improvement plan evidenced — Improvers requires a credible plan to become more sustainable over time.");
    }
    return { id: "improvers", label: LABEL_NAMES.improvers, fit, antiGreenwashing: greenwash(fit, verified), reasons };
  }

  // -- Sustainability Impact: measurable positive-impact objective + additionality
  private evalImpact(a: CanonicalAssessment): LabelRow {
    const rm = a.governance.transitionRoadmap;
    const roadmapPresent = rm.present === "present";
    const signals = [rm.capexLinked, rm.datedMilestones, rm.boardApproved].filter((x) => x === true).length;
    const reasonable = a.governance.thirdPartyVerification === "reasonable";
    const alignmentKnown = a.derivedAlignmentScorePercent !== null;
    const allSignals = signals === 3; // three credibility signals = full board/capex/dated set

    let fit: FitVerdict;
    const reasons: string[] = [];
    if (roadmapPresent && allSignals && reasonable && alignmentKnown) {
      fit = "qualifies_now";
      reasons.push("Board-approved, capex-linked, dated plan with reasonable assurance — supports a measurable-impact + additionality claim.");
    } else if (roadmapPresent && signals >= 1) {
      fit = "qualifies_with_roadmap";
      reasons.push("Some impact-plan evidence present; Impact needs a measurable objective, additionality evidence, and assurance to qualify now.");
    } else {
      fit = "not_a_fit";
      reasons.push("No measurable-impact objective / additionality evidence — Impact is the highest-intentionality label.");
    }
    return { id: "impact", label: LABEL_NAMES.impact, fit, antiGreenwashing: greenwash(fit, reasonable), reasons };
  }

  // -- Sustainability Mixed Goals: blend across two or more of the above
  private evalMixedGoals(focus: LabelRow, improvers: LabelRow, impact: LabelRow): LabelRow {
    const singles = [focus, improvers, impact];
    const nNow = singles.filter((r) => r.fit === "qualifies_now").length;
    const nAny = singles.filter((r) => r.fit !== "not_a_fit").length;

    let fit: FitVerdict;
    const reasons: string[] = [];
    if (nNow >= 2) {
      fit = "qualifies_now";
      reasons.push(`Asset supports ${nNow} labels now — a Mixed Goals fund could blend these objectives.`);
    } else if (nAny >= 2) {
      fit = "qualifies_with_roadmap";
      reasons.push(`Asset touches ${nAny} labels (some via roadmap) — a Mixed Goals blend is possible with the noted gaps closed.`);
    } else {
      fit = "not_a_fit";
      reasons.push("Asset fits at most one label — Mixed Goals requires a blend of two or more sustainability objectives.");
    }
    // Anti-greenwashing for a blend hinges on the weakest constituent claim.
    const worst = worstFlag(singles.filter((r) => r.fit !== "not_a_fit").map((r) => r.antiGreenwashing));
    const flag: GreenwashFlag = fit === "not_a_fit" ? "flag" : worst;
    return { id: "mixed_goals", label: LABEL_NAMES.mixed_goals, fit, antiGreenwashing: flag, reasons };
  }

  private deriveGaps(rows: LabelRow[], a: CanonicalAssessment): EvidenceGap[] {
    const gaps: EvidenceGap[] = [];
    // Surface the improvement-plan credibility gaps (the Improvers pathway is
    // the most common DC route) as actionable evidence-pack items.
    const rm = a.governance.transitionRoadmap;
    if (rm.present === "present") {
      const missing: Array<[string, boolean | null, string]> = [
        ["capexLinked", rm.capexLinked, "Tie improvement milestones to committed capex."],
        ["datedMilestones", rm.datedMilestones, "Publish a dated milestone schedule."],
        ["boardApproved", rm.boardApproved, "Evidence board approval of the plan."],
      ];
      for (const [k, v, remedy] of missing) {
        if (v !== true) {
          gaps.push({
            id: `uk_sdr_improvers_${k}`,
            category: "uk_sdr_improvement_plan",
            description: `Improvers credibility signal not evidenced: ${k}.`,
            severity: "material",
            remediation: remedy,
          });
        }
      }
    }
    // Any Focus/Impact claim resting on unverified data is a greenwashing gap.
    for (const r of rows) {
      if (r.fit === "qualifies_now" && r.antiGreenwashing === "caution") {
        gaps.push({
          id: `uk_sdr_verification_${r.id}`,
          category: "uk_sdr_anti_greenwashing",
          description: `${r.label} would qualify now but rests on unverified data (anti-greenwashing caution).`,
          severity: "material",
          remediation: "Obtain independent assurance so the label claim is fair, clear, and not misleading (FCA anti-greenwashing rule).",
        });
      }
    }
    return gaps;
  }

  private deriveHeadline(
    focus: LabelRow,
    impact: LabelRow,
    improvers: LabelRow,
    mixed: LabelRow,
  ): { headline: VerdictBand; headlineLabel: string } {
    // Strongest-single-label naming order: Focus (meets standard) > Impact
    // (highest intentionality) > Improvers (improving). Mixed Goals headlines
    // only when it strictly beats the strongest single fit.
    const order: LabelRow[] = [focus, impact, improvers];
    if (mixed.fit === "qualifies_now") {
      return { headline: "qualifies", headlineLabel: mixed.label };
    }
    const singleNow = order.find((r) => r.fit === "qualifies_now");
    if (singleNow) return { headline: "qualifies", headlineLabel: singleNow.label };
    if (mixed.fit === "qualifies_with_roadmap") {
      return { headline: "qualifies_with_conditions", headlineLabel: mixed.label };
    }
    const singleRoadmap = order.find((r) => r.fit === "qualifies_with_roadmap");
    if (singleRoadmap) return { headline: "qualifies_with_conditions", headlineLabel: singleRoadmap.label };
    return { headline: "not_a_fit", headlineLabel: "No UK SDR label fits" };
  }

  private seventyPercentNotes(rows: LabelRow[]): string[] {
    // The numeric value is read from config (no hardcode). The UK SDR 70% is
    // FCA PS23/16's product asset-mix threshold and is SETTLED — cite FCA, not
    // the (contested) SFDR-2.0 entry, so UK verdicts stay settled-confidence.
    const value = resolveThreshold(this.config, "portfolioPositiveContributionPercent").value;
    const best = rows.find((r) => r.fit === "qualifies_now") ?? rows.find((r) => r.fit === "qualifies_with_roadmap");
    const notes: string[] = [];
    if (best) {
      notes.push(
        `Fund-manager note (NOT an asset verdict): under FCA PS23/16, a fund using the "${best.label}" label must hold ≥${value}% of assets meeting the label's objective. This asset (fit: ${humanFit(best.fit)}) could count toward that ≥${value}% pool; inclusion/weighting is the fund manager's determination.`,
      );
    } else {
      notes.push(
        `Fund-manager note (NOT an asset verdict): this asset is not currently a fit for any UK SDR label, so it would not count toward a labelled fund's ≥${value}% asset-mix threshold.`,
      );
    }
    return notes;
  }

  private toLabelSection(r: LabelRow): VerdictSection {
    return {
      id: `label_${r.id}`,
      title: `${r.label} — ${humanFit(r.fit)}`,
      status: fitToStatus(r.fit),
      summary: `${humanFit(r.fit)} (asset-level fit for a fund carrying the ${r.label} label). Anti-greenwashing audit: ${r.antiGreenwashing.toUpperCase()}.`,
      details: [
        ...r.reasons,
        `Anti-greenwashing audit: ${r.antiGreenwashing.toUpperCase()} — ${greenwashNote(r.antiGreenwashing, r.fit, r.label)}`,
      ],
    };
  }
}

// -- Helpers -----------------------------------------------------------------

function greenwash(fit: FitVerdict, verified: boolean): GreenwashFlag {
  if (fit === "not_a_fit") return "flag"; // claiming this label would mislead
  if (fit === "qualifies_now" && verified) return "clear";
  return "caution"; // qualifies-now-unverified OR qualifies-with-roadmap
}

function greenwashNote(flag: GreenwashFlag, fit: FitVerdict, label: string): string {
  switch (flag) {
    case "clear":
      return `A fund using ${label} for this asset can evidence the claim (fair, clear, not misleading).`;
    case "caution":
      return fit === "qualifies_with_roadmap"
        ? `Claim must be framed as forward-looking; presenting ${label} as achieved-now would risk greenwashing.`
        : `Claim rests on unverified data; obtain assurance before using ${label}.`;
    case "flag":
      return `Using the ${label} label for this asset today would be misleading — do not claim it.`;
  }
}

function worstFlag(flags: GreenwashFlag[]): GreenwashFlag {
  if (flags.includes("flag")) return "flag";
  if (flags.includes("caution")) return "caution";
  return "clear";
}

function fitToStatus(fit: FitVerdict): SectionStatus {
  return fit === "qualifies_now" ? "pass" : fit === "qualifies_with_roadmap" ? "partial" : "fail";
}

function humanFit(fit: FitVerdict): string {
  return fit === "qualifies_now"
    ? "Qualifies Now"
    : fit === "qualifies_with_roadmap"
      ? "Qualifies With Roadmap"
      : "Not A Fit";
}
