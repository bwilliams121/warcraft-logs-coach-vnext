/**
 * Ability cooldowns — how long is this ability unavailable after it is used?
 *
 * The pinned dataset, loaded and validated once. This module answers exactly one
 * question and refuses the neighbouring ones.
 *
 * MILLISECONDS IN, MILLISECONDS OUT.
 *
 * Every value here is MILLISECONDS and every field says `Ms`. There is no
 * seconds accessor on purpose: the ms -> s conversion belongs at the single
 * place that builds a SimulationCraft expression binding, where it can be named
 * and tested, rather than at each caller that might forget.
 *
 * BASE MEANS BASE.
 *
 * Not haste-scaled, not reduced, not reset. `modifierPolicy` records a
 * hand-reviewed claim that, for THIS ability at the pinned commit, nothing
 * modifies it — and a consumer that needs the guarantee should read that claim
 * rather than assume it from the absence of a modifier field.
 */

import artifact from "./rogue-cooldowns.json";
import {
  validateCooldownArtifact,
  type CooldownArtifact,
  type CooldownIdentity,
} from "./cooldown-artifact.js";

export type CooldownDataLoad =
  | { readonly ok: true; readonly artifact: CooldownArtifact }
  | { readonly ok: false; readonly reason: string; readonly detail: string };

interface LoadedIndex {
  readonly artifact: CooldownArtifact;
  readonly byToken: ReadonlyMap<string, CooldownIdentity>;
  readonly byAbilityGameId: ReadonlyMap<number, CooldownIdentity>;
}

let cached: { readonly load: CooldownDataLoad; readonly index: LoadedIndex | null } | null = null;

function load(): { readonly load: CooldownDataLoad; readonly index: LoadedIndex | null } {
  if (cached !== null) return cached;

  const validation = validateCooldownArtifact(artifact);
  if (!validation.ok) {
    cached = { load: { ok: false, reason: validation.reason, detail: validation.detail }, index: null };
    return cached;
  }

  const byToken = new Map<string, CooldownIdentity>();
  const byAbilityGameId = new Map<number, CooldownIdentity>();
  for (const entry of validation.artifact.cooldowns) {
    byToken.set(entry.simcToken, entry);
    byAbilityGameId.set(entry.abilityGameId, entry);
  }

  cached = {
    load: { ok: true, artifact: validation.artifact },
    index: { artifact: validation.artifact, byToken, byAbilityGameId },
  };
  return cached;
}

/** The pinned cooldown dataset, or the reason it could not be used. */
export function pinnedRogueCooldowns(): CooldownDataLoad {
  return load().load;
}

/** Test seam: forces the next call to re-validate the artifact. */
export function resetCooldownDataCache(): void {
  cached = null;
}

/**
 * The cooldown identity for a SimulationCraft token, or `null` when not modelled.
 *
 * `null` means this dataset carries no entry. It does NOT mean the ability has
 * no cooldown, and a caller must not read it as one.
 */
export function cooldownForToken(simcToken: string): CooldownIdentity | null {
  return load().index?.byToken.get(simcToken) ?? null;
}

/**
 * The cooldown identity for a spell id, or `null` when not modelled.
 *
 * Provided because evidence arrives keyed by `abilityGameID`, and looking a
 * Warcraft Logs cast up by the number it carries is safer than translating to a
 * token first.
 */
export function cooldownForAbilityGameId(abilityGameId: number): CooldownIdentity | null {
  return load().index?.byAbilityGameId.get(abilityGameId) ?? null;
}
