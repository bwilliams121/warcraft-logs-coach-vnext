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
status: MERGED
dependsOn: M13-C
branch: autopilot/m13-d
wcl: OWNER-GRANT: agent/autopilot-queue.md M13-D owner decision (2026-11-02); M13-D only; reviewed completeness certificates for the EXISTING M13-A report, fight and interval only (no other report, fight, Evoker, discovery or ranking query); only the Warcraft Logs table and context requests needed to prove or refuse exact certificates for M13-A's filtered friendly CASTS, its filtered Augmentation support AURA stream, and friendly DEATHS where M13 conclusions consume them; no unfiltered capture, no damage or healing retrieval; at most 15 new Warcraft Logs HTTP requests including revision and context re-checks
publicContract: NONE
pr: 34
mergeSha: 423cb48d5c4957b451e7c13097b31d3d710ed8e1
```

**Direction.** `agent/follow-ups.md` "After M13-A" (no coverage on the real
evidence). The autopilot never silently chooses broader Warcraft Logs
retrieval.

**OWNER DECISION (2026-11-02): the REVIEWED COMPLETENESS-CERTIFICATE path.**
No unfiltered full-fight capture now. The goal is COMPLETE coverage for the
existing M13-A filtered Augmentation evidence, certified against trusted
Warcraft Logs table results under the existing M11-G2 coverage rules.

1. **Subject.** ONLY the exact report and fight that M13-A selected and
   captured, over its interval.
   - No other report, fight or Augmentation Evoker.
   - No ranking or comparison discovery, and no growth of the evidence
     population.
2. **Authorized requests.** Only the Warcraft Logs table and context requests
   needed to decide whether M13-A's filtered streams can receive an exact,
   reviewed certificate.
   - The M11-G2 rule is never weakened. A filtered capture earns coverage
     only when a trusted table proves the same relevant facts over the SAME
     report, fight, interval, actor or roster scope as applicable, event
     family, and predicate or filter semantics.
   - The streams to consider are:
     - friendly CASTS over the captured interval;
     - the filtered BUFF/AURA stream for the reviewed Augmentation support
       abilities;
     - friendly DEATHS over the same interval, if the M13 support
       conclusions that consume it need certification.
   - Request only the table surfaces and metadata needed to prove or refuse
     those certificates.
3. **Request bound.** A hard cap of 15 new Warcraft Logs HTTP requests,
   including any revision or context re-check. Use fewer whenever possible.
   - The request plan is bounded before execution.
   - If exact certification cannot be established within 15, stop with
     OWNER_DECISION_REQUIRED before exceeding the cap.
4. **No automatic fallback.** If Warcraft Logs exposes no trusted table able
   to certify a required stream under the exact rule, STOP with
   OWNER_DECISION_REQUIRED. Never switch to an unfiltered capture. Never
   treat any of these as completeness proof:
   - approximate counts;
   - similar predicates;
   - apparent agreement;
   - a table count equal to the event count under a non-equivalent query;
   - an absence of observed discrepancy;
   - plausible-looking events;
   - a belief that the filter is exhaustive.
5. **Certificate semantics.** A certificate is evidence about COMPLETENESS
   only, never gameplay authority.
   - It proves nothing about recipient quality, correct Prescience or Ebon
     Might targets, correct Breath of Eons timing, or optimal play.
   - SUPPORT_TARGETING stays NO_AUTHORITY_AVAILABLE without an approved
     recipient-quality model.
   - A certificate may only upgrade factual observation coverage where the
     predicate and interval are proven complete.
6. **Evidence and provenance.** Anyone must be able to answer "why is this
   filtered stream considered COMPLETE?" from committed evidence, offline.
   Record, as appropriate:
   - the report and fight identity, and the exact interval;
   - the filtered-event query and predicate;
   - the trusted table query and predicate, and the table result used;
   - the event-side result;
   - the revision identity;
   - the equality or reconciliation rule;
   - the certificate outcome, or the refusal reason.

   Certificates are deterministic. Real evidence goes to the evidence
   archive; only the smallest deterministic fixtures go to regression tests.
   Evidence is never weakened to fit the regression corpus.
7. **Network scope.** This grant covers M13-D completeness certification on
   the existing M13-A fight ONLY. It does not authorize:
   - an unfiltered capture;
   - damage or healing retrieval merely because a table exposes it;
   - more Augmentation subjects;
   - comparison or ranking queries;
   - broader M14 evidence acquisition;
   - simulation work;
   - production deployment.

   If any of those becomes necessary, stop with OWNER_DECISION_REQUIRED.
8. **Success condition.** A reviewed, evidence-backed certificate mechanism
   that truthfully marks the relevant existing M13-A support observations
   COMPLETE where the exact evidence supports it.
   - Partial success is acceptable: certify only the proven categories, and
     keep the rest OBSERVED_ONLY or UNKNOWN as appropriate. Completeness is
     never all-or-nothing by manufacture.
   - If a remaining unproven category stops M13-E from proceeding safely,
     stop with OWNER_DECISION_REQUIRED and state precisely what is missing.
9. **Autopilot audit.** Record every Warcraft Logs request made under this
   grant in the tranche's review evidence. The normal supervisor audit
   remains in force. If the supervisor then stops for confirmation of
   detected Warcraft Logs activity, the request ledger is preserved for the
   owner to verify that every request stayed within this grant.

### M13-E: Augmentation evaluator orchestration and registration (internal)

```autopilot
status: MERGED
dependsOn: M13-C, M13-D
branch: autopilot/m13-e
wcl: NONE
publicContract: NONE
pr: 35
mergeSha: cda0e0957712ed6a46a65b360ebe729b1218a7a7
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
status: MERGED
dependsOn: M13-E
branch: autopilot/m13-f
wcl: NONE
publicContract: EXPECTED
pr: 36
mergeSha: 1d6ead6f653e2843c44d9f867c73e914a6fca765
```

**Owner resolution (2026-11-02).** M13-F attempt 1 stopped for the owner
because the local Codex CLI login had been revoked (401 `token_revoked`), so
the required local review could not run. The owner re-authenticated Codex,
and a live read-only Codex request succeeded. Resume M13-F from its existing
branch: local review, commit, PR, CI.

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
status: MERGED
dependsOn: M15-B
branch: autopilot/m15-c
wcl: NONE
publicContract: NONE
pr: 39
mergeSha: 411596921b23e5200b869e4dbb0d0cdab68de6ee
```

**Direction.** `agent/architecture.md` "Milestone 15", owner decision
(2026-11-02) "impact is non-numeric prioritization; final scoring
deferred"; CLAUDE.md "Confidence" (confidence must not simply reflect the
size of a difference).

**Owner resolution (2026-11-02).** In v1, impact means NON-NUMERIC
PRIORITIZATION ONLY.

**Scope.**

- Prioritize trustworthy findings on the M15-A ranking from structured
  evidence only:
  - authority-backed actionability;
  - evidence quality and completeness;
  - repeated occurrence and pattern frequency;
  - the scope or severity of the demonstrated finding;
  - whether the result is actionable.
- Use a qualitative vocabulary (for example `HIGH_PRIORITY`,
  `MEDIUM_PRIORITY`, `LOW_PRIORITY`, `NOT_PRIORITIZED`). It means "where
  should the player look first", never "how much it cost".
- **No numeric estimate.** No DPS lost, percent performance lost, damage
  lost, ranking gain or output recovered.
- **No penalty for non-results.** UNKNOWN, NO_AUTHORITY_AVAILABLE,
  SUPPRESSED and unsupported results receive no failure or impact penalty.
- **Existing numbers keep their meaning.** Counts, durations, uptime,
  timing differences and bounded comparison deltas are never converted into
  causal impact.
- **Extension point.** Add an explicit hook for future authority-backed
  numeric estimators. Each declares its authority, supported spec, build
  and domain, evidence requirements, uncertainty, units and provenance.
  With none registered, every case is UNKNOWN or NOT_AVAILABLE.
- **Contract tests** pin the absence of numeric-impact keys.

### M15-D: Advanced report presentation

```autopilot
status: MERGED
dependsOn: M15-B
branch: autopilot/m15-d
wcl: NONE
publicContract: EXPECTED
pr: 33
mergeSha: ce6a63e32baf1d0f8da63b11f8ccf6b4de466997
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
status: BLOCKED
dependsOn: M15-C, ONB-Z
wcl: NONE
publicContract: EXPECTED
```

**Direction.** `agent/architecture.md` "Milestone 15": optional scoring, and
only trustworthy findings may influence a score.

**Deliberately deferred (owner decision, 2026-11-02).** This is a
product-sequencing decision, not an unresolved architecture blocker.

- **When.** Final scoring semantics are revisited only after every playable
  specialization in the pinned roster reaches a terminal onboarding
  disposition (ONB-Z). They are designed against the complete evidence
  landscape across DPS, tanks, healers and Augmentation.
- **Status.** The entry is BLOCKED, not OWNER_DECISION_REQUIRED, so it
  never stops the autopilot during onboarding. When ONB-Z is merged, the
  owner sets the scoring decision and the entry becomes runnable.
- **Until then.** Only scoring-neutral infrastructure useful under any
  eventual model may land, and only inside another reviewed tranche.
- **Never:**
  - a universal score;
  - qualitative priority turned into hidden DPS-loss weights;
  - negative scoring of UNKNOWN or unsupported behavior;
  - onboarding blocked on scoring.

### M15-F: Product hardening and final coverage disclosure

```autopilot
status: MERGED
dependsOn: M15-D, M13-F, M14-F
branch: autopilot/m15-f
wcl: NONE
publicContract: EXPECTED
pr: 37
mergeSha: 8cb47d1d37397a68be02d8a4145127dad73a24fe
```

**Scope.** End-to-end hardening across the public surfaces:

- consistent coverage disclosure on every report shape (supported, partial,
  unsupported specialization, raid night);
- REST and MCP parity;
- negative tests from CLAUDE.md "Mandatory Negative-Test Philosophy" over the
  integrated reports.

No new analysis capability.

## Specialization onboarding (owner product decision, 2026-11-02)

The project continues past M15 until EVERY playable specialization in the
pinned roster (`src/data/game/spec-roster.json`) has a terminal disposition:
PUBLIC (preferred), DEFERRED by owner decision, or BLOCKED on a documented
authority or evidence condition.

- **Progress record.** `agent/spec-onboarding-inventory.md` is the canonical
  matrix and progress summary. Every onboarding tranche updates it.
- **Empty is not done.** An empty queue while ordinary specializations remain
  unsupported is NOT completion.

**Rules for every onboarding entry (in addition to CLAUDE.md):**

1. **Per-spec ownership.** Each specialization keeps its own module, runtime
   data with provenance, authority and promotion gates under
   `src/specs/<class>/<spec>/`.
   - A cohort is a shared ENGINEERING pattern, never shared gameplay meaning.
   - Shared machinery belongs only in ONB-S* tranches or an existing shared
     module.
   - No universal evaluator, and no `if spec === ...` in generic
     infrastructure.
2. **The internal tranche (rotational: ONB-A* to ONB-X*).** An internal
   entry runs:
   - **A. Authority, token and data review:** pinned APL, supported tokens
     and applicability, state reconstruction, exclusions and UNKNOWN
     behavior.
   - **B. Internal implementation:** module, evaluator, runtime data,
     synthetic fail-closed tests, and INTERNAL_ONLY registration with
     derived scope.
   - **C. Real-evidence validation:** on retained, already-authorized
     evidence, meeting the observation, MATCH, discrimination and
     negative-control requirements of the existing rotational promotion
     gate, with corpus and archive assertions and cross-spec isolation.
3. **The healer tranche (HEAL-*).** Healers have no SimulationCraft
   rotational authority, so the APL review and the MATCH/discrimination gate
   do not apply. The M12-D verdict limits are unchanged:
   - HEALING_DECISION is NO_AUTHORITY_AVAILABLE;
   - ASSIGNMENT is NO_AUTHORITY_AVAILABLE without a supplied plan;
   - COOLDOWN is observational only.

   Each healer internal entry instead runs:
   - **A. Authority and data review:** the reviewed healing-cooldown identity
     and runtime data with provenance, verdict categories and their authority,
     the required inputs (FULL_RAID), and UNKNOWN behavior.
   - **B. Internal implementation:** module, evaluator, runtime data,
     synthetic fail-closed tests, and INTERNAL_ONLY registration with
     derived scope.
   - **C. Real-evidence validation**, on retained, already-authorized
     evidence:
     - real cooldown observations for the healer;
     - real ASSIGNMENT outcomes against a supplied plan (ASSIGNMENT_MET and
       its failure counterparts);
     - identity validation and completeness handling, with PARTIAL or ABSENT
       data giving UNKNOWN;
     - the missing-plan path giving NO_AUTHORITY_AVAILABLE, never an inferred
       assignment;
     - negative controls: no HPS ranking, no per-cast spell-choice verdict,
       and no cooldown-quality verdict without a plan;
     - corpus and archive assertions and cross-spec isolation.

   The healer public gate is defined by HEAL-AP from these requirements
   (`tests/contracts/heal-ap-healer-promotion-gate.test.ts`; see
   agent/architecture.md "HEAL-AP"). Healer followers meet it; they never
   meet a weakened gate.
4. **The public tranche.** A public entry ("public") is the separate,
   reviewed PUBLIC promotion: the promotion gate that applies to its
   analyzer kind (rotational, or the HEAL-AP healer gate), public contract,
   and REST/MCP parity and invariance.
   - It promotes only the specializations that pass.
   - A specialization that cannot pass stays INTERNAL_ONLY. It is recorded
     in the inventory with its reason, and an evidence gap goes to ONB-EV.
     Its cohort-mates still promote.
5. **Owner stops.** Stop with OWNER_DECISION_REQUIRED only for a genuine
   authority, evidence-semantics, public-meaning, network or deployment
   choice. Ordinary implementation is never a stop.
6. **Gates never weaken.** No existing gate is weakened because many
   specializations remain.
7. **Network.** `wcl: NONE` on every entry. No new Warcraft Logs permission
   is granted here. Missing evidence is recorded for ONB-EV, never fetched.
8. **Prioritization inputs (owner decision, 2026-11-02).** Every onboarded
   specialization exposes the structured evidence and actionability
   information the M15-C non-numeric prioritization needs.
   - No numeric impact estimate is required or invented.
   - Final scoring (M15-E) is deferred until ONB-Z and never blocks
     onboarding.

### ONB-S1: Shared precombat action-list execution for APL variables

```autopilot
status: MERGED
dependsOn: none
branch: autopilot/onb-s1
wcl: NONE
publicContract: NONE
pr: 40
mergeSha: f1614c70fc2a3be09b493c5fa0f356ef79c1ee46
```

**Direction.** `agent/follow-ups.md` "After M11-D3-C2" (precombat
variables): many Cohort A/B variables are assigned ONLY in the precombat
list, so every read of them is an unknown incoming value.

**Scope.** Execute the precombat list in the shared decision engine for
VARIABLE assignment only. Pinned semantics apply: values persist into
combat.

- A value that depends on precombat state the evidence cannot establish
  (buffs or resources before the pull) stays UNKNOWN.
- Talent-, gear- and constant-derived values resolve where the evidence
  establishes their inputs.
- No public decision may change without a recorded reason. Re-measure the
  public specs and pin any change.

### ONB-S2: Shared APL variable combining operations

```autopilot
status: MERGED
dependsOn: ONB-S1
branch: autopilot/onb-s2
wcl: NONE
publicContract: NONE
pr: 41
mergeSha: d0ebe223bdd89fb10dbdac31afa07e8e1bec7d51
```

**Direction.** `agent/follow-ups.md` "After M11-D3-C2" (combining
operations): `add`, `sub`, `mul`, `div`, `pow`, `mod`, `min`, `max`,
`floor`, `ceil` and `cycling_variable` are not modelled.

**Scope.** Model them in the shared engine with pinned SimulationCraft
semantics. An operand of unknown value yields UNKNOWN, never a guessed
value. Prove the result against pinned source citations.

### ONB-S3: Enemy-set and target-count authority model

```autopilot
status: OWNER_DECISION_REQUIRED
dependsOn: none
wcl: NONE
publicContract: NONE
ownerDecision: Whether, and on what evidence, the analyzer may model the enemy set and target count that SimulationCraft conditions read (active_enemies, spell_targets, target_if FIRST mode and target-dependent if=). TARGET_COUNT is currently declared a permanent blocker in src/simc/decision-coverage.ts. Lifting it changes evidence semantics (which enemies count as present, targetable and in range) and gates the target-selection cohort (Windwalker, Guardian, Beast Mastery, Survival).
```

**Direction.** The M11-D0 census (pinned `target_if` semantics), CLAUDE.md
"Multi-Target Support", and `agent/follow-ups.md` "After M11-D3-B".

### ONB-S4: Shared cast and channel decision anchor

```autopilot
status: MERGED
dependsOn: none
branch: autopilot/onb-s4
wcl: NONE
publicContract: NONE
pr: 42
mergeSha: 400987bce9370aaff3d787ee4b51850412de9a41
```

**Direction.** CLAUDE.md "Decision Points" (cast time, channel time, GCD
overlap, queuing) and the M11-D0 census Cohort D (casters need a cast or
channel anchor).

**Scope.** A shared decision-point model for cast-time and channelled
actions. The decision is anchored at cast start, from `begincast` or
derived from cast completion with reviewed cast-time data. Channels and
interrupted casts are handled, and no artificial "missed action" exists
while a cast or channel is in progress.

- Where the anchor cannot be established (for example a missing
  `begincast`, or haste unknown), the decision is UNKNOWN.
- Shared plumbing only; casters own their meaning.

### ONB-S5: Shared resource pooling and wait semantics

```autopilot
status: MERGED
dependsOn: none
branch: autopilot/onb-s5
wcl: NONE
publicContract: NONE
pr: 43
mergeSha: 668d34db3d1a72e50fdce17a6db15da36579c93c
```

**Direction.** The M11-D0 census Cohort C (pooling: Outlaw, Feral).

**Scope.** Pinned semantics for `pool_resource`, `wait`, `wait_for` and
pooling-gated lines in the shared engine: what the APL selects while
pooling, and how an observed cast is compared against a pooling decision.
Undecidable pooling states are UNKNOWN; continuous resources stay
intervals.

### ONB-S6: Shared pet actor mapping for pet-driven APL state

```autopilot
status: MERGED
dependsOn: none
branch: autopilot/onb-s6
wcl: NONE
publicContract: NONE
pr: 44
mergeSha: 03d967dd1a6399d5777e6d5c914a51073c51b427
```

**Direction.** `agent/follow-ups.md` "After M11-G3-1" (pets are not mapped
to Warcraft Logs actors) and the M11-E2.1 owned-pet tooling.

**Scope.** A shared, evidence-backed mapping between pinned SimulationCraft
pet entities and Warcraft Logs pet actors (stated `petOwner`, summon
events), plus pet-count and pet-active state for APL reads (for example
`pet.X.active` and `buff.X.stack` on pets).

- An ambiguous mapping is UNKNOWN, never a guess.
- Pet-heavy specs (Demonology, Unholy, Beast Mastery) consume it.

### ONB-EV: Neutral evidence campaign for specializations without retained real evidence

```autopilot
status: OWNER_DECISION_REQUIRED
dependsOn: none
wcl: NONE
publicContract: NONE
ownerDecision: Authorize one bounded, neutral, deterministic Warcraft Logs evidence campaign for the specializations that have no retained, already-authorized real evidence. Known today: Fury Warrior, Protection Warrior, Outlaw Rogue, Survival Hunter and Vengeance Demon Hunter appear in no committed fight context, and onboarding tranches append any further spec whose review finds its evidence inadequate. The proposal is the smallest campaign: per spec, the first public raid fight in a fixed order containing it, with its actor slice (casts, auras, resources, combatant info), and no ranking or comparison data.
```

**Direction.** The owner's onboarding evidence policy: neutral,
outcome-independent acquisition, with no searching for a desired
MATCH/REJECTED result. Until this is decided, the affected specializations
stay INTERNAL_ONLY after their internal tranches, and nothing else waits on
them.

### HEAL-A: Restoration Shaman registration and healer finding shape (internal)

```autopilot
status: MERGED
dependsOn: none
branch: autopilot/heal-a
wcl: NONE
publicContract: NONE
pr: 45
mergeSha: 3fce84754a4cdd53efcd37809f85b3eed8e5abeb
```

**Direction.** `agent/follow-ups.md` "After M12-D" (not registered, not
published): this needs a registration shape for an evaluator with no
SimulationCraft authority, FULL_RAID derived from
`RESTORATION_SHAMAN_REQUIRED_INPUTS`, and a shared finding shape for
ASSIGNMENT, COOLDOWN and HEALING_DECISION (`src/findings/authority.ts`
knows only ROTATION).

**Scope.** Register Restoration Shaman INTERNAL_ONLY with that shared
finding shape.

- The M12-D verdict scope and the M12-E plan semantics apply unchanged.
- HEALING_DECISION is NO_AUTHORITY_AVAILABLE.
- ASSIGNMENT is NO_AUTHORITY_AVAILABLE without a supplied plan.
- COOLDOWN is observational.
- Remove the unregistered-tree exceptions.

### HEAL-AP: Restoration Shaman public promotion

```autopilot
status: PR_OPEN
dependsOn: HEAL-A
branch: autopilot/heal-ap
wcl: NONE
publicContract: EXPECTED
```

**Scope.** Promote Restoration Shaman PUBLIC through a healer public result
shape: assignment execution, cooldown observations, and shared factual
healing context with coverage disclosure.

- No HPS ranking, no inferred assignment, and no cooldown-quality verdict
  without a plan.
- Define and pin the healer promotion gate from rule 3's validation
  requirements: real observations, assignment outcomes, identity,
  completeness, missing-plan behavior and negative controls. It is
  separate from the rotational gate, which stays unchanged, and it holds
  the same quality bar as the existing public specs.

### HEAL-B1: Holy Paladin, Restoration Druid and Mistweaver Monk (internal)

```autopilot
status: READY
dependsOn: HEAL-A
wcl: NONE
publicContract: NONE
```

**Scope.** Three healer evaluators on the proven healer architecture. Each
has its own reviewed healing-cooldown identity and runtime data under its
own tree, and consumes the shared `RaidCooldownPlan` and the
`src/healing/` primitives. The M12-D verdict-category limits apply to each.

### HEAL-B1P: Holy Paladin, Restoration Druid and Mistweaver Monk (public)

```autopilot
status: READY
dependsOn: HEAL-B1, HEAL-AP
wcl: NONE
publicContract: EXPECTED
```

### HEAL-B2: Holy Priest (internal)

```autopilot
status: READY
dependsOn: HEAL-B1
wcl: NONE
publicContract: NONE
```

### HEAL-B2P: Holy Priest (public)

```autopilot
status: READY
dependsOn: HEAL-B2, HEAL-AP
wcl: NONE
publicContract: EXPECTED
```

### HEAL-B3: Discipline Priest (internal, own representative)

```autopilot
status: READY
dependsOn: HEAL-B1
wcl: NONE
publicContract: NONE
```

**Scope.** Discipline heals substantially through damage (Atonement), a
pattern the healing primitives do not yet represent. Treat it as its own
representative:

- Model what is observable (atonement application and damage-to-healing
  attribution as reported) without per-cast quality verdicts.
- Anything the evidence cannot attribute is UNKNOWN.

### HEAL-B3P: Discipline Priest (public)

```autopilot
status: READY
dependsOn: HEAL-B3, HEAL-AP
wcl: NONE
publicContract: EXPECTED
```

### HEAL-B4: Preservation Evoker (internal, own representative)

```autopilot
status: READY
dependsOn: HEAL-B1
wcl: NONE
publicContract: NONE
```

**Scope.** Preservation combines empowered casts with a roster role the
pinned data leaves UNKNOWN, so it is its own representative. Use the
declared roster classification, never guess a role, and reuse ONB-S4's
anchor if it has landed.

### HEAL-B4P: Preservation Evoker (public)

```autopilot
status: READY
dependsOn: HEAL-B4, HEAL-AP
wcl: NONE
publicContract: EXPECTED
```

### ONB-A1: Havoc Demon Hunter (internal, Cohort A representative)

```autopilot
status: READY
dependsOn: ONB-S1
wcl: NONE
publicContract: NONE
```

**Scope.** Cohort A representative: an instant builder/spender list with
no `run_action_list` and precombat-assigned variables. Its authority is
already audited, and its real evidence is retained (fight 48).

Known stops from the D3 probes:

- `retarget_auto_attack,line_cd=1`;
- `gcd.max` at `default[3]`.

### ONB-A1P: Havoc Demon Hunter (public)

```autopilot
status: READY
dependsOn: ONB-A1
wcl: NONE
publicContract: EXPECTED
```

### ONB-A2: Subtlety Rogue, Fury Warrior and Protection Warrior (internal, Cohort A)

```autopilot
status: READY
dependsOn: ONB-A1
wcl: NONE
publicContract: NONE
```

**Scope.** Cohort A followers on Havoc's proven pattern.

- Protection Warrior's tank meaning (offensive rotation, separated from
  mitigation) stays its own.
- Fury and Protection Warrior have no known retained evidence: record them
  for ONB-EV if real-evidence validation cannot be met.

### ONB-A2P: Subtlety Rogue, Fury Warrior and Protection Warrior (public)

```autopilot
status: READY
dependsOn: ONB-A2
wcl: NONE
publicContract: EXPECTED
```

### ONB-B1: Arms Warrior (internal, Cohort B representative)

```autopilot
status: READY
dependsOn: ONB-S1
wcl: NONE
publicContract: NONE
```

**Scope.** Cohort B representative: `run_action_list` dispatch with
cooldown windows. Real evidence is retained (fight 48), and the question
`colossus-smash-window-fill` is already identified.

### ONB-B1P: Arms Warrior (public)

```autopilot
status: READY
dependsOn: ONB-B1
wcl: NONE
publicContract: EXPECTED
```

### ONB-B2: Frost Death Knight and Enhancement Shaman (internal, Cohort B)

```autopilot
status: READY
dependsOn: ONB-B1
wcl: NONE
publicContract: NONE
```

**Scope.** Cohort B followers on Arms' proven pattern.

- Frost DK relies on the M11-D1 numeric-`react` fix and multi-resource
  (runes and Runic Power) state.
- Enhancement's `bloodlust,line_cd=600` attributes.

### ONB-B2P: Frost Death Knight and Enhancement Shaman (public)

```autopilot
status: READY
dependsOn: ONB-B2
wcl: NONE
publicContract: EXPECTED
```

### ONB-B3: Devourer Demon Hunter (internal, own representative)

```autopilot
status: READY
dependsOn: ONB-S1, ONB-S2
wcl: NONE
publicContract: NONE
```

**Scope.** Devourer is the newest specialization and is unusual: four
`pick_up_fragment,…,line_cd=` pseudo-actions share one token and are never
observed casts, its `void_ray_count` uses `op=add`, and its `react` is
numeric. Handle it alone.

- Pseudo-action timers stay UNKNOWN unless the evidence attributes them.
- It is never forced into Cohort B.

### ONB-B3P: Devourer Demon Hunter (public)

```autopilot
status: READY
dependsOn: ONB-B3
wcl: NONE
publicContract: EXPECTED
```

### ONB-C1: Feral Druid (internal, Cohort C representative)

```autopilot
status: READY
dependsOn: ONB-S5
wcl: NONE
publicContract: NONE
```

**Scope.** Cohort C representative: pooling, plus form state. Real evidence
is retained (fight 48). `rip-rake-snapshot-refresh` is a recorded question,
for a later deep dive only.

### ONB-C1P: Feral Druid (public)

```autopilot
status: READY
dependsOn: ONB-C1
wcl: NONE
publicContract: EXPECTED
```

### ONB-C2: Outlaw Rogue (internal, Cohort C)

```autopilot
status: READY
dependsOn: ONB-C1
wcl: NONE
publicContract: NONE
```

**Scope.** Cohort C follower. No retained evidence is known, so it is
recorded for ONB-EV if real-evidence validation cannot be met.

### ONB-C2P: Outlaw Rogue (public)

```autopilot
status: READY
dependsOn: ONB-C2
wcl: NONE
publicContract: EXPECTED
```

### ONB-T1: Windwalker Monk (internal, Cohort T representative)

```autopilot
status: READY
dependsOn: ONB-S3, ONB-S1
wcl: NONE
publicContract: NONE
```

**Scope.** Cohort T representative: target selection, under the ONB-S3
authority decision. Real evidence is retained (fight 48).

Settle the follow-up "Whole-line blocker classification for refused
`target_if` lines" before any Windwalker-shaped authority becomes public.

### ONB-T1P: Windwalker Monk (public)

```autopilot
status: READY
dependsOn: ONB-T1
wcl: NONE
publicContract: EXPECTED
```

### ONB-T2: Guardian Druid, Beast Mastery Hunter and Survival Hunter (internal, Cohort T)

```autopilot
status: READY
dependsOn: ONB-T1, ONB-S6
wcl: NONE
publicContract: NONE
```

**Scope.** Cohort T followers.

- Guardian keeps tank meaning separate from offense.
- Beast Mastery uses ONB-S6 pet mapping; `barbed-shot-charge-capping` is a
  recorded question.
- Survival's `retarget` and `fight_style.dungeonroute` gate stay UNKNOWN
  where unsupported. It has no retained evidence, so it is recorded for
  ONB-EV if needed.

### ONB-T2P: Guardian Druid, Beast Mastery Hunter and Survival Hunter (public)

```autopilot
status: READY
dependsOn: ONB-T2
wcl: NONE
publicContract: EXPECTED
```

### ONB-D1: Destruction Warlock (internal, Cohort D representative)

```autopilot
status: READY
dependsOn: ONB-S4
wcl: NONE
publicContract: NONE
```

**Scope.** Cohort D representative on the ONB-S4 cast and channel anchor.
Real evidence is retained. Ritual Clipping ownership stays
`UNRESOLVED_DIABOLIST_HERO_TREE` (`agent/m11-spec-coaching-inventory.md`);
it is a deep-dive question, not a blocker for the rotational slice.

### ONB-D1P: Destruction Warlock (public)

```autopilot
status: READY
dependsOn: ONB-D1
wcl: NONE
publicContract: EXPECTED
```

### ONB-D2: Elemental Shaman, Balance Druid and Shadow Priest (internal, Cohort D)

```autopilot
status: READY
dependsOn: ONB-D1
wcl: NONE
publicContract: NONE
```

**Scope.** Cohort D casters with DoT maintenance and builder resources
(Maelstrom, Astral Power, Insanity), each with its own meaning. Real
evidence is retained for all three.

### ONB-D2P: Elemental Shaman, Balance Druid and Shadow Priest (public)

```autopilot
status: READY
dependsOn: ONB-D2
wcl: NONE
publicContract: EXPECTED
```

### ONB-D3: Arcane Mage and Frost Mage (internal, Cohort D)

```autopilot
status: READY
dependsOn: ONB-D1
wcl: NONE
publicContract: NONE
```

**Scope.** Cohort D casters with charge/proc state and numeric `react` (the
M11-D1 fix). Arcane's real evidence is retained (fight 48, actor 121).
Frost Mage's must be verified, or it is recorded for ONB-EV.

### ONB-D3P: Arcane Mage and Frost Mage (public)

```autopilot
status: READY
dependsOn: ONB-D3
wcl: NONE
publicContract: EXPECTED
```

### ONB-D4: Affliction Warlock and Marksmanship Hunter (internal, Cohort D)

```autopilot
status: READY
dependsOn: ONB-D1
wcl: NONE
publicContract: NONE
```

**Scope.** Cohort D casters with multi-DoT (Affliction) or cast-time
shots (Marksmanship). Neither has known retained events, so record them
for ONB-EV if needed.

### ONB-D4P: Affliction Warlock and Marksmanship Hunter (public)

```autopilot
status: READY
dependsOn: ONB-D4
wcl: NONE
publicContract: EXPECTED
```

### ONB-X1: Fire Mage (internal, own representative)

```autopilot
status: READY
dependsOn: ONB-S4
wcl: NONE
publicContract: NONE
```

**Scope.** A holdout from the M11-D0 census. Combustion windows and
crit-proc chains (Heating Up and Hot Streak) need proc-state handling of
their own. Real evidence is retained.

### ONB-X1P: Fire Mage (public)

```autopilot
status: READY
dependsOn: ONB-X1
wcl: NONE
publicContract: EXPECTED
```

### ONB-X2: Devastation Evoker (internal, own representative)

```autopilot
status: READY
dependsOn: ONB-S4
wcl: NONE
publicContract: NONE
```

**Scope.** A holdout. It has empowered casts (rank by hold time) and a
roster role left UNKNOWN by the pinned data; use the declared M11
classification. `empower-cast-usage` is a recorded question. Real evidence
is retained (fight 48).

### ONB-X2P: Devastation Evoker (public)

```autopilot
status: READY
dependsOn: ONB-X2
wcl: NONE
publicContract: EXPECTED
```

### ONB-X3: Vengeance Demon Hunter (internal, own representative)

```autopilot
status: READY
dependsOn: ONB-S1, ONB-S2
wcl: NONE
publicContract: NONE
```

**Scope.** A holdout. Its in-combat variable programme combines `%`,
`ceil` and charges (`agent/follow-ups.md` "After M11-D3-C2"), so it needs
ONB-S2. Its tank meaning stays separate from offense. No retained evidence
is known, so record it for ONB-EV if needed.

### ONB-X3P: Vengeance Demon Hunter (public)

```autopilot
status: READY
dependsOn: ONB-X3
wcl: NONE
publicContract: EXPECTED
```

### ONB-X4: Demonology Warlock (internal, own representative)

```autopilot
status: READY
dependsOn: ONB-S4, ONB-S6
wcl: NONE
publicContract: NONE
```

**Scope.** A holdout. Demon summons and imp counts use ONB-S6 pet mapping,
and Tyrant setup is a recorded question. Ritual Clipping ownership stays
unresolved and is not a blocker. Real evidence is retained (fight 48).

### ONB-X4P: Demonology Warlock (public)

```autopilot
status: READY
dependsOn: ONB-X4
wcl: NONE
publicContract: EXPECTED
```

### ONB-X5: Unholy Death Knight (internal, own representative)

```autopilot
status: READY
dependsOn: ONB-S2, ONB-S6
wcl: NONE
publicContract: NONE
```

**Scope.** A holdout from the M11-D0 census Cohort E, which is pet- and
variable-heavy on top of `run_action_list` dispatch. It uses ONB-S6 and
ONB-S2, and no retained events are known, so record it for ONB-EV if
needed.

### ONB-X5P: Unholy Death Knight (public)

```autopilot
status: READY
dependsOn: ONB-X5
wcl: NONE
publicContract: EXPECTED
```

### ONB-Z: Specialization-onboarding completion matrix

```autopilot
status: READY
dependsOn: M13-F, HEAL-AP, HEAL-B1P, HEAL-B2P, HEAL-B3P, HEAL-B4P, ONB-A1P, ONB-A2P, ONB-B1P, ONB-B2P, ONB-B3P, ONB-C1P, ONB-C2P, ONB-T1P, ONB-T2P, ONB-D1P, ONB-D2P, ONB-D3P, ONB-D4P, ONB-X1P, ONB-X2P, ONB-X3P, ONB-X4P, ONB-X5P
wcl: NONE
publicContract: NONE
```

**Scope.** Regenerate the roster matrix and progress summary in
`agent/spec-onboarding-inventory.md` from the production registry, and
verify that every playable specialization has a terminal disposition.

- A specialization that is neither PUBLIC nor carrying a recorded owner
  deferral or documented blocker fails this tranche: it is an open item,
  not completion.
- Add a contract test that pins the matrix against the registry and the
  roster.

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
