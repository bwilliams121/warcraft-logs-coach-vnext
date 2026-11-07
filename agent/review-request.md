# Review request

Rolling file: overwritten for each review cycle.

## Change

SIMC-FB-A: shared SimC profile fallback for encounter state (internal). Branch `autopilot/simc-fb-a`, from `main` at 6d7eb39.

- Implements the precedence in `agent/architecture.md` "Owner decision (2026-11-06): SimC profile fallback": observed or proven evidence, approved curated authority, the pinned profile, UNKNOWN.
- **No specialization is wired**, so no decision, finding or public output moves. Reading it is opt-in, and SIMC-FB-R does that. Disclosure is SIMC-FB-B.
- **No public contract change:** `src/contracts/`, `src/api/` and `src/mcp/` are untouched.
- **Warcraft Logs: no request was made.** Everything reads committed or retained bytes.

## What was added

- `scripts/authority/extract-simc-profile-environment.mjs` and `src/data/simc-profile/simc-profile-environment.{json,ts}`: the versioned record of 32 specializations' profiles and environment, with 13 engine statements cited by path, file hash, line span and excerpt hash. It is generated from the pinned clone through `git show`.
- `src/simc/expression/profile-environment-atoms.ts`: what the pinned engine makes of `fight_style.*`, `raid_event.*` and `spell_targets[.*]` in that environment.
- `src/findings/simc-profile-fallback.ts`: `withEncounterStateAt`, the precedence, and the `SimcProfileProvenance` for each binding.
- `src/findings/proven-fight-build.ts`: the proven build through the existing resolver.
- `src/simc/target-if.ts` and `evaluate.ts`: an optional `TargetDomain.universe: "PROFILE_SOLE_TARGET"`, which reads the pinned one-candidate branch for MIN and MAX. No other domain gets it.
- `tests/unit/simc-fb-a-profile-fallback.test.ts`: 47 tests.

## Decisions for the reviewer to check

1. **Build.** The record lists 12.1.0.69587 and also 12.1.0.69933 (`0a72e6a746`, the second approved model), because every cited excerpt and every profile's option lines are identical at both. This is an environment claim only, and the APL stays at the analyzer pin as it does today. Listing only 69587 would leave the fallback unusable on every retained pull. Is this "the build and profile are proven", or is it an owner question?
2. **A reviewed layering change.** `m11g4-simulation-context-layering` now names a second importer of `src/simulation-context/`, `src/findings/proven-fight-build.ts`. POLB-A said this seam would need a reviewed change. Nothing on a public path imports it.
3. **What a contradiction takes away.** A lower bound above the profile's 1 withholds `active_enemies`, `spell_targets`, the target domain and the `adds` and `pull` schedule, and the real bound is read. `fight_style.*` and `raid_event.movement.*` stay, because they do not rest on the count.
4. **`spell_targets` under contradiction stays unbound** rather than reading the real bound, because geometry stays action-owned.
5. **`target_if`.**
   - The candidate is the profile's own target and never an observed actor. Its reads are the base bindings, so a target-scoped atom is read as on the player's real target at D, and an unbound atom stays undecided.
   - Readiness needs a per-action attestation with a citation, because 21 `available_targets` overrides and 48 live `target_filter_callback` assignments can change `target_list()`. An unattested action gets no domain and reads as before. So the shared code alone resolves no `target_if` line.
6. **Fail closed where evidence conflicts or is missing.** A contradiction between proofs, an unresolved position or a non-monotonic timeline stays UNKNOWN rather than taking the profile's 1. So does a decision where the subject's `AURAS` or `DAMAGE` were not retrieved from the pull's start to D, because a failed page is missing evidence that could contradict the profile, not an unobservable gap.

## Real evidence

- **b1PmaKrd6CDfzngc fight 48, actor 15, in the committed test.** The calendar proves 12.1.0.69933. Of 668 casts, 661 read tier 3 and 7 have a lower bound above 1 and read it, equal to `withEnemyCountAt`'s binding. Removing every later event changes no reading. With no region the same fight is not proven.
- **A7R6 fight 7, Destruction actors 12 and 15, offline** (raw pages not committed, recipe in `.probe/simcfb/m`, not part of the tree). With a build injected, since the capture has no region, the 4 existing MATCHes stay, each at a real bound of 2 or 3, with coverage unchanged at 2 MATCH and 113 UNKNOWN, and 2 MATCH and 103 UNKNOWN, and 0 REJECTED. On production that fight is `BUILD_UNRESOLVED`.

## Negative tests the queue names

The fallback never appears as observed evidence, never overrides a contradiction, never answers what the profile leaves open, and never runs on an unproven build. Also: it never settles a conflict between proofs, never binds under a contradiction beyond the rule above, and never reads an unattested action's target list. No PUBLIC tree or public path imports it.

## Supersession

Comments, READMEs and four test titles that said a simulation setting is never bound now say it may be bound at tier 3 with provenance. No assertion moved, and no test of tiers 1 and 2 or of fail-closed behavior was weakened. Every facade test stays as it was, because no list reads the fallback yet.

## Bookkeeping

The queue's SIMC-FB-A entry is `PR_OPEN`, and the supervisor's merged list was compared with the queue, 75 entries, 0 written. `agent/architecture.md`, `agent/follow-ups.md` and `scripts/authority/README.md` record the above.

## Validation

Run on this tree, with no Warcraft Logs request:

- `npm run typecheck`, `npm run format:check`, `npm run test:corpus` and `npm run test:evidence` all exit 0, and the gates change no report.
- Focused: `tests/unit/simc-fb-a-profile-fallback.test.ts` 48 of 48.
- Full suite, `npx vitest run --testTimeout=60000`: 20,269 of 20,270. The one failure is `m9b-corpus-harness` SPEC_PROTECTION_PALADIN, a timeout seen in earlier full runs (ONB-S3, POLB-A). It passes alone on this tree. It was not compared against base in the same parallel run.

The four untracked local paths (`.claude/` and the three `scripts/probe/wcl-*.probe.ts` files) are the standing CLAUDE.md exclusions and are not part of this change.
