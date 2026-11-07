# Review request

Rolling file: overwritten for each review cycle.

## Change

SIMC-FB-R: replay the encounter-state-blocked specializations under the SimC profile fallback. Branch `autopilot/simc-fb-r`, from `main` at d134126.

- **Public contract change: NONE.** No file under `src/contracts/`, `src/api/` or `src/mcp/` changes. Every wired row is INTERNAL_ONLY.
- **Warcraft Logs: no request was made.** The replay reads retained captures through a fake transport.
- **Nothing is promoted,** and no public entry is added, because nothing qualifies.

## The result

No new decision resolves. Over 8,546 eligible decisions of 49 analyzed subjects: 4 MATCH, 0 REJECTED, 8,542 UNKNOWN, before and after, on the real calendar and with every build injected. The 4 MATCH are Destruction's existing Summon Infernal presses, each at a real bound of 2 or 3, with no tier-3 fact bound. So no tier-3 decision has resolved on real evidence. `agent/architecture.md` "SIMC-FB-R" has the table by specialization.

## What changed

1. **26 trees wired.** Each `observed-analysis.ts` calls `withEncounterStateAt`, and each `registration.ts` spreads `simcProfileFactsField` into its view, decision by decision. Five (Feral, Subtlety, Outlaw, Vengeance, Protection Warrior) read no count before and read the cast's own position now, as Arms does.
2. **A SIMC-FB-A defect fixed, in shared code.** `src/findings/simc-profile-fallback.ts` treated a resolver's UNKNOWN placeholder for `spell_targets.*` or `raid_event.*` as a stronger reading the caller held, so tier 3 never answered those atoms for a list that binds one. A placeholder is now replaced. A known or bounded value still stands, and after a contradiction the placeholder stays UNKNOWN. Two tests were added to `tests/unit/simc-fb-a-profile-fallback.test.ts`, and no assertion there moved.
3. **`target_if` attestations.** `src/specs/<class>/<spec>/sole-target-attestations.ts` in 17 trees: 50 attested, 26 refused, each refusal recorded with its reason in the file.
4. **Prose.** Each wired README gains a section, the `active_enemies` row is corrected where it had one, each vocabulary gains a note, and the unpublished limits prose no longer says the count can only be a lower bound.
5. **One guard moved.** `tests/unit/onb-s3-enemy-set.test.ts` "every wired specialization is INTERNAL_ONLY" now looks for `withEncounterStateAt(` instead of `withEnemyCountAt(`, because that call replaced it and reads the same enemy set first. Its sibling "no PUBLIC specialization binds it" now forbids both.

## Decisions for the reviewer to check

1. **The placeholder rule.** Is `UNKNOWN_NUMBER` correctly "no reading"? `BOUNDED_NUMBER` and `ONE_OF_NUMBERS` stand, as stronger readings a caller established. No resolver binds either of those to one of these atoms today.
2. **The attestation rule is conservative on purpose.** All warlock tokens are refused on `warlock_spell_t::select_target` (`sc_warlock_actions.cpp:548`) without reading it as harmless. Pseudo-actions are refused even where the engine would yield a one-element list, because their `target` need not be the enemy.
3. **How the audit was verified.** A subagent read each chain, then a script walked each attested struct's inheritance over the pinned source for `available_targets`, `target_filter_callback =`, `target_ready`, `select_target` and `harmful = false`. It flagged five rows, and I read each by hand: four filters are on background children, and Pyre's override returns the one enemy for its foreground object. CI cannot check the C++, because the clone is not committed, so CI checks shape only.
4. **The over-disclosure question from SIMC-FB-B.** No tier-3 decision resolved, so the label has cost nothing and no counterfactual evaluation was built.
5. **`resolved[index]` pairs a view row with its facts,** by position, with `?? []`. Both arrays are pushed together once per eligible cast, and the per-spec test pins equal lengths and row-by-row equality. Is that enough, given a misalignment would under-disclose?
6. **Build proof.** Only 12 of 49 analyzed subjects, all in b1Pm, are provable, and only with b1Pm's region from its committed capture, as a live request would retrieve it. The records list what extending the calendar takes, by report. Each is a new request or source, so nothing was done.

## Tests

- `tests/unit/specs/simc-fb-r-wiring.test.ts`, each of the 26 through the production row on synthetic casts: facts reach the view decision by decision; no report or Warcraft Logs source is named; an unproven build binds nothing; unretrieved DAMAGE binds nothing resting on the count; usability provenance does not move. Attestations are checked against each list's own `target_if` tokens. A proven second enemy takes the count from the profile, through the Destruction facade. The committed Arms slice has no DAMAGE grant, so on a proven build it reads nothing from the profile.
- **What they do not prove.** No gameplay result. Casts are synthetic, and the replay's numbers come from uncommitted captures, recipe `.probe/simcfbr`, so they are recorded and not pinned.

## Bookkeeping

The queue's SIMC-FB-R entry is `PR_OPEN` with its outcome. The supervisor's merged list was compared with the queue, and SIMC-FB-B was the one written. `agent/architecture.md`, `agent/follow-ups.md` and `agent/spec-onboarding-inventory.md` record the above.

## Validation

Run on this tree, with no Warcraft Logs request:

- `npm run typecheck`, `npm run format:check`, `npm run test:corpus` and `npm run test:evidence` all exit 0.
- Full suite, `npx vitest run --testTimeout=60000`: 20,740 of 20,743, run before one last edit to the new test file. The failures:
  - `m9a-corpus-layering`: the new test imported `fightOf`. It now imports the sanctioned `stateOf`. Fixed, and that one-import edit is the only change since the full run.
  - `m9b-corpus-harness` SPEC_PROTECTION_PALADIN: the timeout seen in earlier full runs (ONB-S3, POLB-A, SIMC-FB-A, SIMC-FB-B).
  - `runner-service-queue` W: a leftover job directory under parallel load, also seen in earlier runs (ONB-D1P, ONB-X5P).
- Focused after that edit, alone: the new test, `m9a-corpus-layering`, `simc-fb-b-disclosure-contract`, `m9b-corpus-harness` and `runner-service-queue`, 2,823 of 2,823. The two load failures pass here. They were not compared against base in the same parallel run.

The four untracked local paths (`.claude/` and the three `scripts/probe/wcl-*.probe.ts` files) are the standing CLAUDE.md exclusions and are not part of this change.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
