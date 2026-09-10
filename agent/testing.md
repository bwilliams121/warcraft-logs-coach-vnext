# Warcraft Logs Coach vNext Testing Strategy

## Purpose

This document defines how Warcraft Logs Coach vNext proves that analysis is
correct.

Testing is not limited to verifying that code runs.

The test system must verify that the analyzer:

- Reconstructs combat state correctly
- Uses the correct analysis authority
- Does not invent missing information
- Evaluates SimulationCraft APL correctly
- Understands encounter actionability
- Does not mistake normal downtime for poor play
- Handles class/spec mechanics correctly
- Handles healers differently from DPS
- Handles Augmentation with required ally state
- Uses comparable logs as context rather than rotational truth
- Preserves evidence
- Produces UNKNOWN when evidence is insufficient
- Does not reintroduce previously fixed bugs

The test suite should make incorrect coaching difficult to ship.

---

# Testing Philosophy

The analyzer should be tested from the inside out.

Preferred order:

1. Raw input correctness
2. Normalization correctness
3. State reconstruction correctness
4. Authority/model correctness
5. Decision correctness
6. Actionability correctness
7. Evaluation correctness
8. Contextual validation correctness
9. Coaching correctness

A correct final sentence produced from incorrect internal state is still a
failed analyzer.

Tests should therefore prefer structured intermediate results over final prose.

---

# Test Layers

The test suite should contain several distinct layers.

tests/

    unit/
    regression/
    fixtures/
    contracts/

Additional integration/live test areas may be added when needed.

Each layer has a different purpose.

---

# Unit Tests

Location:

tests/unit/

Unit tests verify isolated behavior with small controlled inputs.

Examples:

- Resource arithmetic
- Buff windows
- Debuff windows
- Cooldown calculations
- Source/target direction
- Evidence propagation
- Confidence calculation
- APL expression evaluation
- Actionability decisions
- Comparison consensus calculations

Unit tests should be:

- Fast
- Deterministic
- Offline
- Narrowly scoped

They should not require live Warcraft Logs access.

---

# Regression Tests

Location:

tests/regression/

Regression tests reproduce real failures, edge cases, and representative combat
situations.

Every confirmed analyzer bug should eventually receive a regression test.

The preferred workflow is:

1. Identify a real incorrect result.
2. Preserve enough evidence to reproduce it.
3. Create a regression test that fails.
4. Fix the implementation.
5. Verify the new test passes.
6. Verify unrelated regressions still pass.

A regression test should explain WHY it exists.

Example metadata:

case:
    resource_cap_not_waste

reason:
    Player reached maximum Combo Points before spending.
    Previous analyzer incorrectly reported resource waste.

expected:
    resourceAtCap = true
    resourceWaste = false

---

# Fixtures

Location:

tests/fixtures/

Fixtures contain captured combat data used for repeatable testing.

Fixtures should allow most analyzer development to happen without querying the
live Warcraft Logs API.

Fixtures may include:

- Warcraft Logs GraphQL responses
- Event pages
- Actor metadata
- Fight metadata
- Talents
- Gear
- Rankings
- Encounter events
- Normalized combat objects
- SimulationCraft APL inputs
- Raid cooldown plans
- Comparison-log data

Raw and normalized fixtures should be distinguishable.

Suggested conceptual structure:

tests/fixtures/

    wcl/
        raw/

    normalized/

    simc/

    encounters/

    raid-plans/

    comparisons/

Do not create these directories until implementation requires them.

---

# Fixture Provenance

Every important real-log fixture should preserve enough metadata to identify its
origin.

Where practical, fixture metadata should include:

- Warcraft Logs report code
- Fight ID
- Source ID
- Encounter
- Difficulty
- Character
- Class
- Specialization
- Game version/build if known
- Fixture capture date
- Reason the fixture exists

Example conceptual metadata:

{
    "reportCode": "...",
    "fightId": 6,
    "sourceId": 5,
    "class": "Paladin",
    "spec": "Protection",
    "purpose": "resource reconstruction regression"
}

The test itself should not need live access to the original report.

---

# Contract Tests

Location:

tests/contracts/

Contract tests verify important schemas and interfaces.

Potential contracts include:

- Normalized combat model
- Actor model
- Specialization analysis contract
- DecisionResult
- ActionabilityResult
- EvaluationResult
- Evidence object
- API response
- Raid cooldown assignment

Contract tests should catch accidental structural changes.

Public API contracts should receive especially strong protection.

---

# Live Integration Tests

Live Warcraft Logs tests have a different purpose from regression tests.

Use live tests to verify:

- Authentication still works
- GraphQL queries remain valid
- Pagination works
- Warcraft Logs schema assumptions are still correct
- Current data can be normalized successfully

Do not make normal development depend on live WCL requests.

Live tests may fail because of:

- Network problems
- Warcraft Logs outages
- Rate limits
- API changes
- Authentication issues

Those failures should not make offline analyzer correctness impossible to test.

---

# Warcraft Logs Retrieval Tests

Warcraft Logs ingestion should be tested independently from analysis.

Test cases should eventually cover:

- Report lookup
- Fight lookup
- Player lookup
- Source ID resolution
- Actor hydration
- Class resolution
- Spec resolution
- Talents
- Gear
- Cast events
- Buff events
- Debuff events
- Resource events
- Damage events
- Healing events
- Death events
- Pagination

Important regression:

A valid player must not become:

name = null

class = null

when the required actor data exists.

If actor metadata cannot be established, the system should explicitly represent
that uncertainty instead of silently passing null values into unrelated
analysis systems.

---

# Normalization Tests

Normalization tests should prove that Warcraft Logs-specific input becomes
stable internal events.

For every important normalized event type, test:

- Timestamp
- Event type
- Source actor
- Target actor
- Ability ID
- Relevant amounts
- Evidence/source reference

Important event types include:

- Cast
- Buff apply
- Buff refresh
- Buff remove
- Debuff apply
- Debuff refresh
- Debuff remove
- Resource state
- Resource change
- Damage
- Healing
- Absorb
- Death

---

# Source and Target Direction Tests

Buff and debuff direction must receive dedicated tests.

Example:

Boss applies Debuff X to Player.

Expected:

source = boss
target = player

Not:

source = player
target = boss

Another example:

Player applies Garrote to Boss.

Expected:

source = player
target = boss

Direction should never be inferred solely because an event appeared in a
particular player's event stream.

If the source or target cannot be established:

return UNKNOWN where the direction matters.

---

# Resource Reconstruction Tests

Resource reconstruction is a high-risk system and requires strong tests.

Test at minimum:

- Exact WCL resource anchor
- Explicit resource gain
- Explicit resource spend
- Multiple changes between anchors
- Resource maximum
- Resource deficit
- Resource cap
- Actual resource waste
- Unknown state
- Impossible reconstruction

Important invariant:

resourceAtCap != resourceWasted

Example:

Player has:

7 / 7 Combo Points

Then immediately spends Combo Points.

Expected:

atCap = true

waste = false

unless evidence establishes that additional resource was generated while there
was insufficient capacity.

---

# No Invented Resource Tests

The analyzer must not invent passive generation or spending merely because game
knowledge suggests it probably happened.

Example:

Known anchor:

Holy Power = 4

No reliable subsequent resource event exists.

If exact later state cannot be reconstructed:

Expected:

UNKNOWN

Not:

"Probably 5 because ability X normally generates Holy Power."

Spec runtime knowledge may interpret observed resource changes.

It must not fabricate unobserved changes.

---

# SimulationCraft APL Tests

SimulationCraft support should be tested in separate stages.

## APL Parsing Tests

Verify that supported APL syntax is normalized correctly.

Examples may eventually include:

- Action priority order
- if conditions
- variables
- cooldown conditions
- buff conditions
- debuff conditions
- resource conditions
- target conditions
- talent conditions
- action lists
- nested expressions

Do not assume the full SimulationCraft language is trivial.

Unsupported syntax should be explicitly identified rather than silently
misinterpreted.

---

## APL Evaluation Tests

Given a known reconstructed state, test which action the APL selects.

Example conceptual state:

energy = X
comboPoints = Y
deathmarkReady = true
targetAvailable = true
buffA = active

Expected:

recommendedAction = Deathmark

or whatever the actual imported APL dictates.

These tests should verify the APL evaluator.

They should not use top-log behavior as the expected answer.

---

# APL Trace Tests

Important APL decisions should be explainable.

Where practical, test that a DecisionResult preserves:

- Recommended action
- APL rule
- Conditions tested
- Relevant state values
- Conditions that passed
- Conditions that failed
- Alternative actions considered

This allows developers to answer:

"Why did the analyzer think this button was correct?"

---

# Unsupported APL State

If an APL condition depends on state that the analyzer cannot reconstruct:

Do not pretend the condition is false.

Do not pretend the condition is true.

The result should become appropriately uncertain.

Expected behavior may include:

- UNKNOWN decision
- Lower confidence
- Explicit unsupported-state result

depending on the situation.

Fail closed.

---

# Decision-Point Tests

Rotation analysis should test meaningful decision points rather than arbitrary
continuous timestamps.

Potential decision points include:

- Global cooldown becomes available
- Cast completes
- Channel completes
- Important proc appears
- Important cooldown becomes available
- Encounter becomes actionable
- Target becomes available

Tests should ensure that the analyzer does not create thousands of artificial
"missed actions" during periods where the player had no real decision.

---

# Actionability Tests

Actionability is a critical protection against false positives.

Every important actionability reason should eventually receive tests.

Possible states:

ACTIONABLE

NOT_ACTIONABLE

UNKNOWN

Test conditions should include:

- Target available
- Target unavailable
- Boss intermission
- Player dead
- Player incapacitated
- Forced disengagement
- Fight ended
- Valid target transition
- Movement limitation when reliably established
- Ambiguous encounter state

---

# Intermission Regression Test

This is a required architectural regression.

Scenario:

The APL recommends Ability X.

The encounter enters a 30-second intermission.

The boss cannot be meaningfully attacked during the intermission.

The player does not cast Ability X.

Comparable successful players also show the expected encounter downtime.

Expected:

The analyzer does NOT report 30 seconds of missed rotation.

The analyzer should identify the first meaningful opportunity after the
intermission.

Example:

theoreticalReadyTime = 124000

intermission:

123000 -> 153000

firstActionableTime = 153000

playerCastTime = 154000

Expected effective delay:

approximately 1 second

Not:

30 seconds.

---

# Direct Encounter Evidence Beats Comparison Consensus

Test that strong direct encounter evidence does not require top logs to confirm
it.

Scenario:

WCL/encounter data clearly establishes boss untargetability.

Comparison logs are unavailable.

Expected:

NOT_ACTIONABLE

not:

UNKNOWN merely because top logs were unavailable.

Comparable logs should strengthen or explain context when needed.

They are not mandatory when direct evidence is sufficient.

---

# Comparison Log Tests

Comparison tests should validate both selection and interpretation.

Test selection requirements such as:

- Correct encounter
- Correct difficulty
- Correct specialization
- Player participated sufficiently
- Player survived where required
- Fight duration reasonably comparable
- Relevant build differences considered
- Relevant composition differences considered

Rank alone must not establish comparison validity.

---

# Dead Comparison Player Regression

Scenario:

A high-ranked comparison player dies substantially before the encounter ends.

Expected:

The comparison system marks that parse unsuitable for behavior requiring full
fight participation.

It must not silently normalize that player's partial participation as though
they completed the encounter normally.

---

# Top Logs Are Not Rotational Truth

This is a required regression principle.

Scenario:

Several high-performing players use Ability B.

The applicable SimulationCraft APL selects Ability A for the reconstructed
state.

No encounter evidence makes Ability A non-actionable.

Expected:

The analyzer does not rewrite the rotational priority to Ability B merely
because top players used it.

Comparison behavior may be reported as context.

It does not replace the declared rotational authority.

---

# Comparison Consensus Tests

When top-log behavior is used as environmental evidence, test consensus rather
than blindly trusting one player.

Conceptual example:

Top comparison logs around phase transition:

Log 1: no casts
Log 2: no casts
Log 3: no casts
Log 4: no casts

This is stronger evidence of forced/expected downtime than:

Log 1: no casts

Tests should ensure consensus confidence reflects the quantity and quality of
supporting comparisons.

---

# Fight-Length Tests

Fight duration must not be treated as the only normalization variable.

Scenario:

Fight A = 6:40
Fight B = 5:20

Both include a 30-second forced intermission.

Expected:

The intermission is recognized as non-actionable time.

Do not simply divide every cast count by total fight duration and assume every
second represents equal rotational opportunity.

---

# Specialization Contract Tests

Every supported specialization should expose a valid analysis contract.

Tests should validate required contract fields.

Conceptual fields:

role

rotationAuthority

cooldownAuthority

performanceModel

requiresAllyState

requiresRaidDamageModel

requiresEncounterModel

Invalid combinations should be detected.

Example:

role = HEALER

rotationAuthority = SIMC_APL

may require explicit approval/support rather than being accepted because SimC
is the generic default.

The engine must not assume all specs are ordinary DPS.

---

# Class and Spec Boundary Tests

Tests should protect the generic engine from accumulating arbitrary spec
behavior.

Whenever practical:

- Generic resource math belongs in the resource engine.
- Rogue-specific semantics belong in Rogue/spec runtime definitions.
- Assassination-specific semantics belong in Assassination.
- Boss-specific behavior belongs in encounter definitions.

A fix for one specialization should not require editing unrelated
specializations unless the shared engine itself was incorrect.

---

# Tank Tests

Tank testing should separate offensive rotation from survival analysis.

Test categories may include:

- SimC rotational recommendation
- Active mitigation
- Defensive availability
- Defensive appropriateness
- Incoming tank damage
- Tank mechanics
- Tank swaps
- Survival state

Important invariant:

defensiveAvailable != defensiveRequired

The analyzer should not flag every unused defensive simply because it was off
cooldown.

---

# Healer Testing Philosophy

Healers require a separate testing model.

Raw HPS must not be used as the sole expected result.

Healer tests should consider:

- Damage available to heal
- Health deficits
- Timing
- Assignments
- Other healers
- Absorbs
- Overhealing
- Deaths
- Raid cooldown coverage
- Encounter mechanics

---

# Healer No-Damage Test

Scenario:

A healer has a healing spell available.

The raid is at or near full health and no meaningful healing is required.

Expected:

The analyzer does not flag the healer for failing to cast the heal.

"Healing spell available"

does not imply:

"Healing spell should be cast."

---

# Healer Raw HPS Test

Scenario:

Healer A has higher HPS than Healer B.

Healer A also has substantially more overhealing or received more available
damage to heal.

Expected:

The analyzer does not conclude that Healer A played better solely from HPS.

Healing quality requires context.

---

# Raid Cooldown Assignment Tests

When an authoritative cooldown plan exists, test:

- Correct cooldown
- Correct player
- Correct assigned event/time
- Correct usage
- Early usage
- Late usage
- Missed usage
- Player dead/unavailable
- Assignment impossible
- Assignment correctly followed

Possible structured statuses:

ASSIGNMENT_MET

ASSIGNMENT_EARLY

ASSIGNMENT_LATE

ASSIGNMENT_MISSED

ASSIGNMENT_NOT_ACTIONABLE

ASSIGNMENT_UNKNOWN

---

# Healer Plan vs Player Failure Regression

This is a required healer test.

Scenario:

The raid plan assigns a healer cooldown at 2:00.

The healer uses the correct cooldown at the assigned time.

The raid later dies at 2:25 during another damage event.

Analysis suggests the cooldown might have been more useful at 2:25.

Expected player execution result:

ASSIGNMENT_MET

Possible plan result:

PLAN_MAY_NEED_REVIEW

Do not report:

"Player incorrectly used cooldown at 2:00."

The player followed the authoritative assignment.

---

# Healer Damage Event Tests

A raid damage event model should eventually be tested for:

- Event start
- Event peak
- Event end
- Players affected
- Health deficits
- Total damage
- Absorbs
- Defensive coverage
- Healing cooldown coverage
- Associated deaths

The event model should be tested before sophisticated healer coaching depends
on it.

---

# Death Analysis Tests

Death analysis should test the timeline immediately before death.

Relevant evidence may include:

- Damage events
- Health state
- Defensive buffs
- Healing received
- Absorbs
- Encounter mechanic
- Player actionability
- Available defensives
- External cooldowns

Do not infer:

"Defensive was off cooldown, therefore the death was the player's fault."

Availability and appropriateness must be evaluated separately.

---

# Augmentation Testing Philosophy

Augmentation Evoker must not be tested as ordinary personal DPS.

Tests should include:

- Personal rotational decisions
- Ebon Might state
- Prescience state
- Buff recipients
- Recipient survival
- Recipient cooldown timing
- Breath of Eons context
- Group composition
- Encounter phase
- Ally-state availability

---

# Augmentation Missing Ally State Test

Scenario:

The APL/support rule requires recipient cooldown state.

Warcraft Logs data available to the analyzer does not establish that state
reliably.

Expected:

UNKNOWN

Not:

"Wrong Prescience target."

Do not guess support decisions when required recipient state is missing.

---

# Augmentation Target Selection Tests

Tests should distinguish:

valid target

from:

optimal target

A target being technically buffable does not prove it was optimal.

Likewise, the highest personal DPS player is not automatically the best target.

Target-quality tests should eventually consider:

- Recipient specialization
- Recipient burst window
- Recipient cooldown state
- Existing buffs
- Player survival
- Encounter phase
- Group composition

If those factors cannot be established:

return UNKNOWN rather than overstate certainty.

---

# Augmentation Comparison Tests

A high Augmentation parse can depend heavily on recipient quality.

Comparison validation should consider supported-player context more strongly
than ordinary DPS comparisons.

Tests should prevent:

higherAugParse == betterPersonalDecisionMaking

from becoming an implicit rule.

---

# Evidence Tests

Important structured results should preserve why they were produced.

Example evaluation:

{
    "expected": "Envenom",
    "actual": "Mutilate",
    "actionable": true,
    "confidence": "HIGH"
}

should also retain enough evidence to explain:

- Why Envenom was expected
- Which authority selected it
- Relevant reconstructed resources
- Relevant buffs/debuffs
- Target state
- Encounter state
- What event proves Mutilate was actually used

Evidence should not merely be generated in reporting prose.

---

# Confidence Tests

Confidence must describe evidence quality.

Test examples:

Complete direct state:

HIGH

Partially reconstructed state with corroborating evidence:

possibly MEDIUM

Ambiguous state:

LOW or UNKNOWN

Missing required state:

UNKNOWN

A large apparent DPS difference must not automatically create HIGH confidence.

---

# UNKNOWN Propagation Tests

UNKNOWN must propagate safely.

Example:

resourceState = UNKNOWN

If the APL decision requires exact resource state:

expected decision:

UNKNOWN

Do not silently convert UNKNOWN resource state into:

0

maximum

false

true

or another default.

Unknown input should remain uncertain when it affects the result.

---

# Suppression Tests

A suppressed coaching flag should retain the reason it was suppressed.

Example:

potentialIssue:

Deathmark delayed 28 seconds

actionability:

NOT_ACTIONABLE

reason:

INTERMISSION

finalEvaluation:

SUPPRESSED

The analyzer should preserve the potential theoretical difference while
correctly avoiding player blame.

---

# Reporting Tests

Reporting tests should happen after structured analysis tests.

Test that reporting:

- Does not invent new findings
- Does not change UNKNOWN into certainty
- Does not change SUPPRESSED into failure
- Preserves important evidence/context
- Prioritizes useful findings
- Produces valid requested formats

Avoid over-testing exact sentence wording.

Prefer testing meaning and required fields.

---

# TLDR Tests

The TLDR should summarize the most important reliable findings.

It should not prioritize:

- Low-confidence observations
- Suppressed findings
- Cosmetic differences
- Large numerical differences unsupported by evidence

A high-confidence actionable mistake should generally outrank a speculative
finding.

---

# Snapshot / Golden Output Policy

Large exact-output snapshots should be used carefully.

They are useful for:

- API schemas
- Stable structured contracts
- Carefully selected report formats

They are risky for coaching prose because harmless wording changes can produce
large test diffs.

Prefer assertions against structured evaluations.

Do not update a golden file merely because the new output is different.

First determine whether the new behavior is actually correct.

---

# Historical Regression Requirements

The vNext test suite should eventually include cases for known historical
failure categories.

Required categories include:

- Actor/player metadata unexpectedly null
- Class metadata missing
- Spec hydration errors
- Resource ambiguity
- Resource cap incorrectly labeled waste
- Invented resource generation
- Incorrect buff direction
- Incorrect debuff direction
- Defensive lookup failing because actor class is missing
- Cooldown-window errors
- Encounter downtime flagged as rotation failure
- Invalid comparison parse
- Comparison player death
- Fight-length normalization error
- Healer HPS misuse
- Healer cooldown assignment misuse
- Augmentation missing ally state
- Top-log behavior incorrectly overriding rotational authority

These should be implemented as actual tests when the relevant subsystem is
built.

Do not create meaningless placeholder tests merely to claim coverage.

---

# Test-Driven Bug Fix Workflow

For a confirmed bug:

1. Reproduce the behavior.
2. Identify which layer is wrong.
3. Create the smallest fixture necessary.
4. Add a failing test.
5. Confirm the test fails for the expected reason.
6. Fix the relevant implementation.
7. Run the focused test.
8. Run related subsystem tests.
9. Run the regression suite.
10. Review for unintended contract changes.

If fixing the bug causes multiple unrelated systems to fail:

Stop.

Review the architecture.

Do not begin an uncontrolled patch chain.

---

# Test Case Naming

Names should describe behavior rather than implementation.

Good:

resource_generation_at_cap_counts_as_waste

intermission_suppresses_missed_cooldown

dead_comparison_player_is_rejected

healer_following_assignment_is_not_penalized

augmentation_missing_recipient_state_returns_unknown

Bad:

testFunction1

resourceThing

fixBug19

---

# Validation Corpus

As support expands across specializations, maintain a representative validation
corpus.

The corpus should eventually include:

- Every supported specialization
- Multiple encounter types
- Different resources
- Different cooldown styles
- Different talent configurations
- Different fight durations
- Clean/high-performing examples
- Imperfect examples
- Death cases
- Downtime cases

For healers:

include differing damage profiles and cooldown assignments.

For Augmentation:

include differing group/recipient contexts.

The corpus should validate architecture breadth.

It should not become the rotational authority.

---

# Good and Bad Parse Philosophy

A high parse does not automatically represent perfect play.

A low parse does not automatically represent incorrect rotation.

Validation should include a range of player performance.

When testing whether the analyzer detects mistakes:

Prefer cases where the expected behavior can be established from evidence and
the declared authority.

Do not label a case "bad" solely because the parse percentile is low.

---

# Manual Verification

Important new analyzer capabilities should initially be manually inspected
against real logs before being trusted broadly.

For a new specialization or subsystem:

1. Select representative cases.
2. Inspect Warcraft Logs evidence.
3. Inspect reconstructed state.
4. Inspect authority decision.
5. Inspect actionability.
6. Inspect final structured evaluation.
7. Confirm the conclusion is defensible.
8. Add representative regression cases.

Automation should follow understanding.

---

# First Vertical Slice Testing

The first supported DPS/tank specialization should prove the entire pipeline.

Required tests should eventually cover:

WCL fixture
    |
    v
Normalization
    |
    v
Combat state
    |
    v
Spec contract
    |
    v
SimC APL decision
    |
    v
Actionability
    |
    v
Evaluation
    |
    v
Reporting

The first vertical slice should include at least:

1. Correct rotational decision
2. Incorrect rotational decision
3. Resource-sensitive decision
4. Buff/debuff-sensitive decision
5. Cooldown decision
6. Encounter downtime
7. UNKNOWN state
8. Evidence trace
9. Valid comparison context
10. Invalid comparison context

Do not expand to every specialization until these concepts work reliably.

---

# Expansion Gate

Before adding large numbers of specializations, confirm:

- Core state reconstruction is stable
- APL evaluation is trustworthy
- UNKNOWN propagation works
- Resource handling works
- Actionability works
- Encounter downtime works
- Evidence is traceable
- Regression tests are reliable

Adding 40 specs to an unstable core creates 40 versions of the same bugs.

---

# Healer Expansion Gate

Before broad healer support, confirm:

- Raid damage event model works
- Health-deficit modeling works
- Raid cooldown assignments work
- Assignment execution is separate from plan quality
- Death timelines work
- Overhealing context works
- UNKNOWN handling works

Do not build healer analysis by copying the DPS pipeline and replacing DPS with
HPS.

---

# Augmentation Expansion Gate

Before broad Augmentation coaching, confirm:

- Ally-state reconstruction works
- Buff ownership works
- Buff recipient state works
- Recipient survival is known
- Recipient cooldown context can be represented
- UNKNOWN recipient state propagates correctly

Do not produce confident target-selection coaching without sufficient ally
evidence.

---

# Version Tests

World of Warcraft and SimulationCraft data change over time.

Where practical, tests and fixtures should preserve version metadata.

The test system should eventually catch situations where:

- Fixture belongs to one game build
- APL belongs to an incompatible build
- Runtime spell data belongs to another build

Do not silently validate old combat data using incompatible current mechanics.

---

# Test Reliability

A test should fail because analyzer behavior changed incorrectly.

It should not fail randomly because:

- Warcraft Logs is temporarily unavailable
- A rate limit was reached
- Network latency changed
- A top-log ranking changed
- A live player changed gear
- An external page changed

Use fixtures for deterministic correctness tests.

Use explicit live/integration tests for external-system health.

---

# Definition of Done for Analyzer Findings

A new category of coaching should not be considered complete merely because it
produces output.

Before a finding category is trusted, it should have:

- Defined authority
- Required input state
- UNKNOWN behavior
- Actionability behavior
- Structured evaluation
- Evidence
- Confidence
- Unit tests
- Representative regression tests
- Manual verification on real logs

If those elements are absent, the feature is experimental.

---

# Final Testing Principle

The goal of testing is not:

"Did the analyzer produce an answer?"

The goal is:

"Can we prove why the analyzer produced this answer, and can we prove that the
same evidence would produce the same correct conclusion again?"

A missed finding is preferable to a confident fabricated finding.

UNKNOWN is preferable to guessing.

A top parse is not automatically truth.

A low parse is not automatically wrong.

SimulationCraft provides rotational authority where declared.

Warcraft Logs provides observed reality.

Encounter evidence determines actionability.

Healer plans govern assigned cooldown execution where configured.

Augmentation requires ally context.

Regression tests protect everything we learn.
