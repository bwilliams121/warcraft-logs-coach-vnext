# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-D2: Elemental Shaman, Balance Druid and Shadow Priest (internal, Cohort D). Branch `autopilot/onb-d2`, from main at 5502bca. **All three are registered INTERNAL_ONLY, and no decision of any of them resolves.**

- **Warcraft Logs: NONE.** No request or probe. The census and replay read retained files offline, the replay through a fake transport.
- **Public contract: NONE.** Nothing under `src/contracts/`, `src/api/` or `src/mcp/` changed. A public request for any of the three is SPEC_NOT_SUPPORTED, as before.
- **Queue bookkeeping:** ONB-D1P is recorded MERGED (PR #70, 5502bcad…), and ONB-D2 is set to PR_OPEN. The supervisor's whole merged list was applied by script: 52 compared, and only ONB-D1P needed writing.

## The thing to check first: the rule ONB-D1 said would move

`agent/follow-ups.md` "After ONB-D1" said that if a Cohort D follower needed Destruction's refusal, it belonged in ONB-S4's shared rule, with its pinned measurements re-taken. All three of these need it. So:

**In `buildCastTimeline`: a completion whose `castTimeAt` is UNKNOWN is never anchored at an earlier begin.** The begin may be an abandoned attempt and the decision the completion's. It gets `BEGINCAST_PAIRING_AMBIGUOUS` with `[begin, completion]` as candidates, the begin is not consumed, and no CASTING span is recorded. The multi-placement branch also adds the completion to the candidates for an UNKNOWN fact. **Corrected in review:** the first version released the begin only on the single-placement path, so a back-to-back begin stayed consumed and `occupancyAt` after the last completion read NOT_CASTING. Now a completion with an UNKNOWN fact releases every begin any of its placements names, and a test pins that in both same-millisecond orders.

- `destructionDecisionAnchor` is deleted. It was a post-hoc filter on the timeline's answer.
- A POSITIVE or INSTANT fact takes exactly the path it took. A control test pins the same shape with a POSITIVE fact still pairing, CASTING, and consuming the begin.
- **Re-taken measurements** in `onb-s4-cast-decision-anchor`, with test profiles: Mage 121 all ten hard casts ambiguous (two were); Restoration Shaman 122 Chain Heal 0 and 85 (was 36 and 49), Healing Wave 0 and 32 (was 16 and 16), `PAIRING_NOT_PROVEN` 117, every paired begin (was 50). Interrupted begins and the absence of conflicts are unchanged. The "proven cast in progress" assertion now uses a POSITIVE profile, and the UNKNOWN profile is asserted UNKNOWN at the same instant.
- **Destruction by replay:** 220 decisions, its stops and its per-token anchors are identical. Only `unpairedBegins` moves, 26 to 117 `PAIRING_NOT_PROVEN` (11 stay `INTERRUPTED`).
- **Nothing reads occupancy yet**, and Destruction was the timeline's only reader. So no verdict changes.

Three test assertions were edited to the new behaviour rather than weakened, each is listed in the diff: one candidate list gained the completion, one occupancy reason became `UNPAIRED_BEGIN_END_UNKNOWN` (the first begin is no longer consumed, so its possible span comes first), and one test narrowed its UNKNOWN profile to the cast under test so the following BLAST stays a proven cast.

## The evidence

**Replay** (`.probe/onbd2/m/`), through production ingestion and each facade. Every subject ANALYZED, 0 MATCH, 0 REJECTED:

| Subject | Spec, hero tree | Span | Eligible = UNKNOWN | Excluded |
| --- | --- | --- | ---: | ---: |
| b1Pm f48 actor 8 | Elemental, Farseer | whole, 345.2 s | 225 | 55 |
| b1Pm f48 actor 17 | Elemental, Farseer | whole | 236 | 26 |
| gtKb f22 actor 9 | Elemental, Farseer | whole, 284.8 s | 212 | 35 |
| gtKb f22 actor 19 | Elemental, Farseer | whole | 213 | 32 |
| A7R6 f7 actor 8 | Elemental, Farseer | first 165 s | 115 | 23 |
| A7R6 f7 actor 16 | Elemental, Farseer | first 165 s | 93 | 30 |
| rXAf f13 actor 12 | Elemental, Farseer | first 165 s | 116 | 27 |
| rXAf f13 actor 9 | Balance, Elune's Chosen | first 165 s | 143 | 8 |
| rXAf f13 actor 13 | Balance, Elune's Chosen | first 165 s | 132 | 14 |
| gtKb f22 actor 27 | Balance, Elune's Chosen | 16 casts over 56 s | 12 | 4 |
| gtKb f22 actor 29 | Shadow, Archon | whole | 213 | 236 |
| rXAf f13 actor 40 | Shadow, Archon | first 165 s | 143 | 140 |

**Where each root scan stops:** Elemental at `default[0] spiritwalkers_grace` on the option `moving=1` (all 1,210). Balance at `default[13] run_action_list,name=opener` on `variable.opener` (all 287). Shadow at `main[3] shadow_word_madness` on `target_if` (348) or `main[1]` on its gate (8), and the engine's own refusal on the 300 anchored decisions is `cds[7] power_infusion`, off the GCD with no contract. So **ONB-S3 alone moves none of them**, unlike Destruction.

**Anchors** (agent/architecture.md "ONB-D2"): 984 Elemental, 108 Balance and 54 Shadow decisions ambiguous; 65 Elemental with complete coverage and no begin, which are real instants and stay UNKNOWN; 30, 0 and 13 observed begins; 109 Shadow channel starts.

**Census** (`.probe/onbd2/census.cjs`): 5,687 JSON files over 500 bytes under `.probe/` and `tests/`, skipping tool output and worktree copies; 5,686 parsed. Mortal Strike as positive control: 559 casts. Limits: it does not read files of 500 bytes or less, and it matches named ability ids. The filtered M13-A capture's Balance and Shadow casts have no combatant info, so they would refuse.

## Decisions a reviewer might reject

1. **Not on ONB-EV.** Evidence is not their gap: real subjects exist and each stops on a question evidence cannot answer. Stormbringer, Keeper of the Grove and Voidweaver have no subject, recorded as what a promotion must measure or refuse.
2. **Requirement C is not met, and this is not an owner stop.** As for Arms and Destruction. The queue asks for an internal registration, and the fail-closed result is correct.
3. **`PTR_BODY_DIFFERS`, a new extractor and artifact policy.** Shadow's PTR region differs by one item line. A live build takes the live branch through a literal `if ( is_ptr() )`. The policy refuses identical bodies. Admitted in `AUTHORITY_LIVE_PTR_POLICIES`, so the artifact loads. Elemental's dispatch is one ternary, which the preflight's call regex now admits as an optional prefix. Both are class-neutral, and no earlier target's output changes.
4. **The option `moving` stays refused and unmodelled.** CLAUDE.md "Movement Claims". It classifies `TARGETING_NOT_MODELLED`, the shared class of every unrecognised option, which is coarse; recorded, not changed.
5. **Ascendance binds two rows.** The constructor reads 1219480 for Elemental, every subject logs 114050, both are `_gcd` 1500, and neither is called wrong. Flame Shock binds 470411 only, and the 188389 logged with it is excluded.
6. **A cast-time reading scoped to subtypes 107 and 108, plus a check of druid 275.** The druid family holds -100% effects on 275 (Predatory Swiftness, Nature's Swiftness); those masks match neither Wrath, Starfire nor the moons. Priest and druid 77 rows have value 0. As in ONB-D1, a row not named in the module or talents is not excluded, so every matching spell stays UNKNOWN on every build.
7. **`ready()` is usability, not applicability.** Stormkeeper, Ascendance, Elemental Blast and Ancestral Swiftness refuse in `ready()` without their talent and stay applicable here. Earthquake's talent is two rows on one choice node, so UNKNOWN. Celestial Alignment is either of two talents, background only when both are proven absent.
8. **Shared helpers moved verbatim.** `decisionAnchorStateAt`, `castAnchorKey`, `unpairedBeginKey` in the anchor module and `decisionAnchorNotEstablished` in `first-gcd-selection.ts`, because three more specializations would have repeated them. None knows a spell, and the anchor module still imports no specialization.
9. **Three specializations in one tranche, cloned from Destruction's shape.** The gameplay meaning is per spec: its own list, talents, hero proof, applicability, cast rows and limits. The plumbing every specialization module repeats stays repeated, as for every earlier follower.

## What changed

- Shared: `src/engine/game-state/casting/cast-decision-anchor.ts` (the rule, three helpers), `src/simc/first-gcd-selection.ts` (one helper), `src/simc/authority-artifact.ts` (the policy), `src/findings/spec-id.ts`, `src/services/analyzer-registry.ts`.
- Destruction: `cast-anchor-profile.ts` loses its refusal, and `observed-analysis.ts` its copies. Its test drops the helper's test; the behaviour stays pinned through the facade and in ONB-S4's file.
- New: `src/specs/shaman/elemental/`, `src/specs/druid/balance/`, `src/specs/priest/shadow/`, each with a README; data and cast semantics under `src/data/game/`; three APL artifacts under `src/simc/data/`; `tests/unit/specs/onb-d2-*.test.ts`; three corpus executors.
- Extractors: three targets each on APL, GCD and talents; `PTR_BODY_DIFFERS`; the ternary admission. Pinned source hashes match the M11-A3 audit.
- Pins: the mechanical per-row lists, the corpus manifest and reports (227 cases).
- Docs: `agent/architecture.md` "ONB-D2" and the ONB-S4 measurements, `agent/follow-ups.md` "After ONB-D2" and the two resolved ONB-D1 items, `agent/testing.md`, `agent/spec-onboarding-inventory.md`, `agent/m11-spec-coaching-inventory.md`, `scripts/authority/README.md`, the queue.

## Validation run

Final run, on this tree but for this section:

- `npm run typecheck`: clean. `npm run format:check`: clean. `git diff --check`: clean.
- `npm run test:corpus`: PASSED. `npm run test:evidence`: PASSED. Both ran in sequence, with no suite beside them.
- Full suite, parallel, 60 s timeout: 16,388 tests, 16,386 passed, 2 failed. This change touches neither's code.
  - `m9b-corpus-harness` SPEC_PROTECTION_PALADIN, on the recorded list of parallel-load failures.
  - `simulation/runner-service-queue` W, which lists the shared OS temp directory for any new `wlc-simc-*` name, recorded at ONB-D1P.
  - Both pass rerun without the full suite beside them (59 of 59), so I infer load. The whole suite has not run clean in one pass.
- An earlier full run's other failures were this tranche's own pins (row order and count, identity evidence), since fixed.
- Destruction's replay against ONB-D1P's: decisions, stops and per-token anchors identical; only `unpairedBegins` moves.
- No network to Warcraft Logs.

## What is not here

No promotion, no gate change, no public change, no new evidence and no Warcraft Logs request. ONB-S3 stays the owner's.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
