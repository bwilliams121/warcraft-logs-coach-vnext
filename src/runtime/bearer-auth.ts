/**
 * Who may spend analysis capacity.
 *
 * WHY THIS EXISTS AT ALL, AND WHY THE RATE LIMITER IS NOT ENOUGH
 *
 * Every analysis spends Warcraft Logs API points from a finite, paid,
 * account-wide quota. Through M6-D only `/mcp` was authenticated, because only
 * `/mcp` could reach an analysis. M6-E made `/v1/analysis` analyse too — and
 * left it anonymous, protected solely by the Cloudflare rate-limit binding.
 *
 * That was not sufficient. Cloudflare's Worker Rate Limiting counters are
 * LOCAL TO EACH CLOUDFLARE LOCATION and intentionally eventually consistent, so
 * "10 requests / 60 seconds" is not "10 analyses per minute worldwide". It is a
 * per-location brake, and it is excellent at stopping a runaway loop from one
 * place. It is not an access-control boundary, and it cannot be the thing
 * standing between the open Internet and someone else's paid quota.
 *
 * So the two mechanisms are complementary and neither substitutes for the other:
 *
 *     authentication   who may spend analysis capacity
 *     rate limiting    how fast an authorized caller may spend it
 *
 * WHY THE VERIFICATION IS SHARED BUT THE RESPONSE IS NOT
 *
 * REST and MCP must agree on exactly one credential — that is what makes them
 * one private principal rather than two independently-guarded doors. But they
 * should not agree on the response BODY: MCP answers in the SDK's OAuth-shaped
 * challenge, REST in its own `{ ok: false, error }` envelope. Sharing the
 * decision and letting each transport render it keeps REST free of the MCP SDK
 * and keeps each surface idiomatic.
 *
 * THIS IS THE PRIVATE-DEVELOPMENT MECHANISM, NOT THE FINAL ONE.
 *
 * One shared static secret is adequate for a single-tenant private deployment.
 * It is not OAuth, not multi-user identity, and not the final public
 * ChatGPT-facing authorization design — Cloudflare Access or real OAuth remain
 * open for that, and choosing between them is a later decision driven by client
 * interoperability rather than by this milestone.
 *
 * WHERE IT MUST NOT LIVE
 *
 * Not in `src/services/**`, `src/contracts/**`, or any gameplay layer. "May
 * this caller reach the endpoint" is a property of being publicly exposed; the
 * analysis is identical whoever asked for it. A layering test enforces that.
 */

const BEARER_SCHEME = "bearer ";

/**
 * The single author-written rejection message, shared by both transports.
 *
 * Deliberately identical for every failure — absent header, wrong scheme, empty
 * token, wrong token, and an unconfigured deployment all produce this exact
 * string. A caller learns that it is not authorized and nothing else: not
 * whether the server has a token configured, not how long the real one is, not
 * how close they came.
 *
 * It interpolates nothing. No presented value and no configured value can reach
 * it, which makes the leak tests a statement about the code rather than about
 * one execution path.
 */
export const UNAUTHORIZED_MESSAGE =
  "This endpoint requires a valid bearer token. Analysis spends a finite Warcraft Logs API quota and is not publicly callable.";

/** Whether one request may proceed. There is no third state. */
export type BearerAuthDecision = "AUTHORIZED" | "UNAUTHORIZED";

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
 * Decides whether one request carries the configured analysis credential.
 *
 * FAILS CLOSED IN EVERY DIRECTION. An unconfigured `ANALYSIS_AUTH_TOKEN`
 * rejects rather than opening the endpoint: "no token is set" must never mean
 * "no token is needed", which is exactly how a private endpoint becomes a
 * public one during a botched deploy.
 *
 * The decision carries no detail. Callers render one fixed response for
 * `UNAUTHORIZED`, so a wrong token and an unconfigured server are
 * indistinguishable from outside.
 *
 * Nothing is returned for the caller to store. There is one static credential,
 * so there is no identity to convey — and putting the secret into a context
 * object that downstream code can read would create a leak path in exchange for
 * nothing.
 */
export async function verifyAnalysisBearer(
  request: Request,
  configuredToken: string | undefined,
): Promise<BearerAuthDecision> {
  const expected = configuredToken?.trim();
  if (expected === undefined || expected.length === 0) return "UNAUTHORIZED";

  const presented = presentedToken(request);
  if (presented === null) return "UNAUTHORIZED";

  return (await secretsMatch(presented, expected)) ? "AUTHORIZED" : "UNAUTHORIZED";
}
