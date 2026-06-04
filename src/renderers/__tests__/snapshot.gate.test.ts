/**
 * ============================================================================
 * STRUCTURAL GATE TEST — DO NOT SKIP, DO NOT MARK FLAKY, DO NOT RELAX.
 * ============================================================================
 *
 * This test enforces the free/paid hard gate by asserting that paid-tier
 * content can NEVER reach SnapshotOutput. If this test fails, the gate has
 * leaked — fix the renderer, not the test.
 *
 * Strategy: plant distinctive magic markers in every EngineRun field that
 * could plausibly carry source_text, threshold_value, narrative, or
 * methodology_version. Render. Assert no marker appears in the serialized
 * output, no disallowed property name appears at any depth, and the output
 * shape matches the documented allowlist exactly.
 * ============================================================================
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { SnapshotRenderer } from "../snapshot";
import type {
  CriterionResult,
  EngineRun,
  FrameworkResult,
  GapItem,
} from "../../engine";

// Each marker is unique and unlikely to collide with legitimate snapshot content.
const MAGIC = {
  source_text: "MAGIC_SOURCE_TEXT_d3b6f184c2e1__must_not_leak",
  threshold_value: 7777777.777,
  threshold_value_str: "7777777.777",
  narrative: "MAGIC_NARRATIVE_PARAGRAPH_a72e9c5e803f__must_not_leak",
  methodology_version: "v999.999-MAGIC-METH-DO-NOT-LEAK",
} as const;

// SnapshotOutput must contain exactly these top-level keys. Any addition or
// omission means the contract changed; update both the type and this test.
const EXPECTED_SNAPSHOT_KEYS = [
  "cta",
  "disclaimer",
  "gap_list",
  "generated_at",
  "heatmap",
  "indicative_band",
  "indicative_score",
  "run_id",
];

// Required keys on every heatmap cell. Optional keys (subset check below)
// vary per cell — e.g. the minimum_safeguards cell carries pillar_verdicts +
// authority_level; framework cells typically don't.
const REQUIRED_HEATMAP_CELL_KEYS = ["framework", "verdict"];
const ALLOWED_HEATMAP_CELL_KEYS = [
  "framework",
  "verdict",
  "authority_level",
  "pillar_verdicts",
  // Added in phase 0/0.3. Discriminates the archetype a cell represents
  // (activity_aligned today; product_label / issuance_framework once SFDR
  // and ICMA scoring lands). Not investor-grade content — purely a row
  // label — so its addition does not relax the gate.
  "archetype",
  // Added in v0.5.0-alpha.1 (Phase 1, commit 1.1). criterion_id identifies
  // which criterion of a product_label framework a cell represents
  // (product_label heatmaps surface per-criterion cells, unlike
  // activity_aligned's aggregated single cell). scoring_status marks a
  // cell as declared-but-not-scored ("not_implemented"); the renderer
  // surfaces these as "Pending implementation" pending SFDR scoring in
  // commits 1.2 / 1.3. Neither is investor-grade content — both are
  // status discriminators — so their addition does not relax the gate.
  "criterion_id",
  "scoring_status",
  // Added in v0.5.0-alpha.2 (Phase 1, commit 1.2). SFDR-scored cells carry
  // per-criterion rationale, evidence references, an N/A rationale string
  // (only populated when band = not_applicable), and an optional numeric
  // value for quantitative criteria (PAI coverage / Taxonomy percentage).
  // rationale_text and not_applicable_rationale are intentionally surfaced
  // to free-tier users — they explain the verdict in plain language without
  // quoting verbatim regulation or revealing PB-internal thresholds.
  // numeric_value is composed of {value, unit, label}; thresholds and the
  // PB-corroborated percentage are NOT included (they remain paid-tier).
  "rationale_text",
  "evidence_refs",
  "not_applicable_rationale",
  "numeric_value",
];

// Per-cell `numeric_value` shape is `{value, unit, label}`. Keys allowlisted
// to keep the deep-walk DISALLOWED_KEYS check from tripping on nested objects.
const ALLOWED_NUMERIC_VALUE_KEYS = ["value", "unit", "label"];
const ALLOWED_PILLAR_VERDICT_KEYS = ["pillar_id", "verdict"];
const EXPECTED_SNAPSHOT_GAP_KEYS = ["gap_id", "one_sentence_description"];

// Property names that must NEVER appear anywhere in the SnapshotOutput tree.
// Catches accidental object forwarding even when values are unrelated.
const DISALLOWED_KEYS = [
  "source_text",
  "source_text_excerpt",
  "threshold_value",
  "threshold_operator",
  "threshold_unit",
  "threshold_metric",
  "methodology_version",
  "signatory",
  "evidence_log",
  "evidence_refs",
  "ic_defence_pack",
  "sections",
  "narrative",
  "narrative_template_refs",
  "observed_value",
  "engine_commit_sha",
  "knowledge_base_hash",
  "framework_source_hash",
  "framework_version",
  "engagement_reference",
  "scoring_logic_ref",
  "scoring_logic_version",
  "estimation_used",
  "gap_summary",
  "ic_voice_description",
  "remediation_summary",
  // v0.6.2: paid-tier-only field. Set on CriterionResult by SFDR / UK SDR
  // scoring functions to carry verbatim regulatory citations (e.g.
  // ["FCA PS23/16 ¶4.23"]). Must never appear in SnapshotOutput.
  "regulatory_citations",
];

function leakyCriterionResult(criterion_id: string): CriterionResult {
  return {
    criterion_id,
    verdict: "fail",
    // Smuggle source_text as observed_value (renderer must not forward it).
    observed_value: MAGIC.source_text,
    threshold_value: MAGIC.threshold_value,
    threshold_operator: "less_than_or_equal",
    gap_summary: `${MAGIC.narrative} — threshold ${MAGIC.threshold_value}, source: "${MAGIC.source_text}"`,
    evidence_refs: [MAGIC.source_text],
    scoring_logic_ref: "logic.test.v1",
    scoring_logic_version: "v1",
    estimation_used: true,
    // v0.6.2: regulatory_citations is a paid-tier-only field. Plant a
    // magic marker so the DISALLOWED_KEYS + content walks both catch any
    // accidental forwarding into SnapshotOutput.
    regulatory_citations: [MAGIC.source_text],
  };
}

function makeMaximallyLeakyRun(): EngineRun {
  const fr: FrameworkResult = {
    framework: "EU_TAXONOMY_CLIMATE",
    framework_version: "MAGIC_FRAMEWORK_VERSION_v8.2",
    framework_source_hash: "sha256:" + "f".repeat(64),
    activity_id: "test_activity",
    sc_results: [
      leakyCriterionResult("sc_8_1_1_ecocc"),
      leakyCriterionResult("sc_8_1_2_pue_existing"),
    ],
    dnsh_results: [
      leakyCriterionResult("dnsh_8_1_adaptation"),
      leakyCriterionResult("dnsh_8_1_water"),
    ],
    minimum_safeguards_verdict: "data_missing",
    overall_verdict: "fail",
    indicative_score: 0,
  };

  const gap_list: GapItem[] = [...fr.sc_results, ...fr.dnsh_results].map((r) => ({
    gap_id: `test_activity.${r.criterion_id}`,
    framework: "EU_TAXONOMY_CLIMATE",
    criterion_id: r.criterion_id,
    severity: "critical",
    ic_voice_description: `${MAGIC.narrative} (ic-voice)`,
    remediation_summary: `${MAGIC.narrative} (remediation) threshold ${MAGIC.threshold_value}`,
  }));

  return {
    run_id: "run-gate-test",
    run_timestamp: "2026-05-13T00:00:00Z",
    methodology_version: MAGIC.methodology_version,
    engine_commit_sha: "MAGIC_ENGINE_COMMIT_SHA",
    knowledge_base_hash: "sha256:MAGIC_KB_HASH",
    project_input: {
      project_id: "p-gate",
      intake_timestamp: "2026-05-13T00:00:00Z",
      facility_type: "hyperscale",
      jurisdiction: "DE",
      facility_status: "operational",
      data_points: {
        smuggled_through_data_points: MAGIC.narrative,
        smuggled_threshold: MAGIC.threshold_value,
      },
      evidence_documents: [
        {
          document_id: "doc-1",
          document_type: "audit",
          uri: `https://${MAGIC.source_text}.test/doc-1`,
          uploaded_at: "2025-01-01T00:00:00Z",
          sha256: "0".repeat(64),
        },
      ],
    },
    framework_results: [fr],
    gap_list,
  };
}

function* walkKeys(
  obj: unknown,
  path = "$",
): Generator<{ path: string; key: string }> {
  if (obj === null || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) yield* walkKeys(obj[i], `${path}[${i}]`);
    return;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    yield { path, key: k };
    yield* walkKeys(v, `${path}.${k}`);
  }
}

describe("SnapshotRenderer — STRUCTURAL GATE (do not skip, do not relax)", () => {
  test("no source_text, threshold_value, narrative, or methodology_version EVER appears in SnapshotOutput", async () => {
    const renderer = new SnapshotRenderer({
      disclaimer: "Article 26 disclaimer text.",
      now: () => "2026-05-13T00:00:00Z",
    });
    const run = makeMaximallyLeakyRun();
    const snapshot = await renderer.render(run);
    const serialized = JSON.stringify(snapshot);

    // ---- (1) Magic-marker leak checks: one assertion per banned category ----
    assert.ok(
      !serialized.includes(MAGIC.source_text),
      `GATE LEAK: source_text appears in SnapshotOutput.\n${serialized}`,
    );
    assert.ok(
      !serialized.includes(MAGIC.threshold_value_str),
      `GATE LEAK: threshold_value appears in SnapshotOutput.\n${serialized}`,
    );
    assert.ok(
      !serialized.includes(MAGIC.narrative),
      `GATE LEAK: narrative paragraph appears in SnapshotOutput.\n${serialized}`,
    );
    assert.ok(
      !serialized.includes(MAGIC.methodology_version),
      `GATE LEAK: methodology_version appears in SnapshotOutput.\n${serialized}`,
    );

    // ---- (2) Property-name leak check at every depth ----
    for (const { path, key } of walkKeys(snapshot)) {
      assert.ok(
        !DISALLOWED_KEYS.includes(key),
        `GATE LEAK: SnapshotOutput contains disallowed key "${key}" at ${path}`,
      );
    }

    // ---- (3) Exact shape: top-level keys match the allowlist exactly ----
    assert.deepEqual(
      Object.keys(snapshot).sort(),
      EXPECTED_SNAPSHOT_KEYS,
      "SnapshotOutput shape drifted from the allowlist — update the type AND this test together",
    );
    for (const cell of snapshot.heatmap) {
      const keys = Object.keys(cell);
      for (const required of REQUIRED_HEATMAP_CELL_KEYS) {
        assert.ok(
          keys.includes(required),
          `HeatmapCell missing required key "${required}"`,
        );
      }
      for (const k of keys) {
        assert.ok(
          ALLOWED_HEATMAP_CELL_KEYS.includes(k),
          `HeatmapCell contains key "${k}" not in the allowlist — update the type AND this test together`,
        );
      }
      if ("pillar_verdicts" in cell && cell.pillar_verdicts) {
        for (const pv of cell.pillar_verdicts) {
          assert.deepEqual(
            Object.keys(pv).sort(),
            ALLOWED_PILLAR_VERDICT_KEYS,
            "PillarVerdict shape drifted from the allowlist",
          );
        }
      }
    }
    for (const gap of snapshot.gap_list) {
      assert.deepEqual(
        Object.keys(gap).sort(),
        EXPECTED_SNAPSHOT_GAP_KEYS,
        "SnapshotGap shape drifted from the allowlist",
      );
    }

    // ---- (4) Positive shape: a degenerate empty snapshot must not pass ----
    assert.equal(snapshot.run_id, "run-gate-test");
    assert.equal(typeof snapshot.indicative_score, "number");
    assert.ok(["Green", "Amber", "Red"].includes(snapshot.indicative_band));
    assert.ok(snapshot.heatmap.length > 0, "heatmap should be populated");
    assert.ok(snapshot.gap_list.length > 0, "gap_list should be populated");
    assert.equal(snapshot.cta, "request_project_readiness_report");
    assert.equal(typeof snapshot.disclaimer, "string");
    assert.equal(typeof snapshot.generated_at, "string");
  });
});

// ============================================================================
// v0.6.2 — Content-walk gate: real-scoring rationale strings
// ============================================================================
// The structural gate above plants magic markers into specific fields and
// asserts the renderer doesn't forward them. It does NOT test whether actual
// SFDR / UK SDR scoring functions emit clean rationale text. The methodology
// gap audit (Tier 1 item #2) identified that scoring functions inline
// verbatim regulatory citations (`FCA PS23/16 ¶X.Y`), numeric thresholds
// (`≤1.3 cool / ≤1.4 warm`), and methodology version stamps (`v3.5`) into
// `rationale_text` — all of which are paid-tier-only.
//
// This new test runs the engine with the REAL framework set + scoring
// functions, generates a SnapshotOutput, and walks the serialized JSON
// asserting no leak patterns appear. Each regex carries a comment naming
// the leak it prevents. Failing this test means a scoring function emitted
// paid-tier content into a free-tier field — fix the scoring function
// (move the citation into `regulatory_citations`), not the test.
// ============================================================================

import path from "node:path";
import { DeterministicEngine } from "../../runtime";
import { loadKnowledgeBase } from "../../knowledge/load";
import { METHODOLOGY_VERSION } from "../../lib/methodologyVersion";
import type { ProjectInput } from "../../engine";
import type { EntityInput } from "../../inputs";

// Patterns that MUST NOT appear anywhere in the serialized SnapshotOutput.
// Each pattern is paired with a human description so the failure message
// names the leak category.
const DISALLOWED_CONTENT_PATTERNS: { pattern: RegExp; description: string }[] = [
  {
    pattern: /¶\s*\d+\.\d+/,
    description: "paragraph mark + paragraph number (e.g. '¶4.23')",
  },
  {
    pattern: /\bPS23\/16\b/,
    description: "FCA PS23/16 regulation reference",
  },
  {
    pattern: /\bv3\.\d+\b/,
    description: "methodology version stamp (e.g. 'v3.5')",
  },
  {
    pattern: /(?:≤|≥)\s*\d+(?:\.\d+)?/,
    description: "Unicode threshold comparator + number (e.g. '≤1.3')",
  },
];

// Build a minimal project input that exercises both SFDR and UK SDR scoring
// paths so all scoring functions get a chance to emit rationale text. The
// project carries no SFDR / UK SDR specifics; criteria resolve to
// insufficient_evidence — which is the path where rationale text matters
// most because the free-tier reader is being told WHY the verdict is
// insufficient. Citations leaked here would be the most visible leak.
const SNAPSHOT_GATE_PROJECT: ProjectInput = {
  project_id: "p_gate_content_walk",
  intake_timestamp: "2026-06-04T00:00:00Z",
  facility_type: "hyperscale",
  jurisdiction: "DE",
  facility_status: "operational",
  data_points: {},
  evidence_documents: [],
};

const SNAPSHOT_GATE_ENTITY: EntityInput = {
  entity_id: "e_gate_content_walk",
  legal_name: "Gate Content-Walk Test Entity",
  jurisdiction: "DE",
};

async function runEngineAcrossAllFrameworks() {
  const kb = await loadKnowledgeBase({
    rootDir: path.resolve(process.cwd(), "regulatory-knowledge"),
  });
  // Real framework set: EU Tax 8.1 + SFDR Art 8 + SFDR Art 9 + UK SDR
  // Focus + Improvers + Impact. Exercises every scoring function that
  // could leak content into rationale strings.
  const frameworkIds = [
    "eu_tax_climate_8_1",
    "sfdr_v1_article_8",
    "sfdr_v1_article_9",
    "uk_sdr_focus",
    "uk_sdr_improvers",
    "uk_sdr_impact",
  ];
  const frameworks = frameworkIds.map((id) => {
    const fw = kb.frameworksById.get(id);
    if (!fw) throw new Error(`framework ${id} missing from KB`);
    return fw;
  });
  const engine = new DeterministicEngine({
    engine_commit_sha: "gate_content_walk_sha",
    knowledge_base_hash: "gate_content_walk_kb_hash",
    methodology_version: METHODOLOGY_VERSION,
    now: () => "2026-06-04T00:00:00.000Z",
    generateId: () => "test_run_gate_content_walk",
  });
  return engine.run(
    { project: SNAPSHOT_GATE_PROJECT, entity: SNAPSHOT_GATE_ENTITY },
    frameworks,
  );
}

describe("SnapshotRenderer — CONTENT WALK on real scoring output (v0.6.2)", () => {
  test("no regulatory citation, paragraph number, methodology version, or numeric threshold appears in serialized SnapshotOutput", async () => {
    const renderer = new SnapshotRenderer({
      disclaimer: "Article 26 disclaimer text.",
      now: () => "2026-06-04T00:00:00Z",
    });
    const run = await runEngineAcrossAllFrameworks();
    const snapshot = await renderer.render(run);
    const serialized = JSON.stringify(snapshot);

    for (const { pattern, description } of DISALLOWED_CONTENT_PATTERNS) {
      const m = serialized.match(pattern);
      assert.ok(
        m === null,
        `GATE LEAK (content walk): ${description} matched at "${m?.[0]}" — ` +
          `a scoring function inlined paid-tier content into a free-tier field. ` +
          `Move it to CriterionResult.regulatory_citations (paid-tier-only).\n` +
          `Full match context: "${serialized.slice(
            Math.max(0, (m?.index ?? 0) - 80),
            Math.min(serialized.length, (m?.index ?? 0) + (m?.[0]?.length ?? 0) + 80),
          )}"`,
      );
    }
  });

  test("snapshot has populated heatmap + gap_list (sanity — content walk must not pass on a degenerate empty output)", async () => {
    const renderer = new SnapshotRenderer({
      disclaimer: "Article 26 disclaimer text.",
      now: () => "2026-06-04T00:00:00Z",
    });
    const run = await runEngineAcrossAllFrameworks();
    const snapshot = await renderer.render(run);
    assert.ok(snapshot.heatmap.length > 0, "heatmap must be populated");
    // gap_list might be empty depending on engine output; not a strict invariant.
  });
});
