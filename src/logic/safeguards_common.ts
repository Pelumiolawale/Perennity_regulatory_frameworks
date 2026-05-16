import type { LogicFn } from "./types";
import type { CriterionResult } from "../engine";

// Shared logic for the four minimum-safeguards pillars. Each pillar is a
// structured-list compliance attestation. Verdict:
//   - all items confirmed → pass
//   - ratio >= 0.75 → partial
//   - otherwise → fail
//   - input absent → data_missing
//
// Note: pillars with only 2 expected items (fair_competition) collapse the
// 75% threshold to "1 of 2 confirmed → partial; 0 of 2 → fail". The narrative
// makes this explicit so the verdict is not surprising.

export interface SafeguardsPillarSpec {
  ref: string;
  version: string;
  dataPointKey: string;
  expectedItems: readonly string[];
  pillarName: string;
  citation: string;
}

export function makePillarLogic(spec: SafeguardsPillarSpec): LogicFn {
  return ({ criterion, data_points }) => {
    const base = {
      criterion_id: criterion.id,
      scoring_logic_ref: spec.ref,
      scoring_logic_version: spec.version,
      evidence_refs: [] as string[],
      authority_level: 1 as const,
    };

    const raw = data_points[spec.dataPointKey];
    if (raw === undefined) {
      return {
        ...base,
        verdict: "data_missing",
        observed_value: null,
        gap_summary: `Minimum safeguards — ${spec.pillarName}: input "${spec.dataPointKey}" not provided. ${spec.citation}`,
      } satisfies CriterionResult;
    }
    if (!Array.isArray(raw)) {
      return {
        ...base,
        verdict: "data_missing",
        observed_value: null,
        gap_summary: `Minimum safeguards — ${spec.pillarName}: "${spec.dataPointKey}" must be an array of compliance identifiers. ${spec.citation}`,
      } satisfies CriterionResult;
    }

    const declared = raw.map(String);
    const present = spec.expectedItems.filter((e) => declared.includes(e));
    const missing = spec.expectedItems.filter((e) => !declared.includes(e));
    const total = spec.expectedItems.length;
    const confirmed = present.length;
    const ratio = total === 0 ? 0 : confirmed / total;

    if (confirmed === total) {
      return {
        ...base,
        verdict: "pass",
        observed_value: confirmed,
        gap_summary: `Minimum safeguards — ${spec.pillarName}: all ${total} required items confirmed. ${spec.citation}`,
      } satisfies CriterionResult;
    }
    // 2-item pillars special-case: a single confirmation is "partial", not
    // "fail". The 75% threshold otherwise applies: 4/5 → partial, 3/5 → fail,
    // 2/3 → fail. Documented in the KB narrative so the verdict isn't
    // surprising for fair_competition.
    const isPartial = total === 2 ? confirmed === 1 : ratio >= 0.75;
    void ratio; // ratio retained in scope for log/debug clarity
    if (isPartial) {
      return {
        ...base,
        verdict: "partial",
        observed_value: confirmed,
        gap_summary: `Minimum safeguards — ${spec.pillarName}: ${confirmed} of ${total} required items confirmed; missing: ${missing.join(", ")}. ${spec.citation}`,
        missing_items: [...missing],
      } satisfies CriterionResult;
    }
    return {
      ...base,
      verdict: "fail",
      observed_value: confirmed,
      gap_summary: `Minimum safeguards — ${spec.pillarName}: only ${confirmed} of ${total} required items confirmed; missing: ${missing.join(", ")}. ${spec.citation}`,
      missing_items: [...missing],
    } satisfies CriterionResult;
  };
}
