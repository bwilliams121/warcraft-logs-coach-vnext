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
 * No DPS is reported: the probe is not a performance simulation.
 *
 *     SIMC_IMAGE=sha256:<image id> npx vitest run --config scripts/bench/vitest.config.ts scripts/bench/m11g32-profile-fidelity.bench.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { APPROVED_ENGINE_ARTIFACTS } from "../../runner/approved-artifacts.js";
import { DockerLauncher } from "../../runner/engine-launcher.js";
import { DEFAULT_RUNNER_LIMITS } from "../../runner/limits.js";
import { runProfileFidelity } from "../../runner/run-fidelity.js";
import { semanticProfileHash } from "../../src/character-profile/profile-hash.js";
import { readCombatantPullFacts } from "../../src/character-profile/pull-facts.js";
import { reconstructCharacterProfile } from "../../src/character-profile/reconstruct.js";
import { renderReconstructionReport } from "../../src/character-profile/report.js";
import { BLOOD_CHARACTER_BINDING } from "../../src/specs/deathknight/blood/character-binding.js";
import { reconstructionInputOf, subjectEvidence } from "../../tests/support/character/subject.js";
import { goldenProjection } from "../../tests/support/simulation/golden.js";

declare const process: any;

const IMAGE: string | undefined = process.env["SIMC_IMAGE"];
const OUT = join(".probe", "m11g3", "g32");
const GOLDEN = join("tests", "fixtures", "simulation", "simc-33622e9d-blood-subject-fidelity.json");

describe.skipIf(IMAGE === undefined)("M11-G3-2 exact-pin profile fidelity", () => {
  it(
    "reconstructs the subject and reads it back from the approved engine",
    { timeout: 600_000 },
    async () => {
      mkdirSync(OUT, { recursive: true });
      const artifact = APPROVED_ENGINE_ARTIFACTS[0];
      if (artifact === undefined) throw new Error("no approved artifact");
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
      const input = reconstructionInputOf(evidence);
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
    },
  );
});
