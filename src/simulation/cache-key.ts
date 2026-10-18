/**
 * Simulation CACHE KEYS (M11-G3-1).
 *
 * The ENGINE-RUN key identifies one engine execution: everything that can
 * change the engine's input or the engine itself. Two jobs with the same key
 * produce semantically identical results (within the reproducibility
 * tolerance), so a cached result may be reused.
 *
 * The PARSED-RESULT key adds the parser revision: a parser change invalidates
 * parsed results without re-running the engine.
 *
 * Neither key contains a player name, report code, fight id, actor id, host
 * path or timestamp — the job cannot carry them.
 */

import { canonicalJson, environmentHash, profileHash, sha256Hex } from "./canonical.js";
import type { ExecutionProfile } from "./execution-profiles.js";
import { executionProfileRevision } from "./execution-revision.js";
import { INPUT_BUILDER_REVISION } from "./input-builder.js";
import { SIMULATION_JOB_SCHEMA_VERSION, type SimulationJob } from "./job.js";
import type { ApprovedEngineArtifact } from "./model.js";
import { RESULT_PARSER_REVISION } from "./result-parser.js";
import type { SimulationPolicy } from "./simulation-policy.js";
import type { SimulationSpecBinding } from "./spec-binding.js";

export interface SimulationCacheKeys {
  readonly profileHash: string;
  readonly environmentHash: string;
  readonly engineRunKey: string;
  readonly parsedResultKey: string;
  readonly executionProfileRevision: string;
}

export async function simulationCacheKeys(
  job: SimulationJob,
  binding: SimulationSpecBinding,
  artifact: ApprovedEngineArtifact,
  profile: ExecutionProfile,
  policy: SimulationPolicy,
): Promise<SimulationCacheKeys> {
  const profileDigest = await profileHash(job.character);
  const environmentDigest = await environmentHash(job.environment);
  const executionDigest = await executionProfileRevision(profile);
  const engineRun = {
    kind: "simulation-engine-run-key/1",
    jobSchema: SIMULATION_JOB_SCHEMA_VERSION,
    simcCommit: artifact.model.simcCommit,
    gameDataBuild: artifact.model.gameDataBuild,
    binarySha256: artifact.binarySha256,
    buildRecipeRevision: artifact.buildRecipeRevision,
    inputBuilderRevision: INPUT_BUILDER_REVISION,
    specBinding: binding,
    profileHash: profileDigest,
    environmentHash: environmentDigest,
    executionProfile: {
      id: profile.id,
      version: profile.version,
      revision: executionDigest,
      settings: { sim: profile.sim, player: profile.player },
    },
    simulationPolicy: { id: policy.id, version: policy.version },
    iterations: policy.iterations,
    seed: policy.seed,
    threads: policy.threads,
    requestedOutputs: job.requestedOutputs,
  };
  const engineRunKey = await sha256Hex(canonicalJson(engineRun));
  const parsedResultKey = await sha256Hex(
    canonicalJson({
      kind: "simulation-parsed-result-key/1",
      engineRunKey,
      parserRevision: RESULT_PARSER_REVISION,
    }),
  );
  return {
    profileHash: profileDigest,
    environmentHash: environmentDigest,
    engineRunKey,
    parsedResultKey,
    executionProfileRevision: executionDigest,
  };
}
