/**
 * What Devastation Evoker supplies to the shared cast and channel anchor (ONB-X2, on ONB-S4).
 *
 * WHAT THE PROFILE PROVES, AND ONLY THAT. A hard cast has a cast time above zero, or this execution may have
 * been instant. It never gives a duration: `composite_spell_cast_speed()` at the cast is not established (a
 * combatant's pull stats are buffed values, and haste moves through the fight), so `exactMs` is always null and no
 * anchor is ever derived from a completion. A hard cast with no observable begin is UNKNOWN, never instant.
 *
 * A POSITIVE CAST TIME IS CLAIMED ONLY WHERE NO -100% ROW MATCHES THE SPELL (`evoker-devastation-cast-semantics.ts`).
 * Living Flame has one which this slice does not narrow, so it stays UNKNOWN on every build, and the shared
 * timeline keeps every placement that reading admits: a begin before such a completion may be an abandoned attempt, so it
 * is a candidate and never the moment.
 *
 * UNREVIEWED MEANS NOT REVIEWED. Obsidian Scales, Renewing Blaze, Glide, Zephyr, Time Spiral, Blessing of the Bronze, the potion, the Healthstone and the trinkets are outside the pinned rows. The profile says nothing about them,
 * the anchor reports EXECUTION_NOT_REVIEWED, and occupancy around one stays UNKNOWN.
 *
 * TWO CHANNELS AND TWO EMPOWERED SPELLS ARE REVIEWED. Disintegrate (`channeled = true`, sc_evoker.cpp:6362), Deep Breath (:6262), and Fire Breath and Eternity Surge through `empowered_charge_t` (:3519). Each one's anchor is its cast, and its span is possible, never
 * proven: a channel can be cancelled, as the list's own `cancel_if`, `interrupt_if` and `early_chain_if` do, a hold ends when the player lets go, and no bound is claimed.
 */

import {
  hastedCastTime,
  type CastAnchorProfile,
  type CastDurationFact,
  type CastExecution,
} from "../../../engine/game-state/casting/cast-decision-anchor.js";
import {
  devastationCastRowFor,
  type DevastationCastRow,
} from "../../../data/game/evoker-devastation-cast-semantics.js";

const HASTE_NOT_ESTABLISHED = { state: "UNKNOWN" } as const;

function castDurationOf(row: DevastationCastRow): CastDurationFact {
  switch (row.rule) {
    case "INSTANT":
      return { kind: "INSTANT" };
    case "HARD_CAST":
      return hastedCastTime(row.baseCastMs, HASTE_NOT_ESTABLISHED);
    case "INSTANT_ROW_NOT_EXCLUDED":
      return { kind: "UNKNOWN", reason: "INSTANT_ROW_NOT_EXCLUDED" };
    case "CHANNEL":
    case "EMPOWERED":
      return { kind: "UNKNOWN", reason: "CHANNEL_HAS_NO_CAST_TIME" };
  }
}

/** The anchor profile. It reads pinned data only, so it is the same for every build. */
export function devastationCastAnchorProfile(): CastAnchorProfile {
  return {
    executionOf: (abilityGameId): CastExecution | null => {
      const row = devastationCastRowFor(abilityGameId);
      if (row === null) return null;
      if (row.rule === "CHANNEL" || row.rule === "EMPOWERED") return "CHANNEL";
      return row.baseCastMs === 0 ? "INSTANT" : "CAST_TIME";
    },
    castTimeAt: (completion) => {
      const row = devastationCastRowFor(completion.abilityGameId);
      if (row === null) return { kind: "UNKNOWN", reason: "EXECUTION_NOT_REVIEWED" };
      return castDurationOf(row);
    },
    channelDurationAt: () => ({ kind: "UNKNOWN", reason: "CHANNEL_BOUND_NOT_REVIEWED" }),
  };
}
