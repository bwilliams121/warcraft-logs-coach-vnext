# Review request

Rolling file: overwritten for each review cycle.

## Tranche

M15-A: Finding aggregation and prioritization foundation. Autopilot queue
entry M15-A. Branch `autopilot/m15-a`, from main at 58fe668.

- **Direction** (queue entry; architecture "Milestone 15"; CLAUDE.md "Timing
  Tolerance", "Findings", "Reporting", "Comparison Cannot Move Confidence",
  "UNKNOWN vs NO_AUTHORITY_AVAILABLE", "ACTIONABLE Requires Positive
  Evidence"): aggregate repeated small findings into patterns and rank
  structured findings by evidence quality and actionability. Ranking consumes
  structured findings only; UNKNOWN, NO_AUTHORITY_AVAILABLE, SUPPRESSED and
  unsupported results are carried and labelled, never ranked as failures,
  never inflate confidence; thresholds configurable and documented.
- **Public contract: none.** Nothing under `src/contracts/`, `src/api/` or
  `src/mcp/` changes. Nothing in the service calls the new module (M15-B
  wires it with the TLDR).
- **Warcraft Logs requests: none.** Synthetic records, and the committed
  M11-G2 subject fight through the application service with in-memory
  preflight/ingest doubles.
- Queue bookkeeping: M14-F (#30, 58fe668) recorded MERGED; M15-A PR_OPEN.
  M12-C through M14-E were already recorded.

## What changed

New `src/reporting/` (internal):

- `finding-record.ts`: the restated `ReportableFinding` record and its
  vocabularies (dispositions, state evidence, actionability levels,
  categories, suppression reasons). No confidence/severity/score/impact.
- `aggregation-config.ts`: `finding-aggregation/1`; default pattern
  threshold 3, per-category overrides, validated (integer ≥ 2, known
  categories, known revision). An invalid config refuses the call.
- `prioritization.ts`: `prioritizeFindings(records, config)` →
  `prioritized` (proven divergences only, ranked), `informational`,
  `carried`, `refused`, `summary`; `magnitude: NOT_USED`,
  `findingEffect: {confidence, suppression, score: NONE}`.
- `restatement.ts`: the two reviewed adapters (observed-decision view;
  preparation consumable status).

Tests: `tests/unit/m15a-finding-prioritization.test.ts`,
`tests/contracts/m15a-reporting-layering.test.ts`. Docs: architecture
"M15-A", testing.md, follow-ups "After M15-A", queue.

## Decisions for the reviewer

1. **Restated records, not producer types.** Ranking reads one shared
   record; each producer has one reviewed adapter that maps its status words
   and refuses an unreviewed word (the M14-F adapter pattern). Ranking never
   branches on a producer's vocabulary or a specialization.
2. **Only `AUTHORITY_DIVERGENCE` with PROVEN state and ≥ 1 locator is
   ranked.** A divergence on INCOMPLETE state, or with no locator, is
   refused, not trusted. Every non-assessment is carried with its reason
   code; NO_AUTHORITY_AVAILABLE ⇔ authority `NO_AUTHORITY_AVAILABLE` is
   enforced both ways, so UNKNOWN and NO_AUTHORITY_AVAILABLE cannot be
   swapped.
3. **Actionability is not overclaimed.** The view's `OBSERVED_EXECUTION`
   maps to `OBSERVED_EXECUTION_ONLY` (the cast proves the observed ability
   usable, never the authority's alternative), so no view record reaches
   `ACTIONABLE_AUTHORITY_DIVERGENCE`. Only `DECISION_PROVEN_ACTIONABLE`
   does, and no producer emits it yet (follow-up).
4. **Ordering** is state evidence → actionability standing → occurrences →
   category → first time → id. No magnitude, delta, comparison behavior or
   confidence is a record field, so none can be read.
5. **Aggregation never inflates.** The group key includes everything that
   decides standing (producer, category, spec, disposition, authority,
   reason, suppression reason, state evidence, actionability, the producer's
   opaque key), so a pattern has exactly its members' standing; an UNKNOWN
   never pools with a divergence. A pattern changes item count only.
6. **No negative-actionability disposition.** `m5c1-gcd-semantics` forbids
   that vocabulary anywhere in `src/` beyond the one assignment outcome; the
   test is unchanged, and a proven restriction is carried as SUPPRESSED with
   its named reason.
7. **Suppression** needs one of CLAUDE.md's four named environmental
   reasons; declared locally (pinned equal to M14-C's `EnvironmentalReason`
   by a test) so `src/reporting/` does not become a second outside reader of
   the post-hoc comparison-facts domain. The module itself suppresses
   nothing.
8. **Preparation**: all three kinds always; a zero under COMPLETE coverage
   is `OBSERVED_FACT` (informational), UNKNOWN is carried, never a zero.

## Real evidence

The subject's Blood analysis through `analyzeFight` (no WCL): 307 decisions
and 3 consumable kinds restate with 0 refused; prioritized records equal the
view's rejected count, carried equal its 224 UNKNOWN plus any UNKNOWN
consumable; 0 actionable divergences; the leading item is the 45-occurrence
(Heart Strike) rejection PATTERN.

## Validation

- `npx tsc --noEmit`: clean.
- Focused: `m15a-finding-prioritization` (23), `m15a-reporting-layering`
  (5), `m11g2-comparison-facts-layering` (21): pass.
- Full `npx vitest run`: see the PR / CI.
- `prettier --check` on changed files: clean.
