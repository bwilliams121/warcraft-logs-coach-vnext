/**
 * ONB-X1: Fire Mage, its own representative on the shared ONB-S4 cast anchor.
 *
 * No decision resolves on real evidence, so the mandatory negatives are the centre of it: a decision whose moment is not
 * established is never judged, a possibly-instant cast is never anchored at a begin, a cast-time completion with no begin is
 * never read as instant, a begin alone is never a decision, an open enemy count never reads as single target, a missing talent
 * never reads as false, an unread Hot Streak never decides anything, and a wire Mana value is never read at all.
 *
 * Synthetic on purpose. The authority views here answer with a single line, because only a test can get past the list's
 * real stopping point: they show what the anchor does when a scan finally resolves.
 */

import { describe, expect, it } from "vitest";

import fireTalents from "../../../src/data/game/mage-fire-talents.json";
import artifact from "../../../src/simc/data/mage-fire.apl.json";
import { FIRE_CAST_ROWS, fireCastRowFor } from "../../../src/data/game/mage-fire-cast-semantics.js";
import {
  fireBaseGcdMsForAbility,
  fireExecutionLaneForAbility,
  fireTokenBinding,
  fireTokenByAbilityId,
  pinnedFireMageGcdSemantics,
} from "../../../src/data/game/mage-fire-gcd-semantics.js";
import {
  pinnedFireMageTalents,
  resolveFireHeroTree,
  resolveFireTalent,
} from "../../../src/data/game/mage-fire-talents.js";
import { fireTransitionContractFor } from "../../../src/data/game/mage-fire-transition-authority.js";
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
  resolveFireApplicability,
  resolveFireUsability,
  TALENT_BUILT_TOKENS,
} from "../../../src/specs/mage/fire/action-profile.js";
import {
  FIRE_CAPABILITIES,
  standaloneFireAuthorityAccess,
} from "../../../src/specs/mage/fire/authority-bindings.js";
import { fireCastAnchorProfile } from "../../../src/specs/mage/fire/cast-anchor-profile.js";
import { fireNonDomainApplicabilityFor } from "../../../src/specs/mage/fire/domain-boundary.js";
import { fireFirstGcdSelectionAt } from "../../../src/specs/mage/fire/first-gcd-adapter.js";
import { initialFireState } from "../../../src/specs/mage/fire/first-gcd-state.js";
import { analyzeObservedFireMageDecisions } from "../../../src/specs/mage/fire/observed-analysis.js";
import { pinnedFireMageAuthority } from "../../../src/specs/mage/fire/pinned-authority.js";
import { fireTalentsDisprovedByHeroTree, resolveFireAtoms } from "../../../src/specs/mage/fire/resolver.js";
import {
  FIRE_ATOM_VOCABULARY,
  FIRE_UNBOUND_NUMERIC_ATOMS,
  FIRE_UNBOUND_TRUTH_ATOMS,
} from "../../../src/specs/mage/fire/vocabulary.js";
import {
  attachedResources,
  castEvent,
  classResource,
  FIGHT_START_MS,
  syntheticFight,
} from "../../support/synthetic-fight.js";

const SOURCE = 7;
const BOSS = 900;

const HARD_CAST = 133;
const INSTANT = 153561;
const UNREVIEWED = 235313;

type Entry = { readonly id: number; readonly nodeId: number };

function entries(names: readonly string[]): readonly Entry[] {
  return names.map((name) => {
    const row = fireTalents.talents.find((candidate) => candidate.simcName === name);
    if (row === undefined) throw new Error(`no pinned talent ${name}`);
    return { id: row.traitEntryId, nodeId: row.traitNodeId };
  });
}

const BUILD_A = entries([
  "combustion",
  "fire_blast",
  "meteor",
  "pyroblast",
  "scorch",
  "firestarter",
  "spellfire_spheres",
]);
const BUILD_B = entries([
  "combustion",
  "fire_blast",
  "meteor",
  "pyroblast",
  "scorch",
  "firestarter",
  "frostfire_bolt",
]);

function authority(): AplAuthority {
  const loaded = pinnedFireMageAuthority();
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
  const standalone = standaloneFireAuthorityAccess();
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
  readonly talents: Record<string, ReturnType<typeof resolveFireTalent>>;
  readonly talentsProvenAbsent: Set<string>;
  readonly heroTree: ReturnType<typeof resolveFireHeroTree>;
}

/** The build facts, with every modelled talent the test names proven absent (only a test may). */
function factsOf(tree: readonly Entry[], absent: readonly string[] = []): Facts {
  const talents = Object.fromEntries(
    fireTalents.talents.map((talent) => [talent.simcName, resolveFireTalent(tree, talent.simcName)]),
  );
  const heroTree = resolveFireHeroTree(tree);
  const talentsProvenAbsent = new Set<string>(fireTalentsDisprovedByHeroTree(heroTree));
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
  const resolution = resolveFireAtoms({
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
                classResources: [classResource(0, step.power, { max: 100, cost: 0 })],
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
  return analyzeObservedFireMageDecisions({
    state: fightWith(tree, steps, options.casts ?? "COMPLETE"),
    actorId: SOURCE,
    specId: "mage/fire",
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
    const row = internalAnalyzerForSpec("mage/fire", PRODUCTION_CATALOG) as AnalyzerRegistration;
    expect(row.analyzerId).toBe("mage-fire-observed-decisions");
    expect(row.exposure).toBe("INTERNAL_ONLY");
    expect(analyzerForSpec("mage/fire", PRODUCTION_CATALOG)).toBeNull();
    expect(resolveSpecIdentity({ className: "Mage", specName: "Fire" }).ok).toBe(false);
  });

  it("refuses another specialization before reading anything of its own", () => {
    expect(
      analyzeObservedFireMageDecisions({
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
    const offensive = FIRE_CAPABILITIES.find((row) => row.domain === "OFFENSIVE_ROTATION");
    expect(offensive?.requirements.resources).toEqual([]);
    expect(offensive?.requirements.evidenceCategories).toEqual(["CASTS", "COMBATANT_INFO"]);
  });
});

describe("the anchor is when the decision was made", () => {
  it("a hard cast is decided at its begin: the decision's times are the begin's, its identity the completion's", () => {
    const analysis = analyzed(BUILD_A, [
      FIRST_INSTANT,
      { t: 2000, ability: HARD_CAST, phase: "BEGIN" },
      { t: 3000, ability: HARD_CAST },
    ]);
    const comparison = analysis.comparisons[1];
    expect(comparison?.decision.observedToken).toBe("fireball");
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

  it("a later begin supersedes an earlier one, and the earlier is counted, never a decision", () => {
    const analysis = analyzed(BUILD_A, [
      FIRST_INSTANT,
      { t: 2000, ability: HARD_CAST, phase: "BEGIN" },
      { t: 2500, ability: HARD_CAST, phase: "BEGIN" },
      { t: 3500, ability: HARD_CAST },
    ]);
    expect(analysis.comparisons).toHaveLength(2);
    expect(analysis.comparisons[1]?.decision.fightTimeMs).toBe(2500);
    expect(analysis.coverage.unpairedBegins).toEqual([{ key: "INTERRUPTED", count: 1 }]);
  });

  it("a begin that never completes is no decision, and no missed action is built on it", () => {
    const analysis = analyzed(BUILD_A, [FIRST_INSTANT, { t: 2000, ability: HARD_CAST, phase: "BEGIN" }]);
    expect(analysis.comparisons).toHaveLength(1);
    expect(analysis.excluded).toHaveLength(0);
    expect(analysis.coverage.eligibleDecisions).toBe(1);
  });

  it("the coverage counts each decision's anchor, and the three outcomes still partition them", () => {
    const { coverage } = analyzed(BUILD_A, [
      FIRST_INSTANT,
      { t: 2000, ability: HARD_CAST, phase: "BEGIN" },
      { t: 3000, ability: HARD_CAST },
      { t: 4000, ability: HARD_CAST },
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
  const ONLY_HARD_CAST = () => accessAnswering(unconditional("fireball"));

  it("the same press MATCHes when its begin is observed: the authority view does resolve", () => {
    const analysis = analyzed(
      BUILD_A,
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
      BUILD_A,
      [
        { t: 1000, ability: HARD_CAST, phase: "BEGIN" },
        { t: 2000, ability: HARD_CAST },
        { t: 3000, ability: HARD_CAST },
      ],
      { authority: ONLY_HARD_CAST() },
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
    const analysis = analyzed(BUILD_A, [FIRST_INSTANT, { t: 3000, ability: HARD_CAST }], {
      authority: ONLY_HARD_CAST(),
      casts: "UNVERIFIED",
    });
    expect(analysis.resolved[1]?.anchor).toMatchObject({ state: "UNKNOWN", reason: "CAST_TIME_UNKNOWN" });
    expect(analysis.comparisons[1]?.outcome).toBe("UNKNOWN");
  });

  it("the first hard cast of a fight may have begun before the pull: UNKNOWN, with the scan's answer ignored", () => {
    const analysis = analyzed(BUILD_A, [{ t: 97, ability: HARD_CAST }], { authority: ONLY_HARD_CAST() });
    expect(analysis.resolved[0]?.anchor).toMatchObject({ state: "UNKNOWN", reason: "CAST_TIME_UNKNOWN" });
    expect(analysis.comparisons[0]?.outcome).toBe("UNKNOWN");
  });

  it.each([
    ["pyroblast", 11366],
    ["flamestrike", 2120],
    ["scorch", 2948],
    ["fireball", 431044],
  ] as const)(
    "%s may have been instant, so a begin before it proves no moment: never established, and never a MATCH",
    (token, ability) => {
      const analysis = analyzed(
        BUILD_A,
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
    const analysis = analyzed(BUILD_A, [FIRST_INSTANT, { t: 3000, ability: HARD_CAST }]);
    const selection = analysis.resolved[1]?.selection;
    expect(selection?.detail).toContain("CAST_TIME_UNKNOWN");
    expect(selection?.blockedAt).toBeNull();
    expect(selection?.stoppingPoint).not.toBeNull();
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

describe("what the profile proves about a cast", () => {
  const timelineOf = (steps: readonly Step[]) =>
    buildCastTimeline({
      state: fightWith(BUILD_A, steps),
      actorId: SOURCE,
      profile: fireCastAnchorProfile(),
    });

  /** Two back to back, with the second begin in the first completion's own millisecond. */
  const BACK_TO_BACK = (ability: number): readonly Step[] => [
    FIRST_INSTANT,
    { t: 2000, ability, phase: "BEGIN" },
    { t: 3000, ability },
    { t: 3000, ability, phase: "BEGIN" },
    { t: 4000, ability },
  ];

  it("a row with no -100% cast-time row is a hard cast, so back-to-back casts are established", () => {
    const anchors = timelineOf(BACK_TO_BACK(HARD_CAST)).anchors.map((anchor) => anchor.anchor);
    expect(anchors[1]).toMatchObject({ state: "ESTABLISHED", reportTimeMs: FIGHT_START_MS + 2000 });
    expect(anchors[2]).toMatchObject({ state: "ESTABLISHED", reportTimeMs: FIGHT_START_MS + 3000 });
  });

  it.each([
    ["pyroblast", 11366],
    ["flamestrike", 2120],
    ["scorch", 2948],
    ["fireball", 431044],
  ] as const)(
    "%s has an unexcluded -100%% row: the same shape is ambiguous, never picked",
    (_token, ability) => {
      const anchors = timelineOf(BACK_TO_BACK(ability)).anchors.map((anchor) => anchor.anchor);
      expect(anchors[2]).toMatchObject({ state: "UNKNOWN", reason: "BEGINCAST_PAIRING_AMBIGUOUS" });
      expect(fireCastAnchorProfile().castTimeAt(completion(ability))).toEqual({
        kind: "UNKNOWN",
        reason: "INSTANT_ROW_NOT_EXCLUDED",
      });
    },
  );

  it("no build narrows it: every build's possibly-instant cast is refused alike", () => {
    const ability = 11366;
    for (const tree of [BUILD_A, BUILD_B, [] as readonly Entry[]]) {
      const analysis = analyzed(tree, [
        { t: 2000, ability, phase: "BEGIN" },
        { t: 3000, ability },
      ]);
      expect(analysis.resolved[0]?.anchor).toMatchObject({ state: "UNKNOWN" });
    }
  });

  it("no cast time is ever exact, so no anchor is ever derived from a completion", () => {
    const profile = fireCastAnchorProfile();
    for (const row of FIRE_CAST_ROWS) {
      if (row.baseCastMs === 0) continue;
      const fact = profile.castTimeAt(completion(row.abilityGameId));
      if (fact.kind === "POSITIVE") expect(fact.exactMs, row.simcToken).toBeNull();
      else expect(fact.kind, row.simcToken).toBe("UNKNOWN");
    }
  });

  it("leaves everything off the list unreviewed", () => {
    const profile = fireCastAnchorProfile();
    expect(profile.executionOf(HARD_CAST)).toBe("CAST_TIME");
    expect(profile.executionOf(INSTANT)).toBe("INSTANT");
    expect(profile.executionOf(UNREVIEWED)).toBeNull();
  });

  it("no instant inside a hard cast reads as idle", () => {
    const timeline = timelineOf([
      FIRST_INSTANT,
      { t: 2000, ability: HARD_CAST, phase: "BEGIN" },
      { t: 3000, ability: HARD_CAST },
    ]);
    expect(timeline.occupancyAt(FIGHT_START_MS + 2500).state).toBe("CASTING");
  });
});

describe("no channel", () => {
  it("is reviewed: the pinned list presses none, and no row claims one", () => {
    const profile = fireCastAnchorProfile();
    for (const row of FIRE_CAST_ROWS) {
      expect(profile.executionOf(row.abilityGameId), row.simcToken).not.toBe("CHANNEL");
    }
  });

  it("bound is claimed", () => {
    expect(fireCastAnchorProfile().channelDurationAt(completion(HARD_CAST))).toEqual({
      kind: "UNKNOWN",
      reason: "CHANNEL_BOUND_NOT_REVIEWED",
    });
  });
});

describe("no decision resolves", () => {
  it.each([
    ["sunfury", BUILD_A],
    ["frostfire", BUILD_B],
    ["no hero entry at all", [] as readonly Entry[]],
  ])("%s: every decision stays UNKNOWN, with its reason attached", (_name, tree) => {
    const ability = 11366;
    const analysis = analyzed(tree, [
      FIRST_INSTANT,
      { t: 2000, ability, phase: "BEGIN" },
      { t: 3000, ability },
      { t: 3500, ability: HARD_CAST, phase: "BEGIN" },
      { t: 4500, ability: HARD_CAST },
      { t: 5000, ability: INSTANT },
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

  it("a Mana value on the wire is not read: the list asks for none, and it changes no decision", () => {
    const steps = (power?: number): readonly Step[] => [
      FIRST_INSTANT,
      { t: 3000, ability: INSTANT, ...(power === undefined ? {} : { power }) },
    ];
    expect(analyzed(BUILD_A, steps(100)).coverage).toEqual(analyzed(BUILD_A, steps()).coverage);
    const keys = bindingsOf(factsOf(BUILD_A)).specAtoms?.bound.map((binding) => binding.key) ?? [];
    expect(keys.filter((key) => key.startsWith("mana"))).toEqual([]);
  });
});

describe("the list as pinned", () => {
  it("is 88 actions in 8 lists, with the dispatches as pinned", () => {
    expect(authority().actions).toHaveLength(88);
    expect(artifact.lists).toHaveLength(8);
    expect(lineAt("default", 0).actionStringVerbatim).toBe("call_action_list,name=cds");
    expect(lineAt("default", 8).actionStringVerbatim).toBe(
      "run_action_list,name=ff_filler,if=talent.frostfire_bolt",
    );
    expect(lineAt("default", 9).actionStringVerbatim).toBe("run_action_list,name=sf_filler");
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
        const parsed = parseSimcExpression(raw, FIRE_ATOM_VOCABULARY) as { readonly kind?: string };
        return parsed.kind === "UNSUPPORTED" ? [`${action.listName}[${String(action.priorityOrdinal)}]`] : [];
      });
    expect(refused).toEqual([]);
  });

  it("every off-GCD action of the list has no contract, so a scan refuses rather than steps past it", () => {
    for (const [token, ability] of [
      ["combustion", 190319],
      ["fire_blast", 108853],
    ] as const) {
      expect(fireExecutionLaneForAbility(ability), token).toBe("NON_GCD");
      expect(fireTransitionContractFor(token), token).toBeNull();
    }
  });

  it("an off-GCD press is never a decision, so a Fire Blast inside a cast is not judged", () => {
    const analysis = analyzed(BUILD_A, [
      { t: 2000, ability: 108853 },
      { t: 2500, ability: 190319 },
    ]);
    expect(analysis.comparisons).toHaveLength(0);
    expect(analysis.excluded.map((cast) => cast.reason)).toEqual(["NON_GCD_ACTION", "NON_GCD_ACTION"]);
  });
});

describe("the enemy count", () => {
  it("is declared and unbound, so a line reading it stays open and never reads as single target", () => {
    const facts = factsOf(BUILD_A);
    const unknown = bindingsOf(facts).specAtoms?.bound.filter((binding) =>
      /^(active_enemies|spell_targets|enemies)/.test(binding.key),
    );
    expect(unknown?.length).toBeGreaterThan(0);
    for (const row of unknown ?? []) {
      expect(row.value, row.key).toEqual({ kind: "MAGNITUDE", binding: unknownNumber("STATE_NOT_MODELLED") });
    }
  });

  it("a line reading it, alone at the root, stays undecided and answers nothing", () => {
    const line = lineAt("sf_combustion", 6);
    expect(line.actionStringVerbatim.startsWith("scorch,")).toBe(true);
    expect(line.actionStringVerbatim).toContain("active_enemies");
    const analysis = analyzed(BUILD_A, [FIRST_INSTANT], { authority: accessAnswering(line) });
    expect(analysis.comparisons[0]?.outcome).toBe("UNKNOWN");
  });

  it("a single target only a test can state still does not fall through to a confident answer", () => {
    const facts = factsOf(BUILD_A);
    const outcome = fireFirstGcdSelectionAt({
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
    expect(resolveFireTalent(BUILD_A, "burnout").selection).toBe("UNKNOWN");
  });

  it("a resolved tree disproves only the other tree's talents", () => {
    expect(resolveFireHeroTree(BUILD_A)).toMatchObject({ state: "RESOLVED", simcName: "sunfury" });
    expect(resolveFireHeroTree(BUILD_B)).toMatchObject({ state: "RESOLVED", simcName: "frostfire" });
    expect(fireTalentsDisprovedByHeroTree(resolveFireHeroTree(BUILD_A))).toEqual(["frostfire_bolt"]);
    expect(fireTalentsDisprovedByHeroTree(resolveFireHeroTree(BUILD_B))).toEqual([
      "spellfire_spheres",
      "sunfury_execution",
    ]);
  });

  it("an unresolved tree disproves nothing", () => {
    expect(fireTalentsDisprovedByHeroTree(resolveFireHeroTree([]))).toEqual([]);
  });

  it("an action built on a talent proven absent is background; an unresolved one never is", () => {
    const line = authority().actions.find((action) => action.actionToken === "scorch");
    if (line === undefined) throw new Error("no line");
    const proven = factsOf(BUILD_A, ["scorch"]);
    expect(resolveFireApplicability(proven, line).kind).toBe("NOT_APPLICABLE");
    expect(resolveFireApplicability(factsOf([]), line).kind).toBe("UNKNOWN");
    expect(resolveFireApplicability(factsOf(BUILD_A), line).kind).toBe("APPLICABLE");
  });

  it("an action built on no talent has no guard", () => {
    const line = authority().actions.find((action) => action.actionToken === "fireball");
    if (line === undefined) throw new Error("no line");
    expect(resolveFireApplicability(factsOf([]), line).kind).toBe("APPLICABLE");
  });
});

describe("usability", () => {
  const usability = (action: AplAction, observed: number) =>
    resolveFireUsability({
      state: initialFireState(),
      action,
      observedAbilityGameId: observed,
    });

  it("the press proves its own token, and nothing else", () => {
    const line = unconditional("meteor");
    expect(usability(line, INSTANT).kind).toBe("PROVEN_USABLE");
    expect(usability(line, HARD_CAST).kind).toBe("UNKNOWN");
  });
});

describe("the domain boundary", () => {
  it("racials, items, the potion and the external buff cannot preempt a class action", () => {
    for (const [list, ordinal] of [
      ["cds", 1],
      ["cds", 2],
      ["cds", 12],
      ["cds", 13],
      ["cds", 14],
      ["cds", 15],
      ["cds", 16],
      ["cds", 17],
    ] as const) {
      const verdict = fireNonDomainApplicabilityFor(lineAt(list, ordinal));
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
    expect(pinnedFireMageGcdSemantics().ok).toBe(true);
    expect(pinnedFireMageTalents().ok).toBe(true);
  });

  it("every cast row names the token the GCD dataset binds, and no token lacks a row", () => {
    const tokens = fireTokenByAbilityId();
    for (const row of FIRE_CAST_ROWS) {
      expect(tokens.get(row.abilityGameId), row.simcToken).toBe(row.simcToken);
    }
    for (const [abilityGameId, token] of tokens) {
      expect(fireCastRowFor(abilityGameId)?.simcToken, token).toBe(token);
    }
  });

  it("a cast time is positive exactly on the rows that carry a hard-cast rule", () => {
    for (const row of FIRE_CAST_ROWS) {
      const hard = row.rule === "HARD_CAST" || row.rule === "INSTANT_ROW_NOT_EXCLUDED";
      expect(row.baseCastMs > 0, row.simcToken).toBe(hard);
    }
  });

  it("the press's own row binds its token", () => {
    expect(fireTokenBinding("meteor")).toMatchObject({
      kind: "KNOWN_ONE",
      abilityGameId: INSTANT,
    });
  });

  it("an id off the list has no token, and its lane is a refusal", () => {
    const tokens = fireTokenByAbilityId();
    expect(tokens.has(UNREVIEWED)).toBe(false);
    expect(fireExecutionLaneForAbility(UNREVIEWED)).toBe("UNKNOWN_LANE");
    expect(fireBaseGcdMsForAbility(UNREVIEWED)).toBeNull();
  });
});

describe("what this list asks that nothing answers", () => {
  it("the root scan stops at the Combustion dispatch on a Sunfury build, with the Frostfire dispatch proven skipped", () => {
    const selection = analyzed(BUILD_A, [FIRST_INSTANT]).resolved[0]?.selection;
    expect(selection?.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    expect(selection?.blockedAt).toBe("default[7] run_action_list");
    expect(selection?.stoppingPoint).toMatchObject({
      at: "default[7] run_action_list",
      blocker: "UNDECIDED_RUN_GATE",
    });
    expect(selection?.stoppingPoint?.atoms).toEqual(
      expect.arrayContaining(["time", "variable.combustion_delay", "cooldown.combustion.remains"]),
    );
    expect(selection?.dispatches.map((dispatch) => [dispatch.at, dispatch.gate])).toEqual([
      ["default[0]", "UNCONDITIONAL"],
      ["default[6]", "FALSE"],
      ["default[7]", "UNKNOWN_STATE"],
    ]);
  });

  it.each([
    ["a Frostfire build", BUILD_B],
    ["a build with no hero entry", [] as readonly Entry[]],
  ])("%s stops one dispatch earlier, at its own Combustion gate", (_name, tree) => {
    const selection = analyzed(tree, [FIRST_INSTANT]).resolved[0]?.selection;
    expect(selection?.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    expect(selection?.stoppingPoint?.at).toBe("default[6] run_action_list");
  });

  it("stating the clock does not close the dispatch: the delay it compares against has no value", () => {
    const facts = factsOf(BUILD_A);
    const outcome = fireFirstGcdSelectionAt({
      authority: authority(),
      bindings: bindingsOf(facts, { time: 999, "gcd.max": 1.5 }),
      buildFacts: { talents: facts.talents, talentsProvenAbsent: facts.talentsProvenAbsent },
      observedAbilityGameId: INSTANT,
    });
    expect(outcome.result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    expect(outcome.rootScan.stoppingPoint?.at).toBe("default[7] run_action_list");
  });

  it("the Combustion delay reads a simulation's fight length, which nothing here declares", () => {
    const delay = lineAt("precombat", 3);
    expect(delay.actionStringVerbatim).toContain("name=combustion_delay");
    expect(delay.actionStringVerbatim).toContain("expected_combat_length");
    const declared = [...FIRE_UNBOUND_NUMERIC_ATOMS, ...FIRE_UNBOUND_TRUTH_ATOMS] as readonly string[];
    expect(declared).not.toContain("expected_combat_length");
  });

  it("the hero talent the dispatch reads comes from the resolved tree, and an unresolved tree leaves it open", () => {
    const line = lineAt("default", 8);
    const onSunfury = analyzed(BUILD_A, [FIRST_INSTANT], { authority: accessAnswering(line) });
    expect(onSunfury.resolved[0]?.selection.dispatches[0]?.gate).toBe("FALSE");
    const onFrostfire = analyzed(BUILD_B, [FIRST_INSTANT], { authority: accessAnswering(line) });
    expect(onFrostfire.resolved[0]?.selection.dispatches[0]?.gate).toBe("TRUE");
    const open = analyzed([], [FIRST_INSTANT], { authority: accessAnswering(line) });
    expect(open.resolved[0]?.selection.dispatches[0]?.gate).toBe("UNKNOWN_STATE");
    expect(open.comparisons[0]?.outcome).toBe("UNKNOWN");
  });
});

describe("the proc chain", () => {
  it.each([
    ["buff.hot_streak.react"],
    ["buff.hot_streak.react=0"],
    ["buff.heating_up.react"],
    ["hot_streak_spells_in_flight+buff.heating_up.react=1"],
    ["buff.pyroclasm.up"],
    ["buff.pyroclasm.stack=2"],
    ["buff.heat_shimmer.react"],
    ["buff.hyperthermia.up"],
  ])("%s has no aura behind it, so it is UNKNOWN, never read as absent", (condition) => {
    const parsed = parseSimcExpression(condition, FIRE_ATOM_VOCABULARY);
    if (!parsed.ok) throw new Error(parsed.fragment);
    expect(evaluateSimcExpression(parsed.ast, condition, bindingsOf(factsOf(BUILD_A))).outcome).toBe(
      "UNRESOLVED",
    );
  });

  it("a Hot Streak line alone at the root stays undecided: an unread proc never makes a Pyroblast wrong", () => {
    const line = lineAt("sf_filler", 2);
    expect(line.actionStringVerbatim.startsWith("pyroblast,if=buff.hot_streak.react")).toBe(true);
    const analysis = analyzed(
      BUILD_A,
      [FIRST_INSTANT, { t: 2000, ability: HARD_CAST, phase: "BEGIN" }, { t: 3000, ability: HARD_CAST }],
      {
        authority: accessAnswering(line),
      },
    );
    expect(analysis.comparisons[1]?.outcome).toBe("UNKNOWN");
    expect(analysis.coverage.rejected).toBe(0);
  });

  it("a Pyroblast with a begin in front of it is still not anchored: the begin cannot tell a hard cast from a Hot Streak press", () => {
    const analysis = analyzed(BUILD_A, [
      { t: 2000, ability: 11366, phase: "BEGIN" },
      { t: 2010, ability: 11366 },
    ]);
    expect(analysis.resolved[0]?.anchor).toMatchObject({
      state: "UNKNOWN",
      reason: "BEGINCAST_PAIRING_AMBIGUOUS",
    });
  });
});

describe("the readings that are Fire's own", () => {
  const lineOf = (token: string): AplAction => {
    const line = authority().actions.find(
      (action) => action.actionToken === token && action.listName !== "precombat",
    );
    if (line === undefined) throw new Error(`no line for ${token}`);
    return line;
  };

  it("Fire Blast is applicable only with its talent taken: proven absent is UNKNOWN, never background, because the class spell remains", () => {
    const line = lineOf("fire_blast");
    expect(resolveFireApplicability(factsOf(BUILD_A), line).kind).toBe("APPLICABLE");
    expect(resolveFireApplicability(factsOf([]), line).kind).toBe("UNKNOWN");
    expect(resolveFireApplicability(factsOf(BUILD_A, ["fire_blast"]), line).kind).toBe("UNKNOWN");
  });

  it("the class Fire Blast row is not bound: its lane is a refusal, and a cast of it is never judged", () => {
    expect(fireExecutionLaneForAbility(319836)).toBe("UNKNOWN_LANE");
    const analysis = analyzed(BUILD_A, [{ t: 2000, ability: 319836 }]);
    expect(analysis.excluded.map((cast) => cast.reason)).toEqual(["EXECUTION_LANE_NOT_ESTABLISHED"]);
  });

  it("Flamestrike's talent is a choice of two rows, so its applicability stays UNKNOWN on every build", () => {
    const line = lineOf("flamestrike");
    for (const facts of [factsOf(BUILD_A), factsOf(BUILD_B), factsOf([])]) {
      expect(resolveFireApplicability(facts, line).kind).toBe("UNKNOWN");
    }
    expect(fireTokenBinding("flamestrike")).toMatchObject({
      kind: "KNOWN_SET",
      abilityGameIds: [2120, 1254851],
    });
  });

  it("Fireball's two rows have different executions: Fireball is a hard cast, and Frostfire Bolt may have been instant", () => {
    expect(fireTokenBinding("fireball")).toMatchObject({ kind: "KNOWN_SET", abilityGameIds: [133, 431044] });
    const profile = fireCastAnchorProfile();
    expect(profile.castTimeAt(completion(133)).kind).toBe("POSITIVE");
    expect(profile.castTimeAt(completion(431044))).toEqual({
      kind: "UNKNOWN",
      reason: "INSTANT_ROW_NOT_EXCLUDED",
    });
  });

  it("the like-named spells of others are no press: the Fire Elemental's Meteor and Fire Blast, and the precombat list's own", () => {
    const tokens = fireTokenByAbilityId();
    for (const ability of [117588, 57984, 1262863, 450461, 450462])
      expect(tokens.has(ability), String(ability)).toBe(false);
    const analysis = analyzed(BUILD_A, [
      { t: 2000, ability: 117588 }, // Meteor, a Shaman's Fire Elemental
      { t: 2500, ability: 57984 }, // Fire Blast, the same pet
      { t: 3000, ability: 55342 }, // Mirror Image, cast before the pull in the list
      { t: 3500, ability: 212653 }, // Shimmer
    ]);
    expect(analysis.comparisons).toHaveLength(0);
    expect(analysis.excluded.map((cast) => cast.reason)).toEqual([
      "EXECUTION_LANE_NOT_ESTABLISHED",
      "EXECUTION_LANE_NOT_ESTABLISHED",
      "EXECUTION_LANE_NOT_ESTABLISHED",
      "EXECUTION_LANE_NOT_ESTABLISHED",
    ]);
  });
});

describe("a numeric react", () => {
  it.each([["buff.hot_streak.react=0"], ["buff.heating_up.react=1"]])(
    "%s has no stack behind it, so it is UNKNOWN, never a truth read as 0 or 1",
    (condition) => {
      const parsed = parseSimcExpression(condition, FIRE_ATOM_VOCABULARY);
      if (!parsed.ok) throw new Error(parsed.fragment);
      expect(evaluateSimcExpression(parsed.ast, condition, bindingsOf(factsOf(BUILD_A))).outcome).toBe(
        "UNRESOLVED",
      );
    },
  );
});
