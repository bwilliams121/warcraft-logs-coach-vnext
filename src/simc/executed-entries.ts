/**
 * Executed-entry bookkeeping for a first-GCD query's HYPOTHETICAL prefix
 * (M11-D2-B1).
 *
 * The first-GCD query lets an authority entry fire and asks the authority
 * again; a specialization's branch state records which entries have fired so
 * the same entry is not selected twice at zero elapsed time. The record itself
 * — an entry's identity, its traversal-path form, membership, append-once, the
 * sorted key — carries no gameplay and is the same for every specialization.
 *
 * WHAT STAYS SPEC-OWNED. Every other field of a branch state (charges counted
 * rather than recorded, shared internal cooldowns, forgotten atoms, race
 * worlds), every suffix of a state key, and the transition contracts a lookup
 * returns. A specialization composes these functions into its own state; it is
 * never given a base state to extend.
 *
 * Proven equal to the specialization implementations on committed evidence by
 * tests/contracts/m11d2b1-shared-plumbing-equivalence.test.ts. No public
 * analyzer imports this module.
 */

import type { TraversalPathEntry } from "./nested-selection.js";

/** One authority entry that fired in a branch. Identified by list, ordinal, source line and token — never by token alone. */
export interface ExecutedEntry {
  readonly listName: string;
  readonly priorityOrdinal: number;
  readonly actionToken: string;
  readonly sourceLine: number;
}

/** The one field a branch state must carry for these functions to apply. */
export interface ExecutedEntriesState {
  readonly executedEntries: readonly ExecutedEntry[];
}

/** The entry an authority action names. */
export function executedEntryOf(action: ExecutedEntry): ExecutedEntry {
  return {
    listName: action.listName,
    priorityOrdinal: action.priorityOrdinal,
    actionToken: action.actionToken,
    sourceLine: action.sourceLine,
  };
}

/** The stable identity of one entry: `list[ordinal]@line:token`. */
export function executedEntryKey(entry: ExecutedEntry): string {
  return `${entry.listName}[${String(entry.priorityOrdinal)}]@${String(entry.sourceLine)}:${entry.actionToken}`;
}

export function asPathEntry(entry: ExecutedEntry): TraversalPathEntry {
  return { listName: entry.listName, priorityOrdinal: entry.priorityOrdinal, actionToken: entry.actionToken };
}

/** Whether this exact entry has already fired in this branch. */
export function hasExecuted(state: ExecutedEntriesState, entry: ExecutedEntry): boolean {
  const key = executedEntryKey(entry);
  return state.executedEntries.some((executed) => executedEntryKey(executed) === key);
}

/**
 * The state after one hypothetical execution: the entry recorded once, every
 * other field carried through unchanged. A specialization that counts an
 * execution rather than recording it composes its own field on top.
 */
export function withExecution<TState extends ExecutedEntriesState>(
  state: TState,
  entry: ExecutedEntry,
): TState {
  return {
    ...state,
    executedEntries: hasExecuted(state, entry) ? state.executedEntries : [...state.executedEntries, entry],
  };
}

/**
 * The executed entries as a stable key: sorted, bracketed, comma-joined.
 *
 * Sorted, so two branches that fired the same entries in different orders
 * share a key. A specialization whose state holds more than this appends its
 * own suffix.
 */
export function executedEntriesKey(entries: readonly ExecutedEntry[]): string {
  return `[${entries.map(executedEntryKey).sort().join(",")}]`;
}

export type SelectedContractLookup<TContract> =
  { readonly contract: TContract } | { readonly refusal: string };

/**
 * The reviewed transition contract for a selected NON_GCD entry, or the
 * refusal that stops the branch. FAILS CLOSED: no contract, no execution.
 *
 * The lookup — which tokens have a reviewed contract and what each changes —
 * is the specialization's.
 */
export function contractForSelected<TContract>(
  actionToken: string,
  lookup: (actionToken: string) => TContract | null,
): SelectedContractLookup<TContract> {
  const contract = lookup(actionToken);
  if (contract === null) {
    return {
      refusal:
        `no reviewed transition contract exists for '${actionToken}', so what executing it ` +
        "would change is not established and the branch cannot continue",
    };
  }
  return { contract };
}
