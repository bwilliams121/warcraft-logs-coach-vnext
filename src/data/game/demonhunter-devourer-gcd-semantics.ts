/**
 * Devourer Demon Hunter's execution-lane and token-identity facts (ONB-B3).
 *
 * THE DEMON HUNTER BINDING OF THE CLASS-NEUTRAL INDEX. The lane rule is the one in
 * `gcd-semantics-index.ts` over `demonhunter-devourer-gcd-semantics.json`, which the extractor
 * produced from the same pinned commit as every other dataset under a `demonhunter-devourer`
 * target profile. Nothing here reads another specialization's dataset.
 */

import artifact from "./demonhunter-devourer-gcd-semantics.json";
import {
  baseGcdMsForAbilityIn,
  executionLaneForAbilityIn,
  executionLaneForTokenIn,
  loadGcdSemantics,
  resolveTokenBindingIn,
  type ExecutionLane,
  type GcdSemanticsLoad,
  type LoadedGcdSemantics,
  type TokenBinding,
} from "./gcd-semantics-index.js";

export const DEVOURER_DEMON_HUNTER_GCD_DATASET_ID = "SIMC_DBC_DEMONHUNTER_DEVOURER_GCD_SEMANTICS";

let cached: LoadedGcdSemantics | null = null;

function load(): LoadedGcdSemantics {
  cached ??= loadGcdSemantics(artifact);
  return cached;
}

/** The pinned dataset, or the reason it could not be used. */
export function pinnedDevourerDemonHunterGcdSemantics(): GcdSemanticsLoad {
  return load().load;
}

/** The base GCD of one ability, by NUMBER. `null` means no record, never "no GCD". */
export function devourerDemonHunterBaseGcdMsForAbility(abilityGameId: number): number | null {
  return baseGcdMsForAbilityIn(load().index, abilityGameId);
}

/** The execution lane of one ability, by NUMBER. `UNKNOWN_LANE` is a refusal. */
export function devourerDemonHunterExecutionLaneForAbility(abilityGameId: number): ExecutionLane {
  return executionLaneForAbilityIn(load().index, abilityGameId);
}

/** What the pinned sources establish about a Devourer Demon Hunter APL token's identity. */
export function devourerDemonHunterTokenBinding(simcToken: string): TokenBinding {
  return resolveTokenBindingIn(load().index, simcToken);
}

/** The execution lane of a TOKEN, proven only when every candidate agrees. */
export function devourerDemonHunterExecutionLaneForToken(simcToken: string): ExecutionLane {
  return executionLaneForTokenIn(load().index, simcToken);
}

/**
 * The inverse of the pinned token bindings: ability id -> SimulationCraft token.
 * Derived from the committed artifact. An id bound by two tokens is dropped rather
 * than resolved arbitrarily, and an id with a lane record but no token is absent.
 */
export function devourerDemonHunterTokenByAbilityId(): ReadonlyMap<number, string> {
  const index = load().index;
  if (index === null) return new Map();
  const seen = new Map<number, string | null>();
  for (const binding of index.artifact.tokenBindings) {
    for (const abilityGameId of binding.candidateAbilityGameIds) {
      const existing = seen.get(abilityGameId);
      seen.set(
        abilityGameId,
        existing === undefined || existing === binding.simcToken ? binding.simcToken : null,
      );
    }
  }
  const resolved = new Map<number, string>();
  for (const [abilityGameId, token] of seen) if (token !== null) resolved.set(abilityGameId, token);
  return resolved;
}
