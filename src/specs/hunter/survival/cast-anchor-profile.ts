/**
 * What Survival Hunter supplies to the shared cast and channel anchor (ONB-T2, on ONB-S4).
 *
 * WHAT THE PROFILE PROVES, AND ONLY THAT. A hard cast has a cast time above zero, or this execution may have
 * been instant. It never gives a duration: `composite_spell_cast_speed()` at the cast is not established (a
 * combatant's pull stats are buffed values, and haste moves through the fight), so `exactMs` is always null and no
 * anchor is ever derived from a completion. A hard cast with no observable begin is UNKNOWN, never instant.
 *
 * NO ROW HAS A POSITIVE CAST TIME, so the profile proves none and no begin is ever an anchor of a press here.
 *
 * UNREVIEWED MEANS NOT REVIEWED. Exhilaration, Survival of the Fittest, Aspect of the Turtle, Aspect of the Cheetah, Disengage, Mend Pet, the potion and the trinkets are outside the pinned rows. The profile says nothing about them,
 * the anchor reports EXECUTION_NOT_REVIEWED, and occupancy around one stays UNKNOWN.
 *
 * ONE CHANNEL IS REVIEWED, Boomstick (`channeled = true`, sc_hunter.cpp:6425). Its anchor is its cast, and its span is possible, never proven: no bound is claimed.
 */

import {
  hastedCastTime,
  type CastAnchorProfile,
  type CastDurationFact,
  type CastExecution,
} from "../../../engine/game-state/casting/cast-decision-anchor.js";
import {
  survivalCastRowFor,
  type SurvivalCastRow,
} from "../../../data/game/hunter-survival-cast-semantics.js";

const HASTE_NOT_ESTABLISHED = { state: "UNKNOWN" } as const;

function castDurationOf(row: SurvivalCastRow): CastDurationFact {
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
export function survivalCastAnchorProfile(): CastAnchorProfile {
  return {
    executionOf: (abilityGameId): CastExecution | null => {
      const row = survivalCastRowFor(abilityGameId);
      if (row === null) return null;
      if (row.rule === "CHANNEL") return "CHANNEL";
      return row.baseCastMs === 0 ? "INSTANT" : "CAST_TIME";
    },
    castTimeAt: (completion) => {
      const row = survivalCastRowFor(completion.abilityGameId);
      if (row === null) return { kind: "UNKNOWN", reason: "EXECUTION_NOT_REVIEWED" };
      return castDurationOf(row);
    },
    channelDurationAt: () => ({ kind: "UNKNOWN", reason: "CHANNEL_BOUND_NOT_REVIEWED" }),
  };
}
