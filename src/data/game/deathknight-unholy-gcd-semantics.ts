/**
 * Unholy Death Knight's execution-lane and token-identity facts (ONB-X5).
 *
 * THE DEATH KNIGHT BINDING OF THE CLASS-NEUTRAL INDEX. The lane rule is the one in
 * `gcd-semantics-index.ts` over `deathknight-unholy-gcd-semantics.json`, which the extractor
 * produced from the same pinned commit as every other dataset under a `deathknight-unholy`
 * target profile. Nothing here reads another specialization's dataset.
 *
 * ONE RECORD'S `_gcd` IS NOT ITS LANE. `dark_transformation_t` sets `trigger_gcd = 0_ms` (sc_death_knight.cpp:8724), with the comment "in data as 1.5s, only triggers
 * a shared gcd with blightfall so this shouldnt apply". The extracted `baseGcdMs` stays 1500, as the pinned data states it, and this file holds the reviewed lane. The wire agrees:
 * on the one retained subject all four presses land 3 to 482 ms after the press before them.
 *
 * SO THE TOKEN HAS NO PROVEN LANE. Under the Blightfall buff the same token runs `blightfall_t` on 1271967 (:8722), which takes the data's 1500 ms. Which one a press would
 * be depends on a buff nothing binds, so its lane is `UNKNOWN_LANE`, by the rule that a token's lane needs every candidate to agree.
 */

import artifact from "./deathknight-unholy-gcd-semantics.json";
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

export const UNHOLY_DEATH_KNIGHT_GCD_DATASET_ID = "SIMC_DBC_DEATHKNIGHT_UNHOLY_GCD_SEMANTICS";

/** Reviewed, by id: a constructor that overrides the record's `_gcd`. */
export const UNHOLY_DEATH_KNIGHT_CONSTRUCTOR_LANES: ReadonlyMap<number, ExecutionLane> = new Map<
  number,
  ExecutionLane
>([[1233448, "NON_GCD"]]);

let cached: LoadedGcdSemantics | null = null;

function load(): LoadedGcdSemantics {
  cached ??= loadGcdSemantics(artifact);
  return cached;
}

/** The pinned dataset, or the reason it could not be used. */
export function pinnedUnholyDeathKnightGcdSemantics(): GcdSemanticsLoad {
  return load().load;
}

/** The base GCD of one ability, by NUMBER. `null` means no record, never "no GCD". */
export function unholyDeathKnightBaseGcdMsForAbility(abilityGameId: number): number | null {
  return baseGcdMsForAbilityIn(load().index, abilityGameId);
}

/** The execution lane of one ability, by NUMBER. `UNKNOWN_LANE` is a refusal. */
export function unholyDeathKnightExecutionLaneForAbility(abilityGameId: number): ExecutionLane {
  return (
    UNHOLY_DEATH_KNIGHT_CONSTRUCTOR_LANES.get(abilityGameId) ??
    executionLaneForAbilityIn(load().index, abilityGameId)
  );
}

/** What the pinned sources establish about a Unholy Death Knight APL token's identity. */
export function unholyDeathKnightTokenBinding(simcToken: string): TokenBinding {
  return resolveTokenBindingIn(load().index, simcToken);
}

/** The execution lane of a TOKEN, proven only when every candidate agrees. */
export function unholyDeathKnightExecutionLaneForToken(simcToken: string): ExecutionLane {
  const binding = resolveTokenBindingIn(load().index, simcToken);
  const ids =
    binding.kind === "KNOWN_ONE"
      ? [binding.abilityGameId]
      : binding.kind === "KNOWN_SET"
        ? binding.abilityGameIds
        : [];
  if (!ids.some((id) => UNHOLY_DEATH_KNIGHT_CONSTRUCTOR_LANES.has(id)))
    return executionLaneForTokenIn(load().index, simcToken);
  const lanes = new Set(ids.map((id) => unholyDeathKnightExecutionLaneForAbility(id)));
  const [only] = lanes;
  return lanes.size === 1 && only !== undefined ? only : "UNKNOWN_LANE";
}

/**
 * The inverse of the pinned token bindings: ability id -> SimulationCraft token.
 * Derived from the committed artifact. An id bound by two tokens is dropped rather
 * than resolved arbitrarily, and an id with a lane record but no token is absent.
 */
export function unholyDeathKnightTokenByAbilityId(): ReadonlyMap<number, string> {
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
