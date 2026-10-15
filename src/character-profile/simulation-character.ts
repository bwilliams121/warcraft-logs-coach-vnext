/**
 * CharacterProfile -> SimulationJob character (M11-G3-2).
 *
 * Writes only what the profile KNOWS. Bonus, gem and enchant ids go to the
 * engine exactly as observed (the engine decodes item level and crafted stats
 * from them; no `ilevel=` or `crafted_stats=` override is ever written, so a
 * mis-decode cannot be papered over). KNOWN_NONE becomes the job's explicit
 * KNOWN_NONE; UNKNOWN never becomes anything.
 *
 * Two purposes:
 *
 * - FIDELITY_PROBE: read the engine echo back. Allowed with exactly one open
 *   blocker class — RACE_UNRESOLVED — in which case race is the explicit
 *   engine token "none" on a LOGGED_FIDELITY_PROBE job that can never be a
 *   ceiling. Consumables, raid buffs and Bloodlust are FIDELITY_CONTROL
 *   (nothing): this is not the player's environment and does not pretend to be.
 * - CEILING: requires a SIMULATION_READY profile (fidelity MATCH); G3-2 never
 *   produces one while race is unresolved.
 */

import { fail, succeed, type SimulationOutcome } from "../simulation/failures.js";
import { SIMULATION_JOB_SCHEMA_VERSION, type SimulationJob } from "../simulation/job.js";
import { APPROVED_SIMC_MODEL } from "../simulation/model.js";
import { simulationPolicyById } from "../simulation/simulation-policy.js";
import type { CharacterSpecBinding } from "./binding.js";
import type { CharacterProfile, Evidenced } from "./profile.js";

export const FIDELITY_PROBE_DURATION_MS = 300_000;
export const FIDELITY_PROBE_POLICY_ID = "FIDELITY_PROBE_V1";

type JobGear = SimulationJob["character"]["gear"][number];
type JobGems = JobGear extends { readonly gems: infer G } ? G : never;
type JobEnchant = JobGear extends { readonly enchant: infer E } ? E : never;

export function fidelityProbeJob(
  profile: CharacterProfile,
  binding: CharacterSpecBinding,
): SimulationOutcome<SimulationJob> {
  const other = profile.blockers.filter((blocker) => blocker.code !== "RACE_UNRESOLVED");
  if (other.length > 0) {
    return fail(
      "PROFILE_RECONSTRUCTION_FAILED",
      `blockers: ${other.map((blocker) => blocker.code).join(", ")}`,
    );
  }
  const level = profile.identity.level;
  const race = profile.identity.race;
  const importCode = profile.talents.importCode;
  if ((level.state !== "KNOWN" && level.state !== "MODEL_ASSUMPTION") || importCode.state !== "KNOWN") {
    return fail("PROFILE_RECONSTRUCTION_FAILED", "level or talents not established");
  }
  const gear: JobGear[] = [];
  for (const record of profile.equipment) {
    if (record.occupancy !== "EQUIPPED") continue;
    const gemsState = jobIds(record.gems);
    const enchantState = jobEnchant(record.permanentEnchant);
    // A stat-less cosmetic item (shirt, tabard) whose fields are not all known
    // stays evidence only: it has no simulation effect and is not written.
    if (record.statless && (record.bonusIds.state !== "KNOWN" || gemsState === null || enchantState === null))
      continue;
    if (record.itemId.state !== "KNOWN" || record.bonusIds.state !== "KNOWN") {
      return fail("PROFILE_RECONSTRUCTION_FAILED", `${record.slot}: item or bonus ids not KNOWN`);
    }
    const gems = gemsState;
    const enchant = enchantState;
    if (gems === null || enchant === null)
      return fail("PROFILE_RECONSTRUCTION_FAILED", `${record.slot}: gems or enchant UNKNOWN`);
    gear.push({
      slot: record.slot,
      itemId: record.itemId.value,
      bonusIds: [...record.bonusIds.value],
      gems,
      enchant,
    });
  }
  const policy = simulationPolicyById(FIDELITY_PROBE_POLICY_ID);
  if (policy === undefined) return fail("JOB_REJECTED", "fidelity probe policy missing");
  return succeed({
    schemaVersion: SIMULATION_JOB_SCHEMA_VERSION,
    model: { simcCommit: APPROVED_SIMC_MODEL.simcCommit, gameDataBuild: APPROVED_SIMC_MODEL.gameDataBuild },
    character: {
      profileKind: "LOGGED_FIDELITY_PROBE",
      spec: binding.simulation.specKey,
      level: level.value,
      race: race.state === "KNOWN" ? race.value : "none",
      talents: { importString: importCode.value },
      gear,
      consumables: {
        provenance: "FIDELITY_CONTROL",
        potion: "NONE",
        flask: "NONE",
        food: "NONE",
        augmentation: "NONE",
        temporaryEnchants: [],
      },
    },
    environment: {
      durationPolicy: "FIXED_EXACT_OBSERVED",
      durationMs: FIDELITY_PROBE_DURATION_MS,
      primaryTarget: "SINGLE_TARGET",
      tankModel: "STANDARD_TANK_LOAD_V1",
      raidBuffs: { provenance: "FIDELITY_CONTROL", active: [] },
      bloodlust: { kind: "NONE", provenance: "FIDELITY_CONTROL" },
      additionalTargets: [],
    },
    executionProfileId: "SIMC_DEFAULT_PINNED",
    simulationPolicy: {
      policyId: policy.id,
      iterations: policy.iterations,
      seed: policy.seed,
      threads: policy.threads,
      deterministic: true,
      timeoutMs: policy.timeoutMs,
    },
    requestedOutputs: { actionBreakdown: false, petBreakdown: false },
  });
}

function jobIds(state: Evidenced<readonly number[]>): JobGems | null {
  if (state.state === "KNOWN") return { kind: "KNOWN", gemIds: [...state.value] };
  if (state.state === "KNOWN_NONE") return { kind: "KNOWN_NONE" };
  return null;
}

function jobEnchant(state: Evidenced<number>): JobEnchant | null {
  if (state.state === "KNOWN") return { kind: "KNOWN", enchantId: state.value };
  if (state.state === "KNOWN_NONE") return { kind: "KNOWN_NONE" };
  return null;
}
