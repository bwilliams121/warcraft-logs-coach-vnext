# Havoc Demon Hunter — observed-decision slice (ONB-A1; INTERNAL_ONLY)

**Exposure: `INTERNAL_ONLY`.** The registration
(`demonhunter-havoc-observed-decisions`, `demonhunter/havoc`) is in the production
catalog and reachable by the internal lookup, the corpus and tests. The application
service, raid night, REST and MCP never select it. Public promotion is ONB-A1P.

**This is Cohort A's representative, and it is narrow.** Its pinned list is a single
priority list with no `run_action_list`. On current evidence the surface it can
actually decide is the **Reaver's Glaive priority on Aldrachi Reaver builds**.

## The authority

`SIMC_APL_DEMONHUNTER_HAVOC` (`simc-33622e9d-1`), the `//havoc_apl_start .. _end` region
of `apl_demon_hunter.cpp`, governs OFFENSIVE_ROTATION only. Resource spending, defensive
cooldowns and interrupts are declared and resolve `NO_PINNED_AUTHORITY_FOR_DOMAIN`. Active
mitigation and self healing are not declared.

## The decision population

Every COMPLETE cast by the actor, classified by pinned data:

| Cast | Classification |
| --- | --- |
| Warcraft Logs `melee` flag | excluded `MELEE_SWING` |
| pinned lane NON_GCD (Vengeful Retreat, Metamorphosis's impact 200166, The Hunt's impact 370966, Felblade's charge 213243) | excluded `NON_GCD_ACTION` |
| no pinned lane record (Fel Rush, Blur, Darkness, the automatic glaives, Shattered Souls, a potion, an item) | excluded `EXECUTION_LANE_NOT_ESTABLISHED` |
| `throw_glaive`, `the_hunt` | excluded `OUTSIDE_FIRST_SLICE` |
| every other GCD token | eligible → unselectability proof + first-GCD query → comparison |

**Why Throw Glaive and The Hunt are not judged.** On the retained subject all 48 logged
185123 casts sit within 2 ms of a Blade Dance or Death Sweep: Screaming Brutality executes
a background copy on the same spell. `default[14]`'s gate is false, so judging them would
report 48 mistakes that were never made. The Hunt has a cast time, so it is decided at its
`begincast`, and this facade evaluates state at the observed `cast`.

**Metamorphosis is never judged as a press.** The log never reports 191427. It reports the
leap's impact, 200166, which has a NON_GCD lane record and no token.

## What is bound, and from what

| Atom | Source | Rule |
| --- | --- | --- |
| `fury` | the decision cast's own PRE_COST | EXACT on a costed cast; unknown on a free one. Never replayed. Forgotten in a branch that consumes a soul |
| `buff.reavers_glaive`, `buff.rending_strike`, `buff.glaive_flurry`, `buff.initiative` | M4 `presenceAt` | bound from an observed transition strictly before the decision; see the skew rule |
| `buff.<x>.down` | the same binding, negated | |
| `hero_tree.felscarred`, `hero_tree.aldrachi_reaver` | entry membership in the observed tree | both or neither |
| `talent.<x>` | the three-way rule; Fel-Scarred talents FALSE on a resolved Aldrachi Reaver tree | absent from the tree is UNKNOWN |
| `action.<x>.demonsurge_available` | the constant 0 when Demonsurge is proven absent | otherwise unbound: runtime state on a quiet buff the log never shows |
| `cooldown.metamorphosis.remains`, `.up` | the pinned 120 s anchored on the impact, less a 2 s margin, and only when the leap's own buff application is observed within that margin | a lower bound; `.up` is only ever bound FALSE |
| `variable.tab_target_burning_wound` | `precombat[1]`, resolved by the shared engine | so `default[14]` is false |
| `gcd.max`, `gcd.remains`, `active_enemies`, `spell_targets`, `active_dot.burning_wound`, `debuff.reavers_mark.stack`, `charges`, `full_recharge_time` | none | UNKNOWN_NUMBER, stated as such |

**One millisecond of skew.** The log can place a cast's own aura effect before the cast:
Rending Strike and Glaive Flurry come up 0 or 1 ms before the Reaver's Glaive that applies
them. Read naively, every Reaver's Glaive would see its own buffs up and prove itself
unselectable, which is what the first measurement did (27 false REJECTED). An edge within
2 ms before the decision is read from before the edge only when the decision's own action is
pinned to write that buff in that direction (`OWN_ACTION_AURA_EDGES`), and when it is the only
edge in the window. Any other edge leaves the atom unbound.

## Usability

Hypothetical first; the observed cast; Metamorphosis `ACTIVE_COOLDOWN`; Reaver's Glaive
`REQUIRED_AURA_INACTIVE` when its buff is proven down, unless the branch consumed a soul
that could have raised it. Last, Reaver's Glaive `PROVEN_USABLE` from the shared
completeness contract (`positive-usability.ts`), which needs its buff up for at least the
1,000 ms reaction tolerance, the decision's own cast on the same enemy target, and a
pinned range record for it.

## Reviewed NON_GCD transitions

`auto_attack`, `vengeful_retreat`, `pick_up_fragment`
(`src/data/game/demonhunter-havoc-transition-authority.ts`). The last two consume souls,
so they forget `fury` and `buff.reavers_glaive`. Nothing is ever bound up by a branch.

## Measured: b1PmaKrd6CDfzngc fight 48, actor 18, Aldrachi Reaver

| Window | Eligible | MATCH | REJECTED | UNKNOWN | Excluded |
| --- | --- | --- | --- | --- | --- |
| retained first 90 s (committed, pinned in the archive) | 76 | 7 | 4 | 65 | 252 |
| whole fight (retained raw capture, not committed) | 279 | 24 | 23 | 232 | 902 |

Why each UNKNOWN is UNKNOWN, whole fight:

| Count | Stopped at | Why |
| --- | --- | --- |
| 184 | `default[5] the_hunt` | its gate is open unless Reaver's Glaive is up, and its readiness is never bounded |
| 26 | `default[4] metamorphosis` | outside the proven window: before the first impact, or near ready |
| 15 | `default[9] reavers_glaive` | its buff is up and the positive proof falls short: the reaction tolerance, or a decision cast that corroborates no range |
| 4 | `default[10] annihilation` | `debuff.reavers_mark.stack` and `active_enemies` are unknown |
| 3 | `default[12] death_sweep` | `debuff.essence_break.up` is not bound |

Every resolved decision names `default[9]`. **A REJECTED says the pinned list would have
pressed Reaver's Glaive first. It is not coaching:** the row is internal, and the 182 to
191 s hold in this fight is a real disagreement with the list that nobody has reviewed.

Expressions and lists:

| Supported | Refused, stated |
| --- | --- |
| `default`, `items` (non-domain), the precombat variables | `immolation_aura,,if=` at `default[17]`: never reached, since `default[15]` stops every scan first |
| `pick_up_fragment`'s `type` and `mode`, scoped to that token | `trinket.*` in the `items` gates: never read, the list is non-domain |

## Not evaluated, deliberately

Felscarred builds are analyzed and almost entirely UNKNOWN: Demonsurge is unbound, and no
Felscarred evidence was measured. Eye Beam, Blade Dance, Essence Break and Immolation Aura
cooldowns; The Hunt's cooldown (`src/data/game/demonhunter-havoc-cooldowns.ts`); Fury between
casts; the enemy count; debuffs; `default[15]`, which needs A Fire Inside proven absent, and a
node absent from the tree is UNKNOWN. See `agent/follow-ups.md` "After ONB-A1".
