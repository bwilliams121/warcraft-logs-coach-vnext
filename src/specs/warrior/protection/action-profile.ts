/**
 * The Protection Warrior reading of applicability and usability (ONB-A2).
 *
 * APPLICABILITY, IN THE PINNED ORDER. The domain boundary first (`domain-boundary.ts`). Then the
 * constructor readings: an action built on `spell_data_t::not_found()` is background
 * (action.cpp:541-549), and an untaken talent yields exactly that.
 *
 *     avatar               sc_warrior.cpp:7304, :7928
 *     shield_wall          sc_warrior.cpp:7215-7216
 *     ignore_pain          sc_warrior.cpp:2475-2476, :7935
 *     ravager              sc_warrior.cpp:5867-5868, :7931
 *     demoralizing_shout   sc_warrior.cpp:3909-3910
 *     champions_spear      sc_warrior.cpp:6846-6847
 *     demolish             sc_warrior.cpp:3857-3858
 *     shield_charge        sc_warrior.cpp:6153-6154
 *     thunder_clap         sc_warrior.cpp:4085-4086
 *     revenge              sc_warrior.cpp:5996-5997
 *     wrecking_throw       sc_warrior.cpp:6783-6784
 *     shattering_throw     sc_warrior.cpp:5263-5264
 *
 * Baseline spells have no guard. A talent proven not taken by the resolved hero tree is
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
import { protectionWarriorTokenBinding } from "../../../data/game/warrior-protection-gcd-semantics.js";
import { protectionWarriorNonDomainApplicabilityFor } from "./domain-boundary.js";
import { hasExecuted, type ExecutedEntry, type ProtectionWarriorFirstGcdState } from "./first-gcd-state.js";

/** Token -> the pinned talent whose absence makes the action `not_found()`-background. */
export const TALENT_BUILT_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  avatar: "avatar",
  shield_wall: "shield_wall",
  ignore_pain: "ignore_pain",
  ravager: "ravager",
  demoralizing_shout: "demoralizing_shout",
  champions_spear: "champions_spear",
  demolish: "demolish",
  shield_charge: "shield_charge",
  thunder_clap: "thunder_clap",
  revenge: "revenge",
  wrecking_throw: "wrecking_throw",
  shattering_throw: "shattering_throw",
});

/** The proven build facts the applicability rules read. Resolved once per actor. */
export interface ProtectionWarriorBuildFacts {
  /** Every modelled talent's three-way resolution, by SimulationCraft name. */
  readonly talents: Readonly<Record<string, TalentResolution>>;
  /** Talents proven not taken, by the three-way rule or by the resolved hero tree. */
  readonly talentsProvenAbsent: ReadonlySet<string>;
}

function background(pinnedBehaviour: string): ActionApplicability {
  return notApplicable("BACKGROUND_UNDER_PROVEN_BUILD", { itemId: null, slot: null, pinnedBehaviour });
}

/** Whether an APL entry is a selectable foreground action for this player. */
export function resolveProtectionWarriorApplicability(
  facts: ProtectionWarriorBuildFacts,
  action: AplAction,
): ActionApplicability {
  const nonDomain = protectionWarriorNonDomainApplicabilityFor(action);
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

export interface ProtectionWarriorUsabilityInput {
  readonly state: ProtectionWarriorFirstGcdState;
  readonly action: AplAction;
  readonly observedAbilityGameId: number;
}

export function resolveProtectionWarriorUsability(
  input: ProtectionWarriorUsabilityInput,
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
  const binding = protectionWarriorTokenBinding(action.actionToken);
  const candidates =
    binding.kind === "KNOWN_ONE"
      ? [binding.abilityGameId]
      : binding.kind === "KNOWN_SET"
        ? binding.abilityGameIds
        : [];
  if (candidates.includes(observedAbilityGameId)) return { kind: "PROVEN_USABLE" };

  return unknownUsability();
}
