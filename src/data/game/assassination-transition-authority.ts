/**
 * What each supported NON_GCD action DOES, and why executing it cannot change
 * which GCD-consuming action the pinned authority selects next.
 *
 * WHAT A TRANSITION CLAIM HAS TO CARRY
 *
 * The first-GCD query lets an action fire and then asks the authority again. For
 * that to be sound, four things have to be true of every action it lets fire:
 *
 *     1. LANE          it is NON_GCD, so it is a step and not the answer
 *     2. PROGRESS      it cannot fire again immediately, so the search is finite
 *     3. TIME          it advances no simulated time
 *     4. WRITES        every piece of state it changes is named, and none of the
 *                      named ones is read on the path to the answer
 *
 * `writes: []` IS A CLAIM AND NEEDS EVIDENCE. An empty write set is the most
 * dangerous thing in this file, because it is what licenses "this action does
 * not matter". Every one here is backed by a specific reading, and the reading
 * is recorded next to it.
 *
 * THREE GRADES OF KNOWLEDGE, KEPT APART
 *
 *     MACHINE_EXTRACTED_DBC_RECORD  cooldowns, charges, costs, energize amounts
 *     HAND_REVIEWED_CPP_SEMANTICS   what the C++ does with those numbers
 *     HAND_REVIEWED_CPP_TIMING      the event ordering the Kick proof rests on
 *
 * The first is re-derivable by re-running a parser. The second and third are
 * humans reading C++, recorded with the measured hash of the file they read, so
 * a commit that moves the behaviour fails a contract test rather than silently
 * changing an answer.
 *
 * WHAT IS DELIBERATELY ABSENT
 *
 * Any claim about whether these actions DID fire. This file is about what would
 * happen if they did. Whether actor 19 used a potion is a fact about a historical
 * fight; whether a potion COULD have fired first is a question about the
 * authority, and confusing the two is what this whole milestone is built to
 * avoid.
 */

import { resolveTokenBinding } from "./ability-gcd-semantics.js";

/** Re-derivable by re-running a parser over the pinned generated tables. */
export const DBC_FACT_METHOD = "MACHINE_EXTRACTED_DBC_RECORD";
/** A human read C++. Weaker, and labelled. */
export const CPP_SEMANTICS_METHOD = "HAND_REVIEWED_CPP_SEMANTICS";
/** A human read C++ about EVENT ORDERING, which no table records at all. */
export const CPP_TIMING_METHOD = "HAND_REVIEWED_CPP_TIMING";

export const PINNED_COMMIT_SHA = "33622e9d1662ff0e451691edf85a6b49cc9d11d9";

/** The four pinned files any reading here may cite, with measured hashes. */
export const TRANSITION_SOURCE_HASHES: Readonly<Record<string, string>> = {
  "engine/class_modules/sc_rogue.cpp": "209e95265aae4168cf7cda57d1b241dda6361971ba6849a9262bd933bff3e13e",
  "engine/player/player.cpp": "50a804d0f63d7bffd7b9eeb89a6de054b1767c3202133c765b1b893987940a5c",
  "engine/action/action.cpp": "b04a5f1e942c21ac7db3125f23247d3aecf6fc6701eb6d6c1350f0bb7a762e92",
  "engine/player/consumable.cpp": "1a2ad7ed821bcda3f7b588e0d1e8caf5f8e027f1ad83312886965dca4f6ee941",
  // The generated spell table. Cited by DBC claims, which name a table rather
  // than a line; its hash is already pinned by the GCD artifact this build loads.
  "engine/dbc/generated/sc_spell_data.inc":
    "d8e3d1970520f2161de6d5a59aa5ea0e7c81eaef14c6bc980d5a208ed33b4c62",
};

export type ClaimMethod = typeof DBC_FACT_METHOD | typeof CPP_SEMANTICS_METHOD | typeof CPP_TIMING_METHOD;

export const CLAIM_METHODS = [
  DBC_FACT_METHOD,
  CPP_SEMANTICS_METHOD,
  CPP_TIMING_METHOD,
] as const satisfies readonly ClaimMethod[];

/**
 * One reading, with its grade attached.
 *
 * `sourcePath` and the line range are required for the two C++ grades, where a
 * reader needs to find the code again. A DBC claim cites a generated TABLE
 * rather than a line, so it carries the table name in `sourcePath` and no
 * meaningful range — which the validator checks rather than leaving to habit.
 */
export interface CppClaim {
  readonly claim: string;
  readonly method: ClaimMethod;
  readonly sourcePath: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly finding: string;
}

/**
 * A state atom a transition can write.
 *
 * A CLOSED set on purpose. A transition naming something outside it would be
 * describing a write nobody has checked against the relevant projection, and the
 * validator refuses it.
 */
export type TransitionWrite =
  /** The action's own availability, within the hypothetical prefix only. */
  | "OWN_PREFIX_AVAILABILITY"
  /** Player Energy. */
  | "PLAYER_ENERGY"
  /** A stat aura on the player: agility, haste, versatility, mastery, crit. */
  | "PLAYER_STAT_BUFF"
  /** Harmful effects removed FROM THE PLAYER. Never from the target. */
  | "PLAYER_DEBUFF_REMOVAL"
  /** An expiry scheduled for LATER than this query's terminal. */
  | "DELAYED_STEALTH_EXPIRY"
  /** The target's in-progress cast is interrupted. */
  | "TARGET_CAST_INTERRUPT";

export const TRANSITION_WRITES = [
  "OWN_PREFIX_AVAILABILITY",
  "PLAYER_ENERGY",
  "PLAYER_STAT_BUFF",
  "PLAYER_DEBUFF_REMOVAL",
  "DELAYED_STEALTH_EXPIRY",
  "TARGET_CAST_INTERRUPT",
] as const satisfies readonly TransitionWrite[];

/** How an action stops being selectable within one zero-time prefix. */
export type ProgressMechanism =
  /** An ordinary cooldown far longer than the queueing tolerance. */
  | { readonly kind: "COOLDOWN"; readonly baseCooldownMs: number }
  /** A charge system: finitely many uses, and no recharge at zero elapsed time. */
  | { readonly kind: "CHARGES"; readonly maxCharges: number; readonly chargeCooldownMs: number };

export interface NonGcdTransitionContract {
  readonly simcToken: string;
  /** `spell_data_t::_gcd`. Zero, or this action would be the answer, not a step. */
  readonly baseGcdMs: 0;
  /** MILLISECONDS of simulated time. Only zero is supported anywhere. */
  readonly timeAdvanceMs: 0;
  readonly progress: ProgressMechanism;
  /**
   * Energy spent. NEGATIVE would be a gain; this field is the SPEND, and a
   * non-zero value would have to be subtracted from the Garrote affordability
   * proof rather than waved past it.
   */
  readonly energySpent: number;
  /** Energy granted on execution, before the cap is applied. */
  readonly energyGranted: number;
  /** Named, never defaulted. An empty set is the strongest claim in the file. */
  readonly writes: readonly TransitionWrite[];
  /** Whether executing it runs the Rogue module's stealth-breaking path. */
  readonly breaksStealthImmediately: boolean;
  readonly claims: readonly CppClaim[];
}

// --------------------------------------------------------------------------
// The contracts
// --------------------------------------------------------------------------

const KICK: NonGcdTransitionContract = {
  simcToken: "kick",
  baseGcdMs: 0,
  timeAdvanceMs: 0,
  progress: { kind: "COOLDOWN", baseCooldownMs: 15_000 },
  // NO POWER ROW in the pinned spellpower table. Not "assumed free" — looked up
  // and absent, which is how a cost of zero is established rather than hoped for.
  energySpent: 0,
  energyGranted: 0,
  writes: ["OWN_PREFIX_AVAILABILITY", "TARGET_CAST_INTERRUPT", "DELAYED_STEALTH_EXPIRY"],
  // TRUE, and this is the single most delicate claim in the milestone. See the
  // timing claims below for why it does not change the answer anyway.
  breaksStealthImmediately: true,
  claims: [
    {
      claim: "KICK_IS_A_ROGUE_ACTION_AND_BREAKS_STEALTH",
      method: CPP_SEMANTICS_METHOD,
      sourcePath: "engine/class_modules/sc_rogue.cpp",
      startLine: 2725,
      endLine: 2729,
      finding:
        "rogue_action_t<Base>::execute calls p()->break_stealth() when the actor is stealthed and " +
        "breaks_stealth() holds. kick_t derives from rogue_attack_t (sc_rogue.cpp:4600), so it reaches " +
        "that path, and Kick's DBC row does not carry SX_NO_STEALTH_BREAK.",
    },
    {
      claim: "STEALTH_AND_VANISH_EXPIRE_ONE_MILLISECOND_LATER",
      method: CPP_TIMING_METHOD,
      sourcePath: "engine/class_modules/sc_rogue.cpp",
      startLine: 11_620,
      endLine: 11_647,
      finding:
        "rogue_t::break_stealth expires both buffs with expire( 1_ms ) — stealth at sc_rogue.cpp:11640 " +
        "and vanish at 11645 — with the comment 'Expiry delayed by 1ms in order to have it processed on " +
        "the next tick. This seems to be what the server does.' The expiry is a FUTURE event, not an " +
        "immediate state change.",
    },
    {
      claim: "THE_REPLACEMENT_SCAN_HAPPENS_AT_ZERO_DELAY",
      method: CPP_TIMING_METHOD,
      sourcePath: "engine/action/action.cpp",
      startLine: 289,
      endLine: 294,
      finding:
        "After a non-background, non-channeling action executes, action_execute_event_t::execute calls " +
        "p()->schedule_ready( timespan_t::zero() ) at action.cpp:293.",
    },
    {
      claim: "A_ZERO_GCD_ACTION_ADDS_NO_LAG_TO_THAT_SCAN",
      method: CPP_TIMING_METHOD,
      sourcePath: "engine/player/player.cpp",
      startLine: 6968,
      endLine: 6971,
      finding:
        "schedule_ready takes the branch 'last_foreground_action->gcd() == 0_ms && " +
        "!add_queue_lag' and sets lag = 0_ms (player.cpp:6968-6971). start_gcd() early-returns for a " +
        "zero-GCD action so gcd_ready is untouched and the gcd_adjust term is non-positive. The next " +
        "Player-Ready event therefore fires at delta 0 — the SAME timestamp.",
    },
    {
      claim: "SO_THE_NEXT_SCAN_PRECEDES_THE_EXPIRY",
      method: CPP_TIMING_METHOD,
      sourcePath: "engine/player/player.cpp",
      startLine: 7374,
      endLine: 7379,
      finding:
        "The rescan is at t+0 and the expiry at t+1ms, so the scan that follows a Kick still observes " +
        "the stealth and vanish buffs present. This query TERMINATES at the selection of the first " +
        "GCD-consuming action, which happens at t+0, so the pending expiry is never reached inside it. " +
        "The claim is scoped to zero-elapsed-time queries and must not be generalised.",
    },
  ],
};

const THISTLE_TEA: NonGcdTransitionContract = {
  simcToken: "thistle_tea",
  // ONE reachable record, and establishing that took an effect-table lookup.
  // Both talent branches lead here; see the claim below.
  baseGcdMs: 0,
  timeAdvanceMs: 0,
  progress: { kind: "CHARGES", maxCharges: 3, chargeCooldownMs: 60_000 },
  energySpent: 0,
  energyGranted: 100,
  writes: ["OWN_PREFIX_AVAILABILITY", "PLAYER_ENERGY", "PLAYER_STAT_BUFF"],
  breaksStealthImmediately: false,
  claims: [
    {
      claim: "BOTH_TALENT_BRANCHES_REACH_THE_SAME_RECORD",
      method: CPP_SEMANTICS_METHOD,
      sourcePath: "engine/class_modules/sc_rogue.cpp",
      startLine: 10_237,
      endLine: 10_238,
      finding:
        "spell.thistle_tea = thistle_tea_auto->ok() ? thistle_tea_auto->effectN( 1 ).trigger() : " +
        "( thistle_tea_ability->ok() ? thistle_tea_ability : not_found() ). The generated effect table " +
        "gives spell 469779 effect index 0 a _trigger_spell_id of 381623, so BOTH branches resolve to " +
        "381623 — the record carrying 3 charges and a 60000 ms charge cooldown. This matters: 469779's " +
        "own row has no charges and no cooldown, and binding to it would make the action unboundedly " +
        "repeatable at zero elapsed time.",
    },
    {
      claim: "NEITHER_TALENT_MAKES_THE_ACTION_BACKGROUND",
      method: CPP_SEMANTICS_METHOD,
      sourcePath: "engine/action/action.cpp",
      startLine: 541,
      endLine: 550,
      finding:
        "When neither talent is taken, spell.thistle_tea is not_found() and action_t's constructor sets " +
        "background = true, so the entry is skipped before any readiness check. That world needs no " +
        "transition at all.",
    },
    {
      claim: "NO_RECHARGE_HAPPENS_AT_ZERO_ELAPSED_TIME",
      method: CPP_TIMING_METHOD,
      sourcePath: "engine/player/player.cpp",
      startLine: 6968,
      endLine: 6971,
      finding:
        "A charge returns after 60000 ms of simulated time. Every supported prefix transition advances " +
        "zero, so the three charges are a hard ceiling on executions within one first-GCD query.",
    },
    {
      claim: "IT_DOES_NOT_BREAK_STEALTH",
      method: CPP_SEMANTICS_METHOD,
      sourcePath: "engine/class_modules/sc_rogue.cpp",
      startLine: 1946,
      endLine: 1950,
      finding:
        "rogue_action_t clears _breaks_stealth when the spell carries SX_NO_STEALTH_BREAK (attribute 37, " +
        "_attributes[1] bit 5). Spell 381623's _attributes[1] is 32, so the bit is set and break_stealth " +
        "is never called for it.",
    },
    {
      claim: "IT_GRANTS_ENERGY_AND_NEVER_SPENDS_IT",
      method: CPP_SEMANTICS_METHOD,
      sourcePath: "engine/class_modules/sc_rogue.cpp",
      startLine: 6294,
      endLine: 6295,
      finding:
        "thistle_tea_t sets harmful = false and energize_type = action_energize::ON_CAST. Spell 381623 " +
        "has no row in the generated spellpower table, so it costs nothing, and its effect index 0 is " +
        "type 30 (E_ENERGIZE) with base value 100 and misc value 3 (POWER_ENERGY): +100 Energy.",
    },
  ],
};

const POTION: NonGcdTransitionContract = {
  simcToken: "potion",
  // NO spell id, and that is the point: the pinned default potion is chosen by
  // player level (apl_rogue.cpp:6-15) and Warcraft Logs supplies no level. Every
  // claim below is therefore about the CLASS, so it holds for whichever potion
  // the authority would have picked.
  baseGcdMs: 0,
  timeAdvanceMs: 0,
  // The shared "potion" cooldown. Its exact duration comes from the item effect's
  // cooldown group; the contract needs only that one is started and that it is
  // far longer than the queueing tolerance.
  progress: { kind: "COOLDOWN", baseCooldownMs: 300_000 },
  energySpent: 0,
  energyGranted: 0,
  writes: ["OWN_PREFIX_AVAILABILITY", "PLAYER_STAT_BUFF"],
  breaksStealthImmediately: false,
  claims: [
    {
      claim: "EVERY_POTION_IS_NON_GCD",
      method: CPP_SEMANTICS_METHOD,
      sourcePath: "engine/player/consumable.cpp",
      startLine: 791,
      endLine: 806,
      finding:
        "potion_t (consumable.cpp:428) derives from dbc_consumable_base_t, whose constructor assigns " +
        "trigger_gcd = timespan_t::zero() at consumable.cpp:804. Read off the shared base class, so the " +
        "lane holds for every potion identity and the missing player level cannot matter.",
    },
    {
      claim: "IT_CANNOT_REACH_THE_ROGUE_STEALTH_BREAK_PATH",
      method: CPP_SEMANTICS_METHOD,
      sourcePath: "engine/class_modules/sc_rogue.cpp",
      startLine: 2725,
      endLine: 2729,
      finding:
        "break_stealth() is called from exactly one place: rogue_action_t<Base>::execute. potion_t is an " +
        "action_t, not a rogue_action_t, so that code is unreachable for it regardless of any DBC flag.",
    },
    {
      claim: "IT_NEITHER_SPENDS_NOR_GRANTS_ENERGY",
      method: CPP_SEMANTICS_METHOD,
      sourcePath: "engine/player/consumable.cpp",
      startLine: 838,
      endLine: 852,
      finding:
        "dbc_consumable_base_t::execute runs action_t::execute, then the consumable's own action and " +
        "buff. The base constructor sets harmful = callbacks = may_crit = may_miss = false and targets " +
        "the player; nothing in the path touches a Rogue resource.",
    },
    {
      claim: "IT_STARTS_A_SHARED_NAMED_COOLDOWN",
      method: CPP_SEMANTICS_METHOD,
      sourcePath: "engine/player/consumable.cpp",
      startLine: 428,
      endLine: 500,
      finding:
        'potion_t\'s constructor takes cooldown = player->get_cooldown( "potion" ), and ' +
        "initialize_consumable sets its duration from the item effect's cooldown group, THROWING if no " +
        "cooldown is found. So a potion that exists has a cooldown, and it is measured in minutes " +
        "rather than milliseconds.",
    },
  ],
};

/** The four racials, which differ only in cooldown and in one dispel. */
function racial(
  simcToken: string,
  baseCooldownMs: number,
  extraWrites: readonly TransitionWrite[],
  extraClaims: readonly CppClaim[],
): NonGcdTransitionContract {
  return {
    simcToken,
    baseGcdMs: 0,
    timeAdvanceMs: 0,
    progress: { kind: "COOLDOWN", baseCooldownMs },
    energySpent: 0,
    energyGranted: 0,
    writes: ["OWN_PREFIX_AVAILABILITY", "PLAYER_STAT_BUFF", ...extraWrites],
    breaksStealthImmediately: false,
    claims: [
      {
        claim: "IT_CANNOT_REACH_THE_ROGUE_STEALTH_BREAK_PATH",
        method: CPP_SEMANTICS_METHOD,
        sourcePath: "engine/class_modules/sc_rogue.cpp",
        startLine: 2725,
        endLine: 2729,
        finding:
          "break_stealth() is reachable only from rogue_action_t<Base>::execute. This action is a " +
          "racial_spell_t, which derives from spell_t and not from rogue_action_t, so the Rogue " +
          "stealth-breaking path is unreachable for it. This is established from the CALL GRAPH, not " +
          "from the DBC stealth-break flag — Berserking's flag is clear and it still cannot reach it.",
      },
      {
        claim: "IT_COSTS_NO_RESOURCE",
        method: DBC_FACT_METHOD,
        sourcePath: "engine/dbc/generated/sc_spell_data.inc",
        startLine: 0,
        endLine: 0,
        finding:
          `The spell '${simcToken}' resolves to has no row in the generated spellpower table, so it ` +
          "spends nothing. Looked up and absent, rather than assumed.",
      },
      ...extraClaims,
    ],
  };
}

const FIREBLOOD_DISPEL: CppClaim = {
  claim: "ITS_DISPEL_ACTS_ON_THE_PLAYER_NOT_THE_TARGET",
  method: CPP_SEMANTICS_METHOD,
  sourcePath: "engine/player/player.cpp",
  startLine: 9396,
  endLine: 9415,
  finding:
    "fireblood_t is a racial_spell_t whose buff is a stat_buff_t on the player. Its removal component " +
    "clears harmful effects FROM THE PLAYER. The `debuff.deathmark.up` atom in this APL addresses the " +
    "ENEMY — Deathmark is a debuff actor 19 applied to the target — so no dispel on the player can " +
    "change it. No other atom on the supported path reads a player debuff at all.",
};

/**
 * An equipped on-use item, as a transition (M5-D1).
 *
 * NOT A TRINKET SIMULATOR, and the shape is what keeps it from becoming one.
 * There is no per-item table here: the contract is BUILT from two
 * machine-extracted facts about whichever driver the entry resolves to — its
 * `_gcd` and its effect classification — and a caller that cannot establish
 * both gets no contract at all.
 *
 * `writes` is `PLAYER_STAT_BUFF` and `OWN_PREFIX_AVAILABILITY`, exactly as the
 * potion's is, and for the same reason: the driver's every APPLY_AURA effect is
 * `A_MOD_RATING`, its remaining effects are `E_DUMMY`, and neither appears in
 * `PROJECTION_RELEVANT_WRITES`.
 *
 * The token is the APL token (`use_item` or `use_items`) rather than the item,
 * because that is what the scan names — but the FACTS come from the resolved
 * driver, so two different trinkets never share one claim.
 */
export function itemUseTransition(input: {
  readonly simcToken: string;
  readonly effectSpellId: number;
  readonly baseCooldownMs: number;
}): NonGcdTransitionContract {
  return {
    simcToken: input.simcToken,
    baseGcdMs: 0,
    timeAdvanceMs: 0,
    progress: { kind: "COOLDOWN", baseCooldownMs: input.baseCooldownMs },
    energySpent: 0,
    energyGranted: 0,
    writes: ["OWN_PREFIX_AVAILABILITY", "PLAYER_STAT_BUFF"],
    breaksStealthImmediately: false,
    claims: [
      {
        claim: "IT_CANNOT_REACH_THE_ROGUE_STEALTH_BREAK_PATH",
        method: CPP_SEMANTICS_METHOD,
        sourcePath: "engine/class_modules/sc_rogue.cpp",
        startLine: 2725,
        endLine: 2729,
        finding:
          "break_stealth() is called from exactly one place: rogue_action_t<Base>::execute. use_item_t is an " +
          "action_t, not a rogue_action_t, so that code is unreachable for it regardless of any DBC flag. " +
          "The same argument the potion and racial contracts rest on.",
      },
      {
        claim: "IT_NEITHER_SPENDS_NOR_GRANTS_A_ROGUE_RESOURCE",
        method: CPP_SEMANTICS_METHOD,
        sourcePath: "engine/player/player.cpp",
        startLine: 9874,
        endLine: 10_029,
        finding:
          "use_item_t is constructed from an item's special effect and drives that effect's buff or action. " +
          "It is not a rogue_action_t and has no energize path into a Rogue resource; nothing in " +
          "use_item_t::execute touches Energy or combo points.",
      },
      {
        claim: "ITS_EFFECTS_ARE_STAT_RATINGS_AND_NOTHING_ELSE",
        method: DBC_FACT_METHOD,
        sourcePath: "engine/dbc/generated/sc_spell_data.inc",
        startLine: 0,
        endLine: 0,
        finding:
          `Driver spell ${String(input.effectSpellId)} was admitted only because every APPLY_AURA effect on ` +
          "it is A_MOD_RATING (189) and every remaining effect is E_DUMMY (3), which SimulationCraft " +
          "implements as nothing. The classification is derived by the item-effect extractor from the " +
          "pinned effect table, not typed here; a driver of any other shape is classified OTHER and gets " +
          "no contract.",
      },
      {
        claim: "A_STAT_RATING_CANNOT_MOVE_THE_DECISION_PROJECTION",
        method: CPP_SEMANTICS_METHOD,
        sourcePath: "engine/player/player.cpp",
        startLine: 9874,
        endLine: 10_029,
        finding:
          "Every quantity a stat rating changes — regeneration, tick period, cooldown recovery, future " +
          "snapshots — is a rate over ELAPSED TIME, and this query advances none. PLAYER_STAT_BUFF is " +
          "therefore absent from PROJECTION_RELEVANT_WRITES, and this contract writes nothing else.",
      },
      {
        claim: "IT_STARTS_ITS_OWN_COOLDOWN",
        method: DBC_FACT_METHOD,
        sourcePath: "engine/dbc/generated/sc_spell_data.inc",
        startLine: 0,
        endLine: 0,
        finding:
          `The driver spell's own cooldown is ${String(input.baseCooldownMs)}ms, far longer than the ` +
          "queueing tolerance, so the entry cannot fire twice inside one zero-elapsed-time query.",
      },
    ],
  };
}

export const ASSASSINATION_NON_GCD_TRANSITIONS: readonly NonGcdTransitionContract[] = [
  KICK,
  THISTLE_TEA,
  POTION,
  racial("blood_fury", 120_000, [], []),
  racial("berserking", 180_000, [], []),
  racial("fireblood", 120_000, ["PLAYER_DEBUFF_REMOVAL"], [FIREBLOOD_DISPEL]),
  racial("ancestral_call", 120_000, [], []),
];

/**
 * The spell ids a token resolves to, DERIVED rather than transcribed.
 *
 * The identity numbers live in ONE generated, provenance-bearing artifact. A
 * hand-typed literal here would be a second source of truth with no extraction
 * behind it, and the two could drift without anything noticing. So this reads
 * the same pinned token binding the lane data uses.
 *
 * An empty list is a real answer: `potion` has no spell record at all, which is
 * why its contract is written entirely at the class level.
 */
export function transitionAbilityIdsFor(simcToken: string): readonly number[] {
  const binding = resolveTokenBinding(simcToken);
  if (binding.kind === "KNOWN_ONE") return [binding.abilityGameId];
  if (binding.kind === "KNOWN_SET") return binding.abilityGameIds;
  return [];
}

/** The contract for a token, or `null` when this milestone reviewed none. */
export function transitionContractFor(simcToken: string): NonGcdTransitionContract | null {
  return ASSASSINATION_NON_GCD_TRANSITIONS.find((entry) => entry.simcToken === simcToken) ?? null;
}

/**
 * The state the real decision reads on the way to `core_dot[0]`, and which
 * writes are therefore load-bearing.
 *
 * Derived from the actual authority path rather than from a general analysis:
 * these are the atom keys the traversal's own expression traces report, plus the
 * two readiness facts the scan consults.
 *
 * `PLAYER_STAT_BUFF` is NOT here, and that is a claim rather than an oversight.
 * A stat change moves haste, regeneration and future snapshots — all of which are
 * quantities over ELAPSED TIME, and every supported transition advances none. The
 * one snapshot the path could read, `pmultiplier`, is already UNKNOWN and is not
 * what proves `core_dot[0]`: that comes from `remains <= 14`, the minimum
 * threshold, which no stat can move.
 */
export const GCD_RELEVANT_PROJECTION = [
  "stealthed.rogue",
  "energy.pct",
  "variable.single_target",
  "dot.garrote.ticking",
  "dot.rupture.ticking",
  "dot.garrote.remains",
  "cooldown.kingsbane.remains",
  "buff.envenom.remains",
  "debuff.deathmark.up",
  "buff.bloodlust.react",
  "fight_remains",
  "target.time_to_die",
  "GARROTE_ENERGY_AFFORDABILITY",
] as const;

/** Writes that would land inside the projection above and force re-evaluation. */
export const PROJECTION_RELEVANT_WRITES = [
  "PLAYER_ENERGY",
  "DELAYED_STEALTH_EXPIRY",
] as const satisfies readonly TransitionWrite[];
