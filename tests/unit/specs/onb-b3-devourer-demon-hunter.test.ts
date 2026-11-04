/**
 * ONB-B3: Devourer Demon Hunter, its own representative.
 *
 * No decision resolves, so the mandatory negatives are the centre of it: an open enemy count never
 * reads as single target, a pick-up timer no log can read never reads as ready, an unread variable
 * never reads as zero, and no decision becomes a MATCH or a REJECTED.
 *
 * Synthetic on purpose. The whole-fight numbers in agent/architecture.md "ONB-B3" come from replaying
 * retained captures and are not pinned, and the archive has no room for them.
 */

import { describe, expect, it } from "vitest";

import { resolveHeroTree, resolveTalent } from "../../../scripts/authority/extract-simc-talents.mjs";

import devourerTalents from "../../../src/data/game/demonhunter-devourer-talents.json";
import {
  devourerDemonHunterExecutionLaneForAbility,
  devourerDemonHunterExecutionLaneForToken,
  devourerDemonHunterTokenByAbilityId,
  devourerDemonHunterTokenBinding,
  pinnedDevourerDemonHunterGcdSemantics,
} from "../../../src/data/game/demonhunter-devourer-gcd-semantics.js";
import {
  pinnedDevourerDemonHunterTalents,
  resolveDevourerDemonHunterHeroTree,
  resolveDevourerDemonHunterTalent,
} from "../../../src/data/game/demonhunter-devourer-talents.js";
import { devourerDemonHunterTransitionContractFor } from "../../../src/data/game/demonhunter-devourer-transition-authority.js";
import { createCombatState } from "../../../src/engine/state/combat-state.js";
import type { CombatEvent } from "../../../src/engine/normalization/normalized-events.js";
import type { AnalyzerRegistration } from "../../../src/findings/analyzer-registration.js";
import {
  analyzerForSpec,
  internalAnalyzerForSpec,
  PRODUCTION_CATALOG,
} from "../../../src/services/analyzer-registry.js";
import { resolveSpecIdentity } from "../../../src/services/spec-identity.js";
import { aplLineKey, type AplAction, type AplAuthority } from "../../../src/simc/apl-authority.js";
import {
  knownNumber,
  unknownNumber,
  type AtomBindings,
  type NumericBinding,
} from "../../../src/simc/expression/evaluate.js";
import { parseSimcExpression } from "../../../src/simc/expression/parse.js";
import {
  lineCooldownReadinessAt,
  lineSelectionHistoryFromObservedCasts,
} from "../../../src/simc/line-cooldown.js";
import { nonDomainCategoryOf } from "../../../src/simc/non-domain-tokens.js";
import { resolveDevourerDemonHunterApplicability } from "../../../src/specs/demonhunter/devourer/action-profile.js";
import { devourerDemonHunterFirstGcdSelectionAt } from "../../../src/specs/demonhunter/devourer/first-gcd-adapter.js";
import { analyzeObservedDevourerDemonHunterDecisions } from "../../../src/specs/demonhunter/devourer/observed-analysis.js";
import { pinnedDevourerDemonHunterAuthority } from "../../../src/specs/demonhunter/devourer/pinned-authority.js";
import {
  devourerDemonHunterTalentsDisprovedByHeroTree,
  resolveDevourerDemonHunterAtoms,
} from "../../../src/specs/demonhunter/devourer/resolver.js";
import {
  ACTIVE_ENEMIES,
  DEVOURER_DEMON_HUNTER_ATOM_VOCABULARY,
} from "../../../src/specs/demonhunter/devourer/vocabulary.js";
import {
  attachedResources,
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
    const row = devourerTalents.talents.find((candidate) => candidate.simcName === name);
    if (row === undefined) throw new Error(`no pinned talent ${name}`);
    return { id: row.traitEntryId, nodeId: row.traitNodeId };
  });
}

const BASE = ["void_ray", "soul_immolation", "voidblade", "vengeful_retreat", "hungering_slash", "eradicate"];
const VOIDSCARRED_MELEE = entries([...BASE, "the_hunt", "voidsurge", "demonic_intensity"]);
const VOIDSCARRED_NO_HUNT_RECORD = entries([...BASE, "voidsurge", "demonic_intensity"]);
const ANNIHILATOR_MELEE = entries([...BASE, "the_hunt", "voidfall", "dark_matter"]);

// The ids the three retained subjects' wire reports.
const REAP = 1226019;
const CULL = 1245453;
const VOID_RAY = 473728;
const VOIDBLADE = 1245412;
const VOIDBLADE_IMPACT = 1245414;
const THE_HUNT = 1246167;
const THE_HUNT_IMPACT = 1246169;
const PREDATORS_WAKE = 1259431;
const CONSUME = 473662;
const DEVOUR = 1217610;
const SOUL_FRAGMENT = 1223412;
const VENGEFUL_RETREAT = 198793;
const POTION = 1236994;

interface Cast {
  readonly t: number;
  readonly ability: number;
  readonly fury?: number;
  readonly melee?: true;
}

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

function stateWith(tree: readonly Entry[] | null, casts: readonly Cast[]) {
  const events: CombatEvent[] = tree === null ? [] : [combatantInfo(tree)];
  let ordinal = 1;
  for (const cast of casts) {
    const event = castEvent({
      ordinal: ordinal++,
      reportTimeMs: cast.t,
      sourceActorId: SOURCE,
      targetActorId: BOSS,
      abilityGameId: cast.ability,
      castPhase: "COMPLETE",
      attachedResources:
        cast.fury === undefined
          ? null
          : attachedResources({
              side: "SOURCE",
              actorId: SOURCE,
              classResources: [classResource(17, cast.fury, { max: 140, cost: 30 })],
            }),
    });
    events.push(cast.melee === undefined ? event : ({ ...event, isMelee: true } as CombatEvent));
  }
  return createCombatState(
    syntheticFight({ endTimeMs: END, events, observedCategories: ["AURAS", "CASTS", "RESOURCES"] }),
  );
}

function analyzed(tree: readonly Entry[] | null, casts: readonly Cast[]) {
  const analysis = analyzeObservedDevourerDemonHunterDecisions({
    state: stateWith(tree, casts),
    actorId: SOURCE,
    specId: "demonhunter/devourer",
    targetActorId: null,
  });
  if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
  return analysis;
}

function authority(): AplAuthority {
  const result = pinnedDevourerDemonHunterAuthority();
  if (!result.ok) throw new Error("the pinned authority did not load");
  return result.authority;
}

const linesOf = (token: string): readonly AplAction[] =>
  authority().actions.filter((action) => action.actionToken === token);

/**
 * A query with a value this slice never has: the enemy count. Only a test can reach what stands behind the
 * count this way, and that is the point. It shows what each line does when something finally reaches it.
 */
function queryBehindTheCount(input: {
  readonly tree: readonly Entry[];
  readonly enemies: number;
  readonly knownBuffs?: AtomBindings["knownBuffs"];
  readonly fury?: NumericBinding;
}) {
  const talents = Object.fromEntries(
    devourerTalents.talents.map((talent) => [
      talent.simcName,
      resolveDevourerDemonHunterTalent(input.tree, talent.simcName),
    ]),
  );
  const heroTree = resolveDevourerDemonHunterHeroTree(input.tree);
  const talentsProvenAbsent = new Set<string>(devourerDemonHunterTalentsDisprovedByHeroTree(heroTree));
  const resolution = resolveDevourerDemonHunterAtoms({
    heroTree,
    talents,
    talentsProvenAbsent,
    fury: input.fury ?? unknownNumber("STATE_NOT_ESTABLISHED"),
  });
  const bound = resolution.specAtoms.bound.map((binding) =>
    binding.key === ACTIVE_ENEMIES
      ? { ...binding, value: { kind: "MAGNITUDE" as const, binding: knownNumber(input.enemies) } }
      : binding,
  );
  for (const [name, talent] of Object.entries(talents)) {
    if (talent.selection === "NOT_SELECTED") talentsProvenAbsent.add(name);
  }
  const knownTalents = Object.entries(talents).flatMap(([name, talent]) =>
    talent.selection === "SELECTED"
      ? [{ name, taken: true }]
      : talentsProvenAbsent.has(name)
        ? [{ name, taken: false }]
        : [],
  );
  const bindings: AtomBindings = {
    comboPoints: unknownNumber("STATE_NOT_MODELLED"),
    comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
    energyPct: unknownNumber("STATE_NOT_MODELLED"),
    knownBuffs: input.knownBuffs ?? [],
    knownTalents,
    knownCooldownRemainsSeconds: [],
    specAtoms: { ...resolution.specAtoms, bound },
  };
  return devourerDemonHunterFirstGcdSelectionAt({
    lineHistory: lineSelectionHistoryFromObservedCasts({
      authority: authority(),
      combatStartMs: FIGHT_START,
      observedCastCoverage: null,
      casts: [],
    }),
    decisionTimeMs: 2000,
    authority: authority(),
    bindings,
    buildFacts: { talents, talentsProvenAbsent },
    observedAbilityGameId: REAP,
  });
}

describe("the row demonhunter/devourer", () => {
  it("is reachable by the internal lookup only, and a public identity is refused", () => {
    const row = internalAnalyzerForSpec("demonhunter/devourer", PRODUCTION_CATALOG) as AnalyzerRegistration;
    expect(row.analyzerId).toBe("demonhunter-devourer-observed-decisions");
    expect(row.exposure).toBe("INTERNAL_ONLY");
    expect(analyzerForSpec("demonhunter/devourer", PRODUCTION_CATALOG)).toBeNull();
    expect(resolveSpecIdentity({ className: "DemonHunter", specName: "Devourer" }).ok).toBe(false);
  });

  it("refuses another specialization before reading anything of its own", () => {
    expect(
      analyzeObservedDevourerDemonHunterDecisions({
        state: stateWith(null, []),
        actorId: SOURCE,
        specId: "demonhunter/havoc",
        targetActorId: null,
      }).status,
    ).toBe("SPEC_NOT_SUPPORTED");
  });

  it("a capture with no combatant info refuses as PROFILE_NOT_RESOLVED, never judges", () => {
    expect(
      analyzeObservedDevourerDemonHunterDecisions({
        state: stateWith(null, [{ t: 2000, ability: REAP }]),
        actorId: SOURCE,
        specId: "demonhunter/devourer",
        targetActorId: null,
      }).status,
    ).toBe("PROFILE_NOT_RESOLVED");
  });

  it("declares offensive authority only, and reports every other domain without it", () => {
    const byDomain = new Map(
      analyzed(VOIDSCARRED_MELEE, []).domains.map((result) => [result.domain, result.resolution]),
    );
    expect(byDomain.get("OFFENSIVE_ROTATION")).toBe("AUTHORITY_AVAILABLE");
    expect(byDomain.get("INTERRUPT")).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
    expect(byDomain.get("DEFENSIVE_COOLDOWN")).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
    expect(byDomain.get("RESOURCE_SPENDING")).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
  });

  it("every pinned dataset loads, and the list names its own commit", () => {
    expect(pinnedDevourerDemonHunterGcdSemantics().ok).toBe(true);
    expect(pinnedDevourerDemonHunterTalents().ok).toBe(true);
    expect(authority().artifact.provenance.commitSha).toBe("33622e9d1662ff0e451691edf85a6b49cc9d11d9");
    expect(authority().artifact.authorityId).toBe("SIMC_APL_DEMONHUNTER_DEVOURER");
  });

  it("every in-domain condition of the list parses whole, so a refusal is about state and not spelling", () => {
    const refused: string[] = [];
    for (const action of authority().actions) {
      if (action.listName === "precombat" || action.conditionRaw === null) continue;
      if (nonDomainCategoryOf(action.actionToken) !== null) continue;
      const parsed = parseSimcExpression(action.conditionRaw, DEVOURER_DEMON_HUNTER_ATOM_VOCABULARY);
      if (!parsed.ok) refused.push(`${action.listName}[${String(action.priorityOrdinal)}]`);
    }
    expect(refused).toEqual([]);
  });
});

describe("what no decision does", () => {
  it("over any build, no decision resolves and none is a confident verdict", () => {
    const CASES = [
      analyzed(VOIDSCARRED_MELEE, [
        { t: 2000, ability: REAP, fury: 80 },
        { t: 3500, ability: VOID_RAY },
      ]),
      analyzed(ANNIHILATOR_MELEE, [{ t: 2000, ability: CULL, fury: 120 }]),
      analyzed(VOIDSCARRED_NO_HUNT_RECORD, [{ t: 2000, ability: VOIDBLADE }]),
      analyzed([], [{ t: 2000, ability: REAP }]),
    ];
    for (const { coverage, comparisons, resolved } of CASES) {
      expect(coverage.match).toBe(0);
      expect(coverage.rejected).toBe(0);
      expect(coverage.unknown).toBe(coverage.eligibleDecisions);
      expect(coverage.eligibleDecisions).toBeGreaterThan(0);
      expect(comparisons.every((comparison) => comparison.outcome === "UNKNOWN")).toBe(true);
      expect(comparisons.every((comparison) => comparison.authorityToken === null)).toBe(true);
      expect(resolved.every((entry) => entry.selection.kind === "ROTATIONAL_GCD_UNKNOWN")).toBe(true);
    }
  });

  it("a Void-Scarred build with The Hunt reaches its own list and stops on the enemy count", () => {
    const { selection } = analyzed(VOIDSCARRED_MELEE, [{ t: 2000, ability: REAP }]).resolved[0] ?? {};
    expect(selection?.stoppingPoint?.at).toBe("voidscarred_melee[0] run_action_list");
    expect(selection?.stoppingPoint?.atoms).toEqual(["active_enemies"]);
    const gates = new Map(selection?.dispatches.map((step) => [step.calleeListName, step.gate]));
    expect(gates.get("annihilator_melee")).toBe("FALSE");
    expect(gates.get("annihilator_ranged")).toBe("FALSE");
    expect(gates.get("voidscarred_ranged")).toBe("FALSE");
    expect(gates.get("voidscarred_melee")).toBe("TRUE");
    // The open count is never single target, and no rotation list behind it is entered.
    expect(gates.get("vsm_st")).toBe("UNKNOWN_STATE");
    expect(gates.has("vsm_meta")).toBe(false);
    expect(gates.has("vsm_out")).toBe(false);
  });

  it("an Annihilator build reaches its own list, and its first line stays open", () => {
    const { selection } = analyzed(ANNIHILATOR_MELEE, [{ t: 2000, ability: REAP }]).resolved[0] ?? {};
    const gates = new Map(selection?.dispatches.map((step) => [step.calleeListName, step.gate]));
    expect(gates.get("annihilator_melee")).toBe("TRUE");
    expect(gates.has("voidscarred_melee")).toBe(false);
    // The first refusal is the first line; the root scan itself runs on to the next line it cannot read.
    expect(selection?.blockedAt).toBe("annihilator_melee[0] metamorphosis");
    expect(selection?.stoppingPoint?.at).toBe("annihilator_melee[4] collapsing_star");
    expect(selection?.stoppingPoint?.atoms).toEqual(["APPLICABILITY:collapsing_star"]);
    const withStar = analyzed(entries([...BASE, "the_hunt", "voidfall", "dark_matter", "collapsing_star"]), [
      { t: 2000, ability: REAP },
    ]).resolved[0]?.selection;
    expect(withStar?.stoppingPoint?.at).toBe("annihilator_melee[13] call_action_list");
    expect(withStar?.stoppingPoint?.atoms).toContain("active_enemies");
  });

  it("The Hunt absent from the observed tree closes nothing: the lone node is UNKNOWN, never false", () => {
    const analysis = analyzed(VOIDSCARRED_NO_HUNT_RECORD, [{ t: 2000, ability: REAP }]);
    expect(analysis.build.talents["the_hunt"]?.selection).toBe("UNKNOWN");
    expect(analysis.build.talentsProvenAbsent).not.toContain("the_hunt");
    const { selection } = analysis.resolved[0] ?? {};
    const gates = new Map(selection?.dispatches.map((step) => [step.calleeListName, step.gate]));
    // Neither of the two lists it would choose between is treated as closed.
    expect(gates.get("voidscarred_ranged")).toBe("UNKNOWN_STATE");
    expect(selection?.stoppingPoint?.at).toBe("default[4] run_action_list");
    expect(selection?.stoppingPoint?.atoms).toEqual(["talent.the_hunt"]);
  });

  it("an unresolved tree closes nothing", () => {
    const analysis = analyzed([], [{ t: 2000, ability: REAP }]);
    expect(analysis.build.heroTree.state).toBe("UNKNOWN");
    expect(analysis.build.talentsProvenAbsent).toEqual([]);
    expect(analysis.coverage.unknown).toBe(1);
  });

  it("each hero tree proves only the other tree's talents absent", () => {
    const voidscarred = resolveDevourerDemonHunterHeroTree(entries(["voidsurge"]));
    const annihilator = resolveDevourerDemonHunterHeroTree(entries(["voidfall"]));
    expect(devourerDemonHunterTalentsDisprovedByHeroTree(voidscarred)).toEqual(["voidfall", "dark_matter"]);
    expect(devourerDemonHunterTalentsDisprovedByHeroTree(annihilator)).toEqual([
      "voidsurge",
      "demonic_intensity",
    ]);
    expect(devourerDemonHunterTalentsDisprovedByHeroTree(resolveDevourerDemonHunterHeroTree([]))).toEqual([]);
  });
});

describe("the four timed pick-up lines", () => {
  it("are four timed lines and one untimed, in four lists, sharing one token", () => {
    const lines = linesOf("pick_up_fragment");
    expect(lines.map((line) => `${line.listName}[${String(line.priorityOrdinal)}]`)).toEqual([
      "annihilator_ranged[0]",
      "annihilator_ranged[1]",
      "vsm_st[0]",
      "vsm_meta[1]",
      "vsm_out[0]",
    ]);
    expect(lines.map((line) => /line_cd=([0-9.]+)/.exec(line.actionStringVerbatim)?.[1] ?? null)).toEqual([
      "0.6",
      null,
      "0.75",
      "0.35",
      "0.3",
    ]);
  });

  it("have no spell, so no ability id binds, and nothing in a log can attribute a selection to one", () => {
    expect(devourerDemonHunterTokenBinding("pick_up_fragment").kind).not.toBe("KNOWN_ONE");
    expect(devourerDemonHunterTokenBinding("pick_up_fragment").kind).not.toBe("KNOWN_SET");
    expect([...devourerDemonHunterTokenByAbilityId().values()]).not.toContain("pick_up_fragment");
    expect(devourerDemonHunterExecutionLaneForToken("pick_up_fragment")).toBe("NON_GCD");
    // A logged Soul Fragment binds no token, so it attributes nothing to these lines.
    expect(devourerDemonHunterTokenByAbilityId().has(SOUL_FRAGMENT)).toBe(false);
  });

  it("each timer is UNKNOWN from any log, never ready and never running", () => {
    const history = lineSelectionHistoryFromObservedCasts({
      authority: authority(),
      combatStartMs: FIGHT_START,
      observedCastCoverage: { fromMs: FIGHT_START, toMs: END },
      casts: [{ actionToken: "reap", observedAtMs: 1500 }],
    });
    for (const line of linesOf("pick_up_fragment")) {
      const seconds = /line_cd=([0-9.]+)/.exec(line.actionStringVerbatim)?.[1];
      if (seconds === undefined) continue;
      const lineKey = aplLineKey(line);
      expect(history.selectionsOf(lineKey).attributed).toEqual([]);
      expect(
        lineCooldownReadinessAt({
          durationMs: Math.trunc(Number(seconds) * 1000),
          decisionTimeMs: 2000,
          lineKey,
          history,
        }).kind,
      ).toBe("UNKNOWN");
    }
  });

  it("even with the count given, the first pick-up line stops the scan on its timer, and nothing falls through", () => {
    const { rootScan, result } = queryBehindTheCount({ tree: VOIDSCARRED_MELEE, enemies: 1 });
    const pickUp = rootScan.undecidedCandidates.find((step) => step.at === "vsm_st[0] pick_up_fragment");
    expect(pickUp?.lane).toBe("NON_GCD");
    expect(pickUp?.atoms).toEqual(["LINE_CD:SELECTION_COVERAGE_NOT_PROVEN"]);
    expect(result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
  });

  it("have no transition contract, so an open line can never fire and move on", () => {
    expect(devourerDemonHunterTransitionContractFor("pick_up_fragment")).toBeNull();
    for (const token of ["vengeful_retreat", "the_hunt", "metamorphosis", "reap", "void_ray"]) {
      expect(devourerDemonHunterTransitionContractFor(token), token).toBeNull();
    }
  });
});

describe("void_ray_count", () => {
  const authorityLines = () => authority().actions.filter((action) => action.listName === "variables");

  it("is a reset then an add over a value only the simulation holds, read off the pinned list", () => {
    expect(authorityLines().map((line) => line.actionStringVerbatim)).toEqual(
      expect.arrayContaining([
        "variable,name=void_ray_count,op=reset,if=!buff.metamorphosis.up",
        "variable,name=void_ray_count,op=add,value=1,if=buff.metamorphosis.up&action.void_ray.last_used>variable.last_ray_mark",
        "variable,name=last_ray_mark,op=set,value=action.void_ray.last_used",
      ]),
    );
  });

  it("inside Metamorphosis the add is unreadable, so the count is never read as zero", () => {
    const { rootScan, result } = queryBehindTheCount({
      tree: VOIDSCARRED_MELEE,
      enemies: 2,
      knownBuffs: [{ name: "metamorphosis", up: true }],
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    // vsm_meta[0] reads the count. If it read as 0, the line would be closed; it stays open.
    const first = rootScan.undecidedCandidates.find((step) => step.at === "vsm_meta[0] soul_immolation");
    expect(first).toBeDefined();
    expect(first?.atoms.join(",")).toContain("void_ray_count");
    const wait = rootScan.undecidedCandidates.find((step) => step.at === "vsm_meta[2] wait");
    expect(wait === undefined || wait.atoms.join(",").includes("void_ray_count")).toBe(true);
  });
});

describe("the numeric react", () => {
  it("reads the pinned list's stack comparisons, and an unbound aura leaves each open rather than false", () => {
    const line = authority().actions.find(
      (action) =>
        action.listName === "annihilator_ranged" &&
        action.actionToken === "call_action_list" &&
        (action.conditionRaw ?? "").includes("buff.voidfall_spending.react>=3"),
    );
    expect(line?.conditionRaw).toContain("buff.voidfall_spending.react>=3");
    const parsed = parseSimcExpression(line?.conditionRaw ?? "", DEVOURER_DEMON_HUNTER_ATOM_VOCABULARY);
    expect(parsed.ok).toBe(true);
  });
});

describe("the wire's ids", () => {
  it("an impact, a Soul Fragment and an item are excluded, and the press beside them is what stays eligible", () => {
    const analysis = analyzed(VOIDSCARRED_MELEE, [
      { t: 2000, ability: VOIDBLADE },
      { t: 2010, ability: VOIDBLADE_IMPACT },
      { t: 3000, ability: THE_HUNT_IMPACT },
      { t: 4000, ability: SOUL_FRAGMENT },
      { t: 5000, ability: VENGEFUL_RETREAT },
      { t: 6000, ability: POTION },
    ]);
    expect(analysis.coverage.eligibleDecisions).toBe(1);
    expect(analysis.excluded.map((cast) => [cast.abilityGameId, cast.reason])).toEqual([
      [VOIDBLADE_IMPACT, "NON_GCD_ACTION"],
      [THE_HUNT_IMPACT, "NON_GCD_ACTION"],
      [SOUL_FRAGMENT, "NON_GCD_ACTION"],
      [VENGEFUL_RETREAT, "NON_GCD_ACTION"],
      [POTION, "EXECUTION_LANE_NOT_ESTABLISHED"],
    ]);
  });

  it("a cast-time action is excluded, because this facade would read it at the wrong moment", () => {
    const analysis = analyzed(VOIDSCARRED_MELEE, [
      { t: 2000, ability: CONSUME },
      { t: 4000, ability: DEVOUR },
      { t: 6000, ability: THE_HUNT },
      { t: 8000, ability: PREDATORS_WAKE },
    ]);
    expect(analysis.coverage.eligibleDecisions).toBe(0);
    expect(analysis.excluded.map((cast) => cast.reason)).toEqual([
      "OUTSIDE_FIRST_SLICE",
      "OUTSIDE_FIRST_SLICE",
      "OUTSIDE_FIRST_SLICE",
      "OUTSIDE_FIRST_SLICE",
    ]);
  });

  it("Void Ray stays eligible, because its logged cast is the channel's start", () => {
    expect(analyzed(VOIDSCARRED_MELEE, [{ t: 2000, ability: VOID_RAY }]).coverage.eligibleDecisions).toBe(1);
  });

  it("melee swings are excluded, not decisions", () => {
    const analysis = analyzed(VOIDSCARRED_MELEE, [{ t: 2000, ability: 1, melee: true }]);
    expect(analysis.coverage.eligibleDecisions).toBe(0);
    expect(analysis.excluded.map((cast) => cast.reason)).toEqual(["MELEE_SWING"]);
  });

  it("the lanes are the pinned records'", () => {
    expect(devourerDemonHunterExecutionLaneForAbility(REAP)).toBe("GCD_CONSUMING");
    expect(devourerDemonHunterExecutionLaneForAbility(VOIDBLADE)).toBe("GCD_CONSUMING");
    expect(devourerDemonHunterExecutionLaneForAbility(VOIDBLADE_IMPACT)).toBe("NON_GCD");
    expect(devourerDemonHunterExecutionLaneForAbility(POTION)).toBe("UNKNOWN_LANE");
    expect(devourerDemonHunterExecutionLaneForToken("metamorphosis")).toBe("GCD_CONSUMING");
    expect(devourerDemonHunterExecutionLaneForToken("vengeful_retreat")).toBe("NON_GCD");
    expect(devourerDemonHunterTokenByAbilityId().has(VOIDBLADE_IMPACT)).toBe(false);
    expect(devourerDemonHunterTokenByAbilityId().has(THE_HUNT_IMPACT)).toBe(false);
  });

  it("a logged Metamorphosis has no id: the action binds the record the wire never reports", () => {
    expect(devourerDemonHunterTokenByAbilityId().get(1217605)).toBe("metamorphosis");
    // The aura the wire does report never binds the press.
    expect(devourerDemonHunterTokenByAbilityId().has(1217607)).toBe(false);
  });
});

describe("the build facts", () => {
  it("reads Fury from the cast's own observation, and never zero without one", () => {
    const known = analyzed(VOIDSCARRED_MELEE, [{ t: 2000, ability: REAP, fury: 80 }]).resolved[0]
      ?.diagnostics;
    expect(known?.fury).toEqual(knownNumber(80));
    const absent = analyzed(VOIDSCARRED_MELEE, [{ t: 2000, ability: REAP }]).resolved[0]?.diagnostics;
    expect(absent?.fury).toEqual(unknownNumber("STATE_NOT_ESTABLISHED"));
  });

  it("a full Fury value decides nothing past the stop", () => {
    const { coverage, comparisons } = analyzed(VOIDSCARRED_MELEE, [{ t: 2000, ability: REAP, fury: 140 }]);
    expect(coverage.unknown).toBe(1);
    expect(comparisons[0]?.authorityToken).toBeNull();
  });

  it("Scythe's Embrace and Duty Eternal share a choice node, so one's sibling proves the other not taken", () => {
    const duty = entries(["duty_eternal"]);
    expect(resolveDevourerDemonHunterTalent(duty, "duty_eternal").selection).toBe("SELECTED");
    expect(resolveDevourerDemonHunterTalent(duty, "scythes_embrace").selection).toBe("NOT_SELECTED");
    expect(resolveDevourerDemonHunterTalent([], "scythes_embrace").selection).toBe("UNKNOWN");
  });

  it("an unmodelled tiered node stays UNKNOWN, never false", () => {
    expect(resolveDevourerDemonHunterTalent(VOIDSCARRED_MELEE, "midnight3").selection).toBe("UNKNOWN");
    expect(analyzed(VOIDSCARRED_MELEE, []).build.talentsProvenAbsent).not.toContain("midnight3");
  });

  it("a Void-Scarred tree closes nothing Annihilator's list needs and reads Annihilator's talents as false", () => {
    const build = analyzed(VOIDSCARRED_MELEE, []).build;
    expect(build.heroTree.state).toBe("RESOLVED");
    expect(build.talentsProvenAbsent).toEqual(expect.arrayContaining(["voidfall", "dark_matter"]));
    expect(build.talentsProvenAbsent).not.toContain("the_hunt");
  });
});

describe("the talent extractor's two rules this target needed", () => {
  const row = (entry: number, name: string, subTree: number, specIds: readonly number[]) => ({
    classId: 12,
    treeIndex: 3,
    idSubTree: subTree,
    specIds,
    traitEntryId: entry,
    traitNodeId: entry,
    displayNameEn: name,
    talentSpellId: entry,
    nodeType: 0,
  });
  const target = { classId: 12, specId: 1480 };

  it("a hero row scoped to no specialization is class-wide, and another specialization's row is not", () => {
    const rows = [row(1, "Class Wide", 124, []), row(2, "Ours", 124, [1480]), row(3, "Theirs", 124, [581])];
    const resolved = resolveHeroTree(rows, { simcName: "annihilator", subTreeId: 124 }, target);
    if (!resolved.ok) throw new Error(resolved.error);
    expect(resolved.heroTree.entries.map((entry) => entry.traitEntryId)).toEqual([1, 2]);
    // An empty sub-tree still fails, so a tree no entry can resolve never reads as UNKNOWN everywhere.
    expect(resolveHeroTree(rows, { simcName: "void", subTreeId: 999 }, target).ok).toBe(false);
  });

  it("a name held by two hero sub-trees is ambiguous unless the target names the tree", () => {
    const rows = [
      row(10, "Demonic Intensity", 34, [577, 1480]),
      row(11, "Demonic Intensity", 126, [577, 1480]),
    ];
    const ask = { simcName: "demonic_intensity", displayNameEn: "Demonic Intensity", tree: "HERO" };
    expect(resolveTalent(rows, ask, target).ok).toBe(false);
    const named = resolveTalent(rows, { ...ask, subTreeId: 126 }, target);
    if (!named.ok) throw new Error(named.error);
    expect(named.talent.traitEntryId).toBe(11);
  });

  it("the pinned Annihilator tree is held whole, and Demonic Intensity is Void-Scarred's", () => {
    const trees = new Map(devourerTalents.heroTrees.map((tree) => [tree.simcName, tree]));
    expect(trees.get("annihilator")?.subTreeId).toBe(124);
    expect(trees.get("annihilator")?.entries.length).toBe(16);
    expect(trees.get("voidscarred")?.entries.length).toBe(17);
    const intensity = devourerTalents.talents.find((talent) => talent.simcName === "demonic_intensity");
    expect(trees.get("voidscarred")?.entries.map((entry) => entry.traitEntryId)).toContain(
      intensity?.traitEntryId,
    );
  });
});

describe("applicability", () => {
  const line = (list: string, token: string): AplAction => {
    const found = authority().actions.find(
      (action) => action.listName === list && action.actionToken === token,
    );
    if (found === undefined) throw new Error(`no ${token} in ${list}`);
    return found;
  };
  const empty = { talents: {}, talentsProvenAbsent: new Set<string>() };

  it("an unknown talent never closes an action it builds", () => {
    expect(resolveDevourerDemonHunterApplicability(empty, line("vsm_st", "void_ray")).kind).toBe("UNKNOWN");
  });

  it("Annihilator's tree proves the Voidsurge actions background, and an absent Voidsurge alone does not", () => {
    const annihilator = {
      talents: {},
      talentsProvenAbsent: new Set<string>(["voidsurge", "demonic_intensity"]),
    };
    expect(
      resolveDevourerDemonHunterApplicability(annihilator, line("annihilator_melee", "reapers_toll")).kind,
    ).toBe("NOT_APPLICABLE");
    expect(
      resolveDevourerDemonHunterApplicability(empty, line("annihilator_melee", "reapers_toll")).kind,
    ).toBe("UNKNOWN");
    expect(resolveDevourerDemonHunterApplicability(annihilator, line("vsm_st", "predators_wake")).kind).toBe(
      "NOT_APPLICABLE",
    );
  });

  it("an absent Collapsing Star does not close its line, because the Midnight node also opens it", () => {
    expect(
      resolveDevourerDemonHunterApplicability(empty, line("annihilator_melee", "collapsing_star")).kind,
    ).toBe("UNKNOWN");
    expect(analyzed(ANNIHILATOR_MELEE, []).build.talentsProvenAbsent).not.toContain("collapsing_star");
  });

  it("the baseline spells have no talent guard", () => {
    expect(resolveDevourerDemonHunterApplicability(empty, line("reaps", "reap")).kind).toBe("APPLICABLE");
    expect(resolveDevourerDemonHunterApplicability(empty, line("reaps", "cull")).kind).toBe("APPLICABLE");
    expect(resolveDevourerDemonHunterApplicability(empty, line("vsm_st", "consume")).kind).toBe("APPLICABLE");
  });
});
