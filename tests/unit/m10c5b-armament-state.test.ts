/**
 * M10-C5 Phase B2: the Lightsmith alternation, `next_armament`, over the REAL
 * composed 165-second fight and its gap bundle.
 *
 * The rule under test is the pinned one (`paladin-protection-armament-
 * authority.ts`): the value is KNOWN only from a Holy Armaments HARDCAST
 * strictly before the decision under COMPLETE cast coverage since — never
 * from a buff transition, never from a later cast, never across a declared
 * hole. The capture holds four hardcasts (SW, HB, SW, HB) and four
 * proc-or-wings-sourced armament applications with no cast event; each
 * expectation below is one of those facts read back.
 */

import { describe, expect, it } from "vitest";

import {
  ARMAMENT_BUFF_SPELL_IDS,
  ARMAMENT_CLAIMS,
  ARMAMENT_HARDCASTS,
  ARMAMENT_HOLY_BULWARK,
  ARMAMENT_SACRED_WEAPON,
} from "../../src/data/game/paladin-protection-armament-authority.js";
import {
  SC_PALADIN_CPP_SHA256,
  SC_PALADIN_PROTECTION_CPP_SHA256,
  protectionTransitionContractFor,
} from "../../src/data/game/paladin-protection-transition-authority.js";
import { armamentStateAt } from "../../src/specs/paladin/protection/armament-state.js";
import { resolveProtectionAtoms } from "../../src/specs/paladin/protection/resolver.js";
import { NEXT_ARMAMENT } from "../../src/specs/paladin/protection/vocabulary.js";
import { targetRef } from "../../src/engine/normalization/normalized-events.js";
import { corpusBundleState, positionOfCast } from "../support/corpus/fight.js";

const PP45 = "wcl-protection-paladin-a7r6-rotational-45s";
const SEG = "wcl-protection-paladin-a7r6-rotational-165s";
const ALL = [PP45, `${SEG}.seg-45-60`, `${SEG}.seg-60-90`, `${SEG}.seg-90-120`, `${SEG}.seg-120-165`];
const GAP_PARTS = [PP45, `${SEG}.seg-45-60`, `${SEG}.seg-120-165`];
const HOLE = { fromReportTimeMs: 2064590, toReportTimeMs: 2124589 };
const TANK = 7;
const [HOLY_BULWARK, SACRED_WEAPON, JUDGMENT, BLESSED_HAMMER, DIVINE_TOLL] = [
  432459, 432472, 275779, 204019, 375576,
];

function at(state: ReturnType<typeof corpusBundleState>, reportTimeMs: number, abilityGameId: number) {
  const found = positionOfCast(state, { actorId: TANK, reportTimeMs, abilityGameId });
  if (!found.ok) throw new Error(found.detail);
  return found.position;
}

describe("the pinned armament authority", () => {
  it("names the two hardcast identities, their buffs, and the source lines the rule rests on", () => {
    expect(ARMAMENT_HOLY_BULWARK).toBe(0);
    expect(ARMAMENT_SACRED_WEAPON).toBe(1);
    expect(
      ARMAMENT_HARDCASTS.map((h) => [
        h.abilityGameId,
        h.usedArmament,
        h.nextArmament,
        h.ownBuffAbilityGameId,
      ]),
    ).toEqual([
      [432459, 0, 1, 432496],
      [432472, 1, 0, 432502],
    ]);
    expect([...ARMAMENT_BUFF_SPELL_IDS]).toEqual([432496, 432502]);
    expect(new Set(ARMAMENT_CLAIMS.map((claim) => claim.sourceSha256))).toEqual(
      new Set([SC_PALADIN_CPP_SHA256, SC_PALADIN_PROTECTION_CPP_SHA256]),
    );
    expect(
      ARMAMENT_CLAIMS.some((claim) => claim.lines === "2638-2754" && claim.claim.includes("LS_HARDCAST")),
    ).toBe(true);
  });

  it("the Shield of the Righteous contract no longer claims to change next_armament", () => {
    // The M10-C4 claim — that a Divine Inspiration proc flips the alternation —
    // contradicted sc_paladin.cpp:2641/2752-2753 and is withdrawn at Phase B.
    const contract = protectionTransitionContractFor("shield_of_the_righteous");
    expect(contract?.requiresUnbound?.map((atom) => atom.name)).not.toContain("next_armament");
  });
});

describe("over the composed 165-second fight", () => {
  const state = corpusBundleState(ALL, []);

  it("anchors on the last HARDCAST strictly before the decision, alternating SW -> HB -> SW -> HB", () => {
    // Each hardcast is itself UNKNOWN-or-anchored-on-the-previous-one: its own
    // press is never consulted for its own decision.
    expect(
      armamentStateAt({ state, actorId: TANK, position: at(state, 2066110, SACRED_WEAPON) }),
    ).toMatchObject({
      state: "UNKNOWN",
      reason: "NO_HARDCAST_IN_EVIDENCE",
    });
    expect(
      armamentStateAt({ state, actorId: TANK, position: at(state, 2075421, HOLY_BULWARK) }),
    ).toMatchObject({
      state: "KNOWN",
      nextArmament: 0,
      anchorReportTimeMs: 2066110,
      anchorAbilityGameId: SACRED_WEAPON,
    });
    expect(
      armamentStateAt({ state, actorId: TANK, position: at(state, 2125600, SACRED_WEAPON) }),
    ).toMatchObject({
      state: "KNOWN",
      nextArmament: 1,
      anchorReportTimeMs: 2075421,
      anchorAbilityGameId: HOLY_BULWARK,
    });
    expect(
      armamentStateAt({ state, actorId: TANK, position: at(state, 2167398, HOLY_BULWARK) }),
    ).toMatchObject({
      state: "KNOWN",
      nextArmament: 0,
      anchorReportTimeMs: 2125600,
      anchorAbilityGameId: SACRED_WEAPON,
    });
    expect(armamentStateAt({ state, actorId: TANK, position: at(state, 2168432, JUDGMENT) })).toMatchObject({
      state: "KNOWN",
      nextArmament: 1,
      anchorReportTimeMs: 2167398,
      anchorAbilityGameId: HOLY_BULWARK,
    });
  });

  it("a buff-only armament application never anchors: the proc at 2,131,424 leaves the value from 2,125,600", () => {
    // Between the Sacred Weapon hardcast at 2,125,600 and the Blessed Hammer
    // at 2,132,185 a Sacred Weapon buff (432502) is applied at 2,131,424 with
    // no cast event — Divine Inspiration. The anchor does not move.
    const applied = state.auras
      .groupFor({
        target: targetRef(TANK, null),
        abilityGameId: 432502,
        auraClass: "BUFF",
        source: { kind: "ANY_SOURCE" },
      })
      ?.tracks.flatMap((track) => track.positions)
      .map((position) => state.eventAt(position))
      .filter((event) => event?.kind === "AURA" && event.reportTimeMs === 2131424);
    expect(applied?.length).toBeGreaterThan(0);
    expect(
      armamentStateAt({ state, actorId: TANK, position: at(state, 2132185, BLESSED_HAMMER) }),
    ).toMatchObject({
      state: "KNOWN",
      nextArmament: 0,
      anchorReportTimeMs: 2125600,
    });
    // And the Sentinel-sourced Sacred Weapon at 2,088,344 (LS_WINGS) is not an anchor either.
    expect(
      armamentStateAt({ state, actorId: TANK, position: at(state, 2088835, DIVINE_TOLL) }),
    ).toMatchObject({
      state: "KNOWN",
      nextArmament: 1,
      anchorReportTimeMs: 2075421,
    });
  });

  it("a later hardcast never speaks about an earlier decision", () => {
    // The first Sacred Weapon hardcast at 2,066,110 proves next_armament was
    // sacred_weapon at that press; no decision before it may use that.
    for (const [t, ability] of [
      [2005436, JUDGMENT],
      [2026655, DIVINE_TOLL],
      [2065086, 31935],
    ] as const) {
      expect(armamentStateAt({ state, actorId: TANK, position: at(state, t, ability) })).toEqual({
        state: "UNKNOWN",
        reason: "NO_HARDCAST_IN_EVIDENCE",
        stoppedAtPosition: null,
      });
    }
  });

  it("the resolver binds the atom from the state machine, and refuses with STATE_NOT_ESTABLISHED otherwise", () => {
    const talents = (() => {
      for (const position of state.positionsOfKind("COMBATANT_INFO")) {
        const event = state.eventAt(position);
        if (event?.kind === "COMBATANT_INFO" && event.snapshot.actorId === TANK)
          return event.snapshot.talentTree.map((entry) => ({ id: entry.id, nodeId: entry.nodeId }));
      }
      throw new Error("no combatant info");
    })();
    const bound = (t: number, ability: number) =>
      resolveProtectionAtoms({
        state,
        actorId: TANK,
        position: at(state, t, ability),
        observedTalents: talents,
        actionTokens: [],
      }).specAtoms.bound.find((entry) => entry.key === NEXT_ARMAMENT)?.value;
    expect(bound(2126631, JUDGMENT)).toEqual({
      kind: "MAGNITUDE",
      binding: { state: "KNOWN_NUMBER", value: 0 },
    });
    expect(bound(2168432, JUDGMENT)).toEqual({
      kind: "MAGNITUDE",
      binding: { state: "KNOWN_NUMBER", value: 1 },
    });
    expect(bound(2005436, JUDGMENT)).toEqual({
      kind: "MAGNITUDE",
      binding: { state: "UNKNOWN_NUMBER", reason: "STATE_NOT_ESTABLISHED" },
    });
  });
});

describe("over the gap bundle (60–120 s declared missing)", () => {
  const state = corpusBundleState(GAP_PARTS, [HOLE]);

  it("a hole between the anchor and the decision resets the value to UNKNOWN; an anchor after the hole holds", () => {
    // The hardcasts at 2,066,110 and 2,075,421 are not in evidence at all.
    expect(armamentStateAt({ state, actorId: TANK, position: at(state, 2125600, SACRED_WEAPON) })).toEqual({
      state: "UNKNOWN",
      reason: "NO_HARDCAST_IN_EVIDENCE",
      stoppedAtPosition: null,
    });
    expect(armamentStateAt({ state, actorId: TANK, position: at(state, 2126631, JUDGMENT) })).toMatchObject({
      state: "KNOWN",
      nextArmament: 0,
      anchorReportTimeMs: 2125600,
    });
  });

  it("with the anchor retained but a declared hole between it and the decision, the claim fails its gate", () => {
    // Omit only the 90–120 s segment: the Holy Bulwark hardcast at 2,075,421
    // IS in evidence, and the walk from the Sacred Weapon hardcast at
    // 2,125,600 finds it — but CASTS coverage over [2,075,421 .. 2,125,600]
    // is PARTIAL, so the value is not carried across the hole.
    const oneHole = corpusBundleState(
      [PP45, `${SEG}.seg-45-60`, `${SEG}.seg-60-90`, `${SEG}.seg-120-165`],
      [{ fromReportTimeMs: 2094590, toReportTimeMs: 2124589 }],
    );
    const result = armamentStateAt({
      state: oneHole,
      actorId: TANK,
      position: at(oneHole, 2125600, SACRED_WEAPON),
    });
    expect(result).toMatchObject({ state: "UNKNOWN", reason: "INSUFFICIENT_COVERAGE" });
    if (result.state === "UNKNOWN") {
      expect(result.stoppedAtPosition).toBe(at(oneHole, 2075421, HOLY_BULWARK));
    }
    // A decision BEFORE the hole still carries the value: nothing between the
    // anchor and it is missing.
    expect(
      armamentStateAt({ state: oneHole, actorId: TANK, position: at(oneHole, 2088835, DIVINE_TOLL) }),
    ).toMatchObject({
      state: "KNOWN",
      nextArmament: 1,
      anchorReportTimeMs: 2075421,
    });
  });
});
