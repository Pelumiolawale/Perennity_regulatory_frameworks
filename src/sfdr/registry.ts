// SFDR criterion_id → scoring function registry.
// Phase 1 commit 1.2 shipped Article 8 (7 criteria). Phase 1 commit 1.3
// (methodology v3.4) ships Article 9 with three criteria (the prior v3.3
// four-criterion Art 9 was reframed: criterion 11 folded into criterion 8
// sub-case (b); the 90% SI floor moved from per-criterion threshold to
// methodology preamble). All 10 SFDR criteria are now scored.

import type { SFDRScoringFn } from "./orchestration";
import {
  art8_c1_es_characteristics,
  art8_c2_good_governance,
  art8_c3_pai_policy,
  art8_c4_dnsh,
  art8_c5_pre_contractual,
  art8_c6_taxonomy,
  art8_c7_periodic_reporting,
} from "./art8-scoring";
import {
  art9_c8_si_objective_qualification,
  art9_c9_si_eligibility_evidence_pack,
  art9_c10_project_pai_data_provision,
} from "./art9-scoring";

export const SFDR_REGISTRY: ReadonlyMap<string, SFDRScoringFn> = new Map<string, SFDRScoringFn>([
  // Art 8 (v3.3 / 1.2): 7 criteria.
  ["sfdr_v1_e_s_characteristics_promotion", art8_c1_es_characteristics],
  ["sfdr_v1_good_governance_attestation", art8_c2_good_governance],
  ["sfdr_v1_pai_consideration_policy", art8_c3_pai_policy],
  ["sfdr_v1_dnsh_assessment", art8_c4_dnsh],
  ["sfdr_v1_pre_contractual_disclosure", art8_c5_pre_contractual],
  ["sfdr_v1_taxonomy_alignment_disclosure", art8_c6_taxonomy],
  ["sfdr_v1_periodic_reporting_commitment", art8_c7_periodic_reporting],
  // Art 9 (v3.4 / 1.3): 3 criteria — c11 (reference benchmark) folded into
  // c8 sub-case (b); 90% SI floor reframed as methodology preamble.
  ["sfdr_v1_si_objective_qualification", art9_c8_si_objective_qualification],
  ["sfdr_v1_si_eligibility_evidence_pack", art9_c9_si_eligibility_evidence_pack],
  ["sfdr_v1_project_pai_data_provision", art9_c10_project_pai_data_provision],
]);
