/**
 * Whether an action was actually possible — as EVIDENCE, not as a model.
 *
 * THE ASYMMETRY THAT DEFINES THIS FILE
 *
 * A normalized COMPLETE cast is direct Warcraft Logs evidence that the ability
 * was usable at that instant. It subsumes every requirement at once — target
 * validity, range, resources, stealth, not being incapacitated, the cooldown
 * being up — without modelling any of them, because the action demonstrably
 * resolved. That is positive evidence of the strongest kind available.
 *
 * The mirror claim has no evidence behind it whatsoever. "No cast was observed"
 * is not "the action was unavailable"; it is the absence of an observation, and
 * `CLAUDE.md`'s rule that ACTIONABLE needs positive evidence applies equally in
 * the other direction. So there is NO negative member in this union. Not
 * `NOT_ACTIONABLE`, not `UNAVAILABLE`, not a nullable flag that reads as one.
 * The claim is unspellable rather than merely discouraged, which is the only
 * version of that rule a future change cannot quietly weaken.
 *
 * SCOPED TO ONE ABILITY AT ONE POSITION
 *
 * `PROVEN_ACTIONABLE_BY_OBSERVED_EXECUTION` carries the numeric ability id and
 * the canonical position it was observed at. It licenses exactly one sentence:
 *
 *     ability <abilityGameId> was usable by this actor at this decision point
 *
 * It does not license anything about another ability at the same point, about
 * the same ability at another point, about cooldown readiness in general, or
 * about targetability in general. The fields are what make the scope explicit:
 * a consumer cannot read this as a statement about the decision point at large
 * without ignoring the id sitting next to it.
 *
 * WHY HERE AND NOT IN `src/engine`
 *
 * `tests/contracts/m4-state-vocabulary.test.ts` bans actionability vocabulary
 * across the entire engine tree with no exemption, and that absoluteness is
 * what keeps the M4 boundary auditable by a mechanical sweep. Actionability is
 * an interpretive finding concern, so it lives in `src/findings` — the same
 * reason `authority.ts` is here rather than under `src/engine/findings`.
 *
 * WHAT THIS IS NOT: A COOLDOWN OR ENVIRONMENT MODEL
 *
 * Nothing here knows a base cooldown, a charge count, a phase, a targetability
 * window or a death. M5-B attaches observed evidence; it does not reason about
 * availability. Generic actionability modelling is deliberately absent.
 */

import type { EvidenceLocator } from "../engine/evidence/locator.js";

/**
 * The permitted actionability statuses, exhaustively.
 *
 * Two members. Anything added here is a deliberate architectural act and needs
 * the evidence rule that justifies it written down alongside.
 */
export type ActionabilityStatus = "NOT_EVALUATED" | "PROVEN_ACTIONABLE_BY_OBSERVED_EXECUTION";

export const ACTIONABILITY_STATUSES = [
  "NOT_EVALUATED",
  "PROVEN_ACTIONABLE_BY_OBSERVED_EXECUTION",
] as const satisfies readonly ActionabilityStatus[];

/**
 * Actionability as a discriminated union, so the positive case cannot exist
 * without the evidence that scopes it.
 */
export type ActionabilityEvidence =
  | {
      readonly status: "NOT_EVALUATED";
    }
  | {
      readonly status: "PROVEN_ACTIONABLE_BY_OBSERVED_EXECUTION";
      /** The ONE ability this proves. Numeric identity, never a display name. */
      readonly abilityGameId: number;
      /** Canonical index into `CombatFight.events`. Never an ingestion ordinal. */
      readonly position: number;
      /** The observed cast the proof rests on. A reference, never a copy. */
      readonly locator: EvidenceLocator;
    };

/**
 * The honest default, as a real value rather than an absent field.
 *
 * A missing actionability field would be read as "fine". This makes the state
 * explicit at every call site, and widening it later a type-checked act.
 */
export function notEvaluatedActionability(): ActionabilityEvidence {
  return { status: "NOT_EVALUATED" };
}

/**
 * Positive actionability for ONE ability, from ONE observed execution.
 *
 * The caller must have established that a COMPLETE cast of `abilityGameId` by
 * the actor under evaluation exists at `position`. This function records that
 * proof; it does not check it, because the check needs normalized combat state
 * this module deliberately does not import.
 */
export function provenActionableByObservedExecution(input: {
  readonly abilityGameId: number;
  readonly position: number;
  readonly locator: EvidenceLocator;
}): ActionabilityEvidence {
  return {
    status: "PROVEN_ACTIONABLE_BY_OBSERVED_EXECUTION",
    abilityGameId: input.abilityGameId,
    position: input.position,
    locator: input.locator,
  };
}
