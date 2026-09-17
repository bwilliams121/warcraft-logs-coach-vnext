/**
 * Protection Paladin's talent, hero-tree and apex identities (M10-C).
 *
 * THE PALADIN BINDING OF THE CLASS-NEUTRAL SELECTION RULE. Every verdict here
 * is `talent-selection.ts`'s three-way rule over
 * `paladin-protection-talents.json`, which the talent extractor produced from
 * the same pinned commit as the Rogue artifact under a `paladin-protection`
 * target profile. This module knows nothing about the Rogue dataset.
 *
 * WHAT IS PINNED
 *
 *   talents      righteous_protector, sentinel, avenging_wrath, blessed_hammer,
 *                hammer_of_the_righteous (a choice node with blessed_hammer),
 *                divine_toll — the `talent.<name>` question the APL asks, plus
 *                the talents whose selection changes what an APL token or
 *                expression BINDS to
 *   heroTrees    templar (sub-tree 48) and lightsmith (49), every entry each
 *                offers Protection, so `hero_tree.<name>` is answered by entry
 *                membership and never by a spell the player cast
 *   apexTraits   the NODE_TIERED specialization traits in generated-table
 *                order, which is what `apex.N` indexes
 *
 * ABSENCE IS NOT `NOT_SELECTED`. See `talent-selection.ts`. A hero tree with
 * no observed pinned entry is UNKNOWN, not "no hero tree".
 */

import artifact from "./paladin-protection-talents.json";
import {
  validateTalentArtifact,
  type ApexTraitIdentity,
  type HeroTreeIdentity,
  type TalentArtifact,
  type TalentIdentity,
} from "./talent-artifact.js";
import {
  resolveApexTrait,
  resolveHeroTree,
  resolveTalentIdentity,
  talentNotModelled,
  type HeroTreeResolution,
  type ObservedTalentEntry,
  type TalentResolution,
} from "./talent-selection.js";

export const PROTECTION_PALADIN_TALENT_DATASET_ID = "SIMC_TRAIT_PALADIN_PROTECTION_TALENTS";

export type TalentDataLoad =
  | { readonly ok: true; readonly artifact: TalentArtifact }
  | { readonly ok: false; readonly reason: string; readonly detail: string };

interface LoadedIndex {
  readonly artifact: TalentArtifact;
  readonly byName: ReadonlyMap<string, TalentIdentity>;
  readonly heroTrees: readonly HeroTreeIdentity[];
  readonly apexTraits: readonly ApexTraitIdentity[];
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
    index: {
      artifact: validation.artifact,
      byName,
      heroTrees: validation.artifact.heroTrees ?? [],
      apexTraits: validation.artifact.apexTraits ?? [],
    },
  };
  return cached;
}

/** The pinned dataset, or the reason it could not be used. */
export function pinnedProtectionPaladinTalents(): TalentDataLoad {
  return load().load;
}

/** Test seam: forces the next call to re-validate the artifact. */
export function resetProtectionPaladinTalentCache(): void {
  cached = null;
}

/** The identity for a SimulationCraft talent name, or `null` when not modelled. */
export function protectionTalentIdentityFor(simcName: string): TalentIdentity | null {
  return load().index?.byName.get(simcName) ?? null;
}

/** Every talent name this dataset can resolve, in artifact order. */
export function protectionModelledTalentNames(): readonly string[] {
  return load().index?.artifact.talents.map((talent) => talent.simcName) ?? [];
}

/** Resolves one talent against an observed tree. UNKNOWN is a refusal. */
export function resolveProtectionTalent(
  observedEntries: readonly ObservedTalentEntry[],
  simcName: string,
): TalentResolution {
  const identity = protectionTalentIdentityFor(simcName);
  if (identity === null) return talentNotModelled(simcName);
  return resolveTalentIdentity(observedEntries, identity);
}

/**
 * Every modelled talent that RESOLVED against an observed tree, in the
 * binding shape `AtomBindings.knownTalents` wants. UNKNOWN ones are OMITTED,
 * never reported as `taken: false`.
 */
export function resolveProtectionModelledTalents(
  observedEntries: readonly ObservedTalentEntry[],
): readonly { readonly name: string; readonly taken: boolean }[] {
  const resolved: { name: string; taken: boolean }[] = [];
  for (const simcName of protectionModelledTalentNames()) {
    const resolution = resolveProtectionTalent(observedEntries, simcName);
    if (resolution.selection === "UNKNOWN") continue;
    resolved.push({ name: resolution.simcName, taken: resolution.selection === "SELECTED" });
  }
  return resolved;
}

/** The pinned hero sub-trees, in artifact order. Empty when the dataset failed to load. */
export function protectionHeroTrees(): readonly HeroTreeIdentity[] {
  return load().index?.heroTrees ?? [];
}

/** Which pinned hero sub-tree the observed entries belong to. */
export function resolveProtectionHeroTree(
  observedEntries: readonly ObservedTalentEntry[],
): HeroTreeResolution {
  return resolveHeroTree(observedEntries, protectionHeroTrees());
}

/** The pinned tiered traits, in `apex.N` order. */
export function protectionApexTraits(): readonly ApexTraitIdentity[] {
  return load().index?.apexTraits ?? [];
}

/** `apex.N` against an observed tree, by the shared positional-then-three-way rule. */
export function resolveProtectionApexTrait(
  observedEntries: readonly ObservedTalentEntry[],
  apexIndex: number,
): TalentResolution {
  return resolveApexTrait(observedEntries, protectionApexTraits(), apexIndex);
}
