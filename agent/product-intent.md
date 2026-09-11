# Warcraft Logs Coach vNext — Product Intent

## Purpose of This Document

This document records what the product is intended to do.

It is deliberately separate from:

- CLAUDE.md, which governs agent/developer behavior
- architecture.md, which describes how the product is built
- testing.md, which describes how correctness is validated

Architecture may change.

Product intent should remain stable unless the product owner changes it.

---

# Product Goal

Warcraft Logs Coach should give an individual World of Warcraft player a useful
answer to:

> What should I improve on this fight, and what specifically should I do
> differently next time?

The target is not merely a statistics report.

The product should coach.

It should help a player understand how to move from weak or average execution
toward strong execution on a specific encounter.

The product should cover more than DPS/HPS.

Major areas include:

- rotation
- resources
- cooldowns
- damage/healing performance
- defensives
- deaths
- preparation
- talents/gear where reliable
- consumables
- encounter context

---

# All-Spec Goal

The product should eventually support every World of Warcraft specialization.

"One product for all specs" does not mean "one universal gameplay evaluator."

The current product decision is:

> Use one shared analysis platform with specialization-owned evaluation.

Shared systems should prevent duplicated plumbing.

Each specialization should still be analyzed according to its own mechanics,
authority, resources, cooldowns, talents, role, and encounter needs.

This decision intentionally replaces the earlier idea that all specs should be
evaluated through one generalized gameplay engine.

The reason is accuracy: generalized interpretation repeatedly creates
spec-specific exceptions and false conclusions.

Because specializations are supported one at a time, most specializations will
be unsupported for a long period.

An unsupported specialization must be told so plainly.

The product must not return a normal-looking report containing no gameplay
findings, because a player reads that as confirmation of clean play.

Specialization-independent analysis such as preparation should still run, and
the report should be labelled as partial coverage.

Absence of analysis is not evidence of good play.

---

# Accuracy Standard

A useful report must be defensible from evidence.

The product should prefer:

- a smaller number of accurate findings

over:

- a large number of plausible findings

When the analyzer cannot establish a conclusion reliably, UNKNOWN is acceptable.

The product must not blame a player for missing analyzer data.

---

# Rotational Authority

For supported DPS and tank rotational decisions, SimulationCraft APL should be
the rotational "bible."

The goal is not to invent a house rotation.

The goal is to evaluate the applicable SimC priority against the player's real
fight state.

The product should answer questions such as:

- What did the APL call for at this decision point?
- What did the player actually press?
- Was the APL recommendation actually actionable?
- If not, should the apparent deviation be suppressed?
- If yes, was the deviation meaningful enough to coach?

---

# Warcraft Logs Role

Warcraft Logs provides the real fight.

It is the source for observed:

- player actions
- resources
- buffs/debuffs
- damage
- healing
- deaths
- actors/targets
- talents/gear when available
- encounter timing
- encounter events

The product should reconstruct as much reliable state as WCL allows.

It must not fabricate missing state just to complete an evaluation.

---

# Encounter Context

The product must understand that a raid encounter is not a Patchwerk dummy.

Examples that can make a theoretical action non-actionable include:

- intermissions
- untargetable bosses
- target transitions
- forced movement
- mechanics
- player incapacity
- phase changes
- fight end

A 30-second encounter intermission must not become 30 seconds of rotational
mistakes.

When direct WCL/encounter evidence proves downtime, that evidence is sufficient.

Top logs may corroborate ambiguous environmental behavior but should not be
required when the encounter state is already known.

The reverse also matters. The product must not assume an action was possible
simply because no obstacle happened to be recorded.

If the encounter evidence needed to judge a moment is missing or incomplete,
the product says it does not know, rather than treating the moment as a normal
opportunity the player wasted.

Absence of observed restriction is not evidence of availability.

---

# Top-Log Philosophy

Top/high-performing logs are useful but are not the rotational authority.

They are best used to understand:

- encounter strategy
- common downtime
- phase timing
- target transitions
- practical cooldown holds
- how successful players handled environmental constraints

The product should prefer a set of valid comparable logs over blindly copying
one rank-1 player.

A top parse can contain mistakes.

A low parse can contain good decisions.

Comparison behavior provides context. It does not rewrite the declared
rotational authority.

Comparison behavior must not suppress a finding, and must not lower a finding's
confidence, merely because other players behaved the same way.

Confidence describes evidence quality, not popularity. Lowering confidence on
similarity alone would be suppression by another name, because reports
deprioritize low-confidence findings.

Comparison behavior may change confidence or actionability only when it
corroborates real evidence, such as an environmental or encounter cause.

---

# Comparison Validity

Comparison players should be validated before their behavior is used.

Relevant checks may include:

- same encounter
- same difficulty
- same spec
- meaningful participation
- survival where full-fight behavior matters
- fight duration
- build/talent differences
- raid/group composition where relevant
- healer count for healer comparisons
- support-recipient context for Augmentation

A player who dies halfway through the fight should not silently become the
full-fight comparison baseline.

Fight-duration normalization should consider actionable encounter time, not only
raw seconds.

---

# Class and Specialization Intent

Specialization accuracy is more important than forcing every spec into the same
evaluation rules.

The specialization should own interpretation of:

- rotational state
- resource quality
- cooldown quality
- spec-specific setup
- spec-specific defensives
- talent/hero-talent interactions
- special target rules
- other spec-specific findings

A class layer may share genuinely common mechanics, but should not become a
mandatory abstraction.

---

# Resource Intent

Resource coaching must distinguish between:

- being capped
- actual waste
- intentional pooling
- spending
- unknown state

Being at cap is not automatically a mistake.

Actual resource waste should require evidence that generation was lost or
another specialization-valid condition proves waste.

---

# Cooldown Intent

Cooldown analysis should be more meaningful than cast-count comparison.

The product should consider:

- whether the cooldown was available
- whether the spec authority called for it
- setup before the window
- actions inside the window
- encounter holds
- remaining uses/fight duration
- overlap with related effects

Top logs may help show encounter-driven timing but do not automatically define
optimal cooldown timing.

---

# Damage Output Intent

Damage differences are useful diagnostic evidence.

They should not automatically be turned into causal coaching.

For example:

"Your Rupture damage was lower"

does not by itself prove:

"You failed to cast enough Ruptures."

The product should use casts, uptime, target choice, buff windows, resources,
APL decisions, and encounter context to identify the likely actionable cause.

---

# Tank Intent

Tank reports should include offensive execution where useful, but must not
optimize DPS at the expense of tank responsibilities.

Tank analysis may include:

- SimC-based rotational execution
- active mitigation
- defensives
- incoming damage
- survival
- tank-specific resource handling
- encounter/tank mechanics
- deaths

A defensive being available does not prove it should have been used.

---

# Healer Intent

Healers require a separate interpretation model.

The product should not rank healer quality using HPS alone.

Healing depends on:

- damage available to heal
- health deficits
- overhealing
- raid composition
- healer count
- other healers
- absorbs
- defensives
- assignments
- encounter strategy
- deaths

Healer analysis should increasingly focus on meaningful damage events rather
than just totals.

---

# Healer Cooldown Plans

When the raid has an authoritative cooldown plan, that plan governs whether a
healer executed the assignment correctly.

A planned cooldown and the healer's actual use should be compared directly.

The product must distinguish:

- the player failed the assignment
- the player met the assignment
- the player could not reasonably perform the assignment
- the assignment itself may need review

If a healer follows the plan correctly and the raid later dies, the report must
not rewrite history and accuse the healer of failing the earlier assignment.

When no authoritative plan exists, there is no assignment to evaluate.

The product must not infer an assignment from what other healers happened to
do, and must not report a missed assignment that never existed.

---

# Healer Non-Cooldown Decisions

For ordinary healer decisions, use an explicitly approved healer model.

Potentially useful authorities include:

- QE Live
- validated healer simulation/modeling
- specialization-specific rules

The exact model may differ by healer specialization.

Do not force all healers through a DPS-style APL model.

A named tool only becomes an authority once a machine-usable model actually
exists and is integrated. Until then, per-cast healer spell-choice coaching has
no authority and must say so rather than improvising one.

---

# Augmentation Evoker Intent

Augmentation requires support-aware analysis.

Personal DPS alone is not an adequate performance measure.

Analysis may require:

- Ebon Might state
- Prescience state
- recipient selection
- recipient survival
- recipient cooldowns
- Breath of Eons timing
- support-window alignment
- group composition
- encounter timing

If recipient state required for a verdict is unavailable, return UNKNOWN rather
than guessing that the target choice was wrong.

---

# Death and Defensive Intent

Deaths should be analyzed as timelines.

The product should try to explain:

- what killed the player
- what happened immediately before the death
- whether a relevant defensive was available
- whether using it was appropriate
- whether it was already used
- whether external mitigation/healing existed
- whether the player could act
- whether the damage was avoidable

"Defensive available" must not automatically become "player should have used
it."

---

# Preparation Intent

Preparation matters because it can be easier to fix than complex rotation.

When reliable data is available, preparation analysis may include:

- missing enchants
- missing gems
- talent/build context
- consumables

Every report must include a status for:

- health potion usage
- healthstone usage
- normal combat-potion usage

This applies whether or not the player died.

This applies whether or not the analyzer supports gameplay analysis for that
specialization.

If data completeness prevents a reliable count, the status is UNKNOWN.

The category is never omitted, and zero is never reported from incomplete data.

Racial ability analysis is excluded from initial analysis.

Racial abilities must not appear in rotation, cooldown, preparation, or
coaching findings until that scope is deliberately enabled later.

---

# Coaching Output Intent

The report should be clear, actionable, and prioritized.

The TLDR should surface the most important reliable improvements rather than
dump every numerical difference.

Use the heading:

`TLDR`

without a colon.

Findings should explain, where possible:

- what happened
- what ideally should have happened
- why the recommendation was actionable
- what evidence supports it
- how important it was
- what to do differently next time

Do not use coaching prose as the analyzer's source of truth.

---

# Confidence Intent

The product should communicate uncertainty.

Possible structured confidence states may include:

- HIGH
- MEDIUM
- LOW
- UNKNOWN

Confidence should reflect evidence quality.

A large performance difference does not automatically mean high confidence in
the explanation.

The product should also distinguish two different kinds of "we cannot say":

- No trustworthy standard exists for this decision.
- A standard exists, but the evidence to apply it is insufficient.

These are different messages to a player and must not be collapsed into one.

---

# Coverage Intent

A report must disclose how much of the fight it was actually able to analyze.

If decision coverage is low, important data is incomplete, the specialization
is unsupported, or important categories are unknown, the report must not read
as a complete assessment.

A player should always be able to tell the difference between:

"We analyzed this fight and found little to fix."

and:

"We could only analyze part of this fight."

Uncertainty that stays inside the analyzer does not help the player.

---

# Validation Intent

The analyzer should be validated on real Warcraft Logs cases.

The validation corpus should eventually cover all supported specs and include:

- strong parses
- average parses
- low parses
- deaths
- different fight lengths
- downtime/intermissions
- different resources
- different talent builds
- role-specific cases

A low parse is useful for regression/validation but is not automatically a
ground-truth example of bad play.

Healers require healer-specific validation.

Augmentation requires support-specific validation.

---

# Historical Lessons to Preserve

The rebuild should explicitly protect against lessons learned from the previous
analyzer:

- actor/player metadata can be missing or incorrectly hydrated
- resource reconstruction can be ambiguous
- resource cap is not the same as waste
- buff/debuff direction matters
- defensive analysis can break when class/spec identity is incomplete
- comparison players can be invalid because they died
- simple fight-length normalization can be misleading
- top-log behavior should not become rotational truth
- encounter downtime can create false rotation flags
- healer behavior cannot be reduced to HPS
- Augmentation requires ally state
- repeated patch chains are often evidence of a bad abstraction
- absence of observed restriction is not evidence that an action was possible
- absence of analysis is not evidence that a player performed well
- uncertainty that stays inside the analyzer does not reach the player

---

# Deployment and Agent Access Intent

The application is intended to run on Cloudflare.

External agents should eventually be able to interact with it cleanly.

Model Context Protocol (MCP) is worth supporting as an optional interface.

The preferred long-term model is:

- REST/API and MCP are interfaces
- both call the same application services
- neither contains separate gameplay logic
- Cloudflare management/observability MCP is separate from the product's own MCP
  endpoint
- privileged operations use least privilege

MCP is not required for the first analyzer milestone.

Planned clients include a web application where users paste Warcraft Logs
links, a future World of Warcraft addon acting as a lightweight handoff layer,
and an optional future companion application. None of these may contain a
separate gameplay analyzer.

Warcraft Logs access initially uses a server-side OAuth Client Credentials flow
for public reports. The Warcraft Logs client ID and secret are backend secrets
and must never reach browser code, addon code, or public API responses.

Private-report support is deferred, and may later use user-authorized Warcraft
Logs OAuth. Authentication affects Warcraft Logs access only; it does not
affect gameplay analysis.

---

# Explicitly Rejected Direction

Do not rebuild the product around one universal gameplay evaluator that tries to
decide correct rotation/resource/cooldown/defensive behavior for every spec.

Do not build 40 copies of WCL ingestion either.

The intended balance is:

> shared facts and infrastructure + specialization-owned evaluation.

---

# Current Success Definition

The product is succeeding when a player can submit a fight and receive a
defensible answer to:

> What are the most important things I should change on my next pull?

The answer should reflect:

- the spec they actually played
- the build/state they actually had
- the encounter they were actually in
- the actions they actually took
- the best available authority for that type of decision

The goal is not more findings.

The goal is better coaching.
