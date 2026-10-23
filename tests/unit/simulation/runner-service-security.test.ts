/**
 * M11-G3-5 security: the private runner's HTTP boundary and submission policy
 * (tests A–O), over the FAKE engine. Every refusal happens before an engine
 * process starts (`launcher.launches` stays 0) and is a typed failure.
 */

import { describe, expect, it } from "vitest";

import { parseKeyRing, RequestAuthenticator } from "../../../runner/service/auth.js";
import { MemorySimulationCache } from "../../../runner/service/cache.js";
import { prepareSimulation } from "../../../src/simulation/prepare.js";
import { RUNNER_SPEC_BINDINGS } from "../../../runner/spec-bindings.js";
import { RUNNER_PATHS, RUNNER_PROTOCOL, signRunnerRequest } from "../../../src/simulation/runner-protocol.js";
import {
  attestationFor,
  bytesOf,
  devJob,
  diagnosticJob,
  FAKE_ARTIFACT,
  httpService,
  productionJob,
  settle,
  signedRequest,
  TEST_KEY_ID,
  TEST_KEY_ID_2,
  TEST_SECRET,
  TEST_SECRET_2,
} from "../../support/simulation/runner-service.js";

type Json = Record<string, any>;

const submitBody = (job: unknown, readiness?: unknown) => ({
  protocol: RUNNER_PROTOCOL,
  job,
  ...(readiness === undefined ? {} : { readiness }),
});

const keysFor = async (job: Json) => {
  const prepared = await prepareSimulation(job, bytesOf(job), FAKE_ARTIFACT, RUNNER_SPEC_BINDINGS);
  if (!prepared.ok) throw new Error(prepared.failure.detail);
  return prepared.value.keys;
};

const codeOf = (response: { body: unknown }) => {
  const body = response.body as Json;
  return body.failure?.code ?? body.error?.code;
};

describe("M11-G3-5 security: authentication (A–D)", () => {
  it("A. an unauthenticated request is refused before the service sees it", async () => {
    const h = await httpService();
    for (const [method, target] of [
      ["POST", RUNNER_PATHS.simulations],
      ["GET", RUNNER_PATHS.metrics],
      ["GET", RUNNER_PATHS.simulation("00000000-0000-4000-8000-000000000000")],
      ["DELETE", RUNNER_PATHS.simulation("00000000-0000-4000-8000-000000000000")],
    ] as const) {
      const body = new TextEncoder().encode(JSON.stringify(submitBody(devJob())));
      const response = await h.handler.handle({ method, target, headers: {}, body });
      expect(response.status, `${method} ${target}`).toBe(401);
      expect(codeOf(response)).toBe("AUTH_REJECTED");
    }
    expect(h.service.metrics().counters.submitted).toBeUndefined();
    expect(h.launcher.launches).toBe(1); // the startup self-test only
    expect(h.httpEvents.every((event) => event.reason === "MISSING_HEADERS")).toBe(true);
  });

  it("B. invalid authentication: wrong secret, unknown key, tampered body, other path, malformed signature", async () => {
    const h = await httpService();
    const body = submitBody(devJob());
    const wrongSecret = await signedRequest("POST", RUNNER_PATHS.simulations, body, {
      secret: new TextEncoder().encode("TEST-ONLY-wrong-secret-xxxxxxxxxxxxxxxx"),
    });
    const unknownKey = await signedRequest("POST", RUNNER_PATHS.simulations, body, {
      keyId: "nobody",
      secret: TEST_SECRET,
    });
    const tampered = await signedRequest("POST", RUNNER_PATHS.simulations, body);
    const tamperedBody = {
      ...tampered,
      body: new TextEncoder().encode(JSON.stringify(submitBody(devJob(1)))),
    };
    const otherPath = await signedRequest("GET", RUNNER_PATHS.metrics, undefined);
    const redirected = {
      ...otherPath,
      target: RUNNER_PATHS.simulation("00000000-0000-4000-8000-000000000000"),
    };
    const malformed = await signedRequest("GET", RUNNER_PATHS.metrics, undefined);
    malformed.headers["x-wlc-signature"] = "zz";
    const cases = [wrongSecret, unknownKey, tamperedBody, redirected, malformed];
    for (const request of cases) expect((await h.handler.handle(request)).status).toBe(401);
    expect(h.httpEvents.map((event) => event.reason)).toEqual([
      "BAD_SIGNATURE",
      "UNKNOWN_KEY",
      "BAD_SIGNATURE",
      "BAD_SIGNATURE",
      "MALFORMED_HEADERS",
    ]);
    expect(h.service.metrics().counters.submitted).toBeUndefined();
  });

  it("C. an expired, future-dated or replayed request is refused; rotation accepts both keys and revocation removes one", async () => {
    const h = await httpService({
      keys: new Map([
        [TEST_KEY_ID, TEST_SECRET],
        [TEST_KEY_ID_2, TEST_SECRET_2],
      ]),
    });
    const expired = await signedRequest("GET", RUNNER_PATHS.metrics, undefined, {
      timestampMs: Date.now() - 301_000,
    });
    const future = await signedRequest("GET", RUNNER_PATHS.metrics, undefined, {
      timestampMs: Date.now() + 301_000,
    });
    expect((await h.handler.handle(expired)).status).toBe(401);
    expect((await h.handler.handle(future)).status).toBe(401);
    const once = await signedRequest("GET", RUNNER_PATHS.metrics, undefined);
    expect((await h.handler.handle(once)).status).toBe(200);
    expect((await h.handler.handle(once)).status).toBe(401);
    expect(h.httpEvents.map((event) => event.reason)).toEqual([
      "STALE_TIMESTAMP",
      "STALE_TIMESTAMP",
      "REPLAYED_NONCE",
    ]);

    const second = await signedRequest("GET", RUNNER_PATHS.metrics, undefined, {
      keyId: TEST_KEY_ID_2,
      secret: TEST_SECRET_2,
    });
    expect((await h.handler.handle(second)).status).toBe(200);
    const revoked = new RequestAuthenticator(new Map([[TEST_KEY_ID_2, TEST_SECRET_2]]));
    const old = await signedRequest("GET", RUNNER_PATHS.metrics, undefined);
    expect(
      await revoked.authenticate({ method: "GET", path: old.target, headers: old.headers, body: old.body }),
    ).toEqual({
      ok: false,
      reason: "UNKNOWN_KEY",
    });
  });

  it("C. the nonce store is bounded: when full it refuses (never forgets a live nonce), and frees after the window", async () => {
    let now = 5_000_000;
    const auth = new RequestAuthenticator(
      new Map([[TEST_KEY_ID, TEST_SECRET]]),
      { toleranceMs: 1_000, maxNonces: 2 },
      () => now,
    );
    const request = async () => {
      const signed = await signedRequest("GET", RUNNER_PATHS.metrics, undefined, { timestampMs: now });
      return await auth.authenticate({
        method: "GET",
        path: signed.target,
        headers: signed.headers,
        body: signed.body,
      });
    };
    expect((await request()).ok).toBe(true);
    expect((await request()).ok).toBe(true);
    expect(await request()).toEqual({ ok: false, reason: "NONCE_STORE_FULL" });
    now += 2_001;
    expect((await request()).ok).toBe(true);
    expect(auth.rememberedNonces).toBe(1);
  });

  it("D. no secret, signature, nonce or job content reaches a log line or a response", async () => {
    const h = await httpService();
    const request = await signedRequest("POST", RUNNER_PATHS.simulations, submitBody(devJob()));
    const accepted = await h.handler.handle(request);
    await h.service.waitFor((accepted.body as Json).jobId);
    const bad = await signedRequest("POST", RUNNER_PATHS.simulations, submitBody(devJob()), {
      secret: new TextEncoder().encode("TEST-ONLY-wrong-secret-xxxxxxxxxxxxxxxx"),
    });
    const refused = await h.handler.handle(bad);
    const logged = JSON.stringify([h.events, h.httpEvents]);
    const answered = JSON.stringify([accepted.body, refused.body]);
    const secretText = new TextDecoder().decode(TEST_SECRET);
    const secretB64 = btoa(secretText);
    for (const text of [logged, answered]) {
      expect(text).not.toContain(secretText);
      expect(text).not.toContain(secretB64);
      expect(text).not.toContain(request.headers["x-wlc-signature"] ?? "<none>");
      expect(text).not.toContain(bad.headers["x-wlc-signature"] ?? "<none>");
    }
    expect(logged).not.toContain(request.headers["x-wlc-nonce"] ?? "<none>");
    // No job content in logs: no talent string, item id or consumable name.
    expect(logged).not.toMatch(/CoPAAAA|271474|draught_of_rampant_abandon/);
    // A malformed key ring names the problem, never the material.
    let message = "";
    try {
      parseKeyRing(`${TEST_KEY_ID}:${btoa("short")}`);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/shorter than 32 bytes/);
    expect(message).not.toContain(btoa("short"));
  });
});

describe("M11-G3-5 security: what a caller can ask for (E–L)", () => {
  const submit = async (h: Awaited<ReturnType<typeof httpService>>, body: unknown) =>
    await h.handler.handle(await signedRequest("POST", RUNNER_PATHS.simulations, body));

  it("E. raw SimC text is not accepted — not as the job, not beside it, not inside it", async () => {
    const h = await httpService();
    const raw = "deathknight=x\nspec=blood\nactions=heart_strike\n";
    expect(codeOf(await submit(h, submitBody(raw)))).toBe("JOB_REJECTED");
    expect((await submit(h, { ...submitBody(devJob()), input: raw })).status).toBe(400);
    expect(codeOf(await submit(h, submitBody({ ...devJob(), simcInput: raw })))).toBe("JOB_REJECTED");
    const injected = devJob();
    injected.character.consumables.potion = "x\nactions=heart_strike";
    expect(codeOf(await submit(h, submitBody(injected)))).toBe("JOB_REJECTED");
    expect(h.launcher.launches).toBe(1);
  });

  it("F. an arbitrary model is refused", async () => {
    const h = await httpService();
    const job = devJob();
    job.model.simcCommit = "f".repeat(40);
    const response = await submit(h, submitBody(job));
    expect(response.status).toBe(422);
    expect(codeOf(response)).toBe("UNSUPPORTED_MODEL_VERSION");
    const data = devJob();
    data.model.gameDataBuild = "12.0.0.1";
    expect(codeOf(await submit(h, submitBody(data)))).toBe("UNSUPPORTED_MODEL_VERSION");
    expect(h.launcher.launches).toBe(1);
  });

  it("G. an arbitrary or non-allowlisted execution profile is refused", async () => {
    const h = await httpService();
    const unknown = devJob();
    unknown.executionProfileId = "MY_PROFILE";
    expect(codeOf(await submit(h, submitBody(unknown)))).toBe("JOB_REJECTED");
    const pinned = devJob();
    pinned.executionProfileId = "SIMC_DEFAULT_PINNED";
    const response = await submit(h, submitBody(pinned));
    expect(codeOf(response)).toBe("JOB_REJECTED");
    expect((response.body as Json).failure.detail).toMatch(/not allowed for DEVELOPMENT/);
    expect(h.launcher.launches).toBe(1);
  });

  it("H. an arbitrary or non-allowlisted policy is refused (BENCHMARK and FIDELITY policies are not caller policies)", async () => {
    const h = await httpService();
    expect(codeOf(await submit(h, submitBody(devJob(0, "BENCHMARK_300_T1"))))).toBe("JOB_REJECTED");
    const fidelity = devJob();
    fidelity.simulationPolicy = { ...devJob(0, "FIDELITY_PROBE_V1").simulationPolicy };
    expect(codeOf(await submit(h, submitBody(fidelity)))).toBe("JOB_REJECTED");
    const invented = devJob();
    invented.simulationPolicy.policyId = "MY_POLICY";
    expect(codeOf(await submit(h, submitBody(invented)))).toBe("JOB_REJECTED");
    expect(h.launcher.launches).toBe(1);
  });

  it("I. iterations cannot be raised (registry mismatch, schema cap)", async () => {
    const h = await httpService();
    for (const iterations of [2_001, 20_000, 20_001, 1_000_000]) {
      const job = devJob();
      job.simulationPolicy.iterations = iterations;
      expect(codeOf(await submit(h, submitBody(job))), String(iterations)).toBe("JOB_REJECTED");
    }
    expect(h.launcher.launches).toBe(1);
  });

  it("J. threads cannot be raised; a runner whose capacity allows fewer threads than a policy refuses it", async () => {
    const h = await httpService();
    for (const threads of [9, 16, 64]) {
      const job = devJob();
      job.simulationPolicy.threads = threads;
      expect(codeOf(await submit(h, submitBody(job))), String(threads)).toBe("JOB_REJECTED");
    }
    const small = await httpService({
      capacity: {
        ...(await import("../../support/simulation/runner-service.js")).TEST_CAPACITY,
        threadsPerJob: 4,
        logicalCpu: 8,
      },
    });
    const response = await submit(small, submitBody(devJob()));
    expect(codeOf(response)).toBe("JOB_REJECTED");
    expect((response.body as Json).failure.detail).toMatch(/threads 8 exceed the runner's 4/);
    expect(h.launcher.launches + small.launcher.launches).toBe(2);
  });

  it("K. no file path can be supplied: not in a field, not as a route", async () => {
    const h = await httpService();
    for (const mutate of [
      (job: Json) => (job.character.consumables.potion = "/etc/passwd"),
      (job: Json) => (job.character.consumables.flask = "..\\..\\windows\\win.ini"),
      (job: Json) => (job.character.talents.importString = "../../../../etc/passwd/xxxxxxxxxxxxxx"),
      (job: Json) =>
        (job.character.consumables.temporaryEnchants = [{ slot: "main_hand", enchant: "C:/simc/x" }]),
      (job: Json) => (job.json2 = "C:/out.json"),
    ]) {
      const job = devJob();
      mutate(job);
      expect(codeOf(await submit(h, submitBody(job)))).toBe("JOB_REJECTED");
    }
    const traversal = await signedRequest("GET", "/v1/simulations/../metrics", undefined);
    expect((await h.handler.handle(traversal)).status).toBe(404);
    const query = await signedRequest("GET", `${RUNNER_PATHS.metrics}?path=/etc`, undefined);
    expect((await h.handler.handle(query)).status).toBe(400);
    expect(h.launcher.launches).toBe(1);
  });

  it("L. no network source can be named: the builder emits no fetch directive for any accepted job", async () => {
    const job = devJob();
    job.character.consumables.potion = "armory";
    job.character.consumables.food = "wowhead";
    const prepared = await prepareSimulation(job, bytesOf(job), FAKE_ARTIFACT, RUNNER_SPEC_BINDINGS);
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    for (const line of prepared.value.input.split("\n")) {
      expect(line, line).not.toMatch(/^(armory|wowhead|guild|bnet|local_json|http|https|input)=/);
      expect(line, line).not.toMatch(/https?:|:\/\//);
    }
    for (const field of ["http://evil/x", "armory=us,illidan,x"]) {
      const bad = devJob();
      bad.character.consumables.food = field;
      expect((await prepareSimulation(bad, bytesOf(bad), FAKE_ARTIFACT, RUNNER_SPEC_BINDINGS)).ok).toBe(
        false,
      );
    }
  });
});

describe("M11-G3-5 security: job classes and the cache (M–O)", () => {
  const submit = async (h: Awaited<ReturnType<typeof httpService>>, body: unknown) =>
    await h.handler.handle(await signedRequest("POST", RUNNER_PATHS.simulations, body));

  it("M. a blocked or unattested production job is refused before the engine, with its typed failure", async () => {
    const h = await httpService();
    const job = productionJob();
    expect(codeOf(await submit(h, submitBody(job)))).toBe("JOB_REJECTED");
    const blocked = await attestationFor(job, (a) => (a.environment.status = "BLOCKED"));
    expect(codeOf(await submit(h, submitBody(job, blocked)))).toBe("ENVIRONMENT_NOT_REPRESENTABLE");
    const notReady = await attestationFor(job, (a) => (a.profile.status = "NOT_SIMULATION_READY"));
    expect(codeOf(await submit(h, submitBody(job, notReady)))).toBe("PROFILE_RECONSTRUCTION_FAILED");
    const otherHash = await attestationFor(job, (a) => (a.environment.hash = "0".repeat(64)));
    expect(codeOf(await submit(h, submitBody(job, otherHash)))).toBe("JOB_REJECTED");
    expect(codeOf(await submit(h, submitBody(devJob(), await attestationFor(job))))).toBe("JOB_REJECTED");
    expect(h.launcher.launches).toBe(1);
    const accepted = await submit(h, submitBody(job, await attestationFor(job)));
    expect(accepted.status).toBe(202);
    const done = await h.service.waitFor((accepted.body as Json).jobId);
    expect(done?.status).toBe("SUCCEEDED");
    expect(done?.jobClass).toBe("PRODUCTION");
    expect(done?.publishable).toBe(true);
  });

  it("M. a cached result is never served to a blocked production job (policy runs before the cache)", async () => {
    const h = await httpService();
    const job = productionJob();
    const keys = await keysFor(job);
    const first = await submit(h, submitBody(job, await attestationFor(job)));
    await h.service.waitFor((first.body as Json).jobId);
    expect(await h.cache.get(keys.parsedResultKey)).not.toBeNull();
    const blocked = await submit(
      h,
      submitBody(job, await attestationFor(job, (a) => (a.environment.status = "BLOCKED"))),
    );
    expect(blocked.status).toBe(422);
    expect(codeOf(blocked)).toBe("ENVIRONMENT_NOT_REPRESENTABLE");
    expect((blocked.body as Json).result).toBeUndefined();
  });

  it("N. a diagnostic job is explicitly marked and never publishable; it may not carry a readiness attestation", async () => {
    const h = await httpService();
    const response = await submit(h, submitBody(diagnosticJob()));
    expect(response.status).toBe(202);
    const done = await h.service.waitFor((response.body as Json).jobId);
    expect(done).toMatchObject({ status: "SUCCEEDED", jobClass: "DIAGNOSTIC", publishable: false });
    expect(done?.result?.provenance.consumablesProvenance).toBe("DIAGNOSTIC_RECONSTRUCTION");
    const attested = await submit(h, submitBody(diagnosticJob(), await attestationFor(diagnosticJob())));
    expect(codeOf(attested)).toBe("JOB_REJECTED");
    const dev = await submit(h, submitBody(devJob(3)));
    expect((await h.service.waitFor((dev.body as Json).jobId))?.publishable).toBe(false);
  });

  it("O. a cache entry cannot bypass provenance: a foreign binary, model, profile or parser entry is dropped and the job re-runs", async () => {
    const tamperings: [string, (entry: Json) => void][] = [
      ["binary", (entry) => (entry.result.model.binarySha256 = "e".repeat(64))],
      ["model", (entry) => (entry.result.model.requestedSimcCommit = "a".repeat(40))],
      ["profile", (entry) => (entry.result.profileHash = "b".repeat(64))],
      ["environment", (entry) => (entry.result.environmentHash = "c".repeat(64))],
      ["execution", (entry) => (entry.result.executionProfile.effectiveSettings.player.skill = 0.5)],
      ["parser", (entry) => (entry.result.provenance.parserRevision = "OLD_PARSER")],
      ["policy", (entry) => (entry.result.simulationPolicy.version = 99)],
      ["no dps", (entry) => (entry.result.dps.mean = 0)],
      ["extra field", (entry) => (entry.result.cacheStatus = "HIT")],
      ["engine key", (entry) => (entry.engineRunKey = "d".repeat(64))],
      ["schema", (entry) => (entry.schema = "simulation-cache-entry/0")],
    ];
    for (const [name, tamper] of tamperings) {
      const cache = new MemorySimulationCache();
      const h = await httpService({ cache });
      const job = devJob();
      const keys = await keysFor(job);
      const first = await submit(h, submitBody(job));
      await h.service.waitFor((first.body as Json).jobId);
      const entry = structuredClone(await cache.get(keys.parsedResultKey)) as Json;
      tamper(entry);
      await cache.put(entry as never);
      const launchesBefore = h.launcher.launches;
      const second = await submit(h, submitBody(job));
      expect((second.body as Json).cacheStatus, name).toBe("MISS");
      const done = await h.service.waitFor((second.body as Json).jobId);
      expect(done?.status, name).toBe("SUCCEEDED");
      expect(h.launcher.launches, name).toBe(launchesBefore + 1);
      expect(
        h.events.some((event) => event.event === "CACHE_REJECTED"),
        name,
      ).toBe(true);
      expect((await cache.get(keys.parsedResultKey))?.result.model.binarySha256, name).toBe(
        FAKE_ARTIFACT.binarySha256,
      );
      await settle();
    }
  });

  it("signing refuses short secrets and bad key ids on the client side too", async () => {
    await expect(
      signRunnerRequest({
        keyId: TEST_KEY_ID,
        secret: new Uint8Array(8),
        method: "GET",
        path: "/",
        body: new Uint8Array(0),
        timestampMs: 1,
        nonce: "a".repeat(16),
      }),
    ).rejects.toThrow(/too short/);
    await expect(
      signRunnerRequest({
        keyId: "Bad Key",
        secret: TEST_SECRET,
        method: "GET",
        path: "/",
        body: new Uint8Array(0),
        timestampMs: 1,
        nonce: "a".repeat(16),
      }),
    ).rejects.toThrow(/key id/);
  });
});
