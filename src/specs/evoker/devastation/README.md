# Devastation Evoker — observed-decision slice (ONB-X2)

**Exposure: `INTERNAL_ONLY`.** The registration (`evoker-devastation-observed-decisions`, `evoker/devastation`) is in the production
catalog for the internal lookup only. The public lookup and the identity table refuse it.

**Its own representative on the shared cast anchor (ONB-S4). It resolves nothing today.** No decision of this
specialization reaches MATCH or REJECTED on the shared engine as it stands. Every decision is observed, anchored where the evidence allows,
classified and explained, and stays UNKNOWN. That is a measured property of the pinned list and the missing inputs below, not a claim about any player.

## The authority

`SIMC_APL_EVOKER_DEVASTATION` (`simc-33622e9d-1`), the `//devastation_apl_start .. _end` region of `apl/apl_evoker.cpp`, whose PTR region is an empty stub never dispatched, governs
OFFENSIVE_ROTATION only. Resource spending, defensive cooldowns and interrupts are declared and resolve
`NO_PINNED_AUTHORITY_FOR_DOMAIN`. Active mitigation and self healing are not declared.

The roster role stays `UNKNOWN`, as pinned. It is treated as a DPS by the declared M11 classification, and the role is never guessed.

## The decision population

Every COMPLETE cast by the actor, classified by pinned data:

| Cast | Classification |
| --- | --- |
| Warcraft Logs `melee` flag | excluded `MELEE_SWING` |
| pinned lane NON_GCD: Hover, Quell, Tip the Scales | excluded `NON_GCD_ACTION` |
| no pinned lane record (anything the pinned list does not name) | excluded `EXECUTION_LANE_NOT_ESTABLISHED` |
| every other GCD token | eligible -> anchor -> first-GCD query -> comparison |

A begin that never completes is not a decision, and neither is any instant with no cast, or an empower envelope. Nothing builds a missed-action opportunity, in or out of a cast. Unpaired begins are counted in the coverage (`unpairedBegins`) and never judged.

## The anchor (ONB-S4)

A cast-time action is decided when it begins, and a channel when it starts. `cast-anchor-profile.ts` supplies the shared timeline with what this specialization can prove:

| Ability | Execution | What it proves |
| --- | --- | --- |
| Azure Strike, Azure Sweep, Dragonrage, Emerald Blossom, Hover, Pyre, Quell, Tip the Scales, Unbound Flame, Verdant Embrace | INSTANT | decided when it lands |
| Disintegrate, Deep Breath | CHANNEL | decided at the `cast`, its start. The end is not observed, so a span is possible, never proven |
| Fire Breath, Eternity Surge | CHANNEL, by the `EMPOWERED` rule | decided at the `cast`, whether held or made instant |
| Living Flame | CAST_TIME | nothing: Burnout and Lifespark are -100% rows matching it, and this slice narrows none |
| everything else | not reviewed | `EXECUTION_NOT_REVIEWED`, and occupancy around it stays UNKNOWN |

The rows are hand-reviewed readings of the pinned `_cast_time`, each constructor for a channel, and every cast-time effect of the family matching each spell (`evoker-devastation-cast-semantics.ts`). No haste is established, so `exactMs` is always null and no anchor is ever derived from a completion.

**A begin does not prove the moment of a cast that may have been instant.** That is the shared timeline's own rule: both instants stay candidates, and the anchor is UNKNOWN. Living Flame shows why: its median gap from begin to completion is 0 ms on every retained subject.

**What it changes:**

- **The decision's times are the anchor's.** Its `position` and `locator` stay the completion's, because the completion is the observation that names the action.
- **No anchor, no verdict.** An UNKNOWN anchor makes the comparison UNKNOWN (`DECISION_ANCHOR_NOT_ESTABLISHED`, class `OBSERVED_STATE_MISSING`) whatever the scan says. The scan still runs, and its diagnostics stay attached.
- **Nothing read at a completion is called the decision's state.** Every binding is fixed for the fight. The list reads no Essence or Mana here.

## Empowered spells

`empowered_charge_t` sets `channeled = true` (sc_evoker.cpp:3519), and the wire agrees on all three subjects:

| Observation | When |
| --- | --- |
| `empowerstart` | the start |
| `cast` | the same millisecond, or one later |
| `empowerend`, with `empowermentLevel` | the release, 485 to 2,340 ms later |
| `cast` alone | a Tip the Scales press |

So the `cast` is the start, and the shared CHANNEL kind already says that of a channel. The hold does not move the moment of the decision, so no empowered kind exists. The envelopes stay envelope-only.

**The rank is a separate question, and it stays open.** Every `empower_to` line refuses, because the option is unsupported, and nothing reads `empowermentLevel`. So no decision here says anything about a rank. See `agent/follow-ups.md` "After ONB-X2".

## What is bound, and from what

| Atom | Source | Rule |
| --- | --- | --- |
| `talent.<x>` | the three-way rule; another hero tree's talents are FALSE on a resolved tree | absent from the tree is UNKNOWN |
| `active_enemies`, `active_dot.*`, `buff.*`, `dot.*`, `cooldown.*`, `action.*`, `raid_event.*`, `set_bonus.*`, `gcd.*`, `target.*`, `execute_time`, `talent.volatility.rank`, `fight_remains` | none | unbound or UNKNOWN_NUMBER, stated as such |

## Applicability

`dragonrage`, `eternity_surge`, `pyre`, `quell`, `tip_the_scales` and `verdant_embrace` are built on their talents, so each is background with its talent proven absent, and UNKNOWN with it unresolved. Everything else has no guard: the class spells, Emerald Blossom's literal spell, and Azure Sweep and Unbound Flame, whose `ready()` asks for a buff, which is a usability claim this slice does not make. Deep Breath and Disintegrate fall to `not_found()` only on Augmentation's talents.

## Why no decision resolves

| Stops at | Why |
| --- | --- |
| `default[6] quell`, in the engine | off the GCD with no contract, on `target.debuff.casting.react`, an enemy cast nothing reads |
| `sc[0] deep_breath`, in the root scan, Scalecommander | its `cancel_if` is an unsupported option, and it reads `buff.strafing_run.remains` and `gcd.max` |
| `fs[0] fire_breath`, in the root scan, Flameshaper | `target_if` and `empower_to`. Synthetic |
| `default[8] run_action_list`, no hero entry | `talent.mass_disintegrate` is unresolved. Synthetic |

351 decisions are anchored and stop there; the other 89 have no anchor, so the scan's answer is not read either.

**Not promoted yet.** ONB-X2P makes that decision.

## The evidence

Three retained subjects, replayed offline through production ingestion, all Scalecommander: A7R6kxPJ1hC8YQ4w fight 7 actor 11, first 165 s, 89 decisions; b1PmaKrd6CDfzngc fight 48 actor 16, whole fight, 191; gtKb2xHn87pNcFfW fight 22 actor 33, whole fight in three captures, 160. All 440 are UNKNOWN, none committed (agent/architecture.md "ONB-X2").

## Not evaluated, deliberately

No Flameshaper subject is retained, so `fs`, `fb` and `legacy_of_the_lifebinder` are unmeasured. Ranks, off-GCD Hover, Quell and Tip the Scales decisions, Essence, Mana, auras, cooldowns, charges, target health, the enemy count, simulation raid events and haste are not modelled. See `agent/follow-ups.md` "After ONB-X2".
