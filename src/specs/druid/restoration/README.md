# Restoration Druid (HEAL-B1, INTERNAL_ONLY)

A healer specialization evaluator on the healer architecture Restoration
Shaman proved (M12-D, HEAL-A). Registered INTERNAL_ONLY: a public request
cannot reach it. HEAL-B1P2 did not promote it: see "Promotion" below. It is not
an APL specialization: there is no SimulationCraft authority and no APL artifact.

## Registration

- Three provider-less families, declared from `RESTORATION_DRUID_REQUIRED_INPUTS`:
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

`src/data/game/druid-restoration-healing-cooldowns.{json,ts}`, each entry a
verbatim specialization-tree row of the pinned SimulationCraft
`trait_data.inc` (commit 33622e9d, client data 12.1.0.69587). Identity only.

- Tranquility (740). A channel: its use is the completed `cast` event, once;
  the channel's ticks are not further uses.
- Flourish (197721).
- Incarnation: Tree of Life (33891) and Convoke the Spirits (391528), one
  choice node. Only the Restoration (spec 105) row of Convoke the Spirits is
  read; the other druid specializations' rows are their trees.

None of them is observed in any committed evidence: each is identified from
the pinned row only. The identity subject (gtKb2xHn87pNcFfW fight 22, actor
2) appears in a committed fight context with no event capture.

## The choice node (HEAL-B1P2)

Node 82064 reads by observed casts alone, as on every other healer's node:

- Both entries stay identified, and the evaluator reads no talent. A completed
  cast of either is a use.
- An entry for the sibling the player did not cast is `ASSIGNMENT_UNKNOWN`
  `READINESS_NOT_ESTABLISHED`, never a miss and never "not selected".
- An aura is not a use. The retained fight shows why that matters: actor 2 holds
  Convoke the Spirits (combatantinfo entry 103119) and casts it five times, yet
  has six Incarnation: Tree of Life (33891) aura applications with no cast of
  33891. An entry for Tree of Life over one of those auras stays UNKNOWN. Why the
  aura is present was not reviewed.

The synthetic form is pinned in
`tests/unit/specs/heal-b1-healer-evaluators.test.ts`.

## Promotion (HEAL-B1P2): not promoted, for capacity

The retained whole fight (gtKb2xHn87pNcFfW fight 22, actor 2, in the M9-C2,
M11-C4 and M11-C4b captures) passed the unchanged healer promotion gate in an
uncommitted dry run: two Tranquility and five Convoke the Spirits casts, the
listing COMPLETE. Its fixture is 131,911 bytes, and the evidence archive has 5,212
left under its notice line, so nothing was committed and the line was not
raised. The measured proposal and the retry recipe are in
`agent/follow-ups.md` "After HEAL-B1P2".
