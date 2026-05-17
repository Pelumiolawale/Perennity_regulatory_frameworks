// ============================================================================
// Phase 0 archetype prototype — input axes and scope enforcement
// ============================================================================
//
// Defines the three input axes a future multi-archetype engine will consume:
//
//   - ProjectInput  : the existing per-project intake (re-exported from
//                     engine.ts unchanged; no extension needed for the spike).
//   - EntityInput   : NEW. Corporate-parent / fund-manager level data — UNGC
//                     compliance, board composition, PAI 13 / PAI 14
//                     disclosure, human rights policy. Consumed by
//                     product_label criteria.
//   - IssuanceInput : NEW. Bond / instrument level data — proceeds tracking,
//                     reporting commitments, issuance governance. Consumed
//                     by issuance_framework criteria.
//
// DESIGN DECISION (locked) — activity_aligned's allowed input scope
//   An activity_aligned criterion may read project-only OR project + entity.
//   EU Taxonomy 8.1 currently encodes entity-flavoured concerns (minimum
//   safeguards: human rights, anti-bribery, taxation, fair competition)
//   inside ProjectInput.data_points — the user attests to them per-project
//   today. Long-term those fields should migrate to EntityInput and the
//   safeguards criteria should declare `input_scope = ["entity"]`. For
//   Phase 0 we preserve the status quo: 8.1 reads project-only. The type
//   system permits either scope without breaking 8.1's backward compat.
//
// TYPE-SYSTEM MECHANISM
//   Each archetype declares the set of input axes its criteria may read.
//   The criterion-level `input_scope` is a tuple of axis names. The scoring
//   function's parameter type is computed from that tuple via InputsFor<S>:
//
//     InputsFor<["project", "entity"]>
//       = { project: ProjectInput; entity: EntityInput }
//
//   Reading any axis NOT in the scope produces a TS error at the scoring-
//   function site. Demonstrated in stub_sfdr.ts (issuance rejected) and
//   stub_icma.ts (entity rejected).
// ============================================================================

import type { ProjectInput } from "../engine";

// Re-export so prototype consumers can stay on this barrel.
export type { ProjectInput };

// ----------------------------------------------------------------------------
// Entity-level inputs — fund-manager / corporate-parent governance
// ----------------------------------------------------------------------------

export type UngcStatus =
  | "compliant"
  | "non_compliant"
  | "withdrawn"
  | "not_disclosed";

export interface BoardComposition {
  readonly independent_director_count: number;
  readonly total_director_count: number;
  readonly gender_diversity_ratio: number | null;
}

// SFDR Principal Adverse Impact disclosure (subset relevant to Article 8/9).
// PAI 13 = board gender diversity; PAI 14 = exposure to controversial weapons.
export interface PAIDisclosure {
  readonly pai_13_board_gender_diversity_disclosed: boolean | null;
  readonly pai_14_controversial_weapons_exposure_disclosed: boolean | null;
  readonly pai_statement_url: string | null;
}

export interface SafeguardsAttestation {
  readonly human_rights_policy_aligned: boolean | null;
  readonly grievance_mechanism_exists: boolean | null;
  readonly tax_strategy_published: boolean | null;
  readonly anti_competitive_conduct_disclosure: boolean | null;
}

export interface EntityInput {
  readonly entity_id: string;
  readonly legal_name: string;
  readonly jurisdiction: string;
  readonly entity_type: "fund_manager" | "corporate_parent" | "asset_owner";
  readonly ungc_compliance_status: UngcStatus;
  readonly board_composition: BoardComposition;
  readonly human_rights_policy_published: boolean;
  readonly anti_bribery_policy_published: boolean;
  readonly pai_disclosure: PAIDisclosure;
  readonly minimum_safeguards_attestation: SafeguardsAttestation;
}

// ----------------------------------------------------------------------------
// Issuance-level inputs — bond / instrument governance
// ----------------------------------------------------------------------------

export type InstrumentType =
  | "green_bond"
  | "sustainability_linked_bond"
  | "social_bond"
  | "sustainability_bond";

export type ProceedsTracking =
  | "segregated_account"
  | "internal_ledger"
  | "earmarked_portfolio"
  | "none";

export interface ReportingCommitments {
  readonly annual_use_of_proceeds_report: boolean;
  readonly annual_impact_report: boolean;
  readonly assurance_provider: string | null;
}

export interface ExternalReview {
  readonly type:
    | "second_party_opinion"
    | "verification"
    | "certification"
    | "rating";
  readonly provider: string;
  readonly issued_at: string;
}

export interface IssuanceInput {
  readonly issuance_id: string;
  readonly instrument_type: InstrumentType;
  readonly issuance_date: string;
  readonly proceeds_amount: number;
  readonly proceeds_currency: string;
  readonly proceeds_tracking_methodology: ProceedsTracking;
  readonly use_of_proceeds_categories: readonly string[];
  readonly reporting_commitments: ReportingCommitments;
  readonly external_review: ExternalReview | null;
}

// ----------------------------------------------------------------------------
// Aggregate intake — what a single assessment may carry
// ----------------------------------------------------------------------------
//
// All three axes are optional. The scoring router populates only the ones
// the active archetype's criteria declare in their input_scope.

export interface AssessmentInputs {
  readonly project?: ProjectInput;
  readonly entity?: EntityInput;
  readonly issuance?: IssuanceInput;
}

// ----------------------------------------------------------------------------
// Type-level enforcement: InputsFor<S>
// ----------------------------------------------------------------------------
//
// Resolves a tuple of axis names to the corresponding subset of inputs as a
// required-keys object. Reading any axis not in S becomes a TS error at the
// scoring-function call site.

export type InputAxis = "project" | "entity" | "issuance";

export type InputsFor<S extends readonly InputAxis[]> = {
  readonly [K in S[number]]: K extends "project"
    ? ProjectInput
    : K extends "entity"
      ? EntityInput
      : K extends "issuance"
        ? IssuanceInput
        : never;
};
