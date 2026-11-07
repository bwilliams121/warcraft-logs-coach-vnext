# Fire Mage — observed-decision slice (ONB-X1)

**Exposure: `INTERNAL_ONLY`.** The registration (`mage-fire-observed-decisions`, `mage/fire`) is in the production
catalog for the internal lookup only. The public lookup and the identity table refuse it.

**Its own representative on the shared cast anchor (ONB-S4). It resolves nothing today.** No decision of this
specialization reaches MATCH or REJECTED on the shared engine as it stands. Every decision is observed, anchored where the evidence allows,
classified and explained, and stays UNKNOWN. That is a measured property of the pinned list and the missing inputs below, not a claim about any player.

## The authority

`SIMC_APL_MAGE_FIRE` (`simc-33622e9d-1`), the `//fire_apl_start .. _end` region of `apl/mage.cpp`, with no PTR region, governs
OFFENSIVE_ROTATION only. Resource spending, defensive cooldowns and interrupts are declared and resolve
`NO_PINNED_AUTHORITY_FOR_DOMAIN`. Active mitigation and self healing are not declared.

## The decision population

Every COMPLETE cast by the actor, classified by pinned data:

| Cast | Classification |
| --- | --- |
| Warcraft Logs `melee` flag | excluded `MELEE_SWING` |
| pinned lane NON_GCD: Fire Blast 108853, Combustion | excluded `NON_GCD_ACTION` |
| no pinned lane record (anything the pinned list does not name, and the class Fire Blast 319836) | excluded `EXECUTION_LANE_NOT_ESTABLISHED` |
| every other GCD token | eligible -> anchor -> first-GCD query -> comparison |

A begin that never completes is not a decision, and neither is any instant with no cast. Nothing builds a missed-action opportunity, in or out of a cast. Unpaired begins are counted in the coverage (`unpairedBegins`) and never judged.

## The anchor (ONB-S4)

A cast-time action is decided when it begins. `cast-anchor-profile.ts` supplies the shared timeline with what this specialization can prove:

| Ability | Execution | What a completion proves |
| --- | --- | --- |
| Meteor, and the off-GCD Fire Blast and Combustion | INSTANT | decided when it lands |
| Fireball 133 | CAST_TIME | a cast time above zero: no -100% cast-time row of the family matches it |
| Pyroblast, Flamestrike | CAST_TIME | nothing: Hot Streak, Firestorm and Hyperthermia are -100% rows matching them, and this slice narrows none |
| Scorch | CAST_TIME | nothing: Heat Shimmer is a -100% row matching it |
| Frostfire Bolt 431044 | CAST_TIME | nothing: Frostfire Empowerment is a -100% row matching it |
| everything else | not reviewed | `EXECUTION_NOT_REVIEWED`, and occupancy around it stays UNKNOWN |

The rows are hand-reviewed readings of the pinned `_cast_time` and of every cast-time effect of the family matching each spell (`mage-fire-cast-semantics.ts`). No haste is established, so `exactMs` is always null and no anchor is ever derived from a completion. The pinned list presses no channel, so none is reviewed.

**A begin does not prove the moment of a cast that may have been instant.** That is the shared timeline's own rule: both instants stay candidates, and the anchor is UNKNOWN. Fire shows why. Every retained Pyroblast has a begin, and 62 of 76 are under 100 ms before the completion.

**What it changes:**

- **The decision's times are the anchor's.** Its `position` and `locator` stay the completion's, because the completion is the observation that names the action.
- **No anchor, no verdict.** An UNKNOWN anchor makes the comparison UNKNOWN (`DECISION_ANCHOR_NOT_ESTABLISHED`, class `OBSERVED_STATE_MISSING`) whatever the scan says. The scan still runs, and its diagnostics stay attached.
- **Nothing read at a completion is called the decision's state.** Every binding is fixed for the fight. The list reads no Mana.

## What is bound, and from what

| Atom | Source | Rule |
| --- | --- | --- |
| `talent.<x>` | the three-way rule; another hero tree's talents are FALSE on a resolved tree | absent from the tree is UNKNOWN |
| `active_enemies` | the shared enemy set at the decision, then the pinned SimC profile (`withEncounterStateAt`, SIMC-FB-R) | a proven lower bound. Where nothing contradicts it on a proven build, the profile's 1, disclosed as SimC-profile-relative. Otherwise UNKNOWN, and no position means no reading |
| `buff.*`, `cooldown.*`, `action.*`, `hot_streak_spells_in_flight`, `scorch_execute.active`, `firestarter.active`, `prev_gcd.*`, `set_bonus.*`, `gcd.*`, `time`, `cast_time`, `fight_remains` | none | unbound or UNKNOWN_NUMBER, stated as such |

## Applicability

`combustion`, `meteor`, `pyroblast` and `scorch` are built on their talents, so each is background with its talent proven absent. `fireball` has no guard: with Frostfire Bolt taken, its token builds that spell, on the same lane. `fire_blast` is applicable only with its talent taken, and UNKNOWN otherwise, because without it the action is the class spell on the GCD. `flamestrike` is always UNKNOWN, on a choice of two rows.

## Why no decision resolves

| Stops at | Why |
| --- | --- |
| `default[7] run_action_list`, Sunfury | where every root scan stops. `sf_combustion`'s gate reads `time`, `variable.combustion_delay`, the Combustion and Meteor cooldowns, `gcd.max` and `buff.combustion.up` |
| `default[6] run_action_list`, Frostfire or no hero entry | the same inputs, one line earlier. Synthetic |
| `variable.combustion_delay` | assigned in precombat from `expected_combat_length`, a simulation's planned fight length, so it stays UNKNOWN, and stating the clock does not close the gate |

The engine and the root scan agree on 28 decisions; the other 85 have no anchor, so the scan's answer is not read either.

## The proc chain

The queue names Combustion windows and the Heating Up and Hot Streak chain as this specialization's own problem, and it is. It is not reached yet: no scan gets past the dispatch above to a line that reads them, so binding them would change no decision. They stay unbound built-ins, each evaluating UNRESOLVED, and an unread proc never makes a press wrong. What they need is in `agent/follow-ups.md` "After ONB-X1".

**Not promoted by ONB-X1P.** It cannot pass the rotational gates: all 113 decisions stay UNKNOWN. It waits on an authority for `variable.combustion_delay` and the rest of the Combustion dispatch's inputs (agent/architecture.md "ONB-X1P").

## The evidence

One retained subject, replayed offline through production ingestion: A7R6kxPJ1hC8YQ4w fight 7 actor 17, Sunfury, first 165 s of 424.5 s. 113 decisions, all UNKNOWN, none committed (agent/architecture.md "ONB-X1").

## Not evaluated, deliberately

No Frostfire subject is retained, and none casts Flamestrike, so those lines are unmeasured. Off-GCD Fire Blast and Combustion decisions, Mana, auras, cooldowns, charges, in-flight spells, target health, the enemy count and haste are not modelled. See `agent/follow-ups.md` "After ONB-X1".

## The pinned SimC profile (SIMC-FB-R)

Every decision reads encounter state through `withEncounterStateAt`: real evidence first, then the pinned profile's environment, on a build the deploy calendar proves. The result says what the priority would select under the profile, never what the real encounter held. Each decision's `profileFacts` go into the view as `simcProfileFacts`, so it is disclosed. It makes nothing actionable. The measured results are in `agent/architecture.md` "SIMC-FB-R".

`target_if`: this list has no `target_if` line.
