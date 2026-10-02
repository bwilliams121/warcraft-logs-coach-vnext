/**
 * The ORDER of a first-GCD usability resolution (M11-D2-B1).
 *
 * Every template specialization resolves an authority entry's usability in
 * the same sequence:
 *
 *     1. HYPOTHETICAL   the entry already fired in this explored branch
 *     2. branch         the specialization's own hypothetical refusals
 *     3. OBSERVED       the decision's own cast is one the token binds to
 *     4. negatives      the specialization's proofs the action cannot fire
 *     5. positives      the specialization's proofs the action can fire
 *     6. UNKNOWN        nothing above decided it
 *
 * This module owns that order and the two steps that carry no gameplay — the
 * hypothetical refusal (about a simulated branch, never the log) and the
 * observed proof (the cast that fired demonstrably could). It owns no gate
 * and no proof: cooldown readiness, static ready() overrides, aura gates,
 * resource affordability and every refusal detail but the hypothetical one
 * are supplied by the specialization, already decided, and only sequenced
 * here. A gate can only refuse and a proof can only prove; a step that does
 * both inside itself is not a gate or a proof and stays in its owner's code.
 *
 * Proven equal to the specialization implementations on committed evidence by
 * tests/contracts/m11d2b1-shared-plumbing-equivalence.test.ts. No public
 * analyzer imports this module.
 */

import type { TokenBinding } from "../../data/game/gcd-semantics-index.js";
import {
  provenUnusable,
  unknownUsability,
  type ActionUsabilityVerdict,
} from "../../simc/action-applicability.js";

/** The detail of the HYPOTHETICAL refusal, verbatim. */
export const SIMULATED_PREFIX_DETAIL =
  "HYPOTHETICAL, not observed: in this explored branch this authority entry has already been " +
  "selected once, and nothing returns it at zero elapsed time. This says nothing about what the " +
  "player actually did.";

/**
 * A negative verdict. Named by exclusion so the only place the negative member
 * is spelled out stays `action-applicability.ts`, whose constructor demands
 * evidence; a gate still builds its verdict through `provenUnusable`.
 */
export type UnusableVerdict = Exclude<ActionUsabilityVerdict, { readonly kind: "PROVEN_USABLE" | "UNKNOWN" }>;

/** A specialization's refusal: the verdict, or `null` when it proves nothing. */
export type UsabilityGate = () => UnusableVerdict | null;

/** A specialization's positive proof: `true` only when the action is proven able to fire. */
export type UsabilityProof = () => boolean;

export interface UsabilitySequence {
  /** Whether this exact entry already fired in this branch. */
  readonly executedInBranch: boolean;
  /** The specialization's further hypothetical refusals, in order. */
  readonly branchRefusals: readonly UsabilityGate[];
  readonly observedAbilityGameId: number;
  /** The ability ids the entry's token binds to. */
  readonly observedCandidates: readonly number[];
  readonly negativeGates: readonly UsabilityGate[];
  readonly positiveProofs: readonly UsabilityProof[];
}

/** The ability ids a token binding reaches; none for an unknown binding. */
export function bindingCandidates(binding: TokenBinding): readonly number[] {
  return binding.kind === "KNOWN_ONE"
    ? [binding.abilityGameId]
    : binding.kind === "KNOWN_SET"
      ? binding.abilityGameIds
      : [];
}

/** Runs the steps in order; the first that decides, decides. Later steps are never consulted. */
export function sequenceUsability(sequence: UsabilitySequence): ActionUsabilityVerdict {
  if (sequence.executedInBranch) {
    return provenUnusable("SIMULATED_PREFIX_EXECUTION", {
      abilityGameId: null,
      itemId: null,
      provenRemainingAtLeastMs: null,
      cooldownToleranceMs: null,
      detail: SIMULATED_PREFIX_DETAIL,
    });
  }
  for (const refusal of sequence.branchRefusals) {
    const verdict = refusal();
    if (verdict !== null) return verdict;
  }
  if (sequence.observedCandidates.includes(sequence.observedAbilityGameId)) return { kind: "PROVEN_USABLE" };
  for (const gate of sequence.negativeGates) {
    const verdict = gate();
    if (verdict !== null) return verdict;
  }
  for (const proof of sequence.positiveProofs) {
    if (proof()) return { kind: "PROVEN_USABLE" };
  }
  return unknownUsability();
}
