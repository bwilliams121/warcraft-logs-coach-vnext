/**
 * Two environmental facts, both established POSITIVELY, that together make
 * `stealth_t::ready()` false.
 *
 * WHAT THE PINNED GUARD ACTUALLY REDUCES TO
 *
 * `stealth_t::ready()` (sc_rogue.cpp:6084-6104):
 *
 *     if ( stealthed( STEALTH_BASIC | STEALTH_ROGUE ) )      return false;
 *     if ( !in_combat )                                      return ready();
 *     if ( dungeon fight style && shadowmeld && !boss )       return ready();
 *     if ( !restealth_allowed )                              return false;
 *     if ( !sim->target_non_sleeping_list.empty() )          return false;
 *     return ready();
 *
 * And `restealth_allowed` is constructed `false` (sc_rogue.cpp:1138), reset to
 * `false` (11573), set `true` in EXACTLY ONE place — inside a block guarded by
 * `sim->target_non_sleeping_list.empty()` (11592-11594) — and set back to
 * `false` by `break_stealth()` (11622).
 *
 * So in combat, outside a dungeon fight style, the only way past both guards is
 * for EVERY enemy to be asleep or dead. The predicate collapses to one thing:
 *
 *     in combat + at least one living enemy   ==>   stealth is unready
 *
 * WHY THIS IS NOT "WE SAW NO RESTRICTION"
 *
 * `ACTIONABLE requires positive evidence` cuts both ways: so does a negative
 * usability claim. Neither fact below is inferred from silence.
 *
 *     IN COMBAT       the decision position resolves inside the fight's own
 *                     timeline, with a non-negative elapsed time. That is a
 *                     property of the analysed encounter window, not an
 *                     assumption that a log implies combat.
 *
 *     LIVING ENEMY    the analysed player has a debuff PROVEN ACTIVE, by M4's
 *                     source-aware aura state, on another actor at this instant.
 *                     A player cannot hold a debuff on an actor that is not
 *                     there, and M4 proves ACTIVE only from an observed
 *                     transition — never from an absence.
 *
 * WHAT THE SECOND FACT DOES NOT CLAIM. It does not enumerate enemies, count
 * them, or say anything about how many there are. It says AT LEAST ONE, which is
 * exactly what `!target_non_sleeping_list.empty()` needs and is emphatically not
 * `spell_targets.fan_of_knives`.
 *
 * WHY THE FIGHT STYLE IS NOT CHECKED
 *
 * The dungeon branch needs `fight_style` to be DUNGEON_SLICE or DUNGEON_ROUTE
 * AND the Shadowmeld buff up AND a non-boss target. This project analyses raid
 * encounters under the pinned default fight style, and the branch also requires
 * a racial buff nothing here establishes. Rather than assert three things, note
 * that the branch only ever makes stealth MORE available: if it were ever taken,
 * this proof would be wrong in the direction of claiming an action unusable that
 * was usable. That is why the supported scope is recorded on the verdict, so a
 * future Mythic+ target has to revisit this file rather than inherit it.
 */

import { fromSource } from "../../../engine/auras/aura-state.js";
import type { CombatState } from "../../../engine/state/combat-state.js";
import type { EvidenceLocator } from "../../../engine/evidence/locator.js";
import { sourceRef, targetRef } from "../../../engine/normalization/normalized-events.js";
import { dotDurationForToken } from "../../../data/game/rogue-dot-durations.js";
import { SUPPORTED_DOT_TOKENS } from "./dot-remains-state.js";

/**
 * The pinned reading this proof rests on, recorded so it can be re-checked.
 *
 * Line numbers and the module hash travel with the claim, the same discipline
 * `stealth-readiness-authority.ts` and the transition contracts use.
 */
export const STEALTH_IN_COMBAT_AUTHORITY = {
  sourcePath: "engine/class_modules/sc_rogue.cpp",
  sourceSha256: "209e95265aae4168cf7cda57d1b241dda6361971ba6849a9262bd933bff3e13e",
  readyGuard: "sc_rogue.cpp:6084-6104 stealth_t::ready()",
  restealthDefault: "sc_rogue.cpp:1138 restealth_allowed( false ) in rogue_t's constructor",
  restealthReset: "sc_rogue.cpp:11573 restealth_allowed = false in rogue_t::reset()",
  restealthEnable:
    "sc_rogue.cpp:11592-11594 restealth_allowed = true ONLY inside a block guarded by " +
    "sim->target_non_sleeping_list.empty()",
  restealthBreak: "sc_rogue.cpp:11622 break_stealth() sets restealth_allowed = false",
  supportedScope:
    "Raid encounters under the pinned default fight style. The DUNGEON_SLICE / DUNGEON_ROUTE branch at " +
    "sc_rogue.cpp:6093-6095 is not modelled and would have to be before this proof is used for Mythic+.",
} as const;

/** Why in-combat stealth unusability could not be established. */
export type CombatEngagementBlocker =
  /** The decision position does not resolve inside the fight's own timeline. */
  | "FIGHT_TIME_NOT_ESTABLISHED"
  /**
   * No debuff by this player is PROVEN ACTIVE on another actor here.
   *
   * NOT "there are no enemies". It is the absence of a proof, and it correctly
   * leaves the stealth verdict UNKNOWN rather than turning silence into a
   * readiness claim.
   */
  | "NO_LIVING_ENEMY_PROVEN";

/** The evidence behind a positive engagement claim. Numeric identities only. */
export interface EngagedEnemyEvidence {
  /** The actor the analysed player holds a debuff on. */
  readonly enemyActorId: number;
  /** The debuff's ability id. Never a display name. */
  readonly abilityGameId: number;
  /** The observed transition M4's ACTIVE verdict rests on. */
  readonly locator: EvidenceLocator;
}

export type CombatEngagement =
  | {
      /** In combat, with at least one enemy proven present. */
      readonly state: "ENGAGED";
      /** MILLISECONDS since the fight started, at this position. */
      readonly elapsedFightTimeMs: number;
      readonly enemy: EngagedEnemyEvidence;
    }
  | { readonly state: "UNKNOWN"; readonly blocker: CombatEngagementBlocker };

export interface CombatEngagementInput {
  readonly state: CombatState;
  /** The acting player. */
  readonly actorId: number;
  /** The enemy the decision targets. */
  readonly targetActorId: number;
  readonly targetInstance?: number | null;
  /** Canonical index of the decision point. Never an ingestion ordinal. */
  readonly position: number;
}

/**
 * Establishes that the player is in combat with at least one living enemy.
 *
 * Both halves are required, and either failing yields UNKNOWN. The DoT tokens
 * searched are the ones this specialization already derives, so no new aura
 * query surface is introduced — the enemy proof is a by-product of state the
 * decision point reconstructs anyway.
 */
export function bindCombatEngagement(input: CombatEngagementInput): CombatEngagement {
  const { state, actorId, targetActorId, position } = input;

  const elapsed = state.encounter.elapsedFightTimeAt({ anchor: "BEFORE_EVENT", position });
  if (elapsed.certainty !== "EXACT" || elapsed.value < 0) {
    return { state: "UNKNOWN", blocker: "FIGHT_TIME_NOT_ESTABLISHED" };
  }

  for (const token of SUPPORTED_DOT_TOKENS) {
    const identity = dotDurationForToken(token);
    if (identity === null) continue;
    const presence = state.auras.presenceAt({
      target: targetRef(targetActorId, input.targetInstance ?? null),
      abilityGameId: identity.abilityGameId,
      auraClass: "DEBUFF",
      // FROM THIS PLAYER. Another rogue's Garrote on the same boss proves the
      // boss is there too, but it is not this actor's evidence and the
      // source-aware query is the one that cannot be confused.
      source: fromSource(sourceRef(actorId, null)),
      at: { anchor: "BEFORE_EVENT", position },
    });
    if (presence.certainty !== "EXACT") continue;
    if (presence.value.presence !== "ACTIVE") continue;

    return {
      state: "ENGAGED",
      elapsedFightTimeMs: elapsed.value,
      enemy: {
        enemyActorId: targetActorId,
        abilityGameId: identity.abilityGameId,
        locator: presence.value.anchor.locator,
      },
    };
  }

  return { state: "UNKNOWN", blocker: "NO_LIVING_ENEMY_PROVEN" };
}
