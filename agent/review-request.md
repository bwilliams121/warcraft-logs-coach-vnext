# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-X3: Vengeance Demon Hunter (internal, own representative). Branch `autopilot/onb-x3`, from main at 278c1ef. **Registered INTERNAL_ONLY, 0 MATCH, 0 REJECTED, all UNKNOWN, on synthetic builds only: no retained capture holds a cast or combatant info of this specialization.**

- **Warcraft Logs: NONE.** No request or probe. The census reads retained files offline.
- **Public contract: NONE.** Nothing under `src/contracts/`, `src/api/` or `src/mcp/` changed. A public DemonHunter/Vengeance request stays SPEC_NOT_SUPPORTED.
- **Shared production code: only the additive registration rows** (`src/findings/spec-id.ts`, `src/services/analyzer-registry.ts`). No engine, parser or shared-evaluator change.
- **Queue bookkeeping:** ONB-X2P is recorded MERGED (PR #80, 278c1ef7…), and ONB-X3 is set to PR_OPEN. The supervisor's whole merged list was compared by script (see Validation).

## The things to check first

**1. Is the tank's meaning really separate from offense?** `SIMC_APL_DEMONHUNTER_VENGEANCE` binds OFFENSIVE_ROTATION only. ACTIVE_MITIGATION, DEFENSIVE_COOLDOWN, SELF_HEALING, RESOURCE_SPENDING and INTERRUPT are declared and resolve `NO_PINNED_AUTHORITY_FOR_DOMAIN`, each with `offensiveAuthorityGoverns: false` (`src/specs/demonhunter/vengeance/authority-bindings.ts`, `domains.ts`). A Demon Spikes, Metamorphosis, Infernal Strike or Disrupt press is excluded by its pinned `_gcd` 0. Demon Spikes down in combat keeps a scan open and never selects, pinned in the suite. Fiery Brand and Soul Cleave are `_gcd` 1500, so they are decisions, and a comparison of one says nothing about what it mitigated or healed. Is treating a Fiery Brand as a rotational press acceptable, given that the pinned list orders it as one?

**2. The queue entry expected ONB-S2 to carry the variable programme, and it does not. Is that the right call, and not an owner stop?** `%` still refuses (`UNSUPPORTED_OPERATOR`) on nine `ar` values, as agent/follow-ups.md "After M11-D3-C2" recorded, so `time_to_next_glaive` has no value. I did not add `%` to the shared parser: every specialization reads it, this tranche declares no shared change, and it would resolve nothing here because the same variables read soul fragments and charges nothing binds. The suite pins that the variable stays open with every other input given, and that the list of refused values is exactly those plus two `trinket.*` values. None reads as zero. The ONB-S2 test (`tests/unit/onb-s2-variable-combining.test.ts`) already pins the shape against the pinned lines.

**3. Is the evidence claim sound, and is ONB-EV right?** Census at this base (`.probe/onbx3/census.cjs`, `census.txt`): 5,715 JSON files, 5,714 parsed (the other is `.probe/m11d2c/bad.json`). Controls: Mortal Strike, 559 casts, and 31 specIDs in combatant info, with 581 absent. Three routes: combatant-info specID 581, casts of the 21 ids reports' master data name for the eleven signature abilities, and casts of 11 pinned ids. No route finds a cast. The only reports naming a Vengeance player are LYwF fights 1, 6, 12, 20 and 24 actor 19, g34m fights 1, 6 and 7 actor 13 and zpry fights 30 to 34 actor 741, all in the uncommitted `.probe/m13a/discovery.json`, with no event retained. Limits: only `cast` and `combatantinfo` events are read, and not files of 500 bytes or less, or log and text output. ONB-EV already names this specialization; no text there changed.

**4. The `auto_attack` contract.** Without it the first refusal is a missing lane. It copies Havoc's reading at the same pinned lines (`sc_demon_hunter.cpp:7002-7041`), and 11 other pinned datasets bind that token. `USABILITY:auto_attack` still refuses, so the engine reports `default[16] auto_attack` first, as Feral's does, and no decision moves. No other off-GCD action is contracted.

**5. Fel Devastation is excluded.** It is channeled (`:4165`). The wire fact that a channel's `cast` is its start is measured on other specializations only, so with no capture of this one the facade reports `OUTSIDE_FIRST_SLICE` rather than assume the moment.

**6. Identity.** `demonhunter/vengeance` joins the conformance suite's `IDENTITY_RETAINED_ONLY`, because no committed context names one. Its class string is proven through committed Havoc, b1Pm fight 48 actor 18, and the exception refuses a PUBLIC module. The talent artifact's note says the id space is NOT corroborated for this specialization.

## The evidence

No replay exists, because nothing is retained. Measured synthetically (`.probe/onbx3/m/`, then pinned by the suite):

| Build | Query's first refusal | Root scan stops at |
| --- | --- | --- |
| Aldrachi Reaver | `default[16] auto_attack` | `ar[59] call_action_list` |
| Annihilator | `default[16] auto_attack` | `anni_voidfall_spending[11] call_action_list` |
| no hero entry in the tree | `default[16] auto_attack` | `default[21] run_action_list`, on `hero_tree.aldrachi_reaver` |

Disrupt, Infernal Strike and Demon Spikes are open behind the first refusal on each.

## Decisions a reviewer might reject

1. **Cloned from Devourer**, with its `line_cd` history removed, since this list has no `line_cd`. Capabilities cloned from Protection Warrior. No `cast-anchor-profile.ts`: no row has a positive cast time.
2. **`OUTSIDE_FIRST_SLICE` holds one token**, kept in the shared shape rather than a new reason.
3. **No `README` claim about a real fight.** Everything real is the pinned list and the census.
4. **The inventory's evidence stays `NONE_KNOWN`**, because `CONTEXT_ONLY` means a committed context, and the row records the three uncommitted reports beside it. The Fury, Protection Warrior and Outlaw rows say `CONTEXT_ONLY` on uncommitted contexts; I left them as they are, outside this tranche.

## What changed

- Spec tree: `src/specs/demonhunter/vengeance/`.
- Pinned data: `src/simc/data/demonhunter-vengeance.apl.json`, `src/data/game/demonhunter-vengeance-{gcd-semantics,talents,transition-authority}.*`, from three new extractor targets at the existing hashes.
- Registration: `src/findings/spec-id.ts`, `src/services/analyzer-registry.ts`.
- Tests: `tests/unit/specs/onb-x3-vengeance-demon-hunter.test.ts`, the registration pins, two corpus cases and their executor, regenerated corpus manifest and reports, the gate-search pin.
- Docs: `agent/architecture.md`, `agent/follow-ups.md`, `agent/spec-onboarding-inventory.md`, `agent/m11-spec-coaching-inventory.md`, `agent/testing.md`, `agent/autopilot-queue.md`, `scripts/authority/README.md`, `agent/review-request.md`.

## Validation run

- `npm run typecheck`: clean. `npm run format:check`: clean after formatting two files it first flagged (`m11a-registration-list-complete` and the regenerated `tests/corpus/manifest.json`). `git diff --check`: clean.
- `npm run test:corpus -- --write-report`: PASSED. `npm run test:evidence -- --write-report`: PASSED. Both ran in sequence, with no suite beside them, before that formatting. The m9b gate test, which compares the report field for field, passes after it.
- `scripts/bench/m10d-public-invariance.bench.ts`: 20 passed.
- Full suite, parallel, 60 s timeout, before that formatting: 18,362 tests, 18,361 passed, 1 failed: `m9b-corpus-harness` SPEC_PROTECTION_PALADIN, on the recorded list of parallel-load failures. This change touches none of its code, and it passes rerun without the full suite beside it, so I infer load. The whole suite has not run clean in one pass.
- Rerun after the formatting: `m9b-corpus-harness`, `m9b-corpus-gate`, `m9b-corpus-manifest`, `m11a-registration-list-complete`, `m11a2-spec-module-conformance` and the `onb-x3` suite: 434 passed (434), 6 files.
- Queue compared by script with the supervisor's whole merged list: 61 compared, 1 written (ONB-X2P), 0 missing, and a second run wrote nothing.
- After the first review (a stale test path in the manifest row, and the inventory's evidence state): manifest regenerated, `format:check` clean, `git diff --check` clean, and `m9b-corpus-manifest`, `m9b-corpus-harness`, `m9b-corpus-gate` and `tests/contracts/onb` rerun: 93 passed (93), 5 files. The 12 older stale manifest paths the same check found are recorded in agent/follow-ups.md "After ONB-X3", not fixed.
- No network to Warcraft Logs.

## What is not here

No promotion, no public change, no new evidence, no shared parser or engine change, no Warcraft Logs request.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
