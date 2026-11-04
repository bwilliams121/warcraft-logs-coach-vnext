# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-D2P: Elemental Shaman, Balance Druid and Shadow Priest (public). Branch `autopilot/onb-d2p`, from main at 39801bb. **Outcome: not promoted. All three stay INTERNAL_ONLY, because none can pass the rotational promotion gates.**

- **Warcraft Logs: NONE.** No request or probe. The census and replay read retained files offline, the replay through a fake transport.
- **Public contract: declared EXPECTED; actual change NONE, because nothing passes.** Nothing under `src/contracts/`, `src/api/` or `src/mcp/` changed. A public Shaman/Elemental, Druid/Balance or Priest/Shadow request is SPEC_NOT_SUPPORTED, as before, with preparation still run and partial coverage disclosed.
- **Production code: NONE.** The only non-doc changes are three new rows in a refusal test and three test comments.
- **Queue bookkeeping:** ONB-D2 is recorded MERGED (PR #71, 39801bb8…), and ONB-D2P is set to PR_OPEN. The supervisor's whole merged list was compared by script (see Validation).

## The thing to check first: is "not promoted" the right call, rather than an owner stop?

Onboarding rule 4: a specialization that cannot pass stays INTERNAL_ONLY, with its reason in the inventory. ONB-B1P, ONB-B3P, ONB-C1P and ONB-D1P decided the same shape, so this tranche asks the owner nothing new. ONB-S3 is already queued as the owner's, and it would not move any of the three by itself.

Please check that the gates are not weakened. They are not touched. OBSERVATION and DISCRIMINATION both start from a real resolved decision, and none of the three has one.

## The evidence

**Replay** (`.probe/onbd2p/m/`), at this base, through production ingestion and each facade. Every subject ANALYZED, with 0 MATCH and 0 REJECTED:

| Subject | Spec, hero tree | Retained span | Eligible | UNKNOWN | Excluded |
| --- | --- | --- | ---: | ---: | ---: |
| b1Pm fight 48 actor 8 | Elemental, Farseer | whole fight | 225 | 225 | 55 |
| b1Pm fight 48 actor 17 | Elemental, Farseer | whole fight | 236 | 236 | 26 |
| gtKb fight 22 actor 9 | Elemental, Farseer | whole fight | 212 | 212 | 35 |
| gtKb fight 22 actor 19 | Elemental, Farseer | whole fight | 213 | 213 | 32 |
| A7R6 fight 7 actor 8 | Elemental, Farseer | first 165 s | 115 | 115 | 23 |
| A7R6 fight 7 actor 16 | Elemental, Farseer | first 165 s | 93 | 93 | 30 |
| rXAf fight 13 actor 12 | Elemental, Farseer | first 165 s | 116 | 116 | 27 |
| rXAf fight 13 actor 9 | Balance, Elune's Chosen | first 165 s | 143 | 143 | 8 |
| rXAf fight 13 actor 13 | Balance, Elune's Chosen | first 165 s | 132 | 132 | 14 |
| gtKb fight 22 actor 27 | Balance, Elune's Chosen | 16 casts over 56 s | 12 | 12 | 4 |
| gtKb fight 22 actor 29 | Shadow, Archon | whole fight | 213 | 213 | 236 |
| rXAf fight 13 actor 40 | Shadow, Archon | first 165 s | 143 | 143 | 140 |

Stops: Elemental `default[0]` on `moving`, all 1,210. Balance `default[13]` on `variable.opener`, all 287. Shadow `main[3]` on `target_if` 348 and `main[1]` 8, engine refusal `cds[7] power_infusion` on 300.

**Against ONB-D2's saved output** (`.probe/onbd2p/compare.cjs`): every decision count, stop and anchor is identical. Six `unpairedBegins` counts differ, all higher now: Elemental b1Pm 17 (185 to 201), gtKb 9 (192 to 193), gtKb 19 (192 to 194), A7R6 8 (90 to 98); Balance rXAf 9 (47 to 61), rXAf 13 (43 to 47). That file's timestamp is before ONB-D2's three review logs, whose corrections changed how a begin is consumed, so that is the likely cause. I did not re-run older code to prove it. Only the coverage reads these counts.

**Census** (`.probe/onbd2p/census.cjs`, `census.txt`, `actors.cjs`): 5,692 JSON files over 500 bytes under `.probe/` and `tests/`, skipping tool output and worktree copies; 5,691 parsed. It reads events of **any type and any source** for the ids the contexts' master data gives the families' signature names. ONB-D2's census counted casts only. Positive control, Mortal Strike: 985 events, 559 casts.

Every source holding one of those casts was resolved against its report's actors. Beyond the twelve subjects: M13-A's Balance (3) and Shadow (10), filtered with no combatant info, so each would refuse; M13-A's Enhancement (7) and Discipline (9); Restoration Shamans (gtKb 31, A7R6 10, rXAf 8); a Restoration Druid (gtKb 2); Feral Druids (A7R6 1, b1Pm 170); and two boss NPCs with a like-named Tempest (gtKb 235, rXAf 165). So no new subject exists. The one Lava Burst in the half-second M9-C page is fight 7, source 16, the existing subject.

Limits: it does not read JSON files of 500 bytes or less, or log and text output. It matches named ability ids, so a file holding only other abilities would not appear.

## Decisions a reviewer might reject

1. **None on ONB-EV.** More subjects would resolve nothing, since each list stops before any input a subject supplies. More would still be needed to promote (each is one hero tree, and Balance has no whole-fight subject); that is stated in architecture rather than raised as an evidence gap today.
2. **One correction to ONB-D2's records, made in place.** Its census text and inventory row called M13-A actors 9 and 10 Shadow. Actor 9 is Discipline, as "HEAL-B3" and `heal-b2-holy-priest.test.ts` already said. The census resolved it; no count changes, since both refuse.
3. **The refusal rows are new.** ONB-D2 added the gate-search pins but no row in `analysis-composition-refusals`, so this tranche adds all three. `Shaman`, `Druid` and `Priest` are what the registrations' `wclClassName` names.

## What changed

- Docs: `agent/architecture.md` "ONB-D2P" and the one correction in "ONB-D2", `agent/follow-ups.md` "After ONB-D2", `agent/testing.md`, `agent/spec-onboarding-inventory.md` (the note and three rows; counts unchanged), `agent/autopilot-queue.md`, and the three specs' `README.md`.
- Tests: `tests/unit/analysis-composition-refusals.test.ts` (three new rows), `tests/contracts/m11-promotion-evidence-gate.test.ts` (three comments only).

## Validation run

- `npm run typecheck`: clean. `npm run format:check`: clean. `git diff --check`: clean.
- `npm run test:corpus`: PASSED. `npm run test:evidence`: PASSED. Both ran in sequence, with no suite beside them.
- Full suite, parallel, 60 s timeout: 16,388 tests, 16,386 passed, 2 failed. This change touches neither's code.
  - `m9b-corpus-harness` SPEC_PROTECTION_PALADIN, on the recorded list of parallel-load failures.
  - `simulation/runner-service-queue` W, which lists the shared OS temp directory for any new `wlc-simc-*` name. Its one leftover is consistent with a parallel test's directory; I did not prove it.
  - Both pass rerun without the full suite beside them, so I infer load. The whole suite has not run clean in one pass.
- `m9b-corpus-harness`, `runner-service-queue`, `analysis-composition-refusals`, `m11-promotion-evidence-gate`, the three `onb-d2-*` suites, `m10d-public-registration` and `m10a-spec-partition` rerun together: 330 passed (330).
- Queue compared by script with the supervisor's whole merged list, including ONB-D1P and ONB-D2: 53 compared, 0 mismatched.
- No network to Warcraft Logs.

## What is not here

No promotion, no gate change, no public change, no new evidence, no production code, no Warcraft Logs request.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
