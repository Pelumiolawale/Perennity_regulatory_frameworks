import type { LogicFn } from "./types";
import { COUNTRY_PROFILES } from "../data/country_profiles";

const REF = "logic.pue_performance_band.v1";
const VERSION = "v1";

interface Band {
  max: number;
  label: string;
  score: number;
}

// Bands calibrated against the Uptime Institute Global Data Center Survey 2025
// weighted-average annual PUE of 1.54 (n=681). Cool climates carry the tighter
// scale; warm climates are shifted +0.10 to align with the K1=1.1 climate
// coefficient already used in the CNDCP WUEmax formula.
const COOL_BANDS: readonly Band[] = [
  { max: 1.2, label: "industry_leading", score: 95 },
  { max: 1.4, label: "strong", score: 80 },
  { max: 1.6, label: "at_benchmark", score: 60 },
  { max: 1.8, label: "below_benchmark", score: 40 },
  { max: Number.POSITIVE_INFINITY, label: "materially_below_benchmark", score: 20 },
];

const WARM_BANDS: readonly Band[] = [
  { max: 1.3, label: "industry_leading", score: 95 },
  { max: 1.5, label: "strong", score: 80 },
  { max: 1.7, label: "at_benchmark", score: 60 },
  { max: 1.9, label: "below_benchmark", score: 40 },
  { max: Number.POSITIVE_INFINITY, label: "materially_below_benchmark", score: 20 },
];

// Perennity Bridge methodology criterion (authority_level 2). Banded score —
// does NOT contribute to EU Taxonomy alignment routing. Renders only on the
// paid report alongside the regulatory sc_8_1_2 measurement-compliance block.
export const pue_performance_band: LogicFn<["project"]> = ({ criterion, data_points }) => {
  const base = {
    criterion_id: criterion.id,
    scoring_logic_ref: REF,
    scoring_logic_version: VERSION,
    evidence_refs: [] as string[],
    authority_level: 2 as const,
  };

  const pueRaw = data_points["pue_actual"];
  const country = data_points["country_code"];
  const facilityStatus = data_points["facility_status"];
  const buildYearRaw = data_points["build_year"];

  if (pueRaw === undefined || pueRaw === null) {
    return {
      ...base,
      verdict: "data_missing",
      observed_value: null,
      gap_summary:
        "PUE actual value (pue_actual) not provided; cannot place project in the Perennity Bridge benchmarking band.",
    };
  }
  if (typeof country !== "string" || country.length === 0) {
    return {
      ...base,
      verdict: "data_missing",
      observed_value: null,
      gap_summary:
        "country_code not provided; cannot apply climate K1 adjustment for the Perennity Bridge benchmarking band.",
    };
  }
  const pue = typeof pueRaw === "number" ? pueRaw : Number(pueRaw);
  if (!Number.isFinite(pue)) {
    return {
      ...base,
      verdict: "data_missing",
      observed_value: String(pueRaw),
      gap_summary: `pue_actual "${pueRaw}" is not a finite number.`,
    };
  }

  const profile = COUNTRY_PROFILES[country];
  const k1 = profile?.k1_climate ?? 1.0;
  // Defensive on floating-point: any K1 >= 1.05 is warm.
  const isWarm = k1 >= 1.05;
  const bands = isWarm ? WARM_BANDS : COOL_BANDS;

  const buildYear = typeof buildYearRaw === "number" ? buildYearRaw : Number(buildYearRaw);
  const isNewBuild = facilityStatus === "design" || (Number.isFinite(buildYear) && buildYear >= 2025);

  const baseBandIdx = bands.findIndex((b) => pue <= b.max);
  const baseBand = bands[baseBandIdx];
  const newBuildBand =
    isNewBuild && baseBandIdx > 0 ? bands[baseBandIdx - 1] : isNewBuild ? baseBand : null;

  const climate_label = isWarm ? "warm" : "cool";
  const tail = isNewBuild && newBuildBand
    ? ` New-build read also reported: ${newBuildBand.label.replace(/_/g, " ")}.`
    : "";

  return {
    ...base,
    verdict: "banded",
    observed_value: pue,
    gap_summary: `Perennity Bridge band: ${baseBand.label.replace(/_/g, " ")} (PUE ${pue}, climate K1=${k1}, ${climate_label} climate per country profile ${country}).${tail} Benchmarking output under Perennity Bridge authority — not an EU Taxonomy alignment claim.`,
    band_label: baseBand.label,
    band_score: baseBand.score,
    new_build_read: newBuildBand
      ? { band_label: newBuildBand.label, band_score: newBuildBand.score }
      : null,
    climate_k1: k1,
    climate_label,
    country_code: country,
  };
};
