# Beast Mastery Hunter — observed-decision slice (ONB-T2)

**Exposure: `INTERNAL_ONLY`.** The registration (`hunter-beast_mastery-observed-decisions`, `hunter/beast_mastery`) is in the production catalog for the internal lookup only. The public lookup and the identity table refuse it. The wire names it `BeastMastery`, which does not lower-case to its roster key.

**A Cohort T follower. It resolves nothing today.** All 707 eligible decisions of its four retained subjects stay UNKNOWN, with 0 MATCH and 0 REJECTED. That is a property of the pinned list and the missing inputs below, not a claim about any player.

**Not promoted by ONB-T2P.** It cannot pass the rotational gates: all 707 decisions stay UNKNOWN. It waits on `default[0] retarget` and the difficulty authority `fight_style` needs, the swing's entry, an upper bound for the dispatches, and `st` (agent/architecture.md "ONB-T2P").

## The authority

`SIMC_APL_HUNTER_BEAST_MASTERY` (`simc-33622e9d-1`), the `//beast_mastery_apl_start .. _end` region of `apl/apl_hunter.cpp`, whose PTR twin is identical, governs OFFENSIVE_ROTATION only. Resource spending, defensive cooldowns and interrupts are declared and resolve `NO_PINNED_AUTHORITY_FOR_DOMAIN`. Active mitigation and self healing are not declared.

## The decision population

Every COMPLETE cast by the actor, classified by pinned data:

| Cast | Classification |
| --- | --- |
| Warcraft Logs `melee` flag | excluded `MELEE_SWING` |
| pinned lane NON_GCD | excluded `NON_GCD_ACTION` |
| no pinned lane record (anything the pinned list does not name) | excluded `EXECUTION_LANE_NOT_ESTABLISHED` |
| every other GCD token | eligible -> anchor -> first-GCD query -> comparison |

A begin that never completes is not a decision, and neither is any instant with no cast. Nothing builds a missed-action opportunity.

## The anchor (ONB-S4)

| Ability | Execution | What a completion proves |
| --- | --- | --- |
| Cobra Shot, Barbed Shot, Kill Command, Bestial Wrath, Wild Thrash, Black Arrow | INSTANT | decided when it lands |
| Wailing Arrow | CAST_TIME | a cast time above zero: no -100% cast-time row of the family matches it. No retained subject presses it |
| everything else | not reviewed | `EXECUTION_NOT_REVIEWED`, and occupancy around it stays UNKNOWN |

No haste is established, so `exactMs` is always null and no anchor is ever derived from a completion. An UNKNOWN anchor makes the comparison UNKNOWN (`DECISION_ANCHOR_NOT_ESTABLISHED`) whatever the scan says.

## What is bound, and from what

| Atom | Source | Rule |
| --- | --- | --- |
| `talent.<x>` | the three-way rule; another hero tree's talents are FALSE on a resolved tree | absent from the tree is UNKNOWN |
| `active_enemies` | the shared enemy set at the decision (`withEnemyCountAt`, ONB-S3) | a proven lower bound, or UNKNOWN. No event proves an upper bound, and no position means no reading |
| `fight_style.dungeonroute`, `focus`, `apex.3`, `howl_summon.ready`, `max_prio_damage`, `buff.*`, `cooldown.*`, `dot.*`, `full_recharge_time`, `execute_time`, `gcd`, `time_to_die.remains`, `fight_remains` | none | unbound or UNKNOWN_NUMBER, stated as such |

**No pet state is built.** The queue expected this slice to consume the shared pet mapping (ONB-S6), and the list gives it nothing to answer: no line reads a `pet.*` atom, and a test pins that. The one pet dependency is `kill_command_t::ready()` asking the main pet's own action. A press proves that, and no unobserved press is ever claimed. A main pet is tamed before the pull, so it has no summon and no pinned gameID, and its presence could only be UNKNOWN.

## The real evidence

Four subjects with combatant info, replayed offline through production ingestion over a fake transport. Nothing of them is committed but their context rows and stray events in other specializations' fixtures.

| Subject | Hero tree | Span | Eligible | MATCH | REJECTED | UNKNOWN | Excluded |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| A7R6kxPJ1hC8YQ4w fight 7 actor 20 | Pack Leader | first 165 s | 119 | 0 | 0 | 119 | 27 |
| gtKb2xHn87pNcFfW fight 22 actor 13 | Pack Leader | whole fight, 285 s | 214 | 0 | 0 | 214 | 45 |
| rXAfw9t1q8YpmkKD fight 13 actor 15 | Pack Leader | first 165 s | 139 | 0 | 0 | 139 | 24 |
| b1PmaKrd6CDfzngc fight 48 actor 164 | Pack Leader | whole fight, 345 s | 235 | 0 | 0 | 235 | 31 |

Every exclusion is `EXECUTION_LANE_NOT_ESTABLISHED`: a spell off the list, Dire Beast 1308188 most of all. Every anchor is `INSTANT_COMPLETION`, and none of the 228 Cobra Shots logs a begin. No Dark Ranger subject is retained, so `drst`, `drcleave`, Black Arrow and Wailing Arrow are read only on synthetic builds.

## Why no decision resolves

| Stops at | Why |
| --- | --- |
| `default[0] retarget` | where all 707 scans stop, on its `target_if`, before any rotation line. Its gate is `fight_style.dungeonroute`, a simulation setting that only the SimC profile fallback may bind (SIMC-FB-A), which this list does not read yet |
| `default[1] auto_shot` | past that, on a fight style only a test can state: off the GCD, with no reviewed contract, so the engine refuses. Synthetic |
| `default[4]` to `default[7]` | the dispatches, gated on the enemy count and on `talent.black_arrow` and `talent.beast_cleave`. Synthetic |
| the rotation lists | `target_if` on Barbed Shot, charges, `full_recharge_time`, `howl_summon.ready`, `apex.3`, Focus |

**`barbed-shot-charge-capping` stays a recorded question.** No charge is derived, so nothing here can say a charge was capped, and the coaching inventory keeps it open.

## Not evaluated, deliberately

Focus, auras, charges, cooldowns, the enemy count and haste are not modelled. See `agent/follow-ups.md` "After ONB-T2".
