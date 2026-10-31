/**
 * The semicolon timeline-note importer (M12-E): raw raid-note text in, a
 * normalized `RaidCooldownPlan` out.
 *
 * The format is the owner's Mythic Coiled Altar example, one entry per line:
 *
 *     time:3;ph:2;tag:Jymblu;spellid:98008;
 *     time:34;ph:2.5;tag:Jymblu;spellid:98008;
 *
 * The raw text is source evidence. No evaluator ever reads it: they read the
 * plan this returns.
 *
 * WHAT A LINE MUST HAVE TO BECOME AN ASSIGNMENT. `time` (seconds), `ph` (the
 * phase label), exactly one named player in `tag`, and a numeric `spellid`.
 * Everything else is a diagnostic, never an assignment: raid reminders, text
 * and display instructions, `tag:everyone`, a role or group tag, several names
 * in one tag, and lines without a spell id. A line WITH a spell id is still
 * not a healer cooldown assignment by virtue of it: which ids a specialization
 * evaluates is that specialization's reviewed runtime data.
 *
 * WHAT IS NEVER INVENTED.
 * - A line without `ph` is not assumed pull-relative (`NO_PHASE`).
 * - The format states no tolerance. `countdown` is a display timer, not a
 *   tolerance, so the caller's plan-level default is the only tolerance.
 * - `bossSpell:<id>` is kept as context and never replaces the planned time.
 * - A name is kept verbatim apart from Unicode NFC: no case folding here, no
 *   diacritic stripping, no alias.
 */

import {
  MAX_DIAGNOSTIC_LINE_CHARS,
  PLAYER_NAME_PATTERN,
  RAID_COOLDOWN_PLAN_LIMITS,
  RAID_COOLDOWN_PLAN_SCHEMA,
  USER_PROVIDED_RAID_PLAN,
  type PlanImportDiagnostic,
  type PlanImportDiagnosticCode,
  type PlanPlayer,
  type RaidCooldownAssignment,
  type RaidCooldownPlan,
} from "./raid-cooldown-plan.js";

export interface TimelineNoteImportInput {
  readonly text: string;
  readonly encounterId: number;
  readonly difficulty: number;
  /** Required: the format encodes no tolerance. */
  readonly defaultToleranceMs: number;
  readonly label: string | null;
}

export type TimelineNoteImportResult =
  | { readonly ok: true; readonly plan: RaidCooldownPlan }
  | { readonly ok: false; readonly reason: "TOO_MANY_ASSIGNMENTS" };

/**
 * Tags that name a group of players, never one. Compared case-insensitively.
 * A tag outside this list is still only a candidate name: it becomes a player
 * only if it resolves to exactly one roster player (`resolve.ts`).
 */
const NON_PLAYER_TAGS: ReadonlySet<string> = new Set([
  "everyone",
  "all",
  "raid",
  "healer",
  "healers",
  "tank",
  "tanks",
  "dps",
  "melee",
  "ranged",
]);
const GROUP_TAG = /^(group|g)\d+$/i;

const FIELD = /^([A-Za-z][A-Za-z0-9_]*):(.*)$/s;
const SECONDS = /^(\d{1,6})(?:\.(\d{1,3}))?$/;
const POSITIVE_ID = /^[1-9]\d{0,8}$/;
const PHASE_LABEL = /^[^\s;:]+$/;

/** The fields this importer reads. Other keys (text, countdown, glow, ...) are kept only in the raw line. */
const READ_KEYS = ["time", "ph", "tag", "spellid", "bossspell"] as const;
type ReadKey = (typeof READ_KEYS)[number];

type LineOutcome =
  | { readonly kind: "BLANK" }
  | { readonly kind: "DIAGNOSTIC"; readonly code: PlanImportDiagnosticCode }
  | {
      readonly kind: "ASSIGNMENT";
      readonly player: PlanPlayer;
      readonly abilityId: number;
      readonly phase: string;
      readonly offsetMs: number;
      readonly bossSpellId: number | null;
    };

/** Exact integer milliseconds from a decimal seconds string, without floating point. */
function secondsToMs(value: string): number | null {
  const match = SECONDS.exec(value);
  if (match === null) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(3, "0"));
  const ms = whole * 1000 + fraction;
  return ms <= RAID_COOLDOWN_PLAN_LIMITS.maxOffsetMs ? ms : null;
}

function playerOfTag(tag: string): PlanPlayer | PlanImportDiagnosticCode {
  if (/[\s,]/.test(tag)) return "TAG_NOT_A_SINGLE_PLAYER";
  if (NON_PLAYER_TAGS.has(tag.toLowerCase()) || GROUP_TAG.test(tag)) return "TAG_NOT_A_PLAYER";
  // World of Warcraft names hold no hyphen, so the first one separates the realm.
  const hyphen = tag.indexOf("-");
  const name = (hyphen === -1 ? tag : tag.slice(0, hyphen)).normalize("NFC");
  const realm = hyphen === -1 ? null : tag.slice(hyphen + 1).normalize("NFC");
  if (!PLAYER_NAME_PATTERN.test(name) || name.length > RAID_COOLDOWN_PLAN_LIMITS.maxNameChars) {
    return "MALFORMED_FIELD";
  }
  if (realm !== null && (realm.length === 0 || realm.length > RAID_COOLDOWN_PLAN_LIMITS.maxNameChars)) {
    return "MALFORMED_FIELD";
  }
  return { name, realm };
}

function readLine(line: string): LineOutcome {
  if (line.trim().length === 0) return { kind: "BLANK" };
  if (line.length > RAID_COOLDOWN_PLAN_LIMITS.maxNoteLineChars) {
    return { kind: "DIAGNOSTIC", code: "LINE_TOO_LONG" };
  }
  const segments = line
    .split(";")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  const fields = new Map<ReadKey, string>();
  let fieldCount = 0;
  let malformed = false;
  for (const segment of segments) {
    const match = FIELD.exec(segment);
    if (match === null) {
      malformed = true;
      continue;
    }
    fieldCount += 1;
    const key = match[1]!.toLowerCase();
    if (!(READ_KEYS as readonly string[]).includes(key)) continue;
    if (fields.has(key as ReadKey)) malformed = true;
    fields.set(key as ReadKey, match[2]!.trim());
  }
  if (fieldCount === 0) return { kind: "DIAGNOSTIC", code: "NOT_A_TIMELINE_LINE" };
  if (malformed) return { kind: "DIAGNOSTIC", code: "MALFORMED_FIELD" };

  const spellId = fields.get("spellid");
  if (spellId === undefined) return { kind: "DIAGNOSTIC", code: "NO_SPELL_ID" };
  const time = fields.get("time");
  if (time === undefined) return { kind: "DIAGNOSTIC", code: "NO_TIME" };
  const phase = fields.get("ph");
  if (phase === undefined) return { kind: "DIAGNOSTIC", code: "NO_PHASE" };
  const tag = fields.get("tag");
  if (tag === undefined || tag.length === 0) return { kind: "DIAGNOSTIC", code: "NO_TAG" };

  const offsetMs = secondsToMs(time);
  const bossSpell = fields.get("bossspell");
  if (
    !POSITIVE_ID.test(spellId) ||
    offsetMs === null ||
    !PHASE_LABEL.test(phase) ||
    phase.length > RAID_COOLDOWN_PLAN_LIMITS.maxPhaseChars ||
    (bossSpell !== undefined && !POSITIVE_ID.test(bossSpell))
  ) {
    return { kind: "DIAGNOSTIC", code: "MALFORMED_FIELD" };
  }
  const player = playerOfTag(tag);
  if (typeof player === "string") return { kind: "DIAGNOSTIC", code: player };
  return {
    kind: "ASSIGNMENT",
    player,
    abilityId: Number(spellId),
    phase,
    offsetMs,
    bossSpellId: bossSpell === undefined ? null : Number(bossSpell),
  };
}

/** Imports one note. Pure; the caller has already bounded the text's size. */
export function importTimelineNote(input: TimelineNoteImportInput): TimelineNoteImportResult {
  const assignments: RaidCooldownAssignment[] = [];
  const importDiagnostics: PlanImportDiagnostic[] = [];
  const lines = input.text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    const outcome = readLine(line);
    if (outcome.kind === "BLANK") continue;
    if (outcome.kind === "DIAGNOSTIC") {
      importDiagnostics.push({
        lineNumber,
        code: outcome.code,
        rawLine: line.slice(0, MAX_DIAGNOSTIC_LINE_CHARS),
      });
      continue;
    }
    if (assignments.length === RAID_COOLDOWN_PLAN_LIMITS.maxAssignments) {
      return { ok: false, reason: "TOO_MANY_ASSIGNMENTS" };
    }
    assignments.push({
      assignmentId: `line-${String(lineNumber)}`,
      player: outcome.player,
      abilityId: outcome.abilityId,
      plannedTime: { kind: "PHASE_RELATIVE", phase: outcome.phase, offsetMs: outcome.offsetMs },
      toleranceMs: input.defaultToleranceMs,
      toleranceSource: "PLAN_DEFAULT",
      source: { lineNumber, index: null, rawLine: line },
      context: { bossSpellId: outcome.bossSpellId },
    });
  }
  return {
    ok: true,
    plan: {
      schema: RAID_COOLDOWN_PLAN_SCHEMA,
      authority: USER_PROVIDED_RAID_PLAN,
      encounter: { encounterId: input.encounterId, difficulty: input.difficulty },
      source: { format: "TIMELINE_NOTE", label: input.label },
      tolerance: { defaultToleranceMs: input.defaultToleranceMs },
      assignments,
      importDiagnostics,
    },
  };
}
