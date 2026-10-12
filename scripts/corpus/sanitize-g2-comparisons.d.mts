/**
 * Types for the M11-G2 comparison sanitizer's exported surface, so its rules
 * can be tested. The script stays plain JavaScript; the CLI body runs behind
 * an entry-point guard and is not reachable by importing this module.
 */

/** The tool's own revision, recorded as `tooling.revision` on a G2 archive artifact. */
export const G2_SANITIZER_REVISION: string;

/** The E2.1 retained raw types and actorless types, verbatim. */
export const G2_FAMILIES: readonly string[];
export const G2_ACTORLESS_FAMILIES: readonly string[];
export const G2_SEGMENT_BYTE_LIMIT: number;

/** The production fight context with every identity replaced by its pseudonym. */
export function sanitizeG2Context(
  raw: unknown,
  pseudoCode: (code: string) => string,
  pseudoPlayer: (name: string) => string,
): unknown;

/** The window tables' bounds, read from the recorded query document. */
export function windowBoundsOf(queryDocument: string): { window: string; fromMs: number; toMs: number }[];

/** The composed table response reduced to ids, counts, totals, uptimes and bands. */
export function sanitizeG2Tables(
  raw: unknown,
  pseudoCode: (code: string) => string,
  queryDocument: string,
): unknown;

/** Greedy whole-pull-second segments (from, to], each at most `limit` compact bytes. */
export function planSegments(
  retained: readonly Record<string, unknown>[],
  startMs: number,
  endMs: number,
  limit?: number,
): { from: number; to: number }[];

/** Every output file keyed by artifact id (the exact bytes), and the segment report. */
export function sanitizeG2(
  g2Dir: string,
  g1Capture: unknown,
): { files: Map<string, string>; segmentsReport: Record<string, unknown> };
