# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-EV-PLAN: freeze the neutral evidence campaign plan. Branch `autopilot/onb-ev-plan`, from `main` at 56d6278.

- **Public contract change: NONE.** No file under `src/contracts/`, `src/api/` or `src/mcp/` changes.
- **Warcraft Logs: no request was made.** All measurements read retained captures.
- **Nothing is selected, captured, committed as evidence or promoted.**

## The result

All twelve recorded specializations stay. The plan's worst case is 200 requests against ONB-EV's hard cap of 60, so ONB-EV runs in the frozen order and stops at the cap with its report. Every fixture is also larger than the 5,212 bytes left under the archive's notice line, so ONB-EV will end at an owner decision either way. Nothing is dropped or reordered to fit. `agent/architecture.md` "ONB-EV-PLAN" has the argument and the numbers.

## What changed

1. **`agent/onb-ev-plan.json`.** The frozen plan, digest `48066f986e7035542bf81c0263f4cec0d9d70e0f3d892ab6eb7ed535e6fa0013`: the twelve rows with their families and retained evidence, the proven intervals and the one excluded, the listing, order and gate, the capture shape, the ceilings, the budget and the storage numbers.
2. **`scripts/corpus/onb-ev-selection.mjs` and its types.** The selection rule as pure code, so ONB-EV executes what the plan says and a test can hold it to that. It makes no request. It reads identity and bounds only.
3. **`tests/unit/onb-ev-plan.test.ts`.** The digest, including that the queue names it. The list and its order, the arithmetic, and that the listing asks for nothing excluded. While the plan is unexecuted, each row against its production registration, and the intervals against the deploy calendar and the profile record. Neutrality: listing order and every non-identity field move nothing. Negatives: an unproven or excluded build, a missing region, another class's Frost or Protection, a misaligned roster, missing master data, an actor listed twice, and windows at their edges.
4. **Records.** `agent/architecture.md`, `agent/follow-ups.md`, `agent/spec-onboarding-inventory.md`, and in `agent/autopilot-queue.md` the supervisor's merged list, this entry's status and ONB-EV's pointer to the plan. ONB-EV's grant text is not touched.

## Decisions for the reviewer to check

1. **Unfiltered capture is the reading of "minimum".** The grant says "minimum actor and fight evidence the existing evaluator and promotion gate need (casts, auras, resources, combatant information ...)". A server-filtered actor stream would fit the cap and could never pass a gate, because the loader refuses a filtered capture any coverage (`FILTERED_CAPTURE_GRANTED`). So the plan takes the unfiltered `dataType: All` stream, re-cut offline into actor slices, with other players' events staying in gitignored raw pages. If this is outside the grant's words, say so: it is the one thing here that could be an owner decision.
2. **The first 90 s for rotational rows.** No rotational gate has a window. Havoc passed both gates on one first-90-s segment, the smallest solo precedent. Fixed before any candidate is known.
3. **Wipes qualify, and `kill` is not even requested.** Reading no outcome seemed stronger than a kill filter, and kills are few on the retained listing. POLB-A chose kills for a reason that does not apply here (later phases).
4. **A gate refusal may move to the next candidate; nothing after a page is requested may.** The queue says "no replacement fight or alternate subject because of any result". The plan reads a context refusal as the candidate not qualifying, since it reads no event, and bounds it at two retries a specialization.
5. **Stop at the first capture that does not fit, with no skipping ahead.** This can leave requests unspent. Skipping would serve a later specialization first, which is the reordering the queue reserves for the owner.
6. **12.1.5.70575 is excluded though the calendar proves it,** because the profile record does not list it and 12.1.5 is deferred. Both facts are tested.
7. **Discipline stays first in the recorded order,** though it costs the most. The plan says so and does not move it.
8. **The listing is partly unverified.** M13-A proved it at `limit: 10`, without time arguments, region or master data. A refusal stops ONB-EV for the owner rather than trying another query.

## Validation

- `tests/unit/onb-ev-plan.test.ts`: 28 tests pass.
- `npm run typecheck` and `npm run format:check`: clean. `git diff --check`: clean.
- `npm run test:corpus`: PASSED, 253 cases, 848 assertions. `npm run test:evidence`: PASSED, 32 cases, 80 assertions.
- Full suite in parallel, `--testTimeout=60000`: 20,768 of 20,770. The two failures are `m9b-corpus-harness` SPEC_PROTECTION_PALADIN and `runner-service-queue` W, which failed the same way on earlier tranches under parallel load. Rerun serially on this tree, both files pass. This tranche touches neither.
- The eligibility census and page measurements read uncommitted retained captures, so they are recorded and not pinned (recipe in `.probe/onbevplan`).
