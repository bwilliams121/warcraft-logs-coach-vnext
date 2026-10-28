/**
 * M11-G3-5: the REMOTE simulation client inside real workerd.
 *
 * Proves the Worker-side half runs on the production runtime: WebCrypto
 * signing verifies against the runner's authenticator, and the refusal paths
 * (malformed result, foreign provenance, auth rejection, client deadline) end
 * in typed failures. The runner itself is Node-only, so its replies here are
 * scripted; acceptance of a genuine result is proven in the node project
 * (tests/unit/simulation/runner-service-parity.test.ts). No request leaves
 * workerd: `fetch` is injected, and outbound is blocked by configuration.
 *
 * Nothing here is wired into a Worker route — G3-5 exposes no public
 * simulation endpoint.
 */

import { describe, expect, it } from "vitest";

import { RequestAuthenticator } from "../../runner/service/auth.js";
import { RUNNER_SPEC_BINDINGS } from "../../runner/spec-bindings.js";
import { prepareSimulation } from "../../src/simulation/prepare.js";
import {
  RUNNER_PATHS,
  RUNNER_PROTOCOL,
  RUNNER_SERVICE_REVISION,
} from "../../src/simulation/runner-protocol.js";
import { decodeRunnerSecret, RemoteSimulationBackend } from "../../src/simulation-client/remote-client.js";
import {
  DEV_SIMULATION_MODEL_ID,
  devBloodJob,
  jsonBytes,
  modelPin,
} from "../support/simulation/dev-blood-job.js";

type Json = Record<string, any>;

const SECRET_B64 = btoa("TEST-ONLY-workers-runner-hmac-key-not-a-secret");
const SECRET = decodeRunnerSecret(SECRET_B64);
const ARTIFACT = {
  model: modelPin(DEV_SIMULATION_MODEL_ID),
  binarySha256: "0".repeat(64),
  buildRecipeRevision: "test-recipe",
} as const;
const JOB = devBloodJob("STANDARD_SIM_V1", "ELITE_REALISTIC_V1");

const client = (fetchImpl: typeof fetch, overrides: Json = {}) =>
  new RemoteSimulationBackend({
    baseUrl: "https://runner.test.invalid",
    keyId: "worker-1",
    secret: SECRET,
    artifacts: [ARTIFACT],
    bindings: RUNNER_SPEC_BINDINGS,
    pollIntervalMs: 1,
    deadlineMs: 10_000,
    maxResubmits: 1,
    fetch: fetchImpl,
    ...overrides,
  });

const ticket = async (overrides: Json) => {
  const prepared = await prepareSimulation(JOB, jsonBytes(JOB), ARTIFACT, RUNNER_SPEC_BINDINGS);
  if (!prepared.ok) throw new Error(prepared.failure.detail);
  return {
    protocol: RUNNER_PROTOCOL,
    serviceRevision: RUNNER_SERVICE_REVISION,
    jobId: "00000000-0000-4000-8000-000000000001",
    status: "QUEUED",
    jobClass: "DEVELOPMENT",
    publishable: false,
    cacheStatus: "MISS",
    cacheKey: prepared.value.keys.parsedResultKey,
    ...overrides,
  };
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe("M11-G3-5 remote simulation client in workerd", () => {
  it("signs requests that the runner's authenticator verifies (WebCrypto HMAC in workerd)", async () => {
    const authenticator = new RequestAuthenticator(new Map([["worker-1", SECRET]]));
    const verdicts: unknown[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
      const body = (init?.body as Uint8Array | undefined) ?? new Uint8Array(0);
      verdicts.push(
        await authenticator.authenticate({
          method: init?.method ?? "GET",
          path: url.pathname,
          headers,
          body,
        }),
      );
      return json(
        200,
        await ticket({ status: "FAILED", failure: { code: "SIMULATION_ENGINE_FAILED", detail: "scripted" } }),
      );
    };
    const run = await client(fetchImpl).simulate({ job: JOB });
    expect(verdicts).toEqual([{ ok: true, keyId: "worker-1" }]);
    expect(run.outcome).toMatchObject({ ok: false, failure: { code: "SIMULATION_ENGINE_FAILED" } });
  });

  it("refuses a malformed or foreign SUCCEEDED ticket — HTTP 200 is not trust", async () => {
    for (const [result, code] of [
      [{ dps: { mean: 1 } }, "SIMULATION_OUTPUT_MALFORMED"],
      [undefined, "SIMULATION_OUTPUT_MALFORMED"],
    ] as const) {
      const run = await client(async () =>
        json(200, await ticket({ status: "SUCCEEDED", ...(result === undefined ? {} : { result }) })),
      ).simulate({
        job: JOB,
      });
      expect(run).toMatchObject({ outcome: { ok: false, failure: { code } }, transport: "BAD_RESPONSE" });
    }
    const promoted = await client(async () =>
      json(
        200,
        await ticket({
          status: "FAILED",
          jobClass: "PRODUCTION",
          publishable: true,
          failure: { code: "SIMULATION_TIMEOUT", detail: "x" },
        }),
      ),
    ).simulate({ job: JOB });
    expect(promoted).toMatchObject({
      outcome: { ok: false, failure: { code: "MODEL_PROVENANCE_MISMATCH" } },
      transport: "BAD_RESPONSE",
    });
  });

  it("maps auth rejection and an unreachable runner to typed failures without echoing the secret", async () => {
    const refused = await client(async () => json(401, { error: { code: "AUTH_REJECTED" } })).simulate({
      job: JOB,
    });
    expect(refused).toMatchObject({
      outcome: { ok: false, failure: { code: "RUNNER_UNAVAILABLE" } },
      transport: "AUTH_REJECTED",
    });
    expect(JSON.stringify(refused)).not.toContain(SECRET_B64);
    // The default fetch goes nowhere in tests: outbound is blocked (503 non-JSON-protocol body).
    const blocked = await client(fetch).simulate({ job: JOB });
    expect(blocked.outcome.ok).toBe(false);
    expect(JSON.stringify(blocked)).not.toContain(SECRET_B64);
  });

  it("past the deadline it sends a signed DELETE and reports SIMULATION_TIMEOUT", async () => {
    const methods: string[] = [];
    let now = 0;
    const run = await client(
      async (input, init) => {
        methods.push(`${init?.method ?? "GET"} ${new URL(String(input)).pathname}`);
        return json(init?.method === "POST" ? 202 : 200, await ticket({ status: "RUNNING" }));
      },
      { deadlineMs: 10, clock: () => now, sleep: async () => void (now += 6) },
    ).simulate({ job: JOB });
    expect(run).toMatchObject({
      outcome: { ok: false, failure: { code: "SIMULATION_TIMEOUT" } },
      transport: "CLIENT_DEADLINE",
    });
    expect(methods.at(-1)).toBe(`DELETE ${RUNNER_PATHS.simulation("00000000-0000-4000-8000-000000000001")}`);
  });
});
