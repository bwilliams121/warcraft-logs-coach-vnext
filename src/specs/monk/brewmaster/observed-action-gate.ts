/**
 * Proving the pinned authority CANNOT select the observed action (M11-C2).
 *
 * THE CLAIM
 *
 *     under the state resolved at this decision, no entry of the pinned
 *     authority — in ANY list — that names the observed token can be
 *     selected by SimulationCraft's scan
 *
 * `select_action` walks a list in order and skips every background entry and
 * every entry whose `if` condition evaluates false; a `call_action_list`
 * enters another list that does the same, and a `run_action_list` TRANSFERS
 * into another list that does the same. Whichever lists control reaches, an
 * entry can only be selected from inside one of them. So if EVERY entry
 * naming the observed token, across every list of the authority, is either
 * background for this player (a proven build fact) or gated by a condition
 * proven FALSE in every enumerated world, the authority would not have
 * pressed this action here — and REACHABILITY NEED NOT BE DECIDED.
 *
 * The same rule the Blood analyzer applies (M11-B2), in this analyzer's
 * words: a run, like a call, only ever moves control INTO another list of the
 * same authority, so "every entry in every list" still covers every entry
 * control can reach. A dispatch this project cannot follow at all — one whose
 * target name could not be derived — still refuses.
 *
 * WHAT DOES NOT PROVE IT
 *
 *   - an UNCONDITIONAL entry naming the token: the authority can always select
 *     it. Every one of the five supported Brewmaster tokens has one in BOTH
 *     hero lists (`keg_smash`, `breath_of_fire`, `blackout_kick`,
 *     `invoke_niuzao` bare; `tiger_palm` only behind conditions, but also
 *     `tiger_palm,if=energy>…`, whose Energy is unbound), so this proof is
 *     not expected to hold anywhere in the M11-C2 slice. The measurement says
 *     so; nothing here pretends otherwise.
 *   - a condition that is UNKNOWN, UNSUPPORTED, or TRUE in any world
 *   - an entry whose applicability is UNKNOWN
 *   - no entry naming the token at all: the token is outside the authority,
 *     which is a different fact from "the authority rejects it"
 */

import type { AplAuthority } from "../../../simc/apl-authority.js";
import type { AtomBindings } from "../../../simc/expression/evaluate.js";
import { evaluateCondition } from "../../../simc/list-selection.js";
import type { ObservedActionUnselectableProof } from "../../../findings/observed-comparison.js";
import { resolveBrewmasterApplicability, type BrewmasterBuildFacts } from "./action-profile.js";

export type UnselectabilityRefusal =
  | "AUTHORITY_HAS_UNFOLLOWABLE_DISPATCH"
  | "TOKEN_NOT_IN_AUTHORITY"
  | "UNCONDITIONAL_ENTRY"
  | "CONDITION_NOT_PROVEN_FALSE"
  | "APPLICABILITY_UNKNOWN";

export type ObservedActionUnselectability =
  | { readonly proven: true; readonly proof: ObservedActionUnselectableProof }
  | {
      readonly proven: false;
      readonly refusal: UnselectabilityRefusal;
      /** The entry the refusal is about, when one is. */
      readonly at: { readonly listName: string; readonly priorityOrdinal: number } | null;
    };

export function proveObservedActionUnselectable(input: {
  readonly authority: AplAuthority;
  readonly observedToken: string;
  readonly bindings: AtomBindings;
  readonly buildFacts: BrewmasterBuildFacts;
}): ObservedActionUnselectability {
  const { authority, observedToken, bindings, buildFacts } = input;

  // The structural precondition, re-checked rather than trusted: every
  // dispatch — call or run — must name a list this authority holds.
  const unfollowable = authority.actions.find(
    (action) => action.entryKind === "LIST_DISPATCH" && action.callsListName === null,
  );
  if (unfollowable !== undefined) {
    return {
      proven: false,
      refusal: "AUTHORITY_HAS_UNFOLLOWABLE_DISPATCH",
      at: { listName: unfollowable.listName, priorityOrdinal: unfollowable.priorityOrdinal },
    };
  }

  const naming = authority.actions.filter(
    (action) => action.entryKind === "PLAYER_ACTION" && action.actionToken === observedToken,
  );
  if (naming.length === 0) return { proven: false, refusal: "TOKEN_NOT_IN_AUTHORITY", at: null };

  const entriesProvenFalse: { listName: string; priorityOrdinal: number }[] = [];

  for (const action of naming) {
    const at = { listName: action.listName, priorityOrdinal: action.priorityOrdinal };
    const applicability = resolveBrewmasterApplicability(buildFacts, action);
    if (applicability.kind === "UNKNOWN") return { proven: false, refusal: "APPLICABILITY_UNKNOWN", at };
    if (applicability.kind === "NOT_APPLICABLE") {
      // Background (or non-domain) for this player: the scan skips it before its condition.
      entriesProvenFalse.push(at);
      continue;
    }
    if (action.conditionRaw === null) return { proven: false, refusal: "UNCONDITIONAL_ENTRY", at };
    const condition = evaluateCondition(action, bindings);
    if (condition.kind !== "EVALUATED" || condition.truth !== "FALSE") {
      return { proven: false, refusal: "CONDITION_NOT_PROVEN_FALSE", at };
    }
    entriesProvenFalse.push(at);
  }

  return {
    proven: true,
    proof: {
      entriesProvenFalse,
      detail:
        "every pinned entry naming the observed action, in every list of the authority, is either background " +
        "for this player's proven build or gated by a condition FALSE in every enumerated world, so " +
        "select_action could not have returned it at this decision whichever lists control reached",
    },
  };
}
