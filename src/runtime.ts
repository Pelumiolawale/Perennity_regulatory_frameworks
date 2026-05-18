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
import type {
  ActivityAlignedFramework,
  AnyFramework,
  ProductLabelFramework,
} from "./framework";
import type { EntityInput, RunInput } from "./inputs";
import { getLogic } from "./logic/registry";
import type { LogicInput } from "./logic/types";
import { scoreSFDRCriteria, SFDR_REGISTRY } from "./sfdr";
import { BUNDLED_SFDR_CRITERIA } from "./sfdr/bundled";

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

  // Overload 1 — legacy v0.3.0 shape: bare ProjectInput + Activity[]. Preserved
  // verbatim so existing callers (notably perennity-capital-readiness-platform)
  // keep type-checking after a pin bump.
  async run(input: ProjectInput, activities: Activity[]): Promise<EngineRun>;
  // Overload 2 — broadened shape: wrapped RunInput + AnyFramework[]. Use this
  // when the framework set includes non-activity_aligned archetypes
  // (product_label, issuance_framework) or when the run needs to carry
  // entity / issuance axes alongside project. The runtime only scores
  // activity_aligned today — product_label and issuance_framework entries
  // pass through unscored until their scoring lands in Phase 1 / Phase 3.
  async run(input: RunInput, frameworks: AnyFramework[]): Promise<EngineRun>;
  async run(
    input: ProjectInput | RunInput,
    frameworks: AnyFramework[],
  ): Promise<EngineRun> {
    // Discriminate by structural shape. RunInput has a `project` field
    // (the wrapper). ProjectInput has `project_id` at the top level and no
    // `project` field. The `!("project_id" in input)` guard avoids a
    // pathological ProjectInput that happens to be inside a wrapper.
    const projectInput: ProjectInput =
      "project" in input && !("project_id" in input) ? input.project : (input as ProjectInput);
    // Partition frameworks by archetype: activity_aligned get scored
    // normally; product_label v3.3 ref-based frameworks (Phase 1, commit
    // 1.1+) emit declared-but-not-scored FrameworkResults so the
    // downstream renderer can surface per-criterion "Pending implementation"
    // cells; issuance_framework and legacy product_label fixtures are still
    // skipped with a warning. Full SFDR scoring lands in commits 1.2 and 1.3.
    const activities: Activity[] = [];
    const productLabelV3_3: ProductLabelFramework[] = [];
    const warnings: string[] = [];
    for (const f of frameworks) {
      if (f.archetype === undefined || f.archetype === "activity_aligned") {
        activities.push(f as ActivityAlignedFramework);
      } else if (
        f.archetype === "product_label" &&
        Array.isArray((f as ProductLabelFramework).criteria)
      ) {
        // v3.3 ref-based product_label (e.g. sfdr_v1_article_8). Emit
        // not_implemented CriterionResults; warn that scoring isn't live yet.
        productLabelV3_3.push(f as ProductLabelFramework);
      } else {
        warnings.push(
          `Framework "${f.id}" declares archetype="${f.archetype}" but product-label and issuance-framework scoring is not implemented yet (Phase 1 / Phase 3 work). The framework will be skipped.`,
        );
      }
    }
    const activity_results = activities.map((a) => this.scoreActivity(a, projectInput));
    // Make activity-aligned framework_results available to SFDR criteria via
    // cross-framework dependency lookup. Keyed by framework.id so SFDR
    // criterion 6 can look up "eu_tax_climate_8_1".
    const fwResultsById = new Map<string, FrameworkResult>();
    for (let i = 0; i < activities.length; i++) {
      fwResultsById.set(activities[i].id, activity_results[i]);
    }
    const entityInput =
      "project" in input && !("project_id" in input) ? input.entity : undefined;
    const product_label_results = productLabelV3_3.map((p) =>
      this.scoreProductLabel(p, projectInput, entityInput, fwResultsById, warnings),
    );
    const framework_results = [...activity_results, ...product_label_results];
    return {
      run_id: this.generateId(),
      run_timestamp: this.now(),
      methodology_version: this.methodology_version,
      engine_commit_sha: this.engine_commit_sha,
      knowledge_base_hash: this.knowledge_base_hash,
      project_input: projectInput,
      framework_results,
      gap_list: synthesizeGaps(framework_results),
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  // v0.5.0-alpha.2 (Phase 1, commit 1.2): score a v3.3 product_label framework
  // through the SFDR orchestrator. Resolves criterion refs against the bundled
  // SFDR criterion library, dispatches by criterion_id, emits CriterionResults
  // carrying SFDR band verdicts + rationale + evidence_refs + numeric_value
  // where applicable. Criteria with no registered scoring function (Art 9
  // criteria 8-11 in this commit) fall through to not_implemented.
  //
  // The fwResultsById map carries upstream activity-aligned FrameworkResults
  // for cross-framework dependency lookup (SFDR criterion 6 reads EU Tax 8.1).
  private scoreProductLabel(
    framework: ProductLabelFramework,
    projectInput: ProjectInput,
    entityInput: EntityInput | undefined,
    fwResultsById: ReadonlyMap<string, FrameworkResult>,
    warnings: string[],
  ): FrameworkResult {
    const refs = framework.criteria ?? [];
    const criteria = refs
      .map((r) => BUNDLED_SFDR_CRITERIA.get(r.ref))
      .filter((c): c is NonNullable<typeof c> => c !== undefined);
    if (criteria.length !== refs.length) {
      warnings.push(
        `Framework "${framework.id}": ${refs.length - criteria.length} criterion ref(s) could not be resolved against the bundled SFDR library and were dropped from scoring.`,
      );
    }
    const sc_results = scoreSFDRCriteria(criteria, SFDR_REGISTRY, {
      project: projectInput,
      entity: entityInput,
      framework_results: fwResultsById,
    });
    // Warn if any criterion is still not_implemented. As of v0.5.0-alpha.4
    // (commit 1.3 / methodology v3.4) all 10 SFDR criteria — Art 8 (1–7)
    // and Art 9 (8–10) — are scored, so this should never fire for SFDR
    // frameworks. The check remains as a defensive guard for any future
    // criterion added to a framework JSON without a registered scoring fn.
    const stillPending = sc_results.filter((r) => r.scoring_status === "not_implemented");
    if (stillPending.length > 0) {
      warnings.push(
        `Framework "${framework.id}" has ${stillPending.length} criterion(criteria) without registered scoring logic (${stillPending.map((r) => r.criterion_id).join(", ")}). These cells will render as "Pending implementation".`,
      );
    }
    return {
      framework: framework.framework,
      framework_version: framework.framework_version,
      framework_source_hash: framework.framework_source_hash,
      activity_id: framework.id,
      sc_results,
      dnsh_results: [],
      safeguards_results: [],
      methodology_results: [],
      minimum_safeguards_verdict: "not_applicable",
      overall_verdict: "not_applicable",
      indicative_score: 0,
      archetype: "product_label",
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
      // v0.5.0-alpha.1 (Phase 1, commit 1.1): skip not_implemented criteria —
      // they surface in the heatmap as "Pending implementation" cells and
      // would otherwise dominate the gap list under SFDR labels with
      // non-actionable noise.
      if (r.scoring_status === "not_implemented") continue;
      // v0.5.0-alpha.2 (Phase 1, commit 1.2): SFDR cells carry their own
      // rationale_text per cell — they do NOT surface in the EU-Tax-style
      // gap_list. The gap list narrative is anchored to EU Tax-style
      // verdicts; SFDR remediation surfaces in the renderer-level
      // band-aware "what's missing" panel (lands in commit 1.4 with the
      // PDF renderer). Skip all SFDR band verdicts here for 1.2.
      if (
        r.verdict === "aligned" ||
        r.verdict === "partially_aligned" ||
        r.verdict === "not_aligned" ||
        r.verdict === "insufficient_evidence"
      ) {
        continue;
      }
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
