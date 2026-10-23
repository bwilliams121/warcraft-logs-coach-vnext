/**
 * M11-G3-5 LOCAL/REMOTE parity (AJ–AM), restart semantics, the remote client's
 * refusal paths, startup readiness and the real-socket adapter — over the FAKE
 * engine. The REMOTE path is the real client, signing every request, driving
 * the real HTTP handler (in process, or over a loopback socket).
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { LocalSimulationBackend } from "../../../runner/local-backend.js";
import { RUNNER_SPEC_BINDINGS } from "../../../runner/spec-bindings.js";
import { FileSystemSimulationCache, type SimulationCache } from "../../../runner/service/cache.js";
import { RunnerHttpHandler } from "../../../runner/service/http.js";
import { RequestAuthenticator } from "../../../runner/service/auth.js";
import { closeServer, createRunnerServer, listen } from "../../../runner/service/server.js";
import { firstSemanticDifference, type SimulationResult } from "../../../src/simulation/result.js";
import { RUNNER_PATHS, RUNNER_PROTOCOL } from "../../../src/simulation/runner-protocol.js";
import {
  RemoteSimulationBackend,
  type RemoteRunnerOptions,
} from "../../../src/simulation-client/remote-client.js";
import {
  attestationFor,
  bytesOf,
  devJob,
  diagnosticJob,
  FAKE_ARTIFACT,
  httpService,
  inProcessFetch,
  productionJob,
  startedService,
  TEST_CAPACITY,
  TEST_KEY_ID,
  TEST_KEYS,
  TEST_SECRET,
  type HttpHarness,
} from "../../support/simulation/runner-service.js";

type Json = Record<string, any>;

const DIRS: string[] = [];
const scratch = () => {
  const dir = mkdtempSync(join(tmpdir(), "wlc-g35-parity-"));
  DIRS.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of DIRS) rmSync(dir, { recursive: true, force: true });
});

const remote = (fetchImpl: typeof fetch, overrides: Partial<RemoteRunnerOptions> = {}) =>
  new RemoteSimulationBackend({
    baseUrl: "https://runner.test.invalid",
    keyId: TEST_KEY_ID,
    secret: TEST_SECRET,
    artifact: FAKE_ARTIFACT,
    bindings: RUNNER_SPEC_BINDINGS,
    pollIntervalMs: 5,
    deadlineMs: 20_000,
    maxResubmits: 2,
    fetch: fetchImpl,
    ...overrides,
  });

const pair = async (options: Parameters<typeof httpService>[0] = {}) => {
  const h = await httpService(options);
  const local = new LocalSimulationBackend(h.service, FAKE_ARTIFACT, RUNNER_SPEC_BINDINGS);
  const seen: { method: string; path: string }[] = [];
  return { h, local, remote: remote(inProcessFetch(() => h.handler, seen)), seen };
};

const productionReadiness = async (job: Json) => await attestationFor(job);

describe("M11-G3-5 LOCAL / REMOTE parity (AJ–AM)", () => {
  it("AJ. both backends return a compatible (semantically identical) result for the same job", async () => {
    const a = await pair();
    const b = await pair();
    const local = await a.local.simulate({ job: devJob() });
    const viaHttp = await b.remote.simulate({ job: devJob() });
    expect(local.outcome.ok && viaHttp.outcome.ok).toBe(true);
    if (!local.outcome.ok || !viaHttp.outcome.ok) return;
    expect(firstSemanticDifference(local.outcome.value, viaHttp.outcome.value, 0)).toBeNull();
    expect([local.backend, viaHttp.backend]).toEqual(["LOCAL", "REMOTE"]);
    expect(local.served).toEqual(viaHttp.served);
    expect(b.seen.map((request) => request.method)[0]).toBe("POST");
  });

  it("AK. both backends return identical provenance (model, artifact, hashes, execution profile, policy, parser)", async () => {
    const a = await pair();
    const b = await pair();
    const job = productionJob();
    const readiness = await productionReadiness(job);
    const local = await a.local.simulate({ job, readiness });
    const viaHttp = await b.remote.simulate({ job, readiness });
    if (!local.outcome.ok || !viaHttp.outcome.ok) throw new Error("run failed");
    const identity = (result: SimulationResult) => ({
      model: result.model,
      profileHash: result.profileHash,
      environmentHash: result.environmentHash,
      executionProfile: result.executionProfile,
      simulationPolicy: result.simulationPolicy,
      iterations: result.iterations,
      provenance: result.provenance,
    });
    expect(identity(viaHttp.outcome.value)).toEqual(identity(local.outcome.value));
    expect(viaHttp.served).toMatchObject({ jobClass: "PRODUCTION", publishable: true });
    expect(local.served).toMatchObject({ jobClass: "PRODUCTION", publishable: true });
  });

  it("AL. a remote cache hit is served as HIT with the same result", async () => {
    const p = await pair();
    const first = await p.remote.simulate({ job: devJob() });
    const second = await p.remote.simulate({ job: devJob() });
    expect([first.served?.cacheStatus, second.served?.cacheStatus]).toEqual(["MISS", "HIT"]);
    if (!first.outcome.ok || !second.outcome.ok) throw new Error("run failed");
    expect(firstSemanticDifference(first.outcome.value, second.outcome.value, 0)).toBeNull();
    expect(p.seen.filter((request) => request.method === "POST")).toHaveLength(2);
    expect(p.h.launcher.launches).toBe(2); // self-test + one run
  });

  it("AM. failures are identical on both backends", async () => {
    const cases: [string, () => Promise<{ job: Json; readiness?: Json }>, string | undefined][] = [
      [
        "unsupported spec",
        async () => ({
          job: { ...devJob(), character: { ...devJob().character, spec: "paladin/protection" } },
        }),
        undefined,
      ],
      [
        "arbitrary model",
        async () => ({ job: { ...devJob(), model: { ...devJob().model, simcCommit: "f".repeat(40) } } }),
        undefined,
      ],
      [
        "blocked production",
        async () => ({
          job: productionJob(),
          readiness: await attestationFor(productionJob(), (a) => (a.environment.status = "BLOCKED")),
        }),
        undefined,
      ],
      ["engine failure", async () => ({ job: devJob(7) }), "exit-nonzero"],
      ["zero dps", async () => ({ job: devJob(8) }), "zero-dps"],
      ["wrong revision", async () => ({ job: devJob(9) }), "wrong-revision"],
      ["no output", async () => ({ job: devJob(10) }), "no-output"],
    ];
    for (const [name, make, mode] of cases) {
      const a = await pair();
      const b = await pair();
      if (mode !== undefined) {
        a.h.launcher.mode = mode;
        b.h.launcher.mode = mode;
      }
      const request = (await make()) as never;
      const [local, viaHttp] = [await a.local.simulate(request), await b.remote.simulate(request)];
      expect(local.outcome.ok, name).toBe(false);
      expect(viaHttp.outcome.ok, name).toBe(false);
      if (local.outcome.ok || viaHttp.outcome.ok) continue;
      expect(viaHttp.outcome.failure.code, name).toBe(local.outcome.failure.code);
      expect(viaHttp.transport, name).toBeUndefined();
    }
  });
});

describe("M11-G3-5 restart (non-durable queue, durable cache)", () => {
  // The self-test always runs healthy; `mode` applies to the jobs after startup.
  const restartable = async (cacheDir: string, mode = "ok") => {
    const cache: SimulationCache = new FileSystemSimulationCache(cacheDir);
    const h = await httpService({ cache });
    h.launcher.mode = mode;
    return h;
  };

  it("a finished job survives a restart through the cache; a lost ticket is re-submitted and served HIT with the same result", async () => {
    const dir = scratch();
    let current: HttpHarness = await restartable(dir);
    const before = await remote(inProcessFetch(() => current.handler)).simulate({ job: devJob() });
    if (!before.outcome.ok) throw new Error("run failed");

    // Ticket issued, runner restarts before the client polls.
    const submitted = await current.service.submit({ job: devJob(), rawByteLength: bytesOf(devJob()) });
    expect(submitted.accepted).toBe(true);
    await current.service.shutdown(0);
    current = await restartable(dir);
    const seen: { method: string; path: string }[] = [];
    const after = await remote(inProcessFetch(() => current.handler, seen)).simulate({ job: devJob() });
    expect(after.served?.cacheStatus).toBe("HIT");
    if (!after.outcome.ok) throw new Error("run failed");
    expect(firstSemanticDifference(before.outcome.value, after.outcome.value, 0)).toBeNull();
  });

  it("a job lost mid-run is re-run after the restart to the same key and the same result as a cold run", async () => {
    const dir = scratch();
    let current: HttpHarness = await restartable(dir, "hang");
    const seen: { method: string; path: string }[] = [];
    let polls = 0;
    const fetchImpl = inProcessFetch(() => current.handler, seen);
    const restarting: typeof fetch = async (input, init) => {
      if ((init?.method ?? "GET") === "GET" && (polls += 1) === 2) {
        await current.service.shutdown(0); // kills the hung engine
        current = await restartable(dir, "ok");
      }
      return await fetchImpl(input, init);
    };
    const run = await remote(restarting).simulate({ job: devJob(4) });
    expect(run.outcome.ok).toBe(true);
    expect(run.served?.cacheStatus).toBe("MISS");
    expect(seen.filter((request) => request.method === "POST")).toHaveLength(2);
    const cold = await (await pair()).remote.simulate({ job: devJob(4) });
    if (!run.outcome.ok || !cold.outcome.ok) throw new Error("run failed");
    expect(run.served?.cacheKey).toBe(cold.served?.cacheKey);
    expect(firstSemanticDifference(run.outcome.value, cold.outcome.value, 0)).toBeNull();
  });

  it("re-submission is bounded: a runner that keeps losing tickets ends RUNNER_UNAVAILABLE / TICKET_LOST", async () => {
    const h = await httpService();
    h.launcher.mode = "hang";
    const forgetful: typeof fetch = async (input, init) => {
      if ((init?.method ?? "GET") === "GET")
        return new Response(JSON.stringify({ error: { code: "NOT_FOUND" } }), { status: 404 });
      return await inProcessFetch(() => h.handler)(input, init);
    };
    const run = await remote(forgetful, { maxResubmits: 2 }).simulate({ job: devJob() });
    expect(run).toMatchObject({
      outcome: { ok: false, failure: { code: "RUNNER_UNAVAILABLE" } },
      transport: "TICKET_LOST",
    });
    await h.service.shutdown(0);
  });
});

describe("M11-G3-5 remote client refuses what it cannot verify", () => {
  const tamperedFetch = (h: HttpHarness, tamper: (ticket: Json) => void): typeof fetch => {
    const inner = inProcessFetch(() => h.handler);
    return async (input, init) => {
      const response = await inner(input, init);
      const body = (await response.json()) as Json;
      if (body.status === "SUCCEEDED") tamper(body);
      return new Response(JSON.stringify(body), { status: response.status });
    };
  };

  it("a malformed or foreign result is refused with a typed failure, never accepted", async () => {
    const tamperings: [string, (ticket: Json) => void, string][] = [
      ["zero dps", (t) => (t.result.dps.mean = 0), "SIMULATION_OUTPUT_MALFORMED"],
      ["missing dps", (t) => delete t.result.dps, "SIMULATION_OUTPUT_MALFORMED"],
      ["extra field", (t) => (t.result.note = "x"), "SIMULATION_OUTPUT_MALFORMED"],
      ["wrong binary", (t) => (t.result.model.binarySha256 = "e".repeat(64)), "MODEL_PROVENANCE_MISMATCH"],
      [
        "wrong model",
        (t) => (t.result.model.requestedSimcCommit = "a".repeat(40)),
        "MODEL_PROVENANCE_MISMATCH",
      ],
      ["wrong profile hash", (t) => (t.result.profileHash = "b".repeat(64)), "MODEL_PROVENANCE_MISMATCH"],
      [
        "wrong environment hash",
        (t) => (t.result.environmentHash = "c".repeat(64)),
        "MODEL_PROVENANCE_MISMATCH",
      ],
      [
        "wrong execution revision",
        (t) => (t.result.executionProfile.revision = "d".repeat(64)),
        "MODEL_PROVENANCE_MISMATCH",
      ],
      [
        "wrong policy",
        (t) => (t.result.simulationPolicy.id = "PRECISION_ESCALATED_V1"),
        "MODEL_PROVENANCE_MISMATCH",
      ],
      ["wrong parser", (t) => (t.result.provenance.parserRevision = "X"), "MODEL_PROVENANCE_MISMATCH"],
      ["imprecise", (t) => (t.result.dps.relativeStandardError = 0.5), "SIMULATION_PRECISION_NOT_MET"],
      [
        "promoted class",
        (t) => ((t.jobClass = "PRODUCTION"), (t.publishable = true)),
        "MODEL_PROVENANCE_MISMATCH",
      ],
      ["publishable dev", (t) => (t.publishable = true), "MODEL_PROVENANCE_MISMATCH"],
      ["other key", (t) => (t.cacheKey = "f".repeat(64)), "MODEL_PROVENANCE_MISMATCH"],
      [
        "result and failure",
        (t) => (t.failure = { code: "CANCELLED", detail: "x" }),
        "SIMULATION_OUTPUT_MALFORMED",
      ],
      ["ticket shape", (t) => (t.status = "DONE"), "SIMULATION_OUTPUT_MALFORMED"],
    ];
    for (const [name, tamper, code] of tamperings) {
      const h = await httpService();
      const run = await remote(tamperedFetch(h, tamper)).simulate({ job: devJob() });
      expect(run.outcome, name).toMatchObject({ ok: false, failure: { code } });
      expect(run.transport, name).toBe("BAD_RESPONSE");
    }
  });

  it("a diagnostic result stays non-publishable through the client", async () => {
    const p = await pair();
    const run = await p.remote.simulate({ job: diagnosticJob() });
    expect(run.outcome.ok).toBe(true);
    expect(run.served).toMatchObject({ jobClass: "DIAGNOSTIC", publishable: false });
  });

  it("transport failures keep typed codes and say where they arose", async () => {
    const h = await httpService();
    const down: typeof fetch = async () => {
      throw new TypeError("connect ECONNREFUSED");
    };
    expect(await remote(down).simulate({ job: devJob() })).toMatchObject({
      outcome: { ok: false, failure: { code: "RUNNER_UNAVAILABLE" } },
      transport: "NETWORK",
    });
    const wrongKey = remote(
      inProcessFetch(() => h.handler),
      { secret: new TextEncoder().encode("TEST-ONLY-wrong-secret-xxxxxxxxxxxxxxxx") },
    );
    const refused = await wrongKey.simulate({ job: devJob() });
    expect(refused).toMatchObject({
      outcome: { ok: false, failure: { code: "RUNNER_UNAVAILABLE" } },
      transport: "AUTH_REJECTED",
    });
    expect(JSON.stringify(refused)).not.toContain("TEST-ONLY");
    const html: typeof fetch = async () => new Response("<html>bad gateway</html>", { status: 502 });
    expect(await remote(html).simulate({ job: devJob() })).toMatchObject({
      outcome: { ok: false, failure: { code: "SIMULATION_OUTPUT_MALFORMED" } },
      transport: "BAD_RESPONSE",
    });
    // A job the runner would refuse is refused locally, without a request.
    const seen: { method: string; path: string }[] = [];
    const local = await remote(inProcessFetch(() => h.handler, seen)).simulate({
      job: { ...devJob(), executionProfileId: "MY_PROFILE" },
    });
    expect(local.outcome).toMatchObject({ ok: false, failure: { code: "JOB_REJECTED" } });
    expect(seen).toEqual([]);
  });

  it("the client deadline cancels the remote job (signed DELETE) and reports SIMULATION_TIMEOUT, never a partial result", async () => {
    const h = await httpService();
    h.launcher.mode = "hang";
    const seen: { method: string; path: string }[] = [];
    let now = 0;
    const run = await remote(
      inProcessFetch(() => h.handler, seen),
      {
        deadlineMs: 50,
        clock: () => Date.now() + now,
        sleep: async () => {
          now += 30;
        },
      },
    ).simulate({ job: devJob() });
    expect(run).toMatchObject({
      outcome: { ok: false, failure: { code: "SIMULATION_TIMEOUT" } },
      transport: "CLIENT_DEADLINE",
    });
    expect(seen.at(-1)?.method).toBe("DELETE");
    // The ticket is CANCELLED at once; the execution settles when the killed engine exits.
    for (let waited = 0; h.service.liveExecutions > 0 && waited < 10_000; waited += 20) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(h.service.liveExecutions).toBe(0);
    const aborted = new AbortController();
    aborted.abort();
    const cancelled = await remote(inProcessFetch(() => h.handler, seen)).simulate(
      { job: devJob(1) },
      aborted.signal,
    );
    expect(cancelled.outcome).toMatchObject({ ok: false, failure: { code: "CANCELLED" } });
    expect(seen.at(-1)?.method).toBe("DELETE");
    await h.service.shutdown(0);
  });
});

describe("M11-G3-5 readiness and startup verification", () => {
  it("READY only after the startup self-test passes; liveness answers regardless", async () => {
    const pending = await httpService({ start: false });
    const live = await pending.handler.handle({
      method: "GET",
      target: RUNNER_PATHS.liveness,
      headers: {},
      body: new Uint8Array(0),
    });
    const ready = await pending.handler.handle({
      method: "GET",
      target: RUNNER_PATHS.readiness,
      headers: {},
      body: new Uint8Array(0),
    });
    expect([live.status, ready.status]).toEqual([200, 503]);
    expect((ready.body as Json).checks.startupVerification).toBe("PENDING");
    await pending.service.start();
    const now = await pending.handler.handle({
      method: "GET",
      target: RUNNER_PATHS.readiness,
      headers: {},
      body: new Uint8Array(0),
    });
    expect(now.status).toBe(200);
    expect(JSON.stringify(now.body)).not.toMatch(/detail/);
  });

  it("a bad engine, a wrong artifact, a wrong model revision, an oversized capacity or an unwritable cache keeps the runner NOT READY", async () => {
    const cases: [string, Parameters<typeof startedService>[0], RegExp][] = [
      ["bad image / engine fails", { mode: "exit-nonzero" }, /SIMULATION_ENGINE_FAILED/],
      [
        "engine produces nothing",
        { mode: "no-output" },
        /SIMULATION_OUTPUT_MALFORMED|SIMULATION_ENGINE_FAILED/,
      ],
      [
        "wrong artifact hash",
        { artifact: { ...FAKE_ARTIFACT, binarySha256: "9".repeat(64) } },
        /MODEL_PROVENANCE_MISMATCH/,
      ],
      ["wrong model revision", { mode: "wrong-revision" }, /MODEL_PROVENANCE_MISMATCH/],
      ["capacity beyond host", { hostLogicalCpu: 8 }, /declares 16 logical CPUs; this host has 8/],
      ["oversubscribed", { capacity: { ...TEST_CAPACITY, logicalCpu: 8 } }, /oversubscribed/],
    ];
    for (const [name, options, detail] of cases) {
      const h = await startedService(options);
      const readiness = h.service.readiness();
      expect(readiness.ready, name).toBe(false);
      expect(readiness.detail.join(" | "), name).toMatch(detail);
      const refused = await h.service.submit({ job: devJob(), rawByteLength: bytesOf(devJob()) });
      expect(refused.accepted ? "ACCEPTED" : refused.rejected.failure.code, name).toBe("RUNNER_UNAVAILABLE");
    }
    const file = join(scratch(), "not-a-dir");
    (await import("node:fs")).writeFileSync(file, "x", "utf8");
    const unwritable = await startedService({ cache: new FileSystemSimulationCache(join(file, "cache")) });
    expect(unwritable.service.readiness()).toMatchObject({ ready: false, checks: { cache: "INVALID" } });
  });
});

describe("M11-G3-5 node:http adapter", () => {
  it("serves the signed protocol over a loopback socket and refuses an oversized body without buffering it", async () => {
    const h = await startedService();
    const handler = new RunnerHttpHandler(h.service, new RequestAuthenticator(TEST_KEYS));
    const server = createRunnerServer(handler);
    const port = await listen(server, 0, "127.0.0.1");
    try {
      const base = `http://127.0.0.1:${String(port)}`;
      const run = await remote(fetch, { baseUrl: base }).simulate({ job: devJob() });
      expect(run.outcome.ok).toBe(true);
      const big = await fetch(`${base}${RUNNER_PATHS.simulations}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ protocol: RUNNER_PROTOCOL, job: "x".repeat(300 * 1024) }),
      });
      expect(big.status).toBe(413);
      expect(((await big.json()) as Json).error.code).toBe("PAYLOAD_TOO_LARGE");
      const unauth = await fetch(`${base}${RUNNER_PATHS.metrics}`);
      expect(unauth.status).toBe(401);
      expect(unauth.headers.get("cache-control")).toBe("no-store");
      expect((await fetch(`${base}${RUNNER_PATHS.liveness}`)).status).toBe(200);
    } finally {
      await closeServer(server);
    }
  });
});
