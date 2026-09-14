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
import type { AnalysisRunner } from "../services/analysis-runner.js";
import { createPreflight } from "../wcl/preflight.js";
import { createFightIngestor } from "../wcl/ingest-fight.js";
import { createTokenCache } from "../wcl/token-provider.js";

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
