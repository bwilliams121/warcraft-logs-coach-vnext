/**
 * SIMULATION SPEC BINDINGS (M11-G3-1).
 *
 * The simulation runtime is specialization-agnostic. What a specialization
 * MEANS to the engine — its class and spec tokens, the specialization string
 * the engine reports back, its role — is owned by that specialization's tree
 * (`src/specs/<class>/<spec>/simulation-binding.ts`) and handed to the
 * runtime by the composition root (the runner). A job whose spec has no
 * binding is UNSUPPORTED_SPEC.
 */

export interface SimulationSpecBinding {
  /** The job's spec key, `<class>/<spec>` (e.g. the roster key). */
  readonly specKey: string;
  /** The engine's actor-declaration token (`<token>=<name>`). */
  readonly simcClassToken: string;
  /** The engine's `spec=` value. */
  readonly simcSpecToken: string;
  /** The specialization string the pinned JSON report writes for the actor. */
  readonly reportedSpecialization: string;
  /** The engine's `role=` value. */
  readonly simcRole: "tank" | "attack" | "spell" | "heal";
  /** Whether jobs for this spec must use a standardized tank-load model. */
  readonly requiresTankModel: boolean;
}

export function bindingForSpec(
  bindings: readonly SimulationSpecBinding[],
  specKey: string,
): SimulationSpecBinding | undefined {
  return bindings.find((binding) => binding.specKey === specKey);
}
