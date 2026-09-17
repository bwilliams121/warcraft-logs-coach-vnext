/**
 * M10-B: the pinned Protection Paladin SimulationCraft artifact.
 *
 * WHAT IS PINNED AND WHAT IS NOT
 *
 * The artifact is the `//protection_apl_start .. //protection_apl_end` region
 * of `engine/class_modules/apl/apl_paladin.cpp` at the SAME commit the
 * Assassination authority is pinned to, extracted by the same extractor under
 * a target profile, and validated by the same artifact validator. It is
 * committed so M10-C can bind it as `SIMC_APL` authority for
 * `OFFENSIVE_ROTATION` — and for nothing else.
 *
 * AT M10-B it was NOT registered. AT M10-C it is: bound by
 * `src/specs/paladin/protection/registration.ts` to OFFENSIVE_ROTATION and to
 * nothing else, loaded by that tree's own `pinned-authority.ts`, and reached
 * by production code through exactly that module. The tests below pin the
 * M10-C state, together with the classification the binding respects: a
 * damage-oriented priority list that happens to contain
 * `shield_of_the_righteous` and `word_of_glory` is still offensive authority.
 * SimulationCraft orders those lines for damage in a simulation; nothing in
 * the source conditions them on incoming damage, health or a defensive plan,
 * so the artifact establishes nothing about ACTIVE_MITIGATION, SELF_HEALING,
 * DEFENSIVE_COOLDOWN, RESOURCE_SPENDING or INTERRUPT decisions.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { PROVIDER_DOMAIN_COMPATIBILITY, providerMayGovern } from "../../src/findings/authority-domain.js";
import { deriveActionToken, deriveConditionRaw, loadAplAuthority } from "../../src/simc/apl-authority.js";
import { validateAuthorityArtifact } from "../../src/simc/authority-artifact.js";
import { parseSimcExpression } from "../../src/simc/expression/parse.js";
import { ANALYZER_REGISTRATIONS } from "../../src/services/analyzer-registry.js";
import paladinArtifact from "../../src/simc/data/paladin-protection.apl.json";
import rogueArtifact from "../../src/simc/data/rogue-assassination.apl.json";

const PINNED_COMMIT = "33622e9d1662ff0e451691edf85a6b49cc9d11d9";

function filesUnder(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true, withFileTypes: false })
    .map((entry) => `${root}/${String(entry).replace(/\\/g, "/")}`)
    .filter((path) => statSync(path).isFile() && path.endsWith(".ts"));
}

describe("the Protection Paladin artifact is pinned to the same commit as Assassination", () => {
  it("validates under the shared artifact validator", () => {
    const validation = validateAuthorityArtifact(paladinArtifact);
    expect(validation.ok).toBe(true);
  });

  it("records the exact source coordinates and integrity metadata", () => {
    expect(paladinArtifact.authorityId).toBe("SIMC_APL_PALADIN_PROTECTION");
    expect(paladinArtifact.artifactRevision).toBe("simc-33622e9d-1");
    expect(paladinArtifact.spec).toEqual({ className: "paladin", specName: "protection" });
    expect(paladinArtifact.entryListName).toBe("default");
    expect(paladinArtifact.provenance).toMatchObject({
      repository: "https://github.com/simulationcraft/simc",
      branch: "midnight",
      commitSha: PINNED_COMMIT,
      commitDate: "2026-09-12",
      sourcePath: "engine/class_modules/apl/apl_paladin.cpp",
      sourceSha256: "ed3fb1ac5b1c6c83bf21abbcaff5afe282678a69d51bdc953cc9897dca94bc02",
      sourceByteLength: 10081,
      regionStartMarker: "//protection_apl_start",
      regionEndMarker: "//protection_apl_end",
      extractorVersion: 1,
    });
    // Same commit, same extractor, same revision scheme as the Rogue artifact.
    expect(paladinArtifact.provenance.commitSha).toBe(rogueArtifact.provenance.commitSha);
    expect(paladinArtifact.provenance.extractorVersion).toBe(rogueArtifact.provenance.extractorVersion);
    expect(paladinArtifact.artifactRevision).toBe(rogueArtifact.artifactRevision);
  });

  it("holds two lists — default (30) and precombat (6) — and no list dispatch", () => {
    const loaded = loadAplAuthority(paladinArtifact);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.authority.artifact.lists.map((list) => [list.listName, list.actions.length])).toEqual([
      ["default", 30],
      ["precombat", 6],
    ]);
    for (const action of loaded.authority.actions) {
      expect(action.entryKind, action.actionStringVerbatim).toBe("PLAYER_ACTION");
    }
  });

  it("names the spender and the self-heal exactly once each in default, as damage-priority lines", () => {
    const tokens = paladinArtifact.lists
      .find((list) => list.listName === "default")
      ?.actions.map((action) => deriveActionToken(action.actionStringVerbatim));
    expect(tokens?.filter((token) => token === "shield_of_the_righteous")).toHaveLength(1);
    expect(tokens?.filter((token) => token === "word_of_glory")).toHaveLength(1);
    // No line in the source reads incoming damage, health, or a defensive
    // plan: every condition is a buff, debuff, cooldown, talent or resource
    // atom. Pinned so the classification below is checkable, not asserted.
    for (const list of paladinArtifact.lists) {
      for (const action of list.actions) {
        const condition = deriveConditionRaw(action.actionStringVerbatim) ?? "";
        for (const forbidden of ["health", "incoming_damage", "damage_taken", "hp_pct", "tank"]) {
          expect(condition, action.actionStringVerbatim).not.toContain(forbidden);
        }
      }
    }
  });
});

describe("what the current parser can and cannot read of it (recorded, not weakened)", () => {
  const conditions = paladinArtifact.lists.flatMap((list) =>
    list.actions.map((action) => ({
      list: list.listName,
      action: action.actionStringVerbatim,
      condition: deriveConditionRaw(action.actionStringVerbatim),
    })),
  );

  it("parses the unconditional lines and refuses the rest with a named reason", () => {
    const unconditional = conditions.filter((entry) => entry.condition === null);
    const conditional = conditions.filter((entry) => entry.condition !== null);
    expect(unconditional.length).toBe(16);
    expect(conditional.length).toBe(20);

    const refused = new Map<string, number>();
    let parsed = 0;
    for (const entry of conditional) {
      const result = parseSimcExpression(entry.condition ?? "");
      if (result.ok) parsed += 1;
      else
        refused.set(
          `${result.reason}:${result.fragment}`,
          (refused.get(`${result.reason}:${result.fragment}`) ?? 0) + 1,
        );
    }
    // MEASURED at M10-B, then pinned. Ten conditions parse today (buff.up,
    // buff.remains, buff.stack, debuff.up, cooldown.remains, comparisons);
    // ten are refused at the identifier the parser does not know — `next_armament`
    // (three lines), `consecration.up` (two), `talent.x.enabled`, `prev_gcd`,
    // `hero_tree`, `apex`, `full_recharge_time`. STILL TRUE AT M10-C for the
    // shared parser WITHOUT a vocabulary: M10-C admitted these through the
    // specialization seam (`src/specs/paladin/protection/vocabulary.ts`),
    // never by relaxing the shared parser. Every refusal is
    // UNSUPPORTED_IDENTIFIER, none is a silent false.
    expect(parsed + [...refused.values()].reduce((sum, count) => sum + count, 0)).toBe(20);
    expect(parsed).toBe(10);
    expect([...refused.entries()].sort()).toEqual([
      ["UNSUPPORTED_IDENTIFIER:apex.3", 1],
      ["UNSUPPORTED_IDENTIFIER:consecration.up", 2],
      ["UNSUPPORTED_IDENTIFIER:full_recharge_time", 1],
      ["UNSUPPORTED_IDENTIFIER:hero_tree.lightsmith", 1],
      ["UNSUPPORTED_IDENTIFIER:next_armament", 3],
      ["UNSUPPORTED_IDENTIFIER:prev_gcd.1.divine_toll", 1],
      ["UNSUPPORTED_IDENTIFIER:talent.righteous_protector.enabled", 1],
    ]);
  });
});

describe("the artifact is pinned, bound by exactly one registration, and offensive only", () => {
  it("exactly one production module imports it: the Paladin tree's own loader (M10-C)", () => {
    const importers = filesUnder("src").filter((path) =>
      readFileSync(path, "utf8").includes("paladin-protection.apl.json"),
    );
    expect(importers).toEqual(["src/specs/paladin/protection/pinned-authority.ts"]);
  });

  it("exactly one registration in the production catalog binds it, to OFFENSIVE_ROTATION only (M10-C)", () => {
    const bindings = ANALYZER_REGISTRATIONS.flatMap((registration) =>
      registration.authorityBindings
        .filter((binding) => binding.authorityId === "SIMC_APL_PALADIN_PROTECTION")
        .map((binding) => [registration.specId, binding.domain]),
    );
    expect(bindings).toEqual([["paladin/protection", "OFFENSIVE_ROTATION"]]);
  });

  it("a SIMC_APL binding of it could govern OFFENSIVE_ROTATION and no tank domain", () => {
    expect(PROVIDER_DOMAIN_COMPATIBILITY.SIMC_APL).toEqual(["OFFENSIVE_ROTATION"]);
    for (const domain of [
      "ACTIVE_MITIGATION",
      "DEFENSIVE_COOLDOWN",
      "SELF_HEALING",
      "RESOURCE_SPENDING",
      "INTERRUPT",
    ] as const) {
      expect(providerMayGovern("SIMC_APL", domain), domain).toBe(false);
    }
  });
});
