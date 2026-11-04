/**
 * ONB-C2: Outlaw Rogue, a Cohort C follower of Feral's pooling.
 *
 * No decision resolves, and no retained capture holds one of its events, so the mandatory negatives are the
 * centre of it: a pool never reads as a verdict, an unpressed Ambush or Killing Spree is never assumed ready at
 * full Energy, an open enemy count never reads as single target, and a missing talent never reads as false.
 *
 * Synthetic on purpose. The list queries "from a pool's own list" enter at `build` or `finish`, past Stealth
 * and the cooldown list, because only a test can get there: they show what the pool does when something
 * finally reaches it.
 */

import { describe, expect, it } from "vitest";

import outlawTalents from "../../../src/data/game/rogue-outlaw-talents.json";
import {
  outlawExecutionLaneForAbility,
  outlawExecutionLaneForToken,
  outlawTokenBinding,
  outlawTokenByAbilityId,
  pinnedOutlawRogueGcdSemantics,
} from "../../../src/data/game/rogue-outlaw-gcd-semantics.js";
import {
  pinnedOutlawRogueTalents,
  resolveOutlawHeroTree,
  resolveOutlawTalent,
} from "../../../src/data/game/rogue-outlaw-talents.js";
import { outlawTransitionContractFor } from "../../../src/data/game/rogue-outlaw-transition-authority.js";
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
import {
  resolveOutlawApplicability,
  resolveOutlawUsability,
  TALENT_BUILT_TOKENS,
} from "../../../src/specs/rogue/outlaw/action-profile.js";
import { outlawNonDomainApplicabilityFor } from "../../../src/specs/rogue/outlaw/domain-boundary.js";
import { outlawFirstGcdSelectionAt } from "../../../src/specs/rogue/outlaw/first-gcd-adapter.js";
import { initialOutlawState } from "../../../src/specs/rogue/outlaw/first-gcd-state.js";
import { analyzeObservedOutlawRogueDecisions } from "../../../src/specs/rogue/outlaw/observed-analysis.js";
import { pinnedOutlawRogueAuthority } from "../../../src/specs/rogue/outlaw/pinned-authority.js";
import {
  OUTLAW_GUARDED_LINES,
  outlawPoolingResolver,
} from "../../../src/specs/rogue/outlaw/pooling-model.js";
import {
  outlawTalentsDisprovedByHeroTree,
  resolveOutlawAtoms,
} from "../../../src/specs/rogue/outlaw/resolver.js";
import {
  HERO_TREE_FATEBOUND,
  OUTLAW_ATOM_VOCABULARY,
  SPELL_TARGETS,
} from "../../../src/specs/rogue/outlaw/vocabulary.js";
import {
  attachedResources,
  castEvent,
  classResource,
  syntheticFight,
} from "../../support/synthetic-fight.js";

const SOURCE = 7;
const BOSS = 900;

const SINISTER_STRIKE = 193315;
const AMBUSH = 8676;
const DISPATCH = 2098;
const KILLING_SPREE = 51690;
const COUP_DE_GRACE = 441776;
const ADRENALINE_RUSH = 13750;

type Entry = { readonly id: number; readonly nodeId: number };

function entries(names: readonly string[]): readonly Entry[] {
  return names.map((name) => {
    const row = outlawTalents.talents.find((candidate) => candidate.simcName === name);
    if (row === undefined) throw new Error(`no pinned talent ${name}`);
    return { id: row.traitEntryId, nodeId: row.traitNodeId };
  });
}

/** Every action of the list built, Fatebound, with Hidden Opportunity. */
const HIDDEN_OPPORTUNITY_BUILD = entries([
  "adrenaline_rush",
  "blade_rush",
  "keep_it_rolling",
  "killing_spree",
  "preparation",
  "hidden_opportunity",
  "audacity",
  "deal_fate",
]);
/** Trickster, with Fan the Hammer and Supercharger. */
const TRICKSTER_BUILD = entries([
  "adrenaline_rush",
  "blade_rush",
  "keep_it_rolling",
  "killing_spree",
  "preparation",
  "fan_the_hammer",
  "supercharger",
  "coup_de_grace",
]);

function authority(): AplAuthority {
  const loaded = pinnedOutlawRogueAuthority();
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

/** The pinned authority with `default` answering as one of its lists: what only a test can reach. */
function enteredAt(listName: string): AplAuthority {
  const pinned = authority();
  return {
    artifact: pinned.artifact,
    actions: pinned.actions,
    listsContainingAction: (token) => pinned.listsContainingAction(token),
    actionsInList: (name) => pinned.actionsInList(name === "default" ? listName : name),
    proveSoleGateTo: (token) => pinned.proveSoleGateTo(token),
  };
}

interface Facts {
  readonly talents: Record<string, ReturnType<typeof resolveOutlawTalent>>;
  readonly talentsProvenAbsent: Set<string>;
  readonly heroTree: ReturnType<typeof resolveOutlawHeroTree>;
}

/** The build facts, with every modelled talent the test names proven absent (only a test may). */
function factsOf(tree: readonly Entry[], absent: readonly string[] = []): Facts {
  const talents = Object.fromEntries(
    outlawTalents.talents.map((talent) => [talent.simcName, resolveOutlawTalent(tree, talent.simcName)]),
  );
  const heroTree = resolveOutlawHeroTree(tree);
  const talentsProvenAbsent = new Set<string>(outlawTalentsDisprovedByHeroTree(heroTree));
  for (const [name, talent] of Object.entries(talents)) {
    if (talent.selection === "NOT_SELECTED") talentsProvenAbsent.add(name);
  }
  for (const name of absent) {
    talentsProvenAbsent.add(name);
    delete talents[name];
  }
  return { talents, talentsProvenAbsent, heroTree };
}

function bindingsOf(
  facts: Facts,
  input: {
    readonly buffs?: readonly { readonly name: string; readonly up: boolean }[];
    readonly energy?: NumericBinding;
    readonly adrenalineRemains?: number;
  } = {},
): AtomBindings {
  const resolution = resolveOutlawAtoms({
    heroTree: facts.heroTree,
    talents: facts.talents,
    talentsProvenAbsent: facts.talentsProvenAbsent,
    energy: input.energy ?? knownNumber(60),
  });
  const knownTalents = Object.entries(facts.talents).flatMap(([name, talent]) =>
    talent.selection === "SELECTED" ? [{ name, taken: true }] : [],
  );
  for (const name of facts.talentsProvenAbsent) knownTalents.push({ name, taken: false });
  return {
    comboPoints: unknownNumber("STATE_NOT_MODELLED"),
    comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
    energyPct: unknownNumber("STATE_NOT_MODELLED"),
    knownBuffs: input.buffs ?? [],
    knownTalents,
    knownCooldownRemainsSeconds:
      input.adrenalineRemains === undefined
        ? []
        : [{ name: "adrenaline_rush", remainsSeconds: knownNumber(input.adrenalineRemains) }],
    specAtoms: resolution.specAtoms,
  };
}

/** A query from a pool's own list, past Stealth and the cooldown list. */
function queryFrom(listName: string, facts: Facts, bindings: AtomBindings, observed: number) {
  return outlawFirstGcdSelectionAt({
    authority: enteredAt(listName),
    bindings,
    buildFacts: { talents: facts.talents, talentsProvenAbsent: facts.talentsProvenAbsent },
    observedAbilityGameId: observed,
  });
}

/** Everything `build` reads above its pool, closed so the question is the pool's alone. */
const CLOSED_BUILDERS_ABOVE_THE_POOL = [
  { name: "opportunity", up: false },
  { name: "audacity", up: false },
];

const WITHOUT_HIDDEN_OPPORTUNITY = factsOf(entries(["deal_fate"]), [
  "hidden_opportunity",
  "deft_maneuvers",
  "fan_the_hammer",
  "audacity",
]);

function fightWith(
  tree: readonly Entry[] | null,
  casts: readonly {
    readonly t: number;
    readonly ability: number;
    readonly energy?: number;
  }[],
) {
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
        reportTimeMs: 1000,
      },
      ingestionOrdinal: 0,
      reportTimeMs: 1000,
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
  casts.forEach((cast, index) => {
    events.push(
      castEvent({
        ordinal: index + 1,
        reportTimeMs: cast.t,
        sourceActorId: SOURCE,
        targetActorId: BOSS,
        abilityGameId: cast.ability,
        castPhase: "COMPLETE",
        attachedResources:
          cast.energy === undefined
            ? null
            : attachedResources({
                side: "SOURCE",
                actorId: SOURCE,
                classResources: [classResource(3, cast.energy, { max: 120, cost: 45 })],
              }),
      }),
    );
  });
  return createCombatState(syntheticFight({ endTimeMs: 600000, events }));
}

function analyze(tree: readonly Entry[] | null, casts: Parameters<typeof fightWith>[1]) {
  return analyzeObservedOutlawRogueDecisions({
    state: fightWith(tree, casts),
    actorId: SOURCE,
    specId: "rogue/outlaw",
    targetActorId: null,
  });
}

describe("the row", () => {
  it("is reachable by the internal lookup only, and a public identity is refused", () => {
    const row = internalAnalyzerForSpec("rogue/outlaw", PRODUCTION_CATALOG) as AnalyzerRegistration;
    expect(row.analyzerId).toBe("rogue-outlaw-observed-decisions");
    expect(row.exposure).toBe("INTERNAL_ONLY");
    expect(analyzerForSpec("rogue/outlaw", PRODUCTION_CATALOG)).toBeNull();
    expect(resolveSpecIdentity({ className: "Rogue", specName: "Outlaw" }).ok).toBe(false);
  });

  it("refuses another specialization before reading anything of its own", () => {
    expect(
      analyzeObservedOutlawRogueDecisions({
        state: fightWith(null, []),
        actorId: SOURCE,
        specId: "rogue/subtlety",
        targetActorId: null,
      }).status,
    ).toBe("SPEC_NOT_SUPPORTED");
  });

  it("a capture with no combatant info refuses as PROFILE_NOT_RESOLVED, never judges", () => {
    expect(analyze(null, [{ t: 2000, ability: SINISTER_STRIKE }]).status).toBe("PROFILE_NOT_RESOLVED");
  });

  it("declares offensive authority only, and reports every other domain without it", () => {
    const analysis = analyze(HIDDEN_OPPORTUNITY_BUILD, []);
    if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
    const byDomain = new Map(analysis.domains.map((result) => [result.domain, result.resolution]));
    expect(byDomain.get("OFFENSIVE_ROTATION")).toBe("AUTHORITY_AVAILABLE");
    expect(byDomain.get("INTERRUPT")).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
    expect(byDomain.get("DEFENSIVE_COOLDOWN")).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
    expect(byDomain.get("RESOURCE_SPENDING")).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
  });
});

describe("no decision resolves", () => {
  it.each([
    ["Fatebound, Hidden Opportunity", HIDDEN_OPPORTUNITY_BUILD],
    ["Trickster, Fan the Hammer", TRICKSTER_BUILD],
    ["no hero entry at all", [] as readonly Entry[]],
  ])("%s: every decision stays UNKNOWN, stopped at Stealth", (_name, tree) => {
    const analysis = analyze(tree, [
      { t: 2000, ability: SINISTER_STRIKE, energy: 80 },
      { t: 3500, ability: AMBUSH, energy: 60 },
      { t: 5000, ability: DISPATCH, energy: 60 },
      { t: 6500, ability: KILLING_SPREE, energy: 60 },
    ]);
    if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
    const { coverage } = analysis;
    expect(coverage.eligibleDecisions).toBe(4);
    expect(coverage.match).toBe(0);
    expect(coverage.rejected).toBe(0);
    expect(coverage.unknown).toBe(4);
    expect(coverage.resolvedComparisons).toBe(0);
    expect(analysis.comparisons.every((comparison) => comparison.outcome === "UNKNOWN")).toBe(true);
    expect(analysis.resolved.every((entry) => entry.selection.blockedAt === "default[0] stealth")).toBe(true);
    // Each UNKNOWN is explained: the root scan's stopping point stays attached.
    expect(analysis.resolved.every((entry) => entry.selection.stoppingPoint !== null)).toBe(true);
  });

  it("a whole tree's root scan stops on variable.finish_condition, and a list behind it is never entered", () => {
    const analysis = analyze(TRICKSTER_BUILD, [{ t: 2000, ability: SINISTER_STRIKE, energy: 80 }]);
    if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
    const selection = analysis.resolved[0]?.selection;
    expect(selection?.stoppingPoint?.at).toBe("default[7] run_action_list");
    expect(selection?.stoppingPoint?.atoms).toContain("variable.finish_condition");
    expect(selection?.undecidedCandidates.some((candidate) => candidate.at.startsWith("build["))).toBe(false);
    expect(selection?.undecidedCandidates.some((candidate) => candidate.at.startsWith("finish["))).toBe(
      false,
    );
  });

  it("classifies the population: an off-GCD press and a spell the dataset has no record of are excluded", () => {
    const analysis = analyze(HIDDEN_OPPORTUNITY_BUILD, [
      { t: 2000, ability: ADRENALINE_RUSH },
      { t: 2500, ability: 999999 },
      { t: 3000, ability: 53 },
    ]);
    if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
    expect(analysis.comparisons).toHaveLength(0);
    expect(analysis.excluded.map((cast) => cast.reason)).toEqual([
      "NON_GCD_ACTION",
      "EXECUTION_LANE_NOT_ESTABLISHED",
      "EXECUTION_LANE_NOT_ESTABLISHED",
    ]);
  });

  it("a build with no hero entry is carried as UNKNOWN and proves nothing absent", () => {
    const analysis = analyze([], []);
    if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
    expect(analysis.build.heroTree.state).toBe("UNKNOWN");
    expect(analysis.build.talentsProvenAbsent).toEqual([]);
  });

  it("Energy is the cast's own, and unknown, never zero, without one", () => {
    const analysis = analyze(HIDDEN_OPPORTUNITY_BUILD, [
      { t: 2000, ability: SINISTER_STRIKE, energy: 80 },
      { t: 3500, ability: SINISTER_STRIKE },
    ]);
    if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
    expect(analysis.resolved[0]?.diagnostics.energy).toEqual(knownNumber(80));
    expect(analysis.resolved[1]?.diagnostics.energy.state).not.toBe("KNOWN_NUMBER");
  });
});

describe("the list as pinned", () => {
  it("every in-domain condition parses whole", () => {
    const outside = ["use_items", "potion"];
    const refused = authority()
      .actions.filter(
        (action) =>
          action.conditionRaw !== null &&
          action.listName !== "precombat" &&
          !outside.includes(action.actionToken),
      )
      .flatMap((action) => {
        const parsed = parseSimcExpression(action.conditionRaw ?? "", OUTLAW_ATOM_VOCABULARY);
        return parsed.ok ? [] : [`${action.listName}[${String(action.priorityOrdinal)}]`];
      });
    expect(refused).toEqual([]);
  });

  it("the only option the shared list refuses is the pool's own for_next, which the engine's wait reading models", () => {
    const refused = authority().actions.filter(
      (action) => action.listName !== "precombat" && action.unsupportedOptions.length > 0,
    );
    expect(refused.map((action) => action.actionToken)).toEqual(["pool_resource", "pool_resource"]);
    for (const line of refused) {
      expect(line.unsupportedOptions.map((option) => option.optionKey)).toEqual(["for_next"]);
    }
  });

  it("stealth and kick come first, unconditional, off the GCD, with no contract", () => {
    for (const [ordinal, token] of [
      [0, "stealth"],
      [1, "kick"],
    ] as const) {
      const line = lineAt("default", ordinal);
      expect(line.actionToken).toBe(token);
      expect(line.conditionRaw).toBeNull();
      expect(outlawExecutionLaneForToken(token)).toBe("NON_GCD");
      expect(outlawTransitionContractFor(token)).toBeNull();
    }
  });
});

describe("the pinned shape of the pools", () => {
  it("is two guarded lines, and neither condition reads Energy", () => {
    expect(lineAt("build", 6).actionStringVerbatim).toBe("pool_resource,for_next=1");
    expect(lineAt("build", 7).actionToken).toBe("ambush");
    expect(lineAt("build", 7).conditionRaw).toBe(OUTLAW_GUARDED_LINES.ambush);
    expect(lineAt("finish", 1).actionStringVerbatim).toBe("pool_resource,for_next=1");
    expect(lineAt("finish", 2).actionToken).toBe("killing_spree");
    expect(lineAt("finish", 2).conditionRaw).toBe(OUTLAW_GUARDED_LINES.killing_spree);
    for (const condition of Object.values(OUTLAW_GUARDED_LINES)) expect(condition).not.toMatch(/energy/);
    expect(authority().actions.filter((action) => action.actionToken === "pool_resource")).toHaveLength(2);
  });
});

describe("the at-maximum question", () => {
  const ask = (
    guardedLine: AplAction,
    bindings: AtomBindings,
    poolLine: AplAction = lineAt("build", 6),
    resourceOption: string | null = null,
  ) => outlawPoolingResolver()({ poolLine, guardedLine, resourceOption, bindings });

  it("a false condition is not resource limited", () => {
    expect(ask(lineAt("build", 7), bindingsOf(WITHOUT_HIDDEN_OPPORTUNITY)).kind).toBe("NOT_READY_AT_MAX");
  });

  it("a true condition is UNKNOWN, never ready: nothing proves the action usable at full Energy", () => {
    expect(ask(lineAt("build", 7), bindingsOf(factsOf(HIDDEN_OPPORTUNITY_BUILD))).kind).toBe("UNKNOWN");
  });

  it("an open condition is UNKNOWN: a missing talent never reads as false", () => {
    expect(ask(lineAt("build", 7), bindingsOf(factsOf([]))).kind).toBe("UNKNOWN");
  });

  it("refuses a resource= option and any line but the pinned two", () => {
    expect(
      ask(lineAt("build", 7), bindingsOf(WITHOUT_HIDDEN_OPPORTUNITY), lineAt("build", 6), "energy").kind,
    ).toBe("UNKNOWN");
    expect(ask(lineAt("build", 8), bindingsOf(WITHOUT_HIDDEN_OPPORTUNITY)).kind).toBe("UNKNOWN");
    const another: AplAction = { ...lineAt("build", 7), conditionRaw: "!talent.hidden_opportunity" };
    expect(ask(another, bindingsOf(WITHOUT_HIDDEN_OPPORTUNITY)).kind).toBe("UNKNOWN");
  });
});

describe("the pool, reached only from its own list", () => {
  it("without Hidden Opportunity it neither fires nor stops the scan, so Sinister Strike is selected", () => {
    const outcome = queryFrom(
      "build",
      WITHOUT_HIDDEN_OPPORTUNITY,
      bindingsOf(WITHOUT_HIDDEN_OPPORTUNITY, { buffs: CLOSED_BUILDERS_ABOVE_THE_POOL }),
      SINISTER_STRIKE,
    );
    expect(outcome.result.kind).toBe("ROTATIONAL_GCD_SELECTED");
    if (outcome.result.kind === "ROTATIONAL_GCD_SELECTED") {
      expect(outcome.result.actionToken).toBe("sinister_strike");
    }
  });

  it("with Hidden Opportunity, a pressed Ambush proves the line ready now, so nothing pools", () => {
    const facts = factsOf(HIDDEN_OPPORTUNITY_BUILD, ["deft_maneuvers", "fan_the_hammer", "quick_draw"]);
    const outcome = queryFrom(
      "build",
      facts,
      bindingsOf(facts, { buffs: CLOSED_BUILDERS_ABOVE_THE_POOL }),
      AMBUSH,
    );
    expect(outcome.result.kind).toBe("ROTATIONAL_GCD_SELECTED");
    if (outcome.result.kind === "ROTATIONAL_GCD_SELECTED") expect(outcome.result.actionToken).toBe("ambush");
  });

  it("with Hidden Opportunity, a builder below the Ambush stays open, never REJECTED or MATCH", () => {
    const facts = factsOf(HIDDEN_OPPORTUNITY_BUILD, ["deft_maneuvers", "fan_the_hammer", "quick_draw"]);
    const outcome = queryFrom(
      "build",
      facts,
      bindingsOf(facts, { buffs: CLOSED_BUILDERS_ABOVE_THE_POOL, energy: knownNumber(46) }),
      SINISTER_STRIKE,
    );
    expect(outcome.result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
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
        abilityGameId: SINISTER_STRIKE,
        observedToken: "sinister_strike",
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
  });

  it("an unresolved talent keeps the pool open: it never falls through to Sinister Strike", () => {
    const facts = factsOf([], ["deft_maneuvers", "fan_the_hammer", "audacity"]);
    const outcome = queryFrom(
      "build",
      facts,
      bindingsOf(facts, { buffs: CLOSED_BUILDERS_ABOVE_THE_POOL }),
      SINISTER_STRIKE,
    );
    expect(outcome.result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
  });

  it("Killing Spree's condition false: the finish pool does not fire, and the scan reaches Dispatch", () => {
    const facts = factsOf(TRICKSTER_BUILD, ["coup_de_grace"]);
    const outcome = queryFrom(
      "finish",
      facts,
      bindingsOf(facts, {
        buffs: [
          { name: "supercharge_1", up: false },
          { name: "supercharge_2", up: false },
        ],
        adrenalineRemains: 60,
      }),
      DISPATCH,
    );
    // Between the Eyes above it stays open on its own condition, so the point is the pool's own record.
    expect(outcome.rootScan.undecidedCandidates.map((candidate) => candidate.actionToken)).not.toContain(
      "pool_resource",
    );
  });

  it("Killing Spree's condition true and unpressed: the pool stays open, never read as not limited", () => {
    const facts = factsOf(HIDDEN_OPPORTUNITY_BUILD, ["supercharger"]);
    const outcome = queryFrom("finish", facts, bindingsOf(facts), DISPATCH);
    expect(outcome.result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    expect(outcome.rootScan.undecidedCandidates.map((candidate) => candidate.actionToken)).toContain(
      "pool_resource",
    );
  });

  it("Killing Spree pressed with its condition true proves the line ready, and nothing pools", () => {
    const facts = factsOf(HIDDEN_OPPORTUNITY_BUILD, ["supercharger"]);
    const outcome = queryFrom("finish", facts, bindingsOf(facts), KILLING_SPREE);
    expect(outcome.rootScan.undecidedCandidates.map((candidate) => candidate.actionToken)).not.toContain(
      "pool_resource",
    );
  });
});

describe("the enemy count", () => {
  it("is declared and unbound, so a line reading it stays open and never reads as single target", () => {
    const facts = factsOf(HIDDEN_OPPORTUNITY_BUILD);
    const bindings = bindingsOf(facts);
    const row = bindings.specAtoms?.bound.find((binding) => binding.key === SPELL_TARGETS);
    expect(row?.value).toEqual({ kind: "MAGNITUDE", binding: unknownNumber("STATE_NOT_MODELLED") });
    const outcome = queryFrom("cds", facts, bindings, SINISTER_STRIKE);
    expect(outcome.result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
  });
});

describe("the talents", () => {
  it("a lone-node talent absent from the tree stays UNKNOWN, never false", () => {
    expect(resolveOutlawTalent(entries(["deal_fate"]), "hidden_opportunity").selection).toBe("UNKNOWN");
  });

  it("a resolved tree disproves only the other tree's talents, and binds hero_tree.fatebound", () => {
    const fatebound = resolveOutlawHeroTree(entries(["deal_fate"]));
    expect(outlawTalentsDisprovedByHeroTree(fatebound)).toEqual(["coup_de_grace"]);
    const trickster = resolveOutlawHeroTree(entries(["coup_de_grace"]));
    expect(outlawTalentsDisprovedByHeroTree(trickster)).toEqual(["deal_fate"]);
    const atomOf = (heroTree: typeof fatebound) =>
      resolveOutlawAtoms({
        heroTree,
        talents: {},
        talentsProvenAbsent: new Set(),
        energy: knownNumber(50),
      }).specAtoms.bound.find((binding) => binding.key === HERO_TREE_FATEBOUND)?.value;
    expect(atomOf(fatebound)).toEqual({ kind: "TRUTH", value: true });
    expect(atomOf(trickster)).toEqual({ kind: "TRUTH", value: false });
  });

  it("an unresolved tree disproves nothing and leaves hero_tree.fatebound unbound", () => {
    const heroTree = resolveOutlawHeroTree([]);
    expect(outlawTalentsDisprovedByHeroTree(heroTree)).toEqual([]);
    const { bound } = resolveOutlawAtoms({
      heroTree,
      talents: {},
      talentsProvenAbsent: new Set(),
      energy: knownNumber(50),
    }).specAtoms;
    expect(bound.some((binding) => binding.key === HERO_TREE_FATEBOUND)).toBe(false);
  });

  it("an action built on a talent proven absent is background; an unresolved one never is", () => {
    for (const token of Object.keys(TALENT_BUILT_TOKENS)) {
      const line = authority().actions.find(
        (action) => action.actionToken === token && action.listName !== "precombat",
      );
      if (line === undefined) throw new Error(`no line for ${token}`);
      const talentName = TALENT_BUILT_TOKENS[token] ?? "";
      expect(
        resolveOutlawApplicability({ talents: {}, talentsProvenAbsent: new Set([talentName]) }, line).kind,
        token,
      ).toBe("NOT_APPLICABLE");
      expect(
        resolveOutlawApplicability({ talents: {}, talentsProvenAbsent: new Set() }, line).kind,
        token,
      ).toBe("UNKNOWN");
    }
  });

  it("a baseline action has no talent guard", () => {
    for (const token of ["sinister_strike", "ambush", "dispatch", "between_the_eyes", "roll_the_bones"]) {
      const line = authority().actions.find((action) => action.actionToken === token);
      if (line === undefined) throw new Error(`no line for ${token}`);
      expect(
        resolveOutlawApplicability({ talents: {}, talentsProvenAbsent: new Set() }, line).kind,
        token,
      ).toBe("APPLICABLE");
    }
  });
});

describe("usability", () => {
  const usability = (ordinalList: string, ordinal: number, observed: number) =>
    resolveOutlawUsability({
      state: initialOutlawState(),
      action: lineAt(ordinalList, ordinal),
      observedAbilityGameId: observed,
    }).kind;

  it("the press proves its own token, and nothing else", () => {
    expect(usability("build", 7, AMBUSH)).toBe("PROVEN_USABLE");
    expect(usability("build", 7, SINISTER_STRIKE)).toBe("UNKNOWN");
    expect(usability("finish", 3, COUP_DE_GRACE)).toBe("PROVEN_USABLE");
  });
});

describe("the domain boundary", () => {
  it("Shadowmeld is a racial the shared table does not list, so it cannot preempt a class action", () => {
    const line = authority().actions.find((action) => action.actionToken === "shadowmeld");
    if (line === undefined) throw new Error("no Shadowmeld line");
    expect(outlawNonDomainApplicabilityFor(line)?.kind).toBe("NOT_APPLICABLE");
  });

  it("no class action is classified outside the domain", () => {
    for (const token of ["vanish", "kick", "stealth", "sinister_strike", "adrenaline_rush"]) {
      const line = authority().actions.find((action) => action.actionToken === token);
      if (line === undefined) throw new Error(`no line for ${token}`);
      expect(outlawNonDomainApplicabilityFor(line), token).toBeNull();
    }
  });
});

describe("the pinned data", () => {
  it("both datasets load", () => {
    expect(pinnedOutlawRogueGcdSemantics().ok).toBe(true);
    expect(pinnedOutlawRogueTalents().ok).toBe(true);
  });

  it("the off-GCD actions are off the GCD, and the rest are on it", () => {
    for (const token of ["stealth", "kick", "vanish", "adrenaline_rush", "keep_it_rolling"]) {
      expect(outlawExecutionLaneForToken(token), token).toBe("NON_GCD");
      expect(outlawTransitionContractFor(token), token).toBeNull();
    }
    for (const token of [
      "preparation",
      "blade_flurry",
      "roll_the_bones",
      "blade_rush",
      "ambush",
      "pistol_shot",
      "sinister_strike",
      "between_the_eyes",
      "killing_spree",
      "coup_de_grace",
      "dispatch",
    ]) {
      expect(outlawExecutionLaneForToken(token), token).toBe("GCD_CONSUMING");
    }
  });

  it("Sinister Strike binds the Outlaw row, and an id the module does not press has no token", () => {
    expect(outlawTokenBinding("sinister_strike")).toMatchObject({ kind: "KNOWN_ONE", abilityGameId: 193315 });
    const tokens = outlawTokenByAbilityId();
    expect(tokens.get(193315)).toBe("sinister_strike");
    expect(tokens.has(1752)).toBe(false);
    // Coup de Grace's action, never its talent record.
    expect(tokens.get(441776)).toBe("coup_de_grace");
    expect(tokens.has(441423)).toBe(false);
    // Killing Spree's children and Blade Rush's strike are not presses.
    for (const child of [57841, 57842, 271881, 197834]) {
      expect(tokens.has(child), String(child)).toBe(false);
      expect(outlawExecutionLaneForAbility(child), String(child)).toBe("UNKNOWN_LANE");
    }
  });
});
