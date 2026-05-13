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
}

export type LogicFn = (input: LogicInput) => CriterionResult;
