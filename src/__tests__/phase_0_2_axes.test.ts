import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DeterministicEngine } from "../runtime";
import {
  BUNDLED_ACTIVITIES,
  compileValidator,
  validateActivity,
  validateFramework,
} from "../index";
import type { CriterionResult, ProjectInput } from "../engine";
import type { LogicFn } from "../logic/types";

const REPO_ROOT = path.resolve(__dirname, "../..");
const REAL_KB = path.join(REPO_ROOT, "regulatory-knowledge");
const REAL_SCHEMA = path.join(REAL_KB, "activity.schema.json");
const REAL_ACTIVITY = path.join(
  REAL_KB,
  "frameworks/eu_taxonomy_climate/eu_tax_climate_8_1.json",
);

describe("phase 0/0.2 — axis declaration enforcement (type-level)", () => {
  test("an EU Taxonomy criterion (project-only axes) cannot read input.entity", () => {
    // Declaring the function is the proof. The body's @ts-expect-error
    // line asserts the type system rejects reading an undeclared axis.
    // If the type system regressed and the access became legal, tsc would
    // report the directive as unused and the build would fail.
    const _fn: LogicFn<["project"]> = (input) => {
      // Legal: input.project is in the declared scope.
      const _facility = input.project.facility_type;
      void _facility;
      // @ts-expect-error — LogicFn<["project"]> may not read input.entity
      const _illegal = input.entity;
      void _illegal;
      return {
        criterion_id: input.criterion.id,
        verdict: "data_missing",
        gap_summary: "stub for type-enforcement test only",
        evidence_refs: [],
        scoring_logic_ref: "logic.test.v1",
        scoring_logic_version: "v1",
      } satisfies CriterionResult;
    };
    assert.equal(typeof _fn, "function");
  });
});

describe("phase 0/0.2 — Engine.run backward-compat overload", () => {
  test("accepts the legacy (ProjectInput, Activity[]) call shape unchanged", async () => {
    const engine = new DeterministicEngine({
      engine_commit_sha: "test_sha",
      knowledge_base_hash: "test_kb_hash",
      methodology_version: "v3.2",
      now: () => "2026-05-18T00:00:00.000Z",
      generateId: () => "test_run_id",
    });

    const projectInput: ProjectInput = {
      project_id: "test_proj_backcompat",
      intake_timestamp: "2026-05-18T00:00:00Z",
      facility_type: "hyperscale",
      jurisdiction: "DE",
      facility_status: "operational",
      data_points: {},
      evidence_documents: [],
    };

    // Legacy shape: (ProjectInput, Activity[]). BUNDLED_ACTIVITIES is
    // typed Activity[] — exactly the v0.3.0 caller shape.
    const run = await engine.run(projectInput, BUNDLED_ACTIVITIES);
    assert.equal(run.framework_results.length, BUNDLED_ACTIVITIES.length);
    assert.equal(run.run_id, "test_run_id");
    assert.equal(run.project_input.project_id, "test_proj_backcompat");
  });
});

describe("phase 0/0.2 — validateActivity / validateFramework equivalence", () => {
  test("both functions accept the EU 8.1 JSON and return equivalent validated data", async () => {
    const { validate } = await compileValidator(REAL_SCHEMA);
    const activityJson = JSON.parse(await fs.readFile(REAL_ACTIVITY, "utf8"));

    const activityResult = validateActivity(validate, activityJson);
    const frameworkResult = validateFramework(validate, activityJson);

    assert.equal(activityResult.valid, true, "validateActivity must accept EU 8.1 JSON");
    assert.equal(frameworkResult.valid, true, "validateFramework must accept EU 8.1 JSON");
    if (!activityResult.valid || !frameworkResult.valid) return;

    // validateActivity now delegates to validateFramework internally —
    // the two functions are equivalent on the validation outcome and
    // return structurally identical data (different field name only:
    // `activity` vs `framework`).
    assert.deepEqual(activityResult.activity, frameworkResult.framework);
  });
});
