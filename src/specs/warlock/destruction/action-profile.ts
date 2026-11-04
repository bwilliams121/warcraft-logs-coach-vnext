/**
 * The Destruction Warlock reading of applicability and usability (ONB-D1).
 *
 * APPLICABILITY, IN THE PINNED ORDER. The domain boundary first (`domain-boundary.ts`). Then the
 * constructor readings: an action built on `spell_data_t::not_found()` is background
 * (action.cpp:541-549), and an untaken talent yields exactly that.
 *
 *     soul_fire, conflagrate, chaos_bolt, summon_infernal, shadowburn, cataclysm, havoc
 *                          built on the talent of the same name (sc_warlock_actions.cpp, each constructor)
 *     malevolence          sc_warlock_actions.cpp:1298
 *     wither               sc_warlock_actions.cpp:1189
 *     ruination            sc_warlock_actions.cpp:5309, sc_warlock_init.cpp:578
 *     infernal_bolt        sc_warlock_actions.cpp:5202, sc_warlock_init.cpp:561
 *
 * IMMOLATE IS THE REVERSE. It is `immolate_old` only when the hero talent Wither is NOT taken
 * (sc_warlock_actions.cpp:4071), so a build with Wither has it background, and it is applicable only when
 * Wither is proven absent.
 *
 * RAIN OF FIRE IS NOT RESOLVED. Its talent is a choice of two rows on one node (trait_data.inc:1900-1901,
 * sc_warlock_init.cpp:393-395), so its applicability stays UNKNOWN. No real scan reaches it.
 *
 * Baseline Incinerate has no guard. A talent proven not taken by the resolved hero tree is
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
import { destructionTokenBinding } from "../../../data/game/warlock-destruction-gcd-semantics.js";
import { destructionNonDomainApplicabilityFor } from "./domain-boundary.js";
import { hasExecuted, type ExecutedEntry, type DestructionFirstGcdState } from "./first-gcd-state.js";

/** Token -> the pinned talent whose absence makes the action `not_found()`-background. */
export const TALENT_BUILT_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  soul_fire: "soul_fire",
  conflagrate: "conflagrate",
  chaos_bolt: "chaos_bolt",
  summon_infernal: "summon_infernal",
  shadowburn: "shadowburn",
  cataclysm: "cataclysm",
  havoc: "havoc",
  malevolence: "malevolence",
  wither: "wither",
  ruination: "ruination",
  infernal_bolt: "secrets_of_the_coven",
});

/** The proven build facts the applicability rules read. Resolved once per actor. */
export interface DestructionBuildFacts {
  /** Every modelled talent's three-way resolution, by SimulationCraft name. */
  readonly talents: Readonly<Record<string, TalentResolution>>;
  /** Talents proven not taken, by the three-way rule or by the resolved hero tree. */
  readonly talentsProvenAbsent: ReadonlySet<string>;
}

function background(pinnedBehaviour: string): ActionApplicability {
  return notApplicable("BACKGROUND_UNDER_PROVEN_BUILD", { itemId: null, slot: null, pinnedBehaviour });
}

/** Whether an APL entry is a selectable foreground action for this player. */
export function resolveDestructionApplicability(
  facts: DestructionBuildFacts,
  action: AplAction,
): ActionApplicability {
  const nonDomain = destructionNonDomainApplicabilityFor(action);
  if (nonDomain !== null) return nonDomain;

  if (action.actionToken === "immolate") {
    if (facts.talents["wither"]?.selection === "SELECTED") {
      return background(
        "the action is built on Immolate's direct row only without the hero talent Wither, which is taken " +
          "(sc_warlock_actions.cpp:4071); an action built on spell_data_t::not_found() is background (action.cpp:541-549)",
      );
    }
    if (facts.talentsProvenAbsent.has("wither")) return applicable();
    return unknownApplicability(
      "Immolate needs the hero talent Wither proven absent, and the observed tree does not",
    );
  }
  if (action.actionToken === "rain_of_fire") {
    return unknownApplicability(
      "Rain of Fire's talent is a choice of two rows, which no modelled talent resolves",
    );
  }

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

export interface DestructionUsabilityInput {
  readonly state: DestructionFirstGcdState;
  readonly action: AplAction;
  readonly observedAbilityGameId: number;
}

export function resolveDestructionUsability(input: DestructionUsabilityInput): ActionUsabilityVerdict {
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
  const binding = destructionTokenBinding(action.actionToken);
  const candidates =
    binding.kind === "KNOWN_ONE"
      ? [binding.abilityGameId]
      : binding.kind === "KNOWN_SET"
        ? binding.abilityGameIds
        : [];
  if (candidates.includes(observedAbilityGameId)) return { kind: "PROVEN_USABLE" };

  return unknownUsability();
}
