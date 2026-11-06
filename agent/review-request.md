# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-T1: Windwalker Monk, internal, the Cohort T representative (`agent/autopilot-queue.md`). Branch `autopilot/onb-t1`, from main at 5011ee3.

- **Warcraft Logs: NONE.** Every measurement replays retained captures through a fake transport.
- **Public contract: NONE.** No change under `src/contracts/`, `src/api/` or `src/mcp/`. Nothing promoted.
- **The queue's condition is met.** The follow-up "Whole-line blocker classification for refused `target_if` lines" is settled here.

## What changed

**The specialization.** `src/specs/monk/windwalker/` (INTERNAL_ONLY), its three data modules, and the pinned APL, GCD and talent artifacts. Cloned from Frost Death Knight's shape: both read hero talents through a resolved tree, and neither reads a pet. The list's only pet read is in non-domain trinket lines.

**Shared code, two pieces.**

1. `src/simc/decision-coverage.ts`, `classificationTextOf`. A line whose `target_if` was read, ignorable or refused, now classifies by its condition. The score only says which enemy wins, so an atom in it is no reason the line is open. `x,target_if=max:target.time_to_die,if=<target-dependent>` becomes `TARGETING_NOT_MODELLED`, where it read `PREDICTIVE_STATE`. An atom in the condition still classifies. A line with no `target_if` keeps its whole-line reading.
2. `src/simc/authority-artifact.ts` and `scripts/authority/extract-simc-apl.mjs`: the new policy `PTR_DELEGATES_TO_LIVE`, which goes with `enclosingNamespace` only. The dispatch reaches `windwalker::default_apl`, whose two branches call `live_apl` directly and through a `ptr_apl` whose whole body is that call. Both functions must have exactly those lines. Existing targets are untouched.

**Extractors.** `extract-simc-talents.mjs`: a hero-tree row with spell 0 now fails extraction unless the tree declares its id, and a declared id that is not such a row fails too. The pinned Conduit tree holds entry 125051, named `0` with spell 0. Unhandled, it failed the talent artifact's validation and every talent read UNKNOWN, which is how it was found. `extract-simc-gcd.mjs` gains the target.

**Corpus, pins and documents.** Two corpus cases, the executor, the usual registry and partition pins, the gate-search pin, `agent/` and the queue.

## Decisions a reviewer should check

- **Chi is not read.** `classResources` type 12 has no wire contract, and a contract needs committed corroboration this tranche does not add. `chi` and `chi.max` are declared and never bound, so a Chi line stays open, on a cast carrying Chi too. `energy` binds under its existing contract, and it is the one resource the capability declares.
- **`combo_strike` is declared self-addressing and never bound.** It is enumerated, never false.
- **`trinket.*` stays undeclared.** Ten class lines read it and refuse at that fragment. No gear is read.
- **Hero talents.** A resolved tree proves the other tree's talents absent, the same proof Frost and Havoc use. That skips `big_coc` under Shado-Pan and eliminates `zenith[2]` whichever enemy is chosen. The other direction was checked too: an unresolved or contradictory tree proves nothing.
- **Talent-built tokens.** Seven tokens are guarded. `celestial_conduit`, `rushing_wind_kick` and `zenith_stomp` are built on spell literals (`find_spell`), so their talent's absence does not make them background, and their `ready()` reads a buff this slice does not read.
- **Three racials are classified locally.** `arcane_pulse`, `haymaker` and `rocket_barrage` are `racial_spell_t`s the shared table omits. The shared table is not widened here, because that touches every public reader.
- **Off-GCD lanes.** Zenith and Touch of Karma have `_gcd` 0 and no transition contract, so a branch through either fails closed. `auto_attack` holds the only contract, and it states that `may_combo_strike` stays false for it, because a Windwalker's base execute writes Combo Strikes when it is set. I checked the constructor: `monk_action_t` defaults it to false (`sc_monk.cpp:81`), and `auto_attack_t` never sets it. Grepped `trigger_gcd`, `gcd_type` and `set_replacement_action` over `sc_monk.cpp`: Slicing Winds' 1400 ms stays on the GCD, Zenith Stomp's 0 ms is only its trigger child, and no replacement action exists.

## Measured

One retained subject, b1Pm fight 48 actor 13, whole fight, Shado-Pan, offline (`.probe/onbt1/m/`).

| Measure | Value |
| --- | ---: |
| Eligible | 239 |
| MATCH / REJECTED / UNKNOWN | 0 / 0 / 239 |
| Excluded | 216: 160 swings, 10 off the GCD (7 Zenith, 3 Touch of Karma), 46 off the list |
| Engine refusal | `default[0] auto_attack`, all 239, `OBSERVED_STATE_MISSING` |
| Open behind it | `default[1]`, `opener[0]`, `zenith[0]`, `zenith[1]` |
| Root scan stop | `zenith[3]`, `NOT_EVALUATED:UNSUPPORTED_TARGETING`, all 239 |
| Enemy lower bound | 155 at 1, 71 at 2, 13 at 3 to 10, never reached by a scan |

**The classification change moved nothing retained.** The ONB-S3R all-subject replay, before and after: 54 subjects, 54 identical in stops, engine refusals, counts and blocker classes. It moved no real Windwalker decision either, because those are classified at `default[0]`. Nothing public can move: a test enumerates the six public lists and finds no marked atom in any `target_if` score.

**The follow-up's text was partly stale.** It said "every Windwalker MIN/MAX line" refuses. Since M11-D3-B1 `target.time_to_die` is a proven-finite score, so only lines with a target-dependent `if=` do. I recorded this in `agent/architecture.md`.

**Census.** 5,990 retained files, 5,989 parsed (the other, `.probe/m11d2c/bad.json`, is not JSON), Mortal Strike control 601 casts. Hits resolved to actors: the only Windwalker with events is actor 13. Actor 9 of the same fight is a Mistweaver, and the other hits are Brewmaster buff applications sharing one id. Committed evidence for actor 13: its context row and 81 friendly-event rows, none a cast. So Requirement C cannot be met from committed evidence today, and ONB-T1P should expect "not promoted".

## Validation

- `npm run typecheck`: first run failed on two `placeholderEntryIds` type errors in the new test, fixed in `extract-simc-talents.d.mts`; `tsc --noEmit` then clean. `npm run format:check`: clean. `git diff --check`: clean.
- `npm run test:corpus -- --write-report`: PASSED. `npm run test:evidence -- --write-report`: PASSED. Both ran in sequence, with no suite beside them.
- `scripts/bench/m10d-public-invariance.bench.ts`: passed. Its captures are byte-identical to the ONB-X5 captures in `.probe/onbx5/bench`, apart from `timings.json`.
- Full suite, parallel, 60 s timeout: 19,319 total, 19,316 passed, 3 failed. Two were this tranche's own: `m10a-cross-spec-isolation` sort pins, fixed, because my script had crashed before reordering them. The third, `m9b-corpus-harness` SPEC_PROTECTION_PALADIN, is on the recorded list of parallel-load failures. All three pass rerun without the full suite beside them (5 files, 1,834 tests), so I infer load for the third. The whole suite has not run clean in one pass, and I did not repeat it after the sort fix, which touched only that test file.
- Real replay on the final decision code: b1Pm fight 48 actor 13, 239 eligible, 216 excluded, 0 MATCH, 0 REJECTED, 239 UNKNOWN.
- Queue compared by script with the supervisor's merged list: 69 compared, 1 written (ONB-S3R), 0 missing.
- No network to Warcraft Logs.

## Not done

- No promotion, and no gate weakened.
- No Chi contract, no Combo Strikes reconstruction, and no shared racial table change (`agent/follow-ups.md` "After ONB-T1").
- `tests/contracts/*` layering blind spot (recorded earlier): unchanged.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
