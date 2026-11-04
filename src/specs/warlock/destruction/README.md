# Destruction Warlock — observed-decision slice (ONB-D1)

**Exposure: `INTERNAL_ONLY`.** The registration (`warlock-destruction-observed-decisions`, `warlock/destruction`) is in the production
catalog for the internal lookup only. The public lookup and the identity table refuse it.

**Cohort D's representative, and the first reader of the shared cast anchor (ONB-S4). It resolves nothing today.** No decision of this
specialization reaches MATCH or REJECTED on the shared engine as it stands. Every decision is observed, anchored where the evidence allows,
classified and explained, and stays UNKNOWN. That is a measured property of the pinned list and the missing inputs below, not a claim about any player.

## The authority

`SIMC_APL_WARLOCK_DESTRUCTION` (`simc-33622e9d-1`), the `//destruction_apl_start .. _end` region of `warlock.cpp`, governs
OFFENSIVE_ROTATION only. Resource spending, defensive cooldowns and interrupts are declared and resolve
`NO_PINNED_AUTHORITY_FOR_DOMAIN`. Active mitigation and self healing are not declared.

## The decision population

Every COMPLETE cast by the actor, classified by pinned data:

| Cast | Classification |
| --- | --- |
| Warcraft Logs `melee` flag | excluded `MELEE_SWING` |
| pinned lane NON_GCD | excluded `NON_GCD_ACTION` (no token of this list is) |
| no pinned lane record (Burning Rush, Soulburn, a potion, a healthstone, anything the pinned list does not name) | excluded `EXECUTION_LANE_NOT_ESTABLISHED` |
| every other GCD token | eligible -> anchor -> first-GCD query -> comparison |

A begin that never completes is not a decision, and neither is any instant with no cast. Nothing builds a missed-action opportunity, in or out of a cast. Unpaired begins are counted in the coverage (`unpairedBegins`) and never judged.

## The anchor (ONB-S4)

A cast-time action is decided when it begins. `cast-anchor-profile.ts` supplies the shared timeline with what this specialization can prove:

| Ability | Execution | What a completion proves |
| --- | --- | --- |
| Conflagrate, Shadowburn, Wither, Summon Infernal, Malevolence, Havoc, Rain of Fire | INSTANT | decided when it lands |
| Soul Fire, Immolate, Cataclysm | CAST_TIME | a cast time above zero: no -100% cast-time row of the family matches them |
| Chaos Bolt, Incinerate, Infernal Bolt, Ruination | CAST_TIME | nothing: a -100% row matches each, and no pinned source excludes it, on any build |
| everything else, including every channel | not reviewed | `EXECUTION_NOT_REVIEWED`, and occupancy around it stays UNKNOWN |

The rows are hand-reviewed readings of the pinned `_cast_time` and of every warlock-family cast-time effect matching each spell (`warlock-destruction-cast-semantics.ts`). No haste is established, so `exactMs` is always null and no anchor is ever derived from a completion.

**A begin does not prove the moment of a cast that may have been instant.** The shared timeline pairs a completion with the latest begin before it. For the four spells above, that begin may have been abandoned and the cast instant, so `destructionDecisionAnchor` keeps both instants as candidates and the anchor is UNKNOWN.

**What it changes:**

- **The decision's times are the anchor's.** Its `position` and `locator` stay the completion's, because the completion is the observation that names the action.
- **No anchor, no verdict.** An UNKNOWN anchor makes the comparison UNKNOWN (`DECISION_ANCHOR_NOT_ESTABLISHED`, class `OBSERVED_STATE_MISSING`) whatever the scan says. The scan still runs, and its diagnostics stay attached.
- **Nothing read at a completion is called the decision's state.** Every binding is fixed for the fight: the talents and the hero tree. That is why `soul_shard` stays unbound, even though the wire reports it on a Chaos Bolt's `cast`.

## What is bound, and from what

| Atom | Source | Rule |
| --- | --- | --- |
| `talent.<x>`, `talent.cataclysm.enabled` | the three-way rule; another hero tree's talents are FALSE on a resolved tree | absent from the tree is UNKNOWN |
| `soul_shard`, `active_enemies`, `active_dot.*`, `dot.*`, `dot_refreshable_count.*`, `buff.*`, `cooldown.*`, `action.*`, `demonic_art`, `pet.infernal.active`, `target.health.pct`, `target.time_to_die`, `fight_remains`, `raid_event.*`, `time` | none | unbound or UNKNOWN_NUMBER, stated as such |

## Why no decision resolves

| Stops at | Why |
| --- | --- |
| `default[3] call_action_list,name=aoe_hc` (Hellcaller), `default[4] .. aoe_dia` (Diabolist) | both read `active_enemies`. The other tree's list closes on its talent, and these stay open. Lifting the count needs ONB-S3, which is an owner decision |
| inside the open area list, `aoe_hc[2] rain_of_fire` | where the scan physically stops on real evidence. Its talent is a choice of two rows, so its applicability is UNKNOWN, and its condition reads the count anyway |
| `default[5] soul_fire`, `default[6] conflagrate` (a count only a test can have) | Soul Shards and charges are unknown, so the single-target lines stay open and nothing falls through to Incinerate |

The dispatch before the count works: `variables`, `ogcd` and `items` all return no action on both subjects.

## The evidence

Two retained subjects, replayed offline through production ingestion: A7R6kxPJ1hC8YQ4w fight 7, actors 12 and 15, the first 165 s of 424.5 s (pages m10b + m10c5), both Hellcaller. Nothing is committed but their context rows, and the anchor counts are in agent/architecture.md "ONB-D1". Every Chaos Bolt has a begin before it, which corroborates and does not prove, so all 64 stay UNKNOWN. Only 4 Soul Fires are anchored at a begin, and no real instant contradicts its review.

## Not evaluated, deliberately

Ritual Clipping stays `UNRESOLVED_DIABOLIST_HERO_TREE`, a deep-dive question this slice neither answers nor needs (no retained Destruction subject is a Diabolist). Auras, cooldowns, charges, Soul Shards, pets, the enemy count, the target's health, haste and movement are not modelled. See `agent/follow-ups.md` "After ONB-D1".
