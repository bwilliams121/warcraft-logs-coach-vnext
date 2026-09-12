/**
 * Decision authority — who is entitled to say what correct play is.
 *
 * THE HIERARCHY THIS FILE ENFORCES BY OMISSION:
 *
 *     Warcraft Logs        -> factual evidence about what happened
 *     runtime game data    -> semantic/static meaning of identifiers
 *     SimulationCraft APL  -> ROTATIONAL AUTHORITY
 *
 * Only the third is a decision authority, so `DecisionAuthorityKind` has exactly
 * one member. Warcraft Logs observations and runtime game data are evidence and
 * data provenance respectively, and they live in `src/data` and in M4's
 * `StateProvenance`. Admitting them here would let "we observed it" or "the
 * spell table says so" masquerade as "this is what you should have done", which
 * is the authority confusion the project is built to prevent.
 *
 * WHY `src/findings/` AND NOT `src/engine/findings/`
 *
 * `src/engine` owns factual and derived state. A finding is a downstream
 * interpretive judgment. Keeping them apart is what lets the M4 state-vocabulary
 * contract keep banning authority vocabulary across the whole engine tree
 * without a single exemption.
 */

/**
 * Kinds of authority that can decide a gameplay question.
 *
 * One member today. Adding one is a significant architectural act and should be
 * accompanied by the decision categories it is authoritative for.
 */
export type DecisionAuthorityKind = "SIMC_APL";

export const DECISION_AUTHORITY_KINDS = ["SIMC_APL"] as const satisfies readonly DecisionAuthorityKind[];

/** Decision categories M5-A can evaluate. */
export type DecisionCategory = "ROTATION";

/**
 * A pointer to the exact authority line a judgment rests on.
 *
 * Specific enough that a reader can open the pinned source at the recorded
 * commit and line and see the same text.
 */
export interface AuthorityRef {
  readonly kind: DecisionAuthorityKind;
  readonly authorityId: string;
  readonly artifactRevision: string;
  readonly listName: string;
  readonly priorityOrdinal: number;
  /** The exact first string argument to `add_action` in the pinned source. */
  readonly actionStringVerbatim: string;
  readonly sourceLine: number;
}

/** Where the authority artifact came from. JSON-safe scalars only. */
export interface SimcAuthorityProvenance {
  readonly repository: string;
  readonly commitSha: string;
  readonly commitDate: string;
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly extractedOn: string;
}

export interface ResolvedAuthority {
  readonly ref: AuthorityRef;
  readonly provenance: SimcAuthorityProvenance;
}

/**
 * Why NO trustworthy authority applies to a decision.
 *
 * Deliberately tiny, and deliberately does NOT include anything about our own
 * ability to evaluate. `NO_AUTHORITY_AVAILABLE` means "no applicable standard
 * exists for this question". If SimulationCraft exists but our reachability
 * proof, expression support or state reconstruction falls short, the standard
 * still exists and the answer is UNKNOWN.
 *
 * The failure this separation prevents: an analyzer whose own gaps get reported
 * as "nobody knows what correct play is here", which sounds authoritative and
 * is false.
 */
export type NoAuthorityReason = "NO_PINNED_AUTHORITY_FOR_SPEC";

export const NO_AUTHORITY_REASONS = [
  "NO_PINNED_AUTHORITY_FOR_SPEC",
] as const satisfies readonly NoAuthorityReason[];
