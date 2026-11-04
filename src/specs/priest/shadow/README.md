# Shadow Priest — observed-decision slice (ONB-D2)

**Exposure: `INTERNAL_ONLY`.** The registration (`priest-shadow-observed-decisions`, `priest/shadow`) is in the production
catalog for the internal lookup only. The public lookup and the identity table refuse it.

**A Cohort D follower on the shared cast anchor (ONB-S4). It resolves nothing today.** No decision of this
specialization reaches MATCH or REJECTED on the shared engine as it stands. Every decision is observed, anchored where the evidence allows,
classified and explained, and stays UNKNOWN. That is a measured property of the pinned list and the missing inputs below, not a claim about any player.

## The authority

`SIMC_APL_PRIEST_SHADOW` (`simc-33622e9d-1`), the `//shadow_apl_start .. _end` region of `apl_priest.cpp`. Its PTR body differs by one item line, so the policy is `PTR_BODY_DIFFERS`, and a live build reads the live region, governs
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
| Shadow Word: Madness, Tentacle Slam, Void Volley, Shadow Word: Death, Shadow Word: Pain, Holy Nova, and the off-GCD Power Infusion and Desperate Prayer | INSTANT | decided when it lands |
| Vampiric Touch, Halo, Voidform | CAST_TIME | a cast time above zero: no -100% cast-time row of the family matches them |
| Mind Blast, Void Blast | CAST_TIME | nothing: Shadowy Insight is a -100% row matching each, and no pinned source excludes it, on any build |
| Mind Flay, Mind Flay: Insanity, Void Torrent | CHANNEL | decided at its cast; its span is possible, never proven, with no bound claimed |
| everything else | not reviewed | `EXECUTION_NOT_REVIEWED`, and occupancy around it stays UNKNOWN |

The rows are hand-reviewed readings of the pinned `_cast_time` and of every cast-time effect of the family matching each spell (`priest-shadow-cast-semantics.ts`). No haste is established, so `exactMs` is always null and no anchor is ever derived from a completion.

**A begin does not prove the moment of a cast that may have been instant.** That is the shared timeline's own rule since ONB-D2: both instants stay candidates, and the anchor is UNKNOWN.

**What it changes:**

- **The decision's times are the anchor's.** Its `position` and `locator` stay the completion's, because the completion is the observation that names the action.
- **No anchor, no verdict.** An UNKNOWN anchor makes the comparison UNKNOWN (`DECISION_ANCHOR_NOT_ESTABLISHED`, class `OBSERVED_STATE_MISSING`) whatever the scan says. The scan still runs, and its diagnostics stay attached.
- **Nothing read at a completion is called the decision's state.** Every binding is fixed for the fight. That is why Insanity stays unbound, even though the wire reports it on a cast.

## What is bound, and from what

| Atom | Source | Rule |
| --- | --- | --- |
| `talent.<x>` | the three-way rule; another hero tree's talents are FALSE on a resolved tree | absent from the tree is UNKNOWN |
| `insanity.deficit`, `active_enemies`, `spell_targets.*`, `active_dot.*`, `dot.*`, `buff.*`, `cooldown.*`, `target.health.pct`, `health.pct`, `pet.*`, `action.*`, `raid_event.*`, `priest.*`, `gcd.max`, `time_to_bloodlust`, `fight_remains`, `target.time_to_die` | none | unbound or UNKNOWN_NUMBER, stated as such |

## Why no decision resolves

| Stops at | Why |
| --- | --- |
| `default[1] call_action_list,name=aoe,if=active_enemies>2` | open on the enemy count (ONB-S3). The area lists hold only variables, so the scan goes on, and they leave `dots_up`, `max_vts` and `is_vt_possible` unsettled |
| `main[1] call_action_list,name=cds` | its gate reads `fight_remains`, `target.time_to_die`, `active_enemies` and two variables. The engine's own refusal is `cds[7] power_infusion`, off the GCD with no reviewed contract |
| `main[3] shadow_word_madness,target_if=max:...` | where the root scan stops on all but 8 decisions. Its `target_if` scores enemies this project does not enumerate |

## The evidence

Two retained subjects, replayed offline through production ingestion, both Archon: gtKb2xHn87pNcFfW fight 22 actor 29, whole fight; rXAfw9t1q8YpmkKD fight 13 actor 40, first 165 s. 356 decisions, all UNKNOWN, none committed (agent/architecture.md "ONB-D2"). Mind Flay and Insanity log as `cast` with no begin, which corroborates the channel reading. Shadowy Apparition logs 339 casts and is no press: it has no token and is excluded.

## Not evaluated, deliberately

Voidweaver has no retained subject, and none casts Vampiric Touch, Void Torrent or Void Blast, so those lines are unmeasured. Insanity, auras, DoTs, cooldowns, the enemy count, targets' health, pets and haste are not modelled. See `agent/follow-ups.md` "After ONB-D2".
