# Review request

Rolling file: overwritten for each review cycle.

## Change

HEAL-B3P: Discipline Priest (public). Branch `autopilot/heal-b3p`, from main
at 1a7c756.

**Outcome: not promoted.** Discipline Priest cannot pass the HEAL-AP healer
promotion gate on any committed or retained evidence. It stays INTERNAL_ONLY
under onboarding rule 4 (agent/autopilot-queue.md: "A specialization that
cannot pass stays INTERNAL_ONLY. It is recorded in the inventory with its
reason, and an evidence gap goes to ONB-EV."). The gate is not weakened and
gains no subject. No source or test behavior changes.

- **Warcraft Logs: NONE.** No request, probe or capture. The evidence census
  read only committed fixtures and already-retained local `.probe/` files.
- **Public contract: declared EXPECTED, actual NONE.** Nothing under
  `src/contracts/`, `src/api/` or `src/mcp/` changes. The `specId` enum, the
  identity table and `INTERNAL_ONLY_SPEC_IDS` (`druid/restoration`,
  `priest/discipline`) are unchanged. A Priest/Discipline public request stays
  `SPEC_NOT_SUPPORTED`, with its one retrieval for preparation alone. The
  promotion the entry anticipated did not happen, so there is no wire change
  to describe.
- **Queue bookkeeping:** HEAL-B3 recorded MERGED (PR #51, 1a7c7568…). HEAL-B3P
  is set PR_OPEN with its branch and outcome. Every other merged tranche the
  supervisor listed was already recorded MERGED. ONB-EV's owner decision
  already names Discipline Priest (appended by HEAL-B3), so it is unchanged.

## Why it cannot pass (the offline census)

The gate's OBSERVATIONS check needs a real subject whose COOLDOWN listing is
COMPLETE with at least one use. Its ASSIGNMENT check needs a met and a not-met
plan entry over those uses. Meeting both needs the subject's whole-fight casts,
retrieved COMPLETE with no actor filter.

- **Committed.** The M13-A Discipline Priest (actor 9) is in a filtered
  capture. The G2 cohort246 fight 33 Discipline Priest (actor 88) is in a
  PLAYER_CONTEXT capture of actor 7 whose query excluded heals. Every listing
  is UNKNOWN on both (already pinned by
  `tests/unit/specs/heal-b3-discipline-priest.test.ts`).
- **Retained M11-E2** (b1PmaKrd6CDfzngc fight 48, the source for HEAL-B1P and
  HEAL-B2P): this fight has no Discipline Priest.
- **Retained M11-C4f** (rXAfw9t1q8YpmkKD fight 13, the only other capture
  with no actor filter): its fight context has no Discipline Priest. The
  capture also covers only the fixed 165 s window of a 271.8 s fight.
- **Retained raw pages** (`.probe/m10b-pages.json`,
  `.probe/m10c5-phase-b-pages.json`, `.probe/m11c4f/pages.json`): none of
  them holds an event with ability id 62618, 421453, 472433, 47540, 194384 or
  81751.

## What pins the outcome (existing tests, re-run)

- `tests/contracts/heal-ap-healer-promotion-gate.test.ts`. Its coverage check
  requires a pinned gate subject for every PUBLIC healer row, so promoting
  Discipline without one fails. Only the header comment changed, to record
  HEAL-B3P.
- `tests/contracts/m10d-public-registration.test.ts` and
  `tests/regression/m10d-public-second-registration-invariance.test.ts`:
  INTERNAL_ONLY is exactly Restoration Druid and Discipline Priest.
- `tests/unit/analysis-composition-refusals.test.ts`: Priest/Discipline gives
  SPEC_NOT_SUPPORTED with one retrieval, for preparation.
- `tests/unit/spec-identity.test.ts`: Priest/Discipline is never publicly
  resolvable.

## Files

- `agent/autopilot-queue.md`: HEAL-B3 MERGED; HEAL-B3P PR_OPEN with its
  outcome.
- `agent/architecture.md`: new "HEAL-B3P" section (outcome, census, pins, and
  what a later promotion must do).
- `agent/follow-ups.md`: "After HEAL-B3", first item: the HEAL-B3P result.
- `agent/spec-onboarding-inventory.md`: the Discipline row reads "not
  promoted", with its gap on ONB-EV. The notes are updated. The counts are
  unchanged (10 PUBLIC, 2 INTERNAL_ONLY).
- `agent/testing.md`: a HEAL-B3P block listing the pins above.
- `tests/contracts/heal-ap-healer-promotion-gate.test.ts`: header comment only.

## Validation

- Focused: the six test files above, 152 tests passed.
- Full `npm test`, `npm run typecheck`, `npm run format:check`,
  `npm run test:corpus` and `git diff --check`: see the commit and CI.

## Review questions

1. Is closing HEAL-B3P as "not promoted" (rule 4) correct, given there is no
   cohort-mate to promote? The alternative is an owner stop. ONB-EV already
   carries the evidence decision, and the queue says "nothing else waits on
   them".
2. Is it acceptable for a tranche declared `publicContract: EXPECTED` to land
   with no public change? The merge gate restricts only an undeclared change.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
