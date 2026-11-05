/**
 * The Affliction Warlock reading of applicability and usability (ONB-D4).
 *
 * APPLICABILITY, IN THE PINNED ORDER. The domain boundary first (`domain-boundary.ts`). Then the
 * constructor readings: an action built on `spell_data_t::not_found()` is background
 * (action.cpp:541-549), and an untaken talent yields exactly that.
 *
 *     agony, dark_harvest, drain_soul, haunt, malefic_grasp, seed_of_corruption, summon_darkglare, unstable_affliction
 *                          built on the specialization talent of the same name (sc_warlock_actions.cpp, each constructor)
 *     malevolence, wither  built on the hero talent of the same name
 *
 * TWO ACTIONS ARE BUILT ON A TALENT'S ABSENCE, so the reading runs the other way. Corruption is on `!hero.wither.ok()` (:785) and Shadow Bolt on `!talents.drain_soul.ok()` (:829):
 * each is background with that talent taken, applicable with it proven not taken, and UNKNOWN otherwise.
 *
 * A READY() REFUSAL IS NOT APPLICABILITY. An action built on a literal spell whose `ready()` asks for a talent stays
 * applicable here, and that readiness is a usability claim this slice does not make. A talent proven not taken by the
 * resolved hero tree is background too. An UNKNOWN build fact never excludes anything.
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
import { afflictionTokenBinding } from "../../../data/game/warlock-affliction-gcd-semantics.js";
import { afflictionNonDomainApplicabilityFor } from "./domain-boundary.js";
import { hasExecuted, type ExecutedEntry, type AfflictionFirstGcdState } from "./first-gcd-state.js";

/** Token -> the pinned talent whose absence makes the action `not_found()`-background. */
/** Token -> the pinned talent whose PRESENCE makes the action `not_found()`-background. */
export const BUILT_WITHOUT_TALENT: Readonly<Record<string, string>> = Object.freeze({
  corruption: "wither",
  shadow_bolt: "drain_soul",
});

export const TALENT_BUILT_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  agony: "agony",
  dark_harvest: "dark_harvest",
  drain_soul: "drain_soul",
  haunt: "haunt",
  malefic_grasp: "malefic_grasp",
  malevolence: "malevolence",
  seed_of_corruption: "seed_of_corruption",
  summon_darkglare: "summon_darkglare",
  unstable_affliction: "unstable_affliction",
  wither: "wither",
});

/** The proven build facts the applicability rules read. Resolved once per actor. */
export interface AfflictionBuildFacts {
  /** Every modelled talent's three-way resolution, by SimulationCraft name. */
  readonly talents: Readonly<Record<string, TalentResolution>>;
  /** Talents proven not taken, by the three-way rule or by the resolved hero tree. */
  readonly talentsProvenAbsent: ReadonlySet<string>;
}

function background(pinnedBehaviour: string): ActionApplicability {
  return notApplicable("BACKGROUND_UNDER_PROVEN_BUILD", { itemId: null, slot: null, pinnedBehaviour });
}

/** Whether an APL entry is a selectable foreground action for this player. */
export function resolveAfflictionApplicability(
  facts: AfflictionBuildFacts,
  action: AplAction,
): ActionApplicability {
  const nonDomain = afflictionNonDomainApplicabilityFor(action);
  if (nonDomain !== null) return nonDomain;

  const excludedBy = BUILT_WITHOUT_TALENT[action.actionToken];
  if (excludedBy !== undefined) {
    if (facts.talents[excludedBy]?.selection === "SELECTED") {
      return background(
        `the action is built on not_found() with talent '${excludedBy}' taken; an action built on ` +
          "spell_data_t::not_found() is background (action.cpp:541-549)",
      );
    }
    if (facts.talentsProvenAbsent.has(excludedBy)) return applicable();
    return unknownApplicability(
      `the action is built only without talent '${excludedBy}', and the observed talent tree does not resolve it`,
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

export interface AfflictionUsabilityInput {
  readonly state: AfflictionFirstGcdState;
  readonly action: AplAction;
  readonly observedAbilityGameId: number;
}

export function resolveAfflictionUsability(input: AfflictionUsabilityInput): ActionUsabilityVerdict {
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
  const binding = afflictionTokenBinding(action.actionToken);
  const candidates =
    binding.kind === "KNOWN_ONE"
      ? [binding.abilityGameId]
      : binding.kind === "KNOWN_SET"
        ? binding.abilityGameIds
        : [];
  if (candidates.includes(observedAbilityGameId)) return { kind: "PROVEN_USABLE" };

  return unknownUsability();
}
