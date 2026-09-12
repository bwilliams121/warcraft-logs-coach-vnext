/**
 * The seam M4-B domain modules read M4-A through.
 *
 * Aura state, resource observations and encounter state all need the same four
 * things: the normalized fight, the observed temporal integrity, a way to read
 * an event at a canonical position, and a way to resolve a `TemporalPosition`.
 * They do NOT need — and must not be handed — a second timestamp walker, a
 * second ordering, or a second coverage rule.
 *
 * Declaring that need as a narrow interface rather than passing `CombatState`
 * has two consequences worth the file:
 *
 * 1. No import cycle. `CombatState` composes the domain views; the domain views
 *    depend only on this.
 * 2. The domain modules CANNOT reach anything else. There is no `fight.events`
 *    search by time available to them, because the only temporal entry point
 *    here is M4-A's resolver.
 */

import type { EvidenceCategory } from "../../wcl/evidence-capability.js";
import { inclusiveRange } from "../evidence/coverage.js";
import type { CombatFight } from "../normalization/combat-fight.js";
import type { CombatEvent } from "../normalization/normalized-events.js";
import { gateAbsenceClaim, type AbsenceGate } from "./state-result.js";
import {
  isMonotonic,
  type PositionResolution,
  type TemporalIntegrity,
  type TemporalPosition,
} from "./temporal.js";

export interface StateEnvironment {
  readonly fight: CombatFight;
  readonly temporalIntegrity: TemporalIntegrity;
  /** `null` when the position is outside the canonical sequence. */
  eventAt(position: number): CombatEvent | null;
  resolveTemporalPosition(position: TemporalPosition): PositionResolution;
}

export interface ContinuityGateInput {
  readonly category: EvidenceCategory;
  /** The instant the claim is anchored at. */
  readonly fromReportTimeMs: number;
  /** The instant the claim is carried through to. */
  readonly toReportTimeMs: number;
  readonly actorId: number | null;
}

/**
 * Decides whether an anchor observation may be carried forward to a later
 * instant.
 *
 * "This aura was applied at T and is still active at T+8s" is not a positive
 * observation — it is an observation PLUS the claim that nothing contradicted it
 * in between. That second half is an absence claim over `[from, to]`, so it goes
 * through M4-A's `gateAbsenceClaim` unchanged rather than through a rule of its
 * own.
 *
 * Monotonicity is required first, for the same reason `lastObservedCast`
 * requires it: the interval was derived from a range of canonical POSITIONS, and
 * checking coverage against it means reading those positions as a time interval.
 * That is only sound when the two orders agree.
 */
export function gateContinuityClaim(environment: StateEnvironment, input: ContinuityGateInput): AbsenceGate {
  if (!isMonotonic(environment.temporalIntegrity)) {
    return { ok: false, reason: "NON_MONOTONIC_TIME" };
  }
  // Under MONOTONIC this cannot happen. Reported rather than asserted: an
  // inverted interval would otherwise be handed to the range primitives, which
  // would read it as empty and vacuously grant the claim.
  if (input.fromReportTimeMs > input.toReportTimeMs) {
    return { ok: false, reason: "NON_MONOTONIC_TIME" };
  }

  return gateAbsenceClaim({
    completeness: environment.fight.completeness,
    category: input.category,
    range: inclusiveRange(input.fromReportTimeMs, input.toReportTimeMs),
    actorId: input.actorId,
  });
}

/**
 * A stable key for one actor INSTANCE.
 *
 * `actorId` and `instanceId` are never collapsed, and `instanceId: null` — "no
 * instance supplied" — is kept distinct from instance `0`. Actor id `0` is a
 * real id, so nothing here may be a truthiness test.
 */
export function actorInstanceKey(actorId: number, instanceId: number | null): string {
  return `${actorId}#${instanceId === null ? "-" : instanceId}`;
}
