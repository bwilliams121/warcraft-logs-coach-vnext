/**
 * Brewmaster Monk's execution-lane and token-identity facts (M11-C2).
 *
 * THE MONK BINDING OF THE CLASS-NEUTRAL INDEX. The lane rule is the one in
 * `gcd-semantics-index.ts` — `baseGcdMs > 0`, token-lane invariance, the
 * meta-action lane — over `monk-brewmaster-gcd-semantics.json`, the artifact
 * M11-C1 produced with the same extractor from the same pinned commit as every
 * other dataset under a `monk-brewmaster` target profile. This module imports
 * nothing from any other specialization's dataset.
 *
 * WHAT THE DATASET SAYS
 *
 * Twenty-three machine-extracted `_gcd` records for the actions the pinned
 * Brewmaster list names (the seven racial tokens among them, recorded for
 * provenance although they are outside the rotational decision domain), the
 * Empty the Cellar talent record beside its executed spell, twenty-one
 * hand-reviewed token bindings and three meta-action lanes (`auto_attack`,
 * `use_items`, `potion`). Three facts a reader should not have to rediscover:
 *
 *   - `celestial_brew` BINDS TO TWO RECORDS (322507 and 1241059): under the
 *     Celestial Infusion choice the action executes the infusion spell. Both
 *     are lane 1000.
 *   - THE BREWS ARE SPLIT. `celestial_brew` is `_gcd` 1000 (GCD-consuming);
 *     `purifying_brew`, `black_ox_brew` and `fortifying_brew` are `_gcd` 0.
 *   - The dataset carries NO record for abilities the list does not name
 *     (Provoke, Gift of the Ox, a potion, an on-use item driver). A cast of
 *     one has no lane here and is excluded EXECUTION_LANE_NOT_ESTABLISHED
 *     rather than guessed into a lane.
 *
 * Nothing here classifies an ability as defensive or utility. A lane says
 * whether a press occupies the rotational slot; it says nothing about what
 * the press was for.
 */

import artifact from "./monk-brewmaster-gcd-semantics.json";
import {
  baseGcdMsForAbilityIn,
  executionLaneForAbilityIn,
  executionLaneForTokenIn,
  loadGcdSemantics,
  metaActionLaneRecordIn,
  resolveTokenBindingIn,
  type ExecutionLane,
  type GcdSemanticsLoad,
  type LoadedGcdSemantics,
  type TokenBinding,
} from "./gcd-semantics-index.js";
import type { MetaActionLaneRecord } from "./gcd-semantics-artifact.js";

export const BREWMASTER_MONK_GCD_DATASET_ID = "SIMC_DBC_MONK_BREWMASTER_GCD_SEMANTICS";

let cached: LoadedGcdSemantics | null = null;

function load(): LoadedGcdSemantics {
  cached ??= loadGcdSemantics(artifact);
  return cached;
}

/** The pinned Brewmaster Monk dataset, or the reason it could not be used. */
export function pinnedBrewmasterMonkGcdSemantics(): GcdSemanticsLoad {
  return load().load;
}

/** Test seam: forces the next call to re-validate the artifact. */
export function resetBrewmasterMonkGcdSemanticsCache(): void {
  cached = null;
}

/** The base GCD of one ability, by NUMBER. `null` means no record, never "no GCD". */
export function brewmasterBaseGcdMsForAbility(abilityGameId: number): number | null {
  return baseGcdMsForAbilityIn(load().index, abilityGameId);
}

/** The execution lane of one ability, by NUMBER. `UNKNOWN_LANE` is a refusal. */
export function brewmasterExecutionLaneForAbility(abilityGameId: number): ExecutionLane {
  return executionLaneForAbilityIn(load().index, abilityGameId);
}

/** What the pinned sources establish about a Brewmaster APL token's identity. */
export function brewmasterTokenBinding(simcToken: string): TokenBinding {
  return resolveTokenBindingIn(load().index, simcToken);
}

/** The hand-reviewed `trigger_gcd` reading for a spell-less token, or `null`. */
export function brewmasterMetaActionLaneFor(simcToken: string): MetaActionLaneRecord | null {
  return metaActionLaneRecordIn(load().index, simcToken);
}

/** The execution lane of a TOKEN, proven only when every candidate agrees. */
export function brewmasterExecutionLaneForToken(simcToken: string): ExecutionLane {
  return executionLaneForTokenIn(load().index, simcToken);
}

/**
 * The inverse of the pinned token bindings: ability id -> SimulationCraft token.
 *
 * DERIVED from the committed artifact rather than hand-listed. An id bound by
 * more than one token would be ambiguous and is dropped rather than resolved
 * arbitrarily (the pinned Brewmaster bindings carry no alias and no shared
 * id). An id with a lane record but no token is simply absent: it has a lane
 * and no authority identity.
 */
export function brewmasterTokenByAbilityId(): ReadonlyMap<number, string> {
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
