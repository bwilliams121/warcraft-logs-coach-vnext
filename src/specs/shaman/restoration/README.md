# Restoration Shaman (M12-D, internal)

The first healer specialization evaluator. Owner decision 2026-10-31
(`agent/autopilot-queue.md` "M12-D").

It is **not registered** with the analysis service and has no public
surface. Nothing in production calls it. It is not an APL specialization:
there is no SimulationCraft authority, no `SpecId`, no registration and no
APL artifact (`tests/contracts/m11a2-cross-spec-isolation.test.ts` names it
as the one unregistered evaluator tree).

## Supported decision surface (v1)

| Category | Authority | Outcomes |
| --- | --- | --- |
| ASSIGNMENT | a supplied raid cooldown plan | `NO_AUTHORITY_AVAILABLE` without a plan; per entry for this player `ASSIGNMENT_MET`, `ASSIGNMENT_NOT_ACTIONABLE`, `ASSIGNMENT_UNKNOWN` |
| COOLDOWN | `WCL_OBSERVED_FACT` | the identified healing cooldowns the player cast, and overlapping damage episodes with the player's healing in them; no verdict |
| HEALING_DECISION | none | always `NO_AUTHORITY_AVAILABLE` |

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
