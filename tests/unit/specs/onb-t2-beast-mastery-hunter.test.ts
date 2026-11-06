/**
 * ONB-T2: Beast Mastery Hunter, a Cohort T follower, on four uncommitted retained subjects.
 *
 * No decision resolves on real evidence (agent/architecture.md "ONB-T2"), so the mandatory negatives are the centre of it: a decision whose moment is not
 * established is never judged, an open enemy count never reads as single target, a missing talent never reads as false, a fight style is never a fact, and a
 * wire Focus value is never read as the decision's.
 *
 * Synthetic on purpose. The authority views here answer with a single line, because only a test can get past the list's
 * real stopping point: they show what the anchor does when a scan finally resolves.
 */

import { describe, expect, it } from "vitest";

import beastMasteryTalents from "../../../src/data/game/hunter-beast_mastery-talents.json";
import artifact from "../../../src/simc/data/hunter-beast_mastery.apl.json";
import {
  BEAST_MASTERY_CAST_ROWS,
  beastMasteryCastRowFor,
} from "../../../src/data/game/hunter-beast_mastery-cast-semantics.js";
import {
  beastMasteryBaseGcdMsForAbility,
  beastMasteryExecutionLaneForAbility,
  beastMasteryExecutionLaneForToken,
  beastMasteryTokenBinding,
  beastMasteryTokenByAbilityId,
  pinnedBeastMasteryHunterGcdSemantics,
} from "../../../src/data/game/hunter-beast_mastery-gcd-semantics.js";
import {
  pinnedBeastMasteryHunterTalents,
  resolveBeastMasteryHeroTree,
  resolveBeastMasteryTalent,
} from "../../../src/data/game/hunter-beast_mastery-talents.js";
import { beastMasteryTransitionContractFor } from "../../../src/data/game/hunter-beast_mastery-transition-authority.js";
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
  resolveBeastMasteryApplicability,
  resolveBeastMasteryUsability,
  TALENT_BUILT_TOKENS,
} from "../../../src/specs/hunter/beast_mastery/action-profile.js";
import {
  BEAST_MASTERY_CAPABILITIES,
  standaloneBeastMasteryAuthorityAccess,
} from "../../../src/specs/hunter/beast_mastery/authority-bindings.js";
import { beastMasteryCastAnchorProfile } from "../../../src/specs/hunter/beast_mastery/cast-anchor-profile.js";
import { beastMasteryNonDomainApplicabilityFor } from "../../../src/specs/hunter/beast_mastery/domain-boundary.js";
import { beastMasteryFirstGcdSelectionAt } from "../../../src/specs/hunter/beast_mastery/first-gcd-adapter.js";
import { initialBeastMasteryState } from "../../../src/specs/hunter/beast_mastery/first-gcd-state.js";
import { analyzeObservedBeastMasteryHunterDecisions } from "../../../src/specs/hunter/beast_mastery/observed-analysis.js";
import { pinnedBeastMasteryHunterAuthority } from "../../../src/specs/hunter/beast_mastery/pinned-authority.js";
import { BEAST_MASTERY_HUNTER_MODULE } from "../../../src/specs/hunter/beast_mastery/registration.js";
import {
  beastMasteryTalentsDisprovedByHeroTree,
  resolveBeastMasteryAtoms,
} from "../../../src/specs/hunter/beast_mastery/resolver.js";
import {
  BEAST_MASTERY_ATOM_VOCABULARY,
  BEAST_MASTERY_UNBOUND_NUMERIC_ATOMS,
  BEAST_MASTERY_UNBOUND_TRUTH_ATOMS,
} from "../../../src/specs/hunter/beast_mastery/vocabulary.js";
import {
  attachedResources,
  castEvent,
  classResource,
  FIGHT_START_MS,
  syntheticFight,
} from "../../support/synthetic-fight.js";

const SOURCE = 7;
const BOSS = 900;

const INSTANT = 193455;
const UNREVIEWED = 109304;

type Entry = { readonly id: number; readonly nodeId: number };

function entries(names: readonly string[]): readonly Entry[] {
  return names.map((name) => {
    const row = beastMasteryTalents.talents.find((candidate) => candidate.simcName === name);
    if (row === undefined) throw new Error(`no pinned talent ${name}`);
    return { id: row.traitEntryId, nodeId: row.traitNodeId };
  });
}

/** An entry of a hero tree no pinned talent names: enough to resolve the tree. */
function heroEntry(tree: string): Entry {
  const row = beastMasteryTalents.heroTrees.find((candidate) => candidate.simcName === tree)?.entries[0];
  if (row === undefined) throw new Error(`no hero tree ${tree}`);
  return { id: row.traitEntryId, nodeId: row.traitNodeId };
}

/** pack_leader. */
const BUILD_A = [
  ...entries(["barbed_shot", "bestial_wrath", "cobra_shot", "kill_command", "wild_thrash", "beast_cleave"]),
  heroEntry("pack_leader"),
];
/** dark_ranger. */
const BUILD_B = entries([
  "barbed_shot",
  "bestial_wrath",
  "cobra_shot",
  "kill_command",
  "wild_thrash",
  "black_arrow",
  "wailing_dead",
]);

function authority(): AplAuthority {
  const loaded = pinnedBeastMasteryHunterAuthority();
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
  const standalone = standaloneBeastMasteryAuthorityAccess();
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
  readonly talents: Record<string, ReturnType<typeof resolveBeastMasteryTalent>>;
  readonly talentsProvenAbsent: Set<string>;
  readonly heroTree: ReturnType<typeof resolveBeastMasteryHeroTree>;
}

/** The build facts, with every modelled talent the test names proven absent (only a test may). */
function factsOf(tree: readonly Entry[], absent: readonly string[] = []): Facts {
  const talents = Object.fromEntries(
    beastMasteryTalents.talents.map((talent) => [
      talent.simcName,
      resolveBeastMasteryTalent(tree, talent.simcName),
    ]),
  );
  const heroTree = resolveBeastMasteryHeroTree(tree);
  const talentsProvenAbsent = new Set<string>(beastMasteryTalentsDisprovedByHeroTree(heroTree));
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
  const resolution = resolveBeastMasteryAtoms({
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
  return analyzeObservedBeastMasteryHunterDecisions({
    state: fightWith(tree, steps, options.casts ?? "COMPLETE"),
    actorId: SOURCE,
    specId: "hunter/beast_mastery",
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
    const row = internalAnalyzerForSpec("hunter/beast_mastery", PRODUCTION_CATALOG) as AnalyzerRegistration;
    expect(row.analyzerId).toBe("hunter-beast_mastery-observed-decisions");
    expect(row.exposure).toBe("INTERNAL_ONLY");
    expect(analyzerForSpec("hunter/beast_mastery", PRODUCTION_CATALOG)).toBeNull();
    expect(resolveSpecIdentity({ className: "Hunter", specName: "BeastMastery" }).ok).toBe(false);
  });

  it("refuses another specialization before reading anything of its own", () => {
    expect(
      analyzeObservedBeastMasteryHunterDecisions({
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
    const offensive = BEAST_MASTERY_CAPABILITIES.find((row) => row.domain === "OFFENSIVE_ROTATION");
    expect(offensive?.requirements.resources).toEqual([]);
    expect(offensive?.requirements.evidenceCategories).toEqual(["CASTS", "COMBATANT_INFO"]);
  });
});

const HARD_CAST = 392060;

describe("the anchor is when the decision was made", () => {
  it("a hard cast is decided at its begin: the decision's times are the begin's, its identity the completion's", () => {
    const analysis = analyzed(BUILD_B, [
      FIRST_INSTANT,
      { t: 2000, ability: HARD_CAST, phase: "BEGIN" },
      { t: 3000, ability: HARD_CAST },
    ]);
    const comparison = analysis.comparisons[1];
    expect(comparison?.decision.observedToken).toBe("wailing_arrow");
    expect(analysis.resolved[1]?.anchor).toMatchObject({
      state: "ESTABLISHED",
      source: "OBSERVED_BEGINCAST",
    });
    expect(comparison?.decision.reportTimeMs).toBe(FIGHT_START_MS + 2000);
    expect(comparison?.decision.fightTimeMs).toBe(2000);
    expect(comparison?.decision.locator.rawType).toBe("cast");
  });

  it("an instant is decided when it lands", () => {
    const analysis = analyzed(BUILD_A, [FIRST_INSTANT, { t: 2000, ability: INSTANT }]);
    expect(analysis.resolved[1]?.anchor).toMatchObject({
      state: "ESTABLISHED",
      source: "INSTANT_COMPLETION",
    });
    expect(analysis.comparisons[1]?.decision.fightTimeMs).toBe(2000);
  });

  it("a begin that never completes is no decision, and no missed action is built on it", () => {
    const analysis = analyzed(BUILD_B, [FIRST_INSTANT, { t: 2000, ability: HARD_CAST, phase: "BEGIN" }]);
    expect(analysis.comparisons).toHaveLength(1);
    expect(analysis.excluded).toHaveLength(0);
    expect(analysis.coverage.eligibleDecisions).toBe(1);
  });
});

describe("no moment, no verdict", () => {
  const ONLY_HARD_CAST = () => accessAnswering(unconditional("wailing_arrow"));

  it("the same press MATCHes when its begin is observed: the authority view does resolve", () => {
    const analysis = analyzed(
      BUILD_B,
      [
        { t: 2000, ability: HARD_CAST, phase: "BEGIN" },
        { t: 3000, ability: HARD_CAST },
      ],
      { authority: ONLY_HARD_CAST() },
    );
    expect(analysis.comparisons[0]?.outcome).toBe("MATCH");
    expect(analysis.resolved[0]?.anchor).toMatchObject({ state: "ESTABLISHED" });
  });

  it("with complete cast coverage and no begin, it is UNKNOWN, never inferred instant, and never a MATCH", () => {
    const analysis = analyzed(
      BUILD_B,
      [
        { t: 1000, ability: HARD_CAST, phase: "BEGIN" },
        { t: 2000, ability: HARD_CAST },
        { t: 3000, ability: HARD_CAST },
      ],
      { authority: ONLY_HARD_CAST() },
    );
    expect(analysis.resolved[1]?.anchor).toMatchObject({
      state: "UNKNOWN",
      reason: "BEGINCAST_NOT_OBSERVED",
    });
    expect(analysis.comparisons[1]?.outcome).toBe("UNKNOWN");
    expect(analysis.comparisons[1]?.rawBlocker).toBe("DECISION_ANCHOR_NOT_ESTABLISHED");
  });

  it("with no cast coverage it is UNKNOWN on the coverage reason: a missing page is never an instant cast", () => {
    const analysis = analyzed(BUILD_B, [FIRST_INSTANT, { t: 3000, ability: HARD_CAST }], {
      authority: ONLY_HARD_CAST(),
      casts: "UNVERIFIED",
    });
    expect(analysis.resolved[1]?.anchor).toMatchObject({ state: "UNKNOWN", reason: "CAST_TIME_UNKNOWN" });
    expect(analysis.comparisons[1]?.outcome).toBe("UNKNOWN");
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

  it("no instant inside a hard cast reads as idle", () => {
    const timeline = buildCastTimeline({
      state: fightWith(BUILD_B, [
        FIRST_INSTANT,
        { t: 2000, ability: HARD_CAST, phase: "BEGIN" },
        { t: 3000, ability: HARD_CAST },
      ]),
      actorId: SOURCE,
      profile: beastMasteryCastAnchorProfile(),
    });
    expect(timeline.occupancyAt(FIGHT_START_MS + 2500).state).toBe("CASTING");
  });

  it("no cast time is ever exact, so no anchor is ever derived from a completion", () => {
    const fact = beastMasteryCastAnchorProfile().castTimeAt(completion(HARD_CAST));
    expect(fact.kind).toBe("POSITIVE");
    if (fact.kind === "POSITIVE") expect(fact.exactMs).toBeNull();
  });
});

describe("the list has no channel", () => {
  it("no row is one", () => {
    expect(BEAST_MASTERY_CAST_ROWS.filter((row) => row.rule === "CHANNEL")).toEqual([]);
  });
});

describe("no decision resolves", () => {
  it.each([
    ["pack_leader", BUILD_A],
    ["dark_ranger", BUILD_B],
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

  it("a Focus value on the wire is not read: no row binds it", () => {
    const row = bindingsOf(factsOf(BUILD_A)).specAtoms?.bound.find((binding) => binding.key === "focus");
    expect(row?.value).toEqual({ kind: "MAGNITUDE", binding: unknownNumber("STATE_NOT_MODELLED") });
    const offensive = BEAST_MASTERY_CAPABILITIES.find(
      (capability) => capability.domain === "OFFENSIVE_ROTATION",
    );
    expect(offensive?.requirements.resources).toEqual([]);
    const analysis = analyzed(BUILD_A, [FIRST_INSTANT, { t: 3000, ability: INSTANT, power: 100 }], {
      authority: accessAnswering(lineReading("focus")),
    });
    // A full bar on the cast would decide the line's own test. It is not read, so the comparison stays open.
    expect(analysis.comparisons[1]?.outcome).toBe("UNKNOWN");
  });
});

describe("the list as pinned", () => {
  it("is 55 actions in 8 lists", () => {
    expect(authority().actions).toHaveLength(55);
    expect(artifact.lists).toHaveLength(8);
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
        const parsed = parseSimcExpression(raw, BEAST_MASTERY_ATOM_VOCABULARY) as { readonly ok?: boolean };
        return parsed.ok === true ? [] : [`${action.listName}[${String(action.priorityOrdinal)}]`];
      });
    expect(refused).toEqual([]);
  });

  it("no bound action of the list is off the GCD", () => {
    for (const row of BEAST_MASTERY_CAST_ROWS) {
      expect(beastMasteryExecutionLaneForAbility(row.abilityGameId), row.simcToken).toBe("GCD_CONSUMING");
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
      (action) => action.listName === "st" && action.actionStringVerbatim.startsWith("wild_thrash,"),
    );
    if (line === undefined) throw new Error("no line");
    expect(line.actionStringVerbatim).toContain("active_enemies");
    const analysis = analyzed(BUILD_A, [FIRST_INSTANT], { authority: accessAnswering(line) });
    expect(analysis.comparisons[0]?.outcome).toBe("UNKNOWN");
  });

  it("a single target only a test can state still does not fall through to a confident answer", () => {
    const facts = factsOf(BUILD_A);
    const outcome = beastMasteryFirstGcdSelectionAt({
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
    expect(resolveBeastMasteryTalent(BUILD_A, "master_handler").selection).toBe("UNKNOWN");
  });

  it("a resolved tree disproves only the other tree's talents", () => {
    expect(resolveBeastMasteryHeroTree(BUILD_A)).toMatchObject({
      state: "RESOLVED",
      simcName: "pack_leader",
    });
    expect(resolveBeastMasteryHeroTree(BUILD_B)).toMatchObject({
      state: "RESOLVED",
      simcName: "dark_ranger",
    });
    expect(beastMasteryTalentsDisprovedByHeroTree(resolveBeastMasteryHeroTree(BUILD_A))).toEqual([
      "black_arrow",
      "wailing_dead",
    ]);
    expect(beastMasteryTalentsDisprovedByHeroTree(resolveBeastMasteryHeroTree(BUILD_B))).toEqual([]);
  });

  it("an unresolved tree disproves nothing", () => {
    expect(beastMasteryTalentsDisprovedByHeroTree(resolveBeastMasteryHeroTree([]))).toEqual([]);
  });

  it("an action built on a talent proven absent is background; an unresolved one never is", () => {
    const line = authority().actions.find((action) => action.actionToken === "bestial_wrath");
    if (line === undefined) throw new Error("no line");
    const proven = factsOf(BUILD_A, ["bestial_wrath"]);
    expect(resolveBeastMasteryApplicability(proven, line).kind).toBe("NOT_APPLICABLE");
    expect(resolveBeastMasteryApplicability(factsOf([]), line).kind).toBe("UNKNOWN");
    expect(resolveBeastMasteryApplicability(factsOf(entries(["bestial_wrath"])), line).kind).toBe(
      "APPLICABLE",
    );
  });
});

describe("usability", () => {
  const usability = (action: AplAction, observed: number) =>
    resolveBeastMasteryUsability({
      state: initialBeastMasteryState(),
      action,
      observedAbilityGameId: observed,
    });

  it("the press proves its own token, and nothing else", () => {
    const line = authority().actions.find((action) => action.actionToken === "cobra_shot");
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
      ["trinkets", 0],
    ] as readonly (readonly [string, number])[]) {
      const verdict = beastMasteryNonDomainApplicabilityFor(lineAt(list, ordinal));
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
    expect(pinnedBeastMasteryHunterGcdSemantics().ok).toBe(true);
    expect(pinnedBeastMasteryHunterTalents().ok).toBe(true);
  });

  it("every cast row names the token the GCD dataset binds, and no token lacks a row", () => {
    const tokens = beastMasteryTokenByAbilityId();
    for (const row of BEAST_MASTERY_CAST_ROWS) {
      expect(tokens.get(row.abilityGameId), row.simcToken).toBe(row.simcToken);
    }
    for (const [abilityGameId, token] of tokens) {
      expect(beastMasteryCastRowFor(abilityGameId)?.simcToken, token).toBe(token);
    }
  });

  it("an id off the list has no token, and its lane is a refusal", () => {
    const tokens = beastMasteryTokenByAbilityId();
    expect(tokens.has(UNREVIEWED)).toBe(false);
    expect(beastMasteryExecutionLaneForAbility(UNREVIEWED)).toBe("UNKNOWN_LANE");
    expect(beastMasteryBaseGcdMsForAbility(UNREVIEWED)).toBeNull();
  });

  it("the press's own row binds its token", () => {
    expect(beastMasteryTokenBinding("cobra_shot")).toMatchObject({
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

  it("a simulation's fight style is never read as a fact of a real fight: it stays open, and is no row", () => {
    const keys = bindingsOf(factsOf(BUILD_A)).specAtoms?.bound.map((binding) => binding.key) ?? [];
    expect(keys).not.toContain("fight_style.dungeonroute");
    expect(BEAST_MASTERY_UNBOUND_TRUTH_ATOMS).toContain("fight_style.dungeonroute");
  });

  it("with a fight style only a test can state, the engine refuses next at the swing, off the GCD, and the build's count dispatch stays open", () => {
    const facts = factsOf(BUILD_B);
    const base = bindingsOf(facts);
    if (base.specAtoms === undefined) throw new Error("no spec atoms");
    const outcome = beastMasteryFirstGcdSelectionAt({
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
    expect(outcome.rootScan.undecidedCandidates[0]?.at).toBe("default[1] auto_shot");
    expect(outcome.rootScan.stoppingPoint?.at).toBe("default[5] call_action_list");
    expect(outcome.rootScan.stoppingPoint?.atoms).toContain("active_enemies");
    expect(outcome.rootScan.dispatches.find((dispatch) => dispatch.at === "default[5]")?.gate).toBe(
      "UNKNOWN_STATE",
    );
  });

  it("auto_shot has a lane, off the GCD, and no contract, so it refuses and is never a free step", () => {
    expect(beastMasteryExecutionLaneForToken("auto_shot")).toBe("NON_GCD");
    expect(beastMasteryTransitionContractFor("auto_shot")).toBeNull();
  });

  it("retarget has no binding: it is the shared pseudo-action, so its lane is a refusal", () => {
    expect(beastMasteryExecutionLaneForToken("retarget")).toBe("UNKNOWN_LANE");
    expect(beastMasteryTokenBinding("retarget").kind).not.toBe("KNOWN_ONE");
  });

  it("the list reads no pet atom, so there is no pet state to build: a press proves its own pet, and nothing else is claimed", () => {
    const strings = authority().actions.map((action) => action.actionStringVerbatim);
    expect(strings.filter((text) => /\bpet\./.test(text))).toEqual([]);
    const keys = [
      ...BEAST_MASTERY_UNBOUND_NUMERIC_ATOMS,
      ...BEAST_MASTERY_UNBOUND_TRUTH_ATOMS,
    ] as readonly string[];
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
  it("Wailing Arrow is built on Wailing Dead, not on a talent of its own name", () => {
    const line = authority().actions.find((action) => action.actionToken === "wailing_arrow");
    if (line === undefined) throw new Error("no line");
    expect(TALENT_BUILT_TOKENS["wailing_arrow"]).toBe("wailing_dead");
    expect(resolveBeastMasteryApplicability(factsOf(BUILD_B), line).kind).toBe("APPLICABLE");
    expect(resolveBeastMasteryApplicability(factsOf(BUILD_A), line).kind).toBe("NOT_APPLICABLE");
    expect(resolveBeastMasteryApplicability(factsOf([]), line).kind).toBe("UNKNOWN");
  });

  it("the player's action is the press: the pet's rows of the same name, and Marksmanship's Black Arrow, are not", () => {
    const tokens = beastMasteryTokenByAbilityId();
    expect(tokens.get(19574)).toBe("bestial_wrath");
    expect(tokens.get(34026)).toBe("kill_command");
    expect(tokens.get(1264359)).toBe("wild_thrash");
    expect(tokens.get(466930)).toBe("black_arrow");
    for (const id of [344572, 83381, 1264355, 466932]) expect(tokens.has(id), String(id)).toBe(false);
  });

  it("Dire Beast is off the list: a logged one is excluded, never a press, as every retained subject's is", () => {
    const analysis = analyzed(BUILD_A, [{ t: 2000, ability: 1308188 }]);
    expect(analysis.comparisons).toHaveLength(0);
    expect(analysis.excluded.map((cast) => cast.reason)).toEqual(["EXECUTION_LANE_NOT_ESTABLISHED"]);
  });
});

describe("the wire name is not the roster key", () => {
  it("the module states the wire's BeastMastery, and its id is the roster's beast_mastery", () => {
    expect(BEAST_MASTERY_HUNTER_MODULE.identity.specId).toBe("hunter/beast_mastery");
    expect(BEAST_MASTERY_HUNTER_MODULE.identity.wclSpecName).toBe("BeastMastery");
    expect(BEAST_MASTERY_HUNTER_MODULE.identity.wclClassName).toBe("Hunter");
  });
});

describe("what stays open", () => {
  it.each([
    ["focus<75"],
    ["full_recharge_time<gcd"],
    ["buff.cobra_fang.at_max_stacks"],
    ["cooldown.barbed_shot.charges_fractional<1.4"],
    ["cooldown.bestial_wrath.remains>gcd"],
    ["howl_summon.ready"],
    ["!apex.3"],
    ["max_prio_damage"],
  ])("%s has nothing behind it, so it is UNKNOWN, never read as false or zero", (condition) => {
    const parsed = parseSimcExpression(condition, BEAST_MASTERY_ATOM_VOCABULARY);
    if (!parsed.ok) throw new Error(parsed.fragment);
    expect(evaluateSimcExpression(parsed.ast, condition, bindingsOf(factsOf(BUILD_A))).outcome).toBe(
      "UNRESOLVED",
    );
  });
});
