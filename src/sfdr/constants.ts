// ============================================================================
// SFDR runtime constants (v0.5.0-alpha.2 — Phase 1, commit 1.2)
// ============================================================================
//
// Inlined copy of the canonical JSON files at regulatory-knowledge/constants/.
// The JSON files are the source of truth for docs / tooling / external
// consumers; this TS file is the runtime mirror that scoring functions
// import. Drift is caught by the parity test in
// src/sfdr/__tests__/constants-parity.test.ts — when the JSON updates,
// update both files atomically.
// ============================================================================

import type { SectorMaterialCategoryId } from "./types";

// EU Council Annex I non-cooperative jurisdictions for tax purposes.
// Last verified against ECOFIN Council Conclusions of 20 February 2024.
export const EU_NON_COOPERATIVE_JURISDICTIONS: ReadonlySet<string> = new Set([
  "American Samoa",
  "Anguilla",
  "Antigua and Barbuda",
  "Fiji",
  "Guam",
  "Palau",
  "Panama",
  "Russia",
  "Samoa",
  "Trinidad and Tobago",
  "US Virgin Islands",
  "Vanuatu",
]);

// 11 material PAIs for data-centre developer assessment under SFDR.
export const MATERIAL_PAI_NUMBERS: readonly number[] = [
  1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 13,
];

// Recognised sustainability reporting standards (criterion 5 elements 4 / 6
// "covered_specific" gate, and criterion 7 indicator-link standard check).
export const RECOGNISED_STANDARDS: ReadonlySet<string> = new Set([
  "gri",
  "tcfd",
  "ifrs_s1",
  "ifrs_s2",
  "efrag_esrs",
  "cdp",
]);

// Sector-material category ids used by criterion 1.
export const SECTOR_MATERIAL_CATEGORIES: ReadonlySet<SectorMaterialCategoryId> = new Set([
  "energy_efficiency",
  "water_stewardship",
  "land_use_biodiversity",
  "community_local_impact",
]);

// 5-year UNGC violations lookback (shared by criterion 2 Domain B and
// criterion 4 PAI 10/11 — single rule, single constant).
export const UNGC_LOOKBACK_YEARS = 5;

// Criterion 5 cascade recency thresholds.
export const PRE_CONTRACTUAL_ALIGNED_RECENCY_DAYS = 365;
export const PRE_CONTRACTUAL_PARTIAL_RECENCY_DAYS = 547;

// Criterion 3 PAI policy recency thresholds.
export const PAI_POLICY_ALIGNED_RECENCY_DAYS = 365;
export const PAI_POLICY_PARTIAL_RECENCY_DAYS = 547;

// Criterion 6 material overstatement threshold (pp).
export const TAXONOMY_OVERSTATEMENT_THRESHOLD_PP = 10;

// Criterion 7 operational threshold (months since commissioning).
export const OPERATIONAL_THRESHOLD_MONTHS = 18;
