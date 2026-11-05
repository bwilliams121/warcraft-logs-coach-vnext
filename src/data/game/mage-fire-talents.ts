/**
 * Fire Mage's talent and hero-tree identities (ONB-X1).
 *
 * THE PRIEST BINDING OF THE CLASS-NEUTRAL SELECTION RULE. Every verdict is
 * `talent-selection.ts`'s three-way rule over `mage-fire-talents.json`, so
 * `hero_tree.<name>` is answered by entry membership, never by a spell cast.
 *
 * ABSENCE IS NOT `NOT_SELECTED`. A talent alone on its node resolves UNKNOWN when it is
 * absent from the observed tree, never false.
 */

import artifact from "./mage-fire-talents.json";
import {
  validateTalentArtifact,
  type HeroTreeIdentity,
  type TalentArtifact,
  type TalentIdentity,
} from "./talent-artifact.js";
import {
  resolveHeroTree,
  resolveTalentIdentity,
  talentNotModelled,
  type HeroTreeResolution,
  type ObservedTalentEntry,
  type TalentResolution,
} from "./talent-selection.js";

export const FIRE_MAGE_TALENT_DATASET_ID = "SIMC_TRAIT_MAGE_FIRE_TALENTS";

export type TalentDataLoad =
  | { readonly ok: true; readonly artifact: TalentArtifact }
  | { readonly ok: false; readonly reason: string; readonly detail: string };

interface LoadedIndex {
  readonly artifact: TalentArtifact;
  readonly byName: ReadonlyMap<string, TalentIdentity>;
  readonly heroTrees: readonly HeroTreeIdentity[];
}

let cached: { readonly load: TalentDataLoad; readonly index: LoadedIndex | null } | null = null;

function load(): { readonly load: TalentDataLoad; readonly index: LoadedIndex | null } {
  if (cached !== null) return cached;
  const validation = validateTalentArtifact(artifact);
  if (!validation.ok) {
    cached = { load: { ok: false, reason: validation.reason, detail: validation.detail }, index: null };
    return cached;
  }
  const byName = new Map<string, TalentIdentity>();
  for (const talent of validation.artifact.talents) byName.set(talent.simcName, talent);
  cached = {
    load: { ok: true, artifact: validation.artifact },
    index: { artifact: validation.artifact, byName, heroTrees: validation.artifact.heroTrees ?? [] },
  };
  return cached;
}

/** The pinned dataset, or the reason it could not be used. */
export function pinnedFireMageTalents(): TalentDataLoad {
  return load().load;
}

/** Every talent name this dataset can resolve, in artifact order. */
export function fireModelledTalentNames(): readonly string[] {
  return load().index?.artifact.talents.map((talent) => talent.simcName) ?? [];
}

/** Resolves one talent against an observed tree. UNKNOWN is a refusal. */
export function resolveFireTalent(
  observedEntries: readonly ObservedTalentEntry[],
  simcName: string,
): TalentResolution {
  const identity = load().index?.byName.get(simcName) ?? null;
  if (identity === null) return talentNotModelled(simcName);
  return resolveTalentIdentity(observedEntries, identity);
}

/** Which pinned hero sub-tree the observed entries belong to. */
export function resolveFireHeroTree(observedEntries: readonly ObservedTalentEntry[]): HeroTreeResolution {
  return resolveHeroTree(observedEntries, load().index?.heroTrees ?? []);
}
