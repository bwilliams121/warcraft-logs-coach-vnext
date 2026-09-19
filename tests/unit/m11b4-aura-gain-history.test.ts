/**
 * M11-B4: the two aura-agnostic history primitives.
 *
 * `gainHistoryAt` — the last APPLIED / REFRESHED transition of one identity
 * before a position, everything observed on that identity since, and a
 * continuity claim FROM THE GAIN. `transitionsWithinBefore` — the transitions
 * of an identity ahead of a position inside a CALLER-supplied window, with
 * their leads. Neither knows a duration, a refresh rule, a class or a policy.
 *
 * Negative first: a gap between the gain and a later stack loss fails even
 * when `presenceAt` (which gates from the loss) would carry the loss forward;
 * an unowned or unidentified transition in the interval fails; no gain in the
 * prefix is UNKNOWN; a REMOVED transition is never a gain; the window is
 * inclusive at both edges and reads report time, not position adjacency.
 */

import { describe, expect, it } from "vitest";

import { inclusiveRange } from "../../src/engine/evidence/coverage.js";
import { anySource, fromSource } from "../../src/engine/auras/aura-state.js";
import { sourceRef, targetRef } from "../../src/engine/normalization/normalized-events.js";
import { createCombatState } from "../../src/engine/state/combat-state.js";
import { beforeEvent } from "../../src/engine/state/temporal.js";
import {
  auraEvent,
  castEvent,
  observableCategory,
  partialCategory,
  syntheticFight,
  type SyntheticFightOptions,
} from "../support/synthetic-fight.js";

const PLAYER = 14;
const OTHER = 9;
const BONE_SHIELD = 195181;

const identity = {
  target: targetRef(PLAYER, null),
  abilityGameId: BONE_SHIELD,
  auraClass: "BUFF" as const,
  source: fromSource(sourceRef(PLAYER, null)),
};

const bs = (
  ordinal: number,
  reportTimeMs: number,
  operation: "APPLIED" | "REFRESHED" | "REMOVED",
  stacks: number | null,
  sourceActorId: number | null = PLAYER,
) =>
  auraEvent({
    ordinal,
    reportTimeMs,
    operation,
    auraClass: "BUFF",
    isStackChange: stacks !== null,
    stacks,
    sourceActorId,
    targetActorId: PLAYER,
    abilityGameId: BONE_SHIELD,
  });
const cast = (ordinal: number, reportTimeMs: number) =>
  castEvent({
    ordinal,
    reportTimeMs,
    castPhase: "COMPLETE",
    sourceActorId: PLAYER,
    targetActorId: 22,
    abilityGameId: 49998,
  });

function stateOf(events: SyntheticFightOptions["events"], options: SyntheticFightOptions = {}) {
  return createCombatState(syntheticFight({ observedCategories: ["AURAS", "CASTS"], events, ...options }));
}

describe("gainHistoryAt", () => {
  it("locates the last gain and returns the stack losses since it, in order", () => {
    const state = stateOf([
      bs(0, 1000, "APPLIED", null),
      bs(1, 2000, "APPLIED", 6),
      bs(2, 3000, "REMOVED", 5),
      bs(3, 4000, "REMOVED", 4),
      cast(4, 5000),
    ]);
    const history = state.auras.gainHistoryAt({ ...identity, at: beforeEvent(4) });
    expect(history.certainty).toBe("EXACT");
    if (history.certainty !== "EXACT") return;
    expect(history.value.gain).toMatchObject({
      position: 1,
      operation: "APPLIED",
      isStackChange: true,
      reportTimeMs: 2000,
    });
    expect(
      history.value.since.map((entry) => [entry.position, entry.operation, entry.observedStacks]),
    ).toEqual([
      [2, "REMOVED", 5],
      [3, "REMOVED", 4],
    ]);
    expect(history.provenance.locators).toHaveLength(3);
  });

  it("treats a REFRESHED transition as a gain and a REMOVED one never — even a stack removal that proves presence", () => {
    const state = stateOf([
      bs(0, 1000, "APPLIED", 6),
      bs(1, 2000, "REFRESHED", null),
      bs(2, 3000, "REMOVED", 5),
      cast(3, 5000),
    ]);
    const history = state.auras.gainHistoryAt({ ...identity, at: beforeEvent(3) });
    expect(history.certainty === "EXACT" && history.value.gain.position).toBe(1);
    // presenceAt anchors on the later stack removal; the gain history does not.
    const presence = state.auras.presenceAt({ ...identity, at: beforeEvent(3) });
    expect(presence.certainty === "EXACT" && presence.value.anchor.position).toBe(2);
  });

  it("is UNKNOWN when only a stack removal precedes the position — no gain observed", () => {
    const state = stateOf([bs(0, 1000, "REMOVED", 5), cast(1, 5000)]);
    const history = state.auras.gainHistoryAt({ ...identity, at: beforeEvent(1) });
    expect(history.certainty).toBe("UNKNOWN");
    if (history.certainty !== "UNKNOWN") return;
    expect(history.reason).toBe("AMBIGUOUS_INITIAL_STATE");
    // While presence is EXACT ACTIVE from the removal: the two questions differ.
    expect(state.auras.presenceAt({ ...identity, at: beforeEvent(1) })).toMatchObject({
      certainty: "EXACT",
      value: { presence: "ACTIVE" },
    });
  });

  it("is UNKNOWN for an ANY_SOURCE query: the union has no single history", () => {
    const state = stateOf([bs(0, 1000, "APPLIED", null), cast(1, 5000)]);
    const history = state.auras.gainHistoryAt({ ...identity, source: anySource(), at: beforeEvent(1) });
    expect(history).toMatchObject({ certainty: "UNKNOWN", reason: "UNSUPPORTED_DERIVATION" });
  });

  it("does not consult a gain at or after the position (BEFORE_EVENT)", () => {
    const state = stateOf([bs(0, 1000, "APPLIED", null), cast(1, 5000), bs(2, 5000, "REFRESHED", null)]);
    const history = state.auras.gainHistoryAt({ ...identity, at: beforeEvent(1) });
    expect(history.certainty === "EXACT" && history.value.gain.position).toBe(0);
    expect(history.certainty === "EXACT" && history.value.since).toEqual([]);
  });

  it("fails on a coverage gap between the gain and a later stack loss, where presenceAt alone would carry the loss forward", () => {
    // AURAS complete only from 2,500 ms: the gain at 1,000 is observed, the
    // interval to the loss at 3,000 is not.
    const state = stateOf([bs(0, 1000, "APPLIED", 6), bs(1, 3000, "REMOVED", 5), cast(2, 5000)], {
      categories: {
        AURAS: partialCategory([inclusiveRange(2500, 10000)]),
        CASTS: observableCategory(inclusiveRange(0, 10000)),
      },
    });
    const presence = state.auras.presenceAt({ ...identity, at: beforeEvent(2) });
    expect(presence).toMatchObject({ certainty: "EXACT", value: { presence: "ACTIVE" } });
    const history = state.auras.gainHistoryAt({ ...identity, at: beforeEvent(2) });
    expect(history.certainty).toBe("UNKNOWN");
    if (history.certainty !== "UNKNOWN") return;
    expect(history.reason).toBe("INSUFFICIENT_COVERAGE");
    expect(history.provenance.locators).toHaveLength(1);
  });

  it("fails on a transition of unknown ownership between the gain and the position", () => {
    const state = stateOf([bs(0, 1000, "APPLIED", 6), bs(1, 2000, "REFRESHED", null, null), cast(2, 5000)]);
    const history = state.auras.gainHistoryAt({ ...identity, at: beforeEvent(2) });
    expect(history).toMatchObject({ certainty: "UNKNOWN", reason: "UNSUPPORTED_DERIVATION" });
  });

  it("ignores another KNOWN source's transitions entirely — a different aura", () => {
    const state = stateOf([
      bs(0, 1000, "APPLIED", 6),
      bs(1, 2000, "REFRESHED", null, OTHER),
      bs(2, 3000, "REMOVED", null, OTHER),
      cast(3, 5000),
    ]);
    const history = state.auras.gainHistoryAt({ ...identity, at: beforeEvent(3) });
    expect(history.certainty === "EXACT" && history.value.gain.position).toBe(0);
    expect(history.certainty === "EXACT" && history.value.since).toEqual([]);
  });
});

describe("transitionsWithinBefore", () => {
  const events = [
    bs(0, 1000, "APPLIED", 6),
    bs(1, 4949, "REMOVED", 5), // lead 51
    bs(2, 4950, "APPLIED", 6), // lead 50
    bs(3, 4980, "REFRESHED", null), // lead 20
    bs(4, 4999, "REMOVED", 5), // lead 1
    bs(5, 5000, "APPLIED", 6), // lead 0, ahead of the cast in order
    cast(6, 5000),
    bs(7, 5000, "REFRESHED", null), // after the cast in order: never returned
  ];
  const state = stateOf(events);

  it.each([
    [0, [0]],
    [1, [1, 0]],
    [20, [20, 1, 0]],
    [50, [50, 20, 1, 0]],
    [51, [51, 50, 20, 1, 0]],
  ])("with a %d ms window returns leads %j (inclusive at both edges, canonical order)", (windowMs, leads) => {
    const found = state.auras.transitionsWithinBefore(identity, 6, windowMs);
    expect(found.map((entry) => entry.leadMs)).toEqual(leads);
  });

  it("never returns a transition at or after the position, whatever its timestamp", () => {
    const found = state.auras.transitionsWithinBefore(identity, 6, 10_000);
    expect(found.map((entry) => entry.observation.position)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(found.some((entry) => entry.observation.position >= 6)).toBe(false);
  });

  it("returns nothing for a position holding no event, and nothing for another identity", () => {
    expect(state.auras.transitionsWithinBefore(identity, 99, 50)).toEqual([]);
    expect(state.auras.transitionsWithinBefore({ ...identity, abilityGameId: 1 }, 6, 50)).toEqual([]);
  });

  it("reads report time, not adjacency: a transition 60 ms before is outside a 50 ms window even when it is the previous event", () => {
    const sparse = stateOf([bs(0, 4940, "APPLIED", 6), cast(1, 5000)]);
    expect(sparse.auras.transitionsWithinBefore(identity, 1, 50)).toEqual([]);
    expect(sparse.auras.transitionsWithinBefore(identity, 1, 60).map((entry) => entry.leadMs)).toEqual([60]);
  });
});
