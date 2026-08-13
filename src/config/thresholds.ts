// ============================================================================
// Config layer — trilogue-volatility thresholds (Engine v4.0 — Module 6)
// ============================================================================
//
// SINGLE versioned config module. Every SFDR 2.0 threshold, exclusion list,
// PAI mandatory set, and safe-harbour percentage lives in
// config/regulatory-thresholds.v1.json — NEVER hardcoded in lens logic.
//
// Each threshold entry carries {value, source, status, lastReviewed, notes}.
// `status: "contested"` marks a Q4-2026 trilogue battleground; any lens verdict
// that depends on a contested entry MUST carry confidence "provisional" and a
// citation noting trilogue status (this is the product surface of
// "trilogue-tracking").
//
// Bumping config = new file version + `loadConfig(newRaw)` — lens logic is
// untouched. The loader validates on load and FAILS FAST on malformed config.
// ============================================================================

import rawV1 from "../../config/regulatory-thresholds.v1.json";

export type ThresholdStatus = "settled" | "contested";

export interface ThresholdEntry {
  value: number;
  source: string;
  status: ThresholdStatus;
  lastReviewed: string;
  notes: string;
}

export interface PaiIndicatorConfig {
  id: string;
  name: string;
  mandatory: boolean;
  canonicalSignals: string[];
}

export interface CategoryExclusionScope {
  status: ThresholdStatus;
  source: string;
  lastReviewed: string;
  notes: string;
  lists: {
    sustainable: string[];
    transition: string[];
    esg_basics: string[];
  };
}

export interface SustainableCategoryConfig {
  label: string;
  description: string;
  requiresAlignmentScoreAtOrAbovePercent: number;
  requiresAlignmentScoreThresholdRef: string;
  requiresNoHarm: boolean;
  requiresVerification: boolean;
}

export interface TransitionCategoryConfig {
  label: string;
  description: string;
  requiresCredibleRoadmap: boolean;
  roadmapCredibilityInputs: string[];
  roadmapMinCredibilitySignals: number;
}

export interface EsgBasicsCategoryConfig {
  label: string;
  description: string;
  requiresBottomScreen: boolean;
  bottomScreenThresholdRef: string;
  minDisclosureCompleteness: number;
}

export interface RegulatoryConfig {
  configVersion: string;
  methodologyStatus: string;
  lastReviewed: string;
  source: string;
  thresholds: Record<string, ThresholdEntry>;
  categoryExclusionScope: CategoryExclusionScope;
  paiIndicators: {
    source: string;
    status: ThresholdStatus;
    set: PaiIndicatorConfig[];
  };
  categories: {
    sustainable: SustainableCategoryConfig;
    transition: TransitionCategoryConfig;
    esg_basics: EsgBasicsCategoryConfig;
  };
}

export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigValidationError";
  }
}

// -- Validation (fail-fast) --------------------------------------------------

function fail(msg: string): never {
  throw new ConfigValidationError(`Malformed regulatory config: ${msg}`);
}

function assertString(v: unknown, path: string): string {
  if (typeof v !== "string" || v.length === 0) fail(`${path} must be a non-empty string`);
  return v as string;
}

function assertNumber(v: unknown, path: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) fail(`${path} must be a finite number`);
  return v as number;
}

function assertBool(v: unknown, path: string): boolean {
  if (typeof v !== "boolean") fail(`${path} must be a boolean`);
  return v as boolean;
}

function assertStatus(v: unknown, path: string): ThresholdStatus {
  if (v !== "settled" && v !== "contested") {
    fail(`${path} must be "settled" or "contested" (got ${JSON.stringify(v)})`);
  }
  return v as ThresholdStatus;
}

function assertArray(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(`${path} must be an array`);
  return v as unknown[];
}

function assertObject(v: unknown, path: string): Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) fail(`${path} must be an object`);
  return v as Record<string, unknown>;
}

function validateThresholdEntry(v: unknown, path: string): ThresholdEntry {
  const o = assertObject(v, path);
  return {
    value: assertNumber(o.value, `${path}.value`),
    source: assertString(o.source, `${path}.source`),
    status: assertStatus(o.status, `${path}.status`),
    lastReviewed: assertString(o.lastReviewed, `${path}.lastReviewed`),
    notes: assertString(o.notes, `${path}.notes`),
  };
}

/**
 * Validate + type an arbitrary raw config object. Throws ConfigValidationError
 * on any structural problem. This is the entry point for BOTH the bundled v1
 * config and any swapped-in config version (Module 6 acceptance: swapping
 * config versions changes verdicts with zero lens-code changes).
 */
export function loadConfig(raw: unknown): RegulatoryConfig {
  const o = assertObject(raw, "config");
  const configVersion = assertString(o.configVersion, "config.configVersion");
  const methodologyStatus = assertString(o.methodologyStatus, "config.methodologyStatus");
  const lastReviewed = assertString(o.lastReviewed, "config.lastReviewed");
  const source = assertString(o.source, "config.source");

  const thresholdsRaw = assertObject(o.thresholds, "config.thresholds");
  const thresholds: Record<string, ThresholdEntry> = {};
  for (const key of Object.keys(thresholdsRaw)) {
    thresholds[key] = validateThresholdEntry(thresholdsRaw[key], `config.thresholds.${key}`);
  }
  // The three named contested items must be present as thresholds/scope.
  for (const required of ["taxonomySafeHarbourPercent", "mandatoryPaiCount", "portfolioPositiveContributionPercent"]) {
    if (!(required in thresholds)) fail(`config.thresholds.${required} is required`);
  }

  const cesRaw = assertObject(o.categoryExclusionScope, "config.categoryExclusionScope");
  const listsRaw = assertObject(cesRaw.lists, "config.categoryExclusionScope.lists");
  const categoryExclusionScope: CategoryExclusionScope = {
    status: assertStatus(cesRaw.status, "config.categoryExclusionScope.status"),
    source: assertString(cesRaw.source, "config.categoryExclusionScope.source"),
    lastReviewed: assertString(cesRaw.lastReviewed, "config.categoryExclusionScope.lastReviewed"),
    notes: assertString(cesRaw.notes, "config.categoryExclusionScope.notes"),
    lists: {
      sustainable: assertArray(listsRaw.sustainable, "…lists.sustainable").map((x, i) =>
        assertString(x, `…lists.sustainable[${i}]`),
      ),
      transition: assertArray(listsRaw.transition, "…lists.transition").map((x, i) =>
        assertString(x, `…lists.transition[${i}]`),
      ),
      esg_basics: assertArray(listsRaw.esg_basics, "…lists.esg_basics").map((x, i) =>
        assertString(x, `…lists.esg_basics[${i}]`),
      ),
    },
  };

  const paiRaw = assertObject(o.paiIndicators, "config.paiIndicators");
  const paiSet = assertArray(paiRaw.set, "config.paiIndicators.set").map((x, i) => {
    const e = assertObject(x, `config.paiIndicators.set[${i}]`);
    return {
      id: assertString(e.id, `config.paiIndicators.set[${i}].id`),
      name: assertString(e.name, `config.paiIndicators.set[${i}].name`),
      mandatory: assertBool(e.mandatory, `config.paiIndicators.set[${i}].mandatory`),
      canonicalSignals: assertArray(
        e.canonicalSignals ?? [],
        `config.paiIndicators.set[${i}].canonicalSignals`,
      ).map((s, j) => assertString(s, `config.paiIndicators.set[${i}].canonicalSignals[${j}]`)),
    };
  });

  const catsRaw = assertObject(o.categories, "config.categories");
  const susRaw = assertObject(catsRaw.sustainable, "config.categories.sustainable");
  const traRaw = assertObject(catsRaw.transition, "config.categories.transition");
  const esgRaw = assertObject(catsRaw.esg_basics, "config.categories.esg_basics");

  const categories: RegulatoryConfig["categories"] = {
    sustainable: {
      label: assertString(susRaw.label, "…sustainable.label"),
      description: assertString(susRaw.description, "…sustainable.description"),
      requiresAlignmentScoreAtOrAbovePercent: assertNumber(
        susRaw.requiresAlignmentScoreAtOrAbovePercent,
        "…sustainable.requiresAlignmentScoreAtOrAbovePercent",
      ),
      requiresAlignmentScoreThresholdRef: assertString(
        susRaw.requiresAlignmentScoreThresholdRef,
        "…sustainable.requiresAlignmentScoreThresholdRef",
      ),
      requiresNoHarm: assertBool(susRaw.requiresNoHarm, "…sustainable.requiresNoHarm"),
      requiresVerification: assertBool(
        susRaw.requiresVerification,
        "…sustainable.requiresVerification",
      ),
    },
    transition: {
      label: assertString(traRaw.label, "…transition.label"),
      description: assertString(traRaw.description, "…transition.description"),
      requiresCredibleRoadmap: assertBool(
        traRaw.requiresCredibleRoadmap,
        "…transition.requiresCredibleRoadmap",
      ),
      roadmapCredibilityInputs: assertArray(
        traRaw.roadmapCredibilityInputs,
        "…transition.roadmapCredibilityInputs",
      ).map((x, i) => assertString(x, `…transition.roadmapCredibilityInputs[${i}]`)),
      roadmapMinCredibilitySignals: assertNumber(
        traRaw.roadmapMinCredibilitySignals,
        "…transition.roadmapMinCredibilitySignals",
      ),
    },
    esg_basics: {
      label: assertString(esgRaw.label, "…esg_basics.label"),
      description: assertString(esgRaw.description, "…esg_basics.description"),
      requiresBottomScreen: assertBool(
        esgRaw.requiresBottomScreen,
        "…esg_basics.requiresBottomScreen",
      ),
      bottomScreenThresholdRef: assertString(
        esgRaw.bottomScreenThresholdRef,
        "…esg_basics.bottomScreenThresholdRef",
      ),
      minDisclosureCompleteness: assertNumber(
        esgRaw.minDisclosureCompleteness,
        "…esg_basics.minDisclosureCompleteness",
      ),
    },
  };

  // -- Mirrored-threshold guard (Task 5 / review-pack Finding 1) -------------
  //
  // Some category settings carry BOTH a literal value and a `*ThresholdRef`
  // pointing at the canonical entry in `thresholds`. Only the ref is
  // load-bearing — the lens resolves thresholds by reference. The literal is a
  // readability convenience, which makes it a silent-divergence hazard: edit
  // `taxonomySafeHarbourPercent` 15 -> 20 for the Parliament position, forget
  // the mirror, and the settings file now shows a stale number that reads like
  // a live threshold to the next person (or acquirer) who opens it.
  //
  // So we fail fast instead of documenting the hazard and hoping. A threshold
  // edit that misses its mirror breaks the build, not a customer report.
  // See RUNBOOK-threshold-updates.md.
  assertMirroredThresholds(
    [
      {
        literal: categories.sustainable.requiresAlignmentScoreAtOrAbovePercent,
        literalPath: "config.categories.sustainable.requiresAlignmentScoreAtOrAbovePercent",
        ref: categories.sustainable.requiresAlignmentScoreThresholdRef,
      },
    ],
    thresholds,
  );

  return {
    configVersion,
    methodologyStatus,
    lastReviewed,
    source,
    thresholds,
    categoryExclusionScope,
    paiIndicators: {
      source: assertString(paiRaw.source, "config.paiIndicators.source"),
      status: assertStatus(paiRaw.status, "config.paiIndicators.status"),
      set: paiSet,
    },
    categories,
  };
}

interface MirroredThreshold {
  /** The duplicated literal value carried on the category setting. */
  literal: number;
  /** Dotted path to the literal, for the error message. */
  literalPath: string;
  /** Key into `thresholds` that holds the canonical, load-bearing value. */
  ref: string;
}

/**
 * Fail fast when a category's mirrored literal has drifted from the canonical
 * threshold it points at. Also fails when the ref itself does not resolve — a
 * dangling ref means the lens would read `undefined` at evaluation time, which
 * is worse than a loud failure at load time.
 */
function assertMirroredThresholds(
  mirrors: MirroredThreshold[],
  thresholds: Record<string, ThresholdEntry>,
): void {
  for (const m of mirrors) {
    const canonical = thresholds[m.ref];
    if (canonical === undefined) {
      fail(
        `${m.literalPath} references threshold "${m.ref}", which does not exist in config.thresholds`,
      );
      continue;
    }
    if (canonical.value !== m.literal) {
      fail(
        `${m.literalPath} is ${m.literal} but config.thresholds.${m.ref}.value is ` +
          `${canonical.value}. These must agree — the ref is the load-bearing one. ` +
          `Update both, then re-run the tests. See RUNBOOK-threshold-updates.md.`,
      );
    }
  }
}

/** Load + validate the bundled v1 config. Cached (immutable). */
let _v1: RegulatoryConfig | null = null;
export function loadConfigV1(): RegulatoryConfig {
  if (_v1 === null) _v1 = loadConfig(rawV1 as unknown);
  return _v1;
}

/** Default config used by lenses when none is injected. */
export function defaultConfig(): RegulatoryConfig {
  return loadConfigV1();
}

// -- Contested-item introspection (drives TRILOGUE_TRACKING) -----------------

export interface ContestedItem {
  key: string;
  kind: "threshold" | "exclusion_scope" | "pai_regime";
  notes: string;
  source: string;
}

/** Every contested config item, derived from live config (not hardcoded). */
export function contestedItems(config: RegulatoryConfig): ContestedItem[] {
  const items: ContestedItem[] = [];
  for (const [key, t] of Object.entries(config.thresholds)) {
    if (t.status === "contested") {
      items.push({ key, kind: "threshold", notes: t.notes, source: t.source });
    }
  }
  if (config.categoryExclusionScope.status === "contested") {
    items.push({
      key: "categoryExclusionScope",
      kind: "exclusion_scope",
      notes: config.categoryExclusionScope.notes,
      source: config.categoryExclusionScope.source,
    });
  }
  if (config.paiIndicators.status === "contested") {
    items.push({
      key: "paiIndicators",
      kind: "pai_regime",
      notes: "PAI mandatory regime (voluntary vs min-3 vs fully-mandatory) unsettled.",
      source: config.paiIndicators.source,
    });
  }
  return items;
}

/** Resolve a threshold entry by ref key. Throws if absent (fail fast). */
export function resolveThreshold(config: RegulatoryConfig, ref: string): ThresholdEntry {
  const t = config.thresholds[ref];
  if (!t) fail(`no threshold "${ref}" in config ${config.configVersion}`);
  return t;
}
