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
import { paginateEventStream } from "../../../../src/wcl/paginator.js";
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
    // Past the end of the sequence is a harness defect, not upstream behaviour:
    // the artifact must carry every page the paginator will ask for.
    if (page === undefined) return jsonResponse(500, { error: "page sequence exhausted" });
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
  return pass();
}
