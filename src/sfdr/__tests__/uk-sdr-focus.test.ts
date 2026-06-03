/**
 * UK SDR Sustainability Focus per-criterion scoring tests (v0.6.0, Phase 2).
 *
 * Tests c1-c4 across enter/exit conditions. End-to-end orchestrator runs
 * are exercised in uk-sdr-end-to-end.test.ts (when added).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  uk_sdr_c1_asset_sustainability_profile,
  uk_sdr_c2_credible_sustainability_standard,
  uk_sdr_c3_sustainable_proportion_threshold,
  uk_sdr_c4_asset_kpi_reporting,
} from "../uk-sdr-scoring";
import type { SFDRScoringContext } from "../orchestration";
import type { ProjectInput, FrameworkResult } from "../../engine";
import type { ProjectUKSDRInputs, SFDRCriterionScore } from "../types";

const PROJECT_BASE: ProjectInput = {
  project_id: "p_test_uksdr",
  intake_timestamp: "2026-06-03T00:00:00Z",
  facility_type: "hyperscale",
  jurisdiction: "GB",
  facility_status: "operational",
  data_points: {},
  evidence_documents: [],
};

function ctx(opts: {
  uk_sdr?: ProjectUKSDRInputs;
  framework_results?: ReadonlyMap<string, FrameworkResult>;
  dependencies?: Map<string, SFDRCriterionScore>;
}): SFDRScoringContext {
  const project: ProjectInput = { ...PROJECT_BASE };
  if (opts.uk_sdr) project.uk_sdr = opts.uk_sdr;
  return {
    project,
    entity: undefined,
    framework_results: opts.framework_results ?? new Map(),
    dependencies: opts.dependencies ?? new Map(),
    framework_id: "uk_sdr_focus",
  };
}

function fakeEUTaxResult(verdict: FrameworkResult["overall_verdict"]): FrameworkResult {
  return {
    framework: "EU_TAXONOMY_CLIMATE",
    framework_version: "Reg_2021_2139",
    framework_source_hash: "sha256:test",
    activity_id: "eu_tax_climate_8_1",
    sc_results: [],
    dnsh_results: [],
    safeguards_results: [],
    methodology_results: [],
    minimum_safeguards_verdict: "pass",
    overall_verdict: verdict,
    indicative_score: 0,
  };
}

describe("UK SDR c1 — asset sustainability profile", () => {
  test("aligned: EU Tax 8.1 pass", () => {
    const r = uk_sdr_c1_asset_sustainability_profile(
      ctx({
        uk_sdr: { sustainability_standard_claimed: "eu_taxonomy_8_1" },
        framework_results: new Map([["eu_tax_climate_8_1", fakeEUTaxResult("pass")]]),
      }),
    );
    assert.equal(r.band, "aligned");
    assert.match(r.rationale_text, /EU Taxonomy Activity 8\.1/);
  });

  test("partially_aligned: EU Tax 8.1 partial", () => {
    const r = uk_sdr_c1_asset_sustainability_profile(
      ctx({
        uk_sdr: { sustainability_standard_claimed: "eu_taxonomy_8_1" },
        framework_results: new Map([["eu_tax_climate_8_1", fakeEUTaxResult("partial")]]),
      }),
    );
    assert.equal(r.band, "partially_aligned");
  });

  test("not_aligned: EU Tax 8.1 fail", () => {
    const r = uk_sdr_c1_asset_sustainability_profile(
      ctx({
        uk_sdr: { sustainability_standard_claimed: "eu_taxonomy_8_1" },
        framework_results: new Map([["eu_tax_climate_8_1", fakeEUTaxResult("fail")]]),
      }),
    );
    assert.equal(r.band, "not_aligned");
  });

  test("insufficient_evidence: no EU Tax run", () => {
    const r = uk_sdr_c1_asset_sustainability_profile(
      ctx({ uk_sdr: { sustainability_standard_claimed: "eu_taxonomy_8_1" } }),
    );
    assert.equal(r.band, "insufficient_evidence");
  });

  test("insufficient_evidence: no UK SDR input", () => {
    const r = uk_sdr_c1_asset_sustainability_profile(ctx({}));
    assert.equal(r.band, "insufficient_evidence");
  });
});

describe("UK SDR c2 — credible sustainability standard", () => {
  test("aligned: EU Taxonomy 8.1", () => {
    const r = uk_sdr_c2_credible_sustainability_standard(
      ctx({ uk_sdr: { sustainability_standard_claimed: "eu_taxonomy_8_1" } }),
    );
    assert.equal(r.band, "aligned");
  });

  test("aligned: LEED Platinum", () => {
    const r = uk_sdr_c2_credible_sustainability_standard(
      ctx({ uk_sdr: { sustainability_standard_claimed: "leed_platinum" } }),
    );
    assert.equal(r.band, "aligned");
  });

  test("partially_aligned: SBTi", () => {
    const r = uk_sdr_c2_credible_sustainability_standard(
      ctx({ uk_sdr: { sustainability_standard_claimed: "sbti_validated" } }),
    );
    assert.equal(r.band, "partially_aligned");
  });

  test("not_aligned: unknown standard", () => {
    const r = uk_sdr_c2_credible_sustainability_standard(
      ctx({ uk_sdr: { sustainability_standard_claimed: "breeam_good" } }),
    );
    assert.equal(r.band, "not_aligned");
  });

  test("insufficient_evidence: no claim", () => {
    const r = uk_sdr_c2_credible_sustainability_standard(ctx({ uk_sdr: {} }));
    assert.equal(r.band, "insufficient_evidence");
  });
});

describe("UK SDR c3 — sustainable proportion threshold", () => {
  function score(band: SFDRCriterionScore["band"]): SFDRCriterionScore {
    return { band, rationale_text: "stub" };
  }

  test("aligned: both upstream gates aligned", () => {
    const r = uk_sdr_c3_sustainable_proportion_threshold(
      ctx({
        dependencies: new Map([
          ["uk_sdr_v1_asset_sustainability_profile", score("aligned")],
          ["uk_sdr_v1_credible_sustainability_standard", score("aligned")],
        ]),
      }),
    );
    assert.equal(r.band, "aligned");
  });

  test("partially_aligned: c1 aligned, c2 partial", () => {
    const r = uk_sdr_c3_sustainable_proportion_threshold(
      ctx({
        dependencies: new Map([
          ["uk_sdr_v1_asset_sustainability_profile", score("aligned")],
          ["uk_sdr_v1_credible_sustainability_standard", score("partially_aligned")],
        ]),
      }),
    );
    assert.equal(r.band, "partially_aligned");
  });

  test("not_aligned: c1 not_aligned", () => {
    const r = uk_sdr_c3_sustainable_proportion_threshold(
      ctx({
        dependencies: new Map([
          ["uk_sdr_v1_asset_sustainability_profile", score("not_aligned")],
          ["uk_sdr_v1_credible_sustainability_standard", score("aligned")],
        ]),
      }),
    );
    assert.equal(r.band, "not_aligned");
  });

  test("insufficient_evidence: missing upstream", () => {
    const r = uk_sdr_c3_sustainable_proportion_threshold(ctx({}));
    assert.equal(r.band, "insufficient_evidence");
  });
});

describe("UK SDR c4 — asset KPI reporting", () => {
  test("aligned: all four KPIs + annual", () => {
    const r = uk_sdr_c4_asset_kpi_reporting(
      ctx({
        uk_sdr: {
          kpi_reporting_commitment: {
            kpis_committed: ["pue", "renewable_energy_pct", "ghg_emissions", "wue"],
            reporting_frequency: "annual",
          },
        },
      }),
    );
    assert.equal(r.band, "aligned");
    assert.equal(r.numeric_value?.value, 4);
  });

  test("partially_aligned: 3 of 4 KPIs + annual", () => {
    const r = uk_sdr_c4_asset_kpi_reporting(
      ctx({
        uk_sdr: {
          kpi_reporting_commitment: {
            kpis_committed: ["pue", "renewable_energy_pct", "ghg_emissions"],
            reporting_frequency: "annual",
          },
        },
      }),
    );
    assert.equal(r.band, "partially_aligned");
    assert.equal(r.numeric_value?.value, 3);
  });

  test("not_aligned: 2 KPIs", () => {
    const r = uk_sdr_c4_asset_kpi_reporting(
      ctx({
        uk_sdr: {
          kpi_reporting_commitment: {
            kpis_committed: ["pue", "ghg_emissions"],
            reporting_frequency: "annual",
          },
        },
      }),
    );
    assert.equal(r.band, "not_aligned");
  });

  test("not_aligned: 4 KPIs but cadence not annual", () => {
    const r = uk_sdr_c4_asset_kpi_reporting(
      ctx({
        uk_sdr: {
          kpi_reporting_commitment: {
            kpis_committed: ["pue", "renewable_energy_pct", "ghg_emissions", "wue"],
            reporting_frequency: "quarterly",
          },
        },
      }),
    );
    assert.equal(r.band, "not_aligned");
  });

  test("insufficient_evidence: no commitment provided", () => {
    const r = uk_sdr_c4_asset_kpi_reporting(ctx({ uk_sdr: {} }));
    assert.equal(r.band, "insufficient_evidence");
  });
});
