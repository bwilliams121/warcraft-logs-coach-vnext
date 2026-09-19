/**
 * Blood Death Knight aura durations — how long does this aura last, as
 * SimulationCraft resolves it for a Blood actor, and by which remains model?
 *
 * The pinned dataset, loaded and validated once (M11-B4). This module answers
 * exactly that question and refuses to answer any neighbouring one.
 *
 * MILLISECONDS IN, MILLISECONDS OUT. Every duration this module returns is in
 * MILLISECONDS and every field carrying one says `Ms`. There is no seconds
 * accessor on purpose: the ms -> s conversion belongs at the single place that
 * builds a SimulationCraft expression binding (`aura-remains.ts`).
 *
 * FINAL MEANS FINAL FOR BLOOD, AND NOTHING MORE. `finalDurationMs` includes the
 * unconditional specialization passives and nothing build-dependent. Not
 * haste-scaled, not extended, not refreshed by anything but the pinned reset
 * rule. A caller that needs another model must build it; this module will not
 * approximate one.
 */

import artifact from "./deathknight-blood-aura-durations.json";
import {
  validateBloodAuraDurationArtifact,
  type BloodAuraDurationArtifact,
  type BloodAuraDurationIdentity,
} from "./deathknight-blood-aura-duration-artifact.js";

export type BloodAuraDurationDataLoad =
  | { readonly ok: true; readonly artifact: BloodAuraDurationArtifact }
  | { readonly ok: false; readonly reason: string; readonly detail: string };

interface LoadedIndex {
  readonly artifact: BloodAuraDurationArtifact;
  readonly byAtom: ReadonlyMap<string, BloodAuraDurationIdentity>;
  readonly byAbilityGameId: ReadonlyMap<number, BloodAuraDurationIdentity>;
}

let cached: { readonly load: BloodAuraDurationDataLoad; readonly index: LoadedIndex | null } | null = null;

function load(): { readonly load: BloodAuraDurationDataLoad; readonly index: LoadedIndex | null } {
  if (cached !== null) return cached;
  const validation = validateBloodAuraDurationArtifact(artifact);
  if (!validation.ok) {
    cached = { load: { ok: false, reason: validation.reason, detail: validation.detail }, index: null };
    return cached;
  }
  const byAtom = new Map<string, BloodAuraDurationIdentity>();
  const byAbilityGameId = new Map<number, BloodAuraDurationIdentity>();
  for (const aura of validation.artifact.auras) {
    byAtom.set(aura.atomName, aura);
    byAbilityGameId.set(aura.abilityGameId, aura);
  }
  cached = {
    load: { ok: true, artifact: validation.artifact },
    index: { artifact: validation.artifact, byAtom, byAbilityGameId },
  };
  return cached;
}

/** The pinned Blood aura-duration dataset, or the reason it could not be used. */
export function pinnedBloodAuraDurations(): BloodAuraDurationDataLoad {
  return load().load;
}

/** Test seam: forces the next call to re-validate the artifact. */
export function resetBloodAuraDurationDataCache(): void {
  cached = null;
}

/**
 * The duration identity for an atom name, or `null` when not modelled.
 *
 * `null` means this dataset carries no entry — never "the aura has no
 * duration". A caller must treat it as missing data, not as zero and not as
 * permanent.
 */
export function bloodAuraDurationForAtom(atomName: string): BloodAuraDurationIdentity | null {
  return load().index?.byAtom.get(atomName) ?? null;
}

/** The duration identity for a spell id, or `null` when not modelled. */
export function bloodAuraDurationForAbilityGameId(abilityGameId: number): BloodAuraDurationIdentity | null {
  return load().index?.byAbilityGameId.get(abilityGameId) ?? null;
}
