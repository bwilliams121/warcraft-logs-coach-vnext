/**
 * The abstract state the Beast Mastery Hunter first-GCD query explores (ONB-T2).
 *
 * The generic engine branches on every NON_GCD entry it cannot decide, executes it
 * hypothetically, and rescans from the root. It never reads the state; it keys it.
 *
 * It is a HYPOTHESIS, never an observation, and only a reviewed transition contract
 * (`hunter-beast_mastery-transition-authority.ts`) writes it: the authority entries that fired IN THIS
 * BRANCH, and nothing else, because no contract here writes anything else.
 */

export interface ExecutedEntry {
  readonly listName: string;
  readonly priorityOrdinal: number;
  readonly actionToken: string;
  readonly sourceLine: number;
}

export interface BeastMasteryFirstGcdState {
  readonly executedEntries: readonly ExecutedEntry[];
}

export function initialBeastMasteryState(): BeastMasteryFirstGcdState {
  return { executedEntries: [] };
}

export function executedEntryKey(entry: ExecutedEntry): string {
  return `${entry.listName}[${String(entry.priorityOrdinal)}]@${String(entry.sourceLine)}:${entry.actionToken}`;
}

export function hasExecuted(state: BeastMasteryFirstGcdState, entry: ExecutedEntry): boolean {
  const key = executedEntryKey(entry);
  return state.executedEntries.some((executed) => executedEntryKey(executed) === key);
}

export function withExecution(
  state: BeastMasteryFirstGcdState,
  entry: ExecutedEntry,
): BeastMasteryFirstGcdState {
  return hasExecuted(state, entry) ? state : { executedEntries: [...state.executedEntries, entry] };
}

/** Stable and serializable: the engine's cycle detection compares these. */
export function beastMasteryStateKey(state: BeastMasteryFirstGcdState): string {
  return `[${state.executedEntries.map(executedEntryKey).sort().join(",")}]`;
}
