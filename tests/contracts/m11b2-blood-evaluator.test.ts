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

  it("discloses 37 resolved decisions out of 123, with every excluded cast counted", () => {
    // RE-POINTED for M11-B4 (21), M11-B5 (25) and M11-B6 (37). B4's 21 are
    // Death Strikes whose own PRE_COST Runic Power decided the Death Strike
    // gate. B5 carries Runic Power to the other decisions, and four Blood
    // Boils resolve at sanlayn[6]. B6 reads Blood Debt's count from its own
    // transitions: where it is below 10, sanlayn[7] is FALSE and the scan
    // walks on — six Heart Strikes (Vampiric Strike casts) resolve at
    // sanlayn[8] on `buff.vampiric_strike.up`, five of them TOKEN_CONVERGED
    // because sanlayn[1]'s Heart Strike stays undecided on fight_remains and
    // every resolution of it still selects the heart_strike token, and six
    // more Death Strikes resolve at sanlayn[9]
    // on `runic_power.deficit<40`. None is REJECTED: at exactly 10 stacks
    // the Marrowrend entry is TRUE and its usability unproven, so the
    // decision stops there instead.
    expect(coverage).toMatchObject({
      eligibleDecisions: 123,
      match: 37,
      rejected: 0,
      unknown: 86,
      excludedCastCount: 148,
    });
    const matched = new Map<string, number>();
    const precision = new Map<string, number>();
    for (const comparison of analysis.comparisons) {
      if (comparison.outcome !== "MATCH") continue;
      expect(comparison.authorityToken).toBe(comparison.decision.observedToken);
      precision.set(
        comparison.selectionPrecision ?? "null",
        (precision.get(comparison.selectionPrecision ?? "null") ?? 0) + 1,
      );
      matched.set(
        comparison.decision.observedToken,
        (matched.get(comparison.decision.observedToken) ?? 0) + 1,
      );
    }
    expect(Object.fromEntries(matched)).toEqual({ death_strike: 27, heart_strike: 6, blood_boil: 4 });
    expect(Object.fromEntries(precision)).toEqual({ EXACT_ENTRY: 32, TOKEN_CONVERGED: 5 });
    expect(coverage.match + coverage.rejected + coverage.unknown).toBe(coverage.eligibleDecisions);
    expect(coverage.exclusions.reduce((sum, row) => sum + row.count, 0)).toBe(coverage.excludedCastCount);
    // The population is exactly the completed non-melee casts, eligible plus excluded.
    expect(analysis.comparisons.length + analysis.excluded.length).toBe(123 + 148);
  });

  it("names, for EVERY decision, a selection, or a stopping entry with its atoms, or a first undecided GCD candidate — never the decimal literal", () => {
    // RE-POINTED for M11-B3 and again for M11-B4. Before B3, 122 of 123 root
    // scans stopped at the first entry of a San'layn list on
    // UNSUPPORTED_NUMERIC_LITERAL (`1.5`). Decimals parse now, so the scan
    // walks the list: a scan that BLOCKS still names its entry and atoms; a
    // scan that RESOLVES with every candidate undecided names the first
    // competing GCD candidate instead; and since B4 a scan may RESOLVE to a
    // selection when the remainders are proven.
    const matched = new Set(
      analysis.comparisons.filter((c) => c.outcome === "MATCH").map((c) => c.decision.position),
    );
    for (const entry of analysis.resolved) {
      // Since M11-B6 a MATCH may be TOKEN_CONVERGED (the five Heart Strikes at sanlayn[8]).
      if (matched.has(entry.position)) {
        expect(["ROTATIONAL_GCD_SELECTED", "ROTATIONAL_GCD_TOKEN_CONVERGED"]).toContain(entry.selection.kind);
      } else {
        expect(entry.selection.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
      }
      if (matched.has(entry.position)) continue;
      const stop = entry.selection.stoppingPoint;
      const firstGcd = entry.selection.undecidedCandidates.find(
        (candidate) => candidate.lane === "GCD_CONSUMING",
      );
      if (stop !== null) {
        expect(stop.atoms.length, String(entry.position)).toBeGreaterThan(0);
        expect(stop.atoms.join(",")).not.toContain("UNSUPPORTED_NUMERIC_LITERAL");
      } else {
        expect(firstGcd, String(entry.position)).toBeDefined();
      }
    }
    expect(coverage.stoppingEntries.reduce((sum, row) => sum + row.count, 0)).toBe(123);
    expect(Object.fromEntries(coverage.stoppingEntries.map((row) => [row.key, row.count]))).toEqual({
      "default[15] run_action_list": 1,
      "(root scan resolved)": 81,
      "sanlayn[10] consumption": 41,
    });
    expect(coverage.stoppingAtoms.some((row) => row.key.includes("UNSUPPORTED_NUMERIC_LITERAL"))).toBe(false);
    expect(Object.fromEntries(coverage.stoppingAtoms.map((row) => [row.key, row.count]))).toEqual({
      "default[15] run_action_list | buff.gift_of_the_sanlayn.up": 1,
      "sanlayn[10] consumption | APPLICABILITY:consumption": 41,
    });
  });

  it("the former remainder obstacles are passed where the evidence proves them, and the next truthful blockers are named", () => {
    // RE-POINTED for M11-B4. Under B3 the first undecided GCD candidate was
    // sanlayn[0] on buff.bone_shield.remains at 96 decisions and san_gift[0]
    // on buff.essence_of_the_blood_queen.remains at 24. With the remainders
    // derived, Bone Shield's entry is undecided only where the pre-decision
    // window refused everything about it (the decision's own Marrowrend
    // stack gains ahead of it) — 7 — and Essence's only where its own
    // Vampiric Strike transition sits inside the window — 14 in the Gift
    // window, 11 outside it (sanlayn[1], which then also carries
    // fight_remains). The next blockers are the Runic Power deficit on a
    // cast that does not cost Runic Power (sanlayn[2], 43) and the Blood
    // Debt stack (sanlayn[7], 15).
    const firstObstacle = new Map<string, number>();
    for (const entry of analysis.resolved) {
      const first = entry.selection.undecidedCandidates.find(
        (candidate) => candidate.lane === "GCD_CONSUMING",
      );
      const key =
        first === undefined
          ? (entry.selection.stoppingPoint?.at ?? "(none)")
          : `${first.at} | ${first.atoms.join(",")}`;
      firstObstacle.set(key, (firstObstacle.get(key) ?? 0) + 1);
    }
    // RE-POINTED for M11-B5 and M11-B6. B5 carried Runic Power and left the
    // Blood Debt stack (sanlayn[7]) as the first obstacle at 45 decisions. B6
    // reads the count: of those 45, 7 resolve to MATCH and 38 advance — 16 to
    // Marrowrend's USABILITY at the same entry (the count is exactly 10, the
    // entry is TRUE, and no rune or affordability proof exists for an action
    // that was not cast), 19 to fight_remains at sanlayn[9], 2 to
    // buff.vampiric_strike.up and 1 to Heart Strike's usability at
    // sanlayn[8]. None remains on the stack; no REJECTED follows.
    expect(Object.fromEntries(firstObstacle)).toEqual({
      "(none)": 32,
      "sanlayn[9] death_strike | fight_remains": 20,
      "sanlayn[7] marrowrend | USABILITY:marrowrend": 16,
      "san_gift[0] heart_strike | buff.essence_of_the_blood_queen.remains": 14,
      "sanlayn[1] heart_strike | buff.essence_of_the_blood_queen.remains,fight_remains": 11,
      "sanlayn[0] deaths_caress | buff.bone_shield.up,buff.bone_shield.remains,buff.bone_shield.stack": 6,
      "sanlayn[0] deaths_caress | buff.bone_shield.stack": 1,
      "sanlayn[5] any_dnd | USABILITY:any_dnd": 4,
      "high_prio_actions[1] dancing_rune_weapon | debuff.reapers_mark_debuff.up,fight_remains": 3,
      "san_gift[3] heart_strike | buff.essence_of_the_blood_queen.stack": 3,
      "sanlayn[2] death_strike | runic_power.deficit": 3,
      "sanlayn[2] death_strike | USABILITY:death_strike": 3,
      "sanlayn[8] heart_strike | buff.vampiric_strike.up": 2,
      "sanlayn[6] blood_boil | USABILITY:blood_boil": 2,
      "sanlayn[6] blood_boil | buff.boiling_point.up": 1,
      "san_gift[1] death_strike | USABILITY:death_strike": 1,
      "sanlayn[8] heart_strike | USABILITY:heart_strike": 1,
    });
    expect([...firstObstacle.keys()].some((key) => key.includes("buff.blood_debt.stack"))).toBe(false);
  });

  it("takes the M11-B6 stack census: Blood Debt's count is exact at every decision after its first transition", () => {
    const stackEvidence = Object.fromEntries(coverage.stackEvidence.map((row) => [row.key, row.count]));
    expect(stackEvidence).toMatchObject({
      "blood_debt | EXACT_STACK_OBSERVATION": 107,
      "blood_debt | EXACT_STACK_APPLICATION": 7,
      "blood_debt | PROVEN_INACTIVE": 3,
      "blood_debt | AURA_STATE_UNKNOWN": 6,
      // Unchanged by B6.
      "bone_shield | EXACT_STACK_OBSERVATION": 114,
      "bone_shield | COUNT_AMBIGUOUS_SINCE_OBSERVATION": 1,
      "bone_shield | PRE_DECISION_WINDOW_TRANSITION": 8,
      "essence_of_the_blood_queen | AURA_ACTIVE_COUNT_NOT_RECONSTRUCTED": 96,
      "essence_of_the_blood_queen | PRE_DECISION_WINDOW_TRANSITION": 26,
      "essence_of_the_blood_queen | AURA_STATE_UNKNOWN": 1,
    });
    for (const atom of ["bone_shield", "essence_of_the_blood_queen", "blood_debt"]) {
      const total = coverage.stackEvidence
        .filter((row) => row.key.startsWith(`${atom} |`))
        .reduce((sum, row) => sum + row.count, 0);
      expect(total, atom).toBe(123);
    }
    expect(
      Object.keys(stackEvidence).some((key) =>
        /APPLICATION_WHILE_ACTIVE|blood_debt \| COUNT_AMBIGUOUS|blood_debt \| PRE_DECISION/.test(key),
      ),
    ).toBe(false);
    const values = Object.fromEntries(
      coverage.stackValues
        .filter((row) => row.key.startsWith("blood_debt"))
        .map((row) => [row.key, row.count]),
    );
    expect(values).toEqual({
      "blood_debt | stack 0": 3,
      "blood_debt | stack 1": 7,
      "blood_debt | stack 2": 11,
      "blood_debt | stack 3": 8,
      "blood_debt | stack 4": 10,
      "blood_debt | stack 5": 8,
      "blood_debt | stack 6": 7,
      "blood_debt | stack 7": 5,
      "blood_debt | stack 8": 10,
      "blood_debt | stack 9": 6,
      "blood_debt | stack 10": 42,
    });
    for (const entry of analysis.resolved) {
      const binding = entry.stacks.find((stack) => stack.atomName === "blood_debt");
      if (binding === undefined || binding.state !== "BOUND") continue;
      expect(binding.stack).toBeLessThanOrEqual(10);
      if (binding.proof === "EXACT_STACK_APPLICATION") expect(binding.stack).toBe(1);
      if (binding.proof === "PROVEN_INACTIVE") expect(binding.anchor).toBeNull();
      else expect(binding.anchor).not.toBeNull();
    }
  });

  it("takes the M11-B5 Runic Power census: own PRE_COST, carried exact, window-bounded, and every refusal by name", () => {
    expect(Object.fromEntries(coverage.runicPowerEvidence.map((row) => [row.key, row.count]))).toEqual({
      OWN_PRE_COST: 44,
      CARRIED_EXACT: 14,
      WINDOW_BOUNDED: 59,
      POST_SPEND_NOT_OBSERVED: 5,
      NO_ANCHOR: 1,
    });
    expect(coverage.runicPowerEvidence.reduce((sum, row) => sum + row.count, 0)).toBe(123);
    // The window is 1 ms: every ambiguous observation led its decision by 0 or 1 ms.
    expect(Object.fromEntries(coverage.runicPowerWindowLeads.map((row) => [row.key, row.count]))).toEqual({
      "lead 0": 72,
      "lead 1": 7,
    });
    for (const entry of analysis.resolved) {
      const rp = entry.runicPower;
      if (rp.state !== "BOUND") continue;
      expect(rp.maxWire).toBe(1250);
      expect(rp.basis.length).toBeGreaterThan(20);
      if (rp.proof === "WINDOW_BOUNDED") {
        expect(rp.binding.state).toBe("BOUNDED_NUMBER");
        expect(rp.currentWire).toBeNull();
        expect(rp.windowEntries.length).toBeGreaterThan(0);
        for (const item of rp.windowEntries) expect(item.changeSign).not.toBe("NEGATIVE");
      } else {
        expect(rp.binding.state).toBe("KNOWN_NUMBER");
        expect(rp.currentWire).not.toBeNull();
      }
      if (rp.proof === "CARRIED_EXACT") {
        expect(rp.carryMs).toBeLessThanOrEqual(4156);
        expect(rp.carryEvents).toBeLessThanOrEqual(22);
      }
    }
  });

  it("takes the M11-B4 remains census: exact, bounded, zero-by-proof, permanent, and every refusal by name", () => {
    expect(Object.fromEntries(coverage.remainsEvidence.map((row) => [row.key, row.count]))).toEqual({
      "bone_shield | EXACT": 11,
      "bone_shield | BOUNDED": 104,
      "bone_shield | PRE_DECISION_WINDOW_TRANSITION": 8,
      "essence_of_the_blood_queen | EXACT": 96,
      "essence_of_the_blood_queen | PRE_DECISION_WINDOW_TRANSITION": 26,
      "essence_of_the_blood_queen | AURA_STATE_UNKNOWN": 1,
      "vampiric_strike | PERMANENT": 15,
      "vampiric_strike | ZERO_BY_PROOF": 88,
      "vampiric_strike | AURA_STATE_UNKNOWN": 20,
      "crimson_scourge | EXACT": 8,
      "crimson_scourge | ZERO_BY_PROOF": 108,
      "crimson_scourge | AURA_STATE_UNKNOWN": 6,
      "crimson_scourge | PRE_DECISION_WINDOW_TRANSITION": 1,
      "visceral_strength | EXACT": 96,
      "visceral_strength | ZERO_BY_PROOF": 20,
      "visceral_strength | AURA_STATE_UNKNOWN": 7,
    });
    // Each aura's rows partition the 123 decisions.
    for (const atom of [
      "bone_shield",
      "essence_of_the_blood_queen",
      "vampiric_strike",
      "crimson_scourge",
      "visceral_strength",
    ]) {
      const total = coverage.remainsEvidence
        .filter((row) => row.key.startsWith(`${atom} |`))
        .reduce((sum, row) => sum + row.count, 0);
      expect(total, atom).toBe(123);
    }
    // No exact remainder fell within 50 ms of a pinned threshold, no gap and no
    // contradiction was met: every refusal is a window or a presence refusal.
    expect(
      coverage.remainsEvidence.some((row) => /TOLERANCE|CONTRADICTS|CONTINUITY|NO_GAIN/.test(row.key)),
    ).toBe(false);
    // The cost of the 50 ms window, by lead: the 0 ms leads M11-B2 already
    // refused, plus the 1 ms and 20 ms leads it did not (and one 38 ms Crimson
    // Scourge application ahead of a decision).
    expect(Object.fromEntries(coverage.preDecisionWindowRefusals.map((row) => [row.key, row.count]))).toEqual(
      {
        "bone_shield | up | lead 0": 7,
        "bone_shield | stack | lead 0": 7,
        "bone_shield | remains | lead 0": 7,
        "bone_shield | up | lead 20": 1,
        "bone_shield | stack | lead 20": 1,
        "bone_shield | remains | lead 20": 1,
        "essence_of_the_blood_queen | stack | lead 0": 23,
        "essence_of_the_blood_queen | remains | lead 0": 23,
        "essence_of_the_blood_queen | stack | lead 1": 3,
        "essence_of_the_blood_queen | remains | lead 1": 3,
        "crimson_scourge | remains | lead 38": 1,
        "death_and_decay | up | lead 0": 1,
        "death_and_decay | up | lead 20": 1,
        "death_and_decay | up | lead 21": 1,
        "death_and_decay | up | lead 34": 1,
      },
    );
    // Every bound value carries its anchor and basis; every bounded one is a lower bound.
    for (const entry of analysis.resolved) {
      for (const binding of entry.remains) {
        if (binding.state !== "BOUND") continue;
        expect(binding.basis.length).toBeGreaterThan(20);
        if (binding.proof === "GAIN_ANCHOR_EXACT" || binding.proof === "GAIN_ANCHOR_BOUNDED") {
          expect(binding.anchor).not.toBeNull();
          expect(binding.remainsMs).toBeGreaterThan(0);
        }
        if (binding.proof === "GAIN_ANCHOR_BOUNDED") expect(binding.binding.state).toBe("BOUNDED_NUMBER");
        if (binding.proof === "GAIN_ANCHOR_EXACT") expect(binding.binding.state).toBe("KNOWN_NUMBER");
      }
    }
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
        // TRUE gate: transfer — the child is ENTERED and offers candidates, and
        // the parent's default[16] is never visited.
        expect(sanGift).toMatchObject({ outcome: "RUN_ENTERED_SCAN_ENDS", gate: "TRUE" });
        expect(sanlayn).toBeUndefined();
        expect(entry.selection.stoppingPoint).toBeNull();
      } else if (gift?.state === "BOUND") {
        // FALSE gate: skipped, the parent continues into the sanlayn run, which
        // either offers candidates (entered) or blocks at sanlayn[10].
        expect(sanGift).toMatchObject({ outcome: "RUN_GATE_FALSE_SKIPPED", gate: "FALSE" });
        expect(["RUN_ENTERED_SCAN_ENDS", "BLOCKED"]).toContain(sanlayn?.outcome);
        expect(sanlayn?.gate).toBe("TRUE");
        if (sanlayn?.outcome === "BLOCKED")
          expect(entry.selection.stoppingPoint?.at).toBe("sanlayn[10] consumption");
        else expect(entry.selection.stoppingPoint).toBeNull();
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
    // The Dancing Rune Weapon candidate is still exactly 3 + 3 atoms; the
    // San'layn lists now contribute their own undecided candidates too.
    const drwRows = coverage.undecidedGcdCandidates.filter((row) =>
      row.key.startsWith("high_prio_actions[1]"),
    );
    expect(drwRows.reduce((sum, row) => sum + row.count, 0)).toBe(6);
    // The remainder candidates M11-B3 measured (98 and 24) are now only the
    // window-refused decisions (6 and 14).
    expect(
      coverage.undecidedGcdCandidates.find(
        (row) => row.key === "sanlayn[0] deaths_caress | buff.bone_shield.remains",
      )?.count,
    ).toBe(6);
    expect(
      coverage.undecidedGcdCandidates.find(
        (row) => row.key === "san_gift[0] heart_strike | buff.essence_of_the_blood_queen.remains",
      )?.count,
    ).toBe(14);
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
    // RE-POINTED for M11-B4: the pull Death's Caress (2,004,615), whose Bone
    // Shield application is logged 20 ms BEFORE it, was NO_STACK_OBSERVATION
    // under the 0 ms rule and is refused by the 50 ms window.
    expect(Object.fromEntries(tally)).toEqual({
      "BOUND/EXACT_STACK_OBSERVATION": 114,
      "UNBOUND/COUNT_AMBIGUOUS_SINCE_OBSERVATION": 1,
      "UNBOUND/PRE_DECISION_WINDOW_TRANSITION": 8,
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
    // RE-POINTED for M11-B4: one Death Strike (2,421,923) resolves in the opener.
    // Unchanged by M11-B5: the opener's Runic Power is exact or bounded at every
    // decision, and the next obstacle is the Blood Debt stack or an Essence window.
    expect(analysis.coverage).toMatchObject({ eligibleDecisions: 21, match: 1, rejected: 0, unknown: 20 });
    expect(
      Object.fromEntries(analysis.coverage.runicPowerEvidence.map((row) => [row.key, row.count])),
    ).toEqual({
      OWN_PRE_COST: 6,
      CARRIED_EXACT: 5,
      WINDOW_BOUNDED: 10,
    });
    expect(Object.fromEntries(analysis.coverage.stoppingEntries.map((row) => [row.key, row.count]))).toEqual({
      "(root scan resolved)": 15,
      "sanlayn[10] consumption": 6,
    });
    expect(
      analysis.coverage.undecidedGcdCandidates.find(
        (row) => row.key === "san_gift[0] heart_strike | buff.essence_of_the_blood_queen.remains",
      )?.count,
    ).toBe(8);
    // Bone Shield's remainder is EXACT at 20 of 21 opener decisions (the
    // first in-fight stack gain anchors it) and window-refused at 1.
    expect(
      analysis.coverage.undecidedGcdCandidates.some(
        (row) => row.key === "sanlayn[0] deaths_caress | buff.bone_shield.remains",
      ),
    ).toBe(false);
    expect(Object.fromEntries(analysis.coverage.remainsEvidence.map((row) => [row.key, row.count]))).toEqual({
      "bone_shield | EXACT": 20,
      "bone_shield | PRE_DECISION_WINDOW_TRANSITION": 1,
      "essence_of_the_blood_queen | EXACT": 13,
      "essence_of_the_blood_queen | PRE_DECISION_WINDOW_TRANSITION": 7,
      "essence_of_the_blood_queen | AURA_STATE_UNKNOWN": 1,
      "vampiric_strike | AURA_STATE_UNKNOWN": 21,
      "crimson_scourge | EXACT": 1,
      "crimson_scourge | ZERO_BY_PROOF": 5,
      "crimson_scourge | AURA_STATE_UNKNOWN": 15,
      "visceral_strength | EXACT": 5,
      "visceral_strength | AURA_STATE_UNKNOWN": 16,
    });
    expect(
      analysis.coverage.undecidedGcdCandidates.some((row) => row.key.startsWith("high_prio_actions[1]")),
    ).toBe(false);
    expect(analysis.build.heroTree).toMatchObject({ state: "RESOLVED", simcName: "sanlayn" });
  });
});
