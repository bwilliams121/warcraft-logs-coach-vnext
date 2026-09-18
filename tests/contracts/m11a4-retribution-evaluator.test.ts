/**
 * M11-A4: the Retribution Paladin evaluator over the committed evidence,
 * through the registration, and its fail-closed edges.
 *
 * What is pinned here and not in the corpus: the nested unselectability
 * proof's refusals (an unmodelled dispatch, an unconditional entry, a
 * condition not proven false, an unknown applicability), the exclusion
 * projection, the population partition, and — the invariance A4 must keep —
 * that the Protection Paladin analyzer's committed outcomes over its own
 * evidence are unchanged by the third registration.
 */

import { describe, expect, it } from "vitest";

import { WCL_GEAR_UI_SEMANTICS_REVISION } from "../../src/engine/normalization/normalized-events.js";
import { loadAplAuthority } from "../../src/simc/apl-authority.js";
import { unknownNumber, type AtomBindings } from "../../src/simc/expression/evaluate.js";
import type { ProtectionPaladinAnalysis } from "../../src/specs/paladin/protection/observed-analysis.js";
import { PROTECTION_PALADIN_REGISTRATION } from "../../src/specs/paladin/protection/registration.js";
import type { RetributionBuildFacts } from "../../src/specs/paladin/retribution/action-profile.js";
import { proveObservedActionUnselectable } from "../../src/specs/paladin/retribution/observed-action-gate.js";
import {
  analyzeObservedRetributionPaladinDecisions,
  FIRST_SLICE_TOKENS,
  RETRIBUTION_EXCLUSION_REASONS,
} from "../../src/specs/paladin/retribution/observed-analysis.js";
import { pinnedRetributionPaladinAuthority } from "../../src/specs/paladin/retribution/pinned-authority.js";
import {
  projectRetributionExclusionTally,
  RETRIBUTION_EXCLUSION_VIEW_PROJECTION,
  RETRIBUTION_PALADIN_REGISTRATION,
  retributionObservedDecisionView,
} from "../../src/specs/paladin/retribution/registration.js";
import { RETRIBUTION_ATOM_VOCABULARY } from "../../src/specs/paladin/retribution/vocabulary.js";
import { corpusBundleState, corpusState } from "../support/corpus/fight.js";

const RET45 = "wcl-retribution-paladin-a7r6-rotational-45s";
const RET_BUNDLE = [
  RET45,
  "wcl-retribution-paladin-a7r6-rotational-165s.seg-45-105",
  "wcl-retribution-paladin-a7r6-rotational-165s.seg-105-165",
];
const PROT_BUNDLE = [
  "wcl-protection-paladin-a7r6-rotational-45s",
  "wcl-protection-paladin-a7r6-rotational-165s.seg-45-60",
  "wcl-protection-paladin-a7r6-rotational-165s.seg-60-90",
  "wcl-protection-paladin-a7r6-rotational-165s.seg-90-120",
  "wcl-protection-paladin-a7r6-rotational-165s.seg-120-165",
];
const RET = 6;
const TANK = 7;

function analyzed() {
  const analysis = RETRIBUTION_PALADIN_REGISTRATION.analyze({
    state: corpusBundleState(RET_BUNDLE, []),
    actorId: RET,
    specId: "paladin/retribution",
    targetActorId: null,
  });
  if (analysis.status !== "ANALYZED") throw new Error(`not analyzed: ${analysis.status}`);
  return analysis as Extract<
    ReturnType<typeof analyzeObservedRetributionPaladinDecisions>,
    { status: "ANALYZED" }
  >;
}

describe("the real subject through the registration", () => {
  it("partitions 69 spender decisions into 1 MATCH, 10 REJECTED and 58 UNKNOWN, and excludes 167 casts by name", () => {
    const analysis = analyzed();
    expect(analysis.coverage).toMatchObject({
      eligibleDecisions: 69,
      match: 1,
      rejected: 10,
      unknown: 58,
      resolvedComparisons: 11,
      exactEntryMatches: 1,
      excludedCastCount: 167,
    });
    expect(analysis.coverage.exclusions).toEqual([
      { key: "MELEE_SWING", count: 1 },
      { key: "NON_GCD_ACTION", count: 112 },
      { key: "OUTSIDE_FIRST_SLICE", count: 54 },
    ]);
    // Every eligible decision is a spender; every other in-domain GCD press is observed, not judged.
    for (const comparison of analysis.comparisons) {
      expect(FIRST_SLICE_TOKENS as readonly string[]).toContain(comparison.decision.observedToken);
    }
    expect(analysis.comparisons.length + analysis.excluded.length).toBe(
      analysis.holyPower.length + analysis.excluded.filter((cast) => cast.reason === "MELEE_SWING").length,
    );
  });

  it("the MATCH and every REJECTED rest on the two proofs, and no UNKNOWN is blocker-less", () => {
    const analysis = analyzed();
    const match = analysis.comparisons.filter((comparison) => comparison.outcome === "MATCH");
    expect(
      match.map((comparison) => [
        comparison.decision.reportTimeMs,
        comparison.authorityToken,
        comparison.selectionPrecision,
      ]),
    ).toEqual([[2108996, "templars_verdict", "EXACT_ENTRY"]]);
    const rejected = analysis.comparisons.filter((comparison) => comparison.outcome === "REJECTED");
    expect(rejected).toHaveLength(10);
    for (const comparison of rejected) {
      expect(comparison.decision.observedToken).toBe("divine_storm");
      expect(comparison.basis).toBe("OBSERVED_ACTION_REJECTED_BY_AUTHORITY");
      const resolved = analysis.resolved.find((entry) => entry.position === comparison.decision.position);
      expect(resolved?.unselectability.proven).toBe(true);
      expect(resolved?.diagnostics.dsCastable).toEqual({ state: "BOUND", value: false });
    }
    for (const comparison of analysis.comparisons.filter((entry) => entry.outcome === "UNKNOWN")) {
      const resolved = analysis.resolved.find((entry) => entry.position === comparison.decision.position);
      expect(resolved?.selection.blockedAt).not.toBeNull();
      expect(resolved?.selection.rootScanBlockedAt).not.toBeNull();
      expect(comparison.basis).toBe("AUTHORITY_SELECTION_UNRESOLVED");
    }
  });

  it("never binds a positive stack, never a wings identity under an unknown Radiant Glory, and reads Holy Power only from the wire", () => {
    const analysis = analyzed();
    for (const resolved of analysis.resolved) {
      for (const stack of resolved.stacks)
        if (stack.state === "BOUND_ZERO")
          expect(stack.proof).toMatch(/^(PROVEN_INACTIVE|TALENT_NOT_SELECTED)$/);
      const wings = resolved.auras.find((aura) => aura.atomName === "avenging_wrath");
      expect(wings?.state).toBe("UNBOUND");
    }
    const observed = analysis.holyPower.filter((entry) => entry.observation.state === "EXACT_PRE_COST");
    const free = analysis.holyPower.filter(
      (entry) =>
        entry.observation.state === "NO_OBSERVATION" &&
        (entry.abilityGameId === 383328 || entry.abilityGameId === 53385),
    );
    expect(observed.length).toBeGreaterThan(0);
    expect(free.length).toBeGreaterThan(0);
    for (const entry of observed) {
      if (entry.observation.state !== "EXACT_PRE_COST") continue;
      expect(entry.observation.amount).toBeGreaterThanOrEqual(3);
      expect(entry.observation.amount).toBeLessThanOrEqual(5);
    }
  });

  it("the view projects MELEE_SWING onto NON_GCD_ACTION and carries OUTSIDE_FIRST_SLICE verbatim, reconciling the excluded count", () => {
    const analysis = analyzed();
    const view = retributionObservedDecisionView(analysis);
    expect(view.coverage.exclusions).toEqual([
      { key: "NON_GCD_ACTION", count: 113 },
      { key: "OUTSIDE_FIRST_SLICE", count: 54 },
    ]);
    expect(view.coverage.exclusions.reduce((sum, row) => sum + row.count, 0)).toBe(
      view.coverage.excludedCastCount,
    );
    expect(view.decisions).toHaveLength(69);
    expect(Object.keys(RETRIBUTION_EXCLUSION_VIEW_PROJECTION).sort()).toEqual(
      [...RETRIBUTION_EXCLUSION_REASONS].sort(),
    );
    expect(
      projectRetributionExclusionTally([
        { key: "MELEE_SWING", count: 2 },
        { key: "NON_GCD_ACTION", count: 3 },
      ]),
    ).toEqual([{ key: "NON_GCD_ACTION", count: 5 }]);
  });

  it("refuses another specialization at the spec gate and a segment without a profile", () => {
    expect(
      analyzeObservedRetributionPaladinDecisions({
        state: corpusState(RET45),
        actorId: RET,
        specId: "paladin/protection",
        targetActorId: null,
      }).status,
    ).toBe("SPEC_NOT_SUPPORTED");
    expect(
      analyzeObservedRetributionPaladinDecisions({
        state: corpusState("wcl-retribution-paladin-a7r6-rotational-165s.seg-105-165"),
        actorId: RET,
        specId: "paladin/retribution",
        targetActorId: null,
      }).status,
    ).toBe("PROFILE_NOT_RESOLVED");
  });
});

describe("the nested unselectability proof", () => {
  const BINDINGS: AtomBindings = {
    comboPoints: unknownNumber("STATE_NOT_MODELLED"),
    comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
    energyPct: unknownNumber("STATE_NOT_MODELLED"),
    knownBuffs: [],
    specAtoms: {
      vocabulary: RETRIBUTION_ATOM_VOCABULARY,
      bound: [{ key: "variable.ds_castable", actionToken: null, value: { kind: "TRUTH", value: false } }],
    },
  };
  const FACTS: RetributionBuildFacts = {
    talents: {
      divine_storm: {
        simcName: "divine_storm",
        selection: "SELECTED",
        reason: "OWN_ENTRY_SELECTED",
        identity: null,
        decidedByEntryId: 1,
      },
    },
    heroTree: { state: "RESOLVED", simcName: "herald_of_the_sun", subTreeId: 50, decidedByEntryIds: [1] },
    wornGear: [],
    observedCastAbilityIds: new Set(),
  };

  it("proves divine_storm unselectable across every list when its one entry is gated FALSE, and never templars_verdict", () => {
    const loaded = pinnedRetributionPaladinAuthority();
    if (!loaded.ok) throw new Error("authority");
    const storm = proveObservedActionUnselectable({
      authority: loaded.authority,
      observedToken: "divine_storm",
      bindings: BINDINGS,
      buildFacts: FACTS,
    });
    expect(storm.proven).toBe(true);
    if (storm.proven)
      expect(storm.proof.entriesProvenFalse).toEqual([{ listName: "finishers", priorityOrdinal: 2 }]);
    // Templar's Verdict: with no pinned two-hander in the gear its applicability is
    // UNKNOWN (refused as such); with one worn, its unconditional entry refuses.
    const verdict = proveObservedActionUnselectable({
      authority: loaded.authority,
      observedToken: "templars_verdict",
      bindings: BINDINGS,
      buildFacts: FACTS,
    });
    expect(verdict).toMatchObject({
      proven: false,
      refusal: "APPLICABILITY_UNKNOWN",
      at: { listName: "finishers", priorityOrdinal: 3 },
    });
    const twoHander: RetributionBuildFacts = {
      ...FACTS,
      wornGear: [
        {
          slotIndex: 15,
          itemId: 251230,
          itemLevel: 700,
          quality: 4,
          permanentEnchant: { state: "KNOWN_NONE" as const, contract: WCL_GEAR_UI_SEMANTICS_REVISION },
          temporaryEnchant: { state: "KNOWN_NONE" as const, contract: WCL_GEAR_UI_SEMANTICS_REVISION },
          gems: { state: "KNOWN_NONE" as const, contract: WCL_GEAR_UI_SEMANTICS_REVISION },
          bonusIds: null,
          setId: null,
        },
      ],
    };
    const wornVerdict = proveObservedActionUnselectable({
      authority: loaded.authority,
      observedToken: "templars_verdict",
      bindings: BINDINGS,
      buildFacts: twoHander,
    });
    expect(wornVerdict).toMatchObject({
      proven: false,
      refusal: "UNCONDITIONAL_ENTRY",
      at: { listName: "finishers", priorityOrdinal: 3 },
    });
    const unbound = proveObservedActionUnselectable({
      authority: loaded.authority,
      observedToken: "divine_storm",
      bindings: { ...BINDINGS, specAtoms: { vocabulary: RETRIBUTION_ATOM_VOCABULARY, bound: [] } },
      buildFacts: FACTS,
    });
    expect(unbound).toMatchObject({ proven: false, refusal: "CONDITION_NOT_PROVEN_FALSE" });
    const absent = proveObservedActionUnselectable({
      authority: loaded.authority,
      observedToken: "kingsbane",
      bindings: BINDINGS,
      buildFacts: FACTS,
    });
    expect(absent).toMatchObject({ proven: false, refusal: "TOKEN_NOT_IN_AUTHORITY" });
    // An UNKNOWN applicability (Divine Storm with its talent unresolved) refuses: there is a world in which it fires.
    const unknownStorm = proveObservedActionUnselectable({
      authority: loaded.authority,
      observedToken: "divine_storm",
      bindings: BINDINGS,
      buildFacts: {
        ...FACTS,
        talents: {
          divine_storm: {
            simcName: "divine_storm",
            selection: "UNKNOWN",
            reason: "NODE_ABSENT",
            identity: null,
            decidedByEntryId: null,
          },
        },
      },
    });
    expect(unknownStorm).toMatchObject({ proven: false, refusal: "APPLICABILITY_UNKNOWN" });
  });

  it("refuses the proof outright when the authority carries an unmodelled dispatch", () => {
    const loaded = loadAplAuthority({
      artifactVersion: 1,
      authorityId: "SYNTHETIC_RUN_ACTION_LIST",
      artifactRevision: "synthetic-1",
      spec: { className: "paladin", specName: "retribution" },
      entryListName: "default",
      provenance: {
        repository: "synthetic",
        branch: "synthetic",
        commitSha: "0000000000000000000000000000000000000000",
        commitDate: "2026-01-01",
        sourcePath: "synthetic",
        sourceSha256: "0".repeat(64),
        sourceByteLength: 0,
        regionStartMarker: "start",
        regionEndMarker: "end",
        extractor: "test",
        extractorVersion: 1,
        extractedOn: "2026-01-01",
      },
      lists: [
        {
          listName: "default",
          receiverIdentifier: "default_",
          actions: [
            {
              priorityOrdinal: 0,
              actionStringVerbatim: "run_action_list,name=finishers",
              comment: null,
              sourceLine: 1,
            },
          ],
        },
        {
          listName: "finishers",
          receiverIdentifier: "finishers_",
          actions: [
            {
              priorityOrdinal: 0,
              actionStringVerbatim: "divine_storm,if=variable.ds_castable",
              comment: null,
              sourceLine: 2,
            },
          ],
        },
      ],
    });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const result = proveObservedActionUnselectable({
      authority: loaded.authority,
      observedToken: "divine_storm",
      bindings: BINDINGS,
      buildFacts: FACTS,
    });
    expect(result).toMatchObject({
      proven: false,
      refusal: "AUTHORITY_HAS_UNMODELLED_DISPATCH",
      at: { listName: "default", priorityOrdinal: 0 },
    });
  });
});

describe("Protection Paladin is unchanged by the third registration", () => {
  it("its committed 165 s outcomes are exactly the M10-C5 Phase B2 ones", () => {
    const analysis = PROTECTION_PALADIN_REGISTRATION.analyze({
      state: corpusBundleState(PROT_BUNDLE, []),
      actorId: TANK,
      specId: "paladin/protection",
      targetActorId: null,
    }) as ProtectionPaladinAnalysis;
    expect(analysis.status).toBe("ANALYZED");
    if (analysis.status !== "ANALYZED") return;
    const window = analysis.comparisons.filter(
      (comparison) =>
        comparison.decision.reportTimeMs >= 2124589 && comparison.decision.reportTimeMs <= 2169589,
    );
    expect(window).toHaveLength(37);
    expect(window.filter((comparison) => comparison.outcome === "MATCH")).toHaveLength(1);
    expect(window.filter((comparison) => comparison.outcome === "REJECTED")).toHaveLength(0);
    expect(analysis.coverage.exclusions.map((row) => row.key)).not.toContain("OUTSIDE_FIRST_SLICE");
    expect(JSON.stringify(analysis)).not.toMatch(/retribution/i);
  });
});
