/**
 * Observed actor activity (M11-E1). Timestamped observations, nothing more.
 *
 * Each observation proves exactly one thing: actor X appeared as the SOURCE or
 * the TARGET of an event of evidence category F at report time T.
 *
 * It does NOT prove, and nothing here may be read as proving:
 *
 *   - anything at any other instant — two observations at t1 and t2 say
 *     nothing about t1 < t < t2; there is no interpolation
 *   - that the actor was alive, present, hostile, targetable or attackable
 *   - that silence means despawn or death, or that no observation means
 *     absence
 *
 * `observationExtremes` is a convenience over the observations: the earliest
 * and latest instant an observation exists, and how many there are. It is not
 * an interval of anything, and carries no claim about the time between.
 *
 * A future reviewed enemy-set model (M11-ED/F) may consume these as one
 * ingredient under its own rules; this module models no enemy set.
 */

import type { CombatFight } from "../engine/normalization/combat-fight.js";
import type { EvidenceLocator } from "../engine/evidence/locator.js";
import { indexContracts, SUPPORTED_TYPE_CONTRACTS } from "../engine/normalization/supported-families.js";
import type { EvidenceCategory } from "../wcl/evidence-capability.js";
import { observationsOnly, type ObservedCollection } from "./coverage.js";
import { actorKeyOf, type ActorKey } from "./observations.js";

export interface ActivityObservation {
  readonly actor: ActorKey;
  readonly role: "SOURCE" | "TARGET";
  readonly reportTimeMs: number;
  /**
   * The evidence category of the event's raw type, from the normalizer's own
   * type contracts; `null` for a raw type no contract recognises (the actor
   * still appeared).
   */
  readonly category: EvidenceCategory | null;
  readonly rawType: string;
  readonly locator: EvidenceLocator;
}

export interface ObservationExtremes {
  readonly firstObservedAtMs: number;
  readonly lastObservedAtMs: number;
  readonly observationCount: number;
}

export interface ObservedActivityEvidence {
  readonly actorId: number;
  /**
   * Ordered by (report time, ingestion ordinal, SOURCE before TARGET).
   * OBSERVED_ONLY, always: positive observations, with no claim that there are
   * no others.
   */
  readonly observations: ObservedCollection<ActivityObservation>;
  /** `null` when there are none — which is not evidence of absence. */
  readonly observationExtremes: ObservationExtremes | null;
}

const CONTRACTS = indexContracts(SUPPORTED_TYPE_CONTRACTS);

function categoryOf(rawType: string): EvidenceCategory | null {
  return CONTRACTS.get(rawType)?.category ?? null;
}

export function observedActivityOf(fight: CombatFight, actorId: number): ObservedActivityEvidence {
  const observations: ActivityObservation[] = [];
  for (const event of fight.events) {
    const rawType = event.kind === "MALFORMED_FAMILY" ? event.claimedType : event.locator.rawType;
    const category = categoryOf(rawType);
    if (event.source !== null && event.source.actorId === actorId) {
      observations.push({
        actor: actorKeyOf(event.source),
        role: "SOURCE",
        reportTimeMs: event.reportTimeMs,
        category,
        rawType,
        locator: event.locator,
      });
    }
    if (event.target !== null && event.target.actorId === actorId) {
      observations.push({
        actor: actorKeyOf(event.target),
        role: "TARGET",
        reportTimeMs: event.reportTimeMs,
        category,
        rawType,
        locator: event.locator,
      });
    }
  }
  observations.sort(
    (left, right) =>
      left.reportTimeMs - right.reportTimeMs ||
      left.locator.ingestionOrdinal - right.locator.ingestionOrdinal ||
      (left.role === right.role ? 0 : left.role === "SOURCE" ? -1 : 1),
  );
  const first = observations[0];
  const last = observations[observations.length - 1];
  return {
    actorId,
    observations: observationsOnly(observations),
    observationExtremes:
      first === undefined || last === undefined
        ? null
        : {
            firstObservedAtMs: first.reportTimeMs,
            lastObservedAtMs: last.reportTimeMs,
            observationCount: observations.length,
          },
  };
}
