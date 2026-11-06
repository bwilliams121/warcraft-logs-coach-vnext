# Enhancement Shaman — observed-decision slice (ONB-B2)

**Exposure: `INTERNAL_ONLY`.** The registration (`shaman-enhancement-observed-decisions`, `shaman/enhancement`) is in the production
catalog for the internal lookup only. The public lookup and the identity table refuse it.

**Not promoted by ONB-B2P.** It cannot pass the rotational gates: its only subject refuses for want of combatant info (ONB-EV), and its list also waits on ONB-S3 (agent/architecture.md "ONB-B2P").

**ONB-S3R (2026-11-06): still refuses. Its one retained subject has no combatant info, so its gap stays on ONB-EV.** (agent/architecture.md "ONB-S3R").

**A Cohort B follower of Arms' pattern, and it resolves nothing today.** No decision of this
specialization reaches MATCH or REJECTED on the shared engine as it stands. Every decision is observed,
classified and explained, and stays UNKNOWN. That is a measured property of the pinned list and the
missing inputs below, not a claim about any player.

## The authority

`SIMC_APL_SHAMAN_ENHANCEMENT` (`simc-33622e9d-1`), the `shaman_t::init_action_list_enhancement` region of `sc_shaman.cpp`, governs
OFFENSIVE_ROTATION only. Resource spending, defensive cooldowns and interrupts are declared and resolve
`NO_PINNED_AUTHORITY_FOR_DOMAIN`. Active mitigation and self healing are not declared.

## The decision population

Every COMPLETE cast by the actor, classified by pinned data:

| Cast | Classification |
| --- | --- |
| Warcraft Logs `melee` flag | excluded `MELEE_SWING` |
| pinned lane NON_GCD | excluded `NON_GCD_ACTION` |
| no pinned lane record (anything the pinned list does not name, a potion, an item) | excluded `EXECUTION_LANE_NOT_ESTABLISHED` |
| `lightning_bolt`, `chain_lightning`, `tempest` | excluded `OUTSIDE_FIRST_SLICE`: channelled, so decided at its start, and this facade evaluates state at the `cast` |
| every other GCD token | eligible -> first-GCD query -> comparison |

## What is bound, and from what

| Atom | Source | Rule |
| --- | --- | --- |

| `talent.<x>`, `talent.<x>.enabled` | the three-way rule; another hero tree's talents are FALSE on a resolved tree | absent from the tree is UNKNOWN |
| `active_enemies` | the shared enemy set at the decision (`withEnemyCountAt`, ONB-S3) | a proven lower bound, or UNKNOWN. No event proves an upper bound, and no position means no reading |
| `buff.*`, `debuff.*`, `cooldown.*`, simulation options | none | unbound or UNKNOWN_NUMBER, stated as such |
| `line_cd=600` on `bloodlust` | the shared cast attribution | a logged 2825 attributes to its sole entry; a timer read from a log is UNKNOWN |

## Why no decision resolves

| Stops at | Why |
| --- | --- |
| `default[4] bloodlust,line_cd=600` | the engine's first refusal: off-GCD, no reviewed contract, and the line's timer is UNKNOWN from any log |
| `default[6]` (Stormbringer) or `default[7]` (Totemic) `call_action_list` | where each root scan stops: the enemy count (ONB-S3). `talent.surging_totem` picks the list; the count stays open |

ONB-S3 gives the count a proven lower bound and no upper bound. Every action outside `default` sits behind those gates.

## The evidence

**No real-evidence validation exists.** A census of every retained and committed event file finds one subject: actor 7 of the filtered M13-A capture (Gw2kXrTfLWcDdhFY fight 1), 134 casts and 31 begincasts, with no combatant info, auras or resources. So it refuses as `PROFILE_NOT_RESOLVED`, and the gap is on ONB-EV. The talent `id` and `nodeID` claim is not corroborated for this specialization.

**What that capture does show**, which the bindings rest on:

- **Doom Winds is logged as its damage child.** Ten of 469270 in 151 s cannot be a 90 s press: it is `doom_winds_damage` (sc_shaman.cpp:8785), triggered by effect row 1183511 of 384352. It is not bound.
- **Lightning Bolt and Tempest have begincasts** (23 and 8), so each is excluded as `OUTSIDE_FIRST_SLICE`, and Chain Lightning with them.
- **Never observed:** Flame Shock, Bloodlust, Heroism, Sundering, Surging Totem and Primordial Storm. Their ids are readings of the pinned module, unchecked against any wire.

**The list itself.** It is a class method, not a marked region. Its opening guard returns before any list exists for an actor with no main-hand weapon, and `add_action( this, ... )` emits only under the player's spell data. So Wind Shear's line does not exist at this pin: the spell is talent-only, with no class or specialization row. Both are recorded in the artifact's provenance.

## Not evaluated, deliberately

Auras (no wire identity is corroborated), cooldowns (no pin is checked against real gaps), resources between
casts, the target's health and casts, movement. See `agent/follow-ups.md` "After ONB-B2".
