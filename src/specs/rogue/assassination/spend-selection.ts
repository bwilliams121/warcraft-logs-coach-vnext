/**
 * The Assassination `spend` sub-list selection — M5-B's positive conclusion.
 *
 * ONE QUESTION, NARROWLY:
 *
 *     At this observed decision point, which action does the pinned
 *     SimulationCraft `spend` sub-list select?
 *
 * It does NOT ask what the whole APL would select. Higher-priority default
 * entries are unevaluated and several are unevaluable, so no global claim is
 * available and none is made. See `scoped-selection.ts`.
 *
 * SPECIALIZATION OWNERSHIP
 *
 * This module owns the Assassination-specific meaning: that combo points and
 * Energy are the resources the `spend` gate and lines depend on, that the wire
 * types carrying them must be resolved through the version-scoped contract, and
 * that an observed Envenom is what supplies usability evidence for Envenom.
 * Shared code supplies the primitives — M4 the observations, `src/simc` the
 * parsing, evaluation, reachability and ordered walk, `src/data` the identity.
 * None of them knows what Envenom is.
 *
 * WHY MISSING ENERGY FAILS CLOSED EARLY RATHER THAN FLOWING THROUGH
 *
 * An unavailable `energy.pct` could be passed to the evaluator as UNKNOWN_NUMBER
 * and would produce an honest UNKNOWN. It would produce the WRONG UNKNOWN: with
 * spend[1] undecided the walk reaches spend[2], whose condition is outside the
 * supported subset, and the result would report UNSUPPORTED_AUTHORITY_EXPRESSION
 * — telling a reader to widen the parser when the actual remedy is a capture
 * carrying the Energy snapshot. So the resource blockers are checked first, and
 * the one that names the real gap wins.
 *
 * USABILITY, AND THE ONE THING IT RESTS ON
 *
 * `PROVEN_USABLE` is granted to a line when that line's action token resolves —
 * numerically, through runtime game data — to the ability of the COMPLETE cast
 * observed at this decision point. The cast happened, so the ability was usable,
 * and that subsumes every requirement without modelling any of them. Every other
 * line gets `UNKNOWN`, which is not and never becomes "unusable".
 */

import type { CombatState } from "../../../engine/state/combat-state.js";
import type { EvidenceLocator } from "../../../engine/evidence/locator.js";
import type { AplAction, AplAuthority, ReachabilityProof } from "../../../simc/apl-authority.js";
import { parseSimcExpression } from "../../../simc/expression/parse.js";
import {
  evaluateSimcExpression,
  knownNumber,
  unknownNumber,
  type AtomBindings,
} from "../../../simc/expression/evaluate.js";
import { selectWithinList, type ActionUsability, type LineEvaluation } from "../../../simc/list-selection.js";
import { tryAbilityIdentityFor } from "../../../data/game/rogue-abilities.js";
import type { AuthorityRef, ResolvedAuthority } from "../../../findings/authority.js";
import type { ObservedActionDecisionPoint, ObservedResourceState } from "../../../findings/judgment.js";
import type {
  DecisionScope,
  ScopedActionSelection,
  ScopedSelectionBlocker,
} from "../../../findings/scoped-selection.js";
import type { ExpressionTrace } from "../../../simc/expression/evaluate.js";
import { acceptExactPreCost, adaptComboPoints, adaptEnergyPct } from "./envenom-decision.js";

export interface SpendSelectionInput {
  readonly state: CombatState;
  readonly decisionPoint: ObservedActionDecisionPoint;
  readonly comboPointWireType: number;
  readonly energyWireType: number;
  readonly comboPointResourceId: string;
  readonly energyResourceId: string;
  readonly authority: AplAuthority | null;
  readonly reachability: ReachabilityProof | null;
}

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
 * Produces exactly one scoped selection for one observed decision point.
 *
 * Never returns nothing. Every identified decision point gets an explicit
 * structured result, because a silently skipped point is indistinguishable from
 * one that was fine.
 */
export function selectSpendActionAt(input: SpendSelectionInput): ScopedActionSelection {
  const { state, decisionPoint, authority, reachability } = input;

  if (authority === null || reachability === null) {
    return {
      kind: "SCOPED_ACTION_SELECTION",
      status: "NO_AUTHORITY_AVAILABLE",
      reason: "NO_PINNED_AUTHORITY_FOR_SPEC",
      detail: "no pinned SimulationCraft APL is available for this specialization",
    };
  }

  // Reachability is about OUR ability to prove a property of an authority that
  // demonstrably exists. That is insufficiency on our side, so it is UNKNOWN and
  // never NO_AUTHORITY_AVAILABLE.
  if (reachability.kind !== "PROVEN_SOLE_GATE") {
    return {
      kind: "SCOPED_ACTION_SELECTION",
      status: "UNKNOWN",
      blocker: "ACTION_REACHABILITY_NOT_PROVABLE",
      scope: null,
      blockedBy: null,
      authority: null,
      gateTrace: null,
      lines: [],
      observedState: [],
      stateEvidence: [],
      detail: `the authority call graph does not establish a sole gate to the sub-list (${reachability.reason})`,
    };
  }

  const gate = reachability.gate;
  const gateRef = refFrom(authority, {
    listName: gate.fromListName,
    priorityOrdinal: gate.priorityOrdinal,
    actionStringVerbatim: gate.actionStringVerbatim,
    sourceLine: gate.sourceLine,
  });
  const resolved = resolvedAuthorityFrom(authority, gateRef);
  const scope: DecisionScope = {
    kind: "APL_SUBLIST",
    listName: gate.targetListName,
    entryGate: gateRef,
  };

  const unknown = (
    blocker: ScopedSelectionBlocker,
    detail: string,
    extras: {
      readonly blockedBy?: AuthorityRef | null;
      readonly gateTrace?: ExpressionTrace | null;
      readonly lines?: readonly LineEvaluation[];
      readonly observedState?: readonly ObservedResourceState[];
      readonly stateEvidence?: readonly EvidenceLocator[];
    } = {},
  ): ScopedActionSelection => ({
    kind: "SCOPED_ACTION_SELECTION",
    status: "UNKNOWN",
    blocker,
    scope,
    blockedBy: extras.blockedBy ?? null,
    authority: resolved,
    gateTrace: extras.gateTrace ?? null,
    lines: extras.lines ?? [],
    observedState: extras.observedState ?? [],
    stateEvidence: extras.stateEvidence ?? [],
    detail,
  });

  // ---- exact decision state, both resources, from THIS event only ----

  const comboResult = state.resources.observationOnEvent(
    decisionPoint.position,
    decisionPoint.actorId,
    input.comboPointWireType,
  );
  const comboAccepted = acceptExactPreCost(comboResult);
  if (!comboAccepted.accepted) {
    return unknown("EXACT_RESOURCE_UNAVAILABLE", comboAccepted.detail, {
      stateEvidence: comboResult.provenance.locators,
    });
  }
  const combo = adaptComboPoints(comboAccepted.observation, input.comboPointResourceId);
  if (!combo.ok) {
    return unknown("RESOURCE_MAX_UNKNOWN", combo.detail, {
      stateEvidence: [comboAccepted.observation.locator],
    });
  }

  const energyResult = state.resources.observationOnEvent(
    decisionPoint.position,
    decisionPoint.actorId,
    input.energyWireType,
  );
  const energyAccepted = acceptExactPreCost(energyResult);
  if (!energyAccepted.accepted) {
    return unknown("EXACT_RESOURCE_UNAVAILABLE", energyAccepted.detail, {
      observedState: [combo.state],
      stateEvidence: [comboAccepted.observation.locator, ...energyResult.provenance.locators],
    });
  }
  const energy = adaptEnergyPct(energyAccepted.observation, input.energyResourceId);
  if (!energy.ok) {
    return unknown(
      energy.reason === "RESOURCE_MAX_UNKNOWN" ? "RESOURCE_MAX_UNKNOWN" : "EXACT_RESOURCE_UNAVAILABLE",
      energy.detail,
      {
        observedState: [combo.state],
        stateEvidence: [comboAccepted.observation.locator, energyAccepted.observation.locator],
      },
    );
  }

  const observedState: readonly ObservedResourceState[] = [combo.state, energy.state];
  const stateEvidence: readonly EvidenceLocator[] = [
    comboAccepted.observation.locator,
    energyAccepted.observation.locator,
  ];

  // Buffs are left unresolved: this module establishes no aura state, and M4's
  // rule that "no observed transition" is not "inactive" is not weakened here.
  const bindings: AtomBindings = {
    comboPoints: combo.state.observedAmount,
    comboPointsDeficit: combo.state.derivedDeficit,
    energyPct: knownNumber(energy.percent),
    // The `spend` list names no DoT atom. Stated unknown rather than omitted, so
    // a condition that later reached `remains` from here would resolve UNKNOWN
    // instead of reading a duration this module never established.
    dotRemainsSeconds: unknownNumber("STATE_NOT_ESTABLISHED"),
    knownBuffs: [],
  };

  // ---- the entry gate: applicability, decided before anything is selected ----

  const parsedGate = parseSimcExpression(gate.conditionRaw);
  if (!parsedGate.ok) {
    return unknown(
      "UNSUPPORTED_AUTHORITY_EXPRESSION",
      `the entry gate is outside the supported expression subset (${parsedGate.reason}: '${parsedGate.fragment}')`,
      { blockedBy: gateRef, observedState, stateEvidence },
    );
  }
  const gateEvaluation = evaluateSimcExpression(parsedGate.ast, gate.conditionRaw, bindings);
  if (gateEvaluation.outcome === "UNSUPPORTED") {
    return unknown(
      "UNSUPPORTED_AUTHORITY_EXPRESSION",
      "the entry gate carries more unresolved atoms than the supported enumeration limit",
      { blockedBy: gateRef, observedState, stateEvidence },
    );
  }
  if (gateEvaluation.outcome === "UNRESOLVED") {
    return unknown(
      "UNRESOLVED_AUTHORITY_STATE",
      "the entry gate's value depends on authority state we did not establish",
      { blockedBy: gateRef, gateTrace: gateEvaluation.trace, observedState, stateEvidence },
    );
  }
  if (!gateEvaluation.value) {
    // PROVEN FALSE under every enumerated resolution. The sub-list was not
    // entered, so asking what it selected has no subject. That is exact
    // knowledge, not a shortfall, and it must not be reported as UNKNOWN.
    return {
      kind: "SCOPED_ACTION_SELECTION",
      status: "NOT_APPLICABLE",
      reason: "ENTRY_GATE_FALSE",
      scope,
      authority: resolved,
      gateTrace: gateEvaluation.trace,
      observedState,
      stateEvidence,
    };
  }

  // ---- the ordered walk ----

  const observedAbilityGameId = decisionPoint.abilityGameId;
  const usabilityFor = (action: AplAction): ActionUsability => {
    const identity = tryAbilityIdentityFor(action.actionToken);
    if (identity === null) return "UNKNOWN";
    // Numeric identity, matched against the observed cast at THIS position. A
    // token string is never compared to an ability name.
    return identity.spellId === observedAbilityGameId ? "PROVEN_USABLE" : "UNKNOWN";
  };

  const selection = selectWithinList(authority, scope.listName, bindings, usabilityFor);

  if (selection.kind === "LIST_ABSENT") {
    // Unreachable while the gate proof requires the called list to resolve, but
    // reported rather than asserted: a confident answer from a call graph that
    // disagrees with itself would be worse than admitting confusion.
    return unknown(
      "ACTION_REACHABILITY_NOT_PROVABLE",
      "the gate names a sub-list the authority does not contain",
      { blockedBy: gateRef, gateTrace: gateEvaluation.trace, observedState, stateEvidence },
    );
  }

  if (selection.kind === "INDETERMINATE") {
    const blockedBy = selection.blockedBy === null ? null : refFrom(authority, selection.blockedBy);
    return unknown(selection.blocker, detailForBlocker(selection.blocker), {
      blockedBy,
      gateTrace: gateEvaluation.trace,
      lines: selection.lines,
      observedState,
      stateEvidence,
    });
  }

  if (selection.kind === "NO_ACTION_SELECTED") {
    return {
      kind: "SCOPED_ACTION_SELECTION",
      status: "NO_ACTION_SELECTED",
      scope,
      authority: resolved,
      gateTrace: gateEvaluation.trace,
      lines: selection.lines,
      observedState,
      stateEvidence,
    };
  }

  const identity = tryAbilityIdentityFor(selection.actionToken);
  if (identity === null) {
    return unknown(
      "SELECTED_ACTION_IDENTITY_UNAVAILABLE",
      "the sub-list selects an action this project has no numeric spell id for",
      {
        blockedBy: refFrom(authority, selection.selectingLine),
        gateTrace: gateEvaluation.trace,
        lines: selection.lines,
        observedState,
        stateEvidence,
      },
    );
  }

  return {
    kind: "SCOPED_ACTION_SELECTION",
    status: "SELECTED_BY_AUTHORITY",
    scope,
    selectedAction: { simcToken: selection.actionToken, abilityGameId: identity.spellId },
    selectingLine: refFrom(authority, selection.selectingLine),
    convergedOver: selection.convergedOver.map((line) => refFrom(authority, line)),
    authority: resolved,
    gateTrace: gateEvaluation.trace,
    lines: selection.lines,
    observedState,
    stateEvidence,
  };
}

/** Author-written detail per blocker. Never interpolated from upstream data. */
function detailForBlocker(blocker: ScopedSelectionBlocker): string {
  switch (blocker) {
    case "UNSUPPORTED_AUTHORITY_EXPRESSION":
      return "a sub-list condition is outside the supported expression subset, so the walk stopped there rather than skipping it";
    case "COMPETING_POSSIBLE_ACTION":
      return "a higher-priority line that might still win names a different action, so the selected action is not determined";
    case "NO_DEFINITE_WINNER":
      return "lines might win but none is proven to fire, so the sub-list neither selects an action nor definitively selects nothing";
    case "NESTED_CALL_NOT_MODELLED":
      return "the sub-list calls another list, whose control flow this scoped walk does not follow";
    case "UNMODELLED_DISPATCH_IN_LIST":
      return "the sub-list uses run_action_list, whose control flow is not modelled";
    default:
      return "the sub-list selection could not be determined";
  }
}
