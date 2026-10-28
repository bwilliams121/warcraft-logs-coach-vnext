/**
 * RUNNER SERVICE ENTRY POINT (M11-G3-5).
 *
 *   node --experimental-strip-types runner/service/main.ts   (env: see config.ts)
 *
 * Startup: load config (fails fast, naming variables, never values) -> build
 * the launcher -> listen (liveness answers at once) -> start(): capacity, cache
 * and the self-test job decide READINESS. A bad image, a wrong binary or a
 * wrong model keeps /v1/readiness at 503 and every submission
 * RUNNER_UNAVAILABLE; the process stays up so the failure is observable.
 *
 * SIGTERM/SIGINT: stop accepting, give running engines a grace period, kill
 * what remains, wait for every execution (and so every engine process and
 * temp directory) to settle, close the listener, exit.
 *
 * Logs are one JSON object per line on stdout: service and HTTP events only.
 * They never contain a secret, a header value, a job or a result.
 */

import { availableParallelism } from "node:os";

import { DirectLauncher, DockerLauncher, type EngineLauncher } from "../engine-launcher.js";
import { DEFAULT_RUNNER_LIMITS } from "../limits.js";
import { RequestAuthenticator } from "./auth.js";
import { FileSystemSimulationCache } from "./cache.js";
import { CacheIntegrity } from "./cache-integrity.js";
import { composeSimulationService } from "./compose.js";
import { loadRunnerConfig } from "./config.js";
import { limitsForCapacity } from "./engine.js";
import { RunnerHttpHandler } from "./http.js";
import { closeServer, createRunnerServer, listen } from "./server.js";

const SHUTDOWN_GRACE_MS = 30_000;

const emit = (record: object): void => {
  console.log(JSON.stringify({ at: new Date().toISOString(), ...record }));
};

async function main(): Promise<void> {
  const config = loadRunnerConfig(process.env);
  const limits = limitsForCapacity(config.capacity, DEFAULT_RUNNER_LIMITS);
  // One engine per hosted simulation model (M11 model registry); each proves its
  // own binary hash and runs its own self-test before the runner is READY.
  const engines = config.models.map((hosted) => {
    if (config.launcher.mode === "DIRECT") {
      return {
        artifact: hosted.model.artifact,
        launcher: new DirectLauncher({ executable: hosted.target }, limits) as EngineLauncher,
      };
    }
    const docker = new DockerLauncher(
      {
        imageRef: hosted.target,
        dockerExecutable: config.launcher.dockerExecutable,
        cpus: config.capacity.threadsPerJob,
        cliEnv: process.env,
      },
      limits,
    );
    return {
      artifact: hosted.model.artifact,
      launcher: docker as EngineLauncher,
      prepareLauncher: async () => {
        await docker.resolveBinarySha256();
      },
    };
  });
  const cacheIntegrity =
    config.cacheMacKey === null ? null : await CacheIntegrity.fromSecret(config.cacheMacKey);
  const service = composeSimulationService({
    engines,
    cache: new FileSystemSimulationCache(config.cacheDirectory),
    cacheIntegrity,
    allowedJobClasses: config.allowedJobClasses,
    capacity: config.capacity,
    hostLogicalCpu: availableParallelism(),
    log: (event) => emit({ source: "service", ...event }),
  });
  const handler = new RunnerHttpHandler(service, new RequestAuthenticator(config.keys), (event) =>
    emit({ source: "http", ...event }),
  );
  const server = createRunnerServer(handler);
  const port = await listen(server, config.port, config.host);
  emit({
    source: "main",
    event: "LISTENING",
    host: config.host,
    port,
    capacity: config.capacity.id,
    launcher: config.launcher.mode,
    models: config.models.map((hosted) => hosted.model.id),
    jobClasses: config.allowedJobClasses,
  });
  const readiness = await service.start();
  emit({
    source: "main",
    event: "READINESS",
    ready: readiness.ready,
    checks: readiness.checks,
    detail: readiness.detail,
  });

  let stopping = false;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    void service
      .shutdown(SHUTDOWN_GRACE_MS)
      .then(() => closeServer(server))
      .then(() => {
        emit({ source: "main", event: "STOPPED" });
        process.exit(0);
      });
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

main().catch((error: unknown) => {
  emit({ source: "main", event: "FATAL", detail: String((error as Error)?.message ?? error).slice(0, 300) });
  process.exit(1);
});
