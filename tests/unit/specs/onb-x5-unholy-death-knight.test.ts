/**
 * ONB-X5: Unholy Death Knight, its own representative, reading the shared pet mapping (ONB-S6).
 *
 * No decision resolves on real evidence, so the mandatory negatives are the centre of it: an open enemy count never reads as
 * single target, a missing talent never reads as false, an unknown pet never reads as absent, an army ghoul is never told apart
 * from an ordinary one, a press of a replaced spell is never read as off the list, a racial never preempts a class action, the
 * fight's real end never answers a prediction, and a later event never changes an earlier answer.
 *
 * Synthetic on purpose. The real replay is offline: rXAfw9t1q8YpmkKD fight 13 actor 18 is uncommitted (agent/architecture.md "ONB-X5").
 */

import { describe, expect, it } from "vitest";

import unholyTalents from "../../../src/data/game/deathknight-unholy-talents.json";
import artifact from "../../../src/simc/data/deathknight-unholy.apl.json";
import {
  pinnedUnholyDeathKnightGcdSemantics,
  UNHOLY_DEATH_KNIGHT_CONSTRUCTOR_LANES,
  unholyDeathKnightBaseGcdMsForAbility,
  unholyDeathKnightExecutionLaneForAbility,
  unholyDeathKnightExecutionLaneForToken,
  unholyDeathKnightTokenBinding,
  unholyDeathKnightTokenByAbilityId,
} from "../../../src/data/game/deathknight-unholy-gcd-semantics.js";
import { UNHOLY_DEATH_KNIGHT_PET_ROWS } from "../../../src/data/game/deathknight-unholy-pet-semantics.js";
import {
  pinnedUnholyDeathKnightTalents,
  resolveUnholyDeathKnightHeroTree,
  resolveUnholyDeathKnightTalent,
} from "../../../src/data/game/deathknight-unholy-talents.js";
import { unholyDeathKnightTransitionContractFor } from "../../../src/data/game/deathknight-unholy-transition-authority.js";
import type { PetMappingProfile } from "../../../src/engine/game-state/pets/pet-state.js";
import { definePetMappingProfile } from "../../../src/engine/game-state/pets/pet-state.js";
import type { CombatActor } from "../../../src/engine/normalization/actors.js";
import type { CombatEvent } from "../../../src/engine/normalization/normalized-events.js";
import { createCombatState } from "../../../src/engine/state/combat-state.js";
import type { AnalyzerRegistration } from "../../../src/findings/analyzer-registration.js";
import {
  analyzerForSpec,
  internalAnalyzerForSpec,
  PRODUCTION_CATALOG,
} from "../../../src/services/analyzer-registry.js";
import { resolveSpecIdentity } from "../../../src/services/spec-identity.js";
import type { AplAction, AplAuthority } from "../../../src/simc/apl-authority.js";
import {
  evaluateSimcExpression,
  knownNumber,
  unknownNumber,
  type AtomBindings,
} from "../../../src/simc/expression/evaluate.js";
import { parseSimcExpression } from "../../../src/simc/expression/parse.js";
import { nonDomainCategoryOf } from "../../../src/simc/non-domain-tokens.js";
import {
  resolveUnholyDeathKnightApplicability,
  resolveUnholyDeathKnightUsability,
  TALENT_BUILT_TOKENS,
} from "../../../src/specs/deathknight/unholy/action-profile.js";
import { UNHOLY_DEATH_KNIGHT_CAPABILITIES } from "../../../src/specs/deathknight/unholy/authority-bindings.js";
import { unholyDeathKnightNonDomainApplicabilityFor } from "../../../src/specs/deathknight/unholy/domain-boundary.js";
import { unholyDeathKnightFirstGcdSelectionAt } from "../../../src/specs/deathknight/unholy/first-gcd-adapter.js";
import { initialUnholyDeathKnightState } from "../../../src/specs/deathknight/unholy/first-gcd-state.js";
import { analyzeObservedUnholyDeathKnightDecisions } from "../../../src/specs/deathknight/unholy/observed-analysis.js";
import {
  unholyDeathKnightPetAtomsOf,
  unholyDeathKnightPetProfile,
  unholyDeathKnightPetReadingAt,
  unholyDeathKnightPetReadingKeys,
  unholyDeathKnightPetStateOf,
} from "../../../src/specs/deathknight/unholy/pet-profile.js";
import { pinnedUnholyDeathKnightAuthority } from "../../../src/specs/deathknight/unholy/pinned-authority.js";
import { resolveUnholyDeathKnightAtoms } from "../../../src/specs/deathknight/unholy/resolver.js";
import { UNHOLY_DEATH_KNIGHT_ATOM_VOCABULARY } from "../../../src/specs/deathknight/unholy/vocabulary.js";
import {
  attachedResources,
  castEvent,
  classResource,
  FIGHT_START_MS,
  summonEvent,
  syntheticFight,
} from "../../support/synthetic-fight.js";

const SOURCE = 7;
const OTHER_DK = 8;
const BOSS = 900;

const SCOURGE_STRIKE = 55090;
const VAMPIRIC_STRIKE = 433895;
const DEATH_COIL = 47541;
const NECROTIC_COIL = 1242174;
const EPIDEMIC = 207317;
const GRAVEYARD = 383269;
const FESTERING_STRIKE = 85948;
const FESTERING_SCYTHE = 458128;
const OUTBREAK = 77575;
const PUTREFY = 1247378;
const DARK_TRANSFORMATION = 1233448;
const BLIGHTFALL = 1271967;
const ARMY_OF_THE_DEAD = 42650;
const SOUL_REAPER = 343294;
const DEATH_AND_DECAY = 43265;

const LORD_ACTOR = 50;
const GHOUL_ACTOR = 51;
const GARGOYLE_ACTOR = 52;
const ABOMINATION_ACTOR = 53;
const OTHER_LORD_ACTOR = 60;
const UNSTATED_LORD_ACTOR = 70;

const LONG_FIGHT_MS = 120_000;

type Entry = { readonly id: number; readonly nodeId: number };

function entries(names: readonly string[]): readonly Entry[] {
  return names.map((name) => {
    const row = unholyTalents.talents.find((candidate) => candidate.simcName === name);
    if (row === undefined) throw new Error(`no pinned talent ${name}`);
    return { id: row.traitEntryId, nodeId: row.traitNodeId };
  });
}

function heroEntry(simcName: string): Entry {
  const tree = unholyTalents.heroTrees.find((candidate) => candidate.simcName === simcName);
  const row = tree?.entries[0];
  if (row === undefined) throw new Error(`no hero tree ${simcName}`);
  return { id: row.traitEntryId, nodeId: row.traitNodeId };
}

/** The shape of the one retained subject: every modelled talent but Cycle of Death, on the Rider's tree. */
const SPEC_TALENTS = entries([
  "army_of_the_dead",
  "blightburst",
  "dark_transformation",
  "festering_scythe",
  "outbreak",
  "putrefy",
  "reaping",
  "scourge_strike",
  "soul_reaper",
]);
const RIDER: readonly Entry[] = [...SPEC_TALENTS, heroEntry("rider_of_the_apocalypse")];
const SANLAYN: readonly Entry[] = [...SPEC_TALENTS, heroEntry("sanlayn")];

function authority(): AplAuthority {
  const loaded = pinnedUnholyDeathKnightAuthority();
  if (!loaded.ok) throw new Error("the pinned authority did not load");
  return loaded.authority;
}

function lineAt(listName: string, ordinal: number): AplAction {
  const lookup = authority().actionsInList(listName);
  if (!lookup.found) throw new Error(`no list ${listName}`);
  const found = lookup.actions.find((action) => action.priorityOrdinal === ordinal);
  if (found === undefined) throw new Error(`no ${listName}[${String(ordinal)}]`);
  return found;
}

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

/** Every pet's owner stated, as the retained fight does NOT give it. */
const STATED_ACTORS: readonly CombatActor[] = [
  actor(SOURCE, { actorType: "PLAYER", rawType: "Player", subType: "DeathKnight" }),
  actor(OTHER_DK, { actorType: "PLAYER", rawType: "Player", subType: "DeathKnight" }),
  actor(LORD_ACTOR, { gameId: 264321, petOwnerActorId: SOURCE }),
  actor(GHOUL_ACTOR, { gameId: 237409, petOwnerActorId: SOURCE }),
  actor(GARGOYLE_ACTOR, { gameId: 27829, petOwnerActorId: SOURCE }),
  actor(ABOMINATION_ACTOR, { gameId: 149555, petOwnerActorId: SOURCE }),
  actor(OTHER_LORD_ACTOR, { gameId: 264321, petOwnerActorId: OTHER_DK }),
];

/** The shape of the retained fight: a catalog Lord of the Dead with no stated owner. */
const RETAINED_SHAPE_ACTORS: readonly CombatActor[] = [
  ...STATED_ACTORS,
  actor(UNSTATED_LORD_ACTOR, { gameId: 264321 }),
];

interface Step {
  readonly t: number;
  readonly ability: number;
  readonly phase?: "BEGIN" | "COMPLETE";
  readonly rune?: number;
  readonly runicPowerWire?: number;
  readonly melee?: boolean;
}

interface Summon {
  readonly t: number;
  readonly actor: number;
  readonly instance: number;
}

interface FightOptions {
  readonly summons?: readonly Summon[];
  readonly summonCoverage?: boolean;
  readonly actors?: readonly CombatActor[];
}

function fightWith(tree: readonly Entry[] | null, steps: readonly Step[], options: FightOptions = {}) {
  const events: CombatEvent[] = [];
  if (tree !== null) {
    const talentTree = tree.map((entry) => ({ id: entry.id, rank: 1, nodeId: entry.nodeId }));
    events.push({
      locator: {
        streamId: "all",
        pageOrdinal: 0,
        indexInPage: 0,
        ingestionOrdinal: 0,
        rawType: "combatantinfo",
        reportTimeMs: FIGHT_START_MS,
      },
      ingestionOrdinal: 0,
      reportTimeMs: FIGHT_START_MS,
      fightTimeMs: 0,
      rawType: "combatantinfo",
      source: { actorId: SOURCE, instanceId: null },
      target: null,
      sourceAbsence: null,
      targetAbsence: "NOT_SUPPLIED",
      abilityGameId: null,
      attachedResources: null,
      outsideRequestedRange: false,
      kind: "COMBATANT_INFO",
      snapshot: { actorId: SOURCE, specId: 0, gear: [], malformedGearRows: [], talentTree },
    } as unknown as CombatEvent);
  }
  const timed: { readonly t: number; readonly make: (ordinal: number) => CombatEvent }[] = [
    ...steps.map((step) => ({
      t: step.t,
      make: (ordinal: number) => {
        const pools = [
          ...(step.rune === undefined ? [] : [classResource(5, step.rune, { max: 6, cost: 2 })]),
          ...(step.runicPowerWire === undefined
            ? []
            : [classResource(6, step.runicPowerWire, { max: 1000, cost: 300 })]),
        ];
        const event = castEvent({
          ordinal,
          reportTimeMs: FIGHT_START_MS + step.t,
          sourceActorId: SOURCE,
          targetActorId: BOSS,
          abilityGameId: step.ability,
          castPhase: step.phase ?? "COMPLETE",
          attachedResources:
            pools.length === 0
              ? null
              : attachedResources({ side: "SOURCE", actorId: SOURCE, classResources: pools }),
        });
        return step.melee === true ? ({ ...event, isMelee: true } as CombatEvent) : event;
      },
    })),
    ...(options.summons ?? []).map((summon) => ({
      t: summon.t,
      make: (ordinal: number) =>
        summonEvent({
          ordinal,
          reportTimeMs: FIGHT_START_MS + summon.t,
          sourceActorId: SOURCE,
          targetActorId: summon.actor,
          targetInstanceId: summon.instance,
        }),
    })),
  ].sort((left, right) => left.t - right.t);
  timed.forEach((entry, index) => events.push(entry.make(index + 1)));
  const actors = options.actors;
  return createCombatState(
    syntheticFight({
      events,
      observedCategories: [
        "CASTS",
        "RESOURCES",
        ...(options.summonCoverage === false ? [] : (["SUMMONS"] as const)),
      ],
      ...(actors === undefined
        ? {}
        : {
            actors: new Map(actors.map((entry) => [entry.actorId, entry])),
            endTimeMs: FIGHT_START_MS + LONG_FIGHT_MS,
          }),
    }),
  );
}

function analyze(tree: readonly Entry[] | null, steps: readonly Step[], options: FightOptions = {}) {
  return analyzeObservedUnholyDeathKnightDecisions({
    state: fightWith(tree, steps, options),
    actorId: SOURCE,
    specId: "deathknight/unholy",
    targetActorId: null,
  });
}

function analyzed(tree: readonly Entry[] | null, steps: readonly Step[], options: FightOptions = {}) {
  const analysis = analyze(tree, steps, options);
  if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
  return analysis;
}

/** A query with values this slice never has. Only a test can look behind the list's first refusals this way. */
function queryGiven(input: {
  readonly tree: readonly Entry[];
  readonly magnitudes?: Readonly<Record<string, number>>;
  readonly truths?: Readonly<Record<string, boolean>>;
  readonly observed?: number;
}) {
  const talents = Object.fromEntries(
    unholyTalents.talents.map((talent) => [
      talent.simcName,
      resolveUnholyDeathKnightTalent(input.tree, talent.simcName),
    ]),
  );
  const talentsProvenAbsent = new Set<string>();
  for (const [name, talent] of Object.entries(talents)) {
    if (talent.selection === "NOT_SELECTED") talentsProvenAbsent.add(name);
  }
  const resolution = resolveUnholyDeathKnightAtoms({
    rune: unknownNumber("STATE_NOT_ESTABLISHED"),
    runicPower: unknownNumber("STATE_NOT_ESTABLISHED"),
    runicPowerDeficit: unknownNumber("STATE_NOT_ESTABLISHED"),
  });
  const magnitudes = input.magnitudes ?? {};
  const bound = resolution.specAtoms.bound.map((binding) => {
    const given = magnitudes[binding.key];
    return given === undefined
      ? binding
      : { ...binding, value: { kind: "MAGNITUDE" as const, binding: knownNumber(given) } };
  });
  for (const [key, value] of Object.entries(input.truths ?? {})) {
    bound.push({ key, actionToken: null, value: { kind: "TRUTH", value } });
  }
  const knownTalents = Object.entries(talents).flatMap(([name, talent]) =>
    talent.selection === "SELECTED" ? [{ name, taken: true }] : [],
  );
  const bindings: AtomBindings = {
    comboPoints: unknownNumber("STATE_NOT_MODELLED"),
    comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
    energyPct: unknownNumber("STATE_NOT_MODELLED"),
    knownBuffs: [],
    knownTalents,
    knownCooldownRemainsSeconds: [],
    specAtoms: { ...resolution.specAtoms, bound },
  };
  return unholyDeathKnightFirstGcdSelectionAt({
    authority: authority(),
    bindings,
    buildFacts: { talents, talentsProvenAbsent },
    observedAbilityGameId: input.observed ?? SCOURGE_STRIKE,
  });
}

function evaluate(condition: string, bound: readonly { key: string; value: boolean }[] = []) {
  const parsed = parseSimcExpression(condition, UNHOLY_DEATH_KNIGHT_ATOM_VOCABULARY);
  if (!parsed.ok) throw new Error(parsed.fragment);
  const resolution = resolveUnholyDeathKnightAtoms({
    rune: unknownNumber("STATE_NOT_ESTABLISHED"),
    runicPower: unknownNumber("STATE_NOT_ESTABLISHED"),
    runicPowerDeficit: unknownNumber("STATE_NOT_ESTABLISHED"),
  });
  return evaluateSimcExpression(parsed.ast, condition, {
    comboPoints: unknownNumber("STATE_NOT_MODELLED"),
    comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
    energyPct: unknownNumber("STATE_NOT_MODELLED"),
    knownBuffs: [],
    knownTalents: [],
    knownCooldownRemainsSeconds: [],
    specAtoms: {
      vocabulary: resolution.specAtoms.vocabulary,
      bound: [
        ...resolution.specAtoms.bound,
        ...bound.map(({ key, value }) => ({
          key,
          actionToken: null,
          value: { kind: "TRUTH" as const, value },
        })),
      ],
    },
  });
}

describe("the row", () => {
  it("is reachable by the internal lookup only, and a public identity is refused", () => {
    const row = internalAnalyzerForSpec("deathknight/unholy", PRODUCTION_CATALOG) as AnalyzerRegistration;
    expect(row.analyzerId).toBe("deathknight-unholy-observed-decisions");
    expect(row.exposure).toBe("INTERNAL_ONLY");
    expect(analyzerForSpec("deathknight/unholy", PRODUCTION_CATALOG)).toBeNull();
    expect(resolveSpecIdentity({ className: "DeathKnight", specName: "Unholy" }).ok).toBe(false);
  });

  it("refuses another specialization before reading anything of its own", () => {
    expect(
      analyzeObservedUnholyDeathKnightDecisions({
        state: fightWith(null, []),
        actorId: SOURCE,
        specId: "deathknight/frost" as never,
        targetActorId: null,
      }).status,
    ).toBe("SPEC_NOT_SUPPORTED");
  });

  it("a capture with no combatant info refuses as PROFILE_NOT_RESOLVED, never judges", () => {
    expect(analyze(null, [{ t: 2000, ability: SCOURGE_STRIKE }]).status).toBe("PROFILE_NOT_RESOLVED");
  });

  it("declares offensive authority only, and reports every other domain without it", () => {
    const byDomain = new Map(analyzed(RIDER, []).domains.map((result) => [result.domain, result.resolution]));
    expect(byDomain.get("OFFENSIVE_ROTATION")).toBe("AUTHORITY_AVAILABLE");
    expect(byDomain.get("INTERRUPT")).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
    expect(byDomain.get("DEFENSIVE_COOLDOWN")).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
    expect(byDomain.get("RESOURCE_SPENDING")).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
  });

  it("declares the resources and summons it consumes, so a request deriving its ingestion cannot under-fetch them", () => {
    const offensive = UNHOLY_DEATH_KNIGHT_CAPABILITIES.find((row) => row.domain === "OFFENSIVE_ROTATION");
    expect(offensive?.requirements.resources).toEqual(["RUNES", "RUNIC_POWER"]);
    expect(offensive?.requirements.evidenceCategories).toEqual([
      "CASTS",
      "RESOURCES",
      "COMBATANT_INFO",
      "SUMMONS",
    ]);
  });
});

describe("a press of a replaced spell is that token executing", () => {
  it.each([
    ["death_coil", DEATH_COIL, NECROTIC_COIL],
    ["epidemic", EPIDEMIC, GRAVEYARD],
    ["festering_strike", FESTERING_STRIKE, FESTERING_SCYTHE],
    ["scourge_strike", SCOURGE_STRIKE, VAMPIRIC_STRIKE],
  ])("%s binds both its own row and its replacement", (token, own, replacement) => {
    expect(unholyDeathKnightTokenBinding(token)).toMatchObject({
      kind: "KNOWN_SET",
      abilityGameIds: [own, replacement],
    });
    const tokens = unholyDeathKnightTokenByAbilityId();
    expect(tokens.get(own)).toBe(token);
    expect(tokens.get(replacement)).toBe(token);
    expect(unholyDeathKnightExecutionLaneForToken(token)).toBe("GCD_CONSUMING");
  });

  it("a Necrotic Coil is an eligible decision of death_coil, never an off-list cast", () => {
    const analysis = analyzed(RIDER, [
      { t: 2000, ability: DEATH_COIL },
      { t: 3000, ability: NECROTIC_COIL },
      { t: 4000, ability: FESTERING_SCYTHE },
    ]);
    expect(analysis.comparisons.map((comparison) => comparison.decision.observedToken)).toEqual([
      "death_coil",
      "death_coil",
      "festering_strike",
    ]);
    expect(analysis.excluded).toEqual([]);
  });

  it("a pet's own Scourge Strike and a spell's damage child bind nothing", () => {
    const tokens = unholyDeathKnightTokenByAbilityId();
    for (const id of [445508, 445509, 390220, 1270443, 1277016, 325554, 1235391]) {
      expect(tokens.get(id)).toBeUndefined();
      expect(unholyDeathKnightExecutionLaneForAbility(id)).toBe("UNKNOWN_LANE");
    }
  });

  it("the press proves its own token, and nothing else", () => {
    const usability = (token: string, observed: number) =>
      resolveUnholyDeathKnightUsability({
        state: initialUnholyDeathKnightState(),
        action: { ...lineAt("single_target", 11), actionToken: token } as AplAction,
        observedAbilityGameId: observed,
      }).kind;
    expect(usability("festering_strike", FESTERING_SCYTHE)).toBe("PROVEN_USABLE");
    expect(usability("festering_strike", SCOURGE_STRIKE)).toBe("UNKNOWN");
  });
});

describe("Dark Transformation's lane is its constructor's, not its record's", () => {
  it("the record stays 1500 ms as extracted, and the reviewed lane is off the GCD", () => {
    expect(unholyDeathKnightBaseGcdMsForAbility(DARK_TRANSFORMATION)).toBe(1500);
    expect(unholyDeathKnightExecutionLaneForAbility(DARK_TRANSFORMATION)).toBe("NON_GCD");
    expect(UNHOLY_DEATH_KNIGHT_CONSTRUCTOR_LANES.get(DARK_TRANSFORMATION)).toBe("NON_GCD");
  });

  it("a press of it is excluded as off the GCD, and never a decision", () => {
    const analysis = analyzed(RIDER, [{ t: 2000, ability: DARK_TRANSFORMATION }]);
    expect(analysis.comparisons).toEqual([]);
    expect(analysis.excluded.map((cast) => cast.reason)).toEqual(["NON_GCD_ACTION"]);
    expect(analysis.coverage.gcdDistribution).toEqual([{ key: "NON_GCD | 1500 ms", count: 1 }]);
  });

  it("a press of its Blightfall replacement takes the GCD, and is that token's decision", () => {
    expect(unholyDeathKnightExecutionLaneForAbility(BLIGHTFALL)).toBe("GCD_CONSUMING");
    expect(unholyDeathKnightTokenByAbilityId().get(BLIGHTFALL)).toBe("dark_transformation");
    const analysis = analyzed(RIDER, [{ t: 2000, ability: BLIGHTFALL }]);
    expect(analysis.comparisons.map((comparison) => comparison.decision.observedToken)).toEqual([
      "dark_transformation",
    ]);
    expect(analysis.comparisons[0]?.outcome).toBe("UNKNOWN");
  });

  it("the token binds both, so its lane depends on a buff nothing binds, and it is refused rather than guessed", () => {
    expect(unholyDeathKnightTokenBinding("dark_transformation")).toMatchObject({
      kind: "KNOWN_SET",
      abilityGameIds: [DARK_TRANSFORMATION, BLIGHTFALL],
    });
    expect(unholyDeathKnightExecutionLaneForToken("dark_transformation")).toBe("UNKNOWN_LANE");
    const { rootScan } = queryGiven({ tree: RIDER });
    expect(
      rootScan.undecidedCandidates.find((candidate) => candidate.at === "cooldowns[4] dark_transformation")
        ?.lane,
    ).toBe("UNKNOWN_LANE");
  });

  it("no other record is overridden", () => {
    expect([...UNHOLY_DEATH_KNIGHT_CONSTRUCTOR_LANES.keys()]).toEqual([DARK_TRANSFORMATION]);
  });
});

describe("the decision's instant is its cast", () => {
  it("a begin alone is no decision, and no missed action is built on it", () => {
    const analysis = analyzed(RIDER, [{ t: 2000, ability: SCOURGE_STRIKE, phase: "BEGIN" }]);
    expect(analysis.comparisons).toEqual([]);
    expect(analysis.excluded).toEqual([]);
  });

  it("the decision carries its own cast's time", () => {
    const analysis = analyzed(RIDER, [{ t: 2000, ability: SCOURGE_STRIKE }]);
    expect(analysis.comparisons[0]?.decision.reportTimeMs).toBe(FIGHT_START_MS + 2000);
    expect(analysis.resolved[0]?.pets.reportTimeMs).toBe(FIGHT_START_MS + 2000);
  });

  it("classifies the population: a swing, and a spell with no record, are excluded, never judged", () => {
    const analysis = analyzed(RIDER, [
      { t: 2000, ability: 1, melee: true },
      { t: 2500, ability: 444347 },
      { t: 3000, ability: 48707 },
      { t: 3500, ability: 999999 },
    ]);
    expect(analysis.comparisons).toHaveLength(0);
    expect(analysis.excluded.map((cast) => cast.reason)).toEqual([
      "MELEE_SWING",
      "EXECUTION_LANE_NOT_ESTABLISHED",
      "EXECUTION_LANE_NOT_ESTABLISHED",
      "EXECUTION_LANE_NOT_ESTABLISHED",
    ]);
  });
});

describe("the pets, as the pinned data states them", () => {
  it("no reviewed row claims a floor or a ceiling", () => {
    for (const row of UNHOLY_DEATH_KNIGHT_PET_ROWS) {
      expect(row.minLifetimeMs).toBeNull();
      expect(row.maxLifetimeMs).toBeNull();
    }
    expect(UNHOLY_DEATH_KNIGHT_PET_ROWS.map((row) => row.simcName)).toEqual([
      "lord_of_the_dead",
      "army_ghoul",
      "lesser_ghoul",
      "gargoyle",
    ]);
  });

  it("the army ghoul and every other lesser ghoul share a gameID, so the state reports them AMBIGUOUS, and never guesses", () => {
    const pets = unholyDeathKnightPetStateOf(
      fightWith(RIDER, [], {
        actors: STATED_ACTORS,
        summons: [{ t: 49_000, actor: GHOUL_ACTOR, instance: 1 }],
      }),
      SOURCE,
    );
    expect(pets.mappingOf("army_ghoul")).toEqual({
      simcName: "army_ghoul",
      status: "AMBIGUOUS",
      sharedWith: ["lesser_ghoul"],
      actorIds: [GHOUL_ACTOR],
    });
    expect(pets.presenceAt("army_ghoul", FIGHT_START_MS + 50_000)).toEqual({
      state: "UNKNOWN",
      reason: "ENTITY_MAPPING_AMBIGUOUS",
    });
    expect(pets.presenceAt("lesser_ghoul", FIGHT_START_MS + 50_000)).toEqual({
      state: "UNKNOWN",
      reason: "ENTITY_MAPPING_AMBIGUOUS",
    });
  });

  it("an Abomination the list never reads is disclosed as unclassified, never assigned to an entity", () => {
    const pets = unholyDeathKnightPetStateOf(fightWith(RIDER, [], { actors: STATED_ACTORS }), SOURCE);
    expect(pets.unclassifiedOwnedActorIds).toEqual([ABOMINATION_ACTOR]);
    expect(pets.mappingOf("lord_of_the_dead")).toMatchObject({ status: "MAPPED", actorIds: [LORD_ACTOR] });
  });

  it("another death knight's Lord of the Dead is never this owner's", () => {
    const pets = unholyDeathKnightPetStateOf(fightWith(RIDER, [], { actors: STATED_ACTORS }), SOURCE);
    expect(pets.mappingOf("lord_of_the_dead")).toMatchObject({ actorIds: [LORD_ACTOR] });
    expect(pets.unclassifiedOwnedActorIds).not.toContain(OTHER_LORD_ACTOR);
  });
});

describe("what the pets answer", () => {
  const AT = FIGHT_START_MS + 50_000;
  const readingOf = (options: FightOptions) =>
    unholyDeathKnightPetReadingAt(
      unholyDeathKnightPetStateOf(fightWith(RIDER, [], { actors: STATED_ACTORS, ...options }), SOURCE),
      AT,
    );

  it("a summon proves no Lord of the Dead up, because no floor is pinned: never true by default", () => {
    const reading = readingOf({ summons: [{ t: 49_000, actor: LORD_ACTOR, instance: 1 }] });
    expect(reading.lordOfTheDead).toEqual({ state: "UNKNOWN", reason: "LIFETIME_BOUND_NOT_PINNED" });
  });

  it("no summon proves none, because no ceiling is pinned: never false by default", () => {
    expect(readingOf({}).lordOfTheDead).toEqual({ state: "UNKNOWN", reason: "LIFETIME_BOUND_NOT_PINNED" });
  });

  it("a catalog Lord with no stated owner, the shape of the retained fight, refuses and is never assigned", () => {
    expect(readingOf({ actors: RETAINED_SHAPE_ACTORS }).lordOfTheDead).toEqual({
      state: "UNKNOWN",
      reason: "OWNERSHIP_NOT_STATED",
    });
  });

  it("a Gargoyle no capture has corroborated is never absent, whatever the fight holds", () => {
    expect(readingOf({}).gargoyle).toEqual({ state: "UNKNOWN", reason: "INSTANCE_START_NOT_PINNED" });
  });

  it("an undecided presence binds no atom, so the truth is enumerated, and a condition reading it stays open", () => {
    const reading = readingOf({ summons: [{ t: 49_000, actor: LORD_ACTOR, instance: 1 }] });
    expect(unholyDeathKnightPetAtomsOf(reading)).toEqual([]);
    expect(evaluate("pet.lord_of_the_dead.active").outcome).toBe("UNRESOLVED");
    expect(evaluate("pet.army_ghoul.active").outcome).toBe("UNRESOLVED");
    expect(evaluate("pet.gargoyle.active").outcome).toBe("UNRESOLVED");
  });

  it("a decided answer reads as it stands, for the day a reviewed bound makes one", () => {
    const decided = (state: "PRESENT" | "NOT_PRESENT") =>
      state === "PRESENT" ? { state, locators: [] } : { state };
    expect(
      unholyDeathKnightPetAtomsOf({
        reportTimeMs: AT,
        armyGhoul: decided("PRESENT"),
        gargoyle: decided("NOT_PRESENT"),
        lordOfTheDead: { state: "UNKNOWN", reason: "OUTSIDE_FIGHT" },
      }),
    ).toEqual([
      { key: "pet.army_ghoul.active", actionToken: null, value: { kind: "TRUTH", value: true } },
      { key: "pet.gargoyle.active", actionToken: null, value: { kind: "TRUTH", value: false } },
    ]);
  });

  it("a later summon never changes the answer at an earlier instant, under a bound only a test can state", () => {
    const profile: PetMappingProfile = definePetMappingProfile("deathknight/unholy", [
      {
        simcName: "lord_of_the_dead",
        wclGameIds: [264321],
        minLifetimeMs: 10_000,
        maxLifetimeMs: 20_000,
        instancesBeginWithSummon: true,
        provenance: "a test's bound, no claim about the game",
      },
    ]);
    const stateOf = (summons: readonly Summon[]) =>
      unholyDeathKnightPetStateOf(fightWith(RIDER, [], { actors: STATED_ACTORS, summons }), SOURCE, profile);
    const earlier = stateOf([{ t: 49_000, actor: LORD_ACTOR, instance: 1 }]).presenceAt(
      "lord_of_the_dead",
      AT,
    );
    const withLater = stateOf([
      { t: 49_000, actor: LORD_ACTOR, instance: 1 },
      { t: 60_000, actor: LORD_ACTOR, instance: 2 },
    ]).presenceAt("lord_of_the_dead", AT);
    expect(earlier.state).toBe("PRESENT");
    expect(withLater.state).toBe("PRESENT");
    // A summon only after the instant is no answer about it, and with no earlier one the lord is proven gone.
    expect(
      stateOf([{ t: 60_000, actor: LORD_ACTOR, instance: 1 }]).presenceAt("lord_of_the_dead", AT).state,
    ).toBe("NOT_PRESENT");
  });

  it("with no summon coverage a missing page is never an absence, under a bound only a test can state", () => {
    const profile: PetMappingProfile = definePetMappingProfile("deathknight/unholy", [
      {
        simcName: "lord_of_the_dead",
        wclGameIds: [264321],
        minLifetimeMs: null,
        maxLifetimeMs: 20_000,
        instancesBeginWithSummon: true,
        provenance: "a test's bound, no claim about the game",
      },
    ]);
    const presence = unholyDeathKnightPetStateOf(
      fightWith(RIDER, [], { actors: STATED_ACTORS, summonCoverage: false }),
      SOURCE,
      profile,
    ).presenceAt("lord_of_the_dead", AT);
    expect(presence.state).toBe("UNKNOWN");
  });

  it("the profile is the reviewed rows, and each reading has one coverage key per entity read, with its reason", () => {
    expect(unholyDeathKnightPetProfile().entities.map((row) => row.simcName)).toEqual(
      UNHOLY_DEATH_KNIGHT_PET_ROWS.map((row) => row.simcName),
    );
    expect(unholyDeathKnightPetReadingKeys(readingOf({}))).toEqual([
      "army_ghoul: UNKNOWN ENTITY_MAPPING_AMBIGUOUS",
      "gargoyle: UNKNOWN INSTANCE_START_NOT_PINNED",
      "lord_of_the_dead: UNKNOWN LIFETIME_BOUND_NOT_PINNED",
    ]);
  });

  it("the facade attaches a reading to every decision and tallies them", () => {
    const analysis = analyzed(
      RIDER,
      [
        { t: 2000, ability: SCOURGE_STRIKE },
        { t: 3000, ability: DEATH_COIL },
      ],
      { actors: RETAINED_SHAPE_ACTORS },
    );
    expect(analysis.resolved.map((entry) => entry.pets.lordOfTheDead)).toEqual([
      { state: "UNKNOWN", reason: "OWNERSHIP_NOT_STATED" },
      { state: "UNKNOWN", reason: "OWNERSHIP_NOT_STATED" },
    ]);
    expect(analysis.coverage.petReadings).toEqual([
      { key: "army_ghoul: UNKNOWN ENTITY_MAPPING_AMBIGUOUS", count: 2 },
      { key: "gargoyle: UNKNOWN INSTANCE_START_NOT_PINNED", count: 2 },
      { key: "lord_of_the_dead: UNKNOWN OWNERSHIP_NOT_STATED", count: 2 },
    ]);
  });

  it("the Lord's remaining life is unbound, so a truth given it still leaves the line open", () => {
    const condition = "pet.lord_of_the_dead.active&pet.lord_of_the_dead.remains<9";
    expect(evaluate(condition).outcome).toBe("UNRESOLVED");
    expect(evaluate(condition, [{ key: "pet.lord_of_the_dead.active", value: true }]).outcome).toBe(
      "UNRESOLVED",
    );
    expect(evaluate(condition, [{ key: "pet.lord_of_the_dead.active", value: false }])).toMatchObject({
      outcome: "RESOLVED",
      value: false,
    });
  });
});

describe("no decision resolves", () => {
  it.each([
    ["rider_of_the_apocalypse", RIDER],
    ["sanlayn", SANLAYN],
    ["no hero entry at all", SPEC_TALENTS],
  ])("%s: every decision stays UNKNOWN, with its reason attached", (_name, tree) => {
    const analysis = analyzed(tree, [
      { t: 2000, ability: OUTBREAK, rune: 6 },
      { t: 3000, ability: FESTERING_STRIKE, rune: 5 },
      { t: 4000, ability: ARMY_OF_THE_DEAD, rune: 3 },
      { t: 5000, ability: BLIGHTFALL },
      { t: 6000, ability: SOUL_REAPER, rune: 3 },
      { t: 7000, ability: PUTREFY, rune: 2 },
      { t: 8000, ability: DEATH_COIL, runicPowerWire: 500 },
      { t: 9000, ability: SCOURGE_STRIKE, rune: 1 },
    ]);
    const { coverage } = analysis;
    expect(coverage.eligibleDecisions).toBe(8);
    expect(coverage.match).toBe(0);
    expect(coverage.rejected).toBe(0);
    expect(coverage.unknown).toBe(8);
    expect(coverage.resolvedComparisons).toBe(0);
    expect(analysis.comparisons.every((comparison) => comparison.outcome === "UNKNOWN")).toBe(true);
  });

  it("the retained shape: the engine refuses at the swing's entry, with the cooldown lines open and the scan stopped on a %", () => {
    const { result, rootScan } = queryGiven({ tree: RIDER });
    expect(result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    if (result.kind !== "ROTATIONAL_GCD_UNKNOWN") throw new Error(result.kind);
    expect(`${String(result.blockedAt?.listName)}[${String(result.blockedAt?.priorityOrdinal)}]`).toBe(
      "default[0]",
    );
    expect(rootScan.undecidedCandidates.map((candidate) => candidate.at)).toEqual([
      "default[0] auto_attack",
      "cooldowns[2] outbreak",
      "cooldowns[3] army_of_the_dead",
      "cooldowns[4] dark_transformation",
    ]);
    expect(rootScan.stoppingPoint?.at).toBe("aoe[0] death_and_decay");
    expect(rootScan.stoppingPoint?.atoms).toEqual(["UNSUPPORTED_EXPRESSION:UNSUPPORTED_OPERATOR:%"]);
  });

  it("an observed press of an open cooldown line proves itself usable, and is still no MATCH", () => {
    const analysis = analyzed(RIDER, [{ t: 2000, ability: OUTBREAK, rune: 6 }]);
    expect(analysis.comparisons[0]?.outcome).toBe("UNKNOWN");
    expect(analysis.coverage.unresolvedAt.map((row) => row.key)).toEqual([
      "ONE_SCAN_BLOCKED/NO_DEFINITE_WINNER @ default[0] auto_attack",
    ]);
  });

  it("a build with no hero entry is carried as UNKNOWN, and proves nothing absent", () => {
    const analysis = analyzed(SPEC_TALENTS, []);
    expect(analysis.build.heroTree.state).toBe("UNKNOWN");
    expect(analysis.build.talentsProvenAbsent).toEqual([]);
  });

  it("the Rider's tree is read from entry membership, and decides nothing", () => {
    const rider = analyzed(RIDER, []);
    expect(rider.build.heroTree).toMatchObject({ state: "RESOLVED", simcName: "rider_of_the_apocalypse" });
    expect(rider.build.talentsProvenAbsent).toEqual([]);
    expect(analyzed(SANLAYN, []).build.heroTree).toMatchObject({ state: "RESOLVED", simcName: "sanlayn" });
  });
});

describe("the state the list reads", () => {
  it("reads Runes and Runic Power from the cast's own observation, and never zero without one", () => {
    const known = analyzed(RIDER, [{ t: 2000, ability: SCOURGE_STRIKE, rune: 4, runicPowerWire: 500 }])
      .resolved[0]?.diagnostics;
    expect(known?.rune).toEqual(knownNumber(4));
    expect(known?.runicPower).toEqual(knownNumber(50));
    expect(known?.runicPowerDeficit).toEqual(knownNumber(50));
    const absent = analyzed(RIDER, [{ t: 2000, ability: SCOURGE_STRIKE }]).resolved[0]?.diagnostics;
    expect(absent?.rune).toEqual(unknownNumber("STATE_NOT_ESTABLISHED"));
    expect(absent?.runicPower).toEqual(unknownNumber("STATE_NOT_ESTABLISHED"));
  });

  it("Runic Power at its maximum is not waste, and decides nothing past the stop", () => {
    const analysis = analyzed(RIDER, [{ t: 2000, ability: DEATH_COIL, runicPowerWire: 1000 }]);
    expect(analysis.comparisons[0]?.outcome).toBe("UNKNOWN");
    expect(analysis.resolved[0]?.diagnostics.runicPowerDeficit).toEqual(knownNumber(0));
  });

  it("the enemy count alone moves nothing: given one target, every line above still refuses", () => {
    const { result, rootScan } = queryGiven({ tree: RIDER, magnitudes: { active_enemies: 1 } });
    expect(result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    expect(rootScan.undecidedCandidates.map((candidate) => candidate.at)).toContain("cooldowns[2] outbreak");
  });

  it("the enemy count is declared and unbound, so a dispatch reading it stays open, never single target", () => {
    const { rootScan } = queryGiven({ tree: RIDER });
    expect(rootScan.dispatches.find((step) => step.at === "default[6]")).toMatchObject({
      calleeListName: "aoe",
      outcome: "BLOCKED",
      gate: "UNKNOWN_STATE",
    });
    expect(rootScan.dispatches.map((step) => step.at)).not.toContain("default[7]");
    expect(evaluate("active_enemies>=3").outcome).toBe("UNRESOLVED");
    expect(evaluate("active_enemies<3").outcome).toBe("UNRESOLVED");
  });

  it("a real fight clock and the fight's real end never answer the list: time and fight_remains stay open", () => {
    const row = (key: string) =>
      resolveUnholyDeathKnightAtoms({
        rune: unknownNumber("STATE_NOT_ESTABLISHED"),
        runicPower: unknownNumber("STATE_NOT_ESTABLISHED"),
        runicPowerDeficit: unknownNumber("STATE_NOT_ESTABLISHED"),
      }).specAtoms.bound.find((binding) => binding.key === key)?.value;
    expect(row("time")).toEqual({ kind: "MAGNITUDE", binding: unknownNumber("STATE_NOT_MODELLED") });
    expect(row("raid_event.adds.exists")).toEqual({
      kind: "MAGNITUDE",
      binding: unknownNumber("STATE_NOT_MODELLED"),
    });
    expect(evaluate("fight_remains>3").outcome).toBe("UNRESOLVED");
  });

  it("no aura is read at all, so a Sudden Doom or a Dark Transformation is never read as up or as gone", () => {
    expect(evaluate("buff.sudden_doom.react").outcome).toBe("UNRESOLVED");
    expect(evaluate("buff.dark_transformation.up").outcome).toBe("UNRESOLVED");
    expect(evaluate("dot.virulent_plague.active_dots=0").outcome).toBe("UNRESOLVED");
    expect(evaluate("cooldown.putrefy.charges<cooldown.putrefy.max_charges").outcome).toBe("UNRESOLVED");
  });

  it("Soul Reaper's target_if chooses among targets nobody identified, so it answers nothing", () => {
    const line = lineAt("single_target", 6);
    expect(line.actionStringVerbatim).toContain("soul_reaper,target_if=min:health.pct");
    const analysis = analyzed(RIDER, [{ t: 2000, ability: SOUL_REAPER, rune: 3 }]);
    expect(analysis.comparisons[0]?.outcome).toBe("UNKNOWN");
  });
});

describe("the list as pinned", () => {
  it("is 64 actions outside precombat's 12, in 8 lists, with the dispatches as pinned", () => {
    expect(artifact.lists.map((list) => [list.listName, list.actions.length])).toEqual([
      ["default", 8],
      ["precombat", 12],
      ["aoe", 10],
      ["cooldowns", 5],
      ["racials", 8],
      ["single_target", 12],
      ["trinkets", 4],
      ["variables", 5],
    ]);
    expect(authority().actions.filter((action) => action.listName !== "precombat")).toHaveLength(52);
  });

  it("every in-domain line condition but Death and Decay's in the area list parses whole, so a refusal there is about state", () => {
    const refused: string[] = [];
    for (const action of authority().actions) {
      if (action.listName === "precombat") continue;
      if (unholyDeathKnightNonDomainApplicabilityFor(action) !== null) continue;
      const raw = action.conditionRaw;
      if (raw === null) continue;
      if (!parseSimcExpression(raw, UNHOLY_DEATH_KNIGHT_ATOM_VOCABULARY).ok) {
        refused.push(`${action.listName}[${String(action.priorityOrdinal)}]`);
      }
    }
    expect(refused).toEqual(["aoe[0]"]);
  });

  it("the swing is the only class action proven off the GCD, so it holds the only contract", () => {
    const contract = unholyDeathKnightTransitionContractFor("auto_attack");
    expect(contract?.baseGcdMs).toBe(0);
    expect(unholyDeathKnightTransitionContractFor("dark_transformation")).toBeNull();
    for (const token of [
      "army_of_the_dead",
      "death_and_decay",
      "death_coil",
      "epidemic",
      "festering_strike",
      "outbreak",
      "putrefy",
      "scourge_strike",
      "soul_reaper",
    ]) {
      expect(unholyDeathKnightExecutionLaneForToken(token)).toBe("GCD_CONSUMING");
    }
  });
});

describe("the talents", () => {
  it("a lone-node talent absent from the tree stays UNKNOWN, never false: the retained build's Cycle of Death", () => {
    expect(resolveUnholyDeathKnightTalent(RIDER, "cycle_of_death").selection).toBe("UNKNOWN");
    expect(resolveUnholyDeathKnightTalent(RIDER, "soul_reaper").selection).toBe("SELECTED");
    expect(resolveUnholyDeathKnightTalent([], "soul_reaper").selection).toBe("UNKNOWN");
  });

  it("an action built on a talent proven absent is background; an unresolved one never is", () => {
    const applicabilityOf = (token: string, talents: Record<string, never>, absent: readonly string[]) =>
      resolveUnholyDeathKnightApplicability({ talents, talentsProvenAbsent: new Set(absent) }, {
        ...lineAt("single_target", 11),
        actionToken: token,
      } as AplAction).kind;
    for (const [token, talent] of Object.entries(TALENT_BUILT_TOKENS)) {
      expect(applicabilityOf(token, {}, [talent])).toBe("NOT_APPLICABLE");
      expect(applicabilityOf(token, {}, [])).toBe("UNKNOWN");
    }
  });

  it("the baseline spells have no talent guard", () => {
    for (const token of ["death_coil", "death_and_decay", "epidemic", "festering_strike"]) {
      expect(TALENT_BUILT_TOKENS[token]).toBeUndefined();
      expect(
        resolveUnholyDeathKnightApplicability({ talents: {}, talentsProvenAbsent: new Set() }, {
          ...lineAt("single_target", 11),
          actionToken: token,
        } as AplAction).kind,
      ).toBe("APPLICABLE");
    }
  });

  it("the hero trees are the two this specialization has, and Deathbringer is neither", () => {
    expect(unholyTalents.heroTrees.map((tree) => tree.simcName)).toEqual([
      "sanlayn",
      "rider_of_the_apocalypse",
    ]);
    expect(
      resolveUnholyDeathKnightHeroTree([heroEntry("sanlayn"), heroEntry("rider_of_the_apocalypse")]).state,
    ).toBe("CONTRADICTORY");
  });
});

describe("the domain boundary", () => {
  it("every line of the racial list, Arcane Pulse included, cannot preempt a class action", () => {
    const lookup = authority().actionsInList("racials");
    if (!lookup.found) throw new Error("no racials");
    expect(lookup.actions).toHaveLength(8);
    for (const action of lookup.actions) {
      expect(unholyDeathKnightNonDomainApplicabilityFor(action)).toMatchObject({
        kind: "NOT_APPLICABLE",
        reason: "OUTSIDE_SUPPORTED_DECISION_DOMAIN",
      });
    }
    // The one the shared table does not list. Classified here, so a racial never decides or blocks.
    expect(nonDomainCategoryOf("arcane_pulse")).toBeNull();
  });

  it("the racial list always returns nothing, whatever the resources read", () => {
    const { rootScan } = queryGiven({ tree: RIDER });
    expect(rootScan.dispatches.find((step) => step.at === "default[2]")).toMatchObject({
      calleeListName: "racials",
      outcome: "CALL_RETURNED_NO_ACTION_CONTINUE",
    });
  });

  it("the potion, the items and the external buff cannot preempt a class action, and no class action is classified outside the domain", () => {
    expect(unholyDeathKnightNonDomainApplicabilityFor(lineAt("cooldowns", 0))).not.toBeNull();
    expect(unholyDeathKnightNonDomainApplicabilityFor(lineAt("cooldowns", 1))).not.toBeNull();
    expect(unholyDeathKnightNonDomainApplicabilityFor(lineAt("trinkets", 0))).not.toBeNull();
    expect(unholyDeathKnightNonDomainApplicabilityFor(lineAt("cooldowns", 2))).toBeNull();
    expect(unholyDeathKnightNonDomainApplicabilityFor(lineAt("single_target", 11))).toBeNull();
  });
});

describe("the pinned data", () => {
  it("all datasets load", () => {
    expect(pinnedUnholyDeathKnightGcdSemantics().ok).toBe(true);
    expect(pinnedUnholyDeathKnightTalents().ok).toBe(true);
    expect(pinnedUnholyDeathKnightAuthority().ok).toBe(true);
  });

  it("the lanes are the pinned records'", () => {
    for (const id of [
      SCOURGE_STRIKE,
      VAMPIRIC_STRIKE,
      DEATH_COIL,
      NECROTIC_COIL,
      EPIDEMIC,
      GRAVEYARD,
      FESTERING_STRIKE,
      FESTERING_SCYTHE,
      OUTBREAK,
      PUTREFY,
      BLIGHTFALL,
      ARMY_OF_THE_DEAD,
      SOUL_REAPER,
      DEATH_AND_DECAY,
    ]) {
      expect(unholyDeathKnightBaseGcdMsForAbility(id)).toBe(1500);
      expect(unholyDeathKnightExecutionLaneForAbility(id)).toBe("GCD_CONSUMING");
    }
  });

  it("a press off the list has no token, and its lane is a refusal, never a guess", () => {
    expect(unholyDeathKnightTokenBinding("raise_dead").kind).not.toBe("KNOWN_ONE");
    for (const id of [444347, 49039, 48707, 46584]) {
      expect(unholyDeathKnightTokenByAbilityId().get(id)).toBeUndefined();
      expect(unholyDeathKnightBaseGcdMsForAbility(id)).toBeNull();
    }
  });
});
