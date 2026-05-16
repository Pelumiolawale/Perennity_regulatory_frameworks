// Ad-hoc engine scenario runner. Builds a synthetic ProjectInput from CLI
// flags, runs the v3.2 engine end-to-end against the EU Taxonomy 8.1 KB, and
// prints a readable report of verdicts, bands, safeguards rollup, and gaps.
//
// Run via:
//   node --import tsx scripts/scenario.ts [flags]
//
// Default scenario is "everything passes". Each flag weakens or alters one
// dimension so you can poke individual criteria.
//
// Common scenarios:
//   --pue 1.55 --country DE                          → cool at_benchmark band
//   --pue 1.45 --country AE --build-year 2027        → MENA new-build "strong"
//   --no-audit                                       → sc_8_1_2 fails
//   --safeguards-human-rights 3                      → rollup partial → overall partial
//   --no-safeguards-pillar safeguards_taxation       → rollup data_missing
//   --json                                            → emit full EngineRun JSON
//
// This script is not part of the npm test surface and not bundled in dist/.

import { readFileSync } from "node:fs";
import path from "node:path";
import { DeterministicEngine } from "../src/runtime";
import { METHODOLOGY_VERSION } from "../src/lib/methodologyVersion";
import type {
  Activity,
  EvidenceReference,
  ProjectInput,
} from "../src/engine";
import {
  EXPECTED_HUMAN_RIGHTS_ITEMS,
} from "../src/logic/safeguards_human_rights";
import {
  EXPECTED_BRIBERY_CORRUPTION_ITEMS,
} from "../src/logic/safeguards_bribery_corruption";
import {
  EXPECTED_TAXATION_ITEMS,
} from "../src/logic/safeguards_taxation";
import {
  EXPECTED_FAIR_COMPETITION_ITEMS,
} from "../src/logic/safeguards_fair_competition";

const REPO_ROOT = path.resolve(__dirname, "..");
const ACTIVITY_PATH = path.join(
  REPO_ROOT,
  "regulatory-knowledge/frameworks/eu_taxonomy_climate/eu_tax_climate_8_1.json",
);

// ---- flag parsing -----------------------------------------------------------

type Flags = Record<string, string | boolean>;
function parseFlags(argv: string[]): Flags {
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i++;
    }
  }
  return flags;
}

function num(v: string | boolean | undefined, fallback: number): number {
  if (typeof v !== "string") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function str(v: string | boolean | undefined, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}
function bool(v: string | boolean | undefined, fallback: boolean): boolean {
  if (v === undefined) return fallback;
  if (typeof v === "boolean") return v;
  return v === "true" || v === "1" || v === "yes";
}

const flags = parseFlags(process.argv.slice(2));

if (flags["help"] || flags["h"]) {
  console.log(`Engine scenario runner — methodology ${METHODOLOGY_VERSION}

Inputs you can flip (all optional — defaults give an all-pass scenario):

  --pue <n>                 PUE actual ratio (default 1.32)
  --country <code>          ISO country code (default DE; AE/SA/QA = warm climate)
  --build-year <year>       Build year; >= 2025 triggers new-build read
  --status <s>              facility_status: operational | construction | design

  --pue-methodology <m>     EN_50600_4_2 (default) | ISO_IEC_30134_2 | other_with_documentation
  --pue-category <n>        1, 2 (default), or 3
  --pue-boundary <bool>     PUE measurement boundary documented (default true)
  --pue-reporting <r>       annualised (default) | design_point_only

  --no-audit                Omit the independent audit document
  --stale-audit             Make the audit doc 5 years old

  --ecocc-practices <n>     Number of ECoCC practices (default 4); 0 → fail
  --no-ecocc                Omit ecocc_practices_implemented entirely

  --circular-economy <n>    Number of circular-economy items confirmed (0-4, default 4)
  --water-stress <s>        Low (default) | Medium | High | Extremely High
  --wue <n>                 WUE annualised (default 0.25)
  --no-climate-assessment   Set climate_risk_assessment_completed to false

  --safeguards-human-rights <n>      0-5 items confirmed (default 5)
  --safeguards-bribery <n>           0-3 items confirmed (default 3)
  --safeguards-taxation <n>          0-3 items confirmed (default 3)
  --safeguards-fair-competition <n>  0-2 items confirmed (default 2)
  --no-safeguards-pillar <id>        Omit a pillar entirely (data_missing)

  --json                    Dump full EngineRun JSON
  --help                    Show this help
`);
  process.exit(0);
}

// ---- build ProjectInput from flags ------------------------------------------

const country = str(flags["country"], "DE");
const pueActual = num(flags["pue"], 1.32);
const buildYear = num(flags["build-year"], 2020);
const facilityStatus = str(flags["status"], "operational") as ProjectInput["facility_status"];

const eccoCount = flags["no-ecocc"] ? null : num(flags["ecocc-practices"], 4);
const eccoPractices = eccoCount === null ? undefined : [
  "airflow_management",
  "free_cooling",
  "heat_reuse",
  "high_efficiency_ups",
  "cold_aisle_containment",
].slice(0, eccoCount);

const circularCount = num(flags["circular-economy"], 4);
const circularItems = [
  "ecodesign_2009_125",
  "rohs_2011_65",
  "waste_management_plan",
  "weee_endoflife_2012_19",
].slice(0, circularCount);

const omittedPillar = str(flags["no-safeguards-pillar"], "");

function pillarItems<T extends readonly string[]>(
  pillarId: string,
  expected: T,
  flagName: string,
): string[] | undefined {
  if (omittedPillar === pillarId) return undefined;
  const count = num(flags[flagName], expected.length);
  return expected.slice(0, count);
}

const humanRights = pillarItems(
  "safeguards_human_rights",
  EXPECTED_HUMAN_RIGHTS_ITEMS,
  "safeguards-human-rights",
);
const bribery = pillarItems(
  "safeguards_bribery_corruption",
  EXPECTED_BRIBERY_CORRUPTION_ITEMS,
  "safeguards-bribery",
);
const taxation = pillarItems(
  "safeguards_taxation",
  EXPECTED_TAXATION_ITEMS,
  "safeguards-taxation",
);
const fairCompetition = pillarItems(
  "safeguards_fair_competition",
  EXPECTED_FAIR_COMPETITION_ITEMS,
  "safeguards-fair-competition",
);

const auditDocs: EvidenceReference[] = flags["no-audit"]
  ? []
  : [
      {
        document_id: "doc-audit-scenario",
        document_type: "independent_audit",
        uri: "https://evidence.test/audit-scenario.pdf",
        uploaded_at: flags["stale-audit"]
          ? "2020-01-01T00:00:00Z"
          : "2025-06-01T00:00:00Z",
        sha256: "1".repeat(64),
      },
    ];

const dataPoints: Record<string, unknown> = {
  // sc_8_1_1
  ...(eccoPractices ? { ecocc_practices_implemented: eccoPractices } : {}),
  last_independent_audit_date: "doc-audit-scenario",

  // legacy sc_8_1_2.v1 (kept for any backward-compat path)
  annualised_pue: pueActual,

  // sc_8_1_2 measurement compliance
  pue_measurement_methodology_declared: str(flags["pue-methodology"], "EN_50600_4_2"),
  pue_measurement_category: `category_${str(flags["pue-category"], "2")}`,
  pue_measurement_boundary_documented: bool(flags["pue-boundary"], true),
  pue_reporting_basis: str(flags["pue-reporting"], "annualised"),

  // pue_performance_band (Perennity authority_level 2)
  pue_actual: pueActual,
  country_code: country,
  facility_status: facilityStatus,
  build_year: buildYear,

  // DNSH adaptation
  climate_risk_assessment_completed: !flags["no-climate-assessment"],
  climate_risk_assessment_methodology:
    "TCFD-aligned scenario analysis using IPCC AR6 RCP 8.5",

  // DNSH water
  site_water_stress_classification: str(flags["water-stress"], "Low"),
  wue_annualised: num(flags["wue"], 0.25),

  // DNSH circular economy
  circular_economy_compliance_items: circularItems,

  // Safeguards (only set if pillar not omitted)
  ...(humanRights ? { human_rights_compliance_items: humanRights } : {}),
  ...(bribery ? { bribery_corruption_compliance_items: bribery } : {}),
  ...(taxation ? { taxation_compliance_items: taxation } : {}),
  ...(fairCompetition ? { fair_competition_compliance_items: fairCompetition } : {}),
};

const projectInput: ProjectInput = {
  project_id: "SCENARIO",
  intake_timestamp: "2026-05-16T00:00:00Z",
  facility_type: "hyperscale",
  jurisdiction: country,
  facility_status: facilityStatus,
  build_completion_year: buildYear,
  data_points: dataPoints,
  evidence_documents: auditDocs,
};

// ---- run engine -------------------------------------------------------------

async function main() {
  const activity = JSON.parse(readFileSync(ACTIVITY_PATH, "utf8")) as Activity;

  const engine = new DeterministicEngine({
    engine_commit_sha: "scenario-cli",
    knowledge_base_hash: "sha256:scenario",
    methodology_version: METHODOLOGY_VERSION,
    now: () => "2026-05-16T00:00:00Z",
    generateId: () => "scenario-run",
  });

  const run = await engine.run(projectInput, [activity]);
  const fr = run.framework_results[0];

  if (flags["json"]) {
    console.log(JSON.stringify(run, null, 2));
    return;
  }

  const w = (s: string) => process.stdout.write(s + "\n");
  const verdictMark = (v: string) =>
    v === "pass"
      ? "PASS"
      : v === "fail"
        ? "FAIL"
        : v === "partial"
          ? "PARTIAL"
          : v === "data_missing"
            ? "MISSING"
            : v === "not_applicable"
              ? "N/A"
              : v === "banded"
                ? "BAND"
                : v.toUpperCase();

  w("");
  w(`================ Perennity Bridge engine — ${METHODOLOGY_VERSION} ================`);
  w(`Scenario inputs (selected):`);
  w(`  pue_actual = ${pueActual}, country = ${country}, build_year = ${buildYear}, status = ${facilityStatus}`);
  w(`  pue_methodology = ${dataPoints.pue_measurement_methodology_declared}, category = ${dataPoints.pue_measurement_category}, boundary = ${dataPoints.pue_measurement_boundary_documented}, reporting = ${dataPoints.pue_reporting_basis}`);
  w(`  audit = ${auditDocs.length === 0 ? "(none)" : auditDocs[0].uploaded_at}`);
  w(`  ecocc_practices = ${eccoPractices?.length ?? "(omitted)"}, circular_economy = ${circularItems.length}, water_stress = ${dataPoints.site_water_stress_classification}, WUE = ${dataPoints.wue_annualised}`);
  w(`  safeguards: HR=${humanRights?.length ?? "(omitted)"}/${EXPECTED_HUMAN_RIGHTS_ITEMS.length}, Bribery=${bribery?.length ?? "(omitted)"}/${EXPECTED_BRIBERY_CORRUPTION_ITEMS.length}, Tax=${taxation?.length ?? "(omitted)"}/${EXPECTED_TAXATION_ITEMS.length}, FairComp=${fairCompetition?.length ?? "(omitted)"}/${EXPECTED_FAIR_COMPETITION_ITEMS.length}`);
  w("");
  w(`Overall verdict: ${verdictMark(fr.overall_verdict)}`);
  w(`Indicative score: ${fr.indicative_score}`);
  w(`Safeguards rollup: ${verdictMark(fr.minimum_safeguards_verdict)}`);
  w("");
  w(`-- Substantial contribution (authority_level 1)`);
  for (const r of fr.sc_results) {
    w(`  [${verdictMark(r.verdict).padEnd(7)}] ${r.criterion_id}`);
    w(`            ${r.gap_summary}`);
  }
  w("");
  w(`-- DNSH (authority_level 1)`);
  for (const r of fr.dnsh_results) {
    w(`  [${verdictMark(r.verdict).padEnd(7)}] ${r.criterion_id}`);
    w(`            ${r.gap_summary}`);
  }
  w("");
  w(`-- Safeguards (authority_level 1)`);
  for (const r of fr.safeguards_results ?? []) {
    const detail = r.contributing_pillars
      ? `  → ${r.contributing_pillars.map((p) => `${p.criterion_id.replace(/^safeguards_/, "")}=${p.verdict}`).join(", ")}`
      : "";
    w(`  [${verdictMark(r.verdict).padEnd(7)}] ${r.criterion_id}${detail}`);
    w(`            ${r.gap_summary}`);
  }
  w("");
  w(`-- Methodology / benchmarking (authority_level 2, paid report only)`);
  for (const r of fr.methodology_results ?? []) {
    const band =
      r.verdict === "banded"
        ? ` band=${r.band_label} score=${r.band_score} K1=${r.climate_k1} (${r.climate_label})${r.new_build_read ? ` new_build=${r.new_build_read.band_label}/${r.new_build_read.band_score}` : ""}`
        : "";
    w(`  [${verdictMark(r.verdict).padEnd(7)}] ${r.criterion_id}${band}`);
    w(`            ${r.gap_summary}`);
  }
  w("");
  w(`-- Gap list (${run.gap_list.length})`);
  for (const g of run.gap_list) {
    w(`  [${g.severity.padEnd(8)}] ${g.criterion_id} — ${g.ic_voice_description}`);
  }
  w("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
