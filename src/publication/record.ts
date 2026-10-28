/**
 * M11-G4-2 SIMULATION PUBLICATION record (`simulation-publication/1`):
 * internal only (owner decision 2026-10-28). It is an OBSERVATION: what an
 * elite execution of the player's own logged character, in the reconstructed
 * logged environment, simulates to, and how the observed DPS compares when
 * that comparison is proven sound. It carries no cause, no coaching and no
 * recommendation; attribution is G6.
 */

export const SIMULATION_PUBLICATION_SCHEMA_VERSION = "simulation-publication/1";
export const PUBLICATION_REVISION = "simulation-publication-pipeline/1";

/** The gate that stopped publication, in pipeline order. */
export type PublicationGate = "CONTEXT" | "CHARACTER" | "ENVIRONMENT" | "SIMULATION";

export type PublicationGateCode =
  // CONTEXT
  | "CONTEXT_UNRESOLVED"
  | "MODEL_NOT_AVAILABLE"
  | "MODEL_NOT_VALIDATED_FOR_SPEC"
  | "MODEL_DATA_UNAVAILABLE"
  // CHARACTER
  | "PROFILE_RECONSTRUCTION_FAILED"
  | "FIDELITY_PROBE_UNAVAILABLE"
  | "FIDELITY_PROBE_FAILED"
  | "PROFILE_NOT_SIMULATION_READY"
  // ENVIRONMENT
  | "SPEC_FACTS_UNAVAILABLE_FOR_MODEL"
  | "ENVIRONMENT_NOT_PUBLISHABLE"
  | "ENVIRONMENT_TRANSLATION_FAILED"
  // SIMULATION
  | "JOB_CONSTRUCTION_FAILED"
  | "NOT_CEILING_ELIGIBLE"
  | "JOB_PREPARATION_FAILED"
  | "SIMULATION_UNAVAILABLE"
  | "SIMULATION_RESULT_INVALID"
  | "PRECISION_INSUFFICIENT";

export interface PublicationGateFailure {
  readonly gate: PublicationGate;
  readonly code: PublicationGateCode;
  /** The underlying codes and details (e.g. the simulation failure code). */
  readonly reasons: readonly string[];
}

export interface VariantSimulation {
  readonly variantId: string;
  readonly policyId: string;
  /** True when this result came from the one permitted escalation. */
  readonly escalated: boolean;
  readonly mean: number;
  readonly ci95: { readonly lower: number; readonly upper: number };
  readonly relativeStandardError: number;
  readonly iterations: number;
}

/** Observed DPS as the caller established it (G1 ACTUAL_DPS), never computed here. */
export type ObservedDps =
  | { readonly state: "KNOWN"; readonly dps: number; readonly source: string }
  | { readonly state: "UNKNOWN"; readonly reason: string };

/**
 * Whether observed DPS and the engine's "player DPS including pets" measure the
 * same thing. NOT_PROVEN keeps attainment UNKNOWN (owner decision).
 */
export type DpsComparability = "PROVEN" | "NOT_PROVEN";

export type Attainment =
  | { readonly state: "KNOWN"; readonly low: number; readonly high: number }
  | {
      readonly state: "UNKNOWN";
      readonly reason:
        | "ATTAINMENT_NOT_COMPARABLE"
        | "OBSERVED_DPS_UNKNOWN"
        | "SIMULATION_NOT_PUBLISHED"
        | "SIMULATED_ENVELOPE_NOT_POSITIVE";
    };

export interface SimulatedEnvelope {
  /** min over variants of ci95.lower. */
  readonly low: number;
  /** max over variants of ci95.upper. */
  readonly high: number;
  readonly meanRange: { readonly min: number; readonly max: number };
}

export interface SimulationPublication {
  readonly schemaVersion: typeof SIMULATION_PUBLICATION_SCHEMA_VERSION;
  readonly revision: typeof PUBLICATION_REVISION;
  readonly status: "PUBLISHED" | "NOT_PUBLISHED";
  /** The first failing gate; null exactly when PUBLISHED. */
  readonly gate: PublicationGateFailure | null;
  readonly context: {
    readonly specKey: string;
    readonly gameBuild: string | null;
    readonly fightStartUtc: string | null;
  };
  readonly simulationModelId: string | null;
  readonly variants: readonly VariantSimulation[];
  readonly simulated: SimulatedEnvelope | null;
  readonly observed: ObservedDps;
  readonly attainment: Attainment;
  readonly provenance: {
    readonly executionProfileId: string | null;
    /**
     * The execution profile revision(s) the verified results ran, cross-checked
     * against each prepared job. One entry when PUBLISHED (every variant runs
     * the same profile); empty when nothing was simulated.
     */
    readonly executionProfileRevisions: readonly string[];
    readonly profileHash: string | null;
    readonly environmentHashes: readonly string[];
    readonly gateRevisions: { readonly profile: string; readonly environment: string };
  };
}
