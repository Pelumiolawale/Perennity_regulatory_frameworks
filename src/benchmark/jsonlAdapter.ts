// ============================================================================
// JSONL storage adapter — the v1 StorageAdapter (Engine v4.0 — Module 7)
// ============================================================================
//
// Append-only newline-delimited JSON to a configurable path. This is one impl
// of the StorageAdapter seam; Airtable/DB adapters are future impls of the same
// interface. node:fs is imported lazily so importing this module doesn't pull
// node:* into a browser bundle that never constructs the adapter.
// ============================================================================

import type { BenchmarkRecord, StorageAdapter } from "./types";

export class JsonlStorageAdapter implements StorageAdapter {
  readonly name = "jsonl";
  constructor(private readonly filePath: string) {}

  async append(record: BenchmarkRecord): Promise<void> {
    const { appendFile, mkdir } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    await mkdir(dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, JSON.stringify(record) + "\n", "utf8");
  }
}

/** In-memory adapter — for tests and dry runs. */
export class InMemoryStorageAdapter implements StorageAdapter {
  readonly name = "in_memory";
  readonly records: BenchmarkRecord[] = [];
  async append(record: BenchmarkRecord): Promise<void> {
    this.records.push(record);
  }
}
