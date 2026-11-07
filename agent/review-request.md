# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-EV: plan revision 2, an API-compatibility correction under the owner's decision of 2026-11-07. Branch `autopilot/onb-ev`, PR #103. **This review comes before any further request**, as the decision requires: no listing has been read and nothing has been selected or captured.

- **Public contract change: NONE.**
- **Uncommitted owner text is part of this diff:** the decision in `agent/architecture.md` and the queue's ONB-EV entry, and its `wcl` line. They are the owner's and are committed unedited.

## Every Warcraft Logs request so far: 4 of 60, 56 left

| # | Time (UTC, 2026-11-07) | Request | HTTP | Outcome |
| --- | --- | --- | ---: | --- |
| 1 | 06:58:33.019 | OAuth token | 200 | OK |
| 2 | 06:58:33.568 | Listing 12.1.0.69933 page 1: `reports(zoneID: 53, startTime: 1790737200000, endTime: 1791778694000, limit: 100, page: 1)` | 200 | Refused, 79 characters, sha256 `f9c86105…2a8e` |
| 3 | 08:29:27.986 | OAuth token | 200 | OK |
| 4 | 08:29:28.536 | The identical listing, the owner's one retry | 200 | Refused, the same body |

The body: `{"errors":[{"message":"Max query complexity should be 50000 but got 100701."}]}`. No code supplied. `x-ratelimit-remaining` 798 of 800, no retry-after.

## What changed

1. **`agent/onb-ev-plan.json`, revision `onb-ev-plan/2`**, digest `49303e1c03d0a056829b3474c1c47dc8cf0a37ca99ba5c532c74650c5519828f`. Adds `revisionOf` and `discovery.listingRequestLimit: 34`, and restates `requestBudget`. Status stays `FROZEN`.
2. **`scripts/corpus/onb-ev-selection.mjs`.** Adds `listingRequestPagesOf` and `assembleListingPage`. `worstCaseRequests` now counts requests. `selectSubjects`, `capturesOf`, `mayStartCapture` and `pageCeilingOf` are not edited.
3. **`tests/unit/onb-ev-plan.test.ts`.** Eight new tests, and two budget tests restated with the revision (see decision 4).
4. **Records.** `agent/architecture.md` "ONB-EV plan revision 2", the queue entry, `agent/follow-ups.md`, `tests/evidence/onb-ev-capture.md`.

## Decisions for the reviewer to check

1. **Classification.** The message names the cause, is identical 90 minutes apart, and names nothing from the decision's other-stop list. Is "demonstrated query shape" right?
2. **Minimality and population.** Is three requests of limit 34, cut back by position to the same 100 rows, within "splitting one unsupported request into the minimum equivalent supported requests"? Each request reads the same fields, so per-report costs are not reduced by dropping a field: dropping one would change what selection reads.
3. **Why 34 rather than 49.** Same three requests, fewer rows past the page's end, more margin for an unknown constant. The linearity is an inference, and a refusal at 34 stops for the owner.
4. **Two tests are restated, not weakened.** "the first capture always fits" was true only of revision 1's budget. It becomes: it fits after one listing page with all twelve subjects, and after all four with five, with six stopping at the cap. Revision 1's digest is recomputed from revision 2 to prove the rest did not move.
5. **The offset assumption.** Revision 2 assumes the service pages by offset over one ordering at any limit. A short request page followed by more rows stops the campaign rather than guessing.
6. **The runner is uncommitted** (`.probe/onb-ev/`, gitignored). It continues the ledger at 4, refuses any other count, keeps sanitized GraphQL error bodies and never reads the token body or the auth header. The scrubber is one function, `.probe/onb-ev/scrub.ts`, because a first draft lost its backslashes in a shell heredoc (the previous review's finding). The offline check now proves bearer credentials, JWTs, the client id and the client secret are removed, and the complexity refusal survives unchanged: 10 of 10 pass, 5 on the split listing and 5 on the scrubber. No request was made for this.

## What happens after APPROVED

Commit and push this, then run the plan: one token, then listing requests. It will stop at the cap or complete, and capacity will stop it for the owner in either case. Those results get their own review before the tranche ends.

## Validation

- `tests/unit/onb-ev-plan.test.ts`: 36 tests, run after the records. The result is in the PR.
- `npm run typecheck`, `npm run format:check`, `npm run test:evidence`, `git diff --check`.
