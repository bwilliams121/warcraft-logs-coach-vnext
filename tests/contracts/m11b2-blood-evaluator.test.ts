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
const HEART_STRIKE = 206930;
const VAMPIRIC_STRIKE = 433895;
const DEATH_STRIKE = 49998;

/** The 37 MATCH decisions of M11-B6, by report time, in canonical order. Pinned so B7, B8 and B9 can prove they moved none. */
const B6_MATCH_REPORT_TIMES = [
  2012014, 2014293, 2016527, 2018775, 2021024, 2024020, 2026293, 2028806, 2029599, 2031294, 2033630, 2045618,
  2046373, 2047348, 2049304, 2066413, 2068394, 2073540, 2084304, 2086414, 2088527, 2094707, 2102831, 2108740,
  2116405, 2123152, 2126219, 2129260, 2131282, 2134429, 2136481, 2138540, 2141616, 2143622, 2144631, 2150485,
  2153775,
];

/** The seven M11-B7 REJECTED decisions: observed cast, its own exact PRE_COST Rune count, and the Blood Debt stack-10 anchor. */
const B7_REJECTED = [
  { t: 2039813, ability: HEART_STRIKE, runes: 4, bloodDebtAnchor: 2033650 },
  { t: 2040797, ability: HEART_STRIKE, runes: 4, bloodDebtAnchor: 2033650 },
  { t: 2042440, ability: HEART_STRIKE, runes: 4, bloodDebtAnchor: 2033650 },
  { t: 2091626, ability: HEART_STRIKE, runes: 3, bloodDebtAnchor: 2086445 },
  { t: 2113271, ability: VAMPIRIC_STRIKE, runes: 5, bloodDebtAnchor: 2086445 },
  { t: 2114293, ability: HEART_STRIKE, runes: 4, bloodDebtAnchor: 2086445 },
  { t: 2115379, ability: HEART_STRIKE, runes: 3, bloodDebtAnchor: 2086445 },
] as const;

/**
 * The two M11-B8 REJECTED decisions: Vampiric Strikes whose sanlayn[1] Heart
 * Strike entry is FALSE from the order-invariant Essence floor, after which
 * the same Marrowrend chain as B7 selects. Same shape as B7_REJECTED.
 */
const B8_REJECTED = [
  { t: 2087470, ability: VAMPIRIC_STRIKE, runes: 3, bloodDebtAnchor: 2086445, essenceFloorMs: 11070 },
  { t: 2093667, ability: VAMPIRIC_STRIKE, runes: 3, bloodDebtAnchor: 2086445, essenceFloorMs: 18803 },
] as const;

/** The three M11-B9 MATCH decisions: Gift-window Vampiric Strikes selected at san_gift[3] once the Essence stack set decides `stack<7` TRUE in both worlds. */
const B9_MATCH_REPORT_TIMES = [2015029, 2103820, 2105703] as const;

/** The two M11-B10 MATCH decisions: Marrowrends selected at sanlayn[7] (Blood Debt 10) once sanlayn[0], [3] and [4] are FALSE over the Bone Shield set, presence and floor. */
const B10_MATCH_REPORT_TIMES = [2043209, 2124183] as const;
const MARROWREND = 195182;
const DEATHS_CARESS = 195292;

/** Every REJECTED after M11-B8, in canonical order: B7's seven plus B8's two. */
const REJECTED_AFTER_B8 = [...B7_REJECTED, ...B8_REJECTED].sort((left, right) => left.t - right.t);

/**
 * The decisions whose ROOT scan selects marrowrend but whose worlds still
 * diverge on a higher entry: B7's five minus the two B8 resolved (their
 * higher entry was sanlayn[1] on the Essence remainder).
 */
const B7_DIVERGENT = [2036692, 2097796, 2119480] as const;

/** The nine Marrowrend-usability blockers whose cast carries no Rune entry: 7 Death Strikes, 2 free Heart Strikes. */
const B7_NO_RUNE_OBSERVATION = [
  { t: 2035940, ability: DEATH_STRIKE },
  { t: 2038297, ability: DEATH_STRIKE },
  { t: 2039056, ability: HEART_STRIKE },
  { t: 2041571, ability: DEATH_STRIKE },
  { t: 2090596, ability: DEATH_STRIKE },
  { t: 2092650, ability: DEATH_STRIKE },
  { t: 2112377, ability: DEATH_STRIKE },
  { t: 2117422, ability: HEART_STRIKE },
  { t: 2118444, ability: DEATH_STRIKE },
] as const;

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

  it("discloses 49 resolved decisions out of 123 — 40 MATCH and 9 REJECTED — with every excluded cast counted", () => {
    // RE-POINTED for M11-B4 (21), M11-B5 (25), M11-B6 (37) and M11-B7 (37 + 7). B4's 21 are
    // Death Strikes whose own PRE_COST Runic Power decided the Death Strike
    // gate. B5 carries Runic Power to the other decisions, and four Blood
    // Boils resolve at sanlayn[6]. B6 reads Blood Debt's count from its own
    // transitions: where it is below 10, sanlayn[7] is FALSE and the scan
    // walks on — six Heart Strikes (Vampiric Strike casts) resolve at
    // sanlayn[8] on `buff.vampiric_strike.up`, five of them TOKEN_CONVERGED
    // because sanlayn[1]'s Heart Strike stays undecided on fight_remains and
    // every resolution of it still selects the heart_strike token, and six
    // more Death Strikes resolve at sanlayn[9]
    // on `runic_power.deficit<40`. B7 proves Marrowrend usable from the
    // decision cast's own exact PRE_COST Rune count against the pinned cost:
    // at exactly 10 Blood Debt stacks the Marrowrend entry is TRUE, and where
    // the observed Heart Strike or Vampiric Strike carried 3-5 Runes the
    // authority selects marrowrend instead — 7 REJECTED, each an
    // authority-selected-different-token divergence and not a score. The 37
    // MATCH are untouched. B8 reads no lone Essence refresh as an exact
    // anchor and binds, inside the pre-decision window, only the floor both
    // orderings share: two Vampiric Strikes whose sanlayn[1] entry is FALSE
    // from that floor join the REJECTED through the same Marrowrend chain,
    // and the 37 MATCH are still untouched. B9 binds Essence's count from
    // its own transitions and, inside the window, the set of the two counts
    // both orderings leave: three Gift-window Vampiric Strikes whose
    // san_gift[3] gate (stack<7) is TRUE for every member of { 5,6 } / { 4,5 }
    // select the observed action at the exact entry. The 37 MATCH and the 9
    // REJECTED are untouched again. B10 binds Bone Shield's window state as
    // what every ordering leaves — the prefix set of exact counts, the
    // presence M4 proves on both sides, the B8 floor — and two Marrowrends
    // whose sanlayn[0], [3] and [4] are FALSE for every member reach
    // sanlayn[7] at Blood Debt 10. The 40 MATCH and 9 REJECTED are untouched.
    expect(coverage).toMatchObject({
      eligibleDecisions: 123,
      match: 42,
      rejected: 9,
      unknown: 72,
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
    // M11-B9: three more Heart Strikes (Vampiric Strikes at 2,015,029, 2,103,820, 2,105,703), each EXACT_ENTRY at san_gift[3].
    // M11-B10: two Marrowrends (2,043,209, 2,124,183), each EXACT_ENTRY at sanlayn[7].
    expect(Object.fromEntries(matched)).toEqual({
      death_strike: 27,
      heart_strike: 9,
      blood_boil: 4,
      marrowrend: 2,
    });
    // M11-B8: the Vampiric Strike at 2,029,599 is EXACT_ENTRY — sanlayn[1] is FALSE from the Essence floor.
    expect(Object.fromEntries(precision)).toEqual({ EXACT_ENTRY: 38, TOKEN_CONVERGED: 4 });
    // The MATCH population is exactly the M11-B6 one plus the three M11-B9 Vampiric Strikes and the two M11-B10 Marrowrends, decision by decision.
    const matchedAt = analysis.comparisons
      .filter((comparison) => comparison.outcome === "MATCH")
      .map((comparison) => comparison.decision.reportTimeMs);
    expect(matchedAt).toEqual(
      [...B6_MATCH_REPORT_TIMES, ...B9_MATCH_REPORT_TIMES, ...B10_MATCH_REPORT_TIMES].sort(
        (left, right) => left - right,
      ),
    );
    for (const t of B6_MATCH_REPORT_TIMES) expect(matchedAt, String(t)).toContain(t);
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
      analysis.comparisons.filter((c) => c.outcome !== "UNKNOWN").map((c) => c.decision.position),
    );
    for (const entry of analysis.resolved) {
      // Since M11-B6 a MATCH may be TOKEN_CONVERGED (the five Heart Strikes at
      // sanlayn[8]); since M11-B7 a resolved decision may be REJECTED (a
      // selection of marrowrend at sanlayn[7] against an observed Heart Strike).
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
    // RE-POINTED for M11-B7: the seven REJECTED root scans end at sanlayn[7]
    // with a definite winner and never reach sanlayn[10] (81 -> 88, 41 -> 34).
    expect(Object.fromEntries(coverage.stoppingEntries.map((row) => [row.key, row.count]))).toEqual({
      "default[15] run_action_list": 1,
      "(root scan resolved)": 88,
      "sanlayn[10] consumption": 34,
    });
    expect(coverage.stoppingAtoms.some((row) => row.key.includes("UNSUPPORTED_NUMERIC_LITERAL"))).toBe(false);
    expect(Object.fromEntries(coverage.stoppingAtoms.map((row) => [row.key, row.count]))).toEqual({
      "default[15] run_action_list | buff.gift_of_the_sanlayn.up": 1,
      "sanlayn[10] consumption | APPLICABILITY:consumption": 34,
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
    // sanlayn[8]. None remains on the stack. RE-POINTED for M11-B7: of the
    // 16 on Marrowrend's usability, the 7 whose observed cast carried an
    // exact PRE_COST Rune count of 3-5 resolve (REJECTED, "(none)" 32 -> 39)
    // and the 9 whose cast carried no Rune entry — 7 Death Strikes and 2
    // Dance-of-Midnight-free Heart Strikes — stay exactly where they were.
    // Nothing else moves: no Rune value is carried into a decision that did
    // not observe one. RE-POINTED for M11-B8: the Essence window refusals
    // (san_gift[0] 14, sanlayn[1] 11) become floors where both orderings of
    // the cluster share one — the Gift-window Vampiric Strikes advance to
    // san_gift[2] (4) and san_gift[3] on the Essence stack (12, positive
    // counts deferred), the sanlayn ones to sanlayn[7] (1), sanlayn[5] (2)
    // and two REJECTED; three clusters with no floor before them and the
    // fresh application at 2,008,597 stay on the Essence remainder.
    // sanlayn[9] now carries the Essence remainder beside fight_remains at
    // 11 decisions whose remainder is UNKNOWN past every floor a lone
    // refresh could keep — decisions already UNKNOWN on fight_remains, so
    // nothing resolves and nothing regresses. The Marrowrend-usability
    // blockers rise by one (2,035,179, released from sanlayn[1]).
    // RE-POINTED for M11-B9: of the 12 on the Essence stack, 3 resolve
    // (MATCH), 2 stay on it as { 6,7 } (2,017,274, 2,106,638), 3 stay on it
    // as lone-refresh clusters (2,018,024, 2,019,524, 2,110,550), 1 as a
    // cluster with no exact count before it (2,101,867), 1 as an ambiguous
    // count (2,100,867), and 2 advance to Heart Strike's usability with an
    // exact count that makes the gate TRUE for an action that was not cast
    // (2,015,770 at 6, 2,104,758 at 5).
    // RE-POINTED for M11-B10: the six sanlayn[0] Bone Shield window blockers
    // are passed (up TRUE on both sides of the cluster, the floor above 1.5 s,
    // every member of the set above 1 and, as it happens, at or above 6):
    // two resolve (MATCH at sanlayn[7]), two advance to sanlayn[9]
    // fight_remains (2,057,622 with the Essence remainder, 2,085,352) and two
    // to sanlayn[2] on the Runic Power deficit after a spend (2,151,502,
    // 2,164,444). The one sanlayn[0] blocker left is 2,044,021, whose count
    // the lone refreshes at 2,043,229 break — not a window case.
    expect(Object.fromEntries(firstObstacle)).toEqual({
      "(none)": 47,
      "sanlayn[9] death_strike | fight_remains,buff.essence_of_the_blood_queen.remains": 12,
      "sanlayn[7] marrowrend | USABILITY:marrowrend": 10,
      "sanlayn[9] death_strike | fight_remains": 10,
      "san_gift[3] heart_strike | buff.essence_of_the_blood_queen.stack": 7,
      "sanlayn[5] any_dnd | USABILITY:any_dnd": 5,
      "sanlayn[2] death_strike | runic_power.deficit": 5,
      "sanlayn[1] heart_strike | buff.essence_of_the_blood_queen.remains,fight_remains": 4,
      "high_prio_actions[1] dancing_rune_weapon | debuff.reapers_mark_debuff.up,fight_remains": 3,
      "san_gift[2] any_dnd | buff.crimson_scourge.remains,buff.visceral_strength.remains": 3,
      "sanlayn[2] death_strike | USABILITY:death_strike": 3,
      "san_gift[3] heart_strike | USABILITY:heart_strike": 2,
      "sanlayn[8] heart_strike | buff.vampiric_strike.up": 2,
      "sanlayn[6] blood_boil | USABILITY:blood_boil": 2,
      "sanlayn[1] heart_strike | fight_remains": 2,
      "san_gift[0] heart_strike | buff.essence_of_the_blood_queen.remains": 1,
      "san_gift[2] any_dnd | buff.visceral_strength.remains": 1,
      "sanlayn[6] blood_boil | buff.boiling_point.up": 1,
      "sanlayn[5] any_dnd | buff.crimson_scourge.remains": 1,
      "sanlayn[0] deaths_caress | buff.bone_shield.stack": 1,
      "san_gift[1] death_strike | USABILITY:death_strike": 1,
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
      // Unchanged by B6 and B9. RE-POINTED for M11-B10: seven of the eight
      // window refusals are the aura's own gain clusters and bind the prefix
      // set; the eighth is the track's first application (2,004,615).
      "bone_shield | EXACT_STACK_OBSERVATION": 114,
      "bone_shield | COUNT_AMBIGUOUS_SINCE_OBSERVATION": 1,
      "bone_shield | WINDOW_ORDER_INVARIANT_SET": 7,
      "bone_shield | PRE_DECISION_WINDOW_TRANSITION": 1,
      // RE-POINTED for M11-B9: Essence's 96 unreconstructed counts become 15
      // exact observations, 9 pinned fresh applications and 72 ambiguous
      // (a lone refresh since the last count — Q2 declined); the 26 window
      // refusals become 12 finite sets and 14 refusals (lone-refresh
      // clusters, a removal, clusters with no exact count before them, and
      // the first application in the track at 2,008,597 — no prior
      // transition is not a proven zero).
      "essence_of_the_blood_queen | EXACT_STACK_OBSERVATION": 15,
      "essence_of_the_blood_queen | EXACT_STACK_APPLICATION": 9,
      "essence_of_the_blood_queen | COUNT_AMBIGUOUS_SINCE_OBSERVATION": 72,
      "essence_of_the_blood_queen | WINDOW_ORDER_INVARIANT_SET": 12,
      "essence_of_the_blood_queen | PRE_DECISION_WINDOW_TRANSITION": 14,
      "essence_of_the_blood_queen | AURA_STATE_UNKNOWN": 1,
    });
    // M11-B9: every set is two exact members, censused as the set, never as either member.
    expect(
      Object.fromEntries(
        coverage.stackValues.filter((row) => row.key.includes("one of")).map((row) => [row.key, row.count]),
      ),
    ).toEqual({
      // M11-B10: Bone Shield's sets are every prefix of its own gain cluster.
      "bone_shield | stack one of {5,6,7,8}": 1,
      "bone_shield | stack one of {7,8,9,10}": 1,
      "bone_shield | stack one of {11,12}": 1,
      "bone_shield | stack one of {8,9,10,11}": 2,
      "bone_shield | stack one of {6,7,8,9}": 1,
      "bone_shield | stack one of {9,11}": 1,
      // The one { 0,1 } rests on the observed removal at 2,071,379; the track's
      // first application at 2,008,597 is refused (silence is not a zero).
      "essence_of_the_blood_queen | stack one of {0,1}": 1,
      "essence_of_the_blood_queen | stack one of {1,2}": 2,
      "essence_of_the_blood_queen | stack one of {2,3}": 2,
      "essence_of_the_blood_queen | stack one of {3,4}": 1,
      "essence_of_the_blood_queen | stack one of {4,5}": 2,
      "essence_of_the_blood_queen | stack one of {5,6}": 2,
      "essence_of_the_blood_queen | stack one of {6,7}": 2,
    });
    for (const entry of analysis.resolved) {
      for (const binding of entry.stacks) {
        if (binding.state !== "BOUND_SET") continue;
        expect(["essence_of_the_blood_queen", "bone_shield"]).toContain(binding.atomName);
        // Every set is strictly ascending, runs from H1 to the last gain's
        // count, and (M11-B10) holds every intermediate gain's count.
        expect(binding.possibleStacks.length).toBeGreaterThanOrEqual(2);
        for (let index = 1; index < binding.possibleStacks.length; index += 1) {
          expect(binding.possibleStacks[index - 1]).toBeLessThan(binding.possibleStacks[index] ?? -1);
        }
        expect(binding.possibleStacks[0]).toBe(binding.windowOrderInvariance.beforeClusterStack);
        expect(binding.possibleStacks[binding.possibleStacks.length - 1]).toBe(
          binding.windowOrderInvariance.afterClusterStack,
        );
        const gainCounts = binding.windowOrderInvariance.cluster.filter(
          (transition) => transition.operation === "APPLIED" && transition.isStackChange,
        );
        if (binding.atomName === "bone_shield") {
          expect(binding.possibleStacks).toHaveLength(gainCounts.length + 1);
          expect(binding.possibleStacks[binding.possibleStacks.length - 1]).toBeLessThanOrEqual(12);
        } else {
          expect(binding.possibleStacks).toHaveLength(2);
          expect(binding.possibleStacks[1]).toBeLessThanOrEqual(7);
        }
        for (const transition of binding.windowOrderInvariance.cluster) {
          expect(transition.leadMs).toBeGreaterThanOrEqual(0);
          expect(transition.leadMs).toBeLessThanOrEqual(50);
          expect(transition.operation).not.toBe("REMOVED");
        }
      }
    }
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
    // RE-POINTED for M11-B8 (Essence only; every other aura's row is B4's).
    // A lone Essence refresh anchors nothing exact: 96 EXACT become 24 (a
    // gain or its same-millisecond companion), 40 BOUNDED (the earlier
    // proven expiry kept as a floor past lone refreshes) and 32 UNKNOWN past
    // every floor; the 26 window refusals become 20 order-invariant floors
    // and 6 refusals (two fresh applications, the expiry at 2,071,379, and
    // three clusters whose chain before them has run out).
    expect(Object.fromEntries(coverage.remainsEvidence.map((row) => [row.key, row.count]))).toEqual({
      // RE-POINTED for M11-B10: Bone Shield admits the B8 floor; seven gain
      // clusters bind it, the first application at 2,004,615 stays refused.
      "bone_shield | EXACT": 11,
      "bone_shield | BOUNDED": 104,
      "bone_shield | WINDOW_ORDER_INVARIANT_BOUNDED": 7,
      "bone_shield | PRE_DECISION_WINDOW_TRANSITION": 1,
      "essence_of_the_blood_queen | EXACT": 24,
      "essence_of_the_blood_queen | BOUNDED": 40,
      "essence_of_the_blood_queen | AMBIGUOUS_REFRESH_BEYOND_BASE_DURATION": 32,
      "essence_of_the_blood_queen | WINDOW_ORDER_INVARIANT_BOUNDED": 20,
      "essence_of_the_blood_queen | PRE_DECISION_WINDOW_TRANSITION": 6,
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
    // No exact remainder or order-invariant edge fell within 50 ms of a pinned
    // threshold, no gap and no contradiction was met: every refusal is a
    // window refusal, a presence refusal, or an Essence floor that has run out.
    expect(
      coverage.remainsEvidence.some((row) => /TOLERANCE|CONTRADICTS|CONTINUITY|NO_GAIN/.test(row.key)),
    ).toBe(false);
    // The cost of the 50 ms window, by lead: the 0 ms leads M11-B2 already
    // refused, plus the 1 ms and 20 ms leads it did not (and one 38 ms Crimson
    // Scourge application ahead of a decision).
    expect(Object.fromEntries(coverage.preDecisionWindowRefusals.map((row) => [row.key, row.count]))).toEqual(
      {
        // M11-B10: the seven 0 ms Bone Shield gain clusters bind
        // order-invariant state; only the 20 ms first application refuses.
        "bone_shield | up | lead 20": 1,
        "bone_shield | stack | lead 20": 1,
        "bone_shield | remains | lead 20": 1,
        // M11-B9: 12 of the 26 Essence stack refusals became finite sets.
        "essence_of_the_blood_queen | stack | lead 0": 13,
        "essence_of_the_blood_queen | remains | lead 0": 6,
        "essence_of_the_blood_queen | stack | lead 1": 1,
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
        // M11-B8: the order-invariant floor is a bound over both orderings, never a KNOWN value,
        // never below either world, and only for the identity whose policy admits it.
        if (binding.proof === "WINDOW_ORDER_INVARIANT_BOUNDED") {
          // Essence since M11-B8; Bone Shield since M11-B10.
          expect(["essence_of_the_blood_queen", "bone_shield"]).toContain(binding.atomName);
          expect(binding.binding.state).toBe("BOUNDED_NUMBER");
          expect(binding.windowOrderInvariance).not.toBeNull();
          if (binding.windowOrderInvariance !== null && binding.remainsMs !== null) {
            const { beforeClusterMs, resetInClusterMs, cluster } = binding.windowOrderInvariance;
            expect(binding.remainsMs).toBe(Math.min(beforeClusterMs, resetInClusterMs));
            expect(binding.remainsMs).toBeGreaterThan(0);
            expect(cluster.length).toBeGreaterThan(0);
            for (const transition of cluster) {
              expect(transition.leadMs).toBeGreaterThanOrEqual(0);
              expect(transition.leadMs).toBeLessThanOrEqual(50);
              expect(transition.operation === "REFRESHED" || transition.isStackChange).toBe(true);
              expect(transition.operation).not.toBe("REMOVED");
            }
          }
        } else {
          expect(binding.windowOrderInvariance).toBeNull();
        }
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
    // The remainder candidates M11-B3 measured (98 and 24) are — since
    // M11-B10 — none for Bone Shield (the six window clusters bind the B8
    // floor), and the one Gift-window Vampiric Strike whose cluster is the
    // fresh application at 2,008,597 for Essence.
    expect(
      coverage.undecidedGcdCandidates.find(
        (row) => row.key === "sanlayn[0] deaths_caress | buff.bone_shield.remains",
      ),
    ).toBeUndefined();
    expect(
      coverage.undecidedGcdCandidates.find(
        (row) => row.key === "san_gift[0] heart_strike | buff.essence_of_the_blood_queen.remains",
      )?.count,
    ).toBe(1);
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

  it("M11-B7 / M11-B8: rejects exactly nine decisions, each from the cast's own exact Rune count, the pinned cost and a Blood Debt count of 10", () => {
    const rejected = analysis.comparisons.filter((comparison) => comparison.outcome === "REJECTED");
    expect(rejected.map((comparison) => comparison.decision.reportTimeMs)).toEqual(
      REJECTED_AFTER_B8.map((row) => row.t),
    );
    for (const expected of REJECTED_AFTER_B8) {
      const comparison = rejected.find((row) => row.decision.reportTimeMs === expected.t);
      expect(comparison, String(expected.t)).toBeDefined();
      if (comparison === undefined) continue;
      // The comparison: the authority selected marrowrend at its exact entry
      // against an observed Heart Strike or Vampiric Strike. Not a score.
      expect(comparison).toMatchObject({
        outcome: "REJECTED",
        basis: "AUTHORITY_SELECTED_DIFFERENT_TOKEN",
        authorityToken: "marrowrend",
        authorityCoverage: "EXACT_ENTRY",
        selectionPrecision: "EXACT_ENTRY",
        rawBlocker: null,
        observedActionRejected: false,
        usabilityProvenance: "OBSERVED_EXECUTION",
      });
      expect(comparison.decision.abilityGameId).toBe(expected.ability);
      expect(comparison.decision.observedToken).toBe("heart_strike");
      const resolved = analysis.resolved.find((entry) => entry.position === comparison.decision.position);
      expect(resolved).toBeDefined();
      if (resolved === undefined) continue;
      // The selection: the ROOT scan resolved to sanlayn[7] with no competing
      // undecided GCD candidate, so no priority short-circuit was bypassed.
      expect(resolved.selection.kind).toBe("ROTATIONAL_GCD_SELECTED");
      expect(resolved.selection.stoppingPoint).toBeNull();
      expect(
        resolved.selection.undecidedCandidates.filter((candidate) => candidate.lane === "GCD_CONSUMING"),
      ).toEqual([]);
      expect(resolved.unselectability.proven).toBe(false);
      // The Rune evidence: the decision cast's OWN exact PRE_COST entry, the
      // pinned cooldown-free record at cost 2, and the modifier excluded by
      // the resolved San'layn tree. The wire's cost field on the entry is the
      // observed cast's (1), and it decides nothing.
      expect(resolved.runeAffordability).toEqual({
        runes: { state: "EXACT", amount: expected.runes, max: 6, wireCost: 1 },
        costModifiersExcluded: true,
        marrowrend: { state: "PINNED", spellId: 195182, runeCost: 2, cooldownFree: true, castTimeMs: 0 },
        evidence: "OWN_PRE_COST_AFFORDABLE",
      });
      const record = analysis.resources.find((row) => row.position === comparison.decision.position);
      expect(record?.runes).toEqual({ state: "EXACT_PRE_COST", amount: expected.runes, max: 6, cost: 1 });
      expect(record?.locator.reportTimeMs).toBe(expected.t);
      // The gate: Blood Debt at exactly 10 from an observed applybuffstack
      // seconds before the decision — never a window refusal, never an
      // application read as a count.
      const bloodDebt = resolved.stacks.find((stack) => stack.atomName === "blood_debt");
      expect(bloodDebt).toMatchObject({ state: "BOUND", stack: 10, proof: "EXACT_STACK_OBSERVATION" });
      if (bloodDebt?.state === "BOUND") {
        expect(bloodDebt.anchor?.reportTimeMs).toBe(expected.bloodDebtAnchor);
        expect(bloodDebt.anchor?.locator.rawType).toBe("applybuffstack");
        // Well outside the 10-49 ms write lag the B6 census measured (the B7
        // seven sit 5-29 s past their anchor; B8's 2,087,470 sits 1,025 ms past
        // the applybuffstack at 2,086,445, still beyond the 702 ms minimum
        // decision gap that census pinned).
        expect(expected.t - expected.bloodDebtAnchor).toBeGreaterThan(702);
      }
    }
  });

  it("M11-B7: keeps the three decisions whose root scan selects marrowrend UNKNOWN while a higher entry diverges (B8 resolved the other two)", () => {
    for (const t of B7_DIVERGENT) {
      const comparison = analysis.comparisons.find((row) => row.decision.reportTimeMs === t);
      expect(comparison, String(t)).toMatchObject({
        outcome: "UNKNOWN",
        basis: "AUTHORITY_SELECTION_UNRESOLVED",
        rawBlocker: "DIVERGENT_GCD_OUTCOMES",
      });
      const resolved = analysis.resolved.find((entry) => entry.position === comparison?.decision.position);
      expect(resolved?.runeAffordability.evidence).toBe("OWN_PRE_COST_AFFORDABLE");
      expect(resolved?.selection.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
      // The competing candidate sits ABOVE sanlayn[7] in priority.
      const undecided =
        resolved?.selection.undecidedCandidates.filter((candidate) => candidate.lane === "GCD_CONSUMING") ??
        [];
      expect(undecided.length).toBeGreaterThan(0);
      expect(undecided.some((candidate) => candidate.at === "sanlayn[7] marrowrend")).toBe(false);
    }
  });

  it("M11-B7: carries no Rune count into the nine Marrowrend blockers whose cast observed none", () => {
    for (const expected of B7_NO_RUNE_OBSERVATION) {
      const comparison = analysis.comparisons.find((row) => row.decision.reportTimeMs === expected.t);
      expect(comparison, String(expected.t)).toMatchObject({ outcome: "UNKNOWN" });
      expect(comparison?.decision.abilityGameId).toBe(expected.ability);
      const resolved = analysis.resolved.find((entry) => entry.position === comparison?.decision.position);
      expect(resolved?.runeAffordability.evidence).toBe("NO_RUNE_OBSERVATION");
      expect(resolved?.runeAffordability.runes.state).toBe("NOT_ESTABLISHED");
      const first = resolved?.selection.undecidedCandidates.find(
        (candidate) => candidate.lane === "GCD_CONSUMING",
      );
      expect(first).toMatchObject({ at: "sanlayn[7] marrowrend", atoms: ["USABILITY:marrowrend"] });
      // A Death Strike carries Runic Power, never Runes; a free Heart Strike carries neither costed.
      const record = analysis.resources.find((row) => row.position === comparison?.decision.position);
      expect(record?.runes.state).toBe("NO_OBSERVATION");
    }
  });

  it("M11-B7: takes the Rune affordability census — own exact counts only, below-cost recorded and never acted on", () => {
    expect(Object.fromEntries(coverage.runeAffordabilityEvidence.map((row) => [row.key, row.count]))).toEqual(
      {
        OWN_PRE_COST_AFFORDABLE: 52,
        OWN_PRE_COST_BELOW_COST: 4,
        NO_RUNE_OBSERVATION: 67,
      },
    );
    expect(coverage.runeAffordabilityEvidence.reduce((sum, row) => sum + row.count, 0)).toBe(123);
    expect(Object.fromEntries(coverage.runeCounts.map((row) => [row.key, row.count]))).toEqual({
      "runes 1": 4,
      "runes 2": 9,
      "runes 3": 20,
      "runes 4": 14,
      "runes 5": 6,
      "runes 6": 3,
    });
    // MODIFIER_UNPROVEN and AUTHORITY_NOT_PINNED never occur: the tree is
    // RESOLVED San'layn and the artifact validates.
    expect(
      coverage.runeAffordabilityEvidence.some((row) =>
        /MODIFIER_UNPROVEN|AUTHORITY_NOT_PINNED/.test(row.key),
      ),
    ).toBe(false);
    for (const entry of analysis.resolved) {
      const fact = entry.runeAffordability;
      const record = analysis.resources.find((row) => row.position === entry.position);
      // Every exact count is the decision cast's own entry, verbatim.
      if (fact.runes.state === "EXACT") {
        expect(record?.runes).toMatchObject({ state: "EXACT_PRE_COST", amount: fact.runes.amount });
      } else {
        expect(record?.runes.state).toBe("NO_OBSERVATION");
      }
      // Below the cost: recorded, and the decision is never REJECTED on it.
      if (fact.evidence === "OWN_PRE_COST_BELOW_COST") {
        expect(fact.runes.state === "EXACT" && fact.runes.amount).toBe(1);
        const comparison = analysis.comparisons.find((row) => row.decision.position === entry.position);
        expect(comparison?.outcome).not.toBe("REJECTED");
        const marrowrend = entry.selection.undecidedCandidates.find((c) => c.at === "sanlayn[7] marrowrend");
        if (marrowrend !== undefined) expect(marrowrend.atoms).toEqual(["USABILITY:marrowrend"]);
      }
    }
  });

  it("binds the exact Bone Shield count at 114 of 123 decisions and refuses the rest for a named reason", () => {
    const tally = new Map<string, number>();
    for (const entry of analysis.resolved) {
      const bone = entry.stacks.find((stack) => stack.atomName === "bone_shield");
      const key =
        bone?.state === "BOUND" || bone?.state === "BOUND_SET"
          ? `${bone.state}/${bone.proof}`
          : `UNBOUND/${bone?.reason ?? "?"}`;
      tally.set(key, (tally.get(key) ?? 0) + 1);
      if (bone?.state === "BOUND") expect(bone.stack).toBeGreaterThan(0);
    }
    // RE-POINTED for M11-B4: the pull Death's Caress (2,004,615), whose Bone
    // Shield application is logged 20 ms BEFORE it, was NO_STACK_OBSERVATION
    // under the 0 ms rule and is refused by the 50 ms window.
    // RE-POINTED for M11-B10: the seven own-gain clusters bind the prefix set.
    expect(Object.fromEntries(tally)).toEqual({
      "BOUND/EXACT_STACK_OBSERVATION": 114,
      "BOUND_SET/WINDOW_ORDER_INVARIANT_SET": 7,
      "UNBOUND/COUNT_AMBIGUOUS_SINCE_OBSERVATION": 1,
      "UNBOUND/PRE_DECISION_WINDOW_TRANSITION": 1,
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

  it("M11-B9: matches exactly three more decisions, each a Vampiric Strike selected at san_gift[3] on a two-member Essence set that decides `stack<7` TRUE in both worlds", () => {
    const expectedSets: Record<
      number,
      { readonly set: readonly number[]; readonly before: number; readonly leadMs: number }
    > = {
      2015029: { set: [5, 6], before: 2012773, leadMs: 0 },
      2103820: { set: [4, 5], before: 2101867, leadMs: 0 },
      2105703: { set: [5, 6], before: 2103820, leadMs: 1 },
    };
    for (const t of B9_MATCH_REPORT_TIMES) {
      const comparison = analysis.comparisons.find((row) => row.decision.reportTimeMs === t);
      expect(comparison, String(t)).toMatchObject({
        outcome: "MATCH",
        basis: "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN",
        authorityToken: "heart_strike",
        authorityCoverage: "EXACT_ENTRY",
        selectionPrecision: "EXACT_ENTRY",
        rawBlocker: null,
      });
      expect(comparison?.decision.abilityGameId).toBe(VAMPIRIC_STRIKE);
      const resolved = analysis.resolved.find((entry) => entry.position === comparison?.decision.position);
      expect(resolved).toBeDefined();
      if (resolved === undefined) continue;
      // The selection: san_gift[3] heart_strike, the observed action, with no
      // competing undecided GCD candidate and the Gift window entered.
      expect(resolved.selection.kind).toBe("ROTATIONAL_GCD_SELECTED");
      expect(resolved.selection.stoppingPoint).toBeNull();
      expect(
        resolved.selection.undecidedCandidates.filter((candidate) => candidate.lane === "GCD_CONSUMING"),
      ).toEqual([]);
      expect(resolved.selection.dispatches.find((step) => step.at === "default[15]")).toMatchObject({
        calleeListName: "san_gift",
        outcome: "RUN_ENTERED_SCAN_ENDS",
      });
      // The stack evidence: the set of BOTH orderings, never one of them.
      const expected = expectedSets[t];
      const stack = resolved.stacks.find((entry) => entry.atomName === "essence_of_the_blood_queen");
      expect(stack).toMatchObject({
        state: "BOUND_SET",
        proof: "WINDOW_ORDER_INVARIANT_SET",
        possibleStacks: expected?.set,
        anchor: { reportTimeMs: expected?.before },
      });
      if (stack?.state === "BOUND_SET") {
        expect(stack.windowOrderInvariance.beforeClusterProof).toBe("EXACT_STACK_OBSERVATION");
        expect(stack.windowOrderInvariance.cluster.map((entry) => entry.leadMs)).toEqual([
          expected?.leadMs,
          expected?.leadMs,
        ]);
        expect(stack.windowOrderInvariance.cluster.map((entry) => entry.operation)).toEqual([
          "APPLIED",
          "REFRESHED",
        ]);
        expect(stack.possibleStacks.every((member) => member < 7)).toBe(true);
      }
      // The entries above san_gift[3] were FALSE from evidence B8 and B5 already
      // established: the Essence floor, the Runic Power deficit, Crimson Scourge down.
      const remains = resolved.remains.find((entry) => entry.atomName === "essence_of_the_blood_queen");
      expect(remains).toMatchObject({ state: "BOUND", proof: "WINDOW_ORDER_INVARIANT_BOUNDED" });
      if (remains?.state === "BOUND") expect(remains.remainsMs ?? 0).toBeGreaterThan(1550);
      expect(resolved.remains.find((entry) => entry.atomName === "crimson_scourge")).toMatchObject({
        state: "BOUND",
        proof: "PROVEN_INACTIVE",
      });
      expect(resolved.runicPower.state).toBe("BOUND");
      if (resolved.runicPower.state === "BOUND" && resolved.runicPower.binding.state === "BOUNDED_NUMBER") {
        expect(resolved.runicPower.binding.atLeast).toBeGreaterThanOrEqual(36);
      }
      expect(resolved.auras.find((entry) => entry.atomName === "gift_of_the_sanlayn")).toMatchObject({
        state: "BOUND",
        up: true,
      });
    }
  });

  it("M11-B9: keeps { 6,7 } UNKNOWN (the worlds disagree), 2,101,867 UNKNOWN (Q2 declined: no count across the Gift-edge refresh) and the exact counts outside the window on Heart Strike's usability", () => {
    for (const t of [2017274, 2106638]) {
      const comparison = analysis.comparisons.find((row) => row.decision.reportTimeMs === t);
      expect(comparison, String(t)).toMatchObject({
        outcome: "UNKNOWN",
        rawBlocker: "DIVERGENT_GCD_OUTCOMES",
      });
      const resolved = analysis.resolved.find((entry) => entry.position === comparison?.decision.position);
      expect(resolved?.stacks.find((entry) => entry.atomName === "essence_of_the_blood_queen")).toMatchObject(
        {
          state: "BOUND_SET",
          possibleStacks: [6, 7],
        },
      );
      const first = resolved?.selection.undecidedCandidates.find(
        (candidate) => candidate.lane === "GCD_CONSUMING",
      );
      expect(first).toMatchObject({
        at: "san_gift[3] heart_strike",
        atoms: ["buff.essence_of_the_blood_queen.stack"],
      });
    }
    const q2 = analysis.comparisons.find((row) => row.decision.reportTimeMs === 2101867);
    expect(q2).toMatchObject({ outcome: "UNKNOWN" });
    const q2Resolved = analysis.resolved.find((entry) => entry.position === q2?.decision.position);
    const q2Stack = q2Resolved?.stacks.find((entry) => entry.atomName === "essence_of_the_blood_queen");
    expect(q2Stack).toMatchObject({ state: "UNBOUND", reason: "PRE_DECISION_WINDOW_TRANSITION" });
    expect(q2Stack?.state === "UNBOUND" && q2Stack.detail).toContain("2099885");
    for (const [t, ability, stack] of [
      [2015770, 195182, 6],
      [2104758, DEATH_STRIKE, 5],
    ] as const) {
      const comparison = analysis.comparisons.find((row) => row.decision.reportTimeMs === t);
      expect(comparison, String(t)).toMatchObject({ outcome: "UNKNOWN" });
      expect(comparison?.decision.abilityGameId).toBe(ability);
      const resolved = analysis.resolved.find((entry) => entry.position === comparison?.decision.position);
      expect(resolved?.stacks.find((entry) => entry.atomName === "essence_of_the_blood_queen")).toMatchObject(
        {
          state: "BOUND",
          stack,
          proof: "EXACT_STACK_OBSERVATION",
        },
      );
      const first = resolved?.selection.undecidedCandidates.find(
        (candidate) => candidate.lane === "GCD_CONSUMING",
      );
      expect(first).toMatchObject({ at: "san_gift[3] heart_strike", atoms: ["USABILITY:heart_strike"] });
    }
    // The build proves the modifier talent by its own entry; no count above 7 was ever bound.
    expect(analysis.build.talents["frenzied_bloodthirst"]).toMatchObject({
      selection: "SELECTED",
      reason: "OWN_ENTRY_SELECTED",
      decidedByEntryId: 117662,
    });
    for (const entry of analysis.resolved) {
      const stack = entry.stacks.find((binding) => binding.atomName === "essence_of_the_blood_queen");
      if (stack?.state === "BOUND") expect(stack.stack).toBeLessThanOrEqual(7);
      expect(stack?.state === "UNBOUND" && stack.reason).not.toBe("COUNT_EXCEEDS_PINNED_MAX");
    }
  });

  it("M11-B10: matches exactly two more decisions, each a Marrowrend selected at sanlayn[7] (Blood Debt 10) once the Bone Shield set, presence and floor make sanlayn[0], [3] and [4] FALSE in every world", () => {
    const expected: Record<
      number,
      {
        readonly set: readonly number[];
        readonly before: number;
        readonly floorMs: number;
        readonly ebqRemains: string;
      }
    > = {
      2043209: { set: [7, 8, 9, 10], before: 2038654, floorMs: 2572, ebqRemains: "UNKNOWN" },
      2124183: { set: [8, 9, 10, 11], before: 2120436, floorMs: 5702, ebqRemains: "BOUNDED" },
    };
    for (const t of B10_MATCH_REPORT_TIMES) {
      const comparison = analysis.comparisons.find((row) => row.decision.reportTimeMs === t);
      expect(comparison, String(t)).toMatchObject({
        outcome: "MATCH",
        basis: "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN",
        authorityToken: "marrowrend",
        authorityCoverage: "EXACT_ENTRY",
        selectionPrecision: "EXACT_ENTRY",
        rawBlocker: null,
      });
      expect(comparison?.decision.abilityGameId).toBe(MARROWREND);
      const resolved = analysis.resolved.find((entry) => entry.position === comparison?.decision.position);
      expect(resolved).toBeDefined();
      if (resolved === undefined) continue;
      // The selection: sanlayn[7] marrowrend, the observed action, with no
      // competing undecided GCD candidate and the sanlayn list entered.
      expect(resolved.selection.kind).toBe("ROTATIONAL_GCD_SELECTED");
      expect(resolved.selection.stoppingPoint).toBeNull();
      expect(
        resolved.selection.undecidedCandidates.filter((candidate) => candidate.lane === "GCD_CONSUMING"),
      ).toEqual([]);
      expect(resolved.selection.dispatches.find((step) => step.at === "default[16]")).toMatchObject({
        calleeListName: "sanlayn",
        outcome: "RUN_ENTERED_SCAN_ENDS",
      });
      expect(resolved.selection.dispatches.find((step) => step.at === "default[15]")).toMatchObject({
        outcome: "RUN_GATE_FALSE_SKIPPED",
      });
      // Bone Shield: the prefix set of the Marrowrend's own three gains, H1
      // from the removebuffstack before them; presence by M4 on both sides;
      // the B8 floor above 1.5 s and outside the tolerance of 3 s.
      const pin = expected[t]!;
      const stack = resolved.stacks.find((entry) => entry.atomName === "bone_shield");
      expect(stack).toMatchObject({
        state: "BOUND_SET",
        proof: "WINDOW_ORDER_INVARIANT_SET",
        possibleStacks: pin.set,
        anchor: { reportTimeMs: pin.before, operation: "REMOVED", isStackChange: true },
        windowOrderInvariance: {
          beforeClusterStack: pin.set[0],
          beforeClusterProof: "EXACT_STACK_OBSERVATION",
          afterClusterStack: pin.set[pin.set.length - 1],
        },
      });
      if (stack?.state === "BOUND_SET") {
        expect(stack.windowOrderInvariance.cluster.map((entry) => entry.leadMs)).toEqual([0, 0, 0, 0, 0]);
        expect(stack.windowOrderInvariance.cluster.map((entry) => entry.operation)).toEqual([
          "APPLIED",
          "APPLIED",
          "REFRESHED",
          "APPLIED",
          "REFRESHED",
        ]);
        expect(stack.possibleStacks.every((member) => member > 1 && member >= 6)).toBe(true);
      }
      expect(resolved.auras.find((entry) => entry.atomName === "bone_shield")).toMatchObject({
        state: "BOUND",
        up: true,
        proof: "WINDOW_ORDER_INVARIANT_PRESENCE",
      });
      const remains = resolved.remains.find((entry) => entry.atomName === "bone_shield");
      expect(remains).toMatchObject({
        state: "BOUND",
        proof: "WINDOW_ORDER_INVARIANT_BOUNDED",
        remainsMs: pin.floorMs,
      });
      // The entries above sanlayn[7]: [1] FALSE on vampiric_strike.remains = 0
      // (the Essence remainder is a floor or UNKNOWN, never read for a
      // verdict), [2] FALSE on the Runic Power deficit, [5] FALSE with
      // Crimson Scourge proven down, [6] FALSE with Boiling Point down; [7]
      // TRUE at Blood Debt exactly 10, the Marrowrend PROVEN_USABLE.
      expect(resolved.remains.find((entry) => entry.atomName === "vampiric_strike")).toMatchObject({
        state: "BOUND",
        proof: "PROVEN_INACTIVE",
      });
      const ebq = resolved.remains.find((entry) => entry.atomName === "essence_of_the_blood_queen");
      expect(ebq?.state === "BOUND" ? ebq.proof : ebq?.reason).toBe(
        pin.ebqRemains === "BOUNDED" ? "GAIN_ANCHOR_BOUNDED" : "AMBIGUOUS_REFRESH_BEYOND_BASE_DURATION",
      );
      expect(resolved.runicPower.state).toBe("BOUND");
      expect(resolved.remains.find((entry) => entry.atomName === "crimson_scourge")).toMatchObject({
        state: "BOUND",
        proof: "PROVEN_INACTIVE",
      });
      expect(resolved.auras.find((entry) => entry.atomName === "boiling_point")).toMatchObject({
        state: "BOUND",
        up: false,
      });
      expect(resolved.stacks.find((entry) => entry.atomName === "blood_debt")).toMatchObject({
        state: "BOUND",
        stack: 10,
      });
      expect(resolved.auras.find((entry) => entry.atomName === "gift_of_the_sanlayn")).toMatchObject({
        state: "BOUND",
        up: false,
      });
    }
  });

  it("M11-B10: keeps the other Bone Shield window decisions UNKNOWN on their next exact blocker, and 2,044,021 on the lone refreshes that break its count", () => {
    const still: Record<
      number,
      { readonly ability: number; readonly set: readonly number[]; readonly first: string }
    > = {
      2057622: { ability: DEATHS_CARESS, set: [11, 12], first: "sanlayn[9] death_strike" },
      2085352: { ability: MARROWREND, set: [8, 9, 10, 11], first: "sanlayn[9] death_strike" },
      2151502: { ability: MARROWREND, set: [6, 7, 8, 9], first: "sanlayn[2] death_strike" },
      2164444: { ability: DEATHS_CARESS, set: [9, 11], first: "sanlayn[2] death_strike" },
    };
    for (const [key, pin] of Object.entries(still)) {
      const t = Number(key);
      const comparison = analysis.comparisons.find((row) => row.decision.reportTimeMs === t);
      expect(comparison, key).toMatchObject({ outcome: "UNKNOWN" });
      expect(comparison?.rawBlocker, key).not.toBeNull();
      expect(comparison?.decision.abilityGameId).toBe(pin.ability);
      const resolved = analysis.resolved.find((entry) => entry.position === comparison?.decision.position);
      expect(resolved?.stacks.find((entry) => entry.atomName === "bone_shield")).toMatchObject({
        state: "BOUND_SET",
        possibleStacks: pin.set,
      });
      expect(resolved?.auras.find((entry) => entry.atomName === "bone_shield")).toMatchObject({
        state: "BOUND",
        up: true,
        proof: "WINDOW_ORDER_INVARIANT_PRESENCE",
      });
      expect(resolved?.remains.find((entry) => entry.atomName === "bone_shield")).toMatchObject({
        state: "BOUND",
        proof: "WINDOW_ORDER_INVARIANT_BOUNDED",
      });
      // Bone Shield is passed: no undecided candidate names a Bone Shield atom.
      const candidates =
        resolved?.selection.undecidedCandidates.filter((c) => c.lane === "GCD_CONSUMING") ?? [];
      expect(candidates.some((c) => c.atoms.some((atom) => atom.includes("bone_shield")))).toBe(false);
      expect(candidates[0]?.at).toBe(pin.first);
    }
    // 2,044,021: not a window case — the count after the Marrowrend's 12 is
    // broken by the three lone refreshes at 2,043,229 (the mirror at cap).
    const q = analysis.comparisons.find((row) => row.decision.reportTimeMs === 2044021);
    expect(q).toMatchObject({ outcome: "UNKNOWN" });
    const qResolved = analysis.resolved.find((entry) => entry.position === q?.decision.position);
    const qStack = qResolved?.stacks.find((entry) => entry.atomName === "bone_shield");
    expect(qStack).toMatchObject({ state: "UNBOUND", reason: "COUNT_AMBIGUOUS_SINCE_OBSERVATION" });
    expect(qStack?.state === "UNBOUND" && qStack.detail).toContain("2043229");
    expect(qResolved?.selection.undecidedCandidates.find((c) => c.lane === "GCD_CONSUMING")).toMatchObject({
      at: "sanlayn[0] deaths_caress",
      atoms: ["buff.bone_shield.stack"],
    });
    // 2,004,615: the track's first application, 20 ms ahead — refused on
    // every Bone Shield binding, AMBIGUOUS_INITIAL_STATE before it; no zero.
    const first = analysis.comparisons.find((row) => row.decision.reportTimeMs === 2004615);
    const firstResolved = analysis.resolved.find((entry) => entry.position === first?.decision.position);
    expect(firstResolved?.stacks.find((entry) => entry.atomName === "bone_shield")).toMatchObject({
      state: "UNBOUND",
      reason: "PRE_DECISION_WINDOW_TRANSITION",
      windowTransition: { leadMs: 20, operation: "APPLIED", isStackChange: false },
    });
    expect(firstResolved?.auras.find((entry) => entry.atomName === "bone_shield")).toMatchObject({
      state: "UNBOUND",
      reason: "PRE_DECISION_WINDOW_TRANSITION",
    });
    // No Bone Shield set or window presence anywhere rests on a removal in the cluster.
    for (const entry of analysis.resolved) {
      const stack = entry.stacks.find((binding) => binding.atomName === "bone_shield");
      if (stack?.state === "BOUND_SET") {
        expect(stack.windowOrderInvariance.cluster.every((t) => t.operation !== "REMOVED")).toBe(true);
      }
    }
  });
});

describe("the second subject", () => {
  it("reproduces the same stopping points on a different report, pull and boss", () => {
    const analysis = analyzed(corpusState(GTKB));
    // RE-POINTED for M11-B4: one Death Strike (2,421,923) resolves in the opener.
    // Unchanged by M11-B5: the opener's Runic Power is exact or bounded at every
    // decision, and the next obstacle is the Blood Debt stack or an Essence window.
    // Unchanged by M11-B7: no opener decision has Blood Debt at 10 with a
    // Rune-costed cast, so the Marrowrend proof selects nothing there.
    // Unchanged in outcome by M11-B8: the six Gift-window Vampiric Strikes
    // whose Essence remainder is now a floor advance to san_gift[2] on the
    // Crimson Scourge / Visceral Strength remainders, still UNKNOWN.
    expect(analysis.coverage).toMatchObject({ eligibleDecisions: 21, match: 1, rejected: 0, unknown: 20 });
    expect(
      Object.fromEntries(analysis.coverage.runeAffordabilityEvidence.map((row) => [row.key, row.count])),
    ).toEqual({ OWN_PRE_COST_AFFORDABLE: 11, NO_RUNE_OBSERVATION: 10 });
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
    ).toBe(2);
    // Bone Shield's remainder is EXACT at 20 of 21 opener decisions (the
    // first in-fight stack gain anchors it) and, since M11-B10, the B8 floor
    // at the one window cluster (2,427,294).
    expect(
      analysis.coverage.undecidedGcdCandidates.some(
        (row) => row.key === "sanlayn[0] deaths_caress | buff.bone_shield.remains",
      ),
    ).toBe(false);
    expect(Object.fromEntries(analysis.coverage.remainsEvidence.map((row) => [row.key, row.count]))).toEqual({
      "bone_shield | EXACT": 20,
      "bone_shield | WINDOW_ORDER_INVARIANT_BOUNDED": 1,
      "essence_of_the_blood_queen | EXACT": 6,
      "essence_of_the_blood_queen | BOUNDED": 7,
      "essence_of_the_blood_queen | WINDOW_ORDER_INVARIANT_BOUNDED": 6,
      "essence_of_the_blood_queen | PRE_DECISION_WINDOW_TRANSITION": 1,
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
