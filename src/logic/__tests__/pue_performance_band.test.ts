import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { pue_performance_band } from "../pue_performance_band";
import type { Criterion, ProjectInput } from "../../engine";

const criterion: Criterion = {
  id: "pue_performance_band",
  criterion: "pue_performance_band_climate_adjusted",
  source_reference: "Perennity_Bridge_Methodology_v3.2_section_4.12",
  source_text: "...",
  requirement_type: "benchmarking",
  scoring_logic_ref: "logic.pue_performance_band.v1",
  authority_level: 2,
};

function makeProject(data: Record<string, unknown>): ProjectInput {
  return {
    project_id: "p1",
    intake_timestamp: "2026-05-13T00:00:00Z",
    facility_type: "hyperscale",
    jurisdiction: typeof data.country_code === "string" ? data.country_code : "DE",
    facility_status: "operational",
    data_points: data,
    evidence_documents: [],
  };
}

function score(data: Record<string, unknown>) {
  const project = makeProject(data);
  return pue_performance_band({
    criterion,
    data_points: data,
    evidence_documents: [],
    project,
  });
}

describe("pue_performance_band — climate-adjusted banding (Perennity authority)", () => {
  test("cool climate (SE) PUE 1.15 → industry_leading", () => {
    const r = score({ pue_actual: 1.15, country_code: "SE" });
    assert.equal(r.verdict, "banded");
    assert.equal(r.band_label, "industry_leading");
    assert.equal(r.band_score, 95);
    assert.equal(r.climate_label, "cool");
    assert.equal(r.climate_k1, 1.0);
    assert.equal(r.authority_level, 2);
  });

  test("cool climate PUE 1.55 → at_benchmark (the v3.1 1.5-threshold false-fail case)", () => {
    const r = score({ pue_actual: 1.55, country_code: "DE" });
    assert.equal(r.verdict, "banded");
    assert.equal(r.band_label, "at_benchmark");
    assert.equal(r.band_score, 60);
  });

  test("warm climate (AE) PUE 1.45 → strong (MENA new-build case from v3.1 §4.12)", () => {
    const r = score({ pue_actual: 1.45, country_code: "AE" });
    assert.equal(r.verdict, "banded");
    assert.equal(r.band_label, "strong");
    assert.equal(r.band_score, 80);
    assert.equal(r.climate_label, "warm");
    assert.equal(r.climate_k1, 1.1);
  });

  test("warm climate PUE 1.85 → below_benchmark", () => {
    const r = score({ pue_actual: 1.85, country_code: "SA" });
    assert.equal(r.verdict, "banded");
    assert.equal(r.band_label, "below_benchmark");
    assert.equal(r.band_score, 40);
  });

  test("new-build (build_year 2027) cool climate PUE 1.30 → base 'strong'; new_build_read 'industry_leading'", () => {
    const r = score({ pue_actual: 1.3, country_code: "DE", build_year: 2027 });
    assert.equal(r.band_label, "strong");
    assert.equal(r.new_build_read?.band_label, "industry_leading");
    assert.equal(r.new_build_read?.band_score, 95);
  });

  test("new-build warm climate PUE 1.45 → base 'strong'; new_build_read 'industry_leading'", () => {
    const r = score({ pue_actual: 1.45, country_code: "AE", build_year: 2026 });
    assert.equal(r.band_label, "strong");
    assert.equal(r.new_build_read?.band_label, "industry_leading");
  });

  test("new-build read also fires when facility_status is 'design' regardless of build_year", () => {
    const r = score({ pue_actual: 1.35, country_code: "DE", facility_status: "design" });
    assert.equal(r.band_label, "strong");
    assert.ok(r.new_build_read);
  });

  test("operational facility with build_year before 2025 → no new_build_read", () => {
    const r = score({ pue_actual: 1.5, country_code: "DE", build_year: 2020, facility_status: "operational" });
    assert.equal(r.new_build_read, null);
  });

  test("missing PUE input → data_missing", () => {
    const r = score({ country_code: "DE" });
    assert.equal(r.verdict, "data_missing");
  });

  test("missing country_code → data_missing", () => {
    const r = score({ pue_actual: 1.4 });
    assert.equal(r.verdict, "data_missing");
    assert.match(r.gap_summary, /country_code/);
  });

  test("unknown country code → defaults to cool climate (K1 1.0)", () => {
    const r = score({ pue_actual: 1.15, country_code: "ZZ" });
    assert.equal(r.climate_k1, 1.0);
    assert.equal(r.climate_label, "cool");
  });
});
