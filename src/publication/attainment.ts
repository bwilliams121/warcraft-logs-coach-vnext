/**
 * M11-G4-2 derived values: the simulated envelope across consumable variants
 * (G3-4: run every variant, report the envelope, never sum sensitivities) and
 * attainment = observed ÷ simulated.
 *
 * Attainment is KNOWN only when observed DPS is KNOWN and its comparability
 * with the engine's DPS is PROVEN (owner decision 2026-10-28). It is then the
 * interval [observed ÷ envelope.high, observed ÷ envelope.low]: the widest
 * reading the simulation uncertainty allows, never a point estimate.
 */

import type {
  Attainment,
  DpsComparability,
  ObservedDps,
  SimulatedEnvelope,
  VariantSimulation,
} from "./record.js";

export function envelopeOf(variants: readonly VariantSimulation[]): SimulatedEnvelope | null {
  if (variants.length === 0) return null;
  return {
    low: Math.min(...variants.map((variant) => variant.ci95.lower)),
    high: Math.max(...variants.map((variant) => variant.ci95.upper)),
    meanRange: {
      min: Math.min(...variants.map((variant) => variant.mean)),
      max: Math.max(...variants.map((variant) => variant.mean)),
    },
  };
}

export function attainmentOf(
  observed: ObservedDps,
  simulated: SimulatedEnvelope | null,
  comparability: DpsComparability,
): Attainment {
  if (simulated === null) return { state: "UNKNOWN", reason: "SIMULATION_NOT_PUBLISHED" };
  if (observed.state !== "KNOWN") return { state: "UNKNOWN", reason: "OBSERVED_DPS_UNKNOWN" };
  if (comparability !== "PROVEN") return { state: "UNKNOWN", reason: "ATTAINMENT_NOT_COMPARABLE" };
  if (!(simulated.low > 0) || !(simulated.high >= simulated.low)) {
    return { state: "UNKNOWN", reason: "SIMULATED_ENVELOPE_NOT_POSITIVE" };
  }
  return { state: "KNOWN", low: observed.dps / simulated.high, high: observed.dps / simulated.low };
}
