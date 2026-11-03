/**
 * HEAL-B1: the shared healing-cooldown identity reader and the four
 * specialization artifacts it reads; since HEAL-B2, five (Holy Priest).
 *
 * - Each artifact loads under its own dataset, class and specialization, and
 *   under no other.
 * - Each entry IS its pinned trait row: tree 2, the class, the node entry, the
 *   node, the name, the first id_spec, the node type, and the cast id, which
 *   is the row's id_override_spell when it has one and id_spell otherwise.
 * - Choice siblings are exactly the other identified entries on the node; a
 *   CHOICE node may have none identified, a NORMAL node never has one.
 * - Nothing about cooldown, charges or duration is claimed.
 */

import { describe, expect, it } from "vitest";

import druidJson from "../../../src/data/game/druid-restoration-healing-cooldowns.json";
import { pinnedRestorationDruidHealingCooldowns } from "../../../src/data/game/druid-restoration-healing-cooldowns.js";
import { parseHealingCooldownIdentityArtifact } from "../../../src/data/game/healing-cooldown-identity-artifact.js";
import mistweaverJson from "../../../src/data/game/monk-mistweaver-healing-cooldowns.json";
import { pinnedMistweaverMonkHealingCooldowns } from "../../../src/data/game/monk-mistweaver-healing-cooldowns.js";
import holyJson from "../../../src/data/game/paladin-holy-healing-cooldowns.json";
import {
  parseHolyPaladinHealingCooldowns,
  pinnedHolyPaladinHealingCooldowns,
} from "../../../src/data/game/paladin-holy-healing-cooldowns.js";
import holyPriestJson from "../../../src/data/game/priest-holy-healing-cooldowns.json";
import {
  parseHolyPriestHealingCooldowns,
  pinnedHolyPriestHealingCooldowns,
} from "../../../src/data/game/priest-holy-healing-cooldowns.js";
import shamanJson from "../../../src/data/game/shaman-restoration-healing-cooldowns.json";
import { pinnedRestorationShamanHealingCooldowns } from "../../../src/data/game/shaman-restoration-healing-cooldowns.js";

const PIN = "33622e9d1662ff0e451691edf85a6b49cc9d11d9";

describe("the five pinned artifacts", () => {
  it.each([
    [
      "Restoration Shaman",
      pinnedRestorationShamanHealingCooldowns,
      [
        [98008, "NORMAL", []],
        [114052, "CHOICE", [108280]],
        [108280, "CHOICE", [114052]],
      ],
    ],
    [
      "Holy Paladin",
      pinnedHolyPaladinHealingCooldowns,
      [
        [31821, "NORMAL", []],
        [31884, "CHOICE", [216331]],
        [216331, "CHOICE", [31884]],
      ],
    ],
    [
      "Restoration Druid",
      pinnedRestorationDruidHealingCooldowns,
      [
        [740, "NORMAL", []],
        [33891, "CHOICE", [391528]],
        [391528, "CHOICE", [33891]],
        [197721, "NORMAL", []],
      ],
    ],
    [
      "Mistweaver Monk",
      pinnedMistweaverMonkHealingCooldowns,
      [
        [115310, "CHOICE", [388615]],
        [388615, "CHOICE", [115310]],
        [322118, "CHOICE", [325197]],
        [325197, "CHOICE", [322118]],
      ],
    ],
    [
      "Holy Priest",
      pinnedHolyPriestHealingCooldowns,
      [
        [64843, "NORMAL", []],
        [200183, "NORMAL", []],
      ],
    ],
  ] as const)(
    "%s loads its entries, each its own verbatim row at the pinned commit",
    (_label, load, expected) => {
      const loaded = load();
      if (!loaded.ok) throw new Error(loaded.reason);
      expect(loaded.commitSha).toBe(PIN);
      expect(loaded.clientDataWowVersion).toBe("12.1.0.69587");
      expect(
        loaded.cooldowns.map((entry) => [
          entry.abilityGameId,
          entry.nodeType,
          entry.choiceSiblingAbilityGameIds,
        ]),
      ).toEqual(expected);
      for (const entry of loaded.cooldowns) expect(entry.useEvidence).toBe("CAST_BY_SUBJECT");
    },
  );

  it("claims nothing about cooldown, charges or duration", () => {
    for (const artifact of [shamanJson, holyJson, druidJson, mistweaverJson, holyPriestJson]) {
      for (const entry of artifact.healingCooldowns) {
        for (const key of Object.keys(entry)) expect(key).not.toMatch(/cooldownMs|charge|duration/i);
      }
    }
  });

  it("an artifact is read only under its own dataset, class and specialization", () => {
    const expectation = { datasetId: "SIMC_DBC_PALADIN_HOLY_HEALING_COOLDOWNS", classId: 2, specId: 65 };
    expect(parseHealingCooldownIdentityArtifact(holyJson, expectation).ok).toBe(true);
    expect(parseHealingCooldownIdentityArtifact(holyJson, { ...expectation, datasetId: "OTHER" })).toEqual({
      ok: false,
      reason: "DATASET_ID_MISMATCH",
    });
    // Retribution (70) and Protection (66) are the same class, never the same artifact.
    expect(parseHealingCooldownIdentityArtifact(holyJson, { ...expectation, specId: 70 })).toEqual({
      ok: false,
      reason: "SPECIALIZATION_MISMATCH",
    });
    expect(
      parseHealingCooldownIdentityArtifact(shamanJson, {
        datasetId: "SIMC_DBC_SHAMAN_RESTORATION_HEALING_COOLDOWNS",
        classId: 11,
        specId: 264,
      }),
    ).toEqual({ ok: false, reason: "SPECIALIZATION_MISMATCH" });
    // Discipline (256) and Shadow (258) are the same class, never the Holy Priest artifact.
    for (const specId of [256, 258]) {
      expect(
        parseHealingCooldownIdentityArtifact(holyPriestJson, {
          datasetId: "SIMC_DBC_PRIEST_HOLY_HEALING_COOLDOWNS",
          classId: 5,
          specId,
        }),
      ).toEqual({ ok: false, reason: "SPECIALIZATION_MISMATCH" });
    }
  });

  it("a Holy Priest entry citing Divine Hymn's healing pulse (64844) instead of its cast is refused", () => {
    const tampered = structuredClone(holyPriestJson);
    tampered.healingCooldowns[0]!.abilityGameId = 64844;
    expect(parseHolyPriestHealingCooldowns(tampered)).toEqual({ ok: false, reason: "PINNED_ROW_MISMATCH" });
  });
});

describe("an entry must BE the row it cites", () => {
  const crusaderIndex = holyJson.healingCooldowns.findIndex(
    (entry) => entry.displayNameEn === "Avenging Crusader",
  );

  it("the cast id is the row's activated override: Avenging Crusader is 216331, not its talent spell 394088", () => {
    expect(holyJson.healingCooldowns[crusaderIndex]?.pinnedRow).toContain(" 394088,      0, 216331,");
    const tampered = structuredClone(holyJson);
    tampered.healingCooldowns[crusaderIndex]!.abilityGameId = 394088;
    tampered.healingCooldowns.forEach((entry) => {
      entry.choiceSiblingAbilityGameIds = entry.choiceSiblingAbilityGameIds.map((id) =>
        id === 216331 ? 394088 : id,
      );
    });
    expect(parseHolyPaladinHealingCooldowns(tampered)).toEqual({ ok: false, reason: "PINNED_ROW_MISMATCH" });
  });

  it("a node type other than the row's is refused", () => {
    const tampered = structuredClone(holyJson);
    tampered.healingCooldowns[0]!.nodeType = "CHOICE";
    expect(parseHolyPaladinHealingCooldowns(tampered)).toEqual({ ok: false, reason: "PINNED_ROW_MISMATCH" });
  });

  it("a row of another class or specialization is refused", () => {
    const tampered = structuredClone(holyJson);
    tampered.healingCooldowns[0]!.pinnedRow = tampered.healingCooldowns[0]!.pinnedRow.replace(
      "{   65,",
      "{   70,",
    );
    expect(parseHolyPaladinHealingCooldowns(tampered)).toEqual({ ok: false, reason: "PINNED_ROW_MISMATCH" });
  });

  it("a CHOICE node may have no identified sibling; a NORMAL node may have none at all; declared siblings must match", () => {
    // Avenging Wrath alone on its node: its other choice is simply not identified.
    const alone = structuredClone(holyJson);
    alone.healingCooldowns.splice(crusaderIndex, 1);
    alone.healingCooldowns.forEach((entry) => (entry.choiceSiblingAbilityGameIds = []));
    const loaded = parseHolyPaladinHealingCooldowns(alone);
    expect(loaded.ok && loaded.cooldowns.map((entry) => [entry.abilityGameId, entry.nodeType])).toEqual([
      [31821, "NORMAL"],
      [31884, "CHOICE"],
    ]);
    const incoherent = structuredClone(holyJson);
    incoherent.healingCooldowns[1]!.choiceSiblingAbilityGameIds = [];
    expect(parseHolyPaladinHealingCooldowns(incoherent)).toEqual({
      ok: false,
      reason: "CHOICE_SIBLINGS_INCOHERENT",
    });
  });
});
