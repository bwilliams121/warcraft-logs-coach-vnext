# Review request

Rolling file: overwritten for each review cycle.

## Tranche

PREP-5: The MCP tool description mentions consumable status. Autopilot queue
entry PREP-5. Branch `autopilot/prep-5`, from main at b27317d.

- Warcraft Logs: none. No request was made or planned.
- Corpus and evidence-archive bytes: unchanged.
- **Public contract: EXPECTED, and description text only.** See below.

## Public contract change (declared EXPECTED)

The only public change is the `description` string of the two MCP tools, as
advertised in `tools/list`:

- `analyze_warcraft_log` (`analyzeToolDescription`,
  `src/mcp/tools/analyze-warcraft-log.ts`): one new paragraph, placed before
  "Partial coverage is expected".
- `analyze_raid_night` (`raidNightToolDescription`,
  `src/mcp/tools/analyze-raid-night.ts`): one new paragraph, placed before
  the `trendEvidence` paragraph.

Unchanged:

- tool names, titles, annotations and input schemas;
- both outputSchemas (`PublicAnalysisResultSchema`,
  `PublicRaidNightResultSchema`) and schema versions;
- every projection, the REST surface, and all analysis behavior.

Nothing under `src/contracts/` or `src/api/` changed.

The queue scope names "the MCP tool". Both tools carry the status (PREP-2 for
the single-fight result, PREP-3 for present raid-night cells), and both
descriptions were silent. So both were updated, with the same meaning and
each in its own tool's field names.

## What the paragraph says

- The status is always carried:
  - single fight: on every status, SPEC_NOT_SUPPORTED included;
  - raid night: on every present cell, whatever its kind.
- It covers health potion, healthstone and combat potion use. It is
  specialization-independent and is not gameplay analysis.
- `countState` OBSERVED is a complete count. UNKNOWN carries its `reasons`
  (raid night: `reasonCodes`) and `observedAtLeast`, which is a lower bound
  and NOT a count.
- Zero is reported only under complete coverage, so an UNKNOWN must never be
  read as zero use.
- `assessment` NOT_ASSESSED claims nothing about consumables. The
  single-fight reasons (NO_FIGHT_RETRIEVED, RETRIEVAL_FAILED) are both "the
  fight was not retrieved". For the raid night it is "the fight's retrieval
  failed", matching `CellPreparationSchema`'s doc.
- These are observed facts only. They do NOT say a consumable should have
  been used.

The analysis description still does not mention the raid night (pinned by
`m11a-supported-specializations-derivation`).

## Tests

New: `tests/contracts/prep5-tool-description-consumables.test.ts`. For each
tool:

- the "always carried" sentence;
- the shared meaning phrases: lower bound, zero only under complete
  coverage, UNKNOWN never zero, NOT_ASSESSED claims nothing, no "should have
  been used";
- **prose tied to the contract:** every field and value the paragraph names
  (`preparation`, `countState`, `OBSERVED`, `UNKNOWN`,
  `reasons`/`reasonCodes`, `observedAtLeast`, `NOT_ASSESSED`) must appear,
  quoted, in that tool's advertised output JSON Schema;
- a negative check: no consumable-judgment phrase.

The existing pinned-phrase and forbidden-claim tests for both descriptions
still pass unchanged:

- m6d, m10d, m11a derivation, m11a tools/list;
- the Retribution, Blood and Brewmaster registrations.

## Docs

- `agent/architecture.md` "PREP-5";
- `agent/follow-ups.md`: the last open PRODUCT-INTENT GAP item is marked
  RESOLVED;
- `agent/testing.md`: a PREP-5 entry;
- `agent/autopilot-queue.md`: M12-C recorded MERGED (PR #18, b27317d6), and
  PREP-5 set to PR_OPEN.

## Validation

- Focused, 8 files (the new test plus every description test): 118 passed.
- `npm run typecheck`: clean.
- `npm run format:check`: clean.
- `npm run test:corpus`: PASSED (183 cases, 778 assertions, two workerd runs
  byte-identical, committed report matches).
- `npm test`: 10,557 passed and 13 failed, all in 11 files untouched by this
  change, all timeouts (`Test timed out in 5000ms`) under heavy local load.
  - Rerun with `--maxWorkers=2`, 10 of those 11 files pass.
  - The remaining one, `m8g-encounter-context-composition`, times out the
    same way with this tranche's two source files reverted (stash), under
    the same load. So it predates this tranche.
  - GitHub CI is the clean-machine check.
