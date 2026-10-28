/**
 * M11-G3-5 final hardening: readiness gate revisions.
 *
 * A PRODUCTION simulation attestation names the revisions of the two gates
 * that declared the job ready (G3-2 profile readiness, G3-4 environment
 * publishability). The runner accepts only the CURRENT revisions
 * (src/simulation/readiness-attestation.ts), which it cannot import from the
 * gates (layering), so this contract keeps them identical.
 *
 * It also pins a code FINGERPRINT of each gate (comments and whitespace
 * ignored) per revision. Changing gate code without deciding whether the
 * gate's MEANING changed fails here. The fix is one of:
 *
 *   - meaning changed: bump the gate-owned revision, the runner's accepted
 *     revision, and add the new fingerprint under the new revision;
 *   - meaning unchanged (pure refactor): update the fingerprint for the SAME
 *     revision, and say so in review.
 *
 * Either way an old attestation can never be silently honoured under a
 * changed policy. Data revisions the gates read are versioned separately.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PROFILE_READINESS_GATE_REVISION } from "../../src/character-profile/fidelity.js";
import { ENVIRONMENT_PUBLISHABILITY_GATE_REVISION } from "../../src/environment/publishability.js";
import { ACCEPTED_READINESS_GATE_REVISIONS } from "../../src/simulation/readiness-attestation.js";

declare const process: { cwd(): string };

const code = (file: string): string =>
  readFileSync(join(process.cwd(), file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
    .replace(/\s+/g, " ")
    .trim();

const fingerprint = (files: readonly string[]): string =>
  createHash("sha256")
    .update(files.map((file) => `${file}\n${code(file)}`).join("\n"))
    .digest("hex");

const PROFILE_GATE_FILES = ["src/character-profile/fidelity.ts", "src/character-profile/reconstruct.ts"];
const ENVIRONMENT_GATE_FILES = [
  "src/environment/assumptions.ts",
  "src/environment/materiality.ts",
  "src/environment/publishability.ts",
  "src/environment/reconstruct.ts",
  "src/environment/translate.ts",
];

/**
 * Reviewed fingerprints, by revision.
 *
 * Re-pin history (same revision; meaning unchanged):
 * - M11 model registry (2026-10-23): character-profile/reconstruct.ts and
 *   environment/reconstruct.ts read consumable, token-acceptance and
 *   raid-environment data from the NAMED simulation model's bundle (injected
 *   through the reconstruction input) instead of module-level 33622e9d
 *   singletons. Every rule, threshold and verdict is unchanged; the 33622e9d
 *   reconstruction and publishability tests pass unmodified. Previous pins:
 *   profile 2f3e68f0…, environment 6914caa3….
 * - M11 model-registry closeout (2026-10-28): environment/reconstruct.ts takes
 *   the caller's validated model applicability. Inside a validated window for
 *   THIS model, the age-only MODEL_BUILD_LAG diagnostic becomes the
 *   informational MODEL_SNAPSHOT_PRECEDES_LOG. Both are diagnostics, which
 *   publishability never blocks on. Blockers, status, materiality and the
 *   environment hash are identical with and without the applicability
 *   (tests/unit/simulation/model-0a72e6a7-canonical.test.ts). Previous pin:
 *   environment e26b184f….
 */
const PINNED: Record<string, string> = {
  "profile-readiness-gate/1": "fbf0aace1f399d3ed70748a4fa00a3d19c396b6a567e5aedac61ebe8c284205b",
  "environment-publishability-gate/1": "12b313594d4b69b92ae87cb12dd9cda1fe351feb1624026d0838a0c29800b2d9",
};

describe("M11-G3-5 readiness gate revisions", () => {
  it("the runner accepts exactly the gates' current revisions", () => {
    expect(ACCEPTED_READINESS_GATE_REVISIONS.profile).toEqual([PROFILE_READINESS_GATE_REVISION]);
    expect(ACCEPTED_READINESS_GATE_REVISIONS.environment).toEqual([ENVIRONMENT_PUBLISHABILITY_GATE_REVISION]);
  });

  it("the profile readiness gate's code matches the fingerprint reviewed for its revision", () => {
    expect(
      fingerprint(PROFILE_GATE_FILES),
      `profile gate code changed: bump ${PROFILE_READINESS_GATE_REVISION} if SIMULATION_READY's meaning changed, else re-pin`,
    ).toBe(PINNED[PROFILE_READINESS_GATE_REVISION]);
  });

  it("the environment publishability gate's code matches the fingerprint reviewed for its revision", () => {
    expect(
      fingerprint(ENVIRONMENT_GATE_FILES),
      `environment gate code changed: bump ${ENVIRONMENT_PUBLISHABILITY_GATE_REVISION} if PUBLISHABLE's meaning changed, else re-pin`,
    ).toBe(PINNED[ENVIRONMENT_PUBLISHABILITY_GATE_REVISION]);
  });
});
