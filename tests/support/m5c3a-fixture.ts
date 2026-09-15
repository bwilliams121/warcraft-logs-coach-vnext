/**
 * Loads the committed Garrote DoT-state fixture into a real `CombatState`.
 *
 * A sanitized slice of report `A7R6kxPJ1hC8YQ4w` fight 7 at revision 30, driven
 * through the REAL normalizer and the REAL M4 state engine.
 *
 * WHAT THIS SLICE IS, AND WHY IT IS 270 EVENTS
 *
 * The C3a `remains` derivation makes a CONTINUITY claim across
 * [2164326 .. 2176580]: actor 19's Garrote on target 21 was applied at the
 * start and nothing removed it before the end. A slice may only support that
 * claim if it contains EVERY aura observation M4 consults for that identity
 * over the interval.
 *
 * M4 indexes aura observations by TARGET, and a from-source query additionally
 * consults unidentified-ability observations on that target and sourceless
 * transitions of the same aura. So the honest slice is every aura event in the
 * interval whose target is 19 or 21 — nothing filtered by ability or by source
 * — plus the casts the decision point needs and the pull `combatantinfo`.
 *
 * Filtering by ability would have been smaller and WRONG: it would have removed
 * the very events that could have contradicted the continuity claim, leaving a
 * fixture that proves continuity by construction.
 *
 * THE THREE GARROTE TRANSITIONS, AND WHAT EACH ONE IS FOR
 *
 *     2164326  applydebuff  703  src 19 -> tgt 21   THE ANCHOR
 *     2172232  applydebuff  703  src 13 -> tgt 21   a DIFFERENT rogue's DoT
 *     2176580  removedebuff + applydebuff src 19    the cast's own consequence
 *
 * The middle one is the fixture's sharpest asset. Actor 13 lands an independent
 * Garrote on the same target between the anchor and Q. It is a different aura
 * identity, so it must not become actor 19's anchor — and because it is an
 * APPLICATION at 2172232, mistaking it for one would yield 13.652s instead of
 * 5.746s. Both are plausible numbers; only one is right.
 *
 * EVENT ORDER AT Q IS EVIDENCE, NOT PRESENTATION
 *
 * At 2176580 the Garrote cast shares a timestamp with eight other events,
 * including the `removedebuff` + `applydebuff` the cast itself causes. Warcraft
 * Logs returns the CAST FIRST, and this fixture preserves that order verbatim.
 *
 * It is load-bearing. `BEFORE_EVENT` at the cast excludes everything after it,
 * so the anchor is the 2164326 application and `remains` is 5.746s. Had the
 * consequences sorted first, the same query would have found the DoT the cast
 * itself applied and derived 18.000s — justifying the decision by its own
 * result. An earlier version of this fixture was assembled by concatenating
 * separately-filtered lists and sorting on timestamp alone, which did exactly
 * that; it was re-captured with the API's own interleaving preserved.
 *
 * EVENTS ARE LOCATED BY FACT, NEVER BY CANONICAL POSITION, for the same reason
 * as the M5-A and M5-C2 fixtures: a re-slice renumbers everything.
 */

import type { CombatFight } from "../../src/engine/normalization/combat-fight.js";
import { createCombatState, type CombatState } from "../../src/engine/state/combat-state.js";
import { committedEventArray } from "./corpus/artifacts.js";
import { corpusFight } from "./corpus/fight.js";

/** The canonical corpus artifact; provenance in tests/corpus/manifest.json. */
const fixture = committedEventArray("wcl-assassination-garrote-dot-remains");

export const M5C3A_FIXTURE_PROVENANCE = {
  reportCode: "A7R6kxPJ1hC8YQ4w",
  fightId: 7,
  reportRevision: 30,
  gameVersion: 1,
  logVersion: 17,
} as const;

/** The analysed player. */
export const M5C3A_ACTOR = 19;
/** The enemy the Garrote is on. */
export const M5C3A_TARGET = 21;
/** A DIFFERENT rogue, whose independent Garrote on the same target must not interfere. */
export const M5C3A_OTHER_ROGUE = 13;

/** Numeric identities this fixture exercises. Never matched by name. */
export const M5C3A_IDS = {
  garrote: 703,
  vanishAction: 1_856,
  vanishBuff: 11_327,
  improvedGarroteBuff: 392_401,
} as const;

/**
 * Report timestamps of the facts this fixture pins.
 *
 * `garroteAnchor` is the application `remains` is derived from. `garroteCast` is
 * Q, the decision being judged.
 */
export const M5C3A_EVENTS = {
  /** The fresh actor-19 Garrote application on target 21. The anchor. */
  garroteAnchor: 2_164_326,
  /** Actor 13's independent Garrote on the same target. A different aura. */
  otherRogueGarrote: 2_172_232,
  /** Q — the post-Vanish Garrote cast whose selection C3a judges. */
  garroteCast: {
    actorId: M5C3A_ACTOR,
    reportTimeMs: 2_176_580,
    abilityGameId: M5C3A_IDS.garrote,
  },
} as const;

/**
 * The remaining duration this fixture must derive at Q.
 *
 * `(2164326 + 18000) - 2176580 = 5746` ms. Stated here as a constant so a test
 * asserting it cannot be quietly re-baselined to whatever the code produced.
 */
export const M5C3A_EXPECTED_REMAINS_MS = 5_746;
export const M5C3A_EXPECTED_REMAINS_SECONDS = 5.746;

export const M5C3A_RAW_EVENTS = fixture as unknown as readonly Record<string, unknown>[];

/**
 * The fight, through the shared corpus coverage interpreter.
 *
 * The artifact's recorded predicate — every aura event targeting 19 or 21 in
 * [2,164,325 .. 2,176,581], order preserved — grants AURAS coverage for those
 * two targets and nothing else. Only two of actor 19's casts were kept, so
 * CASTS is deliberately NOT granted: a cooldown anchor query on this slice is
 * UNKNOWN / INSUFFICIENT_COVERAGE, and the C3c1 slice exists to answer it.
 */
function normalizeFixture(): CombatFight {
  return corpusFight("wcl-assassination-garrote-dot-remains");
}

export function m5c3aFight(): CombatFight {
  return normalizeFixture();
}

export function m5c3aState(): CombatState {
  return createCombatState(normalizeFixture());
}

/** The canonical position of one observed cast, addressed by fact. Throws if absent. */
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
  return findCastAt(state, M5C3A_EVENTS.garroteCast);
}

/**
 * The canonical position of one observed aura transition, addressed by fact.
 *
 * Takes source, target, ability, operation and time together, because no
 * smaller combination identifies a transition uniquely in this slice — the
 * whole point of the fixture is that several look alike.
 */
export function findAuraAt(
  state: CombatState,
  criteria: {
    readonly sourceActorId: number | null;
    readonly targetActorId: number;
    readonly abilityGameId: number;
    readonly operation: "APPLIED" | "REFRESHED" | "REMOVED";
    readonly reportTimeMs: number;
  },
): number {
  for (let position = 0; position < state.fight.events.length; position += 1) {
    const event = state.fight.events[position];
    if (event === undefined || event.kind !== "AURA") continue;
    if (event.abilityGameId !== criteria.abilityGameId) continue;
    if (event.operation !== criteria.operation) continue;
    if (event.reportTimeMs !== criteria.reportTimeMs) continue;
    if (event.target?.actorId !== criteria.targetActorId) continue;
    if ((event.source?.actorId ?? null) !== criteria.sourceActorId) continue;
    return position;
  }
  throw new Error(
    `fixture has no ${criteria.operation} of ${String(criteria.abilityGameId)} on actor ` +
      `${String(criteria.targetActorId)} at ${String(criteria.reportTimeMs)}`,
  );
}

/**
 * Actor 19's observed talent entries, read from the fixture's `combatantinfo`.
 *
 * Taken from the NORMALIZED snapshot rather than the raw JSON, so a test
 * exercises the same path production would.
 */
export function observedTalentEntries(
  state: CombatState,
  actorId: number = M5C3A_ACTOR,
): readonly { readonly id: number; readonly nodeId: number | null }[] {
  for (const position of state.positionsOfKind("COMBATANT_INFO")) {
    const event = state.eventAt(position);
    if (event === null || event.kind !== "COMBATANT_INFO") continue;
    if (event.snapshot.actorId !== actorId) continue;
    return event.snapshot.talentTree.map((entry) => ({ id: entry.id, nodeId: entry.nodeId }));
  }
  throw new Error(`fixture has no combatantinfo for actor ${String(actorId)}`);
}
