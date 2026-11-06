# Affliction Warlock — observed-decision slice (ONB-D4)

**Exposure: `INTERNAL_ONLY`.** The registration (`warlock-affliction-observed-decisions`, `warlock/affliction`) is in the production
catalog for the internal lookup only. The public lookup and the identity table refuse it.

**A Cohort D follower on the shared cast anchor (ONB-S4), with no real subject. It resolves nothing today.** No retained Affliction Warlock subject has combatant info, so nothing here has met real evidence. On the synthetic builds in its tests every decision stays UNKNOWN. That is a property of the pinned list and the missing inputs below, not a claim about any player.

## The authority

`SIMC_APL_WARLOCK_AFFLICTION` (`simc-33622e9d-1`), the `//affliction_apl_start .. _end` region of `apl/warlock.cpp`, with no PTR region, governs
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
| Agony, Corruption, Wither, Malevolence, Summon Darkglare | INSTANT | decided when it lands |
| Haunt | CAST_TIME | a cast time above zero: no -100% cast-time row of the family matches it, and Improved Haunt's flat -300 ms does not reach its base |
| Shadow Bolt, Seed of Corruption, Unstable Affliction | CAST_TIME | nothing: Nightfall, Shadowy Inspiration and Shard Instability are -100% rows matching them, and this slice does not narrow them on any build |
| Dark Harvest, Drain Soul, Malefic Grasp | CHANNEL | decided at its cast; its span is possible, never proven, with no bound claimed |
| everything else | not reviewed | `EXECUTION_NOT_REVIEWED`, and occupancy around it stays UNKNOWN |

The rows are hand-reviewed readings of the pinned `_cast_time` and of every cast-time effect of the family matching each spell (`warlock-affliction-cast-semantics.ts`). No haste is established, so `exactMs` is always null and no anchor is ever derived from a completion.

**A begin does not prove the moment of a cast that may have been instant.** That is the shared timeline's own rule: both instants stay candidates, and the anchor is UNKNOWN.

**What it changes:**

- **The decision's times are the anchor's.** Its `position` and `locator` stay the completion's, because the completion is the observation that names the action.
- **No anchor, no verdict.** An UNKNOWN anchor makes the comparison UNKNOWN (`DECISION_ANCHOR_NOT_ESTABLISHED`, class `OBSERVED_STATE_MISSING`) whatever the scan says. The scan still runs, and its diagnostics stay attached.
- **Nothing read at a completion is called the decision's state.** Every binding is fixed for the fight.

## What is bound, and from what

| Atom | Source | Rule |
| --- | --- | --- |
| `talent.<x>` | the three-way rule; another hero tree's talents are FALSE on a resolved tree | absent from the tree is UNKNOWN |
| `hero_tree.soul_harvester`, `hero_tree.hellcaller` | the resolved hero tree | a constant; on an unresolved tree, no row, so both dispatches stay open |
| `active_enemies` | the shared enemy set at the decision (`withEnemyCountAt`, ONB-S3) | a proven lower bound, or UNKNOWN. No event proves an upper bound, and no position means no reading |
| `soul_shard`, `remains`, `refreshable`, `ticking`, `dot.*`, `active_dot.*`, `buff.*`, `pet.darkglare.*`, `cooldown.*`, `prev.*`, `prev_gcd.*`, `set_bonus.*`, `action.*`, `execute_time`, `duration`, `gcd`, `fight_remains` | none | unbound or UNKNOWN_NUMBER, stated as such |

## Why no decision resolves

| Stops at | Why |
| --- | --- |
| `end_of_fight[0] unstable_affliction` | where the engine refuses: open on `soul_shard`, `fight_remains` (PREDICTIVE) and the enemy count, and it is on the GCD, so nothing may fall through it. Synthetic |
| `end_of_fight[2] drain_soul` | where the root scan stops: Drain Soul's talent is not resolved. Synthetic |
| `HC_cleave[1]`, `SH_cleave[1] seed_of_corruption` | past those, with Drain Soul proven not taken, every rotation line open, then a condition with too many unresolved atoms to enumerate. Synthetic |
| the rotation lists | DoT windows, Nightfall, Soul Shards, the Darkglare and the enemy count; `target_if`, `cycle_targets`, `chain`, `early_chain_if` and `interrupt_if` options no one reads |

**Not promoted by ONB-D4P.** It cannot pass the rotational gates, and it waits on a real subject (ONB-EV), then a player-knowable reading of `fight_remains`, Drain Soul's talent and the inputs behind them (agent/architecture.md "ONB-D4P").

## The evidence

None usable, so Affliction is on ONB-EV. Its only real casts are the filtered M13-A capture's actor 20 (116 casts, 91 begins, no combatant info), which refuses `PROFILE_NOT_RESOLVED` when replayed (agent/architecture.md "ONB-D4"). Every stop above comes from a synthetic build, and the talent keys are uncorroborated on real evidence. Those casts do corroborate two readings: Malefic Grasp logs 1261153, and Dark Harvest and Malefic Grasp log `cast` with no begin.

## Not evaluated, deliberately

Every row is unmeasured against a resolved build. Soul Shards, DoT windows, auras, the Darkglare, cooldowns, in-flight state, the enemy count and haste are not modelled. See `agent/follow-ups.md` "After ONB-D4".
