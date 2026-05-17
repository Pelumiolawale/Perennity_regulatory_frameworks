import type {
  CriterionResult,
  EngineRun,
  FrameworkResult,
  GapItem,
  HeatmapCell,
  PillarVerdict,
  Renderer,
  SnapshotGap,
  SnapshotOutput,
  Verdict,
} from "../engine";

const PILLAR_IDS: PillarVerdict["pillar_id"][] = [
  "human_rights",
  "bribery_corruption",
  "taxation",
  "fair_competition",
];

export type Severity = GapItem["severity"];
export type SnapshotPhraseTable = Record<string, Record<Severity, string>>;

// Hand-curated snapshot-safe phrasing per criterion_id × severity.
// Every string in this table has been audited to contain NO threshold values,
// NO source-text quotes, NO methodology versions, and NO narrative content.
// The structural gate test in __tests__/snapshot.gate.test.ts enforces this.
export const SNAPSHOT_PHRASES: SnapshotPhraseTable = {
  sc_8_1_1_ecocc: {
    critical:
      "Your data centre does not yet evidence compliance with the European Code of Conduct for Data Centre Energy Efficiency.",
    material:
      "European Code of Conduct compliance is only partially evidenced; independent verification is incomplete.",
    minor:
      "Information about European Code of Conduct practices has not yet been provided.",
  },
  // v3.1 criterion id retained for stored runs in IndexedDB; v3.2 uses
  // sc_8_1_2_pue_measurement_compliance.
  sc_8_1_2_pue_existing: {
    critical:
      "Power Usage Effectiveness is materially worse than the level required for existing data centres.",
    material:
      "Power Usage Effectiveness is close to, but does not meet, the level required for existing data centres.",
    minor: "Annualised Power Usage Effectiveness has not yet been reported.",
  },
  sc_8_1_2_pue_measurement_compliance: {
    critical:
      "Your data centre does not yet evidence PUE measurement compliance to the EN 50600-4-2 / ISO/IEC 30134-2 standards.",
    material:
      "PUE measurement compliance is only partially evidenced; one of the five required items is outstanding.",
    minor:
      "Information about PUE measurement methodology, category, boundary, reporting basis, or independent audit has not yet been provided.",
  },
  dnsh_8_1_adaptation: {
    critical:
      "A climate-risk vulnerability assessment has not been completed for this site.",
    material:
      "A climate-risk vulnerability assessment is reported as completed, but its methodology is undocumented.",
    minor:
      "Information about climate-risk vulnerability has not yet been provided.",
  },
  dnsh_8_1_water: {
    critical:
      "Water Use Effectiveness exceeds the level required for this water-stressed location.",
    material:
      "Water Use Effectiveness is close to, but does not meet, the level required for this water-stressed location.",
    minor:
      "Information about site water use and water-stress classification has not yet been provided.",
  },
  dnsh_8_1_circular_economy: {
    critical:
      "Equipment and end-of-life arrangements do not yet evidence compliance with the EU circular-economy directives (Ecodesign, RoHS, WEEE).",
    material:
      "Circular-economy compliance is only partially evidenced; one or more directives remain unconfirmed.",
    minor:
      "Information about circular-economy compliance (Ecodesign, RoHS, WEEE) has not yet been provided.",
  },
  minimum_safeguards: {
    critical:
      "Minimum safeguards under Article 18 are not met on one or more pillars (human rights, bribery, taxation, fair competition).",
    material:
      "Minimum safeguards under Article 18 are only partially evidenced on one or more pillars.",
    minor:
      "Information about minimum-safeguards compliance under Article 18 has not yet been provided.",
  },
};

export const DEFAULT_PHRASE: Record<Severity, string> = {
  critical: "A required criterion is not yet evidenced.",
  material: "A required criterion is only partially evidenced.",
  minor: "Required inputs for a criterion have not yet been provided.",
};

export interface SnapshotRendererOptions {
  disclaimer: string;
  now?: () => string;
  maxGaps?: number;
  phraseTable?: SnapshotPhraseTable;
}

export class SnapshotRenderer implements Renderer<SnapshotOutput> {
  readonly entitlement = "snapshot" as const;

  private readonly disclaimer: string;
  private readonly now: () => string;
  private readonly maxGaps: number;
  private readonly phraseTable: SnapshotPhraseTable;

  constructor(opts: SnapshotRendererOptions) {
    this.disclaimer = opts.disclaimer;
    this.now = opts.now ?? (() => new Date().toISOString());
    this.maxGaps = opts.maxGaps ?? 5;
    this.phraseTable = opts.phraseTable ?? SNAPSHOT_PHRASES;
  }

  async render(run: EngineRun): Promise<SnapshotOutput> {
    const score = aggregateIndicativeScore(run.framework_results);
    return {
      run_id: run.run_id,
      indicative_score: score,
      indicative_band: bandFor(score),
      heatmap: this.buildHeatmap(run.framework_results),
      gap_list: this.buildGapList(run.gap_list),
      disclaimer: this.disclaimer,
      generated_at: this.now(),
      cta: "request_project_readiness_report",
    };
  }

  private buildHeatmap(frs: FrameworkResult[]): HeatmapCell[] {
    const frameworkCells: HeatmapCell[] = frs
      .filter((fr) => fr.overall_verdict !== "not_applicable")
      .map((fr) => ({
        framework: fr.framework,
        verdict: collapseVerdict(fr.overall_verdict),
      }));
    const safeguardsCell = buildSafeguardsCell(frs);
    return safeguardsCell ? [...frameworkCells, safeguardsCell] : frameworkCells;
  }

  private buildGapList(gaps: GapItem[]): SnapshotGap[] {
    return gaps.slice(0, this.maxGaps).map((g) => ({
      gap_id: g.gap_id,
      one_sentence_description: this.phraseFor(g),
    }));
  }

  private phraseFor(g: GapItem): string {
    const table = this.phraseTable[g.criterion_id];
    return (table ?? DEFAULT_PHRASE)[g.severity] ?? DEFAULT_PHRASE[g.severity];
  }
}

function aggregateIndicativeScore(frs: FrameworkResult[]): number {
  const counted = frs.filter((fr) => fr.overall_verdict !== "not_applicable");
  if (counted.length === 0) return 0;
  return Math.round(
    counted.reduce((s, fr) => s + fr.indicative_score, 0) / counted.length,
  );
}

function bandFor(score: number): "Green" | "Amber" | "Red" {
  if (score >= 75) return "Green";
  if (score >= 50) return "Amber";
  return "Red";
}

function collapseVerdict(v: Verdict): "pass" | "partial" | "fail" {
  if (v === "pass") return "pass";
  if (v === "fail") return "fail";
  // partial / data_missing both collapse to "partial" — IC-voice "not green yet".
  return "partial";
}

// Safeguards cell preserves data_missing as a distinct state. The free-tier
// snapshot's job is to communicate "you haven't given us the evidence yet" as
// a different signal from "the evidence you gave us doesn't quite meet the bar."
function collapseSafeguardsVerdict(v: Verdict): "pass" | "partial" | "fail" | "data_missing" {
  if (v === "pass") return "pass";
  if (v === "fail") return "fail";
  if (v === "data_missing") return "data_missing";
  return "partial";
}

function buildSafeguardsCell(frs: FrameworkResult[]): HeatmapCell | null {
  const fr = frs.find((f) => f.overall_verdict !== "not_applicable");
  if (!fr) return null;
  const rollup = (fr.safeguards_results ?? []).find((r) => r.criterion_id === "minimum_safeguards");
  return {
    framework: "minimum_safeguards",
    verdict: collapseSafeguardsVerdict(fr.minimum_safeguards_verdict),
    authority_level: rollup?.authority_level,
    pillar_verdicts: derivePillarVerdicts(rollup, fr.safeguards_results),
  };
}

function derivePillarVerdicts(
  rollup: CriterionResult | undefined,
  allSafeguardsResults: CriterionResult[] | undefined,
): PillarVerdict[] | undefined {
  // Prefer rollup's contributing_pillars (canonical per minimum_safeguards_rollup.ts).
  if (rollup?.contributing_pillars && rollup.contributing_pillars.length > 0) {
    const byPillar = new Map<string, Verdict>();
    for (const p of rollup.contributing_pillars) {
      byPillar.set(stripSafeguardsPrefix(p.criterion_id), p.verdict);
    }
    return PILLAR_IDS.map((id) => ({
      pillar_id: id,
      verdict: byPillar.get(id) ?? "data_missing",
    }));
  }
  // Fallback: derive from safeguards_results by criterion_id prefix.
  if (allSafeguardsResults && allSafeguardsResults.length > 0) {
    const byPillar = new Map<string, Verdict>();
    for (const r of allSafeguardsResults) {
      if (r.criterion_id === "minimum_safeguards") continue;
      byPillar.set(stripSafeguardsPrefix(r.criterion_id), r.verdict);
    }
    if (byPillar.size === 0) return undefined;
    return PILLAR_IDS.map((id) => ({
      pillar_id: id,
      verdict: byPillar.get(id) ?? "data_missing",
    }));
  }
  return undefined;
}

function stripSafeguardsPrefix(criterionId: string): string {
  return criterionId.replace(/^safeguards_/, "");
}
