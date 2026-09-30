# Brewmaster Monk — public observed-decision slice (M11-C2 … M11-C4i; PUBLIC since M11-C4j)

**Exposure: `PUBLIC` since M11-C4j.** The registration
(`monk-brewmaster-observed-decisions`, `monk/brewmaster`) was INTERNAL_ONLY
from M11-C2 through M11-C4i and moved by the reviewed five-site edit: the
partition, the public contract's `specId` enum, the identity table
(`Monk`/`Brewmaster`, no other Monk specialization), `satisfies PublicSpecId`
in `spec.ts`, and the registration's `exposure`. REST, MCP and raid night
dispatch it through the shared application service; there is no Brewmaster
branch in any of them.

**Validated for Shado-Pan only** (`supported-profile.ts`, owner decision). Both
real subjects are Shado-Pan. A resolved Master of Harmony build is
`AUTHORITY_NOT_AVAILABLE`; an unresolved or contradictory hero tree is
`PROFILE_NOT_RESOLVED`; both before any decision is read.

**Beta: not exhaustive.** These stay `UNKNOWN`, never inferred: what Black Ox
Brew changes, Empty the Cellar's buff when the window holds no 1262768
transition (subject 2), Keg Smash charges and its hasted recharge (only the
≥1-charge upper bound), Energy between observations, and every alternative not
proven usable in all eight dimensions. The published limits prose
(`registration.ts`, `BREWMASTER_LIMITS`) says so.

**Ingestion.** The offensive capability declares ENERGY (M11-C4j): C4i's
positive usability reads the decision cast's own PRE_COST Energy, and the
derived requirement now asks for resources. The Energy wire type resolves
through the version-scoped contract; an uncovered parser version leaves only
the affordability dimension `UNKNOWN`.

**It began as a MEASUREMENT.** The next cohort's representative is a tank whose
pinned authority dispatches two hero-tree lists by `run_action_list`,
interleaves NON_GCD brews with GCD actions, and reads brew charges and
continuous Energy. This slice runs the shared engine over that authority on
real sanitized evidence and records where it stops and why. Nothing is widened
to force a resolved decision.

The registration is built by the specialization module factory
(`BREWMASTER_MONK_MODULE` in `registration.ts`, through `defineSpecModule`),
pinned to the roster row (`simcSpecId` 268, role `TANK`), with
`supplementalAnalyses: []`.

## The slice: five observed offensive tokens

For one Brewmaster's observed **Keg Smash**, **Blackout Kick**, **Tiger Palm**,
**Breath of Fire** and **Invoke Niuzao** casts, under the pinned
`SIMC_APL_MONK_BREWMASTER` artifact (`simc-33622e9d-1`, the `default_apl`
function of `namespace brewmaster` in `apl_monk.cpp`, selected by source
coordinates — `provenance.regionSelector`, no marker fields):

| Step | Module |
| --- | --- |
| population: every COMPLETE cast, classified MELEE_SWING / NON_GCD_ACTION / EXECUTION_LANE_NOT_ESTABLISHED / NO_AUTHORITY_TOKEN_BINDING / OUTSIDE_FIRST_SLICE / eligible | `observed-analysis.ts` |
| build facts: 14 talents, the hero tree, `apex.1` / `apex.3` — three-way, never from a cast | `src/data/game/monk-brewmaster-talents.ts` |
| the twelve declared atoms: six build-static truths bound, six magnitudes refused | `vocabulary.ts`, `resolver.ts` |
| `buff.<name>.up` for Blackout Combo, Empty Barrel and Invoke Niuzao — M4 presence or a talent disproof | `aura-bindings.ts`, `src/data/game/monk-brewmaster-aura-authority.ts` |
| cooldown readiness for the six M11-C1 pins and Breath of Fire (M11-C3a) | `cooldown-bindings.ts` |
| applicability (domain boundary first) and usability proofs | `domain-boundary.ts`, `action-profile.ts` |
| the first-GCD query, with the one reviewed NON_GCD contract (`auto_attack`) | `first-gcd-adapter.ts`, `src/data/game/monk-brewmaster-transition-authority.ts` |
| the nested unselectability proof | `observed-action-gate.ts` |
| the six domains, one with authority | `authority-bindings.ts`, `domains.ts` |

**Hero tree.** Resolved from trait-entry membership: RESOLVED Shado-Pan binds
`hero_tree.shadopan` TRUE and `hero_tree.master_of_harmony` FALSE (and the
reverse); UNKNOWN or CONTRADICTORY binds neither, and the run gates stay
undecided. There is NO validated-profile gate: the slice is internal and exists
to be measured.

**Empty the Cellar.** Its `ready()` requires its buff up (SimC spell 1262768),
and REQUIRED_AURA_INACTIVE is implemented — but only under a CORROBORATED wire
id, and until M11-C4i the readiness authority corroborated none. Since M11-C4i
1262768 is CORROBORATED from the committed 165 s window of subject 1 (Exploding
Keg 2,438,549 → apply 2,438,567; remove 2,439,541 → Empty the Cellar cast
2,439,542; Exploding Keg 2,516,886 → apply 2,516,900 → remove 2,536,906). An
uncorroborated id would still refuse the fact; the SimC id is never used as a
stand-in.

**Tiger Palm.** STATIC_READY_FALSE while Press the Advantage is SELECTED
(`tiger_palm_t::ready()`, `sc_monk.cpp:848-853`). The subject took Blackout
Combo, so the proof never fires on it.

## The measurement (gtKb fight 22, actor 4, Shado-Pan, 20 s opener) — BEFORE M11-C4i

| | |
| --- | --- |
| eligible | 15 (Keg Smash 4, Blackout Kick 4, Tiger Palm 3, Breath of Fire 3, Invoke Niuzao 1) |
| MATCH | 5 — all EXACT_ENTRY: the Breath of Fire casts at +12.0 s and +16.3 s (`shado_pan[0]`, under Sal'salabim's Strength and a proven Invoke Niuzao buff), and since M11-C3a the Keg Smash casts at +10.7 s, +15.2 s and +19.3 s (`shado_pan[1]`, Breath of Fire proven on cooldown) |
| REJECTED | 0 |
| UNKNOWN | 10 |
| excluded | 18 — MELEE_SWING 7, NON_GCD_ACTION 3 (Purifying Brew), EXECUTION_LANE_NOT_ESTABLISHED 8 (Provoke, five Gift of the Ox, a potion, an on-use item) |
| dispatch | every root scan: `race_actions` / `item_actions` return empty, `master_of_harmony` RUN_GATE_FALSE_SKIPPED, `shado_pan` RUN_ENTERED_SCAN_ENDS |
| root-scan stopping entries | none — every root scan resolves; the refusals come from the multi-world query |

Why each UNKNOWN is UNKNOWN (`coverage.unresolvedAt`):

- **8 × `TRANSITION_UNSUPPORTED @ shado_pan[2] purifying_brew`.** The query must
  explore the world in which the NON_GCD Purifying Brew fires, and no reviewed
  transition contract exists for it: a brew may write Empty Barrel, Stagger,
  Ox Stance and brew-container cooldown state that other gates read. Empty
  Barrel is a 20% proc on a brew cast, not a certainty: the pinned Bring Me
  Another driver (1265129) carries `_proc_chance` 20 and `create_proc_callback`
  copies it (sc_monk.cpp:6630ff, :6911-6919). After a hypothetical brew,
  `buff.empty_barrel.up` is therefore one of two values and is never bound as
  up. The capture agrees: only the last of three Purifying Brews (+16.3 s) is
  followed by an Empty Barrel application.
- **2 × `DIVERGENT_GCD_OUTCOMES @ shado_pan[1] keg_smash`** (Blackout Kick
  +17.3 s, Tiger Palm +18.3 s). Breath of Fire is proven on cooldown, so the
  scan reaches `shado_pan[1]`, and Keg Smash's readiness is not modelled: two
  charges under Stormstout's Last Keg, a recharge the specialization passive
  hastes, and two reset paths.

**Breath of Fire (M11-C3a).** Pinned at 15,000 ms (no charges, not hasted, no
census modifier) with ONE declared dynamic mutation: every Keg Smash resets it
under Sal'salabim's Strength, carried as a `CAST_BY_ACTOR` signature (121253).
A lower bound from the previous Breath of Fire stands only while CASTS coverage
is complete and no completed Keg Smash by the actor lies strictly between that
Breath of Fire and the decision; otherwise its readiness is UNKNOWN. Over the
opener: PROVEN_NOT_READY at 11 decisions, UNKNOWN at 4 (two before any Breath of
Fire, and the two Breath of Fire casts themselves, each preceded by a Keg
Smash). The signature is NOT talent-conditioned: without Sal'salabim's Strength
an intervening Keg Smash withholds a proof it did not need to withhold, which
costs coverage and can never produce a false verdict. It never proves
readiness, never re-anchors on the reset, and never replays it.

Behind the two UNKNOWN causes, the competing candidates the census records: Niuzao's buff is
AMBIGUOUS_INITIAL_STATE before its first in-fight transition (three decisions
before +3.99 s), Keg Smash and Celestial Brew / Exploding Keg usability,
`cooldown.celestial_brew.charges_fractional`, and `buff.empty_the_cellar.remains`.

## M11-C4i — positive usability and the Purifying Brew closure

`positive-usability.ts` builds the shared completeness conclusion
(`src/findings/usability/`) for an UNOBSERVED Keg Smash, Blackout Kick,
Breath of Fire or Invoke Niuzao at each decision, one resolver per dimension:

| Dimension | Proof |
| --- | --- |
| build applicability | the entry's build gates proven true |
| `ready()` override | pinned `BREWMASTER_NO_READY_OVERRIDE` source ranges for the action class and every wrapper |
| cooldown/charge | the shared upper-bound proof (Keg Smash: ≥1 charge via its charge cooldown; Blackout Kick with category sibling 100784) |
| resource | NOT_APPLICABLE with no power row (Blackout Kick, Breath of Fire, Niuzao); Keg Smash by the decision cast's exact PRE_COST, a corroborated wire cost and `costCannotExceedBase` |
| GCD | the decision point is a GCD boundary |
| range/target | STRICT same-target corroboration; Breath of Fire (untargeted, cone) never |
| movement/cast | NOT_APPLICABLE unless `usable_moving()` is false; Blackout Kick only when the decision cast carries the same restriction |
| action-specific | none declared for the four |

Purifying Brew now has a reviewed contract: it writes the shared internal
cooldown and FORGETS `buff.empty_barrel` — a binding the evidence proves UP is
kept, any other is dropped, and none is ever added (the Bring Me Another proc
is 20%). The Black Ox Brew refusal remains.

Measured (pinned in the corpus):

| window | MATCH | REJECTED | UNKNOWN |
| --- | --- | --- | --- |
| subject 1, opener | 5 | 1 | 9 |
| subject 1, 165 s | 71 | 1 | 41 |
| subject 1, full fight | 109 | 10 | 70 |
| subject 2 (rXAf f13 a11), 165 s | 47 | 1 | 91 |

The independent `REJECTED` decisions are the Tiger Palm at 2,424,688 (subject 1,
`shado_pan[1] keg_smash` under a proven Invoke Niuzao buff; Keg Smash's last
cast 9,465 ms earlier against 8,000 + 250 ms, PRE_COST 100 Energy against a base
cost of 40, the target within 5 yd inside 15) and the Tiger Palm at 2,573,516
(subject 2, `shado_pan[7] blackout_kick` with Blackout Combo proven down). No
earlier MATCH flips. The remaining UNKNOWNs name Black Ox Brew
(`shado_pan[3]`), Blackout Kick, Invoke Niuzao, Keg Smash and Breath of Fire
divergent worlds, and on subject 2 Empty the Cellar (`shado_pan[11]`: no
1262768 transition in that window).

## Not evaluated, deliberately

Brews, Stagger, active mitigation, self-healing, defensive cooldowns,
interrupts, survival, Energy intervals, brew charges, Keg Smash charge modelling
(beyond the ≥1-charge upper bound), Black Ox Brew,
target count, racials, potions, trinkets. The Master of Harmony
list is authority the engine dispatches correctly and no evidence has
measured.
