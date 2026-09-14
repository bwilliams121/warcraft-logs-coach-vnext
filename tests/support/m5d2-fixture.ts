/**
 * The M5-D2 decision-corpus fixture, driven through the REAL pipeline.
 *
 * WHAT THIS SLICE IS
 *
 * A sanitized slice of report `A7R6kxPJ1hC8YQ4w` fight 7 at revision 30 — the
 * same report, fight and revision every Assassination fixture uses. Its window
 * is a strict FORWARD EXTENSION of the M5-C3c1 window: the same start
 * (`2,164,325`), the same predicate, and an end moved from `2,176,581` out to
 * `2,194,928`. 1083 events instead of 310.
 *
 * WHY THE START DID NOT MOVE, AND WHY THAT IS A MEASUREMENT
 *
 * The start is not inherited by habit. Cutting later was tried, and it BREAKS:
 *
 *     cut 2,164,325   case 1 = SELECTED garrote @ core_dot[0]   (Garrote remains 5.746 s)
 *     cut 2,168,000   case 1 = UNKNOWN                          (Garrote remains unknown)
 *
 * `2,164,326` is the `applydebuff` that anchors actor 19's Garrote on target 21.
 * Drop it and the DoT remainder stops being derivable, so the exact result
 * degrades to UNKNOWN. That is the D2 §76 rule working: a truncated window makes
 * the analyzer say LESS, never make something up. `m5d2-truncated-window.test.ts`
 * pins that behaviour so it cannot silently reverse.
 *
 * WHY THE END IS 2,194,928
 *
 * The last corpus decision is the Rupture cast at `2,194,927`; `2,194,928` is
 * its own `applydebuff`. Nothing later is read by any case.
 *
 * EVENT ORDER IS PRESERVED VERBATIM
 *
 * Filtered IN PLACE, never re-sorted, for the reason the C3a entry records at
 * length: at a cast that shares a timestamp with its own consequences, Warcraft
 * Logs returns the cast FIRST, and the M4 state engine depends on that.
 *
 * EVENTS ARE LOCATED BY FACT, NEVER BY CANONICAL POSITION. That rule earned its
 * keep here: an earlier draft addressed the case-2 query point as "one index
 * before the Garrote cast", and widening the capture predicate silently moved it
 * 43 ms, changing a derived DoT remainder from 5.835 s to 5.792 s. Every locator
 * below matches on a timestamp and asserts the match is unique.
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
import fixture from "../fixtures/wcl/events/wcl-assassination-d2-decision-corpus.json";

export const M5D2_FIXTURE_PROVENANCE = {
  reportCode: "A7R6kxPJ1hC8YQ4w",
  fightId: 7,
  reportRevision: 30,
  gameVersion: 1,
  logVersion: 17,
  /** Inclusive capture window, excluding the pull `combatantinfo`. */
  windowStartMs: 2_164_325,
  windowEndMs: 2_194_928,
  eventCount: 1083,
} as const;

export const M5D2_ACTOR = 19;
/** The enemy every corpus decision is about. The fight also contains actor 22. */
export const M5D2_TARGET = 21;

/** Numeric identities this fixture exercises. Never matched by name. */
export const M5D2_IDS = {
  garrote: 703,
  rupture: 1_943,
  envenom: 32_645,
  fanOfKnives: 51_723,
  deathmark: 360_194,
  kingsbane: 385_627,
  vanishAction: 1_856,
  vanishBuff: 11_327,
  mutilate: 1_329,
  meleeAuto: 1,
} as const;

/**
 * The cooldown anchors the corpus depends on.
 *
 * Named so a test can assert they are IN the slice. A cooldown proven ready
 * because its anchor fell outside the fixture would be exactly the §76 failure,
 * and the only defence is checking the anchor is present rather than assuming.
 */
export const M5D2_ANCHORS = {
  deathmarkCast: 2_172_777,
  kingsbaneCast: 2_173_778,
  vanishCast: 2_176_120,
  /** Actor 19's Garrote `applydebuff` on target 21. Case 1 needs it. */
  garroteApplication: 2_164_326,
} as const;

const WINDOW_START = 2_004_589;
const WINDOW_END = 2_195_001;

export const M5D2_RAW_EVENTS = fixture as unknown as readonly Record<string, unknown>[];

function normalizeFixture(events: readonly Record<string, unknown>[] = M5D2_RAW_EVENTS): CombatFight {
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
    events: events as Record<string, unknown>[],
  });
  const normalized = normalizer.finish();

  return syntheticFight({
    observedCategories: ["CASTS", "RESOURCES", "AURAS", "COMBATANT_INFO"] as readonly EvidenceCategory[],
    events: normalized.events,
    startTimeMs: WINDOW_START,
    endTimeMs: WINDOW_END,
  });
}

export function m5d2Fight(): CombatFight {
  return normalizeFixture();
}

export function m5d2State(): CombatState {
  return createCombatState(normalizeFixture());
}

/**
 * The same fixture with every event before `cutMs` removed.
 *
 * Exists ONLY for the truncated-window regression. The pull `combatantinfo` is
 * always kept, because dropping identity would fail for an unrelated reason and
 * prove nothing about window width.
 */
export function m5d2TruncatedState(cutMs: number): CombatState {
  const kept = M5D2_RAW_EVENTS.filter(
    (event) => event["type"] === "combatantinfo" || Number(event["timestamp"]) >= cutMs,
  );
  return createCombatState(normalizeFixture(kept));
}

/**
 * The same fixture with one raw event removed, rebuilt through the real pipeline.
 *
 * MUST rebuild rather than filter a live `CombatState`. `createCombatState`
 * builds its indexes once and closes over the events array it was given, so
 * replacing the public `fight.events` afterwards changes nothing the engine
 * reads — a test written that way passes without removing anything.
 *
 * Positions shift when an event is dropped. That is safe here only because
 * every corpus locator matches on a timestamp.
 */
export function m5d2StateWithoutEvent(criteria: {
  readonly type: string;
  readonly abilityGameId: number;
  readonly reportTimeMs: number;
}): CombatState {
  const kept = M5D2_RAW_EVENTS.filter(
    (event) =>
      !(
        event["type"] === criteria.type &&
        event["abilityGameID"] === criteria.abilityGameId &&
        event["timestamp"] === criteria.reportTimeMs
      ),
  );
  if (kept.length !== M5D2_RAW_EVENTS.length - 1) {
    throw new Error(
      `expected to remove exactly one event; removed ${String(M5D2_RAW_EVENTS.length - kept.length)}`,
    );
  }
  return createCombatState(normalizeFixture(kept));
}

/** The canonical position of one observed COMPLETE cast, addressed by fact. */
export function findCastAt(
  state: CombatState,
  criteria: { readonly actorId: number; readonly reportTimeMs: number; readonly abilityGameId: number },
): number {
  const matches: number[] = [];
  for (let position = 0; position < state.fight.events.length; position += 1) {
    const event = state.fight.events[position];
    if (event === undefined || event.kind !== "CAST" || event.castPhase !== "COMPLETE") continue;
    if (event.source?.actorId !== criteria.actorId) continue;
    if (event.abilityGameId !== criteria.abilityGameId) continue;
    if (event.reportTimeMs !== criteria.reportTimeMs) continue;
    matches.push(position);
  }
  if (matches.length !== 1) {
    throw new Error(
      `expected exactly one COMPLETE cast of ${String(criteria.abilityGameId)} by actor ` +
        `${String(criteria.actorId)} at ${String(criteria.reportTimeMs)}; found ${String(matches.length)}`,
    );
  }
  return matches[0] as number;
}

/**
 * The canonical position of the ONE event at a report timestamp.
 *
 * Case 2 needs a query point that is NOT a cast, so it cannot be addressed the
 * way every other case is. Uniqueness is asserted rather than assumed: if a
 * future capture puts a second event on this millisecond, the ambiguity must
 * surface as a failure instead of an arbitrary pick.
 */
export function findSoleEventAt(state: CombatState, reportTimeMs: number): number {
  const matches: number[] = [];
  for (let position = 0; position < state.fight.events.length; position += 1) {
    if (state.fight.events[position]?.reportTimeMs === reportTimeMs) matches.push(position);
  }
  if (matches.length !== 1) {
    throw new Error(`expected exactly one event at ${String(reportTimeMs)}; found ${String(matches.length)}`);
  }
  return matches[0] as number;
}

/** Actor 19's observed talent entries, read from the fixture's `combatantinfo`. */
export function m5d2TalentEntries(
  state: CombatState,
  actorId: number = M5D2_ACTOR,
): readonly { readonly id: number; readonly nodeId: number | null }[] {
  for (const position of state.positionsOfKind("COMBATANT_INFO")) {
    const event = state.eventAt(position);
    if (event === null || event.kind !== "COMBATANT_INFO") continue;
    if (event.snapshot.actorId !== actorId) continue;
    return event.snapshot.talentTree.map((entry) => ({ id: entry.id, nodeId: entry.nodeId }));
  }
  throw new Error(`fixture has no combatantinfo for actor ${String(actorId)}`);
}
