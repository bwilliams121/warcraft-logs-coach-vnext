# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-EV: the neutral evidence campaign, first run. Branch `autopilot/onb-ev`, from `main` at 50fb71e.

- **Public contract change: NONE.** No file under `src/contracts/`, `src/api/` or `src/mcp/` changes.
- **No code, evidence artifact or plan edit.** This change is records only.
- **Nothing is selected, captured or promoted.**

## The result

**The campaign stopped for the owner after 2 of its 60 requests.** Warcraft Logs refused the frozen plan's first listing. ONB-EV-PLAN fixes that outcome: "If the first listing is refused or too complex, ONB-EV stops for the owner. It does not try another query." So nothing was retried, narrowed or replaced.

## Every Warcraft Logs request

| # | Time (UTC, 2026-11-07) | Request | HTTP | Outcome |
| --- | --- | --- | ---: | --- |
| 1 | 06:58:33.019 | OAuth client-credentials token | 200 | OK |
| 2 | 06:58:33.568 | Listing, 12.1.0.69933 page 1: `reports(zoneID: 53, startTime: 1790737200000, endTime: 1791778694000, limit: 100, page: 1)` with the plan's fields | 200 | Refused: one GraphQL error, `UPSTREAM_DATA_INVALID`, stage TRANSPORT, 79-character body, sha256 `f9c86105ac35a6f8e6acc5fd0d9875603306ab673abb5e95750df67551e32a8e` |

Consumed 2, remaining 58. Completed: none. All twelve specializations still need evidence.

## What changed

1. **`tests/evidence/onb-ev-capture.md`.** The durable request record. It names no report, fight or player, because none was read.
2. **`agent/architecture.md`** "ONB-EV — stopped at the first listing", **`agent/follow-ups.md`** "After ONB-EV's first run", and one line in **`agent/spec-onboarding-inventory.md`**.
3. **`agent/autopilot-queue.md`.** ONB-EV-PLAN is MERGED with its PR and SHA. ONB-EV is PR_OPEN with its branch and a pointer to this stop. Its grant text is not touched. The other 78 rows of the supervisor's merged list were already recorded, and a script confirmed that.
4. **`agent/onb-ev-plan.json` is not touched,** and its status stays `FROZEN`, because it has not been executed.

## Decisions for the reviewer to check

1. **Stopping is the right reading.** The plan and the grant leave no retry here. A retry of the identical query is not "another query", but this stop's next step is still given to the owner rather than taken, since the plan says the listing refusal stops for the owner.
2. **The error text is unknown, and that is a runner gap.** The runner kept each body's length and digest, and the production client keeps only the error count. The records say so and do not guess at a cause. Offline guesses against the digest matched nothing.
3. **The proposed owner question.** Send the identical listing once more, keeping the error text, and if the text shows that the listing's shape is the cause, change only the listing in a new plan revision before going on. Both count against the 60. Is that the right question, and is anything in it outside the grant?
4. **The audit gap is disclosed and not fixed.** The command that ran, `npx vitest run --config .probe/onb-ev/capture.config.ts`, matches none of the supervisor's `WclActivityPatterns`, so the transcript audit cannot be relied on to stop this tranche. The tranche's stop and these records disclose it, and follow-ups records the supervisor fix. Changing the supervisor is outside this campaign.
5. **The runner is uncommitted,** as ONB-EV-PLAN's follow-up says (`.probe/onb-ev/`). An offline stub checked its stops. Only its refused-listing path has met the real service.

## Validation

- `tests/unit/onb-ev-plan.test.ts`: 28 tests pass, including the drift checks, which still run because the plan is `FROZEN`.
- `npm run typecheck` and `npm run format:check`: clean. `git diff --check`: clean.
- `npm run test:evidence`: PASSED, 32 cases, 80 assertions.
- The full suite was not run locally, because this change touches no code. CI runs it.
- The offline stub of the uncommitted runner: 5 of 5 pass. It is not part of any suite.
