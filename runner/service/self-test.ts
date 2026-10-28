/**
 * STARTUP SELF-TEST (M11-G3-5): before the service reports READY it runs one
 * small runner-owned job through the SAME executor as every caller job, and
 * re-verifies the result against the identity recomputed from that job. A
 * missing engine, a wrong image, a wrong binary hash, a wrong model revision
 * or a broken parser therefore keeps the service NOT READY; it never serves a
 * caller first and discovers the problem later.
 *
 * The job is a DEVELOPMENT_FIXTURE: a Blood Death Knight carrying only a
 * main-hand weapon, 60 s, BENCHMARK_300_T1 (300 iterations, one thread). Its
 * DPS means nothing and is never cached or returned. It is not submitted through
 * the service, so the caller allowlist (which excludes BENCHMARK_300_T1) does
 * not apply to it.
 */

import { fail, succeed, type SimulationOutcome } from "../../src/simulation/failures.js";
import type { ApprovedEngineArtifact, SimcModelPin } from "../../src/simulation/model.js";
import { expectedResultIdentity, verifySimulationResult } from "../../src/simulation/result-verification.js";
import type { SimulationSpecBinding } from "../../src/simulation/spec-binding.js";
import { simulationPolicyById } from "../../src/simulation/simulation-policy.js";
import type { ExecuteJob } from "./service.js";

export const SELF_TEST_POLICY_ID = "BENCHMARK_300_T1";

/** The self-test job for one engine: it names THAT engine's model. */
export function selfTestJob(model: SimcModelPin): unknown {
  const policy = simulationPolicyById(SELF_TEST_POLICY_ID);
  if (policy === undefined) throw new Error(`self-test: unknown policy ${SELF_TEST_POLICY_ID}`);
  return {
    schemaVersion: "simulation-job/1",
    model: { simcCommit: model.simcCommit, gameDataBuild: model.gameDataBuild },
    character: {
      profileKind: "DEVELOPMENT_FIXTURE",
      spec: "deathknight/blood",
      level: 90,
      race: "dwarf",
      talents: {
        importString:
          "CoPAAAAAAAAAAAAAAAAAAAAAAwYWGzMmxMjhZbmZmmZxMjxMGAAAAwMzMzMzMDzYMAYMzMzAAAYgBmxmGLbAWGwGgZMDAAYmBzwA",
      },
      gear: [
        {
          slot: "main_hand",
          itemId: 237846,
          bonusIds: [12214, 12497, 13751, 14004, 12715, 8790, 13836],
          gems: { kind: "KNOWN_NONE" },
          enchant: { kind: "KNOWN", enchantId: 6241 },
        },
      ],
      consumables: {
        provenance: "DEVELOPMENT_FIXTURE",
        potion: "NONE",
        flask: "NONE",
        food: "NONE",
        augmentation: "NONE",
        temporaryEnchants: [],
      },
    },
    environment: {
      durationPolicy: "FIXED_EXACT_OBSERVED",
      durationMs: 60_000,
      primaryTarget: "SINGLE_TARGET",
      tankModel: "STANDARD_TANK_LOAD_V1",
      raidBuffs: { provenance: "DEVELOPMENT_FIXTURE", active: [] },
      bloodlust: { kind: "NONE", provenance: "DEVELOPMENT_FIXTURE" },
      additionalTargets: [],
    },
    executionProfileId: "ELITE_REALISTIC_V1",
    simulationPolicy: {
      policyId: policy.id,
      iterations: policy.iterations,
      seed: policy.seed,
      threads: policy.threads,
      deterministic: true,
      timeoutMs: policy.timeoutMs,
    },
    requestedOutputs: { actionBreakdown: false, petBreakdown: false },
  };
}

/** Runs the self-test job through `execute` and re-verifies the result. */
export function selfTestStartupCheck(
  execute: ExecuteJob,
  artifact: ApprovedEngineArtifact,
  bindings: readonly SimulationSpecBinding[],
): () => Promise<SimulationOutcome<null>> {
  return async () => {
    const job = selfTestJob(artifact.model);
    const bytes = new TextEncoder().encode(JSON.stringify(job)).byteLength;
    const expected = await expectedResultIdentity(job, bytes, artifact, bindings);
    if (!expected.ok) return expected;
    const outcome = await execute(job, bytes, new AbortController().signal);
    if (!outcome.ok) return outcome;
    const verified = verifySimulationResult(outcome.value, expected.value);
    if (!verified.ok) return verified;
    return verified.value.dps.mean > 0
      ? succeed(null)
      : fail("SIMULATION_OUTPUT_MALFORMED", "self-test: no DPS");
  };
}
