# Blood Death Knight — INTERNAL_ONLY measurement slice (M11-B2 … M11-B10)

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
| Marrowrend's usability (M11-B7) | the decision cast's own PRE_COST Runes entry against the pinned Rune cost, under a RESOLVED non-Deathbringer hero tree | `PROVEN_USABLE` only, at or above the cost; never a negative proof |
| `time` | the decision's fight time | always |
| `buff.<x>.up` (8 atoms) | M4 `presenceAt` FROM_SOURCE self, strictly before the decision; for Bone Shield inside the 50 ms window (M11-B10), M4's reading on BOTH sides of a cluster of its own stack gains | an observed transition; or DOWN by hero-tree exclusion / a disproved producing talent; or ACTIVE before the cluster and at the decision alike (`WINDOW_ORDER_INVARIANT_PRESENCE`) — never from a count, never from silence |
| `buff.bone_shield.stack` | the last stack-bearing transition's absolute count; inside the window (M11-B10), the finite set of EVERY exact count the decision's position among the aura's own ascending `applybuffstack` gains leaves — { H1, c1, …, cn } as `ONE_OF_NUMBERS` | only across same-millisecond refresh companions under EXACT ACTIVE presence; the set only when H1 is exact by that same rule at the cluster's first position and the cluster is nothing but gains and their companions |
| `buff.blood_debt.stack` | the last stack-bearing transition's absolute count, or the pinned 1 of a plain application preceded by a removal or by nothing (M11-B6) | under EXACT ACTIVE presence; an application to an aura already held refuses |
| `buff.essence_of_the_blood_queen.stack` (M11-B9) | the last `applybuffstack`'s absolute count, or the pinned 1 of a fresh `applybuff`; inside the window, the finite set of the two counts both orderings of a single stack gain leave (`ONE_OF_NUMBERS`) | under EXACT ACTIVE presence with nothing but same-millisecond companions since the count — a lone refresh breaks it (Q2 declined); every count checked against the effective maximum (DBC 5, +2 under a SELECTED Frenzied Bloodthirst): above it, or above 5 with the modifier unproven, refuses |
| `buff.<x>.remains` (5 atoms, M11-B4/B8) | the last exact gain (an `applybuff` / `applybuffstack`, or a lone `refreshbuff` only where the identity's policy reads it as the pinned trigger) plus the pinned Blood duration, under continuity from the gain | exact from the gain; a lower bound past a refresh of unpinned or unproven cause; for Essence (M11-B8) and Bone Shield (M11-B10) inside the 50 ms window, the floor both orderings of the cluster share (`WINDOW_ORDER_INVARIANT_BOUNDED`, one algorithm) |
| `cooldown.dancing_rune_weapon.remains` | the shared token-cooldown derivation over the pinned record | an observed cast within 90,000 ms (Insatiable Blade SELECTED) |

Never bound: `debuff.reapers_mark_debuff.up` (no debuff field exists), `fight_remains`
(PREDICTIVE), any Runic Power affordability (the wire's `cost` field is the
DBC base, not the amount paid — 450 reported, 350 paid), any Rune
regeneration (not on the wire), Vampiric Blood's cooldown (dynamic under Red
Thirst), Raise Dead's readiness (pet state).

## The Rune policy (M11-B7)

Rune state is accepted from exactly one place: the decision cast's own
attached entry, and only when M4 graded it EXACT / OBSERVED / PRE_COST
(`resources.ts`, the same reading the `rune` atom has used since B2).
Runes have no standalone `resourcechange` on the wire, so there is nothing
to carry from one decision to the next and no separate event whose ordering
against the cast could need a safety window: a Death Strike, a Blood Boil
or a Dance-of-Midnight-free Heart Strike one GCD after a Heart Strike at 4
Runes observes NO Runes — not 3, not 4, not "at least 3". No regeneration is
modelled, no `previous - cost`, no delta, no later observation flows
backwards, and nearby events are never read as Rune state.

On that one number, `rune-affordability.ts` states one fact and
`action-profile.ts` makes one proof, for the `marrowrend` token by name:
when the count is at or above the pinned Rune cost of Marrowrend — the DBC
row 10513, 2 Runes, read from `deathknight-blood-spender-costs.json`
through the artifact's own cost rule and never from the wire's `cost`
field — on a record whose cooldown, charge, internal and category cooldowns
and cast time are all zero, and the only effect in the pinned client data
that can change that row (Exterminate, 441416 / 447954, −50%, a
Deathbringer hero talent; `deathknight-blood-rune-cost-authority.ts`) is
excluded by a hero tree RESOLVED to a sub-tree that does not own it, then
`action_t::ready()` cannot fail on cost or cooldown and its remaining
conjuncts are the observed melee GCD cast's own: Marrowrend is
`PROVEN_USABLE`. Under an UNKNOWN, CONTRADICTORY or Deathbringer tree the
cost is unproven and the proof is withheld (`MODIFIER_UNPROVEN`). A count
BELOW the cost is recorded (`OWN_PRE_COST_BELOW_COST`) and proves nothing:
no `INSUFFICIENT_RESOURCE` exists for Blood, and Candidate B is deferred
by owner decision. The evidence class of every eligible decision is
censused as `runeAffordabilityEvidence` (`OWN_PRE_COST_AFFORDABLE`,
`OWN_PRE_COST_BELOW_COST`, `NO_RUNE_OBSERVATION`, `MODIFIER_UNPROVEN`,
`AUTHORITY_NOT_PINNED`), and the public schema is unchanged.

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
4. **Blood Debt is written AFTER its cause** — every gain 10-49 ms after
   the Death Strike that triggered it, every removal 20-35 ms after the
   Marrowrend that consumed it (opener 18-53 ms) — the opposite of hazard 1.
   `BEFORE_EVENT` at the producing decision therefore reads the pre-cast
   count, and the next eligible decision is at least 702 ms away, so the 50
   ms window never refuses a Blood Debt transition in this corpus. A
   decision inside that lag would read a one-stale count and no window
   would refuse it; the corpus census pins the minimum gap so a future
   capture that breaks it is noticed (M11-B6).

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
Boil usability 2, Boiling Point 1, `fight_remains` 1.

M11-B6 read Blood Debt's count from the aura's own transitions
(`aura-bindings.ts`, the identity's `exactCount: { applicationStack: 1 }`
in `deathknight-blood-aura-authority.ts`): the absolute `stack` of the last
`applybuffstack` (`EXACT_STACK_OBSERVATION`), the pinned 1 of a plain
`applybuff` preceded by a `removebuff` or by nothing
(`EXACT_STACK_APPLICATION`), zero from an observed removal
(`PROVEN_INACTIVE`); an application to an aura already held refuses
(`APPLICATION_WHILE_ACTIVE_UNPINNED`). Result: **37 of 123 resolved** (27
Death Strikes, 6 Heart Strikes at `sanlayn[8]`, 4 Blood Boils; all MATCH, 0
REJECTED), the 45 s slice 15 of 48, the opener unchanged at 1 of 21. Blood
Debt evidence: EXACT_STACK_OBSERVATION 107, EXACT_STACK_APPLICATION 7,
PROVEN_INACTIVE 3, AURA_STATE_UNKNOWN 6 (opener 14 / 1 / 0 / 6); the wire
holds no `refreshbuff` and no `removebuffstack` of it, and the retrospective
walk of the pinned model is consistent at 30 of 30 and 5 of 5 points. Of
the 45 decisions B5 left on the stack, 7 MATCH and 38 advance — 16 to
`USABILITY:marrowrend` (the count is exactly 10, the entry is TRUE, and no
rune or affordability proof exists for an action that was not cast), 19 to
`fight_remains` at `sanlayn[9]`, 3 to `sanlayn[8]`. The first undecided GCD
candidate is now `sanlayn[9]` on `fight_remains` at 20, Marrowrend
usability at 16, the Essence window refusals at 14 + 11, Bone Shield window
refusals 7, `any_dnd` usability 4, the Dancing Rune Weapon gate 3, Essence
stack 3, Runic Power after a spend 3, Death Strike usability 3 + 1, Blood
Boil usability 2, Vampiric Strike presence 2, Boiling Point 1, Heart Strike
usability 1. The full census is in the corpus (`SPEC_BLOOD_DEATH_KNIGHT.*`)
and `agent/architecture.md`.

M11-B7 proved Marrowrend usable from the decision cast's own Rune count
(`rune-affordability.ts`, the marrowrend allowlist in `action-profile.ts`).
Result: **37 MATCH / 7 REJECTED / 79 UNKNOWN** over the bundle — the MATCH
population is unchanged decision for decision (27 Death Strikes, 6 Heart
Strikes, 4 Blood Boils; 32 EXACT_ENTRY, 5 TOKEN_CONVERGED) and the seven
REJECTED are the first Blood produces: Heart Strikes at 2,039,813 /
2,040,797 / 2,042,440 (4 Runes each, three consecutive GCDs before the
Marrowrend at 2,043,209), 2,091,626 (3), 2,114,293 (4), 2,115,379 (3) and
the Vampiric Strike at 2,113,271 (5), each at Blood Debt exactly 10 from an
`applybuffstack` 5–29 s earlier, each with `sanlayn[7] marrowrend`
selected and no competing undecided GCD candidate. A REJECTED is an
authority-selected-different-token divergence — the pinned list picks
Marrowrend where the player pressed Heart Strike — and not a performance
score. The 45 s slice is 15 / 3 / 30; the opener 1 / 0 / 20 unchanged. Of
the 16 decisions B6 left on `USABILITY:marrowrend`, the 7 whose cast
carried an exact count of 3–5 resolve and the 9 whose cast carried no Rune
entry (7 Death Strikes, 2 free Heart Strikes) stay exactly where they were;
five decisions whose root scan now selects Marrowrend stay UNKNOWN because a
higher entry (`sanlayn[1]`, `any_dnd`, the Dancing Rune Weapon gate)
still diverges. Rune evidence over the 123: OWN_PRE_COST_AFFORDABLE 52,
OWN_PRE_COST_BELOW_COST 4, NO_RUNE_OBSERVATION 67 (opener 11 / 0 / 10);
counts 1 ×4, 2 ×9, 3 ×20, 4 ×14, 5 ×6, 6 ×3. The first-blocker ranking
after B7: `sanlayn[9]` `fight_remains` 20, Marrowrend usability 9,
Essence window refusals 14 + 11, Bone Shield window 7, `any_dnd`
usability 4, the Dancing Rune Weapon gate 3, Essence stack 3, Runic Power
after a spend 3, Death Strike usability 3 + 1, Blood Boil usability 2,
`buff.vampiric_strike.up` 2, Boiling Point 1, Heart Strike usability 1.

M11-B8 stopped anchoring exact Essence remainders on lone refreshes and
bound, inside the window, the floor both orderings share (see the Essence
policy below). Result: **37 MATCH / 9 REJECTED / 77 UNKNOWN** — the 37
MATCH unchanged decision for decision (33 EXACT_ENTRY, 4 TOKEN_CONVERGED:
the Vampiric Strike at 2,029,599 became EXACT_ENTRY once `sanlayn[1]` was
FALSE from its floor), the seven B7 REJECTED unchanged, and two more: the
Vampiric Strikes at 2,087,470 (floor 11,070 ms from the application at
2,073,540) and 2,093,667 (floor 18,803 ms past a 1 ms lead cluster), each
at Blood Debt exactly 10 with 3 Runes, `sanlayn[7] marrowrend` selected
and no competing candidate. The 45 s slice is 15 / 3 / 30; the opener 1 /
0 / 20. Essence remainders over the 123: EXACT 24, BOUNDED 40,
AMBIGUOUS_REFRESH_BEYOND_BASE_DURATION 32, WINDOW_ORDER_INVARIANT_BOUNDED
20, window-refused 6, presence-unknown 1 (opener 6 / 7 / 0 / 6 / 1 / 1);
seventeen bundle and six opener decisions — five MATCH and three REJECTED
among them — no longer rest on a Gift-edge refresh, and every one keeps its
outcome on evidence that never read the Essence remainder. The
first-blocker ranking after B8: `san_gift[3]` Essence stack 12,
`sanlayn[9]` `fight_remains` 9 + 11 (the latter now also carrying the
Essence remainder), Marrowrend usability 10, Bone Shield window 7,
`any_dnd` usability 5, `san_gift[2]` 4, the Dancing Rune Weapon gate 3,
Death Strike usability 3 + 1, Runic Power after a spend 3,
`buff.vampiric_strike.up` 2, Blood Boil usability 2, `sanlayn[1]` 2,
`san_gift[0]` 1, Boiling Point 1, Crimson Scourge 1.

M11-B9 read Essence's positive count from the wire and pinned the maximum
it is checked against (see the stack policy below). Result: **40 MATCH / 9
REJECTED / 74 UNKNOWN** — the 37 MATCH and 9 REJECTED unchanged decision
for decision, and three more MATCH: the Gift-window Vampiric Strikes at
2,015,029 ({ 5,6 }), 2,103,820 ({ 4,5 }) and 2,105,703 ({ 5,6 }), each
selected at `san_gift[3] heart_strike` — the observed action — once the
set makes `stack<7` TRUE in both worlds and the entries above it are FALSE
from the B8 floor, the Runic Power deficit and Crimson Scourge proven down.
The 45 s slice is 16 / 3 / 29; the opener 1 / 0 / 20 (its six sets all sit
behind `san_gift[2]`). Essence stack evidence over the 123: EXACT
observations 15, pinned fresh applications 9, finite sets 12 ({0,1},
{1,2} ×2, {2,3} ×2, {3,4}, {4,5} ×2, {5,6} ×2, {6,7} ×2), ambiguous across a
lone refresh 72, window-refused 14 (lone-refresh clusters, the expiry,
clusters with no exact count before them, and the first application in the
track at 2,008,597 — silence before it is not a proven zero),
presence-unknown 1; no count
was ever refused against the maximum on this build. Still UNKNOWN by
construction: 2,017,274 and 2,106,638 ({ 6,7 } — the worlds disagree),
2,101,867 (its count before the cluster lies across the Gift-edge lone
refresh at 2,099,885; Q2 declined), and the exact counts at the Marrowrend
2,015,770 (6) and the Death Strike 2,104,758 (5), which make `san_gift[3]`
TRUE for a Heart Strike that was not cast and stop on its usability. The
first-blocker ranking after B9: `sanlayn[9]` `fight_remains` 9 + 11,
Marrowrend usability 10, `san_gift[3]` Essence stack 7 (+ 2 on Heart
Strike usability), Bone Shield window 6 + 1, `any_dnd` usability 5 + 1,
`sanlayn[1]` 4 + 2, the Dancing Rune Weapon gate 3, `san_gift[2]` 3 + 1,
Death Strike usability 3 + 1, Runic Power after a spend 3,
`buff.vampiric_strike.up` 2, Blood Boil usability 2, `san_gift[0]` 1,
Boiling Point 1.

M11-B10 read Bone Shield's window state as what every ordering leaves (see
the Bone Shield window policy below). Result: **42 MATCH / 9 REJECTED / 72
UNKNOWN** — the 40 MATCH and 9 REJECTED unchanged decision for decision,
and two more MATCH: the Marrowrends at 2,043,209 ({ 7,8,9,10 }, floor
2,572 ms) and 2,124,183 ({ 8,9,10,11 }, floor 5,702 ms), each selected at
`sanlayn[7] marrowrend` — the observed action, PROVEN_USABLE from its own
Runes — at Blood Debt exactly 10, once `sanlayn[0]` (`!up`, `remains<1.5`,
`stack<=1`) and `sanlayn[3]`/`[4]` (`stack<6`) are FALSE for every member
and every entry between is FALSE on state already exact. The 45 s slice is
17 / 3 / 28; the opener 1 / 0 / 20 (its one Bone Shield set, { 7,9 } at
2,427,294, sits behind `san_gift[2]`). Bone Shield evidence over the 123:
exact counts 114, finite sets 7 ({5,6,7,8}, {7,8,9,10}, {11,12},
{8,9,10,11} ×2, {6,7,8,9}, {9,11}), ambiguous across lone refreshes 1
(2,044,021 — the Dancing Rune Weapon mirror's at-cap refreshes at
2,043,229), window-refused 1 (the track's first application at 2,004,615,
20 ms ahead: AMBIGUOUS_INITIAL_STATE before it, no application count
pinned); presence order-invariant 7; remainder floors 7. Still UNKNOWN once
Bone Shield is passed: 2,057,622 and 2,085,352 on `sanlayn[9]`
`fight_remains`, 2,151,502 and 2,164,444 on `sanlayn[2]`'s Runic Power
deficit after a spend. The first-blocker ranking after B10: `sanlayn[9]`
`fight_remains` 10 + 12, Marrowrend usability 10, `san_gift[3]` Essence
stack 7 (+ 2 on Heart Strike usability), `any_dnd` usability 5 + 1, Runic
Power after a spend 5, `sanlayn[1]` 4 + 2, the Dancing Rune Weapon gate 3,
`san_gift[2]` 3 + 1, Death Strike usability 3 + 1,
`buff.vampiric_strike.up` 2, Blood Boil usability 2, `san_gift[0]` 1,
Bone Shield count (lone refresh) 1, Boiling Point 1.

## The Bone Shield window policy (M11-B10)

Warcraft Logs writes a Marrowrend's three Bone Shield stacks (`trigger(3)`,
effect 286519) as three `applybuffstack` at the cast's own millisecond and
AHEAD of it in the array — each carrying the absolute resulting count, each
after the first beside a same-millisecond `refreshbuff` — and a Death's
Caress's two (`trigger(2)`, effect 1000766) as one; the Dancing Rune Weapon
mirrors land 10–35 ms AFTER the cast, and at the maximum a trigger writes
only a refresh. Whether those gains preceded the decision, followed it, or
straddled it the wire does not say, so inside the 50 ms window the count is
EVERY exact value the decision's position among them leaves: the ordinary
exact count immediately before the cluster (H1, by the M11-B2 rule at the
cluster's first position with the set not admitted — the last
`applybuffstack` or `removebuffstack`, carried only across same-millisecond
companions, never across a lone refresh, never from silence) and each
gain's absolute count in order, { H1, c1, …, cn } — never { H1, cn }, never
`H1 + 3`. The set reaches the shared evaluator as `ONE_OF_NUMBERS`
(unchanged since M11-B9), which decides `stack<=1` and `stack<6` only when
every member decides them alike; Blood writes no threshold. A cluster
holding a plain application, a removal, a lone refresh, a non-ascending
count, or an H1 that is not exact refuses.

The presence is proven the same way on both sides and never from the set:
M4 `presenceAt` immediately before the cluster (the ordinary binding at
its first position, window presence not admitted) and at the decision must
both be EXACT ACTIVE — `WINDOW_ORDER_INVARIANT_PRESENCE`; a before-side M4
cannot answer (the track's first application, 2,004,615: AMBIGUOUS_INITIAL_
STATE) refuses. The remainder is the M11-B8 floor both orderings share,
`windowOrderInvariantBound` switched on for the identity and the algorithm
untouched (Bone Shield's chain before a cluster is often a lower bound past
a refresh beside a charge removal; the floor is the smaller of that and the
reset). Bone Shield's fresh application still pins no count (Marrowrend 3,
Death's Caress 2, the Dancing Rune Weapon 5 — no single number), so a plain
`applybuff` inside the window binds nothing even after a proven removal; a
lone refresh still breaks the carried count (2,044,021); removals inside the
window stay refused (none occur on either subject, and the corpus carries no
damage-taken stream to corroborate their cause); and the maximum stays
unguarded: the DBC `_max_stack` is 10, Improved Bone Shield (374715, effect
1259987, +2 `P_MAX_STACKS` on the aura's family flags) makes it 12 on the
corpus builds, but that talent is not in the extracted artifact and the
observed 12 corroborates it without establishing it — deferred to
promotion readiness, not fed by the log.

## The Essence of the Blood Queen stack policy (M11-B9)

The DBC maximum of 433925 is 5 — the generated artifact's raw `maxStack`,
not reinterpreted. Frenzied Bloodthirst (talent 434075, trait entry 117662
at node 95065, NORMAL, San'layn) adds exactly +2 through effect 1123818, an
`A_ADD_FLAT_LABEL_MODIFIER` on `P_MAX_STACKS` for label 3134, which only
433925 carries; the effective maximum is therefore 7 when the talent is
SELECTED, which both subjects prove by their own entry through the
machine-extracted talent artifact (never from a count). The pinned
SimulationCraft parses that talent (`parse_all_passive_talents`) but
`buff_t` never reads the parsed `max_stack` field, so the sim caps the aura
at 5 and `san_gift[3]`'s `stack<7` is vacuous there: a runtime omission the
wire's 6 and 7 corroborate and do not establish
(`deathknight-blood-stack-authority.ts`). Positive counts come from the
wire's absolute `applybuffstack` values and the pinned fresh-application 1
(`_proc_charges` 0 → `_initial_stack` 1), under the B6 rule; a lone
unexplained `refreshbuff` still breaks the carried count
(`COUNT_AMBIGUOUS_SINCE_OBSERVATION`) even though the remainder survives
it as a floor — Q2 was declined, and B9 pins no wire contract about what a
refresh does to a count. A count above the effective maximum, or above 5
while the modifier is unproven, is `COUNT_EXCEEDS_PINNED_MAX`.

Inside the 50 ms window (unchanged) a cluster of exactly one stack gain
(with its same-millisecond companion) or one fresh application after a
proven removal binds `BOUND_SET`: the finite set { H1, H2 } of the exact
counts both orderings leave — H1 by the ordinary rule at the cluster's
first position (every refusal applies; no nested window), H2 the wire's
count. For a fresh application the zero world is a STATE, and only the
ordinary presence binding at that position proves it: M4 EXACT INACTIVE
anchored on an observed removal (2,073,540 after the expiry at 2,071,379).
The first application in a track (2,008,597; opener 2,418,659) has
`AMBIGUOUS_INITIAL_STATE` before it and refuses — no aura event is not
aura inactive, and { 0,1 } is never read from silence. The set reaches the shared evaluator as `ONE_OF_NUMBERS`
(`src/simc/expression/evaluate.ts`): not a range, not a bound, never
collapsed to a member — a comparison decides only when every member decides
it alike, a truth only when every member is zero or every member is
non-zero, arithmetic refuses, and the trace names the members. Blood
supplies the possible exact values; the evaluator decides `stack<7`, with
no `<7` written anywhere in Blood code.

## The Essence of the Blood Queen policy (M11-B8)

Essence (433925) lasts exactly 25,000 ms for every Blood actor — the DBC
20,000 ms plus the specialization passive's 5,000 ms by label — under a
DURATION refresh: a `buff_t::trigger` on the active aura reschedules the
expiry to the full duration, and the pinned module's only producer is that
trigger on a Vampiric Strike execution. The corpus, however, carries a lone
`refreshbuff` of the aura at every Gift of the San'layn edge with no
Vampiric Strike near it — an event the pinned module cannot write. So the
identity's `remainsPolicy` (`deathknight-blood-aura-authority.ts`) reads
a lone refresh as `UNPROVEN_CAUSE`: a `refreshbuff` with no
same-millisecond `applybuff` / `applybuffstack` companion is never assigned
a cause (not by the cast 0-1 ms after it, not by the Gift edge beside it,
not by the absence of any other producer) and never anchors an exact
remainder. It cannot shorten an expiry already proven, so the earlier gain's
expiry survives as a lower bound (`GAIN_ANCHOR_BOUNDED`, walked back through
consecutive lone refreshes), and once that has run out the remainder is
UNKNOWN (`AMBIGUOUS_REFRESH_BEYOND_BASE_DURATION`). A refresh beside an
exact gain is that gain's companion; the gain anchors. Bone Shield, Crimson
Scourge and Visceral Strength keep the M11-B4 reading
(`PINNED_TRIGGER_RESET`).

Inside the 50 ms pre-decision window every exact reading is still refused
and `.up` / `.stack` are unchanged; for Essence's `.remains` only, the
floor true under BOTH orderings of the cluster is bound: H1, the chain
before the cluster (every ordinary refusal applies; no nested window) minus
the elapsed time, had the cluster followed the decision; H2, 25,000 ms minus
the latest lead, had a reset in it preceded the decision; `atLeast =
min(H1, H2)`, a `BOUNDED_NUMBER`, with both worlds recorded on the binding.
A cluster holding a plain application or any removal, an H1 the rules cannot
establish, a floor that has run out, or an edge within the 50 ms tolerance
of the pinned 1.5 s / 8 s thresholds is refused. No ordering is chosen.

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
- No cause for any lone Essence refresh and no exact expiry from one, no
  positive Essence count and no `stack<7` from the pinned `maxStack` the
  wire contradicts, no ordering chosen inside the window, no bound from a
  cluster holding an application or a removal, no nested window bound, no
  order-invariant edge inside the threshold tolerance, no change to the
  window or tolerance constants or to any other identity (the M11-B8
  boundary).
- No Essence count from a Vampiric Strike count, an increment, a carry
  across a lone refresh, or a count read off the wire above the maximum the
  build proves; no maximum read off a count; no ordering chosen for a stack
  set, no set from a lone-refresh, removal or multi-gain cluster, no nested
  window set, no `<7` special case, no set collapsed to a member, no
  arithmetic over a set, no set for Blood Debt, no { 0,1 } from the silence
  before a track's first transition (the M11-B9 boundary; Q2 declined).
- No Bone Shield world beyond the wire's own counts and the exact count
  before them — no `H1 + 3`, no intermediate world dropped, no ordering
  chosen, no set from a cluster holding a plain application, a removal or a
  lone refresh, no count for a plain application even after a proven
  removal (the producer's number is not pinned), no presence from a count
  or from a gain's implication, no presence whose before-side M4 cannot
  answer, no change to the M11-B8 bound algorithm, no removal-window
  ambiguity model, no Improved Bone Shield guard fed by the observed 12
  (the M11-B10 boundary).
- No GCD numeric bounds, no `empower_to` support, no new action option, no
  target-count or enemy-roster model, no `target_if`, no undecided-run world
  splitting, no generic variables, no pet state, no charge model, no
  generalized stack reconstruction, no new parser builtin, no new public
  reason enum, no public exposure (the M11-B2 hard boundary).
- No Blood Debt count that was not read off a transition: no stack for a
  Death Strike or the set bonus's internal cooldown, no `previous + 1`, no
  cap arithmetic, no decay, no bounded stack, no set-bonus resolution from
  equipped items, no zero from the combatantinfo snapshot, no reset to 1
  for an application to an aura already held (the M11-B6 boundary).
- No Rune value that was not the decision cast's own PRE_COST entry: no
  carry between decisions, no `previous - cost`, no regeneration, no
  reading of a nearby event, no trust in the wire's `cost` field, no
  affordability for any token but `marrowrend`, no proof under an
  unresolved or Deathbringer hero tree, and no negative resource proof — a
  count below the cost is recorded, never an `INSUFFICIENT_RESOURCE` (the
  M11-B7 boundary; Candidate B deferred).
- No Runic Power affordability in either direction, no Rune regeneration, no
  Vampiric Blood cooldown.
- No reachability refinement in the unselectability proof (it still walks
  `precombat` and the Deathbringer list): recorded as a measured limit.
- No verdict on Death Strike as mitigation or healing: those domains are
  DECLARED and bound to nothing (`NO_PINNED_AUTHORITY_FOR_DOMAIN`), and the
  offensive result carries `deathStrikeDualRole: true` so no reader mistakes
  a spender comparison for a survival judgment.

Files: `spec.ts` (identity), `pinned-authority.ts`, `authority-bindings.ts`
(six capabilities, one binding), `vocabulary.ts`, `resolver.ts`,
`resources.ts`, `runic-power-state.ts` (the Runic Power carry),
`aura-bindings.ts` (presence, the exact-count rule for Bone Shield and Blood
Debt), `aura-remains.ts` (the remains derivation; the Essence lone-refresh
policy and the order-invariant window floor, M11-B8), `remains-thresholds.ts` (the pinned list's thresholds, read
from the parsed authority), `rune-affordability.ts` (Marrowrend's Rune
affordability fact, M11-B7), `cooldown-bindings.ts`,
`domain-boundary.ts`, `domains.ts`, `action-profile.ts`,
`first-gcd-state.ts`, `first-gcd-adapter.ts` (stopping points, dispatch
trace, undecided candidates), `observed-action-gate.ts`,
`observed-analysis.ts` (the facade), `registration.ts`. Data:
`src/data/game/deathknight-blood-*` (including
`deathknight-blood-rune-cost-authority.ts`, M11-B7, and
`deathknight-blood-stack-authority.ts`, M11-B9),
`src/simc/data/deathknight-blood.apl.json`.
Tests: `tests/unit/m11b2-blood-*.test.ts`, `tests/unit/m11b4-*.test.ts`,
`tests/unit/m11b5-*.test.ts`, `tests/unit/m11b6-blood-debt-stack.test.ts`
(with `tests/support/m11/blood-debt-census.ts`),
`tests/unit/m11b7-blood-rune-affordability.test.ts`,
`tests/unit/m11b8-blood-ebq-remains.test.ts`,
`tests/unit/m11b9-blood-ebq-stack.test.ts`,
`tests/unit/m11b10-blood-bone-shield-window.test.ts`,
`tests/unit/simc-expression-one-of-numbers.test.ts`,
`tests/contracts/m11b2-blood-*.test.ts`, corpus cases
`spec-blood-death-knight.*`.
