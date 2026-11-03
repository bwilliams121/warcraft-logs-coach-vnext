# Holy Paladin (HEAL-B1; PUBLIC since HEAL-B1P)

A healer specialization evaluator on the healer architecture Restoration
Shaman proved (M12-D, HEAL-A). Registered INTERNAL_ONLY in HEAL-B1 and PUBLIC
since HEAL-B1P, after passing the healer promotion gate
(`tests/contracts/heal-ap-healer-promotion-gate.test.ts`) on the canonical
fight's Holy Paladin (b1PmaKrd6CDfzngc fight 48, actor 1: three Avenging Wrath and two Aura Mastery casts, the
listing COMPLETE). It publishes `healerFindings` through the shared healer view
(`src/findings/healer-view-projection.ts`). It is not an APL specialization:
there is no SimulationCraft authority and no APL artifact.

## Registration

- Three provider-less families, declared from `HOLY_PALADIN_REQUIRED_INPUTS`:
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

`src/data/game/paladin-holy-healing-cooldowns.{json,ts}`, each entry a
verbatim specialization-tree row of the pinned SimulationCraft
`trait_data.inc` (commit 33622e9d, client data 12.1.0.69587). Identity only.

- Aura Mastery (31821).
- Avenging Wrath (31884) and Avenging Crusader (216331), one choice node.
  Avenging Crusader's talent spell is 394088; the row's `id_override_spell`,
  the spell activated in game, is 216331, so that is the cast id.

Aura Mastery and Avenging Wrath casts by a Holy Paladin are observed in the
committed M13-A capture (actor 5). Avenging Crusader is identified from the
pinned row only.

## Real evidence (HEAL-B1P)

`tests/evidence/artifacts/wcl-events/wcl-b1pm-fight-48-holy-paladin-1-casts.seg-{0-180,180-345}.json`:
every cast and begincast sourced by or targeting actor 1 over the whole fight,
cut from the retained M11-E2 capture (no new Warcraft Logs request). CASTS is
granted for actor 1 only.
