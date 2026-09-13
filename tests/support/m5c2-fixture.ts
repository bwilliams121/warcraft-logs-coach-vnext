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

import { inclusiveRange } from "../../src/engine/evidence/coverage.js";
import { createNormalizer } from "../../src/engine/normalization/event-normalizer.js";
import { VERIFIED_DIRECTION_FIELDS } from "../../src/engine/normalization/raw-event-fields.js";
import {
  indexContracts,
  SUPPORTED_TYPE_CONTRACTS,
} from "../../src/engine/normalization/supported-families.js";
import type { CombatFight } from "../../src/engine/normalization/combat-fight.js";
import { createCombatState, type CombatState } from "../../src/engine/state/combat-state.js";
import type { EvidenceCategory } from "../../src/wcl/evidence-capability.js";
import { syntheticFight } from "./synthetic-fight.js";
import fixture from "../fixtures/wcl/events/wcl-assassination-vanish-ambush-gate.json";

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

const WINDOW_START = 2_004_589;
const WINDOW_END = 2_176_581;

export const M5C2_RAW_EVENTS = fixture as unknown as readonly Record<string, unknown>[];

function normalizeFixture(): CombatFight {
  const normalizer = createNormalizer({
    fightStartTimeMs: WINDOW_START,
    requestedRange: inclusiveRange(WINDOW_START, WINDOW_END),
    contracts: indexContracts(SUPPORTED_TYPE_CONTRACTS),
    directionFields: VERIFIED_DIRECTION_FIELDS,
  });
  normalizer.accept({
    streamId: "all",
    pageOrdinal: 0,
    requestedStartTimeMs: WINDOW_START,
    nextPageTimestamp: null,
    events: fixture as Record<string, unknown>[],
  });
  const normalized = normalizer.finish();

  return syntheticFight({
    observedCategories: ["CASTS", "RESOURCES", "AURAS", "COMBATANT_INFO"] as readonly EvidenceCategory[],
    events: normalized.events,
    startTimeMs: WINDOW_START,
    endTimeMs: WINDOW_END,
  });
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
