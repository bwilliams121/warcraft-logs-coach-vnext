/**
 * M11-C4j: the two guards promotion added to Brewmaster (owner decisions,
 * the Blood M11-B12 T2 / T3 precedents), and nothing else.
 *
 *   THE VALIDATED-PROFILE GATE   Brewmaster's public slice is validated
 *                                against Shado-Pan evidence. A Master of
 *                                Harmony build, a build with no hero tree, and
 *                                a build with entries in both fail closed — on
 *                                existing public statuses, with no decision
 *                                judged.
 *   THE ENERGY WIRE-VERSION KEY  Keg Smash's affordability reads the decision
 *                                cast's Energy through the shared
 *                                version-scoped resolver with the capture's
 *                                own keys. A foreign parser version fails the
 *                                affordability dimension closed — and only it.
 *
 * Neither guard may be satisfied by inference: the hero tree comes from the
 * observed trait entries, never from the actions cast; the wire type from the
 * capture's parser version, never from a constant.
 */

import { describe, expect, it } from "vitest";

import { PUBLIC_ANALYSIS_STATUSES } from "../../src/contracts/analysis-contract.js";
import { resolveBrewmasterHeroTree } from "../../src/data/game/monk-brewmaster-talents.js";
import type { HeroTreeResolution } from "../../src/data/game/talent-selection.js";
import { resourceWireTypeFor } from "../../src/data/wcl-wire/resource-types.js";
import type { CombatState } from "../../src/engine/state/combat-state.js";
import {
  analyzeObservedBrewmasterMonkDecisions,
  type BrewmasterMonkAnalysis,
} from "../../src/specs/monk/brewmaster/observed-analysis.js";
import { BREWMASTER_MONK_SPEC_ID } from "../../src/specs/monk/brewmaster/spec.js";
import {
  BREWMASTER_VALIDATED_HERO_TREES,
  brewmasterValidatedProfile,
} from "../../src/specs/monk/brewmaster/supported-profile.js";
import { committedEventArray } from "../support/corpus/artifacts.js";
import { corpusState } from "../support/corpus/fight.js";

const SUBJECT_1 = { artifactId: "wcl-brewmaster-monk-gtkb-opener", actor: 4 };
const SUBJECT_2 = { artifactId: "wcl-brewmaster-monk-rxaf-opener", actor: 11 };

const SHADO_PAN: HeroTreeResolution = {
  state: "RESOLVED",
  simcName: "shadopan",
  subTreeId: 65,
  decidedByEntryIds: [1],
};
const MASTER_OF_HARMONY: HeroTreeResolution = {
  state: "RESOLVED",
  simcName: "master_of_harmony",
  subTreeId: 66,
  decidedByEntryIds: [2],
};
const UNKNOWN_TREE: HeroTreeResolution = { state: "UNKNOWN" };
const CONTRADICTORY: HeroTreeResolution = { state: "CONTRADICTORY", subTreeIds: [65, 66] };

type Analyzed = Extract<BrewmasterMonkAnalysis, { status: "ANALYZED" }>;

function observedTalentsOf(subject: {
  artifactId: string;
  actor: number;
}): readonly { readonly id: number; readonly nodeId: number }[] {
  for (const event of committedEventArray(subject.artifactId)) {
    if (event.type !== "combatantinfo" || event.sourceID !== subject.actor) continue;
    const tree = (event as { talentTree?: readonly { id: number; nodeID: number }[] }).talentTree ?? [];
    return tree.map((entry) => ({ id: entry.id, nodeId: entry.nodeID }));
  }
  throw new Error(`no combatantinfo for actor ${String(subject.actor)} in ${subject.artifactId}`);
}

function analyze(state: CombatState, actorId: number): BrewmasterMonkAnalysis {
  return analyzeObservedBrewmasterMonkDecisions({
    state,
    actorId,
    specId: BREWMASTER_MONK_SPEC_ID,
    targetActorId: null,
  });
}

describe("the validated-profile gate", () => {
  it("validates exactly one hero tree, and it is Shado-Pan", () => {
    expect([...BREWMASTER_VALIDATED_HERO_TREES]).toEqual(["shadopan"]);
  });

  it("Shado-Pan is supported and carries the tree it resolved", () => {
    expect(brewmasterValidatedProfile(SHADO_PAN)).toEqual({ supported: true, heroTree: "shadopan" });
  });

  it("Master of Harmony fails closed as AUTHORITY_NOT_AVAILABLE, naming the tree and the validated one", () => {
    const profile = brewmasterValidatedProfile(MASTER_OF_HARMONY);
    expect(profile.supported).toBe(false);
    if (profile.supported) return;
    expect(profile.status).toBe("AUTHORITY_NOT_AVAILABLE");
    expect(profile.detail).toContain("master_of_harmony");
    expect(profile.detail).toContain("shadopan");
    expect(profile.detail).toContain("no decision was judged");
    expect(PUBLIC_ANALYSIS_STATUSES as readonly string[]).toContain(profile.status);
  });

  it("an unresolved hero tree fails closed as PROFILE_NOT_RESOLVED — never read as the other tree", () => {
    const profile = brewmasterValidatedProfile(UNKNOWN_TREE);
    expect(profile.supported).toBe(false);
    if (profile.supported) return;
    expect(profile.status).toBe("PROFILE_NOT_RESOLVED");
    expect(profile.detail).toContain("no hero sub-tree");
    expect(PUBLIC_ANALYSIS_STATUSES as readonly string[]).toContain(profile.status);
  });

  it("a contradictory hero tree fails closed as PROFILE_NOT_RESOLVED, naming both sub-trees", () => {
    const profile = brewmasterValidatedProfile(CONTRADICTORY);
    expect(profile.supported).toBe(false);
    if (profile.supported) return;
    expect(profile.status).toBe("PROFILE_NOT_RESOLVED");
    expect(profile.detail).toContain("65");
    expect(profile.detail).toContain("66");
  });
});

describe("the gate over the committed subjects", () => {
  it("both real subjects resolve Shado-Pan from their own trait entries and ANALYZE", () => {
    for (const subject of [SUBJECT_1, SUBJECT_2]) {
      const heroTree = resolveBrewmasterHeroTree(observedTalentsOf(subject));
      expect(heroTree, subject.artifactId).toMatchObject({ state: "RESOLVED", simcName: "shadopan" });
      expect(brewmasterValidatedProfile(heroTree).supported, subject.artifactId).toBe(true);
      expect(analyze(corpusState(subject.artifactId), subject.actor).status, subject.artifactId).toBe(
        "ANALYZED",
      );
    }
  });

  it("the analyzer still refuses a foreign specialization before any Brewmaster rule runs", () => {
    const analysis = analyzeObservedBrewmasterMonkDecisions({
      state: corpusState(SUBJECT_1.artifactId),
      actorId: SUBJECT_1.actor,
      specId: "deathknight/blood",
      targetActorId: null,
    });
    expect(analysis.status).toBe("SPEC_NOT_SUPPORTED");
  });
});

describe("the Energy wire-version key", () => {
  it("the captures' parser version is covered: Energy resolves through the shared resolver from each fight's own provenance", () => {
    for (const subject of [SUBJECT_1, SUBJECT_2]) {
      const { provenance } = corpusState(subject.artifactId).fight;
      const resolution = resourceWireTypeFor("ENERGY", {
        gameVersion: provenance.gameVersion,
        logVersion: provenance.logVersion,
      });
      expect(resolution.ok, subject.artifactId).toBe(true);
    }
  });

  it("a foreign parser version fails ONLY the affordability dimension closed: Keg Smash is never proven usable, and the 2,424,688 REJECTED becomes UNKNOWN", () => {
    const real = corpusState(SUBJECT_1.artifactId);
    // The same evidence, relabelled with a parser version no contract covers.
    const foreign = {
      ...real,
      fight: { ...real.fight, provenance: { ...real.fight.provenance, logVersion: 99 } },
    } as CombatState;
    const before = analyze(real, SUBJECT_1.actor) as Analyzed;
    const after = analyze(foreign, SUBJECT_1.actor);
    expect(after.status).toBe("ANALYZED");
    if (after.status !== "ANALYZED") return;

    const at = (analysis: Analyzed, reportTimeMs: number) =>
      analysis.comparisons.findIndex((comparison) => comparison.decision.reportTimeMs === reportTimeMs);
    const index = at(before, 2424688);
    expect(before.comparisons[index]?.outcome).toBe("REJECTED");
    expect(after.comparisons[index]?.outcome).toBe("UNKNOWN");

    for (const resolved of after.resolved) {
      const kegSmash = resolved.positiveUsability.find((entry) => entry.simcToken === "keg_smash");
      if (kegSmash === undefined) continue;
      expect(kegSmash.kind).toBe("NOT_PROVEN");
      expect(kegSmash.dimensions.RESOURCE_AFFORDABILITY).toMatchObject({
        state: "UNKNOWN",
        reason: "RESOURCE_WIRE_VERSION_NOT_COVERED",
      });
    }
    // Nothing else moved: every other decision keeps its outcome.
    for (const [position, comparison] of before.comparisons.entries()) {
      if (position === index) continue;
      expect(after.comparisons[position]?.outcome, String(comparison.decision.reportTimeMs)).toBe(
        comparison.outcome,
      );
    }
  });
});
