// ============================================================================
// Phase 0 archetype prototype — ICMA Green Bond Principles stub
// ============================================================================
//
// Stub issuance_framework framework definition for ICMA Green Bond Principles
// (2021 edition). Used to prove the TS type system can express the
// issuance_framework archetype and enforce the "no EntityInput access"
// boundary.
//
// One criterion (Use of Proceeds — eligible green project category) is
// structurally complete: config shape, declared input scope, and a scoring-
// function signature with a placeholder body. The remaining criteria are
// type-level placeholders.
//
// Per spike scope: no real scoring logic, no JSON Schema changes (a real
// ICMA JSON would need new schema fields — documented in
// src/prototype/README.md).
// ============================================================================

import type {
  IssuanceCriterion,
  IssuanceFramework,
  IssuanceProcessComponent,
} from "./archetype";
import type { InputsFor } from "./inputs";

// ----------------------------------------------------------------------------
// Criterion configs (one fully stubbed; others placeholder)
// ----------------------------------------------------------------------------

const useOfProceeds: IssuanceCriterion = {
  id: "icma_gbp_use_of_proceeds_eligible_category",
  criterion:
    "Use of Proceeds — bond proceeds allocated to eligible green project categories",
  source_reference: "ICMA_GBP_2021_section_1_use_of_proceeds",
  source_text:
    "[verbatim ICMA GBP 2021 Section 1 text would be pulled from regulatory-knowledge/]",
  requirement_type: "compliance_attestation",
  authority_level: 1,
  authority_source: "ICMA Green Bond Principles (June 2021)",
  scoring_logic_ref: "logic.icma_gbp_use_of_proceeds.v1",
  input_scope: ["project", "issuance"],
  snapshot_inclusion: true,
  render_paths: ["snapshot", "paid_report"],
};

const projectEvaluationAndSelection: IssuanceCriterion = {
  id: "icma_gbp_project_evaluation_and_selection_process",
  criterion: "Documented process for project evaluation and selection",
  source_reference: "ICMA_GBP_2021_section_2_project_evaluation",
  source_text: "[placeholder]",
  requirement_type: "qualitative_assessment",
  authority_level: 1,
  scoring_logic_ref: "logic.icma_gbp_evaluation_selection.v1",
  input_scope: ["issuance"],
};

const managementOfProceeds: IssuanceCriterion = {
  id: "icma_gbp_management_of_proceeds_tracking",
  criterion: "Proceeds tracked in segregated account or via internal process",
  source_reference: "ICMA_GBP_2021_section_3_management_of_proceeds",
  source_text: "[placeholder]",
  requirement_type: "compliance_attestation",
  authority_level: 1,
  scoring_logic_ref: "logic.icma_gbp_management_of_proceeds.v1",
  input_scope: ["issuance"],
};

const reporting: IssuanceCriterion = {
  id: "icma_gbp_reporting_annual_use_and_impact",
  criterion:
    "Annual use-of-proceeds and impact reporting commitments in place",
  source_reference: "ICMA_GBP_2021_section_4_reporting",
  source_text: "[placeholder]",
  requirement_type: "compliance_attestation",
  authority_level: 1,
  scoring_logic_ref: "logic.icma_gbp_reporting.v1",
  input_scope: ["issuance"],
};

// ----------------------------------------------------------------------------
// Process-component grouping
// ----------------------------------------------------------------------------

const components: IssuanceProcessComponent[] = [
  {
    id: "use_of_proceeds",
    heading: "Use of Proceeds",
    criteria: [useOfProceeds],
  },
  {
    id: "project_evaluation_and_selection",
    heading: "Process for Project Evaluation and Selection",
    criteria: [projectEvaluationAndSelection],
  },
  {
    id: "management_of_proceeds",
    heading: "Management of Proceeds",
    criteria: [managementOfProceeds],
  },
  {
    id: "reporting",
    heading: "Reporting",
    criteria: [reporting],
  },
];

// ----------------------------------------------------------------------------
// Framework definition
// ----------------------------------------------------------------------------

export const ICMA_GBP_2021_STUB: IssuanceFramework = {
  archetype: "issuance_framework",
  id: "icma_gbp_2021",
  framework: "ICMA_GBP",
  framework_version: "ICMA_GBP_June_2021",
  framework_source_hash:
    "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  issuance_type: "green_bond",
  methodology_version: "v3.2",
  effective_date: "2026-05-17",
  process_components: components,
};

// ----------------------------------------------------------------------------
// Scoring-function stub — demonstrates input-scope enforcement
// ----------------------------------------------------------------------------

type IcmaUoPInputScope = readonly ["project", "issuance"];
type IcmaUoPInputs = InputsFor<IcmaUoPInputScope>;

interface IcmaUoPResult {
  readonly verdict: "pass" | "partial" | "fail" | "data_missing";
  readonly gap_summary: string;
}

export function scoreIcmaUseOfProceeds(inputs: IcmaUoPInputs): IcmaUoPResult {
  // Legal reads — both axes are in the declared scope.
  const _projectFacility = inputs.project.facility_type;
  const _proceedsAmount = inputs.issuance.proceeds_amount;

  // Demonstration: issuance_framework criteria must NOT read EntityInput.
  // The line below would produce TS2339 ("Property 'entity' does not exist
  // on type ..."). The directive on the next line proves that error
  // exists; if the type system regressed and the access became legal, tsc
  // would report the directive as unused and the build would fail.
  // @ts-expect-error — ICMA issuance_framework criteria must not read EntityInput
  const _illegalEntityRead = inputs.entity.ungc_compliance_status;

  void _projectFacility;
  void _proceedsAmount;
  void _illegalEntityRead;

  // Stub body — real scoring logic is out of scope for the spike.
  return {
    verdict: "data_missing",
    gap_summary: "Stub — Phase 0 spike only. No real scoring performed.",
  };
}
