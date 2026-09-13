/**
 * DoT base durations — how long does this DoT last, before anything modifies it?
 *
 * The pinned dataset, loaded and validated once. This module answers exactly one
 * question and refuses to answer any neighbouring one.
 *
 * MILLISECONDS IN, MILLISECONDS OUT.
 *
 * Every value this module returns is in MILLISECONDS, and every field carrying
 * one says `Ms` in its name. There is no seconds accessor here on purpose: the
 * ms -> s conversion belongs at the single place that builds a SimulationCraft
 * expression binding, where it can be named and tested, not scattered across
 * callers who each get a chance to forget.
 *
 * BASE MEANS BASE.
 *
 * Not haste-scaled. Not pandemic-extended. Not talent-modified. Not snapshotted.
 * A caller that needs any of those must build that model; this module will not
 * approximate one. That is why `durationFor` returns the artifact's number
 * unchanged rather than accepting modifiers it would have to guess at.
 */

import artifact from "./rogue-dot-durations.json";
import {
  validateDotDurationArtifact,
  type DotDurationArtifact,
  type DotDurationIdentity,
} from "./dot-duration-artifact.js";

export type DotDurationDataLoad =
  | { readonly ok: true; readonly artifact: DotDurationArtifact }
  | { readonly ok: false; readonly reason: string; readonly detail: string };

interface LoadedIndex {
  readonly artifact: DotDurationArtifact;
  readonly byToken: ReadonlyMap<string, DotDurationIdentity>;
  readonly byAbilityGameId: ReadonlyMap<number, DotDurationIdentity>;
}

let cached: { readonly load: DotDurationDataLoad; readonly index: LoadedIndex | null } | null = null;

function load(): { readonly load: DotDurationDataLoad; readonly index: LoadedIndex | null } {
  if (cached !== null) return cached;

  const validation = validateDotDurationArtifact(artifact);
  if (!validation.ok) {
    cached = { load: { ok: false, reason: validation.reason, detail: validation.detail }, index: null };
    return cached;
  }

  const byToken = new Map<string, DotDurationIdentity>();
  const byAbilityGameId = new Map<number, DotDurationIdentity>();
  for (const dot of validation.artifact.dots) {
    byToken.set(dot.simcToken, dot);
    byAbilityGameId.set(dot.abilityGameId, dot);
  }

  cached = {
    load: { ok: true, artifact: validation.artifact },
    index: { artifact: validation.artifact, byToken, byAbilityGameId },
  };
  return cached;
}

/** The pinned DoT-duration dataset, or the reason it could not be used. */
export function pinnedRogueDotDurations(): DotDurationDataLoad {
  return load().load;
}

/** Test seam: forces the next call to re-validate the artifact. */
export function resetDotDurationDataCache(): void {
  cached = null;
}

/**
 * The identity for a SimulationCraft action token, or `null` when not modelled.
 *
 * `null` means this dataset carries no entry — never "the DoT has no duration".
 * A caller must treat it as missing data, not as a zero.
 */
export function dotDurationForToken(simcToken: string): DotDurationIdentity | null {
  return load().index?.byToken.get(simcToken) ?? null;
}

/**
 * The identity for a spell id, or `null` when not modelled.
 *
 * Provided because evidence arrives keyed by `abilityGameID`, and looking a
 * Warcraft Logs aura event up by the number it actually carries is safer than
 * translating it to a token first.
 */
export function dotDurationForAbilityGameId(abilityGameId: number): DotDurationIdentity | null {
  return load().index?.byAbilityGameId.get(abilityGameId) ?? null;
}
