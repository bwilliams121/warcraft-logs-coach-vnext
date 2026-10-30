/**
 * The preparation consumable extractor's rules
 * (scripts/authority/extract-preparation-consumables.mjs), on synthetic
 * sc_spell_data.inc rows written in the pinned column layout.
 */

import { describe, expect, it } from "vitest";

import {
  anchorProblems,
  classifyConsumables,
  parseRacialSpellIds,
  parseSpellData,
} from "../../scripts/authority/extract-preparation-consumables.mjs";

const NO_RACE = "0x0000000000000000";

/** A spell row: fields after the id, with the read columns placed by index. */
function spellRow(
  name: string,
  id: number,
  options: { raceMask?: string; cooldownMs?: number; category?: number; durationMs?: number } = {},
): string {
  const fields = Array.from({ length: 32 }, () => "0");
  fields[4] = options.raceMask ?? NO_RACE;
  fields[14] = String(options.cooldownMs ?? 0);
  fields[16] = String(options.cooldownMs ?? 0);
  fields[21] = String(options.category ?? 0);
  fields[26] = String(options.durationMs ?? 0);
  return `  { "${name}"   , ${String(id)}, ${fields.join(", ")} },`;
}

let effectId = 1;
const effectRow = (spellId: number, type: number) =>
  `  { ${String(effectId++)}, ${String(spellId)}, 0, ${String(type)}, 0, 0, 0x00000000, 0.000000 },`;

const HEAL = 10;
const AURA = 6;
const HEAL_PCT = 136;

const ANCHOR_ROWS = [
  spellRow("Healthstone", 6262, { cooldownMs: 60000, category: 1711 }),
  effectRow(6262, HEAL_PCT),
  spellRow("Silvermoon Health Potion", 1234768, { cooldownMs: 300000, category: 30 }),
  effectRow(1234768, HEAL),
  spellRow("Potion of Recklessness", 1236994, { cooldownMs: 300000, category: 4, durationMs: 30000 }),
  effectRow(1236994, AURA),
];

const parse = (...rows: string[]) => parseSpellData([...ANCHOR_ROWS, ...rows].join("\n"));
const kinds = (rows: string[], racial = new Set<number>()) =>
  Object.fromEntries(classifyConsumables(parse(...rows), racial).map((entry) => [entry.spellId, entry.kind]));

describe("column guard", () => {
  it("the anchors read as expected in the pinned layout", () => {
    expect(anchorProblems(parse())).toEqual([]);
  });

  it("a shifted category column, a renamed anchor or a missing effect stops the extraction", () => {
    const shifted = parseSpellData(
      ANCHOR_ROWS.map((row) => row.replace(", 1711,", ", 0, 1711,").replace(", 30,", ", 0, 30,")).join("\n"),
    );
    expect(anchorProblems(shifted).length).toBeGreaterThan(0);
    const renamed = parseSpellData(ANCHOR_ROWS.join("\n").replace('"Healthstone"', '"Soulstone"'));
    expect(anchorProblems(renamed)).toContain('anchor 6262 is named "Soulstone"');
    const noEffect = parseSpellData(
      ANCHOR_ROWS.filter((row) => !row.includes(`, 1236994, 0, ${String(AURA)},`)).join("\n"),
    );
    expect(anchorProblems(noEffect)).toContain("anchor 1236994 has no effect 6");
  });
});

describe("classification by shared cooldown category", () => {
  it("category 30 is the health-potion slot, category 4 the combat-potion slot", () => {
    expect(
      kinds([
        spellRow("Amani Extract", 1263074, { category: 30, durationMs: 15000 }),
        effectRow(1263074, AURA),
        spellRow("Aerated Mana Potion", 370607, { category: 4 }),
        effectRow(370607, 30),
      ]),
    ).toMatchObject({
      1263074: "HEALTH_POTION",
      370607: "COMBAT_POTION",
      1234768: "HEALTH_POTION",
      1236994: "COMBAT_POTION",
    });
  });

  it("a direct-heal 'Healthstone' with a category is a healthstone, even on the potion cooldown", () => {
    expect(
      kinds([
        spellRow("Legion Healthstone", 200452, { category: 30 }),
        effectRow(200452, HEAL),
        spellRow("Demonic Healthstone", 452930, { category: 2566 }),
        effectRow(452930, HEAL_PCT),
      ]),
    ).toMatchObject({ 200452: "HEALTHSTONE", 452930: "HEALTHSTONE", 6262: "HEALTHSTONE" });
  });

  it("a healthstone-named aura without a category is not a use (the talent modifier)", () => {
    const result = kinds([spellRow("Empowered Healthstone", 1271699), effectRow(1271699, AURA)]);
    expect(result[1271699]).toBeUndefined();
  });

  it("spells on no shared consumable cooldown are not classified", () => {
    expect(
      kinds([spellRow("Heart Strike", 206930, { category: 0 }), effectRow(206930, 2)])[206930],
    ).toBeUndefined();
  });

  it("records the aura duration only for aura-applying spells", () => {
    const entries = classifyConsumables(parse(), new Set());
    expect(entries.find((entry) => entry.spellId === 1236994)).toMatchObject({
      appliesAura: true,
      auraDurationMs: 30000,
    });
    expect(entries.find((entry) => entry.spellId === 1234768)).toMatchObject({
      appliesAura: false,
      auraDurationMs: null,
    });
  });
});

describe("racial abilities are never classified", () => {
  it("a race-masked spell in a consumable category stops the extraction", () => {
    expect(() =>
      kinds([
        spellRow("Gift of the Naaru", 28880, { category: 30, raceMask: "0x0000000000000400" }),
        effectRow(28880, HEAL),
      ]),
    ).toThrow(/racial ability 28880/);
  });

  it("a spell listed in racial_spells.inc stops the extraction", () => {
    const racial = parseRacialSpellIds(
      [
        '  { 0x0000000000000002, 0x00000240,   33697, "Blood Fury"                         },',
        '  { 0x0000000000000400, 0x00003fff,   28880, "Gift of the Naaru"                  },',
      ].join("\n"),
    );
    expect([...racial].sort()).toEqual([28880, 33697]);
    expect(() =>
      kinds([spellRow("Blood Fury", 33697, { category: 4 }), effectRow(33697, AURA)], racial),
    ).toThrow(/racial ability 33697/);
  });
});
