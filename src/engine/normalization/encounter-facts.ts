/**
 * Pull-level outcome metadata, exactly as Warcraft Logs reports it.
 *
 * WHY THIS IS A SEPARATE MODULE AND A SEPARATE FIELD ON THE CORE
 *
 * Everything here is TYPED schema evidence — six `ReportFight` fields and the
 * report's zone — and none of it is gameplay input. The M5 authority comparison
 * reads a `CombatFight`, and nothing below appears on a `CombatFight`. That is
 * deliberate and it is the structural half of the isolation M8-C owes:
 *
 *     NormalizedFightCore.encounterOutcome   context, for later M8 checkpoints
 *     NormalizedFightCore.zone               context, for later M8 checkpoints
 *     CombatFight                            UNCHANGED, and what analysis reads
 *
 * `focusedFightFor` does not copy either field across, so a spec evaluator
 * cannot read a boss percentage even by accident. Putting these inside
 * `core.fight` instead would have handed them to every analyzer for free,
 * because `CombatFight.fight` IS `core.fight` — the same object, by reference.
 *
 * WHAT THIS MODULE REFUSES TO DO
 *
 * Interpret. Not one value below is scaled, rounded, inverted, defaulted or
 * combined with another. `bossPercentage` is carried under a name that says it
 * is raw precisely because the frozen schema does not state its scale, and the
 * one live observation M8-A took actively contradicts the obvious reading —
 * see `EncounterOutcomeFacts`.
 *
 * Deriving anything from these facts — "which phase did this pull reach", "did
 * the group get further" — is M8-D's job, and it is a real decision with real
 * evidence requirements rather than a field rename.
 */

import { isRecord, readNullableNumber, readRecord, readString } from "../../wcl/decode.js";
import { readInteger } from "../../wcl/decode.js";

/**
 * `Report.zone`, the principal zone the report contains fights for.
 *
 * NOT AN IDENTITY KEY. `name` is display metadata: zone names are not stable
 * across locales or patches, and `id` exists for identity. Nothing may match on
 * the name, and nothing may infer a game version or patch from the expansion —
 * `version-evidence.ts` records why raw version fields do not establish
 * compatibility, and an expansion is a weaker signal than the fields that
 * already fail to.
 */
export interface ZoneMetadata {
  readonly id: number;
  readonly name: string;
  /**
   * `Zone.frozen`, verbatim: whether the zone and all its partitions are
   * permanently frozen, so its data can be cached forever.
   *
   * A CACHING FACT, NEVER A QUALITY SIGNAL. It says nothing about the pull, the
   * players, or whether a comparison is sound.
   */
  readonly frozen: boolean;
  /**
   * `Zone.expansion`.
   *
   * Nullable HERE even though the schema declares `Expansion!` on a present
   * zone. M8-A introspected `Zone` and observed a populated expansion on a live
   * report, but never introspected `Expansion` itself, so the nullability of its
   * own fields is unproven. Modelling it as nullable costs nothing and avoids
   * freezing an assumption the evidence does not carry.
   */
  readonly expansion: ExpansionMetadata | null;
}

export interface ExpansionMetadata {
  readonly id: number;
  readonly name: string;
}

/**
 * The six `ReportFight` outcome fields, verbatim.
 *
 * EVERY FIELD IS NULLABLE, AND EVERY `null` MEANS THE SAME THING: Warcraft Logs
 * supplied no usable value. None is a default, none is a zero, and none is an
 * inference. The schema declares all six nullable, so a null here is ordinary
 * rather than exceptional.
 *
 * THE TWO PHASE FIELDS ARE NOT TWO NAMES FOR ONE FACT
 *
 * The frozen schema describes them differently, and M8-A measured them
 * disagreeing on one real kill — `lastPhase: 1` alongside
 * `lastPhaseAsAbsoluteIndex: 4`:
 *
 *     lastPhase                 "counts up from 1 based off the phase type
 *                                (i.e., normal phase vs intermission)"
 *     lastPhaseAsAbsoluteIndex  "always increases from 0, so a fight with three
 *                                real phases and two intermissions would count
 *                                up from 0 to 4"
 *
 * So one counts within a phase TYPE and the other counts every phase boundary.
 * Neither is designated "the phase reached" here, and the observed pair is not
 * something this module claims to reconcile. Both are preserved; M8-D decides
 * what, if anything, can be derived.
 *
 * THE PERCENTAGES ARE RAW, AND THE NAMES SAY SO
 *
 * The schema states what they describe but not their scale:
 *
 *     bossPercentage    "the percentage health of the active boss or bosses at
 *                        the end of a fight"
 *     fightPercentage   "the actual completion percentage of the fight ... used
 *                        to indicate how far into a fight a wipe was"
 *
 * M8-A measured BOTH at `0.04` on a fight whose `kill` was `true`. That single
 * observation is enough to rule out the naive reading of `fightPercentage`: a
 * completed fight scoring `0.04` on a 0-100 "how complete" scale is not
 * credible, so the value is far more likely to describe what REMAINED than what
 * was achieved. Which of those it is, and on which scale, is not established by
 * anything available, so this module stores the number and asserts nothing.
 *
 * The consequence for later work is the important part: a consumer must not
 * assume a LOWER value means less progress, nor that a HIGHER one means more.
 * The direction is unproven, and `0.04` on a kill is the evidence that it is
 * unproven. Multiplying, dividing or comparing these across pulls requires
 * settling the semantics first.
 */
export interface EncounterOutcomeFacts {
  /** `ReportFight.lastPhase`. Counts from 1, within a phase type. */
  readonly lastPhase: number | null;
  /** `ReportFight.lastPhaseAsAbsoluteIndex`. Counts from 0, across all phases. */
  readonly lastPhaseAsAbsoluteIndex: number | null;
  /** `ReportFight.lastPhaseIsIntermission`. Nullable, and never defaulted to false. */
  readonly lastPhaseIsIntermission: boolean | null;
  /** `ReportFight.bossPercentage`, verbatim. Scale and direction UNPROVEN. */
  readonly bossPercentageRaw: number | null;
  /** `ReportFight.fightPercentage`, verbatim. Scale and direction UNPROVEN. */
  readonly fightPercentageRaw: number | null;
  /**
   * `ReportFight.wipeCalledTime`, verbatim.
   *
   * REPORT-RELATIVE MILLISECONDS, which is proven rather than assumed: the
   * schema says "a timestamp with millisecond precision that is relative to the
   * start of the report", in the same words it uses for `startTime` and
   * `endTime` — the two fields this codebase already carries as
   * `startTimeMs`/`endTimeMs` on the same report-relative basis. The name
   * records that basis so nobody has to re-derive it.
   *
   * NORMALIZED SEMANTICS — the only reading this field supports:
   *
   *     number  Warcraft Logs supplied a usable wipeCalledTime, preserved as
   *             report-relative milliseconds.
   *     null    no usable wipe-called timestamp is available.
   *
   * `null` CARRIES NO REASON, AND MUST NOT BE READ AS ONE. Two different
   * upstream situations converge here by design: Warcraft Logs reporting a
   * genuine `null`, and Warcraft Logs reporting something this layer could not
   * use. `normalizeEncounterOutcome` collapses malformed optional context to
   * `null` rather than failing an ingestion whose combat evidence is sound, and
   * that collapse is what makes the reason unrecoverable downstream.
   *
   * THE UPSTREAM SCHEMA FACT, KEPT SEPARATE ON PURPOSE. When Warcraft Logs
   * itself supplies a genuine `null`, its schema semantics indicate that no wipe
   * was explicitly called through the Companion app — the field is documented as
   * present only "if a wipe was explicitly called using the Companion app". That
   * is a true statement about the RAW field. It is not a true statement about
   * this normalized one, because by the time a consumer reads this value the two
   * cases are no longer distinguishable.
   *
   * So every consumer must treat `null` as unavailable / UNKNOWN. In particular,
   * `null` is not evidence that the pull was a kill, and it is not evidence that
   * no wipe was called; `kill` is the field that answers the first question, and
   * nothing at this layer answers the second.
   */
  readonly wipeCalledReportTimeMs: number | null;
}

/**
 * Reads a nullable number, treating an absent or malformed field as "no value".
 *
 * THREE UPSTREAM SITUATIONS CONVERGE ON `null` HERE, DELIBERATELY:
 *
 *     Warcraft Logs reported an explicit null
 *     the field was absent from the payload
 *     the value was present and unusable
 *
 * The collapse is safe HERE and would not be everywhere. Elsewhere in this
 * codebase the difference between "asked and got null" and "never asked"
 * genuinely matters, and is carried in completeness rather than in a value —
 * see `TalentImportObservation`. These six fields are selected unconditionally
 * by the one context query, so "absent" is an upstream anomaly rather than a
 * statement about what we requested, and all three cases mean the same thing to
 * every consumer: we hold no usable value, so treat it as unavailable.
 *
 * THE PRICE, STATED RATHER THAN HIDDEN. The upstream REASON is not recoverable
 * after this point. That is why no field on `EncounterOutcomeFacts` may be
 * documented as meaning a particular upstream condition when it is `null` — a
 * schema fact about the raw field is not a fact about the normalized one. See
 * `wipeCalledReportTimeMs`, where the distinction is most tempting to lose.
 *
 * M8-C accepts that price rather than introducing a tagged unavailable-reason
 * type, because every later consumer must treat all three cases identically as
 * unavailable / UNKNOWN. A checkpoint that finds a real use for the distinction
 * can add the richer type then, with a consumer to justify its shape.
 */
function outcomeNumber(source: Record<string, unknown>, key: string): number | null {
  return readNullableNumber(source, key) ?? null;
}

function outcomeInteger(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    return null;
  }
  return value;
}

function outcomeBoolean(source: Record<string, unknown>, key: string): boolean | null {
  const value = source[key];
  return typeof value === "boolean" ? value : null;
}

/**
 * The outcome facts for one raw `ReportFight`.
 *
 * Total: every field resolves to a value or to `null`, so there is no failure
 * mode here and no reason for one. These are context; a malformed
 * `bossPercentage` must never fail an ingestion that is otherwise sound.
 */
export function normalizeEncounterOutcome(rawFight: Record<string, unknown>): EncounterOutcomeFacts {
  return {
    // Integers by schema. Read with an explicit integer test rather than the
    // float reader, so a fractional phase index is recorded as "no usable value"
    // instead of being silently truncated into a phase that was never reported.
    lastPhase: outcomeInteger(rawFight, "lastPhase"),
    lastPhaseAsAbsoluteIndex: outcomeInteger(rawFight, "lastPhaseAsAbsoluteIndex"),
    lastPhaseIsIntermission: outcomeBoolean(rawFight, "lastPhaseIsIntermission"),
    // Floats by schema. `0` and `0.04` are both real values and are preserved as
    // themselves; nothing here tests truthiness.
    bossPercentageRaw: outcomeNumber(rawFight, "bossPercentage"),
    fightPercentageRaw: outcomeNumber(rawFight, "fightPercentage"),
    wipeCalledReportTimeMs: outcomeNumber(rawFight, "wipeCalledTime"),
  };
}

/**
 * `Report.zone`, or `null` when Warcraft Logs supplied none.
 *
 * The schema documents the null case plainly — "null if no supported zone
 * exists" — so an absent zone is an ordinary fact about the report and never a
 * decode failure.
 *
 * A zone with an unreadable `id`, `name` or `frozen` also yields `null`. All
 * three are non-null in the schema, so their absence means the payload is not
 * the zone the schema describes, and a partially invented zone would be worse
 * than none. The expansion is treated more leniently because its own field
 * nullability is unproven.
 */
export function normalizeZone(raw: unknown): ZoneMetadata | null {
  if (!isRecord(raw)) {
    return null;
  }
  const id = readInteger(raw, "id");
  const name = readString(raw, "name");
  const frozen = raw["frozen"];
  if (id === undefined || name === undefined || typeof frozen !== "boolean") {
    return null;
  }
  return { id, name, frozen, expansion: normalizeExpansion(raw) };
}

function normalizeExpansion(rawZone: Record<string, unknown>): ExpansionMetadata | null {
  const raw = readRecord(rawZone, "expansion");
  if (raw === undefined) {
    return null;
  }
  const id = readInteger(raw, "id");
  const name = readString(raw, "name");
  if (id === undefined || name === undefined) {
    return null;
  }
  return { id, name };
}
