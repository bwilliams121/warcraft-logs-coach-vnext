# Warcraft Logs Coach vNext

Warcraft Logs Coach vNext is a clean rebuild of a World of Warcraft combat-log
coaching analyzer.

The goal is not simply to compare a player against higher-ranked parses.

The goal is to answer:

> What should this player have done differently, given the specialization they
> were playing, the state that can actually be reconstructed, and the encounter
> they were actually in?

Accuracy and evidence are more important than producing a large number of
findings.

---

## Core Principles

- Warcraft Logs is authoritative for observed combat reality.
- SimulationCraft APL is the primary rotational authority for supported DPS and
  tank decisions.
- Specialization evaluators own specialization-specific gameplay
  interpretation.
- Shared infrastructure provides reusable state, evidence, resource, aura,
  cooldown, targeting, and timing primitives.
- Encounter reality determines whether a theoretical recommendation was
  actually actionable.
- Comparable high-performing logs provide context, not rotational truth, and
  cannot suppress a finding or move its confidence on similarity alone.
- Missing or ambiguous evidence produces `UNKNOWN` rather than guessed state.
- Missing authority produces `NO_AUTHORITY_AVAILABLE` rather than invented
  coaching.
- Analysis authority is resolved per decision category at runtime, never fixed
  statically per specialization.
- Healers are not evaluated as DPS with HPS substituted for DPS.
- Augmentation Evoker requires ally context where the decision depends on
  supported players.
- Structured findings are the source of truth; human-readable coaching is
  generated from those findings.
- Confirmed bugs should become regression tests.

---

## Architecture

The project follows this model:

```text
Shared Analysis Platform
        |
        +-- Warcraft Logs ingestion
        +-- completeness tracking
        +-- normalization
        +-- state/evidence infrastructure
        +-- resource primitives
        +-- aura primitives
        +-- cooldown primitives
        +-- targeting
        +-- encounter/actionability
        +-- SimulationCraft parsing
        +-- finding primitives
        |
        +--------------------------------+
        |                                |
        v                                v
Specialization-Owned Evaluator    Preparation Analyzer
        |                                |
        +--------------------------------+
                        |
                        v
                Structured Findings
                        |
                        v
               Reporting / Coaching
```

Preparation analysis is a parallel finding producer.

It does not depend on a specialization evaluator having run, so useful facts
are still reported when specialization gameplay analysis is unsupported.

This intentionally avoids both:

- one giant universal evaluator containing specialization-specific branches
- 40 completely independent analyzers that duplicate shared mechanics

Role modules such as `src/healing/` and `src/support/` reconstruct facts.

They never become universal role evaluators. Healer and support verdicts live
in the specialization evaluator.

---

## Analysis Authorities

Different sources answer different questions.

### Warcraft Logs

Warcraft Logs provides observed reality, including:

- player identity
- class/spec
- casts
- buffs and debuffs
- resources
- targets
- damage
- healing
- absorbs
- deaths
- encounter timing
- targetability
- available encounter state

### SimulationCraft

For supported DPS and tank rotational decisions, SimulationCraft APL provides
the theoretical rotational priority when the required state and APL behavior
are supported.

SimulationCraft does not prove that an action was possible in the actual fight.

### Comparable Warcraft Logs

Comparable successful logs may help establish:

- encounter downtime
- phase behavior
- target transitions
- strategy
- common environmental timing

They do not automatically define the correct rotation.

Behavioral similarity alone may not suppress a finding, and may not lower its
confidence. Confidence describes evidence quality, not popularity.

### Healer Raid Plans

When an authoritative raid cooldown plan exists, it governs whether the healer
correctly executed that assignment.

The analyzer must distinguish:

```text
ASSIGNMENT_MET
```

from:

```text
PLAN_MAY_NEED_REVIEW
```

A healer should not be blamed for correctly following a plan that later appears
suboptimal.

---

## Fail-Closed Analysis

The analyzer deliberately supports uncertainty.

Examples include:

```text
UNKNOWN
NO_AUTHORITY_AVAILABLE
UNSUPPORTED
INSUFFICIENT_SCOPE
INCOMPATIBLE_DATA_VERSION
IDENTITY_CONFLICT
SPEC_NOT_SUPPORTED
```

`UNKNOWN` and `NO_AUTHORITY_AVAILABLE` are distinct and never interchangeable:

```text
NO_AUTHORITY_AVAILABLE = no trustworthy standard for this question
UNKNOWN                = a standard exists, but not enough evidence to apply it
```

Missing information must not silently become:

- false
- zero
- no talent
- no cast
- no buff
- no target
- no resource
- inactivity
- an actionable opportunity
- a lower-priority rotational recommendation

Two defaults are explicitly rejected:

- `ACTIONABLE` is never assumed merely because no restriction was observed.
- An `UNKNOWN` higher-priority APL condition never falls through to a confident
  lower-priority recommendation.

A smaller number of defensible findings is preferable to confident but
unsupported coaching.

---

## Resources

Resource analysis distinguishes between:

- discrete observed resources
- continuously regenerating resources
- exact reconstructed state
- bounded reconstructed state
- unknown state
- being at cap
- actual resource waste

Important invariant:

```text
resourceAtCap != resourceWasted
```

Example:

A Rogue reaching 7/7 Combo Points before immediately spending them does not
automatically mean Combo Points were wasted.

---

## Encounter Actionability

The analyzer should not behave as though every fight is a stationary target
dummy.

For example:

```text
APL says: cast Ability X
Boss enters a 30-second intermission
Ability X cannot be meaningfully used
Player does not cast Ability X
```

Expected result:

```text
No 30-second rotational failure
```

The first meaningful opportunity resumes when the encounter becomes actionable.

`ACTIONABLE` requires evidence just as `NOT_ACTIONABLE` does.

If the required targetability/encounter evidence is `PARTIAL` or `ABSENT`,
actionability is `UNKNOWN`.

Absence of observed restriction is not evidence of availability.

---

## Healers

Healer analysis is intentionally different from DPS analysis.

Early healer analysis focuses on evidence-grounded areas such as:

- assigned raid cooldown execution
- raid damage windows
- death timelines
- absorbs
- useful healing / overhealing context
- other-healer coverage

Raw HPS is not treated as proof of healing quality.

Because no approved per-cast healer model currently exists, per-cast
spell-choice coaching resolves to `NO_AUTHORITY_AVAILABLE` — a missing-authority
condition, not a missing-evidence one.

---

## Augmentation Evoker

Augmentation is not treated as ordinary personal DPS.

Analysis may require:

- buff recipients
- recipient survival
- recipient cooldowns
- group composition
- Ebon Might
- Prescience
- Breath of Eons
- encounter timing

The analyzer never confidently declares a target choice wrong from incomplete
information. It distinguishes the two reasons it cannot judge:

- No validated recipient-quality model exists, which is the current state, so
  target quality resolves to `NO_AUTHORITY_AVAILABLE`.
- A model exists but the required ally state was not retrieved, which is
  `UNKNOWN`.

Augmentation v1 reports observable facts such as buff uptime, recipient
identity, recipient survival, and observed cooldown overlap.

---

## Preparation Analysis

Preparation is a first-class analysis category independent of rotational APL
decisions, and runs in parallel with specialization evaluation.

Every analysis report must include a status for:

- health potion usage
- healthstone usage
- normal combat potion usage

This applies regardless of whether the player died, and regardless of whether
gameplay support exists for the specialization.

If event completeness prevents a reliable count, the status is `UNKNOWN`.

The category is never omitted, and zero is never reported from incomplete
coverage.

Future preparation analysis may also include:

- enchants
- gems
- talents/build context

Racial ability analysis is excluded from initial analysis until that scope is
intentionally enabled later.

---

## Unsupported Specializations

Until a specialization has an evaluator, its gameplay analysis is unsupported.

The analyzer returns `SPEC_NOT_SUPPORTED`, discloses that gameplay analysis is
unsupported, still runs specialization-independent analysis such as
preparation, and labels the report as partial coverage.

It does not return a normal-looking empty report.

Absence of analysis is not evidence of good play.

---

## Reported Coverage

Every report discloses its own analysis coverage and completeness.

A report must not read as a complete assessment when decision coverage is low,
important data is `PARTIAL`, the specialization is unsupported, or important
categories are `UNKNOWN`.

A player should always be able to distinguish:

```text
"We analyzed this fight and found little to fix."
"We could only analyze part of this fight."
```

---

## First Vertical Slice

The first specialization is planned to be:

```text
Assassination Rogue
```

It was chosen because it exercises several difficult parts of the architecture:

- Combo Points
- continuous Energy
- player-applied debuffs
- aura refresh behavior
- cooldown windows
- charges
- talent-sensitive APL logic
- historical regression cases

The first slice should prove:

```text
Warcraft Logs
    ->
retrieval completeness
    ->
normalization
    ->
combat state
    ->
    +-- Assassination evaluator
    |       -> supported SimC APL decision
    |       -> encounter actionability
    |
    +-- preparation analyzer
    ->
structured findings
    ->
minimal coaching
    ->
coverage disclosure
```

Unsupported multi-target or unsupported APL behavior should fail closed rather
than be evaluated incorrectly.

If continuous-resource (Energy) modeling proves difficult, the response is to
narrow the supported Assassination decision surface and leave Energy-dependent
decisions `UNKNOWN` — not to switch specializations and not to guess resource
state.

---

## Second Specialization

Protection Paladin is the intended second specialization.

The purpose of the second spec is not merely to add another class.

It is an architectural test.

If adding Protection Paladin requires rewriting shared infrastructure or adding
Paladin-specific gameplay logic into generic systems, the abstraction should be
reviewed before scaling further.

---

## Testing Philosophy

The main correctness suite should run offline using deterministic fixtures.

Tests should verify:

- retrieval completeness
- normalization
- identity
- resources
- aura direction
- aura windows
- cooldowns
- SimulationCraft decisions
- unsupported APL behavior
- actionability
- encounter downtime
- healer assignments
- Augmentation ally-state requirements
- comparison validity
- evidence
- `UNKNOWN` propagation
- `UNKNOWN` vs `NO_AUTHORITY_AVAILABLE` distinction
- ingestion-scope derivation
- unsupported-specialization reporting
- coverage disclosure

A test should prove not only that correct findings appear, but also that
incorrect findings do not appear.

---

## Important Project Documents

```text
CLAUDE.md
```

Development rules and constraints for agents working on the project.

```text
agent/product-intent.md
```

What the product owner wants the analyzer to do.

Product intent outranks architecture.

```text
agent/architecture.md
```

How the software is intended to be structured.

```text
agent/testing.md
```

How analyzer correctness is proven and regressions are prevented.

---

## Deployment and Access

The application is intended to run on Cloudflare.

REST/API, the planned web application, a future WoW addon handoff, an optional
future companion application, and future MCP all call the same backend analysis
services. None of them contain a separate gameplay analyzer.

Warcraft Logs access uses a server-side OAuth Client Credentials flow. Public
and unlisted reports are supported: the report code is supplied directly by the
caller and is itself the capability, and no report code is ever enumerated,
published or cached. The Warcraft Logs client ID, client secret and access
token are backend-only and never reach browser code, addon code, API responses,
logs or fixtures. Private-report support requires user-authorized OAuth and is
deferred.

---

## Development

The project is TypeScript on Cloudflare Workers. Node 24 or newer is required
for local tooling.

### Install

```powershell
npm.cmd ci
```

On Windows, use `npm.cmd` / `npx.cmd`. PowerShell execution policy may block
`npm.ps1`.

### Local secrets

```powershell
Copy-Item .dev.vars.example .dev.vars
```

Then edit `.dev.vars` and fill in a real Warcraft Logs client ID and secret.
`.dev.vars` is gitignored and must never be committed.

Create an API client at <https://www.warcraftlogs.com/api/clients/>.

### Run locally

```powershell
npm.cmd run dev
```

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:8787/health
```

### Verify

```powershell
npm.cmd run format:check
npm.cmd run typecheck
npm.cmd test
```

`npm test` runs two Vitest projects:

```text
node      tests/unit, tests/contracts        plain Node, no Workers runtime
workers   tests/integration, tests/regression  real workerd via Miniflare
```

Run one at a time with `npm.cmd run test:unit` or `npm.cmd run test:workers`.

The suite is offline. No test reaches Warcraft Logs, and no test requires real
credentials — tests that need them construct obvious sentinel values.

Offline is enforced, not just intended: Warcraft Logs code takes an injected
`fetch`, and the workers project blocks all outbound network at the runtime
level, so an accidental real request fails deterministically instead of quietly
succeeding.

### Deploy

Secrets are never stored in `wrangler.jsonc`. Set them once per environment:

```powershell
npx.cmd wrangler login
npx.cmd wrangler secret put WCL_CLIENT_ID
npx.cmd wrangler secret put WCL_CLIENT_SECRET
npm.cmd run deploy
```

`wrangler login` and `wrangler secret put` are interactive.

---

## Current Status

Milestone 1 (foundation), Milestone 2 (Warcraft Logs connectivity and identity
preflight), the Milestone 3 ingestion machinery and the Milestone 4 shared state
primitives are implemented.

`POST /v1/analysis` now validates the request, resolves configuration,
authenticates to Warcraft Logs with OAuth Client Credentials, and runs a
factual identity preflight:

```text
report exists (public or unlisted)
  -> requested fight exists
  -> requested source actor exists
  -> the actor is a player, not a pet or NPC
  -> the player participated in that fight
  -> name, class and spec all resolve
```

Each of those has its own explicit failure — a bad fight ID returns
`FIGHT_NOT_FOUND`, not a generic error, and never "analysis is not
implemented".

Gameplay analysis is **not** implemented. After a successful preflight the
request returns an explicit `ANALYSIS_NOT_IMPLEMENTED` error. It never returns a
successful-looking empty report, because absence of analysis is not evidence of
good play.

### Milestone 3 — ingestion, built and deliberately not wired

Milestone 3 adds the event ingestion capability: a reusable paginator, a
declared retrieval plan, evidence capability and coverage, and a normalized
`CombatFight`.

It is **not connected to `/v1/analysis`**, and that is the design rather than an
oversight. No analyzer is enabled, so no analyzer declares required inputs, so
there is nothing to ingest for. Wiring it now would make the route spend
Warcraft Logs API points retrieving evidence nothing reads, while still
answering `ANALYSIS_NOT_IMPLEMENTED` — the route lying about what it did. An
integration test asserts a valid request issues exactly one GraphQL call and
never an events query.

`CombatIngestionPort` exists as a type with no production binding. Milestone 5
injects it at the same time as the first analyzer declares its inputs.

What ingestion establishes when it is called:

```text
context query -> archive gate -> fight, phases, actor and ability catalogs
              -> paginate the All stream, normalizing each page
              -> revision recheck
              -> CombatFight + provenance + capability + coverage
```

Three distinctions it keeps apart, each replacing a way the old analyzer went
wrong:

- **Capability vs coverage.** COMPLETE/PARTIAL/ABSENT describe coverage of
  evidence Warcraft Logs is *capable* of supplying. A fully retrieved stream
  with zero targetability events does not become `TARGETABILITY: COMPLETE` —
  capability is tracked separately, and failing to observe something never
  proves it cannot be observed.
- **Retrieval completeness vs fight finality.** An in-progress fight that was
  fully retrieved is COMPLETE coverage *and* IN_PROGRESS finality.
- **Events vs malformed observations.** An observation whose timestamp and type
  could not be established is not an event and is kept out of the event
  sequence, rather than being given a fabricated envelope.

**Event family support is evidence-gated.** A raw event type string is
recognised only when a sanitized live capture committed under
`tests/fixtures/wcl/events/` contains it — envelope-only handling included. A
contract test fails the build if code names a type that no fixture carries.

Twenty raw types are currently contracted, covering casts, auras, damage,
healing, absorbs, resources, summons and combatant info. Four categories remain
`UNVERIFIED` because no capture has contained them yet: `TARGETABILITY`,
`DEATHS`, `INTERRUPTS`, `DISPELS`. **None of them is `NOT_OBSERVABLE`** —
failing to observe something is not evidence that it cannot be observed.

Three behaviours were measured against the live API rather than assumed:

- `events(endTime:)` is INCLUSIVE and `startTime` is inclusive, so the request
  window is closed and an event at exactly `endTime` is inside the requested
  range. Pagination cursors are exclusive. Intervals carry the bound kind
  explicitly rather than adding a millisecond or assuming integer timestamps.
- `-1` is a no-actor sentinel on both `sourceID` and `targetID`, and never
  becomes actor -1.
- Resource snapshots are flattened onto the event with a `resourceActor`
  discriminator (1 = source, 2 = target). A target-side snapshot carries the
  target's health, so it is never attributed to the source.

See `tests/fixtures/wcl/events/PROVENANCE.md` for the full evidence record.

### Milestone 4 — shared state primitives, complete

Milestone 4 turns a normalized `CombatFight` into queryable state. Like
ingestion, it is **not wired into `/v1/analysis`** — M5 is where interpretation
begins.

Every answer carries its own certainty. `EXACT` when the observation is the
instant asked about, `STALE` when it is earlier and the age is disclosed, and
`UNKNOWN` with a reason otherwise. Nothing is defaulted, and silence is never
evidence of absence.

**Supported**

- deterministic event-relative temporal addressing
- evidence/capability/coverage-aware `StateResult`
- actor, ability and cast indexing
- aura presence from observed transitions — an application, a refresh, or a
  stack removal reporting a positive resulting count all prove `ACTIVE`; only an
  ordinary removal proves `INACTIVE`
- source-specific aura ownership, with sourceless transitions failing closed
- exact absolute stack observations
- exact resource observations
- explicit `PRE_COST` timing for evidence-backed costed cast observations
- `STALE` prior resource observations, with their age
- standalone `resourcechange` observations, with no pre/post interpretation
- typed encounter phase and intermission state
- provenance

**Explicitly unsupported, and `UNKNOWN` by construction**

- arbitrary continuous resource state
- resource delta replay
- passive regeneration reconstruction
- `resourcechange` pre/post timing
- cooldown readiness
- targetability
- continuous current target
- alive/dead state
- aura expiry without a duration authority
- gameplay correctness and actionability

Two field-level evidence contracts were settled against live captures for
`gameVersion` 1 / `logVersion` 17, and both are narrow on purpose:

- **Aura `stack` is the absolute resulting count** after its own stack-change
  event — not a delta, not the prior count. Across two reports, zero of 1,012
  stack applications read 1, and 131 of 131 transitions from a plain application
  read 2.
- **A costed completed cast's `amount` is `PRE_COST`.** The falsifier is
  structural and decided from one event: `amount == max` while `cost > 0` would
  require having held more than the cap. The sharpest case is a capped discrete
  resource spent in full — `amount == max == cost == 7`.

A third contract was investigated and **deliberately left unsettled**: whether a
`resourcechange` attachment describes the state before or after its own delta.
The evidence strongly favours post-change — 50 discriminating cases matched it
and none matched the alternative — but it relies on same-timestamp retrieval
adjacency behaving as causal order, which ingestion does not guarantee. It is
therefore `EVENT_ASSOCIATED`, and no `POST_CHANGE` exists anywhere in the
runtime.

**Knowing what a number means is not permission to reconstruct one.** Both
settled contracts fix the meaning of a value AT AN INSTANT. Between observations
the amount stays `UNKNOWN` — and that is a measured conclusion, not a gap waiting
to be filled: replaying an anchor plus intervening observed deltas was tried
against live captures and does not reconcile. Two explanations survive and
neither can be excluded, so `resourceAt(time)`, delta replay, interpolation,
synthesized changes and `amount - cost` are all permanently out.

### Live Warcraft Logs probe

Raw event shapes are verified by a manual probe, never in CI:

```powershell
Copy-Item .dev.vars.example .dev.vars   # then fill in real credentials
npm.cmd run probe
```

It spends real API points, writes raw output to the gitignored `.probe/`, and
never prints or persists a credential. Only reviewed slices produced by
`node scripts/sanitize-probe.mjs` may enter `tests/fixtures/`.

Measured on one 24-player heroic pull at `EVENT_PAGE_LIMIT = 5000` with
resources: 40 pages, 196,366 events, ~8.2 s, ~54.8 MB decoded JSON, largest page
~1.45 MB, 41 API points. `limit` is a soft cap — pages returned up to 5,030
events. That is an evidence-supported operating value, not a claim of
optimality.

Point a capture at a different log with:

```powershell
$env:PROBE_REPORT_CODE="..."; $env:PROBE_FIGHT_ID="6"; $env:PROBE_SOURCE_ID="5"
npm.cmd run probe
```

### Deployment smoke test

After deploying, verify the real Warcraft Logs path end to end. This calls
Warcraft Logs and spends API points, so it is never part of CI:

```powershell
$body = @{ reportCode = "<a real public report code>"; fightId = 1; sourceId = 1 } | ConvertTo-Json
Invoke-WebRequest -Uri https://<worker-host>/v1/analysis -Method POST -Body $body -ContentType "application/json" -SkipHttpErrorCheck
```

Expected: HTTP 501 `ANALYSIS_NOT_IMPLEMENTED` for a valid report/fight/player,
and a specific 404/422 for an invalid one.
