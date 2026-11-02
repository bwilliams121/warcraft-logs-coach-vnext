# Review request

Rolling file: overwritten for each review cycle.

## Tranche

M14-B: Multi-log consensus. Autopilot queue entry M14-B. Branch
`autopilot/m14-b`, from main at 20c6d66.

- **Direction** (queue entry; CLAUDE.md "Comparison Consensus", "Top Logs
  Cannot Suppress Findings Merely by Similarity", "Comparison Cannot Move
  Confidence"): explicit CONSENSUS / SPLIT / INSUFFICIENT outcomes over
  aligned comparison facts. A single parse is never consensus. SPLIT and
  INSUFFICIENT make no claim. Thresholds are configurable, named, documented
  and CANDIDATE. Consensus is context only.
- **Public contract: NONE.** Nothing under `src/contracts/`, `src/api/` or
  `src/mcp/` changes.
- **Warcraft Logs requests: none.** The M14-A alignment of the committed
  archive fights, and synthetic alignments.
- Queue bookkeeping: M14-A (#25, 20c6d66) recorded MERGED; M14-B PR_OPEN.
  M12-C through M13-C were already recorded.

## What it adds

**`src/comparison-facts/consensus.ts`**, inside the M11-G2 post-hoc domain
and under its existing layering guard (the guard's module list now names
it). It imports only a type module of the domain (`timing-alignment.ts`).
Nothing outside the domain imports it, and no judgement word appears.

`landmarkConsensus(alignment, thresholds = COMPARISON_CONSENSUS_THRESHOLDS_V1)`
reads only an M14-A alignment's anchors and slices no fight. One row per
landmark except `PULL` (offset 0 by definition).

- **Voters:** comparison fights only; the subject never votes. An EXACT
  anchor is a value (fight time). NO_LATER_THAN and UNKNOWN anchors abstain
  with their reason. An abstention counts in the share's denominator and
  never as agreeing.
- **Group:** the largest set of decisive values within the tolerance
  (inclusive), from a sorted sliding window.
- **CONSENSUS:** the largest group is unique, has at least the minimum
  sample, and is at least the agreement share of ALL comparison fights. It
  carries the agreeing fight refs and their own min/max, never a mean.
- **SPLIT:** `DISAGREEMENT_PROVEN` when even the largest group plus every
  abstention misses the minimum sample or the share; or
  `NO_UNIQUE_AGREEING_GROUP` when two different equal-size groups qualify.
  No value.
- **INSUFFICIENT:** `BELOW_MINIMUM_SAMPLE` (decisive votes below the
  minimum), or `ABSTENTIONS_COULD_DECIDE`. No value.
- **Thresholds:** `COMPARISON_CONSENSUS_THRESHOLDS_V1`, id
  `M14B_COMPARISON_CONSENSUS_V1`, status `CANDIDATE`: minimum sample 3,
  agreement 2/3 as an integer fraction, tolerance 5000 ms, with a `basis`
  sentence. `validateThresholds` refuses a minimum sample below 2 (one parse
  as consensus), a share that is not a strict majority, a malformed fraction,
  a non-integer or negative tolerance, and an empty id.
- **Context only:** every evaluation carries `use: CONTEXT_ONLY`,
  `findingEffect: { suppression: NONE, confidence: NONE }` and
  `comparisonCoverage: AT_LEAST_UNCERTIFIED`. Each row names its `nature`
  (`ENCOUNTER_STATE`, `FOCUS_BEHAVIOR`, `FIGHT_RECORD`). Mapping an
  encounter-state consensus to a named environmental reason, with the
  subject's own evidence, is left to M14-C.

## Real evidence (pinned in the test)

- `RECORDED_FIGHT_END` (329,430 / 336,303 / 359,887 ms): SPLIT,
  DISAGREEMENT_PROVEN, largest group 1. With a 31 s tolerance it is
  CONSENSUS over exactly [329,430, 359,887]; with 7 s, SPLIT (group of 2 is
  below the minimum sample of 3).
- All 22 FOCUS_BEHAVIOR rows (3 target transitions, 19 Dancing Rune Weapon
  ordinals): INSUFFICIENT, 0 decisive votes, every comparison anchor a bound.
- No ENCOUNTER_STATE row: no fight holds phase evidence.

## Tests

- New `tests/unit/m14b-consensus.test.ts`: real pins and determinism; one
  comparison is INSUFFICIENT; minimum sample < 2 and other malformed sets are
  REFUSED; CONSENSUS with an outlier; abstentions block but never
  manufacture consensus; SPLIT proven; equal overlapping groups are SPLIT;
  SPLIT/INSUFFICIENT carry no range; vote-order invariance; the subject's
  anchor never votes or fills a missing comparison vote; a refused
  alignment is refused; nature mapping.
- `tests/contracts/m11g2-comparison-facts-layering.test.ts` module list
  updated.
- Focused: M14-B, M14-A, G2 layering; `tsc --noEmit`; prettier; plus the full
  suite.

## Docs

`agent/architecture.md` "M14-B"; `agent/follow-ups.md` "After M14-B"
(CANDIDATE thresholds, no real consensus while comparison anchors are
bounds, one tolerance for all landmarks, voter independence not checked, a
bound never votes, no named environmental reason yet); `agent/testing.md`
row block.
