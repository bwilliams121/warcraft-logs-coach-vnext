/**
 * M10-C: the internal Protection Paladin evaluator.
 *
 * REAL-EVIDENCE cases run over the committed M10-B opener and its gap
 * derivation and pin exactly what the evaluator concludes there — which is
 * UNKNOWN for every eligible decision, blocked at the first entry whose
 * transition cannot be established. After correction 1 that entry is
 * `default[2] use_items` (the sub-action set cannot be closed from the gear
 * the log reports), no longer `default[1] use_item` (now NOT_APPLICABLE by
 * pinned identity). A HYPOTHESIS case closes the gear synthetically and shows
 * the next blocker, `default[8] shield_of_the_righteous`, which still refuses.
 * SYNTHETIC cases (labelled) exercise MATCH, REJECTED and the refusal paths
 * the real pull does not reach, over authorities and fights this file states
 * in full. No synthetic premise carries captured coverage.
 */

import { describe, expect, it } from "vitest";

import { corpusState } from "../support/corpus/fight.js";
import type { CombatState } from "../../src/engine/state/combat-state.js";
import {
  BLESSED_HAMMER,
  CONSECRATION,
  JUDGMENT,
  LIGHTSMITH_TREE,
  PROT_ACTOR,
  SHIELD_OF_THE_RIGHTEOUS,
  TEMPLAR_TREE,
  WORD_OF_GLORY,
  protCast,
  protCombatantInfo,
  protGear,
  protState,
  syntheticProtectionAuthority,
} from "../support/protection-paladin-fixture.js";
import type { AuthorityAccess, AuthorityDomain } from "../../src/findings/authority-domain.js";
import type { AplAuthority } from "../../src/simc/apl-authority.js";
import {
  analyzeObservedProtectionPaladinDecisions,
  PROTECTION_EXCLUSION_REASONS,
  type ProtectionPaladinAnalysis,
} from "../../src/specs/paladin/protection/observed-analysis.js";
import {
  PROTECTION_EXCLUSION_PUBLIC_PROJECTION,
  PROTECTION_PALADIN_REGISTRATION,
  protectionObservedDecisionView,
} from "../../src/specs/paladin/protection/registration.js";
import { standaloneProtectionAuthorityAccess } from "../../src/specs/paladin/protection/authority-bindings.js";
import { MATCH_MEANING } from "../../src/specs/paladin/protection/domains.js";
import { checkAnalysisOwnership } from "../../src/findings/analyzer-registration.js";
import { requirePublicSpecId } from "../../src/findings/spec-id.js";

const OPENER = "wcl-protection-paladin-a7r6-opener";
const GAP = "wcl-protection-paladin-a7r6-opener.gap-before-2010000";

function analyzed(analysis: ProtectionPaladinAnalysis) {
  if (analysis.status !== "ANALYZED") throw new Error(`expected ANALYZED, got ${analysis.status}`);
  return analysis;
}

/** An access object that resolves the offensive domain to a SYNTHETIC authority. */
function accessWith(authority: AplAuthority | null): AuthorityAccess {
  const real = standaloneProtectionAuthorityAccess();
  return {
    forDomain: (domain: AuthorityDomain) => {
      if (domain !== "OFFENSIVE_ROTATION") return real.forDomain(domain);
      const resolved = real.forDomain(domain);
      if (resolved.outcome !== "AUTHORITY_AVAILABLE") return resolved;
      if (authority === null) {
        return {
          outcome: "AUTHORITY_LOAD_FAILED",
          domain,
          binding: resolved.binding,
          reason: "SYNTHETIC_LOAD_FAILURE",
          detail: "the test asked for a failed load",
        };
      }
      return { ...resolved, authority };
    },
  };
}

const analyzeReal = (artifactId: string) =>
  analyzed(
    analyzeObservedProtectionPaladinDecisions({
      state: corpusState(artifactId),
      actorId: PROT_ACTOR,
      specId: "paladin/protection",
      targetActorId: null,
    }),
  );

describe("over the REAL M10-B opener", () => {
  const analysis = analyzeReal(OPENER);

  it("analyzes under the pinned authority with exact provenance", () => {
    expect(analysis.specId).toBe("paladin/protection");
    expect(analysis.authority).toMatchObject({
      authorityId: "SIMC_APL_PALADIN_PROTECTION",
      artifactRevision: "simc-33622e9d-1",
      commitSha: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
      sourcePath: "engine/class_modules/apl/apl_paladin.cpp",
      sourceSha256: "ed3fb1ac5b1c6c83bf21abbcaff5afe282678a69d51bdc953cc9897dca94bc02",
      className: "paladin",
      specName: "protection",
    });
  });

  it("classifies every one of the subject's 45 completed casts: 21 eligible, 24 excluded by a named reason", () => {
    expect(analysis.coverage.eligibleDecisions).toBe(21);
    expect(analysis.coverage.excludedCastCount).toBe(24);
    expect(analysis.coverage.exclusions).toEqual([
      { key: "MELEE_SWING", count: 11 },
      { key: "NON_GCD_ACTION", count: 11 },
      { key: "EXECUTION_LANE_NOT_ESTABLISHED", count: 1 },
      { key: "NO_AUTHORITY_TOKEN_BINDING", count: 1 },
    ]);
    // Shield of the Righteous is NON_GCD: every one of its seven casts is excluded, not judged.
    expect(
      analysis.excluded.filter((c) => c.abilityGameId === SHIELD_OF_THE_RIGHTEOUS).map((c) => c.reason),
    ).toEqual(Array(7).fill("NON_GCD_ACTION"));
    expect(analysis.excluded.find((c) => c.abilityGameId === 1297761)?.reason).toBe(
      "EXECUTION_LANE_NOT_ESTABLISHED",
    );
    expect(analysis.excluded.find((c) => c.abilityGameId === 204018)?.reason).toBe(
      "NO_AUTHORITY_TOKEN_BINDING",
    );
    expect(analysis.comparisons.map((c) => c.decision.observedToken)).toEqual([
      "judgment",
      "blessed_hammer",
      "blessed_hammer",
      "judgment",
      "judgment",
      "blessed_hammer",
      "blessed_hammer",
      "judgment",
      "blessed_hammer",
      "avengers_shield",
      "judgment",
      "blessed_hammer",
      "consecration",
      "judgment",
      "blessed_hammer",
      "judgment",
      "judgment",
      "avengers_shield",
      "consecration",
      "blessed_hammer",
      "blessed_hammer",
    ]);
  });

  it("resolves NO decision: every eligible one is UNKNOWN because the explored worlds select different first GCD entries", () => {
    // M10-C4: use_items (closed under the dated Warcraft Logs gear contract), potion, wings,
    // fireblood and Shield of the Righteous all transition. The scan then reaches the GCD
    // candidates whose readiness the window cannot establish — Divine Toll in the branch
    // where wings fired, Holy Armaments, Hammer of Wrath, Avenger's Shield, Judgment's
    // recharge — and the branches that assume each of them fires select different entries.
    expect(analysis.coverage).toMatchObject({
      match: 0,
      rejected: 0,
      unknown: 21,
      resolvedComparisons: 0,
      selectionPrecision: [{ key: "UNKNOWN", count: 21 }],
      unknownBases: [{ key: "AUTHORITY_SELECTION_UNRESOLVED", count: 21 }],
      unknownBlockerClasses: [{ key: "DIVERGENT_WORLDS", count: 21 }],
    });
    expect(analysis.resolved).toHaveLength(21);
    for (const [index, comparison] of analysis.comparisons.entries()) {
      expect(comparison.outcome).toBe("UNKNOWN");
      expect(comparison.rawBlocker).toBe("DIVERGENT_GCD_OUTCOMES");
      expect(comparison.authorityToken).toBeNull();
      expect(comparison.usabilityProvenance).toBe("OBSERVED_EXECUTION");
      expect(comparison.observedActionRejected).toBe(false);
      // The exact blocker is retained: the earliest entry the worlds disagree on.
      const selection = analysis.resolved[index]?.selection;
      expect(selection?.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
      expect(selection?.blockedAt).toBe("default[6] divine_toll");
      expect(selection?.detail).toBe(
        "supported worlds select different first GCD entries: SELECTED default[6] divine_toll and SELECTED default[9] holy_armaments",
      );
    }
  });

  it("neither use_item, use_items nor shield_of_the_righteous is the blocker any more: each earlier entry transitioned or was proven inapplicable", () => {
    for (const record of analysis.resolved) {
      expect(record.selection.blockedAt).not.toBe("default[1] use_item");
      expect(record.selection.blockedAt).not.toBe("default[2] use_items");
      expect(record.selection.blockedAt).not.toBe("default[8] shield_of_the_righteous");
      expect(record.selection.detail).not.toContain("TRANSITION_UNSUPPORTED");
    }
  });

  it("the later Sentinel press is never an oracle: the decision just before it is blocked exactly like the first", () => {
    // The subject presses Sentinel (389539) at 2026241, after every eligible decision. If
    // that observation leaked backwards, the wings overlay would apply and the blocker
    // would move. It does not: every decision, including the last one at 2025857, stops
    // at the same entry for the same reason as the first at 2005436.
    const first = analysis.resolved[0]?.selection;
    const last = analysis.resolved[analysis.resolved.length - 1]?.selection;
    expect(analysis.comparisons[analysis.comparisons.length - 1]?.decision.reportTimeMs).toBe(2025857);
    expect(last).toEqual(first);
  });

  it("records the Holy Power every foreground cast observed, and NO_OBSERVATION where the wire carried none", () => {
    const spender = analysis.holyPower.filter((h) => h.abilityGameId === SHIELD_OF_THE_RIGHTEOUS);
    expect(spender.map((h) => [h.reportTimeMs, h.observation])).toEqual([
      [2009098, { state: "EXACT_PRE_COST", amount: 4, max: 5, cost: 3 }],
      [2010926, { state: "EXACT_PRE_COST", amount: 3, max: 5, cost: 3 }],
      [2013247, { state: "EXACT_PRE_COST", amount: 3, max: 5, cost: 3 }],
      [2013772, { state: "NO_OBSERVATION", reason: "NO_OBSERVATION" }],
      [2016930, { state: "EXACT_PRE_COST", amount: 3, max: 5, cost: 3 }],
      [2019725, { state: "EXACT_PRE_COST", amount: 3, max: 5, cost: 3 }],
      [2025524, { state: "NO_OBSERVATION", reason: "NO_OBSERVATION" }],
    ]);
    // Every uncosted press: no entry, no value, never zero.
    for (const record of analysis.holyPower.filter((h) => h.abilityGameId !== SHIELD_OF_THE_RIGHTEOUS)) {
      expect(record.observation.state).toBe("NO_OBSERVATION");
    }
    // Melee swings are not foreground casts and record nothing.
    expect(analysis.holyPower.some((h) => h.abilityGameId === 1)).toBe(false);
    expect(analysis.holyPower).toHaveLength(34);
  });

  it("resolves the build once from the real tree", () => {
    expect(analysis.build.righteousProtector.selection).toBe("SELECTED");
    expect(analysis.build.sentinel.selection).toBe("SELECTED");
    expect(analysis.build.avengingWrath.selection).toBe("SELECTED");
    expect(analysis.build.blessedHammer.selection).toBe("SELECTED");
    expect(analysis.build.heroTree).toMatchObject({ state: "RESOLVED", simcName: "lightsmith" });
  });

  it("represents the six domains separately: one governed, five without authority, interrupts unverified", () => {
    expect(analysis.domains.map((d) => [d.domain, d.resolution])).toEqual([
      ["OFFENSIVE_ROTATION", "AUTHORITY_AVAILABLE"],
      ["RESOURCE_SPENDING", "NO_PINNED_AUTHORITY_FOR_DOMAIN"],
      ["ACTIVE_MITIGATION", "NO_PINNED_AUTHORITY_FOR_DOMAIN"],
      ["DEFENSIVE_COOLDOWN", "NO_PINNED_AUTHORITY_FOR_DOMAIN"],
      ["SELF_HEALING", "NO_PINNED_AUTHORITY_FOR_DOMAIN"],
      ["INTERRUPT", "NO_PINNED_AUTHORITY_FOR_DOMAIN"],
    ]);
    const offensive = analysis.domains[0];
    expect(offensive).toMatchObject({
      authorityId: "SIMC_APL_PALADIN_PROTECTION",
      matchMeaning: MATCH_MEANING,
    });
    for (const domain of analysis.domains.slice(1)) {
      expect("offensiveAuthorityGoverns" in domain && domain.offensiveAuthorityGoverns).toBe(false);
    }
    const interrupt = analysis.domains.find((d) => d.domain === "INTERRUPT");
    expect(interrupt).toMatchObject({ evidenceFamily: "UNVERIFIED" });
  });

  it("passes the registration's runtime ownership check and narrows to the public spec id (M10-D)", () => {
    expect(checkAnalysisOwnership(PROTECTION_PALADIN_REGISTRATION, analysis)).toEqual({ ok: true });
    // Until M10-D this threw InternalSpecExposureError; the id is public now.
    expect(requirePublicSpecId(analysis.specId)).toBe("paladin/protection");
  });

  it("the view adapter reconciles with the payload record for record", () => {
    const view = protectionObservedDecisionView(analysis);
    expect(view.decisions).toHaveLength(analysis.comparisons.length);
    expect(view.exclusions).toHaveLength(analysis.excluded.length);
    // The ONE transformation the view applies (M10-D): the internal reason is
    // projected onto the public vocabulary, record for record, and the payload
    // itself keeps MELEE_SWING.
    view.exclusions.forEach((record, index) => {
      const cast = analysis.excluded[index];
      if (cast === undefined) throw new Error("index");
      expect(record.position).toBe(cast.position);
      expect(record.reason).toBe(PROTECTION_EXCLUSION_PUBLIC_PROJECTION[cast.reason]);
    });
    expect(analysis.excluded.filter((cast) => cast.reason === "MELEE_SWING")).toHaveLength(11);
    expect(view.exclusions.some((record) => record.reason === "MELEE_SWING")).toBe(false);
    view.decisions.forEach((record, index) => {
      const comparison = analysis.comparisons[index];
      if (comparison === undefined) throw new Error("index");
      expect(record.position).toBe(comparison.decision.position);
      expect(record.observedToken).toBe(comparison.decision.observedToken);
      expect(record.outcome).toBe(comparison.outcome);
      expect(record.basis).toBe(comparison.basis);
      expect(record.decisiveBlocker).toBe(comparison.decisiveBlocker);
      expect("rawBlocker" in record).toBe(false);
      expect("observedActionRejected" in record).toBe(false);
    });
    expect(view.coverage).toEqual({
      eligibleDecisions: 21,
      match: 0,
      rejected: 0,
      unknown: 21,
      resolvedComparisons: 0,
      exactEntryMatches: 0,
      tokenConvergedMatches: 0,
      selectionPrecision: [{ key: "UNKNOWN", count: 21 }],
      unknownBases: [{ key: "AUTHORITY_SELECTION_UNRESOLVED", count: 21 }],
      unknownBlockerClasses: [{ key: "DIVERGENT_WORLDS", count: 21 }],
      // The tally is projected too: the 11 swings and the 11 NON_GCD presses
      // merge into one public row, and the total still equals the count.
      exclusions: [
        { key: "NON_GCD_ACTION", count: 22 },
        { key: "EXECUTION_LANE_NOT_ESTABLISHED", count: 1 },
        { key: "NO_AUTHORITY_TOKEN_BINDING", count: 1 },
      ],
      excludedCastCount: 24,
    });
    expect(view.coverage.exclusions.reduce((sum, row) => sum + row.count, 0)).toBe(
      view.coverage.excludedCastCount,
    );
    // The view is exactly the shared shape: no Paladin-only field rides along.
    expect(Object.keys(view).sort()).toEqual(["coverage", "decisions", "exclusions"]);
  });
});

describe("over the REAL gap derivation", () => {
  it("still evaluates, over fewer eligible decisions, with the same honest answer", () => {
    const analysis = analyzeReal(GAP);
    expect(analysis.coverage.eligibleDecisions).toBe(16);
    expect(analysis.coverage.unknown).toBe(16);
    expect(analysis.coverage.exclusions).toEqual([
      { key: "MELEE_SWING", count: 9 },
      { key: "NON_GCD_ACTION", count: 9 },
      { key: "EXECUTION_LANE_NOT_ESTABLISHED", count: 1 },
      { key: "NO_AUTHORITY_TOKEN_BINDING", count: 1 },
    ]);
    // The removed first Shield of the Righteous is gone, not zero.
    expect(analysis.holyPower.find((h) => h.reportTimeMs === 2009098)).toBeUndefined();
    expect(analysis.holyPower.filter((h) => h.abilityGameId === SHIELD_OF_THE_RIGHTEOUS)).toHaveLength(6);
  });
});

describe("refusals", () => {
  it("refuses another specialization before any Protection rule runs", () => {
    const result = analyzeObservedProtectionPaladinDecisions({
      state: corpusState(OPENER),
      actorId: PROT_ACTOR,
      specId: "rogue/assassination",
      targetActorId: null,
    });
    expect(result).toMatchObject({ status: "SPEC_NOT_SUPPORTED", specId: "rogue/assassination" });
  });

  it("reports AUTHORITY_NOT_AVAILABLE when the offensive authority fails to load", () => {
    const result = analyzeObservedProtectionPaladinDecisions({
      state: corpusState(OPENER),
      actorId: PROT_ACTOR,
      specId: "paladin/protection",
      targetActorId: null,
      authority: accessWith(null),
    });
    expect(result.status).toBe("AUTHORITY_NOT_AVAILABLE");
    // The detail is author-written and FIXED (M10-D): the internal resolution
    // outcome is not interpolated into a string that reaches the public wire.
    if (result.status === "AUTHORITY_NOT_AVAILABLE") {
      expect(result.detail).not.toContain("AUTHORITY_LOAD_FAILED");
      expect(result.detail).toBe(
        "The pinned SimulationCraft Protection Paladin authority artifact could not be resolved, so no offensive decision was evaluated.",
      );
    }
  });

  it("reports PROFILE_NOT_RESOLVED without a combatant profile for the actor", () => {
    const state = protState([protCast({ ordinal: 0, reportTimeMs: 2000, abilityGameId: JUDGMENT })]);
    const result = analyzeObservedProtectionPaladinDecisions({
      state,
      actorId: PROT_ACTOR,
      specId: "paladin/protection",
      targetActorId: null,
    });
    expect(result.status).toBe("PROFILE_NOT_RESOLVED");
  });
});

describe("HYPOTHESIS over the REAL opener: the gear identities UNKNOWN (not evidence)", () => {
  /**
   * Rewrites the subject's combatant snapshot so every identity the dated
   * contract read as KNOWN_NONE is instead UNKNOWN (present but null). This
   * is NOT what the log says — it is the shape a payload that carried null
   * values would normalise to — and it exists to prove the M10-C2/C3 path
   * still guards a genuinely unknown equipment: `use_items` refuses again.
   */
  function unknownGear(real: CombatState): CombatState {
    return new Proxy(real, {
      get(target, property, receiver) {
        if (property === "eventAt") {
          return (position: number) => {
            const event = target.eventAt(position);
            if (event === null || event.kind !== "COMBATANT_INFO" || event.snapshot.actorId !== PROT_ACTOR) {
              return event;
            }
            return {
              ...event,
              snapshot: {
                ...event.snapshot,
                gear: event.snapshot.gear.map((piece) => ({
                  ...piece,
                  permanentEnchant:
                    piece.permanentEnchant.state === "KNOWN_NONE"
                      ? ({ state: "UNKNOWN", reason: "NULL_VALUE" } as const)
                      : piece.permanentEnchant,
                  temporaryEnchant:
                    piece.temporaryEnchant.state === "KNOWN_NONE"
                      ? ({ state: "UNKNOWN", reason: "NULL_VALUE" } as const)
                      : piece.temporaryEnchant,
                  gems:
                    piece.gems.state === "KNOWN_NONE"
                      ? ({ state: "UNKNOWN", reason: "NULL_VALUE" } as const)
                      : piece.gems,
                })),
              },
            };
          };
        }
        const value: unknown = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }

  const analysis = analyzed(
    analyzeObservedProtectionPaladinDecisions({
      state: unknownGear(corpusState(OPENER)),
      actorId: PROT_ACTOR,
      specId: "paladin/protection",
      targetActorId: null,
    }),
  );

  it("with the identities UNKNOWN, use_items refuses again with the exact blocking candidates", () => {
    expect(analysis.coverage).toMatchObject({ match: 0, rejected: 0, unknown: 21, resolvedComparisons: 0 });
    for (const [index, comparison] of analysis.comparisons.entries()) {
      expect(comparison.rawBlocker).toBe("TRANSITION_UNSUPPORTED");
      const selection = analysis.resolved[index]?.selection;
      expect(selection?.blockedAt).toBe("default[2] use_items");
      expect(selection?.detail).toContain("the use_items sub-action set is not closed");
      expect(selection?.detail).toContain("permanentEnchant is UNKNOWN (NULL_VALUE)");
      expect(selection?.detail).toContain("are not observationally equivalent");
    }
  });
});

describe("SYNTHETIC authorities (no captured coverage; premises stated here)", () => {
  const info = (tree = LIGHTSMITH_TREE) =>
    protCombatantInfo({ ordinal: 0, reportTimeMs: 1000, talentTree: tree });
  const run = (lines: readonly string[], events: Parameters<typeof protState>[0], tree = LIGHTSMITH_TREE) =>
    analyzed(
      analyzeObservedProtectionPaladinDecisions({
        state: protState([info(tree), ...events]),
        actorId: PROT_ACTOR,
        specId: "paladin/protection",
        targetActorId: null,
        authority: accessWith(syntheticProtectionAuthority(lines)),
      }),
    );

  it("MATCH: the observed press is the exact entry the authority selects, across the auto_attack prefix worlds", () => {
    const analysis = run(
      ["auto_attack", "judgment", "blessed_hammer"],
      [protCast({ ordinal: 1, reportTimeMs: 2000, abilityGameId: JUDGMENT })],
    );
    const [comparison] = analysis.comparisons;
    expect(comparison).toMatchObject({
      outcome: "MATCH",
      basis: "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN",
      authorityCoverage: "EXACT_ENTRY",
      authorityToken: "judgment",
      selectionPrecision: "EXACT_ENTRY",
      decisiveBlocker: null,
      usabilityProvenance: "OBSERVED_EXECUTION",
    });
    expect(analysis.coverage).toMatchObject({ match: 1, exactEntryMatches: 1, resolvedComparisons: 1 });
    // And the match means exactly one thing.
    expect(analysis.domains[0]).toMatchObject({ matchMeaning: "AUTHORITY_COMPATIBLE_ONLY" });
  });

  it("MATCH under a declared-atom condition the resolver bound TRUE", () => {
    const analysis = run(
      ["judgment,if=talent.righteous_protector.enabled&hero_tree.lightsmith", "blessed_hammer"],
      [protCast({ ordinal: 1, reportTimeMs: 2000, abilityGameId: JUDGMENT })],
    );
    expect(analysis.comparisons[0]).toMatchObject({ outcome: "MATCH", authorityCoverage: "EXACT_ENTRY" });
  });

  it("REJECTED: every entry naming the observed action is gated FALSE by a resolved declared atom", () => {
    // Word of Glory's only line asks for Lightsmith; the tree is Templar.
    const analysis = run(
      ["word_of_glory,if=hero_tree.lightsmith", "judgment"],
      [protCast({ ordinal: 1, reportTimeMs: 2000, abilityGameId: WORD_OF_GLORY, targetActorId: PROT_ACTOR })],
      TEMPLAR_TREE,
    );
    const [comparison] = analysis.comparisons;
    expect(comparison).toMatchObject({
      outcome: "REJECTED",
      basis: "OBSERVED_ACTION_REJECTED_BY_AUTHORITY",
      observedActionRejected: true,
    });
    expect(analysis.coverage).toMatchObject({ rejected: 1, resolvedComparisons: 1 });
  });

  it("REJECTED does not depend on proving what else would fire: the same proof stands with an undecidable line above", () => {
    const analysis = run(
      ["blessed_hammer,if=consecration.up", "word_of_glory,if=hero_tree.lightsmith"],
      [protCast({ ordinal: 1, reportTimeMs: 2000, abilityGameId: WORD_OF_GLORY, targetActorId: PROT_ACTOR })],
      TEMPLAR_TREE,
    );
    expect(analysis.comparisons[0]).toMatchObject({
      outcome: "REJECTED",
      basis: "OBSERVED_ACTION_REJECTED_BY_AUTHORITY",
    });
  });

  it("UNKNOWN, not REJECTED: an unresolved earlier entry could have been selected", () => {
    // `consecration.up` is declared but never bound, so line 0 is enumerated
    // and its usability is unknown: it MIGHT fire. Judgment's own line is
    // unconditional, so nothing proves the observed action unselectable.
    const analysis = run(
      ["blessed_hammer,if=consecration.up", "judgment"],
      [protCast({ ordinal: 1, reportTimeMs: 2000, abilityGameId: JUDGMENT })],
    );
    // The engine explores both worlds for the undecided GCD entry — it fires,
    // it does not — and they select different first GCDs. The divergence is
    // reported, never resolved in Judgment's favour.
    expect(analysis.comparisons[0]).toMatchObject({
      outcome: "UNKNOWN",
      basis: "AUTHORITY_SELECTION_UNRESOLVED",
      decisiveBlocker: "DIVERGENT_WORLDS",
      rawBlocker: "DIVERGENT_GCD_OUTCOMES",
      observedActionRejected: false,
    });
  });

  it("UNKNOWN: an unsupported identifier the vocabulary does not declare refuses the whole line", () => {
    const analysis = run(
      ["blessed_hammer,if=buff.x.stack>2&spell_targets.consecration>1", "judgment"],
      [protCast({ ordinal: 1, reportTimeMs: 2000, abilityGameId: JUDGMENT })],
    );
    expect(analysis.comparisons[0]).toMatchObject({
      outcome: "UNKNOWN",
      basis: "AUTHORITY_SELECTION_UNRESOLVED",
      decisiveBlocker: "TARGET_COUNT",
    });
    expect(analysis.comparisons[0]?.rawBlocker).toContain("UNSUPPORTED_AUTHORITY_EXPRESSION");
  });

  it("UNKNOWN: a target-dependent entry above the observed press prevents rejection", () => {
    const analysis = run(
      ["blessed_hammer,cycle_targets=1,if=debuff.judgment.up", "judgment"],
      [protCast({ ordinal: 1, reportTimeMs: 2000, abilityGameId: JUDGMENT })],
    );
    expect(analysis.comparisons[0]).toMatchObject({
      outcome: "UNKNOWN",
      decisiveBlocker: "TARGETING_NOT_MODELLED",
    });
  });

  it("UNKNOWN: a competing entry proven usable by nothing blocks a confident selection", () => {
    // Consecration's line is unconditional and its usability unknown; it
    // MIGHT fire above Judgment, and nothing here proves otherwise.
    const analysis = run(
      ["consecration", "judgment"],
      [protCast({ ordinal: 1, reportTimeMs: 2000, abilityGameId: JUDGMENT })],
    );
    expect(analysis.comparisons[0]).toMatchObject({
      outcome: "UNKNOWN",
      decisiveBlocker: "DIVERGENT_WORLDS",
      rawBlocker: "DIVERGENT_GCD_OUTCOMES",
    });
  });

  it("a Shield of the Righteous press with EXACT Holy Power is still a NON_GCD exclusion, and its observation is recorded", () => {
    const analysis = run(
      ["auto_attack", "shield_of_the_righteous", "judgment"],
      [
        protCast({
          ordinal: 1,
          reportTimeMs: 2000,
          abilityGameId: SHIELD_OF_THE_RIGHTEOUS,
          targetActorId: null,
          holyPower: { amount: 4, max: 5, cost: 3 },
        }),
        protCast({
          ordinal: 2,
          reportTimeMs: 2500,
          abilityGameId: SHIELD_OF_THE_RIGHTEOUS,
          targetActorId: null,
        }),
      ],
    );
    expect(analysis.coverage.eligibleDecisions).toBe(0);
    expect(analysis.coverage.exclusions).toEqual([{ key: "NON_GCD_ACTION", count: 2 }]);
    expect(analysis.holyPower.map((h) => h.observation)).toEqual([
      { state: "EXACT_PRE_COST", amount: 4, max: 5, cost: 3 },
      { state: "NO_OBSERVATION", reason: "NO_OBSERVATION" },
    ]);
  });

  it("a NON_GCD entry whose transition cannot be established refuses its branch: use_items over UNKNOWN gear identities", () => {
    // The synthetic equipment wears the on-use trinket with a present-but-null enchant:
    // the sub-action set cannot be closed and the entry has no admissible contract.
    const analysis = analyzed(
      analyzeObservedProtectionPaladinDecisions({
        state: protState([
          protCombatantInfo({
            ordinal: 0,
            reportTimeMs: 1000,
            talentTree: LIGHTSMITH_TREE,
            gear: [protGear(12, 270_175, { permanentEnchantId: "UNKNOWN" })],
          }),
          protCast({ ordinal: 1, reportTimeMs: 2000, abilityGameId: JUDGMENT }),
        ]),
        actorId: PROT_ACTOR,
        specId: "paladin/protection",
        targetActorId: null,
        authority: accessWith(syntheticProtectionAuthority(["use_items", "judgment"])),
      }),
    );
    expect(analysis.comparisons[0]).toMatchObject({ outcome: "UNKNOWN", decisiveBlocker: "OTHER" });
    expect(analysis.comparisons[0]?.rawBlocker).toBe("TRANSITION_UNSUPPORTED");
    expect(analysis.resolved[0]?.selection.detail).toContain("permanentEnchant is UNKNOWN (NULL_VALUE)");
    // The same equipment with the key OMITTED closes under the dated contract, and the decision resolves.
    const closed = analyzed(
      analyzeObservedProtectionPaladinDecisions({
        state: protState([
          protCombatantInfo({
            ordinal: 0,
            reportTimeMs: 1000,
            talentTree: LIGHTSMITH_TREE,
            gear: [protGear(12, 270_175)],
          }),
          protCast({ ordinal: 1, reportTimeMs: 2000, abilityGameId: JUDGMENT }),
        ]),
        actorId: PROT_ACTOR,
        specId: "paladin/protection",
        targetActorId: null,
        authority: accessWith(syntheticProtectionAuthority(["use_items", "judgment"])),
      }),
    );
    expect(closed.comparisons[0]).toMatchObject({ outcome: "MATCH", authorityToken: "judgment" });
  });

  it("shield_of_the_righteous transitions in both worlds and a following unconditional press resolves", () => {
    // SYNTHETIC: the spender above the observed press. Its usability is UNKNOWN (no Holy
    // Power is bound), so the scan explores both the fired and the not-fired branch; every
    // atom it may change is unbound, and both branches select the same next entry.
    const analysis = run(
      ["shield_of_the_righteous", "judgment"],
      [protCast({ ordinal: 1, reportTimeMs: 2000, abilityGameId: JUDGMENT })],
    );
    expect(analysis.comparisons[0]).toMatchObject({ outcome: "MATCH", authorityToken: "judgment" });
    // Divergent worlds stay UNKNOWN: an entry whose condition is unbound between the spender
    // and the press makes the branches disagree.
    const divergent = run(
      ["shield_of_the_righteous", "blessed_hammer,if=buff.blessed_assurance.up", "judgment"],
      [protCast({ ordinal: 1, reportTimeMs: 2000, abilityGameId: JUDGMENT })],
    );
    expect(divergent.comparisons[0]).toMatchObject({
      outcome: "UNKNOWN",
      decisiveBlocker: "DIVERGENT_WORLDS",
    });
  });

  it("the exclusion vocabulary is exactly the four named reasons", () => {
    expect([...PROTECTION_EXCLUSION_REASONS]).toEqual([
      "MELEE_SWING",
      "NON_GCD_ACTION",
      "EXECUTION_LANE_NOT_ESTABLISHED",
      "NO_AUTHORITY_TOKEN_BINDING",
    ]);
    const analysis = run(
      ["judgment"],
      [
        protCast({ ordinal: 1, reportTimeMs: 2000, abilityGameId: 1, melee: true }),
        protCast({ ordinal: 2, reportTimeMs: 2100, abilityGameId: CONSECRATION }),
        protCast({ ordinal: 3, reportTimeMs: 2200, abilityGameId: BLESSED_HAMMER }),
      ],
    );
    // Consecration and Blessed Hammer are GCD actions with tokens; with a
    // one-line synthetic authority they are eligible and UNKNOWN, never dropped.
    expect(analysis.coverage.eligibleDecisions).toBe(2);
    expect(analysis.coverage.exclusions).toEqual([{ key: "MELEE_SWING", count: 1 }]);
  });
});
