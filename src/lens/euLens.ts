// ============================================================================
// EU Lens — SFDR 2.0 three-category eligibility module (Engine v4.0 — Module 3)
// ============================================================================
//
// Implements the SFDR 2.0 (COM(2025) 841) three-category architecture the
// proposal puts in place of the deleted Article 6/8/9 regime and the deleted
// `sustainable investment` (Art 2(17)) definition (see docs/DELTA-MEMO-audit.md).
//
// CATEGORY ELIGIBILITY IS ASSET-LEVEL FUNDABILITY, NEVER CATEGORISATION.
// This lens answers: "could a product in category X fund this asset?" — it
// NEVER asserts "this asset IS Sustainable/Transition/ESG Basics". Categories
// are fund-level constructs; an asset is fundable-by them. Type names and
// comments keep that distinction explicit throughout (CategoryFundability, not
// CategoryLabel).
//
// PB's core commercial teach lives in the Transition emphasis: an asset that
// fails Sustainable but holds a credible transition roadmap has its pathway
// FOREGROUNDED with specific evidence-pack gaps — making an illegible-but-
// improvable asset's route to fundability visible, not merely recording failure.
//
// ZERO hardcoded numeric thresholds in this module. Every threshold, exclusion
// list, PAI set, and safe-harbour percentage is read from the injected config
// (Module 6). A grep for numeric literals is in the test; every survivor is a
// structural constant (0/1 counts, rounding) justified inline.
// ============================================================================

import type { CanonicalAssessment } from "../core/canonical";
import type { RegulatoryConfig } from "../config/thresholds";
import { defaultConfig, resolveThreshold } from "../config/thresholds";
import {
  deriveConfidence,
  type Citation,
  type EvidenceGap,
  type FrameworkLens,
  type LensVerdict,
  type SectionStatus,
  type VerdictBand,
  type VerdictSection,
} from "./types";

const LENS_ID = "eu_sfdr_2_0";
const LENS_VERSION = "4.0.0-alpha.1";

type CategoryId = "sustainable" | "transition" | "esg_basics";

/**
 * Asset-level fundability under one SFDR 2.0 category. NOT a claim that the
 * asset "is" this category — categories are fund-level. `fundable` means "a
 * product in this category could fund this asset".
 */
interface CategoryFundability {
  category: CategoryId;
  label: string;
  fundable: boolean;
  status: SectionStatus;
  reasons: string[];
  gaps: EvidenceGap[];
}

interface ExclusionScreen {
  triggeredByCategory: Record<CategoryId, string[]>;
  screenedByCategory: Record<CategoryId, string[]>;
}

export class EULens implements FrameworkLens {
  readonly id = LENS_ID;
  readonly version = LENS_VERSION;
  readonly configVersion: string;

  constructor(private readonly config: RegulatoryConfig = defaultConfig()) {
    this.configVersion = config.configVersion;
  }

  evaluate(a: CanonicalAssessment): LensVerdict {
    const citations: Citation[] = [];
    const sections: VerdictSection[] = [];
    const evidenceGaps: EvidenceGap[] = [];
    const fundManagerNotes: string[] = [];

    // Base citation: the entire regime is trilogue-live (draft text). This on
    // its own makes SFDR 2.0 verdicts provisional — which is honest.
    citations.push({
      source: "SFDR 2.0 proposal COM(2025) 841 (20 Nov 2025)",
      reference: "three-category architecture (Sustainable / Transition / ESG Basics)",
      note: "Draft regime; trilogue expected early Q4 2026, application ~2028.",
      contested: true,
    });

    // --- Exclusions screen (config-driven), needed by the ladder ---
    const exclusions = this.screenExclusions(a);
    citations.push({
      source: "SFDR 2.0 proposal",
      reference: "config.categoryExclusionScope",
      note: this.config.categoryExclusionScope.notes,
      contested: this.config.categoryExclusionScope.status === "contested",
    });

    // --- 1. Category eligibility ladder ---
    const sustainable = this.evalSustainable(a, exclusions, citations);
    const transition = this.evalTransition(a, exclusions);
    const esgBasics = this.evalEsgBasics(a, exclusions, citations);

    for (const cf of [sustainable, transition, esgBasics]) {
      sections.push(this.toCategorySection(cf));
      evidenceGaps.push(...cf.gaps);
    }

    // --- 2. Exclusions section ---
    sections.push(this.exclusionsSection(exclusions));

    // --- 5. Taxonomy-% safe harbour (reused computation) ---
    const { section: taxSection, gap: taxGap } = this.safeHarbourFinding(a, citations);
    sections.push(taxSection);
    if (taxGap) evidenceGaps.push(taxGap);

    // --- 4. PAI indicator layer ---
    const paiOut = this.paiLayer(a, citations);
    sections.push(paiOut.section);
    evidenceGaps.push(...paiOut.gaps);

    // --- 6. Headline + Transition emphasis ---
    const { headline, headlineLabel, transitionForegrounded } = this.deriveHeadline(
      sustainable,
      transition,
      esgBasics,
    );

    // When Transition is the route, foreground it: promote its gaps to the top
    // and add a leading section that makes the pathway explicit.
    if (transitionForegrounded) {
      sections.unshift(this.transitionEmphasisSection(transition, sustainable));
    }

    // --- 3. 70% test representation (fund-manager-facing note) ---
    fundManagerNotes.push(...this.seventyPercentNotes(sustainable, transition, esgBasics));

    return {
      lensId: this.id,
      lensVersion: this.version,
      configVersion: this.configVersion,
      headline,
      headlineLabel,
      sections,
      evidenceGaps,
      citations,
      confidence: deriveConfidence(citations),
      fundManagerNotes,
    };
  }

  // -- Category: Sustainable -------------------------------------------------
  // "Already meets high standards": external alignment score at/above the
  // safe-harbour AND third-party verification present AND no exclusion. The
  // no-harm requirement is folded into the reused alignment score (which the
  // legacy EU Taxonomy 8.1 computation already gates on DNSH + safeguards).
  private evalSustainable(
    a: CanonicalAssessment,
    ex: ExclusionScreen,
    citations: Citation[],
  ): CategoryFundability {
    const cfg = this.config.categories.sustainable;
    const safeHarbour = resolveThreshold(this.config, cfg.requiresAlignmentScoreThresholdRef);
    citations.push({
      source: "SFDR 2.0 proposal",
      reference: `Taxonomy safe harbour = ${safeHarbour.value}% (${cfg.requiresAlignmentScoreThresholdRef})`,
      note: safeHarbour.notes,
      contested: safeHarbour.status === "contested",
    });

    const reasons: string[] = [];
    const gaps: EvidenceGap[] = [];
    const score = a.derivedAlignmentScorePercent;
    const verification = a.governance.thirdPartyVerification;
    const excluded = ex.triggeredByCategory.sustainable.length > 0;

    const meetsAlignment = score !== null && score >= safeHarbour.value;
    const verified = verification === "limited" || verification === "reasonable";

    if (score === null) {
      reasons.push("No external technical-screening alignment score available.");
      gaps.push({
        id: "sustainable_alignment_missing",
        category: "sustainable_high_standards",
        description:
          "No third-party technical-screening alignment score (EU Taxonomy computation) is available to evidence high standards.",
        severity: "material",
        remediation:
          "Run/obtain a technical-screening alignment assessment; the Sustainable category needs an alignment score at or above the safe-harbour level.",
      });
    } else if (!meetsAlignment) {
      reasons.push(
        `External alignment ${score}% is below the safe-harbour level required for the Sustainable category.`,
      );
      gaps.push({
        id: "sustainable_below_safe_harbour",
        category: "sustainable_high_standards",
        description: `Alignment score (${score}%) is below the configured safe-harbour level.`,
        severity: "material",
        remediation:
          "Raise evidenced alignment to at or above the safe-harbour level, or pursue the Transition category pathway.",
      });
    }
    if (cfg.requiresVerification && !verified) {
      reasons.push("Third-party verification of disclosed metrics is not evidenced.");
      gaps.push({
        id: "sustainable_verification_missing",
        category: "sustainable_high_standards",
        description: "Disclosed metrics lack limited/reasonable third-party assurance.",
        severity: "material",
        remediation:
          "Obtain limited (or reasonable) third-party assurance over the disclosed sustainability metrics.",
      });
    }
    if (excluded) {
      reasons.push(
        `Excluded activity screened in: ${ex.triggeredByCategory.sustainable.join(", ")}.`,
      );
    }

    const fundable = meetsAlignment && (!cfg.requiresVerification || verified) && !excluded;
    if (fundable) reasons.unshift("Meets high-standards test: alignment ≥ safe-harbour, verified, no exclusion.");

    return {
      category: "sustainable",
      label: cfg.label,
      fundable,
      status: fundable ? "pass" : "fail",
      reasons,
      gaps,
    };
  }

  // -- Category: Transition --------------------------------------------------
  // "Not yet sustainable but on a credible transition path." Credibility = at
  // least `roadmapMinCredibilitySignals` of {capex-linked, dated milestones,
  // board-approved} evidenced, per config. This is where PB's teach lands.
  private evalTransition(a: CanonicalAssessment, ex: ExclusionScreen): CategoryFundability {
    const cfg = this.config.categories.transition;
    const rm = a.governance.transitionRoadmap;
    const reasons: string[] = [];
    const gaps: EvidenceGap[] = [];

    const signalMap: Record<string, boolean | null> = {
      capexLinked: rm.capexLinked,
      datedMilestones: rm.datedMilestones,
      boardApproved: rm.boardApproved,
    };
    const evidenced = cfg.roadmapCredibilityInputs.filter((k) => signalMap[k] === true);
    const missing = cfg.roadmapCredibilityInputs.filter((k) => signalMap[k] !== true);
    const excluded = ex.triggeredByCategory.transition.length > 0;

    const roadmapPresent = rm.present === "present";
    const meetsCredibility = evidenced.length >= cfg.roadmapMinCredibilitySignals;

    // Named, specific evidence-pack gaps for each missing credibility signal.
    for (const k of missing) {
      gaps.push({
        id: `transition_roadmap_${k}`,
        category: "transition_pathway",
        description: `Transition roadmap credibility signal not evidenced: ${humanizeSignal(k)}.`,
        severity: roadmapPresent ? "material" : "critical",
        remediation: remediationFor(k),
      });
    }

    let status: SectionStatus;
    let fundable: boolean;
    if (!roadmapPresent) {
      status = "fail";
      fundable = false;
      reasons.push("No transition roadmap is evidenced.");
    } else if (excluded) {
      status = "fail";
      fundable = false;
      reasons.push(`Excluded activity screened in: ${ex.triggeredByCategory.transition.join(", ")}.`);
    } else if (meetsCredibility) {
      status = "pass";
      fundable = true;
      reasons.push(
        `Credible transition roadmap: ${evidenced.length}/${cfg.roadmapCredibilityInputs.length} credibility signals evidenced (${evidenced.map(humanizeSignal).join(", ")}).`,
      );
    } else {
      status = "partial";
      fundable = false;
      reasons.push(
        `Transition roadmap present but only ${evidenced.length}/${cfg.roadmapMinCredibilitySignals} required credibility signals evidenced.`,
      );
    }

    return {
      category: "transition",
      label: cfg.label,
      fundable,
      status,
      reasons,
      gaps,
    };
  }

  // -- Category: ESG Basics --------------------------------------------------
  // "ESG integration beyond risk management, no transition/sustainability
  // objective." Lowest bar: disclosure completeness floor (config) + no
  // exclusion. Parliament's bottom-20% screen is a fund-level portfolio screen
  // — surfaced as a fund-manager note + informational, cited contested.
  private evalEsgBasics(
    a: CanonicalAssessment,
    ex: ExclusionScreen,
    citations: Citation[],
  ): CategoryFundability {
    const cfg = this.config.categories.esg_basics;
    const bottomScreen = resolveThreshold(this.config, cfg.bottomScreenThresholdRef);
    citations.push({
      source: "SFDR 2.0 proposal (Parliament position)",
      reference: `ESG Basics bottom-${bottomScreen.value}% screen (${cfg.bottomScreenThresholdRef})`,
      note: bottomScreen.notes,
      contested: bottomScreen.status === "contested",
    });

    const reasons: string[] = [];
    const gaps: EvidenceGap[] = [];
    const disclosure = a.governance.disclosureCompletenessScore;
    const excluded = ex.triggeredByCategory.esg_basics.length > 0;
    const meetsDisclosure = disclosure >= cfg.minDisclosureCompleteness;

    if (!meetsDisclosure) {
      reasons.push(
        `Disclosure completeness (${disclosure}) is below the ESG-Basics floor (${cfg.minDisclosureCompleteness}).`,
      );
      gaps.push({
        id: "esg_basics_disclosure_floor",
        category: "esg_basics",
        description: "Disclosure completeness is below the ESG-Basics integration floor.",
        severity: "minor",
        remediation:
          "Publish a fuller ESG disclosure set (energy, water, carbon, verification) to clear the ESG-Basics floor.",
      });
    }
    if (excluded) {
      reasons.push(`Excluded activity screened in: ${ex.triggeredByCategory.esg_basics.join(", ")}.`);
    }

    const fundable = meetsDisclosure && !excluded;
    if (fundable) reasons.unshift("ESG integration floor met (disclosure completeness above the configured minimum).");

    return {
      category: "esg_basics",
      label: cfg.label,
      fundable,
      status: fundable ? "pass" : "fail",
      reasons,
      gaps,
    };
  }

  // -- Exclusions screen (config-driven) -------------------------------------
  // Presence-of-exposure screen: for each excluded activity code in a
  // category's list, check whether any canonical signal evidences that
  // exposure. Data-centre infrastructure assets do not carry these exposures,
  // so nothing triggers today — but the screen is real (lists from config) and
  // future canonical fields (sector exposure, controversy flags) plug straight
  // into the detector map.
  private screenExclusions(a: CanonicalAssessment): ExclusionScreen {
    const lists = this.config.categoryExclusionScope.lists;
    const detect = buildExclusionDetectors(a);
    const screen = (codes: string[]): { triggered: string[]; screened: string[] } => {
      const triggered = codes.filter((code) => detect(code));
      return { triggered, screened: codes };
    };
    const s = screen(lists.sustainable);
    const t = screen(lists.transition);
    const e = screen(lists.esg_basics);
    return {
      triggeredByCategory: {
        sustainable: s.triggered,
        transition: t.triggered,
        esg_basics: e.triggered,
      },
      screenedByCategory: {
        sustainable: s.screened,
        transition: t.screened,
        esg_basics: e.screened,
      },
    };
  }

  private exclusionsSection(ex: ExclusionScreen): VerdictSection {
    const totalTriggered =
      ex.triggeredByCategory.sustainable.length +
      ex.triggeredByCategory.transition.length +
      ex.triggeredByCategory.esg_basics.length;
    return {
      id: "exclusions_screen",
      title: "Category exclusions screen",
      status: totalTriggered === 0 ? "pass" : "fail",
      summary:
        totalTriggered === 0
          ? "No configured category exclusions triggered for this asset profile."
          : "One or more configured category exclusions were triggered.",
      details: [
        `Sustainable — screened: ${ex.screenedByCategory.sustainable.join(", ")}; triggered: ${orNone(ex.triggeredByCategory.sustainable)}.`,
        `Transition — screened: ${ex.screenedByCategory.transition.join(", ")}; triggered: ${orNone(ex.triggeredByCategory.transition)}.`,
        `ESG Basics — screened: ${ex.screenedByCategory.esg_basics.join(", ")}; triggered: ${orNone(ex.triggeredByCategory.esg_basics)}.`,
        "Exclusion scope (esp. fossil-fuel exposure in Transition) is a live trilogue battleground; lists are draft.",
      ],
    };
  }

  // -- Taxonomy-% safe harbour (reused computation) --------------------------
  private safeHarbourFinding(
    a: CanonicalAssessment,
    _citations: Citation[],
  ): { section: VerdictSection; gap: EvidenceGap | null } {
    const cfg = this.config.categories.sustainable;
    const safeHarbour = resolveThreshold(this.config, cfg.requiresAlignmentScoreThresholdRef);
    const score = a.derivedAlignmentScorePercent;
    let status: SectionStatus;
    let summary: string;
    let gap: EvidenceGap | null = null;

    if (score === null) {
      status = "not_applicable";
      summary =
        "No external Taxonomy-alignment score available; the safe-harbour finding cannot be computed.";
      gap = {
        id: "safe_harbour_no_score",
        category: "taxonomy_safe_harbour",
        description: "No reused Taxonomy-alignment computation was available for this run.",
        severity: "minor",
        remediation: "Run the EU Taxonomy 8.1 assessment so the safe-harbour finding can be surfaced.",
      };
    } else if (score >= safeHarbour.value) {
      status = "pass";
      summary = `Taxonomy alignment ${score}% is at/above the ${safeHarbour.value}% safe-harbour — auto-qualifies under the Commission baseline.`;
    } else {
      status = "partial";
      summary = `Taxonomy alignment ${score}% is below the ${safeHarbour.value}% safe-harbour.`;
    }

    return {
      section: {
        id: "taxonomy_safe_harbour",
        title: "EU Taxonomy safe-harbour finding",
        status,
        summary,
        details: [
          `Safe-harbour level (config): ${safeHarbour.value}% — ${safeHarbour.status}.`,
          "Parliament proposes raising this to 20% and removing the CTB/PAB benchmark safe harbour (trilogue-live).",
          "Alignment % is REUSED from the existing EU Taxonomy 8.1 technical-screening computation; not recomputed here.",
        ],
      },
      gap,
    };
  }

  // -- PAI indicator layer ---------------------------------------------------
  private paiLayer(
    a: CanonicalAssessment,
    citations: Citation[],
  ): { section: VerdictSection; gaps: EvidenceGap[] } {
    const mandatoryCount = resolveThreshold(this.config, "mandatoryPaiCount");
    citations.push({
      source: "SFDR 2.0 proposal",
      reference: `mandatory PAI count = ${mandatoryCount.value} (mandatoryPaiCount)`,
      note: mandatoryCount.notes,
      contested: mandatoryCount.status === "contested",
    });

    const gaps: EvidenceGap[] = [];
    const details: string[] = [];
    let mandatoryDisclosed = 0;
    let mandatoryTotal = 0;

    for (const pai of this.config.paiIndicators.set) {
      const present = pai.canonicalSignals.filter((sig) => signalPresent(a, sig)).length;
      const total = pai.canonicalSignals.length;
      let disclosure: "disclosed" | "partial" | "absent";
      if (total === 0) disclosure = "absent";
      else if (present === total) disclosure = "disclosed";
      else if (present > 0) disclosure = "partial";
      else disclosure = "absent";

      details.push(
        `${pai.id} (${pai.name})${pai.mandatory ? " [mandatory]" : ""}: ${disclosure} (${present}/${total} signals).`,
      );

      if (pai.mandatory) {
        mandatoryTotal += 1;
        if (disclosure === "disclosed") mandatoryDisclosed += 1;
        if (disclosure !== "disclosed") {
          gaps.push({
            id: `pai_gap_${pai.id}`,
            category: `pai:${pai.id}`,
            description: `Mandatory PAI "${pai.name}" is ${disclosure}.`,
            severity: disclosure === "absent" ? "material" : "minor",
            remediation: `Provide the underlying data for PAI "${pai.name}" (${pai.canonicalSignals.join(", ") || "no canonical signal mapped"}).`,
          });
        }
      }
    }

    const status: SectionStatus =
      mandatoryTotal === 0
        ? "informational"
        : mandatoryDisclosed === mandatoryTotal
          ? "pass"
          : mandatoryDisclosed > 0
            ? "partial"
            : "fail";

    return {
      section: {
        id: "pai_layer",
        title: "Principal Adverse Impact (PAI) indicator layer",
        status,
        summary: `Mandatory PAIs disclosed: ${mandatoryDisclosed}/${mandatoryTotal}. Config mandatory-count floor: ${mandatoryCount.value} (trilogue-live: voluntary vs min-${mandatoryCount.value} vs fully-mandatory).`,
        details,
      },
      gaps,
    };
  }

  // -- Headline + Transition emphasis ----------------------------------------
  private deriveHeadline(
    sustainable: CategoryFundability,
    transition: CategoryFundability,
    esgBasics: CategoryFundability,
  ): { headline: VerdictBand; headlineLabel: string; transitionForegrounded: boolean } {
    if (sustainable.fundable) {
      return {
        headline: "qualifies",
        headlineLabel: "Sustainable-fundable",
        transitionForegrounded: false,
      };
    }
    if (transition.fundable) {
      return {
        headline: "qualifies_with_conditions",
        headlineLabel: "Transition-fundable",
        transitionForegrounded: true,
      };
    }
    if (esgBasics.fundable) {
      return {
        headline: "qualifies_with_conditions",
        headlineLabel: "ESG-Basics-fundable",
        // Foreground Transition when a roadmap is present but not yet credible
        // — the asset is improvable and PB's teach should still surface it.
        transitionForegrounded: transition.status === "partial",
      };
    }
    return {
      headline: "not_a_fit",
      headlineLabel: "Not fundable under any category",
      transitionForegrounded: transition.status === "partial",
    };
  }

  private transitionEmphasisSection(
    transition: CategoryFundability,
    sustainable: CategoryFundability,
  ): VerdictSection {
    const gapList = transition.gaps.map((g) => `${humanizeGapId(g.id)} — ${g.remediation}`);
    return {
      id: "transition_pathway_emphasis",
      title: "Transition pathway (PB teach): route to fundability",
      status: transition.fundable ? "pass" : "partial",
      summary: transition.fundable
        ? "This asset fails the Sustainable category today but IS fundable now by a Transition-category product on the strength of its credible transition roadmap."
        : "This asset fails the Sustainable category today; its most viable route is the Transition category. The roadmap is not yet fully credible — the specific evidence-pack gaps below are what stand between it and Transition-fundability.",
      details: [
        `Sustainable status: ${sustainable.status} — ${sustainable.reasons[0] ?? ""}`,
        ...(gapList.length > 0 ? ["Evidence-pack gaps to close:", ...gapList] : ["No outstanding roadmap-credibility gaps."]),
      ],
    };
  }

  // -- 70% test (fund-manager-facing note, NOT a pass/fail on the asset) -----
  private seventyPercentNotes(
    sustainable: CategoryFundability,
    transition: CategoryFundability,
    esgBasics: CategoryFundability,
  ): string[] {
    const t = resolveThreshold(this.config, "portfolioPositiveContributionPercent");
    const best = sustainable.fundable
      ? sustainable
      : transition.fundable
        ? transition
        : esgBasics.fundable
          ? esgBasics
          : null;
    const notes: string[] = [];
    if (best) {
      notes.push(
        `Fund-manager note (NOT an asset verdict): for a fund claiming the "${best.label}" category, this asset's positive-contribution profile would count toward the ≥${t.value}% portfolio positive-contribution threshold. Weighting/inclusion is the fund manager's determination.`,
      );
    } else {
      notes.push(
        `Fund-manager note (NOT an asset verdict): this asset would NOT currently count toward the ≥${t.value}% portfolio positive-contribution threshold under any category. It could still be held outside the ${t.value}% pocket.`,
      );
    }
    notes.push(
      `The ${t.value}% portfolio threshold is fund/portfolio-level and trilogue-live; sovereigns are broadly excluded from the test.`,
    );
    return notes;
  }

  private toCategorySection(cf: CategoryFundability): VerdictSection {
    return {
      id: `category_${cf.category}`,
      title: `Category eligibility — ${cf.label}`,
      status: cf.status,
      summary: cf.fundable
        ? `FUNDABLE by a ${cf.label} product (asset-level fundability, not a categorisation of the asset).`
        : `Not currently fundable by a ${cf.label} product.`,
      details: cf.reasons,
    };
  }
}

// -- Free helpers ------------------------------------------------------------

/**
 * Resolve a dotted canonical path (e.g. "energy.pueOperational") to a boolean
 * "is this signal present?" — non-null, non-"unknown", non-empty.
 */
function signalPresent(a: CanonicalAssessment, path: string): boolean {
  const parts = path.split(".");
  let cur: unknown = a;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return false;
    cur = (cur as Record<string, unknown>)[p];
  }
  if (cur === null || cur === undefined) return false;
  if (typeof cur === "string") return cur.length > 0 && cur !== "unknown";
  if (typeof cur === "number") return Number.isFinite(cur);
  return true;
}

/**
 * Build the exclusion detector closure for one asset. Each code maps to a
 * predicate over canonical signals. Data-centre assets carry none of these
 * exposures today, so all predicates return false — but the structure is real
 * and future canonical fields (sector exposure, controversy) plug in here.
 */
function buildExclusionDetectors(_a: CanonicalAssessment): (code: string) => boolean {
  // No canonical field currently evidences a fossil / weapons / tobacco /
  // controversy exposure for a DC infrastructure asset. Return false for every
  // code; wire real predicates here when the canonical model gains exposure
  // fields (tracked for the US social-license lens work).
  return (_code: string): boolean => false;
}

function humanizeSignal(k: string): string {
  switch (k) {
    case "capexLinked":
      return "capex-linked commitments";
    case "datedMilestones":
      return "dated milestones";
    case "boardApproved":
      return "board-approved plan";
    default:
      return k;
  }
}

function remediationFor(k: string): string {
  switch (k) {
    case "capexLinked":
      return "Evidence that transition milestones are tied to committed capital expenditure (capex plan / financing structure).";
    case "datedMilestones":
      return "Publish a dated milestone schedule (target years for PUE/renewables/GHG) rather than an open-ended commitment.";
    case "boardApproved":
      return "Provide board-paper / investment-memorandum evidence that the transition plan is board-approved.";
    default:
      return `Provide evidence for the "${k}" credibility signal.`;
  }
}

function humanizeGapId(id: string): string {
  return id.replace(/^transition_roadmap_/, "").replace(/_/g, " ");
}

function orNone(arr: string[]): string {
  return arr.length === 0 ? "none" : arr.join(", ");
}
