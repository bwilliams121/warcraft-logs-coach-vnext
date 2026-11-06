# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-T2: Guardian Druid, Beast Mastery Hunter and Survival Hunter, internal, the last of Cohort T (`agent/autopilot-queue.md`). Branch `autopilot/onb-t2`, from main at 49dfccf.

- **Warcraft Logs: NONE.** Every measurement replays or reads retained captures. No request, no probe config.
- **Public contract: NONE.** No change under `src/contracts/`, `src/api/` or `src/mcp/`. Nothing promoted.
- **These are the last three unregistered roster rows.** Every row now has a registration: 12 PUBLIC, 28 INTERNAL_ONLY. A registration confers no support.

## What changed

**The specializations.** `src/specs/druid/guardian/`, `src/specs/hunter/beast_mastery/` and `src/specs/hunter/survival/` (all INTERNAL_ONLY), each with its four data modules and its pinned APL, GCD and talent artifacts. Cloned from Marksmanship's shape, because it holds the shared cast anchor and `withEnemyCountAt`. Beast Mastery has one hard cast. Guardian and Survival have none, and each has one channel. Guardian declares the two extra tank domains, as Vengeance does. No shared production code changed apart from the id list and the registry row.

**Extractors.** Targets for `druid-guardian` and `hunter-beast_mastery`. `hunter-survival` already existed, and its artifact is now committed. `extract-simc-talents.mjs` gains an optional `traitEntryId` filter (see below).

**The unsupported subject's guard.** `tests/support/unsupported-subject.ts` and `tests/contracts/m11a2-unsupported-subject.test.ts`. See the first decision below.

**Corpus, pins and documents.** Six corpus cases and three executors, the usual registry and partition pins, three gate-search pins, `agent/` and the queue.

## Decisions a reviewer should check

1. **The unsupported subject stayed at A7R6 fight 7 actor 20, and its guard changed.** This is the one place a test's rule was rewritten, so please check it. The guard demanded a subject outside every `SpecId`, and `agent/follow-ups.md` "After ONB-X2" expected a move to another committed context. This tranche registers the last three roster rows, so that set is empty. `.probe/onbt2/specnames.cjs` lists every class and spec pair in the committed contexts, and all are roster rows. Every proof that uses the subject reads the public path, and the public lookup and identity table refuse an INTERNAL_ONLY row exactly as they refused an unregistered one. The new guard fails the day `hunter/beast_mastery` becomes PUBLIC, proves the wire string `hunter/beastmastery` is no `SpecId`, proves no public lookup reaches the row and the internal one does, and pins that no roster row is unregistered. Three tests that used the id to mean "unregistered" (`m10a-spec-partition`, `m10a-registry-integrity`, `m11c2-brewmaster-registration`) now use a string naming no specialization, or assert the public half. The bench captures below are the evidence that nothing public moved.
2. **Beast Mastery builds no pet state, though the queue says it "uses ONB-S6 pet mapping".** This departs from the queue's wording, so please check it too. Its list reads no `pet.*` atom, and a test pins that. The one dependency is `kill_command_t::ready()` asking the main pet's own action (`sc_hunter.cpp:6773-6778`), and a press proves it. A main pet is tamed before the pull, so it has no summon event and no pinned gameID, and the retained catalogs give each its own (for example 75718250 and 89634124 for one owner). ONB-S6 could only answer UNKNOWN, and no atom would read the answer. Dire Beast (271298) and the Pack Leader summons could be mapped and nothing would read them either. Recorded in `agent/architecture.md` and `agent/follow-ups.md` "After ONB-S6".
3. **`barbed-shot-charge-capping` stays a recorded question.** No charge is derived, so nothing here answers it.
4. **Survival's `retarget` and `fight_style.dungeonroute` stay UNKNOWN.** The gate is declared and never bound, on Beast Mastery too. A test states it false, as Marksmanship's does, to show what is behind it.
5. **Guardian's tank meaning.** Mitigation, defensive, self-healing and interrupt domains resolve `NO_PINNED_AUTHORITY_FOR_DOMAIN`. A logged Ironfur or Barkskin is excluded as off-GCD and never judged. Frenzied Regeneration, Survival Instincts and Rage of the Sleeper are off the list and excluded.
6. **Moonkin Form.** Two trait rows of the name are open to Guardian. `find_talent_spell` takes the one with no spec requirement (`trait_data.cpp:107-113`), which is entry 103286, spell 24858, so the target names it with `traitEntryId`. I first assumed the other row and read the source before committing to it. Both spell rows are bound, because a player can take the other row and no retained Guardian cast says which one logs (Balance Druids log 24858). A taken entry 112970 reads as the lone-node talent absent, so UNKNOWN.
7. **Two-action tokens.** `berserk` (Incarnation or Berserk) and `maul` (Raze or Maul) bind both ids. Each is applicable with either talent, background with both proven absent, UNKNOWN otherwise. `moonfire` binds its own id only: `create_action` builds Red Moon with that talent taken, and the one `moonfire` line is gated on `!talent.red_moon.enabled`. `wild_guardian` has no binding, because its action is an override no retained cast names, so its lane is a refusal.
8. **`talent.<name>.enabled` is bound on Guardian** on the same three-way reading as `talent.<name>`, as Protection Paladin and Brewmaster do. An unresolved one has no row, so it is enumerated, never false. `talent.flashing_claws.rank` stays unbound.
9. **No resource is read.** Rage and Focus have wire contracts, and no scan reaches a line where either could decide anything. So each is declared unbound, and the capability's `resources` stays empty, so nothing under-fetches. Survival's list reads no Focus.
10. **File key `hunter-beast_mastery`.** `m11a2-cross-spec-isolation` reads ownership from `<class>-<spec>` against the roster key, so the underscore stays. The wire's `BeastMastery` lives on the module identity only.
11. **Constructors checked.** `trigger_gcd`, `gcd_type` and `set_replacement_action` over `sc_hunter.cpp` and `sc_druid.cpp`: no action of these lists overrides its record's GCD. The token builds the player's action, never the pet's struct of the same name (`bestial_wrath`, `kill_command`, `wild_thrash`, `takedown`). The pet rows have no binding.

## Measured

Beast Mastery, offline through production ingestion and the facade (`.probe/onbt2/m/replay.baseline.ts`):

| Subject | Hero tree | Span | Eligible | MATCH | REJECTED | UNKNOWN | Excluded |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| A7R6 fight 7 actor 20 | Pack Leader | first 165 s | 119 | 0 | 0 | 119 | 27 |
| gtKb fight 22 actor 13 | Pack Leader | whole, 285 s | 214 | 0 | 0 | 214 | 45 |
| rXAf fight 13 actor 15 | Pack Leader | first 165 s | 139 | 0 | 0 | 139 | 24 |
| b1Pm fight 48 actor 164 | Pack Leader | whole, 345 s | 235 | 0 | 0 | 235 | 31 |

Total 707 UNKNOWN, 127 excluded, all `EXECUTION_LANE_NOT_ESTABLISHED`. Every anchor is `INSTANT_COMPLETION`. Every engine refusal and root stop is `default[0] retarget` on `ACTION_OPTION:target_if`, classed `TARGETING_NOT_MODELLED`.

Synthetic (`.probe/onbt2/m/synth.baseline.ts`):

| Spec | Engine refusal | Root scan stop | With a fight style only a test states |
| --- | --- | --- | --- |
| Survival | `default[0] retarget` | `default[0] retarget` | engine `default[1] auto_attack`; a Sentinel build stops at `default[5]` on the count |
| Beast Mastery | `default[0] retarget` | `default[0] retarget` | engine `default[1] auto_shot`; a Dark Ranger build stops at `default[5]` on the count and `talent.beast_cleave` |
| Guardian | `default[0] auto_attack` | `cooldowns[9] heart_of_the_wild`, its unresolved talent, with `cooldowns[6]`, `[7]`, `[8]` open | not gated |

ONB-S3 alone moves none of them.

**Census.** 6,006 retained JSON files, 6,005 parsed (`.probe/m11d2c/bad.json` is not JSON), Mortal Strike control 601 casts. Combatant-info specID and named ability id routes. Beast Mastery: the four subjects, and gBMC fight 33 actor 141 in an 8-event diagnostic sample. Guardian: gBMC fight 33 actor 91 in the same sample, 7 events: one cast off the list, one Mangle resource change, one Red Moon damage row; its 78 talent entries all name pinned trait rows. Survival: no event on an id of its own. A second pass read any event type by every id in the two specs' GCD data (`.probe/onbt2/census2.cjs`, 5,744 files with worktree copies skipped): Moonlight Chakram's hits are filtered M13-A Marksmanship actors 14 and 18, and the Druid-id hits are Feral, Balance and Restoration Druids. The first pass's Pulverize hits are Primal Earth Elementals owned by Shamans. Guardian and Survival go on ONB-EV, and Requirement C cannot be met for any of the three, so ONB-T2P should expect "not promoted".

## Validation

- `npm run typecheck`: clean. `npm run format:check`: clean. `git diff --check`: clean.
- `npm run test:corpus -- --write-report`: PASSED. `npm run test:evidence -- --write-report`: PASSED, on a rerun. Its first rerun failed with Prettier's `UNKNOWN: unknown error, open tests/evidence/report.json`, before any assertion; the file was intact, and the next run passed with no change. I read that as a transient Windows file lock, which I did not prove.
- `scripts/bench/m10d-public-invariance.bench.ts`: passed. Its 34 captures are byte-identical to ONB-T1's in `.probe/onbt1/bench`, apart from `timings.json`. That includes `unsupported.*`, the subject the guard change is about.
- Full suite, parallel, 60 s timeout: 20,129 total, 20,127 passed, 2 failed: `m9b-corpus-harness` SPEC_PROTECTION_PALADIN and `runner-and-parser` U. Both are on the recorded list of parallel-load failures, and both passed rerun without the full suite beside them (6 files, 267 tests, with the three new suites and `m10a-spec-partition`). So I infer load. The whole suite has not run clean in one pass.
- After that full run I changed one word-level test string in `m10a-spec-partition`, and the source notes and docs about Moonkin Form and the census, and re-extracted. The rerun above and both gates cover those. The full suite was not repeated.
- Real replay: Beast Mastery's four subjects, 707 eligible, 127 excluded, 0 MATCH, 0 REJECTED, 707 UNKNOWN.
- Queue compared by script with the supervisor's merged list: 71 compared, 1 written (ONB-T1P), 0 missing.
- No network to Warcraft Logs.

## Not done

- No promotion, and no gate weakened.
- No pet state, no Rage or Focus reader, no charge reader (`agent/follow-ups.md` "After ONB-T2").
- `tests/unit/analysis-composition-refusals.test.ts` rows for Guardian and Survival are left to ONB-T2P, as for every earlier `*P` tranche. Beast Mastery's row already exists.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
