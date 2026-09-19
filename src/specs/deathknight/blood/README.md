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

1. **A cast's own aura effects precede the cast in the log at the same
   millisecond** (a Marrowrend's Bone Shield gains, a Vampiric Strike's
   Essence stack). `BEFORE_EVENT` at the cast position would read the
   POST-cast state. The aura bindings refuse (`SAME_MILLISECOND_TRANSITION`)
   whenever the queried identity has a transition at the decision's own
   millisecond ahead of it.
2. **The wire's `cost` is not the cost.** The gtKb subject cast Death Strike
   with 440 and 390 Runic Power attached against a reported cost of 450. No
   usability proof reads the field in either direction.

## The measurement

Over the composed 165 s A7R6 bundle (actor 14, San'layn) and the gtKb
opener, still 0 of 123 and 0 of 21 resolved. M11-B2 measured root scans
stopping at `sanlayn[0]` / `san_gift[0]` on the decimal literal `1.5` the
parser then refused (122 of 123; 21 of 21). M11-B3 admitted `digits '.'
digits` in the shared parser (syntax only; no Blood state changed) and
remeasured: the root scan RESOLVES with every reached candidate undecided
at 79 of 123 (branch worlds diverge, `DIVERGENT_GCD_OUTCOMES`), BLOCKS at
`sanlayn[10] consumption` at 43 (applicability UNKNOWN — Consumption's
NORMAL node is absent — and the unrecognised `empower_to=` option), and
once at the `default[15]` run gate on an unobserved Gift at the pull
(opener: 15 / 6 / 0). The first undecided GCD candidate in priority order is
`sanlayn[0] deaths_caress` on `buff.bone_shield.remains` at 96, `san_gift[0]
heart_strike` on `buff.essence_of_the_blood_queen.remains` at 24, and the
Dancing Rune Weapon gate at 3 (opener 6 / 15 / 0). The B1 dispatch
semantics held on every scan (`RUN_GATE_FALSE_SKIPPED` for the Deathbringer
list ×123; `san_gift` entered inside the Gift window, skipped outside it,
blocked-undecided once; `sanlayn` entered exactly where `san_gift` was
skipped, 55 entered / 43 blocked). Behind the remainders lie
`buff.vampiric_strike.remains`, `buff.crimson_scourge.remains`,
`buff.visceral_strength.remains`, `buff.blood_debt.stack`,
`runic_power.deficit` on non-Death-Strike casts, and `fight_remains`. The
full ranking and the recommended next capability (`buff.<x>.remains` for
fixed-duration self-auras, Bone Shield first) are in the M11-B3 report and
`agent/architecture.md`.

## What this module refuses on purpose

- No `knownBuffRemainsSeconds`, no generic buff-remains reconstruction, no
  GCD numeric bounds, no `empower_to` support, no new action option, no
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
`resources.ts`, `aura-bindings.ts`, `cooldown-bindings.ts`,
`domain-boundary.ts`, `domains.ts`, `action-profile.ts`,
`first-gcd-state.ts`, `first-gcd-adapter.ts` (stopping points, dispatch
trace, undecided candidates), `observed-action-gate.ts`,
`observed-analysis.ts` (the facade), `registration.ts`. Data:
`src/data/game/deathknight-blood-*`, `src/simc/data/deathknight-blood.apl.json`.
Tests: `tests/unit/m11b2-blood-*.test.ts`,
`tests/contracts/m11b2-blood-*.test.ts`, corpus cases
`spec-blood-death-knight.*`.
