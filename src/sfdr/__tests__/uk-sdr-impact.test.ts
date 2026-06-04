/**
 * UK SDR Sustainability Impact per-criterion scoring tests (v0.6.0, Phase 2).
 *
 * Covers c10-c15.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  uk_sdr_c10_impact_objective,
  uk_sdr_c11_impact_measurement,
  uk_sdr_c12_impact_additionality,
  uk_sdr_c13_impact_proportion_threshold,
  uk_sdr_c14_impact_reporting,
  uk_sdr_c15_no_significant_harm,
} from "../uk-sdr-scoring";
import type { SFDRScoringContext } from "../orchestration";
import type { ProjectInput, FrameworkResult, CriterionResult } from "../../engine";
import type { ProjectUKSDRInputs, SFDRCriterionScore } from "../types";

const PROJECT_BASE: ProjectInput = {
  project_id: "p_test_uksdr_imp",
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
    framework_id: "uk_sdr_impact",
  };
}

function score(band: SFDRCriterionScore["band"]): SFDRCriterionScore {
  return { band, rationale_text: "stub" };
}

function fakeEUTaxResult(
  dnsh: CriterionResult["verdict"][],
  overrideOverallVerdict?: FrameworkResult["overall_verdict"],
): FrameworkResult {
  return {
    framework: "EU_TAXONOMY_CLIMATE",
    framework_version: "Reg_2021_2139",
    framework_source_hash: "sha256:test",
    activity_id: "eu_tax_climate_8_1",
    sc_results: [],
    dnsh_results: dnsh.map((v, i) => ({
      criterion_id: `dnsh_${i}`,
      verdict: v,
      gap_summary: "",
      evidence_refs: [],
      scoring_logic_ref: "test",
      scoring_logic_version: "v1",
    })),
    safeguards_results: [],
    methodology_results: [],
    minimum_safeguards_verdict: "pass",
    // v0.6.2: optional override so the not_applicable edge case test can
    // assert the c15 explicit not_applicable branch — when EU Tax 8.1
    // returns "not_applicable" (no Taxonomy claim made), dnsh_results is
    // empty and overall_verdict !== "pass".
    overall_verdict: overrideOverallVerdict ?? "pass",
    indicative_score: 0,
  };
}

describe("UK SDR c10 — impact objective", () => {
  test("aligned: named + categorised + declared", () => {
    const r = uk_sdr_c10_impact_objective(
      ctx({
        uk_sdr: {
          impact_plan: {
            impact_objective: "Reduce data-centre Scope 1+2 emissions in Sub-Saharan Africa",
            objective_category: "environmental_climate_mitigation",
            declared_in: "investment_memorandum",
          },
        },
      }),
    );
    assert.equal(r.band, "aligned");
  });

  test("partially_aligned: named but no category", () => {
    const r = uk_sdr_c10_impact_objective(
      ctx({
        uk_sdr: {
          impact_plan: {
            impact_objective: "Reduce emissions",
            declared_in: "investment_memorandum",
          },
        },
      }),
    );
    assert.equal(r.band, "partially_aligned");
  });

  test("not_aligned: plan present, no objective text", () => {
    const r = uk_sdr_c10_impact_objective(ctx({ uk_sdr: { impact_plan: {} } }));
    assert.equal(r.band, "not_aligned");
  });

  test("insufficient_evidence: no impact plan", () => {
    const r = uk_sdr_c10_impact_objective(ctx({ uk_sdr: {} }));
    assert.equal(r.band, "insufficient_evidence");
  });
});

describe("UK SDR c11 — impact measurement", () => {
  const wellFormedIndicators = [
    { name: "Scope 1+2 emissions", baseline: 8000, target: 5000, unit: "tCO2e/yr" },
    { name: "PUE", baseline: 1.5, target: 1.3, unit: "ratio" },
    { name: "Renewable %", baseline: 40, target: 80, unit: "%" },
  ];

  test("aligned: ToC + 3 quantified indicators", () => {
    const r = uk_sdr_c11_impact_measurement(
      ctx({
        uk_sdr: {
          impact_plan: {
            theory_of_change: "Investment in efficient cooling reduces grid load and CO2.",
            quantified_indicators: wellFormedIndicators,
          },
        },
        dependencies: new Map([["uk_sdr_v1_impact_objective", score("aligned")]]),
      }),
    );
    assert.equal(r.band, "aligned");
  });

  test("partially_aligned: ToC but only 1 indicator", () => {
    const r = uk_sdr_c11_impact_measurement(
      ctx({
        uk_sdr: {
          impact_plan: {
            theory_of_change: "ToC text",
            quantified_indicators: [wellFormedIndicators[0]],
          },
        },
        dependencies: new Map([["uk_sdr_v1_impact_objective", score("aligned")]]),
      }),
    );
    assert.equal(r.band, "partially_aligned");
  });

  test("not_aligned: cascade from c10 not_aligned", () => {
    const r = uk_sdr_c11_impact_measurement(
      ctx({
        uk_sdr: {
          impact_plan: {
            theory_of_change: "ToC",
            quantified_indicators: wellFormedIndicators,
          },
        },
        dependencies: new Map([["uk_sdr_v1_impact_objective", score("not_aligned")]]),
      }),
    );
    assert.equal(r.band, "not_aligned");
    assert.match(r.rationale_text, /Cascade rule/);
  });

  test("insufficient_evidence: no plan", () => {
    const r = uk_sdr_c11_impact_measurement(ctx({ uk_sdr: {} }));
    assert.equal(r.band, "insufficient_evidence");
  });
});

describe("UK SDR c12 — impact additionality", () => {
  test("aligned: substantive narrative (>=200 chars)", () => {
    const r = uk_sdr_c12_impact_additionality(
      ctx({
        uk_sdr: {
          impact_plan: {
            additionality_evidence: "A".repeat(250),
          },
        },
      }),
    );
    assert.equal(r.band, "aligned");
  });

  test("partially_aligned: brief narrative", () => {
    const r = uk_sdr_c12_impact_additionality(
      ctx({
        uk_sdr: { impact_plan: { additionality_evidence: "Brief explanation." } },
      }),
    );
    assert.equal(r.band, "partially_aligned");
  });

  test("not_aligned: empty narrative", () => {
    const r = uk_sdr_c12_impact_additionality(
      ctx({ uk_sdr: { impact_plan: { additionality_evidence: "" } } }),
    );
    assert.equal(r.band, "not_aligned");
  });

  test("insufficient_evidence: no plan", () => {
    const r = uk_sdr_c12_impact_additionality(ctx({ uk_sdr: {} }));
    assert.equal(r.band, "insufficient_evidence");
  });
});

describe("UK SDR c13 — impact proportion threshold", () => {
  function deps(bands: SFDRCriterionScore["band"][]): Map<string, SFDRCriterionScore> {
    return new Map([
      ["uk_sdr_v1_impact_objective", score(bands[0])],
      ["uk_sdr_v1_impact_measurement", score(bands[1])],
      ["uk_sdr_v1_impact_additionality", score(bands[2])],
    ]);
  }

  test("aligned: all 3 upstream aligned", () => {
    const r = uk_sdr_c13_impact_proportion_threshold(
      ctx({ dependencies: deps(["aligned", "aligned", "aligned"]) }),
    );
    assert.equal(r.band, "aligned");
  });

  test("not_aligned: cascade", () => {
    const r = uk_sdr_c13_impact_proportion_threshold(
      ctx({ dependencies: deps(["aligned", "not_aligned", "aligned"]) }),
    );
    assert.equal(r.band, "not_aligned");
  });

  test("partially_aligned: mixed", () => {
    const r = uk_sdr_c13_impact_proportion_threshold(
      ctx({ dependencies: deps(["aligned", "partially_aligned", "aligned"]) }),
    );
    assert.equal(r.band, "partially_aligned");
  });
});

describe("UK SDR c14 — impact reporting", () => {
  test("aligned: all 4 elements", () => {
    const r = uk_sdr_c14_impact_reporting(
      ctx({
        uk_sdr: {
          impact_plan: {
            reporting_commitment: {
              annual_cadence: true,
              reports_against_indicators: true,
              outcome_level_reporting: true,
              verification_method: "third_party_audit",
            },
          },
        },
      }),
    );
    assert.equal(r.band, "aligned");
    assert.equal(r.numeric_value?.value, 4);
  });

  test("partially_aligned: 2 of 4", () => {
    const r = uk_sdr_c14_impact_reporting(
      ctx({
        uk_sdr: {
          impact_plan: {
            reporting_commitment: {
              annual_cadence: true,
              reports_against_indicators: true,
              verification_method: "none",
            },
          },
        },
      }),
    );
    assert.equal(r.band, "partially_aligned");
  });

  test("not_aligned: 1 of 4", () => {
    const r = uk_sdr_c14_impact_reporting(
      ctx({
        uk_sdr: {
          impact_plan: { reporting_commitment: { annual_cadence: true } },
        },
      }),
    );
    assert.equal(r.band, "not_aligned");
  });

  test("insufficient_evidence: no commitment", () => {
    const r = uk_sdr_c14_impact_reporting(
      ctx({ uk_sdr: { impact_plan: {} } }),
    );
    assert.equal(r.band, "insufficient_evidence");
  });
});

describe("UK SDR c15 — no-significant-harm screen", () => {
  test("aligned: all DNSH pass or N/A", () => {
    const r = uk_sdr_c15_no_significant_harm(
      ctx({
        framework_results: new Map([
          ["eu_tax_climate_8_1", fakeEUTaxResult(["pass", "pass", "not_applicable"])],
        ]),
      }),
    );
    assert.equal(r.band, "aligned");
  });

  test("not_aligned: any DNSH fail", () => {
    const r = uk_sdr_c15_no_significant_harm(
      ctx({
        framework_results: new Map([
          ["eu_tax_climate_8_1", fakeEUTaxResult(["pass", "fail", "pass"])],
        ]),
      }),
    );
    assert.equal(r.band, "not_aligned");
  });

  test("partially_aligned: any DNSH partial (no fail)", () => {
    const r = uk_sdr_c15_no_significant_harm(
      ctx({
        framework_results: new Map([
          ["eu_tax_climate_8_1", fakeEUTaxResult(["pass", "partial", "pass"])],
        ]),
      }),
    );
    assert.equal(r.band, "partially_aligned");
  });

  test("insufficient_evidence: data_missing", () => {
    const r = uk_sdr_c15_no_significant_harm(
      ctx({
        framework_results: new Map([
          ["eu_tax_climate_8_1", fakeEUTaxResult(["data_missing", "pass"])],
        ]),
      }),
    );
    assert.equal(r.band, "insufficient_evidence");
  });

  test("insufficient_evidence: EU Tax framework not run", () => {
    const r = uk_sdr_c15_no_significant_harm(ctx({}));
    assert.equal(r.band, "insufficient_evidence");
  });

  // v0.6.2 (Tier 1 audit item #3): explicit not_applicable handling.
  // When EU Tax 8.1 is scored but returns overall_verdict "not_applicable"
  // (no Taxonomy claim made), c15 previously fell through to "DNSH results
  // are empty" insufficient_evidence — semantically misleading because
  // dnsh_results IS empty but the cause is "no claim made" not "data
  // missing". Now returns not_aligned with rationale citing the unmet
  // dependency.
  test("not_aligned: EU Tax 8.1 not_applicable (no Taxonomy claim made)", () => {
    const r = uk_sdr_c15_no_significant_harm(
      ctx({
        framework_results: new Map([
          ["eu_tax_climate_8_1", fakeEUTaxResult([], "not_applicable")],
        ]),
      }),
    );
    assert.equal(r.band, "not_aligned");
    assert.match(r.rationale_text, /not applicable|no claim|Taxonomy claim/i);
    // Confirm the rationale names the unmet dependency rather than implying
    // data is "missing" (which was the pre-v0.6.2 misleading framing).
    assert.match(r.rationale_text, /no-significant-harm|DNSH|dependency/i);
  });
});
