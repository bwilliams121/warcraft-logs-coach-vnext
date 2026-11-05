/**
 * The Marksmanship Hunter reading of applicability and usability (ONB-D4).
 *
 * APPLICABILITY, IN THE PINNED ORDER. The domain boundary first (`domain-boundary.ts`). Then the
 * constructor readings: an action built on `spell_data_t::not_found()` is background
 * (action.cpp:541-549), and an untaken talent yields exactly that.
 *
 *     aimed_shot, explosive_shot, moonlight_chakram, rapid_fire, trueshot, volley, black_arrow
 *                          built on the talent of the same name (sc_hunter.cpp, each constructor)
 *     wailing_arrow        built on `talents.wailing_arrow`, which is `find_spell( 392060 )` only with Wailing Dead (:7925)
 *
 * KILL SHOT READS TWO TALENTS. It is built on its own talent, and it is background with Black Arrow taken (:4357): applicable only with its own talent taken and Black Arrow proven not taken.
 *
 * Arcane Shot, Multi-Shot and Steady Shot are built on class or specialization spells. The talents that would change Arcane Shot and Steady Shot, Cobra Shot and Pack Tactics, are Beast Mastery's.
 * `auto_shot` has no spell: `auto_attack_t` is on the meta-action lane, off the GCD, and refuses with no contract.
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
import { marksmanshipTokenBinding } from "../../../data/game/hunter-marksmanship-gcd-semantics.js";
import { marksmanshipNonDomainApplicabilityFor } from "./domain-boundary.js";
import { hasExecuted, type ExecutedEntry, type MarksmanshipFirstGcdState } from "./first-gcd-state.js";

/** Token -> the pinned talent whose absence makes the action `not_found()`-background. */
export const TALENT_BUILT_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  aimed_shot: "aimed_shot",
  black_arrow: "black_arrow",
  explosive_shot: "explosive_shot",
  moonlight_chakram: "moonlight_chakram",
  rapid_fire: "rapid_fire",
  trueshot: "trueshot",
  volley: "volley",
  wailing_arrow: "wailing_dead",
});

/** The proven build facts the applicability rules read. Resolved once per actor. */
export interface MarksmanshipBuildFacts {
  /** Every modelled talent's three-way resolution, by SimulationCraft name. */
  readonly talents: Readonly<Record<string, TalentResolution>>;
  /** Talents proven not taken, by the three-way rule or by the resolved hero tree. */
  readonly talentsProvenAbsent: ReadonlySet<string>;
}

function background(pinnedBehaviour: string): ActionApplicability {
  return notApplicable("BACKGROUND_UNDER_PROVEN_BUILD", { itemId: null, slot: null, pinnedBehaviour });
}

/** Whether an APL entry is a selectable foreground action for this player. */
export function resolveMarksmanshipApplicability(
  facts: MarksmanshipBuildFacts,
  action: AplAction,
): ActionApplicability {
  const nonDomain = marksmanshipNonDomainApplicabilityFor(action);
  if (nonDomain !== null) return nonDomain;

  if (action.actionToken === "kill_shot") {
    if (facts.talents["black_arrow"]?.selection === "SELECTED") {
      return background(
        "Kill Shot is background with talent 'black_arrow' taken (sc_hunter.cpp:4357), so it is not a foreground action",
      );
    }
    if (facts.talentsProvenAbsent.has("kill_shot")) {
      return background(
        "the action is built on talent 'kill_shot', which is proven not taken; an action built on " +
          "spell_data_t::not_found() is background (action.cpp:541-549)",
      );
    }
    if (
      facts.talents["kill_shot"]?.selection === "SELECTED" &&
      facts.talentsProvenAbsent.has("black_arrow")
    ) {
      return applicable();
    }
    return unknownApplicability(
      "Kill Shot needs talent 'kill_shot' taken and talent 'black_arrow' proven not taken, and the observed talent tree does not resolve both",
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

export interface MarksmanshipUsabilityInput {
  readonly state: MarksmanshipFirstGcdState;
  readonly action: AplAction;
  readonly observedAbilityGameId: number;
}

export function resolveMarksmanshipUsability(input: MarksmanshipUsabilityInput): ActionUsabilityVerdict {
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
  const binding = marksmanshipTokenBinding(action.actionToken);
  const candidates =
    binding.kind === "KNOWN_ONE"
      ? [binding.abilityGameId]
      : binding.kind === "KNOWN_SET"
        ? binding.abilityGameIds
        : [];
  if (candidates.includes(observedAbilityGameId)) return { kind: "PROVEN_USABLE" };

  return unknownUsability();
}
