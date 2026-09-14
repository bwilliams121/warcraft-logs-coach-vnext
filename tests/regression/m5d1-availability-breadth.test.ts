/**
 * M5-D1 availability breadth, against the real actor-19 capture.
 *
 * FOUR PRIMITIVES, ONE THEME: an action that provably could not fire is a
 * candidate removed from the scan, and every removal here rests on POSITIVE
 * evidence rather than on the absence of a restriction.
 *
 *     static in-combat Stealth   in combat with a living enemy, re-stealth is
 *                                not permitted, whatever the cooldown says
 *     one-charge cooldown        Vanish's charge system is arithmetically an
 *                                ordinary cooldown, and its recharge is the
 *                                CHARGE cooldown rather than the nominal one
 *     Deathmark cooldown         an ordinary 120 s cooldown, same shape as
 *                                Kingsbane
 *     Vanish ready guard         unready while its own buff is up
 */

import { describe, expect, it } from "vitest";

import {
  M5C3C1_ACTOR,
  M5C3C1_IDS,
  M5C3C1_TARGET,
  findCastAt,
  garroteDecisionPosition,
  kingsbaneCastPosition,
  m5c3c1State,
} from "../support/m5c3c1-fixture.js";
import { authorityProfileFor } from "../../src/specs/rogue/assassination/observed-profile.js";
import { pinnedAssassinationAuthority } from "../../src/simc/pinned-authority.js";
import { resolveUsability } from "../../src/specs/rogue/assassination/action-profile.js";
import { bindCombatEngagement } from "../../src/specs/rogue/assassination/combat-engagement.js";
import { deriveCooldown } from "../../src/specs/rogue/assassination/cooldown-bindings.js";
import { cooldownRemainingAt } from "../../src/engine/game-state/cooldowns/cooldown-state.js";
import { cooldownForToken } from "../../src/data/game/rogue-cooldowns.js";
import { tryAbilityIdentityFor } from "../../src/data/game/rogue-abilities.js";
import type { AplAction } from "../../src/simc/apl-authority.js";

const abilityIdFor = (token: string): number | null => tryAbilityIdentityFor(token)?.spellId ?? null;

function entryAt(listName: string, ordinal: number): AplAction {
  const loaded = pinnedAssassinationAuthority();
  if (!loaded.ok) throw new Error("pinned authority unavailable");
  const list = loaded.authority.actionsInList(listName);
  if (!list.found) throw new Error(`no ${listName} list`);
  const action = list.actions.find((entry) => entry.priorityOrdinal === ordinal);
  if (action === undefined) throw new Error(`no ${listName}[${String(ordinal)}]`);
  return action;
}

function profileInputAt(position: number, options: { readonly withTarget?: boolean } = {}) {
  const state = m5c3c1State();
  const profile = authorityProfileFor(state, M5C3C1_ACTOR);
  if (profile === null) throw new Error("the fixture must carry combatantinfo for actor 19");
  return {
    state,
    actorId: M5C3C1_ACTOR,
    position,
    profile,
    ...(options.withTarget === false ? {} : { engagementTargetActorId: M5C3C1_TARGET }),
  };
}

/** A position where actor 19 is NOT proven stealthed but IS mid-fight. */
function nonStealthPosition(): number {
  const state = m5c3c1State();
  // The Envenom at Q-995. Stealth is not established here, and Garrote is on the
  // target — the two conditions the in-combat proof needs.
  return findCastAt(state, {
    actorId: M5C3C1_ACTOR,
    reportTimeMs: 2_175_585,
    abilityGameId: M5C3C1_IDS.envenom,
  });
}

describe("Stealth is statically unusable in combat with a living enemy", () => {
  it("proves the engagement from a debuff this player holds on the enemy", () => {
    const input = profileInputAt(nonStealthPosition());
    const engagement = bindCombatEngagement({
      state: input.state,
      actorId: M5C3C1_ACTOR,
      targetActorId: M5C3C1_TARGET,
      position: input.position,
    });
    expect(engagement.state).toBe("ENGAGED");
    if (engagement.state !== "ENGAGED") return;
    expect(engagement.enemy.enemyActorId).toBe(M5C3C1_TARGET);
    // Garrote (703), proven ACTIVE from an observed application.
    expect(engagement.enemy.abilityGameId).toBe(M5C3C1_IDS.garrote);
    expect(engagement.elapsedFightTimeMs).toBeGreaterThan(0);
  });

  it("makes default[0] PROVEN_UNUSABLE outside stealth", () => {
    const input = profileInputAt(nonStealthPosition());
    const verdict = resolveUsability(input, entryAt("default", 0), M5C3C1_IDS.envenom, abilityIdFor);
    expect(verdict.kind).toBe("PROVEN_UNUSABLE");
    if (verdict.kind !== "PROVEN_UNUSABLE") return;
    expect(verdict.reason).toBe("RESTEALTH_NOT_PERMITTED_IN_COMBAT");
    // NOT a timing claim: nothing is waiting to recharge.
    expect(verdict.evidence.provenRemainingAtLeastMs).toBeNull();
    expect(verdict.evidence.cooldownToleranceMs).toBeNull();
  });

  it("keeps ALREADY_STEALTHED at the stealthed decision point", () => {
    // The more specific claim still wins where it applies. At Q the Vanish buff
    // is up, so the FIRST guard in `stealth_t::ready()` is what returns false.
    const state = m5c3c1State();
    const input = profileInputAt(garroteDecisionPosition(state));
    const verdict = resolveUsability(input, entryAt("default", 0), M5C3C1_IDS.garrote, abilityIdFor);
    expect(verdict.kind).toBe("PROVEN_UNUSABLE");
    if (verdict.kind !== "PROVEN_UNUSABLE") return;
    expect(verdict.reason).toBe("ALREADY_STEALTHED");
  });

  it("is UNKNOWN without a target to prove engagement against", () => {
    // MISSING EVIDENCE, NOT A NEGATIVE CLAIM. Without an enemy the proof has
    // nothing to rest on, and the entry stays an unresolved candidate.
    const input = profileInputAt(nonStealthPosition(), { withTarget: false });
    const verdict = resolveUsability(input, entryAt("default", 0), M5C3C1_IDS.envenom, abilityIdFor);
    expect(verdict.kind).toBe("UNKNOWN");
  });

  it("is UNKNOWN when no debuff by this player is proven active on the target", () => {
    // Actor 22 is a real enemy in this capture that actor 19 holds no supported
    // DoT on at this instant. Silence about it is not evidence it is absent, and
    // it is not evidence it is present either.
    const input = profileInputAt(nonStealthPosition());
    const engagement = bindCombatEngagement({
      state: input.state,
      actorId: M5C3C1_ACTOR,
      targetActorId: 999_999,
      position: input.position,
    });
    expect(engagement.state).toBe("UNKNOWN");
    if (engagement.state !== "UNKNOWN") return;
    expect(engagement.blocker).toBe("NO_LIVING_ENEMY_PROVEN");
  });

  it("is UNKNOWN when the position resolves to no fight time", () => {
    const input = profileInputAt(nonStealthPosition());
    const engagement = bindCombatEngagement({
      state: input.state,
      actorId: M5C3C1_ACTOR,
      targetActorId: M5C3C1_TARGET,
      position: 10_000_000,
    });
    expect(engagement.state).toBe("UNKNOWN");
    if (engagement.state !== "UNKNOWN") return;
    expect(engagement.blocker).toBe("FIGHT_TIME_NOT_ESTABLISHED");
  });
});

describe("the one-charge cooldown case", () => {
  it("carries Vanish as a one-charge system with a 120s recharge", () => {
    const identity = cooldownForToken("vanish");
    expect(identity).not.toBeNull();
    if (identity === null) return;
    expect(identity.abilityGameId).toBe(1_856);
    expect(identity.charges).toBe(1);
    expect(identity.chargeCooldownMs).toBe(120_000);
    // The NOMINAL cooldown is one second and is NOT the recharge. Reading it
    // would report a two-minute ability as almost always ready.
    expect(identity.baseCooldownMs).toBe(1_000);
  });

  it("derives the recharge from the CHARGE cooldown, never the nominal one", () => {
    const state = m5c3c1State();
    const derived = deriveCooldown(
      { state, actorId: M5C3C1_ACTOR, position: garroteDecisionPosition(state) },
      "vanish",
    );
    expect(derived).not.toBeNull();
    if (derived === null || derived.cooldown.state !== "BOUNDED") {
      throw new Error("expected a bounded Vanish cooldown");
    }
    expect(derived.cooldown.baseCooldownMs).toBe(120_000);
    expect(derived.cooldown.elapsedMs).toBe(460);
    expect(derived.cooldown.atLeastRemainingMs).toBe(119_540);
  });

  it("keeps the derivation BOUNDED, never EXACT", () => {
    // C3c1's lag epistemics are unchanged: SimulationCraft starts a cooldown
    // with a non-negative sampled delay, so an observed cast proves a LOWER
    // bound and never an equality.
    const state = m5c3c1State();
    const derived = deriveCooldown(
      { state, actorId: M5C3C1_ACTOR, position: garroteDecisionPosition(state) },
      "vanish",
    );
    expect(derived?.cooldown.state).toBe("BOUNDED");
    expect(derived?.remainsSeconds?.state).toBe("BOUNDED_NUMBER");
  });

  it("still refuses TWO or more charges", () => {
    // The equivalence argument holds for exactly one charge. At two, "remaining"
    // stops being one number: the ability is usable NOW and recharging.
    const state = m5c3c1State();
    const refused = cooldownRemainingAt({
      state,
      actorId: M5C3C1_ACTOR,
      abilityGameId: M5C3C1_IDS.vanishAction,
      baseCooldownMs: 1_000,
      chargeCooldownMs: 120_000,
      charges: 2,
      modifierPolicy: {
        kind: "NO_MODIFIERS_PROVEN_ABSENT",
        sourcePath: "test",
        sourceSha256: "0".repeat(64),
        claims: ["TEST"],
      },
      position: garroteDecisionPosition(state),
    });
    expect(refused.state).toBe("UNKNOWN");
    if (refused.state !== "UNKNOWN") return;
    expect(refused.reason).toBe("CHARGES_NOT_MODELLED");
  });

  it("refuses a charge system whose charge count the caller omitted", () => {
    // A forgotten count must not fall into the supported path.
    const state = m5c3c1State();
    const refused = cooldownRemainingAt({
      state,
      actorId: M5C3C1_ACTOR,
      abilityGameId: M5C3C1_IDS.vanishAction,
      baseCooldownMs: 1_000,
      chargeCooldownMs: 120_000,
      modifierPolicy: {
        kind: "NO_MODIFIERS_PROVEN_ABSENT",
        sourcePath: "test",
        sourceSha256: "0".repeat(64),
        claims: ["TEST"],
      },
      position: garroteDecisionPosition(state),
    });
    expect(refused.state).toBe("UNKNOWN");
    if (refused.state !== "UNKNOWN") return;
    expect(refused.reason).toBe("CHARGES_NOT_MODELLED");
  });

  it("leaves the ordinary no-charge path exactly as it was", () => {
    // Kingsbane: `_charge_cooldown` 0, so the else-branch applies and the
    // nominal cooldown IS the duration. C3c1's number is unchanged.
    const state = m5c3c1State();
    const derived = deriveCooldown(
      { state, actorId: M5C3C1_ACTOR, position: garroteDecisionPosition(state) },
      "kingsbane",
    );
    if (derived?.cooldown.state !== "BOUNDED") throw new Error("expected a bounded Kingsbane cooldown");
    expect(derived.cooldown.baseCooldownMs).toBe(60_000);
    expect(derived.cooldown.atLeastRemainingMs).toBe(57_198);
  });
});

describe("Vanish and Deathmark authority data", () => {
  it("records a machine-checked absence proof for each", () => {
    for (const token of ["vanish", "deathmark", "kingsbane"]) {
      const identity = cooldownForToken(token);
      expect(identity, token).not.toBeNull();
      if (identity === null) continue;
      const claims = identity.modifierPolicy.checks.map((check) => check.claim);
      // The decisive one: nothing in the Rogue module mutates this cooldown.
      // The extractor re-counts `cooldowns.<token>->` on every run, so this
      // cannot age into a false statement.
      expect(claims, token).toContain("NO_DIRECT_COOLDOWN_ADJUSTMENT");
      expect(claims, token).toContain("NO_ACTION_LEVEL_COOLDOWN_OVERRIDE");
      expect(identity.modifierPolicy.sourcePath, token).toBe("engine/class_modules/sc_rogue.cpp");
      expect(identity.modifierPolicy.sourceSha256, token).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("records WHICH charge shape each row exhibits", () => {
    const vanishClaims = (cooldownForToken("vanish")?.modifierPolicy.checks ?? []).map((c) => c.claim);
    expect(vanishClaims).toContain("ONE_CHARGE_IS_AN_ORDINARY_COOLDOWN");
    expect(vanishClaims).not.toContain("NO_CHARGE_SYSTEM");

    const deathmarkClaims = (cooldownForToken("deathmark")?.modifierPolicy.checks ?? []).map((c) => c.claim);
    expect(deathmarkClaims).toContain("NO_CHARGE_SYSTEM");
    expect(deathmarkClaims).not.toContain("ONE_CHARGE_IS_AN_ORDINARY_COOLDOWN");
  });

  it("records that the extra-charge talent is unimplemented at this commit", () => {
    // `Without a Trace` grants a second Vanish charge in the live game. The
    // ONE_CHARGE equivalence holds only while SimulationCraft does not implement
    // it, so that fact is a recorded, re-counted claim rather than an assumption.
    const claims = (cooldownForToken("vanish")?.modifierPolicy.checks ?? []).map((c) => c.claim);
    expect(claims).toContain("EXTRA_CHARGE_TALENT_IS_NOT_IMPLEMENTED");
  });

  it("carries Deathmark as an ordinary 120s cooldown", () => {
    const identity = cooldownForToken("deathmark");
    expect(identity).not.toBeNull();
    if (identity === null) return;
    expect(identity.abilityGameId).toBe(360_194);
    expect(identity.baseCooldownMs).toBe(120_000);
    expect(identity.charges).toBe(0);
    expect(identity.chargeCooldownMs).toBe(0);
  });

  it("eliminates cds[0] on readiness from an observed Deathmark cast", () => {
    const state = m5c3c1State();
    const input = profileInputAt(garroteDecisionPosition(state));
    const verdict = resolveUsability(input, entryAt("cds", 0), M5C3C1_IDS.garrote, abilityIdFor);
    expect(verdict.kind).toBe("PROVEN_UNUSABLE");
    if (verdict.kind !== "PROVEN_UNUSABLE") return;
    expect(verdict.reason).toBe("ACTIVE_COOLDOWN");
    // 120000 - 3803 elapsed.
    expect(verdict.evidence.provenRemainingAtLeastMs).toBe(116_197);
    expect(verdict.evidence.abilityGameId).toBe(360_194);
  });

  it("keeps the predictive half of cds[0] unresolved even so", () => {
    // READINESS eliminated the entry, and that is a fact about a cooldown. It is
    // NOT a claim that the condition was false, and `target.time_to_die` and
    // `fight_remains` remain unbindable — so a READY Deathmark would still not
    // be selectable. M5-D1 changes nothing about that.
    const state = m5c3c1State();
    const input = profileInputAt(garroteDecisionPosition(state));
    const verdict = resolveUsability(input, entryAt("cds", 0), M5C3C1_IDS.garrote, abilityIdFor);
    if (verdict.kind !== "PROVEN_UNUSABLE") throw new Error("expected a negative verdict");
    // The evidence is about a cooldown, and says nothing about the condition.
    expect(verdict.evidence.detail).not.toContain("time_to_die");
    expect(verdict.evidence.detail).not.toContain("fight_remains");
  });

  it("proves Vanish unusable while its own buff is up", () => {
    // `vanish_t::ready()` returns false while `buffs.vanish` is checked, which is
    // a DIFFERENT guard from the four-aura stealth mask.
    const state = m5c3c1State();
    const input = profileInputAt(garroteDecisionPosition(state));
    const verdict = resolveUsability(input, entryAt("vanish", 0), M5C3C1_IDS.garrote, abilityIdFor);
    expect(verdict.kind).toBe("PROVEN_UNUSABLE");
    if (verdict.kind !== "PROVEN_UNUSABLE") return;
    expect(verdict.reason).toBe("VANISH_BUFF_ALREADY_ACTIVE");
    // The BUFF (11327), never the ACTION (1856).
    expect(verdict.evidence.abilityGameId).toBe(M5C3C1_IDS.vanishBuff);
    expect(verdict.evidence.abilityGameId).not.toBe(M5C3C1_IDS.vanishAction);
  });

  it("falls through to the cooldown path when the Vanish buff is not up", () => {
    // At the Kingsbane cast, no Vanish has happened yet in this window, so
    // neither the buff guard nor a cooldown anchor applies and the honest answer
    // is UNKNOWN — not "ready", and not "unusable".
    const state = m5c3c1State();
    const input = profileInputAt(kingsbaneCastPosition(state));
    const verdict = resolveUsability(input, entryAt("vanish", 0), M5C3C1_IDS.kingsbane, abilityIdFor);
    expect(verdict.kind).toBe("UNKNOWN");
  });
});
