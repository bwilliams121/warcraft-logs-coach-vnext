/**
 * Metering expensive analysis, for every transport that exposes it.
 *
 * WHY THIS MOVED OUT OF `src/mcp/`
 *
 * In M6-D, MCP was the only way to reach an analysis, so the limiter lived
 * beside it. REST is now live too — and a budget that only one transport
 * respects is not a budget. An attacker or an accidental loop would simply
 * switch protocols. So the limiter sits above both adapters, and both charge
 * the same resource under the same key.
 *
 * WHY IT IS NOT IN `src/services/**`
 *
 * Rate limiting answers "may this caller invoke this endpoint right now", which
 * is a property of being publicly reachable rather than of analysing a fight.
 * The application service produces the same analysis whether it was called once
 * or a thousand times, and it should not be able to tell the difference.
 *
 * WHY THE LIMIT MATTERS HERE SPECIFICALLY
 *
 * One analysis spends Warcraft Logs API points from a finite, paid,
 * account-wide quota that no amount of retrying replenishes. The cost is not
 * CPU — it is a shared resource the deployment cannot buy back mid-incident.
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
 * The metering key for analysis, shared by every transport.
 *
 * ONE KEY, NOT ONE PER TRANSPORT. Separate `mcp:` and `rest:` keys would give a
 * caller two budgets and let them double their spend by alternating protocols —
 * which is precisely the bypass this key exists to close. The resource being
 * protected is the Warcraft Logs quota, and that quota does not care which
 * endpoint spent it.
 *
 * WHAT IS DELIBERATELY NOT THE KEY, AND WHY
 *
 * - The MCP bearer token. It is a secret, and a secret used as a lookup key is
 *   a secret in one more place than it needs to be. REST does not carry it at
 *   all, so it could not be a shared key even if it were safe.
 * - Warcraft Logs credentials. Same reasoning, and they identify the SERVER's
 *   account rather than a caller.
 * - Report code or source id. That would give every distinct log a fresh
 *   budget, inverting the protection: a loop over many reports is exactly the
 *   case that burns the most quota.
 * - IP address or location. Cloudflare specifically discourages these because
 *   many legitimate users share them, and rate limiting one would rate limit
 *   all of them.
 *
 * When authentication becomes multi-principal this becomes principal + resource.
 * Today that would be a distinction with one member.
 */
export const ANALYSIS_RATE_LIMIT_KEY = "analysis:warcraft_log";

/** What the limiter decided, or that it could not decide. */
export type RateLimitDecision = "ALLOWED" | "DENIED" | "UNAVAILABLE";

/**
 * Asks the limiter whether one analysis may proceed.
 *
 * FAILS CLOSED. A limiter that throws has told us nothing, and the safe reading
 * of "we do not know whether this is permitted" is not "proceed anyway" — that
 * turns an outage in the metering layer into unmetered access to the expensive
 * resource the metering exists to protect. `UNAVAILABLE` is kept distinct from
 * `DENIED` so a caller can report an infrastructure fault as one, rather than
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
