# Windwalker Monk — observed-decision slice (ONB-T1)

**Exposure: `INTERNAL_ONLY`.** The registration (`monk-windwalker-observed-decisions`, `monk/windwalker`) is in the production
catalog for the internal lookup only. The public lookup and the identity table refuse it.

**The Cohort T representative. It resolves nothing today.** All 239 eligible decisions of its one retained subject stay UNKNOWN. That is a property of the pinned list and the missing inputs, and neither is a fault in this slice or in the player.

**Not promoted by ONB-T1P.** It cannot pass the rotational gates: all 239 decisions stay UNKNOWN. It waits on positive readiness for the swing at `default[0]` and for Touch of Karma, the fight clock for `opener`, a contract for Zenith, and a chosen enemy at `zenith[3]` (agent/architecture.md "ONB-T1P").

## The authority

`SIMC_APL_MONK_WINDWALKER` (`simc-33622e9d-1`), the `live_apl` function of `namespace windwalker` in `apl_monk.cpp`, governs
OFFENSIVE_ROTATION only. The module dispatches to `windwalker::default_apl`, whose two branches both reach `live_apl`: directly on a live build, and through a `ptr_apl` whose whole body is the same call. The extractor checks that shape line by line (`PTR_DELEGATES_TO_LIVE`). Resource spending, defensive cooldowns and interrupts are declared and resolve
`NO_PINNED_AUTHORITY_FOR_DOMAIN`. Active mitigation and self healing are not declared.

## The decision population

Every COMPLETE cast by the actor, classified by pinned data:

| Cast | Classification |
| --- | --- |
| Warcraft Logs `melee` flag | excluded `MELEE_SWING` |
| pinned lane NON_GCD (Zenith, Touch of Karma) | excluded `NON_GCD_ACTION` |
| no pinned lane record (anything the pinned list does not name) | excluded `EXECUTION_LANE_NOT_ESTABLISHED` |
| every other GCD token | eligible -> first-GCD query -> comparison |

**A decision's instant is its cast.** Every press the list names has a pinned `_cast_time` of zero, and the retained subject logs no begin of any spell, Fists of Fury and Spinning Crane Kick included: they are channels the wire reports at their start. So the shared cast anchor (ONB-S4) has nothing to do here.

**The GCD records are the data's.** The module lowers monk GCDs by 500 ms through a spec aura at `init_finished`, so a 1500 ms record runs at 1000 ms, and Slicing Winds' constructor sets 1400 ms over its record's 1000. A lane needs only zero or not zero, and none of them crosses it. The wire agrees: the shortest gap between two GCD presses on the retained subject is 800 ms, and a Zenith or a Touch of Karma is followed by one as soon as 225 ms later.

## What is bound, and from what

| Atom | Source | Rule |
| --- | --- | --- |
| `energy` | the decision cast's own PRE_COST | EXACT on a cast that reports it; unknown on any other. Never replayed |
| `talent.<x>` | the three-way rule, then the resolved hero tree | absent from the tree is UNKNOWN |

Everything else is declared so it parses, and is never given a value (`vocabulary.ts`). Three of those a reader might expect bound:

- **`chi` and `chi.max`.** No wire contract says what `classResources` type 12 is (`src/data/wcl-wire/resource-types.ts`), so no Chi is read, even on a cast carrying it. On the retained fight type 12 occurs on this actor alone, 102 times, with a stable maximum of 6, but that corroboration is uncommitted (agent/follow-ups.md "After ONB-T1").
- **`combo_strike`.** Self-addressing: whether this entry would repeat the last Combo Strikes action. No such history is reconstructed, and it is enumerated, never false.
- **`active_enemies`.** The shared enemy-set bound (ONB-S3). A lower bound only, and the dispatch on it is behind the stops below.

`trinket.*` is undeclared on purpose: no gear is read, so the ten class lines that read one refuse at that fragment.

## One hero tree, and what it proves

The list reads no `hero_tree.*`, but it reads hero talents. A resolved tree proves the other tree's talents not taken (`resolver.ts`), which skips `big_coc` under Shado-Pan and eliminates `zenith[2]`, whichever enemy is chosen. An unresolved or contradictory tree proves nothing. The pinned table holds a placeholder row in Conduit of the Celestials, entry 125051, named `0` with spell 0. The extractor drops that declared row and refuses any undeclared one, so an observed id of it proves no tree.

## Target selection

Under the ONB-S3 decision the list's `target_if=max:target.time_to_die` lines read one of three ways, and no target domain is supplied:

| Line | Reading |
| --- | --- |
| no `if=`, or one reading player state (`default[1]`, `zenith[0]`, `zenith[1]`) | `TARGET_SELECTION_IGNORABLE`: an ordinary line |
| a player conjunct proven false (`zenith[2]` under Shado-Pan) | eliminated for every target |
| an `if=` reading the chosen enemy (`zenith[3]`) | `REFUSED`, `CONDITION_TARGET_DEPENDENT`: the scan stops |

A stray comma in `big_coc[5]` (`tiger_palm,,target_if=`) changes nothing: the action, its option and its condition read as written.

## Where every decision stops

On the one retained subject, b1Pm fight 48 actor 13, a whole fight on Shado-Pan (`.probe/onbt1/m/`, offline):

- 239 eligible, 0 MATCH, 0 REJECTED, 239 UNKNOWN. 216 excluded: 160 swings, 10 off the GCD, 46 off the list.
- **The engine refuses at `default[0] auto_attack`**, whose readiness is unobserved: `ONE_SCAN_BLOCKED/NO_DEFINITE_WINNER`, classified `OBSERVED_STATE_MISSING`.
- Open behind it: `default[1] touch_of_karma`, `opener[0] tiger_palm` (Chi and `combo_strike`, under a `time<2` gate nothing answers), `zenith[0]` and `zenith[1]`.
- **The root scan stops at `zenith[3]`.** No dispatch on `active_enemies` is reached, so ONB-S3 moves nothing here.

Reaching a decision would take positive readiness for the swing and Touch of Karma, a contract for Zenith's own writes, the fight clock, Chi, Combo Strikes, every aura and cooldown these lines read, and a chosen enemy.

## What is not here

- Touch of Karma's and Zenith's transitions. Both are off the GCD and write what later lines read, so they have no contract, and asking for either fails closed.
- The racials. `arcane_pulse`, `haymaker` and `rocket_barrage` are `racial_spell_t`s the shared table omits, so `domain-boundary.ts` classifies them. No racial can preempt a class action.
- No score, no severity, no coaching prose.
