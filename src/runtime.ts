// Use the platform crypto.randomUUID() — available natively in modern Node
// (14.17+) and all evergreen browsers. Avoids the node:crypto import that
// otherwise externalizes to {} in browser builds and crashes on first call
// during snapshot generation.
const randomUUID = () => globalThis.crypto.randomUUID();
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

    // Safeguards: score independents first (no depends_on), then rollup with
    // previous_results populated. One pass is sufficient because the only
    // dependency edge in v3.2 is rollup → 4 pillars.
    const safeguards_results = scoreInDependencyOrder(
      activity.safeguards_criteria ?? [],
      input,
      (c, ctx) => this.scoreCriterion(c, input, ctx),
    );

    const methodology_results = (activity.methodology_criteria ?? []).map((c) =>
      this.scoreCriterion(c, input),
    );

    // minimum_safeguards_verdict comes from the rollup result when present;
    // otherwise data_missing. Heatmap aggregation now includes safeguards via
    // the rollup criterion (authority_level=1, snapshot_inclusion default).
    const rollup = safeguards_results.find((r) => r.criterion_id === "minimum_safeguards");
    const minimum_safeguards_verdict: Verdict = rollup?.verdict ?? "data_missing";

    // Heatmap aggregation: authority_level === 1 only. Methodology criteria
    // (level 2) never contribute to alignment routing.
    const heatmapInputs = collectAuthorityOneVerdicts(activity, [
      ...sc_results,
      ...dnsh_results,
      ...safeguards_results,
    ]);

    return {
      framework: activity.framework,
      framework_version: activity.framework_version,
      framework_source_hash: activity.framework_source_hash,
      activity_id: activity.id,
      sc_results,
      dnsh_results,
      safeguards_results,
      methodology_results,
      minimum_safeguards_verdict,
      overall_verdict: aggregateVerdict(heatmapInputs),
      indicative_score: indicativeScore(sc_results, dnsh_results, safeguards_results),
    };
  }

  private scoreCriterion(
    criterion: Criterion,
    input: ProjectInput,
    previous_results?: Record<string, CriterionResult>,
  ): CriterionResult {
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
      previous_results,
    };
    return fn(logicInput);
  }
}

// Resolve criteria in dependency order. Criteria without `depends_on` (or with
// all dependencies already scored) are scored first; the rest follow with the
// completed-results map passed in. Not a general DAG solver — sufficient for
// the v3.2 single-level rollup pattern, errors loudly on cycles or unresolved
// dependencies.
function scoreInDependencyOrder(
  criteria: Criterion[],
  _input: ProjectInput,
  scoreOne: (c: Criterion, prev: Record<string, CriterionResult>) => CriterionResult,
): CriterionResult[] {
  const results: CriterionResult[] = [];
  const completed: Record<string, CriterionResult> = {};
  const remaining = [...criteria];

  let safetyTicker = remaining.length * 2 + 1;
  while (remaining.length > 0) {
    if (safetyTicker-- <= 0) {
      throw new Error(
        `scoreInDependencyOrder: cycle or unresolved depends_on among [${remaining.map((c) => c.id).join(", ")}]`,
      );
    }
    let progress = false;
    for (let i = 0; i < remaining.length; ) {
      const c = remaining[i];
      const deps = c.depends_on ?? [];
      if (deps.every((d) => d in completed)) {
        const r = scoreOne(c, completed);
        results.push(r);
        completed[c.id] = r;
        remaining.splice(i, 1);
        progress = true;
      } else {
        i++;
      }
    }
    if (!progress) {
      throw new Error(
        `scoreInDependencyOrder: cannot resolve depends_on for [${remaining.map((c) => c.id).join(", ")}]`,
      );
    }
  }
  return results;
}

// Collect verdicts from authority_level === 1 criteria across SC + DNSH +
// safeguards. authority_level defaults to 1 when omitted (backward-compat for
// criteria that pre-date the v0.2.0 schema field).
function collectAuthorityOneVerdicts(
  activity: Activity,
  results: CriterionResult[],
): Verdict[] {
  const criterionById = new Map<string, Criterion>();
  for (const c of [
    ...(activity.substantial_contribution_criteria ?? []),
    ...(activity.dnsh_criteria ?? []),
    ...(activity.safeguards_criteria ?? []),
    ...(activity.methodology_criteria ?? []),
  ]) {
    criterionById.set(c.id, c);
  }
  return results
    .filter((r) => {
      const c = criterionById.get(r.criterion_id);
      const level = c?.authority_level ?? 1;
      return level === 1;
    })
    .map((r) => r.verdict);
}

export function aggregateVerdict(verdicts: Verdict[]): Verdict {
  if (verdicts.includes("fail")) return "fail";
  if (verdicts.includes("data_missing")) return "data_missing";
  if (verdicts.includes("partial")) return "partial";
  if (verdicts.length > 0 && verdicts.every((v) => v === "not_applicable")) return "not_applicable";
  return "pass";
}

function indicativeScore(
  sc: CriterionResult[],
  dnsh: CriterionResult[],
  safeguards: CriterionResult[] = [],
): number {
  // Score only authority_level=1 criteria; treat the rollup as the safeguards
  // proxy to avoid double-counting the four individual pillars. Banded results
  // are not scored here (they sit on the paid report only).
  const considered = [...sc, ...dnsh, ...safeguards].filter(
    (r) =>
      r.verdict !== "not_applicable" &&
      r.verdict !== "banded" &&
      r.verdict !== "deprecated" &&
      // exclude the four individual safeguards pillars; rollup speaks for them
      !r.criterion_id.startsWith("safeguards_"),
  );
  if (considered.length === 0) return 0;
  const points = considered.reduce(
    (s, r) => s + (r.verdict === "pass" ? 1 : r.verdict === "partial" ? 0.5 : 0),
    0,
  );
  return Math.round((points / considered.length) * 100);
}

function synthesizeGaps(results: FrameworkResult[]): GapItem[] {
  const gaps: GapItem[] = [];
  for (const fr of results) {
    const all = [
      ...fr.sc_results,
      ...fr.dnsh_results,
      ...(fr.safeguards_results ?? []),
      // methodology_results intentionally excluded — banded benchmarks are
      // never gap-listed; they render on the paid report as a separate block.
    ];
    for (const r of all) {
      if (r.verdict === "pass" || r.verdict === "not_applicable") continue;
      if (r.verdict === "banded" || r.verdict === "deprecated") continue;
      // Skip individual safeguards pillars in gap list — rollup represents
      // them. Avoids double-counting "pillar partial" + "rollup partial".
      if (r.criterion_id.startsWith("safeguards_")) continue;
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
