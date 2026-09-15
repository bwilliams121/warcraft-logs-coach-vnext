/**
 * The encounter-context application service.
 *
 * ONE INGESTION, REUSED — NOT A SECOND ORCHESTRATION
 *
 * This composes `analyzeRaidNight` rather than reimplementing it. M7 already
 * discovers the roster once, ingests each needed fight at most once, and runs
 * each analyzer over one shared core; copying that here would double the metered
 * Warcraft Logs cost of every request and give the project two orchestrations to
 * keep in agreement.
 *
 * The one thing M7 did not surface was each pull's M8-C context facts, which its
 * loop already holds. M8-G adds an optional observer to pick them up in passing
 * — see `EncounterFactsObserver` — so the invariant holds exactly:
 *
 *     one selected subject fight  ->  at most one ingestFightCore
 *
 * EXTERNAL DISCOVERY IS A SEPARATE, OPTIONAL, METADATA-ONLY PHASE
 *
 * It runs after local context is complete, consumes it read-only, and can fail
 * in every way M8-F models without touching it. That is why the local half of
 * the result is computed before the external half is attempted, and why nothing
 * below can turn an external failure into a request failure.
 */

import type { Env } from "../config/env.js";
import type { RaidNightAnalysis } from "../aggregation/raid-night.js";
import type { PullContext } from "../comparison/pull-identity.js";
import {
  buildRaidNightProgression,
  type RaidNightProgression,
} from "../progression/encounter-progression.js";
import { pullContextOf, type FightEncounterFacts } from "../progression/pull-projection.js";
import {
  discoverExternalReferences,
  type ExternalDiscovery,
  type ExternalDiscoveryPorts,
} from "../external-context/external-discovery.js";
import { MAX_QUALIFIED_CANDIDATES } from "../external-context/candidate-pool.js";
import { MAX_CANDIDATE_PAGES } from "../wcl/rankings/rankings-query.js";
import { analyzeRaidNight, type RaidNightServiceDeps } from "./raid-night-service.js";
import type { EncounterContextRequest, ExternalReferenceOption } from "./encounter-context-request.js";
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
   * not establish an encounter identity to search a ranking board with. Searching
   * anyway would mean guessing what encounter the caller meant.
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

export interface EncounterContextServiceDeps {
  readonly env: Env;
  /** M7's ports, passed straight through. No second retrieval path exists. */
  readonly raidNight: Omit<RaidNightServiceDeps, "env" | "observeEncounterFacts">;
  /**
   * M8-F's ports.
   *
   * Optional: a deployment that never enables external references need not wire
   * a ranking transport at all, and a request that does not ask for one never
   * touches these.
   */
  readonly external?: ExternalDiscoveryPorts | undefined;
}

/**
 * The work a request will perform, computable before any of it happens.
 *
 * M8-H owns admission; this exists so admission has something truthful to read.
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
 * Finds the subject pull, and the `PullContext` external distances measure from.
 *
 * `null` when the named fight is in no sequence — which is a real outcome rather
 * than an error, because trash and unresolved-difficulty pulls legitimately sit
 * outside every progression sequence.
 */
function subjectPullFor(
  progression: RaidNightProgression,
  aggregate: RaidNightAnalysis,
  option: Extract<ExternalReferenceOption, { mode: "ENABLED" }>,
): { readonly context: PullContext; readonly encounterId: number; readonly difficulty: number } | null {
  for (const encounter of progression.encounters) {
    const pull = encounter.pulls.find((entry) => entry.fightId === option.subjectFightId);
    if (pull === undefined) {
      continue;
    }
    const summary = aggregate.fights.find((fight) => fight.fightId === pull.fightId);
    const { encounterId, difficulty } = encounter.identity;
    // A formed sequence always has both resolved — M8-B eligibility requires it
    // — but the identity type states them nullable rather than restating M8-B's
    // rules, so they are checked here instead of asserted.
    if (summary === undefined || encounterId === null || difficulty === null) {
      return null;
    }
    return { context: pullContextOf(aggregate.identity, summary), encounterId, difficulty };
  }
  return null;
}

/**
 * Runs one encounter-context request.
 *
 * The local half completes before the external half begins, and the external
 * half cannot modify it: `progression` is built once and returned by reference
 * whatever happens afterwards.
 */
export async function analyzeEncounterContext(
  request: EncounterContextRequest,
  deps: EncounterContextServiceDeps,
): Promise<EncounterContextRunResult> {
  // ---- local: M7's orchestration, with the M8-C facts picked up in passing ----
  const encounterFacts: FightEncounterFacts[] = [];

  const raidNight = await analyzeRaidNight(request.subject, {
    env: deps.env,
    ...deps.raidNight,
    observeEncounterFacts: (facts) => {
      encounterFacts.push({ fightId: facts.fightId, outcome: facts.outcome, zone: facts.zone });
    },
  });

  // A LOCAL failure is a request failure: the analysis the caller asked for
  // could not be produced. This is the only path that fails the request.
  if (!raidNight.ok) {
    return { ok: false, error: raidNight.error };
  }

  const progression = buildRaidNightProgression({
    aggregate: raidNight.aggregate,
    encounterFacts,
  });

  // ---- external: optional, metadata-only, and unable to affect the above ----
  const option = request.externalReferences;
  if (option.mode === "DISABLED") {
    return {
      ok: true,
      analysis: { progression, external: { kind: "SKIPPED", reason: "NOT_REQUESTED" } },
    };
  }

  const subject = subjectPullFor(progression, raidNight.aggregate, option);
  if (subject === null) {
    return {
      ok: true,
      analysis: {
        progression,
        external: { kind: "SKIPPED", reason: "SUBJECT_PULL_NOT_IN_A_SEQUENCE" },
      },
    };
  }

  // No ports wired is the same observable outcome as not asking: no discovery
  // happened. It is reported as a skip rather than invented as a failure.
  if (deps.external === undefined) {
    return {
      ok: true,
      analysis: { progression, external: { kind: "SKIPPED", reason: "NOT_REQUESTED" } },
    };
  }

  const discovery = await discoverExternalReferences(
    {
      rankings: {
        // Encounter and difficulty come from the subject pull's TYPED facts, not
        // from the caller — so a discovery cannot be pointed at one encounter
        // while claiming to be about another.
        encounterId: subject.encounterId,
        difficulty: subject.difficulty,
        className: option.className,
        specName: option.specName,
        metric: option.metric,
        partition: option.partition,
      },
      subject: subject.context,
    },
    deps.external,
  );

  return { ok: true, analysis: { progression, external: { kind: "ATTEMPTED", discovery } } };
}

export type EncounterContextRunner = (request: EncounterContextRequest) => Promise<EncounterContextRunResult>;
