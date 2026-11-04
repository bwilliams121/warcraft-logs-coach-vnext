/**
 * The abstract state the Feral Druid first-GCD query explores (ONB-C1).
 *
 * The generic engine branches on every NON_GCD entry it cannot decide, executes it
 * hypothetically, and rescans from the root. It never reads the state; it keys it.
 *
 * It is a HYPOTHESIS, never an observation, and only a reviewed transition contract
 * (`druid-feral-transition-authority.ts`) writes it: the authority entries that fired IN THIS
 * BRANCH, and nothing else, because no contract here writes anything else.
 */

export interface ExecutedEntry {
  readonly listName: string;
  readonly priorityOrdinal: number;
  readonly actionToken: string;
  readonly sourceLine: number;
}

export interface FeralDruidFirstGcdState {
  readonly executedEntries: readonly ExecutedEntry[];
}

export function initialFeralDruidState(): FeralDruidFirstGcdState {
  return { executedEntries: [] };
}

export function executedEntryKey(entry: ExecutedEntry): string {
  return `${entry.listName}[${String(entry.priorityOrdinal)}]@${String(entry.sourceLine)}:${entry.actionToken}`;
}

export function hasExecuted(state: FeralDruidFirstGcdState, entry: ExecutedEntry): boolean {
  const key = executedEntryKey(entry);
  return state.executedEntries.some((executed) => executedEntryKey(executed) === key);
}

export function withExecution(state: FeralDruidFirstGcdState, entry: ExecutedEntry): FeralDruidFirstGcdState {
  return hasExecuted(state, entry) ? state : { executedEntries: [...state.executedEntries, entry] };
}

/** Stable and serializable: the engine's cycle detection compares these. */
export function feralDruidStateKey(state: FeralDruidFirstGcdState): string {
  return `[${state.executedEntries.map(executedEntryKey).sort().join(",")}]`;
}
