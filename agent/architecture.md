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
|   |   `-- timing/
|   |
|   |-- findings/
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

# Evidence Capability vs Evidence Coverage

These are different questions and must never be represented by one value.

```text
COVERAGE    did we obtain the evidence we requested for this range?
CAPABILITY  can the selected WCL source supply this category at all?
```

COMPLETE / PARTIAL / ABSENT describe coverage of evidence Warcraft Logs is
CAPABLE of supplying. They say nothing about whether a category is observable.

Capability values:

```text
OBSERVABLE      verified that the source emits this category
NOT_OBSERVABLE  verified that the source cannot
UNVERIFIED      not established either way
```

Coverage is structurally unreachable unless capability is `OBSERVABLE`.

Failure mode this prevents:

A fully retrieved All stream containing zero targetability events resolves to
`TARGETABILITY: COMPLETE`, and a category we have never established Warcraft
Logs emits at all reads as fully observed and problem-free.

## Capability Is Never Inferred At Runtime

Capability comes from a committed registry whose entries cite evidence. It is
never derived from a fight's contents. Observing zero events of a kind does not
downgrade capability, and observing one does not upgrade it.

## Capability Evidence Is Directional

A sanitized capture may positively establish `OBSERVABLE`.

Absence of a category from any number of captures establishes NOTHING — we may
simply have captured fights in which it never occurred.

`NOT_OBSERVABLE` requires authoritative NEGATIVE evidence that the source
cannot provide the category, such as an exhaustive schema enumeration or
documented non-support.

Without that, capability remains `UNVERIFIED`.

`NOT_OBSERVABLE` and `UNVERIFIED` must never contribute to an `ACTIONABLE`
determination, and neither may produce a player-failure finding.

Whether `NOT_OBSERVABLE` maps to `NO_AUTHORITY_AVAILABLE` or to `UNKNOWN` at
the finding level is a Milestone 5 decision, made by the evaluator that
consumes it.

---

# Retrieval Completeness vs Fight Finality

Also different questions, also never one value.

```text
COVERAGE  did we obtain the evidence requested for this range?
FINALITY  was the fight itself finished?
```

`ReportFight.inProgress` is recorded as `FightFinality`
(`COMPLETED` / `IN_PROGRESS` / `UNKNOWN`, with the raw value preserved).

An in-progress fight whose full requested range was retrieved is COMPLETE
coverage AND IN_PROGRESS finality. Marking it PARTIAL would claim a retrieval
deficiency that did not happen, and would hide one that did.

What an unfinished fight permits is a later analysis decision.

---

# Coverage Intervals

Covered ranges are half-open: `[fromReportTimeMs, toReportTimeMs)`.

Half-open composes: `[a,b) ∪ [b,c) = [a,c)`, with no gap and no ambiguous
boundary instant.

Coverage is derived from the REQUEST and the CURSOR, never from event
timestamps:

```text
non-terminal page k vouches for  [s_k, c_k)     cursor EXCLUSIVE
terminal     page k vouches for  [s_k, end]     endTime INCLUSIVE
```

Both bounds are VERIFIED by live probe, not inferred:

- `startTime` is inclusive. A cursor passed back as `startTime` returns the
  event at exactly that timestamp.
- `nextPageTimestamp` is the first timestamp NOT returned by the page, and
  Warcraft Logs never splits a timestamp group across pages — a page may exceed
  its own `limit` to finish a millisecond. So a non-terminal page delivered
  everything below the cursor, and there is no overlap to deduplicate.
- `events(endTime:)` returns events at exactly that instant. Measured with
  `startTime: t-1`: `endTime = t-1` returned nothing, `endTime = t` returned
  four events all at `t`, `endTime = t+1` returned those four plus five more.

The request window is therefore a fully CLOSED interval, while a cursor bound is
half-open. Since these genuinely differ, the interval type carries an explicit
`upperBound: INCLUSIVE | EXCLUSIVE` rather than forcing one convention.

That explicitness is the alternative to the three things that would otherwise be
needed to keep a uniformly half-open model: adding a millisecond, inventing an
epsilon, or assuming timestamps are integers. Warcraft Logs types timestamps as
`Float`, so none of those is available, and all three would fabricate precision.

An event at exactly the requested `endTime` is INSIDE the requested range.

A page containing ZERO events still vouches for its full range. A quiet period
is observed absence of events, not unobserved time. Deriving coverage from "the
last retrieved event" silently converts the first into the second.

---

# Pagination Safety

Pagination must be treated as correctness-critical.

`nextPageTimestamp` is passed back VERBATIM as the next `startTime`. The schema
documents it as exactly that, and a live probe confirmed the cursor lands on the
first event of the next page, so any offset would skip events.

Nothing is deduplicated and nothing is re-sorted. Multiple legitimate combat
events can share timestamp, type, source, target and ability, so any dedup key
would be a guess that deletes real evidence. A probe confirmed there is nothing
to deduplicate anyway: consecutive pages do not overlap.

`limit` is a SOFT cap. Pages were observed returning up to 5,030 events against
a limit of 5,000, because Warcraft Logs completes a millisecond rather than
splitting a timestamp group. Nothing may assume a page holds at most `limit`
events.

There is no page-level retry. The only retry in the system is the bounded
cached-token 401 refresh inside the WCL transport.

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
provenance          normalization revision, report/fight ids, plan, streams
breadth             declared ingestion scope and focus actors
completeness        per-stream coverage + per-category capability/coverage

report              code, revision, wall-clock bounds
data                logVersion, gameVersion
fight               id, name, encounter, difficulty, bounds, duration,
                    finality, raw inProgress

actors              report actor id -> CombatActor (pets separate)
abilities           game id -> CombatAbility
focusActorId
talentImportCode    factual string, unparsed

phases              from typed phaseTransitions + phase metadata

events              ONE ordered union, retrieval order, never re-sorted
malformedObservations
                    observations with no establishable envelope
```

## One Ordered Event Sequence, Not Per-Category Arrays

Earlier drafts sketched flat `casts` / `auras` / `damage` arrays. That is
withdrawn: splitting into per-category arrays destroys the single chronological
ordering the one-stream retrieval strategy exists to preserve, and ordering
among events sharing a timestamp is not recoverable afterwards.

Per-category views are derived indexes over the ordered sequence.

## Events Always Have a Valid Envelope

`events[]` contains only observations whose timestamp and type were
established. An observation whose common envelope could NOT be established is
not an event — it has no position in a chronological sequence — and lives in
`malformedObservations`, carrying its retrieval position and which fields
failed, and inventing no timestamp, type, source or target.

A recognised type with a valid envelope but bad family-specific fields remains
in `events[]` as a malformed-family variant, because its proven timestamp keeps
the defect localisable.

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
src/findings/
```

This sits OUTSIDE `src/engine/` deliberately, and the boundary is load-bearing.

`src/engine/` owns factual and derived state: what was observed, what can be
reconstructed from it, and how certain that reconstruction is. A finding is a
downstream INTERPRETIVE JUDGMENT — it names an authority, records a verdict, and
can report `NO_AUTHORITY_AVAILABLE`.

Keeping the two apart is what allows the M4 state-vocabulary contract to ban
decision-authority vocabulary across the whole of `src/engine/` with no
exemption. A findings module inside that tree would have required cutting a hole
in exactly the contract that keeps the state layer honest.

Dependency direction is one-way and enforced by contract test: `src/findings/`
may read engine types; `src/engine/` may not import findings, SimulationCraft or
specialization code.

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

- Event retrieval as ONE chronological `dataType: All` stream per fight,
  unfiltered by actor
- Pagination with verbatim cursor continuation, no dedup, no re-sort, no retry
- Retrieval completeness, per stream, projected onto per-category evidence
- Evidence capability, as a committed registry separate from coverage
- Ingestion-scope-driven breadth, as a DECLARATION rather than a fetch shape
- Archive gate before any event request
- Report-revision recheck after pagination
- Raw event fixtures from sanitized live captures

Normalize:

- Actors, including pets as separate actors with `petOwner` preserved
- Abilities, keyed by game id
- Fight header and finality
- Encounter phases and intermissions
- Event envelopes, with source/target direction preserved and branded
- Completeness and provenance

## Encounter Phases Come From Typed Fields

`ReportFight.phaseTransitions` and `Report.phases` are typed, frozen GraphQL
fields carrying report-relative timestamps and an explicit `isIntermission`
flag. Phase and intermission evidence is taken from there, NOT parsed out of
the non-frozen events JSON.

`EventDataType` has no targetability, phase or encounter-event member, so no
narrow data type can supply them — which is a further reason the event stream
is `All` rather than a curated set of filters.

## Actor Sentinels

Warcraft Logs uses `-1` as a no-actor sentinel on BOTH `sourceID` and
`targetID`. VERIFIED: a mid-fight capture carried 92 events with `sourceID: -1`
and 117 with `targetID: -1`.

Read naively it becomes "actor minus one" — a well-formed reference to an actor
that does not exist and resolves against no master-data entry.

Normalization therefore distinguishes three absences, none of which produces an
actor:

```text
NOT_SUPPLIED        the key was absent
NO_ACTOR_SENTINEL   the verified -1
UNUSABLE_VALUE      present, but no value an actor could have
```

Only `-1` carries the sentinel's meaning. Other negative values are unobserved
and are NOT generalised into it.

---

## Attached Resource Direction

Under `includeResources`, Warcraft Logs attaches ONE resource snapshot per event,
FLATTENED onto the event's top level, with `resourceActor` saying which side it
describes: `1` = source, `2` = target.

There is no `sourceResources` / `targetResources` object.

VERIFIED: a `damage` event from a player to the boss carried `resourceActor: 2`
and the boss's 859M health pool; a `cast` by the same player carried
`resourceActor: 1` and that player's own health.

Assuming a snapshot belongs to the source would therefore attribute the boss's
health, position and resources to the player on every damage and heal event —
the same class of failure as the historical aura-direction inversion.

The snapshot block is read ONLY when `resourceActor` is present. That gating is
load-bearing: `armor`, `absorb` and `avoidance` also appear as unrelated
top-level keys on `combatantinfo` and on some aura events.

Attached snapshots stay structurally separate from standalone `resourcechange`
observations. When a side has no concrete actor, the snapshot is preserved with
a null actor rather than being bound to the wrong one.

---

## Event Families Are Evidence-Gated

A raw event type string recognised by name is a contract against an upstream
Warcraft Logs explicitly documents as non-frozen.

No raw event family or field becomes a supported normalization contract until
current authoritative evidence — a typed schema field, or a sanitized live
capture — verifies it. This applies to envelope-only handling too: decoding no
family-specific fields lowers the size of the contract, not the evidence bar.

An unverified family is not implemented. It stays `UNSUPPORTED_TYPE` at runtime
and `UNVERIFIED` in the capability registry, and its mapping is deferred.

Milestone 3 completes with whatever union the evidence supports. It does not
require guessed support for every hoped-for family.

## Milestone 3 Does Not Change Live Behavior

> **Superseded by Milestone 6-E.** Ingestion is now bound at the single
> production composition root and `CombatIngestionPort` is a required service
> dependency. `ANALYSIS_NOT_IMPLEMENTED` no longer exists. The reasoning below
> is the M3-era record of why wiring waited for a consumer.

Ingestion is built and deliberately not wired. `ENABLED_ANALYSIS_REQUIREMENTS`
stays empty, so `/v1/analysis` continues to answer `ANALYSIS_NOT_IMPLEMENTED`
after identity preflight and retrieves no combat events.

`CombatIngestionPort` exists as a type with no production binding. Milestone 5
injects it at the same time as the first analyzer declares its required inputs,
so ingestion acquires a caller and a reason together.

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

## Milestone 4 exit state

M4 is complete and is NOT wired into `/v1/analysis`. Interpretation begins in M5.

Every query answers with its own certainty — `EXACT` at the instant observed,
`STALE` with a disclosed age, or `UNKNOWN` with a reason. Silence is never
evidence of absence.

### Supported

- Deterministic event-relative temporal addressing
- Evidence/capability/coverage-aware `StateResult`
- Actor, ability and cast indexing
- Aura presence from observed transitions. `ACTIVE` anchors: an application, a
  refresh, or a stack removal reporting a positive resulting count. `INACTIVE`
  requires an ordinary removal; a stack removal reporting zero proves neither.
- Source-specific aura ownership, sourceless transitions failing closed
- Exact absolute stack observations
- Exact resource observations
- Explicit `PRE_COST` timing for evidence-backed costed CAST observations
- `STALE` prior resource observations
- Standalone `resourcechange` observations without pre/post interpretation
- Typed encounter phase/intermission state
- Provenance

### Explicitly unsupported / UNKNOWN

- Arbitrary continuous resource state
- Resource delta replay
- Passive regeneration reconstruction
- `resourcechange` pre/post timing
- Cooldown readiness
- Targetability
- Continuous current target
- Alive/dead state
- Aura-duration expiration without authority
- Gameplay correctness / actionability

Several of those unsupported items were PLANNED for M4 above — cooldowns, target
state, decision timing. They are unsupported because the evidence to model them
honestly was not established, not because they were forgotten. Each needs
either versioned runtime game data or a capability no capture has yet verified.
Listing them here as `UNKNOWN` is the accurate exit state.

### Settled evidence contracts

Both are scoped to `gameVersion` 1 / `logVersion` 17, with committed fixtures and
contract tests. A contradictory parser or game version is a STOP condition.

| Contract | Classification | Meaning |
| --- | --- | --- |
| Aura `stack` on a stack-change event | `ESTABLISHED_ABSOLUTE_RESULTING` | the absolute resulting count AFTER that event |
| Costed completed CAST `classResources[].amount` | `ESTABLISHED_PRE_COST` | the amount BEFORE that cost |

Deliberately NOT established: whether a `resourcechange` attachment is pre-change
or post-change. Evidence strongly favours post-change, but rests on
same-timestamp retrieval adjacency standing in for causal order, which ingestion
does not guarantee. The runtime stays agnostic — `EVENT_ASSOCIATED`, with no
`POST_CHANGE` anywhere.

### The standing prohibition

A settled contract fixes what a value means AT AN INSTANT. It grants nothing
about the intervals between instants.

Resource arithmetic must NOT be replayed between non-adjacent snapshots. This was
measured, not assumed: reconstructing state from an anchor plus intervening
observed deltas does not reconcile against live captures, and two explanations
survive the evidence — not every resource change emits an event, and
same-timestamp retrieval order is not guaranteed causal. Either is fatal.

So there is no `resourceAt(time)`, no passive regeneration, no interpolation, no
synthesized missing change, no running resource ledger, and no `amount - cost`.

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

## Execution Lane

An APL entry either consumes the player's rotational global cooldown or it does
not. SimulationCraft decides this with one predicate, and the analyzer uses the
same one:

    trigger_gcd > 0   ->  GCD_CONSUMING
    trigger_gcd == 0  ->  NON_GCD

For a spell-backed action `trigger_gcd` is the spell's base GCD in milliseconds.
The runtime table therefore stores **base GCD only**. The lane is **derived**;
storing it would create a second source of truth that could drift from the
number it summarises.

Haste and other modifiers change the GCD DURATION, never the lane. For the
supported Rogue slice the zero / non-zero split is invariant under runtime state,
which is what makes a static table sound. The analyzer models no haste-adjusted
duration at all.

An ability with no record resolves to `UNKNOWN_LANE`. That is a refusal, not a
lane, and must never collapse into either real value.

## Token Binding Is a Separate Concern

A SimulationCraft action token is not always one spell id. Token binding and
numeric ability semantics are kept apart:

    simcToken  ->  candidate spell ids     (may be several; may be unknown)
    spellId    ->  base GCD                (one number, one record)

A token's lane is established only when every reachable candidate agrees. The
pinned `thistle_tea` binding branches on talent state, so it carries two
candidate records; both are zero, so the lane holds under either resolution
without anyone deciding which talent was taken. Candidates that disagreed would
yield `UNKNOWN_LANE`.

The two relations also have different PROVENANCE, and the runtime data records
which is which:

    token    -> candidate spell ids   HAND_REVIEWED_CPP_CONTROL_FLOW
    spell id -> base GCD              MACHINE_EXTRACTED_DBC_RECORD

The analyzer does not parse C++. The token relation is a human reading pinned
SimulationCraft source, recorded with that file's measured hash and a line range
so the reading can be re-checked. The generator verifies only that every id the
reading names is a real record in the machine-extracted table. A binding may not
claim to be machine-extracted.

## Structural Entry Kind Is Not an Ability Claim

`PLAYER_ACTION` means exactly one thing: an ordinary selectable/returnable APL
entry, as opposed to an APL control-flow entry. It is a statement about control
flow.

It does NOT imply that the entry is spell-backed, that a numeric ability id is
known, that an execution lane is known, that it deals damage, or that it is
coached. `potion`, `use_item` and `invoke_external_buff` are all `PLAYER_ACTION`
and none of them is a spell.

An unrecognised token falls back to `PLAYER_ACTION`. That is the safe direction:
classified as control flow it would be stepped over silently, whereas as a player
action it has no established lane, so rotational-slot narrowing stops at it and
names it.

## Stealth State Is Read Positively

`stealthed.rogue` is the pinned expression, and it is NOT the similarly-named
enum constant. It binds to `STEALTH_BASIC | STEALTH_ROGUE`, which is:

    Stealth        1784
    Vanish buff   11327
    Subterfuge   115192
    Shadow Dance  (Subtlety)

It EXCLUDES Shadowmeld and Improved Garrote. Improved Garrote matters in
practice, because the real Vanish → Garrote sequence applies it at the same
instant the Vanish buff drops — a mask including it would keep reporting
"stealthed" after the window closed.

The Vanish ACTION (1856) and the Vanish BUFF (11327) are different identities.
Only the buff satisfies the expression.

The binding is asymmetric on purpose: **TRUE when a contributor is proven ACTIVE,
UNKNOWN otherwise.** There is no FALSE. Proving FALSE would require proving four
auras inactive, and silence across them establishes nothing — a pre-pull
application, an unverified capability and a failed page all look identical.
Nothing needs FALSE, so nothing manufactures it.

M4 is not extended for this. The specialization owns the interpretation that
these particular aura identities mean `stealthed.rogue`; M4 stays factual.

## Talent State and Choice Nodes

A Warcraft Logs `combatantinfo` talent entry is `{ id, rank, nodeId }`.
Selection is decided by ENTRY, never by node presence:

    the talent's own entry is selected       -> SELECTED
    a KNOWN sibling entry at that node       -> NOT_SELECTED
    anything else                            -> UNKNOWN

A choice node offers several entries. Reading node presence as selection is a
real error, not a hypothetical one: the verified build has the Improved Ambush
NODE carrying the Tight Spender ENTRY.

Absence is UNKNOWN, not NOT_SELECTED. That stronger rule would need a contract
that `talentTree` enumerates unselected nodes, which this build does not have and
does not need — the decisive facts are positive ones.

## The Ambush Gate Is Not Action Selection

M5-C2 answers one narrow question: does the pinned `default[4]` CONDITION hold at
this decision point?

It is not "should Ambush be cast" — that needs global traversal — and it is not
"is Ambush executable", which is action readiness. The two genuinely differ: the
APL condition reads `stealthed.rogue`, while `rogue_action_t::ready` reads
`STEALTH_STANCE`, which also includes Shadowmeld, and a Blindside proc waives the
readiness requirement without touching the condition.

For the verified build the gate is FALSE while `stealthed.rogue` is TRUE. Stealth
does not imply Ambush; the build condition still decides.

`variable.single_target` remains UNKNOWN. Its value is a per-scan count of Fan of
Knives' live target list, and Warcraft Logs supplies no enemy positional state,
so it is not historically reconstructible. It has no binding field at all.

M5-C2 does NOT establish that Garrote was globally selected. That remains true
after M5-C3a, which establishes a selection *within* `core_dot` rather than a
global one.

## Evidence Actor Scope Is Not the Focus Actor

Two ideas were conflated until M5-C3a:

    FOCUS ACTOR            who we are analysing
    EVIDENCE ACTOR SCOPE   who we hold complete evidence for, and may reason about

Under `PLAYER_CONTEXT` the coverage declared `[focusActorId]` — the analysed
player and nobody else. That understated what the capture holds. The retrieval
plan has no `sourceID`/`targetID` field and requests one `dataType: All` stream
unfiltered by actor, so enemy and target events are genuinely present. Every
absence or continuity claim about an ENEMY returned `INSUFFICIENT_SCOPE` for a
reason that was never true.

This was a DECLARATION fix. M3 and M4 semantics are untouched, and the fence that
defines the scope did not move: ingestion scope is primarily about how much
FRIENDLY RAID state is required, so an ALLY remains out of scope under
`PLAYER_CONTEXT` even though the bytes are present. `FULL_RAID` is what widens
it. Pets of friendly players are excluded with their owners; a pet whose owner
Warcraft Logs did not state is treated as non-friendly, which is the same
treatment an unowned NPC gets.

The scope is an explicit LIST, not `null`. `null` means "every actor in the
stream" and would also vouch for ids the capture never contained. Coverage RANGES
and coverage STATE are untouched and are still checked independently, so a
partial capture fails closed on the range test regardless.

## DoT Remaining Duration Is Derived, Not Observed

Warcraft Logs does not report a remaining duration. It reports that a debuff was
APPLIED at a time. `remains` is derived from exactly two facts:

    an observed application       WCL, authoritative for what happened
    the DoT's base duration       pinned DBC, `rogue-dot-durations.json`

    remains = (applicationTime + baseDuration) - queryTime

That is derived state, not fabricated state. What makes it honest is what it
refuses when either input is weaker than the derivation needs:

- **A REFRESH IS NOT AN ANCHOR.** `refreshdebuff` proves the DoT existed, not
  what duration resulted. Pandemic carries up to 30% of the REMAINING duration
  forward, so the result depends on the quantity being derived. Treating a
  refresh as a fresh application would understate a pandemic-refreshed Garrote by
  up to 5.4 s, and the error points in the direction that makes `remains<=14`
  spuriously TRUE. This project has no pandemic model, so a refresh anchor
  returns UNKNOWN — chosen over a bounded interval, which would need the same
  missing model to be trustworthy.
- **An intervening removal blocks it.** The query requires ACTIVE presence from
  M4 rather than merely finding an earlier application, so a removal — or an
  ambiguous unowned one — fails closed instead of being stepped over.
- **A negative remainder is a contradiction, not a duration.** An expired DoT
  produces a `removedebuff`, so a still-ACTIVE aura whose computed remainder is
  negative means the two inputs disagree. It is reported as unknown rather than
  clamped to zero, because clamping would present a model disagreement as "the
  DoT is about to expire".
- **Source is part of the identity.** Two rogues can each hold a Garrote on one
  boss. The verified capture contains exactly that, and anchoring on the other
  rogue's application yields 13.652 s instead of 5.746 s.

Units convert exactly once. Evidence and DBC are MILLISECONDS; SimulationCraft
expressions are SECONDS. A milliseconds value read as seconds turns an 18-second
Garrote into five hours, which satisfies every `remains<=` threshold in the
pinned APL and never looks wrong — so the unit is part of every field name, the
artifact declares `durationFieldUnits`, and the validator refuses any other value.

Base duration is sufficient only because `exsanguinated_rate` cannot move at the
pinned commit: `do_exsanguinate` is `[[maybe_unused]]` with no call site, and the
only `set_exsanguinated_rate` call is inside it.

## A Decision Is Never Justified By Its Own Consequences

At the verified decision point the Garrote cast shares a timestamp with eight
other events, including the `removedebuff` + `applydebuff` the cast itself
causes. Warcraft Logs returns the cast FIRST, and `BEFORE_EVENT` at the cast
excludes everything after it.

Had the consequences sorted first, the same query would have found the DoT the
cast applied and derived 18.000 s instead of 5.746 s. Event ORDER within a shared
timestamp is therefore evidence, and a fixture that reorders it — for example by
concatenating separately-filtered lists and sorting on timestamp alone — silently
produces a different answer. Temporal queries must key on canonical position,
never on timestamp.

## Scoped Selection Within `core_dot`

M5-C3a establishes: *within the pinned `core_dot` sub-list, at this decision
point, the authority selects Garrote.*

It is NOT a global verdict, NOT a claim that `cds` selects nothing, and NOT a
`default -> cds -> core_dot` traversal. There is no nested traversal at all; the
walk enters `core_dot` directly, exactly as M5-B did for `spend`.

What makes it answerable is CONVERGENCE rather than added state. `core_dot[0]` is:

    (buff.improved_garrote.up|stealthed.rogue)
    &(pmultiplier<=1|remains<=14+6*talent.razor_wire+4*!variable.single_target)

Three atoms are never resolved and the answer is exact anyway. The left conjunct
is TRUE because `stealthed.rogue` is proven. The threshold
`14+6*razor_wire+4*!single_target` has a MINIMUM of 14 across all four
talent/variable worlds, and the derived `remains` is below it — so the comparison
holds in every world and `pmultiplier`, a snapshot this project does not
reconstruct, never has to be known. Eight worlds, all TRUE.

The exactness depends on the walk STOPPING at entry 0. Entries 1–4 need
`refreshable` and `target.time_to_die` and remain refused, so the answer cannot
be coming from lines that were skipped or treated as false. Remove the usability
proof and the walk immediately reaches entry 1 and blocks with
`UNSUPPORTED_AUTHORITY_EXPRESSION`.

`*` and `+` were added at SimulationCraft's own precedence, read from
`engine/sim/expressions.cpp`: MULT 7, ADD 6, comparison 4, AND 3, OR 1, unary NOT
8. Getting this wrong is not a parse error but a wrong number. Subtraction and
division stayed unsupported — arithmetic was opened by the operator, not
wholesale — which is why `target.time_to_die-remains` still fails closed twice
over.

`core_dot` is entered by `default[6]`, which is `call_action_list,name=core_dot`
with NO `if=`. An unconditional gate is a STRONGER fact than a condition proven
true, and it has no expression to trace. M5-B's `ScopedActionSelection` requires
`gateTrace: ExpressionTrace` on every exact outcome, so the C3a result carries an
`EntryProof` instead and reuses the M5-B vocabulary — `DecisionScope`,
`SelectedAction`, `ScopedSelectionStatus`, `ScopedSelectionBlocker` — verbatim.
Unifying the two finding types needs a gate-proof union and is deliberately left
for the milestone that widens the contract.

## Nested `call_action_list` Traversal

`list-selection.ts` answers "which action does THIS list select" and refuses when
it meets a call. `nested-selection.ts` follows the call. It is generic: no spell
ids, no list names, no specialization vocabulary, no Warcraft Logs.

The pinned loop (`player_t::select_action`, player.cpp:14180-14271) does exactly
one of three things per ready entry:

    ACTION_VARIABLE   execute, then CONTINUE the same scan
    ACTION_CALL       recurse; if the callee returns an action, RETURN it;
                      otherwise fall through and CONTINUE the same scan
    anything else     RETURN it — the scan is over

### Call semantics

    gate FALSE          do not recurse; continue the caller
    gate TRUE, callee selects X      return X; caller's lower entries unreachable
    gate TRUE, callee returns none   continue the caller at the next ordinal
    gate TRUE, callee unresolved     BLOCK
    gate UNKNOWN, callee returns none    continue the caller (see below)
    gate UNKNOWN, callee may select X    X becomes POSSIBLE; keep scanning
    gate UNKNOWN, callee unresolved      BLOCK

A child's action outranks every LATER entry of the caller, because the call
returns before those entries are reached. So an unresolved callee blocks the
entries below its call site; it cannot be stepped over to reach something
decidable lower down.

### The empty-callee convergence rule

An undecided gate has two worlds. If the callee is PROVEN to return nothing, both
worlds continue the caller at the same next ordinal — so the gate cannot affect
control flow and is not a blocker at all.

This holds for an UNPARSEABLE gate too, which is what stops unsupported syntax
from poisoning everything beneath it. The callee's emptiness is independent of
the gate, so no reading of the gate changes where control goes.

### Variable is the execute-and-continue exception

`variable` is never what a scan returns, so neither it nor its own gate can
change control flow. Its VALUE is handled a layer down rather than ignored: a
later condition reading `variable.single_target` sees an unresolved BOOLEAN atom
and enumerates both worlds, and a condition reading a variable with no atom at
all fails the whole expression at the parser. Either way the value is accounted
for conservatively, so a scan is never blocked merely because an assignment's
value could not be reconstructed. `default[2]` is exactly this case.

### The GCD lane does not decide whether the scan stops

There is no `trigger_gcd` branch in the selection loop. A zero-GCD action is
RETURNED and ends the scan like any other; it simply does not advance
`gcd_ready`, so a new scan follows. "Zero GCD" and "executes and continues" are
different things and only `variable` is the second.

### Fail-closed control flow

    cycle                   a list re-entered while still ON THE CALL STACK
    missing called list     a hole in the model, never an empty list
    run_action_list         different fall-through semantics; not modelled
    swap_action_list        not modelled
    call with no name=      nowhere to follow

The cycle guard is the ACTIVE call stack, not every list ever visited:
`visited_apls_` is restored at the top of each loop iteration, so two sibling
calls to the same list are legal and only re-entry is the infinite loop.

`NO_ACTION_SELECTED` means every reachable entry was PROVEN not to fire. It is
never "we found nothing we support".

### Rotational boundary vs the literal start of the list

The traversal begins at M5-C1's `firstEligibleOrdinal`, not at `default[0]`. The
real list starts with `stealth` and `kick`, whose readiness is unmodelled, so an
absolute scan would block at entry 0 and say nothing.

This is NOT a claim that `default[0..3]` are false, unusable, or did not fire —
any of them might have. The claim is structural: `stealth`, `kick` and
`thistle_tea` are NON_GCD and `variable` executes-and-continues, so none can be
the action that FILLS the rotational GCD slot, and a question about that slot may
begin below them. A zero-GCD action that fires ends its own scan and is followed
by a NEW scan; that later scan is what this traversal is about.

The engine enforces this rather than trusting it. `ScanStartBoundary` carries the
proven-excluded ordinals and the traversal refuses any boundary whose proof does
not cover exactly what it skips, so a start ordinal cannot be asserted without
the narrowing that justifies it.

### The C3b result, and why it is an UNKNOWN

At the verified decision point:

    default[4] ambush            condition FALSE (M5-C2) -> continue
    default[5] call cds          gate UNPARSEABLE        -> must consider callee
    cds[0]     deathmark         condition UNPARSEABLE   -> BLOCK

    RESULT: UNKNOWN, earliest blocker `default[5] -> cds[0]`

`cds[0]` reads DoT, cooldown and time-to-die state this project does not model.
It sits above everything else, so nothing below it can be reported.

Meanwhile M5-C3a's scoped result is unchanged and still exact: within `core_dot`,
the authority selects Garrote. Both are true at once and neither overrides the
other. `core_dot` is reached only through `default[6]`, BELOW the `cds` call, so
its exactness cannot decide the global question while something above might fire.
The forbidden inference — "cds is unknown but core_dot is exactly Garrote,
therefore Garrote" — is blocked by priority, and structurally the traversal never
visits `core_dot` at all.

### Deferred to M5-C3c

Control flow is complete; gameplay state is not. M5-C3c1 has since supplied the
first piece — see below — and the rest remain unmodelled.

## Cooldown State Is Derived, Not Observed

Warcraft Logs reports no cooldown state at all: there is no "cooldown started"
event and no "cooldown ready" event. A remaining cooldown is DERIVED by combining
one observed cast with a pinned game rule.

That is why it lives in `src/engine/game-state/cooldowns` rather than in M4. M4
owns OBSERVED state and reconstructs what Warcraft Logs saw; a cooldown is a
different kind of claim. M4's vocabulary and semantics are untouched.

### Three epistemic outcomes

    EXACT     every input established, and nothing can have changed it
    BOUNDED   a rigorous LOWER bound on the remaining time, and no more
    UNKNOWN   we cannot say

`BOUNDED` exists because a lower bound is usually all a decision needs:
`cooldown.x.remains<=2` is answerable from "at least 57 seconds remain" without
committing to an exact figure. Offering it stops a caller reaching for EXACT when
only a bound is defensible.

### The modifier policy is an INPUT, not an assumption

`base - elapsed` silently assumes nothing reset or reduced the cooldown in
between — and nothing in the event stream could have told us otherwise, because
no such event exists. So the caller must supply a positive proof, and a caller
who cannot gets UNKNOWN. Absence of evidence is not the proof; absence of a
MECHANISM is.

### Where a cooldown starts, and why the answer is BOUNDED

    action.cpp:1914   action_t::execute() calls update_ready()
    action.cpp:2350   delay = rng().gauss( player->world_lag )
    action.cpp:2351   if ( delay > 400_ms ) delay -= 400_ms; else delay = 0_ms
    action.cpp:2360   cooldown->start( this, cd_duration, delay )

The anchor is EXECUTION, and for an instant ability execution coincides with the
observed COMPLETE cast. A BEGIN cast is not accepted: it evidences an attempt,
not an execution.

But the cooldown does not start AT that instant. It starts after a delay that is
SAMPLED rather than computed, from a distribution that is CONFIGURABLE per sim
(`default_world_lag`, sim.cpp:3847) and per player (player.cpp:719). The default
is a gaussian with mean 100 ms and stddev 10 ms (sim.cpp:1430, sim.cpp:2660), so
under defaults the delay is zero with overwhelming probability — and
"overwhelmingly probable" is not "proven". The `!background && !proc` guard means
the path applies to every player-cast action.

The delay is non-negative, so it can only move the ready time LATER:

    ready     = cast + base + delay,  delay >= 0
    remaining = ready - query        >= base - elapsed

So an observed cast proves a LOWER BOUND and does not prove equality. There is a
second, independent reason for the same conclusion: we derive from a real
server-side log, and nothing proves the real cooldown began at exactly the
millisecond the cast event carries.

The derivation therefore returns BOUNDED. EXACT stays in the vocabulary for a
future derivation that can prove a zero-delay start; nothing produces it today.

Once elapsed exceeds the base duration the bound degrades to "at least 0", which
is true and decides nothing — so comparisons against it return UNKNOWN. That is
the honest outcome rather than a weakness.

An ability with a cast time or a channel would need its own anchor and is not
covered by this contract.

### A bound is carried as a bound

`NumericBinding` gained a third state for this:

    KNOWN_NUMBER     an exact value
    BOUNDED_NUMBER   a PROVEN lower bound, in `atLeast`
    UNKNOWN_NUMBER   nothing

Flattening a bound into a known value would state a figure nobody established,
and would do it invisibly — the comparison it feeds comes out the same either
way. So the bound survives the ms-to-seconds conversion, reaches the evaluator as
a bound, and appears in the trace with `value: null` and the bound in its own
`atLeast` field.

Only the deductions that follow from a lower bound are made. With `x >= L`:

    x <= C   FALSE when L > C
    x <  C   FALSE when L >= C
    x >  C   TRUE  when L > C
    x >= C   TRUE  when L >= C
    x =  C   FALSE when L > C

Everything else is UNKNOWN — including `x <= C` when `L <= C`, where the true
value could be anywhere above `L`. Arithmetic on a bound is refused outright
(`L * k` is not a lower bound for negative `k`, and no pinned expression needs
it), and a bound is never read as a bare truth. This is not an interval algebra
and must not grow into one.

### Kingsbane, and the two grades of provenance

    baseCooldownMs 60000, charges 0      MACHINE_EXTRACTED_DBC_RECORD
    "nothing modifies this cooldown"     HAND_REVIEWED_CPP_ABSENCE_PROOF

The second is the weaker claim and is labelled as such. A DBC value that changes
shows up as a different number in a hashed table; a newly-added cooldown reset
changes no DBC row at all. So the absence proof carries the SHA-256 of the module
it was reviewed against and records the searches that were run:

    exactly one occurrence of `cooldowns.kingsbane` (the constructor assignment)
    ZERO occurrences of `cooldowns.kingsbane->`, the form every mutation takes
    `_charges` is 0
    Restless Blades and Deadly Pursuit are both Outlaw-only
    base/dynamic recharge multipliers initialise to 1.0
    `kingsbane_t` overrides neither `update_ready` nor `cooldown`

The extractor re-runs the two decisive greps on every run and refuses to emit an
artifact whose absence proof has gone stale.

### Milliseconds and seconds

DBC and the derivation are MILLISECONDS; SimulationCraft expressions are SECONDS.
The conversion happens exactly once, in the specialization's cooldown adapter,
and the field it produces is named `remainsSeconds`. Reading 57198 as seconds
would satisfy every `remains<=` threshold in the pinned APL and never look wrong.

### What M5-C3c1 proved, and what moved

At the verified decision point, Kingsbane was cast 2.802 s earlier against a 60 s
cooldown, so `cooldown.kingsbane.remains` is **at least** 57.198 s and
`cooldown.kingsbane.remains<=2` is FALSE — a bound that clears the threshold
settles the comparison exactly, without ever naming the magnitude. One FALSE operand collapses the whole
`cds[0]` Deathmark conjunction — `FALSE & anything` is FALSE — so the other four
operands never had to be established:

    dot.garrote.ticking         UNRESOLVED, enumerated
    dot.rupture.ticking         UNRESOLVED, enumerated
    cooldown.kingsbane.remains  BOUNDED >= 57.198     <- the only new fact
    buff.envenom.remains        UNKNOWN_NUMBER
    target.time_to_die          PREDICTIVE
    fight_remains               PREDICTIVE

Four worlds, all FALSE, `INVARIANT_ACROSS_WORLDS`. No predictive value was used.

The traversal's earliest blocker therefore moves:

    before   default[5] -> cds[0] deathmark
    after    default[5] -> cds[1] invoke_external_buff

The result is still UNKNOWN, and that is the correct C3c1 outcome.

### Recognition is not knowledge

Three atoms were added so the pinned line could parse WHOLE — the fail-closed
parser refuses an expression containing any unsupported fragment, so one
unrecognised identifier would have blocked the milestone:

    dot.<name>.ticking        TRUTH, enumerable, bindable
    cooldown.<name>.remains   MAGNITUDE, bindable from a derivation
    target.time_to_die        MAGNITUDE, PREDICTIVE, never bindable

Parsing them gives them no value. An unbound `dot.x.ticking` is enumerated, not
`false`. An unbound `cooldown.x.remains` is UNKNOWN_NUMBER, never `0` — zero is
the dangerous default, because it reads as "ready now" to every `remains<=`
comparison. The cooldown binding is a list keyed by NAME rather than one scalar,
so a derivation about Kingsbane cannot answer a question about Deathmark.

Opening one property did not open a namespace: `dot.<name>.remains`,
`cooldown.<name>.ready` and `cooldown.<name>.duration` are all still refused.

## Applicability, Usability and Condition — In That Order

M5-C3c2 added the two verdicts the traversal had no way to express, and the
order they are asked in is pinned rather than chosen.

`player_t::select_action` skips background actions before anything else
(player.cpp:14229-14230), and inside `action_ready()` (action.cpp:2567) the
readiness check precedes `if_expr` (action.cpp:2607, 2634). So:

    APPLICABILITY  is this entry a selectable foreground action for this player?
    USABILITY      it exists — could `ready()` have succeeded?
    CONDITION      the APL `if=` expression

An entry decided by either of the first two **never has its condition
evaluated**. That is not an optimisation; it is what makes the pinned `items`
list traversable at all, because `items[4]` and `items[5]` are gated on
`variable.trinket_sync_slot`, which the pinned APL never assigns. Implemented
condition-first, the scan would have blocked on syntax that cannot affect the
answer.

### Both negatives require positive evidence

`NOT_APPLICABLE` and `PROVEN_UNUSABLE` are claims. `UNKNOWN` is the absence of
one, and no caller may read it as either negative. Only four reasons are
produced, each mirroring a specific pinned behaviour:

    ITEM_NOT_EQUIPPED    `use_item,name=<x>` and the actor wears no `<x>`
                         (use_item_t constructor, player.cpp:9874-9884)
    NO_ON_USE_EFFECT     the slot's item has no SPECIAL_EFFECT_USE, so no
                         action is constructed (player.cpp:10024-10029)
    ACTIVE_COOLDOWN      a derived cooldown provably exceeds the tolerance
    STATIC_READY_FALSE   `invoke_external_buff` under an empty pool

An unequipped trinket is **not on cooldown**, and the two are kept apart
deliberately: the remedy for one is gear and for the other is waiting.

### The readiness rule is not `remains > 0`

`cooldown_t::is_ready()` returns true once `queueable() <= now`, where
`queueable() = ready - player->cooldown_tolerance()` (cooldown.cpp:655-703). The
default tolerance is 250 ms (sim.cpp:1426) and **both** the per-sim and
per-player values are configurable options. A bridge built on a positive
remainder would call ready actions unusable and silently delete real candidates.

    provenRemaining > cooldownTolerance   ->  PROVEN_NOT_READY
    otherwise                             ->  UNKNOWN

Equality is UNKNOWN, because `queueable() <= now` admits it. The tolerance is an
INPUT from the simulation profile, never a constant inside the bridge; a profile
that cannot establish it gets UNKNOWN rather than a baked-in guess.

### Two profiles, because two authorities

    ObservedPlayerProfile       what the LOG says      (equipped gear)
    AuthoritySimulationProfile  what the AUTHORITY says (external-buff pool,
                                                        cooldown tolerance)

Kept apart because they fail independently. Gear is a real per-fight Warcraft
Logs fact; the external-buff pool is not a log fact in any form — it is a
SimulationCraft option whose default is empty. That emptiness is a **value, not a
gap**, which is precisely what licenses the negative verdict on
`invoke_external_buff`: the Priest module registers the Power Infusion buff on
every player, so `init_finished` finds it, consults the empty pool, nulls the
pointer and `ready()` is false for the rest of the simulation. The action is
never marked background, so the honest classification is APPLICABLE with a
proven-false readiness.

Race is **UNKNOWN for every log-derived profile**, and that is a finding rather
than a gap to fill later. Warcraft Logs exposes race on no queried field: not
`ReportActor`, not `Character`, not `playerDetails`, not `combatantinfo`.

### Slots are resolved by checking, not by position

Warcraft Logs supplies no slot key on `combatantinfo.gear`; the slot is the array
index and nothing else. Turning index 13 into `trinket2` therefore needs
evidence, so the pinned item artifact carries each item's DBC `inventory_type`
and a gear entry is a trinket because its own row says so. Position supplies only
the ORDER between the two.

The extractor made that checkable rather than asserted: `item_data.inc` has no
field header, so the inventory-type column is IDENTIFIED as the one column
agreeing with sixteen anchors spanning fourteen distinct values, and the
extractor refuses to write if that is not exactly one column.

Slot resolution fails closed in every direction. Exactly two trinkets, or no
slots resolve at all — and `slotOccupancy` then answers `NOT_RESOLVED` rather
than `EMPTY`, so an unreadable slot becomes UNKNOWN applicability instead of an
unequipped one. Equipped item IDs are carried regardless, so
`use_item,name=<token>` does not depend on slot resolution having succeeded.

### What M5-C3c2 proved, and what moved

At the same decision point, with the actor's real gear:

    cds[1] invoke_external_buff  PROVEN_UNUSABLE   empty external-buff pool
    items[1..3] use_item         NOT_APPLICABLE    none of the three is equipped
    items[4] use_items trinket1  NOT_APPLICABLE    Zul'jin's Guillotine
                                                   Technique has no ON_USE effect
    items[5] use_items trinket2  PROVEN_UNUSABLE   Vile Vial used 3.854 s
                                                   earlier against a 120 s
                                                   cooldown: >= 116.146 s left,
                                                   against a 250 ms tolerance

The earliest blocker therefore moves:

    before   default[5] -> cds[1] invoke_external_buff
    after    default[5] -> cds[3] -> misc_cds[0] potion

and the new resting place is an honest refusal — `potion` is gated on
`buff.bloodlust.react`, outside the supported expression subset. The result is
still UNKNOWN. Nothing here claims Garrote was correct, that the potion should
have been used, or that the player erred; what improved is how far the evidence
carries.

Without a profile the traversal makes no applicability claim at all and blocks
exactly where M5-C3c1 blocked. The profile is what licenses the new verdicts, and
its absence removes them rather than defaulting them.

## One Scan Is Not the First-GCD Query

Two questions, two engines, and conflating them is the failure this section
exists to prevent.

    selectAcrossLists                 which action does THIS foreground scan
                                      return?

    firstGcdSelectionAcrossRescans    allowing zero or more NON_GCD actions to
                                      be selected, executed, and followed by a
                                      fresh scan from the ROOT, which
                                      GCD-consuming action is selected first?

The second is built ON the first. M5-C3c3b added it without touching the first:
`selectAcrossLists` keeps its exact query, its exact result type and its exact
behaviour, and did NOT become a rescan query.

### The additive one-scan primitive

`selectAcrossLists` flattens a scan into one verdict, which is the right shape
for a caller asking only what this scan selects. A caller exploring WORLDS needs
what the flattening destroys, so `resolveOneForegroundScan` returns the same
scan one step earlier:

    NO_ACTION              proven to return nothing
    DEFINITE               proven to return this one entry
    MAY_SELECT [c0..cn]    one of these, or nothing
    AMBIGUOUS  [c0..cn]    one of these, definitely

Both entry points run the identical `scanList`, so they cannot drift.

### Why MAY_SELECT needs no "resume here" field

`scanList` stops early only on a candidate proven to fire. An entry that merely
MIGHT fire is recorded and the walk CONTINUES. So a completed scan's candidate
list already holds every entry that could be the answer, in literal APL priority
order, and everything below each of them has already been visited.

That is what makes the no-selection world representable without inventing it: in
the world where no candidate's conditions hold, the walk genuinely reached the
end of the list and the scan genuinely returns nothing. `AMBIGUOUS` carries a
candidate proven to fire, so that world does not exist and the engine must not
add one.

### The root restart

    player_t::execute_action  ->  visited_apls_ = 0
                                  select_action( *active_action_list, FOREGROUND )

Not the child list the action was found in, not the next ordinal, not the call
stack. An action selected three lists deep is followed by a scan that begins
again at the top of the root — so an entry ABOVE the previous selection can
become the next one, and the engine reproduces exactly that.

### Only Δt = 0, and unsupported is refused rather than ignored

A NON_GCD foreground action schedules its next ready event with zero delay:
`start_gcd()` early-returns when `gcd()` is zero so `gcd_ready` is untouched, and
`schedule_ready` takes the `gcd() == 0 && !add_queue_lag` branch to `lag = 0`
(player.cpp:6963). The rescan is at the same simulation timestamp.

The transition contract can EXPRESS a non-zero advance, and the engine refuses
it with `UNSUPPORTED_TIME_ADVANCE`. Silently ignoring it would mean every
cooldown, resource and aura in the caller's state had quietly stopped being
true.

### Caller-owned state, caller-owned transitions

The engine reads no resource, no cooldown, no aura, no talent and no spell id.
State is opaque; the caller supplies `scanFor`, `laneFor`, `transitionFor` and
`stateKey`. Progress is STATE CHANGE, not a counter: with Δt = 0 the only thing
that can differ on the next scan is the abstract state.

A transition answers `APPLIED`, `UNSUPPORTED` or `UNKNOWN`. The last two are
kept apart because they tell a reader different things — "this project does not
model the action" versus "it does, and the evidence here is insufficient".

### Cycle detection is on state, never on depth

The cycle key is `rootListName + stateKey(state)`, checked against the states
already on the current branch. A transition that applies, reports zero time and
changes nothing is caught on its first repeat; so is an A -> B -> A alternation.
There is no depth cap anywhere, and a contract test asserts there is none —
truncating a search and calling the result an answer is the failure mode that
guard exists to prevent.

Completed states are memoized by the same key, so a state reached by several
prefixes is explored once. The prefix is path-dependent and the terminal is not,
so a memo hit reuses the verdict and re-bases the prefix.

### Convergence, and what exactness requires

Unanimity on the authority ENTRY — list, ordinal, verbatim string, source line —
which is C3b's identity rule unchanged. Two worlds that answer the same TOKEN
through different entries have not agreed about what was selected.

    all SELECTED, same entry          -> exact
    two different entries             -> DIVERGENT_GCD_OUTCOMES
    SELECTED mixed with NO_ACTION     -> DIVERGENT_GCD_OUTCOMES
    any refusal                       -> that refusal, in preference to
                                         divergence
    all NO_ACTION                     -> NO_ROTATIONAL_GCD_SELECTED

A refusal outranks a divergence deliberately: a blocked world is evidence we did
not gather, and reporting "these worlds disagree" when one of them was never
explored would overstate what is known.

### The prefix is a union, never a sequence

Different worlds reach the same first GCD through different prefixes.
`possibleActions` is the union across worlds; `exactSequenceKnown` is true only
when every converging world took the identical path, and `sequence` is populated
only then. Reporting one path as though it were the prefix would invent a
history no evidence supports.

### What ROTATIONAL_GCD_SELECTED means

> Across every supported finite world from this initial state, after zero or
> more NON_GCD executions and root rescans, the first GCD-consuming selection is
> the same authority entry.

It does NOT mean "this is the literal next action". Actions may fire before it.

### The OFF_GCD pass is out of scope, structurally

`use_off_gcd=1` adds an action to a second list polled through
`execute_type::OFF_GCD`, which is set in exactly one place: when a GCD is already
running (action.cpp:301-306). This query BEGINS at a ready foreground selection
point, where that pass is unreachable, and TERMINATES at the first GCD-consuming
selection, which is the moment it first becomes reachable. The entire pass falls
outside the query by construction.

### Still unapplied

M5-C3c3b is the engine and nothing else. No Rogue transition exists, the engine
is wired into no specialization, and no global Garrote result is claimed —
Kick, Thistle Tea, potion and racial transitions are all M5-C3c3c, and the three
deferred Assassination expressions remain unsupported. Contract tests assert all
of this rather than leaving it to intent.

## The First Rotational GCD at the Real Decision Point

M5-C3c3c applied C3c3a's lane and usability facts and C3c3b's generic rescan
engine to the pinned Assassination authority, and the query converges.

    Under the pinned SimulationCraft Assassination authority and the supported
    factual and profile state at Q, every modelled foreground world - INCLUDING
    worlds where supported optional NON_GCD actions execute first - converges to
    the same first GCD-consuming action: Garrote, from the same authority entry,
    `default[6] -> core_dot[0]`.

It does NOT mean "Garrote was the next action". A Kick, up to three Thistle Teas,
a potion and one racial may each have fired first, in some order, and the result
refuses to say which. Nor is it a coaching verdict: it says what the AUTHORITY
selects, not that the player was right.

### The two queries both remain true

    one literal scan   UNKNOWN at default[5] -> cds[3] -> misc_cds[0] potion
    first-GCD query    Garrote at default[6] -> core_dot[0]

Both correct, because they ask different questions. The literal scan asks what
THIS scan returns and cannot tell whether five higher-priority entries fire
first. The first-GCD query lets them fire and asks again.

### Three atoms recognised, none of them known

`buff.<name>.stack`, `buff.<name>.react` and `debuff.<name>.up` now parse. All
three resolve UNKNOWN. Recognition is what lets the scan BRANCH over the entries
carrying them; it supplies no value for any of them.

`.react` gets its own atom key and is NOT folded into `.up` — SimulationCraft's
`.react` gates on reaction time, which this project does not model, and equating
them would collapse a model we lack into a presence check we have.
`debuff.<name>.up` is likewise separate from `buff.<name>.up`: one addresses the
enemy and the other the player.

Recognising `buff.<name>.stack` does NOT unblock the `default[5]` gate, which
also carries a talent rank, a spell-target count and the `>?` operator. It does
not need to: an unsupported gate on a `call_action_list` already branches over
both worlds, which is what the design pass predicted and a test now pins.

### Hypothetical prefix state is not observed state

    OBSERVED       actor 19 cast Kingsbane 2.802 s before Q
    DERIVED        therefore at least 57.198 s of its cooldown remain
    HYPOTHETICAL   in one explored world, a potion fired before Garrote

The third never enters M3/M4/C3c1. It lives in the C3c3c abstract state and
reaches the scan through its own usability reason,
`SIMULATED_PREFIX_EXECUTION`, whose evidence says in words that it is
counterfactual. Representing it as `ACTIVE_COOLDOWN` would put a hypothetical
cooldown in the same field as a derived one. `OBSERVED_UNUSABLE_REASONS` is
exported so a consumer that must not mix them can check rather than remember.

### Why the search is finite

Every supported NON_GCD action has a named progress mechanism and advances zero
simulated time:

    kick        15 s cooldown
    potion      shared named potion cooldown, minutes
    racials     120-180 s cooldowns
    thistle_tea THREE CHARGES, 60 s recharge

Thistle Tea is the one that needed real work. Its APL action binds through a
talent branch, and the auto-talent branch appeared to reach spell 469779 - which
has no charges and no cooldown, and would have been unboundedly repeatable at
zero elapsed time. The generated EFFECT table settles it: 469779's effect index 0
carries `_trigger_spell_id = 381623`, so `effectN( 1 ).trigger()` resolves to the
3-charge record and BOTH talent branches reach it. In the neither-talent world
the spell is `not_found()` and the action is background.

No depth cap exists anywhere, and a contract test asserts there is none.

### Race is one unknown with five settings

Warcraft Logs exposes no race. Four independent racial booleans would admit a
player who is simultaneously an Orc, a Troll, a Dark Iron Dwarf and a Mag'har Orc
and can fire four racials in one prefix. The racial spell masks are pairwise
disjoint, so the query runs once per correlated world - ORC, TROLL,
DARK_IRON_DWARF, MAGHAR_ORC, OTHER - with at most one applicable racial in each,
and converges them with the same authority-identity rule the engine uses
internally. A profile that ever establishes a race explores that world alone.

### The Kick ordering proof

Kick is the only prefix action that reaches the Rogue stealth-break path, and it
is the most delicate claim in the milestone:

    Kick executes at t             rogue_action_t::execute -> break_stealth()
    stealth/vanish expire at t+1ms  expire( 1_ms ), sc_rogue.cpp:11640,11645
    root rescan at t+0              schedule_ready( 0 ), lag = 0_ms

0 < 1, so the scan that follows a Kick still observes `stealthed.rogue = TRUE`,
and the query terminates at the first GCD selection - which happens at t+0, before
the expiry is ever reached. The claim is recorded with measured source hashes and
explicitly scoped to zero-elapsed-time queries; generalising it to a query where
time passes would be false.

The racials and the potion are established from the CALL GRAPH rather than from
the DBC stealth-break flag: `break_stealth()` is reachable only from
`rogue_action_t::execute`, and a `racial_spell_t` or a `dbc_consumable_base_t` is
not one. Berserking's flag is clear and it still cannot break stealth, which is
exactly why the flag would have been the wrong evidence.

### Why stat buffs do not matter here, for a stated reason

Not "they are only stats". A stat change moves haste, regeneration and future
snapshots - all quantities over ELAPSED TIME, and every supported transition
advances none. The one snapshot the path could read, `pmultiplier`, is already
UNKNOWN and is not what proves `core_dot[0]`: that comes from `remains <= 14`,
the MINIMUM threshold, which no stat can move.

Fireblood gets its own treatment rather than being lumped in. Its dispel is a
real write, recorded as one, and shown irrelevant because it clears effects FROM
THE PLAYER while `debuff.deathmark.up` addresses the ENEMY.

### Garrote's forward usability

Not inherited from "it was observed". Garrote costs 45 Energy, the decision point
starts at 250/250, every supported transition spends zero and Thistle Tea only
grants - so the minimum possible Energy after any prefix is the starting Energy.
Zero elapsed time leaves its own cooldown, the Garrote DoT, the Kingsbane bound
and `cds[5]`'s `!stealthed.rogue` gate all unchanged.

### What remains unproven

`fight_remains` and `target.time_to_die` are still predictive and still unbound;
the convergence holds ACROSS their unknown values rather than resolving them. No
route is wired, no coaching language is emitted, and the milestone claims
authority selection only.

### Still deferred

To M5-C3c3 — the rotational NON_GCD sequence problem:

    whether an off-GCD action that fires changes the eventual GCD selection
    global Garrote selection
    potion readiness, and racial resolution (which needs a race Warcraft Logs
      does not supply, so it may never be resolvable from a log alone)

## Execution Lane Has Two Uses, Not One

M5-C1 established lane data to answer one question. M5-C3c3a made it complete
enough to answer a second, and the two must not be confused.

    1. ROTATIONAL-SUFFIX BOUNDARY (M5-C1, unchanged)

       Which entries are structurally incapable of occupying the next rotational
       GCD slot? `default[0..3]` are, so a question about that slot may begin at
       `default[4]`. M5-C3b, C3c1 and C3c2 all start there and still do.

    2. FIRST-GCD TERMINAL TEST (future M5-C3c3b)

       Given an action the scan actually SELECTED, is it the answer or a step on
       the way to it? `GCD_CONSUMING` terminates; `NON_GCD` executes and a new
       scan begins.

### The distinction C1's boundary does NOT license

    default[0..3] cannot OCCUPY the rotational GCD slot

does not imply

    default[0..3] cannot EXECUTE before that slot is filled

Three of those four entries are real foreground actions that can fire, end the
current scan, change state, and be followed by a fresh scan from the root.
`thistle_tea` grants Energy; `kick` breaks stealth. Starting at ordinal 4 is
sound for "what fills the slot" and would be unsound for "what happens first".

M5-C3c3a does not execute them. It classifies them, so that C3c3b can begin at
the root — ordinal 0, nothing skipped — and use the lane as a stopping rule
rather than a starting one.

## `use_off_gcd` Is Not the Execution Lane

The lane is `trigger_gcd > 0`. That is all it has ever been, and
`use_off_gcd=1` is a different fact entirely:

    off_gcd_actions.push_back( action );        // player.cpp:4340-4342

A `push_back` that erases nothing. The action stays in `foreground_action_list`
and remains an ordinary foreground candidate; the option merely ADDS it to a
second list, polled through `execute_type::OFF_GCD`, which is set in exactly one
place — when a GCD is already running (action.cpp:301-306).

So an entry carrying the option has an EXTRA scheduling opportunity, never a
different lane. For the first-GCD query this is doubly out of scope: the query
starts at a ready moment, where the off-GCD pass is unreachable, and terminates
at the first GCD-consuming action, which is where that pass first becomes
reachable.

## Lane Data Has Three Provenance Grades

    token    -> candidate spell ids   HAND_REVIEWED_CPP_CONTROL_FLOW
    spell id -> baseGcdMs             MACHINE_EXTRACTED_DBC_RECORD
    token    -> trigger_gcd           HAND_REVIEWED_CPP_TRIGGER_GCD

The third arrived with M5-C3c3a. `potion`, `use_item`, `use_items` and
`invoke_external_buff` have no DBC row at all, so `_gcd` cannot answer for them
even in principle — their `trigger_gcd` is assigned literally in a C++
constructor. Writing a fake DBC record would have been the dishonest
alternative; the artifact validator refuses any token carrying two grades at
once, because there would be no rule for which wins.

The potion lane is deliberately read off `dbc_consumable_base_t`, the shared base
class, rather than off any particular potion. The pinned default potion is chosen
by player level (apl_rogue.cpp:6-15) and Warcraft Logs supplies no level, so an
identity-based reading would have been unresolvable. A base-class reading holds
for every potion identity and makes the missing level irrelevant.

`blood_fury` resolves to THREE spell rows, selected by a class mask this build
does not evaluate. All three are recorded and all three agree on the lane, so the
token is classifiable without anyone deciding which row a Rogue gets — the same
device `thistle_tea` already used for its talent branch.

### What M5-C3c3a established, and what it refused to

Every PLAYER_ACTION on the real root -> Garrote authority graph now has a lane,
including Garrote itself, which the eventual answer depends on. Two more entries
are proven unusable:

    default[0] stealth   PROVEN_UNUSABLE(ALREADY_STEALTHED)
    cds[4]     kingsbane PROVEN_UNUSABLE(ACTIVE_COOLDOWN)

The Stealth verdict is the cheapest in the milestone and costs no new evidence:
`stealth_t::ready()` is guarded on `stealthed( STEALTH_BASIC | STEALTH_ROGUE )`
(sc_rogue.cpp:6086) and the APL expression `stealthed.rogue` passes the identical
mask to the identical function (sc_rogue.cpp:9661). They are the same query, so
M5-C2's existing TRUE is already a readiness proof. Only TRUE proves anything —
`ready()` has further guards below the mask test, so an UNKNOWN stealth state
stays UNKNOWN. Stealth cannot fire here, so no transition is modelled for it.

The Kingsbane verdict reuses C3c2's cooldown bridge unchanged, now wired for
ordinary abilities as well as items. The derivation stays BOUNDED: the bridge
consumes a LOWER BOUND (>= 57.198 s) against an established tolerance (250 ms)
and never promotes the bound to an exact time. The wiring is generic — the
supported set is data, no token appears in the actionability layer — and a
positive observation always beats a derivation, so a cooldown anchored on an
earlier cast can never contradict an action seen firing.

Two root-prefix entries remain honestly unresolved and belong to C3c3c:

    default[1] kick        readiness depends on enemy interruptible-cast state
    default[3] thistle_tea condition depends on predictive `fight_remains`

Neither is inferred unready from the log showing no such cast. Absence is not
evidence.

Finally, and most importantly: **no first-GCD claim is made.** The literal
traversal still comes to rest at `default[5] -> cds[3] -> misc_cds[0] potion` and
still returns UNKNOWN. The rescan engine that would consume all of the above is
M5-C3c3b, and until it exists an improvement in what can be classified must not
become an improvement in what is claimed.

Still unmodelled anywhere:

    the shared item CATEGORY cooldown, which obeys a DIFFERENT rule — a strict
      `remains() > 0` with no tolerance (`use_item_t::ready`). Recorded in the
      artifact so its omission is visible; never routed through the bridge.
    cooldown resets, CDR and charges for abilities that have them
    Deathmark, Rupture and Envenom aura state
    buff stacks, Scent of Blood, spell target counts
    target time-to-die and fight remains, which stay predictive

## Zero-GCD Actions Still End the Scan

SimulationCraft's foreground scan returns the FIRST ready action and stops,
whatever its GCD. `variable` is the only construct that executes and lets the
scan continue.

So a zero-GCD action is not a passenger on someone else's decision:

1. the scan returns it and stops — lower entries are never reached
2. it executes, and may change combat state
3. `gcd_ready` is not advanced
4. the actor is scheduled ready again
5. a NEW scan begins from the top, against POST-EXECUTION state

A zero-GCD action and the GCD action that follows it are therefore **two
decision points**, not one decision with a rider. They must never be merged.

## Rotational-Slot Eligibility Is Not Selection

Execution lane supports one narrow structural question:

    which entries are CAPABLE of occupying the next rotational GCD slot?

That is decidable from pinned APL text plus pinned game data, with no combat
state and no readiness proof. For the pinned Assassination `default` list it
establishes that entries 0..3 cannot themselves occupy the rotational slot and
that entry 4 is the first that can.

It does **not** establish what fires, and it does **not** license evaluating a
later entry against the state that preceded an earlier one. An earlier zero-GCD
entry can execute and change that state first. Eligibility narrows where a
rotational answer may come from; it is not the answer.

---

# Milestone 5-D — Broader Single-Target Assassination Coverage

M5-C proved ONE real end-to-end decision. M5-D asks how much of the rest of the
pinned Assassination APL this architecture can analyse exactly.

## M5-D Is SINGLE-TARGET Breadth

The boundary is explicit and is not a temporary shortfall.

`spell_targets.fan_of_knives` is the most-used unsupported atom in the reachable
authority — nine entries across four lists — and it is not reconstructible in
principle. It counts the SIMULATION's whole enemy roster
(`action.cpp:3832-3842` via `available_targets`, `action.cpp:1729-1755`), which
is a sim configuration rather than a spatial fact. Warcraft Logs supplies no
equivalent, and only a LOWER bound would ever be derivable — which decides
`spell_targets>1` and never `spell_targets=1`, so every single-target gate in
the APL would stay unknown anyway.

Therefore, deferred out of M5-D entirely:

- exact or bounded target counts
- `variable.single_target` resolution
- builder selection — EVERY builder entry in the pinned APL is target-count gated
- multi-target enumeration, target scoring and `target_if`
- general `cycle_targets` support

## Action Options Are a Syntax Surface, Not Noise

An APL line is `token,key=value,…`. Reading only the token and the `,if=` value
was safe only while the conditions on option-bearing lines happened to fail the
parser. From M5-D1 option keys are DERIVED and CLASSIFIED, and an unrecognised
one fails closed:

    SUPPORTED               modelled, or provably irrelevant to selection
    UNSUPPORTED_TARGETING   changes WHICH target the condition is about
    UNRECOGNISED            never seen at this pinned commit; fails closed

`cycle_targets` and `target_if` are recognised and REFUSED. Recognising them is
what turns a silent misreading into an explicit UNKNOWN.

### The one target-independent exception

`action_t::ready()` re-runs `action_ready()` per candidate target
(`action.cpp:2463-2488`). A top-level conjunct built entirely from PLAYER_SCOPED
atoms therefore has the same value for every candidate — so a FALSE one makes the
whole condition FALSE for all of them, the cycle loop finds none ready, and the
entry cannot select. No target is enumerated to establish that.

This is why atoms carry a SCOPE alongside their shape. `target_if` is NOT routed
through the rule: it SCORES candidates and retargets the action, which changes
what every later atom in the scan reads, and one conjunct cannot settle that.

## Self-Addressing Atoms Need an Acting Action

`remains`, `refreshable` and `pmultiplier` are written bare and mean "the ACTING
action's own DoT". Until M5-D1 the bindings carried ONE scalar remainder, so the
moment `core_dot[3]` — which is Rupture — became parseable it would have been
answered with Garrote's remaining time. Both are plausible numbers of seconds and
nothing would have looked wrong.

Those bindings are now KEYED BY ACTION TOKEN and read through an
`ExpressionContext`. A caller that supplies no context, or an action nobody
bound, gets UNKNOWN — never another action's value.

## One Charge Is the Ordinary Case Wearing a Different Hat

SimulationCraft branches on the CHARGE COOLDOWN, not the charge count
(`action.cpp:710-724`), and `cooldown_t` is constructed with `charges( 1 )`
(`cooldown_impl.cpp:101`). A charge system with `charges == 1` therefore sets the
count to the value it already had: it is arithmetically identical to an ordinary
cooldown whose duration is the CHARGE cooldown.

That equivalence — and only that one — is supported. `charges >= 2` still returns
UNKNOWN, because "remaining" stops being one number when an ability is usable NOW
and recharging at the same time.

Note WHICH field becomes the duration. For a charge ability the nominal
`_cooldown` is demoted to an internal cooldown; Vanish carries `_cooldown` 1000
and `_charge_cooldown` 120000, so reading the nominal field would claim a
one-second recharge for a two-minute ability.

## NON_GCD Gate Irrelevance

The highest-risk primitive in M5-D1, and the most constrained.

The default for an unparseable player-action condition is to BLOCK. For a NON_GCD
entry whose execution is provably inert, both worlds converge — it fires and the
scan restarts, or it does not and the scan continues — so refusing to explore
either is refusing to answer a question the evidence settles.

A caller may claim gate irrelevance only with evidence establishing ALL of:

1. the action is NON_GCD
2. applicability is known
3. a reviewed transition contract exists
4. `timeAdvanceMs === 0`
5. a named progress mechanism prevents infinite re-fire
6. every state the execution writes is reviewed
7. none of those writes is read on the path to the answer

It claims the gate is UNREAD, never that the gate is TRUE. The step keeps its
`UNSUPPORTED` condition verbatim and the candidate it contributes is never
`definite`.

**It can never apply to a GCD-consuming action.** For those the two worlds do not
converge at all, because "it fires" IS the answer. That is guarded twice:
`GateIrrelevanceEvidence` types its lane as the single literal `"NON_GCD"`, and
`firstGcdSelectionAcrossRescans` refuses a GCD candidate whose recorded gate is
`UNSUPPORTED` with its own blocker.

## `refreshable` Is One-Sided

A reader who knows the game will expect the 30 % pandemic rule. That is NOT what
pinned SimulationCraft evaluates for a Rogue DoT. The Rogue module never assigns
`dot_behavior`, so every Rogue DoT keeps `action_t`'s default
`DOT_REFRESH_DURATION` (`action.cpp:419`), whose predicate is
`dot->ticks_left() <= 1` (`action.cpp:4627-4628`, `dot.hpp:88`).

    TRUE     the DoT is proven NOT ticking (dot.cpp:462-466)
    FALSE    remains > baseTickPeriod, so at least two ticks remain
    UNKNOWN  ticking, and within one base tick

The FALSE direction is sound because haste and `1 / exsanguinated_rate` only ever
SHORTEN the tick period, making the base period an upper bound. Proving TRUE for
a ticking DoT would need a LOWER bound, which needs haste — so the middle stays
UNKNOWN rather than being guessed.

## Exact Entry Versus Converged Token

Two claims, kept apart:

    SELECTED         this authority ENTRY was selected. A consumer may quote its
                     list, ordinal, verbatim string and control-flow path.
    TOKEN_CONVERGED  this ACTION was selected, from one of these entries. The
                     entry is unresolved and there is NO field a consumer could
                     read as one.

The pinned `spend` list makes the distinction real: at maximum combo points
`spend[0]` might fire and `spend[1]` definitely does, and both are Envenom.
M5-B's scoped walk has always converged on the token, so this is not a new
epistemic standard — it is that standard becoming expressible in the nested and
first-GCD engines, which previously had to collapse it into a refusal.

`SELECTED` and `ROTATIONAL_GCD_SELECTED` still require entry unanimity. Token
convergence additionally requires that every terminal genuinely selects an
action: a world that returns nothing, or one that refuses, collapses the claim.

## A Ready Major Cooldown Is Still Not Selectable

M5-D1 adds Deathmark and Vanish cooldown authority, which lets those entries be
ELIMINATED on readiness far more often. It does not make them SELECTABLE.

`cds[0]` and `cds[4]` both end in `(target.time_to_die>10|fight_remains<20)`.
Both atoms are PREDICTIVE and permanently unbindable, so that disjunction is
UNKNOWN on every branch and neither entry can ever resolve TRUE. A ready-Deathmark
world therefore still returns UNKNOWN, and that is the desired outcome rather
than a gap to close.

## Analyzer Coverage Is Not Report Coverage

`tests/contracts/m5d1-authority-coverage.test.ts` pins how much of the AUTHORITY
this build supports: the reachable lists, the player-action tokens, the execution
lanes, the supported and refused expression families, the action-option
classification, and the transition-contracted actions. Every set is exhaustive,
so a pinned APL that gains a list, an action, an expression family or an option
FAILS THE BUILD rather than being silently ignored.

That is deliberately NOT the coverage of an analysed report — how much of one
player's fight was evaluable, and how confident the result was. That is a
player-facing disclosure and belongs to M5-E.

## M5-D1 Versus M5-D2

M5-D1 is INFRASTRUCTURE. It adds primitives and proves each one in isolation and
against the existing committed fixtures. It deliberately does NOT capture the
wider actor-19 slice or add the representative decision corpus.

M5-D2 owns the corpus: seven real decisions from one real pull, on a committed
slice wide enough to carry the cooldown and DoT anchors they need.

---

# Milestone 5-D2 — What M5 Actually Does

## The Capability Is Authority VERIFICATION, Not Next-Action Prediction

State this before anything else, because the two are easy to confuse and only
one of them is true.

    M5 can answer:      the player cast X here. What does the pinned
                        SimulationCraft authority select at this moment, and can
                        we name the exact entry?

    M5 cannot answer:   it is 14:32 into the fight. What should the player press
                        next?

The difference is USABILITY. `action_t::ready()` guards every selection with
`cooldown->is_ready()`, `cost_affordable()` and `player->is_moving() &&
!usable_moving()`. This project has exactly ONE positive proof that all three
held — the observed execution. An action that demonstrably fired demonstrably
was ready, affordable and not movement-blocked.

At a position where the action was NOT cast there is nothing to prove it with,
and each guard is independently out of reach:

- **Cooldown.** `cooldown_t::start` adds a delay sampled from
  `player->world_lag`, a `truncated_gauss_t` whose `max` is left at the
  no-maximum sentinel and never assigned (`sim.cpp:1430`, `rng.hpp:50`). The
  delay is unbounded above, so elapsed time never proves a cooldown finished.
  `CooldownState` says so in its own comment: there is deliberately no upper
  bound field.
- **Cost.** Energy is exact only ON an observation, and M4-C1 forbids replaying
  regeneration between observations.
- **Movement.** Garrote's `_max_range` is 5.0 (`sc_spell_data.inc`), so
  `usable_moving()` returns false (`action.cpp:2389`) and the guard reduces to
  bare `is_moving()` — which CLAUDE.md records has no Warcraft Logs stream.

So `resolveUsability` has two `PROVEN_USABLE` return sites and both are the
observed cast; `usabilityFromCooldown` returns `PROVEN_UNUSABLE` or UNKNOWN and
never the positive. That is a deliberate M5-C3c1 design decision, not a gap.

**Corpus case 2 measures exactly this boundary** and is the reason it is written
down. At a real position between a real Vanish and a real Garrote, with the
observation suppressed, `core_dot[0]`'s condition resolves TRUE on real state —
every D1 primitive does its work — and the decision still cannot be named.

Closing this would need a positive cooldown-readiness member, bounded Energy
carry-forward AND a movement policy. Three separate epistemic decisions, one of
which contradicts a standing rule. None is in M5.

## Measured Coverage of the Real Corpus

Seven real decisions, chosen mechanically from the full-fight cast census:

    EXACT_ENTRY       1     case 1, the observed Garrote at Q
    TOKEN_CONVERGED   0
    NO_ACTION         0
    UNKNOWN           6

The six refusals are not one problem. `src/specs/rogue/assassination/
decision-coverage.ts` classifies them, and the split matters because it tells a
reader which gaps can ever close:

    OBSERVED_STATE_MISSING   4   an evidence gap; a binding or capture may close it
    DIVERGENT_WORLDS         2   real ambiguity, not missing data

Two of the seven cases are decisions the player DID make and the analyzer still
declines to evaluate — a Deathmark gated on `target.time_to_die|fight_remains`,
and a Fan of Knives gated on `spell_targets.fan_of_knives`. Observing a cast
proves the action was usable. It never reveals a target count and never reveals
the future.

Cases 3, 4 and 5 are worth reading closely, because they show the priority rule
doing unglamorous work. In cases 3 and 4 the one-scan reaches `spend[1] envenom
SELECTED` — the spender question is fully resolved — and the answer is still
UNKNOWN, because `core_dot[0]` Garrote sits AHEAD of it unresolved. Returning
Envenom there would be precisely the short-circuit CLAUDE.md forbids.

## Analyzer Coverage Is Still Not Report Coverage

One decision in seven is committed as a number in
`tests/contracts/m5d2-decision-coverage.test.ts`, alongside the blocker census.
The census is pinned WITH the total on purpose: coverage may rise when a real
primitive lands, and must never rise because a refusal was weakened. Pinning
only the total would not tell those apart.

Turning this into the disclosure a player reads is M5-E.

## A Narrower Window Must Say Less, Never Invent

Every cooldown and DoT claim is anchored on an observed event, so a window cut
too late looks exactly like an effect that was not there. The corpus fixture's
start is justified by measurement rather than assertion: cutting past
`2,164,326` — the Garrote `applydebuff` — degrades case 1 from an exact entry to
UNKNOWN, and `tests/regression/m5d2-truncated-window.test.ts` re-runs that
degradation, including a sweep asserting no cut ever produces a STRONGER claim.

Related, and learned the hard way: fixture events are addressed by TIMESTAMP,
never by index. Widening the capture predicate moved an index-addressed query
point by 43 ms and silently changed a derived DoT remainder.

## The M5-D2 → M5-E Handoff

M5-E owns player-facing coverage disclosure. It inherits:

- `classifyDecision` / `censusOf`, a closed vocabulary of four outcomes and
  seven blocker classes, already counted over real decisions.
- The distinction M5-E must NOT flatten: `EXACT_ENTRY` is a stronger CLAIM than
  `UNKNOWN`, not a better outcome. A refusal that is correct is the analyzer
  working, and a disclosure that reads as a score will invite exactly the
  guessing this milestone spent its budget preventing.
- One hard constraint on wording. A report may say the authority's selection was
  identified for a decision the player made. It may not say what the player
  should have pressed at a moment they pressed nothing, because M5 cannot know.

---

---

# Milestone 5 — Closeout

## The Capability, In One Line

    Observed-action authority verification for Assassination Rogue.

Given a rotational decision a player ACTUALLY MADE, Milestone 5 can say what the
pinned SimulationCraft Assassination APL selects at that moment, how precisely it
can name it, and whether that agrees with what was cast.

It is not a rotation recommendation engine, a next-action predictor, or a source
of optimal play. Those phrases do not describe anything this milestone built.

## What M5 Supports

- Assassination Rogue, and only Assassination Rogue.
- One pinned SimulationCraft APL, committed as a JSON artifact with provenance
  and a measured source hash.
- Observed-decision authority verification: `MATCH`, `REJECTED`, `UNKNOWN`.
- Two levels of selection precision, kept apart: `EXACT_ENTRY` names a specific
  authority entry, `TOKEN_CONVERGED` names only the action.
- Partial coverage disclosure over a denominator of ELIGIBLE OBSERVED ROTATIONAL
  GCD DECISIONS, with excluded casts counted and named.
- Structured refusal: every UNKNOWN carries a blocker family that says whether
  the gap is an evidence gap or a permanent one.

## What M5 Does Not Support

- Arbitrary-position next-action prediction.
- AoE and builder selection.
- Exact SimulationCraft target counts (`spell_targets.fan_of_knives`).
- Predictive state: `fight_remains`, `target.time_to_die`.
- Movement state.
- Continuous Energy simulation between observations.
- General charge simulation beyond the one-charge equivalence.
- General `target_if` and `cycle_targets` execution semantics.
- Any other specialization.
- Coaching, optimality or severity language of any kind.

## The Observed-Usability Limitation

The most important thing M5 learned about itself, and the reason the capability
statement is worded the way it is.

**Positive action usability is established by observed execution.** An action
that demonstrably fired demonstrably passed every `action_t::ready()` guard —
cooldown, cost, movement. That is sound, and it is the ONLY positive usability
proof this build has.

At a position where the action was not cast, none of the three guards can be
established independently: the cooldown start delay is unbounded above in the
pinned model, Energy is exact only on an observation, and Warcraft Logs carries
no movement stream. The full derivation is in the M5-D2 section above.

D2 corpus case 2 is the measurement. At a real position between a real Vanish and
a real Garrote, `core_dot[0]`'s CONDITION resolves TRUE on real state — every D1
primitive does its work — and the decision still cannot be named, because Garrote
is not proven usable. The condition was never the hard part.

## M5-C3c3c, Stated Correctly

C3c3c is valid and remains so. It proves:

    exact first-GCD authority selection AT THE OBSERVED GARROTE DECISION POINT

It does NOT prove, and was never able to prove:

    a free-standing prediction that Garrote would be next, before it was observed

Both sentences describe the same passing test. Only the first one is true.

## Two Coverage Numbers, Deliberately Separate

    D2 corpus       1 exact of 7 cases      TEST TOOLING
    real decisions  1 MATCH of 11 eligible  RUNTIME DISCLOSURE

The corpus is a reviewed set that deliberately includes non-observed and
prediction-boundary cases; it measures the analyzer. The runtime coverage counts
only eligible observed rotational decisions; it measures one report. Neither is a
correctness rate, and the two must never be merged or reported as one figure.

## Technical Debt Ledger

### Fixed in M5-E

- **Thistle Tea execution binding.** The token bound to two candidate ability
  ids, one of which (469779) is a TALENT record that is never cast. Both C++
  branches resolve to 381623, one of them through
  `thistle_tea_auto->effectN( 1 ).trigger()`. The extractor now parses
  `__spelleffect_data`, derives the `_trigger_spell_id` column from the struct
  declaration, verifies the relation against the pinned table, and records the
  resolution in the artifact. The id was resolved, not deleted. Lane semantics
  are unchanged: both records were always off-GCD.

### Deferred beyond M5

- Mutilate dual ids 1329 / 27576.
- Garrote's modifier-bearing cooldown, correctly refused today.
- `spell_targets` lower-bound support.
- AoE and builder selection.
- `target_if` / `cycle_targets` execution semantics.
- Arbitrary-position positive usability (cooldown upper bound, Energy carry
  forward, movement policy — three separate epistemic decisions).
- Continuous resource carry between observations.

The first five surface in the runtime output as `EXECUTION_LANE_NOT_ESTABLISHED`
exclusions rather than as silence.

## The `/v1/analysis` Wiring Decision

> **Superseded by Milestone 6-E.** The composition described below as missing
> was built across M6-B (application composition), M6-C (public contract) and
> M6-E (production binding). `/v1/analysis` now returns a
> `warcraft-logs-coach.analysis/1` result, identical to what MCP returns. The
> reasoning below is the M5-E-era record of why it waited.

**The endpoint stays at HTTP 501 `ANALYSIS_NOT_IMPLEMENTED`.**

Wiring it needs the M2 → M3 → M5 composition that does not exist yet: retrieval
at the derived scope, normalization, actor and specialization resolution carried
from preflight into the analyzer, and a deliberately small public projection of
the result. That is an integration milestone. Shipping a hasty version would
expose internal trace types as a public contract, and a public contract is the
hardest thing to take back.

What DID change is the message. It used to say no analyzer existed, which stopped
being true — so it now states that the analyzer is implemented internally and
regression-tested but not wired here. Claiming less capability than exists is
still a false statement about the system.

## Handoff to M6 — MCP Interface

M6 receives:

- `analyzeObservedAssassinationDecisions` — a pure function over an
  already-ingested normalized fight. No HTTP, no retrieval, no network.
- A stable comparison output: three outcomes, six bases, two precision levels,
  a locator per decision.
- A coverage disclosure with an honest denominator and a named exclusion census.
- A hard supported-spec gate that returns `SPEC_NOT_SUPPORTED` rather than
  applying Rogue rules to another specialization.
- Authority provenance read from the artifact, never hand-maintained.
- This limitations list.

One constraint travels with it. A surface may report that the authority's
selection was identified for a decision the player made. It may not report what
the player should have pressed at a moment they pressed nothing — M5 cannot know
that, and no amount of exposure changes what the evidence supports.

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

## M10-A — second-spec architecture and authority contract

M10-A built the contracts a second specialization registers against, without
creating its evaluator or exposing it. Protection Paladin exists only as an
internal-only `SpecId`. The contracts, and where they live:

| Concern                       | Module                                   |
| ----------------------------- | ---------------------------------------- |
| Internal vs public spec ids   | `src/findings/spec-id.ts`                |
| Spec-neutral analysis envelope | `src/findings/analysis-envelope.ts`     |
| Projector-facing view         | `src/findings/observed-decision-view.ts` |
| Authority domains and bindings | `src/findings/authority-domain.ts`      |
| Decision capabilities         | `src/findings/decision-capability.ts`    |
| Registration row              | `src/findings/analyzer-registration.ts`  |
| Catalog, exposure, integrity  | `src/services/analyzer-registry.ts`      |
| Assassination's registration  | `src/specs/rogue/assassination/registration.ts` |

Rules the tests pin:

- A registration is `INTERNAL_ONLY` or `PUBLIC`. Public dispatch (the
  application service, raid-night, REST, MCP) selects `PUBLIC` rows only. The
  public set must equal the public spec partition and the identity table.
- Registry corruption is an `INTERNAL_ERROR`, never `SPEC_NOT_SUPPORTED`.
- An internal-only analysis cannot be projected publicly — not as unsupported
  and not as `specId: null`. `null` means only "no public analyzer".
- Authority is bound per domain (`OFFENSIVE_ROTATION`, `RESOURCE_SPENDING`,
  `ACTIVE_MITIGATION`, `DEFENSIVE_COOLDOWN`, `SELF_HEALING`, `INTERRUPT`). A
  SimulationCraft APL may bind `OFFENSIVE_ROTATION` only. Absence is a typed
  resolution outcome (`DOMAIN_NOT_DECLARED`, `NO_PINNED_AUTHORITY_FOR_DOMAIN`,
  `AUTHORITY_LOAD_FAILED`), never a binding and never an evidence UNKNOWN.
- State requirements are declared per decision capability and derive the
  ingestion requirement; Assassination declares one capability and derives
  exactly the `PLAYER_CONTEXT` / resources-on requirement it had before.
- Specialization payloads stay spec-owned; shared projectors read the view the
  registration supplies.

M10-B captured bounded Protection Paladin evidence and added the shared-state
foundations it needs (for example a `HOLY_POWER` wire contract). M10-C built
the internal evaluator under `src/specs/paladin/protection/`.

## M10-D — public integration

M10-D moved `paladin/protection` public. The move is one reviewed edit to
FIVE sites the compiler and the registry require to agree: the public spec
partition (`src/findings/spec-id.ts`), the public contract's own `specId`
enum (`src/contracts/analysis-contract.ts`), the identity table
(`src/services/spec-identity.ts`), the `satisfies` on
`src/specs/paladin/protection/spec.ts`, and the registration's exposure.
Moving any one alone fails at compile time or at catalog validation.

Rules the tests pin:

- Every known specialization is PUBLIC; `INTERNAL_ONLY_SPEC_IDS` is EMPTY
  (from M10-D to M11-A3, held Retribution Paladin from M11-A4, empty again
  since M11-A5). The internal-only partition, `requirePublicSpecId`,
  `InternalSpecExposureError` and the registry's exposure rules are retained
  as dormant architecture for the next specialization, and the emptiness is
  pinned explicitly rather than left to look accidental.
- An injected catalog must carry every public registration, exactly as the
  production catalog must; a test that observes or replaces one row builds the
  whole catalog (`tests/support/catalog.ts`). A catalog missing a public row
  is refused as INTERNAL_ERROR, never served from the rows that survived.
- Schema `warcraft-logs-coach.analysis/1` is unchanged. Widening the public
  `specId` enum is how supported specializations arrive; no field, meaning or
  discriminant changed and no previously issued document changed.
- The Protection view applies ONE transformation: `MELEE_SWING →
  NON_GCD_ACTION` per excluded cast and in the coverage tally (rows sharing a
  public reason merge; the sum still equals `excludedCastCount`). Every other
  vocabulary the payload publishes is a shared one already pinned equal to the
  public enum. Raw blockers, domain results, Holy Power observations, build
  resolution and resolver diagnostics stay inside the payload.
- Public `detail` strings are author-written and fixed; no resolution-outcome
  constant is interpolated into them.
- The canonical UNSUPPORTED specialization is Warrior/Arms, A7R6 fight 7
  actor 4, machine-pinned from the committed fight-context artifact. Every
  unsupported-path proof (identity, service refusal, projection, REST, MCP,
  parity, raid night, corpus) names it; the identity/evidence pairing
  `Paladin/Protection` over Rogue events is never used, because it would
  dispatch a real analyzer over another class's evidence.
- A mixed raid night over the real A7R6 opener slice (Protection ANALYZED,
  Assassination PROFILE_NOT_RESOLVED because the slice holds none of its
  evidence, Arms SPEC_NOT_SUPPORTED, an absent player) proves one roster
  query, one ingestion, one revision check, each analyzer once, and that
  encounter/comparison context leaves the Protection cell untouched.
- Corpus-only concepts (bundles, declared holes, evaluation windows) never
  appear under `src/`; a static guard pins it.
- Public wording (tool descriptions, this document, the Protection README)
  states the offensive-GCD-only scope and the excluded domains positively, and
  claims no optimization, correctness, mitigation, survival, healing or
  interrupt evaluation.

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

## M11-A — the onboarding foundation

M11-A1 (guards) and M11-A2 (foundation, factory, proof) built the machinery
a third specialization registers against; M11-A3 selected Retribution
Paladin, M11-A4 landed it INTERNAL_ONLY, and M11-A5 promoted it PUBLIC —
the first complete pass through the onboarding slice. M11-A is complete;
M11 is not: twenty-nine ordinary specializations remain in the coaching
inventory. Healers remain M12 and Augmentation Evoker remains M13.

### The specialization module and its factory

`src/findings/spec-module.ts` — `defineSpecModule` — is where a
specialization tree states what it is: a canonical IDENTITY (`specId`,
`analyzerId`, `displayName`, the Warcraft Logs `wclClassName` /
`wclSpecName` the tree took from committed capture evidence, and the SimC
spec id and DBC-pinned role READ from the roster), an EXPOSURE, its decision
CAPABILITIES, the pinned AUTHORITY it binds per domain, its facade, its
view, its public LIMITS prose per surface, and zero or more SUPPLEMENTAL
analyses. The factory checks coherence (the id is known and is a roster
specialization; the display name is the roster's; identity strings are
non-blank; supplemental ids are prefixed and unique with valid evidence
requirements) and builds the registration row through
`defineAnalyzerRegistration`, so every M10 ownership rule applies unchanged.

What the factory owns: plumbing. What it refuses to own: every gameplay
meaning — APL contents, authority pins and hashes, vocabulary, state
bindings, resource/aura/cooldown/transition semantics, eligibility,
exclusions, decisions, projection mappings, corpus evidence, promotion
readiness. Those remain per-specialization code and data. There is no
`if spec === …` in the factory and the conformance suite pins that.

Both existing specializations are built through it
(`ASSASSINATION_MODULE`, `PROTECTION_PALADIN_MODULE`); their analyzers,
state, authority loaders, exclusions and views were not touched, and the
M10-D invariance captures are byte-identical before and after the
migration.

### The supplemental-analysis seam

A specialization may own supplemental, deep-dive analyses over the same
normalized combat state — a temporal window, a mechanic clip, resource
waste, cooldown alignment, a proc window, an uptime — each returning
spec-defined findings, `UNKNOWN`, or `NO_AUTHORITY_AVAILABLE`. M11-A2
established the type (`SupplementalAnalysisDefinition`), the registration
seam on the module, and the conformance rules only. Both current
specializations register none; nothing in `src/services`, `src/contracts`,
`src/mcp` or `src/api` invokes or names one; no public field carries a
supplemental finding. Wiring a supplemental analysis into orchestration,
ingestion-scope derivation and (additively) the public contract is a future
specialization milestone's design, not a default.

### The pinned specialization roster

`src/data/game/spec-roster.json`, produced by
`scripts/authority/extract-simc-roster.mjs` from `specialization_spells.inc`,
`util.cpp` and `client_data_version.inc` at the project's pinned commit,
lists every PLAYABLE specialization at that build — forty, including
Devourer Demon Hunter — with hunter-pet families and `Initial <Class>`
placeholders excluded structurally, and role pinned only from the
`Stat Negation Aura` passive (thirty-seven rows; the three Evoker roles are
`UNKNOWN`). It is reference data: a roster row confers no support. The
factory uses it to refuse a `specId` that names no real specialization and
to carry the SimC id and role on the identity. CI validates the committed
artifact; the extractor runs only against a local pinned checkout.

### Spec-level corpus ownership and generalized isolation

Corpus layers own `src/specs/<class>/<spec>/`, never the class directory,
and the test-owned `SPEC_LAYER_OF` is a total, injective join from every
`SpecId` to its layer. Cross-specialization isolation is a structural rule
over every discovered tree (`m11a2-cross-spec-isolation`): no tree imports
another; spec-owned data (`src/data/game/<class>-<spec>-*`, the APL
artifact) is consumed only by its owner; class-level data is class data, not
the first spec's; and the M5-era Assassination exceptions —
`src/simc/pinned-authority.ts`, the generically named
`ability-gcd-semantics.ts`, the `rogue-*` datasets — are FROZEN by name,
not a pattern.

### Decision-authority ownership

A decision authority (`SIMC_APL_<CLASS>_<SPEC>`) bound to a domain is owned
by exactly one registration for that domain
(`DUPLICATE_DECISION_AUTHORITY_BINDING`). Shared PROVENANCE is legitimate:
the same SimulationCraft commit, the same upstream source file (two regions
of one `apl_paladin.cpp`), the same client build, class-level mechanics
datasets.

### Internal-first onboarding and the promotion gate

A new specialization arrives as `INTERNAL_ONLY`: its id joins `SPEC_IDS`
and `INTERNAL_ONLY_SPEC_IDS`, its module registers, its facade is exercised
through `internalAnalyzerForSpec`, the corpus executors and the
registration's view, and the public Worker, REST, MCP and raid-night keep
refusing it. Promotion is a reviewed working-tree edit to the five public
sites, verified by parity, schema, invariance and the promotion-evidence
gate against the candidate tree, then committed and CI-checked, then — only
after committed CI success — separately authorized for production smoke.

The promotion-evidence gate is TEST-OWNED
(`tests/contracts/m11-promotion-evidence-gate.test.ts`): a PUBLIC
registration must be backed by at least one corpus `DECISION_COVERAGE`
assertion expecting `MATCH` or `REJECTED`, whose whole referenced evidence
set is `SANITIZED_CAPTURE` (a `SYNTHETIC` or `DERIVED_FROM_CAPTURE`
artifact anywhere disqualifies), whose actor the committed fight-context
master data proves to be that specialization — through the identity table
for a PUBLIC spec, against the module's own WCL strings for an
INTERNAL_ONLY one — and which the committed corpus report records as
PASSED. Zero qualifying cases fails CI for a PUBLIC spec and is reported for
an INTERNAL_ONLY one. Production carries no case id, artifact id, layer or
readiness; `m10d-no-corpus-window-in-production` pins that.

### The current unsupported subject

The real unsupported identity every unsupported-path proof uses is
centralized in `tests/support/unsupported-subject.ts` (Warrior/Arms, A7R6
fight 7 actor 4) and proven from the committed context. It is
milestone-scoped: the guard fails the moment `warrior/arms` becomes a
`SpecId` in any exposure, so the fixture is migrated before that
specialization is onboarded.

### M11-A3 — authority audit and first-spec selection

An audit/selection milestone: no analyzer, no `SpecId`, no engine change.
`agent/m11-a3-authority-audit.md` records the read-only bounded audit of the
pinned SimulationCraft lists of all thirty ordinary M11 specializations
(seventeen at line level — the ones with real evidence — thirteen
structurally), the existing real evidence (every ordinary M11 identity has
LOCAL RAW evidence only: the actor-unfiltered A7R6 fight-7 and gtKb
fight-22 captures; no committed sanitized capture exercises one), the
engine-gap inventory, and the G1–G7 matrix. Outcome:

    FIRST NEW SPEC: paladin/retribution

Retribution is the only audited list with no `run_action_list`, no
`target_if`, no cast times and a target count read exactly once inside one
variable; its spender decisions resolve on real evidence (A7R6 actor 6, by the A3
hand walk: 13 `REJECTED` by unselectability alone, 6 `MATCH` + 2 `REJECTED`
through the definite scan, 48 `UNKNOWN` with named blockers — figures
SUPERSEDED by the M11-A4 production-path result below: 1 MATCH, 10
REJECTED, 58 UNKNOWN). The one identity dependency was race for the
GCD-consuming `lights_judgment` line, thought closable by a pinned faction
fact; M11-A4 removed it instead (the class/spec authority boundary). `agent/m11-a4-first-spec-contract.md` is the
bounded A4 scope; `agent/m11-spec-coaching-inventory.md` and the
test-owned `tests/support/m11/coaching-inventory.json` (proven by
`m11a3-coaching-inventory`) carry the deep-dive question framework, the
thirty-spec backlog in structural cohorts, and the Ritual Clipping
requirement under its unresolved Diabolist ownership. The fifteen lists
behind `run_action_list` and the eleven casters wait on named engine
milestones, not on spec work.

### M11-A4 — the Retribution Paladin INTERNAL_ONLY vertical slice

The first M11 analyzer, landed INTERNAL_ONLY exactly as the onboarding
foundation intended: `src/specs/paladin/retribution/` is a specialization
module (`RETRIBUTION_PALADIN_MODULE`, through `defineSpecModule`) registered
in the production catalog with `exposure: "INTERNAL_ONLY"`,
`supplementalAnalyses: []`, and `paladin/retribution` in
`INTERNAL_ONLY_SPEC_IDS`. The public partition, the public contract's
`specId` enum, the identity table, the enabled-analyzer set, the derived
"Supported specializations" prose and the MCP `tools/list` document were
unchanged; a public request for a Paladin/Retribution identity still received
`SPEC_NOT_SUPPORTED`. The analyzer was reached by the internal lookup, the
corpus and tests only. (M11-A5 then promoted it; see below. The rest of this
section describes the analyzer, which the promotion did not change.)

**The slice.** Observed Holy Power SPENDER decisions — every Divine Storm and
Templar's/Final Verdict cast — compared against the pinned
`SIMC_APL_PALADIN_RETRIBUTION` artifact (the retribution region of
`apl_paladin.cpp` at the one Paladin commit, a distinct authority id from
Protection's) through the nested unselectability proof (every entry naming
the token, in every list) and the shared first-GCD query. Every other
in-domain GCD press is observed and excluded as `OUTSIDE_FIRST_SLICE`, never
judged. Holy Power is read from the decision cast's own PRE_COST entry and
never replayed; a Divine Purpose free cast carries no entry and stays
UNKNOWN.

**Two contract amendments, both adopted by the product owner on 2026-09-18
after the first evidence rerun stopped:**

1. *The class/spec authority boundary.* Racial actions, potions, item uses,
   external buffs and other non-class/spec preparation entries are OUTSIDE
   the rotational decision domain, classified by token category before
   selection (`domain-boundary.ts`, the shared
   `OUTSIDE_SUPPORTED_DECISION_DOMAIN` applicability reason). Race and
   faction are not read, not inferred and not an A4 dependency; the
   faction/race closure attempted first (one authorized `gameData.factions`
   query, two named actors) produced contradictory wire evidence and was
   stopped rather than inferred, and its outputs stay in `.probe/` only.
   MATCH means "compatible with the pinned class/spec authority after the
   non-domain exclusion".
2. *The exact-known buff-stack binding.* `AtomBindings.knownBuffStacks` is
   the smallest generic seam the shared evaluator gained: a caller may state
   a `buff.<name>.stack` value it has PROVEN exactly; an unbound stack atom
   stays UNKNOWN_NUMBER as before, no count is inferred from any other
   binding, and no arithmetic or enumeration rule changed. Retribution binds
   ONLY exact zero, under `PROVEN_INACTIVE` (M4's EXACT INACTIVE from an
   observed removal) or `TALENT_NOT_SELECTED` (the producing talent disproved
   at its choice node); an ACTIVE aura leaves the atom unbound. That is what
   decides `generators[3] blade_of_justice`'s gate outside wings.

**What settles an open constructor reading.** The three-way talent rule
cannot disprove a NORMAL node absent from the tree (Radiant Glory), which
left the Avenging Wrath entry's applicability UNKNOWN and blocked every
scan. A generic "the actor cast an ability the token binds to, so the
action is foreground" inference was tried and REJECTED at review: a
background or triggered action executes and can log a cast too (Crusading
Strikes 408385 does), so an observed spell id alone is not selectability.
What settles it is a hand-reviewed FOREGROUND-ONLY execution fact for this
one action (`paladin-retribution-foreground-execution-authority.ts`): the
pinned module executes 31884 only through the foreground constructor
(sc_paladin.cpp:282-294), the only background/triggered wings being the
distinct record 454351 (:275-280, :3304-3307; Wake of Ashes under Radiant
Glory, sc_paladin_retribution.cpp:846-851), so an observed 31884 cast is a
foreground execution under the pinned mechanics and the constructor's
guards were false. The rule refines UNKNOWN → APPLICABLE only, for tokens
with such a fact only; it never converts a BACKGROUND reading (a
contradiction stays UNKNOWN), and a token without a fact keeps its
reading whatever was cast. Templar's
Verdict is APPLICABLE only when a worn item is pinned as a two-handed weapon
(a two-hander equips only in the main hand, so no slot-index convention is
assumed).

**Diagnostics the shared engine does not give.** The engine reports a
blocked root scan at its EARLIEST unresolved candidate, which for this list
is always the NON_GCD `default[0] auto_attack`. The adapter also records the
root scan's innermost BLOCKED step (`rootScanBlockedAt`) so the coverage
disclosure can name the entry the evidence could not decide. A diagnostic,
never a verdict.

**Real evidence, committed.** Four sanitized slices cut from captures the
corpus already held (no new Warcraft Logs request): A7R6 fight 7 actor 6 over
165 s as three bundle-composed parts, and gtKb fight 22 actor 23 over 20 s.
Through the production path: 69 eligible spender decisions — 1 MATCH (Final
Verdict at +104,407 ms, exact entry), 10 REJECTED (unselectability; two
also scan-selected), 58 UNKNOWN with the stopping entry named (46 at the
finishers callee because `variable.ds_castable` is undecided until the
arbiter auras' first observed transition; the rest at wings, Wake of Ashes or
Divine Toll possibly ready with their `raid_event` gates unreadable) — and
15 of 15 UNKNOWN on the opener subject. The corpus grew from 34 artifacts /
112 cases to 38 / 128 with `SPEC_RETRIBUTION_PALADIN` as its own owning
layer; the promotion evidence gate now REPORTS the INTERNAL_ONLY module's
readiness (real MATCH and REJECTED, paired against its own WCL identity)
and authorizes nothing.

**Still UNKNOWN by design.** Inside wings, Hammer of Wrath's charge count is
unbindable (Final Verdict resets its cooldown on an unobservable proc);
Blade of Justice's hasted, charge-modified cooldown is refused; a positive
Art of War stack is never bound; Judgment's complementary readiness
(unusable while the readiness aura is up) is not proven — it would need a
new shared reason and is never decisive on the spender path; `gcd` has no
model. Each is recorded on the payload, in the coaching inventory and in
`agent/m11-a4-first-spec-contract.md`.

### M11-A5 — Retribution Paladin public promotion (M11-A complete)

Exposure only. The M11-A4 analyzer — its slice, its proofs, its fail-closed
edges, the class/spec authority boundary, the exact-zero stack binding and
the token-specific foreground-execution fact — is unchanged; what changed is
that a public request reaches it. The five-site move from M10-D, repeated:
`paladin/retribution` into `PUBLIC_SPEC_IDS` (leaving `INTERNAL_ONLY_SPEC_IDS`
empty again), into the public contract's `specId` enum, into the identity
table (`Paladin`/`Retribution`, the module's canonical `wclClassName` /
`wclSpecName`), `satisfies PublicSpecId` on `spec.ts`, and
`exposure: "PUBLIC"` on the registration. The catalog is three PUBLIC rows;
the derived sentence is "Supported specializations: Assassination Rogue,
Protection Paladin and Retribution Paladin." and Retribution's limits
paragraph is composed into both tool descriptions through the A2 seam, in
the same position and by the same mechanism as Protection's — nothing
hand-lists a name.

**The pre-promotion audit.** The test-owned promotion evidence gate reported
`evidenceReady: true` for the INTERNAL_ONLY module from four qualifying
assertions — one real MATCH (`the-real-match-final-verdict-at-2108996[0]`)
and three real REJECTED (`divine-storm-under-the-arbiter-storm-buff-is-
rejected-two-ways[0]`, `[3]`; `rejected-by-unselectability-alone-before-any-
cooldown-is-anchored[0]`) — every referenced artifact SANITIZED_CAPTURE, the
actor mechanically Paladin/Retribution, the committed report PASSED. After
the move the same four qualify in PUBLIC mode, paired through the identity
table, and the gate keeps the stronger M11-A4 standard for Retribution
explicitly: at least one real MATCH AND at least one real REJECTED.

**The one schema decision.** Retribution's population has an exclusion the
M6 vocabulary could not name truthfully: in-domain, authority-bound GCD
casts the slice observes and does not judge (Judgment, Blade of Justice,
Hammer of Wrath, Wake of Ashes, Divine Toll, Execution Sentence, the
strikes, Hammer of Light — 54 of the 167 excluded casts over the 165 s
subject). Mapping them onto an existing reason would have been false,
dropping them would cherry-pick the denominator, and reclassifying them as
UNKNOWN decisions would change the analyzer. With the product owner's
explicit authorization, ONE spec-neutral value was appended to
`PUBLIC_EXCLUSION_REASONS` under `warcraft-logs-coach.analysis/1` —
`OUTSIDE_SUPPORTED_SLICE`: the observed action is intentionally outside the
analyzer's currently supported decision slice; not a rotational judgment,
not MATCH, not REJECTED, not UNKNOWN-for-missing-state, not a performance
error. Additive, by the M10-D precedent of widening the `specId` enum; the
version string, every existing value and every field are unchanged, no
Assassination or Protection document changes byte for byte, and the
Retribution view projects its internal `OUTSIDE_FIRST_SLICE` onto it (and
`MELEE_SWING` onto `NON_GCD_ACTION`, as Protection does). No other public
concept was added; had one been needed, A5 would have stopped.

**What was proven.** The real Retribution subject over its own evidence is
ANALYZED on REST and MCP with deeply equal documents (`m11a5-retribution-
public-transports`); the public projection is total over every vocabulary,
withholds every payload field (domains, Holy Power, build, resolver
diagnostics, root-scan stopping entries, the foreground-execution proof) and
carries the internal outcomes decision for decision (`m11a5-retribution-
public-projection`); the application service's ANALYZED envelope equals the
internal lookup's analysis projected — the public path runs no different
semantics; raid-night orchestration analyzes a Retribution player alone and
in a roster with Assassination, Protection and Arms with one roster query,
one ingestion and each analyzer once, and no Retribution branch
(`m11a5-mixed-raid-night`); the Arms sentinel is unchanged. The corpus grew
from 128 cases / 407 assertions to 131 / 410 (a `PUBLIC_PROJECTION` case
naming the MATCH, two REJECTED, an UNKNOWN and seven excluded casts with
their public reasons; REST/MCP parity for the subject; a mixed raid night
over the Retribution slice), and the M11-A4 application-service case was
repurposed in place from SPEC_NOT_SUPPORTED to ANALYZED; no existing
Assassination or Protection expectation changed. Before/after captures of
the invariance harness are byte-identical for every Assassination,
Protection, Arms and internal-registration file; the deltas are the
Retribution documents (SPEC_NOT_SUPPORTED → ANALYZED over its own slice,
SPEC_NOT_SUPPORTED → PROFILE_NOT_RESOLVED over the Protection opener that
holds none of its evidence), the two tool descriptions, and the Retribution
cell of the mixed raid night.

**Not done, on purpose.** No supplemental analysis (`supplementalAnalyses`
stays empty), no analyzer improvement, no other specialization, no new
authority or evidence, no shared-engine capability, no schema v2, no
deployment. Production deployment and smoke remain a separately authorized
post-CI step (`agent/deployment-smoke.md`).

**Post-deploy: the raid night's final revision read (2026-09-18).** The
first production raid nights after the A5 deploy were refused with
`REPORT_REVISION_UNVERIFIED` while the same request succeeded from Node in
19 s (55 outbound requests, 56 of 9,000 points). Two changes followed.
First — DEPLOYED and production-validated — diagnostics: the transport keeps
fixed-shape facts about a failed attempt (a closed-vocabulary thrown-error
name, a timeout flag, the outbound ordinal: `WclDiagnostics`,
`countOutbound`), `checkReportRevision` keeps the transport's failure on
`RevisionCheck.cause` instead of collapsing it, and the raid-night service
emits ONE fixed-vocabulary log record (`RaidNightDiagnosticRecord`, through a
non-authoritative `diagnostics` port whose throws are swallowed) while the
public `REPORT_REVISION_UNVERIFIED` document is unchanged. That classified
production precisely: the 55th outbound request, `CoachReportRevision`,
aborted by the client's own 20 s timeout after every page and analyzer had
succeeded. Second — IMPLEMENTED, PENDING deployment and production
validation — the bounded retry: the service retries that ONE condition
exactly once (`UNVERIFIED` / `UPSTREAM` / `UPSTREAM_UNAVAILABLE` /
`isTimeout`) with a fresh request through the same port; the retry's answer
replaces the first and is judged by the unchanged rules (MATCHES publishes
and emits a `RAID_NIGHT_REVISION_RETRY_RECOVERED` record naming the first
failure by its closed-vocabulary fields; CHANGED refuses as changed;
anything else refuses as unverified with `retried: true` on the record). No
other cause is retried, the 20 s timeout, pagination and general retry
policy are unchanged, and nothing is ever published on the strength of a
timed-out check
(`tests/regression/m11a5-raid-night-revision-{diagnostic,retry}.test.ts`).
Whether the retry recovers the production raid night is not yet known; it
is proven offline only.

## M11-B — the `C_RUN_ACTION_LIST_DISPATCH` cohort, in sub-stages

The M11-B pre-flight audit (2026-09-18) adopted the A3 cohort C —
`warrior/arms`, `warrior/fury`, `warrior/protection`, `deathknight/blood`,
`deathknight/frost`, `monk/brewmaster`, `demonhunter/vengeance`,
`demonhunter/devourer`, `rogue/outlaw` — as the working M11-B architectural
cohort, and split it because its members share one engine blocker
(`run_action_list`) and then divide by a second one: hero-tree-gated
dispatch (Blood, Brewmaster, Vengeance, Devourer), target-count-gated
dispatch (Arms, Fury, Protection Warrior, Frost DK) and variable-gated
dispatch (Outlaw). Each sub-stage is authorized separately.

### M11-B1 — generic `run_action_list` control flow (shared engine only)

No specialization, no `SpecId`, no registration, no state binding, no
option key, no parser builtin: the nested traversal (`src/simc/
nested-selection.ts`) learned the pinned control flow of `run_action_list`
and nothing else.

**The pinned semantics, and where they are read.** A `run_action_list` entry
is not `ACTION_CALL`, so `player_t::select_action` RETURNS it as the selected
action once its gate holds (`player.cpp:14235`, `14264-14267`); it executes
at zero time, remembering the list to restore and activating its child
(`action.cpp:4740-4754`, `run_action_list_t::execute`); the very next
`execute_action` selects from the CHILD (`player.cpp:7376-7377`) and restores
the parent only after that selection (`player.cpp:7382-7386`). The
consequences the engine now models, at the run entry's own priority position:

| Gate | Behaviour | Trace |
| --- | --- | --- |
| proven FALSE | skipped like any not-ready entry; the parent continues at its next ordinal | `RUN_GATE_FALSE_SKIPPED` |
| certain (TRUE or unconditional), child offers candidates | the child's candidates ARE the scan's remaining candidates, verbatim; the parent's later entries are never visited | `RUN_ENTERED_SCAN_ENDS` |
| certain, child proven to select nothing | the selection is NOTHING; the parent's later entries are NOT fallen through to | `RUN_RETURNED_NO_ACTION_SCAN_ENDS` |
| certain, child blocked | the child's blocker propagates | `BLOCKED` |
| undecided | fail closed; neither world is explored | blocker `UNDECIDED_RUN_GATE` |
| unreadable | the existing parser refusal | blocker `UNSUPPORTED_AUTHORITY_EXPRESSION` |
| carries an unsupported option (`target_if=` on Arms' execute dispatch) | refused before the gate is read | blocker `UNSUPPORTED_ACTION_OPTION` |

**A run is not a call, one level up too.** The transfer is carried on the
scan outcome (`transferred`), so a run reached INSIDE a called list ends the
whole selection: the call returned the run action (`player.cpp:14255-14260`
returns whatever the callee selects), so the caller does not continue at its
next ordinal even when the run's child selects nothing
(`CALL_TRANSFERRED_SCAN_ENDS`). An undecided call gate above such a callee
blocks (`UNDECIDED_CALL_GATE_OVER_RUN`) rather than converging the
parent-continues and child-replaces-parent worlds. The empty-callee
convergence rule — an undecided call gate above a provably-empty callee is
harmless — still holds for callees that fell off their end; it does not apply
to one that transferred.

**Deliberately deferred, not forgotten.** World-union semantics for an
undecided run gate (explore both worlds, mark every contribution
non-definite, converge as calls do) are sound under the same Kleene rule the
call already uses and are NOT implemented here; the refusal is named so the
deferral is measurable. The active-stack cycle guard applies to run edges
unchanged (`CONTROL_FLOW_CYCLE` for `run X` inside X, X ⇄ Y, or a mixed
call/run cycle); the pinned `swap_action_list_t::ready`
(`action.cpp:4725-4731`) would instead make a run into the already-active
list not ready, and blocking is the conservative reading of that.

**What stayed conservative.** The single-list walker (`list-selection.ts`)
still refuses every dispatch, run or call, as it always has. The
reachability proof `proveSoleGateTo` (`apl-authority.ts`) still returns
`NOT_PROVABLE / UNMODELLED_DISPATCH` for any authority containing a run
entry: a FALSE-gated run edge is skipped exactly as a FALSE-gated call edge
is, so the sole-gate rule is very likely sound over a mixed graph, but it
was not re-derived in this tranche and is left refusing. Retribution's
nested unselectability proof (`observed-action-gate.ts`,
`AUTHORITY_HAS_LIST_DISPATCH`) is spec-owned and unchanged. The
`isUnmodelledDispatch` flag kept its name: it still reads truthfully for the
two consumers that do not model a run, and every reader keeps its meaning.
The decision classifier (`decision-coverage.ts`) reads the two new blockers
like any undecided gate — a permanent atom on the line names the class,
otherwise `OBSERVED_STATE_MISSING` — so the public blocker-class enum did not
grow and no public field changed.

**Proven.** `tests/unit/m11b1-run-action-list.test.ts` (FALSE / TRUE /
child NO_ACTION / child BLOCKED / undecided / unreadable / unsupported
option; the call-vs-run pairs; priority above and below a run; run → run,
call → run, run → call; the three cycle shapes; determinism; the first-GCD
root restart re-entering a run list through the one shared scan) and a
SYNTHETIC corpus family (`synthetic.apl-run-action-list`, seven
`SHARED_DECISION_ENGINE` cases, two new assertion kinds
`SCAN_SELECTS_NOTHING` and `SCAN_BLOCKED_WITH`) — regression evidence only,
never promotion evidence. The three PUBLIC artifacts contain no
`run_action_list`; the invariance harness's 33 captures are byte-identical
before and after, and the unsupported Arms sentinel is untouched. The
extractor's `requiredFacts` profiles were not changed: no artifact with a
run entry is produced in B1, and the target profile that first needs one
(M11-B2) will pin its call/run graph as target-specific data consumed by the
generic checker.

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
