// ============================================================================
// Shared criterion library — loader + ref resolution (v3.3, Phase 1, commit 1.1)
// ============================================================================
//
// Standalone criterion files live under regulatory-knowledge/criteria/<regime>/
// and are validated by criterion.schema.json. Framework JSONs reference them
// via { ref, weight } entries in the top-level `criteria` array.
//
// This module:
//   - Validates and loads the criterion library at startup
//   - Resolves ref-based framework criteria against the library
//   - Performs cross-checks (criterion.applies_to contains framework.id,
//     criterion.regime matches framework.regime)
//
// Engine.run does NOT call this directly. Callers (tests, app-side loaders)
// resolve refs upstream and hand fully-resolved frameworks into the runtime.
// ============================================================================

import { promises as fs } from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";

export type CriterionScoringStatus = "not_implemented" | "implemented" | "deprecated";

export type CriterionAxis = "project" | "entity" | "issuance";

export interface RegulatoryAnchor {
  regulation: string;
  celex: string;
  article: string;
  url?: string | null;
}

export interface SharedCriterion {
  criterion_id: string;
  name: string;
  regime: string;
  regulatory_anchors: RegulatoryAnchor[];
  axes: CriterionAxis[];
  applies_to: string[];
  scoring_status: CriterionScoringStatus;
  methodology_version_introduced: string;
  summary: string;
  successor_regime_note?: string;
  // v0.5.0-alpha.2 (Phase 1, commit 1.2). Intra-framework dependencies
  // (criterion_id list) and cross-framework dependencies (framework_id list).
  // Both validated by criterion.schema.json. Used by the SFDR orchestrator
  // to topologically sort criteria within a framework and to surface
  // upstream FrameworkResults via LogicInput.framework_results.
  depends_on?: string[];
  depends_on_framework?: string[];
}

export interface CriterionRef {
  ref: string;
  weight: number | null;
}

export interface CriterionLibrary {
  byId: Map<string, SharedCriterion>;
  sourceFiles: string[];
}

export interface CriterionLibraryLoadOptions {
  rootDir?: string;
  schemaPath?: string;
  glob?: string;
}

export interface CriterionRefResolution {
  criterion: SharedCriterion;
  weight: number | null;
}

export type RefResolutionError =
  | { kind: "missing"; ref: string }
  | { kind: "applies_to_mismatch"; ref: string; framework_id: string; applies_to: string[] }
  | { kind: "regime_mismatch"; ref: string; framework_regime: string; criterion_regime: string };

export interface ResolveRefsResult {
  resolved: CriterionRefResolution[];
  errors: RefResolutionError[];
}

const DEFAULT_ROOT = path.resolve(process.cwd(), "regulatory-knowledge");
const DEFAULT_GLOB = "criteria/**/*.json";
const DEFAULT_SCHEMA = "criteria/criterion.schema.json";

export class CriterionLibraryValidationError extends Error {
  readonly issues: { file: string; errors: ErrorObject[] }[];

  constructor(issues: { file: string; errors: ErrorObject[] }[]) {
    super(
      `Criterion library failed validation in ${issues.length} file(s):\n` +
        issues
          .map(
            (i) =>
              `  ${i.file}\n` +
              i.errors.map((e) => `    ${e.instancePath || "/"} ${e.message ?? ""}`).join("\n"),
          )
          .join("\n"),
    );
    this.name = "CriterionLibraryValidationError";
    this.issues = issues;
  }
}

function compileCriterionValidator(schemaSource: string): ValidateFunction<SharedCriterion> {
  const schema = JSON.parse(schemaSource);
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
  addFormats(ajv);
  return ajv.compile<SharedCriterion>(schema);
}

export async function loadCriterionLibrary(
  opts: CriterionLibraryLoadOptions = {},
): Promise<CriterionLibrary> {
  const rootDir = path.resolve(opts.rootDir ?? DEFAULT_ROOT);
  const schemaPath = opts.schemaPath ?? path.join(rootDir, DEFAULT_SCHEMA);
  const globPattern = opts.glob ?? DEFAULT_GLOB;

  const schemaSource = await fs.readFile(schemaPath, "utf8");
  const validate = compileCriterionValidator(schemaSource);

  const files = (
    await fg(globPattern, { cwd: rootDir, absolute: true, onlyFiles: true })
  )
    .filter((f) => !f.endsWith("criterion.schema.json"))
    .sort();

  const byId = new Map<string, SharedCriterion>();
  const issues: { file: string; errors: ErrorObject[] }[] = [];

  for (const file of files) {
    const raw = await fs.readFile(file, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      issues.push({
        file,
        errors: [
          {
            keyword: "parse",
            instancePath: "",
            schemaPath: "",
            params: {},
            message: `JSON parse failed: ${(err as Error).message}`,
          },
        ],
      });
      continue;
    }
    if (!validate(parsed)) {
      issues.push({ file, errors: validate.errors ?? [] });
      continue;
    }
    const criterion = parsed as SharedCriterion;

    // Cross-check: criterion_id must start with regime followed by "_".
    if (!criterion.criterion_id.startsWith(`${criterion.regime}_`)) {
      issues.push({
        file,
        errors: [
          {
            keyword: "cross_check",
            instancePath: "/criterion_id",
            schemaPath: "",
            params: { criterion_id: criterion.criterion_id, regime: criterion.regime },
            message: `criterion_id "${criterion.criterion_id}" must start with regime "${criterion.regime}_"`,
          },
        ],
      });
      continue;
    }

    if (byId.has(criterion.criterion_id)) {
      issues.push({
        file,
        errors: [
          {
            keyword: "duplicate",
            instancePath: "/criterion_id",
            schemaPath: "",
            params: { criterion_id: criterion.criterion_id },
            message: `Duplicate criterion_id "${criterion.criterion_id}"`,
          },
        ],
      });
      continue;
    }
    byId.set(criterion.criterion_id, criterion);
  }

  if (issues.length > 0) {
    throw new CriterionLibraryValidationError(issues);
  }

  return { byId, sourceFiles: files };
}

// Resolve a framework's ref-based criteria array against the criterion library.
// Performs three checks per ref: existence, applies_to membership, regime
// match. Returns both the resolved entries and any errors so callers can
// decide how to surface failures.
export function resolveCriterionRefs(
  refs: CriterionRef[],
  library: CriterionLibrary,
  framework: { id: string; framework_id?: string; regime: string },
): ResolveRefsResult {
  const resolved: CriterionRefResolution[] = [];
  const errors: RefResolutionError[] = [];
  // The framework's "canonical id" used for applies_to membership testing.
  // Phase 1 v3.3 product_label files set framework_id to the same value as id;
  // we prefer framework_id when present for forward compat.
  const canonicalId = framework.framework_id ?? framework.id;

  for (const refEntry of refs) {
    const criterion = library.byId.get(refEntry.ref);
    if (!criterion) {
      errors.push({ kind: "missing", ref: refEntry.ref });
      continue;
    }
    if (!criterion.applies_to.includes(canonicalId)) {
      errors.push({
        kind: "applies_to_mismatch",
        ref: refEntry.ref,
        framework_id: canonicalId,
        applies_to: criterion.applies_to,
      });
      continue;
    }
    if (criterion.regime !== framework.regime) {
      errors.push({
        kind: "regime_mismatch",
        ref: refEntry.ref,
        framework_regime: framework.regime,
        criterion_regime: criterion.regime,
      });
      continue;
    }
    resolved.push({ criterion, weight: refEntry.weight });
  }
  return { resolved, errors };
}
