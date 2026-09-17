/**
 * Protection Paladin's execution-lane and token-identity facts (M10-C).
 *
 * THE PALADIN BINDING OF THE CLASS-NEUTRAL INDEX. The lane rule is the one in
 * `gcd-semantics-index.ts` — `baseGcdMs > 0`, token-lane invariance, the
 * meta-action lane — over `paladin-protection-gcd-semantics.json`, an
 * artifact the same extractor produced from the same pinned commit as the
 * Rogue one under a `paladin-protection` target profile. This module knows
 * nothing about the Rogue dataset and imports none of it.
 *
 * WHAT THE DATASET SAYS, AND WHAT IT DOES NOT
 *
 * Nineteen machine-extracted `_gcd` records: the fifteen actions the pinned
 * Protection APL names, and the four abilities the M10-B subject cast that the
 * APL does not name (Ardent Defender, Hand of Reckoning, Divine Steed,
 * Blessing of Spellwarding). Fourteen hand-reviewed token bindings, each a
 * reading of `sc_paladin.cpp` / `sc_paladin_protection.cpp` with a line
 * range and the file's measured hash. Four meta-action lanes: `auto_attack`
 * (a Paladin-module constructor), `use_item`, `use_items` and `potion`.
 *
 * Two facts a reader of this dataset should not have to rediscover:
 *
 *   - SHIELD OF THE RIGHTEOUS IS `_gcd` 0. Protection's primary spender does
 *     not consume the rotational GCD, and neither do Avenging Wrath, Sentinel
 *     or Ardent Defender. An observed cast of any of them is a NON_GCD action
 *     to the first-GCD query, exactly as `kick` or `vanish` is for a Rogue.
 *   - `avenging_wrath` BINDS TO TWO RECORDS (31884 and 389539) because
 *     Protection's `create_action` returns `sentinel_t` when the Sentinel
 *     talent is taken. Both are lane 0, so the token's lane holds without
 *     anyone deciding the talent here. Which record the actor actually
 *     executes is the talent resolver's question, not this module's.
 *
 * Nothing here classifies an ability as mitigation, defensive or utility. A
 * lane says whether a press occupies the rotational slot; it says nothing
 * about what the press was for.
 */

import artifact from "./paladin-protection-gcd-semantics.json";
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

export const PROTECTION_PALADIN_GCD_DATASET_ID = "SIMC_DBC_PALADIN_PROTECTION_GCD_SEMANTICS";

let cached: LoadedGcdSemantics | null = null;

function load(): LoadedGcdSemantics {
  cached ??= loadGcdSemantics(artifact);
  return cached;
}

/** The pinned Protection Paladin dataset, or the reason it could not be used. */
export function pinnedProtectionPaladinGcdSemantics(): GcdSemanticsLoad {
  return load().load;
}

/** Test seam: forces the next call to re-validate the artifact. */
export function resetProtectionPaladinGcdSemanticsCache(): void {
  cached = null;
}

/** The base GCD of one ability, by NUMBER. `null` means no record, never "no GCD". */
export function protectionBaseGcdMsForAbility(abilityGameId: number): number | null {
  return baseGcdMsForAbilityIn(load().index, abilityGameId);
}

/** The execution lane of one ability, by NUMBER. `UNKNOWN_LANE` is a refusal. */
export function protectionExecutionLaneForAbility(abilityGameId: number): ExecutionLane {
  return executionLaneForAbilityIn(load().index, abilityGameId);
}

/** What the pinned sources establish about a Protection APL token's identity. */
export function protectionTokenBinding(simcToken: string): TokenBinding {
  return resolveTokenBindingIn(load().index, simcToken);
}

/** The hand-reviewed `trigger_gcd` reading for a spell-less token, or `null`. */
export function protectionMetaActionLaneFor(simcToken: string): MetaActionLaneRecord | null {
  return metaActionLaneRecordIn(load().index, simcToken);
}

/** The execution lane of a TOKEN, proven only when every candidate agrees. */
export function protectionExecutionLaneForToken(simcToken: string): ExecutionLane {
  return executionLaneForTokenIn(load().index, simcToken);
}

/**
 * The inverse of the pinned token bindings: ability id -> SimulationCraft token.
 *
 * DERIVED from the committed artifact rather than hand-listed, so a binding
 * change cannot leave a stale duplicate here. An id that binds to more than one
 * token would be ambiguous, so it is dropped rather than resolved arbitrarily.
 * An id with a lane record but no token (the four observed-only abilities) is
 * simply absent: it has a lane and no authority identity.
 */
export function protectionTokenByAbilityId(): ReadonlyMap<number, string> {
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
