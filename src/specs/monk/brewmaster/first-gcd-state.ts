/**
 * The abstract state the Brewmaster first-GCD query explores (M11-C2).
 *
 * The generic engine (`src/simc/first-gcd-selection.ts`) branches on every
 * NON_GCD entry it cannot decide, executes it hypothetically, and rescans from
 * the root. It never reads the state; it keys it. This module is what it
 * keys.
 *
 * `executedEntries`: the authority entries that fired IN THIS BRANCH. A
 * hypothesis, never an observation: the usability rule turns an executed
 * entry into PROVEN_UNUSABLE with the `SIMULATED_PREFIX_EXECUTION` reason so a
 * reader can never mistake it for something the player did.
 *
 * TWO MORE THINGS SINCE M11-C4i, both written only by a reviewed transition
 * contract (`monk-brewmaster-transition-authority.ts`):
 *
 *   `sharedCooldownTokens`  tokens whose SHARED internal cooldown a hypothetical
 *                           execution started: every entry naming the token is
 *                           PROVEN_UNUSABLE (SIMULATED_PREFIX_EXECUTION) in this
 *                           branch — Purifying Brew's 1,000 ms by-name cooldown.
 *   `forgottenBuffs`        `buff.<name>.up` atoms the branch FORGOT: a binding
 *                           the caller established is dropped unless it is UP,
 *                           so the atom is enumerated rather than read — Empty
 *                           Barrel after a hypothetical brew. Never set UP.
 *
 * NO RACE WORLD. Under the class/spec authority boundary every racial entry
 * of the pinned list is outside the rotational decision domain and is
 * classified non-domain before selection, so no race hypothesis is needed,
 * explored, or inferred (`domain-boundary.ts`).
 *
 * NO BREW CHARGE, STAGGER OR ENERGY. The engine models no time, this build
 * replays no resource change, and a brew entry whose writes are not reviewed
 * has no contract and refuses its branch.
 */

import type { TraversalPathEntry } from "../../../simc/nested-selection.js";

export interface ExecutedEntry {
  readonly listName: string;
  readonly priorityOrdinal: number;
  readonly actionToken: string;
  readonly sourceLine: number;
}

export interface BrewmasterFirstGcdState {
  readonly executedEntries: readonly ExecutedEntry[];
  /** Tokens whose shared internal cooldown a hypothetical execution started in this branch. */
  readonly sharedCooldownTokens: readonly string[];
  /** `buff.<name>.up` atoms forgotten in this branch unless the caller bound them UP. */
  readonly forgottenBuffs: readonly string[];
}

export function initialBrewmasterState(): BrewmasterFirstGcdState {
  return { executedEntries: [], sharedCooldownTokens: [], forgottenBuffs: [] };
}

export function executedEntryKey(entry: ExecutedEntry): string {
  return `${entry.listName}[${String(entry.priorityOrdinal)}]@${String(entry.sourceLine)}:${entry.actionToken}`;
}

export function asPathEntry(entry: ExecutedEntry): TraversalPathEntry {
  return { listName: entry.listName, priorityOrdinal: entry.priorityOrdinal, actionToken: entry.actionToken };
}

export function hasExecuted(state: BrewmasterFirstGcdState, entry: ExecutedEntry): boolean {
  const key = executedEntryKey(entry);
  return state.executedEntries.some((executed) => executedEntryKey(executed) === key);
}

export function withExecution(state: BrewmasterFirstGcdState, entry: ExecutedEntry): BrewmasterFirstGcdState {
  return {
    ...state,
    executedEntries: hasExecuted(state, entry) ? state.executedEntries : [...state.executedEntries, entry],
  };
}

export function withSharedCooldown(state: BrewmasterFirstGcdState, token: string): BrewmasterFirstGcdState {
  return state.sharedCooldownTokens.includes(token)
    ? state
    : { ...state, sharedCooldownTokens: [...state.sharedCooldownTokens, token] };
}

export function withForgottenBuffs(
  state: BrewmasterFirstGcdState,
  buffs: readonly string[],
): BrewmasterFirstGcdState {
  const added = buffs.filter((buff) => !state.forgottenBuffs.includes(buff));
  return added.length === 0 ? state : { ...state, forgottenBuffs: [...state.forgottenBuffs, ...added] };
}

/** Stable and serializable: the engine's cycle detection compares these. */
export function brewmasterStateKey(state: BrewmasterFirstGcdState): string {
  const executed = `[${state.executedEntries.map(executedEntryKey).sort().join(",")}]`;
  if (state.sharedCooldownTokens.length === 0 && state.forgottenBuffs.length === 0) return executed;
  return `${executed}|cd=[${[...state.sharedCooldownTokens].sort().join(",")}]|forgot=[${[...state.forgottenBuffs].sort().join(",")}]`;
}
