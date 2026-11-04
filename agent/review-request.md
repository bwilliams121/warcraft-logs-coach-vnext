# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-B3: Devourer Demon Hunter (internal, own representative). Branch `autopilot/onb-b3`, from main at 548330b.

- **Warcraft Logs: NONE.** No request or probe. The numbers replay retained pages through production ingestion over a fake transport, offline.
- **Public contract: NONE.** Nothing under `src/contracts/`, `src/api/` or `src/mcp/` changed. A public Demon Hunter/Devourer request is SPEC_NOT_SUPPORTED, as before.
- **Queue bookkeeping:** ONB-B2P is recorded MERGED (PR #62, 548330bd…). The other 43 merged tranches the supervisor listed were compared by script and already match. ONB-B3 is set to PR_OPEN.

## The thing to check first: is this the right stop?

The entry's requirement C asks for real MATCH, discrimination and negative-control evidence. None exists, and I did not stop for the owner. Please check that.

| Subject | Hero tree | Retained span | Eligible | MATCH | REJECTED | UNKNOWN | Excluded |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| gtKb2xHn87pNcFfW fight 22 actor 32 | Void-Scarred | whole, 284.8 s | 98 | 0 | 0 | 98 | 602 |
| rXAfw9t1q8YpmkKD fight 13 actor 20 | Void-Scarred | first 165.0 s of 271.8 s | 81 | 0 | 0 | 81 | 394 |
| rXAfw9t1q8YpmkKD fight 13 actor 79 | Void-Scarred | first 165.0 s of 271.8 s | 72 | 0 | 0 | 72 | 377 |

All 251 root scans stop on one atom: `voidscarred_melee[0] run_action_list | active_enemies`. That decision is ONB-S3, already queued as the owner's, and Arms and Frost took the same path (ONB-B1, ONB-B2). The entry asks for an internal registration, and the fail-closed result is what it asks for.

## What the entry named, and what happened to each

- **`pick_up_fragment,…,line_cd=`:** four timed lines and one untimed, one token. It has no spell and no log event, so no id binds it and nothing attributes. The adapter supplies the shared `lineCooldownFor`, and the answer is `LINE_CD:SELECTION_COVERAGE_NOT_PROVEN`. No real scan reaches these lines, so a test gives the query an enemy count only a test can have, to show `vsm_st[0]` reading that and nothing falling through. **Check this test is not misleading: `queryBehindTheCount` builds bindings by hand and is never production's path.**
- **`void_ray_count`, `op=add`:** executed by the shared rule. Inside Metamorphosis the add reads the unknown incoming value, so the count stays unknown, never zero. A test shows `vsm_meta[0]` staying open on it with Metamorphosis given.
- **Numeric `react`:** `buff.voidfall_*.react` parses, and stays open because no aura is bound.
- **Not forced into Cohort B:** only the file shape is shared. Its stop happens to be the same atom, on its own line.

## Decisions a reviewer might reject

1. **The talent extractor changed, for all targets.** `resolveHeroTree` now accepts a hero row scoped to no specialization as class-wide. All 16 of Annihilator's rows are held that way, and pinned `player.cpp:2778, :2898` reads them that way, as `resolveTalent` already did. `subTreeId` names the tree when two hero sub-trees hold one name (Demonic Intensity, as the module's `HT_FS` does). I regenerated the other 12 targets' artifacts through the changed extractor at their own dates, and each is byte-identical to the committed file. Not pinned by a test beyond the two synthetic rules.
2. **Void Ray stays eligible and the cast-time tokens do not.** Void Ray has no begincast, and on the whole-fight subject every tick of its 26 casts follows the `cast`, none before it, as ONB-S4 found for Arcane Missiles. Consume, Devour, The Hunt and Predator's Wake have begincasts on every subject, so they are `OUTSIDE_FIRST_SLICE`. Nothing resolves either way.
3. **Bindings by what the action is.** Void Metamorphosis binds 1217605 (the wire holds only the aura 1217607). Eradicate binds 1225826 and Hungering Slash 1239123, not their trait rows. 1245414, 1246169 and Soul Fragment 1223412 are lane records with no token.
4. **Soul Fragment 1223412 is not identified.** It is logged 243 to 385 times a fight at `_gcd` 0, and no action of the pinned module names it. I excluded it as off-GCD and said so; I make no claim about what it records.
5. **Collapsing Star.** It is in the talent-built table, but `midnight3` also opens it, and a lone node is never proven absent, so an absent talent reads UNKNOWN. A test pins it. Annihilator's list stops on `applicability` there.
6. **`prev_gcd.1.void_ray` and `cooldown.the_hunt.ready`** are declared and unbound, so all in-domain conditions parse whole and a stop names state rather than spelling. Both fail closed either way. `trinket.*` stays undeclared, as in the earlier slices.
7. **No transition contract and no aura or cooldown.** Havoc has a `pick_up_fragment` contract, and Devourer's would have to name Void Metamorphosis stacks too. No contract could move a decision past the count. The pins also fail against the wire (Cull 730 ms against an 8 s charge, Soul Immolation 1,643 ms against 60 s, Predator's Wake 41.1 s against 90 s), so a floor from the pin would be false.

## Limits of the measurement

- **Census scope.** It parsed every JSON file over 500 bytes under `.probe/` and `tests/`, skipping tool output and worktree copies (5,647 parsed), for casts of signature abilities named in the contexts' master data, with Mortal Strike as a positive control. It also listed every context naming a Devourer. Seven other reports name a Devourer (2xpt, FPp6, yzH9, 24XJ, xBFW, 6xZN, hqvr), and the events census found no signature cast for any of them. A subject with no signature cast in a retained span would not appear.
- **Chaining.** gtKb's three captures are joined by the first timestamp of the next file, as in ONB-B1P. That is a replay's join, not a coverage proof. It is not committed, and nothing resolves either way.
- **Two of the three are prefixes.** The rXAf pages end at 165.0 s of 271.8 s.
- **One build family, one encounter.** All are Void-Scarred with The Hunt, on Sszorak. Annihilator and `voidscarred_ranged` are synthetic only. Follow-ups say a promotion must measure or refuse them.

## What changed

- `src/specs/demonhunter/devourer/`: the module. `src/data/game/demonhunter-devourer-*`, `src/simc/data/demonhunter-devourer.apl.json`: pinned data with provenance.
- `src/findings/spec-id.ts`, `src/services/analyzer-registry.ts`: one row.
- `scripts/authority/`: the Devourer GCD and talent targets, the two rules above, and types. `scripts/corpus/build-manifest.mjs`: two cases.
- Tests: `tests/unit/specs/onb-b3-devourer-demon-hunter.test.ts` (new), the corpus executor, and the mechanical pins.
- Docs: `agent/architecture.md` "ONB-B3", `agent/follow-ups.md` "After ONB-B3", `agent/testing.md`, `agent/spec-onboarding-inventory.md`, `agent/m11-spec-coaching-inventory.md`, `agent/autopilot-queue.md`, `scripts/authority/README.md`.

## Validation run

- `npm run typecheck`: clean. `npm run format:check`: clean. `git diff --check`: clean.
- `npm run test:corpus`: PASSED (215 cases, 810 assertions). `npm run test:evidence`: PASSED (32 cases, 80 assertions). Run in sequence, with no suite beside them.
- Full suite on the final tree, parallel, 60 s timeout: 14,724 tests, 14,722 passed, 2 failed: `m9b-corpus-harness` SPEC_PROTECTION_PALADIN (a timeout-shaped error) and `runner-service-queue` W (a leftover job directory). Both are on ONB-B2P's list of parallel-load failures, and this change touches none of that code. I infer interference; I did not prove it.
- Those two files rerun serially: Tests 53 passed (53). The whole suite has not run clean in one pass.
- An earlier full run on this branch caught one real pin of mine (`m10d-public-second-registration-invariance`, a registration count), fixed above.
- Real extractor runs against a local pinned source root: all three Devourer targets extract, every file checked against its pinned hash. The other 12 talent artifacts regenerate byte-identical.
- Offline replay (`.probe/onbb3/m/`, not committed): the table above. No network to Warcraft Logs.

## What is not here

No promotion, no gate change, no public change, no new evidence, no aura, cooldown or contract, no new queue entry. ONB-B3P is the next entry, and should expect "not promoted" unless ONB-S3 lands first.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
