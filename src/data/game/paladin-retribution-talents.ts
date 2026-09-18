/**
 * Retribution Paladin's talent and hero-tree identities (M11-A4).
 *
 * THE PALADIN BINDING OF THE CLASS-NEUTRAL SELECTION RULE. Every verdict here
 * is `talent-selection.ts`'s three-way rule over
 * `paladin-retribution-talents.json`, which the talent extractor produced from
 * the same pinned commit as the Protection artifact under a
 * `paladin-retribution` target profile. This module knows nothing about the
 * Protection dataset.
 *
 * WHAT IS PINNED
 *
 *   talents      the `talent.<name>` questions the pinned list asks on the
 *                spender path (walk_into_light, radiant_glory, execution_sentence,
 *                holy_flames, crusade), the talents whose selection changes
 *                what an APL token BINDS to or whether it exists (final_verdict,
 *                crusading_strikes / templar_strikes, divine_storm,
 *                blade_of_justice, wake_of_ashes, avenging_wrath, hammer_of_wrath,
 *                divine_toll, empyrean_legacy, divine_purpose), and the two
 *                talents whose absence proves an aura impossible
 *                (art_of_war / righteous_cause, one choice node)
 *   heroTrees    templar (sub-tree 48) and herald_of_the_sun (50), every entry
 *                each offers Retribution, so `hero_tree.<name>` and the
 *                Templar-only applicability rules are answered by entry
 *                membership and never by a spell the player cast
 *
 * ABSENCE IS NOT `NOT_SELECTED`. See `talent-selection.ts`. A hero tree with
 * no observed pinned entry is UNKNOWN, not "no hero tree".
 */

import artifact from "./paladin-retribution-talents.json";
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

export const RETRIBUTION_PALADIN_TALENT_DATASET_ID = "SIMC_TRAIT_PALADIN_RETRIBUTION_TALENTS";

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
export function pinnedRetributionPaladinTalents(): TalentDataLoad {
  return load().load;
}

/** Test seam: forces the next call to re-validate the artifact. */
export function resetRetributionPaladinTalentCache(): void {
  cached = null;
}

/** The identity for a SimulationCraft talent name, or `null` when not modelled. */
export function retributionTalentIdentityFor(simcName: string): TalentIdentity | null {
  return load().index?.byName.get(simcName) ?? null;
}

/** Every talent name this dataset can resolve, in artifact order. */
export function retributionModelledTalentNames(): readonly string[] {
  return load().index?.artifact.talents.map((talent) => talent.simcName) ?? [];
}

/** Resolves one talent against an observed tree. UNKNOWN is a refusal. */
export function resolveRetributionTalent(
  observedEntries: readonly ObservedTalentEntry[],
  simcName: string,
): TalentResolution {
  const identity = retributionTalentIdentityFor(simcName);
  if (identity === null) return talentNotModelled(simcName);
  return resolveTalentIdentity(observedEntries, identity);
}

/**
 * Every modelled talent that RESOLVED against an observed tree, in the
 * binding shape `AtomBindings.knownTalents` wants. UNKNOWN ones are OMITTED,
 * never reported as `taken: false`.
 */
export function resolveRetributionModelledTalents(
  observedEntries: readonly ObservedTalentEntry[],
): readonly { readonly name: string; readonly taken: boolean }[] {
  const resolved: { name: string; taken: boolean }[] = [];
  for (const simcName of retributionModelledTalentNames()) {
    const resolution = resolveRetributionTalent(observedEntries, simcName);
    if (resolution.selection === "UNKNOWN") continue;
    resolved.push({ name: resolution.simcName, taken: resolution.selection === "SELECTED" });
  }
  return resolved;
}

/** The pinned hero sub-trees, in artifact order. Empty when the dataset failed to load. */
export function retributionHeroTrees(): readonly HeroTreeIdentity[] {
  return load().index?.heroTrees ?? [];
}

/** Which pinned hero sub-tree the observed entries belong to. */
export function resolveRetributionHeroTree(
  observedEntries: readonly ObservedTalentEntry[],
): HeroTreeResolution {
  return resolveHeroTree(observedEntries, retributionHeroTrees());
}
