/**
 * Loads the committed Vanish -> Garrote fixture into a real `CombatState`.
 *
 * A sanitized slice of report `A7R6kxPJ1hC8YQ4w` fight 7 at revision 30, driven
 * through the REAL normalizer and the REAL M4 state engine.
 *
 * WHAT THIS SLICE IS, AND WHY IT IS FIVE EVENTS
 *
 * The second of actor 19's four Vanishes, plus the `combatantinfo` that carries
 * the build. In canonical order:
 *
 *     2004589  combatantinfo               talentTree, 76 entries
 *     2176120  applybuff   11327 Vanish    source 19 -> target 19
 *     2176120  cast         1856 Vanish    decision point P
 *     2176580  cast          703 Garrote   decision point Q
 *     2176580  removebuff  11327 Vanish
 *
 * The last two share a timestamp, and the ORDER matters: the removal sits AFTER
 * the Garrote cast in the canonical sequence, so the Vanish buff is observably
 * up at Q and observably gone immediately after. That is what lets M4 prove
 * ACTIVE at Q without inventing a duration — and it is the reason this fixture
 * keeps both events rather than just the cast.
 *
 * EVENTS ARE LOCATED BY FACT, NEVER BY CANONICAL POSITION, for the same reason
 * as the M5-A fixture: a re-slice renumbers everything.
 */

import type { CombatFight } from "../../src/engine/normalization/combat-fight.js";
import { createCombatState, type CombatState } from "../../src/engine/state/combat-state.js";
import { committedEventArray } from "./corpus/artifacts.js";
import { corpusFight } from "./corpus/fight.js";

/** The canonical corpus artifact; provenance in tests/corpus/manifest.json. */
const fixture = committedEventArray("wcl-assassination-vanish-ambush-gate");

export const M5C2_FIXTURE_PROVENANCE = {
  reportCode: "A7R6kxPJ1hC8YQ4w",
  fightId: 7,
  reportRevision: 30,
  gameVersion: 1,
  logVersion: 17,
} as const;

export const M5C2_ACTOR = 19;

/** Numeric identities this fixture exercises. Never matched by name. */
export const M5C2_IDS = {
  vanishAction: 1_856,
  vanishBuff: 11_327,
  garrote: 703,
  ambush: 8_676,
} as const;

/** Report timestamps of the two decision points. They are NOT one decision. */
export const M5C2_EVENTS = {
  /** P — Vanish is selected and executes. Zero-GCD, so the scan ends here. */
  vanishCast: { actorId: M5C2_ACTOR, reportTimeMs: 2_176_120, abilityGameId: M5C2_IDS.vanishAction },
  /** Q — a NEW scan, against post-Vanish state. The first cast after P. */
  garroteCast: { actorId: M5C2_ACTOR, reportTimeMs: 2_176_580, abilityGameId: M5C2_IDS.garrote },
} as const;

export const M5C2_RAW_EVENTS = fixture as unknown as readonly Record<string, unknown>[];

/**
 * The fight, through the shared corpus coverage interpreter.
 *
 * This five-event slice retains NO coverage grant: its probe filtered to the
 * events of interest and never recorded whether every aura event on actor 19
 * between the Vanish application and the Garrote cast was kept. So on THIS
 * artifact `stealthed.rogue` at the Garrote decision point is UNKNOWN /
 * INSUFFICIENT_COVERAGE — the honest answer, and what the regression pins.
 * The same real events sit inside the C3c1 and D2 slices, whose recorded
 * predicates retain AURAS coverage for target 19; the proven-TRUE fact lives
 * there (see `m5c2Stealthy()` below) and on a synthetic premise.
 */
function normalizeFixture(): CombatFight {
  return corpusFight("wcl-assassination-vanish-ambush-gate");
}

/**
 * The same Vanish -> Garrote sequence inside the C3c1 slice, which retains
 * AURAS coverage for targets 19 and 21 over [2,164,325 .. 2,176,581] by its
 * recorded predicate. Capture-backed: nothing declared, nothing premised.
 */
export function m5c2StateWithRetainedCoverage(): CombatState {
  return createCombatState(corpusFight("wcl-assassination-kingsbane-cooldown"));
}

export function m5c2Fight(): CombatFight {
  return normalizeFixture();
}

export function m5c2State(): CombatState {
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

/**
 * Actor 19's observed talent entries, read from the fixture's `combatantinfo`.
 *
 * Taken from the NORMALIZED snapshot rather than the raw JSON, so the test
 * exercises the same path production would and cannot drift from M3's decoding.
 */
export function observedTalentEntries(
  state: CombatState,
  actorId: number = M5C2_ACTOR,
): readonly { readonly id: number; readonly nodeId: number | null }[] {
  for (const position of state.positionsOfKind("COMBATANT_INFO")) {
    const event = state.eventAt(position);
    if (event === null || event.kind !== "COMBATANT_INFO") continue;
    if (event.snapshot.actorId !== actorId) continue;
    return event.snapshot.talentTree.map((entry) => ({ id: entry.id, nodeId: entry.nodeId }));
  }
  throw new Error(`fixture has no combatantinfo for actor ${String(actorId)}`);
}
