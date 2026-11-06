# Review request

Rolling file: overwritten for each review cycle.

## Change

Record the owner's ONB-S3 decision (2026-11-05) and update the roadmap.
Branch `roadmap/onb-s3-owner-decision`, from main at b68a0f1.

This is a documentation and queue change only:

- no source, test, analyzer, runtime-data or public-contract change;
- **Warcraft Logs: NONE.** No request, probe or capture, and the decision
  authorizes none.

The changed tracked files are `agent/architecture.md`,
`agent/autopilot-queue.md` and this file. The four untracked local paths
(`.claude/` and the three `scripts/probe/wcl-*.probe.ts` files) are the
standing CLAUDE.md exclusions and are not part of this change.

## The decision

Approve a bounded, evidence-first enemy-set and target-count model.
`TARGET_COUNT` stops being a permanent unsupported domain, but no exact
count is ever manufactured.

- **State.** Enemy-set state is EXACT, BOUNDED or UNKNOWN. A condition
  resolves only when every evidence-consistent count gives the same result.
- **Membership** needs positive trusted evidence at the decision time.
  Missing events prove nothing.
- **Distinct states.** PRESENT, TARGETABLE, IN-RANGE and UNKNOWN are kept
  separate.
- **Expressions.**
  - `active_enemies` is evidence-bounded, never "hostile actors seen".
  - `spell_targets` is action-owned and never aliased to `active_enemies`.
  - `target_if` (including FIRST) is evaluated only over a proven domain
    and pinned ordering.
  - Target-dependent `if=` resolves only when every world converges.
- **Evidence.** Trusted normalized evidence and pinned mechanics only. The
  shared layer stays gameplay-neutral; specs and actions own eligibility
  and geometry.
- **Promotion.** Lifting the blocker promotes nothing. Affected
  INTERNAL_ONLY specs are re-replayed, and any promotion goes through the
  unchanged MATCH and REJECTED gates.

## Files

### `agent/architecture.md`

A new section, "Owner decision (2026-11-05): ONB-S3 enemy-set and
target-count model", placed before "ONB-S4", holding the full decision.

### `agent/autopilot-queue.md`

- **ONB-S3:** changed from OWNER_DECISION_REQUIRED to READY. The
  `ownerDecision` field is replaced by an owner-resolution note and a
  scope and done-when list that follow the decision.
- **New ONB-S3R** (READY, depends on ONB-S3, `wcl: NONE`, no public
  contract):
  - re-replays offline the INTERNAL_ONLY specs on record as stopping on
    `TARGET_COUNT`: Subtlety, Fury, Protection Warrior, Arms, Frost DK,
    Enhancement, Devourer, Feral, Destruction, and any other found in the
    inventory or follow-ups;
  - records each spec's next blocker;
  - resolves only blockers that existing semantics cover;
  - adds a separate `ONB-*P2` public entry only for a spec whose internal
    validation now passes. It promotes nothing itself.

  Cohort T stays with ONB-T1 and ONB-T2.
- **ONB-Z** also depends on ONB-S3R.

## Validation

- The supervisor's own `ConvertFrom-QueueText` reads 80 entries, with unique
  IDs and known dependencies. The ONB-S3, ONB-S3R and Cohort T entries were
  printed and are `wcl: NONE`.
- Simulated selection after main: ONB-S3, ONB-S3R, ONB-T1, ONB-T1P,
  ONB-T2, ONB-T2P, ONB-Z. The simulation treats ONB-X5P as merged (#86),
  since the queue still shows it PR_OPEN.
- Left after that: ONB-EV (owner decision), M15-E and M11-G4-5-R (both
  deferred and BLOCKED).
- `prettier --check` and `git diff --check` pass.
- No test suite was run: nothing executable changed. ONB-S3's implementation
  and tests are future work.
