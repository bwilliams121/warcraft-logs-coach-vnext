/**
 * M10-C3: the shared observational-equivalence proof over an unknown
 * sub-action identity (`src/simc/subaction-equivalence.ts`).
 *
 * Every premise here is SYNTHETIC: candidates are hand-built behaviours, the
 * policy is a stated function. No item, enchant or specialization is named,
 * which is the point — the engine must decide from behaviour alone.
 */

import { describe, expect, it } from "vitest";

import {
  candidateDefects,
  proveSubactionIdentityIrrelevant,
  type SubactionCandidate,
  type SubactionEquivalencePolicy,
  type SubactionWrite,
} from "../../src/simc/subaction-equivalence.js";

const inert = (id: string, writes: readonly SubactionWrite[] = []): SubactionCandidate => ({
  id,
  lane: "NON_GCD",
  timeAdvanceMs: 0,
  cooldownMs: 60_000,
  writes,
});

/** A policy under which only resource writes and unbounded behaviour are observable. */
const statsAndDamageUnobservable: SubactionEquivalencePolicy = {
  writeIsObservable: (write) => write === "RESOURCE_ACTION",
};
/** A policy under which damage and heals ARE observable (a modelled proc channel exists). */
const damageObservable: SubactionEquivalencePolicy = {
  writeIsObservable: (write) =>
    write === "RESOURCE_ACTION" || write === "DAMAGE_ACTION" || write === "HEAL_ACTION",
};

describe("the proof converges only when every candidate is equivalent", () => {
  it("passes a set of stat-only, absorb-only and no-op candidates, listing every candidate it covered", () => {
    const verdict = proveSubactionIdentityIrrelevant(
      [inert("a", ["PLAYER_STAT_BUFF"]), inert("b", ["ABSORB_BUFF"]), inert("c")],
      statsAndDamageUnobservable,
    );
    expect(verdict).toEqual({
      kind: "UNKNOWN_SUBACTION_IDENTITY_OBSERVATIONALLY_IRRELEVANT",
      candidateIds: ["a", "b", "c"],
    });
  });

  it("passes a damage-only candidate ONLY under a policy that says damage is unobservable", () => {
    const damage = [inert("d", ["DAMAGE_ACTION"])];
    expect(proveSubactionIdentityIrrelevant(damage, statsAndDamageUnobservable).kind).toBe(
      "UNKNOWN_SUBACTION_IDENTITY_OBSERVATIONALLY_IRRELEVANT",
    );
    expect(proveSubactionIdentityIrrelevant(damage, damageObservable)).toEqual({
      kind: "IDENTITY_DECISION_RELEVANT",
      candidateIds: ["d"],
      blocking: [{ id: "d", defects: ["OBSERVABLE_WRITE:DAMAGE_ACTION"] }],
    });
  });

  it("refuses an EMPTY candidate set: the proof is not licensed to speak about existence", () => {
    expect(proveSubactionIdentityIrrelevant([], statsAndDamageUnobservable)).toEqual({
      kind: "NO_CANDIDATES",
    });
  });

  it("one GCD-consuming candidate among inert ones defeats the whole position, and is named", () => {
    const verdict = proveSubactionIdentityIrrelevant(
      [inert("a"), { ...inert("g"), lane: "GCD" }, inert("c")],
      statsAndDamageUnobservable,
    );
    expect(verdict).toEqual({
      kind: "IDENTITY_DECISION_RELEVANT",
      candidateIds: ["a", "g", "c"],
      blocking: [{ id: "g", defects: ["GCD_LANE"] }],
    });
  });

  it("one APL-visible write defeats the position: a resource action is observable under every policy here", () => {
    const verdict = proveSubactionIdentityIrrelevant(
      [inert("a"), inert("r", ["RESOURCE_ACTION"])],
      statsAndDamageUnobservable,
    );
    expect(verdict.kind).toBe("IDENTITY_DECISION_RELEVANT");
    if (verdict.kind !== "IDENTITY_DECISION_RELEVANT") return;
    expect(verdict.blocking).toEqual([{ id: "r", defects: ["OBSERVABLE_WRITE:RESOURCE_ACTION"] }]);
  });

  it("unknown, time-advancing, cyclic and scripted candidates each defeat the position with the exact defect", () => {
    const cases: readonly [SubactionCandidate, readonly string[]][] = [
      [{ ...inert("lane"), lane: "UNKNOWN" }, ["LANE_UNKNOWN"]],
      [{ ...inert("time"), timeAdvanceMs: 500 }, ["TIME_ADVANCE"]],
      [{ ...inert("transition"), timeAdvanceMs: null }, ["TRANSITION_UNKNOWN"]],
      [{ ...inert("cycle"), cooldownMs: 0 }, ["NO_COOLDOWN_NONTERMINATION"]],
      [{ ...inert("cd"), cooldownMs: null }, ["COOLDOWN_UNKNOWN"]],
      [inert("script", ["SCRIPTED_UNREVIEWED"]), ["OBSERVABLE_WRITE:SCRIPTED_UNREVIEWED"]],
      [inert("unresolved", ["UNRESOLVED"]), ["OBSERVABLE_WRITE:UNRESOLVED"]],
    ];
    for (const [candidate, defects] of cases) {
      expect(candidateDefects(candidate, statsAndDamageUnobservable), candidate.id).toEqual(defects);
      const verdict = proveSubactionIdentityIrrelevant([inert("ok"), candidate], statsAndDamageUnobservable);
      expect(verdict.kind, candidate.id).toBe("IDENTITY_DECISION_RELEVANT");
    }
    // Scripted and unresolved writes are observable regardless of the policy.
    const permissive: SubactionEquivalencePolicy = { writeIsObservable: () => false };
    expect(candidateDefects(inert("s", ["SCRIPTED_UNREVIEWED"]), permissive)).toEqual([
      "OBSERVABLE_WRITE:SCRIPTED_UNREVIEWED",
    ]);
    expect(candidateDefects(inert("u", ["UNRESOLVED"]), permissive)).toEqual(["OBSERVABLE_WRITE:UNRESOLVED"]);
  });

  it("is deterministic: the same input yields the same verdict, candidates and defects in the same order", () => {
    const input = [
      { ...inert("x", ["DAMAGE_ACTION"]), cooldownMs: 0 },
      inert("y"),
      { ...inert("z"), lane: "GCD" as const, timeAdvanceMs: 1500 },
    ];
    const first = proveSubactionIdentityIrrelevant(input, damageObservable);
    const second = proveSubactionIdentityIrrelevant([...input], damageObservable);
    expect(second).toEqual(first);
    expect(first).toEqual({
      kind: "IDENTITY_DECISION_RELEVANT",
      candidateIds: ["x", "y", "z"],
      blocking: [
        { id: "x", defects: ["NO_COOLDOWN_NONTERMINATION", "OBSERVABLE_WRITE:DAMAGE_ACTION"] },
        { id: "z", defects: ["GCD_LANE", "TIME_ADVANCE"] },
      ],
    });
  });
});
