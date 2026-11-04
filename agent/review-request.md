# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-B2P: Frost Death Knight and Enhancement Shaman public promotion: **not promoted**. Branch `autopilot/onb-b2p`, from main at 3fad83f.

- **Warcraft Logs: NONE.** No request or probe. The numbers replay retained pages through production ingestion over a fake transport, offline.
- **Public contract: declared EXPECTED, actual change NONE.** Nothing under `src/contracts/`, `src/api/` or `src/mcp/` changed. A public request for either specialization is SPEC_NOT_SUPPORTED, as before, with one retrieval for preparation alone.
- **No production code changed.** The only files under `src/` are the two specializations' READMEs.
- **Queue bookkeeping:** ONB-B2 is recorded MERGED (PR #61, 3fad83fd…). The other 42 merged tranches the supervisor listed were compared by script and already match. ONB-B2P is set to PR_OPEN.

## The thing to check first: is "not promoted" right, and is it not an owner stop?

The entry declares a public contract change and I made none. The rotational gates need a real MATCH, real resolved decisions over several tokens, and a real REJECTED or a control flipping a real MATCH. I reran every retained subject at this base rather than copy ONB-B2's numbers:

| Subject | Spec | Hero tree | Retained span | Result | Eligible | MATCH | REJECTED | UNKNOWN | Excluded |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| b1Pm fight 48 actor 19 | Frost | Deathbringer | whole | ANALYZED | 308 | 0 | 0 | 308 | 703 |
| gtKb fight 22 actor 26 | Frost | Deathbringer | whole | ANALYZED | 259 | 0 | 0 | 259 | 281 |
| Gw2k fight 1 actor 7 | Enhancement | not resolved | filtered casts | `PROFILE_NOT_RESOLVED` | none | none | none | none | none |

All 567 Frost decisions stop on one atom: `cooldowns[4] reapers_mark | NOT_EVALUATED:UNSUPPORTED_TARGETING`. Onboarding rule 4 decides the outcome, as for ONB-A2P and ONB-B1P, and the decisions that could change it (ONB-S3, ONB-EV) are already queued as the owner's. I did not stop, because this tranche has no choice of its own to make.

**The two get different dispositions. Check that this is right.** Frost is not added to ONB-EV: it has two whole fights with combatant info, and a capture would not move a decision. Enhancement stays on ONB-EV, where ONB-B2 put it, and it needs ONB-S3 too.

## Limits of the measurement

- **Census scope.** ONB-B2's census read files named for pages, events or captures. This one parsed every JSON file over 500 bytes under `.probe/` and `tests/`, skipping tool output, worktree copies and directories deeper than the walk limit (5,638 parsed), for casts of signature abilities, with Mortal Strike and Mutilate as positive controls. It reads casts only, so a subject with no signature cast in a retained span would not appear. It does not read compressed files; a listing found none outside the tool directories.
- **Chaining.** gtKb's three captures are joined by the first timestamp of the next file, as in ONB-B1P. That is a replay's join, not a coverage proof. It is not committed, and nothing resolves either way.
- **Deathbringer only.** No Rider subject is retained. Follow-ups say a later promotion must measure it or refuse it.
- **Identity:** each subject's `friendlySpecs` entry, aligned to `friendlyPlayers`, and `subType` from the context (`DeathKnight`, `Shaman`), read from retained copies. "Frost" alone is ambiguous with Mage, so the Death Knight subjects are also corroborated by the class token and by their Obliterate casts.

## What changed

- `tests/unit/analysis-composition-refusals.test.ts`: DeathKnight/Frost and Shaman/Enhancement join the refusal list. The token `DeathKnight` is the one the identity table resolves for Blood (`spec-identity.test.ts` pins that `Death Knight` does not), so the rows reach the real lookup rather than failing on a spelling.
- `tests/contracts/m11-promotion-evidence-gate.test.ts`: comment only. The gate search from ONB-B2 still pins no qualifying assertion and `evidenceReady` false.
- Docs: `agent/architecture.md` "ONB-B2P", `agent/follow-ups.md` "After ONB-B2", `agent/testing.md`, `agent/spec-onboarding-inventory.md`, `agent/autopilot-queue.md`, and both READMEs. No percentage in the inventory changes.

## Validation run

- `npm run typecheck`: clean. `npm run format:check`: clean. `git diff --check`: clean.
- `npm run test:corpus`: PASSED (213 cases, 808 assertions). `npm run test:evidence`: PASSED (32 cases, 80 assertions). Run in sequence, with no suite beside them.
- Full suite, parallel, 60 s timeout: 14,493 tests, 14,490 passed, 3 failed: `m9b-corpus-harness` SPEC_PROTECTION_PALADIN (a timeout-shaped error), `runner-service-queue` W (a leftover job directory) and `runner-and-parser` U (a job-directory count, 173 against 174). The last two count one shared temp directory, and `runner-and-parser` U is not on the earlier known list. This change touches none of that code. I infer parallel interference; I did not prove it.
- Those three files and the two touched test files rerun serially: 127 tests, all pass. The whole suite has not been rerun clean in one pass.
- The machine's temp directory holds 173 leftover `wlc-simc-*` directories from earlier runs. I left them alone.
- Offline replay (`.probe/onbb2p/m/`, not committed): the table above.

## What is not here

No promotion, no gate change, no binding, no new evidence, no new queue entry. A later promotion needs the owner's ONB-S3 decision and, for Enhancement, ONB-EV, then what ONB-B2 left open, then a new public entry; the follow-ups say no such entry is queued.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
