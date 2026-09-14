/**
 * Projecting an application analysis into the public contract.
 *
 * ONE DIRECTION, ENFORCED BY POSITION IN THE TREE:
 *
 *     M5 / engine
 *          ^
 *     src/services      (application composition — knows nothing of this file)
 *          ^
 *     src/contracts     (you are here: reads domain types, publishes a shape)
 *          ^
 *     MCP / REST        (later: consume the published shape)
 *
 * This module may read application-domain types. Nothing below it may read
 * this module, which is what keeps the service free of a wire schema and lets
 * the public contract change without touching the analyzer.
 *
 * IT HAS NO ACCESS TO ANYTHING DANGEROUS. The projection takes an analysis
 * result and returns data. It does not receive `Env`, cannot read a credential,
 * performs no I/O, and reads no clock — so there is no path by which a secret,
 * a request id or a timestamp could reach the public payload.
 *
 * EVERY FIELD IS COPIED BY NAME. No spreads from internal objects, no
 * `as PublicThing` casts over an internal shape. It is tedious on purpose: a
 * field reaches the public contract because someone wrote it here, not because
 * it happened to exist upstream. That is the difference between publishing a
 * result and leaking one.
 */

import type { EvidenceLocator } from "../engine/evidence/locator.js";
import { assertNever, type FightAnalysis } from "../services/result.js";
import type { SpecAnalysis } from "../services/analyzer-registry.js";
import {
  CAPABILITY,
  PUBLIC_ANALYSIS_SCHEMA_VERSION,
  PublicAnalysisResultSchema,
  type PublicAnalysisResult,
  type PublicCoverage,
  type PublicDecision,
  type PublicEvidenceLocator,
  type PublicExclusion,
  type PublicIdentity,
} from "./analysis-contract.js";

function projectLocator(locator: EvidenceLocator): PublicEvidenceLocator {
  return {
    streamId: locator.streamId,
    pageOrdinal: locator.pageOrdinal,
    indexInPage: locator.indexInPage,
    ingestionOrdinal: locator.ingestionOrdinal,
    rawType: locator.rawType,
    reportTimeMs: locator.reportTimeMs,
  };
}

function projectIdentity(analysis: FightAnalysis): PublicIdentity {
  const { identity } = analysis;
  return {
    report: { code: identity.report.code, revision: identity.report.revision },
    fight: {
      id: identity.fight.id,
      name: identity.fight.name,
      encounterId: identity.fight.encounterId,
      difficulty: identity.fight.difficulty,
      // Renamed to state the unit. Values unchanged.
      startTimeMs: identity.fight.startTime,
      endTimeMs: identity.fight.endTime,
    },
    player: {
      sourceId: identity.player.sourceId,
      name: identity.player.name,
      // The factual Warcraft Logs strings, published even when the engine has
      // no internal name for the specialization. That is how an unsupported
      // spec stays identifiable without being fabricated into a `SpecId`.
      className: identity.player.className,
      specName: identity.player.specName,
    },
    data: { logVersion: identity.data.logVersion, gameVersion: identity.data.gameVersion },
  };
}

/**
 * Common fields, identical across every status.
 *
 * `gameplaySupported` is derived from whether an analyzer actually ran, not
 * from whether the analysis succeeded. A supported specialization whose
 * authority artifact was unavailable is still supported — the evidence failed,
 * not the coverage — and conflating the two would misreport a temporary
 * condition as a permanent limitation.
 */
function projectCommon(analysis: FightAnalysis) {
  return {
    schemaVersion: PUBLIC_ANALYSIS_SCHEMA_VERSION,
    identity: projectIdentity(analysis),
    specialization: {
      specId: analysis.specId,
      gameplaySupported: analysis.analyzerId !== null,
    },
    capability: CAPABILITY,
    analyzerId: analysis.analyzerId,
    // `analysis.scope` is NOT projected. It is ingestion orchestration — which
    // evidence to fetch — and publishing it would let a retrieval setting be
    // read as analysis completeness. The coverage block is what discloses that.
  } as const;
}

function projectDecisions(
  analysis: Extract<SpecAnalysis, { status: "ANALYZED" }>,
): readonly PublicDecision[] {
  return analysis.comparisons.map((comparison) => ({
    locator: projectLocator(comparison.decision.locator),
    position: comparison.decision.position,
    fightTimeMs: comparison.decision.fightTimeMs,
    targetActorId: comparison.decision.targetActorId,
    observedAbilityGameId: comparison.decision.abilityGameId,
    observedToken: comparison.decision.observedToken,
    outcome: comparison.outcome,
    basis: comparison.basis,
    authorityCoverage: comparison.authorityCoverage,
    authorityToken: comparison.authorityToken,
    selectionPrecision: comparison.selectionPrecision,
    decisiveBlocker: comparison.decisiveBlocker,
    usabilityProvenance: comparison.usabilityProvenance,
    // `comparison.observedActionRejected` is NOT projected. Internally it is a
    // boolean over a three-state judgment that has no positive result, so its
    // `false` means "rejection was not proven" — not "not rejected". Publishing
    // it would turn UNKNOWN into a negative claim the engine never made. When
    // that rule DID fire, the comparison already carries
    // `basis: "OBSERVED_ACTION_REJECTED_BY_AUTHORITY"`, which is the same fact
    // stated positively.
    //
    // `comparison.rawBlocker` is NOT projected: it is the engine's own note
    // about where a scan stopped, and `decisiveBlocker` is the stable answer.
    //
    // `comparison.decision.actorId` is NOT projected either: it is the analyzed
    // player and is already `identity.player.sourceId`, constant across every
    // decision. Repeating it per decision would invite a reader to wonder when
    // it might differ.
  }));
}

function projectExclusions(
  analysis: Extract<SpecAnalysis, { status: "ANALYZED" }>,
): readonly PublicExclusion[] {
  return analysis.excluded.map((cast) => ({
    locator: projectLocator(cast.locator),
    position: cast.position,
    abilityGameId: cast.abilityGameId,
    reportTimeMs: cast.reportTimeMs,
    reason: cast.reason,
  }));
}

function projectCoverage(analysis: Extract<SpecAnalysis, { status: "ANALYZED" }>): PublicCoverage {
  const { coverage } = analysis;
  return {
    eligibleDecisions: coverage.eligibleDecisions,
    match: coverage.match,
    rejected: coverage.rejected,
    unknown: coverage.unknown,
    resolvedComparisons: coverage.resolvedComparisons,
    exactEntryMatches: coverage.exactEntryMatches,
    tokenConvergedMatches: coverage.tokenConvergedMatches,
    // Tallies are rebuilt element by element rather than passed through, so a
    // future extra field on the internal tally cannot ride along.
    selectionPrecision: coverage.selectionPrecision.map((row) => ({ key: row.key, count: row.count })),
    unknownBases: coverage.unknownBases.map((row) => ({ key: row.key, count: row.count })),
    unknownBlockerClasses: coverage.unknownBlockerClasses.map((row) => ({
      key: row.key,
      count: row.count,
    })),
    exclusions: coverage.exclusions.map((row) => ({ key: row.key, count: row.count })),
    excludedCastCount: coverage.excludedCastCount,
    // `coverage.actorId` is NOT projected: same reasoning as the per-decision
    // actor id — it is identity, and it is already published once.
  };
}

/**
 * Projects one application analysis result into the public contract.
 *
 * TOTAL OVER EVERY ANALYSIS STATUS. The switch is exhaustive and ends in
 * `assertNever`, so adding a status to the analysis vocabulary becomes a
 * compile error here. A new state cannot reach the wire without somebody
 * deciding what it should look like.
 *
 * THE RESULT IS VALIDATED BEFORE IT IS RETURNED. Not as input sanitisation —
 * the input is trusted domain data — but because a projection bug is otherwise
 * invisible until a consumer chokes on it. `parse` throws on mismatch, and
 * that throw is correct: an invalid public shape is an internal defect, not a
 * condition to be downgraded into `UNKNOWN` or an empty result. How a transport
 * reports such a defect is M6-D/M6-E's decision, not this layer's.
 */
export function projectAnalysisResult(analysis: FightAnalysis): PublicAnalysisResult {
  const common = projectCommon(analysis);
  const result = analysis.analysis;

  switch (result.status) {
    case "ANALYZED":
      return PublicAnalysisResultSchema.parse({
        ...common,
        status: "ANALYZED",
        authority: {
          authorityId: result.authority.authorityId,
          artifactRevision: result.authority.artifactRevision,
          repository: result.authority.repository,
          branch: result.authority.branch,
          commitSha: result.authority.commitSha,
          sourcePath: result.authority.sourcePath,
          sourceSha256: result.authority.sourceSha256,
          specName: result.authority.specName,
          className: result.authority.className,
        },
        decisions: projectDecisions(result),
        exclusions: projectExclusions(result),
        coverage: projectCoverage(result),
      });

    // The four non-analyzed states share a shape because the analyzer produces
    // one: each carries an author-written `detail` and nothing else. They are
    // listed individually rather than grouped so that a future status with
    // different content cannot be absorbed silently by a catch-all branch.
    case "SPEC_NOT_SUPPORTED":
    case "AUTHORITY_NOT_AVAILABLE":
    case "PROFILE_NOT_RESOLVED":
    case "INSUFFICIENT_EVIDENCE":
      return PublicAnalysisResultSchema.parse({
        ...common,
        status: result.status,
        detail: result.detail,
      });

    default:
      return assertNever(result);
  }
}
