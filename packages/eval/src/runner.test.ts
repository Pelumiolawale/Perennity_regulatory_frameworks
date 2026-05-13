import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { DeterministicEngine } from "../../engine/src/runtime";
import type {
  Activity,
  EngineRun,
  ProjectInput,
} from "../../engine/src/engine";

const FIXTURES_DIR = resolve(__dirname, "../fixtures");
const ACTIVITY_PATH = resolve(
  __dirname,
  "../../../regulatory-knowledge/frameworks/eu_taxonomy_climate/eu_tax_climate_8_1.json",
);

interface ExpectedProjection {
  verdicts: Record<string, string>;
  gap_ids: string[];
  scoring_logic_versions: Record<string, string>;
}

// Project an EngineRun down to the three comparison categories the fixture
// expected.json files encode: verdicts (per criterion), gap_ids (sorted), and
// scoring_logic_versions (per criterion). Keys are sorted/normalised so the
// comparison is order-independent and stable across runs.
function project(run: EngineRun): ExpectedProjection {
  const verdicts: Record<string, string> = {};
  const scoring_logic_versions: Record<string, string> = {};

  for (const fr of run.framework_results) {
    for (const r of [...fr.sc_results, ...fr.dnsh_results]) {
      verdicts[r.criterion_id] = r.verdict;
      scoring_logic_versions[r.criterion_id] = r.scoring_logic_version;
    }
  }

  return {
    verdicts: sortKeys(verdicts),
    gap_ids: run.gap_list.map((g) => g.gap_id).sort(),
    scoring_logic_versions: sortKeys(scoring_logic_versions),
  };
}

function sortKeys<T>(obj: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)),
  );
}

function normalizeExpected(e: ExpectedProjection): ExpectedProjection {
  return {
    verdicts: sortKeys(e.verdicts),
    gap_ids: [...e.gap_ids].sort(),
    scoring_logic_versions: sortKeys(e.scoring_logic_versions),
  };
}

const activity = JSON.parse(readFileSync(ACTIVITY_PATH, "utf8")) as Activity;
const activities: Activity[] = [activity];

const fixtureNames = readdirSync(FIXTURES_DIR)
  .filter((name) => statSync(join(FIXTURES_DIR, name)).isDirectory())
  .sort();

describe("engine fixtures", () => {
  for (const name of fixtureNames) {
    test(name, async () => {
      const inputPath = join(FIXTURES_DIR, name, "input.json");
      const expectedPath = join(FIXTURES_DIR, name, "expected.json");

      const input = JSON.parse(readFileSync(inputPath, "utf8")) as ProjectInput;
      const expected = normalizeExpected(
        JSON.parse(readFileSync(expectedPath, "utf8")) as ExpectedProjection,
      );

      const engine = new DeterministicEngine({
        engine_commit_sha: "fixture-sha",
        knowledge_base_hash: "sha256:fixture",
        methodology_version: "v3.1",
        now: () => "2026-05-13T00:00:00Z",
        generateId: () => `run-${name}`,
      });

      const run = await engine.run(input, activities);
      const actual = project(run);

      assert.deepEqual(actual, expected);
    });
  }
});
