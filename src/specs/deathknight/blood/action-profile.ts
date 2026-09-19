/**
 * The Blood Death Knight reading of applicability and usability (M11-B2).
 *
 * WHAT THIS COMPOSES
 *
 *     src/simc/action-applicability             the generic verdict vocabulary
 *     ./domain-boundary                         the class/spec authority boundary
 *     src/data/game/deathknight-blood-talents   the pinned build facts
 *     src/data/game/deathknight-blood-gcd-…     the pinned token identities
 *
 * APPLICABILITY, IN THE PINNED ORDER
 *
 * The domain boundary is decided FIRST: a racial, a potion, an item use is
 * `OUTSIDE_SUPPORTED_DECISION_DOMAIN` before any build fact is read
 * (`domain-boundary.ts`). Then the constructor readings, each a
 * `background = true` site of the pinned module by way of the shared rule:
 * `action_t::action_t` marks an action built on `spell_data_t::not_found()`
 * background (action.cpp:541-549), and an untaken talent yields exactly
 * that.
 *
 *     talent-built actions      death_strike (talent.death_strike, :10017),
 *                               raise_dead (talent.raise_dead for a Blood
 *                               actor, whose spec.raise_dead is not found,
 *                               :12216-12220), heart_strike (:11325),
 *                               marrowrend (:11662-11667), blood_boil
 *                               (:9029-9032), vampiric_blood (:12785-12788),
 *                               dancing_rune_weapon (:9476-9479),
 *                               consumption (:9445-9446), reapers_mark
 *                               (:8488-8491)
 *     hero-tree-owned actions   reapers_mark is a Deathbringer talent: a
 *                               build RESOLVED to the San'layn sub-tree
 *                               cannot hold it, so the action is background
 *                               even when the NORMAL node's absence leaves
 *                               the three-way talent rule UNKNOWN
 *     specialization spells     deaths_caress (spec.deaths_caress, :9756-9759),
 *                               death_and_decay and its `any_dnd` alias
 *                               (spec.death_and_decay, :9722-9725 and
 *                               :14424-14427), auto_attack: no guard,
 *                               applicable
 *
 * Everything else is APPLICABLE, the honest default, and an UNKNOWN build
 * fact never excludes anything. Consumption is the case to know: a NORMAL
 * specialization node ABSENT from the observed tree resolves UNKNOWN (never
 * NOT_SELECTED), so both `consumption` entries read UNKNOWN applicability
 * for a build that did not take it, and a scan that reaches one BLOCKS
 * there. That is measured, not solved, in M11-B2.
 *
 * NO FOREGROUND-BY-OBSERVED-EXECUTION FACTS. The M11-A4 Paladin slice needed
 * one for Avenging Wrath under Radiant Glory; no Blood entry has an open reading a
 * pinned foreground-only execution could settle, so none is written and no
 * "cast observed ⇒ selectable" rule exists here either.
 *
 * USABILITY: THE PROOFS, AND NOTHING IN BETWEEN
 *
 *     SIMULATED_PREFIX_EXECUTION   this branch already fired the entry (counterfactual, named so)
 *     PROVEN_USABLE                the observed cast itself
 *     ACTIVE_COOLDOWN              a derived cooldown proven past the tolerance
 *                                  (Dancing Rune Weapon only)
 *
 * NO RESOURCE PROOF IN EITHER DIRECTION. The wire's `cost` on a Death Strike
 * cast is the DBC base (450) while the deduction the build pays is 350
 * (`resources.ts`), and Rune regeneration is not on the wire at all. No
 * INSUFFICIENT_RESOURCE and no affordability-based PROVEN_USABLE is ever
 * claimed for any Blood entry; a spender's usability is UNKNOWN unless the
 * decision's own cast proves it.
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
import type { CooldownReadiness } from "../../../engine/game-state/cooldowns/cooldown-usability.js";
import type { HeroTreeResolution, TalentResolution } from "../../../data/game/talent-selection.js";
import { bloodTokenBinding } from "../../../data/game/deathknight-blood-gcd-semantics.js";
import { bloodNonDomainApplicabilityFor } from "./domain-boundary.js";
import { hasExecuted, type BloodFirstGcdState, type ExecutedEntry } from "./first-gcd-state.js";

/** Token → the pinned talent whose absence makes the action `not_found()`-background (action.cpp:541-549). */
export const TALENT_BUILT_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  death_strike: "death_strike",
  raise_dead: "raise_dead",
  heart_strike: "heart_strike",
  marrowrend: "marrowrend",
  blood_boil: "blood_boil",
  vampiric_blood: "vampiric_blood",
  dancing_rune_weapon: "dancing_rune_weapon",
  consumption: "consumption",
  reapers_mark: "reapers_mark",
});

/** Token → the hero sub-tree that OWNS the talent the action is built on. */
export const HERO_TREE_BUILT_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  reapers_mark: "deathbringer",
});

/** The proven build facts the applicability rules read. Resolved once per actor. */
export interface BloodBuildFacts {
  /** Every modelled talent's three-way resolution, by SimulationCraft name. */
  readonly talents: Readonly<Record<string, TalentResolution>>;
  readonly heroTree: HeroTreeResolution;
}

function background(pinnedBehaviour: string): ActionApplicability {
  return notApplicable("BACKGROUND_UNDER_PROVEN_BUILD", { itemId: null, slot: null, pinnedBehaviour });
}

function selectionOf(facts: BloodBuildFacts, simcName: string): TalentResolution["selection"] {
  return facts.talents[simcName]?.selection ?? "UNKNOWN";
}

/**
 * Whether an APL entry is a selectable foreground action for this player.
 *
 * Returns APPLICABLE for anything this module has no grounds to exclude, and
 * UNKNOWN when the deciding build fact is unresolved.
 */
export function resolveBloodApplicability(facts: BloodBuildFacts, action: AplAction): ActionApplicability {
  // The domain boundary, before any build fact.
  const nonDomain = bloodNonDomainApplicabilityFor(action);
  if (nonDomain !== null) return nonDomain;

  const { actionToken } = action;

  // Hero-tree ownership first: it can settle an entry the talent rule cannot.
  const ownerTree = HERO_TREE_BUILT_TOKENS[actionToken];
  if (
    ownerTree !== undefined &&
    facts.heroTree.state === "RESOLVED" &&
    facts.heroTree.simcName !== ownerTree
  ) {
    return background(
      `the action is built on a '${ownerTree}' hero talent and the observed build resolved to the ` +
        `'${facts.heroTree.simcName}' sub-tree; one hero tree is active at a time, so the talent is not found ` +
        "and the action is background (action.cpp:541-549)",
    );
  }

  const talentBuilt = TALENT_BUILT_TOKENS[actionToken];
  if (talentBuilt !== undefined) {
    const selection = selectionOf(facts, talentBuilt);
    if (selection === "SELECTED") return applicable();
    if (selection === "NOT_SELECTED") {
      return background(
        `the action is built on talent '${talentBuilt}', which resolves NOT_SELECTED in the observed tree; ` +
          "an action built on spell_data_t::not_found() is background (action.cpp:541-549)",
      );
    }
    return unknownApplicability(
      `the action is built on talent '${talentBuilt}', and the observed talent tree does not resolve it`,
    );
  }

  return applicable();
}

/**
 * What is known about cooldown READINESS at this decision, per APL token —
 * derived by the specialization's cooldown bindings from OBSERVED prior casts.
 * Only PROVEN_NOT_READY is ever acted on. A token absent from the list has no
 * readiness fact.
 */
export interface BloodReadinessFact {
  readonly simcToken: string;
  readonly readiness: CooldownReadiness;
  readonly abilityGameId: number | null;
}

export const NO_READINESS_FACTS: readonly BloodReadinessFact[] = [];

export function resolveBloodUsability(
  state: BloodFirstGcdState,
  action: AplAction,
  observedAbilityGameId: number,
  readiness: readonly BloodReadinessFact[] = NO_READINESS_FACTS,
): ActionUsabilityVerdict {
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
        "HYPOTHETICAL, not observed: in this explored branch this authority entry has already been " +
        "selected once, and nothing returns it at zero elapsed time. This says nothing about what the " +
        "player actually did.",
    });
  }

  // OBSERVED SECOND. The cast that demonstrably fired demonstrably was usable.
  const binding = bloodTokenBinding(action.actionToken);
  const candidates =
    binding.kind === "KNOWN_ONE"
      ? [binding.abilityGameId]
      : binding.kind === "KNOWN_SET"
        ? binding.abilityGameIds
        : [];
  if (candidates.includes(observedAbilityGameId)) return { kind: "PROVEN_USABLE" };

  // A DERIVED cooldown proven to exceed the queueing tolerance.
  const fact = readiness.find((row) => row.simcToken === action.actionToken);
  if (fact !== undefined && fact.readiness.state === "PROVEN_NOT_READY") {
    return provenUnusable("ACTIVE_COOLDOWN", {
      abilityGameId: fact.abilityGameId,
      itemId: null,
      provenRemainingAtLeastMs: fact.readiness.provenRemainingAtLeastMs,
      cooldownToleranceMs: fact.readiness.cooldownToleranceMs,
      detail:
        "the ability's own cooldown, anchored on the actor's last OBSERVED cast before this decision under " +
        "the pinned base and the reviewed modifier policy, is proven to exceed the queueing tolerance, so " +
        "action_t::ready cannot succeed. The bound is a LOWER bound and is compared as one.",
    });
  }

  return unknownUsability();
}
