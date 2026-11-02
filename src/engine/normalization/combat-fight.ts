/**
 * The normalized combat model.
 *
 * `CombatFight` is what Milestone 4 reconstructs state from. It contains
 * observations and nothing else: no verdicts, no expectations, no
 * interpretation.
 *
 * Three separations are deliberate and each replaces a way the old analyzer
 * went wrong:
 *
 * - CAPABILITY vs COVERAGE, in `completeness`
 * - RETRIEVAL COMPLETENESS vs FIGHT FINALITY, here and in `completeness`
 * - EVENTS vs MALFORMED OBSERVATIONS, so nothing fabricates an envelope
 */

import type { HostilitySelector, EventRetrievalPlanSummary } from "../../wcl/retrieval-plan.js";
import type { IngestionScope } from "../../services/ingestion-scope.js";
import type { ReportRegion } from "../../wcl/fight-context-query.js";
import type { StreamProvenance } from "../../wcl/retrieval-types.js";
import type { CombatAbility } from "./abilities.js";
import type { CombatActor } from "./actors.js";
import type { FightCompleteness } from "./completeness.js";
import type { FriendlySpecializations } from "./friendly-specializations.js";
import type { CombatEvent, MalformedRawObservation } from "./normalized-events.js";

/**
 * Bumped whenever the normalized model changes shape or meaning.
 *
 * Recorded on every fight so a stored result can eventually be traced to the
 * model revision that produced it, without building any history storage now.
 *
 * Shape or meaning includes, for example:
 *
 *   - adding, removing or changing a normalized field — ADDITIVE changes are
 *     shape changes too;
 *   - adding a normalized event variant;
 *   - changing how an existing raw event type is normalized (including a raw
 *     type that used to normalize as `UNSUPPORTED_TYPE`);
 *   - changing the meaning of an existing normalized field.
 *
 * The trigger is the normalized MODEL. A change to evidence-capability records
 * alone does not bump this revision.
 *
 * `m3.2` removed `focusActorId`. The field was written by ingestion and read
 * nowhere, and a single canonical player is not a property a fight retrieved
 * once for several players can honestly claim — `breadth.focusActorIds` already
 * carries the same fact in a form that stays true per view.
 *
 * `m3.3` is the model as it exists after M11-F. It covers every change since
 * `m3.2`: the M10-C4 gear-identity states that replaced the raw enchant and gem
 * ids (a missed bump at the time), M11-E1's `DamageEvent.tickField` and
 * `overkillAmount`, and M11-F's `DEATH` and `RESURRECTION` variants — raw
 * `death` now normalizes as `DEATH` rather than `UNSUPPORTED_TYPE`.
 *
 * `m3.4` (M11-G4-1) adds `report.region` (`Report.region.slug` as KNOWN,
 * NOT_SUPPLIED or NOT_RETRIEVED), an additive shape change.
 *
 * `m3.5` (M13-B) adds `friendlySpecializations`: each friendly player's
 * Warcraft Logs-stated specialization, or why none is established. An additive
 * shape change.
 *
 * `m3.6` (M13-D) adds the optional `completeness.certifiedCoverage`:
 * predicate-scoped coverage a filtered capture earned by an exact table
 * certificate. An additive shape change. Absent means none, and no category's
 * coverage changes; ingestion never sets it.
 */
export const NORMALIZATION_REVISION = "m3.6";

/**
 * Was the FIGHT finished? Entirely separate from whether we RETRIEVED it.
 *
 * `ReportFight.inProgress` is nullable, and a null is recorded as UNKNOWN
 * rather than assumed COMPLETED.
 *
 * This must never be folded into coverage. An in-progress fight whose full
 * requested range was retrieved is COMPLETE coverage AND IN_PROGRESS finality;
 * marking it PARTIAL would claim a retrieval deficiency that did not happen and
 * would hide the deficiency that did.
 */
export type FightFinality = "COMPLETED" | "IN_PROGRESS" | "UNKNOWN";

/** One observed phase transition, from the typed `ReportFight.phaseTransitions`. */
export interface CombatPhase {
  /** 1-indexed and absolute within the fight: equal ids are the same phase. */
  readonly phaseId: number;
  readonly name: string | null;
  readonly isIntermission: boolean | null;
  readonly startTimeMs: number;
  readonly fightTimeMs: number;
}

/**
 * How much friendly breadth was DECLARED in scope.
 *
 * Scope is a declaration, not a fetch shape. The single unfiltered All stream
 * physically contains every friendly actor's events, but an analyzer reading
 * ally state under PLAYER_CONTEXT must still return INSUFFICIENT_SCOPE. Honesty
 * about what was declared beats opportunism about what happens to be present —
 * otherwise "the bytes were lying around" becomes a scope widening nobody
 * derived.
 */
export interface RetrievedBreadth {
  readonly scope: IngestionScope;
  readonly focusActorIds: readonly number[];
  readonly friendlyActorsInScope: readonly number[];
}

export interface IngestionProvenance {
  readonly normalizationRevision: string;
  readonly reportCode: string;
  readonly reportRevision: number;
  /** UNIX ms. Stored once here so wall clock stays derivable without per-event duplication. */
  readonly reportStartTimeUnixMs: number;
  readonly fightId: number;
  readonly logVersion: number;
  readonly gameVersion: number | null;
  readonly retrievedAtUnixMs: number;
  readonly plan: EventRetrievalPlanSummary;
  readonly streams: readonly StreamProvenance[];
  readonly source: "WARCRAFT_LOGS_V2_CLIENT";
  /** Raw type -> count, for types we do not recognise. An early warning signal. */
  readonly unsupportedEventTypes: ReadonlyMap<string, number>;
  /** Raw type -> count, for recognised types whose family fields failed. */
  readonly malformedEventTypes: ReadonlyMap<string, number>;
  /** Observations whose envelope could not be established at all. */
  readonly malformedEnvelopeCount: number;
  readonly hostilityStreams: readonly HostilitySelector[];
}

export interface CombatFight {
  readonly provenance: IngestionProvenance;
  readonly breadth: RetrievedBreadth;
  readonly completeness: FightCompleteness;

  readonly report: {
    readonly code: string;
    readonly revision: number;
    readonly startTimeUnixMs: number;
    readonly endTimeUnixMs: number;
    /** `Report.region` as retrieved (M11-G4-1); NOT_RETRIEVED is never a region. */
    readonly region: ReportRegion;
  };
  readonly data: {
    readonly logVersion: number;
    readonly gameVersion: number | null;
  };
  readonly fight: {
    readonly id: number;
    readonly name: string;
    readonly encounterId: number;
    readonly difficulty: number | null;
    readonly size: number | null;
    readonly kill: boolean | null;
    readonly startTimeMs: number;
    readonly endTimeMs: number;
    readonly durationMs: number;
    readonly finality: FightFinality;
    /** `ReportFight.inProgress` verbatim, alongside the mapping. */
    readonly inProgressRaw: boolean | null;
  };

  readonly actors: ReadonlyMap<number, CombatActor>;
  readonly abilities: ReadonlyMap<number, CombatAbility>;
  /**
   * M13-B: each friendly player's Warcraft Logs-stated specialization (the
   * fight context's `friendlySpecs`), as observed identity. UNKNOWN, with the
   * rule that refused it, when none is established; never inferred from class
   * or casts. Report-context identity like `actors`, so it is held for every
   * friendly player whatever the scope. See `friendly-specializations.ts`.
   */
  readonly friendlySpecializations: FriendlySpecializations;
  /**
   * Factual string from `ReportFight.talentImportCode`. NOT parsed in M3.
   *
   * It describes the ONE actor in `breadth.focusActorIds`, because
   * `talentImportCode(actorID:)` is per-actor. A fight retrieved once and viewed
   * for several players therefore carries the code only in the view of the
   * player it was requested for; every other view holds `null`, which is this
   * field's existing "Warcraft Logs supplied none". See `fight-core.ts`.
   */
  readonly talentImportCode: string | null;

  readonly phases: readonly CombatPhase[];

  /** Retrieval order. Never re-sorted, never deduplicated. */
  readonly events: readonly CombatEvent[];
  /** Observations with no establishable envelope. Never in `events`. */
  readonly malformedObservations: readonly MalformedRawObservation[];
}

export function mapFinality(inProgress: boolean | null): FightFinality {
  if (inProgress === null) {
    return "UNKNOWN";
  }
  return inProgress ? "IN_PROGRESS" : "COMPLETED";
}
