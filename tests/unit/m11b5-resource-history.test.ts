/**
 * M11-B5: the generic resource-history primitives.
 *
 * `resourceHistoryAt` — the latest attached observation of one actor's
 * resource before a position, every observation since it in order, under a
 * RESOURCES continuity claim FROM THE ANCHOR. `observationsWithinBefore` — the
 * observations ahead of a position inside a CALLER-supplied window, with
 * their leads. Neither knows a resource's meaning, a gain from a spend, or
 * any arithmetic: every entry carries its own OBSERVED amount and timing, and
 * the change's delta is exposed only beside its sign.
 *
 * Negative first: a coverage gap from the anchor fails even though
 * `latestObservedAtOrBefore` would still answer STALE; an unattributed
 * snapshot in the interval fails; no anchor is UNKNOWN; nothing at or after
 * the position is consulted; no state at the position is ever produced.
 */

import { describe, expect, it } from "vitest";

import { inclusiveRange } from "../../src/engine/evidence/coverage.js";
import { createCombatState } from "../../src/engine/state/combat-state.js";
import { beforeEvent } from "../../src/engine/state/temporal.js";
import {
  absentCategory,
  attachedResources,
  castEvent,
  classResource,
  observableCategory,
  partialCategory,
  resourceChangeEvent,
  syntheticFight,
  type SyntheticFightOptions,
} from "../support/synthetic-fight.js";

const ACTOR = 14;
const OTHER = 9;
const RP = 6;
const RUNES = 5;

const snap = (amount: number, extra: { max?: number; cost?: number; type?: number } = {}) =>
  attachedResources({
    side: "SOURCE",
    actorId: ACTOR,
    classResources: [
      classResource(extra.type ?? RP, amount, { max: extra.max ?? 1250, cost: extra.cost ?? null }),
    ],
  });
const change = (ordinal: number, reportTimeMs: number, delta: number, amount: number, actor = ACTOR) =>
  resourceChangeEvent({
    ordinal,
    reportTimeMs,
    sourceActorId: actor,
    targetActorId: actor,
    abilityGameId: 210738,
    resourceType: RP,
    resourceChange: delta,
    maxResourceAmount: 1250,
    attachedResources: attachedResources({
      side: "SOURCE",
      actorId: actor,
      classResources: [classResource(RP, amount, { max: 1250 })],
    }),
  });
const cast = (ordinal: number, reportTimeMs: number, abilityGameId: number, attached = snap(0)) =>
  castEvent({
    ordinal,
    reportTimeMs,
    castPhase: "COMPLETE",
    sourceActorId: ACTOR,
    targetActorId: 22,
    abilityGameId,
    attachedResources: attached,
  });

function stateOf(events: SyntheticFightOptions["events"], options: SyntheticFightOptions = {}) {
  return createCombatState(
    syntheticFight({ observedCategories: ["RESOURCES", "CASTS"], endTimeMs: 60_000, events, ...options }),
  );
}
const query = (position: number) => ({ actorId: ACTOR, resourceType: RP, at: beforeEvent(position) });

describe("resourceHistoryAt", () => {
  it("returns the latest anchor and every observation since, in order, each with its own amount and timing", () => {
    const state = stateOf([
      cast(0, 1000, 1, snap(100)), // uncosted: EVENT_ASSOCIATED
      change(1, 2000, 15, 250), // POST_CHANGE 250
      cast(2, 3000, 49998, snap(250, { cost: 450 })), // PRE_COST 250
      cast(3, 4000, 1, snap(0)), // uncosted 0 (whatever the game did)
      change(4, 5000, 2, 20),
      cast(5, 6000, 50842, snap(20)), // the decision
    ]);
    const history = state.resources.resourceHistoryAt(query(5));
    expect(history.certainty).toBe("EXACT");
    if (history.certainty !== "EXACT") return;
    // The anchor is the LATEST attached observation, whatever its tag: the
    // change at position 4.
    expect(history.value.anchor).toMatchObject({ position: 4, observedAmount: 20, timing: "POST_CHANGE" });
    expect(history.value.since).toEqual([]);
    // From an earlier boundary the walk is longer.
    const earlier = state.resources.resourceHistoryAt(query(4));
    if (earlier.certainty !== "EXACT") throw new Error("expected EXACT");
    expect(earlier.value.anchor).toMatchObject({
      position: 3,
      timing: "EVENT_ASSOCIATED",
      observedAmount: 0,
    });
    const full = state.resources.resourceHistoryAt({ ...query(4), at: beforeEvent(2) });
    if (full.certainty !== "EXACT") throw new Error("expected EXACT");
    expect(full.value.anchor).toMatchObject({ position: 1, timing: "POST_CHANGE", observedAmount: 250 });
  });

  it("lists, after the anchor, a change of the actor's resource that carries NO attachment of it — the one shape a caller cannot read a state from", () => {
    const state = stateOf([
      change(0, 1000, 10, 100),
      resourceChangeEvent({
        ordinal: 1,
        reportTimeMs: 2000,
        sourceActorId: ACTOR,
        targetActorId: ACTOR,
        abilityGameId: 210738,
        resourceType: RP,
        resourceChange: -5,
        maxResourceAmount: 1250,
        attachedResources: attachedResources({ side: "SOURCE", actorId: ACTOR, classResources: [] }),
      }),
      cast(2, 5000, 50842, snap(100)),
    ]);
    const history = state.resources.resourceHistoryAt(query(2));
    if (history.certainty !== "EXACT") throw new Error("expected EXACT");
    expect(history.value.anchor.position).toBe(0);
    expect(
      history.value.since.map((e) => [e.position, e.snapshot, e.changeSign, e.change?.resourceChange]),
    ).toEqual([[1, null, "NEGATIVE", -5]]);
    // Nothing here produced 50: the delta is reported beside its sign, not applied.
    expect(JSON.stringify(history.value)).not.toContain('"observedAmount":50');
  });

  it("returns the observations since the anchor in canonical order", () => {
    const state = stateOf([
      cast(0, 1000, 1, snap(100)),
      change(1, 2000, 15, 250),
      cast(2, 3000, 1, snap(250)),
      change(3, 4000, 2, 270),
      cast(4, 5000, 50842, snap(270)),
    ]);
    // The anchor is the LATEST attached observation, so with every event
    // carrying an attachment the list since it is empty: nothing between the
    // latest read state and the position was observed, and coverage says
    // nothing was missed.
    const history = state.resources.resourceHistoryAt(query(4));
    if (history.certainty !== "EXACT") throw new Error("expected EXACT");
    expect(history.value.anchor.position).toBe(3);
    expect(history.value.since).toEqual([]);
  });

  it("is UNKNOWN with NO_OBSERVATION when coverage proves the log carried none, and with the coverage reason otherwise", () => {
    const covered = stateOf([
      cast(0, 5000, 50842, attachedResources({ side: "SOURCE", actorId: ACTOR, classResources: [] })),
    ]);
    expect(covered.resources.resourceHistoryAt(query(0))).toMatchObject({
      certainty: "UNKNOWN",
      reason: "NO_OBSERVATION",
    });
    const uncovered = stateOf(
      [cast(0, 5000, 50842, attachedResources({ side: "SOURCE", actorId: ACTOR, classResources: [] }))],
      {
        categories: { RESOURCES: absentCategory(), CASTS: observableCategory(inclusiveRange(1000, 60_000)) },
      },
    );
    expect(uncovered.resources.resourceHistoryAt(query(0))).toMatchObject({
      certainty: "UNKNOWN",
      reason: "INSUFFICIENT_COVERAGE",
    });
  });

  it("fails on a RESOURCES gap between the anchor and the position, where latestObservedAtOrBefore still answers STALE", () => {
    const state = stateOf([change(0, 1000, 10, 100), cast(1, 5000, 50842, snap(100))], {
      categories: {
        RESOURCES: partialCategory([inclusiveRange(1000, 2500)]),
        CASTS: observableCategory(inclusiveRange(1000, 60_000)),
      },
    });
    const stale = state.resources.latestObservedAtOrBefore(query(1));
    expect(stale.certainty).toBe("STALE");
    const history = state.resources.resourceHistoryAt(query(1));
    expect(history).toMatchObject({ certainty: "UNKNOWN", reason: "INSUFFICIENT_COVERAGE" });
    expect(history.certainty === "UNKNOWN" && history.provenance.locators).toHaveLength(1);
  });

  it("fails on an unattributed snapshot inside the interval", () => {
    const state = stateOf([
      change(0, 1000, 10, 100),
      castEvent({
        ordinal: 1,
        reportTimeMs: 2000,
        castPhase: "COMPLETE",
        sourceActorId: OTHER,
        targetActorId: 22,
        abilityGameId: 1,
        attachedResources: attachedResources({
          side: "SOURCE",
          actorId: null,
          classResources: [classResource(RP, 500)],
        }),
      }),
      cast(2, 5000, 50842, snap(100)),
    ]);
    expect(state.resources.resourceHistoryAt(query(2))).toMatchObject({
      certainty: "UNKNOWN",
      reason: "UNSUPPORTED_DERIVATION",
    });
  });

  it("ignores another actor's changes and another resource's attachments", () => {
    const state = stateOf([
      change(0, 1000, 10, 100),
      change(1, 2000, 15, 900, OTHER),
      cast(2, 3000, 1, snap(3, { type: RUNES, max: 6 })),
      cast(3, 5000, 50842, snap(100)),
    ]);
    const history = state.resources.resourceHistoryAt(query(3));
    if (history.certainty !== "EXACT") throw new Error("expected EXACT");
    expect(history.value.anchor.position).toBe(0);
    expect(history.value.since).toEqual([]);
  });

  it("does not consult an observation at or after the position", () => {
    const state = stateOf([
      change(0, 1000, 10, 100),
      cast(1, 5000, 50842, snap(100)),
      change(2, 5000, 15, 250),
    ]);
    const history = state.resources.resourceHistoryAt(query(1));
    if (history.certainty !== "EXACT") throw new Error("expected EXACT");
    expect(history.value.anchor.position).toBe(0);
    expect(history.value.since).toEqual([]);
  });
});

describe("observationsWithinBefore", () => {
  const state = stateOf([
    change(0, 1000, 10, 100),
    change(1, 4998, 2, 120), // lead 2
    change(2, 4999, 2, 140), // lead 1
    change(3, 5000, 2, 160), // lead 0, ahead in order
    cast(4, 5000, 206930, snap(160)),
    change(5, 5000, 15, 310), // after the cast in order: never returned
  ]);

  it.each([
    [0, [0]],
    [1, [1, 0]],
    [2, [2, 1, 0]],
  ])("with a %d ms window returns leads %j (inclusive at both edges)", (windowMs, leads) => {
    expect(state.resources.observationsWithinBefore(ACTOR, RP, 4, windowMs).map((w) => w.leadMs)).toEqual(
      leads,
    );
  });

  it("returns entries with their observed amounts and signs, never a summed state", () => {
    const found = state.resources.observationsWithinBefore(ACTOR, RP, 4, 1);
    expect(
      found.map((w) => [w.entry.snapshot?.observedAmount, w.entry.changeSign, w.entry.snapshot?.timing]),
    ).toEqual([
      [140, "NON_NEGATIVE", "POST_CHANGE"],
      [160, "NON_NEGATIVE", "POST_CHANGE"],
    ]);
    expect(found.some((w) => w.entry.position >= 4)).toBe(false);
  });

  it("returns nothing for a position holding no event, or for another actor", () => {
    expect(state.resources.observationsWithinBefore(ACTOR, RP, 99, 50)).toEqual([]);
    expect(state.resources.observationsWithinBefore(OTHER, RP, 4, 50)).toEqual([]);
  });
});
