# Unholy Death Knight — observed-decision slice (ONB-X5)

**Exposure: `INTERNAL_ONLY`.** The registration (`deathknight-unholy-observed-decisions`, `deathknight/unholy`) is in the production
catalog for the internal lookup only. The public lookup and the identity table refuse it.

**Its own representative, reading the shared pet mapping (ONB-S6). It resolves nothing today.** All 147 eligible decisions of its one retained subject stay UNKNOWN. That is a property of the pinned list and the missing inputs below, not a claim about any player.

## The authority

`SIMC_APL_DEATHKNIGHT_UNHOLY` (`simc-33622e9d-1`), the `//unholy_apl_start .. _end` region of `apl_death_knight.cpp`, with no PTR region, governs
OFFENSIVE_ROTATION only. Resource spending, defensive cooldowns and interrupts are declared and resolve
`NO_PINNED_AUTHORITY_FOR_DOMAIN`. Active mitigation and self healing are not declared.

## The decision population

Every COMPLETE cast by the actor, classified by pinned data:

| Cast | Classification |
| --- | --- |
| Warcraft Logs `melee` flag | excluded `MELEE_SWING` |
| pinned lane NON_GCD | excluded `NON_GCD_ACTION` |
| no pinned lane record (anything the pinned list does not name) | excluded `EXECUTION_LANE_NOT_ESTABLISHED` |
| every other GCD token | eligible -> first-GCD query -> comparison |

**A decision's instant is its cast.** Every press the list names has a pinned `_cast_time` of zero, and the retained subject logs no begin of any spell, so the shared cast anchor (ONB-S4) has nothing to do here.

**Five tokens each run a second spell.** Each constructor holds a replacement that runs while a buff is up, so the wire's id is that token executing:

| Token | Its own row | Under | Replacement |
| --- | --- | --- | --- |
| `dark_transformation` | Dark Transformation 1233448 | Blightfall | Blightfall 1271967 |
| `death_coil` | Death Coil 47541 | Forbidden Knowledge | Necrotic Coil 1242174 |
| `epidemic` | Epidemic 207317 | Forbidden Knowledge | Graveyard 383269 |
| `festering_strike` | Festering Strike 85948 | Festering Scythe | Festering Scythe 458128 |
| `scourge_strike` | Scourge Strike 55090 | Vampiric Strike | Vampiric Strike 433895 |

The list names none of the replacements, so an unbound one would be excluded as off the list. The wire agrees with the pinned module: on the retained subject all 21 Necrotic Coils fall inside a logged Forbidden Knowledge window and none of the 32 Death Coils does, and all 9 Festering Scythes fall inside a logged 1241077 window. Blightfall, Graveyard and Vampiric Strike have no retained press, so they rest on the pinned module alone.

**Dark Transformation is off the GCD, and its token has no proven lane.** Its record says 1500 ms, and its constructor sets `trigger_gcd = 0_ms` (`sc_death_knight.cpp:8724`). `deathknight-unholy-gcd-semantics.ts` keeps the extracted number and states the reviewed lane, and the wire agrees: all four retained presses land 3 to 482 ms after the press before them. So a press of it is excluded `NON_GCD_ACTION`, never a decision. Blightfall takes the data's 1500 ms, so the token's two records disagree, and its lane is `UNKNOWN_LANE`, which the shared engine refuses rather than guesses.

## What is bound, and from what

| Atom | Source | Rule |
| --- | --- | --- |
| `rune` | the decision cast's own PRE_COST | EXACT on a costed cast; unknown on a free one. Never replayed |
| `runic_power`, `runic_power.deficit` | the decision cast's own PRE_COST | EXACT on a costed cast; unknown on a free one. Never replayed |
| `talent.<x>` | the three-way rule | absent from the tree is UNKNOWN |
| `pet.army_ghoul.active`, `pet.gargoyle.active`, `pet.lord_of_the_dead.active` | shared pet presence, at the decision's cast | an undecided presence binds nothing, so the truth is enumerated |
| `pet.lord_of_the_dead.remains`, `buff.*`, `debuff.*`, `dot.*`, `cooldown.*`, `active_enemies`, `raid_event.*`, `time`, `gcd`, `fight_remains`, the target's health | none | unbound or UNKNOWN_NUMBER, stated as such |

**No hero tree is read.** The list reads no `hero_tree.*` and no hero talent, and no action of it is built on one. The facade reports the tree from entry membership and nothing decides on it.

## The pets (ONB-S6)

`deathknight-unholy-pet-semantics.ts` holds the rows, and `pet-profile.ts` says which atom each answer feeds. **No row proves a floor or a ceiling, so no answer is PRESENT or NOT_PRESENT.**

| Entity | gameID | Floor | Ceiling | Why |
| --- | --- | --- | --- | --- |
| `lord_of_the_dead` | 264321 | none | none | the spawner's 15,000 ms is contradicted: retained completed casts run to 15,349 ms and begins to 15,494 ms, and delayed damage means its last event bounds nothing |
| `army_ghoul`, `lesser_ghoul` | 237409 for both | none | none | Army of the Dead and the ordinary summon make the same actor, so the shared state reports both `AMBIGUOUS`. `lesser_ghoul` is declared only for that |
| `gargoyle` | 27829 | none | none | from the pinned summon effect alone: no retained catalog holds the actor |

On the retained fight the Lord of the Dead's answers are `OWNERSHIP_NOT_STATED` too, because its catalog holds actor 273 of that gameID with no stated owner.

## Why no decision resolves

| Stops at | Why |
| --- | --- |
| `default[0] auto_attack` | where the engine refuses on all 147: its readiness is unobserved, and an earlier entry that might fire blocks everything behind it |
| `cooldowns[2] outbreak`, `[3] army_of_the_dead`, `[4] dark_transformation` | lines the root scan leaves open behind it, the last with no proven lane: plagues, the enemy count, simulated raid events, auras and the Army's cooldown, none bound |
| `default[6] call_action_list` | the enemy count (ONB-S3), and no authority exists for it |
| `aoe[0] death_and_decay` | where the root scan stops on all 147: `duration%2` does not parse |
| `default[7]`, `single_target` | behind all of the above: no build reaches them today |

ONB-S3 alone moves nothing: the swing's entry and the three cooldown lines come first.

**One racial is classified here.** `racials[1] arcane_pulse` is a racial the shared table does not list, and it sits ahead of every class action. `domain-boundary.ts` classifies it, as Outlaw and Feral do Shadowmeld, so a racial never decides or blocks.

## The evidence

**One real subject, and it resolves no decision.** rXAfw9t1q8YpmkKD fight 13 actor 18, first 165 s, Rider of the Apocalypse, replayed offline through production ingestion: 147 eligible, 85 excluded, 0 MATCH, 0 REJECTED. Every one of its 77 talent entries names a pinned trait row. Its events are uncommitted (agent/architecture.md "ONB-X5").

- **Runes and Runic Power appear only on a cast that costs them.** `rune` is known at 85 of 147 decisions and `runic_power` at 53. An absent value is unknown, never zero. Festering Scythe is free on the wire.
- **The log reports ids the list does not name.** Death Charge, Lichborne, Anti-Magic Shell, the trinket and the potion are excluded by their missing lane records.

## Not evaluated, deliberately

Auras, plagues, cooldowns and charges, the enemy count, the target's health, haste, resources between casts, pet presence past what the shared state proves, and movement. See `agent/follow-ups.md` "After ONB-X5".
