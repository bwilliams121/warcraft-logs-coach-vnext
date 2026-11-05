/**
 * The Unholy Death Knight reading of applicability and usability (ONB-X5).
 *
 * APPLICABILITY, IN THE PINNED ORDER. The domain boundary first (`domain-boundary.ts`). Then the
 * constructor readings: an action built on `spell_data_t::not_found()` is background
 * (action.cpp:541-549), and an untaken talent yields exactly that.
 *
 *     army_of_the_dead     sc_death_knight.cpp:8818-8819
 *     dark_transformation  sc_death_knight.cpp:8699-8700
 *     outbreak             sc_death_knight.cpp:11984-11985
 *     putrefy              sc_death_knight.cpp:12168-12169
 *     scourge_strike       sc_death_knight.cpp:12630-12631
 *     soul_reaper          sc_death_knight.cpp:12658-12659
 *
 * Baseline spells have no guard: Death Coil, Death and Decay, Epidemic and Festering Strike are class or specialization rows. An UNKNOWN build fact never excludes anything.
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
import { unholyDeathKnightTokenBinding } from "../../../data/game/deathknight-unholy-gcd-semantics.js";
import { unholyDeathKnightNonDomainApplicabilityFor } from "./domain-boundary.js";
import { hasExecuted, type ExecutedEntry, type UnholyDeathKnightFirstGcdState } from "./first-gcd-state.js";

/** Token -> the pinned talent whose absence makes the action `not_found()`-background. */
export const TALENT_BUILT_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  army_of_the_dead: "army_of_the_dead",
  dark_transformation: "dark_transformation",
  outbreak: "outbreak",
  putrefy: "putrefy",
  scourge_strike: "scourge_strike",
  soul_reaper: "soul_reaper",
});

/** The proven build facts the applicability rules read. Resolved once per actor. */
export interface UnholyDeathKnightBuildFacts {
  /** Every modelled talent's three-way resolution, by SimulationCraft name. */
  readonly talents: Readonly<Record<string, TalentResolution>>;
  /** Talents proven not taken, by the three-way rule. */
  readonly talentsProvenAbsent: ReadonlySet<string>;
}

function background(pinnedBehaviour: string): ActionApplicability {
  return notApplicable("BACKGROUND_UNDER_PROVEN_BUILD", { itemId: null, slot: null, pinnedBehaviour });
}

/** Whether an APL entry is a selectable foreground action for this player. */
export function resolveUnholyDeathKnightApplicability(
  facts: UnholyDeathKnightBuildFacts,
  action: AplAction,
): ActionApplicability {
  const nonDomain = unholyDeathKnightNonDomainApplicabilityFor(action);
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

export interface UnholyDeathKnightUsabilityInput {
  readonly state: UnholyDeathKnightFirstGcdState;
  readonly action: AplAction;
  readonly observedAbilityGameId: number;
}

export function resolveUnholyDeathKnightUsability(
  input: UnholyDeathKnightUsabilityInput,
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
  const binding = unholyDeathKnightTokenBinding(action.actionToken);
  const candidates =
    binding.kind === "KNOWN_ONE"
      ? [binding.abilityGameId]
      : binding.kind === "KNOWN_SET"
        ? binding.abilityGameIds
        : [];
  if (candidates.includes(observedAbilityGameId)) return { kind: "PROVEN_USABLE" };

  return unknownUsability();
}
