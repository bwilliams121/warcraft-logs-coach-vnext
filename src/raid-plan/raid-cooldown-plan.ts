/**
 * The normalized raid cooldown plan (M12-E): the ASSIGNMENT authority.
 *
 * Owner decision (2026-10-31, agent/autopilot-queue.md "M12-E"): the
 * authoritative raid cooldown plan is an EXPLICIT USER-PROVIDED INPUT. The
 * analyzer never infers an assignment from Warcraft Logs, other healers,
 * comparison players or observed cooldown timing. Without a plan, ASSIGNMENT
 * is NO_AUTHORITY_AVAILABLE.
 *
 * This is shared, whole-raid input and nothing else:
 *
 * - It holds who was assigned which ability id when, the tolerance the plan
 *   states, and where each assignment came from. It holds no gameplay meaning.
 * - It never decides which abilities are cooldowns. A specialization evaluator
 *   consumes only the assignments for its own player and its own reviewed
 *   cooldown identities (`src/specs/<class>/<spec>/`).
 * - Supplying a plan means "the raid's authoritative plan for judging
 *   execution", never "an optimal plan". Plan quality is a separate concern.
 */

export const RAID_COOLDOWN_PLAN_SCHEMA = "raid-cooldown-plan/1" as const;

/** The authority every assignment verdict cites. */
export const USER_PROVIDED_RAID_PLAN = "USER_PROVIDED_RAID_PLAN" as const;

export type RaidCooldownPlanFormat = "STRUCTURED" | "TIMELINE_NOTE";

/**
 * When the plan wants the ability used.
 *
 * PHASE_RELATIVE: `offsetMs` after the start of the named encounter phase.
 * `phase` is the plan's own label, a STRING ("1", "2", "2.5"), never a float
 * and never assumed to be a Warcraft Logs phase id.
 *
 * FIGHT_RELATIVE: `offsetMs` after the pull. Only an explicitly pull-relative
 * plan entry is this kind; a phase-relative one is never converted to it.
 */
export type PlannedTime =
  | { readonly kind: "PHASE_RELATIVE"; readonly phase: string; readonly offsetMs: number }
  | { readonly kind: "FIGHT_RELATIVE"; readonly offsetMs: number };

/**
 * A character name and an optional realm, verbatim apart from Unicode NFC.
 * Diacritics are kept. Matching is `resolve.ts`'s job, never this type's.
 */
export interface PlanPlayer {
  readonly name: string;
  readonly realm: string | null;
}

/** Where an assignment came from in the supplied input. */
export interface PlanSourceReference {
  /** 1-based line of an imported note; `null` for a structured plan. */
  readonly lineNumber: number | null;
  /** 0-based index in a structured plan's `assignments`; `null` for a note. */
  readonly index: number | null;
  /** The note line verbatim, as source evidence; `null` for a structured plan. */
  readonly rawLine: string | null;
}

export interface RaidCooldownAssignment {
  /** Stable within the plan: `assignments[<index>]` or `line-<lineNumber>`. */
  readonly assignmentId: string;
  readonly player: PlanPlayer;
  /** The numeric spell or ability id. Never a display name. */
  readonly abilityId: number;
  readonly plannedTime: PlannedTime;
  /** Either side of the planned time. Always stated by the plan, never created here. */
  readonly toleranceMs: number;
  readonly toleranceSource: "ASSIGNMENT" | "PLAN_DEFAULT";
  readonly source: PlanSourceReference;
  /**
   * Source context kept verbatim. `bossSpellId` (a note's `bossSpell:<id>`)
   * does NOT replace the planned time: no event-anchor model is reviewed.
   */
  readonly context: { readonly bossSpellId: number | null };
}

/** A note line the importer did not turn into an assignment, kept as source evidence. */
export interface PlanImportDiagnostic {
  readonly lineNumber: number;
  readonly code: PlanImportDiagnosticCode;
  /** Verbatim, truncated to `MAX_DIAGNOSTIC_LINE_CHARS`. */
  readonly rawLine: string;
}

export const PLAN_IMPORT_DIAGNOSTIC_CODES = [
  /** No `key:value` field: free text, a header, an MRT block. */
  "NOT_A_TIMELINE_LINE",
  /** A timeline line with no `spellid`: a reminder, a text or display instruction. */
  "NO_SPELL_ID",
  "NO_TIME",
  /** Time given without `ph`: not assumed to be pull-relative. */
  "NO_PHASE",
  "NO_TAG",
  /** `tag:everyone`, a role or a group: not one named player. */
  "TAG_NOT_A_PLAYER",
  /** Several names in one tag: never split into guessed assignments. */
  "TAG_NOT_A_SINGLE_PLAYER",
  /** A field value that is not what the format allows, or a repeated field. */
  "MALFORMED_FIELD",
  "LINE_TOO_LONG",
] as const;

export type PlanImportDiagnosticCode = (typeof PLAN_IMPORT_DIAGNOSTIC_CODES)[number];

export interface RaidCooldownPlan {
  readonly schema: typeof RAID_COOLDOWN_PLAN_SCHEMA;
  readonly authority: typeof USER_PROVIDED_RAID_PLAN;
  /**
   * What the plan is bound to. `difficulty` is the Warcraft Logs fight
   * difficulty id, compared verbatim: the repository has no reviewed
   * difficulty-name authority, so "MYTHIC" is never mapped to a number here.
   */
  readonly encounter: { readonly encounterId: number; readonly difficulty: number };
  readonly source: { readonly format: RaidCooldownPlanFormat; readonly label: string | null };
  /** The plan-level default the assignments inherit, when one was supplied. */
  readonly tolerance: { readonly defaultToleranceMs: number | null };
  readonly assignments: readonly RaidCooldownAssignment[];
  /** Note lines not imported, with the reason. Empty for a structured plan. */
  readonly importDiagnostics: readonly PlanImportDiagnostic[];
}

/** Input bounds, shared by the request parser and the importer. */
export const RAID_COOLDOWN_PLAN_LIMITS = {
  maxAssignments: 1_000,
  maxNoteChars: 100_000,
  maxNoteLineChars: 500,
  maxLabelChars: 200,
  maxNameChars: 64,
  maxPhaseChars: 16,
  maxToleranceMs: 600_000,
  /** 24 hours. */
  maxOffsetMs: 86_400_000,
} as const;

export const MAX_DIAGNOSTIC_LINE_CHARS = 200;

/**
 * A character name as the plan may state it: letters only (any script),
 * which is what World of Warcraft allows. No digits, spaces or hyphens.
 */
export const PLAYER_NAME_PATTERN = /^\p{L}+$/u;
