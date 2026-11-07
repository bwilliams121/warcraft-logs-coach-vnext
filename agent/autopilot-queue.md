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
status: MERGED
dependsOn: none
wcl: NONE
publicContract: NONE
pr: 88
mergeSha: 33cbb6170c49821b1bc81893210511d71ed86706
```

**Owner resolution (2026-11-05): approve a bounded, evidence-first
enemy-set and target-count model.** Recorded in full in
`agent/architecture.md` "Owner decision (2026-11-05): ONB-S3 enemy-set and
target-count model". `TARGET_COUNT` is no longer a permanent unsupported
domain, but no exact count is ever manufactured because an expression
asks for one.

**Scope.**

- **State.** Enemy-set and target-count state is EXACT, BOUNDED or UNKNOWN.
  A condition resolves only when every count consistent with the evidence
  gives the same result:
  - a proven lower bound of 4 makes `active_enemies>=3` TRUE;
  - a proven upper bound of 2 makes it FALSE;
  - a range of 2–4 leaves it UNKNOWN.
- **Membership needs positive evidence.** Only positive trusted evidence
  placing the actor in the encounter at the decision time admits it.
  - These never admit one: encounter metadata, an earlier appearance,
    another player's unrelated interaction, SimulationCraft's expectation,
    or a mechanic that "normally" spawns adds.
  - Missing events never prove an enemy absent, dead, untargetable or out
    of range.
  - Lifecycle follows established spawn, death, despawn or other trusted
    encounter-state evidence.
- **Separate states.** PRESENT, TARGETABLE, IN-RANGE (action-applicable) and
  UNKNOWN are distinct states. An expression needing a stronger fact than
  the evidence establishes is UNKNOWN.
- **`active_enemies`** uses the shared model only as far as the evidence
  supports, preferring bounds. It is never "hostile actors seen in the
  log".
- **`spell_targets.<ability>`** is never aliased to `active_enemies`. It
  resolves only through registered, action-owned target applicability,
  including range and geometry where it applies; otherwise it is UNKNOWN.
- **`target_if`, including FIRST mode,** is evaluated only when the
  candidate domain and the ordering the pinned APL requires are
  established.
  - An unobserved or unproven target that could change the selection makes
    the decision UNKNOWN.
  - It is never evaluated over only the conveniently observed targets.
  - Parser, actor-id or event order is never authority unless pinned
    SimulationCraft semantics make it so.
- **Target-dependent `if=`** resolves only when every evidence-consistent
  world selects the same supported action. This fits the existing rule
  that an unresolved higher line never falls through.
- **Evidence.** Already-trusted normalized combat and encounter evidence and
  pinned mechanics only. A new source needs explicit provenance and
  semantics. Never used:
  - proximity guesses;
  - synthetic counts;
  - remembered layouts;
  - guide counts;
  - top-log behavior;
  - unrepresented client assumptions.
- **Ownership.** The shared layer (gameplay-neutral, with no spec
  conditionals) owns:
  - hostile-actor identity;
  - lifecycle evidence;
  - the EXACT, BOUNDED and UNKNOWN set;
  - generic count queries;
  - convergence across count worlds.

  Specialization or action code owns:
  - ability target eligibility;
  - range and geometry;
  - spec target-selection meaning.
- **Invariance.** Existing PUBLIC analyzers stay invariant except where
  compatible shared semantics explicitly cover them; any change is
  measured and pinned.
- **Network.** No Warcraft Logs activity is authorized by this decision.

**Done when:**

- `TARGET_COUNT` is no longer a blanket permanent blocker;
- exact, bounded and unknown semantics are explicit and tested;
- missing evidence still fails closed;
- the four expression families resolve only to the strength their
  evidence permits;
- public analyzers stay invariant as above;
- affected INTERNAL_ONLY specs can be replayed (ONB-S3R);
- no specialization is promoted by this tranche.

**Direction.** The M11-D0 census (pinned `target_if` semantics), CLAUDE.md
"Multi-Target Support", and `agent/follow-ups.md` "After M11-D3-B". ONB-B1 measured
that every Arms decision stops here. ONB-B2 found the same count behind every rotation list of Frost
Death Knight and Enhancement Shaman, and that Frost also meets `target_if=first` before it.
ONB-B3 measured that every Devourer decision stops on it too. ONB-C1 found all four of Feral's finisher
and builder dispatches read it, behind other open lines. ONB-D1 measured that every Destruction decision meets it
first, on either hero tree's area list
(`agent/follow-ups.md` "After ONB-B1", "After ONB-B2", "After ONB-B3", "After ONB-C1", "After ONB-D1").

### ONB-S3R: Re-replay the TARGET_COUNT-gated INTERNAL_ONLY specializations

```autopilot
status: MERGED
dependsOn: ONB-S3
wcl: NONE
publicContract: NONE
pr: 89
mergeSha: 5011ee3695da3936467d2a993527ab258d765956
```

**Direction.** Owner decision (2026-11-05) on ONB-S3, "Promotion
semantics": lifting `TARGET_COUNT` makes no specialization PUBLIC.

**Scope.**

1. **Replay.** Replay, offline against retained real evidence, every
   INTERNAL_ONLY specialization whose first unresolved authority path was
   `TARGET_COUNT`. At minimum this covers:
   - Subtlety Rogue, Fury Warrior and Protection Warrior;
   - Arms Warrior;
   - Frost Death Knight and Enhancement Shaman;
   - Devourer Demon Hunter;
   - Feral Druid;
   - Destruction Warlock;
   - any other onboarded specialization whose recorded first stop is
     `TARGET_COUNT`, found by searching the inventory and the
     `agent/follow-ups.md` "After ONB-*" sections.

   Cohort T (Windwalker, Guardian, Beast Mastery, Survival) is replayed
   in ONB-T1 and ONB-T2.
2. **Next blocker.** Record each one's next real blocker in
   `agent/spec-onboarding-inventory.md` and `agent/follow-ups.md`.
3. **Fixes.** Resolve only blockers that existing supported semantics
   cover. A new authority or evidence-semantics question is an owner stop.
4. **Promotion.** Where a specialization's internal validation (requirement
   C) now passes, add a separate public re-promotion entry for it (`ONB-*P2`,
   `publicContract: EXPECTED`) through the existing, unchanged MATCH and
   REJECTED promotion gates. This tranche promotes nothing itself.

**Outcome.** Every retained subject replayed offline. Destruction gains 4 real MATCH, all Summon Infernal, and no other specialization resolves a decision. Requirement C passes for none, so no `ONB-*P2` entry is added. No blocker is covered by existing semantics, and the widest is an upper bound on the count, which only the unscheduled Policy B could supply (agent/architecture.md "ONB-S3R"; agent/follow-ups.md "After ONB-S3R").

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
status: PR_OPEN
dependsOn: ONB-EV-PLAN
branch: autopilot/onb-ev
wcl: OWNER-GRANT: agent/autopilot-queue.md ONB-EV owner grant (2026-11-06); ONB-EV only; one neutral campaign running ONB-EV-PLAN's frozen plan for its listed specializations; per specialization the first qualifying public raid fight under the recorded fixed discovery rule, with no replacement fight or alternate subject because of any result; only the minimum actor and fight evidence the existing evaluator and promotion gate need (casts, auras, resources, combatant information and the fight context and actor identification they require); no rankings, comparison or top-log data; at most 60 Warcraft Logs HTTP requests in total, counting OAuth token requests and refreshes, discovery, fight and context lookups, actor identification, event retrieval, pagination and completeness requests; stop with OWNER_DECISION_REQUIRED before exceeding 60; no archive-limit increase and no promotion; owner decision (2026-11-07): the 2 requests of attempt 1 are authorized and count; one identical retry of the failed listing, to preserve and classify its response, counts; if that response demonstrates the listing's API or query shape is invalid or unsupported, a reviewed new plan revision may change only the minimum listing mechanics needed to obtain the same deterministic candidate population, with all later requests inside the same 60
publicContract: NONE
```

**First run (2026-11-07): stopped for the owner.** Warcraft Logs refused the plan's first listing, so the campaign stopped after 2 of its 60 requests, with no evidence captured (`agent/follow-ups.md` "After ONB-EV's first run", `tests/evidence/onb-ev-capture.md`).

**Owner decision (2026-11-07): listing retry approved** (`agent/architecture.md` "Owner decision (2026-11-07): ONB-EV listing retry"). The owner confirmed the first run's 2 requests. The cap stays 60 in total and is not reset.

1. **Carry the count forward.** Requests are cumulative from attempt 1, and the existing ledger is continued, never deleted or restarted. The runner's guard against a second run may be changed only to continue that count.
2. **Retry once.** Send the identical failed listing exactly one more time. Retain the HTTP status, GraphQL or API error category, error code if supplied, sanitized error text, and whether the failure is attributable to the listing's query or argument shape. Never retain or commit OAuth tokens, authorization headers, client secrets or other credentials.
3. **If the response demonstrates an invalid or unsupported listing shape,** make a new plan revision changing only the minimum listing mechanics needed for the same deterministic candidate population, such as correcting an unsupported argument, a field or pagination shape, splitting a request into the minimum equivalent supported requests, or using an API-supported form that preserves the same universe and ordering. Record it as an API-compatibility correction, test and review it before any further acquisition, and keep the old failed request and the reason recorded. Restate the budget.
4. **Must not change:** the specialization set, neutral purpose, first-qualifying-fight rule, deterministic selection semantics, no-ranking and no-comparison rule, no-outcome-shopping rule, exclusions, minimum-evidence principle, and the 60-request cap. Never inspect gameplay outcomes and then change selection criteria, and never broaden the search because the candidate population is inconvenient.
5. **Stop again with OWNER_DECISION_REQUIRED,** with no revision, if the response indicates authentication or credential failure, authorization or scope failure, an account or API access restriction, rate limiting, a service outage, budget exhaustion, or a cause that cannot be confidently attributed to listing shape. Stop also if the only workable repair would materially alter the candidate universe, selection rule, evidence predicate, purpose or cap.
6. **Audit disclosure.** The supervisor's audit does not detect this runner (`agent/follow-ups.md` "After ONB-EV's first run"), so every request stays in the ledger and `tests/evidence/onb-ev-capture.md`, and the owner confirms from those. Commit this record with the attempt.

**Owner grant (2026-11-06): APPROVED with a hard campaign cap of 60 Warcraft Logs HTTP requests in total** (`agent/architecture.md` "Owner grant (2026-11-06): ONB-EV"). This entry acquires evidence and promotes nothing. It runs ONB-EV-PLAN's frozen plan.

**Plan revision 2 (2026-11-07), an API-compatibility correction under the owner's decision.** Digest `49303e1c03d0a056829b3474c1c47dc8cf0a37ca99ba5c532c74650c5519828f`. The retry showed "Max query complexity should be 50000 but got 100701", so one listing request of limit 100 is now three of limit 34, reassembled into the same 100 positions. Nothing else changes (`agent/architecture.md` "ONB-EV plan revision 2"). The text below describes revision 1 where it differs.

**The frozen plan (ONB-EV-PLAN).** `agent/onb-ev-plan.json`, digest `48066f986e7035542bf81c0263f4cec0d9d70e0f3d892ab6eb7ed535e6fa0013`, with its rule in `scripts/corpus/onb-ev-selection.mjs`, run as written. It removes no specialization. Its worst case exceeds the cap, and no fixture fits the archive's notice line, so expect both stops below.

**Recorded specializations (12).** Discipline Priest, Subtlety Rogue, Fury Warrior, Protection Warrior, Enhancement Shaman, Outlaw Rogue, Guardian Druid, Survival Hunter, Frost Mage, Affliction Warlock, Marksmanship Hunter and Vengeance Demon Hunter. ONB-EV-PLAN removes any that no longer qualify. Restoration Druid and Preservation Evoker were removed earlier: their evidence is retained.

**Acquisition rules.**

- The 60-request cap includes all Warcraft Logs network activity of this campaign: OAuth token requests and refreshes, report and fight discovery, fight and context lookups, actor identification, casts, auras, resources, combatant information, and pagination or completeness requests.
- Follow the recorded neutral discovery rule: per specialization, the first qualifying public raid fight in the fixed order ONB-EV-PLAN froze.
- Acquire only the minimum actor and fight evidence the existing evaluator and promotion gate need.
- Query no rankings and no comparison or top-log data.
- Never search for a different fight because the first result gave UNKNOWN, MATCH, REJECTED or otherwise unfavorable evidence, and never retry against alternate subjects to obtain an outcome.
- Preserve provenance and the deterministic selection criteria, and record every request in the review packet.
- The campaign may stop early once every eligible specialization has sufficient retained evidence for a truthful promotion evaluation.
- Any detected activity stops for the owner's audit confirmation, as `agent/autopilot.md` requires.
- This grant covers ONB-EV only. It does not cover the Policy B census (POLB-CENSUS).

**If the cap would be exceeded:** stop with OWNER_DECISION_REQUIRED before exceeding 60. Report:

- requests consumed and requests remaining;
- specializations completed and specializations still requiring evidence;
- why each remaining request is necessary;
- the measured additional request amount proposed.

**Archive and corpus capacity.** This grant authorizes no size-limit increase. If new evidence cannot be committed under the existing policy, stop with OWNER_DECISION_REQUIRED and give the measured proposal:

- the current archive size and limit;
- the bytes the proposed retained evidence requires;
- the deduplication and compression opportunities considered;
- the smallest justified new limit.

Never discard required evidence to fit, and never raise the allowance silently.

**Afterward.** Acquisition authorizes no promotion. Replay the normal evaluator through REM-CENSUS, preserving MATCH, REJECTED and UNKNOWN semantics, apply the existing promotion gates unchanged, and expose the next real blocker where a specialization still cannot pass.

**Direction.** The owner's onboarding evidence policy: neutral, outcome-independent acquisition. Until this has run, the affected specializations stay INTERNAL_ONLY.

**Why each specialization is listed (history from the onboarding tranches).** Authorize one bounded, neutral, deterministic Warcraft Logs evidence campaign for the specializations that have no retained, already-authorized real evidence. Known today: Fury Warrior, Protection Warrior, Outlaw Rogue, Survival Hunter and Vengeance Demon Hunter appear in no committed fight context, and onboarding tranches append any further spec whose review finds its evidence inadequate. Appended by ONB-B2: Enhancement Shaman (the only retained events are the filtered M13-A casts of actor 7, with no combatant info, so its talents never resolve). Appended by HEAL-B1P, and corrected by HEAL-B4P: Restoration Druid needs no campaign (its whole-fight events in gtKb2xHn87pNcFfW fight 22, actor 2, are in the retained M9-C2, M11-C4 and M11-C4b captures, which HEAL-B1P's census did not read; agent/follow-ups.md "After HEAL-B4P"). Appended by HEAL-B3: Discipline Priest (committed evidence is a filtered M13-A cast capture, actor 9, and Atonement applications by the G2 cohort246 fight 33 actor 88 onto another player; no committed or retained capture holds its whole-fight casts or any Atonement heal event, and fight 48 has no Discipline Priest, so HEAL-B3P cannot meet the healer promotion gate). (Preservation Evoker, appended by HEAL-B4, was removed by HEAL-B4P: it passed the gate on retained evidence.) Appended by ONB-A2: Subtlety Rogue (committed evidence is 150 filtered M13-A casts of actor 17, with no combatant info, auras or resources, so its talents never resolve); its census also found Fury and Protection Warrior only in retained fight contexts, with no event. The proposal is the smallest campaign: per spec, the first public raid fight in a fixed order containing it, with its actor slice (casts, auras, resources, combatant info), and no ranking or comparison data. Confirmed by ONB-C2: Outlaw Rogue, whose only context is the uncommitted g34mvXTKLMJ2Nfwr fights 1, 6 and 7, actor 17, with no event retained. Appended by ONB-D3: Frost Mage (the only real casts are 103 filtered M13-A casts of actor 6, with no combatant info, and one cast in a two-second page, so nothing has met real evidence). Appended by ONB-D4: Affliction Warlock and Marksmanship Hunter (the only real casts are the filtered M13-A casts of actors 20, 14 and 18, with no combatant info, so each refuses PROFILE_NOT_RESOLVED).

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
status: MERGED
dependsOn: HEAL-A
branch: autopilot/heal-ap
wcl: NONE
publicContract: EXPECTED
pr: 46
mergeSha: 7abddea1241e35e5066125b1843479915af2eb37
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
status: MERGED
dependsOn: HEAL-A
branch: autopilot/heal-b1
wcl: NONE
publicContract: NONE
pr: 47
mergeSha: 760f83f75d80ab5720e34a8808fb1fded71a4cb0
```

**Scope.** Three healer evaluators on the proven healer architecture. Each
has its own reviewed healing-cooldown identity and runtime data under its
own tree, and consumes the shared `RaidCooldownPlan` and the
`src/healing/` primitives. The M12-D verdict-category limits apply to each.

### HEAL-B1P: Holy Paladin, Restoration Druid and Mistweaver Monk (public)

```autopilot
status: MERGED
dependsOn: HEAL-B1, HEAL-AP
branch: autopilot/heal-b1p
wcl: NONE
publicContract: EXPECTED
pr: 48
mergeSha: f066fd39841ef16e0aeff21cc3d88f30290f9206
```

**Outcome.** Holy Paladin and Mistweaver Monk passed the HEAL-AP healer
promotion gate on their whole-fight casts in b1PmaKrd6CDfzngc fight 48, cut
from the retained M11-E2 capture (no new request), and are PUBLIC. Restoration
Druid cannot pass: no retained, authorized capture holds one of its events. It
stays INTERNAL_ONLY, recorded in `agent/spec-onboarding-inventory.md`, and its
evidence gap is ONB-EV's (rule 4).

### HEAL-B2: Holy Priest (internal)

```autopilot
status: MERGED
dependsOn: HEAL-B1
branch: autopilot/heal-b2
wcl: NONE
publicContract: NONE
pr: 49
mergeSha: b2658f252ae3616f19cafd4e36ab33b134fc06ad
```

**Outcome.** Holy Priest is registered INTERNAL_ONLY on the HEAL-B1 healer
architecture, with its own pinned healing-cooldown identity (Divine Hymn and
Apotheosis), and is evaluated over committed real evidence (the M13-A Holy
Priest's three observed casts; fight 48 actor 2). HEAL-B2P's healer gate needs
the fight-48 Holy Priest's whole-fight casts, not yet committed
(agent/follow-ups.md "After HEAL-B2").

### HEAL-B2P: Holy Priest (public)

```autopilot
status: MERGED
dependsOn: HEAL-B2, HEAL-AP
branch: autopilot/heal-b2p
wcl: NONE
publicContract: EXPECTED
pr: 50
mergeSha: 188fca2db853bddfba3f908321fe41b5f600b6cc
```

**Outcome.** Holy Priest passed the HEAL-AP healer promotion gate on its
whole-fight casts in b1PmaKrd6CDfzngc fight 48 (actor 2: three Apotheosis and
three Divine Hymn casts), cut from the retained M11-E2 capture (no new
request), and is PUBLIC. Restoration Druid is the one INTERNAL_ONLY healer
left (ONB-EV).

### HEAL-B3: Discipline Priest (internal, own representative)

```autopilot
status: MERGED
dependsOn: HEAL-B1
branch: autopilot/heal-b3
wcl: NONE
publicContract: NONE
pr: 51
mergeSha: 1a7c7568252a39b1959fb535706333a4a9912dbd
```

**Scope.** Discipline heals substantially through damage (Atonement), a
pattern the healing primitives do not yet represent. Treat it as its own
representative:

- Model what is observable (atonement application and damage-to-healing
  attribution as reported) without per-cast quality verdicts.
- Anything the evidence cannot attribute is UNKNOWN.

**Outcome.** Discipline Priest is registered INTERNAL_ONLY on the HEAL-B1
healer architecture with its own pinned healing-cooldown identity (Power Word:
Barrier, Ultimate Penitence, Evangelism) and its own pinned Atonement identity,
and reports its observed Atonement applications and the Atonement heals
Warcraft Logs reports as facts, the damage-to-heal link always UNKNOWN
(agent/architecture.md "HEAL-B3"). HEAL-B3P's healer gate needs a Discipline
Priest capture with whole-fight casts, which no committed or retained evidence
holds (agent/follow-ups.md "After HEAL-B3"; appended to ONB-EV).

### HEAL-B3P: Discipline Priest (public)

```autopilot
status: MERGED
dependsOn: HEAL-B3, HEAL-AP
branch: autopilot/heal-b3p
wcl: NONE
publicContract: EXPECTED
pr: 52
mergeSha: 840f9fda9a266120ac2dce9f5d2bdd6e2c35d31e
```

**Outcome.** Discipline Priest cannot pass the HEAL-AP healer promotion gate
and stays INTERNAL_ONLY (onboarding rule 4); nothing is promoted and the public
contract is unchanged. The gate needs a real subject whose cooldown listing is
COMPLETE, and no committed or retained capture can supply one:

- the committed Discipline Priest evidence (M13-A actor 9; G2 cohort246 fight
  33 actor 88) is filtered or PLAYER_CONTEXT, so every listing is UNKNOWN;
- the canonical fight 48 (retained M11-E2 capture) has no Discipline Priest;
- the only other unfiltered retained capture (M11-C4f, rXAfw9t1q8YpmkKD fight
  13) has no Discipline Priest and covers 165 s of a 271.8 s fight;
- no retained raw page file (M10-B, M10-C5, M11-C4f) holds one event of
  Power Word: Barrier, Ultimate Penitence, Evangelism, Penance or Atonement.

The evidence gap stays on ONB-EV, as HEAL-B3 recorded. A Discipline Priest
promotion after ONB-EV supplies evidence is a new public entry that meets the
unchanged gate and decides the public Atonement shape
(agent/architecture.md "HEAL-B3P"; agent/follow-ups.md "After HEAL-B3").

### HEAL-B4: Preservation Evoker (internal, own representative)

```autopilot
status: MERGED
dependsOn: HEAL-B1
branch: autopilot/heal-b4
wcl: NONE
publicContract: NONE
pr: 53
mergeSha: e45096845c03ff275d9605260e94746e0c719e95
```

**Scope.** Preservation combines empowered casts with a roster role the
pinned data leaves UNKNOWN, so it is its own representative. Use the
declared roster classification, never guess a role, and reuse ONB-S4's
anchor if it has landed.

**Outcome.** Preservation Evoker is registered INTERNAL_ONLY on the HEAL-B1
healer architecture with its own pinned healing-cooldown identity (Rewind;
Dream Flight and Stasis on one choice node), none of them empowered. Its
roster role stays UNKNOWN, carried as pinned and never guessed. A `cast` of an
empowered spell is its start (pinned wire fact, M13-A actor 8), so the
evaluator stops as RUNTIME_DATA_CONTRADICTED when the player is observed
casting an identified ability empowered. ONB-S4's anchor has landed and is not
consumed: no healer category anchors a decision, and its execution profile has
no empowered kind (agent/architecture.md "HEAL-B4"). Evaluated over the M13-A
Preservation Evoker's casts (listing UNKNOWN, filtered capture). Its statement
that no retained evidence holds a whole-fight Preservation Evoker was wrong; see
HEAL-B4P.

### HEAL-B4P: Preservation Evoker (public)

```autopilot
status: MERGED
dependsOn: HEAL-B4, HEAL-AP
branch: autopilot/heal-b4p
wcl: NONE
publicContract: EXPECTED
pr: 54
mergeSha: 93150b5c1e59638bc04af9d523535471c0f589f2
```

**Outcome.** Preservation Evoker passed the HEAL-AP healer promotion gate on its
whole-fight casts in gtKb2xHn87pNcFfW fight 22 (actor 15: three Stasis casts and
one Rewind), cut from the three adjoining retained captures of that fight
(M9-C2 opener, M11-C4, M11-C4b; no new request), and is PUBLIC. The public
contract gains the `specId` `evoker/preservation` and the healer NOT_ASSESSED
reason `RUNTIME_DATA_CONTRADICTED`. Its evidence gap is off ONB-EV. The same
census shows that fight's Restoration Druid (actor 2) is retained whole too, so
its ONB-EV entry is wrong and its promotion needs no new request
(agent/follow-ups.md "After HEAL-B4P").

### ONB-A1: Havoc Demon Hunter (internal, Cohort A representative)

```autopilot
status: MERGED
dependsOn: ONB-S1
branch: autopilot/onb-a1
wcl: NONE
publicContract: NONE
pr: 55
mergeSha: b2af8bfde38b409c0190e56a616721b9f8dd226d
```

**Scope.** Cohort A representative: an instant builder/spender list with
no `run_action_list` and precombat-assigned variables. Its authority is
already audited, and its real evidence is retained (fight 48).

Known stops from the D3 probes:

- `retarget_auto_attack,line_cd=1`;
- `gcd.max` at `default[3]`.

**Outcome.** Havoc Demon Hunter is registered INTERNAL_ONLY on the observed-decision
pattern. Both known stops are passed on Aldrachi Reaver builds. What it can decide on
current evidence is narrow: the Reaver's Glaive priority. On fight 48 actor 18 the
whole fight resolves 47 of 279 eligible decisions (24 MATCH, 23 REJECTED), every
resolved one naming `default[9]`, and the retained first 90 s, the only part that
fits under the archive's notice line, resolves 11 of 76 (7 MATCH, 4 REJECTED) over
three distinct tokens. The promotion readiness report passes both gates with no control.
The Hunt's pinned cooldown is contradicted by the wire and is never bounded, which stops
184 decisions. Whether this narrow surface should be promoted is ONB-A1P's question
(agent/architecture.md "ONB-A1"; agent/follow-ups.md "After ONB-A1").

### ONB-A1P: Havoc Demon Hunter (public)

```autopilot
status: MERGED
dependsOn: ONB-A1
branch: autopilot/onb-a1p
wcl: NONE
publicContract: EXPECTED
pr: 56
mergeSha: 7938617e8cde3c90088d203f9de81e9a9c7352fb
```

**Outcome.** Havoc Demon Hunter passed both rotational gates (observation and
discrimination) on its real decisions in b1PmaKrd6CDfzngc fight 48 actor 18, with no
control, and is PUBLIC for Aldrachi Reaver builds only. A Fel-Scarred build, which was
never measured, is refused as AUTHORITY_NOT_AVAILABLE by a validated-profile gate, the
Brewmaster precedent. The public contract gains the `specId` `demonhunter/havoc` and
nothing else. The surface stays narrow, and the document says so: 83% of the whole
fight's decisions are UNKNOWN and every resolved one names the Reaver's Glaive priority
(agent/architecture.md "ONB-A1P").

### ONB-A2: Subtlety Rogue, Fury Warrior and Protection Warrior (internal, Cohort A)

```autopilot
status: MERGED
dependsOn: ONB-A1
branch: autopilot/onb-a2
wcl: NONE
publicContract: NONE
pr: 57
mergeSha: 0955a0753ae62f4d9b2dc2152bffbb5a9d8b68b6
```

**Scope.** Cohort A followers on Havoc's proven pattern.

- Protection Warrior's tank meaning (offensive rotation, separated from
  mitigation) stays its own.
- Fury and Protection Warrior have no known retained evidence: record them
  for ONB-EV if real-evidence validation cannot be met.

**Outcome.** All three are registered INTERNAL_ONLY, each with its own pinned list, data and
evaluator, and no decision of any of them resolves today: an off-GCD action with no reviewed
contract precedes every GCD action, and most of each list reads the enemy count. No retained
capture can validate any of them, so requirement C is not met and all three are on ONB-EV.
Fury and Protection Warrior's lists also need ONB-S3, which the M11-D0 census's Cohort A
description missed (agent/architecture.md "ONB-A2"; agent/follow-ups.md "After ONB-A2").

### ONB-A2P: Subtlety Rogue, Fury Warrior and Protection Warrior (public)

```autopilot
status: MERGED
dependsOn: ONB-A2
branch: autopilot/onb-a2p
wcl: NONE
publicContract: EXPECTED
pr: 58
mergeSha: 15658bcdcd699755bac0bb9df9b992fd67d5d36e
```

**Outcome.** Subtlety Rogue, Fury Warrior and Protection Warrior cannot pass the rotational
promotion gates and stay INTERNAL_ONLY (onboarding rule 4); nothing is promoted and the public
contract is unchanged. The gates need a real MATCH, real resolved decisions over several action
tokens and a real REJECTED or control, and neither input exists:

- no decision of any of the three resolves on any input, because each list stops first at a line
  ONB-A2 could not close;
- no committed or retained capture can supply a subject. Subtlety has 150 filtered M13-A casts
  with no combatant info and none of its own auras or resources, and Fury and Protection Warrior
  have fight contexts and not one retained event.

The evidence gap stays on ONB-EV. New evidence alone does not unlock any of them: Fury and
Protection Warrior also need ONB-S3, and all three need the off-GCD contracts and aura and cooldown
bindings ONB-A2 left open. A promotion after that is a new public entry through the unchanged gates
(agent/architecture.md "ONB-A2P"; agent/follow-ups.md "After ONB-A2").

### ONB-B1: Arms Warrior (internal, Cohort B representative)

```autopilot
status: MERGED
dependsOn: ONB-S1
branch: autopilot/onb-b1
wcl: NONE
publicContract: NONE
pr: 59
mergeSha: 1abcb7d79d174e6bdb1dc6d00389abf79eb686e0
```

**Scope.** Cohort B representative: `run_action_list` dispatch with
cooldown windows. Real evidence is retained (fight 48), and the question
`colossus-smash-window-fill` is already identified.

**Outcome.** Arms Warrior is registered INTERNAL_ONLY, and no decision of it resolves: over the whole of fight 48, actor 5 (Slayer), 324
eligible decisions are UNKNOWN, every root scan stopping at the `active_enemies` dispatch. Every GCD action of the list sits behind it, so
requirement C cannot be met until ONB-S3 is decided. `colossus-smash-window-fill` is answered as an internal observation with no verdict: 35
windows, all established. The first 6 s are committed and the unsupported subject moved to A7R6 fight 7 actor 17, Mage/Fire
(agent/architecture.md "ONB-B1"; agent/follow-ups.md "After ONB-B1").

### ONB-B1P: Arms Warrior (public)

```autopilot
status: MERGED
dependsOn: ONB-B1
branch: autopilot/onb-b1p
wcl: NONE
publicContract: EXPECTED
pr: 60
mergeSha: 26eb55720b957c59a34a7340b6b1e4b16b49280c
```

**Outcome.** Arms Warrior cannot pass the rotational promotion gates and stays INTERNAL_ONLY (onboarding rule 4); nothing is promoted and
the public contract is unchanged. Unlike ONB-A2P, evidence is not the gap, so ONB-EV does not apply. Five Arms subjects are retained, and
replayed offline they give 1,207 eligible decisions, 0 MATCH, 0 REJECTED and 1,207 UNKNOWN, every root scan stopping at
`default[17] run_action_list` on `active_enemies`. The gates need a real MATCH, so the next step is the owner's ONB-S3 decision, then what
ONB-B1 left open, then a new public entry through the unchanged gates (agent/architecture.md "ONB-B1P"; agent/follow-ups.md "After ONB-B1").

### ONB-B2: Frost Death Knight and Enhancement Shaman (internal, Cohort B)

```autopilot
status: MERGED
dependsOn: ONB-B1
branch: autopilot/onb-b2
wcl: NONE
publicContract: NONE
pr: 61
mergeSha: 3fad83fd212c4a813d3c64385d404124d92bfb7a
```

**Scope.** Cohort B followers on Arms' proven pattern.

- Frost DK relies on the M11-D1 numeric-`react` fix and multi-resource
  (runes and Runic Power) state.
- Enhancement's `bloodlust,line_cd=600` attributes.

**Outcome.** Both are registered INTERNAL_ONLY and no decision of either resolves. Frost's two retained subjects (fight 48 actor 19, gtKb fight 22 actor 26, both
whole fights, both Deathbringer) give 567 eligible decisions, all UNKNOWN, every root scan stopping at Reaper's Mark's `target_if`. Enhancement has no capture that can
validate it (the filtered M13-A casts carry no combatant info), so it joins ONB-EV. Its list needed its own audit: it is a class method whose `add_action( this, ... )`
form emits only under the player's spell data, so Wind Shear's line does not exist at the pin. Requirement C cannot be met for either until ONB-S3 is decided
(agent/architecture.md "ONB-B2"; agent/follow-ups.md "After ONB-B2").

### ONB-B2P: Frost Death Knight and Enhancement Shaman (public)

```autopilot
status: MERGED
dependsOn: ONB-B2
branch: autopilot/onb-b2p
wcl: NONE
publicContract: EXPECTED
pr: 62
mergeSha: 548330bd6a2d2f92ab6ed569f5be9445c42a25f3
```

**Outcome.** Neither passes the rotational promotion gates, so both stay INTERNAL_ONLY (onboarding rule 4); nothing is promoted and the public contract is unchanged. Frost's two retained subjects, replayed offline, give 567 eligible decisions,
0 MATCH, 0 REJECTED and 567 UNKNOWN, every root scan stopping at `cooldowns[4] reapers_mark` on its `target_if`. Evidence is not Frost's gap, so it is not on ONB-EV; it waits on ONB-S3. Enhancement's only subject (the filtered M13-A casts) refuses as
`PROFILE_NOT_RESOLVED`, so it needs ONB-EV, and its list also needs ONB-S3. A wider census found no other subject of either. A promotion after those is a new public entry through the unchanged gates (agent/architecture.md "ONB-B2P"; agent/follow-ups.md "After ONB-B2").

### ONB-B3: Devourer Demon Hunter (internal, own representative)

```autopilot
status: MERGED
dependsOn: ONB-S1, ONB-S2
branch: autopilot/onb-b3
wcl: NONE
publicContract: NONE
pr: 63
mergeSha: 1608df155c28920a0adc3af8d68c1aeab92c2870
```

**Scope.** Devourer is the newest specialization and is unusual: four
`pick_up_fragment,…,line_cd=` pseudo-actions share one token and are never
observed casts, its `void_ray_count` uses `op=add`, and its `react` is
numeric. Handle it alone.

- Pseudo-action timers stay UNKNOWN unless the evidence attributes them.
- It is never forced into Cohort B.

**Outcome.** Devourer is registered INTERNAL_ONLY, and no decision of it resolves. Its three retained subjects (gtKb fight 22 actor 32, whole fight; rXAf fight 13 actors 20 and 79, first 165 s; all Void-Scarred with The Hunt) give 251 eligible decisions, all UNKNOWN,
every root scan stopping at `voidscarred_melee[0] run_action_list` on `active_enemies`. The pick-up timers are UNKNOWN from any log, and behind the count they would stop a scan on their own. Requirement C cannot be met until ONB-S3 is decided (agent/architecture.md "ONB-B3"; agent/follow-ups.md "After ONB-B3").

### ONB-B3P: Devourer Demon Hunter (public)

```autopilot
status: MERGED
dependsOn: ONB-B3
branch: autopilot/onb-b3p
wcl: NONE
publicContract: EXPECTED
pr: 64
mergeSha: a41a68bbe92c932132b3243ea5f348d4318e96f5
```

**Outcome.** Devourer does not pass the rotational promotion gates, so it stays INTERNAL_ONLY (onboarding rule 4); nothing is promoted and the public contract is unchanged. Its three retained subjects, replayed offline, give 251 eligible decisions,
0 MATCH, 0 REJECTED and 251 UNKNOWN, every root scan stopping at `voidscarred_melee[0] run_action_list` on `active_enemies`. A wider census found no other subject. Evidence is not its gap, so it is not on ONB-EV; it waits on ONB-S3. A promotion after that is a new public entry through the unchanged gates (agent/architecture.md "ONB-B3P"; agent/follow-ups.md "After ONB-B3").

### ONB-C1: Feral Druid (internal, Cohort C representative)

```autopilot
status: MERGED
dependsOn: ONB-S5
branch: autopilot/onb-c1
wcl: NONE
publicContract: NONE
pr: 65
mergeSha: 6c17d8fb36a35f5fce02b1c6ff15c8834cbec65b
```

**Scope.** Cohort C representative: pooling, plus form state. Real evidence
is retained (fight 48). `rip-rake-snapshot-refresh` is a recorded question,
for a later deep dive only.

**Outcome.** Feral Druid is registered INTERNAL_ONLY, and no decision of it resolves: its two retained subjects (fight 48 actor 170, whole fight; A7R6 fight 7 actor 1, first 165 s; both Wildstalker) give 372 eligible decisions, all UNKNOWN. Pooling is modelled and proven on synthetic decisions only: `max_energy=1` is read on its one line and the resolver answers the at-maximum question, but no real scan reaches the pool line, because Prowl on an Incarnation build, Tiger's Fury and the enemy count all stand before it. Form state is bound, with two new proofs, and no real cat ability contradicts it. Requirement C cannot be met until ONB-S3 is decided and the inputs listed are bound (agent/architecture.md "ONB-C1"; agent/follow-ups.md "After ONB-C1").

### ONB-C1P: Feral Druid (public)

```autopilot
status: MERGED
dependsOn: ONB-C1
branch: autopilot/onb-c1p
wcl: NONE
publicContract: EXPECTED
pr: 66
mergeSha: d8d00563c76e504502ad77d67e792d5699b6996e
```

**Outcome.** Feral does not pass the rotational promotion gates, so it stays INTERNAL_ONLY (onboarding rule 4); nothing is promoted and the public contract is unchanged. Its two retained subjects, replayed offline, give 372 eligible decisions, 0 MATCH, 0 REJECTED and 372 UNKNOWN, with no real scan reaching the enemy count or the pool line, and no real Bite below that line. A wider census found no other subject. Evidence is not its gap, so it is not on ONB-EV; it waits on the inputs before the enemy count and on ONB-S3. A promotion after those is a new public entry through the unchanged gates (agent/architecture.md "ONB-C1P"; agent/follow-ups.md "After ONB-C1").

### ONB-C2: Outlaw Rogue (internal, Cohort C)

```autopilot
status: MERGED
dependsOn: ONB-C1
branch: autopilot/onb-c2
wcl: NONE
publicContract: NONE
pr: 67
mergeSha: d41df35b245a5997d4acba77eeba57c4f0053e23
```

**Scope.** Cohort C follower. No retained evidence is known, so it is
recorded for ONB-EV if real-evidence validation cannot be met.

**Outcome.** Outlaw Rogue is registered INTERNAL_ONLY, and no decision of it resolves: every one stops at `default[0] stealth`. A census of 5,677 retained files finds no cast of its signature abilities, so it stays on ONB-EV and Requirement C cannot be met. Its pooling resolver is proven on synthetic decisions, and says only that a false guarded condition is not resource limited; anything else is UNKNOWN, so POOLS is unreachable (agent/architecture.md "ONB-C2"; agent/follow-ups.md "After ONB-C2").

### ONB-C2P: Outlaw Rogue (public)

```autopilot
status: MERGED
dependsOn: ONB-C2
branch: autopilot/onb-c2p
wcl: NONE
publicContract: EXPECTED
pr: 68
mergeSha: b46cbed381b35ec975fca5678739dac46ae65dd8
```

**Outcome.** Outlaw does not pass the rotational promotion gates, so it stays INTERNAL_ONLY (onboarding rule 4); nothing is promoted and the public contract is unchanged. A census of 5,679 retained files finds no event, of any type, of its signature abilities, so there is nothing to replay and it stays on ONB-EV. A capture alone would resolve nothing either: every decision stops at Stealth, and Kick and the `cds` list follow. A promotion is a new public entry through the unchanged gates (agent/architecture.md "ONB-C2P"; agent/follow-ups.md "After ONB-C2").

### ONB-T1: Windwalker Monk (internal, Cohort T representative)

```autopilot
status: MERGED
dependsOn: ONB-S3, ONB-S1
branch: autopilot/onb-t1
wcl: NONE
publicContract: NONE
pr: 90
mergeSha: f2a77d594da12bb9953f5588aceda16435c3a366
```

**Scope.** Cohort T representative: target selection, under the ONB-S3
authority decision. Real evidence is retained (fight 48).

Settle the follow-up "Whole-line blocker classification for refused
`target_if` lines" before any Windwalker-shaped authority becomes public.

**Outcome.** Windwalker Monk is registered INTERNAL_ONLY, and no decision of it resolves: all 239 eligible decisions of its one retained subject (b1Pm fight 48 actor 13, Shado-Pan) stay UNKNOWN, refused at `default[0] auto_attack`, with the root scan stopped at `zenith[3]` on a refused `target_if`. No dispatch on the enemy count is reached, so ONB-S3 moves nothing here. The follow-up above is settled: a line whose `target_if` was read classifies by its condition, and nothing public moves (agent/architecture.md "ONB-T1"; agent/follow-ups.md "After ONB-T1").

### ONB-T1P: Windwalker Monk (public)

```autopilot
status: MERGED
dependsOn: ONB-T1
branch: autopilot/onb-t1p
wcl: NONE
publicContract: EXPECTED
pr: 91
mergeSha: 49dfccf27371a099da903ef2bfc611baad2e3880
```

**Outcome.** It does not pass the rotational promotion gates, so it stays INTERNAL_ONLY (onboarding rule 4); nothing is promoted and the public contract is unchanged. Its one retained subject, Shado-Pan, replayed offline, gives 239 decisions, 0 MATCH, 0 REJECTED, all UNKNOWN, output identical to ONB-T1's apart from a wall-clock field. A census of 5,989 retained files finds no other subject: gBMC fight 33 actor 1 holds combatant info and one Roll in a diagnostic sample, and every other hit with a mapped source is a Mistweaver's or a Brewmaster's. Evidence is not its first gap, so it is not on ONB-EV, and ONB-S3 alone moves nothing. A promotion after its own inputs, first the swing's entry and the lines behind it, is a new public entry through the unchanged gates (agent/architecture.md "ONB-T1P"; agent/follow-ups.md "After ONB-T1").

### ONB-T2: Guardian Druid, Beast Mastery Hunter and Survival Hunter (internal, Cohort T)

```autopilot
status: MERGED
dependsOn: ONB-T1, ONB-S6
branch: autopilot/onb-t2
wcl: NONE
publicContract: NONE
pr: 92
mergeSha: 3cbc6d171014f44b8121e9ca11651dcd6cceeb05
```

**Scope.** Cohort T followers.

- Guardian keeps tank meaning separate from offense.
- Beast Mastery uses ONB-S6 pet mapping; `barbed-shot-charge-capping` is a
  recorded question.
- Survival's `retarget` and `fight_style.dungeonroute` gate stay UNKNOWN
  where unsupported. It has no retained evidence, so it is recorded for
  ONB-EV if needed.

**Outcome.** All three are registered INTERNAL_ONLY, the last unregistered rows of the roster, and no decision of any of them resolves. Beast Mastery's four retained subjects, all Pack Leader, give 707 eligible decisions, all UNKNOWN, every scan stopping at `default[0] retarget`. Guardian and Survival have no retained subject, so both are on ONB-EV: on synthetic builds Guardian stops at Heart of the Wild's unresolved talent and Survival at `retarget`. Beast Mastery builds no pet state, because its list reads no pet atom, and `barbed-shot-charge-capping` stays a recorded question. The unsupported subject stays actor 20, publicly unsupported, because no real identity is outside every `SpecId` any more (agent/architecture.md "ONB-T2"; agent/follow-ups.md "After ONB-T2").

### ONB-T2P: Guardian Druid, Beast Mastery Hunter and Survival Hunter (public)

```autopilot
status: MERGED
dependsOn: ONB-T2
branch: autopilot/onb-t2p
wcl: NONE
publicContract: EXPECTED
pr: 93
mergeSha: ec05be3e29fca81e4df7367f12f1f737941e6e67
```

**Outcome.** None of the three passes the rotational promotion gates, so all stay INTERNAL_ONLY (onboarding rule 4); nothing is promoted and the public contract is unchanged. Beast Mastery's four retained subjects, all Pack Leader, replayed offline, give 707 decisions, 0 MATCH, 0 REJECTED, all UNKNOWN, identical to ONB-T2's apart from a wall-clock field. A census of 5,743 retained files finds no other subject: gBMC fight 33 actors 141 (Beast Mastery) and 91 (Guardian) sit in a diagnostic sample, Survival has no combatant info and its one id hit is Marksmanship's, and every other hit is another Druid's, a Primal Earth Elemental's or a subject's pet's. Guardian and Survival stay on ONB-EV. Beast Mastery's first gap is decision inputs, so it is not on ONB-EV, and ONB-S3 alone moves nothing. A promotion after those inputs is a new public entry through the unchanged gates (agent/architecture.md "ONB-T2P"; agent/follow-ups.md "After ONB-T2").

### ONB-D1: Destruction Warlock (internal, Cohort D representative)

```autopilot
status: MERGED
dependsOn: ONB-S4
branch: autopilot/onb-d1
wcl: NONE
publicContract: NONE
pr: 69
mergeSha: 6cdf7c74d6ded165adf139b4339ba7481693d097
```

**Scope.** Cohort D representative on the ONB-S4 cast and channel anchor.
Real evidence is retained. Ritual Clipping ownership stays
`UNRESOLVED_DIABOLIST_HERO_TREE` (`agent/m11-spec-coaching-inventory.md`);
it is a deep-dive question, not a blocker for the rotational slice.

**Outcome.** Destruction Warlock is registered INTERNAL_ONLY, and no decision of it resolves: its two retained subjects (A7R6 fight 7 actors 12 and 15, first 165 s, both Hellcaller) give 220 eligible decisions, all UNKNOWN, every scan meeting the enemy count at `default[3]`. It is the first reader of the ONB-S4 anchor: 103 decisions are instant and 4 Soul Fires pair an observed begin, while all 111 Chaos Bolts and Incinerates stay ambiguous, because each spell has a -100% cast-time row no pinned source excludes, and 2 Soul Fires began before the pull. An unestablished anchor is never judged. Requirement C cannot be met until ONB-S3 is decided and the inputs listed are bound (agent/architecture.md "ONB-D1"; agent/follow-ups.md "After ONB-D1").

### ONB-D1P: Destruction Warlock (public)

```autopilot
status: MERGED
dependsOn: ONB-D1
branch: autopilot/onb-d1p
wcl: NONE
publicContract: EXPECTED
pr: 70
mergeSha: 5502bcad59748bacead8e25ccdf25d37b3c3f96e
```

**Outcome.** Destruction does not pass the rotational promotion gates, so it stays INTERNAL_ONLY (onboarding rule 4); nothing is promoted and the public contract is unchanged. Its two retained subjects, replayed offline, give 220 eligible decisions, 0 MATCH, 0 REJECTED and 220 UNKNOWN, all behind the enemy count, and a census of 5,683 retained files finds no third subject. Evidence is not its gap, so it is not on ONB-EV; it waits on ONB-S3 and the inputs behind it. A promotion after those is a new public entry through the unchanged gates (agent/architecture.md "ONB-D1P"; agent/follow-ups.md "After ONB-D1").

### ONB-D2: Elemental Shaman, Balance Druid and Shadow Priest (internal, Cohort D)

```autopilot
status: MERGED
dependsOn: ONB-D1
branch: autopilot/onb-d2
wcl: NONE
publicContract: NONE
pr: 71
mergeSha: 39801bb8f102e8c3af6f89f58939d05d123ff4d9
```

**Scope.** Cohort D casters with DoT maintenance and builder resources
(Maelstrom, Astral Power, Insanity), each with its own meaning. Real
evidence is retained for all three.

**Outcome.** All three are registered INTERNAL_ONLY, and no decision of any of them resolves: 1,210 Elemental decisions (seven retained subjects, all Farseer) stop at the movement option on the list's first line, 287 Balance decisions (three subjects, all Elune's Chosen) at `variable.opener`, and 356 Shadow decisions (two subjects, both Archon) at `target_if` and a contract-less Power Infusion. All three need the rule ONB-D1 said would then move, so a begin before a possibly-instant completion is now never its anchor, in the shared timeline, and Destruction's own refusal is gone. Evidence is not their gap, so none is on ONB-EV, and ONB-S3 alone moves none of them (agent/architecture.md "ONB-D2"; agent/follow-ups.md "After ONB-D2").

### ONB-D2P: Elemental Shaman, Balance Druid and Shadow Priest (public)

```autopilot
status: MERGED
dependsOn: ONB-D2
branch: autopilot/onb-d2p
wcl: NONE
publicContract: EXPECTED
pr: 72
mergeSha: 9cb1d8282a365cdff832ea99c59f01c8a548084d
```

**Outcome.** None of the three passes the rotational promotion gates, so each stays INTERNAL_ONLY (onboarding rule 4); nothing is promoted and the public contract is unchanged. Their twelve retained subjects, replayed offline, give 1,210 Elemental, 287 Balance and 356 Shadow decisions, with 0 MATCH, 0 REJECTED and every decision UNKNOWN, and a census of 5,691 retained files finds no new subject. Evidence is not their gap, so none is on ONB-EV, and ONB-S3 alone moves none of them. A promotion after each one's own inputs is a new public entry through the unchanged gates (agent/architecture.md "ONB-D2P"; agent/follow-ups.md "After ONB-D2").

### ONB-D3: Arcane Mage and Frost Mage (internal, Cohort D)

```autopilot
status: MERGED
dependsOn: ONB-D1
branch: autopilot/onb-d3
wcl: NONE
publicContract: NONE
pr: 73
mergeSha: 629665d9e4e9d25716cebc9d420f264df47f3362
```

**Scope.** Cohort D casters with charge/proc state and numeric `react` (the
M11-D1 fix). Arcane's real evidence is retained (fight 48, actor 121).
Frost Mage's must be verified, or it is recorded for ONB-EV.

**Outcome.** Both are registered INTERNAL_ONLY, and no decision of either resolves. 1,039 Arcane decisions (six retained subjects, all Sunfury) are refused at Counterspell, off the GCD on the list's first line with no contract, and the scan stops at Evocation's unresolved talent. Frost Mage has no retained subject with combatant info, so it is on ONB-EV, and on a synthetic build it stops at the `interrupt_if` option of a Ray of Frost line. Numeric `react` stays UNKNOWN with no stack behind it. No shared code changed, and ONB-S3 alone moves neither (agent/architecture.md "ONB-D3"; agent/follow-ups.md "After ONB-D3").

### ONB-D3P: Arcane Mage and Frost Mage (public)

```autopilot
status: MERGED
dependsOn: ONB-D3
branch: autopilot/onb-d3p
wcl: NONE
publicContract: EXPECTED
pr: 74
mergeSha: 9b771666d37d25a1ee0ce9930fda1cb93bdec896
```

**Outcome.** Neither passes the rotational promotion gates, so each stays INTERNAL_ONLY (onboarding rule 4); nothing is promoted and the public contract is unchanged. Arcane's six retained subjects, replayed offline, give 1,039 decisions, with 0 MATCH, 0 REJECTED and every decision UNKNOWN. Frost's only replayable source, the filtered M13-A actor 6, refuses `PROFILE_NOT_RESOLVED`, so Frost stays on ONB-EV. A census of 5,699 retained files finds no new subject. ONB-S3 alone moves neither. A promotion after each one's own inputs is a new public entry through the unchanged gates (agent/architecture.md "ONB-D3P"; agent/follow-ups.md "After ONB-D3").

### ONB-D4: Affliction Warlock and Marksmanship Hunter (internal, Cohort D)

```autopilot
status: MERGED
dependsOn: ONB-D1
branch: autopilot/onb-d4
wcl: NONE
publicContract: NONE
pr: 75
mergeSha: 7c8920653da2af6709400b70a588834dfd54f481
```

**Scope.** Cohort D casters with multi-DoT (Affliction) or cast-time
shots (Marksmanship). Neither has known retained events, so record them
for ONB-EV if needed.

**Outcome.** Both are registered INTERNAL_ONLY, and no decision of either resolves. Neither has a retained subject with combatant info, so both are on ONB-EV: the filtered M13-A actors 20, 14 and 18 refuse `PROFILE_NOT_RESOLVED` when replayed. On synthetic builds Affliction stops in `end_of_fight` on `fight_remains` and Drain Soul's talent, and Marksmanship at its `retarget` line, before any rotation line. Multi-DoT state stays UNKNOWN, and a simulation's fight style is never read from a real fight. No shared code changed, and ONB-S3 alone moves neither (agent/architecture.md "ONB-D4"; agent/follow-ups.md "After ONB-D4").

### ONB-D4P: Affliction Warlock and Marksmanship Hunter (public)

```autopilot
status: MERGED
dependsOn: ONB-D4
branch: autopilot/onb-d4p
wcl: NONE
publicContract: EXPECTED
pr: 76
mergeSha: 72d0d5484977ee6c4ae79b9dd65b2619b0fec819
```

**Outcome.** Neither passes the rotational promotion gates, so each stays INTERNAL_ONLY (onboarding rule 4); nothing is promoted and the public contract is unchanged. Neither has a resolved decision: the only retained casts, the filtered M13-A actors 20, 14 and 18, refuse `PROFILE_NOT_RESOLVED` when replayed offline. A census of 5,711 retained files finds no new subject, by combatant-info specID as well as by ability id, so both stay on ONB-EV. ONB-S3 alone moves neither. A promotion after each one's own inputs is a new public entry through the unchanged gates (agent/architecture.md "ONB-D4P"; agent/follow-ups.md "After ONB-D4").

### ONB-X1: Fire Mage (internal, own representative)

```autopilot
status: MERGED
dependsOn: ONB-S4
branch: autopilot/onb-x1
wcl: NONE
publicContract: NONE
pr: 77
mergeSha: fc86588e7e4b23ee68cee72c1af5d5dc6d9262f7
```

**Scope.** A holdout from the M11-D0 census. Combustion windows and
crit-proc chains (Heating Up and Hot Streak) need proc-state handling of
their own. Real evidence is retained.

**Outcome.** Registered INTERNAL_ONLY, and no decision resolves. Its one retained subject, A7R6 fight 7 actor 17 (Sunfury, first 165 s), gives 113 decisions, 0 MATCH, 0 REJECTED, all UNKNOWN, every root scan stopping at `default[7]`, the Combustion dispatch, on the cooldowns, the clock and `variable.combustion_delay`, which reads a simulation's planned fight length. No line reading Hot Streak or Heating Up is reached, so the proc chain stays unread, and a test pins that it never decides anything. No shared code changed, and ONB-S3 alone moves nothing. The unsupported-path subject moved to that fight's Devastation Evoker, actor 11 (agent/architecture.md "ONB-X1"; agent/follow-ups.md "After ONB-X1").

### ONB-X1P: Fire Mage (public)

```autopilot
status: MERGED
dependsOn: ONB-X1
branch: autopilot/onb-x1p
wcl: NONE
publicContract: EXPECTED
pr: 78
mergeSha: 14d5fea94f84c043fd930c040143d113cd91fc14
```

**Outcome.** It does not pass the rotational promotion gates, so it stays INTERNAL_ONLY (onboarding rule 4); nothing is promoted and the public contract is unchanged. Its one retained subject, A7R6 fight 7 actor 17, replayed offline, gives 113 decisions, 0 MATCH, 0 REJECTED, all UNKNOWN, output byte-identical to ONB-X1's. A census of 5,714 retained files finds no new subject, by combatant-info specID as well as by named and pinned ability ids. Evidence is not its gap, so it is not on ONB-EV, and ONB-S3 alone moves nothing. The Mage/Fire public refusal row ONB-X1's migration overwrote is restored. A promotion after its own inputs, first an authority for `variable.combustion_delay`, is a new public entry through the unchanged gates (agent/architecture.md "ONB-X1P"; agent/follow-ups.md "After ONB-X1").

### ONB-X2: Devastation Evoker (internal, own representative)

```autopilot
status: MERGED
dependsOn: ONB-S4
branch: autopilot/onb-x2
wcl: NONE
publicContract: NONE
pr: 79
mergeSha: ff71a4f10747418e84c13b40bdd62c04879f9d47
```

**Scope.** A holdout. It has empowered casts (rank by hold time) and a
roster role left UNKNOWN by the pinned data; use the declared M11
classification. `empower-cast-usage` is a recorded question. Real evidence
is retained (fight 48). The unsupported-path subject is this specialization's
A7R6 actor 11 since ONB-X1, so migrate it first (`tests/support/unsupported-subject.ts`).

**Outcome.** Registered INTERNAL_ONLY, and no decision resolves. Its three retained subjects, all Scalecommander (A7R6 fight 7 actor 11, first 165 s; b1Pm fight 48 actor 16 and gtKb fight 22 actor 33, whole fights), give 440 decisions, 0 MATCH, 0 REJECTED, all UNKNOWN: the engine refuses at the off-GCD Quell, and every root scan stops at `sc[0] deep_breath`, on its `cancel_if`. Empowered spells read as channels to the shared anchor, on the pinned constructor and the wire, so the shared code gains no kind. The rank stays unread, every `empower_to` line refuses, and a test pins that the level on the wire changes nothing, so `empower-cast-usage` stays open. The roster role stays UNKNOWN. ONB-S3 alone moves nothing. The unsupported-path subject moved to that fight's Beast Mastery Hunter, actor 20, the last it holds (agent/architecture.md "ONB-X2"; agent/follow-ups.md "After ONB-X2").

### ONB-X2P: Devastation Evoker (public)

```autopilot
status: MERGED
dependsOn: ONB-X2
branch: autopilot/onb-x2p
wcl: NONE
publicContract: EXPECTED
pr: 80
mergeSha: 278c1ef74b750463123ffec587d0f94f98bc2298
```

**Outcome.** It does not pass the rotational promotion gates, so it stays INTERNAL_ONLY (onboarding rule 4); nothing is promoted and the public contract is unchanged. Its three retained subjects, all Scalecommander, replayed offline, give 440 decisions, 0 MATCH, 0 REJECTED, all UNKNOWN, output byte-identical to ONB-X2's. A census of 5,714 retained files finds no new subject, by combatant-info specID as well as by named and pinned ability ids. Evidence is not its gap, so it is not on ONB-EV, and ONB-S3 alone moves nothing. A promotion after its own inputs, first the Quell and `cancel_if` stops, is a new public entry through the unchanged gates (agent/architecture.md "ONB-X2P"; agent/follow-ups.md "After ONB-X2").

### ONB-X3: Vengeance Demon Hunter (internal, own representative)

```autopilot
status: MERGED
dependsOn: ONB-S1, ONB-S2
branch: autopilot/onb-x3
wcl: NONE
publicContract: NONE
pr: 81
mergeSha: 2a4f456bf33bcbe29af8593f3bb1a125080a04ed
```

**Scope.** A holdout. Its in-combat variable programme combines `%`,
`ceil` and charges (`agent/follow-ups.md` "After M11-D3-C2"), so it needs
ONB-S2. Its tank meaning stays separate from offense. No retained evidence
is known, so record it for ONB-EV if needed.

**Outcome.** Registered INTERNAL_ONLY, and no decision resolves. No retained capture holds a cast or combatant info of it, so its gap stays on ONB-EV, and everything is measured on synthetic builds: every query refuses first at `auto_attack`, with Disrupt, Infernal Strike and Demon Spikes open behind it, and each hero list's root scan stops at its unconditional fillers. The tank's mitigation stays out of the offensive authority: active mitigation, defensive cooldowns and self healing each resolve `NO_PINNED_AUTHORITY_FOR_DOMAIN`, and a Demon Spikes press is no decision. ONB-S2 did not carry the variable programme: `%` still does not parse, on nine values, so `time_to_next_glaive` stays UNKNOWN, and a test pins that no refusal reads as zero. No shared code changed, and ONB-S3 alone moves nothing (agent/architecture.md "ONB-X3"; agent/follow-ups.md "After ONB-X3").

### ONB-X3P: Vengeance Demon Hunter (public)

```autopilot
status: MERGED
dependsOn: ONB-X3
branch: autopilot/onb-x3p
wcl: NONE
publicContract: EXPECTED
pr: 82
mergeSha: 3d8c6f4fe89f462686d61690ceec11b8afce5ae4
```

**Outcome.** It does not pass the rotational promotion gates, so it stays INTERNAL_ONLY (onboarding rule 4); nothing is promoted and the public contract is unchanged. A census of 5,714 retained files finds no specID 581 and no event, of any type, of its signature abilities, so there is nothing to replay and it stays on ONB-EV. A capture alone would resolve nothing either: every query refuses first at `auto_attack`, with Disrupt, Infernal Strike and Demon Spikes open behind it, and ONB-S3 alone moves nothing. A promotion is a new public entry through the unchanged gates (agent/architecture.md "ONB-X3P"; agent/follow-ups.md "After ONB-X3").

### ONB-X4: Demonology Warlock (internal, own representative)

```autopilot
status: MERGED
dependsOn: ONB-S4, ONB-S6
branch: autopilot/onb-x4
wcl: NONE
publicContract: NONE
pr: 83
mergeSha: f21be56badfef447b9df961acfc2c4f5e8bda028
```

**Scope.** A holdout. Demon summons and imp counts use ONB-S6 pet mapping,
and Tyrant setup is a recorded question. Ritual Clipping ownership stays
unresolved and is not a blocker. Real evidence is retained (fight 48).

**Outcome.** Registered INTERNAL_ONLY, and no decision resolves. Its seven retained subjects, all Diabolist (b1Pm fight 48 actors 11 and 14, gtKb fight 22 actors 3, 7 and 10, whole fights; rXAf fight 13 actors 6 and 22, first 165 s), give 1,391 decisions, 0 MATCH, 0 REJECTED, all UNKNOWN: 1,245 have no established anchor, and the other 146 refuse at `diabolist[1] hand_of_guldan`, on `buff.dominion_of_argus.up`. It is the first consumer of ONB-S6, with reviewed rows and readings taken at the anchor. Neither pet has a floor, and only the imps have a ceiling, so the Tyrant is never decided and the imp count is a ceiling at best. Every retained fight's catalog holds pets with no stated owner, so every real pet answer is UNKNOWN, and a test pins that a synthetic ceiling does reach the scan. Tyrant setup stays a recorded question, and Ritual Clipping stays unresolved. No shared code changed, and ONB-S3 alone moves nothing (agent/architecture.md "ONB-X4"; agent/follow-ups.md "After ONB-X4").

### ONB-X4P: Demonology Warlock (public)

```autopilot
status: MERGED
dependsOn: ONB-X4
branch: autopilot/onb-x4p
wcl: NONE
publicContract: EXPECTED
pr: 84
mergeSha: 6e08a90d1db7545c53ccc8ce406c6ca831a82c30
```

**Outcome.** It does not pass the rotational promotion gates, so it stays INTERNAL_ONLY (onboarding rule 4); nothing is promoted and the public contract is unchanged. Its seven retained subjects, all Diabolist, replayed offline, give 1,391 decisions, 0 MATCH, 0 REJECTED, all UNKNOWN, output byte-identical to ONB-X4's. A census of 5,714 retained files finds one more source of casts, the filtered M13-A actor 19, which has no combatant info and refuses `PROFILE_NOT_RESOLVED`. Evidence is not its gap, so it is not on ONB-EV, and ONB-S3 alone moves nothing. A promotion after its own inputs, first `buff.dominion_of_argus.up` and Summon Doomguard's lone node, is a new public entry through the unchanged gates (agent/architecture.md "ONB-X4P"; agent/follow-ups.md "After ONB-X4").

### ONB-X5: Unholy Death Knight (internal, own representative)

```autopilot
status: MERGED
dependsOn: ONB-S2, ONB-S6
branch: autopilot/onb-x5
wcl: NONE
publicContract: NONE
pr: 85
mergeSha: e80f30a38727cbfeae74d2c51c0496d2adf01e3b
```

**Scope.** A holdout from the M11-D0 census Cohort E, which is pet- and
variable-heavy on top of `run_action_list` dispatch. It uses ONB-S6 and
ONB-S2, and no retained events are known, so record it for ONB-EV if
needed.

**Outcome.** Registered INTERNAL_ONLY, and no decision resolves. Two of the scope's premises were wrong: a census finds one retained subject, and the pinned list uses `call_action_list` only. rXAf fight 13 actor 18, first 165 s, Rider of the Apocalypse, gives 147 decisions, 0 MATCH, 0 REJECTED, all UNKNOWN, refused at `default[0] auto_attack` with Outbreak, Army of the Dead and Dark Transformation open behind it. It reads the shared pet state at each decision's own cast. No row proves a floor or a ceiling, since the wire contradicts the Lord of the Dead's pinned 15,000 ms, and army ghouls share a gameID with every other Lesser Ghoul, so the pets move no decision. Evidence is not its first gap, so it is not on ONB-EV. No shared code changed, and ONB-S3 alone moves nothing (agent/architecture.md "ONB-X5"; agent/follow-ups.md "After ONB-X5").

### ONB-X5P: Unholy Death Knight (public)

```autopilot
status: MERGED
dependsOn: ONB-X5
branch: autopilot/onb-x5p
wcl: NONE
publicContract: EXPECTED
pr: 86
mergeSha: b68a0f14f9d38830bd98e0128413737b4af587c1
```

**Outcome.** It does not pass the rotational promotion gates, so it stays INTERNAL_ONLY (onboarding rule 4); nothing is promoted and the public contract is unchanged. Its one retained subject, Rider of the Apocalypse, replayed offline, gives 147 decisions, 0 MATCH, 0 REJECTED, all UNKNOWN, output byte-identical to ONB-X5's. A census of 5,717 retained files finds no other subject: gBMC fight 33 actors 195 and 199 hold one Outbreak each in a diagnostic sample, and every other hit is a Blood Death Knight's or a pet's. Evidence is not its first gap, so it is not on ONB-EV, and ONB-S3 alone moves nothing. A promotion after its own inputs, first the swing's entry and the three cooldown lines behind it, is a new public entry through the unchanged gates (agent/architecture.md "ONB-X5P"; agent/follow-ups.md "After ONB-X5").

## Specialization remediation (owner decision, 2026-11-06)

Onboarding does not close at 12 of 40 PUBLIC. The objective is every playable specialization PUBLIC wherever truthful authority, implementation and evidence can be established without weakening a gate: 40 of 40 if they permit it (`agent/architecture.md` "Owner decision (2026-11-06): remediation before roster closure").

`INTERNAL_ONLY` after a failed promotion attempt means first-pass onboarding completed and remediation still required. It is not a terminal disposition.

**Lifecycle:** `INTERNAL_ONLY` → blocker census → missing-input implementation → evidence acquisition if required → real-evidence replay → unchanged promotion gate → `PUBLIC`.

**Rules for every remediation entry (in addition to the onboarding rules):**

1. **Gates never weaken.** Pinned authority and provenance, real sanitized evidence, qualifying observation and discrimination, truthful MATCH, REJECTED and UNKNOWN, cross-spec isolation, public schema compatibility, REST, MCP and raid-night parity, invariance of existing public analyzers, and CI and review all still apply. The goal is to remove legitimate blockers.
2. **A retry needs a changed prerequisite.** A promotion-only tranche is queued only when a known prerequisite of that specialization has changed. A failed retry records the next blocker and the specialization stays in remediation.
3. **BLOCKED** is assigned only when remediation demonstrates that a required fact or authority cannot currently be obtained or implemented truthfully, with that demonstration recorded in the inventory. Since the owner's 2026-11-06 completion rule it records a state and does not close the program: the specialization stays an open item and goes to the owner.
4. **DEFERRED** is assigned only by an explicit owner decision to postpone otherwise feasible work.
5. **Never a reason for either:** a failed first promotion, only UNKNOWN decisions, an already-merged implementation tranche, or remediation needing more work.
6. **Ownership.** Prefer a shared tranche when several specializations share a genuinely generic capability. Specialization mechanics stay under `src/specs/<class>/<spec>/`, with no generic gameplay evaluator and no spec conditionals in shared infrastructure.
7. **Network.** `wcl: NONE` unless the entry carries an `OWNER-GRANT:` from an owner decision. A tranche that finds it needs a new request stops with OWNER_DECISION_REQUIRED, naming the exact evidence and the smallest campaign.
8. **Capacity.** Promotion needs committed evidence, and the existing caps and notice lines stay in force. A tranche whose minimal fixture cannot fit records its measured size. When several cannot fit, raise the measured proposal for the owner; never raise a line silently.
9. **No production deployment** under this program.
10. **Exit criterion (owner, 2026-11-06).** 100% of the playable roster PUBLIC. UNKNOWN stays correct when neither real evidence nor the pinned profile answers, and stays an open remediation item.
11. **No spinning.** A wave that changes no specialization's prerequisite stops with OWNER_DECISION_REQUIRED, naming each stuck specialization and what would move it. It never repeats a retry, and it never weakens a gate to pass.

### HEAL-B1P2: Restoration Druid (public)

```autopilot
status: MERGED
dependsOn: HEAL-B1P, HEAL-B4P
branch: autopilot/heal-b1p2
wcl: NONE
publicContract: EXPECTED
pr: 95
mergeSha: 6351a7c72d8c4c8428bc0d80cbd0efe1dcf04d0a
```

**Outcome.** Not promoted, for capacity alone; it stays INTERNAL_ONLY and goes to REM-CENSUS with that blocker, and nothing is DEFERRED. The public contract is unchanged, and no request was made. In an uncommitted dry run the unchanged healer promotion gate passes on gtKb2xHn87pNcFfW fight 22 actor 2 (two Tranquility and five Convoke the Spirits casts, the listing COMPLETE). The minimal fixture is 131,911 bytes and the archive has 5,212 left under its notice line, so the total would be 4,321,003 against 4,194,304, 126,699 over. Under rule 8 the measured size is recorded and the line is not raised. The choice node reads by observed casts alone. A retry waits on an owner capacity decision, the prerequisite rule 2 needs (agent/architecture.md "HEAL-B1P2"; agent/follow-ups.md "After HEAL-B1P2").

**Direction.** Owner decision (2026-11-06), item 1; `agent/follow-ups.md` "After HEAL-B4P".

**Scope.** Run Restoration Druid through the unchanged healer promotion gate on its retained whole-fight evidence: gtKb2xHn87pNcFfW fight 22, actor 2, in the retained M9-C2, M11-C4 and M11-C4b captures, in HEAL-B4P's shape. No new request.

- Decide how its choice node reads, as `agent/follow-ups.md` records.
- Cut only the minimal fixture, under the archive's notice line.
- If the gate cannot pass, it stays INTERNAL_ONLY with the measured reason and goes to REM-CENSUS. It is not DEFERRED.

### POLB-A: Policy B schema, sampling policy and census plan

```autopilot
status: MERGED
dependsOn: ONB-S3R, HEAL-B1P2
branch: autopilot/polb-a
wcl: NONE
publicContract: NONE
pr: 97
mergeSha: 608bef7abbed1b1f055e027ee133e7f47cdc31fa
```

**Outcome.** Schema, seam, frozen plan and proposal committed, with no row and no request. No acquisition and completeness contract can justify an upper bound, an exact `spell_targets` or a closed `target_if` set, so 1,414 count decisions and 2,301 `target_if` decisions stay UNKNOWN whatever the census returns (`agent/architecture.md` "POLB-A"; `agent/follow-ups.md` "After POLB-A").

**Direction.** Owner decision (2026-11-06), item 3, on `agent/architecture.md` "Policy B (O3)".

**Owner resolution (2026-11-06): the source is Option C,** a neutral, deterministic, separately retained Warcraft Logs census that supplies empirical encounter-state bounds only (`agent/architecture.md` "Owner decision (2026-11-06): Policy B source"). Client data, boss-mod source and owner-authored rows are rejected as Policy B authority, and UNKNOWN remains the fallback.

**Offline only: no Warcraft Logs request.** The source review is in `.probe/polba/source-review.md`; commit what later tranches rely on.

**Scope.**

1. **Schema and seam.** Define the versioned schema, the runtime loader, and the supplier seam behind `enemySetAt`'s upper bound and `targetDomainFor`. The shared layer stays gameplay-neutral. Every datum carries its source report and fight, encounter, build or version applicability where available, acquisition rule, evidence predicate, interval or window, exact or bounded status, completeness status, and source-corpus revision. Curated data must be reproducible from its retained evidence.
2. **Separation.** Define how census evidence is logically and physically distinct from the pulls that evaluate or promote players. No pull may be selected for a target-count result or because it helps a specialization pass.
3. **Sampling policy, fixed before acquisition.** Define:
   - encounter identity and client or build applicability;
   - the deterministic report and fight selection rule, and how many independent pulls or reports it requires;
   - the exact event streams and predicates requested;
   - interval and window construction, which must be independently established, and how a window maps onto an analyzed pull, with UNKNOWN where it cannot;
   - completeness requirements;
   - conflict handling: conflicting valid observations widen the bound unless an independently proven phase, build or context distinction explains them;
   - how a build or encounter revision invalidates or versions the census.
4. **Completeness analysis, per fact.** For each of `active_enemies`, `spell_targets.<ability>`, closed `target_if` sets, targetability, attackability and add availability, state what the census can establish, and whether any acquisition and completeness contract could justify an upper bound or a closed set. Absence of an actor from sampled events never establishes one, and an observed maximum is never an authoritative maximum. If no contract can, say so plainly, by specialization and decision count.
5. **The acquisition proposal for the owner.** Commit the deterministic plan, the worst-case request count and a proposed request cap, and the measured archive bytes the retained evidence needs against the current notice line. This is what POLB-CENSUS's owner decision reviews.

No curated row is entered here, and no request is made.

### POLB-CENSUS: Policy B neutral census acquisition

```autopilot
status: OWNER_DECISION_REQUIRED
dependsOn: POLB-A
wcl: OWNER_DECISION_REQUIRED
publicContract: NONE
ownerDecision: Approve POLB-A's frozen census plan (src/data/encounter-census/census-plan.json) with a cap of 243 Warcraft Logs requests and a named archive exception of up to 1 MiB, or decline it. POLB-A found the census cannot justify any upper bound or closed set, so approving it buys lower-bound and candidate evidence only, reaching at most 421 count decisions, all Arms. Since the SimC profile fallback (2026-11-06), declining no longer leaves those decisions without an answer: tier 3 of the precedence applies with no curated tier. Declining needs POLB-B, POLB-C and ONB-Z's Policy B condition reworded. ONB-EV's grant does not cover this tranche.
```

**Direction.** Owner decision (2026-11-06) "Policy B source", items 8, 11 and 12.

**Not authorized yet.** No network activity occurs until the owner approves the plan and a cap, and an `OWNER-GRANT:` replaces the `wcl` value above. ONB-EV's campaign authorization is not implicit permission for this tranche.

**Scope once granted.** Run the frozen plan exactly, retaining the evidence separately from analyzed pulls.

- No additional pulls after inspecting outcomes merely to tighten a desired bound.
- No rankings, parse percentiles, damage performance, or player behavior as authority.
- Retain enough evidence to reproduce every curated bound. If the existing limit cannot hold it, stop with OWNER_DECISION_REQUIRED and the measured increase required; never raise the limit silently, and never keep only derived conclusions.

### POLB-B: Policy B curated data and enemy-count bounds

```autopilot
status: READY
dependsOn: POLB-CENSUS
wcl: NONE
publicContract: NONE
```

**Scope.** Curated rows derived reproducibly from the retained census only, and their use in `active_enemies` through the existing EXACT, BOUNDED and UNKNOWN model. SimulationCraft never dictates the count: the census supplies evidence and the pinned APL consumes it.

- Positive observations may justify a lower bound for a supported interval. An upper bound needs the explicit completeness argument POLB-A recorded for that predicate and interval; otherwise the upper bound stays open or UNKNOWN.
- If the evidence permits several counts that would produce different APL decisions, the decision stays UNKNOWN.
- A contradiction with an analyzed pull's observed evidence is UNKNOWN plus a drift diagnostic, tested on real evidence, and never REJECTED. Conflicts within the census widen the bound and are never discarded.
- Public analyzers stay invariant unless a change is measured, explained and pinned in this tranche.
- Replay the affected INTERNAL_ONLY specializations, including those `agent/follow-ups.md` "After ONB-S3R" names as waiting on an upper bound. Record newly resolved decisions and each one's next blocker. Nothing is promoted here.

### POLB-C: Policy B target domains and availability windows

```autopilot
status: READY
dependsOn: POLB-B
wcl: NONE
publicContract: NONE
```

**Scope.** Where the retained census supports them: candidate-set evidence, targetability and attackability windows, and add-availability intervals.

- Present, targetable, attackable, in line of sight, in range and `spell_targets.<ability>` are never aliased. Each needs its own positively supported evidence contract; otherwise it stays UNKNOWN.
- A closed `target_if` set needs evidence that an unobserved qualifying target could not exist for the interval. Without that proof, use a lower or bounded candidate set where useful, or UNKNOWN.
- `spell_targets.<ability>` stays action-owned, with its geometry and eligibility action- or spec-owned where appropriate.
- Validate against retained real evidence, with negative tests that uncertain evidence stays BOUNDED or UNKNOWN.
- Record which facts the census could not establish, by specialization, for REM-CENSUS.

### SIMC-FB-A: Shared SimC profile fallback for encounter state (internal)

```autopilot
status: MERGED
dependsOn: POLB-A
branch: autopilot/simc-fb-a
wcl: NONE
publicContract: NONE
pr: 99
mergeSha: fd0892d0765fa906bddafeac457f08d8dedfa635
```

**Direction.** Owner decision (2026-11-06) "SimC profile fallback" (`agent/architecture.md`).

**Scope.** Shared, gameplay-neutral infrastructure, with no spec conditionals, implementing the precedence for a decision that needs enemy-count or target-domain state:

1. observed or proven fight evidence, when sufficient;
2. approved curated encounter authority, if one exists;
3. pinned SimulationCraft profile state, when the first two cannot establish the fact;
4. UNKNOWN only when none of them can answer.

- **The pinned environment.** The repository pins APL artifacts, and those hold no environment. Define a versioned, provenance-bearing record of each specialization's profile and environment at its pin, from the pinned sources. `src/simulation/`'s execution profiles are a separate thing and are not this record, unless a review shows they are the applicable one.
- **Permitted facts,** only where the pinned profile or pinned engine semantics deterministically establish them, each with a source citation: `active_enemies`; `spell_targets.<ability>` where SimC aliases or deterministically derives it; a candidate target domain the profile defines as closed; `fight_style`; the add and pull schedule the profile represents; target availability the profile represents; other explicit consequences of the profile plus engine semantics. A value the profile does not establish stays UNKNOWN.
- **Default environment, as already documented:** Patchwerk, one target, no raid events; `active_enemies` is 1 with one target and no `adds` or `pull` event; with distance targeting off, `spell_targets` falls back to `active_enemies`.
- **Provenance.** A binding records `SIMC_PROFILE_FALLBACK` (or equivalent) with the SimC pin, client build, specialization and profile identity, the relevant environment configuration, and the specific semantic used. It must be distinguishable from observed WCL evidence, curated evidence and spec-owned mechanics, and it never claims to have come from Warcraft Logs.
- **Conflict rule.** Real evidence outranks the fallback. A proven lower bound above the profile's count contradicts it: the fallback is not applied, the strongest real evidence is used, and uncertainty is preserved. So a proven lower bound of 2 makes `active_enemies=1` false and leaves `active_enemies>=3` UNKNOWN. Test this on real evidence, including Destruction's existing MATCHes.
- **`target_if` and target-dependent `if=`.** Evaluated over the target universe the pinned profile defines, with its semantics. Observed WCL actors are never the candidate list, and no ordering is invented. Decide how a target-scoped atom is read for the profile's target against the player's real target, with UNKNOWN where the mapping is not established.
- **Build.** A fallback applies only where the build and profile are proven. Otherwise UNKNOWN.
- **Actionability is separate.** The fallback answers APL inputs. It does not make a decision ACTIONABLE, and an observed intermission or unavailability stands.
- **Public analyzers stay invariant.** Reading the fallback is opt-in per specialization. Any public analyzer that adopts it does so in its own measured entry.
- **Supersession.** Amend the code comments, tests and READMEs that state a simulation setting is never bound, as the decision now allows it at tier 3 with provenance. Do not weaken any test of tiers 1 and 2 or of fail-closed behavior.

Negative tests: the fallback never appears as observed evidence, never overrides a contradiction, never answers what the profile leaves open, and never runs on an unproven build.

### SIMC-FB-B: Public disclosure of SimC-profile-relative evaluation

```autopilot
status: MERGED
dependsOn: SIMC-FB-A
branch: autopilot/simc-fb-b
wcl: NONE
publicContract: EXPECTED
pr: 100
mergeSha: d134126c4fe30cc7dc75358dce376479f52f111d
```

**Scope.** An additive public field, on REST, MCP and raid night alike, distinguishing observed-fight evaluation from SimC-profile-relative evaluation on every finding the fallback resolves, with its provenance.

- Reporting and the TLDR say, in substance, "Under the pinned SimC profile assumptions, the priority would select X here". They never say an unobserved target count definitely happened, and a contract test pins that.
- Confidence keeps describing evidence quality, so a modeled encounter state is never stated as observed. Comparison behavior still moves nothing.
- Coverage disclosure names how much of a report rests on the fallback.
- Findings on specializations that do not read the fallback are byte-identical, and a test pins that.

### SIMC-FB-R: Replay the encounter-state-blocked specializations under the fallback

```autopilot
status: MERGED
dependsOn: SIMC-FB-B
branch: autopilot/simc-fb-r
wcl: NONE
publicContract: NONE
pr: 101
mergeSha: 56d62788af4d3c5e696c406602092af7adee2bff
```

**Outcome.** All 26 INTERNAL_ONLY trees with a pinned list read the fallback and disclose it, and 50 of 76 `target_if` tokens are attested. No new decision resolves: 4 MATCH, 0 REJECTED and 8,542 UNKNOWN of 8,546, unchanged, and no tier-3 decision resolved on real evidence, so no public entry is added. Only 12 of 49 analyzed subjects have a provable build. It also fixes a SIMC-FB-A defect: an UNKNOWN placeholder blocked tier 3 (`agent/architecture.md` "SIMC-FB-R"; `agent/follow-ups.md` "After SIMC-FB-R").

**Scope.** Offline, on retained real evidence. Wire the fallback into each INTERNAL_ONLY specialization whose recorded blockers include `active_enemies`, `spell_targets`, `target_if`, target-dependent conditions or other encounter-state inputs explicit in its pinned profile, in that specialization's own tree. Then:

- replay every retained subject and record newly resolved decisions, with MATCH, REJECTED and UNKNOWN counts, and each next blocker in `agent/spec-onboarding-inventory.md`;
- **measure build proof by subject.** The decision requires the build and profile to be proven for promotion evidence, and POLB-A found few retained pulls have a provable build (`agent/follow-ups.md` "After POLB-A"). Record which specializations this leaves without a provable subject, and what extending the deploy calendar would take. A new external source or request is an owner stop;
- where a specialization's observation and discrimination now qualify, add a separate public entry through the unchanged gates (rule 2). A real logged action evaluated against the fallback may count; a synthetic action never does.

Nothing is promoted here.

### ONB-EV-PLAN: Freeze the neutral evidence campaign plan

```autopilot
status: MERGED
dependsOn: SIMC-FB-R
branch: autopilot/onb-ev-plan
wcl: NONE
publicContract: NONE
pr: 102
mergeSha: 50fb71e40dc68695861deaa0dae6a34760a55384
```

**Outcome.** The plan is `agent/onb-ev-plan.json`, digest `48066f986e7035542bf81c0263f4cec0d9d70e0f3d892ab6eb7ed535e6fa0013`. All twelve specializations stay. Its worst case is 200 requests against the cap of 60, and no fixture fits the 5,212 bytes left under the notice line, so ONB-EV will stop for the owner (`agent/architecture.md` "ONB-EV-PLAN"; `agent/follow-ups.md` "After ONB-EV-PLAN").

**Direction.** Owner decision (2026-11-06), item 2, and the ONB-EV owner grant. Offline only: no Warcraft Logs request.

**Scope.** Before any request, freeze and commit the plan ONB-EV will execute:

- the specializations in ONB-EV's recorded list whose remaining blocker is still insufficient retained real evidence, each checked against current retained files; a specialization that now has adequate evidence is removed with the reason, and none is added without a new owner decision;
- the fixed discovery order and its digest, set before any event of a candidate is read, with no ranking or comparison query. A candidate qualifies only if its build can be proven under the existing rules, because the SimC profile fallback requires that for promotion evidence and POLB-A found few pulls qualify. This is set before any outcome is known;
- for each specialization, the minimum data families its evaluator or healer gate requires, and the worst-case request count, counted as the grant counts them;
- the total against ONB-EV's hard cap of 60 requests. If the worst case exceeds the cap, say so in the plan: ONB-EV then runs in the frozen order and stops at the cap with its report. Dropping or reordering specializations to fit is the owner's call, not this plan's;
- the raw and committed storage plan, including provenance and the measured capacity under rule 8.

The plan must not read any candidate's outcome, and no later step may replace a chosen fight because of what it resolves to.

### REM-CENSUS: Full INTERNAL_ONLY blocker census and remediation waves

```autopilot
status: READY
dependsOn: HEAL-B1P2, SIMC-FB-R, ONB-EV
wcl: NONE
publicContract: NONE
```

**Direction.** Owner decision (2026-11-06), items 4 and 5.

**Scope.** Replay every INTERNAL_ONLY specialization offline on all retained and newly acquired evidence. Record in `agent/spec-onboarding-inventory.md`, for each:

1. its first unresolved blocker;
2. every known blocker immediately behind it;
3. each blocker's class: shared engine capability, Policy B or target-domain evidence, spec-owned authority binding, unsupported SimC expression, missing runtime state, transition or mechanics support, missing real evidence, healer-specific evidence or modeling, or genuinely unavailable external authority.

Then add the tranches the census shows are missing, in this order, before REM-GATE:

- `REM-S<n>`: shared remediation inputs;
- `REM-O<n>`: spec-owned remediation inputs;
- `REM-E<n>`: evidence-dependent retries;
- `REM-P<n>`: PUBLIC promotion retries, each only for specializations whose prerequisites changed.

Add every new entry to REM-GATE's `dependsOn`. New Warcraft Logs needs are recorded as an owner stop under rule 7. This tranche implements nothing and promotes nothing.

Restoration Druid enters with one measured blocker, archive capacity (agent/follow-ups.md "After HEAL-B1P2"). Its `REM-P<n>` is eligible only after an owner capacity decision; bring its row into any measured capacity proposal.

### REM-GATE: Remediation pass verified

```autopilot
status: READY
dependsOn: REM-CENSUS
wcl: NONE
publicContract: NONE
```

**Scope.** Verify from the queue, the registry and the inventory that:

- every INTERNAL_ONLY specialization has received at least one remediation pass against its documented blockers;
- every resulting eligible promotion retry has run.

Re-measure the first blockers. Where a pass exposed a next blocker that remediation can truthfully address, add the next wave of `REM-*` entries and a new `REM-GATE<n>` that ONB-Z depends on. A specialization may become BLOCKED only under rule 3. If a remaining item needs a choice that is the owner's, stop with OWNER_DECISION_REQUIRED.

### ONB-Z: Final roster-closure gate

```autopilot
status: READY
dependsOn: M13-F, ONB-S3R, HEAL-AP, HEAL-B1P, HEAL-B2P, HEAL-B3P, HEAL-B4P, ONB-A1P, ONB-A2P, ONB-B1P, ONB-B2P, ONB-B3P, ONB-C1P, ONB-C2P, ONB-T1P, ONB-T2P, ONB-D1P, ONB-D2P, ONB-D3P, ONB-D4P, ONB-X1P, ONB-X2P, ONB-X3P, ONB-X4P, ONB-X5P, HEAL-B1P2, POLB-C, SIMC-FB-R, ONB-EV, REM-CENSUS, REM-GATE
wcl: NONE
publicContract: NONE
```

**Owner decision (2026-11-06).** ONB-Z is the final roster-closure gate, not the end of first-pass onboarding. It does not merge at 12 of 40 PUBLIC.

**It runs only after:**

- Restoration Druid's public-entry path has completed;
- ONB-EV has been resolved and applicable evidence collected;
- Policy B has been implemented and validated, or the owner has declined POLB-CENSUS and this condition has been reworded;
- the SimC profile fallback has been implemented and the affected specializations replayed;
- all known shared and spec-owned remediation inputs have been queued and executed;
- every INTERNAL_ONLY specialization has received at least one remediation pass against its documented blockers;
- all resulting eligible promotion retries have run.

**Scope.** Regenerate the roster matrix and progress summary in `agent/spec-onboarding-inventory.md` from the production registry, and verify:

- PUBLIC count against the playable roster;
- terminally dispositioned count against the playable roster;
- no INTERNAL_ONLY entry;
- every playable specialization is PUBLIC, the exit criterion the owner set on 2026-11-06.

Any specialization failing this is an open item, not completion. It fails this tranche, and a mass reclassification never satisfies it. Add a contract test that pins the matrix against the registry and the roster.

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
