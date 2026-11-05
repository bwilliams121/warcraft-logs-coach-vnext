/**
 * ONB-X4: Demonology Warlock, its own representative and the first consumer of the shared pet mapping (ONB-S6).
 *
 * No decision resolves on real evidence, so the mandatory negatives are the centre of it: a decision whose moment is not
 * established is never judged, a possibly-instant cast is never anchored at a begin, a begin alone is never a decision, an
 * open enemy count never reads as single target, a missing talent never reads as false, an unknown pet never reads as absent,
 * an unknown imp count never reads as zero, a summon is never a setup verdict, and a later event never changes an earlier answer.
 *
 * Synthetic on purpose. The authority views here answer with a single line, because only a test can get past the list's
 * real stopping point: they show what the anchor and the pet readings do when a scan finally resolves.
 */

import { describe, expect, it } from "vitest";

import demonologyTalents from "../../../src/data/game/warlock-demonology-talents.json";
import artifact from "../../../src/simc/data/warlock-demonology.apl.json";
import {
  DEMONOLOGY_CAST_ROWS,
  demonologyCastRowFor,
} from "../../../src/data/game/warlock-demonology-cast-semantics.js";
import {
  demonologyBaseGcdMsForAbility,
  demonologyExecutionLaneForAbility,
  demonologyExecutionLaneForToken,
  demonologyTokenBinding,
  demonologyTokenByAbilityId,
  pinnedDemonologyWarlockGcdSemantics,
} from "../../../src/data/game/warlock-demonology-gcd-semantics.js";
import { DEMONOLOGY_PET_ROWS } from "../../../src/data/game/warlock-demonology-pet-semantics.js";
import {
  pinnedDemonologyWarlockTalents,
  resolveDemonologyHeroTree,
  resolveDemonologyTalent,
} from "../../../src/data/game/warlock-demonology-talents.js";
import { demonologyTransitionContractFor } from "../../../src/data/game/warlock-demonology-transition-authority.js";
import { buildCastTimeline } from "../../../src/engine/game-state/casting/cast-decision-anchor.js";
import type { CombatActor } from "../../../src/engine/normalization/actors.js";
import type { CombatEvent } from "../../../src/engine/normalization/normalized-events.js";
import { createCombatState } from "../../../src/engine/state/combat-state.js";
import type { AnalyzerRegistration } from "../../../src/findings/analyzer-registration.js";
import type { AuthorityAccess } from "../../../src/findings/authority-domain.js";
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
  resolveDemonologyApplicability,
  resolveDemonologyUsability,
  TALENT_BUILT_TOKENS,
} from "../../../src/specs/warlock/demonology/action-profile.js";
import {
  DEMONOLOGY_CAPABILITIES,
  standaloneDemonologyAuthorityAccess,
} from "../../../src/specs/warlock/demonology/authority-bindings.js";
import { demonologyCastAnchorProfile } from "../../../src/specs/warlock/demonology/cast-anchor-profile.js";
import { demonologyNonDomainApplicabilityFor } from "../../../src/specs/warlock/demonology/domain-boundary.js";
import { demonologyFirstGcdSelectionAt } from "../../../src/specs/warlock/demonology/first-gcd-adapter.js";
import { initialDemonologyState } from "../../../src/specs/warlock/demonology/first-gcd-state.js";
import { analyzeObservedDemonologyWarlockDecisions } from "../../../src/specs/warlock/demonology/observed-analysis.js";
import {
  demonologyPetBindingsOf,
  demonologyPetProfile,
  demonologyPetReadingAt,
  demonologyPetReadingKeys,
  demonologyPetStateOf,
} from "../../../src/specs/warlock/demonology/pet-profile.js";
import { pinnedDemonologyWarlockAuthority } from "../../../src/specs/warlock/demonology/pinned-authority.js";
import {
  demonologyTalentsDisprovedByHeroTree,
  resolveDemonologyAtoms,
} from "../../../src/specs/warlock/demonology/resolver.js";
import { DEMONOLOGY_ATOM_VOCABULARY } from "../../../src/specs/warlock/demonology/vocabulary.js";
import {
  attachedResources,
  castEvent,
  classResource,
  FIGHT_START_MS,
  summonEvent,
  syntheticFight,
} from "../../support/synthetic-fight.js";

const SOURCE = 7;
const BOSS = 900;

const TYRANT = 265187;
const DEMONBOLT = 264178;
const SHADOW_BOLT = 686;
const HAND_OF_GULDAN = 105174;
const CALL_DREADSTALKERS = 104316;
const IMPLOSION = 196277;
const IMP_LORD = 1276452;
const UNREVIEWED = 111400;

type Entry = { readonly id: number; readonly nodeId: number };

function entries(names: readonly string[]): readonly Entry[] {
  return names.map((name) => {
    const row = demonologyTalents.talents.find((candidate) => candidate.simcName === name);
    if (row === undefined) throw new Error(`no pinned talent ${name}`);
    return { id: row.traitEntryId, nodeId: row.traitNodeId };
  });
}

/** The shape all seven retained subjects share. */
const DIABOLIST = entries([
  "call_dreadstalkers",
  "demoniac",
  "grimoire_imp_lord",
  "hand_of_guldan",
  "implosion",
  "reign_of_tyranny",
  "summon_demonic_tyrant",
  "to_hell_and_back",
  "diabolic_ritual",
  "ruination",
  "secrets_of_the_coven",
]);
const SOUL_HARVESTER = entries([
  "call_dreadstalkers",
  "demoniac",
  "grimoire_imp_lord",
  "hand_of_guldan",
  "implosion",
  "summon_demonic_tyrant",
  "demonic_soul",
]);

function authority(): AplAuthority {
  const loaded = pinnedDemonologyWarlockAuthority();
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

/** Offensive access whose `default` is exactly this one line: what only a test can reach. */
function accessAnswering(line: AplAction): AuthorityAccess {
  const pinned = authority();
  const standalone = standaloneDemonologyAuthorityAccess();
  const view: AplAuthority = {
    artifact: pinned.artifact,
    actions: pinned.actions,
    listsContainingAction: (token) => pinned.listsContainingAction(token),
    actionsInList: (name) =>
      name === "default" ? { found: true, actions: [line] } : pinned.actionsInList(name),
    proveSoleGateTo: (token) => pinned.proveSoleGateTo(token),
  } as AplAuthority;
  return {
    forDomain: (domain) =>
      domain === "OFFENSIVE_ROTATION"
        ? { outcome: "AUTHORITY_AVAILABLE", authority: view }
        : standalone.forDomain(domain),
  } as AuthorityAccess;
}

/** The token's line, with its condition and options removed: unconditional, so a press of it is the definite winner. */
function unconditional(token: string): AplAction {
  const pinned = authority().actions.find(
    (action) => action.actionToken === token && action.listName !== "precombat",
  );
  if (pinned === undefined) throw new Error(`no line for ${token}`);
  return {
    ...pinned,
    listName: "default",
    conditionRaw: null,
    actionStringVerbatim: token,
    unsupportedOptions: [],
    targetIf: null,
  } as unknown as AplAction;
}

interface Facts {
  readonly talents: Record<string, ReturnType<typeof resolveDemonologyTalent>>;
  readonly talentsProvenAbsent: Set<string>;
  readonly heroTree: ReturnType<typeof resolveDemonologyHeroTree>;
}

/** The build facts, with every modelled talent the test names proven absent (only a test may). */
function factsOf(tree: readonly Entry[], absent: readonly string[] = []): Facts {
  const talents = Object.fromEntries(
    demonologyTalents.talents.map((talent) => [
      talent.simcName,
      resolveDemonologyTalent(tree, talent.simcName),
    ]),
  );
  const heroTree = resolveDemonologyHeroTree(tree);
  const talentsProvenAbsent = new Set<string>(demonologyTalentsDisprovedByHeroTree(heroTree));
  for (const [name, talent] of Object.entries(talents)) {
    if (talent.selection === "NOT_SELECTED") talentsProvenAbsent.add(name);
  }
  for (const name of absent) {
    talentsProvenAbsent.add(name);
    delete talents[name];
  }
  return { talents, talentsProvenAbsent, heroTree };
}

function bindingsOf(facts: Facts, known: Readonly<Record<string, number>> = {}): AtomBindings {
  const resolution = resolveDemonologyAtoms({
    heroTree: facts.heroTree,
    talents: facts.talents,
    talentsProvenAbsent: facts.talentsProvenAbsent,
  });
  const knownTalents = Object.entries(facts.talents).flatMap(([name, talent]) =>
    talent.selection === "SELECTED" ? [{ name, taken: true }] : [],
  );
  for (const name of facts.talentsProvenAbsent) knownTalents.push({ name, taken: false });
  const bound = resolution.specAtoms.bound.map((binding) => {
    const value = known[binding.key];
    return value === undefined
      ? binding
      : { ...binding, value: { kind: "MAGNITUDE" as const, binding: knownNumber(value) } };
  });
  return {
    comboPoints: unknownNumber("STATE_NOT_MODELLED"),
    comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
    energyPct: unknownNumber("STATE_NOT_MODELLED"),
    knownBuffs: [],
    knownTalents,
    knownCooldownRemainsSeconds: [],
    specAtoms: { ...resolution.specAtoms, bound },
  };
}

interface Step {
  readonly t: number;
  readonly ability: number;
  readonly phase?: "BEGIN" | "COMPLETE";
  readonly power?: number;
}

interface Summon {
  readonly t: number;
  readonly actor: number;
  readonly instance: number;
}

const IMP_ACTOR = 50;
const SECOND_IMP_ACTOR = 51;
const TYRANT_ACTOR = 52;
const STALKER_ACTOR = 53;
const OTHER_WARLOCK = 8;
const OTHER_IMP_ACTOR = 60;
const UNSTATED_IMP_ACTOR = 70;
const UNSTATED_TYRANT_ACTOR = 71;

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

/** Every pet's owner stated, as the retained fights do NOT give it. */
const STATED_ACTORS: readonly CombatActor[] = [
  actor(SOURCE, { actorType: "PLAYER", rawType: "Player", subType: "Warlock" }),
  actor(OTHER_WARLOCK, { actorType: "PLAYER", rawType: "Player", subType: "Warlock" }),
  actor(IMP_ACTOR, { gameId: 55659, petOwnerActorId: SOURCE }),
  actor(SECOND_IMP_ACTOR, { gameId: 143622, petOwnerActorId: SOURCE }),
  actor(TYRANT_ACTOR, { gameId: 250289, petOwnerActorId: SOURCE }),
  actor(STALKER_ACTOR, { gameId: 98035, petOwnerActorId: SOURCE }),
  actor(OTHER_IMP_ACTOR, { gameId: 55659, petOwnerActorId: OTHER_WARLOCK }),
];

/** The shape every retained fight has: a catalog pet of each mapped gameID with no stated owner. */
const RETAINED_SHAPE_ACTORS: readonly CombatActor[] = [
  ...STATED_ACTORS,
  actor(UNSTATED_IMP_ACTOR, { gameId: 55659 }),
  actor(UNSTATED_TYRANT_ACTOR, { gameId: 250289 }),
];

const LONG_FIGHT_MS = 120_000;

interface FightOptions {
  readonly casts?: "COMPLETE" | "UNVERIFIED";
  readonly summonCoverage?: boolean;
  readonly summons?: readonly Summon[];
  readonly actors?: readonly CombatActor[];
  readonly authority?: AuthorityAccess;
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
      make: (ordinal: number) =>
        castEvent({
          ordinal,
          reportTimeMs: FIGHT_START_MS + step.t,
          sourceActorId: SOURCE,
          targetActorId: BOSS,
          abilityGameId: step.ability,
          castPhase: step.phase ?? "COMPLETE",
          attachedResources:
            step.power === undefined
              ? null
              : attachedResources({
                  side: "SOURCE",
                  actorId: SOURCE,
                  classResources: [classResource(7, step.power, { max: 50, cost: 0 })],
                }),
        }),
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
  const observedCategories = [
    ...(options.casts === "UNVERIFIED" ? [] : (["CASTS"] as const)),
    ...(options.summonCoverage === false ? [] : (["SUMMONS"] as const)),
  ];
  const actors = options.actors;
  return createCombatState(
    syntheticFight({
      events,
      observedCategories,
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
  return analyzeObservedDemonologyWarlockDecisions({
    state: fightWith(tree, steps, options),
    actorId: SOURCE,
    specId: "warlock/demonology",
    targetActorId: null,
    ...(options.authority === undefined ? {} : { authority: options.authority }),
  });
}

function analyzed(tree: readonly Entry[] | null, steps: readonly Step[], options: FightOptions = {}) {
  const analysis = analyze(tree, steps, options);
  if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
  return analysis;
}

/** A first cast in the fight, whose window opens before the pull, so the next ones are the ones under test. */
const FIRST_INSTANT: Step = { t: 100, ability: IMPLOSION };

const completion = (abilityGameId: number) => ({
  position: 0,
  locator: {} as never,
  abilityGameId,
  reportTimeMs: 0,
  fightTimeMs: 0,
});

describe("the row", () => {
  it("is reachable by the internal lookup only, and a public identity is refused", () => {
    const row = internalAnalyzerForSpec("warlock/demonology", PRODUCTION_CATALOG) as AnalyzerRegistration;
    expect(row.analyzerId).toBe("warlock-demonology-observed-decisions");
    expect(row.exposure).toBe("INTERNAL_ONLY");
    expect(analyzerForSpec("warlock/demonology", PRODUCTION_CATALOG)).toBeNull();
    expect(resolveSpecIdentity({ className: "Warlock", specName: "Demonology" }).ok).toBe(false);
  });

  it("refuses another specialization before reading anything of its own", () => {
    expect(
      analyzeObservedDemonologyWarlockDecisions({
        state: fightWith(null, []),
        actorId: SOURCE,
        specId: "warlock/destruction" as never,
        targetActorId: null,
      }).status,
    ).toBe("SPEC_NOT_SUPPORTED");
  });

  it("a capture with no combatant info refuses as PROFILE_NOT_RESOLVED, never judges", () => {
    expect(analyze(null, [{ t: 2000, ability: IMPLOSION }]).status).toBe("PROFILE_NOT_RESOLVED");
  });

  it("declares offensive authority only, and reports every other domain without it", () => {
    const analysis = analyzed(DIABOLIST, []);
    const byDomain = new Map(analysis.domains.map((result) => [result.domain, result.resolution]));
    expect(byDomain.get("OFFENSIVE_ROTATION")).toBe("AUTHORITY_AVAILABLE");
    expect(byDomain.get("INTERRUPT")).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
    expect(byDomain.get("DEFENSIVE_COOLDOWN")).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
    expect(byDomain.get("RESOURCE_SPENDING")).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
  });

  it("declares the summons its pet readings consume, so a request deriving its ingestion cannot under-fetch them", () => {
    const offensive = DEMONOLOGY_CAPABILITIES.find((row) => row.domain === "OFFENSIVE_ROTATION");
    expect(offensive?.requirements.resources).toEqual([]);
    expect(offensive?.requirements.evidenceCategories).toEqual(["CASTS", "COMBATANT_INFO", "SUMMONS"]);
  });
});

describe("the anchor is when the decision was made", () => {
  it("Summon Demonic Tyrant is decided at its begin: the decision's times are the begin's, its identity the completion's", () => {
    const analysis = analyzed(DIABOLIST, [
      FIRST_INSTANT,
      { t: 2000, ability: TYRANT, phase: "BEGIN" },
      { t: 3000, ability: TYRANT },
    ]);
    const comparison = analysis.comparisons[1];
    expect(comparison?.decision.observedToken).toBe("summon_demonic_tyrant");
    expect(analysis.resolved[1]?.anchor).toMatchObject({
      state: "ESTABLISHED",
      source: "OBSERVED_BEGINCAST",
    });
    expect(comparison?.decision.reportTimeMs).toBe(FIGHT_START_MS + 2000);
    expect(comparison?.decision.fightTimeMs).toBe(2000);
    expect(comparison?.decision.locator.rawType).toBe("cast");
  });

  it("an instant is decided when it lands", () => {
    const analysis = analyzed(DIABOLIST, [FIRST_INSTANT, { t: 2000, ability: IMP_LORD }]);
    expect(analysis.resolved[1]?.anchor).toMatchObject({
      state: "ESTABLISHED",
      source: "INSTANT_COMPLETION",
    });
    expect(analysis.comparisons[1]?.decision.fightTimeMs).toBe(2000);
  });

  it("a begin that never completes is no decision, and no missed action is built on it", () => {
    const analysis = analyzed(DIABOLIST, [FIRST_INSTANT, { t: 2000, ability: TYRANT, phase: "BEGIN" }]);
    expect(analysis.comparisons).toHaveLength(1);
    expect(analysis.excluded).toHaveLength(0);
    expect(analysis.coverage.eligibleDecisions).toBe(1);
  });

  it("the coverage counts each decision's anchor, and the three outcomes still partition them", () => {
    const { coverage } = analyzed(DIABOLIST, [
      FIRST_INSTANT,
      { t: 2000, ability: TYRANT, phase: "BEGIN" },
      { t: 3000, ability: TYRANT },
      { t: 4000, ability: TYRANT },
    ]);
    expect(coverage.anchors).toEqual([
      { key: "INSTANT_COMPLETION", count: 1 },
      { key: "OBSERVED_BEGINCAST", count: 1 },
      { key: "BEGINCAST_NOT_OBSERVED", count: 1 },
    ]);
    expect(coverage.match + coverage.rejected + coverage.unknown).toBe(coverage.eligibleDecisions);
  });
});

describe("no moment, no verdict", () => {
  const ONLY_TYRANT = () => accessAnswering(unconditional("summon_demonic_tyrant"));

  it("the same press MATCHes when its begin is observed: the authority view does resolve", () => {
    const analysis = analyzed(
      DIABOLIST,
      [
        { t: 2000, ability: TYRANT, phase: "BEGIN" },
        { t: 3000, ability: TYRANT },
      ],
      { authority: ONLY_TYRANT() },
    );
    expect(analysis.comparisons[0]?.outcome).toBe("MATCH");
    expect(analysis.resolved[0]?.anchor).toMatchObject({ state: "ESTABLISHED" });
  });

  it("with complete cast coverage and no begin, it is UNKNOWN, never inferred instant, and never a MATCH", () => {
    const analysis = analyzed(
      DIABOLIST,
      [
        { t: 1000, ability: TYRANT, phase: "BEGIN" },
        { t: 2000, ability: TYRANT },
        { t: 3000, ability: TYRANT },
      ],
      { authority: ONLY_TYRANT() },
    );
    const comparison = analysis.comparisons[1];
    expect(analysis.resolved[1]?.anchor).toMatchObject({
      state: "UNKNOWN",
      reason: "BEGINCAST_NOT_OBSERVED",
    });
    expect(comparison?.outcome).toBe("UNKNOWN");
    expect(comparison?.rawBlocker).toBe("DECISION_ANCHOR_NOT_ESTABLISHED");
    expect(comparison?.decisiveBlocker).toBe("OBSERVED_STATE_MISSING");
    expect(comparison?.decision.fightTimeMs).toBe(3000);
  });

  it("with no cast coverage it is UNKNOWN on the coverage reason: a missing page is never an instant cast", () => {
    const analysis = analyzed(DIABOLIST, [FIRST_INSTANT, { t: 3000, ability: TYRANT }], {
      authority: ONLY_TYRANT(),
      casts: "UNVERIFIED",
    });
    expect(analysis.resolved[1]?.anchor).toMatchObject({ state: "UNKNOWN", reason: "CAST_TIME_UNKNOWN" });
    expect(analysis.comparisons[1]?.outcome).toBe("UNKNOWN");
  });

  it("the first hard cast of a fight may have begun before the pull: UNKNOWN, with the scan's answer ignored", () => {
    const analysis = analyzed(DIABOLIST, [{ t: 97, ability: TYRANT }], { authority: ONLY_TYRANT() });
    expect(analysis.resolved[0]?.anchor).toMatchObject({ state: "UNKNOWN", reason: "CAST_TIME_UNKNOWN" });
    expect(analysis.comparisons[0]?.outcome).toBe("UNKNOWN");
  });

  it.each([
    ["shadow_bolt", SHADOW_BOLT],
    ["hand_of_guldan", HAND_OF_GULDAN],
    ["demonbolt", DEMONBOLT],
    ["ruination", 434635],
    ["infernal_bolt", 434506],
    ["call_dreadstalkers", CALL_DREADSTALKERS],
  ] as const)(
    "%s may have been instant, so a begin before it proves no moment: never established, and never a MATCH",
    (token, ability) => {
      const analysis = analyzed(
        DIABOLIST,
        [
          { t: 2000, ability, phase: "BEGIN" },
          { t: 3000, ability },
        ],
        { authority: accessAnswering(unconditional(token)) },
      );
      expect(analysis.resolved[0]?.anchor).toMatchObject({
        state: "UNKNOWN",
        reason: "BEGINCAST_PAIRING_AMBIGUOUS",
        candidateReportTimesMs: [FIGHT_START_MS + 2000, FIGHT_START_MS + 3000],
      });
      expect(analysis.comparisons[0]?.outcome).toBe("UNKNOWN");
      expect(analysis.comparisons[0]?.rawBlocker).toBe("DECISION_ANCHOR_NOT_ESTABLISHED");
    },
  );

  it("the query's own stopping point stays attached to an anchor refusal", () => {
    const analysis = analyzed(DIABOLIST, [FIRST_INSTANT, { t: 3000, ability: TYRANT }]);
    const selection = analysis.resolved[1]?.selection;
    expect(selection?.detail).toContain("CAST_TIME_UNKNOWN");
    expect(selection?.blockedAt).toBeNull();
    expect(selection?.stoppingPoint).not.toBeNull();
  });

  it("a begin of an instant contradicts the review: UNKNOWN, never a guess at which is wrong", () => {
    const analysis = analyzed(DIABOLIST, [
      { t: 2000, ability: IMPLOSION, phase: "BEGIN" },
      { t: 3000, ability: IMPLOSION },
    ]);
    expect(analysis.resolved[0]?.anchor).toMatchObject({
      state: "UNKNOWN",
      reason: "CAST_EVIDENCE_CONFLICT",
    });
    expect(analysis.comparisons[0]?.outcome).toBe("UNKNOWN");
  });
});

describe("what the profile proves about a cast", () => {
  const timelineOf = (steps: readonly Step[]) =>
    buildCastTimeline({
      state: fightWith(DIABOLIST, steps),
      actorId: SOURCE,
      profile: demonologyCastAnchorProfile(),
    });

  /** Two back to back, with the second begin in the first completion's own millisecond. */
  const BACK_TO_BACK = (ability: number): readonly Step[] => [
    FIRST_INSTANT,
    { t: 2000, ability, phase: "BEGIN" },
    { t: 3000, ability },
    { t: 3000, ability, phase: "BEGIN" },
    { t: 4000, ability },
  ];

  it("Summon Demonic Tyrant has no -100% row, so back-to-back casts are established", () => {
    const anchors = timelineOf(BACK_TO_BACK(TYRANT)).anchors.map((anchor) => anchor.anchor);
    expect(anchors[1]).toMatchObject({ state: "ESTABLISHED", reportTimeMs: FIGHT_START_MS + 2000 });
    expect(anchors[2]).toMatchObject({ state: "ESTABLISHED", reportTimeMs: FIGHT_START_MS + 3000 });
    expect(demonologyCastAnchorProfile().castTimeAt(completion(TYRANT)).kind).toBe("POSITIVE");
  });

  it.each([
    ["shadow_bolt", SHADOW_BOLT],
    ["hand_of_guldan", HAND_OF_GULDAN],
    ["demonbolt", DEMONBOLT],
    ["ruination", 434635],
    ["infernal_bolt", 434506],
  ] as const)(
    "%s has an unexcluded -100%% row: the same shape is ambiguous, never picked",
    (_token, ability) => {
      const anchors = timelineOf(BACK_TO_BACK(ability)).anchors.map((anchor) => anchor.anchor);
      expect(anchors[2]).toMatchObject({ state: "UNKNOWN", reason: "BEGINCAST_PAIRING_AMBIGUOUS" });
      expect(demonologyCastAnchorProfile().castTimeAt(completion(ability))).toEqual({
        kind: "UNKNOWN",
        reason: "INSTANT_ROW_NOT_EXCLUDED",
      });
    },
  );

  it("Call Dreadstalkers has no such row, but its positive base is not claimed: no retained press shows a gap", () => {
    expect(demonologyCastRowFor(CALL_DREADSTALKERS)).toMatchObject({
      baseCastMs: 2000,
      rule: "WIRE_CONTRADICTS_POSITIVE_BASE",
    });
    expect(demonologyCastAnchorProfile().castTimeAt(completion(CALL_DREADSTALKERS))).toEqual({
      kind: "UNKNOWN",
      reason: "WIRE_CONTRADICTS_POSITIVE_BASE",
    });
  });

  it.each([
    ["with its begin in its own millisecond", [{ t: 2000, ability: DEMONBOLT, phase: "BEGIN" as const }]],
    ["with no begin at all, as one retained subject logs it", []],
  ])("a Demonbolt %s is never given a moment on the way to a verdict", (_name, begin) => {
    const analysis = analyzed(DIABOLIST, [FIRST_INSTANT, ...begin, { t: 2000, ability: DEMONBOLT }], {
      authority: accessAnswering(unconditional("demonbolt")),
    });
    expect(analysis.resolved[1]?.anchor.state).toBe("UNKNOWN");
    expect(analysis.comparisons[1]?.outcome).toBe("UNKNOWN");
  });

  it("no build narrows it: every build's possibly-instant cast is refused alike", () => {
    for (const tree of [DIABOLIST, SOUL_HARVESTER, [] as readonly Entry[]]) {
      const analysis = analyzed(tree, [
        { t: 2000, ability: SHADOW_BOLT, phase: "BEGIN" },
        { t: 3000, ability: SHADOW_BOLT },
      ]);
      expect(analysis.resolved[0]?.anchor).toMatchObject({ state: "UNKNOWN" });
    }
  });

  it("no cast time is ever exact, so no anchor is ever derived from a completion", () => {
    const profile = demonologyCastAnchorProfile();
    for (const row of DEMONOLOGY_CAST_ROWS) {
      if (row.baseCastMs === 0) continue;
      const fact = profile.castTimeAt(completion(row.abilityGameId));
      if (fact.kind === "POSITIVE") expect(fact.exactMs, row.simcToken).toBeNull();
      else expect(fact.kind, row.simcToken).toBe("UNKNOWN");
    }
  });

  it("leaves everything off the list unreviewed, and reviews no channel, because the list presses none", () => {
    const profile = demonologyCastAnchorProfile();
    expect(profile.executionOf(TYRANT)).toBe("CAST_TIME");
    expect(profile.executionOf(IMPLOSION)).toBe("INSTANT");
    expect(profile.executionOf(UNREVIEWED)).toBeNull();
    expect(DEMONOLOGY_CAST_ROWS.some((row) => profile.executionOf(row.abilityGameId) === "CHANNEL")).toBe(
      false,
    );
  });

  it("nothing inside a hard cast reads as idle", () => {
    const timeline = timelineOf([
      FIRST_INSTANT,
      { t: 2000, ability: TYRANT, phase: "BEGIN" },
      { t: 3000, ability: TYRANT },
    ]);
    expect(timeline.occupancyAt(FIGHT_START_MS + 2500).state).toBe("CASTING");
  });
});

describe("the pets, as the pinned data states them", () => {
  it("the reviewed rows claim no floor, and a ceiling only for the imps", () => {
    expect(DEMONOLOGY_PET_ROWS.map((row) => [row.simcName, row.minLifetimeMs, row.maxLifetimeMs])).toEqual([
      ["demonic_tyrant", null, null],
      ["wild_imps", null, 40000],
    ]);
    expect(demonologyPetProfile().ownerSpecId).toBe("warlock/demonology");
  });

  it("both Wild Imp summons are one entity, and another warlock's imps are not this owner's", () => {
    const pets = demonologyPetStateOf(
      fightWith(DIABOLIST, [], {
        actors: STATED_ACTORS,
        summons: [
          { t: 500, actor: IMP_ACTOR, instance: 1 },
          { t: 600, actor: SECOND_IMP_ACTOR, instance: 1 },
        ],
      }),
      SOURCE,
    );
    expect(pets.mappingOf("wild_imps")).toMatchObject({
      status: "MAPPED",
      actorIds: [IMP_ACTOR, SECOND_IMP_ACTOR],
    });
  });

  it("a Dreadstalker the list never reads is disclosed as unclassified, never assigned to an entity", () => {
    const pets = demonologyPetStateOf(fightWith(DIABOLIST, [], { actors: STATED_ACTORS }), SOURCE);
    expect(pets.unclassifiedOwnedActorIds).toEqual([STALKER_ACTOR]);
  });
});

describe("the Demonic Tyrant", () => {
  const AFTER_SUMMON = FIGHT_START_MS + 50_000;
  const readingOf = (options: FightOptions, t = AFTER_SUMMON) =>
    demonologyPetReadingAt(
      demonologyPetStateOf(fightWith(DIABOLIST, [], { actors: STATED_ACTORS, ...options }), SOURCE),
      t,
    );

  it("a summon proves no presence, because no floor is pinned: never true by default", () => {
    const reading = readingOf({ summons: [{ t: 49_000, actor: TYRANT_ACTOR, instance: 1 }] });
    expect(reading.demonicTyrant).toEqual({ state: "UNKNOWN", reason: "LIFETIME_BOUND_NOT_PINNED" });
  });

  it("no summon proves no absence, because no ceiling is pinned: never false by default", () => {
    expect(readingOf({}).demonicTyrant).toEqual({ state: "UNKNOWN", reason: "LIFETIME_BOUND_NOT_PINNED" });
  });

  it("an undecided presence binds no atom, so the truth is enumerated, and a condition reading it stays open", () => {
    const reading = readingOf({ summons: [{ t: 49_000, actor: TYRANT_ACTOR, instance: 1 }] });
    expect(demonologyPetBindingsOf(reading).specAtoms).toEqual([]);
    const condition = "pet.demonic_tyrant.active";
    const parsed = parseSimcExpression(condition, DEMONOLOGY_ATOM_VOCABULARY);
    if (!parsed.ok) throw new Error(parsed.fragment);
    expect(evaluateSimcExpression(parsed.ast, condition, bindingsOf(factsOf(DIABOLIST))).outcome).toBe(
      "UNRESOLVED",
    );
  });

  it.each([
    ["PRESENT", { state: "PRESENT", locators: [] }, true],
    ["NOT_PRESENT", { state: "NOT_PRESENT" }, false],
  ] as const)(
    "the atom reads a decided answer as it stands, for the day a reviewed bound makes one: %s",
    (_name, demonicTyrant, value) => {
      const { specAtoms } = demonologyPetBindingsOf({
        reportTimeMs: AFTER_SUMMON,
        demonicTyrant,
        wildImps: { kind: "UNKNOWN", reason: "OUTSIDE_FIGHT" },
      });
      expect(specAtoms).toEqual([
        { key: "pet.demonic_tyrant.active", actionToken: null, value: { kind: "TRUTH", value } },
      ]);
    },
  );

  it("a press of Summon Demonic Tyrant is observed, never scored as a setup: tyrant-setup stays a recorded question", () => {
    const analysis = analyzed(
      DIABOLIST,
      [FIRST_INSTANT, { t: 49_000, ability: TYRANT, phase: "BEGIN" }, { t: 50_000, ability: TYRANT }],
      { actors: STATED_ACTORS, summons: [{ t: 50_000, actor: TYRANT_ACTOR, instance: 1 }] },
    );
    expect(analysis.coverage.match).toBe(0);
    expect(analysis.coverage.rejected).toBe(0);
    expect(analysis.comparisons[1]?.outcome).toBe("UNKNOWN");
  });
});

describe("the Wild Imp count", () => {
  const T = 50_000;
  const AT = FIGHT_START_MS + T;
  const impsIn = (count: number, base = 45_000): readonly Summon[] =>
    Array.from({ length: count }, (_, index) => ({
      t: base + index,
      actor: IMP_ACTOR,
      instance: index + 1,
    }));
  const readingOf = (options: FightOptions, t = AT) =>
    demonologyPetReadingAt(
      demonologyPetStateOf(fightWith(DIABOLIST, [], { actors: STATED_ACTORS, ...options }), SOURCE),
      t,
    );
  const STACK_AT_LEAST_SIX = "buff.wild_imps.stack>=6";
  const outcomeOf = (reading: ReturnType<typeof readingOf>) => {
    const parsed = parseSimcExpression(STACK_AT_LEAST_SIX, DEMONOLOGY_ATOM_VOCABULARY);
    if (!parsed.ok) throw new Error(parsed.fragment);
    const bindings = {
      ...bindingsOf(factsOf(DIABOLIST)),
      knownBuffStacks: demonologyPetBindingsOf(reading).knownBuffStacks,
    };
    const result = evaluateSimcExpression(parsed.ast, STACK_AT_LEAST_SIX, bindings);
    return result.outcome === "RESOLVED" ? (result.value ? "TRUE" : "FALSE") : result.outcome;
  };

  it("no summon of an imp in the longest life, with every condition met, is an exact zero", () => {
    expect(readingOf({}).wildImps).toEqual({ kind: "EXACT", value: 0 });
    expect(outcomeOf(readingOf({}))).toBe("FALSE");
  });

  it("fewer summons than the line asks for, in the longest life, prove the line false: a ceiling, not a count", () => {
    const reading = readingOf({ summons: impsIn(3) });
    expect(reading.wildImps).toEqual({
      kind: "BOUNDED",
      atLeast: 0,
      atMost: 3,
      reason: "PRESENCE_NOT_ESTABLISHED",
    });
    expect(outcomeOf(reading)).toBe("FALSE");
  });

  it("enough summons to reach the line prove nothing: an imp may have ended early, so the count is never read as true", () => {
    const reading = readingOf({ summons: impsIn(6) });
    expect(reading.wildImps).toMatchObject({ kind: "BOUNDED", atLeast: 0, atMost: 6 });
    expect(outcomeOf(reading)).toBe("UNRESOLVED");
  });

  it("an imp older than the longest life is gone: its summon does not reach the ceiling", () => {
    const reading = readingOf({
      summons: [...impsIn(6, 2_000).map((row) => ({ ...row, instance: row.instance + 10 })), ...impsIn(2)],
    });
    expect(reading.wildImps).toMatchObject({ kind: "BOUNDED", atLeast: 0, atMost: 2 });
    expect(outcomeOf(reading)).toBe("FALSE");
  });

  it("the second imp's gameID counts toward the same pool", () => {
    const reading = readingOf({
      summons: [
        { t: 45_000, actor: IMP_ACTOR, instance: 1 },
        { t: 45_001, actor: SECOND_IMP_ACTOR, instance: 1 },
      ],
    });
    expect(reading.wildImps).toMatchObject({ kind: "BOUNDED", atMost: 2 });
  });

  it("another warlock's imps never count", () => {
    const reading = readingOf({ summons: [{ t: 45_000, actor: OTHER_IMP_ACTOR, instance: 1 }] });
    expect(reading.wildImps).toEqual({ kind: "EXACT", value: 0 });
  });

  it("inside the first 40 s an imp from before the pull may be alive: no ceiling, never a zero", () => {
    const reading = readingOf({}, FIGHT_START_MS + 30_000);
    expect(reading.wildImps).toMatchObject({
      kind: "BOUNDED",
      atMost: null,
      reason: "PRE_PULL_INSTANCE_POSSIBLE",
    });
    expect(outcomeOf(reading)).toBe("UNRESOLVED");
  });

  it("a catalog imp with no stated owner, the shape of every retained fight, blocks every ceiling and is never assigned", () => {
    const options = { actors: RETAINED_SHAPE_ACTORS };
    const reading = demonologyPetReadingAt(
      demonologyPetStateOf(fightWith(DIABOLIST, [], options), SOURCE),
      AT,
    );
    expect(reading.wildImps).toMatchObject({ kind: "BOUNDED", atMost: null, reason: "OWNERSHIP_NOT_STATED" });
    expect(reading.demonicTyrant).toEqual({ state: "UNKNOWN", reason: "OWNERSHIP_NOT_STATED" });
    expect(outcomeOf(reading)).toBe("UNRESOLVED");
  });

  it("with no summon coverage a missing page is never a zero", () => {
    const reading = readingOf({ summonCoverage: false });
    expect(reading.wildImps.kind).toBe("BOUNDED");
    expect(reading.wildImps).toMatchObject({ atMost: null });
    expect(outcomeOf(reading)).toBe("UNRESOLVED");
  });

  it("a later summon never changes the answer at an earlier instant", () => {
    const before = readingOf({ summons: impsIn(3) });
    const after = readingOf({ summons: [...impsIn(3), { t: 60_000, actor: IMP_ACTOR, instance: 40 }] });
    expect(after.wildImps).toEqual(before.wildImps);
  });

  it("the stack binding is explicit even when unknown, and the react count stays unknown too", () => {
    const { knownBuffStacks } = demonologyPetBindingsOf(readingOf({ summons: impsIn(3) }));
    expect(knownBuffStacks).toHaveLength(1);
    expect(knownBuffStacks[0]?.name).toBe("wild_imps");
    expect(knownBuffStacks[0]?.stack).toMatchObject({ state: "ONE_OF_NUMBERS", values: [0, 1, 2, 3] });
  });

  it("only this slice's own atoms are bound: nothing about the pets touches another buff", () => {
    const { knownBuffStacks } = demonologyPetBindingsOf(readingOf({}));
    expect(knownBuffStacks.map((row) => row.name)).toEqual(["wild_imps"]);
  });

  it("each reading has one coverage key per entity, with its reason", () => {
    expect(demonologyPetReadingKeys(readingOf({ summons: impsIn(3) }))).toEqual([
      "demonic_tyrant: UNKNOWN LIFETIME_BOUND_NOT_PINNED",
      "wild_imps: BOUNDED PRESENCE_NOT_ESTABLISHED",
    ]);
    expect(demonologyPetReadingKeys(readingOf({}))).toEqual([
      "demonic_tyrant: UNKNOWN LIFETIME_BOUND_NOT_PINNED",
      "wild_imps: EXACT",
    ]);
  });
});

describe("the facade reads the pets at the anchor, or not at all", () => {
  const IMPLOSION_LINE = () => lineAt("diabolist", 8);
  const T = 50_000;
  const options = (count: number): FightOptions => ({
    actors: STATED_ACTORS,
    authority: accessAnswering(IMPLOSION_LINE()),
    summons: Array.from({ length: count }, (_, index) => ({
      t: 45_000 + index,
      actor: IMP_ACTOR,
      instance: index + 1,
    })),
  });

  it("the line is the pinned one", () => {
    expect(IMPLOSION_LINE().actionStringVerbatim).toBe(
      "implosion,if=buff.wild_imps.stack>=6&(active_enemies>2|talent.to_hell_and_back.enabled)",
    );
  });

  it("an established anchor carries its reading, at the anchor's own time", () => {
    const analysis = analyzed(DIABOLIST, [FIRST_INSTANT, { t: T, ability: IMPLOSION }], options(3));
    expect(analysis.resolved[1]?.pets).toMatchObject({
      reportTimeMs: FIGHT_START_MS + T,
      wildImps: { kind: "BOUNDED", atLeast: 0, atMost: 3 },
    });
  });

  it("a hard cast's pets are the begin's, not the completion's: an imp summoned while it cast is not counted", () => {
    const analysis = analyzed(
      DIABOLIST,
      [FIRST_INSTANT, { t: T - 1000, ability: TYRANT, phase: "BEGIN" }, { t: T, ability: TYRANT }],
      {
        actors: STATED_ACTORS,
        summons: [
          { t: 45_000, actor: IMP_ACTOR, instance: 1 },
          { t: T - 500, actor: IMP_ACTOR, instance: 2 },
        ],
      },
    );
    expect(analysis.resolved[1]?.pets).toMatchObject({
      reportTimeMs: FIGHT_START_MS + T - 1000,
      wildImps: { kind: "BOUNDED", atMost: 1 },
    });
  });

  it("no established anchor, no reading: nothing answers a moment nobody established", () => {
    const analysis = analyzed(
      DIABOLIST,
      [FIRST_INSTANT, { t: T - 1000, ability: SHADOW_BOLT, phase: "BEGIN" }, { t: T, ability: SHADOW_BOLT }],
      options(3),
    );
    expect(analysis.resolved[1]?.anchor.state).toBe("UNKNOWN");
    expect(analysis.resolved[1]?.pets).toBeNull();
  });

  it("the coverage tallies the readings, and only of established anchors", () => {
    const { coverage } = analyzed(
      DIABOLIST,
      [FIRST_INSTANT, { t: T - 1000, ability: SHADOW_BOLT, phase: "BEGIN" }, { t: T, ability: SHADOW_BOLT }],
      options(3),
    );
    const total = coverage.petReadings
      .filter((row) => row.key.startsWith("wild_imps"))
      .reduce((sum, row) => sum + row.count, 0);
    expect(total).toBe(1);
  });

  it("a ceiling under the line reaches the scan: the line is proven false, and it is no longer a candidate", () => {
    const closed = analyzed(DIABOLIST, [FIRST_INSTANT, { t: T, ability: IMPLOSION }], options(3));
    expect(closed.resolved[1]?.selection.undecidedCandidates).toEqual([]);
    const open = analyzed(DIABOLIST, [FIRST_INSTANT, { t: T, ability: IMPLOSION }], options(6));
    expect(open.resolved[1]?.selection.undecidedCandidates.map((row) => row.at)).toEqual([
      "diabolist[8] implosion",
    ]);
  });

  it("a ceiling never turns the press into a rejection: that needs a proof this slice does not have", () => {
    const closed = analyzed(DIABOLIST, [FIRST_INSTANT, { t: T, ability: IMPLOSION }], options(3));
    expect(closed.comparisons[1]?.outcome).not.toBe("REJECTED");
  });

  it("a fight's bindings are not shared between decisions: an earlier decision's reading does not reach a later one", () => {
    const analysis = analyzed(
      DIABOLIST,
      [FIRST_INSTANT, { t: T, ability: IMPLOSION }, { t: T + 45_000, ability: IMPLOSION }],
      options(3),
    );
    expect(analysis.resolved[1]?.pets?.wildImps).toMatchObject({ atMost: 3 });
    expect(analysis.resolved[2]?.pets?.wildImps).toEqual({ kind: "EXACT", value: 0 });
  });
});

describe("no decision resolves", () => {
  it.each([
    ["diabolist", DIABOLIST],
    ["soul_harvester", SOUL_HARVESTER],
    ["no hero entry at all", [] as readonly Entry[]],
  ])("%s: every decision stays UNKNOWN, with its reason attached", (_name, tree) => {
    const analysis = analyzed(tree, [
      FIRST_INSTANT,
      { t: 2000, ability: SHADOW_BOLT, phase: "BEGIN" },
      { t: 3000, ability: SHADOW_BOLT },
      { t: 3500, ability: TYRANT, phase: "BEGIN" },
      { t: 4500, ability: TYRANT },
      { t: 4800, ability: IMPLOSION },
    ]);
    const { coverage } = analysis;
    expect(coverage.eligibleDecisions).toBe(4);
    expect(coverage.match).toBe(0);
    expect(coverage.rejected).toBe(0);
    expect(coverage.unknown).toBe(4);
    expect(coverage.resolvedComparisons).toBe(0);
    expect(analysis.comparisons.every((comparison) => comparison.outcome === "UNKNOWN")).toBe(true);
  });

  it("classifies the population: a spell the dataset has no record of is excluded, never judged", () => {
    const analysis = analyzed(DIABOLIST, [
      { t: 2000, ability: UNREVIEWED },
      { t: 2500, ability: 999999 },
    ]);
    expect(analysis.comparisons).toHaveLength(0);
    expect(analysis.excluded.map((cast) => cast.reason)).toEqual([
      "EXECUTION_LANE_NOT_ESTABLISHED",
      "EXECUTION_LANE_NOT_ESTABLISHED",
    ]);
  });

  it("a build with no hero entry is carried as UNKNOWN and proves nothing absent", () => {
    const analysis = analyzed([], []);
    expect(analysis.build.heroTree.state).toBe("UNKNOWN");
    expect(analysis.build.talentsProvenAbsent).toEqual([]);
  });

  it("a Soul Shard value on the wire is not read: at a completion it is not the decision's", () => {
    const facts = factsOf(DIABOLIST);
    const row = bindingsOf(facts).specAtoms?.bound.find((binding) => binding.key === "soul_shard");
    expect(row?.value).toEqual({ kind: "MAGNITUDE", binding: unknownNumber("STATE_NOT_MODELLED") });

    const line = lineAt("diabolist", 7);
    expect(line.actionStringVerbatim).toBe("summon_demonic_tyrant,if=soul_shard=5");
    const analysis = analyzed(DIABOLIST, [FIRST_INSTANT, { t: 3000, ability: IMPLOSION, power: 50 }], {
      authority: accessAnswering(line),
    });
    // A full bar at the completion would make the line's test true. It is not read, so the condition stays open.
    expect(analysis.comparisons[1]?.outcome).toBe("UNKNOWN");
    expect(analysis.resolved[1]?.selection.undecidedCandidates[0]?.atoms).toEqual(["soul_shard"]);
  });
});

describe("the list as pinned", () => {
  it("is 61 actions in 6 lists, with the dispatches as pinned", () => {
    expect(authority().actions).toHaveLength(61);
    expect(artifact.lists).toHaveLength(6);
    expect(lineAt("default", 4).actionStringVerbatim).toBe(
      "call_action_list,name=diabolist,if=talent.diabolic_ritual",
    );
    expect(lineAt("default", 5).actionStringVerbatim).toBe(
      "call_action_list,name=soulharvest,if=talent.demonic_soul",
    );
  });

  it("records the live and PTR relationship it was extracted under", () => {
    expect(artifact.provenance.livePtrPolicy).toBe("NO_PTR_REGION");
  });

  it("every in-domain condition outside precombat parses whole", () => {
    const refused = authority()
      .actions.filter((action) => action.listName !== "precombat")
      .filter((action) => nonDomainCategoryOf(action.actionToken) === null)
      .flatMap((action) => {
        const raw = (action as { readonly conditionRaw?: string | null }).conditionRaw ?? null;
        if (raw === null) return [];
        const parsed = parseSimcExpression(raw, DEMONOLOGY_ATOM_VOCABULARY) as { readonly kind?: string };
        return parsed.kind === "UNSUPPORTED" ? [`${action.listName}[${String(action.priorityOrdinal)}]`] : [];
      });
    expect(refused).toEqual([]);
  });

  it("no bound action of the list is off the GCD, so no contract is reviewed", () => {
    for (const token of new Set(authority().actions.map((action) => action.actionToken))) {
      if (nonDomainCategoryOf(token) !== null) continue;
      expect(demonologyExecutionLaneForToken(token), token).not.toBe("NON_GCD");
    }
    expect(demonologyExecutionLaneForAbility(IMPLOSION)).toBe("GCD_CONSUMING");
    expect(demonologyTransitionContractFor("implosion")).toBeNull();
  });
});

describe("the enemy count", () => {
  it("is declared and unbound, so a line reading it stays open and never reads as single target", () => {
    const row = bindingsOf(factsOf(DIABOLIST)).specAtoms?.bound.find(
      (binding) => binding.key === "active_enemies",
    );
    expect(row?.value).toEqual({ kind: "MAGNITUDE", binding: unknownNumber("STATE_NOT_MODELLED") });
  });

  it("the Implosion line's enemy count is stepped past only because the talent answers it: without the talent, it stays open", () => {
    const line = lineAt("diabolist", 8);
    const withoutTalent = factsOf(entries(["implosion", "summon_demonic_tyrant", "diabolic_ritual"]), [
      "to_hell_and_back",
    ]);
    const condition = "active_enemies>2|talent.to_hell_and_back.enabled";
    expect(line.actionStringVerbatim).toContain(condition);
    const parsed = parseSimcExpression(condition, DEMONOLOGY_ATOM_VOCABULARY);
    if (!parsed.ok) throw new Error(parsed.fragment);
    expect(evaluateSimcExpression(parsed.ast, condition, bindingsOf(factsOf(DIABOLIST)))).toMatchObject({
      outcome: "RESOLVED",
      value: true,
    });
    expect(evaluateSimcExpression(parsed.ast, condition, bindingsOf(withoutTalent)).outcome).toBe(
      "UNRESOLVED",
    );
  });

  it("a single target only a test can state still does not fall through to a confident answer", () => {
    const facts = factsOf(DIABOLIST);
    const outcome = demonologyFirstGcdSelectionAt({
      authority: authority(),
      bindings: bindingsOf(facts, { active_enemies: 1 }),
      buildFacts: { talents: facts.talents, talentsProvenAbsent: facts.talentsProvenAbsent },
      observedAbilityGameId: IMPLOSION,
    });
    expect(outcome.result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
  });
});

describe("the talents", () => {
  it("a lone-node talent absent from the tree stays UNKNOWN, never false: the retained builds' Doom and Doomguard", () => {
    expect(resolveDemonologyTalent(DIABOLIST, "doom").selection).toBe("UNKNOWN");
    expect(resolveDemonologyTalent(DIABOLIST, "summon_doomguard").selection).toBe("UNKNOWN");
  });

  it("a choice node proves its other entry not taken", () => {
    expect(resolveDemonologyTalent(DIABOLIST, "implosion").selection).toBe("SELECTED");
    expect(resolveDemonologyTalent(DIABOLIST, "power_siphon").selection).toBe("NOT_SELECTED");
    expect(resolveDemonologyTalent(DIABOLIST, "grimoire_imp_lord").selection).toBe("SELECTED");
    expect(resolveDemonologyTalent(DIABOLIST, "grimoire_fel_ravager").selection).toBe("NOT_SELECTED");
  });

  it("a resolved tree disproves only the other tree's talents, and Hellcaller is no tree of this specialization", () => {
    expect(resolveDemonologyHeroTree(DIABOLIST)).toMatchObject({ state: "RESOLVED", simcName: "diabolist" });
    expect(resolveDemonologyHeroTree(SOUL_HARVESTER)).toMatchObject({
      state: "RESOLVED",
      simcName: "soul_harvester",
    });
    expect(demonologyTalentsDisprovedByHeroTree(resolveDemonologyHeroTree(DIABOLIST))).toEqual([
      "demonic_soul",
    ]);
    expect(demonologyTalentsDisprovedByHeroTree(resolveDemonologyHeroTree(SOUL_HARVESTER))).toEqual([
      "diabolic_ritual",
      "ruination",
      "secrets_of_the_coven",
    ]);
  });

  it("an unresolved tree disproves nothing", () => {
    expect(demonologyTalentsDisprovedByHeroTree(resolveDemonologyHeroTree([]))).toEqual([]);
  });

  it("an action built on a talent proven absent is background; an unresolved one never is", () => {
    const line = authority().actions.find((action) => action.actionToken === "summon_doomguard");
    if (line === undefined) throw new Error("no line");
    expect(resolveDemonologyApplicability(factsOf(DIABOLIST, ["summon_doomguard"]), line).kind).toBe(
      "NOT_APPLICABLE",
    );
    expect(resolveDemonologyApplicability(factsOf(DIABOLIST), line).kind).toBe("UNKNOWN");
  });

  it.each([
    ["demonbolt", "demoniac"],
    ["infernal_bolt", "secrets_of_the_coven"],
    ["ruination", "ruination"],
    ["hand_of_guldan", "hand_of_guldan"],
  ] as const)("%s is built on %s, read from the pinned constructor", (token, talent) => {
    expect(TALENT_BUILT_TOKENS[token]).toBe(talent);
    const line = authority().actions.find(
      (action) => action.actionToken === token && action.listName !== "precombat",
    );
    if (line === undefined) throw new Error("no line");
    expect(resolveDemonologyApplicability(factsOf(DIABOLIST), line).kind).toBe("APPLICABLE");
    expect(resolveDemonologyApplicability(factsOf([], [talent]), line).kind).toBe("NOT_APPLICABLE");
    expect(resolveDemonologyApplicability(factsOf([]), line).kind).toBe("UNKNOWN");
  });

  it("Shadow Bolt is applicable on every build: its guard reads an Affliction talent no Demonology tree holds", () => {
    const line = lineAt("diabolist", 14);
    expect(line.actionToken).toBe("shadow_bolt");
    expect(TALENT_BUILT_TOKENS["shadow_bolt"]).toBeUndefined();
    for (const tree of [DIABOLIST, SOUL_HARVESTER, [] as readonly Entry[]]) {
      expect(resolveDemonologyApplicability(factsOf(tree), line).kind).toBe("APPLICABLE");
    }
  });

  it("talent.to_hell_and_back.enabled is the talent's three-way answer, and an unresolved one binds nothing", () => {
    const keyed = (facts: Facts) =>
      bindingsOf(facts).specAtoms?.bound.filter((row) => row.key === "talent.to_hell_and_back.enabled");
    expect(keyed(factsOf(DIABOLIST))).toEqual([
      {
        key: "talent.to_hell_and_back.enabled",
        actionToken: null,
        value: { kind: "TRUTH", value: true },
      },
    ]);
    expect(keyed(factsOf([]))).toEqual([]);
    expect(keyed(factsOf([], ["to_hell_and_back"]))).toEqual([
      {
        key: "talent.to_hell_and_back.enabled",
        actionToken: null,
        value: { kind: "TRUTH", value: false },
      },
    ]);
  });
});

describe("usability", () => {
  const usability = (action: AplAction, observed: number) =>
    resolveDemonologyUsability({
      state: initialDemonologyState(),
      action,
      observedAbilityGameId: observed,
    });

  it("the press proves its own token, and nothing else", () => {
    const line = unconditional("implosion");
    expect(usability(line, IMPLOSION).kind).toBe("PROVEN_USABLE");
    expect(usability(line, TYRANT).kind).toBe("UNKNOWN");
  });
});

describe("the domain boundary", () => {
  it("racials, items, the potion and the external buff cannot preempt a class action", () => {
    for (const [list, ordinal] of [
      ["default", 0],
      ["default", 1],
      ["items", 0],
      ["racials", 0],
    ] as const) {
      const verdict = demonologyNonDomainApplicabilityFor(lineAt(list, ordinal));
      expect(verdict?.kind, `${list}[${String(ordinal)}]`).toBe("NOT_APPLICABLE");
    }
  });

  it("no class action is classified outside the domain", () => {
    for (const token of Object.keys(TALENT_BUILT_TOKENS)) {
      expect(nonDomainCategoryOf(token), token).toBeNull();
    }
  });
});

describe("the pinned data", () => {
  it("all datasets load", () => {
    expect(pinnedDemonologyWarlockGcdSemantics().ok).toBe(true);
    expect(pinnedDemonologyWarlockTalents().ok).toBe(true);
  });

  it("every cast row names the token the GCD dataset binds, and no token lacks a row", () => {
    const tokens = demonologyTokenByAbilityId();
    for (const row of DEMONOLOGY_CAST_ROWS) {
      expect(tokens.get(row.abilityGameId), row.simcToken).toBe(row.simcToken);
    }
    for (const [abilityGameId, token] of tokens) {
      expect(demonologyCastRowFor(abilityGameId)?.simcToken, token).toBe(token);
    }
  });

  it("a cast time is positive exactly on the rows that are not INSTANT", () => {
    for (const row of DEMONOLOGY_CAST_ROWS) {
      expect(row.baseCastMs > 0, row.simcToken).toBe(row.rule !== "INSTANT");
    }
  });

  it("the summons and the like-named rows are no press", () => {
    const tokens = demonologyTokenByAbilityId();
    for (const id of [104317, 279910, 193331, 193332, 1250273, 433885, 433891]) {
      expect(tokens.has(id), String(id)).toBe(false);
    }
  });

  it("the press's own row binds its token", () => {
    expect(demonologyTokenBinding("implosion")).toMatchObject({
      kind: "KNOWN_ONE",
      abilityGameId: IMPLOSION,
    });
  });

  it("an id off the list has no token, and its lane is a refusal", () => {
    const tokens = demonologyTokenByAbilityId();
    expect(tokens.has(UNREVIEWED)).toBe(false);
    expect(demonologyExecutionLaneForAbility(UNREVIEWED)).toBe("UNKNOWN_LANE");
    expect(demonologyBaseGcdMsForAbility(UNREVIEWED)).toBeNull();
  });
});

describe("what this list asks that nothing answers", () => {
  it("the retained shape: the engine refuses at Hand of Gul'dan's aura, and the root scan stops at Doomguard's talent", () => {
    const selection = analyzed(DIABOLIST, [FIRST_INSTANT]).resolved[0]?.selection;
    expect(selection?.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    expect(selection?.blockedAt).toBe("diabolist[1] hand_of_guldan");
    expect(selection?.stoppingPoint).toMatchObject({
      at: "diabolist[4] summon_doomguard",
      atoms: ["APPLICABILITY:summon_doomguard"],
    });
    expect(selection?.undecidedCandidates[0]).toMatchObject({
      at: "diabolist[1] hand_of_guldan",
      atoms: ["buff.dominion_of_argus.up"],
    });
  });

  it("a press of Grimoire: Imp Lord proves itself usable, and still competes with the open Hand of Gul'dan", () => {
    const selection = analyzed(DIABOLIST, [FIRST_INSTANT, { t: 2000, ability: IMP_LORD }]).resolved[1]
      ?.selection;
    expect(selection?.blockedAt).toBe("diabolist[1] hand_of_guldan");
    expect(selection?.stoppingPoint).toMatchObject({
      at: "default[4] call_action_list",
      blocker: "COMPETING_POSSIBLE_ACTION",
    });
  });

  it("the racials dispatch reads the Tyrant and the fight's end, and either way returns nothing a class action must wait on", () => {
    expect(lineAt("default", 2).actionStringVerbatim).toBe(
      "call_action_list,name=racials,if=pet.demonic_tyrant.active|fight_remains<22,use_off_gcd=1",
    );
    const selection = analyzed(DIABOLIST, [FIRST_INSTANT]).resolved[0]?.selection;
    expect(selection?.dispatches[0]).toMatchObject({
      at: "default[2]",
      calleeListName: "racials",
      outcome: "CALL_RETURNED_NO_ACTION_CONTINUE",
    });
  });

  it("the first line asks how long the fight has left, and the fight's real end is never read as the answer", () => {
    const line = lineAt("diabolist", 0);
    expect(line.actionStringVerbatim).toBe("power_siphon,if=buff.demonic_core.stack<=1|fight_remains<10");
    const facts = factsOf(entries(["power_siphon", "diabolic_ritual"]));
    const outcome = demonologyFirstGcdSelectionAt({
      authority: authority(),
      bindings: bindingsOf(facts),
      buildFacts: { talents: facts.talents, talentsProvenAbsent: facts.talentsProvenAbsent },
      observedAbilityGameId: IMPLOSION,
    });
    expect(outcome.rootScan.undecidedCandidates[0]?.at).toBe("diabolist[0] power_siphon");
    expect(outcome.result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
  });

  it("a Soul Harvester build skips the Diabolist list and stops on its own list, measured on no real subject", () => {
    const selection = analyzed(SOUL_HARVESTER, [FIRST_INSTANT]).resolved[0]?.selection;
    expect(selection?.dispatches.find((row) => row.at === "default[4]")?.gate).toBe("FALSE");
    expect(selection?.dispatches.find((row) => row.at === "default[5]")?.gate).toBe("TRUE");
    expect(selection?.blockedAt).toBe("soulharvest[1] hand_of_guldan");
  });

  it("a build with no hero entry leaves both dispatches open, and answers nothing", () => {
    const analysis = analyzed([], [FIRST_INSTANT]);
    expect(analysis.resolved[0]?.selection.dispatches.find((row) => row.at === "default[4]")?.gate).toBe(
      "UNKNOWN_STATE",
    );
    expect(analysis.comparisons[0]?.outcome).toBe("UNKNOWN");
  });

  it("Demonbolt's target_if chooses among targets nobody identified, so it answers nothing", () => {
    const line = lineAt("diabolist", 12);
    expect(line.actionStringVerbatim).toBe(
      "demonbolt,target_if=(!debuff.doom.up),if=soul_shard<4&buff.demonic_core.react&talent.doom",
    );
    const analysis = analyzed(DIABOLIST, [FIRST_INSTANT], { authority: accessAnswering(line) });
    expect(analysis.comparisons[0]?.outcome).toBe("UNKNOWN");
  });
});

describe("the state the list reads", () => {
  it.each([
    ["buff.dominion_of_argus.up"],
    ["buff.demonic_core.stack<=1"],
    ["buff.demonic_core.react"],
    ["cooldown.summon_demonic_tyrant.remains>5"],
    ["soul_shard<3"],
    ["fight_remains<10"],
    ["gcd.max>1"],
  ])("%s has nothing behind it, so it is UNKNOWN, never a truth read as absent", (condition) => {
    const parsed = parseSimcExpression(condition, DEMONOLOGY_ATOM_VOCABULARY);
    if (!parsed.ok) throw new Error(parsed.fragment);
    expect(evaluateSimcExpression(parsed.ast, condition, bindingsOf(factsOf(DIABOLIST))).outcome).toBe(
      "UNRESOLVED",
    );
  });

  it("no aura is read at all, so a Demonic Core is never read as spent, and no cooldown as ready", () => {
    const bindings = bindingsOf(factsOf(DIABOLIST));
    expect(bindings.knownBuffs).toEqual([]);
    expect(bindings.knownCooldownRemainsSeconds).toEqual([]);
  });
});
