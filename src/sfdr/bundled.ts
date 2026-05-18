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
import periodic_reporting_commitment from "../../regulatory-knowledge/criteria/sfdr-v1/sfdr_v1_periodic_reporting_commitment.json";
import pre_contractual_disclosure from "../../regulatory-knowledge/criteria/sfdr-v1/sfdr_v1_pre_contractual_disclosure.json";
import project_pai_data_provision from "../../regulatory-knowledge/criteria/sfdr-v1/sfdr_v1_project_pai_data_provision.json";
import si_eligibility_evidence_pack from "../../regulatory-knowledge/criteria/sfdr-v1/sfdr_v1_si_eligibility_evidence_pack.json";
import si_objective_qualification from "../../regulatory-knowledge/criteria/sfdr-v1/sfdr_v1_si_objective_qualification.json";
import taxonomy_alignment_disclosure from "../../regulatory-knowledge/criteria/sfdr-v1/sfdr_v1_taxonomy_alignment_disclosure.json";

const ALL = [
  // Art 8 (7 criteria, v3.3 — unchanged)
  e_s_characteristics_promotion,
  good_governance_attestation,
  pai_consideration_policy,
  dnsh_assessment,
  pre_contractual_disclosure,
  taxonomy_alignment_disclosure,
  periodic_reporting_commitment,
  // Art 9 (3 criteria, v3.4 — replaces the 4 v3.3 declarations)
  si_objective_qualification,
  si_eligibility_evidence_pack,
  project_pai_data_provision,
] as unknown as SharedCriterion[];

export const BUNDLED_SFDR_CRITERIA: ReadonlyMap<string, SharedCriterion> = new Map(
  ALL.map((c) => [c.criterion_id, c]),
);
