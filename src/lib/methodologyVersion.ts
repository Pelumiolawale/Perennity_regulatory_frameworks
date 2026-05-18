// Single source of truth for the Perennity Bridge methodology version stamp.
// Bump these together when methodology rules, thresholds, or regulatory
// citations change. Imported by the renderer footers, the engine provenance
// triple, the engagement-letter template generator, and the regulatory KB.

export const METHODOLOGY_VERSION = "v3.3";
export const METHODOLOGY_VINTAGE = "May 2026";
export const METHODOLOGY_VERSION_FULL = `${METHODOLOGY_VERSION} — ${METHODOLOGY_VINTAGE}`;

// v3.3 (Phase 1, commit 1.1) — SFDR Articles 8 and 9 declared.
//
// Anchored to:
//   - Regulation (EU) 2019/2088 (SFDR), consolidated 09/01/2024
//     (CELEX: 02019R2088-20240109)
//   - Commission Delegated Regulation (EU) 2022/1288, consolidated
//     20/02/2023 (CELEX: 02022R1288-20230220)
//   - EU Taxonomy Regulation (Regulation (EU) 2020/852, CELEX: 32020R0852),
//     for the Art 2a SFDR-Taxonomy disclosure interface and Article 5/6
//     alignment-disclosure requirements
//
// Framing decisions locked in v3.3:
//
//   1. PB scores SFDR for the project developer, not for the FMP.
//      Where SFDR addresses Financial Market Participants assessing
//      investees, the PB "entity" axis represents the developer's
//      corporate parent (UNGC compliance, board governance, PAI
//      disclosure practices) standing in for what an FMP would assess
//      at the investee level.
//
//   2. SFDR Article 9 sustainable investment threshold. PB requires a
//      minimum 90% sustainable investment proportion (per SFDR Art
//      2(17)) for an Article 9 alignment verdict, excluding cash held
//      for liquidity and instruments held purely for hedging. This
//      threshold sits above the converged market median (~80%) and
//      below the literal reading of the European Commission's June
//      2022 Q&A (effectively 100%). The 90% position is selected to
//      (i) preserve a meaningful qualitative gap between Article 8
//      and Article 9 verdicts, (ii) front-run potential regulatory
//      tightening, and (iii) reflect the investor-grade conservatism
//      appropriate to PB's review function. The threshold is necessary
//      but not sufficient — DNSH, good-governance, and pre-contractual
//      objective tests must independently pass.
//
//   3. SFDR 2.0 caveat. Commission proposal COM(2025) 841 (tabled
//      2025) would repeal Delegated Regulation 2022/1288 and
//      restructure Art 8/9 into a new category regime. Adoption is
//      18-30 months out at the time of v3.3 release. All v3.3 SFDR
//      verdicts are stamped against SFDR v1 (Reg 2019/2088 consolidated
//      09/01/2024) and remain valid as of date of issue.
//
//   4. Shared criterion library architecture. Each SFDR criterion is
//      a standalone JSON file under regulatory-knowledge/criteria/sfdr-v1/.
//      Framework JSONs are lightweight ref-lists. This pattern will
//      be reused in Phase 2 (UK SDR) and Phase 3 (ICMA GBP).
//
//   5. Forward-compat versioning. criterion_id and framework_id are
//      version-stamped (sfdr_v1_*). When SFDR 2.0 lands, new criteria
//      and frameworks ship under v2 suffixes alongside the existing
//      v1 ones; existing v1 verdicts remain valid without retroactive
//      relabelling.
//
// Scoring status as of v0.5.0-alpha.1: declared only. Full Article 8
// scoring lands in commit 1.2; Article 9 in commit 1.3.
