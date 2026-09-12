/**
 * Which APL entries are structurally CAPABLE of occupying the player's next
 * rotational GCD slot?
 *
 * THE QUESTION, AND THE MUCH SMALLER QUESTION THIS ACTUALLY ANSWERS
 *
 * This module does not select an action, does not evaluate a condition, and does
 * not read a single combat observation. It answers one structural question per
 * entry, from the pinned APL text plus pinned game data:
 *
 *     if this entry were the one SimulationCraft returned, would executing it
 *     advance `gcd_ready`?
 *
 * That is decidable without any per-decision state, which is exactly why it is
 * worth doing first: it narrows where a later rotational answer can come from
 * without needing readiness proofs for the entries it rules out.
 *
 * WHAT "CANNOT_OCCUPY_ROTATIONAL_SLOT" DOES NOT MEAN
 *
 * It does NOT mean the entry is irrelevant, skippable, or safe to evaluate past.
 * SimulationCraft's foreground scan returns the FIRST ready action and stops,
 * whatever its GCD (`player.cpp:14266`). A zero-GCD entry that is ready still
 * ends that scan and still executes.
 *
 * The concrete case this file exists to keep honest: `thistle_tea` sits at
 * `default[3]`, carries no `use_off_gcd=1`, and is therefore an ordinary
 * foreground entry. When it is ready, the scan returns it and `default[4..8]`
 * are never reached. It executes, it GRANTS ENERGY, `start_gcd()` early-returns
 * because its GCD is zero (`action.cpp:2195`), the actor is scheduled ready
 * again, and a BRAND NEW scan begins from `default[0]` against post-execution
 * state.
 *
 * So the claim licensed here is precisely:
 *
 *     entries 0..3 cannot THEMSELVES occupy the rotational GCD slot
 *
 * and NOT:
 *
 *     entry 4 may be evaluated against the state that preceded entries 0..3
 *
 * Those are different sentences and only the first is proved. A later milestone
 * that evaluates `default[4]` must do so against the state at ITS OWN decision
 * point, which is a different scan.
 *
 * WHY A LIST DISPATCH IS UNKNOWN RATHER THAN INELIGIBLE
 *
 * `call_action_list` is not itself a player action, but the list it calls can
 * return one that consumes the GCD (`player.cpp:14256`). Since this milestone
 * traverses no nested list, a dispatch entry's eligibility is genuinely unknown,
 * and narrowing stops there rather than stepping over it.
 */

import { executionLaneForToken, type ExecutionLane } from "../../../data/game/ability-gcd-semantics.js";
import type { AplAuthority, AplEntryKind } from "../../../simc/apl-authority.js";

/**
 * Whether an entry could occupy the rotational GCD slot.
 *
 * Spelled out in full rather than as `ELIGIBLE`/`INELIGIBLE`, because the short
 * words invite the reading this module's header spends its length refusing.
 */
export type RotationalSlotEligibility =
  "CAN_OCCUPY_ROTATIONAL_SLOT" | "CANNOT_OCCUPY_ROTATIONAL_SLOT" | "UNKNOWN";

export const ROTATIONAL_SLOT_ELIGIBILITIES = [
  "CAN_OCCUPY_ROTATIONAL_SLOT",
  "CANNOT_OCCUPY_ROTATIONAL_SLOT",
  "UNKNOWN",
] as const satisfies readonly RotationalSlotEligibility[];

export interface RotationalSlotEntry {
  readonly priorityOrdinal: number;
  readonly actionToken: string;
  readonly actionStringVerbatim: string;
  readonly sourceLine: number;
  readonly entryKind: AplEntryKind;
  /**
   * The execution lane, for PLAYER_ACTION entries only.
   *
   * `null` for structural entries. A `variable` assignment and a
   * `call_action_list` have no ability behind them, and forcing them through an
   * ability lookup would produce `UNKNOWN_LANE` — which reads as "we could not
   * establish the lane" when the truth is that the question does not apply.
   */
  readonly executionLane: ExecutionLane | null;
  readonly eligibility: RotationalSlotEligibility;
}

/**
 * Why narrowing stopped without reaching an entry that can occupy the slot.
 *
 * - `UNRESOLVED_ELIGIBILITY_ABOVE` — an entry above the first candidate has
 *   unknown eligibility, so no claim about what lies below it is available.
 * - `NO_ELIGIBLE_ENTRY` — every entry was proven unable to occupy the slot. The
 *   list cannot fill the rotational slot at all.
 */
export type NarrowingBlocker = "UNRESOLVED_ELIGIBILITY_ABOVE" | "NO_ELIGIBLE_ENTRY";

export type RotationalSlotNarrowing =
  | {
      readonly kind: "NARROWED";
      readonly listName: string;
      readonly entries: readonly RotationalSlotEntry[];
      /**
       * The first entry that could occupy the rotational GCD slot.
       *
       * Every entry above it is PROVEN unable to — not merely unevaluated.
       */
      readonly firstEligibleOrdinal: number;
      /** The ordinals proven unable to occupy the slot. Exactly `0..firstEligibleOrdinal - 1`. */
      readonly provenIneligibleOrdinals: readonly number[];
    }
  | {
      readonly kind: "NOT_NARROWED";
      readonly listName: string;
      readonly entries: readonly RotationalSlotEntry[];
      readonly blocker: NarrowingBlocker;
      /** The entry responsible, when one can be named. */
      readonly blockedAtOrdinal: number | null;
    }
  | { readonly kind: "LIST_ABSENT"; readonly listName: string };

function eligibilityOf(entryKind: AplEntryKind, lane: ExecutionLane | null): RotationalSlotEligibility {
  switch (entryKind) {
    case "VARIABLE_ASSIGNMENT":
      // Executes and the scan CONTINUES (player.cpp:14238). It is never the
      // action a scan returns, so it can never fill the slot.
      return "CANNOT_OCCUPY_ROTATIONAL_SLOT";
    case "LIST_DISPATCH":
      // Not a player action, but the callee may return one. Unmodelled here.
      return "UNKNOWN";
    case "PLAYER_ACTION":
      if (lane === "GCD_CONSUMING") return "CAN_OCCUPY_ROTATIONAL_SLOT";
      if (lane === "NON_GCD") return "CANNOT_OCCUPY_ROTATIONAL_SLOT";
      return "UNKNOWN";
  }
}

/** Classifies every entry of one named list. Reads no combat state. */
export function classifyListEntries(
  authority: AplAuthority,
  listName: string,
): readonly RotationalSlotEntry[] | null {
  const lookup = authority.actionsInList(listName);
  if (!lookup.found) return null;

  return lookup.actions.map((action) => {
    // Structural entries are not forced through an ability lookup: the lane
    // question does not apply to them, and `null` says that rather than
    // pretending we tried and failed.
    const executionLane =
      action.entryKind === "PLAYER_ACTION" ? executionLaneForToken(action.actionToken) : null;
    return {
      priorityOrdinal: action.priorityOrdinal,
      actionToken: action.actionToken,
      actionStringVerbatim: action.actionStringVerbatim,
      sourceLine: action.sourceLine,
      entryKind: action.entryKind,
      executionLane,
      eligibility: eligibilityOf(action.entryKind, executionLane),
    };
  });
}

/**
 * Narrows a list to the first entry structurally capable of filling the
 * rotational GCD slot.
 *
 * Walks in strict priority order and stops at the first entry that CAN occupy
 * the slot. An `UNKNOWN` entry encountered before that point ends the walk with
 * no claim: the whole value of the result is that everything above the first
 * candidate was PROVEN unable, and one unresolved entry destroys that.
 */
export function narrowToRotationalSlot(authority: AplAuthority, listName: string): RotationalSlotNarrowing {
  const entries = classifyListEntries(authority, listName);
  if (entries === null) return { kind: "LIST_ABSENT", listName };

  const provenIneligibleOrdinals: number[] = [];
  for (const entry of entries) {
    if (entry.eligibility === "CAN_OCCUPY_ROTATIONAL_SLOT") {
      return {
        kind: "NARROWED",
        listName,
        entries,
        firstEligibleOrdinal: entry.priorityOrdinal,
        provenIneligibleOrdinals,
      };
    }
    if (entry.eligibility === "UNKNOWN") {
      return {
        kind: "NOT_NARROWED",
        listName,
        entries,
        blocker: "UNRESOLVED_ELIGIBILITY_ABOVE",
        blockedAtOrdinal: entry.priorityOrdinal,
      };
    }
    provenIneligibleOrdinals.push(entry.priorityOrdinal);
  }

  return {
    kind: "NOT_NARROWED",
    listName,
    entries,
    blocker: "NO_ELIGIBLE_ENTRY",
    blockedAtOrdinal: null,
  };
}
