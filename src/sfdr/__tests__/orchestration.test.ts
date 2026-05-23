/**
 * SFDR orchestration — topological sort + cycle detection + cross-framework
 * dependency validation (v0.5.0-alpha.2 — Phase 1, commit 1.2).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  topologicalSort,
  validateCrossFrameworkDeps,
  scoreSFDRCriteria,
  aggregateProductLabelVerdict,
  type SFDRScoringFn,
} from "../orchestration";
import type { CriterionResult } from "../../engine";
import type {
  CriterionAxis,
  SharedCriterion,
} from "../../knowledge/criterion-library";
import type { ProjectInput, FrameworkResult } from "../../engine";

function crit(
  id: string,
  depends_on: string[] = [],
  axes: CriterionAxis[] = ["project"],
): SharedCriterion {
  return {
    criterion_id: id,
    name: id,
    regime: "sfdr_v1",
    regulatory_anchors: [{ regulation: "Test", celex: "X", article: "Y" }],
    axes,
    applies_to: ["test_fw"],
    scoring_status: "implemented",
    methodology_version_introduced: "v3.3",
    summary: "test",
    depends_on,
  };
}

const STUB_PROJECT = {} as unknown as ProjectInput;
const NO_FW_RESULTS: ReadonlyMap<string, FrameworkResult> = new Map();

describe("topologicalSort", () => {
  test("orders dependencies before dependents", () => {
    const a = crit("sfdr_v1_a");
    const b = crit("sfdr_v1_b", ["sfdr_v1_a"]);
    const c = crit("sfdr_v1_c", ["sfdr_v1_b"]);
    // Input order intentionally scrambled.
    const sorted = topologicalSort([c, a, b]);
    const order = sorted.map((s) => s.criterion_id);
    assert.ok(order.indexOf("sfdr_v1_a") < order.indexOf("sfdr_v1_b"));
    assert.ok(order.indexOf("sfdr_v1_b") < order.indexOf("sfdr_v1_c"));
  });

  test("throws on a self-cycle", () => {
    const a = crit("sfdr_v1_a", ["sfdr_v1_a"]);
    assert.throws(() => topologicalSort([a]), /cycle/i);
  });

  test("throws on a multi-criterion cycle", () => {
    const a = crit("sfdr_v1_a", ["sfdr_v1_b"]);
    const b = crit("sfdr_v1_b", ["sfdr_v1_a"]);
    assert.throws(() => topologicalSort([a, b]), /cycle/i);
  });

  test("throws on a depends_on that doesn't exist", () => {
    const a = crit("sfdr_v1_a", ["sfdr_v1_missing"]);
    assert.throws(() => topologicalSort([a]), /unknown criterion/i);
  });

  test("ordering is stable when no dependencies declared", () => {
    const a = crit("sfdr_v1_a");
    const b = crit("sfdr_v1_b");
    const sorted = topologicalSort([a, b]);
    assert.deepEqual(sorted.map((s) => s.criterion_id), ["sfdr_v1_a", "sfdr_v1_b"]);
  });
});

describe("validateCrossFrameworkDeps", () => {
  test("ok when all depends_on_framework entries are loaded", () => {
    const c = crit("sfdr_v1_dependent");
    c.depends_on_framework = ["eu_tax_climate_8_1"];
    const result = validateCrossFrameworkDeps([c], new Set(["eu_tax_climate_8_1"]));
    assert.equal(result.ok, true);
  });

  test("errors when a depends_on_framework target is missing", () => {
    const c = crit("sfdr_v1_dependent");
    c.depends_on_framework = ["does_not_exist"];
    const result = validateCrossFrameworkDeps([c], new Set(["eu_tax_climate_8_1"]));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.errors.length, 1);
      assert.match(result.errors[0], /does_not_exist/);
    }
  });
});

describe("scoreSFDRCriteria — entity-axis short-circuit guard", () => {
  // Tracks whether the scoring function was actually invoked. The guard's
  // job is to gate the call; the regression these tests protect against is
  // the v0.5.0 bug where mixed-axis criteria (project + entity) were
  // short-circuited and their scoring functions never ran.
  function spyFn(): { fn: SFDRScoringFn; called: boolean } {
    const state = { called: false };
    const fn: SFDRScoringFn = () => {
      state.called = true;
      return { band: "aligned", rationale_text: "spy scored" };
    };
    return {
      fn,
      get called() {
        return state.called;
      },
    } as { fn: SFDRScoringFn; called: boolean };
  }

  test("entity-only criterion short-circuits when ctx.entity is missing", () => {
    const c = crit("sfdr_v1_entity_only", [], ["entity"]);
    const spy = spyFn();
    const registry = new Map([[c.criterion_id, spy.fn]]);
    const results = scoreSFDRCriteria([c], registry, {
      project: STUB_PROJECT,
      entity: undefined,
      framework_results: NO_FW_RESULTS,
    });
    assert.equal(spy.called, false);
    assert.equal(results[0].verdict, "insufficient_evidence");
    assert.match(results[0].rationale_text!, /no EntityInput was supplied/);
  });

  test("entity-only criterion runs when ctx.entity is provided", () => {
    const c = crit("sfdr_v1_entity_only", [], ["entity"]);
    const spy = spyFn();
    const registry = new Map([[c.criterion_id, spy.fn]]);
    const results = scoreSFDRCriteria([c], registry, {
      project: STUB_PROJECT,
      entity: {} as never,
      framework_results: NO_FW_RESULTS,
    });
    assert.equal(spy.called, true);
    assert.equal(results[0].verdict, "aligned");
  });

  test("E1 regression: project_pai_data_provision (axes: project+entity) runs when entity is missing", () => {
    // Mirrors the real c10 criterion shape — axes ["project", "entity"] —
    // and proves the v0.5.0 guard no longer short-circuits this criterion.
    // The scoring function for c10 reads project.sfdr.art9.pai_data; it
    // never touches ctx.entity. Pre-fix, the orchestrator returned
    // insufficient_evidence with "no EntityInput was supplied" before the
    // function got a chance to read its project-level inputs.
    const c = crit("sfdr_v1_project_pai_data_provision", [], ["project", "entity"]);
    const spy = spyFn();
    const registry = new Map([[c.criterion_id, spy.fn]]);
    const results = scoreSFDRCriteria([c], registry, {
      project: STUB_PROJECT,
      entity: undefined,
      framework_results: NO_FW_RESULTS,
    });
    assert.equal(spy.called, true);
    assert.equal(results[0].verdict, "aligned");
    assert.doesNotMatch(results[0].rationale_text!, /no EntityInput was supplied/);
  });

  test("E2 regression: si_eligibility_evidence_pack (axes: project+entity) runs when entity is missing", () => {
    const c = crit("sfdr_v1_si_eligibility_evidence_pack", [], ["project", "entity"]);
    const spy = spyFn();
    const registry = new Map([[c.criterion_id, spy.fn]]);
    const results = scoreSFDRCriteria([c], registry, {
      project: STUB_PROJECT,
      entity: undefined,
      framework_results: NO_FW_RESULTS,
    });
    assert.equal(spy.called, true);
    assert.equal(results[0].verdict, "aligned");
    assert.doesNotMatch(results[0].rationale_text!, /no EntityInput was supplied/);
  });

  test("project-only criterion always runs (regression)", () => {
    const c = crit("sfdr_v1_project_only", [], ["project"]);
    const spy = spyFn();
    const registry = new Map([[c.criterion_id, spy.fn]]);
    const results = scoreSFDRCriteria([c], registry, {
      project: STUB_PROJECT,
      entity: undefined,
      framework_results: NO_FW_RESULTS,
    });
    assert.equal(spy.called, true);
    assert.equal(results[0].verdict, "aligned");
  });

  // E5 follow-up: applies_under is stamped on every emitted CriterionResult
  // so downstream consumers (SPA phrase tables, render contract) can route
  // label-aware narrative without re-deriving framework from the parent.
  test("applies_under is set from ctx.framework_id when supplied", () => {
    const c = crit("sfdr_v1_project_only", [], ["project"]);
    const spy = spyFn();
    const registry = new Map([[c.criterion_id, spy.fn]]);
    const results = scoreSFDRCriteria([c], registry, {
      project: STUB_PROJECT,
      entity: undefined,
      framework_results: NO_FW_RESULTS,
      framework_id: "sfdr_v1_article_9",
    });
    assert.equal(results[0].applies_under, "sfdr_v1_article_9");
  });

  test("applies_under is omitted when framework_id is not provided", () => {
    const c = crit("sfdr_v1_project_only", [], ["project"]);
    const spy = spyFn();
    const registry = new Map([[c.criterion_id, spy.fn]]);
    const results = scoreSFDRCriteria([c], registry, {
      project: STUB_PROJECT,
      entity: undefined,
      framework_results: NO_FW_RESULTS,
    });
    assert.equal(results[0].applies_under, undefined);
  });

  test("applies_under is set even on entity-axis short-circuit path", () => {
    // Sanity check: the short-circuit guard path also routes through
    // scoreToResult, so applies_under must still be stamped even when the
    // scoring function never runs.
    const c = crit("sfdr_v1_entity_only", [], ["entity"]);
    const spy = spyFn();
    const registry = new Map([[c.criterion_id, spy.fn]]);
    const results = scoreSFDRCriteria([c], registry, {
      project: STUB_PROJECT,
      entity: undefined,
      framework_results: NO_FW_RESULTS,
      framework_id: "sfdr_v1_article_8",
    });
    assert.equal(spy.called, false);
    assert.equal(results[0].verdict, "insufficient_evidence");
    assert.equal(results[0].applies_under, "sfdr_v1_article_8");
  });
});

describe("aggregateProductLabelVerdict — E4 framework rollup", () => {
  function res(
    verdict: CriterionResult["verdict"],
    extra: Partial<CriterionResult> = {},
  ): CriterionResult {
    return {
      criterion_id: `c_${verdict}`,
      verdict,
      gap_summary: "",
      evidence_refs: [],
      scoring_logic_ref: "test.v1",
      scoring_logic_version: "v1",
      ...extra,
    };
  }

  test("all aligned → aligned", () => {
    assert.equal(
      aggregateProductLabelVerdict([res("aligned"), res("aligned")]),
      "aligned",
    );
  });

  test("aligned + not_applicable → aligned", () => {
    assert.equal(
      aggregateProductLabelVerdict([res("aligned"), res("not_applicable")]),
      "aligned",
    );
  });

  test("any not_aligned → not_aligned (severity wins)", () => {
    assert.equal(
      aggregateProductLabelVerdict([
        res("aligned"),
        res("partially_aligned"),
        res("not_aligned"),
        res("insufficient_evidence"),
      ]),
      "not_aligned",
    );
  });

  test("any partially_aligned (no not_aligned) → partially_aligned", () => {
    assert.equal(
      aggregateProductLabelVerdict([
        res("aligned"),
        res("partially_aligned"),
        res("insufficient_evidence"),
      ]),
      "partially_aligned",
    );
  });

  test("any insufficient_evidence (no fails or partials) → insufficient_evidence", () => {
    assert.equal(
      aggregateProductLabelVerdict([
        res("aligned"),
        res("insufficient_evidence"),
        res("not_applicable"),
      ]),
      "insufficient_evidence",
    );
  });

  test("all not_applicable → not_applicable", () => {
    assert.equal(
      aggregateProductLabelVerdict([res("not_applicable"), res("not_applicable")]),
      "not_applicable",
    );
  });

  test("empty input → not_applicable", () => {
    assert.equal(aggregateProductLabelVerdict([]), "not_applicable");
  });

  test("not_implemented criteria are skipped from aggregation", () => {
    assert.equal(
      aggregateProductLabelVerdict([
        res("aligned"),
        res("data_missing", { scoring_status: "not_implemented" }),
      ]),
      "aligned",
    );
  });

  test("all not_implemented → not_applicable (no signal)", () => {
    assert.equal(
      aggregateProductLabelVerdict([
        res("data_missing", { scoring_status: "not_implemented" }),
        res("data_missing", { scoring_status: "not_implemented" }),
      ]),
      "not_applicable",
    );
  });

  test("plan example: 7 insufficient_evidence + 2 not_aligned + 1 not_applicable → not_aligned", () => {
    // Per the engine-bugs follow-up plan: with 7 of 10 SFDR Art 9 criteria
    // returning insufficient_evidence, 2 returning not_aligned, 1 returning
    // not_applicable — overall_verdict should be not_aligned.
    const results = [
      ...Array(7).fill(null).map(() => res("insufficient_evidence")),
      res("not_aligned"),
      res("not_aligned"),
      res("not_applicable"),
    ];
    assert.equal(aggregateProductLabelVerdict(results), "not_aligned");
  });
});
