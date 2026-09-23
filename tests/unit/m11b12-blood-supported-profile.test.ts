/**
 * M11-B12: the two gates promotion added, and nothing else.
 *
 *   THE VALIDATED-PROFILE GATE   Blood's public slice is validated against
 *                                San'layn evidence. A Deathbringer build, a
 *                                build with no hero tree, and a build with
 *                                entries in both fail closed — on existing
 *                                public statuses, with no decision judged.
 *   THE WIRE-VERSION GUARD       Runes and Runic Power resolve through the
 *                                shared version-scoped resolver with the
 *                                capture's own keys. A foreign gameVersion or
 *                                logVersion fails closed rather than reading
 *                                the numbers out of a field this log does not
 *                                use that way.
 *
 * Negative first: neither gate may be satisfied by inference. The hero tree
 * comes from the observed trait entries and never from the actions cast; the
 * wire types come from the capture's parser version and never from a constant.
 * Both refusals are statuses this schema already had — no new public enum.
 */

import { describe, expect, it } from "vitest";

import { PUBLIC_ANALYSIS_STATUSES } from "../../src/contracts/analysis-contract.js";
import { resolveBloodHeroTree } from "../../src/data/game/deathknight-blood-talents.js";
import type { HeroTreeResolution } from "../../src/data/game/talent-selection.js";
import { bloodResourceWireTypes, bloodWireKeys } from "../../src/specs/deathknight/blood/resources.js";
import {
  BLOOD_VALIDATED_HERO_TREES,
  bloodValidatedProfile,
} from "../../src/specs/deathknight/blood/supported-profile.js";
import { analyzeObservedBloodDeathKnightDecisions } from "../../src/specs/deathknight/blood/observed-analysis.js";
import { BLOOD_DEATH_KNIGHT_SPEC_ID } from "../../src/specs/deathknight/blood/spec.js";
import { corpusState } from "../support/corpus/fight.js";
import { committedEventArray } from "../support/corpus/artifacts.js";

const ACTOR = 14;
const BLOOD45 = "wcl-blood-death-knight-a7r6-rotational-45s";
const OPENER = "wcl-blood-death-knight-gtkb-opener";

const SANLAYN: HeroTreeResolution = {
  state: "RESOLVED",
  simcName: "sanlayn",
  subTreeId: 31,
  decidedByEntryIds: [117630],
};
const DEATHBRINGER: HeroTreeResolution = {
  state: "RESOLVED",
  simcName: "deathbringer",
  subTreeId: 33,
  decidedByEntryIds: [117620],
};
const UNKNOWN_TREE: HeroTreeResolution = { state: "UNKNOWN" };
const CONTRADICTORY: HeroTreeResolution = { state: "CONTRADICTORY", subTreeIds: [31, 33] };

/** The subject's combatantinfo talent entries, as the committed artifact carries them. */
function observedTalentsOf(artifactId: string): readonly { readonly id: number; readonly nodeId: number }[] {
  for (const event of committedEventArray(artifactId)) {
    if (event.type !== "combatantinfo" || event.sourceID !== ACTOR) continue;
    const tree = (event as { talentTree?: readonly { id: number; nodeID: number }[] }).talentTree ?? [];
    return tree.map((entry) => ({ id: entry.id, nodeId: entry.nodeID }));
  }
  throw new Error(`no combatantinfo for actor ${String(ACTOR)} in ${artifactId}`);
}

describe("the validated-profile gate", () => {
  it("validates exactly one hero tree, and it is San'layn", () => {
    expect([...BLOOD_VALIDATED_HERO_TREES]).toEqual(["sanlayn"]);
  });

  it("San'layn is supported and carries the tree it resolved", () => {
    expect(bloodValidatedProfile(SANLAYN)).toEqual({ supported: true, heroTree: "sanlayn" });
  });

  it("Deathbringer fails closed as AUTHORITY_NOT_AVAILABLE, naming the tree and the validated one", () => {
    const profile = bloodValidatedProfile(DEATHBRINGER);
    expect(profile.supported).toBe(false);
    if (profile.supported) return;
    expect(profile.status).toBe("AUTHORITY_NOT_AVAILABLE");
    expect(profile.detail).toContain("deathbringer");
    expect(profile.detail).toContain("sanlayn");
    expect(profile.detail).toContain("no decision was judged");
    // The refusal is an existing public status, not a new one.
    expect(PUBLIC_ANALYSIS_STATUSES as readonly string[]).toContain(profile.status);
  });

  it("an unresolved hero tree fails closed as PROFILE_NOT_RESOLVED", () => {
    const profile = bloodValidatedProfile(UNKNOWN_TREE);
    expect(profile.supported).toBe(false);
    if (profile.supported) return;
    expect(profile.status).toBe("PROFILE_NOT_RESOLVED");
    expect(profile.detail).toContain("no hero sub-tree");
    expect(PUBLIC_ANALYSIS_STATUSES as readonly string[]).toContain(profile.status);
  });

  it("a contradictory hero tree fails closed as PROFILE_NOT_RESOLVED, naming both sub-trees", () => {
    const profile = bloodValidatedProfile(CONTRADICTORY);
    expect(profile.supported).toBe(false);
    if (profile.supported) return;
    expect(profile.status).toBe("PROFILE_NOT_RESOLVED");
    expect(profile.detail).toContain("31");
    expect(profile.detail).toContain("33");
  });

  it("reads the resolution and nothing else: no cast, aura or corpus fact can move it", () => {
    // The same four resolutions decide the same way whatever else is true,
    // because the function takes only the resolution.
    for (const [tree, supported] of [
      [SANLAYN, true],
      [DEATHBRINGER, false],
      [UNKNOWN_TREE, false],
      [CONTRADICTORY, false],
    ] as const) {
      expect(bloodValidatedProfile(tree).supported, tree.state).toBe(supported);
    }
  });
});

describe("the gate over the committed subjects", () => {
  it("both real subjects resolve San'layn from their own trait entries and ANALYZE", () => {
    for (const artifactId of [BLOOD45, OPENER]) {
      const heroTree = resolveBloodHeroTree(observedTalentsOf(artifactId));
      expect(heroTree, artifactId).toMatchObject({ state: "RESOLVED", simcName: "sanlayn" });
      expect(bloodValidatedProfile(heroTree).supported, artifactId).toBe(true);
    }
    const analysis = analyzeObservedBloodDeathKnightDecisions({
      state: corpusState(BLOOD45),
      actorId: ACTOR,
      specId: BLOOD_DEATH_KNIGHT_SPEC_ID,
      targetActorId: null,
    });
    expect(analysis.status).toBe("ANALYZED");
  });

  it("the analyzer refuses a foreign actor before any Blood rule runs (unchanged by promotion)", () => {
    const analysis = analyzeObservedBloodDeathKnightDecisions({
      state: corpusState(BLOOD45),
      actorId: ACTOR,
      specId: "paladin/protection",
      targetActorId: null,
    });
    expect(analysis.status).toBe("SPEC_NOT_SUPPORTED");
  });
});

describe("the wire-version guard", () => {
  const KEYS = { gameVersion: 1, logVersion: 17 };

  it("resolves both resources for the captures' parser version", () => {
    const wire = bloodResourceWireTypes(KEYS);
    expect(wire.ok).toBe(true);
    if (!wire.ok) return;
    // The two numbers the pinned contracts carry, and the only sanctioned
    // way to obtain them: Runes 5, Runic Power 6 (M11-B2 corroboration).
    expect(wire.runes).toBe(5);
    expect(wire.runicPower).toBe(6);
  });

  it("reads the keys from the fight's own provenance, never from a constant", () => {
    for (const artifactId of [BLOOD45, OPENER]) {
      const state = corpusState(artifactId);
      expect(bloodWireKeys(state), artifactId).toEqual({
        gameVersion: state.fight.provenance.gameVersion,
        logVersion: state.fight.provenance.logVersion,
      });
      expect(bloodResourceWireTypes(bloodWireKeys(state)).ok, artifactId).toBe(true);
    }
  });

  it.each([
    ["a foreign logVersion", { gameVersion: 1, logVersion: 18 }],
    ["an older logVersion", { gameVersion: 1, logVersion: 16 }],
    ["a foreign gameVersion", { gameVersion: 2, logVersion: 17 }],
    ["an absent gameVersion", { gameVersion: null, logVersion: 17 }],
  ])("%s fails closed, naming the resource and the version, never a wire type", (_label, keys) => {
    const wire = bloodResourceWireTypes(keys);
    expect(wire.ok).toBe(false);
    if (wire.ok) return;
    expect(wire.reason).toContain("RUNES");
    expect(wire.reason).toContain("gameVersion/logVersion");
    expect(JSON.stringify(wire)).not.toMatch(/"runes"|"runicPower"/);
  });

  it("a fight whose parser version is not the pinned one is INSUFFICIENT_EVIDENCE, with no decisions", () => {
    const real = corpusState(BLOOD45);
    // The same evidence, relabelled with a parser version no contract covers.
    const foreign = {
      ...real,
      fight: {
        ...real.fight,
        provenance: { ...real.fight.provenance, logVersion: 99 },
      },
    } as typeof real;
    const analysis = analyzeObservedBloodDeathKnightDecisions({
      state: foreign,
      actorId: ACTOR,
      specId: BLOOD_DEATH_KNIGHT_SPEC_ID,
      targetActorId: null,
    });
    expect(analysis.status).toBe("INSUFFICIENT_EVIDENCE");
    if (analysis.status === "ANALYZED") return;
    expect(analysis.detail).toContain("Runes and Runic Power");
    expect(analysis.detail).toContain("gameVersion/logVersion");
    expect(PUBLIC_ANALYSIS_STATUSES as readonly string[]).toContain(analysis.status);
    // No fabricated resource evidence: the refusal carries no analysis at all.
    expect(JSON.stringify(analysis)).not.toContain("EXACT_PRE_COST");
  });
});
