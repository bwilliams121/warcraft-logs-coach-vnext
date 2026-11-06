/**
 * How much of a rotational decision this build actually resolved (M5-D2).
 *
 * WHAT THIS IS FOR
 *
 * `RotationalGcdResult` answers ONE decision. This module answers "how did that
 * decision land, and if it did not land exactly, what stopped it" in a shape
 * that can be COUNTED across many decisions. M5-E owes the player a coverage
 * disclosure, and a disclosure needs a vocabulary that is fixed in advance
 * rather than derived from whatever the run happened to produce.
 *
 * THE FOUR OUTCOMES ARE NOT A QUALITY SCALE
 *
 * `EXACT_ENTRY` is a stronger CLAIM than `UNKNOWN`, not a better one. An UNKNOWN
 * that correctly refuses to guess is the analyzer working. Counting them apart
 * exists so a report can say which kind of answer it is giving, never so a
 * pipeline can maximise the exact ones.
 *
 * WHY THE BLOCKER IS CLASSIFIED RATHER THAN JUST COUNTED
 *
 * The raw blocker names say WHERE the engine stopped. They do not say whether a
 * reader should expect the gap ever to close. `PREDICTIVE_STATE` is permanent by
 * construction: no implementation removes it, because the information is not in
 * a combat log. `TARGET_COUNT` stopped being permanent at ONB-S3: a count resolves
 * as far as positive evidence proves it, and what evidence cannot prove stays
 * here. Reporting either in the same bucket as `OBSERVED_STATE_MISSING`, an
 * ordinary evidence gap, would misstate what a wider capture could close.
 *
 * NOTHING HERE EVALUATES PLAY. A decision's coverage says what the analyzer
 * could determine. It says nothing about whether the player was right.
 *
 * SHARED SINCE M10-C. This classifier reads the generic engine's result and a
 * table of generic SimulationCraft atoms; it never named a Rogue concept, so
 * it moved from the Assassination tree to shared SimC code when a second
 * specialization needed the identical classification. The Assassination
 * module re-exports it unchanged.
 */

import { deriveConditionRaw } from "./apl-authority.js";
import type { RotationalGcdResult } from "./first-gcd-selection.js";
import type { TraversalStep } from "./nested-selection.js";

/** How completely one rotational decision resolved. */
export type DecisionCoverage =
  /** One authority ENTRY was proven. Its list, ordinal and line may be quoted. */
  | "EXACT_ENTRY"
  /** One ACTION was proven, from an unresolved set of entries. */
  | "TOKEN_CONVERGED"
  /** Every world proves the foreground scan selects nothing at all. */
  | "NO_ACTION"
  /** The authority applies, but the evidence could not decide it. */
  | "UNKNOWN";

export const DECISION_COVERAGES = ["EXACT_ENTRY", "TOKEN_CONVERGED", "NO_ACTION", "UNKNOWN"] as const;

/**
 * Why a decision stayed UNKNOWN, in terms a reader can act on.
 *
 * Ordered from "an implementation could close this" to "nothing can".
 */
export type DecisionBlockerClass =
  /**
   * A supported atom whose value this evidence did not establish — an
   * unobserved resource, a DoT with no derivable anchor, a buff nobody bound.
   * An ordinary evidence gap. A wider capture or a new binding may close it.
   */
  | "OBSERVED_STATE_MISSING"
  /**
   * An action was usable and its condition was readable, but two supported
   * worlds select DIFFERENT first GCDs. The uncertainty is real, not missing.
   */
  | "DIVERGENT_WORLDS"
  /**
   * The line reads a target COUNT, and the evidence did not settle it (ONB-S3).
   * Not permanent: `active_enemies` binds as far as positive evidence proves it
   * (`src/engine/game-state/enemies/enemy-set.ts`), and every count consistent
   * with the evidence must agree before a condition resolves. Events alone prove
   * no upper bound, so a question only an upper bound answers stays here.
   */
  | "TARGET_COUNT"
  /**
   * The condition needs to know the future — `fight_remains`,
   * `target.time_to_die`. Permanently refused: using the real outcome would
   * blame a player for information they did not have.
   */
  | "PREDICTIVE_STATE"
  /**
   * The entry addresses targets this project does not enumerate
   * (`cycle_targets`, `target_if`). Widening the parser would not help.
   */
  | "TARGETING_NOT_MODELLED"
  /**
   * The action was not proven usable, and this build has exactly one positive
   * usability proof: the observed execution. At a position where the action was
   * not cast, there is nothing to prove it with.
   *
   * THE EPISTEMIC BOUNDARY OF M5. See `agent/architecture.md`.
   */
  | "USABILITY_NOT_PROVEN"
  /** Some other refusal. Kept so the classifier can never silently absorb one. */
  | "OTHER";

export const DECISION_BLOCKER_CLASSES = [
  "OBSERVED_STATE_MISSING",
  "DIVERGENT_WORLDS",
  "TARGET_COUNT",
  "PREDICTIVE_STATE",
  "TARGETING_NOT_MODELLED",
  "USABILITY_NOT_PROVEN",
  "OTHER",
] as const;

export interface DecisionCoverageResult {
  readonly coverage: DecisionCoverage;
  /** The action, when one was established. `null` for UNKNOWN and NO_ACTION. */
  readonly actionToken: string | null;
  /** The entry, only ever set for `EXACT_ENTRY`. */
  readonly entry: { readonly listName: string; readonly priorityOrdinal: number } | null;
  /** `null` unless `coverage` is UNKNOWN. */
  readonly blockerClass: DecisionBlockerClass | null;
  /** The engine's own blocker name, preserved verbatim for evidence. */
  readonly rawBlocker: string | null;
  /** Where the engine stopped, when it recorded a step. */
  readonly blockedAt: {
    readonly listName: string;
    readonly priorityOrdinal: number;
    readonly actionToken: string;
  } | null;
}

/**
 * Classifies ONE decision result.
 *
 * Deliberately total and deliberately dumb: it reads the result the engine
 * produced and never re-derives anything. A classifier that could reach a
 * different conclusion from the engine would be a second analyzer.
 */
export function classifyDecision(result: RotationalGcdResult): DecisionCoverageResult {
  if (result.kind === "ROTATIONAL_GCD_SELECTED") {
    return {
      coverage: "EXACT_ENTRY",
      actionToken: result.actionToken,
      entry: {
        listName: result.selectingStep.listName,
        priorityOrdinal: result.selectingStep.priorityOrdinal,
      },
      blockerClass: null,
      rawBlocker: null,
      blockedAt: null,
    };
  }
  if (result.kind === "ROTATIONAL_GCD_TOKEN_CONVERGED") {
    return {
      coverage: "TOKEN_CONVERGED",
      actionToken: result.actionToken,
      entry: null,
      blockerClass: null,
      rawBlocker: null,
      blockedAt: null,
    };
  }
  if (result.kind === "NO_ROTATIONAL_GCD_SELECTED") {
    return {
      coverage: "NO_ACTION",
      actionToken: null,
      entry: null,
      blockerClass: null,
      rawBlocker: null,
      blockedAt: null,
    };
  }

  const step = result.blockedAt;
  return {
    coverage: "UNKNOWN",
    actionToken: null,
    entry: null,
    blockerClass: classifyBlocker(result.blocker, result.scanBlocker, classificationTextOf(step)),
    rawBlocker: result.scanBlocker === null ? result.blocker : `${result.blocker}/${result.scanBlocker}`,
    blockedAt:
      step === null
        ? null
        : { listName: step.listName, priorityOrdinal: step.priorityOrdinal, actionToken: step.actionToken },
  };
}

/**
 * The authority text a blocked step is classified by: its verbatim line, or —
 * when the step's `target_if` was proven ignorable (M11-D3-B1) — only its
 * condition. Target selection was then shown not to matter, so the line's
 * `target_if` text names nothing that is actually missing, and classifying by
 * it would attribute an undecided talent or buff to target selection.
 */
function classificationTextOf(step: TraversalStep | null): string | null {
  if (step === null) return null;
  if (step.targetingRefusal?.kind !== "TARGET_SELECTION_IGNORABLE") return step.actionStringVerbatim;
  return deriveConditionRaw(step.actionStringVerbatim);
}

/**
 * Atoms that name why a blocked line stayed open, keyed to the reason a reader needs.
 *
 * Matched against the blocking entry's VERBATIM authority line. That is
 * deliberate: the line is the authority's own text, so a pinned APL that stops
 * using one of these atoms stops producing the classification, rather than the
 * classification persisting as a stale opinion about a line that changed.
 */
const BLOCKING_ATOM_MARKERS: readonly { readonly marker: string; readonly reason: DecisionBlockerClass }[] = [
  { marker: "spell_targets", reason: "TARGET_COUNT" },
  { marker: "variable.single_target", reason: "TARGET_COUNT" },
  { marker: "active_enemies", reason: "TARGET_COUNT" },
  { marker: "fight_remains", reason: "PREDICTIVE_STATE" },
  { marker: "time_to_die", reason: "PREDICTIVE_STATE" },
  { marker: "cycle_targets", reason: "TARGETING_NOT_MODELLED" },
  { marker: "target_if", reason: "TARGETING_NOT_MODELLED" },
];

function classifyBlocker(
  blocker: string,
  scanBlocker: string | null,
  blockingLine: string | null,
): DecisionBlockerClass {
  if (blocker === "DIVERGENT_GCD_OUTCOMES") return "DIVERGENT_WORLDS";
  // The evidence does not say when the decision was made (ONB-S4).
  if (blocker === "DECISION_ANCHOR_NOT_ESTABLISHED") return "OBSERVED_STATE_MISSING";
  if (blocker === "UNREAD_CONDITION_ON_GCD_ACTION" || scanBlocker === "UNSUPPORTED_ACTION_OPTION") {
    return lineClass(blockingLine) ?? "TARGETING_NOT_MODELLED";
  }
  if (scanBlocker === "UNSUPPORTED_AUTHORITY_EXPRESSION") return lineClass(blockingLine) ?? "OTHER";
  if (scanBlocker === "UNDECIDED_RUN_GATE" || scanBlocker === "UNDECIDED_CALL_GATE_OVER_RUN") {
    // The run entry's gate parsed and could not be decided (M11-B1); since
    // M11-D3-A its worlds were also explored and did not converge. Either way
    // the stop is the GATE, so it is read like an undecided player-action
    // condition: a marked atom on the line names the reason, otherwise it
    // is state the evidence did not establish. Never DIVERGENT_WORLDS.
    return lineClass(blockingLine) ?? "OBSERVED_STATE_MISSING";
  }
  if (scanBlocker === "NO_DEFINITE_WINNER" || scanBlocker === "COMPETING_POSSIBLE_ACTION") {
    // The scan found candidates it could neither select nor eliminate. Whether
    // that is an evidence gap or the usability boundary is not decidable from
    // the blocker alone, so the caller-visible answer stays the honest superset.
    return "OBSERVED_STATE_MISSING";
  }
  return "OTHER";
}

function lineClass(line: string | null): DecisionBlockerClass | null {
  if (line === null) return null;
  for (const entry of BLOCKING_ATOM_MARKERS) {
    if (line.includes(entry.marker)) return entry.reason;
  }
  return null;
}

/** A counted split over many decisions, for a coverage disclosure. */
export interface DecisionCoverageCensus {
  readonly total: number;
  readonly byCoverage: Readonly<Record<DecisionCoverage, number>>;
  readonly byBlockerClass: Readonly<Record<DecisionBlockerClass, number>>;
}

export function censusOf(results: readonly DecisionCoverageResult[]): DecisionCoverageCensus {
  const byCoverage = Object.fromEntries(DECISION_COVERAGES.map((k) => [k, 0])) as Record<
    DecisionCoverage,
    number
  >;
  const byBlockerClass = Object.fromEntries(DECISION_BLOCKER_CLASSES.map((k) => [k, 0])) as Record<
    DecisionBlockerClass,
    number
  >;
  for (const r of results) {
    byCoverage[r.coverage] += 1;
    if (r.blockerClass !== null) byBlockerClass[r.blockerClass] += 1;
  }
  return { total: results.length, byCoverage, byBlockerClass };
}
