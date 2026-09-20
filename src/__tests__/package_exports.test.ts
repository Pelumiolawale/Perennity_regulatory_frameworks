// Subpath exports for the shipped data directories.
//
// WHY THIS EXISTS. The package `files` array has always shipped
// `regulatory-knowledge/` and `config/`, but the `exports` map declared only
// ".", "./v4" and "./package.json". Node's exports map is an allowlist: a
// subpath that is not declared is blocked, even though the file is right there
// in the tarball. So every consumer that needed one of these constants had to
// keep its own copy.
//
// The consuming app had accumulated roughly fifteen such copies — the EU
// Council Annex I jurisdiction list, the recognised reporting standards, the
// sector-material categories, the material PAI numbers — each one a hand-
// maintained mirror of a file this package already ships, and each one able to
// drift silently. Its tests had resorted to `fs.readFileSync` against a path
// walked from `require.resolve("@perennity/engine/package.json")`, which works
// at test time and is unavailable in a browser bundle.
//
// Declaring the subpaths costs nothing and turns those mirrors into reads.
//
// These tests use self-reference (importing the package by its own name from
// inside it), which Node supports precisely because `exports` is declared — so
// they exercise the real resolution path a consumer takes, not a relative
// import that would pass either way.

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

test("regulatory-knowledge constants resolve through the exports map", () => {
  const path = require.resolve(
    "@perennity/engine/regulatory-knowledge/constants/eu_non_cooperative_jurisdictions.json",
  );
  assert.ok(
    path.endsWith("eu_non_cooperative_jurisdictions.json"),
    `resolved to an unexpected path: ${path}`,
  );
});

test("the resolved constant is the real file, not an empty stub", () => {
  const annexI = require("@perennity/engine/regulatory-knowledge/constants/eu_non_cooperative_jurisdictions.json");
  assert.equal(annexI.kind, "eu_non_cooperative_jurisdictions");
  assert.ok(Array.isArray(annexI.annex_i));
  assert.ok(annexI.annex_i.length > 0);
  // The list a consumer would otherwise mirror by hand.
  assert.ok(annexI.annex_i.includes("Russian Federation"));
});

test("every shipped constants file is reachable", () => {
  // If a new constant is added to the directory it becomes importable with no
  // further change — that is the point of the pattern export. This asserts the
  // ones consumers currently mirror.
  for (const file of [
    "recognised_sustainability_standards.json",
    "data_centre_sector_material_categories.json",
    "sfdr_v1_material_pais_data_centre.json",
    "uk_sdr_v1_credible_standards_data_centre.json",
  ]) {
    assert.doesNotThrow(
      () => require(`@perennity/engine/regulatory-knowledge/constants/${file}`),
      `${file} should be reachable through the exports map`,
    );
  }
});

test("config thresholds resolve too", () => {
  const thresholds = require("@perennity/engine/config/regulatory-thresholds.v1.json");
  assert.equal(typeof thresholds, "object");
  assert.notEqual(thresholds, null);
});

test("an undeclared subpath is still blocked", () => {
  // The exports map remains an allowlist. src/ is not shipped and must not
  // become reachable by accident.
  assert.throws(
    () => require("@perennity/engine/src/sfdr/constants.ts"),
    /ERR_PACKAGE_PATH_NOT_EXPORTED|Cannot find module/,
  );
});
