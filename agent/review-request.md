# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-S4: shared cast and channel decision anchor. Branch `autopilot/onb-s4`,
from main at d0ebe22.

- **Internal shared engine only.** One new module,
  `src/engine/game-state/casting/cast-decision-anchor.ts`. Nothing under
  `src/contracts/`, `src/api/` or `src/mcp/` changes, and no specialization
  module changes. Nothing imports the new module yet, so no public decision
  changes.
- **Warcraft Logs: NONE.** No request, probe or capture. The real-evidence
  tests read only retained, committed slices of b1PmaKrd6CDfzngc fight 48
  (corpus Mage 121 prepull slice; evidence-archive Restoration Shaman 122
  casts).
- Queue bookkeeping: ONB-S2 is recorded MERGED (PR #41, d0ebe223…) and ONB-S4
  is set PR_OPEN. The other merged tranches the supervisor listed were
  already recorded MERGED with their pr and mergeSha.

## Direction

`agent/autopilot-queue.md` ONB-S4. CLAUDE.md "Decision Points" (cast time,
channel time, GCD overlap) and the M11-D0/A3 Cohort D blocker: a caster's
decision point is its `begincast`, and the shared observed-decision model
anchors on `cast`.

Scope:

- A shared decision-point model for cast-time and channelled actions.
- The anchor is at cast start, from `begincast` or derived from completion
  with reviewed cast-time data.
- Channels and interrupted casts are handled. There is no artificial missed
  action in progress.
- When the anchor cannot be established, the result is UNKNOWN.
- Shared plumbing only. Casters own the meaning.

## Design (agent/architecture.md "ONB-S4")

`buildCastTimeline({ state, actorId, profile })` returns one anchor per
foreground completion, the unpaired begins, the cast spans, and
`occupancyAt(t)`.

**Specialization-owned input (`CastAnchorProfile`):**

- `executionOf(id)`: INSTANT, CAST_TIME, CHANNEL, or `null` (unreviewed).
- `castTimeAt(completion)`: INSTANT, POSITIVE{exactMs | null}, or UNKNOWN.
- `channelDurationAt(completion)`: AT_MOST{maxMs} or UNKNOWN.

`hastedCastTime(base, castSpeed)` is the shared arithmetic. It never clamps:
a positive base is POSITIVE whatever the haste, and exact only with a KNOWN
multiplier.

**Pinned wire facts, from retained data:**

- A hard cast records a begin, then a completion.
- A channel (Arcane Missiles 5143, ×20) records `cast` only, at its start.
- Same-millisecond retrieval order is NOT proven (M11-G2). Both shapes occur
  in the Restoration Shaman slice.

It is NOT assumed that every hard cast records a begin. A missing begin is
never read as an instant cast.

**CAST_TIME pairing is order-invariant:**

- Each begin in a completion's own millisecond is one unknown bit.
- A completion pairs with the latest begin after the previous completion.
- Consistent placements are enumerated, with neighbours checked one either
  side (local, so it can only add ambiguity):
  - a POSITIVE cast time cannot complete in its begin's millisecond;
  - INSTANT is decided at completion and consumes only a same-millisecond
    begin.
- One agreed anchor gives OBSERVED_BEGINCAST, only with COMPLETE CASTS
  coverage for the actor from the begin to the completion. A different
  ability's begin, or a channel start, in between is CAST_EVIDENCE_CONFLICT.
- Disagreement gives BEGINCAST_PAIRING_AMBIGUOUS, with the candidates
  listed. Two begins or two completions in one millisecond are ambiguous
  outright.
- No begin:
  - complete coverage: BEGINCAST_NOT_OBSERVED;
  - incomplete coverage with an exact cast time: DERIVED_FROM_COMPLETION;
  - otherwise: CAST_TIME_UNKNOWN, carrying the evidence reason.
  - The first completion's window opens before the pull, so absence is never
    proven for it.

**Other executions:**

- INSTANT: INSTANT_COMPLETION.
- CHANNEL: CHANNEL_START. A begin of a reviewed instant or channel is
  CAST_EVIDENCE_CONFLICT.
- Unreviewed: EXECUTION_NOT_REVIEWED.
- Non-monotonic fight: NON_MONOTONIC_TIME.

**Occupancy:**

- CASTING only inside a paired or derived hard cast.
- UNKNOWN inside a channel (cancellable): from its start to min(proven bound,
  next cast or channel start), else unbounded. Also UNKNOWN after an unpaired
  begin, and before an unresolved or unreviewed completion.
- NOT_CASTING only when no span covers t AND CASTS coverage for the actor is
  COMPLETE from the pull to t.

So an instant inside a cast or channel is never "idle".

**Unpaired begins** are INTERRUPTED only when coverage proves nothing
completed before the next start. Otherwise they are UNKNOWN.

## Review cycle 1 fixes

1. **Possibly-running begins.** Before, any begin referenced in ANY placement
   was excluded from unpaired handling. Now `pairChain` also returns
   `surelyPaired`: the begins EVERY consistent placement pairs.
   - For a begin in a completion's own millisecond, either that completion
     takes it in every placement, or, in each placement where it follows,
     every placement of the next completion takes it.
   - Every other begin is reported in `unpairedBegins` and keeps a POSSIBLE
     span to the next cast or channel start (unbounded if none). It is
     `INTERRUPTED` only when never referenced and coverage proves no
     completion. Otherwise it is UNKNOWN: `PAIRING_NOT_PROVEN`,
     `EXECUTION_NOT_REVIEWED` (its ability completes unreviewed), or the
     coverage reason.
   - Regressions: the reviewer's case (begins 1000 and 2000, completion at
     2000, UNKNOWN cast time) in both orders gives occupancy UNKNOWN at 2500
     and through the end. A proven instant with a same-millisecond begin, in
     both orders, gives `beginPosition: null`, the begin `PAIRING_NOT_PROVEN`
     and 2500 UNKNOWN. The POSITIVE back-to-back chain, in both orders, gives
     no unpaired begin and NOT_CASTING after.
   - Real Restoration Shaman: the three INTERRUPTED are unchanged, and 50
     begins are now `PAIRING_NOT_PROVEN` (pinned).
2. **Derived anchors are validated.** `completion − exactMs` becomes
   `DERIVED_FROM_COMPLETION` only when all of these hold:
   - it is not before the previous completion of the ability;
   - no own begin or channel start is strictly inside it;
   - no other CAST_TIME completion is strictly inside it;
   - it overlaps no other CASTING span (a post-pass, for same-millisecond
     completions).
   Otherwise it is `CAST_EVIDENCE_CONFLICT`. When coverage over the derived
   cast itself is COMPLETE, it is `BEGINCAST_NOT_OBSERVED`. Tests:
   - the old overlapping case (1550 < 1700) is now CONFLICT, with one CASTING
     span and UNKNOWN occupancy;
   - a valid derivation (1800, after the 1700 completion) is kept;
   - an interleaved Blast begin gives CONFLICT;
   - two same-millisecond derived completions both give CONFLICT;
   - a fully covered derived window gives NOT_OBSERVED.

## Review cycle 2 fixes

1. **An ambiguous placement with no paired begin keeps its unknown start.**
   When any consistent placement pairs no begin, the possible span starts at
   the previous completion of the ability (unbounded for the first), not at
   the earliest candidate. An interleaved-start conflict also starts at the
   previous completion now. Regression: a begin and completion at 2000
   (after a Bolt completed at 1200), UNKNOWN cast time, both orders, gives
   1500 and 1999 UNKNOWN (`CAST_START_UNKNOWN`). The first-completion
   variant gives 1100 UNKNOWN.
2. **A conflicting channel keeps its possible channel span.** A CHANNEL whose
   review a begin contradicts now also gets the channel tail
   `[cast, next cast start)`. The contradicted review's AT_MOST bound is not
   used. Regressions:
   - a begin strictly before (1000, cast at 2000, bound 500): UNKNOWN at
     1500, 2000, 2500 and 4900;
   - a same-millisecond begin, both orders: UNKNOWN at 1500 and 2500;
   - a later Bolt begin still ends it: 2500 UNKNOWN, 3500 CASTING.
3. **Same class, found on self-audit:**
   - An unreviewed completion's possible span now runs from the previous
     completion to the next cast start, since it may have been a channel.
     Before, it ended at its own cast.
   - A contradicted INSTANT also gets the channel tail.
   - The conflict span starts at the previous completion, not the earliest
     contradicting begin.
   - Tests: unreviewed gives 2600 UNKNOWN, and 4500 NOT_CASTING after a later
     Bolt. A contradicted instant has a `CHANNEL_END_UNKNOWN` span
     `[1500, 3000)` and NOT_CASTING at 4500.

## Review cycle 3 fixes

**Incompatible observed casts are never both certain.**

- The interleave check now counts another ability's begin or channel start
  in the anchor's own millisecond (`>=`), since order is not proven. It also
  counts another CAST_TIME ability's completion strictly inside the cast.
- On that conflict the paired begin is removed from `surelyPaired`, so it
  keeps a possible span (it may still have been running).
- The overlap post-pass now covers EVERY CASTING span, observed or derived.
  All mutually overlapping spans become `CAST_EVIDENCE_CONFLICT`, with a
  POSSIBLE span from the previous completion of their ability
  (`windowStartByCompletion`). Their begins are released.

Regressions:

- The reviewer's case (Bolt and Blast begin at 1000, complete at 2000 and
  3000), in both orders of the simultaneous begins: both conflicts, no
  CASTING span, UNKNOWN at 1500, 2500 and 3500.
- Overlapping observed casts (Bolt [1000, 2000), Blast [1500, 2500)): both
  conflicts, no CASTING span, UNKNOWN at 1200 and 4000.
- Real-evidence counts are unchanged.

## Review cycle 4 fix

**Same-millisecond rule for derived starts.** The derived-start check now
counts an own begin or channel start at exactly the derived millisecond
(`>=`), as the observed-begin path does. Completions keep `>`: a completion at
a start's millisecond is back-to-back casting.

Regressions (UNVERIFIED CASTS, so derivation is otherwise allowed; Bolt
completes at 3000 with an exact 2000 ms cast time):

- a channel start at 1000: `CAST_EVIDENCE_CONFLICT`, no CASTING span,
  UNKNOWN at 1500;
- another ability's begin at 1000: the same;
- a begin at 1001, strictly inside: a conflict;
- an instant at 999, outside: `DERIVED_FROM_COMPLETION@1000` stands.

## Review cycle 5 fix

**Duplicate begins strictly inside a window.** `pairChain` now marks a
completion AMBIGUOUS_GROUP when the latest millisecond strictly inside its
window holds two or more begins of the ability. Before, `inside()` chose the
last in retrieval order. The begins are not surely paired, so each is
`PAIRING_NOT_PROVEN` with a possible span. An earlier duplicate superseded by
a later single begin still decides nothing.

Regression: two Bolt begins at 1000 and a completion at 2000, in both retrieval
orders (distinct locators). The result is BEGINCAST_PAIRING_AMBIGUOUS, with no
CASTING span, both begins PAIRING_NOT_PROVEN, and 1500 and 2500 UNKNOWN. With a
later single begin at 1500 the result is `OBSERVED_BEGINCAST@1500`.

Self-audit of the other order-sensitive spots:

- every pairing decision reads times, counts or per-millisecond groups only;
- duplicate completion times are already broken groups;
- interleave and derivation checks use `>=` for starts;
- only listing order (`unpairedBegins`, `spans`) follows canonical position.

## Files

- `src/engine/game-state/casting/cast-decision-anchor.ts`: new. It imports
  only engine modules (`state`, `evidence`, `normalization` types).
- `tests/unit/onb-s4-cast-decision-anchor.test.ts`: new, 41 tests.
  - Synthetic cases for every anchor source and unknown reason, both
    same-millisecond orders, channels, conflicts, coverage gaps
    (PARTIAL/UNVERIFIED), non-monotonic order, melee/id-less/other-actor
    exclusion, and an import-boundary check.
  - Real retained evidence:
    - Mage 121, POSITIVE: 30451 ×6 and 1295924 ×4 paired, 20 channel starts,
      one interrupted begin.
    - Mage 121, UNKNOWN: two 30451 ambiguous.
    - Restoration Shaman 122, instant procs not excluded: Chain Heal 36
      established / 49 ambiguous, Healing Wave 16 / 16, three interrupted, 50
      begins PAIRING_NOT_PROVEN, no conflict.
- `agent/architecture.md`: new section "ONB-S4", plus a pointer at the
  cooldown contract's "would need its own anchor" sentence.
- `agent/follow-ups.md`: the A3 "Cast/channel decision anchors" item is
  marked resolved as shared plumbing, with what remains: no consumer yet,
  empower events, channel end from auras, prepull hard casts, same-millisecond
  ambiguity without a proven cast time, complete-review requirement, and
  pushback.
- `agent/testing.md`: index block for the new tests.
- `agent/spec-onboarding-inventory.md`: notes mention ONB-S4 changes no
  specialization state.
- `agent/autopilot-queue.md`: ONB-S2 MERGED; ONB-S4 PR_OPEN.

## Validation

- `npx tsc --noEmit`: clean. `npx prettier --check .`: clean.
  `git diff --check`: clean.
- `tests/unit/onb-s4-cast-decision-anchor.test.ts`: 41/41 (after cycle 5).
- Full `npx vitest run`: 11953 passed, 24 failed. All 24 are in 13 heavy
  files (simulation runner service, raid-night orchestration, Protection and
  Retribution projections, corpus harness, G2 re-cut), and none imports the
  new module.
  - They were timeouts or STACK_TRACE_ERROR under full parallel load, plus
    one leftover-temp-directory assertion in runner-service-queue.
  - Rerun on their own with `--maxWorkers=2`: 209/210, and the one remaining
    file (runner-service-queue) passes 12/12 alone.

## Questions for the reviewer

1. Is the local (one-neighbour) consistency check acceptable, given it can
   only add ambiguity?
2. Is UNKNOWN occupancy for the whole of an unbounded channel the right
   fail-closed choice (rather than ending it at the next own instant)?
