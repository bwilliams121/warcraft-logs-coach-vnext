/**
 * What Destruction Warlock supplies to the shared cast and channel anchor (ONB-D1, on ONB-S4).
 *
 * WHAT THE PROFILE PROVES, AND ONLY THAT. A hard cast has a cast time above zero, or this execution may have
 * been instant. It never gives a duration: `composite_spell_cast_speed()` at the cast is not established (a
 * combatant's pull stats are buffed values, and haste moves through the fight), so `exactMs` is always null and no
 * anchor is ever derived from a completion. A hard cast with no observable begin is UNKNOWN, never instant.
 *
 * A POSITIVE CAST TIME IS CLAIMED ONLY WHERE NO -100% ROW MATCHES THE SPELL (`warlock-destruction-cast-semantics.ts`).
 * Chaos Bolt, Incinerate, Infernal Bolt and Ruination each have one that no pinned source excludes, so each stays
 * UNKNOWN on every build, and the anchor keeps every placement that reading admits.
 *
 * AND THE ANCHOR THIS SPECIALIZATION ACCEPTS IS NARROWER THAN THE TIMELINE'S. The timeline pairs a completion with the
 * latest begin before it, and only enumerates an instant execution for a begin in the completion's own millisecond. If
 * the execution may have been instant, an earlier begin may be an abandoned attempt, and the decision may be the
 * completion's. So `destructionDecisionAnchor` refuses to read such a pairing as the moment of the decision.
 *
 * UNREVIEWED MEANS NOT REVIEWED. Burning Rush, Soulburn, Dark Pact, Mortal Coil, Unending Resolve, the
 * healthstone, the potion and the trinkets are outside the pinned list. The profile says nothing about them,
 * the anchor reports EXECUTION_NOT_REVIEWED, and occupancy around one stays UNKNOWN.
 *
 * NO CHANNEL IS REVIEWED. The pinned list has none: `channel_demonfire` and `drain_life` are not on it.
 */

import {
  hastedCastTime,
  type CastAnchorProfile,
  type CastDecisionAnchorState,
  type CastDurationFact,
  type CastExecution,
} from "../../../engine/game-state/casting/cast-decision-anchor.js";
import {
  destructionCastRowFor,
  type DestructionCastRow,
} from "../../../data/game/warlock-destruction-cast-semantics.js";

const HASTE_NOT_ESTABLISHED = { state: "UNKNOWN" } as const;

function castDurationOf(row: DestructionCastRow): CastDurationFact {
  switch (row.rule) {
    case "INSTANT":
      return { kind: "INSTANT" };
    case "HARD_CAST":
      return hastedCastTime(row.baseCastMs, HASTE_NOT_ESTABLISHED);
    case "INSTANT_ROW_NOT_EXCLUDED":
      return { kind: "UNKNOWN", reason: "INSTANT_ROW_NOT_EXCLUDED" };
  }
}

/** The anchor profile. It reads pinned data only, so it is the same for every build. */
export function destructionCastAnchorProfile(): CastAnchorProfile {
  return {
    executionOf: (abilityGameId): CastExecution | null => {
      const row = destructionCastRowFor(abilityGameId);
      if (row === null) return null;
      return row.baseCastMs === 0 ? "INSTANT" : "CAST_TIME";
    },
    castTimeAt: (completion) => {
      const row = destructionCastRowFor(completion.abilityGameId);
      if (row === null) return { kind: "UNKNOWN", reason: "EXECUTION_NOT_REVIEWED" };
      return castDurationOf(row);
    },
    channelDurationAt: () => ({ kind: "UNKNOWN", reason: "NO_CHANNEL_REVIEWED" }),
  };
}

/**
 * The instant this specialization accepts as a decision's moment. An established anchor stands, unless the ability's
 * execution may have been instant and the anchor is an earlier begin: then both instants remain candidates.
 */
export function destructionDecisionAnchor(
  anchor: CastDecisionAnchorState,
  abilityGameId: number,
  completionReportTimeMs: number,
): CastDecisionAnchorState {
  if (anchor.state !== "ESTABLISHED" || anchor.source !== "OBSERVED_BEGINCAST") return anchor;
  if (destructionCastRowFor(abilityGameId)?.rule !== "INSTANT_ROW_NOT_EXCLUDED") return anchor;
  return {
    state: "UNKNOWN",
    reason: "BEGINCAST_PAIRING_AMBIGUOUS",
    evidenceReason: null,
    candidateReportTimesMs: [anchor.reportTimeMs, completionReportTimeMs],
    detail:
      "A begin precedes this completion, but a -100% cast-time row of the spell is not excluded, so the execution may " +
      "have been instant and the begin an abandoned attempt.",
  };
}
