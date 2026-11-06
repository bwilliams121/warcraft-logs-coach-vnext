# Arms Warrior — observed-decision slice (ONB-B1)

**Exposure: `INTERNAL_ONLY`.** The registration (`warrior-arms-observed-decisions`, `warrior/arms`) is in the production
catalog for the internal lookup only. The public lookup and the identity table refuse it.

**Not promoted by ONB-B1P.** It cannot pass the rotational gates, and it waits on ONB-S3 rather than on evidence: see "Other subjects" below.

**Cohort B's representative, and it resolves nothing today.** No decision of this specialization reaches MATCH or REJECTED:
every GCD action of the pinned list sits behind a `run_action_list` gated on the enemy count, which is the ONB-S3 owner
decision. That is a measured property of the pinned list and the missing inputs below, not a claim about any player. What it
can say over a real fight is one observation, the Colossus Smash windows.

## The authority

`SIMC_APL_WARRIOR_ARMS` (`simc-33622e9d-1`), the `//arms_apl_start .. _end` region of `apl_warrior.cpp`, governs
OFFENSIVE_ROTATION only. Resource spending, defensive cooldowns and interrupts are declared and resolve
`NO_PINNED_AUTHORITY_FOR_DOMAIN`. Active mitigation and self healing are not declared.

## The decision population

Every COMPLETE cast by the actor, classified by pinned data:

| Cast | Classification |
| --- | --- |
| Warcraft Logs `melee` flag | excluded `MELEE_SWING` |
| pinned lane NON_GCD (Charge, Avatar) | excluded `NON_GCD_ACTION` |
| no pinned lane record (Charge's impact 126664, Spell Reflection, Impending Victory, Rallying Cry, a potion, an item) | excluded `EXECUTION_LANE_NOT_ESTABLISHED` |
| `demolish`, channelled | excluded `OUTSIDE_FIRST_SLICE` |
| every other GCD token | eligible -> first-GCD query -> comparison |

## What is bound, and from what

| Atom | Source | Rule |
| --- | --- | --- |
| `rage` | the decision cast's own PRE_COST | EXACT on a costed cast; unknown on a free one. Never replayed |
| `talent.massacre.enabled` | the three-way rule | absent from the tree is UNKNOWN |
| `talent.<x>` | the three-way rule; another hero tree's talents are FALSE on a resolved tree | absent from the tree is UNKNOWN |
| `buff.*`, `debuff.*`, `dot.*`, `cooldown.*`, the enemy count, the target's health and casts, simulation options | none | unbound or UNKNOWN_NUMBER, stated as such |

## Why no decision resolves

| Stops at | Why |
| --- | --- |
| `default[0] charge` | the query's refusal: `movement.distance` has no evidence, and Charge is off the GCD with no reviewed transition contract |
| `default[3] pummel` | `target.debuff.casting.react` is not read, and Pummel has no contract either |
| `default[17] run_action_list` (`slayer_aoe`) | where the root scan stops on a Slayer build: `talent.slayers_dominance` holds and `active_enemies` is at most a proven lower bound (ONB-S3). `default[14]` is the same stop on a Colossus build |
| `default[18] run_action_list` (`slayer_execute`) | below that gate, and its own `target_if=min:target.health.pct` picks among enemies nothing enumerates |

The lists behind the dispatch open differently, so the worlds do not converge: `slayer_aoe` starts at Cleave, Sweeping Strikes
and Avatar, and `slayer_st` at Sweeping Strikes on two targets, Cleave and Rend. Lifting the enemy count needs ONB-S3, which is
an owner decision.

**Why nothing else was bound.** Binding auras and cooldowns would not move a decision while that stands, and the wire says a
pinned cooldown is not a usable bound here (see below). Each binding would be machinery with no decision behind it. See
`agent/architecture.md` "ONB-B1" for what the tranche measured before deciding that.

## `colossus-smash-window-fill`: an observation, never a verdict

`colossus-smash-windows.ts`, the payload's `colossusSmashWindows`. Inside each Colossus Smash debuff window, which pinned
single-target lines gated on `debuff.colossus_smash.up` were logged? On a Slayer build that is `slayer_st[3] avatar` and
`slayer_st[7] bladestorm`; on Colossus, `colossus_st[6] avatar` and `colossus_st[9] demolish`.

- A window is one `208086` DEBUFF applied by this actor on one enemy, observed application to observed removal. The log also
  reports 208086 as a BUFF on the actor, which is not a window.
- What the evidence does not show is `NOT_ESTABLISHED`, with presses `null`: a missing removal or application, a transition M4
  will not prove ACTIVE from the one before it, CASTS coverage short of COMPLETE (including whole in range and decode-degraded), a
  cast in the window with no ability id or no source that could be a gated one, or a gated cast in an edge's own millisecond, whose
  order the log does not establish. It is never zero, and a window is never extended.
- A count is logged casts by the actor, target unattributed: 69 of the subject's logged casts report target -1, among them every
  Colossus Smash. One press lands in every enemy's window it overlaps.
- It says nothing about whether a window should have held a press.

## Measured: b1PmaKrd6CDfzngc fight 48, actor 5, Slayer

| Window | Eligible | MATCH | REJECTED | UNKNOWN | Excluded |
| --- | --- | --- | --- | --- | --- |
| retained first 6 s (committed, pinned in the archive) | 6 | 0 | 0 | 6 | 8 |
| whole fight (retained raw capture, offline replay, not committed) | 324 | 0 | 0 | 324 | 225 |

Every decision's query refuses at `default[0] charge`, and every root scan stops at `default[17]` on `active_enemies`.

Colossus Smash windows over the whole fight: 35, on the boss (10) and two other enemies (20 and 5), from 10 casts, all
established, lasting 1.5 to 10.0 s. In them the log shows 9 Avatar and 33 Bladestorm casts counted per window, and 2 windows hold
neither. The committed 6 s holds one application
and no removal, so that window is `NO_REMOVAL_OBSERVED`.

**Other subjects** (ONB-B1P, offline replay, not committed). All Slayer, all UNKNOWN, all stopping on `active_enemies` at `default[17]`:

| Subject | Retained span | Eligible | Excluded |
| --- | --- | ---: | ---: |
| gtKb2xHn87pNcFfW fight 22 actor 5 | whole fight | 295 | 193 |
| gtKb2xHn87pNcFfW fight 22 actor 12 | whole fight | 273 | 177 |
| rXAfw9t1q8YpmkKD fight 13 actor 10 | first 165 s | 166 | 96 |
| A7R6kxPJ1hC8YQ4w fight 7 actor 4 | first 165 s | 149 | 99 |

No Colossus subject is retained. What follows was read on fight 48 only.

**What the wire showed**, offline, and why none of it was bound:

- **A logged id is not always the module's.** Execute logs as 281000, Massacre's override of 163201 (the pinned effect row of
  281001). Both are bound. Heroic Strike logs as 1269383, Bladestorm as 446035.
- **A logged cast is not always a press.** Unhinged runs Mortal Strike copies from Bladestorm on the same spell
  (sc_warrior.cpp:3252-3254, :3324): each of the 9 Bladestorms is followed by a logged 12294 within 404 to 527 ms. 24 of 329
  pairs of GCD casts sit under 700 ms, which no GCD allows. They are eligible and UNKNOWN today. A future reading must tell them
  from presses before it judges one.
- **A pinned cooldown does not bound here.** The smallest observed gaps are shorter than the pin: Colossus Smash 27.1 s against
  45 s, Bladestorm 26.1 s against 90 s, Avatar 50.6 s against 90 s, Mortal Strike under 1 s against 6 s, Cleave 4.2 s against
  4.5 s. The list's talents reset or shorten them in combat, so a floor from the pin would be wrong in the direction that
  produces false verdicts.
- **A cast's effect is not at the cast.** The first Colossus Smash is logged 549 ms before its debuff.
- **The Rage reading holds.** Each costed cast reports its own PRE_COST Rage in the shared contract's scale.

## Expressions and lists

| Supported | Refused, stated |
| --- | --- |
| `default`, `variables`, `trinkets` (non-domain), the precombat variables | `slayer_*`, `colossus_*`: parsed and scanned, and undecided behind the dispatch |
| `talent.<x>`, `talent.massacre.enabled`, `rage` | `trinket.*` in the precombat variables and `trinkets`: undeclared, and read only by non-domain entries |

## Not evaluated, deliberately

Auras and cooldowns (see above), Rage between casts, the enemy count, the target's health and casts, movement. See
`agent/follow-ups.md` "After ONB-B1".
