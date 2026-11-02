# Review request

Rolling file: overwritten for each review cycle.

## Tranche

M14-A: Comparison timing alignment foundation. Autopilot queue entry M14-A.
Branch `autopilot/m14-a`, from main at 3330dc6.

- **Direction** (queue entry; architecture "Milestone 14", CLAUDE.md
  "Comparable Logs", M11-G2 `src/comparison-facts/`): a post-hoc, factual
  alignment of a subject fight and its comparison fights onto shared
  encounter landmarks (pull, observed phases, intermissions, target
  transitions, cooldown windows), answering "at the same encounter moment,
  what did each fight show?". A landmark absent from a fight is UNKNOWN,
  never interpolated. Comparison coverage stays AT_LEAST. Post-hoc only.
  Retained evidence only.
- **Public contract: NONE.** Nothing under `src/contracts/`, `src/api/` or
  `src/mcp/` changes.
- **Warcraft Logs requests: none.** Committed archive fights and synthetic
  fights.
- Queue bookkeeping: M13-C (#24, 3330dc6) recorded MERGED; M14-A PR_OPEN.
  M12-C through M13-B were already recorded.

## What it adds

**`src/comparison-facts/timing-alignment.ts`**, inside the M11-G2 post-hoc
domain and under its existing layering guard (the guard's module list now
names it). It imports engine, the domain's own primitives and nothing else.
Nothing outside the domain imports it, and no judgement word appears.

`alignFights({ subject, comparisons }, postHocDefinition)`:

- Refuses another encounter, another difficulty, an unestablished difficulty,
  or duplicate fight refs.
- Landmarks: `PULL`; `RECORDED_FIGHT_END` (EXACT only when finality is
  COMPLETED); `PHASE_START:<id>` and `INTERMISSION_START#k`, from the typed
  phase list behind the same ENCOUNTER_PHASES absence gate M4's `phaseAt`
  uses (unordered is UNKNOWN, never sorted; an unstated intermission flag
  blocks that ordinal and later ones, but not phase starts);
  `FIRST_FOCUS_DAMAGE_EVENT_ON_NPC:<gameId>` (game id, because actor ids are
  report-local; player targets excluded); and
  `COOLDOWN_WINDOW_START:<windowKind>#k`, from the caller's post-hoc
  definition, with no specialization branch (an unobserved window start
  blocks that ordinal and later ones).
- Anchors:
  - `EXACT`: from an EXHAUSTIVE collection, or metadata.
  - `NO_LATER_THAN`: from an OBSERVED_ONLY collection. The k-th smallest of
    a superset is never later than the k-th observed.
  - `UNKNOWN`: with a reason. Never interpolated, never shifted from another
    fight, never filled from a nominal duration.
- It carries `comparisonCoverage: AT_LEAST_UNCERTIFIED`,
  `interpolation: NONE`, and each fight's `phaseEvidence`, so a missing phase
  row cannot read as "no phases".

`factsAtAlignedMoment(input, postHocDefinition, landmarkId, {fromMs, toMs})`:

- Gives each fight's G2 cast and damage summaries over
  `[anchor + from, anchor + to)`, so counts keep EXACT / AT_LEAST / UNKNOWN.
- Only EXACT anchors place a window. A bound gives `ANCHOR_NOT_EXACT`.
- A window outside the recorded fight is UNKNOWN, never clipped.
- Invalid offsets and an unknown landmark are refused.
- **Review cycle 1 fix.** It recomputes the alignment from exactly the
  inputs it slices, and never accepts one from the caller. A stale alignment
  can therefore never be applied to a changed focus or changed evidence
  under the same fight ref. Negative tests cover a changed focus (real
  subject and synthetic) and moved evidence (synthetic).

## Real evidence (pinned in the test)

- Encounter 2900, Mythic, four kills.
- No fight holds phase evidence (CAPABILITY_UNVERIFIED, empty list), so there
  is no phase row.
- Three NPC target transitions, EXACT for the subject and NO_LATER_THAN for
  the comparisons (259181: 649 vs ≤1851 / ≤1140 / ≤17 ms).
- 19 Dancing Rune Weapon window ordinals; ordinals the subject did not observe
  are UNKNOWN.
- 30 s after pull: subject EXACT 78 cast / 172 damage events, comparisons
  AT_LEAST.

## Tests

- New `tests/unit/m14a-timing-alignment.test.ts`:
  - real four-fight pins, determinism and moment facts;
  - synthetic negatives: an absent landmark is UNKNOWN, an uncertified
    basis gives NO_LATER_THAN, unverified phases are UNKNOWN, an unordered
    list is not sorted, an unstated intermission flag, an unobserved window
    start, an unfinished fight end, and every refusal.
- `tests/contracts/m11g2-comparison-facts-layering.test.ts` module list
  updated.
- Focused: M14-A, G2 four-fight facts, G2 layering, plus the full node
  project; see the PR for the CI result.

## Docs

`agent/architecture.md` "M14-A"; `agent/follow-ups.md` "After M14-A" (no
real phase or targetability landmark, comparison anchors are bounds, a
cooldown ordinal is an aura window, a first hit is a relationship, no
delta or consensus); `agent/testing.md` row block.
