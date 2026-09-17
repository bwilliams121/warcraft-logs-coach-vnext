/**
 * The Stealth readiness proof, and the asymmetry that keeps it honest.
 *
 * THE CLAIM
 *
 *     stealthed.rogue == TRUE   <=>   stealth_t::ready() == false
 *
 * because SimulationCraft passes the IDENTICAL mask to the IDENTICAL function at
 * both sites: `stealthed( STEALTH_BASIC | STEALTH_ROGUE )` guards the action
 * (sc_rogue.cpp:6086) and resolves the expression (sc_rogue.cpp:9661).
 *
 * That equivalence is what makes this the cheapest negative verdict in the
 * milestone — M5-C2's existing TRUE is already a readiness proof, and no new
 * combat state is read to use it as one.
 *
 * THE ASYMMETRY
 *
 * Only TRUE proves anything. `ready()` has further guards below the mask test,
 * so an UNKNOWN stealth state must produce UNKNOWN usability and never a
 * negative claim. Half these tests exist to pin that direction.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  STEALTH_READINESS_AUTHORITY,
  STEALTH_READINESS_METHOD,
} from "../../src/data/game/stealth-readiness-authority.js";
import {
  STEALTHED_ROGUE_CONTRIBUTORS,
  STEALTHED_ROGUE_EXCLUSIONS,
  bindStealthedRogue,
} from "../../src/specs/rogue/assassination/stealth-state.js";
import { resolveUsability } from "../../src/specs/rogue/assassination/action-profile.js";
import { authorityProfileFor } from "../../src/specs/rogue/assassination/observed-profile.js";
import { pinnedAssassinationAuthority } from "../../src/simc/pinned-authority.js";
import { OBSERVED_UNUSABLE_REASONS, UNUSABLE_REASONS } from "../../src/simc/action-applicability.js";
import { tryAbilityIdentityFor } from "../../src/data/game/rogue-abilities.js";
import { M5C3C1_ACTOR, M5C3C1_IDS, garroteDecisionPosition, m5c3c1State } from "../support/m5c3c1-fixture.js";
import type { AplAction } from "../../src/simc/apl-authority.js";

const SIMC_COMMIT = "33622e9d1662ff0e451691edf85a6b49cc9d11d9";
const ROGUE_MODULE_PATH = "engine/class_modules/sc_rogue.cpp";
const ROGUE_MODULE_SHA256 = "209e95265aae4168cf7cda57d1b241dda6361971ba6849a9262bd933bff3e13e";

function stealthEntry(): AplAction {
  const loaded = pinnedAssassinationAuthority();
  if (!loaded.ok) throw new Error("pinned authority unavailable");
  const list = loaded.authority.actionsInList("default");
  if (!list.found) throw new Error("no default list");
  const action = list.actions.find((entry) => entry.priorityOrdinal === 0);
  if (action === undefined) throw new Error("no default[0]");
  return action;
}

const abilityIdFor = (token: string): number | null => tryAbilityIdentityFor(token)?.spellId ?? null;

function usabilityAt(position: number) {
  const state = m5c3c1State();
  const profile = authorityProfileFor(state, M5C3C1_ACTOR);
  if (profile === null) throw new Error("expected a profile");
  return resolveUsability(
    { state, actorId: M5C3C1_ACTOR, position, profile },
    stealthEntry(),
    M5C3C1_IDS.garrote,
    abilityIdFor,
  );
}

describe("the readiness guard and the APL expression are the same query", () => {
  it("records ONE shared mask expression, not two that could drift", () => {
    // A single field on purpose. Two fields would make a future divergence
    // between the guard and the expression expressible, and the entire proof is
    // that no such divergence exists.
    expect(STEALTH_READINESS_AUTHORITY.sharedMaskExpression).toBe("STEALTH_BASIC | STEALTH_ROGUE");
    expect(Object.keys(STEALTH_READINESS_AUTHORITY)).not.toContain("readyMaskExpression");
    expect(Object.keys(STEALTH_READINESS_AUTHORITY)).not.toContain("expressionMaskExpression");
  });

  it("cites both sites, and they cite the same mask", () => {
    const byClaim = new Map(STEALTH_READINESS_AUTHORITY.checks.map((check) => [check.claim, check]));
    const guard = byClaim.get("STEALTH_READY_IS_GUARDED_ON_THE_MASK");
    const expression = byClaim.get("STEALTHED_ROGUE_EXPRESSION_USES_THE_SAME_MASK");
    expect(guard?.symbol).toBe("stealth_t::ready");
    expect(expression?.symbol).toContain("stealthed.rogue");
    for (const check of [guard, expression]) {
      expect(check?.finding).toContain("STEALTH_BASIC | STEALTH_ROGUE");
      expect(check?.startLine ?? 0).toBeGreaterThan(0);
      expect(check?.endLine ?? 0).toBeGreaterThanOrEqual(check?.startLine ?? 0);
    }
  });

  it("expands the mask to exactly the bits M5-C2 already models", () => {
    // The two records must agree about what `stealthed.rogue` means, or the
    // equivalence would be between different questions.
    expect([...STEALTH_READINESS_AUTHORITY.sharedMaskBits].sort()).toEqual([
      "STEALTH_NORMAL",
      "STEALTH_SHADOW_DANCE",
      "STEALTH_SUBTERFUGE",
      "STEALTH_VANISH",
    ]);
    for (const contributor of STEALTHED_ROGUE_CONTRIBUTORS) {
      expect(STEALTH_READINESS_AUTHORITY.sharedMaskBits, contributor.displayNameEn).toContain(
        contributor.simcMaskBit,
      );
    }
    // And the excluded auras are excluded from the shared mask too: an Improved
    // Garrote aura alone can never make Stealth unready.
    for (const exclusion of STEALTHED_ROGUE_EXCLUSIONS) {
      expect(exclusion.whyExcluded).toContain("STEALTH_BASIC | STEALTH_ROGUE");
    }
  });

  it("is labelled as a human's reading, pinned to measured bytes", () => {
    expect(STEALTH_READINESS_AUTHORITY.method).toBe(STEALTH_READINESS_METHOD);
    expect(STEALTH_READINESS_METHOD).toBe("HAND_REVIEWED_CPP_MASK_EQUIVALENCE");
    // NOT a machine-extraction marker. No table contains this claim.
    expect(STEALTH_READINESS_AUTHORITY.method).not.toBe("MACHINE_EXTRACTED_DBC_RECORD");
    expect(STEALTH_READINESS_AUTHORITY.commitSha).toBe(SIMC_COMMIT);
    expect(STEALTH_READINESS_AUTHORITY.sourcePath).toBe(ROGUE_MODULE_PATH);
    // The same hash M5-C1 pins, so the two cannot drift apart silently.
    expect(STEALTH_READINESS_AUTHORITY.sourceSha256).toBe(ROGUE_MODULE_SHA256);
  });

  it("records why the verdict is APPLICABLE rather than NOT_APPLICABLE", () => {
    const check = STEALTH_READINESS_AUTHORITY.checks.find(
      (entry) => entry.claim === "THE_ACTION_IS_NEVER_MARKED_BACKGROUND",
    );
    expect(check?.finding).toContain("background");
  });
});

describe("a proven TRUE makes Stealth unusable, and nothing else does", () => {
  it("returns PROVEN_UNUSABLE(ALREADY_STEALTHED) at the real decision point", () => {
    const state = m5c3c1State();
    const position = garroteDecisionPosition(state);
    expect(bindStealthedRogue({ state, actorId: M5C3C1_ACTOR, position }).value).toBe("TRUE");

    const verdict = usabilityAt(position);
    expect(verdict.kind).toBe("PROVEN_UNUSABLE");
    if (verdict.kind !== "PROVEN_UNUSABLE") return;
    expect(verdict.reason).toBe("ALREADY_STEALTHED");
  });

  it("returns UNKNOWN where the stealth state is not established", () => {
    // THE asymmetry. At the very start of the slice no stealth aura is proven, so
    // `stealthed.rogue` is UNKNOWN — and an unknown state must not become a
    // negative claim, because `ready()` has guards this record does not model.
    const state = m5c3c1State();
    expect(bindStealthedRogue({ state, actorId: M5C3C1_ACTOR, position: 0 }).value).toBe("UNKNOWN");
    expect(usabilityAt(0).kind).toBe("UNKNOWN");
  });

  it("fabricates no condition for the entry", () => {
    // `default[0] stealth` carries no `,if=` at all in the pinned APL. The
    // verdict is about readiness, and nothing here invents a gate to evaluate.
    expect(stealthEntry().conditionRaw).toBeNull();
    expect(stealthEntry().actionStringVerbatim).toBe("stealth");
  });

  it("models no transition, because there is nothing to transition", () => {
    // Stealth cannot fire at this decision point, so C3c3a builds no state
    // change for it and no cooldown model. Asserted structurally so a later
    // milestone has to add it deliberately rather than by accident.
    const code = readFileSync("src/specs/rogue/assassination/action-profile.ts", "utf8");
    expect(code).not.toContain("NonGcdTransition");
    expect(code).not.toContain("cooldowns.stealth");
  });

  it("keeps ALREADY_STEALTHED in a vocabulary of OBSERVED reasons", () => {
    // WIDENED AGAIN AT M5-C3c3c, which added a fourth member — and the fourth is
    // a different KIND of claim. `SIMULATED_PREFIX_EXECUTION` describes a branch
    // of a simulation, not the fight that happened.
    //
    // So the assertion that matters here is not the count. It is that
    // ALREADY_STEALTHED is in the OBSERVED set: it rests on an aura M5-C2 proved
    // from real events, and a consumer filtering for claims about the log must
    // still find it.
    expect([...UNUSABLE_REASONS]).toEqual([
      "ACTIVE_COOLDOWN",
      "STATIC_READY_FALSE",
      "ALREADY_STEALTHED",
      // M5-D1. The COMPLEMENT of ALREADY_STEALTHED — the player is NOT in the
      // state, and the game will not let them re-enter it while an enemy lives.
      "RESTEALTH_NOT_PERMITTED_IN_COMBAT",
      // M5-D1. A different function guarding a different set: vanish_t::ready()
      // tests ONE named buff, not the four-aura stealthed.rogue mask.
      "VANISH_BUFF_ALREADY_ACTIVE",
      "SIMULATED_PREFIX_EXECUTION",
      // M10-C4. A resource KNOWN below a PINNED cost with every free-cast
      // route disproved: `action_t::ready()` fails cost_affordable(). It rests
      // on observed resource evidence, so it is an OBSERVED reason.
      "INSUFFICIENT_RESOURCE",
      // M10-C5 Phase B. An action whose own ready() requires an aura that M4
      // proved INACTIVE from an observed removal (Hammer of Wrath outside
      // wings, aura 1277026). Observed evidence, so an OBSERVED reason.
      "REQUIRED_AURA_INACTIVE",
    ]);
    expect([...OBSERVED_UNUSABLE_REASONS]).toContain("REQUIRED_AURA_INACTIVE");
    // The new reasons describe the OBSERVED fight, so they belong to the
    // observed set. Only the counterfactual one is excluded from it.
    expect([...OBSERVED_UNUSABLE_REASONS]).toContain("RESTEALTH_NOT_PERMITTED_IN_COMBAT");
    expect([...OBSERVED_UNUSABLE_REASONS]).toContain("VANISH_BUFF_ALREADY_ACTIVE");
    expect([...OBSERVED_UNUSABLE_REASONS]).toContain("ALREADY_STEALTHED");
    expect([...OBSERVED_UNUSABLE_REASONS]).toContain("INSUFFICIENT_RESOURCE");
    expect([...OBSERVED_UNUSABLE_REASONS]).not.toContain("SIMULATED_PREFIX_EXECUTION");
  });

  it("keeps the state reason free of any timing evidence", () => {
    // Reporting a state refusal with a remaining time would tell a reader to
    // wait for something. Nothing here is recharging.
    const state = m5c3c1State();
    const verdict = usabilityAt(garroteDecisionPosition(state));
    if (verdict.kind !== "PROVEN_UNUSABLE") throw new Error("expected a negative verdict");
    expect(verdict.evidence.provenRemainingAtLeastMs).toBeNull();
    expect(verdict.evidence.cooldownToleranceMs).toBeNull();
    expect(verdict.evidence.itemId).toBeNull();
  });
});
