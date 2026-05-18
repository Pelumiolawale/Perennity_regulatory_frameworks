import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ErrorObject } from "ajv";
import {
  loadKnowledgeBase,
  compileValidator,
  validateFramework,
  KnowledgeBaseValidationError,
  canonicalStringify,
  computeKnowledgeBaseHash,
  computeSchemaHash,
} from "../index";
import type {
  ProductLabelFramework,
  IssuanceFramework,
} from "../../framework";

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

// Pre-commit KB hash for the EU Taxonomy 8.1 framework, captured on main
// before this commit's schema restructure. The JSON file did not change,
// and computeKnowledgeBaseHash only hashes canonicalised activity bytes
// (NOT the schema), so this value MUST stay constant after the restructure.
// If this test fails, either the EU 8.1 JSON was accidentally edited or
// canonicalStringify / computeKnowledgeBaseHash drifted.
const EU_8_1_PRE_COMMIT_KB_HASH =
  "sha256:b3daee284e54f3fa5a62fe33e826d6586621ce61bf2afa337ddfe89ddc7dfd43";

describe("archetype-discriminated schema — phase-0/0.1", () => {
  test("validator accepts a minimal valid product_label framework", async () => {
    const { validate } = await compileValidator(REAL_SCHEMA);
    const fixture: ProductLabelFramework = {
      archetype: "product_label",
      id: "sfdr_article_8_test",
      framework: "SFDR",
      framework_version: "Regulation_2019_2088_consolidated_2024",
      framework_source_hash: "sha256:" + "0".repeat(64),
      methodology_version: "v3.2",
      effective_date: "2026-05-18",
      label_id: "sfdr_article_8",
      label_family: "sfdr",
      eligibility_criteria: [
        {
          id: "sfdr_a8_pai_consideration",
          criterion: "Principal Adverse Impact consideration",
          source_reference: "Regulation_2019_2088_Article_4_paragraph_1",
          source_text: "[verbatim text would be pulled from the canonical PAI RTS]",
          requirement_type: "compliance_attestation",
          scoring_logic_ref: "logic.sfdr_a8_pai_consideration.v1",
          input_scope: ["project", "entity"],
        },
      ],
    };
    const result = validateFramework(validate, fixture);
    assert.equal(
      result.valid,
      true,
      `expected product_label fixture to validate; errors=${
        result.valid ? "" : JSON.stringify(result.errors)
      }`,
    );
  });

  test("validator accepts a minimal valid issuance_framework", async () => {
    const { validate } = await compileValidator(REAL_SCHEMA);
    const fixture: IssuanceFramework = {
      archetype: "issuance_framework",
      id: "icma_gbp_2021_test",
      framework: "ICMA_GBP",
      framework_version: "ICMA_GBP_June_2021",
      framework_source_hash: "sha256:" + "0".repeat(64),
      methodology_version: "v3.2",
      effective_date: "2026-05-18",
      framework_id: "icma_gbp_2021",
      process_components: [
        {
          id: "use_of_proceeds",
          heading: "Use of Proceeds",
          criteria: [
            {
              id: "icma_gbp_use_of_proceeds_eligible_category",
              criterion: "Bond proceeds allocated to eligible green project categories",
              source_reference: "ICMA_GBP_2021_section_1_use_of_proceeds",
              source_text: "[verbatim ICMA GBP 2021 Section 1 text]",
              requirement_type: "compliance_attestation",
              scoring_logic_ref: "logic.icma_gbp_use_of_proceeds.v1",
              input_scope: ["project", "issuance"],
            },
          ],
        },
      ],
    };
    const result = validateFramework(validate, fixture);
    assert.equal(
      result.valid,
      true,
      `expected issuance_framework fixture to validate; errors=${
        result.valid ? "" : JSON.stringify(result.errors)
      }`,
    );
  });

  test("validator rejects product_label missing required label_id with a field-named error", async () => {
    const { validate } = await compileValidator(REAL_SCHEMA);
    const bad = {
      archetype: "product_label",
      id: "sfdr_test_bad",
      framework: "SFDR",
      framework_version: "v1",
      framework_source_hash: "sha256:" + "0".repeat(64),
      methodology_version: "v3.2",
      effective_date: "2026-05-18",
      // label_id intentionally omitted
      label_family: "sfdr",
      eligibility_criteria: [],
    };
    const result = validateFramework(validate, bad);
    assert.equal(result.valid, false, "expected validation to fail");
    if (result.valid) return;
    const labelIdError = result.errors.find(
      (e) =>
        e.keyword === "required" &&
        (e.params as { missingProperty?: string }).missingProperty === "label_id",
    );
    assert.ok(
      labelIdError,
      `expected a required:label_id error (the payoff of if/then/else over oneOf); got ${JSON.stringify(result.errors)}`,
    );
  });
});

describe("hashing — phase-0/0.1 invariants", () => {
  test("EU Taxonomy 8.1 KB hash matches the pre-commit value", async () => {
    const kb = await loadKnowledgeBase({ rootDir: REAL_KB });
    assert.equal(
      kb.knowledge_base_hash,
      EU_8_1_PRE_COMMIT_KB_HASH,
      "KB hash for the unchanged EU 8.1 framework must equal the pre-commit value",
    );
  });

  test("computeSchemaHash returns a well-formed sha256 digest on the new schema", async () => {
    const source = await fs.readFile(REAL_SCHEMA, "utf8");
    const hash = computeSchemaHash(source);
    assert.match(hash, /^sha256:[a-f0-9]{64}$/);
  });

  test("computeKnowledgeBaseHash returns a well-formed sha256 digest", () => {
    const minimal = {
      id: "test_format_check",
      framework: "EU_TAXONOMY_CLIMATE",
      framework_version: "v1",
      framework_source_hash: "sha256:" + "0".repeat(64),
      activity_code: "1.1",
      activity_name: "x",
      environmental_objective: "climate_change_mitigation",
      methodology_version: "v3.1",
      effective_date: "2026-01-01",
    } as const;
    const hash = computeKnowledgeBaseHash([minimal]);
    assert.match(hash, /^sha256:[a-f0-9]{64}$/);
  });
});
