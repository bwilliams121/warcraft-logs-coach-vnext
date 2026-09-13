/**
 * The abstract state the first-GCD query carries, and the line it draws.
 *
 * THE ONE DISTINCTION THIS WHOLE MODULE EXISTS TO KEEP
 *
 *     OBSERVED       actor 19 cast Kingsbane 2.802 s before Q
 *     DERIVED        therefore its cooldown has at least 57.198 s left
 *     HYPOTHETICAL   in one explored world, a potion fired before Garrote
 *
 * The first two are facts about a fight that happened and live in M3/M4/C3c1.
 * The third is a branch of a simulation of the AUTHORITY, and it must never be
 * written back into them. A hypothetical potion execution is not evidence that a
 * potion was used, and a hypothetical cooldown is not a cooldown.
 *
 * So the prefix lives here, in its own type, and reaches the scan through its own
 * usability reason — `SIMULATED_PREFIX_EXECUTION` — whose evidence says in words
 * that it is counterfactual. Nothing in this state is ever consulted as
 * observation, and nothing observed is ever written into it.
 *
 * WHAT IS IN IT, AND WHY EACH FIELD EARNS ITS PLACE
 *
 *     executedEntries    which authority ENTRIES have fired in this branch.
 *                        Keyed by list/ordinal/source line, not by token: a
 *                        future APL can name the same token twice, and "potion
 *                        fired" would then be ambiguous.
 *     teaExecutions      a COUNT, because Thistle Tea has three charges and
 *                        firing it once does not spend them all.
 *     race               the correlated race world. One player has one race.
 *
 * WHY THERE IS NO ENERGY FIELD
 *
 * Because nothing in the supported prefix can move it below the one threshold
 * that matters. Kick and the four racials spend nothing; Thistle Tea only grants,
 * and Energy at Q is already at its cap. Carrying a number that provably never
 * changes would invite someone to start deriving from it.
 */

import type { TraversalPathEntry } from "../../../simc/nested-selection.js";

/**
 * The races whose racials appear in the pinned `misc_cds` list, plus everyone
 * else.
 *
 * CORRELATED, and that is the entire point. Warcraft Logs exposes no race, so a
 * naive model would make four independent unknown booleans and admit a character
 * who is simultaneously an Orc, a Troll, a Dark Iron Dwarf and a Mag'har Orc —
 * able to fire four racials in one prefix. One player has one race, so the
 * unknown is ONE value with five possible settings and at most one applicable
 * racial in each.
 *
 * `OTHER` covers every race with no racial in this list. It is not a fallback:
 * it is the world in which all four entries are background and none can fire.
 */
export type RaceWorld = "ORC" | "TROLL" | "DARK_IRON_DWARF" | "MAGHAR_ORC" | "OTHER";

export const RACE_WORLDS = [
  "ORC",
  "TROLL",
  "DARK_IRON_DWARF",
  "MAGHAR_ORC",
  "OTHER",
] as const satisfies readonly RaceWorld[];

/**
 * Which racial token each race world can use, if any.
 *
 * From `racial_spell_entry_t::find`, which filters on a race mask: Blood Fury is
 * mask 0x0002 (Orc), Berserking 0x0080 (Troll), Fireblood 0x0800 (Dark Iron
 * Dwarf), Ancestral Call 0x2000 (Mag'har Orc). The masks are pairwise disjoint,
 * which is what makes the correlation exact rather than merely plausible.
 */
export const RACIAL_TOKEN_BY_WORLD: Readonly<Record<RaceWorld, string | null>> = {
  ORC: "blood_fury",
  TROLL: "berserking",
  DARK_IRON_DWARF: "fireblood",
  MAGHAR_ORC: "ancestral_call",
  OTHER: null,
};

/** Every racial token the pinned `misc_cds` list names. */
export const RACIAL_TOKENS = ["blood_fury", "berserking", "fireblood", "ancestral_call"] as const;

/** Thistle Tea's charge ceiling. Three, and no recharge at zero elapsed time. */
export const MAX_THISTLE_TEA_EXECUTIONS = 3;

/**
 * A hypothetically-executed authority entry.
 *
 * The full coordinates, not the token. Two entries sharing a token are different
 * entries, and a prefix that could not tell them apart would disable the wrong
 * one on the next scan.
 */
export interface ExecutedEntry {
  readonly listName: string;
  readonly priorityOrdinal: number;
  readonly actionToken: string;
  readonly sourceLine: number;
}

export interface AssassinationFirstGcdState {
  /** Entries that fired in THIS branch. Hypothetical, never observed. */
  readonly executedEntries: readonly ExecutedEntry[];
  /** How many Thistle Tea charges this branch has spent. Monotonic. */
  readonly teaExecutions: number;
  /** The correlated race world this branch is exploring. */
  readonly race: RaceWorld;
}

export function initialFirstGcdState(race: RaceWorld): AssassinationFirstGcdState {
  return { executedEntries: [], teaExecutions: 0, race };
}

/** The stable identity of one authority entry. Never just its token. */
export function executedEntryKey(entry: ExecutedEntry): string {
  return `${entry.listName}[${String(entry.priorityOrdinal)}]@${String(entry.sourceLine)}:${entry.actionToken}`;
}

export function asPathEntry(entry: ExecutedEntry): TraversalPathEntry {
  return {
    listName: entry.listName,
    priorityOrdinal: entry.priorityOrdinal,
    actionToken: entry.actionToken,
  };
}

/** Whether this exact entry has already fired in this branch. */
export function hasExecuted(state: AssassinationFirstGcdState, entry: ExecutedEntry): boolean {
  const key = executedEntryKey(entry);
  return state.executedEntries.some((executed) => executedEntryKey(executed) === key);
}

/**
 * The state after one hypothetical execution.
 *
 * Thistle Tea is counted rather than disabled, because three charges means three
 * executions. Everything else is recorded once, because everything else starts a
 * cooldown measured in tens of seconds and no simulated time passes.
 */
export function withExecution(
  state: AssassinationFirstGcdState,
  entry: ExecutedEntry,
): AssassinationFirstGcdState {
  const teaExecutions = entry.actionToken === "thistle_tea" ? state.teaExecutions + 1 : state.teaExecutions;
  return {
    executedEntries: hasExecuted(state, entry) ? state.executedEntries : [...state.executedEntries, entry],
    teaExecutions,
    race: state.race,
  };
}

/**
 * A stable, serializable key for cycle detection and memoization.
 *
 * SORTED, so two branches that fired the same entries in different orders share
 * a key and are explored once. That is sound because nothing in this state is
 * order-dependent: each entry either has fired or has not, and Tea's count is a
 * count. An order-dependent state would need the order in the key, and this one
 * would then be wrong rather than merely slow.
 */
export function firstGcdStateKey(state: AssassinationFirstGcdState): string {
  const executed = state.executedEntries.map(executedEntryKey).sort().join(",");
  return `${state.race}|tea=${String(state.teaExecutions)}|[${executed}]`;
}

/**
 * Whether a racial token can exist at all in this race world.
 *
 * `racial_spell_t::init` sets `background = true` when the spell is not found
 * for the actor's race, and `select_action` skips a background action before any
 * readiness check. So in each world at most ONE of the four is a selectable
 * action and the other three are not there at all.
 */
export function racialIsApplicableIn(state: AssassinationFirstGcdState, simcToken: string): boolean {
  return RACIAL_TOKEN_BY_WORLD[state.race] === simcToken;
}

/** Whether Thistle Tea has any hypothetical charge left in this branch. */
export function teaChargesRemain(state: AssassinationFirstGcdState): boolean {
  return state.teaExecutions < MAX_THISTLE_TEA_EXECUTIONS;
}
