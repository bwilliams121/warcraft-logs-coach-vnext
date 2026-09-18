/**
 * The production composition root.
 *
 * THE ONLY PLACE THAT BINDS INFRASTRUCTURE TO THE APPLICATION.
 *
 * Everywhere else in this project, dependencies arrive as ports. This file is
 * where the real ones are chosen — the real Warcraft Logs preflight, the real
 * M3 ingestor — and handed to the one application service. Nothing above it
 * knows how a Warcraft Logs request is made; nothing below it knows there is a
 * deployment.
 *
 * WHY THERE IS EXACTLY ONE OF THESE
 *
 * REST and MCP both call the function this module produces. That is the whole
 * point: a second composition would mean two paths that can disagree about the
 * same fight while both looking correct, and the REST/MCP equality tests would
 * be comparing two implementations rather than two renderings of one result.
 *
 * So there is no `createRestAnalysisRunner` and no `createMcpAnalysisRunner`.
 * There is this, and both adapters receive what it returns.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * No routing, no HTTP, no MCP, no authentication, no rate limiting, and no
 * public projection. It answers "what does the engine conclude", and every
 * question about who may ask and how the answer is rendered belongs to the
 * adapter. Keeping those out is what makes the equality proof mean something.
 */

import type { Env } from "../config/env.js";
import { analyzeFight } from "../services/analysis-service.js";
import {
  PUBLIC_SPECIALIZATION_DESCRIPTIONS,
  type PublicSpecializationDescriptions,
} from "../services/analyzer-registry.js";
import type { AnalysisRunner } from "../services/analysis-runner.js";
import { createPreflight } from "../wcl/preflight.js";
import { createFightCoreIngestor, createFightIngestor } from "../wcl/ingest-fight.js";
import { createReportRevisionReader } from "../wcl/report-revision.js";
import { createReportRoster } from "../wcl/report-roster.js";
import { createTokenCache } from "../wcl/token-provider.js";
import { countOutbound } from "../wcl/types.js";
import type { RaidNightDiagnosticRecord } from "../services/raid-night-ports.js";
import { analyzeRaidNight } from "../services/raid-night-service.js";
import type { RaidNightRunner } from "../services/raid-night-runner.js";
import { analyzeEncounterContext } from "../services/encounter-context-service.js";
import type { EncounterContextRunner } from "../services/encounter-context-runner.js";
import { createCandidateMetadataPort, createRankingPagePort } from "../wcl/rankings/external-ports.js";

/**
 * Binds the real Warcraft Logs infrastructure to the application service.
 *
 * ONE TOKEN CACHE, SHARED. A single analysis performs preflight and then
 * ingestion, and both authenticate to the same API with the same credentials.
 * Handing them one cache means one OAuth exchange per request instead of two —
 * which matters because token requests count against the same finite quota the
 * rate limiter exists to protect. This reuses the existing token provider
 * rather than adding a second OAuth implementation.
 *
 * The cache is created PER RUNNER rather than at module scope. A Worker
 * instance serves many requests, and a module-level cache would be shared state
 * whose lifetime nobody reasons about; a per-request runner keeps the sharing
 * to exactly the scope where it is obviously correct.
 *
 * Both factories bind the global `fetch` the same way the existing production
 * preflight does. No second GraphQL client, no second retry policy, no second
 * rate-limit interpretation — `ingestFight` and `preflight` keep the transport
 * behaviour M2 and M3 already established.
 */
export function createProductionAnalysisRunner(env: Env): AnalysisRunner {
  const boundFetch = (input: string, init: RequestInit): Promise<Response> => fetch(input, init);
  const tokenCache = createTokenCache();

  const preflight = createPreflight({ fetch: boundFetch, tokenCache });
  const ingest = createFightIngestor({ fetch: boundFetch, tokenCache });

  return async (input: unknown) => await analyzeFight(input, { env, preflight, ingest });
}

/**
 * Binds the real Warcraft Logs infrastructure to the raid-night service.
 *
 * ONE TOKEN CACHE, SHARED ACROSS EVERY STEP. A raid night performs roster
 * discovery, up to four fight retrievals and a final revision confirmation —
 * all against the same API with the same credentials. One cache means one OAuth
 * exchange for the whole request instead of six, and token requests count against
 * the same finite quota the rate limiter exists to protect.
 *
 * NO SECOND WCL ARCHITECTURE. `createReportRoster`, `createFightCoreIngestor` and
 * `createReportRevisionReader` all bind the same global `fetch` the same way the
 * single-fight path already does, so there is no second GraphQL client, no second
 * retry policy and no second rate-limit interpretation. M2's and M3's transport
 * behaviour is what a raid night gets.
 *
 * WHY THIS LIVES BESIDE `createProductionAnalysisRunner` RATHER THAN IN ITS OWN
 * ROOT
 *
 * Both are the same kind of thing: the one place infrastructure is chosen. A
 * second composition tree would be a second place a credential could be bound
 * differently, and the REST/MCP equality proofs rest on both transports receiving
 * a runner built exactly once.
 */
export function createProductionRaidNightRunner(env: Env): RaidNightRunner {
  // Counted (M11-A5): the same bound fetch, with an outbound ordinal the
  // GraphQL client can record on a failure. Nothing about what is sent changes.
  const boundFetch = countOutbound((input: string, init: RequestInit) => fetch(input, init));
  const tokenCache = createTokenCache();

  const discoverRoster = createReportRoster({ fetch: boundFetch, tokenCache });
  const ingestFightCore = createFightCoreIngestor({ fetch: boundFetch, tokenCache });
  const checkRevision = createReportRevisionReader({ fetch: boundFetch, tokenCache });

  return async (request) =>
    await analyzeRaidNight(request, {
      env,
      discoverRoster,
      ingestFightCore,
      checkRevision,
      diagnostics: logRaidNightDiagnostic,
    });
}

/**
 * The one production log line a raid night may write (M11-A5).
 *
 * The record is fixed-vocabulary by type (`RaidNightDiagnosticRecord`): enum
 * members, integers, booleans, nulls. It is serialized as-is and nothing is
 * appended, so the line cannot carry upstream text, an exception message, a
 * header, a token or evidence. Read with `wrangler tail` or the Workers Logs
 * view; it exists so a `REPORT_REVISION_UNVERIFIED` refusal, which is
 * deliberately opaque to callers, is not opaque to the operator.
 */
export function logRaidNightDiagnostic(record: RaidNightDiagnosticRecord): void {
  console.log(JSON.stringify(record));
}

/**
 * Binds the real Warcraft Logs infrastructure to the encounter-context service.
 *
 * ONE TOKEN CACHE ACROSS BOTH HALVES. An encounter-context request performs the
 * whole local raid-night retrieval AND, when asked, up to six external metadata
 * requests — all against the same API with the same credentials. Sharing one
 * cache means one OAuth exchange for the request rather than one per phase, and
 * token requests spend the same finite quota the limiter protects.
 *
 * THE LOCAL PORTS ARE THE SAME ONES A RAID NIGHT GETS. `createReportRoster`,
 * `createFightCoreIngestor` and `createReportRevisionReader` are bound here
 * exactly as `createProductionRaidNightRunner` binds them, and the service
 * COMPOSES `analyzeRaidNight` rather than reimplementing it — which is what keeps
 * one selected fight to at most one `ingestFightCore`.
 *
 * NO RATE LIMITING HERE. Admission is a property of being publicly reachable and
 * belongs to the adapter; a limiter call inside this composition would charge a
 * second time for work the transport already admitted. See the REST route and
 * the MCP tool, which are the only two places encounter-context units are
 * charged.
 */
export function createProductionEncounterContextRunner(env: Env): EncounterContextRunner {
  const boundFetch = countOutbound((input: string, init: RequestInit) => fetch(input, init));
  const tokenCache = createTokenCache();

  const discoverRoster = createReportRoster({ fetch: boundFetch, tokenCache });
  const ingestFightCore = createFightCoreIngestor({ fetch: boundFetch, tokenCache });
  const checkRevision = createReportRevisionReader({ fetch: boundFetch, tokenCache });

  return async (request) =>
    await analyzeEncounterContext(request, {
      env,
      raidNight: { discoverRoster, ingestFightCore, checkRevision, diagnostics: logRaidNightDiagnostic },
      external: {
        rankingPage: createRankingPagePort({ fetch: boundFetch, tokenCache }),
        candidateMetadata: createCandidateMetadataPort({ fetch: boundFetch, tokenCache }),
      },
    });
}

/**
 * What the production MCP tool descriptions say about specializations
 * (M11-A1, widened in M11-A2): the derived "Supported specializations: …"
 * sentence and each PUBLIC specialization's own limitation prose, in one
 * deterministic order.
 *
 * Re-exported from the application layer HERE, at the composition root,
 * because the transports may not import the analyzer registry (they hold no
 * catalog and compose no analysis) and the MCP layer may not compute these
 * for itself. Both are derived from the PUBLIC registrations of the
 * production catalog — the same set the dispatcher selects from — and are
 * handed to the MCP handler by `src/api/worker.ts` exactly as the runners
 * are. There is no second source of this wording.
 */
export const PRODUCTION_PUBLIC_SPECIALIZATIONS: PublicSpecializationDescriptions =
  PUBLIC_SPECIALIZATION_DESCRIPTIONS;

export type { PublicSpecializationDescriptions };
