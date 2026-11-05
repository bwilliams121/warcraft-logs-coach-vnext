/**
 * ONB-X2: Devastation Evoker, its own representative on the shared ONB-S4 cast anchor.
 *
 * No decision resolves on real evidence, so the mandatory negatives are the centre of it: a decision whose moment is not
 * established is never judged, a possibly-instant Living Flame is never anchored at a begin, an empowered spell's rank never decides anything,
 * a begin alone is never a decision, an open enemy count never reads as single target, a missing talent never reads as false, an unread
 * aura never decides anything, and a wire Essence value is never read at all.
 *
 * Synthetic on purpose. The authority views here answer with a single line, because only a test can get past the list's
 * real stopping point: they show what the anchor does when a scan finally resolves.
 */

import { describe, expect, it } from "vitest";

import devastationTalents from "../../../src/data/game/evoker-devastation-talents.json";
import artifact from "../../../src/simc/data/evoker-devastation.apl.json";
import {
  DEVASTATION_CAST_ROWS,
  devastationCastRowFor,
} from "../../../src/data/game/evoker-devastation-cast-semantics.js";
import {
  devastationBaseGcdMsForAbility,
  devastationExecutionLaneForAbility,
  devastationTokenBinding,
  devastationTokenByAbilityId,
  pinnedDevastationEvokerGcdSemantics,
} from "../../../src/data/game/evoker-devastation-gcd-semantics.js";
import {
  pinnedDevastationEvokerTalents,
  resolveDevastationHeroTree,
  resolveDevastationTalent,
} from "../../../src/data/game/evoker-devastation-talents.js";
import { devastationTransitionContractFor } from "../../../src/data/game/evoker-devastation-transition-authority.js";
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
import { rosterSpecialization } from "../../../src/data/game/spec-roster.js";
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
  resolveDevastationApplicability,
  resolveDevastationUsability,
  TALENT_BUILT_TOKENS,
} from "../../../src/specs/evoker/devastation/action-profile.js";
import {
  DEVASTATION_CAPABILITIES,
  standaloneDevastationAuthorityAccess,
} from "../../../src/specs/evoker/devastation/authority-bindings.js";
import { devastationCastAnchorProfile } from "../../../src/specs/evoker/devastation/cast-anchor-profile.js";
import { devastationNonDomainApplicabilityFor } from "../../../src/specs/evoker/devastation/domain-boundary.js";
import { devastationFirstGcdSelectionAt } from "../../../src/specs/evoker/devastation/first-gcd-adapter.js";
import { initialDevastationState } from "../../../src/specs/evoker/devastation/first-gcd-state.js";
import { analyzeObservedDevastationEvokerDecisions } from "../../../src/specs/evoker/devastation/observed-analysis.js";
import { pinnedDevastationEvokerAuthority } from "../../../src/specs/evoker/devastation/pinned-authority.js";
import {
  devastationTalentsDisprovedByHeroTree,
  resolveDevastationAtoms,
} from "../../../src/specs/evoker/devastation/resolver.js";
import {
  DEVASTATION_ATOM_VOCABULARY,
  DEVASTATION_UNBOUND_NUMERIC_ATOMS,
  DEVASTATION_UNBOUND_TRUTH_ATOMS,
} from "../../../src/specs/evoker/devastation/vocabulary.js";
import {
  attachedResources,
  castEvent,
  classResource,
  FIGHT_START_MS,
  syntheticFight,
} from "../../support/synthetic-fight.js";

const SOURCE = 7;
const BOSS = 900;

/** Living Flame: the one positive cast time, with an unexcluded -100% row. */
const MAYBE_INSTANT = 361469;
const CHANNEL = 356995;
const EMPOWERED = 357208;
const INSTANT = 357211;
const UNREVIEWED = 363916;

type Entry = { readonly id: number; readonly nodeId: number };

function entries(names: readonly string[]): readonly Entry[] {
  return names.map((name) => {
    const row = devastationTalents.talents.find((candidate) => candidate.simcName === name);
    if (row === undefined) throw new Error(`no pinned talent ${name}`);
    return { id: row.traitEntryId, nodeId: row.traitNodeId };
  });
}

const BUILD_A = entries([
  "dragonrage",
  "eternity_surge",
  "pyre",
  "quell",
  "tip_the_scales",
  "verdant_embrace",
  "mass_disintegrate",
  "slipstream",
]);
const BUILD_B = entries([
  "dragonrage",
  "eternity_surge",
  "pyre",
  "quell",
  "tip_the_scales",
  "verdant_embrace",
  "legacy_of_the_lifebinder",
]);

function authority(): AplAuthority {
  const loaded = pinnedDevastationEvokerAuthority();
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
  const standalone = standaloneDevastationAuthorityAccess();
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
  readonly talents: Record<string, ReturnType<typeof resolveDevastationTalent>>;
  readonly talentsProvenAbsent: Set<string>;
  readonly heroTree: ReturnType<typeof resolveDevastationHeroTree>;
}

/** The build facts, with every modelled talent the test names proven absent (only a test may). */
function factsOf(tree: readonly Entry[], absent: readonly string[] = []): Facts {
  const talents = Object.fromEntries(
    devastationTalents.talents.map((talent) => [
      talent.simcName,
      resolveDevastationTalent(tree, talent.simcName),
    ]),
  );
  const heroTree = resolveDevastationHeroTree(tree);
  const talentsProvenAbsent = new Set<string>(devastationTalentsDisprovedByHeroTree(heroTree));
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
  const resolution = resolveDevastationAtoms({
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
  /** An envelope the normalizer keeps and nothing reads, as the wire logs one around an empowered spell. */
  readonly envelope?: { readonly rawType: "empowerstart" | "empowerend"; readonly empowermentLevel?: number };
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
    if (step.envelope !== undefined) {
      const reportTimeMs = FIGHT_START_MS + step.t;
      events.push({
        locator: {
          streamId: "all",
          pageOrdinal: 0,
          indexInPage: index + 1,
          ingestionOrdinal: index + 1,
          rawType: step.envelope.rawType,
          reportTimeMs,
        },
        ingestionOrdinal: index + 1,
        reportTimeMs,
        fightTimeMs: step.t,
        rawType: step.envelope.rawType,
        source: { actorId: SOURCE, instanceId: null },
        target: null,
        sourceAbsence: null,
        targetAbsence: "NOT_SUPPLIED",
        abilityGameId: step.ability,
        attachedResources: null,
        outsideRequestedRange: false,
        kind: "ENVELOPE_ONLY",
      } as unknown as CombatEvent);
      return;
    }
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
  return analyzeObservedDevastationEvokerDecisions({
    state: fightWith(tree, steps, options.casts ?? "COMPLETE"),
    actorId: SOURCE,
    specId: "evoker/devastation",
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
    const row = internalAnalyzerForSpec("evoker/devastation", PRODUCTION_CATALOG) as AnalyzerRegistration;
    expect(row.analyzerId).toBe("evoker-devastation-observed-decisions");
    expect(row.exposure).toBe("INTERNAL_ONLY");
    expect(analyzerForSpec("evoker/devastation", PRODUCTION_CATALOG)).toBeNull();
    expect(resolveSpecIdentity({ className: "Evoker", specName: "Devastation" }).ok).toBe(false);
  });

  it("refuses another specialization before reading anything of its own", () => {
    expect(
      analyzeObservedDevastationEvokerDecisions({
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
    const offensive = DEVASTATION_CAPABILITIES.find((row) => row.domain === "OFFENSIVE_ROTATION");
    expect(offensive?.requirements.resources).toEqual([]);
    expect(offensive?.requirements.evidenceCategories).toEqual(["CASTS", "COMBATANT_INFO"]);
  });
});

describe("the anchor is when the decision was made", () => {
  it("a channel is decided when it starts, and its cast is that start", () => {
    const analysis = analyzed(BUILD_A, [FIRST_INSTANT, { t: 2000, ability: CHANNEL }]);
    expect(analysis.resolved[1]?.anchor).toMatchObject({ state: "ESTABLISHED", source: "CHANNEL_START" });
    expect(analysis.comparisons[1]?.decision.observedToken).toBe("disintegrate");
    expect(analysis.comparisons[1]?.decision.fightTimeMs).toBe(2000);
    expect(analysis.comparisons[1]?.decision.locator.rawType).toBe("cast");
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
    const analysis = analyzed(BUILD_A, [FIRST_INSTANT, { t: 2000, ability: MAYBE_INSTANT, phase: "BEGIN" }]);
    expect(analysis.comparisons).toHaveLength(1);
    expect(analysis.excluded).toHaveLength(0);
    expect(analysis.coverage.eligibleDecisions).toBe(1);
  });

  it("the coverage counts each decision's anchor, and the three outcomes still partition them", () => {
    const { coverage } = analyzed(BUILD_A, [
      FIRST_INSTANT,
      { t: 1000, ability: CHANNEL },
      { t: 1500, ability: EMPOWERED },
      { t: 2000, ability: MAYBE_INSTANT, phase: "BEGIN" },
      { t: 3000, ability: MAYBE_INSTANT },
    ]);
    expect(coverage.anchors).toEqual([
      { key: "INSTANT_COMPLETION", count: 1 },
      { key: "CHANNEL_START", count: 2 },
      { key: "BEGINCAST_PAIRING_AMBIGUOUS", count: 1 },
    ]);
    expect(coverage.match + coverage.rejected + coverage.unknown).toBe(coverage.eligibleDecisions);
  });
});

describe("an empowered spell", () => {
  /** The wire's shape on all three retained subjects: the start, the `cast` in its millisecond, and the release later with a level. */
  const held = (t: number, level: number, ability: number = EMPOWERED): readonly Step[] => [
    { t, ability, envelope: { rawType: "empowerstart" } },
    { t, ability },
    { t: t + 700, ability, envelope: { rawType: "empowerend", empowermentLevel: level } },
  ];

  it.each([
    ["fire_breath", 357208],
    ["fire_breath", 382266],
    ["eternity_surge", 359073],
    ["eternity_surge", 382411],
  ] as const)(
    "%s %i reads as a channel: its cast is its start, with no cast time and no bound",
    (_token, ability) => {
      const profile = devastationCastAnchorProfile();
      expect(devastationCastRowFor(ability)?.rule).toBe("EMPOWERED");
      expect(profile.executionOf(ability)).toBe("CHANNEL");
      expect(profile.channelDurationAt(completion(ability))).toEqual({
        kind: "UNKNOWN",
        reason: "CHANNEL_BOUND_NOT_REVIEWED",
      });
    },
  );

  it("is decided at its cast, the start of the hold, never at the release", () => {
    const analysis = analyzed(BUILD_A, [FIRST_INSTANT, ...held(2000, 1)]);
    expect(analysis.resolved[1]?.anchor).toMatchObject({
      state: "ESTABLISHED",
      source: "CHANNEL_START",
      reportTimeMs: FIGHT_START_MS + 2000,
    });
    expect(analysis.comparisons[1]?.decision.fightTimeMs).toBe(2000);
  });

  it("a Tip the Scales press is a cast alone, at the same moment, under the same anchor", () => {
    const analysis = analyzed(BUILD_A, [FIRST_INSTANT, { t: 2000, ability: EMPOWERED }]);
    expect(analysis.resolved[1]?.anchor).toMatchObject({
      state: "ESTABLISHED",
      source: "CHANNEL_START",
      reportTimeMs: FIGHT_START_MS + 2000,
    });
  });

  it("the envelopes are one decision, not three, and no envelope is a decision or an exclusion", () => {
    const analysis = analyzed(BUILD_A, [...held(2000, 3)]);
    expect(analysis.comparisons).toHaveLength(1);
    expect(analysis.excluded).toHaveLength(0);
  });

  it("the rank decides nothing: the same press at any level gives the same answer, and the release is not read", () => {
    const access = () => accessAnswering(unconditional("fire_breath"));
    const at = (level: number) => analyzed(BUILD_A, held(2000, level), { authority: access() });
    const one = at(1);
    expect(one.comparisons[0]?.outcome).toBe("MATCH");
    for (const level of [2, 3, 4]) {
      expect(at(level).comparisons).toEqual(one.comparisons);
      expect(at(level).coverage).toEqual(one.coverage);
    }
    expect(
      analyzed(BUILD_A, [{ t: 2000, ability: EMPOWERED }], { authority: access() }).comparisons[0]?.outcome,
    ).toBe("MATCH");
  });

  it.each([
    ["es", 0],
    ["es", 3],
    ["fb", 0],
    ["fb", 2],
    ["sc", 6],
    ["fs", 0],
  ] as const)("%s[%i] asks for a rank nothing reads, so the option refuses the line", (list, ordinal) => {
    const line = lineAt(list, ordinal);
    expect(line.actionStringVerbatim).toContain("empower_to=");
    expect(line.unsupportedOptions.map((option) => option.optionKey)).toContain("empower_to");
  });

  it("a real empower_to line alone at the root stays undecided: a press is never matched to a rank it may not have been", () => {
    for (const [list, ordinal, ability] of [
      ["es", 3, 359073],
      ["fb", 0, 357208],
    ] as const) {
      const analysis = analyzed(BUILD_A, held(2000, 1, ability), {
        authority: accessAnswering(lineAt(list, ordinal)),
      });
      expect(analysis.comparisons[0]?.outcome, `${list}[${String(ordinal)}]`).toBe("UNKNOWN");
      expect(analysis.coverage.rejected).toBe(0);
    }
  });

  it("the hold is never idle: inside it, occupancy is unknown, and so is a press with no observed release", () => {
    const timeline = buildCastTimeline({
      state: fightWith(BUILD_A, [
        FIRST_INSTANT,
        ...held(2000, 2),
        { t: 3500, ability: MAYBE_INSTANT, phase: "BEGIN" },
      ]),
      actorId: SOURCE,
      profile: devastationCastAnchorProfile(),
    });
    expect(timeline.occupancyAt(FIGHT_START_MS + 2300)).toMatchObject({
      state: "UNKNOWN",
      reason: "CHANNEL_END_UNKNOWN",
    });
  });

  it("a begin of an empowered spell contradicts the review: UNKNOWN, never a guess at which is wrong", () => {
    const analysis = analyzed(BUILD_A, [
      { t: 2000, ability: EMPOWERED, phase: "BEGIN" },
      { t: 3000, ability: EMPOWERED },
    ]);
    expect(analysis.resolved[0]?.anchor).toMatchObject({
      state: "UNKNOWN",
      reason: "CAST_EVIDENCE_CONFLICT",
    });
    expect(analysis.comparisons[0]?.outcome).toBe("UNKNOWN");
  });

  it("an empowered press with no cast coverage still has its moment, and the scan still decides nothing", () => {
    const analysis = analyzed(BUILD_A, held(2000, 1), { casts: "UNVERIFIED" });
    expect(analysis.resolved[0]?.anchor).toMatchObject({ state: "ESTABLISHED", source: "CHANNEL_START" });
    expect(analysis.comparisons[0]?.outcome).toBe("UNKNOWN");
  });
});

describe("no moment, no verdict", () => {
  const ONLY_LIVING_FLAME = () => accessAnswering(unconditional("living_flame"));

  it("a channel MATCHes when a test states the only line: the authority view does resolve", () => {
    const analysis = analyzed(BUILD_A, [{ t: 2000, ability: CHANNEL }], {
      authority: accessAnswering(unconditional("disintegrate")),
    });
    expect(analysis.comparisons[0]?.outcome).toBe("MATCH");
    expect(analysis.resolved[0]?.anchor).toMatchObject({ state: "ESTABLISHED" });
  });

  it("a Living Flame may have been instant, so a begin before it proves no moment: never established, and never a MATCH", () => {
    const analysis = analyzed(
      BUILD_A,
      [
        { t: 2000, ability: MAYBE_INSTANT, phase: "BEGIN" },
        { t: 3000, ability: MAYBE_INSTANT },
      ],
      { authority: ONLY_LIVING_FLAME() },
    );
    expect(analysis.resolved[0]?.anchor).toMatchObject({
      state: "UNKNOWN",
      reason: "BEGINCAST_PAIRING_AMBIGUOUS",
      candidateReportTimesMs: [FIGHT_START_MS + 2000, FIGHT_START_MS + 3000],
    });
    expect(analysis.comparisons[0]?.outcome).toBe("UNKNOWN");
    expect(analysis.comparisons[0]?.rawBlocker).toBe("DECISION_ANCHOR_NOT_ESTABLISHED");
  });

  it("a begin in its completion's own millisecond is no moment either: the wire logs one before an instant press", () => {
    const analysis = analyzed(
      BUILD_A,
      [
        FIRST_INSTANT,
        { t: 2000, ability: MAYBE_INSTANT },
        { t: 2000, ability: MAYBE_INSTANT, phase: "BEGIN" },
        { t: 4000, ability: MAYBE_INSTANT },
      ],
      { authority: ONLY_LIVING_FLAME() },
    );
    for (const index of [1, 2]) {
      expect(analysis.resolved[index]?.anchor, String(index)).toMatchObject({ state: "UNKNOWN" });
      expect(analysis.comparisons[index]?.outcome, String(index)).toBe("UNKNOWN");
    }
  });

  it("with complete cast coverage and no begin, it is UNKNOWN, never inferred instant, and never a MATCH", () => {
    const analysis = analyzed(
      BUILD_A,
      [FIRST_INSTANT, { t: 2000, ability: MAYBE_INSTANT }, { t: 3000, ability: MAYBE_INSTANT }],
      {
        authority: ONLY_LIVING_FLAME(),
      },
    );
    const comparison = analysis.comparisons[2];
    expect(analysis.resolved[2]?.anchor).toMatchObject({
      state: "UNKNOWN",
      reason: "BEGINCAST_NOT_OBSERVED",
    });
    expect(comparison?.outcome).toBe("UNKNOWN");
    expect(comparison?.rawBlocker).toBe("DECISION_ANCHOR_NOT_ESTABLISHED");
    expect(comparison?.decisiveBlocker).toBe("OBSERVED_STATE_MISSING");
  });

  it("with no cast coverage it is UNKNOWN on the coverage reason: a missing page is never an instant cast", () => {
    const analysis = analyzed(BUILD_A, [FIRST_INSTANT, { t: 3000, ability: MAYBE_INSTANT }], {
      authority: ONLY_LIVING_FLAME(),
      casts: "UNVERIFIED",
    });
    expect(analysis.resolved[1]?.anchor).toMatchObject({ state: "UNKNOWN", reason: "CAST_TIME_UNKNOWN" });
    expect(analysis.comparisons[1]?.outcome).toBe("UNKNOWN");
  });

  it("the first Living Flame of a fight may have begun before the pull: UNKNOWN, with the scan's answer ignored", () => {
    const analysis = analyzed(BUILD_A, [{ t: 97, ability: MAYBE_INSTANT }], {
      authority: ONLY_LIVING_FLAME(),
    });
    expect(analysis.resolved[0]?.anchor).toMatchObject({ state: "UNKNOWN", reason: "CAST_TIME_UNKNOWN" });
    expect(analysis.comparisons[0]?.outcome).toBe("UNKNOWN");
  });

  it("the query's own stopping point stays attached to an anchor refusal", () => {
    const analysis = analyzed(BUILD_A, [FIRST_INSTANT, { t: 3000, ability: MAYBE_INSTANT }]);
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
      profile: devastationCastAnchorProfile(),
    });

  it("Living Flame has an unexcluded -100% row: back-to-back presses are ambiguous, never picked", () => {
    const anchors = timelineOf([
      FIRST_INSTANT,
      { t: 2000, ability: MAYBE_INSTANT, phase: "BEGIN" },
      { t: 3000, ability: MAYBE_INSTANT },
      { t: 3000, ability: MAYBE_INSTANT, phase: "BEGIN" },
      { t: 4000, ability: MAYBE_INSTANT },
    ]).anchors.map((anchor) => anchor.anchor);
    expect(anchors[2]).toMatchObject({ state: "UNKNOWN", reason: "BEGINCAST_PAIRING_AMBIGUOUS" });
    expect(devastationCastAnchorProfile().castTimeAt(completion(MAYBE_INSTANT))).toEqual({
      kind: "UNKNOWN",
      reason: "INSTANT_ROW_NOT_EXCLUDED",
    });
  });

  it("no build narrows it: every build's possibly-instant cast is refused alike", () => {
    for (const tree of [BUILD_A, BUILD_B, [] as readonly Entry[]]) {
      const analysis = analyzed(tree, [
        { t: 2000, ability: MAYBE_INSTANT, phase: "BEGIN" },
        { t: 3000, ability: MAYBE_INSTANT },
      ]);
      expect(analysis.resolved[0]?.anchor).toMatchObject({ state: "UNKNOWN" });
    }
  });

  it("no cast time is ever exact, so no anchor is ever derived from a completion", () => {
    const profile = devastationCastAnchorProfile();
    for (const row of DEVASTATION_CAST_ROWS) {
      if (row.baseCastMs === 0) continue;
      const fact = profile.castTimeAt(completion(row.abilityGameId));
      if (fact.kind === "POSITIVE") expect(fact.exactMs, row.simcToken).toBeNull();
      else expect(fact.kind, row.simcToken).toBe("UNKNOWN");
    }
  });

  it("no row is a hard cast: nothing here ever claims a proven cast span", () => {
    expect(DEVASTATION_CAST_ROWS.filter((row) => row.rule === "HARD_CAST")).toEqual([]);
    const timeline = timelineOf([
      FIRST_INSTANT,
      { t: 2000, ability: MAYBE_INSTANT, phase: "BEGIN" },
      { t: 3000, ability: MAYBE_INSTANT },
    ]);
    expect(timeline.spans.filter((span) => span.kind === "CASTING")).toEqual([]);
    expect(timeline.occupancyAt(FIGHT_START_MS + 2500).state).toBe("UNKNOWN");
  });

  it("leaves everything off the list unreviewed", () => {
    const profile = devastationCastAnchorProfile();
    expect(profile.executionOf(MAYBE_INSTANT)).toBe("CAST_TIME");
    expect(profile.executionOf(CHANNEL)).toBe("CHANNEL");
    expect(profile.executionOf(EMPOWERED)).toBe("CHANNEL");
    expect(profile.executionOf(INSTANT)).toBe("INSTANT");
    expect(profile.executionOf(UNREVIEWED)).toBeNull();
  });
});

describe("the channels", () => {
  it.each([
    ["disintegrate", 356995],
    ["deep_breath", 357210],
    ["deep_breath", 433874],
  ] as const)("%s %i is a reviewed channel, with no bound claimed", (_token, ability) => {
    const profile = devastationCastAnchorProfile();
    expect(devastationCastRowFor(ability)?.rule).toBe("CHANNEL");
    expect(profile.executionOf(ability)).toBe("CHANNEL");
    expect(profile.channelDurationAt(completion(ability)).kind).toBe("UNKNOWN");
  });

  it("is never read as finished, so nothing inside one reads as idle", () => {
    const timeline = buildCastTimeline({
      state: fightWith(BUILD_A, [FIRST_INSTANT, { t: 2000, ability: CHANNEL }]),
      actorId: SOURCE,
      profile: devastationCastAnchorProfile(),
    });
    expect(timeline.occupancyAt(FIGHT_START_MS + 2500)).toMatchObject({
      state: "UNKNOWN",
      reason: "CHANNEL_END_UNKNOWN",
    });
  });
});

describe("no decision resolves", () => {
  it.each([
    ["scalecommander", BUILD_A],
    ["flameshaper", BUILD_B],
    ["no hero entry at all", [] as readonly Entry[]],
  ])("%s: every decision stays UNKNOWN, with its reason attached", (_name, tree) => {
    const analysis = analyzed(tree, [
      FIRST_INSTANT,
      { t: 2000, ability: MAYBE_INSTANT, phase: "BEGIN" },
      { t: 3000, ability: MAYBE_INSTANT },
      { t: 3200, ability: CHANNEL },
      { t: 3400, ability: EMPOWERED },
      { t: 3600, ability: INSTANT },
    ]);
    const { coverage } = analysis;
    expect(coverage.eligibleDecisions).toBe(5);
    expect(coverage.match).toBe(0);
    expect(coverage.rejected).toBe(0);
    expect(coverage.unknown).toBe(5);
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

  it("an Essence value on the wire is not read: the list's reads are unbound, and it changes no decision", () => {
    const steps = (power?: number): readonly Step[] => [
      FIRST_INSTANT,
      { t: 3000, ability: INSTANT, ...(power === undefined ? {} : { power }) },
    ];
    expect(analyzed(BUILD_A, steps(5)).coverage).toEqual(analyzed(BUILD_A, steps()).coverage);
    const keys = bindingsOf(factsOf(BUILD_A)).specAtoms?.bound.map((binding) => binding.key) ?? [];
    expect(keys.filter((key) => /^(essence|mana)/.test(key))).toEqual([]);
  });
});

describe("the list as pinned", () => {
  it("is 86 actions in 8 lists, with the dispatches as pinned", () => {
    expect(authority().actions).toHaveLength(86);
    expect(artifact.lists).toHaveLength(8);
    expect(lineAt("default", 7).actionStringVerbatim).toBe("call_action_list,name=trinkets");
    expect(lineAt("default", 8).actionStringVerbatim).toBe(
      "run_action_list,name=sc,if=talent.mass_disintegrate",
    );
    expect(lineAt("default", 9).actionStringVerbatim).toBe("run_action_list,name=fs");
  });

  it("records the live and PTR relationship it was extracted under", () => {
    expect(artifact.provenance.livePtrPolicy).toBe("PTR_STUB_NEVER_DISPATCHED");
  });

  it("every in-domain condition outside precombat parses whole", () => {
    const refused = authority()
      .actions.filter((action) => action.listName !== "precombat")
      .filter((action) => nonDomainCategoryOf(action.actionToken) === null)
      .flatMap((action) => {
        const raw = (action as { readonly conditionRaw?: string | null }).conditionRaw ?? null;
        if (raw === null) return [];
        const parsed = parseSimcExpression(raw, DEVASTATION_ATOM_VOCABULARY) as { readonly kind?: string };
        return parsed.kind === "UNSUPPORTED" ? [`${action.listName}[${String(action.priorityOrdinal)}]`] : [];
      });
    expect(refused).toEqual([]);
  });

  it("every off-GCD action of the list has no contract, so a scan refuses rather than steps past it", () => {
    for (const [token, ability] of [
      ["hover", 358267],
      ["quell", 351338],
      ["tip_the_scales", 370553],
    ] as const) {
      expect(devastationExecutionLaneForAbility(ability), token).toBe("NON_GCD");
      expect(devastationTransitionContractFor(token), token).toBeNull();
    }
  });

  it("an off-GCD press is never a decision, so a Hover inside a channel is not judged", () => {
    const analysis = analyzed(BUILD_A, [
      { t: 2000, ability: 358267 },
      { t: 2500, ability: 370553 },
    ]);
    expect(analysis.comparisons).toHaveLength(0);
    expect(analysis.excluded.map((cast) => cast.reason)).toEqual(["NON_GCD_ACTION", "NON_GCD_ACTION"]);
  });

  it("the empowered spells sit on the GCD lane at their pinned 500 ms, not the usual 1500", () => {
    for (const ability of [357208, 382266, 359073, 382411]) {
      expect(devastationExecutionLaneForAbility(ability), String(ability)).toBe("GCD_CONSUMING");
      expect(devastationBaseGcdMsForAbility(ability), String(ability)).toBe(500);
    }
  });
});

describe("the enemy count", () => {
  it("is declared and unbound, so a line reading it stays open and never reads as single target", () => {
    const facts = factsOf(BUILD_A);
    const unknown = bindingsOf(facts).specAtoms?.bound.filter((binding) =>
      /^(active_enemies|active_dot)/.test(binding.key),
    );
    expect(unknown?.map((row) => row.key)).toEqual(["active_dot.fire_breath_damage", "active_enemies"]);
    for (const row of unknown ?? []) {
      expect(row.value, row.key).toEqual({ kind: "MAGNITUDE", binding: unknownNumber("STATE_NOT_MODELLED") });
    }
  });

  it("a line reading it, alone at the root, stays undecided and answers nothing", () => {
    const line = lineAt("sc", 7);
    expect(line.actionStringVerbatim.startsWith("deep_breath,")).toBe(true);
    expect(line.actionStringVerbatim).toContain("active_enemies");
    const analysis = analyzed(BUILD_A, [FIRST_INSTANT], { authority: accessAnswering(line) });
    expect(analysis.comparisons[0]?.outcome).toBe("UNKNOWN");
  });

  it("a single target only a test can state still does not fall through to a confident answer", () => {
    const facts = factsOf(BUILD_A);
    const outcome = devastationFirstGcdSelectionAt({
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
    expect(resolveDevastationTalent(BUILD_A, "charged_blast").selection).toBe("UNKNOWN");
  });

  it("a resolved tree disproves only the other tree's talents", () => {
    expect(resolveDevastationHeroTree(BUILD_A)).toMatchObject({
      state: "RESOLVED",
      simcName: "scalecommander",
    });
    expect(resolveDevastationHeroTree(BUILD_B)).toMatchObject({ state: "RESOLVED", simcName: "flameshaper" });
    expect(devastationTalentsDisprovedByHeroTree(resolveDevastationHeroTree(BUILD_A))).toEqual([
      "legacy_of_the_lifebinder",
    ]);
    expect(devastationTalentsDisprovedByHeroTree(resolveDevastationHeroTree(BUILD_B))).toEqual([
      "mass_disintegrate",
      "slipstream",
    ]);
  });

  it("an unresolved tree disproves nothing", () => {
    expect(devastationTalentsDisprovedByHeroTree(resolveDevastationHeroTree([]))).toEqual([]);
  });

  it("an action built on a talent proven absent is background; an unresolved one never is", () => {
    const line = authority().actions.find((action) => action.actionToken === "pyre");
    if (line === undefined) throw new Error("no line");
    const proven = factsOf(BUILD_A, ["pyre"]);
    expect(resolveDevastationApplicability(proven, line).kind).toBe("NOT_APPLICABLE");
    expect(resolveDevastationApplicability(factsOf([]), line).kind).toBe("UNKNOWN");
    expect(resolveDevastationApplicability(factsOf(BUILD_A), line).kind).toBe("APPLICABLE");
  });

  it.each([
    "disintegrate",
    "fire_breath",
    "living_flame",
    "azure_strike",
    "azure_sweep",
    "unbound_flame",
    "deep_breath",
  ])("%s is built on no talent, so it has no guard", (token) => {
    const line = authority().actions.find((action) => action.actionToken === token);
    if (line === undefined) throw new Error("no line");
    expect(resolveDevastationApplicability(factsOf([]), line).kind).toBe("APPLICABLE");
  });

  it("the talent the list's talent.volatility.rank reads is a rank, which nothing states", () => {
    const parsed = parseSimcExpression("talent.volatility.rank=2", DEVASTATION_ATOM_VOCABULARY);
    if (!parsed.ok) throw new Error(parsed.fragment);
    expect(
      evaluateSimcExpression(parsed.ast, "talent.volatility.rank=2", bindingsOf(factsOf(BUILD_A))).outcome,
    ).toBe("UNRESOLVED");
  });
});

describe("usability", () => {
  const usability = (action: AplAction, observed: number) =>
    resolveDevastationUsability({
      state: initialDevastationState(),
      action,
      observedAbilityGameId: observed,
    });

  it("the press proves its own token, and nothing else", () => {
    const line = unconditional("pyre");
    expect(usability(line, INSTANT).kind).toBe("PROVEN_USABLE");
    expect(usability(line, CHANNEL).kind).toBe("UNKNOWN");
  });
});

describe("the domain boundary", () => {
  it("items, the potion and the external buff cannot preempt a class action", () => {
    for (const [list, ordinal] of [
      ["default", 0],
      ["default", 2],
      ["trinkets", 0],
      ["trinkets", 1],
      ["trinkets", 2],
      ["trinkets", 3],
      ["trinkets", 4],
      ["trinkets", 5],
      ["trinkets", 6],
      ["trinkets", 7],
    ] as const) {
      const verdict = devastationNonDomainApplicabilityFor(lineAt(list, ordinal));
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
    expect(pinnedDevastationEvokerGcdSemantics().ok).toBe(true);
    expect(pinnedDevastationEvokerTalents().ok).toBe(true);
  });

  it("every cast row names the token the GCD dataset binds, and no token lacks a row", () => {
    const tokens = devastationTokenByAbilityId();
    for (const row of DEVASTATION_CAST_ROWS) {
      expect(tokens.get(row.abilityGameId), row.simcToken).toBe(row.simcToken);
    }
    for (const [abilityGameId, token] of tokens) {
      expect(devastationCastRowFor(abilityGameId)?.simcToken, token).toBe(token);
    }
  });

  it("a cast time is positive exactly on the rows that carry a hard-cast rule", () => {
    for (const row of DEVASTATION_CAST_ROWS) {
      const hard = row.rule === "HARD_CAST" || row.rule === "INSTANT_ROW_NOT_EXCLUDED";
      expect(row.baseCastMs > 0, row.simcToken).toBe(hard);
    }
  });

  it("the press's own row binds its token", () => {
    expect(devastationTokenBinding("pyre")).toMatchObject({ kind: "KNOWN_ONE", abilityGameId: INSTANT });
    expect(devastationTokenBinding("fire_breath")).toMatchObject({
      kind: "KNOWN_SET",
      abilityGameIds: [357208, 382266],
    });
  });

  it("an id off the list has no token, and its lane is a refusal", () => {
    const tokens = devastationTokenByAbilityId();
    expect(tokens.has(UNREVIEWED)).toBe(false);
    expect(devastationExecutionLaneForAbility(UNREVIEWED)).toBe("UNKNOWN_LANE");
    expect(devastationBaseGcdMsForAbility(UNREVIEWED)).toBeNull();
  });
});

describe("what this list asks that nothing answers", () => {
  it("a Scalecommander scan goes past Quell's open gate, into the Scalecommander list, and stops at its Deep Breath", () => {
    const selection = analyzed(BUILD_A, [FIRST_INSTANT]).resolved[0]?.selection;
    expect(selection?.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    expect(selection?.blockedAt).toBe("default[6] quell");
    expect(selection?.stoppingPoint).toMatchObject({
      at: "sc[0] deep_breath",
      blocker: "NO_DEFINITE_WINNER",
    });
    expect(selection?.undecidedCandidates.map((candidate) => candidate.at)).toEqual(["default[6] quell"]);
    expect(
      selection?.dispatches.map((dispatch) => [dispatch.at, dispatch.calleeListName, dispatch.gate]),
    ).toEqual([
      ["default[7]", "trinkets", "UNCONDITIONAL"],
      ["default[8]", "sc", "TRUE"],
    ]);
  });

  it("the Deep Breath line refuses on its cancel_if, an option nothing reads", () => {
    const line = lineAt("sc", 0);
    expect(line.unsupportedOptions.map((option) => option.optionKey)).toEqual(["cancel_if"]);
  });

  it("the hero talent the dispatch reads comes from the resolved tree, and an unresolved tree leaves it open", () => {
    const line = lineAt("default", 8);
    const onScalecommander = analyzed(BUILD_A, [FIRST_INSTANT], { authority: accessAnswering(line) });
    expect(onScalecommander.resolved[0]?.selection.dispatches[0]?.gate).toBe("TRUE");
    const onFlameshaper = analyzed(BUILD_B, [FIRST_INSTANT], { authority: accessAnswering(line) });
    expect(onFlameshaper.resolved[0]?.selection.dispatches[0]?.gate).toBe("FALSE");
    const open = analyzed([], [FIRST_INSTANT], { authority: accessAnswering(line) });
    expect(open.resolved[0]?.selection.dispatches[0]?.gate).toBe("UNKNOWN_STATE");
    expect(open.comparisons[0]?.outcome).toBe("UNKNOWN");
  });

  it("a Flameshaper build skips the Scalecommander list and stops on its own list's first line, which needs a rank and a target", () => {
    const selection = analyzed(BUILD_B, [FIRST_INSTANT]).resolved[0]?.selection;
    expect(selection?.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    expect(
      selection?.dispatches.map((dispatch) => [dispatch.at, dispatch.calleeListName, dispatch.gate]),
    ).toEqual([
      ["default[7]", "trinkets", "UNCONDITIONAL"],
      ["default[8]", "sc", "FALSE"],
      ["default[9]", "fs", "UNCONDITIONAL"],
    ]);
    expect(selection?.stoppingPoint?.at).toBe("fs[0] fire_breath");
    expect(lineAt("fs", 0).unsupportedOptions.map((option) => option.optionKey)).toEqual(
      expect.arrayContaining(["target_if", "empower_to"]),
    );
  });

  it("a build with no hero entry stops at the open dispatch itself, and no talents at all stop at Quell's own", () => {
    const noHero = entries([
      "dragonrage",
      "eternity_surge",
      "pyre",
      "quell",
      "tip_the_scales",
      "verdant_embrace",
    ]);
    const selection = analyzed(noHero, [FIRST_INSTANT]).resolved[0]?.selection;
    expect(selection?.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    expect(selection?.dispatches.at(-1)).toMatchObject({ at: "default[8]", gate: "UNKNOWN_STATE" });
    const bare = analyzed([], [FIRST_INSTANT]).resolved[0]?.selection;
    expect(bare?.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    expect(bare?.stoppingPoint?.at).toBe("default[6] quell");
  });

  it("stating the enemy cast does not close the list: the Deep Breath stop has nothing to do with it", () => {
    const facts = factsOf(BUILD_A);
    const outcome = devastationFirstGcdSelectionAt({
      authority: authority(),
      bindings: bindingsOf(facts, { "gcd.max": 1.5, active_enemies: 1 }),
      buildFacts: { talents: facts.talents, talentsProvenAbsent: facts.talentsProvenAbsent },
      observedAbilityGameId: INSTANT,
    });
    expect(outcome.rootScan.stoppingPoint?.at).toBe("sc[0] deep_breath");
  });

  it("a simulation's raid schedule is never a fact of a real fight", () => {
    const declared = DEVASTATION_UNBOUND_NUMERIC_ATOMS as readonly string[];
    expect(declared).toEqual(expect.arrayContaining(["raid_event.adds.in", "raid_event.movement.in"]));
    expect(DEVASTATION_UNBOUND_TRUTH_ATOMS as readonly string[]).toContain("raid_event.adds.exists");
    for (const [condition, known] of [
      ["raid_event.movement.in>2", {}],
      ["raid_event.adds.in>=60", {}],
      ["raid_event.adds.exists", {}],
    ] as const) {
      const parsed = parseSimcExpression(condition, DEVASTATION_ATOM_VOCABULARY);
      if (!parsed.ok) throw new Error(parsed.fragment);
      expect(
        evaluateSimcExpression(parsed.ast, condition, bindingsOf(factsOf(BUILD_A), known)).outcome,
        condition,
      ).toBe("UNRESOLVED");
    }
  });
});

describe("the state the list reads", () => {
  it.each([
    ["buff.dragonrage.up"],
    ["buff.tip_the_scales.up"],
    ["buff.essence_burst.at_max_stacks"],
    ["buff.mass_disintegrate_stacks.up"],
    ["buff.charged_blast.stack<15"],
    ["buff.burnout.up"],
    ["dot.fire_breath_damage.refreshable"],
    ["cooldown.dragonrage.remains<3"],
    ["action.fire_breath.usable_in>0"],
    ["target.time_to_die>=30"],
    ["fight_remains<35"],
  ])("%s has no state behind it, so it is UNKNOWN, never read as absent", (condition) => {
    const parsed = parseSimcExpression(condition, DEVASTATION_ATOM_VOCABULARY);
    if (!parsed.ok) throw new Error(parsed.fragment);
    expect(evaluateSimcExpression(parsed.ast, condition, bindingsOf(factsOf(BUILD_A))).outcome).toBe(
      "UNRESOLVED",
    );
  });

  it("variable.can_use_empower reads the Dragonrage cooldown: stated talents leave it open, and it gates both empowered lists", () => {
    expect(lineAt("default", 3).actionStringVerbatim).toContain("name=can_use_empower");
    expect(lineAt("fs", 4).actionStringVerbatim).toContain("variable.can_use_empower");
    expect(lineAt("fs", 5).actionStringVerbatim).toContain("variable.can_use_empower");
  });
});

describe("the readings that are Devastation's own", () => {
  it("Fire Breath and Eternity Surge each bind a Font of Magic row, so a press of either is the same token", () => {
    const tokens = devastationTokenByAbilityId();
    expect(tokens.get(357208)).toBe("fire_breath");
    expect(tokens.get(382266)).toBe("fire_breath");
    expect(tokens.get(359073)).toBe("eternity_surge");
    expect(tokens.get(382411)).toBe("eternity_surge");
  });

  it("Deep Breath binds both rows, and Maneuverability's is what the Scalecommander subjects press", () => {
    expect(devastationTokenBinding("deep_breath")).toMatchObject({
      kind: "KNOWN_SET",
      abilityGameIds: [357210, 433874],
    });
  });

  it("Living Flame's -100% rows are read, not assumed: its base cast time is positive and its reason is the row", () => {
    expect(devastationCastRowFor(361469)).toMatchObject({
      baseCastMs: 2000,
      rule: "INSTANT_ROW_NOT_EXCLUDED",
    });
  });

  it("the like-named spells of others are no press: the damage and buff rows, the heal, and what the list never names", () => {
    const tokens = devastationTokenByAbilityId();
    for (const ability of [
      357209, 359077, 361500, 361509, 361195, 1265871, 1292322, 1292323, 1236970, 1283718, 1283719,
    ])
      expect(tokens.has(ability), String(ability)).toBe(false);
    const analysis = analyzed(BUILD_A, [
      { t: 2000, ability: 361195 }, // Verdant Embrace's heal
      { t: 2500, ability: 358733 }, // Glide
      { t: 3000, ability: 363916 }, // Obsidian Scales
      { t: 3500, ability: 374968 }, // Time Spiral
    ]);
    expect(analysis.comparisons).toHaveLength(0);
    expect(analysis.excluded.map((cast) => cast.reason)).toEqual([
      "EXECUTION_LANE_NOT_ESTABLISHED",
      "EXECUTION_LANE_NOT_ESTABLISHED",
      "EXECUTION_LANE_NOT_ESTABLISHED",
      "EXECUTION_LANE_NOT_ESTABLISHED",
    ]);
  });

  it("the roster role stays UNKNOWN as pinned: registering this specialization does not set it", () => {
    expect(rosterSpecialization("evoker/devastation")).toMatchObject({ role: "UNKNOWN", roleEvidence: null });
  });
});
