# Warcraft Logs Coach vNext

## Project Purpose

Warcraft Logs Coach vNext analyzes World of Warcraft combat logs and produces
accurate, evidence-based, actionable coaching.

The analyzer must prioritize correctness over producing an answer.

This project is a clean rebuild.

The old Warcraft Logs Coach may be used for:

- Regression discovery
- Historical behavior comparison
- Test-case discovery
- Public API contract reference
- Known failure-mode discovery

Do not copy the old architecture into vNext merely because it already exists.

---

# Document Authority

The project documents have different purposes.

## product-intent.md

`agent/product-intent.md` describes what the product owner wants the product to
do.

Product intent outranks architecture.

If architecture or implementation conflicts with product intent, stop and
resolve the conflict rather than silently following architecture.

## CLAUDE.md

This file describes development principles and constraints for agents working
on the project.

## architecture.md

`agent/architecture.md` describes the proposed software architecture.

Architecture may evolve when implementation evidence shows an abstraction is
wrong.

## testing.md

`agent/testing.md` describes how correctness must be demonstrated.

Tests must protect product intent rather than merely protect an implementation.

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
3. What was realistically possible.
4. Whether the difference was actually a player mistake.
5. Whether there is enough evidence to coach the player confidently.

---

# Core Architectural Principle

Warcraft Logs Coach is:

**a shared analysis platform with specialization-owned gameplay evaluation.**

It is NOT:

- One universal gameplay evaluator with 40 specs represented only as data.
- 40 completely independent analyzers that reimplement the same infrastructure.

Shared infrastructure should provide reusable primitives.

Examples:

- Warcraft Logs ingestion
- Event normalization
- Evidence
- Completeness
- Actor identity
- Resource primitives
- Aura primitives
- Cooldown primitives
- APL parsing/evaluation primitives
- Encounter/environment state
- Actionability primitives
- Finding schemas
- Reporting infrastructure

Each specialization owns interpretation of specialization-specific gameplay.

A specialization may contain both:

- Runtime data
- Evaluator code

Do not force specialization-specific judgment into a generic engine merely to
avoid specialization code.

Do not duplicate shared infrastructure inside each specialization.

---

# Specialization-Owned Evaluation

The specialization evaluator owns gameplay interpretation for that
specialization.

Examples include:

- Meaning of specialization resources
- Spec-specific APL state
- Ability relationships
- Buff/debuff interactions
- Cooldown setup
- Talent interactions
- Hero talent interactions
- Spec-specific actionability
- Spec-specific rotational conclusions

Shared code may provide primitives such as:

- buff uptime calculation
- cooldown drift calculation
- resource interval reconstruction
- action timing
- evidence attachment

but the specialization evaluator decides how those primitives apply to the spec.

Avoid architecture such as:

    if spec === "assassination"
    if spec === "protection_paladin"
    if spec === "blood_death_knight"

inside a supposedly generic gameplay evaluator.

If specialization-specific meaning is required, put it in that specialization's
evaluator.

---

# Analysis Authority

Different sources answer different questions.

Do not treat one source as authoritative for every category of analysis.

Authority may depend on:

- Specialization
- Role
- Decision category
- Fight
- Available inputs

Authority must be resolved for the specific decision being evaluated.

---

# Decision Categories

Analysis authority should be resolvable by decision category.

Important categories include:

- ROTATION
- RESOURCE
- COOLDOWN
- DEFENSIVE
- ASSIGNMENT
- HEALING_DECISION
- SUPPORT_TARGETING
- SUPPORT_TIMING
- PREPARATION

Additional categories may be added when justified.

Actionability is deliberately NOT a decision-authority category.

Actionability is a modifier that evaluates whether an authority-backed decision
was actually possible in the encounter.

It is not itself a specialization gameplay authority.

Authority must not be represented only as one static value for an entire
specialization when different decisions require different authorities.

Every evaluative finding must record an explicit authority.

For preparation findings:

- Observed usage facts record authority/source as `WCL_OBSERVED_FACT`.
- Preparation rules derived from game metadata record `RUNTIME_GAME_DATA`.

If no trustworthy authority exists for a requested decision:

    NO_AUTHORITY_AVAILABLE

is a valid result.

`NO_AUTHORITY_AVAILABLE` must not produce a player-failure finding.

---

# UNKNOWN vs NO_AUTHORITY_AVAILABLE

These two states are semantically distinct.

They are never interchangeable.

Use:

    NO_AUTHORITY_AVAILABLE

when no trustworthy authority or model exists for that decision category.

Examples:

- No raid cooldown plan was supplied for an ASSIGNMENT decision.
- No approved per-cast healer model exists for a HEALING_DECISION.
- No validated recipient-quality model exists for SUPPORT_TARGETING.

Use:

    UNKNOWN

when a valid authority exists, but the required combat state, evidence,
completeness, or supported expression is insufficient to evaluate it.

Examples:

- The APL is supported, but reconstructed Energy cannot decide the condition.
- Talent data is ABSENT, so a talent condition cannot be resolved.
- Required ally state was not retrieved within the ingestion scope.

Stated simply:

    NO_AUTHORITY_AVAILABLE = we have no trustworthy standard for this question.

    UNKNOWN = we have a standard, but not enough evidence to apply it.

Do not write documentation, code, or tests that offer these as alternatives for
the same situation.

Neither state may produce a player-failure finding.

---

# SimulationCraft Authority

For supported DPS and tank rotational decisions, the applicable SimulationCraft
APL is the primary rotational authority when:

- The relevant APL behavior is supported by the analyzer.
- Required combat state can be reconstructed sufficiently.
- The APL condition does not depend on unsupported or unknowable state.
- The decision belongs to a category SimulationCraft can validly model.

SimulationCraft should answer questions such as:

- What action has the highest rotational priority?
- Should a spender or generator be used?
- Should a cooldown be used rotationally?
- How do buffs, debuffs, talents, resources, and cooldowns affect priority?

Do not replace SimulationCraft priority with Warcraft Logs popularity.

A high-performing player is not automatically playing the rotation perfectly.

---

# SimulationCraft Does Not Define Encounter Reality

SimulationCraft describes theoretical gameplay decisions.

It does not prove that an action was physically or reasonably possible in the
actual encounter.

Warcraft Logs and encounter state determine actual environmental reality.

Example:

SimulationCraft says:

    Cast Deathmark.

Warcraft Logs shows:

    Boss is untargetable because the encounter entered an intermission.

Result:

    The theoretical recommendation is not actionable.

Do not coach the player as though they were fighting an always-available target
dummy.

---

# Unsupported SimulationCraft State

SimulationCraft APL syntax and state requirements must fail closed.

If an expression is unsupported:

    UNSUPPORTED

must not silently become:

    false

or:

    true

If unsupported state materially controls the APL decision:

    decision = UNKNOWN

or another explicit unsupported result.

Specialization evaluators may register or provide resolvers for
specialization-specific APL concepts.

Do not add specialization-specific hacks to a generic APL parser when a
declared specialization resolver is the correct abstraction.

---

# SimulationCraft Priority Short-Circuit

A SimulationCraft APL is an ordered priority list.

Uncertainty on a higher-priority line therefore contaminates every lower-priority
selection.

If a higher-priority action's condition evaluates:

    UNKNOWN

or:

    UNSUPPORTED

and that uncertainty can affect which action should be selected, the evaluator
must NOT fall through and confidently select a lower-priority action.

Return:

    decision = UNKNOWN

and preserve the blocking APL line/condition as evidence.

A lower-priority action may be selected only when the evaluator can prove that
the same resulting action would be selected under every possible resolution of
the unknown condition.

Example of the failure this prevents:

    Line 1: envenom,if=energy>=50&combo_points>=5
    Energy interval = [41, 58]
    Condition = UNKNOWN

    Line 2: mutilate

Incorrect result:

    expected = Mutilate
    actual   = Envenom
    status   = INCORRECT

Correct result:

    decision = UNKNOWN
    blockedBy = line 1 energy condition

An UNKNOWN must never be laundered into a confident player-failure finding by
falling through a priority list.

---

# Predictive and Hindsight State

SimulationCraft expressions may depend on information the player could not know
with certainty at the moment of play.

Examples include:

- fight_remains
- target.time_to_die

Do not use actual future fight results to blame the player for an earlier
decision.

APL state should be classified using the common classification:

- OBSERVABLE
- DERIVABLE
- PREDICTIVE
- SIM_ONLY
- UNSUPPORTED

For the initial implementation, if a PREDICTIVE value materially determines
whether a player should be blamed for an action and no player-knowable estimate
exists:

    return UNKNOWN

Do not silently substitute the actual future fight end.

Historical outcome may be reported retrospectively, but it must not be treated
as knowledge the player possessed earlier in the fight.

---

# Warcraft Logs Authority

Warcraft Logs is authoritative for observed combat reality.

Examples include:

- Player identity
- Actors
- Source IDs
- Encounter
- Difficulty
- Casts
- Buffs
- Debuffs
- Resources
- Damage
- Healing
- Absorbs
- Deaths
- Targets
- Timing
- Targetability
- Encounter phases where exposed
- Combat events

Observed Warcraft Logs evidence should not be rewritten because a model expected
something else.

If Warcraft Logs and another source disagree about what actually happened,
Warcraft Logs is authoritative for the observed event.

---

# Observed State vs Derived State

Observed state comes directly from evidence.

Derived state is calculated from observed evidence plus authoritative runtime
rules.

Derived state is allowed.

Fabricated state is not.

Example of valid derived state:

- Known Energy anchor
- Known authoritative Energy regeneration model
- Known modifiers
- Complete intervening event coverage

The analyzer may mathematically derive later Energy state.

Example of invalid fabricated state:

- Ability X normally generates resource.
- The required event/evidence is missing.
- Therefore assume the resource was generated.

Do not make that assumption.

---

# Resource Reconstruction Models

Resources may use different reconstruction models.

At minimum support the distinction between:

- DISCRETE_EVENT_OBSERVED
- CONTINUOUS_REGEN

Examples:

Combo Points and Holy Power commonly rely heavily on discrete observed changes.

Energy, Focus, and Mana may require continuous regeneration modeling.

For continuous resources:

1. Use exact reconstruction when every required input is known.
2. Use a bounded interval when only safe bounds can be proven.
3. Use UNKNOWN when reliable bounds cannot be established.

Example:

Energy interval:

    [62, 71]

APL condition:

    energy >= 50

Result:

    TRUE

Energy interval:

    [41, 58]

APL condition:

    energy >= 50

Result:

    UNKNOWN

Do not fabricate a single point estimate when only an interval is defensible.

---

# Resource Waste

Being at resource cap is not automatically resource waste.

Do not equate:

    resourceAtCap == resourceWasted

Example:

A Rogue is at 7 / 7 Combo Points and immediately spends them.

That does not prove resource was wasted.

Waste requires evidence that additional resource generation occurred when
insufficient capacity existed, or another specialization-specific rule
establishes actual waste.

Resource evaluation must be owned by the applicable specialization evaluator.

---

# Completeness Is First-Class State

Missing data must not silently become negative evidence.

The normalized combat model must preserve completeness information.

Relevant categories may include:

- Actor metadata
- Identity
- Talents
- Gear
- Casts
- Buffs
- Debuffs
- Resources
- Damage
- Healing
- Absorbs
- Deaths
- Encounter events
- Comparison data
- Ally/raid state

Completeness should support states such as:

- COMPLETE
- PARTIAL
- ABSENT

and should preserve relevant actor/time-range scope.

Examples:

Missing talent data does NOT mean:

    talent not selected

Partial event retrieval does NOT mean:

    player performed no events during the missing interval

Missing ally state does NOT mean:

    ally had no cooldown active

When required data is PARTIAL or ABSENT:

    use UNKNOWN

where that missing data affects the conclusion.

---

# Identity Safety

Player identity, class, specialization, and source ID must be validated before
specialization evaluation.

Do not allow:

- null player name
- null class
- incorrect specialization
- unresolved source ID

to silently flow into specialization gameplay analysis.

Observed abilities may be used as corroborating or conflict evidence.

Do not infer specialization solely because a particular signature ability was
or was not cast.

If authoritative identity metadata and observed behavior strongly conflict:

    IDENTITY_CONFLICT

should stop specialization evaluation rather than guessing.

---

# Warcraft Logs Retrieval Completeness

A Warcraft Logs request must record whether all requested pages and time ranges
were successfully retrieved.

If event retrieval is truncated, incomplete, rate-limited without successful
recovery, or otherwise partial:

    mark the affected scope PARTIAL

Do not interpret missing pages as inactivity.

A 30-second event gap caused by a failed page must never become:

    "You were idle for 30 seconds."

---

# Ingestion Scope

Different analysis types require different amounts of combat data.

Initially support exactly two explicit ingestion scopes:

- PLAYER_CONTEXT
- FULL_RAID

Scope is primarily about how much FRIENDLY RAID state is required.

`PLAYER_CONTEXT` means:

- the selected player's required combat state
- the required enemy/target state
- the required encounter/environment events

`PLAYER_CONTEXT` does NOT mean "only events sourced by the player."

Environmental and enemy evidence such as targetability, phases, and boss
activity is always required, because actionability depends on it.

`FULL_RAID` additionally includes the required state for all friendly raid
actors.

Do not implement a `ROLE_GROUP` scope until a real analysis use case requires
it.

The selected scope must be recorded in the normalized fight.

Analysis that requires information outside the retrieved scope must return
UNKNOWN or INSUFFICIENT_SCOPE rather than reasoning over absence.

Examples:

Ordinary DPS rotation may often use:

    PLAYER_CONTEXT

Healer raid analysis may require:

    FULL_RAID

Augmentation support analysis may require:

    FULL_RAID

---

# Ingestion Scope Derivation

The application service must DERIVE the required ingestion scope from the union
of required inputs declared by all enabled analyzers.

Scope must not be hand-picked per request or guessed.

A client must not arbitrarily choose a smaller scope that causes silent
under-fetching.

If a client requests a scope smaller than the derived requirement, either:

- widen the scope to the derived requirement, or
- return INSUFFICIENT_SCOPE for the affected analyses

Do not fetch full-raid data blindly when no enabled analyzer requires it.

Adding a new analyzer must not silently under-fetch simply because an older
scope value was hard-coded.

---

# Encounter and Actionability

A theoretical recommendation becomes a player coaching failure only if it was
reasonably actionable.

Actionability must consider evidence such as:

- Target availability
- Targetable events
- Intermission
- Encounter phase
- Player death
- Player incapacitation
- Forced downtime
- Encounter termination
- Spec-specific requirements

---

# ACTIONABLE Requires Positive Evidence

`ACTIONABLE` must NOT be the default merely because no restriction was
observed.

Absence of observed restriction is not evidence of availability.

`ACTIONABLE` requires either:

- sufficient positive environmental evidence, or
- COMPLETE coverage of the environmental state required by that decision

If the required targetability/encounter/environment evidence is PARTIAL or
ABSENT, and actionability cannot otherwise be established:

    actionability = UNKNOWN

Failure mode this prevents:

An encounter with ABSENT targetability data resolves every decision point to
ACTIONABLE by default, and a real 30-second intermission becomes a dozen
confident rotational findings.

`NOT_ACTIONABLE` requires evidence.

`ACTIONABLE` requires evidence too.

---

# Spec-Specific Actionability

Shared actionability infrastructure should represent environmental facts.

The specialization evaluator may refine actionability when specialization
mechanics matter.

Examples:

- Stealth requirement
- Valid target type
- Melee-specific ability requirement
- Special buff/state requirement

Do not push those specialization meanings into the generic environment engine.

---

# Movement Claims

Do not claim movement prevented an action unless reliable evidence establishes
that constraint.

Warcraft Logs does not provide a universal authoritative "player was moving"
stream.

Movement must not become a generic suppression reason merely because no better
explanation is available.

If movement cannot be established:

    UNKNOWN

rather than:

    NOT_ACTIONABLE_BECAUSE_MOVEMENT

---

# Encounter-Normalized Analysis

The analyzer must not treat every second of a fight as equally actionable.

Example:

The APL recommends Ability X.

The boss disappears for a 30-second intermission.

The player does not cast Ability X.

Expected:

- No 30-second missed-rotation finding.
- The first actionable opportunity resumes when the encounter becomes actionable.

The analyzer should preserve:

- The theoretical recommendation
- The environmental restriction
- The first actionable opportunity
- The player's actual action

---

# Comparable Logs

Comparable successful logs provide contextual evidence.

They are not the rotational authority.

Use them for things such as:

- Encounter strategy
- Common downtime
- Target transitions
- Common cooldown holds
- Phase behavior
- Corroborating environmental evidence

Do not use them simply because they are highly ranked.

---

# Comparison Consensus

Comparison behavior must not silently become "consensus" from one parse.

Comparison analysis should support explicit outcomes such as:

- CONSENSUS
- SPLIT
- INSUFFICIENT

A single parse must not be labeled consensus.

SPLIT and INSUFFICIENT must not produce a confident environmental claim.

Exact minimum sample and consensus thresholds should be configurable and
validated with real logs rather than hidden in ad-hoc code.

---

# Top Logs Cannot Override Rotational Authority

If SimulationCraft selects Ability A and several top logs use Ability B:

Do not automatically change the recommendation to Ability B.

Top-log popularity is not rotational truth.

---

# Top Logs Cannot Suppress Findings Merely by Similarity

Behavioral similarity alone must not suppress an authority-backed finding.

Example:

SimulationCraft says Kingsbane should be used.

Player does not use it.

Six top logs also skip it.

If there is no evidence establishing an environmental reason:

- Keep the finding.
- Comparison behavior may be attached as context.
- Do not suppress the finding merely because other players did the same thing.
- Do not lower confidence merely because other players did the same thing.

Comparison-supported suppression is permitted only when the evidence maps to a
named environmental/actionability reason such as:

- INTERMISSION
- TARGET_UNAVAILABLE
- FORCED_DOWNTIME
- PHASE_TRANSITION

A suppressed finding must remain represented structurally with a
machine-readable suppression reason.

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

This rule exists because lowering confidence is functionally equivalent to
suppression once reporting deprioritizes low-confidence findings.

Without it, comparison behavior becomes hidden rotational authority through the
confidence/TLDR channel.

---

# Healer Analysis

Healers must not be analyzed as DPS with HPS substituted for DPS.

Raw HPS is not an authoritative measure of healing quality.

Healer analysis must consider:

- Available damage to heal
- Health deficits
- Raid damage timing
- Tank damage timing
- Other healers
- Absorbs
- Defensives
- Overhealing
- Deaths
- Raid composition
- Healer count
- Encounter mechanics
- Assigned cooldowns
- Player actionability

A healer should not be penalized for failing to heal when there was no useful
healing available.

---

# Healer Cooldown Assignments

When an authoritative raid cooldown plan exists, that plan is authoritative for
the player's assignment.

The analyzer must distinguish:

    ASSIGNMENT_MET

from:

    PLAN_MAY_NEED_REVIEW

A healer who correctly follows an assigned plan must not be blamed because later
analysis suggests the plan itself could have been better.

When no authoritative plan exists:

- Do not invent an assignment.
- Do not infer an assignment merely from what other healers did.
- Assignment analysis should return NO_AUTHORITY_AVAILABLE.

Other evidence-grounded healer analysis may still proceed independently.

---

# Healer Model Limits

Do not describe QE Live or another healer tool as a per-cast runtime authority
unless there is actually a machine-usable model capable of supporting that
analysis.

Healer v1 should prefer evidence-grounded categories that can actually be
validated, such as:

- Assigned cooldown execution
- Raid damage-event coverage
- Healing cooldown coverage
- Death timelines
- Relevant absorbs
- Useful healing/overhealing context
- Other-healer coverage

Because no approved per-cast healer model currently exists, per-cast
spell-choice coaching resolves to:

    NO_AUTHORITY_AVAILABLE

This is a missing-authority condition, not a missing-evidence condition.

---

# Role Module Boundary

`src/healing/` and `src/support/` provide factual/shared primitives and
reconstructed role context.

Examples of legitimate role-module responsibilities:

- raid damage windows
- health deficits
- absorbs
- healing received
- cooldown coverage observations
- ally identity and survival
- buff recipients
- group composition

Role modules MUST NOT become universal gameplay evaluators.

Healer and support specialization-specific gameplay verdicts live in:

    src/specs/<class>/<spec>/

Do not allow role modules to accumulate:

    if spec === ...

gameplay interpretation.

A universal healer evaluator is the same rejected architecture as a universal
DPS evaluator, rebuilt one role at a time.

The rule from the core architectural principle applies identically to roles:

Shared modules reconstruct facts.

Specialization evaluators decide what those facts mean.

---

# Augmentation Evoker

Augmentation must not be treated as ordinary DPS.

Relevant state may include:

- Ally identity
- Ally specialization
- Buff recipients
- Recipient survival
- Recipient cooldowns
- Group composition
- Ebon Might state
- Prescience state
- Breath of Eons
- Encounter phase

SimulationCraft may be authoritative for an Augmentation decision only when it
can validly model that decision and the analyzer has the required state.

Authority is per decision, not globally assumed for the entire specialization.

---

# Augmentation v1

Do not block the entire project on complete modeling of every possible buff
recipient.

Initial Augmentation analysis may report evidence-grounded facts such as:

- Buff uptime
- Buff coverage
- Recipient identity
- Recipient alive/dead state
- Observable overlap with recipient cooldowns
- Support cooldown timing

Target-quality verdicts must distinguish the two failure states correctly.

No validated recipient-quality model currently exists, so SUPPORT_TARGETING
quality resolves to:

    NO_AUTHORITY_AVAILABLE

If such a model later exists but the required recipient state was not
retrieved or reconstructed:

    UNKNOWN

Do not confidently report:

    "Wrong Prescience target"

from a missing model or from incomplete recipient state.

---

# Preparation Analysis

Preparation is a shared analysis category, not specialization-owned rotation
logic.

Preparation findings may include:

- Health potion usage
- Healthstone usage
- Normal combat-potion usage
- Enchants
- Gems
- Talent/build context
- Other explicitly supported preparation checks

Preparation findings do not require an APL decision point.

They should still produce structured findings and flow through the same
reporting system.

Do not make the reporting layer independently inspect raw data to invent these
findings.

Preparation authority is `WCL_OBSERVED_FACT` for observed usage, or
`RUNTIME_GAME_DATA` for rules derived from game metadata.

---

# Preparation Is a Parallel Finding Producer

Preparation analysis runs in parallel with specialization evaluation.

It must NOT depend on a specialization evaluator having run.

Correct conceptual flow:

                         -> Specialization Evaluator --\
    Normalized Fight ---|                               |-> Structured Findings
                         -> Preparation Analyzer -------/

Both producers merge into the same structured finding stream.

Preparation analysis must still run when specialization gameplay evaluation is
unsupported, skipped, or blocked.

---

# Always-Report Consumables

Every analysis report must contain a status for:

- health potion usage
- healthstone usage
- normal combat-potion usage

This applies regardless of whether the player died.

This applies regardless of whether gameplay support exists for the
specialization.

If event completeness prevents a reliable count:

    status = UNKNOWN

Do not omit the category.

Do not report zero when consumable event coverage is PARTIAL or ABSENT.

A zero-use result backed by COMPLETE coverage is a valid observed fact.

Do not qualify this requirement with phrases such as "where supported" or
"supported reports."

---

# Racial Abilities Excluded

Racial ability analysis is excluded from initial analysis.

Do not add racial abilities to:

- rotation findings
- cooldown findings
- preparation findings
- coaching output
- scoring

until that scope is intentionally enabled later by the product owner.

---

# Damage Output Diagnosis

Aggregate damage differences are observations, not proof of cause.

Allowed informational observation:

    Rupture damage per minute was lower than comparable logs.

Not automatically allowed:

    You failed to cast enough Ruptures.

A causal coaching finding requires supporting decision-level evidence.

Possible causal evidence may include:

- Cast opportunities
- APL decisions
- Uptime
- Resource state
- Buff windows
- Target choice
- Cooldown alignment
- Encounter actionability

A numeric comparison delta alone must not generate a confident causal claim.

---

# Tank Analysis

Tank analysis must separate:

- Offensive rotation
- Defensive decisions
- Active mitigation
- Survival
- Encounter-specific tank mechanics

SimulationCraft may provide offensive/rotational authority where supported.

Tank coaching must not simply maximize DPS.

Important invariant:

    defensiveAvailable != defensiveRequired

A defensive being off cooldown does not prove it should have been used.

---

# Buff and Debuff Direction

Buff and debuff analysis must preserve:

- Source actor
- Target actor
- Ability ID
- Application time
- Refresh time
- Removal time
- Stacks where relevant

Do not infer direction merely because an event appeared in a player's stream.

Example:

Boss applies Debuff X to Player

is not:

Player applied Debuff X to Boss.

When direction matters and cannot be established:

    UNKNOWN

---

# Aura State

Aura modeling must account for real event semantics.

Potential cases include:

- Application
- Refresh
- Pandemic/extension behavior where applicable
- Stack changes
- Stack decay
- Removal
- Missing removal event
- Fight termination
- Haste-scaled duration where applicable

Do not extend a buff/debuff indefinitely merely because a removal event is
missing.

If the active interval cannot be established reliably:

    UNKNOWN

or a bounded interval should be used where appropriate.

---

# Cooldown State

Cooldown availability and cooldown quality are different questions.

The analyzer may need to model:

- Base cooldown
- Charges
- Recharge
- Resets
- Proc-driven resets
- Talent modification
- Cooldown reduction
- Cooldown windows

Do not infer:

    cooldown available

therefore:

    cooldown should have been used

The applicable authority, specialization semantics, and encounter actionability
still determine whether use was correct.

---

# Decision Points

The analyzer should evaluate meaningful decision opportunities rather than every
millisecond.

Decision points may include:

- Global cooldown availability
- Cast completion
- Channel completion
- Proc occurrence
- Important cooldown availability
- Target-state transition
- Encounter becoming actionable

Decision-point logic must account for:

- Cast time
- Channel time
- GCD overlap
- Queuing/tolerance
- Encounter availability

Do not produce hundreds of artificial missed-action findings because a player
was already casting or channeling.

---

# Timing Tolerance

Human play is not evaluated at exact zero-latency millisecond precision.

Timing tolerance should be configurable by finding category and validated using
real logs.

Do not hard-code one arbitrary global rule such as:

    0.2 seconds late = mistake

Tiny repeated timing differences should generally be aggregated into a pattern
rather than emitted as dozens of individual findings.

Prefer a smaller number of high-value, defensible coaching findings.

---

# Findings

All coaching originates from structured findings.

A finding should preserve enough information to answer:

- What category is this?
- What authority produced it?
- What evidence supports it?
- What state was reconstructed?
- What was expected?
- What actually happened?
- Was the action actionable?
- What confidence applies?
- Was the result suppressed?
- Why was it suppressed?
- Was required data complete?

Human-readable prose is produced from structured findings.

Reporting must not invent findings.

---

# Shared Finding Primitives

Specialization-owned evaluation must not lead to 40 duplicated implementations
of common calculations.

Shared primitives may include:

- Aura uptime
- Cast opportunities
- Cooldown drift
- Resource waste math
- Resource intervals
- GCD/gap calculation
- Evidence attachment
- Timing tolerance
- Actionability result construction

A specialization evaluator may use these primitives while retaining ownership
of gameplay interpretation.

If the same low-level calculation is independently implemented in many specs,
consider whether it belongs in the shared primitive library.

---

# UNKNOWN

UNKNOWN is an intentional result.

UNKNOWN must not silently collapse into:

- false
- true
- zero
- maximum
- empty list
- not active
- no target
- no cast
- no talent

When required state is unknown:

- Preserve evidence.
- Preserve the reason.
- Do not blame the player.
- Do not score the result as failure.

---

# Evidence

Important conclusions must be traceable.

Evidence may reference:

- WCL event
- Raw WCL response
- Normalized event
- Resource anchor
- Resource interval
- Aura event
- Cooldown state
- APL condition
- Runtime metadata
- Encounter state
- Raid assignment
- Comparison evidence

The analyzer should be debuggable enough to answer:

    Why did it tell me this?

---

# Confidence

Confidence describes evidence quality.

Possible conceptual values include:

- HIGH
- MEDIUM
- LOW
- UNKNOWN

Confidence must not simply reflect how large a DPS/HPS difference was.

Large difference + poor evidence may still be LOW confidence.

---

# Runtime Game Knowledge

Game knowledge required by deployed analysis belongs in runtime code/data.

Examples:

- Spell IDs
- Spell properties
- Cooldowns
- Charges
- Resource behavior
- Talents
- Hero talents
- Buff/debuff metadata
- Item metadata
- Enchant metadata
- Gem metadata
- Consumable metadata
- Encounter metadata

Do not rely on:

- CLAUDE.md
- model memory
- comments
- prompts
- documentation

as the deployed source of game truth.

---

# Runtime Data Provenance

Runtime data must preserve provenance.

Where practical include:

- Expansion
- Season
- Game build
- Data revision
- Source
- Retrieval/generation date

Do not silently use runtime data known to be incompatible with the analyzed log.

Initial policy:

If the analyzer knows the loaded runtime data is incompatible with the log's
game version:

    fail closed

Do not silently proceed with confident coaching.

The exact source/generation pipeline for runtime game data must be explicitly
selected before large amounts of game data are entered manually.

---

# Application Services

User-facing interfaces must not contain separate gameplay analyzers.

REST/API and future MCP interfaces should call the same application services.

Conceptually:

    REST
       \
        -> Analysis Service -> Analyzer
       /
    MCP

MCP may be deferred.

The service boundary should exist early enough that adding MCP later does not
require creating a second analysis path.

---

# Unsupported Specialization

The product intends to support every specialization eventually.

Until a specialization has an evaluator, gameplay evaluation for that
specialization is unsupported.

The application service must expose an explicit result:

    SPEC_NOT_SUPPORTED

When specialization gameplay evaluation is unsupported:

- Do not return a normal-looking empty gameplay report.
- Clearly disclose that specialization gameplay analysis is unsupported.
- Still run supported specialization-independent analysis such as preparation
  and other factual observations.
- Clearly label the resulting report as partial coverage.

Failure mode this prevents:

An unsupported specialization produces a well-formed report containing no
gameplay findings, which reads to the player as "you played perfectly."

Absence of analysis is not evidence of good play.

---

# Warcraft Logs Authentication

For Milestone 1, Warcraft Logs access uses a server-side OAuth Client
Credentials flow for public-report access.

The Warcraft Logs client ID and client secret are backend secrets.

They must never be exposed to:

- browser client code
- WoW addon code
- public API responses
- logs, error messages, or fixtures

Private-report support is deferred.

Future private-report support may use user-authorized Warcraft Logs OAuth
(Authorization Code or PKCE as appropriate).

Adding user-authorized access must not create a second analyzer or a second
analysis path.

The authentication method affects Warcraft Logs access only.

It does not affect gameplay analysis.

---

# Warcraft Logs Integration Boundary

Warcraft Logs access must remain separated from gameplay evaluation.

WCL modules are responsible for:

- Authentication
- GraphQL
- Pagination
- Retrieval
- Raw source preservation
- Completeness reporting

They should not contain specialization coaching logic.

Specialization evaluators should operate against normalized combat data rather
than independently issuing arbitrary live WCL queries.

---

# Multi-Target Support

Do not silently evaluate unsupported multi-target conditions as single target.

APL concepts such as:

- active_enemies
- spell_targets
- target_if
- cycle_targets

must be explicitly supported or return UNSUPPORTED/UNKNOWN.

For the first vertical slice, it is acceptable to scope support to a documented
subset of single-target decisions.

Unsupported AoE/multi-target decisions must fail closed.

---

# First Vertical Slice

The first full specialization should exercise the complete architecture.

The first specialization is Assassination Rogue.

Do not plan to switch away from Assassination merely because complete Energy
modeling is difficult.

If continuous-resource modeling initially prevents adequate coverage:

1. First narrow the supported Assassination decision surface to decisions that
   can be evaluated honestly.
2. Unsupported Energy-dependent decisions remain UNKNOWN.
3. Document the narrowed surface explicitly.

Only reconsider the specialization if implementation evidence demonstrates that
even a useful honest Assassination vertical slice cannot be achieved.

Narrowing the supported surface is the correct response to difficulty.

Guessing resource state is not.

The slice should prove:

Warcraft Logs
    ->
Normalization
    ->
Completeness
    ->
Combat State
    ->
Assassination Evaluator
    ->
SimulationCraft APL
    ->
Ideal Decision
    ->
Encounter Actionability
    ->
Structured Finding
    ->
Minimal Coaching

It must also prove the non-APL preparation finding path.

Minimum viable actionability belongs inside the first slice.

Do not postpone all encounter awareness until after the first evaluator.

---

# First Slice Supported Decision Surface

The first slice must explicitly document what it supports.

Examples:

- Supported APL expressions
- Unsupported APL expressions
- Supported resources
- Supported target model
- Supported actionability reasons
- Supported encounter state
- Supported cooldown mechanics

Unsupported decisions must return UNKNOWN/UNSUPPORTED.

"Works" is not an acceptable completion criterion without a defined supported
decision surface.

---

# UNKNOWN Coverage Must Be Measured

UNKNOWN is valid, but a system that returns UNKNOWN for nearly everything is not
finished.

For the first vertical slice:

- Measure the percentage of meaningful decision points that resolve.
- Enumerate UNKNOWN reasons.
- Review whether each unresolved category is justified.
- Establish an explicit coverage threshold before declaring the slice complete.

Do not game the metric by converting unknown state into guesses.

Coverage measures implementation completeness.

It does not override fail-closed correctness.

---

# Preparation Must Be Included in the First Slice

The first vertical slice must also prove that non-rotational findings can flow
through the architecture.

At minimum include supported preparation facts such as:

- Health potion usage
- Healthstone usage
- Combat potion usage

This proves findings do not need to originate from an APL decision.

---

# Raid First

Initial encounter-focused development should prioritize raid logs.

Mythic+ is a future supported target.

Do not distort the first architecture merely to support both raid and Mythic+
encounter models simultaneously before the raid model is trustworthy.

The architecture should remain extensible to Mythic+.

---

# Testing Rules

Every confirmed bug should eventually receive a regression test.

Do not:

- Delete a failing test just to make CI green.
- Skip a failing test just to make CI green.
- Weaken assertions merely to hide a regression.
- Rewrite expected output merely because implementation changed.

Tests should prefer structured findings/state over exact prose.

---

# Mandatory Negative-Test Philosophy

Tests must prove not only that correct findings appear, but that incorrect
findings do NOT appear.

Important negative cases include:

- Missing talents must not become talent=false.
- Partial event retrieval must not become inactivity.
- Wrong/contradictory spec identity must not proceed normally.
- Resource cap must not automatically become waste.
- Unsupported APL expressions must not evaluate false.
- Predictive/hindsight state must not use future knowledge silently.
- Top-log behavioral similarity must not suppress a finding by itself.
- Top-log behavioral similarity must not reduce confidence by itself.
- Numeric damage differences must not become unsupported causal claims.
- UNKNOWN findings must not contribute negative score.
- Encounter downtime must not become rotational failure.
- Missing Aug recipient state must not become wrong-target coaching.
- Missing healer plan must not become an inferred assignment.
- Absent targetability/environment data must not default to ACTIONABLE.
- An UNKNOWN higher-priority APL condition must not fall through to a
  confident lower-priority recommendation.
- UNKNOWN must not be substituted for NO_AUTHORITY_AVAILABLE, or vice versa.
- An unsupported specialization must not produce an empty report that reads as
  clean play.
- A low-coverage analysis must not present itself as a complete assessment.
- Consumable categories must not be omitted when completeness is insufficient.
- Racial abilities must not appear in findings while excluded.

---

# Historical Failure Categories

Important known failure categories include:

- Null actor metadata
- Null class metadata
- Incorrect specialization hydration
- Partial/truncated WCL retrieval
- Resource ambiguity
- Resource cap incorrectly treated as resource waste
- Invented resource state
- Continuous-resource reconstruction errors
- Incorrect buff source/target direction
- Incorrect debuff source/target direction
- Aura-window errors
- Cooldown charge/reset errors
- Defensive mapping dependent on missing identity
- Encounter downtime interpreted as rotation failure
- Fight-duration normalization errors
- Invalid comparison parses
- Dead comparison players
- Healer HPS misuse
- Healer assignment misuse
- Augmentation missing ally state
- Top-log behavior becoming rotational authority
- Comparison behavior suppressing findings without environmental evidence
- Comparison behavior lowering confidence without evidence
- Unsupported APL syntax silently changing decisions
- Hindsight state producing unfair coaching
- Actionability defaulting to ACTIONABLE without evidence
- UNKNOWN APL conditions falling through to lower-priority actions
- UNKNOWN and NO_AUTHORITY_AVAILABLE used interchangeably
- Unsupported specializations producing empty reports that imply clean play
- Partial analysis presented as a complete assessment
- Silent under-fetching from an incorrectly narrowed ingestion scope

These categories should inform regression tests.

They are not permission to copy old implementation patterns.

---

# Change Discipline

Prefer small coherent changes.

If fixing one problem repeatedly breaks unrelated systems:

Stop.

Do not continue an uncontrolled patch chain.

That is evidence the abstraction may be wrong.

Before a major architectural change:

1. Explain the problem.
2. Identify the failing abstraction.
3. Propose the replacement.
4. Explain affected contracts.
5. Explain affected tests.
6. Wait for approval when requested.

---

# Implementation Discipline

Before implementing a substantial feature:

1. Read product intent.
2. Read relevant architecture.
3. Inspect existing implementation.
4. Identify the owning specialization/shared layer.
5. Identify required inputs.
6. Identify authority.
7. Identify UNKNOWN behavior.
8. Identify actionability behavior.
9. Identify tests.
10. Implement the smallest coherent solution.
11. Run focused tests.
12. Run relevant regressions.
13. Report actual results accurately.

Do not claim tests ran when they did not.

Do not claim WCL evidence exists unless it was actually retrieved or exists in a
fixture.

---

# Autonomous Tranche Workflow

This is standing behavior for all work in this repository. The owner may say
something as short as "Start G4." or "Continue." and expect the whole workflow
below without repeating it.

Whenever the owner asks you to implement, continue, start or finish a
milestone or tranche:

1. Determine the current repository and milestone state from:
   - CLAUDE.md
   - agent/architecture.md
   - agent/testing.md
   - agent/follow-ups.md
   - git history and status
   - the current branch and PR state (`gh pr list`, `gh pr view`).

2. If beginning new tranche work:
   - update local main (`git fetch`, fast-forward only);
   - create an appropriately named feature branch;
   - never work directly on main.

   If the tranche needs files that exist only on an unmerged feature branch,
   stack the new branch on that branch and target the PR at it. GitHub
   retargets the PR to main when the parent merges.

3. Implement the tranche.

4. Run all required focused validation.

5. Maintain `agent/review-request.md` (the rolling, concise review request).

6. Before committing, run the local OpenAI architecture review:

       powershell -ExecutionPolicy Bypass -File scripts/review/openai-review.ps1

7. Read `.probe/openai-review/latest.txt`.

8. If the verdict is CHANGES_REQUIRED:
   - fix the substantive findings;
   - rerun the affected tests;
   - update `agent/review-request.md`;
   - rerun the OpenAI review;
   - repeat until APPROVED or OWNER_DECISION_REQUIRED.

9. If OWNER_DECISION_REQUIRED:
   - stop and ask the owner only the actual decision, in plain English;
   - do not dump the full tranche report unless requested;
   - after the answer, record the decision in agent/architecture.md or
     agent/follow-ups.md, implement it, revalidate and re-review.

10. If APPROVED:
    - inspect the full git status;
    - ensure every intended tracked and untracked tranche file is included;
    - preserve the intentionally excluded local files (below);
    - run `git diff --check`;
    - stage only the intended files;
    - commit to the feature branch;
    - push the branch.

11. If the branch has no PR, create one with the GitHub CLI:

        gh pr create --base main --head <branch> --title "<tranche title>" --body-file agent/review-request.md

    For a stacked branch, `--base` is the parent feature branch. If the PR
    already exists, update it (`gh pr edit --body-file agent/review-request.md`)
    rather than creating another.

12. Watch the real GitHub CI:

        gh pr checks <number> --watch

13. If CI fails:
    - inspect the failed check or run with gh (`gh run view <id> --log-failed`);
    - diagnose and fix routine implementation failures yourself;
    - rerun the required local validation;
    - rerun the OpenAI architecture review if code or architecture changed;
    - commit and push the fixes;
    - watch CI again.

14. Read the GitHub PR reviews and comments with gh
    (`gh pr view <number> --json reviews,comments`). Look specifically for
    architecture-review verdicts (`VERDICT: ...`).

15. If a GitHub review returns CHANGES_REQUIRED:
    - fix it;
    - validate;
    - rerun the local OpenAI review;
    - commit and push;
    - allow another GitHub review cycle.

16. If a GitHub review returns OWNER_DECISION_REQUIRED, stop and ask the owner
    only the required decision.

17. A tranche is complete only when all of these hold:
    - the local OpenAI architecture review is APPROVED;
    - the GitHub architecture review is APPROVED, when one is present;
    - GitHub CI is GREEN.

18. Once complete, tell the owner only:

        "<tranche> is approved and CI is green. PR #<number> is ready to merge."

## Owner Interruption Policy

Do NOT interrupt the owner for:

- branch creation;
- staging;
- commits;
- pushes;
- PR creation;
- PR updates;
- CI monitoring;
- ordinary test failures;
- ordinary CI failures;
- review corrections;
- staging-file enumeration;
- routine implementation decisions.

Interrupt the owner only for:

- OWNER_DECISION_REQUIRED;
- credentials or authentication problems;
- destructive or irreversible actions;
- production deployment;
- merge authorization;
- a genuine product or architecture decision.

## Git Safety

You may automatically:

- create feature branches;
- stage intended files;
- commit;
- push feature branches;
- create and update PRs;
- inspect CI;
- inspect reviews;
- fix CI and review findings.

You may NOT automatically:

- push directly to main;
- force-push main;
- merge PRs;
- bypass required checks;
- deploy to production.

Merging remains owner-controlled unless the owner explicitly changes this
policy.

## Local File Exclusions

Never stage, commit or delete these local files unless the owner explicitly
changes this list:

- .claude/
- scripts/probe/wcl-external-candidate.probe.ts
- scripts/probe/wcl-rankings-schema.probe.ts
- scripts/probe/wcl-rankings-shape.probe.ts

`.probe/` is gitignored and never committed.

## OpenAI Review

The local OpenAI reviewer (`scripts/review/openai-review.ps1`, policy in
`agent/openai-review-policy.md`) remains read-only. Its output under
`.probe/openai-review/` is transient and never authority.

- Do not skip it.
- Do not silently override a substantive reviewer finding.
- If you disagree with a finding, rerun the review with the disputed evidence,
  using the existing mechanism:

      powershell -ExecutionPolicy Bypass -File scripts/review/openai-review.ps1 -DisputeFile <path>

- Escalate only if the disagreement becomes a genuine owner-level
  architecture or product decision.
- Never treat an APPROVED verdict as permission to weaken an explicit rule in
  this file or in agent/architecture.md.

---

# Reporting

Reporting consumes structured findings.

Reporting may:

- Rank findings
- Summarize findings
- Format markdown
- Format JSON
- Produce TLDR
- Explain evidence

Reporting must not:

- Query WCL to invent new gameplay conclusions
- Re-evaluate the specialization independently
- Turn UNKNOWN into certainty
- Turn SUPPRESSED into failure
- Convert a numeric difference into unsupported causality
- Present a partial analysis as a complete assessment

Prefer a small number of high-value actionable findings over overwhelming the
player with trivial timing differences.

---

# Reported Coverage

The report must disclose its own analysis coverage and completeness.

If any of the following are true:

- decision coverage is low
- important data is PARTIAL
- specialization gameplay is unsupported
- important categories are UNKNOWN

then the report must not read as though it were a complete assessment.

All fail-closed machinery in this project is internal.

Coverage disclosure is how that honesty reaches the person reading the output.

A player must be able to tell the difference between:

    "We analyzed this fight and found little to fix."

and:

    "We could only analyze part of this fight."

---

# Final Development Principle

The analyzer should answer:

"What should this player have done differently, given the specialization they
were playing, the state they could reasonably be evaluated against, and the
encounter they were actually in?"

It should not merely answer:

"What did a higher-ranked player do differently?"

Shared infrastructure provides reliable combat primitives.

Specialization evaluators own gameplay interpretation.

SimulationCraft provides rotational authority where applicable and supported.

Warcraft Logs provides observed reality.

Encounter evidence determines actionability.

Healer assignments govern assignment execution when a real assignment exists.

Augmentation requires ally context where the decision depends on allies.

Comparable logs provide environmental context, not rotational truth.

Preparation analysis reports required non-rotational facts.

Structured evidence determines whether the analyzer has enough confidence to
coach the player.

When no trustworthy authority exists for the decision:

return NO_AUTHORITY_AVAILABLE.

When an authority exists but required evidence is insufficient:

return UNKNOWN.

Do not guess.
