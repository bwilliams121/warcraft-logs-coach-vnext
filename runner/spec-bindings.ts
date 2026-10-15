/**
 * The specializations this runner simulates (M11-G3-1). The runner is the
 * composition root: each specialization's tree owns its binding, and adding
 * one is a reviewed edit here — the shared runtime never names a spec.
 */

import type { SimulationSpecBinding } from "../src/simulation/spec-binding.js";
import { BLOOD_SIMULATION_BINDING } from "../src/specs/deathknight/blood/simulation-binding.js";

export const RUNNER_SPEC_BINDINGS: readonly SimulationSpecBinding[] = [BLOOD_SIMULATION_BINDING];
