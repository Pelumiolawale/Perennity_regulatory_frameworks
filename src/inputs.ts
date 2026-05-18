// ============================================================================
// Runtime input axes — project, entity, issuance
// ============================================================================
//
// Three input axes the engine consumes alongside framework definitions:
//
//   - ProjectInput  : per-project intake. Defined in src/engine.ts and
//                     re-exported here for colocation. Required for every
//                     assessment.
//   - EntityInput   : corporate-parent / fund-manager level data. Consumed
//                     by product_label criteria (SFDR, UK SDR). Optional
//                     at the Engine.run boundary.
//   - IssuanceInput : bond / instrument level data. Consumed by
//                     issuance_framework criteria (ICMA GBP). Optional at
//                     the Engine.run boundary.
//
// EntityInput and IssuanceInput are MINIMAL in this commit — just enough
// for the type machinery in src/logic/types.ts to enforce axis boundaries.
// SFDR-specific fields (PAI 13/14, sustainable_investment_commitment) and
// ICMA-specific fields (proceeds tracking, reporting commitments) land in
// Phase 1 and Phase 3 respectively, alongside their scoring logic.
//
// Rationale for a sibling module to src/framework.ts
//   framework.ts describes the SHAPE of a framework definition (the JSON
//   that lives in regulatory-knowledge/). inputs.ts describes the SHAPE
//   of the runtime data the engine consumes when scoring. Different
//   concerns, kept in separate modules to keep each one focused.
// ============================================================================

import type { ProjectInput } from "./engine";

export type { ProjectInput };

// Minimal corporate-parent / fund-manager input. SFDR / UK SDR criteria
// will read this in Phase 1. Field set will grow as Phase 1 scoring lands.
export interface EntityInput {
  entity_id: string;
  legal_name: string;
  jurisdiction: string;
}

// Minimal bond-level input. ICMA GBP criteria will read this in Phase 3.
// Field set will grow as Phase 3 scoring lands.
export interface IssuanceInput {
  issuance_id: string;
  instrument_type:
    | "green_bond"
    | "sustainability_linked_bond"
    | "social_bond"
    | "sustainability_bond";
}

// Engine.run accepts a wrapper carrying any subset of axes. `project` is
// always required (every assessment has a project); `entity` and `issuance`
// are optional and only populated when the active framework's archetype
// reads from those axes. The pre-existing call shape — passing a bare
// ProjectInput directly to Engine.run — remains supported via the second
// overload on DeterministicEngine.run.
export interface RunInput {
  project: ProjectInput;
  entity?: EntityInput;
  issuance?: IssuanceInput;
}
