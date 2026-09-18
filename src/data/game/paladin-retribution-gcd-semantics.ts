/**
 * Retribution Paladin's execution-lane and token-identity facts (M11-A4).
 *
 * THE PALADIN BINDING OF THE CLASS-NEUTRAL INDEX. The lane rule is the one in
 * `gcd-semantics-index.ts` — `baseGcdMs > 0`, token-lane invariance, the
 * meta-action lane — over `paladin-retribution-gcd-semantics.json`, an
 * artifact the same extractor produced from the same pinned commit as the
 * Protection one under a `paladin-retribution` target profile. This module
 * knows nothing about the Protection dataset and imports none of it.
 *
 * WHAT THE DATASET SAYS
 *
 * Twenty-nine machine-extracted `_gcd` records: the eighteen actions the
 * pinned Retribution list names (including the three racials, recorded for
 * provenance although they are outside the rotational decision domain) and
 * the eleven abilities the two M11-A4 subjects cast that the list does not
 * name (Crusading Strikes, Divine Protection, Shield of Vengeance, Divine
 * Steed, Lay on Hands, Word of Glory, the two Blessings, Light's Potential
 * and two on-use item drivers). Seventeen hand-reviewed token bindings and
 * five meta-action lanes.
 *
 * Two facts a reader should not have to rediscover:
 *
 *   - `templars_verdict` BINDS TO TWO RECORDS (85256 and 383328) because the
 *     action is built on the Final Verdict spell when that talent is taken.
 *     Both are lane 1500, so the lane holds without deciding the talent.
 *   - EXECUTION SENTENCE IS `_gcd` 750: shorter than the others, but a GCD
 *     lane all the same, so it is an eligible GCD decision and never a
 *     NON_GCD step.
 *
 * Nothing here classifies an ability as defensive or utility. A lane says
 * whether a press occupies the rotational slot; it says nothing about what
 * the press was for.
 */

import artifact from "./paladin-retribution-gcd-semantics.json";
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

export const RETRIBUTION_PALADIN_GCD_DATASET_ID = "SIMC_DBC_PALADIN_RETRIBUTION_GCD_SEMANTICS";

let cached: LoadedGcdSemantics | null = null;

function load(): LoadedGcdSemantics {
  cached ??= loadGcdSemantics(artifact);
  return cached;
}

/** The pinned Retribution Paladin dataset, or the reason it could not be used. */
export function pinnedRetributionPaladinGcdSemantics(): GcdSemanticsLoad {
  return load().load;
}

/** Test seam: forces the next call to re-validate the artifact. */
export function resetRetributionPaladinGcdSemanticsCache(): void {
  cached = null;
}

/** The base GCD of one ability, by NUMBER. `null` means no record, never "no GCD". */
export function retributionBaseGcdMsForAbility(abilityGameId: number): number | null {
  return baseGcdMsForAbilityIn(load().index, abilityGameId);
}

/** The execution lane of one ability, by NUMBER. `UNKNOWN_LANE` is a refusal. */
export function retributionExecutionLaneForAbility(abilityGameId: number): ExecutionLane {
  return executionLaneForAbilityIn(load().index, abilityGameId);
}

/** What the pinned sources establish about a Retribution APL token's identity. */
export function retributionTokenBinding(simcToken: string): TokenBinding {
  return resolveTokenBindingIn(load().index, simcToken);
}

/** The hand-reviewed `trigger_gcd` reading for a spell-less token, or `null`. */
export function retributionMetaActionLaneFor(simcToken: string): MetaActionLaneRecord | null {
  return metaActionLaneRecordIn(load().index, simcToken);
}

/** The execution lane of a TOKEN, proven only when every candidate agrees. */
export function retributionExecutionLaneForToken(simcToken: string): ExecutionLane {
  return executionLaneForTokenIn(load().index, simcToken);
}

/**
 * The inverse of the pinned token bindings: ability id -> SimulationCraft token.
 *
 * DERIVED from the committed artifact rather than hand-listed. An id that binds
 * to more than one token would be ambiguous, so it is dropped rather than
 * resolved arbitrarily. An id with a lane record but no token (the observed-only
 * abilities) is simply absent: it has a lane and no authority identity.
 */
export function retributionTokenByAbilityId(): ReadonlyMap<number, string> {
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
