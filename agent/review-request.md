# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-C2: Outlaw Rogue (internal, Cohort C). Branch `autopilot/onb-c2`, from main at d8d0056. **Outcome: registered INTERNAL_ONLY. No decision resolves, and no retained capture holds one of its events.**

- **Warcraft Logs: NONE.** No request or probe. The census reads retained files offline.
- **Public contract: NONE.** Nothing under `src/contracts/`, `src/api/` or `src/mcp/` changed. A public Rogue/Outlaw request is SPEC_NOT_SUPPORTED, as before.
- **Queue bookkeeping:** ONB-C1P is recorded MERGED (PR #66, d8d00563…). The supervisor's other 47 merged tranches were compared by script: 0 mismatched. ONB-C2 is set to PR_OPEN.

## The thing to check first: the pooling resolver

`src/specs/rogue/outlaw/pooling-model.ts`. Feral's pool can POOL, because `max_energy=1` is an extra Energy requirement, so a Bite pressed below the line proves the spell castable and the line not ready. Outlaw's two pools have no such option:

    build[6]   pool_resource,for_next=1
    build[7]   ambush,if=talent.hidden_opportunity
    finish[1]  pool_resource,for_next=1
    finish[2]  killing_spree,if=buff.supercharge_1.up|cooldown.adrenaline_rush.remains>120|!talent.supercharger

Neither condition reads Energy. A press of the guarded action proves the line ready now, so `settlePendingPool` answers GUARDED_READY without asking the resolver. So the resolver is one-sided:

- condition FALSE: NOT_READY_AT_MAX. The pool does not stop the scan, and a build without Hidden Opportunity can reach Sinister Strike.
- anything else: UNKNOWN. It never says READY_AT_MAX, because that claims an unpressed Ambush or Killing Spree usable at full Energy, which needs stealth, Audacity, Blindside (`requires_stealth`, sc_rogue.cpp:2199-2208, :2783), a cooldown and Combo Points. None is bound.

So **POOLS is unreachable in this slice**, and that is stated. It loses no verdict: POOLS is UNKNOWN against any observed cast (ONB-S5). Please check that a false condition really is resource-independent here, and that nothing else can make the two lines fire.

## Why Requirement C cannot be met, and why this is not an owner stop

The queue entry anticipates it: "No retained evidence is known, so it is recorded for ONB-EV if real-evidence validation cannot be met." Rule 7 says missing evidence is recorded, never fetched.

Measured offline (`.probe/onbc2/census2.cjs`): 5,678 JSON files found, 5,677 parsed, over 500 bytes, under `.probe/` and `tests/`, skipping tool output and worktree copies. Casts of Sinister Strike, Pistol Shot, Dispatch, Between the Eyes, Roll the Bones, Blade Flurry, Adrenaline Rush, Blade Rush, Keep It Rolling and Killing Spree, by their pinned ids: none. Mortal Strike, the positive control: 559 casts. Contexts naming an Outlaw: g34mvXTKLMJ2Nfwr fights 1, 6 and 7, actor 17, only in the uncommitted `.probe/m13a/discovery.json`. An earlier name-based pass (`census.cjs`) found Coup de Grace and Killing Spree ids in master data, and 8 Coup de Grace casts by actor 17 of the M13-A capture. That actor is Gw2kXrTfLWcDdhFY's Subtlety Rogue, not g34m's Outlaw: Coup de Grace is shared by both specs, so it is not a signature here, and Ambush is not either.

## Measured on synthetic builds, not on evidence

Every decision stops at `default[0] stealth`. A tree that does not resolve a talent-built action has its root scan stop at `cds[0] adrenaline_rush` on applicability. A whole tree's root scan stops at `default[7] run_action_list` on `variable.finish_condition`, with the `cds` lines MAY_SELECT, and never enters `build` or `finish`.

## Decisions a reviewer might reject

1. **No transition contract, not even Kick.** Assassination has reviewed Stealth and Kick readings, and Outlaw could borrow the pattern. With no capture to check a reading against, none is bound here. This follows Subtlety.
2. **Shadowmeld classified as a racial by this specialization**, as Feral does, and `arcane_pulse` left refused, as Subtlety does (it follows the unconditional Sinister Strike).
3. **`talent.quick_draw.enabled` and `talent.audacity.enabled` bound by the three-way rule; `talent.fan_the_hammer.rank` unbound.**
4. **The conformance exception.** `rogue/outlaw` joins `IDENTITY_RETAINED_ONLY`, refused on a PUBLIC module, with its class string proven through the committed Subtlety Rogue. That test's class proof gained one branch for this row.
5. **Killing Spree stays eligible though channeled**, as Feral's Convoke does, with the unknown (does it log a begincast?) recorded. No decision resolves, so nothing depends on it yet.
6. **The pool tests enter at the pool's own list**, through an authority view that answers `default` with `build` or `finish`, because only a test can get past Stealth. Production code has no entry parameter for it.

## What changed

- `src/specs/rogue/outlaw/` (new), on Subtlety's shape, plus `pooling-model.ts`. `src/data/game/rogue-outlaw-*`, `src/simc/data/rogue-outlaw.apl.json` (48 actions in 5 lists, extracted through the pinned path).
- `scripts/authority/`: three new targets; no extractor logic changed.
- `src/findings/spec-id.ts`, `src/services/analyzer-registry.ts`: the row.
- Pins, corpus cases, report and inventory files; `tests/unit/specs/onb-c2-outlaw-rogue.test.ts` (new).
- `tests/contracts/m10a-spec-partition.test.ts`: its "unknown string" sample was `rogue/outlaw`, now a known id, so it became `hunter/survival`, still unregistered.
- Docs: `agent/architecture.md` "ONB-C2", `agent/follow-ups.md` "After ONB-C2", `agent/testing.md`, `agent/spec-onboarding-inventory.md`, `agent/m11-spec-coaching-inventory.md`, `agent/autopilot-queue.md`, `scripts/authority/README.md`.

## Validation run

- `npm run typecheck`: clean. `npm run format:check`: clean. `git diff --check`: clean.
- `npm run test:corpus`: PASSED (219 cases, 814 assertions), report matching. `npm run test:evidence`: PASSED (32 cases, 80 assertions). Both ran in sequence, with no suite beside them.
- Full suite, parallel, 60 s timeout, run before the corpus count pins moved: 15,301 tests, 15,298 passed, 3 failed. Two were `m9b-corpus-gate`, on those stale pins (217 cases, 812 assertions) and the stale report, which this change then moved; the corpus gate above runs both and passes. The third was `m9b-corpus-harness` SPEC_PROTECTION_PALADIN, on the recorded list of parallel-load failures. This change touches none of its code. I infer interference; I did not prove it.
- `m9b-corpus-harness`, `onb-c2-outlaw-rogue`, `m11-promotion-evidence-gate` and `analysis-composition-refusals` rerun together: 136 passed (136). The whole suite has not run clean in one pass.
- Queue compared by script with the supervisor's list: 47 compared, 0 mismatched; ONB-C1P's row was written from the supervisor's own values.
- Real extractor runs against the local pinned sources, all three targets: required facts VERIFIED. CI has no pinned checkout. No network to Warcraft Logs.

## What is not here

No promotion, no gate change, no public change, no new evidence, no shared-engine change, no Warcraft Logs request.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
