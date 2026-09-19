/**
 * Blood Death Knight's execution-lane and token-identity facts (M11-B2).
 *
 * THE DEATH KNIGHT BINDING OF THE CLASS-NEUTRAL INDEX. The lane rule is the
 * one in `gcd-semantics-index.ts` — `baseGcdMs > 0`, token-lane invariance,
 * the meta-action lane — over `deathknight-blood-gcd-semantics.json`, an
 * artifact the same extractor produced from the same pinned commit as the
 * Paladin datasets under a `deathknight-blood` target profile. This module
 * imports nothing from any Paladin or Rogue dataset.
 *
 * WHAT THE DATASET SAYS
 *
 * Twenty-four machine-extracted `_gcd` records: the seventeen actions the
 * pinned Blood list names (including the five racial tokens, recorded for
 * provenance although they are outside the rotational decision domain) and
 * the seven abilities the two M11-B2 subjects cast that the list does not
 * name (Dark Command, Anti-Magic Shell, Anti-Magic Zone, Death's Advance,
 * Infliction of Sorrow, a potion and an on-use item driver). Seventeen
 * hand-reviewed token bindings and four meta-action lanes.
 *
 * Three facts a reader should not have to rediscover:
 *
 *   - `heart_strike` BINDS TO TWO RECORDS (206930 and 433895): under the
 *     San'layn Vampiric Strike talent the action executes the Vampiric
 *     Strike child (sc_death_knight.cpp:11350-11357), which the log reports
 *     as a Vampiric Strike cast. Both are lane 1500.
 *   - `any_dnd` and `death_and_decay` BIND TO THE SAME RECORD (43265): the
 *     module maps the alias to `create_action( "death_and_decay" )`
 *     (:14424-14427). `bloodTokenByAbilityId` therefore names 43265 as
 *     `death_and_decay`, the token the alias resolves to, rather than
 *     dropping the id as ambiguous.
 *   - DANCING RUNE WEAPON IS `_gcd` 1500: a GCD-consuming entry, never a
 *     NON_GCD step. Raise Dead and Vampiric Blood are `_gcd` 0.
 *
 * Nothing here classifies an ability as defensive or utility. A lane says
 * whether a press occupies the rotational slot; it says nothing about what
 * the press was for.
 */

import artifact from "./deathknight-blood-gcd-semantics.json";
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

export const BLOOD_DEATH_KNIGHT_GCD_DATASET_ID = "SIMC_DBC_DEATHKNIGHT_BLOOD_GCD_SEMANTICS";

/** The alias the pinned module resolves to another token (sc_death_knight.cpp:14424-14427). */
export const BLOOD_TOKEN_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  any_dnd: "death_and_decay",
});

let cached: LoadedGcdSemantics | null = null;

function load(): LoadedGcdSemantics {
  cached ??= loadGcdSemantics(artifact);
  return cached;
}

/** The pinned Blood Death Knight dataset, or the reason it could not be used. */
export function pinnedBloodDeathKnightGcdSemantics(): GcdSemanticsLoad {
  return load().load;
}

/** Test seam: forces the next call to re-validate the artifact. */
export function resetBloodDeathKnightGcdSemanticsCache(): void {
  cached = null;
}

/** The base GCD of one ability, by NUMBER. `null` means no record, never "no GCD". */
export function bloodBaseGcdMsForAbility(abilityGameId: number): number | null {
  return baseGcdMsForAbilityIn(load().index, abilityGameId);
}

/** The execution lane of one ability, by NUMBER. `UNKNOWN_LANE` is a refusal. */
export function bloodExecutionLaneForAbility(abilityGameId: number): ExecutionLane {
  return executionLaneForAbilityIn(load().index, abilityGameId);
}

/** What the pinned sources establish about a Blood APL token's identity. */
export function bloodTokenBinding(simcToken: string): TokenBinding {
  return resolveTokenBindingIn(load().index, simcToken);
}

/** The hand-reviewed `trigger_gcd` reading for a spell-less token, or `null`. */
export function bloodMetaActionLaneFor(simcToken: string): MetaActionLaneRecord | null {
  return metaActionLaneRecordIn(load().index, simcToken);
}

/** The execution lane of a TOKEN, proven only when every candidate agrees. */
export function bloodExecutionLaneForToken(simcToken: string): ExecutionLane {
  return executionLaneForTokenIn(load().index, simcToken);
}

/**
 * The inverse of the pinned token bindings: ability id -> SimulationCraft token.
 *
 * DERIVED from the committed artifact rather than hand-listed. An id bound by
 * a pinned ALIAS and by the token the alias resolves to is named by the
 * resolved token (`BLOOD_TOKEN_ALIASES`); any other id bound by more than one
 * token would be ambiguous and is dropped rather than resolved arbitrarily.
 * An id with a lane record but no token (the observed-only abilities) is
 * simply absent: it has a lane and no authority identity.
 */
export function bloodTokenByAbilityId(): ReadonlyMap<number, string> {
  const index = load().index;
  if (index === null) return new Map();
  const seen = new Map<number, string | null>();
  for (const binding of index.artifact.tokenBindings) {
    const token = BLOOD_TOKEN_ALIASES[binding.simcToken] ?? binding.simcToken;
    for (const abilityGameId of binding.candidateAbilityGameIds) {
      const existing = seen.get(abilityGameId);
      seen.set(abilityGameId, existing === undefined || existing === token ? token : null);
    }
  }
  const resolved = new Map<number, string>();
  for (const [abilityGameId, token] of seen) if (token !== null) resolved.set(abilityGameId, token);
  return resolved;
}
