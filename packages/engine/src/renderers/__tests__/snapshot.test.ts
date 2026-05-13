import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { SnapshotRenderer } from "../snapshot";
import type { EngineRun, FrameworkResult, GapItem } from "../../engine";

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
