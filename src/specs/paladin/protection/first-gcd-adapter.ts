/**
 * The Protection Paladin adapter for the shared first-GCD query (M10-C).
 *
 * WHAT THIS ANSWERS
 *
 *     Starting at the real decision point, and allowing zero or more NON_GCD
 *     foreground actions to fire and be followed by a fresh scan from the ROOT,
 *     which GCD-consuming action does the pinned Protection authority select
 *     first?
 *
 * THE SAME THREE THINGS THE ASSASSINATION ADAPTER SUPPLIES, and nothing more:
 *
 *     scanFor        one foreground scan under a hypothetical prefix, with the
 *                    Protection vocabulary and the Protection resolver's
 *                    bindings, the Protection applicability rules and the two
 *                    usability proofs
 *     laneFor        the pinned Protection lane data, per token
 *     transitionFor  the reviewed NON_GCD contracts (`auto_attack`,
 *                    `potion`, `fireblood`, `avenging_wrath`, and `use_items`
 *                    / `use_item` for the one reviewed on-use driver when the
 *                    sub-action set is CLOSED); every other NON_GCD entry
 *                    refuses its branch
 *
 * The generic engine owns everything else and learns none of this. It does
 * not know this adapter is a Paladin's; the Rogue engine tests still pass
 * against it unchanged.
 *
 * ONE CONTRACT WRITES ATOMS THE LIST READS, AND THE BINDINGS SAY SO. Wings
 * (`avenging_wrath`, under either record) turns `buff.avenging_wrath.up`
 * TRUE and starts a 120 s cooldown. In a branch where wings has fired the
 * scan therefore runs against the caller's bindings OVERLAID with exactly
 * those two facts — the buff up, the cooldown bounded BELOW by the base
 * (never an exact figure: SimulationCraft adds sampled lag on start). Every
 * other contract writes only stat buffs, which no pinned atom reads, and
 * overlays nothing. The overlay is keyed off the prefix state, so the same
 * scan under a wings-free prefix sees the real bindings untouched.
 *
 * THE OBSERVED CAST IS NEVER AN ORACLE FOR AN EARLIER ENTRY. The query
 * reads the observed ability only as positive usability evidence for the
 * observed action itself; whether `use_items`, `potion` or wings was
 * selectable at this position is decided by contracts and pinned facts, or
 * not at all.
 *
 * RACE IS ONE UNKNOWN, NOT TWO. The pinned APL names two racials; the query
 * runs once per correlated race world and converges with the engine's own
 * rule, so a world where the player is both a Dark Iron Dwarf and a Blood
 * Elf cannot be explored.
 */

import type { AplAction, AplAuthority } from "../../../simc/apl-authority.js";
import {
  convergeRotationalResults,
  firstGcdSelectionAcrossRescans,
  type NonGcdTransitionOutcome,
  type RotationalGcdResult,
  type SelectedNonGcdAction,
} from "../../../simc/first-gcd-selection.js";
import {
  resolveOneForegroundScan,
  type OneForegroundScanResult,
  type TraversalStep,
} from "../../../simc/nested-selection.js";
import type { ActionApplicability, ActionUsabilityVerdict } from "../../../simc/action-applicability.js";
import { boundedBelowNumber, type AtomBindings } from "../../../simc/expression/evaluate.js";
import type { ExecutionLane } from "../../../data/game/gcd-semantics-index.js";
import { protectionExecutionLaneForToken } from "../../../data/game/paladin-protection-gcd-semantics.js";
import {
  protectionItemUseContractFor,
  protectionTransitionContractFor,
  type ProtectionNonGcdTransitionContract,
} from "../../../data/game/paladin-protection-transition-authority.js";
import {
  AVENGING_WRATH_TOKEN,
  NO_READINESS_FACTS,
  UNKNOWN_SPENDER_FACTS,
  USE_ITEM_TOKEN,
  USE_ITEMS_TOKEN,
  resolveProtectionApplicability,
  resolveProtectionUsability,
  wornSubActionSet,
  type ProtectionBuildFacts,
  type ProtectionReadinessFact,
  type ProtectionSpenderFacts,
} from "./action-profile.js";
import { specAtomValueFor } from "../../../simc/expression/spec-vocabulary.js";
import { protectionItemEffectForToken } from "../../../data/game/paladin-protection-item-effects.js";
import { isEmptyGearSlot } from "../../../engine/normalization/combatant-info.js";
import {
  initialProtectionState,
  protectionStateKey,
  withExecution,
  PROTECTION_RACE_WORLDS,
  type ExecutedEntry,
  type ProtectionFirstGcdState,
  type ProtectionRaceWorld,
} from "./first-gcd-state.js";

/** The list this query begins in. The ROOT, with nothing skipped. */
export const PROTECTION_FIRST_GCD_ROOT_LIST = "default";

export interface ProtectionFirstGcdQueryInput {
  readonly authority: AplAuthority;
  /** The bindings the real decision evaluates against, built by the caller. */
  readonly bindings: AtomBindings;
  readonly buildFacts: ProtectionBuildFacts;
  /** The spell id observed cast here. Positive usability evidence only. */
  readonly observedAbilityGameId: number;
  /** What is known about Holy Power spending at this decision. Defaults to nothing. */
  readonly spender?: ProtectionSpenderFacts;
  /** What is known about cooldown readiness at this decision. Defaults to nothing. */
  readonly readiness?: readonly ProtectionReadinessFact[];
  /**
   * The LOWER BOUND, in milliseconds, of the wings cooldown a hypothetical
   * wings execution starts for THIS actor — the pinned base after the actor's
   * censused static modifiers (cooldown-bindings.ts). `null` when it could not
   * be established, in which case the overlay binds the buff and leaves the
   * cooldown atom unbound. Defaults to null: the overlay never assumes the
   * unmodified DBC base.
   */
  readonly wingsCooldownLowerBoundMs?: number | null;
  /** Defaults to every race world, which is what an unknown race requires. */
  readonly raceWorlds?: readonly ProtectionRaceWorld[];
}

export interface ProtectionRaceWorldResult {
  readonly race: ProtectionRaceWorld;
  readonly result: RotationalGcdResult;
}

export interface ProtectionFirstGcdQueryOutcome {
  /** The converged answer across every explored race world. */
  readonly result: RotationalGcdResult;
  readonly perRaceWorld: readonly ProtectionRaceWorldResult[];
}

function entryOf(step: TraversalStep): ExecutedEntry {
  return {
    listName: step.listName,
    priorityOrdinal: step.priorityOrdinal,
    actionToken: step.actionToken,
    sourceLine: step.sourceLine,
  };
}

/** The SimulationCraft name both wings records answer `buff.avenging_wrath` / `cooldown.avenging_wrath` under. */
export const WINGS_ATOM_NAME = "avenging_wrath";

/** Whether an entry with this token has fired in the prefix, whatever its ordinal. */
export function hasExecutedToken(state: ProtectionFirstGcdState, actionToken: string): boolean {
  return state.executedEntries.some((entry) => entry.actionToken === actionToken);
}

/**
 * The caller's bindings, overlaid with what a fired wings wrote.
 *
 * Only two atoms change, and only because the WINGS_BUFF_AND_COOLDOWN
 * contract says they do: the buff is up, and the cooldown is at least the
 * actor's effective base — `cooldownLowerBoundMs`, the pinned DBC base after
 * the actor's censused static modifiers (Righteous Protector halves it), which
 * the CALLER establishes and which is NEVER defaulted to the unmodified base.
 * When it is `null` the cooldown atom is left as the caller bound it (or
 * unbound). A caller-supplied entry for the same name is otherwise REPLACED,
 * because the hypothetical execution is later than any observation the
 * caller derived from. Nothing else is touched.
 */
export function overlayWings(bindings: AtomBindings, cooldownLowerBoundMs: number | null): AtomBindings {
  const remains = (bindings.knownCooldownRemainsSeconds ?? []).filter(
    (cooldown) => cooldown.name !== WINGS_ATOM_NAME,
  );
  return {
    ...bindings,
    knownBuffs: [
      ...bindings.knownBuffs.filter((buff) => buff.name !== WINGS_ATOM_NAME),
      { name: WINGS_ATOM_NAME, up: true },
    ],
    knownCooldownRemainsSeconds:
      cooldownLowerBoundMs === null
        ? remains
        : [
            ...remains,
            {
              name: WINGS_ATOM_NAME,
              remainsSeconds: boundedBelowNumber(cooldownLowerBoundMs / 1000, "STATE_NOT_ESTABLISHED"),
            },
          ],
  };
}

/** `name=` parameter, read from the verbatim action string. */
function namedParameter(actionStringVerbatim: string, key: string): string | null {
  const match = new RegExp(`(?:^|,)${key}=([A-Za-z0-9_]+)`).exec(actionStringVerbatim);
  return match?.[1] ?? null;
}

/**
 * The contract for a selected NON_GCD entry, or the reason there is none.
 *
 * Items are the one place the contract depends on the PLAYER, not just the
 * token: `use_items` fires whichever sub-action is ready, so its contract is
 * admitted only when the sub-action set is closed to exactly one reviewed
 * driver. Anything open — an unpinned item, an enchant or gem the log did not
 * report — refuses, naming the first open slot.
 */
export function protectionContractForSelected(
  action: SelectedNonGcdAction,
  buildFacts: ProtectionBuildFacts,
  bindings?: AtomBindings,
): { readonly contract: ProtectionNonGcdTransitionContract } | { readonly refusal: string } {
  const resolved = protectionContractForSelectedToken(action, buildFacts);
  if ("refusal" in resolved) return resolved;
  // UNBOUND_ATOMS_MAY_CHANGE is admissible only while every named atom is
  // unbound: a bound atom this contract changes without an overlay would be
  // a value the branch carries forward wrongly.
  const bound = (bindings === undefined ? [] : (resolved.contract.requiresUnbound ?? [])).filter((atom) =>
    atom.kind === "BUFF"
      ? bindings?.knownBuffs.some((buff) => buff.name === atom.name)
      : (() => {
          const value = specAtomValueFor(bindings?.specAtoms, atom.name, null);
          return value !== undefined && (value.kind === "TRUTH" || value.binding.state !== "UNKNOWN_NUMBER");
        })(),
  );
  if (bound.length > 0) {
    return {
      refusal:
        `'${action.actionToken}' changes ${bound.map((atom) => atom.name).join(", ")} in a way the evidence ` +
        "cannot pin, and the caller has bound that atom; the contract is admissible only while it is unbound",
    };
  }
  return resolved;
}

function protectionContractForSelectedToken(
  action: SelectedNonGcdAction,
  buildFacts: ProtectionBuildFacts,
): { readonly contract: ProtectionNonGcdTransitionContract } | { readonly refusal: string } {
  if (action.actionToken === USE_ITEMS_TOKEN) {
    if (namedParameter(action.step.actionStringVerbatim, "slots") !== null) {
      return { refusal: "use_items with a slots= parameter has no reviewed Protection contract" };
    }
    const worn = wornSubActionSet(
      buildFacts.wornGear,
      buildFacts.divineInspiration,
      buildFacts.malformedGearRows,
    );
    const first = worn.open[0];
    if (first !== undefined) {
      return {
        refusal:
          `the use_items sub-action set is not closed: slot ${String(first.slotIndex)} ${first.reason} ` +
          `(${first.detail})` +
          (worn.open.length > 1 ? ` and ${String(worn.open.length - 1)} more` : "") +
          ", so which sub-action would fire, and what it would write, is not established",
      };
    }
    const only = worn.onUse.length === 1 ? worn.onUse[0] : undefined;
    if (only?.onUseEffect === undefined || only.onUseEffect === null) {
      return {
        refusal:
          `the use_items sub-action set holds ${String(worn.onUse.length)} on-use item(s); a contract is ` +
          "admitted only for exactly one reviewed driver",
      };
    }
    const contract = protectionItemUseContractFor(USE_ITEMS_TOKEN, only.onUseEffect);
    if (contract === null) {
      return {
        refusal:
          `the worn on-use item ${String(only.itemId)} (driver ${String(only.onUseEffect.effectSpellId)}) ` +
          "has no reviewed Protection contract",
      };
    }
    return { contract };
  }

  if (action.actionToken === USE_ITEM_TOKEN) {
    const token = namedParameter(action.step.actionStringVerbatim, "name");
    const identity = token === null ? null : protectionItemEffectForToken(token);
    const worn =
      identity !== null &&
      buildFacts.wornGear.some((piece) => !isEmptyGearSlot(piece) && piece.itemId === identity.itemId);
    if (identity === null || !worn || identity.onUseEffect === null) {
      return {
        refusal:
          `use_item,name=${token ?? "<none>"} names no pinned, worn, on-use item, so what executing it ` +
          "would change is not established",
      };
    }
    const contract = protectionItemUseContractFor(USE_ITEM_TOKEN, identity.onUseEffect);
    if (contract === null) {
      return { refusal: `the named item ${String(identity.itemId)} has no reviewed Protection contract` };
    }
    return { contract };
  }

  const contract = protectionTransitionContractFor(action.actionToken);
  if (contract === null) {
    return {
      refusal:
        `no reviewed transition contract exists for '${action.actionToken}', so what executing it ` +
        "would change is not established and the branch cannot continue",
    };
  }
  return { contract };
}

/** Runs the first-GCD query across every supported race world and converges. */
export function protectionFirstGcdSelectionAt(
  input: ProtectionFirstGcdQueryInput,
): ProtectionFirstGcdQueryOutcome {
  const worlds = input.raceWorlds ?? PROTECTION_RACE_WORLDS;
  const perRaceWorld = worlds.map((race) => ({ race, result: runOneRaceWorld(input, race) }));
  return {
    result: convergeRotationalResults(perRaceWorld.map((entry) => entry.result)),
    perRaceWorld,
  };
}

function runOneRaceWorld(
  input: ProtectionFirstGcdQueryInput,
  race: ProtectionRaceWorld,
): RotationalGcdResult {
  const applicabilityFor = (state: ProtectionFirstGcdState, action: AplAction): ActionApplicability =>
    resolveProtectionApplicability(input.buildFacts, state, action);

  const usabilityFor = (state: ProtectionFirstGcdState, action: AplAction): ActionUsabilityVerdict =>
    resolveProtectionUsability(
      state,
      action,
      input.observedAbilityGameId,
      input.spender ?? UNKNOWN_SPENDER_FACTS,
      input.readiness ?? NO_READINESS_FACTS,
    );

  const bindingsFor = (state: ProtectionFirstGcdState): AtomBindings =>
    hasExecutedToken(state, AVENGING_WRATH_TOKEN)
      ? overlayWings(input.bindings, input.wingsCooldownLowerBoundMs ?? null)
      : input.bindings;

  const scanFor = (state: ProtectionFirstGcdState): OneForegroundScanResult =>
    resolveOneForegroundScan({
      authority: input.authority,
      entryListName: PROTECTION_FIRST_GCD_ROOT_LIST,
      bindings: bindingsFor(state),
      usabilityFor: (action) => usabilityFor(state, action),
      applicabilityFor: (action) => applicabilityFor(state, action),
      // No gate irrelevance: no Protection entry's unreadable condition may be
      // stepped past. Every conditional line of the pinned list parses under the
      // Protection vocabulary, so there is no unreadable gate to step past; the
      // item entries are handled by applicability and by contract, not by
      // declaring their gates irrelevant.
    });

  const laneFor = (step: TraversalStep): ExecutionLane => protectionExecutionLaneForToken(step.actionToken);

  /**
   * What a supported NON_GCD execution does. FAILS CLOSED: a selectable
   * NON_GCD action with no reviewed contract refuses the branch.
   */
  const transitionFor = (
    action: SelectedNonGcdAction,
    state: ProtectionFirstGcdState,
  ): NonGcdTransitionOutcome<ProtectionFirstGcdState> => {
    const resolved = protectionContractForSelected(action, input.buildFacts, bindingsFor(state));
    if ("refusal" in resolved) return { kind: "UNSUPPORTED", detail: resolved.refusal };
    const { contract } = resolved;
    const nextState = withExecution(state, entryOf(action.step));
    return {
      kind: "APPLIED",
      nextState,
      timeAdvanceMs: contract.timeAdvanceMs,
      evidence: {
        kind: `HYPOTHETICAL_PREFIX_EXECUTION:${contract.simcToken}`,
        provenance: "src/data/game/paladin-protection-transition-authority.ts",
        stateKeyBefore: protectionStateKey(state),
        stateKeyAfter: protectionStateKey(nextState),
      },
    };
  };

  return firstGcdSelectionAcrossRescans<ProtectionFirstGcdState>({
    rootListName: PROTECTION_FIRST_GCD_ROOT_LIST,
    initialState: initialProtectionState(race),
    stateKey: protectionStateKey,
    scanFor,
    laneFor,
    transitionFor,
  });
}
