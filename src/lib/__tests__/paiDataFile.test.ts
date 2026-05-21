/**
 * FMP-ready PAI Data File tests (Phase 1, commit 1.4 — `v0.5.0-alpha.6`).
 *
 * Locks the regulation-mirror invariants: exact row set, PAI 4 always
 * not_applicable for DC projects, value/verification derivation from v3.5
 * inputs, schema_source string. The file is what FMP analysts ingest, so
 * structural drift here breaks the F8 deliverable.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildPAIDataFile } from "../paiDataFile";
import type { EngineRun, ProjectInput } from "../../engine";

const PROJECT_BASE: ProjectInput = {
  project_id: "p_pai_file_test",
  intake_timestamp: "2026-05-21T00:00:00Z",
  facility_type: "hyperscale",
  jurisdiction: "DE",
  facility_status: "operational",
  data_points: {},
  evidence_documents: [],
};

function runWith(project: ProjectInput): EngineRun {
  return {
    run_id: "test_run",
    run_timestamp: "2026-05-21T00:00:00.000Z",
    methodology_version: "v3.5",
    engine_commit_sha: "test_sha",
    knowledge_base_hash: "test_kb_hash",
    project_input: project,
    framework_results: [],
    gap_list: [],
  };
}

const ALL_PAI_NUMBERS_IN_ORDER = [1, 2, 4, 5, 7, 8, 9, 10, 11, 13];

describe("PAIDataFile — structure", () => {
  test("emits exactly 10 rows in PAI-number order: 1, 2, 4, 5, 7, 8, 9, 10, 11, 13", () => {
    const file = buildPAIDataFile(runWith(PROJECT_BASE));
    assert.equal(file.rows.length, 10);
    assert.deepEqual(
      file.rows.map((r) => r.pai_number),
      ALL_PAI_NUMBERS_IN_ORDER,
    );
  });

  test("schema_source is exactly 'SFDR_2022_1288_Annex_I_Table_1'", () => {
    const file = buildPAIDataFile(runWith(PROJECT_BASE));
    assert.equal(file.schema_source, "SFDR_2022_1288_Annex_I_Table_1");
  });

  test("PAI 4 row is always present with applicability='not_applicable' and non-empty rationale", () => {
    const file = buildPAIDataFile(runWith(PROJECT_BASE));
    const pai4 = file.rows.find((r) => r.pai_number === 4);
    assert.ok(pai4, "PAI 4 row must be present");
    assert.equal(pai4.applicability, "not_applicable");
    assert.equal(pai4.verification_status, "not_applicable");
    assert.equal(pai4.value, null);
    assert.ok(
      pai4.applicability_rationale && pai4.applicability_rationale.length > 0,
      "PAI 4 must have non-empty applicability_rationale",
    );
  });
});

describe("PAIDataFile — value derivation", () => {
  test("PAI 13 (board diversity): derives value from DNSH evidence when present", () => {
    const project: ProjectInput = {
      ...PROJECT_BASE,
      sfdr: {
        dnsh: {
          evidence: {
            board_women_percent: 35,
          },
        },
      },
    };
    const file = buildPAIDataFile(runWith(project));
    const pai13 = file.rows.find((r) => r.pai_number === 13);
    assert.ok(pai13);
    assert.equal(pai13.value, 35);
    assert.equal(pai13.applicability, "applicable");
    assert.match(pai13.data_source, /board diversity/i);
  });

  test("Art 9 explicit PAI value takes precedence over DNSH-derived proxy", () => {
    const project: ProjectInput = {
      ...PROJECT_BASE,
      sfdr: {
        dnsh: { evidence: { board_women_percent: 35 } },
        art9: {
          pai_data: {
            per_pai: {
              "13": {
                value: 42,
                unit: "%",
                methodology_ref: "Board records, FY2025",
                third_party_verified: true,
              },
            },
          },
        },
      },
    };
    const file = buildPAIDataFile(runWith(project));
    const pai13 = file.rows.find((r) => r.pai_number === 13);
    assert.equal(pai13?.value, 42);
    assert.match(pai13?.data_source ?? "", /Art 9 PAI data file/);
    assert.equal(pai13?.verification_status, "third_party_assured");
  });

  test("no DNSH evidence and no Art 9 PAI data: value is null, data_unavailable_rationale is populated", () => {
    const file = buildPAIDataFile(runWith(PROJECT_BASE));
    // Pick a non-PAI-4 row; all others should be unavailable when nothing's supplied.
    const pai1 = file.rows.find((r) => r.pai_number === 1);
    assert.ok(pai1);
    assert.equal(pai1.value, null);
    assert.equal(pai1.applicability, "applicable");
    assert.ok(
      pai1.data_unavailable_rationale && pai1.data_unavailable_rationale.length > 0,
      "missing-value rows must carry a data_unavailable_rationale",
    );
  });
});

describe("PAIDataFile — verification status", () => {
  test("AssuranceTier 'reasonable_big4' maps DNSH-derived values to third_party_assured", () => {
    const project: ProjectInput = {
      ...PROJECT_BASE,
      sfdr: {
        dnsh: { evidence: { board_women_percent: 40 } },
        art9: {
          evidence_pack: {
            assurance_tier: "reasonable_big4",
            material_qualifications_present: false,
            operational_doc_age_months: 6,
          },
        },
      },
    };
    const file = buildPAIDataFile(runWith(project));
    const pai13 = file.rows.find((r) => r.pai_number === 13);
    assert.equal(pai13?.verification_status, "third_party_assured");
  });

  test("AssuranceTier 'management_only' maps DNSH-derived values to management_attested", () => {
    const project: ProjectInput = {
      ...PROJECT_BASE,
      sfdr: {
        dnsh: { evidence: { board_women_percent: 40 } },
        art9: {
          evidence_pack: {
            assurance_tier: "management_only",
            operational_doc_age_months: 6,
          },
        },
      },
    };
    const file = buildPAIDataFile(runWith(project));
    const pai13 = file.rows.find((r) => r.pai_number === 13);
    assert.equal(pai13?.verification_status, "management_attested");
  });

  test("No assurance tier and no per-datum verification flag → unverified", () => {
    const project: ProjectInput = {
      ...PROJECT_BASE,
      sfdr: { dnsh: { evidence: { board_women_percent: 40 } } },
    };
    const file = buildPAIDataFile(runWith(project));
    const pai13 = file.rows.find((r) => r.pai_number === 13);
    assert.equal(pai13?.verification_status, "unverified");
  });
});

describe("PAIDataFile — PAI 7 biodiversity tier-aware derivation", () => {
  test("PAI 7 TNFD LEAP (Tier 2) surfaces the LEAP risk level as value", () => {
    const project: ProjectInput = {
      ...PROJECT_BASE,
      sfdr: {
        dnsh: {
          evidence: {
            biodiversity_assessment_type: "tnfd_leap",
            tnfd_leap_risk_level: "low",
            site_level_mitigation_committed: true,
          },
        },
      },
    };
    const file = buildPAIDataFile(runWith(project));
    const pai7 = file.rows.find((r) => r.pai_number === 7);
    assert.equal(pai7?.value, "low");
    assert.match(pai7?.data_source ?? "", /TNFD LEAP/);
  });

  test("PAI 7 Tier 1 KBA buffer (>2km) → 'no' negative-effect flag", () => {
    const project: ProjectInput = {
      ...PROJECT_BASE,
      sfdr: {
        dnsh: {
          evidence: {
            biodiversity_assessment_type: "kba_buffer",
            distance_to_biodiversity_sensitive_area_km: 5,
            eia_documented: true,
            eia_concludes_no_material_disturbance: true,
          },
        },
      },
    };
    const file = buildPAIDataFile(runWith(project));
    const pai7 = file.rows.find((r) => r.pai_number === 7);
    assert.equal(pai7?.value, "no");
    assert.match(pai7?.data_source ?? "", /KBA buffer/);
  });
});
