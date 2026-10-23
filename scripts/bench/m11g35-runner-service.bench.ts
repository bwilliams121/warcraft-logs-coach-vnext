/**
 * M11-G3-5: the private runner service on the APPROVED exact-pin engine.
 *
 *   1. startup verification: the composed service (DockerLauncher, digest-only
 *      image) runs its self-test and reports READY; a missing image and a wrong
 *      approved binary hash both keep it NOT READY;
 *   2. real-engine LOCAL / REMOTE parity: the same job through the in-process
 *      backend and through the signed client over a loopback socket — same
 *      result within the reproducibility tolerance, same provenance; a remote
 *      cache HIT; identical refusal of a blocked production job;
 *   3. capacity on THIS host (12 logical CPUs): one STANDARD, one ESCALATED,
 *      two queued behind a one-job runner, cache-hit latency over HTTP, and two
 *      simultaneous 8-thread engines at the LAUNCHER level — an oversubscribed
 *      measurement the service itself refuses to schedule.
 *
 * Output: .probe/m11g35/report.json. Docker `--network none`. No Warcraft Logs.
 *
 *     SIMC_IMAGE=sha256:<id> npx vitest run --config scripts/bench/vitest.config.ts scripts/bench/m11g35-runner-service.bench.ts
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { APPROVED_ENGINE_ARTIFACTS } from "../../runner/approved-artifacts.js";
import { DockerLauncher } from "../../runner/engine-launcher.js";
import { LocalSimulationBackend } from "../../runner/local-backend.js";
import { DEFAULT_RUNNER_LIMITS } from "../../runner/limits.js";
import { RUNNER_SPEC_BINDINGS } from "../../runner/spec-bindings.js";
import { RequestAuthenticator } from "../../runner/service/auth.js";
import { FileSystemSimulationCache } from "../../runner/service/cache.js";
import { CacheIntegrity } from "../../runner/service/cache-integrity.js";
import { DEV_LOCAL_CAPACITY_V1, type RunnerCapacity } from "../../runner/service/capacity.js";
import { composeSimulationService } from "../../runner/service/compose.js";
import { limitsForCapacity } from "../../runner/service/engine.js";
import { RunnerHttpHandler } from "../../runner/service/http.js";
import { closeServer, createRunnerServer, listen } from "../../runner/service/server.js";
import { PROFILE_READINESS_GATE_REVISION } from "../../src/character-profile/fidelity.js";
import { ENVIRONMENT_PUBLISHABILITY_GATE_REVISION } from "../../src/environment/publishability.js";
import { SIMULATION_JOB_CLASSES } from "../../src/simulation/job-class.js";
import { prepareSimulation } from "../../src/simulation/prepare.js";
import { READINESS_ATTESTATION_SCHEMA_VERSION } from "../../src/simulation/readiness-attestation.js";
import { firstSemanticDifference } from "../../src/simulation/result.js";
import { RESULT_REPRODUCIBILITY_TOLERANCE } from "../../src/simulation/simulation-policy.js";
import { RemoteSimulationBackend } from "../../src/simulation-client/remote-client.js";
import { devBloodJob, jsonBytes } from "../../tests/support/simulation/dev-blood-job.js";

declare const process: any;

const IMAGE: string | undefined = process.env["SIMC_IMAGE"];
const OUT = join(".probe", "m11g35");
/** TEST-ONLY key material for the loopback socket; authorizes nothing. */
const BENCH_SECRET = new TextEncoder().encode("TEST-ONLY-bench-runner-hmac-key-not-a-secret");
const BENCH_CACHE_SECRET = new TextEncoder().encode("TEST-ONLY-bench-cache-integrity-key-not-a-secret");

type Json = Record<string, any>;

describe.skipIf(IMAGE === undefined)("M11-G3-5 runner service on the exact pin", () => {
  it("startup, parity and capacity", { timeout: 3_600_000 }, async () => {
    mkdirSync(OUT, { recursive: true });
    const artifact = APPROVED_ENGINE_ARTIFACTS[0];
    if (artifact === undefined) throw new Error("no approved artifact");
    const report: Json = {
      host: { logicalCpu: availableParallelism() },
      binarySha256: artifact.binarySha256,
    };
    const save = () => writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 1), "utf8");
    const scratch: string[] = [];
    const cacheDir = () => {
      const dir = mkdtempSync(join(tmpdir(), "wlc-g35-bench-"));
      scratch.push(dir);
      return dir;
    };

    const docker = (imageRef: string, capacity: RunnerCapacity) =>
      new DockerLauncher(
        {
          imageRef,
          dockerExecutable: process.env["DOCKER_EXE"] ?? "docker",
          cpus: capacity.threadsPerJob,
          cliEnv: process.env,
        },
        limitsForCapacity(capacity, DEFAULT_RUNNER_LIMITS),
      );
    // Bench = a development configuration: every class enabled explicitly; TEST-ONLY cache key.
    const integrity = await CacheIntegrity.fromSecret(BENCH_CACHE_SECRET);
    const service = (
      imageRef: string,
      options: { capacity?: RunnerCapacity; artifact?: typeof artifact } = {},
    ) => {
      const capacity = options.capacity ?? DEV_LOCAL_CAPACITY_V1;
      const launcher = docker(imageRef, capacity);
      return composeSimulationService({
        launcher,
        cache: new FileSystemSimulationCache(cacheDir()),
        cacheIntegrity: integrity,
        allowedJobClasses: SIMULATION_JOB_CLASSES,
        capacity,
        hostLogicalCpu: availableParallelism(),
        prepareLauncher: async () => {
          await launcher.resolveBinarySha256();
        },
        ...(options.artifact === undefined ? {} : { artifact: options.artifact }),
      });
    };

    try {
      // 1. Startup verification.
      const started = Date.now();
      const local = service(IMAGE ?? "");
      const readiness = await local.start();
      report.startup = { ready: readiness.ready, checks: readiness.checks, selfTestMs: Date.now() - started };
      expect(readiness.ready).toBe(true);
      const missing = service(`sha256:${"0".repeat(64)}`);
      const wrong = service(IMAGE ?? "", { artifact: { ...artifact, binarySha256: "1".repeat(64) } });
      const [missingReady, wrongReady] = [await missing.start(), await wrong.start()];
      report.startupFaults = { missingImage: missingReady, wrongApprovedBinary: wrongReady };
      expect(missingReady.ready).toBe(false);
      expect(wrongReady.ready).toBe(false);
      expect(wrongReady.detail.join()).toMatch(/MODEL_PROVENANCE_MISMATCH/);
      save();

      // 2. Parity: LOCAL in-process vs REMOTE over a loopback socket (separate service and cache).
      const remoteService = service(IMAGE ?? "");
      expect((await remoteService.start()).ready).toBe(true);
      const server = createRunnerServer(
        new RunnerHttpHandler(remoteService, new RequestAuthenticator(new Map([["bench", BENCH_SECRET]]))),
      );
      const port = await listen(server, 0, "127.0.0.1");
      try {
        const localBackend = new LocalSimulationBackend(local, artifact, RUNNER_SPEC_BINDINGS);
        const remoteBackend = new RemoteSimulationBackend({
          baseUrl: `http://127.0.0.1:${String(port)}`,
          keyId: "bench",
          secret: BENCH_SECRET,
          artifact,
          bindings: RUNNER_SPEC_BINDINGS,
          pollIntervalMs: 250,
          deadlineMs: 300_000,
          maxResubmits: 1,
        });
        const job = devBloodJob("STANDARD_SIM_V1", "ELITE_REALISTIC_V1");
        const timed = async <T>(work: () => Promise<T>) => {
          const at = Date.now();
          const value = await work();
          return { value, ms: Date.now() - at };
        };
        const l = await timed(() => localBackend.simulate({ job }));
        const r = await timed(() => remoteBackend.simulate({ job }));
        if (!l.value.outcome.ok || !r.value.outcome.ok)
          throw new Error(JSON.stringify([l.value.outcome, r.value.outcome]));
        const difference = firstSemanticDifference(
          l.value.outcome.value,
          r.value.outcome.value,
          RESULT_REPRODUCIBILITY_TOLERANCE,
        );
        const hit = await timed(() => remoteBackend.simulate({ job }));
        const blockedJob = devBloodJob("STANDARD_SIM_V1", "ELITE_REALISTIC_V1") as Json;
        blockedJob.character.profileKind = "LOGGED_RECONSTRUCTION";
        blockedJob.character.race = "dwarf";
        for (const target of [
          blockedJob.character.consumables,
          blockedJob.environment.raidBuffs,
          blockedJob.environment.bloodlust,
        ]) {
          target.provenance = "ACTUAL_OBSERVED";
        }
        const prepared = await prepareSimulation(
          blockedJob,
          jsonBytes(blockedJob),
          artifact,
          RUNNER_SPEC_BINDINGS,
        );
        if (!prepared.ok) throw new Error(prepared.failure.detail);
        const blockedRequest = {
          job: blockedJob,
          readiness: {
            schemaVersion:
              READINESS_ATTESTATION_SCHEMA_VERSION as typeof READINESS_ATTESTATION_SCHEMA_VERSION,
            jobClass: "PRODUCTION" as const,
            profile: {
              hash: prepared.value.keys.profileHash,
              status: "SIMULATION_READY" as const,
              gateRevision: PROFILE_READINESS_GATE_REVISION,
            },
            environment: {
              hash: prepared.value.keys.environmentHash,
              status: "BLOCKED" as const,
              gateRevision: ENVIRONMENT_PUBLISHABILITY_GATE_REVISION,
            },
          },
        };
        const [lb, rb] = [
          await localBackend.simulate(blockedRequest),
          await remoteBackend.simulate(blockedRequest),
        ];
        report.parity = {
          localMs: l.ms,
          remoteMs: r.ms,
          meanLocal: l.value.outcome.value.dps.mean,
          meanRemote: r.value.outcome.value.dps.mean,
          rseLocal: l.value.outcome.value.dps.relativeStandardError,
          firstSemanticDifference: difference,
          sameProvenance:
            JSON.stringify(l.value.outcome.value.provenance) ===
              JSON.stringify(r.value.outcome.value.provenance) &&
            JSON.stringify(l.value.outcome.value.model) === JSON.stringify(r.value.outcome.value.model) &&
            JSON.stringify(l.value.outcome.value.executionProfile) ===
              JSON.stringify(r.value.outcome.value.executionProfile),
          served: [l.value.served, r.value.served, hit.value.served],
          remoteHitMs: hit.ms,
          blocked: [lb.outcome, rb.outcome],
        };
        save();
        expect(difference).toBeNull();
        expect(report.parity.sameProvenance).toBe(true);
        expect(hit.value.served?.cacheStatus).toBe("HIT");
        expect(lb.outcome).toEqual(rb.outcome);
        expect(lb.outcome).toMatchObject({ ok: false, failure: { code: "ENVIRONMENT_NOT_REPRESENTABLE" } });

        // 3. Capacity.
        const hits: number[] = [];
        for (let index = 0; index < 20; index += 1)
          hits.push((await timed(() => remoteBackend.simulate({ job }))).ms);
        hits.sort((a, b) => a - b);
        const escalated = await timed(() =>
          localBackend.simulate({ job: devBloodJob("PRECISION_ESCALATED_V1", "ELITE_REALISTIC_V1") }),
        );
        const queuedJobs = [1, 2].map((variant) => {
          const queued = devBloodJob("STANDARD_SIM_V1", "ELITE_REALISTIC_V1") as Json;
          queued.environment.durationMs = 345_177 - variant * 1_000;
          return queued;
        });
        const queuedStart = Date.now();
        const queuedRuns = await Promise.all(
          queuedJobs.map(async (queued) => {
            const run = await localBackend.simulate({ job: queued });
            return { ms: Date.now() - queuedStart, ok: run.outcome.ok, cacheStatus: run.served?.cacheStatus };
          }),
        );
        const metrics = local.metrics();
        // Two simultaneous 8-thread engines on 12 logical CPUs: launcher level only (oversubscribed by design of the measurement).
        const pair = docker(IMAGE ?? "", DEV_LOCAL_CAPACITY_V1);
        await pair.resolveBinarySha256();
        const pairJobs = [3, 4].map((variant) => {
          const paired = devBloodJob("STANDARD_SIM_V1", "ELITE_REALISTIC_V1") as Json;
          paired.environment.durationMs = 345_177 - variant * 1_000;
          return paired;
        });
        const inputs = await Promise.all(
          pairJobs.map(async (paired) => {
            const p = await prepareSimulation(paired, jsonBytes(paired), artifact, RUNNER_SPEC_BINDINGS);
            if (!p.ok) throw new Error(p.failure.detail);
            return p.value.input;
          }),
        );
        const pairStart = Date.now();
        const pairRuns = await Promise.all(
          inputs.map(async (input) => {
            const launched = await pair.launch({ input, timeoutMs: 120_000 });
            return {
              kind: launched.kind,
              wallMs: "wallMs" in launched ? launched.wallMs : null,
              sinceStartMs: Date.now() - pairStart,
            };
          }),
        );
        report.capacity = {
          standardMs: l.ms,
          escalatedMs: escalated.ms,
          escalatedOk: escalated.value.outcome.ok,
          escalatedRse: escalated.value.outcome.ok
            ? escalated.value.outcome.value.dps.relativeStandardError
            : null,
          queuedBehindOneJobRunner: queuedRuns,
          serviceRuntimeMs: metrics.runtimeMs,
          serviceQueueWaitMs: metrics.queueWaitMs,
          cacheHitOverHttpMs: { min: hits[0], median: hits[10], max: hits[19] },
          twoSimultaneousLauncherLevelOversubscribed: {
            cpusPerContainer: 8,
            hostLogicalCpu: availableParallelism(),
            runs: pairRuns,
          },
        };
        save();
        expect(escalated.value.outcome.ok).toBe(true);
        expect(queuedRuns.every((run) => run.ok)).toBe(true);
      } finally {
        await closeServer(server);
        await remoteService.shutdown(0);
      }
      await local.shutdown(0);
      report.after = { liveExecutions: local.liveExecutions };
      save();
    } finally {
      for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
    }
  });
});
