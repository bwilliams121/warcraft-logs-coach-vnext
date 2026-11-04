/**
 * The Devourer Demon Hunter reading of applicability and usability (ONB-B3).
 *
 * APPLICABILITY, IN THE PINNED ORDER. The domain boundary first (`domain-boundary.ts`). Then the
 * constructor readings: an action built on `spell_data_t::not_found()` is background
 * (action.cpp:541-549), and an untaken talent yields exactly that.
 *
 *     the_hunt             sc_demon_hunter.cpp:5612, :11285
 *     void_ray             sc_demon_hunter.cpp:6373
 *     soul_immolation      sc_demon_hunter.cpp:5951
 *     voidblade            sc_demon_hunter.cpp:5913
 *     vengeful_retreat     sc_demon_hunter.cpp:8588-8589
 *     hungering_slash      sc_demon_hunter.cpp:6808, :11216
 *     eradicate            sc_demon_hunter.cpp:6143, :11196
 *     collapsing_star      sc_demon_hunter.cpp:6548, :11208-11209
 *     reapers_toll         sc_demon_hunter.cpp:6783, :11385
 *     pierce_the_veil      sc_demon_hunter.cpp:5895, :11384
 *     predators_wake       sc_demon_hunter.cpp:5594, :11380-11383
 *
 * Baseline spells have no guard. A talent proven not taken by the resolved hero tree is
 * background too. An UNKNOWN build fact never excludes anything.
 *
 * COLLAPSING STAR IS NOT CLOSED BY ITS TALENT ALONE. `spec.collapsing_star_spell` opens on `talent.devourer.collapsing_star`
 * or on the tiered `talent.devourer.midnight3` (sc_demon_hunter.cpp:11208-11209), and the Midnight node is not modelled, so an
 * absent Collapsing Star never closes the line: the shared rule leaves it UNKNOWN, because the lone node is never proven absent.
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
import { devourerDemonHunterTokenBinding } from "../../../data/game/demonhunter-devourer-gcd-semantics.js";
import { devourerDemonHunterNonDomainApplicabilityFor } from "./domain-boundary.js";
import { hasExecuted, type ExecutedEntry, type DevourerDemonHunterFirstGcdState } from "./first-gcd-state.js";

/** Token -> the pinned talent whose absence makes the action `not_found()`-background. */
export const TALENT_BUILT_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  the_hunt: "the_hunt",
  void_ray: "void_ray",
  soul_immolation: "soul_immolation",
  voidblade: "voidblade",
  vengeful_retreat: "vengeful_retreat",
  hungering_slash: "hungering_slash",
  eradicate: "eradicate",
  collapsing_star: "collapsing_star",
  reapers_toll: "voidsurge",
  pierce_the_veil: "voidsurge",
  predators_wake: "demonic_intensity",
});

/** The proven build facts the applicability rules read. Resolved once per actor. */
export interface DevourerDemonHunterBuildFacts {
  /** Every modelled talent's three-way resolution, by SimulationCraft name. */
  readonly talents: Readonly<Record<string, TalentResolution>>;
  /** Talents proven not taken, by the three-way rule or by the resolved hero tree. */
  readonly talentsProvenAbsent: ReadonlySet<string>;
}

function background(pinnedBehaviour: string): ActionApplicability {
  return notApplicable("BACKGROUND_UNDER_PROVEN_BUILD", { itemId: null, slot: null, pinnedBehaviour });
}

/** Whether an APL entry is a selectable foreground action for this player. */
export function resolveDevourerDemonHunterApplicability(
  facts: DevourerDemonHunterBuildFacts,
  action: AplAction,
): ActionApplicability {
  const nonDomain = devourerDemonHunterNonDomainApplicabilityFor(action);
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

export interface DevourerDemonHunterUsabilityInput {
  readonly state: DevourerDemonHunterFirstGcdState;
  readonly action: AplAction;
  readonly observedAbilityGameId: number;
}

export function resolveDevourerDemonHunterUsability(
  input: DevourerDemonHunterUsabilityInput,
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
  const binding = devourerDemonHunterTokenBinding(action.actionToken);
  const candidates =
    binding.kind === "KNOWN_ONE"
      ? [binding.abilityGameId]
      : binding.kind === "KNOWN_SET"
        ? binding.abilityGameIds
        : [];
  if (candidates.includes(observedAbilityGameId)) return { kind: "PROVEN_USABLE" };

  return unknownUsability();
}
