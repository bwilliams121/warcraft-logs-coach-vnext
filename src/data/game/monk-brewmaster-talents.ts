/**
 * Brewmaster Monk's talent, hero-tree and apex identities (M11-C2).
 *
 * THE MONK BINDING OF THE CLASS-NEUTRAL SELECTION RULE. Every verdict here is
 * `talent-selection.ts`'s three-way rule over `monk-brewmaster-talents.json`,
 * which the talent extractor produced in M11-C1 from the same pinned commit as
 * every other dataset under a `monk-brewmaster` target profile. This module
 * knows nothing about any other specialization's dataset.
 *
 * WHAT IS PINNED
 *
 *   talents      the fourteen talents whose selection decides whether a pinned
 *                APL token is a foreground action for the actor, or whose
 *                `.enabled` the list reads (blackout_combo,
 *                salsalabims_strength), each with its choice-node alternative
 *   heroTrees    shadopan (sub-tree 65) and master_of_harmony (66), every
 *                entry each offers Brewmaster, so `hero_tree.<name>` is
 *                answered by entry membership and never by a spell cast
 *   apexTraits   the three tiers of Bring Me Another (node 110435) in
 *                generated-table order, which is what `apex.N` indexes
 *
 * WHAT IS DELIBERATELY NOT PINNED. Empty the Cellar: the pinned trait table
 * carries TWO rows with that display name (entries 136150 and 125002), and
 * SimulationCraft's by-name lookup resolves one of them by table order. M11-C1
 * declined to encode that resolution, and so does this module: the talent is
 * not modelled, and nothing here answers whether it was taken.
 *
 * ABSENCE IS NOT `NOT_SELECTED`. See `talent-selection.ts`. A hero tree with
 * no observed pinned entry is UNKNOWN, not "no hero tree".
 */

import artifact from "./monk-brewmaster-talents.json";
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

export const BREWMASTER_MONK_TALENT_DATASET_ID = "SIMC_TRAIT_MONK_BREWMASTER_TALENTS";

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
export function pinnedBrewmasterMonkTalents(): TalentDataLoad {
  return load().load;
}

/** Test seam: forces the next call to re-validate the artifact. */
export function resetBrewmasterMonkTalentCache(): void {
  cached = null;
}

/** The identity for a SimulationCraft talent name, or `null` when not modelled. */
export function brewmasterTalentIdentityFor(simcName: string): TalentIdentity | null {
  return load().index?.byName.get(simcName) ?? null;
}

/** Every talent name this dataset can resolve, in artifact order. */
export function brewmasterModelledTalentNames(): readonly string[] {
  return load().index?.artifact.talents.map((talent) => talent.simcName) ?? [];
}

/** Resolves one talent against an observed tree. UNKNOWN is a refusal. */
export function resolveBrewmasterTalent(
  observedEntries: readonly ObservedTalentEntry[],
  simcName: string,
): TalentResolution {
  const identity = brewmasterTalentIdentityFor(simcName);
  if (identity === null) return talentNotModelled(simcName);
  return resolveTalentIdentity(observedEntries, identity);
}

/**
 * Every modelled talent that RESOLVED against an observed tree, in the
 * binding shape `AtomBindings.knownTalents` wants. UNKNOWN ones are OMITTED,
 * never reported as `taken: false`.
 */
export function resolveBrewmasterModelledTalents(
  observedEntries: readonly ObservedTalentEntry[],
): readonly { readonly name: string; readonly taken: boolean }[] {
  const resolved: { name: string; taken: boolean }[] = [];
  for (const simcName of brewmasterModelledTalentNames()) {
    const resolution = resolveBrewmasterTalent(observedEntries, simcName);
    if (resolution.selection === "UNKNOWN") continue;
    resolved.push({ name: resolution.simcName, taken: resolution.selection === "SELECTED" });
  }
  return resolved;
}

/** The pinned hero sub-trees, in artifact order. Empty when the dataset failed to load. */
export function brewmasterHeroTrees(): readonly HeroTreeIdentity[] {
  return load().index?.heroTrees ?? [];
}

/** Which pinned hero sub-tree the observed entries belong to. */
export function resolveBrewmasterHeroTree(
  observedEntries: readonly ObservedTalentEntry[],
): HeroTreeResolution {
  return resolveHeroTree(observedEntries, brewmasterHeroTrees());
}

/** The pinned tiered traits, in `apex.N` order. */
export function brewmasterApexTraits(): readonly ApexTraitIdentity[] {
  return load().index?.apexTraits ?? [];
}

/** `apex.N` against an observed tree, by the shared positional-then-three-way rule. */
export function resolveBrewmasterApexTrait(
  observedEntries: readonly ObservedTalentEntry[],
  apexIndex: number,
): TalentResolution {
  return resolveApexTrait(observedEntries, brewmasterApexTraits(), apexIndex);
}
