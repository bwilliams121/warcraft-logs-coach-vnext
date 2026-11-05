# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-D3: Arcane Mage and Frost Mage (internal, Cohort D). Branch `autopilot/onb-d3`, from main at 9cb1d82. **Outcome: both registered INTERNAL_ONLY, no decision resolves, and Frost Mage has no real subject, so it goes on ONB-EV.**

- **Warcraft Logs: NONE.** No request or probe. The census and replay read retained files offline, the replay through a fake transport.
- **Public contract: NONE.** Nothing under `src/contracts/`, `src/api/` or `src/mcp/` changed. A public Mage/Arcane or Mage/Frost request is SPEC_NOT_SUPPORTED, as before, with preparation still run and partial coverage disclosed.
- **Shared code: NONE changed in behaviour.** `src/findings/spec-id.ts` and `src/services/analyzer-registry.ts` gain the two rows. The anchor, selection and evaluator are untouched.
- **Queue bookkeeping:** ONB-D2P is recorded MERGED (PR #72, 9cb1d828…), ONB-D3 is set to PR_OPEN, and Frost Mage is appended to ONB-EV's owner decision text. The supervisor's whole merged list was compared by script: 54 compared, 1 written, 0 missing.

## The things to check first

1. **Is INTERNAL_ONLY with no resolved decision the right result, rather than an owner stop?** The queue asks for an internal registration of each, and says a Frost Mage with no evidence is recorded for ONB-EV. ONB-D1 and ONB-D2 decided the same shape.
2. **Is it right to register Frost on the pinned list alone?** ONB-A2 and ONB-C2 did so for specs with no event retained. Every Frost stop below is synthetic, and the docs and tests say so.
3. **The cast review for the two spells with a -100% row and the two rows of Frostbolt** (`src/data/game/mage-*-cast-semantics.ts`). See "Cast review".

## The evidence

**Replay** (`.probe/onbd3/m/`), through production ingestion and the facade. Every Arcane subject ANALYZED, with 0 MATCH and 0 REJECTED:

| Subject | Hero tree | Span | Eligible | UNKNOWN | Excluded |
| --- | --- | --- | ---: | ---: | ---: |
| b1Pm fight 48 actor 121 | Sunfury | whole fight | 246 | 246 | 26 |
| b1Pm fight 48 actor 7 | Sunfury | whole fight | 238 | 238 | 33 |
| gtKb fight 22 actor 1 | Sunfury | whole fight | 204 | 204 | 21 |
| A7R6 fight 7 actor 3 | Sunfury | first 165 s | 116 | 116 | 13 |
| rXAf fight 13 actor 3 | Sunfury | first 165 s | 117 | 117 | 13 |
| rXAf fight 13 actor 4 | Sunfury | first 165 s | 118 | 118 | 11 |

1,039 decisions. Engine refusal `default[0] counterspell` on the 875 with an established anchor; the other 164 are `DECISION_ANCHOR_NOT_ESTABLISHED`. Root scan stops at `cooldowns[4] evocation` on `APPLICABILITY:evocation` on all 1,039, with `default[0]`, `default[12]`, `cooldowns[1]`, `[2]` and `[3]` listed as undecided candidates.

Anchors: `INSTANT_COMPLETION` 382, `CHANNEL_START` 364 (Arcane Missiles), `BEGINCAST_PAIRING_AMBIGUOUS` 160 (every Arcane Blast), `OBSERVED_BEGINCAST` 129 (Prismatic Bolt, Arcane Surge), `CAST_TIME_UNKNOWN` 4 (the opening Arcane Surge with a `cast` at 0.6 to 1.2 s and no begin in the fight). No conflict, and no hard cast without a begin past those.

**Census** (`.probe/onbd3/census.cjs`, `census-read.cjs`, `actors.cjs`): 5,695 JSON files over 500 bytes under `.probe/` and `tests/`, skipping tool output and worktree copies; 5,694 parsed. Events of any type and any source, for the ids the contexts' master data gives the signature names. Positive control, Mortal Strike: 559 casts. Limits: it does not read JSON of 500 bytes or less, or logs, and it matches named ability ids.

Sources resolved against each report's actors. The "Frost" hits at A7R6 42, gtKb 41, rXAf 130 and b1Pm 49 are `Pet:Mirror Image`, every one Frostbolt 59638, 126 casts. So Frost Mage's only real casts are M13-A actor 6 (103 of its own spells, no combatant info) and one cast of gBMC fight 33 actor 142 in `.probe/m11g2/diagnose.json`. Contexts 2xpt fight 17 actor 44 and yzH9 fight 32 actor 118 hold no event. M13-A actor 11 is an Arcane Mage with no combatant info too.

**Frost, synthetic only:** Frostfire build, root scan and engine both at `cds[17] ray_of_frost`, on `interrupt_if,interrupt_global,interrupt_immediate`. Spellslinger build, root scan `cds[23] ray_of_frost` on the same options, engine at `cds[20] flurry`, with `cds[20]` to `[22]` open behind `line_cd=9999`. An unresolved tree stops at `cds[17]` on applicability.

## Cast review

From every mage-family effect with `_misc_value` 10 (`.probe/onbd3/masks.cjs`, 19 rows on subtypes 4, 108, 218). Only subtype 108 rows carry a mask here. Those reaching -100% and matching a row: Presence of Mind 205025 (Arcane Blast), Freezing Rain 270232 (both Blizzard rows), Frostfire Empowerment 431177 (Frostfire Bolt). Those not reaching it: Arcane Charge -8% a stack, Slick Ice -2%, Flame Accelerant -40%, Thermal Conditioning -10%. Hot Streak, Firestorm, Hyperthermia and Heat Shimmer match none of these spells.

So `INSTANT_ROW_NOT_EXCLUDED`: Arcane Blast, Blizzard (two rows), Frostfire Bolt. `HARD_CAST`: Arcane Pulse 1241462, Arcane Surge 365350, Prismatic Bolt 1295924, Frostbolt 116, Glacial Spike 199786. Channels: Arcane Missiles, Evocation, Ray of Frost. The rest are `_cast_time` 0.

## Decisions a reviewer might reject

1. **Arcane Blast is not narrowed**, though Presence of Mind is proven not taken on all six subjects and is its only -100% row. A talent reading could narrow it, but it moves no decision past the same stops, so this slice keeps the same refusal as every follower and a test pins it. Recorded as the cheapest anchor gain.
2. **`any_blink` and `cancel_action` have no binding.** `any_blink` is Shimmer (`_gcd` 0) or Blink (`_gcd` 1500) by talent, so no lane holds. Each is `UNKNOWN_LANE`, which keeps the scan open: `cooldowns[3] cancel_action` is a listed candidate above.
3. **Blizzard's applicability is UNKNOWN**, a choice of two rows, as Earthquake. Its talents are not in the dataset.
4. **`talent.hand_of_frost_4` is unmodelled.** The pinned module has `hand_of_frost_1` to `_3`, and the trait data three tiered rows on node 110422. A test shows `!talent.hand_of_frost_4` stays UNRESOLVED.
5. **Vocabulary.** `debuff.freezing.react` and `debuff.freezing.stack` are declared magnitudes, since only `buff.*.react` is built in. `cooldown_react` is a truth atom, and so are `prev_gcd.*`, `set_bonus.*`, `cooldown.*.ready`, `*.down` and `action.evocation.channeling`. None is bound. Both lists parse whole.
6. **Hero tree proof.** A resolved Frost Spellslinger tree proves only `frostfire_bolt` absent. A resolved Frostfire tree proves nothing absent, because the list reads no Spellslinger talent.

## What changed

- Spec trees: `src/specs/mage/arcane/`, `src/specs/mage/frost/`, on Shadow's finished shape, each with a README.
- Data: `src/simc/data/mage-{arcane,frost}.apl.json`, `src/data/game/mage-{arcane,frost}-{gcd-semantics,talents}.{json,ts}`, `-cast-semantics.ts`, `-transition-authority.ts`.
- Extractors: three targets each, no other change (`scripts/authority/`).
- Registry: `src/findings/spec-id.ts`, `src/services/analyzer-registry.ts`.
- Corpus: `scripts/corpus/build-manifest.mjs`, `tests/corpus/manifest.json`, the reports, and `tests/support/corpus/` (four cases).
- Tests: `tests/unit/specs/onb-d3-{arcane,frost}-mage.test.ts`, plus the roster, registry and gate pins.
- Docs: `agent/architecture.md` "ONB-D3", `agent/follow-ups.md` "After ONB-D3", `agent/testing.md`, `agent/spec-onboarding-inventory.md`, `agent/m11-spec-coaching-inventory.md`, `agent/autopilot-queue.md`, `scripts/authority/README.md`.

## Validation run

- `npm run typecheck`: clean. `npm run format:check`: clean. `git diff --check`: clean.
- Corpus and evidence gates (`scripts/corpus/gate.mjs --write-report`, both roots): PASSED, in sequence, with no suite beside them.
- Full suite, parallel, 60 s timeout: 16,943 tests, 16,942 passed, 1 failed: `m9b-corpus-harness` SPEC_PROTECTION_PALADIN, on the recorded list of parallel-load failures. It passes rerun without the full suite beside it, so I infer load. The whole suite has not run clean in one pass.
- `m9b-corpus-harness`, both `onb-d3-*` suites, `m11-promotion-evidence-gate`, `m10a-spec-partition` and `m10d-public-registration` rerun together: all passed.
- The replay rerun at the final tree: 1,039 eligible, 1,039 UNKNOWN, 0 MATCH, 0 REJECTED, 117 excluded.
- The real extractors ran against the local hash-pinned source root; required facts verified for both targets. Offline.
- No network to Warcraft Logs.

## What is not here

No promotion, no gate change, no public change, no new evidence, no shared behaviour change, no Warcraft Logs request.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
