/**
 * SCOPED selection within the pinned `core_dot` sub-list.
 *
 * THE CLAIM, STATED AS NARROWLY AS IT IS PROVED
 *
 *     within the authoritative `core_dot` sub-list, at this decision point,
 *     the pinned SimulationCraft APL selects Garrote.
 *
 * WHAT IT IS NOT. Every disclaimer M5-B attached to a `spend` selection applies
 * here unchanged, and one more besides:
 *
 *   - NOT a global verdict. `default[0]` stealth and `default[1]` kick sit above
 *     the `core_dot` call and are unconditional with action readiness and
 *     interruptibility unmodelled. No amount of `core_dot` resolution reaches
 *     past them.
 *   - NOT a claim that `cds` selects nothing. `cds` is a different list with its
 *     own entries, four of which are outside the supported subset. This module
 *     does not evaluate it and does not conclude anything about it.
 *   - NOT a literal `default -> cds -> core_dot` traversal. There is no nested
 *     traversal here at all; see below.
 *   - NOT a statement that the player played correctly.
 *
 * WHY THERE IS NO TRAVERSAL
 *
 * The walk enters `core_dot` DIRECTLY and evaluates only its own entries. That
 * is the same scoped shape M5-B used for `spend`, and it is deliberate:
 * modelling `call_action_list` control flow across lists is a separate
 * capability that would have to handle fall-through, re-entry and
 * `run_action_list`'s different semantics. Doing it implicitly here — to make
 * the result look more global than it is — is exactly the overclaim the scoped
 * vocabulary exists to prevent.
 *
 * WHY THE ENTRY GATE IS DIFFERENT FROM M5-B's, AND WHAT THAT COST
 *
 * `spend` is entered through `call_action_list,name=spend,if=combo_points>=5` —
 * a CONDITION, which M5-B evaluates and carries as an `ExpressionTrace` proving
 * entry. `core_dot` is entered through `default[6]`, which is
 * `call_action_list,name=core_dot` with NO `if=` at all.
 *
 * An unconditional gate is a STRONGER fact than a condition proven true, and it
 * has no expression to trace. `ScopedActionSelection` requires
 * `gateTrace: ExpressionTrace` on every exact outcome, so this module cannot
 * produce one without either fabricating a trace for an expression that does not
 * exist or widening an M5-B contract mid-milestone. It does neither: it returns
 * its own result carrying `EntryProof`, and reuses M5-B's `DecisionScope`,
 * `SelectedAction`, `ScopedSelectionStatus` and `ScopedSelectionBlocker`
 * vocabulary verbatim so the two can be unified without re-deciding anything.
 *
 * WHAT ACTUALLY DECIDES THE LINE
 *
 * `core_dot[0]` is:
 *
 *     (buff.improved_garrote.up|stealthed.rogue)
 *     &(pmultiplier<=1|remains<=14+6*talent.razor_wire+4*!variable.single_target)
 *
 * Three of its atoms are never resolved, and the answer is exact anyway:
 *
 *     buff.improved_garrote.up   UNRESOLVED -> enumerated
 *     talent.razor_wire          UNRESOLVED -> enumerated
 *     variable.single_target     UNRESOLVED -> enumerated
 *     pmultiplier                UNKNOWN NUMBER, never enumerated, never needed
 *     stealthed.rogue            KNOWN TRUE  (M5-C2, from the Vanish buff)
 *     remains                    KNOWN       (M5-C3a, derived from evidence)
 *
 * The left conjunct is TRUE because `stealthed.rogue` is proven TRUE, whatever
 * the Improved Garrote buff was doing. The right conjunct is TRUE because the
 * threshold `14+6*razor_wire+4*!single_target` has a MINIMUM of 14 across all
 * four talent/variable worlds, and the derived `remains` is below it — so
 * `remains<=threshold` holds in every world and `pmultiplier` never has to be
 * known. Eight worlds, all TRUE, `INVARIANT_ACROSS_WORLDS`.
 *
 * That convergence is the whole reason C3a is answerable. It is not a general
 * capability to evaluate `core_dot`: entries 1 through 4 remain unparseable, and
 * the walk simply never reaches them because entry 0 definitely fires.
 */

import type { AplAction, AplAuthority } from "../../../simc/apl-authority.js";
import type { AuthorityRef, ResolvedAuthority } from "../../../findings/authority.js";
import type {
  DecisionScope,
  ScopedSelectionBlocker,
  SelectedAction,
} from "../../../findings/scoped-selection.js";
import { selectWithinList, type ActionUsability, type LineEvaluation } from "../../../simc/list-selection.js";
import { knownNumber, unknownNumber, type AtomBindings } from "../../../simc/expression/evaluate.js";
import { tryAbilityIdentityFor } from "../../../data/game/rogue-abilities.js";
import type { CombatState } from "../../../engine/state/combat-state.js";
import type { EvidenceLocator } from "../../../engine/evidence/locator.js";
import { bindGarroteRemains, type GarroteRemainsBinding } from "./garrote-dot-state.js";
import { bindStealthedRogue, type StealthedRogueBinding } from "./stealth-state.js";

/** The list this module selects within. One name, not a parameter. */
export const CORE_DOT_LIST_NAME = "core_dot";

/**
 * Proof that the sub-list was entered.
 *
 * `UNCONDITIONAL` is the stronger member: the pinned call carries no `if=`, so
 * entry needs no state at all. The verbatim action string travels with it so the
 * claim can be re-checked against the pinned text rather than trusted.
 *
 * A `CONDITION_PROVEN_TRUE` member is deliberately ABSENT rather than stubbed.
 * This module handles one list, that list is entered unconditionally, and a
 * member nothing can construct would be a place for a future caller to put a
 * trace nobody validated.
 */
export interface EntryProof {
  readonly kind: "UNCONDITIONAL";
  readonly gate: AuthorityRef;
  /** The pinned call string, verbatim. Must contain no `if=`. */
  readonly actionStringVerbatim: string;
}

export interface CoreDotSelectionInput {
  readonly state: CombatState;
  /** The acting player. */
  readonly actorId: number;
  /** The enemy the DoT is on, and the decision's target. */
  readonly targetActorId: number;
  readonly targetInstance?: number | null;
  /** Canonical index of the decision point Q. */
  readonly position: number;
  /** The spell id observed cast at Q, used only for usability. Never for the verdict. */
  readonly observedAbilityGameId: number;
  readonly authority: AplAuthority | null;
  /** Talent selections already resolved by the caller. Unknown talents are omitted. */
  readonly knownTalents: readonly { readonly name: string; readonly taken: boolean }[];
}

/** The state this selection rests on, kept so a finding can show its work. */
export interface CoreDotSelectionState {
  readonly stealthedRogue: StealthedRogueBinding;
  readonly garroteRemains: GarroteRemainsBinding;
}

export type CoreDotSelection =
  | {
      readonly kind: "CORE_DOT_SELECTION";
      readonly status: "SELECTED_BY_AUTHORITY";
      readonly scope: DecisionScope;
      readonly entryProof: EntryProof;
      readonly selectedAction: SelectedAction;
      readonly selectingLine: AuthorityRef;
      readonly convergedOver: readonly AuthorityRef[];
      readonly authority: ResolvedAuthority;
      readonly lines: readonly LineEvaluation[];
      readonly derivedState: CoreDotSelectionState;
      readonly stateEvidence: readonly EvidenceLocator[];
    }
  | {
      readonly kind: "CORE_DOT_SELECTION";
      readonly status: "NO_ACTION_SELECTED";
      readonly scope: DecisionScope;
      readonly entryProof: EntryProof;
      readonly authority: ResolvedAuthority;
      readonly lines: readonly LineEvaluation[];
      readonly derivedState: CoreDotSelectionState;
      readonly stateEvidence: readonly EvidenceLocator[];
    }
  | {
      readonly kind: "CORE_DOT_SELECTION";
      readonly status: "UNKNOWN";
      readonly blocker: ScopedSelectionBlocker;
      readonly scope: DecisionScope | null;
      readonly entryProof: EntryProof | null;
      readonly blockedBy: AuthorityRef | null;
      readonly authority: ResolvedAuthority | null;
      readonly lines: readonly LineEvaluation[];
      readonly derivedState: CoreDotSelectionState | null;
      readonly stateEvidence: readonly EvidenceLocator[];
      /** Safe, author-written detail. Never interpolated from upstream data. */
      readonly detail: string;
    }
  | {
      readonly kind: "CORE_DOT_SELECTION";
      readonly status: "NO_AUTHORITY_AVAILABLE";
      readonly reason: "NO_PINNED_AUTHORITY_FOR_SPEC";
      readonly detail: string;
    };

function refFrom(
  authority: AplAuthority,
  line: {
    readonly listName: string;
    readonly priorityOrdinal: number;
    readonly actionStringVerbatim: string;
    readonly sourceLine: number;
  },
): AuthorityRef {
  const { artifact } = authority;
  return {
    kind: "SIMC_APL",
    authorityId: artifact.authorityId,
    artifactRevision: artifact.artifactRevision,
    listName: line.listName,
    priorityOrdinal: line.priorityOrdinal,
    actionStringVerbatim: line.actionStringVerbatim,
    sourceLine: line.sourceLine,
  };
}

function resolvedAuthorityFrom(authority: AplAuthority, gateRef: AuthorityRef): ResolvedAuthority {
  const { provenance } = authority.artifact;
  return {
    ref: gateRef,
    provenance: {
      repository: provenance.repository,
      commitSha: provenance.commitSha,
      commitDate: provenance.commitDate,
      sourcePath: provenance.sourcePath,
      sourceSha256: provenance.sourceSha256,
      extractedOn: provenance.extractedOn,
    },
  };
}

/**
 * Finds the UNCONDITIONAL `call_action_list` that enters `core_dot`.
 *
 * Requires exactly one such call with a `null` condition. Two would mean entry
 * depends on which path ran, and a conditional one would mean this module's
 * entry proof does not apply — both are refusals rather than a pick, because
 * picking would silently make the claim rest on a gate nobody checked.
 */
function findUnconditionalEntry(
  authority: AplAuthority,
): { readonly ok: true; readonly proof: EntryProof } | { readonly ok: false; readonly detail: string } {
  const callers = authority.actions.filter((action) => action.callsListName === CORE_DOT_LIST_NAME);
  if (callers.length === 0) {
    return { ok: false, detail: `no action calls the '${CORE_DOT_LIST_NAME}' list` };
  }
  // `run_action_list` does not fall through the way `call_action_list` does, so
  // an entry proof written for one does not describe the other.
  if (callers.some((action) => action.isUnmodelledDispatch)) {
    return {
      ok: false,
      detail: `the '${CORE_DOT_LIST_NAME}' list is entered by run_action_list, whose control flow this project does not model`,
    };
  }
  if (callers.length > 1) {
    return {
      ok: false,
      detail: `the '${CORE_DOT_LIST_NAME}' list is called from more than one line, so entry is not established by any single one`,
    };
  }
  const caller = callers[0];
  if (caller === undefined) return { ok: false, detail: "the call site could not be read" };
  if (caller.conditionRaw !== null) {
    return {
      ok: false,
      detail: `the '${CORE_DOT_LIST_NAME}' call carries a condition, which this module does not evaluate`,
    };
  }
  return {
    ok: true,
    proof: {
      kind: "UNCONDITIONAL",
      gate: refFrom(authority, {
        listName: caller.listName,
        priorityOrdinal: caller.priorityOrdinal,
        actionStringVerbatim: caller.actionStringVerbatim,
        sourceLine: caller.sourceLine,
      }),
      actionStringVerbatim: caller.actionStringVerbatim,
    },
  };
}

/**
 * Produces exactly one scoped selection for one decision point within `core_dot`.
 *
 * Never returns nothing. Every decision point gets an explicit structured
 * result, because a silently skipped point is indistinguishable from one that
 * was fine.
 */
export function selectCoreDotActionAt(input: CoreDotSelectionInput): CoreDotSelection {
  const { state, actorId, targetActorId, position, authority } = input;

  if (authority === null) {
    return {
      kind: "CORE_DOT_SELECTION",
      status: "NO_AUTHORITY_AVAILABLE",
      reason: "NO_PINNED_AUTHORITY_FOR_SPEC",
      detail: "no pinned SimulationCraft APL is available for this specialization",
    };
  }

  const entry = findUnconditionalEntry(authority);
  if (!entry.ok) {
    return {
      kind: "CORE_DOT_SELECTION",
      status: "UNKNOWN",
      blocker: "ACTION_REACHABILITY_NOT_PROVABLE",
      scope: null,
      entryProof: null,
      blockedBy: null,
      authority: null,
      lines: [],
      derivedState: null,
      stateEvidence: [],
      detail: entry.detail,
    };
  }

  const resolved = resolvedAuthorityFrom(authority, entry.proof.gate);
  const scope: DecisionScope = {
    kind: "APL_SUBLIST",
    listName: CORE_DOT_LIST_NAME,
    entryGate: entry.proof.gate,
  };

  // ---- the two derived facts this list's first entry needs ----

  const stealthedRogue = bindStealthedRogue({ state, actorId, position });
  const garroteRemains = bindGarroteRemains({
    state,
    actorId,
    targetActorId,
    targetInstance: input.targetInstance ?? null,
    position,
  });
  const derivedState: CoreDotSelectionState = { stealthedRogue, garroteRemains };

  const stateEvidence: EvidenceLocator[] = [];
  if (stealthedRogue.value === "TRUE") stateEvidence.push(stealthedRogue.provenBy.locator);
  if (garroteRemains.state === "KNOWN") stateEvidence.push(garroteRemains.anchor.locator);

  // ---- bindings: only what is POSITIVELY established ----
  //
  // An unbound BOOLEAN atom becomes an enumerated world, not `false`. An unknown
  // NUMERIC atom becomes UNKNOWN_NUMBER and is never enumerated. Both are stated
  // rather than omitted.
  const bindings: AtomBindings = {
    // `core_dot[0]` names no resource atom, and this module establishes none.
    // Stated unknown rather than given a placeholder: until M5-C3b these were a
    // literal zero, justified by being unreachable. `core_dot[1]` DOES read
    // `combo_points.deficit`, so "unreachable" rested on that line staying
    // refused at the parser — which is a guarantee about a neighbouring line
    // rather than about this value, and is not the kind of thing a magnitude
    // should depend on.
    comboPoints: unknownNumber("STATE_NOT_ESTABLISHED"),
    comboPointsDeficit: unknownNumber("STATE_NOT_ESTABLISHED"),
    energyPct: unknownNumber("STATE_NOT_ESTABLISHED"),
    dotRemainsSeconds:
      garroteRemains.state === "KNOWN"
        ? knownNumber(garroteRemains.remainsSeconds)
        : unknownNumber("STATE_NOT_ESTABLISHED"),
    knownBuffs: [],
    knownTalents: input.knownTalents,
    // Positive-only. A stealth binding that is not TRUE is left OUT entirely, so
    // the atom is enumerated rather than bound to a `false` nobody proved.
    ...(stealthedRogue.value === "TRUE" ? { stealthedRogue: true as const } : {}),
  };

  // ---- the ordered walk, within this list only ----

  const usabilityFor = (action: AplAction): ActionUsability => {
    const identity = tryAbilityIdentityFor(action.actionToken);
    if (identity === null) return "UNKNOWN";
    // Numeric identity, matched against the observed cast at THIS position. A
    // token string is never compared to an ability name.
    return identity.spellId === input.observedAbilityGameId ? "PROVEN_USABLE" : "UNKNOWN";
  };

  const selection = selectWithinList(authority, CORE_DOT_LIST_NAME, bindings, usabilityFor);

  if (selection.kind === "LIST_ABSENT") {
    return {
      kind: "CORE_DOT_SELECTION",
      status: "UNKNOWN",
      blocker: "ACTION_REACHABILITY_NOT_PROVABLE",
      scope,
      entryProof: entry.proof,
      blockedBy: entry.proof.gate,
      authority: resolved,
      lines: [],
      derivedState,
      stateEvidence,
      detail: `the pinned authority has no '${CORE_DOT_LIST_NAME}' list to walk`,
    };
  }

  if (selection.kind === "INDETERMINATE") {
    return {
      kind: "CORE_DOT_SELECTION",
      status: "UNKNOWN",
      blocker: selection.blocker,
      scope,
      entryProof: entry.proof,
      blockedBy: selection.blockedBy === null ? null : refFrom(authority, selection.blockedBy),
      authority: resolved,
      lines: selection.lines,
      derivedState,
      stateEvidence,
      detail: "the ordered walk within the sub-list did not reach a definite winner",
    };
  }

  if (selection.kind === "NO_ACTION_SELECTED") {
    return {
      kind: "CORE_DOT_SELECTION",
      status: "NO_ACTION_SELECTED",
      scope,
      entryProof: entry.proof,
      authority: resolved,
      lines: selection.lines,
      derivedState,
      stateEvidence,
    };
  }

  // The authority answered. We still have to be able to NAME what it named: a
  // token string is not an ability identity, and reporting one as though it were
  // would put an unresolvable name into a finding.
  const identity = tryAbilityIdentityFor(selection.actionToken);
  if (identity === null) {
    return {
      kind: "CORE_DOT_SELECTION",
      status: "UNKNOWN",
      blocker: "SELECTED_ACTION_IDENTITY_UNAVAILABLE",
      scope,
      entryProof: entry.proof,
      blockedBy: refFrom(authority, selection.selectingLine),
      authority: resolved,
      lines: selection.lines,
      derivedState,
      stateEvidence,
      detail: "the sub-list selected an action this project has no numeric ability identity for",
    };
  }

  return {
    kind: "CORE_DOT_SELECTION",
    status: "SELECTED_BY_AUTHORITY",
    scope,
    entryProof: entry.proof,
    selectedAction: { simcToken: selection.actionToken, abilityGameId: identity.spellId },
    selectingLine: refFrom(authority, selection.selectingLine),
    convergedOver: selection.convergedOver.map((line) => refFrom(authority, line)),
    authority: resolved,
    lines: selection.lines,
    derivedState,
    stateEvidence,
  };
}
