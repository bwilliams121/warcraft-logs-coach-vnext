# Review request

Rolling file: overwritten for each review cycle.

## Tranche

PREP-4: real consumable evidence in the regression corpus. Branch
`preparation-real-evidence`, from main at ceafe5f (PREP-3 merged).

Owner choice: "Real potion-use evidence". The health-potion and healthstone
paths were proven only on synthetic fights.

## Review cycle 2: response to CHANGES_REQUIRED (cycle 1)

Finding: no production mutation was shown to be caught by the new cases. Two
mutations of `src/analysis/preparation/consumable-status.ts` were run through
the corpus APPLICATION_SERVICE layer
(`npx vitest run tests/unit/m9b-corpus-harness.test.ts -t APPLICATION_SERVICE`).
Each is caught by exactly the new case it targets.

- **M1: the pre-pull removal is no longer counted**
  (`if (false && !openCombatBuffs.has(spellId))`).
  - FAILED: `application-service.unsupported-mage-reports-a-real-prepull-combat-potion`.
  - expected `combatPotion {countState: OBSERVED, count: 1, uses:
    [{spellId: 1236616, timing: BEFORE_PULL}]}`.
  - actual `combatPotion {countState: OBSERVED, count: 0, uses: []}`.
- **M2: the short-window guard is removed**
  (`if (false && durationMs < identities.maxCombatPotionAuraDurationMs)`).
  - FAILED: `application-service.unsupported-shaman-reports-real-health-potion-and-healthstone`.
  - expected `combatPotion {countState: UNKNOWN, observedAtLeast: 0,
    reasonCodes: [FIGHT_SHORTER_THAN_LONGEST_COMBAT_POTION_BUFF], uses: []}`.
  - actual `combatPotion {countState: OBSERVED, count: 0, uses: []}`: the
    false zero the guard prevents.
- **Restore.** Production was restored byte for byte (`git diff --quiet --
  src` clean), and `npm run test:corpus` PASSED again: 182 cases and 775
  assertions, two byte-identical workerd runs, report matching.

## What changed

**No new Warcraft Logs request.** The M11-E2 capture (`b1PmaKrd6CDfzngc`
fight 48, authorized at M11-E2) is the unfiltered whole-fight All stream, so
it already holds every raider's real consumable use. An offline scan of it
found casts of Healthstone, Demonic Healthstone and both Silvermoon potions
by seven players.

1. **Two SANITIZED_CAPTURE regression-corpus slices** (`sanitize-probe-7`
   `--actor-slice … --families <casts, ten aura types, combatantinfo>
   --compact`).
   - `wcl-b1pm-fight-48-mage-121-prepull-65s`: 1,135 events, the first 65 s.
     A Light's Potential buff is removed at +28.3 s with no application or
     cast in the window: a real pre-pull potion. It grants CASTS, AURAS,
     COMBATANT_INFO and GEAR for actor 121.
   - `wcl-b1pm-fight-48-shaman-122-health-consumables-20s`: 331 events, 20 s
     mid-fight. A Healthstone (7,737,881) and a Silvermoon Health Potion
     (7,739,019). It grants CASTS and AURAS only (no combatantinfo
     mid-fight).
2. **`APPLICATION_SERVICE.FIGHT_ANALYSIS`** gains an optional
   `expected.preparation`: per consumable, the count state, count or lower
   bound, reason codes, and each use's spell and timing. The executor
   compares the service's assessed report in that form. NOT_ASSESSED never
   equals an assessed expectation. Existing cases don't carry it and are
   unchanged.
3. **Four cases.**
   - A normalization census for each slice.
   - The unsupported Mage: combat potion OBSERVED 1 (BEFORE_PULL), health
     potion and healthstone OBSERVED 0.
   - The unsupported Shaman: health potion and healthstone OBSERVED 1
     (IN_FIGHT, named spells), combat potion UNKNOWN
     (`FIGHT_SHORTER_THAN_LONGEST_COMBAT_POTION_BUFF`, lower bound 0).
4. **Pins updated for the additions:**
   - artifact and case counts (51 and 182), and the gate's case and
     assertion totals (182 and 775);
   - the sanitized-capture, actor-slice and coverage-retaining lists;
   - the source-capture list;
   - the allowed slicer revisions now include `sanitize-probe-7`, the
     revision that cut these slices (already used by the evidence archive).
   - The corpus report is regenerated from execution.
5. **Docs:** `tests/corpus/README.md` and
   `agent/{architecture,follow-ups,testing,review-request}.md`.

## Decision made (please assess)

**The owner's 5.5 MiB regression-corpus notice line is respected and NOT
moved.** The total is 5,706,262 bytes. A whole-fight slice for a third
subject (actor 16, all three kinds, 452 KB) was cut first. It would have
crossed the line (the storage test failed), so it was discarded and replaced
by actor 122's 20 s window.

## Validation

- **Corpus gate** (`npm run test:corpus -- --write-report`, then
  `npm run test:corpus`): PASSED. 182 cases and 775 assertions under
  workerd; two separate runs are byte-identical, and the committed report
  matches the execution.
- **Corpus unit tests:** manifest and coverage report 43/43, including the
  storage-ceiling test, under the 5.5 MiB line.
- **Checks:** typecheck clean; prettier clean; `git diff --check` clean.
- **Full suite** (`npm test -- --maxWorkers=1 --testTimeout=30000`): 348
  files, 10,069 tests, all pass (1,074 s).

## External / network activity

None. No Warcraft Logs requests. The slices come from a gitignored capture
already on disk.

## Known limitations

- No single committed slice holds all three kinds for one player over a
  whole fight. The 5.5 MiB line rules it out in the regression corpus.

## Staged / committed

Nothing is staged or committed.
