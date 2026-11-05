/**
 * What Demonology Warlock supplies to the shared cast and channel anchor (ONB-X4, on ONB-S4).
 *
 * WHAT THE PROFILE PROVES, AND ONLY THAT. A hard cast has a cast time above zero, or this execution may have
 * been instant. It never gives a duration: `composite_spell_cast_speed()` at the cast is not established (a
 * combatant's pull stats are buffed values, and haste moves through the fight), so `exactMs` is always null and no
 * anchor is ever derived from a completion. A hard cast with no observable begin is UNKNOWN, never instant.
 *
 * A POSITIVE CAST TIME IS CLAIMED ONLY WHERE NO -100% ROW MATCHES THE SPELL AND THE WIRE AGREES (`warlock-demonology-cast-semantics.ts`).
 * Shadow Bolt, Hand of Gul'dan, Demonbolt, Ruination and Infernal Bolt each have such a row, which this slice does not narrow, so each stays UNKNOWN on every build. Call Dreadstalkers has none, but no retained press shows a gap between its begin and its completion, so it is UNKNOWN too. The shared
 * timeline keeps every placement that reading admits: an earlier begin before such a completion may be an abandoned attempt, so it
 * is a candidate and never the moment, and a begin in the completion's own millisecond may be this press's or the next one's.
 *
 * UNREVIEWED MEANS NOT REVIEWED. Burning Rush, Soulburn, Dark Pact, Mortal Coil, Unending Resolve, Banish, Curse of Weakness, the Demonic Circle spells, the healthstone, the potion and the trinkets are outside the pinned rows. The profile says nothing about them,
 * the anchor reports EXECUTION_NOT_REVIEWED, and occupancy around one stays UNKNOWN.
 *
 * NO CHANNEL IS REVIEWED, because the pinned list presses none.
 */

import {
  hastedCastTime,
  type CastAnchorProfile,
  type CastDurationFact,
  type CastExecution,
} from "../../../engine/game-state/casting/cast-decision-anchor.js";
import {
  demonologyCastRowFor,
  type DemonologyCastRow,
} from "../../../data/game/warlock-demonology-cast-semantics.js";

const HASTE_NOT_ESTABLISHED = { state: "UNKNOWN" } as const;

function castDurationOf(row: DemonologyCastRow): CastDurationFact {
  switch (row.rule) {
    case "INSTANT":
      return { kind: "INSTANT" };
    case "HARD_CAST":
      return hastedCastTime(row.baseCastMs, HASTE_NOT_ESTABLISHED);
    case "INSTANT_ROW_NOT_EXCLUDED":
      return { kind: "UNKNOWN", reason: "INSTANT_ROW_NOT_EXCLUDED" };
    case "WIRE_CONTRADICTS_POSITIVE_BASE":
      return { kind: "UNKNOWN", reason: "WIRE_CONTRADICTS_POSITIVE_BASE" };
  }
}

/** The anchor profile. It reads pinned data only, so it is the same for every build. */
export function demonologyCastAnchorProfile(): CastAnchorProfile {
  return {
    executionOf: (abilityGameId): CastExecution | null => {
      const row = demonologyCastRowFor(abilityGameId);
      if (row === null) return null;
      return row.baseCastMs === 0 ? "INSTANT" : "CAST_TIME";
    },
    castTimeAt: (completion) => {
      const row = demonologyCastRowFor(completion.abilityGameId);
      if (row === null) return { kind: "UNKNOWN", reason: "EXECUTION_NOT_REVIEWED" };
      return castDurationOf(row);
    },
    channelDurationAt: () => ({ kind: "UNKNOWN", reason: "CHANNEL_BOUND_NOT_REVIEWED" }),
  };
}
