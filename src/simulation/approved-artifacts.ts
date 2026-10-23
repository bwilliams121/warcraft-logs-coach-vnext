/**
 * APPROVED ENGINE ARTIFACTS (M11-G3-1; moved here from runner/ at M11-G3-5 so
 * the Worker-side client can verify a remote result against the same identity
 * the runner executes — runner/approved-artifacts.ts re-exports it).
 *
 * An entry is added only after the exact-pin build in runner/simc-build/ has
 * produced a binary whose own JSON identity was verified against the pin
 * (git_revision a prefix of the approved commit, live client data
 * 12.1.0.69587, networking compiled out). The binary SHA-256 recorded here
 * comes from runner/simc-build/build-record.json; a runner hashes the binary
 * it actually executes and refuses any other (MODEL_PROVENANCE_MISMATCH).
 *
 * A runner with no approved artifact answers RUNNER_UNAVAILABLE — it never
 * falls back to a nightly or a Windows build. A rebuild produces a new binary
 * hash (the engine compiles in __DATE__/__TIME__) and needs its own entry.
 */

import { APPROVED_SIMC_MODEL, type ApprovedEngineArtifact } from "./model.js";

/** Revision of the build recipe (runner/simc-build/Dockerfile). Bump on any recipe change. */
export const BUILD_RECIPE_REVISION = "simc-build/1";

export const APPROVED_ENGINE_ARTIFACTS: readonly ApprovedEngineArtifact[] = [
  // Built 2026-10-14 (image sha256:8ab91e722bd4c6e50a58a38a1244d2688bdaf3ddc68e09cd2aa59877f8b7aaf4,
  // Alpine 3.24.2 by digest, clang 22.1.3). Verified by its own JSON: git_revision
  // 33622e9d16, client data 12.1.0.69587 (Live), no_networking true.
  {
    model: APPROVED_SIMC_MODEL,
    binarySha256: "41347bc4203bd1b073a617cd9cd147a96c9c09a36f8c7af5c013ca7be273cb77",
    buildRecipeRevision: BUILD_RECIPE_REVISION,
  },
];
