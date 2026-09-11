# Warcraft Logs Coach vNext Architecture

## Purpose

This document defines the technical architecture for Warcraft Logs Coach vNext.

The architecture exists to satisfy:

- `agent/product-intent.md`
- `CLAUDE.md`
- `agent/testing.md`

If this architecture conflicts with product intent, product intent wins.

This project is a clean rebuild.

The architecture should make it possible to analyze every World of Warcraft
specialization accurately without creating either:

- one giant universal gameplay evaluator
- 40 completely independent analyzers

The design is:

**Shared analysis platform + specialization-owned gameplay evaluation.**

---

# Core Architectural Model

The application consists of reusable shared infrastructure plus evaluators that
own specialization-specific gameplay interpretation.

Conceptually:

```text
Warcraft Logs
      |
      v
WCL Retrieval
      |
      v
Completeness Validation
      |
      v
Normalization
      |
      v
Normalized Combat Model
      |
      v
Shared State / Evidence Infrastructure
      |
      +---------------------------+
      |                           |
      v                           v
Encounter Environment       Runtime Game Data
      |                           |
      +-------------+-------------+
                    |
        +-----------+------------------------+
        |                                    |
        v                                    v
Specialization Evaluator            Preparation Analyzer
        |                                    |
  (Authority Resolution                (WCL_OBSERVED_FACT /
   + Actionability)                     RUNTIME_GAME_DATA)
        |                                    |
        +-----------+------------------------+
                    |
                    v
             Structured Findings
                    |
                    v
             Diagnosis Context
                    |
                    v
                Reporting
```

Preparation analysis is a PARALLEL finding producer.

It must not depend on a specialization evaluator having run.

Both producers merge into the same structured finding stream.

Diagnosis context annotates existing findings.

It never originates a causal finding on its own.

Gameplay conclusions must not bypass this architecture.

---

# Shared Platform vs Specialization Evaluators

## Shared Platform

Shared infrastructure provides reusable mechanics that should behave
consistently across specializations.

Examples:

- Warcraft Logs access
- Pagination
- Completeness tracking
- Event normalization
- Actor identity
- Evidence references
- Resource ledgers
- Resource intervals
- Buff/debuff timelines
- Cooldown primitives
- Target state
- Encounter state
- SimulationCraft parsing
- Common APL expression evaluation
- Actionability primitives
- Finding schemas
- Timing utilities
- Reporting infrastructure
- Preparation analysis

The shared platform should not decide arbitrary specialization-specific
gameplay.

## Specialization Evaluator

Each supported specialization owns its interpretation of its gameplay.

A specialization may contain:

- Runtime data
- Evaluator code
- APL reference
- Spec-specific APL resolvers
- Resource semantics
- Ability relationships
- Buff/debuff interpretation
- Cooldown setup
- Talent behavior
- Hero talent behavior
- Spec-specific actionability
- Decision-category authority rules

Example conceptual structure:

```text
src/specs/
    rogue/
        assassination/
            evaluator
            data
            apl
            resolvers
            tests
```

Exact filenames may differ as implementation develops.

The important rule is:

**A specialization is not merely a JSON/data definition.**

It owns gameplay interpretation.

---

# Avoid the Two Bad Extremes

Do not build:

```text
GenericEvaluator
    if assassination ...
    if outlaw ...
    if protectionPaladin ...
    if bloodDK ...
```

That recreates the rejected universal evaluator.

Also do not build:

```text
AssassinationAnalyzer
OutlawAnalyzer
ProtectionPaladinAnalyzer
...
```

where every analyzer reimplements:

- resource math
- aura windows
- evidence
- cooldown timing
- WCL access
- findings

Shared mechanics belong in reusable infrastructure.

Specialization meaning belongs in the specialization evaluator.

---

# Repository Direction

The target repository may approximately evolve toward:

```text
warcraft-logs-coach-vnext/
|
|-- CLAUDE.md
|-- README.md
|
|-- agent/
|   |-- product-intent.md
|   |-- architecture.md
|   `-- testing.md
|
|-- src/
|   |
|   |-- api/
|   |
|   |-- services/
|   |
|   |-- wcl/
|   |
|   |-- simc/
|   |
|   |-- engine/
|   |   |-- normalization/
|   |   |-- state/
|   |   |-- resources/
|   |   |-- auras/
|   |   |-- cooldowns/
|   |   |-- targeting/
|   |   |-- actionability/
|   |   |-- evidence/
|   |   |-- findings/
|   |   `-- timing/
|   |
|   |-- specs/
|   |
|   |-- classes/
|   |
|   |-- encounters/
|   |
|   |-- analysis/
|   |   |-- preparation/
|   |   `-- diagnosis/
|   |
|   |-- healing/
|   |
|   |-- support/
|   |
|   |-- comparison/
|   |
|   |-- data/
|   |
|   `-- reporting/
|
|-- tests/
|   |-- unit/
|   |-- regression/
|   |-- fixtures/
|   |-- contracts/
|   `-- integration/
|
`-- scripts/
```

This tree is directional.

Do not create empty directories simply because they are shown here.

Create modules when implementation requires them.

---

# Interface Layer

User-facing interfaces must not contain gameplay logic.

Potential interfaces include:

- REST/API
- MCP
- Future UI
- Internal tooling

All interfaces should invoke the same application-service layer.

Conceptually:

```text
REST -------\
             \
MCP ----------> Analysis Service ---> Analyzer
             /
Future UI ---/
```

This prevents different interfaces from producing different gameplay answers.

---

# Client Applications

Warcraft Logs Coach may eventually expose multiple user-facing clients.

Planned clients include:

- Web application
- World of Warcraft addon
- Potential future desktop companion
- Future MCP or other integrations

Clients must not contain independent gameplay analysis logic.

All authoritative analysis should ultimately use the same application services.

Conceptually:

```text
Web Application --------\
                         \
REST/API -----------------> Analysis Service ---> Analyzer
                         /
Future MCP -------------/
```

The World of Warcraft addon is a special client because the WoW addon runtime
does not provide general-purpose external HTTP access.

Do not architect the addon as though it can directly call the Warcraft Logs
Coach backend from arbitrary Lua code.

The addon should remain a lightweight interaction and handoff layer.

Possible addon responsibilities include:

- Accepting a Warcraft Logs URL pasted by the user
- Parsing report code, fight ID, and source ID
- Validating basic Warcraft Logs URL structure
- Storing recent analysis references in SavedVariables
- Displaying lightweight instructions/results that are explicitly available to
  the addon
- Producing a copyable handoff to the web application
- Integrating with a future companion application if such an application is
  deliberately introduced

The addon must not:

- Contain a second gameplay analyzer
- Store Warcraft Logs API secrets
- Store backend service secrets
- Reimplement specialization evaluation
- Assume arbitrary internet access
- Produce authoritative findings independently of the backend

A future companion application may be introduced if a seamless bridge between
the WoW addon and the web service becomes desirable.

That companion would be an optional transport layer, not an analysis authority.

Conceptually:

```text
WoW Addon
    |
    v
SavedVariables / user handoff
    |
    v
Optional Companion Application
    |
    v
Public API
    |
    v
Analysis Service
```

The core analyzer must remain independent of whether the request originated
from the web app, addon workflow, companion application, REST, or MCP.

# Application Services

Location:

```text
src/services/
```

Responsibilities:

- Validate analysis requests
- Resolve requested analysis mode
- Determine which analyzers are enabled
- Derive the required ingestion scope from enabled analyzers
- Coordinate WCL ingestion
- Load runtime data
- Invoke specialization evaluator when supported
- Invoke shared preparation analysis
- Coordinate optional comparison/context analysis
- Return structured analysis result

Application services are use-case orchestration.

They should not contain specialization rotation rules.

---

# Application Service Result States

The application-service result must be able to express partial and unsupported
analysis explicitly.

Conceptual states include:

```text
COMPLETE
PARTIAL
SPEC_NOT_SUPPORTED
INSUFFICIENT_SCOPE
INCOMPATIBLE_DATA_VERSION
IDENTITY_CONFLICT
```

The result must carry coverage/completeness information so reporting can
disclose it.

---

# Unsupported Specialization

The product intends to support every specialization eventually.

Until a specialization has an evaluator, gameplay evaluation for it is
unsupported.

When gameplay evaluation for a specialization is unsupported:

```text
SPEC_NOT_SUPPORTED
```

The service must:

- Not return a normal-looking empty gameplay report
- Clearly disclose that specialization gameplay analysis is unsupported
- Still run supported specialization-independent analysis such as preparation
  and other factual observations
- Clearly label the resulting report as partial coverage

Failure mode this prevents:

An unsupported specialization produces a well-formed report with zero gameplay
findings, which a player reads as confirmation of clean play.

Absence of analysis is not evidence of good play.

---

# API Layer

Location:

```text
src/api/
```

Responsibilities:

- HTTP request handling
- Request parsing
- Validation
- Authentication/authorization where required
- Calling application services
- Response formatting
- API-level errors

The API layer must not:

- Implement rotations
- Interpret specialization resources
- Decide player mistakes
- Query WCL independently from the service flow
- Create findings from raw combat data

---

# Cloudflare

The production environment is expected to run on Cloudflare.

Cloudflare-specific infrastructure should remain separate from gameplay
analysis.

Potential concerns include:

- Worker request limits
- CPU limits
- Memory limits
- WCL API latency
- Caching
- Secrets
- Environment variables

The gameplay architecture must not depend on Cloudflare-specific objects.

This allows core analysis to run in tests and local tooling.

---

# MCP

Product MCP support is a future interface.

MCP should call the same application services used by REST/API.

Do not build:

```text
REST analyzer
```

and separately:

```text
MCP analyzer
```

MCP transport is scheduled as Milestone 6, after the first complete vertical
slice. It remains a thin interface over the same application service.

The service boundary should exist before MCP is implemented.

Cloudflare management MCP and product-facing MCP are separate concerns.

---

# Warcraft Logs Layer

Location:

```text
src/wcl/
```

Responsibilities:

- Authentication
- GraphQL
- Query construction
- Pagination
- Retry behavior
- Report retrieval
- Fight retrieval
- Actor retrieval
- Event retrieval
- Rankings/comparison retrieval when requested
- Raw source preservation
- Retrieval completeness

The WCL layer should not contain gameplay coaching rules.

---

# Warcraft Logs Authentication

Architecture decision for Milestone 1:

Use a server-side Warcraft Logs OAuth **Client Credentials** flow for
public-report access.

```text
Backend (Worker)
    |  client_id + client_secret
    v
Warcraft Logs OAuth token endpoint
    |  access token
    v
Warcraft Logs GraphQL API
```

The Warcraft Logs client ID and client secret are backend secrets.

They must never be exposed to:

- browser client code
- WoW addon code
- public API responses
- logs, error messages, or committed fixtures

Report visibility:

- **Public** reports are accessible through the public client endpoint.
- **Unlisted** reports are accessible through the public client endpoint when
  the report code is supplied directly. The preflight query therefore requests
  `report(code:, allowUnlisted: true)` explicitly. The code is itself the
  capability: the analyzer never enumerates, publishes, or caches report codes,
  so this grants nobody access they did not already hold by having the link.
- **Private** reports require user-authorized OAuth and fail explicitly.

Because a missing report and an inaccessible report are not reliably
distinguishable from the public endpoint, both resolve to one honest outcome
whose message states the ambiguity rather than asserting the report does not
exist.

Private-report support is **deferred**.

Future private-report support may use user-authorized Warcraft Logs OAuth
(Authorization Code or PKCE as appropriate).

Adding user-authorized access must not create a second analyzer or a second
analysis path.

It changes only how a token is obtained before retrieval.

The authentication method affects Warcraft Logs access only.

It does not affect gameplay analysis.

---

# Warcraft Logs Retrieval Completeness

Every retrieval should preserve whether the requested information was fully
retrieved.

A retrieval result must distinguish:

- COMPLETE
- PARTIAL
- ABSENT

Completeness may be scoped by:

- Event category
- Actor
- Time range
- Requested ingestion scope

Example:

```text
casts:
    COMPLETE

resources:
    COMPLETE

buffs:
    PARTIAL from 125000ms -> 150000ms

raidActors:
    ABSENT
```

A failed page must not become an empty period.

---

# Pagination Safety

Pagination must be treated as correctness-critical.

If an event stream requires multiple pages:

1. Request all required pages.
2. Verify completion.
3. Record failures.
4. Mark affected ranges PARTIAL when recovery fails.

Never interpret:

```text
No returned events
```

as:

```text
No player actions
```

when retrieval completeness is unknown or partial.

---

# Ingestion Scope

Analysis should retrieve the minimum data scope that all enabled analyzers
actually require.

Initially define exactly two scopes:

```text
PLAYER_CONTEXT
FULL_RAID
```

Scope is primarily about how much FRIENDLY RAID state is required.

## PLAYER_CONTEXT

Includes:

- the selected player's required combat state
- the required enemy/target state
- the required encounter/environment events

`PLAYER_CONTEXT` does NOT mean "only events sourced by the player."

Targetability, phase, and boss-activity evidence is always required, because
actionability depends on it.

Reading `PLAYER_CONTEXT` as player-sourced-events-only would remove the exact
evidence the first vertical slice needs to avoid false rotational findings.

## FULL_RAID

Additionally includes the required state for all friendly raid actors.

Healer raid analysis and Augmentation support analysis normally require
`FULL_RAID`.

Death analysis may require `FULL_RAID` depending on the question.

## ROLE_GROUP

Do not implement a `ROLE_GROUP` scope until a real analysis use case requires
it.

---

# Ingestion Scope Derivation

The application service must DERIVE the required ingestion scope from the UNION
of required inputs declared by all enabled analyzers.

Each analyzer declares its required inputs.

The service computes the scope.

Scope must not be hand-picked per request or guessed.

A client must not arbitrarily choose a smaller scope that causes silent
under-fetching.

If a client requests a scope smaller than the derived requirement, either:

- widen the scope to the derived requirement, or
- return `INSUFFICIENT_SCOPE` for the affected analyses

The actual scope retrieved must be stored in the normalized combat model.

A downstream analysis requiring data outside the retrieved scope must return:

```text
UNKNOWN
```

with reason:

```text
INSUFFICIENT_SCOPE
```

rather than treating missing actors as nonexistent.

Adding a new analyzer must not silently under-fetch because an older scope
value was hard-coded somewhere.

## Identity Preflight Is Scope-Independent

Ingestion scope governs how much COMBAT-EVENT breadth is retrieved.

Factual identity preflight — does this report, fight and player exist, and does
the player's identity resolve — is a prerequisite to selecting an analyzer at
all. It cannot be derived from the set of enabled analyzers, because choosing
an analyzer requires knowing the player's specialization first.

Therefore:

- Identity preflight runs before scope-derived retrieval and independently of
  it.
- Identity preflight retrieves report/fight/actor metadata only. It retrieves
  no combat events.
- Derived scope still governs every later event retrieval.

This is not an exception to the no-blind-fetching rule. That rule exists to
prevent retrieving full-raid EVENT data no analyzer asked for, which is a
different and far larger fetch.

---

# SimulationCraft Layer

Location:

```text
src/simc/
```

Responsibilities:

- Import approved SimulationCraft APL
- Preserve source/version
- Parse APL syntax
- Normalize expressions
- Produce an internal APL representation
- Maintain supported-expression information

SimulationCraft loading/parsing is separate from specialization evaluation.

---

# APL Expression Support Registry

SimulationCraft syntax support must be explicit.

The project should maintain a registry/catalog of supported expression types.

Examples may eventually include:

- buff
- debuff
- cooldown
- charges
- talent
- resource
- variable
- active_enemies
- spell_targets
- target_if
- cycle_targets
- fight_remains
- time_to_die
- raid_event
- pool_resource
- sequences

Not all of these need to be supported initially.

An unsupported expression must produce:

```text
UNSUPPORTED
```

not:

```text
false
```

If that unsupported expression materially affects the selected action:

```text
Decision = UNKNOWN
```

---

# APL Priority Short-Circuit

A SimulationCraft APL is an ordered priority list.

Uncertainty on a higher-priority line contaminates every lower-priority
selection.

If a higher-priority action's condition evaluates:

```text
UNKNOWN
```

or:

```text
UNSUPPORTED
```

and that uncertainty can affect which action should be selected, the evaluator
must not fall through and confidently select a lower-priority action.

Return:

```text
decision = UNKNOWN
```

and preserve the blocking APL line/condition as evidence.

A lower-priority action may be selected only when the evaluator can prove that
the same action would be selected under every possible resolution of the
unknown condition.

Example:

```text
Line 1: envenom,if=energy>=50&combo_points>=5
Energy interval = [41, 58]
Line 1 condition = UNKNOWN

Line 2: mutilate
```

Incorrect:

```text
expected = Mutilate
actual   = Envenom
status   = INCORRECT
```

Correct:

```text
decision  = UNKNOWN
blockedBy = line 1 energy condition
```

This is the mechanism that prevents interval-based resource reconstruction from
manufacturing confident false findings one layer above the resource engine.

---

# Spec-Owned APL Resolvers

Some SimulationCraft expressions require specialization meaning.

The shared APL evaluator may expose resolver hooks.

Conceptually:

```text
resolveExpression(expression, state, specContext)
```

The specialization evaluator may supply resolvers for spec-specific concepts.

This prevents:

```text
if assassination ...
```

logic from accumulating inside shared APL code.

---

# Predictive APL State

APL expressions should classify required state conceptually as:

- OBSERVABLE
- DERIVABLE
- PREDICTIVE
- SIM_ONLY
- UNSUPPORTED

Examples:

```text
energy
```

may be DERIVABLE.

```text
fight_remains
```

may be PREDICTIVE.

For initial player-blame analysis, PREDICTIVE state that cannot be represented
using information reasonably available to the player should become:

```text
UNKNOWN
```

Do not substitute actual future knowledge silently.

---

# Normalization Layer

Location:

```text
src/engine/normalization/
```

Purpose:

Convert Warcraft Logs-specific structures into stable internal event types.

Examples:

```text
NormalizedCast
NormalizedAuraEvent
NormalizedResourceEvent
NormalizedDamageEvent
NormalizedHealingEvent
NormalizedDeathEvent
NormalizedTargetabilityEvent
```

The rest of the analyzer should not depend directly on arbitrary WCL JSON
shapes.

---

# Normalized Combat Model

Conceptual top-level object:

```text
CombatFight
```

Possible fields include:

```text
report
fight
encounter
difficulty

startTime
endTime
duration

gameVersion

actors
player

talents
heroTalents
gear

casts
auras
resources

damage
healing
absorbs
deaths

targets
targetability
encounterEvents

ingestionScope
completeness

evidence
```

Do not treat this as a final schema yet.

Contract tests should stabilize it as implementation develops.

---

# Identity Model

Before specialization analysis:

- Player must be resolved
- Source ID must be resolved
- Class must be resolved
- Spec must be resolved sufficiently

Missing identity should not silently become nulls used elsewhere.

Possible identity states may include:

```text
KNOWN
UNKNOWN
CONFLICT
```

Observed casts may corroborate identity.

Observed casts must not be the sole source of specialization identity.

If WCL metadata says one specialization but observed evidence strongly
contradicts it:

```text
IDENTITY_CONFLICT
```

should stop gameplay evaluation until resolved.

---

# Completeness Model

Completeness is part of combat state.

Conceptual:

```text
CompletenessRecord
```

may include:

```text
identity
talents
gear
casts
auras
resources
damage
healing
absorbs
deaths
encounterEvents
raidActors
```

with values such as:

```text
COMPLETE
PARTIAL
ABSENT
```

plus ranges/actor scope where relevant.

Absence is not the same as negative information.

---

# Shared State Infrastructure

Location:

```text
src/engine/state/
```

Shared state infrastructure should answer neutral questions such as:

- Was the player alive?
- Which target was active?
- Which aura events are known?
- What resource state can be proven?
- Was the boss targetable?
- What encounter phase was active?
- What data was complete?

It should not decide:

```text
Was this correct Assassination gameplay?
```

That belongs in the specialization evaluator.

---

# Resource Infrastructure

Location:

```text
src/engine/resources/
```

Shared responsibilities:

- Resource anchors
- Explicit gains
- Explicit spends
- Maximum
- Deficit
- Interval calculations
- Completeness
- Evidence

Each resource definition should declare a reconstruction model.

At minimum:

```text
DISCRETE_EVENT_OBSERVED
CONTINUOUS_REGEN
```

---

# Discrete Resource Reconstruction

Examples may include:

- Combo Points
- Holy Power
- Runes where supported appropriately

The exact resource semantics belong to relevant class/spec definitions.

The shared infrastructure handles ledger mechanics.

---

# Continuous Resource Reconstruction

Examples may include:

- Energy
- Focus
- Mana

Continuous resources must not be reduced to:

```text
last anchor only
```

nor should the analyzer fabricate an exact value when modifiers are uncertain.

Use:

1. Exact state when fully derivable.
2. Bounded interval when safe bounds are derivable.
3. UNKNOWN otherwise.

Example:

```text
Energy = [62, 71]
```

can prove:

```text
energy >= 50
```

TRUE.

But:

```text
Energy = [41, 58]
```

means:

```text
energy >= 50
```

UNKNOWN.

---

# Resource Waste

Shared infrastructure may calculate mathematical waste candidates.

Specialization evaluators determine whether they represent gameplay mistakes.

Invariant:

```text
resourceAtCap != resourceWasted
```

Example:

```text
7 / 7 Combo Points
```

followed by a spender is not automatically waste.

---

# Aura Infrastructure

Location:

```text
src/engine/auras/
```

Responsibilities:

- Applications
- Refreshes
- Removals
- Stack changes
- Source
- Target
- Active windows
- Evidence
- Completeness

It should support required mechanics such as:

- refresh
- pandemic extension where applicable
- stack decay
- missing removal handling
- fight termination
- duration uncertainty

Specialization definitions provide aura-specific semantics.

---

# Buff/Debuff Direction

Every aura event should preserve:

```text
sourceActorId
targetActorId
abilityId
timestamp
```

Direction must not be inferred merely from which player's WCL stream produced
the event.

When direction cannot be established and matters to the conclusion:

```text
UNKNOWN
```

---

# Cooldown Infrastructure

Location:

```text
src/engine/cooldowns/
```

Shared responsibilities:

- Base cooldown
- Availability
- Charges
- Recharge
- Resets
- Cooldown reduction where supported
- Evidence
- Uncertainty

Cooldown metadata comes from versioned runtime data.

The shared infrastructure determines possible cooldown state.

The specialization evaluator determines whether using or holding the cooldown
was correct.

---

# Targeting Infrastructure

Location:

```text
src/engine/targeting/
```

Responsibilities:

- Known targets
- Current target where provable
- Target availability
- Targetable state
- Actor relationships
- Valid target sets where possible
- Enemy-count evidence where supported

Do not silently treat unknown multi-target state as single-target state.

---

# Encounter Layer

Location:

```text
src/encounters/
```

The encounter layer describes environmental reality.

Possible state includes:

- Intermission
- Targetability
- Phase transitions
- Add phases
- Encounter-ending conditions
- Forced downtime
- Known encounter mechanics

Prefer deriving encounter state from WCL where reliable.

Hand-authored encounter data should be used only when required.

Avoid maintaining unnecessary per-boss rules when WCL can establish the fact.

---

# Actionability Infrastructure

Location:

```text
src/engine/actionability/
```

Shared actionability represents environment-level restrictions.

Conceptual status:

```text
ACTIONABLE
NOT_ACTIONABLE
UNKNOWN
```

Possible environmental reasons:

```text
PLAYER_DEAD
TARGET_UNAVAILABLE
INTERMISSION
FORCED_DOWNTIME
PHASE_TRANSITION
ENCOUNTER_END
```

Only include reasons supported by evidence.

---

# ACTIONABLE Requires Positive Evidence

`ACTIONABLE` must not be the default merely because no restriction was
observed.

Absence of observed restriction is not evidence of availability.

`ACTIONABLE` requires either:

- sufficient positive environmental evidence, or
- `COMPLETE` coverage of the environmental state required by that decision

If the required targetability/encounter/environment evidence is `PARTIAL` or
`ABSENT`, and actionability cannot otherwise be established:

```text
actionability = UNKNOWN
```

Failure mode this prevents:

```text
encounterEvents:  ABSENT
targetability:    ABSENT

every decision point -> ACTIONABLE (default)
real 30-second intermission -> a dozen confident rotational findings
```

This is architectural success criterion 9 failing through the one path where no
restriction is ever observed, because no environmental data was retrieved at
all.

`NOT_ACTIONABLE` requires evidence.

`ACTIONABLE` requires evidence too.

---

# Spec-Specific Actionability

Specialization evaluators may refine generic actionability.

Examples:

- Stealth requirement
- Ability requires melee range when reliable state exists
- Special target requirement
- Ability-specific buff requirement
- Spec-specific state

Do not force these meanings into generic environmental code.

---

# Movement

Movement should not be a universal generic actionability reason unless reliable
evidence establishes it.

WCL does not provide a simple authoritative movement stream for every situation.

Do not use:

```text
MOVEMENT_CONSTRAINT
```

as an unexplained suppression bucket.

If movement cannot be demonstrated:

```text
UNKNOWN
```

---

# Authority Resolution

Authority is resolved at runtime per decision category.

Conceptual categories include:

```text
ROTATION
RESOURCE
COOLDOWN
DEFENSIVE
ASSIGNMENT
HEALING_DECISION
SUPPORT_TARGETING
SUPPORT_TIMING
PREPARATION
```

Actionability is deliberately NOT an authority category.

Actionability evaluates whether an authority-backed decision was possible in
the encounter.

It is a modifier on a decision, not a gameplay authority over one.

Conceptual result:

```text
AuthorityResolution
```

may include:

```text
category
authority
status
reason
requiredInputs
availableInputs
evidence
```

Possible status:

```text
RESOLVED
NO_AUTHORITY_AVAILABLE
```

Authority resolution answers only one question: does a trustworthy standard
exist for this decision category, given the available inputs?

Whether enough combat evidence exists to APPLY that standard is a separate
question answered later, and its negative result is `UNKNOWN`.

Preparation authority values:

```text
WCL_OBSERVED_FACT      observed usage facts
RUNTIME_GAME_DATA      rules derived from game metadata
```

Every evaluative finding must record an explicit authority.

---

# UNKNOWN vs NO_AUTHORITY_AVAILABLE

These states are semantically distinct and are never interchangeable.

```text
NO_AUTHORITY_AVAILABLE
```

No trustworthy authority or model exists for that decision category.

Examples:

- no raid cooldown plan supplied for an ASSIGNMENT decision
- no approved per-cast healer model for a HEALING_DECISION
- no validated recipient-quality model for SUPPORT_TARGETING

```text
UNKNOWN
```

A valid authority exists, but required combat state, evidence, completeness, or
supported expression is insufficient to apply it.

Examples:

- supported APL, but reconstructed Energy cannot decide the condition
- talent data ABSENT, so a talent condition cannot resolve
- required ally state outside the retrieved ingestion scope

Stated simply:

```text
NO_AUTHORITY_AVAILABLE = no trustworthy standard for this question
UNKNOWN                = a standard exists, but not enough evidence to apply it
```

Do not write documentation, code, or tests offering these as alternatives for
the same situation.

Neither may produce a player-failure finding.

---

# Authority Examples

## Assassination Rogue rotation

```text
category:
ROTATION

authority:
SIMC_APL
```

when required state and supported APL syntax exist.

## Healer assignment

```text
category:
ASSIGNMENT
```

If an explicit raid plan exists:

```text
authority:
RAID_PLAN
```

If no plan exists:

```text
NO_AUTHORITY_AVAILABLE
```

Do not infer an assignment.

## Augmentation target choice

```text
category:
SUPPORT_TARGETING
```

No validated recipient-quality model currently exists, so:

```text
NO_AUTHORITY_AVAILABLE
```

If such a model later exists but the required recipient state was not retrieved
or reconstructed, that is instead:

```text
UNKNOWN
```

Do not default to personal SimC state.

## Preparation

```text
category:
PREPARATION

authority:
WCL_OBSERVED_FACT
```

for observed consumable usage facts, or:

```text
authority:
RUNTIME_GAME_DATA
```

for rules derived from game metadata, such as an empty enchant slot.

---

# Finding Model

Location:

```text
src/engine/findings/
```

All analysis should emit structured findings.

Conceptual:

```text
Finding
```

may include:

```text
category
spec
timestamp
authority
expected
actual
status
severity
confidence
actionability
evidence
completeness
suppressionReason
context
```

Exact schema will be established through contract tests.

---

# Finding Status

Potential statuses include:

```text
CORRECT
INCORRECT
INFORMATIONAL
SUPPRESSED
NOT_ACTIONABLE
UNKNOWN
NO_AUTHORITY_AVAILABLE
```

Do not force every analysis result into pass/fail.

---

# Shared Finding Primitives

Reusable low-level calculations should exist once.

Examples:

- Aura uptime
- Resource interval
- Resource waste amount
- Cast count
- Cast opportunity count
- Cooldown drift
- GCD gaps
- Timing tolerance
- Evidence construction

These are calculations.

They do not define specialization gameplay correctness by themselves.

---

# Specialization Evaluators

Location:

```text
src/specs/
```

A specialization evaluator may consume:

- Normalized combat model
- Shared state
- Runtime data
- SimC APL
- Encounter state
- Actionability primitives
- Authority resolution
- Shared finding primitives

It emits specialization-owned findings.

Example conceptual interface:

```text
evaluate(context) -> Finding[]
```

Possible context:

```text
fight
player
runtimeData
apl
state
authorityResolver
sharedPrimitives
```

This is conceptual only.

Do not prematurely freeze the SPECIALIZATION-EVALUATOR INTERFACE before the
first vertical slice provides implementation evidence.

This rule is about the evaluator interface only.

It is not a reason to defer selecting the project runtime/language.

Milestone 1 necessarily selects the project language, runtime, and test
framework.

---

# Class Layer

Location:

```text
src/classes/
```

Use class modules only for mechanics truly shared between specs.

Examples:

- Shared abilities
- Shared defensive definitions
- Shared utility
- Class-wide resource behavior

Do not use the class layer as a dumping ground for spec mechanics.

---

# Preparation Analysis

Location:

```text
src/analysis/preparation/
```

Preparation analysis is shared and independent of rotational decision points.

Potential findings include:

- Health potion usage
- Healthstone usage
- Combat potion usage
- Missing enchants
- Missing gems
- Build/talent context
- Other preparation checks

These findings should enter the same structured finding stream as gameplay
findings.

Reporting must not directly inspect raw gear/log data to invent preparation
findings.

Preparation authority is `WCL_OBSERVED_FACT` for observed usage, or
`RUNTIME_GAME_DATA` for rules derived from game metadata.

---

# Preparation Is a Parallel Finding Producer

Preparation analysis runs in parallel with specialization evaluation.

It must NOT depend on a specialization evaluator having run.

```text
                     -> Specialization Evaluator ----\
Normalized Fight ---|                                 |-> Structured Findings
                     -> Preparation Analyzer ---------/
```

Preparation analysis must still run when specialization gameplay evaluation is
unsupported, skipped, or blocked by `IDENTITY_CONFLICT` or
`INCOMPATIBLE_DATA_VERSION`.

This is what makes `SPEC_NOT_SUPPORTED` reports useful rather than empty.

---

# Always-Report Consumables

Every analysis report must contain a status for:

- Health potion usage
- Healthstone usage
- Normal combat potion usage

This applies regardless of player death.

This applies regardless of whether gameplay support exists for the
specialization.

If event completeness prevents a reliable count:

```text
status = UNKNOWN
```

Do not omit the category.

Do not report zero when consumable event coverage is `PARTIAL` or `ABSENT`.

A zero-use result backed by `COMPLETE` coverage is a valid observed fact.

Do not qualify this requirement with phrases such as "where supported" or
"supported reports."

---

# Racial Abilities Excluded

Racial ability analysis is excluded from initial analysis.

Do not add racial abilities to rotation, cooldown, preparation, coaching, or
scoring findings until that scope is intentionally enabled later by the product
owner.

This applies to the preparation analyzer and to specialization evaluators
equally.

---

# Damage Diagnosis

Location:

```text
src/analysis/diagnosis/
```

Damage diagnosis explains observed performance differences without turning
correlation into unsupported causation.

Example observation:

```text
Rupture damage/minute was lower than comparison logs.
```

That observation may be reported informationally.

It cannot automatically become:

```text
You failed to cast enough Ruptures.
```

Causal coaching requires supporting evidence such as:

- APL decisions
- Cast opportunities
- Aura uptime
- Resources
- Target choice
- Buff windows
- Cooldown alignment
- Encounter actionability

Damage deltas may support findings.

They do not create unsupported causal findings.

---

# Comparison Layer

Location:

```text
src/comparison/
```

Comparison is optional contextual analysis.

It should not be required for the first vertical slice when direct encounter
evidence is sufficient.

Responsibilities may eventually include:

- Comparison selection
- Validity checks
- Survival checks
- Fight participation
- Timing alignment
- Environmental consensus
- Strategy context

---

# Comparison Validity

A comparison parse should not be accepted solely because of rank.

Consider:

- Encounter
- Difficulty
- Specialization
- Survival
- Participation
- Fight duration
- Build differences
- Composition where relevant
- Retrieved-data completeness

A player dying substantially before the encounter ends may be inappropriate for
full-fight behavioral comparison.

---

# Comparison Consensus

Comparison environmental inference must produce explicit result states.

Conceptually:

```text
CONSENSUS
SPLIT
INSUFFICIENT
```

A single log is not consensus.

The exact minimum count and percentage threshold should be configurable and
validated empirically.

Do not hard-code an arbitrary threshold into product philosophy before testing
real data.

---

# Comparison Suppression Rule

Behavioral similarity alone cannot suppress a specialization-backed finding.

Comparison evidence may suppress or mark NOT_ACTIONABLE only when it supports a
named environmental cause also grounded in encounter evidence.

Examples:

```text
INTERMISSION
TARGET_UNAVAILABLE
PHASE_TRANSITION
FORCED_DOWNTIME
```

Example that may NOT suppress:

```text
Six top players also skipped Kingsbane.
```

without environmental evidence.

That may become context.

It must not silently become rotational authority.

---

# Comparison Cannot Move Confidence

Confidence represents evidence quality.

Comparison-player behavioral similarity by itself MUST NOT lower confidence.

Top-log behavior may be attached as context only.

Confidence and actionability may change only when actual evidence justifies it,
such as:

- environmental/encounter evidence
- data completeness
- identity or version certainty
- another legitimate evidence-quality factor

Rationale:

Once reporting deprioritizes low-confidence findings, lowering confidence is
functionally equivalent to suppression.

Suppression is already restricted to named environmental causes.

Confidence must be restricted the same way, or comparison behavior becomes
hidden rotational authority through the confidence/TLDR channel.

Any legitimate confidence adjustment must be recorded explicitly with its
evidence-based reason so it can be tested.

---

# Encounter-Time Alignment

Different kills should not be normalized only by total fight duration.

Comparison should eventually reason about:

- Phase
- Intermissions
- Actionable time
- Target availability
- Mechanic timing

Example:

A 6:40 fight and 5:20 fight may both contain the same 30-second intermission.

That interval should not create artificial rotational differences.

---

# Decision Points

Gameplay analysis should evaluate meaningful player decision opportunities.

Potential decision points include:

- GCD availability
- Cast completion
- Channel completion
- Proc occurrence
- Cooldown becoming available
- Target becoming actionable
- Encounter resuming after downtime

The decision-point model should prevent false "idle" findings during:

- Casts
- Channels
- GCD lock
- Non-actionable periods

---

# Timing Tolerance

Timing comparisons should include configurable human-play tolerance.

Do not build exact-millisecond coaching.

Timing tolerance may vary by finding type.

Examples:

- GCD gap
- Cooldown drift
- Assignment timing
- Aura refresh timing

Many tiny misses should often become one aggregate pattern rather than dozens
of findings.

---

# Role Module Boundary

```text
src/healing/
src/support/
```

These modules provide factual/shared primitives and reconstructed role context.

They MUST NOT become universal gameplay evaluators.

Healer and support specialization-specific gameplay verdicts live in:

```text
src/specs/<class>/<spec>/
```

Do not allow role modules to accumulate:

```text
if spec === ...
```

gameplay interpretation.

A universal healer evaluator is the same rejected architecture as a universal
DPS evaluator, rebuilt one role at a time.

Concrete example of the failure:

```text
src/healing/cooldown-evaluation
    if spec === "restoration_shaman" ...
    if spec === "holy_paladin" ...
```

because Spirit Link, Tranquility, and Aura Mastery have different
appropriate-use semantics.

The correct split:

```text
src/healing/        reconstructs WHEN raid damage occurred and WHAT covered it
src/specs/.../      decides whether THIS spec's choice was correct
```

---

# Healer Architecture

Location:

```text
src/healing/
```

Healer shared primitives operate over the same normalized fight model.

Healer v1 should focus on evidence-grounded categories.

Potential reconstruction areas include:

- Raid damage windows
- Health deficits
- Cooldown coverage observations
- Death timelines
- Absorbs
- Overhealing context
- Other-healer coverage

Assignment execution evaluation is authority-driven (raid plan) and is owned by
the healer specialization evaluator using these primitives.

Do not begin with a fictional universal healer APL.

---

# Healer Ingestion

Healer analysis may require:

```text
FULL_RAID
```

because meaningful decisions may depend on:

- Other healers
- Raid health
- Raid damage
- External defensives
- Absorbs
- Raid composition
- Healer count
- Deaths

If full required state was not retrieved:

return UNKNOWN for affected conclusions.

---

# Raid Cooldown Assignments

A raid plan is an input, not a permanent specialization property.

Conceptual normalized assignment:

```text
CooldownAssignment
```

may contain:

```text
player
ability
plannedTime
plannedEvent
tolerance
source
evidence
```

Evaluation may produce:

```text
ASSIGNMENT_MET
ASSIGNMENT_EARLY
ASSIGNMENT_LATE
ASSIGNMENT_MISSED
ASSIGNMENT_NOT_ACTIONABLE
ASSIGNMENT_UNKNOWN
```

Plan quality is a separate analysis dimension:

```text
PLAN_MAY_NEED_REVIEW
```

Do not blame a player for correctly following an assignment.

---

# No Healer Plan

If no authoritative raid plan exists:

```text
ASSIGNMENT authority = NO_AUTHORITY_AVAILABLE
```

Do not infer assignments from what other healers happened to do.

Other healer analysis categories may still proceed.

---

# Healer Model Scope

Do not treat QE Live as a machine-readable per-cast runtime authority unless an
actual supported integration/model exists.

Early healer analysis should prefer conclusions directly supported by combat
evidence.

Because no approved per-cast healer model currently exists, per-cast healing
spell-choice analysis resolves to:

```text
NO_AUTHORITY_AVAILABLE
```

This is a missing-authority condition, not a missing-evidence condition.

---

# Augmentation Architecture

Location:

```text
src/support/
```

Augmentation analysis requires ally-centric context.

Potential state includes:

- Ally identity
- Ally specialization
- Buff recipients
- Recipient survival
- Recipient cooldown usage
- Ebon Might
- Prescience
- Breath of Eons
- Encounter phase
- Group composition

---

# Augmentation Ingestion

Deep Augmentation analysis will often require:

```text
FULL_RAID
```

Missing recipient state must not become a negative result.

Example:

```text
recipient cooldown state unavailable
```

must not become:

```text
wrong Prescience target
```

---

# Augmentation v1 Scope

Initial support may safely evaluate observable facts such as:

- Buff uptime
- Buff recipient
- Recipient alive/dead state
- Buff overlap with actually observed cooldowns
- Support cooldown timing
- Coverage

Target-quality verdicts must use the correct failure state.

No validated recipient-quality model currently exists, so SUPPORT_TARGETING
quality resolves to:

```text
NO_AUTHORITY_AVAILABLE
```

If such a model later exists but the required recipient state was not retrieved
or reconstructed, that case is:

```text
UNKNOWN
```

This allows Augmentation support to grow incrementally without blocking the rest
of the analyzer.

---

# Runtime Game Data

Location:

```text
src/data/
```

Runtime game knowledge may include:

- Spell metadata
- Aura metadata
- Talent metadata
- Hero talent metadata
- Cooldown metadata
- Charge metadata
- Resource metadata
- Item metadata
- Enchant metadata
- Gem metadata
- Consumable metadata
- Encounter metadata
- Version metadata

The source of each dataset should be explicit.

---

# Runtime Data Generation

Do not manually build a large unversioned game database.

Before substantial game data is added, select authoritative/reliable source(s)
for each data category.

Data generation should preferably be scripted.

Conceptual workflow:

```text
Source Data
    |
    v
scripts/generate-*
    |
    v
Versioned Runtime Data
```

Every generated dataset should preserve provenance where practical:

```text
source
expansion
season
gameBuild
dataRevision
generatedAt
```

---

# Runtime Data Compatibility

The analyzer should compare:

```text
log version
```

against:

```text
runtime data version
APL version
```

If known incompatibility exists:

```text
INCOMPATIBLE_DATA_VERSION
```

should fail closed.

Historical multi-version support may be added later.

Initial implementation does not need a full historical compatibility matrix.

---

# Evidence

Shared evidence infrastructure should make findings traceable.

Evidence may reference:

- Raw WCL response
- Normalized event
- Completeness record
- APL rule
- Runtime metadata
- Resource interval
- Aura interval
- Cooldown state
- Encounter state
- Raid plan
- Comparison result

A developer should be able to answer:

```text
Why did the analyzer say this?
```

without reading the final coaching prose.

---

# Confidence

Confidence is initially a field/helper associated with evidence/findings.

Do not create a large standalone subsystem prematurely.

Conceptual values:

```text
HIGH
MEDIUM
LOW
UNKNOWN
```

Confidence reflects evidence quality.

It is not equivalent to performance difference magnitude.

---

# Reporting Layer

Location:

```text
src/reporting/
```

Reporting consumes structured findings.

Possible outputs:

- Markdown
- JSON
- TLDR
- Detailed report

Reporting may:

- Rank findings
- Group findings
- Explain findings
- Summarize evidence

Reporting may not:

- Create gameplay findings from raw WCL data
- Re-evaluate the specialization
- Turn UNKNOWN into failure
- Convert an informational delta into unsupported causality
- Present a partial analysis as a complete assessment

---

# Reported Coverage

The report must disclose its own analysis coverage and completeness.

If any of the following are true:

- decision coverage is low
- important data is `PARTIAL`
- specialization gameplay is `SPEC_NOT_SUPPORTED`
- important categories are `UNKNOWN` or `NO_AUTHORITY_AVAILABLE`

then the report must not read as though it were a complete assessment.

Reporting consumes the coverage/completeness information carried on the
application-service result.

It does not recompute coverage itself.

Rationale:

All fail-closed machinery in this project is internal.

Coverage disclosure is how that honesty reaches the person reading the output.

A player must be able to distinguish:

```text
"We analyzed this fight and found little to fix."
```

from:

```text
"We could only analyze part of this fight."
```

---

# Minimal Coaching vs Advanced Coaching

The first vertical slice should produce minimal human-readable coaching to prove
the reporting boundary works.

Advanced coaching quality can be improved later.

This resolves the milestone distinction:

- Minimal coaching belongs in the first vertical slice.
- Advanced prioritization/scoring/report polish comes later.

---

# Scoring

A global scoring subsystem should be deferred.

Do not create a complex scoring system during the first slice.

Important future invariant:

```text
UNKNOWN must never automatically become a penalty.
```

Findings should become trustworthy before aggregate scoring is attempted.

---

# Testing Architecture

Primary test areas:

```text
tests/unit/
tests/regression/
tests/fixtures/
tests/contracts/
tests/integration/
```

## Unit

Shared primitives and isolated evaluator behavior.

## Regression

Real historical failures and representative logs.

## Fixtures

Offline captured input.

## Contracts

Schemas/interfaces.

## Integration

Explicit WCL/Cloudflare/service integration validation.

Normal correctness tests should remain offline.

---

# First Vertical Slice

The first vertical slice should validate the complete architecture with one
specialization.

Recommended first specialization:

```text
Assassination Rogue
```

because it stresses:

- Combo Points
- Continuous Energy
- Player-applied debuffs
- Aura refresh behavior
- Cooldown windows
- Charges
- Talents
- SimC complexity
- Historical regressions

## Continuous-Resource Escape Hatch

Do not plan to switch away from Assassination merely because complete Energy
modeling is difficult.

If continuous-resource modeling initially prevents adequate coverage:

1. First narrow the supported Assassination decision surface to decisions that
   can be evaluated honestly.
2. Unsupported Energy-dependent decisions remain `UNKNOWN`.
3. Document the narrowed surface in the Supported Decision Surface.

Only reconsider the specialization if implementation evidence demonstrates that
even a useful honest Assassination vertical slice cannot be achieved.

Narrowing the supported surface is the correct response to difficulty.

Guessing resource state is not.

Switching specialization late would also discard the coverage that justified
choosing Assassination.

Protection Paladin is a strong candidate for the second specialization because
it exercises:

- Tank role
- Defensives
- Active mitigation
- Different resources
- Shared class/runtime boundaries

---

# First Slice Scope

Do not attempt full SimulationCraft support immediately.

The first slice should declare a Supported Decision Surface.

Example categories to explicitly document:

```text
Supported APL expressions
Unsupported APL expressions
Supported resource behavior
Supported aura behavior
Supported cooldown behavior
Supported target model
Supported encounter/actionability states
```

Unsupported conditions must produce:

```text
UNSUPPORTED
```

or:

```text
UNKNOWN
```

---

# First Slice Multi-Target Policy

The initial Assassination slice may begin with a controlled single-target
decision surface.

APL constructs such as:

```text
active_enemies
spell_targets
target_if
cycle_targets
```

must either be supported correctly or explicitly marked unsupported.

Do not silently evaluate AoE decisions using single-target logic.

---

# First Slice Actionability

Minimum viable actionability is part of the first slice.

At minimum support direct states such as:

- Player dead
- Fight ended
- Target proven unavailable
- Intermission/phase unavailable when WCL establishes it

The slice must also implement the evidence requirement for `ACTIONABLE`.

Absent or partial environmental evidence yields `UNKNOWN`, not `ACTIONABLE`.

Comparison-log inference may remain deferred.

---

# First Slice Preparation

The first vertical slice should also exercise the non-APL finding path.

At minimum report a status for:

- Health potion
- Healthstone
- Combat potion

This proves that findings can originate outside gameplay decision points.

Preparation must run as a parallel producer, not as a step after the evaluator.

Verify it still produces findings when specialization evaluation is skipped or
blocked.

---

# First Slice UNKNOWN Coverage

Fail-closed behavior must not become an excuse for an analyzer that resolves
nothing.

For a named reference fixture/log:

- Measure meaningful decision points.
- Count resolved decisions.
- Count UNKNOWN.
- Categorize UNKNOWN reasons.
- Review unsupported categories.

Before the slice is declared complete, establish an explicit minimum useful
coverage target.

The exact percentage should be selected after observing the reference fixture,
not invented before implementation.

Never improve coverage by guessing.

---

# Milestone 1 — Foundation

Implement only what is needed for:

- Project runtime and language selection
- Test framework
- Configuration
- Secrets handling, including WCL client credentials
- Cloudflare Worker shell
- Application-service boundary
- Application-service result states, including `SPEC_NOT_SUPPORTED`
- Ingestion-scope derivation from declared analyzer inputs

No gameplay coaching required.

Milestone 1 selects the project language, runtime, and test framework.

It does not freeze the specialization-evaluator interface.

---

# Milestone 2 — WCL Connectivity and Identity Preflight

Implement:

- Warcraft Logs OAuth Client Credentials authentication
- Public GraphQL transport with injected fetch
- Report retrieval (existence and provenance)
- Fight retrieval for the requested fight only
- Actor retrieval
- Factual source-player identity resolution
- Deliberate handling of every upstream failure mode

Validate:

- Report exists and is accessible (public or unlisted)
- Requested fight exists
- Requested source actor exists
- Source actor is a player rather than a pet or NPC
- Source actor participated in the requested fight
- Name, class and spec resolve together or not at all

Public and unlisted reports are in scope. A directly supplied report code is
itself the capability, and the analyzer never enumerates, publishes or caches
report codes, so requesting unlisted reports explicitly widens nobody's access.

Private reports require user-authorized OAuth and remain deferred.

Spec is derived from the fight's own participation data, never guessed from
class and never inferred from observed behavior.

No combat events, no pagination, no completeness reconstruction, no gameplay
conclusions.

---

# Milestone 3 — Event Ingestion and Normalized Combat Model

Implement retrieval:

- Event retrieval
- Pagination
- Retrieval completeness
- Ingestion-scope-driven breadth
- Talents where available
- Gear
- Event-coverage validation
- Raw event fixtures

Normalize:

- Actors
- Casts
- Auras
- Resources
- Damage
- Healing
- Absorbs
- Deaths
- Targets
- Targetability
- Encounter events
- Completeness

A failed page must never become an empty period.

No advanced coaching.

---

# Milestone 4 — Shared State Primitives

Implement enough shared infrastructure for:

- Evidence
- Completeness propagation
- Discrete resources
- Continuous resources
- Aura windows
- Cooldowns
- Target state
- Encounter state
- Decision timing

---

# Milestone 5 — First Complete Vertical Slice

Implement Assassination Rogue evaluator with:

- Supported SimC APL subset
- Spec-owned resolvers
- APL priority short-circuit on UNKNOWN/UNSUPPORTED conditions
- Combo Points
- Energy reconstruction
- Aura/debuff state
- Cooldown state
- Minimum actionability, including the ACTIONABLE evidence requirement
- Structured findings
- Preparation findings from the parallel producer
- Minimal coaching
- UNKNOWN coverage reporting
- Coverage disclosure in the report

This milestone must already protect against encounter downtime where direct WCL
evidence is available.

It must also protect against the two fail-open defaults:

- `ACTIONABLE` produced from absent evidence
- an `UNKNOWN` higher-priority APL condition falling through to a confident
  lower-priority recommendation

---

# Milestone 6 — MCP Interface

Expose the existing analysis capability over MCP.

MCP is a thin interface over the same application service. It must not contain
an analyzer, a second analysis path, or gameplay rules of its own.

Implement:

- MCP server surface
- Tool definitions mapping to existing application-service use cases
- Identical structured results to REST
- Transport-appropriate formatting only

Required contract:

The same analysis request through REST and through MCP must produce the same
underlying structured analysis result. Transport formatting may differ.
Gameplay truth may not.

---

# Milestone 7 — Player and Roster Progress Tracking

Future architectural intent. Not implemented before its milestone.

Analysis today is single-fight and stateless. M7 introduces history, so a
player can be coached across pulls, nights and weeks, and so an officer can
coach a roster rather than one character at a time.

## Persisted history

Persist STRUCTURED analysis outcomes. Generated prose is presentation only and
is never the canonical historical record.

Historical records should preserve:

- Stable finding IDs
- Player, spec and encounter context
- Evidence and metrics
- Actionable opportunity counts
- Severity and confidence
- Fight context
- Game build, analyzer rule version and data provenance

## Comparison rules

Progress analysis must compare like with like.

Prefer rates and opportunity-normalized measures over raw counts wherever fight
duration or opportunity count differs. Ten missed opportunities in a nine-minute
pull is not the same fact as ten in a three-minute pull.

Longitudinal comparison across incompatible game builds or analyzer rule
versions must either be avoided or explicitly disclosed.

## Raid-night / roster analysis

A user should eventually submit one Warcraft Logs report for an entire raid
night and receive one aggregated raid-team report.

Intended flow:

```text
Warcraft Logs report
  -> discover fights in the report
  -> discover participating players/specs
  -> ingest each fight once at the appropriate FULL_RAID scope
  -> normalize shared fight/encounter state once
  -> run the relevant specialization evaluator per participating player
  -> aggregate player findings across pulls
  -> persist structured history
  -> produce one raid-night / roster report
```

Design intent:

- Do not re-fetch or rebuild the same fight independently for every player.
- Shared fight/encounter state is constructed once and reused across player
  evaluations.
- Raid-night reporting works across kills and wipes.
- Per-pull participation and spec changes are preserved.
- One-off mistakes are distinguished from repeated pull-level, nightly and
  multi-week issues.
- Raid-wide analysis reuses the same analysis engine and evaluators as
  single-player analysis. There is no second raid-analysis engine.

Roster-level output should support coaching priorities, recurring issues,
improvements, regressions, deaths and mechanics, and before/after coaching
comparisons.

## Eventual query surface

History and MCP services should eventually answer questions such as:

- Who improved most tonight?
- Who has repeated the same issue over multiple raid nights?
- Which coaching points from last week improved?
- What are the highest-priority coaching conversations for the next raid?
- What recurring coaching issues does this player have?
- How has this player improved over time?

A possible future product surface is:

```text
POST /v1/raid-night
{ reportCode }
```

The endpoint is illustrative. Do not freeze the API contract yet.

---

# Raid Coaching Platform Capabilities

Future product requirements. Roadmap intent only, not an M2–M5 obligation.

Intended capabilities:

- Assignment-aware analysis that distinguishes player execution failure from
  plan/assignment effectiveness
- Progression-aware finding prioritization
- Pull-to-pull progression analysis
- First-death and wipe-chain causal analysis
- Officer coaching workflow with coached / follow-up / improved / unresolved
  status
- Stable raider identity across characters, alts and spec swaps
- Patch-, build- and analyzer-rule-version-aware historical comparison
- Automatic coaching-priority ranking based on impact, recurrence, confidence
  and lack of improvement
- Strengths and "don't change this" tracking
- Roster-level mechanic heatmaps
- Officer annotations and strategy-context notes
- Discord-oriented raid and player summaries

Architectural rules that govern all of the above:

1. Structured findings, evidence, metrics, opportunities, context and version
   provenance are the historical source of truth. Generated prose is
   presentation only and is never the canonical historical record.
2. Longitudinal comparison must not compare incompatible game builds or
   analyzer rule versions without disclosure.
3. Raid-wide analysis reuses the same analysis engine and shared fight state.
   Do not create a second coaching engine.
4. Assignment-aware analysis must distinguish "player failed the assigned plan"
   from "player followed the plan but the plan may need review". A player who
   executed their assignment correctly is not blamed because later analysis
   suggests a better plan.

---

# Milestone 8 — Encounter and Comparison Context

Expand:

- Encounter-derived actionability
- Phase interpretation
- Environmental context
- Comparison selection
- Comparison validity
- Consensus states
- Contextual confidence

Comparison behavior must not become rotational authority.

---

# Milestone 9 — Regression Corpus

Expand deterministic real-log fixtures.

Cover:

- Good play
- Poor play
- Resource mistakes
- Downtime
- Deaths
- Invalid comparisons
- Missing data
- Partial retrieval
- Identity conflicts

---

# Milestone 10 — Protection Paladin / Second-Spec Generalization

Recommended:

```text
Protection Paladin
```

Success criterion:

Adding the second specialization should not require teaching shared
infrastructure Paladin-specific gameplay meanings.

If it does, revisit the abstraction.

---

# Milestone 11 — Broader DPS/Tank Expansion

Add supported specs gradually.

Each spec should contribute:

- Evaluator
- Runtime data
- APL/resolvers
- Tests
- Reference fixtures

Do not batch all specializations before shared architecture proves stable.

---

# Milestone 12 — Healer Foundation

Implement:

- Full-raid ingestion where needed
- Raid damage-event representation
- Cooldown assignment model
- Death timelines
- Absorb context
- Other-healer coverage

Start with evidence-grounded conclusions.

---

# Milestone 13 — Augmentation Foundation

Implement:

- Ally state
- Buff recipient state
- Recipient survival
- Observable cooldown overlap
- Support-window analysis

Return UNKNOWN for target-quality questions that require unavailable models.

---

# Milestone 14 — Advanced Comparison and Root-Cause Diagnosis

Improve:

- Multi-log consensus
- Timing alignment
- Strategy context
- Damage diagnosis
- Performance deltas
- Causal evidence linkage

---

# Milestone 15 — Reporting, Scoring and Product Maturity

Improve:

- TLDR prioritization
- Finding aggregation
- Impact estimation
- Advanced report presentation
- Optional scoring

Only trustworthy findings should influence score.

---

# Raid-First Scope

Initial encounter validation should focus on raid logs.

Mythic+ is an intended future target.

Do not attempt to solve raid and Mythic+ encounter semantics simultaneously in
the first slice.

The shared platform should remain extensible.

---

# Architectural Success Criteria

The architecture is successful when:

1. Specialization meaning lives in specialization evaluators rather than a
   universal gameplay engine.

2. Shared primitives are reusable without containing arbitrary spec logic.

3. Adding a new spec does not require rewriting core ingestion/state systems.

4. Missing evidence becomes UNKNOWN rather than known-negative.

5. Partial WCL retrieval cannot become fake inactivity.

6. Continuous resources can be represented without fabricated precision.

7. Unsupported APL syntax cannot silently become false.

8. Predictive future knowledge cannot create unfair player-blame findings.

9. Encounter downtime does not create rotational failures.

10. Top-log behavior cannot override or silently suppress declared rotational
    authority.

11. Healers are not evaluated as DPS with HPS substituted.

12. A healer can correctly execute a bad plan without being blamed for the plan.

13. Augmentation can require ally context without contaminating normal DPS
    evaluation.

14. Preparation findings have a first-class structured path.

15. Damage deltas cannot become unsupported causal coaching.

16. REST and future MCP use the same application services.

17. Runtime data has provenance and version awareness.

18. Every important finding can be traced back to evidence.

19. The analyzer can run deterministically from offline fixtures.

20. A second specialization can be added without exposing a fundamental
    evaluator abstraction failure.

21. ACTIONABLE is never produced by absence of evidence.

22. An UNKNOWN higher-priority APL condition never becomes a confident
    lower-priority recommendation.

23. UNKNOWN and NO_AUTHORITY_AVAILABLE remain semantically distinct.

24. Comparison similarity cannot move confidence.

25. An unsupported specialization produces a clearly labelled partial report
    rather than an empty one.

26. Preparation findings are produced without a specialization evaluator
    having run.

27. Ingestion scope is derived from declared analyzer inputs rather than chosen
    by a client.

28. A report discloses its own coverage and cannot imply completeness it does
    not have.

29. Role modules reconstruct facts and never become universal role evaluators.
