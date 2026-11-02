/**
 * M13-A: the shared support primitives (src/support/).
 *
 * The negative cases matter most:
 * - a missing removal is never an expiry: the window's end is NOT_OBSERVED,
 *   and no duration is computed;
 * - a window first seen as a refresh or removal has an UNOBSERVED start;
 * - another source's aura is a different aura, and an UNSTATED source is never
 *   read through;
 * - an empty window list is complete only under COMPLETE AURAS coverage;
 * - no death event is never "alive"; a death at a span bound is flagged;
 * - recipient cooldown overlap needs a supplied identity, and an empty list
 *   is complete only under COMPLETE CASTS coverage;
 * - a pet's owner is WCL petOwner only;
 * - proven support time is never exact: initial (carried-in) state is never
 *   resolved by coverage, so it is a lower bound or UNKNOWN.
 */

import { describe, expect, it } from "vitest";

import { inclusiveRange } from "../../../src/engine/evidence/coverage.js";
import type { CombatActor } from "../../../src/engine/normalization/actors.js";
import type { CombatFight } from "../../../src/engine/normalization/combat-fight.js";
import type { CategoryEvidence } from "../../../src/engine/normalization/completeness.js";
import { createNormalizer } from "../../../src/engine/normalization/event-normalizer.js";
import { VERIFIED_DIRECTION_FIELDS } from "../../../src/engine/normalization/raw-event-fields.js";
import {
  indexContracts,
  SUPPORTED_TYPE_CONTRACTS,
} from "../../../src/engine/normalization/supported-families.js";
import {
  recipientCooldownOverlap,
  recipientSurvivalDuring,
  supportTimeOf,
} from "../../../src/support/recipient-facts.js";
import { supportAuraWindowsOf, type SupportAuraWindow } from "../../../src/support/support-aura-windows.js";
import type { EvidenceCategory } from "../../../src/wcl/evidence-capability.js";
import {
  absentCategory,
  observableCategory,
  partialCategory,
  syntheticFight,
} from "../../support/synthetic-fight.js";

type Raw = Record<string, unknown>;
const START = 1_000;
const END = 100_000;
const WHOLE = inclusiveRange(START, END);
const SUPPORTER = 1;
const ALLY = 4;
const OTHER_ALLY = 6;
const OTHER_SUPPORTER = 8;
const OWNED_PET = 50;
const UNOWNED_PET = 52;
const BUFF = 410089;
const OTHER_BUFF = 395152;
const COOLDOWN = 12345;

const actor = (actorId: number, subType: string, rawType = "Player", petOwnerActorId: number | null = null) =>
  ({
    actorId,
    gameId: null,
    name: null,
    server: null,
    actorType: rawType === "Player" ? "PLAYER" : rawType === "Pet" ? "PET" : "NPC",
    rawType,
    subType,
    petOwnerActorId,
  }) satisfies CombatActor;

const ACTORS = new Map<number, CombatActor>([
  [SUPPORTER, actor(SUPPORTER, "Evoker")],
  [ALLY, actor(ALLY, "Warrior")],
  [OTHER_ALLY, actor(OTHER_ALLY, "Mage")],
  [OTHER_SUPPORTER, actor(OTHER_SUPPORTER, "Evoker")],
  [OWNED_PET, actor(OWNED_PET, "Pet", "Pet", ALLY)],
  [UNOWNED_PET, actor(UNOWNED_PET, "Pet", "Pet", null)],
]);

function fightOf(
  raw: readonly Raw[],
  categories: Partial<Record<EvidenceCategory, CategoryEvidence>> = {},
): CombatFight {
  const normalizer = createNormalizer({
    fightStartTimeMs: START,
    requestedRange: WHOLE,
    contracts: indexContracts(SUPPORTED_TYPE_CONTRACTS),
    directionFields: VERIFIED_DIRECTION_FIELDS,
  });
  normalizer.accept({
    streamId: "all",
    pageOrdinal: 0,
    requestedStartTimeMs: START,
    nextPageTimestamp: null,
    events: raw,
  });
  const output = normalizer.finish();
  return syntheticFight({
    events: output.events,
    malformedObservations: output.malformedObservations,
    startTimeMs: START,
    endTimeMs: END,
    categories: {
      AURAS: observableCategory(WHOLE, null),
      CASTS: observableCategory(WHOLE, null),
      DEATHS: observableCategory(WHOLE, null),
      ...categories,
    },
    actors: ACTORS,
    scope: "FULL_RAID",
    friendlyActorsInScope: [SUPPORTER, ALLY, OTHER_ALLY, OTHER_SUPPORTER],
  });
}

const aura = (
  timestamp: number,
  type: string,
  target: number,
  ability = BUFF,
  source: number | null = SUPPORTER,
  extra: Raw = {},
): Raw => ({
  timestamp,
  type,
  ...(source === null ? {} : { sourceID: source }),
  targetID: target,
  abilityGameID: ability,
  fight: 1,
  ...extra,
});
const cast = (timestamp: number, source: number, ability: number): Raw => ({
  timestamp,
  type: "cast",
  sourceID: source,
  targetID: -1,
  abilityGameID: ability,
  fight: 1,
});
const death = (timestamp: number, target: number): Raw => ({
  timestamp,
  type: "death",
  sourceID: -1,
  targetID: target,
  abilityGameID: 0,
  fight: 1,
});

/** Events in timestamp order (stable), as Warcraft Logs retrieves them. */
const byTime = (events: readonly Raw[]): Raw[] =>
  [...events].sort((a, b) => (a["timestamp"] as number) - (b["timestamp"] as number));

const windowsOf = (fight: CombatFight, ids: readonly number[] = [BUFF]) =>
  supportAuraWindowsOf(fight, { supporterActorId: SUPPORTER, auraAbilityGameIds: ids });

const only = (windows: readonly SupportAuraWindow[]): SupportAuraWindow => {
  expect(windows).toHaveLength(1);
  const [window] = windows;
  if (window === undefined) throw new Error("no window");
  return window;
};

describe("support aura windows", () => {
  it("an applied-then-removed buff is one window with both bounds observed and its exact length", () => {
    const fight = fightOf([
      aura(10_000, "applybuff", ALLY),
      aura(15_000, "refreshbuff", ALLY),
      aura(28_000, "removebuff", ALLY),
    ]);
    const listed = windowsOf(fight);
    const window = only(listed.windows);
    expect(window.start).toMatchObject({ kind: "OBSERVED", reportTimeMs: 10_000 });
    expect(window.end).toMatchObject({ kind: "OBSERVED", reportTimeMs: 28_000 });
    expect(window.activeObservations.map((entry) => entry.reportTimeMs)).toEqual([15_000]);
    expect(window.boundsDistanceMs).toBe(18_000);
    expect(window.observedSpan).toEqual(inclusiveRange(10_000, 28_000));
    expect(window.recipientIdentity).toEqual({
      catalog: "LISTED",
      actorType: "PLAYER",
      subType: "Warrior",
      ownership: { kind: "NOT_A_PET" },
      isSupporter: false,
    });
    expect(listed.listing).toEqual({ state: "COMPLETE" });
  });

  it("a missing removal is NOT an expiry: the end is NOT_OBSERVED and no duration is computed", () => {
    const window = only(windowsOf(fightOf([aura(10_000, "applybuff", ALLY)])).windows);
    expect(window.end).toEqual({ kind: "NOT_OBSERVED", reason: "NO_REMOVAL_OBSERVED" });
    expect(window.boundsDistanceMs).toBeNull();
    // Proven only at the application instant: never extended to the fight end or a nominal duration.
    expect(window.observedSpan).toEqual(inclusiveRange(10_000, 10_000));
  });

  it("a window first seen as a refresh or a removal has an UNOBSERVED start", () => {
    const refreshed = only(
      windowsOf(fightOf([aura(5_000, "refreshbuff", ALLY), aura(9_000, "removebuff", ALLY)])).windows,
    );
    expect(refreshed.start).toEqual({
      kind: "NOT_OBSERVED",
      reason: "FIRST_OBSERVED_TRANSITION_IS_NOT_AN_APPLICATION",
    });
    expect(refreshed.observedSpan).toEqual(inclusiveRange(5_000, 9_000));
    const removed = only(windowsOf(fightOf([aura(9_000, "removebuff", ALLY)])).windows);
    expect(removed.start.kind).toBe("NOT_OBSERVED");
    expect(removed.boundsDistanceMs).toBeNull();
  });

  it("a second application without a removal ends the first window UNOBSERVED", () => {
    const listed = windowsOf(
      fightOf([
        aura(10_000, "applybuff", ALLY),
        aura(20_000, "applybuff", ALLY),
        aura(30_000, "removebuff", ALLY),
      ]),
    );
    expect(listed.windows.map((window) => [window.start.kind, window.end.kind])).toEqual([
      ["OBSERVED", "NOT_OBSERVED"],
      ["OBSERVED", "OBSERVED"],
    ]);
    expect(listed.windows[0]?.end).toEqual({
      kind: "NOT_OBSERVED",
      reason: "REAPPLIED_WITHOUT_OBSERVED_REMOVAL",
    });
  });

  it("another supporter's buff of the same id is a different aura: never this supporter's window", () => {
    const fight = fightOf([
      aura(10_000, "applybuff", ALLY, BUFF, OTHER_SUPPORTER),
      aura(12_000, "removebuff", ALLY, BUFF, OTHER_SUPPORTER),
    ]);
    expect(windowsOf(fight).windows).toEqual([]);
  });

  it("an unstated source might be the supporter's: listed, and a window it falls in is not read through", () => {
    const fight = fightOf([
      aura(10_000, "applybuff", ALLY),
      aura(14_000, "removebuff", ALLY, BUFF, null),
      aura(20_000, "removebuff", ALLY),
    ]);
    const listed = windowsOf(fight);
    expect(listed.ambiguousTransitions.map((entry) => [entry.reportTimeMs, entry.ambiguity])).toEqual([
      [14_000, "SOURCE_NOT_STATED"],
    ]);
    expect(listed.listing).toEqual({ state: "OBSERVED_ONLY", reason: "AMBIGUOUS_TRANSITIONS" });
    const window = only(listed.windows);
    expect(window.continuity).toEqual({ state: "NOT_ESTABLISHED", reason: "AMBIGUOUS_TRANSITION_INSIDE" });
    expect(window.activeSpan).toBeNull();
    // The unattributed removal at 14 s may have ended this aura: not even "at least 10 s".
    expect(supportTimeOf(listed, [BUFF]).anyRecipient).toEqual({
      bound: "UNKNOWN",
      why: ["INITIAL_STATE_NOT_RESOLVED", "LISTING_OBSERVED_ONLY", "CONTINUITY_NOT_ESTABLISHED"],
    });
  });

  it("source-less windows only: the listing is never COMPLETE and support time never an exact zero", () => {
    const fight = fightOf([
      aura(10_000, "applybuff", ALLY, BUFF, null),
      aura(20_000, "removebuff", ALLY, BUFF, null),
    ]);
    const listed = windowsOf(fight);
    expect(listed.windows).toEqual([]);
    expect(listed.listing).toEqual({ state: "OBSERVED_ONLY", reason: "AMBIGUOUS_TRANSITIONS" });
    expect(supportTimeOf(listed, [BUFF]).anyRecipient).toEqual({
      bound: "UNKNOWN",
      why: ["INITIAL_STATE_NOT_RESOLVED", "LISTING_OBSERVED_ONLY"],
    });
  });

  it("a removal with no ability id inside an observed window could be this window's: continuity NOT_ESTABLISHED", () => {
    const { abilityGameID: _dropped, ...unidentified } = aura(14_000, "removebuff", ALLY);
    const fight = fightOf([aura(10_000, "applybuff", ALLY), unidentified, aura(20_000, "removebuff", ALLY)]);
    const listed = windowsOf(fight);
    expect(listed.ambiguousTransitions.map((entry) => entry.ambiguity)).toEqual(["ABILITY_NOT_STATED"]);
    expect(only(listed.windows).continuity).toEqual({
      state: "NOT_ESTABLISHED",
      reason: "AMBIGUOUS_TRANSITION_INSIDE",
    });
    // Another actor's ability-less buff is not this supporter's, and changes nothing.
    const other = fightOf([
      aura(10_000, "applybuff", ALLY),
      { ...unidentified, sourceID: OTHER_SUPPORTER },
      aura(20_000, "removebuff", ALLY),
    ]);
    expect(only(windowsOf(other).windows).continuity).toEqual({ state: "ESTABLISHED" });
    expect(windowsOf(other).listing).toEqual({ state: "COMPLETE" });
  });

  it("the supporter's buff with no stated target could be any recipient's: every window it falls in loses continuity", () => {
    const { targetID: _dropped, ...targetless } = aura(14_000, "removebuff", ALLY);
    const fight = fightOf([aura(10_000, "applybuff", ALLY), targetless, aura(20_000, "removebuff", ALLY)]);
    const listed = windowsOf(fight);
    expect(listed.ambiguousTransitions.map((entry) => entry.ambiguity)).toEqual(["TARGET_NOT_STATED"]);
    expect(only(listed.windows).activeSpan).toBeNull();
  });

  it("a coverage gap between two observations leaves continuity NOT_ESTABLISHED: no active span", () => {
    const fight = fightOf([aura(10_000, "applybuff", ALLY), aura(20_000, "removebuff", ALLY)], {
      AURAS: partialCategory([inclusiveRange(START, 12_000), inclusiveRange(18_000, END)]),
    });
    const window = only(windowsOf(fight).windows);
    expect(window.observedSpan).toEqual(inclusiveRange(10_000, 20_000));
    expect(window.boundsDistanceMs).toBe(10_000);
    expect(window.continuity).toEqual({ state: "NOT_ESTABLISHED", reason: "INSUFFICIENT_COVERAGE" });
    expect(window.activeSpan).toBeNull();
    expect(supportTimeOf(windowsOf(fight), [BUFF]).peakConcurrentWindows).toEqual({ bound: "UNKNOWN" });
  });

  it("COMPLETE coverage and no ambiguous transition establish continuity: the active span is the observed span", () => {
    const window = only(
      windowsOf(fightOf([aura(10_000, "applybuff", ALLY), aura(20_000, "removebuff", ALLY)])).windows,
    );
    expect(window.continuity).toEqual({ state: "ESTABLISHED" });
    expect(window.activeSpan).toEqual(inclusiveRange(10_000, 20_000));
  });

  it("only the asked ability ids: an unregistered aura of the supporter is not a support window", () => {
    const fight = fightOf([
      aura(10_000, "applybuff", ALLY, OTHER_BUFF),
      aura(12_000, "removebuff", ALLY, OTHER_BUFF),
    ]);
    expect(windowsOf(fight).windows).toEqual([]);
    expect(windowsOf(fight, [OTHER_BUFF]).windows).toHaveLength(1);
  });

  it("an empty list is complete only under COMPLETE AURAS coverage; otherwise it is OBSERVED_ONLY", () => {
    expect(windowsOf(fightOf([])).listing).toEqual({ state: "COMPLETE" });
    expect(windowsOf(fightOf([], { AURAS: absentCategory() })).listing).toEqual({
      state: "OBSERVED_ONLY",
      reason: "INSUFFICIENT_COVERAGE",
    });
    expect(
      windowsOf(fightOf([], { AURAS: partialCategory([inclusiveRange(START, 50_000)]) })).listing.state,
    ).toBe("OBSERVED_ONLY");
    // Coverage vouching for other actors only does not vouch for the supporter.
    expect(windowsOf(fightOf([], { AURAS: observableCategory(WHOLE, [ALLY]) })).listing).toEqual({
      state: "OBSERVED_ONLY",
      reason: "INSUFFICIENT_SCOPE",
    });
  });

  it("a pet recipient's owner is WCL petOwner only; a pet without one is OWNER_NOT_STATED", () => {
    const fight = fightOf([
      aura(10_000, "applybuff", OWNED_PET, BUFF, SUPPORTER, { targetInstance: 2 }),
      aura(11_000, "applybuff", UNOWNED_PET, BUFF, SUPPORTER, { targetInstance: 1 }),
      aura(12_000, "applybuff", 999),
    ]);
    const identities = windowsOf(fight).windows.map((window) => [window.recipient, window.recipientIdentity]);
    expect(identities).toEqual([
      [
        { actorId: OWNED_PET, instanceId: 2 },
        expect.objectContaining({ ownership: { kind: "OWNED_BY", ownerActorId: ALLY } }),
      ],
      [
        { actorId: UNOWNED_PET, instanceId: 1 },
        expect.objectContaining({ ownership: { kind: "OWNER_NOT_STATED" } }),
      ],
      [{ actorId: 999, instanceId: null }, { catalog: "NOT_IN_CATALOG" }],
    ]);
  });

  it("an unstated recipient instance could be any known instance: it breaks their continuity and forms no window of its own", () => {
    const fight = fightOf([
      aura(2_000, "applybuff", UNOWNED_PET, BUFF, SUPPORTER, { targetInstance: 1 }),
      aura(3_000, "removebuff", UNOWNED_PET),
      aura(5_000, "refreshbuff", UNOWNED_PET, BUFF, SUPPORTER, { targetInstance: 1 }),
      aura(6_000, "removebuff", UNOWNED_PET, BUFF, SUPPORTER, { targetInstance: 1 }),
    ]);
    const listed = windowsOf(fight);
    expect(listed.ambiguousTransitions.map((entry) => [entry.reportTimeMs, entry.ambiguity])).toEqual([
      [3_000, "INSTANCE_NOT_STATED"],
    ]);
    const window = only(listed.windows);
    expect(window.recipient).toEqual({ actorId: UNOWNED_PET, instanceId: 1 });
    expect(window.continuity).toEqual({ state: "NOT_ESTABLISHED", reason: "AMBIGUOUS_TRANSITION_INSIDE" });
    const time = supportTimeOf(listed, [BUFF]);
    expect(time.anyRecipient.bound).toBe("UNKNOWN");
    expect(time.peakConcurrentWindows).toEqual({ bound: "UNKNOWN" });
    expect(recipientCooldownOverlap(fight, window, new Map([[UNOWNED_PET, [COOLDOWN]]]))).toMatchObject({
      state: "CONTINUITY_NOT_ESTABLISHED",
    });
  });

  it("the other direction: a source-less transition naming a known instance could be an unstated-instance window's", () => {
    const fight = fightOf([
      aura(2_000, "applybuff", UNOWNED_PET),
      aura(3_000, "removebuff", UNOWNED_PET, BUFF, null, { targetInstance: 4 }),
      aura(6_000, "removebuff", UNOWNED_PET),
    ]);
    const window = only(windowsOf(fight).windows);
    expect(window.recipient).toEqual({ actorId: UNOWNED_PET, instanceId: null });
    expect(window.continuity).toEqual({ state: "NOT_ESTABLISHED", reason: "AMBIGUOUS_TRANSITION_INSIDE" });
    // Control: when every transition states the same instance policy (none), nothing is ambiguous.
    const plain = fightOf([aura(2_000, "applybuff", UNOWNED_PET), aura(6_000, "removebuff", UNOWNED_PET)]);
    expect(only(windowsOf(plain).windows).continuity).toEqual({ state: "ESTABLISHED" });
  });

  it("a stack removal to zero (or to no stated count) does not prove the aura survived: no active span; a positive count does", () => {
    const zero = fightOf([
      aura(10_000, "applybuff", ALLY),
      aura(14_000, "removebuffstack", ALLY, BUFF, SUPPORTER, { stack: 0 }),
      aura(20_000, "refreshbuff", ALLY),
      aura(25_000, "removebuff", ALLY),
    ]);
    const window = only(windowsOf(zero).windows);
    expect(window.continuity).toEqual({ state: "NOT_ESTABLISHED", reason: "UNPROVEN_STACK_REMOVAL_INSIDE" });
    expect(window.activeSpan).toBeNull();
    const time = supportTimeOf(windowsOf(zero), [BUFF]);
    expect(time.anyRecipient.bound).toBe("UNKNOWN");
    expect(time.peakConcurrentWindows).toEqual({ bound: "UNKNOWN" });
    expect(recipientCooldownOverlap(zero, window, new Map([[ALLY, [COOLDOWN]]]))).toMatchObject({
      state: "CONTINUITY_NOT_ESTABLISHED",
      reason: "UNPROVEN_STACK_REMOVAL_INSIDE",
    });
    // Control: a stack removal leaving 2 stacks proves the aura was still on.
    const positive = fightOf([
      aura(10_000, "applybuff", ALLY),
      aura(14_000, "removebuffstack", ALLY, BUFF, SUPPORTER, { stack: 2 }),
      aura(25_000, "removebuff", ALLY),
    ]);
    expect(only(windowsOf(positive).windows).continuity).toEqual({ state: "ESTABLISHED" });
  });

  it("retrieval order that runs backwards in time is not a timeline: no window's continuity is established", () => {
    const fight = fightOf([
      aura(10_000, "applybuff", ALLY),
      aura(20_000, "removebuff", ALLY),
      aura(15_000, "applybuff", ALLY),
      aura(25_000, "removebuff", ALLY),
    ]);
    const listed = windowsOf(fight);
    expect(listed.windows).toHaveLength(2);
    for (const window of listed.windows) {
      expect(window.continuity).toEqual({ state: "NOT_ESTABLISHED", reason: "NON_MONOTONIC_TIME" });
      expect(window.activeSpan).toBeNull();
    }
    const time = supportTimeOf(listed, [BUFF]);
    expect(time.anyRecipient.bound).toBe("UNKNOWN");
    expect(time.peakConcurrentWindows).toEqual({ bound: "UNKNOWN" });
  });

  it("two instances of one recipient are two tracks", () => {
    const fight = fightOf([
      aura(10_000, "applybuff", UNOWNED_PET, BUFF, SUPPORTER, { targetInstance: 1 }),
      aura(11_000, "removebuff", UNOWNED_PET, BUFF, SUPPORTER, { targetInstance: 2 }),
    ]);
    expect(
      windowsOf(fight).windows.map((window) => [
        window.recipient.instanceId,
        window.start.kind,
        window.end.kind,
      ]),
    ).toEqual([
      [1, "OBSERVED", "NOT_OBSERVED"],
      [2, "NOT_OBSERVED", "OBSERVED"],
    ]);
  });
});

describe("recipient survival", () => {
  const raw = [aura(10_000, "applybuff", ALLY), aura(30_000, "removebuff", ALLY)];

  it("an observed death of the recipient inside the proven span is reported; a death at a bound is flagged", () => {
    const fight = fightOf(byTime([...raw, death(20_000, ALLY), death(30_000, ALLY)]));
    const survival = recipientSurvivalDuring(fight, only(windowsOf(fight).windows));
    expect(survival.inSpan).toMatchObject({
      state: "DEATH_OBSERVED_IN_SPAN",
      deaths: [
        { reportTimeMs: 20_000, atSpanBound: false },
        { reportTimeMs: 30_000, atSpanBound: true },
      ],
    });
    expect(survival.nextDeathAfterEnd).toEqual({ state: "NONE_OBSERVED" });
  });

  it("the buff removed just before its holder's death: the death is the next one after the observed end, with its distance", () => {
    const fight = fightOf(byTime([...raw, death(30_037, ALLY), death(31_000, OTHER_ALLY)]));
    const survival = recipientSurvivalDuring(fight, only(windowsOf(fight).windows));
    expect(survival.inSpan).toEqual({ state: "NO_DEATH_OBSERVED" });
    expect(survival.nextDeathAfterEnd).toMatchObject({
      state: "OBSERVED",
      reportTimeMs: 30_037,
      msAfterObservedEnd: 37,
    });
  });

  it("no death event is NEVER alive, and an unobserved end anchors no 'after'", () => {
    const fight = fightOf(byTime([...raw, death(20_000, OTHER_ALLY)]));
    const survival = recipientSurvivalDuring(fight, only(windowsOf(fight).windows));
    expect(survival).toEqual({
      inSpan: { state: "NO_DEATH_OBSERVED" },
      nextDeathAfterEnd: { state: "NONE_OBSERVED" },
    });
    expect(JSON.stringify(survival)).not.toMatch(/ALIVE|SURVIVED/);
    const open = fightOf([aura(10_000, "applybuff", ALLY), death(50_000, ALLY)]);
    expect(recipientSurvivalDuring(open, only(windowsOf(open).windows)).nextDeathAfterEnd).toEqual({
      state: "END_NOT_OBSERVED",
    });
  });
});

describe("recipient cooldown overlap", () => {
  const raw = [
    aura(10_000, "applybuff", ALLY),
    cast(12_000, ALLY, COOLDOWN),
    cast(13_000, ALLY, 1),
    cast(14_000, OTHER_ALLY, COOLDOWN),
    aura(30_000, "removebuff", ALLY),
    cast(31_000, ALLY, COOLDOWN),
  ];

  it("a window without established continuity has no overlap: 'during the buff' cannot be said", () => {
    const fight = fightOf(raw, { AURAS: absentCategory() });
    expect(
      recipientCooldownOverlap(fight, only(windowsOf(fight).windows), new Map([[ALLY, [COOLDOWN]]])),
    ).toEqual({
      state: "CONTINUITY_NOT_ESTABLISHED",
      reason: "INSUFFICIENT_COVERAGE",
    });
  });

  it("another instance of the same actor is another recipient: its cast never overlaps this instance's window", () => {
    const fight = fightOf([
      aura(10_000, "applybuff", UNOWNED_PET, BUFF, SUPPORTER, { targetInstance: 1 }),
      { ...cast(12_000, UNOWNED_PET, COOLDOWN), sourceInstance: 2 },
      { ...cast(13_000, UNOWNED_PET, COOLDOWN), sourceInstance: 1 },
      aura(20_000, "removebuff", UNOWNED_PET, BUFF, SUPPORTER, { targetInstance: 1 }),
    ]);
    const overlap = recipientCooldownOverlap(
      fight,
      only(windowsOf(fight).windows),
      new Map([[UNOWNED_PET, [COOLDOWN]]]),
    );
    expect(overlap).toMatchObject({ state: "LISTED", casts: [{ reportTimeMs: 13_000 }] });
    if (overlap.state !== "LISTED") throw new Error("expected a listing");
    expect(overlap.casts).toHaveLength(1);
  });

  it("an unidentified recipient cast inside the active span could be a listed cooldown: OBSERVED_ONLY, never COMPLETE", () => {
    const { abilityGameID: _dropped, ...unidentified } = cast(15_000, ALLY, COOLDOWN);
    const fight = fightOf(byTime([...raw, unidentified]));
    const overlap = recipientCooldownOverlap(
      fight,
      only(windowsOf(fight).windows),
      new Map([[ALLY, [COOLDOWN]]]),
    );
    expect(overlap).toMatchObject({
      state: "LISTED",
      casts: [{ abilityGameId: COOLDOWN, reportTimeMs: 12_000 }],
      listing: {
        state: "OBSERVED_ONLY",
        reason: "AMBIGUOUS_CASTS",
        unidentifiedCasts: 1,
        unattributedCasts: 0,
      },
    });
  });

  it("a source-less cast of a listed cooldown could be the recipient's: OBSERVED_ONLY; another actor's cast is not", () => {
    const { sourceID: _dropped, ...sourceless } = cast(15_000, ALLY, COOLDOWN);
    const fight = fightOf(byTime([...raw, sourceless]));
    expect(
      recipientCooldownOverlap(fight, only(windowsOf(fight).windows), new Map([[ALLY, [COOLDOWN]]])),
    ).toMatchObject({
      state: "LISTED",
      casts: [{ reportTimeMs: 12_000 }],
      listing: {
        state: "OBSERVED_ONLY",
        reason: "AMBIGUOUS_CASTS",
        unidentifiedCasts: 0,
        unattributedCasts: 1,
      },
    });
    // Control: the same cooldown cast by OTHER_ALLY (14 s, in `raw`) belongs elsewhere and changes nothing.
    const control = fightOf(raw);
    expect(
      recipientCooldownOverlap(control, only(windowsOf(control).windows), new Map([[ALLY, [COOLDOWN]]])),
    ).toMatchObject({ listing: { state: "COMPLETE" } });
    // A source-less cast of an unrelated ability cannot be a listed cooldown either.
    const unrelated = fightOf(byTime([...raw, { ...sourceless, abilityGameID: 1 }]));
    expect(
      recipientCooldownOverlap(unrelated, only(windowsOf(unrelated).windows), new Map([[ALLY, [COOLDOWN]]])),
    ).toMatchObject({ listing: { state: "COMPLETE" } });
  });

  it("without a supplied identity the overlap is NO_COOLDOWN_IDENTITY, never an empty list", () => {
    const fight = fightOf(raw);
    expect(recipientCooldownOverlap(fight, only(windowsOf(fight).windows), new Map())).toEqual({
      state: "NO_COOLDOWN_IDENTITY",
    });
  });

  it("lists only the recipient's own completed casts of the supplied ids inside the proven span", () => {
    const fight = fightOf(raw);
    const overlap = recipientCooldownOverlap(
      fight,
      only(windowsOf(fight).windows),
      new Map([[ALLY, [COOLDOWN]]]),
    );
    expect(overlap).toMatchObject({
      state: "LISTED",
      casts: [{ abilityGameId: COOLDOWN, reportTimeMs: 12_000, atSpanBound: false }],
      listing: { state: "COMPLETE" },
    });
  });

  it("an empty overlap is OBSERVED_ONLY when the recipient's CASTS are not covered", () => {
    const fight = fightOf(raw, { CASTS: absentCategory() });
    const overlap = recipientCooldownOverlap(fight, only(windowsOf(fight).windows), new Map([[ALLY, [999]]]));
    expect(overlap).toEqual({
      state: "LISTED",
      casts: [],
      listing: { state: "OBSERVED_ONLY", reason: "INSUFFICIENT_COVERAGE" },
    });
  });
});

describe("proven support time", () => {
  it("a lower bound even when the listing is complete and every bound observed; peak concurrency counts overlapping windows", () => {
    const fight = fightOf([
      aura(10_000, "applybuff", ALLY),
      aura(15_000, "applybuff", OTHER_ALLY),
      aura(20_000, "removebuff", ALLY),
      aura(25_000, "removebuff", OTHER_ALLY),
    ]);
    const time = supportTimeOf(windowsOf(fight), [BUFF]);
    const initial = ["INITIAL_STATE_NOT_RESOLVED"];
    expect(time.anyRecipient).toEqual({ bound: "AT_LEAST", ms: 15_000, why: initial });
    expect(time.byRecipient.map((entry) => [entry.recipient.actorId, entry.proven])).toEqual([
      [ALLY, { bound: "AT_LEAST", ms: 10_000, why: initial }],
      [OTHER_ALLY, { bound: "AT_LEAST", ms: 10_000, why: initial }],
    ]);
    expect(time.peakConcurrentWindows).toEqual({ bound: "AT_LEAST", count: 2 });
  });

  it("touching windows are not a proven overlap, in either event order; a real overlap is", () => {
    const touching = (first: readonly Raw[]) =>
      supportTimeOf(windowsOf(fightOf(first)), [BUFF]).peakConcurrentWindows;
    const removeThenApply = [
      aura(10_000, "applybuff", ALLY),
      aura(20_000, "removebuff", ALLY),
      aura(20_000, "applybuff", OTHER_ALLY),
      aura(30_000, "removebuff", OTHER_ALLY),
    ];
    const applyThenRemove = [
      aura(10_000, "applybuff", ALLY),
      aura(20_000, "applybuff", OTHER_ALLY),
      aura(20_000, "removebuff", ALLY),
      aura(30_000, "removebuff", OTHER_ALLY),
    ];
    expect(touching(removeThenApply)).toEqual({ bound: "AT_LEAST", count: 1 });
    expect(touching(applyThenRemove)).toEqual({ bound: "AT_LEAST", count: 1 });
    const overlapping = [
      aura(10_000, "applybuff", ALLY),
      aura(19_999, "applybuff", OTHER_ALLY),
      aura(20_000, "removebuff", ALLY),
      aura(30_000, "removebuff", OTHER_ALLY),
    ];
    expect(touching(overlapping)).toEqual({ bound: "AT_LEAST", count: 2 });
    const apart = [
      aura(10_000, "applybuff", ALLY),
      aura(20_000, "removebuff", ALLY),
      aura(20_001, "applybuff", OTHER_ALLY),
      aura(30_000, "removebuff", OTHER_ALLY),
    ];
    expect(touching(apart)).toEqual({ bound: "AT_LEAST", count: 1 });
  });

  it("AT_LEAST, with its caveats, when a bound is unobserved or the listing is observed only", () => {
    const raw = [
      aura(10_000, "applybuff", ALLY),
      aura(20_000, "removebuff", ALLY),
      aura(30_000, "applybuff", ALLY),
    ];
    expect(supportTimeOf(windowsOf(fightOf(raw)), [BUFF]).anyRecipient).toEqual({
      bound: "AT_LEAST",
      ms: 10_000,
      why: ["INITIAL_STATE_NOT_RESOLVED", "UNOBSERVED_WINDOW_BOUND"],
    });
    // Without coverage nothing between the observations is proven: UNKNOWN, not "at least 10 s".
    expect(
      supportTimeOf(windowsOf(fightOf(raw.slice(0, 2), { AURAS: absentCategory() })), [BUFF]).anyRecipient,
    ).toEqual({
      bound: "UNKNOWN",
      why: ["INITIAL_STATE_NOT_RESOLVED", "LISTING_OBSERVED_ONLY", "CONTINUITY_NOT_ESTABLISHED"],
    });
  });

  it('nothing observed under absent coverage is UNKNOWN: never zero, never "at least 0"', () => {
    const time = supportTimeOf(windowsOf(fightOf([], { AURAS: absentCategory() })), [BUFF]);
    expect(time.anyRecipient).toEqual({
      bound: "UNKNOWN",
      why: ["INITIAL_STATE_NOT_RESOLVED", "LISTING_OBSERVED_ONLY"],
    });
    expect(time.peakConcurrentWindows).toEqual({ bound: "UNKNOWN" });
    // Not even under COMPLETE coverage: a buff applied before the range carries in silently.
    expect(supportTimeOf(windowsOf(fightOf([])), [BUFF]).anyRecipient).toEqual({
      bound: "UNKNOWN",
      why: ["INITIAL_STATE_NOT_RESOLVED"],
    });
  });

  it("a buff applied before a queried subrange, with no transition inside it: COMPLETE listing, still no proven zero", () => {
    const fight = fightOf([aura(10_000, "applybuff", ALLY), aura(60_000, "removebuff", ALLY)]);
    const sub = supportAuraWindowsOf(
      fight,
      { supporterActorId: SUPPORTER, auraAbilityGameIds: [BUFF] },
      inclusiveRange(20_000, 40_000),
    );
    expect(sub.windows).toEqual([]);
    expect(sub.listing).toEqual({ state: "COMPLETE" });
    const time = supportTimeOf(sub, [BUFF]);
    expect(time.anyRecipient).toEqual({ bound: "UNKNOWN", why: ["INITIAL_STATE_NOT_RESOLVED"] });
    expect(time.peakConcurrentWindows).toEqual({ bound: "UNKNOWN" });
  });

  it("an unobserved carry-in recipient beside a fully observed window: the total stays a lower bound", () => {
    const fight = fightOf([
      aura(10_000, "applybuff", ALLY),
      aura(20_000, "removebuff", ALLY),
      // OTHER_ALLY carried the buff in from before the pull: only its removal is seen.
      aura(30_000, "removebuff", OTHER_ALLY),
    ]);
    const time = supportTimeOf(windowsOf(fight), [BUFF]);
    expect(time.anyRecipient).toEqual({
      bound: "AT_LEAST",
      ms: 10_000,
      why: ["INITIAL_STATE_NOT_RESOLVED", "UNOBSERVED_WINDOW_BOUND"],
    });
    expect(time.byRecipient.find((entry) => entry.recipient.actorId === ALLY)?.proven.bound).toBe("AT_LEAST");
  });
});
