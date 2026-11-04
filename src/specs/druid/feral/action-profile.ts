/**
 * The Feral Druid reading of applicability and usability (ONB-C1).
 *
 * APPLICABILITY, IN THE PINNED ORDER. The domain boundary first (`domain-boundary.ts`). Then the
 * constructor readings: an action built on `spell_data_t::not_found()` is background
 * (action.cpp:541-549), and an untaken talent yields exactly that.
 *
 *     tigers_fury          sc_druid.cpp:4857, :10475
 *     rake                 sc_druid.cpp:4551, :10358
 *     rip                  sc_druid.cpp:4656, :10361
 *     swipe_cat            sc_druid.cpp:4839, :10369
 *     chomp                sc_druid.cpp:4050, :10445
 *     moonfire_cat         sc_druid.cpp:4461-4462, :10458
 *     primal_wrath         sc_druid.cpp:4743, :10464
 *     feral_frenzy         sc_druid.cpp:4134, :10450
 *     frantic_frenzy       sc_druid.cpp:4084, :10452
 *     convoke_the_spirits  sc_druid.cpp:9256, :10383
 *
 * Baseline spells have no guard. A talent proven not taken by the resolved hero tree is
 * background too. An UNKNOWN build fact never excludes anything.
 *
 * BERSERK IS TWO ACTIONS ON ONE TOKEN. It builds Incarnation when that talent is taken
 * (sc_druid.cpp:10162-10163), and Berserk otherwise (:10168-10172, :3937-3938), so it is background only
 * when both are proven absent.
 *
 * USABILITY: FOUR PROOFS, AND NOTHING IN BETWEEN
 *
 *     SIMULATED_PREFIX_EXECUTION          this branch already fired the entry
 *     RESTEALTH_NOT_PERMITTED_IN_COMBAT   Prowl's own guard, from `combat-engagement.ts`
 *     INSUFFICIENT_RESOURCE               `max_energy=1`, from `pooling-model.ts`
 *     PROVEN_USABLE                       the observed cast itself
 *
 * `max_energy=1` COMES BEFORE THE OBSERVED CAST, and that order is the point. A Ferocious Bite pressed below
 * the line's Energy proves the spell castable, not the LINE ready. Only the list's bare Bite lines take
 * the observed proof with nothing else asked.
 *
 * NOTHING ELSE. No cooldown is derived, so no ACTIVE_COOLDOWN is ever claimed, and no unobserved action is
 * ever proven usable.
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
import { feralDruidTokenBinding } from "../../../data/game/druid-feral-gcd-semantics.js";
import { feralDruidNonDomainApplicabilityFor } from "./domain-boundary.js";
import { hasExecuted, type ExecutedEntry, type FeralDruidFirstGcdState } from "./first-gcd-state.js";
import type { ProwlReadiness } from "./combat-engagement.js";
import { asksMaxEnergy, maxEnergyReadiness, type MaxEnergyFacts } from "./pooling-model.js";

/** Token -> the pinned talent whose absence makes the action `not_found()`-background. */
export const TALENT_BUILT_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  tigers_fury: "tigers_fury",
  rake: "rake",
  rip: "rip",
  swipe_cat: "swipe",
  chomp: "chomp",
  moonfire_cat: "lunar_inspiration",
  primal_wrath: "primal_wrath",
  feral_frenzy: "feral_frenzy",
  frantic_frenzy: "frantic_frenzy",
  convoke_the_spirits: "convoke_the_spirits",
});

/** The proven build facts the applicability rules read. Resolved once per actor. */
export interface FeralDruidBuildFacts {
  /** Every modelled talent's three-way resolution, by SimulationCraft name. */
  readonly talents: Readonly<Record<string, TalentResolution>>;
  /** Talents proven not taken, by the three-way rule or by the resolved hero tree. */
  readonly talentsProvenAbsent: ReadonlySet<string>;
}

function background(pinnedBehaviour: string): ActionApplicability {
  return notApplicable("BACKGROUND_UNDER_PROVEN_BUILD", { itemId: null, slot: null, pinnedBehaviour });
}

/** Whether an APL entry is a selectable foreground action for this player. */
export function resolveFeralDruidApplicability(
  facts: FeralDruidBuildFacts,
  action: AplAction,
): ActionApplicability {
  const nonDomain = feralDruidNonDomainApplicabilityFor(action);
  if (nonDomain !== null) return nonDomain;

  if (action.actionToken === "berserk") {
    const taken = ["incarnation_cat", "berserk_cat"];
    if (taken.some((name) => facts.talents[name]?.selection === "SELECTED")) return applicable();
    if (taken.every((name) => facts.talentsProvenAbsent.has(name))) {
      return background(
        "the token builds Incarnation or Berserk, and both talents are proven not taken; an action built on " +
          "spell_data_t::not_found() is background (action.cpp:541-549)",
      );
    }
    return unknownApplicability(
      "the token builds Incarnation or Berserk, and the observed talent tree resolves neither",
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

export interface FeralDruidUsabilityInput {
  readonly state: FeralDruidFirstGcdState;
  readonly action: AplAction;
  readonly observedAbilityGameId: number;
  /** Prowl's readiness at the real decision. */
  readonly prowl: ProwlReadiness;
  /** What `maximum_energy()` reads at the real decision. */
  readonly maxEnergy: MaxEnergyFacts;
}

export function resolveFeralDruidUsability(input: FeralDruidUsabilityInput): ActionUsabilityVerdict {
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

  // PROWL'S OWN GUARD. It says the line cannot fire, and it is about this one spell.
  if (action.actionToken === "prowl" && input.prowl.state === "NOT_READY") {
    return provenUnusable("RESTEALTH_NOT_PERMITTED_IN_COMBAT", {
      abilityGameId: 5215,
      itemId: null,
      provenRemainingAtLeastMs: null,
      cooldownToleranceMs: null,
      detail: `prowl_t::ready (sc_druid.cpp:7990-7996) is false: ${input.prowl.basis}`,
    });
  }

  // THE LINE'S ENERGY, before the observed cast: see the header.
  if (asksMaxEnergy(action)) {
    const readiness = maxEnergyReadiness(input.maxEnergy);
    if (readiness === "NOT_MET") {
      return provenUnusable("INSUFFICIENT_RESOURCE", {
        abilityGameId: null,
        itemId: null,
        provenRemainingAtLeastMs: null,
        cooldownToleranceMs: null,
        detail:
          "ferocious_bite_base_t::ready (sc_druid.cpp:4267-4273) is false: the decision cast's own Energy is below " +
          "maximum_energy() in every state the evidence leaves",
      });
    }
    if (readiness === "NOT_ESTABLISHED") return unknownUsability();
  }

  // OBSERVED LAST. The cast that demonstrably fired demonstrably was usable.
  const binding = feralDruidTokenBinding(action.actionToken);
  const candidates =
    binding.kind === "KNOWN_ONE"
      ? [binding.abilityGameId]
      : binding.kind === "KNOWN_SET"
        ? binding.abilityGameIds
        : [];
  if (candidates.includes(observedAbilityGameId)) return { kind: "PROVEN_USABLE" };

  return unknownUsability();
}
