// Bundled SFDR criterion library — runtime mirror of the JSON files under
// regulatory-knowledge/criteria/sfdr-v1/. Imports the JSONs at build time so
// Engine.run can resolve refs without async I/O. The async loader at
// src/knowledge/criterion-library.ts remains the canonical loader for
// tooling, drift detection, and tests that exercise the loader path.

import type { SharedCriterion } from "../knowledge/criterion-library";

import dnsh_assessment from "../../regulatory-knowledge/criteria/sfdr-v1/sfdr_v1_dnsh_assessment.json";
import e_s_characteristics_promotion from "../../regulatory-knowledge/criteria/sfdr-v1/sfdr_v1_e_s_characteristics_promotion.json";
import good_governance_attestation from "../../regulatory-knowledge/criteria/sfdr-v1/sfdr_v1_good_governance_attestation.json";
import pai_consideration_policy from "../../regulatory-knowledge/criteria/sfdr-v1/sfdr_v1_pai_consideration_policy.json";
import pai_integration_evidence from "../../regulatory-knowledge/criteria/sfdr-v1/sfdr_v1_pai_integration_evidence.json";
import periodic_reporting_commitment from "../../regulatory-knowledge/criteria/sfdr-v1/sfdr_v1_periodic_reporting_commitment.json";
import pre_contractual_disclosure from "../../regulatory-knowledge/criteria/sfdr-v1/sfdr_v1_pre_contractual_disclosure.json";
import reference_benchmark_alignment from "../../regulatory-knowledge/criteria/sfdr-v1/sfdr_v1_reference_benchmark_alignment.json";
import sustainable_investment_floor from "../../regulatory-knowledge/criteria/sfdr-v1/sfdr_v1_sustainable_investment_floor.json";
import sustainable_investment_objective from "../../regulatory-knowledge/criteria/sfdr-v1/sfdr_v1_sustainable_investment_objective.json";
import taxonomy_alignment_disclosure from "../../regulatory-knowledge/criteria/sfdr-v1/sfdr_v1_taxonomy_alignment_disclosure.json";

const ALL = [
  e_s_characteristics_promotion,
  good_governance_attestation,
  pai_consideration_policy,
  dnsh_assessment,
  pre_contractual_disclosure,
  taxonomy_alignment_disclosure,
  periodic_reporting_commitment,
  sustainable_investment_objective,
  sustainable_investment_floor,
  pai_integration_evidence,
  reference_benchmark_alignment,
] as unknown as SharedCriterion[];

export const BUNDLED_SFDR_CRITERIA: ReadonlyMap<string, SharedCriterion> = new Map(
  ALL.map((c) => [c.criterion_id, c]),
);
