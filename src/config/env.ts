/**
 * Worker binding contract and configuration loading.
 *
 * `Env` is a plain structural interface on purpose. It contains no
 * Cloudflare-specific types, so the application service can be constructed and
 * tested without a Workers runtime.
 *
 * WCL_CLIENT_ID and WCL_CLIENT_SECRET are backend secrets. They are loaded
 * here, and nothing in this module ever returns them in a serialized form.
 */

export interface Env {
  readonly ENVIRONMENT?: string;
  readonly WCL_CLIENT_ID?: string;
  readonly WCL_CLIENT_SECRET?: string;
  /**
   * INBOUND MCP authorization. A different concern from the two above.
   *
   * `WCL_*` are OUTBOUND: how this service authenticates to Warcraft Logs.
   * `ANALYSIS_AUTH_TOKEN` is INBOUND: who may call the analysis surfaces.
   *
   * ONE CREDENTIAL FOR BOTH TRANSPORTS. `/v1/analysis` and `/mcp` require the
   * same bearer token, so there is one private principal rather than two
   * independently-guarded doors — and no transport can be the cheap way in.
   *
   * Deliberately absent from `ConfigKey` and from `loadConfig()`. A deployment
   * without it must still serve `/health`; the absence closes the analysis
   * surfaces and nothing else. See `src/runtime/bearer-auth.ts`.
   */
  readonly ANALYSIS_AUTH_TOKEN?: string;
  /**
   * Cloudflare Rate Limiting binding for analysis, shared by every transport.
   *
   * Typed STRUCTURALLY rather than as Cloudflare's `RateLimit` global, so this
   * module stays free of Workers types and the application service can still be
   * constructed under a plain Node test project. The real binding satisfies this
   * exactly — `RateLimitOptions` is `{ key: string }` and `RateLimitOutcome` is
   * `{ success: boolean }`.
   *
   * Named without a transport prefix on purpose: REST and MCP charge the same
   * resource under the same key, so a caller cannot double the expensive-analysis
   * budget by switching protocols.
   *
   * Deliberately absent from `ConfigKey` and `loadConfig()`. Metering analysis
   * and authenticating to Warcraft Logs are different concerns, and a deployment
   * missing this binding must close the analysis paths without affecting
   * `/health`.
   */
  readonly ANALYSIS_RATE_LIMITER?: {
    limit(options: { readonly key: string }): Promise<{ readonly success: boolean }>;
  };
}

/** Placeholder substituted for credential values during serialization. */
export const REDACTED = "[redacted]";

export type ConfigKey = "WCL_CLIENT_ID" | "WCL_CLIENT_SECRET";

export interface WclCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
  /** Defence in depth: `JSON.stringify(config.wcl)` must not leak either value. */
  toJSON(): unknown;
}

export interface Config {
  readonly environment: string;
  readonly wcl: WclCredentials;
  /** Defence in depth: `JSON.stringify(config)` must not leak either value. */
  toJSON(): unknown;
}

export type ConfigResult =
  | { readonly ok: true; readonly config: Config }
  | { readonly ok: false; readonly missing: readonly ConfigKey[] };

const DEFAULT_ENVIRONMENT = "unknown";

function isPresent(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validates the Worker environment and builds a `Config`.
 *
 * A missing or blank credential is a configuration error, never a silently
 * empty string passed downstream.
 */
export function loadConfig(env: Env): ConfigResult {
  const missing: ConfigKey[] = [];

  if (!isPresent(env.WCL_CLIENT_ID)) {
    missing.push("WCL_CLIENT_ID");
  }
  if (!isPresent(env.WCL_CLIENT_SECRET)) {
    missing.push("WCL_CLIENT_SECRET");
  }

  if (missing.length > 0) {
    return { ok: false, missing };
  }

  const clientId = env.WCL_CLIENT_ID as string;
  const clientSecret = env.WCL_CLIENT_SECRET as string;

  const wcl: WclCredentials = {
    clientId,
    clientSecret,
    toJSON() {
      return { clientId: REDACTED, clientSecret: REDACTED };
    },
  };

  const environment = isPresent(env.ENVIRONMENT) ? env.ENVIRONMENT : DEFAULT_ENVIRONMENT;

  return {
    ok: true,
    config: {
      environment,
      wcl,
      toJSON() {
        return { environment, wcl: { configured: true } };
      },
    },
  };
}
