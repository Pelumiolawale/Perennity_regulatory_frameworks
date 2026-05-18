/**
 * Parity check: the inlined TS constants in src/sfdr/constants.ts must match
 * the canonical JSON files at regulatory-knowledge/constants/. If the JSON
 * updates without a corresponding TS update (or vice versa), this test
 * surfaces the drift loudly.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  EU_NON_COOPERATIVE_JURISDICTIONS,
  MATERIAL_PAI_NUMBERS,
  RECOGNISED_STANDARDS,
  SECTOR_MATERIAL_CATEGORIES,
} from "../constants";

const CONSTANTS_DIR = path.resolve(process.cwd(), "regulatory-knowledge/constants");

describe("SFDR constants parity (TS ↔ JSON)", () => {
  test("EU non-cooperative jurisdictions match", async () => {
    const json = JSON.parse(
      await fs.readFile(path.join(CONSTANTS_DIR, "eu_non_cooperative_jurisdictions.json"), "utf8"),
    );
    assert.deepEqual(
      [...EU_NON_COOPERATIVE_JURISDICTIONS].sort(),
      [...json.annex_i].sort(),
    );
  });

  test("Material PAIs match", async () => {
    const json = JSON.parse(
      await fs.readFile(path.join(CONSTANTS_DIR, "sfdr_v1_material_pais_data_centre.json"), "utf8"),
    );
    const jsonNumbers = json.material_pais.map((p: { number: number }) => p.number);
    assert.deepEqual([...MATERIAL_PAI_NUMBERS].sort((a, b) => a - b), [...jsonNumbers].sort((a, b) => a - b));
    assert.equal(MATERIAL_PAI_NUMBERS.length, 11);
  });

  test("Recognised standards match", async () => {
    const json = JSON.parse(
      await fs.readFile(path.join(CONSTANTS_DIR, "recognised_sustainability_standards.json"), "utf8"),
    );
    const jsonIds = json.standards.map((s: { id: string }) => s.id);
    assert.deepEqual([...RECOGNISED_STANDARDS].sort(), [...jsonIds].sort());
  });

  test("Sector-material categories match", async () => {
    const json = JSON.parse(
      await fs.readFile(path.join(CONSTANTS_DIR, "data_centre_sector_material_categories.json"), "utf8"),
    );
    const jsonIds = json.categories.map((c: { id: string }) => c.id);
    assert.deepEqual([...SECTOR_MATERIAL_CATEGORIES].sort(), [...jsonIds].sort());
  });
});
