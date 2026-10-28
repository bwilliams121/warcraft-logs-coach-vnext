/**
 * Small deterministic fixtures for the aggregation domain.
 *
 * DELIBERATELY TINY. The production single-fight result is roughly 456 KB, and
 * committing one would bloat the repository to demonstrate semantics that a
 * handful of decisions already demonstrate. These builders construct exactly the
 * shape under test and nothing more.
 *
 * Nothing here reaches Warcraft Logs, constructs combat state, or runs an
 * analyzer. Every value is supplied.
 */

import type { FightAnalysis } from "../../src/services/result.js";
import type { UnanalyzedStatus } from "../../src/findings/analysis-envelope.js";
import type { FightIdentity } from "../../src/wcl/types.js";
import type { ReportRosterSnapshot, RosterFight, RosterPlayer } from "../../src/wcl/roster-snapshot.js";
import type { ObservedActionComparison } from "../../src/specs/rogue/assassination/observed-comparison.js";
import type {
  ExcludedObservedCast,
  ObservedAssassinationAnalysis,
  ObservedDecisionCoverage,
} from "../../src/specs/rogue/assassination/observed-analysis.js";
import { assassinationObservedDecisionView } from "../../src/specs/rogue/assassination/registration.js";
import type { EvidenceLocator } from "../../src/engine/evidence/locator.js";
import { CURRENT_UNSUPPORTED_SUBJECT } from "./unsupported-subject.js";

export const REPORT_CODE = "aBcDeFgH12345678";
export const REVISION = 30;
/** The repository's current normalization revision; a test pins it to the production constant. */
export const NORMALIZATION_REVISION = "m3.4";

function locator(ordinal: number): EvidenceLocator {
  return {
    streamId: "all",
    pageOrdinal: 0,
    indexInPage: ordinal,
    ingestionOrdinal: ordinal,
    rawType: "cast",
    reportTimeMs: 1000 + ordinal,
  };
}

/** One comparison, with only the fields the projection reads made interesting. */
export function comparison(options: {
  readonly outcome: ObservedActionComparison["outcome"];
  readonly basis: ObservedActionComparison["basis"];
  readonly observedToken: string;
  readonly ordinal?: number;
  readonly decisiveBlocker?: ObservedActionComparison["decisiveBlocker"];
  readonly selectionPrecision?: ObservedActionComparison["selectionPrecision"];
  readonly authorityCoverage?: ObservedActionComparison["authorityCoverage"];
}): ObservedActionComparison {
  const ordinal = options.ordinal ?? 0;
  return {
    decision: {
      position: ordinal,
      locator: locator(ordinal),
      actorId: 19,
      abilityGameId: 703,
      observedToken: options.observedToken,
      reportTimeMs: 1000 + ordinal,
      fightTimeMs: ordinal,
      targetActorId: 21,
    },
    outcome: options.outcome,
    basis: options.basis,
    authorityCoverage: options.authorityCoverage ?? "UNKNOWN",
    authorityToken: null,
    selectionPrecision: options.selectionPrecision ?? null,
    decisiveBlocker: options.decisiveBlocker ?? null,
    // Internals the projection must strip. Given deliberately conspicuous
    // values so a leak is obvious in a failing assertion.
    rawBlocker: "LEAKED_RAW_BLOCKER",
    usabilityProvenance: "OBSERVED_EXECUTION",
    observedActionRejected: options.outcome === "REJECTED",
  };
}

export function excludedCast(options: {
  readonly reason: ExcludedObservedCast["reason"];
  readonly abilityGameId: number;
  readonly ordinal?: number;
}): ExcludedObservedCast {
  const ordinal = options.ordinal ?? 0;
  return {
    position: ordinal,
    locator: locator(ordinal),
    abilityGameId: options.abilityGameId,
    reportTimeMs: 1000 + ordinal,
    reason: options.reason,
  };
}

export function identityFor(options: {
  readonly fightId: number;
  readonly sourceId: number;
  readonly specName?: string;
  readonly name?: string;
  readonly className?: string;
  readonly encounterId?: number;
  readonly difficulty?: number | null;
}): FightIdentity {
  return {
    report: {
      code: REPORT_CODE,
      revision: REVISION,
      startTime: 1_700_000_000_000,
      endTime: 1_700_000_900_000,
    },
    data: { logVersion: 17, gameVersion: 1 },
    fight: {
      id: options.fightId,
      name: `Fight ${String(options.fightId)}`,
      encounterId: options.encounterId ?? 2900,
      difficulty: options.difficulty === undefined ? 5 : options.difficulty,
      startTime: 1000,
      endTime: 5000,
    },
    player: {
      sourceId: options.sourceId,
      name: options.name ?? `Player${String(options.sourceId)}`,
      className: options.className ?? "Rogue",
      specName: options.specName ?? "Assassination",
    },
  };
}

/**
 * Builds a coverage object that satisfies every M5-E invariant.
 *
 * Derived from the supplied comparisons rather than hand-written, so a fixture
 * cannot accidentally assert reconciliation it does not actually have.
 */
function coverageFor(
  sourceId: number,
  comparisons: readonly ObservedActionComparison[],
  excluded: readonly ExcludedObservedCast[],
): ObservedDecisionCoverage {
  const match = comparisons.filter((entry) => entry.outcome === "MATCH");
  const rejected = comparisons.filter((entry) => entry.outcome === "REJECTED").length;
  const unknown = comparisons.filter((entry) => entry.outcome === "UNKNOWN");

  const tally = <T extends string>(keys: readonly T[]): readonly { key: T; count: number }[] => {
    const counts = new Map<T, number>();
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
    return [...counts.entries()].map(([key, count]) => ({ key, count }));
  };

  return {
    actorId: sourceId,
    eligibleDecisions: comparisons.length,
    match: match.length,
    rejected,
    unknown: unknown.length,
    resolvedComparisons: match.length + rejected,
    exactEntryMatches: match.filter((entry) => entry.selectionPrecision === "EXACT_ENTRY").length,
    tokenConvergedMatches: match.filter((entry) => entry.selectionPrecision === "TOKEN_CONVERGED").length,
    selectionPrecision: tally(comparisons.map((entry) => entry.authorityCoverage)),
    unknownBases: tally(unknown.map((entry) => entry.basis)),
    unknownBlockerClasses: tally(
      unknown.flatMap((entry) => (entry.decisiveBlocker === null ? [] : [entry.decisiveBlocker])),
    ),
    exclusions: tally(excluded.map((cast) => cast.reason)),
    excludedCastCount: excluded.length,
  };
}

export function analyzedFightAnalysis(options: {
  readonly fightId: number;
  readonly sourceId: number;
  readonly comparisons: readonly ObservedActionComparison[];
  readonly excluded?: readonly ExcludedObservedCast[];
  readonly specName?: string;
  readonly name?: string;
  readonly authorityCommitSha?: string;
  readonly artifactRevision?: string;
}): FightAnalysis {
  const excluded = options.excluded ?? [];
  const analysis: Extract<ObservedAssassinationAnalysis, { status: "ANALYZED" }> = {
    status: "ANALYZED",
    specId: "rogue/assassination",
    authority: {
      authorityId: "simc-rogue-assassination",
      artifactRevision: options.artifactRevision ?? "r1",
      repository: "simulationcraft/simc",
      branch: "thewarwithin",
      commitSha: options.authorityCommitSha ?? "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
      sourcePath: "engine/class_modules/apl/apl_rogue.cpp",
      sourceSha256: "abc123",
      specName: "Assassination",
      className: "Rogue",
    },
    comparisons: options.comparisons,
    excluded,
    coverage: coverageFor(options.sourceId, options.comparisons, excluded),
  };
  return {
    identity: identityFor(options),
    specId: "rogue/assassination",
    analyzerId: "rogue-assassination-observed-decisions",
    scope: "PLAYER_CONTEXT",
    analysis,
    // The registration's own view, as the service attaches it.
    observedDecisions: assassinationObservedDecisionView(analysis),
  };
}

export function nonAnalyzedFightAnalysis(options: {
  readonly fightId: number;
  readonly sourceId: number;
  readonly status: UnanalyzedStatus;
  readonly specName?: string;
  readonly name?: string;
  readonly className?: string;
  readonly detail?: string;
}): FightAnalysis {
  const supported = options.status !== "SPEC_NOT_SUPPORTED";
  return {
    identity: identityFor(options),
    // An unsupported specialization has no recognised internal id and no
    // analyzer; the others were selected and then could not conclude.
    specId: supported ? "rogue/assassination" : null,
    analyzerId: supported ? "rogue-assassination-observed-decisions" : null,
    scope: supported ? "PLAYER_CONTEXT" : null,
    analysis: {
      status: options.status,
      // The OBSERVED identity string on an unsupported envelope: Warrior/Arms,
      // the canonical unsupported specialization since M10-D.
      specId: supported ? "rogue/assassination" : CURRENT_UNSUPPORTED_SUBJECT.observedSpecId,
      detail: options.detail ?? `no analysis: ${options.status}`,
    },
    observedDecisions: null,
  };
}

// ---------------------------------------------------------------------------
// Roster snapshots
// ---------------------------------------------------------------------------

export function rosterPlayerFor(options: {
  readonly sourceId: number;
  readonly name?: string;
  readonly className?: string;
}): RosterPlayer {
  return {
    sourceId: options.sourceId,
    name: options.name ?? `Player${String(options.sourceId)}`,
    className: options.className ?? "Rogue",
    server: "Testrealm",
  };
}

export function rosterFightFor(options: {
  readonly fightId: number;
  readonly participants: readonly { readonly sourceId: number; readonly specName: string | null }[];
  readonly encounterId?: number;
  readonly difficulty?: number | null;
  readonly kill?: boolean | null;
  readonly startTimeMs?: number;
  readonly endTimeMs?: number;
}): RosterFight {
  return {
    fightId: options.fightId,
    name: `Fight ${String(options.fightId)}`,
    encounterId: options.encounterId ?? 2900,
    difficulty: options.difficulty === undefined ? 5 : options.difficulty,
    size: 20,
    kill: options.kill === undefined ? true : options.kill,
    startTimeMs: options.startTimeMs ?? 1000,
    endTimeMs: options.endTimeMs ?? 5000,
    participants: [...options.participants].sort((left, right) => left.sourceId - right.sourceId),
  };
}

export function snapshotFor(options: {
  readonly players: readonly RosterPlayer[];
  readonly fights: readonly RosterFight[];
  readonly requestedFightIds?: readonly number[];
}): ReportRosterSnapshot {
  const includedFightIds = options.fights.map((fight) => fight.fightId).sort((a, b) => a - b);
  const requestedFightIds = [...(options.requestedFightIds ?? includedFightIds)].sort((a, b) => a - b);
  return {
    identity: {
      reportCode: REPORT_CODE,
      reportRevision: REVISION,
      logVersion: 17,
      gameVersion: 1,
      reportStartTimeUnixMs: 1_700_000_000_000,
      reportEndTimeUnixMs: 1_700_000_900_000,
      includedFightIds,
    },
    players: [...options.players].sort((left, right) => left.sourceId - right.sourceId),
    fights: [...options.fights].sort((left, right) => left.fightId - right.fightId),
    requestedFightIds,
    missingRequestedFightIds: requestedFightIds.filter((id) => !includedFightIds.includes(id)),
  };
}
