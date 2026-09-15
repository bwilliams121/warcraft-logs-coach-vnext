/**
 * How far either side of an anchor a caller wants to look.
 *
 * THE WINDOW IS AN INPUT, NEVER A DEFAULT
 *
 * There is no exported default width, and that omission is the point. "Events
 * within five seconds are related" is a semantic claim about encounters that
 * nothing in this project has established, and a default would make it silently
 * every caller's claim. A caller that wants a window states one and owns it.
 *
 * WHAT A WINDOW MEANS, EXHAUSTIVELY
 *
 *     these observations occurred within the requested temporal interval
 *
 * It does NOT mean they caused the anchor, explain it, are relevant to it, or
 * are mechanics. `encounter-events.ts` has no field any of those could be
 * written into.
 *
 * WHY IT IS BRANDED
 *
 * So that validation cannot be skipped by writing an object literal. The only
 * way to obtain a `TemporalWindowMs` is `temporalWindow()`, which rejects
 * negative, non-finite and non-integer inputs. The same technique guards
 * `SourceRef`/`TargetRef` in the normalized event model, for the same reason:
 * a rule enforced by a constructor is a rule, and a rule enforced by a comment
 * is a suggestion.
 */

declare const WINDOW_BRAND: unique symbol;

/**
 * A validated, non-negative, integral millisecond window around an anchor.
 *
 * `beforeMs` and `afterMs` are independent: an asymmetric window is legitimate
 * and common — "what was observed in the two seconds before this, and the half
 * second after" is a different question from a symmetric one.
 */
export type TemporalWindowMs = {
  readonly beforeMs: number;
  readonly afterMs: number;
} & { readonly [WINDOW_BRAND]: true };

export type TemporalWindowDefect = "NOT_FINITE" | "NOT_AN_INTEGER" | "NEGATIVE";

export const TEMPORAL_WINDOW_DEFECTS = [
  "NOT_FINITE",
  "NOT_AN_INTEGER",
  "NEGATIVE",
] as const satisfies readonly TemporalWindowDefect[];

export type TemporalWindowResult =
  | { readonly ok: true; readonly window: TemporalWindowMs }
  | { readonly ok: false; readonly defect: TemporalWindowDefect; readonly field: "beforeMs" | "afterMs" };

/**
 * Builds a window, or reports precisely why the input was not one.
 *
 * ZERO IS VALID ON EITHER SIDE. `beforeMs: 0` asks for the anchor instant and
 * nothing earlier, which is a real question. Rejecting it would be a truthiness
 * test wearing a validation hat, and this codebase does not do those.
 *
 * Milliseconds are integral because Warcraft Logs timestamps are, and because a
 * fractional window would make two callers asking "the same" question disagree
 * at the boundary.
 */
export function temporalWindow(beforeMs: number, afterMs: number): TemporalWindowResult {
  for (const [field, value] of [
    ["beforeMs", beforeMs],
    ["afterMs", afterMs],
  ] as const) {
    if (!Number.isFinite(value)) {
      return { ok: false, defect: "NOT_FINITE", field };
    }
    if (!Number.isInteger(value)) {
      return { ok: false, defect: "NOT_AN_INTEGER", field };
    }
    if (value < 0) {
      return { ok: false, defect: "NEGATIVE", field };
    }
  }
  return { ok: true, window: { beforeMs, afterMs } as TemporalWindowMs };
}
