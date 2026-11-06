# Review request

Rolling file: overwritten for each review cycle.

## Change

POLB-A: Policy B's versioned schema, its supplier seam, the frozen census plan, the per-fact completeness analysis, and the acquisition proposal for POLB-CENSUS's owner decision. Branch `autopilot/polb-a`.

- **Warcraft Logs: no request was made, and no grant is written.** Every measurement read retained captures offline.
- **Public contract: unchanged.** Nothing under `src/contracts/`, `src/api/` or `src/mcp/`.
- **No curated row, no promotion.** The dataset holds no row, so every count and decision is unchanged.
- The four untracked local paths (`.claude/` and the three `scripts/probe/wcl-*.probe.ts` files) are the standing CLAUDE.md exclusions.

## The result to check first

**No acquisition and completeness contract can justify an upper bound, an exact `spell_targets` or a closed `target_if` set from this census.** `agent/architecture.md` "POLB-A" considers six candidates. The decisive real evidence: on b1PmaKrd6CDfzngc fight 48, WCL's `enemyNPCs` is exactly the friendly-damaged set (45 instances), and 96 Malignant Totem instances (creature 269430) appear in events and in neither, while another retained pull's `enemyNPCs` lists that creature 48 times. By specialization: 1,414 retained count decisions and 2,301 `target_if` decisions cannot be settled by an upper bound or closed set. The section recommends the owner decline the grant if the upper-bound gap was the purpose.

Please check that this is right, and that nothing else in the tree contradicts it.

## What changed

- `src/data/encounter-census/encounter-state-census-artifact.ts`: schema and parser. It refuses closure without a reviewed contract (`REVIEWED_CLOSURE_CONTRACTS`, pinned empty), an unwidened conflict, overlapping windows, one fact using another's predicate, fewer than five independent pulls, a foreign build, and overstated completeness.
- `src/data/encounter-census/census-plan.json`: the frozen sampling plan, its budget and retained-bytes numbers, status `PROPOSED_NOT_AUTHORIZED`.
- `src/data/encounter-census/encounter-state-census.json` and `encounter-state-census.ts`: the empty dataset and its loader.
- `src/findings/encounter-state-supplier.ts`: `mapCensusDatum`, with a named UNKNOWN for each key it cannot establish, and `createEncounterStateSupplier`. The production supplier's `gameBuildOf` returns `null`, because only `src/publication/pipeline.ts` may import the build resolver.
- `src/findings/enemy-count-bindings.ts`: `withEnemyCountAt` asks a supplier, defaulting to production.
- `src/engine/game-state/enemies/enemy-set.ts`: `EnemySetUpperBoundEvidence.provenance` is a required citation, replacing a bare string. An incomplete one stays `UPPER_BOUND_WITHOUT_PROVENANCE`.
- `tests/unit/polb-a-encounter-census.test.ts` (new), and `tests/unit/onb-s3-enemy-set.test.ts` updated for the citation, with its negative case widened to three incomplete citations.
- `agent/architecture.md` "POLB-A", `agent/follow-ups.md` "After POLB-A", and `agent/autopilot-queue.md` (POLB-A outcome and PR_OPEN; POLB-CENSUS's decision now states the numbers). All 74 merged tranches the supervisor listed were already recorded, so none needed writing.

## Decisions a reviewer should weigh

1. **Build-keyed applicability.** The owner allowed "build or season". I chose build, failing closed, because a stale lower bound could produce a wrong finding. The cost is stated: only two retained analyzed pulls have a provable build.
2. **Witness retention.** The proposal keeps whole captured events for deaths, first hits and enough of each track to reproduce the predicate, rather than whole streams (36.6 MB per pull). On the measured pull, full stream and witnesses gave identical presence intervals for all 45 instances, and identical exact minima for every cell. This is captured evidence, not derived conclusions, and the raw pages stay under `.probe/`.
3. **The bracket predicate reads later events in a census pull.** O2 governs an analyzed pull's decision, and the census is not one. It says "arisen and not demised", never targetable.
4. **The seam's upper-bound path is tested with a review state only the test holds,** so the positive route is exercised while production cannot reach it.
5. **POLB-A's seam does not use a lower bound.** POLB-B owns that, and must show which windows can transfer one, because adds die at the group's speed.

## Validation

- `npm run typecheck`, `format:check`, `test:corpus` and `test:evidence`: all exit 0.
- Full suite (`--testTimeout=60000`): 20,177 of 20,180 passed, 3 failed: `m9b-corpus-gate` "passes every assertion", `m9b-corpus-harness` SPEC_PROTECTION_PALADIN, and `runner-service-queue` W (a leftover job directory). All three files then passed alone and serially (76 of 76, `--maxWorkers=1`). Earlier tranches recorded the same two kinds of failure under parallel load. I did not run them on the base at this load, so that is the likely explanation rather than a proven one.
- `tests/unit/polb-a-encounter-census.test.ts`: 35 of 35, run alone after the fix. The full suite and gates above predate the fix, whose only source change is the new pure module, which nothing in production imports.
- Review cycle 1 found that a minimum over 250 ms samples is not a lower bound. Fixed: `src/data/encounter-census/bracket-predicate.ts` computes the exact minimum and refuses a partly covered window, with a dip shorter than 250 ms in its tests. The cell minima on the measured pull did not change, except that the last 15 s are now refused.
- Not re-run: the replays behind the by-specialization table. Those counts come from saved ONB-S3R, ONB-T1P and ONB-T2P outputs, which the section says.
