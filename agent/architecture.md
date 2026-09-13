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

Control flow is complete; gameplay state is not. Still unmodelled, and each is
why the traversal stops where it does:

    cooldown remaining, resets, CDR and charges
    Deathmark state, Kingsbane state, Rupture state
    Envenom remains, buff stacks, Scent of Blood
    items and trinkets, external buffs, racials policy
    target time-to-die, fight remains
    spell target counts
    global Garrote selection

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
