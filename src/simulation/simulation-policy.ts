/**
 * Versioned SIMULATION POLICIES (M11-G3-1): how many iterations, which seed,
 * how many threads, and the RNG normalization — all part of a result's
 * identity.
 *
 * Every policy is deterministic (`deterministic=1`, an explicit seed, a FIXED
 * iteration count, a FIXED thread count) and never uses `target_error`, which
 * randomizes fight lengths and makes the iteration count dynamic
 * (engine/sim/sim.cpp:1683, :2243). Expected RNG, never one iteration, never a
 * perfect-RNG override, never the logged fight's RNG.
 *
 * Reproducibility at the pin: with deterministic=1 the iterations are
 * statically partitioned per thread (sim.cpp:3394) and thread i is seeded
 * `seed + i` (sim.cpp:2655), so the THREAD COUNT is part of a result's
 * identity. A single-threaded run is bit-identical; a multi-threaded run
 * differs only by floating-point merge order, so results are compared with a
 * relative tolerance (RESULT_REPRODUCIBILITY_TOLERANCE).
 */

export interface SimulationPolicy {
  readonly id: string;
  readonly version: number;
  readonly status: "CANDIDATE" | "BENCHMARK_ONLY" | "FIDELITY_ONLY";
  readonly iterations: number;
  readonly seed: number;
  readonly threads: number;
  readonly deterministic: true;
  readonly averageRange: true;
  readonly averageGauss: false;
  readonly timeoutMs: number;
  /** A result whose relative standard error exceeds this fails SIMULATION_PRECISION_NOT_MET. */
  readonly maxRelativeStandardError: number;
}

/** Relative tolerance for comparing two runs of the same job (multi-thread merge-order noise is ~1e-15). */
export const RESULT_REPRODUCIBILITY_TOLERANCE = 1e-9;

const SEED = 20261014;

const policy = (
  id: string,
  status: SimulationPolicy["status"],
  iterations: number,
  threads: number,
  maxRelativeStandardError: number,
): SimulationPolicy => ({
  id,
  version: 1,
  status,
  iterations,
  seed: SEED,
  threads,
  deterministic: true,
  averageRange: true,
  averageGauss: false,
  timeoutMs: 60_000,
  maxRelativeStandardError,
});

/**
 * STANDARD_SIM_V1 / PRECISION_ESCALATED_V1 are CANDIDATES pending the
 * exact-pin benchmark (thread counts are fixed per policy; the production host
 * is chosen in G3-5). The BENCHMARK_* policies exist only to measure.
 */
export const SIMULATION_POLICIES: readonly SimulationPolicy[] = [
  policy("STANDARD_SIM_V1", "CANDIDATE", 2_000, 8, 0.0012),
  policy("PRECISION_ESCALATED_V1", "CANDIDATE", 8_000, 8, 0.0006),
  policy("BENCHMARK_2K_T12", "BENCHMARK_ONLY", 2_000, 12, 0.0012),
  policy("BENCHMARK_5K_T12", "BENCHMARK_ONLY", 5_000, 12, 0.0008),
  policy("BENCHMARK_10K_T12", "BENCHMARK_ONLY", 10_000, 12, 0.0006),
  policy("BENCHMARK_300_T1", "BENCHMARK_ONLY", 300, 1, 0.01),
  // M11-G3-2: profile-fidelity probes read the engine echo back; their DPS is
  // not a result, so precision is not gated (any finite SE passes).
  policy("FIDELITY_PROBE_V1", "FIDELITY_ONLY", 200, 4, 1),
];

export function simulationPolicyById(id: string): SimulationPolicy | undefined {
  return SIMULATION_POLICIES.find((entry) => entry.id === id);
}
