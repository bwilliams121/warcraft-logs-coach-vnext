# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-S3R: the replay the owner's ONB-S3 "Promotion semantics" requires (`agent/architecture.md` "ONB-S3R —
the enemy-count specializations, replayed"). Branch `autopilot/onb-s3r`, from main at 33cbb61.

- **Warcraft Logs: NONE.** Every measurement replays retained captures through a fake transport.
- **Public contract: NONE.** No change under `src/contracts/`, `src/api/` or `src/mcp/`. Nothing promoted.
- **No decision-making code changed.** Prose, one new test file, and test titles and comments.

## What changed

- `tests/unit/specs/onb-s3r-destruction-lower-bound.test.ts` (new): the rule behind the replay's one real change,
  through the real Destruction facade on synthetic events. Two debuffed bosses give MATCH. One debuffed boss, a debuff
  removed first, or no aura evidence leave the same press UNKNOWN. The next blocker stays UNKNOWN and is never REJECTED.
- `src/specs/warlock/destruction/registration.ts`, `observed-analysis.ts`: comments and INTERNAL_ONLY limitation prose
  that said no decision resolves.
- Sixteen specialization READMEs named `active_enemies` as unbound after ONB-S3 wired it, and ten called ONB-S3 a
  pending owner decision. Each named specialization gets a dated ONB-S3R note.
- `tests/contracts/m11-promotion-evidence-gate.test.ts`: a comment only, on what its Destruction pin now means.
- `tests/unit/specs/onb-d1-destruction-warlock.test.ts`: a describe title, a test title and the header. No assertion.
- `agent/`: architecture, follow-ups ("After ONB-S3R"), inventory, queue.

## Measured

Every retained subject, offline, with the harness in `.probe/onbs3r/m/`.

| Specialization | Decisions | MATCH | REJECTED | First engine refusal |
| --- | ---: | ---: | ---: | --- |
| Arms | 1,207 | 0 | 0 | Charge, all |
| Frost Death Knight | 567 | 0 | 0 | the swing's entry, all |
| Devourer | 251 | 0 | 0 | `active_enemies=1`, all |
| Feral | 372 | 0 | 0 | Prowl, `auto_attack`, Cat Form, Tiger's Fury |
| Destruction | 220 | 4 | 0 | 113 anchor refusals, 103 Summon Infernal's readiness |

Thirty subjects of the eight other readers have stop tables identical to their public tranches', with 0 resolved. Ten
filtered M13-A subjects refuse `PROFILE_NOT_RESOLVED`. Fury, Protection Warrior, Outlaw and Vengeance have no retained event.

## Questions for review

1. **Are the four Destruction MATCH sound?** They are the first real decisions the enemy-set model resolves.
   `default[3]` is `active_enemies>=2&talent.wither`, and `aoe_hc[0] summon_infernal` has no condition. I read the raw
   events: each subject's own Wither is applied to both Ula'tek bosses before its press, with that subject as source.
2. **Is "no fix" right under scope item 3?** I judged no blocker is covered by existing semantics, and the architecture
   section gives the reason for each. The one I weighed hardest is Summon Infernal's readiness, the nearest second token:
   six Malevolence decisions stop only on it. No runtime row pins that cooldown, the wire's gaps of 91,737 and 92,369 ms
   have no pin to respect, and `destructive_rapidity` is unread. I recorded it rather than adding new data in a replay
   tranche. Say so if that should be an owner question.
3. **Is "no P2 entry" right?** One observed token against the minimum of two, no REJECTED, no control, nothing committed.
4. **An upper bound is the widest gap, and no decision here needed the owner to answer it.** "After ONB-S3" already
   records that Policy B is the owner's to schedule, so I recorded the measured size and did not stop.

## Validation

All on this tree except the queue's one recorded merge row, written after the runs.

- Typecheck and format check: pass.
- `npm run test:corpus` (245 cases, 840 assertions) and `npm run test:evidence` (32 cases, 80 assertions): PASSED, each
  matching its committed report. This is the public invariance measurement.
- New test: 6 of 6.
- Full suite (`--testTimeout=60000`): 19,077 tests, 19,075 passed, 2 failed, both recorded as parallel-only before this
  tranche: `m9b-corpus-harness` SPEC_PROTECTION_PALADIN (`STACK_TRACE_ERROR`) and `simulation/runner-service-queue` W
  (it lists the shared temp directory). Rerun alone on this tree: 56 of 56 and 12 of 12.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
