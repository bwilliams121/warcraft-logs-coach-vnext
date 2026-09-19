/**
 * The abstract state the Blood first-GCD query explores (M11-B2).
 *
 * The generic engine (`src/simc/first-gcd-selection.ts`) branches on every
 * NON_GCD entry it cannot decide, executes it hypothetically, and rescans from
 * the root. It never reads the state; it keys it. This module is what it
 * keys.
 *
 * ONE THING. `executedEntries`: the authority entries that fired IN THIS
 * BRANCH. A hypothesis, never an observation: the usability rule turns an
 * executed entry into PROVEN_UNUSABLE with the `SIMULATED_PREFIX_EXECUTION`
 * reason so a reader can never mistake it for something the player did.
 *
 * NO RACE WORLD. Under the class/spec authority boundary every racial entry
 * of the pinned list is outside the rotational decision domain and is
 * classified non-domain before selection, so no race hypothesis is needed,
 * explored, or inferred (`domain-boundary.ts`).
 *
 * NO FORGOTTEN ATOMS. The three reviewed Blood contracts (`auto_attack`,
 * `vampiric_blood`, `raise_dead`) write nothing any LATER pinned entry
 * reads (`deathknight-blood-transition-authority.ts`), so a branch never
 * has to widen a caller's binding. No Rune or Runic Power is here either:
 * the engine models no time and this build replays no resource change.
 */

import type { TraversalPathEntry } from "../../../simc/nested-selection.js";

export interface ExecutedEntry {
  readonly listName: string;
  readonly priorityOrdinal: number;
  readonly actionToken: string;
  readonly sourceLine: number;
}

export interface BloodFirstGcdState {
  readonly executedEntries: readonly ExecutedEntry[];
}

export function initialBloodState(): BloodFirstGcdState {
  return { executedEntries: [] };
}

export function executedEntryKey(entry: ExecutedEntry): string {
  return `${entry.listName}[${String(entry.priorityOrdinal)}]@${String(entry.sourceLine)}:${entry.actionToken}`;
}

export function asPathEntry(entry: ExecutedEntry): TraversalPathEntry {
  return { listName: entry.listName, priorityOrdinal: entry.priorityOrdinal, actionToken: entry.actionToken };
}

export function hasExecuted(state: BloodFirstGcdState, entry: ExecutedEntry): boolean {
  const key = executedEntryKey(entry);
  return state.executedEntries.some((executed) => executedEntryKey(executed) === key);
}

export function withExecution(state: BloodFirstGcdState, entry: ExecutedEntry): BloodFirstGcdState {
  return {
    executedEntries: hasExecuted(state, entry) ? state.executedEntries : [...state.executedEntries, entry],
  };
}

/** Stable and serializable: the engine's cycle detection compares these. */
export function bloodStateKey(state: BloodFirstGcdState): string {
  return `[${state.executedEntries.map(executedEntryKey).sort().join(",")}]`;
}
