/**
 * ONB-A1P: the guard promotion added to Havoc Demon Hunter, and nothing else.
 *
 * Havoc's public slice is validated against Aldrachi Reaver evidence. A Fel-Scarred
 * build, a build with no hero tree, and a build with entries in both fail closed, on
 * existing public statuses, with no decision judged. The gate may not be satisfied by
 * inference: the hero tree comes from the observed trait entries, never from the
 * actions cast.
 */

import { describe, expect, it } from "vitest";

import { PUBLIC_ANALYSIS_STATUSES } from "../../../src/contracts/analysis-contract.js";
import type { HeroTreeResolution } from "../../../src/data/game/talent-selection.js";
import talents from "../../../src/data/game/demonhunter-havoc-talents.json";
import { resolveHavocHeroTree } from "../../../src/data/game/demonhunter-havoc-talents.js";
import type { CombatEvent } from "../../../src/engine/normalization/normalized-events.js";
import { createCombatState } from "../../../src/engine/state/combat-state.js";
import { analyzeObservedHavocDemonHunterDecisions } from "../../../src/specs/demonhunter/havoc/observed-analysis.js";
import {
  HAVOC_VALIDATED_HERO_TREES,
  havocValidatedProfile,
} from "../../../src/specs/demonhunter/havoc/supported-profile.js";
import { syntheticFight } from "../../support/synthetic-fight.js";

const ACTOR = 18;

const ALDRACHI: HeroTreeResolution = {
  state: "RESOLVED",
  simcName: "aldrachi_reaver",
  subTreeId: 35,
  decidedByEntryIds: [117512],
};
const FELSCARRED: HeroTreeResolution = {
  state: "RESOLVED",
  simcName: "felscarred",
  subTreeId: 34,
  decidedByEntryIds: [117514],
};

/** The pinned entries of one hero tree, as a combatantinfo would report them. */
function entriesOf(simcName: string): readonly { id: number; rank: number; nodeId: number }[] {
  const tree = talents.heroTrees.find((candidate) => candidate.simcName === simcName);
  if (tree === undefined) throw new Error(`no pinned hero tree ${simcName}`);
  return tree.entries.map((entry) => ({ id: entry.traitEntryId, rank: 1, nodeId: entry.traitNodeId }));
}

/** A fight whose one event is this actor's combatant snapshot, carrying this talent tree. */
function fightWith(talentTree: readonly { id: number; rank: number; nodeId: number }[]) {
  const rawType = "combatantinfo";
  const event = {
    locator: {
      streamId: "all",
      pageOrdinal: 0,
      indexInPage: 0,
      ingestionOrdinal: 0,
      rawType,
      reportTimeMs: 1000,
    },
    ingestionOrdinal: 0,
    reportTimeMs: 1000,
    fightTimeMs: 0,
    rawType,
    source: { actorId: ACTOR, instance: null },
    target: null,
    sourceAbsence: null,
    targetAbsence: "NOT_SUPPLIED",
    abilityGameId: null,
    attachedResources: null,
    outsideRequestedRange: false,
    kind: "COMBATANT_INFO",
    snapshot: { actorId: ACTOR, specId: 577, gear: [], malformedGearRows: [], talentTree },
  } as unknown as CombatEvent;
  return createCombatState(syntheticFight({ events: [event] }));
}

function analyze(talentTree: readonly { id: number; rank: number; nodeId: number }[]) {
  return analyzeObservedHavocDemonHunterDecisions({
    state: fightWith(talentTree),
    actorId: ACTOR,
    specId: "demonhunter/havoc",
    targetActorId: null,
  });
}

describe("the validated-profile gate", () => {
  it("validates exactly one hero tree, and it is Aldrachi Reaver", () => {
    expect([...HAVOC_VALIDATED_HERO_TREES]).toEqual(["aldrachi_reaver"]);
    expect(havocValidatedProfile(ALDRACHI)).toEqual({ supported: true, heroTree: "aldrachi_reaver" });
  });

  it("Fel-Scarred fails closed as AUTHORITY_NOT_AVAILABLE, naming the tree and the validated one", () => {
    const profile = havocValidatedProfile(FELSCARRED);
    expect(profile.supported).toBe(false);
    if (profile.supported) return;
    expect(profile.status).toBe("AUTHORITY_NOT_AVAILABLE");
    expect(profile.detail).toContain("felscarred");
    expect(profile.detail).toContain("aldrachi_reaver");
    expect(profile.detail).toContain("no decision was judged");
    expect(PUBLIC_ANALYSIS_STATUSES as readonly string[]).toContain(profile.status);
  });

  it("an unresolved hero tree fails closed as PROFILE_NOT_RESOLVED, never read as the other tree", () => {
    const profile = havocValidatedProfile({ state: "UNKNOWN" } as HeroTreeResolution);
    expect(profile.supported).toBe(false);
    if (profile.supported) return;
    expect(profile.status).toBe("PROFILE_NOT_RESOLVED");
    expect(profile.detail).toContain("no hero sub-tree");
    expect(PUBLIC_ANALYSIS_STATUSES as readonly string[]).toContain(profile.status);
  });

  it("a contradictory hero tree fails closed as PROFILE_NOT_RESOLVED, naming both sub-trees", () => {
    const profile = havocValidatedProfile({ state: "CONTRADICTORY", subTreeIds: [34, 35] });
    expect(profile.supported).toBe(false);
    if (profile.supported) return;
    expect(profile.status).toBe("PROFILE_NOT_RESOLVED");
    expect(profile.detail).toContain("34");
    expect(profile.detail).toContain("35");
  });
});

describe("the gate on the facade, from the observed trait entries", () => {
  it("the pinned entries resolve the tree they belong to", () => {
    expect(resolveHavocHeroTree(entriesOf("felscarred"))).toMatchObject({
      state: "RESOLVED",
      simcName: "felscarred",
    });
    expect(resolveHavocHeroTree(entriesOf("aldrachi_reaver"))).toMatchObject({
      state: "RESOLVED",
      simcName: "aldrachi_reaver",
    });
  });

  it("a Fel-Scarred build is refused before any decision is read", () => {
    const analysis = analyze(entriesOf("felscarred"));
    expect(analysis.status).toBe("AUTHORITY_NOT_AVAILABLE");
    expect(Object.keys(analysis)).not.toContain("comparisons");
    expect(Object.keys(analysis)).not.toContain("coverage");
  });

  it("a build with entries in both trees is refused, not read as either", () => {
    const analysis = analyze([...entriesOf("felscarred"), ...entriesOf("aldrachi_reaver")]);
    expect(analysis.status).toBe("PROFILE_NOT_RESOLVED");
    expect(Object.keys(analysis)).not.toContain("comparisons");
  });

  it("a snapshot with no hero entry is refused: absence of a tree never selects one", () => {
    const analysis = analyze([]);
    expect(analysis.status).toBe("PROFILE_NOT_RESOLVED");
    expect(Object.keys(analysis)).not.toContain("comparisons");
  });

  it("an Aldrachi Reaver build passes the gate", () => {
    expect(analyze(entriesOf("aldrachi_reaver")).status).toBe("ANALYZED");
  });
});
