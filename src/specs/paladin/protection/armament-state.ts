/**
 * `next_armament` — the Protection-owned Lightsmith alternation state
 * (M10-C5 Phase B).
 *
 * THE STATE MACHINE
 *
 *     UNKNOWN                                 initially, and after any break
 *     hardcast Holy Bulwark  (432459)   →     SACRED_WEAPON (1)
 *     hardcast Sacred Weapon (432472)   →     HOLY_BULWARK  (0)
 *     buff transition (432496 / 432502) →     no change: never an anchor
 *     coverage break after the anchor   →     UNKNOWN
 *
 * The anchor is the LAST hardcast strictly BEFORE the decision position
 * (M4 canonical order, never a timestamp), found by walking the actor's own
 * casts back from the decision. A malformed cast — one whose ability the
 * normalizer could not read — met before the anchor stops the walk UNKNOWN:
 * it may have been a hardcast. The value carries forward only when CASTS
 * coverage for the actor is COMPLETE from the anchor to the decision, gated
 * exactly as `prev_gcd` is; a declared bundle hole inside that span fails
 * the gate. A later hardcast is never consulted.
 *
 * A hardcast proves the press was usable AT ITS OWN POSITION (the observed-
 * press rule in `resolveProtectionUsability`); it says nothing about a
 * charge remaining afterwards, and nothing here models charges.
 */

import type { CombatState } from "../../../engine/state/combat-state.js";
import { gateAbsenceClaim } from "../../../engine/state/state-result.js";
import { inclusiveRange } from "../../../engine/evidence/coverage.js";
import type { EvidenceLocator } from "../../../engine/evidence/locator.js";
import { ARMAMENT_HARDCASTS } from "../../../data/game/paladin-protection-armament-authority.js";

export type ArmamentState =
  | {
      readonly state: "KNOWN";
      /** 0 Holy Bulwark, 1 Sacred Weapon — the numbers the APL compares `next_armament` against. */
      readonly nextArmament: 0 | 1;
      readonly anchorPosition: number;
      readonly anchorLocator: EvidenceLocator;
      readonly anchorAbilityGameId: number;
      readonly anchorReportTimeMs: number;
    }
  | {
      readonly state: "UNKNOWN";
      readonly reason:
        /** No hardcast by the actor precedes the decision in the retained evidence. */
        | "NO_HARDCAST_IN_EVIDENCE"
        /** A cast whose ability could not be read lies between the last hardcast and the decision. */
        | "UNREADABLE_CAST_SINCE_ANCHOR"
        /** CASTS coverage for the actor is not COMPLETE from the anchor to the decision. */
        | "INSUFFICIENT_COVERAGE"
        | "POSITION_UNRESOLVED";
      readonly stoppedAtPosition: number | null;
    };

export interface ArmamentStateInput {
  readonly state: CombatState;
  readonly actorId: number;
  /** Canonical index of the decision point. Never an ingestion ordinal. */
  readonly position: number;
}

export function armamentStateAt(input: ArmamentStateInput): ArmamentState {
  const { state, actorId, position } = input;
  const decision = state.eventAt(position);
  if (decision === null) return { state: "UNKNOWN", reason: "POSITION_UNRESOLVED", stoppedAtPosition: null };

  const positions = state.positionsBySourceActor(actorId);
  for (let index = positions.length - 1; index >= 0; index -= 1) {
    const candidate = positions[index];
    if (candidate === undefined || candidate >= position) continue;
    const event = state.eventAt(candidate);
    if (event === null || event.kind !== "CAST" || event.castPhase !== "COMPLETE") continue;
    if (event.source?.actorId !== actorId) continue;
    if (event.isMelee === true) continue;
    if (event.abilityGameId === null) {
      return { state: "UNKNOWN", reason: "UNREADABLE_CAST_SINCE_ANCHOR", stoppedAtPosition: candidate };
    }
    const hardcast = ARMAMENT_HARDCASTS.find((identity) => identity.abilityGameId === event.abilityGameId);
    if (hardcast === undefined) continue;

    // Found. Carrying the value forward is an absence claim about every
    // millisecond in between — no unretrieved hardcast — and is gated as one.
    const gate = gateAbsenceClaim({
      completeness: state.fight.completeness,
      category: "CASTS",
      range: inclusiveRange(event.reportTimeMs, decision.reportTimeMs),
      actorId,
    });
    if (!gate.ok) return { state: "UNKNOWN", reason: "INSUFFICIENT_COVERAGE", stoppedAtPosition: candidate };
    return {
      state: "KNOWN",
      nextArmament: hardcast.nextArmament,
      anchorPosition: candidate,
      anchorLocator: event.locator,
      anchorAbilityGameId: event.abilityGameId,
      anchorReportTimeMs: event.reportTimeMs,
    };
  }
  return { state: "UNKNOWN", reason: "NO_HARDCAST_IN_EVIDENCE", stoppedAtPosition: null };
}
