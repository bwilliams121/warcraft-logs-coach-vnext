# Autopilot queue

The roadmap queue the project autopilot supervisor
(`scripts/autopilot/run-project.ps1`, guide: `agent/autopilot.md`) works
through, tranche by tranche.

This file is durable roadmap state and it is tracked. Transient runtime
state, such as the heartbeat, attempts, the merge ledger and locks, lives in
the gitignored `.probe/autopilot/`.

## Rules

- **Readiness.** A tranche is `READY` only when existing product intent,
  architecture and follow-ups already establish enough direction to implement
  it without guessing. A roadmap item that needs a product choice is
  `OWNER_DECISION_REQUIRED`, with the decision named in `ownerDecision`, and
  the supervisor stops there.
- **Selection.** The supervisor takes the first entry, in file order, that
  is `READY`, `IN_PROGRESS` or `PR_OPEN` and whose dependencies are all
  `MERGED`. A tranche is merged when this file says so, the supervisor's
  ledger records it, or GitHub shows its PR merged. It is verified, never
  assumed.
- **Identity.** `branch` is the tranche's stable identity. The default is
  `autopilot/<id in lower case>`. A restarted supervisor finds the existing
  branch or PR, resumes it, and never opens a second one.
- **Warcraft Logs.** `wcl` is `NONE` by default. Only an existing owner
  decision can authorize a request, written as
  `OWNER-GRANT: <where the decision is recorded>; <exactly what is
  authorized>`. "Continue the roadmap" is never such a grant. Until the audit can
  verify a request's scope, every detected request stops for the owner's
  confirmation, even under a grant.
- **Public contract.** `publicContract` is `NONE` or `EXPECTED`. A change
  under `src/contracts/`, `src/api/` or `src/mcp/` in a tranche that
  declares `NONE` stops the supervisor with `OWNER_DECISION_REQUIRED`.
- **Recording merges.** When a tranche merges, the supervisor records the
  PR number and merge SHA in its ledger. The NEXT tranche's PR writes them
  into this file. That keeps the record without opening a PR that exists
  only to update this file.
- **Concurrency.** It is 1. See `agent/autopilot.md` "Parallelism" for when
  2 could be enabled. Entries carry no lock, so that change needs only the
  supervisor.

Fields, in a fenced `autopilot` block under each `### <ID>: <title>`
heading:

| Field | Values |
| --- | --- |
| `status` | `BLOCKED`, `READY`, `IN_PROGRESS`, `PR_OPEN`, `MERGED`, `OWNER_DECISION_REQUIRED` |
| `dependsOn` | tranche ids, comma-separated, or `none` |
| `branch` | optional; the default is `autopilot/<id>` |
| `base` | optional; the default is `main`. A stacked tranche names its parent branch, and the supervisor merges only into main |
| `wcl` | `NONE`, or an `OWNER-GRANT:` as above |
| `publicContract` | `NONE` or `EXPECTED` |
| `ownerDecision` | the decision needed, or empty |
| `pr`, `mergeSha` | recorded when known |

requiredChecks: verify, corpus

## Queue

### M12-A: Healer Foundation, death timelines (internal)

```autopilot
status: MERGED
dependsOn: none
branch: m12-a-healer-foundation
wcl: NONE
publicContract: NONE
pr: 14
mergeSha: 57d11f905018ede0e76efc1b24d86e20e7169143
```

### M12-B: Healer Foundation, damage episodes (internal)

```autopilot
status: MERGED
dependsOn: M12-A
branch: m12-b-raid-damage-events
wcl: NONE
publicContract: NONE
pr: 15
mergeSha: d4798ef5378affb50b67f0cc39afe7250bfaf2e0
```

### M12-C: Healer Foundation, healing and absorbs received during damage episodes (internal)

```autopilot
status: MERGED
dependsOn: M12-B
branch: autopilot/m12-c
wcl: NONE
publicContract: NONE
pr: 18
mergeSha: b27317d6255c4db685ac6fa87b81c34ed0fc9cc8
```

**Direction.**

- `agent/architecture.md` "Healer Architecture": `src/healing/`
  reconstructs WHEN raid damage occurred and WHAT covered it, and lists
  other-healer coverage and absorbs.
- `agent/follow-ups.md` "After M12-B": "the next tranche (healing received
  during an episode, other-healer coverage) needs no new capture for this
  window".

**Scope.** A shared, internal, fact-only `src/healing/` primitive. For each
damage episode, it reports the healing and absorbs each affected roster
player received, by reported source, with per-category coverage.

- No totals (follow-up M1).
- No verdict on any healer.
- No spec-specific meaning.

**Evidence.** The archive segments committed in M12-B already retain every
heal and absorb in their window. Healer evidence follows the 2026-10-31
owner policy (agent/architecture.md "M12-B").

### PREP-5: The MCP tool description mentions consumable status

```autopilot
status: MERGED
dependsOn: none
branch: autopilot/prep-5
wcl: NONE
publicContract: EXPECTED
pr: 19
mergeSha: 5e6ce70fe22c2af75018f14863f47c0c52874741
```

**Direction.** `agent/follow-ups.md` "PRODUCT-INTENT GAP", in the "Still
open" list: "The MCP tool description does not yet mention consumable
status. The outputSchema advertises the field."

**Scope.** Describe, in the MCP tool's description text, the consumable
status every analysis already carries (PREP-2). The schema does not change.
This is the only public change, so `publicContract` is `EXPECTED`.

### M12-D: First healer specialization evaluator

```autopilot
status: MERGED
dependsOn: M12-C
branch: autopilot/m12-d
wcl: NONE
publicContract: NONE
pr: 20
mergeSha: 8a6cff50e001884550aa424dcd903986ddbc6efa
```

**Direction.** Healer verdicts belong to `src/specs/<class>/<spec>/`
(CLAUDE.md "Role Module Boundary").

**OWNER DECISION (2026-10-31): Restoration Shaman is the first healer
specialization.**

Why Restoration Shaman:

- The existing canonical fight (b1PmaKrd6CDfzngc fight 48) already contains
  a Restoration Shaman, actor 122.
- Committed evidence already establishes that subject's class and spec
  identity.
- Reusing captured evidence is preferred over picking a healer arbitrarily.

**Restoration Shaman v1 verdict scope.**

1. **ASSIGNMENT.**
   - Supported only when an explicit, authoritative raid cooldown plan is
     supplied.
   - The evaluator may decide whether the named Restoration Shaman cooldown
     assignment was executed.
   - Valid outcomes: met/correct, missed/incorrect, NOT_ACTIONABLE, UNKNOWN,
     or NO_AUTHORITY_AVAILABLE, as appropriate.
   - Assignments are never inferred from what other healers did.
2. **COOLDOWN.**
   - Without an explicit raid plan, cooldown use is observational and
     informational only.
   - It may report when an identified Restoration Shaman healing cooldown was
     used, and its observable overlap with damage episodes and healing
     coverage.
   - It must not conclude that a cooldown should or should not have been used
     from timing, damage magnitude, HPS or comparison behavior alone.
3. **HEALING_DECISION.** Per-cast spell-choice coaching remains
   NO_AUTHORITY_AVAILABLE in v1. No correct/incorrect verdict for ordinary
   healing spell selection until an explicitly approved, machine-usable healer
   authority is integrated.
4. **Shared factual context.** Death timelines, damage episodes, healing
   received, absorbs and other-healer coverage remain WCL_OBSERVED_FACT
   shared healing primitives. The evaluator may consume them as evidence but
   must not turn them into unsupported causal blame.

**Runtime-data ownership.** Restoration Shaman healing-cooldown identity and
spec-specific cooldown metadata belong in the Restoration Shaman
specialization and runtime-data module. Spec-specific cooldown identity never
goes into generic `src/healing/`.

**Evidence and network.**

- Prefer deriving M12-D evidence from the existing canonical capture and
  archive.
- No new Warcraft Logs request is authorized by this decision.
- If the required real evidence cannot be derived from already-authorized
  retained material, stop with OWNER_DECISION_REQUIRED rather than make a new
  request.

### M12-E: Raid cooldown assignment input

```autopilot
status: PR_OPEN
dependsOn: M12-C
branch: autopilot/m12-e
wcl: NONE
publicContract: EXPECTED
```

**Direction.** CLAUDE.md "Healer Cooldown Assignments" and
`agent/architecture.md` "Raid Cooldown Assignments" define the evaluation
outcomes. The owner decision below defines the plan input.

**OWNER DECISION (2026-10-31): the authoritative raid cooldown plan is an
EXPLICIT USER-PROVIDED INPUT.**

- The analyzer never infers a raid cooldown assignment from Warcraft Logs,
  other healers, comparison players or observed cooldown timing.
- If no plan is supplied, ASSIGNMENT is NO_AUTHORITY_AVAILABLE.

1. **Canonical plan model.** The authority is a normalized, structured
   `RaidCooldownPlan`.
   - Fields: schema/revision, encounter, source, tolerance policy and
     `assignments[]`.
   - Each assignment has: player, `abilityId`, `plannedTime`, `toleranceMs`,
     and a source evidence reference.
   - Specialization evaluators consume the normalized plan, never arbitrary
     prose.
2. **How it is supplied.** For v1, an optional `raidCooldownPlan` on the
   fight-analysis request.
   - REST and MCP feed the same application-service input with the same plan
     semantics. There is no separate gameplay logic in REST, MCP or a future
     UI.
   - M12-E does not persist a guild or raid plan globally. A caller may
     resupply the same encounter plan for several pulls; storing and reusing
     plans in a UI is out of scope.
3. **Real raid-note import.** Support an import and normalization boundary
   for the semicolon timeline-note format of the owner's Mythic Coiled Altar
   example (`time:3;ph:2;tag:Jymblu;spellid:98008;`,
   `time:34;ph:2.5;tag:Jymblu;spellid:98008;`).
   - The importer produces the normalized plan. Evaluators never consume the
     raw text, which is source evidence.
   - Notes contain unrelated material: raid reminders, `tag:everyone`,
     text/display instructions, orb, CC, interrupt, external and group-soak
     assignments, and non-healer abilities. A line carrying a `spellid` is
     NOT automatically a healer cooldown assignment.
   - Only normalized assignments matching a specialization's registered
     cooldown identities are evaluated by that specialization.
   - Unrecognized lines may be kept as import diagnostics or source evidence,
     but never silently become gameplay assignments.
4. **Encounter identity.** A plan is bound to at least `encounterId` and
   `difficulty` (for example 3429, MYTHIC). A plan for another encounter or
   difficulty is never applied: a mismatch fails closed.
5. **Player identity.** A character name plus an optional realm.
   - A name without a realm is valid only when it resolves to exactly one
     player in the analyzed fight's roster.
   - Unicode and diacritics are preserved, never stripped. Normal WoW case
     normalization is acceptable. No fuzzy matching and no guessed aliases.
   - Zero matches leaves the assignment unresolved. Several matches leaves it
     unresolved unless the realm or another explicit identifier
     disambiguates it.
   - An importer may enrich identity from an explicit name-realm
     roster/invite list in the source note.
   - Identity is never derived from class or spec assumptions.
6. **Ability identity.** The numeric spell or ability ID (for example
   `abilityId: 98008`).
   - The specialization evaluator resolves it against its own reviewed
     runtime-data cooldown identities.
   - Display-name string matching is never gameplay authority.
   - Unknown or unregistered IDs are never silently reinterpreted.
7. **Planned time.** The primary v1 model is PHASE_RELATIVE:
   `{ kind: PHASE_RELATIVE, phase: "2", offsetMs: 3000 }`.
   - `phase` is a STRING, never a float, because real plans use "1", "2",
     "2.5", "3".
   - `offsetMs` is relative to the start of that named encounter phase. It
     converts to report or fight time only when the analyzed fight gives
     enough evidence to resolve that phase boundary. Otherwise ASSIGNMENT is
     UNKNOWN; a phase boundary is never guessed.
   - An explicit `{ kind: FIGHT_RELATIVE, offsetMs }` is also allowed, for
     plans that genuinely use pull-relative timing. A phase-relative line is
     never converted to fight-relative timing by assumption.
8. **Optional boss-event context.** Source fields such as `bossSpell:<id>`
   are preserved as plan context. In v1 they do NOT replace the
   phase-relative planned time unless a future reviewed event-anchor model
   supports that. No boss-event timing semantics are invented.
9. **Tolerance.** Tolerance is explicit authority input, given per
   assignment or as a plan-level default the assignments inherit.
   - There is no hidden analyzer-created tolerance.
   - If the source format encodes none, the caller must supply the
     plan-level tolerance.
   - Source fields such as `countdown` are not tolerance.
   - Tolerance is never inferred from observed player behavior.
10. **Source and evidence.** The plan's authority source is
    `USER_PROVIDED_RAID_PLAN`. Findings must trace back to the supplied plan.
    For imported notes, keep where practical:
    - the source format;
    - the source line or a stable reference, and the raw relevant line;
    - the normalized player, spell ID and planned time;
    - the tolerance source;
    - the plan revision or digest.
11. **Specialization consumption.** The plan is whole-raid shared input.
    - Each evaluator consumes only the assignments for its analyzed player and
      its reviewed cooldown identities. For example, M12-D's Restoration
      Shaman evaluator consumes that Shaman's assignments for its registered
      healing cooldown IDs.
    - The shared plan and input layer contains no `if spec === ...`.
      Spec-specific interpretation stays in `src/specs/<class>/<spec>/`.
12. **Authority semantics.** Supplying a plan means "this is the raid's
    authoritative assignment plan for judging execution", not "this plan is
    optimal".
    - A player who follows a supplied assignment is never blamed because
      another strategy might have been better. Plan quality is a separate
      concern.
    - No plan: NO_AUTHORITY_AVAILABLE.
    - Plan supplied, but the required fight, identity or timing evidence is
      missing: UNKNOWN.
    - Plan and evidence sufficient: the specialization evaluator judges
      execution under its approved verdict semantics.
13. **Network and evidence.** No new Warcraft Logs request is authorized.
    M12-E uses synthetic and import fixtures plus already-authorized committed
    evidence. If it needs new live Warcraft Logs evidence, stop with
    OWNER_DECISION_REQUIRED.

### M13-A: Augmentation Foundation

```autopilot
status: OWNER_DECISION_REQUIRED
dependsOn: none
wcl: NONE
publicContract: NONE
ownerDecision: Authorize (or supply) a Warcraft Logs capture of a fight with an Augmentation Evoker: no committed evidence contains one, and gathering it is a new Warcraft Logs request.
```

### M11-G4-5-R: Register a 12.1.5 simulation model

```autopilot
status: OWNER_DECISION_REQUIRED
dependsOn: none
wcl: NONE
publicContract: NONE
ownerDecision: Choose among the options recorded in agent/follow-ups.md "After M11-G4-5" (tank-load meaning under the 70575 data, the Blood validation-window basis, EU coverage).
```
