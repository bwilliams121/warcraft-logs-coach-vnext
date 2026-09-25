/**
 * The Brewmaster Monk reading of applicability and usability (M11-C2).
 *
 * WHAT THIS COMPOSES
 *
 *     src/simc/action-applicability             the generic verdict vocabulary
 *     ./domain-boundary                         the class/spec authority boundary
 *     src/data/game/monk-brewmaster-talents     the pinned build facts
 *     src/data/game/monk-brewmaster-gcd-…       the pinned token identities
 *     src/data/game/monk-brewmaster-readiness-… the hand-reviewed ready() overrides
 *
 * APPLICABILITY, IN THE PINNED ORDER
 *
 * The domain boundary is decided FIRST: a racial, a potion, an item use is
 * `OUTSIDE_SUPPORTED_DECISION_DOMAIN` before any build fact is read
 * (`domain-boundary.ts`). Then the constructor readings, each a
 * `background = true` site of the pinned module by way of the shared rule:
 * `action_t::action_t` marks an action built on `spell_data_t::not_found()`
 * background (action.cpp:541-549), and an untaken talent yields exactly that.
 *
 *     talent-built actions      black_ox_brew (:3108-3109), breath_of_fire
 *                               (:3267-3268), chi_burst (:3022-3025),
 *                               exploding_keg (:3381-3382), fortifying_brew
 *                               (:3334-3335), invoke_niuzao (on
 *                               invoke_niuzao_the_black_ox, :3734-3735),
 *                               keg_smash (:2509-2510), purifying_brew
 *                               (:3487-3488), rushing_jade_wind (:1476-1477)
 *     the celestial_brew token  `create_action` builds celestial_infusion_t on
 *                               Celestial Infusion when it is taken and
 *                               celestial_brew_t on Celestial Brew otherwise
 *                               (:5349-5352); the two are one choice node, so
 *                               the token is applicable when either is
 *                               SELECTED, background when both are disproved,
 *                               and UNKNOWN when the node is unobserved
 *     baseline spells           tiger_palm, blackout_kick, expel_harm: no
 *                               talent guard, applicable
 *     empty_the_cellar          built on a DRIVER spell, not the talent
 *                               (:3438-3444); no background proof exists, so
 *                               it is applicable and its READINESS decides
 *
 * Everything else is APPLICABLE, the honest default, and an UNKNOWN build
 * fact never excludes anything.
 *
 * USABILITY: THE PROOFS, AND NOTHING IN BETWEEN
 *
 *     SIMULATED_PREFIX_EXECUTION   this branch already fired the entry (counterfactual, named so)
 *     PROVEN_USABLE                the observed cast itself — never anything else
 *     ACTIVE_COOLDOWN              a derived cooldown of one of the six M11-C1 pins,
 *                                  proven past the tolerance
 *     STATIC_READY_FALSE           tiger_palm under a SELECTED Press the Advantage:
 *                                  `tiger_palm_t::ready()` returns false while the
 *                                  talent is taken (:848-853) — build-static
 *     REQUIRED_AURA_INACTIVE       empty_the_cellar with its readiness aura PROVEN
 *                                  inactive by an observed removal — and ONLY when
 *                                  the aura's wire identity is corroborated. It is
 *                                  not (`monk-brewmaster-readiness-authority.ts`), so
 *                                  in M11-C2 the fact `aura-bindings.ts` resolves is
 *                                  NOT_ESTABLISHED at every decision and the proof is
 *                                  never made.
 *
 * NO RESOURCE PROOF IN EITHER DIRECTION. No Energy is reconstructed, so no
 * INSUFFICIENT_RESOURCE is ever claimed and no affordability-based
 * PROVEN_USABLE either. NO BREW-CHARGE PROOF: the brews' readiness is UNKNOWN
 * unless the decision's own cast proves it.
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
import { brewmasterTokenBinding } from "../../../data/game/monk-brewmaster-gcd-semantics.js";
import { BREWMASTER_READINESS_FACTS } from "../../../data/game/monk-brewmaster-readiness-authority.js";
import type { BrewmasterReadinessAuraFact } from "./aura-bindings.js";
import { brewmasterNonDomainApplicabilityFor } from "./domain-boundary.js";
import { hasExecuted, type BrewmasterFirstGcdState, type ExecutedEntry } from "./first-gcd-state.js";

/** Token → the pinned talent whose absence makes the action `not_found()`-background (action.cpp:541-549). */
export const TALENT_BUILT_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  black_ox_brew: "black_ox_brew",
  breath_of_fire: "breath_of_fire",
  chi_burst: "chi_burst",
  exploding_keg: "exploding_keg",
  fortifying_brew: "fortifying_brew",
  invoke_niuzao: "invoke_niuzao_the_black_ox",
  keg_smash: "keg_smash",
  purifying_brew: "purifying_brew",
  rushing_jade_wind: "rushing_jade_wind",
});

/** The token `create_action` builds on one of two alternatives at one choice node (:5349-5352). */
export const CELESTIAL_BREW_TOKEN = "celestial_brew";
export const CELESTIAL_BREW_ALTERNATIVES = Object.freeze(["celestial_infusion", "celestial_brew"] as const);

/** The proven build facts the applicability rules read. Resolved once per actor. */
export interface BrewmasterBuildFacts {
  /** Every modelled talent's three-way resolution, by SimulationCraft name. */
  readonly talents: Readonly<Record<string, TalentResolution>>;
  readonly heroTree: HeroTreeResolution;
}

function background(pinnedBehaviour: string): ActionApplicability {
  return notApplicable("BACKGROUND_UNDER_PROVEN_BUILD", { itemId: null, slot: null, pinnedBehaviour });
}

function selectionOf(facts: BrewmasterBuildFacts, simcName: string): TalentResolution["selection"] {
  return facts.talents[simcName]?.selection ?? "UNKNOWN";
}

/**
 * Whether an APL entry is a selectable foreground action for this player.
 *
 * Returns APPLICABLE for anything this module has no grounds to exclude, and
 * UNKNOWN when the deciding build fact is unresolved.
 */
export function resolveBrewmasterApplicability(
  facts: BrewmasterBuildFacts,
  action: AplAction,
): ActionApplicability {
  // The domain boundary, before any build fact.
  const nonDomain = brewmasterNonDomainApplicabilityFor(action);
  if (nonDomain !== null) return nonDomain;

  const { actionToken } = action;

  if (actionToken === CELESTIAL_BREW_TOKEN) {
    const selections = CELESTIAL_BREW_ALTERNATIVES.map((name) => selectionOf(facts, name));
    if (selections.includes("SELECTED")) return applicable();
    if (selections.every((selection) => selection === "NOT_SELECTED")) {
      return background(
        "neither Celestial Infusion nor Celestial Brew resolves SELECTED in the observed tree, so the token builds " +
          "an action on spell_data_t::not_found(), which is background (action.cpp:541-549; sc_monk.cpp:5349-5352)",
      );
    }
    return unknownApplicability(
      "the celestial_brew token is built on Celestial Infusion or Celestial Brew, and the observed talent tree " +
        "resolves neither",
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

// ---------------------------------------------------------------------------
// Readiness facts
// ---------------------------------------------------------------------------

/**
 * What is known about cooldown READINESS at this decision, per APL token —
 * derived by the specialization's cooldown bindings from OBSERVED prior casts.
 * Only PROVEN_NOT_READY is ever acted on. A token absent from the list has no
 * readiness fact.
 */
export interface BrewmasterReadinessFact {
  readonly simcToken: string;
  readonly readiness: CooldownReadiness;
  readonly abilityGameId: number | null;
}

export const NO_READINESS_FACTS: readonly BrewmasterReadinessFact[] = [];

/** The build-static STATIC_READY_FALSE gate for a token, when the pinned talent is SELECTED. */
function staticReadyFalseTalentFor(facts: BrewmasterBuildFacts, simcToken: string): string | null {
  for (const fact of BREWMASTER_READINESS_FACTS) {
    if (fact.simcToken !== simcToken || fact.gate.kind !== "NOT_READY_WHILE_TALENT_SELECTED") continue;
    if (selectionOf(facts, fact.gate.talentSimcName) === "SELECTED") return fact.gate.talentSimcName;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Usability
// ---------------------------------------------------------------------------

export interface BrewmasterUsabilityInput {
  readonly state: BrewmasterFirstGcdState;
  readonly action: AplAction;
  readonly observedAbilityGameId: number;
  readonly buildFacts: BrewmasterBuildFacts;
  readonly readiness: readonly BrewmasterReadinessFact[];
  readonly readinessAuras: readonly BrewmasterReadinessAuraFact[];
}

export function resolveBrewmasterUsability(input: BrewmasterUsabilityInput): ActionUsabilityVerdict {
  const { state, action, observedAbilityGameId, buildFacts, readiness, readinessAuras } = input;
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
  const binding = brewmasterTokenBinding(action.actionToken);
  const candidates =
    binding.kind === "KNOWN_ONE"
      ? [binding.abilityGameId]
      : binding.kind === "KNOWN_SET"
        ? binding.abilityGameIds
        : [];
  if (candidates.includes(observedAbilityGameId)) return { kind: "PROVEN_USABLE" };

  // A build-static ready() override: Tiger Palm under Press the Advantage.
  const staticTalent = staticReadyFalseTalentFor(buildFacts, action.actionToken);
  if (staticTalent !== null) {
    return provenUnusable("STATIC_READY_FALSE", {
      abilityGameId: candidates[0] ?? null,
      itemId: null,
      provenRemainingAtLeastMs: null,
      cooldownToleranceMs: null,
      detail:
        `the action's ready() returns false while talent '${staticTalent}' is taken, and the observed tree ` +
        "resolves it SELECTED (sc_monk.cpp:848-853); the action cannot fire whatever its cooldown says.",
    });
  }

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

  // A readiness aura PROVEN inactive under a CORROBORATED wire identity.
  const aura = readinessAuras.find((row) => row.simcToken === action.actionToken);
  if (aura !== undefined && aura.state === "PROVEN_INACTIVE") {
    return provenUnusable("REQUIRED_AURA_INACTIVE", {
      abilityGameId: aura.wireAuraId,
      itemId: null,
      provenRemainingAtLeastMs: null,
      cooldownToleranceMs: null,
      detail:
        `ready() requires aura ${String(aura.wireAuraId)} up, and M4 proved it INACTIVE from the removal ` +
        `observed at ${String(aura.anchorReportTimeMs)}; the action cannot fire whatever its gate says.`,
    });
  }

  return unknownUsability();
}
