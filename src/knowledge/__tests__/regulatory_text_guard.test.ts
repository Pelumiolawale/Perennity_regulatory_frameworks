import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { loadKnowledgeBase } from "../index";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const REAL_KB = path.join(REPO_ROOT, "regulatory-knowledge");

// Criterion ids whose source_text is allowed to still carry the placeholder
// because the criterion is intentionally deferred to a follow-up commit (the
// PUE 1.5 threshold in sc_8_1_2_pue_existing is not in Regulation (EU)
// 2021/2139 Annex I Section 8.1 — it requires a substantive re-anchoring
// decision, not a verbatim text fill).
const PLACEHOLDER_ALLOWLIST = new Set<string>(["sc_8_1_2_pue_existing"]);

const PLACEHOLDER_MARKERS = ["VERBATIM TEXT TO BE INSERTED", "[VERBATIM"];

describe("regulatory text guard — no placeholders in shipped source_text", () => {
  test("every criterion's source_text is verbatim regulatory text (allowlist applied)", async () => {
    const kb = await loadKnowledgeBase({ rootDir: REAL_KB });

    const offenders: { activity: string; criterion: string; snippet: string }[] = [];

    for (const activity of kb.activities) {
      const all = [
        ...(activity.substantial_contribution_criteria ?? []),
        ...(activity.dnsh_criteria ?? []),
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
