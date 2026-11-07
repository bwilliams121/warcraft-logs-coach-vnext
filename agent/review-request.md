# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-EV: the neutral evidence campaign's run on plan revision 2. Branch `autopilot/onb-ev`, PR #103. Revision 2 itself was reviewed APPROVED and committed (5251d57) before request 5.

- **Public contract change: NONE.** No file under `src/` changes.
- **Records only since that commit,** plus the plan's `status`, which is outside its digest. No fixture, limit or registration changes.

## The result

**Stopped with OWNER_DECISION_REQUIRED at 56 of 60 requests, 4 left.** Six of twelve captured, raw. The next capture needed 12 at its ceiling and the campaign does not skip ahead. The owner's report is `agent/follow-ups.md` "After ONB-EV's cap stop".

## Every Warcraft Logs request

| # | Time (UTC, 2026-11-07) | Request | HTTP | Body chars | Outcome | Body sha256 |
| --- | --- | --- | ---: | ---: | --- | --- |
| 1 | 06:58:33.019 | OAuth client-credentials token | 200 |  | OK |  |
| 2 | 06:58:33.568 | Listing 12.1.0.69933, limit 100 (revision 1) | 200 | 79 | Refused | `f9c86105ac35` |
| 3 | 08:29:27.986 | OAuth client-credentials token | 200 |  | OK |  |
| 4 | 08:29:28.536 | The identical listing, the owner's retry | 200 | 79 | Refused | `f9c86105ac35` |
| 5 | 08:39:56.794 | OAuth client-credentials token | 200 |  | OK |  |
| 6 | 08:39:57.337 | Listing 12.1.0.69933, limit 34, request page 1 | 200 | 336,133 | OK | `4dfec13352c6` |
| 7 | 08:40:06.608 | Listing 12.1.0.69933, limit 34, request page 2 | 200 | 343,853 | OK | `25f59608fbbc` |
| 8 | 08:40:15.772 | Listing 12.1.0.69933, limit 34, request page 3 | 200 | 397,676 | OK | `6100ff18dedd` |
| 9 | 08:40:26.042 | Fight context, priest/discipline | 200 | 354,096 | OK | `10c938044bd1` |
| 10 | 08:40:26.586 | Events, fight 4, page 1 | 200 | 1,566,215 | OK | `f6225abbaef6` |
| 11 | 08:40:26.904 | Events, fight 4, page 2 | 200 | 1,405,896 | OK | `5de188d00a98` |
| 12 | 08:40:27.213 | Events, fight 4, page 3 | 200 | 1,443,432 | OK | `0f8f13c2d852` |
| 13 | 08:40:27.586 | Events, fight 4, page 4 | 200 | 1,431,779 | OK | `3db4cfecf20e` |
| 14 | 08:40:27.874 | Events, fight 4, page 5 | 200 | 1,391,403 | OK | `a9fa0e42784e` |
| 15 | 08:40:28.145 | Events, fight 4, page 6 | 200 | 1,397,529 | OK | `3843fe205c82` |
| 16 | 08:40:28.417 | Events, fight 4, page 7 | 200 | 1,462,280 | OK | `9968f7867313` |
| 17 | 08:40:28.737 | Events, fight 4, page 8 | 200 | 1,410,942 | OK | `4dfea26d54e0` |
| 18 | 08:40:29.017 | Events, fight 4, page 9 | 200 | 1,387,037 | OK | `08c304275987` |
| 19 | 08:40:29.308 | Events, fight 4, page 10 | 200 | 480,520 | OK | `3e8c6b056cb2` |
| 20 | 08:40:29.531 | Report revision | 200 | 49 | OK | `c933291fd4d0` |
| 21 | 08:40:29.696 | Fight context, rogue/subtlety | 200 | 120,622 | OK | `d8d778baaeb6` |
| 22 | 08:40:30.138 | Events, fight 16, page 1 | 200 | 3,298,503 | OK | `a8e153000d27` |
| 23 | 08:40:30.542 | Events, fight 16, page 2 | 200 | 3,313,815 | OK | `31f09b17ecfa` |
| 24 | 08:40:30.957 | Events, fight 16, page 3 | 200 | 3,290,347 | OK | `4fc55a620733` |
| 25 | 08:40:31.369 | Events, fight 16, page 4 | 200 | 3,248,156 | OK | `e17e91fffe5d` |
| 26 | 08:40:31.791 | Events, fight 16, page 5 | 200 | 3,167,757 | OK | `377e9fd3d4a7` |
| 27 | 08:40:32.193 | Events, fight 16, page 6 | 200 | 3,204,115 | OK | `35e549a541c2` |
| 28 | 08:40:32.619 | Events, fight 16, page 7 | 200 | 3,209,346 | OK | `1d2278aff555` |
| 29 | 08:40:33.042 | Events, fight 16, page 8 | 200 | 3,208,871 | OK | `0a0c486073f1` |
| 30 | 08:40:33.629 | Events, fight 16, page 9 | 200 | 27,393 | OK | `d5366683aa1a` |
| 31 | 08:40:33.822 | Report revision | 200 | 49 | OK | `c933291fd4d0` |
| 32 | 08:40:34.002 | Fight context, warrior/fury | 200 | 243,688 | OK | `4ac1f63da8a2` |
| 33 | 08:40:34.598 | Fight context, hunter/survival | 200 | 243,687 | OK | `3f51b837a2cd` |
| 34 | 08:40:34.917 | Events, fight 16, page 1 | 200 | 3,145,318 | OK | `a057da21556f` |
| 35 | 08:40:35.314 | Events, fight 16, page 2 | 200 | 3,157,291 | OK | `064f7fa4ccd0` |
| 36 | 08:40:35.709 | Events, fight 16, page 3 | 200 | 3,138,747 | OK | `ad92bdb48fe2` |
| 37 | 08:40:36.113 | Events, fight 16, page 4 | 200 | 3,017,950 | OK | `3bd0e8d26010` |
| 38 | 08:40:36.524 | Events, fight 16, page 5 | 200 | 1,784,560 | OK | `7bb7f1b4bf90` |
| 39 | 08:40:36.860 | Report revision | 200 | 49 | OK | `c933291fd4d0` |
| 40 | 08:40:37.025 | Fight context, warrior/protection | 200 | 91,907 | OK | `1021b61db8c8` |
| 41 | 08:40:37.620 | Events, fight 1, page 1 | 200 | 3,080,279 | OK | `63c7cecd51ce` |
| 42 | 08:40:38.029 | Events, fight 1, page 2 | 200 | 3,047,489 | OK | `ebc83db1570e` |
| 43 | 08:40:38.465 | Events, fight 1, page 3 | 200 | 3,107,437 | OK | `99d4d9a278c1` |
| 44 | 08:40:38.873 | Events, fight 1, page 4 | 200 | 3,057,967 | OK | `54ff982bfc9f` |
| 45 | 08:40:39.245 | Events, fight 1, page 5 | 200 | 3,049,453 | OK | `1c187c738c22` |
| 46 | 08:40:39.640 | Events, fight 1, page 6 | 200 | 3,041,980 | OK | `ec2d40bea189` |
| 47 | 08:40:40.015 | Events, fight 1, page 7 | 200 | 1,188,085 | OK | `ad6c95472a4c` |
| 48 | 08:40:40.368 | Report revision | 200 | 49 | OK | `c933291fd4d0` |
| 49 | 08:40:40.545 | Fight context, shaman/enhancement | 200 | 243,648 | OK | `16e557bde85c` |
| 50 | 08:40:41.219 | Events, fight 8, page 1 | 200 | 1,577,487 | OK | `84bcd18bb993` |
| 51 | 08:40:41.515 | Events, fight 8, page 2 | 200 | 1,398,331 | OK | `36d3ee8043f8` |
| 52 | 08:40:41.783 | Events, fight 8, page 3 | 200 | 1,372,552 | OK | `6654b967082c` |
| 53 | 08:40:42.074 | Events, fight 8, page 4 | 200 | 1,397,767 | OK | `e4b1f6a459cb` |
| 54 | 08:40:42.355 | Events, fight 8, page 5 | 200 | 1,410,491 | OK | `5a5834a6c8c7` |
| 55 | 08:40:42.629 | Events, fight 8, page 6 | 200 | 1,323,630 | OK | `d6da5364a2f8` |
| 56 | 08:40:42.895 | Report revision | 200 | 49 | OK | `c933291fd4d0` |

Requests 2 and 4 ran revision 1's listing, `limit: 100`. Requests 6 to 8 sent the same query and interval with `limit: 34`, pages 1 to 3. No rankings, comparison or top-log data. Report codes are in the raw ledger only.

## Decisions for the reviewer to check

1. **Neutrality of what was read.** Selection ran before any event page, on identity and bounds. No candidate was changed, and no fight replaced. `measure.mjs` reads event types, counts and identity fields. The six "still requiring evidence" are the rule's result, with their fights already chosen.
2. **The stop.** 4 left, and 12 needed at the ceiling. Should anything else have been sent? No: `mayStartCapture` and "never skip ahead" say no.
3. **The cap's arithmetic.** 61 + 2 - 4 = 59, a cap of 119. Is the ceiling the right base, rather than the expected 46?
4. **The capacity recommendation.** No raise now, REM-CENSUS from raw first, and a pinned exception only for a subject whose gate passes. The grant asks for "the smallest justified new limit", so the record also gives a line, 6,376,343, with what it does and does not hold. Is that an honest answer, or should the recommendation be the line?
5. **`status: EXECUTED`.** The plan's run happened though six were not captured. It ends the drift checks that say "while unexecuted". The follow-up asked for it. Is a partial run the right place for it?
6. **Pseudonyms.** The evidence record uses `EV-R<n>`, per the plan's storage rule, with fight and actor ids and encounter ids. Does anything else there identify a report or a player?
7. **Audit disclosure.** The supervisor's audit still does not match this runner. The ledger and these tables are the record.

## Validation

- `tests/unit/onb-ev-plan.test.ts`, `npm run typecheck`, `npm run format:check`, `npm run test:evidence` and `git diff --check`: run on this tree. The result is in the PR, and CI runs the whole suite.
- Runner offline checks: 10 of 10 before the run. Real-service proof now covers the listing split, the gate, both event windows and the revision check, and not a gate refusal, a page ceiling or a transport failure.
- No evaluator or gate was run on this evidence. That is REM-CENSUS's.
