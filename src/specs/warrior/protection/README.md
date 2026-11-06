# Protection Warrior — observed-decision slice (ONB-A2)

**Exposure: `INTERNAL_ONLY`.** The registration (`warrior-protection-observed-decisions`, `warrior/protection`) is in the production
catalog for the internal lookup only. The public lookup and the identity table refuse it.

**ONB-S3R (2026-11-06): not replayable. No event of it is retained, so its gap stays on ONB-EV, and its list reads `spell_targets`, which no action registers.** (agent/architecture.md "ONB-S3R").

**A Cohort A follower of Havoc's pattern, and it resolves nothing today.** No decision of this
specialization reaches MATCH or REJECTED on the shared engine as it stands. Every decision is observed,
classified and explained, and stays UNKNOWN. That is a measured property of the pinned list and the
missing inputs below, not a claim about any player.

## The authority

`SIMC_APL_WARRIOR_PROTECTION` (`simc-33622e9d-1`), the `//protection_apl_start .. _end` region of `apl_warrior.cpp`, governs
OFFENSIVE_ROTATION only. Resource spending, active mitigation, defensive cooldowns, self healing and interrupts are declared and resolve
`NO_PINNED_AUTHORITY_FOR_DOMAIN`.

**The tank's meaning stays its own.** The pinned list orders Ignore Pain, Shield Block and Shield Wall for
simulated damage and rage. It says nothing about what this tank needed in this fight, and
`defensiveAvailable != defensiveRequired`. A logged Ignore Pain, Shield Block or Shield Wall has a NON_GCD
lane and is excluded, never judged. Its line in the list can only stop a scan.

## The decision population

Every COMPLETE cast by the actor, classified by pinned data:

| Cast | Classification |
| --- | --- |
| Warcraft Logs `melee` flag | excluded `MELEE_SWING` |
| pinned lane NON_GCD | excluded `NON_GCD_ACTION` |
| no pinned lane record (anything the pinned list does not name, a potion, an item) | excluded `EXECUTION_LANE_NOT_ESTABLISHED` |
| `demolish` | excluded `OUTSIDE_FIRST_SLICE`: channelled, so decided at its start, and this facade evaluates state at the `cast` |
| every other GCD token | eligible -> first-GCD query -> comparison |

## What is bound, and from what

| Atom | Source | Rule |
| --- | --- | --- |
| `rage` | the decision cast's own PRE_COST | EXACT on a costed cast; unknown on a free one. Never replayed |
| `rage.deficit` | the decision cast's own PRE_COST | EXACT on a costed cast; unknown on a free one. Never replayed |
| `hero_tree.colossus`, `hero_tree.mountain_thane` | entry membership in the observed tree | both or neither |
| `talent.<x>`, `talent.<x>.enabled` | the three-way rule; another hero tree's talents are FALSE on a resolved tree | absent from the tree is UNKNOWN |
| `buff.*`, `debuff.*`, `cooldown.*`, the enemy count, simulation options | none | unbound or UNKNOWN_NUMBER, stated as such |

## Why no decision resolves

| Stops at | Why |
| --- | --- |
| `default[2] charge` | the query's first refusal: `time` is not modelled, and Charge is off the GCD with no reviewed transition contract |
| `default[5] avatar`, `default[6] shield_wall` | off the GCD with no reviewed transition contract, so a branch through them refuses. They are never judged |
| `default[15] ignore_pain` | where the root scan stops: its condition has more unresolved atoms than the evaluator enumerates, so it refuses as an unsupported expression, and it is never judged |
| `default[16] ravager`, `default[20] champions_spear` | unconditional GCD actions whose cooldowns are not derived |
| `default[25..26] run_action_list` | the AoE lists are gated on `spell_targets.thunder_clap`, so they are possible at every decision (ONB-S3) |

ONB-S3 does not settle this list's count: it reads `spell_targets`, and no action registers one. Every single-target GCD action sits behind the AoE dispatches that read it. The GCD lines above those dispatches (`ravager`, `champions_spear`, `shield_charge`) would need cooldowns instead.

## The evidence

**No real-evidence validation exists.** The retained captures were censused (`friendlySpecs` aligned to
`friendlyPlayers`, then events by actor):

- m11c4f context-1 `2xptYq89Tb631Hmg` fight 17, actor 5: context only, and not committed. No retained page holds one of its events.

The gap is on ONB-EV. Everything here is proven on synthetic fights and on the pinned data.

**Unmeasured wire hazards**, each a known failure mode from Havoc: a logged cast that is not a press, a cast's
own aura effect placed before the cast, a pinned cooldown the wire contradicts. Thunder Clap and Revenge can be free or procced, Thunder Blast replaces Thunder Clap, and Demolish is channelled. Which of these the log reports as a `cast`, and when, is unmeasured. Measure these
before binding anything that could resolve a decision.

## Not evaluated, deliberately

Auras (no wire identity is corroborated), cooldowns (no pin is checked against real gaps), resources between
casts, the enemy count, the target's health and casts, movement. See `agent/follow-ups.md` "After ONB-A2".
