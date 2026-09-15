/**
 * Reading one report's revision — the single definition, shared by everything.
 *
 * WHY THIS IS ITS OWN MODULE
 *
 * `revision` increases when a Warcraft Logs report is re-exported, and it is the
 * only thing that can tell us two pieces of evidence came from the same version
 * of a report. Three separate places now need to ask the question:
 *
 *     M3 ingestion      did the report change WHILE this fight paginated?
 *     roster discovery  which revision does this whole snapshot belong to?
 *     batch analysis    did the report change across the whole raid night?
 *
 * A second, subtly different definition of "read the revision" is exactly the
 * kind of duplication that eventually disagrees with itself — one decoder
 * treating an inaccessible report as revision 0, another as a failure, and a
 * mixed-revision dataset slipping between them. So the query, the variables and
 * the decoder live here once, and every caller shares them.
 *
 * THE DECODER'S `null` IS LOAD-BEARING
 *
 * `null` means Warcraft Logs did not serve the report on THIS request — it may
 * have become inaccessible since. It is emphatically not revision zero and not
 * "unchanged". A caller deciding whether a revision MATCHES must treat `null` as
 * "could not establish", never as agreement.
 *
 * WHAT THIS MODULE DOES NOT DO
 *
 * It does not decide what a mismatch means. M3 ingestion fails one fight;
 * a future raid-night batch invalidates a whole snapshot. Those are the callers'
 * judgements, and folding either into this module would make the other wrong.
 */

import type { WclCredentials } from "../config/env.js";
import { isRecord, readInteger, readRecord } from "./decode.js";
import { createGraphqlClient, type DecodeOutcome, type WclGraphqlClient } from "./graphql-client.js";
import { createTokenProvider, type TokenCache } from "./token-provider.js";
import type { FetchLike } from "./types.js";

/**
 * The revision-only read.
 *
 * Deliberately the narrowest document in the repository: one scalar. It is
 * issued as a standalone round trip specifically so a revision check costs one
 * cheap request rather than re-retrieving a report's master data.
 */
export const REPORT_REVISION_QUERY = `query CoachReportRevision($code: String!) {
  reportData {
    report(code: $code, allowUnlisted: true) {
      revision
    }
  }
}`;

export function reportRevisionVariables(reportCode: string): Record<string, unknown> {
  return { code: reportCode };
}

export function decodeReportRevision(data: unknown): DecodeOutcome<number | null> {
  if (!isRecord(data)) {
    return { ok: false };
  }
  const reportData = readRecord(data, "reportData");
  if (reportData === undefined || !("report" in reportData)) {
    return { ok: false };
  }
  const report = reportData["report"];
  if (report === null) {
    return { ok: true, value: null };
  }
  if (!isRecord(report)) {
    return { ok: false };
  }
  const revision = readInteger(report, "revision");
  return revision === undefined ? { ok: false } : { ok: true, value: revision };
}

/**
 * What one revision read established.
 *
 * Three outcomes, kept apart because they demand different responses:
 *
 *     MATCHES       the report is still the one we started from
 *     CHANGED       it was re-exported; evidence now spans two worlds
 *     UNVERIFIED    we could not ask, or the report was not served
 *
 * `UNVERIFIED` is NOT `MATCHES`. A caller that cannot confirm the revision has
 * not confirmed anything, and treating an unanswerable check as agreement is the
 * fail-open reading this type exists to make unrepresentable.
 */
export type RevisionCheck =
  | { readonly outcome: "MATCHES"; readonly revision: number }
  | { readonly outcome: "CHANGED"; readonly expected: number; readonly observed: number }
  | { readonly outcome: "UNVERIFIED" };

/**
 * Reads the report's current revision and compares it against an expectation.
 *
 * This is the guard a raid-night batch performs after every selected fight has
 * been processed: one cheap request proving the whole snapshot still describes a
 * single export. Issuing it once at the end rather than per fight is the same
 * reasoning M3 already applies within one fight — a change anywhere invalidates
 * the whole run either way, so detecting it at the end is equally correct and
 * costs one request instead of many.
 *
 * Note what a caller must NOT do with `UNVERIFIED`: accept the batch. This
 * function reports what it could establish; deciding that an unverifiable
 * snapshot is unusable belongs to the layer that knows what the snapshot is for.
 */
export async function checkReportRevision(
  client: WclGraphqlClient,
  reportCode: string,
  expectedRevision: number,
): Promise<RevisionCheck> {
  const outcome = await client.execute({
    query: REPORT_REVISION_QUERY,
    variables: reportRevisionVariables(reportCode),
    decode: decodeReportRevision,
  });

  if (!outcome.ok || outcome.data === null) {
    return { outcome: "UNVERIFIED" };
  }
  return outcome.data === expectedRevision
    ? { outcome: "MATCHES", revision: outcome.data }
    : { outcome: "CHANGED", expected: expectedRevision, observed: outcome.data };
}

/**
 * Builds a report-revision reader over the real transport.
 *
 * The final batch guard needs one cheap query, and it needs the same OAuth token
 * the rest of the request already minted — so it takes the shared cache like
 * every other production factory here.
 *
 * It returns what the check established and decides nothing. A raid night treats
 * `UNVERIFIED` as fatal; M3's per-fight recheck does not. Putting that judgement
 * in the reader would make one of the two callers wrong.
 */
export function createReportRevisionReader(deps: {
  readonly fetch: FetchLike;
  readonly now?: (() => number) | undefined;
  readonly tokenCache?: TokenCache | undefined;
}) {
  return async (
    reportCode: string,
    expectedRevision: number,
    credentials: WclCredentials,
  ): Promise<RevisionCheck> => {
    const tokens = createTokenProvider({
      credentials,
      fetch: deps.fetch,
      now: deps.now ?? Date.now,
      cache: deps.tokenCache,
    });
    return await checkReportRevision(
      createGraphqlClient({ tokens, fetch: deps.fetch }),
      reportCode,
      expectedRevision,
    );
  };
}
