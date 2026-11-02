# Review request

Rolling file: overwritten for each review cycle.

## Tranche

M15-D: Advanced report presentation. Autopilot queue entry M15-D. Branch
`autopilot/m15-d`, from main at 0ccf829.

- **Direction** (queue entry; architecture "Milestone 15", "M15-A", "M15-B";
  CLAUDE.md "Reporting", "Reported Coverage", "Findings", "Evidence",
  "UNKNOWN", "Top Logs Cannot Suppress Findings Merely by Similarity"):
  richer markdown and JSON report rendering from structured findings,
  grouped by decision category, each finding with its evidence ("why did it
  tell me this?") and actionability, suppressions with their machine-readable
  reasons, and a coverage section. Presentation only: no new findings, no
  re-evaluation, no Warcraft Logs access.
- **Warcraft Logs requests: none.** Synthetic views/records, and the
  committed M11-G2 subject fight through `analyzeFight` with in-memory
  preflight/ingest doubles.
- Queue bookkeeping: M15-B (#32, 0ccf829) recorded MERGED; M15-D PR_OPEN.
  M12-C through M15-A were already recorded MERGED with their PRs and SHAs.

## Public contract change (EXPECTED), precisely

`src/contracts/analysis-contract.ts`, under `warcraft-logs-coach.analysis/1`
(version unchanged):

- New optional common field **`report: ReportSchema.optional()`** on EVERY
  status (ANALYZED and the four non-analyzed ones). Optional in the schema
  only, the additive rule used by `preparation`, `diagnosis` and `tldr`; the
  single-fight service emits it on every status. Raid-night cells: unchanged,
  no report.
- `ReportSchema`, discriminated on `assessment`:
  - `ASSESSED`: `revision: "fight-report/1"`, `assessmentScope: "PARTIAL"`
    (literal); `coverage` {`gameplay`, `preparation`, `damageDiagnosis`:
    the TLDR's own shapes, now shared consts; `recordsByDisposition`: exactly
    7 rows, one per disposition, zero included; `disclosures` ≥ 1 from the
    TLDR disclosure list}; `categories[]` {`category`, `prioritized[]`,
    `informational[]`, `carried[]` of `ReportEntrySchema`}; `suppressions[]`
    {category, `suppressionReason` (one of the 4 named environmental
    reasons, never null), `reasonCode`, `subjectToken`, `records` > 0};
    `markdown` (non-empty string); `magnitude: "NOT_USED"`; `findingEffect:
    {confidence: "NONE", suppression: "NONE"}`.
  - `NOT_ASSESSED`: `revision` and `reason` (INVALID_REPORT_CONFIG,
    FINDINGS_NOT_RESTATABLE, FINDINGS_REFUSED, COVERAGE_INCONSISTENT) only.
- Entry schemas, one per section; each category array admits ONLY its own
  section's entries (`prioritized: ReportPrioritizedEntrySchema[]`,
  `informational: ReportInformationalEntrySchema[]`,
  `carried: ReportCarriedEntrySchema[]`; `ReportEntrySchema` is their union).
  Common fields: itemKind, producer, authority, actionability, subjectToken,
  occurrences, first/last fight time, evidence locators.
  - `PRIORITIZED`: `position` ≥ 1, disposition literal
    `AUTHORITY_DIVERGENCE`, a divergence standing, `stateEvidence` literal
    PROVEN, ≥ 1 evidence locator, reasonCode/suppressionReason null.
  - `INFORMATIONAL`: one variant per disposition (AUTHORITY_CONSISTENT,
    OBSERVED_FACT), `standing` equal to it, position, reasonCode and
    suppressionReason null.
  - `CARRIED`: one variant per disposition (SUPPRESSED, UNKNOWN,
    NO_AUTHORITY_AVAILABLE, UNSUPPORTED), `standing` equal to it, position
    null, `reasonCode` required. `suppressionReason` is a named
    environmental reason for SUPPRESSED and null for every other
    disposition.
- New exported vocabularies `PUBLIC_REPORT_NOT_ASSESSED_REASONS`,
  `PUBLIC_REPORT_DISPOSITIONS`, `PUBLIC_REPORT_STATE_EVIDENCE`,
  `PUBLIC_REPORT_ACTIONABILITY`, `PUBLIC_REPORT_SUPPRESSION_REASONS`, and
  `ReportSchema`, `ReportEntrySchema`, `PublicReport`. Each list is declared
  independently and pinned equal to `src/reporting/` by test.
- The TLDR schema is byte-for-byte equivalent: its inline gameplay,
  preparation and damage-diagnosis sub-schemas were only extracted into
  shared consts (`TldrGameplaySchema`, `TldrPreparationSchema`,
  `TldrDamageDiagnosisSchema`, not exported).
- `src/contracts/analysis-projection.ts`: `projectReport`, field by field,
  via the `FightAnalysis` type (no new import). The TLDR projection's
  sub-blocks were extracted into helpers that both use; TLDR output is
  unchanged (its tests pass unmodified).
- `src/mcp/tools/analyze-warcraft-log.ts`: one description paragraph saying
  what the report is and is not. Input schema unchanged; the output schema is
  `PublicAnalysisResultSchema`, so it gains `report`.
- No `src/api/` change: REST and MCP both call `projectAnalysisResult`.

## What changed internally

- `src/reporting/fight-report.ts` (new): `buildFightReport(input, config)`
  calls `restateFight`, then `reportFindings(records, context, config)`,
  which runs `prioritizeFindings` and lays out coverage, categories and
  suppressions. `renderReportMarkdown(body)` is a pure function of the
  structured body. `fight-report-config/1` holds only the M15-A aggregation
  config: the report lists every item.
- `src/reporting/tldr.ts`: `restateFight` (the restatement and coverage
  consistency check, moved out of `buildFightTldr` unchanged) and
  `coverageDisclosures` (the disclosure rule minus the TLDR-only
  `DIVERGENCES_NOT_LISTED`) are extracted and shared. The prose helpers
  (`plural`, `clock`, `STANDING_SENTENCES`, `consumableText`) are exported.
  TLDR behavior is unchanged.
- `src/reporting/restatement.ts`: the preparation adapter's `subjectToken` is
  the consumable kind (was null), so an entry names its fact. Preparation
  records have `aggregationKey: null` and are never grouped, so prioritization
  is unaffected.
- `src/services/analysis-service.ts`: `presentationOf(input)` builds the TLDR
  and the report from ONE input on both the analyzed and unsupported paths,
  so they describe the same restated findings. The diagnosis reading
  (`tldrDiagnosisOf`) and the M14-F guard are unchanged.
  `src/services/result.ts`: `FightAnalysis.report?`.

## Decisions for the reviewer

1. **Structure is the contract; markdown is derived.** The markdown is
   rendered by `src/reporting/` from the body and copied by the projection.
   A test re-renders it from the PUBLISHED fields and requires equality, so
   the text can say nothing the JSON does not.
2. **Coverage first, PARTIAL always.** Same disclosures rule as the TLDR. The
   markdown opens with "Partial analysis... It is not a complete assessment."
   and the Coverage section precedes the findings.
3. **Three sections, never mixed, schema-enforced.** UNKNOWN and SUPPRESSED
   can never be PRIORITIZED. A suppression must name one of the four
   environmental reasons. A divergence entry must be PROVEN with evidence.
4. **Every item is listed exactly once.** The report does not truncate; the
   TLDR remains the short form. The report's prioritized head equals the
   TLDR's highlights (tested).
5. **Each entry answers "why".** Producer, authority, state evidence,
   reason/suppression reason, actionability and standing (with the TLDR's
   standing sentence: "Whether the authority's alternative was possible is
   not proven"), plus evidence locators. The markdown shows the count and
   the first locator.
6. **No new vocabulary of judgment.** No correctness, blame or score words in
   the prose (tested, beyond the M6-B sweep). "Not evidence of clean play"
   is the only use of "clean play", and it denies it.

## Existing tests changed, and why

- `tests/support/tldr.ts`: `withExpectedTldr` also attaches the report the
  service builds (`expectedReportOf`), so the public-projection and m7b
  tests that build an expected `FightAnalysis` keep comparing the whole
  analysis. Their assertions are unchanged.
- `tests/regression/m7b-fight-analysis-equivalence.test.ts`: compares
  `report` and lists it in the key set.
- `tests/contracts/m15a-reporting-layering.test.ts`: `fight-report.ts` in the
  module list; the service and result type also import it.

## Real evidence

The subject's Blood analysis through `analyzeFight` (no WCL): ROTATION's
prioritized, informational and carried occurrences equal the view's
rejected, matched and UNKNOWN (224) counts. The 45-occurrence `heart_strike`
PATTERN is at position 1, `DIVERGENCE_ALTERNATIVE_ACTIONABILITY_UNPROVEN`,
and nothing is actionable. There are no suppressions, and DECISIONS_UNKNOWN
and DAMAGE_DIAGNOSIS_NOT_ASSESSED are disclosed. The projected document
validates, its `report` equals the internal one, and its markdown re-renders
from the published fields. Every prioritized locator is a published decision,
and the rest of the document is identical with and without the report. The
same fight with an Arms identity carries a report with PREPARATION only and
"this is not evidence of clean play". Size: the report adds ~53 KB to a
233 KB document (markdown 8.3 KB); see follow-ups "After M15-D".

## Validation

- `npx tsc --noEmit`: clean. `prettier --check .`: clean.
- Focused: `m15d-fight-report` (27), `m15d-report-contract`, all
  `tests/contracts` plus `m15b` unit, `analysis-composition` and `m7b`:
  113 files / 6239 tests pass.

## Review cycle 2 (local review CHANGES_REQUIRED, both fixed)

1. Category arrays are now section-specific schemas; tests prove a
   PRIORITIZED, INFORMATIONAL or CARRIED entry is rejected in each other
   array.
2. SUPPRESSED requires a named environmental reason, and UNKNOWN /
   NO_AUTHORITY_AVAILABLE / UNSUPPORTED require null; a carried or
   informational entry's standing must equal its disposition. Negative
   tests cover each mismatch.
- `npm run test:corpus`: PASSED (183 cases / 778 assertions, two workerd
  runs byte-identical, matches the committed report).
- Full `npx vitest run --testTimeout=180000`: 380/382 files, 11676/11678
  tests. The 2 failures (`runner-service-queue` W, a temp-directory leftover
  check shared with parallel simulation tests, and `m9b-corpus-harness`
  Protection) touch no reporting code, differ between runs under load, and
  both files pass alone (37/37). CI is the arbiter.
