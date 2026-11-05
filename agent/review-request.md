# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-X4: Demonology Warlock (internal, own representative). Branch `autopilot/onb-x4`, from main at 3d8c6f4. **Registered INTERNAL_ONLY, 0 MATCH, 0 REJECTED, 1,391 UNKNOWN over seven real subjects. It is the first consumer of the ONB-S6 pet mapping, and those readings move no real decision.**

- **Warcraft Logs: NONE.** No request or probe. Every replay and wire probe reads retained files offline.
- **Public contract: NONE.** Nothing under `src/contracts/`, `src/api/` or `src/mcp/` changed. A public Warlock/Demonology request stays SPEC_NOT_SUPPORTED.
- **Shared production code: only the additive registration rows** (`src/findings/spec-id.ts`, `src/services/analyzer-registry.ts`). No engine, parser or shared-evaluator change.
- **Queue bookkeeping:** ONB-X3P is recorded MERGED (PR #82, 3d8c6f4f…), and ONB-X4 is set to PR_OPEN. The supervisor's whole merged list was compared by script (see Validation).

## The things to check first

**1. Are the pet lifetimes defensible? This is the first reviewed `PetMappingProfile`.** `src/data/game/warlock-demonology-pet-semantics.ts`. The Tyrant has no floor and no ceiling: its spawn is `data().duration()` plus `gauss<380, 220>` (`sc_warlock_actions.cpp:3583-3584`), nothing proves an encounter cannot kill one, 31 of 32 retained instances source events 18,941 to 20,622 ms after the summon against a pinned 15,000 ms, and one 11,252 ms, while delayed damage (M11-ED) means those bound nothing. The imps have a ceiling of 40,000 ms and no floor: both spells feed one spawner taking the spell's duration (`:2567`), the module never reschedules an imp (it reschedules only Dreadstalkers, `:3597`), and the longest retained summon-to-cast gap is 15,009 ms. Should the 40,000 ms ceiling stand, given it is a sim and spell-data reading with no game-side proof? I kept it because `LIFETIME_BOUND_CONTRADICTED` guards it and every answer it reaches is an upper bound only.

**2. `instancesBeginWithSummon: true` on imps, given casts with no earlier summon.** Every subject has imp casts in the first 9 s with no retained summon before them (`.probe/onbx4/wire2.cjs`). I read those as imps summoned before the pull, whose summon is outside the pull-window capture, not as instances that never had one. The shared `PRE_PULL_INSTANCE_POSSIBLE` refuses absence and ceilings for the first 40 s, so nothing reads them as absent. No such cast appears later in any fight.

**3. Is reading the pets only at an established anchor right?** `observed-analysis.ts`: an established anchor gets a reading at `anchor.reportTimeMs`; an UNKNOWN anchor reads nothing, and `pets` is `null`. A test pins that an imp summoned during a hard cast is not counted.

**4. The stack count on `knownBuffStacks`.** `buff.wild_imps.stack` is a shared built-in, so a spec atom may not shadow it. `pet-profile.ts` takes the `NumericBinding` from the shared `petCountAtom` and passes it as a stack binding (M11-B9 widened that seam to a `NumericBinding`). Is that the right seam, given its doc comment describes exact proofs first? `BOUNDED_NUMBER` with no ceiling reaches `worldValueOf` as unknown, and a test pins that it stays UNRESOLVED and never reads as zero.

**5. The wire contradicts the data on Call Dreadstalkers.** `_cast_time` 2000, with only Demonic Calling's -50% matching, so about a second. Of 89 retained presses, 75 log a begin within 1 ms of the completion, and gtKb actor 10's 14 log no begin at all. I added the rule `WIRE_CONTRADICTS_POSITIVE_BASE`, which claims no cast time, rather than `HARD_CAST`, which would make every press a shared-timeline conflict, or `INSTANT`, which the data does not say. No source read explains it, and it is on the follow-ups list.

**6. SUMMONS on the offensive capability.** Declared so a request deriving its ingestion cannot under-fetch it. It reaches `evidenceCategories` only. Is anything else needed for a retrieval to supply it? `SUMMONS` is `observableFromCapture(PULL_WINDOW)`.

**7. One boundary-guard exemption.** `m5-boundary-and-vocabulary` bans the text `presenceAt` outside declared aura-reading modules. `pet-profile.ts` calls the shared pet state's method of that name and reads no aura, so I declared it, with a comment saying so, rather than rename or alias the call to get past the guard. The check on the other modules is unchanged. Is that the right way to resolve the name clash?

## The evidence

Seven subjects, all Diabolist, replayed offline through production ingestion and the facade (`.probe/onbx4/m/`). `b1Pm` is b1PmaKrd6CDfzngc, `gtKb` gtKb2xHn87pNcFfW, `rXAf` rXAfw9t1q8YpmkKD. No retained subject is Soul Harvester.

| Subject | Span | Eligible | Excluded | MATCH | REJECTED | UNKNOWN |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| b1Pm f48 a11 | whole, 345 s | 269 | 10 | 0 | 0 | 269 |
| b1Pm f48 a14 | whole, 345 s | 247 | 28 | 0 | 0 | 247 |
| gtKb f22 a3 | whole, 285 s | 209 | 18 | 0 | 0 | 209 |
| gtKb f22 a7 | whole, 285 s | 200 | 10 | 0 | 0 | 200 |
| gtKb f22 a10 | whole, 285 s | 216 | 19 | 0 | 0 | 216 |
| rXAf f13 a6 | first 165 s | 128 | 9 | 0 | 0 | 128 |
| rXAf f13 a22 | first 165 s | 122 | 5 | 0 | 0 | 122 |
| **Total** | | **1,391** | **99** | **0** | **0** | **1,391** |

- **Anchors:** `BEGINCAST_PAIRING_AMBIGUOUS` 1,178, `BEGINCAST_NOT_OBSERVED` 62, `CAST_TIME_UNKNOWN` 5, `INSTANT_COMPLETION` 114, `OBSERVED_BEGINCAST` 32. So 146 established.
- **Engine:** all 146 refuse at `diabolist[1] hand_of_guldan`, on `buff.dominion_of_argus.up`.
- **Root scan:** `diabolist[4] summon_doomguard` 1,372, on applicability, since Doomguard is a lone node absent from every tree; `default[4] call_action_list` 19, the Grimoire: Imp Lord presses.
- **Pets:** all 146 readings are `demonic_tyrant: UNKNOWN OWNERSHIP_NOT_STATED` and `wild_imps: BOUNDED OWNERSHIP_NOT_STATED`, because each fight's catalog holds actors of the mapped gameIDs with no stated owner (b1Pm 78, 34, 66; gtKb 196, 115, 119; rXAf 270, 184, 187).
- **Mapping:** the wire corroborates the gameIDs and the summon spells: 250289 by 265187; 55659 by 104317; 143622 by 279910. 135002 appears on no retained fight; it is the pinned effect without Antoran Armaments.

## Decisions a reviewer might reject

1. **Cloned from Affliction**, the same class and pattern, with its Drain Soul and Wither guards removed, because neither applies. `shadow_bolt` is applicable on every build: its guard reads `talents.drain_soul`, in no Demonology tree.
2. **No hard-cast narrowing.** Per ONB-D1's correction, an unexcluded -100% row means UNKNOWN, even for rows that belong to another specialization's talents (Infernal Bolt's Chaotic Inferno, Soul Fire and Backlash).
3. **The Tyrant's atom is wired though it never decides today.** `petPresenceAtom` feeds it, so a reviewed bound would flow without a new path, and a test pins both directions of a decided answer. The gate it reads, `default[2]` to `racials`, returns no action in either world.
4. **No shared change for the "same millisecond begin" shape.** Demonbolt and Call Dreadstalkers log that shape, and the shared timeline reads it as ambiguous, which costs about 340 anchors here. It is recorded as a shared ONB-S4 question, not changed.
5. **No retained evidence is committed.** The replay needs whole raw fights, and the archive line has about 5 KB left. The conformance suite proves identity through the committed fight 48 context, actor 11.
6. **`tyrant-setup` stays recorded and unanswered.** `ritual-clipping` stays `UNRESOLVED_DIABOLIST_HERO_TREE`, and both still carry their entries.

## What changed

- Spec tree: `src/specs/warlock/demonology/`, including `pet-profile.ts`.
- Pinned data: `src/simc/data/warlock-demonology.apl.json`, `src/data/game/warlock-demonology-{gcd-semantics,talents,transition-authority,cast-semantics,pet-semantics}.*`, from three new extractor targets at the existing hashes.
- Registration: `src/findings/spec-id.ts`, `src/services/analyzer-registry.ts`.
- Tests: `tests/unit/specs/onb-x4-demonology-warlock.test.ts`, the registration pins, two corpus cases and their executor, regenerated corpus manifest and reports, the gate-search pin.
- Docs: `agent/architecture.md`, `agent/follow-ups.md`, `agent/spec-onboarding-inventory.md`, `agent/m11-spec-coaching-inventory.md`, `agent/testing.md`, `agent/autopilot-queue.md`, `scripts/authority/README.md`, `agent/review-request.md`.

## Validation run

- `npm run typecheck`: clean. `npm run format:check`: clean, after formatting the three extractor scripts it first flagged.
- `npm run test:corpus -- --write-report`: PASSED. `npm run test:evidence -- --write-report`: PASSED. Both ran in sequence, with no suite beside them.
- `scripts/bench/m10d-public-invariance.bench.ts`: passed.
- Full suite, parallel, 60 s timeout: 18,705 tests, 18,701 passed, 4 failed. Two were real and are fixed: `m11a3-coaching-inventory` (a comment in `pet-profile.ts` named the inventory) and `m5-boundary-and-vocabulary` (item 7 above). Two are on the recorded list of parallel failures: `m9b-corpus-harness` SPEC_PROTECTION_PALADIN and `runner-service-queue` W.
- Rerun after those fixes, alone: `m11a3-coaching-inventory`, `m5-boundary-and-vocabulary`, `onb-x4-demonology-warlock` and `m11d2c-pinned-extraction-preflight`, 279 passed; `m9b-corpus-harness`, `m9b-corpus-gate` and `m9b-corpus-manifest`, 81 passed; `runner-service-queue`, 12 passed. The full suite was not rerun after them.
- Real replay rerun on the final code: byte-identical output, 1,391 eligible, 0 MATCH, 0 REJECTED, 1,391 UNKNOWN, 99 excluded.
- Queue compared by script with the supervisor's whole merged list: 63 compared, 1 written (ONB-X3P), 0 missing, and a second run wrote nothing.
- No network to Warcraft Logs.

## What is not here

No promotion, no public change, no new evidence, no shared parser or engine change, no Warcraft Logs request.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
