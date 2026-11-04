/**
 * ONB-D1: Destruction Warlock, Cohort D's representative, the first reader of the shared ONB-S4 cast anchor.
 *
 * No decision resolves on real evidence, because both hero trees' area lists read the enemy count first, so the
 * mandatory negatives are the centre of it: a decision whose moment is not established is never judged, a cast-time
 * completion with no begin is never read as instant, a begin alone is never a decision, an open enemy count never
 * reads as single target, a missing talent never reads as false, and a wire Soul Shard value at a completion is
 * never read as the decision's.
 *
 * Synthetic on purpose. The authority views here answer with a single line, past the enemy count, because only a
 * test can get there: they show what the anchor does when a scan finally resolves.
 */

import { describe, expect, it } from "vitest";

import destructionTalents from "../../../src/data/game/warlock-destruction-talents.json";
import {
  DESTRUCTION_CAST_ROWS,
  destructionCastRowFor,
} from "../../../src/data/game/warlock-destruction-cast-semantics.js";
import {
  destructionExecutionLaneForAbility,
  destructionExecutionLaneForToken,
  destructionTokenBinding,
  destructionTokenByAbilityId,
  pinnedDestructionWarlockGcdSemantics,
} from "../../../src/data/game/warlock-destruction-gcd-semantics.js";
import {
  pinnedDestructionWarlockTalents,
  resolveDestructionHeroTree,
  resolveDestructionTalent,
} from "../../../src/data/game/warlock-destruction-talents.js";
import { destructionTransitionContractFor } from "../../../src/data/game/warlock-destruction-transition-authority.js";
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
import { knownNumber, unknownNumber, type AtomBindings } from "../../../src/simc/expression/evaluate.js";
import { parseSimcExpression } from "../../../src/simc/expression/parse.js";
import { nonDomainCategoryOf } from "../../../src/simc/non-domain-tokens.js";
import {
  resolveDestructionApplicability,
  resolveDestructionUsability,
  TALENT_BUILT_TOKENS,
} from "../../../src/specs/warlock/destruction/action-profile.js";
import {
  DESTRUCTION_CAPABILITIES,
  standaloneDestructionAuthorityAccess,
} from "../../../src/specs/warlock/destruction/authority-bindings.js";
import {
  destructionCastAnchorProfile,
  destructionDecisionAnchor,
} from "../../../src/specs/warlock/destruction/cast-anchor-profile.js";
import { destructionNonDomainApplicabilityFor } from "../../../src/specs/warlock/destruction/domain-boundary.js";
import { destructionFirstGcdSelectionAt } from "../../../src/specs/warlock/destruction/first-gcd-adapter.js";
import { initialDestructionState } from "../../../src/specs/warlock/destruction/first-gcd-state.js";
import { analyzeObservedDestructionWarlockDecisions } from "../../../src/specs/warlock/destruction/observed-analysis.js";
import { pinnedDestructionWarlockAuthority } from "../../../src/specs/warlock/destruction/pinned-authority.js";
import {
  destructionTalentsDisprovedByHeroTree,
  resolveDestructionAtoms,
} from "../../../src/specs/warlock/destruction/resolver.js";
import {
  ACTIVE_ENEMIES,
  DESTRUCTION_ATOM_VOCABULARY,
  SOUL_SHARD,
  TALENT_CATACLYSM_ENABLED,
} from "../../../src/specs/warlock/destruction/vocabulary.js";
import {
  attachedResources,
  castEvent,
  classResource,
  FIGHT_START_MS,
  syntheticFight,
} from "../../support/synthetic-fight.js";

const SOURCE = 7;
const BOSS = 900;

const CHAOS_BOLT = 116858;
const INCINERATE = 29722;
const SOUL_FIRE = 6353;
const CONFLAGRATE = 17962;
const WITHER = 445468;
const RUINATION = 434635;
const INFERNAL_BOLT = 434506;
const BURNING_RUSH = 111400;

type Entry = { readonly id: number; readonly nodeId: number };

function entries(names: readonly string[]): readonly Entry[] {
  return names.map((name) => {
    const row = destructionTalents.talents.find((candidate) => candidate.simcName === name);
    if (row === undefined) throw new Error(`no pinned talent ${name}`);
    return { id: row.traitEntryId, nodeId: row.traitNodeId };
  });
}

const HELLCALLER_BUILD = entries([
  "chaos_bolt",
  "conflagrate",
  "shadowburn",
  "soul_fire",
  "summon_infernal",
  "havoc",
  "wither",
  "malevolence",
]);
const DIABOLIST_BUILD = entries([
  "chaos_bolt",
  "conflagrate",
  "shadowburn",
  "soul_fire",
  "summon_infernal",
  "havoc",
  "diabolic_ritual",
  "ruination",
  "secrets_of_the_coven",
]);

function authority(): AplAuthority {
  const loaded = pinnedDestructionWarlockAuthority();
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
  const standalone = standaloneDestructionAuthorityAccess();
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

/** The line `chaos_bolt`, with its condition removed: unconditional, so a press of it is the definite winner. */
function unconditional(token: string): AplAction {
  const pinned = authority().actions.find(
    (action) => action.actionToken === token && action.listName === "default",
  );
  if (pinned === undefined) throw new Error(`no default line for ${token}`);
  return { ...pinned, conditionRaw: null, actionStringVerbatim: token } as AplAction;
}

interface Facts {
  readonly talents: Record<string, ReturnType<typeof resolveDestructionTalent>>;
  readonly talentsProvenAbsent: Set<string>;
  readonly heroTree: ReturnType<typeof resolveDestructionHeroTree>;
}

/** The build facts, with every modelled talent the test names proven absent (only a test may). */
function factsOf(tree: readonly Entry[], absent: readonly string[] = []): Facts {
  const talents = Object.fromEntries(
    destructionTalents.talents.map((talent) => [
      talent.simcName,
      resolveDestructionTalent(tree, talent.simcName),
    ]),
  );
  const heroTree = resolveDestructionHeroTree(tree);
  const talentsProvenAbsent = new Set<string>(destructionTalentsDisprovedByHeroTree(heroTree));
  for (const [name, talent] of Object.entries(talents)) {
    if (talent.selection === "NOT_SELECTED") talentsProvenAbsent.add(name);
  }
  for (const name of absent) {
    talentsProvenAbsent.add(name);
    delete talents[name];
  }
  return { talents, talentsProvenAbsent, heroTree };
}

function bindingsOf(facts: Facts, count: number | null = null): AtomBindings {
  const resolution = resolveDestructionAtoms({
    heroTree: facts.heroTree,
    talents: facts.talents,
    talentsProvenAbsent: facts.talentsProvenAbsent,
  });
  const knownTalents = Object.entries(facts.talents).flatMap(([name, talent]) =>
    talent.selection === "SELECTED" ? [{ name, taken: true }] : [],
  );
  for (const name of facts.talentsProvenAbsent) knownTalents.push({ name, taken: false });
  const bound =
    count === null
      ? resolution.specAtoms.bound
      : resolution.specAtoms.bound.map((binding) =>
          binding.key === ACTIVE_ENEMIES
            ? { ...binding, value: { kind: "MAGNITUDE" as const, binding: knownNumber(count) } }
            : binding,
        );
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
  readonly shards?: number;
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
          step.shards === undefined
            ? null
            : attachedResources({
                side: "SOURCE",
                actorId: SOURCE,
                classResources: [classResource(7, step.shards, { max: 50, cost: 20 })],
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
  const analysis = analyzeObservedDestructionWarlockDecisions({
    state: fightWith(tree, steps, options.casts ?? "COMPLETE"),
    actorId: SOURCE,
    specId: "warlock/destruction",
    targetActorId: null,
    ...(options.authority === undefined ? {} : { authority: options.authority }),
  });
  return analysis;
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
const FIRST_INSTANT: Step = { t: 100, ability: CONFLAGRATE };

describe("the row", () => {
  it("is reachable by the internal lookup only, and a public identity is refused", () => {
    const row = internalAnalyzerForSpec("warlock/destruction", PRODUCTION_CATALOG) as AnalyzerRegistration;
    expect(row.analyzerId).toBe("warlock-destruction-observed-decisions");
    expect(row.exposure).toBe("INTERNAL_ONLY");
    expect(analyzerForSpec("warlock/destruction", PRODUCTION_CATALOG)).toBeNull();
    expect(resolveSpecIdentity({ className: "Warlock", specName: "Destruction" }).ok).toBe(false);
  });

  it("refuses another specialization before reading anything of its own", () => {
    expect(
      analyzeObservedDestructionWarlockDecisions({
        state: fightWith(null, []),
        actorId: SOURCE,
        specId: "warlock/affliction" as never,
        targetActorId: null,
      }).status,
    ).toBe("SPEC_NOT_SUPPORTED");
  });

  it("a capture with no combatant info refuses as PROFILE_NOT_RESOLVED, never judges", () => {
    expect(analyze(null, [{ t: 2000, ability: CONFLAGRATE }]).status).toBe("PROFILE_NOT_RESOLVED");
  });

  it("declares offensive authority only, and reports every other domain without it", () => {
    const analysis = analyzed(HELLCALLER_BUILD, []);
    const byDomain = new Map(analysis.domains.map((result) => [result.domain, result.resolution]));
    expect(byDomain.get("OFFENSIVE_ROTATION")).toBe("AUTHORITY_AVAILABLE");
    expect(byDomain.get("INTERRUPT")).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
    expect(byDomain.get("DEFENSIVE_COOLDOWN")).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
    expect(byDomain.get("RESOURCE_SPENDING")).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
  });

  it("declares no resource, because it reads none", () => {
    const offensive = DESTRUCTION_CAPABILITIES.find((row) => row.domain === "OFFENSIVE_ROTATION");
    expect(offensive?.requirements.resources).toEqual([]);
    expect(offensive?.requirements.evidenceCategories).toEqual(["CASTS", "COMBATANT_INFO"]);
  });
});

describe("the anchor is when the decision was made", () => {
  it("a Soul Fire is decided at its begin: the decision's times are the begin's, its identity the completion's", () => {
    const analysis = analyzed(HELLCALLER_BUILD, [
      FIRST_INSTANT,
      { t: 2000, ability: SOUL_FIRE, phase: "BEGIN" },
      { t: 3000, ability: SOUL_FIRE },
    ]);
    const comparison = analysis.comparisons[1];
    const anchor = analysis.resolved[1]?.anchor;
    expect(comparison?.decision.observedToken).toBe("soul_fire");
    expect(anchor).toMatchObject({ state: "ESTABLISHED", source: "OBSERVED_BEGINCAST" });
    expect(comparison?.decision.reportTimeMs).toBe(FIGHT_START_MS + 2000);
    expect(comparison?.decision.fightTimeMs).toBe(2000);
    expect(comparison?.decision.locator.rawType).toBe("cast");
  });

  it("an instant is decided when it lands", () => {
    const analysis = analyzed(HELLCALLER_BUILD, [FIRST_INSTANT, { t: 2000, ability: WITHER }]);
    expect(analysis.resolved[1]?.anchor).toMatchObject({
      state: "ESTABLISHED",
      source: "INSTANT_COMPLETION",
    });
    expect(analysis.comparisons[1]?.decision.fightTimeMs).toBe(2000);
  });

  it("a later begin supersedes an earlier one, and the earlier is counted, never a decision", () => {
    const analysis = analyzed(HELLCALLER_BUILD, [
      FIRST_INSTANT,
      { t: 2000, ability: SOUL_FIRE, phase: "BEGIN" },
      { t: 2500, ability: SOUL_FIRE, phase: "BEGIN" },
      { t: 3500, ability: SOUL_FIRE },
    ]);
    expect(analysis.comparisons).toHaveLength(2);
    expect(analysis.comparisons[1]?.decision.fightTimeMs).toBe(2500);
    expect(analysis.coverage.unpairedBegins).toEqual([{ key: "INTERRUPTED", count: 1 }]);
  });

  it("a begin that never completes is no decision, and no missed action is built on it", () => {
    const analysis = analyzed(HELLCALLER_BUILD, [
      FIRST_INSTANT,
      { t: 2000, ability: CHAOS_BOLT, phase: "BEGIN" },
    ]);
    expect(analysis.comparisons).toHaveLength(1);
    expect(analysis.excluded).toHaveLength(0);
    expect(analysis.coverage.eligibleDecisions).toBe(1);
  });

  it("the coverage counts each decision's anchor, and the three outcomes still partition them", () => {
    const { coverage } = analyzed(HELLCALLER_BUILD, [
      FIRST_INSTANT,
      { t: 2000, ability: SOUL_FIRE, phase: "BEGIN" },
      { t: 3000, ability: SOUL_FIRE },
      { t: 4000, ability: SOUL_FIRE },
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
  const ONLY_SOUL_FIRE = () => accessAnswering(unconditional("soul_fire"));

  it("the same press MATCHes when its begin is observed: the authority view does resolve", () => {
    const analysis = analyzed(
      HELLCALLER_BUILD,
      [
        { t: 2000, ability: SOUL_FIRE, phase: "BEGIN" },
        { t: 3000, ability: SOUL_FIRE },
      ],
      { authority: ONLY_SOUL_FIRE() },
    );
    expect(analysis.comparisons[0]?.outcome).toBe("MATCH");
    expect(analysis.resolved[0]?.anchor).toMatchObject({ state: "ESTABLISHED" });
  });

  it("with complete cast coverage and no begin, it is UNKNOWN, never inferred instant, and never a MATCH", () => {
    const analysis = analyzed(
      HELLCALLER_BUILD,
      [
        { t: 1000, ability: SOUL_FIRE, phase: "BEGIN" },
        { t: 2000, ability: SOUL_FIRE },
        { t: 3000, ability: SOUL_FIRE },
      ],
      { authority: ONLY_SOUL_FIRE() },
    );
    const comparison = analysis.comparisons[1];
    expect(analysis.resolved[1]?.anchor).toMatchObject({
      state: "UNKNOWN",
      reason: "BEGINCAST_NOT_OBSERVED",
    });
    expect(comparison?.outcome).toBe("UNKNOWN");
    expect(comparison?.rawBlocker).toBe("DECISION_ANCHOR_NOT_ESTABLISHED");
    expect(comparison?.decisiveBlocker).toBe("OBSERVED_STATE_MISSING");
    // No established moment, so the completion's own time stands, and nothing claims it is the decision's.
    expect(comparison?.decision.fightTimeMs).toBe(3000);
  });

  it("with no cast coverage it is UNKNOWN on the coverage reason: a missing page is never an instant cast", () => {
    const analysis = analyzed(HELLCALLER_BUILD, [FIRST_INSTANT, { t: 3000, ability: SOUL_FIRE }], {
      authority: ONLY_SOUL_FIRE(),
      casts: "UNVERIFIED",
    });
    expect(analysis.resolved[1]?.anchor).toMatchObject({ state: "UNKNOWN", reason: "CAST_TIME_UNKNOWN" });
    expect(analysis.comparisons[1]?.outcome).toBe("UNKNOWN");
  });

  it("the first hard cast of a fight may have begun before the pull: UNKNOWN, with the scan's answer ignored", () => {
    const analysis = analyzed(HELLCALLER_BUILD, [{ t: 97, ability: SOUL_FIRE }], {
      authority: ONLY_SOUL_FIRE(),
    });
    expect(analysis.resolved[0]?.anchor).toMatchObject({ state: "UNKNOWN", reason: "CAST_TIME_UNKNOWN" });
    expect(analysis.comparisons[0]?.outcome).toBe("UNKNOWN");
  });

  it.each([
    ["chaos_bolt", CHAOS_BOLT],
    ["incinerate", INCINERATE],
  ])(
    "%s may have been instant, so a begin before it proves no moment: never established, and never a MATCH",
    (token, ability) => {
      const analysis = analyzed(
        HELLCALLER_BUILD,
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
    const analysis = analyzed(HELLCALLER_BUILD, [FIRST_INSTANT, { t: 3000, ability: CHAOS_BOLT }]);
    const selection = analysis.resolved[1]?.selection;
    expect(selection?.detail).toContain("CAST_TIME_UNKNOWN");
    expect(selection?.blockedAt).toBeNull();
    expect(selection?.dispatches.length).toBeGreaterThan(0);
  });

  it("a begin of an instant contradicts the review: UNKNOWN, never a guess at which is wrong", () => {
    const analysis = analyzed(HELLCALLER_BUILD, [
      { t: 2000, ability: CONFLAGRATE, phase: "BEGIN" },
      { t: 3000, ability: CONFLAGRATE },
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
      state: fightWith(HELLCALLER_BUILD, steps),
      actorId: SOURCE,
      profile: destructionCastAnchorProfile(),
    });

  /** Two back to back, with the second begin in the first completion's own millisecond. */
  const BACK_TO_BACK = (ability: number): readonly Step[] => [
    FIRST_INSTANT,
    { t: 2000, ability, phase: "BEGIN" },
    { t: 3000, ability },
    { t: 3000, ability, phase: "BEGIN" },
    { t: 4000, ability },
  ];

  const completion = (abilityGameId: number) => ({
    position: 0,
    locator: {} as never,
    abilityGameId,
    reportTimeMs: 0,
    fightTimeMs: 0,
  });

  it("a row with no -100% cast-time row is a hard cast, so back-to-back casts are established", () => {
    const anchors = timelineOf(BACK_TO_BACK(SOUL_FIRE)).anchors.map((anchor) => anchor.anchor);
    expect(anchors[1]).toMatchObject({ state: "ESTABLISHED", reportTimeMs: FIGHT_START_MS + 2000 });
    expect(anchors[2]).toMatchObject({ state: "ESTABLISHED", reportTimeMs: FIGHT_START_MS + 3000 });
  });

  it.each([
    ["Chaos Bolt", CHAOS_BOLT],
    ["Incinerate", INCINERATE],
    ["Infernal Bolt", INFERNAL_BOLT],
    ["Ruination", RUINATION],
  ])("%s has an unexcluded -100%% row: the same shape is ambiguous, never picked", (_name, ability) => {
    const anchors = timelineOf(BACK_TO_BACK(ability)).anchors.map((anchor) => anchor.anchor);
    expect(anchors[2]).toMatchObject({ state: "UNKNOWN", reason: "BEGINCAST_PAIRING_AMBIGUOUS" });
    expect(destructionCastAnchorProfile().castTimeAt(completion(ability))).toEqual({
      kind: "UNKNOWN",
      reason: "INSTANT_ROW_NOT_EXCLUDED",
    });
  });

  it("no build narrows it: a Diabolist's and a Hellcaller's Chaos Bolt are refused alike", () => {
    for (const tree of [HELLCALLER_BUILD, DIABOLIST_BUILD, [] as readonly Entry[]]) {
      const analysis = analyzed(tree, [
        { t: 2000, ability: CHAOS_BOLT, phase: "BEGIN" },
        { t: 3000, ability: CHAOS_BOLT },
      ]);
      expect(analysis.resolved[0]?.anchor).toMatchObject({ state: "UNKNOWN" });
    }
  });

  it("an accepted anchor passes through, and only a possibly-instant begin pairing is refused", () => {
    const established = {
      state: "ESTABLISHED",
      source: "OBSERVED_BEGINCAST",
      reportTimeMs: 2000,
      beginPosition: 1,
      beginLocator: null,
    } as const;
    expect(destructionDecisionAnchor(established, SOUL_FIRE, 3000)).toBe(established);
    expect(destructionDecisionAnchor(established, CHAOS_BOLT, 3000)).toMatchObject({ state: "UNKNOWN" });
    const instant = { ...established, source: "INSTANT_COMPLETION", reportTimeMs: 3000 } as const;
    expect(destructionDecisionAnchor(instant, WITHER, 3000)).toBe(instant);
  });

  it("no cast time is ever exact, so no anchor is ever derived from a completion", () => {
    const profile = destructionCastAnchorProfile();
    for (const row of DESTRUCTION_CAST_ROWS) {
      if (row.baseCastMs === 0) continue;
      const fact = profile.castTimeAt(completion(row.abilityGameId));
      if (fact.kind === "POSITIVE") expect(fact.exactMs, row.simcToken).toBeNull();
      else expect(fact.kind, row.simcToken).toBe("UNKNOWN");
    }
  });

  it("reviews no channel, and leaves everything off the list unreviewed", () => {
    const profile = destructionCastAnchorProfile();
    expect(profile.executionOf(CHAOS_BOLT)).toBe("CAST_TIME");
    expect(profile.executionOf(WITHER)).toBe("INSTANT");
    expect(profile.executionOf(BURNING_RUSH)).toBeNull();
    expect(DESTRUCTION_CAST_ROWS.some((row) => profile.executionOf(row.abilityGameId) === "CHANNEL")).toBe(
      false,
    );
  });

  it("no instant inside a hard cast reads as idle", () => {
    const timeline = timelineOf([
      FIRST_INSTANT,
      { t: 2000, ability: SOUL_FIRE, phase: "BEGIN" },
      { t: 3000, ability: SOUL_FIRE },
    ]);
    expect(timeline.occupancyAt(FIGHT_START_MS + 2500).state).toBe("CASTING");
  });
});

describe("no decision resolves", () => {
  it.each([
    ["Hellcaller", HELLCALLER_BUILD],
    ["Diabolist", DIABOLIST_BUILD],
    ["no hero entry at all", [] as readonly Entry[]],
  ])("%s: every decision stays UNKNOWN, with its reason attached", (_name, tree) => {
    const analysis = analyzed(tree, [
      FIRST_INSTANT,
      { t: 2000, ability: CHAOS_BOLT, phase: "BEGIN" },
      { t: 3000, ability: CHAOS_BOLT },
      { t: 3500, ability: INCINERATE, phase: "BEGIN" },
      { t: 4500, ability: INCINERATE },
      { t: 5000, ability: WITHER },
    ]);
    const { coverage } = analysis;
    expect(coverage.eligibleDecisions).toBe(4);
    expect(coverage.match).toBe(0);
    expect(coverage.rejected).toBe(0);
    expect(coverage.unknown).toBe(4);
    expect(coverage.resolvedComparisons).toBe(0);
    expect(analysis.comparisons.every((comparison) => comparison.outcome === "UNKNOWN")).toBe(true);
  });

  it("a Hellcaller's area list is entered on the open count, and a Diabolist's closes the other tree's", () => {
    const hellcaller = analyzed(HELLCALLER_BUILD, [FIRST_INSTANT]).resolved[0]?.selection.dispatches;
    expect(hellcaller?.find((step) => step.at === "default[3]")?.calleeListName).toBe("aoe_hc");
    expect(hellcaller?.find((step) => step.at === "default[3]")?.gate).toBe("UNKNOWN_STATE");

    const diabolist = analyzed(DIABOLIST_BUILD, [FIRST_INSTANT]).resolved[0]?.selection.dispatches;
    expect(diabolist?.find((step) => step.at === "default[3]")?.outcome).toBe("CALL_GATE_FALSE_SKIPPED");
    expect(diabolist?.find((step) => step.at === "default[4]")?.calleeListName).toBe("aoe_dia");
  });

  it("classifies the population: a spell the dataset has no record of is excluded, never judged", () => {
    const analysis = analyzed(HELLCALLER_BUILD, [
      { t: 2000, ability: BURNING_RUSH },
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
    const facts = factsOf(HELLCALLER_BUILD);
    const shard = bindingsOf(facts).specAtoms?.bound.find((binding) => binding.key === SOUL_SHARD);
    expect(shard?.value).toEqual({ kind: "MAGNITUDE", binding: unknownNumber("STATE_NOT_MODELLED") });

    const line = lineAt("default", 5);
    expect(line.actionStringVerbatim).toBe("soul_fire,if=soul_shard<=4");
    const analysis = analyzed(
      HELLCALLER_BUILD,
      [
        FIRST_INSTANT,
        { t: 2000, ability: CHAOS_BOLT, phase: "BEGIN" },
        { t: 3000, ability: CHAOS_BOLT, shards: 50 },
      ],
      { authority: accessAnswering(line) },
    );
    // Five shards at the completion would close `soul_shard<=4`. It is not read, so the line stays open.
    expect(analysis.comparisons[1]?.outcome).toBe("UNKNOWN");
    expect(analysis.resolved[1]?.selection.undecidedCandidates[0]?.atoms).toContain(SOUL_SHARD);
  });
});

describe("the list as pinned", () => {
  it("is 80 actions in seven lists, with the area lists gated on the enemy count first", () => {
    expect(authority().actions).toHaveLength(80);
    expect(lineAt("default", 3).actionStringVerbatim).toBe(
      "call_action_list,name=aoe_hc,if=active_enemies>=2&talent.wither",
    );
    expect(lineAt("default", 4).actionStringVerbatim).toBe(
      "call_action_list,name=aoe_dia,if=active_enemies>=2&talent.diabolic_ritual",
    );
  });

  it("every in-domain condition outside precombat parses whole", () => {
    const refused = authority()
      .actions.filter((action) => action.listName !== "precombat")
      .filter((action) => nonDomainCategoryOf(action.actionToken) === null)
      .flatMap((action) => {
        const raw = (action as { readonly conditionRaw?: string | null }).conditionRaw ?? null;
        if (raw === null) return [];
        const parsed = parseSimcExpression(raw, DESTRUCTION_ATOM_VOCABULARY) as { readonly kind?: string };
        return parsed.kind === "UNSUPPORTED" ? [`${action.listName}[${String(action.priorityOrdinal)}]`] : [];
      });
    expect(refused).toEqual([]);
  });

  it("no action of the list is off the GCD, so no line needs a contract", () => {
    for (const token of Object.keys(TALENT_BUILT_TOKENS)) {
      expect(destructionExecutionLaneForToken(token), token).toBe("GCD_CONSUMING");
      expect(destructionTransitionContractFor(token), token).toBeNull();
    }
  });
});

describe("the enemy count", () => {
  it("is declared and unbound, so a line reading it stays open and never reads as single target", () => {
    const facts = factsOf(HELLCALLER_BUILD);
    const bindings = bindingsOf(facts);
    const row = bindings.specAtoms?.bound.find((binding) => binding.key === ACTIVE_ENEMIES);
    expect(row?.value).toEqual({ kind: "MAGNITUDE", binding: unknownNumber("STATE_NOT_MODELLED") });
    const outcome = destructionFirstGcdSelectionAt({
      authority: authority(),
      bindings,
      buildFacts: { talents: facts.talents, talentsProvenAbsent: facts.talentsProvenAbsent },
      observedAbilityGameId: INCINERATE,
    });
    expect(outcome.result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    expect(outcome.rootScan.dispatches.find((step) => step.at === "default[3]")?.outcome).not.toBe(
      "CALL_GATE_FALSE_SKIPPED",
    );
  });

  it("a count only a test can have closes the area lists, and the single-target lines still do not fall through", () => {
    const facts = factsOf(HELLCALLER_BUILD);
    const outcome = destructionFirstGcdSelectionAt({
      authority: authority(),
      bindings: bindingsOf(facts, 1),
      buildFacts: { talents: facts.talents, talentsProvenAbsent: facts.talentsProvenAbsent },
      observedAbilityGameId: INCINERATE,
    });
    expect(outcome.rootScan.dispatches.find((step) => step.at === "default[3]")?.outcome).toBe(
      "CALL_GATE_FALSE_SKIPPED",
    );
    expect(outcome.result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    expect(outcome.rootScan.undecidedCandidates[0]?.at).toBe("default[5] soul_fire");
    expect(outcome.rootScan.undecidedCandidates[0]?.atoms).toContain(SOUL_SHARD);
  });
});

describe("the talents", () => {
  it("a lone-node talent absent from the tree stays UNKNOWN, never false", () => {
    expect(resolveDestructionTalent(HELLCALLER_BUILD, "backdraft").selection).toBe("UNKNOWN");
  });

  it("a resolved tree disproves only the other tree's talents", () => {
    expect(resolveDestructionHeroTree(HELLCALLER_BUILD)).toMatchObject({
      state: "RESOLVED",
      simcName: "hellcaller",
    });
    expect(destructionTalentsDisprovedByHeroTree(resolveDestructionHeroTree(HELLCALLER_BUILD))).toEqual([
      "diabolic_ritual",
      "ruination",
      "secrets_of_the_coven",
    ]);
    expect(resolveDestructionHeroTree(DIABOLIST_BUILD)).toMatchObject({
      state: "RESOLVED",
      simcName: "diabolist",
    });
    expect(destructionTalentsDisprovedByHeroTree(resolveDestructionHeroTree(DIABOLIST_BUILD))).toEqual([
      "wither",
      "malevolence",
    ]);
  });

  it("an unresolved tree disproves nothing", () => {
    expect(destructionTalentsDisprovedByHeroTree(resolveDestructionHeroTree([]))).toEqual([]);
  });

  it("talent.cataclysm.enabled follows the three-way rule and is unbound while UNKNOWN", () => {
    const facts = factsOf(HELLCALLER_BUILD);
    const key = (bindings: AtomBindings) =>
      bindings.specAtoms?.bound.find((binding) => binding.key === TALENT_CATACLYSM_ENABLED);
    expect(key(bindingsOf(facts))).toBeUndefined();
    expect(key(bindingsOf(factsOf(entries(["cataclysm"]))))?.value).toEqual({ kind: "TRUTH", value: true });
    expect(key(bindingsOf(factsOf(HELLCALLER_BUILD, ["cataclysm"])))?.value).toEqual({
      kind: "TRUTH",
      value: false,
    });
  });

  it("an action built on a talent proven absent is background; an unresolved one never is", () => {
    const shadowburn = lineAt("default", 11);
    expect(shadowburn.actionToken).toBe("shadowburn");
    const proven = factsOf(HELLCALLER_BUILD, ["shadowburn"]);
    expect(resolveDestructionApplicability(proven, shadowburn).kind).toBe("NOT_APPLICABLE");
    const open = factsOf([]);
    expect(resolveDestructionApplicability(open, shadowburn).kind).toBe("UNKNOWN");
    expect(resolveDestructionApplicability(factsOf(HELLCALLER_BUILD), shadowburn).kind).toBe("APPLICABLE");
  });

  it("Immolate is the reverse: background with Wither, and needs Wither proven absent", () => {
    const immolate = lineAt("default", 13);
    expect(immolate.actionToken).toBe("immolate");
    expect(resolveDestructionApplicability(factsOf(HELLCALLER_BUILD), immolate).kind).toBe("NOT_APPLICABLE");
    expect(resolveDestructionApplicability(factsOf(DIABOLIST_BUILD), immolate).kind).toBe("APPLICABLE");
    expect(resolveDestructionApplicability(factsOf([]), immolate).kind).toBe("UNKNOWN");
  });

  it("Wither is the other way round, and Infernal Bolt reads Secrets of the Coven", () => {
    const wither = lineAt("default", 12);
    expect(wither.actionToken).toBe("wither");
    expect(resolveDestructionApplicability(factsOf(HELLCALLER_BUILD), wither).kind).toBe("APPLICABLE");
    expect(resolveDestructionApplicability(factsOf(DIABOLIST_BUILD), wither).kind).toBe("NOT_APPLICABLE");
    const bolt = lineAt("default", 18);
    expect(bolt.actionToken).toBe("infernal_bolt");
    expect(resolveDestructionApplicability(factsOf(DIABOLIST_BUILD), bolt).kind).toBe("APPLICABLE");
    expect(resolveDestructionApplicability(factsOf(HELLCALLER_BUILD), bolt).kind).toBe("NOT_APPLICABLE");
  });

  it("Rain of Fire is never resolved: its talent is a choice of two rows", () => {
    const rain = lineAt("aoe_hc", 2);
    expect(rain.actionToken).toBe("rain_of_fire");
    expect(resolveDestructionApplicability(factsOf(HELLCALLER_BUILD), rain).kind).toBe("UNKNOWN");
  });

  it("baseline Incinerate has no guard", () => {
    const incinerate = lineAt("default", 19);
    expect(incinerate.actionToken).toBe("incinerate");
    expect(resolveDestructionApplicability(factsOf([]), incinerate).kind).toBe("APPLICABLE");
  });
});

describe("usability", () => {
  const usability = (action: AplAction, observed: number) =>
    resolveDestructionUsability({
      state: initialDestructionState(),
      action,
      observedAbilityGameId: observed,
    });

  it("the press proves its own token, and nothing else", () => {
    const incinerate = lineAt("default", 19);
    expect(usability(incinerate, INCINERATE).kind).toBe("PROVEN_USABLE");
    expect(usability(incinerate, CHAOS_BOLT).kind).toBe("UNKNOWN");
  });
});

describe("the domain boundary", () => {
  it("racials, items, the potion and the external buff cannot preempt a class action", () => {
    for (const [list, ordinal] of [
      ["ogcd", 0],
      ["ogcd", 1],
      ["ogcd", 2],
      ["items", 0],
    ] as const) {
      const verdict = destructionNonDomainApplicabilityFor(lineAt(list, ordinal));
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
    expect(pinnedDestructionWarlockGcdSemantics().ok).toBe(true);
    expect(pinnedDestructionWarlockTalents().ok).toBe(true);
  });

  it("every cast row names the token the GCD dataset binds, and no token lacks a row", () => {
    const tokens = destructionTokenByAbilityId();
    for (const row of DESTRUCTION_CAST_ROWS) {
      expect(tokens.get(row.abilityGameId), row.simcToken).toBe(row.simcToken);
    }
    for (const [abilityGameId, token] of tokens) {
      expect(destructionCastRowFor(abilityGameId)?.simcToken, token).toBe(token);
    }
  });

  it("a cast time is positive exactly on the rows that carry a hard-cast rule", () => {
    for (const row of DESTRUCTION_CAST_ROWS) {
      expect(row.baseCastMs === 0, row.simcToken).toBe(row.rule === "INSTANT");
    }
  });

  it("Rain of Fire binds both of its rows, and an id off the list has no token", () => {
    expect(destructionTokenBinding("rain_of_fire")).toMatchObject({
      kind: "KNOWN_SET",
      abilityGameIds: [5740, 1214467],
    });
    const tokens = destructionTokenByAbilityId();
    expect(tokens.has(BURNING_RUSH)).toBe(false);
    expect(destructionExecutionLaneForAbility(BURNING_RUSH)).toBe("UNKNOWN_LANE");
    // Wither's press, never its periodic row, and Malevolence's own row, never its damage.
    expect(tokens.get(445468)).toBe("wither");
    expect(tokens.has(445474)).toBe(false);
    expect(tokens.has(446285)).toBe(false);
  });
});
