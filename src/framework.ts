// ============================================================================
// Framework archetype types
// ============================================================================
//
// One engine, three framework archetypes. The Activity type defined in
// src/engine.ts is the activity_aligned archetype (EU Taxonomy 8.1 today;
// EU Taxonomy environmental and similar in future). The two new archetypes
// modelled here are:
//
//   - product_label      — fund-level investment label (SFDR, UK SDR)
//   - issuance_framework — bond-level use-of-proceeds (ICMA GBP, EU GBS)
//
// This commit (phase 0, 0.1) lands the TYPES and the JSON SCHEMA that can
// validate all three. It does NOT broaden the runtime, the renderers, or the
// scoring logic. Those changes land in 0.2 (LogicInput axes + Engine.run
// signature) and 0.3 (HeatmapCell archetype field + v0.4.0 release).
//
// Backward compat
//   The existing Activity type is unmodified. Activity is assignable to
//   ActivityAlignedFramework, which is the activity_aligned arm of the
//   AnyFramework union. The discriminator `archetype` is optional on
//   ActivityAlignedFramework so JSON without an explicit archetype field
//   (e.g. the pre-existing EU Taxonomy 8.1 definition) still validates.
//   Readers should default `archetype ?? "activity_aligned"`.
// ============================================================================

import type { Activity, Framework, RequirementType } from "./engine";

export type FrameworkArchetype =
  | "activity_aligned"
  | "product_label"
  | "issuance_framework";

// ----------------------------------------------------------------------------
// activity_aligned — extends Activity (backward-compat)
// ----------------------------------------------------------------------------

export interface ActivityAlignedFramework extends Activity {
  // Optional discriminator. Legacy JSON without an explicit archetype field
  // is treated as activity_aligned by the loader and the JSON Schema.
  archetype?: "activity_aligned";
}

// ----------------------------------------------------------------------------
// product_label — fund-level investment label (SFDR, UK SDR)
// ----------------------------------------------------------------------------

export type ProductLabelFamily = "sfdr" | "uk_sdr";

export type ProductLabelInputAxis = "project" | "entity";

export interface ProductLabelCriterion {
  id: string;
  criterion: string;
  source_reference: string;
  source_text: string;
  requirement_type: RequirementType;
  scoring_logic_ref: string;
  // Input axes this criterion may read. A product_label criterion may read
  // project- and/or entity-level inputs; it MUST NOT read issuance-level
  // inputs (that's the issuance_framework archetype). Enforced at the type
  // level once LogicInput is broadened in commit 0.2; enforced at the schema
  // level today by the `input_scope` enum.
  input_scope: ProductLabelInputAxis[];
  authority_level?: 1 | 2 | 3;
  authority_source?: string;
  snapshot_inclusion?: boolean;
  render_paths?: ("snapshot" | "paid_report")[];
}

export interface ProductLabelFramework {
  archetype: "product_label";
  id: string;
  framework: Framework;
  framework_version: string;
  framework_source_hash: string;
  methodology_version: string;
  methodology_vintage?: string;
  effective_date: string;
  supersedes?: string;
  // Required for product_label
  label_id: string;
  label_family: ProductLabelFamily;
  eligibility_criteria: ProductLabelCriterion[];
  // Optional
  pai_indicators?: PAIIndicator[];
  entity_attestations?: string[];
  sustainable_investment_commitment?: SustainableInvestmentCommitment;
}

export interface PAIIndicator {
  indicator_id: string;
  description: string;
  mandatory: boolean;
}

export interface SustainableInvestmentCommitment {
  minimum_proportion: number;
  categories: string[];
}

// ----------------------------------------------------------------------------
// issuance_framework — bond-level use-of-proceeds (ICMA GBP, EU GBS)
// ----------------------------------------------------------------------------

export type IssuanceProcessComponentId =
  | "use_of_proceeds"
  | "project_evaluation_and_selection"
  | "management_of_proceeds"
  | "reporting";

export type IssuanceInputAxis = "project" | "issuance";

export interface IssuanceCriterion {
  id: string;
  criterion: string;
  source_reference: string;
  source_text: string;
  requirement_type: RequirementType;
  scoring_logic_ref: string;
  // Input axes this criterion may read. An issuance_framework criterion may
  // read issuance- and/or project-level inputs; it MUST NOT read entity-level
  // inputs.
  input_scope: IssuanceInputAxis[];
  authority_level?: 1 | 2 | 3;
  authority_source?: string;
  snapshot_inclusion?: boolean;
  render_paths?: ("snapshot" | "paid_report")[];
}

export interface IssuanceProcessComponent {
  id: IssuanceProcessComponentId;
  heading: string;
  criteria: IssuanceCriterion[];
}

export interface IssuanceFramework {
  archetype: "issuance_framework";
  id: string;
  framework: Framework;
  framework_version: string;
  framework_source_hash: string;
  methodology_version: string;
  methodology_vintage?: string;
  effective_date: string;
  supersedes?: string;
  // Required for issuance_framework
  framework_id: string;
  process_components: IssuanceProcessComponent[];
  // Optional
  external_review_type?:
    | "second_party_opinion"
    | "verification"
    | "certification"
    | "rating";
}

// ----------------------------------------------------------------------------
// Discriminated union
// ----------------------------------------------------------------------------
//
// AnyFramework is the meta-type for "a framework of any archetype". The
// engine runtime (Engine.run) still consumes Activity[] in v0.3.0; that
// signature is broadened to AnyFramework[] in commit 0.2.

export type AnyFramework =
  | ActivityAlignedFramework
  | ProductLabelFramework
  | IssuanceFramework;
