# M11-A4 — first-spec implementation contract: Retribution Paladin

The scope boundary for M11-A4, derived in `m11-a3-authority-audit.md`. A4
implements exactly what is listed here and nothing that is listed as
excluded, deferred or blocked. If implementation evidence shows a line of
this contract is wrong, A4 stops and says so rather than widening.

## 1. Identity

| | |
| --- | --- |
| `specId` | `paladin/retribution` (joins `SPEC_IDS` and `INTERNAL_ONLY_SPEC_IDS`; NOT `PUBLIC_SPEC_IDS`, NOT the public contract enum, NOT `SUPPORTED_SPEC_IDENTITIES`) |
| Roster row | `simcSpecId` 70, `PALADIN_RETRIBUTION`, class 2, display name `Retribution Paladin`, role `DPS` (DBC role passive) |
| WCL identity | `wclClassName: "Paladin"`, `wclSpecName: "Retribution"` — read from the committed A7R6 fight-7 master data (actor 6) and gtKb fight-22 master data (actor 23) |
| `analyzerId` | `paladin-retribution-observed-decisions` (pattern of the Protection id) |
| Exposure | `INTERNAL_ONLY` |
| Sentinel migration | NONE required — the current unsupported subject is Warrior/Arms actor 4, unaffected |
| Layer | `src/specs/paladin/retribution/` (spec-level corpus root; `SPEC_LAYER_OF` gains one row); no import from `src/specs/paladin/protection/` in either direction |

## 2. Authority

| | |
| --- | --- |
| Source | `engine/class_modules/apl/apl_paladin.cpp`, region `//retribution_apl_start` .. `//retribution_apl_end` (lines 11–66 at the pin), `void retribution( player_t* p )` |
| Pin | `33622e9d1662ff0e451691edf85a6b49cc9d11d9` — the existing project pin; no re-pin |
| Source SHA-256 / bytes | `ed3fb1ac5b1c6c83bf21abbcaff5afe282678a69d51bdc953cc9897dca94bc02` / 10,081 (the same file Protection pinned; hash-verified again in A3) |
| Artifact | `src/simc/data/paladin-retribution.apl.json`, `authorityId` `SIMC_APL_PALADIN_RETRIBUTION`, `artifactRevision` `simc-33622e9d-1`, produced by `extract-simc-apl.mjs --target paladin-retribution` with a new TARGET profile whose `requiredFacts` pin the call graph: `default` (4) → `cooldowns` (11), `generators` (14) → `finishers` (4); `precombat` (8); NO `run_action_list`, NO `swap_action_list`, NO `cycle_targets`/`target_if`; `finishers` reached from `generators[0]` (gated) and `generators[5]` (unconditional) |
| Ownership | a second binding of `SIMC_APL` for `OFFENSIVE_ROTATION` under a DISTINCT authority id over shared provenance — the legal case `m11a2-decision-authority-ownership` proves; `DUPLICATE_DECISION_AUTHORITY_BINDING` must not fire |
| Domain | `OFFENSIVE_ROTATION` only. `RESOURCE_SPENDING`, `DEFENSIVE_COOLDOWN` (Divine Protection, Shield of Vengeance are observed but not judged), `INTERRUPT` (Rebuke) are declared capabilities resolving to the typed no-authority result, exactly as Protection does |

Supporting pinned datasets, all `--target paladin-retribution`, all at the
same pin, all hashed:

| Dataset | Generator | Contents A4 must pin |
| --- | --- | --- |
| `paladin-retribution-gcd-semantics.json` | `extract-simc-gcd.mjs` | `_gcd` of every APL action token and observed-only ability; token bindings: `templars_verdict` → {85256, 383328 Final Verdict} (`sc_paladin_retribution.cpp:666-669`), `divine_storm` 53385, `judgment` 20271, `hammer_of_wrath` 24275, `blade_of_justice` 184575, `wake_of_ashes` 255937, `divine_toll` 375576, `execution_sentence` 343527, `avenging_wrath` {31884, 231895 Crusade}, `rebuke` 96231 (gcd 0), `crusader_strike` 35395, `templar_strike`/`templar_slash`, `hammer_of_light`; meta lanes `auto_attack`, `potion`, `use_item`, `invoke_external_buff` |
| `paladin-retribution-talents.json` | `extract-simc-talents.mjs` | `final_verdict`, `crusading_strikes`, `templar_strikes`, `divine_storm`, `empyrean_legacy`, `hammer_of_wrath`, `divine_purpose`, `walk_into_light`, `radiant_glory`, `execution_sentence`, `holy_flames`, `crusade`, `divine_arbiter` (if a talent) and the Templar (48) / Herald of the Sun hero sub-trees for spec 70 |
| `paladin-retribution-cooldowns.json` | `extract-simc-ability-cooldowns.mjs` | DBC rows and the machine census of every passive modifier for Wake of Ashes (1 charge, 30,000 ms, category 2285), Divine Toll (60,000), Execution Sentence (60,000), Avenging Wrath (120,000 base — the census must explain the observed ~63 s spacing on actor 6 and bound the effective cooldown from below), Blade of Justice (1 charge, 12,000), Hammer of Wrath (1 charge, 7,500; +1 under Walk Into Light per the APL line), Judgment (1 charge, 11,000) |
| `paladin-retribution-spender-costs.json` | `extract-simc-power-costs.mjs` | Holy Power cost rows of Divine Storm, Templar's Verdict / Final Verdict; the `cost()` first-row rule |
| `paladin-retribution-item-effects.json`, `-enchant-effects.json` | existing extractors | both subjects' worn equipment: actor 6 trinkets 193762 / 250229 and the rest of its 17 items; actor 23 trinkets 270165 / 270175 (Voracious Heart of Ula'tek — already reviewed for the M10-B subject, driver 1297761); `algethar_puzzle_box` 193701 (not worn by either) |

## 3. First supported decision slice

**Observed Holy Power SPENDER decisions** — every COMPLETE cast of Divine
Storm or Templar's/Final Verdict by the actor — compared against the pinned
authority through (a) the nested-list unselectability proof and (b) the
shared first-GCD query.

Explicitly supported actions (eligible decision population): `divine_storm`,
`templars_verdict` (Final Verdict when talented).

Explicitly excluded from the decision population, each with its exclusion
reason on the payload exactly as Protection excludes NON_GCD and unbound
casts: `judgment`, `blade_of_justice`, `hammer_of_wrath`, `crusader_strike`,
`templar_strike`, `templar_slash`, `wake_of_ashes`, `divine_toll`,
`execution_sentence` (generator/cooldown decisions —
`OUTSIDE_FIRST_SLICE`), `avenging_wrath`, `rebuke`, `divine_protection`,
`shield_of_vengeance`, `divine_steed`, `lay_on_hands`, `word_of_glory`
(NON_GCD or no authority token), Crusading Strikes 408385 and melee swings
(`MELEE_SWING`/auto-attack products), `hammer_of_light` (Templar builds — see
§7).

Expected outcomes, in the shared vocabulary: `MATCH` =
AUTHORITY_COMPATIBLE_ONLY; `REJECTED` by unselectability (every entry naming
the observed token gated FALSE in every world — for `divine_storm` the single
entry `finishers[2]`; for `templars_verdict` never, its entry is
unconditional) or by a definite different selection with the competitor
PROVEN usable; `UNKNOWN` with the engine's blocker carried verbatim.

## 4. Required spec-owned state, vocabulary and bindings

`StateRequirements` on the offensive capability: `scope: PLAYER_CONTEXT`,
`resources: [HOLY_POWER]`, `evidenceCategories: ["CASTS", "RESOURCES",
"AURAS", "COMBATANT_INFO", "GEAR"]`, `targetModel: PER_OBSERVED_CAST`.

Vocabulary (`src/specs/paladin/retribution/vocabulary.ts`), declared only
for identifiers on lines the scan can reach; every declaration is
`BOOLEAN`/`NUMERIC` + scope + `selfAddressing` and binds a value ONLY where
evidence proves one:

| Identifier | Shape | Binding rule |
| --- | --- | --- |
| `holy_power` | NUMERIC, player | KNOWN from the spender cast's `classResources` type 9 pre-cost amount; UNKNOWN on a Divine Purpose free cast (no entry on the wire) |
| `variable.ds_castable` | BOOLEAN, player | the value expression `(active_enemies>=2\|buff.divine_arbiter_verdict.up)&!buff.empyrean_legacy.up&!buff.divine_arbiter_divine_storm.up` evaluated by the SHARED evaluator at the decision point with the aura atoms bound and `active_enemies` unbound; bound only when the result is TRUE or FALSE in every world, else left unbound (enumerated) |
| `active_enemies` | NUMERIC, player | NEVER bound. Declared so the variable expression parses; an unbound magnitude is `UNKNOWN`, never a count |
| `variable.pre_es_wake` | NUMERIC, player | KNOWN 0 — `op=reset,default=0` in precombat, never assigned in combat (the extractor's required facts must assert "no in-combat assignment") |
| `cooldown.hammer_of_wrath.charges` | NUMERIC, player | KNOWN only when a spec-owned charge state proves it (Protection `armament-state.ts` pattern); otherwise UNKNOWN |
| `gcd` | NUMERIC, player | `BOUNDED_NUMBER` ≥ 0.75 s from the pinned minimum GCD, or UNKNOWN; never a haste-derived point estimate |

NOT declared (the parse failure is the honest outcome): `raid_event.*`,
`trinket.*`, `equipped.*`, `variable.trinket_*`. Lines carrying them are
handled by readiness (proven cooldown), applicability (gear) or NON_GCD gate
irrelevance, never by evaluating them.

Aura bindings (`aura-bindings.ts`), each an M4 aura interval with apply and
remove observed under coverage; `up`/`down` only, never `remains`/`stack`
(unbindable built-ins):

| Atom | WCL aura | Pinned provenance |
| --- | --- | --- |
| `buff.empyrean_legacy.up` | 387178 | triggered on Avenging Wrath execute when the talent is taken (`sc_paladin.cpp:311-312`), consumed by a Verdict |
| `buff.divine_arbiter_verdict.up` | 1306161 | `sc_paladin.cpp:4322`, trigger/consume `sc_paladin.hpp:1666-1716` |
| `buff.divine_arbiter_divine_storm.up` | 1306162 | `sc_paladin.cpp:4320` |
| `buff.avenging_wrath.up` | 31884 (231895 under Crusade) | `sc_paladin.cpp:3626-3635` |
| Divine Purpose (free-cast route) | 408458 | `sc_paladin.hpp:1665-1676` |
| Hammer of Wrath readiness | 1241410 | SimC builds `buffs.hammer_of_wrath` from 1277026 (`sc_paladin.cpp:3684`); the log emits 1241410 applied/removed at exactly the Avenging Wrath timestamps on both subjects. A4 records this id correspondence as an EVIDENCE-BACKED binding with the three observed intervals as its proof, and refuses the readiness proofs if a capture ever shows 1277026 instead |

Usability proofs the slice needs (`action-profile.ts`):

- `divine_storm`, `templars_verdict`: PROVEN_USABLE when Holy Power KNOWN ≥
  pinned cost, or Divine Purpose proven up; PROVEN_UNUSABLE
  (`INSUFFICIENT_RESOURCE`) when KNOWN below cost with Divine Purpose proven
  down (only reachable for spender decisions on free casts — see §7).
- `hammer_of_wrath`: PROVEN_UNUSABLE (`REQUIRED_AURA_INACTIVE`) when 1241410
  is proven down (`sc_paladin.cpp:1799-1802`); `judgment`: PROVEN_UNUSABLE
  when 1241410 is proven up (`:1536-1539`).
- `wake_of_ashes`, `divine_toll`, `execution_sentence`, `avenging_wrath`,
  `blade_of_justice`: `ACTIVE_COOLDOWN` from the observed cast, the pinned
  base and the reviewed modifier census (lower bound only). Before the first
  observed cast of each: UNKNOWN.

Applicability proofs: `hammer_of_light` background unless the Templar tree
is active (`sc_paladin.cpp:2149`, the fact Protection already pins);
`crusader_strike` background under Crusading Strikes or Templar Strikes
(`:1072-1075`); `templar_strike`/`templar_slash` background without Templar
Strikes (`sc_paladin_retribution.cpp:962-963`); `divine_storm` background
without the talent (`:549-550`); `use_item,name=algethar_puzzle_box`
`ITEM_NOT_EQUIPPED`; `lights_judgment` / `fireblood` / `arcane_torrent`
`RACIAL_NOT_AVAILABLE_TO_RACE` per race world (§5).

Transitions (`paladin-retribution-transition-authority.ts`), Δt = 0 only:
`auto_attack`, `rebuke` (NON_GCD, gcd 0, writes nothing on the decision
projection), `potion`, `fireblood`, `avenging_wrath` (NON_GCD — triggers the
readiness aura and Empyrean Legacy: both ARE read on the path, so its
transition must write them; it fires only when its gate is decidable, and
its gate reads `raid_event.adds.up` — so in practice it is proven unusable
or the scan blocks), on-use trinket drivers reviewed per subject with the
Assassination item-gate-irrelevance precedent.

Scan-start boundary: `default[0] auto_attack`, `default[1] rebuke` proven
NON_GCD structurally (the Assassination `stealth`/`kick` precedent), so the
rotational scan begins at `default[2]`.

Unselectability proof: a Retribution-owned generalization of
`observed-action-gate` over the four lists (sound because the authority has
no `run_action_list`/`swap_action_list`; A4 re-checks that from the artifact,
never trusts the extractor's note).

Race worlds: NONE (superseded by §4a). The adapter explores one world; no
race is hypothesized, inferred or excluded.

## 4a. Amendment (2026-09-18) — the class/spec authority boundary

Adopted by the product owner during A4. The analyzer evaluates
class/spec/hero-talent rotational gameplay; the following entry categories
of the pinned list are OUTSIDE THE ROTATIONAL DECISION DOMAIN and cannot
preempt a supported class/spec action:

- racial actions (`lights_judgment`, `fireblood`, `arcane_torrent`, any other
  race-specific action);
- potions;
- trinket / `use_item` / `use_items` actions;
- profession actions;
- `invoke_external_buff` and other externally supplied actions;
- other non-class/spec preparation actions already outside the slice.

They stay in the pinned artifact for provenance and are classified as
non-domain BEFORE rotational authority selection, generically (no
race-specific or actor-specific special case). This is a domain-boundary
decision, not a claim that those actions were unavailable, and it removes
race/faction as an A4 dependency: no race or faction is inferred, §5 below
is superseded, and the one authorized `gameData.factions` lookup (run once
by a temporary probe, since removed from the tree; its outputs remain under
`.probe/m11a4-game-factions*.json` and `.probe/m11a4-faction-anchor-*`)
established only that the API's faction ids (1 Alliance, 2 Horde) are not
the encoding the `combatantinfo` event carries (0/1), and the two named
anchors contradicted each other — nothing was pinned from it, and
race/faction is NOT a promotion blocker (§9).

MATCH for this analyzer therefore means: the observed class/spec action is
compatible with the pinned Retribution class/spec rotational authority after
actions explicitly outside the supported rotational domain are excluded. It
is NOT "the exact next action the complete SimulationCraft profile would
execute including racials, items and consumables".

### Residual blocker found when the amended slice was re-derived

With the non-domain filter applied, every entry above the unconditional
`generators[5] call finishers` that can still preempt a spender is class/spec:
`cooldowns[9] execution_sentence`, `cooldowns[10] avenging_wrath`,
`generators[1] wake_of_ashes`, `generators[2] divine_toll` (all provable NOT
READY from observed casts under the pinned census —
`src/data/game/paladin-retribution-cooldowns.json`), and two that are not:

- `generators[3] blade_of_justice,if=(buff.art_of_war.stack=2|buff.righteous_cause.stack=2)&(!talent.walk_into_light|!buff.avenging_wrath.up)`
  — outside wings the gate is UNKNOWN because `buff.<x>.stack` is a shared
  built-in with NO binding field (always UNKNOWN), and its cooldown cannot
  be proven running because the census shows it HASTED (spec passive
  `A_HASTED_COOLDOWN` / `A_HASTED_CATEGORY` on category 2128) with an
  optional second charge (Improved Blade of Justice) — both refused by the
  cooldown bindings, as for Protection's hasted abilities;
- `generators[4] hammer_of_wrath,if=talent.walk_into_light&cooldown.hammer_of_wrath.charges=2`
  — under wings Hammer of Wrath is usable and its charge state is not
  soundly derivable (Final Verdict resets it on an unobservable proc,
  `sc_paladin_retribution.cpp:720-729`).

Both evidence subjects (A7R6 actor 6, gtKb actor 23) take Walk Into Light
and Crusade. So outside wings the Blade of Justice line competes and inside
wings the Hammer of Wrath line competes: no spender decision can reach a
definite scan under the shared evaluator as it stood, and MATCH is not
reproducible. The race-independent unselectability route (13 REJECTED on
actor 6 in the hand audit) is unaffected. The smallest principled unlock is
a GENERIC evaluator binding field for `buff.<x>.stack` (symmetric to
`knownBuffs`), which a specialization may bind to 0 for an aura M4 proves
INACTIVE or a build proves absent, never to a positive count — recorded
here for the owner's decision, and adopted as §4b.

## 4b. Amendment (2026-09-18) — the exact-known buff-stack binding

Adopted by the product owner after the residual blocker above was reported.
The shared evaluator gained `AtomBindings.knownBuffStacks`: a caller may
state a `buff.<name>.stack` value it has PROVEN exactly; the evaluator reads
it through the same lookup shape as `knownCooldownRemainsSeconds` and
compares it with the existing semantics. An unbound stack atom stays
UNKNOWN_NUMBER as before, no count is inferred from any other binding, and
no arithmetic or enumeration rule changed (`m11a4-known-buff-stacks`
pins the generic contract; the existing analyzers' outcomes are unchanged).

Retribution binds ONLY exact zero (`aura-bindings.ts`
`bindRetributionStackZero`), under two proofs:

- `PROVEN_INACTIVE` — M4's presence at the decision is EXACT INACTIVE (an
  observed removal under coverage; silence never reaches here);
- `TALENT_NOT_SELECTED` — the pinned build resolves the talent that
  PRODUCES the aura as NOT_SELECTED (an alternative entry at its choice
  node was observed), so the aura is impossible in the build.

An ACTIVE aura leaves the atom UNBOUND (no positive count is ever bound);
an UNKNOWN presence with an UNKNOWN or SELECTED talent leaves it UNBOUND.
Applied to `generators[3] blade_of_justice`'s gate: with Art of War proven
INACTIVE and Righteous Cause disproved at choice node 81523, the gate is
FALSE outside wings. Hammer of Wrath's charge count stays unbindable, so
inside-wings decisions remain UNKNOWN.

### A second open reading, and how it was settled

With race gone and the stacks bound, the next blocker was
`cooldowns[10] avenging_wrath`: its applicability depends on Radiant Glory,
a NORMAL node the three-way talent rule cannot disprove when absent
(UNKNOWN, never NOT_SELECTED), and an UNKNOWN applicability blocks the scan
before usability is consulted. The first implementation settled this with
a generic "observed cast of a bound ability ⇒ foreground" rule; the A4
review REJECTED it (a background or triggered action executes and may log a
cast — the generic statement is not universally true) and required the
implication to be established from pinned mechanics. It is, for this one
action: `paladin-retribution-foreground-execution-authority.ts` pins that
spell 31884 is executed only by the foreground constructor
(sc_paladin.cpp:282-294), the sole background/triggered wings action being
the distinct record 454351 (:275-280, :3304-3307; Wake of Ashes under
Radiant Glory, sc_paladin_retribution.cpp:846-851). An observed 31884 cast
is therefore a foreground execution under the pinned mechanics, and the
constructor's guards were false. The rule refines UNKNOWN → APPLICABLE only
for a token with such a fact and only on a cast of exactly the record the
fact names; a BACKGROUND reading is never converted (an observed
foreground-only cast under it is a contradiction and stays UNKNOWN); a token
without a fact keeps its reading whatever was cast. Dedicated tests pin
each case (`m11a4-retribution-bindings`). The production-path proof was
rerun without the generic rule: unchanged (1 MATCH, 10 REJECTED).

### Outcome of the G7 rerun through the production path

A7R6 fight 7 actor 6, 165 s, through `RETRIBUTION_PALADIN_REGISTRATION`:
69 eligible spender decisions — **1 MATCH** (Final Verdict at +104,407 ms,
`finishers[3]` exact entry), **10 REJECTED** (unselectability, two of them
also scan-selected `templars_verdict`), 58 UNKNOWN with the stopping entry
named. gtKb fight 22 actor 23, 20 s: 15 eligible, 15 UNKNOWN. The hand
audit's counts in §6 (6 MATCH, 2 scan-REJECTED, 13 unselectability-REJECTED)
assumed race worlds and positive stack facts the implementation does not
make; the production figures supersede them.

## 5. Identity dependency A4 must resolve or state: race / faction (SUPERSEDED by §4a)

This section is retained for the record; §4a removed race and faction as an
A4 dependency, and §9 no longer lists it as a promotion blocker.

`cooldowns[7] lights_judgment,if=!raid_event.adds.exists|…` is a
GCD-CONSUMING racial with an unparseable gate above every rotational entry.
In the Lightforged world it blocks every scan-route decision. Warcraft Logs
exposes no race; `combatantinfo.faction` is on the wire (A7R6 actor 6: `1`;
gtKb actor 23: `0`; both raids are mixed) but its semantics are not pinned
anywhere in this repository.

A4 may close this ONLY by a pinned fact, in order of preference:

1. a dated written Warcraft Logs statement of `combatantinfo.faction`
   semantics adopted as an adapter contract (the M10-C4 gear precedent), or
   one authorized `gameData { factions { id name } }` query if Brandon
   approves it in the A4 evidence plan — then Lightforged Draenei and Dark
   Iron Dwarf are excluded for a Horde player by `util::is_alliance`
   (`util.cpp:3511-3524`, local pinned copy);
2. a positively observed racial cast (excludes every other race world).

Until closed, the scan route yields `UNKNOWN` (blocker recorded) and only the
unselectability route resolves. That is acceptable for A4's INTERNAL_ONLY
landing; it is not acceptable for promotion.

## 6. Real evidence subjects, windows and expected outcomes

| Subject | Window | Sanitized artifacts A4 commits (SUBSET_SELECTION of the existing local pages, no new request) |
| --- | --- | --- |
| A7R6 fight 7 actor 6 (Paladin/Retribution, Herald of the Sun, Final Verdict, Crusading Strikes, Walk Into Light, Divine Purpose, Divine Arbiter four-piece) | `+0` .. `+165 s` from `.probe/m10b-pages.json` + `.probe/m10c5-phase-b-pages.json` | actor-6 slices with `retainedCoverage` grants for CASTS/RESOURCES/AURAS/COMBATANT_INFO/GEAR, provenance from the two capture plans' page facts |
| gtKb fight 22 actor 23 (Paladin/Retribution, Herald of the Sun) | `+0` .. `+20 s` from `.probe/m9c2-opener-pages.json` | actor-23 opener slice |

Expected resolvable decisions (from the A3 audit walk; A4 must reproduce
with the real engine, not assume). SUPERSEDED — the production-path result
is recorded in §4b: 1 MATCH (`+104.407`), 10 REJECTED, 58 UNKNOWN; the
list below is the historical prediction:

- `REJECTED` by unselectability, race-independent: Divine Storm at `+1.604`
  and `+63.778` (Empyrean Legacy up); Divine Storm at `+37.582`, `+77.210`,
  `+83.136`, `+84.141`, `+100.569`, `+101.793`, `+134.689`, `+135.706`,
  `+137.742`, `+138.754`, `+139.777` (`divine_arbiter_divine_storm` up).
- `MATCH` through the scan, race world excluded: Final Verdict at
  `+38.477`, `+79.246`, `+104.407`, `+141.812`; Divine Storm at `+13.394`,
  `+18.502`.
- `REJECTED` through the scan (authority selected `divine_storm`): Final
  Verdict at `+11.431`, `+16.524`.

Expected `UNKNOWN`, each with its named blocker: decisions with no arbiter or
Empyrean Legacy aura up (`ds_castable` undecidable — 25 in the window);
decisions while Divine Toll, Wake of Ashes, Execution Sentence or Avenging
Wrath is possibly ready or not yet observed (13); Walk-Into-Light Hammer of
Wrath competing under wings with unproven charges; a usable Blade of Justice
whose stack atoms are unbindable; Templar builds (none in the evidence).

Corpus plan: at least one `DECISION_COVERAGE` case expecting `MATCH` and one
expecting `REJECTED`, plus explicit `UNKNOWN` cases for each named blocker
category, all over `SANITIZED_CAPTURE` artifacts of actor 6 / actor 23 whose
identity the committed master data proves; the gate runs 2× workerd
byte-identical; the report records PASSED. The promotion-evidence gate then
REPORTS (does not fail) for the INTERNAL_ONLY registration.

## 7. Unsupported conditions and fail-closed behaviour

| Condition | Behaviour |
| --- | --- |
| `raid_event.*` on Wake of Ashes / Divine Toll / Execution Sentence / Avenging Wrath / Light's Judgment | never evaluated; the line is eliminated by proven readiness or the scan BLOCKS (`UNSUPPORTED_AUTHORITY_EXPRESSION`) |
| `active_enemies` | never bound; `ds_castable` resolves only when another conjunct settles it |
| `buff.*.stack` (Art of War, Righteous Cause) | bound to EXACT ZERO under §4b's two proofs; otherwise UNKNOWN (never a positive count). `buff.*.remains` and Avenging Wrath stacks under Crusade stay UNKNOWN |
| `generators[0]` gate | UNKNOWN by construction (bounded bare truth + unbindable remains); `finishers` is entered definitively through `generators[5]` only |
| Templar hero-tree builds | `hammer_of_light` applicable with unbindable `remains` atoms → spender decisions UNKNOWN; the slice does not claim Templar |
| Divine Purpose free casts | Holy Power not on the wire; usability rests on the Divine Purpose aura proof; `holy_power` atom UNKNOWN |
| Cooldown state before the first observed cast | UNKNOWN usability (no "ready at pull" assumption) |
| Race / faction | not read, not inferred, not a dependency (§4a): racial entries are outside the rotational decision domain |
| AoE | no target count; nothing about AoE is claimed |
| Movement, encounter actionability | inherited from the shared model; no Retribution-specific claim |

No Holy Power replay/reconstruction in A4: the spender decisions read the
amount from the wire. Generator decisions (which would need the discrete
reconstruction from `resourcechange` deltas and `waste`) are outside the
first slice — that reconstruction is a LATER spec-owned item, not shared
engine work.

## 8. Supplemental analyses

| Candidate | Class |
| --- | --- |
| `paladin/retribution.holy-power-waste` | A4_OPTIONAL — register through the module's `supplementalAnalyses` seam ONLY if A4 review agrees the seam's first exercise belongs here; result type only, no public output, no orchestration wiring beyond what the seam already permits |
| `empyrean-legacy-consumption`, `divine-arbiter-alternation`, `wake-of-ashes-cooldown-drift`, `execution-sentence-wake-alignment`, `avenging-wrath-usage` | LATER_M11 |
| `wings-hammer-of-wrath-window` | BLOCKED (charge model) |

## 9. Promotion evidence implications

Promotion to PUBLIC is NOT part of A4. It will require: committed
`SANITIZED_CAPTURE` decision cases with `MATCH` and `REJECTED` (A4 committed
both, and the promotion evidence gate reports the INTERNAL_ONLY module's
readiness from them); the five-site public move; a public projection
decision for `OUTSIDE_FIRST_SLICE` (an internal exclusion reason with no
public schema name); parity, schema and invariance checks; a limits prose
(`limitsProse`, drafted in `registration.ts` and not published) that states
the slice honestly (spender decisions only; Herald builds; no AoE; cooldown
decisions unjudged; racials, items and consumables outside the domain); and
— only after committed CI — separately authorized smoke. Race and faction
are NOT a promotion blocker (§4a).

> **Done — M11-A5 (2026-09-18).** The promotion was implemented as
> described: the gate reported `evidenceReady: true` from the four
> assertions above; the five-site move was made; the projection decision
> for `OUTSIDE_FIRST_SLICE` was the one authorized additive `analysis/1`
> widening, the spec-neutral public reason `OUTSIDE_SUPPORTED_SLICE`; the
> limits prose was reviewed, reworded to name the slice boundary, and is
> composed into both tool descriptions. See `agent/architecture.md`
> "M11-A5". Smoke remains separately authorized after committed CI.

## 10. What A4 must not do

No shared-engine change beyond the two amendments (`OUTSIDE_SUPPORTED_DECISION_DOMAIN`
as a shared applicability reason, §4a; `knownBuffStacks`, §4b):
`run_action_list`, target count, `raid_event`, generic variables, charges,
cast anchors, bounded-truth or bounded-arithmetic semantics and `remains`
binding fields each remain a separate engine milestone; no public exposure; no schema change; no Warcraft Logs
request beyond what §5 may explicitly authorize; no sentinel migration; no
Protection tree import; no Templar-build claim; no AoE claim; no Holy Power
reconstruction; no Ritual work.
