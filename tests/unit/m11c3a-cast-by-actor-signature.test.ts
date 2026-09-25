/**
 * M11-C3a: the `CAST_BY_ACTOR` dynamic-mutation signature.
 *
 * ONE additive kind beside the two aura signatures. It means only that a
 * COMPLETED cast, by the SAME actor, of one of its abilities MAY have mutated
 * the cooldown (Breath of Fire is reset by every Keg Smash under Sal'salabim's
 * Strength). Its only effect is to WITHDRAW a lower bound when such a cast
 * could lie strictly between the anchoring cast and the query, or when CASTS
 * coverage over that interval is not complete. It never starts, re-anchors,
 * replays or readies a cooldown.
 *
 * This file pins:
 *
 *   schema        valid single/multiple ids; empty, malformed and unknown
 *                 kinds refused; both existing aura forms still read the same
 *   actor scope   the same actor's matching cast withdraws; another actor's
 *                 cast and an unrelated ability do not
 *   events        COMPLETE counts, BEGIN does not; the interval is strictly
 *                 between the anchor and the query in canonical position
 *   coverage      complete CASTS + zero matches proves absence; partial or
 *                 unverified CASTS refuses
 *   monotonicity  adding a matching cast moves a PROVEN_NOT_READY derivation
 *                 to UNKNOWN, never to anything positive
 */

import { describe, expect, it } from "vitest";

import {
  MUTATION_SIGNATURE_KINDS,
  parseAbilityCooldownArtifact,
  type MutationObservableSignature,
  type PinnedCooldownAbility,
} from "../../src/data/game/ability-cooldown-artifact.js";
import {
  deriveTokenCooldown,
  dynamicMutationsAbsent,
  type TokenCooldownDataset,
} from "../../src/findings/cooldowns/token-cooldown-derivation.js";
import { inclusiveRange } from "../../src/engine/evidence/coverage.js";
import { createCombatState, type CombatState } from "../../src/engine/state/combat-state.js";
import brewmasterCooldowns from "../../src/data/game/monk-brewmaster-cooldowns.json";
import protectionCooldowns from "../../src/data/game/paladin-protection-cooldowns.json";
import retributionCooldowns from "../../src/data/game/paladin-retribution-cooldowns.json";
import {
  castEvent,
  observableCategory,
  partialCategory,
  syntheticFight,
} from "../support/synthetic-fight.js";

const ACTOR = 4;
const OTHER_ACTOR = 9;
const ANCHOR_ABILITY = 115181; // the cooldown under test (Breath of Fire's id, as a stand-in)
const RESET_ABILITY = 121253; // the signature cast (Keg Smash's id)
const UNRELATED = 100780;
const BASE_MS = 15_000;
const START = 0;
const END = 100_000;

const castSignature = (ids: readonly number[] = [RESET_ABILITY]): MutationObservableSignature => ({
  kind: "CAST_BY_ACTOR",
  abilityGameIds: ids,
  basis: "test: a completed cast of one of these abilities may reset the cooldown",
});

function ability(signatures: readonly MutationObservableSignature[]): PinnedCooldownAbility {
  return {
    simcToken: "anchor_token",
    abilityGameId: ANCHOR_ABILITY,
    displayNameEn: "Anchor",
    aliasGroup: null,
    baseCooldownMs: BASE_MS,
    charges: 0,
    chargeCooldownMs: 0,
    internalCooldownMs: 0,
    category: 0,
    categoryCooldownMs: 0,
    passiveModifiers: [],
    knownDynamicMutations: signatures.map((observableSignature) => ({
      member: "reset",
      site: "test site",
      effect: "RESET_TO_READY" as const,
      observableSignature,
    })),
    groundEffect: null,
    dynamicModifierPolicy: {
      sourcePaths: ["engine/class_modules/monk/sc_monk.cpp"],
      sourceSha256: { classModule: "a".repeat(64) },
      reviewedOn: "2026-09-25",
      checks: [],
    },
  };
}

interface Cast {
  readonly ordinal: number;
  readonly reportTimeMs: number;
  readonly abilityGameId: number;
  readonly actorId?: number;
  readonly castPhase?: "BEGIN" | "COMPLETE";
}

/** Casts in ordinal order; the position of each is its ordinal. CASTS complete unless told otherwise. */
function stateWith(
  casts: readonly Cast[],
  casts_coverage: "COMPLETE" | "PARTIAL" | "UNVERIFIED" = "COMPLETE",
): CombatState {
  const events = casts.map((cast) =>
    castEvent({
      ordinal: cast.ordinal,
      reportTimeMs: cast.reportTimeMs,
      sourceActorId: cast.actorId ?? ACTOR,
      abilityGameId: cast.abilityGameId,
      castPhase: cast.castPhase ?? "COMPLETE",
    }),
  );
  if (casts_coverage === "UNVERIFIED")
    return createCombatState(syntheticFight({ startTimeMs: START, endTimeMs: END, events }));
  return createCombatState(
    syntheticFight({
      startTimeMs: START,
      endTimeMs: END,
      events,
      categories: {
        CASTS:
          casts_coverage === "COMPLETE"
            ? observableCategory(inclusiveRange(START, END))
            : partialCategory([inclusiveRange(START, 5_000), inclusiveRange(9_000, END)]),
      },
    }),
  );
}

const ANCHOR: Cast = { ordinal: 0, reportTimeMs: 1_000, abilityGameId: ANCHOR_ABILITY };
const QUERY: Cast = { ordinal: 9, reportTimeMs: 10_000, abilityGameId: UNRELATED };

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

function brewmasterWithSignature(signature: unknown) {
  const raw = structuredClone(brewmasterCooldowns) as { abilities: Record<string, unknown>[] };
  const bof = raw.abilities.find((entry) => entry["simcToken"] === "breath_of_fire") as {
    knownDynamicMutations: { observableSignature: unknown }[];
  };
  bof.knownDynamicMutations[0]!.observableSignature = signature;
  return parseAbilityCooldownArtifact(raw, "SIMC_DBC_MONK_BREWMASTER_ABILITY_COOLDOWNS");
}

describe("schema", () => {
  it("names exactly three signature kinds, the two aura forms unchanged and CAST_BY_ACTOR added", () => {
    expect([...MUTATION_SIGNATURE_KINDS]).toEqual([
      "AURA_APPLICATION_ON_ACTOR",
      "AURA_STACK_CHANGE_ON_ACTOR",
      "CAST_BY_ACTOR",
    ]);
  });

  it("the committed Brewmaster artifact reads Breath of Fire's single-id cast signature", () => {
    const loaded = parseAbilityCooldownArtifact(
      brewmasterCooldowns,
      "SIMC_DBC_MONK_BREWMASTER_ABILITY_COOLDOWNS",
    );
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const bof = loaded.abilities.find((entry) => entry.simcToken === "breath_of_fire");
    expect(bof?.knownDynamicMutations.map((mutation) => mutation.observableSignature?.kind)).toEqual([
      "CAST_BY_ACTOR",
    ]);
    expect(bof?.knownDynamicMutations[0]?.observableSignature).toMatchObject({ abilityGameIds: [121253] });
  });

  it("accepts multiple ids", () => {
    const loaded = brewmasterWithSignature({
      kind: "CAST_BY_ACTOR",
      abilityGameIds: [121253, 325153],
      basis: "b",
    });
    expect(loaded.ok).toBe(true);
  });

  it.each([
    ["empty ids", { kind: "CAST_BY_ACTOR", abilityGameIds: [], basis: "b" }],
    ["ids not an array", { kind: "CAST_BY_ACTOR", abilityGameIds: 121253, basis: "b" }],
    ["a string id", { kind: "CAST_BY_ACTOR", abilityGameIds: ["121253"], basis: "b" }],
    ["a fractional id", { kind: "CAST_BY_ACTOR", abilityGameIds: [121253.5], basis: "b" }],
    ["a missing basis", { kind: "CAST_BY_ACTOR", abilityGameIds: [121253] }],
    ["an unknown kind", { kind: "CAST_BEGUN_BY_ACTOR", abilityGameIds: [121253], basis: "b" }],
    ["a lowercase kind", { kind: "cast_by_actor", abilityGameIds: [121253], basis: "b" }],
  ])("refuses %s as a malformed mutation signature", (_label, signature) => {
    expect(brewmasterWithSignature(signature)).toMatchObject({ ok: false, reason: "INVALID_ABILITIES" });
  });

  it("the two existing aura forms still parse from the committed Paladin artifacts, byte for byte", () => {
    const protection = parseAbilityCooldownArtifact(
      protectionCooldowns,
      "SIMC_DBC_PALADIN_PROTECTION_ABILITY_COOLDOWNS",
    );
    const retribution = parseAbilityCooldownArtifact(
      retributionCooldowns,
      "SIMC_DBC_PALADIN_RETRIBUTION_ABILITY_COOLDOWNS",
    );
    expect(protection.ok && retribution.ok).toBe(true);
    if (!protection.ok || !retribution.ok) return;
    const kinds = [...protection.abilities, ...retribution.abilities].flatMap((entry) =>
      entry.knownDynamicMutations.flatMap((mutation) =>
        mutation.observableSignature === undefined ? [] : [mutation.observableSignature.kind],
      ),
    );
    expect(kinds).toEqual([
      "AURA_APPLICATION_ON_ACTOR",
      "AURA_APPLICATION_ON_ACTOR",
      "AURA_STACK_CHANGE_ON_ACTOR",
      "AURA_STACK_CHANGE_ON_ACTOR",
    ]);
    // No existing specialization declares a cast signature.
    expect(kinds).not.toContain("CAST_BY_ACTOR");
  });
});

// ---------------------------------------------------------------------------
// Absence proof
// ---------------------------------------------------------------------------

/** Canonical positions are indices, not ordinals: by default the query is the LAST event. */
const lastPosition = (state: CombatState): number => Math.max(...state.positionsOfKind("CAST"));
const absent = (
  state: CombatState,
  anchor = 0,
  query: number | undefined = undefined,
  signatures = [castSignature()],
) => dynamicMutationsAbsent(ability(signatures), state, ACTOR, anchor, query ?? lastPosition(state));

describe("actor scope", () => {
  it("a completed matching cast by the SAME actor strictly inside the interval withdraws the proof", () => {
    const state = stateWith([
      ANCHOR,
      { ordinal: 4, reportTimeMs: 5_000, abilityGameId: RESET_ABILITY },
      QUERY,
    ]);
    expect(absent(state)).toEqual({
      ok: false,
      reason: "the reset signature cast 121253 fired 1 time(s) between the anchor and the decision",
    });
  });

  it("another actor's matching cast is not a mutation of this actor's cooldown", () => {
    const state = stateWith([
      ANCHOR,
      { ordinal: 4, reportTimeMs: 5_000, abilityGameId: RESET_ABILITY, actorId: OTHER_ACTOR },
      QUERY,
    ]);
    expect(absent(state)).toEqual({
      ok: true,
      claims: ["OBSERVABLE_RESET_ABSENT:reset:CAST:121253:[1000..10000]"],
    });
  });

  it("an unrelated ability by the same actor is not a match", () => {
    const state = stateWith([ANCHOR, { ordinal: 4, reportTimeMs: 5_000, abilityGameId: UNRELATED }, QUERY]);
    expect(absent(state).ok).toBe(true);
  });

  it("any id of a multi-id signature matches", () => {
    const state = stateWith([ANCHOR, { ordinal: 4, reportTimeMs: 5_000, abilityGameId: 325153 }, QUERY]);
    expect(absent(state, 0, undefined, [castSignature([RESET_ABILITY, 325153])]).ok).toBe(false);
    expect(absent(state, 0, undefined, [castSignature([RESET_ABILITY])]).ok).toBe(true);
  });
});

describe("event semantics and the strict interval", () => {
  it("a BEGIN phase alone is not a completed cast and does not withdraw the proof", () => {
    const state = stateWith([
      ANCHOR,
      { ordinal: 4, reportTimeMs: 5_000, abilityGameId: RESET_ABILITY, castPhase: "BEGIN" },
      QUERY,
    ]);
    expect(absent(state).ok).toBe(true);
  });

  it("a matching cast at the anchor's own millisecond but AFTER it in canonical order is inside the interval", () => {
    const state = stateWith([
      ANCHOR,
      { ordinal: 1, reportTimeMs: 1_000, abilityGameId: RESET_ABILITY },
      QUERY,
    ]);
    expect(absent(state)).toEqual({
      ok: false,
      reason: "the reset signature cast 121253 fired 1 time(s) between the anchor and the decision",
    });
  });

  it("a matching cast BEFORE the anchor in canonical order (same millisecond) is outside the interval", () => {
    const state = stateWith([
      { ordinal: 0, reportTimeMs: 1_000, abilityGameId: RESET_ABILITY },
      { ordinal: 1, reportTimeMs: 1_000, abilityGameId: ANCHOR_ABILITY },
      QUERY,
    ]);
    expect(absent(state, 1, 2).ok).toBe(true);
  });

  it("the query event itself is outside the interval: a matching cast AT the decision is not a prior reset", () => {
    const state = stateWith([ANCHOR, { ordinal: 9, reportTimeMs: 10_000, abilityGameId: RESET_ABILITY }]);
    expect(absent(state, 0, 1).ok).toBe(true);
  });

  it("a matching cast at the query's millisecond but BEFORE it in canonical order is inside the interval", () => {
    const state = stateWith([
      ANCHOR,
      { ordinal: 8, reportTimeMs: 10_000, abilityGameId: RESET_ABILITY },
      QUERY,
    ]);
    expect(absent(state, 0, 2).ok).toBe(false);
  });

  it("a matching cast after the query is never consulted", () => {
    const state = stateWith([
      ANCHOR,
      QUERY,
      { ordinal: 10, reportTimeMs: 12_000, abilityGameId: RESET_ABILITY },
    ]);
    expect(absent(state, 0, 1).ok).toBe(true);
  });
});

describe("coverage", () => {
  it("COMPLETE CASTS coverage and zero matching casts proves absence, with the interval recorded", () => {
    const state = stateWith([ANCHOR, QUERY]);
    expect(absent(state, 0, 1)).toEqual({
      ok: true,
      claims: ["OBSERVABLE_RESET_ABSENT:reset:CAST:121253:[1000..10000]"],
    });
  });

  it("PARTIAL CASTS coverage over the interval refuses the proof, even with zero observed matches", () => {
    const state = stateWith([ANCHOR, QUERY], "PARTIAL");
    const result = absent(state, 0, 1);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.reason).toMatch(
        /^CASTS coverage is .* so the reset signature cast 121253 cannot be proven absent$/,
      );
  });

  it("UNVERIFIED CASTS coverage refuses the proof", () => {
    const result = absent(stateWith([ANCHOR, QUERY], "UNVERIFIED"), 0, 1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/^CASTS coverage is /);
  });
});

// ---------------------------------------------------------------------------
// Monotonicity through the shared derivation
// ---------------------------------------------------------------------------

function derived(
  state: CombatState,
  queryPosition: number,
  signatures: readonly MutationObservableSignature[],
) {
  const dataset: TokenCooldownDataset = {
    abilitiesFor: (token) => (token === "anchor_token" ? [ability(signatures)] : []),
    fallbackSourcePath: "engine/class_modules/monk/sc_monk.cpp",
  };
  const result = deriveTokenCooldown(
    dataset,
    { state, actorId: ACTOR, position: queryPosition, observedTalents: [] },
    "anchor_token",
  );
  if (result === null) throw new Error("expected a derivation");
  return result;
}

describe("monotone toward uncertainty", () => {
  it("with no matching cast, the signature leaves the existing negative proof intact", () => {
    const state = stateWith([ANCHOR, { ordinal: 4, reportTimeMs: 5_000, abilityGameId: UNRELATED }]);
    const without = derived(state, 1, []);
    const withSignature = derived(state, 1, [castSignature()]);
    expect(without.readiness).toMatchObject({ state: "PROVEN_NOT_READY", provenRemainingAtLeastMs: 11_000 });
    expect(withSignature.readiness).toEqual(without.readiness);
    expect(withSignature.perAbility[0]?.cooldown.state).toBe("BOUNDED");
  });

  it("a matching cast moves PROVEN_NOT_READY to UNKNOWN — never to a positive or exact state", () => {
    const state = stateWith([
      ANCHOR,
      { ordinal: 4, reportTimeMs: 5_000, abilityGameId: RESET_ABILITY },
      { ordinal: 5, reportTimeMs: 6_000, abilityGameId: UNRELATED },
    ]);
    const without = derived(state, 2, []);
    const withSignature = derived(state, 2, [castSignature()]);
    expect(without.readiness.state).toBe("PROVEN_NOT_READY");
    expect(withSignature.readiness).toEqual({ state: "UNKNOWN", reason: "COOLDOWN_STATE_UNKNOWN" });
    expect(withSignature.remainsSeconds).toBeNull();
    const cooldown = withSignature.perAbility[0]?.cooldown;
    expect(cooldown?.state).toBe("UNKNOWN");
    if (cooldown?.state === "UNKNOWN") {
      expect(cooldown.reason).toBe("MODIFIERS_NOT_PROVEN_ABSENT");
      // The anchor is still the anchoring cast of the cooldown itself — never the reset cast.
      expect(cooldown.anchor?.abilityGameId).toBe(ANCHOR_ABILITY);
    }
  });

  it("incomplete coverage moves PROVEN_NOT_READY to UNKNOWN as well", () => {
    const state = stateWith(
      [ANCHOR, { ordinal: 4, reportTimeMs: 10_000, abilityGameId: UNRELATED }],
      "PARTIAL",
    );
    expect(derived(state, 1, [castSignature()]).readiness.state).toBe("UNKNOWN");
  });

  it("the readiness vocabulary it can produce is exactly the pre-existing one: PROVEN_NOT_READY or UNKNOWN", () => {
    const outcomes = new Set<string>();
    for (const resetAt of [null, 2_000, 5_000]) {
      for (const coverage of ["COMPLETE", "PARTIAL", "UNVERIFIED"] as const) {
        const casts: Cast[] = [ANCHOR, { ordinal: 9, reportTimeMs: 10_000, abilityGameId: UNRELATED }];
        if (resetAt !== null)
          casts.splice(1, 0, { ordinal: 4, reportTimeMs: resetAt, abilityGameId: RESET_ABILITY });
        const result = derived(stateWith(casts, coverage), casts.length - 1, [castSignature()]);
        outcomes.add(result.readiness.state);
        expect(result.perAbility[0]?.cooldown.state).not.toBe("EXACT");
      }
    }
    expect([...outcomes].sort()).toEqual(["PROVEN_NOT_READY", "UNKNOWN"]);
  });
});
