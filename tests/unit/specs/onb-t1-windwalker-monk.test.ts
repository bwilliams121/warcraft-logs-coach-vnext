/**
 * ONB-T1: Windwalker Monk, the Cohort T representative.
 *
 * No decision resolves on real evidence, so the mandatory negatives are the centre of it: an open enemy count never reads as
 * single target, a chosen enemy nobody identified never answers a line, a missing talent never reads as false, Chi never reads as
 * zero, a Combo Strikes history nobody reconstructed never reads either way, a racial never preempts a class action, and the fight's
 * real end never answers a prediction.
 *
 * Synthetic on purpose. The real replay is offline: b1PmaKrd6CDfzngc fight 48 actor 13 is uncommitted (agent/architecture.md "ONB-T1").
 */

import { describe, expect, it } from "vitest";

import { resolveHeroTree } from "../../../scripts/authority/extract-simc-talents.mjs";
import windwalkerTalents from "../../../src/data/game/monk-windwalker-talents.json";
import artifact from "../../../src/simc/data/monk-windwalker.apl.json";
import {
  pinnedWindwalkerMonkGcdSemantics,
  windwalkerMonkBaseGcdMsForAbility,
  windwalkerMonkExecutionLaneForAbility,
  windwalkerMonkExecutionLaneForToken,
  windwalkerMonkTokenBinding,
  windwalkerMonkTokenByAbilityId,
} from "../../../src/data/game/monk-windwalker-gcd-semantics.js";
import {
  pinnedWindwalkerMonkTalents,
  resolveWindwalkerMonkHeroTree,
  resolveWindwalkerMonkTalent,
} from "../../../src/data/game/monk-windwalker-talents.js";
import { windwalkerMonkTransitionContractFor } from "../../../src/data/game/monk-windwalker-transition-authority.js";
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
import { targetIfVerdict } from "../../../src/simc/target-if.js";
import {
  resolveWindwalkerMonkApplicability,
  TALENT_BUILT_TOKENS,
} from "../../../src/specs/monk/windwalker/action-profile.js";
import { WINDWALKER_MONK_CAPABILITIES } from "../../../src/specs/monk/windwalker/authority-bindings.js";
import { windwalkerMonkNonDomainApplicabilityFor } from "../../../src/specs/monk/windwalker/domain-boundary.js";
import { windwalkerMonkFirstGcdSelectionAt } from "../../../src/specs/monk/windwalker/first-gcd-adapter.js";
import { analyzeObservedWindwalkerMonkDecisions } from "../../../src/specs/monk/windwalker/observed-analysis.js";
import { pinnedWindwalkerMonkAuthority } from "../../../src/specs/monk/windwalker/pinned-authority.js";
import {
  resolveWindwalkerMonkAtoms,
  windwalkerMonkTalentsDisprovedByHeroTree,
  WINDWALKER_MONK_HERO_TREE_TALENTS,
} from "../../../src/specs/monk/windwalker/resolver.js";
import { WINDWALKER_MONK_ATOM_VOCABULARY } from "../../../src/specs/monk/windwalker/vocabulary.js";
import {
  attachedResources,
  castEvent,
  classResource,
  FIGHT_START_MS,
  syntheticFight,
} from "../../support/synthetic-fight.js";

const SOURCE = 7;
const BOSS = 900;

const TIGER_PALM = 100780;
const BLACKOUT_KICK = 100784;
const RISING_SUN_KICK = 107428;
const FISTS_OF_FURY = 113656;
const SPINNING_CRANE_KICK = 101546;
const WHIRLING_DRAGON_PUNCH = 152175;
const RUSHING_WIND_KICK = 467307;
const TOUCH_OF_DEATH = 322109;
const TOUCH_OF_KARMA = 122470;
const ZENITH = 1249625;
const CHI_EXPLOSION = 393056;
const ROLL = 109132;

type Entry = { readonly id: number; readonly nodeId: number };

function entries(names: readonly string[]): readonly Entry[] {
  return names.map((name) => {
    const row = windwalkerTalents.talents.find((candidate) => candidate.simcName === name);
    if (row === undefined) throw new Error(`no pinned talent ${name}`);
    return { id: row.traitEntryId, nodeId: row.traitNodeId };
  });
}

function heroEntry(simcName: string, displayName: string): Entry {
  const tree = windwalkerTalents.heroTrees.find((candidate) => candidate.simcName === simcName);
  const row = tree?.entries.find((candidate) => candidate.displayNameEn === displayName);
  if (row === undefined) throw new Error(`no ${displayName} in ${simcName}`);
  return { id: row.traitEntryId, nodeId: row.traitNodeId };
}

/** The shape of the one retained subject: the talents it holds, on Shado-Pan. */
const SPEC_TALENTS = entries([
  "ascension",
  "energy_burst",
  "fists_of_fury",
  "revolving_whirl",
  "rising_sun_kick",
  "rushing_wind_kick",
  "sequenced_strikes",
  "spiritual_focus",
  "whirling_dragon_punch",
  "zenith",
  "zenith_stomp",
]);
const SHADO_PAN: readonly Entry[] = [...SPEC_TALENTS, heroEntry("shadopan", "Flurry Strikes")];
const CONDUIT: readonly Entry[] = [
  ...SPEC_TALENTS,
  heroEntry("conduit_of_the_celestials", "Celestial Conduit"),
];

function authority(): AplAuthority {
  const loaded = pinnedWindwalkerMonkAuthority();
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

interface Step {
  readonly t: number;
  readonly ability: number;
  readonly phase?: "BEGIN" | "COMPLETE";
  readonly energy?: number;
  readonly chi?: number;
  readonly melee?: boolean;
}

function fightWith(tree: readonly Entry[] | null, steps: readonly Step[]) {
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
  steps.forEach((step, index) => {
    const pools = [
      ...(step.energy === undefined ? [] : [classResource(3, step.energy, { max: 150, cost: 50 })]),
      ...(step.chi === undefined ? [] : [classResource(12, step.chi, { max: 6, cost: 2 })]),
    ];
    const event = castEvent({
      ordinal: index + 1,
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
    events.push(step.melee === true ? ({ ...event, isMelee: true } as CombatEvent) : event);
  });
  return createCombatState(syntheticFight({ events, observedCategories: ["CASTS", "RESOURCES"] }));
}

function analyze(tree: readonly Entry[] | null, steps: readonly Step[]) {
  return analyzeObservedWindwalkerMonkDecisions({
    state: fightWith(tree, steps),
    actorId: SOURCE,
    specId: "monk/windwalker",
    targetActorId: null,
  });
}

function analyzed(tree: readonly Entry[] | null, steps: readonly Step[]) {
  const analysis = analyze(tree, steps);
  if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
  return analysis;
}

const NO_ENERGY = unknownNumber("STATE_NOT_ESTABLISHED");

/** A query with values this slice never has. Only a test can look behind the list's first refusals this way. */
function queryGiven(input: {
  readonly tree: readonly Entry[];
  readonly magnitudes?: Readonly<Record<string, number>>;
  readonly observed?: number;
}) {
  const talents = Object.fromEntries(
    windwalkerTalents.talents.map((talent) => [
      talent.simcName,
      resolveWindwalkerMonkTalent(input.tree, talent.simcName),
    ]),
  );
  const talentsProvenAbsent = new Set<string>(
    windwalkerMonkTalentsDisprovedByHeroTree(resolveWindwalkerMonkHeroTree(input.tree)),
  );
  for (const [name, talent] of Object.entries(talents)) {
    if (talent.selection === "NOT_SELECTED") talentsProvenAbsent.add(name);
  }
  const resolution = resolveWindwalkerMonkAtoms({ energy: NO_ENERGY });
  const magnitudes = input.magnitudes ?? {};
  const bound = resolution.specAtoms.bound.map((binding) => {
    const given = magnitudes[binding.key];
    return given === undefined
      ? binding
      : { ...binding, value: { kind: "MAGNITUDE" as const, binding: knownNumber(given) } };
  });
  const knownTalents = [
    ...Object.entries(talents).flatMap(([name, talent]) =>
      talent.selection === "SELECTED" ? [{ name, taken: true }] : [],
    ),
    ...[...talentsProvenAbsent].map((name) => ({ name, taken: false })),
  ];
  const bindings: AtomBindings = {
    comboPoints: unknownNumber("STATE_NOT_MODELLED"),
    comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
    energyPct: unknownNumber("STATE_NOT_MODELLED"),
    knownBuffs: [],
    knownTalents,
    knownCooldownRemainsSeconds: [],
    specAtoms: { ...resolution.specAtoms, bound },
  };
  return {
    bindings,
    ...windwalkerMonkFirstGcdSelectionAt({
      authority: authority(),
      bindings,
      buildFacts: { talents, talentsProvenAbsent },
      observedAbilityGameId: input.observed ?? TIGER_PALM,
    }),
  };
}

function evaluate(condition: string) {
  const parsed = parseSimcExpression(condition, WINDWALKER_MONK_ATOM_VOCABULARY);
  if (!parsed.ok) throw new Error(parsed.fragment);
  const resolution = resolveWindwalkerMonkAtoms({ energy: NO_ENERGY });
  return evaluateSimcExpression(parsed.ast, condition, {
    comboPoints: unknownNumber("STATE_NOT_MODELLED"),
    comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
    energyPct: unknownNumber("STATE_NOT_MODELLED"),
    knownBuffs: [],
    knownTalents: [],
    knownCooldownRemainsSeconds: [],
    specAtoms: resolution.specAtoms,
  });
}

describe("the row", () => {
  it("is reachable by the internal lookup only, and a public identity is refused", () => {
    const row = internalAnalyzerForSpec("monk/windwalker", PRODUCTION_CATALOG) as AnalyzerRegistration;
    expect(row.analyzerId).toBe("monk-windwalker-observed-decisions");
    expect(row.exposure).toBe("INTERNAL_ONLY");
    expect(analyzerForSpec("monk/windwalker", PRODUCTION_CATALOG)).toBeNull();
    expect(resolveSpecIdentity({ className: "Monk", specName: "Windwalker" }).ok).toBe(false);
  });

  it("refuses another specialization before reading anything of its own", () => {
    expect(
      analyzeObservedWindwalkerMonkDecisions({
        state: fightWith(null, []),
        actorId: SOURCE,
        specId: "monk/brewmaster" as never,
        targetActorId: null,
      }).status,
    ).toBe("SPEC_NOT_SUPPORTED");
  });

  it("a capture with no combatant info refuses as PROFILE_NOT_RESOLVED, never judges", () => {
    expect(analyze(null, [{ t: 2000, ability: TIGER_PALM }]).status).toBe("PROFILE_NOT_RESOLVED");
  });

  it("declares offensive authority only, and reports every other domain without it", () => {
    const byDomain = new Map(analyzed(SHADO_PAN, []).domains.map((row) => [row.domain, row.resolution]));
    expect(byDomain.get("OFFENSIVE_ROTATION")).toBe("AUTHORITY_AVAILABLE");
    expect(byDomain.get("INTERRUPT")).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
    expect(byDomain.get("DEFENSIVE_COOLDOWN")).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
    expect(byDomain.get("RESOURCE_SPENDING")).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
  });

  it("declares the one resource it consumes, so a request deriving its ingestion cannot under-fetch it", () => {
    const offensive = WINDWALKER_MONK_CAPABILITIES.find((row) => row.domain === "OFFENSIVE_ROTATION");
    expect(offensive?.requirements.resources).toEqual(["ENERGY"]);
    expect(offensive?.requirements.evidenceCategories).toEqual(["CASTS", "RESOURCES", "COMBATANT_INFO"]);
  });
});

describe("the decision population", () => {
  it("classifies it: a swing, an off-GCD press and a spell with no record are excluded, never judged", () => {
    const analysis = analyzed(SHADO_PAN, [
      { t: 1000, ability: 1, melee: true },
      { t: 1500, ability: ZENITH },
      { t: 2000, ability: TOUCH_OF_KARMA },
      { t: 2500, ability: CHI_EXPLOSION },
      { t: 3000, ability: ROLL },
      { t: 3500, ability: TIGER_PALM, energy: 100 },
    ]);
    expect(analysis.coverage.eligibleDecisions).toBe(1);
    expect(analysis.coverage.exclusions).toEqual(
      expect.arrayContaining([
        { key: "MELEE_SWING", count: 1 },
        { key: "NON_GCD_ACTION", count: 2 },
        { key: "EXECUTION_LANE_NOT_ESTABLISHED", count: 2 },
      ]),
    );
  });

  it("a channel is a decision at the cast that started it, and a begin alone is no decision", () => {
    const channel = analyzed(SHADO_PAN, [{ t: 2000, ability: FISTS_OF_FURY, chi: 4 }]);
    expect(channel.comparisons).toHaveLength(1);
    expect(channel.comparisons[0]?.decision.observedToken).toBe("fists_of_fury");
    const begin = analyzed(SHADO_PAN, [{ t: 2000, ability: FISTS_OF_FURY, phase: "BEGIN" }]);
    expect(begin.comparisons).toHaveLength(0);
  });
});

describe("no decision resolves", () => {
  it.each([
    ["shadopan", SHADO_PAN],
    ["conduit_of_the_celestials", CONDUIT],
    ["no hero entry at all", SPEC_TALENTS],
  ])("%s: every decision stays UNKNOWN, with its reason attached", (_name, tree) => {
    const analysis = analyzed(tree, [
      { t: 2000, ability: FISTS_OF_FURY, chi: 4 },
      { t: 3000, ability: TIGER_PALM, energy: 100 },
      { t: 4000, ability: RISING_SUN_KICK, chi: 3 },
      { t: 5000, ability: BLACKOUT_KICK, chi: 2 },
      { t: 6000, ability: SPINNING_CRANE_KICK, chi: 2 },
      { t: 7000, ability: WHIRLING_DRAGON_PUNCH },
      { t: 8000, ability: RUSHING_WIND_KICK },
      { t: 9000, ability: TOUCH_OF_DEATH },
    ]);
    const { coverage } = analysis;
    expect(coverage.eligibleDecisions).toBe(8);
    expect(coverage.match).toBe(0);
    expect(coverage.rejected).toBe(0);
    expect(coverage.unknown).toBe(8);
    expect(coverage.resolvedComparisons).toBe(0);
    expect(analysis.comparisons.every((comparison) => comparison.outcome === "UNKNOWN")).toBe(true);
  });

  it("the retained shape: the engine refuses at the swing's entry, and the scan stops on Zenith's refused target_if", () => {
    const { result, rootScan } = queryGiven({ tree: SHADO_PAN });
    expect(result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    if (result.kind !== "ROTATIONAL_GCD_UNKNOWN") throw new Error(result.kind);
    expect(`${String(result.blockedAt?.listName)}[${String(result.blockedAt?.priorityOrdinal)}]`).toBe(
      "default[0]",
    );
    expect(rootScan.undecidedCandidates.map((candidate) => candidate.at)).toEqual([
      "default[0] auto_attack",
      "default[1] touch_of_karma",
      "opener[0] tiger_palm",
      "zenith[0] zenith",
      "zenith[1] zenith",
    ]);
    expect(rootScan.stoppingPoint?.at).toBe("zenith[3] zenith");
    expect(rootScan.stoppingPoint?.atoms).toEqual(["NOT_EVALUATED:UNSUPPORTED_TARGETING"]);
  });

  it("the swing's own reading is unobserved, even for a press of a list line", () => {
    const analysis = analyzed(SHADO_PAN, [{ t: 2000, ability: TIGER_PALM, energy: 100 }]);
    expect(analysis.comparisons[0]?.outcome).toBe("UNKNOWN");
    expect(analysis.coverage.unresolvedAt.map((row) => row.key)).toEqual([
      "ONE_SCAN_BLOCKED/NO_DEFINITE_WINNER @ default[0] auto_attack",
    ]);
  });
});

describe("what a hero tree proves", () => {
  it("a build with no hero entry is carried as UNKNOWN, and proves nothing absent", () => {
    const analysis = analyzed(SPEC_TALENTS, []);
    expect(analysis.build.heroTree.state).toBe("UNKNOWN");
    for (const talents of Object.values(WINDWALKER_MONK_HERO_TREE_TALENTS)) {
      for (const talent of talents) expect(analysis.build.talentsProvenAbsent).not.toContain(talent);
    }
  });

  it("Shado-Pan proves Conduit's talents not taken, which skips big_coc; an unresolved tree never does", () => {
    const shado = analyzed(SHADO_PAN, []);
    expect(shado.build.heroTree).toMatchObject({ state: "RESOLVED", simcName: "shadopan" });
    expect(shado.build.talentsProvenAbsent).toEqual(
      expect.arrayContaining(["celestial_conduit", "invoke_xuen_the_white_tiger", "restore_balance"]),
    );
    expect(shado.build.talentsProvenAbsent).not.toContain("flurry_strikes");
    expect(
      queryGiven({ tree: SHADO_PAN }).rootScan.dispatches.find((step) => step.at === "default[9]"),
    ).toMatchObject({ calleeListName: "big_coc", outcome: "CALL_GATE_FALSE_SKIPPED" });
    expect(
      queryGiven({ tree: SPEC_TALENTS }).rootScan.dispatches.find((step) => step.at === "default[9]")
        ?.outcome,
    ).not.toBe("CALL_GATE_FALSE_SKIPPED");
  });

  it("Conduit proves Flurry Strikes not taken, and both trees at once is a contradiction that proves nothing", () => {
    const conduit = analyzed(CONDUIT, []);
    expect(conduit.build.heroTree).toMatchObject({
      state: "RESOLVED",
      simcName: "conduit_of_the_celestials",
    });
    expect(conduit.build.talentsProvenAbsent).toContain("flurry_strikes");
    const both = [...SHADO_PAN, heroEntry("conduit_of_the_celestials", "Celestial Conduit")];
    expect(resolveWindwalkerMonkHeroTree(both).state).toBe("CONTRADICTORY");
    expect(windwalkerMonkTalentsDisprovedByHeroTree(resolveWindwalkerMonkHeroTree(both))).toEqual([]);
  });

  it("the pinned table's placeholder row names no talent and proves no tree", () => {
    const conduit = windwalkerTalents.heroTrees.find((tree) => tree.simcName === "conduit_of_the_celestials");
    expect(conduit?.entries.map((entry) => entry.traitEntryId)).not.toContain(125051);
    expect(conduit?.entries.every((entry) => entry.talentSpellId > 0)).toBe(true);
    expect(resolveWindwalkerMonkHeroTree([{ id: 125051, nodeId: 101235 }]).state).toBe("UNKNOWN");
  });
});

describe("a spell-less hero-tree row", () => {
  const row = (entry: number, name: string, spell: number) => ({
    classId: 10,
    treeIndex: 3,
    idSubTree: 64,
    specIds: [269],
    traitEntryId: entry,
    traitNodeId: entry,
    displayNameEn: name,
    talentSpellId: spell,
    nodeType: 0,
  });
  const target = { classId: 10, specId: 269 };
  const rows = [row(1, "Real", 111), row(2, "0", 0)];

  it("the extractor refuses a spell-less hero row nothing declares, so a new one never vanishes", () => {
    const resolved = resolveHeroTree(rows, { simcName: "conduit", subTreeId: 64 }, target);
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.error).toContain("spell-less rows nothing declares: 2");
  });

  it("a declared one is dropped, and the rest stay", () => {
    const resolved = resolveHeroTree(
      rows,
      { simcName: "conduit", subTreeId: 64, placeholderEntryIds: [2] },
      target,
    );
    if (!resolved.ok) throw new Error(resolved.error);
    expect(resolved.heroTree.entries.map((entry) => entry.traitEntryId)).toEqual([1]);
  });

  it("a declaration naming a row with a spell, or no row, fails rather than hide a talent", () => {
    for (const id of [1, 99]) {
      const resolved = resolveHeroTree(
        rows,
        { simcName: "conduit", subTreeId: 64, placeholderEntryIds: [2, id] },
        target,
      );
      expect(resolved.ok, String(id)).toBe(false);
      if (!resolved.ok)
        expect(resolved.error).toContain("declares placeholders that are not spell-less rows");
    }
  });
});

describe("the state the list reads", () => {
  it("reads Energy from the cast's own observation, and never zero without one", () => {
    expect(
      analyzed(SHADO_PAN, [{ t: 2000, ability: TIGER_PALM, energy: 80 }]).resolved[0]?.diagnostics,
    ).toEqual({ energy: knownNumber(80) });
    expect(analyzed(SHADO_PAN, [{ t: 2000, ability: TIGER_PALM }]).resolved[0]?.diagnostics).toEqual({
      energy: NO_ENERGY,
    });
  });

  it("Energy at its maximum is not waste, and decides nothing past the stop", () => {
    const analysis = analyzed(SHADO_PAN, [{ t: 2000, ability: TIGER_PALM, energy: 150 }]);
    expect(analysis.comparisons[0]?.outcome).toBe("UNKNOWN");
    expect(analysis.resolved[0]?.diagnostics.energy).toEqual(knownNumber(150));
  });

  it("Chi has no wire contract, so a cast carrying it never answers a Chi line, and never reads as zero", () => {
    const analysis = analyzed(SHADO_PAN, [{ t: 2000, ability: FISTS_OF_FURY, chi: 4 }]);
    expect(analysis.resolved[0]?.diagnostics).toEqual({ energy: NO_ENERGY });
    expect(evaluate("chi<4").outcome).toBe("UNRESOLVED");
    expect(evaluate("chi>=0").outcome).toBe("UNRESOLVED");
    expect(evaluate("chi.max-chi>=2").outcome).toBe("UNRESOLVED");
  });

  it("a Combo Strikes history nobody reconstructed answers neither way", () => {
    expect(evaluate("combo_strike").outcome).toBe("UNRESOLVED");
    expect(evaluate("!combo_strike").outcome).toBe("UNRESOLVED");
    const declared = WINDWALKER_MONK_ATOM_VOCABULARY.lookup("combo_strike");
    expect(declared).toMatchObject({ shape: "BOOLEAN", selfAddressing: true });
    expect(
      resolveWindwalkerMonkAtoms({ energy: NO_ENERGY }).specAtoms.bound.some(
        (binding) => binding.key === "combo_strike",
      ),
    ).toBe(false);
  });

  it("the enemy count alone moves nothing: given one target, the lines above still refuse", () => {
    const { result, rootScan } = queryGiven({ tree: SHADO_PAN, magnitudes: { active_enemies: 1 } });
    expect(result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    expect(rootScan.stoppingPoint?.at).toBe("zenith[3] zenith");
  });

  it("an open enemy count never reads as single target or as many", () => {
    expect(evaluate("active_enemies=1").outcome).toBe("UNRESOLVED");
    expect(evaluate("active_enemies>1").outcome).toBe("UNRESOLVED");
    const { rootScan } = queryGiven({ tree: SHADO_PAN });
    expect(rootScan.dispatches.map((step) => step.at)).not.toContain("default[11]");
    expect(rootScan.dispatches.map((step) => step.at)).not.toContain("default[12]");
  });

  it("a real fight clock and the fight's real end never answer the list", () => {
    const row = (key: string) =>
      resolveWindwalkerMonkAtoms({ energy: NO_ENERGY }).specAtoms.bound.find((binding) => binding.key === key)
        ?.value;
    expect(row("time")).toEqual({ kind: "MAGNITUDE", binding: unknownNumber("STATE_NOT_MODELLED") });
    expect(row("energy.time_to_max")).toEqual({
      kind: "MAGNITUDE",
      binding: unknownNumber("STATE_NOT_MODELLED"),
    });
    expect(evaluate("fight_remains<=30").outcome).toBe("UNRESOLVED");
    expect(evaluate("time<2").outcome).toBe("UNRESOLVED");
  });

  it("no aura and no cooldown is read, so Zenith or a Rising Sun Kick is never read as up or as ready", () => {
    expect(evaluate("buff.zenith.up").outcome).toBe("UNRESOLVED");
    expect(evaluate("buff.combo_breaker.stack<2").outcome).toBe("UNRESOLVED");
    expect(evaluate("cooldown.rising_sun_kick.remains").outcome).toBe("UNRESOLVED");
    expect(evaluate("cooldown.zenith.full_recharge_time<30").outcome).toBe("UNRESOLVED");
  });

  it("a simulated fight style never reads as false, so no line is decided by a sim option", () => {
    expect(evaluate("fight_style.dungeonroute").outcome).toBe("UNRESOLVED");
    expect(evaluate("!fight_style.dungeonslice").outcome).toBe("UNRESOLVED");
  });
});

describe("target selection, under the ONB-S3 decision", () => {
  it("Touch of Karma's target_if chooses an enemy, and that choice alone cannot change the line", () => {
    const line = lineAt("default", 1);
    expect(line.actionStringVerbatim).toBe("touch_of_karma,target_if=max:target.time_to_die");
    const { bindings } = queryGiven({ tree: SHADO_PAN });
    expect(targetIfVerdict(line, bindings)?.kind).toBe("TARGET_SELECTION_IGNORABLE");
  });

  it("a condition reading the chosen enemy's time to die is refused for target selection, with no target domain", () => {
    const line = lineAt("zenith", 3);
    expect(line.conditionRaw).toContain("target.time_to_die>30");
    expect(line.conditionRaw).toContain("talent.flurry_strikes");
    const { bindings } = queryGiven({ tree: SHADO_PAN });
    expect(targetIfVerdict(line, bindings)).toMatchObject({
      kind: "REFUSED",
      reason: "CONDITION_TARGET_DEPENDENT",
    });
    expect(bindings.targetDomainFor).toBeUndefined();
  });

  it("a player-scoped conjunct proven false eliminates the line whichever enemy is chosen: Conduit's Zenith under Shado-Pan", () => {
    const line = lineAt("zenith", 2);
    expect(line.conditionRaw).toContain("talent.celestial_conduit");
    const shado = queryGiven({ tree: SHADO_PAN });
    expect(targetIfVerdict(line, shado.bindings)?.kind).toBe("ELIMINATED_FOR_EVERY_TARGET");
    // The same line with the tree unresolved stays refused, never eliminated.
    const open = queryGiven({ tree: SPEC_TALENTS });
    expect(targetIfVerdict(line, open.bindings)?.kind).toBe("REFUSED");
  });

  it("the stray comma in big_coc[5] changes nothing: its option and condition read as written", () => {
    const line = lineAt("big_coc", 5);
    expect(line.actionStringVerbatim.startsWith("tiger_palm,,target_if=max:target.time_to_die,if=")).toBe(
      true,
    );
    expect(line.actionToken).toBe("tiger_palm");
    expect(line.conditionRaw).toContain("combo_strike");
  });
});

describe("the list as pinned", () => {
  it("is its ten lists, with the dispatches as pinned", () => {
    expect(artifact.lists.map((list) => [list.listName, list.actions.length])).toEqual([
      ["default", 21],
      ["precombat", 3],
      ["opener", 2],
      ["trinket", 10],
      ["racials", 4],
      ["big_coc", 8],
      ["zenith", 18],
      ["default_st", 33],
      ["multitarget", 29],
      ["fallback", 4],
    ]);
    expect(artifact.provenance.livePtrPolicy).toBe("PTR_DELEGATES_TO_LIVE");
  });

  it("every in-domain line condition but the ten that read a trinket parses whole, so a refusal elsewhere is about state", () => {
    const refused: string[] = [];
    for (const action of authority().actions) {
      if (action.listName === "precombat") continue;
      if (windwalkerMonkNonDomainApplicabilityFor(action) !== null) continue;
      const raw = action.conditionRaw;
      if (raw === null) continue;
      if (!parseSimcExpression(raw, WINDWALKER_MONK_ATOM_VOCABULARY).ok) {
        refused.push(`${action.listName}[${String(action.priorityOrdinal)}]`);
      }
    }
    expect(refused).toEqual([
      "big_coc[1]",
      "zenith[4]",
      "zenith[5]",
      "zenith[6]",
      "zenith[7]",
      "zenith[12]",
      "zenith[15]",
      "zenith[16]",
      "multitarget[1]",
      "multitarget[23]",
    ]);
  });

  it("only the swing holds a contract: Touch of Karma and Zenith are off the GCD and fail closed", () => {
    expect(windwalkerMonkTransitionContractFor("auto_attack")?.baseGcdMs).toBe(0);
    expect(windwalkerMonkExecutionLaneForToken("auto_attack")).toBe("NON_GCD");
    for (const token of ["touch_of_karma", "zenith"]) {
      expect(windwalkerMonkExecutionLaneForToken(token)).toBe("NON_GCD");
      expect(windwalkerMonkTransitionContractFor(token)).toBeNull();
    }
    for (const token of [
      "blackout_kick",
      "celestial_conduit",
      "fists_of_fury",
      "invoke_xuen_the_white_tiger",
      "rising_sun_kick",
      "rushing_wind_kick",
      "slicing_winds",
      "spinning_crane_kick",
      "strike_of_the_windlord",
      "tiger_palm",
      "touch_of_death",
      "whirling_dragon_punch",
      "zenith_stomp",
    ]) {
      expect(windwalkerMonkExecutionLaneForToken(token)).toBe("GCD_CONSUMING");
    }
  });
});

describe("the talents", () => {
  it("a lone-node talent absent from the tree stays UNKNOWN, never false", () => {
    expect(resolveWindwalkerMonkTalent(SHADO_PAN, "meridian_strikes").selection).toBe("UNKNOWN");
    expect(resolveWindwalkerMonkTalent(SHADO_PAN, "zenith").selection).toBe("SELECTED");
    expect(resolveWindwalkerMonkTalent([], "zenith").selection).toBe("UNKNOWN");
  });

  it("an action built on a talent proven absent is background; an unresolved one never is", () => {
    const applicabilityOf = (token: string, absent: readonly string[]) =>
      resolveWindwalkerMonkApplicability({ talents: {}, talentsProvenAbsent: new Set(absent) }, {
        ...lineAt("fallback", 0),
        actionToken: token,
      } as AplAction).kind;
    for (const [token, talent] of Object.entries(TALENT_BUILT_TOKENS)) {
      expect(applicabilityOf(token, [talent])).toBe("NOT_APPLICABLE");
      expect(applicabilityOf(token, [])).toBe("UNKNOWN");
    }
  });

  it("an action built on a spell literal is not excluded by its talent, and a baseline spell has no guard", () => {
    for (const token of [
      "blackout_kick",
      "celestial_conduit",
      "rushing_wind_kick",
      "spinning_crane_kick",
      "tiger_palm",
      "touch_of_death",
      "touch_of_karma",
      "zenith_stomp",
    ]) {
      expect(TALENT_BUILT_TOKENS[token]).toBeUndefined();
      expect(
        resolveWindwalkerMonkApplicability(
          {
            talents: {},
            talentsProvenAbsent: new Set(["celestial_conduit", "rushing_wind_kick", "zenith_stomp"]),
          },
          { ...lineAt("fallback", 0), actionToken: token } as AplAction,
        ).kind,
      ).toBe("APPLICABLE");
    }
  });
});

describe("the domain boundary", () => {
  it("every racial the list names, the three the shared table omits included, cannot preempt a class action", () => {
    const lookup = authority().actionsInList("racials");
    if (!lookup.found) throw new Error("no racials");
    expect(lookup.actions).toHaveLength(4);
    for (const action of [
      ...lookup.actions,
      lineAt("default", 14),
      lineAt("default", 15),
      lineAt("default", 16),
      lineAt("default", 17),
      lineAt("default", 18),
      lineAt("default", 19),
      lineAt("default", 20),
    ]) {
      expect(windwalkerMonkNonDomainApplicabilityFor(action), action.actionToken).toMatchObject({
        kind: "NOT_APPLICABLE",
        reason: "OUTSIDE_SUPPORTED_DECISION_DOMAIN",
      });
    }
    // The three the shared table does not list. Classified here, so a racial never decides or blocks.
    for (const token of ["arcane_pulse", "haymaker", "rocket_barrage"]) {
      expect(nonDomainCategoryOf(token), token).toBeNull();
    }
  });

  it("the racial and trinket lists always return nothing, whatever the state reads", () => {
    const { rootScan } = queryGiven({ tree: SHADO_PAN });
    for (const [at, calleeListName] of [
      ["default[6]", "trinket"],
      ["default[7]", "racials"],
    ]) {
      expect(rootScan.dispatches.find((step) => step.at === at)).toMatchObject({
        calleeListName,
        outcome: "CALL_RETURNED_NO_ACTION_CONTINUE",
      });
    }
  });

  it("the potion, the items and the external buff cannot preempt a class action, and no class action is classified outside the domain", () => {
    expect(windwalkerMonkNonDomainApplicabilityFor(lineAt("default", 2))).not.toBeNull();
    expect(windwalkerMonkNonDomainApplicabilityFor(lineAt("default", 3))).not.toBeNull();
    expect(windwalkerMonkNonDomainApplicabilityFor(lineAt("default", 8))).not.toBeNull();
    expect(windwalkerMonkNonDomainApplicabilityFor(lineAt("trinket", 0))).not.toBeNull();
    expect(windwalkerMonkNonDomainApplicabilityFor(lineAt("default", 1))).toBeNull();
    expect(windwalkerMonkNonDomainApplicabilityFor(lineAt("fallback", 0))).toBeNull();
  });
});

describe("the pinned data", () => {
  it("all datasets load", () => {
    expect(pinnedWindwalkerMonkGcdSemantics().ok).toBe(true);
    expect(pinnedWindwalkerMonkTalents().ok).toBe(true);
    expect(pinnedWindwalkerMonkAuthority().ok).toBe(true);
  });

  it("the lanes are the pinned records'", () => {
    for (const [id, gcd] of [
      [TIGER_PALM, 1500],
      [BLACKOUT_KICK, 1500],
      [RISING_SUN_KICK, 1500],
      [SPINNING_CRANE_KICK, 1500],
      [RUSHING_WIND_KICK, 1500],
      [TOUCH_OF_DEATH, 1500],
      [FISTS_OF_FURY, 1000],
      [WHIRLING_DRAGON_PUNCH, 1000],
    ] as const) {
      expect(windwalkerMonkBaseGcdMsForAbility(id)).toBe(gcd);
      expect(windwalkerMonkExecutionLaneForAbility(id)).toBe("GCD_CONSUMING");
    }
    for (const id of [ZENITH, TOUCH_OF_KARMA]) {
      expect(windwalkerMonkBaseGcdMsForAbility(id)).toBe(0);
      expect(windwalkerMonkExecutionLaneForAbility(id)).toBe("NON_GCD");
    }
  });

  it("a press off the list has no token, and its lane is a refusal, never a guess", () => {
    expect(windwalkerMonkTokenBinding("flying_serpent_kick").kind).not.toBe("KNOWN_ONE");
    for (const id of [CHI_EXPLOSION, ROLL, 101545, 115203]) {
      expect(windwalkerMonkTokenByAbilityId().get(id)).toBeUndefined();
      expect(windwalkerMonkBaseGcdMsForAbility(id)).toBeNull();
    }
  });
});
