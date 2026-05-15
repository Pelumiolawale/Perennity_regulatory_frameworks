import type { LogicFn } from "./types";
import { sc_8_1_1 } from "./sc_8_1_1";
import { sc_8_1_2 } from "./sc_8_1_2";
import { dnsh_adaptation } from "./dnsh_adaptation";
import { dnsh_water } from "./dnsh_water";

const registry: ReadonlyMap<string, LogicFn> = new Map<string, LogicFn>([
  ["logic.sc_8_1_1.v2", sc_8_1_1],
  ["logic.sc_8_1_2.v1", sc_8_1_2],
  ["logic.dnsh_adaptation.v1", dnsh_adaptation],
  ["logic.dnsh_water.v1", dnsh_water],
]);

export function getLogic(ref: string): LogicFn | undefined {
  return registry.get(ref);
}

export function listLogicRefs(): string[] {
  return [...registry.keys()];
}
