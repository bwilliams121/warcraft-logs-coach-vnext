/**
 * Which observed encounter events surrounded a temporal anchor.
 *
 * WHAT THIS ANSWERS, AND THE SENTENCE IT IS LIMITED TO
 *
 *     these observations occurred within the requested temporal interval
 *
 * Not that they caused the anchor, not that they explain it, not that they are
 * relevant to it, and not that they are mechanics. There is no causality field,
 * no relevance value, no weighting and no nearest-event winner — an
 * `EncounterEventObservation` is a normalized event reduced to its factual
 * envelope and nothing else, so there is nowhere for a judgement to be written.
 *
 * DEATH CONTEXT IS DELIBERATELY UNSUPPORTED
 *
 * Death-event encounter context is unsupported because the normalized combat
 * model currently has no evidence-backed death event family. `CombatEvent` has
 * no death variant, and `DEATHS` remains capability UNVERIFIED — the registry
 * records that neither committed capture contained a death event.
 *
 * NO ABSENCE CLAIM ABOUT DEATHS IS PERMITTED. In particular this module exposes
 * no `deaths: []` field: an empty array would be read as observed absence, which
 * is precisely the claim the evidence cannot support. The correct implementation
 * begins only after a committed fixture establishes the event family, at the
 * normalization layer, before any consumer reads it.
 *
 * NOTHING HERE IS RECREATED FROM SCRATCH
 *
 * The anchor is M4's `TemporalPosition`. Phase placement is M4's
 * `EncounterStateView.phaseAt`. The trustworthy-empty-versus-unknown decision is
 * M4's `gateActorGlobalClaim`, reported through M4's `StateResult`. Boundary
 * arithmetic is M3's `inclusiveRange`/`rangeContains`. Source and target stay
 * M3's branded `SourceRef`/`TargetRef`. This module supplies a window, a filter
 * and a projection; every rule it appears to enforce belongs to somebody else.
 */

import { inclusiveRange, rangeContains } from "../engine/evidence/coverage.js";
import type { EvidenceLocator } from "../engine/evidence/locator.js";
import { SUPPORTED_TYPE_CONTRACTS } from "../engine/normalization/supported-families.js";
import type { CombatEvent, SourceRef, TargetRef } from "../engine/normalization/normalized-events.js";
import type { CombatState } from "../engine/state/combat-state.js";
import {
  gateActorGlobalClaim,
  exactObserved,
  unknownState,
  type StateResult,
} from "../engine/state/state-result.js";
import type { TemporalPosition } from "../engine/state/temporal.js";
import type { EvidenceCategory } from "../wcl/evidence-capability.js";
import type { TemporalWindowMs } from "./temporal-window.js";

/**
 * The event families that can truthfully describe encounter context.
 *
 * FOUR, AND EACH ONE EARNED ITS PLACE. The bar applied to every candidate was:
 * a decoded normalized representation exists, the family preserves source and
 * target separately, an ability identity is available where the family has one,
 * and the governing evidence category is OBSERVABLE in the capability registry
 * rather than UNVERIFIED.
 *
 *     CAST     what an actor did. Source, target and ability all present.
 *     AURA     buff/debuff application, refresh and removal — how an encounter
 *              applies state to actors. Direction is preserved by M3 and the
 *              aura class is explicit.
 *     DAMAGE   what struck whom. Source and target are separate facts.
 *     SUMMON   an actor bringing another into the fight, which is how adds
 *              appear without any encounter-specific knowledge.
 *
 * DELIBERATELY EXCLUDED, with reasons rather than by omission:
 *
 *     HEALING, ABSORB        real and decoded, but they describe the raid
 *                            responding, not the encounter acting. A healer
 *                            milestone with an actual consumer can add them.
 *     RESOURCE_CHANGE        player resource bookkeeping. Not encounter context
 *                            under any reading.
 *     COMBATANT_INFO         a fight-start snapshot, not an event near an
 *                            instant.
 *     ENVELOPE_ONLY,         no decoded family fields at all, so there is no
 *     UNSUPPORTED,           source, target or ability to report. Including them
 *     MALFORMED_FAMILY       would emit rows that look like observations and
 *                            carry nothing.
 *
 * "Sounds useful" was not a criterion, and no family is here on that basis.
 */
export const ENCOUNTER_EVENT_FAMILIES = ["CAST", "AURA", "DAMAGE", "SUMMON"] as const;

export type EncounterEventFamily = (typeof ENCOUNTER_EVENT_FAMILIES)[number];

/**
 * Which evidence category governs each family, derived from M3's registry.
 *
 * DERIVED RATHER THAN RETYPED. `SUPPORTED_TYPE_CONTRACTS` already binds every
 * raw Warcraft Logs type to a family and a category; writing a second mapping
 * here would be a copy that can silently disagree with the one normalization
 * actually used. A family whose contracts disagree about their category, or that
 * has no contract at all, maps to `null` and every query for it fails closed —
 * it is never guessed.
 */
function deriveFamilyCategories(): Readonly<Record<EncounterEventFamily, EvidenceCategory | null>> {
  const derived: Partial<Record<EncounterEventFamily, EvidenceCategory | null>> = {};

  for (const family of ENCOUNTER_EVENT_FAMILIES) {
    const categories = new Set(
      SUPPORTED_TYPE_CONTRACTS.filter(
        (contract) => contract.handling === "FAMILY" && contract.family === family,
      ).map((contract) => contract.category),
    );
    const single = [...categories];
    derived[family] = single.length === 1 ? (single[0] ?? null) : null;
  }

  return Object.freeze(derived as Record<EncounterEventFamily, EvidenceCategory | null>);
}

export const ENCOUNTER_EVENT_CATEGORIES = deriveFamilyCategories();

/**
 * One observed encounter event, reduced to facts.
 *
 * SOURCE AND TARGET ARE THE BRANDED M3 TYPES, not a generic `actorId`. That is
 * the enforcement for the rule that the two must never be collapsed: a
 * `SourceRef` is not assignable to a `TargetRef`, so a later edit that tried to
 * merge them into one field would not compile. Both are nullable because M3
 * genuinely records events with no source or no target, and `null` here is that
 * fact rather than a placeholder.
 *
 * NO HOSTILITY FIELD. Attacker/victim roles are not inferred, and hostility is
 * not derived from an actor id. The normalized actor catalog is where any such
 * fact would have to come from, and this projection does not claim one.
 *
 * `position` is the canonical position and `locator` is the evidence reference,
 * so a consumer can walk back to the exact observation. Neither is generated:
 * there is no id minted anywhere in this module.
 */
export interface EncounterEventObservation {
  readonly family: EncounterEventFamily;
  readonly position: number;
  readonly locator: EvidenceLocator;
  readonly reportTimeMs: number;
  readonly fightTimeMs: number;
  readonly source: SourceRef | null;
  readonly target: TargetRef | null;
  readonly abilityGameId: number | null;
}

export interface NearbyEncounterEventsQuery {
  /** M4's temporal anchor. No second anchor type exists. */
  readonly anchor: TemporalPosition;
  readonly window: TemporalWindowMs;
  /**
   * Which families to look for.
   *
   * REQUIRED, with no default. The coverage gate below is applied per requested
   * family, so asking for a family widens what must be proven complete. A
   * default would make callers silently claim evidence they never considered.
   */
  readonly families: readonly EncounterEventFamily[];
}

function observationOf(
  event: CombatEvent,
  family: EncounterEventFamily,
  position: number,
): EncounterEventObservation {
  return {
    family,
    position,
    locator: event.locator,
    reportTimeMs: event.reportTimeMs,
    fightTimeMs: event.fightTimeMs,
    source: event.source,
    target: event.target,
    abilityGameId: event.abilityGameId,
  };
}

function isRequestedFamily(
  event: CombatEvent,
  families: readonly EncounterEventFamily[],
): event is CombatEvent & { readonly kind: EncounterEventFamily } {
  return (
    (ENCOUNTER_EVENT_FAMILIES as readonly string[]).includes(event.kind) &&
    (families as readonly string[]).includes(event.kind)
  );
}

/**
 * The observed encounter events within a window around an anchor.
 *
 * THE EMPTY ARRAY IS A CLAIM, AND IT IS GATED
 *
 * An EXACT result whose value is `[]` says: the required evidence was
 * obtainable, in scope, and completely covered across the whole window, and
 * nothing matching was observed. That is a real fact.
 *
 * An UNKNOWN result says we were not in a position to look. The two are never
 * interchangeable, and the decision is made by `gateActorGlobalClaim` rather than by
 * any rule written here — the same gate every other absence claim in this
 * codebase passes through. Each requested family is gated separately over the
 * window, so asking for three families and holding complete coverage for two
 * yields UNKNOWN rather than a partial answer dressed as a complete one.
 *
 * ORDERING, EQUAL TIMESTAMPS AND NON-MONOTONIC INPUT
 *
 * The scan walks `fight.events` in canonical position order and filters. It does
 * not sort, does not deduplicate and does not merge observations sharing a
 * timestamp — every matching observation is emitted, in the order M3 retrieved
 * it. Equal timestamps are valid data here, not a collision to resolve.
 *
 * Non-monotonic input is likewise not a blocker for the FILTER, because a
 * timestamp predicate asks nothing about order: each event's own timestamp is
 * its own fact. Monotonicity does matter to the ANCHOR, and that is handled
 * where it belongs — `resolveTemporalPosition` returns NON_MONOTONIC_TIME for a
 * timestamp anchor over a non-monotonic fight, and this function propagates it.
 * Event anchors need no such guarantee and are unaffected.
 *
 * BOUNDS ARE INCLUSIVE ON BOTH SIDES, via M3's `inclusiveRange`. An observation
 * exactly `beforeMs` earlier, or exactly `afterMs` later, is inside the window.
 */
export function encounterEventsNear(
  state: CombatState,
  query: NearbyEncounterEventsQuery,
): StateResult<readonly EncounterEventObservation[]> {
  const resolved = state.resolveTemporalPosition(query.anchor);
  if (!resolved.ok) {
    return unknownState(resolved.reason);
  }

  // The anchor's own instant. `boundaryReportTimeMs` is deliberately the
  // anchor's timestamp rather than the last included event's, which is what an
  // absence claim across the window has to be measured against.
  const anchorTimeMs = resolved.prefix.boundaryReportTimeMs;
  const range = inclusiveRange(anchorTimeMs - query.window.beforeMs, anchorTimeMs + query.window.afterMs);

  for (const family of query.families) {
    const category = ENCOUNTER_EVENT_CATEGORIES[family];
    if (category === null) {
      // The registry does not bind this family to exactly one category, so there
      // is no category whose coverage could be checked. Fail closed.
      return unknownState("UNSUPPORTED_DERIVATION");
    }
    // ACTOR-GLOBAL, not actor-agnostic. This query ranges over every actor in
    // the fight, so it needs evidence that vouches for every actor — which is
    // the FULL_RAID `actorScope: null`. Under PLAYER_CONTEXT the scope is a
    // bounded list, and returning rows from it would publish a result whose
    // universe is narrower than the question, with the narrowing invisible.
    const gate = gateActorGlobalClaim({
      completeness: state.fight.completeness,
      category,
      range,
    });
    if (!gate.ok) {
      return unknownState(gate.reason, [], category);
    }
  }

  const observations: EncounterEventObservation[] = [];
  const locators: EvidenceLocator[] = [];

  // Canonical order, by construction: `events` is M3's retrieval-order array and
  // the index IS the canonical position.
  for (const [position, event] of state.fight.events.entries()) {
    if (!isRequestedFamily(event, query.families)) {
      continue;
    }
    if (!rangeContains(range, event.reportTimeMs)) {
      continue;
    }
    observations.push(observationOf(event, event.kind, position));
    locators.push(event.locator);
  }

  // `category: null` because several categories may have governed one answer.
  // The per-family gates above are what vouched for it.
  return exactObserved(observations, locators, null);
}
