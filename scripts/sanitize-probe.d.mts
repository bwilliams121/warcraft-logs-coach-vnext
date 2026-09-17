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

/**
 * The `--actor-slice` predicate: every event whose sourceID or targetID is
 * the subject, in capture order, optionally bounded to `timestamp <= untilMs`,
 * optionally restricted to the raw `type` strings in `families`, optionally
 * restricted to `timestamp > fromMs`.
 */
export function actorSlice(
  events: readonly unknown[],
  subject: number,
  untilMs?: number | null,
  families?: readonly string[] | null,
  fromMs?: number | null,
): readonly unknown[];

export type FamilySelection =
  | { readonly ok: true; readonly families: readonly string[] }
  | { readonly ok: false; readonly error: string };

/** Parses a `--families` list: raw event types, comma-separated, each once. Refuses rather than trims. */
export function parseFamilySelection(spec: string | undefined): FamilySelection;

/** The slicer's own revision, recorded as `tooling.revision` on a corpus artifact. */
export const SANITIZER_REVISION: string;

/** Where a reviewed slice is written: the corpus artifact tree. */
export const OUTPUT_ROOT: string;
