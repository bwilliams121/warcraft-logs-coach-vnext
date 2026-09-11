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

/** What an analyzer declares it needs. The service unions these. */
export interface AnalyzerRequirement {
  readonly analyzerId: string;
  readonly requiredScope: IngestionScope;
}

export type ScopeDerivation =
  | {
      readonly ok: true;
      readonly scope: IngestionScope;
      readonly contributingAnalyzers: readonly string[];
    }
  | { readonly ok: false; readonly reason: "NO_ANALYZERS_ENABLED" };

/** Ordered widest-last. A wider requirement from any analyzer wins. */
const SCOPE_BREADTH: Record<IngestionScope, number> = {
  PLAYER_CONTEXT: 0,
  FULL_RAID: 1,
};

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

  return {
    ok: true,
    scope,
    contributingAnalyzers: requirements
      .filter((requirement) => requirement.requiredScope === scope)
      .map((requirement) => requirement.analyzerId),
  };
}
