// ============================================================================
// Phase 0 archetype prototype — THROWAWAY SPIKE
// ============================================================================
// Defines a FrameworkArchetype discriminated union covering the three shapes
// the engine will need to score in Phase 1:
//
//   1. activity_aligned   — project-level economic activity (EU Taxonomy 8.1)
//   2. product_label      — fund-level investment label (SFDR, UK SDR)
//   3. issuance_framework — bond-level use-of-proceeds (ICMA GBP)
//
// BACKWARD-COMPAT REQUIREMENT
//   The existing Activity type defined in src/engine.ts MUST continue to work
//   without modification. Existing BUNDLED_ACTIVITIES entries (currently just
//   EU Taxonomy 8.1) MUST fit the new activity_aligned arm of the union.
//   This is asserted by compat_check.ts.
//
// DESIGN CHOICES
//   - activity_aligned extends Activity with an OPTIONAL `archetype` tag, so
//     legacy JSON without `archetype` still satisfies the type. Readers
//     should default `archetype ?? "activity_aligned"`.
//   - product_label and issuance_framework do NOT inherit from Activity —
//     their shapes diverge enough (no environmental_objective, no NACE,
//     different criterion grouping) that inheritance would force every
//     archetype-specific reader to ignore irrelevant fields.
//   - Both new archetypes carry a REQUIRED `archetype` literal so the
//     discriminated union narrows cleanly via switch/if.
//
// This file is structural only. No scoring logic, no runtime exports.
// ============================================================================

import type { Activity, Framework, RequirementType } from "../engine";

export type FrameworkArchetype =
  | "activity_aligned"
  | "product_label"
  | "issuance_framework";

// ----------------------------------------------------------------------------
// 1. activity_aligned — extends existing Activity (backward-compat)
// ----------------------------------------------------------------------------

export interface ActivityAlignedFramework extends Activity {
  // Optional for backward-compat with EU Taxonomy 8.1 JSON, which predates
  // the archetype discriminator. Readers default to "activity_aligned" when
  // absent.
  readonly archetype?: "activity_aligned";
}

// ----------------------------------------------------------------------------
// 2. product_label — fund-level investment label (SFDR, UK SDR)
// ----------------------------------------------------------------------------
//
// A product label asks: "would this project qualify as an eligible investment
// for a fund using this label?". Criteria mix project-level and entity-level
// inputs (corporate parent governance, UNGC compliance, board composition,
// PAI 13 / PAI 14 disclosure). Per-criterion input scope is declared at the
// type level and enforced via InputsFor<S> in inputs.ts.

export interface ProductLabelFramework {
  readonly archetype: "product_label";
  readonly id: string;
  readonly framework: Framework;
  readonly framework_version: string;
  readonly framework_source_hash: string;
  readonly label_name: string;
  readonly label_authority: string;
  readonly methodology_version: string;
  readonly methodology_vintage?: string;
  readonly effective_date: string;
  readonly supersedes?: string;
  // A product label's scoring surface is a flat list of eligibility criteria,
  // each declaring its own input scope. There is no DNSH / SC distinction —
  // the label IS the criterion set.
  readonly eligibility_criteria: ProductLabelCriterion[];
}

export type ProductLabelInputAxis = "project" | "entity";

export interface ProductLabelCriterion {
  readonly id: string;
  readonly criterion: string;
  readonly source_reference: string;
  readonly source_text: string;
  readonly requirement_type: RequirementType;
  readonly authority_level: 1 | 2 | 3;
  readonly authority_source?: string;
  readonly scoring_logic_ref: string;
  // The list of input axes this criterion is allowed to read. A
  // product_label criterion may read project- and/or entity-level inputs;
  // it MUST NOT read issuance-level inputs (that's a different archetype).
  readonly input_scope: readonly ProductLabelInputAxis[];
  readonly snapshot_inclusion?: boolean;
  readonly render_paths?: ReadonlyArray<"snapshot" | "paid_report">;
}

// ----------------------------------------------------------------------------
// 3. issuance_framework — bond-level use-of-proceeds (ICMA GBP)
// ----------------------------------------------------------------------------
//
// An issuance framework scores a bond against four process components. Most
// criteria operate on issuance-level inputs (bond governance, proceeds
// tracking, reporting commitments). A subset may also read project-level
// inputs (for the use-of-proceeds project-alignment check). Entity-level
// inputs are out of scope for this archetype.

export interface IssuanceFramework {
  readonly archetype: "issuance_framework";
  readonly id: string;
  readonly framework: Framework;
  readonly framework_version: string;
  readonly framework_source_hash: string;
  readonly issuance_type: string;
  readonly methodology_version: string;
  readonly methodology_vintage?: string;
  readonly effective_date: string;
  readonly supersedes?: string;
  readonly process_components: IssuanceProcessComponent[];
}

export type IssuanceProcessComponentId =
  | "use_of_proceeds"
  | "project_evaluation_and_selection"
  | "management_of_proceeds"
  | "reporting";

export interface IssuanceProcessComponent {
  readonly id: IssuanceProcessComponentId;
  readonly heading: string;
  readonly criteria: IssuanceCriterion[];
}

export type IssuanceInputAxis = "project" | "issuance";

export interface IssuanceCriterion {
  readonly id: string;
  readonly criterion: string;
  readonly source_reference: string;
  readonly source_text: string;
  readonly requirement_type: RequirementType;
  readonly authority_level: 1 | 2 | 3;
  readonly authority_source?: string;
  readonly scoring_logic_ref: string;
  // The list of input axes this criterion is allowed to read. An
  // issuance_framework criterion may read issuance- and/or project-level
  // inputs; it MUST NOT read entity-level inputs.
  readonly input_scope: readonly IssuanceInputAxis[];
  readonly snapshot_inclusion?: boolean;
  readonly render_paths?: ReadonlyArray<"snapshot" | "paid_report">;
}

// ----------------------------------------------------------------------------
// Discriminated union
// ----------------------------------------------------------------------------

export type AnyFramework =
  | ActivityAlignedFramework
  | ProductLabelFramework
  | IssuanceFramework;
