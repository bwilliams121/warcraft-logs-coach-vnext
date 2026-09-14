import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/**
 * Two projects, deliberately:
 *
 * - `node` runs unit and contract tests under a plain Node environment with no
 *   Workers runtime. These import src/services, src/config and src/wcl, so the
 *   project passing IS the proof that core logic is Cloudflare-independent and
 *   can run offline in tests and local tooling.
 *
 * - `workers` runs integration and regression tests inside real workerd via
 *   Miniflare, so "the Worker boots" and "this route returns 501" are genuine
 *   executions against the production runtime.
 *
 * Both are fully offline. No test reaches Warcraft Logs, and no test uses real
 * credentials.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["tests/unit/**/*.test.ts", "tests/contracts/**/*.test.ts"],
        },
      },
      {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: "./wrangler.jsonc" },
            // The pool defaults this to true, which makes it attempt Cloudflare
            // account authentication. We declare no remote bindings, and the
            // suite must run offline with no credentials — including in CI.
            remoteBindings: false,
            miniflare: {
              // Hard offline guard. Every outbound request from workerd is
              // answered locally, so a test that reaches Warcraft Logs by
              // accident fails deterministically instead of making a real call
              // — in CI, or on a laptop, with or without credentials.
              //
              // This is also what lets an integration test drive the REAL
              // default export through its real WCL preflight and assert that
              // an unreachable upstream fails closed.
              outboundService: () => new Response("outbound network is blocked in tests", { status: 503 }),
              // Represents a correctly CONFIGURED deployment, so SELF-driven
              // tests reach real routing rather than stopping at a
              // configuration error.
              //
              // These are obvious sentinels. No real Warcraft Logs credential
              // appears anywhere in this repository.
              //
              // Tests that verify the CONFIGURATION_ERROR path, or that sweep
              // for credential leaks, deliberately do NOT use these bindings —
              // they construct their own Env (blank, or bearing distinctive
              // leak sentinels) and drive createWorker() directly.
              bindings: {
                ENVIRONMENT: "test",
                WCL_CLIENT_ID: "fake-client-id-not-real",
                WCL_CLIENT_SECRET: "fake-client-secret-not-real",
                // INBOUND MCP authorization, unrelated to the two above. Another
                // obvious sentinel: tests that drive SELF through /mcp present
                // this value, and the credential-leak sweeps assert it never
                // appears in any response body or header.
                MCP_AUTH_TOKEN: "fake-mcp-token-not-real",
              },
            },
          }),
        ],
        test: {
          name: "workers",
          include: ["tests/integration/**/*.test.ts", "tests/regression/**/*.test.ts"],
        },
      },
    ],
  },
});
