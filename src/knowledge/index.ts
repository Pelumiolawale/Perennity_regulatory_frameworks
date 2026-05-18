export {
  canonicalStringify,
  computeKnowledgeBaseHash,
  computeSchemaHash,
} from "./hash";

export {
  compileValidator,
  validateActivity,
  validateFramework,
  loadKnowledgeBase,
  KnowledgeBaseValidationError,
} from "./load";

export type {
  LoadOptions,
  KnowledgeBase,
  ValidationIssue,
  CompiledValidator,
} from "./load";

export {
  loadCriterionLibrary,
  resolveCriterionRefs,
  CriterionLibraryValidationError,
} from "./criterion-library";

export type {
  SharedCriterion,
  CriterionRef,
  CriterionLibrary,
  CriterionLibraryLoadOptions,
  CriterionRefResolution,
  RefResolutionError,
  ResolveRefsResult,
  CriterionAxis,
  CriterionScoringStatus,
  RegulatoryAnchor,
} from "./criterion-library";
