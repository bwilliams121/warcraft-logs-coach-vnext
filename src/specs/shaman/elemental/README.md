# Elemental Shaman — observed-decision slice (ONB-D2)

**Exposure: `INTERNAL_ONLY`.** The registration (`shaman-elemental-observed-decisions`, `shaman/elemental`) is in the production
catalog for the internal lookup only. The public lookup and the identity table refuse it.

**A Cohort D follower on the shared cast anchor (ONB-S4). It resolves nothing today.** No decision of this
specialization reaches MATCH or REJECTED on the shared engine as it stands. Every decision is observed, anchored where the evidence allows,
classified and explained, and stays UNKNOWN. That is a measured property of the pinned list and the missing inputs below, not a claim about any player.

## The authority

`SIMC_APL_SHAMAN_ELEMENTAL` (`simc-33622e9d-1`), the `//elemental_apl_start .. _end` region of `apl_shaman.cpp`, whose PTR body is identical, governs
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
| Flame Shock, Voltaic Blaze, Earth Shock, Earthquake, Frost Shock, Ascendance, Lightning Shield, and the off-GCD Spiritwalker's Grace, Wind Shear, Nature's Swiftness, Ancestral Swiftness | INSTANT | decided when it lands |
| Stormkeeper | CAST_TIME | a cast time above zero: no -100% cast-time row of the family matches it |
| Lightning Bolt, Chain Lightning, Lava Burst, Elemental Blast, Tempest | CAST_TIME | nothing: a -100% row matches each, and no pinned source excludes it, on any build |
| everything else | not reviewed | `EXECUTION_NOT_REVIEWED`, and occupancy around it stays UNKNOWN |

The rows are hand-reviewed readings of the pinned `_cast_time` and of every cast-time effect of the family matching each spell (`shaman-elemental-cast-semantics.ts`). No haste is established, so `exactMs` is always null and no anchor is ever derived from a completion.

**A begin does not prove the moment of a cast that may have been instant.** That is the shared timeline's own rule since ONB-D2: both instants stay candidates, and the anchor is UNKNOWN.

**What it changes:**

- **The decision's times are the anchor's.** Its `position` and `locator` stay the completion's, because the completion is the observation that names the action.
- **No anchor, no verdict.** An UNKNOWN anchor makes the comparison UNKNOWN (`DECISION_ANCHOR_NOT_ESTABLISHED`, class `OBSERVED_STATE_MISSING`) whatever the scan says. The scan still runs, and its diagnostics stay attached.
- **Nothing read at a completion is called the decision's state.** Every binding is fixed for the fight. That is why Maelstrom stays unbound, even though the wire reports it on a cast.

## What is bound, and from what

| Atom | Source | Rule |
| --- | --- | --- |
| `talent.<x>` | the three-way rule; another hero tree's talents are FALSE on a resolved tree | absent from the tree is UNKNOWN |
| `maelstrom`, `maelstrom.deficit`, `spell_targets.*`, `active_enemies`, `active_dot.*`, `lightning_rod`, `dot.*`, `buff.*`, `cooldown.*`, `movement.distance`, `gcd`, `fight_remains` | none | unbound or UNKNOWN_NUMBER, stated as such |

## Why no decision resolves

| Stops at | Why |
| --- | --- |
| `default[0] spiritwalkers_grace,moving=1,if=movement.distance>6` | where every scan stops on real evidence. `moving` is an action option the shared scan refuses, and Warcraft Logs has no movement stream. Each subject has the talent, so the line exists |
| `default[1] wind_shear`, `default[14] natures_swiftness` (behind it) | off the GCD, with no reviewed contract, so a scan refuses rather than steps past them |
| `default[13] lightning_shield,if=buff.lightning_shield.down` (behind it) | a GCD action on an aura no slice binds |
| `default[17]`, `default[18]` (behind it) | the area dispatch reads `spell_targets.chain_lightning` (ONB-S3), so even a resolved prefix meets the enemy count |

## The evidence

Seven retained subjects, replayed offline through production ingestion, all Farseer: b1PmaKrd6CDfzngc fight 48 actors 8 and 17 and gtKb2xHn87pNcFfW fight 22 actors 9 and 19, whole fights; A7R6kxPJ1hC8YQ4w fight 7 actors 8 and 16 and rXAfw9t1q8YpmkKD fight 13 actor 12, first 165 s. 1,210 decisions, all UNKNOWN, none committed (agent/architecture.md "ONB-D2"). Every subject logs both 470411 and 188389 for one Flame Shock, and only the class row is a decision. Every subject logs Ascendance as 114050, where the constructor reads 1219480; both are bound.

## Not evaluated, deliberately

Stormbringer has no retained subject, so Tempest's lines are unmeasured. Auras, cooldowns, charges, Maelstrom, the enemy count, Lightning Rod, haste and movement are not modelled. See `agent/follow-ups.md` "After ONB-D2".
