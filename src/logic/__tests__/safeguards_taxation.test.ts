import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  safeguards_taxation,
  EXPECTED_TAXATION_ITEMS,
} from "../safeguards_taxation";
import type { Criterion, ProjectInput } from "../../engine";

const criterion: Criterion = {
  id: "safeguards_taxation",
  criterion: "minimum_safeguards_taxation",
  source_reference: "Article_18_Regulation_2020_852",
  source_text: "...",
  requirement_type: "compliance_attestation",
  scoring_logic_ref: "logic.safeguards_taxation.v1",
  authority_level: 1,
};

function run(items: string[] | undefined) {
  const project: ProjectInput = {
    project_id: "p1",
    intake_timestamp: "2026-05-13T00:00:00Z",
    facility_type: "hyperscale",
    jurisdiction: "DE",
    facility_status: "operational",
    data_points: items === undefined ? {} : { taxation_compliance_items: items },
    evidence_documents: [],
  };
  return safeguards_taxation({
    criterion,
    data_points: project.data_points,
    evidence_documents: [],
    project,
  });
}

describe("safeguards_taxation — pillar 3 (Article 18)", () => {
  test("all three items confirmed → pass", () => {
    const r = run([...EXPECTED_TAXATION_ITEMS]);
    assert.equal(r.verdict, "pass");
  });

  test("CbC confirmed as either active reporting OR below-threshold via single item → pass when combined with the other two", () => {
    // The "or below threshold" reading is captured by one structured-list
    // identifier: country_by_country_reporting_or_below_threshold.
    const r = run([
      "tax_governance_policy_published",
      "no_tax_evasion_findings_24m",
      "country_by_country_reporting_or_below_threshold",
    ]);
    assert.equal(r.verdict, "pass");
  });

  test("missing CbC item but other two confirmed → fail (2/3 < 75%)", () => {
    const r = run([
      "tax_governance_policy_published",
      "no_tax_evasion_findings_24m",
    ]);
    assert.equal(r.verdict, "fail");
    assert.ok(r.missing_items?.includes("country_by_country_reporting_or_below_threshold"));
  });

  test("no input → data_missing", () => {
    const r = run(undefined);
    assert.equal(r.verdict, "data_missing");
  });
});
