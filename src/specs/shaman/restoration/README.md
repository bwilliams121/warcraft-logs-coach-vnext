# Restoration Shaman (M12-D; registered in HEAL-A; PUBLIC since HEAL-AP)

The first healer specialization evaluator. Owner decision 2026-10-31
(`agent/autopilot-queue.md` "M12-D").

It was registered INTERNAL_ONLY in HEAL-A and is **PUBLIC since HEAL-AP**
(`shaman/restoration` in `PUBLIC_SPEC_IDS`), after passing the healer
promotion gate (`tests/contracts/heal-ap-healer-promotion-gate.test.ts`). A
public request for a Restoration Shaman dispatches the registration at
FULL_RAID; the document is `AUTHORITY_NOT_AVAILABLE` (or
`INSUFFICIENT_EVIDENCE`) and carries `healerFindings`, built by
`healer-view.ts` from the finding set. It is not an APL specialization: there
is no SimulationCraft authority and no APL artifact.

## Registration (HEAL-A)

- Three provider-less families, declared from
  `RESTORATION_SHAMAN_REQUIRED_INPUTS`: COOLDOWN_ASSIGNMENT, HEALING_COOLDOWN,
  HEALING_DECISION. Each resolves `NO_PINNED_AUTHORITY_FOR_DOMAIN`; nothing is
  bound. The derived requirement is FULL_RAID.
- The plan is read from `SpecAnalysisInput.raidCooldownPlan`; absent is no
  plan.
- The result is never ANALYZED. `AUTHORITY_NOT_AVAILABLE` when the evaluator
  ran (no PINNED decision authority; plan-backed assignment findings cite the
  plan), `INSUFFICIENT_EVIDENCE` when the identity is not established or the
  data is unusable.
- The payload carries the evaluation and its healer finding set
  (`healer-findings.ts`, in the shared `src/findings/healer-finding.ts`
  shape), or why no set was built.

## Supported decision surface (v1)

| Category | Authority | Outcomes |
| --- | --- | --- |
| ASSIGNMENT | a supplied raid cooldown plan (`USER_PROVIDED_RAID_PLAN`, M12-E) | `NO_AUTHORITY_AVAILABLE` without a plan or for a plan bound to another encounter or difficulty; `UNKNOWN` when the binding cannot be established; per entry for this player `ASSIGNMENT_MET`, `ASSIGNMENT_NOT_ACTIONABLE`, `ASSIGNMENT_UNKNOWN` |
| COOLDOWN | `WCL_OBSERVED_FACT` | the identified healing cooldowns the player cast, and overlapping damage episodes with the player's healing in them; no verdict |
| HEALING_DECISION | none | always `NO_AUTHORITY_AVAILABLE` |

- **The plan** is the shared normalized `RaidCooldownPlan`
  (`src/raid-plan/`), resolved against the fight there. Only this player's
  entries for the three identified healing cooldowns are evaluated; its other
  entries are `notEvaluated` (`ABILITY_NOT_REGISTERED`). An entry that may
  name this player but is not uniquely resolved is `PLAYER_NOT_RESOLVED`; a
  phase-relative time is `PLANNED_TIME_UNRESOLVED` (no reviewed phase-label
  map). When the player's own name is not known, every unresolved entry may
  be this player's.
- **MET** needs the player's own completed cast of the planned ability in
  `[planned - tolerance, planned + tolerance]`. That cast is the
  actionability proof.
- **NOT_ACTIONABLE** needs a COMPLETED encounter that ended before the
  window opened.
- **UNKNOWN** is everything else, with its reason. No cast in a
  COMPLETE-covered window is `READINESS_NOT_ESTABLISHED`: the pinned data
  claims no cooldown, so a miss cannot be proven. MISSED, EARLY and LATE are
  not reachable in v1.
- **The listing** is COMPLETE only under the player's CASTS coverage and with no ability-less completed cast of the player; otherwise UNKNOWN, known uses kept.
- **A use** is a `cast` sourced by the player. Not a `begincast`, not an aura
  of the same id (Ascendance's aura is applied without a cast), not a
  totem's own cast.
- **Overlap** needs the FULL_RAID roster; otherwise `ROSTER_NOT_IN_SCOPE`.
  Its `listing` is COMPLETE only when DAMAGE covers every roster player over
  the span plus the episode gap, inside the fight, with no ability-less hit;
  otherwise an empty list is UNKNOWN, not "no overlap".
  The span after a cast (default 10 s) is a reporting window, not an effect
  duration.

## Runtime data

`src/data/game/shaman-restoration-healing-cooldowns.{json,ts}`: Spirit Link
Totem (98008), Ascendance (114052) and Healing Tide Totem (108280), each a
verbatim specialization-tree row of the pinned SimulationCraft
`trait_data.inc` (commit 33622e9d, client data 12.1.0.69587). Identity only.
