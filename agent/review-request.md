# Review request

Rolling file: overwritten for each review cycle.

## Tranche

M14-F: Reviewed diagnosis projection and public integration. Autopilot queue
entry M14-F. Branch `autopilot/m14-f`, from main at ca2bf1a.

- **Direction** (queue entry; CLAUDE.md "Damage Output Diagnosis",
  "Comparison Cannot Move Confidence", "Top Logs Cannot Suppress Findings
  Merely by Similarity", "Reported Coverage", "Application Services";
  architecture "M14-E"; follow-ups "After M14-E": the adapter from findings
  to records "belongs with the M14-F projection, which may import both
  sides"): combine authority-backed findings with linked causal evidence and
  expose diagnosis through the shared application service, with structured
  evidence, UNKNOWN preserved and coverage disclosed. A causal coaching
  statement only where an authority-backed finding and its decision-level
  link both exist; unlinked deltas labelled observations; comparison context
  attached, never authority.
- **Warcraft Logs requests: none.** Committed archive fights (the M11-G2
  four-fight set) and synthetic fights. The comparison evidence port is a
  test double over committed evidence.
- Queue bookkeeping: M14-E (#29, ca2bf1a) recorded MERGED; M14-F PR_OPEN.
  M12-C through M14-D were already recorded.

## Public contract change (EXPECTED), precisely

Under `warcraft-logs-coach.analysis/1` (unchanged), additive only:

1. **`AnalyzedResultSchema.diagnosis`: a new OPTIONAL field**, on ANALYZED
   results only (non-analyzed statuses unchanged and strict, so they cannot
   carry it). Discriminated on `assessment`:
   - `NOT_ASSESSED { reason }`, reason one of
     `COMPARISON_EVIDENCE_NOT_RETRIEVED`, `COMPARISON_RETRIEVAL_FAILED`,
     `COMPARISON_EVIDENCE_NOT_FOR_THIS_FIGHT`, `COMPARISON_NOT_COMPARABLE`,
     `DECISION_EVIDENCE_NOT_USABLE`.
   - `ASSESSED { comparisonFights[{fightRef}], windowIds[], statements[],
     observations[], coverage{deltaRows, pairs, statements, observations,
     observationCauses tally, decisionEvidence{records, resolved, unknown,
     inNoComponent}}, encounterStateEvidence[{fightRef, phaseEvidence
     HELD|UNKNOWN}], strategyThresholds{id,status}, comparisonCoverage
     "AT_LEAST_UNCERTIFIED", comparisonRole "CONTEXT_ONLY",
     decisionEvidenceSide "SUBJECT_ONLY", magnitudeAttribution "NONE",
     findingEffect{suppression "NONE", confidence "NONE"} }`.
   - A statement: `statementKind "AUTHORITY_FINDING_LINKED_TO_DELTA"`, rowId,
     windowId, measure, component (5 dimensions), comparisonFightRef,
     perMinuteDelta (EXACT / NO_MORE_THAN / NO_LESS_THAN value, or UNKNOWN
     reason), limits, `direction "SUBJECT_HIGHER"` (literal), `findings` (≥1
     decision EvidenceLocator), environmentalContext[{itemId, reason}],
     `magnitudeAttribution "NONE"`.
   - An observation: the same pair fields, direction (4 values), cause (7).
   - New public vocabularies: `PUBLIC_DIAGNOSIS_NOT_ASSESSED_REASONS`,
     `_MEASURES`, `_DIMENSIONS`, `_TARGET_CLASSES`, `_DELTA_BOUND_KINDS`,
     `_DELTA_UNKNOWN_REASONS`, `_DIRECTIONS`, `_LIMITS`,
     `_OBSERVATION_CAUSES`, `_ENVIRONMENTAL_REASONS`; declared independently
     and pinned by test to `src/diagnosis/vocabulary.ts` (itself pinned at
     compile time to the post-hoc unions).
2. **What a consumer sees today:** the deployed service supplies no
   comparison evidence, so every ANALYZED document gains exactly
   `"diagnosis": {"assessment":"NOT_ASSESSED","reason":"COMPARISON_EVIDENCE_NOT_RETRIEVED"}`.
   Nothing else in any document changes. REST and MCP share the projection.
3. **MCP tool description:** one new paragraph saying what diagnosis is and
   is not (NOT_ASSESSED means nothing is claimed; a statement does not say
   how much; an observation is not a cause; comparison is context). The MCP
   `outputSchema` is the public schema, so it advertises the field.
4. Raid-night contract: unchanged (no diagnosis there; follow-up).

## What it adds

**`src/diagnosis/`** (new): `decision-evidence.ts` (the reviewed adapter:
view decision → M14-E record; MATCH/REJECTED → RESOLVED, UNKNOWN → UNKNOWN,
any other outcome word refuses; ABILITY/FOCUS scope on exactly the observed
id), `diagnosis.ts` (port types, subject binding, `diagnose`), and
`vocabulary.ts`.

**A statement needs all of:** the pair LINKED by M14-E; a REJECTED decision
among the resolved evidence (MATCH-only → `NO_AUTHORITY_FINDING_IN_LINK`: a
link is not a fault); and `SUBJECT_HIGHER` (a rejected observed X can bear
only on X being higher → otherwise `FINDINGS_DO_NOT_MATCH_DIRECTION`). The
M14-E causes carry over unchanged. No magnitude; every limit carried; M14-C
named reasons attached as context only, never suppression.

**Service** (`analysis-service.ts`): optional `comparisonEvidence` port,
called after `runAnalyzer` with the analyzed identity only; the outcome is
spread into the `FightAnalysis` and passed nowhere else. The supplied subject
must match report code, revision, fight id and bounds, player and spec (the
post-hoc `fightRef` is a label, not identity). A throwing port is
`COMPARISON_RETRIEVAL_FAILED`. Production composition wires none.

**Layering:** M11-G2 guard admits `src/diagnosis/` as the post-hoc domain's
only outside reader; new M14-F guard: diagnosis imports only the five
post-hoc modules it combines, the locator type and the observed-decision
view; only the service, `result.ts` and the public projection import it; no
simc/specs/findings/analysis/engine/role module does; it is called after the
analyzer; nothing outside the service names `comparisonEvidence`. M6-A
projection-reach list gains `../diagnosis/diagnosis.js`; diagnosis joins the
roots that may not import contracts.

## Real evidence (pinned)

The subject's real Blood analysis through `analyzeFight` with a test port
over the archive: ASSESSED, WHOLE_FIGHT, three comparisons, **0 statements**.
The 12 whole-fight M14-E links → `NO_AUTHORITY_FINDING_IN_LINK`; Heart Strike
(45 REJECTED) → `DIRECTION_UNDECIDED` ×3; decision evidence 307 / 83 resolved
/ 224 UNKNOWN / 0 outside. Decisions and coverage identical with and without
diagnosis. Without a port: NOT_ASSESSED.

## Tests

- New `tests/unit/m14f-diagnosis-projection.test.ts` (23): real pins through
  the service, port request contents, binding refusals (player, spec, fight
  id, revision, report code, bounds), throwing/null port, synthetic statement
  (findings = REJECTED only), lower-direction, MATCH-only, UNKNOWN-only,
  other-ability, undecided bound, encounter mismatch, unreviewed outcome,
  out-of-fight decision, determinism.
- New `tests/contracts/m14f-diagnosis-contract.test.ts`,
  `tests/contracts/m14f-diagnosis-layering.test.ts`.
- Updated: equivalence helpers in the Blood/Retribution/Brewmaster public
  projection tests and the M7-B core reproduction build the envelope as the
  service now does (diagnosis NOT_ASSESSED on ANALYZED); M6-A and M11-G2
  layering lists.
- `tsc --noEmit`, prettier, focused tests, full suite. Full suite: every
  failure but one was a 5 s timeout under load and passed when the failed
  files were re-run serially. The remaining one,
  `m8g-encounter-context-composition` "byte-identical across success,
  empty, rejection and total failure", times out at 5 s alone, and does the
  same on main's tree with this change stashed: machine load, not this
  tranche.

## Docs

`agent/architecture.md` "M14-F"; `agent/follow-ups.md` "After M14-F" (no live
comparison retrieval: owner decision; no statement on real evidence; one
direction rule; whole fight only; named reasons never suppress; raid night
has no diagnosis); `agent/testing.md` row block; queue bookkeeping.
