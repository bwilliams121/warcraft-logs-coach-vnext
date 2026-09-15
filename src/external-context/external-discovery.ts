/**
 * One bounded external discovery: one ranking page, then at most five metadata
 * lookups.
 *
 * THE COST CEILING IS STRUCTURAL, NOT ADVISORY
 *
 *     1 ranking page          MAX_CANDIDATE_PAGES, and there is no loop
 *   + <= 5 metadata lookups   MAX_QUALIFIED_CANDIDATES, enforced by `slice`
 *   = <= 6 GraphQL requests per discovery
 *
 * There is no pagination cursor anywhere in this domain, no recent-report
 * traversal, no retry loop and no event page. Each qualification is exactly one
 * `CANDIDATE_METADATA_QUERY` round trip — verified by a test that counts calls
 * on a recording transport rather than by reading this comment.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 * It does not touch local progression. M8-D computes that from the raid-night
 * aggregate with no reference to this module, so external discovery cannot
 * degrade it — a property asserted by comparing local output across success,
 * empty pool, partial failure, total failure and omission.
 *
 * It also does not decide comparability. It calls M8-B and reports what M8-B
 * said, which across reports is UNKNOWN.
 */

import type { PullContext } from "../comparison/pull-identity.js";
import type { WclCredentials } from "../config/env.js";
import type { RawFightContextReport } from "../wcl/fight-context-query.js";
import type { RankingDecodeResult } from "../wcl/rankings/rankings-decoder.js";
import { MAX_CANDIDATE_PAGES, type EncounterRankingsRequest } from "../wcl/rankings/rankings-query.js";
import {
  MAX_QUALIFIED_CANDIDATES,
  RANKINGS_DERIVED_REFERENCE_POOL,
  selectCandidates,
  type CandidatePoolProvenance,
  type CandidateSelection,
} from "./candidate-pool.js";
import {
  qualifyCandidate,
  type CandidateQualification,
  type QualifiedExternalReference,
} from "./candidate-qualification.js";

/**
 * Retrieves exactly one ranking page.
 *
 * Takes credentials as a second argument, matching every other Warcraft Logs
 * port in this project: the SERVICE holds the validated configuration and the
 * adapter mints a token from it, so no port closes over a secret.
 */
export type RankingPagePort = (
  request: EncounterRankingsRequest,
  credentials: WclCredentials,
) => Promise<RankingDecodeResult>;

/**
 * Retrieves typed metadata for ONE candidate pull.
 *
 * Returns the decoded report, or `null` when Warcraft Logs served none. A
 * TRANSPORT failure is a thrown-free `null` here too: from this domain's point
 * of view both mean the candidate could not be established, and the distinction
 * belongs to the adapter that owns the HTTP call.
 */
export type CandidateMetadataPort = (
  reportCode: string,
  fightId: number,
  credentials: WclCredentials,
) => Promise<RawFightContextReport | null>;

export interface ExternalDiscoveryPorts {
  readonly rankingPage: RankingPagePort;
  readonly candidateMetadata: CandidateMetadataPort;
}

export interface ExternalDiscoveryRequest {
  readonly rankings: EncounterRankingsRequest;
  /** The pull external references are being gathered for. */
  readonly subject: PullContext;
  /** Validated by the caller. Never read here beyond handing it to a port. */
  readonly credentials: WclCredentials;
}

/**
 * Why a discovery produced no pool at all.
 *
 * DISTINCT FROM AN EMPTY POOL, WHICH IS NOT A FAILURE. A decoded page with zero
 * rows is a fact about the query; these mean we do not know what the pool is.
 */
export type DiscoveryFailureReason =
  "RANKING_REQUEST_REJECTED" | "RANKING_PAYLOAD_UNRECOGNISED" | "ENCOUNTER_NOT_FOUND";

export type ExternalDiscovery =
  | {
      readonly outcome: "DISCOVERED";
      readonly selection: CandidateSelection;
      /** Ascending by (reportCode, fightId). May be empty. */
      readonly qualified: readonly QualifiedExternalReference[];
      /** Ascending by (reportCode, fightId). Candidate-local failures. */
      readonly failures: readonly Extract<CandidateQualification, { outcome: "FAILED" }>[];
      readonly requestCount: number;
    }
  | {
      readonly outcome: "POOL_UNKNOWN";
      readonly reason: DiscoveryFailureReason;
      /** Present only for a rejection, which carries Warcraft Logs' message. */
      readonly message?: string;
      readonly requestCount: number;
    };

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function byCoordinate(
  left: { readonly reportCode: string; readonly fightId: number },
  right: { readonly reportCode: string; readonly fightId: number },
): number {
  const code = compareStrings(left.reportCode, right.reportCode);
  return code === 0 ? left.fightId - right.fightId : code;
}

/**
 * Runs one discovery.
 *
 * `subjectDurationMs` comes from the subject `PullContext`. A subject with no
 * known duration cannot have distances measured from it, so the pool is still
 * decoded and reported while selection falls back to canonical coordinate order
 * — stated rather than silently ranked.
 */
export async function discoverExternalReferences(
  request: ExternalDiscoveryRequest,
  ports: ExternalDiscoveryPorts,
): Promise<ExternalDiscovery> {
  // ONE page. `MAX_CANDIDATE_PAGES` is referenced so the bound is not merely
  // implied by the absence of a loop.
  const decoded = await ports.rankingPage(request.rankings, request.credentials);
  const rankingRequests = MAX_CANDIDATE_PAGES;

  if (decoded.outcome === "REQUEST_REJECTED") {
    return {
      outcome: "POOL_UNKNOWN",
      reason: "RANKING_REQUEST_REJECTED",
      message: decoded.message,
      requestCount: rankingRequests,
    };
  }
  if (decoded.outcome === "PAYLOAD_UNRECOGNISED") {
    return {
      outcome: "POOL_UNKNOWN",
      reason: "RANKING_PAYLOAD_UNRECOGNISED",
      requestCount: rankingRequests,
    };
  }
  if (decoded.outcome === "ENCOUNTER_NOT_FOUND") {
    return { outcome: "POOL_UNKNOWN", reason: "ENCOUNTER_NOT_FOUND", requestCount: rankingRequests };
  }

  const provenance: Omit<CandidatePoolProvenance, "rowsDecoded" | "rowsEligible"> = {
    source: RANKINGS_DERIVED_REFERENCE_POOL,
    encounterId: request.rankings.encounterId,
    difficulty: request.rankings.difficulty,
    className: request.rankings.className,
    specName: request.rankings.specName,
    metric: request.rankings.metric,
    partition: request.rankings.partition,
    page: decoded.page.page,
    reportedCount: decoded.page.count,
    // Recorded because Warcraft Logs said it. Never acted on: no second page is
    // ever requested.
    hasMorePages: decoded.page.hasMorePages,
  };

  const selection = selectCandidates({
    rows: decoded.page.rows,
    provenance,
    // `Number.NaN` would poison every distance comparison, so an unknown subject
    // duration uses 0 — which makes every distance equal to the candidate's own
    // duration and leaves the total order to the canonical coordinate tie-break.
    subjectDurationMs: request.subject.durationMs ?? 0,
  });

  const qualified: QualifiedExternalReference[] = [];
  const failures: Extract<CandidateQualification, { outcome: "FAILED" }>[] = [];
  let metadataRequests = 0;

  // `selected` is already capped at MAX_QUALIFIED_CANDIDATES by `selectCandidates`.
  // The slice is a second, local guard so this loop's bound does not depend on
  // another module keeping its promise.
  for (const descriptor of selection.selected.slice(0, MAX_QUALIFIED_CANDIDATES)) {
    const report = await ports.candidateMetadata(
      descriptor.reportCode,
      descriptor.fightId,
      request.credentials,
    );
    metadataRequests += 1;

    const result = qualifyCandidate({
      descriptor,
      report,
      expectedEncounterId: request.rankings.encounterId,
      expectedDifficulty: request.rankings.difficulty,
      subject: request.subject,
    });

    // CANDIDATE-LOCAL. A failure is recorded and the loop continues; it never
    // aborts the discovery or touches another candidate's result.
    if (result.outcome === "QUALIFIED") {
      qualified.push(result.reference);
    } else {
      failures.push(result);
    }
  }

  return {
    outcome: "DISCOVERED",
    selection,
    qualified: [...qualified].sort((left, right) => byCoordinate(left.descriptor, right.descriptor)),
    failures: [...failures].sort(byCoordinate),
    requestCount: rankingRequests + metadataRequests,
  };
}
