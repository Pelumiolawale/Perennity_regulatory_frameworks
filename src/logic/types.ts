import type {
  Criterion,
  DNSHCriterion,
  CriterionResult,
  EvidenceReference,
  ProjectInput,
} from "../engine";
import type { EntityInput, IssuanceInput } from "../inputs";

// The three input axes a criterion may read. EU Taxonomy criteria declare
// ["project"]; future SFDR criteria declare ["project", "entity"]; future
// ICMA criteria declare ["project", "issuance"]. Axes a criterion does
// NOT declare are absent from its LogicInput type, so reading them is a
// compile-time error.
export type InputAxis = "project" | "entity" | "issuance";

type InputSlot<K extends InputAxis> = K extends "project"
  ? ProjectInput
  : K extends "entity"
    ? EntityInput
    : K extends "issuance"
      ? IssuanceInput
      : never;

// LogicInput<Axes> — narrowed per-criterion view of available inputs. Each
// criterion declares the axes it reads via its LogicFn type argument; the
// declared axes become required fields on the input parameter and any
// undeclared axis access becomes a TS error. The default ["project"]
// preserves the existing single-axis pattern for EU Taxonomy criteria.
//
// Example
//   const sc_8_1_1: LogicFn<["project"]> = ({ project, ... }) => { ... };
//
//   // hypothetical SFDR criterion (Phase 1):
//   const sfdr_pai: LogicFn<["project", "entity"]> = ({ project, entity, ... }) => { ... };
export type LogicInput<
  Axes extends readonly InputAxis[] = readonly ["project"],
> = {
  criterion: Criterion | DNSHCriterion;
  data_points: Record<string, unknown>;
  evidence_documents: EvidenceReference[];
  // For rollup/dependent criteria — engine populates this with the results
  // of criteria listed in `depends_on` before invoking the dependent logic
  // function.
  previous_results?: Record<string, CriterionResult>;
} & {
  [K in Axes[number]]: InputSlot<K>;
};

export type LogicFn<
  Axes extends readonly InputAxis[] = readonly ["project"],
> = (input: LogicInput<Axes>) => CriterionResult;
