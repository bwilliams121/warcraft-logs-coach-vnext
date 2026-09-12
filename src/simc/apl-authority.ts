/**
 * The loaded APL authority: derivations and the list call graph.
 *
 * WHY A CALL GRAPH RATHER THAN "envenom only appears in spend"
 *
 * "Envenom appears only in the spend list" is necessary and nowhere near
 * sufficient. It says nothing about how `spend` is entered. If a second list
 * also called `spend`, or if `spend` were reachable through a chain we did not
 * examine, then proving one call's condition false would prove nothing at all —
 * the action could still be selected by the other path.
 *
 * So reachability is proved over the edges. `proveSoleGateTo` establishes:
 *
 *     the action occurs in exactly one list L, and L is not the entry list
 *     every list reference in the authority resolves to a real list
 *     no unmodelled dispatch construct exists anywhere
 *     L has exactly ONE incoming edge in the whole authority
 *     that edge originates at the entry list
 *     that edge carries a condition
 *
 * Only then is "this condition is false ⇒ the action is unreachable" sound.
 *
 * THE ASYMMETRY THAT MAKES M5-A HONEST
 *
 * A FALSE gate proves unreachability outright: no matter what the higher-
 * priority lines above the gate do, a false condition means the sub-list is
 * never entered, so the action cannot be selected. Nothing above needs to be
 * evaluated.
 *
 * A TRUE gate proves almost nothing. It says the list may be entered; it does
 * not say the APL reaches that line (every earlier line must have declined), and
 * it does not say the action's own conditions hold. That is why this module
 * supports rejection and refuses to express selection.
 *
 * `run_action_list` is treated as unmodelled dispatch and fails closed. It has
 * different control-flow semantics from `call_action_list` (it does not return),
 * and the pinned Assassination APL contains none — so supporting it would be
 * untested code guarding a proof.
 */

import {
  validateAuthorityArtifact,
  type AuthorityArtifact,
  type AuthorityArtifactAction,
} from "./authority-artifact.js";

/** One action, with the fields derived from its verbatim string. */
export interface AplAction {
  readonly listName: string;
  readonly priorityOrdinal: number;
  readonly actionStringVerbatim: string;
  readonly comment: string | null;
  readonly sourceLine: number;
  /** The segment before the first comma. */
  readonly actionToken: string;
  /** The value of the `,if=` parameter, or `null` when the action is unconditional. */
  readonly conditionRaw: string | null;
  /** The `name=` target for `call_action_list` / `run_action_list`, else `null`. */
  readonly callsListName: string | null;
  /** True for `run_action_list`, whose control flow this project does not model. */
  readonly isUnmodelledDispatch: boolean;
}

const CALL_TOKENS = new Set(["call_action_list", "run_action_list"]);
const CONDITION_MARKER = ",if=";

export function deriveActionToken(actionStringVerbatim: string): string {
  const comma = actionStringVerbatim.indexOf(",");
  return comma < 0 ? actionStringVerbatim : actionStringVerbatim.slice(0, comma);
}

/**
 * The `,if=` value, verbatim.
 *
 * Matches `,if=` with its leading comma so `target_if=` cannot be mistaken for
 * it. More than one occurrence is ambiguous and yields `null` rather than an
 * arbitrary pick — an ambiguous condition must not silently become a definite
 * one.
 */
export function deriveConditionRaw(actionStringVerbatim: string): string | null {
  const at = actionStringVerbatim.indexOf(CONDITION_MARKER);
  if (at < 0) return null;
  if (actionStringVerbatim.indexOf(CONDITION_MARKER, at + 1) >= 0) return null;
  return actionStringVerbatim.slice(at + CONDITION_MARKER.length);
}

export function deriveCallsListName(actionStringVerbatim: string): string | null {
  const token = deriveActionToken(actionStringVerbatim);
  if (!CALL_TOKENS.has(token)) return null;
  const match = /(?:^|,)name=([A-Za-z_][A-Za-z0-9_]*)/.exec(actionStringVerbatim);
  return match === null ? null : (match[1] ?? null);
}

function deriveAction(listName: string, action: AuthorityArtifactAction): AplAction {
  const token = deriveActionToken(action.actionStringVerbatim);
  return {
    listName,
    priorityOrdinal: action.priorityOrdinal,
    actionStringVerbatim: action.actionStringVerbatim,
    comment: action.comment,
    sourceLine: action.sourceLine,
    actionToken: token,
    conditionRaw: deriveConditionRaw(action.actionStringVerbatim),
    callsListName: deriveCallsListName(action.actionStringVerbatim),
    isUnmodelledDispatch: token === "run_action_list",
  };
}

export type ReachabilityFailureReason =
  | "ACTION_ABSENT_FROM_AUTHORITY"
  | "ACTION_IN_MULTIPLE_LISTS"
  | "ACTION_IN_ENTRY_LIST"
  | "NO_INCOMING_EDGE"
  | "MULTIPLE_INCOMING_EDGES"
  | "INCOMING_EDGE_NOT_FROM_ENTRY_LIST"
  | "GATE_EDGE_HAS_NO_CONDITION"
  | "UNMODELLED_DISPATCH"
  | "UNKNOWN_LIST_REFERENCE";

export interface AuthorityGate {
  readonly fromListName: string;
  readonly targetListName: string;
  readonly priorityOrdinal: number;
  readonly actionStringVerbatim: string;
  readonly conditionRaw: string;
  readonly sourceLine: number;
}

export type ReachabilityProof =
  | { readonly kind: "PROVEN_SOLE_GATE"; readonly actionToken: string; readonly gate: AuthorityGate }
  | {
      readonly kind: "NOT_PROVABLE";
      readonly actionToken: string;
      readonly reason: ReachabilityFailureReason;
      readonly detail: string;
    };

/**
 * The result of looking up one named list.
 *
 * A discriminated result rather than a possibly-empty array, because the two
 * cases mean opposite things once a caller starts reasoning about what a list
 * selects. An AUTHORITATIVE list holding zero actions selects nothing, exactly
 * — `call_action_list` enters it and returns. A list that is ABSENT from the
 * authority is a hole in our model of it, and no selection conclusion follows
 * at all.
 *
 * Returning `[]` for both would make "the authority says nothing fires here"
 * indistinguishable from "we could not find the list", which is the same class
 * of failure as reading a missing observation as zero.
 */
export type ListLookup =
  | { readonly found: true; readonly listName: string; readonly actions: readonly AplAction[] }
  | { readonly found: false; readonly listName: string };

export interface AplAuthority {
  readonly artifact: AuthorityArtifact;
  readonly actions: readonly AplAction[];
  /** Lists in which an action token appears, in artifact order. */
  listsContainingAction(actionToken: string): readonly string[];
  /**
   * One named list's actions, in ascending `priorityOrdinal`.
   *
   * Priority order is the whole meaning of an APL list, so the sort is explicit
   * here even though the artifact validator already pins ordinals to array
   * indices. An invariant a caller depends on and nobody restates is an
   * invariant a future extractor can break silently.
   */
  actionsInList(listName: string): ListLookup;
  /**
   * Proves that every path to `actionToken` passes through one conditional edge.
   *
   * Any doubt yields NOT_PROVABLE, which the caller must surface as UNKNOWN —
   * never as NO_AUTHORITY_AVAILABLE. The authority exists; our ability to prove
   * a property of it is what fell short.
   */
  proveSoleGateTo(actionToken: string): ReachabilityProof;
}

export type AuthorityLoadResult =
  | { readonly ok: true; readonly authority: AplAuthority }
  | { readonly ok: false; readonly reason: string; readonly detail: string };

export function loadAplAuthority(rawArtifact: unknown): AuthorityLoadResult {
  const validation = validateAuthorityArtifact(rawArtifact);
  if (!validation.ok) {
    return { ok: false, reason: validation.reason, detail: validation.detail };
  }
  const artifact = validation.artifact;

  const actions: AplAction[] = [];
  for (const list of artifact.lists) {
    for (const action of list.actions) {
      actions.push(deriveAction(list.listName, action));
    }
  }
  const listNames = new Set(artifact.lists.map((list) => list.listName));

  function actionsInList(listName: string): ListLookup {
    if (!listNames.has(listName)) {
      return { found: false, listName };
    }
    const inList = actions
      .filter((action) => action.listName === listName)
      .sort((left, right) => left.priorityOrdinal - right.priorityOrdinal);
    return { found: true, listName, actions: inList };
  }

  function listsContainingAction(actionToken: string): readonly string[] {
    const names: string[] = [];
    for (const action of actions) {
      if (action.actionToken === actionToken && !names.includes(action.listName)) {
        names.push(action.listName);
      }
    }
    return names;
  }

  function proveSoleGateTo(actionToken: string): ReachabilityProof {
    const notProvable = (reason: ReachabilityFailureReason, detail: string): ReachabilityProof => ({
      kind: "NOT_PROVABLE",
      actionToken,
      reason,
      detail,
    });

    // Global integrity first. A single unmodelled construct or dangling list
    // reference anywhere invalidates every reachability claim, so these are
    // checked before anything specific to this action.
    for (const action of actions) {
      if (action.isUnmodelledDispatch) {
        return notProvable(
          "UNMODELLED_DISPATCH",
          `${action.listName}[${action.priorityOrdinal}] uses run_action_list, whose control flow is not modelled`,
        );
      }
      if (action.callsListName !== null && !listNames.has(action.callsListName)) {
        return notProvable(
          "UNKNOWN_LIST_REFERENCE",
          `${action.listName}[${action.priorityOrdinal}] calls unknown list '${action.callsListName}'`,
        );
      }
    }

    const containing = listsContainingAction(actionToken);
    if (containing.length === 0) {
      return notProvable("ACTION_ABSENT_FROM_AUTHORITY", `no list contains action '${actionToken}'`);
    }
    if (containing.length > 1) {
      return notProvable("ACTION_IN_MULTIPLE_LISTS", `appears in [${containing.join(", ")}]`);
    }
    const targetListName = containing[0];
    if (targetListName === undefined) {
      return notProvable("ACTION_ABSENT_FROM_AUTHORITY", "unreachable");
    }
    if (targetListName === artifact.entryListName) {
      // Reached without traversing any gate, so no condition governs it.
      return notProvable("ACTION_IN_ENTRY_LIST", `'${actionToken}' sits directly in the entry list`);
    }

    const incoming = actions.filter((action) => action.callsListName === targetListName);
    if (incoming.length === 0) {
      return notProvable("NO_INCOMING_EDGE", `no list calls '${targetListName}'`);
    }
    if (incoming.length > 1) {
      const where = incoming.map((a) => `${a.listName}[${a.priorityOrdinal}]`).join(", ");
      return notProvable("MULTIPLE_INCOMING_EDGES", `'${targetListName}' is called from ${where}`);
    }

    const edge = incoming[0];
    if (edge === undefined) {
      return notProvable("NO_INCOMING_EDGE", "unreachable");
    }
    if (edge.listName !== artifact.entryListName) {
      return notProvable(
        "INCOMING_EDGE_NOT_FROM_ENTRY_LIST",
        `'${targetListName}' is called from '${edge.listName}', not from entry list '${artifact.entryListName}'`,
      );
    }
    if (edge.conditionRaw === null) {
      return notProvable(
        "GATE_EDGE_HAS_NO_CONDITION",
        `the call to '${targetListName}' is unconditional, so no gate governs it`,
      );
    }

    return {
      kind: "PROVEN_SOLE_GATE",
      actionToken,
      gate: {
        fromListName: edge.listName,
        targetListName,
        priorityOrdinal: edge.priorityOrdinal,
        actionStringVerbatim: edge.actionStringVerbatim,
        conditionRaw: edge.conditionRaw,
        sourceLine: edge.sourceLine,
      },
    };
  }

  return {
    ok: true,
    authority: { artifact, actions, listsContainingAction, actionsInList, proveSoleGateTo },
  };
}
