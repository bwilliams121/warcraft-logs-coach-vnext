/**
 * Havoc Demon Hunter's POSITIVE usability wiring (ONB-A1): for Reaver's Glaive, the
 * one action this slice supports, every dimension of the shared completeness
 * contract (`src/findings/usability/usability-completeness.ts`), resolved at one
 * decision from mechanically established authority, and nothing else.
 *
 *     BUILD_APPLICABILITY     the Havoc applicability rules (`action-profile.ts`)
 *     READY_OVERRIDE          reavers_glaive_t::ready (:8459-8471) needs its buff up
 *                             and a GCD available; both are other dimensions here
 *     COOLDOWN_READINESS      NOT_APPLICABLE: the pinned record has no cooldown,
 *                             charges or category (spell 442294)
 *     RESOURCE_AFFORDABILITY  NOT_APPLICABLE: no __spellpower_data row
 *     GCD                     the candidate is a GCD action, and the decision is an
 *                             eligible GCD cast: a GCD action could start here
 *     RANGE_TARGET            STRICT same-target corroboration (0-40 yd against the
 *                             decision cast's own enemy target)
 *     MOVEMENT_CAST           NOT_APPLICABLE: instant and usable while moving
 *     ACTION_SPECIFIC         its buff PROVEN up for at least the reaction tolerance
 *
 * THE REACTION TOLERANCE (`CLAUDE.md`, "Timing Tolerance"). A press is committed
 * before the game shows the buff that makes it wrong, and the log shows a player
 * pressing Annihilation 469 ms after Reaver's Glaive came up. Holding a decision to a
 * buff younger than `REAVERS_GLAIVE_REACTION_TOLERANCE_MS` would blame the player for
 * not reacting faster than a human reacts, so the dimension stays UNKNOWN there. It
 * only ever withholds a proof.
 *
 * A token other than Reaver's Glaive never receives a conclusion here, so it can never
 * become PROVEN_USABLE by accident.
 */

import type { EvidenceLocator } from "../../../engine/evidence/locator.js";
import {
  havocExecutionLaneForAbility,
  havocExecutionLaneForToken,
} from "../../../data/game/demonhunter-havoc-gcd-semantics.js";
import { havocUsabilitySpell } from "../../../data/game/demonhunter-havoc-usability-authority.js";
import {
  concludePositiveUsability,
  notApplicableDimension,
  provenDimension,
  unknownDimension,
  type DimensionResolution,
  type PositiveUsability,
} from "../../../findings/usability/usability-completeness.js";
import { corroborateRangeBySameTarget } from "../../../findings/usability/range-corroboration.js";
import type { AplAuthority } from "../../../simc/apl-authority.js";
import { REAVERS_GLAIVE_TOKEN, resolveHavocApplicability, type HavocBuildFacts } from "./action-profile.js";
import type { ReaversGlaiveReadinessFact } from "./aura-bindings.js";

/** A buff younger than this at the press is never held against the player. */
export const REAVERS_GLAIVE_REACTION_TOLERANCE_MS = 1000;

export interface HavocPositiveUsabilityInput {
  readonly actorId: number;
  readonly authority: AplAuthority;
  readonly buildFacts: HavocBuildFacts;
  readonly reaversGlaive: ReaversGlaiveReadinessFact;
  readonly observedAbilityGameId: number;
  readonly observedLocator: EvidenceLocator;
  readonly observedTargetActorId: number | null;
  readonly decisionTargetActorId: number | null;
}

function buildDimension(input: HavocPositiveUsabilityInput): DimensionResolution {
  const entry = input.authority.actions.find(
    (action) => action.entryKind === "PLAYER_ACTION" && action.actionToken === REAVERS_GLAIVE_TOKEN,
  );
  if (entry === undefined) {
    return unknownDimension("TOKEN_NOT_IN_AUTHORITY", "the pinned list names no reavers_glaive entry");
  }
  const applicability = resolveHavocApplicability(input.buildFacts, entry);
  if (applicability.kind !== "APPLICABLE") {
    return unknownDimension("BUILD_NOT_PROVEN", `the entry's applicability is ${applicability.kind}`);
  }
  return provenDimension(
    "ART_OF_THE_GLAIVE_SELECTED",
    "the action is looked up through Art of the Glaive, which the observed tree resolves SELECTED",
    { talent: "art_of_the_glaive" },
  );
}

function rangeDimension(input: HavocPositiveUsabilityInput): DimensionResolution {
  const candidate = havocUsabilitySpell(442294);
  const observed = havocUsabilitySpell(input.observedAbilityGameId);
  if (candidate === null) {
    return unknownDimension(
      "USABILITY_AUTHORITY_NOT_PINNED",
      "reavers_glaive has no pinned usability record",
    );
  }
  if (observed === null) {
    return unknownDimension(
      "CORROBORATOR_NOT_PINNED",
      `the decision's own spell ${String(input.observedAbilityGameId)} has no pinned range record`,
    );
  }
  return corroborateRangeBySameTarget({
    candidate,
    observed: {
      ...observed,
      casterActorId: input.actorId,
      targetActorId: input.observedTargetActorId,
      locator: input.observedLocator,
    },
    decisionTargetActorId: input.decisionTargetActorId,
  });
}

function actionSpecificDimension(fact: ReaversGlaiveReadinessFact): DimensionResolution {
  if (fact.state !== "PROVEN_UP") {
    return unknownDimension("REQUIRED_BUFF_NOT_PROVEN_UP", `buff.reavers_glaive is ${fact.state} here`);
  }
  if (fact.upForMs < REAVERS_GLAIVE_REACTION_TOLERANCE_MS) {
    return unknownDimension(
      "WITHIN_REACTION_TOLERANCE",
      `buff.reavers_glaive came up ${String(fact.upForMs)} ms before this press, inside the ${String(REAVERS_GLAIVE_REACTION_TOLERANCE_MS)} ms reaction tolerance`,
    );
  }
  return provenDimension(
    "REQUIRED_BUFF_PROVEN_UP",
    "M4 observed buff.reavers_glaive up, for at least the reaction tolerance, at this decision",
    { upForMs: fact.upForMs },
    [fact.anchorLocator],
  );
}

/** Reaver's Glaive's conclusion at one decision. */
export function havocReaversGlaivePositiveUsability(input: HavocPositiveUsabilityInput): PositiveUsability {
  const candidateLane = havocExecutionLaneForToken(REAVERS_GLAIVE_TOKEN);
  const observedLane = havocExecutionLaneForAbility(input.observedAbilityGameId);
  const gcd =
    candidateLane === "GCD_CONSUMING" && observedLane === "GCD_CONSUMING"
      ? provenDimension(
          "DECISION_IS_A_GCD_CAST",
          "the decision is the player's own completed GCD cast, so a GCD action could start at this instant",
          { candidateLane, observedLane },
        )
      : unknownDimension(
          "GCD_NOT_ESTABLISHED",
          `the candidate's pinned lane is ${candidateLane} and the decision cast's is ${observedLane}`,
        );
  return concludePositiveUsability(REAVERS_GLAIVE_TOKEN, {
    BUILD_APPLICABILITY: buildDimension(input),
    READY_OVERRIDE: provenDimension(
      "READY_OVERRIDE_REVIEWED",
      "reavers_glaive_t::ready adds exactly the buff gate (ACTION_SPECIFIC) and a GCD gate (GCD) to the base readiness",
      { actionStruct: "reavers_glaive_t" },
    ),
    COOLDOWN_READINESS: notApplicableDimension(
      "NO_COOLDOWN_RECORD",
      "the pinned spell row carries no cooldown, charges or category",
      { spellId: 442294 },
    ),
    RESOURCE_AFFORDABILITY: notApplicableDimension(
      "NO_POWER_ROW",
      "the pinned spell has no __spellpower_data row, so action_t::cost() is 0",
      { spellId: 442294 },
    ),
    GCD: gcd,
    RANGE_TARGET: rangeDimension(input),
    MOVEMENT_CAST: notApplicableDimension(
      "INSTANT_USABLE_WHILE_MOVING",
      "the pinned action_t::usable_moving() rule permits an instant, unchannelled action with a range outside (0, 5]",
      { maxRangeYd: 40 },
    ),
    ACTION_SPECIFIC: actionSpecificDimension(input.reaversGlaive),
  });
}

/** The conclusions at one decision, except for an observed Reaver's Glaive, which is its own proof. */
export function resolveHavocPositiveUsability(
  input: HavocPositiveUsabilityInput,
  observedToken: string,
): ReadonlyMap<string, PositiveUsability> {
  const conclusions = new Map<string, PositiveUsability>();
  if (observedToken !== REAVERS_GLAIVE_TOKEN) {
    conclusions.set(REAVERS_GLAIVE_TOKEN, havocReaversGlaivePositiveUsability(input));
  }
  return conclusions;
}
