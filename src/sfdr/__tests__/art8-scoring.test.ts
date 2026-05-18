/**
 * SFDR Article 8 per-criterion scoring tests (v0.5.0-alpha.2 — Phase 1, commit 1.2).
 *
 * Each test exercises one criterion's bands across enter/exit conditions
 * with typed input fixtures. The orchestrator and end-to-end Engine.run
 * paths are tested separately in phase_1_2_*.test.ts.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  art8_c1_es_characteristics,
  art8_c2_good_governance,
  art8_c3_pai_policy,
  art8_c4_dnsh,
  art8_c5_pre_contractual,
  art8_c6_taxonomy,
  art8_c7_periodic_reporting,
} from "../art8-scoring";
import type { SFDRScoringContext } from "../orchestration";
import type { ProjectInput } from "../../engine";
import type { EntityInput } from "../../inputs";
import type {
  ProjectSFDRInputs,
  EntitySFDRInputs,
  SFDRCriterionScore,
} from "../types";
import type { FrameworkResult } from "../../engine";

const PROJECT_BASE: ProjectInput = {
  project_id: "p_test",
  intake_timestamp: "2026-05-18T00:00:00Z",
  facility_type: "hyperscale",
  jurisdiction: "DE",
  facility_status: "operational",
  data_points: {},
  evidence_documents: [],
};

const ENTITY_BASE: EntityInput = {
  entity_id: "e_test",
  legal_name: "Test Developer Ltd",
  jurisdiction: "DE",
};

function ctx(opts: {
  project?: Partial<ProjectInput> & { sfdr?: ProjectSFDRInputs };
  entity?: (Partial<EntityInput> & { sfdr?: EntitySFDRInputs }) | undefined;
  framework_results?: ReadonlyMap<string, FrameworkResult>;
  dependencies?: Map<string, SFDRCriterionScore>;
}): SFDRScoringContext {
  return {
    project: { ...PROJECT_BASE, ...opts.project } as ProjectInput,
    entity: opts.entity ? ({ ...ENTITY_BASE, ...opts.entity } as EntityInput) : undefined,
    framework_results: opts.framework_results ?? new Map(),
    dependencies: opts.dependencies ?? new Map(),
  };
}

describe("Criterion 1 — E/S characteristics promotion", () => {
  test("aligned: 3+ quantified, 2+ sector-material", () => {
    const r = art8_c1_es_characteristics(
      ctx({
        project: {
          sfdr: {
            disclosures: {
              es_characteristics: [
                { name: "PUE target", category: "environmental", sector_material_category: "energy_efficiency", indicator: { metric: "PUE", target_value: 1.2, target_year: 2028 } },
                { name: "WUE target", category: "environmental", sector_material_category: "water_stewardship", indicator: { metric: "WUE", target_value: 0.3, target_year: 2028 } },
                { name: "Heat reuse pilot", category: "social", sector_material_category: "community_local_impact", indicator: { metric: "GWh reused", target_value: 50, target_year: 2027 } },
              ],
            },
          },
        },
      }),
    );
    assert.equal(r.band, "aligned");
  });

  test("partially_aligned: characteristics without sector-material classification", () => {
    const r = art8_c1_es_characteristics(
      ctx({
        project: {
          sfdr: {
            disclosures: {
              es_characteristics: [
                { name: "Generic ESG commitment", category: "environmental", indicator: { metric: "X", target_value: 1, target_year: 2030 } },
                { name: "Generic ESG #2", category: "social", indicator: { metric: "Y", target_value: 1, target_year: 2030 } },
              ],
            },
          },
        },
      }),
    );
    assert.equal(r.band, "partially_aligned");
  });

  test("not_aligned: <2 specific characteristics", () => {
    const r = art8_c1_es_characteristics(
      ctx({
        project: {
          sfdr: {
            disclosures: { es_characteristics: [{ name: "vague", category: "environmental" }] },
          },
        },
      }),
    );
    assert.equal(r.band, "not_aligned");
  });

  test("insufficient_evidence: no disclosures provided", () => {
    const r = art8_c1_es_characteristics(ctx({}));
    assert.equal(r.band, "insufficient_evidence");
  });
});

describe("Criterion 2 — Good governance", () => {
  const fullGov = (): NonNullable<EntitySFDRInputs["governance"]> => ({
    board_structure: {
      independent_ned_count: 3,
      terms_of_reference_documented: true,
      ceo_chair_separated: true,
      lead_independent_director_designated: false,
      executive_committee_published: true,
    },
    employee_relations: {
      ungp_aligned_policy_published: true,
      grievance_mechanism_documented: true,
      labour_law_compliance_attested: true,
      ungc_violations_5yr_count: 0,
    },
    remuneration: {
      policy_published: true,
      ceo_to_median_ratio_disclosed: true,
      ceo_to_median_ratio_value: 50,
      esg_linked_variable_pay: true,
    },
    tax_compliance: {
      tax_policy_published: true,
      jurisdictions_used: ["DE", "NL", "FR", "IE"],
      cbcr_jurisdiction_count: 4,
      unresolved_tax_disputes_eur_max: 1_000_000,
    },
  });

  test("aligned: all four domains pass", () => {
    const r = art8_c2_good_governance(ctx({ entity: { sfdr: { governance: fullGov() } } }));
    assert.equal(r.band, "aligned");
  });

  test("not_aligned: tax compliance uses an Annex I jurisdiction", () => {
    const gov = fullGov();
    gov.tax_compliance!.jurisdictions_used = ["DE", "Panama"];
    const r = art8_c2_good_governance(ctx({ entity: { sfdr: { governance: gov } } }));
    assert.equal(r.band, "not_aligned");
  });

  test("not_aligned: UNGC violation in lookback window", () => {
    const gov = fullGov();
    gov.employee_relations!.ungc_violations_5yr_count = 1;
    const r = art8_c2_good_governance(ctx({ entity: { sfdr: { governance: gov } } }));
    assert.equal(r.band, "not_aligned");
  });

  test("insufficient_evidence: missing tax_compliance domain", () => {
    const gov = fullGov();
    delete gov.tax_compliance;
    const r = art8_c2_good_governance(ctx({ entity: { sfdr: { governance: gov } } }));
    assert.equal(r.band, "insufficient_evidence");
  });
});

describe("Criterion 3 — PAI consideration policy + numeric output", () => {
  function paiCoverage(fullCount: number): Record<string, { data_disclosed: boolean; target_disclosed: boolean; mitigation_documented: boolean }> {
    const out: Record<string, { data_disclosed: boolean; target_disclosed: boolean; mitigation_documented: boolean }> = {};
    const allPAIs = [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 13];
    for (let i = 0; i < allPAIs.length; i++) {
      const isFull = i < fullCount;
      out[String(allPAIs[i])] = {
        data_disclosed: isFull,
        target_disclosed: isFull,
        mitigation_documented: isFull,
      };
    }
    return out;
  }

  test("aligned: 9 full, recent, Art 4 referenced", () => {
    const r = art8_c3_pai_policy(
      ctx({
        entity: {
          sfdr: {
            pai_disclosures: {
              statement_url: "https://example.com/pai",
              statement_published_date: new Date().toISOString(),
              art_4_explicit_reference: true,
              pai_coverage: paiCoverage(9),
            },
          },
        },
      }),
    );
    assert.equal(r.band, "aligned");
    assert.equal(r.numeric_value?.value, 9);
    assert.equal(r.numeric_value?.unit, "/11");
  });

  test("partially_aligned: 6-8 full evidence", () => {
    const r = art8_c3_pai_policy(
      ctx({
        entity: {
          sfdr: {
            pai_disclosures: {
              statement_url: "https://x",
              statement_published_date: new Date().toISOString(),
              art_4_explicit_reference: true,
              pai_coverage: paiCoverage(6),
            },
          },
        },
      }),
    );
    assert.equal(r.band, "partially_aligned");
  });

  test("not_aligned: <6 full and old", () => {
    const r = art8_c3_pai_policy(
      ctx({
        entity: {
          sfdr: {
            pai_disclosures: {
              statement_url: "https://x",
              statement_published_date: "2020-01-01",
              art_4_explicit_reference: false,
              pai_coverage: paiCoverage(2),
            },
          },
        },
      }),
    );
    assert.equal(r.band, "not_aligned");
  });

  test("insufficient_evidence: no statement url", () => {
    const r = art8_c3_pai_policy(ctx({ entity: { sfdr: { pai_disclosures: { art_4_explicit_reference: false, pai_coverage: {} } } } }));
    assert.equal(r.band, "insufficient_evidence");
  });
});

describe("Criterion 5 — Pre-contractual disclosure cascade", () => {
  test("cascade: criterion 1 not_aligned forces criterion 5 not_aligned regardless of coverage", () => {
    const deps = new Map<string, SFDRCriterionScore>([
      [
        "sfdr_v1_e_s_characteristics_promotion",
        { band: "not_aligned", rationale_text: "test" },
      ],
    ]);
    const r = art8_c5_pre_contractual(
      ctx({
        entity: {
          sfdr: {
            disclosures: {
              annex_ii_coverage: {
                "1": { coverage: "covered_specific" },
                "2": { coverage: "covered_specific" },
                "3": { coverage: "covered_specific" },
                "4": { coverage: "covered_specific", named_framework: "GRI" },
                "5": { coverage: "covered_specific" },
                "6": { coverage: "covered_specific", named_framework: "TCFD" },
                "7": { coverage: "covered_specific" },
                "9": { coverage: "covered_specific" },
                "10": { coverage: "covered_specific" },
              },
            },
          },
        },
        dependencies: deps,
      }),
    );
    assert.equal(r.band, "not_aligned");
    assert.match(r.rationale_text, /cascade/i);
  });

  test("aligned: 7+ specific + named frameworks on items 4/6 + item 5 covered", () => {
    const r = art8_c5_pre_contractual(
      ctx({
        entity: {
          sfdr: {
            disclosures: {
              annex_ii_coverage: {
                "1": { coverage: "covered_specific" },
                "2": { coverage: "covered_specific" },
                "3": { coverage: "covered_specific" },
                "4": { coverage: "covered_specific", named_framework: "GRI" },
                "5": { coverage: "covered_specific" },
                "6": { coverage: "covered_specific", named_framework: "EFRAG ESRS" },
                "7": { coverage: "covered_specific" },
              },
            },
          },
        },
      }),
    );
    assert.equal(r.band, "aligned");
  });
});

describe("Criterion 6 — Taxonomy alignment disclosure (cross-framework)", () => {
  test("not_applicable when no claim made", () => {
    const r = art8_c6_taxonomy(ctx({}));
    assert.equal(r.band, "not_applicable");
    assert.ok(r.not_applicable_rationale?.includes("light-green"));
  });

  test("aligned when EU 8.1 verdict is pass + complete claim + low overstatement", () => {
    const euResult: FrameworkResult = {
      framework: "EU_TAXONOMY_CLIMATE",
      framework_version: "v",
      framework_source_hash: "sha256:" + "0".repeat(64),
      activity_id: "eu_tax_climate_8_1",
      sc_results: [],
      dnsh_results: [],
      minimum_safeguards_verdict: "pass",
      overall_verdict: "pass",
      indicative_score: 85,
    };
    const r = art8_c6_taxonomy(
      ctx({
        project: {
          sfdr: {
            taxonomy_claim: {
              claimed_percentage: 90,
              methodology: "capex",
              six_objective_breakdown: { climate_change_mitigation: 90 },
              minimum_safeguards_attestation: true,
              published_date: new Date().toISOString(),
            },
          },
        },
        framework_results: new Map([["eu_tax_climate_8_1", euResult]]),
      }),
    );
    assert.equal(r.band, "aligned");
    assert.equal(r.numeric_value?.value, 90);
  });

  test("not_aligned when overstatement > 10pp", () => {
    const euResult: FrameworkResult = {
      framework: "EU_TAXONOMY_CLIMATE",
      framework_version: "v",
      framework_source_hash: "sha256:" + "0".repeat(64),
      activity_id: "eu_tax_climate_8_1",
      sc_results: [],
      dnsh_results: [],
      minimum_safeguards_verdict: "pass",
      overall_verdict: "pass",
      indicative_score: 50,
    };
    const r = art8_c6_taxonomy(
      ctx({
        project: {
          sfdr: {
            taxonomy_claim: {
              claimed_percentage: 95,
              methodology: "capex",
              six_objective_breakdown: { climate_change_mitigation: 95 },
              minimum_safeguards_attestation: true,
              published_date: new Date().toISOString(),
            },
          },
        },
        framework_results: new Map([["eu_tax_climate_8_1", euResult]]),
      }),
    );
    assert.equal(r.band, "not_aligned");
  });

  test("insufficient_evidence when claim made but EU 8.1 not in run", () => {
    const r = art8_c6_taxonomy(
      ctx({
        project: {
          sfdr: {
            taxonomy_claim: {
              claimed_percentage: 50,
              methodology: "capex",
              six_objective_breakdown: { climate_change_mitigation: 50 },
              minimum_safeguards_attestation: true,
              published_date: new Date().toISOString(),
            },
          },
        },
      }),
    );
    assert.equal(r.band, "insufficient_evidence");
  });
});

describe("Criterion 7 — Periodic reporting", () => {
  test("operational + 2+ consecutive annual reports + named standard + indicator-link → aligned", () => {
    const c1deps = new Map<string, SFDRCriterionScore>([
      [
        "sfdr_v1_e_s_characteristics_promotion",
        { band: "aligned", rationale_text: "characteristics ok", evidence_refs: ["pue_target"] },
      ],
    ]);
    const r = art8_c7_periodic_reporting(
      ctx({
        entity: {
          sfdr: {
            reporting: {
              operational_status: "operational",
              commissioning_date: "2023-01-01",
              project_reports: [
                { year: 2025, indicator_names: ["PUE"], named_standard: "gri" },
                { year: 2024, indicator_names: ["PUE"], named_standard: "gri" },
              ],
            },
          },
        },
        dependencies: c1deps,
      }),
    );
    assert.equal(r.band, "aligned");
  });

  test("insufficient_evidence: pre-operational with no commitment or track record", () => {
    const r = art8_c7_periodic_reporting(
      ctx({
        entity: {
          sfdr: {
            reporting: {
              operational_status: "pre_operational",
            },
          },
        },
      }),
    );
    assert.equal(r.band, "insufficient_evidence");
  });
});

describe("Criterion 4 — DNSH (sample bands)", () => {
  test("insufficient_evidence with no project DNSH evidence", () => {
    const r = art8_c4_dnsh(ctx({}));
    assert.equal(r.band, "insufficient_evidence");
  });

  test("not_aligned when a single PAI is significant_harm (UNGC violation)", () => {
    const r = art8_c4_dnsh(
      ctx({
        project: {
          sfdr: {
            dnsh: {
              evidence: {
                ungc_violations_5yr_count: 1,
                monitoring_process_documented: true,
              },
            },
          },
        },
      }),
    );
    assert.equal(r.band, "not_aligned");
  });
});
