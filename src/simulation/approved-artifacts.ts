/**
 * APPROVED ENGINE ARTIFACTS (M11-G3-1; moved here from runner/ at M11-G3-5 so
 * the Worker-side client can verify a remote result against the same identity
 * the runner executes — runner/approved-artifacts.ts re-exports it).
 *
 * Since the M11 model registry this is a VIEW of the registry: one artifact
 * per registered simulation model (model-registry.ts), never edited here.
 * Every artifact stays approved permanently, so historical results remain
 * reproducible:
 *
 *   33622e9d / 12.1.0.69587  binary 41347bc4…  image sha256:8ab91e72…  (M11-G3-1)
 *   0a72e6a7 / 12.1.0.69933  binary 79bf5a40…  image sha256:efea14b4…  (M11 promotion)
 *
 * An entry exists only after the exact-pin build in runner/simc-build/ produced
 * a binary whose own JSON identity was verified (git_revision a prefix of the
 * commit, Live client data, networking compiled out). A runner hashes the
 * binary it actually executes and refuses any other (MODEL_PROVENANCE_MISMATCH).
 * A rebuild produces a new binary hash and needs its own registered model.
 */

import { SIMULATION_MODELS } from "./model-registry.js";
import type { ApprovedEngineArtifact, SimcModelPin } from "./model.js";

/** Revision of the build recipe (runner/simc-build/Dockerfile). Bump on any recipe change. */
export const BUILD_RECIPE_REVISION = "simc-build/1";

export const APPROVED_ENGINE_ARTIFACTS: readonly ApprovedEngineArtifact[] = SIMULATION_MODELS.map(
  (model) => model.artifact,
);

/** The approved artifact for an exact pin, if one is registered. */
export function approvedArtifactForPin(pin: SimcModelPin): ApprovedEngineArtifact | undefined {
  return APPROVED_ENGINE_ARTIFACTS.find(
    (artifact) =>
      artifact.model.simcCommit === pin.simcCommit && artifact.model.gameDataBuild === pin.gameDataBuild,
  );
}
