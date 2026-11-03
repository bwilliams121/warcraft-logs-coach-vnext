# Holy Priest (HEAL-B2; PUBLIC since HEAL-B2P)

A healer specialization evaluator on the healer architecture Restoration
Shaman proved (M12-D, HEAL-A) and HEAL-B1 repeated. Registered INTERNAL_ONLY
in HEAL-B2 and PUBLIC since HEAL-B2P, after passing the healer promotion gate
(`tests/contracts/heal-ap-healer-promotion-gate.test.ts`) on the canonical
fight's Holy Priest (b1PmaKrd6CDfzngc fight 48, actor 2: three Apotheosis and
three Divine Hymn casts, the listing COMPLETE). It publishes `healerFindings`
through the shared healer view (`src/findings/healer-view-projection.ts`). It
is not an APL specialization: there is no SimulationCraft authority and no APL
artifact.

## Registration

- Three provider-less families, declared from `HOLY_PRIEST_REQUIRED_INPUTS`:
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
- Guardian Spirit, Symbol of Hope and other single-target or utility spells
  are not identified healing cooldowns: an assignment naming one is
  `ABILITY_NOT_REGISTERED`, never judged.

## Runtime data

`src/data/game/priest-holy-healing-cooldowns.{json,ts}`, each entry a
verbatim specialization-tree row of the pinned SimulationCraft
`trait_data.inc` (commit 33622e9d, client data 12.1.0.69587). Identity only.

- Divine Hymn (64843). A channel: its use is the completed `cast` event of
  64843, once. Its healing pulses arrive as `cast` events of another spell
  (64844), which is not identified and is never a use.
- Apotheosis (200183).
- The pinned Holy tree has no Holy Word: Salvation row, so it is not
  identified.

Both are observed in committed evidence: the Holy Priest of the M13-A capture
(actor 2) casts Apotheosis at 168,785, Divine Hymn at 249,326 and Apotheosis
at 289,544. That capture
is filtered, so its listing is UNKNOWN, never "these were all". The other
identity subject (b1PmaKrd6CDfzngc fight 48, actor 2) has no cast in the
committed friendly-players window; its sources are itself and its stated pet
(94).

## Real evidence (HEAL-B2P)

`tests/evidence/artifacts/wcl-events/wcl-b1pm-fight-48-holy-priest-2-casts.seg-{0-180,180-345}.json`:
every cast and begincast sourced by or targeting actor 2 over the whole fight,
cut from the retained M11-E2 capture (no new Warcraft Logs request). CASTS is
granted for actor 2 only; its pet's casts are not retained. Actor 2 casts
Apotheosis at 7,470,226, 7,595,502 and 7,721,342 and Divine Hymn at 7,509,640,
7,640,275 and 7,761,154; its fifteen Divine Hymn pulse casts (64844) are never
uses.
