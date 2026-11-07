# Guardian Druid — observed-decision slice (ONB-T2)

**Exposure: `INTERNAL_ONLY`.** The registration (`druid-guardian-observed-decisions`, `druid/guardian`) is in the production catalog for the internal lookup only. The public lookup and the identity table refuse it.

**A Cohort T follower with no retained subject. It resolves nothing today.** The only real Guardian events anywhere are two seconds of gBMCKxyY7dQDRZav fight 33 actor 91 in a diagnostic sample: its combatant info, one cast off the list, one Mangle resource change and one Red Moon damage row. So every stop below comes from a synthetic build, and it is on ONB-EV. That is a property of the evidence and the pinned list, not a claim about any player.

**Not promoted by ONB-T2P.** It cannot pass the rotational gates: it has no real resolved decision and no retained subject. It waits on a capture, which is ONB-EV's owner decision, and then on the inputs in agent/follow-ups.md "After ONB-T2" (agent/architecture.md "ONB-T2P").

## The authority

`SIMC_APL_DRUID_GUARDIAN` (`simc-33622e9d-1`), `apl/druid/guardian_apl.inc`, governs OFFENSIVE_ROTATION only. The PTR list is a separate include this repository does not hold, and the dispatch chooses by `is_ptr()`.

**A tank's meaning stays out of it.** Resource spending, active mitigation (Ironfur), defensive cooldowns (Barkskin), self healing (Frenzied Regeneration) and interrupts are declared and resolve `NO_PINNED_AUTHORITY_FOR_DOMAIN`. The list presses Ironfur on Rage and Barkskin in Bear Form for simulated damage, and says nothing about what this tank needed in this fight. A logged Ironfur or Barkskin is excluded as off-GCD and never judged, and each one's line only ever stops a scan. A Mangle or a Maul is a rotational press and nothing more.

## The decision population

Every COMPLETE cast by the actor, classified by pinned data:

| Cast | Classification |
| --- | --- |
| Warcraft Logs `melee` flag | excluded `MELEE_SWING` |
| pinned lane NON_GCD | excluded `NON_GCD_ACTION` |
| no pinned lane record (anything the pinned list does not name) | excluded `EXECUTION_LANE_NOT_ESTABLISHED` |
| every other GCD token | eligible -> anchor -> first-GCD query -> comparison |

A begin that never completes is not a decision, and neither is any instant with no cast. Nothing builds a missed-action opportunity.

## The anchor (ONB-S4)

| Ability | Execution | What a completion proves |
| --- | --- | --- |
| Mangle, Thrash, Maul, Raze, Swipe, Moonfire, Red Moon, the forms, Rake, Rip, Shred, Ferocious Bite, Lunar Beam, Bristling Fur, Sundering Roar, and the off-GCD Ironfur, Barkskin, Berserk, Incarnation and Heart of the Wild | INSTANT | decided when it lands |
| Convoke the Spirits | CHANNEL | decided at its cast; its span is possible, never proven, with no bound claimed |
| everything else | not reviewed | `EXECUTION_NOT_REVIEWED`, and occupancy around it stays UNKNOWN |

No haste is established, so `exactMs` is always null and no anchor is ever derived from a completion. An UNKNOWN anchor makes the comparison UNKNOWN (`DECISION_ANCHOR_NOT_ESTABLISHED`) whatever the scan says.

No press of this list has a positive cast time.

## What is bound, and from what

| Atom | Source | Rule |
| --- | --- | --- |
| `talent.<x>`, `talent.<x>.enabled` | the three-way rule; another hero tree's talents are FALSE on a resolved tree | absent from the tree is UNKNOWN, and an unresolved `.enabled` has no row |
| `active_enemies` | the shared enemy set at the decision, then the pinned SimC profile (`withEncounterStateAt`, SIMC-FB-R) | a proven lower bound. Where nothing contradicts it on a proven build, the profile's 1, disclosed as SimC-profile-relative. Otherwise UNKNOWN, and no position means no reading |
| `rage`, `talent.flashing_claws.rank`, `buff.*`, `cooldown.*`, `dot.*`, `gcd`, `set_bonus.*`, `target.cooldown.pause_action.remains` | none | unbound or UNKNOWN_NUMBER, stated as such |

## Why no decision resolves

| Stops at | Why |
| --- | --- |
| `default[0] auto_attack` | the engine's refusal: off the GCD, with no reviewed contract. Synthetic |
| `cooldowns[6] bristling_fur`, `[7] barkskin`, `[8] lunar_beam` | open candidates behind it, on Rage, cooldowns and the off-GCD Barkskin. Synthetic |
| `cooldowns[9] heart_of_the_wild` | where the root scan stops: its talent is not resolved on the tree under test, and a lone-node talent absent is UNKNOWN. Synthetic |
| the `bear` list | no scan reaches it. Rage, forms, auras and `target_if` follow, and `active_enemies` only after them, so ONB-S3 alone moves nothing |

**Constructor readings.** `berserk` builds Incarnation or Berserk and `maul` builds Raze or Maul, so each is applicable with either talent, background with both proven not taken, and UNKNOWN otherwise. Moonkin Form's talent is the class-wide trait row `find_talent_spell` takes, and both its spell rows are bound. `swipe_bear` binds the bear row. `wild_guardian` has no binding, because no retained cast names the id it logs, so its lane is a refusal.

## Not evaluated, deliberately

Every row is unmeasured against a resolved build. Rage, auras, forms, cooldowns, DoTs, the enemy count and haste are not modelled. See `agent/follow-ups.md` "After ONB-T2".

## The pinned SimC profile (SIMC-FB-R)

Every decision reads encounter state through `withEncounterStateAt`: real evidence first, then the pinned profile's environment, on a build the deploy calendar proves. The result says what the priority would select under the profile, never what the real encounter held. Each decision's `profileFacts` go into the view as `simcProfileFacts`, so it is disclosed. It makes nothing actionable. The measured results are in `agent/architecture.md` "SIMC-FB-R".

`target_if`: attested for `thrash` (`sole-target-attestations.ts`). An unattested line reads as it did before.
