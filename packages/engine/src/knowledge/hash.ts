import { createHash } from "node:crypto";
import type { Activity } from "../engine";

// Deterministic serialization: recursive key-sort, arrays preserved in order,
// no insignificant whitespace, undefined fields dropped. Output is the byte
// stream that gets fed to sha256 — never parse it back.
export function canonicalStringify(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) {
        throw new Error(`Cannot canonicalize non-finite number: ${value}`);
      }
      return JSON.stringify(value);
    case "string":
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        return "[" + value.map(canonicalStringify).join(",") + "]";
      }
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj)
        .filter((k) => obj[k] !== undefined)
        .sort();
      const body = keys
        .map((k) => JSON.stringify(k) + ":" + canonicalStringify(obj[k]))
        .join(",");
      return "{" + body + "}";
    }
    default:
      throw new Error(`Cannot canonicalize value of type ${typeof value}`);
  }
}

export function computeKnowledgeBaseHash(activities: Activity[]): string {
  const sorted = [...activities].sort((a, b) => a.id.localeCompare(b.id));
  const payload = sorted.map(canonicalStringify).join("\n");
  const digest = createHash("sha256").update(payload, "utf8").digest("hex");
  return `sha256:${digest}`;
}

// Schema hash is reported as a sibling field on KnowledgeBase rather than
// folded into knowledge_base_hash — keeps activity-set drift and schema drift
// independently observable in audit metadata.
export function computeSchemaHash(schemaSource: string): string {
  const digest = createHash("sha256").update(schemaSource, "utf8").digest("hex");
  return `sha256:${digest}`;
}
