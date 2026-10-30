# Review request

Rolling file: overwritten for each review cycle.

## Tranche

PREP-1: consumable status, the shared preparation producer (internal).
Branch `preparation-consumable-status`, from main at 2702048 (G4-6 merged).

Owner choice: "Consumable status (Recommended)". This closes the product-intent
gap internally. Public exposure was explicitly to come back to the owner.

## Review cycle 2: response to CHANGES_REQUIRED (cycle 1)

1. **Unclassified potion evidence on auras.** Fixed.
   - A buff on the player that is outside the identity data and named
     "Potion" now makes COMBAT_POTION UNKNOWN (`UNCLASSIFIED_CANDIDATE`,
     once per spell).
   - Regression: under COMPLETE coverage, with no cast at all, an unknown
     potion buff removed during the fight cannot produce an observed zero.
     Health potion and healthstone stay OBSERVED 0, and an unknown buff not
     named "Potion" is not a candidate.
2. **BEFORE_PULL under incomplete coverage.** Fixed.
   - New timing `UNRESOLVED`. An unmatched removal is still a use (it counts
     toward `observedAtLeast`), but is labelled BEFORE_PULL only when cast
     AND aura coverage are COMPLETE.
   - Regression: with PARTIAL casts, or with PARTIAL auras, and the gap
     after 90 s, the timing is UNRESOLVED and the status UNKNOWN with
     observedAtLeast 1.
3. **Mutations.** Reverting either fix fails its regression (1 test each).
4. **Docs.** `agent/architecture.md` and `agent/testing.md` updated.

## Intended change

1. **Identity data:** `src/data/game/preparation-consumables.json` with
   loader `.ts`, extracted by
   `scripts/authority/extract-preparation-consumables.mjs` (+ `.d.mts`).
   - Source: the ANALYZER AUTHORITY pin (33622e9d, 12.1.0.69587), as the
     registry contract requires for analyzer runtime data.
   - Classification by the client's shared cooldowns:
     - HEALTH_POTION: category 30, 41 spells;
     - COMBAT_POTION: category 4, 75 spells;
     - HEALTHSTONE: direct heals named "…Healthstone", 3 spells. The
       "Empowered Healthstone" talent auras are excluded.
   - Anchor rows guard the column layout. Racial abilities stop the
     extraction.
2. **Producer:** `src/analysis/preparation/consumable-status.ts`,
   `requirement.ts`.
   - `assessConsumableStatus(fight, actorId)` returns all three statuses,
     always: OBSERVED with a count (zero only under COMPLETE coverage), or
     UNKNOWN with reasons and a lower bound.
   - Pre-pull combat potions are detected from a buff removal with no
     in-fight application or cast. The combat potion is UNKNOWN when the
     fight is shorter than the longest combat-potion buff (60 s); the pull
     snapshot carries no auras.
   - An unclassified cast named "Potion"/"Healthstone" fails closed to
     UNKNOWN.
   - Authority: uses `WCL_OBSERVED_FACT`, identities `RUNTIME_GAME_DATA`
     (revision recorded).
3. **Services:**
   - `FightAnalysis.preparation` is required (`ASSESSED {report}` |
     `NOT_ASSESSED {NO_FIGHT_RETRIEVED}`).
   - `analyzeFight` assesses after state construction, independently of
     the analyzer. The raid-night service assesses each player's focused
     view.
   - Scope is derived from the analyzer's requirement unioned with
     `PREPARATION_REQUIREMENT` (PLAYER_CONTEXT, no resources); it widens
     nothing.
   - Unsupported specs are still answered before ingestion, so their
     preparation is NOT_ASSESSED.
4. **Public output:** unchanged. No projection reads `preparation`.

## Decisions made (please assess)

- **A separate report type, not `Finding`.** `Finding` is shaped for
  rotation decisions (decision point, judgment, actionability), and contract
  tests keep WCL_OBSERVED_FACT and RUNTIME_GAME_DATA out of the rotation
  authority type. The report records `category: "PREPARATION"` and both
  authorities explicitly.
- **`src/analysis/preparation/`** (the architecture's planned location). It
  uses `gateAbsenceClaim` (shared engine state). It does not use the
  combat-facts layer, which is restricted to its reviewed consumers.
- **Categories are slots.** Mana and utility potions count as combat-potion
  uses; injectors and vials as health-potion uses. Every use is named. This
  is listed as an owner decision below.
- **Test-only changes to existing tests** (no assertion weakened):
  - FightAnalysis literals gain `preparation: NOT_ASSESSED`;
  - the m7b equivalence reconstruction now mirrors the service (unioned
    requirement, assessed preparation) and compares `preparation` field by
    field;
  - the m7f orchestration allow-list names the producer modules explicitly;
  - the two corpus spec executors use an inline literal, so they still do
    not reach the services.

## Evidence

- **Real corpus (36 committed slices, vouched subject):**
  - COMPLETE slices: health potion and healthstone OBSERVED 0.
  - PARTIAL or out-of-scope slices: UNKNOWN, never 0.
  - Combat potion: UNKNOWN when the window is under 60 s, with its lower
    bound (≥1 on the Blood 45 s slice); OBSERVED 1 on the 145 s Brewmaster
    segment, from the buff removal.
- **Data corroboration:**
  - every simulation-model POTION aura (independent item-effect join) is a
    COMBAT_POTION;
  - names match Warcraft Logs master data for 7 ids (Healthstone, Demonic
    Healthstone, both Silvermoon potions, three combat potions).
- **Mutations:** removing the cast gate fails 3 tests; removing pre-pull
  open-buff tracking fails 1.

## Owner decisions needed (before the requirement is met publicly)

1. Public field: an additive field on the strict v1 schemas, a contract and
   digest change.
2. Unsupported specializations: ingest for preparation alone, at a real
   Warcraft Logs cost per request?
3. Slot semantics, or a narrower definition of "combat potion" and "health
   potion".

## Files / surfaces changed

- New:
  - `src/analysis/preparation/{consumable-status,requirement}.ts`;
  - `src/data/game/preparation-consumables.{json,ts}`;
  - `scripts/authority/extract-preparation-consumables.{mjs,d.mts}`;
  - tests: `tests/unit/preparation/{consumable-status,preparation-consumables-data}.test.ts`,
    `tests/unit/preparation-consumables-extraction.test.ts`,
    `tests/contracts/preparation-{service,layering}.test.ts`.
- Changed: `src/services/{result,analysis-service,raid-night-service}.ts`;
  the test literals and allow-list noted above;
  `agent/{architecture,follow-ups,testing,review-request}.md`.

## Validation

- **New tests:**
  - producer 18/18 (cycle 2 adds 2 regressions);
  - data 8/8;
  - extractor rules 9/9;
  - service 4/4;
  - layering 101/101.
- **Affected existing tests:** m7b equivalence 3/3 (deep-equal including
  `preparation`); m7f, m9a and the registry contract pass.
- **Artifact:** byte-identical to a fresh extraction from the pinned
  33622e9d sources.
- **Public digests unchanged:** 600/600 byte-identical.
- **Checks:** typecheck clean; prettier clean; `git diff --check` clean.
- **Full suite** (`npm test -- --maxWorkers=1 --testTimeout=30000`):
  346 files, 10,052 tests, all pass (994 s, rerun after cycle 2).

## External / network activity

None. No Warcraft Logs requests. The SimC sources are read from the local
pinned clone (`git show` at 33622e9d).

## Known limitations

- No committed fight contains a health potion or healthstone use; those
  paths are proven on synthetic fights.
- The identity data is 12.1.0.69587. A newer consumable not named
  "Potion"/"Healthstone" would not be recognised. Named ones fail closed.

## Staged / committed

Nothing is staged or committed.
