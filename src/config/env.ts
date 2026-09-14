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
   * `MCP_AUTH_TOKEN` is INBOUND: who may call this service's MCP endpoint.
   *
   * Deliberately absent from `ConfigKey` and from `loadConfig()`. A deployment
   * without it must still serve `/health` and `/v1/analysis` normally — the
   * absence closes `/mcp` and nothing else. See `src/mcp/auth.ts`.
   */
  readonly MCP_AUTH_TOKEN?: string;
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
