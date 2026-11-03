# Preservation Evoker (HEAL-B4; PUBLIC since HEAL-B4P)

A healer specialization evaluator on the healer architecture Restoration
Shaman proved (M12-D, HEAL-A) and HEAL-B1 repeated, and its own
representative. Registered INTERNAL_ONLY in HEAL-B4 and PUBLIC since HEAL-B4P,
after passing the healer promotion gate
(`tests/contracts/heal-ap-healer-promotion-gate.test.ts`) on the Preservation
Evoker of gtKb2xHn87pNcFfW fight 22 (actor 15: three Stasis casts and one
Rewind, the listing COMPLETE). It publishes `healerFindings` through the shared
healer view (`src/findings/healer-view-projection.ts`). It is not an APL
specialization: there is no SimulationCraft authority and no APL artifact.

## Registration

- Three provider-less families, declared from
  `PRESERVATION_EVOKER_REQUIRED_INPUTS`: COOLDOWN_ASSIGNMENT,
  HEALING_COOLDOWN, HEALING_DECISION. Each resolves
  `NO_PINNED_AUTHORITY_FOR_DOMAIN`; nothing is bound. The derived requirement
  is FULL_RAID.
- The plan is read from `SpecAnalysisInput.raidCooldownPlan`; absent is no
  plan.
- The result is never ANALYZED: `AUTHORITY_NOT_AVAILABLE` when the evaluator
  ran, `INSUFFICIENT_EVIDENCE` when the identity is not established, the data
  is unusable, or the evidence contradicts the data (below). The payload
  carries the evaluation and its healer finding set (the shared
  `src/findings/healer-finding-projection.ts`), or why no set was built.

## Role

The pinned roster (`src/data/game/spec-roster.json`) states Preservation's
role as `UNKNOWN` with no role evidence: no Evoker specialization carries the
role passive the roster extractor reads. The module identity carries that
`UNKNOWN` unchanged. This tree is a healer evaluator because it declares the
healer families, not because a role was inferred; nothing here reads, asserts
or guesses a role.

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
  identified abilities, the use-evidence rule (its own completed cast of a
  non-empowered identified ability), the empower contradiction check, and
  counting its stated pets as its sources.
- No cast in a COMPLETE-covered window is `READINESS_NOT_ESTABLISHED`: the
  pinned data claims no cooldown, so a miss cannot be proven. MISSED, EARLY
  and LATE are not reachable.
- Time Dilation (an external), Tip the Scales, Zephyr and the empowered
  spells are not identified healing cooldowns: an assignment naming one is
  `ABILITY_NOT_REGISTERED`, never judged.

## Empowered casts

Warcraft Logs records an empowered cast (Dream Breath, Spiritbloom, Fire
Breath) as an `empowerstart`, a `cast` of the same spell at that start, and
an `empowerend` when it is released (the committed M13-A capture, actor 8:
six Dream Breaths with the `cast` in the `empowerstart`'s millisecond, and
three Fire Breaths, one of them with the `cast` a millisecond later). An empowered spell
made instant records the `cast` alone. So for an empowered spell a `cast` is
a START, not a completed cast, and the shared "a use is a completed `cast`"
rule holds only for an ability that is not empowered.

- No identified ability is empowered. The evaluator checks it: an
  `empowerstart` or `empowerend` from the player of an identified ability
  contradicts the data, and the evaluation is `RUNTIME_DATA_CONTRADICTED`
  (`IDENTIFIED_ABILITY_OBSERVED_EMPOWERED`) with every such envelope as
  evidence. Nothing is evaluated, nothing is a use, no finding is built.
- The empower envelopes are envelope-only in normalization. Their
  empowerment level is not decoded, and no empowered cast is judged.
- The shared cast and channel decision anchor (ONB-S4) is not consumed: no
  healer category here anchors a decision, and its execution profile has no
  empowered kind. An empowered decision needs one first.

## Runtime data

`src/data/game/evoker-preservation-healing-cooldowns.{json,ts}`, each entry a
verbatim specialization-tree row of the pinned SimulationCraft
`trait_data.inc` (commit 33622e9d, client data 12.1.0.69587), class 13, spec
1468. Identity only.

- Rewind (363534), on a node of its own.
- Dream Flight (359816) and Stasis (370537), on one choice node. Stasis's use
  is the `cast` of 370537, once; its release arrives as a `cast` of another
  spell (370564), which is not identified and is never a use.
- The pinned Preservation tree has no Emerald Communion row, so it is not
  identified.

Observed in committed evidence: the Preservation Evoker of the M13-A capture
(actor 8) casts Stasis at 176,828 and 272,401 (released at 199,450 and
288,323) and Rewind at 284,626. That capture is filtered, so its listing is
UNKNOWN, never "these were all". No committed capture holds a Dream Flight
cast.

## Real evidence (HEAL-B4P)

`tests/evidence/artifacts/wcl-events/wcl-gtkb-fight-22-preservation-evoker-15-casts.seg-{0-20,20-165,165-285}.json`:
every cast, begincast and empower envelope sourced by or targeting actor 15
over the whole fight, cut from the three adjoining retained captures of that
fight (M9-C2 opener, M11-C4, M11-C4b; no new Warcraft Logs request). CASTS is
granted for actor 15 only. Actor 15 casts Stasis at 2,418,645, 2,516,125 and
2,625,623 and Rewind at 2,515,073. Its three Stasis releases (370564, at
2,445,251, 2,539,064 and 2,652,153) are never uses. None of its empower
envelopes names an identified ability, and its Dream Breaths are not uses.
