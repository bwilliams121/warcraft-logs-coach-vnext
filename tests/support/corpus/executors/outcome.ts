/**
 * What one executed assertion reports back.
 *
 * `expected` and `actual` are SEMANTIC results — the small structured facts the
 * assertion pinned and what the layer actually produced — never a payload
 * dump. `locator` is an evidence coordinate when the layer offered one: a
 * normalized event locator, a raw index, a report time. The harness prints all
 * of it verbatim, so it has to stay small.
 */

export type AssertionOutcome =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly detail: string;
      readonly expected?: unknown;
      readonly actual?: unknown;
      readonly locator?: unknown;
    }
  /** The kind is registered but has no executor. Reported, never counted. */
  | { readonly ok: "DECLARED" };

export function pass(): AssertionOutcome {
  return { ok: true };
}

export function fail(
  detail: string,
  facts: { readonly expected?: unknown; readonly actual?: unknown; readonly locator?: unknown } = {},
): AssertionOutcome {
  return { ok: false, detail, ...facts };
}
