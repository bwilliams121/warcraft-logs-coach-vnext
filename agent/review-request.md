# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-B1: Arms Warrior (internal, Cohort B representative). Branch `autopilot/onb-b1`, from main at 15658bc.

- **Warcraft Logs: NONE.** No request or probe. The real numbers replay the retained M11-E2 capture through production ingestion, offline.
- **Public contract: NONE.** Nothing under `src/contracts/`, `src/api/` or `src/mcp/` changed. A public Warrior/Arms request is
  SPEC_NOT_SUPPORTED, as before.
- **Queue bookkeeping:** ONB-A2P is recorded MERGED (PR #58, 15658bcd…). The other 39 merged tranches the supervisor listed were compared by
  script and already match. ONB-B1 is set to PR_OPEN.

## The thing to check first: is an internal row that resolves nothing the right result, and is it not an owner stop?

The queue says Cohort B's pattern is "`run_action_list` dispatch, cooldown windows", with ONB-S1 as its prerequisite, and requirement C asks for
real MATCH, discrimination and negative-control evidence. Measured, whole fight 48, actor 5 (Slayer): **324 eligible, 0 MATCH, 0 REJECTED, 324
UNKNOWN, 225 excluded.** Every root scan stops at `default[17] run_action_list` on `active_enemies`. So requirement C is **not met**, and the
tranche says so.

I did not stop, because:

- `run_action_list` itself works: the shared engine closes `default[14..16]` on the Slayer tree, scans `variables` and `trinkets`, and collapses the
  undecided gate. No shared code changed.
- What stands in the way is the enemy count, already the owner's as ONB-S3. ONB-A2 reached the same conclusion for Fury and Protection Warrior, and
  it was approved. Onboarding rule 5 reserves a stop for a genuine choice this tranche must make, and it does not have to make this one: the entry asks
  for an internal registration, and rule 4 tells ONB-B1P what to do.
- The owner still gets told: `agent/follow-ups.md` "After ONB-B1" says the next rotational promotions wait on ONB-S3, and the ONB-S3 entry now names it.

**If you think the absence of any real MATCH makes this tranche incomplete rather than fail-closed, that is the finding to raise.**

## Why no aura or cooldown binding

Requirement A asks for "state reconstruction" and I bound only `rage` and talents. I asked whether binding more could produce a decision over the open
dispatch. Worlds converge only if `slayer_aoe`, `slayer_execute` and `slayer_st` all select one action, and two tokens could:

- Heroic Strike sits behind `!talent.fervor_of_battle` in `slayer_aoe`, a lone node the subject did not take, which is UNKNOWN (the A Fire Inside question).
- Colossus Smash needs Sweeping Strikes, Avatar, Bladestorm and Cleave each proven down or closed, for 10 decisions at most. The wire contradicts the pin: smallest
  gaps 27.1 s vs 45 s (Colossus Smash), 26.1 s vs 90 s (Bladestorm), 50.6 s vs 90 s (Avatar), 4.2 s vs 4.5 s (Cleave), under 1 s vs 6 s (Mortal Strike). A floor
  from the pin would make false verdicts.

The gates need several tokens and a discriminating REJECTED, which this route cannot reach. So binding them would be machinery with no decision behind it.
This is reasoning from the list and the wire, not an exhaustive run: I did not build an oracle overlay and count convergent decisions.

## Decisions to check

1. **`colossus-smash-window-fill` as an observation** (`src/specs/warrior/arms/colossus-smash-windows.ts`, the payload's `colossusSmashWindows`). The queue names the
   question, and it is the one real output. Per window, the logged casts of the hero tree's single-target lines gated on `debuff.colossus_smash.up`. Internal payload only,
   no verdict, no public surface. Whole fight: 35 windows from 10 casts, all established; 9 Avatar and 33 Bladestorm per-window counts; 2 windows with neither.
   - **Fail-closed:** a missing edge, a transition M4's `presenceAt` will not prove ACTIVE from the one before it, CASTS coverage short of COMPLETE (range, scope or decode), an unreadable cast that could be a gated one, or a gated cast in an edge's own millisecond is NOT_ESTABLISHED with `presses: null`, never zero. No window is extended.
   - **Direction:** read from the event, so the log's 208086 BUFF on the actor and another player's debuff are not windows.
   - **Attribution:** counts are per window and not target-attributed, because the subject's Colossus Smash casts report target -1. One press lands in every window it overlaps. Documented.
   - **Layering:** it reads M4 and the shared gate only. A first version imported `combat-facts/coverage`, which the layering tests refuse, rightly, for a specialization module.
2. **Execute binds 163201 and 281000.** The pinned effect row 738985 of Massacre (281001) overrides 163201 onto 281000, and the subject logs 79 of 281000 and none of 163201. Bladestorm binds 227847 and 446035 as Fury does. Sweeping Strikes is GCD_CONSUMING (750 ms).
3. **The unsupported subject moved to A7R6 fight 7 actor 17, Mage/Fire** (ONB-X1), because the guard demands it the day `warrior/arms` joins `SpecId`. That is the largest mechanical part of the diff: tests and two renamed corpus cases. gtKb fight 22 actor 12 stays Warrior/Arms in `m11c4j-mixed-raid-night`, because that is what the capture holds and a public request still refuses it. Real roster strings in tests with no support dependency (`m13b`, `roster-snapshot`, `m15f` disclosure aside) were left alone.
4. **Logged casts stay eligible though some are copies.** Unhinged's Mortal Strike copies run on 12294 (sc_warrior.cpp:3252-3254, :3324): all 9 Bladestorms are followed by one within 404 to 527 ms. They cannot be told from presses here. They are UNKNOWN, so nothing is wrongly judged, and the 324 overstates presses. Recorded in the README and follow-ups. Havoc excluded its copy-prone token; I did not, since a Mortal Strike is also the most common real press.
5. **Evidence: first 6 s only** (20,265 bytes of the 25,477 left under the notice line, leaving 5,212). Whole grants: every family of AURAS, RESOURCES, CASTS and COMBATANT_INFO for actor 5. I did **not** raise a measured proposal for the whole fight (about 1.1 MB), because nothing pinned would change. Check whether spending the line on this is right, given the next tranche with evidence needs an owner decision either way.

## Corrections after review 1

Both findings were migration errors of mine, and fixing them surfaced the same slip elsewhere:

1. The `wcl-rage-fury-focus-pre-cost` fixture's provenance is actor 4, Warrior/Arms, again (`build-manifest.mjs`, the generated manifest). The migration's text rewrite had reached a line about real events. I audited every other changed line of the builder for the same mistake and found none: the rest name the sentinel.
2. `scripts/bench/m10d-public-invariance.bench.ts` now uses actor 17, Mage/Fire, consistently across the subject, both roster maps and the comments. The bench is not run by CI, and I did not run it: it was typechecked only.
3. Beyond the findings: `m7f-raid-night-orchestration` and `raid-night-preparation` had kept id 4 beside Mage/Fire, as had the three mixed-raid-night headers and a fixture comment. All now say 17.

## Corrections after review 2

The three window defects, each with a regression: decode-degraded CASTS now refuse; a cast of the actor with no ability id, or a gated cast with no source, refuses inside the window; and membership is strictly between the edges, with a gated cast in an edge's millisecond refusing as `EDGE_ORDER_NOT_ESTABLISHED`. The whole-fight numbers are unchanged under the stricter rule: 35 windows, all established. Focused rerun: the Arms unit file, the layering pins and the evidence gate pass. The full suite has not been rerun since these window changes.

## Validation run

- `npm run typecheck`: clean. `npm run format:check`: clean. `git diff --check`: clean.
- `npm run test:corpus` and `npm run test:evidence`: both gates PASSED (209 cases, 804 assertions; evidence 32 cases, 80 assertions), each matching its committed report.
- Full suite, parallel, 60 s timeout, over this tree: 14,037 tests, 14,036 passed, 1 failed: `m9b-corpus-harness` SPEC_PROTECTION_PALADIN, a load timeout in code this change does not touch. That file passed serially with `runner-service-queue` and `m11d2c-pinned-extraction-preflight` on the previous cycle (110 tests, 0 failed); nothing in it changed since.
- Offline replay of the retained capture (`.probe/onbb1/m/`, a fake transport over `.probe/m11e2/pages.json`, no network): the numbers above.
- Extractor reruns are reproducible on the pinned sources: the Arms GCD and talent artifacts regenerate to the same bytes after prettier.
- Not run: no mutation test of the window rules. Their negatives are direct tests in `tests/unit/specs/onb-b1-arms-warrior.test.ts`.

## What is not here

No promotion, no public change, no shared-engine change, no aura, cooldown or transition binding beyond `auto_attack`, no second Arms subject (A7R6 actor 4 and gtKb actor 12 are retained and unmeasured), no oracle measurement of convergence.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
