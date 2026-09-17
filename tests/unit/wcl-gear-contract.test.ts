/**
 * M10-C4: the ONE dated Warcraft Logs contract for optional gear identities,
 * implemented once in `combatant-info.ts`.
 *
 * Real-evidence cases read the committed captures; every other row here is
 * SYNTHETIC and exercises exactly one shape of the raw payload.
 */

import { describe, expect, it } from "vitest";

import {
  installedGemIds,
  isEmptyGearSlot,
  normalizeGear,
  readEnchantState,
  readGemsState,
} from "../../src/engine/normalization/combatant-info.js";
import { WCL_GEAR_UI_SEMANTICS_REVISION } from "../../src/engine/normalization/normalized-events.js";
import { corpusState } from "../support/corpus/fight.js";
import { readdirSync, readFileSync, statSync } from "node:fs";

const KNOWN_NONE = {
  state: "KNOWN_NONE",
  contract: "WCL_COMBATANT_INFO_GEAR_UI_SEMANTICS_2026_09_17",
} as const;

describe("the dated contract and its provenance", () => {
  it("is named by revision, and the revision says what it is: current UI behaviour stated in writing on 2026-09-17", () => {
    expect(WCL_GEAR_UI_SEMANTICS_REVISION).toBe("WCL_COMBATANT_INFO_GEAR_UI_SEMANTICS_2026_09_17");
    // The exact statement, and the exact limits, are recorded beside the identifier
    // (as a wrapped doc comment, so whitespace is normalised before matching).
    const source = readFileSync("src/engine/normalization/normalized-events.ts", "utf8")
      .replace(/\n \* ?/g, " ")
      .replace(/\s+/g, " ");
    expect(source).toContain("the value of those fields is the value we use for the UI on warcraftlogs");
    expect(source).toContain("no further guarantees are made");
    expect(source).toContain("the interpretations you posted are currently correct");
    expect(source).toContain("2026-09-17");
    expect(source).toContain("not a GraphQL schema guarantee");
    expect(source).toContain("no promise about future payloads");
  });
});

describe("omission on a valid gear row", () => {
  it("is KNOWN_NONE for permanentEnchant, temporaryEnchant and gems, tagged with the revision", () => {
    const row = { id: 271_465, itemLevel: 300 };
    expect(readEnchantState(row, "permanentEnchant")).toEqual(KNOWN_NONE);
    expect(readEnchantState(row, "temporaryEnchant")).toEqual(KNOWN_NONE);
    expect(readGemsState(row)).toEqual(KNOWN_NONE);
    expect(installedGemIds(readGemsState(row))).toEqual([]);
  });

  it("decides omission by OWN property, so an inherited or undefined-valued key is not an omission", () => {
    const inherited = Object.create({ permanentEnchant: 7961 }) as Record<string, unknown>;
    inherited.id = 271_465;
    expect(readEnchantState(inherited, "permanentEnchant")).toEqual(KNOWN_NONE);
    // A present key whose value is undefined is present-but-malformed, not omitted.
    expect(readEnchantState({ id: 1, permanentEnchant: undefined }, "permanentEnchant")).toEqual({
      state: "UNKNOWN",
      reason: "MALFORMED_VALUE",
    });
  });

  it("does not establish sockets: the normalized shape carries no socket field at all", () => {
    const piece = normalizeGear([{ id: 271_465 }]).pieces[0];
    expect(piece).toBeDefined();
    expect(Object.keys(piece ?? {})).not.toContain("sockets");
    expect(Object.keys(piece ?? {})).not.toContain("socketCount");
    expect(piece?.gems).toEqual(KNOWN_NONE);
  });
});

describe("present values keep their identities, and the unreadable stay UNKNOWN", () => {
  it("reads a valid identity as KNOWN", () => {
    expect(readEnchantState({ permanentEnchant: 7961 }, "permanentEnchant")).toEqual({
      state: "KNOWN",
      enchantId: 7961,
    });
    expect(readGemsState({ gems: [{ id: 240_890 }, 240_983] })).toEqual({
      state: "KNOWN",
      gemIds: [240_890, 240_983],
    });
  });

  it("gems: [] is an OBSERVED empty list — known, with no installed gems", () => {
    expect(readGemsState({ gems: [] })).toEqual({ state: "KNOWN", gemIds: [] });
    expect(installedGemIds({ state: "KNOWN", gemIds: [] })).toEqual([]);
  });

  it("null is UNKNOWN(NULL_VALUE), zero is UNKNOWN(ZERO_VALUE), anything else is UNKNOWN(MALFORMED_VALUE)", () => {
    expect(readEnchantState({ permanentEnchant: null }, "permanentEnchant")).toEqual({
      state: "UNKNOWN",
      reason: "NULL_VALUE",
    });
    expect(readEnchantState({ permanentEnchant: 0 }, "permanentEnchant")).toEqual({
      state: "UNKNOWN",
      reason: "ZERO_VALUE",
    });
    for (const value of ["7961", -1, 1.5, {}, [], true]) {
      expect(
        readEnchantState({ permanentEnchant: value }, "permanentEnchant"),
        JSON.stringify(value),
      ).toEqual({
        state: "UNKNOWN",
        reason: "MALFORMED_VALUE",
      });
    }
    expect(readGemsState({ gems: null })).toEqual({ state: "UNKNOWN", reason: "NULL_VALUE" });
    expect(readGemsState({ gems: "240890" })).toEqual({ state: "UNKNOWN", reason: "MALFORMED_VALUE" });
    // One unreadable gem entry makes the whole field UNKNOWN: a gem that cannot be read is not absent.
    expect(readGemsState({ gems: [{ id: 240_890 }, { icon: "x" }] })).toEqual({
      state: "UNKNOWN",
      reason: "MALFORMED_VALUE",
    });
    expect(readGemsState({ gems: [0] })).toEqual({ state: "UNKNOWN", reason: "MALFORMED_VALUE" });
    expect(installedGemIds({ state: "UNKNOWN", reason: "NULL_VALUE" })).toBeNull();
  });

  it("a gear row that is not a readable row is ABSENT from the pieces and named in malformedGearRows", () => {
    const gear = normalizeGear([{ id: 271_465 }, "not a row", { itemLevel: 300 }, { id: 273_781 }]);
    expect(gear.pieces.map((piece) => [piece.slotIndex, piece.itemId])).toEqual([
      [0, 271_465],
      [3, 273_781],
    ]);
    expect(gear.malformedRows).toEqual([1, 2]);
    // An absent collection is no rows and no malformed rows: the family decoder refuses it upstream.
    expect(normalizeGear(undefined)).toEqual({ pieces: [], malformedRows: [] });
  });

  it("the empty-slot placeholder keeps its own contract and reads its optional keys like any row", () => {
    const placeholder = normalizeGear([{ id: 0, quality: 1, icon: "inv_axe_02.jpg", itemLevel: 0 }])
      .pieces[0];
    if (placeholder === undefined) throw new Error("placeholder");
    expect(isEmptyGearSlot(placeholder)).toBe(true);
    expect(placeholder.permanentEnchant).toEqual(KNOWN_NONE);
  });
});

describe("every consumer reads the normalized state", () => {
  it("no module under src/ outside the adapter reads the raw permanentEnchant, temporaryEnchant or gems keys", () => {
    const files = readdirSync("src", { recursive: true, withFileTypes: false })
      .map((entry) => `src/${String(entry).replace(/\\/g, "/")}`)
      .filter((path) => path.endsWith(".ts") && statSync(path).isFile());
    // The raw-read idioms: indexing a record by the key, `key in raw`, or an own-property check.
    const rawRead =
      /(\[\s*["'](permanentEnchant|temporaryEnchant|gems)["']\s*\]|["'](permanentEnchant|temporaryEnchant|gems)["']\s+in\b|hasOwnProperty\.call\([^)]*["'](permanentEnchant|temporaryEnchant|gems)["'])/;
    let adapterReads = 0;
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      if (file === "src/engine/normalization/combatant-info.ts") {
        adapterReads += (text.match(new RegExp(rawRead.source, "g")) ?? []).length;
        continue;
      }
      expect(text, file).not.toMatch(rawRead);
    }
    expect(adapterReads).toBeGreaterThan(0);
  });

  it("the committed Protection subject normalises to 38 KNOWN_NONE identities and nothing UNKNOWN", () => {
    const state = corpusState("wcl-protection-paladin-a7r6-opener");
    for (const position of state.positionsOfKind("COMBATANT_INFO")) {
      const event = state.eventAt(position);
      if (event?.kind !== "COMBATANT_INFO" || event.snapshot.actorId !== 7) continue;
      const worn = event.snapshot.gear.filter((piece) => !isEmptyGearSlot(piece));
      const tally = (state: string) =>
        worn.reduce(
          (n, piece) =>
            n +
            [piece.permanentEnchant.state, piece.temporaryEnchant.state, piece.gems.state].filter(
              (s) => s === state,
            ).length,
          0,
        );
      expect(tally("KNOWN_NONE")).toBe(38);
      expect(tally("UNKNOWN")).toBe(0);
      expect(tally("KNOWN")).toBe(17 * 3 - 38);
      expect(event.snapshot.malformedGearRows).toEqual([]);
    }
  });
});
