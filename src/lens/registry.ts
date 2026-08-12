// ============================================================================
// Lens registry (Engine v4.0 — Module 2)
// ============================================================================
//
// Holds the set of framework lenses. evaluateAll() runs every registered lens
// over one CanonicalAssessment and is FAILURE-ISOLATED: a lens that throws
// (e.g. the US stub's LensNotImplementedError) is captured into `errors` and
// does not abort the other lenses' verdicts.
// ============================================================================

import type { CanonicalAssessment } from "../core/canonical";
import type { FrameworkLens, LensVerdict } from "./types";

export interface LensRunError {
  lensId: string;
  message: string;
  errorName: string;
}

export interface LensRunResult {
  verdicts: LensVerdict[];
  errors: LensRunError[];
}

export class LensRegistry {
  private readonly lenses = new Map<string, FrameworkLens>();

  register(lens: FrameworkLens): this {
    this.lenses.set(lens.id, lens);
    return this;
  }

  get(id: string): FrameworkLens | undefined {
    return this.lenses.get(id);
  }

  ids(): string[] {
    return [...this.lenses.keys()];
  }

  has(id: string): boolean {
    return this.lenses.has(id);
  }

  /**
   * Evaluate every registered lens (or a filtered subset) over `a`.
   * Failure-isolated: a throwing lens becomes an entry in `errors`, never a
   * thrown exception. Stub lenses (US) surface as errors, by design.
   */
  evaluateAll(
    a: CanonicalAssessment,
    opts: { only?: string[] } = {},
  ): LensRunResult {
    const verdicts: LensVerdict[] = [];
    const errors: LensRunError[] = [];
    const target = opts.only
      ? this.ids().filter((id) => opts.only!.includes(id))
      : this.ids();
    for (const id of target) {
      const lens = this.lenses.get(id)!;
      try {
        verdicts.push(lens.evaluate(a));
      } catch (err) {
        errors.push({
          lensId: id,
          message: err instanceof Error ? err.message : String(err),
          errorName: err instanceof Error ? err.name : "Error",
        });
      }
    }
    return { verdicts, errors };
  }
}
