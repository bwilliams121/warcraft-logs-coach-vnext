/**
 * ONB-A2: Subtlety Rogue, Fury Warrior and Protection Warrior, Cohort A's followers.
 *
 * No retained capture holds any of their events (agent/follow-ups.md "After ONB-A2"), so there is
 * no real decision to pin. What is here is what can be proven without one: their pinned data and
 * authority, and every wrong answer their rules exist to prevent. The mandatory negative is the
 * centre of it. An unresolved enemy count, a missing talent or an absent resource never becomes a
 * MATCH, a REJECTED or a fall-through to a lower entry.
 */

import { describe, expect, it } from "vitest";

import {
  pinnedSubtletyRogueGcdSemantics,
  subtletyExecutionLaneForToken,
  subtletyTokenByAbilityId,
} from "../../../src/data/game/rogue-subtlety-gcd-semantics.js";
import {
  pinnedSubtletyRogueTalents,
  resolveSubtletyHeroTree,
} from "../../../src/data/game/rogue-subtlety-talents.js";
import { subtletyTransitionContractFor } from "../../../src/data/game/rogue-subtlety-transition-authority.js";
import {
  furyWarriorExecutionLaneForToken,
  furyWarriorTokenByAbilityId,
  pinnedFuryWarriorGcdSemantics,
} from "../../../src/data/game/warrior-fury-gcd-semantics.js";
import {
  pinnedFuryWarriorTalents,
  resolveFuryWarriorHeroTree,
  resolveFuryWarriorTalent,
} from "../../../src/data/game/warrior-fury-talents.js";
import { furyWarriorTransitionContractFor } from "../../../src/data/game/warrior-fury-transition-authority.js";
import {
  pinnedProtectionWarriorGcdSemantics,
  protectionWarriorExecutionLaneForToken,
  protectionWarriorTokenByAbilityId,
} from "../../../src/data/game/warrior-protection-gcd-semantics.js";
import {
  pinnedProtectionWarriorTalents,
  resolveProtectionWarriorHeroTree,
  resolveProtectionWarriorTalent,
} from "../../../src/data/game/warrior-protection-talents.js";
import { protectionWarriorTransitionContractFor } from "../../../src/data/game/warrior-protection-transition-authority.js";
import furyTalents from "../../../src/data/game/warrior-fury-talents.json";
import protectionTalents from "../../../src/data/game/warrior-protection-talents.json";
import subtletyTalents from "../../../src/data/game/rogue-subtlety-talents.json";
import { actionOptionSupport, type AplAction, type AplAuthority } from "../../../src/simc/apl-authority.js";
import { createCombatState } from "../../../src/engine/state/combat-state.js";
import type { AnalyzerRegistration } from "../../../src/findings/analyzer-registration.js";
import {
  analyzerForSpec,
  internalAnalyzerForSpec,
  PRODUCTION_CATALOG,
} from "../../../src/services/analyzer-registry.js";
import { resolveSpecIdentity } from "../../../src/services/spec-identity.js";
import { resolveSubtletyApplicability } from "../../../src/specs/rogue/subtlety/action-profile.js";
import { analyzeObservedSubtletyRogueDecisions } from "../../../src/specs/rogue/subtlety/observed-analysis.js";
import { pinnedSubtletyRogueAuthority } from "../../../src/specs/rogue/subtlety/pinned-authority.js";
import { subtletyTalentsDisprovedByHeroTree } from "../../../src/specs/rogue/subtlety/resolver.js";
import { resolveFuryWarriorApplicability } from "../../../src/specs/warrior/fury/action-profile.js";
import { analyzeObservedFuryWarriorDecisions } from "../../../src/specs/warrior/fury/observed-analysis.js";
import { pinnedFuryWarriorAuthority } from "../../../src/specs/warrior/fury/pinned-authority.js";
import { furyWarriorTalentsDisprovedByHeroTree } from "../../../src/specs/warrior/fury/resolver.js";
import { resolveProtectionWarriorApplicability } from "../../../src/specs/warrior/protection/action-profile.js";
import { analyzeObservedProtectionWarriorDecisions } from "../../../src/specs/warrior/protection/observed-analysis.js";
import { pinnedProtectionWarriorAuthority } from "../../../src/specs/warrior/protection/pinned-authority.js";
import {
  protectionWarriorTalentsDisprovedByHeroTree,
  resolveProtectionWarriorAtoms,
} from "../../../src/specs/warrior/protection/resolver.js";
import {
  HERO_TREE_COLOSSUS,
  HERO_TREE_MOUNTAIN_THANE,
} from "../../../src/specs/warrior/protection/vocabulary.js";
import type { TalentResolution } from "../../../src/data/game/talent-selection.js";
import { knownNumber, unknownNumber } from "../../../src/simc/expression/evaluate.js";
import { evaluateCondition } from "../../../src/simc/list-selection.js";
import type { CombatEvent } from "../../../src/engine/normalization/normalized-events.js";
import {
  attachedResources,
  castEvent,
  classResource,
  syntheticFight,
} from "../../support/synthetic-fight.js";

function authorityOf(load: () => { ok: boolean }): AplAuthority {
  const loaded = load() as { ok: true; authority: AplAuthority } | { ok: false };
  if (!loaded.ok) throw new Error("a pinned authority did not load");
  return loaded.authority;
}

const talent = (simcName: string, selection: TalentResolution["selection"]): TalentResolution => ({
  simcName,
  selection,
  reason: selection === "SELECTED" ? "OWN_ENTRY_SELECTED" : "NODE_ABSENT",
  identity: null,
  decidedByEntryId: null,
});

const entryOf = (authority: AplAuthority, listName: string, token: string): AplAction => {
  const found = authority.actions.find(
    (action) => action.listName === listName && action.actionToken === token,
  );
  if (found === undefined) throw new Error(`no ${token} in ${listName}`);
  return found;
};

const SOURCE = 7;
const TARGET = 900;

interface Build {
  readonly entries: readonly { readonly id: number; readonly nodeID: number }[];
}

interface Cast {
  readonly t: number;
  readonly ability: number;
  readonly resource?: {
    readonly type: number;
    readonly amount: number;
    readonly max: number;
    readonly cost: number;
  };
}

/** The actor's own combatant info, then their casts, as M3 would have normalized them. */
function fightWith(build: Build | null, casts: readonly Cast[]) {
  const events: CombatEvent[] = [];
  if (build !== null) {
    const talentTree = build.entries.map((entry) => ({ id: entry.id, rank: 1, nodeId: entry.nodeID }));
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
        targetActorId: TARGET,
        abilityGameId: cast.ability,
        castPhase: "COMPLETE",
        attachedResources:
          cast.resource === undefined
            ? null
            : attachedResources({
                side: "SOURCE",
                actorId: SOURCE,
                classResources: [
                  classResource(cast.resource.type, cast.resource.amount, {
                    max: cast.resource.max,
                    cost: cast.resource.cost,
                  }),
                ],
              }),
      }),
    );
  });
  return createCombatState(syntheticFight({ endTimeMs: 600000, events }));
}

// Trait entries read off the committed artifacts, so the three-way rule runs for real.
const entriesOf = (
  artifact: { readonly talents: readonly { simcName: string; traitEntryId: number; traitNodeId: number }[] },
  names: readonly string[],
): readonly { readonly id: number; readonly nodeID: number }[] =>
  names.map((name) => {
    const row = artifact.talents.find((candidate) => candidate.simcName === name);
    if (row === undefined) throw new Error(`no pinned talent ${name}`);
    return { id: row.traitEntryId, nodeID: row.traitNodeId };
  });

const SLAYER_ENTRIES = entriesOf(furyTalents, ["slayers_dominance"]);
const THANE_ENTRIES = entriesOf(furyTalents, ["lightning_strikes"]);
const COLOSSUS_ENTRIES = entriesOf(protectionTalents, ["demolish"]);
const DEATHSTALKER_ENTRIES = entriesOf(subtletyTalents, ["deathstalkers_mark"]);

/** A whole Slayer tree: every action of the list applicable, so a scan reaches the hero dispatches. */
const WHOLE_SLAYER_BUILD = entriesOf(furyTalents, [
  "slayers_dominance",
  "recklessness",
  "bladestorm",
  "odyns_fury",
  "raging_blow",
  "rampage",
  "bloodthirst",
  "thunder_clap",
  "storm_bolt",
  "heroic_leap",
]);
/** A whole Colossus tree, the same way. */
const WHOLE_COLOSSUS_BUILD = entriesOf(protectionTalents, [
  "demolish",
  "avatar",
  "shield_wall",
  "ignore_pain",
  "ravager",
  "demoralizing_shout",
  "champions_spear",
  "shield_charge",
  "thunder_clap",
  "revenge",
  "wrecking_throw",
]);

const SPECS = [
  {
    name: "Subtlety Rogue",
    specId: "rogue/subtlety",
    analyzerId: "rogue-subtlety-observed-decisions",
    analyze: analyzeObservedSubtletyRogueDecisions,
    entries: DEATHSTALKER_ENTRIES,
    gcdCast: 53, // Backstab
    offGcdCast: 185313, // Shadow Dance
    foreignCast: 100, // Charge, which no Subtlety list names
    className: "Rogue",
    wclSpec: "Subtlety",
  },
  {
    name: "Fury Warrior",
    specId: "warrior/fury",
    analyzerId: "warrior-fury-observed-decisions",
    analyze: analyzeObservedFuryWarriorDecisions,
    entries: SLAYER_ENTRIES,
    gcdCast: 23881, // Bloodthirst
    offGcdCast: 1719, // Recklessness
    foreignCast: 23922, // Shield Slam, which no Fury list names
    className: "Warrior",
    wclSpec: "Fury",
  },
  {
    name: "Protection Warrior",
    specId: "warrior/protection",
    analyzerId: "warrior-protection-observed-decisions",
    analyze: analyzeObservedProtectionWarriorDecisions,
    entries: COLOSSUS_ENTRIES,
    gcdCast: 23922, // Shield Slam
    offGcdCast: 2565, // Shield Block
    foreignCast: 23881, // Bloodthirst, which no Protection list names
    className: "Warrior",
    wclSpec: "Protection",
  },
] as const;

describe.each(SPECS)("$name", (spec) => {
  const run = (build: Build | null, casts: Parameters<typeof fightWith>[1]) =>
    spec.analyze({
      state: fightWith(build, casts),
      actorId: SOURCE,
      specId: spec.specId,
      targetActorId: null,
    });

  it("is reachable by the internal lookup only, and a public identity is refused", () => {
    const row = internalAnalyzerForSpec(spec.specId, PRODUCTION_CATALOG) as AnalyzerRegistration;
    expect(row.analyzerId).toBe(spec.analyzerId);
    expect(row.exposure).toBe("INTERNAL_ONLY");
    expect(analyzerForSpec(spec.specId, PRODUCTION_CATALOG)).toBeNull();
    expect(resolveSpecIdentity({ className: spec.className, specName: spec.wclSpec }).ok).toBe(false);
  });

  it("refuses another specialization before reading anything of its own", () => {
    expect(
      spec.analyze({
        state: fightWith(null, []),
        actorId: SOURCE,
        specId: "paladin/protection",
        targetActorId: null,
      }).status,
    ).toBe("SPEC_NOT_SUPPORTED");
  });

  it("a filtered capture with no combatant info refuses as PROFILE_NOT_RESOLVED, never judges", () => {
    expect(run(null, [{ t: 2000, ability: spec.gcdCast }]).status).toBe("PROFILE_NOT_RESOLVED");
  });

  it("no decision resolves, and none is ever a confident verdict", () => {
    const analysis = run({ entries: spec.entries }, [
      { t: 2000, ability: spec.gcdCast },
      { t: 3500, ability: spec.gcdCast },
      { t: 5000, ability: spec.gcdCast },
    ]);
    if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
    const { coverage } = analysis;
    expect(coverage.eligibleDecisions).toBe(3);
    expect(coverage.match).toBe(0);
    expect(coverage.rejected).toBe(0);
    expect(coverage.unknown).toBe(3);
    expect(coverage.resolvedComparisons).toBe(0);
    expect(analysis.comparisons.every((comparison) => comparison.outcome === "UNKNOWN")).toBe(true);
    // Each UNKNOWN is explained: the engine names where it stopped.
    expect(coverage.unresolvedAt.length).toBeGreaterThan(0);
    expect(analysis.resolved.every((entry) => entry.selection.kind === "ROTATIONAL_GCD_UNKNOWN")).toBe(true);
  });

  it("classifies the population: an off-GCD press and a spell the dataset has no record of are excluded, never judged", () => {
    const analysis = run({ entries: spec.entries }, [
      { t: 2000, ability: spec.offGcdCast },
      { t: 2500, ability: 999999 },
      { t: 3000, ability: spec.foreignCast },
    ]);
    if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
    expect(analysis.comparisons).toHaveLength(0);
    expect(analysis.excluded.map((cast) => cast.reason)).toEqual([
      "NON_GCD_ACTION",
      "EXECUTION_LANE_NOT_ESTABLISHED",
      "EXECUTION_LANE_NOT_ESTABLISHED",
    ]);
    expect(analysis.coverage.excludedCastCount).toBe(3);
  });

  it("a build with no hero entry is carried as UNKNOWN, and still judges nothing", () => {
    const analysis = run({ entries: [] }, [{ t: 2000, ability: spec.gcdCast }]);
    if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
    expect(analysis.build.heroTree.state).toBe("UNKNOWN");
    expect(analysis.build.talentsProvenAbsent).toEqual([]);
    expect(analysis.coverage.unknown).toBe(1);
  });

  it("declares offensive authority only, and reports every other domain without it", () => {
    const analysis = run({ entries: spec.entries }, []);
    if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
    const byDomain = new Map(analysis.domains.map((result) => [result.domain, result.resolution]));
    expect(byDomain.get("OFFENSIVE_ROTATION")).toBe("AUTHORITY_AVAILABLE");
    expect(byDomain.get("INTERRUPT")).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
    expect(byDomain.get("DEFENSIVE_COOLDOWN")).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
    expect(byDomain.get("RESOURCE_SPENDING")).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
  });
});

describe("where each list stops, measured over a whole build", () => {
  const WHOLE_THANE_BUILD = [
    ...THANE_ENTRIES,
    ...WHOLE_SLAYER_BUILD.filter((entry) => !SLAYER_ENTRIES.some((slayer) => slayer.id === entry.id)),
  ];
  const WHOLE_DEATHSTALKER_BUILD = entriesOf(subtletyTalents, [
    "deathstalkers_mark",
    "goremaws_bite",
    "gloomblade",
    "shadow_blades",
  ]);

  const firstOf = <T extends { status: string }>(analysis: T) => {
    if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
    return analysis as Extract<T, { status: "ANALYZED" }>;
  };

  it("Fury: an open enemy count stops the Slayer dispatch, and never falls through to a lower list", () => {
    const analysis = firstOf(
      analyzeObservedFuryWarriorDecisions({
        state: fightWith({ entries: WHOLE_SLAYER_BUILD }, [{ t: 2000, ability: 23881 }]),
        actorId: SOURCE,
        specId: "warrior/fury",
        targetActorId: null,
      }),
    );
    const selection = analysis.resolved[0]?.selection;
    expect(selection?.stoppingPoint?.at).toBe("default[14] run_action_list");
    expect(selection?.stoppingPoint?.atoms).toEqual(["active_enemies"]);
    const dispatch = selection?.dispatches.find((step) => step.calleeListName === "slayer");
    expect(dispatch?.gate).toBe("UNKNOWN_STATE");
    // Nothing below the open gate was visited, so nothing below it can be selected.
    expect(selection?.dispatches.some((step) => step.calleeListName === "slayer_aoe")).toBe(false);
    expect(analysis.comparisons[0]?.outcome).toBe("UNKNOWN");
  });

  it("Fury: a Thane build's Slayer lists are closed by the resolved tree, and its own stay open", () => {
    const analysis = firstOf(
      analyzeObservedFuryWarriorDecisions({
        state: fightWith({ entries: WHOLE_THANE_BUILD }, [{ t: 2000, ability: 23881 }]),
        actorId: SOURCE,
        specId: "warrior/fury",
        targetActorId: null,
      }),
    );
    const selection = analysis.resolved[0]?.selection;
    expect(analysis.build.talentsProvenAbsent).toContain("slayers_dominance");
    expect(
      selection?.dispatches.filter((step) => step.calleeListName?.startsWith("slayer")).map((s) => s.gate),
    ).toEqual(["FALSE", "FALSE"]);
    expect(selection?.stoppingPoint?.at).toBe("default[16] run_action_list");
    expect(selection?.stoppingPoint?.atoms).toEqual(["active_enemies"]);
  });

  it("Protection: Ignore Pain's condition stops the scan as unsupported, and its line is never a verdict", () => {
    const analysis = firstOf(
      analyzeObservedProtectionWarriorDecisions({
        state: fightWith({ entries: WHOLE_COLOSSUS_BUILD }, [{ t: 2000, ability: 23922 }]),
        actorId: SOURCE,
        specId: "warrior/protection",
        targetActorId: null,
      }),
    );
    const stop = analysis.resolved[0]?.selection.stoppingPoint;
    expect(stop?.at).toBe("default[15] ignore_pain");
    expect(stop?.atoms[0]).toMatch(/^UNSUPPORTED_EXPRESSION:TOO_MANY_UNRESOLVED_ATOMS:/);
    expect(analysis.comparisons[0]?.outcome).toBe("UNKNOWN");
    expect(analysis.comparisons[0]?.authorityToken).toBeNull();
  });

  it("Subtlety: every decision refuses at Stealth, which has no contract", () => {
    const analysis = firstOf(
      analyzeObservedSubtletyRogueDecisions({
        state: fightWith({ entries: WHOLE_DEATHSTALKER_BUILD }, [{ t: 2000, ability: 53 }]),
        actorId: SOURCE,
        specId: "rogue/subtlety",
        targetActorId: null,
      }),
    );
    expect(analysis.resolved[0]?.selection.blockedAt).toBe("default[5] stealth");
    expect(analysis.comparisons[0]?.rawBlocker).toBe("TRANSITION_UNSUPPORTED");
  });

  it("Protection: a resolved tree closes the other tree's AoE dispatch and leaves its own open on the enemy count", () => {
    const authority = authorityOf(pinnedProtectionWarriorAuthority);
    const dispatch = (list: string): AplAction => {
      const found = authority.actions.find(
        (action) => action.actionToken === "run_action_list" && action.callsListName === list,
      );
      if (found === undefined) throw new Error(`no dispatch to ${list}`);
      return found;
    };
    const resolution = resolveProtectionWarriorAtoms({
      heroTree: resolveProtectionWarriorHeroTree(
        COLOSSUS_ENTRIES.map((e) => ({ id: e.id, nodeId: e.nodeID })),
      ),
      talents: {},
      talentsProvenAbsent: new Set(),
      rage: knownNumber(40),
      rageDeficit: knownNumber(60),
    });
    const bindings = {
      comboPoints: unknownNumber("STATE_NOT_MODELLED"),
      comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
      energyPct: unknownNumber("STATE_NOT_MODELLED"),
      knownBuffs: [],
      knownTalents: [],
      knownCooldownRemainsSeconds: [],
      specAtoms: resolution.specAtoms,
    };
    const truthOf = (list: string) => {
      const condition = evaluateCondition(dispatch(list), bindings);
      return condition.kind === "EVALUATED" ? condition.truth : condition.kind;
    };
    expect(truthOf("thane_aoe")).toBe("FALSE");
    expect(truthOf("colossus_aoe")).toBe("UNKNOWN_STATE");
  });
});

describe("the tank's meaning stays its own", () => {
  it("a logged mitigation press is excluded off-GCD, whatever the list says about it", () => {
    const analysis = analyzeObservedProtectionWarriorDecisions({
      state: fightWith({ entries: COLOSSUS_ENTRIES }, [
        { t: 2000, ability: 2565 }, // Shield Block
        { t: 3000, ability: 190456 }, // Ignore Pain
        { t: 4000, ability: 871 }, // Shield Wall
      ]),
      actorId: SOURCE,
      specId: "warrior/protection",
      targetActorId: null,
    });
    if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
    expect(analysis.comparisons).toHaveLength(0);
    expect(analysis.excluded.map((cast) => cast.reason)).toEqual([
      "NON_GCD_ACTION",
      "NON_GCD_ACTION",
      "NON_GCD_ACTION",
    ]);
    const byDomain = new Map(analysis.domains.map((result) => [result.domain, result.resolution]));
    expect(byDomain.get("ACTIVE_MITIGATION")).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
    expect(byDomain.get("SELF_HEALING")).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
  });

  it("Demolish, channelled, is excluded rather than judged at the wrong moment", () => {
    const analysis = analyzeObservedProtectionWarriorDecisions({
      state: fightWith({ entries: COLOSSUS_ENTRIES }, [{ t: 2000, ability: 436358 }]),
      actorId: SOURCE,
      specId: "warrior/protection",
      targetActorId: null,
    });
    if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
    expect(analysis.excluded.map((cast) => cast.reason)).toEqual(["OUTSIDE_FIRST_SLICE"]);
  });

  it("the talent guard belongs to the mitigation action too: unresolved is never background", () => {
    const authority = authorityOf(pinnedProtectionWarriorAuthority);
    const entry = entryOf(authority, "default", "ignore_pain");
    expect(
      resolveProtectionWarriorApplicability({ talents: {}, talentsProvenAbsent: new Set() }, entry).kind,
    ).toBe("UNKNOWN");
    expect(
      resolveProtectionWarriorApplicability(
        { talents: {}, talentsProvenAbsent: new Set(["ignore_pain"]) },
        entry,
      ).kind,
    ).toBe("NOT_APPLICABLE");
  });

  it("a Protection DPS-style domain report never says the offensive authority governs mitigation", () => {
    const analysis = analyzeObservedProtectionWarriorDecisions({
      state: fightWith({ entries: COLOSSUS_ENTRIES }, []),
      actorId: SOURCE,
      specId: "warrior/protection",
      targetActorId: null,
    });
    if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
    for (const result of analysis.domains) {
      if (result.domain !== "OFFENSIVE_ROTATION")
        expect(result).toMatchObject({ offensiveAuthorityGoverns: false });
    }
  });
});

describe("the resources are the decision cast's own", () => {
  const RAGE = 1;
  const analysisOf = (resource: Cast["resource"]) => {
    const analysis = analyzeObservedFuryWarriorDecisions({
      state: fightWith({ entries: SLAYER_ENTRIES }, [
        { t: 2000, ability: 184367, ...(resource === undefined ? {} : { resource }) },
      ]),
      actorId: SOURCE,
      specId: "warrior/fury",
      targetActorId: null,
    });
    if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
    return analysis;
  };

  it("a costed cast's own snapshot binds Rage in SimulationCraft's units", () => {
    const analysis = analysisOf({ type: RAGE, amount: 800, max: 1000, cost: 800 });
    expect(analysis.resolved[0]?.diagnostics.rage).toEqual(knownNumber(80));
  });

  it("a cast with no snapshot is unknown, never zero", () => {
    expect(analysisOf(undefined).resolved[0]?.diagnostics.rage).toEqual(
      unknownNumber("STATE_NOT_ESTABLISHED"),
    );
  });

  it("a known Rage value still decides nothing past the enemy count", () => {
    expect(analysisOf({ type: RAGE, amount: 1000, max: 1000, cost: 800 }).comparisons[0]?.outcome).toBe(
      "UNKNOWN",
    );
  });
});

describe("missing talents stay UNKNOWN", () => {
  it("a lone-node talent absent from the tree is not NOT_SELECTED", () => {
    const entries = THANE_ENTRIES.map((entry) => ({ id: entry.id, nodeId: entry.nodeID }));
    expect(resolveFuryWarriorTalent(entries, "massacre").selection).toBe("UNKNOWN");
    expect(resolveProtectionWarriorTalent(entries, "javelineer").selection).toBe("UNKNOWN");
    const fury = authorityOf(pinnedFuryWarriorAuthority);
    expect(
      resolveFuryWarriorApplicability(
        { talents: { rampage: talent("rampage", "UNKNOWN") }, talentsProvenAbsent: new Set() },
        entryOf(fury, "thane", "rampage"),
      ).kind,
    ).toBe("UNKNOWN");
  });

  it("a choice-node talent is NOT_SELECTED only when its sibling is observed", () => {
    // Avatar and Bladestorm share a Fury node: entry 112284 is Bladestorm, on node 90415.
    const taken = [{ id: 112284, nodeId: 90415 }];
    expect(resolveFuryWarriorTalent(taken, "bladestorm").selection).toBe("SELECTED");
    expect(resolveFuryWarriorTalent(taken, "avatar").selection).toBe("NOT_SELECTED");
    expect(resolveFuryWarriorTalent([], "avatar").selection).toBe("UNKNOWN");
  });

  it("an action built on a talent proven absent is background; an unresolved one never is", () => {
    const sub = authorityOf(pinnedSubtletyRogueAuthority);
    const entry = entryOf(sub, "cds", "goremaws_bite");
    expect(
      resolveSubtletyApplicability({ talents: {}, talentsProvenAbsent: new Set(["goremaws_bite"]) }, entry)
        .kind,
    ).toBe("NOT_APPLICABLE");
    expect(resolveSubtletyApplicability({ talents: {}, talentsProvenAbsent: new Set() }, entry).kind).toBe(
      "UNKNOWN",
    );
    expect(
      resolveSubtletyApplicability(
        { talents: { goremaws_bite: talent("goremaws_bite", "SELECTED") }, talentsProvenAbsent: new Set() },
        entry,
      ).kind,
    ).toBe("APPLICABLE");
  });
});

describe("one hero tree, and what it proves", () => {
  it("a resolved tree disproves only the other tree's talents", () => {
    expect(
      furyWarriorTalentsDisprovedByHeroTree(
        resolveFuryWarriorHeroTree(SLAYER_ENTRIES.map((e) => ({ id: e.id, nodeId: e.nodeID }))),
      ),
    ).toEqual(["lightning_strikes"]);
    expect(
      protectionWarriorTalentsDisprovedByHeroTree(
        resolveProtectionWarriorHeroTree(COLOSSUS_ENTRIES.map((e) => ({ id: e.id, nodeId: e.nodeID }))),
      ),
    ).toEqual(["lightning_strikes", "snap_induction"]);
    expect(
      subtletyTalentsDisprovedByHeroTree(
        resolveSubtletyHeroTree(DEATHSTALKER_ENTRIES.map((e) => ({ id: e.id, nodeId: e.nodeID }))),
      ),
    ).toEqual(["unseen_blade", "coup_de_grace"]);
  });

  it("an unresolved or contradictory tree disproves nothing", () => {
    expect(furyWarriorTalentsDisprovedByHeroTree(resolveFuryWarriorHeroTree([]))).toEqual([]);
    const both = [...SLAYER_ENTRIES, ...THANE_ENTRIES].map((e) => ({ id: e.id, nodeId: e.nodeID }));
    expect(resolveFuryWarriorHeroTree(both).state).toBe("CONTRADICTORY");
    expect(furyWarriorTalentsDisprovedByHeroTree(resolveFuryWarriorHeroTree(both))).toEqual([]);
  });

  it("Protection binds hero_tree atoms from the tree alone, both or neither", () => {
    const base = {
      talents: {},
      talentsProvenAbsent: new Set<string>(),
      rage: unknownNumber("STATE_NOT_ESTABLISHED"),
      rageDeficit: unknownNumber("STATE_NOT_ESTABLISHED"),
    };
    const colossus = resolveProtectionWarriorAtoms({
      ...base,
      heroTree: resolveProtectionWarriorHeroTree(
        COLOSSUS_ENTRIES.map((e) => ({ id: e.id, nodeId: e.nodeID })),
      ),
    });
    const byKey = new Map(colossus.specAtoms.bound.map((entry) => [entry.key, entry.value]));
    expect(byKey.get(HERO_TREE_COLOSSUS)).toEqual({ kind: "TRUTH", value: true });
    expect(byKey.get(HERO_TREE_MOUNTAIN_THANE)).toEqual({ kind: "TRUTH", value: false });
    const unresolved = resolveProtectionWarriorAtoms({
      ...base,
      heroTree: resolveProtectionWarriorHeroTree([]),
    });
    const keys = unresolved.specAtoms.bound.map((entry) => entry.key);
    expect(keys).not.toContain(HERO_TREE_COLOSSUS);
    expect(keys).not.toContain(HERO_TREE_MOUNTAIN_THANE);
  });
});

describe("the pinned data", () => {
  it("every dataset loads, and every token a pinned list can select on the GCD has one lane", () => {
    for (const load of [
      pinnedSubtletyRogueGcdSemantics,
      pinnedFuryWarriorGcdSemantics,
      pinnedProtectionWarriorGcdSemantics,
    ]) {
      expect(load().ok).toBe(true);
    }
    for (const load of [
      pinnedSubtletyRogueTalents,
      pinnedFuryWarriorTalents,
      pinnedProtectionWarriorTalents,
    ]) {
      expect(load().ok).toBe(true);
    }
  });

  it("the off-GCD actions are off the GCD, and the rest are on it", () => {
    for (const token of ["charge", "heroic_leap", "pummel", "recklessness", "avatar"]) {
      expect(furyWarriorExecutionLaneForToken(token), token).toBe("NON_GCD");
    }
    for (const token of ["rampage", "bloodthirst", "raging_blow", "execute", "bladestorm", "thunder_blast"]) {
      expect(furyWarriorExecutionLaneForToken(token), token).toBe("GCD_CONSUMING");
    }
    for (const token of [
      "charge",
      "avatar",
      "shield_wall",
      "ignore_pain",
      "shield_block",
      "champions_leap",
    ]) {
      expect(protectionWarriorExecutionLaneForToken(token), token).toBe("NON_GCD");
    }
    for (const token of ["shield_slam", "thunder_clap", "revenge", "execute", "devastate", "ravager"]) {
      expect(protectionWarriorExecutionLaneForToken(token), token).toBe("GCD_CONSUMING");
    }
    for (const token of ["stealth", "shadow_blades", "shadow_dance", "vanish"]) {
      expect(subtletyExecutionLaneForToken(token), token).toBe("NON_GCD");
    }
    for (const token of ["backstab", "shadowstrike", "eviscerate", "secret_technique", "coup_de_grace"]) {
      expect(subtletyExecutionLaneForToken(token), token).toBe("GCD_CONSUMING");
    }
  });

  it("an id Warcraft Logs may report that the pinned module does not build has no token", () => {
    // Fury's Execute is 5308 and Protection's 163201; neither binds the other's or any Massacre id.
    expect(furyWarriorTokenByAbilityId().get(5308)).toBe("execute");
    expect(furyWarriorTokenByAbilityId().has(163201)).toBe(false);
    expect(furyWarriorTokenByAbilityId().has(280735)).toBe(false);
    expect(protectionWarriorTokenByAbilityId().get(163201)).toBe("execute");
    expect(protectionWarriorTokenByAbilityId().has(5308)).toBe(false);
    // Coup de Grace's action is 441776, never its talent record.
    expect(subtletyTokenByAbilityId().get(441776)).toBe("coup_de_grace");
    expect(subtletyTokenByAbilityId().has(441423)).toBe(false);
    expect(furyWarriorTokenByAbilityId().get(446035)).toBe("bladestorm");
    expect(furyWarriorTokenByAbilityId().get(227847)).toBe("bladestorm");
  });

  it("only auto_attack has a transition contract, and it writes nothing a condition reads", () => {
    expect(furyWarriorTransitionContractFor("auto_attack")?.writes).toEqual(["OWN_PREFIX_AVAILABILITY"]);
    expect(protectionWarriorTransitionContractFor("auto_attack")?.writes).toEqual([
      "OWN_PREFIX_AVAILABILITY",
    ]);
    for (const token of ["charge", "heroic_leap", "pummel", "recklessness", "avatar"]) {
      expect(furyWarriorTransitionContractFor(token), token).toBeNull();
    }
    for (const token of [
      "charge",
      "avatar",
      "shield_wall",
      "ignore_pain",
      "shield_block",
      "champions_leap",
    ]) {
      expect(protectionWarriorTransitionContractFor(token), token).toBeNull();
    }
    for (const token of ["stealth", "shadow_blades", "shadow_dance", "vanish"]) {
      expect(subtletyTransitionContractFor(token), token).toBeNull();
    }
  });
});

describe("the authority's own options", () => {
  it("no new option key is admitted for these lists", () => {
    // `toggle`, `op`, `value_else`, `condition` and `slot` stay what they were: refused options,
    // reachable only on non-domain or precombat entries.
    expect(actionOptionSupport("slot")).not.toBe("SUPPORTED");
    expect(actionOptionSupport("toggle")).not.toBe("SUPPORTED");
  });
});
