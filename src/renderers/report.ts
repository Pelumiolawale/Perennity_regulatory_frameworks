import type {
  Activity,
  Criterion,
  CriterionResult,
  EngineRun,
  EvidenceLogEntry,
  FrameworkResult,
  ICDefencePack,
  PUESummary,
  Renderer,
  ReportOutput,
  ReportSection,
  Signatory,
  SourceReference,
} from "../engine";

export interface ReportRendererOptions {
  activities: Activity[];
  signatory: Signatory;
  disclaimer: string;
  engagement_reference_for: (run_id: string) => string;
  ic_defence_pack_version?: string;
  now?: () => string;
}

export class ReportRenderer implements Renderer<ReportOutput> {
  readonly entitlement = "report" as const;

  private readonly activitiesById: Map<string, Activity>;
  private readonly signatory: Signatory;
  private readonly disclaimer: string;
  private readonly engagementRefFor: (run_id: string) => string;
  private readonly defenceVersion: string;
  private readonly now: () => string;

  constructor(opts: ReportRendererOptions) {
    this.activitiesById = new Map(opts.activities.map((a) => [a.id, a]));
    this.signatory = opts.signatory;
    this.disclaimer = opts.disclaimer;
    this.engagementRefFor = opts.engagement_reference_for;
    this.defenceVersion = opts.ic_defence_pack_version ?? "v1";
    this.now = opts.now ?? (() => new Date().toISOString());
  }

  async render(run: EngineRun): Promise<ReportOutput> {
    return {
      run_id: run.run_id,
      engagement_reference: this.engagementRefFor(run.run_id),
      methodology_version: run.methodology_version,
      signatory: this.signatory,
      knowledge_base_hash: run.knowledge_base_hash,
      engine_commit_sha: run.engine_commit_sha,
      sections: this.buildSections(run),
      evidence_log: this.buildEvidenceLog(run),
      ic_defence_pack: this.buildDefencePack(),
      pue_summary: buildPueSummary(run),
      disclaimer: this.disclaimer,
      generated_at: this.now(),
    };
  }

  private buildSections(run: EngineRun): ReportSection[] {
    return [
      this.situation(run),
      this.frameworksApplied(run),
      this.evidencePresented(run),
      this.conclusions(run),
      this.residualDisclosure(run),
    ];
  }

  private situation(run: EngineRun): ReportSection {
    const p = run.project_input;
    const built = p.build_completion_year ? ` (build completion ${p.build_completion_year})` : "";
    return {
      section_id: "situation",
      heading: "Situation",
      narrative: `Project ${p.project_id} is a ${p.facility_type} data centre in ${p.jurisdiction}, currently in "${p.facility_status}" status${built}.`,
      references: [],
    };
  }

  private frameworksApplied(run: EngineRun): ReportSection {
    // Source-text excerpts are not duplicated here — they're attached to each
    // verdict in evidencePresented(). This section is the one-line per-activity
    // summary only. Previously this method also pushed an excerpt per
    // criterion; the PDF generator rendered that AND the same excerpts on the
    // Evidence Presented page, doubling the report length. See engine v0.2.1.
    const lines = run.framework_results.map(
      (fr) =>
        `${fr.framework} ${fr.framework_version} — activity ${fr.activity_id}, overall verdict: ${fr.overall_verdict}.`,
    );
    return {
      section_id: "frameworks_applied",
      heading: "Frameworks Applied",
      narrative: lines.join(" "),
      references: [],
    };
  }

  private evidencePresented(run: EngineRun): ReportSection {
    const lines: string[] = [];
    const references: SourceReference[] = [];
    for (const fr of run.framework_results) {
      const activity = this.activitiesById.get(fr.activity_id);
      const all = [
        ...fr.sc_results,
        ...fr.dnsh_results,
        ...(fr.safeguards_results ?? []),
        ...(fr.methodology_results ?? []),
      ];
      for (const r of all) {
        const observed = r.observed_value !== undefined && r.observed_value !== null
          ? `, observed: ${String(r.observed_value)}`
          : "";
        const threshold = r.threshold_value !== undefined && r.threshold_value !== null
          ? `, threshold: ${r.threshold_value}`
          : "";
        const c = findCriterion(activity, r.criterion_id);
        const authority = authorityLabel(c?.authority_level ?? r.authority_level ?? 1);
        const banded =
          r.verdict === "banded" && r.band_label
            ? `, band: ${r.band_label.replace(/_/g, " ")} (score ${r.band_score ?? "-"}, climate K1=${r.climate_k1 ?? "-"})${r.new_build_read ? `, new-build read: ${r.new_build_read.band_label.replace(/_/g, " ")} (score ${r.new_build_read.band_score})` : ""}`
            : "";
        lines.push(
          `[${authority}] Criterion ${r.criterion_id} — verdict ${r.verdict}${observed}${threshold}${banded}. ${r.gap_summary}`,
        );
        if (c) {
          references.push({
            framework: fr.framework,
            source_reference: c.source_reference,
            source_text_excerpt: c.source_text,
          });
        }
      }
    }
    return {
      section_id: "evidence_presented",
      heading: "Evidence Presented",
      narrative: lines.join("\n\n"),
      references,
    };
  }

  private conclusions(run: EngineRun): ReportSection {
    const lines = run.framework_results.map(
      (fr) =>
        `${fr.framework}: overall verdict ${fr.overall_verdict}, indicative score ${fr.indicative_score}.`,
    );
    return {
      section_id: "conclusions",
      heading: "Conclusions",
      narrative: lines.join(" "),
      references: [],
    };
  }

  private residualDisclosure(run: EngineRun): ReportSection {
    const lines = run.gap_list.map(
      (g) => `[${g.severity.toUpperCase()}] ${g.criterion_id}: ${g.ic_voice_description}`,
    );
    return {
      section_id: "residual_disclosure",
      heading: "Residual Disclosure",
      narrative: lines.join("\n"),
      references: [],
    };
  }

  private buildEvidenceLog(run: EngineRun): EvidenceLogEntry[] {
    const fieldsByDoc = new Map<string, string[]>();
    for (const fr of run.framework_results) {
      for (const r of [...fr.sc_results, ...fr.dnsh_results]) {
        for (const ref of r.evidence_refs) {
          const list = fieldsByDoc.get(ref) ?? [];
          list.push(r.criterion_id);
          fieldsByDoc.set(ref, list);
        }
      }
    }
    return run.project_input.evidence_documents.map((doc) => ({
      evidence_id: doc.document_id,
      document_id: doc.document_id,
      document_sha256: doc.sha256,
      fields_supported: fieldsByDoc.get(doc.document_id) ?? [],
      ingested_at: doc.uploaded_at,
    }));
  }

  private buildDefencePack(): ICDefencePack {
    // ICDefencePackBuilder is its own franchise asset (Ask B2/D4); the renderer
    // emits a versioned stub here. A separate builder fills questions in.
    return { pack_version: this.defenceVersion, questions: [] };
  }
}

function allCriteria(activity: Activity): Criterion[] {
  return [
    ...(activity.substantial_contribution_criteria ?? []),
    ...(activity.dnsh_criteria ?? []),
    ...(activity.safeguards_criteria ?? []),
    ...(activity.methodology_criteria ?? []),
  ];
}

function findCriterion(activity: Activity | undefined, id: string): Criterion | undefined {
  if (!activity) return undefined;
  return allCriteria(activity).find((c) => c.id === id);
}

function authorityLabel(level: 1 | 2 | 3): "Regulatory" | "Perennity Bridge methodology" | "Informational" {
  if (level === 1) return "Regulatory";
  if (level === 2) return "Perennity Bridge methodology";
  return "Informational";
}

function buildPueSummary(run: EngineRun): PUESummary | undefined {
  let pueResult: CriterionResult | undefined;
  for (const fr of run.framework_results) {
    pueResult = [...(fr.methodology_results ?? []), ...fr.sc_results].find(
      (r) => r.criterion_id === "sc_8_1_2_pue_measurement_compliance",
    );
    if (pueResult) break;
  }
  if (!pueResult) return undefined;

  const dp = run.project_input.data_points;
  return {
    declared: {
      methodology: stringOrNull(dp.pue_measurement_methodology_declared),
      category: stringOrNull(dp.pue_measurement_category),
      boundary_documented: booleanOrNull(dp.pue_measurement_boundary_documented),
      reporting_basis: stringOrNull(dp.pue_reporting_basis),
    },
    verdict: {
      label: pueResult.verdict,
      gap_summary: pueResult.gap_summary,
      missing_items: pueResult.missing_items ?? [],
      evidence_refs_count: pueResult.evidence_refs.length,
      authority_level: pueResult.authority_level,
    },
  };
}

function stringOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function booleanOrNull(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}
