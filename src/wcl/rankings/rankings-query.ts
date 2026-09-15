/**
 * The one bounded ranking request M8-F is allowed to make.
 *
 * ONE PAGE. NO LOOP. There is no cursor, no `hasMorePages` follow-up and no
 * recent-report traversal anywhere in this domain — `MAX_CANDIDATE_PAGES` is 1
 * and the retrieval function issues exactly one request. Crawling a ranking
 * board is how a bounded feature becomes an unbounded quota bill.
 *
 * WHAT THIS SURFACE ACTUALLY IS
 *
 * `worldData.encounter(id).characterRankings` returns the untyped `JSON`
 * scalar, and Warcraft Logs documents it in its own schema as
 * "not considered frozen, and it can change without notice. Use at your own
 * risk." That is weaker than the events JSON this project already treats
 * carefully, so the payload never reaches a domain type without passing through
 * `rankings-decoder.ts`, which fails closed on anything it does not recognise.
 *
 * TWO ARGUMENTS ARE DELIBERATELY ABSENT
 *
 * `size` — M8-A sent it and Warcraft Logs answered, with HTTP 200 and an
 * in-payload `{"error": "You cannot specify a size for a flexibly-sized raid
 * zone."}`. Raid size is contextual rather than identifying (M8-A measured
 * comparable pulls at 24, 25, 27 and 30), so it is not a filter here.
 *
 * `includeCombatantInfo` is sent explicitly as `false`. M8-A measured the
 * difference on one page: 34,666 bytes against 650,882. Talent and gear
 * comparison has no consumer in M8, and a 19x payload in a Worker isolate is
 * not something to acquire by omission.
 */

import { isRecord, readRecord } from "../decode.js";
import type { DecodeOutcome } from "../graphql-client.js";

/** One page. Not a default, not a starting point — the ceiling. */
export const MAX_CANDIDATE_PAGES = 1;

/** The page this domain requests. There is no other. */
export const CANDIDATE_PAGE = 1;

/**
 * Ranking metrics this domain will send.
 *
 * Both are members of the frozen `CharacterRankingMetricType` enum, captured by
 * M8-A introspection. Only `dps` has been exercised against a live response;
 * `hps` is schema-legal and listed so a healer consumer does not have to edit a
 * query document to get one, and nothing in the decoder reads the metric — it
 * never touches the ranked `amount` at all.
 */
export const SUPPORTED_RANKING_METRICS = ["dps", "hps"] as const;

export type RankingMetric = (typeof SUPPORTED_RANKING_METRICS)[number];

/**
 * Which ranking partition was asked for.
 *
 * THE HONEST PART OF THIS MODULE. Warcraft Logs defaults `partition` to `0`,
 * documented as "the latest partition", which is a MOVING target: the same
 * query re-issued after a partition rolls over returns a different pool.
 *
 * M8-F cannot obtain a deterministic partition for the subject pull from typed
 * evidence — `partition` appears on no `ReportFight` or `Report` field, only
 * inside untyped ranking payloads. So the choice is surfaced to the caller
 * rather than hidden: state one, or state explicitly that you accept the moving
 * default. Either way the selection is recorded as provenance.
 *
 * NEITHER VALUE MEANS ANYTHING ABOUT GAMEPLAY COMPATIBILITY. This is a
 * retrieval filter. M8-B decides comparability, and it still answers UNKNOWN
 * across reports because partition semantics remain unproven — see
 * `version-evidence.ts`.
 */
export type RankingPartitionSelection =
  | { readonly kind: "EXPLICIT"; readonly partition: number }
  /** Retrieval is NOT reproducible across time. Recorded, never disguised. */
  | { readonly kind: "WCL_DEFAULT_LATEST" };

export interface EncounterRankingsRequest {
  readonly encounterId: number;
  readonly difficulty: number;
  /** Warcraft Logs class slug, e.g. `Rogue`. */
  readonly className: string;
  /** Warcraft Logs spec slug, e.g. `Assassination`. */
  readonly specName: string;
  readonly metric: RankingMetric;
  readonly partition: RankingPartitionSelection;
}

/**
 * The document.
 *
 * `metric` is interpolated rather than passed as a variable because it is a
 * GraphQL enum, and the value can only come from `SUPPORTED_RANKING_METRICS` —
 * a closed union of literals, so no caller-controlled string reaches the
 * document. Everything else is a bound variable.
 */
export function encounterRankingsQuery(metric: RankingMetric): string {
  return `query CoachEncounterRankings($encounterId: Int!, $difficulty: Int!, $className: String!, $specName: String!, $partition: Int!, $page: Int!) {
  rateLimitData {
    limitPerHour
    pointsSpentThisHour
    pointsResetIn
  }
  worldData {
    encounter(id: $encounterId) {
      id
      name
      characterRankings(
        difficulty: $difficulty
        className: $className
        specName: $specName
        metric: ${metric}
        partition: $partition
        page: $page
        includeCombatantInfo: false
      )
    }
  }
}`;
}

export function encounterRankingsVariables(request: EncounterRankingsRequest): Record<string, unknown> {
  return {
    encounterId: request.encounterId,
    difficulty: request.difficulty,
    className: request.className,
    specName: request.specName,
    // `0` IS the documented "latest partition" default, so sending it is
    // identical to omitting the argument — which keeps one static document
    // instead of two that could drift.
    partition: request.partition.kind === "EXPLICIT" ? request.partition.partition : 0,
    page: CANDIDATE_PAGE,
  };
}

/**
 * The raw `characterRankings` value, carried untouched.
 *
 * Interpretation belongs to `rankings-decoder.ts`. This layer establishes only
 * that the GraphQL envelope was well formed and that the field was present —
 * `undefined` here means the envelope itself was not what the schema describes,
 * which is a different failure from a payload we could not read.
 */
export interface RawEncounterRankings {
  readonly encounterId: number | undefined;
  readonly rankings: unknown;
}

export function decodeEncounterRankings(data: unknown): DecodeOutcome<RawEncounterRankings> {
  if (!isRecord(data)) {
    return { ok: false };
  }
  const worldData = readRecord(data, "worldData");
  if (worldData === undefined || !("encounter" in worldData)) {
    return { ok: false };
  }
  const encounter = worldData["encounter"];
  if (encounter === null) {
    // A null encounter is a real answer: Warcraft Logs knows no such id.
    return { ok: true, value: { encounterId: undefined, rankings: undefined } };
  }
  if (!isRecord(encounter) || !("characterRankings" in encounter)) {
    return { ok: false };
  }
  const id = encounter["id"];
  return {
    ok: true,
    value: {
      encounterId: typeof id === "number" && Number.isSafeInteger(id) ? id : undefined,
      rankings: encounter["characterRankings"],
    },
  };
}
