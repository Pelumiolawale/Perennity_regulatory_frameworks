/**
 * SFDR Article 9 per-criterion scoring tests (v0.5.0-alpha.4 — Phase 1, commit 1.3).
 *
 * Methodology v3.4. Covers criteria 8 (SI objective qualification), 9 (SI
 * eligibility evidence pack — three-way cascade), and 10 (project PAI data
 * provision with verification gate reading c3 read-only).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
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
  ProjectArt9Inputs,
} from "../types";

const PROJECT_BASE: ProjectInput = {
  project_id: "p_art9_test",
  intake_timestamp: "2026-05-18T00:00:00Z",
  facility_type: "hyperscale",
  jurisdiction: "DE",
  facility_status: "operational",
  data_points: {},
  evidence_documents: [],
};

const ENTITY_BASE: EntityInput = {
  entity_id: "e_art9_test",
  legal_name: "Test Art9 Developer Ltd",
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

// ============================================================================
// Criterion 8 — SI objective qualification
// ============================================================================

const c8_si_base: ProjectArt9Inputs["si_objective"] = {
  objective: {
    name: "Decarbonisation of hyperscale data centre operations",
    category: "environmental_climate_mitigation",
    taxonomy_mapping: "climate_change_mitigation",
    declared_in: "investment_memorandum_v2",
  },
  dominance: {
    named_in_investment_memorandum: true,
    investment_memorandum_ref: "im_v2_2026",
    economic_rationale_depends_on_si: true,
    economic_rationale_description: "Revenue model anchored to renewable PPA premium",
    marketing_leads_with_si: true,
  },
  quantified_indicators: [
    { name: "Scope 1+2 GHG intensity (kgCO2e/MWh IT)", baseline: 320, target: 80, measurement_methodology: "GHG Protocol", source: "l2_rts_annex_i_pai" },
    { name: "Annual renewable PPA coverage (% of total)", baseline: 30, target: 95, measurement_methodology: "Contracts ledger", source: "art_2_17_example" },
    { name: "PUE", baseline: 1.45, target: 1.15, measurement_methodology: "ISO/IEC 30134-2", source: "art_2_17_example" },
  ],
  sub_case_a: {
    sbti_validated_1_5c: true,
    sbti_includes_net_zero: true,
    eu_ctb_or_pab_aligned_at_project_level: false,
    iea_nze_2050_compatible_with_trajectory: true,
  },
};

describe("Criterion 8 — SI objective qualification", () => {
  test("aligned: dominance + 3 recognised-source indicators + 9(3) carbon-reduction sub-case (a) evidence", () => {
    const r = art9_c8_si_objective_qualification(
      ctx({ project: { sfdr: { art9: { si_objective: c8_si_base } } } }),
    );
    assert.equal(r.band, "aligned");
    assert.ok(r.rationale_text.includes("dominance"));
  });

  test("partially_aligned: dominance test fails (SI is a feature, not the primary rationale)", () => {
    const si = JSON.parse(JSON.stringify(c8_si_base)) as typeof c8_si_base;
    si!.dominance!.economic_rationale_depends_on_si = false;
    si!.dominance!.marketing_leads_with_si = false;
    const r = art9_c8_si_objective_qualification(
      ctx({ project: { sfdr: { art9: { si_objective: si } } } }),
    );
    assert.equal(r.band, "partially_aligned");
    assert.ok(r.rationale_text.includes("dominance"));
  });

  test("partially_aligned: 9(3) sub-case (a) partially evidenced (SBTi without net-zero)", () => {
    const si = JSON.parse(JSON.stringify(c8_si_base)) as typeof c8_si_base;
    si!.sub_case_a!.sbti_includes_net_zero = false;
    si!.sub_case_a!.iea_nze_2050_compatible_with_trajectory = false;
    const r = art9_c8_si_objective_qualification(
      ctx({ project: { sfdr: { art9: { si_objective: si } } } }),
    );
    assert.equal(r.band, "partially_aligned");
  });

  test("not_aligned: no named objective (no objective field)", () => {
    const r = art9_c8_si_objective_qualification(
      ctx({
        project: {
          sfdr: { art9: { si_objective: { dominance: c8_si_base!.dominance } } },
        },
      }),
    );
    assert.equal(r.band, "insufficient_evidence");
  });

  test("not_aligned: objective declared but not mappable to taxonomy", () => {
    const r = art9_c8_si_objective_qualification(
      ctx({
        project: {
          sfdr: {
            art9: {
              si_objective: {
                objective: {
                  name: "Generic sustainability commitment",
                  category: "environmental_climate_mitigation",
                  // No taxonomy_mapping or social_taxonomy_mapping set
                },
                dominance: c8_si_base!.dominance,
                quantified_indicators: c8_si_base!.quantified_indicators,
              },
            },
          },
        },
      }),
    );
    assert.equal(r.band, "not_aligned");
    assert.ok(r.rationale_text.toLowerCase().includes("not mappable"));
  });

  test("insufficient_evidence: no si_objective input at all", () => {
    const r = art9_c8_si_objective_qualification(ctx({}));
    assert.equal(r.band, "insufficient_evidence");
  });

  test("sub-case (b) defaults to not_applicable when engagement scope doesn't anticipate benchmark placement", () => {
    const r = art9_c8_si_objective_qualification(
      ctx({ project: { sfdr: { art9: { si_objective: c8_si_base } } } }),
    );
    // Sub-case (b) rationale should populate even when c8 itself is aligned
    // — it's an independent disclosure that the benchmark path didn't apply.
    assert.ok(r.not_applicable_rationale);
    assert.match(r.not_applicable_rationale!, /benchmark/i);
    assert.match(r.not_applicable_rationale!, /does not anticipate/i);
  });

  test("sub-case (b) fails not_aligned when benchmark engagement asserted but trajectory missing/below threshold", () => {
    const si = JSON.parse(JSON.stringify(c8_si_base)) as typeof c8_si_base;
    si!.sub_case_b = {
      anticipates_benchmark_placement: true,
      benchmark_type: "eu_ctb",
      activity_exclusions_cleared: true,
      carbon_intensity_yoy_pct: 5, // below 7% required for EU CTB
    };
    const r = art9_c8_si_objective_qualification(
      ctx({ project: { sfdr: { art9: { si_objective: si } } } }),
    );
    assert.equal(r.band, "not_aligned");
    assert.match(r.rationale_text, /sub-case \(b\)/);
  });
});

// ============================================================================
// Criterion 9 — SI eligibility evidence pack (three-way cascade)
// ============================================================================

function fullEvidencePack(): ProjectArt9Inputs["evidence_pack"] {
  return {
    contribution_attestation: "auditor",
    dnsh_attestation: "auditor",
    governance_attestation: "auditor",
    pai_data_file_ref: "pai_file_v1.csv",
    pai_data_file_machine_readable_form: "csv",
    operational_doc_age_months: 6,
  };
}

function deps(
  c8: SFDRCriterionScore["band"],
  c4: SFDRCriterionScore["band"],
  c2: SFDRCriterionScore["band"],
  c10: SFDRCriterionScore["band"] = "aligned",
): Map<string, SFDRCriterionScore> {
  return new Map<string, SFDRCriterionScore>([
    ["sfdr_v1_si_objective_qualification", { band: c8, rationale_text: "test" }],
    ["sfdr_v1_dnsh_assessment", { band: c4, rationale_text: "test" }],
    ["sfdr_v1_good_governance_attestation", { band: c2, rationale_text: "test" }],
    ["sfdr_v1_project_pai_data_provision", { band: c10, rationale_text: "test" }],
  ]);
}

describe("Criterion 9 — SI eligibility evidence pack", () => {
  test("aligned: all 5 components aligned + auditor attestation on 1/2/3 + recency met", () => {
    const r = art9_c9_si_eligibility_evidence_pack(
      ctx({
        project: { sfdr: { art9: { evidence_pack: fullEvidencePack() } } },
        dependencies: deps("aligned", "aligned", "aligned"),
      }),
    );
    assert.equal(r.band, "aligned");
  });

  test("cascade: c8 not_aligned forces c9 not_aligned", () => {
    const r = art9_c9_si_eligibility_evidence_pack(
      ctx({
        project: { sfdr: { art9: { evidence_pack: fullEvidencePack() } } },
        dependencies: deps("not_aligned", "aligned", "aligned"),
      }),
    );
    assert.equal(r.band, "not_aligned");
    assert.match(r.rationale_text, /criterion 8/i);
  });

  test("cascade: c4 (DNSH) not_aligned forces c9 not_aligned (Art 2(17) DNSH gate)", () => {
    const r = art9_c9_si_eligibility_evidence_pack(
      ctx({
        project: { sfdr: { art9: { evidence_pack: fullEvidencePack() } } },
        dependencies: deps("aligned", "not_aligned", "aligned"),
      }),
    );
    assert.equal(r.band, "not_aligned");
    assert.match(r.rationale_text, /criterion 4|DNSH/i);
  });

  test("cascade: c2 (good governance) not_aligned forces c9 not_aligned (Art 2(17) governance gate)", () => {
    const r = art9_c9_si_eligibility_evidence_pack(
      ctx({
        project: { sfdr: { art9: { evidence_pack: fullEvidencePack() } } },
        dependencies: deps("aligned", "aligned", "not_aligned"),
      }),
    );
    assert.equal(r.band, "not_aligned");
    assert.match(r.rationale_text, /good governance|criterion 2/i);
  });

  test("multi-cascade: c8 AND c4 both not_aligned — rationale cites both triggers", () => {
    const r = art9_c9_si_eligibility_evidence_pack(
      ctx({
        project: { sfdr: { art9: { evidence_pack: fullEvidencePack() } } },
        dependencies: deps("not_aligned", "not_aligned", "aligned"),
      }),
    );
    assert.equal(r.band, "not_aligned");
    assert.match(r.rationale_text, /criterion 8/i);
    assert.match(r.rationale_text, /criterion 4|DNSH/i);
  });

  test("partially_aligned: all components aligned but management-only attestation", () => {
    const ep = fullEvidencePack();
    ep!.contribution_attestation = "management_only";
    const r = art9_c9_si_eligibility_evidence_pack(
      ctx({
        project: { sfdr: { art9: { evidence_pack: ep } } },
        dependencies: deps("aligned", "aligned", "aligned"),
      }),
    );
    assert.equal(r.band, "partially_aligned");
    assert.match(r.rationale_text, /management-prepared/);
  });
});

// ============================================================================
// Criterion 10 — Project PAI data provision (verification gate reads c3)
// ============================================================================

function perPai(count: number, verifiedCount: number): Record<string, { value: number; methodology_ref: string; third_party_verified: boolean; period: string }> {
  const all = [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 13];
  const out: Record<string, { value: number; methodology_ref: string; third_party_verified: boolean; period: string }> = {};
  for (let i = 0; i < count; i++) {
    out[String(all[i])] = {
      value: 42 + i,
      methodology_ref: "GHG Protocol / ISO/IEC 30134-2",
      third_party_verified: i < verifiedCount,
      period: "2025",
    };
  }
  return out;
}

describe("Criterion 10 — project PAI data provision", () => {
  test("aligned: all 11 PAIs present + methodology + recent + machine-readable + c3 aligned (no extra verification)", () => {
    const r = art9_c10_project_pai_data_provision(
      ctx({
        project: {
          sfdr: {
            art9: {
              pai_data: {
                per_pai: perPai(11, 0),
                machine_readable_form: "csv",
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
    assert.equal(r.numeric_value?.value, 11);
    assert.equal(r.numeric_value?.unit, "/11");
  });

  test("verification gate engages: c3 weak + <9 third-party-verified → caps at partially_aligned", () => {
    const r = art9_c10_project_pai_data_provision(
      ctx({
        project: {
          sfdr: {
            art9: {
              pai_data: {
                per_pai: perPai(11, 5),
                machine_readable_form: "csv",
                data_recency_months: 6,
              },
            },
          },
        },
        dependencies: new Map([
          ["sfdr_v1_pai_consideration_policy", { band: "partially_aligned", rationale_text: "" }],
        ]),
      }),
    );
    assert.equal(r.band, "partially_aligned");
    assert.match(r.rationale_text, /verification gate/);
    assert.match(r.rationale_text, /5\/11/);
  });

  test("verification gate clears: c3 weak + ≥9 third-party-verified → aligned", () => {
    const r = art9_c10_project_pai_data_provision(
      ctx({
        project: {
          sfdr: {
            art9: {
              pai_data: {
                per_pai: perPai(11, 9),
                machine_readable_form: "csv",
                data_recency_months: 6,
              },
            },
          },
        },
        dependencies: new Map([
          ["sfdr_v1_pai_consideration_policy", { band: "partially_aligned", rationale_text: "" }],
        ]),
      }),
    );
    assert.equal(r.band, "aligned");
    assert.match(r.rationale_text, /9\/11/);
  });

  test("not_aligned: <8 PAIs", () => {
    const r = art9_c10_project_pai_data_provision(
      ctx({
        project: {
          sfdr: {
            art9: {
              pai_data: {
                per_pai: perPai(5, 0),
                machine_readable_form: "csv",
                data_recency_months: 6,
              },
            },
          },
        },
      }),
    );
    assert.equal(r.band, "not_aligned");
    // numeric_value populated even for not_aligned per spec.
    assert.equal(r.numeric_value?.value, 5);
  });

  test("not_aligned: PAI 7 absent when project within 2km of KBA (hard fail regardless of overall coverage)", () => {
    const pp = perPai(11, 0);
    // Strip PAI 7 specifically.
    delete pp["7"];
    const r = art9_c10_project_pai_data_provision(
      ctx({
        project: {
          sfdr: {
            art9: {
              pai_data: {
                per_pai: pp,
                machine_readable_form: "csv",
                data_recency_months: 6,
                within_2km_of_kba: true,
              },
            },
          },
        },
      }),
    );
    assert.equal(r.band, "not_aligned");
    assert.match(r.rationale_text, /PAI 7|biodiversity/i);
    // numeric_value still populated (10 PAIs with data, but PAI 7 missing).
    assert.equal(r.numeric_value?.value, 10);
  });

  test("insufficient_evidence: no PAI data file at all", () => {
    const r = art9_c10_project_pai_data_provision(ctx({}));
    assert.equal(r.band, "insufficient_evidence");
  });
});

// ============================================================================
// End-to-end: Art 9 framework via Engine.run produces 10 scored cells
// ============================================================================

describe("Engine.run — Art 9 fully scored under v3.4", () => {
  test("Art 9 framework emits 10 cells, no not_implemented warnings", async () => {
    const { DeterministicEngine } = await import("../../runtime");
    const { loadKnowledgeBase } = await import("../../knowledge/load");
    const path = await import("node:path");
    const kb = await loadKnowledgeBase({
      rootDir: path.resolve(process.cwd(), "regulatory-knowledge"),
    });
    const art9 = kb.frameworksById.get("sfdr_v1_article_9");
    assert.ok(art9, "Art 9 framework must be loaded");
    const engine = new DeterministicEngine({
      engine_commit_sha: "test_sha",
      knowledge_base_hash: "test_kb_hash",
      methodology_version: "v3.4",
      now: () => "2026-05-18T00:00:00.000Z",
      generateId: () => "test_run_phase_1_3",
    });
    const run = await engine.run(
      {
        project: { ...PROJECT_BASE },
      },
      [art9],
    );
    const fr = run.framework_results[0];
    assert.equal(fr.sc_results.length, 10);
    const pending = fr.sc_results.filter((r) => r.scoring_status === "not_implemented");
    assert.equal(pending.length, 0);
    if (run.warnings) {
      const notImplementedWarning = run.warnings.find(
        (w) => w.toLowerCase().includes("not implemented") || w.toLowerCase().includes("not yet implemented"),
      );
      assert.equal(notImplementedWarning, undefined);
    }
  });
});
