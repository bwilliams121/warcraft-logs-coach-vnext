# Review request

Rolling file: overwritten for each review cycle.

## Tranche

M14-C: Strategy-context representation. Autopilot queue entry M14-C. Branch
`autopilot/m14-c`, from main at f3c8b26.

- **Direction** (queue entry; CLAUDE.md "Comparable Logs", "Top Logs Cannot
  Override Rotational Authority", "Top Logs Cannot Suppress Findings Merely
  by Similarity", "Comparison Cannot Move Confidence"; architecture "M14-B"
  hands the named-reason mapping to M14-C): a structured representation of
  encounter strategy context derived from consensus (common downtime, target
  transitions, common cooldown timing, phase behavior), each item mapped to
  a named environmental reason only where the evidence supports one. Context
  is attached to findings and never becomes rotational authority.
- **Public contract: NONE.** Nothing under `src/contracts/`, `src/api/` or
  `src/mcp/` changes.
- **Warcraft Logs requests: none.** The committed archive fights and
  synthetic phased fights.
- Queue bookkeeping: M14-B (#26, f3c8b26) recorded MERGED; M14-C PR_OPEN.
  M12-C through M14-A were already recorded.

## What it adds

**`src/comparison-facts/strategy-context.ts`**, inside the M11-G2 post-hoc
domain and under its existing layering guard (module list updated). It
imports only engine coverage/encounter-state helpers and the domain's own
alignment and consensus. Nothing outside the domain imports it; no judgement
word appears.

`strategyContext(input, definition, thresholds = V1)` recomputes the M14-A
alignment and M14-B consensus from its inputs (the anti-stale rule of
`factsAtAlignedMoment`). One item per consensus row, whatever the outcome:
`PHASE_START` -> `PHASE_BEHAVIOR`, `INTERMISSION_START` -> `COMMON_DOWNTIME`,
`FIRST_FOCUS_DAMAGE_EVENT_ON_NPC` -> `TARGET_TRANSITION`,
`COOLDOWN_WINDOW_START` -> `COOLDOWN_TIMING`. `PULL` and `RECORDED_FIGHT_END`
are not strategy items.

**Named reason** requires all three:

1. ENCOUNTER_STATE nature (focus behavior never names a reason);
2. CONSENSUS among comparison fights;
3. the subject's OWN anchor EXACT, within the agreeing range ± tolerance.

Then `INTERMISSION` over the subject's own k-th intermission interval, or
`PHASE_TRANSITION` at the subject's own transition instant (no invented
duration). Otherwise `NONE` with a cause (`FOCUS_BEHAVIOR_NAMES_NO_REASON`,
`NO_COMPARISON_CONSENSUS`, `SUBJECT_ANCHOR_NOT_EXACT`,
`SUBJECT_OUTSIDE_CONSENSUS_RANGE`). Comparisons only corroborate the
subject's own Warcraft Logs evidence; they never supply a missing subject
fact. `TARGET_UNAVAILABLE` and `FORCED_DOWNTIME` have no evidence source
(targetability unverified) and are never named.

**Context only:** `use: CONTEXT_ONLY`, `rotationalAuthority: NONE`,
`findingEffect: { suppression: NONE, confidence: NONE }`,
`comparisonCoverage: AT_LEAST_UNCERTIFIED`, plus each fight's `phaseEvidence`
so a missing downtime item never reads as "no downtime". Items carry no
direction. `attachStrategyContext(context, moments)` reads only
`{ findingId, reportTimeMs }` and returns the named reasons whose subject
window contains the moment; it changes nothing about the finding. Using a
named reason to suppress is left to the reviewed projection (M14-F). No
cooldown "hold" is claimed: that needs availability, which no landmark
carries.

## Real evidence (pinned in the test)

- 22 items: 3 target transitions, 19 Dancing Rune Weapon ordinals; all
  INSUFFICIENT and `FOCUS_BEHAVIOR_NAMES_NO_REASON`.
- No phase or downtime item; all four fights' phase evidence UNKNOWN
  (`CAPABILITY_UNVERIFIED`). Attachment adds no reason anywhere.

## Tests

- New `tests/unit/m14c-strategy-context.test.ts`: real pins and determinism;
  synthetic INTERMISSION over the subject's interval and PHASE_TRANSITION at
  the instant, with corroborating refs; attachment (exclusive interval end,
  no finding effect); subject phase evidence not held and unstated subject
  intermission flag -> no reason despite comparison CONSENSUS; subject
  outside the range -> no reason, no direction field; INSUFFICIENT and SPLIT
  -> no reason; a cooldown-window CONSENSUS names nothing; the two
  unsupported reasons never appear; refusals.
- `tests/contracts/m11g2-comparison-facts-layering.test.ts` module list
  updated.
- Focused: M14-C, G2 layering; `tsc --noEmit`; prettier; plus the full
  suite.

## Docs

`agent/architecture.md` "M14-C"; `agent/follow-ups.md` "After M14-C" (no
named reason on real evidence, two reasons without an evidence source, no
cooldown hold, a transition is an instant, nothing consumes it yet);
`agent/testing.md` row block; queue bookkeeping.
