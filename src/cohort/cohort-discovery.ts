/**
 * Observed performance + comparable elite cohort discovery (M11-G1).
 *
 * THE REQUEST PLAN, BOUNDED BEFORE IT RUNS
 *
 *   1 request           the subject's performance surfaces
 *   1 per bracket       characterRankings page 1 for each item-level bracket
 *                       the current rung needs (fetched once, reused)
 *   1 per candidate     the candidate's context, highest ranked DPS first,
 *                       until `cohortSize` qualify at the current rung
 *
 * Every call goes through a port and is counted BEFORE it is made. When the
 * next call would exceed `maxGraphqlRequests` (the owner's cap, 14), discovery
 * stops and records that it did; it never makes the call. No port fetches an
 * event stream: G1 is metadata, performance and selection only.
 *
 * Widening happens only when fewer than `cohortSize` qualify, in the ladder's
 * order, and every rung tried is recorded with what it found.
 */

import type { HeroTreeResolution } from "../data/game/talent-selection.js";
import {
  COHORT_DECODER_REVISION,
  decodeCandidateContext,
  decodeCohortRankingPage,
  decodeSubjectPerformance,
  type RankedCohortRow,
} from "../wcl/cohort/cohort-decoders.js";
import {
  bracketItemLevelRange,
  cohortRungs,
  COHORT_SELECTION_CONFIG,
  itemLevelBracket,
  WCL_ITEM_LEVEL_BRACKET_MAPPING,
  type CohortRung,
  type CohortSelectionConfig,
} from "./cohort-config.js";
import {
  candidateKeyOf,
  candidateKeyString,
  orderCandidates,
  qualifyCandidate,
  rowExclusion,
  summarizeCohort,
  type CandidateExclusion,
  type CandidateKey,
  type CohortMember,
  type CohortSubject,
  type CohortSummary,
} from "./cohort-selection.js";
import {
  observedPerformanceOf,
  type ObservedPerformance,
  type SubjectIdentity,
} from "./observed-performance.js";

export interface RateLimitSnapshot {
  readonly limitPerHour: number | null;
  readonly pointsSpentThisHour: number | null;
  readonly pointsResetIn: number | null;
}

export type PortResponse =
  | { readonly ok: true; readonly data: unknown; readonly rateLimit: RateLimitSnapshot | null }
  | { readonly ok: false; readonly failure: string };

/** The three Warcraft Logs requests G1 may make. Nothing else is reachable. */
export interface CohortPorts {
  subjectPerformance(reportCode: string, fightId: number): Promise<PortResponse>;
  cohortRankingPage(request: {
    readonly encounterId: number;
    readonly difficulty: number;
    readonly className: string;
    readonly specName: string;
    readonly partition: number;
    readonly bracket: number;
  }): Promise<PortResponse>;
  candidateContext(reportCode: string, fightId: number): Promise<PortResponse>;
}

export interface CohortDiscoveryRequest {
  readonly reportCode: string;
  readonly fightId: number;
  readonly encounterId: number;
  readonly difficulty: number;
  readonly className: string;
  readonly specName: string;
  readonly subject: SubjectIdentity;
  /** The specialization's pinned hero-tree resolution, supplied by its owner. */
  readonly resolveHeroTree: (
    entries: readonly { readonly id: number; readonly nodeId: number | null }[],
  ) => HeroTreeResolution;
}

export type CohortInsufficiencyReason =
  | "SUBJECT_NOT_ELIGIBLE"
  | "SUBJECT_ITEM_LEVEL_UNAVAILABLE"
  | "SUBJECT_PARTITION_UNKNOWN"
  | "RANKING_PAGE_UNAVAILABLE"
  | "BRACKET_SEMANTICS_MISMATCH"
  | "REQUEST_BUDGET_EXHAUSTED"
  | "TOO_FEW_QUALIFYING_CANDIDATES";

export interface RequestRecord {
  readonly ordinal: number;
  readonly purpose: "SUBJECT_PERFORMANCE" | "COHORT_RANKING_PAGE" | "CANDIDATE_CONTEXT";
  readonly detail: string;
  readonly ok: boolean;
  readonly rateLimit: RateLimitSnapshot | null;
}

export interface CandidateRecord {
  readonly key: CandidateKey;
  readonly amount: number;
  readonly durationMs: number;
  readonly bracketData: number | null;
  /** The rung this record describes: the last one at which the row was examined. */
  readonly rungIndex: number;
  /**
   * `NOT_REACHED`: passed the row-level checks but ranked below the cohort
   * already filled at that rung, so it was never qualified (and no request
   * was spent on it).
   */
  readonly result: "QUALIFIED" | "NOT_REACHED" | CandidateExclusion;
}

export interface RungRecord {
  readonly rungIndex: number;
  readonly rung: CohortRung;
  readonly brackets: readonly number[];
  readonly rowsPassingRowChecks: number;
  readonly qualifiedAtEnd: number;
}

export interface CohortProvenance {
  readonly subject: { readonly reportCode: string; readonly fightId: number; readonly actorId: number };
  readonly rankingQuery: {
    readonly encounterId: number;
    readonly difficulty: number;
    readonly className: string;
    readonly specName: string;
    readonly metric: "dps";
    readonly partition: number | null;
    readonly page: 1;
  };
  readonly itemLevelBracketMapping: typeof WCL_ITEM_LEVEL_BRACKET_MAPPING;
  readonly rungs: readonly RungRecord[];
  /** Plain-language record of every widening step taken. */
  readonly wideningSteps: readonly string[];
  readonly candidates: readonly CandidateRecord[];
  readonly selected: readonly CandidateKey[];
  readonly decoderRevision: typeof COHORT_DECODER_REVISION;
  readonly requests: readonly RequestRecord[];
  readonly requestBudget: number;
}

export interface ComparableCohort extends CohortSummary {
  readonly members: readonly CohortMember[];
  readonly insufficiency: CohortInsufficiencyReason | null;
}

export interface ObservedCohortEvidence {
  readonly subject: ObservedPerformance;
  readonly cohort: ComparableCohort;
  readonly provenance: CohortProvenance;
}

class BudgetExhausted extends Error {}

export async function discoverObservedCohort(
  ports: CohortPorts,
  request: CohortDiscoveryRequest,
  config: CohortSelectionConfig = COHORT_SELECTION_CONFIG,
): Promise<ObservedCohortEvidence> {
  const requests: RequestRecord[] = [];
  async function call(
    purpose: RequestRecord["purpose"],
    detail: string,
    run: () => Promise<PortResponse>,
  ): Promise<PortResponse> {
    if (requests.length >= config.maxGraphqlRequests) throw new BudgetExhausted();
    const response = await run();
    requests.push({
      ordinal: requests.length + 1,
      purpose,
      detail,
      ok: response.ok,
      rateLimit: response.ok ? response.rateLimit : null,
    });
    return response;
  }

  const rungRecords: RungRecord[] = [];
  const wideningSteps: string[] = [];
  const candidateRecords = new Map<string, CandidateRecord>();
  const members: CohortMember[] = [];
  const memberKeys: CandidateKey[] = [];
  let insufficiency: CohortInsufficiencyReason | null = null;

  const subjectResponse = await call(
    "SUBJECT_PERFORMANCE",
    `${request.reportCode}#${String(request.fightId)}`,
    () => ports.subjectPerformance(request.reportCode, request.fightId),
  );
  const subject = observedPerformanceOf(
    subjectResponse.ok
      ? decodeSubjectPerformance(subjectResponse.data, request.fightId)
      : { outcome: "PAYLOAD_UNRECOGNISED", defect: "REPORT_DATA_MISSING" },
    request.subject,
  );

  const provenanceBase = {
    subject: { reportCode: request.reportCode, fightId: request.fightId, actorId: request.subject.actorId },
    rankingQuery: {
      encounterId: request.encounterId,
      difficulty: request.difficulty,
      className: request.className,
      specName: request.specName,
      metric: "dps" as const,
      partition: subject.partition,
      page: 1 as const,
    },
    itemLevelBracketMapping: WCL_ITEM_LEVEL_BRACKET_MAPPING as typeof WCL_ITEM_LEVEL_BRACKET_MAPPING,
    decoderRevision: COHORT_DECODER_REVISION as typeof COHORT_DECODER_REVISION,
    requestBudget: config.maxGraphqlRequests,
  };

  if (subject.eligibility.status !== "ELIGIBLE") insufficiency = "SUBJECT_NOT_ELIGIBLE";
  else if (subject.itemLevel.status !== "OBSERVED" || subject.durationMs === null) {
    insufficiency = "SUBJECT_ITEM_LEVEL_UNAVAILABLE";
  } else if (subject.partition === null) insufficiency = "SUBJECT_PARTITION_UNKNOWN";

  if (
    insufficiency === null &&
    subject.itemLevel.status === "OBSERVED" &&
    subject.durationMs !== null &&
    subject.partition !== null
  ) {
    const cohortSubject: CohortSubject = {
      reportCode: request.reportCode,
      fightId: request.fightId,
      encounterId: request.encounterId,
      difficulty: request.difficulty,
      className: request.className,
      specName: request.specName,
      durationMs: subject.durationMs,
      itemLevel: subject.itemLevel.value,
    };
    const partition = subject.partition;
    const pages = new Map<number, readonly RankedCohortRow[]>();
    const qualifications = new Map<string, ReturnType<typeof qualifyCandidate>>();

    try {
      const rungs = cohortRungs(config);
      for (const [rungIndex, rung] of rungs.entries()) {
        if (rungIndex > 0) {
          const previous = rungs[rungIndex - 1];
          wideningSteps.push(
            `only ${String(members.length)} of ${String(config.cohortSize)} qualified at duration ±${String((previous?.durationFraction ?? 0) * 100)}% / item level ±${String(previous?.itemLevelWindow ?? 0)}; widened to duration ±${String(rung.durationFraction * 100)}% / item level ±${String(rung.itemLevelWindow)}`,
          );
        }
        const lowBracket = itemLevelBracket(cohortSubject.itemLevel - rung.itemLevelWindow);
        const highBracket = itemLevelBracket(cohortSubject.itemLevel + rung.itemLevelWindow);
        const brackets: number[] = [];
        for (let bracket = lowBracket; bracket <= highBracket; bracket += 1) brackets.push(bracket);
        // The subject's own bracket first, then outward: the order rows are
        // fetched in never affects selection, which sorts by facts.
        brackets.sort(
          (left, right) =>
            Math.abs(left - itemLevelBracket(cohortSubject.itemLevel)) -
              Math.abs(right - itemLevelBracket(cohortSubject.itemLevel)) || left - right,
        );
        for (const bracket of brackets) {
          if (pages.has(bracket)) continue;
          const response = await call("COHORT_RANKING_PAGE", `bracket ${String(bracket)}`, () =>
            ports.cohortRankingPage({
              encounterId: request.encounterId,
              difficulty: request.difficulty,
              className: request.className,
              specName: request.specName,
              partition,
              bracket,
            }),
          );
          const decoded = response.ok ? decodeCohortRankingPage(response.data) : null;
          if (decoded === null || decoded.outcome !== "DECODED") {
            insufficiency = "RANKING_PAGE_UNAVAILABLE";
            throw new BudgetExhausted();
          }
          const range = bracketItemLevelRange(bracket);
          if (
            decoded.value.rows.some(
              (row) => row.bracketData === null || row.bracketData < range.from || row.bracketData > range.to,
            )
          ) {
            insufficiency = "BRACKET_SEMANTICS_MISMATCH";
            throw new BudgetExhausted();
          }
          pages.set(bracket, decoded.value.rows);
        }

        const passing: RankedCohortRow[] = [];
        for (const row of [...pages.values()].flat()) {
          const key = candidateKeyString(candidateKeyOf(row));
          const exclusion = rowExclusion(row, cohortSubject, rung);
          if (exclusion === null) passing.push(row);
          else if (!candidateRecords.has(key) || candidateRecords.get(key)?.result !== "QUALIFIED") {
            candidateRecords.set(key, {
              key: candidateKeyOf(row),
              amount: row.amount,
              durationMs: row.durationMs,
              bracketData: row.bracketData,
              rungIndex,
              result: exclusion,
            });
          }
        }

        // The highest-ranked qualifying candidates at THIS rung, from the top.
        members.length = 0;
        memberKeys.length = 0;
        for (const row of orderCandidates(passing)) {
          if (members.length >= config.cohortSize) break;
          const key = candidateKeyString(candidateKeyOf(row));
          let qualification = qualifications.get(key);
          if (qualification === undefined) {
            const response = await call("CANDIDATE_CONTEXT", `${row.reportCode}#${String(row.fightId)}`, () =>
              ports.candidateContext(row.reportCode, row.fightId),
            );
            qualification = qualifyCandidate(
              row,
              response.ok
                ? decodeCandidateContext(response.data, row.fightId)
                : { outcome: "PAYLOAD_UNRECOGNISED", defect: "REPORT_DATA_MISSING" },
              cohortSubject,
              rung,
              request.resolveHeroTree,
            );
            qualifications.set(key, qualification);
          }
          candidateRecords.set(key, {
            key: candidateKeyOf(row),
            amount: row.amount,
            durationMs: row.durationMs,
            bracketData: row.bracketData,
            rungIndex,
            result: qualification.status === "QUALIFIED" ? "QUALIFIED" : qualification.reason,
          });
          if (qualification.status === "QUALIFIED") {
            members.push(qualification.member);
            memberKeys.push(candidateKeyOf(row));
          }
        }
        for (const row of passing) {
          const key = candidateKeyString(candidateKeyOf(row));
          if (qualifications.has(key)) continue;
          candidateRecords.set(key, {
            key: candidateKeyOf(row),
            amount: row.amount,
            durationMs: row.durationMs,
            bracketData: row.bracketData,
            rungIndex,
            result: "NOT_REACHED",
          });
        }
        rungRecords.push({
          rungIndex,
          rung,
          brackets: [...brackets].sort((left, right) => left - right),
          rowsPassingRowChecks: passing.length,
          qualifiedAtEnd: members.length,
        });
        if (members.length >= config.cohortSize) break;
      }
      if (members.length < config.cohortSize) insufficiency = "TOO_FEW_QUALIFYING_CANDIDATES";
    } catch (error) {
      if (!(error instanceof BudgetExhausted)) throw error;
      insufficiency ??= "REQUEST_BUDGET_EXHAUSTED";
    }
  }

  const summary = summarizeCohort(members);
  return {
    subject,
    cohort: {
      ...summary,
      members: [...members],
      insufficiency: summary.status === "OK" ? null : insufficiency,
    },
    provenance: {
      ...provenanceBase,
      rungs: rungRecords,
      wideningSteps,
      candidates: [...candidateRecords.values()].sort(
        (left, right) =>
          right.amount - left.amount ||
          (candidateKeyString(left.key) < candidateKeyString(right.key) ? -1 : 1),
      ),
      selected: [...memberKeys],
      requests,
    },
  };
}
