/**
 * The single gameplay decision M5-A supports.
 *
 * ONE QUESTION, NARROWLY:
 *
 *     Can the pinned SimulationCraft Assassination APL select this observed
 *     Envenom at the proven combo-point state?
 *
 * It does NOT ask what should have been cast instead. The globally ideal action
 * is UNKNOWN and stays UNKNOWN.
 *
 * SPECIALIZATION OWNERSHIP
 *
 * This module owns the Assassination-specific meaning: that Envenom is the
 * action under test, that combo points are the resource that gates it, and what
 * a false spend gate implies for this spec. Shared infrastructure supplies the
 * primitives — M4 supplies the observation, `src/simc` supplies parsing,
 * evaluation and reachability, `src/data` supplies identity. None of them knows
 * what Envenom is.
 *
 * THE ACCEPTANCE RULE, AND WHY IT IS THIS STRICT
 *
 * Only an `EXACT` / `OBSERVED` / `PRE_COST` observation carried ON the cast
 * itself is accepted as decision state. Everything else is UNKNOWN:
 *
 * - `STALE` is a real earlier observation, not the state at this instant. M4
 *   models no regeneration and no delta replay, so a carried-forward combo-point
 *   number is not what the player had when they pressed the button.
 * - `EVENT_ASSOCIATED` has no established before/after relationship to the
 *   event's own cost, so it cannot be read as the pre-cast amount.
 * - A MISSING observation is missing. Real captures contain Envenom casts whose
 *   snapshot omits the combo-point entry entirely while the cast plainly
 *   happened and dealt damage. "No type-4 entry" therefore means we do not know,
 *   and must never mean zero combo points or "no combo points were spent".
 */

import type { CombatState } from "../../../engine/state/combat-state.js";
import type { EvidenceLocator } from "../../../engine/evidence/locator.js";
import type { StateResult } from "../../../engine/state/state-result.js";
import type { ResourceAmountObservation } from "../../../engine/resources/resource-observations.js";
import type { AplAuthority, ReachabilityProof } from "../../../simc/apl-authority.js";
import { parseSimcExpression } from "../../../simc/expression/parse.js";
import { evaluateSimcExpression } from "../../../simc/expression/evaluate.js";
import type { ResolvedAuthority } from "../../../findings/authority.js";
import type {
  ObservedActionDecisionPoint,
  ObservedActionJudgment,
  ObservedResourceState,
} from "../../../findings/judgment.js";

/** The SimulationCraft action token this decision is about. */
export const ENVENOM_TOKEN = "envenom";

// --------------------------------------------------------------------------
// Acceptance of exact decision state
// --------------------------------------------------------------------------

export type ExactStateAcceptance =
  | { readonly accepted: true; readonly observation: ResourceAmountObservation }
  | { readonly accepted: false; readonly detail: string };

/**
 * Whether an M4 resource result may be used as exact decision state.
 *
 * Exported so the refusals can be tested directly, including branches this
 * evaluator cannot currently reach — `observationOnEvent` never returns STALE
 * today, but the refusal must hold if that ever changes, and a rule nobody
 * tested is a rule nobody can rely on.
 */
export function acceptExactPreCost(result: StateResult<ResourceAmountObservation>): ExactStateAcceptance {
  if (result.certainty === "UNKNOWN") {
    // Notably includes NO_OBSERVATION: the event is in hand and carries no
    // combo-point entry. That is an absence of evidence, never a value of zero.
    return { accepted: false, detail: `no exact observation on the cast (${result.reason})` };
  }
  if (result.certainty === "STALE") {
    return {
      accepted: false,
      detail:
        "the latest combo-point observation predates this cast; a carried-forward value is not decision state",
    };
  }
  if (result.certainty === "BOUNDED") {
    return { accepted: false, detail: "combo points were only bounded, not exact" };
  }
  if (result.derivation !== "OBSERVED") {
    return { accepted: false, detail: `combo points were ${result.derivation}, not directly observed` };
  }
  if (result.value.timing !== "PRE_COST") {
    return {
      accepted: false,
      detail: `observation timing is ${result.value.timing}; only PRE_COST describes the amount before the cast's own cost`,
    };
  }
  return { accepted: true, observation: result.value };
}

// --------------------------------------------------------------------------
// Combo-point adapter
// --------------------------------------------------------------------------

export type ComboPointAdaptation =
  | { readonly ok: true; readonly state: ObservedResourceState }
  | { readonly ok: false; readonly detail: string };

/**
 * Maps one exact WCL resource snapshot onto the SimC combo-point expressions.
 *
 * `combo_points` is the observed amount. `combo_points.deficit` is
 * `observedMax - observedAmount`, which is legitimate here for one specific
 * reason: BOTH numbers come from the SAME exact observation on the SAME event.
 * No state is simulated, no delta is replayed, and no value is carried forward
 * from another instant.
 *
 * Fails closed on anything that would make the subtraction meaningless, rather
 * than substituting a plausible maximum.
 */
export function adaptComboPoints(
  observation: ResourceAmountObservation,
  resourceId: string,
): ComboPointAdaptation {
  const { observedAmount, observedMax, resourceType } = observation;

  if (!Number.isSafeInteger(observedAmount) || observedAmount < 0) {
    return { ok: false, detail: `observed combo points ${observedAmount} is not a usable count` };
  }
  if (observedMax === null) {
    return { ok: false, detail: "the observation carries no maximum, so the deficit cannot be derived" };
  }
  if (!Number.isSafeInteger(observedMax) || observedMax <= 0) {
    return { ok: false, detail: `observed maximum ${observedMax} is not a usable capacity` };
  }
  if (observedMax < observedAmount) {
    return {
      ok: false,
      detail: `observed maximum ${observedMax} is below the observed amount ${observedAmount}`,
    };
  }

  return {
    ok: true,
    state: {
      resourceId,
      wireType: resourceType,
      observedAmount,
      observedMax,
      derivedDeficit: observedMax - observedAmount,
      timing: "PRE_COST",
    },
  };
}

// --------------------------------------------------------------------------
// Judging one observed cast
// --------------------------------------------------------------------------

export interface EnvenomJudgmentInput {
  readonly state: CombatState;
  readonly decisionPoint: ObservedActionDecisionPoint;
  readonly comboPointWireType: number;
  readonly resourceId: string;
  readonly authority: AplAuthority | null;
  readonly reachability: ReachabilityProof | null;
}

function resolvedAuthorityFrom(authority: AplAuthority, proof: ReachabilityProof): ResolvedAuthority | null {
  if (proof.kind !== "PROVEN_SOLE_GATE") return null;
  const { artifact } = authority;
  return {
    ref: {
      kind: "SIMC_APL",
      authorityId: artifact.authorityId,
      artifactRevision: artifact.artifactRevision,
      listName: proof.gate.fromListName,
      priorityOrdinal: proof.gate.priorityOrdinal,
      actionStringVerbatim: proof.gate.actionStringVerbatim,
      sourceLine: proof.gate.sourceLine,
    },
    provenance: {
      repository: artifact.provenance.repository,
      commitSha: artifact.provenance.commitSha,
      commitDate: artifact.provenance.commitDate,
      sourcePath: artifact.provenance.sourcePath,
      sourceSha256: artifact.provenance.sourceSha256,
      extractedOn: artifact.provenance.extractedOn,
    },
  };
}

/**
 * Produces exactly one judgment for one observed Envenom cast.
 *
 * Never returns nothing. Every identified in-scope decision point gets an
 * explicit structured result, because a silently skipped cast is indistinguish-
 * able from a cast that was fine.
 */
export function judgeEnvenomCast(input: EnvenomJudgmentInput): ObservedActionJudgment {
  const { state, decisionPoint, comboPointWireType, resourceId, authority, reachability } = input;

  if (authority === null || reachability === null) {
    return {
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
      status: "UNKNOWN",
      blocker: "ACTION_REACHABILITY_NOT_PROVABLE",
      authority: null,
      trace: null,
      observedState: null,
      stateEvidence: [],
      detail: `the authority call graph does not establish a sole gate to '${ENVENOM_TOKEN}' (${reachability.reason})`,
    };
  }

  const resolved = resolvedAuthorityFrom(authority, reachability);
  if (resolved === null) {
    return {
      status: "UNKNOWN",
      blocker: "ACTION_REACHABILITY_NOT_PROVABLE",
      authority: null,
      trace: null,
      observedState: null,
      stateEvidence: [],
      detail: "the proven gate could not be expressed as an authority reference",
    };
  }

  const observationResult = state.resources.observationOnEvent(
    decisionPoint.position,
    decisionPoint.actorId,
    comboPointWireType,
  );
  const acceptance = acceptExactPreCost(observationResult);
  if (!acceptance.accepted) {
    return {
      status: "UNKNOWN",
      blocker: "EXACT_RESOURCE_UNAVAILABLE",
      authority: resolved,
      trace: null,
      observedState: null,
      stateEvidence: observationResult.provenance.locators,
      detail: acceptance.detail,
    };
  }

  const stateEvidence: readonly EvidenceLocator[] = [acceptance.observation.locator];
  const adapted = adaptComboPoints(acceptance.observation, resourceId);
  if (!adapted.ok) {
    return {
      status: "UNKNOWN",
      blocker: "RESOURCE_MAX_UNKNOWN",
      authority: resolved,
      trace: null,
      observedState: null,
      stateEvidence,
      detail: adapted.detail,
    };
  }

  const condition = reachability.gate.conditionRaw;
  const parsed = parseSimcExpression(condition);
  if (!parsed.ok) {
    // Unsupported syntax fails the WHOLE expression. It never becomes false, and
    // it never disappears through a short-circuit.
    return {
      status: "UNKNOWN",
      blocker: "UNSUPPORTED_AUTHORITY_EXPRESSION",
      authority: resolved,
      trace: null,
      observedState: adapted.state,
      stateEvidence,
      detail: `authority condition is outside the supported expression subset (${parsed.reason}: '${parsed.fragment}')`,
    };
  }

  // Every buff in the condition is left unresolved: M5-A establishes no aura
  // state, and M4's rule that "no observed transition" is not "inactive" is not
  // weakened here. Unresolved buffs become correlated atoms and are enumerated.
  const evaluation = evaluateSimcExpression(parsed.ast, condition, {
    comboPoints: adapted.state.observedAmount,
    comboPointsDeficit: adapted.state.derivedDeficit,
    knownBuffs: [],
  });

  if (evaluation.outcome === "UNSUPPORTED") {
    return {
      status: "UNKNOWN",
      blocker: "UNSUPPORTED_AUTHORITY_EXPRESSION",
      authority: resolved,
      trace: null,
      observedState: adapted.state,
      stateEvidence,
      detail: `the condition carries ${evaluation.unresolvedAtomCount} unresolved atoms, beyond the supported enumeration limit`,
    };
  }

  if (evaluation.outcome === "UNRESOLVED") {
    return {
      status: "UNKNOWN",
      blocker: "UNRESOLVED_AUTHORITY_STATE",
      authority: resolved,
      trace: evaluation.trace,
      observedState: adapted.state,
      stateEvidence,
      detail:
        "the gate's value depends on authority state we did not establish; enumerated resolutions disagree",
    };
  }

  if (evaluation.value) {
    // The gate is satisfiable. That does NOT establish that the APL reaches this
    // line, nor that Envenom's own conditions hold, nor that Envenom is the
    // action that would be selected. There is no positive verdict to give.
    return {
      status: "UNKNOWN",
      blocker: "ANALYZER_SURFACE_INCOMPLETE",
      authority: resolved,
      trace: evaluation.trace,
      observedState: adapted.state,
      stateEvidence,
      detail:
        "the spend gate is satisfiable, but M5-A evaluates only this gate: higher-priority actions and " +
        "Envenom's own conditions are not evaluated, so the selected action is not established",
    };
  }

  // Proven false under every enumerated resolution. A false gate means the list
  // is never entered, whatever the higher-priority lines above it do — so the
  // observed action is unreachable through the authority's only path to it.
  return {
    status: "REJECTED_BY_AUTHORITY",
    authority: resolved,
    trace: evaluation.trace,
    observedState: adapted.state,
    stateEvidence,
  };
}
