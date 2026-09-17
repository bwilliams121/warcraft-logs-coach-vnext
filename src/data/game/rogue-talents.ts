/**
 * Talent selection — was this talent actually taken, in this build?
 *
 * THE THREE-WAY RULE, AND WHY THE MIDDLE ONE EXISTS
 *
 *     the talent's own entry is selected at its node   -> SELECTED
 *     a KNOWN sibling entry is selected at that node   -> NOT_SELECTED
 *     anything else                                    -> UNKNOWN
 *
 * `NOT_SELECTED` is a POSITIVE finding: the player demonstrably spent that node
 * on something else. It is not "we did not find the talent".
 *
 * ABSENCE IS NOT `NOT_SELECTED`, DELIBERATELY.
 *
 * A node missing from the observed tree resolves UNKNOWN, not false. Saying
 * "absent means unselected" would need a contract that `combatantinfo.talentTree`
 * is COMPLETE — that every unselected node is genuinely omitted rather than the
 * capture being partial. This build has no such contract, so the stronger rule is
 * not claimed. It can be justified later; it is not needed now, because the real
 * verdict M5-C2 rests on comes from two POSITIVE facts:
 *
 *     Improved Ambush      NOT_SELECTED  (sibling Tight Spender selected)
 *     Shrouded Suffocation SELECTED      (its own entry selected)
 *
 * NODE PRESENCE PROVES NOTHING BY ITSELF.
 *
 * A choice node offers several entries. The real actor this milestone was
 * verified against has node 90692 — the Improved Ambush node — carrying entry
 * 117152, which is Tight Spender. Matching on `nodeId` alone would have resolved
 * `talent.improved_ambush` TRUE when the truth is FALSE. Selection is decided by
 * ENTRY id, and the node is only used to find the alternatives.
 *
 * IDENTITY IS THE NUMBER.
 *
 * `displayNameEn` is for a human reading a debug dump. Nothing here matches on it.
 *
 * THE RULE MOVED TO `talent-selection.ts` AT M10-C, unchanged, so a second
 * specialization can apply it over its own artifact. This module is the rule
 * bound to the Rogue dataset, with every export it had.
 */

import artifact from "./rogue-talents.json";
import { validateTalentArtifact, type TalentArtifact, type TalentIdentity } from "./talent-artifact.js";
import {
  resolveTalentIdentity,
  talentNotModelled,
  type ObservedTalentEntry,
  type TalentResolution,
} from "./talent-selection.js";

export {
  TALENT_SELECTIONS,
  type ObservedTalentEntry,
  type TalentResolution,
  type TalentSelection,
  type TalentSelectionReason,
} from "./talent-selection.js";

export type TalentDataLoad =
  | { readonly ok: true; readonly artifact: TalentArtifact }
  | { readonly ok: false; readonly reason: string; readonly detail: string };

interface LoadedIndex {
  readonly artifact: TalentArtifact;
  readonly byName: ReadonlyMap<string, TalentIdentity>;
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
    index: { artifact: validation.artifact, byName },
  };
  return cached;
}

/** The pinned talent dataset, or the reason it could not be used. */
export function pinnedRogueTalents(): TalentDataLoad {
  return load().load;
}

/** Test seam: forces the next call to re-validate the artifact. */
export function resetTalentDataCache(): void {
  cached = null;
}

/** The identity for a SimulationCraft talent name, or `null` when not modelled. */
export function talentIdentityFor(simcName: string): TalentIdentity | null {
  return load().index?.byName.get(simcName) ?? null;
}

/** Every talent name this dataset can resolve, in artifact order. */
export function modelledTalentNames(): readonly string[] {
  return load().index?.artifact.talents.map((talent) => talent.simcName) ?? [];
}

/**
 * Every modelled talent that RESOLVED against an observed tree, in the binding
 * shape `AtomBindings.knownTalents` wants.
 *
 * ADDED AT M5-D1, and the reason is a real hazard rather than convenience. Call
 * sites used to hand-list the talent names they cared about, so adding
 * `crimson_tempest` to the artifact would have changed nothing until every one of
 * those lists was found and edited — and a call site that missed it would
 * silently keep enumerating a talent the log actually establishes, quietly
 * withholding an elimination the evidence supports.
 *
 * UNKNOWN talents are OMITTED, not reported as `taken: false`. An omitted atom is
 * enumerated across both worlds; a `false` would be a claim the tree does not
 * support. That is the same rule `resolveTalentSelection` follows, carried
 * through rather than re-decided here.
 */
export function resolveModelledTalents(
  observedEntries: readonly ObservedTalentEntry[],
): readonly { readonly name: string; readonly taken: boolean }[] {
  const resolved: { name: string; taken: boolean }[] = [];
  for (const simcName of modelledTalentNames()) {
    const resolution = resolveTalentSelection(observedEntries, simcName);
    if (resolution.selection === "UNKNOWN") continue;
    resolved.push({ name: resolution.simcName, taken: resolution.selection === "SELECTED" });
  }
  return resolved;
}

/**
 * Resolves one talent against an observed tree.
 *
 * The shared three-way rule (`talent-selection.ts`) over this dataset's
 * identity for the name; a name the dataset does not carry is UNKNOWN with
 * `TALENT_NOT_MODELLED`.
 */
export function resolveTalentSelection(
  observedEntries: readonly ObservedTalentEntry[],
  simcName: string,
): TalentResolution {
  const identity = talentIdentityFor(simcName);
  if (identity === null) return talentNotModelled(simcName);
  return resolveTalentIdentity(observedEntries, identity);
}
