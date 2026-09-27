/**
 * M11-C2: the Brewmaster Monk facade over the committed evidence — the
 * measurement as a contract.
 *
 * What this pins is the SHAPE of the honest result over the one Shado-Pan
 * subject: the hero-tree dispatch holds at every decision (Master of Harmony
 * skipped, Shado-Pan entered); the two Breath of Fire casts made under a
 * PROVEN Invoke Niuzao buff MATCH at EXACT_ENTRY, and — since M11-C3a, when
 * Breath of Fire's cooldown is proven running with no Keg Smash reset in
 * between — so do three Keg Smashes; every other decision is UNKNOWN and
 * names the entry that kept it so — since M11-C4i the NON_GCD Black Ox Brew
 * the query may not fire without a reviewed contract (Purifying Brew now has
 * one), or the Keg Smash whose readiness is not proven; since M11-C4i exactly
 * one decision is REJECTED — a Tiger Palm while the authority selects a Keg
 * Smash proven usable in every dimension; Empty the Cellar's readiness aura is
 * queried under its corroborated wire id and never proven inactive without an
 * observed removal; the survival domains carry no authority and say so; and
 * nothing — no silence, no pull snapshot, no lower-priority fall-through —
 * turns an UNKNOWN into a verdict.
 */

import { describe, expect, it } from "vitest";

import type { CombatState } from "../../src/engine/state/combat-state.js";
import { analyzeObservedBrewmasterMonkDecisions } from "../../src/specs/monk/brewmaster/observed-analysis.js";
import { BREWMASTER_MONK_REGISTRATION } from "../../src/specs/monk/brewmaster/registration.js";
import { BREWMASTER_MONK_SPEC_ID } from "../../src/specs/monk/brewmaster/spec.js";
import { committedArtifactText } from "../support/corpus/artifacts.js";
import { corpusState, corpusStateFrom } from "../support/corpus/fight.js";

const GTKB = "wcl-brewmaster-monk-gtkb-opener";
const ACTOR = 4;
const FIGHT_START = 2415041;
const [KEG_SMASH, BLACKOUT_KICK, TIGER_PALM, BREATH_OF_FIRE, INVOKE_NIUZAO] = [
  121253, 205523, 100780, 115181, 132578,
];

/** Every eligible decision, in canonical order: report time, observed spell, outcome, and the entry the query refused at. */
const DECISIONS = [
  [2415223, KEG_SMASH, "UNKNOWN", "shado_pan[3] black_ox_brew"],
  [2416677, BREATH_OF_FIRE, "UNKNOWN", "shado_pan[3] black_ox_brew"],
  [2417682, BLACKOUT_KICK, "UNKNOWN", "shado_pan[3] black_ox_brew"],
  [2419027, INVOKE_NIUZAO, "UNKNOWN", "shado_pan[3] black_ox_brew"],
  [2423448, BLACKOUT_KICK, "UNKNOWN", "shado_pan[3] black_ox_brew"],
  // M11-C4i: the authority selects Keg Smash (shado_pan[1]), proven usable in every dimension.
  [2424688, TIGER_PALM, "REJECTED", null],
  [2425704, KEG_SMASH, "MATCH", null],
  [2427076, BREATH_OF_FIRE, "MATCH", null],
  [2428219, BLACKOUT_KICK, "UNKNOWN", "shado_pan[3] black_ox_brew"],
  [2429224, TIGER_PALM, "UNKNOWN", "shado_pan[3] black_ox_brew"],
  [2430227, KEG_SMASH, "MATCH", null],
  [2431304, BREATH_OF_FIRE, "MATCH", null],
  [2432314, BLACKOUT_KICK, "UNKNOWN", "shado_pan[1] keg_smash"],
  [2433311, TIGER_PALM, "UNKNOWN", "shado_pan[1] keg_smash"],
  [2434312, KEG_SMASH, "MATCH", null],
] as const;

function analyzed(state: CombatState) {
  // Through the REGISTRATION's own authority access, as the corpus executor does.
  const analysis = analyzeObservedBrewmasterMonkDecisions({
    state,
    actorId: ACTOR,
    specId: BREWMASTER_MONK_SPEC_ID,
    targetActorId: null,
    authority: BREWMASTER_MONK_REGISTRATION.authority,
  });
  if (analysis.status !== "ANALYZED") throw new Error(`expected ANALYZED, got ${analysis.status}`);
  return analysis;
}

describe("the gates", () => {
  it("refuses another specialization before any Brewmaster rule runs", () => {
    const result = analyzeObservedBrewmasterMonkDecisions({
      state: corpusState(GTKB),
      actorId: ACTOR,
      specId: "deathknight/blood",
      targetActorId: null,
    });
    expect(result).toMatchObject({ status: "SPEC_NOT_SUPPORTED", specId: "deathknight/blood" });
  });

  it("refuses an actor with no combatant profile as PROFILE_NOT_RESOLVED, never a smaller population", () => {
    const raw = JSON.parse(committedArtifactText(GTKB)) as Record<string, unknown>[];
    const withoutProfile = raw.filter(
      (event) => !(event["type"] === "combatantinfo" && event["sourceID"] === ACTOR),
    );
    expect(withoutProfile).toHaveLength(raw.length - 1);
    const result = BREWMASTER_MONK_REGISTRATION.analyze({
      state: corpusStateFrom(GTKB, withoutProfile, { kind: "EVENT_REMOVED_AT", reportTimeMs: FIGHT_START }),
      actorId: ACTOR,
      specId: BREWMASTER_MONK_SPEC_ID,
      targetActorId: null,
    });
    expect(result.status).toBe("PROFILE_NOT_RESOLVED");
  });
});

describe("the measurement over the Shado-Pan opener", () => {
  const analysis = analyzed(corpusState(GTKB));

  it("fifteen eligible decisions, five MATCH at EXACT_ENTRY, one REJECTED, nine UNKNOWN (M11-C4i)", () => {
    expect(analysis.coverage).toMatchObject({
      eligibleDecisions: 15,
      match: 5,
      rejected: 1,
      unknown: 9,
      resolvedComparisons: 6,
      exactEntryMatches: 5,
      tokenConvergedMatches: 0,
    });
    expect(analysis.coverage.match + analysis.coverage.rejected + analysis.coverage.unknown).toBe(
      analysis.coverage.eligibleDecisions,
    );
  });

  it("every decision's outcome and refusal entry is exactly the pinned one", () => {
    expect(
      analysis.comparisons.map((comparison, index) => [
        comparison.decision.reportTimeMs,
        comparison.decision.abilityGameId,
        comparison.outcome,
        analysis.resolved[index]?.selection.blockedAt ?? null,
      ]),
    ).toEqual(DECISIONS.map((row) => [...row]));
  });

  it("Breath of Fire and (M11-C3a) Keg Smash MATCH, each under a proven Invoke Niuzao buff", () => {
    const matches = analysis.comparisons.filter((comparison) => comparison.outcome === "MATCH");
    expect(matches.map((comparison) => [comparison.authorityToken, comparison.selectionPrecision])).toEqual([
      ["keg_smash", "EXACT_ENTRY"],
      ["breath_of_fire", "EXACT_ENTRY"],
      ["keg_smash", "EXACT_ENTRY"],
      ["breath_of_fire", "EXACT_ENTRY"],
      ["keg_smash", "EXACT_ENTRY"],
    ]);
    for (const comparison of matches) {
      const resolved = analysis.resolved.find((entry) => entry.position === comparison.decision.position);
      const niuzao = resolved?.auras.find((binding) => binding.atomName === "invoke_niuzao_the_black_ox");
      expect(niuzao).toMatchObject({ state: "BOUND", up: true, proof: "OBSERVED" });
      expect(resolved?.diagnostics.buildStatic["talent.salsalabims_strength.enabled"]).toBe(true);
    }
  });

  it("exactly one decision is REJECTED (M11-C4i) — by the authority selecting a proven-usable Keg Smash, never by unselectability", () => {
    const rejected = analysis.comparisons.filter((comparison) => comparison.outcome === "REJECTED");
    expect(
      rejected.map((comparison) => [
        comparison.decision.reportTimeMs,
        comparison.basis,
        comparison.authorityToken,
      ]),
    ).toEqual([[2424688, "AUTHORITY_SELECTED_DIFFERENT_TOKEN", "keg_smash"]]);
    const resolved = analysis.resolved.find((entry) => entry.position === rejected[0]?.decision.position);
    expect(resolved?.selection.selectedEntry).toBe("shado_pan[1] keg_smash");
    expect(resolved?.positiveUsability.find((conclusion) => conclusion.simcToken === "keg_smash")?.kind).toBe(
      "PROVEN_USABLE",
    );
    // The observed action is never proven unselectable: the REJECTED is a scan selection, not a refutation.
    for (const comparison of analysis.comparisons) expect(comparison.observedActionRejected).toBe(false);
    for (const entry of analysis.resolved) expect(entry.unselectability.proven).toBe(false);
  });

  it("the hero-tree dispatch holds at EVERY decision: Master of Harmony skipped, Shado-Pan entered", () => {
    for (const entry of analysis.resolved) {
      expect(
        entry.selection.dispatches.map((step) => [step.at, step.calleeListName, step.outcome, step.gate]),
      ).toEqual([
        ["default[2]", "race_actions", "CALL_RETURNED_NO_ACTION_CONTINUE", "UNCONDITIONAL"],
        ["default[3]", "item_actions", "CALL_RETURNED_NO_ACTION_CONTINUE", "UNCONDITIONAL"],
        ["default[4]", "master_of_harmony", "RUN_GATE_FALSE_SKIPPED", "FALSE"],
        ["default[5]", "shado_pan", "RUN_ENTERED_SCAN_ENDS", "TRUE"],
      ]);
      expect(entry.diagnostics.heroTreeBound).toBe("shadopan");
    }
    expect(analysis.build.heroTree).toMatchObject({ state: "RESOLVED", simcName: "shadopan", subTreeId: 65 });
  });

  it("an UNKNOWN never falls through: every UNKNOWN carries the engine's refusal and names its entry", () => {
    const unknown = analysis.comparisons.filter((comparison) => comparison.outcome === "UNKNOWN");
    expect(unknown).toHaveLength(9);
    for (const comparison of unknown) {
      expect(comparison.authorityToken).toBeNull();
      expect(
        comparison.rawBlocker === "TRANSITION_UNSUPPORTED" ||
          comparison.rawBlocker === "DIVERGENT_GCD_OUTCOMES",
      ).toBe(true);
    }
    // M11-C4i: Purifying Brew's reviewed transition moves the refusal to Black Ox Brew, which has none.
    expect(analysis.coverage.unresolvedAt).toEqual([
      { key: "TRANSITION_UNSUPPORTED @ shado_pan[3] black_ox_brew", count: 7 },
      { key: "DIVERGENT_GCD_OUTCOMES @ shado_pan[1] keg_smash", count: 2 },
    ]);
  });

  it("the pull snapshot is never read: before any in-fight transition every aura is AMBIGUOUS_INITIAL_STATE", () => {
    const first = analysis.resolved[0];
    expect(first?.auras.map((binding) => [binding.atomName, binding.state])).toEqual([
      ["blackout_combo", "UNBOUND"],
      ["empty_barrel", "UNBOUND"],
      ["invoke_niuzao_the_black_ox", "UNBOUND"],
    ]);
    for (const binding of first?.auras ?? []) {
      expect(binding).toMatchObject({ reason: "AURA_STATE_UNKNOWN", auraReason: "AMBIGUOUS_INITIAL_STATE" });
    }
  });

  it("Empty the Cellar's readiness aura is queried under its corroborated wire id (M11-C4i) and stays NOT_ESTABLISHED over the opener: no transition of it precedes any decision", () => {
    for (const entry of analysis.resolved) {
      expect(entry.readinessAuras).toEqual([
        {
          simcToken: "empty_the_cellar",
          state: "NOT_ESTABLISHED",
          reason: "AURA_STATE_UNKNOWN",
          wireAuraId: 1262768,
          auraReason: "AMBIGUOUS_INITIAL_STATE",
        },
      ]);
    }
  });

  it("the six magnitudes stay unbound at every decision: no Energy, brew charge, accumulator or health is invented", () => {
    for (const entry of analysis.resolved) {
      expect(entry.diagnostics.unboundMagnitudes).toEqual([
        "cooldown.celestial_brew.charges_fractional",
        "cooldown.keg_smash.charges_fractional",
        "buff.aspect_of_harmony_accumulator.value",
        "health.max",
        "energy",
        "energy.regen",
      ]);
    }
  });

  it("every excluded cast is counted under a named reason; nothing is dropped", () => {
    expect(analysis.coverage.exclusions).toEqual([
      { key: "MELEE_SWING", count: 7 },
      { key: "NON_GCD_ACTION", count: 3 },
      { key: "EXECUTION_LANE_NOT_ESTABLISHED", count: 8 },
    ]);
    expect(analysis.coverage.excludedCastCount).toBe(18);
    expect(
      analysis.excluded.filter((cast) => cast.reason === "NON_GCD_ACTION").map((cast) => cast.abilityGameId),
    ).toEqual([119582, 119582, 119582]);
  });

  it("the survival domains carry no authority and never read as a verdict", () => {
    expect(analysis.domains.map((domain) => [domain.domain, domain.resolution])).toEqual([
      ["OFFENSIVE_ROTATION", "AUTHORITY_AVAILABLE"],
      ["RESOURCE_SPENDING", "NO_PINNED_AUTHORITY_FOR_DOMAIN"],
      ["ACTIVE_MITIGATION", "NO_PINNED_AUTHORITY_FOR_DOMAIN"],
      ["DEFENSIVE_COOLDOWN", "NO_PINNED_AUTHORITY_FOR_DOMAIN"],
      ["SELF_HEALING", "NO_PINNED_AUTHORITY_FOR_DOMAIN"],
      ["INTERRUPT", "NO_PINNED_AUTHORITY_FOR_DOMAIN"],
    ]);
  });

  it("the offset timeline is the capture's own: decisions sit inside the 20 s opener", () => {
    for (const comparison of analysis.comparisons) {
      expect(comparison.decision.fightTimeMs).toBe(comparison.decision.reportTimeMs - FIGHT_START);
      expect(comparison.decision.fightTimeMs).toBeLessThan(20000);
    }
  });
});
