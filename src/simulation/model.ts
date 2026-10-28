/**
 * SimulationCraft MODEL IDENTITY and how an engine artifact proves it is that
 * model (M11-G3-1).
 *
 * Which models are approved, and where each applies, is the simulation-model
 * registry (model-registry.ts). There is no default model: a job names its
 * model (`job.model`) and it must resolve to exactly one registered model.
 *
 * An engine ARTIFACT is a specific built binary. Its identity is checked from
 * the engine's OWN structured output (JSON `git_revision` and the live client
 * data build) and from the runner-computed SHA-256 of the binary — never from
 * a filename, image tag or deployment label. The pinned Makefile embeds only
 * `git rev-parse --short HEAD`, so the reported revision must be a prefix of
 * the approved full commit and at least seven characters long; the full
 * commit is pinned by the build recipe that produced the binary hash.
 *
 * Networking is compiled out of every approved artifact (SC_NO_NETWORKING);
 * the pinned JSON report states it as `no_networking: true`
 * (engine/report/json/report_json.cpp:1396), and its absence is a mismatch.
 */

import { fail, succeed, type SimulationOutcome } from "./failures.js";

export interface SimcModelPin {
  readonly simcCommit: string;
  readonly gameDataBuild: string;
}

/**
 * The maximum character level of EVERY registered simulation model
 * (engine/config.hpp:176 is MAX_LEVEL = 90 at 33622e9d and at 0a72e6a746). A
 * model with a different maximum must not be registered until this is split
 * per model.
 */
export const PINNED_ENGINE_MAX_LEVEL = 90;

/** One approved built engine artifact. */
export interface ApprovedEngineArtifact {
  readonly model: SimcModelPin;
  /** SHA-256 of the engine binary, lowercase hex. */
  readonly binarySha256: string;
  /** The recipe that produced it (runner/simc-build), revisioned. */
  readonly buildRecipeRevision: string;
}

/** What the engine and the runner observed at run time. */
export interface ObservedEngineIdentity {
  /** JSON `git_revision` (short hash), or null when the binary embeds none. */
  readonly reportedGitRevision: string | null;
  /** JSON `sim.options.dbc.Live.wow_version`. */
  readonly reportedGameDataBuild: string | null;
  /** Runner-computed SHA-256 of the binary it executed. */
  readonly binarySha256: string;
  /** JSON `no_networking` === true. */
  readonly networkingCompiledOut: boolean;
}

export interface SimcModelIdentity {
  readonly simcCommit: string;
  readonly reportedGitRevision: string;
  readonly gameDataBuild: string;
  readonly binarySha256: string;
  readonly buildRecipeRevision: string;
}

const MIN_SHORT_HASH = 7;

/**
 * Accepts the run only if every identity field agrees with the approved
 * artifact. Any disagreement is MODEL_PROVENANCE_MISMATCH naming the field;
 * no parsed number from such a run is valid.
 */
export function verifyEngineIdentity(
  observed: ObservedEngineIdentity,
  approved: ApprovedEngineArtifact,
): SimulationOutcome<SimcModelIdentity> {
  const revision = observed.reportedGitRevision;
  if (
    revision === null ||
    revision.length < MIN_SHORT_HASH ||
    !/^[0-9a-f]+$/.test(revision) ||
    !approved.model.simcCommit.startsWith(revision)
  ) {
    return fail(
      "MODEL_PROVENANCE_MISMATCH",
      `git_revision: expected a prefix of ${approved.model.simcCommit}, got ${String(revision)}`,
    );
  }
  if (observed.reportedGameDataBuild !== approved.model.gameDataBuild) {
    return fail(
      "MODEL_PROVENANCE_MISMATCH",
      `game_data_build: expected ${approved.model.gameDataBuild}, got ${String(observed.reportedGameDataBuild)}`,
    );
  }
  if (!observed.networkingCompiledOut) {
    return fail(
      "MODEL_PROVENANCE_MISMATCH",
      "no_networking: the engine does not report networking compiled out",
    );
  }
  if (observed.binarySha256 !== approved.binarySha256) {
    return fail(
      "MODEL_PROVENANCE_MISMATCH",
      `binary_sha256: expected ${approved.binarySha256}, got ${observed.binarySha256}`,
    );
  }
  return succeed({
    simcCommit: approved.model.simcCommit,
    reportedGitRevision: revision,
    gameDataBuild: observed.reportedGameDataBuild,
    binarySha256: observed.binarySha256,
    buildRecipeRevision: approved.buildRecipeRevision,
  });
}
