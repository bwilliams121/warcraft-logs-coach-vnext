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
also carries a talent rank, a spell-target count and the `>?` operator (which
parses since M11-D3-C1; the other two still do not). It does not need to: an unsupported gate on a `call_action_list` already branches over
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

*Since M11-D3-B1* that last reading is corrected against the pinned source:
`select_target()` writes only the acting action's own `target` and resets it to
the player's target on every call (`action.cpp:2426-2459`), and `if=` is read
after it, on the chosen enemy (`action.cpp:2567-2629`). `src/simc/target-if.ts`
now owns `target_if`, read structurally as `AplAction.targetIf` (mode
FIRST/MIN/MAX and its expression), through ONE rule both selectors share:

- any mode, a PLAYER_SCOPED `if=` conjunct proven FALSE: eliminated. This
  needs nothing from the score: the line is not ready whether or not a target
  is chosen;
- MIN/MAX target identity may be ignored ONLY when target selection is
  guaranteed by a POSITIVELY PROVEN finite target score and the `if=` that
  follows is absent or target-independent (wholly PLAYER_SCOPED). The line is
  then evaluated as an ordinary line;
- everything else (FIRST — even with a finite score, since it still needs SOME
  enemy to score non-zero —, a target-dependent or unparseable `if=`, a score
  not proven finite, a malformed option): refused, as before.

The M11-D0 audit's statement that MIN/MAX "choose a target" is refined by the
pinned source: they choose one only for a finite score. With several
candidates, a score that is NaN on every ready candidate — or +inf for MIN,
-inf for MAX — selects none (`action.cpp:5353-5446`), and the pinned operators
can produce both (`%` is `std::divides`, `%%` is `std::fmod`). So
finiteness is PROVEN, never assumed: `scoreFinitenessOf` is a compositional
check over the supported expression AST (literals; comparisons, `&`, `|` and
`!`, which are C++ bools; `talent.*`, `buff.*.up` and `debuff.*.up`, which
are bools; `target.time_to_die`, a `timespan_t` read in seconds; `+ - *` only
within an overflow-safe bound), each rule cited against the pinned source.
Anything else — division and modulus, unsupported syntax, atoms without an
audited value domain, and EVERY spec-declared identifier — is
NOT_PROVEN_FINITE. Scope is not evidence of finiteness, and an atom's project
SHAPE is not a SimulationCraft value domain (`buff.*.react` is a truth node
here and a stack count there). A finite-domain contract for spec atoms would be
a later, per-spec responsibility.
A NON_GCD action selected through an ignorable `target_if` is never executed by
the first-GCD query (`TRANSITION_UNSUPPORTED`): which enemy it hit is unknown.
`call_action_list` ignores `target_if` entirely (`action.cpp:4672-4685`); only a
malformed one is refused there. On a run, a refused but well-formed `target_if`
with a readable `if=` is explored as an undecided gate whose stop stays at the
line (`UNSUPPORTED_ACTION_OPTION`), under D3-A's collapse rule.

*Since M11-D3-B2* the two retarget pseudo-actions have their own pinned
semantics (`src/simc/pseudo-actions.ts`, player.cpp:10820-10883), and they are
NOT one abstraction. `retarget_auto_attack` is ready only when an auto attack
is aimed elsewhere than the target it chose, and executing it moves only the
auto attacks; `retarget` has ordinary readiness, and executing it sets
`player->target` and re-aims every player and pet action. Both are zero-time,
zero-GCD, and the next selection follows at the same timestamp with no event
in between (event order is `(time, id)`, event_manager.cpp:114-178). For the
first GCD:

- `retarget_auto_attack` is SAFE TO IGNORE when its line carries only `if`,
  `target_if` and `line_cd` and the vocabulary declares no `prev.` atom — the
  only zero-time reader of what it changes. It is POSSIBLE at most in one scan,
  its world is dropped in the first-GCD query because it converges with the
  continuation, and it is never named as the earliest obstacle;
- `retarget` is TARGET IDENTITY REQUIRED: the one scan returns it honestly,
  and the first-GCD query refuses to execute it (`TRANSITION_UNSUPPORTED`),
  even when B1 proves its readiness target-independent. Readiness independence
  is not side-effect independence.

Neither the B1 NON_GCD guard nor any target_if rule was relaxed.

*Since M11-D3-C1* the parser reads SimulationCraft's extremum operators as an
explicit `EXTREMUM` node — and the direction is the reverse of the glyphs:
pinned, `<?` tokenizes as `TOK_MAX` and `>?` as `TOK_MIN`
(`expressions.cpp:132-147`), building `std::max` / `std::min`
(`212-226`, `413-416`). So `spell_targets>?3` caps a count at three. The
node keeps the written token; `extremumOf` (`ast.ts`) is the one place its
meaning is read. Precedence 5 (looser than `+ -`, tighter than comparison),
left-associative, both operands evaluated and read as magnitudes, so `.react`
stays a stack count there.

The evaluator claims only what holds in every world: exact results for exact
operands; member-wise over a finite set against an exact value; a dominating
set outright; a proven lower bound where only that follows (the value domain
has no upper bound, so a two-sided result keeps its lower side); and UNKNOWN
whenever an operand is unknown — no atom carries a domain contract, and pinned
`std::max` returns a NaN first operand. Scope is the join of the operands'
scopes (`collectAtoms` walks both). B1 finiteness proves an extremum only when
BOTH operands are proven, with bound max(|a|, |b|). No other operator, no unary
minus and no function was opened.

*Since M11-D3-C2* the nested scan EXECUTES `variable` lines
(`src/simc/variable-execution.ts`). Pinned: a ready variable line runs inline
and the scan continues (`player.cpp:14235-14241`); a FALSE `if=` skips it;
values live on the PLAYER and persist between scans until an iteration reset
(`player.cpp:6727-6728`). So a read before this scan's assignment sees an
earlier scan's value — history this project does not have — and reads UNKNOWN,
never 0 and never the line's `default=`.

- Modelled: `set` (default), `setif`, `reset` — the operations that do not
  read the stored value. Every other operation, `cycling_variable`, and a line
  with an option outside `name value op if default condition value_else`
  (`delay=`, `line_cd=`, …) makes the variable UNKNOWN. A malformed line taints
  every variable. None of these refuses the scan: an unknown value is not a
  malformed authority.
- `variable.<name>` parses as `VARIABLE_READ` — a MAGNITUDE, PLAYER_SCOPED
  (a stored value), NOT_PROVEN_FINITE — only for a name neither a built-in nor
  the spec vocabulary claimed. ONE VALUE PER NAME, LATER WRITE WINS: every
  executed assignment writes the variable, whatever reads it. A read takes
  (1) this scan's assignment, else (2) the initial value a specialization
  bound for a `variable.<name>` it declared, else (3) UNKNOWN. A declaration
  is a way of reading and seeding the variable, never a write suppression.
  Truth-shaped reads (the built-in `variable.single_target`, a spec's BOOLEAN
  `variable.<name>`) take an assignment that decides the truth and otherwise
  stay an enumerated boolean, as an unbound one always has; in a magnitude
  position the built-in is the generic number read. Assassination's
  `single_target` (written UNKNOWN: `spell_targets` does not parse) and
  Retribution's `ds_castable` (written from the same value expression, under
  the same bindings, its resolver evaluates) read exactly as before.
  Retribution's `pre_es_wake` is the one spec-SEEDED variable: its only
  write is `precombat[7] op=reset,default=0`, which is not executed, so
  the resolver supplies that KNOWN 0 as the initial value — and an in-combat
  write, were the APL to gain one, would win. There is NO immutable
  variable: built-in syntax is a read representation, not frozen state.
- State: one immutable map per walk. A certain call's assignments carry to
  the caller; an undecided call's caller reads the JOIN of both worlds; an
  undecided run's FALSE world continues with the pre-child state. An undecided
  `if=` joins the assigned value with the value before it (scan, else
  initial, else UNKNOWN). A name assigned in only one joined world is joined
  with what the other world reads for it — its initial value, else UNKNOWN —
  never dropped back to the initial value alone. Joins keep only what holds
  in both (exact, one-of, a common lower bound, else UNKNOWN). Nothing crosses
  a first-GCD rescan: every scan starts from the unknown incoming value, so
  the spec's state key stays the whole cross-scan state.
- Not executed: the single-list walker (`list-selection.ts`) and the
  precombat list; their variables read UNKNOWN.

*Since M11-D3-C3* the nested scan reads `line_cd=` as READINESS
(`src/simc/line-cooldown.ts`). Pinned: every APL LINE is its own `action_t`
with a private `cooldown_t("line_cd")` (player.cpp:4213-4243, action.cpp:502),
so two lines with one token keep independent timers. A foreground line's
timer starts at SELECTION (player.cpp:7390), an off-GCD one after `execute()`
(action.cpp:85), a variable's or a call's NEVER (both are handled inside
`select_action`). It is ready again when `now - start >= duration` — at the
boundary it is ready — with no haste, no queue window and no tolerance
(cooldown.cpp:422-511). It is reset to ready at every pull, and precombat
starts nothing. `line_cd=0` is no restriction.

- Readiness is a fact the caller derived beforehand
  (`NestedSelectionInput.lineCooldownFor`), from a `LineSelectionHistory`
  of LINE SELECTIONS — the timer's start event — never of casts as such: per
  line, ATTRIBUTED and AMBIGUOUS selections as bounds (`selectedAtMostMs`,
  and `selectedAtLeastMs` or `null`), the known pull, and a
  `selectionCoverage` that is `SELECTION_COVERAGE_PROVEN` over an interval
  or `NOT_PROVEN` (recording, separately, any cast-retrieval coverage). The
  default with no history is UNKNOWN. The spell's own cooldown is never a
  substitute.
- THE EVIDENCE BOUNDARY (corrected in review). A successful cast bounds its
  selection from ABOVE only — the selection precedes it by any queue delay or
  cast — and a selection may be dropped and cast nothing while still
  restarting the timer. So complete cast retrieval is not selection coverage,
  and a cast is no lower bound. `lineSelectionHistoryFromObservedCasts`
  records each attributed cast as `{ selectedAtLeastMs: null,
  selectedAtMostMs: cast }` and its coverage as `NOT_PROVEN`: ordinary cast
  history proves neither READY nor NOT_READY.
- Attribution (approved): an observed cast of token X is evidence about line L
  only when L is the SOLE in-combat player-action entry that can produce X.
  Every other cast of X is AMBIGUOUS for each entry that could have produced
  it, and never proof of a specific line's selection.
- NOT_READY: an attributed selection with `selectedAtLeastMs` >= pull,
  `selectedAtMostMs` < D, and `selectedAtLeastMs` > D - duration; later
  selections, seen or not, only extend it. READY: `SELECTION_COVERAGE_PROVEN`
  over [max(pull, D - duration), D) and no attributed or ambiguous selection
  that may lie in (D - duration, D) at or after the pull. Otherwise UNKNOWN.
  A NOT_READY line is skipped before its `if=`
  (`LINE_COOLDOWN_NOT_READY_CONTINUE`); an UNKNOWN one may fire at most.
- The decision's own prefix: `firstGcdSelectionAcrossRescans` adds each fired
  line with a positive `line_cd` to a branch-local
  `linesStartedThisDecision`, part of the world's key and passed to every
  rescan; a line in it is NOT_READY there (ready = D + duration > D). This
  is the one selection whose instant is known exactly — the analyzer made it,
  in its own modelled world — and it is branch state, never history.
- Variables: `line_cd` is pinned to change nothing; the line executes as if it
  were absent. Retarget pseudo-actions keep their M11-D3-B2 semantics:
  `retarget_auto_attack`'s timer is never read, `retarget` never becomes a
  transition. Still refused, unchanged: `line_cd` on a call or run line, on
  any line the single-list walker reads, and a malformed value anywhere.

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

- `INTERNAL_ONLY_SPEC_IDS` was EMPTY from M10-D to M11-A3, held Retribution
  Paladin from M11-A4, was empty again from M11-A5, held Blood Death Knight
  from M11-B2, was empty again from M11-B12, and holds Brewmaster Monk since
  M11-C2. The internal-only partition, `requirePublicSpecId`,
  `InternalSpecExposureError` and the registry's exposure rules are the
  on-ramp every specialization since Protection has used, and the set's
  current membership is pinned explicitly rather than left to look accidental.
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
(`tests/contracts/m11-promotion-evidence-gate.test.ts`, reader
`tests/support/corpus/promotion-evidence.ts`). Since M11-C4h it is two
global gates, applied to every specialization alike:

- **Observation.** At least one qualifying real `MATCH`, and qualifying
  real resolved decisions (`MATCH` or `REJECTED`) over at least two
  distinct supported observed action tokens, each identified by the observed
  cast's ability id (the criterion does not read authority-entry identities).
  A qualifying real assertion is a
  `DECISION_COVERAGE` assertion whose whole referenced evidence set is
  `SANITIZED_CAPTURE` in either committed root (a `SYNTHETIC` or
  `DERIVED_FROM_CAPTURE` artifact anywhere disqualifies it as observation),
  whose actor the committed fight-context master data proves to be that
  specialization — through the identity table for a PUBLIC spec, against the
  module's own WCL strings for an INTERNAL_ONLY one — and which its root's
  committed report records as PASSED.
- **Discrimination.** At least one qualifying real `REJECTED`, or at least
  one qualifying negative control. A control is a `DERIVED_FROM_CAPTURE`
  part declaring a `SINGLE_CAST_ABILITY_SUBSTITUTION`: its payload is its
  `SANITIZED_CAPTURE` parent's with exactly one cast's `abilityGameID`
  changed, a diff the loader re-derives from both committed payloads
  (`CONTROL_SUBSTITUTION_*`). The gate accepts it only as a `REJECTED`
  about the substituted cast, only when a qualifying real `MATCH` exists at
  the same decision over the same bundle with the parent in place (the
  verdict flips when only the action changes), and only when the same case
  pins `<layer>.OBSERVED_TOKEN_APPLICABILITY` with every entry naming the
  substituted token `APPLICABLE` under the proven build, so the rejection
  rests on real state and never on the action being background. A control is
  never observation evidence and never observed play.

Failing either gate fails CI for a PUBLIC spec and is reported for an
INTERNAL_ONLY one. The split exists because the single M11-A2 rule ("one
qualifying `MATCH` or `REJECTED`"), with a spec-specific "real `MATCH`
and real `REJECTED`" added for Retribution and Blood only, conflated honest
handling of real play with the ability to disagree on real state, and made
the second depend on whether the sampled players erred. Acquiring more
subjects until a `REJECTED` appears is outcome shopping and is not a route
through the gate. At M11-C4h Protection passes discrimination by its one
control (Avenger's Shield → Divine Toll at 2,074,381; it has no qualifying
real `REJECTED`); Assassination, Retribution and Blood by real
`REJECTED`s, and the stricter Retribution and Blood real-`REJECTED` pins
remain. Brewmaster passes observation over two neutral subjects; it was
blocked on discrimination until M11-C4i (its only positive usability proof was
the observed cast, so no `REJECTED` was reachable, and the M11-C4g
substitution census found no control). Since M11-C4i it passes discrimination
by two real `REJECTED`s, one per independent subject (below); passing both
gates was necessary for promotion, not promotion, and M11-C4j promoted it
separately (below), after which the same gates count it in PUBLIC mode.
Production carries no case id,
artifact id, layer, readiness, gate or control vocabulary;
`m10d-no-corpus-window-in-production` pins that.

### M11-C4i — shared positive usability, strict range, the Purifying Brew closure

A shared positive-usability derivation (`src/findings/usability/`) and a
Brewmaster-owned use of it. The shared layer is FACTS ONLY; the
specialization decides which tokens it applies to and what corroborates them.

- **Completeness contract.** `concludePositiveUsability` takes a TOTAL
  record over eight dimensions (build applicability, `ready()` override,
  cooldown/charge, resource affordability, GCD, range/target, movement/cast,
  action-specific) and returns `PROVEN_USABLE` only when every one is
  `PROVEN` or `NOT_APPLICABLE`; a missing or extra dimension throws. No
  dimension may be inferred from another — a cooldown proof alone never
  yields usability.
- **Cooldown upper bound.** Proven ready only when the last relevant cast
  (the ability and its category siblings) lies at least the pinned upper
  bound (max of base, charge, category and internal cooldowns) plus the
  250 ms tolerance earlier, with COMPLETE cast coverage between; or, with no
  relevant cast since fight start proven, when the fight has run that long
  (a pre-pull use is otherwise possible). Any selected lengthening or
  charge-removing modifier, or a non-reset mutation, refuses the bound. No
  charge simulation: a charged ability is proven only at ≥1 charge by the
  same bound on its charge cooldown.
- **Affordability.** The decision cast's exact PRE_COST amount
  (`src/findings/resources/exact-pre-cost.ts`, moved verbatim from the
  Assassination evaluator), the observed wire cost equal to its pinned base
  cost (unit corroboration), and a pinned proof that the candidate's cost
  cannot exceed its base (SimC's cost formula checked mechanically, and a
  cost census with no increasing effect). Anything short of that is
  `UNKNOWN`, never "not affordable".
- **Range, STRICT.** Only by same-target corroboration: the decision cast
  must be an enemy-unit-targeted spell whose event names the target, the
  candidate must target the same way, and its pinned range interval must
  contain the observed one. An untargeted candidate or corroborator proves
  nothing. No simulated-dummy assumption.

Observed and simulated-prefix proofs keep precedence: the observed cast,
then a simulated execution or shared cooldown in the prefix, then negative
cooldown proofs, and only last the positive conclusion.

Brewmaster wires it for Keg Smash, Blackout Kick, Breath of Fire and Invoke
Niuzao (datasets `SIMC_DBC_MONK_BREWMASTER_USABILITY_AUTHORITY` and a Keg
Smash cooldown record), reopens the M11-C3b Purifying Brew refusal for the
deterministic part only (its shared internal cooldown; Empty Barrel is
FORGOTTEN, never bound up — the 20% proc is never asserted), and reads
Empty the Cellar's readiness aura under its corroborated wire id 1262768.
Breath of Fire is untargeted in the pinned data, so it never becomes
`PROVEN_USABLE` and never corroborates range. Measured: subject 1's full
fight 109 MATCH / 10 REJECTED / 70 UNKNOWN; subject 2's fixed window 47 /
1 / 91; no earlier MATCH flips. The two independent `REJECTED`s are the
Tiger Palm at 2,424,688 (gtKb f22 a4) against Keg Smash and the Tiger Palm
at 2,573,516 (rXAf f13 a11) against Blackout Kick.

### M11-C4j — Brewmaster Monk becomes publicly supported

The five-site move, two promotion-layer guards (owner decisions, the M11-B12
T2 / T3 precedents), one declaration correction, and nothing else. No gameplay
rule, binding, authority reading or verdict changed: subject 1's full fight is
still 109 MATCH / 10 REJECTED / 70 UNKNOWN and subject 2's 165 s window 47 /
1 / 91, decision for decision, now also through REST, MCP and raid night.

- **The five sites, in one reviewed edit.** `src/findings/spec-id.ts` (the
  partition — `monk/brewmaster` moves to `PUBLIC_SPEC_IDS`; the internal-only
  set is empty again and its machinery stays dormant), the public contract's
  own `specId` enum (the additive-widening precedent; no other public value
  moved), `src/services/spec-identity.ts` (`Monk`/`Brewmaster`, matched
  exactly: no other Monk specialization resolves), the `satisfies
  PublicSpecId` on `spec.ts`, and the registration's `exposure`.
- **The validated-profile gate** (`supported-profile.ts`). Both real subjects
  are Shado-Pan; the Master of Harmony list is dispatched by the engine but no
  verdict on it has ever been measured. A resolved Master of Harmony build is
  `AUTHORITY_NOT_AVAILABLE`; an unresolved or contradictory tree
  `PROFILE_NOT_RESOLVED`; both before any decision is read, from the
  three-way talent resolution only.
- **The version-keyed Energy read.** C4i's Keg Smash affordability resolved
  the Energy wire type by scanning the contract table unkeyed; it now goes
  through `resourceWireTypeFor` with the capture's own
  `gameVersion`/`logVersion`, and an uncovered version leaves only the
  RESOURCE_AFFORDABILITY dimension `UNKNOWN` (`RESOURCE_WIRE_VERSION_NOT_COVERED`).
- **The declaration correction.** C4i read Energy without declaring it, so
  the derived ingestion requirement asked for no resources — harmless while
  INTERNAL_ONLY (every committed capture carries resources), a silent
  under-fetch for a public request that would have turned the 2,424,688
  REJECTED into UNKNOWN. The offensive capability now declares ENERGY and the
  RESOURCES category; the requirement is `includeResources: true`.

**Beta limits, published in the limits prose.** The slice is not exhaustive.
These stay `UNKNOWN`, never inferred: what Black Ox Brew changes (no reviewed
transition — the largest single UNKNOWN cause on both subjects), Empty the
Cellar's buff on subject 2 (its window holds no 1262768 transition), Keg Smash
charges and its hasted recharge (only the ≥1-charge upper bound), Energy
between observations, and every alternative whose positive usability is not
proven in all eight dimensions (Breath of Fire never is: it is untargeted).

**Proven.** `m11c4j-brewmaster-supported-profile` (the four hero-tree
answers; both subjects Shado-Pan from their own trait entries; a relabelled
parser version failing only affordability, so the 2,424,688 REJECTED becomes
UNKNOWN and nothing else moves); `m11c4j-brewmaster-public-projection`
(schema v1, the enum widened by one id, every committed input projected with
the C4i totals and REJECTED times, decision-for-decision equivalence, no
internal field or vocabulary, service/internal equality);
`m11c4j-brewmaster-public-transports` (REST 200 for both subjects with their
real REJECTEDs, MCP `structuredContent` and text equal to the REST body,
repeat determinism, Arms and the other Monk specializations still
SPEC_NOT_SUPPORTED, bearer behaviour unchanged, the derived description naming
the Shado-Pan validation and the retained UNKNOWN areas);
`m11c4j-mixed-raid-night` (Brewmaster alone and among real gtKb fight-22
neighbours — Blood, Retribution, Assassination truthfully
PROFILE_NOT_RESOLVED, Arms and Mistweaver SPEC_NOT_SUPPORTED — one discovery,
one ingestion, each analyzer once, the cell identical alone, in company and on
a second run); the promotion evidence gate counting Brewmaster in PUBLIC mode
with the same seven qualifying assertions and two real REJECTEDs; the
re-pinned partition, registry, capability, identity, contract, service,
inventory, registration-list, module-conformance, authority-ownership,
second-registration and tools-list suites; and the corpus (the
APPLICATION_SERVICE case re-pinned, a new PUBLIC_CONTRACT parity case).

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
| undecided | fail closed; neither world is explored (since M11-D3-A both are, and only a result every world agrees on replaces the gate — see below) | blocker `UNDECIDED_RUN_GATE` |
| unreadable | the existing parser refusal | blocker `UNSUPPORTED_AUTHORITY_EXPRESSION` |
| carries an unsupported option (`target_if=` on Arms' execute dispatch) | refused before the gate is read (since M11-D3-B1 a sole `target_if` is read through `target-if.ts` first — see the M5-D1 section) | blocker `UNSUPPORTED_ACTION_OPTION` |

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
deferral is measurable.

*Since M11-D3-A* the worlds are explored: TRUE scans the child (whose
selection, or NOTHING, is this selection's), FALSE continues the parent, and
the child's candidates join as possible ones. Exploration may CONVERGE the
gate — one definite entry, one token, or nothing in every world — and never
MOVES the stop. When the worlds disagree, or either is unresolved, the scan
reports exactly the stop and trace above: `UNDECIDED_RUN_GATE` at the gate
(`UNDECIDED_CALL_GATE_OVER_RUN` one level up), classified by the gate's own
predicate. An obstacle met only inside the speculative TRUE child is never the
stop; a gate PROVEN TRUE makes its child real, and then the child's obstacle
is. The explored worlds ride on `OneForegroundScanResult.explored` as
internal evidence, which the first-GCD query may still converge across
rescans. `nested-selection.ts` `Collapse` is the mechanism. The active-stack cycle guard applies to run edges
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

### M11-B2 — Blood Death Knight INTERNAL_ONLY measurement slice

The cohort's representative specialization, onboarded exactly as the
Paladin specializations were and for one purpose: to run the B1 dispatch
semantics over a REAL hero-tree-gated `run_action_list` authority on real
evidence and record where the shared machinery stops, and on which atom.
Nothing was widened to force a resolved decision, and none resolved. The
numbers below are the deliverable.

**The onboarding (2026-09-18, uncommitted at the time of writing).**
`deathknight/blood` joined `SpecId` and `INTERNAL_ONLY_SPEC_IDS`; the
`BLOOD_DEATH_KNIGHT_REGISTRATION` row (`src/specs/deathknight/blood/`,
`defineSpecModule`, exposure `INTERNAL_ONLY`, roster specID 250, TANK)
joined the production catalog as its fourth row and its first INTERNAL_ONLY
member since M11-A5. The five public sites are untouched: the public
partition, the public contract's `specId` enum, the identity table
(`DeathKnight/Blood` resolves to no `SpecId`), the `satisfies
InternalOnlySpecId` on `spec.ts`, and the exposure. The application service
answers `SPEC_NOT_SUPPORTED` for the real subject with zero analyzer calls
and zero ingestion; the supported-specializations sentence, both MCP tool
descriptions, `ENABLED_ANALYZERS` and the derived ingestion requirements did
not move; the invariance harness's 33 non-timing captures are byte-identical
between HEAD (2b6d77f) and the B2 tree.

**The pinned authority and its guards.** `SIMC_APL_DEATHKNIGHT_BLOOD` is the
`//blood_apl_start .. //blood_apl_end` region of
`engine/class_modules/apl/apl_death_knight.cpp` at the shared pin 33622e9d
— six lists, 56 actions, four dispatch entries (`default[13]` calls
`high_prio_actions`; `default[14..16]` run `deathbringer`, `san_gift`,
`sanlayn` under `hero_tree.*` and `buff.gift_of_the_sanlayn.up` gates). The
region carries twelve `p->sim->dbc->wowv()` client-version guards; the APL
extractor grew a generic guard evaluator (`--target deathknight-blood`
declares `clientVersion: [12, 1, 0]`), dropped the nine pre-12.1 statements
behind the five `< 12.1.0` branches, kept the eight behind the seven `>=`
branches, and recorded every guard under
`provenance.conditionalCompilation`, which `authority-artifact.ts` now
validates (a malformed record is a failed load). The live 12.1 list has NO
Coagulopathy Death Strike line: the inventory question that named it is
superseded by the pinned list itself. The extractor also grew a generic
`DISPATCH_GRAPH` required-facts verifier (list sizes, exact CALL/RUN edge
list, forbidden tokens, no targeting options); the Blood graph is
target-specific data consumed by that checker, and no blanket
`ALLOW_RUN_ACTION_LIST` exists. The three existing APL artifacts regenerate
byte-identically.

**The datasets, all at the same pin.** GCD semantics (24 DBC `_gcd`
records: Dancing Rune Weapon is `_gcd` 1500 — an answer, never a step;
Raise Dead and Vampiric Blood are `_gcd` 0; `heart_strike` binds to BOTH
206930 and its Vampiric Strike execution 433895; `any_dnd` is a pinned
alias of `death_and_decay`, sc_death_knight.cpp:14424-14427), talents (13
identities and the two hero sub-trees, San'layn 31 and Deathbringer 33),
spender costs (Death Strike 450 tenths of Runic Power; the Rune spenders 1
or 2 runes; Death's Caress on a 6 s cooldown), and ONE ability cooldown —
Dancing Rune Weapon, 120,000 ms less Insatiable Blade's 30,000 ms; Vampiric
Blood is deliberately unpinned because Red Thirst shortens it dynamically
(sc_death_knight.cpp:13143-13147; the subject's two casts are 62 s apart
against a 90 s base). The Rune (type 5) and Runic Power (type 6) wire
contracts are corroborated by the committed 45 s slice. Two wire facts
recorded there so no one rediscovers them: the attached Runic Power amount
is PRE_COST (every Death Strike is followed by a snapshot exactly 350
lower), and the `cost` field is the DBC BASE cost, not the amount paid (450
reported, 350 paid; the gtKb subject cast Death Strike with 440 and 390
attached against a reported 450). No affordability or
`INSUFFICIENT_RESOURCE` proof exists for any Blood entry, and that is why.

**What the Blood module binds, and how (all Blood-owned).** Hero-tree atoms
from the resolved sub-tree; `runic_power.deficit` in points from a Death
Strike's own PRE_COST entry (the wire's tenths converted once); `rune` from
a Rune-costed cast's own entry; `time` from the decision's fight time.
Presence for eight buff atoms through M4 `presenceAt`, with two build
proofs the shared evaluator had no need of before: an aura whose every
producer is a hero talent of the OTHER resolved sub-tree is bound DOWN
(`HERO_TREE_EXCLUDED` — `buff.exterminate.up` for a San'layn build), and a
producing talent disproved at its choice node binds DOWN
(`TALENT_NOT_SELECTED`). The EXACT Bone Shield count through the existing
`knownBuffStacks` seam under a Blood-owned rule: the last stack-bearing
transition's absolute number, carried across nothing but same-millisecond
`refreshbuff` companions under an EXACT ACTIVE presence — a lone refresh, an
initial application, or any transition at the decision's own millisecond
refuses (`COUNT_AMBIGUOUS_SINCE_OBSERVATION`, `NO_STACK_OBSERVATION`,
`SAME_MILLISECOND_TRANSITION`). Bound at 114 of 123 bundle decisions and 20
of 21 opener decisions. Three reviewed NON_GCD transition contracts
(`auto_attack`, `vampiric_blood`, `raise_dead`), each writing nothing a
later entry reads. The class/spec domain boundary is the M11-A4 policy
restated in Blood's words over the token tables promoted to
`src/simc/non-domain-tokens.ts`; the M11-A4 token-cooldown derivation was
promoted verbatim to `src/findings/cooldowns/token-cooldown-derivation.ts`
(it composes engine cooldown primitives with `NumericBinding`, so it lives
in the M5 layer and not under `src/engine`), and both Paladin and Blood
wrappers are thin over it. Death Strike's dual role is stated through the
existing domain architecture: all six domains are DECLARED for a tank, five
bound to nothing (`NO_PINNED_AUTHORITY_FOR_DOMAIN`, never
`DOMAIN_NOT_DECLARED`), the offensive result carries
`deathStrikeDualRole: true`, and ACTIVE_MITIGATION / SELF_HEALING carry
`sharesActionWithOffensive: "death_strike"`.

**A measured Warcraft Logs ordering hazard.** In these captures a cast's OWN
aura effects are written BEFORE the cast at the same millisecond (a
Marrowrend at 2,015,770 is preceded in the array by the three Bone Shield
stack gains it caused; 28 of the 48 first-slice decisions have a same-ms
self-aura transition ahead of them). `BEFORE_EVENT` at the cast position
therefore includes them and would read the POST-cast state. The M11-A4
slice recorded the opposite order for a Divine Storm consuming Divine
Arbiter; the ordering is not a contract, and the Blood aura bindings refuse
any identity with a transition at the decision's own millisecond ahead of
it. The Paladin bindings do not yet make that refusal; it is a follow-up,
not a B2 change.

**The measurement (corpus cases, `SPEC_BLOOD_DEATH_KNIGHT.*`).** Over the
composed 165 s A7R6 bundle (actor 14, San'layn): 123 eligible decisions
(Death Strike, Heart Strike including its Vampiric Strike execution, Blood
Boil, Marrowrend, Death's Caress), 148 excluded by name, 0 MATCH, 0
REJECTED, 123 UNKNOWN. Root-scan stopping entries: `sanlayn[0]
deaths_caress` 98, `san_gift[0] heart_strike` 24, `default[15]
run_action_list` 1 — the first two on the DECIMAL LITERAL `1.5` the frozen
parser refuses (`UNSUPPORTED_NUMERIC_LITERAL`), the last on an unobserved
Gift at the pull. The B1 dispatch semantics held on every scan: `default[14]
run deathbringer` `RUN_GATE_FALSE_SKIPPED` ×123 (hero tree bound FALSE),
`default[15] run san_gift` entered-and-blocked ×24 inside the Gift window,
skipped ×98 outside it, blocked-undecided ×1, `default[16] run sanlayn`
entered-and-blocked in exactly those 98. Dancing Rune Weapon was a competing
undecided GCD candidate at 3 decisions (cooldown not proven; gate on
`debuff.reapers_mark_debuff.up`, unbindable, and `fight_remains`,
PREDICTIVE). The gtKb opener (21 decisions) reproduces the same shape. The
nested unselectability proof never holds — every supported token has an
unconditional entry — and additionally refuses on `precombat[1]` (an
unreachable list) and on `deathbringer[*]` entries (a list the resolved
hero tree can never enter): two measured limits of the cross-list proof,
recorded rather than repaired.

**What lies behind the literal (a reverted experiment, not a change).**
With decimal literals temporarily admitted, still 0 resolved: 43 decisions
block at `sanlayn[10] consumption` (Consumption's NORMAL node is absent, so
applicability is UNKNOWN by the three-way rule, and the entry also carries
the unrecognised `empower_to=` option), and the rest end with competing
undecided candidates on `buff.bone_shield.remains` (98), `buff.essence_of_
the_blood_queen.remains` (122), `buff.vampiric_strike.remains` (98),
`buff.crimson_scourge.remains` (101), `buff.visceral_strength.remains` (18),
`buff.blood_debt.stack` (73), `runic_power.deficit` on non-Death-Strike
casts (118), `fight_remains` (141), `buff.boiling_point.up` before its first
transition (11). No single non-boundary capability resolves a decision on
this list; the smallest next step and the ranking are in the M11-B2 report.

**Proven.** `tests/unit/m11b2-blood-authority-data.test.ts`,
`tests/unit/m11b2-blood-bindings.test.ts`,
`tests/contracts/m11b2-blood-registration.test.ts`,
`tests/contracts/m11b2-blood-evaluator.test.ts`, sixteen corpus cases over
four SANITIZED_CAPTURE slices cut from the three existing captures (no WCL
request), and the reviewed count updates in the catalog-shape tests. The
corpus is 43 artifacts / 154 cases / 511 assertions, crossing the 4 MiB
notice line deliberately (4,792,400 bytes; the line moves to 5 MiB, the
6 MiB ceiling unchanged). Blood stays INTERNAL_ONLY; the promotion evidence
gate reports it and would refuse it.

### M11-B3 — decimal numeric literals (shared parser, syntax only)

The one syntax limitation M11-B2 measured as unjustified, removed and
nothing more. The parser's literal grammar was non-negative integers;
M11-B2 showed 122 of 123 bundle decisions and 21 of 21 opener decisions
stopping at the first entry of a San'layn list on `UNSUPPORTED_NUMERIC_LITERAL`
(`1.5`).

**The pinned grammar.** The pinned SimulationCraft lexer
(`engine/sim/expressions.cpp` `next()` at 33622e9d) reads a number as
digit+ then, on `.`, digit*, and the parser makes it a `const_expr_t`
through `std::stod` — the same kind of constant an integer is, at its exact
double value. Unary minus is folded into a number token only as a later
token-level optimisation, and exponents are not lexed as numbers at all.
The pinned lists write exactly `1.5` and `0.5`.

**The change (`src/simc/expression/parse.ts`, `parseNumber`).** The literal
grammar is now digits `'.'` digits, parsed with `Number.parseFloat` into the
SAME `NUMBER` node an integer produces; the evaluator's `number`
representation and comparison rule are untouched, so `1.5` is exactly 1.5
and `x<1.5` decides by the ordinary `compareWithBounds`. Every other decimal
shape fails closed under the parser's EXISTING reasons: an empty fraction
`1.` and a second point `1.5.5` are `UNSUPPORTED_NUMERIC_LITERAL` (the pinned
lexer would accept `1.`; no pinned list writes it, and a trailing point is a
typo far more often than a threshold), a leading point `.5` is
`UNEXPECTED_CHARACTER`, an exponent `1e3` is `TRAILING_INPUT`, and `-1.5`
is still `UNSUPPORTED_OPERATOR` because unary minus is not part of this
grammar. No built-in identifier, node kind, operator, state binding or
vocabulary door moved; the parser-freeze contract
(`tests/contracts/m11a-parser-builtins-frozen.test.ts`) is unchanged in what
it pins and gained a literal-grammar pin so any later widening is a visible
change reviewed like a built-in addition.

**The remeasurement (Blood unchanged).** Bundle 123 eligible → still
0 MATCH / 0 REJECTED / 123 UNKNOWN; opener 21 → 21 UNKNOWN. The root scan
now walks the San'layn lists: it RESOLVES with every reached candidate
undecided at 79 (the engine's branch worlds diverge —
`DIVERGENT_GCD_OUTCOMES`), BLOCKS at `sanlayn[10] consumption` at 43
(Consumption's NORMAL node is absent, so its applicability is UNKNOWN and
the entry cannot be stepped past; it also carries the unrecognised
`empower_to=` option), and blocks at the `default[15]` run gate at 1. The
first undecided GCD candidate in priority order — the next truthful blocker —
is `sanlayn[0] deaths_caress` on `buff.bone_shield.remains` at 96 of 123
(78%), `san_gift[0] heart_strike` on `buff.essence_of_the_blood_queen.remains`
at 24 (20%), and the Dancing Rune Weapon gate at 3 (2%); the opener splits
6 / 15 / 0. The B1 dispatch outcomes moved from BLOCKED to
`RUN_ENTERED_SCAN_ENDS` where the child now offers candidates (24 san_gift,
55 sanlayn) and stayed `RUN_GATE_FALSE_SKIPPED` ×123 for the Deathbringer
list. One diagnostic label was sharpened in the Blood adapter
(`APPLICABILITY:<token>` for an entry whose applicability is UNKNOWN,
whatever the scan's own blocker); no Blood state binding changed.

**Next capability (recommendation, not implemented).** `buff.<x>.remains`
for fixed-duration self-auras is the first obstacle at 120 of 123 decisions
(Bone Shield 96, Essence of the Blood Queen 24); it is a state capability
(the M11-B2 hard boundary), not syntax, and would need the
same-millisecond ordering hazard resolved for the aura it reads.

**Proven.** `tests/unit/m11b3-decimal-literals.test.ts` (parsing, exact
evaluation, every refused shape, the Blood authority parsing whole), the
literal-grammar pin in the parser-freeze contract, the re-pinned
`m11b2-blood-evaluator` distribution, and the corpus: the Blood measurement
cases were re-pinned to the new distribution (one dispatch assertion added,
511 → 512), and every Assassination / Protection / Retribution artifact and
the invariance harness's 33 non-timing captures are byte-identical against
HEAD (565fe9a). Blood stays INTERNAL_ONLY; M11-B is not complete.

### M11-B4 — `buff.<name>.remains` (generic seam, Blood-owned temporal derivation)

The state capability M11-B3 measured as the first obstacle at 120 of 123
bundle decisions and 21 of 21 opener decisions, built as the architecture
prescribes: one aura-agnostic binding seam in the shared evaluator, two
aura-agnostic history primitives in the engine, and every duration, refresh
rule, ordering policy and tolerance in the Blood tree.

**The question.** What can be proved about an aura's remaining duration at
the instant immediately before an observed decision, from pinned mechanics
and causally prior evidence only? Warcraft Logs never reports a remainder;
it reports that an aura was applied, gained a stack, was refreshed, lost a
stack or was removed, at a time.

**The pinned semantics (33622e9d).** `buff_t::remains()` (buff.cpp:2018-
2029) is 0 when inactive, the expiry minus now when an expiration event
exists, and `timespan_t::min()` — a huge negative number, nonzero, so TRUE
as a bare truth — when the aura is active with no expiration. The
constructor resolves the duration through `get_passive_value( data(),
"duration" )` (buff.cpp:852-880): the DBC `_duration` AS MODIFIED by parsed
passives, and the Death Knight module parses all class and specialization
passives (sc_death_knight.cpp:15162). Every `trigger` on an active buff of
the default refresh behaviour reschedules the expiry to the FULL duration
(buff.cpp:1900-1906, 2532-2578); `decrement` — a stack loss — never touches
it (buff.cpp:2246-2290); a buff with a non-positive `_duration` schedules
no expiry at all (buff.cpp:876-879, 2456-2458).

**The generic seam (`src/simc/expression/evaluate.ts`).**
`knownBuffRemainsSeconds?: { name; remainsSeconds: NumericBinding }[]`, the
same shape and rule as `knownCooldownRemainsSeconds`. `BUFF_REMAINS` reads
it; an absent name is `UNKNOWN_NUMBER` / `STATE_NOT_MODELLED` with a trace
byte-identical to the one it produced before the field existed; an explicit
`UNKNOWN_NUMBER` entry carries the spec's own reason; a bound flows through
`compareWithBounds` unchanged; a bounded bare truth stays UNKNOWN; no bound
rule, no arithmetic rule and no parser change was made. One shared constant,
`SIMC_PERMANENT_BUFF_REMAINS_SECONDS = -9223372036854775808 / 1000`, is
SimulationCraft's representation of a permanent active aura; the evaluator
has no special case for it.

**The engine primitives (`src/engine/auras/aura-state.ts`).**
`gainHistoryAt` — the last APPLIED or REFRESHED transition of one identity
before a position, every transition of that identity since, and a
continuity claim FROM THE GAIN (COMPLETE coverage, no unidentified
observation, no transition of uncertain ownership); a `presenceAt` that
carries a later stack loss forward proves nothing about the gap between
the gain and that loss, and this does. `transitionsWithinBefore` — the
transitions of an identity ahead of a position within a CALLER-supplied
window, inclusive at both edges, each with its lead. Neither knows a
duration, a refresh rule or a policy.

**The Blood duration authority.** `scripts/authority/extract-simc-blood-
aura-durations.mjs` reads the pinned `sc_spell_data.inc` (the same bytes as
the Rogue DoT artifact), `spell_data.hpp`, `data_enums.hh`,
`specialization_spells.inc` and `client_data_version.inc`, hashes
`sc_death_knight.cpp` and `buff.cpp`, and writes
`src/data/game/deathknight-blood-aura-durations.json`: per atom the base
`_duration`, every duration modifier matched the way `parse_passive_effects`
matches (class-flag overlap within the family, or label), each modifier's
applicability, the final Blood duration, `_max_stack`, `_internal_cooldown`,
the refresh attributes and a remains model. Only `FIXED_DURATION_RESET_ON_
GAIN` (no `SX_REFRESH_EXTENDS_DURATION`, no `SX_AURA_DOES_NOT_REFRESH`, no
periodic effect) and `PERMANENT` (`_duration <= 0`) are emitted; an aura
that would need PANDEMIC / EXTEND / TICK, or that carries a BUILD-DEPENDENT
modifier (a talent's), fails extraction rather than being approximated.
Essence of the Blood Queen is the case that justifies the pipeline: DBC
20,000 ms + 5,000 ms from the Blood specialization aura 137008 (effect
1187090, label 3134, an SX_PASSIVE entry of `specialization_spells.inc`
for spec 250) = 25,000 ms, corroborated by the corpus (natural expiry
25,006 ms after the last refresh). Bone Shield 30,000 (no modifier, stack-
loss ICD 2,500), Crimson Scourge 15,000, Visceral Strength 12,000 (six
natural expiries within −7..+12 ms), Vampiric Strike PERMANENT.

**The Blood derivation (`src/specs/deathknight/blood/aura-remains.ts`).**
In the fixed conservative order: identity pinned; duration modelled; build
impossibility → exact 0; pre-decision window → refused; M4 presence EXACT;
INACTIVE → exact 0; PERMANENT and ACTIVE → the sentinel; gain history under
continuity from the gain; intervening transitions classified (a stack loss
is walked through, anything else refuses); `remainsMs = gain + duration −
decision`, converted to seconds once; a non-positive remainder while ACTIVE
is `DURATION_MODEL_CONTRADICTS_EVIDENCE`, never clamped; then the threshold
tolerance. THE ONE AMBIGUOUS SHAPE: the corpus shows a `refreshbuff` beside
a Bone Shield `removebuffstack` at 7 of 25 charge consumptions (each at a
melee hit, beside a Coagulating Blood dose) — a refresh the pinned decrement
does not produce. Neither reading is chosen: both agree the expiry is at
least the earlier unambiguous gain plus the duration (a DURATION refresh
only moves an expiry later), so that is bound as `BOUNDED_NUMBER {
atLeast }` and nothing more; when that bound has run out the answer is
UNKNOWN, and "the aura is still active, so the refresh must have reset it"
is a deduction this tranche does not make. Modelled-but-unestablished atoms
are bound as an explicit `STATE_NOT_ESTABLISHED`, so the shared trace
distinguishes "a model exists and the evidence fell short" from "no model".

**The pre-decision window (owner decision).** The M11-B4 audit measured the
lead of a cast's own aura effects ahead of the cast at 0 ms (most), 1 ms
(the Dancing Rune Weapon's Bone Shield stacks, five Vampiric Strikes'
Essence transitions) and 20 ms (the pull Death's Caress's Bone Shield
application, absent from the combatantinfo aura snapshot). M11-B2's
`SAME_MILLISECOND_TRANSITION` was the 0 ms case; `BLOOD_PRE_DECISION_
WINDOW_MS = 50` refuses any transition of the queried identity ahead of the
decision with a lead of 0..50 ms inclusive, for `.up`, `.stack` and
`.remains` alike (`PRE_DECISION_WINDOW_TRANSITION`, lead recorded), with no
causal attribution even where the corpus suggests it. The engine primitive
takes the window as an argument; the 50 ms is Blood's, and no other
specialization changed. It re-pinned one B2 expectation: the pull Death's
Caress (2,004,615), whose Bone Shield presence read UP and count "not
observed" under the 0 ms rule, is now refused with lead 20.

**The threshold tolerance (owner decision).** `BLOOD_REMAINS_THRESHOLD_
TOLERANCE_MS = 50`, a separate constant never aliased to the window: an
EXACT remainder within 50 ms of a literal the pinned list compares THAT
atom against — read off the parsed authority by `remains-thresholds.ts`,
never typed: Bone Shield 1.5 and 3, Essence 1.5 and 8, the three bare-truth
atoms none — is refused (`WITHIN_TIMING_TOLERANCE_OF_THRESHOLD`, margin
recorded). A bound is not subject to it. Zero decisions in either capture
fell within it.

**The remeasurement (bundle 123 / opener 21).** MATCH 21 / REJECTED 0 /
UNKNOWN 102 (B3: 0 / 0 / 123); opener 1 / 0 / 20 (B3: 0 / 0 / 21). Every
match is a Death Strike selected at the EXACT entry — `san_gift[1]`
(`runic_power.deficit<36`) inside the Gift window at 6, `sanlayn[2]`
(`runic_power.deficit<20`) outside it at 15 — once `sanlayn[0]`/`sanlayn[1]`
or `san_gift[0]` resolve FALSE from Bone Shield's remainder proven at least
1.5 s (exact or bounded), its exact count above 1 and its presence, and
Essence's remainder proven exactly at least 1.5 s; the Runic Power deficit
is the cast's own PRE_COST observation. The remains census over the bundle:
Bone Shield EXACT 11 / BOUNDED 104 / window-refused 8; Essence EXACT 96 /
window-refused 26 / presence-unknown 1; Vampiric Strike PERMANENT 15 /
zero 88 / unknown 20; Crimson Scourge EXACT 8 / zero 108 / unknown 6 /
window 1; Visceral Strength EXACT 96 / zero 20 / unknown 7; no coverage
gap, contradiction, missing gain or threshold refusal occurred. The
stopping entries and every B1 dispatch outcome are unchanged from B3
(resolved 79 — now 21 selections and 58 divergent — blocked at
`sanlayn[10] consumption` 43, at the `default[15]` gate 1; deathbringer
skipped ×123, san_gift entered 24 / skipped 98 / blocked 1, sanlayn entered
55 / blocked 43). The first undecided GCD candidate moved: `sanlayn[2]
death_strike` on `runic_power.deficit` 43 (a cast that costs no Runic
Power carries no observation of it), `sanlayn[7] marrowrend` on
`buff.blood_debt.stack` 15, `san_gift[0]` on Essence 14 and `sanlayn[1]`
on Essence plus `fight_remains` 11 (the Vampiric Strikes whose own Essence
transition sits inside the window), `sanlayn[0]` on Bone Shield 7 (the
window-refused Marrowrends), the Dancing Rune Weapon gate 3, `san_gift[1]`
3, `sanlayn[5] any_dnd` usability 3, `sanlayn[6]` usability 2, `san_gift[3]`
Essence stack 1. Of the 96 bundle decisions B3 left on Bone Shield's
remainder, 89 advanced past it; of the 24 on Essence's, 10 did (the other 14
are the window refusals). Opener: 6 of 6 and 7 of 15.

**Proven.** `tests/unit/m11b4-buff-remains-binding.test.ts`,
`m11b4-aura-gain-history.test.ts`, `m11b4-blood-aura-durations.test.ts`,
`m11b4-blood-aura-remains.test.ts` (including the expiry-consistency audit:
every natural expiry of Essence and Visceral Strength in the bundle falls
within 12 ms of the pinned duration after its last gain — validation only,
read from events AFTER every decision they could have informed), the
re-pinned `m11b2-blood-*` tests, two new corpus assertion kinds
(`REMAINS_BINDING_AT`, `REMAINS_EVIDENCE_CENSUS`; the corpus is 43
artifacts / 154 cases / 532 assertions), and the invariance harness: 33 of
33 non-timing captures byte-identical against HEAD (24b42d1) for
Assassination, Protection, Retribution, Arms-unsupported and the public
Blood refusal. Blood stays INTERNAL_ONLY; M11-B is not complete.

**Recorded, not changed.** The Paladin aura bindings and the Rogue DoT,
stealth and engagement state read `BEFORE_EVENT` by position and refuse no
lead; their captures showed the opposite ordering to the Death Knight's,
and the ordering is not a contract. The cross-spec temporal-skew census is a
follow-up before any promotion work that depends on it.

### M11-B5 — Runic Power state (POST_CHANGE, a resource-history seam, Blood-owned carry)

The largest first blocker after M11-B4 — `runic_power.deficit` at 43 + 3
bundle decisions and 7 opener decisions, every one a cast that costs no
Runic Power and therefore carries no PRE_COST amount of it — answered from
causally prior OBSERVED resource states, never from arithmetic.

**The question.** At an observed decision, what exact value or one-sided
bound on Runic Power follows from prior observed states under proven
coverage, without inventing a gain, a spend, a refund, a decay or an
overflow? In-combat Runic Power has no passive term to model: decay runs
only out of combat (`runic_power_decay_event_t` guards on `!in_combat`,
sc_death_knight.cpp:6350-6375) and every in-combat change is a discrete
`resource_gain` (a `resourcechange`) or an action cost (a costed cast).

**The `POST_CHANGE` contract (owner decision 1).** M4's resource timing
gained a third member: the attachment on a normalized `RESOURCE_CHANGE`
whose resource type IS the type that event changed reports the amount
AFTER the change. Nothing else moved — a second pool's snapshot on the same
event, an uncosted cast, a damage event stay `EVENT_ASSOCIATED`; a costed
completed cast stays `PRE_COST`. It was withheld until now because its
evidence had rested on same-timestamp adjacency; the Blood corpus settled it
by whole-window reconciliation: over 165 s + 20 s of one actor's Runic
Power, carrying the latest read amount forward — each of the 290
POST_CHANGE attachments REPLACING it, each costed cast leaving it unread —
reproduces every later Death Strike PRE_COST amount (50 of 50) and every
later uncosted attachment (175 of 175) with zero hidden changes; 238
integer gains sum exactly beside their attachment, 8 cap events read the
reported max, and the 20 Anti-Magic Shell gains show a ROUNDED delta beside
an EXACT attachment (610 + 0 → 617). A pre-change reading matches none of
them. The corpus pins it (`COMBAT_STATE.RESOURCE_CHANGE_POST_CHANGE_CONTRACT`
over the 45 s slice and the opener).

**The M4 policy (owner decision 2).** The resource-state header no longer
forbids continuity outright; it forbids it everywhere but one gated
primitive. `resourceHistoryAt(query)` returns the latest attached
observation of an actor's resource before a position — PRE_COST,
POST_CHANGE or EVENT_ASSOCIATED, tag attached — and every observation of
that resource since it, under a RESOURCES continuity claim FROM THE ANCHOR
(COMPLETE coverage, no unattributed snapshot in between). Each entry
carries its own OBSERVED amount and the standalone change's SIGN
(`changeSign`), never a magnitude to add; `observationsWithinBefore`
returns the observations ahead of a position inside a caller-supplied
window, inclusive at both edges. Delta replay, regeneration, interpolation
and a running ledger remain prohibited, and `latestObservedAtOrBefore` is
still not a continuity claim. With an attachment on every event the anchor
IS the latest read state; the list since it holds only a change with no
attachment of its type — the one shape a caller cannot read a state from.

**The Blood carry (`src/specs/deathknight/blood/runic-power-state.ts`).**
In the fixed order: wire contract pinned; the decision's own PRE_COST
(`OWN_PRE_COST`, the M11-B2 path untouched); the history under RESOURCES
continuity; CASTS continuity over the same interval, gated by Blood because
a spend is a cast and the generic layer composes no categories; an uncosted
anchor corroborated against the exact state before it (a disagreement with
no observed change between is `EVIDENCE_CONTRADICTS_CARRY`, never
re-anchored around); `max` present at the anchor and unchanged since
(`MAX_NOT_ESTABLISHED` / `MAX_CHANGED`); then the window. With nothing in
the window the state is the anchor's read amount if it is POST_CHANGE or
uncosted (`CARRIED_EXACT`, `deficit = (max − amount) / 10`), and UNKNOWN if
it is a costed cast (`POST_SPEND_NOT_OBSERVED`, owner decision 4: the
deduction is 350 or 250 under Blood Draw and is NOT on the wire, and neither
`pre − cost` nor the pinned deduction is ever computed). A change with no
attachment or a negative change refuses (`CHANGE_WITHOUT_POST_STATE`,
`NEGATIVE_CHANGE_UNPINNED`).

**The 1 ms resource window (owner decision 3).** The corpus shows the
resource analogue of the aura hazard, narrowly: a Heart Strike's or
Vampiric Strike's own Heartbreaker gain is logged 0 or 1 ms AHEAD of the
cast (78 of 78), Relish in Blood ahead of Death and Decay (9 of 9), while
every principal gain follows its cast and every independent gain lies 7 ms
or more away. `BLOOD_RESOURCE_PRE_DECISION_WINDOW_MS = 1`, inclusive (leads
0 and 1 inside, 2 outside), a separate constant from the 50 ms aura window
and the 50 ms threshold tolerance. An observation inside the window is not
attributed to either side of the decision. If every window observation is
a non-negative change with an exact POST_CHANGE amount (or an uncosted
snapshot), both readings agree the pre-decision Runic Power is AT MOST the
last of those amounts — a gain cannot lower it — so the deficit is bound
below: `BOUNDED_NUMBER { atLeast: (max − A) / 10 }` (`WINDOW_BOUNDED`),
which the evaluator's existing rule turns into `deficit<20` FALSE when the
bound is at least 20, and never TRUE. A costed cast or a negative change
inside the window refuses (`WINDOW_SPEND_AMBIGUOUS`,
`NEGATIVE_CHANGE_UNPINNED`). No upper bound was added; the cases it would
decide (a window gain with the amount above 105 points) are counted, not
guessed.

**The remeasurement (bundle 123 / opener 21).** MATCH 25 / REJECTED 0 /
UNKNOWN 98 (B4: 21 / 0 / 102); opener 1 / 0 / 20 (unchanged). The four new
matches are Blood Boils at `sanlayn[6]` (`buff.boiling_point.up`) whose
every higher entry is FALSE — `sanlayn[2]` from a CARRIED_EXACT deficit of
47, 31.9, 65.9 and 30.9 points. Runic Power at the 123: OWN_PRE_COST 44,
CARRIED_EXACT 14, WINDOW_BOUNDED 59 (leads 0 ×72, 1 ×7), POST_SPEND_NOT_
OBSERVED 5, NO_ANCHOR 1 (the pull); opener 6 / 5 / 10 / 0 / 0. Every carry
distance is at most 4,156 ms and 22 events; `max` is 1,250 at every
observation. No REJECTED occurred: where the Death Strike gate resolves TRUE
at a cast that is not Death Strike, Death Strike's USABILITY is undecided
(M11-B2 builds no affordability proof on the wire's cost), so the scan
stays UNKNOWN there rather than rejecting. The stopping entries and B1
dispatch outcomes are unchanged from M11-B3. Of the 43 + 3 decisions B4 left
on `runic_power.deficit`, 40 + 3 advance; 3 remain (Blood Boils after a
Death Strike with no observation between, POST_SPEND). The first undecided
GCD candidate is now `sanlayn[7] marrowrend` on `buff.blood_debt.stack` at
45 (37%), the Essence window refusals at `san_gift[0]` 14 and `sanlayn[1]`
11, `sanlayn[0]` Bone Shield window refusals 7, `sanlayn[5] any_dnd`
usability 4, the Dancing Rune Weapon gate 3, `san_gift[3]` Essence stack 3,
`sanlayn[2]` Runic Power (post-spend) 3 and Death Strike usability 3,
`sanlayn[6]` Blood Boil usability 2 and Boiling Point 1, `san_gift[1]`
Death Strike usability 1, `sanlayn[9]` `fight_remains` 1.

**Proven.** `tests/unit/m11b5-resource-post-change-contract.test.ts` (the
contract and the whole-window reconciliation, validation only),
`m11b5-resource-history.test.ts`, `m11b5-blood-runic-power-state.test.ts`
(exact carry, window bound, costed-cast invalidation, every refusal, the
ordering census, a source guard that the Blood module never reads a delta's
magnitude or subtracts a cost), the re-pointed M4 contract tests, the
re-pinned `m11b2-blood-*` tests, three new corpus kinds
(`COMBAT_STATE.RESOURCE_CHANGE_POST_CHANGE_CONTRACT`,
`SPEC_BLOOD_DEATH_KNIGHT.RUNIC_POWER_STATE_AT`,
`RUNIC_POWER_EVIDENCE_CENSUS`; the corpus is 43 artifacts / 156 cases / 551
assertions), and the invariance harness: 33 of 33 non-timing captures
byte-identical against HEAD (9e1f370) — every public consumer reads its own
cast's PRE_COST and nothing else. Blood stays INTERNAL_ONLY; M11-B is not
complete.

### M11-B6 — Blood Debt stack state (exact count from the aura's own transitions)

The largest first blocker after M11-B5 — `buff.blood_debt.stack` at
`sanlayn[7] marrowrend` for 45 of 123 bundle decisions — answered from the
aura's own observed transitions under the existing Blood exact-count rule,
with one Blood-owned clause added and no shared-engine change.

**The question.** Immediately before an observed Blood decision, what exact
Blood Debt stack count is established by prior observed Blood Debt aura
transitions under complete coverage? Not what a Death Strike should have
added, not what the set bonus's internal cooldown allowed, not what the
combatantinfo's silence suggests.

**The pinned mechanics** (`src/data/game/deathknight-blood-aura-authority.ts`,
`BLOOD_DEBT`, five claims against sc_death_knight.cpp at 33622e9d and the
same commit's buff.cpp / spell data). Blood Debt (1310372) is the Blood
MID2 two-piece SET-BONUS aura — no talent and no hero sub-tree produces it,
so neither build proof applies and set-bonus ownership is not resolved.
Death Strike is the only producer (`buffs.blood_debt->trigger()` under
`cooldown.mid2_2pc`, 10120-10123); `trigger()` applies `_initial_stack`,
which is 1 (buff.cpp 1043-1054, 2075-2080), and each further trigger adds
exactly 1 up to `_max_stack` = 10 (spell data; buff.cpp 970-976,
2649-2659). The duration is -1, so the aura is permanent (buff.cpp 877-880):
no expiry, no decay, no one-at-a-time loss, no stack-duration dependency.
Marrowrend is the only consumer, only at the maximum, and it removes every
stack at once (11703-11705; a plain `removebuff` on the wire).

**The rule** (`aura-bindings.ts`). The identity carries a structured
`exactCount: { applicationStack: 1 }` (Bone Shield's is
`{ applicationStack: null }`; every other identity's is `null`), and
`EXACT_COUNT_ATOMS` is derived from the identities that carry one. Under
EXACT ACTIVE presence with coverage: the absolute `stack` of the last
stack-bearing transition when nothing but same-millisecond refresh
companions follows it (`EXACT_STACK_OBSERVATION`, unchanged); the pinned
`applicationStack` when the presence anchor is a PLAIN application and the
transition of the identity before it is a plain removal or none exists
(`EXACT_STACK_APPLICATION`, the M11-B6 clause); zero from an observed
removal (`PROVEN_INACTIVE`, unchanged). A plain application whose preceding
transition shows the aura already held — an application or a positive
stack reading — is refused (`APPLICATION_WHILE_ACTIVE_UNPINNED`): not reset
to 1, not carried, not incremented. A refresh after the count stays
`COUNT_AMBIGUOUS_SINCE_OBSERVATION`; before the first transition and across
an AURAS gap the atom is `AURA_STATE_UNKNOWN`; a transition inside the
Blood-wide 50 ms pre-decision window is `PRE_DECISION_WINDOW_TRANSITION`
(no Blood Debt-specific window). Every exact binding records its anchor
(position, locator, operation, report time). The generic engine learned
nothing: `knownBuffStacks` is unchanged, and the only reachable pinned
expression, `buff.blood_debt.stack=10`, compares an exact integer.

**The wire, measured** (`tests/support/m11/blood-debt-census.ts`, corpus
kind `SPEC_BLOOD_DEATH_KNIGHT.BLOOD_DEBT_TRANSITION_CENSUS`). Over the 165 s
bundle the actor's own track holds 3 `applybuff`, 26 `applybuffstack`
(2..10, three cycles), 2 `removebuff`, no `refreshbuff`, no
`removebuffstack`, never two in one millisecond; every gain follows a Death
Strike and every removal a Marrowrend, by 10-49 ms (the opener: 1 / 5 / 0,
18-53 ms) — the wire writes Blood Debt AFTER its cause, the opposite of Bone
Shield's own-effect lead, so `BEFORE_EVENT` at the producing decision reads
the pre-cast count and the smallest gap to the next eligible decision is
702 ms (opener 711). The retrospective walk of the pinned model — an
application follows zero, a count reads previous + 1, a removal follows 10 —
is consistent at 30 of 30 bundle and 5 of 5 opener validation points; it
runs in test support only and never feeds the evaluator. Fifteen of the
bundle's 44 Death Strikes produce no transition; none adds a stack.

**Measured.** Bundle **37 MATCH / 0 REJECTED / 86 UNKNOWN** (B5: 25 / 0 /
98): 27 Death Strikes (6 new at `sanlayn[9]` `runic_power.deficit<40`), 6
Heart Strikes (Vampiric Strike casts at `sanlayn[8]`
`buff.vampiric_strike.up`, 1 EXACT_ENTRY + 5 TOKEN_CONVERGED past an
undecided `sanlayn[1]`) and 4 Blood Boils. The 45 s slice 15 / 0 / 33 (B5
10); the opener 1 / 0 / 20 unchanged. Blood Debt evidence over the 123:
EXACT_STACK_OBSERVATION 107, EXACT_STACK_APPLICATION 7, PROVEN_INACTIVE 3,
AURA_STATE_UNKNOWN 6; counts 0 ×3, 1 ×7, 2 ×11, 3 ×8, 4 ×10, 5 ×8, 6 ×7,
7 ×5, 8 ×10, 9 ×6, 10 ×42 (opener 14 / 1 / 0 / 6). Of the 45 decisions B5
left on the stack, 7 MATCH and 38 advance — 16 to `USABILITY:marrowrend`
at the same entry (the count is exactly 10, the entry is TRUE, and no rune
or affordability proof exists for an action that was not cast, so the
decision stops there rather than becoming a REJECTED), 19 to
`fight_remains` at `sanlayn[9]`, 2 to `buff.vampiric_strike.up` and 1 to
`USABILITY:heart_strike` at `sanlayn[8]`; none remains on the stack. The
new first-blocker ranking: `sanlayn[9]` `fight_remains` 20, Marrowrend
usability 16, Essence window refusals 14 + 11, Bone Shield window 7,
`any_dnd` usability 4, the Dancing Rune Weapon gate 3, Essence stack 3,
Runic Power after a spend 3, Death Strike usability 3 + 1, Blood Boil
usability 2, `buff.vampiric_strike.up` 2, Boiling Point 1, Heart Strike
usability 1.

**Not built, on purpose.** No stack from a Death Strike cast or the
internal cooldown, no `previous + 1`, no cap arithmetic, no decay, no
bounded stack, no set-bonus resolution from equipped items, no zero from
the combatantinfo snapshot, no Marrowrend usability or Rune affordability,
no `fight_remains`, no second pre-decision window.

**Proven.** `tests/unit/m11b6-blood-debt-stack.test.ts` (explicit counts
read verbatim, the fresh-application clause and its refusal, removal zero,
the ambiguous shapes, the zero-valued stack removal failing closed, the
coverage gap, the inclusive window at leads 0 / 50 / 51, Bone Shield and
Essence unchanged, a source guard against stack arithmetic and cast-based
inference, the corpus pins and both censuses), the re-pinned
`m11b2-blood-*` tests, two new corpus kinds
(`SPEC_BLOOD_DEATH_KNIGHT.STACK_EVIDENCE_CENSUS`,
`BLOOD_DEBT_TRANSITION_CENSUS`) and one new case (the corpus is 43
artifacts / 157 cases / 570 assertions), and the invariance harness: 33 of
33 non-timing captures byte-identical against HEAD (af76660). Blood stays
INTERNAL_ONLY; M11-B is not complete.

### M11-B7 — Marrowrend usability from the decision cast's own Rune count

The second-largest first blocker after M11-B6 — `USABILITY:marrowrend` at
`sanlayn[7]` for 16 of 123 bundle decisions — answered, where the evidence
allows, from the decision cast's own exact PRE_COST Rune entry against the
pinned Marrowrend cost, with one Blood-owned fact, one allowlisted proof
and no shared-engine change. Candidate A of the pre-flight only: the
positive direction. Candidate B (a count below the cost as
`INSUFFICIENT_RESOURCE`) is deferred by owner decision.

**The question.** At an observed Blood decision whose cast carries an exact
PRE_COST Rune count, could Marrowrend have been selected at that same
instant? Not at the previous decision plus regeneration, not from a
previous count minus a cost, not from any event beside the cast.

**The pinned mechanics** (`src/data/game/deathknight-blood-rune-cost-authority.ts`,
claims against sc_death_knight.cpp at 33622e9d and the same commit's
sc_spell_data.inc). Marrowrend's cost is DBC power row 10513 — power type 5,
cost 2, no aura condition — on a record with cooldown, charge cooldown,
internal cooldown, category cooldown and cast time all zero
(`deathknight-blood-spender-costs.json`, read through the artifact's own
`FIRST_ROW_OF_POWER_TYPE_IN_TABLE_ORDER` rule and its recorded
`POWER_RUNE` enumerator; `bloodRuneCostOf`). `marrowrend_t` overrides
neither `cost()` nor `ready()` and has no replacement action, so
`action_t::ready()` is cooldown ∧ internal cooldown ∧ movement ∧
`cost_affordable()`, and `resources.current[RESOURCE_RUNE]` is the count of
fully recharged runes. The pre-flight scanned every family-15 effect in the
pinned spell data for a resource-cost modifier reaching Marrowrend's class
mask `{ 0, 2048, 0, 2149580800 }` and found exactly two, both Exterminate
(441416 / 447954, effects 1136665 / 1146159, −50%), a Deathbringer hero
talent whose buff is a `make_fallback` unless a Deathbringer talent is
taken; the same scan reproduces every modifier the wire already showed on
Death Strike (Ossuary, Improved Death Strike, Blood Draw: 450 → 350 → 250),
Crimson Scourge's free Death and Decay and Dance of Midnight's free Heart
Strike (the 11 uncosted Heart Strikes, each followed 19–29 ms later by
`removebuff 1264568`). No Blood cast gains a Rune on its own execution:
every instantaneous `replenish_rune` caller is Frost-owned or Army of the
Dead's precombat regeneration. No cost-increasing effect exists.

**The wire, measured.** Across the four Blood slices, 66 consecutive pairs
of the subject's own Rune-costed casts (no Rune spend between them): 27
have `B.amount < A.amount`, impossible under a POST_COST reading; 0 have
`B.amount < A.amount − A.cost`, so the PRE_COST reading is never refuted;
no snapshot is 0; four are exactly `amount == cost`. The attached count is
the count before the cast's own cost — the reading the `rune` atom has used
since B2 — and, for the positive direction, either reading gives
decision-time runes ≥ the attached amount.

**The fact** (`src/specs/deathknight/blood/rune-affordability.ts`).
`bloodRuneAffordability(observation, heroTree)` is total over its inputs
and lands on exactly one evidence class: `NO_RUNE_OBSERVATION` (the cast
carries no EXACT / OBSERVED / PRE_COST Rune entry — Death Strike, Blood
Boil, a free Heart Strike), `AUTHORITY_NOT_PINNED` (the artifact did not
validate, has no single Marrowrend record, or the record is not spell 195182
with a positive Rune row, cooldown-free and instant), `MODIFIER_UNPROVEN`
(the hero tree is UNKNOWN, CONTRADICTORY or RESOLVED Deathbringer —
`marrowrendRuneCostModifiersExcluded`, the same one-tree-at-a-time fact
that backgrounds `reapers_mark`; never inferred from the absence of an
Exterminate aura), `OWN_PRE_COST_AFFORDABLE` (count ≥ pinned cost) or
`OWN_PRE_COST_BELOW_COST` (count < pinned cost, recorded and never acted
on). The fact carries the count, its max, the wire's cost field (identity
corroboration only; never the mechanical cost) and the pin it was compared
to. It is computed per decision in `observed-analysis.ts` and carried
nowhere: Runes have no standalone `resourcechange`, so there is nothing to
carry, nothing to add a delta to, and no separate event whose ordering could
need a window — no Rune safety window exists and none is needed.

**The proof** (`action-profile.ts`, `resolveBloodUsability`). After the
hypothetical-prefix and observed-cast proofs and the derived-cooldown
elimination, for the token literal `marrowrend` only:
`marrowrendAffordabilityProven(fact)` re-checks every conjunct — evidence
`OWN_PRE_COST_AFFORDABLE`, an EXACT count, the modifier excluded, a PINNED
record for spell 195182 that is cooldown-free and instant, count ≥ cost —
and returns `PROVEN_USABLE`. The remaining `ready()` conjuncts are
proven by parity with the observed melee GCD cast: Marrowrend, Heart Strike
and Vampiric Strike carry the same max range (5), cast time (0) and
`usable_moving()`, the GCD was ready because a GCD cast fired, and the
target was in melee range because a melee cast hit it. Nothing generalises
to "any Rune spender": `heart_strike`, `deaths_caress` and `any_dnd` stay
UNKNOWN at 6 Runes. The fact is threaded through `BloodFirstGcdQueryInput`
to the adapter; the generic scan learned nothing, and its priority
short-circuit is untouched — a decision whose root scan now selects
Marrowrend but whose higher entry (`sanlayn[1]`, `any_dnd`, the Dancing
Rune Weapon gate) is still undecided remains `DIVERGENT_GCD_OUTCOMES`.

**Measured.** Bundle **37 MATCH / 7 REJECTED / 79 UNKNOWN** (B6: 37 / 0 /
86): the MATCH population is unchanged decision for decision (27 Death
Strikes, 6 Heart Strikes, 4 Blood Boils; 32 EXACT_ENTRY, 5 TOKEN_CONVERGED,
the 37 report times pinned in the contract), and the seven REJECTED are
Blood's first — Heart Strikes at 2,039,813 / 2,040,797 / 2,042,440 (4 Runes
each, three consecutive GCDs before the Marrowrend at 2,043,209), 2,091,626
(3), 2,114,293 (4), 2,115,379 (3) and the Vampiric Strike at 2,113,271 (5),
each at Blood Debt exactly 10 from an `applybuffstack` 5–29 s earlier,
each with `sanlayn[7] marrowrend` selected at its exact entry, no
competing undecided GCD candidate, `AUTHORITY_SELECTED_DIFFERENT_TOKEN`.
A REJECTED is a divergence from the pinned list, not a performance score.
The 45 s slice 15 / 3 / 30 (B6 15 / 0 / 33); the opener 1 / 0 / 20
unchanged. Of the 16 decisions B6 left on `USABILITY:marrowrend`, the 7
whose cast carried an exact count of 3–5 resolve and the 9 whose cast
carried no Rune entry (7 Death Strikes, the 2 free Heart Strikes at
2,039,056 and 2,117,422) stay exactly where they were; the five decisions
whose root scan now selects Marrowrend under a diverging higher entry
(2,036,692, 2,087,470, 2,093,667, 2,097,796, 2,119,480) stay UNKNOWN; the
four decisions at exactly 1 Rune are `OWN_PRE_COST_BELOW_COST` and none is
REJECTED. Rune evidence over the 123: OWN_PRE_COST_AFFORDABLE 52,
OWN_PRE_COST_BELOW_COST 4, NO_RUNE_OBSERVATION 67 (opener 11 / 0 / 10);
counts 1 ×4, 2 ×9, 3 ×20, 4 ×14, 5 ×6, 6 ×3. The root scan resolves at 88
(B6 81) and blocks at `sanlayn[10]` for 34 (41): the seven REJECTED scans
end at `sanlayn[7]` and never walk on. The first-blocker ranking:
`sanlayn[9]` `fight_remains` 20, Marrowrend usability 9, Essence window
refusals 14 + 11, Bone Shield window 7, `any_dnd` usability 4, the Dancing
Rune Weapon gate 3, Essence stack 3, Runic Power after a spend 3, Death
Strike usability 3 + 1, Blood Boil usability 2, `buff.vampiric_strike.up`
2, Boiling Point 1, Heart Strike usability 1. `fight_remains` is
unmodelled and its 20 + 11 + 3 stay UNKNOWN.

**Not built, on purpose.** No Rune carry, no `previous − cost`, no
regeneration, no delta, no reading of a nearby event, no Rune safety
window, no trust in the wire's `cost` field, no proof for any token but
`marrowrend`, no proof under an unresolved or Deathbringer tree, no
`INSUFFICIENT_RESOURCE` (Candidate B), no generic cost-modifier framework,
no public enum: `usabilityProvenance` keeps its two public members and the
constant Blood writes (the Retribution precedent), and the reason for the
proof lives in the Blood payload (`resolved[].runeAffordability`) and the
`runeAffordabilityEvidence` / `runeCounts` census.

**Proven.** `tests/unit/m11b7-blood-rune-affordability.test.ts` (the pin
and its digests; affordable at 2 / 3 / 6; below cost at 0 / 1 proving
nothing; no observation on a Death Strike, a Blood Boil and an uncosted
Heart Strike; EVENT_ASSOCIATED and POST_CHANGE type-5 entries refused;
same-millisecond aura, change and another actor's Runes never read; UNKNOWN
/ CONTRADICTORY / Deathbringer trees withheld; no carry, no ledger, no
regeneration; the token allowlist; wire cost 5 against 4 Runes still proved
at the pinned 2; the authority guard against every non-zero cooldown
scalar, a wrong spell id and a missing Rune row through
`marrowrendPinOf` and the cache seam; a hand-tagged fact proving nothing),
the re-pinned `m11b2-blood-evaluator` contract (the seven REJECTED
individually with their fact, own entry, locator and Blood Debt anchor; the
five divergent; the nine no-observation; the census; the 37 MATCH by report
time) and `m11b2-blood-registration` (the 45 s view), two new corpus kinds
(`SPEC_BLOOD_DEATH_KNIGHT.RUNE_AFFORDABILITY_AT`,
`RUNE_AFFORDABILITY_CENSUS`) and one new case (the corpus is 43 artifacts
/ 158 cases / 605 assertions; the workerd gate byte-identical across two
processes), and the invariance harness: 33 of 33 non-timing captures
byte-identical against HEAD (d421981) — Assassination, Protection,
Retribution, Arms, every raid night and every public document unchanged.
Blood stays INTERNAL_ONLY; M11-B is not complete.

### M11-B8 — Essence of the Blood Queen: lone refreshes of unproven cause, and the floor both orderings share

Two changes to one Blood-owned module (`aura-remains.ts`) and one
identity-owned policy (`deathknight-blood-aura-authority.ts`,
`BloodRemainsPolicy`), no shared-engine change, no new public enum, Blood
still INTERNAL_ONLY. One corrects an M11-B4 proof that the corpus had
falsified; the other admits, inside the 50 ms pre-decision window, the one
fact that is true under every ordering of the events in it.

**The pinned mechanics, re-verified against 33622e9d / client
12.1.0.69587.** Essence of the Blood Queen (433925) lasts 20,000 ms in the
DBC plus 5,000 ms from the Blood specialization passive (137008 effect 16,
`A_ADD_FLAT_LABEL_MODIFIER` P_DURATION on label 3134): exactly 25,000 ms,
not haste-scaled, not pandemic, not additive, not stack-dependent, not
altered by any supported talent or by the hero tree (Frenzied Bloodthirst
434075 and Gift of the San'layn 434153 modify label 3134's max stacks and
effect values, never P_DURATION). Refresh behaviour is DURATION: a
`buff_t::trigger` on the active buff reschedules the expiry to the full
duration. The module has exactly ONE producer —
`buffs.essence_of_the_blood_queen->trigger()` in
`trigger_sanlayn_execute_talents` (sc_death_knight.cpp:13808) on a Vampiric
Strike execution — and no `expire()`, `extend_duration()` or
`set_max_stack()` for it.

**What the corpus showed that the model does not.** Both subjects' wires
carry a lone `refreshbuff` of 433925 at every Gift of the San'layn edge with
no Vampiric Strike cast anywhere near it: 2,019,763 and 2,111,891 (the two
Gift removals), 2,099,885 (the second Dancing Rune Weapon), opener
2,429,050. The pinned module cannot produce those events, so the wire
refreshes this aura for a cause the model does not describe. M11-B4 read
every lone refresh as the pinned trigger's full reset ("alone it is a
trigger") and anchored an exact remainder on it — including on those four:
17 bundle and 6 opener decisions, among them five MATCH and three of the
seven B7 REJECTED, rested on an anchor the authority never established.
Both subjects also carry Frenzied Bloodthirst (trait entry 117662), and the
wire shows `applybuffstack 6` and `7` while the pinned artifact records
`_max_stack` 5: the sim never applies the talent's +2 (434075 effect 1,
P_MAX_STACKS by label). That is an authority-model gap, recorded on the
identity and in the artifact's own review text, and no positive Essence
count is bound from it.

**G1 — a lone refresh is of unproven cause (owner decision, strict).** The
identity's `remainsPolicy.loneRefresh` is `UNPROVEN_CAUSE` for Essence and
`PINNED_TRIGGER_RESET` (the B4 reading) for every other identity. Under
`UNPROVEN_CAUSE`, `isAmbiguousRefresh` treats every `REFRESHED` observation
with no same-millisecond `APPLIED` companion as ambiguous — not identified
by the Vampiric Strike 0–1 ms after it, not by the Gift edge beside it, not
by the absence of any other visible producer; all three are circumstantial,
and circumstantial attribution is what this project refuses. A refresh
beside an `applybuff` / `applybuffstack` at the same millisecond is that
gain's companion and the gain anchors exactly, as before (the refresh need
not be the authority source). What an ambiguous refresh cannot do is
shorten an expiry already proven, so the existing walk-back keeps the
earlier proven expiry as a lower bound (`GAIN_ANCHOR_BOUNDED`, through
consecutive lone refreshes to the last anchoring gain), and once that
floor has run out the remainder is UNKNOWN
(`AMBIGUOUS_REFRESH_BEYOND_BASE_DURATION`) — never a fresh 25 s. Bone
Shield, Crimson Scourge and Visceral Strength are untouched: their lone
refreshes still anchor exactly, and the Bone Shield refresh beside a stack
removal is still the one B4 ambiguity.

**G2 — the order-invariant floor inside the window (owner decision).** The
50 ms window stays: every EXACT reading of an identity with a transition
0–50 ms ahead of the decision is refused, `.up` and `.stack` are unchanged,
and the constant is untouched. For `.remains` of an identity whose policy
sets `windowOrderInvariantBound` (Essence only), `orderInvariantWindowBound`
computes what both orderings leave and binds their minimum:

```text
H1  the cluster followed the decision (it is the decision's own effect):
    the ordinary derivation at the cluster's FIRST position — window bound
    NOT admitted there, so a nested window is a refusal, and every ordinary
    refusal (coverage, ambiguous initial state, chain exhaustion,
    contradiction, non-monotonic time, unpinned shape, G1) applies —
    projected to the decision by the elapsed milliseconds
H2  the cluster preceded the decision: a duration reset at its LATEST
    transition leaves 25,000 ms minus that lead; a refresh that reset
    nothing leaves H1 again
atLeast = min(H1, H2)         bound as BOUNDED_NUMBER, never KNOWN
```

The bound exists only when every transition in the cluster is an
`applybuffstack` or a `refreshbuff` — the shapes under which both orderings
leave the aura active with a floor. A plain `applybuff` (the orderings are
inactive against fully active), any `removebuff` / `removebuffstack`, or a
shape the module does not foresee refuses the cluster whole
(`PRE_DECISION_WINDOW_TRANSITION`, the reason in `detail`); so does an H1
the ordinary rules cannot establish, and a floor that has run out. The
edge is exact arithmetic on the same skewed timestamps an exact remainder
is, so an `atLeast` within `BLOOD_REMAINS_THRESHOLD_TOLERANCE_MS` of a
pinned Essence threshold (1.5 s, 8 s) is refused
(`WITHIN_TIMING_TOLERANCE_OF_THRESHOLD`, margin recorded) rather than
narrowed — the B4 gain-anchored bound keeps its exemption. No ordering is
chosen or inferred: the payload records both worlds
(`windowOrderInvariance`: the cluster with each lead, H1 and its proof
class, H2) beside the minimum. In a single cluster H1 is always the
smaller world (a gain inside the window would be part of the cluster), so
the value is the chain before the cluster, not the reset; the construction
is still the minimum of both, and the tests prove it.

**The measurement (bundle 123 / 45 s 48 / opener 21).** 37 MATCH / 9
REJECTED / 77 UNKNOWN (B7: 37 / 7 / 79); 15 / 3 / 30 and 1 / 0 / 20
unchanged. Decision for decision against B7: UNKNOWN → REJECTED 2, every
other outcome and authority token identical, one precision upgrade. The
two new REJECTED are Vampiric Strikes whose `sanlayn[1]` Heart Strike entry
(`buff.essence_of_the_blood_queen.remains<1.5`) is now FALSE from the
floor, after which the B7 Marrowrend chain selects: 2,087,470 (floor
11,070 ms = the application at 2,073,540 + 25,000 − 2,087,470, or a reset
in the cluster; Bone Shield 10 with a 27,882 ms floor; deficit at least
28.9; Crimson Scourge and Boiling Point down; Blood Debt exactly 10 from
the `applybuffstack` at 2,086,445; Marrowrend PROVEN_USABLE from the cast's
own 3 Runes) and 2,093,667 (floor 18,803 ms past a 1 ms lead cluster of
`applybuffstack 3` and its refresh; Bone Shield 9; deficit at least 46.9;
Blood Debt 10; 3 Runes) — `sanlayn[7] marrowrend` at the exact entry, no
competing undecided GCD candidate. The Vampiric Strike at 2,029,599 stays
MATCH on `heart_strike` and becomes EXACT_ENTRY at `sanlayn[8]`: its floor
(12,675 ms, itself a bound from the stack gain at 2,017,274 through the
lone refreshes since) makes `sanlayn[1]` FALSE instead of an undecided
same-token candidate. The Essence census over the 123: EXACT 24 (a gain or
its companion), BOUNDED 40, AMBIGUOUS_REFRESH_BEYOND_BASE_DURATION 32,
WINDOW_ORDER_INVARIANT_BOUNDED 20, window-refused 6 (the fresh
applications at 2,008,597 and 2,073,540, the expiry at 2,071,379, and
three clusters — 2,046,373, 2,144,631, 2,149,490 — whose chain before them
has run out), presence-unknown 1; opener 6 / 7 / 0 / 6 / 1 / 1. Twelve
MATCH and three REJECTED whose Essence remainder is now a floor or UNKNOWN
keep their outcome because their selection never read it: `sanlayn[1]` is
FALSE on `buff.vampiric_strike.remains` = 0 or on a floor above 1.5 s, and
the selection sits above `sanlayn[9]` — measured by the engine, not
assumed. The first-blocker ranking: `san_gift[3]` Essence stack 12,
`sanlayn[9]` `fight_remains` 9 plus 11 that now also carry the Essence
remainder (their `sanlayn[9]` third disjunct can no longer be decided from
a lone-refresh chain; all already UNKNOWN on `fight_remains`), Marrowrend
usability 10, Bone Shield window 7, `any_dnd` usability 5, `san_gift[2]` 4,
the Dancing Rune Weapon gate 3, Death Strike usability 3 + 1, Runic Power
after a spend 3, `buff.vampiric_strike.up` 2, Blood Boil usability 2,
`sanlayn[1]` 2 (a cluster with no floor before it; the fresh application),
`san_gift[0]` 1, Boiling Point 1, Crimson Scourge 1. `fight_remains` stays
unmodelled; the Essence stack stays unbound; no resource or usability
blocker moved.

**Not built, on purpose.** No cause for any lone refresh; no reset from a
refresh at a Gift edge or beside a Vampiric Strike; no positive Essence
count (the pinned max stack is contradicted by the wire); no `stack<7`
from `maxStack: 5`; no ordering chosen inside the window; no upper bound;
no bound from a cluster holding an application or a removal; no nested
window bounds; no change to the window or the tolerance constant; no change
to Bone Shield, Crimson Scourge, Visceral Strength, Vampiric Strike, `.up`
or `.stack`; no `fight_remains`; no shared-engine change.

**Proven.** `tests/unit/m11b8-blood-ebq-remains.test.ts` (the policy table;
the constants; lone refresh → floor, 0–1 ms before a Vampiric Strike → the
same floor, past the floor → UNKNOWN, consecutive lone refreshes walked
back, the same-millisecond companion still exact, a refresh 1 ms after a
stack gain not a companion, no earlier gain → NO_GAIN_OBSERVED, three
identities unchanged; the window bound at leads 0 / 1 / 50 with both worlds
recorded and the count still refused, 51 ms on the ordinary path, a lone
refresh cluster, H1 below the threshold kept as the minimum, H1 from a
bounded chain, the seconds binding; refusals for a plain application, a
removal, a stack removal, a mixed cluster, H1 ambiguous-initial /
run-out / contradiction / coverage gap, a floor that has run out, edges at
1,451–1,549 and 7,950–8,050 ms, a Bone Shield cluster; no stack expansion;
the committed 2,087,470 / 2,093,667 / 2,020,278 / 2,012,014 / 2,042,440 and
the opener's 2,429,596), the re-pinned `m11b4-blood-aura-remains` (two
cases), the re-pinned `m11b2-blood-evaluator` contract (37 / 9 / 77; the
nine REJECTED individually; the three still-divergent; the first-obstacle
map; the census with the order-invariant invariants checked on every
binding; the opener), one new corpus case
(`spec-blood-death-knight.essence-lone-refreshes-anchor-nothing-…`) and the
re-pinned measurement cases (the corpus is 43 artifacts / 159 cases; the
`REMAINS_BINDING_AT` kind now carries `windowOrderInvariance`), and the
invariance harness: Assassination, Protection, Retribution, every raid
night and every public document unchanged. Blood stays INTERNAL_ONLY;
M11-B is not complete.

---

### M11-B9 — Essence of the Blood Queen: the stack authority, exact counts, and the finite set both orderings leave

Three pieces: a Blood-owned max-stack authority (owner decision Q3), the
existing exact-count machinery extended to Essence under a maximum guard,
and — the one shared change — a generic finite-set numeric binding (owner
decision Q1) that lets the pre-decision window yield the two exact counts
its two orderings leave. Refresh-count carry was declined (Q2) and is not
built. No public change; Blood stays INTERNAL_ONLY.

**The authority.** The DBC row 433925 records `_max_stack` 5 and
`_proc_charges` 0. The generated duration artifact carries that 5 raw and
is not reinterpreted. Frenzied Bloodthirst — `trait_data.inc:2932`: HERO
tree, class 6, trait node entry 117662 at node 95065, definition 122674,
spell 434075, one rank, San'layn sub-tree 31, NORMAL node with no
alternative — carries effect 1123818, `A_ADD_FLAT_LABEL_MODIFIER` (219)
with misc_value 37 (`P_MAX_STACKS`) on label 3134, base value 2; label 3134
is carried by exactly one spell (`__spelllabel_data { 433925, 3134 }`), and
433925's class-family flags are zero, so no family-mask modifier reaches
it. The effective maximum is 5 + 2 = **7** exactly when the talent is
SELECTED. The talent enters the machine-extracted talent artifact through
the existing extractor target (`frenzied_bloodthirst`, regenerated from the
hash-verified pinned sources), and the three-way rule resolves it
`SELECTED / OWN_ENTRY_SELECTED / 117662` on both committed subjects; a tree
without the node is UNKNOWN (NODE_ABSENT), never NOT_SELECTED.
`deathknight-blood-stack-authority.ts` records the modifier with claims
against the hashed `sc_spell_data.inc`, `trait_data.inc` and
`sc_death_knight.cpp`, and `bloodEffectiveMaxStack` resolves 7 / 5
(Deathbringer) / UNKNOWN (modifier talent unresolved) — never from a count.

**The runtime gap, stated exactly.** The pinned module parses the talent:
`parse_all_passive_talents()` at sc_death_knight.cpp:15163 registers
434075's passive effects and player.cpp:15125 / 15851 map `P_MAX_STACKS`
to the passive field `"max_stack"`. `buff_t` never reads it:
`set_max_stack( -1 )` takes `data().max_stacks()` raw (buff.cpp:974-976)
and a buff reads passive values only for `"duration"` (:863) and `"period"`
(:1227). So the sim's Essence caps at 5 and `san_gift[3]`'s literal
`stack<7` — which the Unholy list writes as `stack<buff.essence_of_the_
blood_queen.max_stack` — is vacuous in the sim and a real "not at max" test
in game. That is a SimulationCraft omission; the wire's `applybuffstack 6`
and `7` (both subjects, never 8) corroborate the DBC and are never used to
establish it.

**Exact counts.** Essence's identity now carries `exactCount:
{ applicationStack: 1, maxStackGuard: true, windowOrderInvariantSet: true }`.
The count is the last `applybuffstack`'s absolute value
(`EXACT_STACK_OBSERVATION`) or the pinned 1 of a fresh `applybuff`
(`_proc_charges` 0 → `_initial_stack` 1, buff.cpp:1043-1054;
`EXACT_STACK_APPLICATION`) — the B6 rule unchanged, so a lone `refreshbuff`
after the count leaves it `COUNT_AMBIGUOUS_SINCE_OBSERVATION` (Q2 declined:
no wire contract that a refresh keeps a count is pinned, whatever the
corpus corroborates), while the remainder survives the same refresh as a
floor (M11-B8) — the two are decoupled. `maxStackConflict` checks every
count against the effective maximum: above 7, or above the DBC 5 while the
modifier is unproven, refuses as `COUNT_EXCEEDS_PINNED_MAX`. Bone Shield
and Blood Debt carry both switches off: their observed 11 / 12 against an
artifact maximum of 10 is the same class of gap, deliberately left alone.

**The finite set (shared, Q1).** `NumericBinding` gains `ONE_OF_NUMBERS`
(`oneOfNumbers(values, reason)`: deduplicated, sorted, at least two
distinct members — a single distinct value is returned as KNOWN, an empty
list throws). In a world it is `OneOfValue`; a comparison against an exact
value is made for every member and decides only when all agree
(`agreedComparison`), a set against a set or a bound is UNKNOWN, a truth
is TRUE only when every member is non-zero and FALSE only when every
member is zero, arithmetic refuses, and the trace carries `binding:
"ONE_OF"` with the members in an `oneOf` field that is ABSENT on every
other binding so no existing trace changes a byte. `knownBuffStacks[].stack`
widens to `number | NumericBinding`; every existing caller passes a number
and is untouched (Assassination, Protection, Retribution byte-identical in
the corpus report). Not an interval, not a bound, never collapsed.

**The window set (Blood).** When `.stack` is window-refused for an identity
whose rule admits it, `orderInvariantWindowStack` requires the cluster to
be exactly ONE `applybuff` / `applybuffstack` with or without its
same-millisecond `refreshbuff` companion(s): H1 is the exact count before
the cluster by `bindBloodStackAt` at the cluster's first position with the
set NOT admitted (so every ordinary refusal applies, including the
lone-refresh ambiguity, and a nested window refuses), or — for a fresh
application — the zero the ordinary presence binding at that position
PROVES (M4 EXACT INACTIVE anchored on an observed removal; the first
application in a track has `AMBIGUOUS_INITIAL_STATE` before it and
refuses, because no aura event is not aura inactive); H2 is the
cluster's absolute count or the pinned application count. Each world is
checked against the maximum on its own (no arithmetic joins them; the B6
source guard still forbids `Math.max`). A lone refresh in the cluster, any
removal, more than one gain, a shape not foreseen, an H1 that is not exact,
or a cluster that changes nothing refuses. The binding is `BOUND_SET`
(`WINDOW_ORDER_INVARIANT_SET`, `possibleStacks`, both worlds recorded),
handed to the evaluator as `ONE_OF_NUMBERS`. Blood writes no `<7`; the
list's literal and the generic evaluator decide. A stopping atom whose
gate stayed undecided now names a ONE_OF atom too (`stoppingAtomsOf`), so
{ 6,7 } is reported on the stack atom rather than on usability.

**The measurement (bundle 123 / 45 s 48 / opener 21).** 40 MATCH / 9
REJECTED / 74 UNKNOWN (B8: 37 / 9 / 77); 16 / 3 / 29 (15 / 3 / 30); 1 / 0 /
20 unchanged. Decision for decision against B8: UNKNOWN → MATCH 3, every
other outcome, token and precision identical (MATCH 36 EXACT_ENTRY / 4
TOKEN_CONVERGED). The three: Vampiric Strikes at 2,015,029 ({ 5,6 }: 5 from
`applybuffstack 5` at 2,012,773, 6 at lead 0), 2,103,820 ({ 4,5 }: 4 at
2,101,867, 5 at lead 0) and 2,105,703 ({ 5,6 }: 5 at 2,103,820, 6 at
2,105,702, lead 1) — `san_gift[0]` FALSE from the B8 floor (22,744 / 23,047
/ 23,117 ms), `san_gift[1]` FALSE from the deficit floor (≥ 58 / 59.9 /
67.9), `san_gift[2]` FALSE (Crimson Scourge PROVEN_INACTIVE),
`san_gift[3]` TRUE for every member, the entry names the observed action
(usable by execution), no undecided candidate. Still UNKNOWN by
construction: 2,017,274 and 2,106,638 ({ 6,7 }), 2,101,867 (H1 = 3 at
2,093,666 lies across the Gift-edge lone refresh at 2,099,885), the
lone-refresh clusters 2,018,024 / 2,019,524 / 2,110,550, the track's first
application 2,008,597 (and the opener's 2,418,659: silence before it,
never { 0,1 }), and the exact
counts at 2,015,770 (6) and 2,104,758 (5) that make `san_gift[3]` TRUE for
a Heart Strike that was not cast (`USABILITY:heart_strike`). Essence stack
census: EXACT_STACK_OBSERVATION 15, EXACT_STACK_APPLICATION 9,
WINDOW_ORDER_INVARIANT_SET 12, COUNT_AMBIGUOUS_SINCE_OBSERVATION 72,
PRE_DECISION_WINDOW_TRANSITION 14, AURA_STATE_UNKNOWN 1; sets {0,1} (after
the observed removal at 2,071,379), {1,2} ×2, {2,3} ×2, {3,4}, {4,5} ×2,
{5,6} ×2, {6,7} ×2; opener 6 / 0 / 5 / 7 / 2 / 1; no
COUNT_EXCEEDS_PINNED_MAX on either subject. First blockers:
`sanlayn[9]` `fight_remains` 9 + 11, Marrowrend usability 10, Essence stack
7 (+ 2 on Heart Strike usability), Bone Shield window 7, `any_dnd` 5 + 1,
`sanlayn[1]` 4 + 2, the Dancing Rune Weapon gate 3, `san_gift[2]` 3 + 1,
Death Strike usability 3 + 1, Runic Power after a spend 3,
`buff.vampiric_strike.up` 2, Blood Boil usability 2, `san_gift[0]` 1,
Boiling Point 1. `fight_remains` unmodelled; no resource work.

**Not built, on purpose.** No count from a Vampiric Strike tally, no
increment, no carry across a lone refresh (Q2), no maximum from a count, no
ordering chosen, no set from a lone-refresh / removal / multi-gain cluster,
no { 0,1 } from the silence before a track's first transition, no nested
window set, no `<7` in Blood code, no set collapsed to min or
max, no arithmetic over a set, no interval, no upper-bound field, no set
for Bone Shield or Blood Debt, no guard for their maxima, no extractor
redesign, no public enum, no `fight_remains`.

**Proven.** `tests/unit/simc-expression-one-of-numbers.test.ts` (construction,
every operator both ways, min/max non-collapse, set-vs-set, truthiness,
Kleene composition, arithmetic refusal, trace shape, plain-number
invariance); `tests/unit/m11b9-blood-ebq-stack.test.ts` (the regenerated
talent identity and hashes, the modifier, 7 / UNKNOWN / 5, both subjects
SELECTED by entry, NODE_ABSENT → UNKNOWN, the switches; applybuff → 1,
applybuffstack 2..7, removal → 0, held application refused, strict lone
refresh near or far from a Vampiric Strike, 6/7 bind and 8 refuses under
the talent, 6 refuses and 5 binds under an unresolved talent, Bone Shield
12 and Blood Debt 11 unguarded; the set at leads 0 / 1 / 50, 51 ms on the
ordinary path, { 5,6 } / { 4,5 } / { 6,7 }, { 0,1 } after an observed
removal, the track's first application refused at leads 0 / 1 / 50 with no
ONE_OF reaching the seam, refusals for lone refresh, 1 ms-late refresh, removals, mixed cluster, two
gains, no count before, lone refresh before the cluster, maxima in either
world, Bone Shield and Blood Debt clusters; the committed 2,015,029 /
2,103,820 / 2,105,703 / 2,017,274 / 2,106,638 / 2,101,867 / 2,015,770 /
2,104,758 / 2,084,304 / 2,100,867 / 2,111,469 / 2,008,597 (refused) /
2,020,278 and the opener's 2,425,025 / 2,428,096 / 2,418,659 (refused)); the re-pinned `m11b2-blood-bindings`,
`m11b2-blood-authority-data` (14 talents), `m11b6-blood-debt-stack`,
`m11b4-blood-aura-remains` and `m11b8-blood-ebq-remains`; the
`m11b2-blood-evaluator` contract (40 / 9 / 74; the three MATCH
individually with set, worlds, floor, deficit and no candidate; the
required UNKNOWNs; the B6 and B9 MATCH sets; the stack census with every
set two exact sorted members ≤ 7; the first-obstacle map) and
`m11b2-blood-registration` (16 / 3 / 29); one new corpus case
(`spec-blood-death-knight.essence-stacks-are-the-wires-absolute-counts-…`,
23 assertions) and the re-pinned measurement cases (the corpus is 43
artifacts / 160 cases / 663 assertions; `STACK_BINDING_AT` carries
`possibleStacks` and `windowOrderInvariance`); the invariance harness:
Assassination, Protection, Retribution, every raid night and every public
document unchanged. Blood stays INTERNAL_ONLY; M11-B is not complete.

---

### M11-B10 — Bone Shield: every exact count its own gains leave, the presence proven on both sides, the floor switched on

Three pieces, all Blood-owned, no shared change: the M11-B9 window set
generalized from one gain to a cluster of one or more (owner decision Q1:
the PREFIX set), an order-invariant presence proof read from M4 on both
sides of the cluster, and the M11-B8 remains bound switched on for the
identity (Q3; algorithm untouched). The maximum stays unguarded (Q2). No
public change; Blood stays INTERNAL_ONLY.

**The wire shape.** A Marrowrend's `trigger(3)` (effect 286519, base 3;
sc_death_knight.cpp:11720) is written as THREE `applybuffstack` at the
cast's own millisecond and ahead of it in the array, each carrying the
absolute resulting count, each after the first beside a same-millisecond
`refreshbuff`; a Death's Caress's `trigger(2)` (effect 1000766; :9770) as
one `applybuffstack`; the Dancing Rune Weapon's mirrors 10–35 ms AFTER the
cast; and at the maximum a trigger writes only a refresh. The only
consumption is `bone_shield_handler`'s `decrement()` on an auto-attack
TAKEN under the 2.5 s internal cooldown (:16629-16643) — another actor's
event. Over the bundle: 103 transitions (`applybuff` 1, `applybuffstack`
33, `refreshbuff` 44, `removebuffstack` 25 — every one with the absolute
remaining count, 7 beside a same-millisecond refresh — `removebuff` 0);
eight window clusters (seven own-gain clusters at lead 0, one plain
first application at lead 20), no removal inside any window, and no
damage-taken event targeting the actor anywhere in the corpus.

**The prefix set (Q1).** The decision may sit before all of its own
same-millisecond gains, between any two, or after all; a two-member
{ H1, cn } would silently exclude the intermediate worlds. So
`orderInvariantWindowStack` now admits a cluster of one or more ascending
`applybuffstack` gains with their companions (`windowClusterOf` names the
shape once, for the stack and the presence alike) and binds
`ONE_OF_NUMBERS { H1, c1, …, cn }`: H1 by the ordinary rule at the
cluster's first position with the set not admitted (the last
`applybuffstack` or `removebuffstack` carried only across companions — a
lone refresh before the cluster refuses, and a first gain in the track has
`AMBIGUOUS_INITIAL_STATE` before it and refuses), each `c` the wire's own
number, never `H1 + n`. A single gain yields the M11-B9 two-member set
unchanged, so Essence's corpus results do not move (the wire never writes
two Essence gains in one window). Each world is guarded separately (Bone
Shield's guard is off); a plain application beside a gain, a removal, a
lone refresh, a non-ascending count or a first gain not above H1 refuses.
The evaluator decides `stack<=1` and `stack<6` over the set exactly as
M11-B9 pinned; Blood writes no threshold.

**The presence.** `buff.bone_shield.up` is a boolean in `knownBuffs`, not
a reading of the set. For an identity whose new `presencePolicy` admits it
(Bone Shield only), `orderInvariantWindowPresence` reads M4 twice: the
ordinary binding at the cluster's first position (window presence not
admitted, so a nested window and the track's first application refuse)
and `presenceAt` at the decision; both EXACT ACTIVE binds `up: true` as
`WINDOW_ORDER_INVARIANT_PRESENCE`, anchored on the before-side reading.
Disagreement, either side UNKNOWN, or both INACTIVE (a shape a gain
cluster cannot produce) refuses. The stack rule reads the window BEFORE
the presence, so a window-proven presence never routes the count to the
ordinary "latest count" path, which would read the cluster's own
post-decision number.

**The floor (Q3).** `remainsPolicy.windowOrderInvariantBound` is true for
Bone Shield; `orderInvariantWindowBound` is byte-identical. Its H1 is
usually `GAIN_ANCHOR_BOUNDED` (the chain before a Marrowrend runs through
a refresh beside a charge removal); the floor is the smaller of that
projection and the reset, and the 1.5 s / 3 s tolerance still applies.

**The measurement (bundle 123 / 45 s 48 / opener 21).** 42 MATCH / 9
REJECTED / 72 UNKNOWN (B9: 40 / 9 / 74); 17 / 3 / 28 (16 / 3 / 29); 1 / 0
/ 20 unchanged. Decision for decision against B9: UNKNOWN → MATCH 2, every
other outcome, token and precision identical (MATCH 38 EXACT_ENTRY / 4
TOKEN_CONVERGED). The two: the Marrowrends at 2,043,209 ({ 7,8,9,10 } from
the `removebuffstack 7` at 2,038,654; presence ACTIVE both sides; floor
2,572 ms from the gains at 2,015,781) and 2,124,183 ({ 8,9,10,11 } from
the 8 at 2,120,436; floor 5,702 ms from the Dancing Rune Weapon's gains at
2,099,885) — `sanlayn[0]` FALSE (`up` 1, floor above 1.5 s, every member
above 1), `[1]` FALSE on `vampiric_strike.remains` 0, `[2]` FALSE on the
carried Runic Power deficit, `[3]`/`[4]` FALSE (every member at or above
6), `[5]` FALSE (Crimson Scourge proven down), `[6]` FALSE (Boiling Point
down), `[7] marrowrend,if=buff.blood_debt.stack=10` TRUE at Blood Debt
exactly 10, PROVEN_USABLE from the cast's own 3 / 4 Runes; no undecided
candidate. Still UNKNOWN once Bone Shield is passed: 2,057,622 ({ 11,12 })
and 2,085,352 ({ 8,9,10,11 }) on `sanlayn[9]` `fight_remains`, 2,151,502
({ 6,7,8,9 }) and 2,164,444 ({ 9,11 }) on `sanlayn[2]`'s Runic Power
deficit after a spend; 2,015,770 ({ 5,6,7,8 }) and the opener's 2,427,294
({ 7,9 }) inside the Gift window, where Bone Shield is never read; and
2,044,021, whose count the three lone at-cap refreshes at 2,043,229 break
(not a window case). The first `sanlayn[0]` blockers fall from 7 to 1.
Bone Shield census: exact counts 114, sets 7, ambiguous 1, refused 1;
presence order-invariant 7; floors 7. First blockers after B10:
`sanlayn[9]` `fight_remains` 10 + 12, Marrowrend usability 10, Essence
stack 7 (+ 2), `any_dnd` 5 + 1, Runic Power after a spend 5, `sanlayn[1]`
4 + 2, the Dancing Rune Weapon gate 3, `san_gift[2]` 3 + 1, Death Strike
usability 3 + 1, `buff.vampiric_strike.up` 2, Blood Boil usability 2,
`san_gift[0]` 1, Bone Shield lone refresh 1, Boiling Point 1.
`fight_remains` unmodelled; no resource work.

**Not built, on purpose.** No `H1 + 3`, no intermediate world dropped, no
ordering chosen, no set from a plain application, a removal or a lone
refresh, no count for a plain Bone Shield application even after a proven
removal (the producer's number is not pinned — Q2's sibling), no presence
from a count or from a gain's implication, no presence whose before-side
is silence, no change to the B8 bound, no removal-window model (no corpus
demand and no damage-taken stream to corroborate the cause), no Improved
Bone Shield extraction or guard (the observed 12 proves nothing), no
refresh-count carry, no `fight_remains`, no shared primitive.

**Proven.** `tests/unit/m11b10-blood-bone-shield-window.test.ts` (the
identity's three switches and nobody else's presence policy; one-, two-
and three-gain prefix sets at leads 0 / 1 / 50 with both ends and the
seam's `ONE_OF_NUMBERS`; the intermediate worlds kept; 51 ms on the
ordinary path; companions permitted not required; a Death's Caress { 9,11 }
with no invented 10; H1 from an `applybuffstack`, a `removebuffstack` and
a companion-refreshed gain; H1 across a lone refresh and H1 from silence
refused; non-ascending, not-above-H1, removal (plain, stack, mixed), lone
refresh, late refresh and plain-beside-gain clusters refused for the stack
and the presence alike; the track's first application and a proven
removal before a plain application binding nothing; presence ACTIVE /
ACTIVE bound, before-side `AMBIGUOUS_INITIAL_STATE` refused, the disagreeing
plain application refused, the nested window; Essence's presence still
refused; the floor at min(H1, reset) and the tolerance edge; the evaluator
over { 7,8,9,10 } (all FALSE), { 4,5,6,7 } (`stack<6` UNRESOLVED, the
rest decided) and { 1,2 } (`stack<=1` UNRESOLVED); Blood Debt untouched;
the committed seven clusters, 2,004,615, 2,044,021, the no-removal
invariant over both subjects and the opener's 2,427,294); the re-pinned
`m11b2-blood-bindings`, `m11b4-blood-aura-remains` (the window binds
order-invariant state, never an exact read), `m11b6-blood-debt-stack`,
`m11b8-blood-ebq-remains` (Bone Shield admits the same bound; Crimson
Scourge does not) and `m11b9-blood-ebq-stack` (a two-gain Essence cluster
is now { H1, c1, c2 }; a Bone Shield cluster binds its own set); the
`m11b2-blood-evaluator` contract (42 / 9 / 72; the two MATCH individually
with set, both ends, presence, floor, the entries above and Blood Debt 10;
the still-UNKNOWN four with Bone Shield passed; 2,044,021; 2,004,615; the
censuses; the first-obstacle map) and `m11b2-blood-registration` (17 / 3
/ 28); one new corpus case
(`spec-blood-death-knight.bone-shield-is-every-exact-count-its-own-gains-leave-…`,
28 assertions) and the re-pinned measurement cases (the corpus is 43
artifacts / 161 cases / 691 assertions; `AURA_BINDING_AT` admits the new
proof); the invariance harness: Assassination, Protection, Retribution,
every raid night and every public document unchanged. Blood stays
INTERNAL_ONLY; M11-B is not complete.

---

### M11-B12 — Blood Death Knight becomes publicly supported

The five-site move, two promotion-layer gates, and nothing else. No gameplay
rule, binding, authority reading or verdict changed: the bundle is still 42
MATCH / 9 REJECTED / 72 UNKNOWN, the 45 s slice 17 / 3 / 28, the opener
1 / 0 / 20, decision for decision.

**The five sites, in one reviewed edit.** `src/findings/spec-id.ts` (the
partition — `deathknight/blood` moves to `PUBLIC_SPEC_IDS`, the internal-only
set is empty again and its machinery stays dormant), the public contract's
own `specId` enum, `src/services/spec-identity.ts` (the table now resolves
`DeathKnight`/`Blood`, matched exactly: neither `Death Knight` nor
`Death-Knight` is the canonical string), the `satisfies PublicSpecId` on the
specialization's `spec.ts`, and the registration's `exposure`. The registry
validates that those sites agree; a catalog missing any of them fails closed.

**The one schema decision.** `warcraft-logs-coach.analysis/1` is unchanged
except for the additive `specId` widening, by the M10-D / M11-A5 precedent.
No outcome, basis, blocker class, exclusion reason, status or capability
value moved for a fourth specialization — Blood's view already projected
`MELEE_SWING` → `NON_GCD_ACTION` and `OUTSIDE_FIRST_SLICE` →
`OUTSIDE_SUPPORTED_SLICE`, both older than this milestone. Every Blood
evidence class built across M11-B4 … M11-B10 (order-invariant stack sets,
the presence proof, remains floors, Rune affordability, Blood Debt counts,
the censuses, the dispatch trace) stays INSIDE the payload;
`m11b12-blood-public-projection` scans every committed input for each of
them by name and for every withheld key.

**The validated-profile gate (owner decision T2).** Blood's evidence is two
sanitized San'layn captures. The pinned authority also carries a
Deathbringer list and the engine dispatches it correctly, but no Deathbringer
verdict has ever been measured, so `supported-profile.ts` admits exactly one
hero tree and the analyzer fails closed on anything else BEFORE reading a
decision: a resolved Deathbringer build is `AUTHORITY_NOT_AVAILABLE` (the
build is known; no validated authority applies), an unresolved or
contradictory tree is `PROFILE_NOT_RESOLVED`. Both are existing public
statuses — promotion added no status — and the gate reads the three-way
talent rule's resolution only: never the actions cast, never the aura set,
never the corpus.

**The wire-version guard (owner decision T3).** `resources.ts` resolved Runes
and Runic Power by scanning `RESOURCE_WIRE_CONTRACTS` directly, which was
invisible while the corpus was one parser version and wrong the moment a
capture was not. It now resolves both through the shared
`resourceWireTypeFor` with the capture's own `gameVersion` / `logVersion`
(`bloodWireKeys`), and a version no contract covers is `INSUFFICIENT_EVIDENCE`
with no fallback: a wire type read from the wrong parser version is a
different field, and every Rune and Runic Power fact downstream would be
fabricated from it. Protection and Retribution share the old unkeyed read;
that is recorded in `agent/follow-ups.md` and deliberately NOT fixed here.

**What promotion exposed.** REST `/v1/analysis` and the MCP
`analyze_warcraft_log` tool both dispatch the same row through the same
service (no Blood branch exists in either transport, the raid-night service,
the projections or the aggregation); `tools/list`, the supported-
specializations sentence and both tool descriptions are DERIVED from the
PUBLIC registrations and moved on their own. Raid night gained a Blood cell
with no orchestration change. The promotion evidence gate qualifies Blood in
PUBLIC mode with twenty-three assertions over six sanitized-capture cases —
real MATCH and real REJECTED, each recorded PASSED in the committed report,
paired THROUGH the identity table.

**Proven.** `m11b12-blood-supported-profile` (the four hero-tree answers and
their statuses; both real subjects San'layn; the wire types for the captures'
version; four foreign version keys refusing without naming a wire type; a
relabelled fight refusing as INSUFFICIENT_EVIDENCE with no resource evidence);
`m11b12-blood-public-projection` (schema v1 unchanged, the enum widened by one
id, the projection total, the pinned public totals, the slice's five tokens,
the cell reconciliation, three committed inputs scanned for thirty-plus
internal strings and twenty-two withheld keys, decision-for-decision
equivalence, the service/internal equality, the refusal documents);
`m11b12-blood-public-transports` (REST 200 with the scoped semantics and the
three REJECTED; the Arms Warrior and a Frost Death Knight still
SPEC_NOT_SUPPORTED; the bearer behaviour unchanged and leaking neither token;
MCP `structuredContent`, text and REST body deeply equal; the derived
description naming the validated hero tree and refusing "full rotation");
`m11b12-mixed-raid-night` (Blood alone and in a four-spec roster, one
discovery, one ingestion, one revision check, each analyzer once, every
neighbour's truthful PROFILE_NOT_RESOLVED, Arms SPEC_NOT_SUPPORTED, the cell
identical alone and in company); the re-pinned partition, registry,
capability, identity, contract, service, coaching-inventory, registration-list,
module-conformance, authority-ownership, second-registration and tools-list
suites; the corpus (162 cases / 692 assertions, a new PUBLIC_CONTRACT parity
case and the re-pinned APPLICATION_SERVICE case, two byte-identical workerd
runs). Assassination, Protection and Retribution are unchanged in the
committed report, row for row.

## M11-E1 — Observed Combat Facts (internal, post-hoc)

`src/combat-facts/` answers one question — "what did the observed combat
evidence establish?" — and never "was it good". It is the evidence substrate
for M11-G (causal damage disparity) and for the M11-ED/F enemy-set decision,
and it is internal: no public analyzer reads it, `analysis/1` is unchanged,
`scoresPerformance` stays false, and a contract test
(`tests/contracts/m11e1-combat-facts-layering.test.ts`) forbids any import of
it from outside, including from `src/simc` and `src/specs`. Post-hoc facts
(actual fight end, later damage, later target observations) can therefore
never satisfy a past decision's `fight_remains`, `time_to_die`,
`active_enemies` or target availability; the 281 predictive-atom lines found
by the post-D3 census remain an authority-verification limitation.

- Canonical facts are per event: `DamageObservation` and `CastObservation`
  (evidence locator, report time, source/target `ActorKey` =
  `(actorId, instanceId | null)` with null ≠ 0, ability, BEGIN and COMPLETE
  kept apart). Damage keeps its raw components named by their raw v2 key
  (`amountField`, `absorbedField`, `mitigatedField`,
  `unmitigatedAmountField`, `blockedField`, `overkillField`,
  `supportActorIdField`, ...), `hitTypeRaw`, and `tickField`. Absence is
  null / NOT_SUPPLIED, never 0 or false.
- Normalizer, additive only: `DamageEvent.tickField` (TRUE / FALSE /
  NOT_SUPPLIED / UNUSABLE_VALUE — absent is never false, and never "direct")
  and `DamageEvent.overkillAmount` (raw `overkill`, absent = null; no capture
  contains the key yet). `isTick` is unchanged for its consumers.
- M1 STATUS — NOT YET PROVEN. Proven: raw v2 `amount` → `requireNumber` →
  `DamageEvent.amount`, verbatim. Not proven: what raw `amount` means in
  Warcraft Logs' accounting. The RpgLogs Scripting API documents a
  `DamageEvent.amount` "excluding absorbs and overkill", but that is the
  Script Pins / Report Components object model — a derived surface whose
  fields differ from the raw v2 JSON (`source` vs `sourceID`, `isTick` vs
  `tick`, string `hitType` vs numeric, plus a separate `effectiveDamage`) —
  and `Report.events.data` is documented only as JSON "not considered frozen".
  So there is no "damage done", "effective damage" or average hit here: only
  raw-field measures (`RAW_AMOUNT_FIELD_SUM` is the sum of the raw `amount`
  scalar), with no relation among raw fields assumed.
- Ownership: Warcraft Logs `petOwner` is the only authority. Summon events
  are evidence, never ownership. `OWNER_ROLLUP` is a factual grouping by
  stated ownership — not a gameplay attribution — and always keeps the
  per-source-instance and per-member breakdown; unstated-owner pets observed
  in the window are disclosed, never rolled up.
- Owned-pet scope (owner decision M5): a capability may declare
  `ownedPetEvidence`; derived through the requirement and the scope
  derivation, it widens PLAYER_CONTEXT's vouch to actors whose `petOwner` is
  the focus actor and nothing else. No current analyzer declares it, so every
  existing requirement, derivation and ingestion request is byte-identical.
- Target metadata: `WCL_BOSS_SUBTYPE` means catalogued with subType Boss,
  excluding the `-1` sentinel (master data lists it NPC/Boss). Hostility and
  targetability are always UNKNOWN; an NPC is not an enemy.
- Observed activity: timestamped SOURCE/TARGET observations with their
  evidence category; `observationExtremes` is a convenience, not an interval
  of presence, life or targetability.
- Coverage before aggregation: a window fact is COMPLETE only when the
  category is OBSERVABLE, not decode-degraded, covers the whole `[start, end)`
  window, and vouches for every source actor in scope (and, for owner views
  and the boss filter, the catalog is COMPLETE). Scalars: EXACT needs
  COMPLETE; under PARTIAL a COUNT may be AT_LEAST (never "at least 0"), while
  raw-field sums, averages and rates are UNKNOWN, because no raw field's sign
  is proven. Collections (target sets, hitType distributions, cast-event
  sequences, evidence lists) are never AT_LEAST: they are
  `ObservedCollection`s, EXHAUSTIVE only under COMPLETE coverage and otherwise
  OBSERVED_ONLY — what was observed, with no claim about what else exists, and
  never a prefix (M11-E1.1).
- Window query: one half-open `[startMs, endMs)` primitive with
  DIRECT_PLAYER / SOURCE_ACTORS / OWNER_ROLLUP scopes, ability, target and
  boss-metadata filters, and per-measure coverage. Cast-family measures are
  about EVENTS, per phase: `CAST_BEGIN_EVENT_COUNT` and
  `CAST_COMPLETE_EVENT_COUNT` are never summed into "casts", and
  `CAST_EVENT_SEQUENCE` lists BEGIN and COMPLETE events separately, with
  locators, ordered by (report time, ingestion ordinal) with ties marked
  RETRIEVAL_ORDER_NOT_PROVEN_AUTHORITATIVE. None of this is an action or GCD
  sequence; a reviewed later contract may derive one (M11-E1.1). Results are plain, sorted data,
  independent of input order; sums use checked safe-integer arithmetic.
- Canonical evidence (M11-E2.1): the full-fight Blood Death Knight capture is
  committed to the EVIDENCE ARCHIVE as seven compact owned-pet segments plus
  its fight context. A test-support bundle composes them, with the context's
  master data as the actor catalog: ACTORS is COMPLETE and every capture-vouched
  category follows the grants.
  - The owned-pet scope (focus + WCL `petOwner` = focus) is an evidence-tooling
    concept: the slicer derives it and the corpus loader re-derives it.
  - Nothing in `src/` changed. Combat facts still learn ownership from the
    catalog alone.
  - The caller supplies any gameplay window, such as a Dancing Rune Weapon buff
    interval. The substrate never defines one.

## M11-F — narrow evidence primitives (positive deaths, active_dot)

Pinned SimulationCraft defaults at commit `33622e9d` (M11-F0, from
`engine/sim/sim.cpp`, sha256 `519bd104…`):

- `distance_targeting_enabled` is false (`sim.cpp:1548`), and so is
  `ignore_invulnerable_targets` (`:1549`; only DungeonSlice sets it).
- The default fight style is Patchwerk (`:1487`, `:2440`), with no raid events
  and one target.
- `active_enemies` is the constant 1 when the sim has one target and no
  `adds`/`pull` raid event; otherwise it is the live counter (`:3599-3608`).
- `fight_style.X` is a constant name comparison (`:3678-3682`).
- `spell_targets` falls back to `active_enemies` while distance targeting is
  off (`action.cpp:3878-3887`).

Semantic targets and rules:

- **`active_enemies` (N1).** "Encounter enemy units represented by the pinned
  authority profile that have arisen and not demised at decision D."
  Invulnerability does not remove a unit. Harmful-target readiness for
  `target_if` is a separate domain. `active_enemies` is never described as
  attackable, targetable, observed NPCs, WCL enemyNPCs or targets hit. Not
  implemented.
- **WCL enemy classification (N2).** `WCL_ENEMY_NPC_CLASSIFIED` /
  `WCL_ENEMY_PET_CLASSIFIED` are whole-fight participation metadata. They are
  post-hoc only: M11-G labels, Policy B drift checks, roster research. They are
  never authority evidence at D and never HOSTILE, ACTIVE_ENEMY, ATTACKABLE or
  TARGETABLE. Not ingested.
- **No future bracketing (O2).** For authority, an observation after D may never
  raise the proof state at D. Post-hoc analysis may report "the same instance
  was observed before and after t", never "available throughout".
- **Policy B (O3), approved and deferred.**
  - Curated encounter metadata will be pinned, versioned and provenance-bearing.
  - It will be keyed by encounter, difficulty and build or season, and be local
    at runtime.
  - It may give an upper bound, a closed roster or attackability windows.
  - Any contradiction with observed evidence yields UNKNOWN plus a drift
    diagnostic, never REJECTED.
- **Positive-only deaths.**
  - `death` decodes to `DEATH`, a fact about its TARGET ActorKey, with killer
    fields kept verbatim or `NOT_SUPPLIED`.
  - `src/engine/state/death-state.ts` answers `NO_POSITIVE_DEATH_EVIDENCE`
    (never alive), `DEAD_SINCE`, `RESURRECTION_OBSERVED`,
    `EVIDENCE_CONTRADICTION`, `UNREVIEWED_EVENT_AFTER_DEATH` or
    `ORDERING_AMBIGUOUS`. It reads only events at or before the query.
  - The only reviewed contradiction is a later hit carrying the SAME key's
    positive TARGET-side health snapshot. Aura changes, casts at the dead
    actor and the dead actor's own sourced damage are not contradictions.
  - `resurrect` has no committed evidence, so it stays `UNSUPPORTED_TYPE`,
    which makes the state UNREVIEWED after a death.
  - `DEATH_EVENTS_RETRIEVED_COMPLETE` is a separate retrieval fact. It never
    gives the absence of a death any meaning.
- **Evidence roots (N3).**
  - A citation is `SANITIZED_CAPTURE` (regression corpus) or
    `ARCHIVED_CAPTURE` (evidence archive: root, archive identity, fixture id,
    SHA-256).
  - A contract test resolves every archive citation against the root's
    manifest, recomputes the digest and checks the raw type.
  - Paths and arbitrary files are never accepted.
- **`active_dot.X` / `dot.X.active_dots`.**
  - The value is the number of target instances carrying THIS caster's DoT
    (`player.cpp:12118-12127`, `14356-14385`).
  - `src/engine/auras/aura-carriers.ts` decides each candidate target with
    `presenceAt` (FROM_SOURCE). A positive death after the anchor ends that
    target's DoT (`player.cpp:7219-7220`).
  - The count is a proven LOWER bound only. No upper bound is claimed, because
    no specialization pins a maximum carry duration.
  - `src/simc/expression/active-dot.ts` binds that bound as
    `BOUNDED_NUMBER`. It imports nothing from the engine.
  - Assassination maps Garrote 703 and Rupture 1943 from its pinned DoT
    dataset. Its one consuming line also needs `spell_targets` and stays
    refused, so no decision changes.
- **Normalization revision.** M11-F bumps `NORMALIZATION_REVISION` from `m3.2`
  to `m3.3`. The contract bumps on any change of normalized-model shape or
  meaning, additive changes included; it covers M11-E1, M11-F and the missed
  M10-C4 gear-model change. The public delta is raid-night/1 cell provenance
  only.
- **Consumers of death facts.** `tests/contracts/m11f-evidence-layering.test.ts`
  limits `death-state` to one importer (`aura-carriers`) and `aura-carriers`
  to one (the Assassination seam). That is a CURRENT-MILESTONE isolation guard.
  A reviewed M11-G tranche may add causal-analysis consumers of positive death
  facts by amending the allowlist explicitly. The permanent rules are:
  - evidence use is deliberate;
  - authority never consumes future or post-hoc evidence;
  - every new consumer comes with a reviewed dependency direction.
- **Raid `fight_style` binding (O7).** Approved, NOT implemented. The repository
  holds no authoritative raid-difficulty classification (`difficulty` is an
  opaque number everywhere, and `Zone.difficulties` was never captured), and
  difficulty ids must not be guessed.

## M11-G1 — observed performance and elite cohort evidence (internal barometer)

Evidence: seven sanitized archive artifacts from one capture of 7 GraphQL
requests (cap 14). See `tests/evidence/m11g1-cohort-capture.md`. Nothing in
`src/` imports this domain yet, and analysis/1 is unchanged.

- **ACTUAL_DPS** (`src/cohort/observed-performance.ts`).
  - It is `WCL_DAMAGE_DONE_TABLE_TOTAL_PER_FIGHT_SECOND`: the WCL DamageDone
    table `total` divided by the table `totalTime` in seconds.
  - It is accepted only when `totalTime` equals the fight's
    `endTime − startTime`. Otherwise it is `TABLE_TIME_IS_NOT_FIGHT_DURATION`.
  - When the subject has a report-rankings row, its amount must agree within
    0.01. Otherwise it is `RANKED_AMOUNT_DISAGREES`.
  - The row is not required (`NOT_RANKED`).
  - The pinned semantics: the full-fight denominator, with downtime and deaths
    not removed; equal to WCL's own ranked dps for 19/19 players. It is never
    computed from normalized raw `amount` events, so M1 stays NOT_YET_PROVEN.
  - Pet inclusion is corroborated, not proven.
- **Eligibility.** The subject must be a kill with a resolved specialization.
  Otherwise it is NOT_ELIGIBLE (NOT_KILL, KILL_UNKNOWN, SPEC_UNRESOLVED, or an
  unusable surface), and discovery stops after the subject request.
- **Rankings semantics** (`src/wcl/cohort`).
  - `characterRankings(…, bracket: b)` returns rows with `bracketData` in
    269+3b … 271+3b (`WCL_ITEM_LEVEL_BRACKET_3_WIDE_FROM_269`).
  - Every page is re-checked against that range; a mismatch stops discovery
    with BRACKET_SEMANTICS_MISMATCH.
  - `RankedCohortRow` is a separate G1 type that carries `amount`. M8's
    `RankingCandidateRow` still cannot.
  - The decoders fail closed (`PAYLOAD_UNRECOGNISED` with a named defect).
  - A member's gear goes through the shared adapter
    (`src/engine/normalization/combatant-info.ts`, the M10-C4 contract), so its
    enchants and gems are KNOWN / KNOWN_NONE / UNKNOWN states, never a raw null
    or a guessed empty list. A gear row the adapter cannot read is
    MALFORMED_EVIDENCE.
- **Selection** (`src/cohort/cohort-selection.ts`, `cohort-discovery.ts`).
  - Rungs: ±3 item level / ±5% duration, then ±10%, then ±15% duration, then
    item level ±6 and ±9 (`COHORT_SELECTION_CONFIG`). Every widening step is
    recorded.
  - Rows are ordered by amount descending, then report code, fight id and name.
    Candidates are qualified in that order until three qualify, so the cohort
    is the three highest-DPS qualifying kills, never the nearest.
  - Every row considered is recorded as QUALIFIED, NOT_REACHED, or an
    exclusion: HIDDEN, ANONYMOUS, SUBJECT_ITSELF, SOURCE_UNRESOLVED,
    SOURCE_AMBIGUOUS (M8-F identity rule), SPEC_MISMATCH, NOT_KILL,
    DIED_BEFORE_END (a Deaths-table entry at or before fight end),
    DURATION_OUTSIDE_WINDOW, ILVL_OUTSIDE_WINDOW, CONTEXT_UNAVAILABLE or
    MALFORMED_EVIDENCE.
  - Outcomes: 3 → OK with median, min and max; 2 → RANGE_ONLY (range, no
    median, no outlier claim); fewer → INSUFFICIENT.
  - The request budget is checked before every call. Reaching it is
    INSUFFICIENT / REQUEST_BUDGET_EXHAUSTED, never a partial claim.
- **Barometer only.** `ObservedCohortEvidence` carries facts and provenance. It
  sets no ceiling, measures no execution loss, makes no APL verdict, scales
  nothing, and never fetches a comparison player's events. The cohort domain
  imports no SimC, specialization, finding, analysis or report module, and no
  module outside it imports it (`tests/unit/m11g1-cohort-boundary.test.ts`).
- **Terminology.** WCL enemy classification remains `WCL_ENEMY_NPC_CLASSIFIED`.
  G1 introduces no HOSTILE, ATTACKABLE or TARGETABLE state.
- **Identities.** A live report may show a member's real name, server, DPS,
  item level, duration and log reference (`liveIdentity`, `comparisonRef`).
  Committed evidence is pseudonymized by `scripts/corpus/sanitize-g1-cohort.mjs`.

## M11-G2 — factual damage ledgers, cooldown windows, sub-actor trees (post-hoc)

Evidence: the three G1 comparison fights at E2 parity, under a one-time,
byte-pinned size exception. See `tests/evidence/m11g2-comparison-capture.md`.
The subject is its M11-E2 fixture and was never re-fetched.

- **Capture** (`src/wcl/comparison/comparison-capture.ts`).
  - A capture tool, never an analyzer path. Per fight: the production
    `FIGHT_CONTEXT_QUERY` with the identity gate; the owned-pet actor set from
    WCL `petOwner` only; event pages carrying ONE server filter; and one
    composed table request.
  - Budget: the plan's worst case is checked before the first request, and every
    request is checked again at runtime.
  - The subject's report is refused before any request.
  - **Pinned by diagnosis.** In WCL's filter language `source.id` / `target.id`
    are the catalog gameID, and `owner.id` reaches owned pets. Missed damage is
    not `type = "damage"`. So the filter addresses the focus's gameID and
    EXCLUDES the never-requested types. It is a superset; slices are re-cut
    offline with the E2.1 predicate.
- **Certification** (`src/wcl/comparison/comparison-tables.ts`).
  - Fail-closed table decoders. A player's DamageDone is an owner rollup whose
    leaves name their true source. Composite entries are flattened. Window
    tables carry their recorded bounds.
  - Certificates compare events with one table per actor and direction. A
    category is CERTIFIED only if every certificate feeding it, for every actor,
    MATCHES.
  - Nothing certified: tables omit melee, pet casts, Spirit Link, some
    trinket damage, and pets' damage taken. So every G2 slice withholds its
    grants (`actorSlice.grantsWithheld`).
  - The loader now enforces the documented rule that a filtered capture retains
    no coverage (`FILTERED_CAPTURE_GRANTED`). The composer accepts all-ungranted
    bundles, with every category ABSENT.
- **Facts domain** (`src/comparison-facts/`, POST-HOC).
  - `evidence-basis`: COVERAGE_VOUCHED (the subject; E1 coverage decides) vs
    UNCERTIFIED_FILTERED_CAPTURE (comparisons: PARTIAL semantics — AT_LEAST
    counts, never "at least 0", raw sums UNKNOWN, collections OBSERVED_ONLY).
  - `damage-ledger`: cells keyed by (slice, source ActorKey, ability, target
    ActorKey). The raw sum is always `RAW_AMOUNT_FIELD_SUM`, M1 NOT_YET_PROVEN.
    WCL-computed amounts are separate records (`WCL_DAMAGE_DONE_TABLE`,
    `WCL_RAID_DAMAGE_DONE_TABLE`), each with its interval.
  - `target-classification`: `WCL_BOSS_SUBTYPE`, `WCL_ENEMY_NPC_CLASSIFIED`
    (whole-fight participation metadata), `OBSERVED_NPC_OTHER`,
    `OBSERVED_PLAYER_TARGET` (never an enemy), `OTHER_OBSERVED_TARGET`.
    Hostility and targetability are always UNKNOWN.
  - `cast-facts`: BEGIN and COMPLETE are counted apart. Equal timestamps are
    marked RETRIEVAL_ORDER_NOT_PROVEN_AUTHORITATIVE.
  - `cooldown-windows` (generic): windows are observed aura transitions on the
    focus from the focus. An unobserved bound is UNKNOWN, and no nominal
    duration is ever substituted. Trigger casts are AT_WINDOW_START (within the
    definition's tolerance), DURING_ACTIVE_WINDOW, or NO_OBSERVED_WINDOW.
  - `sub-actor-tree`: children are `petOwner` only and kinds come from the spec's
    gameID map. Summons are observations only. Each instance's window
    association is temporal, with ambiguity kept.
  - `environment-profile`: positive deaths (M11-F) only.
  - `fight-facts` / `four-fight-report`: the internal side-by-side.
- **Blood definition** (`src/specs/deathknight/blood/post-hoc-definition.ts`).
  - Data only: cast 49028 from the pinned SimC DBC cooldown dataset; aura 81256
    from the aura authority (applied by casts AND procs: 17–19 windows against
    4 casts per fight); 5 ms association tolerance (observed jitter ≤ 2 ms).
  - Pet kinds by WCL catalog gameID: 27893 Rune Weapon, 217228 Blood Beast,
    26125 Risen Ghoul.
- **Layering.**
  - `tests/contracts/m11g2-comparison-facts-layering.test.ts`: the authority
    branch reads neither G1 nor G2 evidence, and no G2 module has a word for a
    judgement.
  - The E1 combat-facts guard and the M11-F death-state guard were amended
    explicitly to name `src/comparison-facts/` as their reviewed M11-G consumer.
  - The normalization-boundary contract names the capture tool as a third
    raw-array holder below the boundary.

## M11-G3-1 — pinned SimulationCraft runner and result contract

Model: SimulationCraft `33622e9d1662ff0e451691edf85a6b49cc9d11d9`, client data
`12.1.0.69587` (`src/simulation/model.ts`). Self-hosted thin runner (G3-0). No
Raidbots API, no simulator of our own. Nothing here produces a finding.

- **Engine artifact** (`runner/simc-build/`).
  - The official recipe, with documented deviations: Alpine pinned BY DIGEST in
    both stages, a git checkout of the exact commit (so the binary embeds its
    revision), `SC_NO_NETWORKING=1` (no libcurl), no API key, an unprivileged
    runtime user and toolchain manifests.
  - `build.mjs` writes `build-record.json`: base digest, build arguments,
    toolchain, image id and the binary SHA-256 measured twice.
  - An artifact is APPROVED (`runner/approved-artifacts.ts`) only after the
    engine's own JSON identity is verified. The nightly and Windows builds are
    never substitutes. With no approved artifact the runner answers
    RUNNER_UNAVAILABLE.
  - **Built and verified 2026-10-14.**
    - Image `sha256:8ab91e72…aaf4`, built on Alpine 3.24.2 (pinned by digest)
      with clang 22.1.3 in 2,079 s.
    - Binary `41347bc4…cb77`; the build-stage and final-image hashes agree.
    - The engine's own JSON reports `git_revision` `33622e9d16`, client data
      12.1.0.69587 (`Live`) and `no_networking: true`.
    - The binary starts in a runtime image that contains no libcurl.
    - Golden artifact: `tests/fixtures/simulation/simc-33622e9d-blood-dev-standard.json`
      (a 17.9 KB projection; the raw report's SHA-256 is recorded inside it).
- **Identity** (`model.ts`). From the engine's JSON: `git_revision` must be
  ≥ 7 hex characters and a prefix of the commit; the client data comes from
  `dbc.Live.wow_version` with `version_used` Live; `no_networking` must be
  true. The runner computes the SHA-256 of the binary it executed. Any
  disagreement is MODEL_PROVENANCE_MISMATCH. File names and tags are never
  trusted; the Docker launcher refuses tags.
- **Job** (`job.ts`, `simulation-job/1`).
  - Strict zod and structured data only. No field can carry SimC text,
    including paths, includes, `$(…)`, APL, raid events, outputs, sources,
    profilesets or overrides.
  - Consumables, raid buffs and Bloodlust are explicit
    (`ACTUAL_OBSERVED | DEVELOPMENT_FIXTURE`). There is no ideal default.
  - `additionalTargets` accepts no element (ENVIRONMENT_NOT_REPRESENTABLE), so
    an engagement span never becomes availability.
  - Limits: payload ≤ 256 KB, iterations ≤ 20,000, timeout ≤ 60 s. The job's
    policy must equal the registry entry.
- **Spec ownership.** `src/simulation/` names no specialization. Blood's engine
  tokens live in `src/specs/deathknight/blood/simulation-binding.ts`. The
  runner is the composition root (`runner/spec-bindings.ts`). An unbound spec is
  UNSUPPORTED_SPEC.
- **Input builder** (`input-builder.ts`). The only SimC text writer. It is
  deterministic: fixed names (`Subject` / `Target`), no paths or timestamps, and
  `strict_parsing=1`.
  - `optimal_raid=0`, then every override is written explicitly.
  - Bloodlust is written as the observed time or `override.bloodlust=0`. The
    engine checks every 1 s, so the effective time is the next whole second.
  - NONE consumables are written as `disabled`, because an empty value means
    the class default.
  - Duration uses `fixed_time=1`, `vary_combat_length=0` and the exact
    `max_time`. This is a CEILING ASSUMPTION: `fight_remains` is perfect
    information.
- **Times are integer milliseconds.** The pinned engine parses a timespan as
  `trunc(stod(text) * 1000)` (`util/timespan.hpp:74`).
  - Derived stddevs are therefore 1 / 37 / 62 ms, not 1.25 / 37.5 / 62.5. The
    profiles hold the effective values, and the JSON echo agrees.
  - About 1% of exact decimal texts truncate one millisecond short (for example
    "1.001" becomes 1000). The builder then writes the half-millisecond
    midpoint, and verifies the round trip for every value it emits.
- **Tank model** (`tank-model.ts`). STANDARD_TANK_LOAD_V1 is
  `tank_dummy` + `tank_dummy_type=mythic`: level +3, Mythic armor, the engine's
  tank action list and its `tank_heal` event. It is a standardized input,
  never a reconstruction of intake.
- **Execution profiles and policies.**
  - Profiles: SIMC_DEFAULT_PINNED (engine defaults written out), plus
    ELITE_REALISTIC_CANDIDATE_A and _B, which are PROVISIONAL (G3-3 decides).
  - Policies: STANDARD_SIM_V1 (2,000 iterations, 8 threads) and
    PRECISION_ESCALATED_V1 (8,000 iterations, 8 threads) are CANDIDATES
    pending the exact-pin benchmark. The BENCHMARK_* policies measure only.
  - All policies are deterministic, with a fixed seed, iterations and threads,
    and no `target_error`. Thread count is part of identity, because seeds are
    `seed + thread`.
- **Parser** (`result-parser.ts`, SIMC_JSON_2_PARSER_V1). Report 2.0.0 only, up
  to 5 MB. Before reading any number it checks, in order:
  1. provenance;
  2. the full options echo (iterations, threads, seed, determinism, duration,
     every timing, override flags and the lust time);
  3. the actors (one bound player with the job's level, race, talents and item
     ids; one `Target`; no raid event except `tank_heal`);
  4. no engine log, a fixed simulated length and a sane counted total;
  5. DPS greater than 0;
  6. the precision gate (SIMULATION_PRECISION_NOT_MET).

  Two report facts were settled on the real engine:
  - `options.seed` is NOT an echo. With `deterministic=1` the engine reseeds
    at every iteration reset (`sim.cpp:1810`), so the report carries the last
    reseed. The configured seed's effect is proven by reproduction instead.
  - Items without stats (the cosmetic shirt and tabard) are omitted from the
    gear echo (`report_json.cpp:387`). Those two slots may be absent but must
    match when present; every other slot must be echoed.

  Raw JSON is not the contract; `SimulationResult` (`result.ts`) is.
  Reproduction compares semantics under a 1e-9 relative tolerance, and
  `diagnostics` is ignored.
- **Hashes and keys** (`canonical.ts`, `cache-key.ts`).
  - WebCrypto SHA-256 over canonical JSON. The profile and environment hashes
    cannot contain a name, report or path.
  - The engine-run key covers: job schema, commit, client data, binary, recipe,
    builder revision, spec binding, both hashes, execution profile (id, version,
    settings), policy, iterations, seed, threads and outputs.
  - The parsed-result key adds the parser revision.
- **Runner** (`runner/`). One path: `prepareSimulation` → limits → job slot →
  launcher → parser.
  - Process: no shell, a fixed argument vector, a private temp directory
    (always removed) and an empty environment. On Windows, libuv still adds its
    fixed required set.
  - Limits: SIGKILL at the wall-clock cap (`docker kill` too), capped stderr,
    output size checked before reading, and host paths stripped from failure
    details.
  - Docker launcher: `--network none --read-only --cap-drop ALL`, plus
    no-new-privileges, pids, memory and CPU caps.
  - Failures: `RUNNER_OVERLOADED` (no queue), `JOB_REJECTED` (threads above
    the core limit), `CANCELLED` and `RUNNER_UNAVAILABLE`.
  - The same job, builder, verifier, parser and result serve local and remote
    runs; only the launcher differs.
- **Pet map audit** (pinned `sc_death_knight.cpp`, audit only).
  - `blood_beast` ↔ 217228 is engine-derived (spell 434237 effect 1
    `misc_value1`).
  - `dancing_rune_weapon`, `everlasting_bond` and `dance_of_midnight` set no
    npc id, and all three plausibly correspond to WCL's Rune Weapon (27893).
    That is AMBIGUOUS, not mapped.
  - `ghoul` ↔ Risen Ghoul (26125) is NOT ESTABLISHED (no npc id at the pin).
  - Pets are reported by engine name only; DPS parsing does not depend on
    them.
  - On the real development job, `stats_pets` held only `dance_of_midnight`
    and `everlasting_bond`.
- **Not in G3-1.** Race (the development fixture states one), WCL profile
  reconstruction, fight environment, adds, ceilings, configuration search and
  coaching.
- **Exact-pin benchmark** (i7-9750H, 12 logical cores, Docker Desktop/WSL2;
  development Blood job, 345.177 s, SIMC_DEFAULT_PINNED; wall time includes
  container start).

  | Policy | Threads | Counted | Mean DPS | Rel. SE | 95% CI ± | Engine s | Wall s |
  | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
  | BENCHMARK_300_T1 | 1 | 299 | 82,228.3 | 0.207% | 0.405% | 4.2 | 5.2 |
  | STANDARD_SIM_V1 (2k) | 8 | 1,992 | 82,330.6 | 0.077% | 0.150% | 9.0 | 10.2 |
  | BENCHMARK_2K_T12 | 12 | 1,988 | 82,323.0 | 0.077% | 0.150% | 6.8 | 7.7 |
  | BENCHMARK_5K_T12 | 12 | 4,988 | 82,296.8 | 0.049% | 0.095% | 13.9 | 14.8 |
  | PRECISION_ESCALATED_V1 (8k) | 8 | 7,992 | 82,287.2 | 0.038% | 0.075% | 18.9 | 19.7 |
  | BENCHMARK_10K_T12 | 12 | 9,988 | 82,285.7 | 0.034% | 0.067% | 23.8 | 24.6 |

  - Per-iteration σ is 3.42% of the mean, and counted = iterations − threads.
  - Container and startup overhead is 0.7–1.2 s, and the JSON is about
    0.8–0.85 MB.
  - Engine time for the same 2k/8-thread job varied between 4.7 and 9.0 s
    across runs (host load).
  - Determinism: the same 8-thread job twice differs by 2.7e-15 relative; the
    1-thread job is bit-identical.
  - **Recommendation:** keep STANDARD_SIM_V1 at 2,000 iterations / 8 threads
    and PRECISION_ESCALATED_V1 at 8,000 / 8.
    - Their relative-SE gates (0.12% / 0.06%) hold with margin (observed
      0.077% / 0.038%).
    - A difference of two STANDARD results has a 95% CI of about ±0.21%, well
      inside the 0.5% materiality threshold.
    - Both fit the 60 s cap and the 1–2 minute report target.
    - The policies stay CANDIDATE until the owner confirms them.
- **Execution-profile finding (for G3-3).** ELITE_REALISTIC_CANDIDATE_A and
  _B produced DPS bit-identical to SIMC_DEFAULT_PINNED for Blood.
  - Player reaction time is sampled only for `reactable` buffs
    (`buff.cpp:2697`), and the pinned Blood APL has no `.react`.
  - So reaction-only candidates are inert for Blood. Realism for Blood must
    come from lag, queue and cooldown-tolerance parameters.
- **G6 note.** One-GCD differentials are not supported.
  - On the pin, 2,000 iterations give a relative SE of 0.077% (95% CI
    ±0.15%).
  - One filler GCD in a 345 s fight is about 0.4% of all GCDs, and the
    difference between two adjacent choices is far smaller. A changed decision
    also desynchronises the RNG streams, so the noise is not paired.
  - Only whole-policy, cooldown-policy and configuration variants are
    resolvable against the 0.5% materiality threshold.
- **Layering** (`tests/contracts/m11g3-simulation-layering.test.ts`).
  - `src/simulation/` imports only zod and itself: no Node, no APL, authority,
    spec, comparison or combat-facts code, and no verdict vocabulary.
  - The runner reaches `src/` only through `src/simulation/` and spec bindings.
  - No simulation code has first/last-hit vocabulary.
  - `types/node-builtins.d.ts` grew a marked runner section (`spawn`, a binary
    `readFileSync`, `statSync().size`, byte hashing, `cpus`), instead of adding
    `@types/node`.

## M11-G3-2 — exact logged character reconstruction and fidelity gate

Question: can the character observed in the canonical fight be rebuilt as a
typed SimulationCraft profile without silently changing its setup?

Subject: b1PmaKrd6CDfzngc fight 48, actor 15, from committed E2 evidence only.
Model: the approved G3-1 artifact (binary `41347bc4…`). There is no ceiling,
no optimization and no coaching; a fidelity probe's DPS is never a result.

- **Domain** (`src/character-profile/`, spec-agnostic).
  - `CharacterProfile` (`character-profile/1`). Every field is KNOWN,
    KNOWN_NONE, UNKNOWN, NOT_APPLICABLE or a versioned MODEL_ASSUMPTION, and
    carries an evidence source.
  - Reconstruction blockers: spec unresolved or mismatched; talent import
    missing, invalid or not reconciled; WCL talent tree missing; hero tree
    unresolved, contradictory or mismatched; an unreadable gear row; a
    missing stat-bearing position; unknown item level, bonus ids, gems or
    enchant on a stat-bearing item; an unknown required enchant; race
    unresolved.
  - Only a fidelity MATCH on a blocker-free profile is SIMULATION_READY.
- **Spec meaning** (`src/specs/deathknight/blood/character-binding.ts`).
  Injected by the runner (`runner/character-bindings.ts`):
  - spec 250 / class 6, the shared class-6 loadout table and Blood's hero-tree
    resolver;
  - the main-hand runeforge as required setup;
  - tier-set markers cited to `sc_death_knight.cpp:15245-15248`. MID1's
    4-piece has no engine-reported spell, so it has no marker.
- **Evidence isolation.** Each input (snapshot, talent import, pull facts,
  casts) carries its actor. A foreign actor is EVIDENCE_ACTOR_MISMATCH, so
  comparison players can never fill a subject field.
  - The import code's actor comes from the committed context's manifest
    provenance (`sourceActorId` 15), not from a test bundle's focus.
- **Talents** (`src/data/game/talent-loadout.ts` + the shared, class-keyed
  `trait-loadout-tables.json`).
  - The import string is decoded exactly as the pinned
    `parse_traits_hash` does it. The node walk comes from the machine-extracted
    trait table (206 nodes, 230 entries, source SHA-256s matching the Blood
    talent dataset). Choice indices follow insertion order, a TIERED node's
    rank is spread over its tiers, and every engine error is a typed failure.
    Data-level agreement is RECONCILED / DIVERGED: `src/data` keeps no
    MATCH vocabulary (the m5 rule).
  - Subject: version 2, spec 250, and 78 entries reconciling with
    `combatantinfo.talentTree` exactly (ids, nodes, ranks), including the
    three Dance of Midnight tiers. Hero sub-tree 31 (San'layn) on both sides.
- **Gear.** One map: WCL position → canonical slot → engine slot
  (`gear-slots.ts`). Ids go to the engine verbatim; `ilevel=` and
  `crafted_stats=` overrides are never written.
  - The engine reorders bonus ids, so they compare as multisets.
  - Shirt and tabard (no stats) need not be echoed but must match if they are.
    With unknown fields they stay evidence only.
  - Crafted secondary stats travel in the bonus ids. The engine decodes 8790
    as crit/haste and 8792 as versatility/haste.
- **Engine echo** (`src/simulation/profile-echo.ts`). Read only after
  `parseSimcJson` accepts the report:
  - per item: id, decoded item level, bonus/gem/enchant ids;
  - the talent string and race;
  - every engine-reported spell id (buffs, actions and child actions);
  - stats at pull.
- **Fidelity probe** (`fidelityProbeJob`, `runner/run-fidelity.ts`).
  - Job kind LOGGED_FIDELITY_PROBE, policy FIDELITY_PROBE_V1 (200 iterations,
    4 threads, 300 s, precision not gated).
  - Consumables, raid buffs and Bloodlust are FIDELITY_CONTROL: nothing. The
    job schema refuses any value under that provenance, and FIDELITY_CONTROL
    and race `none` on any other job kind.
  - Golden echo: `tests/fixtures/simulation/simc-33622e9d-blood-subject-fidelity.json`
    (20.9 KB).
- **Subject result.** PARTIAL / NOT_SIMULATION_READY.
  - MATCH: spec, talents, hero tree, gear, item levels, bonus ids, gems,
    enchants (runeforge 6241), and set bonus (WCL set 2055 ×5 → engine MID2
    2pc + 4pc).
  - UNRESOLVED: race.
  - Semantic profile hash `994b04ef…ebc5`.
- **Level.** MODEL_ASSUMPTION `LEVEL_IS_PINNED_ENGINE_MAX_LEVEL@1` (90,
  `engine/config.hpp:176`). No WCL field carries level.
- **Race audit.**
  - No committed field carries race, and none of the 11,869 subject events is
    one of the pinned engine's 181 racial spells. Name, realm and shipped
    profiles are never used.
  - At the pin, race changes base attributes, passive racials and APL racial
    actions (Fireblood, Blood Fury, Berserking, Ancestral Call).
  - Development Blood job, 2k iterations: the races span −0.16% (Vulpera) to
    +1.35% (Troll) relative to `race=none`, and `race=none` sits 0.6–1.0%
    below most races. So `none` is not neutral, and the spread is about 3× the
    0.5% materiality threshold.
  - Therefore RACE_UNRESOLVED blocks readiness, and the probe uses the
    explicit engine race `none` only to read gear and talents back.
- **Stat semantics.** WCL `combatantinfo` stats are BUFFED pull stats.
  - With `flask_of_thalassian_resistance_2` the versatility residual is
    exactly 0 (rank 1 leaves 14).
  - Stamina carries Power Word: Fortitude, and armor matches to 0.3.
  - Unexplained: haste +245 and mastery −231 against the probe. Two pull
    auras (food 1285644 "Hearty Well Fed", 1296934 "Fury of the Dead") are
    absent from the pinned spell data.
  - Stats are therefore STAT_RECONCILIATION_NOT_PROVEN: a diagnostic with
    residuals, never a gate.
- **Consumables** (setup evidence for G3-4, not written to the profile;
  `src/data/game/consumables.json`, machine-extracted).
  - Flask KNOWN (aura 1235057, rank open).
  - Potion KNOWN (cast 1236994, Potion of Recklessness, rank open).
  - Food UNKNOWN (the aura is not in the pinned data).
  - Augment rune UNKNOWN.
  - Weapon oil KNOWN: enchant 8052 → `thalassian_phoenix_oil_2`.
- **Model version.** The log (2026-10-01) postdates the pinned hotfix data
  (2026-09-10), and its client build is not in evidence. That gives
  MODEL_VERSION_COMPATIBILITY_UNKNOWN as a diagnostic.
- **Layering.**
  - `tests/contracts/m11g32-character-profile-layering.test.ts`: the domain
    imports only shared primitives and names no spec. It has no
    finding/coaching/verdict, racial-action, trinket-usage or add vocabulary.
  - The G3-1 simulation guard was amended explicitly to allow
    `src/character-profile/` and spec character bindings.

## M11-G3-3 — ELITE_REALISTIC_V1 execution profile (frozen)

One shared, standardized execution profile: an elite player executing the
pinned APL under realistic game and input timing. It is not player-specific
and not fitted to any DPS or log. Runtime: the approved G3-1 artifact.

- **The pinned semantics that decide it** (pinned source).
  - `strict_gcd_queue` OFF: every GCD action takes the queued branch and starts
    `queue_lag` (5 ± 1 ms effective) after the GCD/cast becomes available
    (`player.cpp:6942-6990`). This is the in-game spell queue, used well.
    `gcd_lag` and `queue_gcd_reduction` apply only with the strict queue ON.
  - `channel_lag` applies after a completed channel. World lag delays a
    cooldown only above 400 ms, and also the GCD reset after an interrupted
    cast and a channel's auto-attack reset.
  - `cooldown_tolerance` is the cooldown queue window (`cooldown.cpp:655`).
    Aura delay delays every in-combat buff trigger (`buff.cpp:295, :2138`).
  - Player reaction = `min(max, offset + ExGauss(μ, σ, ν))`
    (`player.cpp:7763`). It is sampled only for buffs made reactable by
    `buff.<x>.react` / `react_pct` (`buff.cpp:480-530, :2697`).
  - The sim-level `reaction_time` covers non-player auras. `brain_lag` feeds
    only the `cast_delay` expression. `skill` < 1 adds false-positive and
    false-negative action rolls (`action.cpp:1326-1365`).
  - `enable_spell_queue` picks the next action before a cast ends, on stale
    state. `ready_trigger` replaces the ~100 ± 10 ms wait poll
    (`player.cpp:7130`).
- **Millisecond rule, re-verified on the binary.** A configured `0.0375` runs
  and echoes as 0.037 s. Every profile time is an integer effective
  millisecond.
- **Decisions.**
  - `strict_gcd_queue` OFF. ON adds a ~150 ms post-GCD gap that pre-queueing
    removes: −10.6% on Blood.
  - `queue_lag` kept at 5 ± 1 ms. A deliberately imperfect 30 ± 10 ms queue
    (ELITE_CANDIDATE_QUEUE) costs −1.61% and contradicts "excellent
    execution".
  - Reaction: 100 ms + ExGauss(200, 40, 100) ms, mean 400 ms, cap 1.4 s. This
    is a PRODUCT_EXECUTION_ASSUMPTION: the engine's generic 500 ms shape and
    20% σ/μ, 20% faster. Not fitted.
  - World lag 100 ± 10, aura delay 30 ± 5, cooldown tolerance 250 and sim
    reaction 500 are kept: STANDARDIZED_ENVIRONMENT_ASSUMPTION, server
    behaviour rather than skill, never the user's latency.
  - `brain_lag` 0 and `skill` 1: the APL is executed correctly.
  - `channel_lag` 250 ± 62 ms is kept (pinned).
  - Spell queue off; `ready_trigger` off (polling, a non-zero wait response).
- **Definition** (`src/simulation/execution-profiles.ts`).
  - `ELITE_REALISTIC_V1` v1 is the only PRODUCTION profile: a complete,
    deep-frozen literal, not built from the pinned-default helpers.
  - Revision `5692cfece9870b95028ed41ebada3bf858c624e5a8d784ce677eada203d9190c`
    (`executionProfileRevision`: id, version and every effective setting).
  - SIMC_DEFAULT_PINNED v2 is the reference. It adds explicit
    `enable_spell_queue`, `spell_queue_window` and `ready_trigger`, and
    reproduces G3-1's 82,330.6 exactly.
  - EVALUATED_CANDIDATEs: QUEUE, REACTION (= V1's settings) and COMBINED. The
    G3-1 provisional A/B are retired.
- **Identity.** Builder `simc-input-builder/2` writes the three new player
  options, and parser `SIMC_JSON_2_PARSER_V2` checks the `ready_type` echo.
  - Results record `executionProfile {id, version, revision,
    effectiveSettings}`.
  - The cache key carries the revision, so two profiles with identical
    settings and different ids never share a key.
- **Activity** (`execution-activity.ts`, spec facts in
  `src/specs/deathknight/blood/execution-facts.ts`). Classes are
  ACTIVE_FOR_THIS_APL, INACTIVE_FOR_THIS_APL, ENGINE_GLOBAL and CONDITIONAL,
  from semantics.
  - Blood: reaction and brain lag are inactive (no `.react` or `cast_delay`).
    `channel_lag` is CONDITIONAL on the Consumption talent, Blood's only
    channel. `gcd_lag` is inactive.
  - A one-field-at-a-time single-thread engine check confirmed every
    classification (identical vs changed results). `travel_variance` is active
    for Blood.
- **Blood benchmark** (development job, STANDARD_SIM_V1, descriptive only).
  - Pinned reference = V1 = REACTION = 82,330.6 (relative SE 0.077%).
  - QUEUE = COMBINED = 81,005.8 (−1.61%): fewer Blood Boil and Blood Plague
    applications.
- **Non-Blood sanity** (probe-only raw input: the engine's default APL and
  default talents, no gear).
  - Fire Mage (`buff.hot_streak.react`): the V1 reaction differs from pinned
    (+0.07%), so reaction is active.
  - Arcane Mage (Arcane Missiles channel): `channel_lag` 0 vs 250 ms is +3.7%,
    so it is active and material for channellers.

## M11-G3-4 — fight environment reconstruction and publishability gate

Answers one question: can enough of the ACTUAL logged fight environment be
reconstructed to simulate this pull without fabricating conditions? It
produces an environment, a readiness and a publishability decision. It
publishes nothing: no ceiling, attainment, loss estimate or coaching (G4 owns
publication, G5 optimization, G6 attribution).

- **Domain** (`src/environment/`, spec-agnostic). FACTUAL RECONSTRUCTION
  (`reconstruct.ts`) is separate from SIMC TRANSLATION (`translate.ts`), and
  the translation targets the existing G3-1 `SimulationEnvironmentInput` plus
  the job's consumables block. There is no second environment model.
  - Every component is an `Evidenced<T>` (KNOWN / KNOWN_NONE / UNKNOWN /
    NOT_APPLICABLE / MODEL_ASSUMPTION), with fight-relative times.
  - `EnvironmentReconstructionResult {status READY | PARTIAL |
    NOT_REPRESENTABLE, checks, blockers, diagnostics, assumptions,
    provenance}`. Environment readiness is independent of the character
    profile's.
- **Inputs.** The normalized fight with its completeness, the subject's pull
  facts, its temporary enchants and the spell ids its own talents own. Each
  carries its actor id; a foreign actor is EVIDENCE_ACTOR_MISMATCH.
- **Duration.** The exact committed interval (345,177 ms for the subject) →
  `fixed_time=1`, `max_time=345.177`, `vary_combat_length=0`, no target-health
  override. `RETROSPECTIVE_EXACT_FIGHT_END@1` is an owner-approved
  MODEL_ASSUMPTION, never observed knowledge.
- **Primary target.** The single WCL boss-subtype actor OBSERVED in this
  fight's events (the catalog is report-wide: it lists six bosses). The
  subtype is metadata only. Presence for the whole encounter is
  `PRIMARY_TARGET_PRESENT_WHOLE_ENCOUNTER@1`, PENDING owner approval:
  targetability and phases are not established, and the observed hits (largest
  gap 2.475 s) support it without proving it.
- **Raid buffs.** KNOWN only from the subject's own evidence. A buff must be on
  the pull's combatantinfo aura list and never removed under COMPLETE subject
  aura coverage; a removal makes it TIMED, which is not representable (the
  engine override is whole-fight).
  - The pull list is not proven exhaustive, so an absent buff is UNKNOWN,
    never KNOWN_NONE. Raid composition, comparisons and the engine package
    are never used.
  - Target debuffs are UNKNOWN when the aura evidence does not vouch for the
    primary target. Generic `bleeding` has no aura identity.
  - Pinned identities: `src/data/game/raid-environment.json`, machine-extracted
    by `scripts/authority/extract-simc-raid-environment.mjs` from the pinned
    spell data (sha256 d8e3d197…). Blessing of the Bronze is one aura per
    class: the engine reads `effectN(player_e)` of 364342, which is 381732 for
    a Death Knight.
- **Bloodlust.** Keyed by the pinned lust family. A spell is equivalent to the
  engine's 2825 only when its duration and every aura-effect row are
  identical: Heroism 32182 yes; Time Warp, Primal Rage and Fury of the Aspects
  no.
  - KNOWN_NONE needs COMPLETE coverage, no family transition and no lockout. A
    lockout without a recognised lust is UNKNOWN.
  - A non-equivalent lust or more than one lust is not representable.
  - Translation: `override.bloodlust=1`, `bloodlust_percent=0`,
    `bloodlust_time=<observed>`, after `optimal_raid=0`. The pinned check runs
    at 0 s and then every whole second, triggers once and never reschedules
    (`sim.cpp bloodlust_check_t`). So there is never a default or second lust,
    and 471 ms runs at 1.000 s, recorded as `BLOODLUST_ENGINE_WHOLE_SECOND`.
- **Consumables.**
  - Identity comes from pinned consumable data. Rank is the item level shared
    by every item applying the aura: flask 1235057 and potion 1236994 are
    each applied at 278 and 295, so rank is UNKNOWN.
  - Potion uses are the aura intervals, kept apart from identity: 1.921–31.951
    s and 303.773–333.776 s.
  - Temporary enchant 8052 maps to `thalassian_phoenix_oil_2`. Its whole-fight
    persistence is `TEMPORARY_ENCHANT_PERSISTS_WHOLE_FIGHT@1`, PENDING.
  - Food and augment rune are UNKNOWN. The subject's unclassified pull auras
    (1296934, 1303171 Vantus Rune: Tides, 1303184, 1285644) are kept as
    candidates only.
  - The built-in APL owns potion timing (`potion,if=cooldown.dancing_rune_weapon.remains>78|fight_remains<=30`),
    so observed potion timing is not representable.
- **Automatic consumables.** The builder writes every consumable option
  explicitly; an empty one would mean the class default (`player.cpp:12910`).
  `disabled` makes the consumable action never ready, even a named APL action
  (`consumable.cpp:862-866, :998`). Blood's APL has no flask, food or rune
  action, and its one potion line is gated by the potion option.
- **Tank load.** `STANDARD_TANK_LOAD_V1` v1 (`tank_dummy_type=mythic` after
  the primary-target line), revision
  `7397216ba23406188218ea9444e2387de05988156cabcc235cba06e99338aad1`. That is
  the SHA-256 of `{model, version, directives}`, so any directive change is a
  new revision. It is an owner-approved MODEL_ASSUMPTION, and the spec carries
  the disclosure wording.
- **Targets.** `OBSERVED_ENGAGEMENT_SPAN ≠ SIMULATED_TARGET_AVAILABLE_INTERVAL`.
  Candidates are catalog NPCs the subject or its owned pets were observed
  damaging. Each carries an observation span and descriptive 10 s clusters,
  and an audit of every availability source:
  - TARGETABILITY, ENCOUNTER_PHASES and DEATHS: capability not established;
  - SUMMONS: out of scope, and not availability anyway;
  - observed engagement and catalog: not availability evidence.

  No approved source establishes an interval, so availability and the
  schedule are UNKNOWN. The subject's adds 179 (260895) and 180 (260905) are
  engaged and not representable. No lower or upper environment exists, and
  the job still admits no additional target.
- **Pull-aura inventory.** Every pull aura is classified:
  - RAID_BUFF, LUST_FAMILY, SATED, CONSUMABLE, CHARACTER_TALENT;
  - UNCLASSIFIED_SELF, which blocks: its simulation effect is unknown;
  - UNCLASSIFIED_ALLY: Devotion Aura 465 ×2, Power Word: Shield 1246768 and
    Prayer of Mending 41635 have no player-side engine representation. They
    are excluded under `UNREPRESENTABLE_ALLY_AURAS_EXCLUDED@1`, PENDING.
- **Materiality** (`materiality.ts`, `ENVIRONMENT_MATERIALITY_V1`, 0.5%). Spec
  facts supply measurements; the policy is shared and fails closed:
  - no measurement → blocking;
  - a bit-identical result → inert, NON_BLOCKING;
  - |Δ| ≥ 0.5% → blocking;
  - below 0.5% → NON_BLOCKING only when the compared values bound every
    plausible value. One example of an open set (an unknown food) is a
    semantic ambiguity and blocks.

  Blood's measurements (`src/specs/deathknight/blood/environment-facts.ts`,
  reproduced by `scripts/bench/m11g34-environment.bench.ts`):

  | field | change | classification |
  | --- | --- | --- |
  | chaos brand | +0.92% | blocking |
  | mystic touch | +3.18% | blocking |
  | hunter's mark | +2.93% | blocking |
  | mortal wounds, bleeding | bit-identical single-thread | inert |
  | flask rank | −0.27% | non-blocking |
  | potion rank | −0.23% | non-blocking |
  | food (example) | +1.20% | blocking |
  | rune (example) | +0.53% | blocking |
  | lust at 0 vs 1 s | +0.07% | non-blocking |

  Arcane Intellect and Blessing of the Bronze are inert for Blood. Battle
  Shout, Mark of the Wild, Fortitude and Skyfury are active.
- **Publishability** (`publishability.ts`). PUBLISHABLE needs four things:
  1. no factual blocker materiality cannot clear;
  2. every UNKNOWN classified NON_BLOCKING;
  3. every assumption OWNER_APPROVED;
  4. a successful CURRENT_SETUP translation.

  So PUBLISHABLE implies translatable. CURRENT_SETUP never writes UNKNOWN as
  absent unless the field is inert. It never chooses an unresolved rank, never
  writes a ranked consumable without a pinned item-to-token mapping (none
  exists), and never writes observed potion uses or an unestablished schedule.
- **BOSS_ONLY_DIAGNOSTIC.** Proven facts only, one target, provenance
  `DIAGNOSTIC_RECONSTRUCTION`. Every omission is recorded in the ledger as not
  a claim of absence.
  - The job schema requires the label on consumables, raid buffs and Bloodlust
    together.
  - `ceilingEligibility` refuses any non-ACTUAL_OBSERVED job.
  - It is never called a lower, conservative, current-setup or attainable
    ceiling.
- **Hash** (`hash.ts`). It uses the G3-1 canonical JSON and SHA-256 over a
  semantic projection: duration and finality, states by game id, presence,
  lust timing, consumables, tank model/version/revision, pull-aura classes and
  assumption ids.
  - It excludes report code, fight, actor ids, sources, report timestamps,
    documents, explanatory text and observations.
  - Subject: `e0be25aff0113c17ac2f4704c1d4cda9c91858380293198a86962964f4e81ad2`.
- **Stat reconciliation revisit** (`stat-reconciliation.ts`). Engine buffed
  stats under the PROVEN pull environment, race `none` for measurement only:
  - versatility reconciles with flask rank 2 (rank 1 leaves 14);
  - Fortitude explains stamina except 184;
  - strength +52, crit +3, haste +229 and mastery −231 remain.

  PARTIALLY_RECONCILED. Comparability is not proven (race, food, rune and
  unclassified auras), so it stays a diagnostic. It blocks only when
  comparability is proven and a residual remains.
- **MODEL_BUILD_LAG.** The log (2026-10-01) is newer than the pinned hotfix
  data (2026-09-10). That is a diagnostic. Its specific gaps (unnamed pull
  auras, unknown food and rune) block under their own codes.
- **Subject result.** Readiness NOT_REPRESENTABLE; publishability BLOCKED:
  - TARGET_SCHEDULE_UNRESOLVED;
  - MATERIAL_RAID_BUFF_UNKNOWN (chaos brand, mystic touch, hunter's mark);
  - MATERIAL_CONSUMABLE_UNKNOWN (food, rune);
  - SETUP_AURA_UNCLASSIFIED;
  - ENVIRONMENT_TRANSLATION_UNSUPPORTED (potion timing; CURRENT_SETUP plan);
  - ASSUMPTION_NOT_OWNER_APPROVED (three pending).

  The character profile stays separately NOT_SIMULATION_READY (RACE_UNRESOLVED).
- **Exact-pin round trip.** The development character runs with the subject's
  BOSS_ONLY_DIAGNOSTIC translation through the full parser, which checks the
  duration, override, lust and consumable echoes. The report itself confirms:
  - one target and only the `tank_heal` raid event;
  - a fixed 345.177 s length;
  - constant buffs equal to the translated six;
  - exactly one Bloodlust (2825) per iteration.

  Its DPS is not recorded.

### M11-G3-4 continuation — owner decisions applied (2026-10-22)

- **Primary target.** `PRIMARY_TARGET_CONTINUOUS_V1` is a MODEL_ASSUMPTION.
  It is OWNER_APPROVED only for `b1PmaKrd6CDfzngc#48` / encounter 3455
  (`PRIMARY_TARGET_CONTINUOUS_APPROVALS`); any other fight gets it PENDING.
- **Weapon oil.** `TEMPORARY_ENCHANT_PERSISTS_WHOLE_FIGHT` is approved under
  two conditions:
  - the enchant is established at pull, the subject's casts are COMPLETE, and
    no pinned temporary-enchant spell is cast in the fight;
  - otherwise persistence is UNKNOWN. An unknown enchant never persists.
- **Defensive ally auras.** `DEFENSIVE_ALLY_AURAS_EXCLUDED_V1` is approved,
  keyed by spell id: 465, 1246768 and 41635. The extractor records every
  effect row, including linked spells, and fails unless each is damage-taken,
  absorb, dummy or a link to a defensive spell. Any other ally aura keeps the
  PENDING `UNREPRESENTABLE_ALLY_AURAS_EXCLUDED`.
- **Bloodlust.** `BLOODLUST_WHOLE_SECOND_START_V1` is an approved bounded
  engine approximation. Provenance `engineApproximations` keeps the observed
  471 ms and the engine's 1000 ms.
- **Potion policy (corrected).** `POTION_TIMING_ELITE_APL_V1`: actual
  identity/availability, elite-APL timing. Observed uses are evidence only and
  never replayed; there is no potion schedule.
- **Consumable rank: uncertainty envelope.**
  - The consumables artifact (revision 2) carries per-aura `rankOptions`:
    item level → engine token (`tokenize(name)_<crafting quality>`).
  - A token is UNAMBIGUOUS only when every item the engine's match predicate
    could select applies the same aura at the same item level, which makes it
    independent of the engine's iteration order.
  - An UNKNOWN rank with a complete, representable set is carried as
    translation `consumableVariants` (the Cartesian product; subject: flask ×
    potion = 4). G4 runs every variant and reports the envelope; it never
    sums sensitivities.
  - Augment runes resolve through the engine's keyword chain
    (`augmentation_t::driver()`, e.g. `void_touched` → 1264426), not by item
    name. The extractor reads that chain from the pinned `consumable.cpp`
    (sha recorded).
  - **Representable means the approved engine ACCEPTS the token.** A name
    match is not proof. `src/data/game/consumable-token-acceptance.json`
    (`scripts/bench/m11g34-consumable-tokens.bench.ts`, one engine run per
    unambiguous token) accepts 22 of 67 tokens: every flask, potion and rune
    token, and **no** food token. Every derived Midnight food fails engine
    effect initialization at the pin. Unrecorded or refused tokens are not
    representable.
  - Stat reconciliation is never used for rank.
- **Food / rune.** No defaults. An explicit `USER_PROVIDED` statement (an
  engine token or "NONE", with provenance) fills an UNKNOWN identity only.
  It is validated against pinned, unambiguous tokens and never overrides an
  observation: a conflict is `USER_PROVIDED_CONFLICT`, an invalid token
  `USER_PROVIDED_INVALID`. A statement does not clear unidentified-aura
  blockers.
- **USER_PROVIDED** is a new `Evidenced` state. The hash covers its value,
  never its reference or time.
- **Race policy.** Authoritative evidence first (none exists); otherwise an
  explicit `USER_PROVIDED` race with provenance. There is no default, no
  production "none" and no all-races range. An invalid or "none" statement is
  `RACE_USER_PROVIDED_INVALID` plus `RACE_UNRESOLVED`.
- **MODEL_BUILD_LAG.** Age alone stays a diagnostic. A subject pull aura that
  the pinned spell data does not contain (audited: 1285644, 1296934, 1303184)
  is `PINNED_MODEL_MISSING_OBSERVED_EFFECT` and blocks. 1303171 (Vantus Rune:
  Tides) is in the pinned data and stays unclassified only.
- **Add availability.** An owner-authorized WCL investigation (3 requests)
  found no targetability or spawn/despawn event type for the fight:
  `WCL_TARGET_AVAILABILITY_AUTHORITY_NOT_FOUND`
  (`TARGET_AVAILABILITY_INVESTIGATIONS`, recorded as a `WCL_INVESTIGATION`
  audit).
  - Add 179: 32 instances summoned by the environment in 4 waves of 8, each
    dying 5–6 s later.
  - Add 180: 12 deaths, no summons.

  Summons are creation and deaths are ends only. The schedule stays UNKNOWN.
- **Boss debuffs.** One filtered capture shows Mystic Touch applied at
  0.505 s, Chaos Brand at 1.336 s, and Hunter's Mark (257284) applied before
  the pull; all are removed at the fight end. This is not certified: the debuff
  table under `hostilityType: Enemies` returned only enemy-sourced debuffs. The
  raw capture is not committed, the environment keeps them UNKNOWN, and none is
  converted to whole-fight.
- **Subject result.** Readiness NOT_REPRESENTABLE; publishability BLOCKED:
  - TARGET_SCHEDULE_UNRESOLVED;
  - MATERIAL_RAID_BUFF_UNKNOWN (three debuffs);
  - MATERIAL_CONSUMABLE_UNKNOWN (food, rune);
  - SETUP_AURA_UNCLASSIFIED;
  - PINNED_MODEL_MISSING_OBSERVED_EFFECT;
  - ENVIRONMENT_TRANSLATION_UNSUPPORTED (the CURRENT_SETUP plan for those).

  No pending assumption remains. Hash
  `874c2a74c82d3675f5f2f382ba988064b40fb4690e7d7fcb925b563d2fe9b98a`.

### M11-G3-4 final authority reduction (2026-10-22)

- **Boss-debuff certification failed.** One request, the friendly-sourced
  Debuffs table on actor 161 for 113746, 1490 and 257284, returned no aura
  band.
  - It is recorded as `WCL_DEBUFF_INTERVAL_CERTIFICATION_NOT_ACHIEVED`
    (`BOSS_DEBUFF_CERTIFICATION_ATTEMPTS`, cited in the UNKNOWN reason).
  - The debuffs stay UNKNOWN and blocking, and no approximation was evaluated.
- **Timed boss debuffs are not representable at the pin.** The overrides are
  applied once when the enemy arises (`player.cpp` `override_buff()`, whole
  fight). The job admits no raid events, and no pinned raid-event type models
  a school-specific damage-taken debuff.
- **Food tokens.** An offline engine audit set each of the 93 pinned
  current-content food items' canonical tokens.
  - 43 are accepted, and each echoes the spell the engine builds; several build
    another item's spell, e.g. `flora_frenzy` → 1232919.
  - No engine-built food spell, and no pinned food effect chain, reaches any
    subject pull aura.
  - Result: FOOD_ENGINE_MAPPING_NOT_PROVEN. The food blocker is unchanged.
- **Missing model effects.** Each subject pull aura that is absent from the
  pinned spell data blocks as `PINNED_MODEL_MISSING_OBSERVED_EFFECT`, one
  blocker per effect: 1285644, 1296934 and 1303184. MODEL_BUILD_LAG (age)
  stays a diagnostic.
- **Encounter schedule: `PINNED_ENCOUNTER_SCHEDULE_AUTHORITY_NOT_FOUND`**
  (`ENCOUNTER_SCHEDULE_AUTHORITY_AUDITS`, a `PINNED_ENCOUNTER_DATA` audit
  for encounter 3455).
  - The approved image holds only the binary.
  - The engine's fight styles and raid events are generic.
  - The pinned spell and item data carry no encounter or creature schedule; the
    adds' summon spell 1284785 is absent from them.
  - The repository holds no encounter metadata.

  No encounter-metadata contract is proposed, and the target schedule stays
  UNKNOWN.
- **Owner race statement.** The owner stated race = dwarf as USER_PROVIDED
  (`tests/fixtures/character/canonical-subject-user-statements.json`, applied
  only through `withOwnerStatements`). With it, the canonical subject
  reconstructs with race USER_PROVIDED and no blockers.
  - The exact-pin fidelity echo
    (`simc-33622e9d-blood-subject-fidelity-user-race.json`) MATCHes every
    gated check, race included, so the character profile is SIMULATION_READY.
  - Stats stay STAT_RECONCILIATION_NOT_PROVEN, a diagnostic.
  - The statement-free subject stays RACE_UNRESOLVED.
  - The environment is unaffected: still NOT_REPRESENTABLE / BLOCKED.

## M11-G3-5 — private SimulationCraft runner service

**Status:** implemented, uncommitted, awaiting architecture review (2026-10-22).
There is no public simulation endpoint, no G4 math, no pin change and no
`analysis/1` change.

### Shape

```text
Worker (src/simulation-client/remote-client.ts)
   -- signed HTTPS (simc-runner-api/1) -->
private runner API (runner/service/http.ts, server.ts)
   -> SimulationService (runner/service/service.ts)
        prepare (G3-1) -> class allowlist + readiness attestation -> cache (verified)
        -> coalesce -> bounded FIFO -> executor
   -> runSimulationJob (G3-1, unchanged) -> launcher -> parseSimcJson
   -> cache entry (parsed-result key) -> ticket view
Worker <- ticket -> settleTicket (re-derives key/class, verifySimulationResult)
```

There is ONE simulation implementation. The service wraps the G3-1 core
unchanged: job schema, input builder, execution profiles, policies, process
runner, parser, `SimulationResult` and canonical keys. Transport redefines none
of them.

Files:

- `src/simulation/approved-artifacts.ts` — moved from runner/ so the Worker can
  verify against the same identity. runner/ re-exports it.
- `src/simulation/job-class.ts` — DEVELOPMENT / FIDELITY_PROBE / DIAGNOSTIC /
  PRODUCTION; only PRODUCTION is publishable.
- `src/simulation/runner-protocol.ts` — the wire contract, shared by both ends:
  request, ticket, refusal, transport-error schemas and HMAC signing.
- `src/simulation/result-verification.ts` — strict result schema plus identity
  re-check.
- `src/simulation/backend.ts` — `SimulationBackend` and `settleTicket`.
- `src/simulation-client/remote-client.ts` — the Worker client. It sits outside
  src/simulation because it does network I/O.
- `runner/service/`:
  - `service`, `http`, `server`, `auth`, `cache`, `capacity`, `config`;
  - `engine` (executor binding), `self-test`, `compose`, `main`.
- `runner/local-backend.ts`.

### Decisions

- **Async submit/poll** (`POST /v1/simulations` → 202 + ticket; `GET`/`DELETE
  /v1/simulations/:id`):
  - A STANDARD run takes ~5 s on the dev host and an ESCALATED run ~16 s, and
    queueing multiplies both. A synchronous request would hold a Worker
    subrequest open for an unbounded queue wait.
  - It would also make cancellation impossible to express.
  - A cache HIT is answered 200 and terminal immediately.
- **Auth: HMAC-SHA256** (`WLC-SIMC-HMAC-SHA256-1`) over scheme, key id,
  timestamp, nonce, METHOD, path and sha256(body):
  - ±300 s tolerance.
  - The (keyId, nonce) store is bounded. When full it refuses rather than
    forgetting a live nonce, and it is consulted only after the signature
    verifies.
  - Key ring `SIMC_RUNNER_HMAC_KEYS` = `id:base64,…` (≥32 bytes each). Rotation:
    add an id, move clients, remove the old id.
  - Chosen over a bearer token because the signature binds the body and path
    and expires: a captured request cannot be replayed or re-targeted, and the
    secret never crosses the wire.
  - Query strings are refused, so the signed path is the whole target.
- **Identity, idempotency and coalescing use the parsed-result key.**
  - The job id is an opaque ticket (UUID). It never enters a hash, a key or a
    result.
  - Identical in-flight jobs share one execution, with one ticket per
    submission.
- **Cancellation.**
  - Cancelling a ticket detaches it.
  - The execution is aborted only when no live ticket remains: a QUEUED one is
    removed; a RUNNING one has its engine killed (the launcher kills the
    process; Docker also gets `docker kill`).
  - Race rule: the first terminal transition wins per ticket. A cancel processed
    first leaves that ticket CANCELLED forever; a later cancel is a no-op.
  - There is never a partial result. A run that completes after losing the race
    is still a full, verified run and is cached.
- **Queue.**
  - Bounded FIFO (`maxQueueDepth`). A full queue is RUNNER_OVERLOADED with no
    ticket. A job queued past `maxQueueWaitMs` fails RUNNER_OVERLOADED.
  - There is no priority field in the protocol.
  - Concurrency is `maxConcurrentJobs`, separate from SimC threads.
    `jobs × threadsPerJob > logicalCpu` is an invalid capacity, so the service
    is NOT READY. It never runs 2 × 8 on 12.
  - A capacity claiming more CPUs than `availableParallelism()` is NOT READY.
- **Cache.**
  - `SimulationCache` has memory and filesystem adapters (one
    `<key>.json`, atomic temp+rename).
  - Entry (`simulation-cache-entry/2`) = {schema, cacheKey, engineRunKey,
    result, resultMac, createdAt, modelIdentity, parserRevision}.
  - Keys are immutable; there is no clear-on-deploy.
  - **Integrity (final hardening).** `resultMac` = HMAC-SHA256 under a
    DEDICATED cache-integrity key (`SIMC_RUNNER_CACHE_MAC_KEY`) over
    `canonicalJson({scheme: "WLC-SIMC-CACHE-MAC-SHA256-1", cacheKey,
    engineRunKey, result})`.
    - The scheme label separates this domain from request signing.
    - Binding the keys stops a valid record being replayed under another key.
    - Configuration refuses a cache key equal to any HMAC request key.
    - A missing key leaves the service NOT READY (`checks.cache: INVALID`), for
      every adapter.
  - A read is typed (`CacheReadOutcome`), in order:
    - shape and keys → `CACHE_ENTRY_MALFORMED`;
    - MAC, compared in constant time → `CACHE_INTEGRITY_FAILED`;
    - full result verification against the identity recomputed from the
      submitted job → `CACHE_RESULT_UNVERIFIED`.
    - Any refusal is logged as `CACHE_REJECTED` with that code and counted
      (`cacheRejected`, `cacheIntegrityFailures`). The entry is deleted and
      the job recomputed; it never fails the caller and is never served.
    - A record with edited DPS and untouched provenance is caught by the MAC.
  - The production gate and the class allowlist run BEFORE the cache, so a
    refused job never reads it.
- **Job-class deployment allowlist (final hardening).**
  - `SIMC_RUNNER_JOB_CLASSES`; the production default (and the compose
    default) is PRODUCTION only.
  - Development and test deployments enable DEVELOPMENT, FIDELITY_PROBE or
    DIAGNOSTIC explicitly. An empty list is NOT READY.
  - A disallowed class is REFUSED (`JOB_REJECTED`) first: before the cache,
    the queue and the engine. It is the same service with one implementation.
  - The startup self-test is runner-owned and executes directly, so it is not
    subject to the caller allowlist.
- **Allowlists (`SERVICE_POLICY_V1`).**
  - PRODUCTION / DIAGNOSTIC / DEVELOPMENT → ELITE_REALISTIC_V1 with
    STANDARD_SIM_V1 or PRECISION_ESCALATED_V1.
  - FIDELITY_PROBE → SIMC_DEFAULT_PINNED with FIDELITY_PROBE_V1.
  - BENCHMARK_300_T1 is runner-internal (the self-test) and never a caller
    policy.
  - Model and spec allowlists are G3-1's: the approved artifact and Blood only.
- **PRODUCTION needs a revision-bound readiness attestation**
  (`src/simulation/readiness-attestation.ts`).
  - Shape:

    ```text
    { schemaVersion: "simulation-readiness-attestation/2", jobClass: "PRODUCTION",
      profile:     { hash, status: SIMULATION_READY | NOT_SIMULATION_READY, gateRevision },
      environment: { hash, status: PUBLISHABLE | BLOCKED,                   gateRevision } }
    ```

  - The Worker stays the authoritative G3-2/G3-4 policy engine. The runner
    never re-runs those gates. It authenticates the Worker, then checks in
    order:
    - the schema version (stale → JOB_REJECTED);
    - jobClass, and that the job is PRODUCTION;
    - both hashes against its own recomputation;
    - both gate revisions against `ACCEPTED_READINESS_GATE_REVISIONS`
      (current only → JOB_REJECTED otherwise);
    - the statuses: NOT_SIMULATION_READY → PROFILE_RECONSTRUCTION_FAILED,
      BLOCKED → ENVIRONMENT_NOT_REPRESENTABLE.
  - All of this happens before the cache and the engine. A non-production job
    may not carry an attestation.
  - Gate revisions are owned by the gates:
    - `PROFILE_READINESS_GATE_REVISION = "profile-readiness-gate/1"` in
      `src/character-profile/fidelity.ts`;
    - `ENVIRONMENT_PUBLISHABILITY_GATE_REVISION =
      "environment-publishability-gate/1"` in
      `src/environment/publishability.ts`.
  - `tests/contracts/m11g35-readiness-gate-revisions.test.ts` keeps the
    runner's accepted set equal to them. It also pins each gate's code
    fingerprint (comments and whitespace ignored) per revision, so changing gate
    code forces an explicit decision: bump the revision (old attestations are
    then refused) or re-pin as a reviewed refactor.
  - The envelope carries the attestation opaquely (`readiness: unknown`), so
    LOCAL and REMOTE submissions are judged by the same typed check.
- **DIAGNOSTIC jobs** are marked `jobClass: DIAGNOSTIC, publishable: false` in
  every ticket. The client re-derives the class from the job and refuses a
  ticket that disagrees.
- **Cache status** (MISS / HIT / COALESCED) lives on the ticket and BackendRun,
  never in `SimulationResult`.
- **Worker client.**
  - Prepares the job locally (refuses without a request), signs every request
    with a fresh nonce, and polls.
  - At the deadline or on abort it sends a signed DELETE → SIMULATION_TIMEOUT /
    CANCELLED.
  - NOT_FOUND → re-submits, at most `maxResubmits`.
  - Settles through `settleTicket`: key, class, publishability and full result
    verification. HTTP 200 is never trust.
  - Transport failures keep the existing typed codes plus a `transport` field:
    NETWORK, AUTH_REJECTED, BAD_RESPONSE, TICKET_LOST, CLIENT_DEADLINE or
    REQUEST_REFUSED.
- **LOCAL / REMOTE parity.** `LocalSimulationBackend` drives the same service
  in-process and settles through the same `settleTicket`.
- **Non-durable queue.**
  - Tickets and executions live in memory. A restart loses them, and polls
    answer 404.
  - The client re-submits; semantic identity makes that safe (durable cache
    HIT, or a re-run to the same key).
- **Readiness vs liveness.**
  - `/livez` answers whenever the process serves.
  - `/v1/readiness` is 200 only when all of these hold: the startup self-test
    has PASSED, capacity is valid, the cache is writable and the service is not
    shutting down.
  - The self-test hashes the image's engine and runs a 60 s main-hand-only
    Blood DEVELOPMENT job (BENCHMARK_300_T1) through the SAME executor, then
    re-verifies it. A missing image, a wrong binary, a wrong model revision or
    a broken parser therefore keeps the runner NOT READY, and every submission
    is RUNNER_UNAVAILABLE.
- **Graceful shutdown.** Stop accepting, cancel the queued jobs, let running
  engines finish within the grace period, kill the rest, then wait for every
  execution to settle (process gone, temp dir removed) before closing.
- **Observability.**
  - One JSON line per service event and HTTP refusal, with a 12-hex key prefix
    and the ticket id only.
  - Never a header, signature, nonce, secret, job or result.
  - `/v1/metrics` (authenticated) reports queue depth, running, queue-wait and
    runtime aggregates, and counters: submitted, cacheHits, cacheMisses,
    coalesced, cacheRejected, cancellations, timeouts, engineFailures,
    rejectedOverload and rejected:<code>.
- **Limits.**
  - Request ≤ 260 KB, enforced while reading; the job itself is ≤ 256 KB,
    measured canonically.
  - Iterations, threads and timeout must equal the registered policy (G3-1).
  - Threads must fit `threadsPerJob`.
  - Output ≤ 5 MB; stdio capped.
  - Wall time is capped by the capacity; memory by the container.
- **Isolation (unchanged G3-1 launchers):**
  - a private temp directory, removed in `finally`;
  - a fixed executable, no shell, no caller path or argument;
  - Docker `--network none --read-only --cap-drop ALL no-new-privileges
    --pids-limit 256 --memory`, digest-only image, non-root `simc` user.
- **Provenance.**
  - Results carry G3-1 provenance unchanged.
  - Tickets carry `serviceRevision` (`simc-runner-service/1`) as transport
    provenance only; it is never part of a key.

### Deployment shape (recommended, not provisioned)

- A dedicated Linux host, not the Worker, running the bundled service.
  - Bundle with `esbuild runner/service/main.ts --bundle --platform=node`.
  - Node cannot resolve this repository's `.js`→`.ts` specifiers directly; the
    bundle was verified to start and reach READY on the exact pin.
- It listens on loopback or a private interface.
- **TLS is mandatory for production**, terminated in front of the service
  (reverse proxy or tunnel). Only the Worker holds an HMAC request key.
- **Application HMAC remains mandatory** even behind TLS or a private network.
  TLS protects the channel; the HMAC authenticates the caller, binds body and
  path, and bounds replay.
- Engine: per-job DockerLauncher (rootless Docker) on the approved image digest.
  DirectLauncher is for a container that IS the image.
- Durable cache on local disk, or an object-store adapter implementing
  `SimulationCache`.
- Capacity: `RECOMMENDED_PRODUCTION_CAPACITY_V1` is a recommendation for a
  16-vCPU host: 2 × 8 threads, queue 32, wait 180 s. It is NOT a configuration
  this repository has run. The development host is 12 logical CPUs and runs
  `DEV_LOCAL_CAPACITY_V1` (1 × 8).

### Accepted v1 limitations (owner-approved, final hardening)

- **In-memory nonce store.** A request captured in the last tolerance window
  could be replayed once against a freshly restarted runner. This is an
  accepted v1 limitation.
- **Single instance.** A single-instance runner is the approved v1 deployment.
  There is no shared nonce store, ticket store or coalescing.
- **Non-durable queue.** It is approved, with semantic retry: the client
  re-submits, and the cache or a re-run to the same key answers.
- **TLS termination.** It is a deployment requirement, not implemented in this
  repository.

### Measured capacity (dev host, 12 logical CPUs, exact pin, unloaded)

From `scripts/bench/m11g35-runner-service.bench.ts` (`.probe/m11g35/report.json`):

| measurement | result |
| --- | --- |
| startup self-test (hash + 60 s job) | ~10 s cold; ~3 s from the bundled entry point |
| one STANDARD_SIM_V1 (345 s fight) | 5.2 s |
| one PRECISION_ESCALATED_V1 | 16.4 s |
| two STANDARD queued behind a 1-job runner | done at 4.9 s and 9.9 s |
| two 8-thread engines simultaneously (launcher level, oversubscribed 16 on 12) | 8.8 s and 8.6 s |
| cache HIT over HTTP, signed, loopback | 8 / 15 / 30 ms (min / median / max of 20) |

Feasibility for a 1–2 minute product target:

- One 1 × 8 runner serves ~11 STANDARD or ~3 ESCALATED runs per minute.
- A 16-vCPU 2 × 8 host roughly doubles that.
- At the recommended queue depth (32), a STANDARD job arriving at a full queue
  waits ~32 × 5.2 s / 2 ≈ 83 s before running. That fits the 2-minute bound, but
  not with ESCALATED jobs in the mix.
- So queue depth and wait must be re-derived from the observed mix before
  production. These are estimates from one host, not a load test.

## M11 — simulation-model registry and 69933 Blood promotion

**Status:** architecture approved (2026-10-23). The final closeout
corrections are listed below (2026-10-28). G4 is not started; public analyzer
authority is unchanged.

### Two model concepts, never the same constant

- **Analyzer authority model** (`src/simc/analyzer-authority-model.ts`):
  SimulationCraft `33622e9d…` / `12.1.0.69587`, the commit every public
  analyzer artifact was extracted from (`src/simc/data/*.apl.json` and the
  analyzer data in `src/data/game`). It selects no simulation model.
- **Simulation model** (`src/simulation/model-registry.ts`): one exact engine
  plus Live game-data build used to simulate. Each entry records:
  - the pin (commit, build) and the reported engine revision;
  - the client-data snapshot: hotfix date and hash, the upstream data commit and
    when it landed;
  - the approved artifact (binary SHA-256, recipe), the immutable image id and
    the build record.
- **Separation.** `tests/contracts/m11-simulation-model-registry.test.ts` checks
  that:
  - every analyzer artifact is on the analyzer model;
  - simulation code never imports `src/simc`, and `src/simc` never imports
    simulation selection;
  - no production code carries a global default model.

### Registered simulation models (both permanent)

| id | commit / build | binary | image |
| --- | --- | --- | --- |
| `SIMC_33622E9D_LIVE_12_1_0_69587` | 33622e9d / 12.1.0.69587 (hotfix 09-10) | 41347bc4… | sha256:8ab91e72… |
| `SIMC_0A72E6A7_LIVE_12_1_0_69933` | 0a72e6a7 / 12.1.0.69933 (hotfix 09-22) | 79bf5a40… | sha256:efea14b4… |

- `APPROVED_ENGINE_ARTIFACTS` is now a view of the registry, one artifact per
  model.
- The 0a72e6a7 artifact has its own build record,
  `runner/simc-build/build-record-0a72e6a7.json`. It shares the recipe and base
  digest with the historical one, but its apk toolchain differs (manifest
  recorded). Its verification is VERIFIED by the exact-pin bench run with
  `MODEL_ID`.

### Applicability is spec-owned and evidence-bounded

- A specialization declares which models it has validated for production, each
  for ONE game build and a fight-time window bounded by client-data snapshots
  shown equivalent for that spec: `SpecSimulationModelValidation`, in the spec's
  `simulation-binding.ts`, outside the binding object so no cache key moves.
- Blood validates:
  - **33622e9d / 69587:** window [2026-09-10T20:43Z, 2026-09-13T00:34Z), basis
    `SINGLE_SNAPSHOT_UNTIL_NEXT_LIVE_SNAPSHOT` (one data snapshot; the next Live
    snapshot is another build).
  - **0a72e6a7 / 69933:** window [2026-09-22T20:05:35Z, 2026-10-01T23:06:26Z),
    basis `SNAPSHOTS_VERIFIED_EQUIVALENT_FOR_SPEC`. Blood-relevant data is
    equivalent at snapshots 0a72e6a746, 7cbb6ef5ff (bit-identical Blood sims) and
    698c86ba67. The canonical fight (2026-10-01T01:01Z) is inside it.
- No other spec has validated any model.

### Selection (`selectSimulationModel`, the Worker's job; G4 will call it)

| Context | Result |
| --- | --- |
| Build unresolved, or fight time unresolved | SIMULATION_MODEL_CONTEXT_UNRESOLVED |
| No registered model for the build (e.g. 12.1.5) | SIMULATION_MODEL_NOT_AVAILABLE |
| Model exists, spec never validated it | SIMULATION_MODEL_NOT_VALIDATED_FOR_SPEC |
| Validated, but the fight is outside every validated window | SIMULATION_MODEL_NOT_AVAILABLE |
| More than one validated window matches (any models) | SIMULATION_MODEL_CONTEXT_UNRESOLVED |

A successful selection returns the model AND its applicability: the one
matching spec validation (spec, build, fight start, window, basis).

There is no fallback to an older or newer model. A log's game build is not
resolved automatically yet: the canonical subject's context is the approved
investigation result, and resolving arbitrary logs is G4 work.

### The job names its model; nothing selects one after construction

- `job.model` (commit + build) must resolve to exactly one registered model
  (else UNSUPPORTED_MODEL_VERSION).
- `prepareSimulation` takes the caller's approved artifacts and uses only the
  one for that model (else RUNNER_UNAVAILABLE). `PreparedSimulation` carries
  `model` and `artifact`.
- Cache keys, result provenance and result verification all derive from that
  artifact.
- Historical jobs keep working unchanged: same keys, same goldens.

### Runner (G3-5)

- The runner hosts one ENGINE per configured model (`SIMC_RUNNER_MODELS` =
  `MODEL_ID=target`; DOCKER targets must equal the model's registered image).
- Every engine proves its binary and runs its own self-test naming its model.
  One failing engine keeps the runner NOT READY.
- A job runs only on its model's engine. A model the runner does not host is
  RUNNER_UNAVAILABLE; it is never substituted.
- A PRODUCTION job also needs its spec to have validated the model
  (SIMULATION_MODEL_NOT_VALIDATED_FOR_SPEC, checked before the cache).
- **Readiness attestation schema 3** adds `simulationModelId`. Profile fidelity
  and environment publishability are computed against one model, so the runner
  refuses an attestation made for another model. Schema 2 is stale.

### Simulation-model data (per model)

- `src/data/simulation-models/<model>/` holds, per model:
  - consumable identities;
  - engine token acceptance;
  - raid-environment identities and presence audit;
  - a manifest (pin, binary, hotfix date, snapshot time and `dataHistory`).
- **Moved data.** The 33622e9d files moved there byte for byte from
  `src/data/game`. Their consumables provenance was then corrected; see the
  closeout below.
- **0a72e6a7 data.** It was extracted from the 0a72e6a7 sources (extractors fixed:
  raid-environment v3 reads the client build from source; the consumables
  source label is corrected and empty sources fail closed) and measured on its
  engine (token acceptance).
- **Same content.** The substantive content is identical across the two models:
  22 of 67 tokens accepted, and the same presence audit.
- **Injection.** Character-profile and environment reconstruction receive the
  NAMED model's bundle as input. This was a mechanical gate change, re-pinned
  under the same gate revisions (meaning unchanged).

### Blood environment materiality is measured per model

- `BLOOD_ENVIRONMENT_FACTS_BY_MODEL`: the 0a72e6a7 measurements moved with the
  69933 rebalance (e.g. Chaos Brand 0.92% → 1.08%, potion presence 5.70% →
  5.97%).
- **No field changed materiality class** under ENVIRONMENT_MATERIALITY_V1 (0.5%).
- The gate is evaluated with the facts of the model the job runs on.

### Engine-contract difference: Consumption (measured, both models)

At 0a72e6a7 Consumption's release spell (1263825) is a CHILD action
`consumption_release` of `consumption` (upstream 5f3f05020a); at 33622e9d it is
a separate top-level action. `scripts/bench/m11-consumption-release.bench.ts`
runs an ENGINE-WRITTEN Consumption loadout (`spec_talents=consumption:1`,
echoed import string) through the production path on both models.

- Parse, verification and cache identity work on both models. The parser needs
  no migration: one entry per top-level action, with compound amount.
- **Breakdown granularity is model-dependent:**

  | Model | Breakdown | Per iteration |
  | --- | --- | --- |
  | 33622e9d | `consumption` and `consumption_release` | 518,481 and 162,093 |
  | 0a72e6a7 | one `consumption` entry, release included | 636,408 (release 150,614) |

  Per-ability comparison ACROSS models must account for it. Within one model,
  results are internally consistent.
- Pinned by `tests/unit/simulation/consumption-release.test.ts` from the per-model
  goldens.

### Closeout (2026-10-28)

**Historical consumables provenance (a metadata correction).**
- **The defect.** The 33622e9d consumables artifact recorded its source as
  `engine/item/consumable.cpp`, a path that does not exist at that commit.
  The hash it recorded was of `engine/player/consumable.cpp`.
- **Regeneration.** The consumables extractor is now v4: real path label, and
  empty or chain-less sources fail closed. Both bundles were regenerated from
  their hashed sources, which are unchanged:
  - consumables revision `simc-<sha8>-3` → `-4`;
  - token acceptance `-1` → `-2`, re-measured on each model's engine.
- **No silent change.** No artifact keeps its old revision with new bytes.
  Each model manifest (now v2) records the change in `dataHistory`. The
  loader refuses a bundle whose history does not end at the loaded artifact
  revisions.
- **Semantics unchanged.** Semantic content and token verdicts are
  byte-identical to the committed v3 artifacts (pinned semantic hash). The
  readiness gates read code, not data revisions, so no gate fingerprint or
  revision moved for this.

**Model chronology vs validated applicability.**
- Environment reconstruction takes the caller's `modelApplicability`
  explicitly (null when there is none; no default).
- **Window covers the fight.** The applicability names THIS model and build,
  and its half-open window contains the fight start. Chronology is
  discharged: the informational `MODEL_SNAPSHOT_PRECEDES_LOG` is recorded
  instead of `MODEL_BUILD_LAG`. It does not imply compatibility uncertainty.
- **Otherwise.** `MODEL_BUILD_LAG` (age-only diagnostic) is unchanged.
  Selection outside a validated window already fails closed.
- **Concrete blockers stay.** A specific observed effect the model cannot
  represent still blocks under `PINNED_MODEL_MISSING_OBSERVED_EFFECT`;
  applicability never resolves one.
- **Gate impact.** Status, blockers, materiality and the environment hash are
  identical with and without the applicability. The environment gate
  fingerprint was re-pinned (same revision).
- **Canonical result.** The 69933 Blood fight selects 0a72e6a7 with
  `coversFight: true`. No MODEL_BUILD_LAG; the three missing effects
  (1296934, 1303184, 1285644) still block.

**Owner decisions** (recorded in `agent/follow-ups.md`):
- The 33622e9d window stays narrow.
- Automatic build and fight-context resolution is a distinct G4
  `SimulationContextResolver` prerequisite, not part of ceiling math.
- 12.1.5 is not registered. It gets its own compatibility review after the G4
  foundation and before 12.1.5 or current-Live ceilings are published.
- Existing approved artifacts are not rebuilt for package pinning. The next
  model build first gets a hardened recipe revision pinning the immutable base
  and exact package and toolchain inputs.
- There is no cross-model Consumption normalization until a consumer needs it.


## M11-G4-1 — SimulationContextResolver (publication foundation)

**Status:** implemented (2026-10-28). G4 owns publication, G5 optimization and
G6 attribution. By owner decision (M11 closeout), G4's first tranche is a
distinct `SimulationContextResolver`. It turns a log into the
`SimulationGameContext` that `selectSimulationModel` consumes and contains no
ceiling math. The publication design is proposed separately.

### Owner decisions (2026-10-28)

1. **The log-to-build authority is a region-aware deploy calendar.**
   - A build is assigned only when the fight lies unambiguously inside a
     proven deployment interval for the report's region.
   - It is never inferred from a fight date alone, or from the nearest
     SimulationCraft snapshot. Snapshots stay model-applicability evidence
     only.
   - An unresolved region, an ambiguous boundary or missing coverage gives
     SIMULATION_MODEL_CONTEXT_UNRESOLVED.
2. **Build appearance comes from wago.tools' archive.**
   - A wago timestamp is treated as wago's observation, not as a
     Blizzard-authored deployment time.
   - Build identity is verified against Blizzard-origin CDN data, and
     provenance is retained.
3. **Restart evidence: Blizzard plus dated reputable news reports.**
   - Blizzard-authored evidence is preferred when it establishes the fact.
   - A dated reputable report may establish a specific region's window. Its
     source, publication date, claimed region, window and evidence class are
     kept, and it is never labelled Blizzard-authored.
   - Conflicts, ambiguity, an imprecise window or a near-boundary fight are
     UNRESOLVED.
   - There is never a generic weekly-cadence assumption.
4. **One WCL request was made** for the canonical report's region: minimal,
   archived as evidence (`wcl-g4-region-b1pm-fight-48`).

### Interval rule (`src/simulation-context/intervals.ts`)

A log counts as build B in region R from the first evidenced restart in R
after B appeared, until the next build could have been available. A restart
disconnects every client; reconnecting clients run the listed build.

| Bound | Evidence | Conservative reading |
| --- | --- | --- |
| B listed (upper bound) | wago `created_at` (timezone undeclared) | `+12 h` (UTC−12 worst case), never read as UTC |
| B's identity | Blizzard CDN build config: MD5 equals key, `build-name` names B | unverified gives no interval for B, and none for the build before it |
| Consistency | CDN `Last-Modified` ≤ B listed (upper bound) | otherwise SOURCES_CONFLICT |
| Conflicting accounts | two R records whose windows overlap but differ | neither proves anything; every build whose span they touch has no R interval, RESTART_EVIDENCE_CONFLICT (fight: DEPLOYMENT_EVIDENCE_CONFLICT) |
| Restart | first R restart whose explicit window (≤ 24 h) STARTS at or after B listed and ENDS before the next build's availability | none gives NO_RESTART_EVIDENCE |
| Next build available (lower bound) | next build's Blizzard CDN `Last-Modified` (newest build: observation retrieval time) | no client could run it earlier |
| Interval | `[restart end + 12 h, next availability − 12 h)` | the margin absorbs log-clock and upload-timezone error and maintenance overrun |

- **Resolution** (`resolve.ts`):
  - The fight start is report start plus fight start, an observed Warcraft
    Logs fact.
  - Region is `Report.region.slug`, compared case-insensitively.
  - Exactly one containing interval gives RESOLVED.
  - Otherwise the result is UNRESOLVED, with one of: FIGHT_TIME_UNRESOLVED,
    REGION_UNRESOLVED, REGION_NOT_COVERED, DEPLOY_EVIDENCE_INVALID,
    NEAR_DEPLOYMENT_BOUNDARY, NO_PROVEN_DEPLOYMENT_INTERVAL or
    DEPLOYMENT_EVIDENCE_CONFLICT.
  - In every UNRESOLVED case `gameBuild` is null, so selection gives
    SIMULATION_MODEL_CONTEXT_UNRESOLVED.

### Evidence (`src/data/simulation-context/`)

Every timestamp must be a real instant (syntax plus a round-trip calendar
check), in years 2000–2999 so derived bounds stay representable. Otherwise
the dataset is invalid, and resolution is DEPLOY_EVIDENCE_INVALID; it never
throws. A fight start that is not a representable Date (finite but outside
±8.64e15 ms) is FIGHT_TIME_UNRESOLVED.

- **`build-observations.json`** (LIVE_BUILD_OBSERVATIONS), generated by
  `scripts/authority/capture-live-build-evidence.mjs`.
  - It holds 27 product-`wow` builds from 12.0.7 onward, each from wago's
    archive (response SHA-256 recorded) and verified on Blizzard's CDN.
  - Every identity verifies. wago observation minus CDN upload ranges from
    7 min to about 67 h; it is always positive, so the reading is consistent.
- **`regional-restarts.json`** (REGIONAL_RESTART_EVIDENCE), hand-entered from
  archived sources.
  - It covers US 2026-09-08 (Midnight 14:00–16:00Z), 09-22 and 09-29
    (14:00–15:00Z each), all from Blizzard Watch, a THIRD_PARTY_NEWS_REPORT.
  - Each source records its SHA-256, publication and retrieval times, claimed
    region and window, and verbatim excerpts. The article bytes stay in
    gitignored `.probe/`.
  - No Blizzard-authored region- and time-specific statement was found. The
    hotfix log's "[With weekly restarts]" tag states no region or time.
  - No EU report was found, so EU resolves nothing.
- **Derived US intervals:**
  - 12.1.0.69587: [2026-09-09T04:00Z, 2026-09-12T06:45Z).
  - 12.1.0.69933: [2026-09-30T03:00Z, 2026-10-12T04:18Z). The 09-22 restart
    does not prove 69933, because it may precede the worst-case appearance.
- **Canonical result.** The fight (US, 2026-10-01T03:05:22.921Z) resolves to
  12.1.0.69933 and selects 0a72e6a7. The region capture is used only after
  checking that it describes the committed context's report state (code,
  revision 51, report start, fight bounds).

### Ingestion

- `FIGHT_CONTEXT_QUERY` now requests `region { slug }`.
- `CombatFight.report.region` is one of:
  - KNOWN `{slug}`;
  - NOT_SUPPLIED (requested, null or malformed);
  - NOT_RETRIEVED (no key, as in every earlier capture).
- A missing region never fails ingestion. The analysis projection reads only
  report code and revision, so analysis/1 output is unchanged.
- **`NORMALIZATION_REVISION` `m3.3` → `m3.4`** (additive shape change; the
  repository contract bumps on any shape change).
  - Intentional public delta, as at the M11-F bump: every ANALYZED raid-night/1
    cell's `provenance.normalizationRevision` reads `"m3.4"`.
  - A stored `m3.3` result therefore compares NOT_COMPATIBLE
    (`sameNormalizationRevision` false).
  - analysis/1 carries no normalization revision, and its digests are
    unchanged.

### Boundaries

- `src/simulation-context/` is spec-agnostic. It imports only its evidence,
  zod, and two TYPES (`ReportRegion`, `SimulationGameContext`).
- It reads no SimulationCraft data, analyzer authority or model bundle.
- Nothing in `src` imports it yet
  (`tests/contracts/m11g4-simulation-context-layering.test.ts`).

### Carried correction

The character-profile MODEL_VERSION_COMPATIBILITY_UNKNOWN note now names the
injected model's build (it was hard-coded "12.1.0.69587"). The profile gate
fingerprint was re-pinned at the same revision.

## M11-G4-2 — simulation publication (internal)

**Status:** implemented, internal only (2026-10-28): `src/publication/`
(`pipeline.ts`, `record.ts`, `attainment.ts`). G4 owns publication (G5
optimization, G6 attribution).
G4-1 resolves a log's simulation context. G4-2 decides what may be PUBLISHED
from a simulation of the player's own logged fight, and under which gates.

### Owner decisions (2026-10-28)

1. **Content: the simulated value plus an attainment ratio.**
   - The simulated DPS is published with its interval.
   - The ratio (observed ÷ simulated) stays UNKNOWN (ATTAINMENT_NOT_COMPARABLE)
     until G1's ACTUAL_DPS is PROVEN to count pets and guardians as the
     engine's "player DPS including pets" does. Today it is corroborated,
     not proven.
2. **Exposure: internal only.**
   - It is a service result.
   - analysis/1, the public digests and every public route are unchanged.
   - Public promotion is its own reviewed tranche.
3. **Proof of the PUBLISHED path: synthetic gate inputs plus the real
   engine.**
   - This proves orchestration, NOT real-log reconstruction fidelity.
   - Real subjects must resolve NOT_PUBLISHED with their exact first failing
     gate.
4. **Policy: STANDARD_SIM_V1, with exactly one escalation to
   PRECISION_ESCALATED_V1.**
   - It escalates only on SIMULATION_PRECISION_NOT_MET.
   - If the escalated run also misses, the result is PRECISION_INSUFFICIENT,
     never a less precise number.
   - Both policies become the publication policies by this decision.

### Pipeline (`src/publication/`, shared and spec-agnostic)

The pipeline has two stages. Each gate runs in order; the first failure
becomes `NOT_PUBLISHED` with `{gate, code, reasons}`, and nothing past it
runs.

**Stage A, readiness (no simulation of the fight itself).**

1. **CONTEXT.**
   - `resolveSimulationContext`, then `selectSimulationModel` with the spec's
     validations.
   - Failure codes are the resolver reason (CONTEXT_UNRESOLVED) or the
     selection code.
2. **CHARACTER.**
   - Reconstruct the profile with the selected model's data.
   - Build the G3-2 fidelity probe job on that model and read its engine
     echo through a `ProfileEchoSource` port.
   - `assessProfileFidelity` must give SIMULATION_READY.
   - A probe transport or verification failure is CHARACTER /
     FIDELITY_PROBE_FAILED with its code. It is never "not ready".
   - **Implementation amendment.** The design said "through the backend",
     but the G3-5 runner protocol returns no profile echo (the echo is read
     from raw engine JSON runner-side, `runner/run-fidelity.ts`). Production
     runners also refuse FIDELITY_PROBE jobs (PRODUCTION-only default).
     - The CHARACTER gate therefore reads the echo through the port.
     - Production passes `NO_PROFILE_ECHO_SOURCE`, so the gate fails closed
       with CHARACTER / FIDELITY_PROBE_UNAVAILABLE. That is the correct
       production result until a reviewed protocol extension carries the
       echo and a deployment enables FIDELITY_PROBE. The protocol extension
       is done in M11-G4-3; enabling the job class remains a deployment
       choice.
     - Tests use the committed engine echo for exactly the probe job
       (checked by profile hash).
3. **ENVIRONMENT.**
   - Reconstruct the environment with the selected model's data and its
     applicability.
   - `assessEnvironmentPublishability` with that model's spec facts must be
     PUBLISHABLE.
   - `translateEnvironment(CURRENT_SETUP)` must succeed.

**Stage B, simulation (a plan from stage A, or a synthetic plan in tests).**

4. **SIMULATION.**
   - One PRODUCTION job per consumable variant (G3-4: run every variant and
     report the envelope). Each job uses:
     - `LOGGED_RECONSTRUCTION`;
     - the profile's character, with gear built by the same mapping the
       fidelity probe uses;
     - the translated environment;
     - ELITE_REALISTIC_V1 and STANDARD_SIM_V1.
   - Each job must be `ceilingEligibility`-eligible and carry a readiness
     attestation v3, built from the prepared job's hashes and the CURRENT
     gate revisions.
   - It runs through `SimulationBackend` (remote in production).
   - **Failure handling:**
     - SIMULATION_PRECISION_NOT_MET escalates once.
     - Any other failure is NOT_PUBLISHED and keeps its own code. It is never
       retried as a precision problem.
       - SIMULATION_RESULT_INVALID covers verification failures, including
         `settleTicket` refusals tagged transport BAD_RESPONSE (for example
         MODEL_PROVENANCE_MISMATCH), and a result whose execution profile
         revision is not the prepared job's.
       - SIMULATION_UNAVAILABLE covers NETWORK, AUTH_REJECTED, TICKET_LOST,
         CLIENT_DEADLINE and REQUEST_REFUSED transports, plus
         RUNNER_UNAVAILABLE and SIMULATION_TIMEOUT.
     - Any variant failing means the publication is NOT_PUBLISHED.

**The record (`simulation-publication/1`).**

- `status`, `gate`, `context`, `model`;
- per-variant `{variantId, policy, mean, ci95, relativeStandardError}`;
- `simulated`, the envelope across variants:
  `{low: min ci95.lower, high: max ci95.upper, meanRange: [min, max]}`;
- `observed`, the G1 ACTUAL_DPS state;
- `attainment`: UNKNOWN with its reason, or KNOWN
  `{low: observed ÷ high, high: observed ÷ low}` only when comparability is
  PROVEN;
- `provenance`: profile hash, environment hash(es), execution profile id and
  the verified execution profile revision (`executionProfileRevisions`,
  cross-checked against each prepared job; ELITE_REALISTIC_V1 is `5692cfec…`),
  gate revisions, publication revision.

It is an OBSERVATION. It carries no causal claim or coaching (CLAUDE.md
"Damage Output Diagnosis"); attribution is G6.

### Results

- **Canonical subject (real evidence).** CONTEXT resolves 12.1.0.69933 and
  selects 0a72e6a7.
  - Without an echo source: CHARACTER / FIDELITY_PROBE_UNAVAILABLE.
  - Without the owner's race statement: PROFILE_NOT_SIMULATION_READY.
  - With both: ENVIRONMENT / ENVIRONMENT_NOT_PUBLISHABLE with its real
    blockers; the backend is never called.
  - Without a region: CONTEXT / CONTEXT_UNRESOLVED.
- **The real runner service accepts the pipeline's PRODUCTION job and
  attestation** (fake engine, PRODUCTION-only service), and the result
  publishes.
- **Real engine** (`scripts/bench/m11g42-publication.bench.ts`, 0a72e6a7
  image, production job-class default, SYNTHETIC plan: canonical character
  plus the development environment relabelled ACTUAL_OBSERVED for the bench):
  - A 345,177 ms fight (the canonical length) PUBLISHES: 82,113 DPS, 95% CI
    [81,988, 82,238], RSE 7.8e-4 under STANDARD_SIM_V1 (1,992 counted
    iterations), no escalation.
  - A 60,000 ms fight is PRECISION_INSUFFICIENT after exactly one escalation:
    PRECISION_ESCALATED_V1 still measured RSE 9.03e-4 against its 6e-4 bound.
    Short fights refuse rather than publish a less precise number, as
    intended. The policies' bounds were calibrated on the 345 s fight.

### Facts the design rests on

- **No real subject can publish today.**
  - The canonical environment is BLOCKED by TARGET_SCHEDULE_UNRESOLVED,
    MATERIAL_RAID_BUFF_UNKNOWN, MATERIAL_CONSUMABLE_UNKNOWN,
    SETUP_AURA_UNCLASSIFIED and PINNED_MODEL_MISSING_OBSERVED_EFFECT.
  - The last holds on both registered models; the model-pin investigation
    found the three auras absent from every SimC data set it audited. A
    future model would be checked by the same gate.
  - The development fixture is DEVELOPMENT_FIXTURE, which
    `ceilingEligibility` refuses.
- **The runner has no deployed host.** TLS, capacity and hosting remain open
  (G3-5 follow-ups). Production use needs an owner-approved deployment; G4-2
  wires against `SimulationBackend` only.
- **Precision is already enforced.** The result parser and verification
  return SIMULATION_PRECISION_NOT_MET (`result-verification.ts`).
- **Only PRODUCTION jobs may publish.** The runner admits a PRODUCTION job
  only with a valid attestation v3 for the job's model and the accepted gate
  revisions (`readiness-attestation.ts`, `job-class.ts`).

## M11-G4-3 — the profile echo travels through the runner

**Status:** implemented (2026-10-28). This resolves the first G4-2
follow-up: the CHARACTER gate could not run in production because the runner
returned no profile echo.

- **Parser (`SIMC_JSON_2_PARSER_V3`).**
  - `parseSimcJson` attaches `profileEcho` (the `extractProfileEcho` reading
    of the same report) to a LOGGED_FIDELITY_PROBE job's result, and only to
    it. Every other result is unchanged.
  - The revision bump moves every parsed-result key, so a cached V2 probe
    result without an echo is never served.
- **Verification.**
  - `simulationResultSchema` validates the echo with the strict
    `profileEchoSchema`. A malformed echo is SIMULATION_OUTPUT_MALFORMED.
  - `verifySimulationResult` requires the echo exactly when the job is a
    fidelity probe (otherwise MODEL_PROVENANCE_MISMATCH, "profileEcho
    presence"). A ceiling result can never carry one, and a probe result
    must.
- **Transport.**
  - LOCAL and REMOTE deliver the same echo; REMOTE was tested over the
    in-process HTTP handler.
  - `RUNNER_PROTOCOL` is unchanged. A runner/Worker parser-revision mismatch
    already fails verification (`provenance.parserRevision`), so mixed
    versions fail closed.
- **Publication.**
  - `backendProfileEchoSource(backend)` runs the probe job on a
    `SimulationBackend` and returns the verified echo. A probe served as
    another class, or a result without an echo, is a typed failure.
- **Deployment policy unchanged.**
  - The production job-class default stays PRODUCTION only (G3-5). Under it
    the probe is refused (JOB_REJECTED), and CHARACTER fails closed as
    FIDELITY_PROBE_FAILED.
  - A publication deployment must enable FIDELITY_PROBE alongside PRODUCTION
    (`SIMC_RUNNER_JOB_CLASSES=PRODUCTION,FIDELITY_PROBE`). That choice belongs
    to the deployment, which is owner-controlled.
- **Real engine** (`scripts/bench/m11g43-remote-profile-echo.bench.ts`, Docker
  0a72e6a7, PRODUCTION + FIDELITY_PROBE):
  - Stage A on the canonical fight with the owner's race statement selects
    0a72e6a7.
  - CHARACTER is SIMULATION_READY on the transported real-engine echo.
  - The first failing gate is ENVIRONMENT with the canonical blockers (1.3 s
    wall).

## M11-G4-4 — DPS comparability: when attainment may be KNOWN

**Status:** implemented (2026-10-28). The G4-2 owner decision kept attainment
UNKNOWN until G1's ACTUAL_DPS was PROVEN to count pets and guardians as the
engine's DPS does. Both sides are now proven from committed evidence, and
comparability is a per-publication assessment rather than a global
constant.

- **Warcraft Logs, reconciled to the unit** (canonical subject: full-fight
  owned-pet events plus the G1 DamageDone table, log version 17):
  - table total = Σ (amount + absorbed) over the player and its owned pets
    against hostile NPCs, minus damage Warcraft Logs credits to another
    player (Bombardments, 190,342);
  - 45,992,351 − 190,342 = 45,802,009;
  - every pet row and every add row matches its events;
  - friendly-target damage (redirected Blessing of Sacrifice, 6940) is
    excluded;
  - `amount` excludes overkill.
  - This also explains G1's open 92,598 gap between the raw-amount rollup
    and the table: +2,092,963 absorbed, −1,810,023 redirected Blessing of
    Sacrifice, −190,342 Bombardments.
- **Engine** (real 0a72e6a7 golden): player DPS × duration = own damage
  actions + pet damage (relative error < 1e-12). Healing and absorb actions
  are not counted.
- **Remaining difference: targets.**
  - The table counts every hostile target, but a simulation job is single
    target (`additionalTargets` must be empty).
  - The engine also records damage before the target's health cap
    (`stats->add_result(result_amount)` at the pin), so overkill would only
    differ on a target that dies mid-simulation. A fixed-time single target
    cannot.
- **Rule** (`src/publication/comparability.ts`,
  `assessDpsComparability`). Comparability is PROVEN only when the observed
  DPS meets all four conditions:
  - its OWN attribution is RECONCILED (`src/publication/attribution.ts`);
  - it is the DamageDone table total;
  - it was read under an evidenced log version (17);
  - it went to exactly one target.
  Otherwise it is NOT_PROVEN with reasons, and attainment stays UNKNOWN
  (ATTAINMENT_NOT_COMPARABLE). Metadata alone never proves comparability.
- **Attribution, per observation** (`reconcileObservedAttribution`).
  - The observation's table total must equal, to the unit, Σ (amount +
    absorbed) over the player and its owned pets against hostile targets.
    Friendly-target damage is never counted.
  - The only permitted subtraction is damage from abilities PROVEN to be
    credited to another player (`CREDITED_TO_OTHER_PLAYER_ABILITIES`:
    Bombardments, with its evidence).
  - Incomplete owner or pet coverage, any unexplained difference (even one
    unit), or a credited ability the total did NOT exclude is UNRECONCILED.
    An attribution rule not yet seen in evidence therefore fails closed.
- **Record.** `ObservedDps` (KNOWN) now carries `logVersion`,
  `targetCount` and `attribution`; the record carries
  `comparability {state, reasons}`.
- **Canonical subject.** Its attribution reconciles (Bombardments excluded),
  but it hit 3 targets, so it is NOT_PROVEN (and its environment is BLOCKED
  anyway). A comparable single-target observation
  over a published envelope gives attainment KNOWN `[observed ÷ high,
  observed ÷ low]`.

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

---

## M11-G4-5 — 12.1.5 compatibility review

**Status:** review complete (2026-10-29). **Recommendation: do NOT register
a 12.1.5 model yet.** Nothing is registered. Analyzer authority stays on
33622e9d, and 0a72e6a7 stays the only Blood production model for 69933.
Promotion needs the owner decisions listed at the end.

**Owner decision (2026-11-02): DEFERRED, not registered.**

- **Tank load.** Wait for an upstream SimulationCraft fix to the Mythic
  difficulty lookup: never STANDARD_TANK_LOAD_V1 on 70575, never a new
  normal for the broken dummy, never a local engine patch.
- **Validation window.** Keep the snapshot-bounded Blood standard: no weaker
  window basis.
- **EU.** Coverage is deferred, and EU stays `REGION_NOT_COVERED`.
- **Today.** 12.1.5 / 70575 logs keep the typed model-not-available result,
  with no fallback.
- **Re-open.** Only as a fresh, reviewed registration tranche, once an
  upstream fix AND a validation window overlapping a provable deployment
  interval both exist.

The full decision is in `agent/follow-ups.md` ("After M11-G4-5").

### What Live is, and when

- Current Live is **12.1.5.70575** in every region (version server). It is the
  newest wago.tools observation; earlier 12.1.5 builds 70340, 70391, 70448 and
  70529 were each superseded within days.
- **Proven US interval** (G4-1 resolver, committed evidence): `[2026-10-28T03:00Z,
  2026-10-29T01:28:51Z)`.
  - Start: the US restart of 2026-10-27, 14:00–15:00Z (Blizzard Watch,
    `US-2026-10-27`, added to `regional-restarts.json`), plus 12 h.
  - End: 70575 is the newest build, so the end is the observations' retrieval
    time (recaptured 2026-10-29T13:28Z) minus 12 h.
  - The earlier 12.1.5 builds have no restart evidence and stay unresolved
    (`NO_RESTART_EVIDENCE`).
  - EU has no restart evidence, so EU fights stay `REGION_NOT_COVERED`.

### The candidate

- **SimC snapshots.** Upstream has four Live 70575 game-data snapshots:
  - `ec3422d640` (2026-10-23T21:06:16Z, hotfix 2026-10-23,
    `e41bd6f1…`): the first;
  - `12aa5dc041` (2026-10-24);
  - `47ad36940f` (2026-10-27);
  - `6a4500db0f` (2026-10-28T00:32:44Z).
  - Midnight HEAD (`710c2408bf`, 2026-10-28T13:36Z) has no later Live data.
  - Between the snapshots, only `sc_spell_data.inc` and
    `client_data_version.inc` change. No Death Knight spell changes, and no
    item effect changes. Code changes are DH, Hunter and Shaman only. Blood
    data is therefore equivalent across the four snapshots.
- **Candidate pin:** `ec3422d6409c9c0dc826e56da010396082a0608e` / 12.1.5.70575.
- **Built with the hardened recipe `simc-build/2`** (`runner/simc-build/v2/`).
  - Base `alpine@sha256:294b683c…` (3.24.2).
  - Full package closure locked: 60 build packages, 18 runtime packages.
    Both stages are verified equal to their lock, in the image and again
    offline.
  - PGO training run with fixed seeds (`deterministic=1`); not bit-reproducible (below).
  - Results: image `sha256:8de515f4…`, binary `b1913546…`, Alpine clang
    22.1.3, 1,808 s.
  - The build record stays in `.probe/g4/` (not committed: the model is not
    registered).
- **Exact-pin identity verified.**
  - `git_revision ec3422d640`; Live `12.1.5.70575`; `no_networking`.
  - Deterministic: repeated runs bit-identical.
  - STANDARD RSE 7.79e-4; ESCALATED 3.96e-4.
- **Per-model data regenerated with the candidate engine:**
  - consumables `simc-ec3422d6-4`, raid environment `simc-ec3422d6-2`;
  - semantic hashes equal to 0a72's;
  - token acceptance measured 22/67, identical to 0a72.

### Blood semantics, 69933 → 70575

- **APL.** The built-in Blood APL is identical; every APL change is in
  `unholy()`.
- **DK module code.** The diff is Unholy-only:
  - Festering Scythe GCD;
  - Putrefy gating;
  - Scourge Strike target cap;
  - army_claw spec gate;
  - the Blightfall warning removed;
  - a commented-out hotfix block.
- **Game data.** 150 spells changed. The Death Knight-relevant ones:
  - Gift of the San'layn 434152/434153 gain two spell labels; effects are
    unchanged.
  - Transfusion 1280386's duration goes from infinite to 10 s; effects are
    unchanged.
- **Core engine changes:**
  - `report_json` stat summing (#11963);
  - gear runes;
  - chain-multiplier passives;
  - racial buff lookup;
  - opt-in raid_event pulls (off by default);
  - the DUNGEON tank dummy no longer pauses.
- **Decisive finding: the standardized tank load changed meaning.**
  - What changed. The 12.1.5 client data (already in PTR 69848) moved the
    Mythic-raid expected-stat modifiers from difficulty 16 to difficulty 233.
    The rows are identical, including expansion row 487 with
    armor-constant ×1.649.
  - Why the engine misses it. SimulationCraft still reads
    `difficulty_e::MYTHIC` (16) for the Mythic tank dummy (`sc_enemy.cpp`,
    `get_armor_constant_mod`), so the candidate's Mythic dummy gets ×1.0.
    No upstream commit up to midnight HEAD addresses this.
  - Effect under the same job:
    - the dummy's physical melee hits are 34.6% weaker (234,415 → 153,322
      mean);
    - bleed damage is unchanged (+1.8%);
    - incoming DPS −23.7%;
    - Blood's healing −10…−45% (Death Strike heal −22%, Rune of Sanguination
      −45%);
    - Blood Draw −88%.
  - DPS moves −0.44% (82,311.5 → 81,952.5). The part of that due to the tank
    load, rather than to the 70575 data, is not separated.
  - Consequence: under this candidate, STANDARD_TANK_LOAD_V1
    ("SimulationCraft's standardized Mythic tank dummy") is no longer the
    load it was at 69933. Its meaning depends on the engine, which the name
    hides.
- **Other benches on the candidate:**
  - Fidelity: the canonical subject is MATCH with the owner race and
    PARTIAL (race only) without it, as at 0a72.
  - Execution profiles: pass.
  - Publication (synthetic): PUBLISHED at the canonical length; short fight
    PRECISION_INSUFFICIENT, as at 0a72.
  - Environment materiality: every field keeps its ENVIRONMENT_MATERIALITY_V1
    class. The closest is BLOODLUST_WHOLE_SECOND at 0.41%.
    - Against 0a72's committed facts, the environment bench fails (15
      measurements differ, as expected for another model).
    - With the candidate's own measured facts (scratch only), it passes
      fully: 0 mismatches, plus the stat-revisit, rank-token and round-trip
      assertions.

### Applicability: why registering now would cover no fight

- Blood windows are bounded by verified snapshots
  (`SNAPSHOTS_VERIFIED_EQUIVALENT_FOR_SPEC`). The candidate's window could be
  at most `[2026-10-23T21:06:16Z, 2026-10-28T00:32:44Z)`.
- The resolver cannot prove 70575 before 2026-10-28T03:00Z. The two do not
  overlap, so no fight would select the candidate.
- A 70575 fight resolves to its build and then fails closed with
  `SIMULATION_MODEL_NOT_AVAILABLE`. It is never sent to 0a72e6a7; a resolver
  test pins this.
- This is structural. A snapshot-bounded window only reaches a deployment
  interval once a later Live snapshot exists and is verified, so every
  extension waits for the next upstream data update.

### Hardened recipe (`runner/simc-build/v2/`)

- Owner closeout decision: the next build pins the immutable base and the
  exact package and toolchain inputs. simc-build/1 is unchanged; its
  approved artifacts keep their recipe.
- What v2 pins:
  - the committed digest (`alpine.digest`), pulled by digest; no tag is ever
    resolved;
  - exact-version lockfiles for both stages, installed `name=version`, and
    `diff`ed against `apk info -v`, so a stage fails on any drift;
  - the commit, which has no default and is verified by full hash;
  - `deterministic=1` on the PGO training run (seeds only; see Reproducibility).
- `build.mjs` re-checks:
  - the commit;
  - the build-stage vs final-image binary hash;
  - both package manifests against the locks, offline (`TOOLCHAIN_DRIFT`).
  - It then writes `simc-build-record/2` with the lock hashes.
- `--no-cache` rebuilds every layer, which is how reproducibility is checked.
- The recipe revision is per artifact. The exact-pin bench now takes it from
  the model rather than from the global `BUILD_RECIPE_REVISION`, and checks
  it against the build record.

### Reproducibility

A second `--no-cache` build used identical inputs (recipe, both lockfiles,
both installed package sets, commit ec3422d6). It produced a **different
binary**: image `8f980e04…`, binary `1fa9954e…`, against `b1913546…`.

- **The recipe pins its inputs but is not bit-reproducible.**
- **Embedded build time.** The engine embeds `__DATE__`/`__TIME__` (the
  `build_date`/`build_time` of `report_json`): 13:18:09 vs 14:01:47 UTC.
- **Different optimised code.** The binaries differ by 57 KB (159,565,224 vs
  159,622,176 bytes). The PGO training run is multi-threaded (engine default
  `threads=0` = all cores). `deterministic=1` fixes seeds but not
  scheduling, so the merged profile, and with it the optimised code, can
  differ.
- **Nothing relies on reproducibility.** An artifact is approved by its own
  binary hash, and the runner refuses any other. As at simc-build/1, a
  rebuild is a new artifact that needs its own registration. A candidate
  hardening (simc-build/3) is a follow-up.

### Recommendation and owner decisions before promotion

**Do not register now.**

- Under the current window basis, the candidate would cover no fight.
- On a 12.1.5 model, STANDARD_TANK_LOAD_V1 would silently mean a different
  incoming-damage load.

Promotion needs:

1. **Tank load.** Choose one:
   - wait for an upstream fix of the difficulty-233 lookup and pin that
     snapshot;
   - accept a new, separately named tank model whose meaning is the
     engine's Mythic dummy at that model.
   A local engine patch would leave upstream-pinned provenance and is not
   recommended.
2. **Window basis.** Choose one:
   - wait for a later Live 70575 snapshot, verified Blood-equivalent, so the
     window extends past 2026-10-28T03:00Z;
   - approve a new basis, for example "verified no newer Live snapshot as of
     a recorded check". That trades evidence for latency.
3. **EU.** EU coverage needs EU restart evidence.

---

## M11-G4-6 — reproducible engine recipe (`simc-build/3`)

**Status:** implemented (2026-10-29).

- simc-build/3 makes the engine's embedded build time a function of the
  commit.
- It does NOT make the binary bit-identical: the LLVM PGO training profile
  still varies between runs.
- What is shown instead is narrower: **functional equivalence for the tested
  builds and jobs**. The two v3 builds and the G4-5 v2 candidate give
  identical single-threaded engine output for the development Blood jobs
  tested.
- `scripts/bench/m11g46-functional-reproduction.bench.ts` repeats that check
  for any two images and jobs it runs.
- This does not prove profile independence for arbitrary inputs, specs or
  future rebuilds.
- Approval is unchanged: every artifact, including a rebuild, is approved by
  its own binary hash.

The G4-5 review found that `simc-build/2` pins every input but is not
bit-reproducible: two `--no-cache` builds of identical inputs differed. The
aim is that anyone can re-derive an approved engine from its committed
recipe, lockfiles and commit, and check it independently of our build host.

### Recipe (`runner/simc-build/v3/`)

simc-build/3 keeps every simc-build/2 pin: the same digest, the same exact
package closures, the same exact-commit checkout and the same make
invocation. It removes the two identified causes:

- **Embedded build time.** The engine embeds `__DATE__`/`__TIME__` (the
  `build_date`/`build_time` of `report_json`).
  - `SOURCE_DATE_EPOCH` is now the checked-out commit's own committer time
    (`git log -1 --format=%ct`). It is exported before both compiles.
  - Verified: the pinned clang 22.1.3 honours it for `__DATE__`/`__TIME__`.
  - The build time becomes a function of the commit, so it is stable.
- **Multi-threaded PGO training.** The training run now passes `threads=1` as
  well as `deterministic=1`. This removes thread scheduling as a source; it
  did not make the profile stable (Evidence).
- **Diagnostics.** The image carries the epoch and the merged PGO profile's
  SHA-256. A non-reproduction can then be localised to the profile or to the
  compile.
- **`build.mjs --expect-binary <sha256>`.**
  - It writes `simc-build-record/3` with `pgoProfileSha256` and
    `reproduction {state, expectedBinarySha256}`.
  - It then fails `NOT_REPRODUCED` unless the binary hashes as expected.
- **simc-build/1 and /2 are frozen.** Contract tests pin their Dockerfile
  hashes to the records of the artifacts they built.
- **Functional reproduction bench**
  (`scripts/bench/m11g46-functional-reproduction.bench.ts`).
  - Runs the same prepared single-threaded dev Blood jobs (BENCHMARK_300_T1,
    both execution profiles) on two images.
  - Requires the same engine identity and a full structural match of the
    raw engine JSON (`tests/support/simulation/engine-json.ts`): container
    kinds, array lengths, own key sets, empty containers and every primitive.
    Only wall-clock statistics, `timestamp` and the build-host time fields
    are excluded.
  - A pass is evidence for the jobs it ran, not for every input. It approves
    nothing.

### Evidence

All from local Docker builds and runs (`--network none` for engine runs);
records and outputs are in `.probe/g46/`.

- **Two `--no-cache` builds of `ec3422d6`.** The inputs were identical:
  recipe `bf82d406…`, both locks, both installed package sets, and epoch
  1792789576 (2026-10-23T21:06:16Z).
  - A: image `ca4d35b9…`, binary `9805c832…`, PGO profile `307e2abe…`.
  - B: image `6d219c3c…`, binary `8b2ee5b5…`, PGO profile `f5fe2bd5…`.
  - B failed `--expect-binary` with `NOT_REPRODUCED`, as designed.
- **The build time is fixed.** Both binaries embed `Oct 23 2026 21:06:16`, the
  commit's time. The G4-5 v2 builds embedded each build's own clock (13:18:09
  vs 14:01:47).
- **The PGO profile is the remaining variable.**
  - The merged profile differs between A and B, although the training run
    was single-threaded with fixed seeds. The optimised code differs with it:
    sizes 159,690,336 vs 159,754,856 bytes.
  - The cause inside the training run is not identified. Likely candidates
    are counters on address-dependent paths (ASLR) or wall-clock-dependent
    paths; this is not verified.
- **For the tested jobs, results did not depend on the profile.** The
  development Blood job, single-threaded and deterministic, produced
  bit-identical engine JSON on A, A again, B and the G4-5 v2 candidate
  (`b1913546…`, a third profile and a different recipe):
  - at 2,000 iterations (ad hoc flat-leaf comparison): 45,947 leaves, 0
    differing;
  - in the committed bench (structural comparison) at 300 iterations under
    SIMC_DEFAULT_PINNED and ELITE_REALISTIC_V1: 45,691 primitive leaves
    each, 0 differing paths, both A vs B and A vs v2.
- **Negative control.** The same bench against the approved 0a72e6a7 engine
  fails on engine identity (`ec3422d640` vs `0a72e6a746`); 29,842 paths
  differ.
- **Multi-threaded runs are not a reproduction test.** At `threads=8`, the
  SAME binary differs from itself in the last bits of 5,829–6,149 leaves
  between runs, because per-thread results merge in a scheduling-dependent
  order. Binaries differ from each other by the same amount (5,667–5,706).
  This matches the existing exact-pin contract: multi-threaded runs
  reproduce within `RESULT_REPRODUCIBILITY_TOLERANCE`, single-threaded runs
  bit-identically.

### What this means

- **There is no general reproducibility guarantee.**
  - The binary hash is not re-derivable while PGO is used.
  - Functional equivalence is shown only for the builds and jobs above.
  - A rebuilt engine is a new artifact. It needs its own approval, which may
    cite a functional-reproduction bench run as supporting evidence for the
    jobs that run covered.
- **`threads=1` on the training run is kept but not credited.** It removes
  one scheduling source, but the profile still varied.
- **Bit-identical binaries would need one of:**
  - the PGO profile pinned as a distributed build input;
  - no PGO, which is slower and diverges from the official recipe.
  Neither is needed for the approval model, because approval is by binary
  hash. Whether stronger reproducibility is wanted is optional and the
  owner's call.


---

## PREP-1 — consumable status: the shared preparation producer (internal)

**Status:** implemented, internal only (2026-10-29). Owner choice: consumable
status first, built internally; public exposure comes back to the owner. The
analysis service now produces, for every analyzed player, the health-potion,
healthstone and combat-potion status the product intent requires. No public
document carries it yet, and an unsupported specialization still gets none
(see "Owner decisions pending").

### Producer (`src/analysis/preparation/`)

`assessConsumableStatus(fight, actorId)` is a pure function of the
normalized fight and the identity data. It is a PARALLEL producer: it never
reads a specialization result, and no specialization imports it
(`tests/contracts/preparation-layering.test.ts`).

- **Statuses.** All three kinds are always present (a kind is never
  omitted):
  - `OBSERVED {count, uses}`: the count is complete. Zero is reported only
    under COMPLETE coverage for the player over the whole fight.
  - `UNKNOWN {reasons, observedAtLeast, uses}`: the uses seen are a lower
    bound, never a count. Every reason is kept.
- **Uses.**
  - Every kind counts the player's completed casts of a classified spell
    inside the fight. The cast gate is `gateAbsenceClaim` over CASTS, for the
    player, over the fight window; it checks capability, actor scope and
    coverage, in that order.
  - A combat potion taken BEFORE the pull has its cast outside the fight. It
    is counted from a buff removal with no in-fight application or cast.
    - That removal is always a use.
    - Its timing is BEFORE_PULL only under COMPLETE cast AND aura coverage.
      Otherwise the missing cast or application could sit in a gap, so the
      timing is UNRESOLVED (review cycle 1).
  - The pull snapshot (COMBATANT_INFO) carries no auras. So a fight shorter
    than the longest combat-potion buff (60 s in this data) leaves the combat
    potion UNKNOWN: a pre-pull buff could outlast it unseen.
  - Each use keeps its spell, name, timing (IN_FIGHT or BEFORE_PULL) and its
    evidence locator.
- **Fail-closed identity.**
  - A completed player cast of a spell outside the data whose Warcraft Logs
    ability name says "Potion" or "Healthstone" makes the affected kinds
    UNKNOWN (`UNCLASSIFIED_CANDIDATE`). A consumable newer than the data is
    therefore never read as no use.
  - So does an unknown buff on the player named "Potion" (combat potion). An
    unknown pre-pull potion is seen only as its buff (review cycle 1).
  - Identity data that fails validation makes every kind UNKNOWN.
- **Authority.** Uses are `WCL_OBSERVED_FACT`. Which spell is which
  consumable is `RUNTIME_GAME_DATA`, named by artifact revision and client
  build. These live on the report, not in the rotation authority vocabulary
  (`DecisionAuthorityKind` stays `SIMC_APL` only).
- **Racial abilities** are never classified: the extractor fails if one
  would be, and the analyzer cannot count an unclassified spell.

### Identity data (`src/data/game/preparation-consumables.json`)

Machine-extracted by `scripts/authority/extract-preparation-consumables.mjs`
from the ANALYZER AUTHORITY model's client data (33622e9d, 12.1.0.69587). The
registry contract requires every analyzer runtime artifact to be on that pin.

- **Classification is the client's shared cooldowns, not names:**
  - HEALTH_POTION: every spell on shared cooldown category 30, except
    healthstones (41 spells);
  - COMBAT_POTION: every spell on category 4 (75 spells);
  - HEALTHSTONE: a direct heal named "…Healthstone" with its own cooldown
    category (6262, 452930, and Legion's 200452). This excludes the
    "Empowered Healthstone" talent modifiers, which are auras.
- **A category is a SLOT.** Old potions, engineering injectors and mana
  potions count as uses of the slot whose cooldown they share. Each use is
  named.
- **Guards.**
  - Anchor rows check the column layout before anything is classified:
    Healthstone, Silvermoon Health Potion and Potion of Recklessness must
    read their known categories and effects.
  - A race mask or a `racial_spells.inc` entry stops the extraction.
  - The loader fails closed on a malformed, duplicated or anchor-less
    artifact.
- **Corroboration.**
  - Every simulation-model POTION aura (the independent item-effect join) is
    a COMBAT_POTION here.
  - Names match Warcraft Logs' own ability names in committed report master
    data: Healthstone, Demonic Healthstone, both Silvermoon potions and three
    combat potions.

### Services

- `FightAnalysis.preparation` is required:
  - `ASSESSED {report}` when a fight was retrieved;
  - `NOT_ASSESSED {NO_FIGHT_RETRIEVED}` when none was.
- `analyzeFight` assesses right after state construction, before and
  independently of the analyzer. An analyzer that returns
  AUTHORITY_NOT_AVAILABLE leaves the same report (tested).
- The raid-night service assesses each player's focused view.
- Ingestion scope is derived from the selected analyzer's requirement
  unioned with the producer's declared `PREPARATION_REQUIREMENT`
  (PLAYER_CONTEXT, no resources). It widens nothing today, and a future
  wider producer could not be silently under-fetched.
- An unsupported specialization is still answered before ingestion, so its
  preparation is NOT_ASSESSED.

### Evidence on real fights

Over the 36 committed event slices, with each slice's vouched subject:

- **COMPLETE slices:** health potion and healthstone are OBSERVED 0.
- **PARTIAL or out-of-scope slices:** UNKNOWN with the gate's reason, never
  0.
- **Combat potion:**
  - UNKNOWN on every slice shorter than 60 s, keeping its lower bound (for
    example ≥1 for the Blood 45 s slice, which contains the subject's potion
    cast);
  - OBSERVED 1 on the 145 s Brewmaster segment, whose window starts after
    the potion, from the buff removal.

No committed fight contains a health potion or healthstone USE, so those
paths are proven on synthetic fights.

### Owner decisions pending (before the requirement is met publicly)

1. **Public exposure.**
   - Today no public document carries the statuses.
   - Exposing them is a public-contract and digest change: an additive field
     on the strict v1 schemas, including the unanalyzed variants, whose
     current rule forbids analysis-shaped fields.
2. **Unsupported specializations.**
   - Product intent requires the status even when gameplay is unsupported.
   - Today such a request spends no Warcraft Logs points and retrieves no
     fight.
   - Meeting the intent means ingesting for preparation alone, which is a
     real per-request cost.
3. **Slot semantics.** Is "combat potion" every use of the shared
   combat-potion cooldown (mana and utility potions included), and "health
   potion" every use of the health-potion cooldown (injectors and vials
   included)? Or a narrower throughput / health-potion-item definition? The
   data names every use, so a narrower rule is a data change, not a
   re-capture.

---

## PREP-2 — consumable status on every public report

**Status:** implemented (2026-10-30). This closes the "Always-Report
Consumables" product-intent gap for the single-fight analysis result.

### Owner decisions (2026-10-30)

1. **Public field: yes, now.** An additive `preparation` block on the v1
   public analysis result. Public output changes, intentionally.
2. **Unsupported specializations: retrieve the fight.** Every report carries
   the status, so an unsupported specialization's fight is retrieved for the
   preparation producer alone. This is an accepted real Warcraft Logs cost
   per request.
3. **Definition: the shared cooldown slot**, as built in PREP-1. Every use of
   the health-potion or combat-potion cooldown counts, and each use is named.

### Public contract (`src/contracts/analysis-contract.ts`)

- **Where.** `preparation` is in the common fields, so it appears on EVERY
  status.
  - It is optional in the schema only: adding an optional field is not a
    version change. The projection always emits it.
  - The unanalyzed-variant rule ("nothing analysis-shaped") is amended
    explicitly. Consumable status is observed use, not gameplay evaluation,
    has no zero-denominator reading, and is what makes an unsupported
    report useful rather than empty.
- **Shape.**
  - `{assessment: "ASSESSED", category: "PREPARATION", authority:
    "WCL_OBSERVED_FACT", identityData {RUNTIME_GAME_DATA revision, client
    build} | null, statuses {healthPotion, healthstone, combatPotion}}`;
  - or `{assessment: "NOT_ASSESSED", reason}`.
  - Each status is `{countState: "OBSERVED", count, uses}` or
    `{countState: "UNKNOWN", reasons, observedAtLeast, uses}`. An UNKNOWN
    status has no `count` key.
  - A use is `{spellId, name, timing, evidence}`, with the evidence locator
    as on decisions.
- **Discriminators are `assessment` and `countState`, never `state`.** The
  wire bans `state` so no internal state object can pass as contract (m6c
  guard).
- **Vocabularies** (unknown codes, use timings, not-assessed reasons) are
  pinned equal to the producer's and the services'.
- **Coverage gates** published are the four the shared gate returns. Any
  other gate fails the projection closed.
- **Not published:** the identity-load validation detail (only the code).

### Service (`analyzeFight`)

- An unsupported specialization (both paths: no identity mapping, no public
  analyzer) retrieves the fight ONCE, with scope derived from
  `PREPARATION_REQUIREMENT` alone (PLAYER_CONTEXT, no resources). The
  derived scope is passed in; no literal scope exists.
- The analyzer still never runs, and `scope` records what was retrieved.
- A retrieval failure, or a report revision changed since preflight, keeps
  the SPEC_NOT_SUPPORTED answer, with preparation `NOT_ASSESSED
  (RETRIEVAL_FAILED)` and `scope: null`. A correct answer is not turned into
  an error.
- Supported specializations are unchanged from PREP-1.

### Corpus and existing tests

Tests that pinned "unsupported = zero ingestion" encoded the superseded
decision. They now pin exactly one preparation-only retrieval
(`PLAYER_CONTEXT`, no resources) and no analyzer run:

- `analysis-composition-refusals`, the m10d Arms Warrior invariance and m6c;
- the two corpus APPLICATION_SERVICE cases (scope `PLAYER_CONTEXT`). The
  case whose id said "retrieves-nothing" is renamed
  `…-retrieves-for-preparation-only`, and the corpus report is regenerated
  from execution.

The per-spec public projection tests build preparation exactly as the
service does.

### Not covered

The raid-night public document carries no per-player analysis documents, so
nothing public changed there. Raid night's unanalyzable players are still
not ingested, and the preparation of the players it does analyze stays
internal. See `agent/follow-ups.md`.

---

## PREP-3 — consumable status in the raid night

**Status:** implemented (2026-10-30). This closes the raid-night half of the
"Always-Report Consumables" requirement.

### Owner decisions (2026-10-30)

1. **Compact per cell.** Each present player's cell carries the three
   consumables as a complete count, or UNKNOWN with a lower bound and reason
   codes. Named uses and evidence stay in the single-fight report.
2. **Retrieve "nobody analyzable" fights.** A fight whose present players
   are all unsupported or unresolved is retrieved once, for consumable
   status. This is accepted per-fight cost, consistent with PREP-2.

### Orchestration (`raid-night-service.ts`)

- **Zero ingestion now means everyone absent.** Any present player, with an
  unsupported or unresolved specialization included, needs the fight.
- **Scope.** The fight's requirement is the selected analyzers' plus
  `PREPARATION_REQUIREMENT`. A preparation-only fight therefore retrieves with
  no resources. `talentImportActorId` names a supported player when there is
  one, else a present one.
- **Assessment.** Every present player is assessed from their OWN focused
  view (`assessConsumableStatus(focused, sourceId)`), independently of any
  analyzer, so a raid-night cell's preparation equals the single-player one
  (regression-tested).
- **Failure.** The existing fight-failure semantics are unchanged: a
  non-fatal failure gives present players ANALYSIS_UNAVAILABLE
  (FIGHT_INGESTION_FAILED), and a fatal one fails the night, as for any
  fight. Their preparation is NOT_ASSESSED (RETRIEVAL_FAILED), never zero.

### Domain (`src/aggregation/`)

- **Cells.** `PlayerFightResult` present kinds (ANALYZED, NOT_ANALYZED,
  ANALYSIS_UNAVAILABLE) carry a required compact `CellPreparation`, built
  once by `cellPreparationOf`. The full report stays releasable, as with all
  analysis. ABSENT carries none.
- **The M7-D gate is tightened.** A NOT_INGESTED fight with ANY present cell
  is `PROCESSING_CELL_MISMATCH`, an unresolved specialization included, so
  an orchestration bug that skips a needed retrieval fails closed.
  NOT_INGESTED is coherent only when everyone was absent.
- **Layering.** The not-assessed reasons moved into the preparation module
  (re-exported by the services), so `cell.ts` names them without reaching
  the services, as the aggregation layering requires.

### Public raid-night contract

- **Field.** `preparation` (optional in the schema, always emitted on
  present cells) is on ANALYZED, NOT_ANALYZED and ANALYSIS_UNAVAILABLE
  cells.
- **Shape.**
  - `{assessment: ASSESSED, statuses{healthPotion, healthstone,
    combatPotion}}`, or `{assessment: NOT_ASSESSED, reason}`;
  - each status is `{countState: OBSERVED, count}` or `{countState:
    UNKNOWN, observedAtLeast, reasonCodes}`, with no count when UNKNOWN.
- **Vocabulary.** The codes and reasons reuse the single-fight contract's
  public vocabularies. The projection copies; it never aliases.

### Test changes required by the decision

- m7f orchestration: an all-unsupported or unresolved fight is now retrieved
  once (`INGESTED`) instead of skipped.
- m8d: its no-ratio guard now checks whole words (and word prefixes) instead
  of substrings, because "preparation" contains "ratio". `matchRate`,
  `passRatio` and `percentage` still fail it.
- The single-player-truth regression builds its reference cell's
  preparation as the services do.

---

## PREP-4 — real consumable evidence in the regression corpus

**Status:** implemented (2026-10-30). Until now, the health-potion and
healthstone paths were proven only on synthetic fights; no committed fight
contained a real use. Real evidence was already on disk: the M11-E2 capture
(`b1PmaKrd6CDfzngc` fight 48), authorized at M11-E2. It is the whole-fight,
unfiltered All stream, so it holds every raider's events. **No new Warcraft
Logs request was made.**

**Two regression-corpus actor slices** of other players in that pull:

- **Actor 121 (Mage / Arcane), the first 65 s.** A Light's Potential buff is
  removed at +28.3 s with no application or cast in the window: a real
  pre-pull combat potion.
- **Actor 122 (Shaman / Restoration), a 20 s mid-fight window.** A
  Healthstone and a Silvermoon Health Potion, 1.1 s apart.
- **How they were cut.** Cast, aura and combatantinfo families only, each
  granting exactly what its window and families vouch for. The mid-fight
  window has no combatantinfo, so it grants CASTS and AURAS only.

**Through the real service.** `APPLICATION_SERVICE.FIGHT_ANALYSIS` gained
an optional `expected.preparation`. Both subjects are unsupported, so the
cases run the PREP-2 path end to end:

- **The Mage:** combat potion OBSERVED 1 (`BEFORE_PULL`); health potion and
  healthstone OBSERVED 0, as observed facts under COMPLETE coverage.
- **The Shaman:** health potion and healthstone OBSERVED 1 each (named
  spells, `IN_FIGHT`); combat potion UNKNOWN
  (`FIGHT_SHORTER_THAN_LONGEST_COMBAT_POTION_BUFF`, lower bound 0), never
  zero.

**Size policy respected.** The owner's 5.5 MiB regression-corpus notice
line stands, with the total now 5,706,262 bytes. A whole-fight slice of a
third subject (452 KB, all three kinds) was cut and discarded because it
would have crossed the line. That evidence still exists in the gitignored
capture if the evidence archive is ever the right home for it.

## PREP-5 — the MCP tool descriptions state the consumable status

**Status:** implemented (2026-10-31), autopilot queue entry PREP-5. It
closes the last open item of the preparation PRODUCT-INTENT GAP.

- **What changed.** One paragraph in each MCP tool description:
  `analyzeToolDescription` and `raidNightToolDescription`. The outputSchemas
  already advertised `preparation`. No schema, projection or analysis
  changed, and the REST surface is untouched.
- **What the paragraph says.**
  - The status is always carried: on every single-fight status,
    SPEC_NOT_SUPPORTED included, and on every present raid-night cell.
  - It covers health potion, healthstone and combat potion, and it is
    specialization-independent, not gameplay analysis.
  - OBSERVED is a complete count. UNKNOWN carries its reasons and
    `observedAtLeast`, a lower bound and not a count. Zero is reported only
    under complete coverage.
  - NOT_ASSESSED claims nothing.
  - It is an observed fact. It never says a consumable should have been
    used.
- **Why it matters.** The description is the only documentation a model
  reads before interpreting a result. Without it, `observedAtLeast` reads as
  a count and an absent use reads as a mistake.
- **Pinned.** `tests/contracts/prep5-tool-description-consumables.test.ts`
  pins the phrases. It also requires every field and value the paragraph
  names to exist in that tool's advertised output schema, so the prose
  cannot drift from the contract.

## TEST-HYGIENE — the offline suite reads no credentials file

**Status:** implemented (2026-10-30). Resolves the TEST-HYGIENE follow-up.

The `workers` Vitest project boots the Worker from
`tests/workers/wrangler.jsonc` rather than the production `wrangler.jsonc`.
This changes no runtime behaviour, and the deployed config is untouched.

- **Why a copy.** Wrangler loads `.dev.vars` (or `.env`) from the directory of
  the config it is given. `@cloudflare/vitest-pool-workers` passes only a
  config path. Pointing it at the production config therefore made every
  `npm test` read the developer's real Warcraft Logs credentials, even though
  the sentinel bindings and the outbound guard kept them from being used.
- **Why it cannot drift.** `tests/contracts/test-hygiene-dev-vars.test.ts`
  requires the copy's normalized settings (`unstable_readConfig`) to equal the
  production config's, apart from the file's own path. The relative `$schema`
  and `main` are rebased, so `main` resolves to the same `src/api/worker.ts`.
  Change both files together.
- **Credential loading stays in one place.** `vitest.probe.config.ts` remains
  the only config that reads `.dev.vars`.

## M12-A — Healer Foundation: death timelines (internal)

**Status:** implemented (2026-10-30). This is the first tranche of
Milestone 12. Owner choice: "Start Healer Foundation".

**What it adds.** `src/healing/`, the shared healing domain. Its first
primitive is `deathTimelinesOf(fight, actorId, lookbackMs = 10 000)`
(`src/healing/death-timeline.ts`, revision `healing-death-timeline/1`). It
reports what happened TO an actor before each of its positive deaths
(M11-F `observedDeathsOf`):

- damage taken, healing received, and damage or healing absorbed;
- each entry with its raw fields verbatim and its reported source;
- the dying actor's own health snapshot, when Warcraft Logs attached one of
  that same actor instance (never another actor's).

Its authority is `WCL_OBSERVED_FACT`.

**What it refuses to say.**

- **No totals.** The accounting meaning of raw `amount` is follow-up M1,
  still not proven.
- **No "no healing was received".** Each of DAMAGE, HEALING and ABSORBS
  carries its own coverage from the shared absence gate, over that actor and
  that window.
  - COMPLETE means the list is complete for that category.
  - Otherwise the category is UNKNOWN with the gate's reason
    (`INSUFFICIENT_SCOPE` for an ally under PLAYER_CONTEXT,
    `INSUFFICIENT_COVERAGE`, `CAPABILITY_UNVERIFIED`), and the entries are
    what was observed.
- **Nothing after the death.** Entries at the death's millisecond are marked
  `atDeathTime`, because retrieval order is not game order.
- **No inferred killer.** The killer is never taken from the last hit.
- **No overlap between timelines.** A window never reaches back past the
  fight start or the same instance's previous death.
- **Nothing about unobserved deaths** (`absenceSemantics: "NONE"`).

**Boundary.** `src/healing/` reconstructs facts. Healer specialization
evaluators under `src/specs/<class>/<spec>/` will own verdicts.
`tests/contracts/m12a-healing-layering.test.ts` pins four rules:

- it imports only the engine and the capability vocabulary;
- it calls no clock, randomness or network primitive;
- it declares no specialization or judgement vocabulary;
- nothing in production imports it yet. This is a milestone guard, amended
  by name when the first consumer lands.

**Scope.** No production consumer exists, so no analyzer declares
FULL_RAID yet. The primitive needs no scope rule of its own: under
PLAYER_CONTEXT an ally's categories come back `INSUFFICIENT_SCOPE` through
the shared gate. The consumer that publishes it must declare FULL_RAID
through its requirement (CLAUDE.md "Ingestion Scope Derivation").

**Evidence.** The 5 s before the one friendly player death in the M11-E2
capture (actor 5, Warrior) is committed as
`wcl-b1pm-fight-48-warrior-5-death-5s`. No new Warcraft Logs request was
made. The real timeline is asserted over those bytes:

- 13 damage-taken, 38 healing-received and 3 absorb entries;
- COMPLETE in all three categories;
- killer 161 with ability 1,295,173;
- a killing blow with overkill 81,824 and 0 hit points.

The corpus stays under the 5.5 MiB line (5,748,495 bytes).

## M12-B — Healer Foundation: damage episodes (internal)

**Status:** implemented (2026-10-31). This is the second tranche of
Milestone 12.

**Owner decision (2026-10-31): healer evidence policy.**

- The regression corpus stays at 5.5 MiB. Its remaining ~18.6 KB is treated
  as exhausted.
- The full real evidence needed to establish healer behavior goes to the
  evidence archive.
- From that evidence, derive the smallest deterministic regression fixture
  that protects the proven behavior.
- Never weaken evidence or discard meaningful context to fit.
- If several M12 slices produce genuinely minimal fixtures that cannot fit,
  stop and bring a measured proposal: the extra size, and what it buys.
- The limit is never raised preemptively for one tranche.

**What it adds.** `damageEpisodesOf(fight, gapMs = 2 000)`
(`src/healing/damage-episodes.ts`, revision `healing-damage-episodes/1`,
authority `WCL_OBSERVED_FACT`) answers when damage arrived on the raid and
on whom.

- **Inputs.** Every DAMAGE event whose target is in the declared friendly
  roster, grouped by ability into episodes of hits no more than `gapMs`
  apart.
- **Per episode:** first and last hit, hit count, the reported sources, and
  per target the hit count and the lowest observed health. Health comes only
  from a snapshot of that same target instance (the M12-A identity rule).
- **Grouping only.** The gap is a grouping parameter, not a judgement.
  Nothing is labelled raid-wide, dangerous or healable here; a consumer
  applies its own declared threshold.
- **The roster is declared.** It is `breadth.friendlyActorsInScope`, which
  production fills only under FULL_RAID.
  - Without it the report is `ROSTER_NOT_IN_SCOPE`, with no episode list at
    all. An empty list would read as "the raid took no damage".
  - This is the first reader of that field.
- **Coverage is all or nothing for the roster.** An episode is COMPLETE only
  when DAMAGE coverage holds for EVERY roster player over
  `[first hit - gapMs, last hit + gapMs]`. Then no hit of that ability is
  missing inside it and none sits close enough outside to have extended it.
  Otherwise it is UNKNOWN, and records:
  - `beyondFightEdge`: the margin runs past the evidence;
  - `uncoveredActors`, each with the shared gate's reason.
- **Never:** totals (follow-up M1), damage dealt by the raid, cause or
  avoidability.

**Evidence plumbing (test support and tooling, no production change).**

- **Slicer.** `scripts/sanitize-probe.mjs --friendly-players-slice` (revision
  `sanitize-probe-8`) derives the roster from a committed fight context's
  `friendlyPlayers`.
- **Loader.** `tests/support/corpus/` gained the `FIGHT_FRIENDLY_PLAYERS`
  actor-slice mode. The loader re-derives and re-checks the roster exactly
  as it does for owned-pet slices.
- **Fight builder.** A bundle of such slices builds a FULL_RAID fight with
  that roster in scope.

**Evidence.**

- **Archive.** Three friendly-players segments of the M11-E2 capture
  (fight +69.5 s to +77.0 s, 974,973 bytes, ordinary archive growth). No new
  Warcraft Logs request was made.
- **The real result**, checked against values derived independently from
  the raw bytes:
  - 15 episodes, 5 COMPLETE;
  - ability 1,285,979: four ticks on all twenty players from source 180#1,
    with each target's lowest health;
  - ability 1,282,525: twenty players at once;
  - the raid tick at the window's start is UNKNOWN (`beyondFightEdge`).
- **Regression corpus: no fixture committed.**
  - The smallest fixture that can prove one COMPLETE episode is 230,811
    bytes: episode 1,282,525 with its ±2 s margin, damage families only,
    whole roster. A grant-free fixture of just its 20 hits (~9 KB) could
    not prove COMPLETE.
  - Neither fits the exhausted capacity, and this is one tranche, so per
    the owner decision the measurement is recorded
    (`agent/follow-ups.md` "Regression-corpus ledger").
  - The behavior is protected in every `npm test` by unit tests that read
    the committed archive segments, which is the M11-E2 precedent.

## M12-C — Healer Foundation: healing and absorbs received during damage episodes (internal)

**Status:** implemented (2026-10-31). This is the third tranche of
Milestone 12 (autopilot queue entry M12-C).

**What it adds.** `receivedDuringEpisodesOf(fight, { gapMs = 2 000,
trailingMs = 2 000 })` (`src/healing/received-during-episodes.ts`, revision
`healing-received-during-episodes/1`, authority `WCL_OBSERVED_FACT`) answers
WHAT healing and absorbs reached the players a damage episode hit, and from
whom.

- **Built on M12-B.** It runs `damageEpisodesOf` and reports per episode. No
  roster means `ROSTER_NOT_IN_SCOPE`, with no episode list at all.
- **Window.** From the episode's first hit to its last hit plus
  `trailingMs`. It is cut at the fight's end, and the cut is recorded
  (`clampedBy: "FIGHT_END"`). The trailing span is a reporting window, not a
  judgement of how fast healing ought to arrive.
- **Per player the episode hit:** every HEALING and ABSORB event targeting
  that player in the window. They are grouped by the reported source and
  kept with their raw fields verbatim.
  - A pet or guardian is its own source and is never folded into an owner.
  - A missing source is kept, under `null`.
  - `DAMAGE_ABSORBED` and `HEAL_ABSORBED` stay distinct kinds.
- **Per-category coverage.** HEALING and ABSORBS each carry the shared
  absence gate's result for that player over that window. An empty list is
  "nothing was received" only under COMPLETE. Otherwise it is UNKNOWN with
  the gate's reason.
- **The player set is the episode's.** Whether it is complete is the
  episode's own DAMAGE coverage, carried in `episode.coverage`.
- **Overlap is stated.** Windows of overlapping episodes overlap, so one
  event can be listed under several episodes. That is one more reason
  nothing is added up.
- **Never:** totals (follow-up M1), a verdict on any healer, an attribution
  of a pet to its owner, or anything spec-specific.

**Boundary.** It is unchanged. The new module is added by name to
`tests/contracts/m12a-healing-layering.test.ts`. Nothing in production
imports `src/healing/`.

**Evidence.** The three M12-B archive segments already retain every heal and
absorb in their window. No new Warcraft Logs request was made, and the
corpus and archive bytes are unchanged. The real result was checked against
counts derived independently from the raw segment bytes:

- episode 1,282,525: window 7,510,308 to 7,512,313, 20 players, 356 heals,
  44 damage absorbs and 1 heal absorb, every list COMPLETE;
- episode 1,285,979: 779 heals, 127 damage absorbs and 2 heal absorbs;
  guardian 129#4 is listed under its own instance.

There is no new corpus fixture, because no new behavior needs one beyond the
M12-B ledger row. The archive-reading unit tests protect it in every
`npm test`.

## M12-D — the first healer specialization evaluator: Restoration Shaman (internal)

**Status:** implemented (2026-10-31). This is the fourth tranche of
Milestone 12 (autopilot queue entry M12-D).

**Owner decision (2026-10-31).** Restoration Shaman is the first healer
specialization, because the canonical fight (b1PmaKrd6CDfzngc fight 48)
already holds one, actor 122, whose identity committed evidence establishes.
Its v1 verdict scope and the runtime-data ownership are recorded in
`agent/autopilot-queue.md` "M12-D".

**What it adds.** `evaluateRestorationShaman({ fight, identity, plan })`
(`src/specs/shaman/restoration/evaluator.ts`, revision
`restoration-shaman-evaluator/1`). It is pure and internal.

- **Identity first.** The preflight identity must name this fight, class
  "Shaman" and specialization "Restoration". The fight's master data must
  list the actor as a Shaman player. Otherwise the result is
  `IDENTITY_REFUSED` (`IDENTITY_MISMATCH`, `NOT_THIS_SPECIALIZATION`,
  `IDENTITY_UNRESOLVED`, `IDENTITY_CONFLICT`), with nothing evaluated.
- **ASSIGNMENT.** Its authority is a supplied raid cooldown plan
  (`RAID_COOLDOWN_PLAN`, citing the plan's source).
  - No plan: `NO_AUTHORITY_AVAILABLE` (`NO_RAID_COOLDOWN_PLAN`).
    Assignments are never inferred from casts, the player's or another
    healer's.
  - The plan's entries are the normalized `CooldownAssignment` of "Raid
    Cooldown Assignments": player, ability, planned time, a tolerance the
    plan states, and the source. How a plan is written and supplied stays
    M12-E's owner decision. Nothing in production supplies one yet.
  - `ASSIGNMENT_MET`: the player's own completed cast of the planned ability
    lies inside the window. That cast is the actionability proof
    (`PROVEN_ACTIONABLE_BY_OBSERVED_EXECUTION`).
  - `ASSIGNMENT_NOT_ACTIONABLE`: a COMPLETED encounter ended before the
    window opened. The fight's end is the positive evidence.
  - `ASSIGNMENT_UNKNOWN` otherwise, with its reason. No cast in a
    COMPLETE-covered window is `READINESS_NOT_ESTABLISHED`: nothing pinned
    proves the ability was ready, and a miss needs that proof. A coverage
    gap is the gate's reason, never inactivity. The nearest observed casts
    are attached as context, never classified early or late.
  - So `ASSIGNMENT_MISSED`, `_EARLY` and `_LATE`, and `PLAN_MAY_NEED_REVIEW`,
    are not reachable in v1 (follow-up "After M12-D").
- **COOLDOWN.** Observational, `WCL_OBSERVED_FACT`. It lists every
  identified healing cooldown the player cast.
  - A use is a completed `cast` sourced by the player inside the encounter,
    bounds inclusive. A begincast, an aura
    of the same id, another player's cast and the totem's own cast are not.
    In the real fight, Ascendance's aura is applied seven times and cast
    twice.
  - The listing is COMPLETE only under CASTS coverage of the player over the
    whole fight and with no completed cast of the player that carries no
    ability id (any such cast could be an unlisted cooldown). Otherwise it is
    UNKNOWN with the gate's reason or `UNIDENTIFIED_SUBJECT_CAST`, and the
    known uses are kept. An assignment window holding such a cast is
    `UNIDENTIFIED_SUBJECT_CAST` too, never "no cast".
  - Per use, it lists the M12-B damage episodes overlapping
    `[cast, cast + 10 s]` (a reporting span, not an effect duration). Per
    player each episode hit, it gives the count of M12-C entries from the
    player and its Warcraft Logs-stated pets, with that list's coverage.
    Counting the pets is this specialization's decision; the shared
    primitive still never attributes a pet to its owner.
  - The overlap list carries its own `listing` coverage. It is COMPLETE only
    when DAMAGE holds for every roster player over the span widened by the
    episode gap on both sides, inside the fight, with no ability-less roster
    hit there (the M12-B episode rule). Otherwise it is UNKNOWN
    (`beyondFightEdge`, `uncoveredActors`, `unidentifiedHitsInSpan`), and an
    empty list is not "no overlap".
  - Without the FULL_RAID roster the overlap is `ROSTER_NOT_IN_SCOPE`.
  - No verdict: nothing says a cooldown should or should not have been used.
- **HEALING_DECISION.** Always `NO_AUTHORITY_AVAILABLE`
  (`NO_APPROVED_PER_CAST_HEALER_MODEL`).
- **No confidence field.** The repository has no confidence vocabulary yet
  (`m5-boundary-and-vocabulary` bans one). The status carries the evidence
  grade.

**Runtime data.** `src/data/game/shaman-restoration-healing-cooldowns.{json,ts}`
holds healing-cooldown identity only: Spirit Link Totem (98008), Ascendance
(114052) and Healing Tide Totem (108280).

- Each entry is a verbatim specialization-tree row of the pinned
  SimulationCraft `trait_data.inc` (commit 33622e9d, client data
  12.1.0.69587, file hashes recorded), checked by the loader against the
  identity it claims. Ascendance and Healing Tide Totem share a choice node.
- The selection of which traits are healing cooldowns is hand reviewed and
  recorded per entry.
- No cooldown, charge or duration is claimed.
- It is spec-owned data, so `m11a2-cross-spec-isolation` R3 lets only the
  Restoration tree import it. Nothing goes into `src/healing/`.

**An unregistered evaluator tree.** A healer has no SimulationCraft
authority, so the tree has no `SpecId`, `registration.ts` or APL artifact.

- `m11a2-cross-spec-isolation` names it as the one unregistered evaluator
  tree. R1, R3, R4 and R5 still apply to it. Only the registration rules
  exclude it.
- `m10a-cross-spec-isolation` lists it and pins that it has no
  registration.
- `m12a-healing-layering` names the evaluator as the healing domain's one
  consumer.
- `m5c1-gcd-semantics` admits the exact `"ASSIGNMENT_NOT_ACTIONABLE"` literal
  in that one file, with its evidence-bearing reason. The actionability
  vocabulary itself still has two members.
- `RESTORATION_SHAMAN_REQUIRED_INPUTS` declares FULL_RAID. Nothing derives a
  scope from it until the evaluator is registered.

**Evidence.** Two `--actor-slice` segments of the M11-E2 capture hold every
cast and begincast of actor 122 over the whole fight (119,216 bytes,
archive). No new Warcraft Logs request was made. The real result, checked
against the raw bytes:

- four healing-cooldown casts: Ascendance at 7,469,039 and 7,666,386,
  Spirit Link Totem at 7,543,726 and 7,776,617, listing COMPLETE;
- the player's sources are 122 plus its seven stated pets;
- a test plan over the real casts gives MET, UNKNOWN
  (`READINESS_NOT_ESTABLISHED`) and NOT_ACTIONABLE after the kill.

No regression-corpus fixture is committed (ledger row in
`agent/follow-ups.md`).

## M12-E — raid cooldown assignment input

**Status:** implemented (2026-10-31). This is the fifth tranche of
Milestone 12 (autopilot queue entry M12-E). Public contract: EXPECTED.

**Owner decision (2026-10-31).** The authoritative raid cooldown plan is an
EXPLICIT USER-PROVIDED INPUT. The thirteen points are recorded in
`agent/autopilot-queue.md` "M12-E". It refines "Raid Cooldown Assignments"
above: the conceptual `CooldownAssignment` is now the normalized
`RaidCooldownAssignment`, and `plannedEvent` is kept only as context
(`bossSpellId`), never as timing.

**The normalized plan** (`src/raid-plan/raid-cooldown-plan.ts`, schema
`raid-cooldown-plan/1`, authority `USER_PROVIDED_RAID_PLAN`). It is shared,
whole-raid input with no gameplay meaning.

- `encounter`: `encounterId` and `difficulty`. `difficulty` is the Warcraft
  Logs fight difficulty id, compared verbatim. The repository has no
  reviewed difficulty-name authority (M11-F), so "MYTHIC" is never mapped to
  a number.
- `source`: format (`STRUCTURED` or `TIMELINE_NOTE`) and an optional label.
- `tolerance.defaultToleranceMs`: the plan-level default, when supplied.
- `assignments[]`: `assignmentId`, `player` (name plus optional realm, NFC,
  diacritics kept), `abilityId`, `plannedTime`, `toleranceMs` with its
  `toleranceSource` (`ASSIGNMENT` or `PLAN_DEFAULT`), `source` (note line
  number and raw line, or structured index), and `context.bossSpellId`.
- `plannedTime` is `PHASE_RELATIVE { phase: string, offsetMs }` or
  `FIGHT_RELATIVE { offsetMs }`. A phase is a string label, never a number.
- `importDiagnostics[]`: note lines not imported, with a code and the raw
  line.

**How it is supplied.** An optional `raidCooldownPlan` on the analysis
request, in one of two forms, parsed by one application parser
(`src/services/raid-cooldown-plan-request.ts`) that REST reaches with the
body and MCP with the tool argument:

- `STRUCTURED`: the assignments themselves. Each must end up with a
  tolerance, its own or the plan default; none is ever created.
- `TIMELINE_NOTE`: the note text. `defaultToleranceMs` is required, because
  the format encodes no tolerance and `countdown` is not one.

Unknown keys are rejected, not ignored. An invalid plan rejects the request
(`INVALID_REQUEST` with `INVALID_REQUEST_SHAPE` or `REQUEST_LIMIT_EXCEEDED`
issues); it never becomes "no plan". Nothing is persisted.

**The note importer** (`src/raid-plan/timeline-note-import.ts`). A line
becomes an assignment only with `time` (seconds, up to three decimals,
converted without floating point), `ph`, exactly one named player in `tag`,
and a numeric `spellid`. Everything else is a diagnostic:
`NOT_A_TIMELINE_LINE`, `NO_SPELL_ID`, `NO_TIME`, `NO_PHASE` (never assumed
pull-relative), `NO_TAG`, `TAG_NOT_A_PLAYER` (everyone, a role or a group),
`TAG_NOT_A_SINGLE_PLAYER`, `MALFORMED_FIELD`, `LINE_TOO_LONG`. A line with a
spell id is still not a healer cooldown: which ids matter is each
specialization's runtime data.

**Resolution against a fight** (`src/raid-plan/resolve.ts`). Shared and
fact-only; no `if spec === ...`.

- Binding: encounter id and difficulty must both equal the fight's. A
  mismatch is `NOT_BOUND` and resolves nothing. A fight with no reported
  difficulty is UNKNOWN.
- Player: exactly one roster player (`breadth.friendlyActorsInScope`) with
  that name, case-insensitive after NFC, diacritics significant; a realm,
  when given, must equal the roster player's server, case aside. Otherwise
  unresolved: `ROSTER_NOT_IN_SCOPE` (no FULL_RAID roster),
  `ROSTER_NAMES_INCOMPLETE` (an unnamed roster player, or a needed server
  missing), `NO_MATCH` or `AMBIGUOUS`, with the name-matching candidates as
  context. Never by class or specialization, never fuzzily.
- Time: `FIGHT_RELATIVE` resolves from the pull. `PHASE_RELATIVE` stays
  unresolved (`PHASE_LABEL_NOT_MAPPED`): no reviewed map from a plan's phase
  label to the fight's observed phases exists, so even "1" is not assumed to
  be Warcraft Logs phase 1.

**Restoration Shaman consumption** (`src/specs/shaman/restoration/`,
unchanged revision `restoration-shaman-evaluator/1`, still internal). The
evaluator now takes the normalized plan and resolves it itself.

- No plan: `NO_AUTHORITY_AVAILABLE` / `NO_RAID_COOLDOWN_PLAN`.
- A plan for another encounter or difficulty: `NO_AUTHORITY_AVAILABLE` /
  `PLAN_NOT_FOR_THIS_FIGHT`. It is no standard for this fight.
- An unbindable plan: `UNKNOWN` / `ENCOUNTER_BINDING_UNKNOWN`. There is a
  standard, but not the evidence to apply it.
- Bound: authority `{ kind: USER_PROVIDED_RAID_PLAN, format, label }`. The
  player's entries for an unidentified ability are `notEvaluated`
  (`ABILITY_NOT_REGISTERED`), never reinterpreted; M12-D's
  `ABILITY_NOT_IDENTIFIED` UNKNOWN is gone. An entry that may be this
  player's but is unresolved is `ASSIGNMENT_UNKNOWN` / `PLAYER_NOT_RESOLVED`;
  an unresolved time is `PLANNED_TIME_UNRESOLVED`; both carry the resolver's
  answer. Resolved entries keep M12-D's MET / NOT_ACTIONABLE / UNKNOWN rules.
  Every result carries its `AssignmentReference` (id, ability, planned time,
  tolerance and its source, source line).

**The public disclosure** (`raidCooldownPlan` on the analysis result,
`analysis/1`, optional). It is present exactly when the request supplied a
plan, so every request without one produces the document it did before. It
carries the authority, schema, format, label, a SHA-256 digest of the
normalized plan's canonical JSON, the encounter, `encounterBinding`
(MATCHED, MISMATCHED, UNKNOWN), the assignment count, the import
diagnostics as a tally, and `assignmentEvaluation: NOT_EVALUATED` with the
first reason that applies: `PLAN_NOT_FOR_THIS_FIGHT`,
`ENCOUNTER_BINDING_UNKNOWN` or `NO_PUBLIC_ASSIGNMENT_EVALUATOR`. No public
analyzer evaluates assignments, so no document can read as "every
assignment was met". It appears on every status, SPEC_NOT_SUPPORTED
included.

**Public input.** The MCP tool's input gains an optional `raidCooldownPlan`
on both forms (`src/contracts/raid-cooldown-plan-input-contract.ts`, shape
only; the application parser decides meaning), and its description says a
plan is never inferred and never evaluated here. REST accepts the same field
in the body.

**Evidence and network.** No Warcraft Logs request. Synthetic and note
fixtures, plus the committed M12-D evidence: under the committed context's
roster (`friendlyPlayers`) and master-data name, a pull-relative plan over
actor 122's real casts gives MET, UNKNOWN and NOT_ACTIONABLE; without the
roster, the same name is `PLAYER_NOT_RESOLVED`.

## M13-A — Augmentation Foundation (internal)

Milestone 13 (autopilot queue entry M13-A). Public contract: NONE.

**Owner decision (2026-11-01)**, recorded in `agent/autopilot-queue.md`
"M13-A": one bounded Warcraft Logs evidence campaign whose sole purpose is
real committed evidence for M13's initial observable facts. Recipient
quality stays NO_AUTHORITY_AVAILABLE; no target-quality coaching, recipient
inference, parse optimization or comparison.

**Shared support primitives (`src/support/`, facts only).** The role module
of "Augmentation Architecture". It imports only the engine and the
capability vocabulary, knows no spell id (the caller supplies them), never
compares a class, and declares no judgement word
(`tests/contracts/m13a-support-layering.test.ts`). Its one consumer is the
Augmentation evaluator.

- `support-aura-windows.ts`: one supporter's buff windows per (recipient
  instance, ability), from that supporter's own transitions in retrieval
  order. An application opens a window with an OBSERVED start; a refresh or
  stack change proves it active; a removal closes it OBSERVED. A window first
  seen as a refresh or removal starts NOT_OBSERVED; a re-application with no
  removal ends the previous one NOT_OBSERVED; a window open at the end ends
  NOT_OBSERVED. Nothing is extended to a nominal duration or the fight end.
  `observedSpan` is earliest to latest observed transition; the aura is
  proven active only AT those instants. Continuity between them is
  ESTABLISHED only when the engine's `gateContinuityClaim` holds (monotonic
  time, then the supporter's COMPLETE AURAS coverage over the whole observed
  span; review cycle 6), no stack removal inside it leaves zero or an
  unstated count (as `aura-state.ts` rules), and no AMBIGUOUS buff transition
  that could touch the recipient lies inside it; only then
  is `activeSpan` set, and only an active span is ever read as "on this
  recipient throughout" (review cycle 1). Another source's aura is a
  different aura. AMBIGUOUS transitions (review cycle 2) are those that might
  be one of the supporter's tracks but cannot be attributed: the asked
  ability with no stated source, the supporter's or an unstated source's
  buff with no ability id, the supporter's asked ability with no stated
  target (which could be any recipient's), or with no stated instance while
  that actor's instances are elsewhere told apart (review cycle 4: either
  side's unstated instance makes two references possibly the same). Any of them in range keeps the
  listing OBSERVED_ONLY (`AMBIGUOUS_TRANSITIONS`). Recipient identity is the actor catalog
  only: a pet's owner is WCL `petOwner`, else `OWNER_NOT_STATED`. The list
  is COMPLETE only under the supporter's COMPLETE AURAS coverage
  (`gateAbsenceClaim`), else OBSERVED_ONLY with the reason.
- `recipient-facts.ts`:
  - survival: the recipient instance's observed deaths inside the observed
    span (a fact whatever the continuity), and its first observed death after
    an OBSERVED end with the
    distance. Never "alive" (M11-F). The real capture shows why the second
    exists: Warcraft Logs removes the buff a few milliseconds BEFORE the
    holder's death event (removal 298,966, death 299,003), so no death lies
    inside a span. A fact, not a cause, and no threshold.
  - cooldown overlap: the recipient INSTANCE's own completed casts of
    CALLER-SUPPLIED ability ids inside the ACTIVE span; NO_COOLDOWN_IDENTITY
    without an identity, never an empty list; CONTINUITY_NOT_ESTABLISHED
    without an active span; COMPLETE only under the recipient's CASTS
    coverage AND with no AMBIGUOUS cast in the span (`AMBIGUOUS_CASTS`): an
    ability-less cast of that instance, or a listed-id or ability-less cast
    whose source is unstated or whose instance cannot be told apart. Any of
    those could be a listed cooldown of this recipient.
  - proven support time: the union of active spans, overall and per
    recipient, and peak concurrent active windows (one span ending at the
    millisecond another starts is NOT a proven overlap: the count takes ends
    before starts). Never exact (review cycle 5): complete transition
    coverage does not resolve INITIAL state, since a buff applied before the
    range (a pre-pull Prescience) carries in with no transition, and no aura
    event is never "inactive". So both are AT_LEAST, always with
    `INITIAL_STATE_NOT_RESOLVED` among the caveats, and UNKNOWN (never "at
    least 0") when nothing is proven. On the real, ungranted capture every window's
    continuity is NOT_ESTABLISHED, so support time is UNKNOWN and no overlap
    is claimed there.

**Augmentation Evoker evaluator (`src/specs/evoker/augmentation/`,
internal, unregistered).** Identity gate as M12-D (report and fight, class
Evoker, spec Augmentation, catalog Player/Evoker, else IDENTITY_REFUSED);
unusable runtime data is RUNTIME_DATA_UNAVAILABLE.

- SUPPORT_TARGETING: NO_AUTHORITY_AVAILABLE
  (`NO_APPROVED_RECIPIENT_QUALITY_MODEL`). `supportTargetingStatus` holds
  the rule that keeps the two failure states apart: with a declared model
  whose required ally category is not covered for a recipient over its
  span, UNKNOWN naming that recipient, category and reason. No v1 caller
  declares a model.
- SUPPORT_TIMING: NO_AUTHORITY_AVAILABLE
  (`NO_APPROVED_SUPPORT_TIMING_STANDARD`), with the facts
  (`WCL_OBSERVED_FACT`): every Ebon Might, Prescience and Breath of Eons cast
  by the Evoker, COMPLETE only under its CASTS coverage, with no
  ability-less Evoker cast and no source-less cast that could be a support
  cast (`UNATTRIBUTED_CAST`).
- Observations: Ebon Might and Prescience windows on allies (the Evoker's
  own copy of an ally aura id is excluded), each with survival and cooldown
  overlap, and proven support time; the Evoker's own Ebon Might windows.
  Nothing is a finding, so actionability is not evaluated.
- Required inputs: FULL_RAID; ACTORS, CASTS, AURAS, DEATHS. Recipient
  cooldown identity is a caller input: no reviewed cross-specialization
  cooldown registry exists, and a spec evaluator may not import another
  spec's data. (Superseded by M13-C: the shared reviewed registry.)

**Runtime data (`src/data/game/evoker-augmentation-support-abilities.*`).**
Pinned SimulationCraft 33622e9d: each cast identity is the verbatim
`trait_data.inc` row (class 13, spec 1473: Ebon Might 395152, Prescience
409311, Breath of Eons 403631), each aura identity the verbatim
`sc_evoker.cpp` line binding it (Ebon Might ally 395152 and self 395296,
Prescience 410089), and Breath of Eons' Scalecommander cast 442204 its own
module line. The parser refuses a row or line that does not name the id it
claims. No duration, pandemic, cooldown or charge is claimed.

**Evidence (archive, server-filtered, no grants).** Subject chosen by a
fixed neutral order recorded before any request: the ten most recent public
reports of zone 53, best non-empty tier (Mythic kill, Heroic kill, Mythic
wipe, ...), first eligible fight, lowest Augmentation actor id. It yielded a
Mythic WIPE of encounter 3429 (no listed Mythic or Heroic kill had an
Augmentation Evoker), actor 1, committed as `M13AAUGAAAAAAAAA` fight 1. Seven
Warcraft Logs HTTP requests of the 50 allowed. Three full-fight streams,
each one page: Casts (3,650), Buffs filtered to the fifteen pinned
Ebon Might / Prescience / Breath of Eons spell ids (498), Deaths (19),
hostilityType Friendlies, no resources. Every stream is server-filtered, so
under the 2026-10-11 rule the slices grant nothing: the corpus contract
gained the capture-query kind `FILTERED_EVENT_STREAMS`, and the loader's
FILTERED_CAPTURE_GRANTED rule covers it. Everything read from this evidence
is OBSERVED_ONLY. See `tests/evidence/m13a-augmentation-capture.md`.

## M13-B — Recipient specialization state in the combat model

Milestone 13 (autopilot queue entry M13-B). Public contract: NONE. No
Warcraft Logs request: the field is decoded from the fight context every
ingestion already retrieves.

**What changed.** `CombatFight.friendlySpecializations` (and the same object
on `NormalizedFightCore`) holds, for every id in the fight's
`friendlyPlayers`, the Warcraft Logs-stated specialization as observed
identity (`src/engine/normalization/friendly-specializations.ts`):

- `STATED`: the `friendlySpecs` entry at the player's roster index,
  verbatim, with the player's class (`subType`) and the index. The class
  travels with it because one name is several specializations
  ("Restoration", "Holy", "Frost").
- `UNKNOWN` with the rule that refused it, never a default:
  - `NOT_STATED`: missing, blank, non-string, or WCL's literal "unknown";
  - `ROSTER_NOT_ALIGNED`: the two arrays are not index-aligned (length
    mismatch, missing, or a non-integer participant), so EVERY player is
    refused, never zipped to the shorter list;
  - `DUPLICATE_PARTICIPANT`;
  - the shared actor-resolution failures (`NOT_IN_CATALOG`, including the
    `-1` sentinel; `AMBIGUOUS_ACTOR_ID`; `NOT_A_PLAYER`;
    `ACTOR_RECORD_MALFORMED`; `IDENTITY_UNUSABLE` for a player with no
    class);
  - `NOT_IN_FRIENDLY_ROSTER` from the lookup `statedSpecializationOf`, for
    a pet, an enemy or a player who sat the pull out. A pet never inherits
    its owner's specialization.

**One set of rules.** The decoder (`readFriendlySpecializations` in
`fight-context.ts`) calls `report-roster-facts.ts`'s `readFriendlyRoster`,
`resolvePlayerActor` and `isUsableSpecName`, the rules the identity
preflight and roster discovery already share. Nothing is inferred from
class or from abilities cast. A refused player fails closed alone; ingestion
never fails on this field, and `friendlyPlayers` is unchanged.

**Scope.** Report-context identity, like the actor catalog's class: every
focused view, under PLAYER_CONTEXT or FULL_RAID, holds the same object.
Scope fences absence claims over ally EVENT state (`breadth`,
`completeness`); a stated specialization is neither. Whether a decision may
read ally state at all is still the evaluator's declared scope.

**What it is not.** No role ("is a healer"), no class/specialization
compatibility check: both need reviewed runtime game data that does not
exist yet. A stated name that is not a real specialization of the class is
carried verbatim (follow-ups "After M13-B").

**First consumer.** The Augmentation evaluator (`/2`): each ally window
carries `recipientSpecialization`. It is read in the specialization, not in
`src/support/`, whose M13-A layering guard keeps specialization vocabulary
out of the shared role module. On the real M13-A fight all 20 friendly
players are STATED, the thirteen Ebon Might recipients read their own
specializations, and a pet recipient is NOT_IN_FRIENDLY_ROSTER. No coaching
reads it.

**Revision.** `NORMALIZATION_REVISION` `m3.4` → `m3.5` (additive shape
change, as the repository contract requires). As at the M11-G4-1 bump, the
intentional public delta is the VALUE of every ANALYZED raid-night/1 cell's
`provenance.normalizationRevision` (`"m3.5"`), so a stored `m3.4` result
compares NOT_COMPATIBLE. No schema changes; analysis/1 carries no
normalization revision and its digests are unchanged.

## M13-C — Shared, reviewed recipient cooldown identity

Milestone 13 (autopilot queue entry M13-C). Public contract: NONE. No
Warcraft Logs request.

**Problem.** Augmentation support overlap asks which of a RECIPIENT's casts
were cooldowns. Cooldown ids are specialization runtime data, private to
the owning tree (`m11a2-cross-spec-isolation` R3), so the Augmentation
evaluator may not import Blood's or Restoration's datasets. Until now the ids
were a caller input no production caller had.

**Mechanism.** One shared, class-neutral dataset,
`src/data/game/recipient-cooldown-identities.{json,ts}`
(`REVIEWED_RECIPIENT_COOLDOWN_IDENTITIES`, revision `simc-33622e9d-m13c-1`).

- Each entry names a pinned roster specialization (roster key and SimC spec
  id, validated against `spec-roster`), the Warcraft Logs class and
  specialization strings it answers (the committed fight contexts that state
  them are cited and checked by test), its SOURCE dataset (id and revision),
  its selection criterion, and the ids. The artifact carries the
  SimulationCraft pin (33622e9d, client data 12.1.0.69587).
- It imports no specialization dataset. The restated ids cannot drift: the
  unit test re-derives every entry from its named source by its named
  criterion and requires exactly the listed ids, display names and the same
  pin.
- Two named criteria, declared in the artifact: `PINNED_COOLDOWN_AT_LEAST_60S`
  (pinned base or per-charge cooldown ≥ 60 000 ms; a selection rule only,
  never a readiness claim) and `REVIEWED_HEALING_COOLDOWN` (the source's own
  hand-reviewed healing-cooldown entries; no duration claimed).
- Coverage: the six specializations already pinned. Blood: Dancing Rune
  Weapon. Brewmaster: Invoke Niuzao, Exploding Keg. Protection: Divine Toll,
  Sentinel, Avenging Wrath. Retribution: Divine Toll, Execution Sentence,
  Avenging Wrath. Assassination: Kingsbane, Deathmark, Vanish. Restoration
  Shaman: Spirit Link Totem, Ascendance, Healing Tide Totem.

**Lookup** (`recipientCooldownIdentityOf(stated)`), a table read with no
specialization branch, total and fail closed:

- `IDENTIFIED`: ids with criterion, source and pin, always
  `coverage: REVIEWED_SUBSET`. "None of these ids was cast" may be said; "no
  cooldown was used" may not.
- `UNKNOWN SPECIALIZATION_NOT_ESTABLISHED` with the M13-B reason (a pet is
  NOT_IN_FRIENDLY_ROSTER, never its owner's), or `UNKNOWN
  REGISTRY_UNAVAILABLE` when the artifact fails validation.
- `UNSUPPORTED NO_REVIEWED_COOLDOWN_IDENTITY`: stated, but not reviewed.
  Never an empty list.
- The match is the stated class AND specialization, exactly: "Restoration"
  Druid is not "Restoration" Shaman, "Death Knight" is not "DeathKnight".

**Consumer.** The Augmentation evaluator (`/3`) replaces its caller input
with the registry (test seam `cooldownRegistry`), and each ally window
carries `recipientCooldownIdentity`, the lookup `cooldownOverlap` used. The
shared `src/support/` primitive is unchanged: it still takes ids, knows no
specialization and reads no game data. A new guard
(`tests/contracts/m13c-recipient-cooldown-registry.test.ts`) pins the
registry's imports, forbids literal class/specialization comparisons and
spell-id literals in its code, and names its one consumer.

**Real evidence.** On the M13-A fight no Ebon Might or Prescience recipient
is a reviewed specialization (the Blood and Brewmaster players received
neither buff), so every real lookup is UNSUPPORTED or UNKNOWN, and overlap
stays NO_COOLDOWN_IDENTITY. The IDENTIFIED path is proven synthetically.

## M14-A — Comparison timing alignment foundation (post-hoc)

Milestone 14 (autopilot queue entry M14-A). Public contract: NONE. No
Warcraft Logs request: the M11-E2 subject and the three M11-G2 comparison
fights, from the committed evidence archive.

**Question.** "At the same encounter moment, what did each fight show?"
Never which fight did it right. `src/comparison-facts/timing-alignment.ts`
lives in the M11-G2 post-hoc domain, under its layering guard (imports only
engine, E1 combat facts and the domain; nothing outside the domain imports
it; no forbidden judgement word).

**Landmarks.** Keyed so they mean the same thing in every fight:

- `PULL` (recorded start, offset 0) and `RECORDED_FIGHT_END` (EXACT only when
  finality is COMPLETED);
- `PHASE_START:<phaseId>` and `INTERMISSION_START#k`, from the typed phase
  list behind the same ENCOUNTER_PHASES absence gate M4's `phaseAt` uses. An
  unordered list is UNKNOWN (never sorted), and an unstated
  `isIntermission` before ordinal k makes k and later UNKNOWN. Phase starts do
  not depend on intermission flags;
- `FIRST_FOCUS_DAMAGE_EVENT_ON_NPC:<gameId>`, a target transition, keyed by
  game id because actor ids are report-local. Player targets never count;
- `COOLDOWN_WINDOW_START:<windowKind>#k`, from the specialization's post-hoc
  definition, which the caller supplies. There is no specialization branch.
  A window whose start was not observed blocks its own ordinal and every
  later one.

**Anchor states** follow the evidence basis, never more:

- `EXACT`: observed in an EXHAUSTIVE collection, or metadata.
- `NO_LATER_THAN`: observed in an OBSERVED_ONLY collection. An unseen earlier
  event may exist, and the k-th smallest of a superset is never later than
  the k-th observed. This is M11-G2's AT_LEAST, for an instant.
- `UNKNOWN`: with a reason. A landmark absent from a fight is UNKNOWN. It is
  never interpolated, shifted from another fight or filled from a nominal
  duration.

The alignment carries `comparisonCoverage: AT_LEAST_UNCERTIFIED` and
`interpolation: NONE`, and each fight's `phaseEvidence`, so a missing phase
row cannot read as "no phases". It refuses fights of a different encounter
or difficulty, an unestablished difficulty, and duplicate fight refs.

**Moment facts** (`factsAtAlignedMoment`): `[landmark + from, landmark + to)`
in each fight, summarized with the existing G2 cast and damage summaries, so
counts keep EXACT / AT_LEAST / UNKNOWN and raw sums stay UNKNOWN when
uncertified.

- Only an EXACT anchor places a window. A NO_LATER_THAN anchor is
  `ANCHOR_NOT_EXACT`, because a window on a bound would be a guessed instant.
- A window outside the recorded fight is UNKNOWN, never clipped.
- It recomputes the alignment from the inputs it slices and never accepts
  one from the caller. An anchor is therefore always the anchor of that
  fight, focus and evidence.

**Real evidence** (encounter 2900, Mythic, four kills):

- No fight holds phase evidence: ENCOUNTER_PHASES is CAPABILITY_UNVERIFIED
  and the phase list is empty, so there is no phase or intermission row.
- Three NPC target transitions. Game id 259181 is EXACT at 649 ms for the
  subject and NO_LATER_THAN 1851 / 1140 / 17 ms for the comparisons.
- 19 Dancing Rune Weapon window ordinals, with proc windows included (After
  M11-G2). Ordinals the subject did not observe are UNKNOWN.
- The first 30 s after pull: the subject has EXACT 78 cast and 172 damage
  events; the comparisons have AT_LEAST counts.

## M14-B — Multi-log consensus (post-hoc)

Milestone 14 (autopilot queue entry M14-B). Public contract: NONE. No
Warcraft Logs request: the M14-A alignment of the committed archive fights.

**Question.** "Do the comparison fights agree on when this landmark
happened?" `src/comparison-facts/consensus.ts` reads only an M14-A
alignment's anchors and slices no fight. It lives in the M11-G2 post-hoc
domain, under the same layering guard.

**Outcomes** (CLAUDE.md "Comparison Consensus"), per landmark except `PULL`
(offset 0 by definition):

- `CONSENSUS`: a unique tolerance-wide group of EXACT comparison anchors that
  has at least the minimum sample AND is at least the agreement share of ALL
  comparison fights. It carries the group's fight refs and their own min/max
  values, never a mean.
- `SPLIT`: the decisive anchors already prove that no group can qualify, even
  if every abstaining fight joined the largest group
  (`DISAGREEMENT_PROVEN`), or two different groups of the same size qualify
  (`NO_UNIQUE_AGREEING_GROUP`). No value is carried.
- `INSUFFICIENT`: fewer decisive anchors than the minimum sample
  (`BELOW_MINIMUM_SAMPLE`), or abstentions could still decide
  (`ABSTENTIONS_COULD_DECIDE`). No value is carried.

**Voters.** Comparison fights only; the subject never votes. Only an EXACT
anchor is a value. NO_LATER_THAN (uncertified capture) and UNKNOWN anchors
abstain with their reason. An abstention counts in the share's denominator
and never as agreeing. The same rule as the APL short-circuit: an undecided
voter can block consensus, never manufacture it.

**Thresholds** are one named, versioned data set,
`COMPARISON_CONSENSUS_THRESHOLDS_V1` (`M14B_COMPARISON_CONSENSUS_V1`,
status `CANDIDATE`): minimum sample 3, agreement 2/3 (an integer fraction,
so no floating-point boundary), tolerance 5000 ms, inclusive. Callers may
pass another set. Every set is validated first: a minimum sample below 2
(one parse as consensus), a share that is not a strict majority, a
non-integer or negative tolerance, or an empty id is REFUSED.

**Context only.** Every evaluation carries `use: CONTEXT_ONLY` and
`findingEffect: { suppression: NONE, confidence: NONE }`, and nothing outside
the post-hoc domain may import it. Each row names its `nature`:
`ENCOUNTER_STATE` (phase, intermission), `FOCUS_BEHAVIOR` (first damage on an
NPC, cooldown window) or `FIGHT_RECORD` (recorded end). Only an
ENCOUNTER_STATE consensus can ever back a named environmental reason, and
mapping it to one (INTERMISSION, PHASE_TRANSITION, ...) together with the
subject's own encounter evidence is M14-C's job. A FOCUS_BEHAVIOR consensus
says what comparison players did, never what was right.

**Real evidence** (three uncertified comparisons):

- `RECORDED_FIGHT_END` (329.4 / 336.3 / 359.9 s) is SPLIT,
  DISAGREEMENT_PROVEN, under 5 s. A 31 s tolerance makes it CONSENSUS over
  exactly that range, which proves the thresholds are live configuration.
- All 22 FOCUS_BEHAVIOR rows (3 target transitions, 19 Dancing Rune Weapon
  ordinals) are INSUFFICIENT with 0 decisive votes: every comparison anchor
  is a bound.
- No ENCOUNTER_STATE row exists: no fight holds phase evidence (After M14-A).

## M14-C — Strategy-context representation (post-hoc)

Milestone 14 (autopilot queue entry M14-C). Public contract: NONE. No
Warcraft Logs request: the M14-A/M14-B results over the committed archive
fights, and synthetic phased fights.

**Question.** "What encounter strategy do the comparison fights have in
common, and does any of it name an environmental reason in the subject's
fight?" `src/comparison-facts/strategy-context.ts` lives in the M11-G2
post-hoc domain, under the same layering guard. Like `factsAtAlignedMoment`,
`strategyContext(input, definition, thresholds)` recomputes the alignment and
consensus from its inputs and never accepts them from the caller.

**Items.** One per consensus row, whatever the outcome, so "nothing in
common was shown" never reads as "no row":

| Landmark | Item kind | Nature |
| --- | --- | --- |
| `PHASE_START:<id>` | `PHASE_BEHAVIOR` | ENCOUNTER_STATE |
| `INTERMISSION_START#k` | `COMMON_DOWNTIME` | ENCOUNTER_STATE |
| `FIRST_FOCUS_DAMAGE_EVENT_ON_NPC:<gameId>` | `TARGET_TRANSITION` | FOCUS_BEHAVIOR |
| `COOLDOWN_WINDOW_START:<kind>#k` | `COOLDOWN_TIMING` | FOCUS_BEHAVIOR |

`PULL` and `RECORDED_FIGHT_END` are not strategy items. A cooldown item is
shared window timing. A HOLD (available but withheld) needs availability,
which no landmark carries, so no item claims one.

**Named environmental reason.** All three are required:

1. an ENCOUNTER_STATE row (focus behavior is what comparison players did,
   never what the encounter did);
2. a CONSENSUS outcome;
3. the subject's own anchor EXACT and inside the agreeing range widened by
   the threshold tolerance.

Warcraft Logs is authoritative for the subject's fight. Comparisons only
corroborate; they never supply a missing subject fact. `INTERMISSION_START#k`
names `INTERMISSION` over the subject's own k-th intermission interval;
`PHASE_START:<id>` names `PHASE_TRANSITION` at the subject's transition
instant, with no invented duration. Otherwise the item carries `NONE` with a
cause: `FOCUS_BEHAVIOR_NAMES_NO_REASON`, `NO_COMPARISON_CONSENSUS`,
`SUBJECT_ANCHOR_NOT_EXACT`, `SUBJECT_OUTSIDE_CONSENSUS_RANGE`.
`TARGET_UNAVAILABLE` and `FORCED_DOWNTIME` are in the vocabulary but have no
evidence source (targetability is unverified and carries no events), so they
are never named.

**Context, never authority.** Every representation carries
`use: CONTEXT_ONLY`, `rotationalAuthority: NONE` and
`findingEffect: { suppression: NONE, confidence: NONE }`. Items have no
direction: a subject outside the consensus is a fact, not a fault.
`attachStrategyContext(context, moments)` takes only a finding id and its
report time, and returns the named reasons whose subject window contains it.
It changes nothing about the finding. Using a named reason to suppress is the
reviewed projection's job (M14-F). Each fight's `phaseEvidence` is carried,
so a missing downtime item cannot read as "no downtime".

**Real evidence:** 22 items (3 target transitions, 19 Dancing Rune Weapon
ordinals), all INSUFFICIENT and `FOCUS_BEHAVIOR_NAMES_NO_REASON`. No phase or
downtime item; every fight's phase evidence is UNKNOWN
(`CAPABILITY_UNVERIFIED`). No named reason exists on real evidence.

## M14-D — Factual damage-delta decomposition (post-hoc)

Milestone 14 (autopilot queue entry M14-D). Public contract: NONE. No
Warcraft Logs request: the committed archive fights and synthetic fights.

**Question.** "Where, by ability, target class, window and sub-actor, did the
subject's damage figures differ from each comparison fight's?" Never why.
`src/comparison-facts/damage-delta.ts` lives in the M11-G2 post-hoc domain,
under the same layering guard. `decomposeDamageDeltas(input, definition,
alignedWindows)` recomputes the M14-A alignment from its inputs, like
`factsAtAlignedMoment`.

**Three measures, never mixed.** A delta compares one measure, one component
and one window on both sides:

- `DAMAGE_EVENT_COUNT` (authority `OBSERVED_DAMAGE_EVENTS`): the focus's and
  its owned actors' damage events, EXACT / AT_LEAST / UNKNOWN as in M11-G2.
- `RAW_AMOUNT_FIELD_SUM`: each fight's raw sum is shown as M11-G2 holds it,
  but its delta is always UNKNOWN (`RAW_AMOUNT_MEANING_NOT_PROVEN`), even when
  both sums are EXACT. A difference of unproven fields is not a damage
  difference (follow-up M1).
- `WCL_TABLE_AMOUNT`: whole-fight Warcraft Logs table amounts. The raid entry
  (`WCL_RAID_DAMAGE_DONE_TABLE`: total, pets, target types) and the focus's
  per-actor DamageDone leaves (`WCL_DAMAGE_DONE_TABLE`, per ability). A delta
  needs the same surface on both sides and the same log version (M11-G4-4);
  otherwise UNKNOWN (`LOG_VERSION_DIFFERS`). A pet or ability a table does not
  list is `NOT_LISTED_IN_TABLE`, never zero. The raid entry's total includes
  the pets, and no focus-only amount is derived by subtraction
  (`TABLE_STATES_NO_FOCUS_ONLY_AMOUNT`).

**Components.** `TOTAL`, `BY_SOURCE` (`FOCUS` or the definition's sub-actor
kind, by catalog game id, so pets with different report-local actor ids
align), `BY_ABILITY` (source kind and ability game id), `BY_TARGET_CLASS` and,
for tables, `BY_WCL_TARGET_TYPE` (verbatim). A target class means the same in
every fight: the subject's enemy list is not held, so the enemy-listed and
other non-boss NPC labels merge into `NON_BOSS_NPC`.

**Deltas** are per pair (subject − comparison), never combined across
comparisons:

| Subject | Comparison | Delta |
| --- | --- | --- |
| EXACT | EXACT | EXACT |
| EXACT | AT_LEAST | NO_MORE_THAN |
| AT_LEAST | EXACT | NO_LESS_THAN |
| anything else | | UNKNOWN, with the reason |

Each pair carries an absolute and a per-minute delta. Rates divide by the
window's duration, or by the table's own stated duration. A direction
(`SUBJECT_LOWER`, `SUBJECT_HIGHER`, `EQUAL`) is stated only where the delta
or its bound proves it, compared in exact integer arithmetic. Otherwise it is
`UNDECIDED`, so an upper bound never proves the subject higher.

**Windows.** `WHOLE_FIGHT`, plus caller-requested `ALIGNED_MOMENT`s
(`[landmark + from, landmark + to)` through M14-A). Only an EXACT anchor
places a window. A window outside the recorded fight is UNKNOWN, never
clipped. No table surface exists for an aligned moment, so it has no table
rows. Each window records, per fight, whether its component list is
EXHAUSTIVE or OBSERVED_ONLY. No residual is computed: components are not
claimed to explain a total.

**Observation only.** The decomposition carries `use: OBSERVATION_ONLY`,
`causalClaim: NONE`, `acrossComparisons: NOT_COMBINED`, `residual:
NOT_COMPUTED` and `findingEffect: { suppression: NONE, confidence: NONE }`.
`observationSentence(row, pair, label, names)` words a proven direction only,
for example "Rupture damage events per minute were lower in S than in C1."
It returns `null` when the direction is UNDECIDED, and it never names a cause
or an action. Linking a delta to decision-level evidence is M14-E.

**Real evidence** (subject versus three uncertified comparisons):

- Raid-entry totals: 45,802,009 against 59,295,730 / 58,873,321 / 62,896,995,
  EXACT deltas, all `SUBJECT_LOWER` per minute. Risen Ghoul table amounts are
  `SUBJECT_HIGHER` against all three.
- Per-ability table deltas are all UNKNOWN: the subject has no per-actor
  table.
- Event counts are bounds. The total is 3,761 against ≥4,268 / ≥4,700 /
  ≥4,240, so NO_MORE_THAN. The boss-subtype count against COHORT261 is
  NO_MORE_THAN −98 events, but its per-minute bound is positive, so the
  direction is UNDECIDED.
- Every raw-amount delta is UNKNOWN.
- The first Dancing Rune Weapon window places no comparison window
  (`ANCHOR_NOT_EXACT`).

## M14-E — Causal evidence linkage (post-hoc, internal)

Milestone 14 (autopilot queue entry M14-E). Public contract: NONE. No
Warcraft Logs request: the committed archive fights, the subject's real Blood
decision results, and synthetic fights.

**Question.** "For this observed difference, what decision-level evidence
about the subject's own play exists in the same component and window, and
what limits it?" Never "did this decision cause it".
`src/comparison-facts/causal-linkage.ts` lives in the M11-G2 post-hoc domain,
under the same layering guard. `linkCausalEvidence(input, definition,
alignedWindows, records)` recomputes the M14-D decomposition from its inputs
and never accepts one from the caller.

**Two modules, neither feeding the other.** The authority verifier (spec
evaluators, SimulationCraft) is never imported. The caller restates each
decision result as a `DecisionEvidenceRecord`: plain data, as
`attachStrategyContext` takes only a finding id and a time. A record has a
kind (APL decision outcome, cast opportunity, uptime, resource state, buff
window, target choice, cooldown alignment, encounter actionability), a basis
(`AUTHORITY_BACKED` or `OBSERVED_FACT`), the producer's authority and status
VERBATIM, a resolution (`RESOLVED`, `UNKNOWN`, `NO_AUTHORITY_AVAILABLE`), a
half-open report-time interval, a scope and its locators. The linkage reads
only the resolution, scope and interval. It never reads the producer's status,
never re-evaluates a decision, and returns nothing to the authority branch.
Restating a finding as a record, and interpreting the producer's status, is
the reviewed projection's job (M14-F).

**A link needs**, per delta row and comparison pair:

1. a proven direction (`SUBJECT_LOWER` / `SUBJECT_HIGHER`); an UNDECIDED or
   EQUAL delta has nothing to link to;
2. the subject's own window placed;
3. at least one RESOLVED record whose scope covers the component and whose
   interval meets the subject window.

Otherwise the pair is `OBSERVATION_ONLY` with a cause:
`DIRECTION_UNDECIDED`, `DIRECTION_EQUAL`, `SUBJECT_WINDOW_UNKNOWN`,
`NO_DECISION_EVIDENCE_IN_SCOPE` or `DECISION_EVIDENCE_UNRESOLVED`. UNKNOWN and
NO_AUTHORITY_AVAILABLE records in scope are carried, kept distinct, and never
count toward a link.

**Scope** by component: `TOTAL` and `BY_WCL_TARGET_TYPE` take only
`WHOLE_OUTPUT` records, because one ability's decisions never explain a total
(M14-D computes no residual). `BY_SOURCE` takes `SOURCE` of that kind;
`BY_ABILITY` takes `ABILITY` of that source kind naming the exact game id, or
`SOURCE` of that kind; `BY_TARGET_CLASS` takes `TARGET_CLASS` of that class.
Every component takes `WHOLE_OUTPUT`. Which ids a decision concerns (a cast id
and its damage ids) is the producer's meaning, stated in the record and never
guessed. An instant meets `[start, end)` only inside it.

**Limits**, machine-readable on every pair: `COMPARISON_COVERAGE_UNCERTIFIED`
and `COMPARISON_DECISIONS_NOT_EVALUATED` always; `DELTA_IS_A_BOUND`,
`EVENT_COUNT_NOT_DAMAGE_AMOUNT`, `SUBJECT_COMPONENTS_OBSERVED_ONLY`,
`UNRESOLVED_EVIDENCE_IN_SCOPE` and `NO_AUTHORITY_BACKED_EVIDENCE` where they
hold.

**Refusals.** A record from any fight but the subject's
(`EVIDENCE_NOT_FROM_SUBJECT_FIGHT`: comparison decisions are never evaluated
and comparison behavior is never decision evidence), a kind outside the
vocabulary, a duplicate id, a non-integer or reversed interval, an interval
outside the subject fight, an empty ability scope, an `OBSERVED_FACT` claiming
NO_AUTHORITY_AVAILABLE, and a refused decomposition.

**Linkage only.** Every result carries `decisionEvidenceSide: SUBJECT_ONLY`,
`use: LINKAGE_ONLY`, `causalClaim: NONE`, `magnitudeAttribution: NONE`,
`verdictFlow: NONE` and `findingEffect: { suppression: NONE, confidence:
NONE }`. There is no confidence field. Comparison figures decide only whether
a direction is proven; the subject's evidence in a component is the same
whichever comparisons are supplied. Records in no component are listed
(`evidenceInNoComponent`), never dropped.

**Real evidence** (the subject's 307 Blood observed decisions: 45 REJECTED,
38 MATCH, 224 UNKNOWN, restated in the test):

- 13 LINKED pairs: the whole-fight Death Strike, Blood Boil, Marrowrend and
  Vampiric Strike event-count rows against all three comparisons, and the
  first-30 s Death Strike row against COHORT246. All are bounds
  (`DELTA_IS_A_BOUND`).
- The Death Strike link rests on 24 authority MATCHes. A link is not a fault.
- The 45 Heart Strike REJECTED results link to nothing: that row's direction
  is UNDECIDED against every comparison.
- Death's Caress has only UNKNOWN results in scope:
  `DECISION_EVIDENCE_UNRESOLVED`.
- No total, table or raw-amount row links.

## M14-F — Reviewed diagnosis projection and public integration

Milestone 14 (autopilot queue entry M14-F). Public contract: EXPECTED, an
additive optional `diagnosis` block on ANALYZED results under `analysis/1`.
No Warcraft Logs request: the committed archive fights and synthetic fights.

**Question.** "Is there an authority finding about the subject's own play,
linked to this proven difference, that a coaching statement may rest on?"
`src/diagnosis/` is the one module that reads both sides (After M14-E): the
registration's published observed-decision view, and the post-hoc
comparison-facts domain. It runs after the analyzer's result is final and
returns data the service attaches beside it. Only the analysis service, the
service result type and the public projection import it; no analyzer,
SimulationCraft, finding, shared analysis or role module does
(`tests/contracts/m14f-diagnosis-layering.test.ts`). The M11-G2 guard now
admits `src/diagnosis/` as the post-hoc domain's only outside reader.

**The reviewed adapter** (`decision-evidence.ts`) restates each compared
observed decision as one M14-E record: `APL_DECISION_OUTCOME`,
`AUTHORITY_BACKED`, MATCH/REJECTED → RESOLVED, UNKNOWN → UNKNOWN, the cast's
instant, scope ABILITY/FOCUS on exactly the observed ability id. Any other
outcome word refuses the restatement. Excluded casts are not decisions.

**A coaching statement** (`AUTHORITY_FINDING_LINKED_TO_DELTA`) needs all of:

1. the pair LINKED by M14-E (proven direction, subject window placed,
   resolved evidence in scope);
2. a REJECTED decision among that evidence. A MATCH is authority-compatible
   evidence, never a finding: a MATCH-only link is the observation
   `NO_AUTHORITY_FINDING_IN_LINK`;
3. `SUBJECT_HIGHER`. A rejected observed cast of X says X was used where the
   authority selected otherwise; it can bear on X's figure being higher,
   never lower (`FINDINGS_DO_NOT_MATCH_DIRECTION`).

A statement carries its findings by decision locator (the schema-v1 decision
identity), every M14-E limit, `magnitudeAttribution: NONE`, and M14-C's named
reasons in effect at a finding's moment as context. Every other pair is an
observation with the M14-E cause or one of the two above, so
`pairs = statements + observations`.

**Comparison is context.** Diagnosis carries `comparisonCoverage:
AT_LEAST_UNCERTIFIED`, `comparisonRole: CONTEXT_ONLY`, `decisionEvidenceSide:
SUBJECT_ONLY` and `findingEffect: { suppression: NONE, confidence: NONE }`.
Nothing changes a decision's outcome or the coverage block: a result with and
without diagnosis has identical decisions and coverage. Each fight's phase
evidence is disclosed so no named reason never reads as "no downtime". Whole
fight only: no aligned-moment policy is reviewed.

**Service.** `AnalysisServiceDeps.comparisonEvidence` is an optional port
told only the analyzed identity. The supplied subject must be the analyzed
report code, revision, fight id, fight bounds, player and specialization
(the post-hoc `fightRef` is a label, not identity), else
`COMPARISON_EVIDENCE_NOT_FOR_THIS_FIGHT`. A throwing port is
`COMPARISON_RETRIEVAL_FAILED`, never a failed analysis. **The deployed
composition supplies no port**: no live comparison retrieval exists, so every
public ANALYZED document carries `NOT_ASSESSED`
(`COMPARISON_EVIDENCE_NOT_RETRIEVED`). REST and MCP publish through the same
projection; the MCP tool description says what the block is and is not.

**Contract.** Every diagnosis vocabulary is declared in
`src/contracts/analysis-contract.ts` independently and pinned to
`src/diagnosis/vocabulary.ts`, whose lists are compile-time pinned to the
post-hoc unions. The field is optional, so this is not a version change. It
is absent from the non-analyzed statuses and from raid night.

**Real evidence** (the subject's 307 Blood decisions, through the service with
a test port over the archive): ASSESSED, whole fight, three comparisons, **no
statement**. The twelve whole-fight M14-E links are
`NO_AUTHORITY_FINDING_IN_LINK`; the 45 Heart Strike rejections are
`DIRECTION_UNDECIDED`. Decision evidence: 307 records, 83 resolved, 224
UNKNOWN, none outside every component.

## M15-A — Finding aggregation and prioritization foundation

Milestone 15 (autopilot queue entry M15-A). Internal: no public contract
change, nothing wired into the service yet (M15-B does that). No Warcraft
Logs request: synthetic records and the committed M11-G2 subject fight.

**Question.** "Of the structured findings the producers already made, which
deserve attention first, and which repeat enough to be one pattern?"
`src/reporting/` reads restated records only. It queries nothing,
re-evaluates nothing and creates no finding: every output item is one input
record or a group of them, and every input appears exactly once, in an item
or in `refused`.

**The restated record** (`finding-record.ts`, `ReportableFinding`). Producer
vocabularies stay with their producers. One reviewed adapter per producer
(`restatement.ts`) maps the producer's status words onto a disposition and
copies the rest; an unreviewed word refuses the whole restatement. The
record carries an explicit authority (`NO_AUTHORITY_AVAILABLE` exactly when
the disposition is), `stateEvidence` PROVEN/INCOMPLETE, an actionability
level, locators, and the producer's own opaque `aggregationKey` (null: never
aggregated). It has no confidence, severity, score or impact field.

Dispositions: `AUTHORITY_DIVERGENCE` (an APL REJECTED), `AUTHORITY_CONSISTENT`,
`OBSERVED_FACT`, and the non-assessments `SUPPRESSED` (with one of
CLAUDE.md's four named environmental reasons), `UNKNOWN`,
`NO_AUTHORITY_AVAILABLE` and `UNSUPPORTED`, each with a reason code. There
is no separate negative-actionability disposition: `m5c1-gcd-semantics`
admits no such vocabulary in `src/` beyond the one assignment outcome, so a
proven restriction is carried as SUPPRESSED with its named reason.
Actionability levels, strongest first: `DECISION_PROVEN_ACTIONABLE`,
`OBSERVED_EXECUTION_ONLY` (the observed cast proves that ability usable,
never the authority's alternative), `NOT_EVALUATED`, `UNKNOWN`. There is no
ACTIONABLE default.

**Adapters.** Observed-decision view: REJECTED → divergence, MATCH →
consistent, both PROVEN; UNKNOWN → UNKNOWN with the decisive blocker class,
else the basis; `OBSERVED_EXECUTION` → `OBSERVED_EXECUTION_ONLY`,
`NOT_ESTABLISHED` → `NOT_EVALUATED`; key = outcome + observed token +
reason. Preparation consumable status: all three kinds, always; OBSERVED →
`OBSERVED_FACT` (a zero under COMPLETE coverage is a fact, never a failure),
UNKNOWN → UNKNOWN with the sorted unknown codes; never aggregated.

**Sections** (`prioritization.ts`, `finding-prioritization/1`):

- `prioritized`: divergences only, and only with PROVEN state and at least
  one locator; a divergence without either is refused, not ranked. Ordered by
  state evidence, then actionability standing
  (`ACTIONABLE_AUTHORITY_DIVERGENCE`,
  `DIVERGENCE_ALTERNATIVE_ACTIONABILITY_UNPROVEN`,
  `DIVERGENCE_ACTIONABILITY_NOT_ESTABLISHED`), then occurrences, category,
  first fight time and item id. Only the first standing is actionable.
- `informational`: consistent results and observed facts. Never failures.
- `carried`: every non-assessment, labelled with its reason. Never ranked.
- `refused`: records with a named problem (duplicate id, unknown vocabulary,
  missing authority or reason, authority/disposition mismatch, suppression
  without a named reason or a reason on anything else, empty key, bad time).

The result states `magnitude: NOT_USED` and `findingEffect: { confidence:
NONE, suppression: NONE, score: NONE }`. `summary.includesNonAssessments` is
true whenever anything is carried or refused, so the set cannot read as a
complete assessment.

**Aggregation** (`aggregation-config.ts`, `finding-aggregation/1`). Records
group only when producer, category, specialization, disposition, authority,
reason code, suppression reason, state evidence, actionability and key are
all equal, so a pattern has exactly its members' standing and nothing is
diluted or inflated. A group at or above its category's
`minOccurrencesForPattern` (default 3, per-category overrides, integer ≥ 2)
is one PATTERN item with its members, first/last time and the union of their
locators; below it, each member is a SINGLE. An invalid config refuses the
whole call rather than being applied. Order is independent of input order.

**Layering** (`tests/contracts/m15a-reporting-layering.test.ts`).
`src/reporting/` imports only itself, the locator type, the observed-decision
view type, the preparation status type and the preparation kind list (its only
runtime import). It never imports the post-hoc comparison-facts domain: the
suppression reasons are declared locally and pinned equal to M14-C's
`EnvironmentalReason` by a test. Nothing imports it yet.

**Real evidence** (the subject's Blood analysis, through the service): 307
decisions and 3 consumable kinds restate with nothing refused. The 83
resolved decisions split into informational MATCHes and prioritized
rejections; 224 UNKNOWN decisions are carried. **No divergence is
actionable**: the view proves only the observed cast. The leading item is the
45-occurrence Heart Strike rejection pattern, standing
`DIVERGENCE_ALTERNATIVE_ACTIONABILITY_UNPROVEN`.

## M15-B — TLDR from trustworthy findings

Milestone 15 (autopilot queue entry M15-B). Public contract: EXPECTED, an
additive optional `tldr` block on every status under `analysis/1`. No
Warcraft Logs request: synthetic views and the committed M11-G2 subject fight
through the service with in-memory doubles.

**Question.** "In a few lines, what did this analysis establish, and how much
of the fight could it examine?" `src/reporting/tldr.ts` restates the
registration's observed-decision view and the preparation report through the
M15-A adapters, prioritizes them, and summarizes. It creates no finding:
every highlight is a prioritized item, every count is a producer's own.

**Coverage first.** `assessmentScope` is the literal PARTIAL, the first line
is always the coverage sentence, and `disclosures` is never empty. The
headline speaks about the analyzed decisions only:

- `GAMEPLAY_NOT_ANALYZED`: no analyzer ran, or it did not analyze. "This is
  not evidence of clean play."
- `NO_DECISION_RESOLVED`: analyzed, nothing resolved; nothing is claimed.
- `AUTHORITY_DIVERGENCES_IN_ANALYZED_DECISIONS`: at least one prioritized
  item.
- `NO_AUTHORITY_DIVERGENCE_IN_ANALYZED_DECISIONS`: resolved decisions, none
  rejected, "not the whole fight".

So "we could only analyze part of this fight" (coverage line, disclosures)
is always stated apart from "found little to fix" (headline).

**What it carries.** Gameplay coverage (eligible, resolved, UNKNOWN,
excluded) read from the view; up to `maxHighlights` (default 3,
`fight-tldr-config/1`, integer 1..10, a presentation choice) prioritized
items with position, kind, category, standing, the producer's
`subjectToken`, occurrences, time span and decision locators; divergence
counts including `notListedItems` and `actionableRecords`; a tally of
carried non-assessments by category and disposition; each consumable as
OBSERVED with its count or UNKNOWN with none; the diagnosis state;
`magnitude: NOT_USED`; `findingEffect` NONE; and author-templated `lines`
over those fields. The structured fields are the contract.

**Never.** UNKNOWN is counted, never highlighted, and an UNKNOWN consumable
has no count. SUPPRESSED is tallied, never highlighted. Highlights keep the
prioritized order (evidence quality, then actionability); no magnitude,
damage, comparison or confidence is read. A highlight whose alternative is
unproven says so.

**Fail closed** (`NOT_ASSESSED` with a reason, never a partial summary): an
invalid config, an output an adapter refuses, a record prioritization
refuses, or a view whose coverage counts disagree with its own decisions
(`COVERAGE_INCONSISTENT`).

**M15-A record change.** `ReportableFinding` gains `subjectToken` (the
observed action token from the view adapter, null for preparation). It is in
the aggregation group key, so a pattern has one subject; ranking never reads
it.

**Service and layering.** The single-fight service builds the TLDR last,
beside the result, on every status (the unsupported path too), and attaches
it to `FightAnalysis.tldr`. It reads the diagnosis state through one
restating function (`tldrDiagnosisOf`: assessed or not, and the statement
count), so `src/reporting/` never imports the diagnosis domain; the M14-F
guard admits exactly that one reading. `src/reporting/` is imported only by
the service and the result type; the public projection reads the TLDR
through the result type and copies it field by field. REST and MCP publish
the same projection. Raid-night cells carry no TLDR.

**Contract.** Every TLDR vocabulary is declared in
`src/contracts/analysis-contract.ts` and pinned to the reporting module's by
`tests/contracts/m15b-tldr-contract.test.ts`. No key names a score, rank,
rating, percentage or correctness (the M6-C sweep runs over it).

**Real evidence** (the subject's Blood analysis): headline
`AUTHORITY_DIVERGENCES_IN_ANALYZED_DECISIONS`, counts equal to the view's
coverage, the 45-occurrence `heart_strike` pattern first with standing
`DIVERGENCE_ALTERNATIVE_ACTIONABILITY_UNPROVEN`, 0 actionable records, 224
UNKNOWN rotation decisions tallied, diagnosis NOT_ASSESSED disclosed.
## AUTOPILOT — the local project supervisor (tooling)

**Status:** implemented (2026-10-31), owner request. This is tooling and
changes no analyzer behavior. The operating guide is `agent/autopilot.md`;
the roadmap queue is `agent/autopilot-queue.md`.

- **What it does.** `scripts/autopilot/run-project.ps1` runs the existing
  Autonomous Tranche Workflow unattended. It launches Claude Code
  non-interactively (never `--bare`, so CLAUDE.md loads), then verifies
  repository and GitHub state itself.
- **Merging.** It merges only through a verified gate (`agent/autopilot.md`
  "The merge gate"): squash, head pinned, never `--admin`.
- **Owner policy change (2026-10-31).** The autopilot may merge, and only
  the autopilot (CLAUDE.md "Git Safety"). Deployment, secrets and new
  Warcraft Logs requests stay with the owner.
- **Binding approval to the candidate.** `scripts/review/openai-review.ps1`
  now also writes `.probe/openai-review/latest.meta.json`: the verdict plus
  the git tree id of the reviewed working tree. That tree is computed in a
  throwaway copy of the real index (so git's stat cache decides, exactly as for a commit), excludes the protected local files, and is withheld if it
  changed during the review. The gate requires the PR head's tree to equal
  it, so an APPROVED verdict authorizes exactly one candidate.
- **Why the supervisor enforces checks.** The private repository's plan has
  no branch protection or rulesets (HTTP 403), and `allow_auto_merge` is
  false. GitHub cannot enforce required checks, so the supervisor's gate
  does, and it merges directly once every check is verified.
- **Durable versus transient state.** The queue is tracked. Heartbeat,
  attempts, ledger and locks live in the gitignored `.probe/autopilot/`. A
  merge is written into the queue by the next tranche's PR, so no PR exists
  only to record state.
