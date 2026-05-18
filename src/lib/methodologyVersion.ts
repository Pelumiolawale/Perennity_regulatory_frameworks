// Single source of truth for the Perennity Bridge methodology version stamp.
// Bump these together when methodology rules, thresholds, or regulatory
// citations change. Imported by the renderer footers, the engine provenance
// triple, the engagement-letter template generator, and the regulatory KB.
//
// Methodology documentation — the locked band definitions, framing decisions,
// per-criterion thresholds, cascade rules, and version history — lives in
// /methodology.md at the repo root. When bumping the constants below,
// append a new section to methodology.md in lockstep. The file is the
// canonical record of what each version means; historical sections are
// preserved so audit replay (run.replay(manifest)) can reproduce the
// methodology in force at any past engagement.

export const METHODOLOGY_VERSION = "v3.4";
export const METHODOLOGY_VINTAGE = "May 2026";
export const METHODOLOGY_VERSION_FULL = `${METHODOLOGY_VERSION} — ${METHODOLOGY_VINTAGE}`;
