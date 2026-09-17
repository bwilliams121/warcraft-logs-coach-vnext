/**
 * Talent selection over an observed tree — the class-neutral rule (M10-C).
 *
 * THE THREE-WAY RULE, AND WHY THE MIDDLE ONE EXISTS
 *
 *     the talent's own entry is selected at its node   -> SELECTED
 *     a KNOWN sibling entry is selected at that node   -> NOT_SELECTED
 *     anything else                                    -> UNKNOWN
 *
 * `NOT_SELECTED` is a POSITIVE finding: the player demonstrably spent that node
 * on something else. It is not "we did not find the talent". A node missing
 * from the observed tree resolves UNKNOWN, not false: that would need a
 * contract that `combatantinfo.talentTree` is COMPLETE, which this build has
 * not claimed. See `rogue-talents.ts` for the real verdict the rule was first
 * proven on.
 *
 * MOVED HERE FROM `rogue-talents.ts` AT M10-C because the rule never named a
 * class: it reads one pinned identity and one observed tree. The Rogue module
 * binds it to the Rogue artifact exactly as before; the Paladin module binds
 * it to its own. Two further class-neutral questions arrived with the second
 * artifact and live here for the same reason:
 *
 *   - HERO TREE membership: which pinned sub-tree, if any, the observed
 *     hero-talent entries belong to
 *   - APEX (tiered) traits: `apex.N`, resolved positionally against the pinned
 *     table order and then by the same three-way rule
 *
 * IDENTITY IS THE NUMBER. `displayNameEn` is for a human reading a debug
 * dump. Nothing here matches on it.
 */

import type { ApexTraitIdentity, HeroTreeIdentity, TalentIdentity } from "./talent-artifact.js";

/**
 * One entry as Warcraft Logs reports it in `combatantinfo.talentTree`.
 *
 * Structural only: plain numbers, so this module stays independent of the
 * engine's normalized event types. `rank` is accepted and ignored — a rank says
 * how far a selected talent was pushed, not whether a different entry was
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

/**
 * Resolves one PINNED identity against an observed tree.
 *
 * Takes the entries verbatim. It never asks how complete the tree is, because
 * nothing it concludes depends on completeness — the only two decisive outcomes
 * both rest on an entry that IS present.
 */
export function resolveTalentIdentity(
  observedEntries: readonly ObservedTalentEntry[],
  identity: TalentIdentity,
): TalentResolution {
  const { simcName } = identity;

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

/** The refusal for a name the dataset does not carry. */
export function talentNotModelled(simcName: string): TalentResolution {
  return {
    simcName,
    selection: "UNKNOWN",
    reason: "TALENT_NOT_MODELLED",
    identity: null,
    decidedByEntryId: null,
  };
}

// ---------------------------------------------------------------------------
// Hero trees
// ---------------------------------------------------------------------------

/**
 * Which pinned hero sub-tree the observed entries belong to.
 *
 *     entries of exactly ONE pinned sub-tree observed   -> RESOLVED, that tree
 *     entries of TWO OR MORE pinned sub-trees observed  -> CONTRADICTORY
 *     no pinned hero entry observed at all              -> UNKNOWN
 *
 * Membership is by ENTRY NUMBER against the pinned lists, never by which
 * spells the player cast. `UNKNOWN` is the honest answer for an empty
 * intersection: a hero tree the dataset does not carry, a partial tree, or a
 * capture with no hero talents at all are indistinguishable here.
 * `CONTRADICTORY` cannot happen for a real character — one hero tree is active
 * at a time — so it is reported rather than resolved either way.
 */
export type HeroTreeResolution =
  | {
      readonly state: "RESOLVED";
      readonly simcName: string;
      readonly subTreeId: number;
      readonly decidedByEntryIds: readonly number[];
    }
  | { readonly state: "CONTRADICTORY"; readonly subTreeIds: readonly number[] }
  | { readonly state: "UNKNOWN" };

export function resolveHeroTree(
  observedEntries: readonly ObservedTalentEntry[],
  heroTrees: readonly HeroTreeIdentity[],
): HeroTreeResolution {
  const observedIds = new Set(observedEntries.map((entry) => entry.id));
  const hits: { readonly tree: HeroTreeIdentity; readonly entryIds: number[] }[] = [];
  for (const tree of heroTrees) {
    const entryIds = tree.entries
      .map((entry) => entry.traitEntryId)
      .filter((traitEntryId) => observedIds.has(traitEntryId));
    if (entryIds.length > 0) hits.push({ tree, entryIds });
  }
  if (hits.length === 0) return { state: "UNKNOWN" };
  if (hits.length > 1) return { state: "CONTRADICTORY", subTreeIds: hits.map((hit) => hit.tree.subTreeId) };
  const only = hits[0];
  if (only === undefined) return { state: "UNKNOWN" };
  return {
    state: "RESOLVED",
    simcName: only.tree.simcName,
    subTreeId: only.tree.subTreeId,
    decidedByEntryIds: only.entryIds,
  };
}

// ---------------------------------------------------------------------------
// Apex (tiered) traits
// ---------------------------------------------------------------------------

/**
 * `apex.N` against the observed tree.
 *
 * Positional first: the N-th pinned tiered trait, in the table order the
 * artifact recorded. Then the SAME three-way rule as any other talent, with
 * the trait's node-mates as its alternatives — a tiered node lists every tier
 * as a separate entry, so an observed lower tier at the same node is the
 * positive disproof that the asked-for tier was not reached. An index the
 * table does not have is `TALENT_NOT_MODELLED`, never false.
 */
export function resolveApexTrait(
  observedEntries: readonly ObservedTalentEntry[],
  apexTraits: readonly ApexTraitIdentity[],
  apexIndex: number,
): TalentResolution {
  const simcName = `apex.${String(apexIndex)}`;
  const trait = apexTraits.find((candidate) => candidate.apexIndex === apexIndex);
  if (trait === undefined) return talentNotModelled(simcName);
  const identity: TalentIdentity = {
    simcName,
    displayNameEn: trait.displayNameEn,
    tree: "SPECIALIZATION",
    traitNodeId: trait.traitNodeId,
    traitEntryId: trait.traitEntryId,
    talentSpellId: trait.talentSpellId,
    nodeType: "CHOICE",
    alternativeEntries: apexTraits
      .filter((other) => other.traitNodeId === trait.traitNodeId && other.traitEntryId !== trait.traitEntryId)
      .map((other) => ({
        traitEntryId: other.traitEntryId,
        displayNameEn: other.displayNameEn,
        talentSpellId: other.talentSpellId,
      })),
    binding:
      "player.cpp:12313-12331 apex.N = the N-th NODE_TIERED specialization trait in generated table order",
  };
  return resolveTalentIdentity(observedEntries, identity);
}
