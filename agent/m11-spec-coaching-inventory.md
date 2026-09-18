# M11 specialization coaching inventory

The product is not an APL cast checker. Every specialization may eventually
own zero or more supplemental, deep-dive analyses through the seam
M11-A2 established on `defineSpecModule` — temporal mechanic analysis,
clipping, resource management, cooldown alignment, uptime, sequencing,
whole-fight usage, pet behaviour, preparation. This document is the
framework for recording such questions BEFORE any of them is authorized,
and the backlog over all thirty ordinary M11 specializations so that none
disappears from the roadmap.

The machine-readable inventory is `tests/support/m11/coaching-inventory.json`;
`tests/contracts/m11a3-coaching-inventory.test.ts` proves its population
against the pinned roster, its analyzer-status claims against the production
partition, its cohort partition, its question shape, and the Ritual Clipping
ownership rule. Nothing in `src/` reads it, and that is also proven.

## What a candidate question is, and is not

A candidate coaching question is a hypothesis that a truthful, evidence-backed
answer could exist. It is NOT an authorized conclusion, NOT a finding, and NOT
a promise that the answer will ever be surfaced. Recording one commits the
project to nothing except remembering it.

Every entry states, in the record's own fields:

| Field | Meaning |
| --- | --- |
| `id` | `<specId>.<slug>`; unique across the inventory |
| `question` | the coaching question in words |
| `scope` | `OBSERVED_DECISION`, `TEMPORAL_WINDOW`, `WHOLE_FIGHT`, `RESOURCE_MANAGEMENT`, `COOLDOWN_ALIGNMENT`, `MECHANIC_CLIPPING`, `UPTIME_MAINTENANCE`, `ATTRIBUTION_SENSITIVE`, `PREPARATION` |
| `timeHorizon` | `ONE_DECISION`, `SHORT_WINDOW`, `REPEATED_CYCLES`, `WHOLE_FIGHT`, `PRE_PULL_AND_COMBAT`, `CROSS_PLAYER` |
| `evidenceNeeded` | the Warcraft Logs events/state the answer rests on |
| `authorityNeeded` | what permits calling the result good/bad/compatible/clipped: a pinned APL line, pinned mechanics/game data, an explicitly defined spec-owned invariant, or a future separately pinned rule authority. A guide is human context, never decision authority |
| `normalizedStateNeeded` | the normalized/reconstructed state the analysis reads |
| `implementationReadiness` | `READY_FOR_SPEC_MILESTONE`, `IMPLEMENTED_INTERNAL_ONLY` (M11-A4: the selected specialization's required question, landed as an INTERNAL_ONLY analyzer with committed sanitized evidence), `IMPLEMENTED_PUBLIC` (M11-A5: the same question, reachable publicly through the rotational analyzer — not a supplemental analysis), `NEEDS_AUTHORITY`, `NEEDS_EVIDENCE`, `NEEDS_ENGINE_CAPABILITY`, `NEEDS_REPORT_CONTRACT`, `UNASSESSED` — a statement about INPUTS |
| `unknownConditions` | what missing evidence or state makes the answer unknowable. Absence of an event is never evidence of failure |
| `outputNeed` | `EXISTING_INTERNAL_FINDINGS`, `SUPPLEMENTAL_RESULT_ONLY`, `REPORT_PROJECTION`, `PUBLIC_CONTRACT_EVOLUTION`, `UNASSESSED` — no schema changes now |
| `a4Classification` | only on the selected specialization: `A4_REQUIRED`, `A4_OPTIONAL`, `LATER_M11`, `BLOCKED` |
| `ownership` | only on the Ritual Clipping entries: `UNRESOLVED_DIABOLIST_HERO_TREE` |

Rules the test enforces: a `SPECIFIC_QUESTIONS_IDENTIFIED` or `PARTIAL` row
carries at least one question; an `UNASSESSED` row carries none; only the
selected specialization carries A4 classifications and exactly one of them is
`A4_REQUIRED` (the rotational slice — A4 is not a deep-dive milestone).

Rules a reviewer enforces: a question whose answer would require causal
inference the evidence cannot support (a numeric delta "therefore" a
mistake) is not admitted; a question is not admitted from remembered game
knowledge — it is admitted when the currently inspected pinned authority or
committed/local evidence names the mechanic.

## Backlog status over the thirty ordinary M11 specializations

Status vocabulary: `SPECIFIC_QUESTIONS_IDENTIFIED` (the inspected pinned
list names the mechanic and a concrete question is recorded), `PARTIAL`
(one line-backed question, the rest unassessed), `UNASSESSED` (no line-level
inspection yet; structural screening only — nothing was invented to fill the
row).

| specId | Cohort | Evidence | Authority audit | Inventory status | Questions |
| --- | --- | --- | --- | --- | --- |
| `paladin/retribution` | SELECTED — INTERNAL_ONLY at M11-A4, PUBLIC since M11-A5 | committed sanitized (A7R6 actor 6, 165 s; gtKb actor 23, 20 s) | audited | SPECIFIC_QUESTIONS_IDENTIFIED | `spender-choice` (A4_REQUIRED — IMPLEMENTED_PUBLIC since M11-A5), `holy-power-waste` (A4_OPTIONAL), `empyrean-legacy-consumption`, `divine-arbiter-alternation`, `wake-of-ashes-cooldown-drift`, `execution-sentence-wake-alignment`, `avenging-wrath-usage` (LATER_M11), `wings-hammer-of-wrath-window` (BLOCKED) |
| `demonhunter/havoc` | B | local raw | audited | SPECIFIC_QUESTIONS_IDENTIFIED | `essence-break-window-fill`, `fury-cap` |
| `hunter/beast_mastery` | B | local raw | blocked | PARTIAL | `barbed-shot-charge-capping` |
| `druid/feral` | B | local raw | blocked | PARTIAL | `rip-rake-snapshot-refresh` |
| `hunter/survival` | B | none | not yet | UNASSESSED | — |
| `monk/windwalker` | B | none | not yet | UNASSESSED | — |
| `rogue/subtlety` | B | none | not yet | UNASSESSED | — |
| `shaman/enhancement` | B | none | not yet | UNASSESSED | — |
| `druid/guardian` | B | none | not yet | UNASSESSED | — |
| `warrior/arms` | C | local raw | blocked | PARTIAL | `colossus-smash-window-fill` |
| `warrior/fury` | C | none | not yet | UNASSESSED | — |
| `warrior/protection` | C | none | not yet | UNASSESSED | — |
| `deathknight/blood` | C | local raw | blocked | SPECIFIC_QUESTIONS_IDENTIFIED | `coagulopathy-maintenance-clip`, `bone-shield-stack-maintenance` |
| `deathknight/frost` | C | local raw | blocked | PARTIAL | `rune-and-runic-power-pooling` |
| `monk/brewmaster` | C | local raw | blocked | PARTIAL | `celestial-brew-charge-capping` |
| `demonhunter/vengeance` | C | none | not yet | UNASSESSED | — |
| `demonhunter/devourer` | C | local raw | blocked | PARTIAL | `reap-soul-threshold` |
| `rogue/outlaw` | C | none | not yet | UNASSESSED | — |
| `mage/arcane` | D | local raw | blocked | PARTIAL | `arcane-charge-barrage-timing` |
| `mage/fire` | D | local raw | blocked | PARTIAL | `combustion-window-fill` |
| `mage/frost` | D | none | not yet | UNASSESSED | — |
| `warlock/destruction` | D | local raw | blocked | SPECIFIC_QUESTIONS_IDENTIFIED | `ritual-clipping` (ownership unresolved), `immolate-wither-refresh` |
| `warlock/affliction` | D | none | not yet | UNASSESSED | — |
| `warlock/demonology` | D | local raw | blocked | SPECIFIC_QUESTIONS_IDENTIFIED | `ritual-clipping` (ownership unresolved), `tyrant-setup` |
| `shaman/elemental` | D | local raw | blocked | PARTIAL | `flame-shock-maintenance` |
| `priest/shadow` | D | local raw | blocked | PARTIAL | `dot-maintenance` |
| `druid/balance` | D | local raw | blocked | PARTIAL | `astral-power-capping` |
| `evoker/devastation` | D | local raw | blocked | PARTIAL | `empower-cast-usage` |
| `hunter/marksmanship` | D | none | not yet | UNASSESSED | — |
| `deathknight/unholy` | E | none | not yet | UNASSESSED | — |

Cohorts (from `m11-a3-authority-audit.md` §10): B — instant-cast lists
without `run_action_list`, gated by target count / `target_if` / charges /
pets; C — `run_action_list` dispatch; D — casters needing a cast/channel
anchor model; E — pet- and variable-heavy on top of C/D.

## The Ritual Clipping requirement

Recorded verbatim as the desired future behaviour:

> Detect actual Ritual clipping/lost cycles from real combat evidence;
> distinguish true clipping from close but successful refreshes; measure the
> safety margin where evidence permits; report UNKNOWN when the required
> temporal state cannot be reconstructed.

Ownership at A3: **Warlock / Diabolist hero tree — reachable from
Destruction and Demonology, absent from Affliction; owning module
UNRESOLVED.** Established mechanically, not from memory:

- the pinned Destruction list defines `variable.ritual_length` as the sum of
  `buff.diabolic_ritual_mother_of_chaos.remains`,
  `buff.diabolic_ritual_overlord.remains` and
  `buff.diabolic_ritual_pit_lord.remains`, and gates Chaos Bolt on
  `talent.diabolic_ritual&(demonic_art|(variable.ritual_length<action.chaos_bolt.execute_time))`
  and on `variable.ritual_length>4`;
- the pinned Demonology list calls `diabolist` on `talent.diabolic_ritual`;
- the pinned Affliction list contains no reference;
- the three gtKb Demonology subjects emit `Diabolic Ritual: Overlord`
  (431944), `Diabolic Ritual: Mother of Chaos` (432815), `Diabolic Ritual: Pit
  Lord` (432816) and `Demonic Art: *` (428524, 432794) auras inside the 20 s
  opener; the two A7R6 Destruction subjects are Hellcaller (Wither) builds
  and emit none.

What a "clip" or a "lost cycle" IS was not established: that requires a
pinned mechanics read of `sc_warlock*.cpp` (not fetched in A3), and the
entry's readiness is `NEEDS_AUTHORITY` for exactly that reason. The test
refuses any other specialization claiming ritual ownership, and refuses a
readiness of `READY` on either carrier until the read exists.

## Selected specialization — deep-dive audit (A3.12)

For `paladin/retribution`, from its pinned list and A7R6 actor 6 / gtKb
actor 23 evidence:

| Question | Class | Why |
| --- | --- | --- |
| `spender-choice` | A4_REQUIRED | the first truthful rotational vertical slice (see the A4 contract). IMPLEMENTED at M11-A4 as `paladin-retribution-observed-decisions`, INTERNAL_ONLY, and PUBLIC since M11-A5 (exposure only; the in-domain casts outside the slice publish as `OUTSIDE_SUPPORTED_SLICE`): over the committed A7R6 actor-6 bundle, 69 eligible spender decisions — 1 MATCH, 10 REJECTED, 58 UNKNOWN with the stopping entry named; the opener subject 15 of 15 UNKNOWN |
| `holy-power-waste` | A4_OPTIONAL | same normalized evidence as the slice; the `waste` field is an observed fact (`resourcechange` at `+59.841` waste=1, `+73.326` waste=2, …); no APL line; the lowest-risk way to exercise the supplemental seam end-to-end. Not required for promotion |
| `empyrean-legacy-consumption` | LATER_M11 | ready on evidence and authority, but its decision half is already covered by the slice's REJECTED route |
| `divine-arbiter-alternation` | LATER_M11 | season-bound set bonus; mostly subsumed by the slice |
| `wake-of-ashes-cooldown-drift` | LATER_M11 | observation-only summary is producible; a blame verdict needs `raid_event`, which is never bindable |
| `execution-sentence-wake-alignment` | LATER_M11 | needs an upper bound on `gcd` |
| `avenging-wrath-usage` | LATER_M11 | needs the cooldown-modifier census A4 produces anyway |
| `wings-hammer-of-wrath-window` | BLOCKED | needs a charge model |

A supplemental analyzer is not mandatory for Retribution's eventual public
promotion; truthful depth matters more than feature count.
