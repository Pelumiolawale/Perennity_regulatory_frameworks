// ============================================================================
// Phase 0 archetype prototype — SFDR Article 8 stub
// ============================================================================
//
// Stub product_label framework definition for SFDR Article 8 ("light green").
// Used to prove the TS type system can express the product_label archetype
// and enforce the "no IssuanceInput access" boundary.
//
// One criterion (PAI consideration) is structurally complete: config shape,
// declared input scope, and a scoring-function signature with a placeholder
// body. The remaining criteria are type-level placeholders.
//
// Per spike scope: no real scoring logic, no JSON Schema changes (a real
// SFDR JSON would need new schema fields — documented in
// src/prototype/README.md).
// ============================================================================

import type {
  ProductLabelCriterion,
  ProductLabelFramework,
} from "./archetype";
import type { InputsFor } from "./inputs";

// ----------------------------------------------------------------------------
// Criterion configs
// ----------------------------------------------------------------------------

const paiConsideration: ProductLabelCriterion = {
  id: "sfdr_a8_pai_consideration",
  criterion: "Principal Adverse Impact consideration",
  source_reference: "Regulation_2019_2088_Article_4_paragraph_1",
  source_text:
    "[verbatim PAI consideration text would be pulled from the canonical PAI RTS in regulatory-knowledge/]",
  requirement_type: "compliance_attestation",
  authority_level: 1,
  authority_source: "Regulation (EU) 2019/2088 (SFDR)",
  scoring_logic_ref: "logic.sfdr_a8_pai_consideration.v1",
  input_scope: ["project", "entity"],
  snapshot_inclusion: true,
  render_paths: ["snapshot", "paid_report"],
};

// Type-level placeholders — structurally complete but stand-ins. Real SFDR
// scoring rules are out of scope for the spike.
const exclusionScreens: ProductLabelCriterion = {
  id: "sfdr_a8_exclusion_screens",
  criterion: "Exclusion screens (controversial weapons, tobacco, etc.)",
  source_reference: "Regulation_2019_2088_Article_8",
  source_text: "[placeholder]",
  requirement_type: "compliance_attestation",
  authority_level: 1,
  scoring_logic_ref: "logic.sfdr_a8_exclusion_screens.v1",
  input_scope: ["entity"],
};

const minimumProportionSustainable: ProductLabelCriterion = {
  id: "sfdr_a8_minimum_proportion_sustainable",
  criterion: "Minimum proportion of sustainable investments",
  source_reference: "Regulation_2019_2088_Article_8_paragraph_2a",
  source_text: "[placeholder]",
  requirement_type: "numeric_threshold",
  authority_level: 1,
  scoring_logic_ref: "logic.sfdr_a8_min_proportion.v1",
  input_scope: ["project", "entity"],
};

// ----------------------------------------------------------------------------
// Framework definition
// ----------------------------------------------------------------------------

export const SFDR_ARTICLE_8_STUB: ProductLabelFramework = {
  archetype: "product_label",
  id: "sfdr_article_8",
  framework: "SFDR",
  framework_version: "Regulation_2019_2088_consolidated_2024",
  framework_source_hash:
    "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  label_name: "SFDR Article 8",
  label_authority: "European Securities and Markets Authority (ESMA)",
  methodology_version: "v3.2",
  effective_date: "2026-05-17",
  eligibility_criteria: [
    paiConsideration,
    exclusionScreens,
    minimumProportionSustainable,
  ],
};

// ----------------------------------------------------------------------------
// Scoring-function stub — demonstrates input-scope enforcement
// ----------------------------------------------------------------------------
//
// The scoring function's parameter type is computed from the criterion's
// declared input_scope. Attempting to read an axis outside that scope is a
// type-level error. Demonstrated below.

type SfdrPaiInputScope = readonly ["project", "entity"];
type SfdrPaiInputs = InputsFor<SfdrPaiInputScope>;

interface SfdrPaiResult {
  readonly verdict: "pass" | "partial" | "fail" | "data_missing";
  readonly gap_summary: string;
}

export function scoreSfdrPaiConsideration(
  inputs: SfdrPaiInputs,
): SfdrPaiResult {
  // Legal reads — both axes are in the declared scope.
  const _projectFacility = inputs.project.facility_type;
  const _entityUngc = inputs.entity.ungc_compliance_status;

  // Demonstration: SFDR product_label criteria must NOT read IssuanceInput.
  // The line below would produce TS2339 ("Property 'issuance' does not
  // exist on type ..."). The directive on the next line proves that error
  // exists; if the type system regressed and the access became legal, tsc
  // would report the directive as unused and the build would fail.
  // @ts-expect-error — SFDR product_label criteria must not read IssuanceInput
  const _illegalIssuanceRead = inputs.issuance.proceeds_amount;

  void _projectFacility;
  void _entityUngc;
  void _illegalIssuanceRead;

  // Stub body — real scoring logic is out of scope for the spike.
  return {
    verdict: "data_missing",
    gap_summary: "Stub — Phase 0 spike only. No real scoring performed.",
  };
}
