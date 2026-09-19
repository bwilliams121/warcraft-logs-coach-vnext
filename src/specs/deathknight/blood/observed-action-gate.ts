/**
 * Proving the pinned authority CANNOT select the observed action (M11-B2).
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
 * into another list that does the same (M11-B1). Whichever lists control
 * reaches, an entry can only be selected from inside one of them. So if
 * EVERY entry naming the observed token, across every list of the
 * authority, is either background for this player (a proven build fact) or
 * gated by a condition proven FALSE in every enumerated world, the authority
 * would not have pressed this action here — and REACHABILITY NEED NOT BE
 * DECIDED: an unreachable list cannot select the entry either.
 *
 * WHAT MAKES IT SOUND HERE, AND WHAT WOULD BREAK IT
 *
 * The M11-A4 Paladin proof refuses any authority carrying `run_action_list`,
 * because before M11-B1 nothing modelled it. This proof does NOT: a run,
 * like a call, only ever moves control INTO another list of the same
 * authority, so "every entry in every list" still covers every entry
 * control can reach. What WOULD break the claim is a dispatch this project
 * cannot follow at all — a `swap_action_list`, or a dispatch whose target
 * name could not be derived — because it would change the meaning of "the
 * lists". Those still refuse.
 *
 * WHAT THIS PROOF DOES NOT DO, ON PURPOSE. It does not exclude a list whose
 * only entry gate is proven FALSE (the `deathbringer` list for a San'layn
 * build). That refinement would be sound under the B1 semantics and would
 * shrink the set of entries the proof must defeat; it is recorded as a
 * measured stopping point (`observed-analysis.ts`) rather than built, so
 * the M11-B2 numbers reflect the shared machinery as it stands.
 *
 * WHAT DOES NOT PROVE IT
 *
 *   - an UNCONDITIONAL entry naming the token (`deathbringer[6] death_strike`,
 *     `deathbringer[7] blood_boil`, `deathbringer[9] heart_strike`,
 *     `sanlayn[12..14]`): the authority can always select it — and since
 *     every supported Blood token has one, this proof never holds for the
 *     M11-B2 slice. The measurement says so; nothing here pretends otherwise.
 *   - a condition that is UNKNOWN, UNSUPPORTED, or TRUE in any world
 *   - an entry whose applicability is UNKNOWN
 *   - no entry naming the token at all: the token is outside the authority,
 *     which is a different fact from "the authority rejects it"
 */

import type { AplAuthority } from "../../../simc/apl-authority.js";
import type { AtomBindings } from "../../../simc/expression/evaluate.js";
import { evaluateCondition } from "../../../simc/list-selection.js";
import type { ObservedActionUnselectableProof } from "../../../findings/observed-comparison.js";
import { resolveBloodApplicability, type BloodBuildFacts } from "./action-profile.js";

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
  readonly buildFacts: BloodBuildFacts;
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
    const applicability = resolveBloodApplicability(buildFacts, action);
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
