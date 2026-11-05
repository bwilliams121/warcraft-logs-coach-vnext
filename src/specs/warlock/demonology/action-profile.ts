/**
 * The Demonology Warlock reading of applicability and usability (ONB-X4).
 *
 * APPLICABILITY, IN THE PINNED ORDER. The domain boundary first (`domain-boundary.ts`). Then the
 * constructor readings: an action built on `spell_data_t::not_found()` is background
 * (action.cpp:541-549), and an untaken talent yields exactly that.
 *
 *     call_dreadstalkers, grimoire_fel_ravager, grimoire_imp_lord, implosion, power_siphon, summon_demonic_tyrant, summon_doomguard
 *                          built on the specialization talent of the same name (sc_warlock_actions.cpp, each constructor)
 *     hand_of_guldan       built on talents.hand_of_guldan_cast, the lookup of the talent of that name (sc_warlock_init.cpp:246)
 *     demonbolt            built on Demoniac (:2912 of the actions file)
 *     ruination            built on hero.ruination_cast, the lookup of the hero talent Ruination (sc_warlock_init.cpp:578)
 *     infernal_bolt        built on hero.infernal_bolt, the lookup of the hero talent Secrets of the Coven (sc_warlock_init.cpp:561)
 *
 * SHADOW BOLT IS APPLICABLE ON EVERY BUILD. Its constructor asks for Drain Soul's absence (:829), but Drain Soul is an Affliction talent, in no Demonology tree, so the guard cannot fire here.
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
import { demonologyTokenBinding } from "../../../data/game/warlock-demonology-gcd-semantics.js";
import { demonologyNonDomainApplicabilityFor } from "./domain-boundary.js";
import { hasExecuted, type ExecutedEntry, type DemonologyFirstGcdState } from "./first-gcd-state.js";

/** Token -> the pinned talent whose absence makes the action `not_found()`-background. */
export const TALENT_BUILT_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  call_dreadstalkers: "call_dreadstalkers",
  demonbolt: "demoniac",
  grimoire_fel_ravager: "grimoire_fel_ravager",
  grimoire_imp_lord: "grimoire_imp_lord",
  hand_of_guldan: "hand_of_guldan",
  implosion: "implosion",
  infernal_bolt: "secrets_of_the_coven",
  power_siphon: "power_siphon",
  ruination: "ruination",
  summon_demonic_tyrant: "summon_demonic_tyrant",
  summon_doomguard: "summon_doomguard",
});

/** The proven build facts the applicability rules read. Resolved once per actor. */
export interface DemonologyBuildFacts {
  /** Every modelled talent's three-way resolution, by SimulationCraft name. */
  readonly talents: Readonly<Record<string, TalentResolution>>;
  /** Talents proven not taken, by the three-way rule or by the resolved hero tree. */
  readonly talentsProvenAbsent: ReadonlySet<string>;
}

function background(pinnedBehaviour: string): ActionApplicability {
  return notApplicable("BACKGROUND_UNDER_PROVEN_BUILD", { itemId: null, slot: null, pinnedBehaviour });
}

/** Whether an APL entry is a selectable foreground action for this player. */
export function resolveDemonologyApplicability(
  facts: DemonologyBuildFacts,
  action: AplAction,
): ActionApplicability {
  const nonDomain = demonologyNonDomainApplicabilityFor(action);
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

export interface DemonologyUsabilityInput {
  readonly state: DemonologyFirstGcdState;
  readonly action: AplAction;
  readonly observedAbilityGameId: number;
}

export function resolveDemonologyUsability(input: DemonologyUsabilityInput): ActionUsabilityVerdict {
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
  const binding = demonologyTokenBinding(action.actionToken);
  const candidates =
    binding.kind === "KNOWN_ONE"
      ? [binding.abilityGameId]
      : binding.kind === "KNOWN_SET"
        ? binding.abilityGameIds
        : [];
  if (candidates.includes(observedAbilityGameId)) return { kind: "PROVEN_USABLE" };

  return unknownUsability();
}
