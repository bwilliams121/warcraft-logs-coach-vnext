/**
 * WCL_TRANSPORT executors: the real decoder and the real paginator, driven
 * over artifact bytes through the offline fake fetch. Every claim is about
 * `src/wcl`.
 *
 * NO NETWORK. The paginator here runs over `createTestGraphqlClient`, whose
 * fetch is a recorder that answers from the artifact's page sequence. Nothing
 * can reach Warcraft Logs from this module, and the layering guard checks it
 * imports no live transport composition.
 */

import { decodeEventPage } from "../../../../src/wcl/events-query.js";
import { resolveFightIdentity } from "../../../../src/wcl/identity.js";
import { paginateEventStream } from "../../../../src/wcl/paginator.js";
import { decodePreflight } from "../../../../src/wcl/preflight-query.js";
import { createEventRetrievalPlan } from "../../../../src/wcl/retrieval-plan.js";
import type { RawEventPage } from "../../../../src/wcl/retrieval-types.js";
import { jsonResponse } from "../../fake-fetch.js";
import { createTestGraphqlClient, variablesOf } from "../../wcl-harness.js";
import type { LoadedArtifact } from "../loader.js";
import { fail, pass, type AssertionOutcome } from "./outcome.js";
import type { ParamsOf } from "./params.js";

export function eventPageOutcome(
  artifact: LoadedArtifact,
  params: ParamsOf<"WCL_DECODE.EVENT_PAGE_OUTCOME">,
): AssertionOutcome {
  const decoded = decodeEventPage(artifact.json);
  const actual = decoded.ok ? decoded.value.kind : "DECODE_FAILED";
  if (actual !== params.expected) {
    return fail("the event-page decoder classified the payload differently", {
      expected: { outcome: params.expected },
      actual: { outcome: actual },
    });
  }
  return pass();
}

export async function paginationStreamOutcome(
  artifact: LoadedArtifact,
  params: ParamsOf<"WCL_PAGINATION.STREAM_OUTCOME">,
): Promise<AssertionOutcome> {
  if (!Array.isArray(artifact.json))
    return fail("a page sequence artifact must be a JSON array of decoded data objects");
  const pages = artifact.json as readonly unknown[];

  const received: RawEventPage[] = [];
  const { client, fetch } = createTestGraphqlClient((_request, index) => {
    const page = pages[index];
    // A request past the end of the sequence is answered as an upstream
    // failure. That models the one honest thing a bounded capture can say
    // about the page it never retrieved: it was not obtained. The transport
    // classifies it, and the stream must end PARTIAL keeping every retrieved
    // page — never COMPLETE and never an empty period.
    if (page === undefined) return jsonResponse(500, { error: "page not retrieved" });
    return jsonResponse(200, { data: page });
  });
  const plan = createEventRetrievalPlan({
    reportCode: "aBcDeFgH12345678",
    fightId: 1,
    startTimeMs: params.plan.startTimeMs,
    endTimeMs: params.plan.endTimeMs,
    includeResources: false,
    limit: params.plan.limit,
  });
  const result = await paginateEventStream(
    { plan, hostility: "UNSPECIFIED", onPage: (page) => received.push(page) },
    { client, now: () => 0 },
  );

  const requestedStartTimes = fetch.graphqlCalls().map((request) => variablesOf(request.body)["startTime"]);
  const actual = {
    state: result.completeness.state,
    reason: result.completeness.reason,
    pagesRetrieved: result.completeness.pagesRetrieved,
    eventsRetrieved: result.completeness.eventsRetrieved,
    requestedStartTimes,
  };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the paginator did not end the stream as the case pins", {
      expected: params.expected,
      actual,
    });
  }

  // No global sort, no deduplication: what the sink received is exactly the
  // artifact's pages, in order, event for event.
  const served = received.map((page) => page.events);
  const expectedPages = pages.slice(0, received.length).map((page) => {
    const decoded = decodeEventPage(page);
    return decoded.ok && decoded.value.kind === "PAGE" ? decoded.value.events : null;
  });
  if (JSON.stringify(served) !== JSON.stringify(expectedPages)) {
    return fail("the paginator handed the sink something other than the pages verbatim, in order", {
      expected: { pagesVerbatimInOrder: true },
      actual: { pagesVerbatimInOrder: false },
    });
  }
  return pass();
}

export function pageEnvelopeFacts(
  artifact: LoadedArtifact,
  params: ParamsOf<"WCL_PAGINATION.PAGE_ENVELOPE_FACTS">,
): AssertionOutcome {
  if (!Array.isArray(artifact.json))
    return fail("a page sequence artifact must be a JSON array of decoded data objects");
  const facts: {
    eventCount: number;
    firstTimestamp: number | null;
    lastTimestamp: number | null;
    nextPageTimestamp: number | null;
  }[] = [];
  for (const [index, page] of (artifact.json as readonly unknown[]).entries()) {
    const decoded = decodeEventPage(page);
    if (!decoded.ok || decoded.value.kind !== "PAGE") {
      return fail(`page ${String(index)} did not decode as a PAGE`, {
        expected: { kind: "PAGE" },
        actual: { kind: decoded.ok ? decoded.value.kind : "DECODE_FAILED" },
        locator: { pageIndex: index },
      });
    }
    const timestamps = decoded.value.events.map((event) =>
      typeof event === "object" && event !== null ? (event as { timestamp?: unknown }).timestamp : undefined,
    );
    const first = timestamps[0];
    const last = timestamps[timestamps.length - 1];
    facts.push({
      eventCount: decoded.value.events.length,
      firstTimestamp: typeof first === "number" ? first : null,
      lastTimestamp: typeof last === "number" ? last : null,
      nextPageTimestamp: decoded.value.nextPageTimestamp,
    });
  }
  if (JSON.stringify(facts) !== JSON.stringify(params.pages)) {
    return fail("the page envelopes carry different facts than the case pins", {
      expected: params.pages,
      actual: facts,
    });
  }
  for (let index = 0; index + 1 < facts.length; index += 1) {
    const page = facts[index];
    const next = facts[index + 1];
    if (page === undefined || next === undefined) continue;
    const holds =
      page.nextPageTimestamp !== null &&
      page.nextPageTimestamp === next.firstTimestamp &&
      page.lastTimestamp !== null &&
      page.nextPageTimestamp > page.lastTimestamp;
    if (!holds) {
      return fail(
        `the boundary between pages ${String(index)} and ${String(index + 1)} does not obey ${params.boundaryRule}`,
        {
          expected: { rule: params.boundaryRule },
          actual: {
            cursor: page.nextPageTimestamp,
            previousLast: page.lastTimestamp,
            nextFirst: next.firstTimestamp,
          },
          locator: { pageIndex: index },
        },
      );
    }
  }
  return pass();
}

export function fightIdentity(
  artifact: LoadedArtifact,
  params: ParamsOf<"WCL_TRANSPORT.FIGHT_IDENTITY">,
): AssertionOutcome {
  const decoded = decodePreflight(artifact.json);
  if (!decoded.ok)
    return fail("the preflight decoder rejected the report context", {
      expected: "decodable",
      actual: "DECODE_FAILED",
    });
  const resolution = resolveFightIdentity(decoded.value, {
    reportCode: decoded.value.report?.code ?? "",
    fightId: params.fightId,
    sourceId: params.sourceId,
  });
  const actual = resolution.ok
    ? {
        ok: true,
        className: resolution.identity.player.className,
        specName: resolution.identity.player.specName,
        playerName: resolution.identity.player.name,
        reportRevision: resolution.identity.report.revision,
        logVersion: resolution.identity.data.logVersion,
        gameVersion: resolution.identity.data.gameVersion,
      }
    : { ok: false, reason: resolution.reason };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("identity resolved differently than the case pins", { expected: params.expected, actual });
  }
  return pass();
}
