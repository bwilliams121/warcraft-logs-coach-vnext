/**
 * ONB-C1: Feral Druid, Cohort C's representative: pooling, plus form state.
 *
 * No decision resolves on real evidence, so the mandatory negatives are the centre of it: an open enemy
 * count never reads as single target, a pool is never a REJECTED or a MATCH, a Ferocious Bite pressed below
 * its line's Energy never passes that line, a missing Cat Form transition never reads as caster form, and
 * a missing stealth transition never reads as stealth.
 *
 * Synthetic on purpose. The whole-fight numbers in agent/architecture.md "ONB-C1" come from replaying
 * retained captures and are not pinned, and the archive has no room for them. The queries "behind the
 * count" give the query values this slice never has, because only a test can reach what stands behind
 * the count, and that is the point: it shows what the pool does when something finally reaches it.
 */

import { describe, expect, it } from "vitest";

import feralTalents from "../../../src/data/game/druid-feral-talents.json";
import {
  feralDruidExecutionLaneForAbility,
  feralDruidExecutionLaneForToken,
  feralDruidTokenBinding,
  pinnedFeralDruidGcdSemantics,
} from "../../../src/data/game/druid-feral-gcd-semantics.js";
import {
  APEX_PREDATORS_CRAVING_BUFF_SPELL_ID,
  BERSERK_BUFF_SPELL_ID,
  CAT_FORM_BUFF_SPELL_ID,
  feralBsIncAuraFor,
  INCARNATION_BUFF_SPELL_ID,
  PROWL_BUFF_SPELL_ID,
  SHADOWMELD_BUFF_SPELL_ID,
} from "../../../src/data/game/druid-feral-aura-authority.js";
import {
  pinnedFeralDruidTalents,
  resolveFeralDruidHeroTree,
  resolveFeralDruidTalent,
} from "../../../src/data/game/druid-feral-talents.js";
import { feralDruidTransitionContractFor } from "../../../src/data/game/druid-feral-transition-authority.js";
import type { CombatEvent } from "../../../src/engine/normalization/normalized-events.js";
import { createCombatState } from "../../../src/engine/state/combat-state.js";
import type { AnalyzerRegistration } from "../../../src/findings/analyzer-registration.js";
import { compareObservedAction } from "../../../src/findings/observed-comparison.js";
import {
  analyzerForSpec,
  internalAnalyzerForSpec,
  PRODUCTION_CATALOG,
} from "../../../src/services/analyzer-registry.js";
import { resolveSpecIdentity } from "../../../src/services/spec-identity.js";
import type { AplAction, AplAuthority } from "../../../src/simc/apl-authority.js";
import {
  knownNumber,
  unknownNumber,
  type AtomBindings,
  type NumericBinding,
} from "../../../src/simc/expression/evaluate.js";
import { parseSimcExpression } from "../../../src/simc/expression/parse.js";
import { nonDomainCategoryOf } from "../../../src/simc/non-domain-tokens.js";
import {
  resolveFeralDruidApplicability,
  resolveFeralDruidUsability,
} from "../../../src/specs/druid/feral/action-profile.js";
import type { FeralAuraBinding } from "../../../src/specs/druid/feral/aura-bindings.js";
import {
  engagedBefore,
  FERAL_HARMFUL_TOKENS,
  feralCastFactsFrom,
  prowlReadinessAt,
  type ProwlReadiness,
} from "../../../src/specs/druid/feral/combat-engagement.js";
import { feralDruidNonDomainApplicabilityFor } from "../../../src/specs/druid/feral/domain-boundary.js";
import { feralDruidFirstGcdSelectionAt } from "../../../src/specs/druid/feral/first-gcd-adapter.js";
import { initialFeralDruidState } from "../../../src/specs/druid/feral/first-gcd-state.js";
import { analyzeObservedFeralDruidDecisions } from "../../../src/specs/druid/feral/observed-analysis.js";
import { pinnedFeralDruidAuthority } from "../../../src/specs/druid/feral/pinned-authority.js";
import {
  asksMaxEnergy,
  feralPoolingResolver,
  feralScanAuthority,
  FEROCIOUS_BITE_SPELL_ID,
  maxEnergyReadiness,
  maximumEnergyBounds,
  type MaxEnergyFacts,
} from "../../../src/specs/druid/feral/pooling-model.js";
import {
  feralDruidTalentsDisprovedByHeroTree,
  resolveFeralDruidAtoms,
} from "../../../src/specs/druid/feral/resolver.js";
import { FERAL_DRUID_ATOM_VOCABULARY, SPELL_TARGETS } from "../../../src/specs/druid/feral/vocabulary.js";
import {
  attachedResources,
  auraEvent,
  castEvent,
  classResource,
  syntheticFight,
} from "../../support/synthetic-fight.js";

const SOURCE = 7;
const BOSS = 900;
const END = 600000;
const FIGHT_START = 1000;

type Entry = { readonly id: number; readonly nodeId: number };

function entries(names: readonly string[]): readonly Entry[] {
  return names.map((name) => {
    const row = feralTalents.talents.find((candidate) => candidate.simcName === name);
    if (row === undefined) throw new Error(`no pinned talent ${name}`);
    return { id: row.traitEntryId, nodeId: row.traitNodeId };
  });
}

/** Berserk, with the Convoke side of the choice node: Incarnation proven not taken. */
const BERSERK_BUILD = entries([
  "tigers_fury",
  "rake",
  "rip",
  "swipe",
  "berserk_cat",
  "convoke_the_spirits",
  "focused_frenzy",
  "feral_frenzy",
  "lunar_inspiration",
  "thriving_growth",
  "bursting_growth",
]);
/** Incarnation, with Convoke proven not taken. */
const INCARNATION_BUILD = entries([
  "tigers_fury",
  "rake",
  "rip",
  "swipe",
  "berserk_cat",
  "incarnation_cat",
  "focused_frenzy",
  "feral_frenzy",
  "lunar_inspiration",
  "thriving_growth",
  "bursting_growth",
]);
/** The tree carries nothing that resolves the Incarnation node. */
const UNRESOLVED_BUILD = entries(["tigers_fury", "rake", "rip", "swipe", "thriving_growth"]);

const RAKE = 1822;
const SHRED = 5221;
const FEROCIOUS_BITE = FEROCIOUS_BITE_SPELL_ID;
const RIP = 1079;
const CAT_FORM = 768;
const REGROWTH = 8936;
const SHADOWMELD_CAST = 58984;
const INCARNATION_CAST = 102543;
const PROWL_CAST = 5215;
const TIGERS_FURY = 5217;
const POTION = 1236616;

type Timeline =
  | {
      readonly t: number;
      readonly ability: number | null;
      /** A cast the log gives no source. */
      readonly noSource?: true;
      readonly energy?: number;
      readonly energyMax?: number;
      readonly cp?: number;
      readonly melee?: true;
    }
  | { readonly t: number; readonly aura: number; readonly op: "APPLIED" | "REMOVED" };

function combatantInfo(tree: readonly Entry[]): CombatEvent {
  return {
    locator: {
      streamId: "all",
      pageOrdinal: 0,
      indexInPage: 0,
      ingestionOrdinal: 0,
      rawType: "combatantinfo",
      reportTimeMs: FIGHT_START,
    },
    ingestionOrdinal: 0,
    reportTimeMs: FIGHT_START,
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
    snapshot: {
      actorId: SOURCE,
      specId: 0,
      gear: [],
      malformedGearRows: [],
      talentTree: tree.map((entry) => ({ id: entry.id, rank: 1, nodeId: entry.nodeId })),
    },
  } as unknown as CombatEvent;
}

function stateWith(tree: readonly Entry[] | null, timeline: readonly Timeline[]) {
  const events: CombatEvent[] = tree === null ? [] : [combatantInfo(tree)];
  let ordinal = 1;
  for (const row of timeline) {
    if ("aura" in row) {
      events.push(
        auraEvent({
          ordinal: ordinal++,
          reportTimeMs: row.t,
          sourceActorId: SOURCE,
          targetActorId: SOURCE,
          abilityGameId: row.aura,
          auraClass: "BUFF",
          operation: row.op,
        }),
      );
      continue;
    }
    const classResources = [
      ...(row.energy === undefined
        ? []
        : [classResource(3, row.energy, { max: row.energyMax ?? 120, cost: 25 })]),
      ...(row.cp === undefined ? [] : [classResource(4, row.cp, { max: 5, cost: 5 })]),
    ];
    const event = castEvent({
      ordinal: ordinal++,
      reportTimeMs: row.t,
      sourceActorId: row.noSource === undefined ? SOURCE : null,
      targetActorId: BOSS,
      abilityGameId: row.ability,
      castPhase: "COMPLETE",
      attachedResources:
        classResources.length === 0
          ? null
          : attachedResources({ side: "SOURCE", actorId: SOURCE, classResources }),
    });
    events.push(row.melee === undefined ? event : ({ ...event, isMelee: true } as CombatEvent));
  }
  return createCombatState(
    syntheticFight({ endTimeMs: END, events, observedCategories: ["AURAS", "CASTS", "RESOURCES"] }),
  );
}

function analyzed(tree: readonly Entry[] | null, timeline: readonly Timeline[]) {
  const analysis = analyzeObservedFeralDruidDecisions({
    state: stateWith(tree, timeline),
    actorId: SOURCE,
    specId: "druid/feral",
    targetActorId: null,
  });
  if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
  return analysis;
}

function authority(): AplAuthority {
  const result = pinnedFeralDruidAuthority();
  if (!result.ok) throw new Error("the pinned authority did not load");
  return result.authority;
}

function lineAt(list: string, ordinal: number): AplAction {
  const line = authority().actions.find(
    (action) => action.listName === list && action.priorityOrdinal === ordinal,
  );
  if (line === undefined) throw new Error(`no line ${list}[${String(ordinal)}]`);
  return line;
}

/** The bindings of one aura atom at the last cast of a timeline. */
function aurasAtLast(tree: readonly Entry[], timeline: readonly Timeline[]): readonly FeralAuraBinding[] {
  const analysis = analyzed(tree, timeline);
  const last = analysis.resolved[analysis.resolved.length - 1];
  if (last === undefined) throw new Error("no eligible decision");
  return last.auras;
}

function auraOf(bindings: readonly FeralAuraBinding[], atom: string): FeralAuraBinding {
  const binding = bindings.find((entry) => entry.atomName === atom);
  if (binding === undefined) throw new Error(`no binding ${atom}`);
  return binding;
}

const MET_GATES = { state: "NOT_READY", basis: "test" } as const satisfies ProwlReadiness;

/**
 * A query with values this slice never has: the enemy count, and proofs that close every line above the
 * finisher. `absent` removes an action as a build fact could, so a line of interest is what decides.
 */
function queryBehindTheCount(input: {
  readonly enemies?: number;
  readonly comboPoints: NumericBinding;
  readonly energy: NumericBinding;
  readonly energyMaximum?: number | null;
  readonly observed: number;
  readonly bsIncUp?: boolean | null;
  readonly apexUp?: boolean | null;
  readonly incarnationSelected?: boolean | null;
}) {
  const tree = INCARNATION_BUILD;
  const talents = Object.fromEntries(
    feralTalents.talents.map((talent) => [talent.simcName, resolveFeralDruidTalent(tree, talent.simcName)]),
  );
  const heroTree = resolveFeralDruidHeroTree(tree);
  const talentsProvenAbsent = new Set<string>(feralDruidTalentsDisprovedByHeroTree(heroTree));
  for (const [name, talent] of Object.entries(talents)) {
    if (talent.selection === "NOT_SELECTED") talentsProvenAbsent.add(name);
  }
  for (const name of ["tigers_fury", "rip", "rake", "lunar_inspiration", "swipe", "feral_frenzy"]) {
    talentsProvenAbsent.add(name);
    delete talents[name];
  }
  const bsIncUp = input.bsIncUp === undefined ? false : input.bsIncUp;
  const resolution = resolveFeralDruidAtoms({
    heroTree,
    talents,
    talentsProvenAbsent,
    energy: input.energy,
    bsIncUp,
  });
  const bound =
    input.enemies === undefined
      ? resolution.specAtoms.bound
      : resolution.specAtoms.bound.map((binding) =>
          binding.key === SPELL_TARGETS
            ? { ...binding, value: { kind: "MAGNITUDE" as const, binding: knownNumber(input.enemies ?? 0) } }
            : binding,
        );
  const knownTalents = Object.entries(talents).flatMap(([name, talent]) =>
    talent.selection === "SELECTED"
      ? [{ name, taken: true }]
      : talentsProvenAbsent.has(name)
        ? [{ name, taken: false }]
        : [],
  );
  const bindings: AtomBindings = {
    comboPoints: input.comboPoints,
    comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
    energyPct: unknownNumber("STATE_NOT_MODELLED"),
    knownBuffs: [
      { name: "cat_form", up: true },
      { name: "prowl", up: false },
      { name: "shadowmeld", up: false },
      { name: "tigers_fury", up: false },
      { name: "apex_predators_craving", up: input.apexUp === true },
      ...(bsIncUp === null ? [] : [{ name: "bs_inc", up: bsIncUp }]),
    ],
    knownTalents,
    knownCooldownRemainsSeconds: [],
    specAtoms: { ...resolution.specAtoms, bound },
  };
  return feralDruidFirstGcdSelectionAt({
    authority: authority(),
    bindings,
    buildFacts: { talents, talentsProvenAbsent },
    observedAbilityGameId: input.observed,
    prowl: MET_GATES,
    maxEnergy: {
      energy: input.energy,
      bsIncUp,
      apexUp: input.apexUp === undefined ? false : input.apexUp,
      incarnationSelected: input.incarnationSelected === undefined ? true : input.incarnationSelected,
    },
    energyMaximum: input.energyMaximum === undefined ? 120 : input.energyMaximum,
  });
}

const FACTS_AT = (energy: number | null, over: Partial<MaxEnergyFacts> = {}): MaxEnergyFacts => ({
  energy: energy === null ? unknownNumber("STATE_NOT_ESTABLISHED") : knownNumber(energy),
  bsIncUp: false,
  apexUp: false,
  incarnationSelected: false,
  ...over,
});

describe("the row druid/feral", () => {
  it("is reachable by the internal lookup only, and a public identity is refused", () => {
    const row = internalAnalyzerForSpec("druid/feral", PRODUCTION_CATALOG) as AnalyzerRegistration;
    expect(row.analyzerId).toBe("druid-feral-observed-decisions");
    expect(row.exposure).toBe("INTERNAL_ONLY");
    expect(analyzerForSpec("druid/feral", PRODUCTION_CATALOG)).toBeNull();
    expect(resolveSpecIdentity({ className: "Druid", specName: "Feral" }).ok).toBe(false);
  });

  it("refuses another specialization before reading anything of its own", () => {
    const analysis = analyzeObservedFeralDruidDecisions({
      state: stateWith(BERSERK_BUILD, []),
      actorId: SOURCE,
      specId: "paladin/protection",
      targetActorId: null,
    });
    expect(analysis.status).toBe("SPEC_NOT_SUPPORTED");
  });

  it("a capture with no combatant info refuses as PROFILE_NOT_RESOLVED, never judges", () => {
    const analysis = analyzeObservedFeralDruidDecisions({
      state: stateWith(null, [{ t: 2000, ability: SHRED, energy: 100 }]),
      actorId: SOURCE,
      specId: "druid/feral",
      targetActorId: null,
    });
    expect(analysis.status).toBe("PROFILE_NOT_RESOLVED");
  });

  it("every pinned dataset loads, and the list and its talents are the pinned commit's", () => {
    expect(pinnedFeralDruidGcdSemantics().ok).toBe(true);
    expect(pinnedFeralDruidTalents().ok).toBe(true);
    const { provenance } = authority().artifact;
    expect(provenance.commitSha).toBe("33622e9d1662ff0e451691edf85a6b49cc9d11d9");
    expect(provenance.sourcePath).toBe("engine/class_modules/apl/druid/feral_apl.inc");
    expect(provenance.livePtrPolicy).toBe("PTR_SEPARATE_INCLUDE");
  });

  it("every in-domain condition of the list parses whole, so a refusal is about state and not spelling", () => {
    for (const action of authority().actions) {
      if (action.listName === "precombat" || action.conditionRaw === null) continue;
      if (feralDruidNonDomainApplicabilityFor(action) !== null) continue;
      const parsed = parseSimcExpression(action.conditionRaw, FERAL_DRUID_ATOM_VOCABULARY);
      expect(parsed.ok, `${action.listName}[${String(action.priorityOrdinal)}]`).toBe(true);
    }
  });
});

describe("what no decision does", () => {
  const OPENING: readonly Timeline[] = [
    { t: 2000, ability: RAKE, energy: 120 },
    { t: 3000, ability: SHRED, energy: 90 },
    { t: 4000, ability: RIP, energy: 70, cp: 5 },
    { t: 5000, ability: FEROCIOUS_BITE, energy: 60, cp: 5 },
    { t: 6000, ability: FEROCIOUS_BITE, energy: 30, cp: 5 },
    { t: 7000, ability: SHRED, energy: 90 },
  ];

  it.each([
    ["Berserk", BERSERK_BUILD],
    ["Incarnation", INCARNATION_BUILD],
    ["unresolved", UNRESOLVED_BUILD],
  ])("on a %s build, no decision resolves and none is a confident verdict", (_label, tree) => {
    const analysis = analyzed(tree, OPENING);
    expect(analysis.coverage.eligibleDecisions).toBe(6);
    expect(analysis.coverage.match).toBe(0);
    expect(analysis.coverage.rejected).toBe(0);
    expect(analysis.coverage.unknown).toBe(6);
    for (const comparison of analysis.comparisons) expect(comparison.outcome).toBe("UNKNOWN");
  });

  it("the enemy count stays open: nothing of the finisher or builder lists is read as single target", () => {
    const outcome = queryBehindTheCount({
      comboPoints: knownNumber(5),
      energy: knownNumber(60),
      observed: FEROCIOUS_BITE,
    });
    expect(outcome.result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    expect(outcome.result.kind === "ROTATIONAL_GCD_SELECTED").toBe(false);
  });

  it("the Bite pressed below its line's Energy is not a MATCH, a REJECTED or a pass, with the count open", () => {
    const analysis = analyzed(BERSERK_BUILD, OPENING);
    const low = analysis.comparisons[4];
    expect(low?.decision.observedToken).toBe("ferocious_bite");
    expect(low?.outcome).toBe("UNKNOWN");
  });
});

describe("the pinned shape of the pool", () => {
  it("is one guarded line, reading no Energy in its condition", () => {
    const pool = lineAt("finisher", 1);
    const bite = lineAt("finisher", 2);
    expect(pool.actionStringVerbatim).toBe("pool_resource,for_next=1");
    expect(bite.actionStringVerbatim).toBe("ferocious_bite,max_energy=1,if=combo_points>=5");
    expect(bite.conditionRaw).toBe("combo_points>=5");
  });

  it("max_energy is refused by the shared engine, and read past on that one line only", () => {
    const bite = lineAt("finisher", 2);
    expect(bite.unsupportedOptions.map((option) => option.optionKey)).toContain("max_energy");
    expect(asksMaxEnergy(bite)).toBe(true);

    const view = feralScanAuthority(authority());
    const lookup = view.actionsInList("finisher");
    if (!lookup.found) throw new Error("no finisher list");
    const read = lookup.actions.find((action) => action.priorityOrdinal === 2);
    expect(read?.unsupportedOptions).toEqual([]);
    expect(read?.actionStringVerbatim).toBe(bite.actionStringVerbatim);

    // Every other option of the list is refused exactly as before.
    const refusedBefore = authority()
      .actions.flatMap((action) => action.unsupportedOptions.map((option) => option.optionKey))
      .filter((key) => key !== "max_energy");
    const refusedAfter = view.actions.flatMap((action) =>
      action.unsupportedOptions.map((option) => option.optionKey),
    );
    expect(refusedAfter).toEqual(refusedBefore);
  });

  it("another value, or the option on another token, is not read as the pinned form", () => {
    const bite = lineAt("finisher", 2);
    expect(
      asksMaxEnergy({ ...bite, actionStringVerbatim: "ferocious_bite,max_energy=0,if=combo_points>=5" }),
    ).toBe(false);
    expect(asksMaxEnergy({ ...bite, actionToken: "shred" })).toBe(false);
    expect(asksMaxEnergy(lineAt("default", 8))).toBe(false);
  });
});

describe("maximum_energy, read as bounds", () => {
  it.each([
    ["Berserk build, proc down", { incarnationSelected: false, bsIncUp: true, apexUp: false }, 50, 50],
    [
      "Incarnation build, its buff down",
      { incarnationSelected: true, bsIncUp: false, apexUp: false },
      50,
      50,
    ],
    ["Incarnation up", { incarnationSelected: true, bsIncUp: true, apexUp: false }, 37.5, 37.5],
    ["Apex up", { incarnationSelected: false, bsIncUp: false, apexUp: true }, 0, 0],
    [
      "Incarnation state not established",
      { incarnationSelected: true, bsIncUp: null, apexUp: false },
      37.5,
      50,
    ],
    ["Apex not established", { incarnationSelected: false, bsIncUp: false, apexUp: null }, 0, 50],
  ])("%s", (_label, over, low, high) => {
    expect(maximumEnergyBounds(FACTS_AT(0, over))).toEqual({ low, high });
  });

  it("is met, not met or not established, and never a guess inside the bounds", () => {
    expect(maxEnergyReadiness(FACTS_AT(50))).toBe("MET");
    expect(maxEnergyReadiness(FACTS_AT(49))).toBe("NOT_MET");
    const unknownApex = { apexUp: null };
    expect(maxEnergyReadiness(FACTS_AT(49, unknownApex))).toBe("NOT_ESTABLISHED");
    expect(maxEnergyReadiness(FACTS_AT(50, unknownApex))).toBe("MET");
    const incarnationOpen = { incarnationSelected: true, bsIncUp: null };
    expect(maxEnergyReadiness(FACTS_AT(40, incarnationOpen))).toBe("NOT_ESTABLISHED");
    expect(maxEnergyReadiness(FACTS_AT(37, incarnationOpen))).toBe("NOT_MET");
  });

  it("an Energy no cast observed is not established, never zero", () => {
    expect(maxEnergyReadiness(FACTS_AT(null))).toBe("NOT_ESTABLISHED");
  });

  it("a Bite pressed below the line is unusable for the line, and the observed press does not override it", () => {
    const verdict = resolveFeralDruidUsability({
      state: initialFeralDruidState(),
      action: lineAt("finisher", 2),
      observedAbilityGameId: FEROCIOUS_BITE,
      prowl: MET_GATES,
      maxEnergy: FACTS_AT(30),
    });
    expect(verdict.kind).toBe("PROVEN_UNUSABLE");
    if (verdict.kind === "PROVEN_UNUSABLE") expect(verdict.reason).toBe("INSUFFICIENT_RESOURCE");
  });

  it("a bare Bite line keeps the observed proof at any Energy", () => {
    const verdict = resolveFeralDruidUsability({
      state: initialFeralDruidState(),
      action: lineAt("default", 8),
      observedAbilityGameId: FEROCIOUS_BITE,
      prowl: MET_GATES,
      maxEnergy: FACTS_AT(30),
    });
    expect(verdict.kind).toBe("PROVEN_USABLE");
  });

  it("an unestablished Energy leaves the line unknown, even for the Bite observed", () => {
    const verdict = resolveFeralDruidUsability({
      state: initialFeralDruidState(),
      action: lineAt("finisher", 2),
      observedAbilityGameId: FEROCIOUS_BITE,
      prowl: MET_GATES,
      maxEnergy: FACTS_AT(null),
    });
    expect(verdict.kind).toBe("UNKNOWN");
  });
});

describe("the at-maximum question", () => {
  const query = (over: {
    readonly resource?: string | null;
    readonly line?: AplAction;
    readonly cp?: number;
  }) => ({
    poolLine: lineAt("finisher", 1),
    guardedLine: over.line ?? { ...lineAt("finisher", 2), unsupportedOptions: [] },
    resourceOption: over.resource ?? null,
    bindings: {
      comboPoints: knownNumber(over.cp ?? 5),
      comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
      energyPct: unknownNumber("STATE_NOT_MODELLED"),
      knownBuffs: [],
      knownTalents: [],
      knownCooldownRemainsSeconds: [],
    } as AtomBindings,
  });
  const biteObserved = feralPoolingResolver({ energyMaximum: 120, observedAbilityGameId: FEROCIOUS_BITE });
  const shredObserved = feralPoolingResolver({ energyMaximum: 120, observedAbilityGameId: SHRED });

  it("a false condition is not resource limited, whatever was observed", () => {
    expect(biteObserved(query({ cp: 3 })).kind).toBe("NOT_READY_AT_MAX");
    expect(shredObserved(query({ cp: 3 })).kind).toBe("NOT_READY_AT_MAX");
  });

  it("a true condition is ready at the maximum only with the Bite itself observed", () => {
    expect(biteObserved(query({})).kind).toBe("READY_AT_MAX");
    expect(shredObserved(query({})).kind).toBe("UNKNOWN");
  });

  it("refuses anything but the pinned shape", () => {
    expect(biteObserved(query({ resource: "focus" })).kind).toBe("UNKNOWN");
    expect(biteObserved(query({ line: lineAt("builder", 5) })).kind).toBe("UNKNOWN");
    expect(
      biteObserved(
        query({
          line: { ...lineAt("finisher", 2), unsupportedOptions: [], conditionRaw: "combo_points>=4" },
        }),
      ).kind,
    ).toBe("UNKNOWN");
  });

  it("an unobserved Energy maximum is UNKNOWN, never assumed", () => {
    const resolver = feralPoolingResolver({ energyMaximum: null, observedAbilityGameId: FEROCIOUS_BITE });
    expect(resolver(query({})).kind).toBe("UNKNOWN");
  });
});

describe("the pool, reached only by a test that supplies the enemy count", () => {
  it("full Energy and Combo Points: the guarded Bite is selected, and the observed Bite matches", () => {
    const outcome = queryBehindTheCount({
      enemies: 1,
      comboPoints: knownNumber(5),
      energy: knownNumber(60),
      observed: FEROCIOUS_BITE,
    });
    expect(outcome.result.kind).toBe("ROTATIONAL_GCD_SELECTED");
    if (outcome.result.kind === "ROTATIONAL_GCD_SELECTED") {
      expect(outcome.result.actionToken).toBe("ferocious_bite");
    }
  });

  it("a Bite pressed below the line: the list pools, no action is selected, and the comparison is UNKNOWN", () => {
    const outcome = queryBehindTheCount({
      enemies: 1,
      comboPoints: knownNumber(5),
      energy: knownNumber(30),
      observed: FEROCIOUS_BITE,
    });
    expect(outcome.result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    if (outcome.result.kind === "ROTATIONAL_GCD_UNKNOWN") {
      expect(outcome.result.blocker).toBe("APL_WAIT_SELECTED");
    }
    const comparison = compareObservedAction({
      decision: {
        position: 1,
        locator: {
          streamId: "all",
          pageOrdinal: 0,
          indexInPage: 1,
          ingestionOrdinal: 1,
          rawType: "cast",
          reportTimeMs: 2000,
        },
        actorId: SOURCE,
        abilityGameId: FEROCIOUS_BITE,
        observedToken: "ferocious_bite",
        reportTimeMs: 2000,
        fightTimeMs: 1000,
        targetActorId: BOSS,
      },
      authorityResult: outcome.result,
      observedActionJudgment: null,
      observedActionUnselectable: null,
      usabilityProvenance: "OBSERVED_EXECUTION",
    });
    expect(comparison.outcome).toBe("UNKNOWN");
    expect(comparison.basis).toBe("AUTHORITY_SELECTION_UNRESOLVED");
  });

  it("another action pressed below the line stays open: nothing proves the Bite ready at the maximum", () => {
    const outcome = queryBehindTheCount({
      enemies: 1,
      comboPoints: knownNumber(5),
      energy: knownNumber(30),
      observed: SHRED,
    });
    expect(outcome.result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
  });

  it("Incarnation up lowers the line: 40 Energy passes it, and the same 40 pools without it", () => {
    const up = queryBehindTheCount({
      enemies: 1,
      comboPoints: knownNumber(5),
      energy: knownNumber(40),
      observed: FEROCIOUS_BITE,
      bsIncUp: true,
    });
    expect(up.result.kind).toBe("ROTATIONAL_GCD_SELECTED");
    const down = queryBehindTheCount({
      enemies: 1,
      comboPoints: knownNumber(5),
      energy: knownNumber(40),
      observed: FEROCIOUS_BITE,
      bsIncUp: false,
    });
    expect(down.result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    if (down.result.kind === "ROTATIONAL_GCD_UNKNOWN") expect(down.result.blocker).toBe("APL_WAIT_SELECTED");
  });

  it("Combo Points below the line: not resource limited, so the pool neither fires nor stops the scan", () => {
    const outcome = queryBehindTheCount({
      enemies: 1,
      comboPoints: knownNumber(3),
      energy: knownNumber(30),
      observed: SHRED,
    });
    expect(outcome.result.kind).toBe("ROTATIONAL_GCD_SELECTED");
    if (outcome.result.kind === "ROTATIONAL_GCD_SELECTED") {
      expect(outcome.result.actionToken).toBe("shred");
    }
  });

  it("an unobserved Energy is never read as zero, so the Bite is neither selected nor pooled on", () => {
    const outcome = queryBehindTheCount({
      enemies: 1,
      comboPoints: knownNumber(5),
      energy: unknownNumber("STATE_NOT_ESTABLISHED"),
      observed: FEROCIOUS_BITE,
    });
    expect(outcome.result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    expect(outcome.result.kind === "ROTATIONAL_GCD_SELECTED").toBe(false);
  });

  it("unobserved Combo Points are never read as a number", () => {
    const outcome = queryBehindTheCount({
      enemies: 1,
      comboPoints: unknownNumber("STATE_NOT_ESTABLISHED"),
      energy: knownNumber(60),
      observed: SHRED,
    });
    expect(outcome.result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
  });

  it("two enemies never read the single-target finisher", () => {
    const outcome = queryBehindTheCount({
      enemies: 2,
      comboPoints: knownNumber(5),
      energy: knownNumber(30),
      observed: FEROCIOUS_BITE,
    });
    expect(
      outcome.result.kind === "ROTATIONAL_GCD_UNKNOWN" && outcome.result.blocker === "APL_WAIT_SELECTED",
    ).toBe(false);
  });
});

describe("form state", () => {
  const SHRED_AT_3S: readonly Timeline[] = [{ t: 3000, ability: SHRED, energy: 90 }];

  it("in combat, the list reads buff.cat_form on one line only, the line the own-cast proof is about", () => {
    const readers = authority().actions.filter(
      (action) => action.listName !== "precombat" && (action.conditionRaw ?? "").includes("buff.cat_form"),
    );
    expect(readers.map((action) => `${action.listName}[${String(action.priorityOrdinal)}]`)).toEqual([
      "default[1]",
    ]);
    expect(readers[0]?.conditionRaw).toBe("!buff.cat_form.up&!talent.fluid_form");
  });

  it("no transition and a cat ability: up, on that proof, so the line closes with Fluid Form unresolved", () => {
    const binding = auraOf(aurasAtLast(BERSERK_BUILD, SHRED_AT_3S), "cat_form");
    expect(binding).toMatchObject({ state: "BOUND", up: true, proof: "OWN_CAT_FORM_CAST" });
  });

  it("no transition and no cat ability: unbound, never caster form and never Cat Form", () => {
    const binding = auraOf(aurasAtLast(BERSERK_BUILD, [{ t: 3000, ability: CAT_FORM }]), "cat_form");
    expect(binding).toMatchObject({ state: "UNBOUND", reason: "AURA_STATE_UNKNOWN" });
  });

  it("every harmful token is a stance-restricted cat ability, and Cat Form itself is not one", () => {
    expect([...FERAL_HARMFUL_TOKENS].sort()).toEqual(
      [
        "rake",
        "rip",
        "shred",
        "ferocious_bite",
        "swipe_cat",
        "primal_wrath",
        "moonfire_cat",
        "feral_frenzy",
        "frantic_frenzy",
        "chomp",
      ].sort(),
    );
    expect(FERAL_HARMFUL_TOKENS).not.toContain("cat_form");
    expect(FERAL_HARMFUL_TOKENS).not.toContain("tigers_fury");
  });

  it("an observed removal is never overridden by a later cat ability", () => {
    const binding = auraOf(
      aurasAtLast(BERSERK_BUILD, [
        { t: 2000, aura: CAT_FORM_BUFF_SPELL_ID, op: "REMOVED" },
        { t: 3000, ability: SHRED, energy: 90 },
      ]),
      "cat_form",
    );
    expect(binding).toMatchObject({ state: "BOUND", up: false, proof: "OBSERVED" });
  });

  it("a Cat Form press reads the state from before its own application", () => {
    const binding = auraOf(
      aurasAtLast(BERSERK_BUILD, [
        { t: 2000, aura: CAT_FORM_BUFF_SPELL_ID, op: "REMOVED" },
        { t: 5000, aura: CAT_FORM_BUFF_SPELL_ID, op: "APPLIED" },
        { t: 5001, ability: CAT_FORM },
      ]),
      "cat_form",
    );
    expect(binding).toMatchObject({ state: "BOUND", up: false, proof: "OBSERVED" });
  });

  it("another cast within the skew of a form edge proves nothing", () => {
    const binding = auraOf(
      aurasAtLast(BERSERK_BUILD, [
        { t: 2000, aura: CAT_FORM_BUFF_SPELL_ID, op: "APPLIED" },
        { t: 2001, ability: SHRED, energy: 90 },
      ]),
      "cat_form",
    );
    expect(binding).toMatchObject({ state: "UNBOUND", reason: "AURA_EDGE_WITHIN_SKEW" });
  });

  it("out of Cat Form, without Fluid Form proven, the Cat Form line stays open rather than false or true", () => {
    const analysis = analyzed(BERSERK_BUILD, [
      { t: 2000, ability: SHRED, energy: 90 },
      { t: 3000, aura: CAT_FORM_BUFF_SPELL_ID, op: "REMOVED" },
      { t: 8000, ability: CAT_FORM },
    ]);
    expect(analysis.comparisons[1]?.outcome).toBe("UNKNOWN");
    expect(analysis.resolved[1]?.selection.undecidedCandidates.map((c) => c.actionToken)).toContain(
      "cat_form",
    );
  });
});

describe("stealth state", () => {
  it("before any harmful cast, a missing transition stays unbound: a pull in Prowl produces no event", () => {
    const bindings = aurasAtLast(BERSERK_BUILD, [{ t: 2000, ability: SHRED, energy: 90 }]);
    expect(auraOf(bindings, "prowl")).toMatchObject({ state: "UNBOUND", reason: "AURA_STATE_UNKNOWN" });
    expect(auraOf(bindings, "shadowmeld")).toMatchObject({ state: "UNBOUND", reason: "AURA_STATE_UNKNOWN" });
  });

  it("after a harmful cast, the same silence is a proof: that cast broke stealth", () => {
    const bindings = aurasAtLast(BERSERK_BUILD, [
      { t: 2000, ability: SHRED, energy: 90 },
      { t: 3000, ability: SHRED, energy: 90 },
    ]);
    expect(auraOf(bindings, "prowl")).toMatchObject({ up: false, proof: "BROKEN_BY_OWN_ACTION" });
    expect(auraOf(bindings, "shadowmeld")).toMatchObject({ up: false, proof: "BROKEN_BY_OWN_ACTION" });
  });

  it("a harmful cast in the same millisecond orders nothing, so it proves nothing", () => {
    const bindings = aurasAtLast(BERSERK_BUILD, [
      { t: 2000, ability: RIP, energy: 90, cp: 5 },
      { t: 2000, ability: SHRED, energy: 90 },
    ]);
    expect(auraOf(bindings, "prowl").state).toBe("UNBOUND");
  });

  it("an application after that cast is what M4 answers: stealth is up again", () => {
    const bindings = aurasAtLast(BERSERK_BUILD, [
      { t: 2000, ability: SHRED, energy: 90 },
      { t: 3000, aura: SHADOWMELD_BUFF_SPELL_ID, op: "APPLIED" },
      { t: 4000, ability: RAKE, energy: 90 },
    ]);
    expect(auraOf(bindings, "shadowmeld")).toMatchObject({ up: true, proof: "OBSERVED" });
  });

  it("Rake's own removal of Prowl is read from before the removal", () => {
    const bindings = aurasAtLast(BERSERK_BUILD, [
      { t: 2000, aura: PROWL_BUFF_SPELL_ID, op: "APPLIED" },
      { t: 5000, aura: PROWL_BUFF_SPELL_ID, op: "REMOVED" },
      { t: 5001, ability: RAKE, energy: 90 },
    ]);
    expect(auraOf(bindings, "prowl")).toMatchObject({ up: true, proof: "OBSERVED" });
  });
});

describe("buff.bs_inc is the build's alias", () => {
  it("Incarnation's buff when taken, Berserk's when proven not, and no answer while unresolved", () => {
    expect(feralBsIncAuraFor("SELECTED")?.abilityGameId).toBe(INCARNATION_BUFF_SPELL_ID);
    expect(feralBsIncAuraFor("NOT_SELECTED")?.abilityGameId).toBe(BERSERK_BUFF_SPELL_ID);
    expect(feralBsIncAuraFor("UNKNOWN")).toBeNull();
    expect(feralBsIncAuraFor(undefined)).toBeNull();
  });

  it("an unresolved node leaves it unbound", () => {
    const binding = auraOf(
      aurasAtLast(UNRESOLVED_BUILD, [{ t: 2000, ability: SHRED, energy: 90 }]),
      "bs_inc",
    );
    expect(binding).toMatchObject({ state: "UNBOUND", reason: "BUILD_NOT_RESOLVED" });
  });

  it("the other buff's transitions say nothing about it", () => {
    const binding = auraOf(
      aurasAtLast(BERSERK_BUILD, [
        { t: 2000, aura: INCARNATION_BUFF_SPELL_ID, op: "APPLIED" },
        { t: 9000, ability: SHRED, energy: 90 },
      ]),
      "bs_inc",
    );
    expect(binding.state).toBe("UNBOUND");
  });

  it("Apex's talent absent from the tree stays unbound: a lone node is not proven absent", () => {
    const binding = auraOf(
      aurasAtLast(BERSERK_BUILD, [{ t: 2000, ability: SHRED, energy: 90 }]),
      "apex_predators_craving",
    );
    expect(binding).toMatchObject({ abilityGameId: APEX_PREDATORS_CRAVING_BUFF_SPELL_ID });
    expect(binding.state).toBe("UNBOUND");
  });
});

describe("Prowl's own guard", () => {
  function readiness(
    tree: readonly Entry[],
    timeline: readonly Timeline[],
    decisionMs: number,
    over: { readonly coverage?: "PARTIAL" } = {},
  ): ProwlReadiness {
    const state = stateWith(tree, timeline);
    const talents = Object.fromEntries(
      feralTalents.talents.map((talent) => [talent.simcName, resolveFeralDruidTalent(tree, talent.simcName)]),
    );
    const facts = feralCastFactsFrom(
      state,
      SOURCE,
      new Map([
        [SHRED, "shred"],
        [RAKE, "rake"],
      ]),
    );
    return prowlReadinessAt({
      state:
        over.coverage === undefined
          ? state
          : ({
              ...state,
              fight: {
                ...state.fight,
                completeness: {
                  ...state.fight.completeness,
                  categories: {
                    ...state.fight.completeness.categories,
                    CASTS: {
                      ...state.fight.completeness.categories.CASTS,
                      coverage: { state: "PARTIAL" },
                    },
                  },
                },
              },
            } as typeof state),
      facts,
      decisionMs,
      incarnation: talents["incarnation_cat"],
      incarnationProvenAbsent: talents["incarnation_cat"]?.selection === "NOT_SELECTED",
    });
  }
  const ENGAGED: readonly Timeline[] = [{ t: 2000, ability: SHRED, energy: 90 }];

  it("no earlier harmful cast: never proven, so the first decision of a pull stays open", () => {
    expect(readiness(BERSERK_BUILD, ENGAGED, 2000)).toEqual({
      state: "NOT_ESTABLISHED",
      reason: "NOT_ENGAGED",
    });
    expect(
      engagedBefore(feralCastFactsFrom(stateWith(BERSERK_BUILD, ENGAGED), SOURCE, new Map()), 3000),
    ).toBe(false);
  });

  it("Incarnation proven not taken: not ready once in combat", () => {
    expect(readiness(BERSERK_BUILD, ENGAGED, 3000).state).toBe("NOT_READY");
  });

  it("an unresolved Incarnation node proves nothing", () => {
    expect(readiness(UNRESOLVED_BUILD, ENGAGED, 3000)).toEqual({
      state: "NOT_ESTABLISHED",
      reason: "INCARNATION_NOT_RESOLVED",
    });
  });

  const OPEN = { state: "NOT_ESTABLISHED", reason: "INCARNATION_PROWL_MAY_BE_AVAILABLE" };

  it("Incarnation taken and no press in the fight proves nothing: a press before the pull leaves no event", () => {
    expect(readiness(INCARNATION_BUILD, ENGAGED, 3000)).toEqual(OPEN);
    expect(readiness(INCARNATION_BUILD, ENGAGED, 3000, { coverage: "PARTIAL" })).toEqual({
      state: "NOT_ESTABLISHED",
      reason: "CAST_COVERAGE_NOT_COMPLETE",
    });
  });

  it("a Prowl with no press observed spends whatever a press before the pull left", () => {
    const timeline = [...ENGAGED, { t: 3000, ability: PROWL_CAST }];
    expect(readiness(INCARNATION_BUILD, timeline, 4000).state).toBe("NOT_READY");
    expect(readiness(INCARNATION_BUILD, timeline, 3000)).toEqual(OPEN);
  });

  it("a press raises a buff with no duration, so it stays open for the rest of the fight", () => {
    const timeline = [...ENGAGED, { t: 3000, ability: INCARNATION_CAST }];
    expect(readiness(INCARNATION_BUILD, timeline, 3000)).toEqual(OPEN);
    expect(readiness(INCARNATION_BUILD, timeline, 500000)).toEqual(OPEN);
  });

  it("a Prowl after the press spends it, and one in the decision's own millisecond orders nothing", () => {
    const timeline = [...ENGAGED, { t: 3000, ability: INCARNATION_CAST }, { t: 4000, ability: PROWL_CAST }];
    expect(readiness(INCARNATION_BUILD, timeline, 5000).state).toBe("NOT_READY");
    expect(readiness(INCARNATION_BUILD, timeline, 4000).state).toBe("NOT_ESTABLISHED");
  });

  it("a Prowl before the last press spends nothing", () => {
    const timeline = [...ENGAGED, { t: 3000, ability: PROWL_CAST }, { t: 4000, ability: INCARNATION_CAST }];
    expect(readiness(INCARNATION_BUILD, timeline, 5000)).toEqual(OPEN);
  });

  const IDENTITY = { state: "NOT_ESTABLISHED", reason: "CAST_IDENTITY_NOT_ESTABLISHED" };

  it("an Incarnation cast with no source could be this actor's press, even after a Prowl that looks like it spent one", () => {
    const timeline: readonly Timeline[] = [
      ...ENGAGED,
      { t: 3000, ability: INCARNATION_CAST },
      { t: 4000, ability: PROWL_CAST },
      { t: 4500, ability: INCARNATION_CAST, noSource: true },
    ];
    expect(readiness(INCARNATION_BUILD, timeline, 4400).state).toBe("NOT_READY");
    expect(readiness(INCARNATION_BUILD, timeline, 5000)).toEqual(IDENTITY);
  });

  it("a cast with no ability id, the actor's or no one's, could be a press", () => {
    const base = [...ENGAGED, { t: 3000, ability: PROWL_CAST }];
    expect(readiness(INCARNATION_BUILD, [...base, { t: 3500, ability: null }], 4000)).toEqual(IDENTITY);
    expect(readiness(INCARNATION_BUILD, [...base, { t: 3500, ability: null, noSource: true }], 4000)).toEqual(
      IDENTITY,
    );
  });

  it("a cast with no source is never this actor's Prowl or harmful cast, and another's press is not its own", () => {
    const noProwl: readonly Timeline[] = [...ENGAGED, { t: 3000, ability: PROWL_CAST, noSource: true }];
    expect(readiness(INCARNATION_BUILD, noProwl, 4000)).toEqual(OPEN);
    const facts = feralCastFactsFrom(
      stateWith(BERSERK_BUILD, [{ t: 2000, ability: SHRED, noSource: true }]),
      SOURCE,
      new Map([[SHRED, "shred"]]),
    );
    expect(engagedBefore(facts, 3000)).toBe(false);
  });

  it("is a resource-independent unusable reason only where proven, and never a usable claim", () => {
    const closed = resolveFeralDruidUsability({
      state: initialFeralDruidState(),
      action: lineAt("default", 0),
      observedAbilityGameId: SHRED,
      prowl: MET_GATES,
      maxEnergy: FACTS_AT(50),
    });
    expect(closed).toMatchObject({ kind: "PROVEN_UNUSABLE", reason: "RESTEALTH_NOT_PERMITTED_IN_COMBAT" });
    const open = resolveFeralDruidUsability({
      state: initialFeralDruidState(),
      action: lineAt("default", 0),
      observedAbilityGameId: SHRED,
      prowl: { state: "NOT_ESTABLISHED", reason: "NOT_ENGAGED" },
      maxEnergy: FACTS_AT(50),
    });
    expect(open.kind).toBe("UNKNOWN");
  });
});

describe("the wire's ids", () => {
  it("melee swings, off-GCD presses, a potion and a hardcast Regrowth are excluded, each under its own reason", () => {
    const analysis = analyzed(BERSERK_BUILD, [
      { t: 2000, ability: 1, melee: true },
      { t: 2100, ability: TIGERS_FURY },
      { t: 2200, ability: POTION },
      { t: 2300, ability: REGROWTH, energy: 90 },
      { t: 2400, ability: SHRED, energy: 90 },
    ]);
    expect(analysis.excluded.map((cast) => cast.reason)).toEqual([
      "MELEE_SWING",
      "NON_GCD_ACTION",
      "EXECUTION_LANE_NOT_ESTABLISHED",
      "OUTSIDE_FIRST_SLICE",
    ]);
    expect(analysis.coverage.eligibleDecisions).toBe(1);
  });

  it("Shadowmeld is a racial: its press is no decision, and its list lines cannot preempt a class action", () => {
    const analysis = analyzed(BERSERK_BUILD, [{ t: 2000, ability: SHADOWMELD_CAST }]);
    expect(analysis.coverage.eligibleDecisions).toBe(0);
    const line = lineAt("builder", 1);
    expect(line.actionToken).toBe("shadowmeld");
    expect(feralDruidNonDomainApplicabilityFor(line)).toMatchObject({
      kind: "NOT_APPLICABLE",
      reason: "OUTSIDE_SUPPORTED_DECISION_DOMAIN",
    });
    expect(nonDomainCategoryOf("berserking")).toBe("RACIAL_ACTION");
  });

  it("the lanes are the pinned records'", () => {
    expect(feralDruidExecutionLaneForAbility(SHRED)).toBe("GCD_CONSUMING");
    expect(feralDruidExecutionLaneForAbility(CAT_FORM)).toBe("GCD_CONSUMING");
    expect(feralDruidExecutionLaneForAbility(TIGERS_FURY)).toBe("NON_GCD");
    expect(feralDruidExecutionLaneForAbility(INCARNATION_CAST)).toBe("NON_GCD");
    expect(feralDruidExecutionLaneForToken("prowl")).toBe("NON_GCD");
    expect(feralDruidExecutionLaneForToken("auto_attack")).toBe("NON_GCD");
  });

  it("berserk is one token over two actions, and a talent's own row is not the action", () => {
    expect(feralDruidTokenBinding("berserk")).toMatchObject({
      kind: "KNOWN_SET",
      abilityGameIds: [102543, 106951],
    });
    expect(feralDruidTokenBinding("moonfire_cat")).toMatchObject({
      kind: "KNOWN_ONE",
      abilityGameId: 155625,
    });
    expect(feralDruidTokenBinding("swipe_cat")).toMatchObject({ kind: "KNOWN_ONE", abilityGameId: 106785 });
  });

  it("only auto_attack has a transition contract: Prowl, Tiger's Fury and Berserk write what the list reads", () => {
    expect(feralDruidTransitionContractFor("auto_attack")).not.toBeNull();
    for (const token of ["prowl", "tigers_fury", "berserk", "shadowmeld"]) {
      expect(feralDruidTransitionContractFor(token), token).toBeNull();
    }
  });
});

describe("the build facts", () => {
  it("reads Energy and Combo Points from the cast's own observation, and never zero without one", () => {
    const analysis = analyzed(BERSERK_BUILD, [
      { t: 2000, ability: RIP, energy: 80, cp: 5 },
      { t: 3000, ability: SHRED },
    ]);
    expect(analysis.resolved[0]?.diagnostics.energy).toEqual(knownNumber(80));
    expect(analysis.resolved[1]?.diagnostics.energy.state).toBe("UNKNOWN_NUMBER");
  });

  it("a choice node's sibling proves the other not taken, and a lone node absent from the tree stays UNKNOWN", () => {
    expect(resolveFeralDruidTalent(BERSERK_BUILD, "incarnation_cat").selection).toBe("NOT_SELECTED");
    expect(resolveFeralDruidTalent(INCARNATION_BUILD, "convoke_the_spirits").selection).toBe("NOT_SELECTED");
    expect(resolveFeralDruidTalent(BERSERK_BUILD, "fluid_form").selection).toBe("UNKNOWN");
    expect(resolveFeralDruidTalent(BERSERK_BUILD, "apex_predators_craving").selection).toBe("UNKNOWN");
  });

  it("each hero tree proves only the other tree's talents absent", () => {
    const heroTree = resolveFeralDruidHeroTree(BERSERK_BUILD);
    expect(heroTree).toMatchObject({ state: "RESOLVED", simcName: "wildstalker" });
    expect(feralDruidTalentsDisprovedByHeroTree(heroTree)).toEqual(["ravage", "wildpower_surge"]);
    expect(feralDruidTalentsDisprovedByHeroTree({ state: "UNKNOWN" })).toEqual([]);
  });
});

describe("applicability", () => {
  const factsOf = (tree: readonly Entry[]) => {
    const talents = Object.fromEntries(
      feralTalents.talents.map((talent) => [talent.simcName, resolveFeralDruidTalent(tree, talent.simcName)]),
    );
    const talentsProvenAbsent = new Set<string>();
    for (const [name, talent] of Object.entries(talents)) {
      if (talent.selection === "NOT_SELECTED") talentsProvenAbsent.add(name);
    }
    return { talents, talentsProvenAbsent };
  };
  const berserkLine = () => lineAt("cooldown", 10);

  it("berserk stands on either talent, closes only with both proven absent, and stays open otherwise", () => {
    expect(berserkLine().actionToken).toBe("berserk");
    expect(resolveFeralDruidApplicability(factsOf(BERSERK_BUILD), berserkLine()).kind).toBe("APPLICABLE");
    expect(resolveFeralDruidApplicability(factsOf(UNRESOLVED_BUILD), berserkLine()).kind).toBe("UNKNOWN");
    const none = factsOf(BERSERK_BUILD);
    expect(
      resolveFeralDruidApplicability(
        {
          talents: {},
          talentsProvenAbsent: new Set([...none.talentsProvenAbsent, "incarnation_cat", "berserk_cat"]),
        },
        berserkLine(),
      ).kind,
    ).toBe("NOT_APPLICABLE");
  });

  it("a choice-node sibling closes an action it builds, and an unknown talent never does", () => {
    const chomp = lineAt("default", 6);
    expect(chomp.actionToken).toBe("chomp");
    expect(resolveFeralDruidApplicability(factsOf(BERSERK_BUILD), chomp).kind).toBe("NOT_APPLICABLE");
    expect(resolveFeralDruidApplicability(factsOf(UNRESOLVED_BUILD), chomp).kind).toBe("UNKNOWN");
  });

  it("the baseline spells have no talent guard", () => {
    for (const [list, ordinal] of [
      ["default", 1],
      ["builder", 5],
    ] as const) {
      expect(resolveFeralDruidApplicability(factsOf(UNRESOLVED_BUILD), lineAt(list, ordinal)).kind).toBe(
        "APPLICABLE",
      );
    }
  });
});
