/**
 * The three Warcraft Logs requests of M11-G1 (observed performance + elite
 * cohort evidence), verbatim as captured on 2026-10-09.
 *
 * NONE IS AN EVENT QUERY. G1 never retrieves a comparison player's damage,
 * cast or any other event stream (owner decision); a layering test asserts
 * that these documents and the cohort domain never reach the events surface.
 *
 *   SUBJECT_PERFORMANCE_QUERY    the subject fight's header, its report
 *                                rankings and its DamageDone table — the
 *                                Warcraft Logs surface ACTUAL_DPS is read from
 *   COHORT_RANKINGS_QUERY        one characterRankings page for ONE item-level
 *                                bracket (page 1, no combatant info)
 *   CANDIDATE_CONTEXT_QUERY      one candidate fight's header, player catalog,
 *                                report rankings, playerDetails with combatant
 *                                info, and Deaths table — qualification and
 *                                the selected members' gear/talent context
 *
 * Every one carries `rateLimitData`, so the request ledger records the points
 * each request cost.
 */

const RATE_LIMIT = "rateLimitData { limitPerHour pointsSpentThisHour pointsResetIn }";

export const SUBJECT_PERFORMANCE_QUERY = `query CoachSubjectPerformance($code: String!, $fightIDs: [Int]!) {
  ${RATE_LIMIT}
  reportData {
    report(code: $code) {
      code
      revision
      fights(fightIDs: $fightIDs) { id encounterID difficulty kill startTime endTime }
      rankings(fightIDs: $fightIDs, playerMetric: dps)
      damageDone: table(dataType: DamageDone, fightIDs: $fightIDs)
    }
  }
}`;

export const COHORT_RANKINGS_QUERY = `query CoachCohortRankings($encounterId: Int!, $difficulty: Int!, $className: String!, $specName: String!, $partition: Int!, $bracket: Int!) {
  ${RATE_LIMIT}
  worldData {
    encounter(id: $encounterId) {
      characterRankings(
        difficulty: $difficulty
        className: $className
        specName: $specName
        metric: dps
        partition: $partition
        bracket: $bracket
        page: 1
        includeCombatantInfo: false
      )
    }
  }
}`;

export const CANDIDATE_CONTEXT_QUERY = `query CoachCohortCandidate($code: String!, $fightIDs: [Int]!) {
  ${RATE_LIMIT}
  reportData {
    report(code: $code) {
      code
      fights(fightIDs: $fightIDs) { id encounterID difficulty kill startTime endTime }
      masterData { actors { id name server type subType } }
      rankings(fightIDs: $fightIDs, playerMetric: dps)
      playerDetails(fightIDs: $fightIDs, includeCombatantInfo: true)
      deaths: table(dataType: Deaths, fightIDs: $fightIDs)
    }
  }
}`;

export interface CohortRankingsVariables {
  readonly encounterId: number;
  readonly difficulty: number;
  readonly className: string;
  readonly specName: string;
  readonly partition: number;
  readonly bracket: number;
}

export function subjectPerformanceVariables(code: string, fightId: number): Record<string, unknown> {
  return { code, fightIDs: [fightId] };
}

export function candidateContextVariables(code: string, fightId: number): Record<string, unknown> {
  return { code, fightIDs: [fightId] };
}

export function cohortRankingsVariables(request: CohortRankingsVariables): Record<string, unknown> {
  return { ...request };
}
