/**
 * The typed SIMULATION RESULT (M11-G3-1): `simulation-result/1`.
 *
 * This — not SimulationCraft's raw JSON — is the product contract. It carries
 * the identity of everything that produced the number (model, profile,
 * environment, execution profile, policy) and the precision of the number.
 * There is no "empty" or zero result: a run that cannot produce a valid one
 * is a typed `SimulationFailure`.
 *
 * `diagnostics` holds run-to-run noise (wall clock, event counts); it is
 * excluded from semantic equality. Everything else must reproduce.
 */

export const SIMULATION_RESULT_SCHEMA_VERSION = "simulation-result/1";

export interface SimulationActionBreakdownEntry {
  /** Engine action name (e.g. `heart_strike`). */
  readonly actionName: string;
  /** Spell id the engine reports for the action; 0 when it reports none. */
  readonly spellId: number;
  /** Mean damage per iteration (engine `compound_amount`). */
  readonly meanDamagePerIteration: number;
  /** Mean executes per iteration; null when the engine reports no execute count (never 0 by default). */
  readonly meanExecutesPerIteration: number | null;
}

export interface SimulationPetBreakdownEntry {
  /** Engine pet name (e.g. `bloodworm`). Mapping to WCL actors is NOT done here. */
  readonly petName: string;
  readonly meanDamagePerIteration: number;
}

export interface SimulationResult {
  readonly schemaVersion: typeof SIMULATION_RESULT_SCHEMA_VERSION;
  readonly model: {
    readonly requestedSimcCommit: string;
    readonly reportedGitRevision: string;
    readonly gameDataBuild: string;
    readonly binarySha256: string;
    readonly buildRecipeRevision: string;
  };
  readonly profileHash: string;
  readonly environmentHash: string;
  readonly executionProfile: { readonly id: string; readonly version: number };
  readonly simulationPolicy: { readonly id: string; readonly version: number };
  readonly iterations: { readonly requested: number; readonly counted: number };
  /** Player DPS including its pets, as the engine reports it. */
  readonly dps: {
    readonly mean: number;
    readonly standardDeviation: number;
    readonly standardError: number;
    readonly relativeStandardError: number;
    readonly ci95: { readonly lower: number; readonly upper: number };
  };
  readonly actionBreakdown?: readonly SimulationActionBreakdownEntry[];
  readonly petBreakdown?: readonly SimulationPetBreakdownEntry[];
  readonly diagnostics: {
    readonly engineWallSeconds: number;
    readonly engineCpuSeconds: number;
    readonly eventsProcessed: number;
  };
  readonly provenance: {
    readonly parserRevision: string;
    readonly inputBuilderRevision: string;
    readonly reportVersion: string;
    readonly engineVersion: string;
    readonly hotfixHash: string;
    readonly networkingCompiledOut: true;
    readonly simulatedDurationMs: number;
    /** SimC knows the exact fight end: `fight_remains` is perfect information. */
    readonly durationAssumption: "EXACT_OBSERVED_DURATION_CEILING_ASSUMPTION";
    readonly tankModel: string;
    readonly consumablesProvenance: string;
    readonly raidBuffsProvenance: string;
    readonly bloodlustProvenance: string;
  };
}

/**
 * Compares two results for REPRODUCTION: every identity field must be equal
 * and every number within `relativeTolerance`. `diagnostics` is ignored.
 * Returns the first differing path, or null when they agree.
 */
export function firstSemanticDifference(
  a: SimulationResult,
  b: SimulationResult,
  relativeTolerance: number,
): string | null {
  const { diagnostics: _a, ...left } = a;
  const { diagnostics: _b, ...right } = b;
  return difference(left, right, relativeTolerance, "");
}

function difference(left: unknown, right: unknown, tolerance: number, path: string): string | null {
  if (typeof left === "number" && typeof right === "number") {
    const scale = Math.max(Math.abs(left), Math.abs(right));
    return Math.abs(left - right) <= tolerance * scale ? null : path;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return `${path}.length`;
    for (let index = 0; index < left.length; index += 1) {
      const found = difference(left[index], right[index], tolerance, `${path}[${String(index)}]`);
      if (found !== null) return found;
    }
    return null;
  }
  if (typeof left === "object" && left !== null && typeof right === "object" && right !== null) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of [...keys].sort()) {
      const found = difference(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
        tolerance,
        `${path}.${key}`,
      );
      if (found !== null) return found;
    }
    return null;
  }
  return Object.is(left, right) ? null : path || "(root)";
}
