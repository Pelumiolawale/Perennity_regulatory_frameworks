// SFDR criterion_id → scoring function registry.
// Phase 1 commit 1.2 ships Article 8 (7 criteria). Phase 1 commit 1.3 will
// add Article 9 criteria 8-11 (sustainable_investment_objective,
// sustainable_investment_floor, pai_integration_evidence,
// reference_benchmark_alignment). Until then those criteria fall through
// to the orchestrator's not_implemented fallback.

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

export const SFDR_REGISTRY: ReadonlyMap<string, SFDRScoringFn> = new Map<string, SFDRScoringFn>([
  ["sfdr_v1_e_s_characteristics_promotion", art8_c1_es_characteristics],
  ["sfdr_v1_good_governance_attestation", art8_c2_good_governance],
  ["sfdr_v1_pai_consideration_policy", art8_c3_pai_policy],
  ["sfdr_v1_dnsh_assessment", art8_c4_dnsh],
  ["sfdr_v1_pre_contractual_disclosure", art8_c5_pre_contractual],
  ["sfdr_v1_taxonomy_alignment_disclosure", art8_c6_taxonomy],
  ["sfdr_v1_periodic_reporting_commitment", art8_c7_periodic_reporting],
  // Art 9 criteria 8-11 register in commit 1.3.
]);
