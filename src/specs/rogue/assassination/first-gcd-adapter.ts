/**
 * The Assassination adapter for the first-GCD query.
 *
 * WHAT THIS ANSWERS
 *
 *     Starting at the real decision point, and allowing zero or more NON_GCD
 *     foreground actions to fire and be followed by a fresh scan from the ROOT,
 *     which GCD-consuming action does the pinned authority select first?
 *
 * It does NOT answer "what was the next action". Actions may fire before the
 * answer, and the result says what is known about them rather than inventing one
 * sequence.
 *
 * WHY THIS QUERY STARTS AT default[0] AND THE OTHER ONE DOES NOT
 *
 * M5-C1 proved `default[0..3]` cannot OCCUPY the rotational GCD slot, and the
 * rotational-suffix query starts at ordinal 4 on that proof. It remains correct
 * for that question. It would be WRONG here: those entries can still EXECUTE
 * before the slot is filled, and three of them are real foreground actions. So
 * this query starts at the root with nothing skipped, and uses C1's lane data as
 * a STOPPING rule instead of a starting one.
 *
 * THE THREE THINGS THE ADAPTER SUPPLIES
 *
 *     scanFor        one foreground scan, under a hypothetical prefix
 *     laneFor        C3c3a's lane data, per token
 *     transitionFor  what a supported NON_GCD execution does
 *
 * The generic engine owns everything else and learns none of this.
 *
 * THE PREFIX OVERLAY, AND THE LINE IT KEEPS
 *
 * `usabilityFor` consults the HYPOTHETICAL prefix first and the OBSERVED state
 * second. An entry that fired earlier in the branch comes back
 * `PROVEN_UNUSABLE(SIMULATED_PREFIX_EXECUTION)` — a reason that exists only for
 * this, whose evidence says in words that it is counterfactual. It is never
 * reported as `ACTIVE_COOLDOWN`, because a hypothetical cooldown and a derived
 * one are different claims and a reader must be able to tell them apart.
 *
 * RACE IS ONE UNKNOWN, NOT FOUR
 *
 * Warcraft Logs exposes no race. A model with four independent racial booleans
 * would admit a player who is simultaneously an Orc, a Troll, a Dark Iron Dwarf
 * and a Mag'har Orc and can fire four racials. The query therefore runs once per
 * correlated race world and converges the results with the same strict authority
 * identity rule the generic engine uses internally.
 */

import type { AplAction, AplAuthority } from "../../../simc/apl-authority.js";
import {
  firstGcdSelectionAcrossRescans,
  convergeRotationalResults,
  type NonGcdTransitionOutcome,
  type RotationalGcdResult,
  type SelectedNonGcdAction,
} from "../../../simc/first-gcd-selection.js";
import {
  resolveOneForegroundScan,
  type OneForegroundScanResult,
  type TraversalStep,
} from "../../../simc/nested-selection.js";
import {
  applicable,
  notApplicable,
  provenUnusable,
  type ActionApplicability,
  type ActionUsabilityVerdict,
} from "../../../simc/action-applicability.js";
import type { AuthorityPlayerProfile } from "../../../simc/authority-profile.js";
import { executionLaneForToken, type ExecutionLane } from "../../../data/game/ability-gcd-semantics.js";
import {
  itemUseTransition,
  transitionContractFor,
} from "../../../data/game/assassination-transition-authority.js";
import { resolveItemGateIrrelevance } from "./item-gate-irrelevance.js";
import { itemEffectForItemId, itemEffectForToken } from "../../../data/game/rogue-item-effects.js";
import { slotOccupancy } from "../../../simc/authority-profile.js";
import { tryAbilityIdentityFor } from "../../../data/game/rogue-abilities.js";
import type { CombatState } from "../../../engine/state/combat-state.js";
import type { AtomBindings } from "../../../simc/expression/evaluate.js";
import { resolveApplicability, resolveUsability } from "./action-profile.js";
import {
  RACE_WORLDS,
  RACIAL_TOKENS,
  asPathEntry,
  firstGcdStateKey,
  hasExecuted,
  initialFirstGcdState,
  racialIsApplicableIn,
  teaChargesRemain,
  withExecution,
  type AssassinationFirstGcdState,
  type ExecutedEntry,
  type RaceWorld,
} from "./first-gcd-state.js";

/** The list this query begins in. The ROOT, with nothing skipped. */
export const FIRST_GCD_ROOT_LIST = "default";

export interface FirstGcdQueryInput {
  readonly state: CombatState;
  readonly actorId: number;
  /** Canonical index of the decision point. */
  readonly position: number;
  readonly authority: AplAuthority;
  readonly profile: AuthorityPlayerProfile;
  /** The bindings the real decision evaluates against, built by the caller. */
  readonly bindings: AtomBindings;
  /** The spell id observed cast here. Positive usability evidence only. */
  readonly observedAbilityGameId: number;
  /**
   * The enemy the decision is about (M5-D1).
   *
   * OPTIONAL. Supplied, it lets `default[0] stealth` be proven unusable outside
   * stealth; omitted, that entry stays an unresolved candidate exactly as it was
   * before M5-D1.
   */
  readonly engagementTargetActorId?: number;
  /**
   * The race worlds to explore.
   *
   * Defaults to ALL of them, which is what an unknown race requires. A profile
   * that ever establishes a race passes the one world instead — so this is not
   * hard-coded to "actor 19 has no race", it is driven by what is known.
   */
  readonly raceWorlds?: readonly RaceWorld[];
}

/** One race world's answer, kept so a reader can see the query really branched. */
export interface RaceWorldResult {
  readonly race: RaceWorld;
  readonly result: RotationalGcdResult;
}

export interface FirstGcdQueryOutcome {
  /** The converged answer across every explored race world. */
  readonly result: RotationalGcdResult;
  readonly perRaceWorld: readonly RaceWorldResult[];
}

function entryOf(step: TraversalStep): ExecutedEntry {
  return {
    listName: step.listName,
    priorityOrdinal: step.priorityOrdinal,
    actionToken: step.actionToken,
    sourceLine: step.sourceLine,
  };
}

function entryOfAction(action: AplAction): ExecutedEntry {
  return {
    listName: action.listName,
    priorityOrdinal: action.priorityOrdinal,
    actionToken: action.actionToken,
    sourceLine: action.sourceLine,
  };
}

const abilityIdFor = (token: string): number | null => tryAbilityIdentityFor(token)?.spellId ?? null;

/**
 * Runs the first-GCD query across every supported race world.
 *
 * Returns one structured outcome. Every branch is explored; none is truncated,
 * and no world is dropped for being inconvenient.
 */
export function firstGcdSelectionAt(input: FirstGcdQueryInput): FirstGcdQueryOutcome {
  const worlds = input.raceWorlds ?? RACE_WORLDS;

  const perRaceWorld = worlds.map((race) => ({
    race,
    result: runOneRaceWorld(input, race),
  }));

  return {
    // THE SAME convergence rule the engine uses inside a world, applied across
    // worlds. Reusing it is what stops two subtly different notions of "the same
    // selection" from existing in one codebase.
    result: convergeRotationalResults(perRaceWorld.map((entry) => entry.result)),
    perRaceWorld,
  };
}

/**
 * The transition contract for an equipped on-use item entry, or `null`.
 *
 * Built from the resolved driver rather than looked up by token, so two
 * different trinkets never share one claim. Returns `null` — and therefore
 * refuses the branch — for any driver the gate-irrelevance rule would also have
 * refused, so the two cannot disagree about which entries are steppable.
 */
function itemContractFor(
  observed: AuthorityPlayerProfile["observed"],
  action: SelectedNonGcdAction,
): ReturnType<typeof itemUseTransition> | null {
  const verbatim = action.step.actionStringVerbatim;
  const named = (key: string): string | null =>
    new RegExp(`(?:^|,)${key}=([A-Za-z0-9_]+)`).exec(verbatim)?.[1] ?? null;

  let onUse = null;
  if (action.actionToken === "use_item") {
    const token = named("name");
    onUse = token === null ? null : (itemEffectForToken(token)?.onUseEffect ?? null);
  } else if (action.actionToken === "use_items") {
    const slot = named("slots");
    const occupancy = slot === null ? null : slotOccupancy(observed, slot);
    onUse =
      occupancy?.state === "OCCUPIED"
        ? (itemEffectForItemId(occupancy.item.itemId)?.onUseEffect ?? null)
        : null;
  }
  if (onUse === null) return null;
  // The SAME four gates the irrelevance rule applies. Stated again rather than
  // shared, because a contract that admitted an entry the irrelevance rule
  // refused would let an unreviewed driver execute in an explored branch.
  if (onUse.baseGcdMs !== 0) return null;
  if (onUse.writeClassification !== "PLAYER_STAT_BUFF_ONLY") return null;
  if (!(onUse.baseCooldownMs > 0)) return null;

  return itemUseTransition({
    simcToken: action.actionToken,
    effectSpellId: onUse.effectSpellId,
    baseCooldownMs: onUse.baseCooldownMs,
  });
}

function runOneRaceWorld(input: FirstGcdQueryInput, race: RaceWorld): RotationalGcdResult {
  const profileInput = {
    state: input.state,
    actorId: input.actorId,
    position: input.position,
    profile: input.profile,
    // The enemy the decision is about, so M5-D1's in-combat stealth proof has a
    // target to look for this player's debuff on. Optional on the query input:
    // without it `default[0]` stays UNKNOWN rather than being claimed unusable.
    ...(input.engagementTargetActorId === undefined
      ? {}
      : { engagementTargetActorId: input.engagementTargetActorId }),
  };

  /**
   * Applicability under one race world.
   *
   * The racials are the only entries this adds to C3c2's answer, and they are
   * added as a `background` claim rather than a readiness one: in the wrong race
   * world the spell is not found, the action is background, and the scan skips
   * it before asking anything else.
   */
  const applicabilityFor = (state: AssassinationFirstGcdState, action: AplAction): ActionApplicability => {
    if ((RACIAL_TOKENS as readonly string[]).includes(action.actionToken)) {
      if (racialIsApplicableIn(state, action.actionToken)) return applicable();
      return notApplicable("RACIAL_NOT_AVAILABLE_TO_RACE", {
        itemId: null,
        slot: null,
        pinnedBehaviour:
          `find_racial_spell returned not_found() for a ${state.race} player, so racial_spell_t::init ` +
          "set background = true (player.cpp:8995-9001) and select_action skips it before any " +
          "readiness check",
      });
    }
    return resolveApplicability(profileInput, action);
  };

  /**
   * Usability under one race world and one hypothetical prefix.
   *
   * HYPOTHETICAL FIRST, OBSERVED SECOND, and the two never share a reason.
   */
  const usabilityFor = (state: AssassinationFirstGcdState, action: AplAction): ActionUsabilityVerdict => {
    const entry = entryOfAction(action);

    // Thistle Tea is COUNTED, not disabled: three charges means three
    // executions, and firing it once does not spend them all. No simulated time
    // passes, so no charge comes back.
    if (action.actionToken === "thistle_tea") {
      if (teaChargesRemain(state))
        return resolveUsability(profileInput, action, input.observedAbilityGameId, abilityIdFor);
      return provenUnusable("SIMULATED_PREFIX_EXECUTION", {
        abilityGameId: null,
        itemId: null,
        provenRemainingAtLeastMs: null,
        cooldownToleranceMs: null,
        detail:
          "HYPOTHETICAL, not observed: in this explored branch all three Thistle Tea charges have " +
          "already been spent, and its 60000 ms charge cooldown returns none of them at zero elapsed " +
          "time. This says nothing about what the player actually did.",
      });
    }

    if (hasExecuted(state, entry)) {
      return provenUnusable("SIMULATED_PREFIX_EXECUTION", {
        abilityGameId: null,
        itemId: null,
        provenRemainingAtLeastMs: null,
        cooldownToleranceMs: null,
        detail:
          "HYPOTHETICAL, not observed: in this explored branch this authority entry has already been " +
          "selected once, and the cooldown it started is far longer than the queueing tolerance. This " +
          "says nothing about what the player actually did.",
      });
    }

    return resolveUsability(profileInput, action, input.observedAbilityGameId, abilityIdFor);
  };

  const scanFor = (state: AssassinationFirstGcdState): OneForegroundScanResult =>
    resolveOneForegroundScan({
      authority: input.authority,
      // THE ROOT, and no start boundary: nothing is skipped for this query.
      entryListName: FIRST_GCD_ROOT_LIST,
      bindings: input.bindings,
      usabilityFor: (action) => usabilityFor(state, action),
      applicabilityFor: (action) => applicabilityFor(state, action),
      // M5-D1. The ONLY claim that an unreadable condition can be stepped past,
      // and it is confined to equipped on-use items whose driver is provably
      // inert. Everything else keeps blocking.
      gateIrrelevanceFor: (action) =>
        resolveItemGateIrrelevance({ observed: input.profile.observed }, action),
    });

  const laneFor = (step: TraversalStep): ExecutionLane => executionLaneForToken(step.actionToken);

  /**
   * What a supported NON_GCD execution does.
   *
   * FAILS CLOSED. A selectable NON_GCD action with no reviewed contract returns
   * UNSUPPORTED and the branch refuses, rather than being skipped as though it
   * had done nothing.
   */
  const transitionFor = (
    action: SelectedNonGcdAction,
    state: AssassinationFirstGcdState,
  ): NonGcdTransitionOutcome<AssassinationFirstGcdState> => {
    const contract =
      transitionContractFor(action.actionToken) ?? itemContractFor(input.profile.observed, action);
    if (contract === null) {
      return {
        kind: "UNSUPPORTED",
        detail:
          `no reviewed transition contract exists for '${action.actionToken}', so what executing it ` +
          "would change is not established and the branch cannot continue",
      };
    }

    const entry = entryOf(action.step);
    const nextState = withExecution(state, entry);
    return {
      kind: "APPLIED",
      nextState,
      // Pinned at zero by the contract. A contract that ever reports otherwise
      // is refused by the engine rather than applied here.
      timeAdvanceMs: contract.timeAdvanceMs,
      evidence: {
        kind: `HYPOTHETICAL_PREFIX_EXECUTION:${contract.simcToken}`,
        provenance: "src/data/game/assassination-transition-authority.ts",
        stateKeyBefore: firstGcdStateKey(state),
        stateKeyAfter: firstGcdStateKey(nextState),
      },
    };
  };

  return firstGcdSelectionAcrossRescans<AssassinationFirstGcdState>({
    rootListName: FIRST_GCD_ROOT_LIST,
    initialState: initialFirstGcdState(race),
    stateKey: firstGcdStateKey,
    scanFor,
    laneFor,
    transitionFor,
  });
}

/** The possible NON_GCD prefix, as authority coordinates. Never a sequence. */
export function prefixEntriesOf(outcome: FirstGcdQueryOutcome): readonly string[] {
  if (outcome.result.kind !== "ROTATIONAL_GCD_SELECTED") return [];
  return outcome.result.nonGcdPrefix.possibleActions.map(
    (entry) => `${entry.listName}[${String(entry.priorityOrdinal)}] ${entry.actionToken}`,
  );
}

/** Re-exported so a caller need not reach into the state module for the type. */
export type { AssassinationFirstGcdState, ExecutedEntry, RaceWorld };
export { asPathEntry };
