import { describe, expect, it } from "vitest";

import { executionLaneForToken, resolveTokenBinding } from "../../src/data/game/ability-gcd-semantics.js";
import { APL_ENTRY_KINDS, deriveEntryKind } from "../../src/simc/apl-authority.js";
import { pinnedAssassinationAuthority } from "../../src/simc/pinned-authority.js";
import {
  classifyListEntries,
  narrowToRotationalSlot,
} from "../../src/specs/rogue/assassination/rotational-slot.js";

/**
 * Structural classification of an APL line.
 *
 * This is not a taxonomy for its own sake. SimulationCraft's foreground scan
 * treats three families differently, and only one of them ends the scan:
 *
 *     player.cpp:14238  ACTION_VARIABLE -> execute(), CONTINUE scanning
 *     player.cpp:14245  ACTION_CALL     -> recurse into the called list
 *     player.cpp:14266  anything else   -> return it; the scan STOPS
 *
 * So `variable` is structurally incapable of being "the action the list
 * selected", and the classification is what makes that unrepresentable rather
 * than merely unlikely.
 *
 * `PLAYER_ACTION` means ONLY "an ordinary selectable/returnable entry, as
 * opposed to a control-flow entry". It says nothing about whether the entry is
 * spell-backed, and confers no ability id and no execution lane. `potion`,
 * `use_item` and `invoke_external_buff` are all `PLAYER_ACTION` and none of them
 * is a spell — see the fail-closed block at the bottom of this file.
 */

describe("the entry-kind vocabulary", () => {
  it("has exactly three members", () => {
    expect([...APL_ENTRY_KINDS]).toEqual(["PLAYER_ACTION", "VARIABLE_ASSIGNMENT", "LIST_DISPATCH"]);
  });
});

describe("entry kind is derived from the verbatim action string", () => {
  it.each([
    ["stealth", "PLAYER_ACTION"],
    ["kick", "PLAYER_ACTION"],
    ["thistle_tea,if=energy.pct<30|fight_remains<10", "PLAYER_ACTION"],
    ["envenom,if=buff.envenom.remains<=1|buff.deathmark.up", "PLAYER_ACTION"],
    ["ambush,if=stealthed.rogue&variable.single_target", "PLAYER_ACTION"],
    ["use_item,name=algethar_puzzle_box,use_off_gcd=1", "PLAYER_ACTION"],
    ["variable,name=single_target,value=spell_targets.fan_of_knives=1", "VARIABLE_ASSIGNMENT"],
    ["variable,name=trinket_sync_slot,value=1,if=trinket.1.has_use_buff", "VARIABLE_ASSIGNMENT"],
    ["call_action_list,name=cds", "LIST_DISPATCH"],
    ["call_action_list,name=spend,if=combo_points>=5", "LIST_DISPATCH"],
    ["run_action_list,name=aoe", "LIST_DISPATCH"],
    ["swap_action_list,name=default", "LIST_DISPATCH"],
  ] as const)("classifies '%s' as %s", (actionString, kind) => {
    expect(deriveEntryKind(actionString)).toBe(kind);
  });

  it("falls back to PLAYER_ACTION for an unrecognised token", () => {
    // A claim about CONTROL FLOW only: an unrecognised token would be returned
    // by the scan and would end it, which is what separates it from `variable`
    // and the dispatch constructs. It is not a claim that the token is a spell.
    //
    // The fallback is the safe direction. Classified as control flow it would be
    // stepped over silently; classified as a player action it has no known lane,
    // so narrowing stops at it and says so.
    expect(deriveEntryKind("some_future_ability,if=x>1")).toBe("PLAYER_ACTION");
  });

  it("does not classify on a substring of the token", () => {
    // `variable_speed` is not `variable`, and a prefix match would make it
    // disappear from selection entirely.
    expect(deriveEntryKind("variable_speed_potion")).toBe("PLAYER_ACTION");
    expect(deriveEntryKind("call_action_list_helper")).toBe("PLAYER_ACTION");
  });
});

describe("the pinned authority carries the derived kind on every action", () => {
  const loaded = pinnedAssassinationAuthority();

  it("loads", () => {
    expect(loaded.ok).toBe(true);
  });

  it("classifies every action in every list", () => {
    if (!loaded.ok) return;
    for (const action of loaded.authority.actions) {
      expect(APL_ENTRY_KINDS, `${action.listName}[${action.priorityOrdinal}]`).toContain(action.entryKind);
    }
  });

  it("classifies the real default list exactly", () => {
    if (!loaded.ok) return;
    const lookup = loaded.authority.actionsInList("default");
    expect(lookup.found).toBe(true);
    if (!lookup.found) return;
    expect(lookup.actions.map((action) => action.entryKind)).toEqual([
      "PLAYER_ACTION", // 0 stealth
      "PLAYER_ACTION", // 1 kick
      "VARIABLE_ASSIGNMENT", // 2 variable,name=single_target
      "PLAYER_ACTION", // 3 thistle_tea
      "PLAYER_ACTION", // 4 ambush
      "LIST_DISPATCH", // 5 call_action_list,name=cds
      "LIST_DISPATCH", // 6 call_action_list,name=core_dot
      "LIST_DISPATCH", // 7 call_action_list,name=generate
      "LIST_DISPATCH", // 8 call_action_list,name=spend
    ]);
  });

  it("agrees with callsListName wherever a list is actually called", () => {
    // Two independent derivations of the same fact. If they ever disagreed, one
    // of them would be wrong and no caller could tell which.
    if (!loaded.ok) return;
    for (const action of loaded.authority.actions) {
      if (action.callsListName !== null) {
        expect(action.entryKind, action.actionStringVerbatim).toBe("LIST_DISPATCH");
      }
      if (action.entryKind === "PLAYER_ACTION") {
        expect(action.callsListName, action.actionStringVerbatim).toBeNull();
      }
    }
  });

  it("never classifies a variable assignment as a player action, anywhere", () => {
    if (!loaded.ok) return;
    const variables = loaded.authority.actions.filter((action) => action.actionToken === "variable");
    // precombat has two, default has one, items has one.
    expect(variables.length).toBeGreaterThan(0);
    for (const action of variables) {
      expect(action.entryKind).toBe("VARIABLE_ASSIGNMENT");
    }
  });
});

describe("PLAYER_ACTION does not imply spell-backed", () => {
  const loaded = pinnedAssassinationAuthority();

  it.each(["potion", "use_item", "use_items", "invoke_external_buff", "apply_poison", "snapshot_stats"])(
    "classifies the non-spell pseudo-action '%s' as PLAYER_ACTION",
    (token) => {
      // `PLAYER_ACTION` is a control-flow statement: an ordinary
      // selectable/returnable entry, as opposed to a control-flow entry. None of
      // these is a spell, and the classification does not claim otherwise.
      expect(deriveEntryKind(token)).toBe("PLAYER_ACTION");
    },
  );

  it.each(["potion", "use_item", "use_items", "invoke_external_buff"])(
    "gives '%s' no ability id and no execution lane",
    (token) => {
      expect(resolveTokenBinding(token).kind).toBe("UNKNOWN");
      expect(executionLaneForToken(token)).toBe("UNKNOWN_LANE");
    },
  );

  it("finds real non-spell PLAYER_ACTION entries in the pinned authority", () => {
    // Not hypothetical: `items` and `misc_cds` are full of them.
    if (!loaded.ok) return;
    const nonSpell = loaded.authority.actions.filter((action) =>
      ["use_item", "use_items", "potion", "invoke_external_buff", "apply_poison", "snapshot_stats"].includes(
        action.actionToken,
      ),
    );
    expect(nonSpell.length).toBeGreaterThan(0);
    for (const action of nonSpell) {
      expect(action.entryKind, action.actionStringVerbatim).toBe("PLAYER_ACTION");
      expect(executionLaneForToken(action.actionToken), action.actionToken).toBe("UNKNOWN_LANE");
    }
  });

  it("BLOCKS rotational narrowing at such an entry rather than skipping it", () => {
    // The whole reason the three-member vocabulary is sufficient. An entry with
    // no known lane stops the narrowing and names itself; it is never stepped
    // over, and it never acquires a lane by being structurally ordinary.
    if (!loaded.ok) return;

    const narrowing = narrowToRotationalSlot(loaded.authority, "misc_cds");
    expect(narrowing.kind).toBe("NOT_NARROWED");
    if (narrowing.kind !== "NOT_NARROWED") return;
    expect(narrowing.blocker).toBe("UNRESOLVED_ELIGIBILITY_ABOVE");
    expect(narrowing.blockedAtOrdinal).toBe(0);

    const blocked = narrowing.entries[0];
    expect(blocked?.actionToken).toBe("potion");
    expect(blocked?.entryKind).toBe("PLAYER_ACTION");
    expect(blocked?.executionLane).toBe("UNKNOWN_LANE");
    expect(blocked?.eligibility).toBe("UNKNOWN");
  });

  it("blocks on the items list too, where use_item entries are unmodelled", () => {
    if (!loaded.ok) return;
    const entries = classifyListEntries(loaded.authority, "items") ?? [];
    const useItems = entries.filter((entry) => entry.actionToken.startsWith("use_item"));
    expect(useItems.length).toBeGreaterThan(0);
    for (const entry of useItems) {
      expect(entry.entryKind).toBe("PLAYER_ACTION");
      expect(entry.executionLane).toBe("UNKNOWN_LANE");
      expect(entry.eligibility).toBe("UNKNOWN");
    }
  });
});
