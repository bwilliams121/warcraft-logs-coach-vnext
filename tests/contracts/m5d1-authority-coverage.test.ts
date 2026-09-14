/**
 * ANALYZER coverage of the pinned Assassination authority.
 *
 * WHAT THIS IS, AND THE DISTINCTION MATTERS
 *
 * This measures how much of the AUTHORITY this build supports. It is NOT the
 * coverage of an analysed report — how much of one player's fight was evaluable,
 * and how confident the result was — which is a player-facing disclosure M5-E
 * owns. Confusing the two would let "we support most of the APL" read as "we
 * analysed most of your fight".
 *
 * WHY A CONTRACT TEST AND NOT RUNTIME CODE
 *
 * A runtime `AssassinationAuthorityCoverage` would be a shipped surface with no
 * consumer: the API returns findings, not statistics about the analyzer. A script
 * would drift, because nothing fails when it goes stale. A contract test FAILS
 * THE BUILD when the pinned authority gains a list, an action, an expression
 * family or an action option that nobody has decided about — which is the whole
 * point. It is the same device `normalization-boundary.test.ts` uses to stop a
 * raw type string entering `src/` without evidence.
 *
 * EVERY SET BELOW IS EXHAUSTIVE ON PURPOSE. `toEqual` rather than `toContain`,
 * so growth is a visible decision rather than a silent one.
 */

import { describe, expect, it } from "vitest";

import { pinnedAssassinationAuthority } from "../../src/simc/pinned-authority.js";
import {
  SUPPORTED_ACTION_OPTION_KEYS,
  UNSUPPORTED_TARGETING_OPTION_KEYS,
  actionOptionSupport,
  type AplAction,
} from "../../src/simc/apl-authority.js";
import { parseSimcExpression } from "../../src/simc/expression/parse.js";
import { collectAtoms } from "../../src/simc/expression/ast.js";
import { executionLaneForToken } from "../../src/data/game/ability-gcd-semantics.js";
import { transitionContractFor } from "../../src/data/game/assassination-transition-authority.js";

function authorityOrThrow() {
  const loaded = pinnedAssassinationAuthority();
  if (!loaded.ok) throw new Error(`pinned authority unavailable: ${loaded.reason}`);
  return loaded.authority;
}

/** Every list reachable from the entry list, sorted. */
function reachableLists(): readonly string[] {
  const authority = authorityOrThrow();
  const reached: string[] = [];
  const pending = [authority.artifact.entryListName];
  while (pending.length > 0) {
    const name = pending.pop();
    if (name === undefined || reached.includes(name)) continue;
    reached.push(name);
    const lookup = authority.actionsInList(name);
    if (!lookup.found) continue;
    for (const action of lookup.actions) {
      if (action.callsListName !== null) pending.push(action.callsListName);
    }
  }
  return [...reached].sort();
}

function reachableActions(): readonly AplAction[] {
  const authority = authorityOrThrow();
  const actions: AplAction[] = [];
  for (const listName of reachableLists()) {
    const lookup = authority.actionsInList(listName);
    if (!lookup.found) continue;
    actions.push(...lookup.actions);
  }
  return actions;
}

function playerActionTokens(): readonly string[] {
  const tokens = new Set<string>();
  for (const action of reachableActions()) {
    if (action.entryKind === "PLAYER_ACTION") tokens.add(action.actionToken);
  }
  return [...tokens].sort();
}

/** The coarse family an atom key belongs to. Prefix only; never a guess. */
function atomFamily(key: string): string {
  if (key.startsWith("buff.")) return "buff.*";
  if (key.startsWith("debuff.")) return "debuff.*";
  if (key.startsWith("dot.")) return "dot.*.ticking";
  if (key.startsWith("cooldown.")) return "cooldown.*.remains";
  if (key.startsWith("talent.")) return "talent.*";
  if (key.startsWith("variable.")) return "variable.*";
  return key;
}

describe("the reachable authority surface is exactly what this build decided about", () => {
  it("reaches exactly eight lists, and never precombat", () => {
    // `precombat` runs before the pull and is reachable from nothing. An
    // analyzer that walked into it would be evaluating actions taken outside the
    // encounter.
    expect(reachableLists()).toEqual([
      "cds",
      "core_dot",
      "default",
      "generate",
      "items",
      "misc_cds",
      "spend",
      "vanish",
    ]);
    expect(reachableLists()).not.toContain("precombat");
  });

  it("holds exactly 43 reachable entries, of which 34 are player actions", () => {
    const actions = reachableActions();
    expect(actions).toHaveLength(43);
    expect(actions.filter((a) => a.entryKind === "PLAYER_ACTION")).toHaveLength(34);
    expect(actions.filter((a) => a.entryKind === "LIST_DISPATCH")).toHaveLength(7);
    expect(actions.filter((a) => a.entryKind === "VARIABLE_ASSIGNMENT")).toHaveLength(2);
  });

  it("names exactly the player-action tokens this build has decided about", () => {
    expect(playerActionTokens()).toEqual([
      "ambush",
      "ancestral_call",
      "berserking",
      "blood_fury",
      "crimson_tempest",
      "deathmark",
      "envenom",
      "fan_of_knives",
      "fireblood",
      "garrote",
      "invoke_external_buff",
      "kick",
      "kingsbane",
      "mutilate",
      "potion",
      "rupture",
      "shiv",
      "stealth",
      "thistle_tea",
      "use_item",
      "use_items",
      "vanish",
    ]);
  });
});

describe("execution lanes", () => {
  it("establishes a lane for every reachable token except the four builders", () => {
    const unknown = playerActionTokens().filter((token) => executionLaneForToken(token) === "UNKNOWN_LANE");
    // All four are builder actions whose ONLY entries are gated on
    // `spell_targets.fan_of_knives`. M5-D deliberately does not support builder
    // selection, so giving them lanes would be speculative data.
    expect(unknown).toEqual(["crimson_tempest", "fan_of_knives", "mutilate", "shiv"]);
  });

  it("keeps every GCD-consuming token in the supported set", () => {
    const gcd = playerActionTokens().filter((token) => executionLaneForToken(token) === "GCD_CONSUMING");
    expect(gcd).toEqual(["ambush", "deathmark", "envenom", "garrote", "kingsbane", "rupture"]);
  });
});

describe("action options are a declared surface, not an ignored one", () => {
  it("classifies every option key the pinned authority actually uses", () => {
    const keys = [...new Set(reachableActions().flatMap((action) => action.actionOptionKeys))].sort();
    expect(keys).toEqual(["cycle_targets", "if", "name", "slots", "target_if", "use_off_gcd", "value"]);
    // Nothing is UNRECOGNISED: every key present has been decided about.
    for (const key of keys) {
      expect(actionOptionSupport(key), key).not.toBe("UNRECOGNISED");
    }
  });

  it("declares cycle_targets and target_if recognised-but-unsupported", () => {
    expect([...UNSUPPORTED_TARGETING_OPTION_KEYS]).toEqual([
      "cycle_targets",
      "target_if",
      "max_cycle_targets",
    ]);
    for (const key of UNSUPPORTED_TARGETING_OPTION_KEYS) {
      expect(actionOptionSupport(key), key).toBe("UNSUPPORTED_TARGETING");
      expect([...SUPPORTED_ACTION_OPTION_KEYS], key).not.toContain(key);
    }
  });

  it("finds exactly three entries carrying unsupported targeting", () => {
    const carrying = reachableActions()
      .filter((action) => action.unsupportedOptions.length > 0)
      .map((action) => `${action.listName}[${String(action.priorityOrdinal)}]`);
    // `cycle_targets=1` on the two cycling DoT entries, `target_if=max:` on the
    // Crimson Tempest line. Nothing else in the pinned APL retargets.
    expect([...carrying].sort()).toEqual(["core_dot[2]", "core_dot[4]", "generate[0]"]);
  });

  it("declares no unmodelled control-flow construct anywhere", () => {
    // `run_action_list`, `swap_action_list`, `sequence`, `pool_resource` and
    // `wait` are absent from the pinned Assassination APL. If one appears, the
    // traversal's assumptions about control flow stop holding.
    for (const action of reachableActions()) {
      expect(action.isUnmodelledDispatch, action.actionStringVerbatim).toBe(false);
      for (const forbidden of ["swap_action_list", "sequence", "pool_resource", ",wait"]) {
        expect(action.actionStringVerbatim, forbidden).not.toContain(forbidden);
      }
    }
  });
});

describe("expression families", () => {
  /** Families the parser understands, from the reachable APL's own conditions. */
  function parsedFamilies(): readonly string[] {
    const families = new Set<string>();
    for (const action of reachableActions()) {
      if (action.conditionRaw === null) continue;
      const parsed = parseSimcExpression(action.conditionRaw);
      if (!parsed.ok) continue;
      for (const atom of collectAtoms(parsed.ast)) families.add(atomFamily(atom.key));
    }
    return [...families].sort();
  }

  /** The exact fragments the parser refuses, and how many entries each stops. */
  function refusedFragments(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const action of reachableActions()) {
      if (action.conditionRaw === null) continue;
      const parsed = parseSimcExpression(action.conditionRaw);
      if (parsed.ok) continue;
      counts[parsed.fragment] = (counts[parsed.fragment] ?? 0) + 1;
    }
    return counts;
  }

  it("supports exactly these expression families", () => {
    expect(parsedFamilies()).toEqual([
      "buff.*",
      "combo_points",
      "combo_points.deficit",
      "cooldown.*.remains",
      "debuff.*",
      "dot.*.ticking",
      "energy.pct",
      "fight_remains",
      "pmultiplier",
      "refreshable",
      "remains",
      "stealthed.rogue",
      "talent.*",
      "target.time_to_die",
      "variable.*",
    ]);
  });

  it("refuses exactly these fragments, and the target-count family is among them", () => {
    // EXHAUSTIVE. A new refusal, or one that disappears, is a decision that has
    // to be made here rather than absorbed.
    expect(refusedFragments()).toEqual({
      "active_dot.garrote": 1,
      "cooldown.deathmark.ready": 1,
      "dot.garrote.pmultiplier": 2,
      "main_hand.dagger": 1,
      "spell_targets.fan_of_knives": 6,
      "talent.scent_of_blood.rank": 1,
      "variable.base_trinket_condition": 1,
      "variable.trinket_sync_slot": 2,
    });
  });

  it("keeps the target-count family unsupported, which is the M5-D boundary", () => {
    // `spell_targets.fan_of_knives` counts the SIMULATION's whole enemy roster
    // (action.cpp:3832-3842 via 1729-1755). Warcraft Logs supplies no equivalent,
    // and only a LOWER bound would ever be derivable — which decides `>1` and
    // never `=1`, so every single-target gate in the APL would stay unknown.
    expect(parseSimcExpression("spell_targets.fan_of_knives>1").ok).toBe(false);
    expect(parseSimcExpression("active_dot.garrote<2").ok).toBe(false);
    expect(parsedFamilies()).not.toContain("spell_targets.fan_of_knives");
  });
});

describe("transition-contracted NON_GCD actions", () => {
  it("names exactly the tokens with a reviewed fixed-identity contract", () => {
    const tokens = playerActionTokens().filter((token) => transitionContractFor(token) !== null);
    // Item entries are deliberately ABSENT: their contract is BUILT from the
    // resolved driver rather than looked up by token, so two trinkets never share
    // one claim. See `itemUseTransition`.
    expect(tokens).toEqual([
      "ancestral_call",
      "berserking",
      "blood_fury",
      "fireblood",
      "kick",
      "potion",
      "thistle_tea",
    ]);
  });

  it("keeps every contract at zero time advance and zero GCD", () => {
    for (const token of ["kick", "thistle_tea", "potion", "blood_fury"]) {
      const contract = transitionContractFor(token);
      expect(contract, token).not.toBeNull();
      if (contract === null) continue;
      expect(contract.timeAdvanceMs, token).toBe(0);
      expect(contract.baseGcdMs, token).toBe(0);
      // An empty write set is the strongest claim in the file, so every contract
      // must at least name its own self-disabling.
      expect(contract.writes.length, token).toBeGreaterThan(0);
    }
  });
});
