# Warcraft Logs Coach vNext

## Project Purpose

Warcraft Logs Coach vNext analyzes World of Warcraft combat logs and produces
accurate, evidence-based coaching.

The analyzer must prioritize correctness over producing an answer.

This project is a clean rebuild. Do not copy old implementation patterns into
the new architecture unless they are explicitly reviewed and approved.

---

# Core Philosophy

Correctness first.

Evidence second.

Coaching third.

A smaller analyzer that reliably says UNKNOWN is better than a larger analyzer
that produces plausible but unsupported advice.

The analyzer must distinguish between:

1. What ideally should have happened.
2. What actually happened.
3. What was realistically possible in the encounter.
4. Whether the difference was actually a player mistake.

---

# Analysis Authority Hierarchy

Different sources answer different questions.

Do not treat any single source as authoritative for every aspect of analysis.

---

## 1. SimulationCraft APL is the rotational authority for supported DPS and tank analysis

For supported DPS and tank rotational decisions, the applicable SimulationCraft
Action Priority List (APL) is the primary authority for determining what action
should ideally be used.

The analyzer should interpret the APL against reconstructed combat state rather
than inventing its own rotational priority.

Examples include:

- Which ability had the highest priority at a decision point
- Whether a resource spender should have been used
- Whether a generator should have been used
- Whether a cooldown should have been activated
- Whether a proc changed the correct action
- Whether a buff changed the correct action
- Whether delaying an ability was rotationally justified
- Whether resource state affected the correct decision

Do not replace SimulationCraft APL logic with observed popularity from Warcraft
Logs.

High-performing players are not automatically playing the rotation perfectly.

Top-log behavior may provide useful context, but it is not the source of
rotational truth.

This rule does not automatically apply to healer analysis.

Support specializations may require additional ally and raid state beyond the
player's personal APL state.

Each specialization must explicitly declare which analysis authorities apply.

---

## 2. Warcraft Logs is authoritative for observed combat reality

Warcraft Logs determines what actually happened in the fight.

If Warcraft Logs provides an observed event, treat that event as evidence.

Examples include:

- Player identity
- Player source ID
- Class
- Spec
- Talents
- Gear
- Casts
- Buffs
- Debuffs
- Resources
- Targets
- Damage
- Healing
- Deaths
- Encounter timing
- Phase changes
- Target availability
- Downtime
- Combat events

Do not invent:

- Casts
- Buffs
- Debuffs
- Resource gains
- Resource spending
- Targets
- Deaths
- Cooldowns
- Encounter events
- Player state

that are not supported by available evidence.

---

## 3. Top Warcraft Logs provide encounter context and validation

Comparable successful Warcraft Logs parses may be used to establish
encounter-specific behavior.

Examples include:

- Normal downtime during an intermission
- Boss untargetable periods
- Target transitions
- Typical pauses in casting
- Mechanic-driven movement
- Encounter-specific cooldown holds
- Strategy-dependent timing
- Common behavior at a particular fight timestamp

Top logs help answer:

"Is this unusual player behavior, or is this normal behavior caused by the
encounter?"

Top logs must not automatically answer:

"What was the rotationally optimal button?"

SimulationCraft remains the primary rotational authority where applicable.

Do not use rank alone as evidence that a player's decisions were correct.

---

# Role-Specific Analysis

DPS, tanks, healers, and support specializations must not be forced through
identical performance rules.

Each specialization should explicitly declare its analysis model.

---

# DPS Analysis

For supported DPS specializations:

- SimulationCraft APL is the primary rotational authority.
- Warcraft Logs supplies observed state and encounter reality.
- Class/spec runtime data supplies game-specific semantics.
- Encounter analysis determines actionability.
- Comparable successful logs provide contextual validation.

Raw DPS or parse rank must not replace decision-level rotational analysis.

---

# Tank Analysis

For supported tank specializations:

SimulationCraft APL may be used for rotational and offensive decision analysis.

Tank analysis must additionally consider:

- Survival
- Defensive usage
- Active mitigation
- Tank mechanics
- Tank swaps
- Incoming damage
- Resource preservation where relevant
- Encounter-specific defensive timing

A tank should not be coached solely on maximizing DPS.

Defensive availability does not automatically mean a defensive should have
been used.

---

# Healer Analysis

Healer performance must not be evaluated as though healing were a traditional
DPS rotation.

Maximizing raw HPS is not automatically equivalent to optimal healing.

Healer analysis must account for:

- Available incoming damage
- Raid damage timing
- Tank damage timing
- Assigned healing cooldowns
- Health deficits
- Overhealing
- Triage decisions
- Emergency healing
- Absorbs
- External defensives
- Dispels
- Utility
- Movement
- Encounter mechanics
- Player deaths
- Other healers' cooldowns
- Raid strategy

A healer should not be penalized for failing to produce healing when there was
nothing useful to heal.

A high-HPS cast is not automatically correct merely because it produced large
numbers.

---

## Healer Authority Hierarchy

Different categories of healer decisions may have different authorities.

### Assigned Raid Cooldowns

When an explicit raid cooldown plan exists, that plan is authoritative for the
player's assignment.

Examples may include:

- Wowutils cooldown plans
- Officer-defined cooldown assignments
- Explicit raid healing plans

Evaluate whether the healer executed the assigned plan correctly.

Do not blame the healer for following an assigned plan correctly even if later
analysis suggests the plan itself should change.

Distinguish:

"Player failed the assignment"

from:

"The assignment may need to move."

### Non-Assigned Healing Decisions

Use the healer-specific analysis model explicitly configured for that
specialization.

Possible approved sources may include:

- Questionably Epic / QE Live
- Validated healer simulation models
- Spec-specific runtime rules
- Other explicitly approved healing models

Do not silently use a DPS-style SimulationCraft APL as the healer authority
unless the specialization explicitly declares that model appropriate.

Warcraft Logs remains authoritative for observed execution.

Comparable successful healer logs provide context, not absolute healing truth.

---

## Healer Damage-Event Model

Healer analysis should be organized around meaningful incoming-damage events
where practical.

The analyzer should eventually be able to reconstruct:

- Damage-event start
- Damage-event peak
- Damage-event duration
- Players affected
- Health deficits
- Healing received
- Absorbs
- Defensive mitigation
- Healing cooldown coverage
- Associated player deaths

This should support questions such as:

- Was healing actually required?
- Was the assigned cooldown active?
- Was the cooldown mistimed?
- Was useful healing available before a death?
- Was another healer already covering the event?
- Was the death actually caused by insufficient healing?

---

## Healer Comparison Logs

Raw HPS ranking must not be treated as the healer equivalent of rotational
correctness.

Healing output depends heavily on:

- Raid damage taken
- Number of healers
- Other healers' performance
- Defensive usage
- Strategy
- Kill time
- Deaths
- Composition
- Assignment differences

Prefer event-by-event behavior and cooldown timing over simple HPS comparison.

---

# Support Specialization Analysis

Support specializations require analysis that accounts for value created
through other players.

Do not evaluate support performance solely by personal DPS or healing.

Augmentation Evoker is the primary specialization currently requiring this
analysis model.

---

# Augmentation Evoker

Augmentation analysis must distinguish between:

- Personal rotation
- Buff maintenance
- Buff targeting
- Buff timing
- Supported-player state
- Raid/group cooldown alignment
- Value created through supported players
- Encounter-specific timing

Raw personal DPS is not a sufficient measure of Augmentation performance.

---

## Augmentation Rotational Authority

Where SimulationCraft supports the required Augmentation decision, its APL may
be used as rotational authority.

However, Augmentation evaluation must receive sufficient ally and buff state.

Do not evaluate an Augmentation decision using only the Evoker's personal state
when the correct decision depends on another player.

Relevant state may include:

- Active allies
- Valid buff targets
- Existing support buffs
- Buff durations
- Ally cooldown windows
- Ally deaths
- Encounter downtime
- Target availability
- Group composition

If required ally state cannot be reconstructed reliably, return UNKNOWN.

---

## Augmentation Buff Analysis

Augmentation analysis may evaluate concepts such as:

- Ebon Might usage and uptime
- Prescience usage
- Prescience target selection
- Breath of Eons timing
- Support-window alignment
- Buff overlap
- Buff coverage
- Whether supported players were alive
- Whether supported players could benefit
- Encounter-driven cooldown holds

Specific spell IDs, durations, targeting mechanics, and rotational rules belong
in runtime spec data.

Do not put required Augmentation game knowledge only in this document.

---

## Augmentation Target Selection

Buff target selection is a first-class analysis problem.

Do not assume:

- Any valid ally is equally valuable
- The highest-DPS player is always the best target
- A target selected by a rank-1 Augmentation player is universally correct

Target quality may depend on:

- Recipient specialization
- Recipient cooldown state
- Recipient burst timing
- Encounter phase
- Player survival
- Group composition
- Existing buffs
- Number of available targets

When target quality cannot be established reliably, report the observed choice
without declaring it wrong.

---

# Specialization Analysis Contract

Every specialization should eventually declare an explicit analysis contract.

Conceptually, this may include:

role:
- DPS
- TANK
- HEALER
- SUPPORT

rotationAuthority:
- SIMC_APL
- HEALER_MODEL
- SPEC_RULES
- NONE

cooldownAuthority:
- SIMC_APL
- RAID_PLAN
- SPEC_RULES
- CONTEXTUAL

performanceModel:
- DAMAGE
- SURVIVAL
- HEALING
- SUPPORT
- HYBRID

requiresAllyState:
- true
- false

requiresRaidDamageModel:
- true
- false

requiresEncounterModel:
- true
- false

The generic engine should inspect the specialization contract rather than
hard-coding behavior based on specialization names.

Avoid patterns such as:

if spec == Holy Paladin
if spec == Restoration Shaman
if spec == Augmentation

when the behavior can instead be driven by the specialization contract.

---

# Class, Spec, and Encounter Boundaries

Analysis must use layered mechanics rather than one universal collection of
rotational heuristics.

The application should have a generic engine while preserving class-specific,
spec-specific, and encounter-specific truth.

---

## Generic Core

The generic core implements concepts that apply across many or all
specializations.

Examples:

- Warcraft Logs event normalization
- Combat state reconstruction
- SimulationCraft APL evaluation framework
- Resource accounting framework
- Buff tracking
- Debuff tracking
- Cooldown tracking
- Target tracking
- Actionability
- Evidence
- Confidence
- UNKNOWN state
- Rule evaluation
- Reporting interfaces

The generic core must not contain arbitrary spec-specific rotational opinions.

---

## Class Layer

Class modules contain mechanics genuinely shared across multiple specs of the
same class.

Examples may include:

- Shared abilities
- Shared utility
- Shared defensive abilities
- Class-wide mechanics
- Shared resource behavior where appropriate

Do not place spec-specific behavior into the class layer merely to reduce code.

---

## Spec Layer

Each specialization should have an explicit runtime definition.

Spec modules may define:

- Analysis contract
- Applicable SimulationCraft APL
- Spell mappings
- Resource semantics
- Buff relationships
- Debuff relationships
- Cooldown relationships
- Talent interactions
- Hero talent interactions
- Spec-specific state
- Special interpretation required by the APL
- Spec-specific analysis requirements

SimulationCraft remains the rotational authority for supported DPS/tank
specializations.

Spec-specific code exists to provide the state and semantics required to
evaluate the chosen authority correctly.

Do not manually rewrite an entire SimC rotation as developer opinion.

---

## Encounter Layer

Encounter-specific logic determines whether theoretically correct actions were
actually reasonable during the real fight.

Encounter context may include:

- Intermissions
- Untargetable periods
- Forced downtime
- Target transitions
- Adds
- Mechanic-driven movement
- Strategy-dependent cooldown holds
- Encounter phases

Encounter rules must not permanently alter a specialization's general
rotational logic.

A rule that exists because of one boss belongs at the encounter layer rather
than being baked into general spec logic.

---

# Comparable Log Philosophy

Do not rely on one rank-1 parse as absolute truth.

When encounter context is inferred from player behavior, prefer multiple
comparable successful logs where practical.

Comparison may consider:

- Same encounter
- Same difficulty
- Same specialization
- Similar strategy
- Similar fight duration where relevant
- Same encounter phase or timestamp
- Player survival
- Relevant talent/build differences
- Group composition where relevant

Consensus across multiple successful logs is stronger environmental evidence
than behavior from a single parse.

---

# Actionability

A theoretical action should only become a coaching failure when that action was
reasonably actionable.

Before flagging a:

- Missed cast
- Delayed ability
- Idle global
- Cooldown delay
- Resource mistake
- Buff maintenance failure
- Rotational priority error

evaluate encounter context.

Potentially non-actionable situations include:

- Boss untargetable
- No valid target
- Encounter intermission
- Forced downtime
- Target transition
- Mechanic requiring disengagement
- Movement preventing the action
- Player incapacitated
- Fight effectively ending
- Other conditions supported by evidence

The analyzer must not evaluate the player as though they were attacking a
stationary, permanently available target when Warcraft Logs shows otherwise.

---

# Encounter-Normalized Analysis

Rotational timing must be normalized against encounter reality.

Example:

The APL says Ability X should be cast.

The player does not cast Ability X for 30 seconds.

During those same 30 seconds:

- The encounter enters an intermission.
- The boss is unavailable.
- Comparable successful logs show the same inactivity.

Result:

Do not report a 30-second rotational failure.

Instead, the first meaningful rotational opportunity begins when combat becomes
actionable again.

Preserve both facts:

- The APL would theoretically prioritize Ability X.
- The encounter made Ability X non-actionable during the interval.

---

# Environmental Evidence

Use the strongest available evidence when deciding whether an action was
possible.

Prefer evidence approximately in this order:

1. Direct Warcraft Logs encounter/state evidence
2. Direct target availability evidence
3. Direct mechanic/phase evidence
4. Explicit encounter runtime data
5. Consensus from comparable successful logs
6. UNKNOWN

Top logs are not required to prove an intermission when direct Warcraft Logs
evidence already establishes it.

Top-log consensus may help identify environmental behavior when raw encounter
state is ambiguous.

If evidence is insufficient, return UNKNOWN rather than assuming the player
made a mistake.

---

# UNKNOWN is a Valid Result

UNKNOWN is an intentional analyzer state.

If the analyzer cannot reliably determine a value or decision:

- Return UNKNOWN.
- Preserve available evidence.
- Do not silently guess.
- Do not fabricate state.
- Do not assume defaults merely to produce coaching.
- Do not penalize the player because analyzer evidence is incomplete.

Uncertainty must not silently become a coaching failure.

---

# Analysis Pipeline

Keep these stages logically separated:

1. Observed Facts
2. Derived State
3. Ideal Decision
4. Actionability
5. Rule Evaluation
6. Contextual Validation
7. Coaching Output

---

## 1. Observed Facts

Observed facts are directly supported by Warcraft Logs or another explicitly
authoritative source.

Examples:

- Player cast Judgment at 12.4 seconds.
- Player had 4 Holy Power at a resource anchor.
- Player gained a buff at 30.1 seconds.
- Target became unavailable.
- Player died at 185.2 seconds.

Observed facts should preserve source evidence whenever practical.

---

## 2. Derived State

Derived state is reconstructed from observed facts.

Examples:

- Holy Power immediately before a cast
- Combo Points immediately before a generator
- Cooldown availability
- Buff active window
- Debuff active window
- Resource deficit
- Valid targets
- Actionable combat time
- Relevant ally state

Derived state must preserve enough evidence to explain how it was calculated.

Do not invent passive generation, hidden state, or unsupported events.

If reconstruction cannot be performed reliably, use UNKNOWN.

---

## 3. Ideal Decision

Use the specialization's declared analysis authority.

For supported DPS and tank specs, this will normally be SimulationCraft APL.

For healer or support analysis, another explicitly configured model may apply.

The decision result should be structured rather than immediately converted to
coaching prose.

Possible fields include:

- Timestamp
- Recommended action
- Authority used
- Relevant rule/APL line
- Conditions evaluated
- Conditions satisfied
- Required state
- State confidence
- Alternatives considered

---

## 4. Actionability

Determine whether the theoretical recommendation could reasonably have been
executed.

Consider:

- Target availability
- Encounter state
- Intermission state
- Movement constraints when provable
- Crowd control
- Incapacitation
- Range when reliable evidence exists
- Fight termination
- Other environmental constraints

A non-actionable recommendation must not become a player failure.

---

## 5. Rule Evaluation

Compare actual behavior against the actionable ideal decision.

Examples:

- Correct action used
- Lower-priority action used
- Action delayed
- Resource wasted
- Cooldown held
- Buff dropped
- Required setup missed
- Assigned healing cooldown missed

Evaluation must remain structured and evidence-based.

---

## 6. Contextual Validation

Use encounter data and comparable successful logs to determine whether an
apparent deviation is:

- A real player mistake
- Encounter-driven behavior
- Strategy-dependent behavior
- Common successful behavior
- Uncertain

Contextual validation may:

- Confirm a coaching flag
- Suppress a coaching flag
- Reduce confidence
- Add encounter explanation
- Return UNKNOWN

Contextual validation must not silently rewrite the underlying authority.

---

## 7. Coaching Output

Human-readable coaching is generated from structured evaluations.

Coaching text is not the source of truth.

Tests should verify structured analyzer results rather than exact prose whenever
possible.

Reporting may explain:

- What happened
- What ideally should have happened
- Why the recommendation was actionable
- What evidence supports the conclusion
- How important the mistake was
- How the player can improve

---

# Resource Analysis

Resource analysis must distinguish between:

- Being at resource cap
- Generating resource while insufficient capacity exists
- Actual resource waste
- Intentional pooling
- Resource spending
- Resource state that cannot be reconstructed

Being at maximum resource is not automatically an error.

Example:

A Rogue being at maximum Combo Points before using a spender does not prove
Combo Points were wasted.

Waste requires evidence that generation occurred when insufficient capacity
existed, or another spec-specific condition establishes actual waste.

Do not equate:

resource_at_cap == resource_wasted

Resource evaluation must consider spec semantics and the applicable decision
model.

---

# Buff and Debuff Direction

Buff/debuff analysis must preserve:

- Source actor
- Target actor
- Ability/spell ID
- Application time
- Removal time where available

Do not assume an observed debuff in a player's event stream was applied by that
player.

Offensive debuffs, incoming debuffs, buffs, and target effects must maintain
correct source/target direction.

If direction cannot be established reliably, return UNKNOWN.

---

# Cooldown Analysis

Cooldown availability and cooldown quality are different concepts.

The analyzer may evaluate:

- Whether a cooldown was available
- Whether the applicable authority called for it
- Whether encounter conditions justified holding it
- Whether important setup occurred beforehand
- What happened during the cooldown window
- Whether another cooldown should overlap it
- Whether fight length affects remaining uses

Top-log timing may provide encounter context.

Top-log timing must not automatically replace the specialization's declared
authority.

---

# Death and Defensive Analysis

Death analysis must be evidence-based.

The analyzer should distinguish:

- What damage caused the death
- Whether the damage was avoidable
- Whether a defensive was available
- Whether that defensive was appropriate
- Whether the defensive had already been used
- Whether external mitigation existed
- Whether encounter mechanics made survival impossible or unlikely

Do not flag a defensive merely because it was off cooldown.

Availability does not prove use was required.

---

# Runtime Game Knowledge

Game-specific knowledge required by the deployed analyzer belongs in runtime
data or runtime code.

Examples:

- Spell IDs
- Buff IDs
- Debuff IDs
- Spell durations
- Cooldown durations
- Resource costs
- Resource generation
- Talent relationships
- Hero talent relationships
- Ability relationships
- Defensive mappings
- Encounter mechanics
- Spec metadata

Do not place required runtime knowledge only in:

- CLAUDE.md
- Agent instructions
- Prompts
- Comments
- Documentation

If the deployed analyzer needs the information, it must exist in runtime code
or runtime data.

---

# Agent Instructions vs Runtime Data

Agent instructions explain HOW to build and reason about the analyzer.

Runtime data tells the PROGRAM what Warcraft knows.

Example:

Agent instruction:

"Detect cooldown windows using observed cast and buff evidence."

Runtime data:

"Deathmark has spell ID X and duration Y."

Never substitute agent/model knowledge for missing runtime implementation.

---

# Warcraft Logs Integration Boundary

Warcraft Logs access must remain isolated from analysis logic.

Code that fetches Warcraft Logs data should not contain rotation coaching
rules.

Analysis code should operate against the normalized combat model rather than
directly querying Warcraft Logs.

This separation is required so recorded fixtures can reproduce behavior without
repeatedly calling the Warcraft Logs API.

The analyzer should be testable offline using captured fixtures.

---

# Normalized Combat Model

The first major implementation milestone is a reliable normalized
representation of a fight.

Before advanced coaching is added, the system should reliably represent:

- Report
- Fight
- Encounter
- Difficulty
- Fight start/end
- Fight duration
- Player identity
- Player source ID
- Class
- Spec
- Role
- Talents
- Hero talents where applicable
- Gear
- Casts
- Cast targets
- Buff applications
- Buff removals
- Debuff applications
- Debuff removals
- Resource anchors
- Explicit resource changes
- Damage dealt
- Damage taken
- Healing
- Absorbs
- Deaths
- Relevant allies
- Encounter phases where available
- Target availability where available

The normalized model must preserve enough evidence to trace derived results
back to observed Warcraft Logs data.

Do not begin sophisticated coaching until this model is trustworthy.

---

# Analyzer Boundaries

Major systems should remain modular.

Expected major areas include:

- API
- Warcraft Logs ingestion
- Event normalization
- Combat state reconstruction
- SimulationCraft APL handling
- Resource reconstruction
- Cooldown tracking
- Buff/debuff tracking
- Target tracking
- Ally-state tracking
- Actionability
- Rotation evaluation
- Healing analysis
- Support analysis
- Defensive analysis
- Death analysis
- Talent awareness
- Gear awareness
- Class mechanics
- Spec mechanics
- Encounter mechanics
- Comparison-log analysis
- Scoring
- Reporting
- Regression testing

Do not build one giant analyzer function containing all of these concerns.

---

# Structured Evidence

Important conclusions should preserve evidence.

Where practical, an evaluation should answer:

- What event was observed?
- What state was reconstructed?
- What source supports that state?
- What decision authority was used?
- What action was recommended?
- Was the action actionable?
- What did the player actually do?
- Was encounter context relevant?
- Did comparable successful logs show similar behavior?
- What confidence does the analyzer have?
- Why was the coaching flag produced or suppressed?

A coaching conclusion should be traceable back to evidence.

---

# Confidence

Do not represent uncertain conclusions as certain.

Structured evaluations should support confidence where useful.

Possible conceptual levels include:

- HIGH
- MEDIUM
- LOW
- UNKNOWN

Confidence must depend on evidence quality rather than how strongly a coaching
sentence is worded.

Low-confidence observations should not be presented as definitive mistakes.

---

# Public API Contracts

Do not change an existing public API response contract without explicit
approval.

Internal implementation may evolve while public contracts remain stable.

When a contract change appears necessary:

1. Explain why.
2. Describe the existing contract.
3. Describe the proposed contract.
4. Identify compatibility impact.
5. Wait for approval before making a breaking change when requested.

---

# Testing Rules

Every confirmed bug fix requires a regression test.

Do not:

- Delete a failing test merely to make the suite pass.
- Skip a failing test merely to make the suite pass.
- Weaken assertions merely to make the suite pass.
- Rewrite expected output to hide a regression.

A regression test should reproduce the original failure whenever practical.

Prefer testing structured analyzer state and evaluations over exact
human-readable coaching strings.

---

# Historical Regression Categories

Important known failure categories include:

- Missing actor metadata
- Null player names
- Null class metadata
- Incorrect spec hydration
- Resource-state ambiguity
- Invented resource generation
- Resource cap incorrectly treated as resource waste
- Incorrect buff source/target direction
- Incorrect debuff source/target direction
- Defensive mappings failing because class metadata is missing
- Cooldown-window misinterpretation
- Healer-specific evaluation errors
- Augmentation ally-state errors
- Regression parser failures
- Invalid comparison parses
- Comparison players dying before the fight ends
- Fight-duration comparison errors
- Encounter downtime being mistaken for rotational inactivity
- Top-log behavior incorrectly treated as rotational authority

These are regression categories, not permission to copy old implementation
patterns.

---

# Regression Fixtures

Important bugs and representative fights should eventually become reproducible
fixtures.

Fixtures should allow development without repeatedly calling live Warcraft Logs
APIs.

When a bug is found in a real log:

1. Preserve the minimum evidence required to reproduce it.
2. Create a regression case.
3. Make the test fail.
4. Fix the implementation.
5. Verify the regression passes.
6. Verify unrelated regression cases still pass.

---

# Comparison Parse Validity

A comparison parse should not automatically be treated as valid merely because
it ranked highly.

Where relevant, validate:

- Correct encounter
- Correct difficulty
- Correct specialization
- Player survival
- Sufficient fight participation
- Fight duration
- Strategy/build differences
- Group composition where relevant

A player who died substantially before the encounter ended may be unsuitable
for behavioral comparison.

Do not silently use invalid comparison data.

---

# Change Discipline

Prefer small, targeted changes.

Do not perform broad rewrites when a focused change solves the actual problem.

Before making a major architectural change:

1. Explain the problem.
2. Identify the current abstraction causing it.
3. Propose the replacement.
4. Describe affected tests.
5. Describe affected contracts.
6. Identify migration impact.
7. Wait for approval when requested.

If fixing one bug repeatedly causes unrelated systems to break, stop patching.

The abstraction may be wrong.

Escalate the architecture problem rather than continuing an uncontrolled patch
chain.

---

# Implementation Discipline

Before implementing a substantial feature:

1. Inspect the relevant existing code.
2. Explain the proposed approach.
3. Identify affected modules.
4. Identify data requirements.
5. Identify tests that should be created or changed.
6. Confirm the approach when requested.
7. Implement the smallest coherent solution.
8. Run relevant tests.
9. Report failures accurately.

Do not claim tests passed unless they were actually run successfully.

Do not claim Warcraft Logs data exists unless it was actually retrieved or is
present in a fixture.

---

# Clean-Rebuild Rule

This repository is vNext.

The old Warcraft Logs Coach implementation may be used as:

- Historical reference
- Regression inspiration
- Expected-output comparison
- Bug history
- API-contract reference

It should not automatically be treated as architecture worth preserving.

Do not copy large portions of the old Worker into vNext and attempt to refactor
them into correctness.

Build the new architecture deliberately.

---

# Final Development Principle

The analyzer should ultimately answer:

"What should this player have done differently, given the specialization they
were playing, their role, their available state, and the encounter they were
actually in?"

It should not merely answer:

"What did a higher-ranked player do differently?"

For supported DPS and tank rotation:

SimulationCraft describes ideal rotational priority.

For healers:

The configured healer model describes healing decisions, while authoritative
raid cooldown assignments govern assigned cooldown execution.

For Augmentation:

SimulationCraft may describe supported rotational decisions, while ally state,
buff targets, and raid context are required to evaluate support quality.

For everyone:

Warcraft Logs describes observed reality.

Class and specialization modules provide game-specific meaning.

Encounter analysis determines actionability.

Comparable successful logs provide environmental context and validation.

Structured evidence determines whether the analyzer has enough confidence to
coach the player.

When those sources cannot establish a conclusion reliably, return UNKNOWN.
