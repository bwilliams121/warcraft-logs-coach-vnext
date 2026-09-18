/**
 * Proving the pinned authority CANNOT select the observed action (M11-A4).
 *
 * THE CLAIM
 *
 *     under the state resolved at this decision, no entry of the pinned
 *     authority — in ANY list — that names the observed token can be
 *     selected by SimulationCraft's scan
 *
 * `select_action` walks a list in order and skips every background entry and
 * every entry whose `if` condition evaluates false; a `call_action_list`
 * enters another list that does the same. Whichever lists control reaches,
 * an entry can only be selected from inside one of them. So if EVERY entry
 * naming the observed token, across every list of the authority, is either
 * background for this player (a proven build fact) or gated by a condition
 * proven FALSE in every enumerated world, the authority would not have
 * pressed this action here, whatever else it would have pressed — and
 * REACHABILITY NEED NOT BE DECIDED: an unreachable list cannot select the
 * entry either. That is a sound rejection that needs no replacement action
 * and no usability proof for any other entry.
 *
 * WHAT MAKES IT SOUND HERE, AND WHAT WOULD BREAK IT
 *
 * The pinned Retribution authority dispatches only through
 * `call_action_list` (the extractor's call-graph facts verify no
 * `run_action_list` and no `swap_action_list`). This module checks that
 * again: any dispatch entry it cannot follow refuses the proof, because a
 * `swap_action_list` would change the meaning of "the lists".
 *
 * ONE VARIABLE, EVALUATED THE SAME WAY EVERYWHERE. `divine_storm`'s single
 * entry is `finishers[2] divine_storm,if=variable.ds_castable`; the value
 * the resolver bound for `variable.ds_castable` is the pinned expression
 * evaluated over the SAME bindings the scan uses, and the assignment
 * (`finishers[0]`) precedes the read in the only list that reads it.
 *
 * WHAT DOES NOT PROVE IT
 *
 *   - an UNCONDITIONAL entry naming the token (`finishers[3]
 *     templars_verdict`): the authority can always select it, so Templar's
 *     Verdict is never rejected by this route
 *   - a condition that is UNKNOWN, UNSUPPORTED, or TRUE in any world
 *   - an entry whose applicability is UNKNOWN
 *   - no entry naming the token at all: the token is outside the authority,
 *     which is a different fact from "the authority rejects it"
 */

import type { AplAuthority } from "../../../simc/apl-authority.js";
import type { AtomBindings } from "../../../simc/expression/evaluate.js";
import { evaluateCondition } from "../../../simc/list-selection.js";
import type { ObservedActionUnselectableProof } from "../../../findings/observed-comparison.js";
import { resolveRetributionApplicability, type RetributionBuildFacts } from "./action-profile.js";

export type UnselectabilityRefusal =
  | "AUTHORITY_HAS_UNMODELLED_DISPATCH"
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
  readonly buildFacts: RetributionBuildFacts;
}): ObservedActionUnselectability {
  const { authority, observedToken, bindings, buildFacts } = input;

  // The structural precondition, re-checked rather than trusted: every
  // dispatch must be a followable `call_action_list`.
  const unmodelled = authority.actions.find(
    (action) =>
      action.isUnmodelledDispatch || (action.entryKind === "LIST_DISPATCH" && action.callsListName === null),
  );
  if (unmodelled !== undefined) {
    return {
      proven: false,
      refusal: "AUTHORITY_HAS_UNMODELLED_DISPATCH",
      at: { listName: unmodelled.listName, priorityOrdinal: unmodelled.priorityOrdinal },
    };
  }

  const naming = authority.actions.filter(
    (action) => action.entryKind === "PLAYER_ACTION" && action.actionToken === observedToken,
  );
  if (naming.length === 0) return { proven: false, refusal: "TOKEN_NOT_IN_AUTHORITY", at: null };

  const entriesProvenFalse: { listName: string; priorityOrdinal: number }[] = [];

  for (const action of naming) {
    const at = { listName: action.listName, priorityOrdinal: action.priorityOrdinal };
    const applicability = resolveRetributionApplicability(buildFacts, action);
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
