# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-S3: the owner's bounded, evidence-first enemy-set and target-count model
(`agent/architecture.md` "Owner decision (2026-11-05)", and the new section
"ONB-S3 — enemy-set and target-count model, as built"). Branch
`autopilot/onb-s3`, from main at 7b7cc24.

- **Warcraft Logs: NONE.** Every measurement replays retained captures through
  a fake transport.
- **Public contract: NONE.** No change under `src/contracts/`, `src/api/` or
  `src/mcp/`. No specialization is promoted.

## What changed

- `src/engine/game-state/enemies/enemy-set.ts`: `enemySetAt`, gameplay-neutral.
  A member needs hostile identity (an NPC a friendly player or pet was observed
  damaging) and presence at D (the subject's debuff ACTIVE by `presenceAt`, or a
  positive target-side health snapshot in D's own millisecond). Any death event
  for the key in the resolved prefix leaves it out. A `null` instance cannot add to a numbered one of its actor.
  Members are PRESENT, with TARGETABLE and IN-RANGE UNKNOWN. A non-monotonic
  timeline is UNKNOWN. An upper bound is accepted only with provenance, and no
  production caller passes one.
- `src/simc/expression/enemy-count.ts`: counts as bindings. No evaluator change:
  a range is `ONE_OF_NUMBERS` (a count is a whole number), a lower bound is
  `BOUNDED_NUMBER`. `spell_targets.<ability>` binds only through an action-owned
  registration with provenance, and none exists in production.
- `src/simc/target-if.ts`, `evaluate.ts`, `target-independence.ts`,
  `nested-selection.ts`, `list-selection.ts`: the optional `targetDomainFor`
  seam. A line resolves only when every target world agrees, and candidate order
  is never read. New with no domain: a FALSE player-only conjunct of a FIRST
  score eliminates the line.
- `src/findings/enemy-count-bindings.ts`: `withEnemyCountAt`, one call per
  specialization, read `BEFORE_EVENT` at the decision. A cast-time decision reads
  at its begin (`decisionPositionOfAnchor`, by the anchor's source), and a derived
  or unestablished one reads none.
- Seventeen INTERNAL_ONLY `observed-analysis.ts` files call it, and their
  `first-gcd-adapter.ts` stop diagnostics now name an undecided BOUNDED atom.
- `src/simc/decision-coverage.ts`: `TARGET_COUNT` is no longer described as
  permanent, and `PERMANENT_ATOM_MARKERS` is renamed.
- Comments and internal capability strings that said the count "has no authority".
- `agent/`: architecture, follow-ups ("After ONB-S3"), inventory, queue.
- `tests/unit/onb-s3-enemy-set.test.ts`: the new contract.

## Questions for review

1. **Is a carried debuff enough for presence?** "An earlier appearance never
   admits." I read a debuff `presenceAt` proves ACTIVE at D as a fact about D,
   not an earlier appearance, on two grounds: pinned `demise` cancels DoTs, and
   an audit of the retained whole fight b1Pm f48 found 1,880 of 1,882 player
   debuff tracks on NPCs closed by a removal, with the other two on the boss at
   capture end. A post-hoc replay check on three Arms subjects found 0 of 1,985
   member readings followed by 30 s of silence. The aura-state presence contract
   is the existing one M11-F's `active_dot` lower bound rests on.
2. **Hostile identity from friendly damage.** N2 forbids WCL enemy classification
   as authority, so identity comes from an observed friendly hit on the exact
   instance. Recorded as a follow-up: a friendly NPC that players can damage would
   be counted.
3. **No upper bound on real evidence.** Absence proves nothing, and Policy B is
   deferred, so `active_enemies=1` and `active_enemies<3` stay UNKNOWN on every
   single-target fight. The decision says "preferring bounds" and "missing evidence
   still fails closed", so I treated this as the correct outcome and recorded it as
   the expected ONB-S3R result rather than as an owner stop. Say so if it should be
   an owner question.
4. **`target_if` builds a rule with no production supplier.** The seam and its tests
   are the decision's scope; supplying per-target atoms is spec-owned and left to
   ONB-S3R and ONB-T*. The one rule live on real fights is the FIRST score elimination.

## Measured

Retained captures, offline (`.probe/onbs3/`): three Arms subjects, 892 eligible
decisions, all UNKNOWN, 0 MATCH, 0 REJECTED. On b1Pm f48 the bound reaches 10, and 37
of 324 decisions now pass `default[17]` and stop at `default[0] charge`, which has no
transition contract. The gtKb f22 subjects hold a bound of 1 and stay at `default[17]`.

## Validation

All on this tree.

- Typecheck and format check: pass.
- `npm run test:corpus` (245 cases, 840 assertions) and `npm run test:evidence` (32 cases, 80
  assertions): PASSED, byte-identical to the committed reports. This is the public invariance
  measurement.
- Full suite (`--testTimeout=60000`): 19,070 tests, 19,069 passed, 1 failed: `m9b-corpus-harness`
  SPEC_PROTECTION_PALADIN, `STACK_TRACE_ERROR`. It failed the same way in all three full runs of this
  tranche, and passes when its file runs alone (56 of 56). The same test is recorded as a parallel-load
  failure at ONB-X5P, before this change. No Protection Paladin code path changed, and its report is
  byte-identical in the corpus gate. I did not rerun the full suite at the base commit in this tranche.
- Replay of the three Arms subjects: unchanged by cycle 4, with no alias exclusion on real evidence.

## CI correction

GitHub `verify` failed twice on commit a656826, on one test only: `m8g-encounter-context-composition`
"is byte-identical across success, empty, rejection and total failure", timing out at 5 s (6,202 ms and
5,963 ms). That run took 530 s against 379 s on main's last run, so the runner was slow.

It is not this tranche's cost. Alternating this file at base 7b7cc24 and at the candidate, four times
each on a quiet machine, gave 4,977 to 5,177 ms at base and 4,919 to 4,989 ms at the candidate. The test
runs six full analyses and sits on the default limit at any commit.

It now has a named 20 s limit, as `m7f-raid-night-orchestration` does. No assertion changed.

## Review cycle 4 corrections

- **A death that may alias left a member counted.** Membership already treats a `null` and a numbered
  instance of one actor as possibly one unit, and the death filter did not. A death of either now excludes
  the other as `DEATH_EVENT_MAY_ALIAS`, which claims neither death nor life. Regressions cover both
  directions with a count condition, a numbered control and a death after the boundary.

## Review cycle 3 corrections

- **A shared timestamp was read as a shared position.** `decisionPositionOfAnchor` now switches on the
  anchor's source: the begin for `OBSERVED_BEGINCAST`, the completion for `INSTANT_COMPLETION` and
  `CHANNEL_START`, and none for `DERIVED_FROM_COMPLETION` or an unestablished anchor. Regression: a begin
  and a completion in one millisecond with enemy evidence between them, and an instant as the control.

## Review cycle 2 corrections

- **`spell_targets` laundered a contradiction.** An UNKNOWN candidate count with members became a lower
  bound. `spellTargetsEvidence` now returns the UNKNOWN unchanged, with a regression on the comparison.
- **The same-millisecond regression was claimed and missing.** Cycle 1's edit script dropped it silently. It
  is now in the test file, placing the death after the boundary, and it checks the event landed there.

## Review cycle 1 corrections

- **Deaths read beyond the prefix.** `deathStateAt` reads by report time, so a death after a
  `BEFORE_EVENT` boundary in the same millisecond changed the count. `enemySetAt` now reads death events
  from the resolved prefix itself, with a regression for the same millisecond and a later one.
- **A finite MIN/MAX score was read as readiness.** With a stated domain, a target is now certainly
  chosen only with a finite score and a candidate proven ready. Corrected the assertion, and covered both
  selectors with a negative case and a positive control.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
