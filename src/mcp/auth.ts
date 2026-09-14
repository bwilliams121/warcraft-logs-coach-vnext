/**
 * Rendering an MCP bearer rejection.
 *
 * THE DECISION IS NOT MADE HERE ANY MORE.
 *
 * Token extraction, the constant-time comparison and the fail-closed rules live
 * in `src/runtime/bearer-auth.ts`, because REST now requires the SAME
 * credential. One verifier is what makes the two transports one private
 * principal rather than two independently-guarded doors that could drift apart.
 *
 * What stays here is the MCP-shaped answer. REST renders its own `{ ok: false,
 * error }` envelope from the same decision, which keeps REST free of the MCP
 * SDK and each surface idiomatic.
 *
 * TWO CREDENTIAL CONCERNS LIVE IN THIS PROJECT AND THEY NEVER TOUCH.
 *
 *   INBOUND   `ANALYSIS_AUTH_TOKEN`                  who may CALL this service
 *   OUTBOUND  `WCL_CLIENT_ID` / `WCL_CLIENT_SECRET`  how this service calls
 *                                                    Warcraft Logs
 *
 * This module knows only the first, and `loadConfig()` never learns about it —
 * so a deployment missing the analysis token still serves `/health`, and a
 * deployment missing the Warcraft Logs credentials still rejects unauthorized
 * callers before it discovers that.
 *
 * WHY NOT `requireBearerAuth` FROM THE SDK
 *
 * It was evaluated first, as the smaller path. It does not fit: it takes an
 * `OAuthTokenVerifier` and rejects any token whose `AuthInfo.expiresAt` is
 * unset. A static deployment secret has no expiry, so using it would mean
 * inventing an expiration for a credential that does not have one — dressing a
 * shared secret up as an OAuth access token in order to reuse a helper.
 *
 * What IS reused is the part worth reusing: `bearerAuthChallengeResponse` builds
 * the RFC-conformant `401` + `WWW-Authenticate: Bearer` answer from an
 * `OAuthError`. That is the fiddly, spec-shaped half, and it stays the SDK's job.
 */

import { bearerAuthChallengeResponse, OAuthError, OAuthErrorCode } from "@modelcontextprotocol/server";

import { UNAUTHORIZED_MESSAGE, verifyAnalysisBearer } from "../runtime/bearer-auth.js";

/**
 * Authorizes one inbound MCP request.
 *
 * Returns `undefined` when the caller may proceed, matching the SDK's own guard
 * convention so the checks compose with `??` in the order they must run.
 *
 * No `AuthInfo` is produced and none is passed to the MCP handler. There is one
 * static credential, so there is no identity to convey — and putting the secret
 * into a context object that every tool can read would create a leak path in
 * exchange for nothing.
 */
export async function mcpAuthChallenge(
  request: Request,
  configuredToken: string | undefined,
): Promise<Response | undefined> {
  const decision = await verifyAnalysisBearer(request, configuredToken);
  if (decision === "AUTHORIZED") return undefined;

  // One fixed answer for every failure, so a wrong token and an unconfigured
  // server are indistinguishable from outside.
  return bearerAuthChallengeResponse(new OAuthError(OAuthErrorCode.InvalidToken, UNAUTHORIZED_MESSAGE));
}
