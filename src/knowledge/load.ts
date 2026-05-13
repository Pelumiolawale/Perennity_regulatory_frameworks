import { promises as fs } from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import type { Activity } from "../engine";
import { computeKnowledgeBaseHash, computeSchemaHash } from "./hash";

export interface LoadOptions {
  rootDir?: string;
  schemaPath?: string;
  glob?: string;
}

export interface KnowledgeBase {
  activities: Activity[];
  byId: Map<string, Activity>;
  knowledge_base_hash: string;
  schema_hash: string;
  sourceFiles: string[];
  warnings: string[];
}

export interface ValidationIssue {
  file: string;
  errors: ErrorObject[];
}

export class KnowledgeBaseValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(
      `Knowledge base failed validation in ${issues.length} file(s):\n` +
        issues.map(formatIssue).join("\n"),
    );
    this.name = "KnowledgeBaseValidationError";
    this.issues = issues;
  }
}

function formatIssue(issue: ValidationIssue): string {
  const lines = issue.errors.map(
    (e) => `    ${e.instancePath || "/"} ${e.message ?? ""}`,
  );
  return `  ${issue.file}\n${lines.join("\n")}`;
}

export interface CompiledValidator {
  validate: ValidateFunction<Activity>;
  schemaSource: string;
}

export async function compileValidator(schemaPath: string): Promise<CompiledValidator> {
  const schemaSource = await fs.readFile(schemaPath, "utf8");
  const schema = JSON.parse(schemaSource);
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile<Activity>(schema);
  return { validate, schemaSource };
}

export function validateActivity(
  validate: ValidateFunction<Activity>,
  data: unknown,
):
  | { valid: true; activity: Activity }
  | { valid: false; errors: ErrorObject[] } {
  if (validate(data)) {
    return { valid: true, activity: data };
  }
  return { valid: false, errors: validate.errors ?? [] };
}

const DEFAULT_ROOT = path.resolve(process.cwd(), "regulatory-knowledge");

export async function loadKnowledgeBase(opts: LoadOptions = {}): Promise<KnowledgeBase> {
  const rootDir = path.resolve(opts.rootDir ?? DEFAULT_ROOT);
  const schemaPath = opts.schemaPath ?? path.join(rootDir, "activity.schema.json");
  const globPattern = opts.glob ?? "frameworks/**/*.json";

  const { validate, schemaSource } = await compileValidator(schemaPath);

  const files = (
    await fg(globPattern, { cwd: rootDir, absolute: true, onlyFiles: true })
  ).sort();

  const activities: Activity[] = [];
  const issues: ValidationIssue[] = [];
  const idToFile = new Map<string, string>();

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

    const result = validateActivity(validate, parsed);
    if (!result.valid) {
      issues.push({ file, errors: result.errors });
      continue;
    }

    const activity = result.activity;
    const prior = idToFile.get(activity.id);
    if (prior !== undefined) {
      issues.push({
        file,
        errors: [
          {
            keyword: "duplicate",
            instancePath: "/id",
            schemaPath: "",
            params: { id: activity.id, conflictsWith: prior },
            message: `Duplicate activity id "${activity.id}"; also declared in ${prior}`,
          },
        ],
      });
      continue;
    }

    idToFile.set(activity.id, file);
    activities.push(activity);
  }

  if (issues.length > 0) {
    throw new KnowledgeBaseValidationError(issues);
  }

  const warnings: string[] = [];
  for (const a of activities) {
    if (a.supersedes && !idToFile.has(a.supersedes)) {
      warnings.push(
        `Activity "${a.id}" declares supersedes="${a.supersedes}", but no such activity was loaded.`,
      );
    }
  }

  activities.sort((x, y) => x.id.localeCompare(y.id));

  return {
    activities,
    byId: new Map(activities.map((a) => [a.id, a])),
    knowledge_base_hash: computeKnowledgeBaseHash(activities),
    schema_hash: computeSchemaHash(schemaSource),
    sourceFiles: files,
    warnings,
  };
}
