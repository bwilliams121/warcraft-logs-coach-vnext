# Feral Druid — observed-decision slice (ONB-C1)

**Exposure: `INTERNAL_ONLY`.** The registration (`druid-feral-observed-decisions`, `druid/feral`) is in the production
catalog for the internal lookup only. The public lookup and the identity table refuse it.

**Not promoted by ONB-C1P.** It cannot pass the rotational gates, and it waits on the inputs before the enemy count and on ONB-S3, rather than on evidence (agent/architecture.md "ONB-C1P").

**Cohort C's representative, on the observed-decision pattern, and it resolves nothing today.** No decision of this
specialization reaches MATCH or REJECTED on the shared engine as it stands. Every decision is observed,
classified and explained, and stays UNKNOWN. That is a measured property of the pinned list and the
missing inputs below, not a claim about any player.

## The authority

`SIMC_APL_DRUID_FERAL` (`simc-33622e9d-1`), the whole file, the sole body of `apl_feral`, region of `feral_apl.inc`, governs
OFFENSIVE_ROTATION only. Resource spending, defensive cooldowns and interrupts are declared and resolve
`NO_PINNED_AUTHORITY_FOR_DOMAIN`. Active mitigation and self healing are not declared.

## The decision population

Every COMPLETE cast by the actor, classified by pinned data:

| Cast | Classification |
| --- | --- |
| Warcraft Logs `melee` flag | excluded `MELEE_SWING` |
| pinned lane NON_GCD | excluded `NON_GCD_ACTION` |
| no pinned lane record (anything the pinned list does not name, a potion, an item) | excluded `EXECUTION_LANE_NOT_ESTABLISHED` |
| `regrowth` | excluded `OUTSIDE_FIRST_SLICE`: every hardcast logs a begincast, so it is decided at its start, and this facade evaluates state at the `cast` |
| every other GCD token | eligible -> first-GCD query -> comparison |

## What is bound, and from what

| Atom | Source | Rule |
| --- | --- | --- |
| `energy` | the decision cast's own PRE_COST | EXACT on a costed cast; unknown on a free one. Never replayed |
| `combo_points`, `combo_points.deficit` | the decision cast's own PRE_COST | the same |
| `hero_tree.druid_of_the_claw`, `hero_tree.wildstalker` | entry membership in the observed tree | both or neither |
| `talent.<x>` | the three-way rule; another hero tree's talents are FALSE on a resolved tree | absent from the tree is UNKNOWN |
| `combo_points` | the decision cast's own PRE_COST | EXACT on a finisher; unknown on a builder, which reports none. Never replayed |
| `buff.cat_form.up` | M4, then the decision's own cat ability | an observed removal is never overridden. See "Form state" |
| `buff.prowl.up`, `buff.shadowmeld.up` | M4, then an earlier harmful cast | unbound before the first harmful cast. See "Form state" |
| `buff.bs_inc.up`, `buff.bs_inc.down` | M4, on the build's alias | Incarnation's buff when taken, Berserk's when proven not, unbound otherwise |
| `buff.apex_predators_craving.up` | M4, or the talent proven absent | read by `maximum_energy()` and `default[8]` |
| other `buff.*`, `debuff.*`, `cooldown.*`, the enemy count, simulation options | none | unbound or UNKNOWN_NUMBER, stated as such |

## Why no decision resolves

| Stops at | Why |
| --- | --- |
| `default[0] prowl` (the pull's first decision on every build; on an Incarnation build, wherever its buff is down, until a Prowl spends the free one) | the guard needs an earlier harmful cast, and Incarnation's free Prowl has no duration and is never logged, and a press before the pull leaves no event. 164 decisions, 163 of them actor 170's, which casts no Prowl in the fight |
| `default[1] cat_form` (out of Cat Form, or a Cat Form press with no earlier transition) | `talent.fluid_form` on a lone node absent from the tree is UNKNOWN, never false, so the line stays open. 5 decisions |
| `default[3] auto_attack` (where the two lines above are closed) | its condition is true and its usability unknown, so the engine branches on it. 199 decisions. Past it the root scans stop at the rows below |
| `default[4] tigers_fury` (a stealth buff is up, so `auto_attack` is closed) | its condition reads cooldowns and the simulation's fight style, nothing binds them, and no contract exists. 4 decisions |
| `default[6] chomp` (actor 170's root scans: 256) | neither entry of its choice node is in the tree, so the node does not resolve and the applicability is UNKNOWN |
| `cooldown[13] convoke_the_spirits` (actor 1's root scans: 112) | `TOO_MANY_UNRESOLVED_ATOMS` on a condition that also reads `fight_remains` |
| `default[9..12]` (no real scan arrives) | `spell_targets` (ONB-S3), read by all four finisher and builder dispatches |

Lifting the enemy count needs ONB-S3, which is an owner decision, and it would not be enough. The lines above it need Prowl's Incarnation state, Tiger's Fury's cooldown and contract (the wire's smallest gaps, 30,008 and 30,578 ms, do respect the 30 s pin), a read of the fight style, and Berserk's, Incarnation's and Feral Frenzy's cooldowns, which do not respect their pins (121.7 s and 90.3 s against 180 s, 30.5 s against 45 s). Below it, `rake` and `moonfire_cat` read `persistent_multiplier` and `pmultiplier`, which stay unbindable by design, and `rip` and `shred` need their DoT state.

## Form state

Feral plays in Cat Form from before the pull, so the log holds no transition until the first shift, and the combatant snapshot this project normalizes carries no auras. Four proofs bind the form and stealth atoms (`aura-bindings.ts`):

- **`OBSERVED`:** M4 answers EXACT at the decision.
- **`TALENT_NOT_SELECTED`:** the talent producing the buff is proven not taken.
- **`OWN_CAT_FORM_CAST`:** every cat ability has `_stance_mask` 0x1, so a cast of one proves Cat Form was up, or that Fluid Form is taken and it autoshifted. Either way the one line reading the atom is FALSE. It is used only where M4 has no answer.
- **`BROKEN_BY_OWN_ACTION`:** every harmful token clears `SX_NO_STEALTH_BREAK`, so an earlier cast proves Prowl and Shadowmeld down, unless M4 shows them applied since.

## Pooling

`finisher[1] pool_resource,for_next=1` guards `finisher[2] ferocious_bite,max_energy=1,if=combo_points>=5` (`pooling-model.ts`).

- **`max_energy=1` is read, on that line only.** It adds `Energy >= maximum_energy()` to the action's readiness, read as bounds: 50, or 37.5 under Incarnation, or 0 under Apex Predator's Craving.
- **It comes before the observed cast.** A Bite pressed below the line proves the spell castable, not the line ready.
- **The at-maximum answer.** A false condition is not resource limited. A true one is ready at the maximum only if the Bite itself was observed. Anything else is UNKNOWN, and against a pool the comparison is UNKNOWN either way.
- **A pool is never a verdict.** An observed cast against a pool is UNKNOWN, never MATCH or REJECTED (ONB-S5).

## The evidence

**Two real subjects are retained, and neither resolves a decision.** A census of every retained JSON file over 500 bytes, by signature ability, with Mortal Strike as its positive control, finds b1PmaKrd6CDfzngc fight 48 actor 170 (whole fight, 345.2 s) and A7R6kxPJ1hC8YQ4w fight 7 actor 1 (the first 165.0 s of 424.5 s). Both are Wildstalker. Replayed offline through production ingestion, they give 258 and 114 eligible decisions, all UNKNOWN (agent/architecture.md "ONB-C1"). Nothing here is committed: the archive's notice line has 5,212 bytes left and these decisions would pin nothing new.

**What the wire says.** All 159 combatant-info entries are pinned rows of class 11.

- **A cat ability never lands out of Cat Form.** Across all 372 decisions, no cat ability is cast where M4 proves Cat Form down, which is what the own-cast proof rests on. Actor 170's first Cat Form transition is at 23.6 s and actor 1's at 114.7 s, so before them this proof is all there is.
- **Every Ferocious Bite observed clears `max_energy`.** The lowest Energy on a costed Bite is 60 on one subject and 64 on the other. 4 of actor 1's 32 Bites report no Energy cost, and those stay unknown, never zero. So no real decision exercises the pool: the model is proven on synthetic decisions only.
- **Combo Points appear only on a finisher.** A builder's cast reports no Combo Point value, so `combo_points` is unknown there.
- **Stealth has almost no events.** Actor 1 holds no Prowl event at all, and actor 170 one removal at its opening Rake.
- **The Incarnation Prowl buff (102547) is never logged**, on 4 Incarnation casts.

## Not evaluated, deliberately

Auras (no wire identity is corroborated), cooldowns (no pin is checked against real gaps), resources between
casts, the enemy count, the target's health and casts, movement. See `agent/follow-ups.md` "After ONB-C1".
