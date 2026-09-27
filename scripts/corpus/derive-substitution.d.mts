/**
 * Types for the negative-control derivation tool's exported helpers, so its
 * rule can be tested. The script stays plain JavaScript; the CLI body runs
 * behind an entry-point guard and is not reachable by importing this module.
 */

/** The tool's own revision, recorded as `tooling.revision` on a corpus artifact. */
export const DERIVE_SUBSTITUTION_REVISION: string;

/** Where parents are read and derivatives written: the corpus event-artifact tree. */
export const ARTIFACT_ROOT: string;

/** A copy with one cast's `abilityGameID` changed from `from` to `to`; throws on anything else. */
export function substituteCastAbility<T>(events: readonly T[], index: number, from: number, to: number): T[];

/** The artifact byte form: `JSON.stringify(events, null, 2)` plus a trailing newline. */
export function serializeArtifact(events: readonly unknown[]): string;
