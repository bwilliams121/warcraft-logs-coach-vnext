/**
 * Internal encounter-context analysis -> `encounter-context/1`.
 *
 * PROJECTION ONLY. Nothing here recomputes a progression sequence, re-derives a
 * comparability verdict, re-tallies recurrence or reinterprets a cell. Every
 * value is carried across from a domain that already decided it — M8-D for
 * progression, M8-B for comparability, M8-F for references, M7 for cells — so a
 * disagreement between the document and the domain is not representable.
 *
 * PURE AND DETERMINISTIC. No clock, no generated id, no sort of its own: the
 * orders are the canonical ones the domains produced, and this function walks
 * them in place.
 */

import type { AnalysisComparabilityAssessment } from "../comparison/analysis-comparability.js";
import type { PullComparabilityAssessment } from "../comparison/pull-comparability.js";
import type { EncounterOutcomeFacts, ZoneMetadata } from "../engine/normalization/encounter-facts.js";
import type { QualifiedExternalReference } from "../external-context/candidate-qualification.js";
import type {
  EncounterProgression,
  ProgressionPull,
  RaidNightProgression,
  UnresolvedPull,
} from "../progression/encounter-progression.js";
import type { EncounterContextAnalysis } from "../services/encounter-context-runner.js";
import {
  ENCOUNTER_CONTEXT_CAPABILITY,
  PUBLIC_ENCOUNTER_CONTEXT_SCHEMA_VERSION,
  type PublicEncounterContextResult,
  type PublicEncounterProgression,
  type PublicExternalReference,
  type PublicExternalReferenceSection,
  type PublicPull,
  type PublicUnresolvedPull,
} from "./encounter-context-contract.js";
import type { PublicCell } from "./raid-night-contract.js";
import { projectCell, projectRecurrence } from "./raid-night-projection.js";

function projectZone(zone: ZoneMetadata | null) {
  return zone === null
    ? null
    : {
        id: zone.id,
        name: zone.name,
        frozen: zone.frozen,
        expansion: zone.expansion === null ? null : { id: zone.expansion.id, name: zone.expansion.name },
      };
}

/**
 * The two phase integers and the intermission flag, carried apart.
 *
 * `bossPercentageRaw` and `fightPercentageRaw` are DELIBERATELY NOT PUBLISHED.
 * M8-C established that their scale is unproven and, worse, that their direction
 * is counter-intuitive: both read `0.04` on a fight whose `kill` was `true`. A
 * consumer seeing a number called a percentage will read it as progress, and
 * there is no wording available that reliably prevents that. They remain
 * available internally on `EncounterOutcomeFacts` for a later checkpoint that
 * can settle the semantics; publishing them now would trade real confusion for
 * no product value.
 *
 * `wipeCalledReportTimeMs` is likewise held back: M8-C's correction established
 * that a normalized `null` there carries no recoverable reason, so a public
 * field would invite exactly the inference that correction forbade.
 */
function projectPhaseSummary(facts: EncounterOutcomeFacts) {
  return {
    lastPhase: facts.lastPhase,
    lastPhaseAsAbsoluteIndex: facts.lastPhaseAsAbsoluteIndex,
    lastPhaseIsIntermission: facts.lastPhaseIsIntermission,
  };
}

function projectPull(pull: ProgressionPull): PublicPull {
  const change = pull.changeFromPrevious;
  return {
    fightId: pull.fightId,
    startTimeMs: pull.startTimeMs,
    durationMs: pull.durationMs,
    outcome: pull.outcome,
    raidSize: pull.raidSize,
    processingOutcome: pull.processingOutcome,
    phaseSummary: pull.encounterFacts === null ? null : projectPhaseSummary(pull.encounterFacts),
    changeFromPrevious:
      change === null
        ? null
        : {
            fromFightId: change.fromFightId,
            toFightId: change.toFightId,
            fromDurationMs: change.fromDurationMs,
            toDurationMs: change.toDurationMs,
            durationChange: change.durationChange,
            durationDeltaMs: change.durationDeltaMs,
            fromOutcome: change.fromOutcome,
            toOutcome: change.toOutcome,
            outcomeChange: change.outcomeChange,
          },
  };
}

function projectAnalysisComparability(assessment: AnalysisComparabilityAssessment | null) {
  return assessment === null
    ? null
    : {
        comparability: assessment.comparability,
        reason: assessment.reason,
        differingFields: [...assessment.differingFields],
      };
}

function projectComparability(assessment: PullComparabilityAssessment) {
  return {
    comparability: assessment.comparability,
    encounter: {
      compatibility: assessment.encounter.compatibility,
      reason: assessment.encounter.reason,
    },
    difficulty: {
      compatibility: assessment.difficulty.compatibility,
      reason: assessment.difficulty.reason,
    },
    version: {
      compatibility: assessment.version.compatibility,
      basis: assessment.version.basis,
      differingFields: [...assessment.version.differingFields],
      unresolvedFields: [...assessment.version.unresolvedFields],
    },
    caveats: [...assessment.caveats],
    incompatibleDimensions: [...assessment.incompatibleDimensions],
    unresolvedDimensions: [...assessment.unresolvedDimensions],
  };
}

function projectEncounter(encounter: EncounterProgression, reportCode: string): PublicEncounterProgression {
  return {
    encounterId: encounter.identity.encounterId,
    difficulty: encounter.identity.difficulty,
    zone: projectZone(encounter.identity.zone),
    pulls: encounter.pulls.map(projectPull),
    players: encounter.players.map((player) => ({
      playerKey: player.playerKey,
      sourceId: player.sourceId,
      points: player.points.map((point) => ({
        fightId: point.fightId,
        // M7's own cell projection, reused rather than restated.
        cell: projectCell(reportCode, point.cell) as PublicCell,
        analysisComparabilityToPrevious: projectAnalysisComparability(point.analysisComparabilityToPrevious),
      })),
      fightsPresent: player.fightsPresent,
      fightsAbsent: player.fightsAbsent,
      pullsWithoutCell: [...player.pullsWithoutCell],
    })),
    recurrence: projectRecurrence(encounter.recurrence),
  };
}

function projectUnresolvedPull(pull: UnresolvedPull): PublicUnresolvedPull {
  return {
    fightId: pull.fightId,
    startTimeMs: pull.startTimeMs,
    encounterReason: pull.selfComparability.encounter.reason,
    difficultyReason: pull.selfComparability.difficulty.reason,
    unresolvedDimensions: [...pull.selfComparability.unresolvedDimensions],
  };
}

function projectReference(reference: QualifiedExternalReference): PublicExternalReference {
  const { descriptor, provenance } = reference;
  return {
    // Established identity. NOT a comparability claim — `comparability` below
    // answers that separately, and currently answers UNKNOWN.
    qualification: "QUALIFIED",
    reportCode: provenance.reportCode,
    reportRevision: provenance.reportRevision,
    fightId: provenance.fightId,
    // Non-null by construction on a qualified reference: M8-F fails the
    // candidate when resolution is not unique.
    sourceId: provenance.sourceId ?? -1,
    playerName: descriptor.playerName,
    className: descriptor.className,
    specName: descriptor.specName,
    serverName: descriptor.serverName,
    serverRegion: descriptor.serverRegion,
    encounterId: reference.encounterId,
    difficulty: reference.difficulty,
    durationMs: reference.durationMs,
    kill: reference.kill,
    raidSize: descriptor.raidSize,
    bracketData: descriptor.bracketData,
    hardModeLevel: descriptor.hardModeLevel,
    gameVersion: provenance.gameVersion,
    logVersion: provenance.logVersion,
    phaseSummary: projectPhaseSummary(reference.encounterFacts),
    zone: projectZone(reference.zone),
    comparability: projectComparability(reference.comparability),
  };
}

function projectExternal(external: EncounterContextAnalysis["external"]): PublicExternalReferenceSection {
  if (external.kind === "SKIPPED") {
    return { status: external.reason };
  }

  const discovery = external.discovery;
  if (discovery.outcome === "POOL_UNKNOWN") {
    // Each retrieval failure keeps its own status. None of them is an empty
    // pool, and none of them says anything about whether references exist.
    if (discovery.reason === "RANKING_REQUEST_REJECTED") {
      return { status: "REQUEST_REJECTED", message: discovery.message ?? "" };
    }
    return discovery.reason === "ENCOUNTER_NOT_FOUND"
      ? { status: "ENCOUNTER_NOT_FOUND" }
      : { status: "PAYLOAD_UNRECOGNISED" };
  }

  const { provenance } = discovery.selection;
  return {
    // A discovery RAN. `qualified` may be empty, and that is a different fact
    // from any failure above.
    status: "COMPLETED",
    provenance: {
      source: provenance.source,
      encounterId: provenance.encounterId,
      difficulty: provenance.difficulty,
      className: provenance.className,
      specName: provenance.specName,
      metric: provenance.metric,
      partition:
        provenance.partition.kind === "EXPLICIT"
          ? { mode: "PINNED", partition: provenance.partition.partition }
          : { mode: "LATEST" },
      page: provenance.page,
      reportedCount: provenance.reportedCount,
      hasMorePages: provenance.hasMorePages,
      rowsDecoded: provenance.rowsDecoded,
      rowsEligible: provenance.rowsEligible,
    },
    qualified: discovery.qualified.map(projectReference),
    failures: discovery.failures.map((failure) => ({
      reportCode: failure.reportCode,
      fightId: failure.fightId,
      reason: failure.reason,
    })),
    ineligible: discovery.selection.ineligible.map((row) => ({
      reportCode: row.reportCode,
      fightId: row.fightId,
      reason: row.reason,
    })),
  };
}

export function projectEncounterContextResult(
  analysis: EncounterContextAnalysis,
): PublicEncounterContextResult {
  const progression: RaidNightProgression = analysis.progression;
  return {
    schemaVersion: PUBLIC_ENCOUNTER_CONTEXT_SCHEMA_VERSION,
    capability: ENCOUNTER_CONTEXT_CAPABILITY,
    identity: {
      reportCode: progression.identity.reportCode,
      reportRevision: progression.identity.reportRevision,
      logVersion: progression.identity.logVersion,
      gameVersion: progression.identity.gameVersion,
      reportStartTimeUnixMs: progression.identity.reportStartTimeUnixMs,
      reportEndTimeUnixMs: progression.identity.reportEndTimeUnixMs,
      includedFightIds: [...progression.identity.includedFightIds],
    },
    encounters: progression.encounters.map((encounter) =>
      projectEncounter(encounter, progression.identity.reportCode),
    ),
    unresolvedPulls: progression.unresolvedPulls.map(projectUnresolvedPull),
    externalReferences: projectExternal(analysis.external),
  };
}
