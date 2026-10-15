/**
 * M11-G3-2: the talent import string, read the way the pinned engine reads it.
 *
 * The subject's committed `talentImportCode` decodes (version 2, spec 250) to
 * exactly the 78 entries Warcraft Logs reports in `combatantinfo.talentTree` —
 * the same entry ids, nodes and ranks, including the three tiers of the
 * TIERED Dance of Midnight node — and to hero sub-tree 31. Every condition the
 * engine rejects is a typed failure, never "no talents".
 */

import { beforeAll, describe, expect, it } from "vitest";

import { pinnedLoadoutTable } from "../../../src/data/game/trait-loadout-tables.js";
import {
  decodeTalentLoadout,
  reconcileLoadout,
  type LoadoutTable,
} from "../../../src/data/game/talent-loadout.js";
import { subjectEvidence, type FightEvidence } from "../../support/character/subject.js";

let table: LoadoutTable;
let subject: FightEvidence;
let code: string;

beforeAll(async () => {
  const loaded = pinnedLoadoutTable(6);
  if (!loaded.ok) throw new Error(loaded.detail);
  table = loaded.table;
  subject = await subjectEvidence();
  if (subject.talentImport.code === null) throw new Error("no import code");
  code = subject.talentImport.code;
});

describe("M11-G3-2 talent loadout decoding", () => {
  it("the pinned class-6 node table is the extracted loadout walk; an absent class is refused", () => {
    expect(pinnedLoadoutTable(2)).toMatchObject({ ok: false });
    expect(table.classId).toBe(6);
    expect(table.nodes).toHaveLength(206);
    expect(table.nodes.reduce((n, node) => n + node.entries.length, 0)).toBe(230);
    const ids = table.nodes.map((node) => node.nodeId);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
  });

  it("L. the subject's import code decodes as Blood and reconciles with every WCL talent fact", () => {
    expect(subject.talentImport.actorId).toBe(15);
    const decoded = decodeTalentLoadout(code, table, 250);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.specId).toBe(250);
    expect(decoded.talents).toHaveLength(78);
    expect(decoded.bitsRead).toBeLessThanOrEqual(code.length * 6);
    expect(reconcileLoadout(decoded.talents, subject.snapshot?.talentTree ?? [])).toEqual({
      state: "RECONCILED",
      entries: 78,
    });
  });

  it("M. the import selects exactly the hero sub-tree WCL resolves (31, San'layn)", () => {
    const decoded = decodeTalentLoadout(code, table, 250);
    expect(decoded.ok && decoded.selectedSubTreeIds).toEqual([31]);
  });

  it("a TIERED node's rank is allocated across its tiers in table order", () => {
    const decoded = decodeTalentLoadout(code, table, 250);
    if (!decoded.ok) throw new Error("decode");
    const dance = decoded.talents.filter((talent) => talent.nodeId === 110353);
    expect(dance.map((talent) => [talent.entryId, talent.rank])).toEqual([
      [136917, 1],
      [136916, 2],
      [136915, 1],
    ]);
  });

  it("every engine rejection is a typed failure", () => {
    expect(decodeTalentLoadout(code, table, 252)).toMatchObject({
      ok: false,
      failure: "WRONG_SPECIALIZATION",
    });
    expect(decodeTalentLoadout(`${code.slice(0, 10)}!${code.slice(11)}`, table, 250)).toMatchObject({
      ok: false,
      failure: "INVALID_CHARACTER",
    });
    expect(decodeTalentLoadout(code.slice(0, 20), table, 250)).toMatchObject({
      ok: false,
      failure: "TOO_SHORT",
    });
    expect(decodeTalentLoadout(`D${code.slice(1)}`, table, 250)).toMatchObject({
      ok: false,
      failure: "UNSUPPORTED_SERIALIZATION_VERSION",
    });
  });

  it("N. a changed talent no longer reconciles with the WCL facts", () => {
    // Flip one selection bit deep in the node walk.
    const index = 60;
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const flipped = alphabet[alphabet.indexOf(code[index] ?? "A") ^ 1] ?? "A";
    const changed = `${code.slice(0, index)}${flipped}${code.slice(index + 1)}`;
    const decoded = decodeTalentLoadout(changed, table, 250);
    const reconciled = decoded.ok
      ? reconcileLoadout(decoded.talents, subject.snapshot?.talentTree ?? [])
      : null;
    expect(decoded.ok === false || reconciled?.state === "DIVERGED").toBe(true);
  });

  it("an observed entry with an unreadable rank is a difference, not a match", () => {
    const decoded = decodeTalentLoadout(code, table, 250);
    if (!decoded.ok) throw new Error("decode");
    const tree = (subject.snapshot?.talentTree ?? []).map((entry, index) =>
      index === 0 ? { ...entry, rank: null } : entry,
    );
    expect(reconcileLoadout(decoded.talents, tree).state).toBe("DIVERGED");
  });
});
