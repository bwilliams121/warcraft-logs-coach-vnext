# Demonology Warlock — observed-decision slice (ONB-X4)

**Exposure: `INTERNAL_ONLY`.** The registration (`warlock-demonology-observed-decisions`, `warlock/demonology`) is in the production
catalog for the internal lookup only. The public lookup and the identity table refuse it.

**Its own representative on the shared cast anchor (ONB-S4), and the first consumer of the shared pet mapping (ONB-S6). It resolves nothing today.** All 1,391 eligible decisions of its seven retained subjects stay UNKNOWN. That is a property of the pinned list and the missing inputs below, not a claim about any player.

**Not promoted by ONB-X4P.** It cannot pass the rotational gates: all 1,391 decisions stay UNKNOWN. It waits on `buff.dominion_of_argus.up`, Summon Doomguard's lone node and the inputs behind them (agent/architecture.md "ONB-X4P").

## The authority

`SIMC_APL_WARLOCK_DEMONOLOGY` (`simc-33622e9d-1`), the `//demonology_apl_start .. _end` region of `apl/warlock.cpp`, with no PTR region, governs
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
| Implosion, Power Siphon, Grimoire: Imp Lord, Grimoire: Fel Ravager, Summon Doomguard | INSTANT | decided when it lands |
| Summon Demonic Tyrant | CAST_TIME | a cast time above zero: no -100% cast-time row of the family matches it, and Master Summoner's flat -500 ms does not reach its base |
| Shadow Bolt, Hand of Gul'dan, Demonbolt, Ruination, Infernal Bolt | CAST_TIME | nothing: a -100% row matches each, and this slice does not narrow them on any build |
| Call Dreadstalkers | CAST_TIME | nothing: the data says about a second and no retained press shows a gap, so neither is claimed |
| everything else | not reviewed | `EXECUTION_NOT_REVIEWED`, and occupancy around it stays UNKNOWN |

No haste is established, so `exactMs` is always null and no anchor is ever derived from a completion. A begin does not prove the moment of a cast that may have been instant. A begin in the completion's own millisecond may be this press's or the next one's, so it proves none either: that is the shared timeline's rule, and why 1,245 of the 1,391 retained decisions have no established anchor.

## What is bound, and from what

| Atom | Source | Rule |
| --- | --- | --- |
| `talent.<x>` | the three-way rule; another hero tree's talents are FALSE on a resolved tree | absent from the tree is UNKNOWN |
| `talent.to_hell_and_back.enabled` | the same answer | an unresolved talent binds nothing |
| `pet.demonic_tyrant.active` | shared pet presence, at the anchor | an undecided presence binds nothing, so the truth is enumerated |
| `buff.wild_imps.stack` | shared pet count, at the anchor | a stack binding, explicit even when unknown, and never zero by default |
| `active_enemies` | the shared enemy set at the decision (`withEnemyCountAt`, ONB-S3) | a proven lower bound, or UNKNOWN. No event proves an upper bound, and no position means no reading |
| `soul_shard`, `gcd.max`, every other `buff.*` and `debuff.*`, `cooldown.*`, `fight_remains` | none | unbound or UNKNOWN_NUMBER, stated as such |

## The pets (ONB-S6)

`warlock-demonology-pet-semantics.ts` holds the first reviewed pet rows of the project, and `pet-profile.ts` says which atom each answer feeds.

| Entity | gameIDs | Floor | Ceiling | Why |
| --- | --- | --- | --- | --- |
| `demonic_tyrant` | 135002, 250289 | none | none | the spawn adds a distribution to the 15,000 ms duration, nothing proves an encounter cannot kill one, and delayed damage means its last event bounds nothing |
| `wild_imps` | 55659, 143622 | none | 40,000 ms | an imp ends early by Implosion, Power Siphon or energy; the spawner takes its spell's duration and is never rescheduled |

So the Tyrant is never PRESENT and never NOT_PRESENT, and the imp count is a ceiling at best. On a synthetic fight with every owner stated, a ceiling below six proves `buff.wild_imps.stack>=6` false. **On every retained fight the answers are UNKNOWN**, because each fight's catalog holds an actor of each mapped gameID with no stated owner, and the shared state refuses absence and ceilings then (`OWNERSHIP_NOT_STATED`). A reading is taken at the anchor or not at all, and no later event changes it.

**A summon is not a setup verdict.** `tyrant-setup` stays a recorded question: nothing reads what a Tyrant empowered, and a press of it is observed, not scored.

## Why no decision resolves

| Stops at | Why |
| --- | --- |
| the anchor, on 1,245 decisions | possibly-instant casts, above |
| `diabolist[1] hand_of_guldan`, on the other 146 | where the engine refuses: `buff.dominion_of_argus.up` has no aura binding, and the line is on the GCD, so nothing may fall through it |
| `diabolist[4] summon_doomguard` | where the root scan stops on 1,372 decisions: its talent is a lone node the tree does not resolve |
| `default[4] call_action_list` | where the root scan stops on the 19 Grimoire: Imp Lord presses: the press proves itself, and still competes with the open Hand of Gul'dan |
| the rest of the list | Soul Shards, Demonic Core, the Tyrant's cooldown, the enemy count, and `target_if` on Demonbolt |

ONB-S3 alone moves nothing: every stop above comes first. No retained subject is Soul Harvester, so that list is read on synthetic builds only.

## The evidence

Seven retained Diabolist subjects, each replayed offline through production ingestion: b1PmaKrd6CDfzngc fight 48 actors 11 and 14, gtKb2xHn87pNcFfW fight 22 actors 3, 7 and 10, whole fights, and rXAfw9t1q8YpmkKD fight 13 actors 6 and 22, first 165 s. Their events are uncommitted (agent/architecture.md "ONB-X4").

## Not evaluated, deliberately

Soul Shards, auras, cooldowns, haste, Tyrant setup and Ritual Clipping (`UNRESOLVED_DIABOLIST_HERO_TREE`, as recorded). See `agent/follow-ups.md` "After ONB-X4".
