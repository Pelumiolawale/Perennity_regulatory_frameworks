// Per-country profile inputs to the Perennity Bridge methodology.
//
// k1_climate is the climate coefficient used in the CNDCP WUEmax formula and
// re-used here to adjust the pue_performance_band thresholds. Cool climates
// (Köppen Cfb/Cfc/Dfb and similar) carry K1 = 1.0; warm climates (Köppen BWh/
// BSh, hot-summer Mediterranean, and tropical) carry K1 = 1.1. The value space
// is intentionally narrow — adding a third band would invalidate the WUEmax
// calibration.

export interface CountryProfile {
  k1_climate: 1.0 | 1.1;
}

export const COUNTRY_PROFILES: Record<string, CountryProfile> = {
  // Cool-climate sample (K1 = 1.0)
  DE: { k1_climate: 1.0 },
  FR: { k1_climate: 1.0 },
  GB: { k1_climate: 1.0 },
  IE: { k1_climate: 1.0 },
  NL: { k1_climate: 1.0 },
  SE: { k1_climate: 1.0 },
  NO: { k1_climate: 1.0 },
  FI: { k1_climate: 1.0 },
  DK: { k1_climate: 1.0 },
  PL: { k1_climate: 1.0 },
  CA: { k1_climate: 1.0 },
  US: { k1_climate: 1.0 },

  // Warm-climate sample (K1 = 1.1)
  AE: { k1_climate: 1.1 },
  SA: { k1_climate: 1.1 },
  QA: { k1_climate: 1.1 },
  KW: { k1_climate: 1.1 },
  OM: { k1_climate: 1.1 },
  BH: { k1_climate: 1.1 },
  EG: { k1_climate: 1.1 },
  ES: { k1_climate: 1.1 },
  IT: { k1_climate: 1.1 },
  GR: { k1_climate: 1.1 },
  PT: { k1_climate: 1.1 },
  BR: { k1_climate: 1.1 },
  IN: { k1_climate: 1.1 },
  SG: { k1_climate: 1.1 },
  AU: { k1_climate: 1.1 },
  ZA: { k1_climate: 1.1 },
  MX: { k1_climate: 1.1 },
};
