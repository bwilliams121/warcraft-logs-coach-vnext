import { describe, expect, it } from "vitest";

import { executionLaneForAbility, executionLaneForToken } from "../../src/data/game/ability-gcd-semantics.js";
import { pinnedAssassinationAuthority } from "../../src/simc/pinned-authority.js";
import {
  classifyListEntries,
  narrowToRotationalSlot,
} from "../../src/specs/rogue/assassination/rotational-slot.js";

/**
 * M5-C1's headline claim, pinned against the real Assassination default list.
 *
 * THE CLAIM
 *
 *     No entry in default[0..3] can occupy the player's next rotational GCD
 *     slot, and default[4] is the first entry structurally capable of it.
 *
 * It rests on two pinned facts and nothing else: SimulationCraft's own lane
 * predicate (`trigger_gcd > 0`, player.cpp:7397) and the `_gcd` values in the
 * generated spell data at the same commit. No combat state is read, no condition
 * is evaluated, and no readiness is proved.
 *
 * THE CLAIM THIS FILE EXISTS TO STOP ANYONE MAKING
 *
 *     "...therefore default[4] may be evaluated against the state that preceded
 *     default[0..3]."
 *
 * That does not follow and is false. A zero-GCD entry still ENDS the scan when
 * ready (player.cpp:14266), still executes, and can change state before the next
 * scan begins. `thistle_tea` at default[3] grants Energy. The last describe block
 * pins that distinction so a later milestone cannot quietly collapse it.
 */

const loaded = pinnedAssassinationAuthority();

const AMBUSH = 8676;
const THISTLE_TEA = 381623;
const THISTLE_TEA_ALTERNATE = 469779;

describe("the pinned default list, entry by entry", () => {
  it("loads the authority", () => {
    expect(loaded.ok).toBe(true);
  });

  it("classifies default[0..4] exactly as the structural proof requires", () => {
    if (!loaded.ok) return;
    const entries = classifyListEntries(loaded.authority, "default");
    expect(entries).not.toBeNull();
    if (entries === null) return;

    const shape = entries.slice(0, 5).map((entry) => ({
      priorityOrdinal: entry.priorityOrdinal,
      actionToken: entry.actionToken,
      entryKind: entry.entryKind,
      executionLane: entry.executionLane,
      eligibility: entry.eligibility,
    }));

    expect(shape).toEqual([
      {
        priorityOrdinal: 0,
        actionToken: "stealth",
        entryKind: "PLAYER_ACTION",
        executionLane: "NON_GCD",
        eligibility: "CANNOT_OCCUPY_ROTATIONAL_SLOT",
      },
      {
        priorityOrdinal: 1,
        actionToken: "kick",
        entryKind: "PLAYER_ACTION",
        executionLane: "NON_GCD",
        eligibility: "CANNOT_OCCUPY_ROTATIONAL_SLOT",
      },
      {
        priorityOrdinal: 2,
        actionToken: "variable",
        entryKind: "VARIABLE_ASSIGNMENT",
        executionLane: null,
        eligibility: "CANNOT_OCCUPY_ROTATIONAL_SLOT",
      },
      {
        priorityOrdinal: 3,
        actionToken: "thistle_tea",
        entryKind: "PLAYER_ACTION",
        executionLane: "NON_GCD",
        eligibility: "CANNOT_OCCUPY_ROTATIONAL_SLOT",
      },
      {
        priorityOrdinal: 4,
        actionToken: "ambush",
        entryKind: "PLAYER_ACTION",
        executionLane: "GCD_CONSUMING",
        eligibility: "CAN_OCCUPY_ROTATIONAL_SLOT",
      },
    ]);
  });

  it("gives structural entries no execution lane at all", () => {
    // A `variable` has no ability behind it. Forcing it through an ability
    // lookup would yield UNKNOWN_LANE, which reads as "we could not establish
    // it" when the truth is that the question does not apply.
    if (!loaded.ok) return;
    const entries = classifyListEntries(loaded.authority, "default") ?? [];
    for (const entry of entries) {
      if (entry.entryKind === "PLAYER_ACTION") {
        expect(entry.executionLane, entry.actionToken).not.toBeNull();
      } else {
        expect(entry.executionLane, entry.actionToken).toBeNull();
      }
    }
  });

  it("reports an absent list rather than an empty one", () => {
    if (!loaded.ok) return;
    expect(classifyListEntries(loaded.authority, "no_such_list")).toBeNull();
    expect(narrowToRotationalSlot(loaded.authority, "no_such_list")).toEqual({
      kind: "LIST_ABSENT",
      listName: "no_such_list",
    });
  });
});

describe("THE PROOF: default[0..3] cannot occupy the rotational GCD slot", () => {
  it("narrows the default list to default[4]", () => {
    if (!loaded.ok) return;
    const narrowing = narrowToRotationalSlot(loaded.authority, "default");

    expect(narrowing.kind).toBe("NARROWED");
    if (narrowing.kind !== "NARROWED") return;
    expect(narrowing.firstEligibleOrdinal).toBe(4);
    expect(narrowing.provenIneligibleOrdinals).toEqual([0, 1, 2, 3]);
  });

  it("proves — not merely assumes — that every entry above default[4] is ineligible", () => {
    // The whole value of the result is that nothing above the candidate was left
    // unresolved. An UNKNOWN above it would make the narrowing worthless, and
    // the type refuses to report NARROWED in that case.
    if (!loaded.ok) return;
    const narrowing = narrowToRotationalSlot(loaded.authority, "default");
    if (narrowing.kind !== "NARROWED") return;

    for (const ordinal of narrowing.provenIneligibleOrdinals) {
      const entry = narrowing.entries.find((candidate) => candidate.priorityOrdinal === ordinal);
      expect(entry?.eligibility, `default[${String(ordinal)}]`).toBe("CANNOT_OCCUPY_ROTATIONAL_SLOT");
      expect(entry?.eligibility, `default[${String(ordinal)}]`).not.toBe("UNKNOWN");
    }
  });

  it("stops at the first eligible entry and claims nothing below it", () => {
    // default[5] calls `cds`, which this milestone does not traverse. The proof
    // must not reach it, and must not need to.
    if (!loaded.ok) return;
    const narrowing = narrowToRotationalSlot(loaded.authority, "default");
    if (narrowing.kind !== "NARROWED") return;
    expect(narrowing.provenIneligibleOrdinals).not.toContain(5);
    expect(narrowing.firstEligibleOrdinal).toBeLessThan(5);
  });

  it("rests on Ambush being GCD-consuming, by number", () => {
    expect(executionLaneForAbility(AMBUSH)).toBe("GCD_CONSUMING");
    expect(executionLaneForToken("ambush")).toBe("GCD_CONSUMING");
  });

  it("rests on stealth, kick and thistle_tea being zero-GCD, by number", () => {
    expect(executionLaneForToken("stealth")).toBe("NON_GCD");
    expect(executionLaneForToken("kick")).toBe("NON_GCD");
    expect(executionLaneForToken("thistle_tea")).toBe("NON_GCD");
    // thistle_tea only because BOTH talent-reachable records agree.
    expect(executionLaneForAbility(THISTLE_TEA)).toBe("NON_GCD");
    expect(executionLaneForAbility(THISTLE_TEA_ALTERNATE)).toBe("NON_GCD");
  });
});

describe("narrowing refuses to step over an unresolved entry", () => {
  it("stops at a LIST_DISPATCH, because the callee may return a GCD action", () => {
    // `cds` and `core_dot` are not traversed in C1, so a dispatch entry's
    // eligibility is genuinely unknown. Proved against a list that reaches one:
    // `cds[2]` calls `items` before any GCD-consuming entry is established.
    if (!loaded.ok) return;
    const narrowing = narrowToRotationalSlot(loaded.authority, "cds");
    expect(narrowing.kind).toBe("NOT_NARROWED");
    if (narrowing.kind !== "NOT_NARROWED") return;
    expect(narrowing.blocker).toBe("UNRESOLVED_ELIGIBILITY_ABOVE");
    const blocked = narrowing.entries.find((entry) => entry.priorityOrdinal === narrowing.blockedAtOrdinal);
    expect(blocked?.eligibility).toBe("UNKNOWN");
  });

  it("treats an unmodelled ability as UNKNOWN, never as skippable", () => {
    // `core_dot` is all garrote/rupture, neither of which has a GCD record. The
    // right answer is "we do not know", and it must block rather than pass.
    if (!loaded.ok) return;
    const entries = classifyListEntries(loaded.authority, "core_dot") ?? [];
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.entryKind).toBe("PLAYER_ACTION");
      expect(entry.executionLane, entry.actionToken).toBe("UNKNOWN_LANE");
      expect(entry.eligibility, entry.actionToken).toBe("UNKNOWN");
    }

    const narrowing = narrowToRotationalSlot(loaded.authority, "core_dot");
    expect(narrowing.kind).toBe("NOT_NARROWED");
    if (narrowing.kind !== "NOT_NARROWED") return;
    expect(narrowing.blocker).toBe("UNRESOLVED_ELIGIBILITY_ABOVE");
    expect(narrowing.blockedAtOrdinal).toBe(0);
  });

  it("narrows the spend list to its first entry, which is Envenom", () => {
    // A positive control: `spend` is homogeneous and fully modelled, so
    // narrowing succeeds immediately at ordinal 0.
    if (!loaded.ok) return;
    const narrowing = narrowToRotationalSlot(loaded.authority, "spend");
    expect(narrowing.kind).toBe("NARROWED");
    if (narrowing.kind !== "NARROWED") return;
    expect(narrowing.firstEligibleOrdinal).toBe(0);
    expect(narrowing.provenIneligibleOrdinals).toEqual([]);
    expect(narrowing.entries[0]?.actionToken).toBe("envenom");
  });
});

describe("SEMANTIC GUARD: ineligible is not skippable", () => {
  it("does not claim a zero-GCD entry fails to end the current scan", () => {
    // SimulationCraft returns the FIRST ready foreground action and stops,
    // regardless of GCD (player.cpp:14266). `thistle_tea` at default[3] carries
    // no `use_off_gcd=1`, so it is an ordinary foreground entry: when ready it
    // is returned, default[4..8] are never reached in THAT scan, and it
    // executes.
    //
    // So the eligibility vocabulary must not contain a member that reads as
    // "skipped", "ignored" or "does not fire".
    if (!loaded.ok) return;
    const entries = classifyListEntries(loaded.authority, "default") ?? [];
    for (const entry of entries) {
      expect(entry.eligibility).not.toMatch(/SKIP|IGNORE|NOT_SELECTED|DOES_NOT_FIRE|SUPPRESS/);
    }
  });

  it("names the slot, not the action, in every eligibility member", () => {
    // "CANNOT_OCCUPY_ROTATIONAL_SLOT" is a claim about the SLOT. A shorter
    // "INELIGIBLE" would read as a claim about the action, which is exactly the
    // conflation this milestone must not ship.
    if (!loaded.ok) return;
    const entries = classifyListEntries(loaded.authority, "default") ?? [];
    for (const entry of entries) {
      if (entry.eligibility === "UNKNOWN") continue;
      expect(entry.eligibility).toContain("ROTATIONAL_SLOT");
    }
  });

  it("exposes no ordering that would let default[4] borrow default[3]'s state", () => {
    // The narrowing result carries ordinals and classifications. It deliberately
    // carries NO decision point, NO timestamp, NO resource observation and NO
    // evaluated condition, so there is nothing in it from which a caller could
    // construct "evaluate ambush at the pre-Thistle-Tea state".
    if (!loaded.ok) return;
    const narrowing = narrowToRotationalSlot(loaded.authority, "default");
    if (narrowing.kind !== "NARROWED") return;

    expect(Object.keys(narrowing).sort()).toEqual([
      "entries",
      "firstEligibleOrdinal",
      "kind",
      "listName",
      "provenIneligibleOrdinals",
    ]);
    for (const entry of narrowing.entries) {
      expect(Object.keys(entry).sort()).toEqual([
        "actionStringVerbatim",
        "actionToken",
        "eligibility",
        "entryKind",
        "executionLane",
        "priorityOrdinal",
        "sourceLine",
      ]);
    }
  });

  it("reads no combat state whatsoever", () => {
    // The proof is structural. If it ever needed an observation, it would have
    // become a decision-point evaluator and would owe the state-provenance rules
    // that come with one.
    if (!loaded.ok) return;
    const first = narrowToRotationalSlot(loaded.authority, "default");
    const second = narrowToRotationalSlot(loaded.authority, "default");
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
