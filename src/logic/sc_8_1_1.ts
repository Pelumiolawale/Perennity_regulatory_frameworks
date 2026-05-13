import type { LogicFn } from "./types";

const REF = "logic.sc_8_1_1.v1";
const VERSION = "v1";
const AUDIT_VALIDITY_YEARS = 3;

// EU Taxonomy 8.1 §1: European Code of Conduct for Data Centre Energy Efficiency
// compliance, with independent third-party verification at least every 3 years.
export const sc_8_1_1: LogicFn = ({ criterion, data_points, evidence_documents, project }) => {
  const base = {
    criterion_id: criterion.id,
    scoring_logic_ref: REF,
    scoring_logic_version: VERSION,
    evidence_refs: [] as string[],
  };

  const practices = data_points["ecocc_practices_implemented"];
  const auditRef = data_points["last_independent_audit_date"];

  const missing: string[] = [];
  if (practices === undefined) missing.push("ecocc_practices_implemented");
  if (auditRef === undefined) missing.push("last_independent_audit_date");
  if (missing.length > 0) {
    return {
      ...base,
      verdict: "data_missing",
      observed_value: null,
      gap_summary: `Required inputs missing: ${missing.join(", ")}.`,
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

  const auditDoc = evidence_documents.find((d) => d.document_id === auditRef);
  if (!auditDoc) {
    return {
      ...base,
      verdict: "data_missing",
      observed_value: String(auditRef),
      gap_summary: `Referenced audit document "${auditRef}" was not found in submitted evidence.`,
    };
  }

  const ageYears = yearsBetween(auditDoc.uploaded_at, project.intake_timestamp);
  if (ageYears > AUDIT_VALIDITY_YEARS) {
    return {
      ...base,
      verdict: "fail",
      observed_value: auditDoc.uploaded_at,
      evidence_refs: [auditDoc.document_id],
      gap_summary: `Last independent audit was ${ageYears.toFixed(1)} years ago; revalidation required every ${AUDIT_VALIDITY_YEARS} years.`,
    };
  }

  // Partial: audit is recent but verification source isn't classified as independent third-party.
  if (auditDoc.document_type !== "independent_audit") {
    return {
      ...base,
      verdict: "partial",
      observed_value: auditDoc.document_type,
      evidence_refs: [auditDoc.document_id],
      gap_summary: `Audit evidence is of type "${auditDoc.document_type}"; criterion requires independent third-party verification.`,
    };
  }

  return {
    ...base,
    verdict: "pass",
    observed_value: practiceCount,
    evidence_refs: [auditDoc.document_id],
    gap_summary: `${practiceCount} European Code of Conduct practices attested; independently audited ${ageYears.toFixed(1)} years ago.`,
  };
};

function yearsBetween(fromISO: string, toISO: string): number {
  const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
  return (new Date(toISO).getTime() - new Date(fromISO).getTime()) / MS_PER_YEAR;
}
