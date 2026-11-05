/**
 * The Vengeance Demon Hunter reading of applicability and usability (ONB-X3).
 *
 * APPLICABILITY, IN THE PINNED ORDER. The domain boundary first (`domain-boundary.ts`). Then the
 * constructor readings: an action built on `spell_data_t::not_found()` is background
 * (action.cpp:541-549), and an untaken talent yields exactly that.
 *
 *     fel_devastation      sc_demon_hunter.cpp:4160
 *     fiery_brand          sc_demon_hunter.cpp:4360
 *     spirit_bomb          sc_demon_hunter.cpp:5379
 *     sigil_of_spite       sc_demon_hunter.cpp:5470
 *     felblade             sc_demon_hunter.cpp:7876
 *     reavers_glaive       sc_demon_hunter.cpp:8432, :11322
 *     vengeful_retreat     sc_demon_hunter.cpp:8589
 *     soul_carver          sc_demon_hunter.cpp:8686
 *
 * Baseline spells have no guard. A talent proven not taken by the resolved hero tree is
 * background too. An UNKNOWN build fact never excludes anything.
 *
 * USABILITY: TWO PROOFS, AND NOTHING IN BETWEEN
 *
 *     SIMULATED_PREFIX_EXECUTION  this branch already fired the entry
 *     PROVEN_USABLE               the observed cast itself
 *
 * NOTHING ELSE. No cooldown is derived, no aura identity is pinned, and no resource is
 * reconstructed, so no ACTIVE_COOLDOWN, REQUIRED_AURA_INACTIVE or INSUFFICIENT_RESOURCE is
 * ever claimed, and no unobserved action is ever proven usable.
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
import type { TalentResolution } from "../../../data/game/talent-selection.js";
import { vengeanceDemonHunterTokenBinding } from "../../../data/game/demonhunter-vengeance-gcd-semantics.js";
import { vengeanceDemonHunterNonDomainApplicabilityFor } from "./domain-boundary.js";
import {
  hasExecuted,
  type ExecutedEntry,
  type VengeanceDemonHunterFirstGcdState,
} from "./first-gcd-state.js";

/** Token -> the pinned talent whose absence makes the action `not_found()`-background. */
export const TALENT_BUILT_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  fel_devastation: "fel_devastation",
  fiery_brand: "fiery_brand",
  spirit_bomb: "spirit_bomb",
  sigil_of_spite: "sigil_of_spite",
  felblade: "felblade",
  reavers_glaive: "art_of_the_glaive",
  vengeful_retreat: "vengeful_retreat",
  soul_carver: "soul_carver",
});

/** The proven build facts the applicability rules read. Resolved once per actor. */
export interface VengeanceDemonHunterBuildFacts {
  /** Every modelled talent's three-way resolution, by SimulationCraft name. */
  readonly talents: Readonly<Record<string, TalentResolution>>;
  /** Talents proven not taken, by the three-way rule or by the resolved hero tree. */
  readonly talentsProvenAbsent: ReadonlySet<string>;
}

function background(pinnedBehaviour: string): ActionApplicability {
  return notApplicable("BACKGROUND_UNDER_PROVEN_BUILD", { itemId: null, slot: null, pinnedBehaviour });
}

/** Whether an APL entry is a selectable foreground action for this player. */
export function resolveVengeanceDemonHunterApplicability(
  facts: VengeanceDemonHunterBuildFacts,
  action: AplAction,
): ActionApplicability {
  const nonDomain = vengeanceDemonHunterNonDomainApplicabilityFor(action);
  if (nonDomain !== null) return nonDomain;

  const talentBuilt = TALENT_BUILT_TOKENS[action.actionToken];
  if (talentBuilt === undefined) return applicable();
  if (facts.talents[talentBuilt]?.selection === "SELECTED") return applicable();
  if (facts.talentsProvenAbsent.has(talentBuilt)) {
    return background(
      `the action is built on talent '${talentBuilt}', which is proven not taken; an action built on ` +
        "spell_data_t::not_found() is background (action.cpp:541-549)",
    );
  }
  return unknownApplicability(
    `the action is built on talent '${talentBuilt}', and the observed talent tree does not resolve it`,
  );
}

export interface VengeanceDemonHunterUsabilityInput {
  readonly state: VengeanceDemonHunterFirstGcdState;
  readonly action: AplAction;
  readonly observedAbilityGameId: number;
}

export function resolveVengeanceDemonHunterUsability(
  input: VengeanceDemonHunterUsabilityInput,
): ActionUsabilityVerdict {
  const { state, action, observedAbilityGameId } = input;
  const entry: ExecutedEntry = {
    listName: action.listName,
    priorityOrdinal: action.priorityOrdinal,
    actionToken: action.actionToken,
    sourceLine: action.sourceLine,
  };

  // HYPOTHETICAL FIRST, under its own reason.
  if (hasExecuted(state, entry)) {
    return provenUnusable("SIMULATED_PREFIX_EXECUTION", {
      abilityGameId: null,
      itemId: null,
      provenRemainingAtLeastMs: null,
      cooldownToleranceMs: null,
      detail:
        "HYPOTHETICAL, not observed: in this explored branch this authority entry has already been selected " +
        "once, and nothing returns it at zero elapsed time. This says nothing about what the player did.",
    });
  }

  // OBSERVED SECOND. The cast that demonstrably fired demonstrably was usable.
  const binding = vengeanceDemonHunterTokenBinding(action.actionToken);
  const candidates =
    binding.kind === "KNOWN_ONE"
      ? [binding.abilityGameId]
      : binding.kind === "KNOWN_SET"
        ? binding.abilityGameIds
        : [];
  if (candidates.includes(observedAbilityGameId)) return { kind: "PROVEN_USABLE" };

  return unknownUsability();
}
