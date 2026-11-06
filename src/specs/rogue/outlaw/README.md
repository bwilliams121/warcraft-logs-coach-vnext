# Outlaw Rogue — observed-decision slice (ONB-C2)

**Exposure: `INTERNAL_ONLY`.** The registration (`rogue-outlaw-observed-decisions`, `rogue/outlaw`) is in the production
catalog for the internal lookup only. The public lookup and the identity table refuse it.

**Not promoted by ONB-C2P.** It cannot pass the rotational gates: no decision resolves and no retained capture holds one of its events, so its gap is on ONB-EV (agent/architecture.md "ONB-C2P").

**ONB-S3R (2026-11-06): not replayable. No event of it is retained, so its gap stays on ONB-EV, and its list reads `spell_targets`, which no action registers.** (agent/architecture.md "ONB-S3R").

**A Cohort C follower of Feral's pooling, and it resolves nothing today.** No decision of this
specialization reaches MATCH or REJECTED on the shared engine as it stands. Every decision is observed,
classified and explained, and stays UNKNOWN. That is a measured property of the pinned list and the
missing inputs below, not a claim about any player.

## The authority

`SIMC_APL_ROGUE_OUTLAW` (`simc-33622e9d-1`), the `//outlaw_apl_start .. _end` region of `apl_rogue.cpp`, governs
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
| `energy` | the decision cast's own PRE_COST | EXACT on a costed cast; unknown on a free one. Never replayed |
| `combo_points`, `combo_points.deficit` | the decision cast's own PRE_COST | the same |
| `hero_tree.fatebound` | entry membership in the observed tree | unbound on an unresolved tree |
| `talent.<x>`, `talent.quick_draw.enabled`, `talent.audacity.enabled` | the three-way rule; another hero tree's talents are FALSE on a resolved tree | absent from the tree is UNKNOWN. `talent.fan_the_hammer.rank` stays unbound |
| `buff.*`, `cooldown.*`, `rtb_buffs`, `cp_max_spend`, `energy.regen`, `energy.base_*`, the enemy count, simulation options | none | unbound or UNKNOWN_NUMBER, stated as such |

## Why no decision resolves

| Stops at | Why |
| --- | --- |
| `default[0] stealth`, `default[1] kick` | the first stop of every decision: each is unconditional and off the GCD, its readiness is unknown, and neither has a reviewed transition contract. The query names `default[0]` and stays UNKNOWN. Stealth writes the very state Ambush's readiness reads, so it cannot be contracted away without a Stealth reading |
| `cds[0] adrenaline_rush` (root scan, a tree that does not resolve it) | the action is built on a lone-node talent absent from the tree, which is UNKNOWN, never background |
| `default[7] run_action_list` (root scan, a whole tree) | `variable.finish_condition` reads `cp_max_spend` and two cooldowns, none bound. The `cds` lines above it stay MAY_SELECT, since they read auras, cooldowns, `rtb_buffs`, `raid_event.adds.*`, `fight_remains` and the enemy count |
| `build`, `finish` (no whole-tree scan arrives) | their entries read `buff.*` and `cooldown.*`, and no aura identity is pinned |

ONB-S3 does not settle this list's count: it reads `spell_targets`, and no action registers one, and that would not be enough: Stealth stands before everything.

## Pooling

Two lines pool, `build[6]` for `ambush,if=talent.hidden_opportunity` and `finish[1]` for `killing_spree` (`pooling-model.ts`). Neither condition reads Energy, and no Outlaw line carries `max_energy`, so a press of the guarded action proves it ready now, and the scan answers that without asking the resolver. Only the other side is left:

- **A false condition is not resource limited.** On a build without Hidden Opportunity, the pool neither fires nor stops the scan, so Sinister Strike stays reachable.
- **Anything else is UNKNOWN, never ready.** Whether an unpressed Ambush or Killing Spree would be usable at full Energy needs stealth, Audacity, Blindside, a cooldown and Combo Points, none of them bound. Against a pool the comparison is UNKNOWN either way, so this loses no verdict.
- **A pool is never a verdict.** No line here is a REJECTED or a MATCH by way of a pool (ONB-S5).
- **POOLS is not reachable in this slice.** It is proven only that the engine would stop on one, in the shared tests.

## The evidence

**No real-evidence validation exists.** Every retained JSON file over 500 bytes was censused (5,677 parsed) for casts of Sinister Strike, Pistol Shot, Dispatch, Between the Eyes, Roll the Bones, Blade Flurry, Adrenaline Rush, Blade Rush, Keep It Rolling and Killing Spree, by the pinned ids, with Mortal Strike as its positive control (559 casts): none. The only contexts naming an Outlaw are g34mvXTKLMJ2Nfwr fights 1, 6 and 7, actor 17, in an uncommitted discovery file, with no event retained. The gap is on ONB-EV. Everything here is proven on synthetic fights and on the pinned data.

**The talents' id equivalence is assumed**, as it is for Subtlety, since no retained capture holds a combatantinfo event of this specialization.

**Unmeasured wire hazards**, each a known failure mode from earlier specializations: a logged cast that is not a press, a cast's own aura effect placed before the cast, a pinned cooldown the wire contradicts. Killing Spree is channeled (`channeled = tick_zero = true`, sc_rogue.cpp:4676) with children 57841 and 57842, Blade Rush's strike is its child 271881, and Pistol Shot's Fan the Hammer and Sinister Strike's extra attack (197834) are the same shape. Whether any logs under a token's own id, and whether Killing Spree logs a begincast, is unmeasured. Measure these before binding anything that could resolve a decision.

## Not evaluated, deliberately

Auras (no wire identity is corroborated), cooldowns (no pin is checked against real gaps), Roll the Bones' stage, resources between casts, the enemy count, the target's health and casts, movement. See `agent/follow-ups.md` "After ONB-C2".
