/**
 * Observational equivalence over an UNKNOWN sub-action identity (M10-C3).
 *
 * THE QUESTION. An APL entry such as `use_items` fires whichever of several
 * sub-actions is ready. When the evidence cannot say which sub-actions exist
 * — a gear row whose enchant or gem the log did not report — the set of
 * sub-actions that MIGHT exist is still finite: it is every candidate the
 * pinned build admits at that position. The identity may be ignored only if
 * every such candidate is EQUIVALENT for the first-GCD question: it consumes
 * no GCD, transitions in zero time, cannot be re-selected without bound, and
 * writes nothing the list reads, directly or through a modelled channel.
 *
 * WHAT THIS MODULE DECIDES AND WHAT IT DOES NOT. It decides equivalence from
 * a caller-supplied description of each candidate's behaviour and a
 * caller-supplied POLICY saying which write kinds the list can observe. It
 * does not know what a candidate is (an enchant, a gem, a trinket), which
 * specialization is asking, or why a write is observable — that is the
 * specialization's reading of ITS list and ITS pinned callbacks. Nothing here
 * names an item, a spell or a class.
 *
 * FAIL CLOSED, PER CANDIDATE. A single candidate that consumes a GCD, has an
 * unknown lane or transition, has no cooldown (and so could be re-selected at
 * the same instant), is scripted with unreviewed writes, or writes an
 * observable value defeats the proof for the whole position. The result
 * names every such candidate with every reason, so the gap is exact.
 *
 * THE PROOF SAYS NOTHING ABOUT EXISTENCE. `UNKNOWN_SUBACTION_IDENTITY_
 * OBSERVATIONALLY_IRRELEVANT` does not mean no sub-action exists; it means
 * that whichever of the candidates exists, the first-GCD question has the
 * same answer. An empty candidate set is refused rather than passed, because
 * "nothing could be there" is a claim about existence, which this proof is
 * not licensed to make.
 */

/** What a candidate sub-action would write when executed, in the authority's own model. */
export type SubactionWrite =
  | "PLAYER_STAT_BUFF"
  | "ABSORB_BUFF"
  | "DAMAGE_ACTION"
  | "HEAL_ACTION"
  | "ATTACK_ACTION"
  | "RESOURCE_ACTION"
  /** The candidate is implemented by a script the authority has not been read for. */
  | "SCRIPTED_UNREVIEWED"
  /** The candidate's behaviour could not be derived at all. */
  | "UNRESOLVED";

export interface SubactionCandidate {
  /** Opaque to this module. Reported verbatim. */
  readonly id: string;
  readonly lane: "NON_GCD" | "GCD" | "UNKNOWN";
  /** Simulated time the execution advances; `null` when not established. */
  readonly timeAdvanceMs: number | null;
  /** The cooldown the execution starts; `null` when not established. Zero means re-selectable at once. */
  readonly cooldownMs: number | null;
  readonly writes: readonly SubactionWrite[];
}

export type SubactionEquivalencePolicy = {
  /** Whether the list, or a modelled channel feeding it, can observe this write kind. */
  readonly writeIsObservable: (write: SubactionWrite) => boolean;
};

export type CandidateDefect =
  | "GCD_LANE"
  | "LANE_UNKNOWN"
  | "TIME_ADVANCE"
  | "TRANSITION_UNKNOWN"
  | "NO_COOLDOWN_NONTERMINATION"
  | "COOLDOWN_UNKNOWN"
  | `OBSERVABLE_WRITE:${SubactionWrite}`;

export interface BlockingCandidate {
  readonly id: string;
  readonly defects: readonly CandidateDefect[];
}

export type SubactionEquivalence =
  | {
      readonly kind: "UNKNOWN_SUBACTION_IDENTITY_OBSERVATIONALLY_IRRELEVANT";
      /** Every candidate considered, so the claim's scope is visible. */
      readonly candidateIds: readonly string[];
    }
  | {
      readonly kind: "IDENTITY_DECISION_RELEVANT";
      readonly candidateIds: readonly string[];
      readonly blocking: readonly BlockingCandidate[];
    }
  | {
      /** No candidate at all: the proof cannot speak, because it would be speaking about existence. */
      readonly kind: "NO_CANDIDATES";
    };

/** Every defect of one candidate under the policy. Empty means equivalent. */
export function candidateDefects(
  candidate: SubactionCandidate,
  policy: SubactionEquivalencePolicy,
): readonly CandidateDefect[] {
  const defects: CandidateDefect[] = [];
  if (candidate.lane === "GCD") defects.push("GCD_LANE");
  if (candidate.lane === "UNKNOWN") defects.push("LANE_UNKNOWN");
  if (candidate.timeAdvanceMs === null) defects.push("TRANSITION_UNKNOWN");
  else if (candidate.timeAdvanceMs > 0) defects.push("TIME_ADVANCE");
  if (candidate.cooldownMs === null) defects.push("COOLDOWN_UNKNOWN");
  else if (candidate.cooldownMs <= 0) defects.push("NO_COOLDOWN_NONTERMINATION");
  for (const write of candidate.writes) {
    // Scripted and unresolved behaviour is observable by construction: nothing bounds it.
    if (write === "SCRIPTED_UNREVIEWED" || write === "UNRESOLVED" || policy.writeIsObservable(write)) {
      defects.push(`OBSERVABLE_WRITE:${write}`);
    }
  }
  return defects;
}

/**
 * Proves, or refuses to prove, that the unknown identity among `candidates`
 * is irrelevant to the first-GCD question. Deterministic: candidates are
 * reported in the order given, defects in a fixed order.
 */
export function proveSubactionIdentityIrrelevant(
  candidates: readonly SubactionCandidate[],
  policy: SubactionEquivalencePolicy,
): SubactionEquivalence {
  if (candidates.length === 0) return { kind: "NO_CANDIDATES" };
  const candidateIds = candidates.map((candidate) => candidate.id);
  const blocking: BlockingCandidate[] = [];
  for (const candidate of candidates) {
    const defects = candidateDefects(candidate, policy);
    if (defects.length > 0) blocking.push({ id: candidate.id, defects });
  }
  if (blocking.length > 0) return { kind: "IDENTITY_DECISION_RELEVANT", candidateIds, blocking };
  return { kind: "UNKNOWN_SUBACTION_IDENTITY_OBSERVATIONALLY_IRRELEVANT", candidateIds };
}
