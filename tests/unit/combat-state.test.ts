import { describe, expect, it } from "vitest";

import { inclusiveRange } from "../../src/engine/evidence/coverage.js";
import { createNormalizer } from "../../src/engine/normalization/event-normalizer.js";
import { VERIFIED_DIRECTION_FIELDS } from "../../src/engine/normalization/raw-event-fields.js";
import {
  indexContracts,
  SUPPORTED_TYPE_CONTRACTS,
} from "../../src/engine/normalization/supported-families.js";
import { createCombatState } from "../../src/engine/state/combat-state.js";
import {
  afterEvent,
  beforeEvent,
  endOfTimestamp,
  startOfTimestamp,
} from "../../src/engine/state/temporal.js";
import {
  castEvent,
  damageEvent,
  malformedObservation,
  syntheticFight,
  unsupportedEvent,
} from "../support/synthetic-fight.js";
import pullWindowFixture from "../fixtures/wcl/events/wcl-pull-window-with-resources.json";

const PLAYER = 5;
const BOSS = 160;
const ENVENOM = 32645;
const MUTILATE = 1329;

// --------------------------------------------------------------------------
// Canonical position and ingestion ordinals
// --------------------------------------------------------------------------

describe("ingestion ordinals are not array indexes", () => {
  /**
   * Ordinals 0, 1, 3, 4 occupy canonical positions 0, 1, 2, 3. Ordinal 2 was
   * consumed by an observation whose envelope failed, so it never became an
   * event.
   */
  const fight = syntheticFight({
    events: [
      castEvent({ ordinal: 0, reportTimeMs: 1100, castPhase: "COMPLETE", sourceActorId: PLAYER }),
      damageEvent({ ordinal: 1, reportTimeMs: 1200, sourceActorId: PLAYER, targetActorId: BOSS }),
      castEvent({ ordinal: 3, reportTimeMs: 1400, castPhase: "COMPLETE", sourceActorId: PLAYER }),
      damageEvent({ ordinal: 4, reportTimeMs: 1500, sourceActorId: PLAYER, targetActorId: BOSS }),
    ],
    malformedObservations: [malformedObservation(2)],
  });
  const state = createCombatState(fight);

  it("resolves an ordinal across a gap to the correct canonical position", () => {
    expect(state.resolveIngestionOrdinal(0)).toEqual({ kind: "EVENT", position: 0 });
    expect(state.resolveIngestionOrdinal(1)).toEqual({ kind: "EVENT", position: 1 });
    // The decisive one. Ordinal 3 sits at position 2 because ordinal 2 was
    // spent on a malformed observation.
    expect(state.resolveIngestionOrdinal(3)).toEqual({ kind: "EVENT", position: 2 });
    expect(state.resolveIngestionOrdinal(4)).toEqual({ kind: "EVENT", position: 3 });
  });

  it("never returns the event that happens to sit at that array index", () => {
    const byOrdinal = state.resolveIngestionOrdinal(3);
    if (byOrdinal.kind !== "EVENT") return;

    const correct = state.eventAt(byOrdinal.position);
    const wrong = state.eventAt(3);

    expect(correct?.ingestionOrdinal).toBe(3);
    expect(wrong?.ingestionOrdinal).toBe(4);
    // `events[ingestionOrdinal]` would silently answer about a different event
    // at a different instant.
    expect(correct?.reportTimeMs).toBe(1400);
    expect(wrong?.reportTimeMs).toBe(1500);
  });

  it("reports a malformed observation's ordinal as a defect, not as a neighbour", () => {
    // The failure this prevents: rounding a gap to the nearest event, which
    // answers confidently about something that was never observed.
    expect(state.resolveIngestionOrdinal(2)).toEqual({ kind: "MALFORMED_OBSERVATION" });
  });

  it("distinguishes an ordinal that does not exist at all", () => {
    expect(state.resolveIngestionOrdinal(99)).toEqual({ kind: "NOT_PRESENT" });
    expect(state.resolveIngestionOrdinal(-1)).toEqual({ kind: "NOT_PRESENT" });
  });

  it("does not let malformed observations shift event resolution", () => {
    const withoutDefect = createCombatState(
      syntheticFight({ events: fight.events, malformedObservations: [] }),
    );

    // The same events resolve to the same positions whether or not the defect
    // is recorded. Only the ANSWER for ordinal 2 changes.
    expect(withoutDefect.resolveIngestionOrdinal(3)).toEqual({ kind: "EVENT", position: 2 });
    expect(withoutDefect.resolveIngestionOrdinal(2)).toEqual({ kind: "NOT_PRESENT" });
  });

  it("returns null rather than a neighbour for a position outside the sequence", () => {
    expect(state.eventAt(4)).toBeNull();
    expect(state.eventAt(-1)).toBeNull();
    expect(state.locatorAt(4)).toBeNull();
  });

  it("exposes the locator of a resolved position, for provenance", () => {
    expect(state.locatorAt(2)?.ingestionOrdinal).toBe(3);
    expect(state.locatorAt(2)?.reportTimeMs).toBe(1400);
  });
});

// --------------------------------------------------------------------------
// Temporal integrity
// --------------------------------------------------------------------------

describe("temporal integrity is observed, not assumed", () => {
  it("reports MONOTONIC for an ascending single-stream fight", () => {
    const state = createCombatState(
      syntheticFight({
        events: [
          damageEvent({ ordinal: 0, reportTimeMs: 1100 }),
          damageEvent({ ordinal: 1, reportTimeMs: 1200 }),
          damageEvent({ ordinal: 2, reportTimeMs: 1200 }),
          damageEvent({ ordinal: 3, reportTimeMs: 1300 }),
        ],
      }),
    );

    // Equal timestamps are not a violation. Only a DECREASE is.
    expect(state.temporalIntegrity.state).toBe("MONOTONIC");
    expect(state.temporalIntegrity.reasons).toEqual([]);
    expect(state.temporalIntegrity.firstViolation).toBeNull();
  });

  it("detects a decrease and keeps provenance for the first one", () => {
    const state = createCombatState(
      syntheticFight({
        events: [
          damageEvent({ ordinal: 0, reportTimeMs: 3000 }),
          damageEvent({ ordinal: 1, reportTimeMs: 2500 }),
          damageEvent({ ordinal: 2, reportTimeMs: 2000 }),
        ],
      }),
    );

    expect(state.temporalIntegrity.state).toBe("NON_MONOTONIC");
    expect(state.temporalIntegrity.reasons).toEqual(["TIMESTAMP_DECREASED"]);

    const violation = state.temporalIntegrity.firstViolation;
    expect(violation?.previousPosition).toBe(0);
    expect(violation?.previousReportTimeMs).toBe(3000);
    expect(violation?.offendingPosition).toBe(1);
    expect(violation?.offendingReportTimeMs).toBe(2500);
    // The FIRST violation, not the last: one counterexample disqualifies
    // timestamp addressing, and later ones add nothing.
    expect(violation?.offendingLocator.ingestionOrdinal).toBe(1);
  });

  it("does not repair, sort around, or drop the offending events", () => {
    const events = [
      damageEvent({ ordinal: 0, reportTimeMs: 3000 }),
      damageEvent({ ordinal: 1, reportTimeMs: 2500 }),
    ];
    const fight = syntheticFight({ events });
    const state = createCombatState(fight);

    expect(state.fight.events).toBe(events);
    expect(state.fight.events.map((event) => event.reportTimeMs)).toEqual([3000, 2500]);
    expect(state.positionsOfKind("DAMAGE")).toEqual([0, 1]);
  });

  it("flags concatenated hostility streams even when no decrease was observed", () => {
    const state = createCombatState(
      syntheticFight({
        hostilityStreams: ["FRIENDLY", "ENEMY"],
        events: [
          damageEvent({ ordinal: 0, reportTimeMs: 1100, streamId: "all:friendlies" }),
          damageEvent({ ordinal: 1, reportTimeMs: 1200, streamId: "all:enemies" }),
        ],
      }),
    );

    // Two streams appended into one array is not one chronological sequence,
    // whether or not the seam happens to produce a visible decrease.
    expect(state.temporalIntegrity.state).toBe("NON_MONOTONIC");
    expect(state.temporalIntegrity.reasons).toContain("CONCATENATED_STREAMS");
    expect(state.temporalIntegrity.declaredStreamCount).toBe(2);
    expect(state.temporalIntegrity.observedStreamIds).toEqual(["all:friendlies", "all:enemies"]);
  });

  it("records both reasons when both hold", () => {
    const state = createCombatState(
      syntheticFight({
        hostilityStreams: ["FRIENDLY", "ENEMY"],
        events: [
          damageEvent({ ordinal: 0, reportTimeMs: 4000, streamId: "all:friendlies" }),
          damageEvent({ ordinal: 1, reportTimeMs: 1100, streamId: "all:enemies" }),
        ],
      }),
    );

    expect(state.temporalIntegrity.reasons).toEqual(["CONCATENATED_STREAMS", "TIMESTAMP_DECREASED"]);
  });
});

// --------------------------------------------------------------------------
// Temporal positions
// --------------------------------------------------------------------------

describe("event-relative positions resolve from canonical order", () => {
  /** Three events share a millisecond. Their relative order is not recoverable from time. */
  const state = createCombatState(
    syntheticFight({
      events: [
        damageEvent({ ordinal: 0, reportTimeMs: 2000, rawType: "alpha" }),
        damageEvent({ ordinal: 1, reportTimeMs: 2000, rawType: "beta" }),
        damageEvent({ ordinal: 2, reportTimeMs: 2000, rawType: "gamma" }),
        damageEvent({ ordinal: 3, reportTimeMs: 2400, rawType: "delta" }),
      ],
    }),
  );

  it("excludes the anchor event for BEFORE_EVENT", () => {
    const resolved = state.resolveTemporalPosition(beforeEvent(1));

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.prefix.lastIncludedPosition).toBe(0);
    // The boundary is the ANCHOR's instant, not the last included event's.
    expect(resolved.prefix.boundaryReportTimeMs).toBe(2000);
  });

  it("includes the anchor event for AFTER_EVENT", () => {
    const resolved = state.resolveTemporalPosition(afterEvent(1));

    if (!resolved.ok) return;
    expect(resolved.prefix.lastIncludedPosition).toBe(1);
  });

  it("distinguishes same-timestamp neighbours that a timestamp cannot", () => {
    const before = state.resolveTemporalPosition(beforeEvent(2));
    const after = state.resolveTemporalPosition(afterEvent(2));
    const startOfMs = state.resolveTemporalPosition(startOfTimestamp(2000));
    const endOfMs = state.resolveTemporalPosition(endOfTimestamp(2000));

    if (!before.ok || !after.ok || !startOfMs.ok || !endOfMs.ok) return;

    // Four genuinely different answers inside one millisecond. Collapsing
    // "immediately before this cast" into "start of this millisecond" would
    // lose two of them.
    expect(before.prefix.lastIncludedPosition).toBe(1);
    expect(after.prefix.lastIncludedPosition).toBe(2);
    expect(startOfMs.prefix.lastIncludedPosition).toBe(-1);
    expect(endOfMs.prefix.lastIncludedPosition).toBe(2);
  });

  it("yields an empty prefix before the very first event", () => {
    const resolved = state.resolveTemporalPosition(beforeEvent(0));

    if (!resolved.ok) return;
    expect(resolved.prefix.lastIncludedPosition).toBe(-1);
  });

  it("refuses a position outside the canonical sequence", () => {
    const resolved = state.resolveTemporalPosition(beforeEvent(99));

    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.reason).toBe("UNSUPPORTED_DERIVATION");
  });

  it("is deterministic across repeated resolution", () => {
    const first = state.resolveTemporalPosition(beforeEvent(2));
    const second = state.resolveTemporalPosition(beforeEvent(2));

    expect(first).toEqual(second);
  });
});

describe("timestamp-addressed positions fail closed without monotonicity", () => {
  const events = [
    damageEvent({ ordinal: 0, reportTimeMs: 3000 }),
    damageEvent({ ordinal: 1, reportTimeMs: 2500 }),
  ];
  const state = createCombatState(syntheticFight({ events }));

  it("refuses START_OF_TIMESTAMP", () => {
    const resolved = state.resolveTemporalPosition(startOfTimestamp(2800));

    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.reason).toBe("NON_MONOTONIC_TIME");
  });

  it("refuses END_OF_TIMESTAMP", () => {
    const resolved = state.resolveTemporalPosition(endOfTimestamp(2800));

    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.reason).toBe("NON_MONOTONIC_TIME");
  });

  it("still answers event-relative questions", () => {
    // Canonical order is always valid, so "immediately before this event"
    // remains answerable even when time is disordered. That is precisely why
    // event-relative addressing exists rather than being sugar over timestamps.
    const resolved = state.resolveTemporalPosition(beforeEvent(1));

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.prefix.lastIncludedPosition).toBe(0);
  });
});

// --------------------------------------------------------------------------
// Actor and ability indexes
// --------------------------------------------------------------------------

describe("actor indexing never invents an actor", () => {
  const state = createCombatState(
    syntheticFight({
      events: [
        damageEvent({ ordinal: 0, reportTimeMs: 1100, sourceActorId: null, targetActorId: PLAYER }),
        damageEvent({
          ordinal: 1,
          reportTimeMs: 1200,
          sourceActorId: null,
          sourceAbsence: "NO_ACTOR_SENTINEL",
          targetActorId: PLAYER,
        }),
        damageEvent({
          ordinal: 2,
          reportTimeMs: 1300,
          sourceActorId: null,
          sourceAbsence: "UNUSABLE_VALUE",
          targetActorId: PLAYER,
        }),
        damageEvent({ ordinal: 3, reportTimeMs: 1400, sourceActorId: 0, targetActorId: BOSS }),
      ],
    }),
  );

  it("creates no index entry for an absent or sentinel source", () => {
    // The historical failure: `-1` read as "actor minus one", a well-formed
    // reference accumulating events belonging to nobody.
    expect(state.indexes.positionsBySourceActor.has(-1)).toBe(false);
    expect(state.positionsBySourceActor(-1)).toEqual([]);
    expect([...state.indexes.positionsBySourceActor.keys()]).toEqual([0]);
  });

  it("retains actor id 0, which is a real id", () => {
    // A truthiness check here would silently drop a legitimate actor.
    expect(state.indexes.positionsBySourceActor.has(0)).toBe(true);
    expect(state.positionsBySourceActor(0)).toEqual([3]);
  });

  it("keeps source and target indexes separate", () => {
    expect(state.positionsByTargetActor(PLAYER)).toEqual([0, 1, 2]);
    expect(state.positionsBySourceActor(PLAYER)).toEqual([]);
    // A debuff ON a player is not a debuff applied BY that player, and the two
    // indexes must never merge.
    expect(state.positionsByTargetActor(BOSS)).toEqual([3]);
  });

  it("returns an empty list for an unknown actor rather than undefined", () => {
    expect(state.positionsBySourceActor(4242)).toEqual([]);
  });
});

describe("kind and ability indexes", () => {
  const state = createCombatState(
    syntheticFight({
      events: [
        castEvent({
          ordinal: 0,
          reportTimeMs: 1100,
          castPhase: "COMPLETE",
          sourceActorId: PLAYER,
          abilityGameId: ENVENOM,
        }),
        damageEvent({ ordinal: 1, reportTimeMs: 1200, sourceActorId: PLAYER, abilityGameId: ENVENOM }),
        unsupportedEvent({ ordinal: 2, reportTimeMs: 1300, sourceActorId: PLAYER }),
        castEvent({
          ordinal: 3,
          reportTimeMs: 1400,
          castPhase: "COMPLETE",
          sourceActorId: PLAYER,
          abilityGameId: null,
        }),
      ],
    }),
  );

  it("indexes positions by event kind in canonical order", () => {
    expect(state.positionsOfKind("CAST")).toEqual([0, 3]);
    expect(state.positionsOfKind("DAMAGE")).toEqual([1]);
    expect(state.positionsOfKind("UNSUPPORTED_TYPE")).toEqual([2]);
    expect(state.positionsOfKind("AURA")).toEqual([]);
  });

  it("indexes by ability across kinds without merging them", () => {
    expect(state.positionsByAbility(ENVENOM)).toEqual([0, 1]);
    expect(state.positionsByAbility(MUTILATE)).toEqual([]);
  });

  it("keeps a cast with no ability id in the actor's cast history", () => {
    const actorIndex = state.indexes.castsByPhase.COMPLETE.get(PLAYER);

    // Dropping it would understate what the actor did.
    expect(actorIndex?.allPositions).toEqual([0, 3]);
    expect(actorIndex?.positionsByAbility.get(ENVENOM)).toEqual([0]);
  });
});

// --------------------------------------------------------------------------
// Cast history
// --------------------------------------------------------------------------

describe("cast phases stay distinct", () => {
  const state = createCombatState(
    syntheticFight({
      // Complete CASTS evidence, so "Mutilate never completed" below is a real
      // observed fact rather than an artefact of not having looked.
      observedCategories: ["CASTS"],
      events: [
        castEvent({
          ordinal: 0,
          reportTimeMs: 1100,
          castPhase: "BEGIN",
          sourceActorId: PLAYER,
          abilityGameId: ENVENOM,
        }),
        castEvent({
          ordinal: 1,
          reportTimeMs: 1400,
          castPhase: "COMPLETE",
          sourceActorId: PLAYER,
          abilityGameId: ENVENOM,
        }),
        castEvent({
          ordinal: 2,
          reportTimeMs: 1600,
          castPhase: "BEGIN",
          sourceActorId: PLAYER,
          abilityGameId: MUTILATE,
        }),
      ],
    }),
  );

  it("indexes BEGIN and COMPLETE separately", () => {
    expect(state.indexes.castsByPhase.BEGIN.get(PLAYER)?.allPositions).toEqual([0, 2]);
    expect(state.indexes.castsByPhase.COMPLETE.get(PLAYER)?.allPositions).toEqual([1]);
  });

  it("answers a COMPLETE query without counting a BEGIN", () => {
    const result = state.lastObservedCast({
      actorId: PLAYER,
      abilityGameId: MUTILATE,
      castPhase: "COMPLETE",
      before: afterEvent(2),
    });

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    // A begincast is not a completed cast. There is no evidence here that
    // Mutilate ever completed, and the begincast must not stand in for one.
    expect(result.value).toBeNull();
  });

  it("does not describe a completed cast as successful anywhere in its shape", () => {
    const result = state.lastObservedCast({
      actorId: PLAYER,
      abilityGameId: ENVENOM,
      castPhase: "COMPLETE",
      before: afterEvent(1),
    });

    if (result.certainty !== "EXACT" || result.value === null) return;
    expect(result.value.castPhase).toBe("COMPLETE");
    // "Successful" is an interpretation Warcraft Logs never states. The shared
    // layer reports the observed phase and leaves meaning to the evaluator.
    expect(JSON.stringify(result.value).toLowerCase()).not.toContain("success");
  });
});

describe("last observed cast respects the temporal position", () => {
  const state = createCombatState(
    syntheticFight({
      // This block's subject is position arithmetic, not evidence, so CASTS is
      // fully observed and the absence assertions below are honestly earned.
      observedCategories: ["CASTS"],
      events: [
        castEvent({
          ordinal: 0,
          reportTimeMs: 1100,
          castPhase: "COMPLETE",
          sourceActorId: PLAYER,
          abilityGameId: ENVENOM,
        }),
        damageEvent({ ordinal: 1, reportTimeMs: 1500, sourceActorId: PLAYER, targetActorId: BOSS }),
        castEvent({
          ordinal: 2,
          reportTimeMs: 2000,
          castPhase: "COMPLETE",
          sourceActorId: PLAYER,
          abilityGameId: ENVENOM,
        }),
        castEvent({
          ordinal: 3,
          reportTimeMs: 2500,
          castPhase: "COMPLETE",
          sourceActorId: PLAYER,
          abilityGameId: ENVENOM,
        }),
      ],
    }),
  );

  function lastEnvenom(before: Parameters<typeof state.lastObservedCast>[0]["before"]) {
    return state.lastObservedCast({
      actorId: PLAYER,
      abilityGameId: ENVENOM,
      castPhase: "COMPLETE",
      before,
    });
  }

  it("returns the most recent cast at or before the position", () => {
    const result = lastEnvenom(afterEvent(2));

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT" || result.value === null) return;
    expect(result.value.position).toBe(2);
    expect(result.value.reportTimeMs).toBe(2000);
  });

  it("excludes a cast that IS the anchor when asked for BEFORE_EVENT", () => {
    const result = lastEnvenom(beforeEvent(2));

    if (result.certainty !== "EXACT" || result.value === null) return;
    // The question is what was established immediately BEFORE this cast, so the
    // cast itself cannot be its own answer.
    expect(result.value.position).toBe(0);
  });

  it("never looks past the position", () => {
    const result = lastEnvenom(afterEvent(1));

    if (result.certainty !== "EXACT" || result.value === null) return;
    expect(result.value.position).toBe(0);
    expect(result.value.position).not.toBe(2);
  });

  it("records provenance pointing at the exact observation that answered it", () => {
    const result = lastEnvenom(afterEvent(3));

    if (result.certainty !== "EXACT" || result.value === null) return;
    const locators = result.provenance.locators;

    expect(locators).toHaveLength(1);
    expect(locators[0]?.ingestionOrdinal).toBe(3);
    expect(locators[0]).toBe(state.locatorAt(3));
    expect(result.provenance.category).toBe("CASTS");
    // A reference, not a copy: the fight still owns the event.
    expect(result.value).not.toHaveProperty("kind");
  });

  it("reports a proven absence as EXACT null when coverage supports it", () => {
    const result = state.lastObservedCast({
      actorId: PLAYER,
      abilityGameId: MUTILATE,
      castPhase: "COMPLETE",
      before: afterEvent(3),
    });

    expect(result.certainty).toBe("EXACT");
    if (result.certainty !== "EXACT") return;
    // A zero-use result backed by COMPLETE coverage is a valid observed fact,
    // and must stay distinguishable from "we could not tell".
    expect(result.value).toBeNull();
    expect(result.derivation).toBe("OBSERVED");
  });

  it("returns an empty-prefix absence rather than the first cast", () => {
    const result = lastEnvenom(beforeEvent(0));

    if (result.certainty !== "EXACT") return;
    expect(result.value).toBeNull();
  });

  it("fails closed on an unresolvable position", () => {
    const result = lastEnvenom(beforeEvent(99));

    expect(result.certainty).toBe("UNKNOWN");
    if (result.certainty !== "UNKNOWN") return;
    expect(result.reason).toBe("UNSUPPORTED_DERIVATION");
  });
});

// --------------------------------------------------------------------------
// Real normalized input
// --------------------------------------------------------------------------

describe("indexes built over a committed capture", () => {
  const CAPTURE_START = 7_381_097;
  const CAPTURE_END = 7_383_000;

  function stateFromCapture() {
    const normalizer = createNormalizer({
      fightStartTimeMs: CAPTURE_START,
      requestedRange: inclusiveRange(CAPTURE_START, CAPTURE_END),
      contracts: indexContracts(SUPPORTED_TYPE_CONTRACTS),
      directionFields: VERIFIED_DIRECTION_FIELDS,
    });
    normalizer.accept({
      streamId: "all",
      pageOrdinal: 0,
      requestedStartTimeMs: CAPTURE_START,
      nextPageTimestamp: null,
      events: pullWindowFixture as Record<string, unknown>[],
    });
    const normalized = normalizer.finish();
    return createCombatState(
      syntheticFight({
        events: normalized.events,
        startTimeMs: CAPTURE_START,
        endTimeMs: CAPTURE_END,
      }),
    );
  }

  const state = stateFromCapture();

  it("has real captured evidence to index", () => {
    expect(state.fight.events.length).toBeGreaterThan(0);
    expect(state.positionsOfKind("CAST").length).toBeGreaterThan(0);
  });

  it("finds the capture monotonic and single-streamed", () => {
    expect(state.temporalIntegrity.state).toBe("MONOTONIC");
    expect(state.temporalIntegrity.observedStreamIds).toEqual(["all"]);
  });

  it("indexes every event exactly once, by canonical position", () => {
    const indexed = [...state.indexes.positionsByKind.values()].reduce(
      (total, positions) => total + positions.length,
      0,
    );

    expect(indexed).toBe(state.fight.events.length);
    expect(state.indexes.positionByOrdinal.size).toBe(state.fight.events.length);
  });

  it("agrees with a direct scan of the fight for source attribution", () => {
    const source = state.fight.events[0]?.source;
    if (source === null || source === undefined) return;

    const expected = state.fight.events
      .map((event, position) => ({ event, position }))
      .filter((entry) => entry.event.source?.actorId === source.actorId)
      .map((entry) => entry.position);

    expect(state.positionsBySourceActor(source.actorId)).toEqual(expected);
  });

  it("resolves every ordinal back to the event that carries it", () => {
    for (const event of state.fight.events) {
      const resolved = state.resolveIngestionOrdinal(event.ingestionOrdinal);
      expect(resolved.kind).toBe("EVENT");
      if (resolved.kind !== "EVENT") continue;
      expect(state.eventAt(resolved.position)).toBe(event);
    }
  });
});
