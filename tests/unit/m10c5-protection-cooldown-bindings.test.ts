/**
 * M10-C5 Phase A: the Protection-owned cooldown bindings and the pinned
 * cooldown dataset they compose.
 *
 * Real-evidence cases read the committed 45-second slice and its gap
 * derivative; the folding rules are exercised over the pinned records with
 * hand-built talent trees.
 */

import { describe, expect, it } from "vitest";

import {
  pinnedProtectionPaladinCooldowns,
  protectionCooldownAbilitiesFor,
  type ProtectionCooldownAbility,
} from "../../src/data/game/paladin-protection-cooldowns.js";
import {
  bindGroundEffectPresence,
  deriveProtectionCooldown,
  deriveSupportedProtectionCooldowns,
  dynamicMutationsAbsent,
  effectiveBaseFor,
  groundEffectDurationBounds,
  protectionCooldownBindingsFrom,
  SUPPORTED_PROTECTION_COOLDOWN_TOKENS,
} from "../../src/specs/paladin/protection/cooldown-bindings.js";
import { corpusState, positionOfCast } from "../support/corpus/fight.js";

const ROTATIONAL = "wcl-protection-paladin-a7r6-rotational-45s";
const GAP = "wcl-protection-paladin-a7r6-rotational-45s.gap-before-2026589";
const TANK = 7;
const [DIVINE_TOLL, SENTINEL, AVENGING_WRATH, HAMMER_OF_WRATH, BLESSED_HAMMER] = [
  375576, 389539, 31884, 1241413, 204019,
];
const [AVENGERS_SHIELD, CONSECRATION, JUDGMENT] = [31935, 26573, 275779];
/** Entry ids from the pinned census / talent artifact. */
const RIGHTEOUS_PROTECTOR_ENTRY = 102440;
const QUICKENED_INVOCATION_ENTRY = 115168;
const DIVINE_RESONANCE_ENTRY = 102443;

function talentsOf(state: ReturnType<typeof corpusState>) {
  for (const position of state.positionsOfKind("COMBATANT_INFO")) {
    const event = state.eventAt(position);
    if (event?.kind === "COMBATANT_INFO" && event.snapshot.actorId === TANK) {
      return event.snapshot.talentTree.map((entry) => ({ id: entry.id, nodeId: entry.nodeId }));
    }
  }
  throw new Error("no combatant info");
}

function at(state: ReturnType<typeof corpusState>, reportTimeMs: number, abilityGameId: number) {
  const found = positionOfCast(state, { actorId: TANK, reportTimeMs, abilityGameId });
  if (!found.ok) throw new Error(found.detail);
  return found.position;
}

describe("the pinned cooldown dataset", () => {
  it("loads with the machine census and the reviewed dynamic policy for exactly the Phase A and Phase B abilities", () => {
    const loaded = pinnedProtectionPaladinCooldowns();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.commitSha).toBe("33622e9d1662ff0e451691edf85a6b49cc9d11d9");
    expect(loaded.abilities.map((ability) => [ability.simcToken, ability.abilityGameId])).toEqual([
      ["divine_toll", DIVINE_TOLL],
      ["avenging_wrath", SENTINEL],
      ["avenging_wrath", AVENGING_WRATH],
      ["avengers_shield", AVENGERS_SHIELD],
      ["consecration", CONSECRATION],
    ]);
    expect(Object.keys(loaded.aliasGroups)).toEqual(["wings"]);
    const base: Record<string, number> = {
      divine_toll: 60_000,
      avenging_wrath: 120_000,
      avengers_shield: 15_000,
      consecration: 9_000,
    };
    for (const ability of loaded.abilities) {
      expect(ability.baseCooldownMs).toBe(base[ability.simcToken]);
      expect(ability.chargeCooldownMs).toBe(0);
      const declared = ability.knownDynamicMutations.length > 0;
      expect(ability.dynamicModifierPolicy.checks.map((check) => check.claim)).toEqual([
        declared ? "EVERY_DYNAMIC_MUTATION_IS_DECLARED" : "NO_DYNAMIC_MUTATION_THROUGH_THE_MODULE_HANDLE",
        "NO_MUTATION_THROUGH_A_NAMED_COOLDOWN_OBJECT",
        declared
          ? "ONLY_DECLARED_ADJUST_RESET_OR_START_NAMES_THIS_COOLDOWN"
          : "NO_ADJUST_RESET_OR_START_NAMES_THIS_COOLDOWN",
        "NO_RECHARGE_RATE_MULTIPLIER_MECHANISM_ACTIVE",
        "NO_ACTION_LEVEL_COOLDOWN_OVERRIDE",
        "NO_MODULE_HASTED_COOLDOWN_FLAG",
        "NO_MODULE_AFFECT_LIST_NAMES_THIS_SPELL",
      ]);
    }
    // Phase B's declared dynamic mutations: Grand Crusader resets Avenger's
    // Shield (observable as aura 85416 on the actor); Consecration's only
    // adjust is the precombat one.
    const [avengersShield] = protectionCooldownAbilitiesFor("avengers_shield");
    expect(avengersShield?.knownDynamicMutations).toEqual([
      expect.objectContaining({
        member: "reset",
        site: "paladin_t::trigger_grand_crusader",
        effect: "RESET_TO_READY",
        observableSignature: expect.objectContaining({
          kind: "AURA_APPLICATION_ON_ACTOR",
          abilityGameId: 85416,
        }),
      }),
    ]);
    const [consecration] = protectionCooldownAbilitiesFor("consecration");
    expect(consecration?.knownDynamicMutations).toEqual([
      expect.objectContaining({ member: "adjust", effect: "PRECOMBAT_ONLY" }),
    ]);
    expect(consecration?.groundEffect).toEqual(
      expect.objectContaining({
        durationMs: 12_000,
        durationModifiers: [
          expect.objectContaining({
            displayNameEn: "Consecration in Flame",
            kind: "FLAT_MS",
            value: 2_000,
            traitEntryId: 102450,
          }),
        ],
      }),
    );
  });

  it("censuses exactly the passives that would change these cooldowns: Quickened Invocation on Divine Toll, Righteous Protector on both wings records, the spec passive's haste on Avenger's Shield and Consecration, Consecration's own rank passive", () => {
    const [divineToll] = protectionCooldownAbilitiesFor("divine_toll");
    const wings = protectionCooldownAbilitiesFor("avenging_wrath");
    expect(
      divineToll?.passiveModifiers.map((m) => [m.displayNameEn, m.kind, m.value, m.direction, m.nodeType]),
    ).toEqual([["Quickened Invocation", "FLAT_MS", -15_000, "SHORTENS", "CHOICE"]]);
    expect(divineToll?.passiveModifiers[0]?.alternativeEntries.map((entry) => entry.displayNameEn)).toEqual([
      "Divine Resonance",
    ]);
    for (const record of wings) {
      expect(
        record.passiveModifiers.map((m) => [m.displayNameEn, m.kind, m.value, m.direction, m.traitEntryId]),
      ).toEqual([["Righteous Protector", "PCT", -50, "SHORTENS", RIGHTEOUS_PROTECTOR_ENTRY]]);
    }
    // Phase B: the spec passive "Protection Paladin" (137028) hastes Avenger's
    // Shield and Consecration — a SPEC_PASSIVE origin with no trait identity —
    // and the class-spell rank passive "Consecration" (327980) halves
    // Consecration's cooldown. Neither is modelled numerically; both are
    // censused so the binder refuses instead of computing a wrong base.
    const [avengersShield] = protectionCooldownAbilitiesFor("avengers_shield");
    expect(
      avengersShield?.passiveModifiers.map((m) => [
        m.origin,
        m.displayNameEn,
        m.kind,
        m.direction,
        m.traitEntryId,
      ]),
    ).toEqual([["SPEC_PASSIVE", "Protection Paladin", "HASTED", "SHORTENS_WITH_HASTE", null]]);
    const [consecration] = protectionCooldownAbilitiesFor("consecration");
    expect(
      consecration?.passiveModifiers.map((m) => [m.origin, m.displayNameEn, m.kind, m.value, m.direction]),
    ).toEqual([
      ["SPEC_PASSIVE", "Protection Paladin", "HASTED", 100, "SHORTENS_WITH_HASTE"],
      ["SPEC_PASSIVE", "Consecration", "PCT", -50, "SHORTENS"],
    ]);
    expect(SUPPORTED_PROTECTION_COOLDOWN_TOKENS).toEqual([
      "divine_toll",
      "avenging_wrath",
      "avengers_shield",
      "consecration",
    ]);
  });
});

describe("folding static modifiers into the base, in the only safe direction", () => {
  const divineToll = protectionCooldownAbilitiesFor("divine_toll")[0] as ProtectionCooldownAbility;
  const sentinel = protectionCooldownAbilitiesFor("avenging_wrath")[0] as ProtectionCooldownAbility;

  it("a SELECTED shortening modifier is applied exactly: Righteous Protector halves Sentinel to 60,000 ms", () => {
    const { base, accounting } = effectiveBaseFor(sentinel, [
      { id: RIGHTEOUS_PROTECTOR_ENTRY, nodeId: 81477 },
    ]);
    expect(base).toEqual({ state: "EXACT", ms: 60_000 });
    expect(accounting.map((entry) => [entry.selection, entry.treatment])).toEqual([
      ["SELECTED", "APPLIED_EXACTLY"],
    ]);
  });

  it("a NOT_SELECTED modifier is ignored: Divine Resonance at the choice node leaves Divine Toll at 60,000 ms exactly", () => {
    const { base, accounting } = effectiveBaseFor(divineToll, [
      { id: DIVINE_RESONANCE_ENTRY, nodeId: 81479 },
    ]);
    expect(base).toEqual({ state: "EXACT", ms: 60_000 });
    expect(accounting[0]?.treatment).toBe("IGNORED_NOT_SELECTED");
  });

  it("an UNKNOWN shortening modifier is applied as the worst case and the base becomes a LOWER BOUND", () => {
    const { base, accounting } = effectiveBaseFor(divineToll, []);
    expect(base).toEqual({ state: "LOWER_BOUND", ms: 45_000 });
    expect(accounting[0]).toMatchObject({ selection: "UNKNOWN", treatment: "APPLIED_AS_WORST_CASE" });
    const wings = effectiveBaseFor(sentinel, []);
    expect(wings.base).toEqual({ state: "LOWER_BOUND", ms: 60_000 });
  });

  it("an UNKNOWN lengthening modifier is dropped, a haste or charge modifier refuses, and flat+pct together refuse", () => {
    const lengthening = {
      ...divineToll,
      passiveModifiers: [
        { ...divineToll.passiveModifiers[0]!, value: 15_000, direction: "LENGTHENS" as const },
      ],
    };
    expect(effectiveBaseFor(lengthening, []).base).toEqual({ state: "EXACT", ms: 60_000 });
    expect(effectiveBaseFor(lengthening, []).accounting[0]?.treatment).toBe("IGNORED_CANNOT_SHORTEN");

    const hasted = {
      ...divineToll,
      passiveModifiers: [
        {
          ...divineToll.passiveModifiers[0]!,
          kind: "HASTED" as const,
          direction: "SHORTENS_WITH_HASTE" as const,
        },
      ],
    };
    expect(effectiveBaseFor(hasted, []).base.state).toBe("REFUSED");
    expect(effectiveBaseFor(hasted, [{ id: DIVINE_RESONANCE_ENTRY, nodeId: 81479 }]).base).toEqual({
      state: "EXACT",
      ms: 60_000,
    });

    const both = {
      ...sentinel,
      passiveModifiers: [
        ...sentinel.passiveModifiers,
        {
          ...divineToll.passiveModifiers[0]!,
          traitEntryId: 999_999,
          traitNodeId: 999_999,
          alternativeEntries: [],
        },
      ],
    };
    const folded = effectiveBaseFor(both, [{ id: RIGHTEOUS_PROTECTOR_ENTRY, nodeId: 81477 }]);
    expect(folded.base.state).toBe("REFUSED");
    if (folded.base.state === "REFUSED") expect(folded.base.reason).toContain("composition order");
  });
});

describe("over the REAL 45-second slice", () => {
  const state = corpusState(ROTATIONAL);
  const observedTalents = talentsOf(state);

  it("at the Divine Toll press the wings cooldown is PROVEN_NOT_READY from the Sentinel press 414 ms earlier, over an exact 60,000 ms base", () => {
    const position = at(state, 2026655, DIVINE_TOLL);
    const wings = deriveProtectionCooldown(
      { state, actorId: TANK, position, observedTalents },
      "avenging_wrath",
    );
    expect(wings?.readiness).toEqual({
      state: "PROVEN_NOT_READY",
      provenRemainingAtLeastMs: 59_586,
      cooldownToleranceMs: 250,
    });
    expect(wings?.readinessAbilityGameId).toBe(SENTINEL);
    expect(wings?.remainsSeconds).toEqual({
      state: "BOUNDED_NUMBER",
      atLeast: 59.586,
      reason: "STATE_NOT_ESTABLISHED",
    });
    const sentinel = wings?.perAbility.find((entry) => entry.abilityGameId === SENTINEL);
    expect(sentinel?.effectiveBase).toEqual({ state: "EXACT", ms: 60_000 });
    expect(sentinel?.cooldown).toMatchObject({
      state: "BOUNDED",
      atLeastRemainingMs: 59_586,
      elapsedMs: 414,
      baseCooldownMs: 60_000,
    });
    if (sentinel?.cooldown.state === "BOUNDED")
      expect(sentinel.cooldown.anchor.locator.reportTimeMs).toBe(2026241);
    // The other wings record has no observed cast and says nothing.
    expect(wings?.perAbility.find((entry) => entry.abilityGameId === AVENGING_WRATH)?.cooldown).toMatchObject(
      {
        state: "UNKNOWN",
        reason: "NO_OBSERVED_CAST",
      },
    );
    // Divine Toll's own cooldown: no observed cast BEFORE this press.
    const divineToll = deriveProtectionCooldown(
      { state, actorId: TANK, position, observedTalents },
      "divine_toll",
    );
    expect(divineToll?.readiness).toEqual({ state: "UNKNOWN", reason: "COOLDOWN_STATE_UNKNOWN" });
    expect(divineToll?.perAbility[0]?.cooldown).toMatchObject({
      state: "UNKNOWN",
      reason: "NO_OBSERVED_CAST",
    });
    expect(divineToll?.perAbility[0]?.effectiveBase).toEqual({ state: "EXACT", ms: 60_000 });
  });

  it("after the Divine Toll press, Divine Toll is PROVEN_NOT_READY for every later decision: complete past history establishes post-cast state", () => {
    const position = at(state, 2027501, HAMMER_OF_WRATH);
    const divineToll = deriveProtectionCooldown(
      { state, actorId: TANK, position, observedTalents },
      "divine_toll",
    );
    expect(divineToll?.readiness).toEqual({
      state: "PROVEN_NOT_READY",
      provenRemainingAtLeastMs: 59_154,
      cooldownToleranceMs: 250,
    });
    expect(divineToll?.readinessAbilityGameId).toBe(DIVINE_TOLL);
    const bindings = protectionCooldownBindingsFrom(
      deriveSupportedProtectionCooldowns({ state, actorId: TANK, position, observedTalents }),
    );
    expect(bindings.map((entry) => entry.name)).toEqual(["divine_toll", "avenging_wrath"]);
  });

  it("a LATER cast never establishes earlier state: 384 ms before the Sentinel press, wings is UNKNOWN with no observed cast", () => {
    const position = at(state, 2025857, BLESSED_HAMMER);
    const wings = deriveProtectionCooldown(
      { state, actorId: TANK, position, observedTalents },
      "avenging_wrath",
    );
    expect(wings?.readiness).toEqual({ state: "UNKNOWN", reason: "COOLDOWN_STATE_UNKNOWN" });
    for (const entry of wings?.perAbility ?? [])
      expect(entry.cooldown).toMatchObject({ state: "UNKNOWN", reason: "NO_OBSERVED_CAST" });
    expect(
      protectionCooldownBindingsFrom(
        deriveSupportedProtectionCooldowns({ state, actorId: TANK, position, observedTalents }),
      ),
    ).toEqual([]);
  });

  it("an unpinned token derives nothing", () => {
    const position = at(state, 2027501, HAMMER_OF_WRATH);
    expect(
      deriveProtectionCooldown({ state, actorId: TANK, position, observedTalents }, "hammer_of_wrath"),
    ).toBeNull();
  });

  it("the Quickened Invocation node was spent on Divine Resonance, so Divine Toll's base is exact, not a bound", () => {
    expect(observedTalents.some((entry) => entry.id === DIVINE_RESONANCE_ENTRY)).toBe(true);
    expect(observedTalents.some((entry) => entry.id === QUICKENED_INVOCATION_ENTRY)).toBe(false);
  });
});

describe("Phase B: the observable Grand Crusader reset policy and the Consecration ground effect over the REAL 45-second slice", () => {
  const state = corpusState(ROTATIONAL);
  const observedTalents = talentsOf(state);
  const [avengersShield] = protectionCooldownAbilitiesFor("avengers_shield");
  if (avengersShield === undefined) throw new Error("no avengers_shield record");

  it("proves the Grand Crusader reset ABSENT only over complete AURAS coverage with no 85416 application between the anchor and the decision", () => {
    // Anchor: the Avenger's Shield at 2,019,931 (the Grand Crusader buff is
    // REMOVED at that millisecond, which is not an application). The next
    // application is at 2,023,092.
    const anchor = at(state, 2019931, AVENGERS_SHIELD);
    const before = dynamicMutationsAbsent(
      avengersShield,
      state,
      TANK,
      anchor,
      at(state, 2022719, BLESSED_HAMMER),
    );
    expect(before.ok).toBe(true);
    if (before.ok) expect(before.claims).toEqual(["OBSERVABLE_RESET_ABSENT:reset:85416:[2019931..2022719]"]);
    const after = dynamicMutationsAbsent(
      avengersShield,
      state,
      TANK,
      anchor,
      at(state, 2025857, BLESSED_HAMMER),
    );
    expect(after).toEqual({
      ok: false,
      reason: "the reset signature 85416 was applied 1 time(s) between the anchor and the decision",
    });
    // Over the gap derivative the interval is not covered, so absence cannot be claimed.
    const gap = corpusState(GAP);
    const gapAnchor = at(gap, 2029047, AVENGERS_SHIELD);
    const overGap = dynamicMutationsAbsent(
      avengersShield,
      gap,
      TANK,
      gapAnchor,
      at(gap, 2032916, AVENGERS_SHIELD),
    );
    expect(overGap.ok).toBe(false);
  });

  it("still derives Avenger's Shield and Consecration as UNKNOWN: the spec passive hastes both and no haste model exists", () => {
    for (const [token, id] of [
      ["avengers_shield", AVENGERS_SHIELD],
      ["consecration", CONSECRATION],
    ] as const) {
      const derived = deriveProtectionCooldown(
        { state, actorId: TANK, position: at(state, 2048592, CONSECRATION), observedTalents },
        token,
      );
      expect(derived?.readiness).toEqual({ state: "UNKNOWN", reason: "COOLDOWN_STATE_UNKNOWN" });
      expect(derived?.remainsSeconds).toBeNull();
      const record = derived?.perAbility.find((entry) => entry.abilityGameId === id);
      expect(record?.effectiveBase.state).toBe("REFUSED");
      expect(record?.cooldown).toMatchObject({ state: "UNKNOWN", reason: "MODIFIERS_NOT_PROVEN_ABSENT" });
    }
  });

  it("binds consecration.up from the last Consecration cast and the pinned 12,000 + 2,000 ms duration", () => {
    const [consecration] = protectionCooldownAbilitiesFor("consecration");
    if (consecration === undefined) throw new Error("no consecration record");
    expect(groundEffectDurationBounds(consecration, observedTalents)).toMatchObject({
      shortestMs: 14_000,
      longestMs: 14_000,
    });
    // TRUE: 3,978 ms after the cast at 2,015,953.
    expect(
      bindGroundEffectPresence(
        { state, actorId: TANK, position: at(state, 2019931, AVENGERS_SHIELD), observedTalents },
        "consecration",
      ),
    ).toMatchObject({ state: "BOUND", up: true, elapsedMs: 3_978, durationMs: 14_000 });
    // The Consecration press at 2,020,816 asks about the PREVIOUS one, 4,863 ms earlier.
    expect(
      bindGroundEffectPresence(
        { state, actorId: TANK, position: at(state, 2020816, CONSECRATION), observedTalents },
        "consecration",
      ),
    ).toMatchObject({ state: "BOUND", up: true, elapsedMs: 4_863 });
    // FALSE: 19,011 ms after the cast at 2,020,816, with the whole 14,000 ms
    // lookback inside the log under complete CASTS coverage.
    expect(
      bindGroundEffectPresence(
        { state, actorId: TANK, position: at(state, 2039827, CONSECRATION), observedTalents },
        "consecration",
      ),
    ).toMatchObject({ state: "BOUND", up: false, elapsedMs: 19_011, durationMs: 14_000 });
    // UNKNOWN: at the first Judgment the lookback reaches before the pull.
    expect(
      bindGroundEffectPresence(
        { state, actorId: TANK, position: at(state, 2005436, JUDGMENT), observedTalents },
        "consecration",
      ),
    ).toEqual({ state: "UNKNOWN", reason: "PRE_PULL_GROUND_EFFECT_NOT_EXCLUDED" });
    // UNKNOWN: with Consecration in Flame unresolved the duration is [12,000, 14,000],
    // and 12,100 ms after the cast at 2,020,816 is inside the uncertainty.
    expect(groundEffectDurationBounds(consecration, [])).toMatchObject({
      shortestMs: 12_000,
      longestMs: 14_000,
    });
    expect(
      bindGroundEffectPresence(
        { state, actorId: TANK, position: at(state, 2032916, AVENGERS_SHIELD), observedTalents: [] },
        "consecration",
      ),
    ).toEqual({ state: "UNKNOWN", reason: "ELAPSED_INSIDE_DURATION_UNCERTAINTY" });
    // UNKNOWN over the gap: the lookback crosses uncovered history.
    expect(
      bindGroundEffectPresence(
        {
          state: corpusState(GAP),
          actorId: TANK,
          position: at(corpusState(GAP), 2039827, CONSECRATION),
          observedTalents,
        },
        "consecration",
      ),
    ).toMatchObject({ state: "UNKNOWN" });
    expect(
      bindGroundEffectPresence({ state, actorId: TANK, position: 0, observedTalents }, "divine_toll"),
    ).toEqual({
      state: "UNKNOWN",
      reason: "NO_PINNED_GROUND_EFFECT",
    });
  });
});

describe("over the gap derivative (everything before 2,026,589 removed)", () => {
  const state = corpusState(GAP);
  const observedTalents = talentsOf(state);

  it("the wings anchor is gone, so at the same Divine Toll press wings is UNKNOWN — M4 cannot answer the cast question over uncovered history", () => {
    const position = at(state, 2026655, DIVINE_TOLL);
    const wings = deriveProtectionCooldown(
      { state, actorId: TANK, position, observedTalents },
      "avenging_wrath",
    );
    expect(wings?.readiness).toEqual({ state: "UNKNOWN", reason: "COOLDOWN_STATE_UNKNOWN" });
    for (const entry of wings?.perAbility ?? [])
      expect(entry.cooldown).toMatchObject({ state: "UNKNOWN", reason: "CAST_STATE_UNKNOWN" });
  });

  it("an anchor that survived the gap still proves what it proves: Divine Toll is PROVEN_NOT_READY at the Hammer of Wrath", () => {
    const position = at(state, 2027501, HAMMER_OF_WRATH);
    const divineToll = deriveProtectionCooldown(
      { state, actorId: TANK, position, observedTalents },
      "divine_toll",
    );
    expect(divineToll?.readiness).toEqual({
      state: "PROVEN_NOT_READY",
      provenRemainingAtLeastMs: 59_154,
      cooldownToleranceMs: 250,
    });
  });
});
