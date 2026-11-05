# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-X5: Unholy Death Knight (internal, own representative). Branch `autopilot/onb-x5`, from main at 6e08a90. **Registered INTERNAL_ONLY, 0 MATCH, 0 REJECTED, 147 UNKNOWN over one real subject. It reads the ONB-S6 pet state, and those readings move no decision.**

- **Warcraft Logs: NONE.** No request or probe. Every replay and wire probe reads retained files offline.
- **Public contract: NONE.** Nothing under `src/contracts/`, `src/api/` or `src/mcp/` changed. A public DeathKnight/Unholy request stays SPEC_NOT_SUPPORTED.
- **Shared production code: only the additive registration rows** (`src/findings/spec-id.ts`, `src/services/analyzer-registry.ts`). No engine, parser or shared-evaluator change.
- **Queue bookkeeping:** ONB-X4P is recorded MERGED (PR #84, 6e08a90d…), and ONB-X5 is set to PR_OPEN. The supervisor's whole merged list was compared by script (see Validation).

## The things to check first

**0. The first review's two findings are fixed.** Dark Transformation's lane is now its constructor's: `src/data/game/deathknight-unholy-gcd-semantics.ts` holds `UNHOLY_DEATH_KNIGHT_CONSTRUCTOR_LANES` (1233448 is NON_GCD), and `baseGcdMs` stays 1500 as extracted. `dark_transformation` now binds Blightfall 1271967 too, which keeps the data's 1500 ms, so the token's lane is `UNKNOWN_LANE`. A press of Dark Transformation is excluded `NON_GCD_ACTION`, and a press of Blightfall is the token's decision. The wire agrees: all four retained presses land 3 to 482 ms after the press before them. I grepped `trigger_gcd`, `gcd_type` and `set_replacement_action` over the whole module, and no other press of this list is overridden or replaced. The shared index and the extractor are unchanged. Is one reviewed table in this specialization's data the right place, given the shared rule still decides the token?

**1. The replacement bindings.** `death_coil` binds 47541 and Necrotic Coil 1242174, `epidemic` binds 207317 and Graveyard 383269, `festering_strike` binds 85948 and Festering Scythe 458128, `scourge_strike` binds 55090 and Vampiric Strike 433895 (`scripts/authority/extract-simc-gcd.mjs`, `DEATHKNIGHT_UNHOLY_FACTS`). Each constructor calls `set_replacement_action` (`sc_death_knight.cpp:6033-6055`) under a buff, and the list names none of the four. It is the shape Blood's `heart_strike` already has for Vampiric Strike. On the subject all 21 Necrotic Coils fall inside a logged Forbidden Knowledge window and none of the 32 Death Coils does, and all 9 Festering Scythes fall inside a logged 1241077 window (`.probe/onbx5/samems.cjs`). Graveyard and Vampiric Strike have no retained press, so they rest on the pinned module alone. Left unbound they would be excluded as off the list. Is treating a replacement press as that token's decision correct? No verdict rests on it today.

**2. `pet.army_ghoul.active` is AMBIGUOUS by a declared second entity.** `src/data/game/deathknight-unholy-pet-semantics.ts`. 1294026 (Army) and 275430 (ordinary) both summon NPC 237409, and the retained actor 90 takes all of them. So I declared `lesser_ghoul` on the same gameID, though the list never reads it, to make the shared state report both `ENTITY_MAPPING_AMBIGUOUS`, its documented rule for this. Alternatives: map `army_ghoul` to it alone, which calls every ordinary ghoul an army, or declare no row and leave the truth unbound. Is the declared second entity the right use of that rule?

**3. No floor and no ceiling on any row.** The spawner's Lord of the Dead default is 15,000 ms, 1292072's duration is 20,000 ms, and the 12 retained lives that end in the capture log a death 15,021 to 16,173 ms later, with completed casts to 15,349 ms and begins to 15,494 ms. So 15,000 is contradicted, and I claim nothing else: delayed damage means an observed end bounds nothing. The cost is that nothing is ever PRESENT or NOT_PRESENT. A test states a bound only it can state, to show the path binds and that later events change nothing. Is that too conservative, or correctly so?

**4. The Gargoyle row, with no wire evidence.** 27829 comes from 49206's summon effect, and no retained catalog holds that actor. `instancesBeginWithSummon` is false, so its answer is always `INSTANCE_START_NOT_PINNED`. It adds a row with a data-only gameID so every `pet.*.active` atom has one reading path. Would no row be better? The alternative also leaves the truth unbound.

**5. Arcane Pulse classified in this specialization's boundary.** `src/specs/deathknight/unholy/domain-boundary.ts`. It is a `racial_spell_t` the shared table does not list, and `racials[1]` reads ahead of every class action. Before this, the `racials` dispatch read `CALL_MAY_SELECT` on 17 decisions. Racial abilities are excluded from analysis, and Outlaw and Feral classify Shadowmeld the same way, so I did not touch the shared table ("After ONB-A2" calls that a shared decision). Frost's list has the token at a line its real scans do not reach, so Frost is unchanged. Is a local row right here, given the racial sits in front of every class action?

**6. A decision's instant is its cast, with no cast anchor.** `observed-analysis.ts` reads resources and pets at the cast's own millisecond. Every token's rows, replacements included, have `_cast_time` 0, and the subject logs no begin of any spell. Frost has the same shape. Should a begin of one of these spells, if a later capture holds one, change anything? Today it would be ignored, and only a COMPLETE cast is a decision.

**7. Two premises of the queue entry were wrong, and the queue keeps its text with an outcome note.** It says no retained events are known and that the list uses `run_action_list`. A census finds rXAf fight 13 actor 18, and the pinned list has `call_action_list` only (the extractor pins it, and `forbiddenTokens` holds `run_action_list`).

**8. One boundary-guard exemption.** `m5-boundary-and-vocabulary` bans the text `presenceAt` outside declared modules. `pet-profile.ts` calls the shared pet state's method of that name, as Demonology's does, so it is declared with a comment.

**9. No hero model.** The list reads no `hero_tree.*` and no hero talent, and no action is built on one. So the resolver has no hero atoms and the facade drops Frost's "disproved by tree" step, while `build.heroTree` still reports the tree from entry membership. Is dropping it right, or does the shared shape want it kept?

## The evidence

One subject, Rider of the Apocalypse, replayed offline through production ingestion and the facade (`.probe/onbx5/m/`). `rXAf` is rXAfw9t1q8YpmkKD. No retained subject is San'layn.

| Subject | Span | Eligible | Excluded | MATCH | REJECTED | UNKNOWN |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| rXAf f13 a18 | first 165 s | 147 | 85 | 0 | 0 | 147 |

Engine: `ONE_SCAN_BLOCKED/NO_DEFINITE_WINNER @ default[0] auto_attack` on all 147. Root scan: undecided at `default[0]`, `cooldowns[2] outbreak`, `[3] army_of_the_dead`, `[4] dark_transformation` (`UNKNOWN_LANE`); `default[6] -> aoe` BLOCKED; stops at `aoe[0] death_and_decay`, `UNSUPPORTED_EXPRESSION:UNSUPPORTED_OPERATOR:%`. Pet readings: `army_ghoul` UNKNOWN `ENTITY_MAPPING_AMBIGUOUS`, `gargoyle` UNKNOWN `INSTANCE_START_NOT_PINNED`, `lord_of_the_dead` UNKNOWN `OWNERSHIP_NOT_STATED`, 147 each. `rune` known at 85, `runic_power` at 53. All 77 talent entries name a pinned trait row.

Census: 5,714 parsed files of 5,715, control Mortal Strike 559 casts. Only rXAf actor 18 is a subject. `gBMCKxyY7dQDRZav` fight 33 actors 195 and 199 are 20-event diagnostic samples.

## Validation run

- `npm run typecheck`: clean. `npm run format:check`: clean. `git diff --check`: clean.
- `npm run test:corpus -- --write-report`: PASSED. `npm run test:evidence -- --write-report`: PASSED. Both ran in sequence, with no suite beside them.
- `scripts/bench/m10d-public-invariance.bench.ts`: passed.
- Full suite, parallel, 60 s timeout: 18,979 tests, 18,977 passed, 2 failed: `m9b-corpus-harness` SPEC_PROTECTION_PALADIN and `runner-service-queue` W. Both are on the recorded list of parallel-load failures, and this change touches none of their code. Both pass rerun without the full suite beside them (68 passed (68)), so I infer load. The whole suite has not run clean in one pass.
- Real replay rerun on the final code: rXAf fight 13 actor 18, 147 eligible, 85 excluded, 0 MATCH, 0 REJECTED, 147 UNKNOWN.
- Queue compared by script with the supervisor's whole merged list: 65 compared, 1 written (ONB-X4P), 0 missing, and a second run wrote nothing.
- No network to Warcraft Logs.

## What is not here

No promotion, no public change, no new evidence, no shared parser or engine change, no Warcraft Logs request.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
