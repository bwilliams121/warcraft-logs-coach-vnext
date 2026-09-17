/**
 * M10-C5 Phase B2 final provenance audit.
 *
 *   1. `consecration.up` at exact millisecond boundaries under a 12,000 ms,
 *      a 14,000 ms and an UNKNOWN [12,000 .. 14,000] ground-effect duration,
 *      with the last-pulse allowance the pinned ground_aoe lifetime imposes;
 *   2. the resolved Avenger's Shield MATCH at 2,139,100 is independent of the
 *      Consecration duration model and of the `next_armament` refusal
 *      vocabulary — it rests on default[6] .. default[13] only;
 *   3. no hasted cooldown ever yields PROVEN_NOT_READY anywhere in the
 *      composed 165-second fight.
 */

import { describe, expect, it } from "vitest";

import {
  protectionCooldownAbilitiesFor,
  type ProtectionCooldownAbility,
} from "../../src/data/game/paladin-protection-cooldowns.js";
import {
  resolveProtectionApexTrait,
  resolveProtectionHeroTree,
  resolveProtectionTalent,
} from "../../src/data/game/paladin-protection-talents.js";
import { createCombatState } from "../../src/engine/state/combat-state.js";
import { knownNumber, unknownNumber } from "../../src/simc/expression/evaluate.js";
import type { AtomBindings } from "../../src/simc/expression/evaluate.js";
import type { SpecAtomValue } from "../../src/simc/expression/spec-vocabulary.js";
import {
  AVENGING_WRATH_TOKEN,
  HAMMER_OF_WRATH_TOKEN,
  type ProtectionAuraGateFact,
  type ProtectionBuildFacts,
  type ProtectionReadinessFact,
} from "../../src/specs/paladin/protection/action-profile.js";
import {
  bindSupportedProtectionAuras,
  protectionBuffBindingsFrom,
} from "../../src/specs/paladin/protection/aura-bindings.js";
import {
  bindGroundEffectPresence,
  deriveSupportedProtectionCooldowns,
  effectiveBaseFor,
  groundEffectDurationBounds,
  groundEffectVerdictAtElapsed,
  protectionCooldownBindingsFrom,
} from "../../src/specs/paladin/protection/cooldown-bindings.js";
import { protectionFirstGcdSelectionAt } from "../../src/specs/paladin/protection/first-gcd-adapter.js";
import { pinnedProtectionPaladinAuthority } from "../../src/specs/paladin/protection/pinned-authority.js";
import { PROTECTION_PALADIN_REGISTRATION } from "../../src/specs/paladin/protection/registration.js";
import { resolveProtectionAtoms } from "../../src/specs/paladin/protection/resolver.js";
import { PROTECTION_PALADIN_SPEC_ID } from "../../src/specs/paladin/protection/spec.js";
import type { ProtectionPaladinAnalysis } from "../../src/specs/paladin/protection/observed-analysis.js";
import {
  DIVINE_INSPIRATION_DISPLAY_NAME,
  resolveProtectionHeroEntry,
} from "../../src/specs/paladin/protection/subaction-candidates.js";
import { CONSECRATION_UP, NEXT_ARMAMENT } from "../../src/specs/paladin/protection/vocabulary.js";
import { corpusBundleState, positionOfCast } from "../support/corpus/fight.js";
import {
  CONSECRATION,
  JUDGMENT,
  LIGHTSMITH_TREE,
  PROT_ACTOR,
  protCast,
  protCombatantInfo,
  type TreeEntry,
} from "../support/protection-paladin-fixture.js";
import { syntheticFight } from "../support/synthetic-fight.js";

const PP45 = "wcl-protection-paladin-a7r6-rotational-45s";
const SEG = "wcl-protection-paladin-a7r6-rotational-165s";
const ALL = [PP45, `${SEG}.seg-45-60`, `${SEG}.seg-60-90`, `${SEG}.seg-90-120`, `${SEG}.seg-120-165`];
const AVENGERS_SHIELD = 31935;
const CONSECRATION_IN_FLAME_ENTRY = 102450;
const CONSECRATION_IN_FLAME_NODE = 81485;

// ---------------------------------------------------------------------------
// 1. consecration.up at the millisecond boundaries
// ---------------------------------------------------------------------------

/** A synthetic fight: the profile, one Consecration cast at 30,000 and one decision cast `elapsed` ms later. */
function stateWithConsecrationThen(elapsed: number, talentTree: readonly TreeEntry[]) {
  const cast = 30_000;
  return createCombatState(
    syntheticFight({
      startTimeMs: 1_000,
      endTimeMs: 90_000,
      focusActorId: PROT_ACTOR,
      observedCategories: ["CASTS", "RESOURCES", "AURAS", "COMBATANT_INFO", "GEAR"],
      actorScope: [PROT_ACTOR],
      events: [
        protCombatantInfo({ ordinal: 0, reportTimeMs: 1_000, talentTree }),
        protCast({ ordinal: 1, reportTimeMs: cast, abilityGameId: CONSECRATION }),
        protCast({ ordinal: 2, reportTimeMs: cast + elapsed, abilityGameId: JUDGMENT }),
      ],
    }),
  );
}

/** The REAL binder over the synthetic fight: the pinned record, by token. */
function presenceAfter(elapsed: number, talentTree: readonly TreeEntry[]) {
  const state = stateWithConsecrationThen(elapsed, talentTree);
  const found = positionOfCast(state, {
    actorId: PROT_ACTOR,
    reportTimeMs: 30_000 + elapsed,
    abilityGameId: JUDGMENT,
  });
  if (!found.ok) throw new Error(found.detail);
  const talents = talentTree.map((entry) => ({ id: entry.id, nodeId: entry.nodeId }));
  return bindGroundEffectPresence(
    { state, actorId: PROT_ACTOR, position: found.position, observedTalents: talents },
    "consecration",
  );
}

/**
 * The same pure rule the binder applies once the cast and the bounds are
 * known, over a HAND-EDITED record: the 12,000 ms case cannot arise from the
 * pinned data (Consecration in Flame is a NORMAL node, so it is SELECTED or
 * UNKNOWN, never NOT_SELECTED), and is exercised through the rule directly.
 */
function verdictWithRecord(
  elapsed: number,
  talentTree: readonly TreeEntry[],
  ability: ProtectionCooldownAbility,
) {
  const talents = talentTree.map((entry) => ({ id: entry.id, nodeId: entry.nodeId }));
  const bounds = groundEffectDurationBounds(ability, talents);
  if (bounds === null) throw new Error("no bounds");
  const allowance = ability.groundEffect?.lifetime.pulseBaseMs;
  if (allowance === undefined) throw new Error("no lifetime");
  return groundEffectVerdictAtElapsed(elapsed, bounds.shortestMs, bounds.longestMs, allowance);
}

const WITH_FLAME = [
  ...LIGHTSMITH_TREE,
  { id: CONSECRATION_IN_FLAME_ENTRY, rank: 1, nodeId: CONSECRATION_IN_FLAME_NODE },
];
const FLAME_UNKNOWN = LIGHTSMITH_TREE;

describe("consecration.up at the millisecond boundaries", () => {
  const [consecration] = protectionCooldownAbilitiesFor("consecration");
  if (consecration === undefined) throw new Error("no consecration record");

  it("pins the lifetime the binder reads: a 1,000 ms base pulse hasted downwards, alive until the last pulse", () => {
    expect(consecration.groundEffect?.durationMs).toBe(12_000);
    expect(consecration.groundEffect?.lifetime).toMatchObject({
      activeStructMember: "active_consecration",
      pulseBaseMs: 1_000,
      pulseHasted: "SPELL_HASTE",
      expirationPulse: "NO_EXPIRATION_PULSE",
      rule: "ALIVE_UNTIL_LAST_PULSE",
    });
    expect(
      groundEffectDurationBounds(
        consecration,
        WITH_FLAME.map((e) => ({ id: e.id, nodeId: e.nodeId })),
      ),
    ).toMatchObject({
      shortestMs: 14_000,
      longestMs: 14_000,
    });
    expect(groundEffectDurationBounds(consecration, [])).toMatchObject({
      shortestMs: 12_000,
      longestMs: 14_000,
    });
  });

  it("14,000 ms (Consecration in Flame SELECTED): TRUE through 13,000, UNKNOWN through 14,000, FALSE after", () => {
    for (const [elapsed, expected] of [
      [11_999, "TRUE"],
      [12_000, "TRUE"],
      [12_001, "TRUE"],
      [13_000, "TRUE"],
      [13_001, "UNKNOWN:ELAPSED_INSIDE_LAST_PULSE_ALLOWANCE"],
      [13_999, "UNKNOWN:ELAPSED_INSIDE_LAST_PULSE_ALLOWANCE"],
      [14_000, "UNKNOWN:ELAPSED_AT_DURATION_BOUNDARY"],
      [14_001, "FALSE"],
    ] as const) {
      const result = presenceAfter(elapsed, WITH_FLAME);
      const label = result.state === "BOUND" ? (result.up ? "TRUE" : "FALSE") : `UNKNOWN:${result.reason}`;
      expect(label, `elapsed ${String(elapsed)}`).toBe(expected);
      if (result.state === "BOUND") expect(result.lastPulseAllowanceMs).toBe(1_000);
    }
  });

  it("12,000 ms (no duration modifier): TRUE through 11,000, UNKNOWN through 12,000, FALSE after", () => {
    const plain: ProtectionCooldownAbility = {
      ...consecration,
      groundEffect:
        consecration.groundEffect === null ? null : { ...consecration.groundEffect, durationModifiers: [] },
    };
    for (const [elapsed, expected] of [
      [10_999, "TRUE"],
      [11_000, "TRUE"],
      [11_001, "UNKNOWN"],
      [11_999, "UNKNOWN"],
      [12_000, "UNKNOWN"],
      [12_001, "FALSE"],
      [13_999, "FALSE"],
      [14_000, "FALSE"],
      [14_001, "FALSE"],
    ] as const) {
      const label = verdictWithRecord(elapsed, WITH_FLAME, plain).kind;
      expect(label, `elapsed ${String(elapsed)}`).toBe(expected);
    }
  });

  it("UNKNOWN duration [12,000 .. 14,000] (Consecration in Flame unresolved): TRUE through 11,000, UNKNOWN through 14,000, FALSE after", () => {
    for (const [elapsed, expected] of [
      [11_000, "TRUE"],
      [11_001, "UNKNOWN:ELAPSED_INSIDE_LAST_PULSE_ALLOWANCE"],
      [11_999, "UNKNOWN:ELAPSED_INSIDE_LAST_PULSE_ALLOWANCE"],
      [12_000, "UNKNOWN:ELAPSED_INSIDE_DURATION_UNCERTAINTY"],
      [12_001, "UNKNOWN:ELAPSED_INSIDE_DURATION_UNCERTAINTY"],
      [13_999, "UNKNOWN:ELAPSED_INSIDE_DURATION_UNCERTAINTY"],
      [14_000, "UNKNOWN:ELAPSED_AT_DURATION_BOUNDARY"],
      [14_001, "FALSE"],
    ] as const) {
      const result = presenceAfter(elapsed, FLAME_UNKNOWN);
      const label = result.state === "BOUND" ? (result.up ? "TRUE" : "FALSE") : `UNKNOWN:${result.reason}`;
      expect(label, `elapsed ${String(elapsed)}`).toBe(expected);
    }
  });

  it("reads the Consecration CAST and the pinned spell duration only — never a player aura", () => {
    // The synthetic fight above carries no aura event at all, and the binder
    // still answers: presence is derived from the cast and the pinned data.
    const state = stateWithConsecrationThen(5_000, WITH_FLAME);
    expect([...state.positionsOfKind("AURA")]).toEqual([]);
    const found = positionOfCast(state, {
      actorId: PROT_ACTOR,
      reportTimeMs: 35_000,
      abilityGameId: JUDGMENT,
    });
    if (!found.ok) throw new Error(found.detail);
    expect(
      bindGroundEffectPresence(
        { state, actorId: PROT_ACTOR, position: found.position, observedTalents: [] },
        "consecration",
      ),
    ).toMatchObject({ state: "BOUND", up: true, elapsedMs: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// 2. The resolved trace is independent of the Consecration model
// ---------------------------------------------------------------------------

function talentsOf(state: ReturnType<typeof corpusBundleState>) {
  for (const position of state.positionsOfKind("COMBATANT_INFO")) {
    const event = state.eventAt(position);
    if (event?.kind === "COMBATANT_INFO" && event.snapshot.actorId === PROT_ACTOR) return event.snapshot;
  }
  throw new Error("no combatant info");
}

describe("the Avenger's Shield MATCH at 2,139,100 rests on default[6] .. default[13] only", () => {
  const state = corpusBundleState(ALL, []);
  const snapshot = talentsOf(state);
  const observedTalents = snapshot.talentTree.map((entry) => ({ id: entry.id, nodeId: entry.nodeId }));
  const loadedAuthority = pinnedProtectionPaladinAuthority();
  if (!loadedAuthority.ok) throw new Error(loadedAuthority.detail);
  const authority = loadedAuthority.authority;
  const found = positionOfCast(state, {
    actorId: PROT_ACTOR,
    reportTimeMs: 2_139_100,
    abilityGameId: AVENGERS_SHIELD,
  });
  if (!found.ok) throw new Error(found.detail);
  const position = found.position;

  // The evaluator's own binding construction at this decision, reproduced
  // from the same production building blocks it uses.
  const buildFacts: ProtectionBuildFacts = {
    blessedHammer: resolveProtectionTalent(observedTalents, "blessed_hammer"),
    sentinel: resolveProtectionTalent(observedTalents, "sentinel"),
    avengingWrath: resolveProtectionTalent(observedTalents, "avenging_wrath"),
    heroTree: resolveProtectionHeroTree(observedTalents),
    wornGear: snapshot.gear,
    malformedGearRows: snapshot.malformedGearRows,
    divineInspiration: resolveProtectionHeroEntry(observedTalents, DIVINE_INSPIRATION_DISPLAY_NAME).selection,
  };
  const actionTokens = [...new Set(authority.actions.map((action) => action.actionToken))];
  const resolution = resolveProtectionAtoms({
    state,
    actorId: PROT_ACTOR,
    position,
    observedTalents,
    actionTokens,
  });
  const auras = bindSupportedProtectionAuras({
    state,
    actorId: PROT_ACTOR,
    position,
    talents: {
      sentinel: buildFacts.sentinel,
      glory_of_the_vanguard: resolveProtectionApexTrait(observedTalents, 1),
      blessed_assurance: resolveProtectionTalent(observedTalents, "blessed_assurance"),
    },
    heroTree: buildFacts.heroTree,
  });
  const cooldowns = deriveSupportedProtectionCooldowns({
    state,
    actorId: PROT_ACTOR,
    position,
    observedTalents,
  });
  const readiness: ProtectionReadinessFact[] = cooldowns.map((entry) => ({
    simcToken: entry.simcToken,
    readiness: entry.readiness,
    abilityGameId: entry.readinessAbilityGameId,
  }));
  const auraGates: ProtectionAuraGateFact[] = auras.flatMap((aura) =>
    aura.atomName === "hammer_of_wrath" && aura.state === "BOUND" && !aura.up
      ? [
          {
            simcToken: HAMMER_OF_WRATH_TOKEN,
            requiredAuraAbilityGameId: aura.abilityGameId,
            anchorReportTimeMs: aura.anchorLocator.reportTimeMs,
          },
        ]
      : [],
  );
  let wingsLowerBound: number | null = null;
  for (const ability of protectionCooldownAbilitiesFor(AVENGING_WRATH_TOKEN)) {
    const { base } = effectiveBaseFor(ability, observedTalents);
    wingsLowerBound =
      base.state === "REFUSED"
        ? null
        : wingsLowerBound === null
          ? base.ms
          : Math.min(wingsLowerBound, base.ms);
  }
  const baseBindings: AtomBindings = {
    comboPoints: unknownNumber("STATE_NOT_MODELLED"),
    comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
    energyPct: unknownNumber("STATE_NOT_MODELLED"),
    knownBuffs: protectionBuffBindingsFrom(auras),
    knownTalents: resolution.diagnostics.knownTalents,
    knownCooldownRemainsSeconds: protectionCooldownBindingsFrom(cooldowns),
    specAtoms: resolution.specAtoms,
  };

  const select = (bindings: AtomBindings) =>
    protectionFirstGcdSelectionAt({
      authority,
      bindings,
      buildFacts,
      observedAbilityGameId: AVENGERS_SHIELD,
      readiness,
      auraGates,
      wingsCooldownLowerBoundMs: wingsLowerBound,
    }).result;

  const withSpecAtom = (bindings: AtomBindings, key: string, value: SpecAtomValue): AtomBindings => {
    const specAtoms = bindings.specAtoms;
    if (specAtoms === undefined) throw new Error("no spec atoms");
    return {
      ...bindings,
      specAtoms: {
        ...specAtoms,
        bound: [...specAtoms.bound.filter((entry) => entry.key !== key), { key, actionToken: null, value }],
      },
    };
  };
  const withoutSpecAtom = (bindings: AtomBindings, key: string): AtomBindings => {
    const specAtoms = bindings.specAtoms;
    if (specAtoms === undefined) throw new Error("no spec atoms");
    return {
      ...bindings,
      specAtoms: { ...specAtoms, bound: specAtoms.bound.filter((entry) => entry.key !== key) },
    };
  };

  it("reproduces the evaluator's own verdict: default[13] avengers_shield with consecration.up bound TRUE", () => {
    const bound = resolution.specAtoms.bound.find((entry) => entry.key === CONSECRATION_UP);
    expect(bound?.value).toEqual({ kind: "TRUTH", value: true });
    expect(resolution.diagnostics.consecration).toMatchObject({
      state: "BOUND",
      up: true,
      elapsedMs: 11_434,
    });
    const result = select(baseBindings);
    expect(result.kind).toBe("ROTATIONAL_GCD_SELECTED");
    if (result.kind === "ROTATIONAL_GCD_SELECTED") {
      expect(result.actionToken).toBe("avengers_shield");
      expect(result.selectingStep.priorityOrdinal).toBe(13);
    }
  });

  it("selects the same entry with consecration.up TRUE, FALSE and UNBOUND — every duration model gives one of these", () => {
    // 11,434 ms elapsed is TRUE under 14,000 ms (≤ 13,000), TRUE under
    // 12,000 ms (≤ 11,000? no: UNKNOWN), and UNKNOWN under [12,000 .. 14,000]:
    // the three models yield TRUE or UNBOUND, and FALSE is covered as well.
    for (const variant of [
      withSpecAtom(baseBindings, CONSECRATION_UP, { kind: "TRUTH", value: true }),
      withSpecAtom(baseBindings, CONSECRATION_UP, { kind: "TRUTH", value: false }),
      withoutSpecAtom(baseBindings, CONSECRATION_UP),
    ]) {
      const result = select(variant);
      expect(result.kind).toBe("ROTATIONAL_GCD_SELECTED");
      if (result.kind === "ROTATIONAL_GCD_SELECTED") {
        expect(result.actionToken).toBe("avengers_shield");
        expect(result.selectingStep.priorityOrdinal).toBe(13);
      }
    }
  });

  it("no entry at or above default[13] reads consecration.up; the entries that do are default[19] and default[24]", () => {
    const readers = authority.actions
      .filter(
        (action) => action.listName === "default" && /consecration\.up/.test(action.actionStringVerbatim),
      )
      .map((action) => action.priorityOrdinal);
    expect(readers).toEqual([19, 24]);
    expect(Math.min(...readers)).toBeGreaterThan(13);
  });

  it("is indifferent to the next_armament refusal vocabulary: the atom is KNOWN here, and both refusal reasons behave alike", () => {
    const bound = resolution.specAtoms.bound.find((entry) => entry.key === NEXT_ARMAMENT);
    expect(bound?.value).toEqual({ kind: "MAGNITUDE", binding: knownNumber(0) });
    // With the atom refused under either reason the scan blocks at default[9]
    // identically: the reason string never reaches the engine's comparison.
    const notModelled = select(
      withSpecAtom(baseBindings, NEXT_ARMAMENT, {
        kind: "MAGNITUDE",
        binding: unknownNumber("STATE_NOT_MODELLED"),
      }),
    );
    const notEstablished = select(
      withSpecAtom(baseBindings, NEXT_ARMAMENT, {
        kind: "MAGNITUDE",
        binding: unknownNumber("STATE_NOT_ESTABLISHED"),
      }),
    );
    expect(notModelled.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    expect(notEstablished.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    if (notModelled.kind === "ROTATIONAL_GCD_UNKNOWN" && notEstablished.kind === "ROTATIONAL_GCD_UNKNOWN") {
      expect(notModelled.blockedAt?.priorityOrdinal).toBe(9);
      expect(notModelled.blockedAt?.actionToken).toBe("holy_armaments");
      expect(notEstablished.blockedAt?.priorityOrdinal).toBe(9);
      expect(notEstablished.detail).toBe(notModelled.detail);
      // The ONLY difference between the two results is the diagnostic reason
      // string the evidence trace records for the refused atom.
      const scrub = (value: unknown) =>
        JSON.stringify(value).replace(
          /"unknownNumberReason":"STATE_NOT_(?:MODELLED|ESTABLISHED)"/g,
          '"unknownNumberReason":"<refused>"',
        );
      expect(scrub(notEstablished)).toBe(scrub(notModelled));
      expect(JSON.stringify(notEstablished)).not.toBe(JSON.stringify(notModelled));
    }
  });
});

// ---------------------------------------------------------------------------
// 3. No hasted cooldown ever proves NOT_READY
// ---------------------------------------------------------------------------

describe("hasted cooldowns never yield PROVEN_NOT_READY anywhere in the composed fight", () => {
  it("Avenger's Shield and Consecration are UNKNOWN at every one of the 149 eligible decisions", () => {
    const state = corpusBundleState(ALL, []);
    const analysis = PROTECTION_PALADIN_REGISTRATION.analyze({
      state,
      actorId: PROT_ACTOR,
      specId: PROTECTION_PALADIN_SPEC_ID,
      targetActorId: null,
    }) as ProtectionPaladinAnalysis;
    if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
    expect(analysis.resolved).toHaveLength(149);
    const states = new Map<string, Set<string>>();
    for (const decision of analysis.resolved) {
      for (const cooldown of decision.cooldowns) {
        states.set(
          cooldown.simcToken,
          (states.get(cooldown.simcToken) ?? new Set()).add(cooldown.readiness.state),
        );
        if (cooldown.simcToken === "avengers_shield" || cooldown.simcToken === "consecration") {
          for (const per of cooldown.perAbility) {
            expect(per.effectiveBase.state).toBe("REFUSED");
            expect(per.cooldown.state).toBe("UNKNOWN");
          }
        }
      }
    }
    expect(states.get("avengers_shield")).toEqual(new Set(["UNKNOWN"]));
    expect(states.get("consecration")).toEqual(new Set(["UNKNOWN"]));
    expect(states.get("divine_toll")).toEqual(new Set(["PROVEN_NOT_READY", "UNKNOWN"]));
    expect(states.get("avenging_wrath")).toEqual(new Set(["PROVEN_NOT_READY", "UNKNOWN"]));
  });
});
