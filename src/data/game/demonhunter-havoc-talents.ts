/**
 * Havoc Demon Hunter's talent and hero-tree identities (ONB-A1).
 *
 * THE DEMON HUNTER BINDING OF THE CLASS-NEUTRAL SELECTION RULE. Every verdict is
 * `talent-selection.ts`'s three-way rule over `demonhunter-havoc-talents.json`.
 *
 * WHAT IS PINNED. The talents the pinned list reads, the talents an action of it
 * is built on, and the talents that gate a buff or background copy the analyzer
 * reads; and Fel-Scarred (sub-tree 34) and Aldrachi Reaver (35), so
 * `hero_tree.<name>` is answered by entry membership, never by a spell cast.
 *
 * WHAT IS DELIBERATELY NOT PINNED, because the extractor never picks between rows
 * of one name: Violent Transformation (one row each under Fel-Scarred and
 * Void-Scarred, both listing Havoc) and Eternal Hunt (three tiers at one node).
 *
 * ABSENCE IS NOT `NOT_SELECTED`. A Fire Inside and Burning Wound are alone on
 * their nodes, so a build without them resolves UNKNOWN, never false.
 */

import artifact from "./demonhunter-havoc-talents.json";
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

export const HAVOC_DEMON_HUNTER_TALENT_DATASET_ID = "SIMC_TRAIT_DEMONHUNTER_HAVOC_TALENTS";

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
export function pinnedHavocDemonHunterTalents(): TalentDataLoad {
  return load().load;
}

/** Test seam: forces the next call to re-validate the artifact. */
export function resetHavocDemonHunterTalentCache(): void {
  cached = null;
}

/** Every talent name this dataset can resolve, in artifact order. */
export function havocModelledTalentNames(): readonly string[] {
  return load().index?.artifact.talents.map((talent) => talent.simcName) ?? [];
}

/** Resolves one talent against an observed tree. UNKNOWN is a refusal. */
export function resolveHavocTalent(
  observedEntries: readonly ObservedTalentEntry[],
  simcName: string,
): TalentResolution {
  const identity = load().index?.byName.get(simcName) ?? null;
  if (identity === null) return talentNotModelled(simcName);
  return resolveTalentIdentity(observedEntries, identity);
}

/** Which pinned hero sub-tree the observed entries belong to. */
export function resolveHavocHeroTree(observedEntries: readonly ObservedTalentEntry[]): HeroTreeResolution {
  return resolveHeroTree(observedEntries, load().index?.heroTrees ?? []);
}
