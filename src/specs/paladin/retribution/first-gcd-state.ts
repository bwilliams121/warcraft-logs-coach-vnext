/**
 * The abstract state the Retribution first-GCD query explores (M11-A4).
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
 * NO RACE WORLD. Under the class/spec authority boundary (2026-09-18) every
 * racial entry of the pinned list is outside the rotational decision domain
 * and is classified non-domain before selection, so no race hypothesis is
 * needed, explored, or inferred (`domain-boundary.ts`).
 *
 * NO FORGOTTEN ATOMS. The two reviewed Retribution contracts (`auto_attack`,
 * `rebuke`) write nothing any pinned atom reads, so a branch never has to
 * widen a caller's binding. There is no Holy Power here either: the engine
 * models no time and this build replays no resource change.
 */

import type { TraversalPathEntry } from "../../../simc/nested-selection.js";

export interface ExecutedEntry {
  readonly listName: string;
  readonly priorityOrdinal: number;
  readonly actionToken: string;
  readonly sourceLine: number;
}

export interface RetributionFirstGcdState {
  readonly executedEntries: readonly ExecutedEntry[];
}

export function initialRetributionState(): RetributionFirstGcdState {
  return { executedEntries: [] };
}

export function executedEntryKey(entry: ExecutedEntry): string {
  return `${entry.listName}[${String(entry.priorityOrdinal)}]@${String(entry.sourceLine)}:${entry.actionToken}`;
}

export function asPathEntry(entry: ExecutedEntry): TraversalPathEntry {
  return { listName: entry.listName, priorityOrdinal: entry.priorityOrdinal, actionToken: entry.actionToken };
}

export function hasExecuted(state: RetributionFirstGcdState, entry: ExecutedEntry): boolean {
  const key = executedEntryKey(entry);
  return state.executedEntries.some((executed) => executedEntryKey(executed) === key);
}

export function withExecution(
  state: RetributionFirstGcdState,
  entry: ExecutedEntry,
): RetributionFirstGcdState {
  return {
    executedEntries: hasExecuted(state, entry) ? state.executedEntries : [...state.executedEntries, entry],
  };
}

/** Stable and serializable: the engine's cycle detection compares these. */
export function retributionStateKey(state: RetributionFirstGcdState): string {
  return `[${state.executedEntries.map(executedEntryKey).sort().join(",")}]`;
}
