import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { SnapshotRenderer } from "../snapshot";
import type { CriterionResult, EngineRun, FrameworkResult, GapItem, Verdict } from "../../engine";

function makeRun(fr: Partial<FrameworkResult> = {}, gaps: GapItem[] = []): EngineRun {
  const framework_result: FrameworkResult = {
    framework: "EU_TAXONOMY_CLIMATE",
    framework_version: "v1",
    framework_source_hash: "sha256:" + "0".repeat(64),
    activity_id: "eu_tax_climate_8_1",
    sc_results: [],
    dnsh_results: [],
    minimum_safeguards_verdict: "pass",
    overall_verdict: "pass",
    indicative_score: 80,
    ...fr,
  };
  return {
    run_id: "r1",
    run_timestamp: "2026-05-13T00:00:00Z",
    methodology_version: "v3.1",
    engine_commit_sha: "abc",
    knowledge_base_hash: "sha256:" + "0".repeat(64),
    project_input: {
      project_id: "p1",
      intake_timestamp: "2026-05-13T00:00:00Z",
      facility_type: "hyperscale",
      jurisdiction: "DE",
      facility_status: "operational",
      data_points: {},
      evidence_documents: [],
    },
    framework_results: [framework_result],
    gap_list: gaps,
  };
}

const renderer = new SnapshotRenderer({
  disclaimer: "disclaimer",
  now: () => "2026-05-13T00:00:00Z",
});

describe("SnapshotRenderer — behavior", () => {
  test("Green band when score >= 75", async () => {
    const s = await renderer.render(makeRun({ indicative_score: 90 }));
    assert.equal(s.indicative_band, "Green");
  });

  test("Amber band when 50 <= score < 75", async () => {
    const s = await renderer.render(makeRun({ indicative_score: 60 }));
    assert.equal(s.indicative_band, "Amber");
  });

  test("Red band when score < 50", async () => {
    const s = await renderer.render(makeRun({ indicative_score: 25 }));
    assert.equal(s.indicative_band, "Red");
  });

  test("heatmap excludes not_applicable frameworks", async () => {
    const s = await renderer.render(makeRun({ overall_verdict: "not_applicable" }));
    assert.equal(s.heatmap.length, 0);
  });

  test("heatmap collapses data_missing to partial", async () => {
    const s = await renderer.render(makeRun({ overall_verdict: "data_missing" }));
    assert.equal(s.heatmap[0].verdict, "partial");
  });

  test("gap_list is capped at maxGaps", async () => {
    const r = new SnapshotRenderer({
      disclaimer: "d",
      maxGaps: 3,
      now: () => "t",
    });
    const gaps: GapItem[] = Array.from({ length: 10 }, (_, i) => ({
      gap_id: `g${i}`,
      framework: "EU_TAXONOMY_CLIMATE",
      criterion_id: "sc_8_1_2_pue_existing",
      severity: "critical",
      ic_voice_description: "x",
      remediation_summary: "x",
    }));
    const s = await r.render(makeRun({}, gaps));
    assert.equal(s.gap_list.length, 3);
  });

  test("gap phrases come from the phrase table, not from raw gap_summary", async () => {
    const gaps: GapItem[] = [
      {
        gap_id: "g1",
        framework: "EU_TAXONOMY_CLIMATE",
        criterion_id: "sc_8_1_2_pue_existing",
        severity: "critical",
        ic_voice_description: "raw gap summary 1.5 ratio",
        remediation_summary: "raw remediation",
      },
    ];
    const s = await renderer.render(makeRun({}, gaps));
    assert.match(s.gap_list[0].one_sentence_description, /Power Usage Effectiveness/);
    assert.ok(!s.gap_list[0].one_sentence_description.includes("1.5"));
  });

  test("unknown criterion falls back to a safe default phrase", async () => {
    const gaps: GapItem[] = [
      {
        gap_id: "g1",
        framework: "EU_TAXONOMY_CLIMATE",
        criterion_id: "unknown_criterion_id",
        severity: "minor",
        ic_voice_description: "x",
        remediation_summary: "x",
      },
    ];
    const s = await renderer.render(makeRun({}, gaps));
    assert.match(s.gap_list[0].one_sentence_description, /Required inputs/);
  });
});

function pillarResult(criterion_id: string, verdict: Verdict): CriterionResult {
  return {
    criterion_id,
    verdict,
    gap_summary: `stub ${criterion_id}`,
    evidence_refs: [],
    scoring_logic_ref: `logic.${criterion_id}.v1`,
    scoring_logic_version: "v1",
    authority_level: 1,
  };
}

describe("SnapshotRenderer — minimum_safeguards heatmap cell", () => {
  test("appends a safeguards cell after framework cells with pillar_verdicts derived from contributing_pillars", async () => {
    const rollup: CriterionResult = {
      criterion_id: "minimum_safeguards",
      verdict: "pass",
      gap_summary: "all pillars pass",
      evidence_refs: [],
      scoring_logic_ref: "logic.minimum_safeguards_rollup.v1",
      scoring_logic_version: "v1",
      authority_level: 1,
      contributing_pillars: [
        { criterion_id: "safeguards_human_rights", verdict: "pass" },
        { criterion_id: "safeguards_bribery_corruption", verdict: "pass" },
        { criterion_id: "safeguards_taxation", verdict: "partial" },
        { criterion_id: "safeguards_fair_competition", verdict: "pass" },
      ],
    };
    const s = await renderer.render(
      makeRun({
        safeguards_results: [
          pillarResult("safeguards_human_rights", "pass"),
          pillarResult("safeguards_bribery_corruption", "pass"),
          pillarResult("safeguards_taxation", "partial"),
          pillarResult("safeguards_fair_competition", "pass"),
          rollup,
        ],
        minimum_safeguards_verdict: "partial",
      }),
    );

    const sg = s.heatmap.find((c) => c.framework === "minimum_safeguards");
    assert.ok(sg, "expected a minimum_safeguards cell in the heatmap");
    assert.equal(sg.verdict, "partial");
    assert.equal(sg.authority_level, 1);
    assert.equal(sg.pillar_verdicts?.length, 4);
    const taxation = sg.pillar_verdicts?.find((p) => p.pillar_id === "taxation");
    assert.equal(taxation?.verdict, "partial");
  });

  test("safeguards cell preserves data_missing (distinct from partial)", async () => {
    const s = await renderer.render(
      makeRun({
        safeguards_results: [
          {
            criterion_id: "minimum_safeguards",
            verdict: "data_missing",
            gap_summary: "no inputs",
            evidence_refs: [],
            scoring_logic_ref: "logic.minimum_safeguards_rollup.v1",
            scoring_logic_version: "v1",
            authority_level: 1,
            contributing_pillars: [],
          },
        ],
        minimum_safeguards_verdict: "data_missing",
      }),
    );
    const sg = s.heatmap.find((c) => c.framework === "minimum_safeguards");
    assert.equal(sg?.verdict, "data_missing");
  });

  test("safeguards cell omitted when all frameworks are not_applicable", async () => {
    const s = await renderer.render(makeRun({ overall_verdict: "not_applicable" }));
    assert.equal(s.heatmap.length, 0);
  });

  test("falls back to deriving pillar_verdicts from safeguards_results when contributing_pillars absent", async () => {
    const s = await renderer.render(
      makeRun({
        safeguards_results: [
          pillarResult("safeguards_human_rights", "pass"),
          pillarResult("safeguards_bribery_corruption", "fail"),
          pillarResult("safeguards_taxation", "pass"),
          pillarResult("safeguards_fair_competition", "pass"),
        ],
        minimum_safeguards_verdict: "fail",
      }),
    );
    const sg = s.heatmap.find((c) => c.framework === "minimum_safeguards");
    assert.equal(sg?.pillar_verdicts?.length, 4);
    const bribery = sg?.pillar_verdicts?.find((p) => p.pillar_id === "bribery_corruption");
    assert.equal(bribery?.verdict, "fail");
  });
});

describe("SnapshotRenderer — E4 defensive filters for product_label frameworks", () => {
  function makeMultiRun(frs: FrameworkResult[]): EngineRun {
    return {
      run_id: "r1",
      run_timestamp: "2026-05-23T00:00:00Z",
      methodology_version: "v3.5",
      engine_commit_sha: "abc",
      knowledge_base_hash: "sha256:" + "0".repeat(64),
      project_input: {
        project_id: "p1",
        intake_timestamp: "2026-05-23T00:00:00Z",
        facility_type: "hyperscale",
        jurisdiction: "DE",
        facility_status: "operational",
        data_points: {},
        evidence_documents: [],
      },
      framework_results: frs,
      gap_list: [],
    };
  }

  const euTaxResult: FrameworkResult = {
    framework: "EU_TAXONOMY_CLIMATE",
    framework_version: "v1",
    framework_source_hash: "sha256:" + "1".repeat(64),
    activity_id: "eu_tax_climate_8_1",
    sc_results: [],
    dnsh_results: [],
    minimum_safeguards_verdict: "pass",
    overall_verdict: "pass",
    indicative_score: 80,
  };

  const sfdrResult: FrameworkResult = {
    framework: "SFDR",
    framework_version: "v1",
    framework_source_hash: "sha256:" + "2".repeat(64),
    activity_id: "sfdr_v1_article_9",
    sc_results: [],
    dnsh_results: [],
    safeguards_results: [],
    minimum_safeguards_verdict: "not_applicable",
    overall_verdict: "aligned", // E4: real verdict, not hardcoded NA
    indicative_score: 0, // SFDR weights null pending calibration
    archetype: "product_label",
  };

  test("indicative_score ignores product_label frameworks (SFDR score=0 does not drag down EU Tax 80)", async () => {
    const s = await renderer.render(makeMultiRun([euTaxResult, sfdrResult]));
    // Pre-E4 defensive change, SFDR was always overall_verdict=not_applicable
    // and excluded by the existing not_applicable filter. After E4, SFDR
    // carries a real verdict — the archetype filter must keep it out of
    // the indicative_score average. Otherwise (80 + 0) / 2 = 40.
    assert.equal(s.indicative_score, 80);
    assert.equal(s.indicative_band, "Green");
  });

  test("safeguards cell sources from activity_aligned framework, not product_label", async () => {
    // SFDR-only run: no activity_aligned framework loaded. Pre-E4 defensive,
    // SFDR was overall_verdict=not_applicable so buildSafeguardsCell's
    // .find returned undefined → cell omitted (correct behaviour). After E4,
    // SFDR carries overall_verdict="aligned"; without the archetype filter
    // it would be picked up and emit a bogus safeguards cell from empty
    // safeguards_results.
    const s = await renderer.render(makeMultiRun([sfdrResult]));
    const sgCell = s.heatmap.find((c) => c.framework === "minimum_safeguards");
    assert.equal(sgCell, undefined);
  });

  test("safeguards cell still emits when activity_aligned framework is present alongside product_label", async () => {
    const s = await renderer.render(makeMultiRun([euTaxResult, sfdrResult]));
    const sgCell = s.heatmap.find((c) => c.framework === "minimum_safeguards");
    assert.ok(sgCell, "EU Tax should drive the safeguards cell");
    assert.equal(sgCell.verdict, "pass");
  });
});
