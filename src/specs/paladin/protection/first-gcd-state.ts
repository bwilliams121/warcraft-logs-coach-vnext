/**
 * The abstract state the Protection first-GCD query explores (M10-C).
 *
 * The generic engine (`src/simc/first-gcd-selection.ts`) branches on every
 * NON_GCD entry it cannot decide, executes it hypothetically, and rescans from
 * the root. It never reads the state; it keys it. This module is what it
 * keys.
 *
 * TWO THINGS, AND ONLY TWO
 *
 *   executedEntries   the authority entries that fired IN THIS BRANCH. A
 *                     hypothesis, never an observation: the usability rule
 *                     turns an executed entry into PROVEN_UNUSABLE with the
 *                     `SIMULATED_PREFIX_EXECUTION` reason so a reader can
 *                     never mistake it for something the player did.
 *   race              the correlated race world. Warcraft Logs exposes no
 *                     race, and the pinned Protection APL names two racials —
 *                     `fireblood` (Dark Iron Dwarf) and `arcane_torrent`
 *                     (Blood Elf). One player cannot be both, so the query
 *                     runs once per world and converges, exactly as the
 *                     Assassination adapter does for its four.
 *
 * There is no Holy Power here. The engine models no time and this build
 * replays no resource change, so a branch carries no resource state to
 * update. What Holy Power the evidence establishes at the decision is read
 * once, from the observation, by the action profile.
 */

import type { TraversalPathEntry } from "../../../simc/nested-selection.js";

export type ProtectionRaceWorld = "DARK_IRON_DWARF" | "BLOOD_ELF" | "OTHER";

export const PROTECTION_RACE_WORLDS = [
  "DARK_IRON_DWARF",
  "BLOOD_ELF",
  "OTHER",
] as const satisfies readonly ProtectionRaceWorld[];

/** The racial token each world makes available, per the pinned APL lines 5 and 27. */
export const PROTECTION_RACIAL_TOKEN_BY_WORLD: Readonly<Record<ProtectionRaceWorld, string | null>> = {
  DARK_IRON_DWARF: "fireblood",
  BLOOD_ELF: "arcane_torrent",
  OTHER: null,
};

export const PROTECTION_RACIAL_TOKENS = ["fireblood", "arcane_torrent"] as const;

export interface ExecutedEntry {
  readonly listName: string;
  readonly priorityOrdinal: number;
  readonly actionToken: string;
  readonly sourceLine: number;
}

/** An atom a hypothetical execution may have changed, so the branch no longer trusts the caller's binding of it. */
export interface ForgottenAtom {
  readonly kind: "BUFF" | "SPEC_ATOM";
  readonly name: string;
}

export interface ProtectionFirstGcdState {
  readonly executedEntries: readonly ExecutedEntry[];
  readonly race: ProtectionRaceWorld;
  /**
   * Atoms FORGOTTEN in this branch (M10-C5 Phase B): a contract's
   * UNBOUND_ATOMS_MAY_CHANGE names what an execution may change; the
   * successor state drops the caller's binding of exactly those atoms, so the
   * shared evaluator enumerates them again. Everything else stays bound.
   */
  readonly forgottenAtoms: readonly ForgottenAtom[];
}

export function initialProtectionState(race: ProtectionRaceWorld): ProtectionFirstGcdState {
  return { executedEntries: [], race, forgottenAtoms: [] };
}

const forgottenKey = (atom: ForgottenAtom): string => `${atom.kind}:${atom.name}`;

export function withForgottenAtoms(
  state: ProtectionFirstGcdState,
  atoms: readonly ForgottenAtom[],
): ProtectionFirstGcdState {
  const known = new Set(state.forgottenAtoms.map(forgottenKey));
  const added = atoms.filter((atom) => !known.has(forgottenKey(atom)));
  return added.length === 0 ? state : { ...state, forgottenAtoms: [...state.forgottenAtoms, ...added] };
}

export function executedEntryKey(entry: ExecutedEntry): string {
  return `${entry.listName}[${String(entry.priorityOrdinal)}]@${String(entry.sourceLine)}:${entry.actionToken}`;
}

export function asPathEntry(entry: ExecutedEntry): TraversalPathEntry {
  return { listName: entry.listName, priorityOrdinal: entry.priorityOrdinal, actionToken: entry.actionToken };
}

export function hasExecuted(state: ProtectionFirstGcdState, entry: ExecutedEntry): boolean {
  const key = executedEntryKey(entry);
  return state.executedEntries.some((executed) => executedEntryKey(executed) === key);
}

export function withExecution(state: ProtectionFirstGcdState, entry: ExecutedEntry): ProtectionFirstGcdState {
  return {
    executedEntries: hasExecuted(state, entry) ? state.executedEntries : [...state.executedEntries, entry],
    race: state.race,
    forgottenAtoms: state.forgottenAtoms,
  };
}

/** Stable and serializable: the engine's cycle detection compares these. */
export function protectionStateKey(state: ProtectionFirstGcdState): string {
  const executed = state.executedEntries.map(executedEntryKey).sort().join(",");
  const forgotten = state.forgottenAtoms.map(forgottenKey).sort().join(",");
  return `${state.race}|[${executed}]|forgot[${forgotten}]`;
}

export function racialIsApplicableIn(state: ProtectionFirstGcdState, simcToken: string): boolean {
  return PROTECTION_RACIAL_TOKEN_BY_WORLD[state.race] === simcToken;
}
