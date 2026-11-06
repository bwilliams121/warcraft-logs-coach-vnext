# Subtlety Rogue — observed-decision slice (ONB-A2)

**Exposure: `INTERNAL_ONLY`.** The registration (`rogue-subtlety-observed-decisions`, `rogue/subtlety`) is in the production
catalog for the internal lookup only. The public lookup and the identity table refuse it.

**ONB-S3R (2026-11-06): still refuses. Its one retained subject has no combatant info, so its gap stays on ONB-EV, and its list reads `spell_targets`, which no action registers.** (agent/architecture.md "ONB-S3R").

**A Cohort A follower of Havoc's pattern, and it resolves nothing today.** No decision of this
specialization reaches MATCH or REJECTED on the shared engine as it stands. Every decision is observed,
classified and explained, and stays UNKNOWN. That is a measured property of the pinned list and the
missing inputs below, not a claim about any player.

## The authority

`SIMC_APL_ROGUE_SUBTLETY` (`simc-33622e9d-1`), the `//subtlety_apl_start .. _end` region of `apl_rogue.cpp`, governs
OFFENSIVE_ROTATION only. Resource spending, defensive cooldowns and interrupts are declared and resolve
`NO_PINNED_AUTHORITY_FOR_DOMAIN`. Active mitigation and self healing are not declared.

## The decision population

Every COMPLETE cast by the actor, classified by pinned data:

| Cast | Classification |
| --- | --- |
| Warcraft Logs `melee` flag | excluded `MELEE_SWING` |
| pinned lane NON_GCD | excluded `NON_GCD_ACTION` |
| no pinned lane record (anything the pinned list does not name, a potion, an item) | excluded `EXECUTION_LANE_NOT_ESTABLISHED` |
| every other GCD token | eligible -> first-GCD query -> comparison |

## What is bound, and from what

| Atom | Source | Rule |
| --- | --- | --- |
| `energy` | the decision cast's own PRE_COST | EXACT on a costed cast; unknown on a free one. Never replayed |
| `energy.deficit` | the decision cast's own PRE_COST | EXACT on a costed cast; unknown on a free one. Never replayed |
| `combo_points`, `combo_points.deficit` | the decision cast's own PRE_COST | the same |
| `talent.<x>` | the three-way rule; another hero tree's talents are FALSE on a resolved tree | absent from the tree is UNKNOWN |
| `buff.*`, `debuff.*`, `cooldown.*`, the enemy count, simulation options | none | unbound or UNKNOWN_NUMBER, stated as such |

## Why no decision resolves

| Stops at | Why |
| --- | --- |
| `default[5] stealth` | the first stop of every decision: unconditional, off the GCD, and no reviewed transition contract, so the query refuses here (`TRANSITION_UNSUPPORTED`). Stealth writes the very state `variable.stealth` reads, so it cannot be contracted away without a Stealth reading |
| `cds[0] goremaws_bite` | a GCD action with no derived cooldown, gated on `fight_remains`, which is predictive |
| `cds[1..6]` | Shadow Blades, Shadow Dance and Vanish are off the GCD with no reviewed transition contract |
| `default[9..11]` | `variable.build_at_max_for_apex` reads `talent.ancient_arts_3`, an unpinned tier of one node, and `variable.targets` reads the enemy count |
| `finish`, `build` | their gates and entries read `variable.targets`, `buff.*` (no aura identity is pinned) and `cp_max_spend` |
| `fill[1]` | `arcane_pulse` is a racial the shared non-domain table does not list, so an entry reaching it refuses |

ONB-S3 does not settle this list's count: it reads `spell_targets`, and no action registers one. It is the widest blocker below the first stop, not the only one: `finish[0]` and `build[0]` could decide without it once their auras are bound.

## The evidence

**No real-evidence validation exists.** The retained captures were censused (`friendlySpecs` aligned to
`friendlyPlayers`, then events by actor):

- M13-A `Gw2kXrTfLWcDdhFY` fight 1, actor 17: a filtered capture holding 150 of its casts over a 151 s wipe, with no combatantinfo, aura or resource events, so its talents never resolve and the facade refuses it PROFILE_NOT_RESOLVED.
- G2 cohort261 fight 31, actor 70: context only; the retained pages hold no event sourced by or landing on it.
- m11c4f context-1 `2xptYq89Tb631Hmg` fight 17, actor 3: context only.

The gap is on ONB-EV. Everything here is proven on synthetic fights and on the pinned data.

**Unmeasured wire hazards**, each a known failure mode from Havoc: a logged cast that is not a press, a cast's
own aura effect placed before the cast, a pinned cooldown the wire contradicts. Secret Technique and Goremaw's Bite execute secondary attacks and shadow clones (`active.shadow_clone_attack.*`, sc_rogue.cpp:10496-10512), and Coup de Grace's `active.scoundrel_strike` is the same shape. Whether any logs under a token's own id is unmeasured. Measure these
before binding anything that could resolve a decision.

## Not evaluated, deliberately

Auras (no wire identity is corroborated), cooldowns (no pin is checked against real gaps), resources between
casts, the enemy count, the target's health and casts, movement. See `agent/follow-ups.md` "After ONB-A2".
