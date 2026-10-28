/**
 * M11-G3-2: EXACT-PIN profile-fidelity round trip for the canonical subject.
 *
 * Reconstructs b1PmaKrd6CDfzngc#48 actor 15 from committed evidence only,
 * runs the LOGGED_FIDELITY_PROBE job through the approved artifact (Docker,
 * `--network none`), reads the engine echo back and assesses fidelity. Writes
 * to .probe/m11g3/g32/ (gitignored): the raw report, the fidelity result and
 * the internal reconstruction report. With WRITE_GOLDEN=1 it also re-cuts the
 * committed golden echo fixture.
 *
 * M11-G3-4: a second run applies the owner's USER_PROVIDED race statement
 * (tests/fixtures/character/canonical-subject-user-statements.json) and re-cuts
 * its own golden (…-subject-fidelity-user-race.json). The plain run and its
 * golden are unchanged.
 *
 * No DPS is reported: the probe is not a performance simulation.
 *
 * M11 model registry: MODEL_ID names the simulation model (default: the
 * historical 33622e9d model); SIMC_IMAGE must be that model's registered image,
 * and goldens are written per model (simc-<short commit>-…).
 *
 *     [MODEL_ID=<id>] SIMC_IMAGE=sha256:<image id> [WRITE_GOLDEN=1] npx vitest run --config scripts/bench/vitest.config.ts scripts/bench/m11g32-profile-fidelity.bench.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DockerLauncher } from "../../runner/engine-launcher.js";
import { DEFAULT_RUNNER_LIMITS } from "../../runner/limits.js";
import { runProfileFidelity } from "../../runner/run-fidelity.js";
import { semanticProfileHash } from "../../src/character-profile/profile-hash.js";
import { readCombatantPullFacts } from "../../src/character-profile/pull-facts.js";
import { reconstructCharacterProfile } from "../../src/character-profile/reconstruct.js";
import { renderReconstructionReport } from "../../src/character-profile/report.js";
import { simulationModelById } from "../../src/simulation/model-registry.js";
import { BLOOD_CHARACTER_BINDING } from "../../src/specs/deathknight/blood/character-binding.js";
import {
  reconstructionInputOf,
  subjectEvidence,
  withOwnerStatements,
} from "../../tests/support/character/subject.js";
import { goldenProjection } from "../../tests/support/simulation/golden.js";

declare const process: any;

const IMAGE: string | undefined = process.env["SIMC_IMAGE"];
const MODEL_ID: string = process.env["MODEL_ID"] ?? "SIMC_33622E9D_LIVE_12_1_0_69587";
const MODEL = simulationModelById(MODEL_ID);
if (MODEL === undefined) throw new Error(`MODEL_ID ${MODEL_ID} is not a registered simulation model`);
/** Golden/output names carry the model: simc-<first 8 of the commit>-… */
const SHORT = MODEL.pin.simcCommit.slice(0, 8);
const OUT = join(".probe", "m11g3", "g32", SHORT);
const GOLDEN = join("tests", "fixtures", "simulation", `simc-${SHORT}-blood-subject-fidelity.json`);
const GOLDEN_USER_RACE = join(
  "tests",
  "fixtures",
  "simulation",
  `simc-${SHORT}-blood-subject-fidelity-user-race.json`,
);

describe.skipIf(IMAGE === undefined)("M11-G3-2 exact-pin profile fidelity", () => {
  it(
    "reconstructs the subject and reads it back from the approved engine",
    { timeout: 600_000 },
    async () => {
      mkdirSync(OUT, { recursive: true });
      const artifact = MODEL.artifact;
      expect(IMAGE, "SIMC_IMAGE must be the model's registered image").toBe(MODEL.imageId);
      const launcher = new DockerLauncher(
        {
          imageRef: IMAGE ?? "",
          dockerExecutable: process.env["DOCKER_EXE"] ?? "docker",
          cpus: 4,
          cliEnv: process.env,
        },
        { ...DEFAULT_RUNNER_LIMITS, maxWallClockMs: 120_000 },
      );
      expect(await launcher.resolveBinarySha256()).toBe(artifact.binarySha256);

      const evidence = await subjectEvidence();
      const input = reconstructionInputOf(evidence, MODEL_ID);
      const profile = reconstructCharacterProfile(input, BLOOD_CHARACTER_BINDING);
      const hash = await semanticProfileHash(profile);
      const run = await runProfileFidelity(
        profile,
        BLOOD_CHARACTER_BINDING,
        readCombatantPullFacts(evidence.rawCombatantInfo),
        artifact,
        launcher,
      );
      if (!run.ok) {
        writeFileSync(join(OUT, "failure.json"), JSON.stringify(run.failure, null, 2), "utf8");
        throw new Error(`${run.failure.code}: ${run.failure.detail}`);
      }
      writeFileSync(join(OUT, "raw-fidelity-report.json"), run.value.rawReport, "utf8");
      writeFileSync(join(OUT, "fidelity.json"), JSON.stringify(run.value.fidelity, null, 2), "utf8");
      writeFileSync(
        join(OUT, "subject-report.md"),
        renderReconstructionReport(profile, run.value.fidelity, hash),
        "utf8",
      );
      if (process.env["WRITE_GOLDEN"] === "1") {
        const golden = goldenProjection(run.value.rawReport, {
          source: `approved engine ${artifact.binarySha256}`,
          job: "fidelityProbeJob(reconstructCharacterProfile(canonical G3-2 subject), BLOOD_CHARACTER_BINDING)",
          jobProfileHash: run.value.jobProfileHash,
        });
        writeFileSync(GOLDEN, `${JSON.stringify(golden, null, 1)}\n`, "utf8");
      }
      expect(run.value.fidelity.status).not.toBe("FAILED");

      // ---- M11-G3-4: the same subject with the owner's USER_PROVIDED race ----
      const stated = reconstructCharacterProfile(withOwnerStatements(input), BLOOD_CHARACTER_BINDING);
      const statedRun = await runProfileFidelity(
        stated,
        BLOOD_CHARACTER_BINDING,
        readCombatantPullFacts(evidence.rawCombatantInfo),
        artifact,
        launcher,
      );
      if (!statedRun.ok) throw new Error(`${statedRun.failure.code}: ${statedRun.failure.detail}`);
      writeFileSync(
        join(OUT, "fidelity-user-race.json"),
        JSON.stringify(statedRun.value.fidelity, null, 2),
        "utf8",
      );
      writeFileSync(
        join(OUT, "subject-report-user-race.md"),
        renderReconstructionReport(stated, statedRun.value.fidelity, await semanticProfileHash(stated)),
        "utf8",
      );
      if (process.env["WRITE_GOLDEN"] === "1") {
        const golden = goldenProjection(statedRun.value.rawReport, {
          source: `approved engine ${artifact.binarySha256}`,
          job: "fidelityProbeJob(reconstructCharacterProfile(withOwnerStatements(canonical G3-2 subject)), BLOOD_CHARACTER_BINDING)",
          jobProfileHash: statedRun.value.jobProfileHash,
        });
        writeFileSync(GOLDEN_USER_RACE, `${JSON.stringify(golden, null, 1)}\n`, "utf8");
      }
      expect(statedRun.value.fidelity.status).not.toBe("FAILED");
    },
  );
});
