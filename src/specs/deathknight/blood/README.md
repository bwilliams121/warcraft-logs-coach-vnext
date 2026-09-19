# Blood Death Knight — INTERNAL_ONLY measurement slice (M11-B2)

**Exposure: `INTERNAL_ONLY`.** This evaluator is registered in the
production catalog (`deathknight-blood-observed-decisions`,
`deathknight/blood`) and is NEVER selected by the application service,
raid-night orchestration, REST or MCP: `deathknight/blood` is in
`INTERNAL_ONLY_SPEC_IDS` and absent from `PUBLIC_SPEC_IDS`, the public
contract's `specId` enum and `SUPPORTED_SPEC_IDENTITIES`; the registration's
`exposure` is `INTERNAL_ONLY` and `spec.ts` says `satisfies
InternalOnlySpecId`. A public request for the real subject answers
`SPEC_NOT_SUPPORTED` with zero analyzer calls. The internal lookup, the
corpus and tests reach it.

**This is a MEASUREMENT, not a coach.** M11-B1 taught the shared traversal
the pinned `run_action_list` control flow; this slice runs it over the first
real hero-tree-gated dispatch authority on real evidence and records where
the shared machinery stops, and on which atom. Nothing was widened to force
a resolved decision, and none resolved: over the composed 165 s A7R6 fight,
0 of 123 eligible decisions MATCH or REJECTED, every one UNKNOWN with a
named stopping entry. That number is the deliverable, and the promotion
evidence gate reports it and would refuse promotion on it.

The registration is built by the specialization module factory
(`BLOOD_DEATH_KNIGHT_MODULE` in `registration.ts`, through
`defineSpecModule`), pinned to the roster row (`simcSpecId` 250, role
`TANK`), with `supplementalAnalyses: []`.

## The slice: five observed rotational tokens

For one Blood Death Knight's observed **Death Strike**, **Heart Strike**
(including its Vampiric Strike execution 433895), **Blood Boil**,
**Marrowrend** and **Death's Caress** casts, under the pinned
`SIMC_APL_DEATHKNIGHT_BLOOD` artifact (`simc-33622e9d-1`, the
`//blood_apl_start .. _end` region of `apl_death_knight.cpp`, its twelve
client-version guards evaluated for 12.1.0):

    MATCH      the shared first-GCD query resolves the same action token
               — AUTHORITY_COMPATIBLE_ONLY after the non-domain exclusion
    REJECTED   the query resolves a different token, or the nested proof
               shows no entry naming the observed token could be selected
    UNKNOWN    neither — with the ROOT scan's stopping entry, the atoms that
               made it undecidable, every dispatch step's outcome, and every
               competing undecided GCD candidate recorded on the payload

Everything else the actor cast is EXCLUDED by name and counted: melee
swings, NON_GCD presses (Raise Dead, Vampiric Blood, Infliction of Sorrow's
proc executions, the defensives, the potion), GCD casts with no authority
token (Anti-Magic Zone), and in-domain GCD casts outside the slice — Death
and Decay (the `any_dnd` alias question is itself a measured stopping point
for the token-string comparison), Dancing Rune Weapon (its gate reads
PREDICTIVE state) and Consumption.

## What the module binds, and only from evidence

| Atom | Source | Bound when |
| --- | --- | --- |
| `hero_tree.sanlayn`, `hero_tree.deathbringer` | the observed talent tree by entry membership | the tree RESOLVES to one sub-tree (TRUE / FALSE together); never from a cast |
| `runic_power.deficit` | the decision cast's own PRE_COST Runic Power entry, tenths → points once | Death Strike decisions only |
| `rune` | the decision cast's own PRE_COST Runes entry | Rune-costed decisions only |
| `time` | the decision's fight time | always |
| `buff.<x>.up` (8 atoms) | M4 `presenceAt` FROM_SOURCE self, strictly before the decision | an observed transition; or DOWN by hero-tree exclusion / a disproved producing talent |
| `buff.bone_shield.stack` | the last stack-bearing transition's absolute count | only across same-millisecond refresh companions under EXACT ACTIVE presence |
| `buff.essence_of_the_blood_queen.stack`, `buff.blood_debt.stack` | the two build proofs and PROVEN_INACTIVE | exactly zero only |
| `cooldown.dancing_rune_weapon.remains` | the shared token-cooldown derivation over the pinned record | an observed cast within 90,000 ms (Insatiable Blade SELECTED) |

Never bound: `buff.<x>.remains` (no binding field exists),
`debuff.reapers_mark_debuff.up` (no debuff field exists), `fight_remains`
(PREDICTIVE), any affordability (the wire's `cost` field is the DBC base,
not the amount paid — 450 reported, 350 paid), any Rune regeneration (not on
the wire), Vampiric Blood's cooldown (dynamic under Red Thirst), Raise Dead's
readiness (pet state).

## Two measured hazards worth knowing before touching any binding

1. **A cast's own aura effects precede the cast in the log** (a
   Marrowrend's Bone Shield gains, a Vampiric Strike's Essence stack) — at
   the same millisecond mostly, 1 ms ahead for the Dancing Rune Weapon's
   stacks and five Vampiric Strikes, 20 ms ahead for the pull Death's
   Caress's application. `BEFORE_EVENT` at the cast position would read the
   POST-cast state. Since M11-B4 the aura, stack and remains bindings all
   refuse (`PRE_DECISION_WINDOW_TRANSITION`, lead recorded) whenever the
   queried identity has a transition ahead of the decision within
   `BLOOD_PRE_DECISION_WINDOW_MS` = 50 ms inclusive; M11-B2's
   `SAME_MILLISECOND_TRANSITION` was the 0 ms case. No causal attribution is
   attempted, even where the corpus suggests it.
2. **The wire's `cost` is not the cost.** The gtKb subject cast Death Strike
   with 440 and 390 Runic Power attached against a reported cost of 450, and
   the deduction the build pays is 350 (250 under Blood Draw). No usability
   proof reads the field in either direction, and since M11-B5 no state is
   computed from it either: after a costed cast the Runic Power is UNKNOWN
   until the next observation reads it.
3. **A cast's own proc gain precedes the cast in the log by 0-1 ms**
   (Heartbreaker ahead of Heart Strike / Vampiric Strike, 78 of 78; Relish
   in Blood ahead of Death and Decay, 9 of 9), while its principal gain
   follows it. `runic-power-state.ts` refuses to attribute an observation
   inside `BLOOD_RESOURCE_PRE_DECISION_WINDOW_MS` = 1 ms and binds only the
   deficit's lower bound both readings share.

## The measurement

Over the composed 165 s A7R6 bundle (actor 14, San'layn) and the gtKb
opener, after M11-B4: **21 of 123 and 1 of 21 resolved**, every one a Death
Strike the pinned list selects at its exact entry (`san_gift[1]`
`runic_power.deficit<36` inside the Gift window, `sanlayn[2]`
`runic_power.deficit<20` outside it) once the entries ahead of it resolve
FALSE from proven remainders, a proven Bone Shield count and presence; 0
REJECTED. M11-B2 measured root scans stopping on the decimal literal `1.5`
(122 of 123); M11-B3 admitted decimals and measured the first undecided
candidate on `buff.bone_shield.remains` at 96 and
`buff.essence_of_the_blood_queen.remains` at 24 (opener 6 / 15); M11-B4
derived the remainders (`aura-remains.ts`) from observed gains and the
pinned Blood durations (`src/data/game/deathknight-blood-aura-durations.json`:
Bone Shield 30 s, Essence 25 s — 20 s plus the specialization passive's
5 s — Crimson Scourge 15 s, Visceral Strength 12 s, Vampiric Strike
PERMANENT) under continuity from the gain, binding a lower bound only past
a Bone Shield `refreshbuff` beside a charge removal (a refresh the pinned
decrement does not produce), and refusing every transition inside the 50 ms
pre-decision window. The remains census: Bone Shield EXACT 11 / BOUNDED 104
/ window-refused 8; Essence EXACT 96 / window-refused 26 / unknown 1;
Vampiric Strike PERMANENT 15 / zero 88 / unknown 20; Crimson Scourge EXACT
8 / zero 108 / unknown 6 / window 1; Visceral Strength EXACT 96 / zero 20 /
unknown 7; no gap, contradiction or threshold-tolerance refusal (opener:
Bone Shield EXACT 20 / window 1, Essence EXACT 13 / window 7 / unknown 1).
The stopping entries and the B1 dispatch semantics are unchanged from B3
(root scan resolved 79 — 21 selections, 58 divergent — `sanlayn[10]
consumption` 43, the `default[15]` gate 1; deathbringer skipped ×123,
san_gift entered 24 / skipped 98 / blocked 1, sanlayn entered 55 / blocked
43; opener 15 / 6). The first undecided GCD candidate is now `sanlayn[2]
death_strike` on `runic_power.deficit` at 43 (no Runic Power observation on
a cast that does not cost it), `sanlayn[7] marrowrend` on
`buff.blood_debt.stack` at 15, `san_gift[0]` on Essence at 14 and
`sanlayn[1]` on Essence plus `fight_remains` at 11 (Vampiric Strikes whose
own Essence transition sits inside the window), `sanlayn[0]` on Bone Shield
at 7 (window-refused Marrowrends), the Dancing Rune Weapon gate at 3
(opener: `san_gift[0]` 8, `sanlayn[2]` 4, `san_gift[1]` 3, `san_gift[2]`
3).

M11-B5 carried Runic Power to the decisions that carry no PRE_COST amount
of it (`runic-power-state.ts`): the latest observed state — a
`resourcechange`'s POST_CHANGE attachment or an uncosted snapshot — under
RESOURCES and CASTS continuity from it, exact (`CARRIED_EXACT`); UNKNOWN
after a costed cast until the next observation (`POST_SPEND_NOT_OBSERVED`);
and a lower bound on the deficit when non-negative changes sit 0-1 ms ahead
of the decision (`WINDOW_BOUNDED`). Result: **25 of 123 resolved** (21
Death Strikes and 4 Blood Boils at `sanlayn[6]`, all MATCH, 0 REJECTED),
opener unchanged at 1 of 21. Runic Power evidence: OWN_PRE_COST 44,
CARRIED_EXACT 14, WINDOW_BOUNDED 59, POST_SPEND_NOT_OBSERVED 5, NO_ANCHOR 1
(opener 6 / 5 / 10 / 0 / 0). Of the 43 + 3 decisions B4 left on
`runic_power.deficit`, 40 + 3 advance. The first undecided GCD candidate is
now `sanlayn[7] marrowrend` on `buff.blood_debt.stack` at 45, the Essence
window refusals at 14 + 11, Bone Shield window refusals at 7, `any_dnd`
usability 4, the Dancing Rune Weapon gate 3, Essence stack 3, Runic Power
after a spend 3, Death Strike usability 3 + 1 (the gate resolves TRUE at a
cast that is not Death Strike and no affordability proof exists), Blood
Boil usability 2, Boiling Point 1, `fight_remains` 1. The full census is in
the corpus (`SPEC_BLOOD_DEATH_KNIGHT.*`) and `agent/architecture.md`.

## What this module refuses on purpose

- No Runic Power value that was not read off the wire: no `pre - cost`, no
  pinned deduction, no summed `resourceChange`, no regeneration or decay,
  no cap arithmetic, no pre-pull state, no upper bound on the deficit, no
  attribution of an observation inside the 1 ms resource window, no carry
  across a RESOURCES or CASTS gap, no re-anchoring around a snapshot that
  disagrees (the M11-B5 boundary).
- No remains model beyond `FIXED_DURATION_RESET_ON_GAIN` and `PERMANENT`
  (no pandemic, extend or tick refresh; no build-dependent duration
  modifier; no pre-pull remaining time; no upper bound), no choice between
  the two readings of a Bone Shield refresh beside a charge removal, no
  causal attribution of a transition inside the pre-decision window, no
  exact verdict within `BLOOD_REMAINS_THRESHOLD_TOLERANCE_MS` = 50 ms of a
  pinned threshold (the M11-B4 boundary).
- No GCD numeric bounds, no `empower_to` support, no new action option, no
  target-count or enemy-roster model, no `target_if`, no undecided-run world
  splitting, no generic variables, no pet state, no charge model, no
  generalized stack reconstruction, no new parser builtin, no new public
  reason enum, no public exposure (the M11-B2 hard boundary).
- No affordability proof, no Rune regeneration, no Vampiric Blood cooldown.
- No reachability refinement in the unselectability proof (it still walks
  `precombat` and the Deathbringer list): recorded as a measured limit.
- No verdict on Death Strike as mitigation or healing: those domains are
  DECLARED and bound to nothing (`NO_PINNED_AUTHORITY_FOR_DOMAIN`), and the
  offensive result carries `deathStrikeDualRole: true` so no reader mistakes
  a spender comparison for a survival judgment.

Files: `spec.ts` (identity), `pinned-authority.ts`, `authority-bindings.ts`
(six capabilities, one binding), `vocabulary.ts`, `resolver.ts`,
`resources.ts`, `runic-power-state.ts` (the Runic Power carry),
`aura-bindings.ts`, `aura-remains.ts` (the remains derivation), `remains-thresholds.ts` (the pinned list's thresholds, read
from the parsed authority), `cooldown-bindings.ts`,
`domain-boundary.ts`, `domains.ts`, `action-profile.ts`,
`first-gcd-state.ts`, `first-gcd-adapter.ts` (stopping points, dispatch
trace, undecided candidates), `observed-action-gate.ts`,
`observed-analysis.ts` (the facade), `registration.ts`. Data:
`src/data/game/deathknight-blood-*`, `src/simc/data/deathknight-blood.apl.json`.
Tests: `tests/unit/m11b2-blood-*.test.ts`, `tests/unit/m11b4-*.test.ts`,
`tests/unit/m11b5-*.test.ts`,
`tests/contracts/m11b2-blood-*.test.ts`, corpus cases
`spec-blood-death-knight.*`.
