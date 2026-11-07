# Review request

Rolling file: overwritten for each review cycle.

## Change

SIMC-FB-B: public disclosure of SimC-profile-relative evaluation. Branch `autopilot/simc-fb-b`, from `main` at fd0892d.

- **Public contract change: EXPECTED, additive, under `analysis/1` and `raid-night/1`.** No field is removed, renamed or re-meant. Each new field is optional and present only when a decision read the pinned profile.
- **No specialization is wired,** so no document a caller can receive today changes. The only visible change is one paragraph in each of two tool descriptions. SIMC-FB-R wires specializations.
- **Warcraft Logs: no request was made.** Everything reads committed bytes.

## The public change, precisely

Added to `src/contracts/analysis-contract.ts`:

- `decisions[].encounterState` (optional): `{ basis: "SIMC_PROFILE_RELATIVE", facts: [{ fact, atomKey, semanticId, sourceIndex }] }`. Absent means an observed-fight evaluation.
- `simcProfileEvaluation` (optional, ANALYZED only): `{ revision: "simc-profile-evaluation/1", basis, encounterStateObserved: false, coverage: { decisions, match, rejected, unknown }, sources: [...], findingEffect: { confidence: "NONE", suppression: "NONE", actionability: "NONE" } }`. Each source holds the dataset, pin, build, environment commit, APL authority, profile path and hash, environment, and the cited engine statements.
- `tldr.gameplay.simcProfileRelative` and `report.coverage.gameplay.simcProfileRelative` (optional).
- `tldr.highlights[].encounterStateBasis` and `.profileSelectedToken`, and `report...entries[].profileSelectedToken` (optional).
- `diagnosis.statements[].findingsUnderSimcProfile` (optional).
- Enums widened: `PUBLIC_REPORT_STATE_EVIDENCE` gains `SIMC_PROFILE_RELATIVE`, admitted on prioritized and informational entries and refused on carried ones. `PUBLIC_TLDR_DISCLOSURES` gains `DECISIONS_EVALUATED_UNDER_SIMC_PROFILE`, inserted before the unsummarized-block codes. New `PUBLIC_SIMC_PROFILE_FACTS`.

Added to `src/contracts/raid-night-contract.ts`, and so to the encounter-context document, which reuses the cell and recurrence schemas:

- `cells[ANALYZED].simcProfileEvaluation` (optional): counts and sources, without the cited statements.
- `coverage.simcProfileRelative` and `recurrence.simcProfileRelativeRejectedPatterns` (optional).
- `PUBLIC_RAID_NIGHT_DISCLOSURES` gains `DECISIONS_EVALUATED_UNDER_SIMC_PROFILE`.

REST and MCP publish these through the same projections. `src/mcp/tools/` gains one description paragraph each. `src/api/` is untouched.

## Decisions for the reviewer to check

1. **`SIMC_PROFILE_RELATIVE` is a state-evidence value,** not a flag beside PROVEN. PROVEN would state a modeled state as observed, and INCOMPLETE would refuse a result the owner decision keeps authority-backed. An UNKNOWN that read the profile stays INCOMPLETE, and is still counted in `coverage.unknown`.
2. **Ranking.** Listed after PROVEN, so it ranks after every proven divergence. Always LOW_PRIORITY through a new basis, so labels stay non-increasing down the rank.
3. **The label is on what was bound, not on what the scan read.** It can over-disclose and cannot under-disclose. A false absence would state a modeled result as observed. Is over-disclosure acceptable until SIMC-FB-R measures it? A counterfactual evaluation is the alternative, and it would be spec-owned work.
4. **A fourth recurrence collection.** `rejectedPatterns` keeps meaning observed encounter state, so a modeled rejection goes in `simcProfileRelativeRejectedPatterns`. `rejectedTotal` still counts it, because that total counts outcomes, and `coverage.simcProfileRelative.rejected` says how many. So `rejectedPatterns` occurrences can be below `rejectedTotal` on such a night, and that field is disclosed in the tool description. Nothing in the code relies on them being equal.
5. **A diagnosis statement may rest on a modeled rejection.** The owner decision keeps such a finding authority-backed, so it stays a finding and is named in `findingsUnderSimcProfile`. The deployed service retrieves no comparison fights, so no such statement is reachable today.
6. **Provenance is deduplicated.** Decisions cite `sourceIndex` and `semanticId` into the document's block, because a fight can have hundreds of tier-3 decisions (661 for b1Pm fight 48, actor 15). A raid-night cell carries the sources without the citations, and `analysisRef` leads to the rest.
7. **Three existing guards changed, each additively.**
   - `m6a-mcp-layering` names `src/findings/simc-profile-view.ts` as an import of the analysis projection.
   - `m5-boundary-and-vocabulary` admits that file to `COMPARISON_LAYER`, because it counts the view's outcome word `"MATCH"` and defines nothing.
   - `m10a-observed-decision-view`'s "no more and no fewer" compares a real record with the schema's keys minus the one optional `encounterState`, so it stays exact.
   - The other layering guards are untouched: `m15a-reporting-layering` is why reporting holds its own count, with a test pinning it equal, and `m7e-raid-night-layering` is why the cell states its own counts type.
8. **A guard for SIMC-FB-R.** A contract test fails any `src/specs/<class>/<spec>/` that calls `withEncounterStateAt(` and never writes `simcProfileFacts`. It is vacuous today, and it checks the tree rather than each decision.

## Tests

- `tests/unit/simc-fb-b-disclosure.test.ts`: restatement, ranking, labels, TLDR, report, cells, the night, the document, and diagnosis.
- `tests/contracts/simc-fb-b-disclosure-contract.test.ts`: pinned vocabularies, what the schemas refuse (`encounterStateObserved: true`, a moved confidence, suppression or actionability, an enemy count field), the tool descriptions, and the guard.
- `tests/integration/simc-fb-b-public-disclosure.test.ts`: real service, REST and MCP.

Negative tests the queue names:

- **Never states a count.** Every TLDR, report and night sentence is checked against a list of count and state claims.
- **Confidence and comparison.** The schema pins `findingEffect` to NONE, and a test shows the diagnosis's state changes no decision's disclosure.
- **Byte-identical.** REST-byte digests of four documents, taken from fd0892d before any edit, are pinned: M5-A, M5-D2, an unsupported specialization, and the mixed raid night. They pass on this tree.

**What the tests do not prove.** Real tier-3 facts come from `withEncounterStateAt` over the committed record, on a synthetic fight with an injected build, and are attached to real views by wrapping the Assassination registration. That proves the disclosure on every surface. It says nothing about how those decisions evaluate under the profile, which is SIMC-FB-R's.

## Bookkeeping

The queue's SIMC-FB-B entry is `PR_OPEN`. The supervisor's merged list was compared with the queue: 76 entries, and SIMC-FB-A was the one written. `agent/architecture.md` and `agent/follow-ups.md` record the above.

## Validation

Run on this tree, with no Warcraft Logs request:

- `npm run typecheck`, `npm run format:check`, `npm run test:corpus` and `npm run test:evidence` all exit 0.
- Focused, with the failed guards and the two tests that are load-sensitive in parallel runs: 295 of 295. New tests: 52, including the four byte-identical digests.
- Full suite, `npx vitest run --testTimeout=60000`: 20,332 of 20,333. The one failure is `m9b-corpus-harness` SPEC_PROTECTION_PALADIN, the timeout seen in earlier full runs (ONB-S3, POLB-A, SIMC-FB-A). It passed alone in the focused run on this code, and it was not compared against base in the same parallel run.

The four untracked local paths (`.claude/` and the three `scripts/probe/wcl-*.probe.ts` files) are the standing CLAUDE.md exclusions and are not part of this change.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
