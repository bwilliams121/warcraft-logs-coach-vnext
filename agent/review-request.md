# Review request

Rolling file: overwritten for each review cycle.

## Change

HEAL-B1P2, Restoration Druid (public): **not promoted, for capacity.** Branch `autopilot/heal-b1p2`, from `main` at 49feca5.

- **Public contract: declared EXPECTED, actual change NONE.** No `src/contracts/`, `src/api/` or `src/mcp/` file changes, no `specId` is added, and Restoration Druid stays refused publicly (SPEC_NOT_SUPPORTED).
- **Warcraft Logs: no request.** Every measurement read retained captures offline.
- **No archive change.** No artifact, manifest, report or notice-line pin moves.
- **No behavior change.** In `src/` only comments and one README change.
- The four untracked local paths (`.claude/` and the three `scripts/probe/wcl-*.probe.ts` files) are the standing CLAUDE.md exclusions and are not part of this change.

## What was measured

gtKb2xHn87pNcFfW fight 22 actor 2 is retained whole in the M9-C2, M11-C4 and M11-C4b captures: 384 `cast` and `begincast` events, with two Tranquility and five Convoke the Spirits casts.

| Measure | Bytes |
| --- | ---: |
| Minimal truthful fixture (three compact segments, CASTS granted for actor 2) | 131,911 |
| Room under the archive's 4,194,304 notice line | 5,212 |
| Archive against the line with the fixture | 4,321,003 (126,699 over) |

To tell a capacity stop from a gate failure, the whole promotion was applied in a throwaway worktree and removed afterward. The unchanged healer gate gave 37 of 37, including all six checks on the Druid. The archive test failed on `expected 4321003 to be less than 4194304`. The run was offline and is not committed.

Options that would fit or nearly fit, and why each was rejected, are in `agent/follow-ups.md` "After HEAL-B1P2". The important one: the seven identified casts alone are 2,771 bytes and fit, but a CASTS grant on them would falsely claim the fight's casts are complete, and without the grant the gate's OBSERVATIONS check fails.

## Changed files

- `tests/unit/specs/heal-b1-healer-evaluators.test.ts`: one new block on the choice node, the only new test.
- `src/specs/druid/restoration/README.md`: the choice node and the promotion result.
- Comments only: `src/findings/spec-id.ts`, `src/services/analyzer-registry.ts`, `src/specs/druid/restoration/registration.ts`, and `tests/contracts/{heal-ap-healer-promotion-gate,m10a-spec-partition,m10d-public-registration,m11a-registration-list-complete,m11-promotion-evidence-gate}.test.ts`. "No retained evidence" has been wrong since HEAL-B4P.
- `agent/architecture.md` "HEAL-B1P2", `agent/follow-ups.md` "After HEAL-B1P2" (the measured proposal and retry recipe), `agent/testing.md`, `agent/spec-onboarding-inventory.md` (the row; counts unchanged at 12 PUBLIC and 28 INTERNAL_ONLY).
- `agent/autopilot-queue.md`: this entry PR_OPEN with its outcome, and one sentence on REM-CENSUS. The 73 merged tranches the supervisor listed were all recorded already, each matching in PR and merge SHA, so none changed.

## Please check

1. **Tranche stop versus owner stop, the main judgment.**
   - The tranche completes as not promoted, rather than stopping with OWNER_DECISION_REQUIRED.
   - Queue rule 8: "A tranche whose minimal fixture cannot fit records its measured size. When several cannot fit, raise the measured proposal for the owner; never raise a line silently." The entry: "If the gate cannot pass, it stays INTERNAL_ONLY with the measured reason and goes to REM-CENSUS."
   - Older entries ("After ONB-A1", "After ONB-B1") say the next tranche with real decisions needs an owner decision. I read the 2026-11-06 rule as superseding them, as `agent/follow-ups.md` says that decision does for older text. ONB-EV's own grant keeps its separate capacity stop.
   - Strictly, the gate did not fail: it passed uncommitted. I treat "cannot pass" as "cannot pass on committed evidence", since rule 8 says promotion needs committed evidence. If you read this as a genuine owner decision now, say so.
2. **The dry run's claim.** The record calls it a measurement, not proof, and requires the retry to rerun the gate. Is any sentence stronger than that?
3. **The choice-node decision.** Observed casts alone, no talent read, no new vocabulary, with a Tree of Life aura without a cast never a use. The aura's cause is recorded as not reviewed rather than explained from memory.
4. **The proposal.** A byte-pinned named exception rather than a raised line, following M11-E2 and M11-G2. Is that the smallest justified change, and are the rejected options fairly stated?

## Validation

Run on this working tree, with no Warcraft Logs request:

- Full suite, serially (`--no-file-parallelism --testTimeout=60000`): 20,132 tests, 20,132 passed, 0 failed, 0 skipped.
- `npm run test:corpus`: 848 of 848 assertions, two byte-identical runs, committed report matches.
- `npm run test:evidence`: 80 of 80 assertions, two byte-identical runs, committed report matches.
- `tsc --noEmit` and `prettier --check .` pass.
- The archive pins are untouched and pass, including the 19,773,410-byte total.
