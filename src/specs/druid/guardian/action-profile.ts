/**
 * The Guardian Druid reading of applicability and usability (ONB-T2).
 *
 * APPLICABILITY, IN THE PINNED ORDER. The domain boundary first (`domain-boundary.ts`). Then the
 * constructor readings: an action built on `spell_data_t::not_found()` is background
 * (action.cpp:541-549), and an untaken talent yields exactly that.
 *
 *     bristling_fur, convoke_the_spirits, heart_of_the_wild, ironfur, lunar_beam, moonkin_form, rake, red_moon, rip, sundering_roar
 *                          built on the talent of the same name (sc_druid.cpp, each constructor)
 *     swipe_bear           built on the `swipe` talent, overridden by the bear form's row (:5900)
 *
 * TWO TOKENS READ TWO TALENTS, because `create_action` builds a different action by talent (:10162-10172, :10202-10204). `berserk` builds Incarnation or Berserk, and `maul` builds Raze or Maul.
 * Each is applicable with either taken, background with both proven not taken, and UNKNOWN otherwise.
 *
 * `barkskin`, `bear_form`, `cat_form`, `ferocious_bite`, `mangle`, `moonfire`, `shred` and `thrash` are built on class spells. `moonfire_t::ready()` refuses with Red Moon taken (:7919-7922), which is a usability claim this slice does not make, and the list's own gate reads that talent.
 * `auto_attack` has no spell: it is on the meta-action lane, off the GCD, and refuses with no contract. `wild_guardian` has no binding, because no retained cast names the id it logs, so its lane is a refusal.
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
import { guardianTokenBinding } from "../../../data/game/druid-guardian-gcd-semantics.js";
import { guardianNonDomainApplicabilityFor } from "./domain-boundary.js";
import { hasExecuted, type ExecutedEntry, type GuardianFirstGcdState } from "./first-gcd-state.js";

/** Token -> the two pinned talents whose actions `create_action` builds it as. Taking either builds an action. */
export const TWO_TALENT_TOKENS: Readonly<Record<string, readonly [string, string]>> = Object.freeze({
  berserk: ["incarnation_bear", "berserk_bear"],
  maul: ["raze", "maul"],
});

/** Token -> the pinned talent whose absence makes the action `not_found()`-background. */
export const TALENT_BUILT_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  bristling_fur: "bristling_fur",
  convoke_the_spirits: "convoke_the_spirits",
  heart_of_the_wild: "heart_of_the_wild",
  ironfur: "ironfur",
  lunar_beam: "lunar_beam",
  moonkin_form: "moonkin_form",
  rake: "rake",
  red_moon: "red_moon",
  rip: "rip",
  sundering_roar: "sundering_roar",
  swipe_bear: "swipe",
});

/** The proven build facts the applicability rules read. Resolved once per actor. */
export interface GuardianBuildFacts {
  /** Every modelled talent's three-way resolution, by SimulationCraft name. */
  readonly talents: Readonly<Record<string, TalentResolution>>;
  /** Talents proven not taken, by the three-way rule or by the resolved hero tree. */
  readonly talentsProvenAbsent: ReadonlySet<string>;
}

function background(pinnedBehaviour: string): ActionApplicability {
  return notApplicable("BACKGROUND_UNDER_PROVEN_BUILD", { itemId: null, slot: null, pinnedBehaviour });
}

/** Whether an APL entry is a selectable foreground action for this player. */
export function resolveGuardianApplicability(
  facts: GuardianBuildFacts,
  action: AplAction,
): ActionApplicability {
  const nonDomain = guardianNonDomainApplicabilityFor(action);
  if (nonDomain !== null) return nonDomain;

  const pair = TWO_TALENT_TOKENS[action.actionToken];
  if (pair !== undefined) {
    if (pair.some((talent) => facts.talents[talent]?.selection === "SELECTED")) return applicable();
    if (pair.every((talent) => facts.talentsProvenAbsent.has(talent))) {
      return background(
        `the action is built on talent '${pair[0]}' or '${pair[1]}', both proven not taken; an action built on ` +
          "spell_data_t::not_found() is background (action.cpp:541-549)",
      );
    }
    return unknownApplicability(
      `the action is built on talent '${pair[0]}' or '${pair[1]}', and the observed talent tree does not resolve either`,
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

export interface GuardianUsabilityInput {
  readonly state: GuardianFirstGcdState;
  readonly action: AplAction;
  readonly observedAbilityGameId: number;
}

export function resolveGuardianUsability(input: GuardianUsabilityInput): ActionUsabilityVerdict {
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
  const binding = guardianTokenBinding(action.actionToken);
  const candidates =
    binding.kind === "KNOWN_ONE"
      ? [binding.abilityGameId]
      : binding.kind === "KNOWN_SET"
        ? binding.abilityGameIds
        : [];
  if (candidates.includes(observedAbilityGameId)) return { kind: "PROVEN_USABLE" };

  return unknownUsability();
}
