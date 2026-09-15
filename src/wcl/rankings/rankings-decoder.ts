/**
 * Reading an untyped, explicitly non-frozen Warcraft Logs payload, fail-closed.
 *
 * THE FAILURE THIS MODULE EXISTS TO PREVENT
 *
 * M8-A sent a `size` argument to a flexible-raid zone and got back HTTP 200,
 * no GraphQL `errors` array, and this body:
 *
 *     {"error": "You cannot specify a size for a flexibly-sized raid zone."}
 *
 * A reader doing `payload.rankings ?? []` gets an empty array and reports "no
 * comparable logs found" — a confident statement about the world produced by a
 * rejected request. Every distinction below exists to keep that from happening.
 *
 * FOUR OUTCOMES, AND THEY NEVER COLLAPSE
 *
 *     DECODED               we read the payload. It may hold zero rows, and
 *                           zero rows is then a FACT about the query.
 *     REQUEST_REJECTED      Warcraft Logs declined, in-payload, with a message.
 *     PAYLOAD_UNRECOGNISED  the shape is not what we have evidence for. We do
 *                           not know the candidate pool.
 *     ENCOUNTER_NOT_FOUND   the encounter id resolved to null.
 *
 * ALL-OR-NOTHING, DELIBERATELY. A malformed ROW fails the whole decode rather
 * than being dropped. Dropping it would silently shrink a pool whose size a
 * later selection reasons about, and "99 of 100 rows" is not a distinction any
 * consumer here asked for. Partial decoding is modellable later if something
 * needs it; until then, refusing is cheaper to reason about than a quiet gap.
 *
 * WHAT IS READ, AND WHAT IS REFUSED ENTRY
 *
 * Only fields M8-A observed in a real captured page. The ranked `amount` is
 * observed and is deliberately NOT read: it is the metric the board was ordered
 * by, so carrying it would reintroduce rank ordering under another name. See
 * `RankingCandidateRow`.
 */

import { isRecord, isSafeInteger, isUsableString, readInteger, readRecord, readString } from "../decode.js";

/**
 * One ranking row, reduced to the facts this project will act on.
 *
 * EVERY FIELD WAS OBSERVED IN A COMMITTED CAPTURE. M8-A's page of 100 rows is
 * the evidence, and the optionality below is measured rather than guessed:
 *
 *     name, class, spec, duration,
 *     startTime, report{code,fightID,startTime},
 *     bracketData, size, hardModeLevel     100 / 100 rows
 *     server{id,name,region}                92 / 100 rows
 *     guild                                 69 / 100 rows
 *     hidden                                 8 / 100 rows
 *
 * The 8 rows carrying `hidden: true` are EXACTLY the 8 with no `server`: their
 * `name` is the literal "Anonymous" and their report code is an anonymized
 * `a:`-prefixed handle. They are preserved here as observed rows and filtered
 * later by an explicit structural rule, not silently dropped during decoding.
 *
 * NO RANKING POSITION. The row's index in the board is not read, not stored and
 * not returned. `amount`, `rank`, `rankPercent`, `bracketPercent` and
 * `percentile` have no field to occupy — the type is structurally unable to
 * carry a parse measure, which is the only durable way to keep one out.
 *
 * `guild` is omitted too: it is a real observed field with no consumer, and an
 * unused identifier for a third party is not worth carrying.
 */
export interface RankingCandidateRow {
  readonly name: string;
  readonly className: string;
  readonly specName: string;
  /** Observed fight duration in milliseconds. */
  readonly durationMs: number;
  /** UNIX ms, as supplied. A Warcraft Logs fact, never our clock. */
  readonly startTimeUnixMs: number;
  readonly reportCode: string;
  readonly fightId: number;
  readonly reportStartTimeUnixMs: number;
  /** `null` when the row carried no server — measured on 8 of 100 rows. */
  readonly serverName: string | null;
  readonly serverRegion: string | null;
  /** Item-level context. Carried as the raw observed value, uninterpreted. */
  readonly bracketData: number | null;
  readonly raidSize: number | null;
  readonly hardModeLevel: number | null;
  /**
   * Warcraft Logs reported this character as hidden/anonymized.
   *
   * `false` when the key was absent, which is the observed ordinary case. This
   * is a factual flag, not a quality judgement, and it exists because such a row
   * carries no resolvable identity.
   */
  readonly hidden: boolean;
}

export interface RankingPage {
  readonly page: number;
  readonly hasMorePages: boolean;
  /** The board's own count field, verbatim. Not the number of rows decoded. */
  readonly count: number | null;
  readonly rows: readonly RankingCandidateRow[];
}

export type RankingDecodeDefect =
  | "RANKINGS_NOT_A_RECORD"
  | "RANKINGS_KEY_MISSING"
  | "RANKINGS_NOT_AN_ARRAY"
  | "PAGINATION_MISSING"
  | "ROW_NOT_A_RECORD"
  | "ROW_FIELD_UNUSABLE"
  | "ROW_REPORT_MISSING";

export const RANKING_DECODE_DEFECTS = [
  "RANKINGS_NOT_A_RECORD",
  "RANKINGS_KEY_MISSING",
  "RANKINGS_NOT_AN_ARRAY",
  "PAGINATION_MISSING",
  "ROW_NOT_A_RECORD",
  "ROW_FIELD_UNUSABLE",
  "ROW_REPORT_MISSING",
] as const satisfies readonly RankingDecodeDefect[];

export type RankingDecodeResult =
  | { readonly outcome: "DECODED"; readonly page: RankingPage }
  /** Warcraft Logs declined the request inside a 200 response. */
  | { readonly outcome: "REQUEST_REJECTED"; readonly message: string }
  /** The encounter id resolved to null. Not an error, and not an empty pool. */
  | { readonly outcome: "ENCOUNTER_NOT_FOUND" }
  /** The shape is not one we hold evidence for. The pool is UNKNOWN. */
  | { readonly outcome: "PAYLOAD_UNRECOGNISED"; readonly defect: RankingDecodeDefect };

function rejected(message: string): RankingDecodeResult {
  return { outcome: "REQUEST_REJECTED", message };
}

function unrecognised(defect: RankingDecodeDefect): RankingDecodeResult {
  return { outcome: "PAYLOAD_UNRECOGNISED", defect };
}

/** A row, or `null` when any required field is unusable. All-or-nothing. */
function decodeRow(
  raw: unknown,
): { readonly row: RankingCandidateRow } | { readonly defect: RankingDecodeDefect } {
  if (!isRecord(raw)) {
    return { defect: "ROW_NOT_A_RECORD" };
  }

  const report = readRecord(raw, "report");
  if (report === undefined) {
    return { defect: "ROW_REPORT_MISSING" };
  }

  const name = readString(raw, "name");
  const className = readString(raw, "class");
  const specName = readString(raw, "spec");
  const durationMs = readInteger(raw, "duration");
  const startTimeUnixMs = readInteger(raw, "startTime");
  const reportCode = readString(report, "code");
  const fightId = readInteger(report, "fightID");
  const reportStartTimeUnixMs = readInteger(report, "startTime");

  if (
    name === undefined ||
    className === undefined ||
    specName === undefined ||
    durationMs === undefined ||
    startTimeUnixMs === undefined ||
    reportCode === undefined ||
    fightId === undefined ||
    reportStartTimeUnixMs === undefined
  ) {
    return { defect: "ROW_FIELD_UNUSABLE" };
  }

  // A negative or zero duration would make every distance comparison
  // meaningless, so it is refused rather than carried.
  if (durationMs <= 0) {
    return { defect: "ROW_FIELD_UNUSABLE" };
  }

  // Optional by measurement. A missing server is the observed anonymized case,
  // not a defect, so it resolves to null rather than failing the row.
  const server = readRecord(raw, "server");
  const hidden = raw["hidden"];

  return {
    row: {
      name,
      className,
      specName,
      durationMs,
      startTimeUnixMs,
      reportCode,
      fightId,
      reportStartTimeUnixMs,
      serverName: server === undefined ? null : (readString(server, "name") ?? null),
      serverRegion: server === undefined ? null : (readString(server, "region") ?? null),
      bracketData: isSafeInteger(raw["bracketData"]) ? raw["bracketData"] : null,
      raidSize: isSafeInteger(raw["size"]) ? raw["size"] : null,
      hardModeLevel: isSafeInteger(raw["hardModeLevel"]) ? raw["hardModeLevel"] : null,
      hidden: hidden === true,
    },
  };
}

/**
 * Decodes one `characterRankings` payload.
 *
 * `raw` is the value straight off the GraphQL response. `undefined` means the
 * encounter resolved to null, which is its own outcome rather than an empty
 * pool: Warcraft Logs knowing no such encounter is not the same fact as an
 * encounter with no ranked Assassination Rogues.
 */
export function decodeRankingPayload(raw: unknown): RankingDecodeResult {
  if (raw === undefined || raw === null) {
    return { outcome: "ENCOUNTER_NOT_FOUND" };
  }
  if (!isRecord(raw)) {
    return unrecognised("RANKINGS_NOT_A_RECORD");
  }

  // FIRST. A rejection carries no rankings key, and reading the absence as an
  // empty pool is exactly the failure this module was written for.
  const error = raw["error"];
  if (isUsableString(error)) {
    return rejected(error);
  }

  if (!("rankings" in raw)) {
    return unrecognised("RANKINGS_KEY_MISSING");
  }
  const rankings = raw["rankings"];
  if (!Array.isArray(rankings)) {
    return unrecognised("RANKINGS_NOT_AN_ARRAY");
  }

  // Pagination is required evidence, not decoration: `page` is what proves the
  // single page we asked for is the page we got.
  const page = readInteger(raw, "page");
  const hasMorePages = raw["hasMorePages"];
  if (page === undefined || typeof hasMorePages !== "boolean") {
    return unrecognised("PAGINATION_MISSING");
  }

  const rows: RankingCandidateRow[] = [];
  for (const entry of rankings) {
    const decoded = decodeRow(entry);
    if ("defect" in decoded) {
      // All-or-nothing: one unreadable row means we do not know the pool.
      return unrecognised(decoded.defect);
    }
    rows.push(decoded.row);
  }

  return {
    outcome: "DECODED",
    page: {
      page,
      hasMorePages,
      count: isSafeInteger(raw["count"]) ? raw["count"] : null,
      rows,
    },
  };
}
