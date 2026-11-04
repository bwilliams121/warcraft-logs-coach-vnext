/**
 * Havoc Demon Hunter's execution-lane and token-identity facts (ONB-A1).
 *
 * THE DEMON HUNTER BINDING OF THE CLASS-NEUTRAL INDEX. The lane rule is the one
 * in `gcd-semantics-index.ts` over `demonhunter-havoc-gcd-semantics.json`, which
 * the extractor produced from the same pinned commit as every other dataset under
 * a `demonhunter-havoc` target profile. Nothing here reads another
 * specialization's dataset.
 *
 * Three facts a reader should not have to rediscover:
 *
 *   - METAMORPHOSIS'S ACTION IS NOT WHAT THE LOG SHOWS. The token binds 191427.
 *     The log never reports 191427; it reports the leap's impact 200166 as a
 *     `cast`. 200166 has a lane record (`_gcd` 0) and no token, so a logged
 *     Metamorphosis is excluded as NON_GCD_ACTION and never judged.
 *   - THE HUNT'S IMPACT 370966 AND FELBLADE'S CHARGE 213243 are the same shape.
 *   - A LOGGED 185123 IS NOT ALWAYS A PRESS. Screaming Brutality's background
 *     Throw Glaives log the same id; `observed-analysis.ts` owns that.
 */

import artifact from "./demonhunter-havoc-gcd-semantics.json";
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

export const HAVOC_DEMON_HUNTER_GCD_DATASET_ID = "SIMC_DBC_DEMONHUNTER_HAVOC_GCD_SEMANTICS";

let cached: LoadedGcdSemantics | null = null;

function load(): LoadedGcdSemantics {
  cached ??= loadGcdSemantics(artifact);
  return cached;
}

/** The pinned dataset, or the reason it could not be used. */
export function pinnedHavocDemonHunterGcdSemantics(): GcdSemanticsLoad {
  return load().load;
}

/** Test seam: forces the next call to re-validate the artifact. */
export function resetHavocDemonHunterGcdSemanticsCache(): void {
  cached = null;
}

/** The base GCD of one ability, by NUMBER. `null` means no record, never "no GCD". */
export function havocBaseGcdMsForAbility(abilityGameId: number): number | null {
  return baseGcdMsForAbilityIn(load().index, abilityGameId);
}

/** The execution lane of one ability, by NUMBER. `UNKNOWN_LANE` is a refusal. */
export function havocExecutionLaneForAbility(abilityGameId: number): ExecutionLane {
  return executionLaneForAbilityIn(load().index, abilityGameId);
}

/** What the pinned sources establish about a Havoc APL token's identity. */
export function havocTokenBinding(simcToken: string): TokenBinding {
  return resolveTokenBindingIn(load().index, simcToken);
}

/** The hand-reviewed `trigger_gcd` reading for a spell-less token, or `null`. */
export function havocMetaActionLaneFor(simcToken: string): MetaActionLaneRecord | null {
  return metaActionLaneRecordIn(load().index, simcToken);
}

/** The execution lane of a TOKEN, proven only when every candidate agrees. */
export function havocExecutionLaneForToken(simcToken: string): ExecutionLane {
  return executionLaneForTokenIn(load().index, simcToken);
}

/**
 * The inverse of the pinned token bindings: ability id -> SimulationCraft token.
 * Derived from the committed artifact. An id bound by two tokens is dropped
 * rather than resolved arbitrarily, and an id with a lane record but no token is
 * absent: it has a lane and no authority identity.
 */
export function havocTokenByAbilityId(): ReadonlyMap<number, string> {
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
