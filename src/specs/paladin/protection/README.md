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
| `next_armament` | hero tree resolved and not Lightsmith → KNOWN −1; Lightsmith → KNOWN 0 / 1 from the last Holy Armaments hardcast strictly before the decision under complete cast coverage since (`armament-state.ts`) | UNKNOWN_NUMBER / STATE_NOT_ESTABLISHED (Lightsmith, no anchor) or STATE_NOT_MODELLED (tree unresolved) |
| `sacred_weapon`, `holy_bulwark` | always: KNOWN 1 and 0 | — |
| `consecration.up` | the last Consecration cast and the pinned ground-effect lifetime decide TRUE or FALSE (see below) | unbound (enumerated) |
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
Reckoning the Divine Inspiration armament channel (`buff.sacred_weapon`).
Those are its `requiresUnbound` atoms, and since M10-C5 Phase B they mean
what the name says: the SUCCESSOR state of a branch that executed the
contract FORGETS exactly those atoms (`forgottenAtoms` in
`first-gcd-state.ts`; `forgetAtoms` in the adapter strips them from the
caller's bindings for that branch), so the engine enumerates them again
while every unrelated binding stays. A caller's binding of such an atom is
no longer a refusal. `next_armament` was listed at M10-C4 on the claim that
a Divine Inspiration proc flips the alternation; the pinned source says the
proc advances `divine_inspiration_next` and only an LS_HARDCAST advances
`next_armament` (sc_paladin.cpp:2641, 2752-2753), so the claim was
withdrawn. Word of Glory still refuses its branch with
`TRANSITION_UNSUPPORTED`.
Usability of a spender is PROVEN_UNUSABLE only when Holy Power is KNOWN below
the pinned cost and every free-cast route is disproved; it is never inferred
from an observed uncosted cast.

## Cooldowns and auras (M10-C5 Phase A and Phase B)

Protection-owned bindings feed the shared engine from OBSERVED evidence
strictly before each decision, or from the observed BUILD, and nothing else:

- `cooldown-bindings.ts` derives `divine_toll`, `avenging_wrath`,
  `avengers_shield` and `consecration` through the generic M4 cooldown
  primitive over the pinned `paladin-protection-cooldowns.json`. The pinned
  base is folded with the actor's censused static modifiers by the shared
  three-way talent rule — SELECTED applied exactly, NOT_SELECTED ignored,
  UNKNOWN applied only when it shortens (a lower bound) — and the dynamic
  absence proof is carried as the engine's modifier policy. `avenging_wrath`
  is an alias group (Sentinel 389539 under the talent, Avenging Wrath 31884
  otherwise): a cast of either member anchors it. Only PROVEN_NOT_READY is
  ever acted on (`ACTIVE_COOLDOWN` usability); READY is never claimed. The
  wings overlay binds the cooldown atom to the actor's effective base, never
  the raw DBC value.

  Phase B's census (`extract-simc-ability-cooldowns.mjs`) reads the SPEC and
  CLASS passives `parse_all_class_passives` registers, not only traits: the
  spec passive "Protection Paladin" (137028) hastes Avenger's Shield,
  Consecration and Shield of the Righteous, and the rank passive
  "Consecration" (327980) halves Consecration's cooldown. A HASTED modifier
  refuses the base — no haste model exists — so both tokens derive
  `UNKNOWN` / `MODIFIERS_NOT_PROVEN_ABSENT` by design, and that refusal is
  what blocks `default[13]`, `default[15]` and `default[18]` on the real
  evidence. The Grand Crusader reset of Avenger's Shield is a DECLARED
  dynamic mutation with an observable signature (aura 85416 on the actor):
  `dynamicMutationsAbsent` proves it absent only under complete AURAS
  coverage with no application between the anchor and the decision. The
  policy is ready for the day a haste model exists; it manufactures nothing
  today.
- `bindGroundEffectPresence` (same module) binds `consecration.up` —
  SimulationCraft's `active_consecration != nullptr`, whether the actor's own
  hardcast Consecration is alive, not whether they stand in it — from the
  last observed Consecration cast and the pinned lifetime. The duration is
  spell 26573's DBC `_duration` (12,000 ms) plus Consecration in Flame's
  P_DURATION effect (+2,000 ms, applied by SimulationCraft's passive parser
  to `data().duration()`, which `consecration_t` reads as `cons_duration`),
  so 14,000 ms under this build. The effect is NOT alive for the whole
  duration: `active_consecration` is cleared on EVENT_DESTRUCTED, which
  `ground_aoe_event_t::execute` fires at EVERY pulse, and another pulse is
  scheduled only while at least one hasted tick (1,000 ms base, shortened
  by spell haste) remains — the pointer dies at the LAST pulse, inside
  (D − 1,000 ms, D]. Without a haste model the binder therefore claims TRUE
  only while elapsed ≤ D − 1,000 ms (13,000 ms here), FALSE only after D
  under complete CASTS coverage over the whole lookback, and UNKNOWN in
  between (`ELAPSED_INSIDE_LAST_PULSE_ALLOWANCE`,
  `ELAPSED_INSIDE_DURATION_UNCERTAINTY`, `ELAPSED_AT_DURATION_BOUNDARY`) or
  whenever the cast state is not established. The lifetime facts are read
  mechanically from the pinned `engine/player/ground_aoe.{hpp,cpp}` and
  `sc_paladin.cpp` by the extractor (`groundEffect.lifetime`), and no player
  aura is consulted.
- `aura-bindings.ts` binds `buff.avenging_wrath` from the Sentinel aura
  (`paladin-protection-aura-authority.ts`: under Sentinel the expression is
  rewritten to `buff.sentinel`, whose buff IS spell 389539),
  `buff.vanguard` from 1268810 under `apex.1` (Glory of the Vanguard), and
  the Hammer of Wrath READINESS aura 1277026 (not an APL buff atom: it is
  what `hammer_of_wrath_t::ready()` requires outside wings), each through
  M4's `presenceAt` — ACTIVE from an observed application, INACTIVE from an
  observed removal, UNBOUND otherwise. The query is by POSITION, so an aura
  the decision's own cast applies at the same millisecond is visible to the
  next decision and never to the cast that caused it. A BOUND `up: false`
  reading of the readiness aura is the ONLY thing that makes Hammer of
  Wrath PROVEN_UNUSABLE (`REQUIRED_AURA_INACTIVE`); silence never does.
- `build-absences.ts` binds FALSE from the observed TALENT TREE, behind a
  gate the tree establishes: `hammer_of_light_ready`, `hammer_of_light_free`
  and `undisputed_ruling` under a RESOLVED non-Templar hero tree, and
  `blessed_assurance` when the choice node holds Divine Guidance. An
  unresolved tree or an UNKNOWN talent refuses
  (`BUILD_GATE_NOT_ESTABLISHED`). This module is the one place in the tree
  that spells `up: false` as a literal, and it never reads the aura stream.
- `armament-state.ts` is the coverage-gated `next_armament` state machine:
  KNOWN only from the last Holy Armaments HARDCAST strictly before the
  decision (the log records a press under the armament it produced — Holy
  Bulwark 432459 or Sacred Weapon 432472, both bound to the
  `holy_armaments` token) under COMPLETE cast coverage since; a buff
  transition never anchors it, a later hardcast never speaks about an
  earlier decision, and a declared coverage hole resets it to UNKNOWN. The
  resolver binds the atom from it or refuses with `STATE_NOT_ESTABLISHED`.

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
evidence with exactly one real MATCH.

Over the composed 165-second fight (M10-C5 Phase B2: the byte-identical 45 s
slice joined to four measured segments through a machine-validated zero-event
certificate for [2,049,582 .. 2,049,588], evaluated inside [+120 s, +165 s]):
37 eligible decisions, 1 MATCH, 0 REJECTED, 36 UNKNOWN. The MATCH is the
Avenger's Shield press at 2,139,100 (+134,511 ms), selected by the exact
entry `default[13] avengers_shield` under `buff.vanguard.up` — bound TRUE by
the Vanguard aura M4 observed applied at 2,131,157 — with every higher entry
resolved: Divine Toll and wings PROVEN_NOT_READY from their presses at
2,088,835 / 2,088,344, the three Templar-only gates FALSE by the observed
build, `next_armament` KNOWN holy_bulwark from the Sacred Weapon hardcast at
2,125,600, and `default[11] hammer_of_wrath` PROVEN_UNUSABLE because its
readiness aura was observed removed at 2,106,345. The same rule resolves the
Avenger's Shield press at 2,074,381 in the history, so the whole 165 s holds
149 eligible decisions with 4 MATCH (two Divine Toll, two Avenger's Shield)
and 145 UNKNOWN. The prediction made at Phase B1 — that the Judgment at
2,131,157 would converge through every higher entry — is DISPROVED: it blocks
at `default[15] consecration`, whose gate reads a stack count no binding
field carries and whose readiness is hasted. The 36 UNKNOWN in the window
block at 18 × `default[6]` (from 2,148,837 the Divine Toll and wings lower
bounds have elapsed), 9 × `default[15]`, 5 × `default[13]` (Vanguard up,
Avenger's Shield's own hasted cooldown unknown), 3 × `default[14]`, 1 ×
`default[9]`. The gap bundle — the 60–120 s segments omitted with the hole
declared — returns every decision in the window to `default[6]` and the
Avenger's Shield press to UNKNOWN: no anchor, no aura transition, no
alternation and no ground-effect lookback carries across a declared hole.

Deferred, each a recorded refusal rather than a guess: a charge engine
(`default[23]`, `charges`, `full_recharge_time` beyond need), GCD intervals,
haste and rating conversion, Divine Guidance stacks, Sacred Weapon remains,
READY inference, and public projection.

## Not here, on purpose

No cooldown data beyond Divine Toll, wings, Avenger's Shield and
Consecration, no haste or charge model, no aura identity beyond the Sentinel,
Vanguard and Hammer of Wrath readiness auras, no stack counts, no mitigation
or health model, no defensive, self-healing or interrupt judgment, no top-log
or performance input, no public exposure, and no inference from an absent
gear key. Each is a
recorded missing fact, and each blocks the affected decision closed rather
than pressuring a guess.

Public projection is planned, not performed: `registration.ts` records how
`MELEE_SWING` (→ `NON_GCD_ACTION`: a positively identified swing is off the
GCD, scheduled by the pinned NON_GCD `auto_attack`; it is not an unknown
lane) and the `TRANSITION_UNSUPPORTED` raw blocker (→ class `OTHER`, raw
withheld) land in schema v1 without a public vocabulary change, and names the
one alternative (a new public reason) as an M10-D design gate.
