# Arcane Mage — observed-decision slice (ONB-D3)

**Exposure: `INTERNAL_ONLY`.** The registration (`mage-arcane-observed-decisions`, `mage/arcane`) is in the production
catalog for the internal lookup only. The public lookup and the identity table refuse it.

**Not promoted by ONB-D3P.** It cannot pass the rotational gates, and it waits on how an interrupt with no castable target is stepped past, Evocation's talent and the inputs behind them, rather than on evidence (agent/architecture.md "ONB-D3P").

**A Cohort D follower on the shared cast anchor (ONB-S4). It resolves nothing today.** No decision of this
specialization reaches MATCH or REJECTED on the shared engine as it stands. Every decision is observed, anchored where the evidence allows,
classified and explained, and stays UNKNOWN. That is a measured property of the pinned list and the missing inputs below, not a claim about any player.

## The authority

`SIMC_APL_MAGE_ARCANE` (`simc-33622e9d-1`), the `//arcane_apl_start .. _end` region of `apl/mage.cpp`, with no PTR region, governs
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
| Arcane Barrage, Arcane Orb, and the off-GCD Counterspell, Touch of the Magi and Presence of Mind | INSTANT | decided when it lands |
| Arcane Surge, Prismatic Bolt, Arcane Pulse | CAST_TIME | a cast time above zero: no -100% cast-time row of the family matches them |
| Arcane Blast | CAST_TIME | nothing: Presence of Mind is a -100% row matching it, and this slice does not narrow it on any build |
| Arcane Missiles, Evocation | CHANNEL | decided at its cast; its span is possible, never proven, with no bound claimed |
| everything else | not reviewed | `EXECUTION_NOT_REVIEWED`, and occupancy around it stays UNKNOWN |

The rows are hand-reviewed readings of the pinned `_cast_time` and of every cast-time effect of the family matching each spell (`mage-arcane-cast-semantics.ts`). No haste is established, so `exactMs` is always null and no anchor is ever derived from a completion.

**A begin does not prove the moment of a cast that may have been instant.** That is the shared timeline's own rule: both instants stay candidates, and the anchor is UNKNOWN.

**What it changes:**

- **The decision's times are the anchor's.** Its `position` and `locator` stay the completion's, because the completion is the observation that names the action.
- **No anchor, no verdict.** An UNKNOWN anchor makes the comparison UNKNOWN (`DECISION_ANCHOR_NOT_ESTABLISHED`, class `OBSERVED_STATE_MISSING`) whatever the scan says. The scan still runs, and its diagnostics stay attached.
- **Nothing read at a completion is called the decision's state.** Every binding is fixed for the fight. That is why Mana stays unbound, even though the wire reports it on a cast.

## What is bound, and from what

| Atom | Source | Rule |
| --- | --- | --- |
| `talent.<x>` | the three-way rule; another hero tree's talents are FALSE on a resolved tree | absent from the tree is UNKNOWN |
| `active_enemies` | the shared enemy set at the decision (`withEnemyCountAt`, ONB-S3) | a proven lower bound, or UNKNOWN. No event proves an upper bound, and no position means no reading |
| `mana.pct`, `buff.*`, `debuff.*`, `cooldown.*`, `prev_gcd.*`, `set_bonus.*`, `action.*`, `gcd.max`, `fight_remains` | none | unbound or UNKNOWN_NUMBER, stated as such |

## Why no decision resolves

| Stops at | Why |
| --- | --- |
| `default[0] counterspell` | where the engine refuses: first and unconditional, off the GCD, with no reviewed contract |
| `default[12] arcane_barrage`, `cooldowns[1] touch_of_the_magi`, `cooldowns[2] arcane_surge`, `cooldowns[3] cancel_action` | open as candidates, on `fight_remains`, auras, `prev_gcd` and `mana.pct`; `cancel_action` has no binding |
| `cooldowns[4] evocation` | where the root scan stops: Evocation's talent is on a choice node the observed tree does not resolve |
| `sunfury[0]` `chain=1`, `spellslinger[3]` `interrupt_if` | past those, options no one reads, and the enemy count by way of `variable.aoe_count` |

## The evidence

Six retained subjects, replayed offline through production ingestion, all Sunfury: b1PmaKrd6CDfzngc fight 48 actors 121 and 7, gtKb2xHn87pNcFfW fight 22 actor 1, whole fights; A7R6kxPJ1hC8YQ4w fight 7 actor 3, rXAfw9t1q8YpmkKD fight 13 actors 3 and 4, first 165 s. 1,039 decisions, all UNKNOWN, none committed (agent/architecture.md "ONB-D3"). Arcane Missiles logs as `cast` with no begin, and Prismatic Bolt and Arcane Surge with one, which corroborates the review.

## Not evaluated, deliberately

Spellslinger has no retained subject, and none casts Arcane Pulse, Evocation or Presence of Mind, so those lines are unmeasured. Mana, Arcane Charges, Arcane Salvo, Clearcasting, every other aura, cooldowns, charges, the enemy count and haste are not modelled. See `agent/follow-ups.md` "After ONB-D3".
