/**
 * Brewmaster Monk's POSITIVE usability wiring (M11-C4i): for the four actions
 * the M11-C4i audit supports — Keg Smash, Blackout Kick, Breath of Fire and
 * Invoke Niuzao — every dimension of the shared completeness contract
 * (`src/findings/usability/usability-completeness.ts`), resolved at one
 * decision from mechanically established authority, and nothing else.
 *
 * WHERE EACH DIMENSION COMES FROM
 *
 *     BUILD_APPLICABILITY     the Brewmaster applicability rules (`action-profile.ts`)
 *     READY_OVERRIDE          the hand review of every `ready()` override in the
 *                             pinned module (`BREWMASTER_NO_READY_OVERRIDE`), and no
 *                             pinned readiness gate for the token
 *     COOLDOWN_READINESS      the shared upper-bound proof over the pinned cooldown
 *                             record, its census and its declared resets, counting
 *                             casts of every spell sharing its category
 *     RESOURCE_AFFORDABILITY  NOT_APPLICABLE for a spell with no power row; for Keg
 *                             Smash's Energy, the shared base-cost proof from the
 *                             decision cast's own PRE_COST observation, read under
 *                             the Energy wire type version-scoped to this capture
 *     GCD                     the candidate is a GCD action, and the decision is an
 *                             eligible GCD cast: a GCD action could start here
 *     RANGE_TARGET            STRICT same-target corroboration from the pinned range
 *                             and targeting records; Breath of Fire is UNTARGETED in
 *                             the pinned data and never receives it
 *     MOVEMENT_CAST           NOT_APPLICABLE for an instant, unchannelled action the
 *                             pinned `usable_moving()` rule permits on the move; for
 *                             a melee-range action it forbids on the move, PROVEN
 *                             only when the decision's own cast carries the SAME
 *                             restriction — whatever let that cast execute under the
 *                             authority's rule lets the candidate execute too
 *     ACTION_SPECIFIC         no further obligation is registered for any of the four
 *
 * A token outside the four is never given a conclusion here, so it can never
 * become PROVEN_USABLE by accident. Adding one is a reviewed change to
 * `POSITIVE_USABILITY_TOKENS` AND to every dimension above for it.
 */

import type { CombatState } from "../../../engine/state/combat-state.js";
import type { EvidenceLocator } from "../../../engine/evidence/locator.js";
import type { AplAuthority } from "../../../simc/apl-authority.js";
import type { ObservedTalentEntry } from "../../../data/game/talent-selection.js";
import { PINNED_DEFAULT_COOLDOWN_TOLERANCE_MS } from "../../../data/game/external-buff-authority.js";
import { resourceWireTypeFor } from "../../../data/wcl-wire/resource-types.js";
import {
  brewmasterExecutionLaneForAbility,
  brewmasterExecutionLaneForToken,
  brewmasterTokenBinding,
} from "../../../data/game/monk-brewmaster-gcd-semantics.js";
import { brewmasterCooldownAbilitiesFor } from "../../../data/game/monk-brewmaster-cooldowns.js";
import {
  BREWMASTER_NO_READY_OVERRIDE,
  BREWMASTER_READINESS_FACTS,
} from "../../../data/game/monk-brewmaster-readiness-authority.js";
import {
  brewmasterUsabilitySpell,
  pinnedBrewmasterUsabilityAuthority,
} from "../../../data/game/monk-brewmaster-usability-authority.js";
import {
  costCannotExceedBase,
  type UsabilityAuthoritySpell,
} from "../../../data/game/usability-authority-artifact.js";
import {
  concludePositiveUsability,
  notApplicableDimension,
  provenDimension,
  unknownDimension,
  type DimensionResolution,
  type PositiveUsability,
} from "../../../findings/usability/usability-completeness.js";
import { proveCooldownReadyByUpperBound } from "../../../findings/usability/cooldown-positive-readiness.js";
import { proveAffordableByBaseCost } from "../../../findings/usability/base-cost-affordability.js";
import { corroborateRangeBySameTarget } from "../../../findings/usability/range-corroboration.js";
import { resolveBrewmasterApplicability, type BrewmasterBuildFacts } from "./action-profile.js";

/** The only tokens a positive usability conclusion is ever built for. */
export const POSITIVE_USABILITY_TOKENS = Object.freeze([
  "keg_smash",
  "blackout_kick",
  "breath_of_fire",
  "invoke_niuzao",
] as const);

export interface BrewmasterPositiveUsabilityInput {
  readonly state: CombatState;
  readonly actorId: number;
  /** The decision's canonical position (the observed cast). */
  readonly position: number;
  readonly authority: AplAuthority;
  readonly buildFacts: BrewmasterBuildFacts;
  readonly observedTalents: readonly ObservedTalentEntry[];
  readonly observedAbilityGameId: number;
  readonly observedLocator: EvidenceLocator;
  /** The observed cast's own target actor, from the event. */
  readonly observedTargetActorId: number | null;
  /** The target the decision is about (the caller's override, or the observed cast's target). */
  readonly decisionTargetActorId: number | null;
}

const ENERGY_POWER_TYPE = 3;

/**
 * The wire type carrying Energy FOR THIS FIGHT'S PARSER VERSION (M11-C4j,
 * owner decision): through the shared version-scoped resolver with the
 * capture's own `gameVersion` / `logVersion`, never by scanning the contract
 * table unkeyed. A version no contract covers yields null, and only the
 * affordability dimension fails closed; a wire type read from the wrong parser
 * version would be a different field.
 */
function energyWireType(state: CombatState): number | null {
  const resolution = resourceWireTypeFor("ENERGY", {
    gameVersion: state.fight.provenance.gameVersion,
    logVersion: state.fight.provenance.logVersion,
  });
  return resolution.ok ? resolution.wireType : null;
}

function buildDimension(input: BrewmasterPositiveUsabilityInput, token: string): DimensionResolution {
  const action = input.authority.actions.find(
    (entry) => entry.entryKind === "PLAYER_ACTION" && entry.actionToken === token,
  );
  if (action === undefined)
    return unknownDimension("TOKEN_NOT_IN_AUTHORITY", `no pinned entry names ${token}`);
  const applicability = resolveBrewmasterApplicability(input.buildFacts, action);
  if (applicability.kind !== "APPLICABLE") {
    return unknownDimension(
      "NOT_PROVEN_APPLICABLE",
      `the Brewmaster applicability rules resolve ${token} ${applicability.kind} for the proven build`,
    );
  }
  return provenDimension(
    "APPLICABLE_UNDER_PROVEN_BUILD",
    "the Brewmaster applicability rules resolve the action APPLICABLE for the observed build (domain boundary first, then the constructor background rules)",
    { simcToken: token },
  );
}

function readyOverrideDimension(token: string): DimensionResolution {
  const gated = BREWMASTER_READINESS_FACTS.find((fact) => fact.simcToken === token);
  if (gated !== undefined) {
    return unknownDimension(
      "READY_OVERRIDE_GATES_THE_ACTION",
      `the pinned readiness authority records a ${gated.gate.kind} gate for ${token}`,
    );
  }
  const review = BREWMASTER_NO_READY_OVERRIDE.find((entry) => entry.simcToken === token);
  if (review === undefined) {
    return unknownDimension(
      "READY_OVERRIDE_NOT_REVIEWED",
      `no hand review of ${token}'s ready() is recorded`,
    );
  }
  return provenDimension(
    "NO_READY_OVERRIDE_BEYOND_MONK_ACTION",
    "a hand review of the pinned module finds no ready() override on the action or its wrappers; monk_action_t::ready only widens readiness and defers to action_t::ready",
    { actionStruct: review.actionStruct },
  );
}

function cooldownDimension(
  input: BrewmasterPositiveUsabilityInput,
  token: string,
  spell: UsabilityAuthoritySpell,
): DimensionResolution {
  const records = brewmasterCooldownAbilitiesFor(token);
  const record = records.length === 1 ? records[0] : undefined;
  if (record === undefined) {
    return unknownDimension(
      "COOLDOWN_RECORD_NOT_PINNED",
      `${String(records.length)} pinned cooldown record(s) name ${token}; exactly one is required`,
    );
  }
  return proveCooldownReadyByUpperBound({
    state: input.state,
    actorId: input.actorId,
    position: input.position,
    ability: record,
    relevantAbilityGameIds: [record.abilityGameId, ...spell.categorySiblingSpellIds],
    observedTalents: input.observedTalents,
    toleranceMs: PINNED_DEFAULT_COOLDOWN_TOLERANCE_MS,
  });
}

function affordabilityDimension(
  input: BrewmasterPositiveUsabilityInput,
  spell: UsabilityAuthoritySpell,
): DimensionResolution {
  if (spell.powerRows.length === 0) {
    return notApplicableDimension(
      "NO_POWER_ROW",
      "the pinned spell has no __spellpower_data row, so action_t::cost() is 0 and cost_affordable() cannot fail",
      { spellId: spell.spellId },
    );
  }
  const row = spell.powerRows.length === 1 ? spell.powerRows[0] : undefined;
  if (row === undefined || row.powerType !== ENERGY_POWER_TYPE) {
    return unknownDimension(
      "RESOURCE_NOT_SUPPORTED",
      `the pinned spell has ${String(spell.powerRows.length)} power row(s); only a single Energy row is supported`,
    );
  }
  const wireType = energyWireType(input.state);
  if (wireType === null) {
    return unknownDimension(
      "RESOURCE_WIRE_VERSION_NOT_COVERED",
      "no version-scoped Energy wire contract covers this capture's gameVersion/logVersion",
    );
  }
  const loaded = pinnedBrewmasterUsabilityAuthority();
  if (!loaded.ok) {
    return unknownDimension("RESOURCE_SEMANTICS_NOT_PINNED", "no usability authority");
  }
  const observedSpell = brewmasterUsabilitySpell(input.observedAbilityGameId);
  const observedRow = observedSpell?.powerRows.find((entry) => entry.powerType === ENERGY_POWER_TYPE);
  const bound = costCannotExceedBase(loaded, spell, row.powerRowIndex);
  return proveAffordableByBaseCost({
    observation: input.state.resources.observationOnEvent(input.position, input.actorId, wireType),
    observedCastBaseCost: observedRow?.cost ?? null,
    candidateBaseCost: row.cost,
    candidateCostCannotIncrease: bound.holds,
    costBoundBasis: bound.basis,
  });
}

function gcdDimension(input: BrewmasterPositiveUsabilityInput, token: string): DimensionResolution {
  const candidateLane = brewmasterExecutionLaneForToken(token);
  const observedLane = brewmasterExecutionLaneForAbility(input.observedAbilityGameId);
  if (candidateLane !== "GCD_CONSUMING" || observedLane !== "GCD_CONSUMING") {
    return unknownDimension(
      "GCD_NOT_ESTABLISHED",
      `the candidate's pinned lane is ${candidateLane} and the decision cast's is ${observedLane}; both must be GCD_CONSUMING`,
    );
  }
  return provenDimension(
    "DECISION_IS_A_GCD_CAST",
    "the decision is the player's own completed GCD cast, so a GCD action could start at this instant, and the candidate is a pinned GCD action",
    { candidateLane, observedLane },
  );
}

function rangeDimension(
  input: BrewmasterPositiveUsabilityInput,
  spell: UsabilityAuthoritySpell,
): DimensionResolution {
  const observedSpell = brewmasterUsabilitySpell(input.observedAbilityGameId);
  if (observedSpell === null) {
    return unknownDimension(
      "CORROBORATOR_NOT_PINNED",
      `the decision's own spell ${String(input.observedAbilityGameId)} has no pinned range record`,
    );
  }
  return corroborateRangeBySameTarget({
    candidate: spell,
    observed: {
      ...observedSpell,
      casterActorId: input.actorId,
      targetActorId: input.observedTargetActorId,
      locator: input.observedLocator,
    },
    decisionTargetActorId: input.decisionTargetActorId,
  });
}

function movementDimension(
  input: BrewmasterPositiveUsabilityInput,
  spell: UsabilityAuthoritySpell,
): DimensionResolution {
  if (spell.castTimeMs !== 0 || spell.channeled) {
    return unknownDimension("CAST_TIME_OR_CHANNEL", "only instant, unchannelled candidates are supported");
  }
  if (spell.movementRestriction === "USABLE_WHILE_MOVING") {
    return notApplicableDimension(
      "INSTANT_USABLE_WHILE_MOVING",
      "the pinned action_t::usable_moving() rule permits an instant, unchannelled action with a range outside (0, 5] while moving",
      { maxRangeYd: spell.maxRangeYd },
    );
  }
  const observedSpell = brewmasterUsabilitySpell(input.observedAbilityGameId);
  if (
    observedSpell !== null &&
    observedSpell.movementRestriction === "NOT_USABLE_WHILE_MOVING" &&
    observedSpell.castTimeMs === 0 &&
    !observedSpell.channeled
  ) {
    return provenDimension(
      "SAME_RESTRICTION_SATISFIED_BY_DECISION_CAST",
      "the candidate is not usable while moving under the pinned usable_moving() rule, and the decision's own cast is an instant carrying the SAME restriction; it executed at this instant, so the restriction did not bite",
      { corroboratingSpellId: observedSpell.spellId, maxRangeYd: spell.maxRangeYd },
      [input.observedLocator],
    );
  }
  return unknownDimension(
    "MOVEMENT_NOT_ESTABLISHED",
    "the candidate is not usable while moving under the pinned usable_moving() rule, and nothing observed at this decision shows the restriction did not bite",
  );
}

function actionSpecificDimension(token: string): DimensionResolution {
  return notApplicableDimension(
    "NO_REGISTERED_ACTION_SPECIFIC_OBLIGATION",
    "no further obligation is registered for this action; its ready() is reviewed (READY_OVERRIDE) and the pinned list's gates are the scan's, not usability's",
    { simcToken: token },
  );
}

/** One token's conclusion at one decision. */
export function brewmasterPositiveUsabilityFor(
  input: BrewmasterPositiveUsabilityInput,
  token: (typeof POSITIVE_USABILITY_TOKENS)[number],
): PositiveUsability {
  const binding = brewmasterTokenBinding(token);
  const spell = binding.kind === "KNOWN_ONE" ? brewmasterUsabilitySpell(binding.abilityGameId) : null;
  if (spell === null) {
    const missing = unknownDimension(
      "USABILITY_AUTHORITY_NOT_PINNED",
      `${token} has no pinned usability record`,
    );
    return concludePositiveUsability(token, {
      BUILD_APPLICABILITY: buildDimension(input, token),
      READY_OVERRIDE: readyOverrideDimension(token),
      COOLDOWN_READINESS: missing,
      RESOURCE_AFFORDABILITY: missing,
      GCD: gcdDimension(input, token),
      RANGE_TARGET: missing,
      MOVEMENT_CAST: missing,
      ACTION_SPECIFIC: actionSpecificDimension(token),
    });
  }
  return concludePositiveUsability(token, {
    BUILD_APPLICABILITY: buildDimension(input, token),
    READY_OVERRIDE: readyOverrideDimension(token),
    COOLDOWN_READINESS: cooldownDimension(input, token, spell),
    RESOURCE_AFFORDABILITY: affordabilityDimension(input, spell),
    GCD: gcdDimension(input, token),
    RANGE_TARGET: rangeDimension(input, spell),
    MOVEMENT_CAST: movementDimension(input, spell),
    ACTION_SPECIFIC: actionSpecificDimension(token),
  });
}

/**
 * Every supported token's conclusion at one decision, except the observed
 * token itself — whose usability is the observation's, and already proven.
 */
export function resolveBrewmasterPositiveUsability(
  input: BrewmasterPositiveUsabilityInput,
  observedToken: string,
): ReadonlyMap<string, PositiveUsability> {
  const conclusions = new Map<string, PositiveUsability>();
  for (const token of POSITIVE_USABILITY_TOKENS) {
    if (token === observedToken) continue;
    conclusions.set(token, brewmasterPositiveUsabilityFor(input, token));
  }
  return conclusions;
}
