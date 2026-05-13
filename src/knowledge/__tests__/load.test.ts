import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ErrorObject } from "ajv";
import {
  loadKnowledgeBase,
  KnowledgeBaseValidationError,
  canonicalStringify,
  computeKnowledgeBaseHash,
} from "../index";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const REAL_KB = path.join(REPO_ROOT, "regulatory-knowledge");
const REAL_SCHEMA = path.join(REAL_KB, "activity.schema.json");
const REAL_ACTIVITY = path.join(
  REAL_KB,
  "frameworks/eu_taxonomy_climate/eu_tax_climate_8_1.json",
);

async function makeFixture(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pb-kb-"));
  await fs.copyFile(REAL_SCHEMA, path.join(root, "activity.schema.json"));
  await fs.mkdir(path.join(root, "frameworks/test"), { recursive: true });
  return root;
}

describe("loadKnowledgeBase — valid input", () => {
  test("loads the real activity, populates byId, returns sha256 hashes", async () => {
    const kb = await loadKnowledgeBase({ rootDir: REAL_KB });

    assert.equal(kb.activities.length, 1);
    assert.equal(kb.activities[0].id, "eu_tax_climate_8_1");
    assert.equal(kb.byId.get("eu_tax_climate_8_1"), kb.activities[0]);
    assert.equal(kb.sourceFiles.length, 1);
    assert.match(kb.knowledge_base_hash, /^sha256:[a-f0-9]{64}$/);
    assert.match(kb.schema_hash, /^sha256:[a-f0-9]{64}$/);
    assert.deepEqual(kb.warnings, []);
  });
});

describe("loadKnowledgeBase — invalid input", () => {
  test("missing required field produces a precise required-property error", async () => {
    const root = await makeFixture();
    try {
      const activity = JSON.parse(await fs.readFile(REAL_ACTIVITY, "utf8"));
      delete activity.methodology_version;
      const badFile = path.join(root, "frameworks/test/no_methodology.json");
      await fs.writeFile(badFile, JSON.stringify(activity));

      await assert.rejects(
        () => loadKnowledgeBase({ rootDir: root }),
        (err: unknown) => {
          assert.ok(
            err instanceof KnowledgeBaseValidationError,
            `expected KnowledgeBaseValidationError, got ${(err as Error)?.constructor?.name}`,
          );
          assert.equal(err.issues.length, 1);
          assert.equal(err.issues[0].file, badFile);

          const requiredError = err.issues[0].errors.find(
            (e: ErrorObject) =>
              e.keyword === "required" &&
              (e.params as { missingProperty?: string }).missingProperty ===
                "methodology_version",
          );
          assert.ok(
            requiredError,
            `expected a required:methodology_version error; got ${JSON.stringify(err.issues[0].errors)}`,
          );
          return true;
        },
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test("duplicate activity id across files is reported with both paths", async () => {
    const root = await makeFixture();
    try {
      const activityText = await fs.readFile(REAL_ACTIVITY, "utf8");
      const fileA = path.join(root, "frameworks/test/dup_a.json");
      const fileB = path.join(root, "frameworks/test/dup_b.json");
      await fs.writeFile(fileA, activityText);
      await fs.writeFile(fileB, activityText);

      await assert.rejects(
        () => loadKnowledgeBase({ rootDir: root }),
        (err: unknown) => {
          assert.ok(err instanceof KnowledgeBaseValidationError);
          const dup = err.issues
            .flatMap((i) => i.errors)
            .find((e: ErrorObject) => e.keyword === "duplicate");
          assert.ok(dup, "expected a duplicate-id error");
          assert.match(
            dup.message ?? "",
            /eu_tax_climate_8_1/,
            "error message should name the conflicting id",
          );
          return true;
        },
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe("knowledge_base_hash — stability", () => {
  test("two independent loads of the same data produce the same hash", async () => {
    const a = await loadKnowledgeBase({ rootDir: REAL_KB });
    const b = await loadKnowledgeBase({ rootDir: REAL_KB });
    assert.equal(a.knowledge_base_hash, b.knowledge_base_hash);
    assert.equal(a.schema_hash, b.schema_hash);
  });

  test("canonical form is invariant to object key insertion order", () => {
    const a = { id: "x", framework: "EU_TAXONOMY_CLIMATE", value: 1 };
    const b = { value: 1, framework: "EU_TAXONOMY_CLIMATE", id: "x" };
    assert.equal(canonicalStringify(a), canonicalStringify(b));
  });

  test("hash flips when activity content changes", () => {
    const base = {
      id: "a",
      framework: "EU_TAXONOMY_CLIMATE",
      framework_version: "v1",
      framework_source_hash: "sha256:" + "0".repeat(64),
      activity_code: "8.1",
      activity_name: "x",
      environmental_objective: "climate_change_mitigation",
      methodology_version: "v3.1",
      effective_date: "2026-01-01",
    } as const;
    const h1 = computeKnowledgeBaseHash([base]);
    const h2 = computeKnowledgeBaseHash([{ ...base, activity_name: "y" }]);
    assert.notEqual(h1, h2);
  });
});
