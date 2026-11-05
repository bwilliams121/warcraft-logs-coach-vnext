# Vengeance Demon Hunter — observed-decision slice (ONB-X3)

**Exposure: `INTERNAL_ONLY`.** The registration (`demonhunter-vengeance-observed-decisions`, `demonhunter/vengeance`) is in the production
catalog for the internal lookup only. The public lookup and the identity table refuse it.

**Not promoted by ONB-X3P.** It cannot pass the rotational gates: no decision resolves and no retained capture holds one of its events, so its gap is on ONB-EV (agent/architecture.md "ONB-X3P").

**Its own representative, a tank, and it resolves nothing today.** No decision of this specialization reaches MATCH or
REJECTED on the shared engine as it stands, and no retained capture holds one of its events. Every decision is observed,
classified and explained, and stays UNKNOWN. That is a measured property of the pinned list and the
missing inputs below, not a claim about any player.

## The authority

`SIMC_APL_DEMONHUNTER_VENGEANCE` (`simc-33622e9d-1`), the `//vengeance_apl_start .. _end` region of `apl_demon_hunter.cpp`, governs
OFFENSIVE_ROTATION only. Resource spending, active mitigation, defensive cooldowns, self healing and interrupts are declared and resolve
`NO_PINNED_AUTHORITY_FOR_DOMAIN`.

## A tank's meaning stays separate from offense

The pinned list asks for Demon Spikes whenever it is down in combat, and for Metamorphosis for simulated damage. It says nothing about what this tank needed in this fight. So:

- a logged Demon Spikes, Metamorphosis, Infernal Strike or Disrupt is excluded as off-GCD by the pinned lane, and never a decision;
- each one's line in the list only ever keeps a scan open, and never selects, because none has a transition contract;
- a Fiery Brand or a Soul Cleave is a rotational press here and nothing more: a comparison of one says nothing about the damage it mitigated or healed;
- a defensive being off cooldown proves nothing, and no cooldown is read at all.

Tank coaching on those domains needs an authority of its own, which does not exist yet.

## The decision population

Every COMPLETE cast by the actor, classified by pinned data:

| Cast | Classification |
| --- | --- |
| Warcraft Logs `melee` flag | excluded `MELEE_SWING` |
| pinned lane NON_GCD | excluded `NON_GCD_ACTION` |
| no pinned lane record (anything the pinned list does not name, a potion, an item) | excluded `EXECUTION_LANE_NOT_ESTABLISHED` |
| `fel_devastation` | excluded `OUTSIDE_FIRST_SLICE`: it is channeled (`sc_demon_hunter.cpp:4165`), no capture shows the moment its logged `cast` reports, and this facade evaluates state at the `cast` |
| every other GCD token | eligible -> first-GCD query -> comparison |

No row of the list has a positive cast time. Reaver's Glaive is `1283344` here (`sc_demon_hunter.cpp:11322`), not Havoc's `442294`.

## What is bound, and from what

| Atom | Source | Rule |
| --- | --- | --- |
| `fury` | the decision cast's own PRE_COST | EXACT on a costed cast; unknown on a free one. Never replayed |
| `hero_tree.aldrachi_reaver`, `hero_tree.annihilator` | entry membership in the observed tree | both or neither |
| `talent.<x>` | the three-way rule; Art of the Glaive and Unhindered Assault are FALSE on an Annihilator tree | absent from the tree is UNKNOWN |
| `buff.*`, `debuff.*`, `cooldown.*`, charges, soul fragments, `gcd.max`, the enemy count, simulation options | none | unbound or UNKNOWN_NUMBER, stated as such |

## Why no decision resolves

Measured on synthetic builds. There is nothing real to replay.

| Stops at | Why |
| --- | --- |
| `default[16] auto_attack`, the query's first refusal on every build | its contract lets the query branch, and its readiness is the unobserved swing, so the engine reports the branch's entry |
| `default[18] disrupt`, `default[19] infernal_strike`, `default[20] demon_spikes` | each is open with no contract: an enemy cast nothing binds, no charge read, and an aura nothing binds |
| `ar[59] call_action_list` (Aldrachi Reaver, root scan) | the list's unconditional fillers, reached with every line above it open |
| `anni_voidfall_spending[11] call_action_list` (Annihilator, root scan) | the unconditional fillers behind the Voidfall gate, which stays open |
| `default[21] run_action_list` (no hero tree in the observed tree) | neither hero list is chosen |

**The in-combat variable programme stays UNKNOWN, and it does not decide this.** Nine value lines of `ar`, `fracs_base`, `fracs1`, `fracs_np`, `sc_prop`, `fracs_p`, `fracs_p2`, `T_avg`, `fracs_f` and `passive_floor`, divide with `%`, which the shared parser refuses, so `time_to_next_glaive` and everything reading it never gets a value (agent/follow-ups.md "After M11-D3-C2"). Its `ceil` lines depend on those. Four `default` lines read `trinket.*` and refuse too. No refusal reads as zero.

**The enemy count alone moves nothing.** `spell_targets.spirit_bomb` has no authority (ONB-S3), and a test giving it the value 1 leaves every first refusal in place.

## The evidence

**None is retained, so it is on ONB-EV.** A census of every retained JSON file over 500 bytes, by combatant-info specID 581, by the ids reports name for eleven signature abilities and by their pinned ids, with Mortal Strike as its positive control, finds no cast and no combatant info. Only the uncommitted M13-A discovery names a Vengeance player: LYwFGPRADV7m6vTZ fights 1, 6, 12, 20 and 24 actor 19, g34mvXTKLMJ2Nfwr fights 1, 6 and 7 actor 13, and zpryqKdtRjWNQXa6 fights 30 to 34 actor 741, with no event retained (agent/architecture.md "ONB-X3"). So the talent id space, the wire's cast shape and Fury observations are all uncorroborated here.

## Not evaluated, deliberately

Auras (no wire identity is corroborated), cooldowns and charges, resources between casts, soul fragments, the enemy count, the target's casts, movement, and all of the tank's own domains. See `agent/follow-ups.md` "After ONB-X3".
