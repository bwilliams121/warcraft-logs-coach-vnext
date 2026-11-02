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
status: MERGED
dependsOn: M12-C
branch: autopilot/m12-e
wcl: NONE
publicContract: EXPECTED
pr: 21
mergeSha: 83f09e19a85113b646641cd8412c462e9be1a210
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
status: MERGED
dependsOn: none
branch: autopilot/m13-a
wcl: OWNER-GRANT: agent/autopilot-queue.md M13-A owner decision (2026-11-01); M13-A only; one public raid fight containing an Augmentation Evoker, chosen as the first eligible candidate in a fixed neutral order (at most 10 candidate metadata/context checks); for that one fight only report/fight metadata, master data, fight context and friendly roster, and full-fight CASTS, AURAS (Ebon Might, Prescience, Breath of Eons), DEATHS, combatant/spec identity and pet/summon ownership where needed; no damage, healing, resource, ranking or comparison data; at most 50 Warcraft Logs requests in total
publicContract: NONE
pr: 22
mergeSha: edb5f6e8b72e3a4f38a869285a35127f9e9fe363
```

**OWNER DECISION (2026-11-01): one bounded Warcraft Logs evidence campaign
for the Augmentation Foundation.**

Its sole purpose is real committed evidence that proves M13's initial
observable facts:

- Augmentation actor and spec identity;
- ally and raid roster state;
- Ebon Might state and recipients;
- Prescience state and recipients;
- Breath of Eons timing;
- recipient alive or dead state;
- observable recipient cooldown overlap;
- support-window timing and coverage.

It does NOT authorize any of these, or any other expansion of M13 scope:

- target-quality coaching;
- recipient-quality inference;
- parse optimization;
- comparison shopping.

1. **Subject selection.** It is neutral and deterministic. Choose a fixed
   discovery ordering BEFORE looking, then take the FIRST candidate it
   yields that meets all of these:
   - public and accessible;
   - a raid encounter;
   - Mythic preferred, from the current raid content if readily available;
   - a completed kill preferred where available;
   - at least one Augmentation Evoker whose identity can be established;
   - enough event access for the evidence requirements.

   Never select on parse percentile, high or low performance, how well the
   Augmentation player seems to have played, the conclusion the fight would
   produce, or how any recipient choice looks. Do not outcome-shop.

   A small, bounded candidate walk is allowed: at most 10 candidate
   metadata or context checks. If no eligible subject is found within that
   bound, stop with OWNER_DECISION_REQUIRED.
2. **Data for the ONE selected fight.** Only what M13 foundation evidence
   needs:
   - report and fight metadata;
   - master data and actor identity;
   - fight context and the friendly roster;
   - full-fight events establishing CASTS;
   - aura applications, removals, refreshes and stacks as required for Ebon
     Might and Prescience;
   - Breath of Eons cast and aura timing;
   - DEATHS and recipient survival;
   - observable cooldown casts by friendly players;
   - actor, pet ownership or summon identity only where required to avoid
     misattribution;
   - combatant and spec identity where needed.

   The capture may cover the whole friendly roster, because M13 needs ally
   state.

   Do not retrieve damage, healing or resource data merely because it is
   available. If one more event family is genuinely necessary to prove one
   of the authorized facts above, add the smallest necessary family and
   document why in the review packet.

   No comparison, ranking or performance data after selection without
   another owner decision.
3. **Request bound.** A hard cap of 50 Warcraft Logs requests for the whole
   campaign, counting candidate discovery and context checks as well as the
   capture. Use fewer whenever possible.
   - The request plan is bounded before execution.
   - If the capture cannot finish within the cap, stop with
     OWNER_DECISION_REQUIRED before exceeding it.
   - No second subject is authorized.
4. **Evidence handling.** The project's existing evidence and privacy rules
   apply:
   - full real evidence goes to the evidence archive;
   - only the smallest deterministic regression fixtures are derived for
     routine tests;
   - the existing sanitization and pseudonymization policy applies;
   - provenance must identify the report, fight, actor and spec, capture
     scope, transformations and completeness;
   - completeness claims are never weakened to shrink fixtures;
   - no raw credentials or unrelated player-identifying information are
     committed.
5. **Authority semantics.** The capture establishes observable facts only.
   - Augmentation v1 may reason about buff uptime and state, buff recipient
     identity, recipient survival, observable recipient cooldown overlap,
     support cooldown timing and coverage.
   - It establishes NO authority for recipient quality. Until an approved,
     machine-usable recipient-quality model exists, SUPPORT_TARGETING
     quality is NO_AUTHORITY_AVAILABLE.
   - If such an authority later exists but the required ally evidence is
     missing, SUPPORT_TARGETING is UNKNOWN.
   - A higher parse or a different recipient composition is never turned
     into rotational truth.
6. **Network scope.** This grant applies to M13-A only.
   - It does not authorize additional Augmentation subjects, broader raid
     corpus expansion, comparison-log acquisition, simulation-model work,
     production deployment or unrelated Warcraft Logs research.
   - If M13-A finds any of those necessary, stop with
     OWNER_DECISION_REQUIRED.
7. **Autopilot audit.** The existing supervisor audit still applies.
   - Record every Warcraft Logs request made under this grant in the
     tranche's review evidence.
   - If, after the capture, the supervisor stops for owner confirmation of
     detected Warcraft Logs activity, the audit record is preserved for the
     owner to verify that every request stayed inside this grant.

### M13-B: Recipient specialization state in the combat model

```autopilot
status: MERGED
dependsOn: M13-A
branch: autopilot/m13-b
wcl: NONE
publicContract: NONE
pr: 23
mergeSha: 509e30f1c88d6e5224dde310a05d605aa93ed01f
```

**Direction.** `agent/follow-ups.md` "After M13-A" (no recipient
specialization) and "After M12-D" (no "who else is a healer"). The fight
context's `friendlySpecs` is not carried into `CombatFight`; recipients carry
class (`subType`) only.

**Scope.** Carry each friendly player's Warcraft Logs-stated specialization,
from fight-context master data, into the normalized combat model as observed
identity. Both Augmentation support and other-healer coverage can then read
it without guessing from class.

- Fail closed: a player with no stated spec, or a stated spec that conflicts
  with the authoritative identity rules, is UNKNOWN, never a default. No
  specialization is inferred from abilities cast.
- Preserve completeness and evidence semantics. Bump the normalization
  revision if the repository's rules require it, and keep parity tests for
  existing consumers byte-stable.
- No public contract change unless technically unavoidable; if it becomes
  unavoidable, stop and declare it.

### M13-C: Shared, reviewed recipient cooldown identity

```autopilot
status: MERGED
dependsOn: M13-B
branch: autopilot/m13-c
wcl: NONE
publicContract: NONE
pr: 24
mergeSha: 3330dc61160ff1d97228f8fe342868b9777fc374
```

**Direction.** `agent/follow-ups.md` "After M13-A" (no recipient cooldown
identity): observable overlap needs reviewed cooldown ids per recipient
specialization, and a spec evaluator may not import another specialization's
private data.

**Scope.** A shared, reviewed mechanism through which support analysis asks
"which observable cooldown ids does specialization X have?", without one
specialization importing another's private runtime data.

- Shared plumbing and data only. It makes no gameplay-quality judgement and
  has no `if spec === ...` gameplay evaluator.
- Every identity carries provenance and versioning (source, build or pin,
  revision), following the runtime-data provenance rules.
- Fail closed: a specialization with no reviewed cooldown data is UNKNOWN or
  unsupported, never an empty "no cooldowns".
- Cover only what proves the architecture (for example the specializations
  already pinned, plus the M13-A fight's recipients where reviewed data
  exists). Full-roster generation is a later tranche if it would make this
  one too large.

### M13-D: Complete real coverage for Augmentation support observations

```autopilot
status: OWNER_DECISION_REQUIRED
dependsOn: M13-C
wcl: NONE
publicContract: NONE
ownerDecision: How to obtain COMPLETE real coverage for Augmentation support observations, given that M13-A's server-filtered Casts/Buffs/Deaths capture is OBSERVED_ONLY. Either authorize the Warcraft Logs table requests that a reviewed completeness certificate for the filtered streams needs (the existing M11-G2 rule allows a filtered capture a grant only through an exact certificate against a trusted table over the same interval and predicate), or authorize a bounded unfiltered capture of the same fight (which also retrieves damage and healing). Each is a new Warcraft Logs request that the M13-A grant does not cover.
```

**Direction.** `agent/follow-ups.md` "After M13-A" (no coverage on the real
evidence). The autopilot never silently chooses broader Warcraft Logs
retrieval.

### M13-E: Augmentation evaluator orchestration and registration (internal)

```autopilot
status: READY
dependsOn: M13-C, M13-D
wcl: NONE
publicContract: NONE
```

**Direction.** `agent/follow-ups.md` "After M13-A" (not registered, not
published): registering needs FULL_RAID derivation from
`AUGMENTATION_EVOKER_REQUIRED_INPUTS`.

**Scope.** Wire the Augmentation evaluator into normal internal analysis.

- Its declared FULL_RAID requirement must flow into the derived ingestion
  scope; no hand-picked scope.
- Its results stay internal, like the M10-D internal-only partition.
- SUPPORT_TARGETING quality stays NO_AUTHORITY_AVAILABLE while no approved
  recipient-quality model exists. Do not invent a targeting model.
- Remove the corresponding unregistered-tree exceptions in the
  cross-spec-isolation guards.

### M13-F: Public Augmentation support observations

```autopilot
status: READY
dependsOn: M13-E
wcl: NONE
publicContract: EXPECTED
```

**Scope.** Expose the trustworthy observable Augmentation support facts
through the shared application service, so REST and MCP get identical
semantics:

- buff uptime and state;
- recipient identity and survival;
- observable recipient cooldown overlap;
- support cooldown timing and coverage.

Rules:

- Coverage disclosure, UNKNOWN and NO_AUTHORITY_AVAILABLE semantics are
  preserved on the wire.
- Never expose a recipient-quality conclusion.
- The report must not read as a complete assessment of the Augmentation
  player.

### M14-A: Comparison timing alignment foundation

```autopilot
status: MERGED
dependsOn: none
branch: autopilot/m14-a
wcl: NONE
publicContract: NONE
pr: 25
mergeSha: 20c6d664c81aba466f43de431912ad62f0016639
```

**Direction.** `agent/architecture.md` "Milestone 14" (timing alignment),
CLAUDE.md "Comparable Logs", and the post-hoc comparison facts of M11-G2
(`src/comparison-facts/`).

**Scope.** A post-hoc, factual alignment of a subject fight and comparison
fights onto shared encounter landmarks: pull, observed phases, intermissions,
target transitions, cooldown windows. It answers "at the same encounter
moment, what did each fight show?".

- Alignment needs evidence: a landmark absent from a fight is UNKNOWN, never
  interpolated.
- Comparison coverage stays AT_LEAST, as M11-G2 established: no
  certification is implied.
- Post-hoc only. Nothing on the authority branch (`src/simc`, `src/specs`)
  imports it, under the existing layering guards.
- Use the retained subject and M11-G2 cohort fights in the evidence archive;
  no new capture.

### M14-B: Multi-log consensus

```autopilot
status: MERGED
dependsOn: M14-A
branch: autopilot/m14-b
wcl: NONE
publicContract: NONE
pr: 26
mergeSha: f3c8b26e3dfe4119e3db346db391485a028a90ff
```

**Direction.** CLAUDE.md "Comparison Consensus".

**Scope.** Explicit CONSENSUS / SPLIT / INSUFFICIENT outcomes over aligned
comparison facts.

- A single parse is never consensus.
- SPLIT and INSUFFICIENT make no confident environmental claim.
- Minimum-sample and agreement thresholds are configurable, named and
  documented, never hidden in ad-hoc code. Initial values are recorded as
  CANDIDATE until validated on more real logs; that validation is a recorded
  follow-up, not a reason to stop.
- Consensus is context only. It never suppresses a finding or lowers
  confidence, except through a named environmental reason (INTERMISSION,
  TARGET_UNAVAILABLE, FORCED_DOWNTIME, PHASE_TRANSITION).

### M14-C: Strategy-context representation

```autopilot
status: MERGED
dependsOn: M14-B
branch: autopilot/m14-c
wcl: NONE
publicContract: NONE
pr: 27
mergeSha: 0f1c9827039602ae5f083c9fe94773684d4dac65
```

**Scope.** A structured representation of encounter strategy context derived
from consensus: common downtime, target transitions, common cooldown holds and
phase behavior. Each item maps to a named environmental or actionability
reason where the evidence supports one.

- Context is attached to findings and never becomes rotational authority.
- Top-log behavior is never correctness: more casts, more uptime, more damage
  or a higher parse is never truth.

### M14-D: Factual damage-delta decomposition

```autopilot
status: MERGED
dependsOn: M14-A
branch: autopilot/m14-d
wcl: NONE
publicContract: NONE
pr: 28
mergeSha: 777b12a7ebad28f41c29ddcad4e9ed2b49934e1b
```

**Direction.** `agent/architecture.md` "Milestone 14" (damage diagnosis,
performance deltas), CLAUDE.md "Damage Output Diagnosis", the M11-G2 damage
ledgers and the M11-G4-4 DPS comparability rules.

**Scope.** Decompose subject-versus-comparison damage differences factually,
by ability, target class, window and pet sub-actor tree, as observations.

- No causal claim.
- Where raw `amount` semantics (follow-up M1) or AT_LEAST comparison coverage
  limit a figure, it is a bound or UNKNOWN, never a point estimate.
- "Rupture damage per minute was lower" is allowed. "You failed to cast enough
  Ruptures" is not.

### M14-E: Causal evidence linkage (internal)

```autopilot
status: MERGED
dependsOn: M14-C, M14-D
branch: autopilot/m14-e
wcl: NONE
publicContract: NONE
pr: 29
mergeSha: ca2bf1a44a3453272ca66f34af4518c829caf12c
```

**Scope.** Link damage-delta components to decision-level evidence that could
support a causal statement:

- APL decision outcomes;
- cast opportunities and uptime;
- resource state and buff windows;
- target choice and cooldown alignment;
- encounter actionability.

Rules:

- A link records its evidence and its limits.
- A numeric delta with no decision-level link stays an observation.
- The authority verifier (spec evaluators, SimulationCraft) and this factual
  causal analysis stay separate modules. Neither feeds the other's verdicts
  until a reviewed coaching projection combines them (M14-F).
- Comparison behavior never moves confidence.

### M14-F: Reviewed diagnosis projection and public integration

```autopilot
status: MERGED
dependsOn: M14-E
branch: autopilot/m14-f
wcl: NONE
publicContract: EXPECTED
pr: 30
mergeSha: 58fe668a879bcead275683a68e03cbd6b31646d5
```

**Scope.** The reviewed coaching projection that combines authority-backed
findings with linked causal evidence. It exposes diagnosis through the shared
application service, with structured evidence, UNKNOWN preserved and coverage
disclosed.

- A causal coaching statement appears only where an authority-backed finding
  and its decision-level link both exist.
- Unlinked deltas are labelled observations.
- Comparison context is attached, never authority.

### M15-A: Finding aggregation and prioritization foundation

```autopilot
status: MERGED
dependsOn: none
branch: autopilot/m15-a
wcl: NONE
publicContract: NONE
pr: 31
mergeSha: 6fa228b94f655417bda5f88204a607af31b66b13
```

**Direction.** `agent/architecture.md` "Milestone 15", CLAUDE.md "Timing
Tolerance", "Findings" and "Reporting".

**Scope.** Aggregate repeated small findings into patterns, and rank
structured findings by evidence quality and actionability.

- Ranking consumes structured findings only; reporting never invents one.
- UNKNOWN, NO_AUTHORITY_AVAILABLE, SUPPRESSED and unsupported results are
  carried and labelled. They never rank as failures and never inflate
  confidence.
- Aggregation thresholds are configurable and documented.

### M15-B: TLDR from trustworthy findings

```autopilot
status: MERGED
dependsOn: M15-A
branch: autopilot/m15-b
wcl: NONE
publicContract: EXPECTED
pr: 32
mergeSha: 0ccf829547898da3e6c2c43cfea92f4063f3f41b
```

**Scope.** A short TLDR generated from the prioritized trustworthy findings
and the analysis coverage.

- It always discloses partial coverage: "we could only analyze part of this
  fight" is distinct from "found little to fix".
- It never turns UNKNOWN into certainty or SUPPRESSED into failure.
- Exposed through the shared service: REST and MCP identical.

### M15-C: Evidence-grounded impact estimation

```autopilot
status: OWNER_DECISION_REQUIRED
dependsOn: M15-B
wcl: NONE
publicContract: NONE
ownerDecision: What authority may estimate a finding's impact. Options: the published SimulationCraft model, which today exists only for Blood on 69933, with every other spec or build reporting UNKNOWN; observed factual deltas from M14-D, which are bounds and never causal by themselves; or no numeric impact, only an evidence-quality and actionability ordering. This sets what "impact" means on every report.
```

**Direction.** `agent/architecture.md` "Milestone 15" (impact estimation),
CLAUDE.md "Confidence" (confidence must not simply reflect the size of a
difference).

### M15-D: Advanced report presentation

```autopilot
status: PR_OPEN
dependsOn: M15-B
branch: autopilot/m15-d
wcl: NONE
publicContract: EXPECTED
```

**Scope.** Richer markdown and JSON report rendering from structured findings:

- grouped by decision category;
- each finding with its evidence ("why did it tell me this?") and
  actionability;
- suppressions with their machine-readable reasons;
- a coverage section.

Presentation only: no new findings, no re-evaluation, no Warcraft Logs
access.

### M15-E: Optional scoring

```autopilot
status: OWNER_DECISION_REQUIRED
dependsOn: M15-C
wcl: NONE
publicContract: EXPECTED
ownerDecision: Whether the product shows a score at all, and if so its scale, what it summarizes (which decision categories, and whether impact from M15-C contributes), and how low coverage is disclosed in it. UNKNOWN, NO_AUTHORITY_AVAILABLE and unsupported results never contribute a penalty under any choice.
```

**Direction.** `agent/architecture.md` "Milestone 15": optional scoring, and
only trustworthy findings may influence a score.

### M15-F: Product hardening and final coverage disclosure

```autopilot
status: READY
dependsOn: M15-D, M13-F, M14-F
wcl: NONE
publicContract: EXPECTED
```

**Scope.** End-to-end hardening across the public surfaces:

- consistent coverage disclosure on every report shape (supported, partial,
  unsupported specialization, raid night);
- REST and MCP parity;
- negative tests from CLAUDE.md "Mandatory Negative-Test Philosophy" over the
  integrated reports.

No new analysis capability.

### M11-G4-5-R: Register a 12.1.5 simulation model

```autopilot
status: BLOCKED
dependsOn: none
wcl: NONE
publicContract: NONE
```

**DEFERRED by owner decision (2026-11-02). This is not an open owner
decision.** The 12.1.5 / 70575 model is NOT registered: the supervisor never
selects this entry, and it is no longer an OWNER_DECISION_REQUIRED blocker.
The full decision is in `agent/follow-ups.md` ("After M11-G4-5") and
`agent/architecture.md` ("M11-G4-5 — 12.1.5 compatibility review").

**Re-open trigger.** Create a FRESH, reviewed model-registration tranche
(never revive the current candidate) only when BOTH hold:

- a later upstream SimulationCraft snapshot fixes the Mythic difficulty /
  tank-load issue, or otherwise restores an explicitly reviewed, stable
  tank-load meaning;
- the Blood validation window overlaps a provable deployment interval under
  the existing snapshot-equivalence rules.

EU coverage stays independently optional and never blocks this.
