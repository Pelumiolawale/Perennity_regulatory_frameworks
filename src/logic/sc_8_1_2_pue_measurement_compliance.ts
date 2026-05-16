import type { LogicFn } from "./types";

const REF = "logic.sc_8_1_2_pue_measurement_compliance.v1";
const VERSION = "v1";
const DEFAULT_FRESHNESS_YEARS = 3;
const AUDIT_DOC_TYPES = ["audit_report", "independent_audit"] as const;

const PUE_METHODOLOGIES = ["EN_50600_4_2", "ISO_IEC_30134_2", "other_with_documentation"];
const PUE_CATEGORIES = ["category_1", "category_2", "category_3"];

// EU Taxonomy 8.1 §1 + ECoCC §9.3.5: PUE must be measured per EN 50600-4-2 or
// ISO/IEC 30134-2 with a documented boundary, annualised basis, and an
// independent third-party audit refreshed within the past three years. The
// criterion is a compliance attestation across five named items — not a
// numeric threshold (the 1.5 ratio cited in v3.1 was unsourced and has been
// removed; see commit message for v0.2.0).
export const sc_8_1_2_pue_measurement_compliance: LogicFn = ({
  criterion,
  data_points,
  evidence_documents,
  project,
}) => {
  const base = {
    criterion_id: criterion.id,
    scoring_logic_ref: REF,
    scoring_logic_version: VERSION,
    evidence_refs: [] as string[],
    authority_level: 1 as const,
  };

  const freshnessYears =
    "verification_frequency_years" in criterion &&
    typeof criterion.verification_frequency_years === "number"
      ? criterion.verification_frequency_years
      : DEFAULT_FRESHNESS_YEARS;

  const methodology = data_points["pue_measurement_methodology_declared"];
  const category = data_points["pue_measurement_category"];
  const boundary = data_points["pue_measurement_boundary_documented"];
  const reporting = data_points["pue_reporting_basis"];

  const allMissing =
    methodology === undefined &&
    category === undefined &&
    boundary === undefined &&
    reporting === undefined;

  // Audit evidence discovery — same pattern as sc_8_1_1 (commit 3f76d42).
  const auditDocs = evidence_documents.filter((d) =>
    (AUDIT_DOC_TYPES as readonly string[]).includes(d.document_type),
  );
  const freshAudit = [...auditDocs]
    .sort((a, b) => Date.parse(b.uploaded_at) - Date.parse(a.uploaded_at))
    .find((d) => yearsBetween(d.uploaded_at, project.intake_timestamp) <= freshnessYears);

  if (allMissing && !freshAudit) {
    return {
      ...base,
      verdict: "data_missing",
      observed_value: null,
      gap_summary:
        "No PUE measurement compliance inputs provided. Activity 8.1 §1 + ECoCC §9.3.5 require a declared measurement methodology (EN 50600-4-2 or ISO/IEC 30134-2), category, documented boundary, annualised reporting basis, and an independent audit refreshed within the past three years.",
    };
  }

  const items = {
    methodology:
      typeof methodology === "string" &&
      methodology !== "unspecified" &&
      PUE_METHODOLOGIES.includes(methodology),
    category:
      typeof category === "string" &&
      category !== "unspecified" &&
      PUE_CATEGORIES.includes(category),
    boundary: boundary === true,
    reporting: reporting === "annualised",
    audit: !!freshAudit,
  };
  const confirmedCount = Object.values(items).filter(Boolean).length;
  const missingNames = Object.entries(items)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  const evidence_refs = freshAudit ? [freshAudit.document_id] : [];

  if (confirmedCount === 5) {
    return {
      ...base,
      verdict: "pass",
      observed_value: confirmedCount,
      evidence_refs,
      gap_summary:
        "PUE measurement compliance: methodology, category, boundary, annualised reporting basis, and fresh independent audit all confirmed (Regulation (EU) 2021/2139 Annex I §8.1 ¶1; ECoCC §9.3.5).",
    };
  }
  if (confirmedCount === 4) {
    return {
      ...base,
      verdict: "partial",
      observed_value: confirmedCount,
      evidence_refs,
      gap_summary: `PUE measurement compliance: 4 of 5 items confirmed; missing: ${missingNames.join(", ")} (Regulation (EU) 2021/2139 Annex I §8.1 ¶1; ECoCC §9.3.5).`,
      missing_items: missingNames,
    };
  }
  return {
    ...base,
    verdict: "fail",
    observed_value: confirmedCount,
    evidence_refs,
    gap_summary: `PUE measurement compliance: only ${confirmedCount} of 5 items confirmed; missing: ${missingNames.join(", ")} (Regulation (EU) 2021/2139 Annex I §8.1 ¶1; ECoCC §9.3.5).`,
    missing_items: missingNames,
  };
};

function yearsBetween(fromISO: string, toISO: string): number {
  const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
  return (new Date(toISO).getTime() - new Date(fromISO).getTime()) / MS_PER_YEAR;
}
