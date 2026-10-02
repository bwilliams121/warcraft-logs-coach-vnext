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
 *     forgottenAtoms     the OBSERVED bindings a hypothetical write has
 *                        invalidated in this branch (M11-D3-0).
 *
 * HYPOTHETICAL WRITES INVALIDATE OBSERVED BINDINGS; NOTHING REPLACES THEM
 *
 * An observed binding that a hypothetical write invalidates cannot be reused
 * in that branch unless the transition itself proves the replacement state.
 * `ATOMS_INVALIDATED_BY_WRITE` records, per declared write, which bindings it
 * invalidates; a write that invalidates none says why the bindings stay proven.
 *
 * The caller binds `energy.pct` from the decision cast's exact PRE_COST
 * snapshot, which describes the REAL decision instant. A transition whose
 * reviewed contract declares `PLAYER_ENERGY` (Thistle Tea's grant) changes
 * Energy without establishing the new value, so the branch that executed it
 * FORGETS the binding: every later scan in that branch reads `energy.pct` as
 * not established. Its siblings keep the observed value. Driven by the
 * contract's declared write, never by the token.
 *
 * There is still no Energy field, deliberately. A post-transition Energy value
 * is not inferred from anything — not the grant, not a cap, not regeneration —
 * because nothing observed establishes it.
 */

import type { TransitionWrite } from "../../../data/game/assassination-transition-authority.js";
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
  /** Observed bindings a hypothetical write invalidated in THIS branch. Monotonic, sorted. */
  readonly forgottenAtoms: readonly ForgettableAtom[];
}

/** The observed bindings a declared hypothetical write can invalidate (M11-D3-0). */
export type ForgettableAtom = "energy.pct";

/**
 * Which observed bindings each declared write invalidates (M11-D3-0).
 *
 * EXHAUSTIVE over `TransitionWrite`: a new write kind does not compile until
 * someone decides what it invalidates. An EMPTY list is a reviewed claim —
 * "every binding the caller supplies stays proven under this write's reviewed
 * semantics" — never "this write was not modelled". The bindings in question
 * are the ones `rotationalBindingsAt` supplies: combo points and deficit,
 * `energy.pct`, per-action DoT remains and refreshable, the derived cooldowns
 * (kingsbane, deathmark, vanish), and a positive-only `stealthed.rogue`.
 */
export const ATOMS_INVALIDATED_BY_WRITE: Readonly<Record<TransitionWrite, readonly ForgettableAtom[]>> =
  Object.freeze({
    // Re-selection of the executed entry is already refused by
    // SIMULATED_PREFIX_EXECUTION, and no transition token has a bound cooldown.
    OWN_PREFIX_AVAILABILITY: [],
    // The grant changes Energy and observes nothing: the PRE_COST value is stale.
    PLAYER_ENERGY: ["energy.pct"],
    // No buff is bound (`knownBuffs` is empty), `pmultiplier` is not modelled,
    // regeneration is never bound, and no simulated time elapses.
    PLAYER_STAT_BUFF: [],
    // No player-debuff atom read by this query is bound; `debuff.deathmark.up`
    // addresses the target.
    PLAYER_DEBUFF_REMOVAL: [],
    // PROVEN UNCHANGED, not overlooked: the pinned Kick contract times the
    // stealth and vanish expiry at t+1ms, every rescan and the selected GCD at
    // t+0, and the engine refuses any non-zero time advance — so a bound
    // `stealthed.rogue` holds at every scan of the query.
    DELAYED_STEALTH_EXPIRY: [],
    // No target-cast atom read by the authority is bound.
    TARGET_CAST_INTERRUPT: [],
  } satisfies Record<TransitionWrite, readonly ForgettableAtom[]>);

export function initialFirstGcdState(race: RaceWorld): AssassinationFirstGcdState {
  return { executedEntries: [], teaExecutions: 0, race, forgottenAtoms: [] };
}

/**
 * The state after a transition with these declared writes: every binding they
 * invalidate is forgotten, and nothing already forgotten comes back. Returns
 * the SAME state when nothing new is forgotten.
 */
export function withTransitionWrites(
  state: AssassinationFirstGcdState,
  writes: readonly TransitionWrite[],
): AssassinationFirstGcdState {
  const added = writes
    .flatMap((write) => ATOMS_INVALIDATED_BY_WRITE[write])
    .filter((atom, index, all) => !state.forgottenAtoms.includes(atom) && all.indexOf(atom) === index);
  return added.length === 0
    ? state
    : { ...state, forgottenAtoms: [...state.forgottenAtoms, ...added].sort() };
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
    forgottenAtoms: state.forgottenAtoms,
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
 *
 * Forgotten bindings are part of the state, so they are part of the key — but
 * only when there are any, which leaves every branch that forgot nothing keyed
 * exactly as before M11-D3-0.
 */
export function firstGcdStateKey(state: AssassinationFirstGcdState): string {
  const executed = state.executedEntries.map(executedEntryKey).sort().join(",");
  const forgotten = state.forgottenAtoms.length === 0 ? "" : `|forgot=[${state.forgottenAtoms.join(",")}]`;
  return `${state.race}|tea=${String(state.teaExecutions)}${forgotten}|[${executed}]`;
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
