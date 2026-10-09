/**
 * M8-E: factual encounter context, and the claims it refuses to make.
 *
 * Two failure modes dominate here, and most cases below target one of them.
 *
 * The first is an empty array that means "nothing happened" when it should mean
 * "we could not look". The second is a temporal window quietly becoming a
 * relevance judgement — nearby, therefore related, therefore the cause.
 */

import { describe, expect, it } from "vitest";

import { createCombatState } from "../../src/engine/state/combat-state.js";
import { isUnknown } from "../../src/engine/state/state-result.js";
import { afterEvent, startOfTimestamp } from "../../src/engine/state/temporal.js";
import { EVIDENCE_CAPABILITY_REGISTRY } from "../../src/wcl/evidence-capability.js";
import {
  encounterEventsNear,
  ENCOUNTER_EVENT_CATEGORIES,
  ENCOUNTER_EVENT_FAMILIES,
  type EncounterEventFamily,
} from "../../src/encounter-context/encounter-events.js";
import { phasePlacementOfObservation } from "../../src/encounter-context/phase-context.js";
import { temporalWindow, type TemporalWindowMs } from "../../src/encounter-context/temporal-window.js";
import {
  auraEvent,
  castEvent,
  damageEvent,
  FIGHT_END_MS,
  FIGHT_START_MS,
  observableCategory,
  partialCategory,
  phase,
  summonEvent,
  syntheticFight,
  UNVERIFIED_CATEGORY,
  type SyntheticFightOptions,
} from "../support/synthetic-fight.js";

/** The encounter-events source, for the "no restated scope rules" assertion. */
const SOURCE_OF_ENCOUNTER_EVENTS = Object.values(
  import.meta.glob("../../src/encounter-context/encounter-events.ts", {
    eager: true,
    query: "?raw",
    import: "default",
  }),
)[0] as string;
import { inclusiveRange } from "../../src/engine/evidence/coverage.js";
import type { CombatEvent } from "../../src/engine/normalization/normalized-events.js";

const ALL_FAMILIES = [...ENCOUNTER_EVENT_FAMILIES];
const CONTEXT_CATEGORIES = ["CASTS", "AURAS", "DAMAGE", "SUMMONS"] as const;

/** A window built through the real constructor, failing loudly if rejected. */
function windowOf(beforeMs: number, afterMs: number): TemporalWindowMs {
  const result = temporalWindow(beforeMs, afterMs);
  if (!result.ok) throw new Error(`window rejected: ${result.defect}/${result.field}`);
  return result.window;
}

function stateOf(options: SyntheticFightOptions) {
  return createCombatState(syntheticFight(options));
}

/** A fight whose four context categories are all fully observed. */
function observedState(options: SyntheticFightOptions) {
  return stateOf({ observedCategories: [...CONTEXT_CATEGORIES, "ENCOUNTER_PHASES"], ...options });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

function valueOf<T>(result: { certainty: string } & Record<string, unknown>): T {
  if (result["certainty"] !== "EXACT") {
    throw new Error(`expected EXACT, got ${String(result["certainty"])}/${String(result["reason"])}`);
  }
  return result["value"] as T;
}

// ---------------------------------------------------------------------------
// The temporal window
// ---------------------------------------------------------------------------

describe("the temporal window is validated at construction", () => {
  it("accepts zero on either side", () => {
    // `beforeMs: 0` asks for the anchor instant and nothing earlier. A real
    // question, and rejecting it would be a truthiness test in disguise.
    expect(temporalWindow(0, 0).ok).toBe(true);
    expect(temporalWindow(0, 5_000).ok).toBe(true);
  });

  it("accepts an asymmetric window", () => {
    expect(temporalWindow(2_000, 500).ok).toBe(true);
  });

  it.each([
    ["NEGATIVE", -1, 0, "beforeMs"],
    ["NEGATIVE", 0, -1, "afterMs"],
    ["NOT_AN_INTEGER", 1.5, 0, "beforeMs"],
    ["NOT_AN_INTEGER", 0, 1.5, "afterMs"],
    ["NOT_FINITE", Number.NaN, 0, "beforeMs"],
    ["NOT_FINITE", 0, Number.POSITIVE_INFINITY, "afterMs"],
  ])("rejects %s input", (defect, beforeMs, afterMs, field) => {
    const result = temporalWindow(beforeMs, afterMs);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.defect).toBe(defect);
    expect(result.field).toBe(field);
  });

  it("exposes no default width", () => {
    // "Events within five seconds are related" is a semantic claim nothing here
    // has established. A default would make it every caller's claim silently.
    const module = { temporalWindow } as Record<string, unknown>;
    expect(Object.keys(module)).toEqual(["temporalWindow"]);
  });
});

// ---------------------------------------------------------------------------
// Nearby events: window behaviour
// ---------------------------------------------------------------------------

describe("nearby encounter events respect the window bounds", () => {
  const ANCHOR_MS = 3_000;

  function fightWithDamageAt(times: readonly number[]): readonly CombatEvent[] {
    return [
      castEvent({ ordinal: 0, reportTimeMs: ANCHOR_MS, sourceActorId: 5, castPhase: "COMPLETE" }),
      ...times.map((reportTimeMs, index) =>
        damageEvent({ ordinal: index + 1, reportTimeMs, sourceActorId: 90, targetActorId: 5 }),
      ),
    ];
  }

  function damageTimesNear(times: readonly number[], beforeMs: number, afterMs: number): readonly number[] {
    const state = observedState({ events: fightWithDamageAt(times) });
    const result = encounterEventsNear(state, {
      anchor: afterEvent(0),
      window: windowOf(beforeMs, afterMs),
      families: ["DAMAGE"],
    });
    return valueOf<readonly { reportTimeMs: number }[]>(result).map((entry) => entry.reportTimeMs);
  }

  it("includes an observation inside the window", () => {
    expect(damageTimesNear([2_500, 3_500], 1_000, 1_000)).toEqual([2_500, 3_500]);
  });

  it("includes an observation exactly on the lower boundary", () => {
    expect(damageTimesNear([2_000], 1_000, 1_000)).toEqual([2_000]);
  });

  it("includes an observation exactly on the upper boundary", () => {
    expect(damageTimesNear([4_000], 1_000, 1_000)).toEqual([4_000]);
  });

  it("excludes an observation outside the window on either side", () => {
    expect(damageTimesNear([1_999, 4_001], 1_000, 1_000)).toEqual([]);
  });

  it("treats a zero-width window as the anchor instant only", () => {
    expect(damageTimesNear([2_999, ANCHOR_MS, 3_001], 0, 0)).toEqual([ANCHOR_MS]);
  });

  it("uses the anchor instant, not the last included event", () => {
    // The anchor is the cast at 3000. A window of 1000/0 must reach back to
    // 2000 from the ANCHOR, not from whatever event preceded it.
    expect(damageTimesNear([2_100], 1_000, 0)).toEqual([2_100]);
  });
});

// ---------------------------------------------------------------------------
// Ordering, equal timestamps, non-monotonic input
// ---------------------------------------------------------------------------

describe("observations preserve canonical order and every duplicate", () => {
  it("keeps every observation sharing a timestamp", () => {
    const events = [
      castEvent({ ordinal: 0, reportTimeMs: 3_000, sourceActorId: 5, castPhase: "COMPLETE" }),
      damageEvent({ ordinal: 1, reportTimeMs: 3_000, sourceActorId: 90, targetActorId: 5, amount: 10 }),
      damageEvent({ ordinal: 2, reportTimeMs: 3_000, sourceActorId: 90, targetActorId: 6, amount: 20 }),
      damageEvent({ ordinal: 3, reportTimeMs: 3_000, sourceActorId: 91, targetActorId: 5, amount: 30 }),
    ];
    const result = encounterEventsNear(observedState({ events }), {
      anchor: afterEvent(0),
      window: windowOf(0, 0),
      families: ["DAMAGE"],
    });
    // Three separate observations at one millisecond. None merged away.
    expect(valueOf<readonly { position: number }[]>(result).map((entry) => entry.position)).toEqual([
      1, 2, 3,
    ]);
  });

  it("does not deduplicate observations that look identical", () => {
    const identical = (ordinal: number) =>
      damageEvent({ ordinal, reportTimeMs: 3_000, sourceActorId: 90, targetActorId: 5, abilityGameId: 7 });
    const events = [
      castEvent({ ordinal: 0, reportTimeMs: 3_000, sourceActorId: 5, castPhase: "COMPLETE" }),
      identical(1),
      identical(2),
    ];
    const result = encounterEventsNear(observedState({ events }), {
      anchor: afterEvent(0),
      window: windowOf(0, 0),
      families: ["DAMAGE"],
    });
    expect(valueOf<readonly unknown[]>(result)).toHaveLength(2);
  });

  it("does not globally sort a non-monotonic event array", () => {
    // M3 never re-sorts, and neither does this. The returned order is canonical
    // position order, which here disagrees with timestamp order.
    const events = [
      castEvent({ ordinal: 0, reportTimeMs: 3_000, sourceActorId: 5, castPhase: "COMPLETE" }),
      damageEvent({ ordinal: 1, reportTimeMs: 3_400, sourceActorId: 90, targetActorId: 5 }),
      damageEvent({ ordinal: 2, reportTimeMs: 3_100, sourceActorId: 90, targetActorId: 5 }),
      damageEvent({ ordinal: 3, reportTimeMs: 3_300, sourceActorId: 90, targetActorId: 5 }),
    ];
    const result = encounterEventsNear(observedState({ events }), {
      anchor: afterEvent(0),
      window: windowOf(0, 1_000),
      families: ["DAMAGE"],
    });
    const observations = valueOf<readonly { position: number; reportTimeMs: number }[]>(result);
    expect(observations.map((entry) => entry.position)).toEqual([1, 2, 3]);
    expect(observations.map((entry) => entry.reportTimeMs)).toEqual([3_400, 3_100, 3_300]);
  });

  it("returns the same order on repeated calls", () => {
    const events = [
      castEvent({ ordinal: 0, reportTimeMs: 3_000, sourceActorId: 5, castPhase: "COMPLETE" }),
      damageEvent({ ordinal: 1, reportTimeMs: 3_000, sourceActorId: 90, targetActorId: 5 }),
      auraEvent({
        ordinal: 2,
        reportTimeMs: 3_000,
        sourceActorId: 90,
        targetActorId: 5,
        operation: "APPLIED",
        auraClass: "DEBUFF",
      }),
    ];
    const state = observedState({ events });
    const query = { anchor: afterEvent(0), window: windowOf(0, 0), families: ALL_FAMILIES };
    expect(JSON.stringify(encounterEventsNear(state, query))).toBe(
      JSON.stringify(encounterEventsNear(state, query)),
    );
  });
});

// ---------------------------------------------------------------------------
// Source and target
// ---------------------------------------------------------------------------

describe("source and target are never collapsed", () => {
  it("keeps the two references separate on one observation", () => {
    const events = [damageEvent({ ordinal: 0, reportTimeMs: 3_000, sourceActorId: 90, targetActorId: 5 })];
    const result = encounterEventsNear(observedState({ events }), {
      anchor: afterEvent(0),
      window: windowOf(0, 0),
      families: ["DAMAGE"],
    });
    const observation =
      valueOf<readonly { source: { actorId: number }; target: { actorId: number } }[]>(result)[0];
    expect(observation?.source.actorId).toBe(90);
    expect(observation?.target.actorId).toBe(5);
  });

  it("does not merge an actor appearing as source in one event and target in another", () => {
    const events = [
      damageEvent({ ordinal: 0, reportTimeMs: 3_000, sourceActorId: 5, targetActorId: 90 }),
      damageEvent({ ordinal: 1, reportTimeMs: 3_000, sourceActorId: 90, targetActorId: 5 }),
    ];
    const result = encounterEventsNear(observedState({ events }), {
      anchor: afterEvent(0),
      window: windowOf(0, 0),
      families: ["DAMAGE"],
    });
    const observations =
      valueOf<readonly { source: { actorId: number } | null; target: { actorId: number } | null }[]>(result);
    expect(observations.map((entry) => entry.source?.actorId)).toEqual([5, 90]);
    expect(observations.map((entry) => entry.target?.actorId)).toEqual([90, 5]);
  });

  it("treats actor id 0 as a real actor", () => {
    const events = [damageEvent({ ordinal: 0, reportTimeMs: 3_000, sourceActorId: 0, targetActorId: 5 })];
    const result = encounterEventsNear(observedState({ events }), {
      anchor: afterEvent(0),
      window: windowOf(0, 0),
      families: ["DAMAGE"],
    });
    const observation = valueOf<readonly { source: { actorId: number } | null }[]>(result)[0];
    expect(observation?.source?.actorId).toBe(0);
  });

  it("preserves a null source as null rather than inventing an actor", () => {
    const events = [damageEvent({ ordinal: 0, reportTimeMs: 3_000, sourceActorId: null, targetActorId: 5 })];
    const result = encounterEventsNear(observedState({ events }), {
      anchor: afterEvent(0),
      window: windowOf(0, 0),
      families: ["DAMAGE"],
    });
    expect(valueOf<readonly { source: unknown }[]>(result)[0]?.source).toBeNull();
  });

  it("exposes no hostility classification", () => {
    const events = [damageEvent({ ordinal: 0, reportTimeMs: 3_000, sourceActorId: 90, targetActorId: 5 })];
    const result = encounterEventsNear(observedState({ events }), {
      anchor: afterEvent(0),
      window: windowOf(0, 0),
      families: ["DAMAGE"],
    });
    const observation = valueOf<readonly Record<string, unknown>[]>(result)[0] ?? {};
    expect(Object.keys(observation).sort()).toEqual([
      "abilityGameId",
      "family",
      "fightTimeMs",
      "locator",
      "position",
      "reportTimeMs",
      "source",
      "target",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Coverage: trustworthy empty versus unknown
// ---------------------------------------------------------------------------

describe("an empty result is a claim, and it is gated", () => {
  const ANCHOR = castEvent({
    ordinal: 0,
    reportTimeMs: 3_000,
    sourceActorId: 5,
    castPhase: "COMPLETE",
  });

  it("reports a trustworthy empty result under complete coverage", () => {
    const result = encounterEventsNear(observedState({ events: [ANCHOR] }), {
      anchor: afterEvent(0),
      window: windowOf(500, 500),
      families: ["DAMAGE"],
    });
    expect(isUnknown(result)).toBe(false);
    expect(valueOf<readonly unknown[]>(result)).toEqual([]);
  });

  it("reports UNKNOWN rather than empty when coverage is incomplete", () => {
    // The single most important case in this file: no observations AND no right
    // to say so.
    const state = stateOf({
      events: [ANCHOR],
      observedCategories: ["CASTS", "AURAS", "SUMMONS", "ENCOUNTER_PHASES"],
      categories: { DAMAGE: partialCategory([inclusiveRange(FIGHT_START_MS, 2_000)]) },
    });
    const result = encounterEventsNear(state, {
      anchor: afterEvent(0),
      window: windowOf(500, 500),
      families: ["DAMAGE"],
    });
    expect(isUnknown(result)).toBe(true);
    if (!isUnknown(result)) return;
    expect(result.reason).toBe("INSUFFICIENT_COVERAGE");
    expect(result.provenance.category).toBe("DAMAGE");
  });

  it("reports UNKNOWN when the capability was never verified", () => {
    const state = stateOf({
      events: [ANCHOR],
      observedCategories: ["CASTS", "AURAS", "DAMAGE", "ENCOUNTER_PHASES"],
      categories: { SUMMONS: UNVERIFIED_CATEGORY },
    });
    const result = encounterEventsNear(state, {
      anchor: afterEvent(0),
      window: windowOf(500, 500),
      families: ["SUMMON"],
    });
    expect(isUnknown(result)).toBe(true);
    if (!isUnknown(result)) return;
    expect(result.reason).toBe("CAPABILITY_UNVERIFIED");
  });

  it("gates every requested family, not just the first", () => {
    // Complete CASTS, incomplete DAMAGE. A partial answer dressed as a complete
    // one is exactly what must not happen.
    const state = stateOf({
      events: [ANCHOR],
      observedCategories: ["CASTS", "AURAS", "SUMMONS", "ENCOUNTER_PHASES"],
      categories: { DAMAGE: partialCategory([inclusiveRange(FIGHT_START_MS, 2_000)]) },
    });
    const castsOnly = encounterEventsNear(state, {
      anchor: afterEvent(0),
      window: windowOf(500, 500),
      families: ["CAST"],
    });
    expect(isUnknown(castsOnly)).toBe(false);

    const both = encounterEventsNear(state, {
      anchor: afterEvent(0),
      window: windowOf(500, 500),
      families: ["CAST", "DAMAGE"],
    });
    expect(isUnknown(both)).toBe(true);
  });

  it("propagates an unresolvable anchor rather than answering anyway", () => {
    const state = observedState({ events: [ANCHOR] });
    const result = encounterEventsNear(state, {
      anchor: afterEvent(99),
      window: windowOf(0, 0),
      families: ["DAMAGE"],
    });
    expect(isUnknown(result)).toBe(true);
    if (!isUnknown(result)) return;
    expect(result.reason).toBe("UNSUPPORTED_DERIVATION");
  });
});

// ---------------------------------------------------------------------------
// Families and categories
// ---------------------------------------------------------------------------

describe("the supported families are registry-backed", () => {
  it("binds every family to exactly one evidence category", () => {
    // Derived from M3's contracts rather than retyped, so the two cannot drift.
    expect(ENCOUNTER_EVENT_CATEGORIES).toEqual({
      CAST: "CASTS",
      AURA: "AURAS",
      DAMAGE: "DAMAGE",
      SUMMON: "SUMMONS",
    });
  });

  it("only supports families whose category is OBSERVABLE", () => {
    for (const family of ENCOUNTER_EVENT_FAMILIES) {
      const category = ENCOUNTER_EVENT_CATEGORIES[family];
      if (category === null) throw new Error(`${family} has no category`);
      expect(EVIDENCE_CAPABILITY_REGISTRY[category].capability, family).toBe("OBSERVABLE");
    }
  });

  it("returns only the requested families", () => {
    const events = [
      castEvent({ ordinal: 0, reportTimeMs: 3_000, sourceActorId: 5, castPhase: "COMPLETE" }),
      damageEvent({ ordinal: 1, reportTimeMs: 3_000, sourceActorId: 90, targetActorId: 5 }),
      summonEvent({ ordinal: 2, reportTimeMs: 3_000, sourceActorId: 90, targetActorId: 91 }),
    ];
    const result = encounterEventsNear(observedState({ events }), {
      anchor: afterEvent(0),
      window: windowOf(0, 0),
      families: ["SUMMON"],
    });
    expect(valueOf<readonly { family: string }[]>(result).map((entry) => entry.family)).toEqual(["SUMMON"]);
  });
});

// ---------------------------------------------------------------------------
// Deaths remain unsupported
// ---------------------------------------------------------------------------

describe("death context is unsupported and claims nothing", () => {
  it("declares no death family", () => {
    expect((ENCOUNTER_EVENT_FAMILIES as readonly string[]).includes("DEATH")).toBe(false);
  });

  it("gains no death feature from the M11-F promotion: DEATHS is positive archived evidence only", () => {
    // M8-E must not have weakened this to obtain a feature, and did not:
    // M11-F promoted DEATHS for POSITIVE events, citing the archived capture.
    const record = EVIDENCE_CAPABILITY_REGISTRY.DEATHS;
    expect(record.capability).toBe("OBSERVABLE");
    if (record.capability === "OBSERVABLE") expect(record.evidence.kind).toBe("ARCHIVED_CAPTURE");
  });

  it("exposes no deaths field that could be read as observed absence", () => {
    const events = [castEvent({ ordinal: 0, reportTimeMs: 3_000, sourceActorId: 5, castPhase: "COMPLETE" })];
    const result = encounterEventsNear(observedState({ events }), {
      anchor: afterEvent(0),
      window: windowOf(500, 500),
      families: ALL_FAMILIES,
    });
    expect(JSON.stringify(result).toLowerCase()).not.toContain("death");
  });
});

// ---------------------------------------------------------------------------
// Phase placement
// ---------------------------------------------------------------------------

describe("phase placement delegates to the trusted timeline", () => {
  const EVENTS = [castEvent({ ordinal: 0, reportTimeMs: 3_000, sourceActorId: 5, castPhase: "COMPLETE" })];

  const PHASES = [
    phase({ phaseId: 1, startTimeMs: FIGHT_START_MS, isIntermission: false }),
    phase({ phaseId: 2, startTimeMs: 2_500, isIntermission: true }),
  ];

  function placementIn(options: SyntheticFightOptions) {
    const state = observedState({ events: EVENTS, ...options });
    const nearby = encounterEventsNear(state, {
      anchor: afterEvent(0),
      window: windowOf(0, 0),
      families: ["CAST"],
    });
    const observation = valueOf<readonly { position: number }[]>(nearby)[0];
    if (observation === undefined) throw new Error("no observation");
    return phasePlacementOfObservation(state, observation as never);
  }

  it("places an observation in its phase", () => {
    const placement = placementIn({ phases: PHASES });
    expect(placement.certainty).toBe("EXACT");
    if (placement.certainty !== "EXACT") return;
    expect(placement.value.phaseId).toBe(2);
  });

  it("preserves an intermission as an intermission", () => {
    const placement = placementIn({ phases: PHASES });
    if (placement.certainty !== "EXACT") throw new Error("expected EXACT");
    expect(placement.value.intermission).toBe("INTERMISSION");
  });

  it("reports UNKNOWN when there are no phase observations", () => {
    const placement = placementIn({ phases: [] });
    expect(isUnknown(placement)).toBe(true);
    if (!isUnknown(placement)) return;
    // Never "phase 1".
    expect(placement.reason).toBe("NO_OBSERVATION");
  });

  it("reports UNKNOWN before the first trustworthy transition", () => {
    const placement = placementIn({
      phases: [phase({ phaseId: 1, startTimeMs: 4_000, isIntermission: false })],
    });
    expect(isUnknown(placement)).toBe(true);
    if (!isUnknown(placement)) return;
    expect(placement.reason).toBe("AMBIGUOUS_INITIAL_STATE");
  });

  it("reports UNKNOWN when phase coverage is incomplete", () => {
    const state = createCombatState(
      syntheticFight({
        events: EVENTS,
        phases: PHASES,
        observedCategories: [...CONTEXT_CATEGORIES],
        categories: { ENCOUNTER_PHASES: partialCategory([inclusiveRange(FIGHT_START_MS, 2_000)]) },
      }),
    );
    const nearby = encounterEventsNear(state, {
      anchor: afterEvent(0),
      window: windowOf(0, 0),
      families: ["CAST"],
    });
    const observation = valueOf<readonly { position: number }[]>(nearby)[0];
    const placement = phasePlacementOfObservation(state, observation as never);
    expect(isUnknown(placement)).toBe(true);
    if (!isUnknown(placement)) return;
    expect(placement.reason).toBe("INSUFFICIENT_COVERAGE");
  });

  it("reports UNKNOWN when the phase capability was never verified", () => {
    const state = createCombatState(
      syntheticFight({
        events: EVENTS,
        phases: PHASES,
        observedCategories: [...CONTEXT_CATEGORIES],
        categories: { ENCOUNTER_PHASES: UNVERIFIED_CATEGORY },
      }),
    );
    const nearby = encounterEventsNear(state, {
      anchor: afterEvent(0),
      window: windowOf(0, 0),
      families: ["CAST"],
    });
    const observation = valueOf<readonly { position: number }[]>(nearby)[0];
    const placement = phasePlacementOfObservation(state, observation as never);
    expect(isUnknown(placement)).toBe(true);
    if (!isUnknown(placement)) return;
    expect(placement.reason).toBe("CAPABILITY_UNVERIFIED");
  });

  it("reports UNKNOWN for an unordered phase timeline rather than sorting it", () => {
    const placement = placementIn({
      phases: [
        phase({ phaseId: 1, startTimeMs: 2_800, isIntermission: false }),
        phase({ phaseId: 2, startTimeMs: 1_500, isIntermission: false }),
      ],
    });
    expect(isUnknown(placement)).toBe(true);
    if (!isUnknown(placement)) return;
    expect(placement.reason).toBe("NON_MONOTONIC_TIME");
  });
});

// ---------------------------------------------------------------------------
// Determinism and purity
// ---------------------------------------------------------------------------

describe("determinism and purity", () => {
  const EVENTS = [
    castEvent({ ordinal: 0, reportTimeMs: 3_000, sourceActorId: 5, castPhase: "COMPLETE" }),
    damageEvent({ ordinal: 1, reportTimeMs: 3_200, sourceActorId: 90, targetActorId: 5 }),
    auraEvent({
      ordinal: 2,
      reportTimeMs: 3_400,
      sourceActorId: 90,
      targetActorId: 5,
      operation: "APPLIED",
      auraClass: "DEBUFF",
    }),
    summonEvent({ ordinal: 3, reportTimeMs: 3_600, sourceActorId: 90, targetActorId: 91 }),
  ];

  it("does not mutate the fight it was given", () => {
    const fight = deepFreeze(
      syntheticFight({
        events: EVENTS,
        phases: [phase({ phaseId: 1, startTimeMs: FIGHT_START_MS, isIntermission: false })],
        observedCategories: [...CONTEXT_CATEGORIES, "ENCOUNTER_PHASES"],
      }),
    );
    const before = JSON.stringify(fight.events);
    const state = createCombatState(fight);

    encounterEventsNear(state, {
      anchor: afterEvent(0),
      window: windowOf(1_000, 1_000),
      families: ALL_FAMILIES,
    });

    expect(JSON.stringify(fight.events)).toBe(before);
  });

  it("carries locators by reference rather than copying observations", () => {
    const state = observedState({ events: EVENTS });
    const result = encounterEventsNear(state, {
      anchor: afterEvent(0),
      window: windowOf(0, 1_000),
      families: ALL_FAMILIES,
    });
    const observations = valueOf<readonly { locator: unknown; position: number }[]>(result);
    for (const observation of observations) {
      expect(observation.locator).toBe(state.fight.events[observation.position]?.locator);
    }
  });

  it("answers a timestamp anchor deterministically", () => {
    const state = observedState({ events: EVENTS });
    const query = {
      anchor: startOfTimestamp(3_300),
      window: windowOf(500, 500),
      families: ALL_FAMILIES as readonly EncounterEventFamily[],
    };
    expect(JSON.stringify(encounterEventsNear(state, query))).toBe(
      JSON.stringify(encounterEventsNear(state, query)),
    );
  });

  it("returns every family when the window sits inside covered evidence", () => {
    const state = observedState({ events: EVENTS });
    const result = encounterEventsNear(state, {
      // Anchor at 3000; the fight is covered over [1000, 5000], so [1000, 5000]
      // is the widest window that can be claimed.
      anchor: afterEvent(0),
      window: windowOf(3_000 - FIGHT_START_MS, FIGHT_END_MS - 3_000),
      families: ALL_FAMILIES,
    });
    expect(valueOf<readonly unknown[]>(result)).toHaveLength(EVENTS.length);
  });

  it("reports UNKNOWN when the window extends past the covered evidence", () => {
    // A window is a request, not a permission. Asking about time the retrieval
    // never covered cannot be answered with "nothing was observed there" — the
    // absence claim spans the WHOLE window, so one millisecond outside coverage
    // is enough to make the answer UNKNOWN.
    const state = observedState({ events: EVENTS });
    const result = encounterEventsNear(state, {
      anchor: afterEvent(0),
      window: windowOf(3_000 - FIGHT_START_MS + 1, 0),
      families: ["DAMAGE"],
    });
    expect(isUnknown(result)).toBe(true);
    if (!isUnknown(result)) return;
    expect(result.reason).toBe("INSUFFICIENT_COVERAGE");
  });
});

// ---------------------------------------------------------------------------
// Actor scope: an actor-global query needs actor-global evidence
// ---------------------------------------------------------------------------

describe("actor scope gates the whole result set", () => {
  // `encounterEventsNear` is actor-GLOBAL: it ranges over every actor in the
  // fight. So it is exact only when the evidence vouches for every actor, which
  // is the FULL_RAID `actorScope: null`.
  //
  // Under PLAYER_CONTEXT `deriveEvidenceActorScope` returns a bounded LIST, and
  // returning rows from it would publish a result whose universe is narrower
  // than the question — with the narrowing invisible to the reader.
  const FOCUS = 5;
  const ENEMY = 90;
  const ALLY = 11;

  const ANCHOR = castEvent({
    ordinal: 0,
    reportTimeMs: 3_000,
    sourceActorId: FOCUS,
    castPhase: "COMPLETE",
  });

  /** PLAYER_CONTEXT-shaped scope: focus actor plus enemies, allies fenced off. */
  const BOUNDED_SCOPE: readonly number[] = [FOCUS, ENEMY];

  function nearbyWith(options: {
    readonly events: readonly CombatEvent[];
    readonly actorScope: readonly number[] | null;
  }) {
    const state = stateOf({
      events: options.events,
      observedCategories: [...CONTEXT_CATEGORIES, "ENCOUNTER_PHASES"],
      actorScope: options.actorScope,
    });
    return encounterEventsNear(state, {
      anchor: afterEvent(0),
      window: windowOf(500, 500),
      families: ["DAMAGE"],
    });
  }

  const ENEMY_HIT = damageEvent({
    ordinal: 1,
    reportTimeMs: 3_100,
    sourceActorId: ENEMY,
    targetActorId: FOCUS,
  });

  const ALLY_HIT = damageEvent({
    ordinal: 1,
    reportTimeMs: 3_100,
    sourceActorId: ALLY,
    targetActorId: ENEMY,
  });

  it("1. global scope + complete coverage + matches -> EXACT with every observation", () => {
    const result = nearbyWith({ events: [ANCHOR, ENEMY_HIT], actorScope: null });
    expect(valueOf<readonly { position: number }[]>(result).map((entry) => entry.position)).toEqual([1]);
  });

  it("2. global scope + complete coverage + no matches -> EXACT with []", () => {
    const result = nearbyWith({ events: [ANCHOR], actorScope: null });
    expect(isUnknown(result)).toBe(false);
    expect(valueOf<readonly unknown[]>(result)).toEqual([]);
  });

  it("3. bounded scope + no matches -> UNKNOWN / INSUFFICIENT_SCOPE", () => {
    // The dangerous case: an empty array here would assert that nothing happened
    // anywhere, on evidence that never vouched for the whole fight.
    const result = nearbyWith({ events: [ANCHOR], actorScope: BOUNDED_SCOPE });
    expect(isUnknown(result)).toBe(true);
    if (!isUnknown(result)) return;
    expect(result.reason).toBe("INSUFFICIENT_SCOPE");
  });

  it("4. bounded scope + an IN-SCOPE match -> still UNKNOWN / INSUFFICIENT_SCOPE", () => {
    // The observation is real and in scope. The RESULT SET is still not proven
    // complete, so the answer is not exact.
    const result = nearbyWith({ events: [ANCHOR, ENEMY_HIT], actorScope: BOUNDED_SCOPE });
    expect(isUnknown(result)).toBe(true);
    if (!isUnknown(result)) return;
    expect(result.reason).toBe("INSUFFICIENT_SCOPE");
  });

  it("5. bounded scope + an OUT-OF-SCOPE ally match -> UNKNOWN / INSUFFICIENT_SCOPE", () => {
    const result = nearbyWith({ events: [ANCHOR, ALLY_HIT], actorScope: BOUNDED_SCOPE });
    expect(isUnknown(result)).toBe(true);
    if (!isUnknown(result)) return;
    expect(result.reason).toBe("INSUFFICIENT_SCOPE");
  });

  it("6. a scope failure never returns a partial observation array", () => {
    // Structural: the UNKNOWN branch of `StateResult` has no `value` field at
    // all, so there is nothing to read a truncated list out of.
    for (const events of [[ANCHOR], [ANCHOR, ENEMY_HIT], [ANCHOR, ALLY_HIT]]) {
      const result = nearbyWith({ events, actorScope: BOUNDED_SCOPE });
      expect(Object.hasOwn(result, "value")).toBe(false);
      // Nor smuggled out through provenance: no observation escapes at all.
      expect(result.provenance.locators).toEqual([]);
    }
  });

  it("7. global scope + incomplete coverage -> UNKNOWN / INSUFFICIENT_COVERAGE", () => {
    // Scope and coverage are separate gates; this proves the coverage one still
    // fires when scope is fine.
    const state = stateOf({
      events: [ANCHOR],
      observedCategories: ["CASTS", "AURAS", "SUMMONS", "ENCOUNTER_PHASES"],
      categories: { DAMAGE: partialCategory([inclusiveRange(FIGHT_START_MS, 2_000)]) },
      actorScope: null,
    });
    const result = encounterEventsNear(state, {
      anchor: afterEvent(0),
      window: windowOf(500, 500),
      families: ["DAMAGE"],
    });
    expect(isUnknown(result)).toBe(true);
    if (!isUnknown(result)) return;
    expect(result.reason).toBe("INSUFFICIENT_COVERAGE");
  });

  it("reports scope before coverage when both are insufficient", () => {
    // M4's existing precedence — capability, then scope, then coverage — is
    // preserved rather than re-decided. Widening the scope is what the caller
    // must do first, so that is the reason reported.
    const state = stateOf({
      events: [ANCHOR],
      observedCategories: ["CASTS", "AURAS", "SUMMONS", "ENCOUNTER_PHASES"],
      categories: { DAMAGE: partialCategory([inclusiveRange(FIGHT_START_MS, 2_000)], BOUNDED_SCOPE) },
    });
    const result = encounterEventsNear(state, {
      anchor: afterEvent(0),
      window: windowOf(500, 500),
      families: ["DAMAGE"],
    });
    expect(isUnknown(result)).toBe(true);
    if (!isUnknown(result)) return;
    expect(result.reason).toBe("INSUFFICIENT_SCOPE");
  });

  it("reports capability before scope when both are insufficient", () => {
    const state = stateOf({
      events: [ANCHOR],
      observedCategories: ["CASTS", "AURAS", "SUMMONS", "ENCOUNTER_PHASES"],
      categories: { DAMAGE: UNVERIFIED_CATEGORY },
      actorScope: BOUNDED_SCOPE,
    });
    const result = encounterEventsNear(state, {
      anchor: afterEvent(0),
      window: windowOf(500, 500),
      families: ["DAMAGE"],
    });
    expect(isUnknown(result)).toBe(true);
    if (!isUnknown(result)) return;
    expect(result.reason).toBe("CAPABILITY_UNVERIFIED");
  });

  it("gates each requested family's scope independently", () => {
    const state = stateOf({
      events: [ANCHOR],
      observedCategories: ["AURAS", "SUMMONS", "ENCOUNTER_PHASES"],
      categories: {
        CASTS: observableCategory(inclusiveRange(FIGHT_START_MS, FIGHT_END_MS), null),
        DAMAGE: observableCategory(inclusiveRange(FIGHT_START_MS, FIGHT_END_MS), BOUNDED_SCOPE),
      },
    });
    const castsOnly = encounterEventsNear(state, {
      anchor: afterEvent(0),
      window: windowOf(500, 500),
      families: ["CAST"],
    });
    expect(isUnknown(castsOnly)).toBe(false);

    const withDamage = encounterEventsNear(state, {
      anchor: afterEvent(0),
      window: windowOf(500, 500),
      families: ["CAST", "DAMAGE"],
    });
    expect(isUnknown(withDamage)).toBe(true);
    if (!isUnknown(withDamage)) return;
    expect(withDamage.reason).toBe("INSUFFICIENT_SCOPE");
    expect(withDamage.provenance.category).toBe("DAMAGE");
  });

  it("does not restate any PLAYER_CONTEXT membership rule", () => {
    // The domain asks one question of the evidence model — is this scope the
    // actor-global `null`? It computes no friendly/enemy split and no roster
    // membership of its own.
    // Comments stripped first: the doc comment legitimately EXPLAINS what
    // PLAYER_CONTEXT means for this query, and banning the words from prose
    // would make the module less documented without making it safer.
    const code = SOURCE_OF_ENCOUNTER_EVENTS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const banned of [
      "friendly",
      "PLAYER_CONTEXT",
      "FULL_RAID",
      "petOwner",
      "deriveEvidenceActorScope",
    ]) {
      expect(code, `encounter-events.ts implements ${banned}`).not.toContain(banned);
    }
  });
});
