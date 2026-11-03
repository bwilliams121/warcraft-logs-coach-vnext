/**
 * DISCIPLINE ATONEMENT OBSERVATION (HEAL-B3): what the evidence shows of a
 * Discipline Priest's Atonement, as Warcraft Logs reports it, and nothing
 * more.
 *
 * Discipline heals substantially through damage: an ally carrying the
 * Atonement buff is healed when the priest deals damage. The shared healing
 * primitives do not represent that pattern, and this module does not pretend
 * to reconstruct it. It is spec-owned (CLAUDE.md "Specialization-Owned
 * Evaluation"): which ids are Atonement is this specialization's pinned data
 * (`src/data/game/priest-discipline-atonement.json`), and which sources count
 * as the subject's is the evaluator's decision, passed in.
 *
 * WHAT IT REPORTS
 *
 * - APPLICATIONS. Every observed `applybuff` / `refreshbuff` of the Atonement
 *   buff whose reported source is one of the subject's sources, inside the
 *   encounter (bounds inclusive), each with its evidence locator, plus a
 *   per-target count. Source and target are Warcraft Logs' own, never
 *   inferred from which stream an event came from (CLAUDE.md "Buff and Debuff
 *   Direction"). Stack changes (`applybuffstack`, `removebuffstack`) are
 *   not applications and are not listed. Removals are not listed: no active interval, uptime or
 *   concurrent-target count is claimed (CLAUDE.md "Aura State"; the pinned
 *   data has no duration and a removal may be attributed elsewhere).
 * - HEALING AS REPORTED. Every observed healing event of the Atonement heal
 *   whose reported source is one of the subject's sources, inside the
 *   encounter, each with its locator, plus a per-target count. That Warcraft
 *   Logs attributed the heal to this source and to Atonement is the whole of
 *   the attribution it reports. Counts only: no amount, total, HPS or
 *   overhealing (raw `amount` meaning is follow-up M1).
 * - DAMAGE LINK. Which damage event produced which Atonement heal is NOT
 *   reported by Warcraft Logs, so it is always UNKNOWN
 *   (`DAMAGE_EVENT_LINK_NOT_REPORTED`). It is never reconstructed from
 *   timestamps.
 *
 * WHEN A LISTING IS COMPLETE
 *
 * Each list has its own listing. It is COMPLETE only when ALL hold:
 *
 * - the category (AURAS for applications, HEALING for heals) vouches for EVERY
 *   actor over the whole encounter (the actor-global gate: an Atonement may
 *   land on any ally, so a bounded capture cannot vouch for the list);
 * - no event of the identified id carries no source (it could be the
 *   subject's);
 * - no event of the same family (an aura for applications, a heal for heals)
 *   sourced by the subject carries no ability id (it could be Atonement);
 * - no event of the same family sourced by the subject carries one of the
 *   pinned SAME-NAME ids the data has not reviewed (it could be Atonement
 *   under another id).
 *
 * Otherwise it is UNKNOWN with the first failing reason and the counts, and
 * the observed events are kept. An empty list is "none" only when COMPLETE.
 *
 * WHAT IT NEVER SAYS. No verdict, score, quality, ranking, "should" or
 * expected count. Whether a number of Atonement applications or heals was
 * good is a per-cast healer judgement, and no approved model exists
 * (HEALING_DECISION stays NO_AUTHORITY_AVAILABLE).
 */

import { inclusiveRange } from "../../../engine/evidence/coverage.js";
import type { EvidenceLocator } from "../../../engine/evidence/locator.js";
import type { CombatFight } from "../../../engine/normalization/combat-fight.js";
import type { CombatEvent } from "../../../engine/normalization/normalized-events.js";
import { gateActorGlobalClaim, type UnknownReason } from "../../../engine/state/state-result.js";

/** Whether an Atonement list is every such event the subject's sources produced in the encounter. */
export type AtonementListing =
  | { readonly state: "COMPLETE" }
  | {
      readonly state: "UNKNOWN";
      readonly reason:
        UnknownReason | "UNATTRIBUTED_EVENT" | "UNIDENTIFIED_SUBJECT_EVENT" | "SAME_NAME_SPELL_FROM_SUBJECT";
      /** Events of the identified id with no reported source, inside the encounter. */
      readonly unattributedEvents: number;
      /** Events of the same family from the subject's sources with no ability id. */
      readonly unidentifiedSubjectEvents: number;
      /** Events of the same family from the subject's sources carrying a pinned same-name, unreviewed id. */
      readonly sameNameSpellEvents: number;
    };

export interface ObservedAtonementEvent {
  readonly reportTimeMs: number;
  /** Canonical index into `CombatFight.events`. */
  readonly position: number;
  readonly locator: EvidenceLocator;
  /** The reported source: one of the subject's sources. */
  readonly sourceActorId: number;
  /** The reported target, or `null` when Warcraft Logs supplied none. */
  readonly targetActorId: number | null;
}

export interface ObservedAtonementApplication extends ObservedAtonementEvent {
  readonly operation: "APPLIED" | "REFRESHED";
}

export interface AtonementTargetCount {
  readonly targetActorId: number | null;
  readonly events: number;
}

export interface AtonementObservation {
  readonly category: "ATONEMENT";
  readonly authority: "WCL_OBSERVED_FACT";
  readonly buffAbilityGameId: number;
  readonly healAbilityGameId: number;
  readonly applications: {
    readonly listing: AtonementListing;
    readonly events: readonly ObservedAtonementApplication[];
    readonly byTarget: readonly AtonementTargetCount[];
  };
  readonly healingAsReported: {
    readonly listing: AtonementListing;
    readonly events: readonly ObservedAtonementEvent[];
    readonly byTarget: readonly AtonementTargetCount[];
  };
  readonly damageEventLink: { readonly state: "UNKNOWN"; readonly reason: "DAMAGE_EVENT_LINK_NOT_REPORTED" };
}

export interface AtonementIds {
  readonly buffAbilityGameId: number;
  readonly healAbilityGameId: number;
  readonly sameNameAbilityGameIds: readonly number[];
}

type Family = "AURA" | "HEALING";

function inEncounter(fight: CombatFight, event: CombatEvent): boolean {
  return event.reportTimeMs >= fight.fight.startTimeMs && event.reportTimeMs <= fight.fight.endTimeMs;
}

function isFamily(event: CombatEvent, family: Family): boolean {
  if (family === "HEALING") return event.kind === "HEALING";
  // An application is a buff transition; a debuff of the same id is another fact.
  return event.kind === "AURA" && event.auraClass === "BUFF";
}

function listingOf(
  fight: CombatFight,
  family: Family,
  identifiedId: number,
  sources: ReadonlySet<number>,
  sameName: ReadonlySet<number>,
): AtonementListing {
  let unattributedEvents = 0;
  let unidentifiedSubjectEvents = 0;
  let sameNameSpellEvents = 0;
  for (const event of fight.events) {
    if (!isFamily(event, family) || !inEncounter(fight, event)) continue;
    if (event.source === null) {
      if (event.abilityGameId === identifiedId) unattributedEvents += 1;
      continue;
    }
    if (!sources.has(event.source.actorId)) continue;
    if (event.abilityGameId === null) unidentifiedSubjectEvents += 1;
    else if (sameName.has(event.abilityGameId)) sameNameSpellEvents += 1;
  }
  const counts = { unattributedEvents, unidentifiedSubjectEvents, sameNameSpellEvents };
  const gate = gateActorGlobalClaim({
    completeness: fight.completeness,
    category: family === "AURA" ? "AURAS" : "HEALING",
    range: inclusiveRange(fight.fight.startTimeMs, fight.fight.endTimeMs),
  });
  if (!gate.ok) return { state: "UNKNOWN", reason: gate.reason, ...counts };
  if (unattributedEvents > 0) return { state: "UNKNOWN", reason: "UNATTRIBUTED_EVENT", ...counts };
  if (unidentifiedSubjectEvents > 0)
    return { state: "UNKNOWN", reason: "UNIDENTIFIED_SUBJECT_EVENT", ...counts };
  if (sameNameSpellEvents > 0) return { state: "UNKNOWN", reason: "SAME_NAME_SPELL_FROM_SUBJECT", ...counts };
  return { state: "COMPLETE" };
}

function byTargetOf(events: readonly ObservedAtonementEvent[]): AtonementTargetCount[] {
  const counts = new Map<number | null, number>();
  for (const event of events) counts.set(event.targetActorId, (counts.get(event.targetActorId) ?? 0) + 1);
  return [...counts.entries()]
    .map(([targetActorId, count]) => ({ targetActorId, events: count }))
    .sort((a, b) => (a.targetActorId ?? -1) - (b.targetActorId ?? -1));
}

function observedOf(fight: CombatFight, family: Family, id: number, sources: ReadonlySet<number>) {
  const observed: { event: CombatEvent; base: ObservedAtonementEvent }[] = [];
  fight.events.forEach((event, position) => {
    if (!isFamily(event, family) || !inEncounter(fight, event)) return;
    if (event.abilityGameId !== id || event.source === null || !sources.has(event.source.actorId)) return;
    observed.push({
      event,
      base: {
        reportTimeMs: event.reportTimeMs,
        position,
        locator: event.locator,
        sourceActorId: event.source.actorId,
        targetActorId: event.target?.actorId ?? null,
      },
    });
  });
  return observed.sort(
    (a, b) => a.base.reportTimeMs - b.base.reportTimeMs || a.base.position - b.base.position,
  );
}

/** The subject's observed Atonement, as reported. See the module header. */
export function atonementObservationOf(
  fight: CombatFight,
  ids: AtonementIds,
  sources: ReadonlySet<number>,
): AtonementObservation {
  const sameName = new Set(ids.sameNameAbilityGameIds);
  const applications = observedOf(fight, "AURA", ids.buffAbilityGameId, sources).flatMap(
    ({ event, base }): ObservedAtonementApplication[] =>
      // `applybuff` and `refreshbuff` only: a `*stack` variant (normalized APPLIED with
      // `isStackChange`) changes a stack count and is not an application.
      event.kind === "AURA" && event.operation !== "REMOVED" && !event.isStackChange
        ? [{ ...base, operation: event.operation }]
        : [],
  );
  const heals = observedOf(fight, "HEALING", ids.healAbilityGameId, sources).map(({ base }) => base);
  return {
    category: "ATONEMENT",
    authority: "WCL_OBSERVED_FACT",
    buffAbilityGameId: ids.buffAbilityGameId,
    healAbilityGameId: ids.healAbilityGameId,
    applications: {
      listing: listingOf(fight, "AURA", ids.buffAbilityGameId, sources, sameName),
      events: applications,
      byTarget: byTargetOf(applications),
    },
    healingAsReported: {
      listing: listingOf(fight, "HEALING", ids.healAbilityGameId, sources, sameName),
      events: heals,
      byTarget: byTargetOf(heals),
    },
    damageEventLink: { state: "UNKNOWN", reason: "DAMAGE_EVENT_LINK_NOT_REPORTED" },
  };
}
