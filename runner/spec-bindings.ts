/**
 * The specializations this runner simulates (M11-G3-1). The runner is the
 * composition root: each specialization's tree owns its binding, and adding
 * one is a reviewed edit here — the shared runtime never names a spec.
 */

import type { SpecSimulationModelValidations } from "../src/simulation/model-registry.js";
import type { SimulationSpecBinding } from "../src/simulation/spec-binding.js";
import {
  BLOOD_SIMULATION_BINDING,
  BLOOD_SIMULATION_MODEL_VALIDATIONS,
} from "../src/specs/deathknight/blood/simulation-binding.js";

export const RUNNER_SPEC_BINDINGS: readonly SimulationSpecBinding[] = [BLOOD_SIMULATION_BINDING];

/**
 * Each simulated specialization's PRODUCTION validations of simulation models
 * (M11 model registry), owned by the spec's tree. A model a spec has not
 * validated cannot run a PRODUCTION job for it.
 */
export const RUNNER_MODEL_VALIDATIONS: readonly SpecSimulationModelValidations[] = [
  { specKey: BLOOD_SIMULATION_BINDING.specKey, validations: BLOOD_SIMULATION_MODEL_VALIDATIONS },
];
