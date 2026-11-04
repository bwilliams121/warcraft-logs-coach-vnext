# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-B1P: Arms Warrior public promotion: **not promoted**. Branch `autopilot/onb-b1p`, from main at 1abcb7d.

- **Warcraft Logs: NONE.** No request or probe. The numbers replay retained pages through production ingestion over a fake transport, offline.
- **Public contract: declared EXPECTED, actual change NONE.** Nothing under `src/contracts/`, `src/api/` or `src/mcp/` changed. A public Warrior/Arms
  request is SPEC_NOT_SUPPORTED, as before, with one retrieval for preparation alone.
- **No production code changed.** The only file under `src/` is `src/specs/warrior/arms/README.md`.
- **Queue bookkeeping:** ONB-B1 is recorded MERGED (PR #59, 1abcb7d7…). The other 40 merged tranches the supervisor listed were compared by script and
  already match. ONB-B1P is set to PR_OPEN.

## The thing to check first: is "not promoted" right, and is it not an owner stop?

The entry declares a public contract change and I made none. The rotational gates need a real MATCH, real resolved decisions over several tokens, and a real
REJECTED or a control flipping a real MATCH. ONB-B1 measured one subject resolving nothing and left the other retained subjects unread, so I read them rather
than assert the result:

| Subject | Hero tree | Retained span | Eligible | MATCH | REJECTED | UNKNOWN | Excluded |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| b1Pm fight 48 actor 5 (ONB-B1's number, not rerun) | Slayer | whole | 324 | 0 | 0 | 324 | 225 |
| gtKb fight 22 actor 5 | Slayer | whole, 284.8 s | 295 | 0 | 0 | 295 | 193 |
| gtKb fight 22 actor 12 | Slayer | whole, 284.8 s | 273 | 0 | 0 | 273 | 177 |
| rXAf fight 13 actor 10 | Slayer | first 165.0 s of 271.8 s | 166 | 0 | 0 | 166 | 96 |
| A7R6 fight 7 actor 4 | Slayer | first 165.0 s of 424.5 s | 149 | 0 | 0 | 149 | 99 |

All 1,207 stop on `default[17] run_action_list | active_enemies`. Onboarding rule 4 decides the outcome, as for ONB-A2P and HEAL-B3P, and the decision that
could change it, ONB-S3, is already queued as the owner's. I did not stop, because this tranche has no choice of its own to make.

**One deliberate difference from ONB-A2P:** nothing goes on ONB-EV. Rule 4 says "its evidence gap on ONB-EV", and Arms has no evidence gap that matters: a
capture would not move one decision. Check that this reading is right.

## Limits of the measurement

- **Prefixes.** The last two rows are the first 165 s of each fight. The replay ends the stream at the last retained page, so its coverage says nothing about
  the rest, and they are reported as prefixes.
- **Chaining.** gtKb's three captures are joined by the first timestamp of the next file, with a 12 ms seam between two of them (2,580,038 to 2,580,050).
  That is a replay's join, not a coverage proof. It is not committed, and nothing resolves either way.
- **Slayer only.** No Colossus subject is retained. A synthetic test pins that a Colossus build stops at `default[14]` on the same atom, and that is all that is
  known. Recorded in follow-ups: a later promotion must measure it or refuse it.
- **Census scope.** The census parsed retained `*pages*.json` files for Mortal Strike casts, with fight 48 as the positive control. M13-A's filtered capture
  also holds Mortal Strike casts (ONB-A2P's census), and I did not replay it, on ONB-A2P's finding that it has no combatant info. It is the one known retained
  source not measured.
- **Read per subject:** outcome, hero tree, stop atom and window count. The cooldown gaps and logged-cast copies are still measured on fight 48 only, and
  the follow-up says so.
- **Identity:** each subject's `friendlySpecs` entry, aligned to `friendlyPlayers` in a committed context, reads Arms (rXAf checked in
  `tests/evidence/artifacts/wcl-graphql/wcl-fight-context-rxaf-fight-13.json`; gtKb and A7R6 read from the retained copies of the contexts the manifests name).

## What changed

- `tests/unit/analysis-composition-refusals.test.ts`: Warrior/Arms is back in the refusal list. ONB-B1 replaced it with Mage/Fire when the canonical subject
  moved, so nothing there exercised Arms' public refusal through the composition. Also a stale `actor 4` comment beside Mage/Fire, now 17.
- `tests/contracts/m11-promotion-evidence-gate.test.ts`: comment only. The gate search from ONB-B1 still pins no qualifying assertion and `evidenceReady` false.
- Docs: `agent/architecture.md` "ONB-B1P", `agent/follow-ups.md` "After ONB-B1", `agent/testing.md`, `agent/spec-onboarding-inventory.md`,
  `agent/deployment-smoke.md` (M10-5 no longer waits on this tranche), `agent/autopilot-queue.md`, the Arms README.

## Validation run

- `npm run typecheck`: clean. `npm run format:check`: clean. `git diff --check`: clean.
- `npm run test:corpus`: PASSED (209 cases, 804 assertions). `npm run test:evidence`: 32 cases, 80 assertions, all passed in both runs. Each gate **failed once** first, when I ran
  them alongside the full suite. I reran them with the suite still running, and they passed. I did not read the first failures' details, so "load" is my inference.
- Full suite, parallel, 60 s timeout: 14,044 tests, 14,041 passed, 3 failed, overlapping those gate runs: `m9b-corpus-gate`, `m9b-corpus-harness`
  SPEC_PROTECTION_PALADIN (both timeouts), and `runner-service-queue` W (a leftover `wlc-simc-*` job directory, in code this change does not touch). Those three files rerun
  serially, with nothing else running: 54 tests, all pass. The whole suite has not been rerun clean in one pass.
- Touched tests rerun: `analysis-composition-refusals`, `m11-promotion-evidence-gate`, `onb-b1-arms-warrior`: 89 passed.
- Offline replay (`.probe/onbb1p/m/`, not committed): the table above, except fight 48, which is ONB-B1's measurement and was not rerun.

## What is not here

No promotion, no gate change, no binding, no new evidence, no new queue entry. A later promotion needs the owner's ONB-S3 decision, then what ONB-B1 left open,
then a new public entry; the follow-ups say no such entry is queued.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
