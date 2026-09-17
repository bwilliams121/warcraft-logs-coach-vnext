/**
 * Proving the pinned authority CANNOT select the observed action (M10-C).
 *
 * THE CLAIM
 *
 *     under the state resolved at this decision, no entry of the pinned list
 *     that names the observed token can be selected by SimulationCraft's scan
 *
 * `select_action` walks the list in order and skips every entry whose `if`
 * condition evaluates false and every background entry before it. So if
 * EVERY entry naming the observed token is either background for this player
 * (a proven build fact) or gated by a condition proven FALSE in every
 * enumerated world, the authority would not have pressed this action here,
 * whatever else it would have pressed. That is a sound rejection that needs
 * no replacement action and no usability proof for any other entry — the
 * same shape as M5-A's Envenom rejection, over a flat list.
 *
 * WHAT MAKES IT SOUND HERE, AND WHAT WOULD BREAK IT
 *
 * The pinned Protection list has NO list dispatch (a structural fact the
 * extractor verified), so the entries in `default` are the only ways the
 * token can be reached. This module checks that again and refuses the proof
 * if any dispatch entry exists, rather than trusting the extractor's note.
 *
 * WHAT DOES NOT PROVE IT
 *
 *   - an UNCONDITIONAL entry naming the token: the authority can always
 *     select it, so nothing is proven
 *   - a condition that is UNKNOWN, UNSUPPORTED, or TRUE in any world
 *   - an entry whose applicability is UNKNOWN: there is a world in which it
 *     exists and could fire
 *   - no entry naming the token at all: the token is outside the authority,
 *     which is a different fact from "the authority rejects it"
 *
 * This is the ONLY route to a REJECTED comparison for Protection at M10-C.
 * `AUTHORITY_SELECTED_DIFFERENT_TOKEN` needs a competing entry PROVEN usable,
 * and the only usability proof this build holds is the observed execution of
 * the observed action itself. That boundary is the same one M5 recorded as
 * `USABILITY_NOT_PROVEN`, and it is stated rather than worked around.
 */

import type { AplAuthority } from "../../../simc/apl-authority.js";
import type { AtomBindings } from "../../../simc/expression/evaluate.js";
import { evaluateCondition } from "../../../simc/list-selection.js";
import type { ObservedActionUnselectableProof } from "../../../findings/observed-comparison.js";
import { resolveProtectionApplicability, type ProtectionBuildFacts } from "./action-profile.js";
import { initialProtectionState } from "./first-gcd-state.js";

export type UnselectabilityRefusal =
  | "AUTHORITY_HAS_LIST_DISPATCH"
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
  readonly buildFacts: ProtectionBuildFacts;
}): ObservedActionUnselectability {
  const { authority, observedToken, bindings, buildFacts } = input;

  // The structural precondition, re-checked rather than trusted.
  const dispatch = authority.actions.find((action) => action.entryKind === "LIST_DISPATCH");
  if (dispatch !== undefined) {
    return {
      proven: false,
      refusal: "AUTHORITY_HAS_LIST_DISPATCH",
      at: { listName: dispatch.listName, priorityOrdinal: dispatch.priorityOrdinal },
    };
  }

  const naming = authority.actions.filter(
    (action) => action.entryKind === "PLAYER_ACTION" && action.actionToken === observedToken,
  );
  if (naming.length === 0) return { proven: false, refusal: "TOKEN_NOT_IN_AUTHORITY", at: null };

  // Racials are never observed tokens here (both are NON_GCD and excluded
  // upstream), so the race world cannot decide an applicability below; the
  // neutral world is passed to keep the rule total.
  const neutral = initialProtectionState("OTHER");
  const entriesProvenFalse: { listName: string; priorityOrdinal: number }[] = [];

  for (const action of naming) {
    const at = { listName: action.listName, priorityOrdinal: action.priorityOrdinal };
    const applicability = resolveProtectionApplicability(buildFacts, neutral, action);
    if (applicability.kind === "UNKNOWN") return { proven: false, refusal: "APPLICABILITY_UNKNOWN", at };
    if (applicability.kind === "NOT_APPLICABLE") {
      // Background for this player: the scan skips it before its condition.
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
        "every pinned entry naming the observed action is either background for this player's proven " +
        "build or gated by a condition FALSE in every enumerated world, so select_action could not have " +
        "returned it at this decision",
    },
  };
}
