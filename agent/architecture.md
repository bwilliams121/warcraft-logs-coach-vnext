# Warcraft Logs Coach vNext Architecture

## Purpose

This document defines the technical architecture for Warcraft Logs Coach vNext.

CLAUDE.md defines project principles and development rules.

This document defines how the application should be divided into systems and
how data should flow between those systems.

The architecture should make it possible to analyze every World of Warcraft
specialization without building 40 unrelated analyzers.

The design is:

- One generic analysis platform
- Class-specific semantics where necessary
- Specialization-specific semantics where necessary
- Encounter-specific context where necessary
- Role-specific analysis models
- Structured evidence at every important decision point

---

# Primary Data Flow

The normal analysis pipeline should conceptually follow this flow:

Warcraft Logs
    |
    v
WCL Ingestion
    |
    v
Event Normalization
    |
    v
Normalized Combat Model
    |
    v
Combat State Reconstruction
    |
    +------------------------------+
    |                              |
    v                              v
Class / Spec State           Encounter State
    |                              |
    +---------------+--------------+
                    |
                    v
             Ideal Decision
                    |
                    v
              Actionability
                    |
                    v
              Rule Evaluation
                    |
                    v
         Contextual Validation
                    |
                    v
              Scoring / Impact
                    |
                    v
              Coaching Output

No reporting code should bypass this pipeline and independently infer combat
truth.

---

# Source Responsibilities

Each external or runtime source has a specific responsibility.

## Warcraft Logs

Warcraft Logs provides observed combat reality.

It supplies information such as:

- Reports
- Fights
- Actors
- Classes
- Specializations
- Talents
- Gear
- Casts
- Buffs
- Debuffs
- Resources
- Damage
- Healing
- Deaths
- Encounter events
- Targets
- Timing

Warcraft Logs data must be normalized before analysis code consumes it.

Analysis modules should not repeatedly issue their own Warcraft Logs queries.

---

## SimulationCraft

For supported DPS and tank rotational decisions, SimulationCraft APL is the
primary source of theoretical rotational priority.

SimulationCraft integration should be isolated behind a dedicated interface.

The rest of the analyzer should not need to know whether an APL originated from:

- A local SimulationCraft source
- Parsed APL data
- A generated intermediate representation
- Another approved import mechanism

The analyzer should operate against a normalized APL representation.

APL version/source information should be preserved so analysis can eventually
identify which game/APL version produced a recommendation.

---

## Healer Models

Healers do not automatically use the DPS/tank SimulationCraft decision path.

A healer specialization declares the model appropriate for its analysis.

Possible authorities include:

- Raid cooldown assignment
- QE Live / approved healer model
- Validated simulation source
- Spec-specific analysis rules

Healing decisions should be evaluated against raid damage and health deficits
rather than merely maximizing HPS.

---

## Raid Cooldown Plans

When an authoritative raid cooldown assignment exists, it becomes the authority
for assigned healer cooldown execution.

The plan should be imported through an interface rather than embedded directly
inside healer code.

Conceptually:

Raid Plan
    |
    v
Normalized Cooldown Assignments
    |
    v
Healing Evaluation

The analyzer must distinguish between:

- A healer failing an assignment
- A healer correctly following an assignment that may itself need improvement

---

## Comparable Warcraft Logs

Comparable successful logs are contextual evidence.

They can help establish:

- Intermissions
- Normal downtime
- Encounter strategy
- Target transitions
- Common cooldown holds
- Movement patterns
- Phase behavior
- Expected successful behavior

They are not the primary source of rotational priority.

Comparison data should pass validity checks before use.

---

# Repository Architecture

The target source structure should approximately become:

warcraft-logs-coach-vnext/
|
|-- CLAUDE.md
|-- README.md
|
|-- agent/
|   |-- architecture.md
|   |-- testing.md
|   |-- warcraft-logs.md
|   |-- simc.md
|   |-- healing-analysis.md
|   `-- regression.md
|
|-- src/
|   |
|   |-- api/
|   |
|   |-- wcl/
|   |
|   |-- simc/
|   |
|   |-- engine/
|   |   |-- normalization/
|   |   |-- state/
|   |   |-- apl/
|   |   |-- resources/
|   |   |-- buffs/
|   |   |-- cooldowns/
|   |   |-- targeting/
|   |   |-- actionability/
|   |   |-- evaluation/
|   |   |-- evidence/
|   |   |-- confidence/
|   |   `-- scoring/
|   |
|   |-- classes/
|   |
|   |-- specs/
|   |
|   |-- encounters/
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
|   `-- contracts/
|
`-- scripts/

This structure is directional rather than permission to create empty modules
without a need.

Add modules as their implementation becomes necessary.

---

# API Layer

Location:

src/api/

Responsibilities:

- Accept user/API requests
- Validate request parameters
- Resolve report/fight/source identifiers
- Invoke the analysis pipeline
- Return structured or rendered responses
- Handle API-level errors

The API layer should not:

- Implement rotations
- Reconstruct resources
- Decide whether a player made a mistake
- Contain spell-specific knowledge
- Directly produce coaching conclusions

The API layer is an entry point, not the analyzer.

---

# Warcraft Logs Layer

Location:

src/wcl/

Responsibilities:

- Authentication
- GraphQL requests
- Pagination
- Report retrieval
- Fight retrieval
- Actor retrieval
- Event retrieval
- Ranking/comparison retrieval
- Warcraft Logs request caching where appropriate
- Translating WCL responses into ingestion objects

Possible future modules:

src/wcl/
    client
    reports
    fights
    actors
    events
    rankings
    pagination

The WCL layer should preserve raw source information when useful for debugging.

It must not contain coaching rules.

---

# SimulationCraft Layer

Location:

src/simc/

Responsibilities:

- Load approved SimulationCraft APL definitions
- Parse or import APL logic
- Normalize APL expressions
- Preserve source/version information
- Expose APLs to the generic decision engine

The SimulationCraft layer should not:

- Query Warcraft Logs
- Produce coaching prose
- Decide encounter actionability
- Hard-code one encounter's strategy

APL parsing and APL evaluation are separate concerns.

src/simc handles obtaining/normalizing the APL.

src/engine/apl handles evaluating the normalized APL against reconstructed
combat state.

---

# Normalization Layer

Location:

src/engine/normalization/

Purpose:

Convert Warcraft Logs-specific data into stable internal objects.

The remainder of the analyzer should not depend heavily on Warcraft Logs'
original JSON shape.

Example:

Warcraft Logs event:

    raw WCL fields

becomes:

NormalizedCastEvent:

    timestamp
    sourceActorId
    targetActorId
    abilityId
    eventType
    evidence

Normalization makes regression fixtures and future source changes easier to
handle.

---

# Normalized Combat Model

The normalized combat model is the foundation of the analyzer.

It should represent the fight independently of coaching.

Conceptual top-level object:

CombatFight

Possible fields:

- report
- fight
- encounter
- difficulty
- startTime
- endTime
- duration
- actors
- player
- talents
- gear
- casts
- buffs
- debuffs
- resources
- damage
- healing
- absorbs
- deaths
- targets
- encounterEvents

Each important object should retain evidence or source references where useful.

The first implementation milestone is to make this model reliable.

Do not begin sophisticated rotational coaching before this model is validated.

---

# Combat State Engine

Location:

src/engine/state/

Purpose:

Answer questions about combat state at a particular moment.

Examples:

- Which buffs were active?
- Which debuffs were active?
- How much resource did the player have?
- Which targets were available?
- Which cooldowns were available?
- Was the player alive?
- Which allies were active?
- Which encounter phase was active?

The state engine must distinguish:

KNOWN

from:

UNKNOWN

It must not invent hidden state merely because a downstream rule needs a value.

---

# Resource Engine

Location:

src/engine/resources/

Responsibilities:

- Resource anchors
- Explicit gains
- Explicit spending
- Resource reconstruction
- Resource maximums
- Deficit calculation
- Waste calculation
- Evidence tracking

Resource behavior specific to a class or specialization should be supplied by
runtime class/spec definitions.

The generic resource engine should understand mathematical resource concepts.

It should not independently know that:

"Mutilate generates Combo Points."

That belongs in specialization/runtime game knowledge.

Important rule:

Being capped is not the same as wasting resource.

Example:

7 / 7 Combo Points

does not automatically mean:

Combo Points wasted.

Actual waste requires evidence of generation when insufficient capacity existed
or another valid spec-specific condition.

---

# Buff and Debuff Engine

Location:

src/engine/buffs/

Responsibilities:

- Applications
- Refreshes
- Removals
- Stacks
- Durations
- Source actor
- Target actor
- Active windows

Never lose source/target direction.

The engine must be able to distinguish:

Player applied debuff to boss

from:

Boss applied debuff to player.

Ambiguous direction should produce UNKNOWN where necessary.

---

# Cooldown Engine

Location:

src/engine/cooldowns/

Responsibilities:

- Cooldown usage
- Cooldown availability
- Charges
- Reset behavior where known
- Cooldown windows
- Cooldown overlap
- Fight-time opportunities

Cooldown availability and cooldown quality are separate evaluations.

Example:

Deathmark was available

does not automatically mean:

Deathmark should have been cast.

The applicable APL, encounter state, and actionability still matter.

---

# APL Evaluation Engine

Location:

src/engine/apl/

The APL engine should be generic.

It receives:

- A normalized APL
- Reconstructed combat state
- Specialization semantics
- Timestamp / decision point

It produces a structured decision.

Conceptual output:

DecisionResult

- timestamp
- authority
- recommendedAction
- rule
- conditions
- consideredActions
- requiredState
- confidence
- evidence

It should not immediately produce:

"You should have cast X."

That belongs later in the pipeline.

The APL engine should not contain giant specialization-specific conditional
blocks.

Avoid:

if assassination
if protectionPaladin
if frostMage

when specialization runtime definitions can provide the required semantics.

---

# Decision Points

The analyzer should not necessarily evaluate every millisecond of a fight.

A decision-point system should eventually identify meaningful times where a
player could reasonably choose an action.

Examples:

- Global cooldown becomes available
- Cast completes
- Channel completes
- Important cooldown becomes available
- Relevant proc occurs
- Target state changes
- Encounter becomes actionable after downtime

The exact decision-point model should be designed and tested before broad
rotation scoring is implemented.

---

# Actionability Engine

Location:

src/engine/actionability/

Purpose:

Determine whether a theoretical recommendation was realistically executable.

Conceptual result:

ActionabilityResult

- status
- reason
- evidence
- confidence

Possible status:

- ACTIONABLE
- NOT_ACTIONABLE
- UNKNOWN

Possible reasons:

- TARGET_UNAVAILABLE
- INTERMISSION
- PLAYER_DEAD
- PLAYER_INCAPACITATED
- FORCED_DOWNTIME
- ENCOUNTER_END
- MOVEMENT_CONSTRAINT
- RANGE_UNKNOWN
- OTHER

Do not flag an APL violation when the recommended action was not reasonably
actionable.

---

# Encounter Layer

Location:

src/encounters/

Purpose:

Represent encounter-specific state that cannot be correctly inferred from
generic combat rules alone.

Examples:

- Intermissions
- Untargetable periods
- Phase transitions
- Add phases
- Forced downtime
- Encounter-specific target requirements
- Special strategy windows

Encounter definitions should describe environment.

They should not rewrite a specialization's general rotation.

Correct:

"The boss cannot be attacked during this interval."

Incorrect:

"Assassination Rogues should never use Deathmark at 2:05."

The second statement belongs to rotation/actionability analysis derived from the
first fact.

---

# Class Layer

Location:

src/classes/

Purpose:

Store mechanics shared across multiple specializations of one class.

Example structure:

src/classes/
    rogue/
    paladin/
    warrior/
    mage/
    evoker/

Possible responsibilities:

- Shared abilities
- Shared defensive mappings
- Shared utility
- Shared class mechanics
- Shared resource behavior

Only place something at class level when it genuinely applies at class level.

---

# Specialization Layer

Location:

src/specs/

Each specialization should have an explicit runtime definition.

Example:

src/specs/
    rogue/
        assassination/
        outlaw/
        subtlety/

    paladin/
        holy/
        protection/
        retribution/

    evoker/
        augmentation/
        devastation/
        preservation/

The specialization definition is responsible for supplying the generic engine
with the meaning required to analyze that specialization.

Possible data:

- Analysis contract
- Spell mappings
- Resource semantics
- Buff mappings
- Debuff mappings
- Cooldown mappings
- Talents
- Hero talents
- APL reference
- Defensive metadata
- Special state requirements

Do not duplicate generic engine behavior inside every specialization.

---

# Specialization Analysis Contract

Every supported specialization should expose an analysis contract.

Conceptual example:

{
    role: "DPS",
    rotationAuthority: "SIMC_APL",
    cooldownAuthority: "SIMC_APL",
    performanceModel: "DAMAGE",
    requiresAllyState: false,
    requiresRaidDamageModel: false,
    requiresEncounterModel: true
}

The generic analyzer should use this contract to determine which systems apply.

Examples:

Assassination Rogue

    role = DPS
    rotationAuthority = SIMC_APL
    performanceModel = DAMAGE

Protection Paladin

    role = TANK
    rotationAuthority = SIMC_APL
    performanceModel = HYBRID

Restoration Shaman

    role = HEALER
    rotationAuthority = HEALER_MODEL
    cooldownAuthority = RAID_PLAN
    performanceModel = HEALING
    requiresRaidDamageModel = true

Augmentation Evoker

    role = SUPPORT
    rotationAuthority = SIMC_APL
    performanceModel = SUPPORT
    requiresAllyState = true

These examples illustrate architecture.

Exact runtime contracts should be validated during implementation.

---

# Healing Architecture

Location:

src/healing/

Healing analysis is a specialized evaluation system built on top of the same
normalized fight model.

It should reuse generic systems such as:

- Actors
- Buffs
- Cooldowns
- Encounter state
- Damage
- Deaths
- Evidence
- Confidence

but add healer-specific systems.

Possible modules:

src/healing/
    damage-events
    health-deficits
    cooldown-assignments
    cooldown-evaluation
    triage
    overhealing
    deaths

The core unit of healer analysis should often be a meaningful damage event
rather than simply a cast count.

---

# Raid Damage Model

Healing analysis should eventually identify meaningful incoming-damage windows.

Conceptual:

RaidDamageEvent

- startTime
- peakTime
- endTime
- affectedPlayers
- totalDamage
- healthDeficits
- deaths
- activeDefensives
- activeHealingCooldowns
- evidence

This enables the analyzer to answer:

- Did the raid need healing?
- Was a cooldown assigned?
- Was it active at the correct time?
- Was useful healing available?
- Did someone die before healing could realistically occur?
- Was the event already sufficiently covered?

---

# Healer Cooldown Assignment Model

Conceptual:

CooldownAssignment

- player
- ability
- encounter
- plannedTime
- plannedEvent
- tolerance
- source
- evidence

Evaluation can then distinguish:

ASSIGNMENT_MET

ASSIGNMENT_EARLY

ASSIGNMENT_LATE

ASSIGNMENT_MISSED

ASSIGNMENT_UNKNOWN

and separately:

PLAN_MAY_NEED_REVIEW

Following a bad plan correctly is not the same as player execution failure.

---

# Support Architecture

Location:

src/support/

Support analysis should reuse generic combat state while adding ally-centric
state.

The primary initial consumer is Augmentation Evoker.

Possible modules:

src/support/
    ally-state
    buff-targets
    support-windows
    recipient-value
    group-context

Support analysis should not use personal DPS as its sole measure of success.

---

# Augmentation State

Augmentation may require reconstruction of:

- Active allies
- Ally specializations
- Ally deaths
- Recipient buffs
- Buff durations
- Recipient cooldown windows
- Group composition
- Encounter phase
- Valid recipients

When required ally information is missing:

Return UNKNOWN.

Do not convert incomplete ally state into a confident targeting mistake.

---

# Comparison Layer

Location:

src/comparison/

Responsibilities:

- Select comparison parses
- Validate comparison parses
- Normalize fight timing
- Compare encounter behavior
- Identify consensus
- Detect common downtime
- Detect common strategy-dependent behavior

Comparison selection should consider:

- Encounter
- Difficulty
- Specialization
- Player survival
- Fight participation
- Fight duration
- Build differences where relevant
- Group composition where relevant

Do not assume rank 1 is automatically the best behavioral reference.

---

# Encounter-Time Alignment

Different kills may have different durations.

Comparison should not simply divide every cast count by fight length and assume
all seconds are equally actionable.

Whenever practical, comparisons should reason about:

- Encounter phase
- Actionable combat time
- Intermissions
- Target availability
- Relative mechanic timing

Example:

Player A fight:

6:40

Player B fight:

5:20

If both encounters contain the same 30-second forced intermission, that
intermission should not create artificial rotational differences merely because
fight lengths differ.

---

# Evaluation Layer

Location:

src/engine/evaluation/

Evaluation converts:

Ideal decision

plus

Actual player behavior

plus

Actionability

into a structured result.

Conceptual:

EvaluationResult

- timestamp
- category
- expected
- actual
- actionability
- status
- severity
- confidence
- evidence
- context

Possible statuses:

- CORRECT
- INCORRECT
- SUPPRESSED
- NOT_ACTIONABLE
- UNKNOWN

Coaching prose should be generated from these objects.

---

# Evidence Layer

Location:

src/engine/evidence/

Important conclusions should preserve supporting evidence.

Evidence may reference:

- WCL event
- Resource anchor
- Derived state
- Encounter state
- APL condition
- Comparison consensus
- Raid cooldown assignment

The analyzer should be debuggable.

A developer should be able to ask:

"Why did the analyzer say this?"

and inspect the evidence chain.

---

# Confidence Layer

Location:

src/engine/confidence/

Confidence describes evidence quality.

Possible values:

- HIGH
- MEDIUM
- LOW
- UNKNOWN

Confidence should be derived from the quality/completeness of evidence.

Confidence should not merely reflect how large a performance difference was.

Example:

Large apparent mistake + poor evidence

may still be:

LOW confidence.

---

# Scoring

Location:

src/engine/scoring/

Scoring should happen after correctness evaluation.

Do not begin the project by trying to produce a single overall player score.

First determine whether individual conclusions are accurate.

Future scoring may consider:

- Frequency
- Severity
- Damage/healing impact
- Cooldown importance
- Death impact
- Confidence
- Actionability

UNKNOWN results should not become automatic penalties.

---

# Reporting Layer

Location:

src/reporting/

Responsibilities:

- Convert structured evaluations into useful coaching
- Produce TLDR summaries
- Produce detailed analysis
- Format markdown
- Format JSON
- Rank coaching opportunities by importance

The reporting layer must not invent findings.

It consumes structured analysis results.

This means wording can change without changing analyzer truth.

---

# Runtime Data

Location:

src/data/

Runtime game knowledge belongs here or in class/spec/encounter modules.

Possible data categories:

- Spell metadata
- Talent metadata
- Hero talent metadata
- Cooldown metadata
- Resource metadata
- Encounter metadata
- Version metadata

Runtime data must be machine-readable.

Do not rely on CLAUDE.md or model memory for game mechanics required by the
deployed application.

---

# Game Version Awareness

World of Warcraft changes frequently.

Runtime data and APLs should eventually preserve version information.

Possible metadata:

- Expansion
- Season
- Game build
- Data revision
- APL revision
- Retrieval/update date

Do not silently mix incompatible game versions.

Version handling does not need to be fully implemented in the first milestone,
but the architecture should not prevent it.

---

# Testing Architecture

Tests should be layered.

## Unit Tests

Location:

tests/unit/

Test isolated behavior.

Examples:

- Resource math
- Buff windows
- APL condition evaluation
- Actionability logic
- Cooldown calculation

---

## Regression Tests

Location:

tests/regression/

Reproduce real bugs and real Warcraft Logs cases.

Every confirmed production bug should eventually gain a regression test.

---

## Fixtures

Location:

tests/fixtures/

Fixtures contain captured representative data needed to reproduce analyzer
behavior offline.

Fixtures should make development possible without constantly calling live
Warcraft Logs APIs.

---

## Contract Tests

Location:

tests/contracts/

Verify stable public/internal interfaces.

Examples:

- API response structure
- Combat model schema
- Evaluation result schema
- Specialization contract schema

---

# Live API vs Fixture Tests

Do not make the main test suite depend on live Warcraft Logs availability.

Use live API requests for:

- Integration validation
- Fixture generation
- Explicit live tests

Use captured fixtures for:

- Unit tests
- Regression tests
- Normal development

This reduces:

- Rate-limit problems
- Patreon/API quota usage
- Network instability
- Changes in external data
- Non-reproducible bugs

---

# Historical Worker

The existing Warcraft Logs Coach Worker should remain available during vNext
development when practical.

It may be used for:

- Behavior comparison
- Regression discovery
- Historical output
- Test-case discovery
- Public API contract reference

It is not the architectural foundation of vNext.

Do not copy the entire old Worker into this project and refactor it.

Build vNext beside it.

---

# Implementation Milestones

Development should proceed approximately in this order.

## Milestone 1 — Project Foundation

- Repository
- Runtime
- Test framework
- Configuration
- Secrets handling
- Basic Worker/API shell

No coaching required.

---

## Milestone 2 — Warcraft Logs Ingestion

Reliably retrieve:

- Report
- Fight
- Actor
- Player
- Class
- Spec
- Talents
- Gear
- Required events

No coaching required.

---

## Milestone 3 — Normalized Combat Model

Convert WCL data into reliable internal objects.

Validate:

- Actors
- Casts
- Buffs
- Debuffs
- Resources
- Damage
- Healing
- Deaths
- Targets

No sophisticated coaching yet.

---

## Milestone 4 — State Reconstruction

Implement:

- Buff state
- Debuff state
- Resources
- Cooldowns
- Targets
- Player state
- Evidence
- UNKNOWN handling

---

## Milestone 5 — One DPS/Tank Specialization

Use one specialization to validate the complete rotational architecture.

Recommended characteristics:

- Known SimC APL
- Known resource
- Cooldowns
- Buff/debuff interactions
- Existing regression logs

Do not attempt all specs simultaneously.

---

## Milestone 6 — Encounter Actionability

Implement:

- Intermission handling
- Target availability
- Forced downtime
- Encounter state
- Comparison-log contextual validation

Prove that encounter downtime does not generate false rotation failures.

---

## Milestone 7 — Regression Framework

Build representative real-log regression cases.

Validate the full pipeline.

---

## Milestone 8 — Additional DPS/Tank Specs

Expand using specialization contracts rather than duplicated analyzers.

---

## Milestone 9 — Healer Architecture

Implement:

- Raid damage events
- Health deficits
- Cooldown assignments
- Healer-specific analysis authority
- Relevant deaths
- Healing-context evaluation

Validate healer behavior separately from DPS logic.

---

## Milestone 10 — Augmentation

Implement:

- Ally state
- Support buffs
- Recipient state
- Recipient cooldown context
- Support-window evaluation

Do not treat Augmentation as ordinary DPS.

---

## Milestone 11 — Advanced Comparison

Improve:

- Comparison-log selection
- Encounter timing alignment
- Strategy inference
- Consensus behavior
- Fight-duration normalization

---

## Milestone 12 — Coaching and Scoring

Once structured evaluations are trustworthy:

- Prioritize findings
- Estimate impact
- Generate clear coaching
- Improve TLDR
- Generate detailed reports

Accuracy remains more important than number of findings.

---

# First Vertical Slice

Do not begin by implementing all 40 specializations.

The first complete vertical slice should prove:

Warcraft Logs
    |
    v
Normalized Fight
    |
    v
Reconstructed State
    |
    v
Spec Contract
    |
    v
SimC APL
    |
    v
Ideal Decision
    |
    v
Encounter Actionability
    |
    v
Structured Evaluation
    |
    v
Coaching

for one well-understood DPS or tank specialization.

Once this architecture works reliably, additional specs should primarily require
new runtime definitions and tests rather than rewrites of the generic engine.

---

# Architectural Success Criteria

The architecture is successful when:

1. A new DPS/tank specialization can be added without rewriting the core engine.
2. A healer can use healer-specific analysis without pretending to be DPS.
3. Augmentation can incorporate ally state without contaminating ordinary DPS
   analysis.
4. Encounter downtime can suppress impossible rotational recommendations.
5. A coaching result can be traced back to evidence.
6. Missing evidence produces UNKNOWN instead of fabricated certainty.
7. Warcraft Logs queries are separated from analysis logic.
8. SimulationCraft APL is separated from encounter reality.
9. Top logs provide context rather than becoming the rotation bible.
10. Real bugs can be reproduced offline with regression fixtures.
