# Protection Paladin — internal observed-decision evaluator (M10-C)

**Exposure: `INTERNAL_ONLY`.** This evaluator is registered in the production
catalog (`paladin-protection-observed-decisions`, `paladin/protection`) and
is reachable only by `internalAnalyzerForSpec`, the corpus executor and
tests. The application service, raid-night orchestration, REST and MCP select
from the PUBLIC subset only; `paladin/protection` is not in `PUBLIC_SPEC_IDS`,
not in `SUPPORTED_SPEC_IDENTITIES`, and an analyzed result of this evaluator
throws `InternalSpecExposureError` at every public projector. Public
Protection Paladin analysis remains `SPEC_NOT_SUPPORTED`.

## What it answers

For one Protection Paladin's observed **GCD-consuming** foreground casts,
under the pinned `SIMC_APL_PALADIN_PROTECTION` artifact (`simc-33622e9d-1`):

    MATCH      the shared first-GCD query resolves the same action token
               — AUTHORITY_COMPATIBLE_ONLY, and nothing more
    REJECTED   every pinned entry naming the observed token is background for
               this player's proven build or gated FALSE in every enumerated
               world (`observed-action-gate.ts`)
    UNKNOWN    anything else, with the engine's own blocker carried verbatim

The six decision domains are represented separately on the payload
(`domains.ts`). Only `OFFENSIVE_ROTATION` has authority. `RESOURCE_SPENDING`,
`ACTIVE_MITIGATION`, `DEFENSIVE_COOLDOWN` and `SELF_HEALING` resolve to
`NO_PINNED_AUTHORITY_FOR_DOMAIN` from the registration's own authority access;
`INTERRUPT` resolves the same and also states the evidence family's capability
(`UNVERIFIED` on every committed capture). None of these is ever rendered as a
defensive verdict or as "no interrupts were used".

## The decision population, stated

Every COMPLETE cast by the actor, classified by pinned data:

| Cast | Classification |
| --- | --- |
| Warcraft Logs `melee` flag | excluded `MELEE_SWING` |
| pinned lane NON_GCD (Shield of the Righteous, Avenging Wrath / Sentinel, Ardent Defender, Hand of Reckoning, Divine Steed) | excluded `NON_GCD_ACTION` |
| no pinned lane record | excluded `EXECUTION_LANE_NOT_ESTABLISHED` |
| GCD lane, no authority token (Blessing of Spellwarding) | excluded `NO_AUTHORITY_TOKEN_BINDING` |
| GCD lane with an authority token | eligible → first-GCD query → comparison |

Shield of the Righteous is `_gcd` 0. Protection's primary spender is
therefore NON_GCD to the shared first-GCD question and is excluded from the
GCD decision population, exactly as a Rogue's Kick or Vanish is. Its Holy
Power is still recorded (below); it is not judged.

## Holy Power

Read once per foreground cast through M4's `observationOnEvent`, recorded on
the payload as `EXACT_PRE_COST { amount, max, cost }` where the wire carried an
entry and `NO_OBSERVATION` everywhere else. No replay, no regeneration, no
post-cost arithmetic, no cost pinned. Two real Shield of the Righteous casts
carry no entry: their occurrence proves they fired, not what the amount was.
Holy Power feeds no usability verdict at M10-C, because the spenders' cost is
not pinned and no non-spender cast observes it.

## The resolver seam

The shared parser admits the eleven identifiers `vocabulary.ts` declares
(`talent.righteous_protector.enabled`, `hero_tree.lightsmith`, `apex.3`,
`prev_gcd.1.divine_toll`, `next_armament`, `sacred_weapon`, `holy_bulwark`,
`consecration.up`, `full_recharge_time`, `charges`, `gcd`) as one generic
`SPEC_ATOM` node and nothing else; `resolver.ts` binds a value only where the
pinned data and the evidence prove one:

| Identifier | Bound when | Otherwise |
| --- | --- | --- |
| `talent.righteous_protector.enabled` | pinned three-way selection is SELECTED / NOT_SELECTED | unbound (enumerated) |
| `hero_tree.lightsmith` | observed entries belong to exactly one pinned sub-tree | unbound |
| `apex.3` | the third pinned tiered trait is SELECTED / NOT_SELECTED | unbound |
| `prev_gcd.1.divine_toll` | a previous GCD-lane cast is found by walking back over pinned lanes, stepping over melee swings and NON_GCD presses, under COMPLETE cast coverage between it and the decision | unbound |
| `next_armament` | hero tree resolved and not Lightsmith → KNOWN −1 | UNKNOWN_NUMBER / STATE_NOT_MODELLED |
| `sacred_weapon`, `holy_bulwark` | always: KNOWN 1 and 0 | — |
| `consecration.up` | never | unbound (enumerated) |
| `full_recharge_time`, `charges` (self-addressing), `gcd` | never | UNKNOWN_NUMBER / STATE_NOT_MODELLED |

Built-in atoms are unchanged: every `buff.<name>.*` and `debuff.<name>.up` is
enumerated (no Paladin aura identity is pinned), every
`cooldown.<name>.remains` is UNKNOWN_NUMBER (no Paladin cooldown is pinned).

## Applicability and usability

Applicability, from proven build facts and pinned gear facts only
(`action-profile.ts`): `hammer_of_the_righteous` is background under Blessed
Hammer; `holy_armaments` / `hammer_of_light` follow the hero tree;
`avenging_wrath` is `sentinel_t` under Sentinel and background with neither
talent; the two racials follow the correlated race world;
`use_item,name=<token>` is background when the named item is pinned and not
worn (`ITEM_NOT_EQUIPPED`); `use_items` is applicable when a pinned worn item
is on-use, background only when EVERY worn slot is closed with no use effect,
and UNKNOWN in between. An unknown build fact or an unpinned item excludes
nothing.

The sub-action set (`wornSubActionSet`) is the M10-C correction's central
fact. `use_items` builds a sub-action for a worn slot when its item, a gem OR
an enchant carries a use effect, so the set is CLOSED only when every worn
item is in `paladin-protection-item-effects.json` and every enchant and gem
key on the row is reported AND pinned in
`paladin-protection-enchant-effects.json`. The gear is read in its
NORMALIZED form only (M10-C4): an OMITTED `permanentEnchant`,
`temporaryEnchant` or `gems` key is KNOWN_NONE under the dated Warcraft Logs
contract `WCL_COMBATANT_INFO_GEAR_UI_SEMANTICS_2026_09_17`, decided once in
`combatant-info.ts` and nowhere else; a present-but-null, zero or malformed
value is UNKNOWN and leaves the slot OPEN (`*_STATE_NOT_REPORTED`) unless the pinned
use-effect UNIVERSE excludes the omission by type (M10-C2), or the shared
OBSERVATIONAL-EQUIVALENCE proof closes it (M10-C3). Every use-producing
enchant row of the build is pinned with its temporary / permanent-mask /
gem-borne placement AND its USE spell resolved (cooldown, cast time, effect
rows, SimulationCraft's generic buff/action reading, any `unique_gear*.cpp`
handler). An omitted `temporaryEnchant` is closed by type (none creates a
use effect). For an omitted `permanentEnchant` or `gems` key the candidate
set the pinned build admits is fed to `src/simc/subaction-equivalence.ts`
with this tree's policy (`subaction-candidates.ts`): stat and absorb buffs
are unobservable; damage, heal and attack procs are observable while Divine
Inspiration is not disproved, because its RPPM callback casts a Sacred
Weapon armament the list reads; resource, scripted and unresolved behaviour
is observable outright. On the M10-B subject every one of the 22 candidate
sets is DECISION-RELEVANT — three rows with no pinned placement have USE
spells absent from the pinned spell table, the waist and back admit real
tinkers that deal damage, heal, cast, or are scripted, and the nineteen
gem-borne rows include scripted, damage-only and zero-cooldown members — so
nothing closes, and the open slots carry the exact blocking candidates. On
the real subject none of that is reached any more: every identity is KNOWN
or KNOWN_NONE, the set closes to the one Ula'tek sub-action, and the census
and proof stand guard for payloads that carry null or malformed values. The Warcraft Logs placeholder row
for an empty slot (`{ id: 0, itemLevel: 0 }`, `isEmptyGearSlot`) is nothing,
not open.

Usability has exactly two proofs: the observed cast (`PROVEN_USABLE`) and a
hypothetical prefix execution (`PROVEN_UNUSABLE`, `SIMULATED_PREFIX_EXECUTION`).
Everything else is UNKNOWN. The observed cast is evidence for its own token at
its own position only; a later press is never an oracle for an earlier entry.

NON_GCD transition contracts (`paladin-protection-transition-authority.ts`,
consumed by `protectionContractForSelected` in `first-gcd-adapter.ts`):
`auto_attack`, `potion` and `fireblood` write only what the list never reads;
`avenging_wrath` (either record) writes `buff.avenging_wrath.up` TRUE and
`cooldown.avenging_wrath.remains` ≥ 120 s, which the adapter OVERLAYS on the
bindings in that branch (`overlayWings`, keyed off the prefix state);
`use_items` / `use_item` are admitted only for a CLOSED set holding exactly
the reviewed driver 1297761 (Voracious Heart of Ula'tek: a DETERMINISTIC
stat buff at the instant of use — RPPM disabled, default chance 1.0 — plus a
proc callback ARMED with the buff that fires `devour_morsel` only on later
hits, which is the only route by which Divine Inspiration could ever react to
it; 90 s own cooldown, 20 s shared category, both MODIFIERS_POSSIBLE so
readiness stays UNKNOWN before and after the observed press);
`shield_of_the_righteous` (M10-C4) spends the pinned cost of 3 Holy Power
(`paladin-protection-spender-costs.json`, `spell_data_t::cost` first-row
rule), starts its 1 s cooldown, and MAY change atoms the list reads —
`buff.shining_light_free`, `buff.divine_guidance.stack`,
`buff.blessed_assurance.up`, and through its own melee hit or Forge's
Reckoning the stochastic Divine Inspiration armament channel
(`next_armament`, `buff.sacred_weapon`) — so it is admitted ONLY while every
one of those is unbound (`requiresUnbound`; the engine then already
enumerates both truths) and refused the moment the caller binds one without
branching. Word of Glory still refuses its branch with `TRANSITION_UNSUPPORTED`.
Usability of a spender is PROVEN_UNUSABLE only when Holy Power is KNOWN below
the pinned cost and every free-cast route is disproved; it is never inferred
from an observed uncosted cast.

## Cooldowns and auras (M10-C5 Phase A)

Two Protection-owned bindings feed the shared engine from OBSERVED evidence
strictly before each decision, and nothing else:

- `cooldown-bindings.ts` derives `divine_toll` and `avenging_wrath` through
  the generic M4 cooldown primitive over the pinned
  `paladin-protection-cooldowns.json`. The pinned base is folded with the
  actor's censused static modifiers by the shared three-way talent rule —
  SELECTED applied exactly, NOT_SELECTED ignored, UNKNOWN applied only when
  it shortens (a lower bound) — and the dynamic absence proof is carried as
  the engine's modifier policy. `avenging_wrath` is an alias group (Sentinel
  389539 under the talent, Avenging Wrath 31884 otherwise): a cast of either
  member anchors it. Only PROVEN_NOT_READY is ever acted on
  (`ACTIVE_COOLDOWN` usability); READY is never claimed. The wings overlay
  binds the cooldown atom to the actor's effective base, never the raw DBC
  value.
- `aura-bindings.ts` binds `buff.avenging_wrath` from the Sentinel aura
  (`paladin-protection-aura-authority.ts`: under Sentinel the expression is
  rewritten to `buff.sentinel`, whose buff IS spell 389539) through M4's
  `presenceAt` — ACTIVE from an observed application, INACTIVE from an
  observed removal, UNBOUND otherwise. Without Sentinel the identity is not
  pinned (Radiant Glory would change the record) and the atom stays unbound.

## What the real evidence yields

Over `wcl-protection-paladin-a7r6-opener`: 21 eligible decisions, all
UNKNOWN. After M10-C4 the scan passes `default[1] use_item`
(NOT_APPLICABLE), transitions `default[2] use_items` (closed under the dated
gear contract), `potion`, `avenging_wrath`, `fireblood` and `default[8]
shield_of_the_righteous`, and then meets the GCD candidates whose readiness
the 22 s window cannot establish; the branches that assume each fires select
different entries (`default[6] divine_toll` where wings fired, `default[9]
holy_armaments` otherwise), so every decision is `DIVERGENT_GCD_OUTCOMES`
under the public DIVERGENT_WORLDS class; 24 exclusions; five exact Holy Power observations; Lightsmith,
Righteous Protector, Sentinel, Avenging Wrath, Blessed Hammer resolved from
the tree. Zero resolved decisions is the measured coverage and is disclosed
rather than flattered. A HYPOTHESIS case in the evaluator test turns the
gear identities UNKNOWN and shows `default[2] use_items` refusing again with
its exact blocking candidates. MATCH and REJECTED are proven on labelled
SYNTHETIC premises in `tests/contracts/m10c-protection-evaluator.test.ts`,
including a Shield of the Righteous prefix that converges and one that
diverges.

On the opener alone M10-C was INCOMPLETE by its own acceptance rule: no
real eligible decision resolved, because the readiness of the GCD candidates
at the decision — Divine Toll's cooldown state at pull, the Lightsmith
alternation — is outside a 22 s log.

Over `wcl-protection-paladin-a7r6-rotational-45s` (M10-C5 Phase A, the whole
45-second capture of the same subject): 47 eligible decisions, 1 MATCH, 0
REJECTED, 46 UNKNOWN. The MATCH is the Divine Toll press at 2,026,655
(+22,066 ms), selected by the exact entry `default[6] divine_toll`: the
Sentinel press 414 ms earlier proves wings cannot fire (at least 59,586 ms of
a 60,000 ms effective base remain — 120,000 ms halved by the SELECTED
Righteous Protector, per the census), the Sentinel aura M4 observed applied
binds `buff.avenging_wrath.up` TRUE, and the press itself proves Divine
Toll usable; all three race worlds agree. The 46 UNKNOWN keep exact blockers:
21 at `default[6] divine_toll` (before the Sentinel press: no anchor of any
kind) and 25 at `default[9] holy_armaments` (after the Divine Toll press,
whose cooldown is then PROVEN_NOT_READY from its own cast, the next honest
blocker is `next_armament`, which only an observed Holy Armaments hardcast
could anchor — none occurs in the window). The predeclared gap derivative
(everything before 2,026,589 removed) restores UNKNOWN for the same press.
No later event is ever consulted: the same Sentinel press proves nothing
for the Blessed Hammer 384 ms before it.

M10-C's acceptance rule (`real MATCH + real REJECTED > 0`) is met on this
evidence with exactly one real MATCH. Rotational steady state below
`default[9]` remains unmeasured: `next_armament` is anchor-only, and the
Judgment / Hammer of Wrath / Avenger's Shield readiness after a full cooldown
cycle needs a longer capture (Phase B, not authorized).

## Not here, on purpose

No cooldown data beyond Divine Toll and wings, no aura identity beyond the
Sentinel aura, no spender cost, no mitigation or health model, no defensive,
self-healing or interrupt judgment, no top-log or performance input, no
public exposure, and no inference from an absent gear key. Each is a
recorded missing fact, and each blocks the affected decision closed rather
than pressuring a guess.

Public projection is planned, not performed: `registration.ts` records how
`MELEE_SWING` (→ `NON_GCD_ACTION`: a positively identified swing is off the
GCD, scheduled by the pinned NON_GCD `auto_attack`; it is not an unknown
lane) and the `TRANSITION_UNSUPPORTED` raw blocker (→ class `OTHER`, raw
withheld) land in schema v1 without a public vocabulary change, and names the
one alternative (a new public reason) as an M10-D design gate.
