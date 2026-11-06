/**
 * The Beast Mastery Hunter reading of applicability and usability (ONB-T2).
 *
 * APPLICABILITY, IN THE PINNED ORDER. The domain boundary first (`domain-boundary.ts`). Then the
 * constructor readings: an action built on `spell_data_t::not_found()` is background
 * (action.cpp:541-549), and an untaken talent yields exactly that.
 *
 *     barbed_shot, bestial_wrath, black_arrow, cobra_shot, kill_command, wild_thrash
 *                          built on the talent of the same name (sc_hunter.cpp, each constructor)
 *     wailing_arrow        built on `talents.wailing_arrow`, which is `find_spell( 392060 )` only with Wailing Dead (:7925)
 *
 * A PET'S READINESS IS NOT APPLICABILITY. `kill_command_t::ready()` also asks the main pet's own action (:6773-6778). A press proves that, and no unobserved one is claimed either way.
 *
 * `auto_shot` has no spell: `auto_attack_t` is on the meta-action lane, off the GCD, and refuses with no contract. Dire Beast has no token on this list.
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
import { beastMasteryTokenBinding } from "../../../data/game/hunter-beast_mastery-gcd-semantics.js";
import { beastMasteryNonDomainApplicabilityFor } from "./domain-boundary.js";
import { hasExecuted, type ExecutedEntry, type BeastMasteryFirstGcdState } from "./first-gcd-state.js";

/** Token -> the pinned talent whose absence makes the action `not_found()`-background. */
export const TALENT_BUILT_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  barbed_shot: "barbed_shot",
  bestial_wrath: "bestial_wrath",
  black_arrow: "black_arrow",
  cobra_shot: "cobra_shot",
  kill_command: "kill_command",
  wailing_arrow: "wailing_dead",
  wild_thrash: "wild_thrash",
});

/** The proven build facts the applicability rules read. Resolved once per actor. */
export interface BeastMasteryBuildFacts {
  /** Every modelled talent's three-way resolution, by SimulationCraft name. */
  readonly talents: Readonly<Record<string, TalentResolution>>;
  /** Talents proven not taken, by the three-way rule or by the resolved hero tree. */
  readonly talentsProvenAbsent: ReadonlySet<string>;
}

function background(pinnedBehaviour: string): ActionApplicability {
  return notApplicable("BACKGROUND_UNDER_PROVEN_BUILD", { itemId: null, slot: null, pinnedBehaviour });
}

/** Whether an APL entry is a selectable foreground action for this player. */
export function resolveBeastMasteryApplicability(
  facts: BeastMasteryBuildFacts,
  action: AplAction,
): ActionApplicability {
  const nonDomain = beastMasteryNonDomainApplicabilityFor(action);
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

export interface BeastMasteryUsabilityInput {
  readonly state: BeastMasteryFirstGcdState;
  readonly action: AplAction;
  readonly observedAbilityGameId: number;
}

export function resolveBeastMasteryUsability(input: BeastMasteryUsabilityInput): ActionUsabilityVerdict {
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
  const binding = beastMasteryTokenBinding(action.actionToken);
  const candidates =
    binding.kind === "KNOWN_ONE"
      ? [binding.abilityGameId]
      : binding.kind === "KNOWN_SET"
        ? binding.abilityGameIds
        : [];
  if (candidates.includes(observedAbilityGameId)) return { kind: "PROVEN_USABLE" };

  return unknownUsability();
}
