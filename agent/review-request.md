# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-S5: shared resource pooling and wait semantics. Branch `autopilot/onb-s5`,
from main at 400987b.

- **Internal shared engine only.** New `src/simc/pooling.ts` and
  `src/simc/wait-actions.ts`. Changes to `nested-selection.ts`,
  `first-gcd-selection.ts` and `list-selection.ts`. Nothing under
  `src/contracts/`, `src/api/` or `src/mcp/` changes, and no specialization
  module changes. No registered APL contains a waiting line (checked:
  `src/simc/data/*.json` has no `pool_resource` or `wait*` token), so no
  public decision changes.
- **Warcraft Logs: NONE.** No request, probe or capture. All tests are
  synthetic authorities.
- Queue bookkeeping: ONB-S4 is recorded MERGED (PR #42, 400987bc…) and ONB-S5
  is set PR_OPEN. The other merged tranches the supervisor listed were
  already recorded MERGED with their pr and mergeSha.

## Direction

`agent/autopilot-queue.md` ONB-S5 (M11-D0 census Cohort C: Outlaw, Feral).
Scope:

- Pinned semantics for `pool_resource`, `wait`, `wait_for` and pooling-gated
  lines in the shared engine.
- What the APL selects while pooling.
- How an observed cast compares against a pooling decision.
- Undecidable pooling states are UNKNOWN. Continuous resources stay
  intervals.

## Pinned semantics (SimulationCraft 33622e9d)

Sources: player.cpp:9706-9840 (wait family), 10640-10816 (`pool_resource_t`),
11115-11126 (tokens), 14175-14267 (`select_action`), 7130-7133
(`available()`); action.cpp:2381-2396, 2567-2667 (readiness), 2856-2865
(pruning). Recorded in the `pooling.ts` header.

- **Tokens:** `pool_resource`, `wait`, `wait_until_ready`,
  `wait_for_cooldown`. There is no `wait_for` token at the pin, so it is not
  recognised.
- **`pool_resource,for_next=1`:**
  - It guards the very NEXT line of its list. When that line is background,
    `init()` prunes the pool line with it. With no next line, `reset()`
    backgrounds it.
  - It is ready iff the guarded line's whole `action_ready()` is false now
    and true with the pooled resource at its maximum, and its own `if=`
    holds.
  - `extra_amount` is refused.
- **`pool_resource` without `for_next`:** ready iff its `if=` holds. There is
  no cost, cooldown or cast time, and it is usable while moving.
- **`wait`, `wait_until_ready`, `wait_for_cooldown`:** readiness also fails
  while moving (`execute_time() > 0`) or right after the same wait, and
  `wait_for_cooldown` also needs its cooldown down. None of these is
  established, so a true `if=` makes the line POSSIBLE at most.
- **Duration-only options:** `wait=`, `force_wait=` and `sec=` never change
  readiness.
- **A ready waiting line is RETURNED by the scan.** No ability is cast, and
  time passes before the next scan.

## Design (agent/architecture.md "ONB-S5")

**Nested scan.** A waiting line is read before applicability.

- A modelled `for_next` pool line is pushed as `POOL_PENDING_GUARDED_LINE`.
  The guarded line is then read by the ordinary rules, and the pool step is
  settled from that step:
  - NOT_APPLICABLE: `PRUNED_WITH_GUARDED_LINE`;
  - SELECTED: `GUARDED_READY`;
  - `line_cd` running, or PROVEN_UNUSABLE for a resource-independent reason:
    `NOT_RESOURCE_LIMITED`;
  - condition FALSE, INSUFFICIENT_RESOURCE, or a prefix execution: the new
    optional `poolingFor` resolver (`PoolingResolver`) is asked. It gets the
    scan's bindings, assigned variables included. It defaults to UNKNOWN;
  - MAY_SELECT: `UNDECIDED`.
- `POOLS` with a certain condition is SELECTED and ends the scan. Otherwise
  the pool line is a MAY_SELECT candidate, inserted before the guarded line's
  own candidate.
- Refused (new blocker `UNMODELLED_WAIT_ACTION`): unmodelled options, and a
  guarded line that is a variable, a dispatch, another wait or a retarget.
- Steps carry `waitAction: { kind, pooling? { guarded, resourceOption,
  decision, atMax? } }`.
- A new step outcome, `POOL_NOT_READY_CONTINUE`, is kept apart from
  `ELIMINATED_CONTINUE` (a false condition).

**First-GCD query.** Any candidate with `waitAction` returns UNKNOWN
`APL_WAIT_SELECTED` (new rescan blocker) before the lane is consulted. It is
never executed as a zero-time step, and coverage classifies it OTHER.

**Observed comparison.** No change to `observed-comparison.ts`. Against a
waiting selection, an observed cast is UNKNOWN `AUTHORITY_SELECTION_UNRESOLVED`
(raw blocker `APL_WAIT_SELECTED`). It is never MATCH and, in this build, never
REJECTED: `PUBLIC_COMPARISON_BASES` has no pooling basis, and adding one is a
public contract change. This is recorded in `agent/follow-ups.md`.

**Single-list walker.** A waiting line is capped at POSSIBLE.

**Resolver helper.** `guardedReadinessUnder(line, bindingsAtMax,
usabilityAtMax)` returns UNKNOWN for any option it would have to interpret,
an unsupported condition, or a true condition without proven usability.

## Files

- `src/simc/wait-actions.ts`: new. The tokens, kept apart so
  `list-selection.ts` can import them without a cycle.
- `src/simc/pooling.ts`: new. Semantics header, structure reader, resolver
  types, `poolDecisionOf`, the resource-independent reasons and the helper.
- `src/simc/nested-selection.ts`: `scanWaitLine`, `settlePendingPool`, the
  `poolingFor` input, the step field, two step outcomes and one blocker.
- `src/simc/first-gcd-selection.ts`: the `APL_WAIT_SELECTED` blocker and
  check.
- `src/simc/list-selection.ts`: the POSSIBLE cap.
- `tests/unit/onb-s5-pooling-wait.test.ts`: new, 39 tests.
- `tests/contracts/m5c3c3b-engine-scope.test.ts`: the exact rescan-blocker
  list gains `APL_WAIT_SELECTED`, with its reason.
- `agent/architecture.md` (new section "ONB-S5"), `agent/follow-ups.md`
  ("After ONB-S5"), `agent/testing.md` (index block),
  `agent/spec-onboarding-inventory.md` (notes), `agent/autopilot-queue.md`.

## Validation

- `npx tsc --noEmit`: clean. `npx prettier --check` on every changed file:
  clean.
- `tests/unit/onb-s5-pooling-wait.test.ts`: 39/39.
  `tests/contracts/m5c3c3b-engine-scope.test.ts`: green.
- Full `npx vitest run` (default parallelism): 12029 passed, 21 failed in 14
  heavy files, all timeouts under load (simulation runner service, public
  projections, corpus harness). None imports the new modules.
- Rerun with `--maxWorkers=4`: 12044 passed, 6 failed (timeouts). Those six
  files rerun serially: 96/97. The one remaining failure,
  `tests/regression/m8g-encounter-context-composition.test.ts` (workers
  project, 5 s timeout), fails identically on the untouched main tree on
  this machine (stashed comparison), so it is not caused by this change.

## Questions for the reviewer

1. Is UNKNOWN (rather than a new REJECTED basis) the right pinned comparison
   for an observed cast against a definite pool, given the public-contract
   constraint?
2. Is the resource-independent PROVEN_UNUSABLE set (cooldown, static,
   stealth, vanish, aura) sound for "not ready even at the maximum"?
