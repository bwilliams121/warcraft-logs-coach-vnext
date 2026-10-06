/**
 * Ingestion-scope derivation.
 *
 * Scope is DERIVED, never chosen.
 *
 * External callers cannot select an ingestion scope. There is no scope field on
 * the analysis request, and no reconciliation of a caller-supplied scope. The
 * application service computes the required scope from the union of the enabled
 * analysis requirements, which makes silent under-fetching structurally
 * impossible rather than something a runtime check has to catch.
 *
 * Scope is primarily about how much FRIENDLY RAID state is required.
 * `PLAYER_CONTEXT` still includes the enemy/target and encounter/environment
 * evidence that actionability depends on.
 */

export type IngestionScope = "PLAYER_CONTEXT" | "FULL_RAID";

export const INGESTION_SCOPES = ["PLAYER_CONTEXT", "FULL_RAID"] as const satisfies readonly IngestionScope[];

/**
 * What an analyzer needs in order to run.
 *
 * DERIVED SINCE M10-A. A registration no longer writes this by hand: it
 * declares decision capabilities, each with the scope and resources it
 * consumes, and `requirementFromCapabilities`
 * (`src/findings/decision-capability.ts`) folds them into this shape. The
 * widest capability scope wins and resources are retrieved when any capability
 * reads one. Scope derivation below then unions requirements across the
 * analyzers actually selected for a request.
 *
 * THE WHOLE POINT IS OWNERSHIP. Every analyzer-specific evidence choice the
 * ingestion request depends on belongs on this object, because the alternative
 * is the application service deciding it — and the service has no business
 * knowing WHY an analyzer wants a fact. Which resources a specialization spends,
 * and what they mean, is gameplay knowledge; a generic orchestrator holding it
 * works precisely until a second analyzer with different needs arrives, and then
 * silently retrieves the wrong evidence for it.
 *
 * So the rule is: the registration declares, the service consumes. A field
 * belongs here when a request cannot be built without it AND the answer differs
 * per analyzer.
 */
export interface AnalyzerRequirement {
  readonly analyzerId: string;
  readonly requiredScope: IngestionScope;
  /**
   * Whether this analyzer needs resource observations retrieved.
   *
   * Resources are a real retrieval cost, not a free extra, so an analyzer that
   * reads none should not pay for them. Which resources matter, and what they
   * mean, stays entirely behind the analyzer — this is only "yes, retrieve
   * them".
   */
  readonly includeResources: boolean;
  /**
   * Whether this analyzer reads the focus player's own pets (M11-E1). Present
   * only when true. Under PLAYER_CONTEXT it widens the evidence vouch to the
   * focus player's WCL-stated pets and nothing else; FULL_RAID already
   * vouches for every actor.
   */
  readonly ownedPetEvidence?: true;
}

export type ScopeDerivation =
  | {
      readonly ok: true;
      readonly scope: IngestionScope;
      readonly contributingAnalyzers: readonly string[];
      /** Unioned across the requirements: present when any one declared it. */
      readonly ownedPetEvidence?: true;
    }
  | { readonly ok: false; readonly reason: "NO_ANALYZERS_ENABLED" };

/** Ordered widest-last. A wider requirement from any analyzer wins. */
const SCOPE_BREADTH: Record<IngestionScope, number> = {
  PLAYER_CONTEXT: 0,
  FULL_RAID: 1,
};

/**
 * Derives the ingestion scope for a set of selected registrations.
 *
 * A convenience over `deriveIngestionScope` that reads each registration's
 * capability-derived requirement, so a caller holding registrations does not
 * restate the derivation.
 */
export function deriveIngestionScopeFor(
  registrations: readonly { readonly requirement: AnalyzerRequirement }[],
): ScopeDerivation {
  return deriveIngestionScope(registrations.map((registration) => registration.requirement));
}

/**
 * Derives the required ingestion scope from the union of declared requirements.
 *
 * With no enabled analyzers there is nothing to analyze, so this returns an
 * explicit `NO_ANALYZERS_ENABLED` outcome. It must never fall back to the
 * narrowest scope, because a silent smallest-scope default is exactly the
 * under-fetch failure this module exists to prevent.
 */
export function deriveIngestionScope(requirements: readonly AnalyzerRequirement[]): ScopeDerivation {
  if (requirements.length === 0) {
    return { ok: false, reason: "NO_ANALYZERS_ENABLED" };
  }

  let scope: IngestionScope = "PLAYER_CONTEXT";
  for (const requirement of requirements) {
    if (SCOPE_BREADTH[requirement.requiredScope] > SCOPE_BREADTH[scope]) {
      scope = requirement.requiredScope;
    }
  }

  const ownedPetEvidence = requirements.some((requirement) => requirement.ownedPetEvidence === true);
  return {
    ok: true,
    scope,
    contributingAnalyzers: requirements
      .filter((requirement) => requirement.requiredScope === scope)
      .map((requirement) => requirement.analyzerId),
    ...(ownedPetEvidence ? { ownedPetEvidence: true as const } : {}),
  };
}
