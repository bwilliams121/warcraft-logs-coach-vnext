/**
 * M11-C1: Brewmaster Monk AUTHORITY — targets and committed datasets only.
 *
 * No Brewmaster analyzer exists. This file pins what M11-C1 generated from
 * the pinned SimulationCraft commit and what it deliberately did not:
 *
 *   - the `monk-brewmaster` APL target carries the M11-C0 dispatch graph as
 *     DISPATCH_GRAPH facts, and the shared checker enforces them;
 *   - the GCD dataset resolves Empty the Cellar to the executed driver, not
 *     the talent record, and `celestial_brew` to both build-dependent records;
 *   - the talent dataset carries exactly Brewmaster's two hero trees and the
 *     three apex traits in generated-table order;
 *   - the cooldown dataset pins only abilities no pinned code mutates (plus,
 *     since M11-C3a, Breath of Fire with its one declared cast-signature
 *     reset), and none of the five `brew_t` cooldowns the mechanical policy
 *     cannot see;
 *   - the power-cost dataset names the resources its rows use;
 *   - the readiness facts agree with the other datasets.
 *
 * Through M11-C1 nothing in the runtime knew any of it and the APL ARTIFACT
 * was not committed (`m11a2-cross-spec-isolation` requires every
 * `src/simc/data/<class>-<spec>.apl.json` to be loaded by that
 * specialization's registered tree). M11-C2 added the INTERNAL_ONLY tree, the
 * internal id and the artifact together; the scope block at the end of this
 * file is re-pointed accordingly, and the Brewmaster tree's own tests live in
 * the m11c2-* files.
 */

import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  TARGETS as APL_TARGETS,
  extract,
  verifyRequiredFacts,
  type AplExtractionTarget,
} from "../../scripts/authority/extract-simc-apl.mjs";
import { TARGETS as GCD_TARGETS } from "../../scripts/authority/extract-simc-gcd.mjs";
import { TARGETS as TALENT_TARGETS } from "../../scripts/authority/extract-simc-talents.mjs";
import { TARGETS as COOLDOWN_TARGETS } from "../../scripts/authority/extract-simc-ability-cooldowns.mjs";
import gcdArtifact from "../../src/data/game/monk-brewmaster-gcd-semantics.json";
import talentArtifact from "../../src/data/game/monk-brewmaster-talents.json";
import cooldownArtifact from "../../src/data/game/monk-brewmaster-cooldowns.json";
import costArtifact from "../../src/data/game/monk-brewmaster-spender-costs.json";
import {
  executionLaneForTokenIn,
  loadGcdSemantics,
  metaActionLaneRecordIn,
  resolveTokenBindingIn,
} from "../../src/data/game/gcd-semantics-index.js";
import { validateTalentArtifact } from "../../src/data/game/talent-artifact.js";
import { parseAbilityCooldownArtifact } from "../../src/data/game/ability-cooldown-artifact.js";
import { parseSpenderCostArtifact } from "../../src/data/game/spender-cost-artifact.js";
import {
  BREWMASTER_READINESS_COMMIT_SHA,
  BREWMASTER_READINESS_FACTS,
  EMPTY_THE_CELLAR_BUFF_SIMC_SPELL_ID,
  SC_MONK_CPP_SHA256,
} from "../../src/data/game/monk-brewmaster-readiness-authority.js";
import { isBuiltinIdentifier } from "../../src/simc/expression/parse.js";
import { INTERNAL_ONLY_SPEC_IDS, SPEC_IDS } from "../../src/findings/spec-id.js";

const PINNED_COMMIT = "33622e9d1662ff0e451691edf85a6b49cc9d11d9";
const MONK_MODULE = "engine/class_modules/monk/sc_monk.cpp";

// ---------------------------------------------------------------------------
// APL target: the M11-C0 dispatch graph
// ---------------------------------------------------------------------------

const APL = APL_TARGETS["monk-brewmaster"] as AplExtractionTarget;

const LIST_ORDER = [
  ["precombat", "pre"],
  ["default", "def"],
  ["item_actions", "ite"],
  ["race_actions", "rac"],
  ["master_of_harmony", "moh"],
  ["shado_pan", "spm"],
] as const;

/**
 * A Brewmaster-shaped source built from the target's own pinned topology:
 * each list at its pinned size, each dispatch edge at its pinned ordinal with
 * its pinned gate, filler actions elsewhere — plus a Windwalker decoy. The
 * real pinned file is checked the same way at extraction time; CI has no
 * checkout, so this exercises the checker the extraction run relies on.
 */
function brewmasterShapedSource(mutate: (line: string) => string = (line) => line): string {
  const facts = APL.requiredFacts;
  const sizes = facts.listSizes ?? {};
  const edges = facts.edges ?? [];
  const body: string[] = LIST_ORDER.map(
    ([name, receiver]) =>
      `  action_priority_list_t* ${receiver} = player->get_action_priority_list( "${name}" );`,
  );
  for (const [name, receiver] of LIST_ORDER) {
    for (let ordinal = 0; ordinal < (sizes[name] ?? 0); ordinal += 1) {
      const edge = edges.find((candidate) => candidate.from === name && candidate.ordinal === ordinal);
      const action =
        edge === undefined
          ? `filler_${name}_${String(ordinal)}`
          : `${edge.kind === "CALL" ? "call_action_list" : "run_action_list"},name=${edge.to}${edge.condition === null ? "" : `,if=${edge.condition}`}`;
      body.push(mutate(`  ${receiver}->add_action( "${action}" );`));
    }
  }
  return [
    "namespace",
    "{",
    "namespace brewmaster",
    "{",
    "std::string default_potion( const monk_t* player )",
    "{",
    '  return "disabled";',
    "}",
    "void default_apl( monk_t* player )",
    "{",
    ...body,
    "}",
    "};  // namespace brewmaster",
    "namespace windwalker",
    "{",
    "void default_apl( monk_t* player )",
    "{",
    '  action_priority_list_t* def = player->get_action_priority_list( "default" );',
    '  def->add_action( "swap_action_list,name=decoy,target_if=min:decoy" );',
    "}",
    "};  // namespace windwalker",
    "};  // namespace",
  ].join("\n");
}

function problemsFor(source: string): readonly string[] {
  const extracted = extract(source, APL);
  return verifyRequiredFacts({ entryListName: "default", lists: extracted.lists }, APL);
}

describe("the monk-brewmaster APL target", () => {
  it("selects `void default_apl( monk_t* player )` inside `namespace brewmaster`, on `player`", () => {
    expect(APL.sourcePath).toBe("engine/class_modules/apl/apl_monk.cpp");
    expect(APL.enclosingNamespace).toBe("brewmaster");
    expect(APL.functionHeader).toBe("void default_apl( monk_t* player )");
    expect(APL.playerIdentifier).toBe("player");
    expect(APL.regionStart).toBeUndefined();
    expect(APL.regionEnd).toBeUndefined();
    // The region has no client-version guard; a guard would fail extraction.
    expect(APL.clientVersion).toBeUndefined();
    expect(APL.authorityId).toBe("SIMC_APL_MONK_BREWMASTER");
    expect(APL.defaultOut).toBe("src/simc/data/monk-brewmaster.apl.json");
  });

  it("pins exactly the six lists and their entry counts (62 actions)", () => {
    expect(APL.requiredFacts.kind).toBe("DISPATCH_GRAPH");
    expect(APL.requiredFacts.entryListName).toBe("default");
    expect(APL.requiredFacts.listSizes).toEqual({
      precombat: 2,
      default: 6,
      item_actions: 1,
      race_actions: 7,
      master_of_harmony: 23,
      shado_pan: 23,
    });
    expect([...APL.requiredFacts.requiredLists].sort()).toEqual([
      "default",
      "item_actions",
      "master_of_harmony",
      "precombat",
      "race_actions",
      "shado_pan",
    ]);
  });

  it("pins exactly the M11-C0 dispatch edges", () => {
    expect(APL.requiredFacts.edges).toEqual([
      { from: "default", ordinal: 2, kind: "CALL", to: "race_actions", condition: null },
      { from: "default", ordinal: 3, kind: "CALL", to: "item_actions", condition: null },
      {
        from: "default",
        ordinal: 4,
        kind: "RUN",
        to: "master_of_harmony",
        condition: "hero_tree.master_of_harmony",
      },
      { from: "default", ordinal: 5, kind: "RUN", to: "shado_pan", condition: "hero_tree.shadopan" },
    ]);
  });

  it("forbids swap_action_list and every targeting option", () => {
    expect(APL.requiredFacts.forbiddenTokens).toEqual(["swap_action_list"]);
    expect(APL.requiredFacts.noTargetingOptions).toBe(true);
  });

  it("the shared checker accepts a source exhibiting the pinned topology — and ignores the decoy", () => {
    expect(problemsFor(brewmasterShapedSource())).toEqual([]);
  });

  it("the shared checker rejects a targeting option, a swap, a re-gated edge and a resized list", () => {
    const targeting = problemsFor(
      brewmasterShapedSource((line) =>
        line.replace('"filler_shado_pan_7"', '"filler_shado_pan_7,target_if=min:x"'),
      ),
    );
    expect(targeting.some((problem) => problem.startsWith("targeting option found in 'shado_pan'"))).toBe(
      true,
    );

    const swap = problemsFor(
      brewmasterShapedSource((line) =>
        line.replace('"filler_master_of_harmony_0"', '"swap_action_list,name=x"'),
      ),
    );
    expect(swap.some((problem) => problem.startsWith("forbidden token 'swap_action_list'"))).toBe(true);

    const regated = problemsFor(
      brewmasterShapedSource((line) =>
        line.replace("if=hero_tree.shadopan", "if=hero_tree.shadopan&talent.x"),
      ),
    );
    expect(
      regated.some((problem) => problem.startsWith("dispatch graph differs from the pinned topology")),
    ).toBe(true);

    const resized = problemsFor(
      brewmasterShapedSource((line) => (line.includes('"filler_race_actions_6"') ? "" : line)),
    );
    expect(resized).toContain("list 'race_actions' has 6 entries, expected 7");
  });
});

// ---------------------------------------------------------------------------
// GCD semantics
// ---------------------------------------------------------------------------

describe("the Brewmaster GCD dataset", () => {
  const loaded = loadGcdSemantics(gcdArtifact);
  const index = loaded.index;

  it("validates, and records the pin and its hashed sources", () => {
    expect(loaded.load.ok).toBe(true);
    expect(gcdArtifact.datasetId).toBe(GCD_TARGETS["monk-brewmaster"].datasetId);
    expect(gcdArtifact.datasetId).toBe("SIMC_DBC_MONK_BREWMASTER_GCD_SEMANTICS");
    expect(gcdArtifact.provenance.commitSha).toBe(PINNED_COMMIT);
    expect(gcdArtifact.provenance.clientDataWowVersion).toBe("12.1.0.69587");
    expect(gcdArtifact.provenance.abilityDataMethod).toBe("MACHINE_EXTRACTED_DBC_RECORD");
    const paths = gcdArtifact.provenance.sources.map((source) => source.path);
    expect(paths).toContain(MONK_MODULE);
    expect(paths).toContain("engine/player/talent.cpp");
    for (const source of gcdArtifact.provenance.sources) expect(source.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("classifies every action of the pinned list by its executed record, the brews split", () => {
    const expected: Record<string, "GCD_CONSUMING" | "NON_GCD"> = {
      tiger_palm: "GCD_CONSUMING",
      blackout_kick: "GCD_CONSUMING",
      keg_smash: "GCD_CONSUMING",
      breath_of_fire: "GCD_CONSUMING",
      expel_harm: "GCD_CONSUMING",
      chi_burst: "GCD_CONSUMING",
      invoke_niuzao: "GCD_CONSUMING",
      exploding_keg: "GCD_CONSUMING",
      empty_the_cellar: "GCD_CONSUMING",
      rushing_jade_wind: "GCD_CONSUMING",
      celestial_brew: "GCD_CONSUMING",
      purifying_brew: "NON_GCD",
      black_ox_brew: "NON_GCD",
      fortifying_brew: "NON_GCD",
      auto_attack: "NON_GCD",
      use_items: "NON_GCD",
      potion: "NON_GCD",
    };
    for (const [token, lane] of Object.entries(expected)) {
      expect(executionLaneForTokenIn(index, token), token).toBe(lane);
    }
  });

  it("resolves empty_the_cellar to the executed driver 1263438, never the talent record 1262329", () => {
    const binding = resolveTokenBindingIn(index, "empty_the_cellar");
    expect(binding).toMatchObject({ kind: "KNOWN_ONE", abilityGameId: 1263438 });
    const record = (id: number) => gcdArtifact.abilities.find((ability) => ability.abilityGameId === id);
    expect(record(1263438)).toEqual({
      abilityGameId: 1263438,
      baseGcdMs: 1000,
      displayNameEn: "Empty the Cellar",
    });
    // The talent record is carried — with its OWN lane — precisely so the hazard is pinned.
    expect(record(1262329)).toEqual({
      abilityGameId: 1262329,
      baseGcdMs: 0,
      displayNameEn: "Empty the Cellar",
    });
    for (const tokenBinding of gcdArtifact.tokenBindings) {
      expect(tokenBinding.candidateAbilityGameIds, tokenBinding.simcToken).not.toContain(1262329);
    }
    const note =
      gcdArtifact.tokenBindings.find((b) => b.simcToken === "empty_the_cellar")?.binding.sourceNote ?? "";
    expect(note).toContain("find_spell( 1263438 )");
    expect(note).toContain("1262329");
  });

  it("binds celestial_brew to BOTH build-dependent records, which agree on the lane", () => {
    const binding = resolveTokenBindingIn(index, "celestial_brew");
    expect(binding).toMatchObject({ kind: "KNOWN_SET", abilityGameIds: [322507, 1241059] });
    const entry = gcdArtifact.tokenBindings.find((b) => b.simcToken === "celestial_brew");
    expect(entry?.binding.method).toBe("HAND_REVIEWED_CPP_CONTROL_FLOW");
    expect(entry?.binding.sourcePath).toBe(MONK_MODULE);
    expect(entry?.binding.sourceNote).toContain("celestial_infusion_t");
    expect(entry?.binding.sourceNote).toContain("create_expression");
  });

  it("resolves the other build-dependent bindings the pinned C++ states", () => {
    expect(resolveTokenBindingIn(index, "fortifying_brew")).toMatchObject({
      kind: "KNOWN_ONE",
      abilityGameId: 115203,
    });
    expect(resolveTokenBindingIn(index, "blackout_kick")).toMatchObject({
      kind: "KNOWN_ONE",
      abilityGameId: 205523,
    });
    expect(resolveTokenBindingIn(index, "expel_harm")).toMatchObject({
      kind: "KNOWN_ONE",
      abilityGameId: 322101,
    });
    expect(resolveTokenBindingIn(index, "invoke_niuzao")).toMatchObject({
      kind: "KNOWN_ONE",
      abilityGameId: 132578,
    });
  });

  it("binds the seven race_actions tokens to the rows a Monk resolves", () => {
    const racials: Record<string, number> = {
      blood_fury: 33697,
      berserking: 26297,
      arcane_torrent: 129597,
      lights_judgment: 255647,
      fireblood: 265221,
      ancestral_call: 274738,
      bag_of_tricks: 312411,
    };
    for (const [token, id] of Object.entries(racials)) {
      expect(resolveTokenBindingIn(index, token), token).toMatchObject({
        kind: "KNOWN_ONE",
        abilityGameId: id,
      });
    }
  });

  it("gives the three meta tokens a hand-reviewed lane of 0 and no spell binding", () => {
    for (const token of ["auto_attack", "use_items", "potion"]) {
      expect(metaActionLaneRecordIn(index, token)?.triggerGcdMs, token).toBe(0);
      expect(resolveTokenBindingIn(index, token).kind, token).toBe("UNKNOWN");
    }
  });
});

// ---------------------------------------------------------------------------
// Talents, hero trees, apex traits
// ---------------------------------------------------------------------------

describe("the Brewmaster talent dataset", () => {
  const validation = validateTalentArtifact(talentArtifact);

  it("validates against the shared talent-artifact contract", () => {
    expect(validation.ok).toBe(true);
    expect(talentArtifact.datasetId).toBe("SIMC_TRAIT_MONK_BREWMASTER_TALENTS");
    expect(talentArtifact.provenance.commitSha).toBe(PINNED_COMMIT);
    expect(TALENT_TARGETS["monk-brewmaster"].specId).toBe(268);
  });

  it("carries exactly Brewmaster's two hero trees: Shado-Pan 65 and Master of Harmony 66", () => {
    expect(
      talentArtifact.heroTrees.map((tree) => [tree.simcName, tree.subTreeId, tree.entries.length]),
    ).toEqual([
      ["shadopan", 65, 17],
      ["master_of_harmony", 66, 18],
    ]);
    // Conduit of the Celestials (64) is Windwalker/Mistweaver only at the pin.
    expect(talentArtifact.heroTrees.some((tree) => tree.subTreeId === 64)).toBe(false);
    expect(TALENT_TARGETS["monk-brewmaster"].heroTrees).toEqual([
      { simcName: "shadopan", subTreeId: 65 },
      { simcName: "master_of_harmony", subTreeId: 66 },
    ]);
  });

  it("carries the three tiered `apex.N` traits in generated-table order", () => {
    expect(talentArtifact.apexTraits).toEqual([
      {
        apexIndex: 1,
        traitEntryId: 137075,
        traitNodeId: 110435,
        displayNameEn: "Bring Me Another",
        talentSpellId: 1265129,
        selectionIndex: 200,
      },
      {
        apexIndex: 2,
        traitEntryId: 137074,
        traitNodeId: 110435,
        displayNameEn: "Bring Me Another",
        talentSpellId: 1265138,
        selectionIndex: 300,
      },
      {
        apexIndex: 3,
        traitEntryId: 137073,
        traitNodeId: 110435,
        displayNameEn: "Bring Me Another",
        talentSpellId: 1265141,
        selectionIndex: 400,
      },
    ]);
  });

  it("pins the talents later resolution needs, choice nodes with their alternatives", () => {
    const byName = new Map(talentArtifact.talents.map((talent) => [talent.simcName, talent]));
    expect([...byName.keys()].sort()).toEqual([
      "black_ox_brew",
      "blackout_combo",
      "breath_of_fire",
      "celestial_brew",
      "celestial_infusion",
      "chi_burst",
      "exploding_keg",
      "fortifying_brew",
      "invoke_niuzao_the_black_ox",
      "keg_smash",
      "press_the_advantage",
      "purifying_brew",
      "rushing_jade_wind",
      "salsalabims_strength",
    ]);
    expect(byName.get("blackout_combo")?.alternativeEntries.map((alt) => alt.traitEntryId)).toEqual([124997]);
    expect(byName.get("press_the_advantage")?.alternativeEntries.map((alt) => alt.traitEntryId)).toEqual([
      124996,
    ]);
    expect(byName.get("celestial_brew")?.alternativeEntries.map((alt) => alt.traitEntryId)).toEqual([136146]);
    expect(byName.get("celestial_infusion")?.nodeType).toBe("CHOICE");
  });

  it("does NOT pin Empty the Cellar: the table has two rows of that name, and the extractor never picks", () => {
    expect(talentArtifact.talents.some((talent) => talent.displayNameEn === "Empty the Cellar")).toBe(false);
    expect(
      TALENT_TARGETS["monk-brewmaster"].requiredTalents.some((t) => t.displayNameEn === "Empty the Cellar"),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cooldowns
// ---------------------------------------------------------------------------

const BREW_CONTAINER_TOKENS = ["celestial_brew", "purifying_brew", "black_ox_brew", "fortifying_brew"];
const BREW_CONTAINER_IDS = [322507, 1241059, 119582, 115399, 115203];

describe("the Brewmaster cooldown dataset", () => {
  const parsed = parseAbilityCooldownArtifact(cooldownArtifact, "SIMC_DBC_MONK_BREWMASTER_ABILITY_COOLDOWNS");

  it("validates against the shared cooldown-artifact contract", () => {
    expect(parsed.ok).toBe(true);
    expect(cooldownArtifact.provenance.commitSha).toBe(PINNED_COMMIT);
    expect(cooldownArtifact.provenance.specId).toBe(268);
  });

  it("pins the six abilities no pinned code mutates, plus (M11-C3a) Breath of Fire with its one declared cast reset, plus (M11-C4i) Keg Smash with its two declared resets", () => {
    expect(cooldownArtifact.abilities.map((ability) => [ability.simcToken, ability.abilityGameId])).toEqual([
      ["blackout_kick", 205523],
      ["expel_harm", 322101],
      ["chi_burst", 123986],
      ["invoke_niuzao", 132578],
      ["exploding_keg", 325153],
      ["rushing_jade_wind", 116847],
      ["breath_of_fire", 115181],
      ["keg_smash", 121253],
    ]);
    for (const ability of cooldownArtifact.abilities) {
      expect(ability.dynamicModifierPolicy.method, ability.simcToken).toBe("HAND_REVIEWED_CPP_ABSENCE_PROOF");
      expect(ability.dynamicModifierPolicy.sourcePaths, ability.simcToken).toContain(MONK_MODULE);
      // Only Breath of Fire and (M11-C4i) Keg Smash declare dynamic mutations; the six others carry none.
      expect("knownDynamicMutations" in ability, ability.simcToken).toBe(
        ability.simcToken === "breath_of_fire" || ability.simcToken === "keg_smash",
      );
    }
    const bof = cooldownArtifact.abilities.find(
      (ability) => ability.simcToken === "breath_of_fire",
    ) as unknown as {
      baseCooldownMs: number;
      charges: number;
      chargeCooldownMs: number;
      passiveModifierCensus: { modifiers: unknown[] };
      knownDynamicMutations: unknown[];
    };
    expect([bof.baseCooldownMs, bof.charges, bof.chargeCooldownMs]).toEqual([15000, 0, 0]);
    expect(bof.passiveModifierCensus.modifiers).toEqual([]);
    expect(bof.knownDynamicMutations).toMatchObject([
      {
        member: "reset",
        effect: "RESET_TO_READY",
        observableSignature: { kind: "CAST_BY_ACTOR", abilityGameIds: [121253] },
      },
    ]);
  });

  it("pins none of the five brew_t cooldowns, and neither the target nor the artifact names one", () => {
    // `brews_t::adjust` and Black Ox Brew mutate these through a generic
    // `cooldown->` receiver the mechanical policy cannot see; a pass would be
    // a false absence proof.
    const target = COOLDOWN_TARGETS["monk-brewmaster"] as {
      abilities: { simcToken: string; abilityGameId: number }[];
    };
    for (const entry of [...target.abilities, ...cooldownArtifact.abilities]) {
      expect(BREW_CONTAINER_TOKENS, entry.simcToken).not.toContain(entry.simcToken);
      expect(BREW_CONTAINER_IDS, entry.simcToken).not.toContain(entry.abilityGameId);
    }
    // Keg Smash (M11-C4i) is pinned for the POSITIVE readiness proof only:
    // one charge record (8,000 ms), Stormstout's Last Keg (+1 charge) and the
    // hasted category in its census, and its two resets declared RESET_TO_READY.
    // Every one of those can only make it MORE ready, so the pinned charge
    // cooldown is an upper bound; no charge count, recharge or NOT_READY is
    // modelled from it.
    const kegSmash = cooldownArtifact.abilities.find(
      (ability) => ability.simcToken === "keg_smash",
    ) as unknown as {
      charges: number;
      chargeCooldownMs: number;
      passiveModifierCensus: { modifiers: { direction: string }[] };
      knownDynamicMutations: { effect: string }[];
    };
    expect([kegSmash.charges, kegSmash.chargeCooldownMs]).toEqual([1, 8000]);
    expect(kegSmash.passiveModifierCensus.modifiers.map((modifier) => modifier.direction)).toEqual([
      "CHANGES_CHARGES",
      "SHORTENS_WITH_HASTE",
    ]);
    expect(kegSmash.knownDynamicMutations.map((mutation) => mutation.effect)).toEqual([
      "RESET_TO_READY",
      "RESET_TO_READY",
    ]);
  });

  it("states a Monk-accurate cooldown-start note (Chi Burst has a cast time)", () => {
    for (const ability of cooldownArtifact.abilities) {
      expect(ability.cooldownStart.note, ability.simcToken).toContain("Chi Burst");
      expect(ability.cooldownStart.note, ability.simcToken).not.toContain("Divine Toll");
    }
  });
});

// ---------------------------------------------------------------------------
// Power costs
// ---------------------------------------------------------------------------

describe("the Brewmaster power-cost dataset", () => {
  const parsed = parseSpenderCostArtifact(costArtifact, "SIMC_DBC_MONK_BREWMASTER_SPENDER_COSTS");

  it("validates, and names the resources its rows use", () => {
    expect(parsed.ok).toBe(true);
    expect(costArtifact.provenance.powerTypes).toMatchObject({ POWER_ENERGY: 3, POWER_CHI: 12 });
  });

  it("records every row verbatim, aura-keyed variants included", () => {
    const rows = (token: string) =>
      costArtifact.spells
        .find((spell) => spell.simcToken === token)
        ?.powerRows.map((row) => [row.powerType, row.cost, row.auraSpellId]);
    expect(rows("tiger_palm")).toEqual([[3, 50, 0]]);
    expect(rows("keg_smash")).toEqual([[3, 40, 0]]);
    expect(rows("expel_harm")).toEqual([
      [3, 15, 137025],
      [0, 0, 137024],
      [3, 15, 137023],
    ]);
    expect(rows("rushing_jade_wind")).toEqual([[12, 1, 0]]);
  });
});

// ---------------------------------------------------------------------------
// Readiness facts
// ---------------------------------------------------------------------------

describe("the Brewmaster readiness facts", () => {
  const gcdIndex = loadGcdSemantics(gcdArtifact).index;
  const monkHashIn = (sources: readonly { path: string; sha256: string }[]) =>
    sources.find((source) => source.path === MONK_MODULE)?.sha256;

  it("are hashed against the same module bytes the GCD and cooldown datasets record", () => {
    expect(BREWMASTER_READINESS_COMMIT_SHA).toBe(PINNED_COMMIT);
    expect(monkHashIn(gcdArtifact.provenance.sources)).toBe(SC_MONK_CPP_SHA256);
    expect(monkHashIn(cooldownArtifact.provenance.sources)).toBe(SC_MONK_CPP_SHA256);
    for (const fact of BREWMASTER_READINESS_FACTS) {
      for (const claim of fact.claims) {
        expect(claim.sourcePath, fact.simcToken).toBe(MONK_MODULE);
        expect(claim.sourceSha256, fact.simcToken).toBe(SC_MONK_CPP_SHA256);
      }
    }
  });

  it("cover every ready() override on a Brewmaster action, and agree with the GCD dataset", () => {
    expect(BREWMASTER_READINESS_FACTS.map((fact) => fact.simcToken)).toEqual([
      "chi_burst",
      "empty_the_cellar",
      "purifying_brew",
      "tiger_palm",
    ]);
    for (const fact of BREWMASTER_READINESS_FACTS) {
      const binding = resolveTokenBindingIn(gcdIndex, fact.simcToken);
      const ids =
        binding.kind === "KNOWN_ONE"
          ? [binding.abilityGameId]
          : binding.kind === "KNOWN_SET"
            ? binding.abilityGameIds
            : [];
      expect(ids, fact.simcToken).toEqual(fact.executedAbilityGameIds);
      for (const id of ids) {
        expect(
          gcdArtifact.abilities.find((ability) => ability.abilityGameId === id)?.baseGcdMs,
          fact.simcToken,
        ).toBe(fact.baseGcdMs);
      }
    }
  });

  it("pin Empty the Cellar's aura gate with its wire identity corroborated by committed evidence (M11-C4i)", () => {
    const fact = BREWMASTER_READINESS_FACTS.find((candidate) => candidate.simcToken === "empty_the_cellar");
    expect(fact?.gate).toMatchObject({
      kind: "REQUIRES_AURA_ACTIVE",
      simcBuffName: "empty_the_cellar",
      simcBuffSpellId: EMPTY_THE_CELLAR_BUFF_SIMC_SPELL_ID,
      wireAuraIdentity: {
        state: "CORROBORATED",
        wireAuraId: 1262768,
        fixtureId: "wcl-brewmaster-monk-gtkb-rotational-165s.seg-20-165",
      },
    });
    expect(EMPTY_THE_CELLAR_BUFF_SIMC_SPELL_ID).toBe(1262768);
    expect(fact?.claims.map((claim) => claim.lines)).toContain("3447-3450");
  });

  it("pin Tiger Palm's talent gate to a talent the talent dataset actually carries", () => {
    const fact = BREWMASTER_READINESS_FACTS.find((candidate) => candidate.simcToken === "tiger_palm");
    expect(fact?.gate).toEqual({
      kind: "NOT_READY_WHILE_TALENT_SELECTED",
      talentSimcName: "press_the_advantage",
    });
    expect(talentArtifact.talents.some((talent) => talent.simcName === "press_the_advantage")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scope: authority only
// ---------------------------------------------------------------------------

const PRODUCTION_SOURCES: Record<string, string> = import.meta.glob("../../src/**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});

describe("M11-C1 onboarded no analyzer; M11-C2 added one, INTERNAL_ONLY, inside its own boundary", () => {
  it("the SpecId is INTERNAL_ONLY, the tree exists, and the APL artifact is committed (R7 satisfied by the tree)", () => {
    // RE-POINTED AT M11-C2. Through M11-C1 each of these was absent; M11-C2
    // added the internal id, the specialization tree and the canonical
    // artifact together, so R7 (m11a2-cross-spec-isolation) holds naturally.
    expect((SPEC_IDS as readonly string[]).includes("monk/brewmaster")).toBe(true);
    expect((INTERNAL_ONLY_SPEC_IDS as readonly string[]).includes("monk/brewmaster")).toBe(true);
    expect(existsSync("src/specs/monk/brewmaster/registration.ts")).toBe(true);
    expect(existsSync("src/simc/data/monk-brewmaster.apl.json")).toBe(true);
  });

  it("only the Brewmaster tree and the Brewmaster data modules import a Brewmaster dataset or the readiness facts", () => {
    const paths = Object.keys(PRODUCTION_SOURCES);
    expect(paths.length).toBeGreaterThan(100);
    const importers: string[] = [];
    for (const [path, code] of Object.entries(PRODUCTION_SOURCES)) {
      if (/from\s+["'][^"']*monk-brewmaster[^"']*["']/.test(code)) {
        importers.push(path.replace(/^.*\/src\//, "src/"));
      }
    }
    expect(importers.length).toBeGreaterThan(0);
    for (const path of importers) {
      expect(
        path.startsWith("src/specs/monk/brewmaster/") || path.startsWith("src/data/game/monk-brewmaster-"),
        path,
      ).toBe(true);
    }
  });

  it("adds no spec-vocabulary identifier to the shared parser", () => {
    for (const identifier of [
      "talent.blackout_combo.enabled",
      "talent.salsalabims_strength.enabled",
      "apex.1",
      "apex.3",
      "hero_tree.shadopan",
      "hero_tree.master_of_harmony",
      "cooldown.celestial_brew.charges_fractional",
      "cooldown.keg_smash.charges_fractional",
      "buff.aspect_of_harmony_accumulator.value",
      "health.max",
      "energy",
      "energy.regen",
    ]) {
      expect(isBuiltinIdentifier(identifier), identifier).toBe(false);
    }
  });
});
