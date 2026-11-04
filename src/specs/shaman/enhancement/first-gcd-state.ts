/**
 * The abstract state the Enhancement Shaman first-GCD query explores (ONB-B2).
 *
 * The generic engine branches on every NON_GCD entry it cannot decide, executes it
 * hypothetically, and rescans from the root. It never reads the state; it keys it.
 *
 * It is a HYPOTHESIS, never an observation, and only a reviewed transition contract
 * (`shaman-enhancement-transition-authority.ts`) writes it: the authority entries that fired IN THIS
 * BRANCH, and nothing else, because no contract here writes anything else.
 */

export interface ExecutedEntry {
  readonly listName: string;
  readonly priorityOrdinal: number;
  readonly actionToken: string;
  readonly sourceLine: number;
}

export interface EnhancementShamanFirstGcdState {
  readonly executedEntries: readonly ExecutedEntry[];
}

export function initialEnhancementShamanState(): EnhancementShamanFirstGcdState {
  return { executedEntries: [] };
}

export function executedEntryKey(entry: ExecutedEntry): string {
  return `${entry.listName}[${String(entry.priorityOrdinal)}]@${String(entry.sourceLine)}:${entry.actionToken}`;
}

export function hasExecuted(state: EnhancementShamanFirstGcdState, entry: ExecutedEntry): boolean {
  const key = executedEntryKey(entry);
  return state.executedEntries.some((executed) => executedEntryKey(executed) === key);
}

export function withExecution(
  state: EnhancementShamanFirstGcdState,
  entry: ExecutedEntry,
): EnhancementShamanFirstGcdState {
  return hasExecuted(state, entry) ? state : { executedEntries: [...state.executedEntries, entry] };
}

/** Stable and serializable: the engine's cycle detection compares these. */
export function enhancementShamanStateKey(state: EnhancementShamanFirstGcdState): string {
  return `[${state.executedEntries.map(executedEntryKey).sort().join(",")}]`;
}
