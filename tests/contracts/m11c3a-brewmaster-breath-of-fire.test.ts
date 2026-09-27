/**
 * M11-C3a: Breath of Fire's cooldown, pinned with its Keg Smash reset as a
 * CAST_BY_ACTOR signature — over the committed Brewmaster capture.
 *
 * What this pins:
 *
 *   safety        the new negative proof NEVER says Breath of Fire was not
 *                 ready at a point where the player actually cast it — at an
 *                 observed Breath of Fire, and at every completed cast of the
 *                 actor at the same millisecond. (A consistency check, not a
 *                 readiness claim.)
 *   the proof     withdrawn exactly where a Keg Smash sits between the
 *                 anchoring Breath of Fire and the decision, absent where
 *                 there is no anchor, standing everywhere else
 *   movement      the three Keg Smash decisions at +10.7 s, +15.2 s and
 *                 +19.3 s MATCH at shado_pan[1]; the two Breath of Fire MATCHes
 *                 stay MATCH; Blackout Kick +17.3 s and Tiger Palm +18.3 s move
 *                 to Keg Smash readiness; the eight Purifying Brew refusals
 *                 are untouched; nothing becomes REJECTED
 *   scope         Keg Smash stays unpinned, `cooldown.keg_smash.charges_fractional`
 *                 stays unbound, and no brew transition contract exists
 */

import { describe, expect, it } from "vitest";

import { brewmasterCooldownAbilitiesFor } from "../../src/data/game/monk-brewmaster-cooldowns.js";
import { brewmasterTransitionContractFor } from "../../src/data/game/monk-brewmaster-transition-authority.js";
import {
  deriveBrewmasterCooldown,
  SUPPORTED_BREWMASTER_COOLDOWN_TOKENS,
} from "../../src/specs/monk/brewmaster/cooldown-bindings.js";
import { dynamicMutationsAbsent } from "../../src/findings/cooldowns/token-cooldown-derivation.js";
import { analyzeObservedBrewmasterMonkDecisions } from "../../src/specs/monk/brewmaster/observed-analysis.js";
import { BREWMASTER_MONK_REGISTRATION } from "../../src/specs/monk/brewmaster/registration.js";
import { BREWMASTER_MONK_SPEC_ID } from "../../src/specs/monk/brewmaster/spec.js";
import type { CombatState } from "../../src/engine/state/combat-state.js";
import { corpusState } from "../support/corpus/fight.js";

const GTKB = "wcl-brewmaster-monk-gtkb-opener";
const ACTOR = 4;
const [KEG_SMASH, BLACKOUT_KICK, TIGER_PALM, BREATH_OF_FIRE] = [121253, 205523, 100780, 115181];

const state = corpusState(GTKB);

function talents(s: CombatState) {
  for (const position of s.positionsOfKind("COMBATANT_INFO")) {
    const event = s.eventAt(position);
    if (event?.kind === "COMBATANT_INFO" && event.snapshot.actorId === ACTOR) {
      return event.snapshot.talentTree.map((entry) => ({ id: entry.id, nodeId: entry.nodeId }));
    }
  }
  throw new Error("no combatant info");
}
const observedTalents = talents(state);

/** Every COMPLETE cast by the actor, in canonical order. */
const casts = state.positionsBySourceActor(ACTOR).flatMap((position) => {
  const event = state.eventAt(position);
  return event?.kind === "CAST" && event.castPhase === "COMPLETE" && event.abilityGameId !== null
    ? [{ position, abilityGameId: event.abilityGameId, reportTimeMs: event.reportTimeMs }]
    : [];
});

const bofAt = (position: number) => {
  const derived = deriveBrewmasterCooldown(
    { state, actorId: ACTOR, position, observedTalents },
    "breath_of_fire",
  );
  if (derived === null) throw new Error("breath_of_fire is not pinned");
  return derived;
};

const analysis = (() => {
  const result = analyzeObservedBrewmasterMonkDecisions({
    state,
    actorId: ACTOR,
    specId: BREWMASTER_MONK_SPEC_ID,
    targetActorId: null,
    authority: BREWMASTER_MONK_REGISTRATION.authority,
  });
  if (result.status !== "ANALYZED") throw new Error(result.status);
  return result;
})();

describe("safety: the negative proof never contradicts an observed Breath of Fire", () => {
  const bofCasts = casts.filter((cast) => cast.abilityGameId === BREATH_OF_FIRE);

  it("the capture holds three Breath of Fire casts", () => {
    expect(bofCasts.map((cast) => cast.reportTimeMs)).toEqual([2416677, 2427076, 2431304]);
  });

  it("at every observed Breath of Fire, its readiness is NEVER PROVEN_NOT_READY", () => {
    for (const cast of bofCasts) {
      expect(bofAt(cast.position).readiness.state, String(cast.reportTimeMs)).not.toBe("PROVEN_NOT_READY");
    }
  });

  it("…and at every completed cast sharing an observed Breath of Fire's millisecond", () => {
    for (const bof of bofCasts) {
      for (const cast of casts.filter((candidate) => candidate.reportTimeMs === bof.reportTimeMs)) {
        if (cast.position > bof.position) continue; // after the cast, the new cooldown is running
        expect(
          bofAt(cast.position).readiness.state,
          `${String(cast.reportTimeMs)}#${String(cast.position)}`,
        ).not.toBe("PROVEN_NOT_READY");
      }
    }
  });

  it("each repeat Breath of Fire inside 15 s is preceded by a Keg Smash reset — the capture corroborates the mechanic", () => {
    for (let index = 1; index < bofCasts.length; index += 1) {
      const previous = bofCasts[index - 1]!;
      const current = bofCasts[index]!;
      if (current.reportTimeMs - previous.reportTimeMs >= 15_000) continue;
      const resets = casts.filter(
        (cast) =>
          cast.abilityGameId === KEG_SMASH &&
          cast.position > previous.position &&
          cast.position < current.position,
      );
      expect(resets.length, String(current.reportTimeMs)).toBeGreaterThan(0);
    }
  });
});

describe("the proof over the eligible decisions", () => {
  it("is withdrawn exactly where a Keg Smash sits between the anchor and the decision, absent without an anchor, standing elsewhere", () => {
    const rows = analysis.resolved.map((entry) => {
      const cooldown = entry.cooldowns.find((row) => row.simcToken === "breath_of_fire");
      const detail = cooldown?.perAbility[0]?.cooldown;
      return [
        state.eventAt(entry.position)?.reportTimeMs,
        cooldown?.readiness.state,
        detail?.state === "UNKNOWN" ? detail.reason : null,
      ];
    });
    expect(rows).toEqual([
      [2415223, "UNKNOWN", "NO_OBSERVED_CAST"],
      [2416677, "UNKNOWN", "NO_OBSERVED_CAST"],
      [2417682, "PROVEN_NOT_READY", null],
      [2419027, "PROVEN_NOT_READY", null],
      [2423448, "PROVEN_NOT_READY", null],
      [2424688, "PROVEN_NOT_READY", null],
      [2425704, "PROVEN_NOT_READY", null],
      [2427076, "UNKNOWN", "MODIFIERS_NOT_PROVEN_ABSENT"],
      [2428219, "PROVEN_NOT_READY", null],
      [2429224, "PROVEN_NOT_READY", null],
      [2430227, "PROVEN_NOT_READY", null],
      [2431304, "UNKNOWN", "MODIFIERS_NOT_PROVEN_ABSENT"],
      [2432314, "PROVEN_NOT_READY", null],
      [2433311, "PROVEN_NOT_READY", null],
      [2434312, "PROVEN_NOT_READY", null],
    ]);
  });

  it("the withheld proof is withheld for the Keg Smash reset signature, keeps its own anchor and binds no remainder", () => {
    const at = casts.find((cast) => cast.reportTimeMs === 2427076 && cast.abilityGameId === BREATH_OF_FIRE)!;
    const anchor = casts.find(
      (cast) => cast.reportTimeMs === 2416677 && cast.abilityGameId === BREATH_OF_FIRE,
    )!;
    const [record] = brewmasterCooldownAbilitiesFor("breath_of_fire");
    expect(dynamicMutationsAbsent(record!, state, ACTOR, anchor.position, at.position)).toEqual({
      ok: false,
      reason: "the reset signature cast 121253 fired 1 time(s) between the anchor and the decision",
    });
    const derived = bofAt(at.position);
    // The anchor is the previous Breath of Fire, never the Keg Smash that reset it.
    const cooldown = derived.perAbility[0]?.cooldown;
    expect(cooldown?.state).toBe("UNKNOWN");
    if (cooldown?.state === "UNKNOWN") expect(cooldown.anchor?.locator.reportTimeMs).toBe(2416677);
    expect(derived.remainsSeconds).toBeNull();
  });

  it("a standing proof is a lower bound from the previous Breath of Fire at the pinned 15,000 ms", () => {
    const at = casts.find((cast) => cast.reportTimeMs === 2425704 && cast.abilityGameId === KEG_SMASH)!;
    const derived = bofAt(at.position);
    expect(derived.readiness).toMatchObject({ state: "PROVEN_NOT_READY", provenRemainingAtLeastMs: 5973 });
    const cooldown = derived.perAbility[0]?.cooldown;
    expect(cooldown?.state).toBe("BOUNDED");
    if (cooldown?.state === "BOUNDED") {
      expect(cooldown.baseCooldownMs).toBe(15000);
      expect(cooldown.anchor.locator.reportTimeMs).toBe(2416677);
      expect(cooldown.modifierPolicy.kind).toBe("NO_MODIFIERS_PROVEN_ABSENT");
      if (cooldown.modifierPolicy.kind === "NO_MODIFIERS_PROVEN_ABSENT") {
        expect(cooldown.modifierPolicy.claims).toContain(
          "OBSERVABLE_RESET_ABSENT:reset:CAST:121253:[2416677..2425704]",
        );
      }
    }
  });
});

describe("movement from M11-C2", () => {
  const outcome = (reportTimeMs: number, abilityGameId: number) => {
    const index = analysis.comparisons.findIndex(
      (comparison) =>
        comparison.decision.reportTimeMs === reportTimeMs &&
        comparison.decision.abilityGameId === abilityGameId,
    );
    const comparison = analysis.comparisons[index]!;
    return {
      outcome: comparison.outcome,
      token: comparison.authorityToken,
      precision: comparison.selectionPrecision,
      at: analysis.resolved[index]?.selection.blockedAt ?? null,
    };
  };

  it("the three Keg Smash decisions MATCH at EXACT_ENTRY", () => {
    for (const time of [2425704, 2430227, 2434312]) {
      expect(outcome(time, KEG_SMASH), String(time)).toEqual({
        outcome: "MATCH",
        token: "keg_smash",
        precision: "EXACT_ENTRY",
        at: null,
      });
    }
  });

  it("the two Breath of Fire MATCHes stay MATCH — their proof is withheld by the intervening Keg Smash", () => {
    for (const time of [2427076, 2431304]) {
      expect(outcome(time, BREATH_OF_FIRE).outcome, String(time)).toBe("MATCH");
    }
  });

  it("Blackout Kick +17.3 s and Tiger Palm +18.3 s now diverge on Keg Smash readiness, which stays unmodelled", () => {
    expect(outcome(2432314, BLACKOUT_KICK)).toEqual({
      outcome: "UNKNOWN",
      token: null,
      precision: null,
      at: "shado_pan[1] keg_smash",
    });
    expect(outcome(2433311, TIGER_PALM).at).toBe("shado_pan[1] keg_smash");
  });

  it("M11-C4i moves the eight Purifying Brew refusals: seven now stop at Black Ox Brew, and one decision is REJECTED by positive usability", () => {
    // M11-C3a left eight Purifying Brew refusals and no REJECTED. M11-C4i gives
    // Purifying Brew a reviewed transition, so the query stops at the next
    // unreviewed brew, Black Ox Brew; and the Tiger Palm at 2,424,688 is
    // REJECTED because the authority selects a Keg Smash proven usable in
    // every dimension. The Keg Smash readiness refusals are untouched.
    expect(analysis.coverage.unresolvedAt).toEqual([
      { key: "TRANSITION_UNSUPPORTED @ shado_pan[3] black_ox_brew", count: 7 },
      { key: "DIVERGENT_GCD_OUTCOMES @ shado_pan[1] keg_smash", count: 2 },
    ]);
    expect(analysis.coverage.rejected).toBe(1);
    expect(
      analysis.comparisons
        .filter((comparison) => comparison.outcome === "REJECTED")
        .map((comparison) => [comparison.decision.reportTimeMs, comparison.authorityToken]),
    ).toEqual([[2424688, "keg_smash"]]);
  });
});

describe("scope: Keg Smash and the brews stay out", () => {
  it("Keg Smash is pinned for the POSITIVE readiness proof only (M11-C4i): the cooldown bindings never derive it", () => {
    // One record, its resets declared; the Empty Barrel reset has no observable
    // signature, so no NOT_READY lower bound could ever be claimed from it.
    const records = brewmasterCooldownAbilitiesFor("keg_smash");
    expect(records.map((record) => [record.abilityGameId, record.charges, record.chargeCooldownMs])).toEqual([
      [121253, 1, 8000],
    ]);
    expect(records[0]?.knownDynamicMutations.map((mutation) => mutation.effect)).toEqual([
      "RESET_TO_READY",
      "RESET_TO_READY",
    ]);
    expect(SUPPORTED_BREWMASTER_COOLDOWN_TOKENS as readonly string[]).not.toContain("keg_smash");
    expect(
      deriveBrewmasterCooldown(
        { state, actorId: ACTOR, position: casts[0]!.position, observedTalents },
        "keg_smash",
      ),
    ).toBeNull();
  });

  it("cooldown.keg_smash.charges_fractional stays unbound at every decision", () => {
    for (const entry of analysis.resolved) {
      expect(entry.diagnostics.unboundMagnitudes).toContain("cooldown.keg_smash.charges_fractional");
    }
  });

  it("only Purifying Brew has a transition contract (M11-C4i); Black Ox Brew and Fortifying Brew still refuse", () => {
    expect(brewmasterTransitionContractFor("purifying_brew")).toMatchObject({
      writes: ["OWN_PREFIX_AVAILABILITY", "SHARED_INTERNAL_COOLDOWN", "FORGETS_UNOBSERVED_BUFFS"],
      forgetsBuffsUnlessObservedUp: ["empty_barrel"],
    });
    for (const brew of ["black_ox_brew", "fortifying_brew"]) {
      expect(brewmasterTransitionContractFor(brew)).toBeNull();
    }
  });

  it("Breath of Fire's one declared mutation is the Keg Smash reset (Keg Smash's own two resets are M11-C4i's)", () => {
    const [bof] = brewmasterCooldownAbilitiesFor("breath_of_fire");
    expect(bof?.knownDynamicMutations).toEqual([
      expect.objectContaining({
        member: "reset",
        effect: "RESET_TO_READY",
        observableSignature: expect.objectContaining({ kind: "CAST_BY_ACTOR", abilityGameIds: [121253] }),
      }),
    ]);
  });
});
