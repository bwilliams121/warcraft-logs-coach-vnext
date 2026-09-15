/**
 * The one encounter-context entry point every transport calls, and what one
 * request costs.
 *
 * MIRRORS `raid-night-runner.ts` DELIBERATELY. An abstraction shared by two
 * transports cannot belong to either, and the result TYPES must be reachable
 * without reaching the service that produces them — so REST and MCP import this
 * module and never `encounter-context-service.js`. That is what keeps
 * `analyzeEncounterContext` out of a transport's import graph, exactly as
 * `analyzeRaidNight` is kept out of the raid-night tool's.
 *
 * The cost functions live here for the same reason: admission happens at the
 * transport boundary, both transports must price a request identically, and
 * neither should have to import the service to do it.
 */

import type { RaidNightProgression } from "../progression/encounter-progression.js";
import type { ExternalDiscovery } from "../external-context/external-discovery.js";
import { MAX_QUALIFIED_CANDIDATES } from "../external-context/candidate-pool.js";
import { MAX_CANDIDATE_PAGES } from "../wcl/rankings/rankings-query.js";
import type { EncounterContextRequest } from "./encounter-context-request.js";
import type { ServiceError } from "./result.js";

/**
 * Why no external discovery was attempted, or why it could not be started.
 *
 * DISTINCT FROM M8-F's OWN FAILURES, which describe a discovery that ran. These
 * describe one that did not, and the difference matters to a reader deciding
 * whether to retry.
 */
export type ExternalReferenceSkipReason =
  /** The caller did not ask for external references. Costs nothing. */
  | "NOT_REQUESTED"
  /**
   * The named subject fight is in no progression sequence.
   *
   * It was trash, or its encounter or difficulty was unresolved, so M8-B could
   * not establish an encounter identity to search a ranking board with.
   */
  | "SUBJECT_PULL_NOT_IN_A_SEQUENCE";

export type ExternalReferenceOutcome =
  | { readonly kind: "SKIPPED"; readonly reason: ExternalReferenceSkipReason }
  | { readonly kind: "ATTEMPTED"; readonly discovery: ExternalDiscovery };

/**
 * The internal encounter-context result.
 *
 * NOT A WIRE DOCUMENT. `src/contracts/encounter-context-projection.ts` turns
 * this into one, and the layering tests keep the application layer free of
 * schemas — which is what lets this whole composition run under a plain Node
 * test project.
 */
export interface EncounterContextAnalysis {
  readonly progression: RaidNightProgression;
  readonly external: ExternalReferenceOutcome;
}

export type EncounterContextRunResult =
  | { readonly ok: true; readonly analysis: EncounterContextAnalysis }
  | { readonly ok: false; readonly error: ServiceError };

export type EncounterContextRunner = (request: EncounterContextRequest) => Promise<EncounterContextRunResult>;

/**
 * The work a request will perform, computable before any of it happens.
 *
 * Every number is derived from the request alone — no retrieval, no clock, no
 * guess at how many pages a fight will take.
 */
export interface EncounterContextCostPlan {
  readonly subjectFightCount: number;
  readonly externalReferencesEnabled: boolean;
  /** One ranking page plus at most five metadata lookups, or zero when disabled. */
  readonly maxExternalRequests: number;
  /** M8-E adds none. Temporal context is computed from an already-ingested fight. */
  readonly maxTemporalContextRequests: 0;
}

export function planEncounterContextCost(request: EncounterContextRequest): EncounterContextCostPlan {
  const enabled = request.externalReferences.mode === "ENABLED";
  return {
    subjectFightCount: request.subject.fightIds.length,
    externalReferencesEnabled: enabled,
    maxExternalRequests: enabled ? MAX_CANDIDATE_PAGES + MAX_QUALIFIED_CANDIDATES : 0,
    maxTemporalContextRequests: 0,
  };
}

/**
 * How many units of the shared analysis budget one request costs.
 *
 *     units = subjectFightCount + maxExternalRequests
 *
 * PRICED FROM THE REQUEST, NOT FROM WHAT HAPPENS. A discovery whose ranking page
 * comes back empty, is rejected, or qualifies nothing costs the same six units as
 * one that qualifies five references — because admission runs BEFORE any of that
 * is known, and because the bounded worst-case retrieval shape is what the budget
 * protects against. Charging less after a cheap outcome would make a failing
 * request the cheapest way to probe the API repeatedly.
 *
 * Local-only costs 1-4. External-enabled costs subject fights + 6. The maximum is
 * therefore 4 + 6 = 10, and a test pins it.
 *
 * ONE FORMULA, TWO CALL SITES. Two transports pricing a request separately is how
 * they come to disagree about what it costs.
 */
export function encounterContextAdmissionUnits(request: EncounterContextRequest): number {
  const plan = planEncounterContextCost(request);
  return plan.subjectFightCount + plan.maxExternalRequests;
}

/** The worst case one request may cost: four subject fights plus six external. */
export const MAX_ENCOUNTER_CONTEXT_ADMISSION_UNITS = 10;
