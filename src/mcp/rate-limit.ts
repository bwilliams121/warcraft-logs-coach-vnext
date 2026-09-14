/**
 * Metering the expensive tool.
 *
 * WHY THIS EXISTS AT ALL
 *
 * The MCP specification requires servers to rate limit tool invocations, and
 * for this tool that requirement has teeth: one `analyze_warcraft_log` call
 * spends Warcraft Logs API points from a finite, paid, account-wide quota that
 * no amount of retrying replenishes. An agent loop that calls the tool in a
 * tight cycle does not merely waste CPU — it exhausts a shared resource the
 * deployment cannot get back.
 *
 * WHY THE LIMIT IS A PORT RATHER THAN THE BINDING DIRECTLY
 *
 * Cloudflare's limiter is a distributed counter with real timing behaviour.
 * Tests that drove it would be testing Cloudflare, slowly and flakily. This
 * narrow port lets a test produce `allowed`, `denied` and `throws`
 * deterministically, while production passes the real binding straight through
 * — the adapter below is a one-line delegation precisely so there is nothing in
 * it that could behave differently from the thing it wraps.
 *
 * WHERE IT DOES NOT BELONG
 *
 * Not in `src/services/**`. Rate limiting is an exposure concern: it answers
 * "may this caller invoke this endpoint right now", which is a property of
 * being publicly reachable, not of analysing a fight. The application service
 * produces the same analysis whether it was called once or a thousand times.
 */

/**
 * The subset of Cloudflare's `RateLimit` binding this project uses.
 *
 * Declared structurally rather than importing the Cloudflare global, so the
 * port stays usable in the plain Node test project. The real binding satisfies
 * it exactly: `RateLimitOptions` is `{ key: string }` and `RateLimitOutcome` is
 * `{ success: boolean }`.
 */
export interface RateLimiterPort {
  limit(options: { readonly key: string }): Promise<{ readonly success: boolean }>;
}

/**
 * The metering key for the analysis tool.
 *
 * ONE PRINCIPAL, ONE BUDGET. This deployment has a single bearer credential, so
 * every authorized caller is the same principal and a per-caller key would be a
 * per-caller key with exactly one caller in it. A stable resource identifier is
 * the honest expression of that: one shared analysis budget for the tool.
 *
 * WHAT IS DELIBERATELY NOT THE KEY, AND WHY
 *
 * - The bearer token. It is a secret. Keys are not published, but a secret used
 *   as a lookup key is a secret in one more place than it needs to be, and the
 *   value would be indistinguishable from the credential itself.
 * - Warcraft Logs credentials. Same reasoning, and they identify the SERVER's
 *   account rather than a caller.
 * - Report code or source id. That would give every distinct log its own fresh
 *   budget, which inverts the protection: a loop over many reports is exactly
 *   the case that burns the most quota.
 * - IP address or location. Cloudflare specifically discourages these because
 *   many legitimate users share them, and rate limiting one would rate limit
 *   all of them.
 *
 * When authentication becomes multi-principal this becomes principal + tool.
 * Today that would be a distinction with one member.
 */
export const ANALYSIS_RATE_LIMIT_KEY = "mcp:analyze_warcraft_log";

/** What the limiter decided, or that it could not decide. */
export type RateLimitDecision = "ALLOWED" | "DENIED" | "UNAVAILABLE";

/**
 * Asks the limiter whether one analysis may proceed.
 *
 * FAILS CLOSED. A limiter that throws has told us nothing, and the safe reading
 * of "we do not know whether this is permitted" is not "proceed anyway" — that
 * turns an outage in the metering layer into unmetered access to the expensive
 * resource the metering exists to protect. `UNAVAILABLE` is kept distinct from
 * `DENIED` so the caller can report an infrastructure fault as one, rather than
 * telling a user they exceeded a limit they never reached.
 *
 * An ABSENT limiter is `UNAVAILABLE` for the same reason: a deployment missing
 * the binding is unmetered, and unmetered is the condition this module exists
 * to prevent.
 */
export async function checkAnalysisRateLimit(
  limiter: RateLimiterPort | undefined,
): Promise<RateLimitDecision> {
  if (limiter === undefined) return "UNAVAILABLE";

  try {
    const { success } = await limiter.limit({ key: ANALYSIS_RATE_LIMIT_KEY });
    return success ? "ALLOWED" : "DENIED";
  } catch {
    // The thrown value is deliberately not read. It cannot improve the decision,
    // and anything derived from it could reach a client.
    return "UNAVAILABLE";
  }
}
