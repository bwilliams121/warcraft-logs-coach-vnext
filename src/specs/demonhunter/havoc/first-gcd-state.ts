/**
 * The abstract state the Havoc first-GCD query explores (ONB-A1).
 *
 * The generic engine branches on every NON_GCD entry it cannot decide, executes it
 * hypothetically, and rescans from the root. It never reads the state; it keys it.
 *
 * Everything here is a HYPOTHESIS, never an observation, and only a reviewed
 * transition contract (`demonhunter-havoc-transition-authority.ts`) writes it:
 *
 *   executedEntries       the authority entries that fired IN THIS BRANCH
 *   sharedCooldownTokens  tokens no entry may fire again at zero elapsed time
 *   forgottenBuffs        `buff.<name>.up` atoms forgotten unless bound UP
 *   furyForgotten         `fury` is no longer the decision cast's own observation
 */

import type { TraversalPathEntry } from "../../../simc/nested-selection.js";

export interface ExecutedEntry {
  readonly listName: string;
  readonly priorityOrdinal: number;
  readonly actionToken: string;
  readonly sourceLine: number;
}

export interface HavocFirstGcdState {
  readonly executedEntries: readonly ExecutedEntry[];
  readonly sharedCooldownTokens: readonly string[];
  readonly forgottenBuffs: readonly string[];
  readonly furyForgotten: boolean;
}

export function initialHavocState(): HavocFirstGcdState {
  return { executedEntries: [], sharedCooldownTokens: [], forgottenBuffs: [], furyForgotten: false };
}

export function executedEntryKey(entry: ExecutedEntry): string {
  return `${entry.listName}[${String(entry.priorityOrdinal)}]@${String(entry.sourceLine)}:${entry.actionToken}`;
}

export function asPathEntry(entry: ExecutedEntry): TraversalPathEntry {
  return { listName: entry.listName, priorityOrdinal: entry.priorityOrdinal, actionToken: entry.actionToken };
}

export function hasExecuted(state: HavocFirstGcdState, entry: ExecutedEntry): boolean {
  const key = executedEntryKey(entry);
  return state.executedEntries.some((executed) => executedEntryKey(executed) === key);
}

export function withExecution(state: HavocFirstGcdState, entry: ExecutedEntry): HavocFirstGcdState {
  return {
    ...state,
    executedEntries: hasExecuted(state, entry) ? state.executedEntries : [...state.executedEntries, entry],
  };
}

export function withSharedCooldown(state: HavocFirstGcdState, token: string): HavocFirstGcdState {
  return state.sharedCooldownTokens.includes(token)
    ? state
    : { ...state, sharedCooldownTokens: [...state.sharedCooldownTokens, token] };
}

export function withForgottenBuffs(state: HavocFirstGcdState, buffs: readonly string[]): HavocFirstGcdState {
  const added = buffs.filter((buff) => !state.forgottenBuffs.includes(buff));
  return added.length === 0 ? state : { ...state, forgottenBuffs: [...state.forgottenBuffs, ...added] };
}

export function withFuryForgotten(state: HavocFirstGcdState): HavocFirstGcdState {
  return state.furyForgotten ? state : { ...state, furyForgotten: true };
}

/** Stable and serializable: the engine's cycle detection compares these. */
export function havocStateKey(state: HavocFirstGcdState): string {
  const executed = `[${state.executedEntries.map(executedEntryKey).sort().join(",")}]`;
  const cooldowns = [...state.sharedCooldownTokens].sort().join(",");
  const forgotten = [...state.forgottenBuffs].sort().join(",");
  return `${executed}|cd=[${cooldowns}]|forgot=[${forgotten}]|fury=${String(state.furyForgotten)}`;
}
