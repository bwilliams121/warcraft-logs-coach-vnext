/**
 * M11-B8: Essence of the Blood Queen's `buff.<name>.remains` under the strict
 * lone-refresh policy (G1) and the order-invariant bound inside the 50 ms
 * pre-decision window (G2) — over synthetic fights and the committed Blood
 * corpus evidence.
 *
 * Negative first: a lone refresh of Essence is never an exact anchor — not
 * the one at a Gift of the San'layn edge, not the one 0-1 ms before a
 * Vampiric Strike, not any other; once the earlier proven expiry has run out
 * nothing positive is invented; a cluster holding a plain application, any
 * removal, or a chain the ordinary rules cannot establish stays refused; the
 * bound is `min(H1, H2)` and never the larger world; an edge within 50 ms of
 * a pinned threshold decides nothing; the count and the presence stay
 * refused inside the window; no other identity's behaviour moves; the window
 * constant and the tolerance constant are untouched.
 */

import { describe, expect, it } from "vitest";

import {
  BLOOD_AURA_IDENTITIES,
  bloodAuraIdentityFor,
  BONE_SHIELD_BUFF_SPELL_ID,
  CRIMSON_SCOURGE_BUFF_SPELL_ID,
  ESSENCE_OF_THE_BLOOD_QUEEN_BUFF_SPELL_ID,
  VISCERAL_STRENGTH_BUFF_SPELL_ID,
} from "../../src/data/game/deathknight-blood-aura-authority.js";
import { bloodAuraDurationForAtom } from "../../src/data/game/deathknight-blood-aura-durations.js";
import type { HeroTreeResolution, TalentResolution } from "../../src/data/game/talent-selection.js";
import { inclusiveRange } from "../../src/engine/evidence/coverage.js";
import { createCombatState, type CombatState } from "../../src/engine/state/combat-state.js";
import {
  bindBloodAura,
  bindBloodStack,
  BLOOD_PRE_DECISION_WINDOW_MS,
  EXACT_COUNT_ATOMS,
} from "../../src/specs/deathknight/blood/aura-bindings.js";
import {
  bindBloodRemains,
  BLOOD_REMAINS_THRESHOLD_TOLERANCE_MS,
  bloodRemainsBindingsFrom,
} from "../../src/specs/deathknight/blood/aura-remains.js";
import { pinnedRemainsThresholdSecondsFor } from "../../src/specs/deathknight/blood/remains-thresholds.js";
import { corpusBundleState, corpusState, positionOfCast } from "../support/corpus/fight.js";
import {
  auraEvent,
  castEvent,
  observableCategory,
  partialCategory,
  syntheticFight,
  type SyntheticFightOptions,
} from "../support/synthetic-fight.js";

const ACTOR = 14;
const EBQ = ESSENCE_OF_THE_BLOOD_QUEEN_BUFF_SPELL_ID;
const EBQ_ATOM = "essence_of_the_blood_queen";
const EBQ_MS = 25_000;
const DEATH_STRIKE = 49998;
const VAMPIRIC_STRIKE = 433895;
const BLOOD45 = "wcl-blood-death-knight-a7r6-rotational-45s";
const OPENER = "wcl-blood-death-knight-gtkb-opener";
const BUNDLE = [
  BLOOD45,
  "wcl-blood-death-knight-a7r6-rotational-165s.seg-45-105",
  "wcl-blood-death-knight-a7r6-rotational-165s.seg-105-165",
];

const selected = (simcName: string): TalentResolution => ({
  simcName,
  selection: "SELECTED",
  reason: "OWN_ENTRY_SELECTED",
  identity: null,
  decidedByEntryId: 1,
});
const SANLAYN: HeroTreeResolution = {
  state: "RESOLVED",
  simcName: "sanlayn",
  subTreeId: 31,
  decidedByEntryIds: [117630],
};
const TALENTS: Readonly<Record<string, TalentResolution>> = {
  vampiric_strike: selected("vampiric_strike"),
  visceral_strength: selected("visceral_strength"),
  gift_of_the_sanlayn: selected("gift_of_the_sanlayn"),
  dancing_rune_weapon: selected("dancing_rune_weapon"),
  vampiric_blood: selected("vampiric_blood"),
};

type Operation = "APPLIED" | "REFRESHED" | "REMOVED";
const aura = (
  ordinal: number,
  reportTimeMs: number,
  operation: Operation,
  stacks: number | null = null,
  abilityGameId = EBQ,
) =>
  auraEvent({
    ordinal,
    reportTimeMs,
    operation,
    auraClass: "BUFF",
    isStackChange: stacks !== null,
    stacks,
    sourceActorId: ACTOR,
    targetActorId: ACTOR,
    abilityGameId,
  });
const cast = (ordinal: number, reportTimeMs: number, abilityGameId = VAMPIRIC_STRIKE) =>
  castEvent({
    ordinal,
    reportTimeMs,
    castPhase: "COMPLETE",
    sourceActorId: ACTOR,
    targetActorId: 22,
    abilityGameId,
  });

/** Complete AURAS and CASTS over [1,000 .. 90,000] ms: long enough for two Essence durations. */
function stateOf(events: SyntheticFightOptions["events"], options: SyntheticFightOptions = {}) {
  return createCombatState(
    syntheticFight({ observedCategories: ["AURAS", "CASTS"], endTimeMs: 90_000, events, ...options }),
  );
}
const input = (state: CombatState, position: number) => ({
  state,
  actorId: ACTOR,
  position,
  talents: TALENTS,
  heroTree: SANLAYN,
});
const remainsAt = (state: CombatState, position: number, atomName = EBQ_ATOM) =>
  bindBloodRemains(input(state, position), atomName);

function at(state: CombatState, reportTimeMs: number, abilityGameId: number): number {
  const found = positionOfCast(state, { actorId: ACTOR, reportTimeMs, abilityGameId });
  if (!found.ok) throw new Error(found.detail);
  return found.position;
}

describe("the pinned policy and constants", () => {
  it("Essence alone reads a lone refresh as UNPROVEN_CAUSE and admits the order-invariant window bound; every other identity keeps the M11-B4 reading", () => {
    expect(bloodAuraIdentityFor(EBQ_ATOM)?.remainsPolicy).toEqual({
      loneRefresh: "UNPROVEN_CAUSE",
      windowOrderInvariantBound: true,
    });
    for (const identity of BLOOD_AURA_IDENTITIES) {
      if (identity.atomName === EBQ_ATOM) continue;
      expect(identity.remainsPolicy, identity.atomName).toEqual({
        loneRefresh: "PINNED_TRIGGER_RESET",
        windowOrderInvariantBound: false,
      });
    }
  });

  it("changes neither the 50 ms window nor the 50 ms tolerance, and the pinned Essence duration is exactly 25,000 ms", () => {
    expect(BLOOD_PRE_DECISION_WINDOW_MS).toBe(50);
    expect(BLOOD_REMAINS_THRESHOLD_TOLERANCE_MS).toBe(50);
    expect(bloodAuraDurationForAtom(EBQ_ATOM)).toMatchObject({
      baseDurationMs: 20_000,
      finalDurationMs: EBQ_MS,
      remainsModel: "FIXED_DURATION_RESET_ON_GAIN",
      refreshBehavior: "DURATION",
    });
    expect(pinnedRemainsThresholdSecondsFor(EBQ_ATOM)).toEqual([1.5, 8]);
  });
});

describe("G1: a lone Essence refresh is of unproven cause", () => {
  it("an exact gain, a later lone refresh, a decision before the old expiry: bounded from the gain, never exact from the refresh", () => {
    const state = stateOf([
      aura(0, 1000, "APPLIED"),
      aura(1, 10_000, "REFRESHED"),
      cast(2, 20_000, DEATH_STRIKE),
    ]);
    const binding = remainsAt(state, 2);
    expect(binding).toMatchObject({
      state: "BOUND",
      proof: "GAIN_ANCHOR_BOUNDED",
      remainsMs: 6000,
      binding: { state: "BOUNDED_NUMBER", atLeast: 6, reason: "STATE_NOT_ESTABLISHED" },
      anchor: { reportTimeMs: 1000, operation: "APPLIED" },
      walkedThrough: 1,
    });
    // Never the 15 s a "the refresh reset it" reading would give.
    expect(binding.state === "BOUND" && binding.binding.state).not.toBe("KNOWN_NUMBER");
    expect(binding.state === "BOUND" && binding.basis).toContain("unproven cause");
  });

  it("the same with the refresh 0-1 ms before a Vampiric Strike cast: cast proximity names no cause", () => {
    const state = stateOf([
      aura(0, 1000, "APPLIED"),
      aura(1, 9999, "REFRESHED"),
      cast(2, 10_000, VAMPIRIC_STRIKE),
      cast(3, 20_000, DEATH_STRIKE),
    ]);
    expect(remainsAt(state, 3)).toMatchObject({
      state: "BOUND",
      proof: "GAIN_ANCHOR_BOUNDED",
      remainsMs: 6000,
      anchor: { reportTimeMs: 1000 },
    });
  });

  it("once the old exact chain has run out, nothing positive is invented: AMBIGUOUS_REFRESH_BEYOND_BASE_DURATION, though presence is ACTIVE", () => {
    const state = stateOf([
      aura(0, 1000, "APPLIED"),
      aura(1, 20_000, "REFRESHED"),
      cast(2, 30_000, DEATH_STRIKE),
    ]);
    expect(remainsAt(state, 2)).toMatchObject({
      state: "UNBOUND",
      reason: "AMBIGUOUS_REFRESH_BEYOND_BASE_DURATION",
    });
    expect(bloodRemainsBindingsFrom([remainsAt(state, 2)])).toEqual([
      { name: EBQ_ATOM, remainsSeconds: { state: "UNKNOWN_NUMBER", reason: "STATE_NOT_ESTABLISHED" } },
    ]);
    // The refresh proves the aura was up at 20,000 and nothing removed it; that is presence, not a remainder.
    expect(bindBloodAura(input(state, 2), EBQ_ATOM)).toMatchObject({
      state: "BOUND",
      up: true,
      proof: "OBSERVED",
    });
  });

  it("walks back through consecutive lone refreshes to the last gain that anchors", () => {
    const state = stateOf([
      aura(0, 1000, "APPLIED"),
      aura(1, 3000, "APPLIED", 2),
      aura(2, 3000, "REFRESHED"),
      aura(3, 8000, "REFRESHED"),
      aura(4, 12_000, "REFRESHED"),
      cast(5, 20_000, DEATH_STRIKE),
    ]);
    expect(remainsAt(state, 5)).toMatchObject({
      state: "BOUND",
      proof: "GAIN_ANCHOR_BOUNDED",
      remainsMs: 8000,
      anchor: { reportTimeMs: 3000 },
      walkedThrough: 2,
    });
  });

  it("a stack gain with its same-millisecond refresh companion is still an exact anchor: the gain proves the trigger", () => {
    const state = stateOf([
      aura(0, 1000, "APPLIED"),
      aura(1, 10_000, "APPLIED", 2),
      aura(2, 10_000, "REFRESHED"),
      cast(3, 20_000, DEATH_STRIKE),
    ]);
    expect(remainsAt(state, 3)).toMatchObject({
      state: "BOUND",
      proof: "GAIN_ANCHOR_EXACT",
      remainsMs: 15_000,
      anchor: { reportTimeMs: 10_000 },
      binding: { state: "KNOWN_NUMBER", value: 15 },
    });
  });

  it("a refresh 1 ms AFTER a stack gain is not that gain's companion: the gain anchors, the refresh keeps it as a floor", () => {
    const state = stateOf([
      aura(0, 1000, "APPLIED"),
      aura(1, 10_000, "APPLIED", 7),
      aura(2, 10_001, "REFRESHED"),
      cast(3, 20_000, DEATH_STRIKE),
    ]);
    expect(remainsAt(state, 3)).toMatchObject({
      state: "BOUND",
      proof: "GAIN_ANCHOR_BOUNDED",
      remainsMs: 15_000,
      anchor: { reportTimeMs: 10_000, isStackChange: true },
    });
  });

  it("a lone refresh with no earlier gain anchors nothing: NO_GAIN_OBSERVED", () => {
    const state = stateOf([aura(0, 10_000, "REFRESHED"), cast(1, 20_000, DEATH_STRIKE)]);
    expect(remainsAt(state, 1)).toMatchObject({ state: "UNBOUND", reason: "NO_GAIN_OBSERVED" });
  });

  it("identity isolation: Bone Shield, Crimson Scourge and Visceral Strength lone refreshes still anchor exactly", () => {
    const cases: readonly [string, number, number][] = [
      ["bone_shield", BONE_SHIELD_BUFF_SPELL_ID, 30_000],
      ["crimson_scourge", CRIMSON_SCOURGE_BUFF_SPELL_ID, 15_000],
      ["visceral_strength", VISCERAL_STRENGTH_BUFF_SPELL_ID, 12_000],
    ];
    for (const [atomName, abilityGameId, durationMs] of cases) {
      const state = stateOf([
        aura(0, 1000, "APPLIED", atomName === "bone_shield" ? 6 : null, abilityGameId),
        aura(1, 10_000, "REFRESHED", null, abilityGameId),
        cast(2, 12_000, DEATH_STRIKE),
      ]);
      expect(remainsAt(state, 2, atomName), atomName).toMatchObject({
        state: "BOUND",
        proof: "GAIN_ANCHOR_EXACT",
        remainsMs: durationMs - 2000,
        anchor: { reportTimeMs: 10_000, operation: "REFRESHED" },
      });
    }
  });
});

describe("G2: the order-invariant bound inside the 50 ms window", () => {
  /** Applied at 1,000; a stack gain with its refresh companion `leadMs` before the decision at 5,000. */
  function clusterAtLead(leadMs: number, extra: SyntheticFightOptions = {}) {
    return stateOf(
      [
        aura(0, 1000, "APPLIED"),
        aura(1, 5000 - leadMs, "APPLIED", 2),
        aura(2, 5000 - leadMs, "REFRESHED"),
        cast(3, 5000, VAMPIRIC_STRIKE),
      ],
      extra,
    );
  }

  it.each([0, 1, 50])(
    "binds min(H1, H2) at a %d ms lead, with both worlds recorded and no ordering chosen",
    (leadMs) => {
      const state = clusterAtLead(leadMs);
      const binding = remainsAt(state, 3);
      // H1: the application at 1,000 + 25,000 - 5,000 = 21,000; H2: 25,000 - lead.
      expect(binding).toMatchObject({
        state: "BOUND",
        proof: "WINDOW_ORDER_INVARIANT_BOUNDED",
        remainsMs: 21_000,
        binding: { state: "BOUNDED_NUMBER", atLeast: 21, reason: "STATE_NOT_ESTABLISHED" },
        anchor: { reportTimeMs: 1000, operation: "APPLIED" },
        windowOrderInvariance: {
          beforeClusterMs: 21_000,
          beforeClusterProof: "GAIN_ANCHOR_EXACT",
          resetInClusterMs: EBQ_MS - leadMs,
          cluster: [
            { reportTimeMs: 5000 - leadMs, operation: "APPLIED", isStackChange: true, leadMs },
            { reportTimeMs: 5000 - leadMs, operation: "REFRESHED", isStackChange: false, leadMs },
          ],
        },
      });
      expect(binding.state === "BOUND" && binding.binding.state).not.toBe("KNOWN_NUMBER");
      // The count is never exact inside the window either: since M11-B9 it is
      // the finite set both orderings leave (tests/unit/m11b9-blood-ebq-stack.test.ts).
      expect(bindBloodStack(input(state, 3), EBQ_ATOM)).toMatchObject({
        state: "BOUND_SET",
        possibleStacks: [1, 2],
      });
    },
  );

  it("at a 51 ms lead the window does not apply and the ordinary path binds the exact companion-anchored remainder", () => {
    const state = clusterAtLead(51);
    expect(remainsAt(state, 3)).toMatchObject({
      state: "BOUND",
      proof: "GAIN_ANCHOR_EXACT",
      remainsMs: EBQ_MS - 51,
      windowOrderInvariance: null,
    });
  });

  it("a lone refresh in the cluster is also a safe shape: the floor is the chain before it", () => {
    const state = stateOf([
      aura(0, 1000, "APPLIED"),
      aura(1, 5000, "REFRESHED"),
      cast(2, 5000, VAMPIRIC_STRIKE),
    ]);
    expect(remainsAt(state, 2)).toMatchObject({
      state: "BOUND",
      proof: "WINDOW_ORDER_INVARIANT_BOUNDED",
      remainsMs: 21_000,
      windowOrderInvariance: { beforeClusterMs: 21_000, resetInClusterMs: 25_000 },
    });
  });

  it("H1 below the threshold is the bound: a large H2 never lifts it (min, not max)", () => {
    // Applied at 1,000; the cluster and the decision at 24,800: H1 = 1,200 ms, H2 = 25,000 ms.
    const state = stateOf([
      aura(0, 1000, "APPLIED"),
      aura(1, 24_800, "APPLIED", 2),
      cast(2, 24_800, VAMPIRIC_STRIKE),
    ]);
    expect(remainsAt(state, 2)).toMatchObject({
      state: "BOUND",
      proof: "WINDOW_ORDER_INVARIANT_BOUNDED",
      remainsMs: 1200,
      binding: { state: "BOUNDED_NUMBER", atLeast: 1.2 },
      windowOrderInvariance: { beforeClusterMs: 1200, resetInClusterMs: 25_000 },
    });
  });

  it("H1 from a bounded chain (an earlier lone refresh) is still a valid floor, recorded as such", () => {
    const state = stateOf([
      aura(0, 1000, "APPLIED"),
      aura(1, 3000, "REFRESHED"),
      aura(2, 5000, "APPLIED", 2),
      cast(3, 5000, VAMPIRIC_STRIKE),
    ]);
    expect(remainsAt(state, 3)).toMatchObject({
      state: "BOUND",
      proof: "WINDOW_ORDER_INVARIANT_BOUNDED",
      remainsMs: 21_000,
      windowOrderInvariance: { beforeClusterMs: 21_000, beforeClusterProof: "GAIN_ANCHOR_BOUNDED" },
    });
  });

  it("the floor reaches the evaluator as a BOUNDED_NUMBER in seconds and nothing else", () => {
    expect(bloodRemainsBindingsFrom([remainsAt(clusterAtLead(0), 3)])).toEqual([
      {
        name: EBQ_ATOM,
        remainsSeconds: { state: "BOUNDED_NUMBER", atLeast: 21, reason: "STATE_NOT_ESTABLISHED" },
      },
    ]);
  });

  describe("refusals", () => {
    const refused = { state: "UNBOUND", reason: "PRE_DECISION_WINDOW_TRANSITION" };

    it("a plain application in the cluster: the two worlds are inactive and fully active, so there is no floor", () => {
      const state = stateOf([aura(0, 5000, "APPLIED"), cast(1, 5000, VAMPIRIC_STRIKE)]);
      const binding = remainsAt(state, 1);
      expect(binding).toMatchObject({ ...refused, windowTransition: { leadMs: 0, operation: "APPLIED" } });
      expect(binding.state === "UNBOUND" && binding.detail).toContain("APPLIED");
      // Even with a proven-inactive chain before it (a removal), a plain application is refused.
      const reapplied = stateOf([
        aura(0, 1000, "APPLIED"),
        aura(1, 3000, "REMOVED"),
        aura(2, 4990, "APPLIED"),
        cast(3, 5000, VAMPIRIC_STRIKE),
      ]);
      expect(remainsAt(reapplied, 3)).toMatchObject({ ...refused, windowTransition: { leadMs: 10 } });
    });

    it("a removal in the cluster", () => {
      const state = stateOf([
        aura(0, 1000, "APPLIED"),
        aura(1, 4990, "REMOVED"),
        cast(2, 5000, DEATH_STRIKE),
      ]);
      expect(remainsAt(state, 2)).toMatchObject({
        ...refused,
        windowTransition: { leadMs: 10, operation: "REMOVED" },
      });
    });

    it("a stack removal in the cluster", () => {
      const state = stateOf([
        aura(0, 1000, "APPLIED"),
        aura(1, 2000, "APPLIED", 2),
        aura(2, 4990, "REMOVED", 1),
        cast(3, 5000, DEATH_STRIKE),
      ]);
      expect(remainsAt(state, 3)).toMatchObject({
        ...refused,
        windowTransition: { leadMs: 10, operation: "REMOVED", isStackChange: true },
      });
    });

    it("a safe shape beside an unsafe one in the same cluster is refused whole", () => {
      const state = stateOf([
        aura(0, 1000, "APPLIED"),
        aura(1, 4980, "REMOVED"),
        aura(2, 4990, "APPLIED"),
        aura(3, 5000, "APPLIED", 2),
        cast(4, 5000, VAMPIRIC_STRIKE),
      ]);
      expect(remainsAt(state, 4)).toMatchObject(refused);
    });

    it("H1 unavailable: the cluster's stack gain is the first observation of the aura (ambiguous initial state)", () => {
      const state = stateOf([aura(0, 5000, "APPLIED", 2), cast(1, 5000, VAMPIRIC_STRIKE)]);
      const binding = remainsAt(state, 1);
      expect(binding).toMatchObject(refused);
      expect(binding.state === "UNBOUND" && binding.detail).toContain("chain before the cluster");
    });

    it("H1 unavailable: the chain before the cluster has run out past a lone refresh", () => {
      const state = stateOf([
        aura(0, 1000, "APPLIED"),
        aura(1, 20_000, "REFRESHED"),
        aura(2, 40_000, "REFRESHED"),
        cast(3, 40_000, VAMPIRIC_STRIKE),
      ]);
      const binding = remainsAt(state, 3);
      expect(binding).toMatchObject(refused);
      expect(binding.state === "UNBOUND" && binding.detail).toContain(
        "AMBIGUOUS_REFRESH_BEYOND_BASE_DURATION",
      );
    });

    it("H1 unavailable: an AURAS coverage gap between the gain and the cluster", () => {
      const state = clusterAtLead(0, {
        categories: {
          AURAS: partialCategory([inclusiveRange(1000, 2000), inclusiveRange(3000, 90_000)]),
          CASTS: observableCategory(inclusiveRange(1000, 90_000)),
        },
      });
      const binding = remainsAt(state, 3);
      expect(binding).toMatchObject(refused);
      // Presence at the cluster's first transition refuses first (M4 will not carry the
      // application's anchor across the gap), and H1 inherits that refusal verbatim.
      expect(binding.state === "UNBOUND" && binding.detail).toContain("AURA_STATE_UNKNOWN");
    });

    it("H1 unavailable: the exact chain before the cluster says the aura expired while the cluster proves it up — a contradiction, never a clamp", () => {
      const state = stateOf([
        aura(0, 1000, "APPLIED"),
        aura(1, 30_000, "REFRESHED"),
        cast(2, 30_000, VAMPIRIC_STRIKE),
      ]);
      const binding = remainsAt(state, 2);
      expect(binding).toMatchObject(refused);
      expect(binding.state === "UNBOUND" && binding.detail).toContain("DURATION_MODEL_CONTRADICTS_EVIDENCE");
    });

    it("the floor has run out: a bounded chain that reaches the cluster's first transition with 10 ms left, at a 10 ms lead", () => {
      // Applied at 1,000 (expiry 26,000); a lone refresh at 20,000 keeps that as a floor;
      // the cluster at 25,990 (lead 10) leaves H1 = 10 - 10 = 0 at the decision.
      const state = stateOf([
        aura(0, 1000, "APPLIED"),
        aura(1, 20_000, "REFRESHED"),
        aura(2, 25_990, "APPLIED", 2),
        cast(3, 26_000, VAMPIRIC_STRIKE),
      ]);
      const binding = remainsAt(state, 3);
      expect(binding).toMatchObject({ ...refused, windowTransition: { leadMs: 10 } });
      expect(binding.state === "UNBOUND" && binding.detail).toContain("run out");
    });

    it.each([
      [1500, 1.5],
      [1549, 1.5],
      [1451, 1.5],
      [8000, 8],
      [8050, 8],
      [7950, 8],
    ])(
      "an edge of %d ms lies within the tolerance of the %d s threshold and decides nothing",
      (edgeMs, thresholdSeconds) => {
        // Applied at 1,000; the cluster and the decision at 1,000 + 25,000 - edge.
        const t = 1000 + EBQ_MS - edgeMs;
        const state = stateOf([
          aura(0, 1000, "APPLIED"),
          aura(1, t, "APPLIED", 2),
          cast(2, t, VAMPIRIC_STRIKE),
        ]);
        expect(remainsAt(state, 2)).toMatchObject({
          state: "UNBOUND",
          reason: "WITHIN_TIMING_TOLERANCE_OF_THRESHOLD",
          thresholdMargin: {
            thresholdSeconds,
            remainsMs: edgeMs,
            marginMs: Math.abs(edgeMs - thresholdSeconds * 1000),
          },
          windowTransition: { leadMs: 0 },
        });
      },
    );

    it.each([1551, 1449, 8051, 7949])(
      "an edge of %d ms lies outside every tolerance band and binds",
      (edgeMs) => {
        const t = 1000 + EBQ_MS - edgeMs;
        const state = stateOf([
          aura(0, 1000, "APPLIED"),
          aura(1, t, "APPLIED", 2),
          cast(2, t, VAMPIRIC_STRIKE),
        ]);
        expect(remainsAt(state, 2)).toMatchObject({
          state: "BOUND",
          proof: "WINDOW_ORDER_INVARIANT_BOUNDED",
          remainsMs: edgeMs,
        });
      },
    );

    it("identity isolation: a Bone Shield cluster inside the window stays refused (the policy does not admit the bound)", () => {
      const state = stateOf([
        aura(0, 1000, "APPLIED", 6, BONE_SHIELD_BUFF_SPELL_ID),
        aura(1, 5000, "APPLIED", 7, BONE_SHIELD_BUFF_SPELL_ID),
        aura(2, 5000, "REFRESHED", null, BONE_SHIELD_BUFF_SPELL_ID),
        cast(3, 5000, 195182),
      ]);
      expect(remainsAt(state, 3, "bone_shield")).toMatchObject({
        ...refused,
        windowTransition: { leadMs: 0 },
        detail: null,
      });
    });
  });
});

describe("the Essence stack after M11-B9 (the B8 boundary, re-pinned)", () => {
  it("Essence is an exact-count atom since M11-B9; a count above the DBC maximum needs the modifier talent SELECTED, which this synthetic build does not resolve", () => {
    expect(EXACT_COUNT_ATOMS).toContain(EBQ_ATOM);
    const outside = stateOf([
      aura(0, 1000, "APPLIED"),
      aura(1, 2000, "APPLIED", 7),
      cast(2, 5000, DEATH_STRIKE),
    ]);
    expect(bindBloodStack(input(outside, 2), EBQ_ATOM)).toMatchObject({
      state: "UNBOUND",
      reason: "COUNT_EXCEEDS_PINNED_MAX",
    });
  });
});

describe("over the committed evidence", () => {
  it("bundle: the Vampiric Strike at 2,087,470 binds the floor 11,070 ms (H1 from the application at 2,073,540; H2 25,000) and the count stays refused", () => {
    const state = corpusBundleState(BUNDLE, []);
    const position = at(state, 2_087_470, VAMPIRIC_STRIKE);
    expect(remainsAt(state, position)).toMatchObject({
      state: "BOUND",
      proof: "WINDOW_ORDER_INVARIANT_BOUNDED",
      remainsMs: 11_070,
      binding: { state: "BOUNDED_NUMBER", atLeast: 11.07 },
      anchor: { reportTimeMs: 2_073_540, operation: "APPLIED", isStackChange: false },
      windowOrderInvariance: {
        beforeClusterMs: 11_070,
        beforeClusterProof: "GAIN_ANCHOR_EXACT",
        resetInClusterMs: 25_000,
        cluster: [{ reportTimeMs: 2_087_470, operation: "APPLIED", isStackChange: true, leadMs: 0 }],
      },
    });
    // M11-B9: the count is the set { 1, 2 } — the pinned fresh-application 1
    // before the cluster, the wire's 2 after it — never one of them.
    expect(bindBloodStack(input(state, position), EBQ_ATOM)).toMatchObject({
      state: "BOUND_SET",
      possibleStacks: [1, 2],
    });
  });

  it("bundle: the Vampiric Strike at 2,093,667 binds the floor 18,803 ms past a 1 ms lead cluster of stack gain and refresh", () => {
    const state = corpusBundleState(BUNDLE, []);
    const position = at(state, 2_093_667, VAMPIRIC_STRIKE);
    expect(remainsAt(state, position)).toMatchObject({
      state: "BOUND",
      proof: "WINDOW_ORDER_INVARIANT_BOUNDED",
      remainsMs: 18_803,
      anchor: { reportTimeMs: 2_087_470, operation: "APPLIED", isStackChange: true },
      windowOrderInvariance: {
        beforeClusterMs: 18_803,
        beforeClusterProof: "GAIN_ANCHOR_EXACT",
        resetInClusterMs: 24_999,
        cluster: [
          { reportTimeMs: 2_093_666, operation: "APPLIED", isStackChange: true, leadMs: 1 },
          { reportTimeMs: 2_093_666, operation: "REFRESHED", isStackChange: false, leadMs: 1 },
        ],
      },
    });
  });

  it("45 s: the Heart Strike at 2,020,278 no longer rests on the lone refresh at the Gift edge (2,019,763): a floor from the stack gain at 2,017,274", () => {
    const state = corpusState(BLOOD45);
    const position = at(state, 2_020_278, 206930);
    expect(remainsAt(state, position)).toMatchObject({
      state: "BOUND",
      proof: "GAIN_ANCHOR_BOUNDED",
      remainsMs: 21_996,
      anchor: { reportTimeMs: 2_017_274 },
      // Three lone refreshes walked through: 2,018,024 and 2,019,524 (each 0 ms
      // before a Vampiric Strike) and 2,019,763 (the Gift removal) — none anchors.
      walkedThrough: 3,
    });
  });

  it("45 s: the Death Strike at 2,012,014 still binds exactly 24,127 ms: the refresh at 2,011,141 is the companion of the stack gain there", () => {
    const state = corpusState(BLOOD45);
    expect(remainsAt(state, at(state, 2_012_014, DEATH_STRIKE))).toMatchObject({
      state: "BOUND",
      proof: "GAIN_ANCHOR_EXACT",
      remainsMs: 24_127,
      anchor: { reportTimeMs: 2_011_141 },
    });
  });

  it("opener: the Death Strike at 2,429,596 no longer rests on the refresh at the Gift edge (2,429,050): a floor from the stack gain at 2,428,095", () => {
    const state = corpusState(OPENER);
    expect(remainsAt(state, at(state, 2_429_596, DEATH_STRIKE))).toMatchObject({
      state: "BOUND",
      proof: "GAIN_ANCHOR_BOUNDED",
      remainsMs: 23_499,
      anchor: { reportTimeMs: 2_428_095, isStackChange: true },
    });
  });

  it("bundle: the Heart Strike at 2,042,440 sits past every floor the stack gain at 2,017,274 could give — UNKNOWN, not a 25 s reset from the refreshes since", () => {
    const state = corpusBundleState(BUNDLE, []);
    expect(remainsAt(state, at(state, 2_042_440, 206930))).toMatchObject({
      state: "UNBOUND",
      reason: "AMBIGUOUS_REFRESH_BEYOND_BASE_DURATION",
    });
  });
});
