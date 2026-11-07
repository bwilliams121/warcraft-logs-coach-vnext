# Survival Hunter — observed-decision slice (ONB-T2)

**Exposure: `INTERNAL_ONLY`.** The registration (`hunter-survival-observed-decisions`, `hunter/survival`) is in the production catalog for the internal lookup only. The public lookup and the identity table refuse it.

**A Cohort T follower with no retained event. It resolves nothing today.** A census of every retained file finds no event on an id of its own (Moonlight Chakram's hits are Marksmanship Hunters), so it is on ONB-EV, and every stop below comes from a synthetic build. That is a property of the evidence and the pinned list, not a claim about any player. The only sign of one is uncommitted: the M13-A discovery names zpryqKdtRjWNQXa6 fights 30 to 34 actor 742.

**Not promoted by ONB-T2P.** It cannot pass the rotational gates: it has no real resolved decision and no retained subject. It waits on a capture, which is ONB-EV's owner decision, and then on the inputs in agent/follow-ups.md "After ONB-T2" (agent/architecture.md "ONB-T2P").

## The authority

`SIMC_APL_HUNTER_SURVIVAL` (`simc-33622e9d-1`), the `//survival_apl_start .. _end` region of `apl/apl_hunter.cpp`, whose PTR twin is identical, governs OFFENSIVE_ROTATION only. Resource spending, defensive cooldowns and interrupts are declared and resolve `NO_PINNED_AUTHORITY_FOR_DOMAIN`. Active mitigation and self healing are not declared.

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
| Raptor Strike, Kill Command, Wildfire Bomb, Takedown, Moonlight Chakram, and the off-GCD Muzzle and Aspect of the Eagle | INSTANT | decided when it lands |
| Boomstick | CHANNEL | decided at its cast; its span is possible, never proven, with no bound claimed |
| everything else | not reviewed | `EXECUTION_NOT_REVIEWED`, and occupancy around it stays UNKNOWN |

No haste is established, so `exactMs` is always null and no anchor is ever derived from a completion. An UNKNOWN anchor makes the comparison UNKNOWN (`DECISION_ANCHOR_NOT_ESTABLISHED`) whatever the scan says.

No press of this list has a positive cast time.

## What is bound, and from what

| Atom | Source | Rule |
| --- | --- | --- |
| `talent.<x>` | the three-way rule; another hero tree's talents are FALSE on a resolved tree | absent from the tree is UNKNOWN |
| `active_enemies` | the shared enemy set at the decision, then the pinned SimC profile (`withEncounterStateAt`, SIMC-FB-R) | a proven lower bound. Where nothing contradicts it on a proven build, the profile's 1, disclosed as SimC-profile-relative. Otherwise UNKNOWN, and no position means no reading |
| `fight_style.dungeonroute`, `howl_summon.ready`, `target.distance`, `buff.*`, `debuff.*`, `cooldown.*`, `full_recharge_time`, `gcd`, `target.time_to_die` | none | unbound or UNKNOWN_NUMBER, stated as such |

The list reads no Focus, so none is declared.

## Why no decision resolves

| Stops at | Why |
| --- | --- |
| `default[0] retarget` | where every scan stops, on its `target_if`, before any rotation line. Its gate is `fight_style.dungeonroute`, a simulation setting that only the SimC profile fallback may bind (SIMC-FB-A), which this list does not read yet. Synthetic |
| `default[1] auto_attack` | past that, on a fight style only a test can state: off the GCD, with no reviewed contract, so the engine refuses. Synthetic |
| `default[3]` to `default[6]` | the dispatches, gated on the enemy count. A lower bound can close one side only. Synthetic |
| the rotation lists | Tip of the Spear, charges, cooldowns, `howl_summon.ready`, Sentinel's Mark, and `target_if` on the cleave lines |

## Not evaluated, deliberately

Every row is unmeasured against a resolved build. Auras, charges, cooldowns, the enemy count and haste are not modelled. See `agent/follow-ups.md` "After ONB-T2".

## The pinned SimC profile (SIMC-FB-R)

Every decision reads encounter state through `withEncounterStateAt`: real evidence first, then the pinned profile's environment, on a build the deploy calendar proves. The result says what the priority would select under the profile, never what the real encounter held. Each decision's `profileFacts` go into the view as `simcProfileFacts`, so it is disclosed. It makes nothing actionable. The measured results are in `agent/architecture.md` "SIMC-FB-R".

`target_if`: attested for `takedown`, `moonlight_chakram`, `raptor_strike` (`sole-target-attestations.ts`); not attested: `retarget`, `wildfire_bomb`, each with its reason in that file. An unattested line reads as it did before.
