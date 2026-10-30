# Review request

Rolling file: overwritten for each review cycle.

## Tranche

PREP-3: consumable status in the raid night. Branch
`raid-night-consumable-status`, from main at bdc8df7 (PREP-2 merged).

## Owner decisions (2026-10-30; recorded in agent/architecture.md "PREP-3")

1. **Compact per cell.** Each present player's cell carries the three
   consumables, as a count or as UNKNOWN with a lower bound and reason codes.
   Uses and evidence stay in the single-fight report.
2. **Retrieve "nobody analyzable" fights**, for consumable status. This is
   accepted per-fight cost.

## Intended change

1. **Orchestration** (`src/services/raid-night-service.ts`).
   - Zero ingestion only when every selected player is absent.
   - Otherwise one retrieval, whose requirement always includes
     `PREPARATION_REQUIREMENT`. A preparation-only fight retrieves with no
     resources, and names a present player for the context query.
   - Every present player is assessed from their own focused view.
   - A non-fatal failure keeps the existing semantics
     (ANALYSIS_UNAVAILABLE, FIGHT_INGESTION_FAILED), with preparation
     NOT_ASSESSED (RETRIEVAL_FAILED). A fatal failure fails the night, as for
     any fight.
2. **Domain** (`src/aggregation/`).
   - Present cells carry a required compact `CellPreparation`
     (`cellPreparationOf`). The full report does not cross into the cell.
   - **The M7-D gate is tightened.** NOT_INGESTED with any present cell is
     `PROCESSING_CELL_MISMATCH`, an unresolved specialization included.
     NOT_INGESTED is coherent only for all-absent fights.
   - `PREPARATION_NOT_ASSESSED_REASONS` moved into the preparation module
     (re-exported by the services), so `cell.ts` does not reach the services
     (m7d layering).
3. **Public raid-night contract.** `preparation` (optional in the schema,
   always emitted) on ANALYZED, NOT_ANALYZED and ANALYSIS_UNAVAILABLE cells,
   in the compact form. It reuses the single-fight public vocabularies, and
   the projection copies rather than aliases.
4. **Docs:** README, `agent/{architecture,follow-ups,testing,review-request}.md`.

## Tests changed because the owner decision superseded them

- **m7f orchestration (5 tests):** all-unsupported, absent+unsupported,
  mixed-night, spec-change and unresolved fights are now retrieved once
  (`INGESTED`) instead of skipped. All-absent stays NOT_INGESTED.
- **m8d no-ratio guard:** it banned substrings, and "preparation" contains
  "ratio". It now checks words and word prefixes. `matchRate`, `passRatio`
  and `percentage` still fail, and the banned list is unchanged.
- **Single-player-truth regression:** the reference cell builds preparation
  as the services do, so the equality now also proves the raid-night cell's
  preparation equals the single-player one.
- **Test literals:** the new required field on present cells.

## New tests

- `tests/contracts/raid-night-preparation.test.ts` (5):
  - the preparation-only retrieval (no resources, present player named,
    INGESTED, assessed cell);
  - a schema-valid compact public cell, with no uses on the night and no
    preparation on the absent cell;
  - a failed retrieval gives NOT_ASSESSED, never zero;
  - every present kind carries the status;
  - the compact form (count; lower bound with each code once, no count).
- `tests/unit/raid-night-input-gate.test.ts`: NOT_INGESTED with any present
  cell is refused (unsupported, unresolved, analyzed, unavailable), and
  all-absent NOT_INGESTED is accepted.

## Validation

- **New and updated tests:**
  - raid-night preparation 5/5;
  - gate 30/30;
  - m7f orchestration 36/36;
  - single-player truth 10/10;
  - m8d and m7d 108/108.
- **Corpus gate** (`npm run test:corpus`): PASSED. 178 cases and 767
  assertions; two workerd runs are byte-identical, and the committed report
  matches unchanged.
- **Analyzer digests unchanged:** 600/600 byte-identical. The public
  raid-night document changes by design (owner decision 1).
- **Checks:** typecheck clean; prettier clean; `git diff --check` clean.
- **Full suite** (`npm test -- --maxWorkers=1 --testTimeout=30000`): 348
  files, 10,069 tests, all pass (832 s).

## External / network activity

None. No Warcraft Logs requests; fixtures only.

## Known limitations

- Player and coverage summaries do not aggregate consumable status across
  the night; the cells carry it.
- No committed fight contains a health potion or healthstone use.

## Staged / committed

Nothing is staged or committed.
