/**
 * M11-G3-5 final hardening, over the FAKE engine:
 *
 *   1. revision-bound PRODUCTION readiness attestations;
 *   2. cache result integrity (HMAC-SHA256 under a dedicated key);
 *   3. the deployment job-class allowlist (production default: PRODUCTION only).
 *
 * Every refusal here happens before the cache is consulted and before an engine
 * starts; every tampered cache record is dropped and recomputed, never served.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { RUNNER_SPEC_BINDINGS } from "../../../runner/spec-bindings.js";
import { parseKeyRing } from "../../../runner/service/auth.js";
import {
  FileSystemSimulationCache,
  MemorySimulationCache,
  type CachedSimulation,
  type SimulationCache,
} from "../../../runner/service/cache.js";
import { CacheIntegrity } from "../../../runner/service/cache-integrity.js";
import { composeSimulationService } from "../../../runner/service/compose.js";
import { parseCacheMacKey, parseJobClasses } from "../../../runner/service/config.js";
import { PRODUCTION_JOB_CLASSES } from "../../../runner/service/service.js";
import { PROFILE_READINESS_GATE_REVISION } from "../../../src/character-profile/fidelity.js";
import { ENVIRONMENT_PUBLISHABILITY_GATE_REVISION } from "../../../src/environment/publishability.js";
import { prepareSimulation } from "../../../src/simulation/prepare.js";
import {
  ACCEPTED_READINESS_GATE_REVISIONS,
  checkReadinessAttestation,
  READINESS_ATTESTATION_SCHEMA_VERSION,
} from "../../../src/simulation/readiness-attestation.js";
import { RUNNER_PATHS, RUNNER_PROTOCOL } from "../../../src/simulation/runner-protocol.js";
import {
  attestationFor,
  bytesOf,
  devJob,
  diagnosticJob,
  FAKE_ARTIFACT,
  httpService,
  ModeLauncher,
  modelIdOf,
  productionJob,
  settle,
  signedRequest,
  startedService,
  TEST_CACHE_MAC_SECRET,
  TEST_CAPACITY,
  TEST_KEY_ID,
  TEST_KEYS,
  TEST_SECRET,
  testCacheIntegrity,
} from "../../support/simulation/runner-service.js";

type Json = Record<string, any>;

const DIRS: string[] = [];
afterAll(() => {
  for (const dir of DIRS) rmSync(dir, { recursive: true, force: true });
});

/** Counts reads, to prove a refusal never consulted the cache. */
class SpyCache implements SimulationCache {
  readonly kind = "SPY";
  gets = 0;
  constructor(readonly inner: SimulationCache = new MemorySimulationCache()) {}
  async get(key: string) {
    this.gets += 1;
    return await this.inner.get(key);
  }
  async put(entry: CachedSimulation) {
    await this.inner.put(entry);
  }
  async delete(key: string) {
    await this.inner.delete(key);
  }
  configurationProblem() {
    return this.inner.configurationProblem();
  }
}

const keysOf = async (job: Json) => {
  const prepared = await prepareSimulation(job, bytesOf(job), FAKE_ARTIFACT, RUNNER_SPEC_BINDINGS);
  if (!prepared.ok) throw new Error(prepared.failure.detail);
  return prepared.value.keys;
};

type Harness = Awaited<ReturnType<typeof startedService>>;
const submit = async (h: Harness, job: Json, readiness?: unknown) =>
  await h.service.submit({
    job,
    rawByteLength: bytesOf(job),
    ...(readiness === undefined ? {} : { readiness }),
  });
const codeOf = (submission: Awaited<ReturnType<typeof submit>>): string =>
  submission.accepted ? `ACCEPTED:${submission.ticket.cacheStatus}` : submission.rejected.failure.code;
const run = async (h: Harness, job: Json, readiness?: unknown) => {
  const submission = await submit(h, job, readiness);
  if (!submission.accepted) throw new Error(submission.rejected.failure.code);
  return { ticket: submission.ticket, done: await h.service.waitFor(submission.ticket.jobId) };
};

describe("M11-G3-5 hardening 1: revision-bound readiness attestation", () => {
  it("the attestation schema binds class, both hashes, both statuses and both gate revisions", async () => {
    const attestation = await attestationFor(productionJob());
    expect(attestation).toEqual({
      schemaVersion: READINESS_ATTESTATION_SCHEMA_VERSION,
      jobClass: "PRODUCTION",
      simulationModelId: "SIMC_33622E9D_LIVE_12_1_0_69587",
      profile: {
        hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        status: "SIMULATION_READY",
        gateRevision: PROFILE_READINESS_GATE_REVISION,
      },
      environment: {
        hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        status: "PUBLISHABLE",
        gateRevision: ENVIRONMENT_PUBLISHABILITY_GATE_REVISION,
      },
    });
    expect(ACCEPTED_READINESS_GATE_REVISIONS).toEqual({
      profile: ["profile-readiness-gate/1"],
      environment: ["environment-publishability-gate/1"],
    });
  });

  it("a valid current attestation succeeds", async () => {
    const h = await startedService({ allowedJobClasses: PRODUCTION_JOB_CLASSES });
    const { done } = await run(h, productionJob(), await attestationFor(productionJob()));
    expect(done).toMatchObject({ status: "SUCCEEDED", jobClass: "PRODUCTION", publishable: true });
  });

  it("refuses wrong gate revisions, stale schemas, hash mismatches and non-ready statuses — before the cache and the engine", async () => {
    const cache = new SpyCache();
    const h = await startedService({ cache, allowedJobClasses: PRODUCTION_JOB_CLASSES });
    const job = productionJob();
    const keys = await keysOf(job);
    const cases: [string, unknown, string, RegExp][] = [
      ["no attestation", undefined, "JOB_REJECTED", /requires a readiness attestation/],
      [
        "older profile gate",
        await attestationFor(job, (a) => (a.profile.gateRevision = "profile-readiness-gate/0")),
        "JOB_REJECTED",
        /profile gate revision profile-readiness-gate\/0 is not accepted/,
      ],
      [
        "future profile gate",
        await attestationFor(job, (a) => (a.profile.gateRevision = "profile-readiness-gate/2")),
        "JOB_REJECTED",
        /profile gate revision/,
      ],
      [
        "environment gate",
        await attestationFor(job, (a) => (a.environment.gateRevision = "environment-publishability-gate/0")),
        "JOB_REJECTED",
        /environment gate revision/,
      ],
      [
        "schema id as gate",
        await attestationFor(job, (a) => (a.environment.gateRevision = "environment-publishability/1")),
        "JOB_REJECTED",
        /environment gate revision/,
      ],
      [
        "stale schema v1 shape",
        {
          characterProfile: "SIMULATION_READY",
          environment: "PUBLISHABLE",
          profileHash: keys.profileHash,
          environmentHash: keys.environmentHash,
        },
        "JOB_REJECTED",
        /schema \(missing\)/,
      ],
      [
        "stale schema version",
        await attestationFor(job, (a) => (a.schemaVersion = "simulation-readiness-attestation/1")),
        "JOB_REJECTED",
        /schema simulation-readiness-attestation\/1/,
      ],
      [
        "wrong class",
        await attestationFor(job, (a) => (a.jobClass = "DIAGNOSTIC")),
        "JOB_REJECTED",
        /jobClass/,
      ],
      [
        "extra field",
        await attestationFor(job, (a) => (a.note = "trust me")),
        "JOB_REJECTED",
        /unrecognized_keys/,
      ],
      [
        "profile hash",
        await attestationFor(job, (a) => (a.profile.hash = "1".repeat(64))),
        "JOB_REJECTED",
        /does not describe this job/,
      ],
      [
        "environment hash",
        await attestationFor(job, (a) => (a.environment.hash = "2".repeat(64))),
        "JOB_REJECTED",
        /does not describe this job/,
      ],
      [
        "other job's attestation",
        await attestationFor(productionJob(5)),
        "JOB_REJECTED",
        /does not describe this job/,
      ],
      [
        "profile not ready",
        await attestationFor(job, (a) => (a.profile.status = "NOT_SIMULATION_READY")),
        "PROFILE_RECONSTRUCTION_FAILED",
        /SIMULATION_READY/,
      ],
      [
        "environment blocked",
        await attestationFor(job, (a) => (a.environment.status = "BLOCKED")),
        "ENVIRONMENT_NOT_REPRESENTABLE",
        /PUBLISHABLE/,
      ],
      ["not an object", "SIMULATION_READY", "JOB_REJECTED", /schema \(missing\)/],
    ];
    for (const [name, readiness, code, detail] of cases) {
      const submission = await submit(h, job, readiness);
      expect(submission.accepted, name).toBe(false);
      if (submission.accepted) continue;
      expect(submission.rejected.status, name).toBe("REFUSED");
      expect(submission.rejected.failure.code, name).toBe(code);
      expect(submission.rejected.failure.detail, name).toMatch(detail);
    }
    expect(cache.gets).toBe(0);
    expect(h.launcher.launches).toBe(1); // the startup self-test only
  });

  it("a blocked or stale-revision production job fails before cache lookup even when a valid result is cached", async () => {
    const cache = new SpyCache();
    const h = await startedService({ cache, allowedJobClasses: PRODUCTION_JOB_CLASSES });
    const job = productionJob();
    await run(h, job, await attestationFor(job));
    const getsAfterRun = cache.gets;
    expect(await cache.inner.get((await keysOf(job)).parsedResultKey)).not.toBeNull();
    for (const readiness of [
      await attestationFor(job, (a) => (a.environment.status = "BLOCKED")),
      await attestationFor(job, (a) => (a.profile.gateRevision = "profile-readiness-gate/0")),
    ]) {
      const refused = await submit(h, job, readiness);
      expect(refused.accepted).toBe(false);
    }
    expect(cache.gets).toBe(getsAfterRun);
    const hit = await submit(h, job, await attestationFor(job));
    expect(codeOf(hit)).toBe("ACCEPTED:HIT");
  });

  it("the pure check agrees (Worker-safe, no runner state)", async () => {
    const job = productionJob();
    const keys = await keysOf(job);
    const recomputed = { ...keys, simulationModelId: modelIdOf(job) };
    expect(checkReadinessAttestation(await attestationFor(job), recomputed)).toBeNull();
    expect(
      checkReadinessAttestation(
        await attestationFor(job, (a) => (a.profile.gateRevision = "x/1")),
        recomputed,
      ),
    ).toMatchObject({
      ok: false,
      failure: { code: "JOB_REJECTED" },
    });
  });
});

describe("M11-G3-5 hardening 2: cache result integrity", () => {
  /** Runs a job, then lets `tamper` edit the stored record; returns how the next submission was served. */
  const tamperAndResubmit = async (
    tamper: (entry: Json) => void | Promise<void>,
    cache: SimulationCache = new MemorySimulationCache(),
  ) => {
    const h = await startedService({ cache });
    const job = devJob();
    const first = await run(h, job);
    const key = first.ticket.cacheKey;
    const entry = structuredClone(await cache.get(key)) as Json;
    await tamper(entry);
    await cache.put(entry as never);
    const launches = h.launcher.launches;
    const second = await run(h, job);
    await settle();
    return { h, first, second, launches, key, cache };
  };
  const rejectedWith = (h: Harness) =>
    h.events.filter((event) => event.event === "CACHE_REJECTED").map((event) => event.code);

  it("a valid record carries a MAC and is accepted (HIT)", async () => {
    const h = await startedService();
    const first = await run(h, devJob());
    const entry = await h.cache.get(first.ticket.cacheKey);
    expect(entry?.schema).toBe("simulation-cache-entry/2");
    expect(entry?.resultMac).toMatch(/^[0-9a-f]{64}$/);
    const integrity = await testCacheIntegrity();
    expect(
      await integrity.verify(
        {
          cacheKey: entry?.cacheKey ?? "",
          engineRunKey: entry?.engineRunKey ?? "",
          result: entry?.result as never,
        },
        entry?.resultMac,
      ),
    ).toBe(true);
    const second = await run(h, devJob());
    expect(second.ticket.cacheStatus).toBe("HIT");
    expect(second.done?.result).toEqual(first.done?.result);
  });

  it("changed DPS, action value, pet value, provenance or MAC is detected — the record is dropped, never served, and recomputed", async () => {
    const tamperings: [string, (entry: Json) => void][] = [
      ["DPS mean (provenance unchanged)", (e) => (e.result.dps.mean += 1)],
      ["DPS ci95", (e) => (e.result.dps.ci95.upper *= 1.01)],
      ["action value", (e) => (e.result.actionBreakdown[0].meanDamagePerIteration += 1)],
      ["pet value", (e) => (e.result.petBreakdown[0].meanDamagePerIteration += 1)],
      ["provenance", (e) => (e.result.provenance.hotfixHash = "0".repeat(64))],
      ["MAC flipped", (e) => (e.resultMac = (e.resultMac[0] === "a" ? "b" : "a") + e.resultMac.slice(1))],
      ["MAC removed", (e) => delete e.resultMac],
      ["MAC not hex", (e) => (e.resultMac = "z".repeat(64))],
    ];
    for (const [name, tamper] of tamperings) {
      const { h, first, second, launches } = await tamperAndResubmit(tamper);
      expect(second.ticket.cacheStatus, name).toBe("MISS");
      expect(h.launcher.launches, name).toBe(launches + 1);
      expect(rejectedWith(h), name).toEqual(["CACHE_INTEGRITY_FAILED"]);
      expect(h.service.metrics().counters.cacheIntegrityFailures, name).toBe(1);
      expect(second.done?.result, name).toEqual(first.done?.result);
    }
  });

  it("a schema-1 record (no MAC) and a record moved under another key are refused", async () => {
    const old = await tamperAndResubmit((e) => {
      e.schema = "simulation-cache-entry/1";
      delete e.resultMac;
    });
    expect(rejectedWith(old.h)).toEqual(["CACHE_ENTRY_MALFORMED"]);
    // A valid record for job A stored under job B's key, with its key field rewritten: the MAC binds the keys.
    const cache = new MemorySimulationCache();
    const h = await startedService({ cache });
    const a = await run(h, devJob(0));
    const bKey = (await keysOf(devJob(1))).parsedResultKey;
    const bEngine = (await keysOf(devJob(1))).engineRunKey;
    const moved = {
      ...(structuredClone(await cache.get(a.ticket.cacheKey)) as Json),
      cacheKey: bKey,
      engineRunKey: bEngine,
    };
    await cache.put(moved as never);
    const b = await run(h, devJob(1));
    expect(b.ticket.cacheStatus).toBe("MISS");
    expect(rejectedWith(h)).toEqual(["CACHE_INTEGRITY_FAILED"]);
  });

  it("the MAC runs FIRST, and a correctly MAC'd but semantically foreign record is still refused by provenance verification", async () => {
    const integrity = await testCacheIntegrity();
    const { h } = await tamperAndResubmit(async (e) => {
      e.result.model.binarySha256 = "e".repeat(64);
      e.resultMac = await integrity.mac({
        cacheKey: e.cacheKey,
        engineRunKey: e.engineRunKey,
        result: e.result,
      });
    });
    expect(rejectedWith(h)).toEqual(["CACHE_RESULT_UNVERIFIED"]);
  });

  it("the durable adapter is protected the same way (edited DPS in the file)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wlc-g35-mac-"));
    DIRS.push(dir);
    const cache = new FileSystemSimulationCache(dir);
    const h = await startedService({ cache });
    const first = await run(h, devJob());
    const path = join(dir, `${first.ticket.cacheKey}.json`);
    const record = JSON.parse(readFileSync(path, "utf8")) as Json;
    record.result.dps.mean = 999_999;
    writeFileSync(path, JSON.stringify(record), "utf8");
    const second = await run(h, devJob());
    expect(second.ticket.cacheStatus).toBe("MISS");
    expect(second.done?.result?.dps.mean).toBe(50_000);
    expect(rejectedWith(h)).toEqual(["CACHE_INTEGRITY_FAILED"]);
  });

  it("the HTTP auth key cannot validate a cache MAC, and the cache key cannot authenticate HTTP", async () => {
    const asHttpKey = await CacheIntegrity.fromSecret(TEST_SECRET);
    const { h } = await tamperAndResubmit(async (e) => {
      e.result.dps.mean += 1;
      e.resultMac = await asHttpKey.mac({
        cacheKey: e.cacheKey,
        engineRunKey: e.engineRunKey,
        result: e.result,
      });
    });
    expect(rejectedWith(h)).toEqual(["CACHE_INTEGRITY_FAILED"]);

    const http = await httpService();
    const signedWithCacheKey = await signedRequest("GET", RUNNER_PATHS.metrics, undefined, {
      keyId: TEST_KEY_ID,
      secret: TEST_CACHE_MAC_SECRET,
    });
    expect((await http.handler.handle(signedWithCacheKey)).status).toBe(401);
    expect(http.httpEvents.map((event) => event.reason)).toEqual(["BAD_SIGNATURE"]);
    // Configuration refuses to reuse a request key as the cache key at all.
    const ring = parseKeyRing(`${TEST_KEY_ID}:${btoa(new TextDecoder().decode(TEST_SECRET))}`);
    expect(() => parseCacheMacKey(btoa(new TextDecoder().decode(TEST_SECRET)), ring)).toThrow(
      /must not reuse an HMAC request key/,
    );
    expect(parseCacheMacKey(btoa(new TextDecoder().decode(TEST_CACHE_MAC_SECRET)), ring)?.byteLength).toBe(
      TEST_CACHE_MAC_SECRET.byteLength,
    );
    expect(() => parseCacheMacKey(btoa("short"), ring)).toThrow(/shorter than 32 bytes/);
  });

  it("a missing cache-integrity key keeps the service NOT READY; nothing is cached or served", async () => {
    expect(parseCacheMacKey(undefined, TEST_KEYS)).toBeNull();
    const h = await startedService({ cacheIntegrity: null });
    expect(h.service.readiness()).toMatchObject({ ready: false, checks: { cache: "INVALID" } });
    expect(h.service.readiness().detail.join()).toMatch(/cache integrity key not configured/);
    expect(codeOf(await submit(h, devJob()))).toBe("RUNNER_UNAVAILABLE");
  });

  it("the cache-integrity secret never reaches a log line, metric, readiness view, ticket or error", async () => {
    const h = await httpService();
    const response = await h.handler.handle(
      await signedRequest("POST", RUNNER_PATHS.simulations, { protocol: RUNNER_PROTOCOL, job: devJob() }),
    );
    await h.service.waitFor((response.body as Json).jobId);
    await tamperAndResubmit((e) => (e.result.dps.mean += 1));
    const secretText = new TextDecoder().decode(TEST_CACHE_MAC_SECRET);
    let configError = "";
    try {
      parseCacheMacKey(
        btoa(new TextDecoder().decode(TEST_SECRET)),
        parseKeyRing(`${TEST_KEY_ID}:${btoa(new TextDecoder().decode(TEST_SECRET))}`),
      );
    } catch (error) {
      configError = (error as Error).message;
    }
    const surfaces = JSON.stringify([
      h.events,
      h.httpEvents,
      h.service.metrics(),
      h.service.readiness(),
      response.body,
      configError,
    ]);
    for (const needle of [secretText, btoa(secretText), new TextDecoder().decode(TEST_SECRET)]) {
      expect(surfaces).not.toContain(needle);
    }
  });
});

describe("M11-G3-5 hardening 3: job-class deployment allowlist", () => {
  /** A LOGGED_FIDELITY_PROBE on its own profile and policy (G3-2 shape). */
  function fidelityProbe(): Json {
    const job = devJob(0, "FIDELITY_PROBE_V1");
    job.executionProfileId = "SIMC_DEFAULT_PINNED";
    job.character.profileKind = "LOGGED_FIDELITY_PROBE";
    job.character.race = "none";
    job.character.consumables = {
      provenance: "FIDELITY_CONTROL",
      potion: "NONE",
      flask: "NONE",
      food: "NONE",
      augmentation: "NONE",
      temporaryEnchants: [],
    };
    job.environment.raidBuffs = { provenance: "FIDELITY_CONTROL", active: [] };
    job.environment.bloodlust = { kind: "NONE", provenance: "FIDELITY_CONTROL" };
    return job;
  }

  it("the production default (compose with no class option, config with no variable) is PRODUCTION only", async () => {
    expect(parseJobClasses(undefined)).toEqual(["PRODUCTION"]);
    expect(parseJobClasses(" ")).toEqual(["PRODUCTION"]);
    expect(parseJobClasses("PRODUCTION,DEVELOPMENT,DIAGNOSTIC,FIDELITY_PROBE")).toEqual([
      "PRODUCTION",
      "DEVELOPMENT",
      "DIAGNOSTIC",
      "FIDELITY_PROBE",
    ]);
    expect(() => parseJobClasses("PRODUCTION,EVERYTHING")).toThrow(/unknown job class/);
    const service = composeSimulationService({
      engines: [{ artifact: FAKE_ARTIFACT, launcher: new ModeLauncher("ok") }],
      cache: new MemorySimulationCache(),
      cacheIntegrity: await testCacheIntegrity(),
      capacity: TEST_CAPACITY,
    });
    await service.start();
    const production = await service.submit({
      job: productionJob(),
      rawByteLength: bytesOf(productionJob()),
      readiness: await attestationFor(productionJob()),
    });
    expect(production.accepted).toBe(true);
    for (const job of [devJob(), diagnosticJob(), fidelityProbe()]) {
      const refused = await service.submit({ job, rawByteLength: bytesOf(job) });
      expect(refused.accepted).toBe(false);
      if (refused.accepted) continue;
      expect(refused.rejected).toMatchObject({ status: "REFUSED", failure: { code: "JOB_REJECTED" } });
      expect(refused.rejected.failure.detail).toMatch(
        /job class (DEVELOPMENT|DIAGNOSTIC|FIDELITY_PROBE) is not enabled on this runner/,
      );
    }
  });

  it("a development/test configuration enables classes explicitly, one at a time", async () => {
    const h = await startedService({ allowedJobClasses: ["PRODUCTION", "DEVELOPMENT"] });
    expect((await run(h, devJob())).done?.status).toBe("SUCCEEDED");
    expect(codeOf(await submit(h, diagnosticJob()))).toBe("JOB_REJECTED");
    expect(codeOf(await submit(h, fidelityProbe()))).toBe("JOB_REJECTED");
    const all = await startedService({ allowedJobClasses: ["DIAGNOSTIC", "FIDELITY_PROBE"] });
    expect((await run(all, diagnosticJob())).done?.jobClass).toBe("DIAGNOSTIC");
    expect((await run(all, fidelityProbe())).done?.jobClass).toBe("FIDELITY_PROBE");
    const none = await startedService({ allowedJobClasses: [] });
    expect(none.service.readiness()).toMatchObject({ ready: false, checks: { jobClasses: "INVALID" } });
  });

  it("a class refusal cannot obtain a cached result, even when the shared cache holds one", async () => {
    const shared = new MemorySimulationCache();
    const dev = await startedService({ cache: shared, allowedJobClasses: ["DEVELOPMENT"] });
    const first = await run(dev, devJob());
    expect(await shared.get(first.ticket.cacheKey)).not.toBeNull();
    const spy = new SpyCache(shared);
    const production = await startedService({ cache: spy, allowedJobClasses: PRODUCTION_JOB_CLASSES });
    const refused = await submit(production, devJob());
    expect(codeOf(refused)).toBe("JOB_REJECTED");
    expect(refused.accepted ? refused.ticket.result : undefined).toBeUndefined();
    expect(spy.gets).toBe(0);
    expect(production.launcher.launches).toBe(1); // self-test only
  });
});
