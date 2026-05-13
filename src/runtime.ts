import { randomUUID } from "node:crypto";
import type {
  Activity,
  Criterion,
  CriterionResult,
  Engine,
  EngineRun,
  FrameworkResult,
  GapItem,
  ProjectInput,
  ReplayManifest,
  Verdict,
} from "./engine";
import { getLogic } from "./logic/registry";
import type { LogicInput } from "./logic/types";

export interface EngineDeps {
  engine_commit_sha: string;
  knowledge_base_hash: string;
  methodology_version: string;
  // Injectable for deterministic tests.
  now?: () => string;
  generateId?: () => string;
}

export class DeterministicEngine implements Engine {
  private readonly engine_commit_sha: string;
  private readonly knowledge_base_hash: string;
  private readonly methodology_version: string;
  private readonly now: () => string;
  private readonly generateId: () => string;

  constructor(deps: EngineDeps) {
    this.engine_commit_sha = deps.engine_commit_sha;
    this.knowledge_base_hash = deps.knowledge_base_hash;
    this.methodology_version = deps.methodology_version;
    this.now = deps.now ?? (() => new Date().toISOString());
    this.generateId = deps.generateId ?? (() => randomUUID());
  }

  async run(input: ProjectInput, activities: Activity[]): Promise<EngineRun> {
    const framework_results = activities.map((a) => this.scoreActivity(a, input));
    return {
      run_id: this.generateId(),
      run_timestamp: this.now(),
      methodology_version: this.methodology_version,
      engine_commit_sha: this.engine_commit_sha,
      knowledge_base_hash: this.knowledge_base_hash,
      project_input: input,
      framework_results,
      gap_list: synthesizeGaps(framework_results),
    };
  }

  async replay(_runId: string, _manifest: ReplayManifest): Promise<EngineRun> {
    throw new Error("DeterministicEngine.replay is not yet implemented");
  }

  private scoreActivity(activity: Activity, input: ProjectInput): FrameworkResult {
    const sc_results = (activity.substantial_contribution_criteria ?? []).map((c) =>
      this.scoreCriterion(c, input),
    );
    const dnsh_results = (activity.dnsh_criteria ?? []).map((c) =>
      this.scoreCriterion(c, input),
    );
    // minimum_safeguards has no scoring_logic_ref in the schema; pending its own
    // logic function. Reported as data_missing so the verdict aggregator surfaces it.
    const minimum_safeguards_verdict: Verdict = "data_missing";
    return {
      framework: activity.framework,
      framework_version: activity.framework_version,
      framework_source_hash: activity.framework_source_hash,
      activity_id: activity.id,
      sc_results,
      dnsh_results,
      minimum_safeguards_verdict,
      overall_verdict: aggregateVerdict([
        ...sc_results.map((r) => r.verdict),
        ...dnsh_results.map((r) => r.verdict),
        minimum_safeguards_verdict,
      ]),
      indicative_score: indicativeScore(sc_results, dnsh_results),
    };
  }

  private scoreCriterion(criterion: Criterion, input: ProjectInput): CriterionResult {
    const fn = getLogic(criterion.scoring_logic_ref);
    if (!fn) {
      throw new Error(
        `No scoring logic registered for "${criterion.scoring_logic_ref}" (criterion ${criterion.id})`,
      );
    }
    const logicInput: LogicInput = {
      criterion,
      data_points: input.data_points,
      evidence_documents: input.evidence_documents,
      project: input,
    };
    return fn(logicInput);
  }
}

function aggregateVerdict(verdicts: Verdict[]): Verdict {
  if (verdicts.includes("fail")) return "fail";
  if (verdicts.includes("data_missing")) return "data_missing";
  if (verdicts.includes("partial")) return "partial";
  if (verdicts.length > 0 && verdicts.every((v) => v === "not_applicable")) return "not_applicable";
  return "pass";
}

function indicativeScore(sc: CriterionResult[], dnsh: CriterionResult[]): number {
  const counted = [...sc, ...dnsh].filter((r) => r.verdict !== "not_applicable");
  if (counted.length === 0) return 0;
  const points = counted.reduce(
    (s, r) => s + (r.verdict === "pass" ? 1 : r.verdict === "partial" ? 0.5 : 0),
    0,
  );
  return Math.round((points / counted.length) * 100);
}

function synthesizeGaps(results: FrameworkResult[]): GapItem[] {
  const gaps: GapItem[] = [];
  for (const fr of results) {
    for (const r of [...fr.sc_results, ...fr.dnsh_results]) {
      if (r.verdict === "pass" || r.verdict === "not_applicable") continue;
      gaps.push({
        gap_id: `${fr.activity_id}.${r.criterion_id}`,
        framework: fr.framework,
        criterion_id: r.criterion_id,
        severity:
          r.verdict === "fail"
            ? "critical"
            : r.verdict === "data_missing"
              ? "minor"
              : "material",
        ic_voice_description: r.gap_summary,
        remediation_summary: r.gap_summary,
      });
    }
  }
  return gaps.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
}

function severityRank(s: GapItem["severity"]): number {
  return s === "critical" ? 0 : s === "material" ? 1 : 2;
}
