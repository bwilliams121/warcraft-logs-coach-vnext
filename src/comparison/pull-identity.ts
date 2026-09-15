/**
 * What identifies one pull, and what merely describes it.
 *
 * THE SMALLEST TRUSTWORTHY IDENTITY
 *
 * Five fields, and every omission is deliberate:
 *
 * - NO FIGHT NAME. `ReportFight.name` is display metadata. Two reports can spell
 *   one boss differently and one report can spell two bosses the same; M8-A
 *   settled that stable ids exist, so names are never matched on.
 *
 * - NO RAID SIZE. M8-A measured our pull at size 24 and three top pulls of the
 *   SAME encounter and difficulty at 25, 27 and 30. Warcraft Logs itself refuses
 *   to filter rankings by size on a flexible zone, answering
 *   `"You cannot specify a size for a flexibly-sized raid zone."` Size is
 *   context. Treating it as identity would reject every real comparison.
 *
 * - NO KILL FLAG. Whether a pull ended in a kill is the progression question M8
 *   exists to answer. Folding it into identity would make wipe-versus-kill
 *   incomparable by definition and delete the milestone.
 *
 * - NO PLAYER. Pull identity is about the fight. Who was in it, and whose
 *   analysis is being compared, is a separate question with a separate answer —
 *   see `analysis-comparability.ts`.
 *
 * NULL IS MODELLED, NOT INVENTED
 *
 * `encounterId` and `difficulty` are nullable because Warcraft Logs genuinely
 * supplies neither in every case. `null` means "we hold no value", and it is
 * never a sentinel, never a default and never a quiet zero. Zero is a separate,
 * REAL value here — it identifies trash — and the two must not collapse, which
 * is why nothing in this module performs a truthiness test on an id.
 */

import type { DimensionCompatibility } from "./dimension.js";
import type { PullVersionEvidence } from "./version-evidence.js";

/**
 * `ReportFight.encounterID === 0` identifies trash rather than an encounter.
 *
 * Named because a bare `0` in a comparison would read as "falsy id" and invite
 * exactly the truthiness check this project forbids.
 */
export const TRASH_ENCOUNTER_ID = 0;

/**
 * One pull, as something another pull can be compared against.
 *
 * `reportCode` + `reportRevision` are carried together on purpose. They are the
 * provenance pair that lets `assessVersionCompatibility` recognise one export,
 * and a revision without its code identifies nothing.
 */
export interface PullIdentity {
  readonly reportCode: string;
  readonly reportRevision: number;
  readonly fightId: number;
  /** `0` is trash. `null` is "Warcraft Logs supplied none". Never merged. */
  readonly encounterId: number | null;
  /** `null` when Warcraft Logs supplied none. Never defaulted. */
  readonly difficulty: number | null;
  readonly version: PullVersionEvidence;
}

/**
 * How a pull ended.
 *
 * `UNRESOLVED` is `ReportFight.kill === null` preserved rather than guessed. A
 * pull whose outcome we do not hold is not a wipe.
 *
 * NONE OF THESE IS A JUDGEMENT. A wipe is a fact about an encounter, not a
 * verdict about the people in it, and nothing downstream may rank one above
 * another.
 */
export type PullOutcome = "KILL" | "WIPE" | "UNRESOLVED";

export const PULL_OUTCOMES = ["KILL", "WIPE", "UNRESOLVED"] as const satisfies readonly PullOutcome[];

export function pullOutcomeOf(kill: boolean | null): PullOutcome {
  if (kill === null) {
    return "UNRESOLVED";
  }
  return kill ? "KILL" : "WIPE";
}

/**
 * Identity plus the soft facts a comparison may disclose.
 *
 * Everything below `identity` is contextual: it can produce a caveat and it can
 * never produce an incompatibility. See `caveats.ts` for why the two are kept
 * apart at the type level rather than by convention.
 *
 * DELIBERATELY ABSENT, AND NOT BY OVERSIGHT: item level, raid composition,
 * talents, gear and phase reached. M8-A identified all of them as useful soft
 * dimensions, and none of them is carried by any type this domain can be handed
 * today — `averageItemLevel` and the `lastPhase` family are typed Warcraft Logs
 * fields the ingestion query does not yet request, which is M8-C's work. A field
 * added here now would be a placeholder nothing could fill, and a caveat that
 * fires on every comparison because its input is permanently absent is noise
 * rather than disclosure.
 */
export interface PullContext {
  readonly identity: PullIdentity;
  readonly outcome: PullOutcome;
  /** `null` when not held. Never zero-filled. */
  readonly durationMs: number | null;
  /** `null` when Warcraft Logs supplied none. Context only, never identity. */
  readonly raidSize: number | null;
}

// ---------------------------------------------------------------------------
// Encounter
// ---------------------------------------------------------------------------

export type EncounterCompatibilityReason =
  /** Both ids held, both non-trash, equal. */
  | "ENCOUNTER_IDS_EQUAL"
  /** Both ids held, both non-trash, unequal. Positive evidence. */
  | "ENCOUNTER_IDS_DIFFER"
  /** At least one id was not supplied. Absence, never a difference. */
  | "ENCOUNTER_UNRESOLVED"
  /** At least one id is `0`, which is trash and identifies no encounter. */
  | "NOT_AN_ENCOUNTER";

export const ENCOUNTER_COMPATIBILITY_REASONS = [
  "ENCOUNTER_IDS_EQUAL",
  "ENCOUNTER_IDS_DIFFER",
  "ENCOUNTER_UNRESOLVED",
  "NOT_AN_ENCOUNTER",
] as const satisfies readonly EncounterCompatibilityReason[];

export interface EncounterCompatibilityAssessment {
  readonly compatibility: DimensionCompatibility;
  readonly reason: EncounterCompatibilityReason;
}

/**
 * Whether two pulls are provably the same encounter.
 *
 * THE ORDER OF THE CHECKS IS THE CONTRACT. Unresolved is tested before
 * inequality, so a missing id can never emerge as INCOMPATIBLE.
 *
 * TRASH IS UNKNOWN, NOT INCOMPATIBLE, AND NOT COMPATIBLE. `0` is one value
 * shared by every trash segment in every report, so `0 === 0` does not establish
 * that two pulls are the same anything. Returning COMPATIBLE there would let
 * arbitrary trash be compared as though it were one encounter. Returning
 * INCOMPATIBLE would assert a difference we did not observe. Neither is true, so
 * the answer is that no encounter identity exists to compare.
 */
export function assessEncounterCompatibility(
  subject: PullIdentity,
  reference: PullIdentity,
): EncounterCompatibilityAssessment {
  if (subject.encounterId === null || reference.encounterId === null) {
    return { compatibility: "UNKNOWN", reason: "ENCOUNTER_UNRESOLVED" };
  }
  if (subject.encounterId === TRASH_ENCOUNTER_ID || reference.encounterId === TRASH_ENCOUNTER_ID) {
    return { compatibility: "UNKNOWN", reason: "NOT_AN_ENCOUNTER" };
  }
  if (subject.encounterId !== reference.encounterId) {
    return { compatibility: "INCOMPATIBLE", reason: "ENCOUNTER_IDS_DIFFER" };
  }
  return { compatibility: "COMPATIBLE", reason: "ENCOUNTER_IDS_EQUAL" };
}

// ---------------------------------------------------------------------------
// Difficulty
// ---------------------------------------------------------------------------

export type DifficultyCompatibilityReason =
  | "DIFFICULTY_EQUAL"
  | "DIFFICULTY_DIFFERS"
  /** At least one difficulty was not supplied. Absence, never a difference. */
  | "DIFFICULTY_UNRESOLVED";

export const DIFFICULTY_COMPATIBILITY_REASONS = [
  "DIFFICULTY_EQUAL",
  "DIFFICULTY_DIFFERS",
  "DIFFICULTY_UNRESOLVED",
] as const satisfies readonly DifficultyCompatibilityReason[];

export interface DifficultyCompatibilityAssessment {
  readonly compatibility: DimensionCompatibility;
  readonly reason: DifficultyCompatibilityReason;
}

/**
 * Whether two pulls are provably the same difficulty.
 *
 * Unresolved first, for the same reason as above: M7 already records that
 * Warcraft Logs supplies no difficulty for some fights, and "we did not read a
 * difficulty" must never become "these were different difficulties".
 */
export function assessDifficultyCompatibility(
  subject: PullIdentity,
  reference: PullIdentity,
): DifficultyCompatibilityAssessment {
  if (subject.difficulty === null || reference.difficulty === null) {
    return { compatibility: "UNKNOWN", reason: "DIFFICULTY_UNRESOLVED" };
  }
  if (subject.difficulty !== reference.difficulty) {
    return { compatibility: "INCOMPATIBLE", reason: "DIFFICULTY_DIFFERS" };
  }
  return { compatibility: "COMPATIBLE", reason: "DIFFICULTY_EQUAL" };
}
