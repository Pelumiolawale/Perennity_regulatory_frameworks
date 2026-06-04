// ============================================================================
// SFDR scoring orchestration (v0.5.0-alpha.2 — Phase 1, commit 1.2)
// ============================================================================
//
// Topological-sort + dispatch for SFDR criteria. Owns:
//   - Intra-framework dependencies (depends_on, e.g. criterion 5 → criterion 1)
//   - Cross-framework dependencies (depends_on_framework, e.g. criterion 6 →
//     EU Taxonomy 8.1)
//   - Cycle detection (loud-fail at orchestrate time; in practice fired at
//     framework-load when the validator calls this for shape-checks)
//
// SFDR criteria do NOT thread through src/logic/registry.ts. That registry
// stays narrow at LogicFn<["project"]> for EU Taxonomy. SFDR has its own
// registry mapping criterion_id → typed scoring function.
// ============================================================================

import type { CriterionResult, FrameworkResult, ProjectInput } from "../engine";
import type { EntityInput } from "../inputs";
import type { SharedCriterion } from "../knowledge/criterion-library";
import type { SFDRBand, SFDRCriterionScore } from "./types";

export interface SFDRScoringContext {
  project: ProjectInput;
  entity?: EntityInput;
  // Scored sibling criteria within this framework. Keyed by criterion_id.
  // Populated by the orchestrator before invoking dependent criteria.
  dependencies: ReadonlyMap<string, SFDRCriterionScore>;
  // Cross-framework results — keyed by framework_id. The orchestrator
  // ensures depends_on_framework entries are scored upstream and surfaces
  // them here.
  framework_results: ReadonlyMap<string, FrameworkResult>;
  // E5: framework_id being scored (e.g. "sfdr_v1_article_8" or
  // "sfdr_v1_article_9"). Lets criteria shared between Art 8 and Art 9
  // (c1-c7) emit label-aware rationale text rather than baking the
  // "Article 8" framing into rationale that surfaces in Art 9 PDFs.
  // Optional for backward compat with existing test fixtures; absence
  // is treated as Art 8 (the default phrasing for shared criteria).
  framework_id?: string;
}

export type SFDRScoringFn = (ctx: SFDRScoringContext) => SFDRCriterionScore;

// Build the directed graph from a list of criteria and topologically sort.
// Throws on cycles or unresolved depends_on at orchestrate time.
export function topologicalSort(criteria: SharedCriterion[]): SharedCriterion[] {
  const byId = new Map<string, SharedCriterion>();
  for (const c of criteria) byId.set(c.criterion_id, c);

  const sorted: SharedCriterion[] = [];
  const state = new Map<string, "white" | "grey" | "black">();
  for (const c of criteria) state.set(c.criterion_id, "white");

  function visit(c: SharedCriterion, path: string[]): void {
    const s = state.get(c.criterion_id);
    if (s === "black") return;
    if (s === "grey") {
      throw new Error(
        `SFDR dependency cycle detected: ${[...path, c.criterion_id].join(" -> ")}`,
      );
    }
    state.set(c.criterion_id, "grey");
    for (const depId of c.depends_on ?? []) {
      const dep = byId.get(depId);
      if (!dep) {
        throw new Error(
          `SFDR criterion "${c.criterion_id}" depends on unknown criterion "${depId}". ` +
            `Known criteria in this framework: ${[...byId.keys()].sort().join(", ")}.`,
        );
      }
      visit(dep, [...path, c.criterion_id]);
    }
    state.set(c.criterion_id, "black");
    sorted.push(c);
  }

  for (const c of criteria) visit(c, []);
  return sorted;
}

// Validate that every depends_on_framework in `criteria` is satisfiable from
// the available framework set. Called at framework-load time to surface
// missing cross-framework deps before scoring starts.
export function validateCrossFrameworkDeps(
  criteria: SharedCriterion[],
  availableFrameworkIds: ReadonlySet<string>,
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  for (const c of criteria) {
    for (const depFw of c.depends_on_framework ?? []) {
      if (!availableFrameworkIds.has(depFw)) {
        errors.push(
          `SFDR criterion "${c.criterion_id}" depends_on_framework "${depFw}" but no such framework is loaded.`,
        );
      }
    }
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// Orchestrate scoring for one SFDR framework's criteria. Returns CriterionResults
// in the order they should appear on the FrameworkResult.
export function scoreSFDRCriteria(
  criteria: SharedCriterion[],
  registry: ReadonlyMap<string, SFDRScoringFn>,
  ctx: {
    project: ProjectInput;
    entity?: EntityInput;
    framework_results: ReadonlyMap<string, FrameworkResult>;
    framework_id?: string;
  },
): CriterionResult[] {
  const sorted = topologicalSort(criteria);
  const scored = new Map<string, SFDRCriterionScore>();
  const out: CriterionResult[] = [];

  for (const c of sorted) {
    const fn = registry.get(c.criterion_id);
    let score: SFDRCriterionScore;
    if (!fn) {
      // Criterion declared in this framework but no scoring function
      // registered yet — stays not_implemented (Art 9 criteria 8-11 today).
      score = {
        band: "not_implemented",
        rationale_text: `Scoring for "${c.criterion_id}" is not yet implemented. Scheduled for Phase 1 commit 1.3 (Article 9 criteria).`,
      };
    } else {
      // Short-circuit guard: only fire when the criterion has NO axis from
      // which it can read data. ProjectInput is always present (required by
      // Engine.run), so any criterion that declares "project" is satisfiable
      // even when EntityInput is absent. Mixed-axis criteria (e.g. c9, c10
      // declare ["project", "entity"]) read project-level data primarily and
      // handle entity absence themselves — they must pass through to their
      // scoring function. Only entity-only criteria short-circuit here.
      const includesProject = c.axes.includes("project");
      const includesEntity = c.axes.includes("entity");
      if (includesEntity && !includesProject && ctx.entity === undefined) {
        score = {
          band: "insufficient_evidence",
          rationale_text: `Criterion "${c.criterion_id}" reads entity-level inputs but no EntityInput was supplied to Engine.run.`,
        };
      } else {
        score = fn({
          project: ctx.project,
          entity: ctx.entity,
          dependencies: scored,
          framework_results: ctx.framework_results,
          framework_id: ctx.framework_id,
        });
      }
    }
    scored.set(c.criterion_id, score);
    out.push(scoreToResult(c.criterion_id, score, ctx.framework_id));
  }

  return out;
}

// Aggregate a product_label framework's criterion verdicts into a single
// framework-level verdict (E4). Severity-rank cascade: any not_aligned wins
// over partially_aligned wins over insufficient_evidence wins over aligned
// wins over not_applicable. not_implemented criteria carry no signal and
// are skipped (an all-not_implemented framework rolls up to not_applicable).
//
// This is a structural rule, not weighted aggregation — SFDR weights stay
// null pending the post-Phase-1 calibration commit. The aggregate replaces
// the hardcoded "not_applicable" that made the Frameworks Applied narrative
// claim Art 9 was N/A even when 10 criteria had been scored.
export function aggregateProductLabelVerdict(
  results: CriterionResult[],
): CriterionResult["verdict"] {
  const scored = results.filter((r) => r.scoring_status !== "not_implemented");
  if (scored.length === 0) return "not_applicable";
  const verdicts = scored.map((r) => r.verdict);
  if (verdicts.includes("not_aligned")) return "not_aligned";
  if (verdicts.includes("partially_aligned")) return "partially_aligned";
  if (verdicts.includes("insufficient_evidence")) return "insufficient_evidence";
  if (verdicts.every((v) => v === "not_applicable")) return "not_applicable";
  return "aligned";
}

// Derive the scoring_logic_ref prefix from the criterion's regime. The
// orchestrator is shared across regulatory regimes that route through the
// SFDR scoring path (SFDR Art 8/9, UK SDR Focus/Improvers/Impact, future
// regimes); the per-criterion scoring_logic_ref needs to name the regime
// honestly for audit-trail readers. Pattern matches the criterion_id schema
// (`<regime>_v<n>_<slug>`): take everything up to the second underscore
// segment ending in v<n>. Examples: `sfdr_v1_dnsh_assessment` -> `sfdr`,
// `uk_sdr_v1_no_significant_harm` -> `uk_sdr`. Falls back to the literal
// criterion_id if the pattern doesn't match (defensive — surfaces the
// malformed id rather than silently emitting a misleading prefix).
function scoringLogicPrefix(criterion_id: string): string {
  const match = criterion_id.match(/^([a-z_]+?)_v\d+_/);
  return match ? match[1] : criterion_id;
}

function scoreToResult(
  criterion_id: string,
  s: SFDRCriterionScore,
  framework_id: string | undefined,
): CriterionResult {
  const result: CriterionResult = {
    criterion_id,
    verdict: bandToVerdict(s.band),
    gap_summary: s.rationale_text,
    evidence_refs: s.evidence_refs ?? [],
    scoring_logic_ref: `${scoringLogicPrefix(criterion_id)}.${criterion_id}.v1`,
    scoring_logic_version: "v1",
    rationale_text: s.rationale_text,
  };
  if (s.band === "not_implemented") {
    result.scoring_status = "not_implemented";
  }
  if (s.not_applicable_rationale !== undefined) {
    result.not_applicable_rationale = s.not_applicable_rationale;
  }
  if (s.numeric_value !== undefined) {
    result.numeric_value = s.numeric_value;
  }
  // E5 follow-up: stamp the framework under which this criterion was scored
  // so downstream consumers (SPA phrase tables, render contract) can route
  // label-aware rendering without re-deriving from the parent FrameworkResult.
  if (framework_id !== undefined) {
    result.applies_under = framework_id;
  }
  // v0.6.2: forward regulatory citations to CriterionResult. The field is
  // paid-tier-only — the snapshot gate test's DISALLOWED_KEYS walk blocks
  // any accidental forwarding into SnapshotOutput.
  if (s.regulatory_citations !== undefined && s.regulatory_citations.length > 0) {
    result.regulatory_citations = s.regulatory_citations;
  }
  return result;
}

function bandToVerdict(band: SFDRBand): CriterionResult["verdict"] {
  // Bands map 1:1 to the verdict union — both share the same string values
  // since v0.5.0-alpha.2 widened Verdict to include the SFDR bands.
  return band as CriterionResult["verdict"];
}
