/**
 * Run a PROFILE-FIDELITY probe (M11-G3-2): reconstructed profile -> the one
 * G3-1 job path (prepare -> launcher -> parseSimcJson) -> the engine's profile
 * echo -> `assessProfileFidelity`.
 *
 * The probe's simulation numbers are never returned: a fidelity probe is not a
 * result. A failed run, a provenance mismatch or an unreadable echo is a typed
 * failure, never a fidelity verdict.
 */

import type { CharacterSpecBinding } from "../src/character-profile/binding.js";
import { assessProfileFidelity, type ProfileFidelityResult } from "../src/character-profile/fidelity.js";
import type { CharacterProfile } from "../src/character-profile/profile.js";
import type { CombatantPullFacts } from "../src/character-profile/pull-facts.js";
import { fidelityProbeJob } from "../src/character-profile/simulation-character.js";
import { fail, succeed, type SimulationOutcome } from "../src/simulation/failures.js";
import type { ApprovedEngineArtifact } from "../src/simulation/model.js";
import { prepareSimulation } from "../src/simulation/prepare.js";
import { extractProfileEcho } from "../src/simulation/profile-echo.js";
import { parseSimcJson } from "../src/simulation/result-parser.js";

import type { EngineLauncher } from "./engine-launcher.js";

export interface FidelityRun {
  readonly fidelity: ProfileFidelityResult;
  /** The engine report, for golden-artifact review only. */
  readonly rawReport: string;
  readonly jobProfileHash: string;
}

export async function runProfileFidelity(
  profile: CharacterProfile,
  binding: CharacterSpecBinding,
  pullFacts: CombatantPullFacts | null,
  artifact: ApprovedEngineArtifact,
  launcher: EngineLauncher,
): Promise<SimulationOutcome<FidelityRun>> {
  const job = fidelityProbeJob(profile, binding);
  if (!job.ok) return job;
  const body = JSON.stringify(job.value);
  const prepared = await prepareSimulation(job.value, new TextEncoder().encode(body).byteLength, artifact, [
    binding.simulation,
  ]);
  if (!prepared.ok) return prepared;
  const launched = await launcher.launch({
    input: prepared.value.input,
    timeoutMs: prepared.value.policy.timeoutMs,
  });
  if (launched.kind !== "COMPLETED") {
    return fail(
      launched.kind === "TIMEOUT" ? "SIMULATION_TIMEOUT" : "SIMULATION_ENGINE_FAILED",
      launched.kind,
    );
  }
  const parsed = parseSimcJson(launched.json, launched.jsonBytes, {
    job: prepared.value.job,
    binding: prepared.value.binding,
    profile: prepared.value.profile,
    policy: prepared.value.policy,
    approved: artifact,
    executedBinarySha256: launched.executedBinarySha256,
    profileHash: prepared.value.keys.profileHash,
    environmentHash: prepared.value.keys.environmentHash,
  });
  if (!parsed.ok) return parsed;
  const echo = extractProfileEcho(launched.json);
  if (!echo.ok) return echo;
  return succeed({
    fidelity: assessProfileFidelity(profile, binding, echo.value, pullFacts),
    rawReport: launched.json,
    jobProfileHash: prepared.value.keys.profileHash,
  });
}
