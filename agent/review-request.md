# Review request

Rolling file: overwritten for each review cycle.

## Tranche

M15-F: Product hardening and final coverage disclosure. Autopilot queue entry
M15-F. Branch `autopilot/m15-f`, from main at 1d6ead6.

- **Direction.** Queue entry M15-F ("consistent coverage disclosure on every
  report shape (supported, partial, unsupported specialization, raid night);
  REST and MCP parity; negative tests from CLAUDE.md 'Mandatory Negative-Test
  Philosophy' over the integrated reports. No new analysis capability.");
  follow-ups "After M15-B" / "After M15-D" (raid night carries no coverage
  summary) and "After M13-F" (TLDR/report silent about support facts, "M15-F
  at the earliest"). CLAUDE.md "Reported Coverage".
- **Warcraft Logs: NONE.** No request, probe or probe config was run.
- **Queue bookkeeping.** M13-F (#36, 1d6ead6) recorded MERGED; M15-F is
  PR_OPEN with its branch. Every other tranche the supervisor listed was
  already recorded MERGED with the same PR and SHA (verified).

## Public contract change (EXPECTED), precisely

Additive only: no field removed, no enum narrowed, no existing field changes
meaning, no version change.

1. **`warcraft-logs-coach.analysis/1`: `PUBLIC_TLDR_DISCLOSURES` widened**
   (shared by `tldr.disclosures` and `report.coverage.disclosures`) with two
   codes, appended:
   - `SUPPORT_OBSERVATIONS_NOT_SUMMARIZED`: held exactly when the document
     carries `supportObservations` (today: the Augmentation documents).
   - `RAID_COOLDOWN_PLAN_NOT_EVALUATED`: held exactly when the document
     carries `raidCooldownPlan` (any status).
   With each, `tldr.lines` gains one templated sentence (after the existing
   lines) and `report.markdown` one "- Not in this report: …" line after
   "Not established". A document without either block is byte-identical to
   before.
2. **`warcraft-logs-coach.raid-night/1`: new optional top-level
   `coverageDisclosure`** (always emitted): `{ revision:
   "raid-night-coverage-disclosure/1", assessmentScope: "PARTIAL",
   disclosures: PUBLIC_RAID_NIGHT_DISCLOSURES[] (min 1), lines: string[] (min
   1) }`, strict. New frozen vocabulary `PUBLIC_RAID_NIGHT_DISCLOSURES`:
   NO_CELL_ANALYZED, ONLY_OBSERVED_DECISIONS_VERIFIED, DECISIONS_UNKNOWN,
   CASTS_EXCLUDED, CELLS_SPEC_NOT_SUPPORTED, CELLS_NOT_ANALYZED,
   CELLS_ANALYSIS_UNAVAILABLE, FIGHTS_MISSING, FIGHTS_FAILED,
   CONSUMABLE_COUNT_UNKNOWN, PREPARATION_NOT_ASSESSED,
   PER_FIGHT_PRESENTATION_NOT_INCLUDED (always held). Nothing else in the
   night changes.
3. **MCP tool descriptions** (`src/mcp/tools/*.ts`, text only): the
   single-fight description says tldr/report do not summarize
   supportObservations or raidCooldownPlan and name the two codes; the
   raid-night description describes `coverageDisclosure`.

No `src/api/` file changed. The encounter-context contract is unchanged
(follow-up).

## What changed

1. **Reporting** (`src/reporting/tldr.ts`, `fight-report.ts`):
   `UNSUMMARIZED_BLOCKS` (SUPPORT_OBSERVATIONS, RAID_COOLDOWN_PLAN), optional
   `TldrInput.unsummarized` carried into `TldrContext`; the shared
   `coverageDisclosures` rule adds the matching code; one shared sentence per
   code (`UNSUMMARIZED_SENTENCES`) used by the TLDR lines and the markdown.
   The markdown is still a pure function of the published body (it reads
   `coverage.disclosures`).
2. **Service** (`analysis-service.ts`): passes which of the two blocks the
   document carries, on both the analyzed path and the unsupported path. No
   other behavior changes.
3. **Raid-night disclosure** (`src/aggregation/raid-night-disclosure.ts`,
   new): pure function of `RaidNightAnalysis` over its own `coverage` totals
   and the cells' preparation; no I/O, clock or new count. The projection
   calls it and copies the result field by field.
4. **Contracts**: the widened TLDR vocabulary; `RaidNightCoverageDisclosureSchema`
   and its vocabulary; the projection.
5. **Docs**: architecture "M15-F", follow-ups "After M15-F" (+ resolved notes
   in After M15-B / M15-D / M13-F), queue.

## Tests

- New `tests/integration/m15f-integrated-report-hardening.test.ts` (17):
  every shape (ANALYZED with divergences [M5-A], ANALYZED partial [M5-D2],
  ANALYZED + plan, SPEC_NOT_SUPPORTED [Arms subject], the real M13-A
  Augmentation document, a mixed 100-cell night and an unanalyzed night)
  through the real service and BOTH transports: REST ≡ MCP structured ≡ MCP
  text, schema-valid. Coverage: TLDR/report PARTIAL, non-empty, report
  disclosures = TLDR's minus DIVERGENCES_NOT_LISTED, coverage sentence first,
  markdown re-renders from the published body, analyzed counts agree across
  coverage/TLDR; the unsummarized codes held exactly when the block is
  carried. Negatives on the integrated documents: unsupported never clean
  (no decision/coverage keys, GAMEPLAY_NOT_ANALYZED, no highlights); support
  document never an assessment; low coverage never complete; UNKNOWN never
  highlighted and tallied equal to coverage; nothing DECISION_PROVEN_ACTIONABLE
  and 0 actionable records; three consumables always present, UNKNOWN never
  numeric; no ASSIGNMENT entry and the supplied plan NOT_EVALUATED; support
  families NO_AUTHORITY_AVAILABLE without a model id; no score/grade/rank/
  rating/percent/accuracy/severity/impact key anywhere (except the
  `scoresPerformance: false` literal); no racial subject token in any entry.
  Raid night: disclosure equals the domain's, each code held exactly when the
  night's coverage says so, partial sentence first, unanalyzed night never
  clean.
- New `tests/unit/m15f-raid-night-disclosure.test.ts` (8): shape, order,
  determinism, exact lines, each code's trigger (UNKNOWN, excluded, not
  analyzed, UNKNOWN consumable never zero, failed/missing fights), no
  rate/score/clean wording.
- New `tests/contracts/m15f-coverage-disclosure-contract.test.ts` (5):
  vocabularies pinned to internal arrays; the two codes are appended last;
  the schema refuses another scope, an empty list, an unknown code, no lines,
  an extra field, another revision.
- Updated because the contract genuinely changed (no assertion weakened):
  `m12e-raid-cooldown-plan-input` "a plan adds its disclosure and changes
  nothing else" now proves the TLDR/report differ by EXACTLY the one code and
  one sentence each (everything else still deep-equal); `m7e` top-level keys
  add `coverageDisclosure`; `m7d` module list adds the new aggregation
  module (its I/O/clock/state checks now cover it).

## Validation

- `npx tsc --noEmit`: clean. `npx prettier` on changed files: clean.
  `git diff --check`: clean.
- The new and updated files (6 files, 195 tests): pass.
- Full `npx vitest run --testTimeout=180000`: 11838/11841. The 3 failures
  are load-only: `m9b-corpus-gate` and `m9b-corpus-harness` Protection hit
  their own hard-coded 60 s / 20 s timeouts (the same Protection timeout noted
  in M13-D, M15-D and M13-F), and `runner-and-parser` U counts a shared temp
  directory that a concurrent test wrote to. Rerun alone: both files pass
  (49/49); the corpus gate passes standalone (below).
- `npm run test:corpus`: PASSED (two workerd runs byte-identical, 780/780
  assertions, committed report matches; no corpus change needed).
- `npm run test:evidence`: PASSED (unchanged).

## Decisions for the reviewer

1. **Disclose, do not summarize.** Summarizing support facts or plan content
   would need a reviewed M15-A adapter (follow-ups). Naming the omission is
   the hardening; it changes no finding and ranks nothing.
2. **Night-level, derived, not authored.** The raid-night disclosure reads
   only the aggregate's own totals and the cells' preparation, so its codes
   cannot disagree with `coverage`. A per-cell TLDR would add payload to every
   cell and needs its own decision (follow-up).
3. **Derivation lives in the aggregation domain, called by the projection.**
   Keeping `RaidNightAnalysis` unchanged avoids rippling every aggregate
   literal and the encounter-context reuse; the projection still only copies
   what the pure domain function returned.
4. **No "clean play" phrase on the night.** The M7-E test forbids the word on
   a raid night; the lines say "nothing is claimed about how anyone played".
