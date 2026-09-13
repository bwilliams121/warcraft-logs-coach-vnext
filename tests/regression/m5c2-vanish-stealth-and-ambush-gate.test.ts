import { describe, expect, it } from "vitest";

import { executionLaneForAbility } from "../../src/data/game/ability-gcd-semantics.js";
import { resolveTalentSelection } from "../../src/data/game/rogue-talents.js";
import { pinnedAssassinationAuthority } from "../../src/simc/pinned-authority.js";
import {
  evaluateDefaultAmbushGate,
  AMBUSH_GATE_TALENTS,
} from "../../src/specs/rogue/assassination/ambush-gate.js";
import {
  bindStealthedRogue,
  STEALTHED_ROGUE_CONTRIBUTORS,
  STEALTHED_ROGUE_EXCLUSIONS,
} from "../../src/specs/rogue/assassination/stealth-state.js";
import {
  M5C2_ACTOR,
  M5C2_EVENTS,
  M5C2_IDS,
  findCastAt,
  m5c2State,
  observedTalentEntries,
} from "../support/m5c2-fixture.js";

/**
 * M5-C2's headline, on the real Vanish #2 -> Garrote sequence.
 *
 * THE TWO CAPABILITIES, AND WHY THEY ARE TESTED TOGETHER
 *
 *   1. `stealthed.rogue` is PROVEN TRUE at the post-Vanish decision point, from
 *      M4's existing aura facts and no invented duration.
 *   2. The pinned `default[4]` Ambush gate resolves FALSE there anyway, from the
 *      player's real talents.
 *
 * Together they say the thing that is easy to get wrong:
 *
 *     STEALTHED DOES NOT MEAN AMBUSH.
 *
 * A build without Improved Ambush does not want Ambush however stealthed it is,
 * and the FALSE is reached through ordinary Kleene AND on talent operands rather
 * than through any rule written about Ambush.
 */

const state = m5c2State();
const loaded = pinnedAssassinationAuthority();

const vanishPosition = findCastAt(state, M5C2_EVENTS.vanishCast);
const garrotePosition = findCastAt(state, M5C2_EVENTS.garroteCast);
const talentEntries = observedTalentEntries(state);

function gateAt(position: number) {
  if (!loaded.ok) throw new Error("the pinned authority must load");
  return evaluateDefaultAmbushGate({
    state,
    authority: loaded.authority,
    actorId: M5C2_ACTOR,
    position,
    observedTalentEntries: talentEntries,
  });
}

describe("Vanish and Garrote are two decision points, not one", () => {
  it("places them at different canonical positions and different timestamps", () => {
    expect(vanishPosition).toBeLessThan(garrotePosition);
    const vanish = state.eventAt(vanishPosition);
    const garrote = state.eventAt(garrotePosition);
    expect(vanish?.reportTimeMs).toBe(2_176_120);
    expect(garrote?.reportTimeMs).toBe(2_176_580);
    // 460ms apart. A zero-GCD action does not fold the next one into itself.
    expect((garrote?.reportTimeMs ?? 0) - (vanish?.reportTimeMs ?? 0)).toBe(460);
  });

  it("keeps Vanish NON_GCD, which is why a new scan follows it", () => {
    expect(executionLaneForAbility(M5C2_IDS.vanishAction)).toBe("NON_GCD");
  });

  it("never merges them into one result", () => {
    // Each position gets its own gate evaluation. There is no combined object,
    // and nothing in the API accepts two positions.
    const atVanish = gateAt(vanishPosition);
    const atGarrote = gateAt(garrotePosition);
    expect(atVanish.kind).toBe("AMBUSH_GATE");
    expect(atGarrote.kind).toBe("AMBUSH_GATE");
    expect(atVanish).not.toBe(atGarrote);
  });
});

describe("the Vanish ACTION and the Vanish BUFF are different identities", () => {
  it("uses 1856 for the action and 11327 for the buff", () => {
    expect(M5C2_IDS.vanishAction).toBe(1_856);
    expect(M5C2_IDS.vanishBuff).toBe(11_327);
    expect(M5C2_IDS.vanishAction).not.toBe(M5C2_IDS.vanishBuff);
  });

  it("satisfies stealthed.rogue from the BUFF, never from the action", () => {
    const ids = STEALTHED_ROGUE_CONTRIBUTORS.map((c) => c.abilityGameId);
    expect(ids).toContain(M5C2_IDS.vanishBuff);
    expect(ids).not.toContain(M5C2_IDS.vanishAction);
  });
});

describe("stealthed.rogue is PROVEN TRUE at the post-Vanish decision point", () => {
  it("resolves TRUE, anchored on the observed Vanish application", () => {
    const binding = bindStealthedRogue({ state, actorId: M5C2_ACTOR, position: garrotePosition });
    expect(binding.value).toBe("TRUE");
    if (binding.value !== "TRUE") return;
    expect(binding.provenBy.abilityGameId).toBe(M5C2_IDS.vanishBuff);
    expect(binding.provenBy.simcMaskBit).toBe("STEALTH_VANISH");
    // The anchor is an APPLICATION that was actually observed — not a duration.
    expect(binding.provenBy.anchorOperation).toBe("APPLIED");
    expect(binding.provenBy.anchorPosition).toBeLessThan(garrotePosition);
    expect(binding.provenBy.locator.rawType).toBe("applybuff");
  });

  it("reads the removal that shares the Garrote timestamp as AFTER the decision", () => {
    // The subtle part. `removebuff 11327` has the same reportTimeMs as the
    // Garrote cast but a LATER canonical position. Querying BEFORE_EVENT at the
    // cast must see the aura still up; a timestamp-based query would not.
    const removal = state.fight.events.findIndex(
      (event) =>
        event.kind === "AURA" && event.abilityGameId === M5C2_IDS.vanishBuff && event.operation === "REMOVED",
    );
    expect(removal).toBeGreaterThan(garrotePosition);
    expect(state.eventAt(removal)?.reportTimeMs).toBe(state.eventAt(garrotePosition)?.reportTimeMs);

    // And immediately after the removal the binding no longer proves TRUE.
    const after = bindStealthedRogue({ state, actorId: M5C2_ACTOR, position: removal + 1 });
    expect(after.value).toBe("UNKNOWN");
  });

  it("excludes Shadowmeld and Improved Garrote from the mask", () => {
    const contributorIds = STEALTHED_ROGUE_CONTRIBUTORS.map((c) => c.abilityGameId);
    for (const excluded of STEALTHED_ROGUE_EXCLUSIONS) {
      expect(contributorIds, excluded.displayNameEn).not.toContain(excluded.abilityGameId);
    }
    // Improved Garrote is applied at the same instant the Vanish buff drops in
    // the real sequence, so including it would keep reporting "stealthed" after
    // the window genuinely closed.
    expect(STEALTHED_ROGUE_EXCLUSIONS.map((e) => e.abilityGameId)).toContain(392_401);
  });

  it("returns UNKNOWN and never FALSE when no contributor is proven active", () => {
    const binding = bindStealthedRogue({ state, actorId: M5C2_ACTOR, position: 0 });
    expect(binding.value).toBe("UNKNOWN");
    // Structural: there is no FALSE member to reach.
    expect(Object.values(binding)).not.toContain("FALSE");
  });
});

describe("actor 19's real talents", () => {
  it("resolves improved_ambush NOT_SELECTED from the choice-node alternative", () => {
    const resolution = resolveTalentSelection(talentEntries, "improved_ambush");
    expect(resolution.selection).toBe("NOT_SELECTED");
    expect(resolution.reason).toBe("ALTERNATIVE_ENTRY_SELECTED");
    expect(resolution.decidedByEntryId).toBe(117_152);
  });

  it("resolves shrouded_suffocation SELECTED from its own entry", () => {
    const resolution = resolveTalentSelection(talentEntries, "shrouded_suffocation");
    expect(resolution.selection).toBe("SELECTED");
    expect(resolution.reason).toBe("OWN_ENTRY_SELECTED");
  });

  it("resolves blindside UNKNOWN, and the verdict does not depend on it", () => {
    // The node is absent from the tree. M5-C2 refuses to read that as "not
    // taken", so the FALSE below must come from the other two operands.
    const resolution = resolveTalentSelection(talentEntries, "blindside");
    expect(resolution.selection).toBe("UNKNOWN");
    expect(resolution.reason).toBe("NODE_ABSENT");
  });

  it("reads the tree through the normalizer, not from raw JSON", () => {
    expect(talentEntries.length).toBe(76);
  });
});

describe("THE VERDICT: default[4] Ambush gate is FALSE at the post-Vanish point", () => {
  it("resolves RESOLVED_FALSE", () => {
    const gate = gateAt(garrotePosition);
    expect(gate.status).toBe("RESOLVED_FALSE");
  });

  it("resolves FALSE even though stealthed.rogue is TRUE", () => {
    // The point of the whole milestone.
    const gate = gateAt(garrotePosition);
    if (gate.status !== "RESOLVED_FALSE") throw new Error("expected a false gate");
    expect(gate.evidence.stealthedRogue.value).toBe("TRUE");
  });

  it("resolves FALSE with variable.single_target still UNKNOWN", () => {
    const gate = gateAt(garrotePosition);
    if (gate.status !== "RESOLVED_FALSE") return;
    expect(gate.evidence.variableSingleTarget).toBe("UNKNOWN");
    const variableAtom = gate.trace.atoms.find((atom) => atom.key === "variable.single_target");
    expect(variableAtom?.binding).toBe("UNRESOLVED_BOOLEAN");
  });

  it("reaches FALSE through ordinary Kleene AND on the talent operands", () => {
    const gate = gateAt(garrotePosition);
    if (gate.status !== "RESOLVED_FALSE") return;
    // Every enumerated world agrees, which is what makes the answer exact
    // despite an unresolved atom remaining.
    expect(gate.trace.aggregate).toBe("FALSE");
    expect(gate.trace.aggregateRule).toBe("INVARIANT_ACROSS_WORLDS");
    expect(gate.trace.worlds.every((world) => world.result === "FALSE")).toBe(true);

    // improved_ambush bound FALSE, shrouded_suffocation bound TRUE, and blindside
    // left unresolved because it was never proven either way.
    const byKey = new Map(gate.trace.atoms.map((atom) => [atom.key, atom]));
    expect(byKey.get("talent.improved_ambush")?.binding).toBe("KNOWN");
    expect(byKey.get("talent.improved_ambush")?.value).toBe(0);
    expect(byKey.get("talent.shrouded_suffocation")?.binding).toBe("KNOWN");
    expect(byKey.get("talent.shrouded_suffocation")?.value).toBe(1);
    expect(byKey.get("talent.blindside")?.binding).toBe("UNRESOLVED_BOOLEAN");
  });

  it("carries the authority line and its provenance", () => {
    const gate = gateAt(garrotePosition);
    if (gate.status !== "RESOLVED_FALSE") return;
    expect(gate.authority.ref.listName).toBe("default");
    expect(gate.authority.ref.priorityOrdinal).toBe(4);
    expect(gate.authority.ref.actionStringVerbatim).toContain("ambush,if=");
    expect(gate.authority.provenance.commitSha).toBe("33622e9d1662ff0e451691edf85a6b49cc9d11d9");
    expect(gate.conditionRaw).toBe(
      "stealthed.rogue&variable.single_target&talent.blindside&talent.improved_ambush&!talent.shrouded_suffocation",
    );
  });

  it("needs no observed Ambush execution, and the fixture contains none", () => {
    // The verdict is about the AUTHORITY's condition. It does not depend on what
    // the player did, and ability 8676 appears nowhere in this fight.
    expect(state.positionsByAbility(M5C2_IDS.ambush)).toEqual([]);
    expect(gateAt(garrotePosition).status).toBe("RESOLVED_FALSE");
  });

  it("names exactly the talents the pinned condition asks about", () => {
    expect([...AMBUSH_GATE_TALENTS]).toEqual(["blindside", "improved_ambush", "shrouded_suffocation"]);
  });
});

describe("what M5-C2 deliberately does NOT claim", () => {
  it("makes no claim that Garrote was globally selected", () => {
    // Reaching `core_dot` would require passing `default[5] cds`, whose
    // condition is still outside the supported subset. Nothing here evaluates it.
    const gate = gateAt(garrotePosition);
    expect(JSON.stringify(gate)).not.toContain("garrote");
    expect(JSON.stringify(gate)).not.toContain("SELECTED_BY_AUTHORITY");
  });

  it("answers only the gate, never action readiness", () => {
    // The APL condition and `action_ready()` use DIFFERENT stealth masks, and a
    // Blindside proc waives readiness without touching the condition. This
    // result must not be read as "Ambush was executable".
    const gate = gateAt(garrotePosition);
    const serialized = JSON.stringify(gate);
    expect(serialized).not.toContain("READY");
    expect(serialized).not.toContain("USABLE");
    expect(serialized).not.toContain("ACTIONABLE");
  });

  it("reconstructs no target count", () => {
    const gate = gateAt(garrotePosition);
    const serialized = JSON.stringify(gate);
    expect(serialized).not.toContain("spell_targets");
    expect(serialized).not.toContain("targetCount");
    expect(serialized).not.toContain("enemyCount");
  });

  it("returns UNKNOWN rather than a verdict when talents are unavailable", () => {
    if (!loaded.ok) return;
    const gate = evaluateDefaultAmbushGate({
      state,
      authority: loaded.authority,
      actorId: M5C2_ACTOR,
      position: garrotePosition,
      observedTalentEntries: [],
    });
    // `stealthed.rogue` is still TRUE, so four boolean atoms remain — exactly at
    // the enumeration cap. Sixteen worlds are built and they disagree, so the
    // gate is UNDECIDED rather than decided. Missing talents can never produce a
    // verdict.
    expect(gate.status).toBe("UNKNOWN");
    if (gate.status !== "UNKNOWN") return;
    expect(gate.blocker).toBe("UNRESOLVED_AUTHORITY_STATE");
    expect(gate.evidence?.stealthedRogue.value).toBe("TRUE");
    expect(gate.trace?.worlds).toHaveLength(16);
    // Every talent atom left unresolved, none defaulted to false.
    for (const key of ["talent.blindside", "talent.improved_ambush", "talent.shrouded_suffocation"]) {
      expect(gate.trace?.atoms.find((atom) => atom.key === key)?.binding).toBe("UNRESOLVED_BOOLEAN");
    }
  });

  it("fails closed on the enumeration cap when nothing at all is established", () => {
    if (!loaded.ok) return;
    // Position 0 precedes the Vanish, so stealth is UNKNOWN too. Five unresolved
    // boolean atoms exceed the cap, and the evaluator declines to build 32
    // worlds rather than growing into a solver.
    const gate = evaluateDefaultAmbushGate({
      state,
      authority: loaded.authority,
      actorId: M5C2_ACTOR,
      position: 0,
      observedTalentEntries: [],
    });
    expect(gate.status).toBe("UNKNOWN");
    if (gate.status !== "UNKNOWN") return;
    expect(gate.blocker).toBe("TOO_MANY_UNRESOLVED_ATOMS");
    expect(gate.trace).toBeNull();
  });
});
