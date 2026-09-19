/**
 * Blood Death Knight's talent and hero-tree identities (M11-B2).
 *
 * THE DEATH KNIGHT BINDING OF THE CLASS-NEUTRAL SELECTION RULE. Every verdict
 * here is `talent-selection.ts`'s three-way rule over
 * `deathknight-blood-talents.json`, which the talent extractor produced from
 * the same pinned commit as every other dataset under a `deathknight-blood`
 * target profile. This module knows nothing about any Paladin or Rogue
 * dataset.
 *
 * WHAT IS PINNED
 *
 *   talents      the talents whose selection decides whether a pinned APL
 *                token is a foreground action for the actor — each a
 *                `find_talent_spell` the action's constructor is built on
 *                (death_strike, raise_dead, heart_strike, marrowrend,
 *                blood_boil, vampiric_blood, dancing_rune_weapon, consumption,
 *                reapers_mark) — and the hero talents whose absence makes an
 *                aura the list reads impossible for the build (exterminate,
 *                vampiric_strike, gift_of_the_sanlayn, visceral_strength)
 *   heroTrees    sanlayn (sub-tree 31) and deathbringer (33), every entry each
 *                offers Blood, so `hero_tree.<name>` is answered by entry
 *                membership and never by a spell the player cast
 *
 * ABSENCE IS NOT `NOT_SELECTED`. See `talent-selection.ts`. A hero tree with
 * no observed pinned entry is UNKNOWN, not "no hero tree".
 */

import artifact from "./deathknight-blood-talents.json";
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

export const BLOOD_DEATH_KNIGHT_TALENT_DATASET_ID = "SIMC_TRAIT_DEATHKNIGHT_BLOOD_TALENTS";

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
export function pinnedBloodDeathKnightTalents(): TalentDataLoad {
  return load().load;
}

/** Test seam: forces the next call to re-validate the artifact. */
export function resetBloodDeathKnightTalentCache(): void {
  cached = null;
}

/** The identity for a SimulationCraft talent name, or `null` when not modelled. */
export function bloodTalentIdentityFor(simcName: string): TalentIdentity | null {
  return load().index?.byName.get(simcName) ?? null;
}

/** Every talent name this dataset can resolve, in artifact order. */
export function bloodModelledTalentNames(): readonly string[] {
  return load().index?.artifact.talents.map((talent) => talent.simcName) ?? [];
}

/** Resolves one talent against an observed tree. UNKNOWN is a refusal. */
export function resolveBloodTalent(
  observedEntries: readonly ObservedTalentEntry[],
  simcName: string,
): TalentResolution {
  const identity = bloodTalentIdentityFor(simcName);
  if (identity === null) return talentNotModelled(simcName);
  return resolveTalentIdentity(observedEntries, identity);
}

/**
 * Every modelled talent that RESOLVED against an observed tree, in the
 * binding shape `AtomBindings.knownTalents` wants. UNKNOWN ones are OMITTED,
 * never reported as `taken: false`.
 */
export function resolveBloodModelledTalents(
  observedEntries: readonly ObservedTalentEntry[],
): readonly { readonly name: string; readonly taken: boolean }[] {
  const resolved: { name: string; taken: boolean }[] = [];
  for (const simcName of bloodModelledTalentNames()) {
    const resolution = resolveBloodTalent(observedEntries, simcName);
    if (resolution.selection === "UNKNOWN") continue;
    resolved.push({ name: resolution.simcName, taken: resolution.selection === "SELECTED" });
  }
  return resolved;
}

/** The pinned hero sub-trees, in artifact order. Empty when the dataset failed to load. */
export function bloodHeroTrees(): readonly HeroTreeIdentity[] {
  return load().index?.heroTrees ?? [];
}

/** Which pinned hero sub-tree the observed entries belong to. */
export function resolveBloodHeroTree(observedEntries: readonly ObservedTalentEntry[]): HeroTreeResolution {
  return resolveHeroTree(observedEntries, bloodHeroTrees());
}
