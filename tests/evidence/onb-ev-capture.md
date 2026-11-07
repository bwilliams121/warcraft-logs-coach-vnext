# ONB-EV neutral evidence campaign: provenance

Human-readable record of the campaign's Warcraft Logs requests. Nothing here is read by a test, and it backs no artifact: this campaign has captured no evidence.

## Authority

Owner grant of 2026-11-06, `agent/autopilot-queue.md` "ONB-EV" and `agent/architecture.md` "Owner grant (2026-11-06): ONB-EV": at most 60 Warcraft Logs HTTP requests, running ONB-EV-PLAN's frozen plan.

Plan: `agent/onb-ev-plan.json`, digest `48066f986e7035542bf81c0263f4cec0d9d70e0f3d892ab6eb7ed535e6fa0013`, rule revision `onb-ev-selection/1`. The runner checked the digest before its first request. The plan is unedited and its status stays `FROZEN`, since it has not been executed.

## Requests (2026-11-07): 2 of 60, 58 left

Counted at the fetch layer, by a counter that refuses a 61st HTTP request.

| # | Time (UTC) | Request | HTTP | Outcome |
| --- | --- | --- | ---: | --- |
| 1 | 06:58:33.019 | OAuth client-credentials token | 200 | OK |
| 2 | 06:58:33.568 | Listing, 12.1.0.69933 page 1: `reports(zoneID: 53, startTime: 1790737200000, endTime: 1791778694000, limit: 100, page: 1)` with the plan's fields | 200 | **Refused**: one GraphQL error, `UPSTREAM_DATA_INVALID`, stage TRANSPORT |

The refusal's body is 79 characters long, sha256 `f9c86105ac35a6f8e6acc5fd0d9875603306ab673abb5e95750df67551e32a8e`. **Its text was not retained.** The runner's ledger kept the length and digest of each body, and the production client reports only the count of GraphQL errors, so the reason Warcraft Logs gave is unknown.

## The owner's retry and plan revision 2 (2026-11-07)

| # | Time (UTC) | Request | HTTP | Outcome |
| --- | --- | --- | ---: | --- |
| 3 | 08:29:27.986 | OAuth client-credentials token | 200 | OK |
| 4 | 08:29:28.536 | The identical listing, with the same query and variables as request 2 | 200 | **Refused**, the same 79-character body with the same sha256 |

The body's text, now retained: `{"errors":[{"message":"Max query complexity should be 50000 but got 100701."}]}`. Selected headers: `content-type: application/json`, `x-ratelimit-limit: 800`, `x-ratelimit-remaining: 798`. No retry-after. Category: GraphQL error, no code supplied. Attributable to the listing's query shape, because the message says so and carries the numbers.

Revision 2 (`agent/onb-ev-plan.json`, digest `49303e1c03d0a056829b3474c1c47dc8cf0a37ca99ba5c532c74650c5519828f`) repairs that one thing. See `agent/architecture.md` "ONB-EV plan revision 2". Requests 1 to 4 ran against revision 1, digest `48066f986e7035542bf81c0263f4cec0d9d70e0f3d892ab6eb7ed535e6fa0013`.

## Selection: none

No listing was read, so there is no candidate, no selected fight, no subject, no report code, no fight context and no event page. Nothing was read about any player or fight. No rankings, comparison or top-log data was requested.

All twelve specializations still need evidence, and none is completed: Discipline Priest, Subtlety Rogue, Fury Warrior, Protection Warrior, Enhancement Shaman, Outlaw Rogue, Guardian Druid, Survival Hunter, Frost Mage, Affliction Warlock, Marksmanship Hunter and Vengeance Demon Hunter.

## Why it stopped

The plan fixes this outcome: "If the first listing is refused or too complex, ONB-EV stops for the owner. It does not try another query" (`agent/architecture.md` "ONB-EV-PLAN"). No query was retried, narrowed or replaced.

The raw ledger is the gitignored `.probe/onb-ev/ledger.json`, and the summary is beside it.
