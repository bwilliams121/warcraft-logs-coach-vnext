/**
 * M11-B7: Marrowrend's Rune affordability — one positive proof from the
 * decision cast's own exact PRE_COST Rune count, the pinned cost and a
 * proven modifier exclusion, and nothing else.
 *
 * NEGATIVE CASES FIRST. No Rune value is carried from one decision to the
 * next, no `previous - cost`, no regeneration, no reading of a nearby event,
 * no trust in the wire's cost field, no proof for any token but marrowrend,
 * no proof under an unresolved or Deathbringer hero tree, no proof from a
 * record that is not the pinned cooldown-free shape, and — deliberately —
 * NO negative proof: a count below the cost is recorded and proves nothing.
 */

import { describe, expect, it } from "vitest";

import {
  EXTERMINATE_RUNE_COST_MODIFIER,
  MARROWREND_RUNE_COST_CLAIMS,
  MARROWREND_SPELL_ID,
  marrowrendRuneCostModifiersExcluded,
  SC_SPELL_DATA_INC_SHA256,
} from "../../src/data/game/deathknight-blood-rune-cost-authority.js";
import {
  bloodRuneCostOf,
  bloodRunePowerType,
  bloodSpenderCostsFor,
  resetBloodDeathKnightSpenderCostCache,
} from "../../src/data/game/deathknight-blood-spender-costs.js";
import type { HeroTreeResolution } from "../../src/data/game/talent-selection.js";
import { createCombatState, type CombatState } from "../../src/engine/state/combat-state.js";
import type { AplAction } from "../../src/simc/apl-authority.js";
import { resolveBloodUsability } from "../../src/specs/deathknight/blood/action-profile.js";
import { initialBloodState } from "../../src/specs/deathknight/blood/first-gcd-state.js";
import { pinnedBloodDeathKnightAuthority } from "../../src/specs/deathknight/blood/pinned-authority.js";
import { bloodResourceOn, bloodResourceWireTypes } from "../../src/specs/deathknight/blood/resources.js";
import {
  BLOOD_RUNE_AFFORDABILITY_EVIDENCE,
  bloodRuneAffordability,
  MARROWREND_TOKEN,
  marrowrendAffordabilityProven,
  marrowrendPinOf,
  NO_RUNE_AFFORDABILITY,
  pinnedMarrowrend,
  type BloodRuneAffordability,
} from "../../src/specs/deathknight/blood/rune-affordability.js";
import { positionOfCast } from "../support/corpus/fight.js";
import {
  attachedResources,
  auraEvent,
  castEvent,
  classResource,
  resourceChangeEvent,
  syntheticFight,
  type SyntheticFightOptions,
} from "../support/synthetic-fight.js";

const ACTOR = 14;
const OTHER_ACTOR = 7;
const TARGET = 22;
const HEART_STRIKE = 206930;
const VAMPIRIC_STRIKE = 433895;
const DEATH_STRIKE = 49998;
const BLOOD_BOIL = 50842;
const MARROWREND = MARROWREND_SPELL_ID;

const WIRE = bloodResourceWireTypes();
if (WIRE === null) throw new Error("the Blood resource wire contracts are not pinned");
const RUNES = WIRE.runes;
const RP = WIRE.runicPower;

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
  decidedByEntryIds: [1],
};
const UNKNOWN_TREE: HeroTreeResolution = { state: "UNKNOWN" };
const CONTRADICTORY_TREE: HeroTreeResolution = { state: "CONTRADICTORY", subTreeIds: [31, 33] };

/** A cast carrying the actor's own attached snapshot, exactly as M3 normalizes one. */
const cast = (
  ordinal: number,
  reportTimeMs: number,
  ability: number,
  classResources: ReturnType<typeof classResource>[],
  actorId = ACTOR,
) =>
  castEvent({
    ordinal,
    reportTimeMs,
    castPhase: "COMPLETE",
    sourceActorId: actorId,
    targetActorId: TARGET,
    abilityGameId: ability,
    attachedResources: attachedResources({ side: "SOURCE", actorId, classResources }),
  });
const runeCosted = (ordinal: number, t: number, ability: number, amount: number, cost = 1) =>
  cast(ordinal, t, ability, [classResource(RUNES, amount, { max: 6, cost })]);
const rpCosted = (ordinal: number, t: number, amount: number) =>
  cast(ordinal, t, DEATH_STRIKE, [classResource(RP, amount, { max: 1250, cost: 450 })]);
const uncosted = (ordinal: number, t: number, ability: number, rpAmount: number) =>
  cast(ordinal, t, ability, [classResource(RP, rpAmount, { max: 1250 })]);

function stateOf(events: SyntheticFightOptions["events"], options: Partial<SyntheticFightOptions> = {}) {
  return createCombatState(
    syntheticFight({
      observedCategories: ["RESOURCES", "CASTS", "AURAS"],
      endTimeMs: 60_000,
      events,
      ...options,
    }),
  );
}
function at(state: CombatState, reportTimeMs: number, abilityGameId: number): number {
  const found = positionOfCast(state, { actorId: ACTOR, reportTimeMs, abilityGameId });
  if (!found.ok) throw new Error(found.detail);
  return found.position;
}
const runesAt = (state: CombatState, position: number) => bloodResourceOn(state, position, ACTOR, RUNES);
const factAt = (state: CombatState, position: number, tree: HeroTreeResolution = SANLAYN) =>
  bloodRuneAffordability(runesAt(state, position), tree);

function actionAt(listName: string, ordinal: number): AplAction {
  const loaded = pinnedBloodDeathKnightAuthority();
  if (!loaded.ok) throw new Error("authority did not load");
  const action = loaded.authority.actions.find(
    (entry) => entry.listName === listName && entry.priorityOrdinal === ordinal,
  );
  if (action === undefined) throw new Error(`no entry ${listName}[${String(ordinal)}]`);
  return action;
}
const MARROWREND_AT_7 = actionAt("sanlayn", 7);
const MARROWREND_AT_4 = actionAt("sanlayn", 4);
/** Usability of an entry at a decision whose observed cast is a Heart Strike (so nothing is proven by observation). */
const usability = (action: AplAction, fact: BloodRuneAffordability) =>
  resolveBloodUsability(initialBloodState(), action, HEART_STRIKE, [], fact);

// ---------------------------------------------------------------------------
// The pinned authority
// ---------------------------------------------------------------------------

describe("the pinned Marrowrend Rune cost", () => {
  it("is the artifact's one Marrowrend record: spell 195182, a single Rune row at 2, every cooldown scalar zero, instant", () => {
    resetBloodDeathKnightSpenderCostCache();
    const records = bloodSpenderCostsFor(MARROWREND_TOKEN);
    expect(records).toHaveLength(1);
    const record = records[0];
    if (record === undefined) throw new Error("unreachable");
    expect(record.spellId).toBe(MARROWREND_SPELL_ID);
    expect(bloodRunePowerType()).toBe(5);
    expect(record.powerRows.filter((row) => row.powerType === 5)).toHaveLength(1);
    expect(bloodRuneCostOf(record)).toBe(2);
    expect(record).toMatchObject({
      cooldownMs: 0,
      chargeCooldownMs: 0,
      internalCooldownMs: 0,
      categoryCooldownMs: 0,
      castTimeMs: 0,
    });
    expect(pinnedMarrowrend()).toEqual({
      state: "PINNED",
      spellId: 195182,
      runeCost: 2,
      cooldownFree: true,
      castTimeMs: 0,
    });
    // The Runic Power row on the same spell is the gain, not a cost, and is never the Rune cost.
    expect(record.powerRows.find((row) => row.powerType === 6)?.cost).toBe(-200);
  });

  it("records Exterminate as the sole modifier, Deathbringer-owned, with its DBC effect rows and the pinned digests", () => {
    expect(EXTERMINATE_RUNE_COST_MODIFIER).toMatchObject({
      spellIds: [441416, 447954],
      effectIds: [1136665, 1146159],
      costPercent: -50,
      ownedByHeroTree: "deathbringer",
    });
    for (const claim of [...EXTERMINATE_RUNE_COST_MODIFIER.claims, ...MARROWREND_RUNE_COST_CLAIMS]) {
      expect(claim.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(claim.claim.length).toBeGreaterThan(40);
    }
    expect(SC_SPELL_DATA_INC_SHA256).toBe("d8e3d1970520f2161de6d5a59aa5ea0e7c81eaef14c6bc980d5a208ed33b4c62");
  });

  it("excludes the modifier only from a RESOLVED non-Deathbringer tree — never from UNKNOWN, CONTRADICTORY or Deathbringer", () => {
    expect(marrowrendRuneCostModifiersExcluded(SANLAYN)).toBe(true);
    expect(marrowrendRuneCostModifiersExcluded(DEATHBRINGER)).toBe(false);
    expect(marrowrendRuneCostModifiersExcluded(UNKNOWN_TREE)).toBe(false);
    expect(marrowrendRuneCostModifiersExcluded(CONTRADICTORY_TREE)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The fact: own-cast exact PRE_COST only
// ---------------------------------------------------------------------------

describe("the affordability fact", () => {
  it("is OWN_PRE_COST_AFFORDABLE at exact 2, 3 and 6 Runes under a resolved San'layn tree, and proves Marrowrend usable", () => {
    for (const amount of [2, 3, 6]) {
      const state = stateOf([runeCosted(0, 10_000, HEART_STRIKE, amount)]);
      const fact = factAt(state, at(state, 10_000, HEART_STRIKE));
      expect(fact).toEqual({
        runes: { state: "EXACT", amount, max: 6, wireCost: 1 },
        costModifiersExcluded: true,
        marrowrend: { state: "PINNED", spellId: 195182, runeCost: 2, cooldownFree: true, castTimeMs: 0 },
        evidence: "OWN_PRE_COST_AFFORDABLE",
      });
      expect(marrowrendAffordabilityProven(fact)).toBe(true);
      expect(usability(MARROWREND_AT_7, fact)).toEqual({ kind: "PROVEN_USABLE" });
      expect(usability(MARROWREND_AT_4, fact)).toEqual({ kind: "PROVEN_USABLE" });
    }
  });

  it("proves nothing at 0 or 1 Rune: OWN_PRE_COST_BELOW_COST is recorded and usability stays UNKNOWN (Candidate B deferred)", () => {
    for (const amount of [0, 1]) {
      // A 1-cost cast at 0 runes does not occur on the wire; the fact is total over the observation regardless.
      const state = stateOf([runeCosted(0, 10_000, HEART_STRIKE, amount)]);
      const fact = factAt(state, at(state, 10_000, HEART_STRIKE));
      expect(fact.evidence).toBe("OWN_PRE_COST_BELOW_COST");
      expect(fact.runes).toEqual({ state: "EXACT", amount, max: 6, wireCost: 1 });
      expect(marrowrendAffordabilityProven(fact)).toBe(false);
      const verdict = usability(MARROWREND_AT_7, fact);
      expect(verdict).toEqual({ kind: "UNKNOWN" });
      expect(verdict.kind).not.toBe("PROVEN_UNUSABLE");
    }
  });

  it("is NO_RUNE_OBSERVATION on a Death Strike, a Blood Boil and an uncosted Heart Strike", () => {
    const state = stateOf([
      rpCosted(0, 10_000, 900),
      uncosted(1, 11_000, BLOOD_BOIL, 500),
      uncosted(2, 12_000, HEART_STRIKE, 540),
    ]);
    for (const [t, ability] of [
      [10_000, DEATH_STRIKE],
      [11_000, BLOOD_BOIL],
      [12_000, HEART_STRIKE],
    ] as const) {
      const fact = factAt(state, at(state, t, ability));
      expect(fact.evidence).toBe("NO_RUNE_OBSERVATION");
      expect(fact.runes.state).toBe("NOT_ESTABLISHED");
      expect(marrowrendAffordabilityProven(fact)).toBe(false);
      expect(usability(MARROWREND_AT_7, fact)).toEqual({ kind: "UNKNOWN" });
    }
  });

  it("refuses a type-5 entry that is not PRE_COST: EVENT_ASSOCIATED on an uncosted cast, POST_CHANGE on a resourcechange", () => {
    const state = stateOf([
      // An uncosted attachment of the Rune type: EVENT_ASSOCIATED, ordering unestablished.
      cast(0, 10_000, HEART_STRIKE, [classResource(RUNES, 4, { max: 6 })]),
      // A standalone change of the Rune type (never on the real wire): POST_CHANGE, not a cast's own PRE_COST.
      resourceChangeEvent({
        ordinal: 1,
        reportTimeMs: 11_000,
        sourceActorId: ACTOR,
        targetActorId: ACTOR,
        abilityGameId: HEART_STRIKE,
        resourceType: RUNES,
        resourceChange: 1,
        maxResourceAmount: 6,
        attachedResources: attachedResources({
          side: "SOURCE",
          actorId: ACTOR,
          classResources: [classResource(RUNES, 5, { max: 6 })],
        }),
      }),
    ]);
    const eventAssociated = runesAt(state, at(state, 10_000, HEART_STRIKE));
    expect(eventAssociated).toMatchObject({ state: "NO_OBSERVATION" });
    if (eventAssociated.state === "NO_OBSERVATION")
      expect(eventAssociated.reason).toContain("EVENT_ASSOCIATED");
    expect(bloodRuneAffordability(eventAssociated, SANLAYN).evidence).toBe("NO_RUNE_OBSERVATION");
    const postChange = bloodResourceOn(state, 1, ACTOR, RUNES);
    expect(postChange).toMatchObject({ state: "NO_OBSERVATION" });
    if (postChange.state === "NO_OBSERVATION") expect(postChange.reason).toContain("POST_CHANGE");
    expect(bloodRuneAffordability(postChange, SANLAYN).evidence).toBe("NO_RUNE_OBSERVATION");
  });

  it("reads the own-cast entry and nothing at the same millisecond: not an aura, not a change, not another actor's Runes", () => {
    const state = stateOf([
      auraEvent({
        ordinal: 0,
        reportTimeMs: 10_000,
        operation: "APPLIED",
        auraClass: "BUFF",
        sourceActorId: ACTOR,
        targetActorId: ACTOR,
        abilityGameId: 195181,
        isStackChange: true,
        stacks: 7,
      }),
      resourceChangeEvent({
        ordinal: 1,
        reportTimeMs: 10_000,
        sourceActorId: ACTOR,
        targetActorId: ACTOR,
        abilityGameId: 210738,
        resourceType: RP,
        resourceChange: 2,
        maxResourceAmount: 1250,
        attachedResources: attachedResources({
          side: "SOURCE",
          actorId: ACTOR,
          classResources: [classResource(RP, 700, { max: 1250 })],
        }),
      }),
      // Another actor's Rune-costed cast at the same millisecond, at 6 Runes.
      cast(2, 10_000, HEART_STRIKE, [classResource(RUNES, 6, { max: 6, cost: 1 })], OTHER_ACTOR),
      // The decision: OUR cast, at 1 Rune.
      runeCosted(3, 10_000, HEART_STRIKE, 1, 1),
      rpCosted(4, 10_000, 900),
    ]);
    const rebuilt = state;
    const heartStrike = factAt(rebuilt, at(rebuilt, 10_000, HEART_STRIKE));
    expect(heartStrike.runes).toEqual({ state: "EXACT", amount: 1, max: 6, wireCost: 1 });
    expect(heartStrike.evidence).toBe("OWN_PRE_COST_BELOW_COST");
    expect(usability(MARROWREND_AT_7, heartStrike)).toEqual({ kind: "UNKNOWN" });
    // The Death Strike at the same millisecond observes no Runes at all — not the Heart Strike's 1, not the other actor's 6.
    const deathStrike = factAt(rebuilt, at(rebuilt, 10_000, DEATH_STRIKE));
    expect(deathStrike.evidence).toBe("NO_RUNE_OBSERVATION");
  });

  it("withholds the proof under an UNKNOWN, CONTRADICTORY or Deathbringer tree — MODIFIER_UNPROVEN, never a guess", () => {
    const state = stateOf([runeCosted(0, 10_000, HEART_STRIKE, 6)]);
    const position = at(state, 10_000, HEART_STRIKE);
    for (const tree of [UNKNOWN_TREE, CONTRADICTORY_TREE, DEATHBRINGER]) {
      const fact = factAt(state, position, tree);
      expect(fact.evidence).toBe("MODIFIER_UNPROVEN");
      expect(fact.costModifiersExcluded).toBe(false);
      expect(fact.runes).toEqual({ state: "EXACT", amount: 6, max: 6, wireCost: 1 });
      expect(marrowrendAffordabilityProven(fact)).toBe(false);
      expect(usability(MARROWREND_AT_7, fact)).toEqual({ kind: "UNKNOWN" });
    }
  });
});

// ---------------------------------------------------------------------------
// No carry, no ledger, no regeneration
// ---------------------------------------------------------------------------

describe("what is never derived", () => {
  it("carries nothing: a Death Strike one GCD after a 4-Rune Heart Strike observes no Runes, not 3, 4, 5 or 6", () => {
    const state = stateOf([
      runeCosted(0, 10_000, HEART_STRIKE, 4),
      rpCosted(1, 11_000, 900),
      uncosted(2, 12_000, BLOOD_BOIL, 600),
      rpCosted(3, 13_000, 700),
    ]);
    expect(factAt(state, at(state, 10_000, HEART_STRIKE)).runes).toMatchObject({ state: "EXACT", amount: 4 });
    for (const [t, ability] of [
      [11_000, DEATH_STRIKE],
      [12_000, BLOOD_BOIL],
      [13_000, DEATH_STRIKE],
    ] as const) {
      const fact = factAt(state, at(state, t, ability));
      expect(fact.runes.state).toBe("NOT_ESTABLISHED");
      expect(fact.evidence).toBe("NO_RUNE_OBSERVATION");
      expect(usability(MARROWREND_AT_7, fact)).toEqual({ kind: "UNKNOWN" });
    }
  });

  it("keeps no ledger: observed 4 at cost 1 never becomes 3 at the next decision, and a later 6 never flows backwards", () => {
    const state = stateOf([
      runeCosted(0, 10_000, MARROWREND, 4, 2),
      rpCosted(1, 11_000, 900),
      runeCosted(2, 12_000, HEART_STRIKE, 6),
    ]);
    const between = factAt(state, at(state, 11_000, DEATH_STRIKE));
    expect(between.runes.state).toBe("NOT_ESTABLISHED");
    expect(between.evidence).toBe("NO_RUNE_OBSERVATION");
    // Each Rune-costed cast reads exactly its own entry, whatever its neighbours say.
    expect(factAt(state, at(state, 10_000, MARROWREND)).runes).toMatchObject({ amount: 4, wireCost: 2 });
    expect(factAt(state, at(state, 12_000, HEART_STRIKE)).runes).toMatchObject({ amount: 6, wireCost: 1 });
  });

  it("models no regeneration: a long silence after a 1-Rune cast does not raise the next decision's count", () => {
    const state = stateOf([runeCosted(0, 10_000, HEART_STRIKE, 1), rpCosted(1, 40_000, 900)]);
    const later = factAt(state, at(state, 40_000, DEATH_STRIKE));
    expect(later.runes.state).toBe("NOT_ESTABLISHED");
    expect(later.evidence).toBe("NO_RUNE_OBSERVATION");
  });
});

// ---------------------------------------------------------------------------
// The allowlist, the wire, the authority guard
// ---------------------------------------------------------------------------

describe("the proof's boundaries", () => {
  it("applies to marrowrend only: heart_strike, deaths_caress and any_dnd stay UNKNOWN at 6 Runes", () => {
    const state = stateOf([runeCosted(0, 10_000, HEART_STRIKE, 6)]);
    const fact = factAt(state, at(state, 10_000, HEART_STRIKE));
    expect(fact.evidence).toBe("OWN_PRE_COST_AFFORDABLE");
    // Observed ability here is a Death Strike so the Heart Strike entries are not observation-proven either.
    const against = (action: AplAction) =>
      resolveBloodUsability(initialBloodState(), action, DEATH_STRIKE, [], fact);
    expect(against(actionAt("sanlayn", 8)).kind).toBe("UNKNOWN"); // heart_strike
    expect(against(actionAt("sanlayn", 11)).kind).toBe("UNKNOWN"); // heart_strike,if=rune>=2
    expect(against(actionAt("sanlayn", 0)).kind).toBe("UNKNOWN"); // deaths_caress
    expect(against(actionAt("sanlayn", 5)).kind).toBe("UNKNOWN"); // any_dnd
    expect(against(actionAt("sanlayn", 7))).toEqual({ kind: "PROVEN_USABLE" });
    expect(against(actionAt("sanlayn", 4))).toEqual({ kind: "PROVEN_USABLE" });
  });

  it("never reads the wire's cost field for the mechanical cost: 4 Runes against a reported cost of 5 still proves Marrowrend at 2", () => {
    const state = stateOf([runeCosted(0, 10_000, VAMPIRIC_STRIKE, 4, 5)]);
    const fact = factAt(state, at(state, 10_000, VAMPIRIC_STRIKE));
    expect(fact.runes).toEqual({ state: "EXACT", amount: 4, max: 6, wireCost: 5 });
    expect(fact.marrowrend).toMatchObject({ runeCost: 2 });
    expect(fact.evidence).toBe("OWN_PRE_COST_AFFORDABLE");
    expect(usability(MARROWREND_AT_7, fact)).toEqual({ kind: "PROVEN_USABLE" });
    // And a reported cost of 1 with 1 Rune is BELOW the pinned 2, whatever the wire says.
    const one = stateOf([runeCosted(0, 10_000, HEART_STRIKE, 1, 1)]);
    expect(factAt(one, at(one, 10_000, HEART_STRIKE)).evidence).toBe("OWN_PRE_COST_BELOW_COST");
  });

  it("withholds the proof from a record that is not the pinned cooldown-free instant shape", () => {
    resetBloodDeathKnightSpenderCostCache();
    const record = bloodSpenderCostsFor(MARROWREND_TOKEN)[0];
    if (record === undefined) throw new Error("unreachable");
    const observation = { state: "EXACT_PRE_COST", amount: 6, max: 6, cost: 1 } as const;
    for (const mutation of [
      { cooldownMs: 6000 },
      { chargeCooldownMs: 30_000 },
      { internalCooldownMs: 1000 },
      { categoryCooldownMs: 1500 },
      { castTimeMs: 2000 },
      { spellId: 195292 },
      { powerRows: record.powerRows.filter((row) => row.powerType !== 5) },
    ]) {
      const pin = marrowrendPinOf({ ...record, ...mutation });
      const fact = bloodRuneAffordability(observation, SANLAYN, pin);
      expect(fact.evidence, JSON.stringify(mutation)).toBe("AUTHORITY_NOT_PINNED");
      expect(marrowrendAffordabilityProven(fact)).toBe(false);
      expect(usability(MARROWREND_AT_7, fact)).toEqual({ kind: "UNKNOWN" });
    }
    // The committed artifact, re-read through the cache seam, is the pinned shape.
    resetBloodDeathKnightSpenderCostCache();
    expect(bloodRuneAffordability(observation, SANLAYN).evidence).toBe("OWN_PRE_COST_AFFORDABLE");
  });

  it("re-checks every conjunct of a fact: a hand-assembled AFFORDABLE tag proves nothing on its own", () => {
    const sound = bloodRuneAffordability({ state: "EXACT_PRE_COST", amount: 3, max: 6, cost: 1 }, SANLAYN);
    expect(marrowrendAffordabilityProven(sound)).toBe(true);
    const tagged = (patch: Partial<BloodRuneAffordability>): BloodRuneAffordability => ({
      ...sound,
      ...patch,
    });
    expect(marrowrendAffordabilityProven(tagged({ costModifiersExcluded: false }))).toBe(false);
    expect(
      marrowrendAffordabilityProven(tagged({ runes: { state: "EXACT", amount: 1, max: 6, wireCost: 1 } })),
    ).toBe(false);
    expect(
      marrowrendAffordabilityProven(
        tagged({
          marrowrend: { state: "PINNED", spellId: 195182, runeCost: 2, cooldownFree: false, castTimeMs: 0 },
        }),
      ),
    ).toBe(false);
    expect(marrowrendAffordabilityProven(tagged({ runes: { state: "NOT_ESTABLISHED", reason: "x" } }))).toBe(
      false,
    );
    expect(marrowrendAffordabilityProven(NO_RUNE_AFFORDABILITY)).toBe(false);
    expect(usability(MARROWREND_AT_7, NO_RUNE_AFFORDABILITY)).toEqual({ kind: "UNKNOWN" });
    // The default argument is the no-fact: the pre-B7 call shape proves nothing new.
    expect(resolveBloodUsability(initialBloodState(), MARROWREND_AT_7, HEART_STRIKE)).toEqual({
      kind: "UNKNOWN",
    });
  });

  it("keeps the earlier proofs ahead of it: the observed Marrowrend cast is PROVEN_USABLE whatever the fact says", () => {
    expect(
      resolveBloodUsability(initialBloodState(), MARROWREND_AT_7, MARROWREND, [], NO_RUNE_AFFORDABILITY),
    ).toEqual({
      kind: "PROVEN_USABLE",
    });
    expect(BLOOD_RUNE_AFFORDABILITY_EVIDENCE).toEqual([
      "OWN_PRE_COST_AFFORDABLE",
      "OWN_PRE_COST_BELOW_COST",
      "NO_RUNE_OBSERVATION",
      "MODIFIER_UNPROVEN",
      "AUTHORITY_NOT_PINNED",
    ]);
  });
});
