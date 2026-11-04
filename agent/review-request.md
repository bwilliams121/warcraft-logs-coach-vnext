# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-C1P: Feral Druid (public). Branch `autopilot/onb-c1p`, from main at 6c17d8f. **Outcome: not promoted. It stays INTERNAL_ONLY under onboarding rule 4.**

- **Warcraft Logs: NONE.** No request or probe. The numbers replay retained pages through production ingestion over a fake transport, offline.
- **Public contract: declared EXPECTED, actual change NONE.** Nothing under `src/contracts/`, `src/api/` or `src/mcp/` changed. A public Druid/Feral request is SPEC_NOT_SUPPORTED, as before. No production code changed.
- **Queue bookkeeping:** ONB-C1 is recorded MERGED (PR #65, 6c17d8fb…). The supervisor's 47 merged tranches were compared by script: 0 mismatched. ONB-C1P is set to PR_OPEN.

## The thing to check first: is "not promoted, not an owner stop" right?

This follows ONB-B1P, ONB-B2P and ONB-B3P. Rule 4 decides it, the gates are unchanged, and ONB-S3 is already queued as the owner's. Feral differs from those three in one way: ONB-S3 is necessary but is not its first gate, because other open lines stand before the enemy count. The docs say that rather than "waits on ONB-S3". Please check the wording.

Measured at this base, offline:

| Subject | Build | Span | Eligible | MATCH | REJECTED | UNKNOWN | Excluded |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| b1PmaKrd6CDfzngc fight 48 actor 170 | Wildstalker, Incarnation | whole, 345.2 s | 258 | 0 | 0 | 258 | 581 |
| A7R6kxPJ1hC8YQ4w fight 7 actor 1 | Wildstalker, Berserk and Convoke | first 165.0 s of 424.5 s | 114 | 0 | 0 | 114 | 238 |

First-GCD query refusals: `default[3] auto_attack` 199, `default[0] prowl` 164, `default[1] cat_form` 5, `default[4] tigers_fury` 4. Root scans: actor 170's 256 stop at `default[6] chomp` on applicability, actor 1's 112 at `cooldown[13] convoke_the_spirits` on too many unresolved atoms, and the other 4 have no stopping point but stay UNKNOWN behind the open first-GCD lines. These equal ONB-C1's numbers.

**Pooling.** ONB-C1 asked a promotion to find a Bite below the pool line or say it has none. It has none. No real scan reaches `finisher[1]`. All 86 costed Bites read at least 60 Energy (actor 170: 58 of 58, lowest 60; actor 1: 28 of 32, lowest 64), and 4 of actor 1's report no cost. Those 4 are unread, so "none" means none among the costed Bites.

## Decisions a reviewer might reject

1. **A pin ONB-C1 did not add.** Earlier followers have a gate-search test in `m11-promotion-evidence-gate`, and Feral had none: only its row in the internal list. This tranche adds it, on the same shape as Devourer's.
2. **The refusal row uses `Druid`.** Feral's registration names `wclClassName: "Druid"`, `wclSpecName: "Feral"`, and both subjects' actors read subType `Druid`, so the row fails for the right reason, not on a misspelling.
3. **Not on ONB-EV.** A whole-fight subject with combatant info is retained, and more evidence would stop at the same lines.
4. **No queue entry added** for the later public promotion, as with the earlier "not promoted" tranches.

## Limits of the measurement

- **Census scope.** It parsed every JSON file over 500 bytes under `.probe/` and `tests/`, skipping tool output and worktree copies (5,649 parsed), by signature ability with Mortal Strike as a positive control. It reads casts only, so a subject with no signature cast in a retained span would not appear.
- **What it found.** Signature casts come from these two actors, plus gtKb fight 22 actor 2, whose only signature cast is Convoke the Spirits and whose context row reads Restoration Druid. Contexts in three other reports name a Feral (2xpt fight 17 actor 14, g34m actor 20, qJ1p fight 6), with no parsed signature cast of theirs.
- **Chaining.** A7R6's two captures are joined by the first timestamp of the next file. That is a replay's join, not a coverage proof, and it is not committed.
- **One is a prefix, one hero tree.** A7R6 ends at 165.0 s of 424.5 s. Both are Wildstalker, and Druid of the Claw has no real subject.

## What changed

- `tests/contracts/m11-promotion-evidence-gate.test.ts`: the new Feral gate search. `tests/unit/analysis-composition-refusals.test.ts`: the Druid/Feral row.
- `src/specs/druid/feral/README.md`: a one-paragraph note, no code.
- Docs: `agent/architecture.md` "ONB-C1P", `agent/follow-ups.md` "After ONB-C1", `agent/testing.md`, `agent/spec-onboarding-inventory.md` (notes and row), `agent/autopilot-queue.md`.

## Validation run

- `npm run typecheck`: clean. `npm run format:check`: clean. `git diff --check`: clean.
- `npm run test:corpus`: PASSED (217 cases, 812 assertions). `npm run test:evidence`: PASSED (32 cases, 80 assertions). Both ran in sequence, with no suite beside them.
- Full suite, parallel, 60 s timeout: 15,057 tests, 15,056 passed, 1 failed: `m9b-corpus-harness` SPEC_PROTECTION_PALADIN, on the recorded list of parallel-load failures. This change touches none of its code. I infer interference; I did not prove it.
- That file rerun alone: Tests 42 passed (42). The whole suite has not run clean in one pass.
- Focused: `analysis-composition-refusals` and `m11-promotion-evidence-gate`, Tests 54 passed (54).
- Queue compared by script with the supervisor's list: 47 compared, 0 mismatched.
- Offline census and replay (`.probe/onbc1p/`, not committed): the table above. No network to Warcraft Logs.

## What is not here

No promotion, no gate change, no production code, no public change, no new evidence, no binding of any open line, no new queue entry, no Warcraft Logs request.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
