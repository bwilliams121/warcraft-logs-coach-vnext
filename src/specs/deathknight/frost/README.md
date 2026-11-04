# Frost Death Knight — observed-decision slice (ONB-B2)

**Exposure: `INTERNAL_ONLY`.** The registration (`deathknight-frost-observed-decisions`, `deathknight/frost`) is in the production
catalog for the internal lookup only. The public lookup and the identity table refuse it.

**Not promoted by ONB-B2P.** It cannot pass the rotational gates, and it waits on ONB-S3 rather than on evidence (agent/architecture.md "ONB-B2P").

**A Cohort B follower of Arms' pattern, and it resolves nothing today.** No decision of this
specialization reaches MATCH or REJECTED on the shared engine as it stands. Every decision is observed,
classified and explained, and stays UNKNOWN. That is a measured property of the pinned list and the
missing inputs below, not a claim about any player.

## The authority

`SIMC_APL_DEATHKNIGHT_FROST` (`simc-33622e9d-1`), the `//frost_apl_start .. _end` region of `apl_death_knight.cpp`, governs
OFFENSIVE_ROTATION only. Resource spending, defensive cooldowns and interrupts are declared and resolve
`NO_PINNED_AUTHORITY_FOR_DOMAIN`. Active mitigation and self healing are not declared.

## The decision population

Every COMPLETE cast by the actor, classified by pinned data:

| Cast | Classification |
| --- | --- |
| Warcraft Logs `melee` flag | excluded `MELEE_SWING` |
| pinned lane NON_GCD | excluded `NON_GCD_ACTION` |
| no pinned lane record (anything the pinned list does not name, a potion, an item) | excluded `EXECUTION_LANE_NOT_ESTABLISHED` |
| every other GCD token | eligible -> first-GCD query -> comparison |

## What is bound, and from what

| Atom | Source | Rule |
| --- | --- | --- |
| `rune` | the decision cast's own PRE_COST | EXACT on a costed cast; unknown on a free one. Never replayed |
| `runic_power` | the decision cast's own PRE_COST | EXACT on a costed cast; unknown on a free one. Never replayed |
| `runic_power.deficit` | the decision cast's own PRE_COST | EXACT on a costed cast; unknown on a free one. Never replayed |
| `hero_tree.deathbringer`, `hero_tree.rider_of_the_apocalypse` | entry membership in the observed tree | both or neither |
| `talent.<x>` | the three-way rule; another hero tree's talents are FALSE on a resolved tree | absent from the tree is UNKNOWN |
| `buff.*`, `debuff.*`, `cooldown.*`, the enemy count, simulation options | none | unbound or UNKNOWN_NUMBER, stated as such |

## Why no decision resolves

| Stops at | Why |
| --- | --- |
| `cooldowns[4] reapers_mark` (Deathbringer: both real subjects, 567 decisions) | `target_if=first:` needs the enemy set (ONB-S3). Before it, `antimagic_shell`, `pillar_of_frost` and `breath_of_sindragosa` are off-GCD with no reviewed contract, and `remorseless_winter` is undecided |
| `cooldowns[5] frostwyrms_fury` (Rider: synthetic only) | its condition has too many unresolved atoms to enumerate |
| `default[6] run_action_list` | the enemy count (ONB-S3), behind all of the above: no build reaches it today |

Lifting the enemy count needs ONB-S3, which is an owner decision, and it would not be enough: every GCD action of `single_target` and `aoe` sits behind that dispatch, and everything in `cooldowns` is read before it.

## The evidence

**Two real subjects are retained, and neither resolves a decision.** A census of retained pages by signature ability, with Mortal Strike as its positive control, finds b1PmaKrd6CDfzngc fight 48 actor 19 and gtKb2xHn87pNcFfW fight 22 actor 26, both whole fights and both Deathbringer. Replayed offline through production ingestion, they give 308 and 259 eligible decisions, all UNKNOWN (agent/architecture.md "ONB-B2"). Nothing here is committed: the archive's notice line has 5,212 bytes left and these decisions would pin nothing new.

**What the wire says.** Every id this data binds was logged, except Remorseless Winter and Mind Freeze on both subjects, and Frostscythe and Glacial Advance on the second. Every entry of both combatant infos names a pinned trait row (77 of 77).

- **A logged cast is not always a press.** Exterminate (441424, 441426) and a second Frostwyrm's Fury (1265384, once per 279302) are logged on both subjects, have no action in the pinned list, and are excluded by their missing lane records.
- **Most pinned cooldowns hold, and two do not.** Pillar of Frost, Reaper's Mark, Breath of Sindragosa and Frostwyrm's Fury gaps sit at or above the pin. Raise Dead reaches 90.3 s against 120 s and Anti-Magic Shell 51.0 s against 60 s, so a floor from the pin would be false.
- **Runes appear only on a rune-costed cast.** `rune` is known at 116 of 308 and 101 of 259 decisions, and `runic_power` at 89 and 76. An absent value is unknown, never zero.

## Not evaluated, deliberately

Auras (no wire identity is corroborated), cooldowns (no pin is checked against real gaps), resources between
casts, the enemy count, the target's health and casts, movement. See `agent/follow-ups.md` "After ONB-B2".
