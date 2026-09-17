/**
 * Types for the gap-derivation tool's exported helpers, so its rule can be
 * tested. The script stays plain JavaScript; the CLI body runs behind an
 * entry-point guard and is not reachable by importing this module.
 */

/** The tool's own revision, recorded as `tooling.revision` on a corpus artifact. */
export const DERIVE_GAP_REVISION: string;

/** Where parents are read and derivatives written: the corpus event-artifact tree. */
export const ARTIFACT_ROOT: string;

/** Every event strictly inside `(fromMs, toMs)` removed; everything else kept in order. */
export function removeBetween<T>(events: readonly T[], fromMs: number, toMs: number): T[];

/** The artifact byte form: `JSON.stringify(events, null, 2)` plus a trailing newline. */
export function serializeArtifact(events: readonly unknown[]): string;
