import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { loadKnowledgeBase } from "../index";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const REAL_KB = path.join(REPO_ROOT, "regulatory-knowledge");

// As of v0.2.0 / methodology v3.2 (P0 #5 close-out), no criterion ships a
// placeholder source_text. The PUE 1.5 threshold was re-anchored to
// measurement compliance citing Reg 2021/2139 §8.1 ¶1 + ECoCC §9.3.5 (the
// last placeholder in the KB). The allowlist is now structurally empty and
// the test asserts both emptiness AND placeholder absence so any regression
// re-introducing a placeholder must also re-introduce an explicit allowlist
// entry — making the gap visible in code review.
const PLACEHOLDER_ALLOWLIST = new Set<string>([]);

const PLACEHOLDER_MARKERS = ["VERBATIM TEXT TO BE INSERTED", "[VERBATIM"];

describe("regulatory text guard — no placeholders in shipped source_text", () => {
  test("allowlist is empty (structural close-out of P0 #5)", () => {
    assert.equal(
      PLACEHOLDER_ALLOWLIST.size,
      0,
      "PLACEHOLDER_ALLOWLIST should be empty as of v3.2 — re-anchor any new placeholders to verbatim regulatory text instead of allowlisting them.",
    );
  });

  test("every criterion's source_text is verbatim regulatory text (allowlist applied)", async () => {
    const kb = await loadKnowledgeBase({ rootDir: REAL_KB });

    const offenders: { activity: string; criterion: string; snippet: string }[] = [];

    for (const activity of kb.activities) {
      const all = [
        ...(activity.substantial_contribution_criteria ?? []),
        ...(activity.dnsh_criteria ?? []),
        ...(activity.safeguards_criteria ?? []),
        ...(activity.methodology_criteria ?? []),
      ];
      for (const c of all) {
        if (PLACEHOLDER_ALLOWLIST.has(c.id)) continue;
        if (typeof c.source_text !== "string") continue;
        for (const marker of PLACEHOLDER_MARKERS) {
          if (c.source_text.includes(marker)) {
            offenders.push({
              activity: activity.id,
              criterion: c.id,
              snippet: c.source_text.slice(0, 120),
            });
            break;
          }
        }
      }
    }

    assert.deepEqual(
      offenders,
      [],
      `Found ${offenders.length} criterion(s) shipping a placeholder source_text:\n` +
        offenders.map((o) => `  - ${o.activity} / ${o.criterion}: "${o.snippet}…"`).join("\n"),
    );
  });
});
