# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-T1P: Windwalker Monk (public), `agent/autopilot-queue.md`. Branch `autopilot/onb-t1p`, from main at f2a77d5.

**Outcome: not promoted.** It stays INTERNAL_ONLY under onboarding rule 4.

- **Warcraft Logs: NONE.** Every measurement replays or reads retained captures. No request, no probe config.
- **Public contract: declared EXPECTED; actual change NONE.** Nothing under `src/contracts/`, `src/api/` or `src/mcp/` changed. A public Monk/Windwalker request is SPEC_NOT_SUPPORTED, exactly as before, and still runs preparation with partial coverage. The declaration allowed a promotion; none happens because the gates do not pass.
- **No production code changed.** The tranche is one test row, one test comment and records.

## What changed

- `tests/unit/analysis-composition-refusals.test.ts`: a new row, Monk/Windwalker. The test held no row for it. `wclClassName: "Monk"` is the token `src/specs/monk/windwalker/registration.ts` names.
- `tests/contracts/m11-promotion-evidence-gate.test.ts`: the ONB-T1 gate-search pin is unchanged; its comment now names the outcome.
- `agent/architecture.md`, `agent/testing.md`, `agent/follow-ups.md`, `agent/spec-onboarding-inventory.md`, `src/specs/monk/windwalker/README.md`: the outcome. The follow-up's forward-looking "should expect" sentence is removed, since the outcome is now recorded.
- `agent/autopilot-queue.md`: ONB-T1 recorded MERGED (PR #90), ONB-T1P PR_OPEN with its outcome.

## Why it cannot pass

OBSERVATION needs a real MATCH over several distinct tokens, and DISCRIMINATION a real REJECTED or a control that flips a real MATCH. Windwalker has no resolved decision. The replay (`.probe/onbt1p/m/`), production ingestion and facade over a fake transport, at this base:

| Subject | Hero tree | Span | Eligible | MATCH | REJECTED | UNKNOWN | Excluded |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| b1Pm fight 48 actor 13 | Shado-Pan | whole fight, 345 s | 239 | 0 | 0 | 239 | 216 |

Its output differs from ONB-T1's saved output on one line, the wall-clock `ms` field. Engine refusal `default[0] auto_attack`, all 239. Root scan stop `zenith[3]`, all 239.

## Census

5,990 retained JSON files over 500 bytes, 5,989 parsed (`.probe/m11d2c/bad.json` is not JSON). Mortal Strike control: 1,034 events, 601 casts. Three routes: combatant info specID 269 (3 events, actors 13 and 1; 31 specIDs in the distribution as a control), 17 named ids from retained master data, and all 15 ids read from `monk-windwalker-gcd-semantics.json`. ONB-T1's script listed 7 of those by hand; this one reads the file and throws on an empty route.

Each source was resolved by its report's context (`.probe/onbt1p/actors.cjs`, `qj1p.cjs`, `census-read.cjs`):

- Actor 13 of b1Pm fight 48 is the subject.
- Mistweaver: b1Pm 48 a9, A7R6 7 a9, gtKb 22 a17, rXAf 13 a5.
- Brewmaster: gtKb 22 a4, rXAf 13 a11, Gw2k 1 a13.
- gBMC 33 a1 is Windwalker by combatant info and context, holding combatant info and one Roll in a diagnostic sample. Not a subject.
- qJ1p fight 6 sources 11 and 9, in a 43-event sanitized fixture, have no retained actor map. Source 11 pays Mana for Rushing Wind Kick. Source 9 has one Tiger Palm damage row at 0 of 100 Energy and no cast. Neither yields a decision. I did not establish source 9's specialization.

**A correction.** ONB-T1 recorded the other hits as "Brewmaster buff applications sharing one id". Buff 1296687's sources in this census are the four Mistweavers. I recorded the correction in the ONB-T1P section and left the ONB-T1 text as written.

Limits are in `agent/architecture.md` "ONB-T1P": files of 500 bytes or less, log and text output, and an actor with neither context nor combatant info holding none of these ids.

## Decisions a reviewer should check

- **Not an owner stop.** Rule 4 decides a failed promotion, as in ONB-X5P and its neighbours. No gate changed and no subject was added.
- **Not on ONB-EV.** Its first gap is decision inputs, not evidence: the one subject is a whole fight and resolves nothing. A second subject would still need a capture, recorded as ONB-EV's owner decision.
- **Nothing reads as clean play.** The new refusal row pins SPEC_NOT_SUPPORTED, one retrieval for preparation and no dispatch.

## Validation

- `npm run typecheck`: clean. `npm run format:check`: clean. `git diff --check`: clean.
- `npm run test:corpus`: PASSED. `npm run test:evidence`: PASSED. Both ran in sequence, with no suite beside them.
- Full suite, parallel, 60 s timeout: 19,319 total, 19,317 passed, 2 failed: `m9b-corpus-harness` SPEC_PROTECTION_PALADIN and `runner-service-queue` "W. every engine run leaves no job directory behind". The first is on the recorded list of parallel-load failures. The second, recorded in earlier "not promoted" tranches as a parallel failure, found a `wlc-simc-*` directory in the shared OS temp directory. Both passed rerun without the suite beside them (2 files, 69 tests), so I infer load and a shared temp directory; I did not observe the race. The whole suite has not run clean in one pass.
- `analysis-composition-refusals`, `m11-promotion-evidence-gate`, `onb-t1-windwalker-monk`, `m10a-spec-partition` and `m10d-public-registration`, rerun together: 145 passed (145), 5 files.
- Real replay at this base: 239 eligible, 216 excluded, 0 MATCH, 0 REJECTED, 239 UNKNOWN.
- Queue compared by script with the supervisor's whole merged list: 70 compared, 1 written (ONB-T1), 0 missing, and a second run wrote nothing.
- No network to Warcraft Logs.

## Not done

- No promotion, no gate weakened, no capture, and no Chi contract.
- No new public entry queued. A later one must first answer the stops in `agent/follow-ups.md` "After ONB-T1".

🤖 Generated with [Claude Code](https://claude.com/claude-code)
