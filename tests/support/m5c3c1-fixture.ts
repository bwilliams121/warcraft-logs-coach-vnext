/**
 * Loads the committed Kingsbane-cooldown fixture into a real `CombatState`.
 *
 * A sanitized slice of report `A7R6kxPJ1hC8YQ4w` fight 7 at revision 30, driven
 * through the REAL normalizer and the REAL M4 state engine.
 *
 * WHAT THIS SLICE IS, AND HOW IT DIFFERS FROM THE C3a ONE
 *
 * Same window as the M5-C3a slice — `[2164326 .. 2176580]` plus the pull
 * `combatantinfo` — with the CAST predicate widened from "the two decision
 * casts" to "every actor-19 cast". 310 events instead of 270.
 *
 * The widening is what makes the cooldown derivation sound. It asks
 * `lastObservedCast(kingsbane, COMPLETE, before Q)`, and "most recent" is only
 * meaningful if the slice contains every candidate. A fixture filtered to the
 * abilities the test happens to care about would prove "the most recent
 * Kingsbane cast among the ones we kept", which is not the same claim.
 *
 * The 42 casts include 24 melee autos (ability 1) and several unrelated
 * abilities. Those are not noise — they are what demonstrates that an unrelated
 * cast does not anchor a cooldown, on real data rather than a synthetic list.
 *
 * THE CAST SEQUENCE THAT MATTERS
 *
 *     Q-3803  Deathmark  360194
 *     Q-2802  Kingsbane  385627   <- the cooldown anchor
 *     Q-995   Envenom     32645
 *     Q-460   Vanish       1856
 *     Q       Garrote       703   <- the decision point
 *
 * EVENT ORDER IS PRESERVED VERBATIM, for the reason the C3a fixture records at
 * length: at Q the cast shares a timestamp with its own consequences, and
 * Warcraft Logs returns the cast FIRST. This slice was filtered in place rather
 * than re-sorted, so that interleaving survives.
 *
 * EVENTS ARE LOCATED BY FACT, NEVER BY CANONICAL POSITION.
 */

import type { CombatFight } from "../../src/engine/normalization/combat-fight.js";
import { createCombatState, type CombatState } from "../../src/engine/state/combat-state.js";
import { committedEventArray } from "./corpus/artifacts.js";
import { corpusFight } from "./corpus/fight.js";

/** The canonical corpus artifact; provenance in tests/corpus/manifest.json. */
const fixture = committedEventArray("wcl-assassination-kingsbane-cooldown");

export const M5C3C1_FIXTURE_PROVENANCE = {
  reportCode: "A7R6kxPJ1hC8YQ4w",
  fightId: 7,
  reportRevision: 30,
  gameVersion: 1,
  logVersion: 17,
} as const;

export const M5C3C1_ACTOR = 19;
export const M5C3C1_TARGET = 21;

/** Numeric identities this fixture exercises. Never matched by name. */
export const M5C3C1_IDS = {
  kingsbane: 385_627,
  deathmark: 360_194,
  envenom: 32_645,
  vanishAction: 1_856,
  vanishBuff: 11_327,
  garrote: 703,
  meleeAuto: 1,
} as const;

/** Report timestamps of the facts this fixture pins. */
export const M5C3C1_EVENTS = {
  /** The Kingsbane cast that anchors the cooldown. Q - 2802 ms. */
  kingsbaneCast: 2_173_778,
  deathmarkCast: 2_172_777,
  /** Q — the decision point whose cooldown state C3c1 derives. */
  garroteCast: {
    actorId: M5C3C1_ACTOR,
    reportTimeMs: 2_176_580,
    abilityGameId: M5C3C1_IDS.garrote,
  },
} as const;

/**
 * The cooldown facts this fixture must produce.
 *
 * Stated as constants so a test asserting them cannot be quietly re-baselined to
 * whatever the code happened to produce.
 *
 *     elapsed   2176580 - 2173778 = 2802 ms
 *     remaining 60000 - 2802      = 57198 ms = 57.198 s
 */
export const M5C3C1_EXPECTED = {
  baseCooldownMs: 60_000,
  elapsedMs: 2_802,
  remainingMs: 57_198,
  remainingSeconds: 57.198,
} as const;

export const M5C3C1_RAW_EVENTS = fixture as unknown as readonly Record<string, unknown>[];

/**
 * The fight, through the shared corpus coverage interpreter.
 *
 * The artifact's recorded predicate grants CASTS and RESOURCES for actor 19
 * and AURAS for targets 19 and 21 over [2,164,325 .. 2,176,581]. Nothing is
 * declared here; the manifest is the only source of coverage.
 */
function normalizeFixture(): CombatFight {
  return corpusFight("wcl-assassination-kingsbane-cooldown");
}

export function m5c3c1Fight(): CombatFight {
  return normalizeFixture();
}

export function m5c3c1State(): CombatState {
  return createCombatState(normalizeFixture());
}

/** The canonical position of one observed COMPLETE cast, addressed by fact. */
export function findCastAt(
  state: CombatState,
  criteria: { readonly actorId: number; readonly reportTimeMs: number; readonly abilityGameId: number },
): number {
  for (let position = 0; position < state.fight.events.length; position += 1) {
    const event = state.fight.events[position];
    if (event === undefined || event.kind !== "CAST" || event.castPhase !== "COMPLETE") continue;
    if (event.source?.actorId !== criteria.actorId) continue;
    if (event.abilityGameId !== criteria.abilityGameId) continue;
    if (event.reportTimeMs !== criteria.reportTimeMs) continue;
    return position;
  }
  throw new Error(
    `fixture has no COMPLETE cast of ${String(criteria.abilityGameId)} by actor ${String(criteria.actorId)} at ${String(criteria.reportTimeMs)}`,
  );
}

/** Q's canonical position: the post-Vanish Garrote cast. */
export function garroteDecisionPosition(state: CombatState): number {
  return findCastAt(state, M5C3C1_EVENTS.garroteCast);
}

/** The Kingsbane cast's canonical position. */
export function kingsbaneCastPosition(state: CombatState): number {
  return findCastAt(state, {
    actorId: M5C3C1_ACTOR,
    reportTimeMs: M5C3C1_EVENTS.kingsbaneCast,
    abilityGameId: M5C3C1_IDS.kingsbane,
  });
}

/** Actor 19's observed talent entries, read from the fixture's `combatantinfo`. */
export function observedTalentEntries(
  state: CombatState,
  actorId: number = M5C3C1_ACTOR,
): readonly { readonly id: number; readonly nodeId: number | null }[] {
  for (const position of state.positionsOfKind("COMBATANT_INFO")) {
    const event = state.eventAt(position);
    if (event === null || event.kind !== "COMBATANT_INFO") continue;
    if (event.snapshot.actorId !== actorId) continue;
    return event.snapshot.talentTree.map((entry) => ({ id: entry.id, nodeId: entry.nodeId }));
  }
  throw new Error(`fixture has no combatantinfo for actor ${String(actorId)}`);
}
