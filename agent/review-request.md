# Review request

Rolling file: overwritten for each review cycle.

## Tranche

M14-D: Factual damage-delta decomposition. Autopilot queue entry M14-D.
Branch `autopilot/m14-d`, from main at 0f1c982.

- **Direction** (queue entry; CLAUDE.md "Damage Output Diagnosis",
  "Comparable Logs", "Comparison Cannot Move Confidence"; architecture
  "Milestone 14", the M11-G2 damage ledgers, the M11-G4-4 DPS comparability
  rules): decompose subject-versus-comparison damage differences factually,
  by ability, target class, window and pet sub-actor tree, as observations.
  No causal claim. Where raw `amount` semantics (M1) or AT_LEAST coverage
  limit a figure, it is a bound or UNKNOWN, never a point estimate.
- **Public contract: NONE.** Nothing under `src/contracts/`, `src/api/` or
  `src/mcp/` changes.
- **Warcraft Logs requests: none.** The committed archive fights and
  synthetic fights.
- Queue bookkeeping: M14-C (#27, 0f1c982) recorded MERGED; M14-D PR_OPEN.
  M12-C through M14-B were already recorded.

## What it adds

**`src/comparison-facts/damage-delta.ts`**, inside the M11-G2 post-hoc domain
and under its layering guard (module list updated). It imports only E1
combat facts, the engine CombatFight type and the domain's own modules.
Nothing outside the domain imports it; no forbidden word appears.

`decomposeDamageDeltas(input, definition, alignedWindows = [])` recomputes the
M14-A alignment from its inputs (the `factsAtAlignedMoment` anti-stale rule).

**Three measures, never mixed** (one measure, one component, one window on
both sides):

- `DAMAGE_EVENT_COUNT` (`OBSERVED_DAMAGE_EVENTS`): focus + owned actors'
  damage events under the fight's tree coverage; EXACT / AT_LEAST / UNKNOWN.
- `RAW_AMOUNT_FIELD_SUM`: each side's raw sum is shown as G2 holds it; the
  delta is ALWAYS UNKNOWN `RAW_AMOUNT_MEANING_NOT_PROVEN`, even when both are
  EXACT (M1).
- `WCL_TABLE_AMOUNT`: whole fight only. Raid entry (total, pets by kind,
  target types verbatim) and the focus's per-actor DamageDone leaves (per
  ability). Delta only table-against-table under the same log version
  (`LOG_VERSION_DIFFERS` otherwise, per M11-G4-4's evidenced-log-version
  rule). Not listed -> `NOT_LISTED_IN_TABLE`, never 0. No focus-only amount
  by subtraction (`TABLE_STATES_NO_FOCUS_ONLY_AMOUNT`).

**Components:** TOTAL; BY_SOURCE (`FOCUS` or definition kind by catalog game
id); BY_ABILITY (source kind + ability game id); BY_TARGET_CLASS
(BOSS_SUBTYPE / NON_BOSS_NPC / PLAYER_TARGET / OTHER_TARGET: enemy-listed and
other NPC merged, because the subject's enemy list is not held, so a class
means the same in every fight); BY_WCL_TARGET_TYPE.

**Deltas, per pair, never combined:** EXACT−EXACT = EXACT; EXACT−AT_LEAST =
NO_MORE_THAN; AT_LEAST−EXACT = NO_LESS_THAN; otherwise UNKNOWN with reason.
Absolute and per-minute. Direction (`SUBJECT_LOWER` / `SUBJECT_HIGHER` /
`EQUAL`) only when the delta or bound proves it, compared in BigInt
cross-multiplication; else `UNDECIDED`. A NO_MORE_THAN bound can only prove
SUBJECT_LOWER.

**Windows:** `WHOLE_FIGHT` plus caller `ALIGNED_MOMENT`s via
`factsAtAlignedMoment` (EXACT anchors only; outside the fight UNKNOWN, never
clipped; no table rows). Per fight per window, the component list claim
(EXHAUSTIVE / OBSERVED_ONLY). No residual.

**Observation only:** `use: OBSERVATION_ONLY`, `causalClaim: NONE`,
`acrossComparisons: NOT_COMBINED`, `residual: NOT_COMPUTED`,
`findingEffect: { suppression: NONE, confidence: NONE }`,
`comparisonCoverage: AT_LEAST_UNCERTIFIED`. `observationSentence` words only
a proven direction ("Rupture damage events per minute were lower in S than in
C1."), `null` when UNDECIDED; it names no cause or action.

## Real evidence (pinned in the test)

- Raid-entry totals 45,802,009 (the M11-G4-4 reconciled figure) vs
  59,295,730 / 58,873,321 / 62,896,995: EXACT, all SUBJECT_LOWER. Risen Ghoul
  table amount SUBJECT_HIGHER vs all three.
- Per-ability table deltas all UNKNOWN (subject has no per-actor table).
- Event totals 3,761 vs ≥4,268 / ≥4,700 / ≥4,240 -> NO_MORE_THAN. Boss-subtype
  vs COHORT261: NO_MORE_THAN −98 events but a positive per-minute bound ->
  UNDECIDED.
- Every raw delta UNKNOWN. DRW#1 window: every comparison ANCHOR_NOT_EXACT.

## Tests

- New `tests/unit/m14d-damage-delta.test.ts` (28): real pins and
  determinism; synthetic EXACT deltas and wording; raw delta UNKNOWN even
  both EXACT; absent component EXACT 0 under COMPLETE vs UNKNOWN uncertified;
  integer EQUAL over different durations; target-class merge across enemy
  list states; pet kinds by game id across actor ids; NOT_LISTED_IN_TABLE,
  NO_RAID_ENTRY, LOG_VERSION_DIFFERS; window outside the fight; refusals;
  no causal vocabulary in any sentence.
- `tests/contracts/m11g2-comparison-facts-layering.test.ts` module list
  updated.
- Focused: M14-D, G2 layering; `tsc --noEmit`; prettier; plus the full
  suite.

## Docs

`agent/architecture.md` "M14-D"; `agent/follow-ups.md` "After M14-D" (no
amount delta below the whole fight, raw never subtracts, counts are bounds,
an event is not damage, same log version only, no cause); `agent/testing.md`
row block; queue bookkeeping.
