/**
 * What Frost Mage supplies to the shared cast and channel anchor (ONB-D3, on ONB-S4).
 *
 * WHAT THE PROFILE PROVES, AND ONLY THAT. A hard cast has a cast time above zero, or this execution may have
 * been instant. It never gives a duration: `composite_spell_cast_speed()` at the cast is not established (a
 * combatant's pull stats are buffed values, and haste moves through the fight), so `exactMs` is always null and no
 * anchor is ever derived from a completion. A hard cast with no observable begin is UNKNOWN, never instant.
 *
 * A POSITIVE CAST TIME IS CLAIMED ONLY WHERE NO -100% ROW MATCHES THE SPELL (`mage-frost-cast-semantics.ts`).
 * Blizzard and Frostfire Bolt each have one which this slice does not narrow, so each stays UNKNOWN on every build, and the shared
 * timeline keeps every placement that reading admits: a begin before such a completion may be an abandoned attempt, so it
 * is a candidate and never the moment.
 *
 * UNREVIEWED MEANS NOT REVIEWED. Arcane Intellect, Summon Water Elemental, Mirror Image, Ice Barrier, Ice Block, Blink, Shimmer, Alter Time, Counterspell, the potion and the trinkets are outside the pinned rows. The profile says nothing about them,
 * the anchor reports EXECUTION_NOT_REVIEWED, and occupancy around one stays UNKNOWN.
 *
 * ONE CHANNEL IS REVIEWED, Ray of Frost (`channeled = true`, sc_mage.cpp:4943). Its anchor is its cast, and its span is possible, never proven: a channel can be cancelled, as
 * the list's own `interrupt_if` does, and no bound is claimed.
 */

import {
  hastedCastTime,
  type CastAnchorProfile,
  type CastDurationFact,
  type CastExecution,
} from "../../../engine/game-state/casting/cast-decision-anchor.js";
import { frostCastRowFor, type FrostCastRow } from "../../../data/game/mage-frost-cast-semantics.js";

const HASTE_NOT_ESTABLISHED = { state: "UNKNOWN" } as const;

function castDurationOf(row: FrostCastRow): CastDurationFact {
  switch (row.rule) {
    case "INSTANT":
      return { kind: "INSTANT" };
    case "HARD_CAST":
      return hastedCastTime(row.baseCastMs, HASTE_NOT_ESTABLISHED);
    case "INSTANT_ROW_NOT_EXCLUDED":
      return { kind: "UNKNOWN", reason: "INSTANT_ROW_NOT_EXCLUDED" };
    case "CHANNEL":
      return { kind: "UNKNOWN", reason: "CHANNEL_HAS_NO_CAST_TIME" };
  }
}

/** The anchor profile. It reads pinned data only, so it is the same for every build. */
export function frostCastAnchorProfile(): CastAnchorProfile {
  return {
    executionOf: (abilityGameId): CastExecution | null => {
      const row = frostCastRowFor(abilityGameId);
      if (row === null) return null;
      if (row.rule === "CHANNEL") return "CHANNEL";
      return row.baseCastMs === 0 ? "INSTANT" : "CAST_TIME";
    },
    castTimeAt: (completion) => {
      const row = frostCastRowFor(completion.abilityGameId);
      if (row === null) return { kind: "UNKNOWN", reason: "EXECUTION_NOT_REVIEWED" };
      return castDurationOf(row);
    },
    channelDurationAt: () => ({ kind: "UNKNOWN", reason: "CHANNEL_BOUND_NOT_REVIEWED" }),
  };
}
