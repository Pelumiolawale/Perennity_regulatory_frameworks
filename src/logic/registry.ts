import type { LogicFn } from "./types";
import { sc_8_1_1 } from "./sc_8_1_1";
import { sc_8_1_2 } from "./sc_8_1_2";
import { sc_8_1_2_pue_measurement_compliance } from "./sc_8_1_2_pue_measurement_compliance";
import { dnsh_adaptation } from "./dnsh_adaptation";
import { dnsh_8_1_biodiversity } from "./dnsh_8_1_biodiversity";
import { dnsh_8_1_circular_economy } from "./dnsh_8_1_circular_economy";
import { dnsh_8_1_pollution } from "./dnsh_8_1_pollution";
import { dnsh_water } from "./dnsh_water";
import { pue_performance_band } from "./pue_performance_band";
import { safeguards_human_rights } from "./safeguards_human_rights";
import { safeguards_bribery_corruption } from "./safeguards_bribery_corruption";
import { safeguards_taxation } from "./safeguards_taxation";
import { safeguards_fair_competition } from "./safeguards_fair_competition";
import { minimum_safeguards_rollup } from "./minimum_safeguards_rollup";

// EU-Taxonomy registry — entries are LogicFn<["project"]>. SFDR (Phase 1
// commit 1.2) ships a parallel multi-axis dispatcher under src/sfdr/ rather
// than widening this registry's typing. Widening Axes is variance-hostile
// (a wider Axes tuple makes the function harder to call, not easier) and
// the SFDR scoring path has different concerns anyway: cross-criterion
// dependencies, cross-framework dependencies, typed band output. Keeping
// the EU registry narrow preserves type safety for the v3.2 criteria.
const registry: ReadonlyMap<string, LogicFn<["project"]>> = new Map<string, LogicFn<["project"]>>([
  ["logic.sc_8_1_1.v2", sc_8_1_1],
  // logic.sc_8_1_2.v1 retained for backward-compat with any v3.1-stamped
  // assessment still in IndexedDB. v3.2 KB references
  // logic.sc_8_1_2_pue_measurement_compliance.v1 instead.
  ["logic.sc_8_1_2.v1", sc_8_1_2],
  ["logic.sc_8_1_2_pue_measurement_compliance.v1", sc_8_1_2_pue_measurement_compliance],
  ["logic.dnsh_adaptation.v1", dnsh_adaptation],
  ["logic.dnsh_8_1_biodiversity.v1", dnsh_8_1_biodiversity],
  ["logic.dnsh_8_1_circular_economy.v1", dnsh_8_1_circular_economy],
  ["logic.dnsh_8_1_pollution.v1", dnsh_8_1_pollution],
  ["logic.dnsh_water.v1", dnsh_water],
  ["logic.pue_performance_band.v1", pue_performance_band],
  ["logic.safeguards_human_rights.v1", safeguards_human_rights],
  ["logic.safeguards_bribery_corruption.v1", safeguards_bribery_corruption],
  ["logic.safeguards_taxation.v1", safeguards_taxation],
  ["logic.safeguards_fair_competition.v1", safeguards_fair_competition],
  ["logic.minimum_safeguards_rollup.v1", minimum_safeguards_rollup],
]);

export function getLogic(ref: string): LogicFn<["project"]> | undefined {
  return registry.get(ref);
}

export function listLogicRefs(): string[] {
  return [...registry.keys()];
}
