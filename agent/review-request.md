# Review request

Rolling file: overwritten for each review cycle.

## Change

M15-C: evidence-grounded impact estimation, as owner-decided non-numeric
prioritization. Branch `autopilot/m15-c`, from main at a49b5ff.

- **Internal only.** No change under `src/contracts/`, `src/api/` or
  `src/mcp/`. Nothing is wired into the service.
- **Warcraft Logs: NONE.** No request, probe or capture. The tests use
  synthetic records and the committed M11-G2 subject fight.

## Owner decision this implements (2026-11-02)

This branch also commits the owner's decision record, which had been written
uncommitted:

- `agent/architecture.md` "Owner decision (2026-11-02): impact is
  non-numeric prioritization; final scoring deferred";
- the M15-C entry (READY with scope, now PR_OPEN);
- M15-E (BLOCKED on ONB-Z);
- onboarding rule 8 in `agent/autopilot-queue.md`.

In v1, impact means a qualitative "where to look first" label. There is no
DPS, damage or performance lost, no ranking gain and no output recovered.
Non-results get no penalty, and there is an explicit hook for future
authority-backed numeric estimators.

## Files

### `src/reporting/priority-labels.ts` (new)

`labelPriorities(FindingPrioritization)` labels every M15-A item. It reads
only section, standing, state evidence and item kind.

- **HIGH_PRIORITY:** a PATTERN of ACTIONABLE_AUTHORITY_DIVERGENCE.
- **MEDIUM_PRIORITY:** a SINGLE actionable divergence.
- **LOW_PRIORITY:** a divergence whose actionability is unproven, at any
  size.
- **NOT_PRIORITIZED:** informational items and every non-assessment
  (SUPPRESSED, UNKNOWN, NO_AUTHORITY_AVAILABLE, UNSUPPORTED).

Labels never increase down the M15-A ranking. A forged PRIORITIZED item that
is not a PROVEN divergence gets no priority. Refused records stay unlabelled.
The result states `meaning: WHERE_TO_LOOK_FIRST`,
`numericEstimate: NOT_PRODUCED`, `producerSeverity: NOT_DECLARED` and
`findingEffect` NONE.

### `src/reporting/impact-estimators.ts` (new)

The extension point. `IMPACT_ESTIMATORS` is empty.

- **Registry validation.** `buildImpactEstimatorRegistry` refuses the whole
  registry for:
  - a missing or NO_AUTHORITY authority;
  - empty supported specs, builds or categories, or an unknown category;
  - no evidence requirements;
  - uncertainty other than BOUNDED_INTERVAL;
  - missing units or provenance;
  - a duplicate id;
  - overlapping spec × build × category cells.
- **`estimateImpact` resolution.**
  - **NOT_AVAILABLE:** not a prioritized divergence; no estimator, or none
    that supports the item; an undeclared build; a refused registry.
  - **UNKNOWN:** an unknown build (`BUILD_NOT_ESTABLISHED`, with
    `estimatorId: null`); an estimator UNKNOWN, throw or malformed interval.
  - **Selection** matches spec, category and build together, so estimators
    with disjoint builds resolve the same in any registration order
    (review cycle 1 fix, with a regression test in both orders).
  - **ESTIMATED:** otherwise, with the declaration restated.
- The labels never import it.

### Tests

- `tests/unit/m15c-priority-labels.test.ts`:
  - every label rule, and labels never increasing down the ranking;
  - every non-result is NOT_PRIORITIZED (a 30-record UNKNOWN pattern
    included);
  - refusal paths;
  - every estimator resolution and registry problem;
  - an estimate never changes the labels;
  - the real Blood fight.
- `tests/contracts/m15c-impact-contract.test.ts`:
  - no numeric-impact key in the public analysis or raid-night schemas
    (with a non-vacuity check) or in the labelling;
  - exactly four labels;
  - the labels never read the hook, and no estimator is registered;
  - nothing outside `src/reporting/` imports either module.
- `tests/contracts/m15a-reporting-layering.test.ts`: lists the two new
  files. The import rules and importer edges are unchanged.

### Docs

- `agent/architecture.md`: an "M15-C — Non-numeric impact prioritization"
  section.
- `agent/follow-ups.md`: "After M15-C". Not published; no real fight reaches
  HIGH or MEDIUM; severity is undeclared; the pattern threshold is not
  validated; no estimator exists and no build input is passed; M15-E stays
  deferred.

## Real evidence

The committed Blood fight:

- 0 HIGH and 0 MEDIUM. Every prioritized item is LOW, led by the
  45-occurrence `heart_strike` pattern at rank 1 (alternative unproven).
- 224 UNKNOWN decisions are NOT_PRIORITIZED.
- Nothing is refused, and every impact is NOT_AVAILABLE.

## Validation

- `npx tsc --noEmit`: clean.
- Focused tests after the cycle 1 fix: 3 files, 31 tests passed.
- Full suite with the default 5 s timeout: 19 timeouts in unrelated
  simulation and runner tests under machine load.
- Full suite with `--testTimeout=180000`: 11,876 of 11,878 passed. The two
  failures were the M9-B corpus cases (`m9b-corpus-harness` Protection
  Paladin, `m9b-corpus-gate` under workerd). Both pass when rerun alone, and
  neither touches `src/reporting/`.
- `prettier --check` and `git diff --check`: clean.
