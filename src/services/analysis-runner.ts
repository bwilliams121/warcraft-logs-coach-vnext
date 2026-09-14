/**
 * The one analysis entry point every transport calls.
 *
 * WHY THIS TYPE LIVES HERE
 *
 * It was born under `src/mcp/` in M6-D, when MCP was its only consumer. Now
 * REST calls it too, and an abstraction shared by two transports cannot belong
 * to one of them — API would have to import MCP to obtain the type, which is a
 * dependency that means nothing and would quietly make MCP the owner of REST's
 * contract.
 *
 * So it sits in the application layer, where both adapters can reach it and
 * neither owns it.
 *
 * WHY A FUNCTION TYPE IS SAFE IN `src/services/**`
 *
 * This layer must stay free of `Request`, `Response`, MCP types, Cloudflare
 * runtime objects and public wire schemas — that is what lets the whole
 * composition run under a plain Node test project. A pure function type over
 * `unknown` and the service's own result adds none of those.
 *
 * WHAT IT DELIBERATELY DOES NOT INCLUDE
 *
 * No transport, no authentication, no rate limiting, no public projection. A
 * runner answers one question — "what does the engine conclude about this
 * request" — and everything about who may ask, how often, and how the answer is
 * rendered belongs to the adapter that asked.
 *
 * That separation is what makes the REST/MCP equality proof meaningful: both
 * adapters hold the same function, so a difference between their outputs can
 * only come from the adapters themselves.
 */

import type { AnalysisServiceResult } from "./result.js";

/**
 * Runs one analysis.
 *
 * The input is `unknown` on purpose: request shapes differ per transport, and
 * `parseAnalysisRequest` inside the service is the single authority on what a
 * valid analysis request is. An adapter that pre-validated into a typed request
 * would be a second parser.
 */
export type AnalysisRunner = (input: unknown) => Promise<AnalysisServiceResult>;
