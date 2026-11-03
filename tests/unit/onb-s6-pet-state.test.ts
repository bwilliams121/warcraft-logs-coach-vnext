/**
 * ONB-S6: shared pet actor mapping and pet presence.
 *
 * These tests pin when a pinned SimulationCraft pet entity maps to Warcraft
 * Logs actors, when an instance is proven present or not present at an
 * instant, and that every gap (an unstated owner, a shared gameID, a missing
 * summon page, a pre-pull instance, an unsettled instance identity, a later
 * observation) is UNKNOWN rather than a guess.
 *
 * The profiles below are TEST profiles. Their names, gameIDs and lifetimes
 * exercise the shared plumbing; they are not reviewed game data and no
 * specialization reads them.
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  buildPetState,
  definePetMappingProfile,
  PetProfileError,
  type PetEntityDefinition,
  type PetMappingProfile,
  type PetState,
} from "../../src/engine/game-state/pets/pet-state.js";
import { inclusiveRange } from "../../src/engine/evidence/coverage.js";
import type { CombatActor } from "../../src/engine/normalization/actors.js";
import type { CombatFight } from "../../src/engine/normalization/combat-fight.js";
import type { CategoryEvidence } from "../../src/engine/normalization/completeness.js";
import type { CombatEvent, DeathEvent } from "../../src/engine/normalization/normalized-events.js";
import { createCombatState } from "../../src/engine/state/combat-state.js";
import {
  evaluateSimcExpression,
  unknownNumber,
  type AtomBindings,
} from "../../src/simc/expression/evaluate.js";
import { isBuiltinIdentifier, parseSimcExpression } from "../../src/simc/expression/parse.js";
import { petCountAtom, petPresenceAtom } from "../../src/simc/expression/pet-atoms.js";
import { defineSpecAtomVocabulary, type SpecAtomBinding } from "../../src/simc/expression/spec-vocabulary.js";
import { loadCommittedEvidenceArchive } from "../support/corpus/evidence-archive.js";
import { bundleOf } from "../support/corpus/fight.js";
import {
  FIGHT_END_MS,
  FIGHT_START_MS,
  castEvent,
  damageEvent,
  observableCategory,
  partialCategory,
  summonEvent,
  syntheticFight,
} from "../support/synthetic-fight.js";

const OWNER = 5;
const OTHER_PLAYER = 9;
const IMP = 50; // gameId 1001, owned by OWNER
const STALKER = 51; // gameId 1002, owned by OWNER
const FOREIGN_IMP = 60; // gameId 1001, owned by OTHER_PLAYER
const UNSTATED_IMP = 70; // gameId 1001, no stated owner
const GAMELESS = 80; // owned by OWNER, no gameId
const IMP_GAME_ID = 1001;
const STALKER_GAME_ID = 1002;

function actor(actorId: number, extra: Partial<CombatActor>): CombatActor {
  return {
    actorId,
    gameId: null,
    name: null,
    server: null,
    actorType: "PET",
    rawType: "Pet",
    subType: null,
    petOwnerActorId: null,
    ...extra,
  };
}

const BASE_ACTORS: readonly CombatActor[] = [
  actor(OWNER, { actorType: "PLAYER", rawType: "Player", subType: "Warlock" }),
  actor(OTHER_PLAYER, { actorType: "PLAYER", rawType: "Player", subType: "Warlock" }),
  actor(IMP, { gameId: IMP_GAME_ID, petOwnerActorId: OWNER }),
  actor(STALKER, { gameId: STALKER_GAME_ID, petOwnerActorId: OWNER }),
  actor(FOREIGN_IMP, { gameId: IMP_GAME_ID, petOwnerActorId: OTHER_PLAYER }),
];

/** Test lifetimes: an instance lives at least 500 ms and at most 1000 ms from its summon. */
function entity(
  overrides: Partial<PetEntityDefinition> & Pick<PetEntityDefinition, "simcName">,
): PetEntityDefinition {
  return {
    wclGameIds: [IMP_GAME_ID],
    minLifetimeMs: 500,
    maxLifetimeMs: 1_000,
    instancesBeginWithSummon: true,
    provenance: "test profile",
    ...overrides,
  };
}

const PROFILE = definePetMappingProfile("test/spec", [
  entity({ simcName: "imp" }),
  entity({ simcName: "stalker", wclGameIds: [STALKER_GAME_ID] }),
]);

let ordinal = 0;
function summon(t: number, target: number, instance: number | null, source: number = OWNER): CombatEvent {
  return summonEvent({
    ordinal: ordinal++,
    reportTimeMs: t,
    sourceActorId: source,
    targetActorId: target,
    targetInstanceId: instance,
    abilityGameId: 9_000,
  });
}
function petCast(t: number, source: number, instance: number | null): CombatEvent {
  return castEvent({
    ordinal: ordinal++,
    reportTimeMs: t,
    castPhase: "COMPLETE",
    sourceActorId: source,
    sourceInstanceId: instance,
    abilityGameId: 9_100,
  });
}
function petDeath(t: number, target: number, instance: number | null): DeathEvent {
  const { kind: _damage, ...envelope } = damageEvent({
    ordinal: ordinal++,
    reportTimeMs: t,
    rawType: "death",
    targetActorId: target,
    targetInstanceId: instance,
  });
  return {
    locator: envelope.locator,
    ingestionOrdinal: envelope.ingestionOrdinal,
    reportTimeMs: envelope.reportTimeMs,
    fightTimeMs: envelope.fightTimeMs,
    rawType: envelope.rawType,
    source: envelope.source,
    target: envelope.target,
    sourceAbsence: envelope.sourceAbsence,
    targetAbsence: envelope.targetAbsence,
    abilityGameId: envelope.abilityGameId,
    attachedResources: envelope.attachedResources,
    outsideRequestedRange: envelope.outsideRequestedRange,
    kind: "DEATH",
    killer: "NOT_SUPPLIED",
    killingAbilityGameId: "NOT_SUPPLIED",
  };
}

type SummonCoverage = "COMPLETE" | "PARTIAL" | "UNVERIFIED" | CategoryEvidence;

function petStateOf(
  events: readonly CombatEvent[],
  options: {
    readonly summons?: SummonCoverage;
    readonly actors?: readonly CombatActor[];
    readonly profile?: PetMappingProfile;
    readonly owner?: number;
    /** Keep the given canonical order instead of sorting by time. */
    readonly unsorted?: boolean;
  } = {},
): PetState {
  const whole = inclusiveRange(FIGHT_START_MS, FIGHT_END_MS);
  const summons = options.summons ?? "COMPLETE";
  const sorted =
    options.unsorted === true
      ? [...events]
      : [...events].sort((left, right) => left.reportTimeMs - right.reportTimeMs);
  const categories: Partial<Record<"SUMMONS", CategoryEvidence>> =
    summons === "COMPLETE"
      ? { SUMMONS: observableCategory(whole, null) }
      : summons === "PARTIAL"
        ? // A missing page between 2000 and 3000.
          {
            SUMMONS: partialCategory([
              inclusiveRange(FIGHT_START_MS, 1_999),
              inclusiveRange(3_001, FIGHT_END_MS),
            ]),
          }
        : summons === "UNVERIFIED"
          ? {}
          : { SUMMONS: summons };
  const fight = syntheticFight({
    events: sorted,
    actors: new Map((options.actors ?? BASE_ACTORS).map((entry) => [entry.actorId, entry])),
    categories,
  });
  return buildPetState({
    state: createCombatState(fight),
    ownerActorId: options.owner ?? OWNER,
    profile: options.profile ?? PROFILE,
  });
}

describe("the profile", () => {
  it("is frozen and normalizes its gameIDs", () => {
    const profile = definePetMappingProfile("test/spec", [
      entity({ simcName: "imp", wclGameIds: [1003, IMP_GAME_ID, 1003] }),
    ]);
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.entities[0])).toBe(true);
    expect(profile.entities[0]?.wclGameIds).toEqual([IMP_GAME_ID, 1003]);
  });

  it.each([
    ["NO_OWNER", "", [entity({ simcName: "imp" })]],
    ["MALFORMED_SIMC_NAME", "test/spec", [entity({ simcName: "Imp.Pet" })]],
    ["DUPLICATE_SIMC_NAME", "test/spec", [entity({ simcName: "imp" }), entity({ simcName: "imp" })]],
    ["NO_GAME_ID", "test/spec", [entity({ simcName: "imp", wclGameIds: [] })]],
    ["MALFORMED_GAME_ID", "test/spec", [entity({ simcName: "imp", wclGameIds: [0] })]],
    ["MALFORMED_LIFETIME", "test/spec", [entity({ simcName: "imp", maxLifetimeMs: 0 })]],
    ["MALFORMED_LIFETIME", "test/spec", [entity({ simcName: "imp", minLifetimeMs: Number.NaN })]],
    ["MALFORMED_LIFETIME", "test/spec", [entity({ simcName: "imp", minLifetimeMs: 2_000 })]],
  ] as const)("refuses %s", (defect, owner, entities) => {
    expect(() => definePetMappingProfile(owner, entities)).toThrow(PetProfileError);
    expect(() => definePetMappingProfile(owner, entities)).toThrow(defect);
  });

  it("accepts two entities sharing a gameID: that is a log property, not a defect", () => {
    expect(() =>
      definePetMappingProfile("test/spec", [entity({ simcName: "a" }), entity({ simcName: "b" })]),
    ).not.toThrow();
  });
});

describe("mapping", () => {
  it("maps only actors whose WCL petOwner is the owner, never another player's pet", () => {
    const state = petStateOf([]);
    expect(state.mappingOf("imp")).toMatchObject({
      status: "MAPPED",
      actorIds: [IMP],
      unstatedOwnerCandidateIds: [],
    });
    expect(state.mappingOf("stalker")).toMatchObject({ status: "MAPPED", actorIds: [STALKER] });
    expect(state.mappingOf("nothing")).toBeNull();
  });

  it("never maps an actor by summon source: an unstated owner is a candidate that blocks absence", () => {
    const actors = [...BASE_ACTORS, actor(UNSTATED_IMP, { gameId: IMP_GAME_ID })];
    const state = petStateOf([summon(2_500, UNSTATED_IMP, 1)], { actors });
    expect(state.mappingOf("imp")).toMatchObject({
      actorIds: [IMP],
      unstatedOwnerCandidateIds: [UNSTATED_IMP],
    });
    expect(state.presenceAt("imp", 3_000)).toEqual({ state: "UNKNOWN", reason: "OWNERSHIP_NOT_STATED" });
    expect(state.instanceCountAt("imp", 3_000)).toEqual({
      kind: "BOUNDED",
      atLeast: 0,
      atMost: null,
      reason: "OWNERSHIP_NOT_STATED",
    });
    // The other entity's gameID is not this candidate's, so it is not blocked.
    expect(state.presenceAt("stalker", 3_000)).toEqual({ state: "NOT_PRESENT" });
  });

  it("an owned actor with no gameID could be any entity, so it blocks absence for all of them", () => {
    const actors = [...BASE_ACTORS, actor(GAMELESS, { petOwnerActorId: OWNER })];
    const state = petStateOf([], { actors });
    expect(state.ownedActorsWithoutGameId).toEqual([GAMELESS]);
    expect(state.presenceAt("imp", 3_000)).toEqual({ state: "UNKNOWN", reason: "OWNERSHIP_NOT_STATED" });
    expect(state.presenceAt("stalker", 3_000)).toEqual({ state: "UNKNOWN", reason: "OWNERSHIP_NOT_STATED" });
  });

  it("two entities listing one gameID are both AMBIGUOUS and every answer about them is UNKNOWN", () => {
    const profile = definePetMappingProfile("test/spec", [
      entity({ simcName: "rune_weapon_a" }),
      entity({ simcName: "rune_weapon_b" }),
      entity({ simcName: "stalker", wclGameIds: [STALKER_GAME_ID] }),
    ]);
    const state = petStateOf([summon(2_000, IMP, 1)], { profile });
    expect(state.mappingOf("rune_weapon_a")).toEqual({
      simcName: "rune_weapon_a",
      status: "AMBIGUOUS",
      sharedWith: ["rune_weapon_b"],
      actorIds: [IMP],
    });
    expect(state.presenceAt("rune_weapon_a", 2_100)).toEqual({
      state: "UNKNOWN",
      reason: "ENTITY_MAPPING_AMBIGUOUS",
    });
    expect(state.instanceCountAt("rune_weapon_b", 2_100)).toEqual({
      kind: "UNKNOWN",
      reason: "ENTITY_MAPPING_AMBIGUOUS",
    });
    expect(state.instancesAt("rune_weapon_b", 2_100)).toEqual({
      state: "UNKNOWN",
      reason: "ENTITY_MAPPING_AMBIGUOUS",
    });
    expect(state.presenceAt("stalker", 2_500)).toEqual({ state: "NOT_PRESENT" });
  });

  it("discloses an owned actor no entity lists, and assigns it to none", () => {
    const actors = [...BASE_ACTORS, actor(90, { gameId: 4242, petOwnerActorId: OWNER })];
    const state = petStateOf([], { actors });
    expect(state.unclassifiedOwnedActorIds).toEqual([90]);
    expect(state.presenceAt("imp", 3_000)).toEqual({ state: "NOT_PRESENT" });
  });

  it("refuses an owner outside the catalog, an undeclared entity and an instant outside the fight", () => {
    const state = petStateOf([], { owner: 999 });
    expect(state.ownerInCatalog).toBe(false);
    expect(state.presenceAt("imp", 3_000)).toEqual({ state: "UNKNOWN", reason: "OWNER_NOT_IN_CATALOG" });
    const normal = petStateOf([]);
    expect(normal.presenceAt("felguard", 3_000)).toEqual({ state: "UNKNOWN", reason: "ENTITY_NOT_DECLARED" });
    expect(normal.presenceAt("imp", FIGHT_END_MS + 1)).toEqual({ state: "UNKNOWN", reason: "OUTSIDE_FIGHT" });
    expect(normal.instanceCountAt("imp", FIGHT_START_MS - 1)).toEqual({
      kind: "UNKNOWN",
      reason: "OUTSIDE_FIGHT",
    });
  });
});

describe("PRESENT from the summon and the proven minimum lifetime", () => {
  it("strictly after the summon and strictly inside the minimum lifetime, citing the summon", () => {
    const state = petStateOf([summon(2_000, IMP, 1)]);
    const presence = state.presenceAt("imp", 2_100);
    expect(presence.state).toBe("PRESENT");
    if (presence.state === "PRESENT") expect(presence.locators.map((l) => l.reportTimeMs)).toEqual([2_000]);
    expect(state.instanceCountAt("imp", 2_499)).toEqual({ kind: "EXACT", value: 1 });
  });

  it("is never PRESENT at the summon millisecond or the minimum-lifetime edge: order is not proven", () => {
    const state = petStateOf([summon(2_000, IMP, 1)]);
    expect(state.presenceAt("imp", 2_000)).toEqual({ state: "UNKNOWN", reason: "PRESENCE_NOT_ESTABLISHED" });
    expect(state.presenceAt("imp", 2_500)).toEqual({ state: "UNKNOWN", reason: "PRESENCE_NOT_ESTABLISHED" });
    // Between the minimum and the maximum it may or may not still be there.
    expect(state.instanceCountAt("imp", 2_800)).toEqual({
      kind: "BOUNDED",
      atLeast: 0,
      atMost: 1,
      reason: "PRESENCE_NOT_ESTABLISHED",
    });
  });

  it("without a proven minimum lifetime nothing is ever PRESENT", () => {
    const profile = definePetMappingProfile("test/spec", [entity({ simcName: "imp", minLifetimeMs: null })]);
    const state = petStateOf([summon(2_000, IMP, 1), petCast(2_100, IMP, 1)], { profile });
    expect(state.presenceAt("imp", 2_100)).toEqual({ state: "UNKNOWN", reason: "PRESENCE_NOT_ESTABLISHED" });
  });

  it("a positive death since the summon ends PRESENT and never proves absence", () => {
    const state = petStateOf([summon(2_000, IMP, 1), petDeath(2_200, IMP, 1)]);
    expect(state.presenceAt("imp", 2_100).state).toBe("PRESENT");
    expect(state.presenceAt("imp", 2_200)).toEqual({ state: "UNKNOWN", reason: "PRESENCE_NOT_ESTABLISHED" });
    expect(state.presenceAt("imp", 2_300)).toEqual({ state: "UNKNOWN", reason: "PRESENCE_NOT_ESTABLISHED" });
  });

  it("casts and damage the pet sources never prove presence on their own", () => {
    const profile = definePetMappingProfile("test/spec", [entity({ simcName: "imp", maxLifetimeMs: null })]);
    const events = [
      petCast(2_000, IMP, 1),
      damageEvent({ ordinal: ordinal++, reportTimeMs: 2_050, sourceActorId: IMP, sourceInstanceId: 1 }),
    ];
    const state = petStateOf(events, { profile });
    expect(state.presenceAt("imp", 2_060)).toEqual({ state: "UNKNOWN", reason: "LIFETIME_BOUND_NOT_PINNED" });
  });
});

describe("no future evidence (owner decision O2)", () => {
  // The answer at t is a function of the events at or before t: every query
  // below gives the same result with or without the events after t.
  const T = 2_300;
  const PAST = () => [summon(2_000, IMP, 1)];
  const FUTURE = () => [
    petCast(2_400, IMP, 1),
    petCast(2_900, IMP, 1),
    summon(2_350, IMP, 2),
    petDeath(2_450, IMP, 1),
    summon(2_600, STALKER, 1),
  ];

  function answers(state: PetState, t: number): unknown {
    return ["imp", "stalker"].map((name) => [
      state.presenceAt(name, t),
      state.instanceCountAt(name, t),
      state.instancesAt(name, t),
    ]);
  }

  it.each([T, 2_000, 2_600, 2_999])("appending later events never changes the answer at %i", (t) => {
    // Built once, so both fights carry the very same events and locators.
    const all = PAST().concat(FUTURE());
    const pastOnly = all.filter((event) => event.reportTimeMs <= t);
    expect(answers(petStateOf(all), t)).toEqual(answers(petStateOf(pastOnly), t));
  });

  it("a later cast never brackets an earlier instant into PRESENT", () => {
    const profile = definePetMappingProfile("test/spec", [entity({ simcName: "imp", minLifetimeMs: 100 })]);
    // Summoned at 2000, cast at 2600: at 2300 the instance is past its proven
    // minimum life, and the later cast is not evidence for 2300.
    const state = petStateOf([summon(2_000, IMP, 1), petCast(2_600, IMP, 1)], { profile });
    expect(state.presenceAt("imp", 2_300)).toEqual({ state: "UNKNOWN", reason: "PRESENCE_NOT_ESTABLISHED" });
    const atom = petPresenceAtom("pet.imp.active", state.presenceAt("imp", 2_300));
    expect(atom).toBeNull();
  });

  it("a later summon never proves an earlier absence", () => {
    // Coverage is missing over the stretch that could reach 2900, so the
    // summon at 3500 must not stand in for "no instance at 2900".
    const state = petStateOf([summon(3_500, IMP, 1)], { summons: "PARTIAL" });
    expect(state.presenceAt("imp", 2_900)).toEqual({ state: "UNKNOWN", reason: "INSUFFICIENT_COVERAGE" });
    expect(state.instancesAt("imp", 2_900)).toEqual({
      state: "OBSERVED_KEYS",
      instances: [],
      unobservedKeysPossible: "INSUFFICIENT_COVERAGE",
    });
  });
});

describe("a non-monotonic canonical order", () => {
  it("refuses every timestamp-addressed answer, positive ones included", () => {
    const state = petStateOf([petCast(2_200, IMP, 1), summon(2_000, IMP, 1)], { unsorted: true });
    expect(state.presenceAt("imp", 2_100)).toEqual({ state: "UNKNOWN", reason: "NON_MONOTONIC_TIME" });
    expect(state.instanceCountAt("imp", 2_100)).toEqual({ kind: "UNKNOWN", reason: "NON_MONOTONIC_TIME" });
    expect(state.instancesAt("imp", 2_100)).toEqual({ state: "UNKNOWN", reason: "NON_MONOTONIC_TIME" });
    expect(state.presenceAt("stalker", 4_000)).toEqual({ state: "UNKNOWN", reason: "NON_MONOTONIC_TIME" });
  });
});

describe("NOT_PRESENT needs every summon that could reach t to have been seen", () => {
  it("no summon in [t - D, t] with SUMMONS complete is NOT_PRESENT and an exact zero", () => {
    const state = petStateOf([summon(2_500, IMP, 1)]);
    expect(state.presenceAt("imp", 2_499)).toEqual({ state: "NOT_PRESENT" });
    expect(state.instanceCountAt("imp", 2_499)).toEqual({ kind: "EXACT", value: 0 });
    expect(state.presenceAt("imp", 3_501)).toEqual({ state: "NOT_PRESENT" });
    expect(state.instancesAt("imp", 3_501)).toEqual({
      state: "OBSERVED_KEYS",
      instances: [{ key: { actorId: IMP, instanceId: 1 }, presence: { state: "NOT_PRESENT" } }],
      unobservedKeysPossible: null,
    });
    // At the maximum-lifetime edge nothing is ordered.
    expect(state.presenceAt("imp", 3_500)).toEqual({ state: "UNKNOWN", reason: "PRESENCE_NOT_ESTABLISHED" });
  });

  it("a missing SUMMONS page is never absence: UNKNOWN, and no key is NOT_PRESENT", () => {
    const state = petStateOf([summon(1_500, IMP, 1)], { summons: "PARTIAL" });
    expect(state.presenceAt("imp", 2_900)).toEqual({ state: "UNKNOWN", reason: "INSUFFICIENT_COVERAGE" });
    expect(state.instanceCountAt("imp", 2_900)).toEqual({
      kind: "BOUNDED",
      atLeast: 0,
      atMost: null,
      reason: "INSUFFICIENT_COVERAGE",
    });
    const keys = state.instancesAt("imp", 2_900);
    expect(keys.state === "OBSERVED_KEYS" && keys.instances.map((i) => i.presence.state)).toEqual([
      "POSSIBLE",
    ]);
    // Once the window clears the gap, the same fight decides.
    expect(state.presenceAt("imp", 4_100)).toEqual({ state: "NOT_PRESENT" });
  });

  it("unverified SUMMONS capability is UNKNOWN, never absence", () => {
    const state = petStateOf([], { summons: "UNVERIFIED" });
    expect(state.presenceAt("imp", 3_000)).toEqual({ state: "UNKNOWN", reason: "CAPABILITY_UNVERIFIED" });
  });

  it("SUMMONS coverage that does not vouch for the owner is INSUFFICIENT_SCOPE", () => {
    const whole = inclusiveRange(FIGHT_START_MS, FIGHT_END_MS);
    const state = petStateOf([], { summons: observableCategory(whole, [OTHER_PLAYER]) });
    expect(state.presenceAt("imp", 3_000)).toEqual({ state: "UNKNOWN", reason: "INSUFFICIENT_SCOPE" });
  });

  it("an instance summoned before the pull could reach t", () => {
    const state = petStateOf([]);
    expect(state.presenceAt("imp", FIGHT_START_MS + 999)).toEqual({
      state: "UNKNOWN",
      reason: "PRE_PULL_INSTANCE_POSSIBLE",
    });
    expect(state.presenceAt("imp", FIGHT_START_MS + 1_000)).toEqual({ state: "NOT_PRESENT" });
  });

  it("without a pinned maximum lifetime or a pinned summon start, absence is never claimed", () => {
    const unbounded = definePetMappingProfile("test/spec", [
      entity({ simcName: "imp", maxLifetimeMs: null }),
    ]);
    expect(petStateOf([], { profile: unbounded }).presenceAt("imp", 4_000)).toEqual({
      state: "UNKNOWN",
      reason: "LIFETIME_BOUND_NOT_PINNED",
    });
    const unpinned = definePetMappingProfile("test/spec", [
      entity({ simcName: "imp", instancesBeginWithSummon: false }),
    ]);
    expect(petStateOf([], { profile: unpinned }).presenceAt("imp", 4_000)).toEqual({
      state: "UNKNOWN",
      reason: "INSTANCE_START_NOT_PINNED",
    });
  });

  it("a summon by the owner whose target has no usable gameID blocks absence", () => {
    const actors = [...BASE_ACTORS, actor(91, { petOwnerActorId: null })];
    const state = petStateOf([summon(3_000, 91, 1), summon(3_100, 404, 1)], { actors });
    expect(state.presenceAt("imp", 3_500)).toEqual({ state: "UNKNOWN", reason: "OWNERSHIP_NOT_STATED" });
  });

  it("a past cast outside every pinned lifetime contradicts the profile and blocks absence", () => {
    // Summoned at 2000 with D = 1000, still casting at 3200.
    const state = petStateOf([summon(2_000, IMP, 1), petCast(3_200, IMP, 1)]);
    expect(state.presenceAt("imp", 3_100)).toEqual({ state: "NOT_PRESENT" });
    expect(state.presenceAt("imp", 3_300)).toEqual({
      state: "UNKNOWN",
      reason: "LIFETIME_BOUND_CONTRADICTED",
    });
  });

  it("another player's pet of the same gameID never changes the owner's answer", () => {
    const state = petStateOf([summon(3_000, FOREIGN_IMP, 1, OTHER_PLAYER), petCast(3_100, FOREIGN_IMP, 1)]);
    expect(state.presenceAt("imp", 3_050)).toEqual({ state: "NOT_PRESENT" });
  });
});

describe("instance identity and counts", () => {
  it("two summons of one key up to t leave it undecided and the count without a ceiling", () => {
    const state = petStateOf([summon(2_000, IMP, 1), summon(2_200, IMP, 1)]);
    expect(state.presenceAt("imp", 2_300)).toEqual({ state: "UNKNOWN", reason: "PRESENCE_NOT_ESTABLISHED" });
    expect(state.instanceCountAt("imp", 2_300)).toEqual({
      kind: "BOUNDED",
      atLeast: 0,
      atMost: null,
      reason: "INSTANCE_IDENTITY_AMBIGUOUS",
    });
  });

  it.each([
    ["a cast before its summon", () => [petCast(1_900, IMP, 1), summon(2_000, IMP, 1)]],
    ["a null instance beside numbered ones", () => [summon(2_000, IMP, 1), petCast(2_050, IMP, null)]],
  ] as const)("%s is never PRESENT", (_name, events) => {
    expect(petStateOf(events()).presenceAt("imp", 2_100).state).toBe("UNKNOWN");
  });

  it("counts distinct instances, and bounds an undecided one", () => {
    const events = [summon(2_000, IMP, 1), summon(2_100, IMP, 2), summon(2_250, IMP, 3)];
    const state = petStateOf(events);
    expect(state.instanceCountAt("imp", 2_200)).toEqual({ kind: "EXACT", value: 2 });
    // At 2550 instance 1 is past its proven minimum; 2 and 3 are inside theirs.
    expect(state.instanceCountAt("imp", 2_550)).toEqual({
      kind: "BOUNDED",
      atLeast: 2,
      atMost: 3,
      reason: "PRESENCE_NOT_ESTABLISHED",
    });
  });
});

describe("pet atoms through the shared evaluator", () => {
  const VOCABULARY = defineSpecAtomVocabulary(
    "test/spec",
    [
      { identifier: "pet.imp.active", shape: "BOOLEAN", scope: "PLAYER_SCOPED", selfAddressing: false },
      { identifier: "imp_count", shape: "NUMERIC", scope: "PLAYER_SCOPED", selfAddressing: false },
    ],
    isBuiltinIdentifier,
  );

  function evaluate(expression: string, bound: readonly (SpecAtomBinding | null)[]) {
    const parsed = parseSimcExpression(expression, VOCABULARY);
    if (!parsed.ok) throw new Error(`expected parse: ${parsed.reason} ${parsed.fragment}`);
    const bindings: AtomBindings = {
      comboPoints: unknownNumber("STATE_NOT_MODELLED"),
      comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
      energyPct: unknownNumber("STATE_NOT_MODELLED"),
      knownBuffs: [],
      specAtoms: {
        vocabulary: VOCABULARY,
        bound: bound.filter((binding): binding is SpecAtomBinding => binding !== null),
      },
    };
    return evaluateSimcExpression(parsed.ast, expression, bindings);
  }

  it("a decided presence is a TRUTH; an unknown one is unbound and enumerated, never false", () => {
    const state = petStateOf([summon(2_000, IMP, 1)]);
    const present = evaluate("pet.imp.active", [
      petPresenceAtom("pet.imp.active", state.presenceAt("imp", 2_100)),
    ]);
    expect(present.outcome === "RESOLVED" && present.value).toBe(true);
    const absent = evaluate("pet.imp.active", [
      petPresenceAtom("pet.imp.active", state.presenceAt("imp", 1_999)),
    ]);
    expect(absent.outcome === "RESOLVED" && absent.value).toBe(false);
    expect(petPresenceAtom("pet.imp.active", state.presenceAt("imp", 2_000))).toBeNull();
    expect(evaluate("pet.imp.active", [null]).outcome).toBe("UNRESOLVED");
  });

  it("a count is KNOWN, ONE_OF or a lower bound exactly as proven, and an unbounded one never decides a ceiling", () => {
    expect(petCountAtom("imp_count", { kind: "EXACT", value: 2 }).value).toEqual({
      kind: "MAGNITUDE",
      binding: { state: "KNOWN_NUMBER", value: 2 },
    });
    expect(petCountAtom("imp_count", { kind: "BOUNDED", atLeast: 1, atMost: 3 }).value).toEqual({
      kind: "MAGNITUDE",
      binding: { state: "ONE_OF_NUMBERS", values: [1, 2, 3], reason: "STATE_NOT_ESTABLISHED" },
    });
    const floor = petCountAtom("imp_count", { kind: "BOUNDED", atLeast: 2, atMost: null });
    expect(evaluate("imp_count>=2", [floor]).outcome).toBe("RESOLVED");
    expect(evaluate("imp_count<3", [floor]).outcome).toBe("UNRESOLVED");
    const unknown = petCountAtom("imp_count", { kind: "UNKNOWN" });
    expect(evaluate("imp_count>=0", [unknown]).outcome).not.toBe("RESOLVED");
    expect(() => petCountAtom("imp_count", { kind: "BOUNDED", atLeast: 3, atMost: 1 })).toThrow();
  });

  it("the engine's results feed the adapters as they are", () => {
    const state = petStateOf([summon(1_500, IMP, 1)], { summons: "PARTIAL" });
    expect(petCountAtom("imp_count", state.instanceCountAt("imp", 2_500)).value).toEqual({
      kind: "MAGNITUDE",
      binding: { state: "BOUNDED_NUMBER", atLeast: 0, reason: "STATE_NOT_ESTABLISHED" },
    });
  });
});

describe("retained evidence: b1PmaKrd6CDfzngc fight 48, Blood focus 15 and its WCL-stated pets", () => {
  const SEGMENT_IDS = ["0-45", "45-113", "113-151", "151-214", "214-263", "263-311", "311-345"].map(
    (name) => `wcl-blood-death-knight-b1pm-full-fight-owned-pets.seg-${name}`,
  );
  let fight: CombatFight;

  beforeAll(async () => {
    const loaded = await loadCommittedEvidenceArchive();
    if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join("\n"));
    fight = bundleOf(loaded.archive, SEGMENT_IDS, [], {
      catalogArtifactId: "wcl-fight-context-b1pm-fight-48",
    }).fight;
  });

  // TEST lifetimes, not reviewed game data: they exercise both paths on real
  // summon evidence. Observed Ghoul instances cast for under 60 s here, and
  // each observed Blood Beast dies within 11 s of its summon.
  function stateOf(): PetState {
    const profile = definePetMappingProfile("test/blood-evidence", [
      entity({ simcName: "ghoul", wclGameIds: [26125], minLifetimeMs: 30_000, maxLifetimeMs: 61_000 }),
      entity({ simcName: "blood_beast", wclGameIds: [217228], minLifetimeMs: 5_000, maxLifetimeMs: 11_000 }),
      entity({ simcName: "rune_weapon_a", wclGameIds: [27893] }),
      entity({ simcName: "rune_weapon_b", wclGameIds: [27893] }),
    ]);
    return buildPetState({ state: createCombatState(fight), ownerActorId: 15, profile });
  }

  function tally(state: PetState, simcName: string): Record<string, number> {
    const counts: Record<string, number> = {};
    for (let t = fight.fight.startTimeMs + 500; t < fight.fight.endTimeMs; t += 1_000) {
      const presence = state.presenceAt(simcName, t);
      const label = presence.state === "UNKNOWN" ? `UNKNOWN:${presence.reason}` : presence.state;
      counts[label] = (counts[label] ?? 0) + 1;
    }
    return counts;
  }

  it("maps through WCL petOwner only: another player's Ghoul (41) and Blood Beast (201) are not 15's", () => {
    const state = stateOf();
    expect(state.mappingOf("ghoul")).toMatchObject({
      status: "MAPPED",
      actorIds: [47],
      unstatedOwnerCandidateIds: [],
    });
    expect(state.mappingOf("blood_beast")).toMatchObject({
      status: "MAPPED",
      actorIds: [45],
      // Actor 142 is a Blood Beast whose owner Warcraft Logs did not state.
      unstatedOwnerCandidateIds: [142],
    });
    expect(state.mappingOf("rune_weapon_a")).toMatchObject({ status: "AMBIGUOUS", actorIds: [44] });
    // Warband Bank Convergence: owned, listed by no entity, assigned to none.
    expect(state.unclassifiedOwnedActorIds).toEqual([224]);
    expect(state.ownedActorsWithoutGameId).toEqual([]);
  });

  it("records one summon per Ghoul and Blood Beast instance", () => {
    const state = stateOf();
    const ghoul = state.mappingOf("ghoul");
    const beast = state.mappingOf("blood_beast");
    if (ghoul?.status !== "MAPPED" || beast?.status !== "MAPPED") throw new Error("expected MAPPED");
    expect(
      ghoul.instances.map((i) => [i.key.instanceId, i.summonTimesMs, i.castTimesMs.length, i.deathTimesMs]),
    ).toEqual([
      [1, [7_439_353], 65, []],
      [2, [7_562_135], 46, []],
      [3, [7_684_335], 46, []],
    ]);
    expect(beast.instances.map((i) => [i.key.instanceId, i.summonTimesMs, i.deathTimesMs])).toEqual([
      [1, [7_438_782], [7_449_399]],
      [2, [7_549_250], [7_559_744]],
      [3, [7_649_394], [7_659_417]],
      [4, [7_740_449], [7_750_936]],
    ]);
  });

  it("decides the Ghoul at each one-second sample only where the evidence up to it does", () => {
    // PRESENT is 3 instances x the 30 s test minimum. Inside the first 61 s an
    // instance from before the pull could reach t.
    expect(tally(stateOf(), "ghoul")).toEqual({
      PRESENT: 90,
      NOT_PRESENT: 159,
      "UNKNOWN:PRESENCE_NOT_ESTABLISHED": 65,
      "UNKNOWN:PRE_PULL_INSTANCE_POSSIBLE": 31,
    });
    // Between the first Ghoul's maximum life and the second's summon: exactly zero.
    expect(stateOf().instanceCountAt("ghoul", 7_530_000)).toEqual({ kind: "EXACT", value: 0 });
  });

  it("never claims the Blood Beast absent: an unstated-owner Blood Beast could be 15's", () => {
    expect(tally(stateOf(), "blood_beast")).toEqual({ PRESENT: 20, "UNKNOWN:OWNERSHIP_NOT_STATED": 325 });
    expect(stateOf().instanceCountAt("blood_beast", 7_600_000)).toEqual({
      kind: "BOUNDED",
      atLeast: 0,
      atMost: null,
      reason: "OWNERSHIP_NOT_STATED",
    });
  });

  it("answers nothing about the Rune Weapon, which several engine pets share", () => {
    expect(tally(stateOf(), "rune_weapon_b")).toEqual({ "UNKNOWN:ENTITY_MAPPING_AMBIGUOUS": 345 });
  });
});
