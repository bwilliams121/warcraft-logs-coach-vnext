/**
 * M12-E: the `raidCooldownPlan` request field (src/services/raid-cooldown-plan-request.ts).
 *
 * An invalid plan rejects the request; it is never dropped to "no plan" and
 * never repaired. Tolerance is never created, a phase is never a number, an
 * unknown key is never ignored.
 */

import { describe, expect, it } from "vitest";

import { parseAnalysisRequest } from "../../src/services/analysis-request.js";
import { parseRaidCooldownPlanField } from "../../src/services/raid-cooldown-plan-request.js";

const STRUCTURED = {
  format: "STRUCTURED",
  encounterId: 3429,
  difficulty: 5,
  label: "Coiled Altar v3",
  defaultToleranceMs: 3_000,
  assignments: [
    {
      player: { name: "Jymblu" },
      abilityId: 98008,
      plannedTime: { kind: "PHASE_RELATIVE", phase: "2.5", offsetMs: 34_000 },
    },
    {
      player: { name: "Jymblu", realm: "Area52" },
      abilityId: 114052,
      plannedTime: { kind: "FIGHT_RELATIVE", offsetMs: 120_000 },
      toleranceMs: 5_000,
      bossSpellId: 1234567,
    },
  ],
};

const NOTE = {
  format: "TIMELINE_NOTE",
  encounterId: 3429,
  difficulty: 5,
  defaultToleranceMs: 3_000,
  text: "time:3;ph:2;tag:Jymblu;spellid:98008;\ntime:10;ph:2;tag:everyone;text:Soak;",
};

const issuesOf = (value: unknown) => {
  const result = parseRaidCooldownPlanField(value);
  if (result.ok) throw new Error("expected a rejection");
  return result.issues.map((issue) => [issue.code, issue.field]);
};

describe("valid plans", () => {
  it("absent or null is no plan", () => {
    expect(parseRaidCooldownPlanField(undefined)).toEqual({ ok: true, plan: null });
    expect(parseRaidCooldownPlanField(null)).toEqual({ ok: true, plan: null });
  });

  it("a structured plan normalizes, with each tolerance's source recorded", () => {
    const result = parseRaidCooldownPlanField(STRUCTURED);
    if (!result.ok || result.plan === null) throw new Error("expected a plan");
    expect(result.plan).toMatchObject({
      authority: "USER_PROVIDED_RAID_PLAN",
      encounter: { encounterId: 3429, difficulty: 5 },
      source: { format: "STRUCTURED", label: "Coiled Altar v3" },
      tolerance: { defaultToleranceMs: 3_000 },
      importDiagnostics: [],
    });
    expect(result.plan.assignments).toEqual([
      {
        assignmentId: "assignments[0]",
        player: { name: "Jymblu", realm: null },
        abilityId: 98008,
        plannedTime: { kind: "PHASE_RELATIVE", phase: "2.5", offsetMs: 34_000 },
        toleranceMs: 3_000,
        toleranceSource: "PLAN_DEFAULT",
        source: { lineNumber: null, index: 0, rawLine: null },
        context: { bossSpellId: null },
      },
      {
        assignmentId: "assignments[1]",
        player: { name: "Jymblu", realm: "Area52" },
        abilityId: 114052,
        plannedTime: { kind: "FIGHT_RELATIVE", offsetMs: 120_000 },
        toleranceMs: 5_000,
        toleranceSource: "ASSIGNMENT",
        source: { lineNumber: null, index: 1, rawLine: null },
        context: { bossSpellId: 1234567 },
      },
    ]);
  });

  it("a note goes through the importer: one assignment, one diagnostic", () => {
    const result = parseRaidCooldownPlanField(NOTE);
    if (!result.ok || result.plan === null) throw new Error("expected a plan");
    expect(result.plan.source).toEqual({ format: "TIMELINE_NOTE", label: null });
    expect(result.plan.assignments.map((entry) => entry.assignmentId)).toEqual(["line-1"]);
    expect(result.plan.importDiagnostics.map((entry) => entry.code)).toEqual(["NO_SPELL_ID"]);
  });

  it("rides beside either request form", () => {
    const byIds = parseAnalysisRequest({
      reportCode: "aBcDeFgH12345678",
      fightId: 8,
      sourceId: 15,
      raidCooldownPlan: NOTE,
    });
    const byUrl = parseAnalysisRequest({
      reportUrl: "https://www.warcraftlogs.com/reports/aBcDeFgH12345678#fight=8&source=15",
      raidCooldownPlan: NOTE,
    });
    if (!byIds.ok || !byUrl.ok) throw new Error("expected valid requests");
    expect(byIds.request.raidCooldownPlan).toEqual(byUrl.request.raidCooldownPlan);
    expect(byIds.request.raidCooldownPlan?.assignments).toHaveLength(1);
  });
});

describe("invalid plans reject the request, never become 'no plan'", () => {
  it("a tolerance is never assumed", () => {
    const { defaultToleranceMs: _omit, ...withoutDefault } = STRUCTURED;
    expect(issuesOf(withoutDefault)).toEqual([
      ["INVALID_REQUEST_SHAPE", "raidCooldownPlan.assignments[0].toleranceMs"],
    ]);
    const { defaultToleranceMs: _note, ...noteWithoutDefault } = NOTE;
    expect(issuesOf(noteWithoutDefault)).toEqual([
      ["INVALID_REQUEST_SHAPE", "raidCooldownPlan.defaultToleranceMs"],
    ]);
  });

  it("a phase must be a string label, never a number", () => {
    const numeric = {
      ...STRUCTURED,
      assignments: [
        { ...STRUCTURED.assignments[0], plannedTime: { kind: "PHASE_RELATIVE", phase: 2.5, offsetMs: 0 } },
      ],
    };
    expect(issuesOf(numeric)).toEqual([
      ["INVALID_REQUEST_SHAPE", "raidCooldownPlan.assignments[0].plannedTime.phase"],
    ]);
  });

  it("an unknown key is rejected, not ignored (a misspelled tolerance is not 'no tolerance')", () => {
    expect(issuesOf({ ...STRUCTURED, tolerance: 2_000 })).toEqual([
      ["INVALID_REQUEST_SHAPE", "raidCooldownPlan.tolerance"],
    ]);
    expect(issuesOf({ ...NOTE, assignments: [] })).toEqual([
      ["INVALID_REQUEST_SHAPE", "raidCooldownPlan.assignments"],
    ]);
  });

  it("names are letters only, ids positive integers, the format explicit, the difficulty a number", () => {
    const bad = {
      ...STRUCTURED,
      difficulty: "MYTHIC",
      assignments: [
        { player: { name: "Jym blu" }, abilityId: 0, plannedTime: { kind: "PULL", offsetMs: 0 } },
      ],
    };
    expect(issuesOf(bad)).toEqual([
      ["INVALID_REQUEST_SHAPE", "raidCooldownPlan.difficulty"],
      ["INVALID_REQUEST_SHAPE", "raidCooldownPlan.assignments[0].player.name"],
      ["INVALID_REQUEST_SHAPE", "raidCooldownPlan.assignments[0].abilityId"],
      ["INVALID_REQUEST_SHAPE", "raidCooldownPlan.assignments[0].plannedTime.kind"],
    ]);
    expect(issuesOf({ ...NOTE, format: "MRT" })).toEqual([
      ["INVALID_REQUEST_SHAPE", "raidCooldownPlan.format"],
    ]);
  });

  it("limits are enforced, not truncated", () => {
    expect(issuesOf({ ...NOTE, text: "x".repeat(100_001) })).toEqual([
      ["REQUEST_LIMIT_EXCEEDED", "raidCooldownPlan.text"],
    ]);
    const many = {
      ...STRUCTURED,
      assignments: Array.from({ length: 1_001 }, () => STRUCTURED.assignments[0]),
    };
    expect(issuesOf(many)).toEqual([["REQUEST_LIMIT_EXCEEDED", "raidCooldownPlan.assignments"]]);
  });

  it("the whole request is rejected, with identifier and plan issues together", () => {
    const result = parseAnalysisRequest({
      reportCode: "aBcDeFgH12345678",
      fightId: -1,
      sourceId: 15,
      raidCooldownPlan: 7,
    });
    if (result.ok) throw new Error("expected a rejection");
    expect(result.issues.map((issue) => issue.field)).toEqual(["fightId", "raidCooldownPlan"]);
    const planOnly = parseAnalysisRequest({
      reportCode: "aBcDeFgH12345678",
      fightId: 8,
      sourceId: 15,
      raidCooldownPlan: {},
    });
    expect(planOnly.ok).toBe(false);
  });
});
