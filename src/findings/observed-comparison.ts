/**
 * Comparing ONE observed rotational decision against the pinned authority.
 *
 * WHAT THIS LAYER IS
 *
 * A composition, not a new analyzer. It reads two results that already exist and
 * says how they relate:
 *
 *     M5-A observed-action judgment    can the authority select THIS cast?
 *     M5-C/D first-GCD selection       what does the authority select here?
 *
 * Neither is modified. `ObservedActionJudgment` in particular keeps its exact
 * M5-A meaning — it has no positive verdict, deliberately, and nothing here adds
 * one to it. `MATCH` is a property of the COMPARISON, produced by this layer,
 * and it is a different claim from anything either input can make alone.
 *
 * WHAT `MATCH` MEANS, EXACTLY
 *
 *     for this observed rotational-GCD decision, the supported authority
 *     analysis resolved the first rotational GCD to the same action token that
 *     was observed
 *
 * WHAT `MATCH` DOES NOT MEAN
 *
 * Not correct. Not optimal. Not best play. Not mistake-free. Not recommended.
 * Not what the player should have pressed. The authority is one model of one
 * simulated encounter; agreeing with it is `authority-compatible` and no more.
 * There is no scoring in this file and no vocabulary for any of those ideas.
 *
 * THE OBSERVED CAST IS OFTEN THE REASON THE ANSWER EXISTS
 *
 * This build's only positive usability proof is the observed execution: an
 * action that demonstrably fired demonstrably was ready, affordable and not
 * movement-blocked. So a MATCH frequently depends on the very cast it is
 * comparing against. That is sound, and it is also a real limit on what the
 * result means — so it is recorded on every comparison as
 * `usabilityProvenance` rather than left for a reader to infer.
 *
 * A COMPARISON IS NOT A PREDICTION. It cannot be re-read as "the authority would
 * have chosen this before it happened". See `agent/architecture.md`.
 *
 * SHARED SINCE M10-C. The comparison reads two spec-neutral inputs — the
 * generic first-GCD result and the shared observed-action judgment — and
 * names no Rogue concept, so it moved here when a second specialization
 * needed the identical rule. It lives under `src/findings` because it reads
 * the shared judgment vocabulary, which the SimC layer must not import. The
 * Assassination module re-exports it unchanged; the `ObservedRotationalDecision` and `ObservedActionComparison`
 * shapes are exactly what they were.
 */

import type { EvidenceLocator } from "../engine/evidence/locator.js";
import type { RotationalGcdResult } from "../simc/first-gcd-selection.js";
import {
  classifyDecision,
  type DecisionBlockerClass,
  type DecisionCoverage,
} from "../simc/decision-coverage.js";
import type { ObservedActionJudgment } from "./judgment.js";

/**
 * The three top-level outcomes. There is no fourth, and none of them is a grade.
 */
export type ComparisonOutcome = "MATCH" | "REJECTED" | "UNKNOWN";

export const COMPARISON_OUTCOMES = [
  "MATCH",
  "REJECTED",
  "UNKNOWN",
] as const satisfies readonly ComparisonOutcome[];

/**
 * Why the comparison reached its outcome.
 *
 * One flat vocabulary rather than three per-outcome ones, so a consumer can log
 * or count the basis without first narrowing the outcome.
 */
export type ComparisonBasis =
  /** MATCH: the authority resolved a token and it equals the observed token. */
  | "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN"
  /** REJECTED: M5-A proved the authority cannot select this observed action. */
  | "OBSERVED_ACTION_REJECTED_BY_AUTHORITY"
  /** REJECTED: the authority resolved a DIFFERENT token. No replacement claimed. */
  | "AUTHORITY_SELECTED_DIFFERENT_TOKEN"
  /** UNKNOWN: the authority selection did not resolve. Blocker is preserved. */
  | "AUTHORITY_SELECTION_UNRESOLVED"
  /**
   * UNKNOWN: the two layers contradict each other.
   *
   * M5-A proved the observed action unselectable while the global analysis
   * resolved to that same token. Both cannot be right. Choosing one would be
   * choosing which of our own proofs to believe, so neither is reported.
   */
  | "INCONSISTENT_AUTHORITY_RESULTS"
  /**
   * UNKNOWN: the authority proved nothing would be selected, yet a rotational
   * GCD was observed.
   *
   * A model/evidence contradiction, and it fails closed. The player's cast is
   * observed reality and Warcraft Logs is authoritative for that, so the model
   * is what is in doubt — this never becomes a claim that the cast was wrong.
   */
  | "AUTHORITY_SELECTED_NO_ACTION_DESPITE_OBSERVED_GCD";

export const COMPARISON_BASES = [
  "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN",
  "OBSERVED_ACTION_REJECTED_BY_AUTHORITY",
  "AUTHORITY_SELECTED_DIFFERENT_TOKEN",
  "AUTHORITY_SELECTION_UNRESOLVED",
  "INCONSISTENT_AUTHORITY_RESULTS",
  "AUTHORITY_SELECTED_NO_ACTION_DESPITE_OBSERVED_GCD",
] as const satisfies readonly ComparisonBasis[];

/**
 * How precisely the authority selection was established.
 *
 * Carried SEPARATELY from the outcome so a token-level agreement can never be
 * read as an entry-level one. A consumer may quote an entry only for
 * `EXACT_ENTRY`.
 */
export type SelectionPrecision = "EXACT_ENTRY" | "TOKEN_CONVERGED";

/** Where the positive usability behind a resolved selection came from. */
export type UsabilityProvenance =
  /**
   * The action was proven usable because it was observed to execute.
   *
   * The ordinary case in M5, and the one that keeps a comparison from being a
   * prediction.
   */
  | "OBSERVED_EXECUTION"
  /** No positive usability was needed or none was established. */
  | "NOT_ESTABLISHED";

/** The observed decision a comparison is about. */
export interface ObservedRotationalDecision {
  /** Canonical index into `CombatFight.events`. Never an ingestion ordinal. */
  readonly position: number;
  readonly locator: EvidenceLocator;
  readonly actorId: number;
  readonly abilityGameId: number;
  /** The SimulationCraft token the observed ability binds to. */
  readonly observedToken: string;
  readonly reportTimeMs: number;
  readonly fightTimeMs: number;
  /** The enemy the decision was about, where the event established one. */
  readonly targetActorId: number | null;
}

export interface ObservedActionComparison {
  readonly decision: ObservedRotationalDecision;
  readonly outcome: ComparisonOutcome;
  readonly basis: ComparisonBasis;
  /** How the authority selection itself landed. Never collapsed into `outcome`. */
  readonly authorityCoverage: DecisionCoverage;
  /** The token the authority resolved, when it resolved one. */
  readonly authorityToken: string | null;
  /** Set only when the authority resolved a token. */
  readonly selectionPrecision: SelectionPrecision | null;
  /** Set only when `outcome` is UNKNOWN and a blocker was recorded. */
  readonly decisiveBlocker: DecisionBlockerClass | null;
  /** The engine's own blocker string, kept verbatim for evidence. */
  readonly rawBlocker: string | null;
  readonly usabilityProvenance: UsabilityProvenance;
  /**
   * Whether M5-A independently proved the observed action unselectable.
   *
   * Recorded on every comparison, including MATCH, because it is what makes the
   * contradiction case detectable at all.
   */
  readonly observedActionRejected: boolean;
}

/**
 * A specialization's OWN proof that the authority cannot select the observed
 * action at this decision (M10-C).
 *
 * The same claim M5-A's `REJECTED_BY_AUTHORITY` judgment makes — every entry
 * that could select the observed token is gated FALSE under the resolved
 * state — for a specialization whose proof does not rest on a single exact
 * resource and therefore cannot honestly fill that judgment's
 * `observedState`. Carried as its own input rather than forged into the
 * judgment shape. Absent or `null` is NOT a positive verdict.
 */
export interface ObservedActionUnselectableProof {
  /** The entries proven unable to select the observed token, in priority order. */
  readonly entriesProvenFalse: readonly { readonly listName: string; readonly priorityOrdinal: number }[];
  /** Author-written detail. Never interpolated from upstream data. */
  readonly detail: string;
}

export interface ComparisonInput {
  readonly decision: ObservedRotationalDecision;
  /** The global first-GCD result at this decision point. */
  readonly authorityResult: RotationalGcdResult;
  /**
   * M5-A's judgment about this observed action, when the M5-A surface covers it.
   *
   * `null` for every action M5-A does not evaluate, which is most of them. Null
   * is NOT a positive verdict and is never read as one.
   */
  readonly observedActionJudgment: ObservedActionJudgment | null;
  /**
   * A specialization-owned unselectability proof (M10-C). OPTIONAL, and every
   * caller that existed before omits it, which leaves its comparison unchanged.
   */
  readonly observedActionUnselectable?: ObservedActionUnselectableProof | null;
  readonly usabilityProvenance: UsabilityProvenance;
}

/**
 * Compares one observed decision against the authority.
 *
 * Total and order-sensitive. The contradiction check runs FIRST, because a
 * contradiction is only visible while both inputs are still in hand — resolve
 * either side first and it disappears into a confident answer.
 */
export function compareObservedAction(input: ComparisonInput): ObservedActionComparison {
  const classified = classifyDecision(input.authorityResult);
  // Either proof that the authority cannot select the observed action counts,
  // and both are checked BEFORE the global selection is allowed to win.
  const rejectedByObservedActionRule =
    input.observedActionJudgment?.status === "REJECTED_BY_AUTHORITY" ||
    (input.observedActionUnselectable !== undefined && input.observedActionUnselectable !== null);

  const resolvedToken =
    classified.coverage === "EXACT_ENTRY" || classified.coverage === "TOKEN_CONVERGED"
      ? classified.actionToken
      : null;
  const precision: SelectionPrecision | null =
    classified.coverage === "EXACT_ENTRY"
      ? "EXACT_ENTRY"
      : classified.coverage === "TOKEN_CONVERGED"
        ? "TOKEN_CONVERGED"
        : null;
  const tokensAgree = resolvedToken !== null && resolvedToken === input.decision.observedToken;

  const base = {
    decision: input.decision,
    authorityCoverage: classified.coverage,
    authorityToken: resolvedToken,
    selectionPrecision: precision,
    rawBlocker: classified.rawBlocker,
    usabilityProvenance: input.usabilityProvenance,
    observedActionRejected: rejectedByObservedActionRule,
  } as const;

  // ---- contradiction, checked before either side is allowed to win ----
  if (rejectedByObservedActionRule && tokensAgree) {
    return {
      ...base,
      outcome: "UNKNOWN",
      basis: "INCONSISTENT_AUTHORITY_RESULTS",
      decisiveBlocker: null,
    };
  }

  // ---- M5-A's proof, which needs no replacement action to stand ----
  if (rejectedByObservedActionRule) {
    return {
      ...base,
      outcome: "REJECTED",
      basis: "OBSERVED_ACTION_REJECTED_BY_AUTHORITY",
      decisiveBlocker: null,
    };
  }

  if (tokensAgree) {
    return {
      ...base,
      outcome: "MATCH",
      basis: "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN",
      decisiveBlocker: null,
    };
  }

  if (resolvedToken !== null) {
    // A different token was proven. That rejects the observed action WITHOUT
    // asserting the player should have pressed the other one: actionability,
    // encounter state and the player's own information are not evaluated here.
    return {
      ...base,
      outcome: "REJECTED",
      basis: "AUTHORITY_SELECTED_DIFFERENT_TOKEN",
      decisiveBlocker: null,
    };
  }

  if (classified.coverage === "NO_ACTION") {
    return {
      ...base,
      outcome: "UNKNOWN",
      basis: "AUTHORITY_SELECTED_NO_ACTION_DESPITE_OBSERVED_GCD",
      decisiveBlocker: null,
    };
  }

  return {
    ...base,
    outcome: "UNKNOWN",
    basis: "AUTHORITY_SELECTION_UNRESOLVED",
    decisiveBlocker: classified.blockerClass,
  };
}
