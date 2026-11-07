# Fury Warrior — observed-decision slice (ONB-A2)

**Exposure: `INTERNAL_ONLY`.** The registration (`warrior-fury-observed-decisions`, `warrior/fury`) is in the production
catalog for the internal lookup only. The public lookup and the identity table refuse it.

**ONB-S3R (2026-11-06): not replayable. No event of it is retained, so its gap stays on ONB-EV, and its list reads `active_enemies`.** (agent/architecture.md "ONB-S3R").

**A Cohort A follower of Havoc's pattern, and it resolves nothing today.** No decision of this
specialization reaches MATCH or REJECTED on the shared engine as it stands. Every decision is observed,
classified and explained, and stays UNKNOWN. That is a measured property of the pinned list and the
missing inputs below, not a claim about any player.

## The authority

`SIMC_APL_WARRIOR_FURY` (`simc-33622e9d-1`), the `//fury_apl_start .. _end` region of `apl_warrior.cpp`, governs
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
| `rage` | the decision cast's own PRE_COST | EXACT on a costed cast; unknown on a free one. Never replayed |
| `talent.<x>`, `talent.<x>.enabled` | the three-way rule; another hero tree's talents are FALSE on a resolved tree | absent from the tree is UNKNOWN |
| `active_enemies` | the shared enemy set at the decision, then the pinned SimC profile (`withEncounterStateAt`, SIMC-FB-R) | a proven lower bound. Where nothing contradicts it on a proven build, the profile's 1, disclosed as SimC-profile-relative. Otherwise UNKNOWN, and no position means no reading |
| `buff.*`, `debuff.*`, `cooldown.*`, simulation options | none | unbound or UNKNOWN_NUMBER, stated as such |

## Why no decision resolves

| Stops at | Why |
| --- | --- |
| `default[0..1]` | the query's first refusal: Charge is off the GCD with no reviewed transition contract, and `time` and `movement.distance` have no evidence, so its branch can never be closed |
| `default[2] heroic_leap` | `raid_event.*` is simulation-only, and Heroic Leap has no contract either |
| `default[4] pummel` | `target.debuff.casting.react` is not read, and Pummel has no contract |
| `default[14..17] run_action_list` | every hero list is gated on `active_enemies`, so the single-target and multi-target lists are both possible at every decision (ONB-S3) |
| `slayer`, `thane` and their `_aoe` lists | their first entries are off-GCD cooldowns with no contract, and the lists diverge on their first GCD action |

ONB-S3 gives the count a proven lower bound and no upper bound. Every GCD action of the list sits behind those dispatches, so nothing resolves until one of them settles.

## The evidence

**No real-evidence validation exists.** The retained captures were censused (`friendlySpecs` aligned to
`friendlyPlayers`, then events by actor):

- m11c4f context-2 `FPp6xjkNC9R4LrVh` fight 10, actor 3, and context-4 `24XJ9Nyq7jnfgAMQ` fight 23, actor 21: context only, and neither is committed. No retained page holds one of its events.

The gap is on ONB-EV. Everything here is proven on synthetic fights and on the pinned data.

**Unmeasured wire hazards**, each a known failure mode from Havoc: a logged cast that is not a press, a cast's
own aura effect placed before the cast, a pinned cooldown the wire contradicts. Bloodbath and Crushing Blow replace Bloodthirst and Raging Blow, and Rampage and Whirlwind execute child attacks with their own ids (Rampage 184707, 184709, 201363, 201364, 218617, 235622 to 235626). Which of these the log reports as a `cast` is unmeasured. Measure these
before binding anything that could resolve a decision.

## Not evaluated, deliberately

Auras (no wire identity is corroborated), cooldowns (no pin is checked against real gaps), resources between
casts, the target's health and casts, movement. See `agent/follow-ups.md` "After ONB-A2".

## The pinned SimC profile (SIMC-FB-R)

Every decision reads encounter state through `withEncounterStateAt`: real evidence first, then the pinned profile's environment, on a build the deploy calendar proves. The result says what the priority would select under the profile, never what the real encounter held. Each decision's `profileFacts` go into the view as `simcProfileFacts`, so it is disclosed. It makes nothing actionable. The measured results are in `agent/architecture.md` "SIMC-FB-R".

`target_if`: this list has no `target_if` line.
