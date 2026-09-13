import { describe, expect, it } from "vitest";

import { pinnedAssassinationAuthority } from "../../src/simc/pinned-authority.js";
import { evaluateDefaultAmbushGate } from "../../src/specs/rogue/assassination/ambush-gate.js";
import { bindStealthedRogue } from "../../src/specs/rogue/assassination/stealth-state.js";
import { ASSASSINATION_ACTOR_A, M5A_EVENTS, findCast, m5aState } from "../support/m5a-fixture.js";

/**
 * The negative direction: Ambush must not leak into ordinary rotation.
 *
 * Evaluated at the REAL M5-B Envenom decision points — ordinary, non-stealth,
 * full-combo-point moments in the middle of the fight. Nothing about them should
 * make the Ambush gate pass, and `stealthed.rogue` should not resolve TRUE.
 *
 * WHY THIS USES THE M5-A FIXTURE
 *
 * Deliberately a DIFFERENT capture from the Vanish one. That slice contains no
 * stealth aura at all, so it exercises the path where the binder finds nothing —
 * and proves the answer is UNKNOWN rather than a fabricated FALSE.
 *
 * Note what is NOT asserted: that the gate is FALSE here. It is, but for talent
 * reasons that have nothing to do with stealth, and asserting FALSE would let a
 * future bug that resolved `stealthed.rogue` TRUE out of nowhere pass unnoticed.
 * The load-bearing assertion is on the stealth binding itself.
 */

const state = m5aState();
const loaded = pinnedAssassinationAuthority();

/** Ordinary mid-fight Envenom decision points. No Vanish, no Stealth. */
const ORDINARY_POINTS = [
  M5A_EVENTS.envenomAtSevenFullEnergy,
  M5A_EVENTS.envenomAtSevenHighEnergy,
  M5A_EVENTS.envenomAtFive,
  M5A_EVENTS.envenomAtSix,
] as const;

describe("stealthed.rogue does not resolve TRUE in ordinary rotation", () => {
  it.each(ORDINARY_POINTS.map((point) => [point.reportTimeMs, point] as const))(
    "reports UNKNOWN at the Envenom decision at %i",
    (_label, point) => {
      const position = findCast(state, point);
      const binding = bindStealthedRogue({ state, actorId: point.actorId, position });

      // UNKNOWN, not TRUE: no stealth contributor is proven active here.
      expect(binding.value).toBe("UNKNOWN");
      if (binding.value !== "UNKNOWN") return;

      // And it is not a fabricated FALSE either — every contributor was actually
      // queried and each came back without a positive answer.
      expect(binding.checked.length).toBeGreaterThan(0);
      for (const entry of binding.checked) {
        expect(["INACTIVE", "UNKNOWN"]).toContain(entry.outcome);
      }
    },
  );

  it("never reports TRUE anywhere in a fixture that contains no stealth aura", () => {
    // A sweep rather than a sample: if any position in this capture resolved
    // TRUE, the binder would be reading something that is not a stealth aura.
    for (let position = 0; position < state.fight.events.length; position += 1) {
      const binding = bindStealthedRogue({ state, actorId: ASSASSINATION_ACTOR_A, position });
      expect(binding.value, `position ${String(position)} claimed stealth`).toBe("UNKNOWN");
    }
  });
});

describe("the Ambush gate does not pass in ordinary rotation", () => {
  it.each(ORDINARY_POINTS.map((point) => [point.reportTimeMs, point] as const))(
    "never resolves TRUE at the Envenom decision at %i",
    (_label, point) => {
      if (!loaded.ok) return;
      const position = findCast(state, point);
      const gate = evaluateDefaultAmbushGate({
        state,
        authority: loaded.authority,
        actorId: point.actorId,
        position,
        // This capture carries combatantinfo for actor 19; read it the same way
        // production would rather than hand-feeding talents.
        observedTalentEntries: observedEntriesFor(point.actorId),
      });

      // The only thing that must never happen.
      expect(gate.status).not.toBe("RESOLVED_TRUE");
    },
  );

  it("does not become TRUE merely because combo points are full", () => {
    // Resource state is irrelevant to this gate — it names no resource atom. A
    // gate that moved with combo points would be reading something it should not.
    if (!loaded.ok) return;
    const position = findCast(state, M5A_EVENTS.envenomAtSevenFullEnergy);
    const gate = evaluateDefaultAmbushGate({
      state,
      authority: loaded.authority,
      actorId: ASSASSINATION_ACTOR_A,
      position,
      observedTalentEntries: observedEntriesFor(ASSASSINATION_ACTOR_A),
    });
    expect(gate.status).not.toBe("RESOLVED_TRUE");
    if (gate.status === "UNKNOWN") return;
    expect(gate.trace.atoms.map((atom) => atom.key)).not.toContain("combo_points");
    expect(gate.trace.atoms.map((atom) => atom.key)).not.toContain("energy.pct");
  });
});

/** Actor talents as this capture reports them, or an empty tree when it has none. */
function observedEntriesFor(
  actorId: number,
): readonly { readonly id: number; readonly nodeId: number | null }[] {
  for (const position of state.positionsOfKind("COMBATANT_INFO")) {
    const event = state.eventAt(position);
    if (event === null || event.kind !== "COMBATANT_INFO") continue;
    if (event.snapshot.actorId !== actorId) continue;
    return event.snapshot.talentTree.map((entry) => ({ id: entry.id, nodeId: entry.nodeId }));
  }
  return [];
}
