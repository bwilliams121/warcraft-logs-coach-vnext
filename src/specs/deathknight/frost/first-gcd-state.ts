/**
 * The abstract state the Frost Death Knight first-GCD query explores (ONB-B2).
 *
 * The generic engine branches on every NON_GCD entry it cannot decide, executes it
 * hypothetically, and rescans from the root. It never reads the state; it keys it.
 *
 * It is a HYPOTHESIS, never an observation, and only a reviewed transition contract
 * (`deathknight-frost-transition-authority.ts`) writes it: the authority entries that fired IN THIS
 * BRANCH, and nothing else, because no contract here writes anything else.
 */

export interface ExecutedEntry {
  readonly listName: string;
  readonly priorityOrdinal: number;
  readonly actionToken: string;
  readonly sourceLine: number;
}

export interface FrostDeathKnightFirstGcdState {
  readonly executedEntries: readonly ExecutedEntry[];
}

export function initialFrostDeathKnightState(): FrostDeathKnightFirstGcdState {
  return { executedEntries: [] };
}

export function executedEntryKey(entry: ExecutedEntry): string {
  return `${entry.listName}[${String(entry.priorityOrdinal)}]@${String(entry.sourceLine)}:${entry.actionToken}`;
}

export function hasExecuted(state: FrostDeathKnightFirstGcdState, entry: ExecutedEntry): boolean {
  const key = executedEntryKey(entry);
  return state.executedEntries.some((executed) => executedEntryKey(executed) === key);
}

export function withExecution(
  state: FrostDeathKnightFirstGcdState,
  entry: ExecutedEntry,
): FrostDeathKnightFirstGcdState {
  return hasExecuted(state, entry) ? state : { executedEntries: [...state.executedEntries, entry] };
}

/** Stable and serializable: the engine's cycle detection compares these. */
export function frostDeathKnightStateKey(state: FrostDeathKnightFirstGcdState): string {
  return `[${state.executedEntries.map(executedEntryKey).sort().join(",")}]`;
}
