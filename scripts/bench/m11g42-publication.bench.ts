/**
 * M11-G4-2 REAL-ENGINE proof of the PUBLISHED path (owner decision
 * 2026-10-28: synthetic gate inputs plus the real engine; this proves
 * orchestration, NOT real-log reconstruction fidelity).
 *
 * Stage B of the publication pipeline runs a SYNTHETIC plan, built from:
 * - the canonical character, owner-stated race, on the 0a72e6a7 model;
 * - the development environment relabelled ACTUAL_OBSERVED for this bench
 *   only.
 *
 * It runs through the real runner service composed as in PRODUCTION
 * (PRODUCTION job class only) over the 0a72e6a7 Docker image. The runner must
 * accept the pipeline's PRODUCTION job and attestation, and the verified
 * result must publish.
 *
 *   MODEL_ID=SIMC_0A72E6A7_LIVE_12_1_0_69933 SIMC_IMAGE=sha256:<image id> \
 *     npx vitest run --config scripts/bench/vitest.config.ts scripts/bench/m11g42-publication.bench.ts
 *
 * Output: .probe/m11g42/publication.json (gitignored).
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
import { PRODUCTION_JOB_CLASSES } from "../../runner/service/service.js";
import { limitsForCapacity } from "../../runner/service/engine.js";
import { reconstructCharacterProfile } from "../../src/character-profile/reconstruct.js";
import {
  NO_PROFILE_ECHO_SOURCE,
  runPublication,
  type PublicationPlan,
} from "../../src/publication/pipeline.js";
import { simulationModelById } from "../../src/simulation/model-registry.js";
import { COMMITTED_DEPLOY_CALENDAR_EVIDENCE } from "../../src/simulation-context/evidence.js";
import { BLOOD_CHARACTER_BINDING } from "../../src/specs/deathknight/blood/character-binding.js";
import {
  reconstructionInputOf,
  subjectEvidence,
  withOwnerStatements,
} from "../../tests/support/character/subject.js";
import { productionJob } from "../../tests/support/simulation/runner-service.js";

declare const process: any;

const MODEL_ID: string = process.env["MODEL_ID"] ?? "";
const IMAGE: string | undefined = process.env["SIMC_IMAGE"];
const OUT = join(".probe", "m11g42");
const BENCH_CACHE_SECRET = new TextEncoder().encode("TEST-ONLY-g42-bench-cache-integrity-key-not-a-secret");

type Json = Record<string, any>;

describe.skipIf(IMAGE === undefined)("M11-G4-2 publication on the real engine (synthetic plan)", () => {
  it("the production-configured runner accepts the pipeline's PRODUCTION job and the verified result publishes", async () => {
    const model = simulationModelById(MODEL_ID);
    if (model === undefined) throw new Error("MODEL_ID must name a registered simulation model");
    expect(IMAGE).toBe(model.imageId);
    mkdirSync(OUT, { recursive: true });
    const cacheDir = mkdtempSync(join(tmpdir(), "wlc-g42-bench-"));
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
        // The production default: only publishable work runs.
        allowedJobClasses: PRODUCTION_JOB_CLASSES,
        capacity,
        hostLogicalCpu: availableParallelism(),
      });
      const readiness = await service.start();
      expect(readiness.ready).toBe(true);

      const evidence = await subjectEvidence();
      const profile = reconstructCharacterProfile(
        withOwnerStatements(reconstructionInputOf(evidence, model.id)),
        BLOOD_CHARACTER_BINDING,
      );
      const planFor = (durationMs: number): PublicationPlan => {
        const job = productionJob(0, model.id) as Json;
        job["environment"]["durationMs"] = durationMs;
        return {
          specKey: "deathknight/blood",
          context: { specKey: "deathknight/blood", gameBuild: model.pin.gameDataBuild, fightStartUtc: null },
          model,
          applicability: {
            modelId: model.id,
            specKey: "deathknight/blood",
            gameBuild: model.pin.gameDataBuild,
            fightStartUtc: "SYNTHETIC",
            window: { fromUtc: "SYNTHETIC", toUtc: "SYNTHETIC" },
            windowBasis: "SNAPSHOTS_VERIFIED_EQUIVALENT_FOR_SPEC",
          },
          profile,
          character: BLOOD_CHARACTER_BINDING,
          translation: {
            purpose: "CURRENT_SETUP",
            environment: job["environment"],
            consumableVariants: [
              { id: "synthetic-0", ranks: [], consumables: job["character"]["consumables"] },
            ],
            ledger: [],
          },
          observed: { state: "UNKNOWN", reason: "SYNTHETIC_PLAN" },
        };
      };
      const deps = {
        deployEvidence: COMMITTED_DEPLOY_CALENDAR_EVIDENCE,
        modelValidations: RUNNER_MODEL_VALIDATIONS,
        profileEcho: NO_PROFILE_ECHO_SOURCE,
        backend: new LocalSimulationBackend(service, APPROVED_ENGINE_ARTIFACTS, RUNNER_SPEC_BINDINGS),
        artifacts: APPROVED_ENGINE_ARTIFACTS,
        simulationBindings: RUNNER_SPEC_BINDINGS,
      };
      const report: Record<string, unknown> = { image: IMAGE };
      const run = async (label: string, durationMs: number) => {
        const started = Date.now();
        const publication = await runPublication(planFor(durationMs), deps);
        report[label] = { durationMs, wallMs: Date.now() - started, publication };
        writeFileSync(join(OUT, "publication.json"), JSON.stringify(report, null, 1), "utf8");
        return publication;
      };

      // 1. The canonical fight's length (345,177 ms): the verified result publishes.
      const published = await run("canonicalLength", 345_177);
      expect(published.gate).toBeNull();
      expect(published.status).toBe("PUBLISHED");
      expect(published.simulationModelId).toBe(model.id);
      expect(published.variants[0]?.relativeStandardError).toBeLessThanOrEqual(0.0012);
      expect(published.attainment).toEqual({ state: "UNKNOWN", reason: "OBSERVED_DPS_UNKNOWN" });
      expect(published.provenance.executionProfileRevisions).toHaveLength(1);

      // 2. A 60 s fight misses both policies' precision bounds on the real engine:
      // exactly one escalation, then a refusal, never a less precise number.
      const refused = await run("shortFight", 60_000);
      expect(refused.status).toBe("NOT_PUBLISHED");
      expect(refused.gate?.code).toBe("PRECISION_INSUFFICIENT");
      expect(refused.gate?.reasons.join(" ")).toContain("> 0.0006");
      expect(refused.simulated).toBeNull();
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  }, 900_000);
});
