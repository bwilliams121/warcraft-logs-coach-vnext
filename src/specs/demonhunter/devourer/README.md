# Devourer Demon Hunter — observed-decision slice (ONB-B3)

**Exposure: `INTERNAL_ONLY`.** The registration (`demonhunter-devourer-observed-decisions`, `demonhunter/devourer`) is in the production
catalog for the internal lookup only. The public lookup and the identity table refuse it.

**Its own representative, on the observed-decision pattern, and it resolves nothing today.** No decision of this
specialization reaches MATCH or REJECTED on the shared engine as it stands. Every decision is observed,
classified and explained, and stays UNKNOWN. That is a measured property of the pinned list and the
missing inputs below, not a claim about any player.

## The authority

`SIMC_APL_DEMONHUNTER_DEVOURER` (`simc-33622e9d-1`), the `//devourer_apl_start .. _end` region of `apl_demon_hunter.cpp`, governs
OFFENSIVE_ROTATION only. Resource spending, defensive cooldowns and interrupts are declared and resolve
`NO_PINNED_AUTHORITY_FOR_DOMAIN`. Active mitigation and self healing are not declared.

## The decision population

Every COMPLETE cast by the actor, classified by pinned data:

| Cast | Classification |
| --- | --- |
| Warcraft Logs `melee` flag | excluded `MELEE_SWING` |
| pinned lane NON_GCD | excluded `NON_GCD_ACTION` |
| no pinned lane record (anything the pinned list does not name, a potion, an item) | excluded `EXECUTION_LANE_NOT_ESTABLISHED` |
| `consume`, `devour`, `the_hunt`, `predators_wake` | excluded `OUTSIDE_FIRST_SLICE`: each has a cast time, so it is decided at its `begincast`, and this facade evaluates state at the `cast` |
| every other GCD token | eligible -> first-GCD query -> comparison |

## What is bound, and from what

| Atom | Source | Rule |
| --- | --- | --- |
| `fury` | the decision cast's own PRE_COST | EXACT on a costed cast; unknown on a free one. Never replayed |
| `hero_tree.annihilator`, `hero_tree.voidscarred` | entry membership in the observed tree | both or neither |
| `talent.<x>` | the three-way rule; another hero tree's talents are FALSE on a resolved tree | absent from the tree is UNKNOWN |
| `buff.*`, `debuff.*`, `cooldown.*`, the enemy count, simulation options | none | unbound or UNKNOWN_NUMBER, stated as such |
| `line_cd=` on `pick_up_fragment` | the shared cast attribution | never observed, so nothing attributes, and each of the four timers is UNKNOWN |

## Why no decision resolves

| Stops at | Why |
| --- | --- |
| `voidscarred_melee[0] run_action_list` (Void-Scarred with The Hunt: all three real subjects, 251 decisions) | `active_enemies=1` (ONB-S3). Before it, `variables` and `cooldowns` return no action, and the tree and the talent close `default[2..4]` |
| `annihilator_melee[0] metamorphosis` (Annihilator with The Hunt: synthetic only) | the first refusal: its condition reads the enemy count and auras nothing binds. The root scan runs on to `[4] collapsing_star` with no Collapsing Star in the observed tree, or to `[13] call_action_list` on the count with it |
| `default[4] run_action_list` (The Hunt absent from the observed tree: synthetic only) | `talent.the_hunt` on a lone node is UNKNOWN, never false, so neither Void-Scarred list is chosen |
| `vsm_st[0]`, `vsm_meta[1]`, `vsm_out[0]`, `annihilator_ranged[0]` `pick_up_fragment` (behind the count) | each `line_cd` is `LINE_CD:SELECTION_COVERAGE_NOT_PROVEN`: nothing in a log attributes a selection, and no contract exists |

Lifting the enemy count needs ONB-S3, which is an owner decision, and it would not be enough. Behind it, `vsm_st[0]`, `vsm_meta[1]` and `vsm_out[0]` are pick-up lines whose timers no log can read and whose executions consume a soul and may grant Fury, and `vsm_meta` and `vsm_out` also read `void_ray_count`, an `op=add` over a value only the simulation holds.

## The evidence

**Three real subjects are retained, and none resolves a decision.** A census of every retained JSON file over 500 bytes, by signature ability, with Mortal Strike as its positive control, finds gtKb2xHn87pNcFfW fight 22 actor 32 (whole fight, 284.8 s) and rXAfw9t1q8YpmkKD fight 13 actors 20 and 79 (the first 165.0 s of 271.8 s). All are Void-Scarred with The Hunt. Replayed offline through production ingestion, they give 98, 81 and 72 eligible decisions, all UNKNOWN (agent/architecture.md "ONB-B3"). Nothing here is committed: the archive's notice line has 5,212 bytes left and these decisions would pin nothing new.

**What the wire says.** All 229 combatant-info entries are pinned rows of class 12. A Void Ray `cast` has no begincast, and on the whole-fight subject every tick of its 26 casts follows it. The Consume, Devour, The Hunt and Predator's Wake casts all have a begincast.

- **A logged cast is not always a press.** Soul Fragment 1223412 is logged 243 to 385 times a fight at `_gcd` 0, and no action of the pinned module names it. Voidblade's 1245414 follows every Voidblade and Pierce the Veil, and The Hunt's 1246169 every The Hunt and Predator's Wake. Each has a lane record and no token, so each is excluded as `NON_GCD_ACTION`.
- **Void Metamorphosis is never logged as a cast.** The wire holds the aura 1217607. The action binds 1217605 from the class row, so nothing could judge a press of it.
- **A pinned cooldown or charge is not a floor.** Smallest gaps across the three: Cull 730 ms against an 8 s charge, Reap 1,692 ms against the same, Soul Immolation 1,643 ms against 60 s, Predator's Wake 41.1 s against 90 s and Vengeful Retreat 10.7 s against 25 s. So a floor from the pin would be false.
- **Devour's smallest gap is 716 ms and Consume's 1,124 ms**, on a 1,500 ms record. They are excluded here, and a promotion would have to explain them.
- **Fury appears only on a costed cast.** `fury` is known at 19 of 98, 11 of 81 and 11 of 72 decisions. An absent value is unknown, never zero.

## Not evaluated, deliberately

Auras (no wire identity is corroborated), cooldowns (no pin is checked against real gaps), resources between
casts, the enemy count, the target's health and casts, movement. See `agent/follow-ups.md` "After ONB-B3".
