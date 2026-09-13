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
 */

import artifact from "./rogue-talents.json";
import { validateTalentArtifact, type TalentArtifact, type TalentIdentity } from "./talent-artifact.js";

/**
 * One entry as Warcraft Logs reports it in `combatantinfo.talentTree`.
 *
 * Structural only: this module takes plain numbers so it stays independent of
 * the engine's normalized event types. `rank` is accepted and ignored — a rank
 * says how far a selected talent was pushed, not whether a different entry was
 * chosen at that node.
 */
export interface ObservedTalentEntry {
  readonly id: number;
  readonly nodeId: number | null;
}

/**
 * Whether a talent was taken.
 *
 * Three members, and `UNKNOWN` is a refusal rather than a value. Nothing may
 * read it as `NOT_SELECTED`.
 */
export type TalentSelection = "SELECTED" | "NOT_SELECTED" | "UNKNOWN";

export const TALENT_SELECTIONS = [
  "SELECTED",
  "NOT_SELECTED",
  "UNKNOWN",
] as const satisfies readonly TalentSelection[];

/** Why a talent resolved the way it did. Auditable, and never interpolated from upstream data. */
export type TalentSelectionReason =
  /** The talent's own trait entry appears in the observed tree. */
  | "OWN_ENTRY_SELECTED"
  /** A known sibling entry at the same choice node appears instead. */
  | "ALTERNATIVE_ENTRY_SELECTED"
  /** The node appears, but carrying an entry this dataset does not know. */
  | "NODE_PRESENT_WITH_UNKNOWN_ENTRY"
  /** The node does not appear at all. NOT evidence that it was unselected. */
  | "NODE_ABSENT"
  /** This dataset carries no identity for that SimulationCraft name. */
  | "TALENT_NOT_MODELLED";

export interface TalentResolution {
  readonly simcName: string;
  readonly selection: TalentSelection;
  readonly reason: TalentSelectionReason;
  /** The identity the answer rests on, when one is known. */
  readonly identity: TalentIdentity | null;
  /** The observed entry that decided it, when one did. */
  readonly decidedByEntryId: number | null;
}

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

/**
 * Resolves one talent against an observed tree.
 *
 * Takes the entries verbatim. It never asks how complete the tree is, because
 * nothing it concludes depends on completeness — the only two decisive outcomes
 * both rest on an entry that IS present.
 */
export function resolveTalentSelection(
  observedEntries: readonly ObservedTalentEntry[],
  simcName: string,
): TalentResolution {
  const identity = talentIdentityFor(simcName);
  if (identity === null) {
    return {
      simcName,
      selection: "UNKNOWN",
      reason: "TALENT_NOT_MODELLED",
      identity: null,
      decidedByEntryId: null,
    };
  }

  // The talent's own entry, matched by NUMBER. Checked first and independently
  // of the node, because a selected entry settles the question outright.
  const own = observedEntries.find((entry) => entry.id === identity.traitEntryId);
  if (own !== undefined) {
    return {
      simcName,
      selection: "SELECTED",
      reason: "OWN_ENTRY_SELECTED",
      identity,
      decidedByEntryId: own.id,
    };
  }

  // A known sibling at the same node. This is the POSITIVE disproof: the node was
  // spent on something else, so the talent was not taken.
  const alternativeIds = new Set(identity.alternativeEntries.map((entry) => entry.traitEntryId));
  const alternative = observedEntries.find((entry) => alternativeIds.has(entry.id));
  if (alternative !== undefined) {
    return {
      simcName,
      selection: "NOT_SELECTED",
      reason: "ALTERNATIVE_ENTRY_SELECTED",
      identity,
      decidedByEntryId: alternative.id,
    };
  }

  // The node appears carrying an entry this dataset does not know. That is a gap
  // in our data, not a disproof — a future trait revision could add an entry.
  const atNode = observedEntries.find((entry) => entry.nodeId === identity.traitNodeId);
  if (atNode !== undefined) {
    return {
      simcName,
      selection: "UNKNOWN",
      reason: "NODE_PRESENT_WITH_UNKNOWN_ENTRY",
      identity,
      decidedByEntryId: atNode.id,
    };
  }

  // The node is absent. Deliberately UNKNOWN: see the module header.
  return { simcName, selection: "UNKNOWN", reason: "NODE_ABSENT", identity, decidedByEntryId: null };
}
