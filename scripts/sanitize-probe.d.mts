/**
 * Types for the fixture slicer's exported helpers.
 *
 * The script itself stays plain JavaScript so `node` runs it with no TypeScript
 * runner and no new dependency. Only the two pure helpers are exported, and only
 * so their rules can be tested; the CLI body runs behind an entry-point guard
 * and is not reachable by importing this module.
 */

export type IndexSelection =
  { readonly ok: true; readonly indices: readonly number[] } | { readonly ok: false; readonly error: string };

/**
 * Parses an `--indices` argument against a capture of `eventCount` events.
 *
 * Rejects anything it cannot honour exactly: a non-decimal entry, an index past
 * the end of the capture, a repeat, or an empty list. Never coerces, reorders,
 * deduplicates or drops.
 */
export function parseIndexSelection(spec: string | undefined, eventCount: number): IndexSelection;

/**
 * Pulls the event array out of a bare array, a full GraphQL envelope, or an
 * array of page envelopes (concatenated in page order). Throws on none of them.
 */
export function extractEvents(value: unknown): readonly unknown[];

/**
 * The `--decision-slice` predicate: every cast by the subject, every aura
 * event targeting the subject or a listed target, the subject's combatantinfo.
 */
export function decisionSlice(
  events: readonly unknown[],
  subject: number,
  targets: readonly number[],
): readonly unknown[];

/** The slicer's own revision, recorded as `tooling.revision` on a corpus artifact. */
export const SANITIZER_REVISION: string;

/** Where a reviewed slice is written: the corpus artifact tree. */
export const OUTPUT_ROOT: string;
