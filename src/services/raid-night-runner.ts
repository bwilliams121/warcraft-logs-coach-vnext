/**
 * The one raid-night entry point every transport calls.
 *
 * Mirrors `AnalysisRunner` deliberately. That type exists because an abstraction
 * shared by two transports cannot belong to either — API would have to import
 * MCP to obtain it, which is a dependency that means nothing and would quietly
 * make MCP the owner of REST's contract. A raid night has the same two
 * consumers, so it gets the same treatment.
 *
 * WHAT IT DELIBERATELY DOES NOT INCLUDE
 *
 * No transport, no authentication, no rate limiting. A runner answers one
 * question — "what does the engine conclude about this raid night" — and
 * everything about who may ask and how often belongs to the adapter that asked.
 *
 * That separation is what makes the REST/MCP equality proof meaningful: both
 * adapters hold the same function, so a difference between their outputs can only
 * come from the adapters themselves.
 *
 * WHY IT TAKES A PARSED REQUEST RATHER THAN `unknown`
 *
 * This differs from `AnalysisRunner`, and for a reason. A raid night's COST
 * depends on its fight count, and the rate limiter must charge that cost BEFORE
 * the runner spends anything. So the adapter has to parse first in order to know
 * what to charge — and once it has a canonical request, handing the runner
 * `unknown` again would mean parsing twice and inviting the two results to
 * differ.
 */

import type { RaidNightAnalysis } from "../aggregation/raid-night.js";
import type { RaidNightRequest } from "./raid-night-request.js";
import type { ServiceError } from "./result.js";

/**
 * A completed raid night, or the one reason it could not be produced.
 *
 * `ok: true` carries the INTERNAL aggregate, not the public document — the same
 * division the single-fight runner draws. The application layer must stay free of
 * wire schemas: that is what lets the whole composition run under a plain Node
 * test project, and a layering test enforces that nothing under `src/services`
 * imports `src/contracts` at all.
 *
 * So each transport calls `projectRaidNightResult` itself. That does NOT weaken
 * REST/MCP parity: the projection is pure and deterministic over its input, so two
 * call sites on one aggregate produce byte-identical output — which is asserted
 * directly rather than assumed.
 *
 * `ok: false` carries the shared `ServiceError` vocabulary, so both transports map
 * the same condition to the same code through machinery that already exists.
 */
export type RaidNightRunResult =
  | { readonly ok: true; readonly aggregate: RaidNightAnalysis }
  | { readonly ok: false; readonly error: ServiceError };

export type RaidNightRunner = (request: RaidNightRequest) => Promise<RaidNightRunResult>;
