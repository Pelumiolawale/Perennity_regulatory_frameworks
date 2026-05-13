# PLAN — Regulatory Knowledge Parser

A TypeScript module that validates activity JSON files against `regulatory-knowledge/activity.schema.json`, loads every activity under `regulatory-knowledge/frameworks/**/*.json` into memory, and produces a deterministic `knowledge_base_hash` over the loaded set. Intended as the trust root for downstream scoring: any change to the regulation corpus changes the hash, which surfaces in audit metadata on every report.

Target location: `packages/engine/src/knowledge/` (sits next to `engine.ts`). Single module, no new package.

---

## 1. Dependencies to add

Runtime:
- `ajv` (^8) — JSON Schema validator. Must use the **draft 2020-12 build** (`import Ajv from "ajv/dist/2020"`) because `activity.schema.json` declares `$schema: draft/2020-12` and the default Ajv 8 entrypoint is draft-07.
- `ajv-formats` — needed for `"format": "date"` on `effective_date`.
- `fast-glob` — recursive glob for `frameworks/**/*.json`. Preferred over `fs.glob` (Node 22+ only, still experimental) for portability.

Dev / types:
- `@types/node` (already expected in the engine package).
- No JSON-canonicalization dep planned: a hand-rolled stable stringify (recursive key-sort, no whitespace) is ~30 lines and avoids a transitive supply-chain surface for a hash function. If we'd rather pull one in, `fast-json-stable-stringify` is the standard pick. **Open question below.**

No new dev tooling (uses the package's existing tsc / test runner).

---

## 2. Public API

All exports from `packages/engine/src/knowledge/index.ts`.

```ts
// Types (hand-written, mirroring the schema; not codegenned — see open Q4)
export interface Activity { /* …fields from activity.schema.json… */ }
export interface KnowledgeBase {
  activities: Activity[];           // sorted by id, ascending
  byId: Map<string, Activity>;
  knowledge_base_hash: string;      // "sha256:<64 hex>"
  sourceFiles: string[];            // absolute paths, sorted, for audit logs
}

export interface LoadOptions {
  rootDir?: string;                 // default: "<repo>/regulatory-knowledge"
  schemaPath?: string;              // default: "<rootDir>/activity.schema.json"
  glob?: string;                    // default: "frameworks/**/*.json"
}

export interface ValidationIssue {
  file: string;
  errors: import("ajv").ErrorObject[];
}
export class KnowledgeBaseValidationError extends Error {
  issues: ValidationIssue[];
}

// Granular helpers (testable in isolation)
export function compileValidator(schemaPath: string): Promise<ValidateFn>;
export function validateActivity(
  validate: ValidateFn,
  data: unknown,
): { valid: true; activity: Activity } | { valid: false; errors: ErrorObject[] };
export function computeKnowledgeBaseHash(activities: Activity[]): string;

// One-call entry point used by the engine at startup
export function loadKnowledgeBase(opts?: LoadOptions): Promise<KnowledgeBase>;
```

`loadKnowledgeBase` is fail-fast-but-aggregating: it validates every file, and if any fail it throws `KnowledgeBaseValidationError` with the full list of issues — never a partial load. Duplicate `id` across files is also a hard error (see step 3.4).

---

## 3. Implementation outline

### 3.1 Compile the validator once
- Construct `new Ajv2020({ allErrors: true, strict: true })`, attach `ajv-formats`.
- The schema uses `enum: [..., null]` on nullable string fields — Ajv 8 accepts this without `allowUnionTypes`; the `type: ["string", "null"]` companion is what matters.
- `addSchema(activitySchema)` and return the compiled `ValidateFunction` for `#`.

### 3.2 Discover files
- `fast-glob(opts.glob ?? "frameworks/**/*.json", { cwd: rootDir, absolute: true })`.
- Sort the resulting paths lexicographically so discovery order is deterministic (defends against filesystem-order surprises across OSes).

### 3.3 Read + validate each file
- Read as UTF-8, `JSON.parse`, run through the compiled validator.
- Collect failures into `ValidationIssue[]`; do not throw until all files are processed (so the user gets the full picture in one pass).
- On total success, cast to `Activity[]`.

### 3.4 Cross-file invariants
- Reject duplicate `id` values across files (the schema can't enforce this; it's per-document). Include both file paths in the error so it's obvious which to fix.
- *Not* enforced here, but flagged: `supersedes` should reference a known id. **Open Q3.**

### 3.5 Deterministic hash
Goal: same set of activities → same hash, regardless of filesystem layout, file order, or key order inside objects.

Algorithm:
1. Sort activities by `id`.
2. For each activity, produce a canonical JSON string: recursive sort of all object keys, arrays in their declared order (order is meaningful for `substantial_contribution_criteria`, `dnsh_criteria`, `data_inputs_required`, etc.), no insignificant whitespace, JS numbers serialized via `JSON.stringify` (acceptable: the schema's numeric fields are bounded; no bigints).
3. Concatenate the canonical strings with `\n` separators.
4. `crypto.createHash("sha256").update(buffer).digest("hex")`, prefixed with `sha256:` to match the convention already used by `framework_source_hash`.

Hashing intentionally excludes filenames and the schema itself — a rename or directory reshuffle shouldn't bust the hash, but a single character of regulatory text change must. **Open Q1 covers the schema-version question.**

### 3.6 Wiring
- `loadKnowledgeBase` is the only thing the engine calls; the granular helpers exist for unit tests and for ad-hoc CLI use later.

---

## 4. Testing strategy (sketch — not part of this plan's deliverables)
- Fixture: the current `eu_tax_climate_8_1.json` plus a deliberately-broken copy (missing `methodology_version`) — expect aggregated error.
- Hash stability: load twice from a copy with reordered keys inside one activity — assert identical hash.
- Hash sensitivity: flip one character in `source_text` — assert different hash.
- Duplicate-id detection: two files declaring the same `id` — expect specific error.

---

## 5. Open questions

1. **Does the schema itself participate in the hash?** Today, only activity payloads are hashed. If a schema change widens/narrows what's permissible, two regulatory corpora that happen to pass under both schemas would hash identically. Options: (a) include `sha256(activity.schema.json)` as a prefix in the hash input; (b) expose it as a sibling `schema_hash` field on `KnowledgeBase`. (b) is cleaner for audit reporting but doesn't fail-loud on schema drift. **Recommend (b)** unless audit policy says otherwise.

2. **Canonicalization: hand-roll or `fast-json-stable-stringify`?** Hand-roll is ~30 lines, zero deps, fully auditable. The library is widely used, well-tested, but is another transitive dependency under the trust root. **Recommend hand-roll** given this is the hash backbone — explicit > clever.

3. **Should `supersedes` integrity be enforced at load time?** The schema only requires it to be a string. Enforcing "must reference a known id" turns a soft pointer into a hard graph constraint, which is right for production but may make local development of in-flight regulations annoying. Suggest: warn-only for now, harden later. Needs a call.

4. **Types: hand-written or codegen via `json-schema-to-typescript`?** Codegen guarantees the TS types and the schema can't drift; hand-written is simpler to read and review. The schema is small and stable enough that hand-written is probably fine — but if we expect frequent schema changes, codegen pays back fast.

5. **Module location.** Plan assumes `packages/engine/src/knowledge/`. If a future ingestion pipeline needs the parser without pulling in the scoring engine, this should be lifted to `packages/knowledge/` as its own package. Cheap to do now, harder later. Worth a quick decision.
