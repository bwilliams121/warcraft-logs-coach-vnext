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
 * UNKNOWN on every build, and the shared timeline keeps every placement that reading admits: a begin before such a
 * completion may be an abandoned attempt, so it is a candidate and never the moment (ONB-D2 moved that rule there).
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
