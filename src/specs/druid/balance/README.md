# Balance Druid — observed-decision slice (ONB-D2)

**Exposure: `INTERNAL_ONLY`.** The registration (`druid-balance-observed-decisions`, `druid/balance`) is in the production
catalog for the internal lookup only. The public lookup and the identity table refuse it.

**A Cohort D follower on the shared cast anchor (ONB-S4). It resolves nothing today.** No decision of this
specialization reaches MATCH or REJECTED on the shared engine as it stands. Every decision is observed, anchored where the evidence allows,
classified and explained, and stays UNKNOWN. That is a measured property of the pinned list and the missing inputs below, not a claim about any player.

## The authority

`SIMC_APL_DRUID_BALANCE` (`simc-33622e9d-1`), the whole of `apl/druid/balance_apl.inc`, included by `apl_balance`, whose PTR list is a separate file, governs
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
| Moonfire, Sunfire, Starsurge, Starfall, Fury of Elune, Force of Nature, Wild Mushroom, Eclipse, and the off-GCD Celestial Alignment and Incarnation | INSTANT | decided when it lands |
| New Moon, Half Moon, Full Moon | CAST_TIME | a cast time above zero: no -100% cast-time row of the family matches them |
| Wrath, Starfire | CAST_TIME | nothing: a -100% row matches each, and no pinned source excludes it, on any build |
| Convoke the Spirits | CHANNEL | decided at its cast; its span is possible, never proven, with no bound claimed |
| everything else | not reviewed | `EXECUTION_NOT_REVIEWED`, and occupancy around it stays UNKNOWN |

The rows are hand-reviewed readings of the pinned `_cast_time` and of every cast-time effect of the family matching each spell (`druid-balance-cast-semantics.ts`). No haste is established, so `exactMs` is always null and no anchor is ever derived from a completion.

**A begin does not prove the moment of a cast that may have been instant.** That is the shared timeline's own rule since ONB-D2: both instants stay candidates, and the anchor is UNKNOWN.

**What it changes:**

- **The decision's times are the anchor's.** Its `position` and `locator` stay the completion's, because the completion is the observation that names the action.
- **No anchor, no verdict.** An UNKNOWN anchor makes the comparison UNKNOWN (`DECISION_ANCHOR_NOT_ESTABLISHED`, class `OBSERVED_STATE_MISSING`) whatever the scan says. The scan still runs, and its diagnostics stay attached.
- **Nothing read at a completion is called the decision's state.** Every binding is fixed for the fight. That is why Astral Power stays unbound, even though the wire reports it on a cast.

## What is bound, and from what

| Atom | Source | Rule |
| --- | --- | --- |
| `talent.<x>` | the three-way rule; another hero tree's talents are FALSE on a resolved tree | absent from the tree is UNKNOWN |
| `hero_tree.elunes_chosen`, `hero_tree.keeper_of_the_grove` | the resolved tree (player.cpp:12205-12216) | a constant by build, unbound while the tree is unresolved |
| `astral_power`, `astral_power.deficit`, `spell_targets*`, `enemies`, `active_dots.*`, `eclipse.*`, `buff.*`, `cooldown.*`, `charges_fractional`, `action.*.cost`, `energize_amount`, `execute_time`, `prev_gcd.*`, `gcd.max`, `druid.no_cds`, `fight_remains`, `target.time_to_die` | none | unbound or UNKNOWN_NUMBER, stated as such |

## Why no decision resolves

| Stops at | Why |
| --- | --- |
| `default[13] run_action_list,name=opener,if=variable.opener` | where every scan stops on real evidence. Precombat sets `opener` to 1, and `default[7]` clears it when `buff.ca_inc.up`, which is not bound, so the gate is undecided |
| `default[14]`, `default[15]` (behind it) | `variable.mini` and `variable.cds` read cooldowns, buffs and Eclipse nothing binds |
| `default[16]`, `default[17]`, `default[18]` (behind it) | every rotation list reads `spell_targets` (ONB-S3). `hero_tree` closes one of them on a resolved tree, and the count stays open |

## The evidence

Three retained subjects, replayed offline through production ingestion, all Elune's Chosen: rXAfw9t1q8YpmkKD fight 13 actors 9 and 13, first 165 s; gtKb2xHn87pNcFfW fight 22 actor 27, 16 casts over 56 s. 287 decisions, all UNKNOWN, none committed (agent/architecture.md "ONB-D2"). Every subject logs Lunar Eclipse as 1233272 at `_gcd` 500 and Incarnation as 102560 at `_gcd` 0.

## Not evaluated, deliberately

Keeper of the Grove has no retained subject, and none casts a moon, Wild Mushroom, Force of Nature or Convoke, so those lines and that channel are unmeasured. Astral Power, Eclipse, auras, cooldowns, charges, the enemy count and haste are not modelled. See `agent/follow-ups.md` "After ONB-D2".
