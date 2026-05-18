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
// v0.5.0-alpha.2 (Phase 1, commit 1.2): added `dependencies` and
// `framework_results` optional fields. The intra-framework dependency map
// is populated by the SFDR dispatcher for criteria listed in depends_on.
// The cross-framework map is populated for criteria with
// depends_on_framework — currently SFDR criterion 6 reading EU Tax 8.1.
//
// Example
//   const sc_8_1_1: LogicFn<["project"]> = ({ project, ... }) => { ... };
//
//   const sfdr_pai: LogicFn<["project", "entity"]> = ({ project, entity, ... }) => { ... };
import type { FrameworkResult } from "../engine";

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
  // v0.5.0-alpha.2: dependency injection slots used by the SFDR dispatcher.
  // dependencies — intra-framework: keyed by criterion_id.
  // framework_results — cross-framework: keyed by framework_id.
  dependencies?: ReadonlyMap<string, CriterionResult>;
  framework_results?: ReadonlyMap<string, FrameworkResult>;
} & {
  [K in Axes[number]]: InputSlot<K>;
};

export type LogicFn<
  Axes extends readonly InputAxis[] = readonly ["project"],
> = (input: LogicInput<Axes>) => CriterionResult;

