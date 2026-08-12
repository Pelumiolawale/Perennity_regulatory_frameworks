// Lens error types (Engine v4.0).

/**
 * Thrown by a lens that is specified in the interface + registered in the
 * registry but has no scoring implementation. Used by the US Social License
 * lens (Module 5): a scored stub would fake precision where no settled
 * evidence standard exists.
 */
export class LensNotImplementedError extends Error {
  readonly lensId: string;
  constructor(lensId: string, detail?: string) {
    super(
      `Lens "${lensId}" is specified but not scored${detail ? `: ${detail}` : "."}`,
    );
    this.name = "LensNotImplementedError";
    this.lensId = lensId;
  }
}
