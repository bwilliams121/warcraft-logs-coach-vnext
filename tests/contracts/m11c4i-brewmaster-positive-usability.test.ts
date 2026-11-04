import { describe, expect, it } from "vitest";

import { BREWMASTER_MONK_REGISTRATION } from "../../src/specs/monk/brewmaster/registration.js";
import type { BrewmasterMonkAnalysis } from "../../src/specs/monk/brewmaster/observed-analysis.js";
import { resolveBrewmasterUsability } from "../../src/specs/monk/brewmaster/action-profile.js";
import { brewmasterBranchBindings } from "../../src/specs/monk/brewmaster/first-gcd-adapter.js";
import { initialBrewmasterState } from "../../src/specs/monk/brewmaster/first-gcd-state.js";
import { pinnedBrewmasterMonkAuthority } from "../../src/specs/monk/brewmaster/pinned-authority.js";
import { POSITIVE_USABILITY_TOKENS } from "../../src/specs/monk/brewmaster/positive-usability.js";
import { brewmasterTransitionContractFor } from "../../src/data/game/monk-brewmaster-transition-authority.js";
import {
  brewmasterUsabilitySpellForToken,
  pinnedBrewmasterUsabilityAuthority,
} from "../../src/data/game/monk-brewmaster-usability-authority.js";
import { costCannotExceedBase } from "../../src/data/game/usability-authority-artifact.js";
import {
  concludePositiveUsability,
  provenDimension,
  USABILITY_DIMENSIONS,
  type PositiveUsability,
  type UsabilityObligations,
} from "../../src/findings/usability/usability-completeness.js";
import { unknownNumber, type AtomBindings } from "../../src/simc/expression/evaluate.js";
import { committedEvidenceArchiveFiles } from "../support/corpus/evidence-archive.js";
import { committedCorpusFiles, validateEvidenceArchive } from "../support/corpus/loader.js";
import { stateOfBundle } from "../support/corpus/fight.js";

/**
 * M11-C4i: positive usability and the Purifying Brew / Empty the Cellar
 * closure over the REAL committed Brewmaster evidence, through the real
 * registration path.
 *
 *   - both genuine REJECTED decisions, one per independent subject, with the
 *     facts a coaching layer needs to say WHY the alternative was definitely
 *     available: the selecting entry and its condition, and every dimension's
 *     basis, numbers and evidence locators;
 *   - the strict refusals that keep the rest UNKNOWN: an untargeted Breath of
 *     Fire never receives range proof; an uncosted decision cast proves no
 *     affordability; an untargeted corroborator establishes no target;
 *   - observed and simulated-prefix proofs keep their precedence;
 *   - a hypothetical Purifying Brew never binds Empty Barrel UP;
 *   - Empty the Cellar's readiness aura is read under its corroborated id;
 *   - no pre-C4i MATCH flips, in either subject;
 *   - no public specialization reaches the new code path.
 */

const SUBJECT_1 = {
  actor: 4,
  parts: [
    "wcl-brewmaster-monk-gtkb-opener",
    "wcl-brewmaster-monk-gtkb-rotational-165s.seg-20-165",
    "wcl-brewmaster-monk-gtkb-full-fight.seg-165-285",
  ],
};
const SUBJECT_2 = {
  actor: 11,
  parts: ["wcl-brewmaster-monk-rxaf-opener", "wcl-brewmaster-monk-rxaf-rotational-165s.seg-20-165"],
};

const PRE_C4I_MATCHES_SUBJECT_1_FULL_FIGHT: readonly (readonly [number, string])[] = [
  [2425704, "keg_smash"],
  [2427076, "breath_of_fire"],
  [2430227, "keg_smash"],
  [2431304, "breath_of_fire"],
  [2434312, "keg_smash"],
  [2435308, "breath_of_fire"],
  [2436307, "keg_smash"],
  [2437328, "breath_of_fire"],
  [2440834, "keg_smash"],
  [2441931, "breath_of_fire"],
  [2446960, "blackout_kick"],
  [2450998, "blackout_kick"],
  [2456768, "blackout_kick"],
  [2464112, "blackout_kick"],
  [2469278, "blackout_kick"],
  [2479087, "blackout_kick"],
  [2483812, "blackout_kick"],
  [2490143, "blackout_kick"],
  [2495098, "blackout_kick"],
  [2499673, "blackout_kick"],
  [2503669, "blackout_kick"],
  [2508905, "blackout_kick"],
  [2514099, "blackout_kick"],
  [2520584, "blackout_kick"],
  [2526904, "breath_of_fire"],
  [2532231, "keg_smash"],
  [2533232, "breath_of_fire"],
  [2536359, "keg_smash"],
  [2541676, "breath_of_fire"],
  [2546409, "keg_smash"],
  [2547520, "breath_of_fire"],
  [2559015, "blackout_kick"],
  [2564601, "blackout_kick"],
  [2568603, "blackout_kick"],
  [2572802, "blackout_kick"],
  [2579056, "blackout_kick"],
  [2583094, "blackout_kick"],
  [2587176, "blackout_kick"],
  [2592060, "blackout_kick"],
  [2597952, "blackout_kick"],
  [2603065, "blackout_kick"],
  [2607350, "blackout_kick"],
  [2612478, "blackout_kick"],
  [2618518, "blackout_kick"],
  [2626641, "blackout_kick"],
  [2630643, "blackout_kick"],
  [2638039, "blackout_kick"],
  [2642114, "blackout_kick"],
  [2648139, "blackout_kick"],
  [2655839, "blackout_kick"],
  [2659947, "blackout_kick"],
  [2664366, "blackout_kick"],
  [2680831, "blackout_kick"],
  [2693696, "keg_smash"],
  [2694895, "breath_of_fire"],
];
const PRE_C4I_MATCHES_SUBJECT_2_165S: readonly (readonly [number, string])[] = [
  [2442604, "breath_of_fire"],
  [2443633, "keg_smash"],
  [2444612, "breath_of_fire"],
  [2447614, "keg_smash"],
  [2449642, "breath_of_fire"],
  [2453849, "keg_smash"],
  [2454845, "breath_of_fire"],
  [2455872, "keg_smash"],
  [2456864, "breath_of_fire"],
  [2458620, "keg_smash"],
  [2459605, "breath_of_fire"],
  [2462641, "keg_smash"],
  [2463621, "breath_of_fire"],
  [2466608, "keg_smash"],
  [2468600, "blackout_kick"],
  [2472602, "blackout_kick"],
  [2479397, "blackout_kick"],
  [2483401, "blackout_kick"],
  [2488511, "blackout_kick"],
  [2492508, "blackout_kick"],
  [2497496, "blackout_kick"],
  [2501907, "blackout_kick"],
  [2505910, "blackout_kick"],
  [2511644, "blackout_kick"],
  [2519497, "blackout_kick"],
  [2523536, "blackout_kick"],
  [2527517, "blackout_kick"],
  [2531633, "blackout_kick"],
  [2535615, "blackout_kick"],
  [2539627, "blackout_kick"],
  [2547344, "keg_smash"],
  [2548369, "breath_of_fire"],
  [2552222, "keg_smash"],
  [2553204, "breath_of_fire"],
  [2556242, "keg_smash"],
  [2557216, "breath_of_fire"],
  [2561121, "keg_smash"],
  [2562078, "breath_of_fire"],
  [2563098, "keg_smash"],
  [2564093, "breath_of_fire"],
  [2574507, "blackout_kick"],
  [2579509, "blackout_kick"],
  [2583644, "blackout_kick"],
  [2589379, "blackout_kick"],
  [2594047, "blackout_kick"],
  [2599052, "blackout_kick"],
  [2603057, "blackout_kick"],
];

async function analysisOf(subject: { actor: number; parts: string[] }) {
  const loaded = await validateEvidenceArchive(committedEvidenceArchiveFiles(), committedCorpusFiles());
  if (!loaded.ok) throw new Error("the evidence archive does not validate");
  const state = stateOfBundle(loaded.archive, subject.parts, []);
  const analysis = BREWMASTER_MONK_REGISTRATION.analyze({
    state,
    actorId: subject.actor,
    specId: "monk/brewmaster",
    targetActorId: null,
  }) as BrewmasterMonkAnalysis;
  if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
  return analysis;
}

type Analyzed = Extract<BrewmasterMonkAnalysis, { status: "ANALYZED" }>;

function decisionAt(analysis: Analyzed, reportTimeMs: number) {
  const index = analysis.comparisons.findIndex(
    (comparison) => comparison.decision.reportTimeMs === reportTimeMs,
  );
  const comparison = analysis.comparisons[index];
  const resolved = analysis.resolved[index];
  if (comparison === undefined || resolved === undefined)
    throw new Error(`no decision at ${String(reportTimeMs)}`);
  return { comparison, resolved };
}

function conclusion(resolved: Analyzed["resolved"][number], token: string): PositiveUsability {
  const found = resolved.positiveUsability.find((entry) => entry.simcToken === token);
  if (found === undefined) throw new Error(`no conclusion for ${token}`);
  return found;
}

const subject1 = analysisOf(SUBJECT_1);
const subject2 = analysisOf(SUBJECT_2);

describe("the two genuine REJECTED decisions, reproduced through the real analyzer", () => {
  it("subject 1 (gtKb fight 22 actor 4): the Tiger Palm at 2,424,688 against a Keg Smash proven usable in every dimension", async () => {
    const { comparison, resolved } = decisionAt(await subject1, 2424688);
    expect([
      comparison.decision.observedToken,
      comparison.outcome,
      comparison.basis,
      comparison.authorityToken,
    ]).toEqual(["tiger_palm", "REJECTED", "AUTHORITY_SELECTED_DIFFERENT_TOKEN", "keg_smash"]);
    // The selecting entry and its condition: state/authority-driven, not build-background.
    expect(resolved.selection.selectedEntry).toBe("shado_pan[1] keg_smash");
    expect(resolved.selection.selectedEntryAction).toBe(
      "keg_smash,if=talent.salsalabims_strength.enabled&buff.invoke_niuzao_the_black_ox.up",
    );
    expect(resolved.auras.find((binding) => binding.atomName === "invoke_niuzao_the_black_ox")).toMatchObject(
      {
        state: "BOUND",
        up: true,
        proof: "OBSERVED",
      },
    );
    expect(comparison.observedActionRejected).toBe(false);
    const kegSmash = conclusion(resolved, "keg_smash");
    expect(kegSmash.kind).toBe("PROVEN_USABLE");
    expect(kegSmash.dimensions.COOLDOWN_READINESS).toMatchObject({
      state: "PROVEN",
      evidence: {
        basis: "COOLDOWN_UPPER_BOUND_ELAPSED",
        facts: { upperBoundMs: 8000, toleranceMs: 250, elapsedMs: 9465, anchorReportTimeMs: 2415223 },
      },
    });
    expect(kegSmash.dimensions.RESOURCE_AFFORDABILITY).toMatchObject({
      state: "PROVEN",
      evidence: {
        basis: "PRE_COST_AT_LEAST_BASE_COST",
        facts: {
          observedAmount: 100,
          observedCastWireCost: 50,
          observedCastBaseCost: 50,
          candidateBaseCost: 40,
        },
      },
    });
    expect(kegSmash.dimensions.RANGE_TARGET).toMatchObject({
      state: "PROVEN",
      evidence: {
        basis: "SAME_TARGET_RANGE_CONTAINED",
        facts: { corroboratingSpellId: 100780, candidateRange: "0-15" },
      },
    });
    expect(kegSmash.dimensions.MOVEMENT_CAST).toMatchObject({ state: "NOT_APPLICABLE" });
    // Every PROVEN dimension that rests on observed events carries their locators.
    for (const dimension of ["COOLDOWN_READINESS", "RESOURCE_AFFORDABILITY", "RANGE_TARGET"] as const) {
      const resolution = kegSmash.dimensions[dimension];
      expect(
        resolution.state === "PROVEN" ? resolution.evidence.locators.length : 0,
        dimension,
      ).toBeGreaterThan(0);
    }
  });

  it("subject 2 (rXAf fight 13 actor 11): the Tiger Palm at 2,573,516 against a Blackout Kick proven usable in every dimension", async () => {
    const { comparison, resolved } = decisionAt(await subject2, 2573516);
    expect([comparison.decision.observedToken, comparison.outcome, comparison.authorityToken]).toEqual([
      "tiger_palm",
      "REJECTED",
      "blackout_kick",
    ]);
    expect(resolved.selection.selectedEntry).toBe("shado_pan[7] blackout_kick");
    expect(resolved.selection.selectedEntryAction).toBe(
      "blackout_kick,if=talent.blackout_combo.enabled&!buff.blackout_combo.up",
    );
    expect(resolved.auras.find((binding) => binding.atomName === "blackout_combo")).toMatchObject({
      state: "BOUND",
      up: false,
    });
    const blackoutKick = conclusion(resolved, "blackout_kick");
    expect(blackoutKick.kind).toBe("PROVEN_USABLE");
    expect(blackoutKick.dimensions.RESOURCE_AFFORDABILITY).toMatchObject({
      state: "NOT_APPLICABLE",
      evidence: { basis: "NO_POWER_ROW" },
    });
    expect(blackoutKick.dimensions.MOVEMENT_CAST).toMatchObject({
      state: "PROVEN",
      evidence: { basis: "SAME_RESTRICTION_SATISFIED_BY_DECISION_CAST" },
    });
    expect(blackoutKick.dimensions.COOLDOWN_READINESS).toMatchObject({
      state: "PROVEN",
      evidence: { facts: { upperBoundMs: 4000, relevantAbilityGameIds: "205523/100784" } },
    });
  });
});

describe("the strict refusals that keep the rest UNKNOWN", () => {
  it("Breath of Fire is UNTARGETED in the pinned data and never becomes PROVEN_USABLE, in either subject", async () => {
    for (const analysis of [await subject1, await subject2]) {
      for (const resolved of analysis.resolved) {
        const breathOfFire = resolved.positiveUsability.find((entry) => entry.simcToken === "breath_of_fire");
        if (breathOfFire === undefined) continue;
        expect(breathOfFire.kind).toBe("NOT_PROVEN");
        expect(breathOfFire.dimensions.RANGE_TARGET).toMatchObject({
          state: "UNKNOWN",
          reason: "CANDIDATE_UNTARGETED",
        });
      }
    }
  });

  it("an uncosted decision cast proves no affordability: Keg Smash stays NOT_PROVEN at the Blackout Kick at 2,691,696 though its cooldown is proven", async () => {
    const { comparison, resolved } = decisionAt(await subject1, 2691696);
    expect(comparison.outcome).toBe("UNKNOWN");
    const kegSmash = conclusion(resolved, "keg_smash");
    expect(kegSmash.dimensions.COOLDOWN_READINESS.state).toBe("PROVEN");
    expect(kegSmash.dimensions.RESOURCE_AFFORDABILITY).toMatchObject({
      state: "UNKNOWN",
      reason: "RESOURCE_NOT_OBSERVED_PRE_COST",
    });
    expect(kegSmash.kind).toBe("NOT_PROVEN");
  });

  it("an untargeted corroborator establishes no target: Invoke Niuzao stays NOT_PROVEN at the Breath of Fire at 2,658,903 though its cooldown is proven", async () => {
    const { resolved } = decisionAt(await subject1, 2658903);
    const niuzao = conclusion(resolved, "invoke_niuzao");
    expect(niuzao.dimensions.COOLDOWN_READINESS.state).toBe("PROVEN");
    expect(niuzao.dimensions.RANGE_TARGET).toMatchObject({
      state: "UNKNOWN",
      reason: "CORROBORATOR_NOT_ENEMY_UNIT_TARGET",
    });
    expect(niuzao.kind).toBe("NOT_PROVEN");
  });

  it("a conclusion is built only for the four supported tokens, never for the observed one", async () => {
    for (const resolved of (await subject1).resolved) {
      for (const entry of resolved.positiveUsability) {
        expect(POSITIVE_USABILITY_TOKENS as readonly string[]).toContain(entry.simcToken);
      }
    }
  });
});

describe("precedence: hypothetical, observed and negative proofs come first", () => {
  const loaded = pinnedBrewmasterMonkAuthority();
  if (!loaded.ok) throw new Error("authority");
  const kegSmashEntry = loaded.authority.actions.find(
    (action) => action.entryKind === "PLAYER_ACTION" && action.actionToken === "keg_smash",
  );
  if (kegSmashEntry === undefined) throw new Error("no keg_smash entry");
  const proven = provenDimension("TEST", "every dimension");
  const provenUsable = concludePositiveUsability(
    "keg_smash",
    Object.fromEntries(USABILITY_DIMENSIONS.map((dimension) => [dimension, proven])) as UsabilityObligations,
  );
  const base = {
    action: kegSmashEntry,
    observedAbilityGameId: 100780,
    buildFacts: { talents: {}, heroTree: { state: "UNKNOWN" as const } },
    readiness: [],
    readinessAuras: [],
    positiveUsability: new Map([["keg_smash", provenUsable]]),
  };

  it("a PROVEN_USABLE conclusion makes the unobserved action PROVEN_USABLE only after every other proof", () => {
    expect(resolveBrewmasterUsability({ ...base, state: initialBrewmasterState() }).kind).toBe(
      "PROVEN_USABLE",
    );
    expect(
      resolveBrewmasterUsability({ ...base, state: initialBrewmasterState(), positiveUsability: new Map() })
        .kind,
    ).toBe("UNKNOWN");
  });

  it("a simulated prefix (the entry fired, or its shared cooldown started) beats the positive conclusion", () => {
    const executed = {
      ...initialBrewmasterState(),
      executedEntries: [
        {
          listName: kegSmashEntry.listName,
          priorityOrdinal: kegSmashEntry.priorityOrdinal,
          actionToken: kegSmashEntry.actionToken,
          sourceLine: kegSmashEntry.sourceLine,
        },
      ],
    };
    expect(resolveBrewmasterUsability({ ...base, state: executed })).toMatchObject({
      kind: "PROVEN_UNUSABLE",
      reason: "SIMULATED_PREFIX_EXECUTION",
    });
    expect(
      resolveBrewmasterUsability({
        ...base,
        state: { ...initialBrewmasterState(), sharedCooldownTokens: ["keg_smash"] },
      }),
    ).toMatchObject({ kind: "PROVEN_UNUSABLE", reason: "SIMULATED_PREFIX_EXECUTION" });
  });

  it("the observed cast keeps its own proof, and a negative cooldown proof beats the positive conclusion", () => {
    expect(
      resolveBrewmasterUsability({ ...base, state: initialBrewmasterState(), observedAbilityGameId: 121253 })
        .kind,
    ).toBe("PROVEN_USABLE");
    expect(
      resolveBrewmasterUsability({
        ...base,
        state: initialBrewmasterState(),
        readiness: [
          {
            simcToken: "keg_smash",
            abilityGameId: 121253,
            readiness: {
              state: "PROVEN_NOT_READY",
              provenRemainingAtLeastMs: 5000,
              cooldownToleranceMs: 250,
            },
          },
        ],
      }),
    ).toMatchObject({ kind: "PROVEN_UNUSABLE", reason: "ACTIVE_COOLDOWN" });
  });
});

describe("the Purifying Brew / Empty the Cellar closure", () => {
  it("a hypothetical Purifying Brew never binds Empty Barrel UP: a DOWN binding is forgotten, an UP one kept, none added", () => {
    const contract = brewmasterTransitionContractFor("purifying_brew");
    expect(contract?.forgetsBuffsUnlessObservedUp).toEqual(["empty_barrel"]);
    const bindings = (buffs: { name: string; up: boolean }[]): AtomBindings => ({
      comboPoints: unknownNumber("STATE_NOT_MODELLED"),
      comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
      energyPct: unknownNumber("STATE_NOT_MODELLED"),
      knownBuffs: buffs,
    });
    const forgot = { ...initialBrewmasterState(), forgottenBuffs: ["empty_barrel"] };
    expect(
      brewmasterBranchBindings(bindings([{ name: "empty_barrel", up: false }]), forgot).knownBuffs,
    ).toEqual([]);
    expect(
      brewmasterBranchBindings(bindings([{ name: "empty_barrel", up: true }]), forgot).knownBuffs,
    ).toEqual([{ name: "empty_barrel", up: true }]);
    expect(brewmasterBranchBindings(bindings([]), forgot).knownBuffs).toEqual([]);
    // Other buffs are never touched.
    expect(
      brewmasterBranchBindings(bindings([{ name: "blackout_combo", up: false }]), forgot).knownBuffs,
    ).toEqual([{ name: "blackout_combo", up: false }]);
  });

  it("Empty the Cellar's readiness aura is read under its corroborated id: PROVEN_INACTIVE only from an observed removal", async () => {
    const states = new Map<string, number>();
    for (const resolved of (await subject1).resolved) {
      for (const fact of resolved.readinessAuras) {
        expect(fact.wireAuraId).toBe(1262768);
        const key =
          fact.state === "PROVEN_INACTIVE"
            ? `PROVEN_INACTIVE@${String(fact.anchorReportTimeMs)}`
            : fact.reason;
        states.set(key, (states.get(key) ?? 0) + 1);
      }
    }
    const anchors = [...states.keys()].filter((key) => key.startsWith("PROVEN_INACTIVE@"));
    // The two observed removals of 1262768 in the committed evidence.
    expect(anchors.sort()).toEqual(["PROVEN_INACTIVE@2439541", "PROVEN_INACTIVE@2536906"]);
    expect(states.has("AURA_ACTIVE")).toBe(true);
    expect(states.has("WIRE_AURA_IDENTITY_NOT_CORROBORATED")).toBe(false);
  });
});

describe("no prior MATCH flips", () => {
  it("every pre-C4i MATCH of subject 1's full fight is still a MATCH for the same token", async () => {
    const analysis = await subject1;
    for (const [reportTimeMs, token] of PRE_C4I_MATCHES_SUBJECT_1_FULL_FIGHT) {
      const { comparison } = decisionAt(analysis, reportTimeMs);
      expect([comparison.outcome, comparison.authorityToken], String(reportTimeMs)).toEqual(["MATCH", token]);
    }
    expect(PRE_C4I_MATCHES_SUBJECT_1_FULL_FIGHT).toHaveLength(55);
  });

  it("every pre-C4i MATCH of subject 2's fixed window is still a MATCH for the same token", async () => {
    const analysis = await subject2;
    for (const [reportTimeMs, token] of PRE_C4I_MATCHES_SUBJECT_2_165S) {
      const { comparison } = decisionAt(analysis, reportTimeMs);
      expect([comparison.outcome, comparison.authorityToken], String(reportTimeMs)).toEqual(["MATCH", token]);
    }
    expect(PRE_C4I_MATCHES_SUBJECT_2_165S).toHaveLength(47);
  });
});

describe("scope", () => {
  const SOURCES: Record<string, string> = import.meta.glob("../../src/specs/**/*.ts", {
    eager: true,
    query: "?raw",
    import: "default",
  });

  it("no public specialization reaches the positive usability code path (their outputs cannot change)", () => {
    const readers = Object.entries(SOURCES)
      .filter(([, text]) => text.includes("findings/usability/") || text.includes("usability-authority"))
      .map(([path]) => path.replace(/^.*\/src\//, "src/"))
      .sort();
    expect(readers).toEqual([
      // ONB-A1: INTERNAL_ONLY; only Reaver's Glaive ever receives a conclusion.
      "src/specs/demonhunter/havoc/action-profile.ts",
      "src/specs/demonhunter/havoc/first-gcd-adapter.ts",
      "src/specs/demonhunter/havoc/observed-analysis.ts",
      "src/specs/demonhunter/havoc/positive-usability.ts",
      "src/specs/monk/brewmaster/action-profile.ts",
      "src/specs/monk/brewmaster/first-gcd-adapter.ts",
      "src/specs/monk/brewmaster/observed-analysis.ts",
      "src/specs/monk/brewmaster/positive-usability.ts",
    ]);
  });

  it("the Keg Smash cost bound holds from the census; a census row that INCREASES a cost refuses it (Tiger Palm's superset census holds one)", () => {
    const loaded = pinnedBrewmasterUsabilityAuthority();
    if (!loaded.ok) throw new Error("usability authority");
    const kegSmash = brewmasterUsabilitySpellForToken("keg_smash");
    const tigerPalm = brewmasterUsabilitySpellForToken("tiger_palm");
    if (kegSmash === null || tigerPalm === null) throw new Error("records");
    expect(costCannotExceedBase(loaded, kegSmash, 0).holds).toBe(true);
    expect(costCannotExceedBase(loaded, tigerPalm, 0)).toMatchObject({ holds: false });
    expect(costCannotExceedBase({ ...loaded, costFormulaClaims: [] }, kegSmash, 0).holds).toBe(false);
  });
});
