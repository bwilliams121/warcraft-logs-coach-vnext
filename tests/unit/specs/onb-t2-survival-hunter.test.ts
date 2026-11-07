/**
 * ONB-T2: Survival Hunter, a Cohort T follower.
 *
 * No retained capture holds one of its events, so everything here is synthetic. The mandatory negatives are the centre of it: an open enemy count never reads as
 * single target, a missing talent never reads as false, a fight style is never a fact, and a line gated on one never reads as stepped past.
 *
 * Synthetic on purpose. The authority views here answer with a single line, because only a test can get past the list's
 * real stopping point: they show what the anchor does when a scan finally resolves.
 */

import { describe, expect, it } from "vitest";

import survivalTalents from "../../../src/data/game/hunter-survival-talents.json";
import artifact from "../../../src/simc/data/hunter-survival.apl.json";
import {
  SURVIVAL_CAST_ROWS,
  survivalCastRowFor,
} from "../../../src/data/game/hunter-survival-cast-semantics.js";
import {
  survivalBaseGcdMsForAbility,
  survivalExecutionLaneForAbility,
  survivalExecutionLaneForToken,
  survivalTokenBinding,
  survivalTokenByAbilityId,
  pinnedSurvivalHunterGcdSemantics,
} from "../../../src/data/game/hunter-survival-gcd-semantics.js";
import {
  pinnedSurvivalHunterTalents,
  resolveSurvivalHeroTree,
  resolveSurvivalTalent,
} from "../../../src/data/game/hunter-survival-talents.js";
import { survivalTransitionContractFor } from "../../../src/data/game/hunter-survival-transition-authority.js";
import { buildCastTimeline } from "../../../src/engine/game-state/casting/cast-decision-anchor.js";
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
  resolveSurvivalApplicability,
  resolveSurvivalUsability,
  TALENT_BUILT_TOKENS,
} from "../../../src/specs/hunter/survival/action-profile.js";
import {
  SURVIVAL_CAPABILITIES,
  standaloneSurvivalAuthorityAccess,
} from "../../../src/specs/hunter/survival/authority-bindings.js";
import { survivalCastAnchorProfile } from "../../../src/specs/hunter/survival/cast-anchor-profile.js";
import { survivalNonDomainApplicabilityFor } from "../../../src/specs/hunter/survival/domain-boundary.js";
import { survivalFirstGcdSelectionAt } from "../../../src/specs/hunter/survival/first-gcd-adapter.js";
import { initialSurvivalState } from "../../../src/specs/hunter/survival/first-gcd-state.js";
import { analyzeObservedSurvivalHunterDecisions } from "../../../src/specs/hunter/survival/observed-analysis.js";
import { pinnedSurvivalHunterAuthority } from "../../../src/specs/hunter/survival/pinned-authority.js";
import {
  survivalTalentsDisprovedByHeroTree,
  resolveSurvivalAtoms,
} from "../../../src/specs/hunter/survival/resolver.js";
import {
  SURVIVAL_ATOM_VOCABULARY,
  SURVIVAL_UNBOUND_NUMERIC_ATOMS,
  SURVIVAL_UNBOUND_TRUTH_ATOMS,
} from "../../../src/specs/hunter/survival/vocabulary.js";
import {
  attachedResources,
  castEvent,
  classResource,
  FIGHT_START_MS,
  syntheticFight,
} from "../../support/synthetic-fight.js";

const SOURCE = 7;
const BOSS = 900;

const INSTANT = 186270;
const UNREVIEWED = 109304;

type Entry = { readonly id: number; readonly nodeId: number };

function entries(names: readonly string[]): readonly Entry[] {
  return names.map((name) => {
    const row = survivalTalents.talents.find((candidate) => candidate.simcName === name);
    if (row === undefined) throw new Error(`no pinned talent ${name}`);
    return { id: row.traitEntryId, nodeId: row.traitNodeId };
  });
}

/** pack_leader. */
const BUILD_A = [
  ...entries([
    "kill_command",
    "wildfire_bomb",
    "raptor_strike",
    "boomstick",
    "takedown",
    "muzzle",
    "howl_of_the_pack_leader",
  ]),
];
/** sentinel. */
const BUILD_B = entries([
  "kill_command",
  "wildfire_bomb",
  "raptor_strike",
  "boomstick",
  "takedown",
  "muzzle",
  "moonlight_chakram",
]);

function authority(): AplAuthority {
  const loaded = pinnedSurvivalHunterAuthority();
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
  const standalone = standaloneSurvivalAuthorityAccess();
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

interface Facts {
  readonly talents: Record<string, ReturnType<typeof resolveSurvivalTalent>>;
  readonly talentsProvenAbsent: Set<string>;
  readonly heroTree: ReturnType<typeof resolveSurvivalHeroTree>;
}

/** The build facts, with every modelled talent the test names proven absent (only a test may). */
function factsOf(tree: readonly Entry[], absent: readonly string[] = []): Facts {
  const talents = Object.fromEntries(
    survivalTalents.talents.map((talent) => [talent.simcName, resolveSurvivalTalent(tree, talent.simcName)]),
  );
  const heroTree = resolveSurvivalHeroTree(tree);
  const talentsProvenAbsent = new Set<string>(survivalTalentsDisprovedByHeroTree(heroTree));
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
  const resolution = resolveSurvivalAtoms({
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

function fightWith(
  tree: readonly Entry[] | null,
  steps: readonly Step[],
  casts: "COMPLETE" | "UNVERIFIED" = "COMPLETE",
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
    events.push(
      castEvent({
        ordinal: index + 1,
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
                classResources: [classResource(2, step.power, { max: 100, cost: 0 })],
              }),
      }),
    );
  });
  return createCombatState(
    syntheticFight({ events, observedCategories: casts === "COMPLETE" ? ["CASTS"] : [] }),
  );
}

function analyze(
  tree: readonly Entry[] | null,
  steps: readonly Step[],
  options: { readonly casts?: "COMPLETE" | "UNVERIFIED"; readonly authority?: AuthorityAccess } = {},
) {
  return analyzeObservedSurvivalHunterDecisions({
    state: fightWith(tree, steps, options.casts ?? "COMPLETE"),
    actorId: SOURCE,
    specId: "hunter/survival",
    targetActorId: null,
    ...(options.authority === undefined ? {} : { authority: options.authority }),
  });
}

function analyzed(
  tree: readonly Entry[] | null,
  steps: readonly Step[],
  options: Parameters<typeof analyze>[2] = {},
) {
  const analysis = analyze(tree, steps, options);
  if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
  return analysis;
}

/** A first cast in the fight, whose window opens before the pull, so the next ones are the ones under test. */
const FIRST_INSTANT: Step = { t: 100, ability: INSTANT };

const completion = (abilityGameId: number) => ({
  position: 0,
  locator: {} as never,
  abilityGameId,
  reportTimeMs: 0,
  fightTimeMs: 0,
});

describe("the row", () => {
  it("is reachable by the internal lookup only, and a public identity is refused", () => {
    const row = internalAnalyzerForSpec("hunter/survival", PRODUCTION_CATALOG) as AnalyzerRegistration;
    expect(row.analyzerId).toBe("hunter-survival-observed-decisions");
    expect(row.exposure).toBe("INTERNAL_ONLY");
    expect(analyzerForSpec("hunter/survival", PRODUCTION_CATALOG)).toBeNull();
    expect(resolveSpecIdentity({ className: "Hunter", specName: "Survival" }).ok).toBe(false);
  });

  it("refuses another specialization before reading anything of its own", () => {
    expect(
      analyzeObservedSurvivalHunterDecisions({
        state: fightWith(null, []),
        actorId: SOURCE,
        specId: "warlock/destruction" as never,
        targetActorId: null,
      }).status,
    ).toBe("SPEC_NOT_SUPPORTED");
  });

  it("a capture with no combatant info refuses as PROFILE_NOT_RESOLVED, never judges", () => {
    expect(analyze(null, [{ t: 2000, ability: INSTANT }]).status).toBe("PROFILE_NOT_RESOLVED");
  });

  it("declares offensive authority only, and reports every other domain without it", () => {
    const analysis = analyzed(BUILD_A, []);
    const byDomain = new Map(analysis.domains.map((result) => [result.domain, result.resolution]));
    expect(byDomain.get("OFFENSIVE_ROTATION")).toBe("AUTHORITY_AVAILABLE");
    expect(byDomain.get("INTERRUPT")).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
    expect(byDomain.get("DEFENSIVE_COOLDOWN")).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
    expect(byDomain.get("RESOURCE_SPENDING")).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
  });

  it("declares no resource, because it reads none", () => {
    const offensive = SURVIVAL_CAPABILITIES.find((row) => row.domain === "OFFENSIVE_ROTATION");
    expect(offensive?.requirements.resources).toEqual([]);
    expect(offensive?.requirements.evidenceCategories).toEqual(["CASTS", "COMBATANT_INFO"]);
  });
});

describe("nothing on this list has a cast time", () => {
  it("no row claims one, so no begin is ever the anchor of a press", () => {
    expect(SURVIVAL_CAST_ROWS.filter((row) => row.baseCastMs !== 0)).toEqual([]);
    expect(
      SURVIVAL_CAST_ROWS.filter((row) => row.rule === "HARD_CAST" || row.rule === "INSTANT_ROW_NOT_EXCLUDED"),
    ).toEqual([]);
  });

  it("an instant is decided when it lands", () => {
    const analysis = analyzed(BUILD_A, [FIRST_INSTANT, { t: 2000, ability: INSTANT }]);
    expect(analysis.resolved[1]?.anchor).toMatchObject({
      state: "ESTABLISHED",
      source: "INSTANT_COMPLETION",
    });
    expect(analysis.comparisons[1]?.decision.fightTimeMs).toBe(2000);
  });

  it("a begin of an instant contradicts the review: UNKNOWN, never a guess at which is wrong", () => {
    const analysis = analyzed(BUILD_A, [
      { t: 2000, ability: INSTANT, phase: "BEGIN" },
      { t: 3000, ability: INSTANT },
    ]);
    expect(analysis.resolved[0]?.anchor).toMatchObject({
      state: "UNKNOWN",
      reason: "CAST_EVIDENCE_CONFLICT",
    });
    expect(analysis.comparisons[0]?.outcome).toBe("UNKNOWN");
  });
});

describe("a channel", () => {
  it("is decided at its cast, with no begin to pair", () => {
    const analysis = analyzed(BUILD_A, [FIRST_INSTANT, { t: 2000, ability: 1261193 }]);
    expect(analysis.resolved[1]?.anchor).toMatchObject({ state: "ESTABLISHED", source: "CHANNEL_START" });
    expect(analysis.comparisons[1]?.decision.fightTimeMs).toBe(2000);
  });

  it("never reads as idle after its cast, and no instant inside it reads as a mistake", () => {
    const timeline = buildCastTimeline({
      state: fightWith(BUILD_A, [FIRST_INSTANT, { t: 2000, ability: 1261193 }]),
      actorId: SOURCE,
      profile: survivalCastAnchorProfile(),
    });
    expect(timeline.occupancyAt(FIGHT_START_MS + 2500)).toMatchObject({
      state: "UNKNOWN",
      reason: "CHANNEL_END_UNKNOWN",
    });
  });

  it("no channel bound is claimed, and it is the one reviewed channel", () => {
    expect(survivalCastAnchorProfile().channelDurationAt(completion(1261193))).toEqual({
      kind: "UNKNOWN",
      reason: "CHANNEL_BOUND_NOT_REVIEWED",
    });
    expect(SURVIVAL_CAST_ROWS.filter((row) => row.rule === "CHANNEL").map((row) => row.simcToken)).toEqual([
      "boomstick",
    ]);
  });
});

describe("no decision resolves", () => {
  it.each([
    ["pack_leader", BUILD_A],
    ["sentinel", BUILD_B],
    ["no hero entry at all", [] as readonly Entry[]],
  ])("%s: every decision stays UNKNOWN, with its reason attached", (_name, tree) => {
    const analysis = analyzed(tree, [
      FIRST_INSTANT,
      { t: 1000, ability: INSTANT },
      { t: 2000, ability: INSTANT },
    ]);
    const { coverage } = analysis;
    expect(coverage.eligibleDecisions).toBe(3);
    expect(coverage.match).toBe(0);
    expect(coverage.rejected).toBe(0);
    expect(coverage.unknown).toBe(3);
    expect(coverage.resolvedComparisons).toBe(0);
    expect(analysis.comparisons.every((comparison) => comparison.outcome === "UNKNOWN")).toBe(true);
  });

  it("classifies the population: a spell the dataset has no record of is excluded, never judged", () => {
    const analysis = analyzed(BUILD_A, [
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

  it("the list reads no Focus, and declares no resource", () => {
    const strings = authority().actions.map((action) => action.actionStringVerbatim);
    expect(strings.filter((text) => /\bfocus\b/.test(text))).toEqual([]);
    const offensive = SURVIVAL_CAPABILITIES.find((capability) => capability.domain === "OFFENSIVE_ROTATION");
    expect(offensive?.requirements.resources).toEqual([]);
  });
});

describe("the list as pinned", () => {
  it("is 60 actions in 7 lists", () => {
    expect(authority().actions).toHaveLength(60);
    expect(artifact.lists).toHaveLength(7);
  });

  it("records the live and PTR relationship it was extracted under", () => {
    expect(artifact.provenance.livePtrPolicy).toBe("PTR_BODY_IDENTICAL");
  });

  it("every in-domain condition outside precombat parses whole", () => {
    const refused = authority()
      .actions.filter((action) => action.listName !== "precombat")
      .filter((action) => nonDomainCategoryOf(action.actionToken) === null)
      .flatMap((action) => {
        const raw = (action as { readonly conditionRaw?: string | null }).conditionRaw ?? null;
        if (raw === null) return [];
        const parsed = parseSimcExpression(raw, SURVIVAL_ATOM_VOCABULARY) as { readonly ok?: boolean };
        return parsed.ok === true ? [] : [`${action.listName}[${String(action.priorityOrdinal)}]`];
      });
    expect(refused).toEqual([]);
  });

  it("every off-GCD action of the list has no contract, so a scan refuses rather than steps past it", () => {
    for (const [token, ability] of [
      ["muzzle", 187707],
      ["aspect_of_the_eagle", 186289],
    ] as readonly (readonly [string, number])[]) {
      expect(survivalExecutionLaneForAbility(ability), token).toBe("NON_GCD");
      expect(survivalTransitionContractFor(token), token).toBeNull();
    }
  });
});

describe("the enemy count", () => {
  it("is declared and unbound here, so a line reading it stays open and never reads as single target", () => {
    const unknown = bindingsOf(factsOf(BUILD_A)).specAtoms?.bound.filter(
      (binding) => binding.key === "active_enemies",
    );
    expect(unknown).toEqual([
      {
        key: "active_enemies",
        actionToken: null,
        value: { kind: "MAGNITUDE", binding: unknownNumber("STATE_NOT_MODELLED") },
      },
    ]);
  });

  it("a line reading it, alone at the root, stays undecided and answers nothing", () => {
    const line = authority().actions.find(
      (action) => action.listName === "default" && action.actionStringVerbatim.includes("active_enemies<3"),
    );
    if (line === undefined) throw new Error("no line");
    expect(line.actionStringVerbatim).toContain("active_enemies");
    const analysis = analyzed(BUILD_A, [FIRST_INSTANT], { authority: accessAnswering(line) });
    expect(analysis.comparisons[0]?.outcome).toBe("UNKNOWN");
  });

  it("a single target only a test can state still does not fall through to a confident answer", () => {
    const facts = factsOf(BUILD_A);
    const outcome = survivalFirstGcdSelectionAt({
      authority: authority(),
      bindings: bindingsOf(facts, { active_enemies: 1 }),
      buildFacts: { talents: facts.talents, talentsProvenAbsent: facts.talentsProvenAbsent },
      observedAbilityGameId: INSTANT,
    });
    expect(outcome.result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
  });
});

describe("the talents", () => {
  it("a lone-node talent absent from the tree stays UNKNOWN, never false", () => {
    expect(resolveSurvivalTalent(BUILD_A, "twin_fangs").selection).toBe("UNKNOWN");
  });

  it("a resolved tree disproves only the other tree's talents", () => {
    expect(resolveSurvivalHeroTree(BUILD_A)).toMatchObject({ state: "RESOLVED", simcName: "pack_leader" });
    expect(resolveSurvivalHeroTree(BUILD_B)).toMatchObject({ state: "RESOLVED", simcName: "sentinel" });
    expect(survivalTalentsDisprovedByHeroTree(resolveSurvivalHeroTree(BUILD_A))).toEqual([
      "moonlight_chakram",
    ]);
    expect(survivalTalentsDisprovedByHeroTree(resolveSurvivalHeroTree(BUILD_B))).toEqual([
      "howl_of_the_pack_leader",
    ]);
  });

  it("an unresolved tree disproves nothing", () => {
    expect(survivalTalentsDisprovedByHeroTree(resolveSurvivalHeroTree([]))).toEqual([]);
  });

  it("an action built on a talent proven absent is background; an unresolved one never is", () => {
    const line = authority().actions.find((action) => action.actionToken === "takedown");
    if (line === undefined) throw new Error("no line");
    const proven = factsOf(BUILD_A, ["takedown"]);
    expect(resolveSurvivalApplicability(proven, line).kind).toBe("NOT_APPLICABLE");
    expect(resolveSurvivalApplicability(factsOf([]), line).kind).toBe("UNKNOWN");
    expect(resolveSurvivalApplicability(factsOf(entries(["takedown"])), line).kind).toBe("APPLICABLE");
  });

  it("an action built on no talent has no guard", () => {
    const line = authority().actions.find((action) => action.actionToken === "aspect_of_the_eagle");
    if (line === undefined) throw new Error("no line");
    expect(resolveSurvivalApplicability(factsOf([]), line).kind).toBe("APPLICABLE");
  });
});

describe("usability", () => {
  const usability = (action: AplAction, observed: number) =>
    resolveSurvivalUsability({
      state: initialSurvivalState(),
      action,
      observedAbilityGameId: observed,
    });

  it("the press proves its own token, and nothing else", () => {
    const line = authority().actions.find((action) => action.actionToken === "raptor_strike");
    if (line === undefined) throw new Error("no line");
    expect(usability(line, INSTANT).kind).toBe("PROVEN_USABLE");
    expect(usability(line, UNREVIEWED).kind).toBe("UNKNOWN");
  });
});

describe("the domain boundary", () => {
  it("racials, items, the potion and the external buff cannot preempt a class action", () => {
    for (const [list, ordinal] of [
      ["cds", 0],
      ["cds", 1],
      ["cds", 5],
    ] as readonly (readonly [string, number])[]) {
      const verdict = survivalNonDomainApplicabilityFor(lineAt(list, ordinal));
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
    expect(pinnedSurvivalHunterGcdSemantics().ok).toBe(true);
    expect(pinnedSurvivalHunterTalents().ok).toBe(true);
  });

  it("every cast row names the token the GCD dataset binds, and no token lacks a row", () => {
    const tokens = survivalTokenByAbilityId();
    for (const row of SURVIVAL_CAST_ROWS) {
      expect(tokens.get(row.abilityGameId), row.simcToken).toBe(row.simcToken);
    }
    for (const [abilityGameId, token] of tokens) {
      expect(survivalCastRowFor(abilityGameId)?.simcToken, token).toBe(token);
    }
  });

  it("an id off the list has no token, and its lane is a refusal", () => {
    const tokens = survivalTokenByAbilityId();
    expect(tokens.has(UNREVIEWED)).toBe(false);
    expect(survivalExecutionLaneForAbility(UNREVIEWED)).toBe("UNKNOWN_LANE");
    expect(survivalBaseGcdMsForAbility(UNREVIEWED)).toBeNull();
  });

  it("the press's own row binds its token", () => {
    expect(survivalTokenBinding("raptor_strike")).toMatchObject({
      kind: "KNOWN_ONE",
      abilityGameId: INSTANT,
    });
  });
});

describe("what this list asks that nothing answers", () => {
  it("every scan stops at the retarget line, before any rotation", () => {
    expect(lineAt("default", 0).actionStringVerbatim).toBe(
      "retarget,target_if=max:target.health,line_cd=5,if=fight_style.dungeonroute",
    );
    for (const build of [BUILD_A, BUILD_B]) {
      const selection = analyzed(build, [FIRST_INSTANT]).resolved[0]?.selection;
      expect(selection?.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
      expect(selection?.stoppingPoint).toMatchObject({
        at: "default[0] retarget",
        atoms: ["ACTION_OPTION:target_if"],
      });
      expect(selection?.undecidedCandidates).toEqual([]);
    }
  });

  it("a simulation's fight style is never read as a fact of a real fight: unwired to the SIMC-FB-A profile fallback it stays open, and is no row", () => {
    const keys = bindingsOf(factsOf(BUILD_A)).specAtoms?.bound.map((binding) => binding.key) ?? [];
    expect(keys).not.toContain("fight_style.dungeonroute");
    expect(SURVIVAL_UNBOUND_TRUTH_ATOMS).toContain("fight_style.dungeonroute");
  });

  it("with a fight style only a test can state, the engine refuses next at the swing, off the GCD, and the build's count dispatch stays open", () => {
    const facts = factsOf(BUILD_B);
    const base = bindingsOf(facts);
    if (base.specAtoms === undefined) throw new Error("no spec atoms");
    const outcome = survivalFirstGcdSelectionAt({
      authority: authority(),
      bindings: {
        ...base,
        specAtoms: {
          ...base.specAtoms,
          bound: [
            ...base.specAtoms.bound,
            { key: "fight_style.dungeonroute", actionToken: null, value: { kind: "TRUTH", value: false } },
          ],
        },
      },
      buildFacts: { talents: facts.talents, talentsProvenAbsent: facts.talentsProvenAbsent },
      observedAbilityGameId: INSTANT,
    });
    expect(outcome.result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    expect(outcome.rootScan.undecidedCandidates[0]?.at).toBe("default[1] auto_attack");
    expect(outcome.rootScan.stoppingPoint?.at).toBe("default[5] call_action_list");
    expect(outcome.rootScan.stoppingPoint?.atoms).toContain("active_enemies");
    expect(outcome.rootScan.dispatches.find((dispatch) => dispatch.at === "default[5]")?.gate).toBe(
      "UNKNOWN_STATE",
    );
  });

  it("auto_attack has a lane, off the GCD, and no contract, so it refuses and is never a free step", () => {
    expect(survivalExecutionLaneForToken("auto_attack")).toBe("NON_GCD");
    expect(survivalTransitionContractFor("auto_attack")).toBeNull();
  });

  it("retarget has no binding: it is the shared pseudo-action, so its lane is a refusal", () => {
    expect(survivalExecutionLaneForToken("retarget")).toBe("UNKNOWN_LANE");
    expect(survivalTokenBinding("retarget").kind).not.toBe("KNOWN_ONE");
  });

  it("the list reads no pet atom, so there is no pet state to build: a press proves its own pet, and nothing else is claimed", () => {
    const strings = authority().actions.map((action) => action.actionStringVerbatim);
    expect(strings.filter((text) => /\bpet\./.test(text))).toEqual([]);
    const keys = [...SURVIVAL_UNBOUND_NUMERIC_ATOMS, ...SURVIVAL_UNBOUND_TRUTH_ATOMS] as readonly string[];
    expect(keys.filter((key) => key.startsWith("pet."))).toEqual([]);
  });

  it("the list reads no hero_tree atom, so a resolved tree only disproves the other tree's talents", () => {
    const strings = authority().actions.map((action) => action.actionStringVerbatim);
    expect(strings.filter((text) => text.includes("hero_tree."))).toEqual([]);
    expect(
      bindingsOf(factsOf(BUILD_A)).specAtoms?.bound.filter((binding) => binding.key.startsWith("hero_tree.")),
    ).toEqual([]);
  });
});

describe("the constructor readings", () => {
  it("Kill Command binds Survival's own row, and Beast Mastery's is no press here", () => {
    const tokens = survivalTokenByAbilityId();
    expect(tokens.get(259489)).toBe("kill_command");
    expect(tokens.has(34026)).toBe(false);
  });

  it("Moonlight Chakram binds the action's spell, and the talent and buff rows are no press", () => {
    const tokens = survivalTokenByAbilityId();
    expect(tokens.get(1264949)).toBe("moonlight_chakram");
    for (const id of [1264902, 1264946, 1266081]) expect(tokens.has(id), String(id)).toBe(false);
  });

  it("Raptor Strike binds the talent's row, and raptor_strike_eagle's is off the list", () => {
    const tokens = survivalTokenByAbilityId();
    expect(tokens.get(186270)).toBe("raptor_strike");
    expect(tokens.has(265189)).toBe(false);
  });

  it("the off-GCD class actions are NON_GCD, and a logged one is excluded, never judged", () => {
    for (const [token, ability] of [
      ["muzzle", 187707],
      ["aspect_of_the_eagle", 186289],
    ] as const) {
      expect(survivalExecutionLaneForAbility(ability), token).toBe("NON_GCD");
      expect(survivalTransitionContractFor(token), token).toBeNull();
      const analysis = analyzed(BUILD_A, [{ t: 2000, ability }]);
      expect(analysis.comparisons, token).toHaveLength(0);
      expect(analysis.excluded[0]?.reason, token).toBe("NON_GCD_ACTION");
    }
  });
});

describe("what stays open", () => {
  it.each([
    ["full_recharge_time<4"],
    ["debuff.sentinels_mark.remains"],
    ["cooldown.takedown.remains<gcd"],
    ["buff.tip_of_the_spear.stack<2"],
    ["howl_summon.ready"],
    ["target.distance>=6"],
  ])("%s has nothing behind it, so it is UNKNOWN, never read as false or zero", (condition) => {
    const parsed = parseSimcExpression(condition, SURVIVAL_ATOM_VOCABULARY);
    if (!parsed.ok) throw new Error(parsed.fragment);
    expect(evaluateSimcExpression(parsed.ast, condition, bindingsOf(factsOf(BUILD_A))).outcome).toBe(
      "UNRESOLVED",
    );
  });
});
