# Discipline Priest (HEAL-B3, INTERNAL_ONLY)

A healer specialization evaluator on the healer architecture Restoration
Shaman proved (M12-D, HEAL-A) and HEAL-B1 repeated, and its own
representative: Discipline heals substantially through damage (Atonement), a
pattern the shared healing primitives do not represent. Registered
INTERNAL_ONLY in HEAL-B3; its public shape and promotion are HEAL-B3P's. It is
not an APL specialization: there is no SimulationCraft authority and no APL
artifact.

## Registration

- Three provider-less families, declared from
  `DISCIPLINE_PRIEST_REQUIRED_INPUTS`: COOLDOWN_ASSIGNMENT, HEALING_COOLDOWN,
  HEALING_DECISION. Each resolves `NO_PINNED_AUTHORITY_FOR_DOMAIN`; nothing is
  bound. The derived requirement is FULL_RAID. The categories are the healer
  set plus AURAS: the Atonement buff is an aura on an ally.
- The plan is read from `SpecAnalysisInput.raidCooldownPlan`; absent is no
  plan.
- The result is never ANALYZED: `AUTHORITY_NOT_AVAILABLE` when the evaluator
  ran, `INSUFFICIENT_EVIDENCE` when the identity is not established or either
  pinned dataset is unusable. The payload carries the evaluation and its
  healer finding set (the shared `src/findings/healer-finding-projection.ts`),
  or why no set was built. No healer view and no public prose.

## Supported decision surface (v1)

The M12-D verdict-category limits, unchanged:

| Category | Authority | Outcomes |
| --- | --- | --- |
| ASSIGNMENT | a supplied raid cooldown plan (`USER_PROVIDED_RAID_PLAN`, M12-E) | `NO_AUTHORITY_AVAILABLE` without a plan or for a plan bound to another encounter or difficulty; `UNKNOWN` when the binding cannot be established; per entry for this player `ASSIGNMENT_MET`, `ASSIGNMENT_NOT_ACTIONABLE`, `ASSIGNMENT_UNKNOWN` |
| COOLDOWN | `WCL_OBSERVED_FACT` | the identified healing cooldowns the player cast, and overlapping damage episodes with the player's healing in them; no verdict |
| HEALING_DECISION | none | always `NO_AUTHORITY_AVAILABLE`, including every Atonement judgement |

- No cast in a COMPLETE-covered window is `READINESS_NOT_ESTABLISHED`. MISSED,
  EARLY and LATE are not reachable.
- Pain Suppression (an external), Shadowfiend and Mindbender (pet summons),
  Archangel and the hero-tree spells are not identified healing cooldowns: an
  assignment naming one is `ABILITY_NOT_REGISTERED`, never judged.

## Atonement (observed facts, not a decision category)

`./atonement.ts`, attached to the evaluation as `atonement`, never a finding:

- **Applications**: every `applybuff` / `refreshbuff` of the Atonement buff
  (194384) whose reported source is the player or a stated pet, inside the
  encounter, with its locator, and a count per target. Stack changes
  (`applybuffstack`) are not applications. Removals are not
  listed and no active interval, uptime or concurrent-target count is claimed.
- **Healing as reported**: every `heal` of the Atonement heal (81751) from the
  same sources, with its locator, and a count per target. Counts only: no
  amount, total, HPS or overhealing.
- **Damage link**: which damage produced which heal is not reported by
  Warcraft Logs, so it is always `UNKNOWN` (`DAMAGE_EVENT_LINK_NOT_REPORTED`)
  and never reconstructed from timestamps.
- Each list is COMPLETE only under actor-global coverage of its category over
  the whole encounter, with no sourceless event of the identified id, no
  ability-less event of the same family from the player, and no event of a
  pinned same-name, unreviewed id from the player. Otherwise it is UNKNOWN
  with the reason and the counts, and the observed events are kept.

## Runtime data

- `src/data/game/priest-discipline-healing-cooldowns.{json,ts}`: verbatim
  specialization-tree rows of the pinned SimulationCraft `trait_data.inc`
  (commit 33622e9d, client data 12.1.0.69587), class 5, spec 256. Power Word:
  Barrier (62618) and Ultimate Penitence (421453, a channel: its use is the
  cast, once) share choice node 82564; Evangelism (472433) has a node of its
  own. Identity only.
- `src/data/game/priest-discipline-atonement.{json,ts}`: every
  `sc_spell_data.inc` row named "Atonement" at the same commit, verbatim. The
  buff (194384) and the heal (81751) are a hand-reviewed selection; 81749 (the
  talent), 94472, 451577 and 451769 are SAME_NAME_UNIDENTIFIED. No duration,
  amount or transfer rate.

## Real evidence (committed, no new Warcraft Logs request)

- The M13-A Discipline Priest (actor 9) casts Evangelism at 190,592 and
  281,877 and Ultimate Penitence at 232,488. The capture is filtered: every
  listing is UNKNOWN.
- The stated Discipline Priest of the G2 cohort246 fight 33 capture (actor 88)
  applies Atonement to that capture's subject (actor 7) seven times. The
  capture is a PLAYER_CONTEXT capture of actor 7 whose query excluded heal
  events, so the application listing and the (empty) healing listing are
  UNKNOWN (INSUFFICIENT_COVERAGE), never "these were all" or "no Atonement
  healing".
- No committed capture holds a Discipline Priest's whole-fight casts or any
  Atonement heal event; HEAL-B3P needs one (agent/follow-ups.md "After
  HEAL-B3").
