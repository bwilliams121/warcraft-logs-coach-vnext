/**
 * Types for the M13-A Augmentation sanitizer's exported surface, so its rules
 * can be tested. The script stays plain JavaScript; the CLI body runs behind
 * an entry-point guard and is not reachable by importing this module.
 */

/** The tool's own revision, recorded as `tooling.revision` on an M13-A archive artifact. */
export const M13A_SANITIZER_REVISION: string;
/** The committed pseudonym of the third-party report code. */
export const M13A_PSEUDONYM_CODE: string;
/** The cut between the two segments, in seconds after the fight start. */
export const M13A_SPLIT_SECONDS: number;

/** Stable merge by timestamp; ties keep stream order, then in-stream order. */
export function mergeStreams<T extends { readonly timestamp: number }>(
  streams: readonly (readonly T[])[],
): T[];

/** The production fight context with the report code and every name pseudonymized. */
export function sanitizeContext(context: unknown): unknown;

/** Reads a capture directory and returns the files it would write, by relative path. */
export function sanitizeM13a(captureDir: string): {
  readonly files: ReadonlyMap<string, string>;
  readonly split: number;
  readonly events: number;
};
