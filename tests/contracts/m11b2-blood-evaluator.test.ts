/**
 * M11-B2: the Blood Death Knight facade over the committed evidence — the
 * measurement as a contract.
 *
 * What this pins is not a MATCH count (there is none) but the SHAPE of the
 * honest result: every eligible decision is UNKNOWN with a named stopping
 * entry and atom; the B1 `run_action_list` semantics show up on every root
 * scan exactly as the Gift binding says they should; the NON_GCD Vampiric
 * Blood entry is branched over under its contract and never a stopping
 * point; the survival domains carry no authority and say so; and nothing —
 * no cost field, no silence, no lower-priority fall-through — turns an
 * UNKNOWN into a verdict.
 */

import { describe, expect, it } from "vitest";

import type { CombatState } from "../../src/engine/state/combat-state.js";
import { analyzeObservedBloodDeathKnightDecisions } from "../../src/specs/deathknight/blood/observed-analysis.js";
import { BLOOD_DEATH_KNIGHT_REGISTRATION } from "../../src/specs/deathknight/blood/registration.js";
import { BLOOD_DEATH_KNIGHT_SPEC_ID } from "../../src/specs/deathknight/blood/spec.js";
import { corpusBundleState, corpusState } from "../support/corpus/fight.js";

const BLOOD45 = "wcl-blood-death-knight-a7r6-rotational-45s";
const SEG_105_165 = "wcl-blood-death-knight-a7r6-rotational-165s.seg-105-165";
const BUNDLE = [BLOOD45, "wcl-blood-death-knight-a7r6-rotational-165s.seg-45-105", SEG_105_165];
const GTKB = "wcl-blood-death-knight-gtkb-opener";
const ACTOR = 14;

function analyzed(state: CombatState) {
  // Through the REGISTRATION's own authority access, as the corpus executor does.
  const analysis = analyzeObservedBloodDeathKnightDecisions({
    state,
    actorId: ACTOR,
    specId: BLOOD_DEATH_KNIGHT_SPEC_ID,
    targetActorId: null,
    authority: BLOOD_DEATH_KNIGHT_REGISTRATION.authority,
  });
  if (analysis.status !== "ANALYZED") throw new Error(`expected ANALYZED, got ${analysis.status}`);
  return analysis;
}

describe("the gates", () => {
  it("refuses another specialization before any Blood rule runs", () => {
    const result = analyzeObservedBloodDeathKnightDecisions({
      state: corpusState(BLOOD45),
      actorId: ACTOR,
      specId: "paladin/retribution",
      targetActorId: null,
    });
    expect(result).toMatchObject({ status: "SPEC_NOT_SUPPORTED", specId: "paladin/retribution" });
  });

  it("refuses a segment with no combatant profile as PROFILE_NOT_RESOLVED, never a smaller population", () => {
    const result = BLOOD_DEATH_KNIGHT_REGISTRATION.analyze({
      state: corpusState(SEG_105_165),
      actorId: ACTOR,
      specId: BLOOD_DEATH_KNIGHT_SPEC_ID,
      targetActorId: null,
    });
    expect(result.status).toBe("PROFILE_NOT_RESOLVED");
  });
});

describe("the measurement over the composed 165 s fight", () => {
  const analysis = analyzed(corpusBundleState(BUNDLE, []));
  const { coverage } = analysis;

  it("discloses zero resolved decisions out of 123, with every excluded cast counted", () => {
    expect(coverage).toMatchObject({
      eligibleDecisions: 123,
      match: 0,
      rejected: 0,
      unknown: 123,
      excludedCastCount: 148,
    });
    expect(coverage.match + coverage.rejected + coverage.unknown).toBe(coverage.eligibleDecisions);
    expect(coverage.exclusions.reduce((sum, row) => sum + row.count, 0)).toBe(coverage.excludedCastCount);
    // The population is exactly the completed non-melee casts, eligible plus excluded.
    expect(analysis.comparisons.length + analysis.excluded.length).toBe(123 + 148);
  });

  it("names a stopping entry and at least one atom for EVERY decision, and the tallies cover the population", () => {
    for (const entry of analysis.resolved) {
      const stop = entry.selection.stoppingPoint;
      expect(stop, String(entry.position)).not.toBeNull();
      expect(stop?.atoms.length).toBeGreaterThan(0);
      expect(entry.selection.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    }
    expect(coverage.stoppingEntries.reduce((sum, row) => sum + row.count, 0)).toBe(123);
    expect(coverage.stoppingEntries.map((row) => row.key).sort()).toEqual([
      "default[15] run_action_list",
      "san_gift[0] heart_strike",
      "sanlayn[0] deaths_caress",
    ]);
    // 122 of 123 stop on the decimal literal the frozen parser refuses.
    const literal = coverage.stoppingAtoms.filter((row) => row.key.includes("UNSUPPORTED_NUMERIC_LITERAL"));
    expect(literal.reduce((sum, row) => sum + row.count, 0)).toBe(122);
  });

  it("shows the B1 run_action_list semantics on every root scan, driven by the Gift binding", () => {
    for (const entry of analysis.resolved) {
      const byAt = new Map(entry.selection.dispatches.map((step) => [step.at, step]));
      // hero_tree.deathbringer is bound FALSE from the resolved San'layn tree: skipped, never entered.
      expect(byAt.get("default[14]")).toMatchObject({
        calleeListName: "deathbringer",
        outcome: "RUN_GATE_FALSE_SKIPPED",
        gate: "FALSE",
      });
      expect(byAt.get("default[13]")).toMatchObject({
        calleeListName: "high_prio_actions",
        outcome: "CALL_MAY_SELECT",
      });
      const gift = entry.auras.find((aura) => aura.atomName === "gift_of_the_sanlayn");
      const sanGift = byAt.get("default[15]");
      const sanlayn = byAt.get("default[16]");
      if (gift?.state === "BOUND" && gift.up) {
        // TRUE gate: transfer, and the parent's default[16] is never visited.
        expect(sanGift).toMatchObject({ outcome: "BLOCKED", gate: "TRUE" });
        expect(sanlayn).toBeUndefined();
        expect(entry.selection.stoppingPoint?.at).toBe("san_gift[0] heart_strike");
      } else if (gift?.state === "BOUND") {
        // FALSE gate: skipped, the parent continues into the sanlayn run.
        expect(sanGift).toMatchObject({ outcome: "RUN_GATE_FALSE_SKIPPED", gate: "FALSE" });
        expect(sanlayn).toMatchObject({ outcome: "BLOCKED", gate: "TRUE" });
        expect(entry.selection.stoppingPoint?.at).toBe("sanlayn[0] deaths_caress");
      } else {
        // Undecided gate: neither entered nor skipped; the scan stops here.
        expect(sanGift).toMatchObject({ outcome: "BLOCKED", gate: "UNKNOWN_STATE" });
        expect(sanlayn).toBeUndefined();
        expect(entry.selection.stoppingPoint).toMatchObject({
          at: "default[15] run_action_list",
          atoms: ["buff.gift_of_the_sanlayn.up"],
        });
      }
    }
  });

  it("never stops at the NON_GCD Vampiric Blood entry: an undecided contracted NON_GCD entry is branched, not blocking", () => {
    for (const entry of analysis.resolved) {
      expect(entry.selection.stoppingPoint?.at).not.toBe("default[12] vampiric_blood");
      const vampiricBlood = entry.selection.undecidedCandidates.find(
        (candidate) => candidate.at === "default[12] vampiric_blood",
      );
      const aura = entry.auras.find((row) => row.atomName === "vampiric_blood");
      // Bound UP: the gate is FALSE and the entry is not a candidate at all. Otherwise it is a NON_GCD candidate.
      if (aura?.state === "BOUND" && aura.up) expect(vampiricBlood).toBeUndefined();
      else expect(vampiricBlood?.lane).toBe("NON_GCD");
    }
  });

  it("records Dancing Rune Weapon as a competing GCD candidate exactly where its cooldown is not proven", () => {
    for (const entry of analysis.resolved) {
      const drw = entry.cooldowns.find((cooldown) => cooldown.simcToken === "dancing_rune_weapon");
      const candidate = entry.selection.undecidedCandidates.find(
        (row) => row.at === "high_prio_actions[1] dancing_rune_weapon",
      );
      if (drw?.readiness.state === "PROVEN_NOT_READY") expect(candidate).toBeUndefined();
      else expect(candidate?.atoms).toEqual(["debuff.reapers_mark_debuff.up", "fight_remains"]);
    }
    expect(coverage.undecidedGcdCandidates.reduce((sum, row) => sum + row.count, 0)).toBe(6);
  });

  it("never proves unselectability for a token every list names unconditionally, and names the refusing entry", () => {
    for (const entry of analysis.resolved) {
      expect(entry.unselectability.proven).toBe(false);
      expect(["UNCONDITIONAL_ENTRY", "CONDITION_NOT_PROVEN_FALSE"]).toContain(entry.unselectability.refusal);
    }
    // The measured cross-list limit: a Death's Caress is refused on the unreachable precombat list's entry.
    const deathsCaress = analysis.comparisons.find(
      (comparison) => comparison.decision.observedToken === "deaths_caress",
    );
    const refusal = analysis.resolved.find(
      (entry) => entry.position === deathsCaress?.decision.position,
    )?.unselectability;
    expect(refusal).toEqual({ proven: false, refusal: "UNCONDITIONAL_ENTRY", at: "precombat[1]" });
  });

  it("reads a resource only where the cast carries a costed entry, and binds no cost-derived proof anywhere", () => {
    for (const record of analysis.resources) {
      const runes = record.runes.state === "EXACT_PRE_COST";
      const runicPower = record.runicPower.state === "EXACT_PRE_COST";
      expect(runes && runicPower).toBe(false);
      if (record.abilityGameId === 49998) expect(runicPower).toBe(true);
      if (record.abilityGameId === 195182) expect(runes).toBe(true);
    }
    for (const comparison of analysis.comparisons) {
      expect(comparison.rawBlocker ?? "").not.toContain("INSUFFICIENT_RESOURCE");
      expect(comparison.observedActionRejected).toBe(false);
    }
  });

  it("binds the exact Bone Shield count at 114 of 123 decisions and refuses the rest for a named reason", () => {
    const tally = new Map<string, number>();
    for (const entry of analysis.resolved) {
      const bone = entry.stacks.find((stack) => stack.atomName === "bone_shield");
      const key = bone?.state === "BOUND" ? `BOUND/${bone.proof}` : `UNBOUND/${bone?.reason ?? "?"}`;
      tally.set(key, (tally.get(key) ?? 0) + 1);
      if (bone?.state === "BOUND") expect(bone.stack).toBeGreaterThan(0);
    }
    expect(Object.fromEntries(tally)).toEqual({
      "BOUND/EXACT_STACK_OBSERVATION": 114,
      "UNBOUND/NO_STACK_OBSERVATION": 1,
      "UNBOUND/COUNT_AMBIGUOUS_SINCE_OBSERVATION": 1,
      "UNBOUND/SAME_MILLISECOND_TRANSITION": 7,
    });
  });

  it("represents Death Strike's survival meaning as domains with NO authority, never as the offensive verdict", () => {
    const byDomain = new Map(analysis.domains.map((domain) => [domain.domain, domain]));
    expect(byDomain.get("OFFENSIVE_ROTATION")).toMatchObject({
      resolution: "AUTHORITY_AVAILABLE",
      deathStrikeDualRole: true,
    });
    for (const domain of ["ACTIVE_MITIGATION", "SELF_HEALING"] as const) {
      expect(byDomain.get(domain)).toMatchObject({
        resolution: "NO_PINNED_AUTHORITY_FOR_DOMAIN",
        offensiveAuthorityGoverns: false,
        sharesActionWithOffensive: "death_strike",
      });
    }
    for (const domain of analysis.domains) expect(domain.resolution).not.toBe("DOMAIN_NOT_DECLARED");
  });
});

describe("the second subject", () => {
  it("reproduces the same stopping points on a different report, pull and boss", () => {
    const analysis = analyzed(corpusState(GTKB));
    expect(analysis.coverage).toMatchObject({ eligibleDecisions: 21, match: 0, rejected: 0, unknown: 21 });
    expect(Object.fromEntries(analysis.coverage.stoppingEntries.map((row) => [row.key, row.count]))).toEqual({
      "san_gift[0] heart_strike": 15,
      "sanlayn[0] deaths_caress": 6,
    });
    expect(analysis.coverage.undecidedGcdCandidates).toEqual([]);
    expect(analysis.build.heroTree).toMatchObject({ state: "RESOLVED", simcName: "sanlayn" });
  });
});
