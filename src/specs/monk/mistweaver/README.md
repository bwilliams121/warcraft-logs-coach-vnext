# Mistweaver Monk (HEAL-B1, INTERNAL_ONLY)

A healer specialization evaluator on the healer architecture Restoration
Shaman proved (M12-D, HEAL-A). Registered INTERNAL_ONLY: a public request
cannot reach it. Its public shape and promotion are HEAL-B1P's. It is not an
APL specialization: there is no SimulationCraft authority and no APL artifact.

## Registration

- Three provider-less families, declared from `MISTWEAVER_MONK_REQUIRED_INPUTS`:
  COOLDOWN_ASSIGNMENT, HEALING_COOLDOWN, HEALING_DECISION. Each resolves
  `NO_PINNED_AUTHORITY_FOR_DOMAIN`; nothing is bound. The derived requirement
  is FULL_RAID.
- The plan is read from `SpecAnalysisInput.raidCooldownPlan`; absent is no
  plan.
- The result is never ANALYZED: `AUTHORITY_NOT_AVAILABLE` when the evaluator
  ran, `INSUFFICIENT_EVIDENCE` when the identity is not established or the
  data is unusable. The payload carries the evaluation and its healer finding
  set (the shared `src/findings/healer-finding-projection.ts`), or why no set
  was built.

## Supported decision surface (v1)

The M12-D verdict-category limits, unchanged:

| Category | Authority | Outcomes |
| --- | --- | --- |
| ASSIGNMENT | a supplied raid cooldown plan (`USER_PROVIDED_RAID_PLAN`, M12-E) | `NO_AUTHORITY_AVAILABLE` without a plan or for a plan bound to another encounter or difficulty; `UNKNOWN` when the binding cannot be established; per entry for this player `ASSIGNMENT_MET`, `ASSIGNMENT_NOT_ACTIONABLE`, `ASSIGNMENT_UNKNOWN` |
| COOLDOWN | `WCL_OBSERVED_FACT` | the identified healing cooldowns the player cast, and overlapping damage episodes with the player's healing in them; no verdict |
| HEALING_DECISION | none | always `NO_AUTHORITY_AVAILABLE` |

- The plan rules are the shared `src/findings/healer-assignment-execution.ts`;
  the use and overlap facts are the shared
  `src/healing/cooldown-use-context.ts`. This tree owns the identity gate, the
  identified abilities, the use-evidence rule (its own completed cast) and
  counting its stated pets as its sources.
- No cast in a COMPLETE-covered window is `READINESS_NOT_ESTABLISHED`: the
  pinned data claims no cooldown, so a miss cannot be proven. MISSED, EARLY
  and LATE are not reachable.

## Runtime data

`src/data/game/monk-mistweaver-healing-cooldowns.{json,ts}`, each entry a
verbatim specialization-tree row of the pinned SimulationCraft
`trait_data.inc` (commit 33622e9d, client data 12.1.0.69587). Identity only.

- Revival (115310) and Restoral (388615), one choice node.
- Invoke Yu'lon, the Jade Serpent (322118) and Invoke Chi-Ji, the Red Crane
  (325197), another choice node. The use is the player's own cast; the
  summoned celestial is a separate actor, whose healing is counted among the
  player's sources only through its Warcraft Logs-stated `petOwner`.

None of them is observed in any committed evidence: each is identified from
the pinned row only. The identity subject (gtKb2xHn87pNcFfW fight 22, actor
17) appears in a committed fight context; the committed Brewmaster capture
holds a Life Cocoon cast by another Mistweaver, an external cooldown this
data does not identify.
