# Marksmanship Hunter — observed-decision slice (ONB-D4)

**Exposure: `INTERNAL_ONLY`.** The registration (`hunter-marksmanship-observed-decisions`, `hunter/marksmanship`) is in the production
catalog for the internal lookup only. The public lookup and the identity table refuse it.

**A Cohort D follower on the shared cast anchor (ONB-S4), with no real subject. It resolves nothing today.** No retained Marksmanship Hunter subject has combatant info, so nothing here has met real evidence. On the synthetic builds in its tests every decision stays UNKNOWN. That is a property of the pinned list and the missing inputs below, not a claim about any player.

## The authority

`SIMC_APL_HUNTER_MARKSMANSHIP` (`simc-33622e9d-1`), the `//marksmanship_apl_start .. _end` region of `apl/apl_hunter.cpp`, the live branch of a region whose PTR twin differs, governs
OFFENSIVE_ROTATION only. Resource spending, defensive cooldowns and interrupts are declared and resolve
`NO_PINNED_AUTHORITY_FOR_DOMAIN`. Active mitigation and self healing are not declared.

## The decision population

Every COMPLETE cast by the actor, classified by pinned data:

| Cast | Classification |
| --- | --- |
| Warcraft Logs `melee` flag | excluded `MELEE_SWING` |
| pinned lane NON_GCD | excluded `NON_GCD_ACTION` |
| no pinned lane record (anything the pinned list does not name) | excluded `EXECUTION_LANE_NOT_ESTABLISHED` |
| every other GCD token | eligible -> anchor -> first-GCD query -> comparison |

A begin that never completes is not a decision, and neither is any instant with no cast. Nothing builds a missed-action opportunity, in or out of a cast. Unpaired begins are counted in the coverage (`unpairedBegins`) and never judged.

## The anchor (ONB-S4)

A cast-time action is decided when it begins. `cast-anchor-profile.ts` supplies the shared timeline with what this specialization can prove:

| Ability | Execution | What a completion proves |
| --- | --- | --- |
| Arcane Shot, Multi-Shot, Kill Shot, Black Arrow, Explosive Shot, Volley, Moonlight Chakram, and the off-GCD Trueshot | INSTANT | decided when it lands |
| Steady Shot, Wailing Arrow | CAST_TIME | a cast time above zero: no -100% cast-time row of the family matches them |
| Aimed Shot | CAST_TIME | nothing: Lock and Load is a -100% row matching it, and this slice does not narrow it on any build |
| Rapid Fire | CHANNEL | decided at its cast; its span is possible, never proven, with no bound claimed |
| everything else | not reviewed | `EXECUTION_NOT_REVIEWED`, and occupancy around it stays UNKNOWN |

The rows are hand-reviewed readings of the pinned `_cast_time` and of every cast-time effect of the family matching each spell (`hunter-marksmanship-cast-semantics.ts`). No haste is established, so `exactMs` is always null and no anchor is ever derived from a completion.

**A begin does not prove the moment of a cast that may have been instant.** That is the shared timeline's own rule: both instants stay candidates, and the anchor is UNKNOWN.

**What it changes:**

- **The decision's times are the anchor's.** Its `position` and `locator` stay the completion's, because the completion is the observation that names the action.
- **No anchor, no verdict.** An UNKNOWN anchor makes the comparison UNKNOWN (`DECISION_ANCHOR_NOT_ESTABLISHED`, class `OBSERVED_STATE_MISSING`) whatever the scan says. The scan still runs, and its diagnostics stay attached.
- **Nothing read at a completion is called the decision's state.** Every binding is fixed for the fight.

## What is bound, and from what

| Atom | Source | Rule |
| --- | --- | --- |
| `talent.<x>` | the three-way rule; another hero tree's talents are FALSE on a resolved tree | absent from the tree is UNKNOWN |
| `hero_tree.sentinel`, `hero_tree.dark_ranger` | the resolved hero tree | a constant; on an unresolved tree, no row, so both dispatches stay open |
| `active_enemies` | the shared enemy set at the decision (`withEnemyCountAt`, ONB-S3) | a proven lower bound, or UNKNOWN. No event proves an upper bound, and no position means no reading |
| `fight_style.dungeonroute`, `raid_event.pull.*`, `max_prio_damage`, `focus`, `cost`, `buff.*`, `debuff.*`, `cooldown.*`, `dot.*`, `full_recharge_time`, `cast_time`, `execute_time`, `gcd`, `time`, `set_bonus.*`, `action.*`, `fight_remains` | none | unbound or UNKNOWN_NUMBER, stated as such |

## Why no decision resolves

| Stops at | Why |
| --- | --- |
| `default[2] retarget` | where every scan stops, on its `target_if`, before any rotation line. Its gate is `fight_style.dungeonroute`, a simulation setting that only the SimC profile fallback may bind (SIMC-FB-A), which this list does not read yet. Synthetic |
| `default[3] auto_shot` | past that, on a fight style only a test can state: off the GCD, with no reviewed contract, so the engine refuses. Synthetic |
| `sentaoe[0]`, `draoe[0] explosive_shot` | past that, the area dispatch open on the enemy count, and the line's `target_if` refused. Synthetic |
| the rotation lists | Focus, Precise Shots, Trick Shots, Lock and Load, Bulletstorm, the marks and charges; `target_if` on most lines |

**Not promoted by ONB-D4P.** It cannot pass the rotational gates, and it waits on a real subject (ONB-EV), then how a line gated on `fight_style.dungeonroute` is read on a raid fight and the inputs behind it (agent/architecture.md "ONB-D4P").

## The evidence

None usable, so Marksmanship is on ONB-EV. Its only real casts are the filtered M13-A capture's actors 14 (83 casts, 25 begins) and 18 (93, 28), with no combatant info, which refuse `PROFILE_NOT_RESOLVED` when replayed (agent/architecture.md "ONB-D4"). Every stop above comes from a synthetic build, and the talent keys are uncorroborated on real evidence. Those casts do corroborate two readings: Moonlight Chakram logs 1264949, and Rapid Fire logs `cast` with no begin.

## Not evaluated, deliberately

Every row is unmeasured against a resolved build. Focus, auras, marks, cooldowns, charges, in-flight state, the enemy count and haste are not modelled. See `agent/follow-ups.md` "After ONB-D4".
