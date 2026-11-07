/**
 * The observed-decision view — what a projector may read of an analysis.
 *
 * WHAT THIS IS
 *
 * The ANALYZED payload of public schema `warcraft-logs-coach.analysis/1`,
 * restated as internal data: one record per compared observed decision, one
 * per excluded cast, and the coverage block. It is what the public projection
 * and the raid-night cell projection consume, and it is supplied by the
 * analyzer's REGISTRATION through an adapter the specialization owns.
 *
 * WHAT THIS IS NOT
 *
 * Not the analyzer's result. Assassination's `ObservedActionComparison` carries
 * more — the raw engine blocker, the three-state rejection flag, the decision's
 * actor — and none of that crosses into this view. The view is the boundary at
 * which a specialization decides what its analysis looks like to shared code,
 * and shared code cannot reach past it.
 *
 * WHY THE VOCABULARY FIELDS ARE PLAIN STRINGS
 *
 * `outcome`, `basis`, `authorityCoverage`, `decisiveBlocker`, `reason` and the
 * tally keys are owned by the specialization that produced them and FROZEN by
 * the public schema, which validates every value at the wire (`zod.parse`) and
 * whose enums a contract test pins to the Assassination unions. Declaring the
 * unions a second time here would be a third copy of one vocabulary; typing
 * them as strings keeps ownership where it is and validation where it already
 * was. Nothing below the contract branched on these values before M10-A, and
 * nothing does now — the raid-night projection keys on them opaquely.
 *
 * `MATCH` MEANS AUTHORITY-COMPATIBLE ONLY, HERE AS EVERYWHERE. A view carries
 * no correctness vocabulary and no score.
 *
 * WHERE A DECISION'S ENCOUNTER STATE CAME FROM (SIMC-FB-B). A record's
 * `simcProfileFacts` are the tier-3 facts bound when it was evaluated
 * (`EncounterStateResolution.profileFacts`). Non-empty means the decision is
 * SimC-profile-relative: it answers "under the pinned profile, what would the
 * priority select here?", and says nothing about what the real encounter held.
 * Absent means no tier-3 fact was bound, so nothing about it rests on the
 * profile. The label is on what was bound, not on which lines the scan read, so
 * it can over-disclose and cannot under-disclose. A specialization that reads
 * the fallback must carry its facts here; a guard test pins that.
 */

import type { EvidenceLocator } from "../engine/evidence/locator.js";

export interface ObservedDecisionRecord {
  readonly locator: EvidenceLocator;
  /** Canonical index in the normalized fight. Never an ingestion ordinal. */
  readonly position: number;
  readonly fightTimeMs: number;
  /** The enemy this decision was about, where the event established one. */
  readonly targetActorId: number | null;
  readonly observedAbilityGameId: number;
  /** The authority's own token the observed ability binds to. */
  readonly observedToken: string;
  readonly outcome: string;
  readonly basis: string;
  readonly authorityCoverage: string;
  readonly authorityToken: string | null;
  readonly selectionPrecision: string | null;
  readonly decisiveBlocker: string | null;
  readonly usabilityProvenance: string;
  /** See the header. Absent on every decision of a list that does not read the fallback. */
  readonly simcProfileFacts?: readonly SimcProfileFactRecord[];
}

/** One engine statement a tier-3 fact rests on, as the pinned record cites it. */
interface SimcProfileSemanticRecord {
  readonly semanticId: string;
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly excerptSha256: string;
}

/**
 * One tier-3 binding, restated as plain data. `SimcProfileProvenance` is
 * assignable to it (checked where that type is declared), so this module still
 * imports nothing but the locator, and the projectors stay free of the fallback.
 */
interface SimcProfileFactRecord {
  readonly category: "SIMC_PROFILE_FALLBACK";
  readonly fact: string;
  readonly atomKey: string | null;
  readonly datasetId: string;
  readonly datasetRevision: string;
  readonly simcCommit: string;
  readonly clientBuild: string;
  readonly environmentCommit: string;
  readonly aplAuthorityId: string;
  readonly profilePath: string;
  readonly profileSha256: string;
  readonly environment: {
    readonly fightStyle: string;
    readonly targetCount: number;
    readonly raidEventCount: number;
    readonly distanceTargetingEnabled: boolean;
  };
  readonly semantic: SimcProfileSemanticRecord;
}

export interface ExcludedCastRecord {
  readonly locator: EvidenceLocator;
  readonly position: number;
  readonly abilityGameId: number;
  readonly reportTimeMs: number;
  readonly reason: string;
}

export interface ViewTally {
  readonly key: string;
  readonly count: number;
}

/**
 * The coverage block, exactly as schema v1 publishes it.
 *
 * Every field is a count over the decisions and exclusions in the same view, and
 * the cell projection re-checks that arithmetic before aggregating.
 */
export interface ObservedDecisionCoverageRecord {
  readonly eligibleDecisions: number;
  readonly match: number;
  readonly rejected: number;
  readonly unknown: number;
  readonly resolvedComparisons: number;
  readonly exactEntryMatches: number;
  readonly tokenConvergedMatches: number;
  readonly selectionPrecision: readonly ViewTally[];
  readonly unknownBases: readonly ViewTally[];
  readonly unknownBlockerClasses: readonly ViewTally[];
  readonly exclusions: readonly ViewTally[];
  readonly excludedCastCount: number;
}

export interface ObservedDecisionView {
  readonly decisions: readonly ObservedDecisionRecord[];
  readonly exclusions: readonly ExcludedCastRecord[];
  readonly coverage: ObservedDecisionCoverageRecord;
}
