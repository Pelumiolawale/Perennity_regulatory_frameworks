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
  ctx: { project: ProjectInput; entity?: EntityInput; framework_results: ReadonlyMap<string, FrameworkResult> },
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
      // Entity-required check: if the criterion's axes include "entity" but
      // ctx.entity is undefined, emit insufficient_evidence rather than
      // letting the scoring function crash on undefined access.
      if (c.axes.includes("entity") && ctx.entity === undefined) {
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
        });
      }
    }
    scored.set(c.criterion_id, score);
    out.push(scoreToResult(c.criterion_id, score));
  }

  return out;
}

function scoreToResult(criterion_id: string, s: SFDRCriterionScore): CriterionResult {
  const result: CriterionResult = {
    criterion_id,
    verdict: bandToVerdict(s.band),
    gap_summary: s.rationale_text,
    evidence_refs: s.evidence_refs ?? [],
    scoring_logic_ref: `sfdr.${criterion_id}.v1`,
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
  return result;
}

function bandToVerdict(band: SFDRBand): CriterionResult["verdict"] {
  // Bands map 1:1 to the verdict union — both share the same string values
  // since v0.5.0-alpha.2 widened Verdict to include the SFDR bands.
  return band as CriterionResult["verdict"];
}
