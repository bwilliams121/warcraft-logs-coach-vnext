/**
 * Proving the pinned authority CANNOT select the observed action (ONB-A1).
 *
 * THE CLAIM: under the state resolved at this decision, no entry of the pinned
 * authority, in ANY list, that names the observed token can be selected by
 * SimulationCraft's scan. `select_action` skips every background entry and every
 * entry whose `if` is false, and a `call_action_list` only enters another list that
 * does the same. So if EVERY entry naming the observed token is background for this
 * player or gated by a condition proven FALSE in every enumerated world, the
 * authority would not have pressed this action here, and reachability need not be
 * decided.
 *
 * WHAT DOES NOT PROVE IT: an unconditional entry, a condition UNKNOWN, UNSUPPORTED
 * or TRUE in any world, an entry whose applicability is UNKNOWN, or no entry naming
 * the token at all.
 */

import type { AplAuthority } from "../../../simc/apl-authority.js";
import type { AtomBindings } from "../../../simc/expression/evaluate.js";
import { evaluateCondition } from "../../../simc/list-selection.js";
import type { ObservedActionUnselectableProof } from "../../../findings/observed-comparison.js";
import { resolveHavocApplicability, type HavocBuildFacts } from "./action-profile.js";

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
      readonly at: { readonly listName: string; readonly priorityOrdinal: number } | null;
    };

export function proveObservedActionUnselectable(input: {
  readonly authority: AplAuthority;
  readonly observedToken: string;
  readonly bindings: AtomBindings;
  readonly buildFacts: HavocBuildFacts;
}): ObservedActionUnselectability {
  const { authority, observedToken, bindings, buildFacts } = input;

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
    const applicability = resolveHavocApplicability(buildFacts, action);
    if (applicability.kind === "UNKNOWN") return { proven: false, refusal: "APPLICABILITY_UNKNOWN", at };
    if (applicability.kind === "NOT_APPLICABLE") {
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
