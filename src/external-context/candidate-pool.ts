/**
 * A bounded, rankings-derived pool of external reference pulls, and how five of
 * them are chosen.
 *
 * WHAT THIS POOL IS, STATED SO IT CANNOT DRIFT
 *
 * Page 1 of a Warcraft Logs ranking board, filtered to one encounter,
 * difficulty, class and specialization. That is all it is.
 *
 * It is NOT a representative sample, NOT typical players, NOT a peer average,
 * NOT community consensus, NOT expected behaviour and NOT normal behaviour. It
 * is the top of a leaderboard, which is close to the opposite of typical. The
 * provenance vocabulary says `RANKINGS_DERIVED_REFERENCE_POOL` and nothing in
 * this domain offers a word that could be mistaken for representativeness.
 *
 * WHY NEAREST-DURATION AND NOT TOP-FIVE
 *
 * Taking the first five rows would make rank the selection criterion, and rank
 * is exactly what must not become authority. Duration distance is a factual,
 * rank-independent ordering over the same bounded pool.
 *
 * It also claims nothing. "Nearest duration among this pool" does not mean most
 * comparable, most similar, same strategy, same raid conditions, same
 * progression state, better, or equivalent. It means the absolute millisecond
 * difference was smallest. M8-B decides comparability, separately, and still
 * answers UNKNOWN across reports.
 *
 * The ranking POSITION is never stored, never returned and never used as a
 * tie-break — the decoder does not read it, and the selection sorts by facts
 * that exist independently of the board.
 */

import type { RankingCandidateRow } from "../wcl/rankings/rankings-decoder.js";
import type { RankingPartitionSelection } from "../wcl/rankings/rankings-query.js";

/** The ceiling on qualification work, and therefore on external requests. */
export const MAX_QUALIFIED_CANDIDATES = 5;

/**
 * Where a candidate pool came from.
 *
 * A single-member union today, and deliberately a union: a second discovery
 * surface would have to name itself here rather than inherit this one's
 * meaning.
 */
export const RANKINGS_DERIVED_REFERENCE_POOL = "RANKINGS_DERIVED_REFERENCE_POOL";

export type CandidatePoolSource = typeof RANKINGS_DERIVED_REFERENCE_POOL;

/**
 * How the pool was obtained. Factual query parameters, not conclusions.
 *
 * NO WALL CLOCK, NO GENERATED ID. There is no `retrievedAtUnixMs` and no request
 * id: M8-A rejected request-time values in deterministic application results
 * because REST and MCP execute as separate requests over one evidence snapshot.
 *
 * `partition` records WHICH partition was requested — including, honestly, that
 * the moving Warcraft Logs default was accepted. It is retrieval provenance and
 * has no bearing on gameplay comparability; see `version-evidence.ts`.
 */
export interface CandidatePoolProvenance {
  readonly source: CandidatePoolSource;
  readonly encounterId: number;
  readonly difficulty: number;
  readonly className: string;
  readonly specName: string;
  readonly metric: string;
  readonly partition: RankingPartitionSelection;
  readonly page: number;
  /** The board's own `count`, verbatim. Never the number of rows we kept. */
  readonly reportedCount: number | null;
  /** Warcraft Logs said more pages exist. Recorded; never followed. */
  readonly hasMorePages: boolean;
  readonly rowsDecoded: number;
  readonly rowsEligible: number;
}

/**
 * One external reference pull, reduced to facts.
 *
 * WHAT IS STRUCTURALLY ABSENT, AND WHY IT STAYS ABSENT
 *
 * No `rank`, `rankPercent`, `bracketPercent`, `percentile`, `parse`, `amount`,
 * quality label or position. The decoder never reads them, and this type has
 * nowhere to put one — so publishing a leaderboard through this domain would
 * require adding a field in a diff, not forgetting to remove one.
 *
 * `amount` deserves its own note: it IS present in the payload and is the metric
 * the board was ordered by. Carrying it would let any consumer reconstruct the
 * ranking, which is the thing the selection rule was designed to avoid.
 *
 * `bracketData` is kept as the raw observed integer — M8-A saw values like 325
 * that read as item level — and is carried uninterpreted, under its Warcraft
 * Logs name, because nothing here has established what scale it is on.
 */
export interface ExternalCandidateDescriptor {
  readonly reportCode: string;
  readonly fightId: number;
  readonly playerName: string;
  readonly className: string;
  readonly specName: string;
  readonly durationMs: number;
  readonly startTimeUnixMs: number;
  readonly reportStartTimeUnixMs: number;
  readonly serverName: string | null;
  readonly serverRegion: string | null;
  readonly bracketData: number | null;
  readonly raidSize: number | null;
  readonly hardModeLevel: number | null;
}

export type CandidateIneligibility =
  /**
   * Warcraft Logs reported the character as hidden.
   *
   * A STRUCTURAL FACT, NOT A JUDGEMENT. M8-A measured 8 such rows in a page of
   * 100: their name is the literal "Anonymous", they carry no server, and their
   * report code is an anonymized `a:`-prefixed handle. Source-id resolution
   * cannot succeed for them, so qualifying one would spend a request to learn
   * nothing.
   */
  | "HIDDEN_CHARACTER"
  /** Another row already claimed this exact pull coordinate. */
  | "DUPLICATE_PULL_COORDINATE";

export interface IneligibleRow {
  readonly reportCode: string;
  readonly fightId: number;
  readonly reason: CandidateIneligibility;
}

export interface CandidateSelection {
  readonly provenance: CandidatePoolProvenance;
  /** Canonical order: reportCode then fightId. NEVER ranking order. */
  readonly selected: readonly ExternalCandidateDescriptor[];
  /** Ascending by (reportCode, fightId). Disclosure, not failure. */
  readonly ineligible: readonly IneligibleRow[];
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** reportCode, then fightId. The canonical identity order for a pull. */
function byCoordinate(
  left: { readonly reportCode: string; readonly fightId: number },
  right: { readonly reportCode: string; readonly fightId: number },
): number {
  const code = compareStrings(left.reportCode, right.reportCode);
  return code === 0 ? left.fightId - right.fightId : code;
}

function descriptorOf(row: RankingCandidateRow): ExternalCandidateDescriptor {
  return {
    reportCode: row.reportCode,
    fightId: row.fightId,
    playerName: row.name,
    className: row.className,
    specName: row.specName,
    durationMs: row.durationMs,
    startTimeUnixMs: row.startTimeUnixMs,
    reportStartTimeUnixMs: row.reportStartTimeUnixMs,
    serverName: row.serverName,
    serverRegion: row.serverRegion,
    bracketData: row.bracketData,
    raidSize: row.raidSize,
    hardModeLevel: row.hardModeLevel,
  };
}

export interface CandidateSelectionInput {
  readonly rows: readonly RankingCandidateRow[];
  readonly provenance: Omit<CandidatePoolProvenance, "rowsDecoded" | "rowsEligible">;
  /** The pull being compared against. Duration distance is measured from here. */
  readonly subjectDurationMs: number;
}

/**
 * Selects up to `MAX_QUALIFIED_CANDIDATES` reference pulls.
 *
 * DETERMINISTIC AND ORDER-INDEPENDENT. The input rows are copied before sorting,
 * every comparison is total, and the pipeline never consults a row's position in
 * the input:
 *
 *   1. drop hidden rows            — structurally unresolvable identity
 *   2. deduplicate by (code, fight) — by CANONICAL COORDINATE, so which
 *                                     duplicate arrived first cannot matter
 *   3. sort by |duration - subject|, tie-break reportCode then fightId
 *   4. take 5
 *   5. re-sort the survivors canonically by coordinate
 *
 * Step 2 deduplicates PULLS, never players by name: two different players in the
 * same pull are two rows with one coordinate, and one qualification request
 * answers for both — so letting them consume two of five slots would waste the
 * budget on a report we already hold. The retained descriptor is chosen by the
 * same canonical rule used everywhere else rather than by arrival order, which
 * is what makes the choice reproducible.
 *
 * Step 5 exists so that no consumer can recover the distance ordering and read
 * it as a quality ranking. The output order is identity, not merit.
 */
export function selectCandidates(input: CandidateSelectionInput): CandidateSelection {
  const ineligible: IneligibleRow[] = [];

  const named = input.rows.filter((row) => {
    if (row.hidden) {
      ineligible.push({ reportCode: row.reportCode, fightId: row.fightId, reason: "HIDDEN_CHARACTER" });
      return false;
    }
    return true;
  });

  // Deduplicate by coordinate. The kept row is the canonically-first descriptor
  // for that coordinate, decided by a total order over the ROWS rather than by
  // input position.
  const byPull = new Map<string, RankingCandidateRow>();
  for (const row of [...named].sort((left, right) => {
    const coordinate = byCoordinate(left, right);
    return coordinate === 0 ? compareStrings(left.name, right.name) : coordinate;
  })) {
    const key = `${row.reportCode}:${String(row.fightId)}`;
    const existing = byPull.get(key);
    if (existing === undefined) {
      byPull.set(key, row);
      continue;
    }
    ineligible.push({
      reportCode: row.reportCode,
      fightId: row.fightId,
      reason: "DUPLICATE_PULL_COORDINATE",
    });
  }

  const eligible = [...byPull.values()];

  const selected = [...eligible]
    .sort((left, right) => {
      const distance =
        Math.abs(left.durationMs - input.subjectDurationMs) -
        Math.abs(right.durationMs - input.subjectDurationMs);
      return distance === 0 ? byCoordinate(left, right) : distance;
    })
    .slice(0, MAX_QUALIFIED_CANDIDATES)
    .map(descriptorOf)
    .sort(byCoordinate);

  return {
    provenance: {
      ...input.provenance,
      rowsDecoded: input.rows.length,
      rowsEligible: eligible.length,
    },
    selected,
    ineligible: [...ineligible].sort(byCoordinate),
  };
}
