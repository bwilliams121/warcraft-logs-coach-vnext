# Review request

Rolling file: overwritten for each review cycle.

## Tranche

M14-E: Causal evidence linkage (internal). Autopilot queue entry M14-E.
Branch `autopilot/m14-e`, from main at 777b12a.

- **Direction** (queue entry; CLAUDE.md "Damage Output Diagnosis",
  "Comparison Cannot Move Confidence", "UNKNOWN vs NO_AUTHORITY_AVAILABLE";
  architecture "Milestone 14", "M14-D"): link damage-delta components to
  decision-level evidence that could support a causal statement (APL decision
  outcomes, cast opportunities and uptime, resource state and buff windows,
  target choice and cooldown alignment, encounter actionability). A link
  records its evidence and its limits. A delta with no decision-level link
  stays an observation. The authority verifier and this causal analysis stay
  separate modules; neither feeds the other's verdicts until M14-F. Comparison
  behavior never moves confidence.
- **Public contract: NONE.** Nothing under `src/contracts/`, `src/api/` or
  `src/mcp/` changes.
- **Warcraft Logs requests: none.** Committed archive fights, the subject's
  real Blood decision results computed offline, synthetic fights.
- Queue bookkeeping: M14-D (#28, 777b12a) recorded MERGED; M14-E PR_OPEN.
  M12-C through M14-C were already recorded.

## What it adds

**`src/comparison-facts/causal-linkage.ts`**, inside the M11-G2 post-hoc
domain and under its layering guard (module list updated). It imports only
the domain's own modules and the engine `EvidenceLocator` type. It never
imports the authority branch (specs, simc, findings), and nothing outside the
domain imports it. No forbidden word appears.

`linkCausalEvidence(input, definition, alignedWindows, records)` recomputes
the M14-D decomposition from its inputs (the anti-stale rule of M14-A/C/D).

**Decision evidence is caller-restated plain data** (`DecisionEvidenceRecord`,
like `attachStrategyContext`'s finding moment): kind (the eight queue
families), basis (`AUTHORITY_BACKED` / `OBSERVED_FACT`), the producer's
authority and status VERBATIM, resolution (`RESOLVED` / `UNKNOWN` /
`NO_AUTHORITY_AVAILABLE`, never merged), half-open report-time interval,
scope, locators. The linkage reads only resolution, scope and interval. It
never reads the producer's status and never re-evaluates a decision.

**A link** (per delta row × comparison pair) needs a proven direction
(SUBJECT_LOWER / SUBJECT_HIGHER), the subject's window placed, and at least
one RESOLVED in-scope record meeting that window. Otherwise
`OBSERVATION_ONLY` with a cause (`DIRECTION_UNDECIDED`, `DIRECTION_EQUAL`,
`SUBJECT_WINDOW_UNKNOWN`, `NO_DECISION_EVIDENCE_IN_SCOPE`,
`DECISION_EVIDENCE_UNRESOLVED`). Unresolved records are carried, distinct, and
never support a link.

**Scope:** TOTAL / BY_WCL_TARGET_TYPE take only WHOLE_OUTPUT records (one
ability never explains a total; no residual). BY_SOURCE ← SOURCE; BY_ABILITY ←
ABILITY (same source kind, exact game id) or SOURCE; BY_TARGET_CLASS ←
TARGET_CLASS. Ability-id relationships are the producer's statement, never
guessed.

**Limits on every pair:** `COMPARISON_COVERAGE_UNCERTIFIED`,
`COMPARISON_DECISIONS_NOT_EVALUATED`, and where they hold `DELTA_IS_A_BOUND`,
`EVENT_COUNT_NOT_DAMAGE_AMOUNT`, `SUBJECT_COMPONENTS_OBSERVED_ONLY`,
`UNRESOLVED_EVIDENCE_IN_SCOPE`, `NO_AUTHORITY_BACKED_EVIDENCE`.

**Refusals:** a record from a non-subject fight (comparison decisions are
never evaluated; comparison behavior is never decision evidence), a kind
outside the vocabulary, duplicate id, non-integer/reversed interval, interval
outside the subject fight, empty ability scope, an OBSERVED_FACT claiming
NO_AUTHORITY_AVAILABLE, a refused decomposition.

**Linkage only:** `decisionEvidenceSide: SUBJECT_ONLY`, `use: LINKAGE_ONLY`,
`causalClaim: NONE`, `magnitudeAttribution: NONE`, `verdictFlow: NONE`,
`findingEffect: { suppression: NONE, confidence: NONE }`; no confidence field
exists. Comparisons decide only whether a direction is proven. Records in no
component are listed, never dropped.

## Real evidence (pinned in the test)

The subject's real Blood observed decisions (307: 45 REJECTED, 38 MATCH, 224
UNKNOWN), restated as records in the TEST, not in `src/`:

- Exactly 13 LINKED pairs: whole-fight event-count rows for Death Strike,
  Blood Boil, Marrowrend, Vampiric Strike vs all three comparisons, and
  first-30 s Death Strike vs COHORT246; all bounds.
- Death Strike's link rests on 24 MATCHes: a link is not a fault.
- 45 Heart Strike REJECTED link nothing: that row's direction is UNDECIDED.
- Death's Caress: only UNKNOWN in scope -> `DECISION_EVIDENCE_UNRESOLVED`.
- No total, table or raw-amount row links.
- Subject evidence per component is identical with one comparison or three.

## Tests

- New `tests/unit/m14e-causal-linkage.test.ts` (24): real pins, comparison
  independence, determinism and input immutability; synthetic link
  requirements, EQUAL/UNDECIDED, UNKNOWN vs NO_AUTHORITY_AVAILABLE kept
  distinct, facts-only limit, scope per dimension, half-open windows, unmatched
  records listed, every refusal.
- `tests/contracts/m11g2-comparison-facts-layering.test.ts` module list
  updated.
- Focused: M14-E, G2 layering; `tsc --noEmit`; prettier; plus the full suite.

## Docs

`agent/architecture.md` "M14-E"; `agent/follow-ups.md` "After M14-E" (a link
is not a cause; no production adapter yet, M14-F; exact ability identity;
undecided deltas link nothing; no factual record producer yet);
`agent/testing.md` row block; queue bookkeeping.
