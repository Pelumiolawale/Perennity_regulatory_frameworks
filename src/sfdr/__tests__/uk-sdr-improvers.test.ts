/**
 * UK SDR Sustainability Improvers per-criterion scoring tests (v0.6.0, Phase 2).
 *
 * Covers c5-c9.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  uk_sdr_c5_baseline_sustainability_assessment,
  uk_sdr_c6_improvement_strategy,
  uk_sdr_c7_improvement_kpi_targets,
  uk_sdr_c8_progress_monitoring,
  uk_sdr_c9_improvement_proportion_threshold,
} from "../uk-sdr-scoring";
import type { SFDRScoringContext } from "../orchestration";
import type { ProjectInput, FrameworkResult } from "../../engine";
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
    framework_id: "uk_sdr_improvers",
  };
}

function score(band: SFDRCriterionScore["band"]): SFDRCriterionScore {
  return { band, rationale_text: "stub" };
}

describe("UK SDR c5 — baseline sustainability assessment", () => {
  test("aligned: all 3 baseline metrics present", () => {
    const r = uk_sdr_c5_baseline_sustainability_assessment(
      ctx({
        uk_sdr: {
          improvement_plan: {
            baseline_metrics: { pue_current: 1.4, renewable_pct_current: 60, ghg_current: 8000 },
          },
        },
      }),
    );
    assert.equal(r.band, "aligned");
    assert.equal(r.numeric_value?.value, 3);
  });

  test("partially_aligned: 2 of 3", () => {
    const r = uk_sdr_c5_baseline_sustainability_assessment(
      ctx({
        uk_sdr: {
          improvement_plan: {
            baseline_metrics: { pue_current: 1.4, renewable_pct_current: 60 },
          },
        },
      }),
    );
    assert.equal(r.band, "partially_aligned");
  });

  test("not_aligned: only 1", () => {
    const r = uk_sdr_c5_baseline_sustainability_assessment(
      ctx({
        uk_sdr: { improvement_plan: { baseline_metrics: { pue_current: 1.4 } } },
      }),
    );
    assert.equal(r.band, "not_aligned");
  });

  test("insufficient_evidence: no baseline at all", () => {
    const r = uk_sdr_c5_baseline_sustainability_assessment(ctx({ uk_sdr: {} }));
    assert.equal(r.band, "insufficient_evidence");
  });
});

describe("UK SDR c6 — improvement strategy", () => {
  test("aligned: 3 years + 3 actions", () => {
    const r = uk_sdr_c6_improvement_strategy(
      ctx({
        uk_sdr: {
          improvement_plan: {
            strategy: { timeline_years: 3, actions: ["a", "b", "c"] },
          },
        },
      }),
    );
    assert.equal(r.band, "aligned");
  });

  test("partially_aligned: 5 years + 1 action", () => {
    const r = uk_sdr_c6_improvement_strategy(
      ctx({
        uk_sdr: {
          improvement_plan: {
            strategy: { timeline_years: 5, actions: ["a"] },
          },
        },
      }),
    );
    assert.equal(r.band, "partially_aligned");
  });

  test("not_aligned: 7 years", () => {
    const r = uk_sdr_c6_improvement_strategy(
      ctx({
        uk_sdr: {
          improvement_plan: {
            strategy: { timeline_years: 7, actions: ["a", "b", "c"] },
          },
        },
      }),
    );
    assert.equal(r.band, "not_aligned");
  });

  test("insufficient_evidence: no strategy", () => {
    const r = uk_sdr_c6_improvement_strategy(ctx({ uk_sdr: {} }));
    assert.equal(r.band, "insufficient_evidence");
  });
});

describe("UK SDR c7 — improvement KPI targets", () => {
  test("aligned: 3+ targets, baseline aligned", () => {
    const r = uk_sdr_c7_improvement_kpi_targets(
      ctx({
        uk_sdr: {
          improvement_plan: {
            targets: { pue_target: 1.2, renewable_pct_target: 80, ghg_reduction_pct: 30 },
          },
        },
        dependencies: new Map([
          ["uk_sdr_v1_baseline_sustainability_assessment", score("aligned")],
        ]),
      }),
    );
    assert.equal(r.band, "aligned");
  });

  test("partially_aligned: 2 targets", () => {
    const r = uk_sdr_c7_improvement_kpi_targets(
      ctx({
        uk_sdr: {
          improvement_plan: { targets: { pue_target: 1.2, renewable_pct_target: 80 } },
        },
        dependencies: new Map([
          ["uk_sdr_v1_baseline_sustainability_assessment", score("aligned")],
        ]),
      }),
    );
    assert.equal(r.band, "partially_aligned");
  });

  test("partially_aligned: 3 targets but baseline weak (insufficient_evidence)", () => {
    const r = uk_sdr_c7_improvement_kpi_targets(
      ctx({
        uk_sdr: {
          improvement_plan: {
            targets: { pue_target: 1.2, renewable_pct_target: 80, ghg_reduction_pct: 30 },
          },
        },
        dependencies: new Map([
          ["uk_sdr_v1_baseline_sustainability_assessment", score("insufficient_evidence")],
        ]),
      }),
    );
    assert.equal(r.band, "partially_aligned");
  });

  test("not_aligned: 0 targets", () => {
    const r = uk_sdr_c7_improvement_kpi_targets(
      ctx({ uk_sdr: { improvement_plan: { targets: {} } } }),
    );
    assert.equal(r.band, "not_aligned");
  });
});

describe("UK SDR c8 — progress monitoring", () => {
  test("aligned: annual + verification", () => {
    const r = uk_sdr_c8_progress_monitoring(
      ctx({
        uk_sdr: {
          kpi_reporting_commitment: {
            kpis_committed: ["pue"],
            reporting_frequency: "annual",
            verification_method: "third_party_audit",
          },
        },
      }),
    );
    assert.equal(r.band, "aligned");
  });

  test("partially_aligned: annual but no verification", () => {
    const r = uk_sdr_c8_progress_monitoring(
      ctx({
        uk_sdr: {
          kpi_reporting_commitment: {
            kpis_committed: ["pue"],
            reporting_frequency: "annual",
            verification_method: "none",
          },
        },
      }),
    );
    assert.equal(r.band, "partially_aligned");
  });

  test("not_aligned: quarterly cadence (not annual)", () => {
    const r = uk_sdr_c8_progress_monitoring(
      ctx({
        uk_sdr: {
          kpi_reporting_commitment: {
            kpis_committed: ["pue"],
            reporting_frequency: "quarterly",
            verification_method: "third_party_audit",
          },
        },
      }),
    );
    assert.equal(r.band, "not_aligned");
  });
});

describe("UK SDR c9 — improvement proportion threshold", () => {
  function deps(bands: SFDRCriterionScore["band"][]): Map<string, SFDRCriterionScore> {
    return new Map([
      ["uk_sdr_v1_baseline_sustainability_assessment", score(bands[0])],
      ["uk_sdr_v1_improvement_strategy", score(bands[1])],
      ["uk_sdr_v1_improvement_kpi_targets", score(bands[2])],
      ["uk_sdr_v1_progress_monitoring", score(bands[3])],
    ]);
  }

  test("aligned: all four upstream aligned", () => {
    const r = uk_sdr_c9_improvement_proportion_threshold(
      ctx({ dependencies: deps(["aligned", "aligned", "aligned", "aligned"]) }),
    );
    assert.equal(r.band, "aligned");
  });

  test("not_aligned: cascade rule (one not_aligned upstream)", () => {
    const r = uk_sdr_c9_improvement_proportion_threshold(
      ctx({
        dependencies: deps(["aligned", "aligned", "not_aligned", "aligned"]),
      }),
    );
    assert.equal(r.band, "not_aligned");
  });

  test("partially_aligned: mixed (no failures)", () => {
    const r = uk_sdr_c9_improvement_proportion_threshold(
      ctx({
        dependencies: deps(["aligned", "partially_aligned", "aligned", "aligned"]),
      }),
    );
    assert.equal(r.band, "partially_aligned");
  });

  test("insufficient_evidence: 2+ upstream insufficient", () => {
    const r = uk_sdr_c9_improvement_proportion_threshold(
      ctx({
        dependencies: deps([
          "insufficient_evidence",
          "insufficient_evidence",
          "aligned",
          "aligned",
        ]),
      }),
    );
    assert.equal(r.band, "insufficient_evidence");
  });

  test("insufficient_evidence: missing upstream", () => {
    const r = uk_sdr_c9_improvement_proportion_threshold(ctx({}));
    assert.equal(r.band, "insufficient_evidence");
  });
});
