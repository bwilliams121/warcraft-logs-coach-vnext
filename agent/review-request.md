# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-B2: Frost Death Knight and Enhancement Shaman, registered INTERNAL_ONLY. Branch `autopilot/onb-b2`, from main at 26eb557.

- **Warcraft Logs: NONE.** No request or probe. Numbers replay retained pages through production ingestion over a fake transport, offline. Three pinned SimulationCraft files were fetched from
  GitHub at the pinned commit, each matched to its git blob id first.
- **Public contract: NONE.** Nothing under `src/contracts/`, `src/api/` or `src/mcp/` changed. A public request for either is SPEC_NOT_SUPPORTED, as before.
- **Queue bookkeeping:** ONB-B1P is recorded MERGED (PR #60, 26eb5572…), and ONB-B2 is PR_OPEN. Enhancement is appended to ONB-EV's decision text.

## The things to check first

**1. Is the Enhancement list right? It is the one new thing in this tranche.** `sc_shaman.cpp` builds it in a class method, so the extractor gained a third selector and two declared forms:

- **`def->add_action( this, "Wind Shear", "", ... )` emits nothing.** `action_priority_list.cpp` looks the name up with `find_class_spell`, then `find_specialization_spell`, and a spell that is not `ok()` returns nullptr. Neither table has a
  Wind Shear row: the spell is talent-only. So the pinned `default` list is 9 entries, with `bloodlust` at ordinal 4 and no interrupt line. Please try to break this reading.
- **`def->add_action( this, "Bloodlust", "line_cd=600" )` emits `bloodlust,line_cd=600`.** Class table row `{ 7, 0, 2825 }`.
- **The prologue** returns before any list exists for an actor with no main-hand weapon. It is recorded in `provenance.methodPrologue`, and nothing reads a character's main hand.

Each outcome rests on `LINE_EXACTLY_ONCE` and `TOKEN_ABSENT` checks against hash-pinned bytes. A class row appearing for Wind Shear, or disappearing for Bloodlust, refuses the extraction (`onb-b2-class-method-extraction`).

**2. Is registering these without requirement C right, and is it not an owner stop?** The queue asks for real MATCH, discrimination and negative-control evidence. None can exist while the enemy count stands, which is the owner's ONB-S3, the same
reasoning ONB-B1 recorded. Frost's real subjects:

| Subject | Hero tree | Span | Eligible | MATCH | REJECTED | UNKNOWN | Excluded |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| b1Pm fight 48 actor 19 | Deathbringer | whole, 345.2 s | 308 | 0 | 0 | 308 | 703 |
| gtKb fight 22 actor 26 | Deathbringer | whole, 284.8 s | 259 | 0 | 0 | 259 | 281 |

All 567 root scans stop at `cooldowns[4] reapers_mark` on `target_if=first:`. Enhancement has only the filtered M13-A casts of actor 7, with no combatant info, so it refuses and goes on ONB-EV.

**3. `Mind Freeze` is proven background on every build.** `mind_freeze_t` asks `find_class_spell( "Mind Freeze" )`, and the class table has no row (sc_death_knight.cpp:11728-11729; action.cpp:541-549). So its `high_prio_actions[0]` line cannot stop a scan. This is an
applicability claim from pinned source, in Frost's own `action-profile.ts`. It closes a line rather than leaving it open, so it is the one place here that moves a scan forward. Check it.

**4. Bindings that deliberately leave a logged id unbound.**

- Doom Winds binds 384352, not the logged 469270 (`doom_winds_damage`, sc_shaman.cpp:8785, effect row 1183511 of 384352; ten in 151 s cannot be a 90 s press).
- Frostwyrm's Fury binds 279302, not the logged 1265384 (once per 279302 on both subjects). Exterminate (441424, 441426) has no action in the list.
- Bloodlust binds 2825. Heroism (32182) has no action in this module, so a logged Heroism is excluded. Recorded as a coverage gap.
- Flame Shock binds the class row 470411, because `flame_shock_t` is built on 188389, `_gcd` 0, and takes `trigger_gcd` from that row (:8352-8353). No retained capture holds a Flame Shock cast, so which id logs it is unchecked.

Each unbound id has no lane record, so it is excluded as `EXECUTION_LANE_NOT_ESTABLISHED`, never judged.

## Bloodlust's `line_cd`

The queue names this. Enhancement is the first adapter to supply `lineCooldownFor`, from the shared `lineSelectionHistoryFromObservedCasts`, and it forwards `linesStartedThisDecision`. A logged 2825 attributes to the sole in-combat entry, and the readiness stays UNKNOWN by the shared rule:
a cast only bounds a selection from above. The stop reads `LINE_CD:SELECTION_COVERAGE_NOT_PROVEN`. Cast coverage is passed as null, because that rule never reads it. Nothing in the shared rule changed.

## Limits

- **Deathbringer only.** No Rider subject is retained. A synthetic Rider build stops at `cooldowns[5] frostwyrms_fury`. A promotion must measure it or refuse it.
- **Nothing real is committed for Frost.** The archive has 5,212 bytes under its notice line, and nothing here would resolve on real bytes, so no measured proposal is raised. Frost's real numbers are an offline replay. Its identity proof is the committed fight 48 context row.
- **Two tiered talents are not modelled** (`chosen_of_frostbrood`, `storm_unleashed`): UNKNOWN, never false.
- **Cast-time actions** (`lightning_bolt`, `chain_lightning`, `tempest`) are `OUTSIDE_FIRST_SLICE`. Chain Lightning has no real begincast; it is excluded by the same reading, since Maelstrom Weapon shortens it too.
- **Wire measurements** (cooldown gaps, Obliterate's 740 ms gap under the GCD floor) are read once and not pinned. They are in agent/follow-ups.md "After ONB-B2".
- **The real extractor preflight** runs only against a local pinned source root. It passed for both targets; CI exercises synthetic source.

## What changed

- `scripts/authority/`: both targets on the APL, GCD and talent extractors. The APL extractor gains `CLASS_METHOD`, `methodPrologue` and `spellGatedActions`, with `extract-simc-apl.d.mts` to match. No earlier target's output changes.
- `src/simc/authority-artifact.ts`: admits the selector and the two provenance records, and refuses them when malformed or mixed.
- `src/simc/data/`, `src/data/game/`: both pinned lists, GCD, talent and transition data.
- `src/specs/deathknight/frost/`, `src/specs/shaman/enhancement/`: the two trees, each with its own stops in its README.
- `src/findings/spec-id.ts`, `src/services/analyzer-registry.ts`: the two rows.
- `tests/`: the two new test files, the pins for two rows, four corpus cases and regenerated reports. Three pins moved for a reason worth reading: `m11d2c` no longer asserts that no target names Enhancement (this tranche is the audit that entry waited for), `m11c1a` accepts the second selector kind, and `m10a-spec-partition` uses `deathknight/unholy` as its not-a-spec example.
- `tests/support/corpus/executors/spec-brewmaster-monk.ts`: narrows the selector union, with no behaviour change.
- Docs: architecture, follow-ups (including a correction of ONB-B1's reading of Enhancement's dispatch), testing, the authority README and both inventories.

## Validation run

- `npm run typecheck`: clean. `npm run format:check`: clean. `git diff --check`: clean.
- `npm run test:corpus` and `npm run test:evidence`: both gates PASSED (213 cases, 808 assertions; evidence 32 cases, 80 assertions), each matching its committed report.
- Full suite, parallel, 60 s timeout: 14,493 tests, 14,491 passed, 2 failed: `m9b-corpus-harness` (SPEC_PROTECTION_PALADIN, a timeout-shaped error) and `runner-service-queue` W (a leftover job directory). Both passed serially, and both are known to fail under parallel load, as ONB-B1P recorded.
- Real extractor preflight against a local pinned source root: both targets pass, each file matched to its git blob at the pinned commit.
- Offline replay: the Frost table above. No network to Warcraft Logs.

## What is not here

No aura or cooldown binding, no transition contract beyond `auto_attack`, no resolving decision, no public row, no shared engine change, and no new archive evidence.
