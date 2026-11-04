# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-C1: Feral Druid (internal, Cohort C representative). Branch `autopilot/onb-c1`, from main at a41a68b. **Outcome: registered INTERNAL_ONLY, and no decision resolves on real evidence.**

- **Warcraft Logs: NONE.** No request or probe. The numbers replay retained pages through production ingestion over a fake transport, offline.
- **Public contract: NONE.** Nothing under `src/contracts/`, `src/api/` or `src/mcp/` changed. A public Druid/Feral request is SPEC_NOT_SUPPORTED, as before.
- **Queue bookkeeping:** ONB-B3P is recorded MERGED (PR #64, a41a68bb…). The other 45 merged tranches the supervisor listed were compared by script and already match. ONB-C1 is set to PR_OPEN.

## The thing to check first: is "not an owner stop" right?

The queue's scope for this entry is "pooling, plus form state", and rule 2 asks for real MATCH and discrimination evidence (requirement C). No real decision can meet that while the enemy count stands, which is already queued as the owner's (ONB-S3). I applied the same call as ONB-B1 and ONB-B3: register internally, measure, and do not stop. Please check that.

Measured at this commit, offline:

| Subject | Build | Span | Eligible | MATCH | REJECTED | UNKNOWN | Excluded |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| b1PmaKrd6CDfzngc fight 48 actor 170 | Wildstalker, Incarnation | whole, 345.2 s | 258 | 0 | 0 | 258 | 581 |
| A7R6kxPJ1hC8YQ4w fight 7 actor 1 | Wildstalker, Berserk and Convoke | first 165.0 s of 424.5 s | 114 | 0 | 0 | 114 | 238 |

Where the first-GCD query refuses: `default[3] auto_attack` 199, `default[0] prowl` 164, `default[1] cat_form` 5, `default[4] tigers_fury` 4. Root scans go further: actor 170's 256 stop at `default[6] chomp` (neither entry of the choice node in the tree), actor 1's 112 at `cooldown[13] convoke_the_spirits` (too many unresolved atoms), and 4 select the Rake from stealth behind Tiger's Fury's open line. None reaches `default[9..12]`, the dispatches on `spell_targets`.

**So the pool line is proven on synthetic decisions only.** No real scan reaches it, and every costed Bite on both subjects has at least 60 Energy, so none would pool even past the count.

## Decisions a reviewer might reject

1. **A new extractor selector and PTR policy.** Feral's list is `apl/druid/feral_apl.inc`, a markerless file included as the sole body of `apl_feral` in `apl/druid/druid.cpp`. `includedBy` hash-checks the including file and requires the include to be the function's one statement. `PTR_SEPARATE_INCLUDE` requires the one `is_ptr()` ternary and a different file for the PTR function. **`feral_apl_ptr.inc` was never read**: no copy is retained, and I did not fetch one. Unlike `PTR_BODY_IDENTICAL`, this makes no claim about the PTR list, only that a live build takes the live branch.
2. **`sc_druid.cpp`'s hash comes from the retained copy.** `feral_apl.inc` and `druid.cpp` match the hashes the M11-A3 audit recorded. `sc_druid.cpp` (`59227a2f…`, 479,886 bytes) has no earlier recorded hash in the repository: it was taken from `.probe/simc-33622e9d/`, the retained copy of the pin, and I could not independently match it to the commit's blob id offline.
3. **`max_energy=1` is read by the specialization, through a view of the authority.** `feralScanAuthority` removes that one key from that one line's `unsupportedOptions`, and usability answers it. No shared parser changed. The alternative is a generic engine hook, which seemed wider than one option on one line.
4. **`maximum_energy()` as bounds, with spell data in a module constant.** 50, 37.5 under Incarnation, 0 under Apex. The numbers cite spell power row 939 and effects 12791, 471804 and 1029647 in the pinned `sc_spell_data.inc`, and no extractor produces them. Only the bounds' upper end decides "ready", so a wrong factor could only move a decision to not established, or wrongly to NOT_MET if a factor below 1 were missed. The check sits on the line's `INSUFFICIENT_RESOURCE`, which reaches no verdict while the pool is UNKNOWN against every cast.
5. **The Energy test before the observed cast.** A Bite pressed below the line stands as PROVEN_UNUSABLE for that line. It breaks the usual "the cast that fired was usable" order, on purpose: the press proves the spell, not the line. The two bare Bite lines keep the observed proof.
6. **`OWN_CAT_FORM_CAST`.** The atom reads `true` from the decision's own cat ability, and with Fluid Form taken the form may in truth have been down, autoshifting on the cast. I bound it anyway, because the one in-combat reader, `!buff.cat_form.up&!talent.fluid_form`, is FALSE in both worlds, and a test pins that it has one reader. It is used only where M4 has no answer, and never over an EXACT one.
7. **`BROKEN_BY_OWN_ACTION`.** Prowl and Shadowmeld read down from an earlier harmful cast when M4 is `AMBIGUOUS_INITIAL_STATE`. It rests on `:1874-1881` and on `SX_NO_STEALTH_BREAK` being clear on all ten tokens, which I read off the pinned spell data's attribute word in a local script, not through an extractor.
8. **Prowl's guard, changed by the first review.** `buff.incarnation_cat_prowl` has no duration and no log event, and a press before the pull leaves nothing in the fight. So "no press" is no longer a proof: on an Incarnation build the line closes only on an observed Prowl with no later press. A cast with no source that could be Incarnation, or with no ability id, blocks the proof. `feralCastFactsFrom` now reads every cast, as Arms' reader does.
9. **The harmful-cast list is by token, not by a "did damage" reading.** Ten tokens built on `cat_attack_t` with `harmful` left true. A harmful spell outside the list simply does not count, which only leaves a decision open.
10. **Shadowmeld classified racial here.** The shared table reads `get_racial_actions()`, which does not hold it. I did not change the shared table, because that table is pinned to that function's text.
11. **`fight_style.*` declared and unbound**, so Tiger's Fury's condition parses and stays open. Its usability has no cooldown proof and no contract.
12. **Not on ONB-EV.** A whole-fight subject with combatant info is retained, and more evidence would stop at the same lines.

## Limits of the measurement

- **Census scope.** It parsed every JSON file over 500 bytes under `.probe/` and `tests/`, skipping tool output and worktree copies (5,649 parsed), by signature ability with Mortal Strike as a positive control. A subject with no signature cast in a retained span would not appear. Contexts name Feral in other reports too (2xptYq89Tb631Hmg fight 17 actor 14, g34mvXTKLMJ2Nfwr actor 20, qJ1pgB49ZrRNVmCd fight 6), with no parsed signature cast of theirs.
- **Chaining.** A7R6's two captures are joined by the first timestamp of the next file. That is a replay's join, not a coverage proof, and it is not committed.
- **One is a prefix.** A7R6 ends at 165.0 s of 424.5 s.
- **One hero tree.** Both are Wildstalker. Druid of the Claw is known only from synthetic tests, so a promotion must measure it or refuse it.

## What changed

- `src/specs/druid/feral/`: the module on the observed-decision shape, plus `aura-bindings.ts`, `combat-engagement.ts`, `pooling-model.ts`. `src/data/game/druid-feral-*`, `src/simc/data/druid-feral.apl.json`.
- `scripts/authority/extract-simc-apl.mjs` (and `.d.mts`): the selector, the policy, the Feral target. `extract-simc-gcd.mjs`, `extract-simc-talents.mjs`: the Feral targets. `src/simc/authority-artifact.ts`: validates the new selector and policy.
- `src/findings/spec-id.ts`, `src/services/analyzer-registry.ts`: the INTERNAL_ONLY row.
- `tests/unit/specs/onb-c1-feral-druid.test.ts`, `tests/unit/onb-c1-included-file-extraction.test.ts`, the registry and corpus pins, two corpus cases, `tests/support/corpus/executors/spec-feral-druid.ts`.
- Docs: `agent/architecture.md` "ONB-C1", `agent/follow-ups.md` "After ONB-C1" and "After ONB-S5", `agent/testing.md`, `agent/spec-onboarding-inventory.md`, `agent/autopilot-queue.md`, `agent/m11-spec-coaching-inventory.md`, `scripts/authority/README.md`.

## Validation run

- `npm run typecheck`: clean. `npm run format:check`: clean. `git diff --check`: clean.
- `npm run test:corpus`: PASSED (217 cases, 812 assertions), rerun with no `--write-report` after writing the report. `npm run test:evidence`: PASSED (32 cases, 80 assertions; the report gains only the new authority id). Run in sequence, with no suite beside them.
- Full suite on this tree, parallel, 60 s timeout: 15,056 tests, 15,055 passed, 1 failed: `m9b-corpus-harness` SPEC_PROTECTION_PALADIN, on ONB-B2P's list of parallel-load failures. It failed the same way in the previous run, and this change touches none of its code. I infer interference; I did not prove it.
- That file rerun alone: Tests 42 passed (42). The whole suite has not run clean in one pass.
- An earlier full run caught one real pin of mine (`m10a-spec-partition`), fixed.
- Focused: `onb-c1-feral-druid` and `onb-c1-included-file-extraction`, Tests 94 passed (94), counting the regressions the first review asked for.
- Real extractor runs against a local pinned source root: all three Feral targets extract, each file checked against its pinned hash. I did not regenerate other targets' artifacts: the extractor changes are new branches and a new target, and the existing preflight tests pass.
- Queue compared by script with the supervisor's list: 46 compared, 0 mismatched.
- Offline census and replay (`.probe/onbc1/`, not committed): the table above. No network to Warcraft Logs.

## What is not here

No public change, no promotion, no gate change, no new evidence, no cooldown binding, no change to the shared parser, the racial table or the pooling engine, no new queue entry, no Warcraft Logs request.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
