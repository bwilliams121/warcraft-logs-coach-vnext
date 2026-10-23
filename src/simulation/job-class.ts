/**
 * SIMULATION JOB CLASS (M11-G3-5): what a job is FOR, read from the job's own
 * typed provenance — never from a caller-supplied label.
 *
 *   FIDELITY_PROBE  a LOGGED_FIDELITY_PROBE: reads the engine echo back; never a ceiling
 *   DIAGNOSTIC      any DIAGNOSTIC_RECONSTRUCTION provenance (G3-4): never a ceiling
 *   DEVELOPMENT     a development fixture anywhere: test/benchmark data; never a ceiling
 *   PRODUCTION      a LOGGED_RECONSTRUCTION whose consumables, raid buffs and
 *                   Bloodlust are all ACTUAL_OBSERVED — the only class that may
 *                   ever be published, and only with a readiness attestation
 *
 * Only PRODUCTION results are publishable. The service and the Worker client
 * both derive the class from the job; a response cannot upgrade it.
 */

import type { SimulationJob } from "./job.js";

export const SIMULATION_JOB_CLASSES = ["DEVELOPMENT", "FIDELITY_PROBE", "DIAGNOSTIC", "PRODUCTION"] as const;
export type SimulationJobClass = (typeof SIMULATION_JOB_CLASSES)[number];

export function classifySimulationJob(job: SimulationJob): SimulationJobClass {
  if (job.character.profileKind === "LOGGED_FIDELITY_PROBE") return "FIDELITY_PROBE";
  const provenances = [
    job.character.consumables.provenance,
    job.environment.raidBuffs.provenance,
    job.environment.bloodlust.provenance,
  ];
  if (provenances.includes("DIAGNOSTIC_RECONSTRUCTION")) return "DIAGNOSTIC";
  if (
    job.character.profileKind === "LOGGED_RECONSTRUCTION" &&
    provenances.every((value) => value === "ACTUAL_OBSERVED")
  ) {
    return "PRODUCTION";
  }
  return "DEVELOPMENT";
}

export const isPublishableClass = (jobClass: SimulationJobClass): boolean => jobClass === "PRODUCTION";
