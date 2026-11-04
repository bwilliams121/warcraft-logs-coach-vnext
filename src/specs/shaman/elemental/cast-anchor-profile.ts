/**
 * What Elemental Shaman supplies to the shared cast and channel anchor (ONB-D2, on ONB-S4).
 *
 * WHAT THE PROFILE PROVES, AND ONLY THAT. A hard cast has a cast time above zero, or this execution may have
 * been instant. It never gives a duration: `composite_spell_cast_speed()` at the cast is not established (a
 * combatant's pull stats are buffed values, and haste moves through the fight), so `exactMs` is always null and no
 * anchor is ever derived from a completion. A hard cast with no observable begin is UNKNOWN, never instant.
 *
 * A POSITIVE CAST TIME IS CLAIMED ONLY WHERE NO -100% ROW MATCHES THE SPELL (`shaman-elemental-cast-semantics.ts`).
 * Lightning Bolt, Chain Lightning, Lava Burst, Elemental Blast and Tempest each have one that no pinned source excludes, so each stays UNKNOWN on every build, and the shared
 * timeline keeps every placement that reading admits: a begin before such a completion may be an abandoned attempt, so it
 * is a candidate and never the moment.
 *
 * UNREVIEWED MEANS NOT REVIEWED. Ghost Wolf, Gust of Wind, Astral Shift, Earth Elemental, the totems, the potion and the trinkets are outside the pinned list. The profile says nothing about them,
 * the anchor reports EXECUTION_NOT_REVIEWED, and occupancy around one stays UNKNOWN.
 *
 * NO CHANNEL IS REVIEWED. The pinned list has none.
 */

import {
  hastedCastTime,
  type CastAnchorProfile,
  type CastDurationFact,
  type CastExecution,
} from "../../../engine/game-state/casting/cast-decision-anchor.js";
import {
  elementalCastRowFor,
  type ElementalCastRow,
} from "../../../data/game/shaman-elemental-cast-semantics.js";

const HASTE_NOT_ESTABLISHED = { state: "UNKNOWN" } as const;

function castDurationOf(row: ElementalCastRow): CastDurationFact {
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
export function elementalCastAnchorProfile(): CastAnchorProfile {
  return {
    executionOf: (abilityGameId): CastExecution | null => {
      const row = elementalCastRowFor(abilityGameId);
      if (row === null) return null;
      return row.baseCastMs === 0 ? "INSTANT" : "CAST_TIME";
    },
    castTimeAt: (completion) => {
      const row = elementalCastRowFor(completion.abilityGameId);
      if (row === null) return { kind: "UNKNOWN", reason: "EXECUTION_NOT_REVIEWED" };
      return castDurationOf(row);
    },
    channelDurationAt: () => ({ kind: "UNKNOWN", reason: "NO_CHANNEL_REVIEWED" }),
  };
}
