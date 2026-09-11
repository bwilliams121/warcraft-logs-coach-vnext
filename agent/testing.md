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
