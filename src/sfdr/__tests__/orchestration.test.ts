/**
 * SFDR orchestration — topological sort + cycle detection + cross-framework
 * dependency validation (v0.5.0-alpha.2 — Phase 1, commit 1.2).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  topologicalSort,
  validateCrossFrameworkDeps,
} from "../orchestration";
import type { SharedCriterion } from "../../knowledge/criterion-library";

function crit(id: string, depends_on: string[] = []): SharedCriterion {
  return {
    criterion_id: id,
    name: id,
    regime: "sfdr_v1",
    regulatory_anchors: [{ regulation: "Test", celex: "X", article: "Y" }],
    axes: ["project"],
    applies_to: ["test_fw"],
    scoring_status: "implemented",
    methodology_version_introduced: "v3.3",
    summary: "test",
    depends_on,
  };
}

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
