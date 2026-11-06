# Frost Mage — observed-decision slice (ONB-D3)

**Exposure: `INTERNAL_ONLY`.** The registration (`mage-frost-observed-decisions`, `mage/frost`) is in the production
catalog for the internal lookup only. The public lookup and the identity table refuse it.

**Not promoted by ONB-D3P.** It cannot pass the rotational gates, and it waits on a real subject (ONB-EV), then how the `interrupt_if` option is read and the inputs behind it (agent/architecture.md "ONB-D3P").

**A Cohort D follower on the shared cast anchor (ONB-S4), with no real subject. It resolves nothing today.** No retained Frost Mage subject has combatant info, so nothing here has met real evidence. On the synthetic builds in its tests every decision stays UNKNOWN. That is a property of the pinned list and the missing inputs below, not a claim about any player.

## The authority

`SIMC_APL_MAGE_FROST` (`simc-33622e9d-1`), the `//frost_apl_start .. _end` region of `apl/mage.cpp`, with no PTR region, governs
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
| Ice Lance, Flurry, Frozen Orb, Comet Storm, Cone of Cold, Ice Nova | INSTANT | decided when it lands |
| Frostbolt 116, Glacial Spike | CAST_TIME | a cast time above zero: no -100% cast-time row of the family matches them |
| Frostfire Bolt 431044, Blizzard | CAST_TIME | nothing: Frostfire Empowerment and Freezing Rain are -100% rows matching them, and this slice does not narrow them on any build |
| Ray of Frost | CHANNEL | decided at its cast; its span is possible, never proven, with no bound claimed |
| everything else | not reviewed | `EXECUTION_NOT_REVIEWED`, and occupancy around it stays UNKNOWN |

The rows are hand-reviewed readings of the pinned `_cast_time` and of every cast-time effect of the family matching each spell (`mage-frost-cast-semantics.ts`). No haste is established, so `exactMs` is always null and no anchor is ever derived from a completion.

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
| `buff.*`, `debuff.*`, `cooldown.*`, `cooldown_react`, `charges`, `prev_gcd.*`, `time`, `set_bonus.*`, `movement.distance`, `fight_remains` | none | unbound or UNKNOWN_NUMBER, stated as such |

## Why no decision resolves

| Stops at | Why |
| --- | --- |
| `cds[17] ray_of_frost` (Frostfire) | the options `interrupt_if`, `interrupt_global` and `interrupt_immediate`, which no one reads. Synthetic |
| `cds[20]` to `[22]`, then `cds[23] ray_of_frost` (Spellslinger) | open behind `line_cd=9999`, then the same options. Synthetic |
| the rotation lists | past those, Brain Freeze, Fingers of Frost, Icicles, Freezing and the enemy count |

## The evidence

None usable, so Frost is on ONB-EV. Its only real casts are the filtered M13-A capture's actor 6 (103 casts, no combatant info, so it would refuse) and one cast in a two-second page. The census's other Frost hits are Frost Death Knights and Mirror Image pets (agent/architecture.md "ONB-D3"). Every stop above comes from a synthetic build, and the talent keys are uncorroborated on real evidence.

## Not evaluated, deliberately

Every row is unmeasured. Mana, auras, cooldowns, charges, the enemy count and haste are not modelled. `talent.hand_of_frost_4` names a tier the pinned module and talent data do not hold. See `agent/follow-ups.md` "After ONB-D3".
