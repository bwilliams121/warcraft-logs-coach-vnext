/**
 * The Frost Death Knight reading of applicability and usability (ONB-B2).
 *
 * APPLICABILITY, IN THE PINNED ORDER. The domain boundary first (`domain-boundary.ts`). Then the
 * constructor readings: an action built on `spell_data_t::not_found()` is background
 * (action.cpp:541-549), and an untaken talent yields exactly that.
 *
 *     obliterate           sc_death_knight.cpp:11855-11856
 *     howling_blast        sc_death_knight.cpp:11460-11461
 *     frost_strike         sc_death_knight.cpp:10933-10934
 *     frostscythe          sc_death_knight.cpp:10535-10536
 *     pillar_of_frost      sc_death_knight.cpp:12008-12009
 *     breath_of_sindragosa sc_death_knight.cpp:9235-9236
 *     reapers_mark         sc_death_knight.cpp:8490-8491
 *     frostwyrms_fury      sc_death_knight.cpp:10697-10698
 *     empower_rune_weapon  sc_death_knight.cpp:10148-10149
 *     raise_dead           sc_death_knight.cpp:12218-12220
 *
 * Baseline spells have no guard. A talent proven not taken by the resolved hero tree is
 * background too. An UNKNOWN build fact never excludes anything.
 *
 * ONE TOKEN IS NEVER BUILT. `mind_freeze_t` asks `find_class_spell( "Mind Freeze" )` (sc_death_knight.cpp:11728-11729) and
 * the pinned class table has no such row, so the action is on `not_found()` for every build, and its
 * list line cannot be selected at this pin.
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
import { frostDeathKnightTokenBinding } from "../../../data/game/deathknight-frost-gcd-semantics.js";
import { frostDeathKnightNonDomainApplicabilityFor } from "./domain-boundary.js";
import { hasExecuted, type ExecutedEntry, type FrostDeathKnightFirstGcdState } from "./first-gcd-state.js";

/** Token -> the pinned talent whose absence makes the action `not_found()`-background. */
export const TALENT_BUILT_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  obliterate: "obliterate",
  howling_blast: "howling_blast",
  frost_strike: "frost_strike",
  frostscythe: "frostscythe",
  pillar_of_frost: "pillar_of_frost",
  breath_of_sindragosa: "breath_of_sindragosa",
  reapers_mark: "reapers_mark",
  frostwyrms_fury: "frostwyrms_fury",
  empower_rune_weapon: "empower_rune_weapon",
  raise_dead: "raise_dead",
});

const NEVER_BUILT_TOKENS: ReadonlySet<string> = new Set(["mind_freeze"]);

/** The proven build facts the applicability rules read. Resolved once per actor. */
export interface FrostDeathKnightBuildFacts {
  /** Every modelled talent's three-way resolution, by SimulationCraft name. */
  readonly talents: Readonly<Record<string, TalentResolution>>;
  /** Talents proven not taken, by the three-way rule or by the resolved hero tree. */
  readonly talentsProvenAbsent: ReadonlySet<string>;
}

function background(pinnedBehaviour: string): ActionApplicability {
  return notApplicable("BACKGROUND_UNDER_PROVEN_BUILD", { itemId: null, slot: null, pinnedBehaviour });
}

/** Whether an APL entry is a selectable foreground action for this player. */
export function resolveFrostDeathKnightApplicability(
  facts: FrostDeathKnightBuildFacts,
  action: AplAction,
): ActionApplicability {
  const nonDomain = frostDeathKnightNonDomainApplicabilityFor(action);
  if (nonDomain !== null) return nonDomain;
  if (NEVER_BUILT_TOKENS.has(action.actionToken)) {
    return background(
      `the action is built on find_class_spell, and the pinned class table has no row for '${action.actionToken}'; an action built on ` +
        "spell_data_t::not_found() is background (action.cpp:541-549)",
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

export interface FrostDeathKnightUsabilityInput {
  readonly state: FrostDeathKnightFirstGcdState;
  readonly action: AplAction;
  readonly observedAbilityGameId: number;
}

export function resolveFrostDeathKnightUsability(
  input: FrostDeathKnightUsabilityInput,
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
  const binding = frostDeathKnightTokenBinding(action.actionToken);
  const candidates =
    binding.kind === "KNOWN_ONE"
      ? [binding.abilityGameId]
      : binding.kind === "KNOWN_SET"
        ? binding.abilityGameIds
        : [];
  if (candidates.includes(observedAbilityGameId)) return { kind: "PROVEN_USABLE" };

  return unknownUsability();
}
