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
 *
 * WHAT THIS IS AND IS NOT: A BRAKE, NOT A LEDGER
 *
 * Cloudflare's Worker Rate Limiting API is deliberately permissive and
 * eventually consistent — its counters are local to each Cloudflare location and
 * make no promise of globally serialized accounting. So nothing in this module
 * may be described as exact quota accounting, and nothing downstream should be
 * built on the assumption that N charges means exactly N requests got through
 * worldwide.
 *
 * What IS deterministic is our own behaviour, and that is what the tests pin:
 *
 *     we ATTEMPT one call per unit, on the shared key, before execution
 *     a returned `success: false` denies the request
 *     a denied request does not reach the runner
 *     REST and MCP use the same binding, key and call-count policy
 *
 * Those are properties of this code. The global effect is best-effort, and
 * `agent/deployment-smoke.md` records the same caveat for operators.
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

/**
 * Charges several units of the SAME analysis budget.
 *
 * WHY A RAID NIGHT COSTS MORE THAN ONE UNIT
 *
 * The budget exists to bound Warcraft Logs spend, and a four-fight raid night
 * performs roughly four fights' worth of it. Charging it one unit — the same as a
 * single-fight analysis — would let a caller get four times the quota by asking
 * for four fights in one call, which is exactly the bypass one shared key exists
 * to close.
 *
 * So the cost is the canonical fight count: one unit per fight.
 *
 * WHY SEQUENTIAL CALLS ON ONE KEY
 *
 * Cloudflare's binding takes no numeric cost — `limit()` accepts `{ key }` and
 * nothing else. Charging N units therefore means N ATTEMPTED calls against the
 * same key. What the distributed counter does with them is its own business and
 * is not exact; what this function guarantees is the attempt.
 *
 * PARTIAL CHARGES ARE NOT REVERSED, AND THAT IS CORRECT
 *
 * If the third of four calls is refused, the first two calls were already made
 * and the request is denied. There is no rollback, and inventing one would be
 * worse than the imprecision it tried to fix: a "refund" would have to credit a
 * shared, eventually-consistent counter, letting a denied caller restore capacity
 * for everyone. Having made the calls you made is the honest state.
 *
 * FAILS CLOSED, like the single-unit check. One `UNAVAILABLE` anywhere in the
 * sequence refuses the whole request rather than proceeding unmetered.
 *
 * The invariant this function offers a caller is therefore precisely: it attempts
 * `units` charges on the shared key before returning `ALLOWED`, and returns
 * anything else without attempting the rest. It is NOT a promise about how many
 * requests any Cloudflare location will ultimately admit.
 */
export async function checkAnalysisRateLimitCost(
  limiter: RateLimiterPort | undefined,
  units: number,
): Promise<RateLimitDecision> {
  if (limiter === undefined) return "UNAVAILABLE";
  // A non-positive cost would charge nothing and read as permission. No caller
  // should reach here with one, and silently allowing it is the fail-open case.
  if (!Number.isSafeInteger(units) || units < 1) return "UNAVAILABLE";

  for (let charged = 0; charged < units; charged += 1) {
    const decision = await checkAnalysisRateLimit(limiter);
    if (decision !== "ALLOWED") {
      // Units already charged stay charged. See above.
      return decision;
    }
  }
  return "ALLOWED";
}
