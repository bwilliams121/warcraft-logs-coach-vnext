/**
 * The Protection Paladin reading of applicability and usability (M10-C).
 *
 * WHAT THIS COMPOSES
 *
 *     src/simc/action-applicability            the generic verdict vocabulary
 *     src/data/game/paladin-protection-talents  the pinned build facts
 *     src/data/game/paladin-protection-gcd-…    the pinned token identities
 *
 * None of those knows what `hammer_of_the_righteous` means when Blessed Hammer
 * is taken. This module is where the specialization says which pinned
 * `background = true` site each APL entry corresponds to, and under which
 * PROVEN build fact.
 *
 * APPLICABILITY: SIX ENTRY SHAPES, EVERY ONE A CONSTRUCTOR READING
 *
 *     use_item,name=<token>     background when the named item is not worn
 *                               (player.cpp:9874-9884); decided only when the
 *                               token is PINNED in the Paladin item dataset
 *     use_items                 background when NO worn slot produces a
 *                               sub-action (player.cpp:10285-10290). A slot
 *                               produces one when its item, a gem, or an
 *                               enchant carries a use effect
 *                               (create_use_subactions, player.cpp:10456-10463),
 *                               so the negative claim needs every worn item AND
 *                               every enchant/gem state pinned; the positive
 *                               claim needs one pinned on-use item
 *
 *     hammer_of_the_righteous   background when Blessed Hammer is taken
 *                               (sc_paladin_protection.cpp:612-613)
 *     holy_armaments            background unless the Lightsmith tree is active
 *                               (sc_paladin.cpp:2621)
 *     hammer_of_light           background unless the Templar tree is active
 *                               (sc_paladin.cpp:2149)
 *     avenging_wrath            sentinel_t when Sentinel is taken
 *                               (sc_paladin_protection.cpp:980-981), else
 *                               avenging_wrath_t, background unless the
 *                               Avenging Wrath talent is taken and Sentinel is
 *                               not (sc_paladin.cpp:286-291)
 *     fireblood, arcane_torrent racials, per correlated race world
 *                               (player.cpp:8995-9001)
 *
 * Everything else is APPLICABLE, which is the honest default: an entry this
 * module has no grounds to exclude is not one it may skip. And a build fact
 * that is UNKNOWN never excludes anything — there is a world in which the
 * action exists.
 *
 * USABILITY: THREE PROOFS, AND NOTHING IN BETWEEN
 *
 * The observed cast proves the observed action was usable. A hypothetical
 * prefix execution proves an entry unusable in that branch, under a reason
 * that says in words it is counterfactual. A Holy Power spender is proven
 * unusable when the caller's Holy Power is KNOWN below the pinned cost AND
 * every free-cast route is excluded (M10-C4: the cost is pinned from the DBC
 * power table; the free routes — Divine Purpose, Shining Light for Word of
 * Glory — are talent and aura facts the caller must have disproved). A KNOWN
 * Holy Power at or above the cost proves nothing on its own: the 1 s cooldown
 * and the shield requirement are not modelled. Every other entry is UNKNOWN —
 * which the scan treats as "might fire", and which blocks a confident answer
 * exactly as it should. Holy Power is never inferred from an observed
 * uncosted cast.
 */

import type { AplAction } from "../../../simc/apl-authority.js";
import {
  applicable,
  notApplicable,
  provenUnusable,
  unknownApplicability,
  unknownUsability,
  type ActionApplicability,
  type ActionUsabilityVerdict,
} from "../../../simc/action-applicability.js";
import { protectionTokenBinding } from "../../../data/game/paladin-protection-gcd-semantics.js";
import {
  protectionItemEffectForItemId,
  protectionItemEffectForToken,
} from "../../../data/game/paladin-protection-item-effects.js";
import {
  protectionEnchantCreatesUseEffect,
  protectionGemCreatesUseEffect,
  protectionOmittedKeyVerdicts,
} from "../../../data/game/paladin-protection-enchant-effects.js";
import type { ItemEffectIdentity } from "../../../data/game/item-effect-artifact.js";
import type { GearPiece } from "../../../engine/normalization/normalized-events.js";
import type { CooldownReadiness } from "../../../engine/game-state/cooldowns/cooldown-usability.js";
import { installedGemIds, isEmptyGearSlot } from "../../../engine/normalization/combatant-info.js";
import type { TalentSelection } from "../../../data/game/talent-selection.js";
import type { NumericBinding } from "../../../simc/expression/evaluate.js";
import { protectionSpenderCostFor } from "../../../data/game/paladin-protection-spender-costs.js";
import {
  candidateFromUniverseRow,
  candidateRowsFor,
  describeBlocking,
  protectionSubactionPolicy,
} from "./subaction-candidates.js";
import { proveSubactionIdentityIrrelevant } from "../../../simc/subaction-equivalence.js";
import type { HeroTreeResolution, TalentResolution } from "../../../data/game/talent-selection.js";
import {
  hasExecuted,
  racialIsApplicableIn,
  PROTECTION_RACIAL_TOKENS,
  type ExecutedEntry,
  type ProtectionFirstGcdState,
} from "./first-gcd-state.js";

export const HAMMER_OF_THE_RIGHTEOUS_TOKEN = "hammer_of_the_righteous";
export const HOLY_ARMAMENTS_TOKEN = "holy_armaments";
export const HAMMER_OF_LIGHT_TOKEN = "hammer_of_light";
export const AVENGING_WRATH_TOKEN = "avenging_wrath";
export const HAMMER_OF_WRATH_TOKEN = "hammer_of_wrath";
export const USE_ITEM_TOKEN = "use_item";
export const USE_ITEMS_TOKEN = "use_items";

export const TEMPLAR_HERO_TREE_NAME = "templar";
export const LIGHTSMITH_HERO_TREE_NAME = "lightsmith";

/** The proven build facts the applicability rules read. Resolved once per decision. */
export interface ProtectionBuildFacts {
  readonly blessedHammer: TalentResolution;
  readonly sentinel: TalentResolution;
  readonly avengingWrath: TalentResolution;
  readonly heroTree: HeroTreeResolution;
  /** The actor's combatant-info gear rows, positional, placeholders included. */
  readonly wornGear: readonly GearPiece[];
  /** Raw gear positions the normalizer could not read (`CombatantSnapshot.malformedGearRows`). */
  readonly malformedGearRows: readonly number[];
  /**
   * The Lightsmith entry Divine Inspiration: SELECTED, or UNKNOWN. Read by the
   * sub-action equivalence policy (`subaction-candidates.ts`): while it is not
   * disproved, a damage or heal proc is an observable write.
   */
  readonly divineInspiration: TalentSelection;
}

/**
 * Why one worn slot could not be closed. Every reason names the slot index
 * and the fact that is missing; none of them is a claim that the slot has no
 * use effect.
 */
export interface OpenSubActionSlot {
  readonly slotIndex: number;
  readonly reason:
    | "ITEM_NOT_PINNED"
    | "ENCHANT_NOT_PINNED"
    | "GEM_NOT_PINNED"
    /**
     * The row's `permanentEnchant`/`temporaryEnchant` is UNKNOWN in the
     * normalized gear state (present but null, zero or malformed — an OMITTED
     * key is KNOWN_NONE under the dated Warcraft Logs contract and never
     * arrives here), and neither the pinned universe nor the equivalence proof
     * could close it. The detail names what remains possible.
     */
    | "ENCHANT_STATE_NOT_REPORTED"
    /** The row's `gems` is UNKNOWN in the normalized gear state and could not be closed. */
    | "GEM_STATE_NOT_REPORTED"
    /** A raw gear position the normalizer could not read: the equipment is not whole. */
    | "GEAR_ROW_MALFORMED"
    /** A pinned enchant or gem DOES create a use effect: a sub-action with no reviewed contract. */
    | "ENCHANT_OR_GEM_USE_EFFECT";
  readonly detail: string;
}

/**
 * The `use_item` sub-actions `use_items` (no `slots=`) would build for this
 * gear, as far as pinned facts allow.
 *
 * `onUse` lists the pinned worn items with an item-sourced use effect: a
 * POSITIVE fact, valid whatever else is open. `open` lists every slot whose
 * sub-action status could not be established. The set is CLOSED — "exactly
 * these sub-actions exist" — only when `open` is empty.
 */
export interface WornSubActionSet {
  readonly onUse: readonly ItemEffectIdentity[];
  readonly open: readonly OpenSubActionSlot[];
  /**
   * Omitted keys the shared proof CLOSED without reading the omission: every
   * candidate the pinned build admits there is observationally equivalent
   * for the first-GCD question (M10-C3).
   */
  readonly provenIrrelevant: readonly {
    readonly slotIndex: number;
    readonly field: "permanentEnchant" | "gems";
    readonly candidateIds: readonly string[];
  }[];
}

/**
 * Resolves the worn gear against the pinned item and enchant datasets.
 *
 * Reads the NORMALIZED gear state only (M10-C4). A KNOWN identity is checked
 * against the pinned datasets; a KNOWN_NONE identity — an omitted key under
 * the dated Warcraft Logs contract, decided once in `combatant-info.ts` —
 * contributes nothing. An UNKNOWN identity (present but null, zero or
 * malformed) leaves the slot OPEN unless the pinned UNIVERSE excludes it by
 * type (M10-C2) or the shared equivalence proof closes it (M10-C3); the
 * value itself is never read as "none". A malformed raw row makes the
 * equipment not whole and is open under its own reason. An empty slot (the
 * Warcraft Logs placeholder row) contributes nothing and is not open — there
 * is no item there for anything to be attached to.
 */
export function wornSubActionSet(
  gear: readonly GearPiece[],
  divineInspiration: TalentSelection = "UNKNOWN",
  malformedGearRows: readonly number[] = [],
): WornSubActionSet {
  const onUse: ItemEffectIdentity[] = [];
  const open: OpenSubActionSlot[] = [];
  const provenIrrelevant: {
    readonly slotIndex: number;
    readonly field: "permanentEnchant" | "gems";
    readonly candidateIds: readonly string[];
  }[] = [];
  const universe = protectionOmittedKeyVerdicts();
  const policy = protectionSubactionPolicy(divineInspiration);
  /**
   * The M10-C3 step for an omitted key the universe could not exclude by
   * type: prove every admitted candidate equivalent, or name the ones that
   * are not. Returns `null` when the proof closes the key.
   */
  const identityRelevance = (
    field: "permanentEnchant" | "gems",
    identity: ItemEffectIdentity,
    slotIndex: number,
  ): string | null => {
    const rows = candidateRowsFor(field, identity.inventoryType);
    const verdict = proveSubactionIdentityIrrelevant(rows.map(candidateFromUniverseRow), policy);
    if (verdict.kind === "UNKNOWN_SUBACTION_IDENTITY_OBSERVATIONALLY_IRRELEVANT") {
      provenIrrelevant.push({ slotIndex, field, candidateIds: verdict.candidateIds });
      return null;
    }
    if (verdict.kind === "NO_CANDIDATES")
      return "no candidate row could be enumerated, so nothing was proved";
    return (
      `${String(verdict.blocking.length)} of ${String(verdict.candidateIds.length)} admitted candidate(s) are not ` +
      `observationally equivalent: ${describeBlocking(verdict)}`
    );
  };
  for (const slotIndex of malformedGearRows) {
    open.push({ slotIndex, reason: "GEAR_ROW_MALFORMED", detail: "the raw gear row could not be read" });
  }
  for (const piece of gear) {
    if (isEmptyGearSlot(piece)) continue;
    const { slotIndex } = piece;
    const identity = protectionItemEffectForItemId(piece.itemId);
    if (identity === null) {
      open.push({ slotIndex, reason: "ITEM_NOT_PINNED", detail: `item ${String(piece.itemId)}` });
    } else if (identity.onUseEffect !== null) {
      onUse.push(identity);
    }

    for (const [key, enchant] of [
      ["permanentEnchant", piece.permanentEnchant],
      ["temporaryEnchant", piece.temporaryEnchant],
    ] as const) {
      // KNOWN_NONE: an omitted key under the dated contract. Nothing to check.
      if (enchant.state === "KNOWN_NONE") continue;
      if (enchant.state === "UNKNOWN") {
        const excluded = omittedEnchantExcludedByUniverse(universe, key, identity);
        if (excluded === null) {
          open.push({
            slotIndex,
            reason: "ENCHANT_STATE_NOT_REPORTED",
            detail: `${key} is UNKNOWN (${enchant.reason}); the pinned universe could not exclude a use enchant`,
          });
        } else if (!excluded.excluded) {
          // Not excludable by type. The identity may still be IRRELEVANT.
          const relevance =
            key === "permanentEnchant" && identity !== null
              ? identityRelevance("permanentEnchant", identity, slotIndex)
              : "the equivalence proof needs the item's pinned inventory type";
          if (relevance !== null) {
            open.push({
              slotIndex,
              reason: "ENCHANT_STATE_NOT_REPORTED",
              detail: `${key} is UNKNOWN (${enchant.reason}); ${excluded.detail}; ${relevance}`,
            });
          }
        }
        continue;
      }
      const enchantId = enchant.enchantId;
      const createsUse = protectionEnchantCreatesUseEffect(enchantId);
      if (createsUse === null) {
        open.push({ slotIndex, reason: "ENCHANT_NOT_PINNED", detail: `${key} ${String(enchantId)}` });
      } else if (createsUse) {
        open.push({ slotIndex, reason: "ENCHANT_OR_GEM_USE_EFFECT", detail: `${key} ${String(enchantId)}` });
      }
    }

    const gemIds = installedGemIds(piece.gems);
    if (gemIds === null) {
      const reason = piece.gems.state === "UNKNOWN" ? piece.gems.reason : "UNKNOWN";
      if (universe === null || identity === null) {
        open.push({
          slotIndex,
          reason: "GEM_STATE_NOT_REPORTED",
          detail:
            `gems is UNKNOWN (${reason}); ` +
            (universe === null ? "the pinned universe did not load" : "the item is not pinned"),
        });
      } else if (universe.gemBorneUseEffectPossible) {
        const relevance = identityRelevance("gems", identity, slotIndex);
        if (relevance !== null) {
          open.push({
            slotIndex,
            reason: "GEM_STATE_NOT_REPORTED",
            detail:
              `gems is UNKNOWN (${reason}); the pinned build has gem-borne use effects and no socket model ` +
              `excludes them here; ${relevance}`,
          });
        }
      }
      continue;
    }
    for (const gemId of gemIds) {
      const createsUse = protectionGemCreatesUseEffect(gemId);
      if (createsUse === null) {
        open.push({ slotIndex, reason: "GEM_NOT_PINNED", detail: `gem ${String(gemId)}` });
      } else if (createsUse) {
        open.push({ slotIndex, reason: "ENCHANT_OR_GEM_USE_EFFECT", detail: `gem ${String(gemId)}` });
      }
    }
  }
  return { onUse, open, provenIrrelevant };
}

/**
 * Whether the pinned universe excludes a use-producing enchant from an
 * OMITTED key on this row. `null` when the universe did not load or the item
 * is unpinned (so its inventory type is unknown); otherwise a verdict with the
 * universe's own reason.
 */
function omittedEnchantExcludedByUniverse(
  universe: ReturnType<typeof protectionOmittedKeyVerdicts>,
  key: "permanentEnchant" | "temporaryEnchant",
  identity: ItemEffectIdentity | null,
): { readonly excluded: boolean; readonly detail: string } | null {
  if (universe === null) return null;
  if (key === "temporaryEnchant") {
    return universe.temporaryUseEnchantPossible
      ? { excluded: false, detail: "a temporary enchant in the pinned build creates a use effect" }
      : { excluded: true, detail: "no temporary enchant in the pinned build creates a use effect" };
  }
  if (identity === null) return null;
  const verdict = universe.permanentUseEnchantPossible(identity.inventoryType);
  return { excluded: !verdict.possible, detail: verdict.detail };
}

/** Whether a pinned item id is worn in a non-empty slot. */
function isWorn(gear: readonly GearPiece[], itemId: number): boolean {
  return gear.some((piece) => !isEmptyGearSlot(piece) && piece.itemId === itemId);
}

/** `name=` parameter, read from the verbatim action string. */
function namedParameter(actionStringVerbatim: string, key: string): string | null {
  const match = new RegExp(`(?:^|,)${key}=([A-Za-z0-9_]+)`).exec(actionStringVerbatim);
  return match?.[1] ?? null;
}

function background(pinnedBehaviour: string): ActionApplicability {
  return notApplicable("BACKGROUND_UNDER_PROVEN_BUILD", { itemId: null, slot: null, pinnedBehaviour });
}

/** Whether the hero tree is RESOLVED to a named tree, or unknown. */
function heroTreeIs(facts: ProtectionBuildFacts, simcName: string): boolean | null {
  if (facts.heroTree.state !== "RESOLVED") return null;
  return facts.heroTree.simcName === simcName;
}

/**
 * Whether an APL entry is a selectable foreground action for this player.
 *
 * Returns APPLICABLE for anything this module has no grounds to exclude, and
 * UNKNOWN when the deciding build fact is unresolved.
 */
export function resolveProtectionApplicability(
  facts: ProtectionBuildFacts,
  state: ProtectionFirstGcdState,
  action: AplAction,
): ActionApplicability {
  const { actionToken } = action;

  if ((PROTECTION_RACIAL_TOKENS as readonly string[]).includes(actionToken)) {
    if (racialIsApplicableIn(state, actionToken)) return applicable();
    return notApplicable("RACIAL_NOT_AVAILABLE_TO_RACE", {
      itemId: null,
      slot: null,
      pinnedBehaviour:
        `find_racial_spell returned not_found() for a ${state.race} player, so racial_spell_t::init ` +
        "set background = true (player.cpp:8995-9001) and select_action skips it before any readiness check",
    });
  }

  if (actionToken === USE_ITEM_TOKEN) {
    const token = namedParameter(action.actionStringVerbatim, "name");
    // `use_item` without a name, or with a name the dataset does not pin,
    // cannot be resolved to a number: whether the actor wears it is
    // unknowable — not false.
    if (token === null) return applicable();
    const identity = protectionItemEffectForToken(token);
    if (identity === null) return applicable();
    if (isWorn(facts.wornGear, identity.itemId)) return applicable();
    return notApplicable("ITEM_NOT_EQUIPPED", {
      itemId: identity.itemId,
      slot: null,
      pinnedBehaviour:
        "use_item_t constructor: find_item_by_name returned null, so background = true " +
        "(player.cpp:9874-9884) and select_action skips it before any readiness check; the actor's " +
        "combatant info lists no such item",
    });
  }

  if (actionToken === USE_ITEMS_TOKEN) {
    // `use_items` with no `slots=` builds a sub-action for EVERY worn item that
    // carries an on-use effect (player.cpp:10331-10357). The claim "none does"
    // needs every worn item pinned; anything less stays UNKNOWN.
    if (namedParameter(action.actionStringVerbatim, "slots") !== null) {
      return unknownApplicability(
        "use_items with a slots= parameter is not modelled for this specialization; the entry stays live",
      );
    }
    const worn = wornSubActionSet(facts.wornGear, facts.divineInspiration, facts.malformedGearRows);
    // One pinned on-use item is enough for the entry to exist, whatever else is open.
    if (worn.onUse.length > 0) return applicable();
    if (worn.open.length > 0) {
      return unknownApplicability(
        `${String(worn.open.length)} worn slot(s) could not be closed against the pinned item and enchant ` +
          "datasets, so whether use_items builds a sub-action cannot be established",
      );
    }
    return notApplicable("NO_ON_USE_EFFECT", {
      itemId: null,
      slot: null,
      pinnedBehaviour:
        "use_items_t::init: no sub-actions created because no worn item has a usable special effect, so " +
        "background = true (player.cpp:10285-10290)",
    });
  }

  if (actionToken === HAMMER_OF_THE_RIGHTEOUS_TOKEN) {
    if (facts.blessedHammer.selection === "SELECTED") {
      return background(
        "hammer_of_the_righteous_t constructor: if ( p->talents.blessed_hammer->ok() ) background = true " +
          "(sc_paladin_protection.cpp:612-613); Blessed Hammer is SELECTED in the observed talent tree",
      );
    }
    return applicable();
  }

  if (actionToken === HOLY_ARMAMENTS_TOKEN) {
    const lightsmith = heroTreeIs(facts, LIGHTSMITH_HERO_TREE_NAME);
    if (lightsmith === null) {
      return unknownApplicability(
        "holy_armaments_t is background unless the Lightsmith tree is active (sc_paladin.cpp:2621), and the " +
          "observed talent tree resolves no pinned hero sub-tree",
      );
    }
    if (lightsmith) return applicable();
    return background(
      "holy_armaments_t constructor: background = !p->lightsmith() (sc_paladin.cpp:2621); the observed " +
        "talent tree resolves to a different pinned hero sub-tree",
    );
  }

  if (actionToken === HAMMER_OF_LIGHT_TOKEN) {
    const templar = heroTreeIs(facts, TEMPLAR_HERO_TREE_NAME);
    if (templar === null) {
      return unknownApplicability(
        "hammer_of_light_t is background unless the Templar tree is active (sc_paladin.cpp:2149), and the " +
          "observed talent tree resolves no pinned hero sub-tree",
      );
    }
    if (templar) return applicable();
    return background(
      "hammer_of_light_t constructor: background = !p->templar() (sc_paladin.cpp:2149); the observed " +
        "talent tree resolves to a different pinned hero sub-tree",
    );
  }

  if (actionToken === AVENGING_WRATH_TOKEN) {
    // Sentinel taken: create_action_protection returns sentinel_t, which is
    // foreground whenever Sentinel is taken. Settled without the AW talent.
    if (facts.sentinel.selection === "SELECTED") return applicable();
    // Sentinel not taken: avenging_wrath_t, background unless the AW talent is
    // taken. Both facts proven negative is the only negative claim.
    if (facts.sentinel.selection === "NOT_SELECTED" && facts.avengingWrath.selection === "NOT_SELECTED") {
      return background(
        "avenging_wrath_t constructor: if ( !p->talents.avenging_wrath->ok() ) background = true " +
          "(sc_paladin.cpp:286-287); neither Sentinel nor Avenging Wrath is selected in the observed tree, " +
          "so create_action_protection does not substitute sentinel_t (sc_paladin_protection.cpp:980-981)",
      );
    }
    if (facts.avengingWrath.selection === "SELECTED") return applicable();
    return unknownApplicability(
      "avenging_wrath resolves to sentinel_t or to avenging_wrath_t depending on the Sentinel and Avenging " +
        "Wrath talents, and the observed talent tree leaves at least one of them unresolved",
    );
  }

  return applicable();
}

/**
 * Whether an applicable entry is proven able or unable to fire.
 *
 * Positive proof: the observed cast. Negative proof: a hypothetical prefix
 * execution. Everything else UNKNOWN.
 */
/**
 * What the caller can say about Holy Power spending at the decision. Both
 * default to "nothing": an UNKNOWN pool and free casts NOT excluded.
 */
export interface ProtectionSpenderFacts {
  readonly holyPower: NumericBinding;
  /** True only when Divine Purpose (and, for Word of Glory, Shining Light) is DISPROVED. */
  readonly freeCastExcluded: boolean;
}

export const UNKNOWN_SPENDER_FACTS: ProtectionSpenderFacts = {
  holyPower: { state: "UNKNOWN_NUMBER", reason: "STATE_NOT_ESTABLISHED" },
  freeCastExcluded: false,
};

/**
 * What is known about cooldown READINESS at this decision, per APL token —
 * derived by the specialization's cooldown bindings from OBSERVED prior casts
 * (M10-C5 Phase A). Only PROVEN_NOT_READY is ever acted on; everything else
 * is UNKNOWN usability. A token absent from the list has no readiness fact.
 */
export interface ProtectionReadinessFact {
  readonly simcToken: string;
  readonly readiness: CooldownReadiness;
  /** The ability whose observed cast the proof rests on, when PROVEN_NOT_READY. */
  readonly abilityGameId: number | null;
}

/**
 * An action whose own `ready()` requires an aura the evidence has PROVEN
 * inactive at this decision (M10-C5 Phase B): Hammer of Wrath outside wings.
 * Only a BOUND `up: false` from an observed removal produces one; silence
 * never does.
 */
export interface ProtectionAuraGateFact {
  readonly simcToken: string;
  readonly requiredAuraAbilityGameId: number;
  readonly anchorReportTimeMs: number;
}

export const NO_AURA_GATE_FACTS: readonly ProtectionAuraGateFact[] = [];

export const NO_READINESS_FACTS: readonly ProtectionReadinessFact[] = [];

export function resolveProtectionUsability(
  state: ProtectionFirstGcdState,
  action: AplAction,
  observedAbilityGameId: number,
  spender: ProtectionSpenderFacts = UNKNOWN_SPENDER_FACTS,
  readiness: readonly ProtectionReadinessFact[] = NO_READINESS_FACTS,
  auraGates: readonly ProtectionAuraGateFact[] = NO_AURA_GATE_FACTS,
): ActionUsabilityVerdict {
  const entry: ExecutedEntry = {
    listName: action.listName,
    priorityOrdinal: action.priorityOrdinal,
    actionToken: action.actionToken,
    sourceLine: action.sourceLine,
  };

  // HYPOTHETICAL FIRST, and under its own reason. This branch already fired
  // this entry; SimulationCraft's cooldown on it is far longer than the
  // queueing tolerance for every pinned Protection action, and no simulated
  // time passes to return it.
  if (hasExecuted(state, entry)) {
    return provenUnusable("SIMULATED_PREFIX_EXECUTION", {
      abilityGameId: null,
      itemId: null,
      provenRemainingAtLeastMs: null,
      cooldownToleranceMs: null,
      detail:
        "HYPOTHETICAL, not observed: in this explored branch this authority entry has already been " +
        "selected once, and nothing returns it at zero elapsed time. This says nothing about what the " +
        "player actually did.",
    });
  }

  // OBSERVED SECOND. The cast that demonstrably fired demonstrably was usable.
  const binding = protectionTokenBinding(action.actionToken);
  const candidates =
    binding.kind === "KNOWN_ONE"
      ? [binding.abilityGameId]
      : binding.kind === "KNOWN_SET"
        ? binding.abilityGameIds
        : [];
  if (candidates.includes(observedAbilityGameId)) return { kind: "PROVEN_USABLE" };

  // A DERIVED cooldown proven to exceed the queueing tolerance. Checked AFTER
  // the observed press, so a derivation can never contradict an observation;
  // and only the negative direction is ever claimed (cooldown-usability.ts).
  const fact = readiness.find((entry) => entry.simcToken === action.actionToken);
  if (fact !== undefined && fact.readiness.state === "PROVEN_NOT_READY") {
    return provenUnusable("ACTIVE_COOLDOWN", {
      abilityGameId: fact.abilityGameId,
      itemId: null,
      provenRemainingAtLeastMs: fact.readiness.provenRemainingAtLeastMs,
      cooldownToleranceMs: fact.readiness.cooldownToleranceMs,
      detail:
        "the ability's own cooldown, anchored on the actor's last OBSERVED cast before this decision under " +
        "the pinned base and the reviewed modifier policy, is proven to exceed the queueing tolerance, so " +
        "action_t::ready cannot succeed. The bound is a LOWER bound and is compared as one.",
    });
  }

  // An aura the action's own ready() requires, PROVEN inactive at this
  // decision. Hammer of Wrath is `judgment_base_t::action_ready() &&
  // p()->buffs.hammer_of_wrath->up()` (sc_paladin.cpp:1799-1801): outside
  // wings the buff is down and the action cannot fire whatever its cooldown
  // says. The fact comes from the aura binding (a BOUND `up: false` reading
  // of 1277026), never from silence.
  const gate = auraGates.find((entry) => entry.simcToken === action.actionToken);
  if (gate !== undefined) {
    return provenUnusable("REQUIRED_AURA_INACTIVE", {
      abilityGameId: gate.requiredAuraAbilityGameId,
      itemId: null,
      provenRemainingAtLeastMs: null,
      cooldownToleranceMs: null,
      detail:
        `action_ready() requires aura ${String(gate.requiredAuraAbilityGameId)} up, and M4 proved it INACTIVE ` +
        `from the removal observed at ${String(gate.anchorReportTimeMs)}; the action cannot fire whatever its cooldown says.`,
    });
  }

  // A PINNED-COST spender with a KNOWN pool below the cost and no free route.
  const cost = protectionSpenderCostFor(action.actionToken);
  if (cost !== null && cost.holyPowerCost !== null && spender.freeCastExcluded) {
    const pool = spender.holyPower;
    const known = pool.state === "KNOWN_NUMBER" ? pool.value : null;
    if (known !== null && known < cost.holyPowerCost) {
      return provenUnusable("INSUFFICIENT_RESOURCE", {
        abilityGameId: cost.spellId,
        itemId: null,
        provenRemainingAtLeastMs: null,
        cooldownToleranceMs: null,
        detail:
          `Holy Power is KNOWN ${String(known)} and the pinned cost is ${String(cost.holyPowerCost)}; every ` +
          "free-cast route is excluded, so action_t::ready() fails cost_affordable()",
      });
    }
  }

  return unknownUsability();
}
