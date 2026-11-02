# Review request

Rolling file: overwritten for each review cycle.

## Tranche

M15-B: TLDR from trustworthy findings. Autopilot queue entry M15-B. Branch
`autopilot/m15-b`, from main at 6fa228b.

- **Direction** (queue entry; architecture "Milestone 15" and "M15-A";
  CLAUDE.md "Reported Coverage", "Reporting", "UNKNOWN", "Unsupported
  Specialization", "Comparison Cannot Move Confidence"): a short TLDR from the
  prioritized trustworthy findings and the analysis coverage. It always
  discloses partial coverage ("we could only analyze part of this fight" is
  distinct from "found little to fix"), never turns UNKNOWN into certainty or
  SUPPRESSED into failure, and is exposed through the shared service so REST
  and MCP are identical.
- **Warcraft Logs requests: none.** Synthetic views, and the committed
  M11-G2 subject fight through `analyzeFight` with in-memory
  preflight/ingest doubles.
- Queue bookkeeping: M15-A (#31, 6fa228b) recorded MERGED; M15-B PR_OPEN.
  M12-C through M14-F were already recorded.

## Public contract change (EXPECTED), precisely

`src/contracts/analysis-contract.ts`, under `warcraft-logs-coach.analysis/1`
(version unchanged):

- New optional common field **`tldr: TldrSchema.optional()`** on EVERY
  status (ANALYZED and the four non-analyzed ones). Optional in the schema
  only, the additive rule already used by `preparation` and `diagnosis`; the
  single-fight service emits it on every status. Raid-night cells: unchanged,
  no TLDR.
- `TldrSchema`, discriminated on `assessment`:
  - `ASSESSED`: `revision: "fight-tldr/1"`, `assessmentScope: "PARTIAL"`
    (literal), `headline` (4 values), `gameplay` (ANALYZED with
    eligible/resolved/unknown decisions and excluded casts, or the
    non-analyzed status alone), `highlights[]` (position, itemKind,
    category, divergence standing, subjectToken, occurrences, first/last
    fight time, ≥ 1 evidence locator), `divergences` (items, records,
    actionableRecords, notListedItems), `notAssessed[]` (category ×
    non-assessment disposition, records > 0), `preparation` (each consumable
    `{OBSERVED, count}` or `{UNKNOWN}` with no count; or NOT_ASSESSED with
    the PREP reason), `damageDiagnosis` (ASSESSED with statement count,
    NOT_ASSESSED with the M14-F reason, or null when gameplay was not
    analyzed), `disclosures[]` (≥ 1), `lines[]` (≥ 1), `magnitude:
    "NOT_USED"`, `findingEffect: {confidence: "NONE", suppression: "NONE"}`.
  - `NOT_ASSESSED`: `revision` and `reason` (INVALID_TLDR_CONFIG,
    FINDINGS_NOT_RESTATABLE, FINDINGS_REFUSED, COVERAGE_INCONSISTENT) only.
- New exported vocabularies `PUBLIC_TLDR_HEADLINES`,
  `PUBLIC_TLDR_DISCLOSURES`, `PUBLIC_TLDR_NOT_ASSESSED_REASONS`,
  `PUBLIC_TLDR_CATEGORIES`, `PUBLIC_TLDR_NOT_ASSESSED_DISPOSITIONS`,
  `PUBLIC_TLDR_DIVERGENCE_STANDINGS`, and `TldrSchema`, `TldrHighlightSchema`,
  `PublicTldr`. Each list is declared independently and pinned equal to
  `src/reporting/` by test.
- `src/contracts/analysis-projection.ts`: `projectTldr`, field by field, via
  the `FightAnalysis` type (no new import).
- `src/mcp/tools/analyze-warcraft-log.ts`: one description paragraph saying
  what the TLDR is and is not. Input and output schema objects unchanged
  (the output schema is `PublicAnalysisResultSchema`, so it gains `tldr`).
- No `src/api/` change: REST and MCP both call `projectAnalysisResult`.

## What changed internally

- `src/reporting/tldr.ts` (new): `buildFightTldr(input, config)` restates
  the view and the preparation report (M15-A adapters), checks the restated
  decisions against the view's own coverage counts, and calls
  `summarizeFindings(records, context, config)`, which prioritizes and
  summarizes. `fight-tldr-config/1`: `maxHighlights` 3 (integer 1..10) plus
  the M15-A aggregation config.
- `src/reporting/finding-record.ts` / `restatement.ts` / `prioritization.ts`:
  `ReportableFinding.subjectToken` (view: the observed token; preparation:
  null), carried on items and included in the aggregation group key.
- `src/services/analysis-service.ts`: builds the TLDR last on the analyzed
  path (from the view, preparation and the diagnosis STATE) and on the
  unsupported path; `tldrDiagnosisOf` restates the diagnosis outcome to
  `{assessment, statements | reason}`. `src/services/result.ts`:
  `FightAnalysis.tldr?`.

## Decisions for the reviewer

1. **Coverage is structural, not prose.** `assessmentScope` is a literal
   PARTIAL (no analysis in this build examines a whole fight; CAPABILITY
   already says `partialCoverageIsExpected`), `disclosures` cannot be empty,
   and the headline vocabulary has no "clean" value:
   `NO_AUTHORITY_DIVERGENCE_IN_ANALYZED_DECISIONS` is about resolved
   decisions only and is distinct from `NO_DECISION_RESOLVED` and
   `GAMEPLAY_NOT_ANALYZED`.
2. **Only prioritized items are highlighted**, in the M15-A order. UNKNOWN,
   SUPPRESSED, NO_AUTHORITY_AVAILABLE and UNSUPPORTED are tallied in
   `notAssessed`, never highlighted; an UNKNOWN consumable has no count field
   at all (schema-enforced).
3. **Actionability is not overstated.** Each highlight carries its standing,
   and its sentence says "Whether the authority's alternative was possible
   is not proven" unless the standing is the actionable one. On real
   evidence nothing is actionable (After M15-A).
4. **Fail closed** to NOT_ASSESSED on any refusal, invalid config, or a view
   whose coverage counts disagree with its decisions; never a summary built
   from part of the findings.
5. **Diagnosis is a disclosed state only.** The TLDR does not summarize
   diagnosis statements (no reviewed adapter); it says whether diagnosis was
   assessed and how many statements it made. The M14-F guard that the
   outcome reaches nothing but the envelope now admits exactly the one
   `tldrDiagnosisOf(diagnosis)` reading (test updated to pin that).
6. **`lines` are templates over the structured fields**, no correctness,
   blame or score words (tested); the structured fields are the contract.

## Existing tests changed, and why

- `tests/unit/analysis-composition.test.ts`: the M6-B "no coaching-shaped
  field" sweep banned the word `tldr`. M15-B authorizes it; `tldr` left the
  list, the other banned words stay, and the test now asserts the TLDR is
  ASSESSED and PARTIAL.
- `tests/contracts/m15a-reporting-layering.test.ts`: "nothing imports it
  yet" becomes "imported only by the analysis service and the result type";
  `tldr.ts` added to the module list.
- `tests/contracts/m14f-diagnosis-layering.test.ts`: see decision 5.
- `tests/contracts/m6a-mcp-layering.test.ts`: `src/reporting` added to the
  roots that may not import the contract.
- `m7b` equivalence and the Blood/Retribution/Brewmaster public-projection
  tests build an expected `FightAnalysis`; they now add the TLDR the service
  builds (`tests/support/tldr.ts`), exactly as M14-F added diagnosis.
- `tests/unit/m15a-finding-prioritization.test.ts`: record builder gains
  `subjectToken: null`.

## Real evidence

The subject's Blood analysis through `analyzeFight` (no WCL): headline
`AUTHORITY_DIVERGENCES_IN_ANALYZED_DECISIONS`; gameplay counts equal the
view's coverage; divergence records equal `coverage.rejected`; 0 actionable;
the 45-occurrence `heart_strike` PATTERN first,
`DIVERGENCE_ALTERNATIVE_ACTIONABILITY_UNPROVEN`; 224 UNKNOWN rotation
decisions tallied; diagnosis NOT_ASSESSED disclosed. The projected document
validates, its `tldr` equals the internal one, every highlight locator is a
published decision, and decisions/coverage/preparation/diagnosis are
identical with and without the TLDR. The same fight with an Arms identity
(unsupported) carries `GAMEPLAY_NOT_ANALYZED` with its consumables.

## Validation

- `npx tsc --noEmit`: clean. `prettier --check .`: clean.
- Focused: `m15b-fight-tldr`, `m15b-tldr-contract`, `m15a-*`, `m14f-*`,
  `m6a-mcp-layering`, `m6c-analysis-contract`, `analysis-composition`: pass.
- `npm run test:corpus`: PASSED (183 cases / 778 assertions, byte-identical).
- Full `npx vitest run`: see below / CI.
