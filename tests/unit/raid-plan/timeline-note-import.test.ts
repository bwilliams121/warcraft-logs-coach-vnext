/**
 * M12-E: the semicolon timeline-note importer (src/raid-plan/timeline-note-import.ts).
 *
 * The negative cases matter most. A line carrying a spell id is not by itself
 * a healer cooldown assignment, and nothing the format leaves unsaid is
 * filled in:
 * - `tag:everyone`, a role or a group tag, or several names, is not a player;
 * - a reminder, a text instruction or a header is a diagnostic;
 * - a line without `ph` is not assumed pull-relative;
 * - `countdown` is not a tolerance, and `bossSpell` does not move the time;
 * - a name keeps its diacritics.
 */

import { describe, expect, it } from "vitest";

import { importTimelineNote } from "../../../src/raid-plan/timeline-note-import.js";

const OWNER_EXAMPLE = [
  "time:3;ph:2;tag:Jymblu;spellid:98008;",
  "time:34;ph:2.5;tag:Jymblu;spellid:98008;",
].join("\n");

function planOf(text: string) {
  const result = importTimelineNote({
    text,
    encounterId: 3429,
    difficulty: 5,
    defaultToleranceMs: 3_000,
    label: null,
  });
  if (!result.ok) throw new Error(result.reason);
  return result.plan;
}

describe("the owner's Mythic Coiled Altar example", () => {
  it("imports two phase-relative assignments with string phase labels and the plan's tolerance", () => {
    const plan = planOf(OWNER_EXAMPLE);
    expect(plan).toMatchObject({
      schema: "raid-cooldown-plan/1",
      authority: "USER_PROVIDED_RAID_PLAN",
      encounter: { encounterId: 3429, difficulty: 5 },
      source: { format: "TIMELINE_NOTE", label: null },
      tolerance: { defaultToleranceMs: 3_000 },
      importDiagnostics: [],
    });
    expect(plan.assignments).toEqual([
      {
        assignmentId: "line-1",
        player: { name: "Jymblu", realm: null },
        abilityId: 98008,
        plannedTime: { kind: "PHASE_RELATIVE", phase: "2", offsetMs: 3_000 },
        toleranceMs: 3_000,
        toleranceSource: "PLAN_DEFAULT",
        source: { lineNumber: 1, index: null, rawLine: "time:3;ph:2;tag:Jymblu;spellid:98008;" },
        context: { bossSpellId: null },
      },
      {
        assignmentId: "line-2",
        player: { name: "Jymblu", realm: null },
        abilityId: 98008,
        plannedTime: { kind: "PHASE_RELATIVE", phase: "2.5", offsetMs: 34_000 },
        toleranceMs: 3_000,
        toleranceSource: "PLAN_DEFAULT",
        source: { lineNumber: 2, index: null, rawLine: "time:34;ph:2.5;tag:Jymblu;spellid:98008;" },
        context: { bossSpellId: null },
      },
    ]);
  });

  it("phase stays a string label: 2.5 is never 2.50 or a float", () => {
    const [entry] = planOf("time:1;ph:2.50;tag:Jymblu;spellid:98008;").assignments;
    expect(entry?.plannedTime).toEqual({ kind: "PHASE_RELATIVE", phase: "2.50", offsetMs: 1_000 });
  });
});

describe("a real note holds far more than healer cooldowns, and none of it becomes an assignment", () => {
  const NOTE = [
    "Mythic Coiled Altar - healer CDs", // 1 header
    "", // 2 blank: skipped silently
    "time:3;ph:2;tag:Jymblu;spellid:98008;", // 3 the one assignment
    "time:10;ph:2;tag:everyone;text:Soak orbs;", // 4 everyone, no spell id
    "time:12;ph:2;tag:everyone;spellid:31821;", // 5 everyone WITH a spell id
    "time:14;ph:2;tag:healers;spellid:740;", // 6 a role
    "time:16;ph:2;tag:group2;spellid:740;", // 7 a group
    "time:18;ph:2;tag:Jymblu Otherguy;spellid:740;", // 8 two names
    "time:20;ph:2;text:Interrupt now;countdown:5;", // 9 reminder
    "time:22;tag:Jymblu;spellid:98008;", // 10 no phase
    "ph:2;tag:Jymblu;spellid:98008;", // 11 no time
    "time:24;ph:2;spellid:98008;", // 12 no tag
    "time:abc;ph:2;tag:Jymblu;spellid:98008;", // 13 bad time
    "time:26;ph:2;tag:Jymblu;spellid:98008;spellid:740;", // 14 repeated field
    "time:28;ph:2;tag:Jymb1u;spellid:98008;", // 15 not a name
  ].join("\n");

  it("keeps each unimported line as a diagnostic with its reason and raw text", () => {
    const plan = planOf(NOTE);
    expect(plan.assignments.map((entry) => entry.assignmentId)).toEqual(["line-3"]);
    expect(plan.importDiagnostics.map((entry) => [entry.lineNumber, entry.code])).toEqual([
      [1, "NOT_A_TIMELINE_LINE"],
      [4, "NO_SPELL_ID"],
      [5, "TAG_NOT_A_PLAYER"],
      [6, "TAG_NOT_A_PLAYER"],
      [7, "TAG_NOT_A_PLAYER"],
      [8, "TAG_NOT_A_SINGLE_PLAYER"],
      [9, "NO_SPELL_ID"],
      [10, "NO_PHASE"],
      [11, "NO_TIME"],
      [12, "NO_TAG"],
      [13, "MALFORMED_FIELD"],
      [14, "MALFORMED_FIELD"],
      [15, "MALFORMED_FIELD"],
    ]);
    expect(plan.importDiagnostics[0]?.rawLine).toBe("Mythic Coiled Altar - healer CDs");
  });

  it("countdown is not a tolerance, and bossSpell is kept as context without moving the time", () => {
    const [entry] = planOf(
      "time:40.25;ph:3;tag:Jymblu;spellid:98008;countdown:5;bossSpell:1234567;",
    ).assignments;
    expect(entry).toMatchObject({
      plannedTime: { kind: "PHASE_RELATIVE", phase: "3", offsetMs: 40_250 },
      toleranceMs: 3_000,
      toleranceSource: "PLAN_DEFAULT",
      context: { bossSpellId: 1234567 },
    });
  });

  it("a name keeps its diacritics, and a realm is split off at the hyphen", () => {
    const plan = planOf("time:1;ph:1;tag:Jymblú-Area52;spellid:98008;");
    expect(plan.assignments[0]?.player).toEqual({ name: "Jymblú", realm: "Area52" });
  });

  it("a line longer than the bound is a diagnostic, never truncated into an assignment", () => {
    const long = `time:1;ph:1;tag:Jymblu;spellid:98008;text:${"x".repeat(600)};`;
    const plan = planOf(long);
    expect(plan.assignments).toEqual([]);
    expect(plan.importDiagnostics[0]?.code).toBe("LINE_TOO_LONG");
    expect(plan.importDiagnostics[0]?.rawLine.length).toBe(200);
  });

  it("too many assignments refuses the note rather than dropping the rest", () => {
    const text = Array.from({ length: 1_001 }, () => "time:1;ph:1;tag:Jymblu;spellid:98008;").join("\n");
    expect(
      importTimelineNote({ text, encounterId: 3429, difficulty: 5, defaultToleranceMs: 1_000, label: null }),
    ).toEqual({ ok: false, reason: "TOO_MANY_ASSIGNMENTS" });
  });
});
