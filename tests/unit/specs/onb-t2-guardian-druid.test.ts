/**
 * ONB-T2: Guardian Druid, a Cohort T follower and a tank whose mitigation stays out of the offensive authority.
 *
 * No retained subject exists, so everything here is synthetic. The mandatory negatives are the centre of it: a logged Ironfur or Barkskin is never judged,
 * an open enemy count never reads as single target, a missing talent never reads as false, and a tank's survival domains carry no authority.
 *
 * Synthetic on purpose. The authority views here answer with a single line, because only a test can get past the list's
 * real stopping point: they show what the anchor does when a scan finally resolves.
 */

import { describe, expect, it } from "vitest";

import guardianTalents from "../../../src/data/game/druid-guardian-talents.json";
import artifact from "../../../src/simc/data/druid-guardian.apl.json";
import {
  GUARDIAN_CAST_ROWS,
  guardianCastRowFor,
} from "../../../src/data/game/druid-guardian-cast-semantics.js";
import {
  guardianBaseGcdMsForAbility,
  guardianExecutionLaneForAbility,
  guardianExecutionLaneForToken,
  guardianTokenBinding,
  guardianTokenByAbilityId,
  pinnedGuardianDruidGcdSemantics,
} from "../../../src/data/game/druid-guardian-gcd-semantics.js";
import {
  pinnedGuardianDruidTalents,
  resolveGuardianHeroTree,
  resolveGuardianTalent,
} from "../../../src/data/game/druid-guardian-talents.js";
import { guardianTransitionContractFor } from "../../../src/data/game/druid-guardian-transition-authority.js";
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
  resolveGuardianApplicability,
  resolveGuardianUsability,
  TALENT_BUILT_TOKENS,
} from "../../../src/specs/druid/guardian/action-profile.js";
import {
  GUARDIAN_CAPABILITIES,
  standaloneGuardianAuthorityAccess,
} from "../../../src/specs/druid/guardian/authority-bindings.js";
import { guardianCastAnchorProfile } from "../../../src/specs/druid/guardian/cast-anchor-profile.js";
import { guardianNonDomainApplicabilityFor } from "../../../src/specs/druid/guardian/domain-boundary.js";
import { guardianFirstGcdSelectionAt } from "../../../src/specs/druid/guardian/first-gcd-adapter.js";
import { initialGuardianState } from "../../../src/specs/druid/guardian/first-gcd-state.js";
import { analyzeObservedGuardianDruidDecisions } from "../../../src/specs/druid/guardian/observed-analysis.js";
import { pinnedGuardianDruidAuthority } from "../../../src/specs/druid/guardian/pinned-authority.js";
import {
  guardianTalentsDisprovedByHeroTree,
  resolveGuardianAtoms,
} from "../../../src/specs/druid/guardian/resolver.js";
import {
  GUARDIAN_ATOM_VOCABULARY,
  GUARDIAN_TALENT_ENABLED_ATOMS,
} from "../../../src/specs/druid/guardian/vocabulary.js";
import {
  attachedResources,
  castEvent,
  classResource,
  FIGHT_START_MS,
  syntheticFight,
} from "../../support/synthetic-fight.js";

const SOURCE = 7;
const BOSS = 900;

const INSTANT = 33917;
const UNREVIEWED = 22842;

type Entry = { readonly id: number; readonly nodeId: number };

function entries(names: readonly string[]): readonly Entry[] {
  return names.map((name) => {
    const row = guardianTalents.talents.find((candidate) => candidate.simcName === name);
    if (row === undefined) throw new Error(`no pinned talent ${name}`);
    return { id: row.traitEntryId, nodeId: row.traitNodeId };
  });
}

/** druid_of_the_claw. */
const BUILD_A = [
  ...entries([
    "ironfur",
    "maul",
    "lunar_beam",
    "sundering_roar",
    "bristling_fur",
    "swipe",
    "rake",
    "rip",
    "fount_of_strength",
  ]),
];
/** elunes_chosen. */
const BUILD_B = entries([
  "ironfur",
  "maul",
  "lunar_beam",
  "sundering_roar",
  "bristling_fur",
  "swipe",
  "lunar_calling",
]);

function authority(): AplAuthority {
  const loaded = pinnedGuardianDruidAuthority();
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

/** The first line of the list whose condition reads this atom alone with it. */
function lineReading(atom: string): AplAction {
  const found = authority().actions.find(
    (action) =>
      action.listName !== "precombat" &&
      nonDomainCategoryOf(action.actionToken) === null &&
      ((action as { readonly conditionRaw?: string | null }).conditionRaw ?? "").includes(atom),
  );
  if (found === undefined) throw new Error(`no line reads ${atom}`);
  return found;
}

/** Offensive access whose `default` is exactly this one line: what only a test can reach. */
function accessAnswering(line: AplAction): AuthorityAccess {
  const pinned = authority();
  const standalone = standaloneGuardianAuthorityAccess();
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
  readonly talents: Record<string, ReturnType<typeof resolveGuardianTalent>>;
  readonly talentsProvenAbsent: Set<string>;
  readonly heroTree: ReturnType<typeof resolveGuardianHeroTree>;
}

/** The build facts, with every modelled talent the test names proven absent (only a test may). */
function factsOf(tree: readonly Entry[], absent: readonly string[] = []): Facts {
  const talents = Object.fromEntries(
    guardianTalents.talents.map((talent) => [talent.simcName, resolveGuardianTalent(tree, talent.simcName)]),
  );
  const heroTree = resolveGuardianHeroTree(tree);
  const talentsProvenAbsent = new Set<string>(guardianTalentsDisprovedByHeroTree(heroTree));
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
  const resolution = resolveGuardianAtoms({
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
                classResources: [classResource(1, step.power, { max: 100, cost: 0 })],
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
  return analyzeObservedGuardianDruidDecisions({
    state: fightWith(tree, steps, options.casts ?? "COMPLETE"),
    actorId: SOURCE,
    specId: "druid/guardian",
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
    const row = internalAnalyzerForSpec("druid/guardian", PRODUCTION_CATALOG) as AnalyzerRegistration;
    expect(row.analyzerId).toBe("druid-guardian-observed-decisions");
    expect(row.exposure).toBe("INTERNAL_ONLY");
    expect(analyzerForSpec("druid/guardian", PRODUCTION_CATALOG)).toBeNull();
    expect(resolveSpecIdentity({ className: "Druid", specName: "Guardian" }).ok).toBe(false);
  });

  it("refuses another specialization before reading anything of its own", () => {
    expect(
      analyzeObservedGuardianDruidDecisions({
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

  it("declares offensive authority only, and a tank's survival domains carry none", () => {
    const analysis = analyzed(BUILD_A, []);
    const byDomain = new Map(analysis.domains.map((result) => [result.domain, result.resolution]));
    expect(byDomain.get("OFFENSIVE_ROTATION")).toBe("AUTHORITY_AVAILABLE");
    for (const domain of [
      "RESOURCE_SPENDING",
      "ACTIVE_MITIGATION",
      "DEFENSIVE_COOLDOWN",
      "SELF_HEALING",
      "INTERRUPT",
    ] as const) {
      expect(byDomain.get(domain), domain).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
    }
  });

  it("declares no resource, because it reads none", () => {
    const offensive = GUARDIAN_CAPABILITIES.find((row) => row.domain === "OFFENSIVE_ROTATION");
    expect(offensive?.requirements.resources).toEqual([]);
    expect(offensive?.requirements.evidenceCategories).toEqual(["CASTS", "COMBATANT_INFO"]);
  });
});

describe("nothing on this list has a cast time", () => {
  it("no row claims one, so no begin is ever the anchor of a press", () => {
    expect(GUARDIAN_CAST_ROWS.filter((row) => row.baseCastMs !== 0)).toEqual([]);
    expect(
      GUARDIAN_CAST_ROWS.filter((row) => row.rule === "HARD_CAST" || row.rule === "INSTANT_ROW_NOT_EXCLUDED"),
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
    const analysis = analyzed(BUILD_A, [FIRST_INSTANT, { t: 2000, ability: 391528 }]);
    expect(analysis.resolved[1]?.anchor).toMatchObject({ state: "ESTABLISHED", source: "CHANNEL_START" });
    expect(analysis.comparisons[1]?.decision.fightTimeMs).toBe(2000);
  });

  it("never reads as idle after its cast, and no instant inside it reads as a mistake", () => {
    const timeline = buildCastTimeline({
      state: fightWith(BUILD_A, [FIRST_INSTANT, { t: 2000, ability: 391528 }]),
      actorId: SOURCE,
      profile: guardianCastAnchorProfile(),
    });
    expect(timeline.occupancyAt(FIGHT_START_MS + 2500)).toMatchObject({
      state: "UNKNOWN",
      reason: "CHANNEL_END_UNKNOWN",
    });
  });

  it("no channel bound is claimed, and it is the one reviewed channel", () => {
    expect(guardianCastAnchorProfile().channelDurationAt(completion(391528))).toEqual({
      kind: "UNKNOWN",
      reason: "CHANNEL_BOUND_NOT_REVIEWED",
    });
    expect(GUARDIAN_CAST_ROWS.filter((row) => row.rule === "CHANNEL").map((row) => row.simcToken)).toEqual([
      "convoke_the_spirits",
    ]);
  });
});

describe("no decision resolves", () => {
  it.each([
    ["druid_of_the_claw", BUILD_A],
    ["elunes_chosen", BUILD_B],
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

  it("a Rage value on the wire is not read: no row binds it", () => {
    const row = bindingsOf(factsOf(BUILD_A)).specAtoms?.bound.find((binding) => binding.key === "rage");
    expect(row?.value).toEqual({ kind: "MAGNITUDE", binding: unknownNumber("STATE_NOT_MODELLED") });
    const offensive = GUARDIAN_CAPABILITIES.find((capability) => capability.domain === "OFFENSIVE_ROTATION");
    expect(offensive?.requirements.resources).toEqual([]);
    const analysis = analyzed(BUILD_A, [FIRST_INSTANT, { t: 3000, ability: INSTANT, power: 100 }], {
      authority: accessAnswering(lineReading("rage")),
    });
    // A full bar on the cast would decide the line's own test. It is not read, so the comparison stays open.
    expect(analysis.comparisons[1]?.outcome).toBe("UNKNOWN");
  });
});

describe("the list as pinned", () => {
  it("is 55 actions in 4 lists", () => {
    expect(authority().actions).toHaveLength(55);
    expect(artifact.lists).toHaveLength(4);
  });

  it("records the live and PTR relationship it was extracted under", () => {
    expect(artifact.provenance.livePtrPolicy).toBe("PTR_SEPARATE_INCLUDE");
  });

  it("every in-domain condition outside precombat parses whole", () => {
    const refused = authority()
      .actions.filter((action) => action.listName !== "precombat")
      .filter((action) => nonDomainCategoryOf(action.actionToken) === null)
      .flatMap((action) => {
        const raw = (action as { readonly conditionRaw?: string | null }).conditionRaw ?? null;
        if (raw === null) return [];
        const parsed = parseSimcExpression(raw, GUARDIAN_ATOM_VOCABULARY) as { readonly ok?: boolean };
        return parsed.ok === true ? [] : [`${action.listName}[${String(action.priorityOrdinal)}]`];
      });
    expect(refused).toEqual([]);
  });

  it("every off-GCD action of the list has no contract, so a scan refuses rather than steps past it", () => {
    for (const [token, ability] of [
      ["ironfur", 192081],
      ["barkskin", 22812],
      ["berserk", 50334],
      ["heart_of_the_wild", 1261867],
    ] as readonly (readonly [string, number])[]) {
      expect(guardianExecutionLaneForAbility(ability), token).toBe("NON_GCD");
      expect(guardianTransitionContractFor(token), token).toBeNull();
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
      (action) =>
        action.listName === "bear" &&
        action.actionStringVerbatim.startsWith("mangle,") &&
        action.actionStringVerbatim.includes("active_enemies=1"),
    );
    if (line === undefined) throw new Error("no line");
    expect(line.actionStringVerbatim).toContain("active_enemies");
    const analysis = analyzed(BUILD_A, [FIRST_INSTANT], { authority: accessAnswering(line) });
    expect(analysis.comparisons[0]?.outcome).toBe("UNKNOWN");
  });

  it("a single target only a test can state still does not fall through to a confident answer", () => {
    const facts = factsOf(BUILD_A);
    const outcome = guardianFirstGcdSelectionAt({
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
    expect(resolveGuardianTalent(BUILD_A, "killing_blow").selection).toBe("UNKNOWN");
  });

  it("a resolved tree disproves only the other tree's talents", () => {
    expect(resolveGuardianHeroTree(BUILD_A)).toMatchObject({
      state: "RESOLVED",
      simcName: "druid_of_the_claw",
    });
    expect(resolveGuardianHeroTree(BUILD_B)).toMatchObject({ state: "RESOLVED", simcName: "elunes_chosen" });
    expect(guardianTalentsDisprovedByHeroTree(resolveGuardianHeroTree(BUILD_A))).toEqual([
      "lunar_calling",
      "lunation",
    ]);
    expect(guardianTalentsDisprovedByHeroTree(resolveGuardianHeroTree(BUILD_B))).toEqual([
      "fount_of_strength",
      "ravage",
      "wildpower_surge",
    ]);
  });

  it("an unresolved tree disproves nothing", () => {
    expect(guardianTalentsDisprovedByHeroTree(resolveGuardianHeroTree([]))).toEqual([]);
  });

  it("an action built on a talent proven absent is background; an unresolved one never is", () => {
    const line = authority().actions.find((action) => action.actionToken === "lunar_beam");
    if (line === undefined) throw new Error("no line");
    const proven = factsOf(BUILD_A, ["lunar_beam"]);
    expect(resolveGuardianApplicability(proven, line).kind).toBe("NOT_APPLICABLE");
    expect(resolveGuardianApplicability(factsOf([]), line).kind).toBe("UNKNOWN");
    expect(resolveGuardianApplicability(factsOf(entries(["lunar_beam"])), line).kind).toBe("APPLICABLE");
  });

  it("an action built on no talent has no guard", () => {
    const line = authority().actions.find((action) => action.actionToken === "mangle");
    if (line === undefined) throw new Error("no line");
    expect(resolveGuardianApplicability(factsOf([]), line).kind).toBe("APPLICABLE");
  });
});

describe("usability", () => {
  const usability = (action: AplAction, observed: number) =>
    resolveGuardianUsability({
      state: initialGuardianState(),
      action,
      observedAbilityGameId: observed,
    });

  it("the press proves its own token, and nothing else", () => {
    const line = authority().actions.find((action) => action.actionToken === "mangle");
    if (line === undefined) throw new Error("no line");
    expect(usability(line, INSTANT).kind).toBe("PROVEN_USABLE");
    expect(usability(line, UNREVIEWED).kind).toBe("UNKNOWN");
  });
});

describe("the domain boundary", () => {
  it("racials, items, the potion and the external buff cannot preempt a class action", () => {
    for (const [list, ordinal] of [
      ["cooldowns", 0],
      ["cooldowns", 1],
      ["cooldowns", 2],
    ] as readonly (readonly [string, number])[]) {
      const verdict = guardianNonDomainApplicabilityFor(lineAt(list, ordinal));
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
    expect(pinnedGuardianDruidGcdSemantics().ok).toBe(true);
    expect(pinnedGuardianDruidTalents().ok).toBe(true);
  });

  it("every cast row names the token the GCD dataset binds, and no token lacks a row", () => {
    const tokens = guardianTokenByAbilityId();
    for (const row of GUARDIAN_CAST_ROWS) {
      expect(tokens.get(row.abilityGameId), row.simcToken).toBe(row.simcToken);
    }
    for (const [abilityGameId, token] of tokens) {
      expect(guardianCastRowFor(abilityGameId)?.simcToken, token).toBe(token);
    }
  });

  it("an id off the list has no token, and its lane is a refusal", () => {
    const tokens = guardianTokenByAbilityId();
    expect(tokens.has(UNREVIEWED)).toBe(false);
    expect(guardianExecutionLaneForAbility(UNREVIEWED)).toBe("UNKNOWN_LANE");
    expect(guardianBaseGcdMsForAbility(UNREVIEWED)).toBeNull();
  });

  it("the press's own row binds its token", () => {
    expect(guardianTokenBinding("mangle")).toMatchObject({ kind: "KNOWN_ONE", abilityGameId: INSTANT });
  });
});

describe("what this list asks that nothing answers", () => {
  it("the engine refuses at the swing, and the scan stops at Heart of the Wild's unresolved talent, before any bear line and any enemy count", () => {
    for (const build of [BUILD_A, BUILD_B]) {
      const selection = analyzed(build, [FIRST_INSTANT]).resolved[0]?.selection;
      expect(selection?.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
      expect(selection?.blockedAt).toBe("default[0] auto_attack");
      expect(selection?.stoppingPoint).toMatchObject({
        at: "cooldowns[9] heart_of_the_wild",
        atoms: ["APPLICABILITY:heart_of_the_wild"],
      });
      expect(selection?.undecidedCandidates.map((candidate) => candidate.at)).toEqual([
        "default[0] auto_attack",
        "cooldowns[6] bristling_fur",
        "cooldowns[7] barkskin",
        "cooldowns[8] lunar_beam",
      ]);
    }
  });

  it("auto_attack has a lane, off the GCD, and no contract, so it refuses and is never a free step", () => {
    expect(guardianExecutionLaneForToken("auto_attack")).toBe("NON_GCD");
    expect(guardianTransitionContractFor("auto_attack")).toBeNull();
  });

  it("wild_guardian has no binding, because no retained cast names its id: its lane is a refusal", () => {
    expect(guardianTokenBinding("wild_guardian").kind).not.toBe("KNOWN_ONE");
    expect(guardianExecutionLaneForToken("wild_guardian")).toBe("UNKNOWN_LANE");
  });

  it("the list reads no hero_tree atom, so a resolved tree only disproves the other tree's talents", () => {
    const strings = authority().actions.map((action) => action.actionStringVerbatim);
    expect(strings.filter((text) => text.includes("hero_tree."))).toEqual([]);
    expect(
      bindingsOf(factsOf(BUILD_A)).specAtoms?.bound.filter((binding) => binding.key.startsWith("hero_tree.")),
    ).toEqual([]);
  });
});

describe("the tank's meaning stays out of the offensive authority", () => {
  it.each([
    ["Ironfur", 192081],
    ["Barkskin", 22812],
  ])("a logged %s is excluded as off-GCD and never judged", (_name, ability) => {
    const analysis = analyzed(BUILD_A, [{ t: 2000, ability }]);
    expect(analysis.comparisons).toHaveLength(0);
    expect(analysis.excluded.map((cast) => cast.reason)).toEqual(["NON_GCD_ACTION"]);
  });

  it("every other mitigation or healing spell is off the list and is excluded, never a press", () => {
    for (const ability of [22842, 61336, 200851]) {
      const analysis = analyzed(BUILD_A, [{ t: 2000, ability }]);
      expect(analysis.comparisons, String(ability)).toHaveLength(0);
      expect(analysis.excluded[0]?.reason, String(ability)).toBe("EXECUTION_LANE_NOT_ESTABLISHED");
    }
  });

  it("a press of Mangle is a rotational question and no more: the domains it could speak to stay without authority", () => {
    const analysis = analyzed(BUILD_A, [FIRST_INSTANT]);
    expect(analysis.comparisons[0]?.decision.observedToken).toBe("mangle");
    const mitigation = analysis.domains.find((result) => result.domain === "ACTIVE_MITIGATION");
    expect(mitigation?.resolution).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
  });
});

describe("the constructor readings", () => {
  const line = (token: string) => {
    const found = authority().actions.find((action) => action.actionToken === token);
    if (found === undefined) throw new Error(`no line for ${token}`);
    return found;
  };

  it.each([
    ["berserk", "incarnation_bear", "berserk_bear"],
    ["maul", "raze", "maul"],
  ] as const)(
    "%s is applicable with either of its two talents, background with both proven absent, and otherwise UNKNOWN",
    (token, one, other) => {
      expect(resolveGuardianApplicability(factsOf(entries([one])), line(token)).kind).toBe("APPLICABLE");
      expect(resolveGuardianApplicability(factsOf(entries([other])), line(token)).kind).toBe("APPLICABLE");
      expect(resolveGuardianApplicability(factsOf([], [one, other]), line(token)).kind).toBe(
        "NOT_APPLICABLE",
      );
      expect(resolveGuardianApplicability(factsOf([], [one]), line(token)).kind).toBe("UNKNOWN");
      expect(resolveGuardianApplicability(factsOf([]), line(token)).kind).toBe("UNKNOWN");
    },
  );

  it("each of a two-action token's ids reads back to it, so a logged press of either is that token", () => {
    const tokens = guardianTokenByAbilityId();
    expect(tokens.get(50334)).toBe("berserk");
    expect(tokens.get(102558)).toBe("berserk");
    expect(tokens.get(6807)).toBe("maul");
    expect(tokens.get(400254)).toBe("maul");
  });

  it("Moonkin Form binds both its rows, and the talent is the class-wide row find_talent_spell takes", () => {
    const tokens = guardianTokenByAbilityId();
    expect(tokens.get(24858)).toBe("moonkin_form");
    expect(tokens.get(197625)).toBe("moonkin_form");
    expect(guardianTalents.talents.find((talent) => talent.simcName === "moonkin_form")?.traitEntryId).toBe(
      103286,
    );
  });

  it("swipe_bear is built on the swipe talent, and the cat row is no press", () => {
    expect(TALENT_BUILT_TOKENS["swipe_bear"]).toBe("swipe");
    const tokens = guardianTokenByAbilityId();
    expect(tokens.get(213771)).toBe("swipe_bear");
    expect(tokens.has(106785)).toBe(false);
    expect(tokens.has(213764)).toBe(false);
  });

  it("the off-GCD class actions are NON_GCD, and none has a contract, so a scan refuses rather than steps past it", () => {
    for (const [token, ability] of [
      ["ironfur", 192081],
      ["barkskin", 22812],
      ["berserk", 50334],
      ["berserk", 102558],
      ["heart_of_the_wild", 1261867],
    ] as const) {
      expect(guardianExecutionLaneForAbility(ability), token).toBe("NON_GCD");
      expect(guardianTransitionContractFor(token), token).toBeNull();
    }
  });
});

describe("talent.<name>.enabled", () => {
  const row = (facts: Facts, key: string) =>
    bindingsOf(facts).specAtoms?.bound.find((binding) => binding.key === key);

  it("is true for a taken talent, false for one proven absent, and no row at all otherwise", () => {
    expect(row(factsOf(BUILD_A), "talent.fount_of_strength.enabled")?.value).toEqual({
      kind: "TRUTH",
      value: true,
    });
    expect(row(factsOf(BUILD_B), "talent.fount_of_strength.enabled")?.value).toEqual({
      kind: "TRUTH",
      value: false,
    });
    expect(row(factsOf([]), "talent.fount_of_strength.enabled")).toBeUndefined();
    expect(row(factsOf(BUILD_A), "talent.lunation.enabled")?.value).toEqual({ kind: "TRUTH", value: false });
  });

  it("every enabled atom names a talent the data pins, so none is silently unreadable", () => {
    const pinned = new Set(guardianTalents.talents.map((talent) => talent.simcName));
    for (const key of GUARDIAN_TALENT_ENABLED_ATOMS) {
      expect(pinned.has(key.slice("talent.".length, -".enabled".length)), key).toBe(true);
    }
  });

  it("a rank is a magnitude nothing states, so a line reading one stays open", () => {
    const parsed = parseSimcExpression("talent.flashing_claws.rank=2", GUARDIAN_ATOM_VOCABULARY);
    if (!parsed.ok) throw new Error(parsed.fragment);
    expect(
      evaluateSimcExpression(parsed.ast, "talent.flashing_claws.rank=2", bindingsOf(factsOf(BUILD_A)))
        .outcome,
    ).toBe("UNRESOLVED");
  });
});

describe("what stays open", () => {
  it.each([
    ["rage>=40"],
    ["cooldown.heart_of_the_wild.up"],
    ["dot.thrash.stack<3"],
    ["dot.rip.refreshable"],
    ["buff.feline_potential_counter.stack=6"],
    ["talent.flashing_claws.rank=2"],
    ["set_bonus.midnight_season_2_4pc"],
    ["target.cooldown.pause_action.remains"],
  ])("%s has nothing behind it, so it is UNKNOWN, never read as false or zero", (condition) => {
    const parsed = parseSimcExpression(condition, GUARDIAN_ATOM_VOCABULARY);
    if (!parsed.ok) throw new Error(parsed.fragment);
    expect(evaluateSimcExpression(parsed.ast, condition, bindingsOf(factsOf(BUILD_A))).outcome).toBe(
      "UNRESOLVED",
    );
  });
});
