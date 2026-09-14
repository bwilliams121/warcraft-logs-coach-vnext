/**
 * Inbound MCP bearer authorization.
 *
 * TWO CREDENTIAL CONCERNS LIVE IN THIS PROJECT AND THEY NEVER TOUCH.
 *
 *   INBOUND   `MCP_AUTH_TOKEN`                       who may CALL this server
 *   OUTBOUND  `WCL_CLIENT_ID` / `WCL_CLIENT_SECRET`  how this server calls
 *                                                    Warcraft Logs
 *
 * This module knows only the first. It never reads the Warcraft Logs
 * credentials, and `loadConfig()` never learns about `MCP_AUTH_TOKEN` — so a
 * deployment missing the MCP token still serves `/health` and `/v1/analysis`
 * exactly as before, and a deployment missing the Warcraft Logs credentials
 * still rejects unauthenticated MCP callers.
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
 *
 * THIS IS THE PRIVATE-DEVELOPMENT MECHANISM, NOT THE FINAL ONE.
 *
 * A single shared secret is adequate for a single-tenant private deployment and
 * is not claimed to be the production ChatGPT-facing authentication design.
 * Cloudflare Access or full OAuth remain open for that, and choosing between
 * them is a later decision driven by real client interoperability.
 */

import { bearerAuthChallengeResponse, OAuthError, OAuthErrorCode } from "@modelcontextprotocol/server";

const BEARER_SCHEME = "bearer ";

/**
 * The single author-written rejection message.
 *
 * Deliberately identical for every failure — absent header, wrong scheme, wrong
 * token, and an unconfigured deployment all produce this exact string. A caller
 * learns that it is not authorized and nothing else: not whether the server has
 * a token configured, not how long the real one is, not how close it came.
 *
 * It interpolates nothing. No presented value and no configured value can reach
 * it, which is what makes the leak tests a statement about the code rather than
 * about one execution path.
 */
const UNAUTHORIZED_MESSAGE = "This MCP endpoint requires a valid bearer token.";

function unauthorized(): Response {
  return bearerAuthChallengeResponse(new OAuthError(OAuthErrorCode.InvalidToken, UNAUTHORIZED_MESSAGE));
}

/** Reads the token out of an `Authorization: Bearer <token>` header. */
function presentedToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header === null) return null;
  // Scheme is case-insensitive per RFC 7235; the token itself is not.
  if (!header.toLowerCase().startsWith(BEARER_SCHEME)) return null;
  const token = header.slice(BEARER_SCHEME.length).trim();
  return token.length === 0 ? null : token;
}

async function sha256(value: string): Promise<ArrayBuffer> {
  return await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}

/**
 * Constant-time secret comparison.
 *
 * `crypto.subtle.timingSafeEqual` is the runtime's own maintained primitive, so
 * no hand-rolled loop is involved. It requires equal lengths and throws
 * otherwise, and that throw would itself be a length oracle — so both values are
 * hashed to a fixed 32 bytes first and the digests are compared. Length is then
 * no longer observable, in timing or in control flow.
 */
async function secretsMatch(presented: string, configured: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(presented), sha256(configured)]);
  return crypto.subtle.timingSafeEqual(a, b);
}

/**
 * Authorizes one inbound MCP request.
 *
 * Returns `undefined` when the caller may proceed, matching the SDK's own guard
 * convention so the checks compose with `??` in the order they must run.
 *
 * FAILS CLOSED IN EVERY DIRECTION. An unconfigured `MCP_AUTH_TOKEN` rejects
 * rather than opening the endpoint: "no token is set" must never mean "no token
 * is needed", which is the specific way a private endpoint becomes a public one
 * during a botched deploy.
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
  const expected = configuredToken?.trim();
  if (expected === undefined || expected.length === 0) return unauthorized();

  const presented = presentedToken(request);
  if (presented === null) return unauthorized();

  return (await secretsMatch(presented, expected)) ? undefined : unauthorized();
}
