/**
 * M11 model registry: the G3-5 runner hosting more than one approved
 * simulation model — over FAKE engines that report each model's identity.
 *
 * The runner enforces the model the job names: it never chooses, never
 * substitutes, refuses a model a production spec has not validated, and keeps
 * cache identity, MAC integrity and result verification per model.
 */

import { describe, expect, it } from "vitest";

import { LocalSimulationBackend } from "../../../runner/local-backend.js";
import { RUNNER_SPEC_BINDINGS } from "../../../runner/spec-bindings.js";
import { MemorySimulationCache } from "../../../runner/service/cache.js";
import { parseHostedModels } from "../../../runner/service/config.js";
import { settleTicket } from "../../../src/simulation/backend.js";
import { expectedResultIdentity } from "../../../src/simulation/result-verification.js";
import { firstSemanticDifference } from "../../../src/simulation/result.js";
import { RemoteSimulationBackend } from "../../../src/simulation-client/remote-client.js";
import {
  attestationFor,
  bytesOf,
  devJob,
  FAKE_ARTIFACT,
  FAKE_ARTIFACT_NEW,
  httpService,
  inProcessFetch,
  NEW_MODEL_ID,
  productionJob,
  startedService,
  TEST_KEY_ID,
  TEST_SECRET,
} from "../../support/simulation/runner-service.js";
import { DEV_SIMULATION_MODEL_ID } from "../../support/simulation/dev-blood-job.js";

type Json = Record<string, any>;
const OLD = DEV_SIMULATION_MODEL_ID;
const NEW = NEW_MODEL_ID;
const BOTH = ["HISTORICAL", "NEW"] as const;

type Harness = Awaited<ReturnType<typeof startedService>>;
const run = async (h: Harness, job: Json, readiness?: unknown) => {
  const submission = await h.service.submit({
    job,
    rawByteLength: bytesOf(job),
    ...(readiness === undefined ? {} : { readiness }),
  });
  if (!submission.accepted) return { refused: submission.rejected.failure };
  return { ticket: submission.ticket, done: await h.service.waitFor(submission.ticket.jobId) };
};

describe("M11 runner: hosting two approved simulation models", () => {
  it("each model's job runs on ITS engine and carries ITS provenance", async () => {
    const h = await startedService({ models: BOTH });
    expect(h.service.readiness().ready).toBe(true);
    const oldRun = await run(h, devJob(0, "STANDARD_SIM_V1", OLD));
    const newRun = await run(h, devJob(0, "STANDARD_SIM_V1", NEW));
    expect(oldRun.done?.result?.model.gameDataBuild).toBe("12.1.0.69587");
    expect(newRun.done?.result?.model.gameDataBuild).toBe("12.1.0.69933");
    expect(newRun.done?.result?.model.reportedGitRevision).toBe("0a72e6a746");
    // One self-test plus one job on each engine.
    expect(h.launchers[OLD]?.launches).toBe(2);
    expect(h.launchers[NEW]?.launches).toBe(2);
  });

  it("a model the runner does not host is RUNNER_UNAVAILABLE — never run on another model's engine", async () => {
    const oldOnly = await startedService({ models: ["HISTORICAL"] });
    const refused = await run(oldOnly, devJob(0, "STANDARD_SIM_V1", NEW));
    expect(refused.refused?.code).toBe("RUNNER_UNAVAILABLE");
    expect(oldOnly.launcher.launches).toBe(1);
    const newOnly = await startedService({ models: ["NEW"] });
    expect((await run(newOnly, devJob(0, "STANDARD_SIM_V1", OLD))).refused?.code).toBe("RUNNER_UNAVAILABLE");
  });

  it("an unregistered model is UNSUPPORTED_MODEL_VERSION before any engine work", async () => {
    const h = await startedService({ models: BOTH });
    const job = devJob();
    job.model = { simcCommit: "cc01837ffb90ae5641a40f17ca56b78b602befa1", gameDataBuild: "12.1.5.70529" };
    expect((await run(h, job)).refused?.code).toBe("UNSUPPORTED_MODEL_VERSION");
  });

  it("an engine that cannot prove its model keeps the runner NOT READY (wrong artifact/model pairing)", async () => {
    // The NEW artifact behind a fake that reports the historical identity.
    const mismatched = await startedService({ models: ["HISTORICAL"], artifact: FAKE_ARTIFACT_NEW });
    expect(mismatched.service.readiness().ready).toBe(false);
    expect(mismatched.service.readiness().detail.join()).toMatch(/MODEL_PROVENANCE_MISMATCH/);
    // Two engines for one model is a configuration error.
    const duplicated = await startedService({ models: ["HISTORICAL", "HISTORICAL"] });
    expect(duplicated.service.readiness().ready).toBe(false);
  });

  it("a PRODUCTION job on a model its spec has not validated is NOT_VALIDATED_FOR_SPEC, before the cache and the engine", async () => {
    const withoutNew = [{ specKey: "deathknight/blood", validations: [] }];
    const h = await startedService({ models: BOTH, modelValidations: withoutNew });
    const job = productionJob(0, NEW);
    const refused = await run(h, job, await attestationFor(job));
    expect(refused.refused?.code).toBe("SIMULATION_MODEL_NOT_VALIDATED_FOR_SPEC");
    expect(h.launchers[NEW]?.launches).toBe(1); // self-test only
    // Non-production work on the same model is not a publication and is allowed.
    expect((await run(h, devJob(0, "STANDARD_SIM_V1", NEW))).done?.status).toBe("SUCCEEDED");
  });

  it("a PRODUCTION job on the validated new model runs; an attestation for another model is refused", async () => {
    const h = await startedService({ models: BOTH });
    const job = productionJob(0, NEW);
    const ok = await run(h, job, await attestationFor(job));
    expect(ok.done).toMatchObject({ status: "SUCCEEDED", jobClass: "PRODUCTION", publishable: true });
    const wrongModel = await attestationFor(job, (a) => (a.simulationModelId = OLD));
    const refused = await run(h, productionJob(1, NEW), { ...wrongModel });
    expect(refused.refused?.code).toBe("JOB_REJECTED");
  });

  it("old and new results never share a cache entry; each is MAC-protected and HIT only for its own model", async () => {
    const cache = new MemorySimulationCache();
    const h = await startedService({ models: BOTH, cache });
    const oldFirst = await run(h, devJob(0, "STANDARD_SIM_V1", OLD));
    const newFirst = await run(h, devJob(0, "STANDARD_SIM_V1", NEW));
    expect(oldFirst.ticket?.cacheKey).not.toBe(newFirst.ticket?.cacheKey);
    expect(newFirst.ticket?.cacheStatus).toBe("MISS");
    const [oldHit, newHit] = [
      await run(h, devJob(0, "STANDARD_SIM_V1", OLD)),
      await run(h, devJob(0, "STANDARD_SIM_V1", NEW)),
    ];
    expect([oldHit.ticket?.cacheStatus, newHit.ticket?.cacheStatus]).toEqual(["HIT", "HIT"]);
    expect(newHit.done?.result?.model.gameDataBuild).toBe("12.1.0.69933");
    // A new-model record moved under the old model's key fails the MAC (keys are bound).
    const newEntry = await cache.get(newFirst.ticket?.cacheKey ?? "");
    await cache.put({ ...(newEntry as never as Json), cacheKey: oldFirst.ticket?.cacheKey } as never);
    const afterSwap = await run(h, devJob(0, "STANDARD_SIM_V1", OLD));
    expect(afterSwap.ticket?.cacheStatus).toBe("MISS");
    expect(afterSwap.done?.result?.model.gameDataBuild).toBe("12.1.0.69587");
  });

  it("a new-model result cannot settle for a job naming the old model (Worker verification)", async () => {
    const h = await startedService({ models: BOTH });
    const newRun = await run(h, devJob(0, "STANDARD_SIM_V1", NEW));
    const oldJob = devJob(0, "STANDARD_SIM_V1", OLD);
    const expected = await expectedResultIdentity(
      oldJob,
      bytesOf(oldJob),
      [FAKE_ARTIFACT, FAKE_ARTIFACT_NEW],
      RUNNER_SPEC_BINDINGS,
    );
    if (!expected.ok || newRun.done === null || newRun.done === undefined) throw new Error("setup");
    const forged = { ...newRun.done, cacheKey: expected.value.prepared.keys.parsedResultKey };
    const settled = settleTicket("REMOTE", forged, expected.value);
    expect(settled.outcome).toMatchObject({ ok: false, failure: { code: "MODEL_PROVENANCE_MISMATCH" } });
  });

  it("LOCAL / REMOTE parity holds on the new model (same result, same provenance, remote HIT)", async () => {
    const a = await httpService({ models: BOTH });
    const b = await httpService({ models: BOTH });
    const local = new LocalSimulationBackend(
      a.service,
      [FAKE_ARTIFACT, FAKE_ARTIFACT_NEW],
      RUNNER_SPEC_BINDINGS,
    );
    const remote = new RemoteSimulationBackend({
      baseUrl: "https://runner.test.invalid",
      keyId: TEST_KEY_ID,
      secret: TEST_SECRET,
      artifacts: [FAKE_ARTIFACT, FAKE_ARTIFACT_NEW],
      bindings: RUNNER_SPEC_BINDINGS,
      pollIntervalMs: 5,
      deadlineMs: 20_000,
      maxResubmits: 1,
      fetch: inProcessFetch(() => b.handler),
    });
    const job = devJob(0, "STANDARD_SIM_V1", NEW);
    const [l, r] = [await local.simulate({ job }), await remote.simulate({ job })];
    if (!l.outcome.ok || !r.outcome.ok) throw new Error("run failed");
    expect(firstSemanticDifference(l.outcome.value, r.outcome.value, 0)).toBeNull();
    expect(r.outcome.value.model).toEqual(l.outcome.value.model);
    expect(r.outcome.value.model.requestedSimcCommit).toBe("0a72e6a74684d23c989b2d76143e429d2b4f1c91");
    expect((await remote.simulate({ job })).served?.cacheStatus).toBe("HIT");
  });
});

describe("M11 runner configuration: hosted models", () => {
  const OLD_IMAGE = "sha256:8ab91e722bd4c6e50a58a38a1244d2688bdaf3ddc68e09cd2aa59877f8b7aaf4";
  const NEW_IMAGE = "sha256:efea14b4fd0694831af5bab945788be2c382f3e2ed20fce1d0597ba8bf504d59";
  it("hosts only registered models, each with its own registered image", () => {
    const hosted = parseHostedModels(`${OLD}=${OLD_IMAGE},${NEW}=${NEW_IMAGE}`, "DOCKER");
    expect(hosted.map((entry) => entry.model.id)).toEqual([OLD, NEW]);
    expect(() => parseHostedModels(`${NEW}=${OLD_IMAGE}`, "DOCKER")).toThrow(/not its registered image id/);
    expect(() => parseHostedModels(`SIMC_LATEST=${NEW_IMAGE}`, "DOCKER")).toThrow(
      /unregistered simulation model/,
    );
    expect(() => parseHostedModels(`${OLD}=${OLD_IMAGE},${OLD}=${OLD_IMAGE}`, "DOCKER")).toThrow(/repeats/);
    expect(() => parseHostedModels(undefined, "DOCKER")).toThrow(/required/);
    expect(parseHostedModels(`${NEW}=/opt/simc/simc`, "DIRECT")[0]?.target).toBe("/opt/simc/simc");
  });
});
