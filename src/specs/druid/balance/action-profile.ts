/**
 * The Balance Druid reading of applicability and usability (ONB-D2).
 *
 * APPLICABILITY, IN THE PINNED ORDER. The domain boundary first (`domain-boundary.ts`). Then the
 * constructor readings: an action built on `spell_data_t::not_found()` is background
 * (action.cpp:541-549), and an untaken talent yields exactly that.
 *
 *     starfire, starsurge, sunfire, convoke_the_spirits, force_of_nature, fury_of_elune, new_moon, wild_mushroom
 *                          built on the talent of the same name (sc_druid.cpp, each constructor)
 *     half_moon, full_moon  built on check( talent.new_moon, ... ) (sc_druid.cpp:10695-10696)
 *
 * CELESTIAL ALIGNMENT IS EITHER TALENT. The token builds Incarnation when that talent is taken, and Celestial Alignment otherwise (sc_druid.cpp:
 * 10160, 10167), so it is applicable when either is taken, background only when both are proven absent.
 *
 * Wrath, Moonfire, Starfall and Eclipse have no talent guard.
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
import { balanceTokenBinding } from "../../../data/game/druid-balance-gcd-semantics.js";
import { balanceNonDomainApplicabilityFor } from "./domain-boundary.js";
import { hasExecuted, type ExecutedEntry, type BalanceFirstGcdState } from "./first-gcd-state.js";

/** Token -> the pinned talent whose absence makes the action `not_found()`-background. */
export const TALENT_BUILT_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  starfire: "starfire",
  starsurge: "starsurge",
  sunfire: "sunfire",
  convoke_the_spirits: "convoke_the_spirits",
  force_of_nature: "force_of_nature",
  fury_of_elune: "fury_of_elune",
  new_moon: "new_moon",
  half_moon: "new_moon",
  full_moon: "new_moon",
  wild_mushroom: "wild_mushroom",
});

/** The proven build facts the applicability rules read. Resolved once per actor. */
export interface BalanceBuildFacts {
  /** Every modelled talent's three-way resolution, by SimulationCraft name. */
  readonly talents: Readonly<Record<string, TalentResolution>>;
  /** Talents proven not taken, by the three-way rule or by the resolved hero tree. */
  readonly talentsProvenAbsent: ReadonlySet<string>;
}

function background(pinnedBehaviour: string): ActionApplicability {
  return notApplicable("BACKGROUND_UNDER_PROVEN_BUILD", { itemId: null, slot: null, pinnedBehaviour });
}

/** Whether an APL entry is a selectable foreground action for this player. */
export function resolveBalanceApplicability(
  facts: BalanceBuildFacts,
  action: AplAction,
): ActionApplicability {
  const nonDomain = balanceNonDomainApplicabilityFor(action);
  if (nonDomain !== null) return nonDomain;

  if (action.actionToken === "celestial_alignment") {
    const either = ["celestial_alignment", "incarnation_chosen_of_elune"];
    if (either.some((name) => facts.talents[name]?.selection === "SELECTED")) return applicable();
    if (either.every((name) => facts.talentsProvenAbsent.has(name))) {
      return background(
        "the token builds Incarnation or Celestial Alignment, and both talents are proven not taken; an action built on " +
          "spell_data_t::not_found() is background (action.cpp:541-549)",
      );
    }
    return unknownApplicability(
      "the token builds Incarnation or Celestial Alignment, and the observed talent tree resolves neither",
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

export interface BalanceUsabilityInput {
  readonly state: BalanceFirstGcdState;
  readonly action: AplAction;
  readonly observedAbilityGameId: number;
}

export function resolveBalanceUsability(input: BalanceUsabilityInput): ActionUsabilityVerdict {
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
  const binding = balanceTokenBinding(action.actionToken);
  const candidates =
    binding.kind === "KNOWN_ONE"
      ? [binding.abilityGameId]
      : binding.kind === "KNOWN_SET"
        ? binding.abilityGameIds
        : [];
  if (candidates.includes(observedAbilityGameId)) return { kind: "PROVEN_USABLE" };

  return unknownUsability();
}
