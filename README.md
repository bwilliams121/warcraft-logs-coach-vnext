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

**Implemented (PREP-1, PREP-2).** The shared producer is
`src/analysis/preparation/`. Every public analysis result of schema
`warcraft-logs-coach.analysis/1` carries a `preparation` block, on every
status, unsupported specializations included:

- `assessment: "ASSESSED"`, with `statuses.healthPotion`,
  `statuses.healthstone` and `statuses.combatPotion`. Each status is either:
  - `countState: "OBSERVED"` with a complete `count`, where zero is reported
    only under COMPLETE coverage;
  - `countState: "UNKNOWN"` with its reasons, and `observedAtLeast` as a lower
    bound, never a count.
- or `assessment: "NOT_ASSESSED"` with the reason (for example, retrieval
  failed).

The raid-night report (PREP-3) carries the same three statuses in compact
form on every present player's cell. Each is a count, or `UNKNOWN` with a
lower bound and reason codes; the named uses stay in the single-fight report.

A use is any use of the shared cooldown slot, and each use is named. The
field is optional in the v1 schema only so that adding it was not a version
change; this build always emits it.

Every analysis report includes a status for:

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

## Onboarding foundation (M11-A)

A third specialization registers through the specialization module factory
(`src/findings/spec-module.ts`), which checks identity coherence against the
pinned forty-specialization roster (`src/data/game/spec-roster.json`) and
builds the registration row; it owns no gameplay meaning. New
specializations enter `INTERNAL_ONLY` and are promoted to public only
through a test-owned evidence gate that requires at least one real
sanitized-capture `MATCH` or `REJECTED`. The first M11 specialization,
Retribution Paladin, landed `INTERNAL_ONLY` at M11-A4 (`src/specs/paladin/
retribution/`, `paladin-retribution-observed-decisions`) and was promoted
to PUBLIC at M11-A5 after that gate reported both a real `MATCH` and real
`REJECTED` evidence for it — completing M11-A, the first reusable
onboarding slice. The second M11 specialization, Blood Death Knight, took
the same path over a longer road: `INTERNAL_ONLY` at M11-B2 as a measurement
slice for the `run_action_list` dispatch cohort, ten evidence slices
(M11-B2 … M11-B10), a promotion-readiness audit at M11-B11, and PUBLIC at
M11-B12 with twenty-three qualifying real sanitized-capture assertions. The
third, Brewmaster Monk, arrived `INTERNAL_ONLY` at M11-C2 as the next
cohort's measurement slice, built its decision surface over two independent
Shado-Pan subjects (M11-C3 … M11-C4i), passed the global observation and
discrimination gates on real evidence with one real `REJECTED` per subject,
and became PUBLIC at M11-C4j (M11 as a whole is NOT complete: twenty-seven
ordinary specializations remain, healers are M12, Augmentation is M13). Its slice
judges observed Holy Power spender decisions (Divine Storm versus
Templar's/Final Verdict) only, under the class/spec authority boundary
(racials, potions, item uses and external buffs are outside the rotational
decision domain; race and faction are not read); every other rotational
cast is reported as excluded `OUTSIDE_SUPPORTED_SLICE` — observed, not
judged. There is no supplemental analysis and no performance scoring; a
decision whose state cannot be reconstructed remains `UNKNOWN`, which is
expected. The roster lists what the game has, not what this project
analyzes. See `agent/architecture.md`, "M11-A", "M11-A4" and "M11-A5", and
the tree's README.

## Second Specialization

Protection Paladin is the second specialization, public since M10-D.

The purpose of the second spec is not merely to add another class.

It is an architectural test.

If adding Protection Paladin requires rewriting shared infrastructure or adding
Paladin-specific gameplay logic into generic systems, the abstraction should be
reviewed before scaling further.

What public Protection Paladin analysis is, exactly:

- observed OFFENSIVE global-cooldown decisions compared against the pinned
  SimulationCraft Protection APL, and nothing else;
- defensive cooldowns, active mitigation, self-healing, interrupts and
  survival are NOT evaluated — no authority is bound to those domains;
- off-global-cooldown actions such as Shield of the Righteous are excluded
  from the decision population, not judged;
- `MATCH` means authority-compatible only; `UNKNOWN` means the evidence
  cannot establish the result, never that a mistake was made.

The canonical unsupported specialization used by tests and smoke checks is
Warrior/Arms (A7R6 fight 7, actor 4), a real captured identity with no
analyzer.

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

## Analysis interfaces

Two surfaces expose the same engine. They share one application composition, one
public projection and one rate-limit budget, so a result cannot differ by
transport — a test asserts the two payloads are deeply equal.

### What the analysis actually is

**Observed-decision authority verification for the publicly supported
specializations: Assassination Rogue, Protection Paladin, Retribution
Paladin, Blood Death Knight and Brewmaster Monk.**

It takes the rotational decisions a player *already made* and checks each one
against that specialization's pinned SimulationCraft action priority list.
Each observed decision resolves to one of three outcomes:

| Outcome | Meaning |
| --- | --- |
| `MATCH` | The supported analysis resolved the same action that was observed. **Authority-compatible only.** |
| `REJECTED` | The authority can positively establish the observed action was not selectable in the proven state. It does not name what should have been done instead. |
| `UNKNOWN` | The evidence or the authority could not prove the comparison. A legitimate, successful result. |

It does **not** provide:

- arbitrary next-action prediction
- "what should I have pressed here?"
- generalized all-specialization coaching
- a correctness percentage
- a performance score, grade or rating

`MATCH` does not mean correct, optimal, ideal, best, recommended or
mistake-free. `UNKNOWN` is first-class and is never a fault. Partial coverage is
expected — most decisions typically resolve to `UNKNOWN`, and casts whose
execution lane is not established are excluded from the denominator entirely.
Read the `coverage` block before characterizing a fight.

Protection Paladin analysis (public since M10-D) compares only observed
OFFENSIVE global-cooldown decisions against the pinned Protection APL. It does
not evaluate defensive cooldowns, active mitigation, self-healing, interrupts
or survival; off-global-cooldown actions such as Shield of the Righteous are
excluded from the decision population, not judged. See the
[Second Specialization](#second-specialization) section.

Retribution Paladin analysis (public since M11-A5) evaluates only observed
Holy Power SPENDER decisions — Divine Storm versus Templar's/Final Verdict —
against the pinned Retribution APL, when the necessary state can be
established. Generators, Wake of Ashes, Divine Toll, Execution Sentence and
the other cooldown branches are reported as excluded `OUTSIDE_SUPPORTED_SLICE`
(a spec-neutral exclusion reason added to schema v1 at M11-A5: observed, not
judged, never a mistake and never an UNKNOWN); defensive cooldowns,
interrupts, survival, race, faction, gear use effects and consumables are not
evaluated. Most spender decisions resolve `UNKNOWN` on current evidence, and
the coverage block says so. See the
[Onboarding foundation](#onboarding-foundation-m11-a) section.

Blood Death Knight analysis (public since M11-B12) evaluates observed
offensive global-cooldown decisions — Death Strike, Heart Strike (including
its Vampiric Strike execution), Blood Boil, Marrowrend and Death's Caress —
against the pinned Blood APL, when the necessary state can be established.
It is **validated for the San'layn hero tree only**: a build whose observed
talent tree resolves to Deathbringer, to no hero tree, or to more than one is
refused rather than judged (`AUTHORITY_NOT_AVAILABLE` or
`PROFILE_NOT_RESOLVED`), because no Deathbringer evidence has been measured.
Death and Decay, Dancing Rune Weapon and Consumption are reported as excluded
`OUTSIDE_SUPPORTED_SLICE` — observed, not judged. It does not evaluate active
mitigation, self-healing, defensive cooldowns, interrupts or survival (Death
Strike is judged only as the offensive list's spender), does not model
`fight_remains`, does not reconstruct Rune regeneration or Runic Power across
an unobserved spend, and does not read race, faction, gear use effects or
consumables. Most decisions resolve `UNKNOWN` on current evidence — 72 of 123
on the committed 165 s subject — and the coverage block says so. One authority
gap is deliberately deferred: Bone Shield's DBC maximum is 10 and Improved
Bone Shield raises the in-game maximum to 12, but no supported predicate reads
that maximum, so the analyzer neither enforces nor infers it. See
`agent/architecture.md`, "M11-B", and `src/specs/deathknight/blood/README.md`.

Brewmaster Monk analysis (public since M11-C4j, a beta-quality slice)
evaluates observed offensive global-cooldown decisions — Keg Smash, Blackout
Kick, Tiger Palm, Breath of Fire and Invoke Niuzao — against the pinned
Brewmaster APL, when the necessary state can be established. It is
**validated for the Shado-Pan hero tree only**: a build whose observed talent
tree resolves to Master of Harmony, to no hero tree, or to more than one is
refused rather than judged (`AUTHORITY_NOT_AVAILABLE` or
`PROFILE_NOT_RESOLVED`), because no Master of Harmony evidence has been
measured. Celestial Brew, Expel Harm, Chi Burst, Exploding Keg, Empty the
Cellar and Rushing Jade Wind are excluded `OUTSIDE_SUPPORTED_SLICE`. An
alternative action counts as available only when every usability condition is
proven from the log (cooldown upper bound, the decision cast's own pre-cost
Energy, same-target range). The modelling is NOT exhaustive, and these areas
stay `UNKNOWN` rather than being inferred: what Black Ox Brew changes (no
reviewed transition), Empty the Cellar's buff when the window holds no
transition of it, Keg Smash charges and its hasted recharge (only a ≥1-charge
upper bound is used), Energy between observations, and every alternative whose
usability is not fully proven. On the committed evidence: 109 MATCH / 10
REJECTED / 70 UNKNOWN over one subject's full fight and 47 / 1 / 91 over the
second subject's 165 s window. It does not evaluate brews, Stagger, active
mitigation, self-healing, defensive cooldowns, interrupts or survival, and it
does not score performance. See `agent/architecture.md`, "M11-C4j", and
`src/specs/monk/brewmaster/README.md`.

Any specialization other than those five returns `status: "SPEC_NOT_SUPPORTED"`
with no decisions and no coverage. That is a complete, truthful answer — not
evidence of clean play. The canonical list of supported specializations is
derived at runtime from the production analyzer catalog (the PUBLIC
registrations), which is also what the MCP tool descriptions publish.

### REST — `POST /v1/analysis`

Accepts either form:

```json
{ "reportUrl": "https://www.warcraftlogs.com/reports/<code>#fight=8&source=15" }
```

```json
{ "reportCode": "<code>", "fightId": 8, "sourceId": 15 }
```

Callers cannot select ingestion scope; it is derived from the selected
analyzer's declared requirement.

**On success the body IS the public analysis result**, with no wrapper — the
same object MCP returns as `structuredContent`. All five analysis statuses
(`ANALYZED`, `SPEC_NOT_SUPPORTED`, `AUTHORITY_NOT_AVAILABLE`,
`PROFILE_NOT_RESOLVED`, `INSUFFICIENT_EVIDENCE`) return **HTTP 200**: the
request was successfully analyzed to a truthful domain status.

Failures keep the `{ "ok": false, "error": { "code", "message" } }` envelope and
a non-2xx status — 400 invalid request, 404 missing report/fight/source, 409
report revision changed, 422 archived or not-analyzable, 429 rate limited, 502
untrusted upstream data, 503 unavailable or misconfigured.

**Requires bearer authentication.** Send
`Authorization: Bearer <ANALYSIS_AUTH_TOKEN>`. A missing or invalid credential
returns `401` with `WWW-Authenticate: Bearer`, consuming no rate-limit budget
and performing no Warcraft Logs work. `/mcp` requires the *same* credential —
one private principal, two surfaces, so neither is the cheap way in.

`/health` remains public: it discloses nothing and costs nothing.

### MCP — `POST /mcp`

A stateless Streamable HTTP MCP server (protocol `2026-07-28`, with stateless
compatibility for 2025-era clients). It exposes exactly three tools, each a
thin interface over the same application services as the REST routes — no
`ping`, no primitives:

| Tool | REST equivalent | Schema |
| --- | --- | --- |
| `analyze_warcraft_log` | `POST /v1/analysis` | `warcraft-logs-coach.analysis/1` |
| `analyze_raid_night` | `POST /v1/raid-night` | `warcraft-logs-coach.raid-night/1` |
| `analyze_encounter_context` | `POST /v1/encounter-context` | `warcraft-logs-coach.encounter-context/1` |

`analyze_warcraft_log` takes a tagged input union so the two forms cannot be
mixed:

```json
{ "source": "url", "reportUrl": "https://www.warcraftlogs.com/reports/<code>#fight=8&source=15" }
```

```json
{ "source": "ids", "reportCode": "<code>", "fightId": 8, "sourceId": 15 }
```

It returns the public analysis result as both `structuredContent` and a JSON
text block. Analysis-domain statuses are successful tool results; transport and
service failures are `isError: true` with no `structuredContent`, so an outage
can never be parsed as a finding.

`/mcp` is protected by, in order: Host validation (DNS-rebinding), Origin
validation, and the same `ANALYSIS_AUTH_TOKEN` bearer credential `/v1/analysis`
requires.

That bearer token is the current **private/development** protection mechanism.
It is not OAuth, not multi-user identity, and not a final public
ChatGPT-facing authorization architecture. Cloudflare Access or full OAuth
remain open for production exposure.

### Analysis rate limit

**10 analysis attempts per 60 seconds, shared by REST and MCP.**

One analysis spends Warcraft Logs API points from a finite, paid, account-wide
quota. Both transports charge the same Cloudflare rate-limit binding under the
same key, so a caller cannot double their budget by switching protocols.

The limiter runs immediately before the shared analysis runner. Cheap traffic —
`tools/list`, rejected authentication, rejected Origin, malformed tool
arguments, unparseable REST bodies, `/health` — does not consume it.

If the limiter denies, REST answers 429 and MCP returns a `RATE_LIMITED` tool
error. If the limiter is unavailable or throws, both **fail closed** (REST 503,
MCP `RATE_LIMITER_UNAVAILABLE`) rather than running unmetered. Neither is ever
reported as gameplay `UNKNOWN`.

**The limiter is defence-in-depth, not the security boundary.** Cloudflare's
Worker Rate Limiting counters are local to each Cloudflare location and
intentionally eventually consistent, so `10 / 60s` is a per-location brake, not
an exact global accounting of Warcraft Logs quota. Bearer authentication is what
decides *who* may spend capacity; the limiter decides *how fast* an authorized
caller may spend it. Neither substitutes for the other.

Operator note: the binding is `ANALYSIS_RATE_LIMITER` in `wrangler.jsonc`. It
needs no dashboard resource. Cloudflare's rate-limit binding is not exercised by
local `wrangler dev` or by the offline test suite; tests drive an injected
limiter port that reproduces allow, deny and outage deterministically. After
deployment, watch for unexpected analysis volume rather than assuming the
limiter caps it globally.

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

Analysis now runs. After a successful preflight the request retrieves and
normalizes the fight, derives state, and evaluates the player's observed
rotational decisions against the pinned SimulationCraft authority. It never
returns a successful-looking empty report, because absence of analysis is not
evidence of good play.

See [Analysis interfaces](#analysis-interfaces) for what the two endpoints
return and what the results do and do not mean.

### Milestone 3 — ingestion, built and now bound

Milestone 3 adds the event ingestion capability: a reusable paginator, a
declared retrieval plan, evidence capability and coverage, and a normalized
`CombatFight`.

It stayed deliberately unwired until an analyzer existed to consume it — wiring
it earlier would have spent Warcraft Logs API points retrieving evidence nothing
read. Milestone 6-E bound it at the single production composition root, where it
is handed to the application service alongside preflight. `CombatIngestionPort`
is now a **required** dependency, so "the engine works but nobody connected it"
is a compile error rather than a runtime status.

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

Expected: HTTP 200 with a `warcraft-logs-coach.analysis/1` result for a valid
report/fight/player, and a specific 404/422 for an invalid one. For an
Assassination Rogue or a Protection Paladin the `status` should be `ANALYZED`;
for any other specialization it should be `SPEC_NOT_SUPPORTED`, which is a
truthful result and not a failure. (The request above carries no
`Authorization` header and will answer `401`; the full checklist shows the
authenticated form.)

The full post-deploy checklist is in
[`agent/deployment-smoke.md`](agent/deployment-smoke.md).
