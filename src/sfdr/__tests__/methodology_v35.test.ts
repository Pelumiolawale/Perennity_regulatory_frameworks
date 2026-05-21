/**
 * Methodology v3.5 calibration refinement tests (Phase 1, commit 1.3.1 — `v0.5.0-alpha.5`).
 *
 * Covers the six pressure-test refinements F2–F7. F2 (criterion 3 substance
 * over Art 4 citation) is exercised by the existing art8 c3 tests, which
 * continue to pass under v3.5 because removing the Art 4 reference gate
 * preserves their expected outcomes — explicit F2 coverage is added here as
 * a defensive regression test.
 *
 *   F2 — criterion 3: substance over Art 4 explicit citation
 *   F3 — criterion 4 PUE: CNDCP cool/warm climate split + PB aligned-tier
 *   F4 — criterion 4 PAI 7 biodiversity: TNFD LEAP Tier 2 acceptance
 *   F5 — criterion 10: structured-PDF data qualifies for aligned
 *   F6 — criterion 8: dominance test three-condition (a/b/c) check
 *   F7 — criterion 9: four-tier assurance hierarchy
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  art8_c3_pai_policy,
  art8_c4_dnsh,
} from "../art8-scoring";
import {
  art9_c8_si_objective_qualification,
  art9_c9_si_eligibility_evidence_pack,
  art9_c10_project_pai_data_provision,
} from "../art9-scoring";
import type { SFDRScoringContext } from "../orchestration";
import type { ProjectInput, FrameworkResult } from "../../engine";
import type { EntityInput } from "../../inputs";
import type {
  ProjectSFDRInputs,
  EntitySFDRInputs,
  SFDRCriterionScore,
  ProjectDNSHEvidence,
  ProjectArt9Inputs,
  Art9EvidencePackInputs,
} from "../types";

const PROJECT_BASE: ProjectInput = {
  project_id: "p_v35_test",
  intake_timestamp: "2026-05-21T00:00:00Z",
  facility_type: "hyperscale",
  jurisdiction: "DE",
  facility_status: "operational",
  data_points: {},
  evidence_documents: [],
};

const ENTITY_BASE: EntityInput = {
  entity_id: "e_v35_test",
  legal_name: "Test v3.5 Developer Ltd",
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

// All-no_harm DNSH evidence base; tests tweak PUE / climate / biodiversity
// fields specifically. Setting all 11 PAI evidence cleanly so c4 lands at
// aligned baseline; F3 / F4 tests then perturb only the targeted PAIs.
function dnshBaseAllNoHarm(): ProjectDNSHEvidence {
  return {
    // GHG (PAIs 1/2/3)
    sbti_validated: true,
    new_build: true,
    renewable_ppa_coverage_percent: 90,
    decarbonisation_pathway_documented: true,
    // Energy (PAIs 5/6) — PUE/climate set per test
    pue: 1.15,
    climate_zone: "cool",
    renewable_tier: 1,
    // Biodiversity (PAI 7) — Tier 1 by default
    biodiversity_assessment_type: "kba_buffer",
    distance_to_biodiversity_sensitive_area_km: 5,
    eia_documented: true,
    eia_concludes_no_material_disturbance: true,
    // Water (PAI 8)
    wue_value: 0.3,
    wue_max_threshold: 0.4,
    discharge_within_local_limits: true,
    cooling_design: "hybrid",
    // Waste (PAI 9)
    waste_management_plan_documented: true,
    it_hardware_recovery_rate: 0.9,
    // UNGC (PAIs 10/11)
    ungc_violations_5yr_count: 0,
    monitoring_process_documented: true,
    // Board diversity (PAI 13)
    board_women_percent: 35,
  };
}

// ============================================================================
// F2 — Criterion 3: substance over Art 4 explicit citation
// ============================================================================

describe("F2 — c3 substance over Art 4 explicit citation", () => {
  test("aligned: 9 full + recent + Art 4 NOT cited (v3.4 would have required it)", () => {
    const allPAIs = [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 13];
    const cov: Record<string, { data_disclosed: boolean; target_disclosed: boolean; mitigation_documented: boolean }> = {};
    for (let i = 0; i < allPAIs.length; i++) {
      const full = i < 9;
      cov[String(allPAIs[i])] = {
        data_disclosed: full,
        target_disclosed: full,
        mitigation_documented: full,
      };
    }
    const r = art8_c3_pai_policy(
      ctx({
        entity: {
          sfdr: {
            pai_disclosures: {
              statement_url: "https://example.com/pai-policy",
              statement_published_date: new Date().toISOString(),
              art_4_explicit_reference: false, // v3.5: no longer required
              pai_coverage: cov,
            },
          },
        },
      }),
    );
    assert.equal(r.band, "aligned");
    assert.match(r.rationale_text, /Substance-based/);
  });
});

// ============================================================================
// F3 — Criterion 4 PAI 5/6 PUE: cool/warm climate split + aligned-tier
// ============================================================================

describe("F3 — c4 PUE cool/warm climate split", () => {
  test("cool climate, new build at PUE 1.3: clears no_harm, caps c4 at partially_aligned (above PB aligned-tier 1.2)", () => {
    const evidence = dnshBaseAllNoHarm();
    evidence.pue = 1.3;
    evidence.climate_zone = "cool";
    const r = art8_c4_dnsh(
      ctx({ project: { sfdr: { dnsh: { evidence } } } }),
    );
    assert.equal(r.band, "partially_aligned");
    assert.match(r.rationale_text, /aligned-tier/);
  });

  test("warm climate, new build at PUE 1.4: clears no_harm, caps c4 at partially_aligned (above PB aligned-tier 1.3)", () => {
    const evidence = dnshBaseAllNoHarm();
    evidence.pue = 1.4;
    evidence.climate_zone = "warm";
    const r = art8_c4_dnsh(
      ctx({ project: { sfdr: { dnsh: { evidence } } } }),
    );
    assert.equal(r.band, "partially_aligned");
    assert.match(r.rationale_text, /aligned-tier/);
  });

  test("warm climate, new build at PUE 1.45: above CNDCP warm no_harm threshold of 1.4 → criterion 4 not aligned", () => {
    const evidence = dnshBaseAllNoHarm();
    evidence.pue = 1.45;
    evidence.climate_zone = "warm";
    const r = art8_c4_dnsh(
      ctx({ project: { sfdr: { dnsh: { evidence } } } }),
    );
    // PUE 1.45 > 1.4 warm no_harm; ≤ 1.6 fail threshold → PAI verdict =
    // insufficient_evidence (single PAI insufficient is below the 3-PAI
    // not_aligned threshold so this becomes partially_aligned).
    assert.equal(r.band, "partially_aligned");
  });

  test("regression: new build, cool climate, PUE 1.15 — aligned under both v3.4 and v3.5", () => {
    const evidence = dnshBaseAllNoHarm();
    evidence.pue = 1.15;
    evidence.climate_zone = "cool";
    const r = art8_c4_dnsh(
      ctx({ project: { sfdr: { dnsh: { evidence } } } }),
    );
    assert.equal(r.band, "aligned");
  });
});

// ============================================================================
// F4 — Criterion 4 PAI 7 biodiversity: TNFD LEAP Tier 2 acceptance
// ============================================================================

describe("F4 — c4 PAI 7 TNFD LEAP Tier 2 acceptance", () => {
  test("TNFD LEAP low risk + site-level mitigation → no_harm via Tier 2 (c4 reaches aligned)", () => {
    const evidence = dnshBaseAllNoHarm();
    // Switch PAI 7 evidence to Tier 2 TNFD LEAP, strip Tier 1 fields
    evidence.biodiversity_assessment_type = "tnfd_leap";
    evidence.tnfd_leap_risk_level = "low";
    evidence.site_level_mitigation_committed = true;
    delete evidence.distance_to_biodiversity_sensitive_area_km;
    delete evidence.eia_documented;
    delete evidence.eia_concludes_no_material_disturbance;
    const r = art8_c4_dnsh(
      ctx({ project: { sfdr: { dnsh: { evidence } } } }),
    );
    assert.equal(r.band, "aligned");
    assert.match(r.rationale_text, /PAI7=no_harm/);
  });

  test("TNFD LEAP high risk → significant_harm regardless of mitigation (c4 → not_aligned)", () => {
    const evidence = dnshBaseAllNoHarm();
    evidence.biodiversity_assessment_type = "tnfd_leap";
    evidence.tnfd_leap_risk_level = "high";
    evidence.site_level_mitigation_committed = true;
    const r = art8_c4_dnsh(
      ctx({ project: { sfdr: { dnsh: { evidence } } } }),
    );
    assert.equal(r.band, "not_aligned");
    assert.match(r.rationale_text, /PAI7=significant_harm/);
  });
});

// ============================================================================
// F5 — Criterion 10: structured-PDF data qualifies for aligned
// ============================================================================

describe("F5 — c10 structured form qualifies for aligned", () => {
  function perPaiAll11(): Record<string, { value: number; methodology_ref: string; third_party_verified: boolean }> {
    const all = [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 13];
    const out: Record<string, { value: number; methodology_ref: string; third_party_verified: boolean }> = {};
    for (let i = 0; i < all.length; i++) {
      out[String(all[i])] = {
        value: 42 + i,
        methodology_ref: "GHG Protocol",
        third_party_verified: false,
      };
    }
    return out;
  }

  test("structured PDF appendix + methodology refs + c3 aligned → c10 aligned (v3.4 would have capped at partially)", () => {
    const r = art9_c10_project_pai_data_provision(
      ctx({
        project: {
          sfdr: {
            art9: {
              pai_data: {
                per_pai: perPaiAll11(),
                machine_readable_form: "structured_pdf",
                data_recency_months: 6,
              },
            },
          },
        },
        dependencies: new Map([
          ["sfdr_v1_pai_consideration_policy", { band: "aligned", rationale_text: "" }],
        ]),
      }),
    );
    assert.equal(r.band, "aligned");
    assert.match(r.rationale_text, /structured PDF appendix|FMP-ready/);
  });
});

// ============================================================================
// F6 — Criterion 8 dominance test: load-bearing for deal thesis (3 conditions)
// ============================================================================

describe("F6 — c8 dominance test load-bearing (three-condition a/b/c)", () => {
  const c8_si_base: ProjectArt9Inputs["si_objective"] = {
    objective: {
      name: "Decarbonisation of hyperscale data centre operations",
      category: "environmental_climate_mitigation",
      taxonomy_mapping: "climate_change_mitigation",
    },
    dominance: {
      named_in_investment_memorandum: true,
      investment_memorandum_ref: "im_v2_2026",
      economic_rationale_depends_on_si: true,
      marketing_leads_with_si: true,
    },
    quantified_indicators: [
      { name: "Scope 1+2 GHG intensity", baseline: 320, target: 80, measurement_methodology: "GHG Protocol", source: "l2_rts_annex_i_pai" },
      { name: "Annual renewable PPA coverage", baseline: 30, target: 95, measurement_methodology: "Contracts ledger", source: "art_2_17_example" },
      { name: "PUE", baseline: 1.45, target: 1.15, measurement_methodology: "ISO/IEC 30134-2", source: "art_2_17_example" },
    ],
    sub_case_a: {
      sbti_validated_1_5c: true,
      sbti_includes_net_zero: true,
      eu_ctb_or_pab_aligned_at_project_level: false,
      iea_nze_2050_compatible_with_trajectory: true,
    },
  };

  test("all three conditions (a/b/c) pass → dominance test passes → c8 aligned", () => {
    const r = art9_c8_si_objective_qualification(
      ctx({ project: { sfdr: { art9: { si_objective: c8_si_base } } } }),
    );
    assert.equal(r.band, "aligned");
  });

  test("condition (b) economics fails → dominance fails → c8 partially_aligned (rationale cites failed condition)", () => {
    const si = JSON.parse(JSON.stringify(c8_si_base)) as typeof c8_si_base;
    si!.dominance!.economic_rationale_depends_on_si = false;
    const r = art9_c8_si_objective_qualification(
      ctx({ project: { sfdr: { art9: { si_objective: si } } } }),
    );
    assert.equal(r.band, "partially_aligned");
    // v3.5 rationale enumerates the specific failed condition
    assert.match(r.rationale_text, /\(b\)/);
    assert.match(r.rationale_text, /economics/);
  });
});

// ============================================================================
// F7 — Criterion 9 attestation: four-tier hierarchy
// ============================================================================

describe("F7 — c9 four-tier assurance hierarchy", () => {
  function deps(
    c8 = "aligned",
    c4 = "aligned",
    c2 = "aligned",
    c10 = "aligned",
  ): Map<string, SFDRCriterionScore> {
    return new Map<string, SFDRCriterionScore>([
      ["sfdr_v1_si_objective_qualification", { band: c8 as SFDRCriterionScore["band"], rationale_text: "" }],
      ["sfdr_v1_dnsh_assessment", { band: c4 as SFDRCriterionScore["band"], rationale_text: "" }],
      ["sfdr_v1_good_governance_attestation", { band: c2 as SFDRCriterionScore["band"], rationale_text: "" }],
      ["sfdr_v1_project_pai_data_provision", { band: c10 as SFDRCriterionScore["band"], rationale_text: "" }],
    ]);
  }

  test("Tier 2 (limited_big4 + no qualifications) → c9 aligned (was partially_aligned under v3.4)", () => {
    const ep: Art9EvidencePackInputs = {
      // Per-component fields omitted intentionally — assurance_tier drives the
      // v3.5 attestation band when present.
      assurance_tier: "limited_big4",
      material_qualifications_present: false,
      pai_data_file_ref: "pai_file_v1.csv",
      operational_doc_age_months: 6,
    };
    const r = art9_c9_si_eligibility_evidence_pack(
      ctx({
        project: { sfdr: { art9: { evidence_pack: ep } } },
        dependencies: deps(),
      }),
    );
    assert.equal(r.band, "aligned");
    assert.match(r.rationale_text, /Tier 2/);
  });

  test("Tier 2 (limited_big4) WITH material qualifications → caps at partially_aligned", () => {
    const ep: Art9EvidencePackInputs = {
      assurance_tier: "limited_big4",
      material_qualifications_present: true,
      pai_data_file_ref: "pai_file_v1.csv",
      operational_doc_age_months: 6,
    };
    const r = art9_c9_si_eligibility_evidence_pack(
      ctx({
        project: { sfdr: { art9: { evidence_pack: ep } } },
        dependencies: deps(),
      }),
    );
    assert.equal(r.band, "partially_aligned");
    assert.match(r.rationale_text, /material qualifications/);
  });
});
