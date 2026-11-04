# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-A2: Subtlety Rogue, Fury Warrior and Protection Warrior, internal. Branch `autopilot/onb-a2`, from main at 7938617.

All three are registered INTERNAL_ONLY as Cohort A's followers, each with its own pinned list, GCD and talent data, resolver,
facade and registration under `src/specs/<class>/<spec>/`.

- **Warcraft Logs: NONE.** No request or probe, and no evidence is committed, so the archive's notice line is untouched.
- **Public contract: NONE.** Nothing under `src/contracts/`, `src/api/` or `src/mcp/` changed. Public lookups and the identity
  table refuse all three rows.
- **Queue bookkeeping:** ONB-A1P is recorded MERGED (PR #56, 7938617e…). Every other merged tranche the supervisor listed was
  already recorded MERGED. ONB-A2 is set to PR_OPEN. ONB-EV gains Subtlety, and ONB-S3 records that it also gates Fury and
  Protection Warrior.

## The thing to check first: no decision resolves, and I did not stop for it

**Queue requirement C is not met, and no decision of any of the three reaches MATCH or REJECTED.** A census of every retained
capture (`friendlySpecs` aligned to `friendlyPlayers`, then events by actor) found:

| Spec | Retained | Why it cannot validate |
| --- | --- | --- |
| `rogue/subtlety` | M13-A actor 17: 150 filtered casts, committed. Two more contexts | no combatant info, auras or resources, so the facade refuses `PROFILE_NOT_RESOLVED` |
| `warrior/fury` | m11c4f context-2 actor 3, context-4 actor 21: contexts, uncommitted | no event |
| `warrior/protection` | m11c4f context-1 actor 5: context, uncommitted | no event |

The queue entry says to "record them for ONB-EV if real-evidence validation cannot be met", and rule 4 keeps such a spec
INTERNAL_ONLY, so I treated this as the expected path rather than an owner stop. The entry named only Fury and Protection for
that; Subtlety's evidence turned out unusable too, and it is appended to ONB-EV.

Where each list stops, measured over synthetic whole builds and pinned in the test:

| Spec | First refusal of the query | Root scan stops at |
| --- | --- | --- |
| Subtlety | `default[5] stealth`, `TRANSITION_UNSUPPORTED` | none: everything below is MAY_SELECT |
| Fury | `default[0..1]`, Charge has no contract and `time`/`movement.distance` have no evidence | `default[14]` or `[16] run_action_list` on `active_enemies` |
| Protection | `default[2] charge` | `default[15] ignore_pain`, `TOO_MANY_UNRESOLVED_ATOMS` |

**A correction to the census.** M11-D0 and the inventory described Cohort A as having no `run_action_list`. Fury and Protection
Warrior both dispatch with it, gated on the enemy count, so their real prerequisite is ONB-S3, already an open owner decision.
Recorded in the inventory's cohort table and on ONB-S3. It reorders nothing.

## Decisions to check

1. **Bind only what is defensible without real evidence.** Own-cast PRE_COST resources, the three-way talent rule, and Havoc's
   hero-tree proof. No aura identity, no cooldown, no transition beyond `auto_attack`. Havoc showed a wire id can differ, a pinned
   cooldown can be contradicted and a logged cast may not be a press, and with no capture none of that can be checked.
2. **No unselectability proof.** `proveObservedActionUnselectable` from Havoc is omitted rather than stubbed: the conditions it
   needs FALSE read state nothing here binds. Every comparison passes `null`, so no REJECTED path exists. Its return is tied to
   the first aura or cooldown binding (`agent/architecture.md` "ONB-A2").
3. **The tank's meaning stays its own.** Ignore Pain, Shield Block and Shield Wall are NON_GCD, so a logged press is excluded, never
   judged, and each line can only stop a scan. ACTIVE_MITIGATION, DEFENSIVE_COOLDOWN and SELF_HEALING resolve
   `NO_PINNED_AUTHORITY_FOR_DOMAIN`. Demolish is channelled and excluded `OUTSIDE_FIRST_SLICE`.
4. **`IDENTITY_RETAINED_ONLY`, please check this one.** `m11a2-spec-module-conformance.test.ts` requires each module's WCL strings to
   be proven from a committed context, and none holds a Fury or Protection Warrior. The exception names the retained context each
   string was read from, proves the class string from a committed Warrior, and fails on a PUBLIC module, so ONB-A2P needs committed
   bytes first. It narrows a test for two INTERNAL_ONLY rows only. No public path depends on those strings: the identity table has no
   row for them.
5. **One class-neutral extractor change.** The GCD extractor dropped every sanity-anchor id from the runtime slice, which removed
   Backstab (anchor 53) from Subtlety's dataset and failed its load. An id the target names as an ability now stays. No earlier
   target names an anchor, so no earlier artifact changes; I did not regenerate them all to prove it, the check is the grep of
   `abilityGameId: 53,` in the script (one anchor, one Subtlety row).
6. **Duplication.** Each tree repeats the Havoc shape (adapter, state, facade, registration), from one generator kept in `.probe/`.
   That is the established per-spec pattern. If it should now move to shared primitives that belongs in its own tranche.
7. **Hero-tree talents are hand-listed per spec** (`*_HERO_TREE_TALENTS`). Only talents the list reads or an action is built on.

## Validation run

- `npm run typecheck` (`tsc --noEmit`): clean. `npm run format:check`: clean. `git diff --check`: clean.
- `npm run test:corpus` and `npm run test:evidence`: both gates PASSED (207 cases, 802 assertions; evidence 30 cases, 76 assertions), reports written by `--write-report`.
- Focused: `onb-a2-cohort-a-followers.test.ts` and all of `tests/contracts`, serial: 7,892 tests, 0 failed.
- Full suite, parallel, 30 s timeout: 13,799 tests, 4 failed. Two were pins this change made stale, since fixed: `m10a-analyzer-result-ownership` used `warrior/protection` as its unregistered id and now uses one no roster has, and `m10d-public-second-registration-invariance` needed the three rows. The other two (`m9b-corpus-harness` SPEC_PROTECTION_PALADIN, a timeout, and `runner-service-queue` W, a temp-directory assertion) are in code this change does not touch. All four files then passed serially with a longer timeout: 80 tests, 0 failed. The full suite was not rerun after those two one-line pin fixes.
- No real-evidence run exists: there is no retained capture to replay.

## What is not here

No evidence, no public change, no transition contract beyond `auto_attack`, no aura or cooldown binding, no change to ONB-S3. Follow-ups
are in `agent/follow-ups.md` "After ONB-A2", including what a follower with real evidence must measure first.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
