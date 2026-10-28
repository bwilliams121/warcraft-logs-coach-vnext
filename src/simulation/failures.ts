/**
 * Typed simulation failures (M11-G3-1). A failure is never a number: no code
 * path turns any of these into 0 DPS, an empty breakdown or a default result.
 */

export const SIMULATION_FAILURE_CODES = [
  "UNSUPPORTED_MODEL_VERSION",
  // Simulation-model selection (M11 model registry): no model for the log's
  // context, a model the spec never validated, or a context that is unresolved.
  "SIMULATION_MODEL_NOT_AVAILABLE",
  "SIMULATION_MODEL_NOT_VALIDATED_FOR_SPEC",
  "SIMULATION_MODEL_CONTEXT_UNRESOLVED",
  "UNSUPPORTED_SPEC",
  "PROFILE_RECONSTRUCTION_FAILED",
  "ENVIRONMENT_NOT_REPRESENTABLE",
  "JOB_REJECTED",
  "SIMULATION_TIMEOUT",
  "SIMULATION_ENGINE_FAILED",
  "SIMULATION_OUTPUT_MALFORMED",
  "SIMULATION_PRECISION_NOT_MET",
  "MODEL_PROVENANCE_MISMATCH",
  "RUNNER_UNAVAILABLE",
  "RUNNER_OVERLOADED",
  "CANCELLED",
] as const;

export type SimulationFailureCode = (typeof SIMULATION_FAILURE_CODES)[number];

export interface SimulationFailure {
  readonly code: SimulationFailureCode;
  /** Machine-readable detail, e.g. the offending field path or the mismatching identity field. */
  readonly detail: string;
}

export type SimulationOutcome<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly failure: SimulationFailure };

export const fail = <T>(code: SimulationFailureCode, detail: string): SimulationOutcome<T> => ({
  ok: false,
  failure: { code, detail },
});

export const succeed = <T>(value: T): SimulationOutcome<T> => ({ ok: true, value });
