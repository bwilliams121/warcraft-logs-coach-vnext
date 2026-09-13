/**
 * Lane completeness over the real root -> Garrote authority graph.
 *
 * WHY THIS EXISTS
 *
 * C3c3b's terminal test is `lane(selected) === GCD_CONSUMING`. A single
 * `UNKNOWN_LANE` on the path makes that question unanswerable, so before the
 * rescan engine is written, the coverage has to be pinned — and pinned as an
 * EXHAUSTIVE list rather than a spot check, because a new player action
 * appearing in these lists must force a human to classify it rather than being
 * silently ignored.
 *
 * `UNKNOWN_LANE` is still a real answer and still the default for everything
 * outside the supported slice. What must never happen is a lane arriving by
 * accident: absence of a record must not become NON_GCD.
 *
 * WHAT IS NOT ASSERTED HERE
 *
 * That any of these actions fires, or that Garrote is selected. This file is
 * about classification only.
 */

import { describe, expect, it } from "vitest";

import {
  executionLaneForAbility,
  executionLaneForToken,
  metaActionLaneProvenanceFor,
  metaActionLaneRecordFor,
  pinnedRogueGcdSemantics,
  resolveTokenBinding,
} from "../../src/data/game/ability-gcd-semantics.js";
import { META_ACTION_LANE_METHOD } from "../../src/data/game/gcd-semantics-artifact.js";
import { pinnedAssassinationAuthority } from "../../src/simc/pinned-authority.js";

const SIMC_COMMIT = "33622e9d1662ff0e451691edf85a6b49cc9d11d9";
const CLIENT_BUILD = "12.1.0.69587";

/**
 * The lists C3c3 will traverse from the root, and nothing else.
 *
 * `generate` and `spend` are below `core_dot` in the pinned `default` list and
 * are out of scope for the first-GCD question at this decision point; `precombat`
 * never runs in combat. Their absence is deliberate, so the exhaustive check
 * below does not quietly demand lane data the milestone does not need.
 */
const SUPPORTED_ROOT_LISTS = ["default", "cds", "items", "misc_cds", "core_dot", "vanish"] as const;

/**
 * Every PLAYER_ACTION token on that graph, with the lane it must resolve to.
 *
 * EXHAUSTIVE. The test below asserts this list equals the set actually found in
 * the pinned authority, so an upstream APL change cannot add an unclassified
 * action without failing here.
 */
const EXPECTED_TOKEN_LANES: Readonly<Record<string, "GCD_CONSUMING" | "NON_GCD">> = {
  // default
  stealth: "NON_GCD",
  kick: "NON_GCD",
  thistle_tea: "NON_GCD",
  ambush: "GCD_CONSUMING",
  // cds
  deathmark: "GCD_CONSUMING",
  invoke_external_buff: "NON_GCD",
  kingsbane: "GCD_CONSUMING",
  // items
  use_item: "NON_GCD",
  use_items: "NON_GCD",
  // misc_cds
  potion: "NON_GCD",
  blood_fury: "NON_GCD",
  berserking: "NON_GCD",
  fireblood: "NON_GCD",
  ancestral_call: "NON_GCD",
  // core_dot
  garrote: "GCD_CONSUMING",
  rupture: "GCD_CONSUMING",
  // vanish
  vanish: "NON_GCD",
};

const META_TOKENS = ["potion", "use_item", "use_items", "invoke_external_buff"] as const;

function authorityOrThrow() {
  const loaded = pinnedAssassinationAuthority();
  if (!loaded.ok) throw new Error(`pinned authority unavailable: ${loaded.reason}`);
  return loaded.authority;
}

/** Every PLAYER_ACTION token actually present in the supported root lists. */
function tokensOnTheRootGraph(): readonly string[] {
  const authority = authorityOrThrow();
  const tokens = new Set<string>();
  for (const listName of SUPPORTED_ROOT_LISTS) {
    const list = authority.actionsInList(listName);
    if (!list.found) throw new Error(`pinned authority has no list '${listName}'`);
    for (const action of list.actions) {
      if (action.entryKind !== "PLAYER_ACTION") continue;
      tokens.add(action.actionToken);
    }
  }
  return [...tokens].sort();
}

describe("every player action on the root graph has a lane", () => {
  it("finds exactly the tokens this milestone declares", () => {
    // The forcing function. A new player action in these lists fails here, which
    // is the point: it must be classified by a human, not defaulted.
    expect(tokensOnTheRootGraph()).toEqual(Object.keys(EXPECTED_TOKEN_LANES).sort());
  });

  it.each(Object.entries(EXPECTED_TOKEN_LANES))("classifies '%s' as %s", (simcToken, lane) => {
    expect(executionLaneForToken(simcToken)).toBe(lane);
  });

  it("leaves not one of them UNKNOWN_LANE", () => {
    for (const simcToken of tokensOnTheRootGraph()) {
      expect(executionLaneForToken(simcToken), simcToken).not.toBe("UNKNOWN_LANE");
    }
  });

  it("requires no lane for control-flow entries", () => {
    // `variable` executes and the scan continues, and `call_action_list` returns
    // whatever its callee returns. Neither can ever be a terminal, so neither
    // needs a lane — and neither has one.
    for (const simcToken of ["variable", "call_action_list"]) {
      expect(executionLaneForToken(simcToken)).toBe("UNKNOWN_LANE");
    }
    const authority = authorityOrThrow();
    const kinds = new Set(
      SUPPORTED_ROOT_LISTS.flatMap((listName) => {
        const list = authority.actionsInList(listName);
        return list.found ? list.actions.map((action) => action.entryKind) : [];
      }),
    );
    expect([...kinds].sort()).toEqual(["LIST_DISPATCH", "PLAYER_ACTION", "VARIABLE_ASSIGNMENT"]);
  });

  it("still refuses a token outside the supported slice", () => {
    // Completeness on the path is not completeness everywhere, and the refusal
    // must survive the widening.
    for (const simcToken of ["crimson_tempest", "shiv", "mutilate", "fan_of_knives", "slice_and_dice"]) {
      expect(executionLaneForToken(simcToken), simcToken).toBe("UNKNOWN_LANE");
    }
  });
});

describe("garrote's lane, which the eventual first-GCD answer rests on", () => {
  it("resolves the token to spell 703 through a hand-reviewed binding", () => {
    const binding = resolveTokenBinding("garrote");
    expect(binding.kind).toBe("KNOWN_ONE");
    if (binding.kind !== "KNOWN_ONE") return;
    expect(binding.abilityGameId).toBe(703);
    expect(binding.provenance.method).toBe("HAND_REVIEWED_CPP_CONTROL_FLOW");
    expect(binding.provenance.sourcePath).toBe("engine/class_modules/sc_rogue.cpp");
    expect(binding.provenance.crossCheck).toBe("CLASS_SPELLS");
    expect(binding.provenance.sourceNote).toContain("spec.garrote");
  });

  it("reads 703's base GCD as 1000 ms from the machine-extracted table", () => {
    const loaded = pinnedRogueGcdSemantics();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const record = loaded.artifact.abilities.find((entry) => entry.abilityGameId === 703);
    expect(record?.baseGcdMs).toBe(1000);
    expect(executionLaneForAbility(703)).toBe("GCD_CONSUMING");
    expect(loaded.artifact.provenance.abilityDataMethod).toBe("MACHINE_EXTRACTED_DBC_RECORD");
  });
});

describe("the two lane provenance grades stay apart", () => {
  it("gives every meta action a hand-reviewed trigger_gcd and NO spell id", () => {
    for (const simcToken of META_TOKENS) {
      expect(resolveTokenBinding(simcToken).kind, simcToken).toBe("UNKNOWN");
      const provenance = metaActionLaneProvenanceFor(simcToken);
      expect(provenance?.method, simcToken).toBe(META_ACTION_LANE_METHOD);
      expect(provenance?.sourceSha256, simcToken).toMatch(/^[0-9a-f]{64}$/);
      expect(provenance?.line ?? 0, simcToken).toBeGreaterThan(0);
      expect(metaActionLaneRecordFor(simcToken)?.triggerGcdMs, simcToken).toBe(0);
    }
  });

  it("gives every spell-backed token a spell id and NO meta record", () => {
    for (const simcToken of Object.keys(EXPECTED_TOKEN_LANES)) {
      if ((META_TOKENS as readonly string[]).includes(simcToken)) continue;
      expect(resolveTokenBinding(simcToken).kind, simcToken).not.toBe("UNKNOWN");
      expect(metaActionLaneRecordFor(simcToken), simcToken).toBeNull();
    }
  });

  it("never writes a fake DBC record for a meta action", () => {
    // The dishonest alternative this third grade exists to avoid: inventing a
    // spell row so the machine-extracted path would answer.
    const loaded = pinnedRogueGcdSemantics();
    if (!loaded.ok) return;
    const names = new Set(loaded.artifact.abilities.map((entry) => entry.displayNameEn.toLowerCase()));
    for (const simcToken of META_TOKENS) {
      expect(names.has(simcToken.replace(/_/g, " ")), simcToken).toBe(false);
    }
  });
});

describe("use_off_gcd is not the lane, and nothing treats it as one", () => {
  it("finds real use_off_gcd=1 entries whose lane came from elsewhere", () => {
    // `items[1..3]` and `misc_cds[1..4]` carry the option. Their lane comes from
    // `trigger_gcd` — a C++ constructor for the items, a DBC `_gcd` for the
    // racials — and would be identical without the option.
    const authority = authorityOrThrow();
    const withOption = authority.actions.filter((action) =>
      /(?:^|,)use_off_gcd=1(?:,|$)/.test(action.actionStringVerbatim),
    );
    expect(withOption.length).toBeGreaterThan(0);
    for (const action of withOption) {
      expect(executionLaneForToken(action.actionToken), action.actionToken).toBe("NON_GCD");
    }
  });

  it("classifies a NON_GCD entry the same whether or not it carries the option", () => {
    // `use_items` (no option) and `use_item` (option) are both NON_GCD; so are
    // `potion` (no option) and the four racials (option). The option is orthogonal.
    expect(executionLaneForToken("use_items")).toBe(executionLaneForToken("use_item"));
    expect(executionLaneForToken("potion")).toBe(executionLaneForToken("blood_fury"));
  });

  it("reads the option nowhere in the lane module", () => {
    // Structural, because the semantic claim is easy to state and easy to erode:
    // `use_off_gcd` ADDS an action to a second list for a pass that only runs
    // during an active GCD. It never removes it from the foreground list, and it
    // never changes `trigger_gcd`.
    expect(metaActionLaneProvenanceFor("use_item")?.sourceNote ?? "").not.toContain("use_off_gcd");
  });
});

describe("the widened artifact keeps its provenance discipline", () => {
  it("still pins one commit and one client build", () => {
    const loaded = pinnedRogueGcdSemantics();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.artifact.provenance.commitSha).toBe(SIMC_COMMIT);
    expect(loaded.artifact.provenance.clientDataWowVersion).toBe(CLIENT_BUILD);
    expect(loaded.artifact.provenance.gcdFieldUnits).toBe("MILLISECONDS");
  });

  it("hashes every source, including the two added for the new readings", () => {
    const loaded = pinnedRogueGcdSemantics();
    if (!loaded.ok) return;
    const byPath = new Map(loaded.artifact.provenance.sources.map((source) => [source.path, source]));
    for (const path of [
      "engine/dbc/generated/sc_spell_data.inc",
      "engine/dbc/generated/class_spells.inc",
      "engine/class_modules/sc_rogue.cpp",
      "engine/player/player.cpp",
      "engine/player/consumable.cpp",
    ]) {
      expect(byPath.get(path)?.sha256, path).toMatch(/^[0-9a-f]{64}$/);
      expect(byPath.get(path)?.byteLength ?? 0, path).toBeGreaterThan(0);
    }
  });

  it("carries the racial ids the four racial tokens rest on", () => {
    const loaded = pinnedRogueGcdSemantics();
    if (!loaded.ok) return;
    const byId = new Map(loaded.artifact.abilities.map((entry) => [entry.abilityGameId, entry]));
    for (const [abilityGameId, displayNameEn] of [
      [20_572, "Blood Fury"],
      [33_697, "Blood Fury"],
      [33_702, "Blood Fury"],
      [26_297, "Berserking"],
      [265_221, "Fireblood"],
      [274_738, "Ancestral Call"],
    ] as const) {
      expect(byId.get(abilityGameId)?.displayNameEn, String(abilityGameId)).toBe(displayNameEn);
      expect(byId.get(abilityGameId)?.baseGcdMs, String(abilityGameId)).toBe(0);
    }
  });

  it("resolves blood_fury without evaluating the class mask", () => {
    // Three rows, one of which a Rogue actually gets. The lane is invariant over
    // all three, so the token is classifiable without anyone deciding which.
    const binding = resolveTokenBinding("blood_fury");
    expect(binding.kind).toBe("KNOWN_SET");
    if (binding.kind !== "KNOWN_SET") return;
    expect([...binding.abilityGameIds].sort((left, right) => left - right)).toEqual([20_572, 33_697, 33_702]);
    for (const abilityGameId of binding.abilityGameIds) {
      expect(executionLaneForAbility(abilityGameId), String(abilityGameId)).toBe("NON_GCD");
    }
    expect(executionLaneForToken("blood_fury")).toBe("NON_GCD");
  });

  it("stores no derived lane on any record, in either section", () => {
    const loaded = pinnedRogueGcdSemantics();
    if (!loaded.ok) return;
    for (const record of loaded.artifact.abilities) {
      expect(Object.keys(record).sort()).toEqual(["abilityGameId", "baseGcdMs", "displayNameEn"]);
    }
    for (const record of loaded.artifact.metaActionLanes) {
      expect(Object.keys(record).sort()).toEqual(["binding", "simcToken", "triggerGcdMs"]);
    }
  });
});
