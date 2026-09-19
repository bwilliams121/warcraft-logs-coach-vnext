/**
 * M11-B2: the pinned Blood Death Knight authority and datasets — the APL
 * artifact with its client-version guards, the GCD, talent, spender-cost and
 * cooldown datasets, the Rune / Runic Power wire contracts, the vocabulary,
 * and the reviewed transition contracts — and what each refuses.
 *
 * Every number here was read off a committed artifact or the pinned source
 * at 33622e9d and is pinned as regression evidence. The MUTATION cases pin
 * that a malformed guard record, a shadowing vocabulary or a re-pinned
 * artifact fails closed instead of loading a quietly different authority.
 */

import { describe, expect, it } from "vitest";

import deathknightBloodArtifact from "../../src/simc/data/deathknight-blood.apl.json";
import { loadAplAuthority } from "../../src/simc/apl-authority.js";
import { isBuiltinIdentifier, parseSimcExpression } from "../../src/simc/expression/parse.js";
import { defineSpecAtomVocabulary } from "../../src/simc/expression/spec-vocabulary.js";
import { RESOURCE_WIRE_CONTRACTS, resourceWireTypeFor } from "../../src/data/wcl-wire/resource-types.js";
import {
  bloodCooldownAbilitiesFor,
  pinnedBloodDeathKnightCooldowns,
} from "../../src/data/game/deathknight-blood-cooldowns.js";
import {
  BLOOD_TOKEN_ALIASES,
  bloodBaseGcdMsForAbility,
  bloodExecutionLaneForToken,
  bloodMetaActionLaneFor,
  bloodTokenBinding,
  bloodTokenByAbilityId,
  pinnedBloodDeathKnightGcdSemantics,
} from "../../src/data/game/deathknight-blood-gcd-semantics.js";
import {
  bloodSpenderCostsFor,
  pinnedBloodDeathKnightSpenderCosts,
} from "../../src/data/game/deathknight-blood-spender-costs.js";
import {
  bloodHeroTrees,
  bloodModelledTalentNames,
  pinnedBloodDeathKnightTalents,
  resolveBloodHeroTree,
  resolveBloodTalent,
} from "../../src/data/game/deathknight-blood-talents.js";
import {
  BLOOD_NON_GCD_TRANSITIONS,
  bloodTransitionContractFor,
} from "../../src/data/game/deathknight-blood-transition-authority.js";
import { SC_DEATH_KNIGHT_CPP_SHA256 } from "../../src/data/game/deathknight-blood-aura-authority.js";
import {
  BLOOD_DEATH_KNIGHT_AUTHORITY_IDENTITY,
  pinnedBloodDeathKnightAuthority,
} from "../../src/specs/deathknight/blood/pinned-authority.js";
import {
  BLOOD_ATOM_DECLARATIONS,
  BLOOD_ATOM_VOCABULARY,
} from "../../src/specs/deathknight/blood/vocabulary.js";

const PIN = "33622e9d1662ff0e451691edf85a6b49cc9d11d9";

describe("the pinned Blood APL artifact", () => {
  const loaded = pinnedBloodDeathKnightAuthority();

  it("loads at the shared pin with its own authority id and the 12.1.0 client-version record", () => {
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const { artifact } = loaded.authority;
    expect(artifact.authorityId).toBe("SIMC_APL_DEATHKNIGHT_BLOOD");
    expect(artifact.provenance.commitSha).toBe(PIN);
    expect(artifact.provenance.sourcePath).toBe("engine/class_modules/apl/apl_death_knight.cpp");
    expect(BLOOD_DEATH_KNIGHT_AUTHORITY_IDENTITY).toEqual({
      authorityId: artifact.authorityId,
      artifactRevision: artifact.artifactRevision,
      commitSha: PIN,
    });
    const guards = artifact.provenance.conditionalCompilation;
    expect(guards?.clientVersion).toBe("12.1.0");
    expect(guards?.guards).toHaveLength(12);
    // Five `< 12.1.0` branches (none holds at 12.1.0; their nine pre-12.1
    // statements were dropped) and seven `>= 12.1.0` branches (all hold;
    // their eight statements were emitted). Nothing was silently kept or lost.
    const shape = (guards?.guards ?? []).map((guard) => [
      guard.form,
      guard.comparison,
      guard.holds,
      guard.statementsEmitted,
      guard.statementsDropped,
    ]);
    expect(shape.filter((row) => row[1] === "wowv() < 12.1.0")).toHaveLength(5);
    expect(shape.filter((row) => row[1] === "wowv() >= 12.1.0")).toHaveLength(7);
    for (const [, comparison, holds, emitted, dropped] of shape) {
      expect(holds).toBe(comparison === "wowv() >= 12.1.0");
      if (holds) expect(dropped).toBe(0);
      else expect(emitted).toBe(0);
    }
    expect(shape.reduce((sum, row) => sum + Number(row[4]), 0)).toBe(9);
    expect(shape.reduce((sum, row) => sum + Number(row[3]), 0)).toBe(8);
  });

  it("carries the six lists with the pinned sizes and dispatch graph", () => {
    if (!loaded.ok) throw new Error("load failed");
    const sizes = Object.fromEntries(
      loaded.authority.artifact.lists.map((list) => [list.listName, list.actions.length]),
    );
    expect(sizes).toEqual({
      default: 17,
      precombat: 2,
      high_prio_actions: 2,
      deathbringer: 12,
      san_gift: 8,
      sanlayn: 15,
    });
    const dispatches = loaded.authority.actions
      .filter((action) => action.entryKind === "LIST_DISPATCH")
      .map(
        (action) =>
          `${action.listName}[${String(action.priorityOrdinal)}] ${action.actionToken} -> ${String(action.callsListName)}`,
      );
    expect(dispatches).toEqual([
      "default[13] call_action_list -> high_prio_actions",
      "default[14] run_action_list -> deathbringer",
      "default[15] run_action_list -> san_gift",
      "default[16] run_action_list -> sanlayn",
    ]);
    // The live 12.1 high-priority list has NO Coagulopathy Death Strike line: it was dropped by a guard.
    const highPrio = loaded.authority.actions.filter((action) => action.listName === "high_prio_actions");
    expect(highPrio.map((action) => action.actionToken)).toEqual(["raise_dead", "dancing_rune_weapon"]);
  });

  it("classifies the empower_to option UNRECOGNISED on both consumption entries, and nothing else", () => {
    if (!loaded.ok) throw new Error("load failed");
    const withOptions = loaded.authority.actions
      .filter((action) => action.unsupportedOptions.length > 0)
      .map(
        (action) =>
          `${action.listName}[${String(action.priorityOrdinal)}] ${action.unsupportedOptions.map((o) => `${o.optionKey}:${o.support}`).join(",")}`,
      );
    expect(withOptions).toEqual([
      "deathbringer[8] empower_to:UNRECOGNISED",
      "deathbringer[10] empower_to:UNRECOGNISED",
      "sanlayn[10] empower_to:UNRECOGNISED",
    ]);
  });

  it("fails closed on a malformed client-version guard record (mutation)", () => {
    const clone = JSON.parse(JSON.stringify(deathknightBloodArtifact)) as {
      provenance: { conditionalCompilation: { guards: { holds: unknown }[] } };
    };
    const guard = clone.provenance.conditionalCompilation.guards[0];
    if (guard === undefined) throw new Error("no guard");
    guard.holds = "yes";
    const result = loadAplAuthority(clone);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("MALFORMED_PROVENANCE");
  });

  it("still loads when the guard record is ABSENT (an artifact from a region with no guards), and refuses a non-object one", () => {
    const absent = JSON.parse(JSON.stringify(deathknightBloodArtifact)) as {
      provenance: Record<string, unknown>;
    };
    delete absent.provenance["conditionalCompilation"];
    expect(loadAplAuthority(absent).ok).toBe(true);
    const wrong = JSON.parse(JSON.stringify(deathknightBloodArtifact)) as {
      provenance: Record<string, unknown>;
    };
    wrong.provenance["conditionalCompilation"] = "12.1.0";
    expect(loadAplAuthority(wrong).ok).toBe(false);
  });
});

describe("the Blood vocabulary and what parses", () => {
  it("declares exactly the five non-built-in identifiers the pinned list uses, none shadowing a built-in", () => {
    expect(BLOOD_ATOM_DECLARATIONS.map((entry) => entry.identifier)).toEqual([
      "hero_tree.sanlayn",
      "hero_tree.deathbringer",
      "runic_power.deficit",
      "rune",
      "time",
    ]);
    for (const entry of BLOOD_ATOM_DECLARATIONS) expect(isBuiltinIdentifier(entry.identifier)).toBe(false);
    expect(BLOOD_ATOM_VOCABULARY.ownerSpecId).toBe("deathknight/blood");
    // A vocabulary that tried to redefine a built-in is refused at definition time.
    expect(() =>
      defineSpecAtomVocabulary(
        "deathknight/blood",
        [{ identifier: "fight_remains", shape: "NUMERIC", scope: "PLAYER_SCOPED", selfAddressing: false }],
        isBuiltinIdentifier,
      ),
    ).toThrow();
  });

  it("parses every pinned condition except the three carrying the decimal literal 1.5 — the measured stopping point", () => {
    const loaded = pinnedBloodDeathKnightAuthority();
    if (!loaded.ok) throw new Error("load failed");
    const refused: string[] = [];
    for (const action of loaded.authority.actions) {
      if (action.conditionRaw === null) continue;
      const parsed = parseSimcExpression(action.conditionRaw, BLOOD_ATOM_VOCABULARY);
      if (!parsed.ok) refused.push(`${action.listName}[${String(action.priorityOrdinal)}] ${parsed.reason}`);
    }
    expect(refused).toEqual([
      "san_gift[0] UNSUPPORTED_NUMERIC_LITERAL",
      "sanlayn[0] UNSUPPORTED_NUMERIC_LITERAL",
      "sanlayn[1] UNSUPPORTED_NUMERIC_LITERAL",
    ]);
  });
});

describe("the Blood GCD dataset", () => {
  it("loads, pins Dancing Rune Weapon on the GCD and the three NON_GCD steps off it", () => {
    expect(pinnedBloodDeathKnightGcdSemantics().ok).toBe(true);
    expect(bloodBaseGcdMsForAbility(49028)).toBe(1500);
    expect(bloodExecutionLaneForToken("dancing_rune_weapon")).toBe("GCD_CONSUMING");
    expect(bloodExecutionLaneForToken("raise_dead")).toBe("NON_GCD");
    expect(bloodExecutionLaneForToken("vampiric_blood")).toBe("NON_GCD");
    expect(bloodExecutionLaneForToken("auto_attack")).toBe("NON_GCD");
    expect(bloodMetaActionLaneFor("auto_attack")?.triggerGcdMs).toBe(0);
    expect(bloodExecutionLaneForToken("consumption")).toBe("GCD_CONSUMING");
    expect(bloodBaseGcdMsForAbility(1263824)).toBe(500);
  });

  it("binds heart_strike to BOTH its execution records and resolves the any_dnd alias to death_and_decay", () => {
    const heartStrike = bloodTokenBinding("heart_strike");
    expect(heartStrike.kind).toBe("KNOWN_SET");
    if (heartStrike.kind === "KNOWN_SET")
      expect([...heartStrike.abilityGameIds].sort()).toEqual([206930, 433895]);
    expect(BLOOD_TOKEN_ALIASES).toEqual({ any_dnd: "death_and_decay" });
    const byId = bloodTokenByAbilityId();
    expect(byId.get(43265)).toBe("death_and_decay");
    expect(byId.get(206930)).toBe("heart_strike");
    expect(byId.get(433895)).toBe("heart_strike");
    // Observed-only abilities have a lane and no token.
    expect(byId.has(51052)).toBe(false);
    expect(bloodBaseGcdMsForAbility(51052)).toBe(1500);
  });
});

describe("the Blood talent dataset", () => {
  it("loads with the two hero sub-trees and resolves a NORMAL node's absence as UNKNOWN, never NOT_SELECTED", () => {
    expect(pinnedBloodDeathKnightTalents().ok).toBe(true);
    expect(bloodHeroTrees().map((tree) => [tree.simcName, tree.subTreeId])).toEqual([
      ["sanlayn", 31],
      ["deathbringer", 33],
    ]);
    expect(bloodModelledTalentNames()).toHaveLength(13);
    expect(resolveBloodTalent([], "consumption").selection).toBe("UNKNOWN");
    expect(resolveBloodTalent([], "death_strike").selection).toBe("UNKNOWN");
    expect(resolveBloodHeroTree([]).state).toBe("UNKNOWN");
    expect(resolveBloodTalent([], "not_a_talent").selection).toBe("UNKNOWN");
  });
});

describe("the Blood spender-cost and cooldown datasets", () => {
  it("pins Death Strike at 450 tenths of Runic Power and the Rune spenders at whole runes", () => {
    expect(pinnedBloodDeathKnightSpenderCosts().ok).toBe(true);
    const deathStrike = bloodSpenderCostsFor("death_strike");
    expect(deathStrike).toHaveLength(1);
    expect(deathStrike[0]?.powerRows.find((row) => row.powerType === 6)?.cost).toBe(450);
    const marrowrend = bloodSpenderCostsFor("marrowrend");
    expect(marrowrend[0]?.powerRows.find((row) => row.powerType === 5)?.cost).toBe(2);
    expect(bloodSpenderCostsFor("deaths_caress")[0]?.cooldownMs).toBe(6000);
    // Two records for one token: the Vampiric Strike execution costs a Rune too.
    expect(
      bloodSpenderCostsFor("heart_strike")
        .map((row) => row.spellId)
        .sort(),
    ).toEqual([206930, 433895]);
  });

  it("pins ONE cooldown — Dancing Rune Weapon, 120,000 ms less Insatiable Blade — and nothing dynamic", () => {
    expect(pinnedBloodDeathKnightCooldowns().ok).toBe(true);
    const drw = bloodCooldownAbilitiesFor("dancing_rune_weapon");
    expect(drw).toHaveLength(1);
    expect(drw[0]?.abilityGameId).toBe(49028);
    expect(drw[0]?.baseCooldownMs).toBe(120000);
    expect(drw[0]?.passiveModifiers.map((modifier) => [modifier.displayNameEn, modifier.value])).toEqual([
      ["Insatiable Blade", -30000],
    ]);
    expect(bloodCooldownAbilitiesFor("vampiric_blood")).toEqual([]);
    expect(bloodCooldownAbilitiesFor("raise_dead")).toEqual([]);
  });
});

describe("the Rune and Runic Power wire contracts", () => {
  it("resolve types 5 and 6 for gameVersion 1 / logVersion 17 and fail closed elsewhere", () => {
    const keys = { gameVersion: 1, logVersion: 17 };
    expect(resourceWireTypeFor("RUNES", keys)).toMatchObject({ ok: true, wireType: 5 });
    expect(resourceWireTypeFor("RUNIC_POWER", keys)).toMatchObject({ ok: true, wireType: 6 });
    expect(resourceWireTypeFor("RUNIC_POWER", { gameVersion: 1, logVersion: 18 })).toMatchObject({
      ok: false,
      reason: "INCOMPATIBLE_VERSION",
    });
    const runicPower = RESOURCE_WIRE_CONTRACTS.find((entry) => entry.resourceId === "RUNIC_POWER");
    expect(runicPower?.evidence.wireCorroboration.fixtureId).toBe(
      "wcl-blood-death-knight-a7r6-rotational-45s",
    );
  });
});

describe("the reviewed NON_GCD transition contracts", () => {
  it("exist for exactly auto_attack, vampiric_blood and raise_dead, each zero-GCD, zero-time, prefix-availability only", () => {
    expect(BLOOD_NON_GCD_TRANSITIONS.map((entry) => entry.simcToken)).toEqual([
      "auto_attack",
      "vampiric_blood",
      "raise_dead",
    ]);
    for (const contract of BLOOD_NON_GCD_TRANSITIONS) {
      expect(contract.baseGcdMs).toBe(0);
      expect(contract.timeAdvanceMs).toBe(0);
      expect(contract.writes).toEqual(["OWN_PREFIX_AVAILABILITY"]);
      expect(bloodExecutionLaneForToken(contract.simcToken)).toBe("NON_GCD");
      for (const claim of contract.claims) expect(claim.sourceSha256).toBe(SC_DEATH_KNIGHT_CPP_SHA256);
    }
    // Dancing Rune Weapon is an ANSWER, not a step: no contract, and none is needed.
    expect(bloodTransitionContractFor("dancing_rune_weapon")).toBeNull();
    expect(bloodTransitionContractFor("potion")).toBeNull();
  });
});
