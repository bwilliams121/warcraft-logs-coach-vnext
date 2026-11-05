# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-X2: Devastation Evoker (internal, own representative). Branch `autopilot/onb-x2`, from main at 14d5fea. **Outcome: registered INTERNAL_ONLY, and no decision resolves: 440 decisions on three retained subjects, 0 MATCH, 0 REJECTED, all UNKNOWN.**

- **Warcraft Logs: NONE.** No request or probe. The census and replay read retained files offline, the replay through a fake transport.
- **Public contract: NONE.** Nothing under `src/contracts/`, `src/api/` or `src/mcp/` changed. A public Evoker/Devastation request is SPEC_NOT_SUPPORTED, as before.
- **Shared analysis code: no behaviour change.** `src/simc/authority-artifact.ts` gains one policy name. One extractor policy is added (below).
- **Queue bookkeeping:** ONB-X1P is recorded MERGED (PR #78, 14d5fea9…), and ONB-X2 is set to PR_OPEN. The supervisor's whole merged list was compared by script (see Validation).

## The three things to check first

**1. Is an empowered spell a CHANNEL?** "After HEAL-B4" says one needs a reviewed definition before a decision involves it, and suggested an empowered execution kind. I added no kind, and the review is this:

- `empowered_charge_t` sets `ab::channeled = true` (sc_evoker.cpp:3519), and `empower_to` is a parsed option there (:3522).
- On all three subjects (`.probe/onbx2/wire.txt`): `empowerstart` and `cast` are in one millisecond or one apart; `empowerend` follows at 485 to 2,340 ms, with `empowermentLevel`. A `cast` with no `empowerstart` also appears, 8 times, and each of the 8 follows one of the 8 Tip the Scales presses, by 177 to 951 ms (`.probe/onbx2/tts.cjs`). No `empowerstart` lacks a `cast` within 1 ms.
- `cast-decision-anchor.ts` says of a channel: its `cast` is its start, decided there, span possible and never proven. That is true of a hold and of an instant press alike, so the decision moment does not depend on which.
- The table names the rule `EMPOWERED`, and the profile maps it to `CHANNEL`. `empowerstart` and `empowerend` stay envelope-only, and nothing reads them.

Please reject this if the shared CHANNEL contract promises something a hold does not satisfy.

**2. Does anything say something about a rank?** `empower_to` on every `es`, `fb` and `fire_breath` line is an unsupported option, so those lines refuse. `empowermentLevel` is not read. A test states one press at levels 1, 2, 3 and 4 and asserts identical comparisons and coverage, and another that a real `empower_to` line alone at the root stays UNKNOWN. `empower-cast-usage` stays open, and "After ONB-X2" says what answering it takes. A token MATCH, if one is ever reached, says nothing about a rank.

**3. Is the sentinel migration clean?** ONB-X1's rewrite overwrote a refusal row, so this one was audited separately.

- `tests/support/unsupported-subject.ts` moved to A7R6 fight 7 actor 20, Hunter / BeastMastery, read from the committed context.
- **Two spellings.** The wire's `BeastMastery` lower-cases to the service's observed `hunter/beastmastery`, and the roster key is `hunter/beast_mastery`. The fixture holds both, the guard checks the roster key against the roster, and its "not a SpecId" guard watches both, so it fires on the id the build would add.
- Test files use `hunter/beast_mastery` where they ask `isSpecId` or the registry, and `hunter/beastmastery` where they state the service's observed string.
- **Rows kept:** Devastation's refusal row in `analysis-composition-refusals` stays, with a new `["Hunter", "BeastMastery"]` beside it. `spec-identity`'s `outcome("Evoker", "Devastation")` stays. `spec-identity`'s list held `["Evoker", "Devastation"]` twice, from ONB-X1's rewrite, and now holds it once under its own comment.
- **Order pins changed for a real reason:** `m7f` sorted `[0, 11, 19]` and now sorts `[0, 19, 20]`.
- Stale locals (`ARMS_ACTOR`, `fire`) are renamed. A grep for a mixed identity, and for actor 11 beside the new identity, finds nothing. The bench runs (see Validation).

## The evidence

**Replay** (`.probe/onbx2/m/`), through production ingestion and the facade:

| Subject | Hero tree | Span | Eligible | MATCH | REJECTED | UNKNOWN | Excluded |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| A7R6 fight 7 actor 11 | Scalecommander | first 165 s of 424.5 s | 89 | 0 | 0 | 89 | 22 |
| b1Pm fight 48 actor 16 | Scalecommander | whole, 345.2 s | 191 | 0 | 0 | 191 | 38 |
| gtKb fight 22 actor 33 | Scalecommander | whole, 284.8 s | 160 | 0 | 0 | 160 | 24 |

351 decisions are anchored: the engine refuses at `default[6] quell`, and the root scan goes on through `default[8]` (TRUE from the observed tree) to `sc[0] deep_breath`, on its `cancel_if`. The other 89 have no anchor (88 Living Flame ambiguous, 1 at a capture edge), and their scans stop at the same line.

**Census** (`.probe/onbx2/census.cjs`): 5,715 JSON files, 5,714 parsed. Control: Mortal Strike, 559 casts, and 31 specIDs. Combatant-info specID 1467 finds exactly these three subjects. Named ability routes find no other Devastation source. A Disintegrate of A7R6 actor 11 in a committed corpus artifact is the same subject, by fight and timestamp. Contexts for yzH9 fight 32 and 24XJ fight 23 name a player with no retained events.

Limits: it does not read JSON files of 500 bytes or less, or log and text output. `Fire Breath` and `Living Flame` also hit Preservation and Augmentation actors, so those were read as signatures only with Disintegrate, Pyre, Eternity Surge and Dragonrage.

## Decisions a reviewer might reject

1. **A new policy, `PTR_STUB_NEVER_DISPATCHED`.** `apl_evoker.cpp` holds `void devastation_ptr( player_t* )`, an empty body between its markers, never called. None of the five existing policies is true of that. It checks exactly that shape, and a body or a dispatch fails (`m11d2c`).
2. **The label `UNSUPPORTED_TARGETING` on a `cancel_if` stop.** It is the shared scan's label for any unsupported option, and it is wrong here. I left it and recorded it, because it is shared behaviour for every list.
3. **No Flameshaper refusal.** Havoc refuses Fel-Scarred at promotion, and this is not a promotion. It is recorded as unmeasured.
4. **Not added to ONB-EV.** Evidence is not the first gap: three subjects stop at the same two lines.
5. **Font of Magic rows bound.** Every press on the three subjects is the base row. 382266 and 382411 are bound from `find_spell_override`, with the same `_gcd` and rule.
6. **The roster role is unchanged.** It stays UNKNOWN as pinned, and a test pins it.

## What changed

- New: `src/specs/evoker/devastation/*`, `src/data/game/evoker-devastation-*`, `src/simc/data/evoker-devastation.apl.json`, `tests/unit/specs/onb-x2-devastation-evoker.test.ts`, `tests/support/corpus/executors/spec-devastation-evoker.ts`.
- Registration pins, as for every onboarding row: `src/findings/spec-id.ts`, `src/services/analyzer-registry.ts`, the registry and partition contract tests, corpus contract, manifest and reports.
- Extractors: `scripts/authority/extract-simc-{apl,gcd,talents}.mjs`, with the targets and the policy; `src/simc/authority-artifact.ts`, the policy name.
- The sentinel migration: `tests/support/unsupported-subject.ts`, `tests/contracts/m11a2-unsupported-subject.test.ts` and the tests that state it.
- Docs: `agent/architecture.md` "ONB-X2", `agent/follow-ups.md` "After ONB-X2" and a pointer in "After HEAL-B4", `agent/testing.md`, `agent/spec-onboarding-inventory.md`, `agent/m11-spec-coaching-inventory.md`, `agent/deployment-smoke.md`, `agent/autopilot-queue.md`, `scripts/authority/README.md`, `src/specs/evoker/devastation/README.md`.

## Validation run

- `npm run typecheck`: clean. `npm run format:check`: clean. `git diff --check`: clean. The final runs are after the fixes below.
- `npm run test:corpus -- --write-report`: PASSED. `npm run test:evidence -- --write-report`: PASSED. Both ran in sequence, with no suite beside them. Each ran before the last prose regeneration, which touched comments and docs only. The m9b gate test, which compares the report field for field, passes after it.
- `scripts/bench/m10d-public-invariance.bench.ts`: 20 passed, with the sentinel read from the fixture.
- Full suite, parallel, 60 s timeout: 18,136 tests, 18,134 passed, 2 failed. One was real: `m7f` "keeps two players sharing a name distinct" still expected `:11`, a pin of this migration, now `:19` and `:20`. The other is `m9b-corpus-harness` SPEC_PROTECTION_PALADIN, on the recorded list of parallel-load failures, and it passes rerun. I did not rerun the whole suite after those fixes, so it has not run clean in one pass.
- Rerun together after the fixes: `m9b-corpus-harness`, `m9b-corpus-gate`, `m7f`, the `onb-x2` suite, `m11a2-unsupported-subject`, `m10d-public-second-registration-invariance`, `m11d2c`, `analysis-composition-refusals`, `spec-identity` and `m11-promotion-evidence-gate`: 405 passed (405), 10 files.
- Queue compared by script with the supervisor's whole merged list: 59 compared, 1 written (ONB-X1P), 0 missing, and a second run wrote nothing.
- No network to Warcraft Logs.

## What is not here

No promotion, no public change, no new evidence, no shared analysis behaviour change, no Warcraft Logs request.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
