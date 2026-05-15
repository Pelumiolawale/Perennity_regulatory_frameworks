import type { LogicFn } from "./types";

const REF = "logic.sc_8_1_1.v2";
const VERSION = "v2";
const DEFAULT_FRESHNESS_YEARS = 3;
const AUDIT_DOC_TYPES = ["audit_report", "independent_audit"] as const;

// EU Taxonomy 8.1 §1: European Code of Conduct for Data Centre Energy Efficiency
// compliance, with independent third-party verification within the criterion's
// verification_frequency_years window. The audit document is discovered by
// document_type, not by a brittle document_id-equals-input-string match.
export const sc_8_1_1: LogicFn = ({ criterion, data_points, evidence_documents, project }) => {
  const base = {
    criterion_id: criterion.id,
    scoring_logic_ref: REF,
    scoring_logic_version: VERSION,
    evidence_refs: [] as string[],
  };

  const freshnessYears =
    "verification_frequency_years" in criterion && typeof criterion.verification_frequency_years === "number"
      ? criterion.verification_frequency_years
      : DEFAULT_FRESHNESS_YEARS;

  const practices = data_points["ecocc_practices_implemented"];
  if (practices === undefined) {
    return {
      ...base,
      verdict: "data_missing",
      observed_value: null,
      gap_summary: "Required input missing: ecocc_practices_implemented.",
    };
  }

  const practiceCount = Array.isArray(practices) ? practices.length : 0;
  if (practiceCount === 0) {
    return {
      ...base,
      verdict: "fail",
      observed_value: 0,
      gap_summary: "No European Code of Conduct practices recorded as implemented.",
    };
  }

  const auditDocs = evidence_documents.filter((d) =>
    (AUDIT_DOC_TYPES as readonly string[]).includes(d.document_type),
  );
  if (auditDocs.length === 0) {
    return {
      ...base,
      verdict: "data_missing",
      observed_value: null,
      gap_summary: `No independent audit document in submitted evidence. Activity 8.1 sc_8_1_1 requires an audit document (document_type: audit_report or independent_audit) within the past ${freshnessYears} years.`,
    };
  }

  const auditDoc = [...auditDocs].sort(
    (a, b) => Date.parse(b.uploaded_at) - Date.parse(a.uploaded_at),
  )[0];

  const ageYears = yearsBetween(auditDoc.uploaded_at, project.intake_timestamp);
  if (ageYears > freshnessYears) {
    return {
      ...base,
      verdict: "fail",
      observed_value: auditDoc.uploaded_at,
      evidence_refs: [auditDoc.document_id],
      gap_summary: `Most recent independent audit (uploaded ${auditDoc.uploaded_at}) is ${ageYears.toFixed(1)} years old; criterion requires revalidation within ${freshnessYears} years of intake (${project.intake_timestamp}).`,
    };
  }

  return {
    ...base,
    verdict: "pass",
    observed_value: practiceCount,
    evidence_refs: [auditDoc.document_id],
    gap_summary: `${practiceCount} European Code of Conduct practices attested; independently audited ${ageYears.toFixed(1)} years ago (document_type: ${auditDoc.document_type}).`,
  };
};

function yearsBetween(fromISO: string, toISO: string): number {
  const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
  return (new Date(toISO).getTime() - new Date(fromISO).getTime()) / MS_PER_YEAR;
}
