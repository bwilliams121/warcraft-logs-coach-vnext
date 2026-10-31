/**
 * The optional `raidCooldownPlan` field of an analysis request (M12-E).
 *
 * REST and MCP both reach this one parser through `parseAnalysisRequest`, so a
 * plan means the same thing whichever transport supplied it. It accepts two
 * forms and produces one normalized `RaidCooldownPlan`:
 *
 *     { format: "STRUCTURED", encounterId, difficulty, label?, defaultToleranceMs?,
 *       assignments: [{ player: { name, realm? }, abilityId,
 *                       plannedTime: { kind: "PHASE_RELATIVE", phase, offsetMs }
 *                                  | { kind: "FIGHT_RELATIVE", offsetMs },
 *                       toleranceMs?, bossSpellId? }] }
 *
 *     { format: "TIMELINE_NOTE", encounterId, difficulty, label?, defaultToleranceMs, text }
 *
 * Every field is checked; unknown keys are rejected rather than ignored, so a
 * misspelled `tolerance` cannot silently become "no tolerance". Tolerance is
 * authority input: every assignment must end up with one, from itself or the
 * plan default, and none is ever created here. `phase` must be a string.
 * `difficulty` is the Warcraft Logs fight difficulty id (no reviewed
 * difficulty-name authority exists to map "MYTHIC").
 */

import {
  PLAYER_NAME_PATTERN,
  RAID_COOLDOWN_PLAN_LIMITS,
  RAID_COOLDOWN_PLAN_SCHEMA,
  USER_PROVIDED_RAID_PLAN,
  type PlannedTime,
  type RaidCooldownAssignment,
  type RaidCooldownPlan,
} from "../raid-plan/raid-cooldown-plan.js";
import { importTimelineNote } from "../raid-plan/timeline-note-import.js";
import type { RequestIssue } from "./result.js";

export const RAID_COOLDOWN_PLAN_FIELD = "raidCooldownPlan";

export type RaidCooldownPlanFieldResult =
  | { readonly ok: true; readonly plan: RaidCooldownPlan | null }
  | { readonly ok: false; readonly issues: readonly RequestIssue[] };

type Fields = Record<string, unknown>;

function isRecord(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class Issues {
  readonly list: RequestIssue[] = [];
  shape(field: string, message: string): void {
    this.list.push({ code: "INVALID_REQUEST_SHAPE", field, message });
  }
  limit(field: string, message: string): void {
    this.list.push({ code: "REQUEST_LIMIT_EXCEEDED", field, message });
  }
}

function unknownKeys(value: Fields, allowed: readonly string[], field: string, issues: Issues): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) issues.shape(`${field}.${key}`, `${field} has no field named ${key}.`);
  }
}

function integerIn(
  value: unknown,
  field: string,
  min: number,
  max: number,
  issues: Issues,
): number | undefined {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    issues.shape(field, `${field} must be an integer from ${String(min)} to ${String(max)}.`);
    return undefined;
  }
  return value;
}

function optionalLabel(value: unknown, field: string, issues: Issues): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length === 0) {
    issues.shape(field, `${field} must be a non-empty string when supplied.`);
    return undefined;
  }
  if (value.length > RAID_COOLDOWN_PLAN_LIMITS.maxLabelChars) {
    issues.limit(
      field,
      `${field} is limited to ${String(RAID_COOLDOWN_PLAN_LIMITS.maxLabelChars)} characters.`,
    );
    return undefined;
  }
  return value;
}

const MAX_ID = 999_999_999;

function parsePlannedTime(value: unknown, field: string, issues: Issues): PlannedTime | undefined {
  if (!isRecord(value)) {
    issues.shape(field, `${field} must be an object with kind PHASE_RELATIVE or FIGHT_RELATIVE.`);
    return undefined;
  }
  const offsetMs = integerIn(
    value["offsetMs"],
    `${field}.offsetMs`,
    0,
    RAID_COOLDOWN_PLAN_LIMITS.maxOffsetMs,
    issues,
  );
  if (value["kind"] === "FIGHT_RELATIVE") {
    unknownKeys(value, ["kind", "offsetMs"], field, issues);
    return offsetMs === undefined ? undefined : { kind: "FIGHT_RELATIVE", offsetMs };
  }
  if (value["kind"] === "PHASE_RELATIVE") {
    unknownKeys(value, ["kind", "phase", "offsetMs"], field, issues);
    const phase = value["phase"];
    // A string, never a number: "2.5" is a label, and 2.5 would invite arithmetic on it.
    if (
      typeof phase !== "string" ||
      !/^[^\s;:]+$/.test(phase) ||
      phase.length > RAID_COOLDOWN_PLAN_LIMITS.maxPhaseChars
    ) {
      issues.shape(
        `${field}.phase`,
        `${field}.phase must be the plan's phase label as a string, for example "2.5".`,
      );
      return undefined;
    }
    return offsetMs === undefined ? undefined : { kind: "PHASE_RELATIVE", phase, offsetMs };
  }
  issues.shape(`${field}.kind`, `${field}.kind must be PHASE_RELATIVE or FIGHT_RELATIVE.`);
  return undefined;
}

function parsePlayer(
  value: unknown,
  field: string,
  issues: Issues,
): RaidCooldownAssignment["player"] | undefined {
  if (!isRecord(value)) {
    issues.shape(field, `${field} must be an object with a name and an optional realm.`);
    return undefined;
  }
  unknownKeys(value, ["name", "realm"], field, issues);
  const name = value["name"];
  const realm = value["realm"];
  let ok = true;
  if (
    typeof name !== "string" ||
    !PLAYER_NAME_PATTERN.test(name.normalize("NFC")) ||
    name.length > RAID_COOLDOWN_PLAN_LIMITS.maxNameChars
  ) {
    issues.shape(`${field}.name`, `${field}.name must be a character name: letters only.`);
    ok = false;
  }
  if (
    realm !== undefined &&
    realm !== null &&
    (typeof realm !== "string" || realm.length === 0 || realm.length > RAID_COOLDOWN_PLAN_LIMITS.maxNameChars)
  ) {
    issues.shape(`${field}.realm`, `${field}.realm must be a non-empty string when supplied.`);
    ok = false;
  }
  if (!ok || typeof name !== "string") return undefined;
  return {
    name: name.normalize("NFC"),
    realm: typeof realm === "string" ? realm.normalize("NFC") : null,
  };
}

function parseStructuredAssignments(
  value: unknown,
  defaultToleranceMs: number | null,
  issues: Issues,
): RaidCooldownAssignment[] | undefined {
  const field = `${RAID_COOLDOWN_PLAN_FIELD}.assignments`;
  if (!Array.isArray(value)) {
    issues.shape(field, `${field} must be an array.`);
    return undefined;
  }
  if (value.length > RAID_COOLDOWN_PLAN_LIMITS.maxAssignments) {
    issues.limit(
      field,
      `${field} is limited to ${String(RAID_COOLDOWN_PLAN_LIMITS.maxAssignments)} entries.`,
    );
    return undefined;
  }
  const assignments: RaidCooldownAssignment[] = [];
  value.forEach((entry: unknown, index) => {
    const at = `${field}[${String(index)}]`;
    if (!isRecord(entry)) {
      issues.shape(at, `${at} must be an object.`);
      return;
    }
    unknownKeys(entry, ["player", "abilityId", "plannedTime", "toleranceMs", "bossSpellId"], at, issues);
    const before = issues.list.length;
    const player = parsePlayer(entry["player"], `${at}.player`, issues);
    const abilityId = integerIn(entry["abilityId"], `${at}.abilityId`, 1, MAX_ID, issues);
    const plannedTime = parsePlannedTime(entry["plannedTime"], `${at}.plannedTime`, issues);
    const ownTolerance =
      entry["toleranceMs"] === undefined
        ? null
        : (integerIn(
            entry["toleranceMs"],
            `${at}.toleranceMs`,
            0,
            RAID_COOLDOWN_PLAN_LIMITS.maxToleranceMs,
            issues,
          ) ?? null);
    const bossSpellId =
      entry["bossSpellId"] === undefined
        ? null
        : (integerIn(entry["bossSpellId"], `${at}.bossSpellId`, 1, MAX_ID, issues) ?? null);
    if (entry["toleranceMs"] === undefined && defaultToleranceMs === null) {
      issues.shape(
        `${at}.toleranceMs`,
        `${at} states no toleranceMs and the plan has no defaultToleranceMs. Tolerance is never assumed.`,
      );
    }
    if (
      issues.list.length > before ||
      player === undefined ||
      abilityId === undefined ||
      plannedTime === undefined
    ) {
      return;
    }
    const toleranceMs = ownTolerance ?? defaultToleranceMs;
    if (toleranceMs === null) return;
    assignments.push({
      assignmentId: `assignments[${String(index)}]`,
      player,
      abilityId,
      plannedTime,
      toleranceMs,
      toleranceSource: ownTolerance === null ? "PLAN_DEFAULT" : "ASSIGNMENT",
      source: { lineNumber: null, index, rawLine: null },
      context: { bossSpellId },
    });
  });
  return assignments;
}

/** Parses `input.raidCooldownPlan`. Absent or `null` is "no plan", which is valid. */
export function parseRaidCooldownPlanField(value: unknown): RaidCooldownPlanFieldResult {
  if (value === undefined || value === null) return { ok: true, plan: null };
  const field = RAID_COOLDOWN_PLAN_FIELD;
  const issues = new Issues();
  if (!isRecord(value)) {
    issues.shape(field, `${field} must be an object.`);
    return { ok: false, issues: issues.list };
  }
  const format = value["format"];
  if (format !== "STRUCTURED" && format !== "TIMELINE_NOTE") {
    issues.shape(`${field}.format`, `${field}.format must be STRUCTURED or TIMELINE_NOTE.`);
    return { ok: false, issues: issues.list };
  }
  const common = ["format", "encounterId", "difficulty", "label", "defaultToleranceMs"];
  unknownKeys(value, [...common, format === "STRUCTURED" ? "assignments" : "text"], field, issues);
  const encounterId = integerIn(value["encounterId"], `${field}.encounterId`, 1, MAX_ID, issues);
  const difficulty = integerIn(value["difficulty"], `${field}.difficulty`, 0, MAX_ID, issues);
  const label = optionalLabel(value["label"], `${field}.label`, issues);
  const rawDefault = value["defaultToleranceMs"];
  const defaultToleranceMs =
    rawDefault === undefined || rawDefault === null
      ? null
      : (integerIn(
          rawDefault,
          `${field}.defaultToleranceMs`,
          0,
          RAID_COOLDOWN_PLAN_LIMITS.maxToleranceMs,
          issues,
        ) ?? null);

  if (format === "TIMELINE_NOTE") {
    if (rawDefault === undefined || rawDefault === null) {
      issues.shape(
        `${field}.defaultToleranceMs`,
        "A timeline note states no tolerance, so defaultToleranceMs is required. countdown is not a tolerance.",
      );
    }
    const text = value["text"];
    if (typeof text !== "string") {
      issues.shape(`${field}.text`, `${field}.text must be the note text.`);
    } else if (text.length > RAID_COOLDOWN_PLAN_LIMITS.maxNoteChars) {
      issues.limit(
        `${field}.text`,
        `${field}.text is limited to ${String(RAID_COOLDOWN_PLAN_LIMITS.maxNoteChars)} characters.`,
      );
    }
    if (
      issues.list.length > 0 ||
      typeof text !== "string" ||
      encounterId === undefined ||
      difficulty === undefined ||
      label === undefined ||
      defaultToleranceMs === null
    ) {
      return { ok: false, issues: issues.list };
    }
    const imported = importTimelineNote({ text, encounterId, difficulty, defaultToleranceMs, label });
    if (!imported.ok) {
      issues.limit(
        `${field}.text`,
        `${field}.text imports more than ${String(RAID_COOLDOWN_PLAN_LIMITS.maxAssignments)} assignments.`,
      );
      return { ok: false, issues: issues.list };
    }
    return { ok: true, plan: imported.plan };
  }

  const assignments = parseStructuredAssignments(value["assignments"], defaultToleranceMs, issues);
  if (
    issues.list.length > 0 ||
    assignments === undefined ||
    encounterId === undefined ||
    difficulty === undefined ||
    label === undefined
  ) {
    return { ok: false, issues: issues.list };
  }
  return {
    ok: true,
    plan: {
      schema: RAID_COOLDOWN_PLAN_SCHEMA,
      authority: USER_PROVIDED_RAID_PLAN,
      encounter: { encounterId, difficulty },
      source: { format: "STRUCTURED", label },
      tolerance: { defaultToleranceMs },
      assignments,
      importDiagnostics: [],
    },
  };
}
