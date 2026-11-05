# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-D4P: Affliction Warlock and Marksmanship Hunter (public). Branch `autopilot/onb-d4p`, from main at 7c89206. **Outcome: not promoted. Both stay INTERNAL_ONLY, because neither can pass the rotational promotion gates.**

- **Warcraft Logs: NONE.** No request or probe. The census and replay read retained files offline, the replay through a fake transport.
- **Public contract: declared EXPECTED; actual change NONE, because nothing passes.** Nothing under `src/contracts/`, `src/api/` or `src/mcp/` changed. A public Warlock/Affliction or Hunter/Marksmanship request is SPEC_NOT_SUPPORTED, as before, with preparation still run and partial coverage disclosed.
- **Production code: NONE.** The only non-doc changes are two new rows in a refusal test and two test comments.
- **Queue bookkeeping:** ONB-D4 is recorded MERGED (PR #75, 7c892065…), and ONB-D4P is set to PR_OPEN. The supervisor's whole merged list was compared by script (see Validation).

## The thing to check first: is "not promoted" the right call, rather than an owner stop?

Onboarding rule 4: a specialization that cannot pass stays INTERNAL_ONLY, with its reason in the inventory. ONB-B1P, ONB-B3P, ONB-C1P, ONB-D1P, ONB-D2P and ONB-D3P decided the same shape, so this tranche asks the owner nothing new. ONB-EV and ONB-S3 are already queued as the owner's. Neither would resolve a decision of these two by itself.

Please check that the gates are not weakened. They are not touched. OBSERVATION and DISCRIMINATION both start from a real resolved decision, and neither specialization has one.

## The evidence

**Replay** (`.probe/onbd4p/m/`), at this base, through production ingestion and each facade:

| Subject | Spec | Retained span | Result | Decisions |
| --- | --- | --- | --- | --- |
| Gw2k fight 1 actor 20 (M13-A) | Affliction, not resolved | filtered casts, 146.5 s | `PROFILE_NOT_RESOLVED` | none |
| Gw2k fight 1 actor 14 (M13-A) | Marksmanship, not resolved | filtered casts, 146.5 s | `PROFILE_NOT_RESOLVED` | none |
| Gw2k fight 1 actor 18 (M13-A) | Marksmanship, not resolved | filtered casts, 146.5 s | `PROFILE_NOT_RESOLVED` | none |

The output file is byte-identical to the one saved during ONB-D4 (`cmp`). So there is no real decision, and every recorded stop stays a reading of a synthetic build.

**Census** (`.probe/onbd4p/census.cjs`, `census-read.txt`, `actors.cjs`, `actors2.cjs`): 5,712 JSON files over 500 bytes under `.probe/` and `tests/`, skipping tool output and worktree copies; 5,711 parsed (the other is `.probe/m11d2c/bad.json`). Positive control, Mortal Strike: 559 casts. Three routes:

1. **Combatant info, new in this tranche.** No `combatantinfo` event has specID 265 or 254. Control: 31 other specIDs appear, among them Frost Mage's 64, so the route can find a row like ONB-D3P's actor 142.
2. **Named abilities**, as ONB-D4.
3. **Pinned ids, new in this tranche.** Every id in the two specializations' GCD data, independent of master data. Of its hits, only Shadow Bolt 686 is new.

Every hit source resolved against its report's actors: Gw2k 20, 14, 18 (the subjects above) and 19 (Demonology); gtKb 3, 7, 10, rXAf 6, 22 and b1Pm 11, 14 (Demonology, Shadow Bolt); A7R6 12, 15 (Destruction, Malevolence and Wither). Contexts such as FPp6 fight 10 actor 15 and 8dTm fight 3 actor 10 name a player and carry no retained cast of that player.

Limits: it does not read JSON files of 500 bytes or less, or log and text output. Its cast routes match named and pinned ids, so a file holding only other abilities would not appear; the combatant-info route does not depend on them.

## Decisions a reviewer might reject

1. **Both stay on ONB-EV with no addition to it.** A subject must come first, and it alone resolves nothing, since each stops on synthetic builds on something a subject does not supply (`fight_remains`, `target_if` behind `fight_style.dungeonroute`). This restates ONB-D4 and does not re-open it.
2. **The "not promoted" record does not repeat a coverage table of UNKNOWN decisions.** A refusal is not an UNKNOWN decision, so the table says "none" and not 0 of N.
3. **The refusal rows are new.** ONB-D4 added the gate-search pins but no row in `analysis-composition-refusals`, so this tranche adds both. `Warlock` and `Hunter` are what the registrations' `wclClassName` name.

## What changed

- Docs: `agent/architecture.md` "ONB-D4P", `agent/follow-ups.md` "After ONB-D4", `agent/testing.md`, `agent/spec-onboarding-inventory.md` (the note and two rows; counts unchanged), `agent/autopilot-queue.md`, and both specs' `README.md`.
- Tests: `tests/unit/analysis-composition-refusals.test.ts` (two new rows), `tests/contracts/m11-promotion-evidence-gate.test.ts` (two comments only).

## Validation run

- `npm run typecheck`: clean. `npm run format:check`: clean. `git diff --check`: clean.
- `npm run test:corpus`: PASSED. `npm run test:evidence`: PASSED. Both ran in sequence, with no suite beside them.
- Full suite, parallel, 60 s timeout: 17,527 tests, 17,526 passed, 1 failed: `m9b-corpus-harness` SPEC_PROTECTION_PALADIN, on the recorded list of parallel-load failures, whose code this change does not touch. It passes rerun without the full suite beside it, so I infer load. The whole suite has not run clean in one pass.
- `m9b-corpus-harness`, `analysis-composition-refusals`, `m11-promotion-evidence-gate`, the `onb-d4` suites, `m10d-public-registration` and `m10a-spec-partition` rerun together: 306 passed (306).
- Queue compared by script with the supervisor's whole merged list: 56 compared, 1 written (ONB-D4), 0 missing, and a second run wrote nothing.
- No network to Warcraft Logs.

## What is not here

No promotion, no gate change, no public change, no new evidence, no production code, no Warcraft Logs request.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
