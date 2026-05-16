import type {
  Criterion,
  DNSHCriterion,
  CriterionResult,
  EvidenceReference,
  ProjectInput,
} from "../engine";

export interface LogicInput {
  criterion: Criterion | DNSHCriterion;
  data_points: Record<string, unknown>;
  evidence_documents: EvidenceReference[];
  project: ProjectInput;
  // For rollup/dependent criteria — engine populates this with the results of
  // criteria listed in `depends_on` before invoking the dependent logic fn.
  previous_results?: Record<string, CriterionResult>;
}

export type LogicFn = (input: LogicInput) => CriterionResult;
