# Warcraft Logs Coach vNext Testing Strategy

## Purpose

This document defines how Warcraft Logs Coach vNext proves that its analysis is
correct.

Testing is not limited to proving that code runs.

The test system must prove that the analyzer:

- Retrieves complete enough Warcraft Logs data
- Detects incomplete data
- Normalizes combat events correctly
- Resolves player identity correctly
- Reconstructs state without fabricated certainty
- Handles discrete and continuous resources correctly
- Uses the correct analysis authority for each decision
- Evaluates supported SimulationCraft APL behavior correctly
- Fails closed on unsupported SimulationCraft behavior
- Respects encounter actionability
- Does not mistake downtime for poor play
- Keeps specialization interpretation inside specialization evaluators
- Treats healers differently from DPS
- Treats Augmentation as ally-dependent support where required
- Preserves evidence
- Preserves UNKNOWN
- Keeps UNKNOWN and NO_AUTHORITY_AVAILABLE semantically distinct
- Requires evidence for ACTIONABLE, not only for NOT_ACTIONABLE
- Does not allow an UNKNOWN APL condition to select a lower-priority action
- Does not allow top-log behavior to become rotational truth
- Does not allow comparison behavior to suppress findings without environmental
  evidence
- Does not allow comparison behavior to move confidence
- Produces preparation findings independently of specialization evaluation
- Discloses coverage rather than implying completeness
- Prevents previously fixed bugs from returning

The test suite should make confident-but-wrong coaching difficult to ship.

---

# Testing Philosophy

The analyzer should be tested from the inside out.

Preferred order:

1. Retrieval correctness
2. Completeness correctness
3. Normalization correctness
4. Identity correctness
5. Shared-state correctness
6. Specialization-state correctness
7. Authority correctness
8. Ideal-decision correctness
9. Actionability correctness
10. Finding correctness
11. Contextual-validation correctness
12. Reporting correctness

A correct-looking coaching sentence generated from incorrect internal state is
still a failed analyzer.

Tests should prefer structured state and findings over prose snapshots.

---

# Test Areas

Primary test locations:

```text
tests/
    unit/
    regression/
    fixtures/
    contracts/
    integration/
```

Each area serves a different purpose.

---

# Unit Tests

Location:

```text
tests/unit/
```

Unit tests verify isolated behavior with small deterministic inputs.

Examples:

- Resource arithmetic
- Resource intervals
- Aura windows
- Cooldown math
- Cooldown charges
- Cooldown resets
- Source/target direction
- Evidence propagation
- Completeness propagation
- APL expression evaluation
- Authority resolution
- Actionability
- Timing tolerance
- Decision-point calculation
- Finding primitives
- Comparison consensus

Unit tests should be:

- Fast
- Deterministic
- Offline
- Narrow

They should not require live Warcraft Logs access.

---

# Regression Tests

Location:

```text
tests/regression/
```

Regression tests reproduce real bugs, edge cases, and representative combat
situations.

Every confirmed production/analyzer bug should eventually receive a regression
test.

Preferred workflow:

1. Identify an incorrect result.
2. Preserve enough evidence to reproduce it.
3. Add a regression fixture.
4. Add a test that fails for the correct reason.
5. Fix the implementation.
6. Verify the new test passes.
7. Run related tests.
8. Run the broader regression suite.

A regression test should explain why it exists.

Example:

```text
case:
resource_cap_not_waste

reason:
Player reached maximum Combo Points immediately before using a spender.
Previous analyzer incorrectly reported resource waste.

expected:
resourceAtCap = true
resourceWaste = false
```

---

# Fixtures

Location:

```text
tests/fixtures/
```

Fixtures contain captured deterministic input.

Fixtures should make most analyzer development possible without repeatedly
querying Warcraft Logs.

Potential fixture categories:

```text
tests/fixtures/
    wcl/
    normalized/
    simc/
    encounters/
    raid-plans/
    runtime-data/
    comparisons/
```

Do not create empty directories merely because they are listed here.

Create them when implementation requires them.

---

# Fixture Provenance

Important real-log fixtures should preserve provenance.

Where practical include:

- Report code
- Fight ID
- Source ID
- Encounter
- Difficulty
- Character
- Class
- Specialization
- Role
- Game version/build
- Capture date
- Ingestion scope
- Completeness
- Reason fixture exists

Example:

```json
{
  "reportCode": "...",
  "fightId": 6,
  "sourceId": 5,
  "class": "Paladin",
  "spec": "Protection",
  "purpose": "resource reconstruction regression"
}
```

The test should not require access to the original live log.

---

# Regression Corpus (M9)

Location:

```text
tests/corpus/
```

The regression corpus is the versioned, digest-pinned form of fixture
provenance. Its contract lives in `tests/support/corpus/contract.ts` and its
policy in `tests/corpus/README.md`; this section records what must stay true.

Two records are kept apart:

- An ARTIFACT is bytes plus provenance: lineage classification, source
  capture coordinates and page/completeness facts, every transformation and
  the claims it invalidates, and the coverage the artifact still retains.
- A CASE is a claim about an artifact, owned by exactly one layer, expressed
  as registered assertion kinds with typed parameters.

Lineage is classified by what was DONE to the bytes:

```text
REAL_CAPTURE          untransformed Warcraft Logs output (none committed)
SANITIZED_CAPTURE     selected / redacted / remapped; every event observed
DERIVED_FROM_CAPTURE  deliberately mutated; names its parent; not observed
SYNTHETIC             hand-authored; no lineage
```

A mutated capture is DERIVED, never SANITIZED. The loader rejects the
mislabel.

Rules the corpus must never relax:

- Trimming is a transformation. A slice retains no coverage unless a
  contiguous range provably survived, and a fight built from it is granted
  coverage from `retainedCoverage` only. A slice cannot prove an absence.
- A digest proves identity, not authenticity or completeness.
- Corpus structure is validated; combat validity is not. A deliberately
  malformed payload is a valid artifact when a case tests its rejection.
- Nothing is sorted, deduplicated, repaired or normalized on load.
- An assertion kind without an executor is DECLARED and is not coverage.
- An authority-dependent case pins the committed authority revision; a stale
  pin is rejected rather than silently re-pinned.
- UNKNOWN and NO_AUTHORITY_AVAILABLE are separate outcome classes.
- Unrecorded metadata is `UNAVAILABLE`, `REDACTED` or `NOT_APPLICABLE` —
  three different facts — never `null` and never guessed.
- Production code never imports the corpus or any test machinery, and the
  corpus machinery reaches no transport, clock, filesystem or environment.
  `tests/contracts/m9a-corpus-layering.test.ts` enforces both.

The loader runs identically under plain Node and workerd, so the same corpus
can back layer tests and transport-parity tests without a second loader.

## The corpus is the canonical evidence (M9-B)

The eleven sanitized event slices formerly under `tests/fixtures/wcl/events/`
live under `tests/corpus/artifacts/wcl-events/` with the same names and bytes.
Layer tests read them through `committedEventArray(id)` in
`tests/support/corpus/artifacts.ts`; `fixtureId` in production evidence
records IS the corpus artifact id, and a contract test resolves it against
the corpus. There is no second copy. The investigation prose behind each
slice is preserved verbatim in `tests/corpus/PROVENANCE-legacy.md`; the
manifest is authoritative for what a slice is and may prove.

Retained coverage is a list of GRANTS — categories, actor scope, ranges — and
a fight built from an artifact is granted exactly those and nothing else.
Three slices (C3a, C3c1, D2) carry grants because their in-place filters are
recorded predicates; every property- or index-based selection carries none.
The corpus contract is at version 2 (M9-B); version 1 (M9-A, flat ranges) is
rejected explicitly and never reinterpreted.

## One coverage policy for captured evidence (M9-B)

`tests/support/corpus/fight.ts` is the only place captured events receive
coverage. Layer tests build fights through `corpusFight` / `corpusState`, or
through `corpusFightFrom` with a named PREMISE (`TRUNCATED_BEFORE`,
`EVENT_REMOVED_AT`, `FANNED_ACTORS`) that the interpreter applies to the
artifact's own grants and never widens beyond what the construction
justifies. No test declares coverage over captured events by hand; a guard in
`tests/contracts/m9a-corpus-layering.test.ts` fails any module that reads
captured raw events, normalizes them itself and imports a fight builder.

Where a hypothetical complete-coverage scenario is needed to test analyzer
logic, it is built from SYNTHETIC events over `syntheticFight`, labelled as a
test premise, and never attributed to a capture. The M5-C2 Vanish-before-
Garrote rule is the model: the five-event capture pins UNKNOWN /
INSUFFICIENT_COVERAGE; the same real events inside the C3c1 slice (recorded
predicate) pin PROVEN TRUE; a synthetic premise tests the rule.

The harness takes its runtime as an input (`NODE` | `WORKERD`) and refuses at
selection time any case whose kinds need a runtime the caller lacks; the
complete gate runs under workerd.

## The corpus command and its proofs (M9-C)

`npm run test:corpus` (`scripts/corpus/gate.mjs`) is the corpus's own CI
command and a separate job in `.github/workflows/ci.yml`: manifest currency
(regenerate and compare), the Node corpus suite, the complete workerd gate in
two separate processes with byte-identical machine-readable reports, and a
drift check against the committed `tests/corpus/report.json` (rewritten only
by `--write-report`, from an execution). Credentials are stripped from every
child environment; the workers pool answers 503 to any outbound fetch, and
`tests/regression/m9c-corpus-network-isolation.test.ts` proves that path
fails actionably from inside the harness.

## The normal suite reads no credentials file (TEST-HYGIENE)

`npm test` must not read `.dev.vars`, which on a developer machine holds real
Warcraft Logs credentials. Wrangler reads `.dev.vars` (or `.env`) from the
directory of the config file it is given, and the Workers pool passes it only
a config path. So the `workers` project points at `tests/workers/wrangler.jsonc`,
a test-only copy of the production config in a directory with no secrets file.
`tests/contracts/test-hygiene-dev-vars.test.ts` proves four things:

- the pool points at the copy;
- the copy's normalized settings equal the production config's (only the
  file's own path differs), so the tests boot the Worker that ships;
- the copy's directory holds no `.dev.vars*` or `.env*` file;
- the Miniflare options built from the copy carry only `ENVIRONMENT`.

The run no longer prints `Using secrets defined in .dev.vars`.
`vitest.probe.config.ts` stays the only config that reads `.dev.vars`, and the
only thing that can spend Warcraft Logs points. The outbound guard and the
sentinel bindings are unchanged.

Mutation discipline: when the corpus grows, prove it has teeth by applying a
real defect to production code, running the gate, recording the failing case
and its expected/actual, restoring by hand and confirming with `git diff`. A
defect the gate does not catch is a missing case, not a passing grade —
M9-C's relaxed absence gate produced
`combat-state.partial-grant-cannot-prove-absence-before-it-begins`.
Performance metadata on a capture source is context for selection and never
an expected result.

## The harness (M9-B)

`runCorpusHarness(selection)` in `tests/support/corpus/harness.ts` validates
the corpus, runs one case, one layer or everything, and reports each
assertion as `PASSED`, `FAILED` or `NOT_EXECUTED` — never `SKIPPED`. A failure
carries the case id, artifact id, owning layer, kind, assertion ordinal,
expected and actual semantic results, and an evidence locator when the layer
offered one; it never dumps a payload. `complete` requires zero FAILED and
zero NOT_EXECUTED.

The complete-corpus gate is `tests/regression/m9b-corpus-gate.test.ts`, in
the `workers` project because PUBLIC_CONTRACT parity drives the real Worker
and MCP handler. It is part of `npm test`; M9-C owns a dedicated CI command.

Expectation changes must fail understandably.
`tests/unit/m9b-corpus-failure-demonstration.test.ts` mutates one thing at a
time — a verdict, an anchor, a cursor, a byte, a pinned revision — and asserts
the exact failure the harness reports.

---

# Contract Tests

Location:

```text
tests/contracts/
```

Contract tests protect important schemas and interfaces.

Potential contracts include:

- CombatFight
- CompletenessRecord
- Actor identity
- ResourceState
- ResourceInterval
- Aura interval
- Cooldown state
- AuthorityResolution
- ActionabilityResult
- Finding
- Specialization evaluator interface
- Declared analyzer required inputs
- Ingestion scope
- Application-service result
- Application-service result states
- API response
- Raid cooldown assignment

Contract tests should detect accidental interface drift.

Two contracts are load-bearing for fail-closed behavior and deserve explicit
attention:

- `UNKNOWN` and `NO_AUTHORITY_AVAILABLE` remain semantically distinct
- the application-service result can express `SPEC_NOT_SUPPORTED` and coverage

---

# Integration Tests

Location:

```text
tests/integration/
```

Integration tests verify external-system and cross-module behavior.

Potential areas:

- Warcraft Logs OAuth Client Credentials authentication
- Token acquisition and refresh
- GraphQL validity
- Pagination
- Cloudflare Worker startup
- Environment configuration
- Analysis service orchestration
- REST-to-service behavior
- Future MCP-to-service behavior

Integration tests should not replace deterministic correctness tests.

---

# Secret Exposure Negative Test

Required negative test.

The Warcraft Logs client ID and client secret are backend secrets.

Test that they never appear in:

- API responses
- error messages
- report output
- committed fixtures
- anything intended for browser or addon consumption

Required regression name:

```text
wcl_credentials_never_leave_the_backend
```

---

# Offline-First Rule

The primary correctness suite must not depend on live Warcraft Logs.

Live tests may fail because of:

- Network problems
- Warcraft Logs outages
- Authentication problems
- Rate limits
- External schema changes

Those failures must not make core analyzer correctness impossible to validate.

Use live calls for:

- Explicit integration tests
- Fixture capture
- Schema verification
- Manual validation

Use fixtures for normal correctness testing.

---

# Warcraft Logs Retrieval Tests

The WCL layer should be tested separately from gameplay evaluation.

Eventually test:

- Report lookup
- Fight lookup
- Player lookup
- Source ID resolution
- Actors
- Talents
- Gear
- Cast events
- Aura events
- Resource events
- Damage
- Healing
- Absorbs
- Deaths
- Targetability
- Encounter events
- Pagination
- Retry behavior
- Completeness

The retrieval layer should never produce coaching findings.

---

# Pagination Completeness Tests

Pagination is correctness-critical.

Test:

- Single-page response
- Multiple pages
- Final page
- Missing intermediate page
- Truncated response
- Stalled cursor (no progress)
- Decreasing cursor
- Malformed paginator
- Rate limit mid-pagination
- Safety ceiling reached

## No Page-Level Retry

Earlier drafts of this document listed "retry success" and "retry exhaustion"
as pagination tests. Those are withdrawn.

CLAUDE.md forbids inventing generic retries, and the only retry in the system is
the bounded cached-token 401 refresh inside the WCL transport. A page-level
retry would spend more API points on a rate limit and would blur the line
between "we could not retrieve this" and "there was nothing here".

The correct tests are therefore that a failed page is NOT retried, and that the
stream reports PARTIAL with the covered ranges it can actually vouch for.

Critical regression:

```text
page 1 retrieved
page 2 retrieved
page 3 fails permanently
page 4 never retrieved
```

Expected:

```text
affected event stream = PARTIAL
```

Not:

```text
no events occurred during the missing period
```

Missing pages must not become fake inactivity.

---

# Completeness Tests

Completeness must be explicitly tested.

Supported conceptual states:

```text
COMPLETE
PARTIAL
ABSENT
```

Test completeness by:

- Data category
- Actor scope
- Time range
- Ingestion scope

Critical invariant:

```text
missing data != negative evidence
```

Examples:

```text
talent data absent
```

does NOT mean:

```text
talent disabled
```

```text
raid actor data absent
```

does NOT mean:

```text
no other healer used a cooldown
```

```text
cast data partial
```

does NOT mean:

```text
player was idle
```

---

# Capability Tests

Coverage and capability are different questions and must be tested separately.

```text
COVERAGE    did we obtain the evidence we requested for this range?
CAPABILITY  can the selected WCL source supply this category at all?
```

Required tests:

- A category whose capability is not `OBSERVABLE` exposes NO coverage value.
- A fully retrieved stream containing zero events of a category does NOT make
  that category `COMPLETE` unless capability is independently `OBSERVABLE`.
- Capability is never inferred from a fight's contents: two fights with
  identical retrieval and different event counts produce identical capability.
- Every category key is always present.

## Capability Evidence Is Directional

This is the most important negative test in the group.

```text
a sanitized capture may establish        OBSERVABLE
absence from any number of captures establishes NOTHING
NOT_OBSERVABLE requires authoritative NEGATIVE evidence
```

Failing to observe a category proves only that the captured fights did not
contain it. Specifically:

```text
targetability events not observed
```

must leave:

```text
TARGETABILITY = UNVERIFIED
```

and must NOT produce:

```text
TARGETABILITY = NOT_OBSERVABLE
```

Test that the capture-to-capability function cannot return `NOT_OBSERVABLE` at
all, and that any `NOT_OBSERVABLE` registry entry cites schema-exhaustive or
documented-unsupported evidence.

---

# Evidence-Gated Contract Tests

A raw event type string or field name recognised by name is a CONTRACT against
a non-frozen upstream.

Test that:

- every recognised raw type cites committed evidence — a sanitized capture or a
  typed schema path
- envelope-only handling is NOT exempt: decoding no family fields lowers the
  size of the contract, not the evidence bar for it
- a cited fixture id actually resolves to a committed fixture
- any raw type without evidence normalizes to `UNSUPPORTED_TYPE`

A contract may never be written to satisfy a milestone exit criterion.

---

# Malformed Envelope Tests

Three outcomes, tested as three distinct things:

```text
valid envelope + recognised type + valid fields  -> normal event
valid envelope + recognised type + bad fields    -> MALFORMED_FAMILY, in events[]
valid envelope + unknown type                    -> UNSUPPORTED_TYPE, in events[]
NO valid envelope                                -> malformed raw observation,
                                                    OUTSIDE events[]
```

Required negative tests:

- A malformed raw observation invents no timestamp, type, source or target.
- It still preserves its retrieval position (stream, page, index, ordinal) and
  which fields were missing or invalid.
- A known type with a bad required field does NOT become an unknown type.
- An unknown type does NOT degrade any category; a malformed known event does.

---

# Coverage Interval Tests

Intervals carry an explicit upper bound: `INCLUSIVE` or `EXCLUSIVE`. The lower
bound is always inclusive.

Verified semantics:

```text
non-terminal page  [start, cursor)   cursor is the first timestamp NOT returned
terminal page      [start, endTime]  endTime returns events at its own instant
```

Required tests:

- An event at exactly the requested `endTime` is INSIDE the requested range.
- An exclusive range does NOT satisfy an inclusive request of the same numbers.
- Adjacent cursor ranges chain with no gap and no double-counted instant.
- No test may rely on adding a millisecond, an epsilon, or integer timestamps.

- A page containing ZERO events still vouches for its full range. A quiet
  period is observed absence of events, not unobserved time.
- Coverage is derived from request and cursor, never from event timestamps.
  Prove it: identical requests and cursors with different event contents must
  produce identical coverage.
- Consecutive pages chain with no gap and no double-counted boundary instant.
- A mid-stream failure bounds coverage at the last cursor.
- `ABSENT` implies empty covered ranges; empty covered ranges do NOT by
  themselves imply `ABSENT`.

Timestamps are typed `Float` upstream. Do not assume integer milliseconds.

---

# Actor Sentinel Tests

`-1` is a verified no-actor sentinel on both `sourceID` and `targetID`.

Required named regressions:

- `sourceID: -1` produces no source actor, and no `ActorRef` anywhere holds -1.
- `targetID: -1` produces no target actor.
- Absence, the sentinel, and an uninterpretable value are distinguishable.
- An unobserved negative is NOT given the sentinel's meaning.

---

# Attached Resource Direction Tests

Required named regression: a TARGET-side resource attachment
(`resourceActor: 2`) must not be attributed to the source.

Also test:

- a source-side attachment binds to the source
- attached and standalone `resourcechange` observations stay distinct
- no snapshot is manufactured from `armor` / `absorb` on events with no
  `resourceActor`
- a snapshot whose side has no concrete actor is preserved with a null actor
  rather than bound to the other side

---

# Fight Finality Tests

Retrieval completeness and fight finality answer different questions and must
not be folded together.

```text
COVERAGE  did we obtain the evidence requested for this range?
FINALITY  was the fight itself finished?
```

Test that an in-progress fight whose full requested range was retrieved reports
`COMPLETE` coverage AND `IN_PROGRESS` finality, and that neither value is
derivable from the other.

A null `inProgress` is `UNKNOWN`, never assumed finished.

---

# Ingestion Scope Tests

Test the two defined scopes:

```text
PLAYER_CONTEXT
FULL_RAID
```

`ROLE_GROUP` is not implemented and should not be tested until a real analysis
use case requires it.

Verify that downstream analysis knows which scope was retrieved.

Example:

```text
analysis requires FULL_RAID
retrieved scope = PLAYER_CONTEXT
```

Expected:

```text
UNKNOWN
reason = INSUFFICIENT_SCOPE
```

Not:

```text
all absent raid actors treated as inactive
```

---

# PLAYER_CONTEXT Includes Environment Test

Required negative test.

`PLAYER_CONTEXT` must not be implemented as "only events sourced by the
player."

Test that a `PLAYER_CONTEXT` retrieval still includes:

- required enemy/target state
- targetability events
- encounter/phase events

Expected:

Encounter actionability has the evidence it requires.

Failure mode this prevents:

A literal player-sourced-events-only reading silently removes targetability
evidence, which then combines with actionability defaults to produce false
rotational findings.

---

# Ingestion Scope Derivation Tests

Scope must be derived, not chosen.

External callers do not select ingestion scope.

There is no scope field on the analysis request, and no reconciliation of a
caller-supplied scope. The application service derives the required scope from
the union of the enabled analyzer requirements.

This makes silent under-fetching structurally impossible rather than something a
runtime check must catch.

Test:

- Scope derived from a single analyzer's declared inputs
- Scope derived from the union of several analyzers' declared inputs
- Adding an analyzer that requires `FULL_RAID` widens the derived scope
- Derivation is order-independent
- No enabled analyzers does not default to the narrowest scope
- The request contract exposes no scope field

Expected:

Derivation takes analyzer requirements as its only input, so no caller can
narrow it.

Failure mode this prevents:

Silently retrieving less data than the derived requirement and then analyzing
over absence.

Required regression:

```text
scope_derivation_prevents_silent_under_fetch
```

`INSUFFICIENT_SCOPE` describes retrieved data that could not satisfy the
internally derived requirement.

It never originates from a request parameter.

---

# Identity Tests

Before specialization evaluation, test:

- Player found
- Source ID resolved
- Class resolved
- Spec resolved
- Identity unknown
- Identity conflict

Critical regression:

A valid player must not silently become:

```text
name = null
class = null
spec = known
```

and continue into gameplay evaluation.

---

# Present-but-Wrong Identity Test

Missing identity is not the only risk.

Scenario:

WCL metadata indicates one specialization.

Observed combat behavior strongly contradicts that identity.

Expected:

```text
IDENTITY_CONFLICT
```

or another explicit blocking state.

Do not:

- Guess a different spec solely from observed casts
- Continue using the known-wrong evaluator
- Produce confident coaching

Observed abilities may corroborate identity.

They must not be the sole authority for identity.

---

# Normalization Tests

For every normalized event type, verify:

- Timestamp
- Event type
- Source actor
- Target actor
- Ability ID
- Amount where relevant
- Raw evidence/source reference

Important event types include:

```text
Cast
AuraApply
AuraRefresh
AuraRemove
ResourceAnchor
ResourceChange
Damage
Healing
Absorb
Death
Targetability
EncounterEvent
```

---

# Source/Target Direction Tests

Aura direction requires dedicated tests.

Example:

```text
Boss applies Debuff X to Player
```

Expected:

```text
source = boss
target = player
```

Not:

```text
source = player
target = boss
```

Example:

```text
Player applies Garrote to Boss
```

Expected:

```text
source = player
target = boss
```

Direction must never be inferred solely because an event appeared in a player's
event stream.

If direction matters but cannot be established:

```text
UNKNOWN
```

---

# Shared Resource Infrastructure Tests

Shared resource infrastructure should test mathematical/state behavior, not
specialization gameplay conclusions.

Test:

- Anchor
- Gain
- Spend
- Ordering
- Maximum
- Deficit
- Interval
- Completeness
- Evidence
- Resource model type

---

# Discrete Resource Tests

For:

```text
DISCRETE_EVENT_OBSERVED
```

test:

- Exact anchor
- Explicit gain
- Explicit spend
- Multiple changes between anchors
- Overflow
- Unknown region
- Incomplete events

Do not invent a missing gain because an ability normally generates resource.

---

# Resource Cap vs Waste Test

Required regression:

Scenario:

```text
Combo Points = 7 / 7
```

Player immediately uses a spender.

Expected:

```text
resourceAtCap = true
resourceWaste = false
```

unless additional resource generation actually occurred while capped.

Invariant:

```text
resourceAtCap != resourceWasted
```

---

# Continuous Resource Tests

For:

```text
CONTINUOUS_REGEN
```

test:

- Exact derivation when all inputs are known
- Bounded derivation
- Regen modifiers
- Haste/modifier uncertainty
- Anchor refresh
- Spending during regen interval
- Incomplete state
- UNKNOWN

Example:

```text
Energy interval = [62, 71]
condition = energy >= 50
```

Expected:

```text
TRUE
```

Example:

```text
Energy interval = [41, 58]
condition = energy >= 50
```

Expected:

```text
UNKNOWN
```

Do not force an exact midpoint or guessed point value.

---

# No Unsupported Resource Fabrication

Scenario:

Known resource anchor exists.

Required regeneration modifier is unknown.

Expected:

- bounded interval if safe bounds can be proven
- UNKNOWN otherwise

Not:

```text
assume normal regen rate
```

unless the normal rate itself is authoritative and all modifiers are known.

---

# Aura Tests

Test aura behavior for:

- Apply
- Refresh
- Remove
- Stack increase
- Stack decrease
- Stack decay
- Reapplication
- Fight end
- Missing remove event
- Duration uncertainty
- Source
- Target

---

# Pandemic / Extension Tests

Where a specialization/aura supports pandemic or extension behavior:

Test:

- Refresh inside extension window
- Refresh outside extension window
- Maximum extension
- Missing duration metadata
- Haste-scaled duration where applicable

Do not apply one generic refresh rule to every aura.

---

# Missing Aura Removal Test

Scenario:

Aura application exists.

Removal event is missing.

Expected:

The analyzer must not automatically assume:

```text
aura active until fight end
```

unless authoritative mechanics/evidence establish that.

Use:

- bounded state
- UNKNOWN

where appropriate.

---

# Cooldown Tests

Test:

- Base cooldown
- Availability
- Use
- Charges
- Recharge
- Multiple charges
- Cooldown reduction
- Reset
- Proc-driven reset
- Talent modification
- Incomplete state

---

# Cooldown Availability vs Correctness

Required invariant:

```text
cooldownAvailable != cooldownShouldBeUsed
```

Shared infrastructure may determine availability.

The specialization evaluator/authority determines whether use was correct.

---

# Cooldown Reset Regression

Scenario:

An ability normally has a cooldown.

A proc resets it.

Expected:

Cooldown state reflects the reset when supported by evidence.

Do not report:

```text
ability unavailable
```

after an observed valid reset.

Do not fabricate a reset when the evidence is absent.

---

# SimulationCraft Parsing Tests

APL parsing tests should verify supported syntax normalization.

Possible expressions include:

- if conditions
- variables
- resources
- buffs
- debuffs
- cooldowns
- talents
- charges
- action lists
- sequences
- targets
- enemy counts

Support should be explicit.

Do not assume the full SimC language is already supported.

---

# APL Expression Support Registry Tests

The support registry must know whether an expression is:

```text
SUPPORTED
UNSUPPORTED
```

Unsupported must not become false.

Required regression:

```text
unsupported_condition
```

Expected:

```text
UNSUPPORTED
```

Not:

```text
false
```

If the unsupported condition materially affects action selection:

```text
decision = UNKNOWN
```

---

# APL Priority Short-Circuit Tests

Required negative regression.

A SimulationCraft APL is an ordered priority list, so uncertainty on a
higher-priority line contaminates every lower-priority selection.

Scenario:

```text
Line 1: envenom,if=energy>=50&combo_points>=5
Energy interval = [41, 58]
Line 1 condition = UNKNOWN

Line 2: mutilate

Player actually cast Envenom.
```

Expected:

```text
decision  = UNKNOWN
blockedBy = line 1 energy condition
```

Not:

```text
expected = Mutilate
actual   = Envenom
status   = INCORRECT
```

Required regression name:

```text
unknown_condition_does_not_fall_through_to_lower_priority_action
```

Also test the same behavior for an `UNSUPPORTED` higher-priority condition.

Also test the permitted exception:

If the evaluator can prove the same action would be selected under every
possible resolution of the unknown condition, that action may be selected.

```text
Line 1: ability_a,if=<UNKNOWN condition>
Line 2: ability_a
```

Expected:

```text
decision = ability_a
```

Verify the blocking line/condition is preserved as evidence in the UNKNOWN
case, so the trace can answer why no decision was produced.

Failure mode this prevents:

Interval-based resource reconstruction correctly abstains at the resource
layer, and the priority-list evaluator then manufactures a confident false
finding one layer above it.

---

# APL `run_action_list` Control-Flow Tests (M11-B1)

`run_action_list` is not `call_action_list`, and the tests must keep the two
apart. Pinned at the project's SimulationCraft commit: a ready run entry is
RETURNED by the selection loop (it is not `ACTION_CALL`; `player.cpp`
`select_action`), executes at zero time by activating its child
(`action.cpp` `run_action_list_t::execute`), the next selection runs over the
child and the parent is restored only afterwards (`player.cpp`
`execute_action`). A call that returns nothing falls through to the caller's
next entry; a run never resumes the parent's later entries.

Required regressions (`tests/unit/m11b1-run-action-list.test.ts`, with the
corpus family under `synthetic.apl-run-action-list`):

```text
run gate FALSE      -> child not entered; parent continues at its next ordinal
run gate TRUE       -> child entered; the child's answer is the answer; the
                       parent's later entries are NOT visited, even a proven one
run + child NOTHING -> NO_ACTION. NOT the parent's next entry
run + child BLOCKED -> the child's blocker propagates
run gate undecided  -> BLOCKED, UNDECIDED_RUN_GATE; no world is explored
                       (M11-D3-A: both are; a converged result stands, else
                       the same stop at the gate, never a child obstacle —
                       tests/unit/m11d3a-undecided-run-action-list.test.ts)
call -> run         -> a run reached inside a callee ends the WHOLE selection;
                       the caller does not continue either
undecided call over a transferring callee -> BLOCKED, UNDECIDED_CALL_GATE_OVER_RUN
target_if (M11-D3-B1, tests/unit/m11d3b1-target-if.test.ts):
  MIN/MAX + PROVEN-finite score + player-only if= -> the ordinary line's answer
  MIN/MAX + score NOT proven finite             -> refused, UNKNOWN (spec atoms,
                                                  unaudited atoms, % and %%)
  any mode + player-only FALSE conjunct        -> eliminated
  target-dependent or unparseable if=, FIRST   -> UNKNOWN, never FALSE/REJECTED
  (even with a finite score), malformed option
  run + refused target_if, worlds disagree     -> stop AT the run line
  ignorable target_if                          -> never the attributed class
retarget pseudo-actions (M11-D3-B2, tests/unit/m11d3b2-retarget.test.ts):
  retarget_auto_attack (if/target_if/line_cd only, no prev. atom)
                                               -> POSSIBLE at most; its world
                                                  converges; never the obstacle
  retarget, even with B1-ignorable readiness   -> selected by the scan, refused
                                                  by the first-GCD query
  FIRST, malformed, target-dependent if=        -> UNKNOWN, never REJECTED
  proven FALSE                                 -> eliminated
extremum operators (M11-D3-C1, tests/unit/m11d3c1-extremum.test.ts):
  <? is MAX and >? is MIN (pinned tokenizer)   -> exact results pinned both ways
  precedence 5, left-associative               -> AST shapes pinned
  finite set / lower bound operands            -> only what holds in every world
  unknown operand                              -> UNKNOWN, never dominated
  scope / finiteness                           -> join of operands / both proven
variable execution (M11-D3-C2, tests/unit/m11d3c2-variable-execution.test.ts):
  set / setif / reset                          -> the walk's value; continue
  read before assignment                       -> UNKNOWN (an earlier scan's value)
  precedence: scan write > spec initial > UNKNOWN -> the later write wins (A-C, H)
  declared / built-in name, any shape or seed  -> still written, never suppressed
  pre-branch write, branch-local overwrite     -> sibling reads pre-branch (D, G)
  certain / undecided call over an initial     -> caller reads write / join (E, F)
  truth-shaped read of an undecided write      -> enumerated, as when unbound
  other ops, cycling, delay=                   -> variable UNKNOWN, never a refusal
  run TRUE world / undecided call / if=        -> isolated / joined / joined
  undecided, unknown, divergent, unmodelled    -> UNKNOWN, never REJECTED
line_cd (M11-D3-C3, tests/unit/m11d3c3-line-cd.test.ts):
  attributed cast t=0, decision t=15, line_cd=10 -> UNKNOWN: a hidden selection at
                                                  t=12 that cast nothing is the
                                                  same cast log (review A)
  cast inside the window, no selection lower bound -> UNKNOWN, never NOT_READY (B)
  synthetic selection with S_lo > D - N        -> NOT_READY (C)
  synthetic PROVEN selection coverage, none in window -> READY (D)
  proven selection at t=0: t=5 / t=10 / t=11   -> not ready / READY / ready
  same token from another entry                -> ambiguous, never a line's selection (F)
  two lines, one token                         -> independent timers
  late / early-ending / no-pull / cast-only coverage -> UNKNOWN, never ready by absence
  variable line                                -> executes as if absent, timer unread (H)
  retarget_auto_attack / retarget              -> B2 unchanged: converges / refused (I, J)
  fired earlier in this decision               -> NOT_READY in that world's rescans only (E)
  no history supplied                          -> UNKNOWN, whatever the spell's cooldown
observed combat facts (M11-E1, tests/unit/m11e1-combat-facts.test.ts,
m11e1-owned-pet-scope.test.ts, contracts/m11e1-combat-facts-layering.test.ts):
  COMPLETE, no matching events                 -> EXACT 0; raw sum EXACT
  PARTIAL                                      -> counts AT_LEAST; raw sums UNKNOWN
  PARTIAL, nothing observed                    -> UNKNOWN, never (at least) 0
  PARTIAL / COMPLETE target set, hitType map   -> OBSERVED_ONLY / EXHAUSTIVE, never AT_LEAST (E1.1 A-D)
  BEGIN + COMPLETE of one ability              -> one event per phase, never "2 casts" (E1.1 E)
  cast-event sequence, COMPLETE / PARTIAL      -> both phases kept; EXHAUSTIVE / OBSERVED_ONLY, not a prefix (F, G)
  COMPLETE cast events, PARTIAL damage         -> exact cast-event counts, non-exact damage
  decode-degraded category                     -> nothing exact that needs it
  absorbed / overkill / unmitigatedAmount      -> never added to or substituted for amount
  absent overkill / absent tick                -> null / NOT_SUPPLIED (never 0 / false)
  hitType 2                                    -> raw 2, no crit anywhere
  NPC / WCL_BOSS_SUBTYPE / actor -1            -> not hostile / not targetable / not a boss
  owner rollup                                 -> keeps source + member breakdown
  pet with no stated owner (even summoned)     -> disclosed, never rolled up
  owned pet outside the vouch                  -> rollup PARTIAL, DIRECT_PLAYER exact
  two observations 30 s apart                  -> nothing about the time between
  equal timestamps                             -> RETRIEVAL_ORDER_NOT_PROVEN_AUTHORITATIVE
  permuted input                               -> byte-identical results
  any import from outside src/combat-facts     -> refused (current-milestone guard; a reviewed
                                                  M11-F/G consumer amends it explicitly)
positive deaths (M11-F, tests/unit/m11f-death-state.test.ts):
  killed boss with no death event              -> NO_POSITIVE_DEATH_EVIDENCE, never alive (A)
  death of X#3                                 -> DEAD_SINCE for X#3; X#4 and X#null unaffected (B)
  dead actor sourcing delayed damage           -> still DEAD_SINCE (C)
  later hit with the same key's hp>0 snapshot  -> EVIDENCE_CONTRADICTION; auras/0 hp/other instance do not (D)
  decisive event in the death's millisecond    -> ORDERING_AMBIGUOUS in either retrieval order (E)
  decoded resurrection / production resurrect  -> RESURRECTION_OBSERVED / UNREVIEWED_EVENT_AFTER_DEATH (F)
  complete death retrieval, no death event     -> still NO_POSITIVE_DEATH_EVIDENCE (G)
  events after the query time                  -> never read
active_dot (M11-F, tests/unit/m11f-active-dot.test.ts):
  caster's proven carriers                     -> AT_LEAST lower bound; upper bound never claimed
  another source's DoT / no aura coverage      -> not counted / UNKNOWN, never inactive
  positive death after the anchor              -> PROVEN_INACTIVE; same-ms or unresolved -> UNKNOWN
  resurrection                                 -> does not recreate the DoT
  Assassination crimson_tempest                -> still refused (spell_targets), no public change
evidence roots (M11-F, tests/contracts/m11f-evidence-root-citations.test.ts):
  archive citation                             -> resolves by archive id, fixture, recomputed SHA-256, raw type
  wrong root / missing fixture / bad digest / edited bytes / absent raw type -> refused
canonical BDK fixture (M11-E2.1, tests/unit/m11e2-blood-dk-fixture.test.ts):
  seven segments composed                      -> one range [7,436,292 .. 7,781,469], no hole (A)
  owned set                                    -> derived from catalog petOwner, never typed (B, C)
  owned pet with no event (224)                -> EXACT 0 member, not UNKNOWN, not dropped (D)
  E2 replay facts                              -> reproduced exactly from committed bytes
  pet instances / owner rollup / direct player -> kept per instance; rollup != direct (E-H)
  raw fields, missing keys, raw hitType        -> verbatim; null / NOT_SUPPLIED; no labels (I-K)
  BEGIN vs COMPLETE, target collections        -> separate; ActorKeys only (L, M)
  boss subtype / -1 / friendly Paladin         -> 161 only / sentinel / not an enemy (N, O)
  activity                                     -> first/last observation only, no interval (P)
  raw deaths                                   -> verbatim positive DEATH facts, no DEATHS coverage (Q)
  compact re-slice                             -> byte-identical; default serialization unchanged (R)
  declaration vs catalog / grant / bytes       -> ACTOR_SLICE_INVALID (S)
  excluded heal / absorbed                     -> never COMPLETE; a HEALING grant is refused (T)
  caller-supplied window (DRW aura, read raw)  -> casts, raw sums, targets; substrate defines none
observed cohort (M11-G1, tests/unit/m11g1-cohort.test.ts, m11g1-cohort-boundary.test.ts):
  subject ACTUAL_DPS                           -> WCL table total / fight seconds; never the raw-amount sum (A)
  table total / fight seconds vs ranked dps    -> equal for 19/19 players, death included (A)
  no subject rankings row                      -> still OBSERVED (NOT_RANKED) (B)
  ranked disagreement / other denominator      -> UNAVAILABLE, never a guess (B)
  non-kill / unresolved spec subject           -> NOT_ELIGIBLE; only the subject request made (C, D)
  committed pool                               -> rung ±3 ilvl / ±5%, no widening, three OK; 300 rows tallied (E, G, I)
  widening                                     -> ±5% -> ±10% -> ±15%, then ilvl ±6, ±9; every step recorded (F, G)
  selection                                    -> three highest DPS, never nearest duration (H)
  two / fewer qualify                          -> RANGE_ONLY without median / INSUFFICIENT (J, K)
  hidden, anonymous, subject's own row         -> excluded (L)
  no / several identity matches                -> SOURCE_UNRESOLVED / SOURCE_AMBIGUOUS, never the first (M)
  other spec / death before end / non-kill     -> SPEC_MISMATCH / DIED_BEFORE_END / NOT_KILL (N, O)
  malformed row, context or bracket page       -> PAYLOAD_UNRECOGNISED / MALFORMED_EVIDENCE / BRACKET_SEMANTICS_MISMATCH (P)
  permuted or tied rows                        -> identical cohort; ties by code, fight, name (Q)
  queries / imports                            -> no events field, paginator or ingestion (R)
  unbounded pool, no candidate qualifies       -> exactly 14 requests, then REQUEST_BUDGET_EXHAUSTED (S)
  committed G1 evidence                        -> pseudonyms only, null servers, no credential shape (T)
  any import of the cohort domain              -> refused, side-effect and dynamic imports included (U, V)
  member gear                                  -> shared adapter states (24/30, 3/51, 12/42); bad row -> MALFORMED_EVIDENCE
comparison facts (M11-G2, tests/unit/m11g2-*.test.ts, contracts/m11g2-comparison-facts-layering.test.ts):
  actor set                                    -> focus + petOwner only; no pet's pet, ownerless or other's pet (A, B, S)
  G1 member <-> G2 fixture                     -> same code, fight, actor and pseudonym for all three (C)
  instances                                    -> every ActorKey kept; 33/30/33/30 Rune Weapons (D)
  subject / comparisons                        -> EXACT (vouched) / AT_LEAST (uncertified), never at least 0 (E, T)
  filtered capture with a grant                -> FILTERED_CAPTURE_GRANTED; every category ABSENT (F)
  begincast + cast / equal ms                  -> counted apart / retrieval order not proven (G, H)
  raw amount                                   -> RAW_AMOUNT_FIELD_SUM, M1; never WCL damage; UNKNOWN when uncertified (I, K)
  WCL table amounts                            -> explicit authority and interval (J)
  hitType                                      -> raw numbers only (L)
  boss / enemy-listed / player target          -> metadata; hostility UNKNOWN; player never enemy (M, N, O)
  DRW windows                                  -> aura transitions; unobserved end UNKNOWN, no nominal length (P, Q)
  Rune Weapon / window                         -> temporal association, ambiguity kept, not 1 cast = 1 instance (R)
  Blood Beast                                  -> summons, casts, hits, boss vs other, targets, raw + WCL (U)
  deaths                                       -> positive facts only; nothing says alive (V)
  post-hoc modules                             -> unreachable from SimC / specs / services (W)
  sanitizer / committed files                  -> byte-identical re-cut; pseudonyms only (X, Y)
  capture plan                                 -> <= 36, no rankings, never the subject, always filtered (Z, AA, AB, AC)
timing alignment (M14-A, tests/unit/m14a-timing-alignment.test.ts, same G2 layering guard):
  pull / recorded end                          -> EXACT 0 everywhere / EXACT only when COMPLETED
  landmark one fight did not observe           -> UNKNOWN NOT_OBSERVED_IN_FIGHT, never shifted from another fight
  observed under an uncertified basis          -> NO_LATER_THAN, never EXACT (real comparisons and synthetic)
  phases behind an unverified capability       -> UNKNOWN with the gate reason; no phase row; phaseEvidence per fight
  unordered phases / unstated intermission     -> UNKNOWN, never sorted / that ordinal and later UNKNOWN
  window start not observed                    -> that ordinal and later UNKNOWN; no nominal duration
  player target                                -> never a target-transition landmark
  other encounter / difficulty / duplicate ref -> REFUSED
  moment facts                                 -> EXACT anchors only; bound -> ANCHOR_NOT_EXACT; outside fight -> UNKNOWN, never clipped
multi-log consensus (M14-B, tests/unit/m14b-consensus.test.ts, same G2 layering guard):
  one comparison fight                         -> INSUFFICIENT BELOW_MINIMUM_SAMPLE; minimum sample < 2 -> REFUSED
  subject anchor                               -> never a vote; never fills a missing comparison vote
  NO_LATER_THAN / UNKNOWN anchor               -> abstains; counts against the share, never as agreeing
  decisive anchors rule out any group          -> SPLIT DISAGREEMENT_PROVEN (real recorded ends at 5 s)
  two equal qualifying groups                  -> SPLIT NO_UNIQUE_AGREEING_GROUP, never a picked winner
  SPLIT / INSUFFICIENT                         -> no range, no agreeing fights
  thresholds                                   -> named CANDIDATE set; malformed set REFUSED; another set changes the outcome
  every evaluation                             -> CONTEXT_ONLY, findingEffect suppression NONE, confidence NONE
  vote order                                   -> same outcome
strategy context (M14-C, tests/unit/m14c-strategy-context.test.ts, same G2 layering guard):
  encounter-state CONSENSUS + subject EXACT    -> INTERMISSION over the subject's own interval / PHASE_TRANSITION at its instant
  subject phase evidence not held / flag null  -> NONE SUBJECT_ANCHOR_NOT_EXACT; comparisons never supply the subject fact
  subject outside agreeing range +- tolerance  -> NONE SUBJECT_OUTSIDE_CONSENSUS_RANGE; no direction field
  SPLIT / INSUFFICIENT                         -> item kept, NONE NO_COMPARISON_CONSENSUS
  target transition / cooldown window          -> NONE FOCUS_BEHAVIOR_NAMES_NO_REASON, even under CONSENSUS
  TARGET_UNAVAILABLE / FORCED_DOWNTIME         -> never named (no evidence source)
  real fights                                  -> 22 focus-behavior items, no reason; phase evidence UNKNOWN per fight
  attachment                                   -> reasons in effect at the moment; CONTEXT_ONLY, no suppression, no confidence
damage-delta decomposition (M14-D, tests/unit/m14d-damage-delta.test.ts, same G2 layering guard):
  EXACT - EXACT / EXACT - AT_LEAST             -> EXACT / NO_MORE_THAN, never EXACT against an uncertified capture
  bound with the wrong sign                    -> direction UNDECIDED (real boss-subtype rate vs COHORT261)
  component absent: COMPLETE / uncertified     -> EXACT 0 / UNKNOWN NO_INFORMATIVE_LOWER_BOUND, never zero
  raw amount delta, even both EXACT            -> UNKNOWN RAW_AMOUNT_MEANING_NOT_PROVEN (M1)
  table vs table                               -> EXACT (real raid entry 45,802,009 vs 59,295,730 / 58,873,321 / 62,896,995)
  subject has no per-actor table               -> every per-ability table delta UNKNOWN
  pet not listed / no raid entry / log version -> NOT_LISTED_IN_TABLE / NO_RAID_ENTRY / LOG_VERSION_DIFFERS, never zero
  focus-only table amount                      -> UNKNOWN TABLE_STATES_NO_FOCUS_ONLY_AMOUNT (never total minus pets)
  pet kinds / target classes                   -> by game id across reports / one class with or without an enemy list
  aligned window on a bound / outside fight    -> UNKNOWN ANCHOR_NOT_EXACT / WINDOW_OUTSIDE_RECORDED_FIGHT, never clipped
  equal rates, different durations             -> EQUAL in integer arithmetic
  sentences                                    -> only for a proven direction; no causal or prescriptive word
  every decomposition                          -> OBSERVATION_ONLY, causalClaim NONE, NOT_COMBINED, residual NOT_COMPUTED, no finding effect
causal evidence linkage (M14-E, tests/unit/m14e-causal-linkage.test.ts, same G2 layering guard):
  UNDECIDED / EQUAL delta                      -> OBSERVATION_ONLY, never LINKED (real: 45 Heart Strike REJECTED link nothing)
  only UNKNOWN / NO_AUTHORITY_AVAILABLE        -> DECISION_EVIDENCE_UNRESOLVED, kept distinct (real: Death's Caress)
  ability record vs TOTAL                      -> NO_DECISION_EVIDENCE_IN_SCOPE; only WHOLE_OUTPUT reaches a total
  pet-scoped / other-class / other-window      -> no link; half-open window, instant at the end outside
  record from a comparison fight               -> REFUSED EVIDENCE_NOT_FROM_SUBJECT_FIGHT
  observed fact claiming NO_AUTHORITY          -> REFUSED; facts-only link carries NO_AUTHORITY_BACKED_EVIDENCE
  comparisons supplied                         -> change only a direction; subject evidence per component identical
  real fights                                  -> 13 LINKED pairs, all bounds; Death Strike link rests on MATCHes (link is not a fault)
  every linkage                                -> LINKAGE_ONLY, causalClaim NONE, magnitude NONE, verdictFlow NONE, no confidence field
diagnosis projection (M14-F, tests/unit/m14f-diagnosis-projection.test.ts, contracts/m14f-diagnosis-{contract,layering}.test.ts):
  no comparison evidence (deployed service)    -> ANALYZED carries NOT_ASSESSED COMPARISON_EVIDENCE_NOT_RETRIEVED, never an empty diagnosis
  evidence source throws / returns null        -> COMPARISON_RETRIEVAL_FAILED / NOT_RETRIEVED; the analysis itself unchanged
  other player / fight / revision / spec       -> COMPARISON_EVIDENCE_NOT_FOR_THIS_FIGHT; the post-hoc fightRef label is not identity
  other encounter / unreviewed outcome word    -> COMPARISON_NOT_COMPARABLE / DECISION_EVIDENCE_NOT_USABLE
  link on MATCH decisions only                 -> NO_AUTHORITY_FINDING_IN_LINK (real: the 12 whole-fight M14-E links)
  REJECTED casts, subject figure LOWER         -> FINDINGS_DO_NOT_MATCH_DIRECTION, never a statement
  REJECTED casts, proven HIGHER, linked        -> one statement: findings by locator, every limit, magnitudeAttribution NONE
  UNKNOWN decisions / undecided bound          -> DECISION_EVIDENCE_UNRESOLVED / DIRECTION_UNDECIDED (real: 45 Heart Strike REJECTED)
  with or without diagnosis                    -> identical decisions and coverage; real: 0 statements, 307 records (224 UNKNOWN)
  public vocabularies                          -> declared independently, pinned to the projection's; no confidence/score/suppression field
  layering                                     -> only service, result type and projection import it; no analyzer or role module does
finding prioritization (M15-A, tests/unit/m15a-finding-prioritization.test.ts, contracts/m15a-reporting-layering.test.ts):
  UNKNOWN / NO_AUTHORITY / SUPPRESSED / UNSUPPORTED -> carried with reason; never ranked, never failures
  UNKNOWN naming no authority / NAA naming one -> refused AUTHORITY_DISPOSITION_MISMATCH; the two never interchange
  divergence on INCOMPLETE state / no locator  -> refused, never ranked
  SUPPRESSED without a named reason (or "similar top logs") -> refused; a reason on a non-suppressed record refused
  MATCH / observed fact (incl. zero potions)   -> informational, never a failure
  divergences                                  -> by actionability standing first; a pattern never outranks stronger standing
  aggregation                                  -> only identical standing pools; UNKNOWN never pools with a divergence; per-category threshold
  invalid config (threshold < 2, non-integer, unknown category/revision) -> whole call refused, never applied
  input order permuted                         -> identical output; every input placed exactly once
  view adapter                                 -> OBSERVED_EXECUTION is OBSERVED_EXECUTION_ONLY, never actionable; unreviewed word refuses
  real Blood fight                             -> 0 refused, 0 actionable, 224 UNKNOWN carried, leading item the 45-occurrence pattern
  every result                                 -> magnitude NOT_USED; no confidence/severity/score/impact field
  layering                                     -> reads restated inputs only; no comparison-facts, WCL or evaluator import; importers: service + result type (M15-B, M15-D)
fight TLDR (M15-B, tests/unit/m15b-fight-tldr.test.ts, contracts/m15b-tldr-contract.test.ts):
  every status                                 -> assessmentScope PARTIAL, coverage sentence first, >= 1 disclosure; schema forbids COMPLETE / empty
  nothing resolved vs none diverged            -> NO_DECISION_RESOLVED vs NO_AUTHORITY_DIVERGENCE_IN_ANALYZED_DECISIONS; both still PARTIAL
  unsupported specialization                   -> GAMEPLAY_NOT_ANALYZED, no highlights, "not evidence of clean play", consumables still summarized
  UNKNOWN decisions                            -> counted and tallied, never highlighted
  UNKNOWN consumable                           -> { countState: UNKNOWN } with no count; "UNKNOWN (not zero)"; schema forbids a count
  SUPPRESSED record                            -> tallied as not assessed, never highlighted or counted as a divergence
  refused record / unreviewed word / bad config -> NOT_ASSESSED with its reason, never a partial summary
  coverage disagreeing with the view's decisions -> NOT_ASSESSED COVERAGE_INCONSISTENT; a divergence without analyzed gameplay too
  highlights                                   -> the prioritized order, standing carried, rest counted + DIVERGENCES_NOT_LISTED; input order irrelevant
  sentences                                    -> no correctness, blame or score word
  real Blood fight                             -> counts equal the view's coverage; 45-occurrence heart_strike pattern first; 0 actionable; 224 UNKNOWN
  public projection                            -> schema-valid, equals the internal TLDR, highlights locate published decisions; nothing else changes
fight report (M15-D, tests/unit/m15d-fight-report.test.ts, contracts/m15d-report-contract.test.ts):
  every status                                 -> PARTIAL, >= 1 disclosure, markdown opens with "Partial analysis" and Coverage before findings
  grouping                                     -> one section per category with a finding, category order; prioritized / informational / carried never mixed
  every record                                 -> listed exactly once (occurrence sum = records by disposition); prioritized head = TLDR highlights
  UNKNOWN / NO_AUTHORITY_AVAILABLE             -> CARRIED with reason code, position null, never a divergence; schema forbids either as PRIORITIZED
  SUPPRESSED                                   -> CARRIED + listed under suppressions with its named reason; schema forbids an unnamed reason
  UNKNOWN consumable                           -> CARRIED, never a zero; observed counts are informational facts
  unsupported specialization                   -> PREPARATION only, "this is not evidence of clean play"
  each entry                                   -> producer, authority, state evidence, actionability (+ standing), evidence locators, in JSON and markdown
  markdown                                     -> pure function of the published fields; code spans cannot be broken; no correctness, blame or score word
  refused record / unreviewed word / bad config / inconsistent coverage -> NOT_ASSESSED with its reason, never part of a report
  real Blood fight                             -> counts equal the view's coverage; heart_strike pattern first; 0 actionable; 224 UNKNOWN carried
  public projection                            -> schema-valid, equals the internal report, entries locate published decisions; nothing else changes
cast and channel decision anchor (ONB-S4, tests/unit/onb-s4-cast-decision-anchor.test.ts):
  instant                                      -> INSTANT_COMPLETION at the cast; no span
  hard cast                                    -> OBSERVED_BEGINCAST; CASTING over [begin, completion); no fake idle inside
  re-begin / begin with no completion          -> latest begin pairs; earlier begin INTERRUPTED (UNKNOWN when a page may hide it)
  missing begincast, complete coverage         -> BEGINCAST_NOT_OBSERVED, never inferred instant
  missing begincast, incomplete coverage       -> DERIVED_FROM_COMPLETION only with an exact cast time; haste unknown / proc -> CAST_TIME_UNKNOWN
  derived start vs observed evidence           -> before previous completion / start or completion inside / overlap -> CONFLICT; covered -> NOT_OBSERVED
  begin only some placements pair              -> PAIRING_NOT_PROVEN; occupancy after the completion UNKNOWN to the next start, both orders
  same-ms begin and completion                 -> order-invariant (both orders equal); POSITIVE resolves, UNKNOWN cast time -> AMBIGUOUS
  proven instant with same-ms begin            -> INSTANT_COMPLETION, begin consumed; earlier begin abandoned
  two begins / two completions in one ms       -> BEGINCAST_PAIRING_AMBIGUOUS
  other begin or channel start mid-cast        -> CAST_EVIDENCE_CONFLICT; off-GCD instant mid-cast does not break pairing
  channel                                      -> CHANNEL_START; occupancy inside UNKNOWN (never CASTING, never NOT_CASTING) to bound / next start
  begin on a reviewed instant or channel       -> CAST_EVIDENCE_CONFLICT
  unreviewed ability / non-monotonic fight     -> EXECUTION_NOT_REVIEWED, window before it UNKNOWN / NON_MONOTONIC_TIME
  NOT_CASTING                                  -> only with COMPLETE cast coverage from the pull; missing page / UNVERIFIED -> UNKNOWN
  real Mage 121 / Restoration Shaman 122       -> Arcane Missiles cast-only; pinned pair / ambiguity / interrupted counts
pooling and wait semantics (ONB-S5, tests/unit/onb-s5-pooling-wait.test.ts):
  tokens                                       -> pool_resource, wait, wait_until_ready, wait_for_cooldown; no `wait_for`
  extra_amount / line_cd / bad bool / empty sec -> UNMODELLED_WAIT_ACTION, never a guess
  guarded line ready now                       -> GUARDED_READY; the guarded line is selected; resolver never asked
  guarded not ready, ready at max              -> POOLS: pool SELECTED, nothing below reached
  guarded not ready, not ready at max          -> NOT_RESOURCE_LIMITED; the scan continues
  guarded not ready, no resolver               -> pool MAY_SELECT; a definite lower line is NOT the answer
  cooldown / line_cd blocks the guarded line   -> NOT_RESOURCE_LIMITED without the resolver; INSUFFICIENT_RESOURCE asks it
  guarded undecided / energy ONE_OF {41,58} vs 50 -> UNDECIDED; pool ahead of the guarded candidate
  guarded line background / nothing follows    -> PRUNED_WITH_GUARDED_LINE
  guarded variable, call or wait               -> UNMODELLED_WAIT_ACTION
  wait lines with a true condition             -> MAY_SELECT only (movement and history unknown)
  first-GCD query                              -> APL_WAIT_SELECTED, never a GCD selection; coverage UNKNOWN
  observed cast vs a pool                      -> UNKNOWN AUTHORITY_SELECTION_UNRESOLVED; never MATCH, never REJECTED
  single-list walker                           -> a waiting line is never its definite winner
shared pet mapping (ONB-S6, tests/unit/onb-s6-pet-state.test.ts):
  malformed profile                            -> PetProfileError; a shared gameID is NOT a defect
  ownership                                    -> WCL petOwner only; another player's pet never maps
  unstated-owner candidate / gameID-less pet   -> OWNERSHIP_NOT_STATED for absence and count ceilings
  two entities, one gameID                     -> both AMBIGUOUS; every answer UNKNOWN
  single summon < t < summon + min lifetime    -> PRESENT, summon cited; summon AT t / min edge decides nothing
  no min lifetime / death since summon         -> never PRESENT; a death never proves absence
  casts / damage the pet sources               -> never a presence proof on their own
  later events appended (O2)                   -> every answer at t unchanged; no future bracketing
  no summon in [t - D, t]                      -> NOT_PRESENT only with SUMMONS COMPLETE over [t - D, t]
  past cast outside every pinned life          -> LIFETIME_BOUND_CONTRADICTED, absence never claimed
  missing SUMMONS page / UNVERIFIED / scope    -> UNKNOWN; no key NOT_PRESENT; count has no ceiling
  pre-pull reach / no lifetime / unpinned start -> PRE_PULL_INSTANCE_POSSIBLE / LIFETIME_BOUND_NOT_PINNED / INSTANCE_START_NOT_PINNED
  two summons in window / cast before summon / mixed null -> never PRESENT; count without ceiling
  non-monotonic canonical order                -> NON_MONOTONIC_TIME on every surface, PRESENT included
  atoms                                        -> UNKNOWN presence unbound (enumerated); counts KNOWN / ONE_OF / BOUNDED
  real Blood 15 (fight 48)                     -> Ghoul 47 settled; Blood Beast blocked by unstated owner 142; Rune Weapon AMBIGUOUS
healer registration and finding shape (HEAL-A, tests/unit/specs/restoration-shaman-registration.test.ts, tests/unit/healer-finding.test.ts):
  registration                                 -> PUBLIC since HEAL-AP; public lookup and identity table resolve it
  declared families                            -> COOLDOWN_ASSIGNMENT, HEALING_COOLDOWN, HEALING_DECISION; all NO_PINNED_AUTHORITY_FOR_DOMAIN
  forged binding on a healer family            -> PROVIDER_DOMAIN_INCOMPATIBLE; resolution still NO_PINNED_AUTHORITY_FOR_DOMAIN
  requirement                                  -> DERIVED FULL_RAID from RESTORATION_SHAMAN_REQUIRED_INPUTS
  public request for a Restoration Shaman      -> dispatched once at FULL_RAID (HEAL-AP); unstated subject NOT_ASSESSED
  request plan                                 -> handed to the selected analyzer untouched; null without one
  real 122, no plan                            -> AUTHORITY_NOT_AVAILABLE; ASSIGNMENT NO_AUTHORITY_AVAILABLE, no assignment finding; 4 COOLDOWN facts
  real 122, plan for this fight                -> MET (cast evidence, positive actionability), UNKNOWN READINESS, outcome after kill, UNKNOWN ABILITY_NOT_REGISTERED
  another fight's plan / unprovable binding    -> NO_AUTHORITY_AVAILABLE / UNKNOWN; never interchanged; no finding
  subject with no stated name                  -> every unresolved entry may be its own (UNKNOWN), never another player's
  other spec / pet / unusable data             -> INSUFFICIENT_EVIDENCE; NOT_ASSESSED, never an empty finding set
  negative controls                            -> no HPS, rank, score, "should" or cooldown-quality field
  finding set invariants                       -> three categories in order; ASSIGNMENT finding only under a plan it cites; COOLDOWN only when OBSERVED
healer public shape and healer promotion gate (HEAL-AP, tests/integration/heal-ap-restoration-shaman-public.test.ts, tests/contracts/heal-ap-healer-promotion-gate.test.ts):
  REST and MCP, real 122 with a bound plan     -> identical documents; one dispatch each at FULL_RAID; AUTHORITY_NOT_AVAILABLE
  healerFindings                               -> the registration's view, field for field; MET then the encounter-ended outcome
  plan disclosure, bound plan judged           -> EVALUATED_IN_HEALER_FINDINGS; TLDR/report HEALER_FINDINGS_ + RAID_COOLDOWN_PLAN_NOT_SUMMARIZED, never _NOT_EVALUATED
  refusing or contradicting healer view        -> INTERNAL_ERROR, never a quieter document
  schema                                       -> MET only with PROVEN actionability; encounter-ended only NOT_EVALUATED; no miss/early/late; no result without a plan; quality flags false
  gate coverage                                -> every PUBLIC row with a healer view has a pinned real subject
  gate OBSERVATIONS                            -> COOLDOWN OBSERVED COMPLETE; every use the subject's own completed cast
  gate ASSIGNMENT + DISCRIMINATION             -> a real MET proven by a listed use in the window; a not-met identified entry on the same evidence
  gate MISSING PLAN                            -> NO_AUTHORITY_AVAILABLE (none / other fight), UNKNOWN (unprovable binding); no assignment result
  gate IDENTITY                                -> other spec IDENTITY_REFUSED (+ SUBJECT_NOT_ASSESSED); unstated SUBJECT_SPECIALIZATION_NOT_STATED
  gate COMPLETENESS                            -> CASTS withdrawn: listing and cast-less entry UNKNOWN CAPABILITY_UNVERIFIED; PLAYER_CONTEXT: ROSTER_NOT_IN_SCOPE
  gate NEGATIVE CONTROLS                       -> no hps/amount/total/rank/score/confidence/quality/state/status key; no verdict word
three internal healers (HEAL-B1, tests/unit/specs/heal-b1-healer-evaluators.test.ts, heal-b1-healer-registrations.test.ts, tests/unit/data/healing-cooldown-identity-artifact.test.ts):
  each of Holy Paladin, Resto Druid, Mistweaver -> wrong spec/class, unlisted actor, other-class actor, pet, other fight: IDENTITY_REFUSED
  no plan / any cast                           -> ASSIGNMENT NO_AUTHORITY_AVAILABLE; HEALING_DECISION NO_AUTHORITY_AVAILABLE; no failure word
  begincast, aura, other player, pet, unidentified or another healer's cooldown -> never a use; stated pet counted as a source
  CASTS gap                                    -> listing UNKNOWN INSUFFICIENT_COVERAGE, known uses kept
  plan                                         -> MET; no cast in a covered window UNKNOWN READINESS; NOT_ACTIONABLE after kill; ABILITY_NOT_REGISTERED; Spirit Link Totem not this spec's
  PLAYER_CONTEXT / FULL_RAID                   -> ROSTER_NOT_IN_SCOPE / overlap counts the player and its pet only
  registration                                 -> INTERNAL_ONLY; public lookup null; identity table refuses; public request SPEC_NOT_SUPPORTED, no dispatch
  real M13-A Holy Paladin 5                    -> Avenging Wrath 184,987 and Aura Mastery 272,367 (raw-checked); listing UNKNOWN; ROSTER_NOT_IN_SCOPE
  real fight 48 Holy Paladin 1, Mistweaver 9   -> no use, listing UNKNOWN, never "none used"; Mistweaver sources 9 + four stated pets
  artifact reader                              -> four artifacts load; cast id = row override (Avenging Crusader 216331, not 394088); node type, class/spec, siblings checked
  shared modules                               -> Restoration Shaman tests, the HEAL-AP gate and the corpus run unchanged over them
Holy Paladin and Mistweaver Monk public (HEAL-B1P, tests/contracts/heal-ap-healer-promotion-gate.test.ts, heal-b1-healer-registrations.test.ts):
  gate subjects                                -> fight 48 Holy Paladin 1 and Mistweaver 9 whole-fight casts; every HEAL-AP gate check passes for each
  real uses                                    -> Holy Paladin 3 Avenging Wrath + 2 Aura Mastery; Mistweaver 3 Invoke Yu'lon + 2 Restoral; listing COMPLETE
  registration                                 -> PUBLIC; both lookups the same row; identity table resolves; public request dispatched once
  Restoration Druid                            -> still INTERNAL_ONLY; public request SPEC_NOT_SUPPORTED, no dispatch (no evidence for the gate)
  shared healer view                           -> Restoration Shaman's public tests unchanged over healer-view-projection.ts
  raid night                                   -> a stated-spec-less Mistweaver cell INSUFFICIENT_EVIDENCE, never SPEC_NOT_SUPPORTED, never Brewmaster's
Holy Priest public (HEAL-B2P, tests/contracts/heal-ap-healer-promotion-gate.test.ts, heal-b1-healer-registrations.test.ts, heal-b2-holy-priest.test.ts):
  gate subject                                 -> fight 48 Holy Priest 2 whole-fight casts; every HEAL-AP gate check passes
  real uses                                    -> 3 Apotheosis + 3 Divine Hymn; listing COMPLETE; 15 pulse casts (64844) are never uses
  plan entries                                 -> MET Divine Hymn (cast 7,509,640); not-met Apotheosis 7,650,000 ± 3 s; after the end; Flash Heal unregistered
  registration                                 -> PUBLIC; both lookups the same row; identity table resolves Priest/Holy; public request dispatched once
  identity                                     -> Priest/Holy resolves to priest/holy only; Shaman/Holy and Druid/Holy stay unsupported
  Restoration Druid                            -> still the one INTERNAL_ONLY row; public request SPEC_NOT_SUPPORTED, no dispatch
Holy Priest internal (HEAL-B2, tests/unit/specs/heal-b2-holy-priest.test.ts; a fourth case in heal-b1-healer-evaluators/registrations and healing-cooldown-identity-artifact):
  shared healer cases                          -> every HEAL-B1 evaluator and registration case passes for Holy Priest (other class: Paladin)
  artifact                                     -> exactly Divine Hymn 64843 and Apotheosis 200183, NORMAL; Discipline 256 / Shadow 258 refused; 64844 refused
  Divine Hymn pulses (64844 casts)             -> never a use; a window holding only pulses ASSIGNMENT_UNKNOWN READINESS_NOT_ESTABLISHED, never MET
  real M13-A Holy Priest 2                     -> Apotheosis 168,785, Divine Hymn 249,326, Apotheosis 289,544 (raw-checked); listing UNKNOWN; ROSTER_NOT_IN_SCOPE
  real M13-A Discipline 9, Shadow 10           -> IDENTITY_REFUSED NOT_THIS_SPECIALIZATION; NOT_ASSESSED
  real fight 48 Holy Priest 2                  -> no use, listing UNKNOWN, never "none used"; sources 2 + stated pet 94
  registration                                 -> INTERNAL_ONLY; public lookup null; identity table refuses; public request SPEC_NOT_SUPPORTED, no dispatch
Discipline Priest internal (HEAL-B3, tests/unit/specs/heal-b3-discipline-priest.test.ts; a fifth case in heal-b1-healer-evaluators/registrations):
  shared healer cases                          -> every HEAL-B1 evaluator and registration case passes for Discipline Priest (other class: Paladin)
  cooldown artifact                            -> exactly Power Word: Barrier 62618 + Ultimate Penitence 421453 (CHOICE, siblings) and Evangelism 472433 (NORMAL); Pain Suppression not identified
  Atonement artifact                           -> buff 194384, heal 81751, same-name 81749/94472/451577/451769; tampered row, two buffs, spec 257 refused
  applications                                 -> applybuff/refreshbuff from the subject's sources only; never a removal, a debuff, another priest's, or outside the encounter
  healing as reported                          -> 81751 heals from the subject and its stated pet, counts per target; no amount/overheal/total key
  damage link                                  -> always UNKNOWN DAMAGE_EVENT_LINK_NOT_REPORTED
  listing                                      -> COMPLETE only under actor-global coverage; actor-scoped INSUFFICIENT_SCOPE; gap INSUFFICIENT_COVERAGE; sourceless UNATTRIBUTED_EVENT; ability-less UNIDENTIFIED_SUBJECT_EVENT; same-name SAME_NAME_SPELL_FROM_SUBJECT
  finding set                                  -> unchanged three categories; Atonement adds no finding
  real M13-A Discipline 9                      -> Evangelism 190,592 and 281,877, Ultimate Penitence 232,488 (raw-checked); every listing UNKNOWN; ROSTER_NOT_IN_SCOPE
  real G2 cohort246 f33 Discipline 88          -> 7 Atonement applications onto actor 7 (raw-checked: 7 apply + 7 remove); listings UNKNOWN INSUFFICIENT_COVERAGE; heals excluded by the query, never "none"
  real M13-A Holy 2, Shadow 10                 -> IDENTITY_REFUSED NOT_THIS_SPECIALIZATION; NOT_ASSESSED
  registration                                 -> INTERNAL_ONLY; public lookup null; identity table refuses; public request SPEC_NOT_SUPPORTED, no dispatch
Discipline Priest public (HEAL-B3P: not promoted; no test changed, the existing pins carry it):
  gate subject                                 -> none: no committed or retained whole-fight capture (agent/architecture.md "HEAL-B3P"); the gate is not weakened
  gate coverage                                -> every PUBLIC healer row needs a pinned subject (heal-ap gate), so a subject-less promotion fails
  registration                                 -> still INTERNAL_ONLY beside Restoration Druid (m10d-public-registration, m10d invariance)
  public request                               -> Priest/Discipline SPEC_NOT_SUPPORTED, one retrieval for preparation alone (analysis-composition-refusals)
Preservation Evoker internal (HEAL-B4, tests/unit/specs/heal-b4-preservation-evoker.test.ts; a sixth case in heal-b1-healer-evaluators/registrations):
  shared healer cases                          -> every HEAL-B1 evaluator and registration case passes for Preservation Evoker (other class: Priest)
  cooldown artifact                            -> exactly Rewind 363534 (NORMAL) and Dream Flight 359816 + Stasis 370537 (CHOICE, siblings); no empowered spell, 370564 not identified
  role                                         -> roster UNKNOWN, roleEvidence null; module identity role UNKNOWN; never HEALER by guess
  unidentified empowered spell                 -> empowerstart + cast + empowerend (and a cast alone) add no use; listing stays COMPLETE
  identified ability seen empowered            -> RUNTIME_DATA_CONTRADICTED IDENTIFIED_ABILITY_OBSERVED_EMPOWERED with the envelopes; no use, no finding set; registration INSUFFICIENT_EVIDENCE
  another actor's empower envelope             -> contradicts nothing; the subject's cast is a use
  Stasis release (370564 cast)                 -> never a use; a window holding only a release ASSIGNMENT_UNKNOWN READINESS_NOT_ESTABLISHED, never MET
  real M13-A empower shape                     -> six Dream Breaths: empowerstart, cast in its millisecond, then empowerend (raw-checked)
  real M13-A Preservation 8                    -> Stasis 176,828 and 272,401, Rewind 284,626 (raw-checked, releases 199,450 and 288,323); listing UNKNOWN; ROSTER_NOT_IN_SCOPE
  real M13-A Augmentation 1                    -> IDENTITY_REFUSED NOT_THIS_SPECIALIZATION; NOT_ASSESSED
  registration                                 -> INTERNAL_ONLY; public lookup null; identity table refuses; public request SPEC_NOT_SUPPORTED, no dispatch
Preservation Evoker public (HEAL-B4P, tests/contracts/heal-ap-healer-promotion-gate.test.ts, heal-b1-healer-registrations.test.ts, heal-b4-preservation-evoker.test.ts):
  gate subject                                 -> gtKb fight 22 Preservation Evoker 15 whole-fight casts and empower envelopes; every HEAL-AP gate check passes
  real uses                                    -> 3 Stasis + 1 Rewind; listing COMPLETE; 3 releases (370564) and empowered Dream Breaths are never uses; no envelope on an identified id (raw-checked)
  plan entries                                 -> MET Rewind (cast 2,515,073); not-met Rewind 2,600,000 ± 3 s; Stasis after the end; Dream Breath unregistered
  registration                                 -> PUBLIC; both lookups the same row; identity table resolves Evoker/Preservation; public request dispatched once
  identity                                     -> Evoker/Preservation resolves to evoker/preservation only; Evoker/Devastation stays unsupported
  contradiction                                -> view passes RUNTIME_DATA_CONTRADICTED through as NOT_ASSESSED; the public reason list holds it
  Restoration Druid, Discipline Priest         -> still the INTERNAL_ONLY rows; public request SPEC_NOT_SUPPORTED, no dispatch
simulation runner (M11-G3-1, tests/unit/simulation/*.test.ts, contracts/m11g3-simulation-layering.test.ts):
  smuggled key (actions, input, json2, ...)    -> JOB_REJECTED at every object level (B)
  directive / path / $(…) / space in an id     -> JOB_REJECTED (C)
  built input                                  -> allow-listed keys only, no forbidden directive, byte-stable (D, E)
  other spec / no binding / other model        -> UNSUPPORTED_SPEC / UNSUPPORTED_SPEC / UNSUPPORTED_MODEL_VERSION (G, H)
  any additional target                        -> ENVIRONMENT_NOT_REPRESENTABLE; no first/last-hit vocabulary (I, layering)
  duration / gear / lust / consumable change   -> environment / profile / environment / profile hash only (J)
  payload, iterations, threads, policy drift   -> JOB_REJECTED (L)
  any cache-key component                      -> a different engine-run key (M)
  empty buff list / lust NONE / consumable NONE -> every override 0 / override.bloodlust=0 / disabled, never omitted (N, O)
  ms value whose decimal truncates short       -> midpoint text; engine round trip exact up to 20 min (P)
  revision / data / PTR / networking / binary  -> MODEL_PROVENANCE_MISMATCH (R, parser)
  echo, actors, raid events, logs, length      -> SIMULATION_OUTPUT_MALFORMED / SIMULATION_ENGINE_FAILED (parser)
  zero or negative DPS, bad counted total      -> SIMULATION_OUTPUT_MALFORMED, never a number (parser)
  noisier than the policy                      -> SIMULATION_PRECISION_NOT_MET (parser)
  diagnostics differ / DPS differs             -> semantically equal / first differing path (T)
  engine exit≠0, no output, oversize, hang     -> ENGINE_FAILED, ENGINE_FAILED, MALFORMED, TIMEOUT; temp dir removed (U)
  cancel / no engine / no artifact / busy      -> CANCELLED / RUNNER_UNAVAILABLE / RUNNER_UNAVAILABLE / RUNNER_OVERLOADED (U)
  engine argv and environment                  -> exactly job.simc + json2 in its temp dir; empty env (V)
  image tag                                    -> refused; content-addressed refs only (U)
  14 deliberate source faults                  -> each caught by the suite (.probe/m11g3/faults.cjs)
  reported seed differs from configured        -> parses: deterministic=1 reseeds every iteration (pinned sim.cpp:1810)
  shirt/tabard absent / wrong / other slot gone -> parses / MALFORMED / MALFORMED (report_json.cpp:387)
  golden exact-pin artifact                    -> pinned identity, DPS and counts; wrong binary -> MODEL_PROVENANCE_MISMATCH
character reconstruction (M11-G3-2, tests/unit/character-profile/*.test.ts, contracts/m11g32-character-profile-layering.test.ts):
  canonical subject                            -> deterministic; only RACE_UNRESOLVED blocks; hash pinned (A, T)
  specID null / other spec / no combatantinfo  -> SPEC_UNRESOLVED / SPEC_MISMATCH / COMBATANT_INFO_MISSING (B)
  UNKNOWN gems/enchant/bonus/ilvl              -> stays UNKNOWN, blocks, probe job refused (C, H, I, T)
  WCL position -> slot -> engine slot          -> one table; every position; shirt/tabard narrow (D, K)
  ids, levels, bonus order                     -> preserved exactly; bonus compared as multiset (E, F, G)
  runeforge UNKNOWN / KNOWN_NONE               -> REQUIRED_ENCHANT_UNKNOWN blocks / recorded, not invented (J)
  import string                                -> engine decode; 78/78 vs WCL facts; tiers; typed failures (L, N)
  hero tree                                    -> San'layn both sides; mismatch / contradictory blocks (M)
  race                                         -> never inferred or defaulted; blocks; "none" only for probes (U, V)
  comparison player's snapshot/code/pull       -> EVIDENCE_ACTOR_MISMATCH, nothing filled (W)
  probe job                                    -> no raid buff, consumable, lust or target; schema refuses (X, Y, Z)
  golden exact-pin echo                        -> all gated checks MATCH except race UNRESOLVED (Q)
  changed item/ilvl/gem/enchant/bonus/talent   -> FAILED fidelity, NOT_SIMULATION_READY (N, O, P, Q, R, G)
  set markers removed / extra                  -> setBonus MISMATCH (S)
  stats                                        -> STAT_RECONCILIATION_NOT_PROVEN diagnostic, never gated (P)
  provenance moved / order changed / setup     -> same hash / same hash / new hash; UNKNOWN != KNOWN_NONE (AA, AB)
  fidelity result                              -> carries no simulation number (AC)
  16 deliberate faults                         -> each caught (.probe/m11g3/faults-g32.cjs)
execution profile (M11-G3-3, tests/unit/simulation/execution-profiles.test.ts, runner-and-parser.test.ts):
  ELITE_REALISTIC_V1                           -> sole PRODUCTION profile; deep-frozen; revision pinned (A)
  every field                                  -> explicit; V1 is its own literal, not the pinned defaults (B, E)
  any setting / id / version change            -> new revision (C, D)
  profile times                                -> integer effective ms; builder round-trips (F)
  Blood vs .react APL                          -> reaction INACTIVE vs ACTIVE; strict ON activates gcd_lag (G, H)
  queue, strict, server delays, brain, skill   -> each written to the engine input (I-M)
  smuggled latency field                       -> JOB_REJECTED; no WCL/normalization import (N, O)
  V1 vs pinned input                           -> only reaction lines differ (P)
  profile change / same settings, other id     -> different engine-run key (Q)
  real run                                     -> result records id, version, revision, effective settings (R)
  ready_type echo mismatch                     -> SIMULATION_OUTPUT_MALFORMED
  13 deliberate faults                         -> each caught (.probe/m11g3/faults-g33.cjs)
environment (M11-G3-4, tests/unit/environment/*.test.ts, contracts/m11g34-environment-layering.test.ts):
  canonical subject                            -> 345,177 ms exact; NOT_REPRESENTABLE; BLOCKED for audited codes (A, W)
  fight-end knowledge                          -> RETROSPECTIVE_EXACT_FIGHT_END@1 assumption in provenance (C)
  raid buff absent from pull list / caster     -> UNKNOWN, never KNOWN_NONE, never from composition (D, E)
  mid-fight removal                            -> TIMED, NOT_REPRESENTABLE (never broadened)
  generated text                               -> exact duration, optimal_raid=0, every override explicit (B, F)
  lust                                         -> Heroism 32182 equivalent 471->40475; whole-second diagnostic (G)
  no application / partial coverage / lockout  -> timing UNKNOWN; never a pull or default lust (H, I)
  temporary enchant 8052                       -> thalassian_phoenix_oil_2 preserved and echoed (J)
  food / rune                                  -> UNKNOWN; never ideal; candidates only (K, L)
  flask / potion rank                          -> UNKNOWN; never chosen; CURRENT_SETUP refuses (M)
  potion uses                                  -> exact intervals; timing not representable (N)
  consumable options / APL                     -> all written explicitly; only the gated potion line (O)
  tank load                                    -> V1 explicit; revision = hash of directives (P)
  first/last hit, catalog, summon, death       -> never availability; schedule UNKNOWN (Q, R, S, T)
  BOSS_ONLY_DIAGNOSTIC                         -> labelled; never ceiling-eligible; mixing refused (U)
  additional target                            -> never emitted; runner refuses (V)
  fully established synthetic environment      -> PUBLISHABLE and translatable; each condition alone blocks (W)
  character profile                            -> separately RACE_UNRESOLVED; nothing crosses (X)
  hash                                         -> deterministic, pinned; semantics move it; identity doesn't (Y, Z, AA)
  stat revisit                                 -> PARTIALLY_RECONCILED; blocking only with proven comparability (AB)
  model build lag                              -> diagnostic only (AC)
  27 deliberate faults                         -> each caught (.probe/m11g3/faults-g34.cjs)
environment continuation (M11-G3-4, 2026-10-22):
  primary-target continuity                    -> approved for the canonical fight only; any other fight PENDING
  weapon oil                                   -> whole-fight only with COMPLETE casts and no replacement
  defensive ally auras                         -> pinned list excluded (approved); any other ally aura PENDING
  lust whole second                            -> approved approximation, both values in provenance
  potion                                       -> actual availability, APL timing; timestamps never replayed
  unresolved rank                              -> complete plausible set as variants; unrepresentable -> refused
  food / rune USER_PROVIDED                    -> pinned token only; NONE allowed; conflict and invalid block
  race                                         -> USER_PROVIDED with provenance; "none"/invalid refused; no range
  aura absent from pinned data                 -> PINNED_MODEL_MISSING_OBSERVED_EFFECT blocks; age alone does not
  WCL investigation                            -> AUTHORITY_NOT_FOUND audit, no interval
  pinned encounter audit / debuff certification -> recorded; schedule and debuffs stay UNKNOWN
  missing model effect                         -> one PINNED_MODEL_MISSING_OBSERVED_EFFECT blocker per aura
  owner-stated race (canonical subject)        -> USER_PROVIDED dwarf; exact-pin echo MATCH, SIMULATION_READY; environment still BLOCKED
runner service (M11-G3-5, tests/unit/simulation/runner-service-*.test.ts, integration/m11g35-remote-simulation-client.test.ts):
  no / bad / stale / future / replayed auth    -> 401 before the service; reason logged, never headers (A, B, C)
  key rotation / revocation / full nonce store -> both keys accepted / removed key refused / refuses, never forgets (C)
  logs and responses                           -> no secret, signature, nonce or job content (D)
  raw SimC text / file path / network source   -> JOB_REJECTED or 400; builder emits no fetch directive (E, K, L)
  arbitrary model / profile / policy           -> UNSUPPORTED_MODEL_VERSION / JOB_REJECTED; engine never starts (F, G, H)
  raised iterations or threads                 -> JOB_REJECTED; runner thread cap enforced (I, J)
  production unattested / blocked              -> JOB_REJECTED / ENVIRONMENT_NOT_REPRESENTABLE / PROFILE_RECONSTRUCTION_FAILED (M)
  blocked production with a cached result      -> refused before the cache (M)
  diagnostic job                               -> jobClass DIAGNOSTIC, publishable false; attestation refused (N)
  tampered cache entry (11 kinds)              -> CACHE_REJECTED, dropped, re-run (O)
  concurrency / depth / overload / FIFO        -> <= maxConcurrentJobs; RUNNER_OVERLOADED, no ticket; queue-wait expiry (P-S)
  queued / running cancel                      -> removed, never run / engine process killed, pid gone (T, U)
  completion vs cancel                         -> first terminal transition wins; never a partial result (V)
  temp dirs / capacity after every outcome     -> none left / empty and full width again (W, X)
  identical in-flight jobs                     -> one execution; one caller cancelling leaves the others running (Y)
  repeat job                                   -> HIT, terminal at once, no engine run (Z)
  same / profile / environment / execution / model / parser -> same key / a new key each (AA-AF)
  HIT                                          -> full provenance; corrupt durable entry recomputed (AG, AH)
  MISS / COALESCED / HIT                       -> identical result; status beside it, never in it (AI)
  LOCAL vs REMOTE                              -> same result, same provenance, remote HIT, same failures (AJ-AM)
  restart                                      -> lost ticket re-submitted: HIT or re-run to the same key; bounded
  forged ticket (16 kinds)                     -> refused by the client with a typed failure (BAD_RESPONSE)
  client deadline / abort                      -> signed DELETE; SIMULATION_TIMEOUT / CANCELLED
  startup: bad engine, wrong hash/revision, capacity, cache -> NOT READY; submissions RUNNER_UNAVAILABLE
  graceful shutdown                            -> engines killed after grace; no live execution; new work refused
  workerd                                      -> WebCrypto signature verifies; forged tickets refused; deadline DELETE
  deliberate faults                            -> each caught (.probe/m11g3/faults-g35.cjs)
  final hardening (runner-service-hardening.test.ts, contracts/m11g35-readiness-gate-revisions.test.ts):
  attestation: wrong profile / environment gate revision -> JOB_REJECTED, before cache and engine
  attestation: stale schema (v1 shape, /1 version), wrong class, extra field -> JOB_REJECTED
  attestation: hash mismatch / other job's attestation -> JOB_REJECTED
  attestation: NOT_SIMULATION_READY / BLOCKED  -> PROFILE_RECONSTRUCTION_FAILED / ENVIRONMENT_NOT_REPRESENTABLE
  valid current attestation                    -> SUCCEEDED, PRODUCTION, publishable
  blocked / stale production with a valid cached result -> refused; zero cache reads
  gate revisions                               -> runner accepts exactly the gate-owned current revisions
  gate code changed                            -> fingerprint fails until revision bumped or reviewed re-pin
  cache: edited DPS / ci95 / action / pet / provenance / MAC -> CACHE_INTEGRITY_FAILED; dropped; recomputed
  cache: schema-1 record / record moved under another key -> CACHE_ENTRY_MALFORMED / CACHE_INTEGRITY_FAILED
  cache: valid MAC, foreign provenance         -> CACHE_RESULT_UNVERIFIED (MAC first, then verification)
  cache: durable file with edited DPS          -> rejected; served DPS is the recomputed one
  HTTP key as cache key / cache key as HTTP key -> MAC refused / 401 BAD_SIGNATURE; config refuses reuse
  missing cache-integrity key                  -> NOT READY; submissions RUNNER_UNAVAILABLE
  cache-integrity secret                       -> absent from logs, metrics, readiness, tickets, errors
  job classes: production default              -> PRODUCTION only; DEVELOPMENT / DIAGNOSTIC / FIDELITY_PROBE REFUSED
  job classes: dev configuration               -> enabled explicitly, per class; empty list NOT READY
  class refusal with a shared cache holding the result -> refused; zero cache reads; no engine
  10 hardening faults                          -> each caught (.probe/m11g3/faults-g35h.cjs)
simulation-model registry (M11, tests/unit/simulation/{model-registry,runner-service-models,model-0a72e6a7-canonical,consumption-release}.test.ts, contracts/m11-simulation-model-registry.test.ts):
  registry                                     -> exactly 33622e9d/69587 and 0a72e6a7/69933; historical unchanged; build records VERIFIED
  analyzer authority                           -> every analyzer artifact on 33622e9d; no import between the two model concepts
  global default model                         -> none in src or runner (no APPROVED_SIMC_MODEL, no APPROVED_ENGINE_ARTIFACTS[n])
  canonical context (69933, 2026-10-01)        -> 0a72e6a7; a 69587 context -> 33622e9d, never the newer model
  12.1.5 / outside the validated window        -> SIMULATION_MODEL_NOT_AVAILABLE; no fallback in either direction
  build or fight time unresolved               -> SIMULATION_MODEL_CONTEXT_UNRESOLVED
  spec without a validation                    -> SIMULATION_MODEL_NOT_VALIDATED_FOR_SPEC (runner: before the cache)
  commit/build cross-pairing, unregistered pin -> UNSUPPORTED_MODEL_VERSION
  wrong artifact for the job's model           -> RUNNER_UNAVAILABLE (prepare) / NOT READY (runner startup)
  cache identity                               -> engine-run and parsed-result keys differ by model; profile/env/execution hashes do not
  cache MAC                                    -> per model; a record moved under the other model's key fails the MAC
  result of one model                          -> never verifies or settles as the other model
  LOCAL / REMOTE                               -> parity on the new model (fake and exact-pin)
  attestation schema 3                         -> names the simulation model; another model's attestation JOB_REJECTED
  promoted model, canonical character          -> identical profile; fidelity MATCH / SIMULATION_READY
  promoted model, canonical environment        -> NOT_REPRESENTABLE / BLOCKED, same blockers and materiality classes
  absent auras                                 -> three PINNED_MODEL_MISSING_OBSERVED_EFFECT naming 12.1.0.69933, with or without applicability
  selection applicability                      -> the one matching validation (spec, build, fight start, window, basis); two matching windows CONTEXT_UNRESOLVED
  chronology inside a validated window         -> MODEL_SNAPSHOT_PRECEDES_LOG (informational), no MODEL_BUILD_LAG; status/blockers/hash/publishability unchanged
  applicability not covering model+fight       -> MODEL_BUILD_LAG stays (null, other model, other build, window outside or ending at the start, unparseable)
  data bundle load (tests/unit/simulation/model-data-bundle.test.ts) -> history must end at the loaded revisions; stale v3 revision, foreign provenance, v1 manifest, sourceless consumables refused
  consumables provenance                       -> real source paths, extractor v4, semantic hash = committed v3 content, token verdicts unchanged

simulation-context resolver (M11-G4-1, tests/unit/simulation-context/{resolver,report-region}.test.ts, contracts/m11g4-simulation-context-layering.test.ts):
  committed evidence                           -> loads; all 27 builds verified on Blizzard CDN; restart sources THIRD_PARTY_NEWS_REPORT, never Blizzard-labelled
  derived intervals                            -> exactly US 69587 [09-09T04:00Z, 09-12T06:45Z) and US 69933 [09-30T03:00Z, 10-12T04:18Z); 09-22 restart does not prove 69933
  canonical fight                              -> archived region US (same report state as the committed context) -> 12.1.0.69933 -> 0a72e6a7
  region NOT_RETRIEVED / NOT_SUPPLIED / EU      -> UNRESOLVED (REGION_UNRESOLVED / REGION_NOT_COVERED) -> SIMULATION_MODEL_CONTEXT_UNRESOLVED
  interval edges                               -> inclusive start, exclusive end; inside the 12 h margin NEAR_DEPLOYMENT_BOUNDARY
  no date-only / nearest-build inference       -> 09-14, 09-25, 10-20 NO_PROVEN_DEPLOYMENT_INTERVAL although builds were listed
  historical model                             -> 09-11 resolves 69587 -> 33622e9d; 09-09 resolves 69587 but selection NOT_AVAILABLE (outside validation window)
  identity unverified / CDN after observation  -> no interval (and NEXT_BUILD_UNBOUNDED for the build before) / SOURCES_CONFLICT
  restart imprecise (> 24 h) or missing        -> NO_PROVEN_DEPLOYMENT_INTERVAL; a restart in another region proves nothing here
  invalid evidence, non-finite fight time      -> DEPLOY_EVIDENCE_INVALID, FIGHT_TIME_UNRESOLVED
  unreal calendar timestamps                   -> retrieval, wago, CDN and restart times refused at load; DEPLOY_EVIDENCE_INVALID, never a throw
  out-of-range times                           -> fight start outside Date range (either sign, or infinite) FIGHT_TIME_UNRESOLVED; evidence years outside 2000-2999 refused
  conflicting restart accounts                 -> overlapping-but-different windows: DEPLOYMENT_EVIDENCE_CONFLICT in the span they touch; identical accounts corroborate
  normalization revision                       -> m3.4 pinned (additive report.region); raid-night/1 cells carry it, analysis/1 does not

simulation publication (M11-G4-2, tests/unit/publication/pipeline.test.ts, contracts/m11g4-publication-layering.test.ts, scripts/bench/m11g42-publication.bench.ts):
  canonical, no region                         -> CONTEXT / CONTEXT_UNRESOLVED (REGION_UNRESOLVED)
  canonical, no echo source (production)       -> CHARACTER / FIDELITY_PROBE_UNAVAILABLE, model 0a72e6a7 selected
  canonical, echo failure                      -> CHARACTER / FIDELITY_PROBE_FAILED with the code, never "not ready"
  canonical, no race statement                 -> CHARACTER / PROFILE_NOT_SIMULATION_READY
  canonical, ready character                   -> ENVIRONMENT / ENVIRONMENT_NOT_PUBLISHABLE with its real blockers; backend never called
  golden echo                                  -> used only when the probe job profile hash equals the golden one
  real runner service (fake engine)            -> PRODUCTION-only service accepts the pipeline job and attestation; PUBLISHED
  attestation                                  -> PRODUCTION, the job model id, current gate revisions, prepared hashes
  variants                                     -> every variant runs; envelope = [min ci95.lower, max ci95.upper]; one failure -> NOT_PUBLISHED
  precision                                    -> one escalation only on SIMULATION_PRECISION_NOT_MET; second miss PRECISION_INSUFFICIENT (2 calls)
  other failures                               -> SIMULATION_RESULT_INVALID / SIMULATION_UNAVAILABLE with the code, never retried
  real settleTicket refusal (BAD_RESPONSE)     -> SIMULATION_RESULT_INVALID with MODEL_PROVENANCE_MISMATCH, one call, never "unavailable"
  execution profile revision                   -> published records carry the verified revision; a result naming another revision is SIMULATION_RESULT_INVALID
  unresolved race                              -> JOB_CONSTRUCTION_FAILED, no backend call
  attainment                                   -> interval only when observed KNOWN and comparability PROVEN; today NOT_PROVEN -> UNKNOWN
  real engine (bench, Docker 0a72e6a7)         -> 345 s PUBLISHED (RSE 7.8e-4); 60 s PRECISION_INSUFFICIENT after one escalation
  layering                                     -> internal: nothing in src imports src/publication; spec-agnostic; no coaching vocabulary

profile echo transport (M11-G4-3, tests/unit/simulation/profile-echo-transport.test.ts, scripts/bench/m11g43-remote-profile-echo.bench.ts):
  parser V3                                    -> a probe result carries exactly the extractProfileEcho reading of the same report; non-probe results carry none
  verification                                 -> echo required exactly on probes (else MODEL_PROVENANCE_MISMATCH); a malformed echo is SIMULATION_OUTPUT_MALFORMED; an echo on a non-probe result is refused
  LOCAL / REMOTE                               -> both deliver the same echo from a probe-enabled runner
  production job-class default                 -> the probe is refused (JOB_REJECTED); never an echo
  stage A through a probe-enabled runner       -> CHARACTER is decided by the fidelity gate on the transported echo
  real engine (bench, Docker 0a72e6a7)         -> canonical stage A: CHARACTER SIMULATION_READY on the real echo; first failing gate ENVIRONMENT

DPS comparability (M11-G4-4, tests/unit/publication/dps-comparability-evidence.test.ts, pipeline.test.ts):
  WCL pets                                     -> each owned pet's table total = its events' amount + absorbed against hostile NPCs
  WCL targets                                  -> each add row = owner + pets amount + absorbed; boss row also minus Bombardments (190,342)
  WCL total                                    -> owner + pets (amount + absorbed) to hostile NPCs minus Bombardments = 45,802,009; friendly damage is only Blessing of Sacrifice and excluded
  WCL overkill                                 -> amount excludes overkill (the one overkill event)
  engine                                       -> DPS x duration = own damage actions + pet damage (< 1e-12); not without pets; healing not counted
  rule                                         -> PROVEN only with RECONCILED attribution, the DamageDone table source, log version 17 and one target; otherwise NOT_PROVEN with reasons
  attribution                                  -> canonical RECONCILED (Bombardments excluded); +/-1 unit, an unexcluded credited ability, PARTIAL/ABSENT coverage, or a dropped pet -> UNRECONCILED
  metadata alone                               -> same source, version and one target with UNRECONCILED attribution -> NOT_PROVEN
  canonical                                    -> 3 targets: NOT_PROVEN, attainment UNKNOWN
  comparable published record                  -> attainment KNOWN [observed / envelope.high, observed / envelope.low]
  report region decode                         -> KNOWN only for a non-empty slug; null/malformed NOT_SUPPLIED; absent key NOT_RETRIEVED; query requests region{slug}
  layering                                     -> spec-agnostic; imports own evidence, zod, two types; no SimC/snapshot/ceiling vocabulary; nothing in src imports it
  Consumption                                  -> parses and verifies on both; breakdown granularity model-dependent (pinned)
  runner config                                -> registered ids only, registered image per model, no repeats

12.1.5 compatibility review (M11-G4-5, tests/contracts/m11g4-simc-build-recipes.test.ts, tests/unit/simulation-context/resolver.test.ts):
  simc-build/2 base                            -> committed sha256 digest; both stages FROM alpine@${ALPINE_DIGEST}; no tag
  simc-build/2 locks                           -> sorted, unique, exact name-version-rN entries; clang in the build closure
  simc-build/2 install                         -> each stage installs its own lock pinned and diffs apk info -v against it; no unpinned apk add
  simc-build/2 engine                          -> SIMC_COMMIT has no default and is verified; PGO training deterministic=1; SC_NO_NETWORKING both passes; unprivileged user
  simc-build/1                                 -> Dockerfile hash equals both committed v1 build records' recipeSha256
  70575 interval                               -> US [2026-10-28T03:00Z, 2026-10-29T01:28:51.141Z) on US-2026-10-27, end OBSERVATIONS_RETRIEVED
  70575 fight                                  -> RESOLVED 12.1.5.70575, selection SIMULATION_MODEL_NOT_AVAILABLE (never 0a72e6a7); restart day NEAR_DEPLOYMENT_BOUNDARY
  exact-pin bench                              -> the artifact's recipe revision comes from the model and must equal the build record's

reproducible engine recipe (M11-G4-6, tests/contracts/m11g4-simc-build-recipes.test.ts, tests/unit/simulation/engine-json-compare.test.ts, scripts/bench/m11g46-functional-reproduction.bench.ts):
  simc-build/2 and /3                          -> the simc-build/2 base, lock, install and engine checks hold for both (describe.each)
  simc-build/3 inputs                          -> same digest and same lock entries as simc-build/2
  SOURCE_DATE_EPOCH                            -> the commit's committer time, written in the clone step, exported before both make invocations
  PGO training                                 -> exactly "single_actor_batch=1 iterations=100 deterministic=1 threads=1"
  record / script                              -> simc-build-record/3 with pgoProfileSha256; --expect-binary mismatch fails NOT_REPRODUCED
  frozen                                       -> simc-build/1 hash = its records; simc-build/2 hash = the G4-5 candidate record (4005f4d4…)
  two --no-cache v3 builds (local)             -> same epoch time embedded; PGO profile and binary differ; --expect-binary -> NOT_REPRODUCED
  engine JSON comparison                       -> structural: {logs:[]} != {}, [1] != {"0":1}, [1] != [1,{}], null != {}, own keys only; only timestamp, build_date/time, sim.statistics excluded
  functional reproduction (bench, Docker)      -> v3a vs v3b and v3a vs v2 candidate: 0 differing paths over 45,691 primitive leaves, single thread, both execution profiles (these jobs only)
  negative control (bench, Docker)             -> v3a vs approved 0a72e6a7: engine identity differs, 29,842 paths differ -> fails

consumable status (PREP-1, tests/unit/preparation/*, tests/unit/preparation-consumables-extraction.test.ts, tests/contracts/preparation-{service,layering}.test.ts):
  never omitted                                -> HEALTH_POTION, HEALTHSTONE, COMBAT_POTION always present (every case, including identity-load failure)
  COMPLETE coverage                            -> observed counts; zero only here; each use keeps spell, name, timing, evidence
  PARTIAL / ABSENT / unverified casts          -> every kind UNKNOWN, never 0; observedAtLeast keeps the seen uses
  out-of-scope player                          -> UNKNOWN (INSUFFICIENT_SCOPE)
  PARTIAL auras                                -> only COMBAT_POTION UNKNOWN (a pre-pull potion could be hidden)
  fight < longest combat-potion buff (60 s)    -> COMBAT_POTION UNKNOWN with its lower bound
  pre-pull combat potion                       -> buff removal with no in-fight application or cast = one BEFORE_PULL use; an in-fight buff's removal is not a second
  other players, cast beginnings, outside fight -> not counted
  unclassified "Potion"/"Healthstone" cast     -> affected kinds UNKNOWN (UNCLASSIFIED_CANDIDATE), not zero; ordinary class abilities are not candidates
  unclassified "Potion" buff only              -> COMBAT_POTION UNKNOWN even under COMPLETE coverage with no cast (unknown pre-pull potion)
  unmatched removal, incomplete coverage       -> a use with timing UNRESOLVED, never BEFORE_PULL (casts PARTIAL or auras PARTIAL)
  racial abilities                             -> never classified (extractor fails on race mask or racial_spells.inc entry); racial casts never count
  identity data                                -> on the analyzer authority pin; anchors, slot classification, no talent modifiers; agrees with simulation-model POTION auras; names match WCL master data; malformed/duplicate/anchor-less fails closed
  service                                      -> ASSESSED for analyzed requests; same report when the analyzer declines; requirement unioned, widens nothing; unsupported spec NOT_ASSESSED with no ingestion
  layering                                     -> producer reads only fight, shared evidence primitives and its data; no specialization imports it
  mutations (manual)                           -> dropping the cast gate fails 3 tests; dropping pre-pull open-buff tracking fails 1; always-BEFORE_PULL fails 1; dropping aura candidates fails 1

public consumable status (PREP-2, tests/contracts/preparation-{public-projection,service}.test.ts, corpus APPLICATION_SERVICE cases):
  every status                                 -> `preparation` on ANALYZED and every unanalyzed variant; all three consumables, schema-valid
  unsupported specialization                   -> ONE retrieval, PREPARATION_REQUIREMENT only (PLAYER_CONTEXT, no resources); no analyzer runs; scope PLAYER_CONTEXT; ASSESSED
  unsupported, retrieval fails / report changed -> still SPEC_NOT_SUPPORTED; preparation NOT_ASSESSED (RETRIEVAL_FAILED); scope null
  UNKNOWN on the wire                          -> countState UNKNOWN, reasons coded, observedAtLeast, and no `count` key
  NOT_ASSESSED on the wire                     -> {assessment, reason} only
  no leak                                      -> identity-load detail not published (reason is the code alone); no `state` key anywhere (m6c guard)
  vocabularies                                 -> unknown codes, use timings, not-assessed reasons pinned equal to producer/services; gate outside the public four fails the projection closed
  superseded pins (updated, owner decision)    -> refusals, m10d Arms invariance, m6c scope: one preparation-only retrieval instead of zero; corpus cases scope PLAYER_CONTEXT, renamed case id

raid-night consumable status (PREP-3, tests/contracts/raid-night-preparation.test.ts, tests/unit/raid-night-input-gate.test.ts, m7f regressions):
  all-unanalyzable fight                       -> ONE retrieval, includeResources false, talentImportActorId = a present player; INGESTED; NOT_ANALYZED cell with ASSESSED preparation
  all-absent fight                             -> still NOT_INGESTED, zero retrieval; ABSENT cells carry no preparation
  present cell kinds                           -> ANALYZED and NOT_ANALYZED (and ANALYSIS_UNAVAILABLE) all carry preparation
  failed retrieval                             -> INGESTION_FAILED; ANALYSIS_UNAVAILABLE (FIGHT_INGESTION_FAILED); preparation NOT_ASSESSED (RETRIEVAL_FAILED), never a zero
  public cell                                  -> schema-valid compact form; no uses/evidence/spellId on the night; absent cell has no preparation key
  compact form                                 -> OBSERVED count; UNKNOWN observedAtLeast + each reason code once, no count
  gate (tightened)                             -> NOT_INGESTED with ANY present cell (unsupported, unresolved, analyzed, unavailable) -> PROCESSING_CELL_MISMATCH; all-absent NOT_INGESTED accepted
  single-player truth                          -> the raid-night cell's preparation equals the single-player cell's (same focused view)
  m8d no-ratio guard                           -> words and word prefixes (matchRate, passRatio, percentage fail); "preparation" passes

real consumable evidence (PREP-4, corpus APPLICATION_SERVICE.FIGHT_ANALYSIS with expected.preparation; slices of b1Pma fight 48, no new request):
  Mage 121, first 65 s                         -> combat potion OBSERVED 1 (Light's Potential, BEFORE_PULL); health potion and healthstone OBSERVED 0
  Shaman 122, 20 s mid-fight                   -> health potion OBSERVED 1 (1234768) and healthstone OBSERVED 1 (6262), IN_FIGHT; combat potion UNKNOWN (FIGHT_SHORTER_THAN_LONGEST_COMBAT_POTION_BUFF, lower bound 0)
  slices                                       -> normalization census each (count, order, every type recognised); grants only what window and families vouch for
  mutations (corpus APPLICATION_SERVICE layer) -> no pre-pull removal counted fails the Mage case (combat potion 0 vs 1 BEFORE_PULL); no short-window guard fails the Shaman case (OBSERVED 0 vs UNKNOWN); restored, gate passes

MCP tool descriptions state the consumable status (PREP-5, tests/contracts/prep5-tool-description-consumables.test.ts):
  both tools                                   -> always carried (every status incl. SPEC_NOT_SUPPORTED / every present cell); observedAtLeast is a lower bound, NOT a count; zero only under complete coverage; UNKNOWN never zero; NOT_ASSESSED claims nothing; no "should have been used"
  prose tied to contract                       -> every field/value the paragraph names (preparation, countState, OBSERVED, UNKNOWN, reasons|reasonCodes, observedAtLeast, NOT_ASSESSED) is in that tool's advertised output schema
  negative                                     -> no consumable judgment phrase (should use, forgot, missed a potion, failed to use, potion score)
```

The G3-4 materiality numbers, the stat-revisit fixture
(`tests/fixtures/environment/simc-33622e9d-subject-stat-revisit.json`) and the
diagnostic round trip are produced on the approved engine by
`scripts/bench/m11g34-environment.bench.ts`, not by `npm test`.
Single-threaded measurements reproduce exactly. STANDARD_SIM_V1 reproduces to
1e-9, because its thread merge order is not fixed (last-bit drift between
runs).

The fake engine (`tests/support/simulation/fake-simc.mjs`) re-parses the
builder's text independently and echoes it the way the pinned report writer
does. It is never a source of DPS. Exact-pin identity, determinism, precision
and runtime are measured by `scripts/bench/m11g3-simc-exact-pin.bench.ts`
against the built image, not by `npm test`.

Required negative pairs, same premises, different construct:

```text
call, callee selects nothing  -> caller's next entry is selected
run,  child selects nothing   -> NO_ACTION
```

Also required: an undecided gate above an EMPTY callee is harmless for a call
(both worlds continue) and blocking for a run (the worlds disagree); an entry
above a certain run still wins normally; cycles through run edges, mutually
recursive run lists and a mixed call/run cycle fail closed under the existing
active-stack guard; a run entry carrying an unsupported option refuses before
its gate is read; the first-GCD root restart re-enters a run list through the
same one-scan engine (a NON_GCD action selected inside a run child, then a
root restart that transfers again).

Public invariance: the three PUBLIC artifacts contain no `run_action_list`,
so every capture of `scripts/bench/m10d-public-invariance.bench.ts` must be
byte-identical before and after an engine change here. The corpus family is
SYNTHETIC and is regression evidence only; it qualifies nothing for
promotion.

Failure mode this prevents:

A run gate read as FALSE, TRUE or absent when it could not be decided, or a
child that selects nothing "falling through" to a parent entry the pinned
loop never reaches — a confident finding manufactured from control flow the
authority does not have.

---

# INTERNAL_ONLY Measurement Slice Tests (M11-B2, Blood Death Knight)

A measurement slice is an analyzer whose deliverable is where the shared
machinery STOPS on real evidence, not how many decisions it resolves. Its
tests must therefore pin the shape of the honest result and refuse the two
easy corruptions: a resolved decision manufactured by widening shared state,
and a stopping point hidden behind an earlier undecided candidate.

Required, over the committed Blood corpus evidence
(`tests/contracts/m11b2-blood-evaluator.test.ts`,
`tests/unit/m11b2-blood-bindings.test.ts`,
`tests/unit/m11b2-blood-authority-data.test.ts`,
`tests/contracts/m11b2-blood-registration.test.ts`, and the
`SPEC_BLOOD_DEATH_KNIGHT.*` corpus cases):

```text
every eligible decision      -> UNKNOWN with a named stopping entry AND the
                                atoms (or tagged reason) that made it undecidable
stopping tallies             -> partition the eligible population exactly
undecided GCD candidates     -> recorded beside the stopping entry, so a
                                competing candidate the entry hides is visible
run gate FALSE on real list  -> RUN_GATE_FALSE_SKIPPED, parent continues (×123)
run gate TRUE on real list   -> child entered, parent's later run never visited
run gate undecided           -> BLOCKED at the gate, no world explored
contracted NON_GCD entry     -> branched under its contract; never a stopping point
```

Required negative cases:

```text
no count from silence        -> Bone Shield stack UNBOUND, presence UNKNOWN
lone refresh after a count   -> COUNT_AMBIGUOUS_SINCE_OBSERVATION, never carried
initial application only     -> NO_STACK_OBSERVATION (an applybuff carries no count)
same-ms transition ahead     -> SAME_MILLISECOND_TRANSITION: neither the pre- nor
                                the post-cast state is read
wire cost field              -> never an affordability or INSUFFICIENT_RESOURCE proof
                                (450 reported, 350 paid; 440 and 390 attached below it)
uncosted resource entry      -> NO_OBSERVATION (EVENT_ASSOCIATED), never a pre-cast amount
Deathbringer aura, San'layn  -> bound DOWN by hero-tree exclusion; NOT when the
                                tree is UNKNOWN or resolved to Deathbringer
DEBUFF atom                  -> never bound (no debuff binding field exists)
Death Strike's survival role -> ACTIVE_MITIGATION / SELF_HEALING NO_PINNED_AUTHORITY,
                                never DOMAIN_NOT_DECLARED, never the offensive verdict
public surfaces              -> SPEC_NOT_SUPPORTED for DeathKnight/Blood with zero
                                analyzer calls; the public spec list, identity table,
                                contract enum, sentence and MCP descriptions unchanged;
                                the 33 invariance captures byte-identical
```

Also required: the pinned authority's client-version guard record loads and
a malformed guard fails closed (mutation); every pinned condition parses
under the Blood vocabulary. Before M11-B3 exactly three were pinned as
refused on the decimal literal `1.5`, so that admitting decimals was a
VISIBLE change to this test rather than a silent widening; M11-B3 made that
change and re-pinned the list empty.

Failure mode this prevents:

A measurement that reads as coverage — an INTERNAL_ONLY slice with 0 of 123
decisions resolved presented, or promoted, as if the shared machinery had
been exercised to an answer; or a "fix" to the dominant stopping point
(decimal literals) that resolves nothing while making the next obstacle
(`buff.<x>.remains`) invisible because no test names it.

---

# Decimal Literal Tests (M11-B3)

A literal-grammar change to the shared parser is a change to every
specialization's authority at once, so it is proven the way a built-in
addition would be: positively for exactly the pinned form, negatively for
every neighbouring form, and with the freeze contract widened by one pin
rather than relaxed.

Required (`tests/unit/m11b3-decimal-literals.test.ts`, the literal-grammar
block of `tests/contracts/m11a-parser-builtins-frozen.test.ts`):

```text
digits '.' digits            -> the same NUMBER node an integer is, at its exact
                                `number` value (1.5 is 1.5; 12.10 is 12.1)
integer literals             -> unchanged: safe integers, no float path
x < 1.5 with KNOWN x         -> decided by the ordinary comparison rule at
                                1.4 / 1.5 / 1.6 exactly
x < 1.5 with BOUNDED x       -> decided only in the proven direction
x < 1.5 with UNKNOWN x       -> UNRESOLVED; the literal decides nothing alone
every pinned Blood condition -> parses; san_gift[0], sanlayn[0], sanlayn[1]
                                carry value 1.5
```

Required negative cases — each refused WHOLE under an EXISTING reason,
never truncated to its integer prefix, never read as two tokens:

```text
1.  / 1.5.5                  -> UNSUPPORTED_NUMERIC_LITERAL
.5                           -> UNEXPECTED_CHARACTER
1e3 / 1.5abc                 -> TRAILING_INPUT
-1.5                         -> UNSUPPORTED_OPERATOR (unary minus untouched)
builtin table                -> no NUMBER entry; isBuiltinIdentifier("1.5") false
parseNumber source           -> no exponent, sign, or hex branch
Blood stopping atoms         -> no UNSUPPORTED_NUMERIC_LITERAL anywhere; the
                                next truthful blocker (buff.<x>.remains) named
```

Failure mode this prevents:

A syntax widening that quietly carries a state widening (a remainder,
a bound, a negative threshold) with it; or one that admits a typo (`1.`,
`1.5.5`) as a threshold the pinned list never wrote.

---

# Buff Remains Tests (M11-B4)

A remaining duration is DERIVED — an observed gain plus a pinned duration
under pinned refresh semantics — and the tests must prove both that the
derivation is exact where the evidence and mechanics permit it and that it
refuses everywhere else. The generic seam, the engine primitives, the
duration authority and the Blood derivation are each tested at their own
layer.

Required, generic (`tests/unit/m11b4-buff-remains-binding.test.ts`):

```text
absent name                  -> UNKNOWN, STATE_NOT_MODELLED, trace byte-identical
                                to the pre-seam trace (with and without the field)
explicit UNKNOWN entry       -> UNKNOWN with the spec's reason, never zero
KNOWN value                  -> exact comparisons, exact arithmetic, TRUE as a
                                bare truth; KNOWN 0 FALSE as a bare truth
BOUNDED value                -> decides only in the proven direction; UNKNOWN as
                                a bare truth and under arithmetic (unchanged)
wrong name                   -> never answers another atom
permanent sentinel           -> -9223372036854775808 / 1000 exactly; nonzero;
                                compares as that number, no evaluator special case
```

Required, engine (`tests/unit/m11b4-aura-gain-history.test.ts`):

```text
gainHistoryAt                -> last APPLIED / REFRESHED, the stack losses since,
                                in order; REMOVED is never a gain; ANY_SOURCE is
                                UNSUPPORTED_DERIVATION; nothing at or after the
                                position is consulted
continuity FROM the gain     -> a coverage gap between the gain and a later stack
                                loss is UNKNOWN even where presenceAt is ACTIVE;
                                an unowned transition in the interval is UNKNOWN
transitionsWithinBefore      -> leads 0, 1, 20, 50 returned at a 50 ms window,
                                51 not (inclusive both edges); by report time,
                                not adjacency; nothing at or after the position
```

Required, duration authority (`tests/unit/m11b4-blood-aura-durations.test.ts`):

```text
committed artifact           -> validates; commit, build, MILLISECONDS, source
                                hashes shared with the DoT artifact and the aura
                                identities; Bone Shield 30 s, Essence 20 s + 5 s
                                (label modifier from the Blood specialization
                                passive, with provenance) = 25 s, Crimson 15 s,
                                Visceral 12 s, Vampiric Strike PERMANENT
validator refuses            -> any other remains model, any other unit, Essence
                                without its modifier, a final duration that does
                                not follow from base plus modifiers, a
                                build-dependent / percentage / fractional
                                modifier, a permanent aura with a duration, a
                                DURATION aura with pandemic or periodic facts, a
                                derived field baked in, a duplicate atom
extractor matchers           -> class-flag match needs the same family and an
                                overlapping word; label match needs the label;
                                a MAX_STACKS modifier is not a duration modifier
```

Required, Blood (`tests/unit/m11b4-blood-aura-remains.test.ts`):

```text
exact                        -> apply, stack gain and lone refresh each start the
                                full pinned duration; stack losses are walked
                                through without moving the expiry; one /1000
zero                         -> an observed full removal; a build proof; never
                                silence (Bone Shield's silence is UNKNOWN)
permanent                    -> Vampiric Strike ACTIVE binds the sentinel,
                                INACTIVE binds 0
ambiguous refresh            -> a refreshbuff beside a stack REMOVAL yields only
                                the lower bound from the earlier gain; the bound
                                still decides `<1.5` and `<3` FALSE; an expired
                                bound is UNKNOWN (no inference from the aura
                                still being active); beside a stack GAIN it is
                                an ordinary companion
contradiction                -> an expired remainder while ACTIVE is UNKNOWN,
                                never clamped to zero
coverage                     -> a gap from the gain is UNKNOWN though presence is
                                ACTIVE; a later removal is never consulted
pre-decision window          -> leads 0, 1, 20 and 50 refuse .up, .stack and
                                .remains alike with the lead recorded; 51 binds;
                                a removal inside the window is refused too
threshold tolerance          -> exact values at threshold ±49 ms and at the
                                threshold refuse with the margin; ±51 bind; only
                                the atom's own pinned thresholds (none for the
                                bare-truth atoms); a bound is never subject to it
thresholds                   -> read off the parsed authority: Bone Shield 1.5
                                and 3, Essence 1.5 and 8; Vampiric Strike is
                                bare-truth only at the pinned revision
corpus                       -> the pull Death's Caress refused at lead 20; a
                                Vampiric Strike's Essence refused at lead 0; the
                                Death Strike at 2,012,014 binds Essence exact
                                24,127 ms and Bone Shield bounded 25,742 ms
expiry-consistency audit     -> every natural expiry of Essence and Visceral
                                Strength in the bundle falls within 50 ms of the
                                pinned duration after its last gain (measured:
                                +6, +12, +11, +8, +1, -7, -1 ms) — validation of
                                the pinned durations from FUTURE events, never a
                                decision-time input
```

Failure mode this prevents:

A remainder that is a timer rather than a proof — counted from the wrong
transition, through a gap in which a refresh was missed, from the decision's
own effect logged ahead of it, from a duration typed from the table rather
than resolved as SimulationCraft resolves it, or clamped to zero when the
model and the evidence disagree — reaching a `remains<1.5` gate as a
confident verdict.

---

# Runic Power State Tests (M11-B5)

A resource state carried to a decision is a sequence of READ observed
states under proven coverage, never a ledger. The tests must prove that the
carried value is a number the wire wrote, that a costed cast leaves the
state unread until the next observation, that a gain 0-1 ms ahead of the
decision yields only the bound both readings share, and that every gap,
contradiction and unpinned shape refuses.

Required, wire contract (`tests/unit/m11b5-resource-post-change-contract.test.ts`):

```text
resourcechange attachment of the
  changed type                 -> POST_CHANGE; a second pool's attachment on the
                                same event EVENT_ASSOCIATED; casts unchanged
timing enumeration           -> PRE_COST, POST_CHANGE, EVENT_ASSOCIATED; no
                                POST_COST, no PRE_CHANGE
whole-window reconciliation  -> carrying the latest read amount reproduces every
                                later PRE_COST and uncosted amount (bundle 44 +
                                147, opener 6 + 28) with zero hidden changes;
                                integer gains sum exactly, cap events read the
                                max, Anti-Magic Shell gains show a rounded delta
                                beside an exact attachment — VALIDATION from
                                later events, never an input to an earlier state
```

Required, engine (`tests/unit/m11b5-resource-history.test.ts`):

```text
resourceHistoryAt            -> the latest attached observation with its tag;
                                every observation since, each with its own
                                amount and the change's SIGN only; a change
                                without an attachment of its type is listed,
                                not resolved
continuity FROM the anchor   -> a RESOURCES gap is UNKNOWN where
                                latestObservedAtOrBefore is STALE; an
                                unattributed snapshot in the interval is UNKNOWN
observationsWithinBefore     -> leads 0, 1, 2 at windows 0, 1, 2 (inclusive);
                                nothing at or after the position
no synthesized state         -> no entry carries prev + delta anywhere
```

Required, Blood (`tests/unit/m11b5-blood-runic-power-state.test.ts`):

```text
OWN_PRE_COST                 -> the decision's own costed cast, unchanged
CARRIED_EXACT                -> a POST_CHANGE anchor, an uncosted melee snapshot,
                                through Runic Attenuation, Blood Mist, a
                                fractional Anti-Magic Shell gain and a cap —
                                each the READ amount; deficit = (max - amount)/10
after a costed cast          -> POST_SPEND_NOT_OBSERVED until an observation;
                                the first observation after it is the state
                                (640 read, never 990 - 450 or 990 - 350)
window                       -> leads 0 and 1 bound the deficit below from the
                                last non-negative amount; lead 2 is an ordinary
                                exact carry; several window gains bound from the
                                last; a costed cast or negative change inside
                                refuses; the bound holds even after a spend
numeric                      -> the bound proves deficit<20, <36, <40 FALSE and
                                never TRUE; the binding is the existing
                                BOUNDED_NUMBER with no upper field
refusals                     -> no anchor; RESOURCES gap; CASTS gap; a snapshot
                                that disagrees with the carried state (never
                                re-anchored); a missing max; a changed max; a
                                change with no attachment of its type
source guard                 -> the Blood module never mentions resourceChange,
                                observedCost, or a cost subtraction
corpus                       -> principal gains AFTER their cast (68 of 68);
                                Heartbreaker and Relish in Blood 0-1 ms AHEAD
                                (87 of 87); the pull cast has no anchor; the
                                Heart Strike at 2,020,278 bounds at 930; the
                                Blood Boil at 2,021,775 is POST_SPEND
```

Failure mode this prevents:

A Runic Power value that was computed rather than read — `pre - cost` from a
wire cost the build does not pay, a delta summed where the game moved a
fraction, a state carried across a gap in which a spend was missed, or a
cast's own proc gain read as its pre-decision state — reaching the Death
Strike gate as a confident verdict, in either direction.

---

# Blood Debt Stack Tests (M11-B6)

A stack count is a number Warcraft Logs wrote on a transition, or the one
number the pinned module fixes for a fresh application. The tests must
prove that the count is read verbatim from the last stack-bearing
transition, that a plain application binds 1 only when the transition
before it is a removal or nothing, that an application to an aura already
held refuses, that a refresh, a gap, a window lead and a zero-valued stack
removal all refuse, and that no Death Strike cast ever adds a stack.

Required (`tests/unit/m11b6-blood-debt-stack.test.ts`):

```text
applybuffstack 2 / 7 / 10           -> exact 2 / 7 / 10, the absolute count, anchor recorded
first-transition applybuff          -> exact 1, EXACT_STACK_APPLICATION
removebuff then applybuff           -> exact 1, EXACT_STACK_APPLICATION
applybuff after applybuffstack 4    -> APPLICATION_WHILE_ACTIVE_UNPINNED (not 1, not 4, not 5)
applybuff after removebuffstack 3   -> APPLICATION_WHILE_ACTIVE_UNPINNED
applybuff after applybuff           -> APPLICATION_WHILE_ACTIVE_UNPINNED
removebuff                          -> exact 0, PROVEN_INACTIVE, no anchor
refreshbuff after the count         -> COUNT_AMBIGUOUS_SINCE_OBSERVATION
refreshbuff after the application   -> UNBOUND (the anchor is no longer the application)
removebuffstack 0                   -> UNBOUND (neither zero nor a count)
removebuffstack 3                   -> exact 3 (the M4 absolute-stack contract)
two Death Strikes, no transition    -> the count before them, unchanged
no prior transition                 -> AURA_STATE_UNKNOWN (silence is not zero)
AURAS gap after the anchor          -> AURA_STATE_UNKNOWN / INSUFFICIENT_COVERAGE
transition at lead 0 / 50 / 51 ms   -> refused / refused / bound (inclusive Blood window)
Bone Shield plain application       -> COUNT_AMBIGUOUS_SINCE_OBSERVATION / NO_STACK_OBSERVATION, as before
Essence ACTIVE                      -> AURA_ACTIVE_COUNT_NOT_RECONSTRUCTED, as before
source guard                        -> no `+ 1`, no `- 1`, no Math.min/max, no max-stack constant,
                                       no Death Strike id, no set-bonus or combatantinfo reading
```

Required, corpus (`SPEC_BLOOD_DEATH_KNIGHT.STACK_BINDING_AT`,
`STACK_EVIDENCE_CENSUS`, `BLOOD_DEBT_TRANSITION_CENSUS`): the count at the
pinned decisions (3 at 2,050,290; 10 at 2,035,940; 1 at 2,044,779 /
2,045,618 / 2,129,260 from the plain applications; 0 at 2,044,021; nothing
at 2,004,615 and at the opener's 2,421,923; 6 at the opener's 2,434,890),
the per-atom evidence census summing to the eligible population, and the
transition census with its retrospective walk (30 of 30 and 5 of 5
consistent, lags 10-49 / 18-53 ms behind the producing cast, no two
transitions in one millisecond, smallest gap to the next decision 702 /
711 ms). The walk runs in `tests/support/m11/blood-debt-census.ts`, outside
`src/`, and reads the future only to check the past.

Failure this prevents:

```text
A Blood Debt count that was computed rather than read — one more for a
Death Strike the cooldown "should" have let proc, one less for a Marrowrend
below the maximum, 1 for an application to an aura already held, zero from
a combatantinfo that lists no aura — reaching `buff.blood_debt.stack=10` as
a confident TRUE or FALSE, and a REJECTED at ten stacks built on a
Marrowrend usability nothing proved.
```

# Marrowrend Rune Affordability Tests (M11-B7)

A Rune count is a number the decision cast's own attached PRE_COST entry
wrote; a Rune cost is the pinned DBC row; a modifier is excluded by a
resolved hero tree. The tests must prove that Marrowrend is proven usable
from exactly those three things, in the positive direction only, for the
`marrowrend` token only, and that nothing is carried, regenerated,
subtracted, read off a neighbouring event or read off the wire's cost field.

Required (`tests/unit/m11b7-blood-rune-affordability.test.ts`):

```text
pinned record                        -> spell 195182, one Rune row at 2, every cooldown scalar 0, cast time 0
Exterminate record                   -> 441416 / 447954, effects 1136665 / 1146159, -50%, Deathbringer-owned
hero tree RESOLVED sanlayn           -> modifier excluded
hero tree UNKNOWN / CONTRADICTORY / deathbringer -> MODIFIER_UNPROVEN, proof withheld
own PRE_COST runes 2 / 3 / 6         -> OWN_PRE_COST_AFFORDABLE, marrowrend PROVEN_USABLE (sanlayn[4] and [7])
own PRE_COST runes 0 / 1             -> OWN_PRE_COST_BELOW_COST, usability UNKNOWN, never PROVEN_UNUSABLE
Death Strike / Blood Boil / free Heart Strike -> NO_RUNE_OBSERVATION, usability UNKNOWN
type-5 entry EVENT_ASSOCIATED        -> refused (uncosted attachment)
type-5 entry POST_CHANGE             -> refused (a resourcechange is not a cast's own PRE_COST)
same-ms aura, change, other actor at 6 -> the own cast's 1 is read; the same-ms Death Strike observes nothing
Heart Strike at 4, then Death Strike -> NO_RUNE_OBSERVATION (no carry: not 3, 4, 5 or 6)
Marrowrend at 4 cost 2, then Death Strike -> NO_RUNE_OBSERVATION (no ledger: not 2)
1 Rune, 30 s of silence, Death Strike -> NO_RUNE_OBSERVATION (no regeneration)
heart_strike / deaths_caress / any_dnd at 6 Runes -> UNKNOWN (the allowlist is the token literal)
4 Runes against wire cost 5          -> OWN_PRE_COST_AFFORDABLE at the pinned 2 (the wire's cost decides nothing)
record with cooldown / charge / internal / category cooldown, cast time, wrong spell, no Rune row
                                     -> AUTHORITY_NOT_PINNED, proof withheld (marrowrendPinOf; cache seam re-reads the committed shape)
hand-tagged AFFORDABLE fact          -> every conjunct re-checked; NO_RUNE_AFFORDABILITY and the pre-B7 call shape prove nothing
observed Marrowrend cast             -> PROVEN_USABLE ahead of the fact, as before
```

Required, contract (`tests/contracts/m11b2-blood-evaluator.test.ts`,
`m11b2-blood-registration.test.ts`): the seven REJECTED decisions
individually (2,039,813 / 2,040,797 / 2,042,440 at 4 Runes, 2,091,626 at 3,
2,113,271 at 5, 2,114,293 at 4, 2,115,379 at 3) — outcome, basis
`AUTHORITY_SELECTED_DIFFERENT_TOKEN`, token `marrowrend`, EXACT_ENTRY,
`sanlayn[7]` selected with no undecided GCD candidate, the affordability
fact, the own resource entry and its locator, Blood Debt exactly 10 from an
`applybuffstack` more than 5 s earlier; the five divergent decisions still
UNKNOWN with `DIVERGENT_GCD_OUTCOMES`; the nine no-observation Marrowrend
blockers still first-undecided on `USABILITY:marrowrend`; the 37 MATCH
report times unchanged; the census (52 / 4 / 67, counts 1 ×4 … 6 ×3); the
45 s view 15 / 3 / 30; the opener 1 / 0 / 20 with 11 / 10.

Required, corpus (`SPEC_BLOOD_DEATH_KNIGHT.RUNE_AFFORDABILITY_AT`,
`RUNE_AFFORDABILITY_CENSUS`, and `DECISION_COVERAGE` / `STACK_BINDING_AT`
/ `RESOURCE_OBSERVATION` at the seven): the fact at the pinned decisions
including the count's identity with the recorded own observation, two
divergent and two no-observation decisions, one below-cost decision, and the
censuses over the bundle and the opener.

Failure this prevents:

```text
A Marrowrend "usable" from a Rune count the decision did not observe — the
previous Heart Strike's 4, that 4 minus its cost, that 4 plus a regeneration
guess, a neighbouring event's number — or from the wire's cost field, or
under a Deathbringer build where the row is not the cost; or, in the other
direction, an INSUFFICIENT_RESOURCE at 1 Rune that no owner decision
authorised. Either one would be a REJECTED (or a MATCH) built on state the
log never wrote.
```

---

# Essence of the Blood Queen Remains Tests (M11-B8)

A lone `refreshbuff` of Essence of the Blood Queen is an exact observation
that the aura was refreshed and no evidence of what refreshed it: the pinned
module has one producer, and the wire carries refreshes that producer cannot
have written. The tests must prove that no lone refresh becomes an exact
expiry — whatever cast or aura edge sits beside it — that the earlier proven
expiry survives only as a floor and runs out honestly, that inside the 50 ms
pre-decision window only the floor both orderings share is bound and never
an ordering chosen, and that nothing else in the aura layer moved.

Required (`tests/unit/m11b8-blood-ebq-remains.test.ts`):

```text
policy table                          -> Essence: loneRefresh UNPROVEN_CAUSE, windowOrderInvariantBound true; every other identity: PINNED_TRIGGER_RESET, false
constants                             -> window 50, tolerance 50, Essence 20,000 + 5,000 = 25,000 ms, thresholds [1.5, 8]
exact gain, lone refresh, before old expiry -> GAIN_ANCHOR_BOUNDED from the gain (never the refresh's 25 s), BOUNDED_NUMBER
the same refresh 0-1 ms before a Vampiric Strike -> the same floor (cast proximity names no cause)
lone refresh, decision past the old expiry -> AMBIGUOUS_REFRESH_BEYOND_BASE_DURATION; presence still ACTIVE
consecutive lone refreshes           -> walked back to the last anchoring gain, floor from it
applybuffstack + same-ms refreshbuff -> GAIN_ANCHOR_EXACT from the gain (the companion invalidates nothing)
applybuffstack, refreshbuff 1 ms later -> the gain anchors, the refresh keeps it as a floor
lone refresh with no earlier gain    -> NO_GAIN_OBSERVED
Bone Shield / Crimson Scourge / Visceral Strength lone refresh -> GAIN_ANCHOR_EXACT, unchanged
window cluster (stack gain + refresh) at lead 0 / 1 / 50 -> WINDOW_ORDER_INVARIANT_BOUNDED, remainsMs = min(H1, H2), both worlds recorded, .stack still refused
lead 51                              -> the ordinary path (GAIN_ANCHOR_EXACT), G2 does not apply
lone refresh in the cluster          -> the floor is the chain before it
H1 = 1,200 ms, H2 = 25,000 ms         -> atLeast 1.2 s (the minimum, never the larger world)
H1 from a bounded chain              -> a valid floor, beforeClusterProof GAIN_ANCHOR_BOUNDED
plain applybuff in the cluster (fresh, or after a removal) -> PRE_DECISION_WINDOW_TRANSITION
removebuff / removebuffstack in the cluster -> PRE_DECISION_WINDOW_TRANSITION
safe shape beside an unsafe one       -> refused whole
H1: ambiguous initial state / run out past a lone refresh / contradiction / AURAS gap -> refused, the reason carried in detail
the shared floor has run out         -> refused
edge 1,451-1,549 ms or 7,950-8,050 ms -> WITHIN_TIMING_TOLERANCE_OF_THRESHOLD with the margin; 1,449 / 1,551 / 7,949 / 8,051 bind
Bone Shield cluster inside the window -> refused (the policy does not admit the bound)
EXACT_COUNT_ATOMS                     -> no Essence; ACTIVE binds no positive count
committed 2,087,470                   -> floor 11,070 (H1 from the application at 2,073,540, H2 25,000), count refused
committed 2,093,667                   -> floor 18,803 past a 1 ms lead cluster (applybuffstack 3 + refresh), H2 24,999
committed 2,020,278                   -> GAIN_ANCHOR_BOUNDED 21,996 from the stack gain at 2,017,274, three lone refreshes walked through (two beside Vampiric Strikes, one at the Gift removal)
committed 2,012,014                   -> still EXACT 24,127 from the companion refresh at 2,011,141
committed 2,042,440                   -> AMBIGUOUS_REFRESH_BEYOND_BASE_DURATION (still REJECTED on other evidence)
committed opener 2,429,596            -> GAIN_ANCHOR_BOUNDED 23,499 from the stack gain at 2,428,095 (the refresh at the Gift removal anchors nothing)
```

Required, contract (`tests/contracts/m11b2-blood-evaluator.test.ts`): 37 /
9 / 77 with 148 excluded; the nine REJECTED individually (B7's seven plus
2,087,470 and 2,093,667 at 3 Runes each, Blood Debt 10 from 2,086,445) —
outcome, basis, token `marrowrend`, EXACT_ENTRY, no undecided GCD
candidate; the three still-divergent; the first-obstacle map; the Essence
census (24 / 40 / 32 / 20 / 6 / 1) and the window-refusal census (remains
lead 0: 6; stack unchanged at 23 + 3); on every binding: an order-invariant
floor is Essence's, a BOUNDED_NUMBER, equal to `min(H1, H2)`, positive,
over a cluster of leads 0..50 holding no removal, and every other proof
carries no `windowOrderInvariance`; the precision split 33 / 4; the opener
1 / 0 / 20 with its census (6 / 7 / 6 / 1 / 1).

Required, corpus (`SPEC_BLOOD_DEATH_KNIGHT.REMAINS_BINDING_AT` with
`windowOrderInvariance`; `DECISION_COVERAGE`, `STACK_BINDING_AT`,
`RUNIC_POWER_STATE_AT`, `RUNE_AFFORDABILITY_AT`, `RESOURCE_OBSERVATION`,
`AURA_BINDING_AT` at the two new REJECTED; `DECISION_COVERAGE` at
2,029,599 as EXACT_ENTRY; `REMAINS_EVIDENCE_CENSUS`,
`STOPPING_POINT_DISTRIBUTION` and `COVERAGE_SUMMARY` re-pinned over the
bundle and the opener): the case
`spec-blood-death-knight.essence-lone-refreshes-anchor-nothing-and-the-window-bound-is-the-floor-both-orderings-share`.

Failure this prevents:

```text
An exact Essence remainder anchored on a refresh the pinned module never
produced — the one at a Gift of the San'layn edge — feeding a confident
`remains<1.5` or `remains<8` into a REJECTED; or the same refresh
"identified" as a Vampiric Strike trigger because a Vampiric Strike sits
1 ms after it; or, inside the window, one ordering picked because it
resolves more decisions. Each is a verdict on state the authority did not
establish. Equally: a floor of 1.2 s lifted to 25 s because the other world
was larger, or an edge 30 ms above 1.5 s deciding `remains<1.5`.
```

---

# Essence of the Blood Queen Stack Tests (M11-B9)

A positive Essence count is a number the wire wrote in an `applybuffstack`
or the pinned 1 of a fresh `applybuff`; its maximum is the DBC row plus a
modifier the observed talent tree proves; inside the pre-decision window it
is BOTH of the two exact counts the orderings leave, handed to the shared
evaluator as a finite set it may only decide unanimously. The tests must
prove that nothing is counted, incremented, carried across a lone refresh,
read off a count to establish the maximum it is then checked against, or
narrowed to one ordering.

Required (`tests/unit/simc-expression-one-of-numbers.test.ts`):

```text
oneOfNumbers([6,5,6])                -> { ONE_OF_NUMBERS, values [5,6] }; same content, same representation
oneOfNumbers([7,7]) / ([3])          -> KNOWN_NUMBER (a set of one is not a set); [] throws
{5,6} < 7 / {4,5} < 7                -> TRUE;  {6,7} < 7 -> UNRESOLVED;  {7,8} < 7 -> FALSE
{1,2} >= 1 -> TRUE; {0,1} >= 1 -> UNRESOLVED; <=, >, = both ways; !( {0,1} = 0 ) -> UNRESOLVED (the parser refuses !=)
7 > {5,6} -> TRUE; 7 > {6,7} -> UNRESOLVED (mirror operand order)
{5,7} < 6 and > 6 -> UNRESOLVED (never min or max); {5,7} = 6 -> FALSE (nothing between members)
set vs set, set vs bound             -> UNRESOLVED
truth: {1,2} TRUE, {0,1} UNRESOLVED, !{0,1} UNRESOLVED; FALSE & {0,1} FALSE, TRUE | {0,1} TRUE
{5,6}+1, *2, 8-{5,6}, {5,6}+{5,6}    -> UNRESOLVED (arithmetic refuses)
trace                                -> binding ONE_OF, value null, atLeast null, oneOf [5,6] sorted; a plain number traces as before with no oneOf key
knownBuffStacks stack: knownNumber(n) -> read as n; absent -> UNRESOLVED, never zero
```

Required (`tests/unit/m11b9-blood-ebq-stack.test.ts`):

```text
talent artifact                      -> frenzied_bloodthirst: HERO, node 95065, entry 117662, spell 434075, NORMAL, no alternative; trait_data.inc hash pinned; in the sanlayn sub-tree
max-stack modifier                   -> effect 1123818, +2, label 3134, claims against the hashed spell/trait/module sources; none for Bone Shield / Blood Debt
effective maximum                    -> 7 with the talent SELECTED (tree resolved or not); UNKNOWN when UNRESOLVED or unmodelled; 5 under a Deathbringer tree; the base when no modifier exists
both committed subjects              -> SELECTED / OWN_ENTRY_SELECTED / 117662, tree RESOLVED sanlayn; a tree without the node -> UNKNOWN NODE_ABSENT
identity switches                    -> Essence { 1, guard on, set on }; every other exact-count identity both off; the window is 50
applybuff -> 1; applybuffstack 2..7 -> N; removebuff -> 0; application while held refused
exact count, lone refresh, later decision -> COUNT_AMBIGUOUS_SINCE_OBSERVATION, near or far from a Vampiric Strike; the remainder is still a floor
6 / 7 under SELECTED -> bind; 8 -> COUNT_EXCEEDS_PINNED_MAX; 6 under UNRESOLVED or unmodelled -> COUNT_EXCEEDS_PINNED_MAX (unproven); 5 -> binds
Bone Shield 12, Blood Debt 11        -> bind (no guard for them)
window cluster at lead 0 / 1 / 50    -> BOUND_SET { H1, H2 } with both worlds; .up still refused; the seam receives ONE_OF_NUMBERS
lead 51                              -> the ordinary exact count
{5,6}, {4,5}, {6,7}                  -> sets as such (the evaluator decides)
fresh application after an OBSERVED removal -> { 0,1 } anchored on the removal; while held -> refused
first application in the track (no prior EBQ transition) at lead 0 / 1 / 50 -> refused, detail names AMBIGUOUS_INITIAL_STATE, no ONE_OF reaches the seam (no aura event != aura inactive)
lone refresh in the cluster, refresh 1 ms after the gain, removal, stack removal, mixed cluster, two gains -> refused
no count before the cluster; a lone refresh before the cluster (Q2) -> refused
a world above the maximum, or above 5 under an unresolved talent -> COUNT_EXCEEDS_PINNED_MAX
Bone Shield / Blood Debt clusters    -> refused (no set for them)
committed: 2,015,029 { 5,6 } from 2,012,773; 2,103,820 { 4,5 }; 2,105,703 { 5,6 } at lead 1; 2,017,274 and 2,106,638 { 6,7 }; 2,101,867 refused across 2,099,885; 2,015,770 exact 6; 2,104,758 exact 5; 2,084,304 exact 1 (application); 2,100,867 and 2,111,469 ambiguous; 45 s 2,008,597 refused (the track's first application; AMBIGUOUS_INITIAL_STATE before it) and 2,020,278 ambiguous; opener 2,425,025 { 5,6 }, 2,428,096 refused, 2,418,659 refused (first application)
```

Required, contract (`tests/contracts/m11b2-blood-evaluator.test.ts`,
`m11b2-blood-registration.test.ts`): 40 / 9 / 74 with 148 excluded; the
three MATCH individually — outcome, basis, token `heart_strike`,
EXACT_ENTRY, `san_gift` entered, no undecided GCD candidate, the set with
its anchor, leads and both worlds every member below 7, the Essence floor
above 1.5 s, Crimson Scourge down, the deficit floor at or above 36, Gift
up; 2,017,274 and 2,106,638 UNKNOWN on the stack atom with { 6,7 };
2,101,867 UNKNOWN naming 2,099,885; 2,015,770 and 2,104,758 exact and on
Heart Strike's usability; the modifier talent SELECTED by entry 117662; no
bound count above 7 and no maximum refusal on the build; the B6 MATCH set
plus the B9 three; the stack census (15 / 9 / 12 / 72 / 14 / 1; every set
two sorted exact members); the first-obstacle map; the 45 s view 16 / 3 /
29 with the same three REJECTED.

Required, corpus (`SPEC_BLOOD_DEATH_KNIGHT.STACK_BINDING_AT` with
`possibleStacks` and `windowOrderInvariance`; `DECISION_COVERAGE`,
`REMAINS_BINDING_AT`, `RUNIC_POWER_STATE_AT` at the three MATCH;
`BUILD_RESOLUTION` with `frenzied_bloodthirst`; `STACK_EVIDENCE_CENSUS`,
`STOPPING_POINT_DISTRIBUTION`, `COVERAGE_SUMMARY` and the window-refusal
census re-pinned over the bundle and the opener): the case
`spec-blood-death-knight.essence-stacks-are-the-wires-absolute-counts-and-a-set-of-two-inside-the-window`.

Failure this prevents:

```text
An Essence count of 7 read as proof that Frenzied Bloodthirst is taken, and
that proof then used to accept the 7; a `stack<7` decided TRUE because the
count "was probably still 5" when the log wrote 6 at the cast's own
millisecond; a { 6,7 } narrowed to whichever member the list prefers; a
count of 3 carried across a refresh nobody explained so that a Vampiric
Strike MATCHes at 2,101,867; a { 0,1 } at 2,008,597 whose zero world is
nothing but the absence of any earlier Essence event in the capture; or a
Bone Shield 12 refused against an artifact maximum nobody pinned for it. Each is a verdict on state the
authority did not establish.
```

---

# Bone Shield Window Tests (M11-B10)

Inside the 50 ms pre-decision window a Bone Shield count is EVERY exact
value the decision's position among the aura's own gains leaves — the
ordinary exact count before the cluster and each gain's absolute count in
order, handed to the shared evaluator as `ONE_OF_NUMBERS`; the presence
is M4's reading on BOTH sides of that cluster; the remainder is the
M11-B8 floor, algorithm untouched. The tests must prove that no
intermediate world is dropped, no ordering is chosen, no count is added,
no presence comes from a count or from silence, no plain application
binds a count the producer does not pin, no removal or lone refresh is
read through, and nothing else moves.

Required (`tests/unit/m11b10-blood-bone-shield-window.test.ts`):

```text
identity                              -> exactCount { null, guard off, set on }; remainsPolicy { PINNED_TRIGGER_RESET, bound on }; presencePolicy { on }; no other identity's presence policy is on; window 50, duration 30,000, artifact max 10
1 / 2 / 3 gains at leads 0 / 1 / 50   -> BOUND_SET { H1, c1, ..., cn }, anchor on H1's observation, both ends recorded, every cluster lead equal, the seam receives ONE_OF_NUMBERS with the whole set
three gains from 7                    -> { 7,8,9,10 }, never { 7,10 }
51 ms                                 -> the ordinary exact count, OBSERVED presence, GAIN_ANCHOR_EXACT remainder
gains without companions              -> the same set (companions permitted, not required)
a Death's Caress gain 9 -> 11         -> { 9,11 }; no 10 invented
H1 from applybuffstack / removebuffstack / a companion-refreshed gain -> bound, anchored there
H1 across a lone refresh              -> refused (COUNT_AMBIGUOUS_SINCE_OBSERVATION named), nothing reaches the seam
H1 from silence (first gain in track) -> refused, AMBIGUOUS_INITIAL_STATE named
non-ascending gains; first gain not above H1 -> refused (stack and presence)
removal (plain, stack, mixed with a gain); lone refresh; refresh 1 ms after the gain; plain application beside a gain -> refused (stack, presence, and remains where a removal sits)
first Bone Shield application in the track inside the window -> stack refused (no application count pinned), presence refused (plain application), remains refused; nothing at either seam
proven removal, then a plain application inside the window -> still no count (the producer's number is not pinned); presence refused
outside the window a plain application -> NO_STACK_OBSERVATION (M11-B2 unchanged)
presence ACTIVE / ACTIVE               -> up TRUE, WINDOW_ORDER_INVARIANT_PRESENCE, anchored on the before-side, "under every ordering the aura is ACTIVE"
before-side AMBIGUOUS_INITIAL_STATE    -> refused, auraReason and detail name it
INACTIVE before a plain application    -> refused (the orderings disagree)
a nested window                        -> the outer cluster binds { 5,6,7 } and the presence; the inner decision binds { 5,6 }
Essence presence inside its window     -> still refused (the policy is Bone Shield's); its stack set unchanged
remains                                -> min(H1 projected, 30,000 - lead) as BOUNDED_NUMBER; H1 below the reset gives H1's projection; within 50 ms of 1.5 s / 3 s -> WITHIN_TIMING_TOLERANCE_OF_THRESHOLD
evaluator over { 7,8,9,10 }            -> !up | remains<1.5 | stack<=1 FALSE; stack<6 FALSE
evaluator over { 4,5,6,7 }             -> stack<6 UNRESOLVED; stack<=1 FALSE; up TRUE; sanlayn[0] FALSE
evaluator over { 1,2 }                 -> stack<=1 UNRESOLVED; sanlayn[0] UNRESOLVED
Blood Debt                             -> a gain inside the window still refused (stack and presence); exact outside it
committed                              -> 2,043,209 { 7,8,9,10 } floor 2,572 from 2,038,654; 2,057,622 { 11,12 } 15,607; 2,085,352 { 8,9,10,11 } 2,270; 2,124,183 { 8,9,10,11 } 5,702; 2,151,502 { 6,7,8,9 } 2,716; 2,164,444 { 9,11 } 17,058; 2,015,770 { 5,6,7,8 } 21,986 — each presence order-invariant ACTIVE; 2,004,615 refused everywhere at lead 20; 2,044,021 ambiguous naming 2,043,229 with OBSERVED presence; no window refusal on either subject is a removal; opener 2,427,294 { 7,9 }, presence, floor 19,726
```

Required, re-pinned: `m11b2-blood-bindings` (the same-millisecond
Marrowrend binds { 5,6,7 } and the presence, never 7 alone, never 5
alone); `m11b4-blood-aura-remains` (at leads 0 / 1 / 20 / 50 the window
binds only order-invariant state — presence, set, floor 26,000 — and
never an exact read); `m11b6-blood-debt-stack` (Bone Shield's set switch
on, application count still null, guard still off); `m11b8-blood-ebq-remains`
(Essence and Bone Shield admit the bound, every other identity keeps
B4's reading; a Bone Shield cluster binds the same floor Essence would;
Crimson Scourge stays refused); `m11b9-blood-ebq-stack` (a two-gain
Essence cluster is { H1, c1, c2 } and a descending one refuses; a Bone
Shield cluster binds its own set; Blood Debt's stays refused).

Required, contract (`tests/contracts/m11b2-blood-evaluator.test.ts`,
`m11b2-blood-registration.test.ts`): 42 / 9 / 72 with 148 excluded and
`marrowrend: 2` among the matched tokens, EXACT_ENTRY 38; the two MATCH
individually — outcome, basis, token, precision, the sanlayn run entered
and the Gift run skipped, no undecided candidate, the set with H1's
`removebuffstack` anchor and both ends, the five-transition cluster at
lead 0, every member above 1 and at or above 6, the presence proof, the
floor, `vampiric_strike.remains` proven zero, the Essence remainder a
floor or UNKNOWN, Runic Power bound, Crimson Scourge and Boiling Point
down, Blood Debt exactly 10, the Gift down; the four still-UNKNOWN with
Bone Shield passed (no candidate names a Bone Shield atom; the first
candidate is `sanlayn[9] death_strike` or `sanlayn[2] death_strike`);
2,044,021 on `sanlayn[0] | buff.bone_shield.stack` alone; 2,004,615
refused at lead 20; no set rests on a removal; the B6, B9 and B10 MATCH
sets; the stack census (114 / 7 / 1 / 1 with every set ascending from H1
to the last gain and one member per gain plus one), the remains census
(11 / 104 / 7 / 1), the window-refusal census (only the 20 ms first
application), the first-obstacle map (`sanlayn[0]` 7 → 1); the 45 s view
17 / 3 / 28 with the same three REJECTED; the opener's remains census (the
one window cluster a floor).

Required, corpus (`SPEC_BLOOD_DEATH_KNIGHT.AURA_BINDING_AT` admits
`WINDOW_ORDER_INVARIANT_PRESENCE`; `STACK_BINDING_AT` sets of two to four
members; `REMAINS_BINDING_AT` floors; `DECISION_COVERAGE`,
`DISPATCH_SEQUENCE`, `RUNE_AFFORDABILITY_AT` at the two MATCH;
`STACK_EVIDENCE_CENSUS`, `STOPPING_POINT_DISTRIBUTION`, `COVERAGE_SUMMARY`
and the window-refusal census re-pinned over the bundle and the opener;
the B4 case's 2,015,770 pins re-pointed to the set, the presence and the
floor): the case
`spec-blood-death-knight.bone-shield-is-every-exact-count-its-own-gains-leave-and-the-presence-proven-on-both-sides`.

Failure this prevents:

```text
A Marrowrend at 7 stacks read as "10" because its own three gains sit
ahead of it in the array, or as "7" because someone decided they came
after; a { 7,10 } that forgot the decision could sit between the first
gain and the second; `buff.bone_shield.up` TRUE because a count was
positive, or because the log had no earlier Bone Shield event; a Death's
Caress at 9 stacks given a "10" nobody wrote; a { 0,2 } for a first-seen
application from a producer whose number is not pinned; a
`removebuffstack` inside the window read as an ordering hazard it is not;
or a maximum of 12 asserted from the 12 the wire happened to show. Each is
a verdict on state the authority did not establish.
```

---

# Spec-Owned Resolver Tests

When a specialization supplies a resolver:

Test that:

- Shared APL infrastructure invokes it
- The resolver receives expected state
- Other specs cannot accidentally use it
- Resolver failure becomes UNKNOWN/UNSUPPORTED
- Shared APL code does not require hard-coded spec-name branches

---

# Missing Talent Data Test

Required negative test.

Scenario:

APL condition:

```text
talent.some_talent.enabled
```

Combatant/talent data is absent or incomplete.

Expected:

```text
UNKNOWN
```

Not:

```text
false
```

The analyzer must not select the untalented APL branch merely because talent
data is missing.

---

# APL Evaluation Tests

Given known state and supported syntax, test the recommended action.

Example conceptual state:

```text
energy = known
comboPoints = known
deathmarkReady = true
targetAvailable = true
requiredBuff = active
```

Expected:

The action selected by the imported supported APL.

Do not use top-log behavior as the expected answer for APL correctness.

---

# APL Trace Tests

Important decisions should preserve explainability.

Where practical verify:

- Recommended action
- Authority
- APL line/rule
- Conditions evaluated
- Conditions true
- Conditions false
- Conditions unknown
- Relevant state
- Alternative actions considered

This allows:

```text
Why did the analyzer recommend this?
```

to be answered structurally.

---

# Predictive State Tests

APL state uses the common classification:

```text
OBSERVABLE
DERIVABLE
PREDICTIVE
SIM_ONLY
UNSUPPORTED
```

Test that each required expression is classified, and that classification drives
behavior rather than being decorative.

Expressions such as:

```text
fight_remains
target.time_to_die
```

are PREDICTIVE and must not silently use actual future outcome for player blame.

Scenario:

Actual fight end is known from the completed log.

Player at an earlier timestamp could not know the exact end.

If the predictive condition materially controls the recommendation and no
player-knowable estimate exists:

Expected:

```text
UNKNOWN
```

Not:

```text
use exact observed future death time
```

---

# Hindsight Regression

Scenario:

Boss dies at 6:42.

APL branch says:

```text
use cooldown if fight_remains < 30
```

At 6:15 the completed log reveals 27 seconds remain.

Expected:

Do not produce a player-failure finding solely because the post-fight analyzer
knows the exact future.

The result should follow the configured predictive-state policy.

---

# Decision-Point Tests

Decision-point logic must receive dedicated tests.

Test:

- GCD becomes available
- Cast begins
- Cast ends
- Channel begins
- Channel ends
- Proc occurs
- Cooldown becomes available
- Target becomes available
- Encounter resumes

---

# No Fake Idle During Cast Test

Scenario:

Player is casting/channeling during an interval.

Expected:

The analyzer does not generate idle-GCD opportunities inside that interval.

---

# GCD Overlap Tests

Test:

- Normal GCD
- Haste-modified GCD where applicable
- Cast ending near GCD end
- Queue/tolerance window
- Back-to-back instant casts

Avoid artificial tiny gaps.

---

# Timing Tolerance Tests

Timing tolerance should be configurable by finding category.

Test:

```text
0.05 sec delay
0.2 sec delay
0.8 sec delay
2 sec delay
```

Expected behavior should be category-dependent.

Do not hard-code:

```text
any non-zero delay = mistake
```

---

# Small-Delay Aggregation Test

Scenario:

Player has fifteen tiny delays that each fall within a small coaching threshold
but collectively indicate a recurring pattern.

Expected:

Prefer one aggregate finding where appropriate.

Do not emit fifteen nearly identical TLDR-level findings.

---

# Actionability Tests

Test:

```text
ACTIONABLE
NOT_ACTIONABLE
UNKNOWN
```

Possible direct reasons include:

- PLAYER_DEAD
- TARGET_UNAVAILABLE
- INTERMISSION
- FORCED_DOWNTIME
- PHASE_TRANSITION
- ENCOUNTER_END

Every NOT_ACTIONABLE result should have evidence.

Every ACTIONABLE result should have evidence too.

---

# ACTIONABLE Requires Evidence Regression

Required negative regression.

`ACTIONABLE` must not be the default merely because no restriction was
observed.

Scenario:

```text
encounterEvents completeness:  ABSENT
targetability completeness:    ABSENT
APL recommends Ability X
player does not cast Ability X
```

Expected:

```text
actionability = UNKNOWN
```

Not:

```text
actionability = ACTIONABLE
status = INCORRECT
```

`ACTIONABLE` requires either sufficient positive environmental evidence, or
`COMPLETE` coverage of the environmental state that decision depends on.

Required regression name:

```text
absent_targetability_data_does_not_default_to_actionable
```

Also test the partial case:

```text
targetability completeness: PARTIAL over the interval in question
```

Expected:

```text
actionability = UNKNOWN
```

Failure mode this prevents:

An encounter with no retrieved environmental data resolves every decision point
to ACTIONABLE, and a real 30-second intermission becomes a dozen confident
rotational findings. Every other intermission test in this document supplies the
evidence, so none of them catch this path.

---

# Intermission Regression

Required architectural regression.

Scenario:

APL recommends Ability X.

Encounter becomes non-actionable for 30 seconds.

Player does not cast Ability X.

Expected:

No 30-second rotational failure.

If:

```text
theoreticalReadyTime = 124000
intermission = 123000 -> 153000
playerCastTime = 154000
```

then effective actionable delay is approximately:

```text
1 second
```

not:

```text
30 seconds
```

---

# Direct Encounter Evidence Test

Scenario:

WCL targetability/phase data proves boss is unavailable.

No comparison logs are available.

Expected:

```text
NOT_ACTIONABLE
```

Comparison logs are not required when direct evidence is sufficient.

---

# Movement Negative Test

Scenario:

Player did not cast an ability.

No reliable movement evidence exists.

Expected:

Do not suppress using:

```text
MOVEMENT_CONSTRAINT
```

merely because movement is plausible.

Use UNKNOWN if required.

---

# Spec-Specific Actionability Tests

Specialization evaluators may refine shared actionability.

Example:

Assassination ability requires stealth state.

Test that:

- Shared environment knows target is available
- Assassination evaluator knows required stealth state
- Actionability becomes spec-aware without adding Rogue logic to generic
  actionability code

---

# Authority Resolution Tests

Authority must be tested per decision category.

Potential categories:

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

Actionability is not an authority category and must not be tested as one.

Test that actionability is applied as a modifier on an authority-backed
decision rather than resolving an authority of its own.

Preparation authority values:

```text
WCL_OBSERVED_FACT
RUNTIME_GAME_DATA
```

---

# Every Finding Has Authority Test

Every evaluative finding should record its authority.

A player-failure finding with:

```text
NO_AUTHORITY_AVAILABLE
```

must be invalid.

A preparation finding must record `WCL_OBSERVED_FACT` or `RUNTIME_GAME_DATA`.

It must not be dropped for lacking an authority, and must not invent one.

---

# UNKNOWN vs NO_AUTHORITY_AVAILABLE Contract Test

Required contract test.

These states are semantically distinct and must never be substituted for one
another.

Case A — no trustworthy standard exists:

```text
category = ASSIGNMENT
raid plan = absent
```

Expected:

```text
NO_AUTHORITY_AVAILABLE
```

Not:

```text
UNKNOWN
```

Case B — a standard exists but evidence is insufficient:

```text
category = ROTATION
authority = SIMC_APL (resolved)
talent data = ABSENT
```

Expected:

```text
UNKNOWN
```

Not:

```text
NO_AUTHORITY_AVAILABLE
```

Verify:

- Authority resolution yields only `RESOLVED` or `NO_AUTHORITY_AVAILABLE`
- `UNKNOWN` is produced only after an authority resolved
- Both states are preserved distinctly through findings and reporting
- Neither state produces a player-failure finding

Required regression:

```text
unknown_and_no_authority_are_not_interchangeable
```

---

# Runtime Authority Tests

Test that authority depends on available inputs.

Example healer:

Raid plan exists:

```text
ASSIGNMENT -> RAID_PLAN
```

Raid plan absent:

```text
ASSIGNMENT -> NO_AUTHORITY_AVAILABLE
```

Do not permanently assign:

```text
Restoration Shaman = RAID_PLAN
```

regardless of fight input.

---

# Specialization Evaluator Boundary Tests

Tests should protect:

```text
shared platform + spec-owned evaluation
```

A specialization evaluator should be able to use shared primitives.

Shared gameplay infrastructure should not contain:

```text
if spec == assassination
```

style logic.

When a bug requires spec-specific interpretation:

the test should live with or explicitly target that specialization evaluator.

---

# Shared Primitive Tests

Shared primitives may include:

- Aura uptime
- Resource intervals
- Resource waste amount
- Cast opportunities
- Cooldown drift
- GCD gaps
- Timing tolerance
- Evidence construction

Verify shared calculations behave consistently across callers.

This prevents 40 slightly different versions of the same math.

---

# Finding Contract Tests

Structured findings should preserve enough information for debugging.

Potential fields include:

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

Exact schema may evolve until stabilized.

---

# Finding Status Tests

Test supported result categories such as:

```text
CORRECT
INCORRECT
INFORMATIONAL
SUPPRESSED
NOT_ACTIONABLE
UNKNOWN
NO_AUTHORITY_AVAILABLE
```

Do not force every result into pass/fail.

---

# UNKNOWN Propagation Tests

UNKNOWN is a first-class state.

Required regression:

```text
resourceState = UNKNOWN
```

APL needs exact resource state.

Expected:

```text
decision = UNKNOWN
```

Do not convert UNKNOWN to:

- false
- true
- zero
- maximum
- empty array
- not active
- no target
- no talent

---

# UNKNOWN Scoring Negative Test

When scoring is eventually implemented:

Scenario:

Finding status:

```text
UNKNOWN
```

Expected:

It contributes no automatic negative score.

This invariant should exist before scoring itself is built.

---

# Comparison Validity Tests

Comparison selection should validate:

- Encounter
- Difficulty
- Specialization
- Player survival
- Fight participation
- Fight duration
- Build differences where relevant
- Composition where relevant
- Completeness

Rank alone is insufficient.

---

# Dead Comparison Player Regression

Scenario:

Comparison player dies well before encounter end.

Expected:

That parse is unsuitable for conclusions requiring full-fight participation.

Do not normalize partial participation as though it were a complete fight.

---

# Comparison Consensus Tests

Environmental comparison analysis should return:

```text
CONSENSUS
SPLIT
INSUFFICIENT
```

Test:

- Zero comparison logs
- One comparison log
- Multiple agreeing logs
- Multiple disagreeing logs
- Mixed valid/invalid logs

A single log must never equal consensus.

Exact numerical consensus thresholds should be configurable and validated with
real data.

---

# Top Logs Are Not Rotational Truth

Required regression.

Scenario:

SimC authority selects Ability A.

Several top logs use Ability B.

No environmental evidence makes Ability A non-actionable.

Expected:

The analyzer retains Ability A as the authority-backed recommendation.

Comparison behavior may be attached as context.

It does not replace the rotational authority.

---

# Top Logs Cannot Suppress By Similarity

Required negative regression.

Scenario:

SimC says Ability A should be used.

Player skips Ability A.

Six comparison players also skip it.

No environmental evidence explains the behavior.

Expected:

The finding remains.

Comparison similarity may:

- Add context

It may NOT:

```text
SUPPRESS
```

the finding merely because top players did the same thing.

---

# Comparison Cannot Reduce Confidence

Required negative regression.

Confidence represents evidence quality.

Comparison-player behavioral similarity by itself must not lower confidence.

Scenario:

```text
SimC authority selects Ability A
Player skips Ability A
Six valid comparison players also skip it
No environmental evidence
Evidence quality is otherwise unchanged
```

Expected:

```text
confidence unchanged
```

Not:

```text
confidence HIGH -> LOW
```

Required regression name:

```text
comparison_similarity_does_not_reduce_confidence
```

Also verify the finding is not removed from TLDR consideration as a side effect.

Confidence and actionability may change only when actual evidence justifies it,
such as environmental evidence, data completeness, or another legitimate
evidence-quality factor. Any such adjustment must record its evidence-based
reason.

Failure mode this prevents:

Once reporting deprioritizes low-confidence findings, lowering confidence is
functionally equivalent to suppression. Without this test, comparison behavior
becomes hidden rotational authority through the confidence/TLDR channel, while
the suppression test above still passes.

---

# Environmental Comparison Suppression Test

Scenario:

SimC recommends Ability A.

Player skips it.

Direct WCL evidence establishes:

```text
INTERMISSION
```

Comparison logs corroborate the same environmental pause.

Expected:

Finding may be:

```text
SUPPRESSED
```

or:

```text
NOT_ACTIONABLE
```

with a machine-readable environmental reason.

The suppression reason must not simply be:

```text
top players also skipped it
```

---

# Fight-Length Tests

Do not normalize all behavior solely by total fight duration.

Scenario:

Fight A:

```text
6:40
```

Fight B:

```text
5:20
```

Both contain the same 30-second forced intermission.

Expected:

That 30 seconds is recognized as non-actionable rather than treated as equal
rotational opportunity.

---

# Damage Diagnosis Tests

Aggregate performance differences must not automatically become causal coaching.

Scenario:

Comparison data shows:

```text
Rupture damage/minute is 30% lower
```

No decision-level evidence explains why.

Expected:

Allowed:

```text
INFORMATIONAL:
Rupture damage/minute was lower.
```

Not allowed:

```text
You failed to cast enough Ruptures.
```

unless supporting evidence establishes that cause.

---

# Numeric Delta Causality Regression

Required negative test:

```text
numeric performance delta
+
no causal decision evidence
```

must NOT produce:

```text
HIGH-confidence causal coaching
```

---

# Preparation Analysis Tests

Preparation analysis must have independent tests.

Potential categories:

- Health potion
- Healthstone
- Combat potion
- Enchants
- Gems
- Build context

Preparation findings do not require an APL decision point.

---

# Always-Report Consumables Test

For EVERY analysis report:

Always produce a status for:

- Health potion usage
- Healthstone usage
- Normal combat-potion usage

This applies regardless of whether the player died.

This applies regardless of whether gameplay support exists for the
specialization.

Example — complete coverage:

```text
player survived
healthPotionUses = 0
healthstoneUses = 0
combatPotionUses = 1
```

These facts should still appear.

Example — incomplete coverage:

```text
consumable event coverage = PARTIAL
```

Expected:

```text
status = UNKNOWN
```

Not:

```text
healthPotionUses = 0
```

and not:

```text
category omitted
```

The category must never be omitted. Do not confidently report zero when
coverage is `PARTIAL` or `ABSENT`.

---

# Preparation Runs Without a Specialization Evaluator

Required regression.

Preparation analysis is a parallel finding producer and must not depend on a
specialization evaluator having run.

Test that preparation findings are still produced when:

- the specialization is `SPEC_NOT_SUPPORTED`
- evaluation is blocked by `IDENTITY_CONFLICT`
- evaluation is blocked by `INCOMPATIBLE_DATA_VERSION`

Required regression name:

```text
preparation_findings_produced_without_spec_evaluator
```

---

# Unsupported Specialization Tests

Required contract and reporting tests.

Scenario:

```text
player specialization has no evaluator
```

Expected application-service result:

```text
SPEC_NOT_SUPPORTED
```

The report must:

- Clearly disclose that specialization gameplay analysis is unsupported
- Still include supported specialization-independent analysis such as
  preparation and other factual observations
- Be clearly labelled as partial coverage

The report must NOT:

```text
present as a normal, complete report containing zero gameplay findings
```

Required regression name:

```text
unsupported_spec_does_not_produce_empty_clean_report
```

Failure mode this prevents:

A well-formed report with no gameplay findings reads to a player as
confirmation of clean play. Absence of analysis is not evidence of good play.

---

# Racial Exclusion Test

Racial ability analysis is excluded from initial analysis.

Test that racial abilities do not appear in:

- rotation findings
- cooldown findings
- preparation findings
- coaching output
- scoring

Required regression name:

```text
racial_abilities_excluded_from_findings
```

This exclusion remains until the product owner intentionally enables that
scope.

---

# Reporting Cannot Invent Preparation Findings

The reporting layer must consume structured preparation findings.

Test that reporting does not independently scan raw WCL data and generate
preparation conclusions.

---

# Tank Tests

Tank analysis should separate offense from survival.

Test categories may include:

- Supported SimC rotational decision
- Defensive availability
- Defensive appropriateness
- Active mitigation
- Incoming tank damage
- Tank mechanic
- Tank swap
- Survival

Invariant:

```text
defensiveAvailable != defensiveRequired
```

---

# Defensive Negative Test

Scenario:

Defensive is off cooldown.

No evidence establishes meaningful need.

Expected:

No finding saying:

```text
You should have used your defensive.
```

Availability alone is insufficient.

---

# Healer Testing Philosophy

Healers must not be tested as:

```text
DPS rules with HPS replacing DPS
```

Tests should consider:

- Available damage to heal
- Health deficits
- Other healers
- Raid cooldowns
- Absorbs
- Overhealing
- Raid composition
- Deaths
- Encounter context

---

# Healer No-Damage Test

Scenario:

Healing spell available.

Raid near full health.

No meaningful damage deficit.

Expected:

No finding penalizing the healer for not casting the heal.

---

# Raw HPS Negative Test

Scenario:

Healer A has greater HPS than Healer B.

Available damage and overhealing differ significantly.

Expected:

Do not conclude:

```text
Healer A played better
```

solely from HPS.

---

# Raid Cooldown Assignment Tests

When a plan exists, test:

- Correct player
- Correct ability
- Correct event/time
- Correct use
- Early
- Late
- Missed
- Player dead
- Ability unavailable
- Assignment impossible
- Assignment correctly followed

Possible outcomes:

```text
ASSIGNMENT_MET
ASSIGNMENT_EARLY
ASSIGNMENT_LATE
ASSIGNMENT_MISSED
ASSIGNMENT_NOT_ACTIONABLE
ASSIGNMENT_UNKNOWN
```

---

# Healer Plan vs Player Failure Regression

Required healer regression.

Scenario:

Plan assigns cooldown at:

```text
2:00
```

Healer uses correct cooldown at:

```text
2:00
```

Raid later dies at:

```text
2:25
```

and analysis suggests the plan may have been better at 2:25.

Expected player result:

```text
ASSIGNMENT_MET
```

Possible separate plan result:

```text
PLAN_MAY_NEED_REVIEW
```

Do not report:

```text
Player used cooldown incorrectly at 2:00.
```

---

# Missing Healer Plan Test

Scenario:

No authoritative cooldown plan is supplied.

Expected assignment authority:

```text
NO_AUTHORITY_AVAILABLE
```

Do not infer assignments from observed behavior.

Do not generate:

```text
You missed your assigned cooldown.
```

when no assignment existed.

---

# Healer Damage-Event Tests

A future raid damage model should test:

- Event start
- Peak
- End
- Players affected
- Health deficits
- Total damage
- Absorbs
- Defensive coverage
- Healing cooldown coverage
- Deaths

Test the event model before sophisticated healer coaching depends on it.

**Death timelines (M12-A).** `tests/unit/healing/death-timeline.test.ts`
proves the first shared healing primitive on synthetic fights and on the one
real player death committed in the corpus. The negative cases are the point:

- a heal gap or an out-of-scope ally is UNKNOWN, never a complete empty list;
- nothing after the death is read;
- an entry at the death's millisecond is marked, not ordered;
- another actor's snapshot is never the dying actor's health;
- another instance's events never join the timeline;
- no total is computed from raw amounts.

`tests/contracts/m12a-healing-layering.test.ts` keeps `src/healing/` free of
specialization branching and judgement vocabulary.

**Damage episodes (M12-B).** `tests/unit/healing/damage-episodes.test.ts`
covers the negative cases:

- no FULL_RAID roster means no episode list, never an empty one;
- one uncovered roster player, a coverage gap in the margin, or a margin
  past the fight's edge makes an episode UNKNOWN and names why;
- damage dealt by the raid is never an episode;
- another actor's snapshot is never a target's health;
- nothing is summed.

Its real-evidence block reads the three friendly-players segments in the
evidence archive. Its expected values were derived from the raw bytes
independently of the primitive. `tests/unit/m12b-friendly-players-slice.test.ts`
covers the rest:

- the slicer's roster refusals;
- a byte-exact re-cut of the committed segments;
- the loader's `ACTOR_SLICE_INVALID` refusals.

Healer evidence follows the 2026-10-31 owner policy: full evidence in the
archive, minimal derived fixtures in the corpus, and a recorded ledger when
they do not fit.

**Received during episodes (M12-C).**
`tests/unit/healing/received-during-episodes.test.ts` covers the negative
cases:

- no FULL_RAID roster means no episode report, never an empty one;
- an empty list is "nothing received" only under COMPLETE coverage, and is
  otherwise UNKNOWN with `INSUFFICIENT_SCOPE` or `INSUFFICIENT_COVERAGE`;
- sources are verbatim: a pet stays its own source, a missing source is
  kept, and a heal absorb is not a damage absorb;
- healing outside the window, or on a player the episode did not hit, is not
  listed;
- nothing is summed.

Its real-evidence block reads the same three archive segments, with
expected counts derived from the raw bytes independently.

**The first healer evaluator (M12-D).**
`tests/unit/specs/restoration-shaman-evaluator.test.ts` covers the negative
cases:

- no raid plan is ASSIGNMENT `NO_AUTHORITY_AVAILABLE`, never UNKNOWN, even
  when the player and another healer both cast the cooldown;
- per-cast spell choice is `NO_AUTHORITY_AVAILABLE` whatever was cast;
- an assignment with no cast in its window is `ASSIGNMENT_UNKNOWN`
  (`READINESS_NOT_ESTABLISHED`, or the coverage gate's reason), never a miss;
  a cast just outside the tolerance is context, never early or late;
- `ASSIGNMENT_NOT_ACTIONABLE` needs a COMPLETED encounter that ended before
  the window; an in-progress fight is UNKNOWN;
- a cast before the pull or after the kill is not a use and meets no
  assignment; casts exactly at either bound are;
- a use is the player's own completed cast: not a begincast, an aura of the
  same id, another player's cast or the totem's own cast;
- a cast-coverage gap, or a completed cast of the player with no ability id,
  makes the cooldown listing UNKNOWN (another player's ability-less cast does
  not); an ability-less cast in an assignment window is
  `UNIDENTIFIED_SUBJECT_CAST`, never "no cast";
- overlap with damage episodes is `ROSTER_NOT_IN_SCOPE` without FULL_RAID,
  and an empty overlap list is "no overlap" only under its COMPLETE listing:
  absent DAMAGE, a gap in the span, a gap in the grouping margin before it,
  an ability-less roster hit, or a span past the fight's end is UNKNOWN
  (with a COMPLETE empty-list control);
- a mismatched, wrong-specialization, unresolved or contradictory identity
  stops evaluation;
- unusable runtime data stops evaluation.

Its real-evidence block composes the two M12-D cast segments with the
committed fight context. The four healing-cooldown casts it expects are
derived from the raw bytes independently.

**Raid cooldown plan input (M12-E).** The negative cases:

- `tests/unit/raid-plan/timeline-note-import.test.ts`: the owner's example
  imports with string phases; `tag:everyone`, a role, a group, two names, a
  reminder, a header, a line without `ph`, `time` or `tag`, a malformed or
  repeated field and an over-long line are diagnostics, never assignments;
  `countdown` is not a tolerance; `bossSpell` does not move the time;
  diacritics are kept; too many assignments refuses the note.
- `tests/unit/raid-plan/resolve.test.ts`: a plan for another encounter or
  difficulty is never applied, and an unreported difficulty is UNKNOWN; a
  name resolves only to exactly one roster player (case-insensitive,
  diacritics significant, realm exact), never with an unnamed roster player
  or without the FULL_RAID roster; a phase-relative time never resolves,
  even phase "1" in a phased fight.
- `tests/unit/raid-cooldown-plan-request.test.ts`: tolerance is never
  assumed; a numeric phase, an unknown key, a named difficulty and a
  non-letter name reject the request; limits reject rather than truncate.
- `tests/unit/specs/restoration-shaman-evaluator.test.ts`: a mismatched plan
  is `NO_AUTHORITY_AVAILABLE`, an unbindable one `UNKNOWN`; a phase-relative
  entry and an unresolved name that may be this player's are UNKNOWN, never
  MET; another ability for this player is not evaluated; a diacritic-differing
  name is another player. Real evidence: MET / UNKNOWN / NOT_ACTIONABLE under
  the committed roster, `PLAYER_NOT_RESOLVED` without it.
- `tests/contracts/m12e-raid-cooldown-plan-input.test.ts`: a request without
  a plan produces no `raidCooldownPlan` key; with one, only that key is
  added; it is `NOT_EVALUATED` on every status, MISMATCHED for another
  encounter or difficulty; an invalid plan is `INVALID_REQUEST`; the MCP
  input shape and the parser agree; `src/raid-plan/` imports no
  specialization and names none.
- `tests/integration/m12e-raid-cooldown-plan-transports.test.ts`: REST and
  MCP return the identical document for the same plan, and both refuse an
  invalid one.

**Augmentation Foundation (M13-A).** The negative cases:

- `tests/unit/support/support-primitives.test.ts`: a missing removal is
  never an expiry (end NOT_OBSERVED, no duration, no extension); a window
  first seen as a refresh or removal starts NOT_OBSERVED; a re-application
  without removal ends the previous window NOT_OBSERVED; another source's
  aura is never this supporter's, and an unstated source is not read
  through, and a coverage gap or an unattributed transition between two
  observations leaves continuity NOT_ESTABLISHED (no active span, no support
  time, no overlap); overlap matches the recipient instance, never another
  instance of the same actor; an ambiguous transition (no source, no
  ability id, or no target) keeps the listing OBSERVED_ONLY and breaks the
  continuity it could touch; an ability-less recipient cast, or a
  source-less cast of a listed id, keeps overlap OBSERVED_ONLY; touching
  windows are never a proven overlap, in either event order; a stack removal
  to zero, or retrieval order running backwards in time, leaves continuity
  NOT_ESTABLISHED; an empty list is complete only under the supporter's COMPLETE
  AURAS coverage (INSUFFICIENT_SCOPE for coverage of others); a pet's owner
  is `petOwner` only; no death event is never "alive"; an unobserved end
  anchors no "after"; overlap without an identity is NO_COOLDOWN_IDENTITY;
  support time and concurrency are never exact, because coverage never
  resolves a carried-in buff (a buff applied before a queried subrange, or
  a carry-in recipient beside an observed window): AT_LEAST with
  INITIAL_STATE_NOT_RESOLVED, or UNKNOWN, never "at least 0".
- `tests/unit/specs/augmentation-evoker-evaluator.test.ts`: SUPPORT_TARGETING
  is NO_AUTHORITY_AVAILABLE with no model (case A) and UNKNOWN with a
  declared model whose ally state is missing (case B), never substituted;
  SUPPORT_TIMING has no standard; no output names a wrong, missed or
  incorrect anything; the Evoker's own Ebon Might is not support; the
  support-cast list is UNKNOWN without CASTS coverage or with an
  unidentified cast; wrong or contradictory identity stops evaluation;
  tampered runtime data is refused. Real evidence: the 22 support casts, the
  window starts and ends equal to the raw applications and removals, pet
  ownership, recipient deaths (none inside a span; each next death equals
  the raw one), and a supplied id's real overlap, all OBSERVED_ONLY.
- `tests/unit/m13a-sanitize-augmentation.test.ts`: the stream merge order,
  and that no real code, name, server or player gameID survives.
- `tests/contracts/m13a-support-layering.test.ts`: `src/support/` imports
  only the engine, holds no spell id, compares no class, declares no
  judgement word, and has exactly one named consumer.

**Recipient specialization state (M13-B).** The negative cases:

- `tests/unit/m13b-friendly-specializations.test.ts`: a missing, blank,
  null, non-string or literal "unknown" entry is UNKNOWN / NOT_STATED and
  never a default; a misaligned roster (short, long, absent or non-array
  specs, or a non-integer participant) refuses every player rather than
  zipping; a duplicated participant, a pet, an NPC, an id missing from the
  catalog, an ambiguous id, the `-1` sentinel, an actor record with no type
  and a player with no class are each UNKNOWN with their own rule, and none touches another player; actor
  id `0` is stated like any other; an actor outside the roster (an owned
  pet, an enemy) is NOT_IN_FRIENDLY_ROSTER, never its owner's; a cast of
  another specialization's ability never establishes one; every focused
  view, under either scope, holds the core's same object; a refused roster
  leaves `friendlyPlayers` and the ingestion unchanged. Real evidence: the
  committed M13-A fight context states all twenty players' specializations
  with their classes.
- `tests/unit/specs/augmentation-evoker-evaluator.test.ts`: on the real
  fight the thirteen Ebon Might recipients carry their own stated
  specializations, and a pet recipient is NOT_IN_FRIENDLY_ROSTER, never its
  owner's. `src/support/` stays free of specialization vocabulary
  (`tests/contracts/m13a-support-layering.test.ts`, unchanged).
- `tests/contracts/normalization-boundary.test.ts`: the revision is pinned
  at `m3.5`, and the new model file exposes no `unknown`.

---

# Healer Per-Cast Authority Negative Test

Until an approved implementable per-cast healer model exists:

Scenario:

Analyzer knows a healer cast Spell A.

No authoritative per-cast spell-choice model exists.

Expected:

Do not confidently report:

```text
You should have cast Spell B.
```

Because no approved per-cast healer model exists, this is a missing-authority
condition:

```text
NO_AUTHORITY_AVAILABLE
```

It is not `UNKNOWN`.

`UNKNOWN` would incorrectly imply that a trustworthy per-cast standard exists
and that only evidence was lacking.

---

# Augmentation Testing Philosophy

Augmentation must not be tested as ordinary personal DPS.

Tests may include:

- Ebon Might
- Prescience
- Breath of Eons
- Buff recipients
- Recipient survival
- Observable recipient cooldowns
- Raid composition
- Encounter phase
- Ally-state completeness

---

# Augmentation Missing Ally State Test

Both failure states must be tested, and they must not be substituted for one
another.

Case A — no validated recipient-quality model exists (the current state):

```text
category = SUPPORT_TARGETING
```

Expected:

```text
NO_AUTHORITY_AVAILABLE
```

Case B — a recipient-quality model exists, but required ally data was not
retrieved or reconstructed:

Expected:

```text
UNKNOWN
```

Neither case may produce:

```text
Wrong Prescience target.
```

---

# Augmentation Observable Facts Tests

Aug v1 may safely test:

- Buff uptime
- Recipient identity
- Recipient alive/dead
- Observable cooldown overlap
- Support cooldown timing
- Coverage

These should be factual/evidence-grounded.

---

# Augmentation Comparison Negative Test

Scenario:

A higher Aug parse exists with different recipient quality/composition.

Expected:

Do not infer:

```text
higher parse = better personal decision making
```

---

# Multi-Target Support Tests

Multi-target state must be explicit.

APL concepts may include:

```text
active_enemies
spell_targets
target_if
cycle_targets
```

If unsupported in the current slice:

Expected at the expression level:

```text
UNSUPPORTED
```

Expected at the decision level, when that expression materially affects action
selection:

```text
decision = UNKNOWN
```

Not:

```text
assume one target
```

`UNSUPPORTED` describes the expression. `UNKNOWN` describes the resulting
decision. They are different layers, not alternatives.

---

# First-Slice Single-Target Guard

For the initial Assassination slice:

If the decision requires unsupported AoE/multi-target state:

Do not evaluate it as single-target.

This protects the first vertical slice from systematic false positives.

---

# Runtime Data Tests

Runtime game data should preserve provenance.

Test required metadata such as:

- Source
- Expansion
- Season
- Game build
- Data revision
- Generation/retrieval date

where applicable.

---

# Runtime Data Compatibility Test

Required negative regression.

Scenario:

Log belongs to:

```text
game build A
```

Loaded runtime data is known to belong to incompatible:

```text
game build B
```

Expected:

```text
INCOMPATIBLE_DATA_VERSION
```

or equivalent fail-closed state.

Do not silently analyze using known-incompatible mechanics.

---

# Runtime Data Generation Tests

When generators are implemented:

Test:

- Deterministic output
- Required provenance
- Schema validity
- No missing required IDs
- Version stamp
- Source identification

Do not rely on undocumented hand-entered values for large runtime datasets.

---

# Evidence Tests

Every important player-blame finding should preserve evidence.

Example:

```json
{
  "expected": "Envenom",
  "actual": "Mutilate",
  "status": "INCORRECT",
  "confidence": "HIGH"
}
```

should retain evidence describing:

- Why Envenom was selected
- Which authority selected it
- Relevant resource state
- Relevant buffs/debuffs
- Target state
- Encounter state
- Actual Mutilate event
- Completeness

Evidence must exist before reporting prose.

---

# Confidence Tests

Confidence describes evidence quality.

Test conceptual cases:

Complete direct evidence:

```text
HIGH
```

Partially reconstructed but well-bounded:

```text
MEDIUM
```

Ambiguous:

```text
LOW
```

Required input missing:

```text
UNKNOWN
```

Large DPS/HPS difference alone must not create HIGH confidence.

---

# Suppressed Finding Tests

A suppressed finding should remain structurally present.

Example:

```text
potentialIssue:
Deathmark delayed

status:
SUPPRESSED

reason:
INTERMISSION
```

Do not delete all trace of suppressed analysis.

This allows debugging and protects against hidden comparison authority.

---

# Application Service Tests

Application services should coordinate analysis without owning gameplay rules.

Test:

- Request validation
- Enabled-analyzer resolution
- Ingestion scope derived from the union of declared analyzer inputs
- Rejection or widening of a client-requested under-scope
- WCL invocation
- Runtime-data loading
- Spec evaluator selection
- `SPEC_NOT_SUPPORTED` handling
- Preparation analyzer invocation independent of the spec evaluator
- Optional comparison invocation
- Structured result return, including result state and coverage

No gameplay conclusions should originate directly in the service layer.

The service must not invent an authority, narrow a scope silently, or omit
preparation because gameplay evaluation did not run.

---

# REST / Future MCP Consistency Contract

REST and future MCP should call the same application services.

When MCP exists, add a contract test:

Same analysis request through:

```text
REST
```

and:

```text
MCP
```

must produce the same underlying structured analysis result.

Transport formatting may differ.

Gameplay truth may not.

---

# Reporting Tests

Reporting tests happen after structured findings are tested.

Verify reporting:

- Does not invent findings
- Does not change UNKNOWN to certainty
- Does not change NO_AUTHORITY_AVAILABLE to certainty
- Does not change SUPPRESSED to failure
- Does not create unsupported causality
- Does not independently evaluate a spec
- Does not present a partial analysis as a complete assessment
- Preserves important context
- Produces valid requested formats

Avoid over-testing exact sentence wording.

---

# Reported Coverage Tests

Required reporting regression.

The report must disclose its own analysis coverage and completeness.

Test that the report cannot present itself as complete when any of the
following are true:

- decision coverage is low
- important data is `PARTIAL`
- specialization gameplay is `SPEC_NOT_SUPPORTED`
- important categories are `UNKNOWN` or `NO_AUTHORITY_AVAILABLE`

Scenario:

```text
meaningful decision points = 100
resolved = 12
UNKNOWN = 88
findings emitted = 1
```

Expected:

The report discloses low coverage.

Not:

```text
a confident summary implying the fight was fully analyzed
```

Required regression name:

```text
low_coverage_analysis_cannot_present_as_complete
```

Verify reporting consumes coverage/completeness from the application-service
result rather than recomputing it.

Failure mode this prevents:

All fail-closed machinery in this project is internal. Without coverage
disclosure, a mostly-unanalyzable fight produces a short clean-looking report
and the player cannot tell the difference between "little to fix" and "little
analyzed."

---

# TLDR Tests

The TLDR should prioritize reliable, actionable issues.

It should generally deprioritize:

- LOW-confidence observations
- UNKNOWN
- SUPPRESSED findings
- Trivial delays
- Unsupported causal claims
- Cosmetic numerical differences

Prefer a small number of meaningful findings.

A practical initial target is roughly:

```text
top 3 important reliable actionable issues
```

when that many actually exist.

Do not fabricate three findings just to fill a template.

---

# Snapshot / Golden Output Policy

Use large exact-output snapshots cautiously.

Useful for:

- Stable API schemas
- Structured contracts
- Selected report formats

Risky for:

- Human coaching prose

Prefer assertions against structured findings.

Do not update a golden file merely because output changed.

First decide whether the new behavior is correct.

---

# Historical Regression Categories

The test suite should eventually include real tests for:

- Null actor metadata
- Null class
- Incorrect spec hydration
- Identity conflict
- Partial WCL retrieval
- Truncated event pages
- Missing talents
- Resource ambiguity
- Resource cap treated as waste
- Invented discrete resource generation
- Continuous resource reconstruction errors
- Incorrect buff direction
- Incorrect debuff direction
- Aura refresh errors
- Missing aura removals
- Cooldown charge errors
- Cooldown reset errors
- Defensive lookup relying on missing identity
- Encounter downtime treated as poor rotation
- Fight-duration normalization errors
- Invalid comparison parses
- Dead comparison players
- Top logs replacing SimC authority
- Top logs suppressing findings without environmental evidence
- Top logs reducing confidence without evidence
- Numeric deltas producing unsupported causal coaching
- Unsupported APL syntax becoming false
- UNKNOWN APL conditions falling through to lower-priority actions
- Predictive future knowledge producing unfair coaching
- Actionability defaulting to ACTIONABLE without evidence
- UNKNOWN and NO_AUTHORITY_AVAILABLE used interchangeably
- Healer HPS misuse
- Healer plan misuse
- Missing healer plan becoming inferred assignment
- Augmentation missing ally state
- Unsupported multi-target state becoming single-target
- UNKNOWN contributing to a score
- Known runtime-version incompatibility
- Unsupported specialization producing an empty report that implies clean play
- Preparation findings lost because no specialization evaluator ran
- Consumable categories omitted when completeness is insufficient
- Partial analysis presented as a complete assessment
- Silent under-fetching from an incorrectly narrowed ingestion scope
- Racial abilities appearing in findings while excluded

Do not create placeholder tests before the relevant system exists.

---

# Test-Driven Bug Fix Workflow

For a confirmed bug:

1. Reproduce the issue.
2. Identify which architectural layer owns the failure.
3. Preserve the minimum fixture required.
4. Add a failing test.
5. Confirm it fails for the intended reason.
6. Fix the owning implementation.
7. Run the focused test.
8. Run subsystem tests.
9. Run regression tests.
10. Check contracts.
11. Review for unrelated breakage.

If fixing one bug repeatedly breaks unrelated systems:

Stop.

Review the abstraction.

Do not continue an uncontrolled patch chain.

---

# Test Naming

Prefer behavioral names.

Good:

```text
resource_generation_at_cap_counts_as_waste

intermission_suppresses_missed_cooldown

missing_talent_data_returns_unknown

partial_event_page_does_not_create_idle_time

comparison_similarity_does_not_suppress_rotation_finding

comparison_similarity_does_not_reduce_confidence

healer_following_assignment_is_not_penalized

augmentation_missing_recipient_state_returns_unknown

absent_targetability_data_does_not_default_to_actionable

unknown_condition_does_not_fall_through_to_lower_priority_action

unknown_and_no_authority_are_not_interchangeable

unsupported_spec_does_not_produce_empty_clean_report

preparation_findings_produced_without_spec_evaluator

low_coverage_analysis_cannot_present_as_complete

scope_derivation_prevents_silent_under_fetch

racial_abilities_excluded_from_findings
```

Bad:

```text
test1
bugfix
resourceThing
```

---

# Validation Corpus

As support expands, maintain a representative validation corpus.

Eventually include:

- Every supported specialization
- Different resource models
- Different cooldown models
- Different talent configurations
- Different fight durations
- Different encounter styles
- High-performing examples
- Low-performing examples
- Death cases
- Downtime cases
- Missing-data cases
- Partial-data cases

For healers include:

- Different healer counts
- Different damage profiles
- Assigned cooldown plans
- No-plan cases

For Augmentation include:

- Different compositions
- Different recipients
- Missing ally-state cases

The corpus validates analyzer breadth.

It does not become the gameplay authority.

---

# Good / Bad Parse Philosophy

A high parse does not automatically represent perfect play.

A low parse does not automatically represent poor decision making.

Expected behavior should be established from:

- Declared authority
- Evidence
- Encounter reality
- Spec evaluator logic

Parse percentile alone is not an expected-output oracle.

---

# Manual Validation

Important new capabilities should initially receive manual review.

For a new specialization/subsystem:

1. Select representative real logs.
2. Inspect raw WCL evidence.
3. Inspect completeness.
4. Inspect normalized events.
5. Inspect reconstructed state.
6. Inspect authority resolution.
7. Inspect spec evaluator decision.
8. Inspect actionability.
9. Inspect finding.
10. Inspect report wording.
11. Confirm conclusion is defensible.
12. Capture representative regressions.

Automation should follow understanding.

---

# First Vertical Slice Tests

The first full vertical slice should prove:

```text
WCL fixture
    |
    v
Retrieval completeness
    |
    v
Normalization
    |
    v
Combat state
    |
    +---------------------------+
    |                           |
    v                           v
Assassination evaluator   Preparation analyzer
    |                           |
SimC supported decision         |
    |                           |
Actionability                   |
    |                           |
    +-------------+-------------+
                  |
                  v
         Structured findings
                  |
                  v
           Minimal coaching
                  |
                  v
          Coverage disclosure
```

Preparation is a parallel producer. It must not be tested as a step that runs
after the specialization evaluator.

Required first-slice coverage should include:

1. Correct rotational decision
2. Incorrect rotational decision
3. Combo Point decision
4. Energy decision
5. Continuous-resource interval
6. Buff/debuff-sensitive decision
7. Cooldown decision
8. Aura refresh case
9. Cooldown charge/reset case where relevant
10. Encounter downtime
11. Target unavailable
12. UNKNOWN state
13. Unsupported APL expression
14. Missing talent state
15. Evidence trace
16. Preparation findings
17. Multi-target unsupported guard
18. Predictive-state guard
19. Completeness failure
20. Minimal report output
21. Absent environmental evidence does not default to ACTIONABLE
22. UNKNOWN higher-priority APL condition does not fall through
23. UNKNOWN distinct from NO_AUTHORITY_AVAILABLE
24. Ingestion-scope derivation
25. Coverage disclosure in the report
26. Preparation findings produced independently of the evaluator

---

# First Slice Supported Decision Surface

Before declaring slice 1 complete, document:

- Supported APL expressions
- Unsupported APL expressions
- Supported resource models
- Supported aura mechanics
- Supported cooldown mechanics
- Supported target model
- Supported actionability reasons
- Supported encounter state

The supported decision surface should be machine-readable where practical.

---

# First Slice UNKNOWN Coverage

UNKNOWN is valid.

But returning UNKNOWN for nearly everything is not success.

For at least one named representative reference fixture:

Measure:

```text
total meaningful decision points
resolved decision points
UNKNOWN decision points
UNSUPPORTED decision points
```

Categorize every major UNKNOWN reason.

Example:

```text
32% unsupported target_if
10% missing predictive state
4% incomplete resource state
54% resolved
```

Before declaring the slice complete, establish a minimum useful resolved
coverage target based on the real fixture.

Do not invent the threshold before seeing the data.

Do not improve coverage by guessing.

---

# First Slice Exit Gate

Before expanding to the second specialization, confirm:

- WCL retrieval is complete or explicitly partial
- Identity is stable
- Completeness propagates
- SimC subset is explicit
- UNKNOWN propagation works
- Combo Points work
- Energy works
- Resource cap is not resource waste
- Aura direction works
- Aura intervals work
- Cooldowns work
- Actionability works
- Encounter downtime works
- Unsupported multi-target decisions fail closed
- Predictive state fails closed
- ACTIONABLE is never produced from absent environmental evidence
- UNKNOWN APL conditions do not fall through to lower-priority actions
- UNKNOWN and NO_AUTHORITY_AVAILABLE are distinct
- Ingestion scope is derived, not client-chosen
- Preparation findings work without the evaluator having run
- Consumable categories are always present, UNKNOWN when incomplete
- Findings preserve evidence
- Minimal reporting does not invent conclusions
- Reporting discloses coverage
- UNKNOWN coverage is measured

---

# Second-Spec Scaling Gate

Protection Paladin is the recommended second specialization.

Adding it should not require:

- A general evaluator rewrite
- Rogue-specific assumptions to be removed from shared infrastructure
- Paladin-specific `if` branches in generic gameplay logic

It should primarily require:

- Protection evaluator
- Runtime data
- SimC support/resolvers
- Tests
- Fixtures

If adding the second spec requires rewriting the entire shared platform:

The abstraction failed.

Stop and review architecture before adding more specs.

---

# DPS / Tank Expansion Gate

Before broad DPS/tank support, confirm:

- First two specs work
- Resource abstractions generalize
- Aura primitives generalize
- Cooldown primitives generalize
- Authority resolution generalizes
- SimC resolver mechanism generalizes
- Encounter actionability is stable
- Evidence structure is stable
- Regression suite is reliable

Do not add 40 specs to an unstable foundation.

---

# Healer Expansion Gate

Before broad healer support, confirm:

- FULL_RAID ingestion works where required
- Raid damage event model works
- Health-deficit context works
- Cooldown assignment model works
- Assignment execution is separate from plan quality
- Death timelines work
- Absorb context works
- Other-healer coverage works
- Missing plan returns NO_AUTHORITY_AVAILABLE
- UNKNOWN handling is reliable

Do not build healer analysis by copying DPS analysis.

---

# Augmentation Expansion Gate

Before confident Aug target coaching, confirm:

- FULL_RAID ally state works
- Buff ownership works
- Buff recipients work
- Recipient survival is known
- Observable recipient cooldowns work
- Required recipient-state completeness is represented
- Missing recipient state propagates UNKNOWN

Do not produce confident target-selection coaching without sufficient evidence.

---

# Runtime Version Gate

Before gameplay conclusions depend heavily on runtime metadata:

Confirm:

- Runtime dataset has provenance
- Game build/revision exists
- SimC APL version exists
- Fixture version exists
- Compatibility can be checked

Known incompatibility must fail closed.

---

# Definition of Done for a Finding Category

A new coaching category is not complete merely because it produces text.

Before a finding category is considered trusted, it should have:

- Defined authority
- Owning layer/spec
- Required input state
- Declared required ingestion inputs
- Completeness requirements
- UNKNOWN behavior
- NO_AUTHORITY_AVAILABLE behavior where relevant, distinct from UNKNOWN
- Actionability behavior, including behavior when environmental evidence is
  absent
- Structured finding output
- Evidence
- Confidence behavior, including what may and may not move it
- Timing tolerance where relevant
- Contribution to reported coverage
- Unit tests
- Negative tests
- Representative regression tests
- Manual verification

Producing prose is not completion.

---

# Final Testing Principle

The goal is not:

```text
Did the analyzer produce an answer?
```

The goal is:

```text
Can we prove why the analyzer produced this answer,
can we prove the required evidence existed,
and can we reproduce the same correct conclusion?
```

A missed finding is preferable to a confident fabricated finding.

UNKNOWN is preferable to guessing.

NO_AUTHORITY_AVAILABLE is preferable to inventing an authority.

Absence of observed restriction is not evidence of availability.

Absence of analysis is not evidence of good play.

A high parse is not automatically truth.

A low parse is not automatically wrong.

SimulationCraft provides rotational authority where supported.

Warcraft Logs provides observed reality.

Specialization evaluators own specialization meaning.

Encounter evidence determines actionability.

Top logs provide context, not rotational truth.

Healer plans govern assignments only when a real plan exists.

Augmentation requires ally state when decisions depend on allies.

Preparation findings exist independently of APL decisions.

Regression tests protect everything we learn.

---

# ONB-A1: Havoc Demon Hunter

`tests/unit/specs/onb-a1-havoc-demon-hunter.test.ts` pins the fail-closed rules: missing talents
stay UNKNOWN, an undecided Metamorphosis or The Hunt never falls through to a lower action, an
UNKNOWN condition is never unselectability, a logged impact is never a press, and a young buff or a
cast that corroborates no range never proves Reaver's Glaive usable. The real decisions and the
coverage disclosure are archive cases (`spec-havoc-demon-hunter.*`), and
`tests/contracts/onb-a1-havoc-promotion-readiness.test.ts` reports the promotion gates.

The whole-fight numbers in agent/architecture.md "ONB-A1" come from replaying the retained capture
through production ingestion. They are not pinned, because those bytes are not committed.

# ONB-A1P: Havoc Demon Hunter public promotion

- `tests/contracts/onb-a1-havoc-promotion-readiness.test.ts`, re-pinned: the same real assertions
  in PUBLIC mode, through the identity table; the internal pairing now finds nothing.
- `tests/contracts/m11-promotion-evidence-gate.test.ts`: the global gates' reviewed snapshots gain
  Havoc (two gates, no control).
- `tests/contracts/onb-a1p-havoc-public-projection.test.ts`: schema, the ONB-A1 counts, no internal
  leak, equality with the registration, the PARTIAL disclosures, and the Fel-Scarred refusal on the
  public path. The refusal swaps the real subject's tree for pinned Fel-Scarred entries, because no
  Fel-Scarred bytes are committed.
- `tests/integration/onb-a1p-havoc-public-transports.test.ts`: REST and MCP parity through the real
  Worker and handler, Vengeance refused, repeatability, bearer behaviour, and the tool description.
- `tests/unit/specs/onb-a1p-havoc-supported-profile.test.ts`: the four gate answers, directly and on
  the facade.

Offline only, not committed: the whole-fight replay (`.probe/onba1/m/`) gives the numbers
agent/architecture.md "ONB-A1" reports, unchanged by the gate.

# ONB-A2: Subtlety Rogue, Fury Warrior and Protection Warrior

`tests/unit/specs/onb-a2-cohort-a-followers.test.ts`, synthetic only, because no retained capture holds these
specializations' events: each row is internal only and refused publicly; another specialization is refused first; a capture
with no combatant info refuses; every decision is UNKNOWN and explained, never a confident verdict; an off-GCD press and an
unknown spell are excluded, never judged; a missing talent stays UNKNOWN; a choice-node talent is NOT_SELECTED only when its
sibling is observed; a resolved hero tree disproves only the other tree's talents, an unresolved one nothing; each list's
stop is pinned over a whole build, with no fall-through past an open enemy count; mitigation presses are excluded and no
offensive authority governs them; a cast's own Rage is exact in SimulationCraft's units and unknown, never zero, without a
snapshot; ids the pinned module does not build have no token.

Six corpus cases (`application-service.*-registration-is-internal-only`, `spec-*.the-facade-refuses-every-other-specialization`).
The conformance suite gains the three modules, with Fury and Protection Warrior's identity proof held by `IDENTITY_RETAINED_ONLY`.
