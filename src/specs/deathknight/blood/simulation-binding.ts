/**
 * Blood Death Knight's SIMULATION BINDING (M11-G3-1): what this
 * specialization means to the pinned SimulationCraft engine.
 *
 * The shared simulation runtime (`src/simulation/`) is spec-agnostic; this is
 * the only place the engine's Blood tokens live. It carries no gameplay
 * judgment — a simulated number is an input to later analysis, not a
 * decision — and the runtime never consults Blood's APL authority.
 *
 * Blood is a tank, so every Blood job runs under the standardized incoming-
 * damage model (STANDARD_TANK_LOAD_V1), which is a standardized input, never
 * a reconstruction of the damage the player took.
 */

import type { SpecSimulationModelValidation } from "../../../simulation/model-registry.js";
import type { SimulationSpecBinding } from "../../../simulation/spec-binding.js";

import { BLOOD_DEATH_KNIGHT_DISPLAY_NAME, BLOOD_DEATH_KNIGHT_SPEC_ID } from "./spec.js";

export const BLOOD_SIMULATION_BINDING: SimulationSpecBinding = {
  specKey: BLOOD_DEATH_KNIGHT_SPEC_ID,
  simcClassToken: "deathknight",
  simcSpecToken: "blood",
  // engine/player/player.cpp writes `util::specialization_string(spec)`; for
  // Blood that is the roster display name.
  reportedSpecialization: BLOOD_DEATH_KNIGHT_DISPLAY_NAME,
  simcRole: "tank",
  requiresTankModel: true,
};

/**
 * Which SIMULATION MODELS Blood has validated for PRODUCTION (M11 model
 * registry), each for one Live game build over a fight-time window no wider
 * than its evidence. Kept OUT of BLOOD_SIMULATION_BINDING: the binding is part
 * of every engine-run key, and declaring a validation must not move the cache
 * identity of any job.
 *
 * - 33622e9d / 12.1.0.69587: the M11-G3 contract validation (exact-pin echo,
 *   fidelity, parser, runner). Its data is ONE Live snapshot (upstream
 *   473ed41f2b, hotfix 2026-09-10); the next Live snapshot (0908ace08c) is a
 *   different build, so the window runs from that snapshot to the next one and
 *   claims no hotfix stability beyond it.
 * - 0a72e6a7 / 12.1.0.69933: the M11 model-pin investigation. Blood-relevant
 *   data is equivalent at three Live snapshots — 0a72e6a746 (2026-09-22T20:05Z),
 *   7cbb6ef5ff (2026-09-30T23:34Z; bit-identical Blood simulations) and
 *   698c86ba67 (2026-10-01T23:06Z) — and the canonical subject (b1Pma #48,
 *   2026-10-01T01:01Z) is fidelity MATCH on it. The window is bounded by the
 *   first and last of those snapshots, nothing wider.
 */
export const BLOOD_SIMULATION_MODEL_VALIDATIONS: readonly SpecSimulationModelValidation[] = [
  {
    modelId: "SIMC_33622E9D_LIVE_12_1_0_69587",
    scope: "PRODUCTION",
    gameBuild: "12.1.0.69587",
    window: { fromUtc: "2026-09-10T20:43:00Z", toUtc: "2026-09-13T00:34:27Z" },
    windowBasis: "SINGLE_SNAPSHOT_UNTIL_NEXT_LIVE_SNAPSHOT",
    evidence: "M11-G3-1..G3-5 exact-pin Blood validation; upstream data snapshot 473ed41f2b",
  },
  {
    modelId: "SIMC_0A72E6A7_LIVE_12_1_0_69933",
    scope: "PRODUCTION",
    gameBuild: "12.1.0.69933",
    window: { fromUtc: "2026-09-22T20:05:35Z", toUtc: "2026-10-01T23:06:26Z" },
    windowBasis: "SNAPSHOTS_VERIFIED_EQUIVALENT_FOR_SPEC",
    evidence: "M11 model-pin investigation (2026-10-23): snapshots 0a72e6a746, 7cbb6ef5ff, 698c86ba67",
  },
];
