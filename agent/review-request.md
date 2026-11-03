# Review request

Rolling file: overwritten for each review cycle.

## Change

Roadmap: full playable-specialization onboarding. Branch
`roadmap/spec-onboarding-queue`, from main at 8cb47d1.

This is a planning/documentation change only:

- no source, test, analyzer, runtime-data or public-contract change;
- **Warcraft Logs: NONE.** No request, probe or capture was made.

## Owner product decision (2026-11-02)

The project is not complete when M15-F is complete. Onboarding continues
until every playable specialization in the pinned roster
(`src/data/game/spec-roster.json`, 40 playable) has a terminal disposition:

1. PUBLIC;
2. DEFERRED by owner decision;
3. BLOCKED on a documented, genuine missing authority or evidence condition.

An empty queue while ordinary specs remain unsupported is not completion,
and a shared foundation never counts as a supported specialization.

## Files

### `agent/spec-onboarding-inventory.md` (new)

- The completion rule and the state and evidence vocabularies.
- A machine-readable `onboarding-progress` JSON block: 40 playable, 6
  PUBLIC, 0 INTERNAL_ONLY, 1 FOUNDATION (Restoration Shaman), 33
  NOT_STARTED; 15% publicly supported, 15% terminally dispositioned.
- A 40-row roster matrix with each specialization's state, known retained
  evidence and owning queue entries.
- The cohort design by engineering pattern, following the M11-D0 census.
- The onboarding evidence policy.

### `agent/autopilot-queue.md`

- A "Specialization onboarding" section with rules shared by every entry:
  - per-spec ownership, with no universal evaluator and no `if spec ===`;
  - every internal entry runs authority review, then INTERNAL_ONLY
    implementation, then real-evidence validation;
  - PUBLIC promotion is a separate reviewed entry under the existing gates;
  - owner stops only for genuine decisions;
  - existing gates are never weakened;
  - `wcl: NONE` on every entry, with missing evidence routed to ONB-EV.
- 54 new entries, inserted before `M11-G4-5-R`:
  - **Shared capabilities:** ONB-S1 precombat variables, S2 combining
    operations, S4 cast/channel anchor, S5 pooling/wait, S6 pet mapping.
  - **Healers:** HEAL-A/AP (Restoration Shaman), then B1 (Holy Paladin,
    Restoration Druid, Mistweaver), B2 (Holy Priest), B3 (Discipline) and
    B4 (Preservation), each with a public entry.
  - **Cohorts:** A (Havoc, then Subtlety, Fury, Protection Warrior);
    B (Arms, then Frost DK, Enhancement); B3 (Devourer alone);
    C (Feral, then Outlaw); T (Windwalker, then Guardian, Beast Mastery,
    Survival); D (Destruction, then Elemental/Balance/Shadow,
    Arcane/Frost Mage, Affliction/Marksmanship); X (Fire, Devastation,
    Vengeance, Demonology, Unholy, each alone). Every one has a public
    entry.
  - **ONB-Z:** the completion matrix, regenerated from the registry, with a
    contract test.
- Two new OWNER_DECISION_REQUIRED entries, so the autopilot cannot decide
  them:
  - **ONB-S3:** the enemy-set and target-count authority model.
    `TARGET_COUNT` is currently a permanent blocker; Cohort T depends on it.
  - **ONB-EV:** a bounded, neutral Warcraft Logs evidence campaign for
    specs with no retained real evidence.
- Bookkeeping: M15-F is recorded MERGED (#37, 8cb47d1).
- Existing entries are otherwise unchanged; this was verified with the
  supervisor's own `ConvertFrom-QueueText`.

## Validation

- The supervisor parser reads 79 entries, with no duplicate IDs and no
  unknown dependencies.
- An offline selection simulation runs every entry except those behind the
  four owner decisions (M15-C, M15-E, ONB-S3, ONB-EV), Cohort T and ONB-Z
  (which depend on ONB-S3), and the deferred M11-G4-5-R.
- `prettier --check` passes on both files.

## Review cycle 2

The reviewer found that the universal APL/MATCH requirement conflicted with
the healer scope. Fixed:

- The onboarding rules now separate the rotational internal tranche
  (rule 2, unchanged) from a healer internal tranche (rule 3).
- Rule 3 keeps the M12-D verdict limits and replaces the APL and
  MATCH/discrimination steps with healer validation: real cooldown
  observations, ASSIGNMENT outcomes against a supplied plan, identity and
  completeness (UNKNOWN on PARTIAL or ABSENT), missing-plan
  NO_AUTHORITY_AVAILABLE, and negative controls (no HPS ranking, no
  per-cast verdict, no cooldown-quality verdict without a plan).
- Public promotion (rule 4) uses the gate for its analyzer kind.
- HEAL-AP defines and pins the healer gate, separate from the unchanged
  rotational gate.
