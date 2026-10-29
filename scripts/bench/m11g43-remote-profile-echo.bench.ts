/**
 * M11-G4-3 REAL-ENGINE proof of the production CHARACTER gate: stage A of
 * the publication pipeline on the canonical fight, with its CHARACTER gate
 * fed by the REAL engine's profile echo transported through the runner
 * (`backendProfileEchoSource`).
 *
 * The runner is composed with PRODUCTION plus FIDELITY_PROBE enabled, the
 * configuration a publication deployment must choose; the production default
 * stays PRODUCTION only.
 *
 * Expected: CONTEXT selects 0a72e6a7; CHARACTER is SIMULATION_READY (with the
 * owner's race statement) on the transported echo; ENVIRONMENT stops on the
 * canonical fight's real blockers.
 *
 *   MODEL_ID=SIMC_0A72E6A7_LIVE_12_1_0_69933 SIMC_IMAGE=sha256:<image id> \
 *     npx vitest run --config scripts/bench/vitest.config.ts scripts/bench/m11g43-remote-profile-echo.bench.ts
 *
 * Output: .probe/m11g43/stage-a.json (gitignored).
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { APPROVED_ENGINE_ARTIFACTS } from "../../runner/approved-artifacts.js";
import { DockerLauncher } from "../../runner/engine-launcher.js";
import { LocalSimulationBackend } from "../../runner/local-backend.js";
import { DEFAULT_RUNNER_LIMITS } from "../../runner/limits.js";
import { RUNNER_MODEL_VALIDATIONS, RUNNER_SPEC_BINDINGS } from "../../runner/spec-bindings.js";
import { FileSystemSimulationCache } from "../../runner/service/cache.js";
import { CacheIntegrity } from "../../runner/service/cache-integrity.js";
import { DEV_LOCAL_CAPACITY_V1 } from "../../runner/service/capacity.js";
import { composeSimulationService } from "../../runner/service/compose.js";
import { limitsForCapacity } from "../../runner/service/engine.js";
import { assessPublicationReadiness, backendProfileEchoSource } from "../../src/publication/pipeline.js";
import { simulationModelById } from "../../src/simulation/model-registry.js";
import { COMMITTED_DEPLOY_CALENDAR_EVIDENCE } from "../../src/simulation-context/evidence.js";
import { BLOOD_CHARACTER_BINDING } from "../../src/specs/deathknight/blood/character-binding.js";
import { BLOOD_ENVIRONMENT_FACTS_BY_MODEL } from "../../src/specs/deathknight/blood/environment-facts.js";
import {
  reconstructionInputOf,
  subjectEvidence,
  withOwnerStatements,
} from "../../tests/support/character/subject.js";
import {
  subjectContextFight,
  subjectEnvironmentInput,
  subjectRegion,
} from "../../tests/support/environment/subject-environment.js";

declare const process: any;

const MODEL_ID: string = process.env["MODEL_ID"] ?? "";
const IMAGE: string | undefined = process.env["SIMC_IMAGE"];
const OUT = join(".probe", "m11g43");
const BENCH_CACHE_SECRET = new TextEncoder().encode("TEST-ONLY-g43-bench-cache-integrity-key-not-a-secret");

describe.skipIf(IMAGE === undefined)("M11-G4-3 production CHARACTER gate on the real engine", () => {
  it("the canonical fight's CHARACTER gate is SIMULATION_READY on the transported real-engine echo", async () => {
    const model = simulationModelById(MODEL_ID);
    if (model === undefined) throw new Error("MODEL_ID must name a registered simulation model");
    expect(IMAGE).toBe(model.imageId);
    mkdirSync(OUT, { recursive: true });
    const cacheDir = mkdtempSync(join(tmpdir(), "wlc-g43-bench-"));
    try {
      const capacity = DEV_LOCAL_CAPACITY_V1;
      const launcher = new DockerLauncher(
        {
          imageRef: IMAGE ?? "",
          dockerExecutable: process.env["DOCKER_EXE"] ?? "docker",
          cpus: capacity.threadsPerJob,
          cliEnv: process.env,
        },
        limitsForCapacity(capacity, DEFAULT_RUNNER_LIMITS),
      );
      const service = composeSimulationService({
        engines: [
          {
            artifact: model.artifact,
            launcher,
            prepareLauncher: async () => {
              await launcher.resolveBinarySha256();
            },
          },
        ],
        cache: new FileSystemSimulationCache(cacheDir),
        cacheIntegrity: await CacheIntegrity.fromSecret(BENCH_CACHE_SECRET),
        // A publication deployment enables probes alongside PRODUCTION.
        allowedJobClasses: ["PRODUCTION", "FIDELITY_PROBE"],
        capacity,
        hostLogicalCpu: availableParallelism(),
      });
      expect((await service.start()).ready).toBe(true);
      const backend = new LocalSimulationBackend(service, APPROVED_ENGINE_ARTIFACTS, RUNNER_SPEC_BINDINGS);

      const evidence = await subjectEvidence();
      const environmentInput = await subjectEnvironmentInput(model.id);
      const { fight, reportStartUnixMs } = subjectContextFight();
      const started = Date.now();
      const outcome = await assessPublicationReadiness(
        {
          specKey: "deathknight/blood",
          character: BLOOD_CHARACTER_BINDING,
          environmentFactsByModel: BLOOD_ENVIRONMENT_FACTS_BY_MODEL,
        },
        {
          fight: {
            report: { startTimeUnixMs: reportStartUnixMs, region: subjectRegion() },
            fight: { startTimeMs: fight.startTime },
          },
          characterInputFor: (data) =>
            withOwnerStatements(reconstructionInputOf(evidence, data.manifest.modelId)),
          environmentInputFor: (_data, applicability) => ({
            ...environmentInput,
            modelApplicability: applicability,
          }),
          observed: { state: "UNKNOWN", reason: "stage A only" },
        },
        {
          deployEvidence: COMMITTED_DEPLOY_CALENDAR_EVIDENCE,
          modelValidations: RUNNER_MODEL_VALIDATIONS,
          profileEcho: backendProfileEchoSource(backend),
          backend,
          artifacts: APPROVED_ENGINE_ARTIFACTS,
          simulationBindings: RUNNER_SPEC_BINDINGS,
        },
      );
      writeFileSync(
        join(OUT, "stage-a.json"),
        JSON.stringify({ wallMs: Date.now() - started, image: IMAGE, outcome }, null, 1),
        "utf8",
      );
      if (outcome.ok) throw new Error("the canonical environment is expected to block");
      // CONTEXT and CHARACTER passed on the real engine: the first failing gate is ENVIRONMENT.
      expect(outcome.publication.simulationModelId).toBe(model.id);
      expect(outcome.publication.gate?.gate).toBe("ENVIRONMENT");
      expect(outcome.publication.gate?.code).toBe("ENVIRONMENT_NOT_PUBLISHABLE");
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  }, 900_000);
});
