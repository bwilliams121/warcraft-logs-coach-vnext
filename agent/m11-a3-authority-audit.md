# M11-A3 — Authority audit and first-spec selection

Audit/selection milestone. Nothing here changes production: no analyzer, no
`SpecId`, no registration, no schema, no engine capability. The document
records what was inspected, at which pinned revision, what the shared engine
can and cannot do with it today, and which ordinary M11 specialization can
truthfully become the first `INTERNAL_ONLY` analyzer in M11-A4. Companion
documents: `m11-spec-coaching-inventory.md` (the deep-dive question
framework and the thirty-spec backlog) and `m11-a4-first-spec-contract.md`
(the bounded implementation contract for the selected specialization).

## 1. Entry state

| | |
| --- | --- |
| Baseline | `0fb25d586758ad255f3036f9643fb0c8c2e9998d` — `feat: build M11 spec onboarding foundation` (M11-A2) on `main`, up to date with `origin/main` |
| CI | Confirmed green for that exact commit by Brandon at the start of A3 (no run id was supplied; none was fetched — A3 does not authenticate to GitHub) |
| Working tree at entry | No staged, modified or deleted tracked files; exactly the five preserved untracked files (`scripts/probe/wcl-external-candidate.probe.ts`, `scripts/probe/wcl-rankings-schema.probe.ts`, `scripts/probe/wcl-rankings-shape.probe.ts`, `smoke-mcp.json`, `smoke-rest.json`) |
| `.probe/` | Ignored (`.gitignore:8`), untouched, plus ONE new isolated directory `.probe/m11a3-authority-audit/` holding the fetched audit sources listed in §3 |

Population entering A3, derived from the committed roster
(`src/data/game/spec-roster.json`, 40 playable rows): 2 PUBLIC
(`rogue/assassination`, `paladin/protection`), 0 INTERNAL_ONLY, 30 ordinary
DPS/tank specializations for M11, 7 healers for M12 (the six `HEALER` rows
plus Preservation Evoker, whose roster role is `UNKNOWN`), 1 Augmentation
Evoker for M13 (roster role `UNKNOWN`). Devastation Evoker (roster role
`UNKNOWN`) is in the ordinary M11 population. The roster cannot decide the
three Evoker rows; the M11/M12/M13 placement of those three is a declared
product classification, pinned by the test-owned inventory
(`tests/support/m11/coaching-inventory.json`) rather than remembered.

## 2. Existing real evidence (no Warcraft Logs request was made)

### 2.1 Committed `SANITIZED_CAPTURE` evidence

Every committed event artifact is actor 19 / 25 (Assassination), actor 7
(Protection, A7R6) or actor 5 (Protection, `qJ1pgB49ZrRNVmCd` fight 6 —
`tests/corpus/PROVENANCE-legacy.md` "Source capture" table). The one
artifact touching an ordinary M11 identity,
`wcl-pet-sourced-events-hunter-pet-29` (pet 29 of actor 20, Beast Mastery),
holds 4 `resourcechange` and 1 `applybuff` events of actor 20 and no cast.
**No committed sanitized evidence can exercise an observed rotational
decision for any ordinary M11 specialization.** Every M11 candidate is
therefore `LOCAL_RAW_EVIDENCE_ONLY` or `NO_KNOWN_REAL_EVIDENCE` today.

The two committed fight-context artifacts DO establish identity
mechanically for every player in two fights (`masterData.actors[].subType`
and `fights[].friendlySpecs`, the same route the unsupported-subject test
uses):

### 2.2 Local raw evidence (gitignored, already present, no new request)

| Capture | Report / fight | Window | Provenance |
| --- | --- | --- | --- |
| `.probe/m10b-pages.json` | `A7R6kxPJ1hC8YQ4w` fight 7 (Ula'tek, encounter 3445, difficulty 5, kill, 424,514 ms), revision 30 | pull `2,004,589` .. `+44.992 s`, 30,588 events, terminal | M10-B capture plan, `dataType All`, actor-unfiltered, `includeResources` |
| `.probe/m10c5-phase-b-pages.json` | same | `+45.001 s` .. `+164.999 s`, 68,870 events, 7 pages, terminal, revision 30 before and after | M10-C5 Phase B1 plan (`.probe/m10c5-phase-b-capture-plan.md`), `dataType All`, actor-unfiltered |
| `.probe/m9c2-opener-pages.json` | `gtKb2xHn87pNcFfW` fight 22 (Sszorak, encounter 3420, difficulty 4, kill, 284,791 ms), revision 22 | pull `2,415,041` .. `+20.000 s`, 18,318 events, 2 pages, terminal | M9-C2 capture, `dataType All`, actor-unfiltered |

Because the streams are actor-unfiltered, every player of both fights has a
`combatantinfo` at the pull (talent tree, gear, stats, `faction`), casts,
own resource snapshots on casts, `resourcechange` events and aura events
inside the windows. A per-actor slice is a `SUBSET_SELECTION` of an existing
capture — exactly how the committed Protection artifacts were produced from
the same pages — so **A4 evidence work for any of these identities needs no
new Warcraft Logs request.**

### 2.3 Ordinary M11 identities with real evidence

| specId | Report | Fight | Source | WCL class / spec | Window | Casts in window | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `paladin/retribution` | A7R6 | 7 | 6 | Paladin / Retribution | 0–165 s | 236 (105 Crusading Strikes, 43 Final Verdict, 26 Divine Storm, 16 Blade of Justice, 14 Judgment, 13 Hammer of Wrath, 5 Wake of Ashes, 3 Avenging Wrath, 3 Execution Sentence, 3 Divine Toll, …) | LOCAL_RAW_EVIDENCE_ONLY |
| `paladin/retribution` | gtKb | 22 | 23 | Paladin / Retribution | 0–20 s | 48 | LOCAL_RAW_EVIDENCE_ONLY |
| `warrior/arms` | A7R6 | 7 | 4 | Warrior / Arms | 0–165 s | 248 | LOCAL_RAW_EVIDENCE_ONLY (the current unsupported sentinel; NOT migrated in A3) |
| `warrior/arms` | gtKb | 22 | 12, 5 | Warrior / Arms | 0–20 s | 42, 47 | LOCAL_RAW_EVIDENCE_ONLY |
| `deathknight/blood` | A7R6 | 7 | 14 | DeathKnight / Blood | 0–165 s | 271 | LOCAL_RAW_EVIDENCE_ONLY |
| `deathknight/blood` | gtKb | 22 | 14 | DeathKnight / Blood | 0–20 s | 51 | LOCAL_RAW_EVIDENCE_ONLY |
| `deathknight/frost` | gtKb | 22 | 26 | DeathKnight / Frost | 0–20 s | 53 | LOCAL_RAW_EVIDENCE_ONLY |
| `shaman/elemental` | A7R6 | 7 | 8, 16 | Shaman / Elemental | 0–165 s | 138, 123 | LOCAL_RAW_EVIDENCE_ONLY |
| `shaman/elemental` | gtKb | 22 | 19, 9 | Shaman / Elemental | 0–20 s | 24, 22 | LOCAL_RAW_EVIDENCE_ONLY |
| `mage/fire` | A7R6 | 7 | 17 | Mage / Fire | 0–165 s | 171 | LOCAL_RAW_EVIDENCE_ONLY |
| `mage/arcane` | A7R6 | 7 | 3 | Mage / Arcane | 0–165 s | 129 | LOCAL_RAW_EVIDENCE_ONLY |
| `mage/arcane` | gtKb | 22 | 1 | Mage / Arcane | 0–20 s | 23 | LOCAL_RAW_EVIDENCE_ONLY |
| `druid/feral` | A7R6 | 7 | 1 | Druid / Feral | 0–165 s | 352 | LOCAL_RAW_EVIDENCE_ONLY |
| `druid/balance` | gtKb | 22 | 27 | Druid / Balance | 0–20 s | 14 | LOCAL_RAW_EVIDENCE_ONLY |
| `evoker/devastation` | A7R6 | 7 | 11 | Evoker / Devastation | 0–165 s | 111 | LOCAL_RAW_EVIDENCE_ONLY |
| `evoker/devastation` | gtKb | 22 | 33 | Evoker / Devastation | 0–20 s | 16 | LOCAL_RAW_EVIDENCE_ONLY |
| `warlock/destruction` | A7R6 | 7 | 15, 12 | Warlock / Destruction | 0–165 s | 117, 136 | LOCAL_RAW_EVIDENCE_ONLY |
| `warlock/demonology` | gtKb | 22 | 10, 3, 7 | Warlock / Demonology | 0–20 s | 23, 23, 22 | LOCAL_RAW_EVIDENCE_ONLY |
| `hunter/beast_mastery` | A7R6 | 7 | 20 | Hunter / BeastMastery | 0–165 s | 146 | LOCAL_RAW_EVIDENCE_ONLY (+ committed pet-29 artifact, no cast) |
| `hunter/beast_mastery` | gtKb | 22 | 13 | Hunter / BeastMastery | 0–20 s | 23 | LOCAL_RAW_EVIDENCE_ONLY |
| `demonhunter/havoc` | A7R6 | 7 | 18 | DemonHunter / Havoc | 0–165 s | 269 | LOCAL_RAW_EVIDENCE_ONLY |
| `demonhunter/devourer` | gtKb | 22 | 32 | DemonHunter / Devourer | 0–20 s | 60 | LOCAL_RAW_EVIDENCE_ONLY |
| `priest/shadow` | gtKb | 22 | 29 | Priest / Shadow | 0–20 s | 57 | LOCAL_RAW_EVIDENCE_ONLY |
| `monk/brewmaster` | gtKb | 22 | 4 | Monk / Brewmaster | 0–20 s | 33 | LOCAL_RAW_EVIDENCE_ONLY |

Thirteen ordinary M11 specializations have `NO_KNOWN_REAL_EVIDENCE`:
Fury, Protection Warrior, Unholy, Outlaw, Subtlety, Enhancement, Windwalker,
Marksmanship, Survival, Frost Mage, Affliction, Guardian, Vengeance.

No evidence was paired across actors or specializations; identity is read
from the committed master data only. Cast counts above are the audit's own
census of the raw pages (`type: "cast"`, `sourceID` = actor).

## 3. Authority retrieval (exact pin, read-only, non-production)

Pin: `33622e9d1662ff0e451691edf85a6b49cc9d11d9` (repository
`simulationcraft/simc`). Every file below was fetched from
`https://raw.githubusercontent.com/simulationcraft/simc/<pin>/<path>` into
the ignored directory `.probe/m11a3-authority-audit/`; two directory
listings (`/contents/engine/class_modules/apl`, `/contents/engine/class_modules`
at `?ref=<pin>`) were read to find where each class keeps its lists. No
branch, tag, `main` or `midnight` reference was used; no WCL, rankings or
guide was fetched; no fetched byte entered `src/`.

| Path (under `engine/class_modules/`) | Bytes | SHA-256 | Regions audited |
| --- | --- | --- | --- |
| `apl/apl_death_knight.cpp` | 36,557 | `e381da691875ceecb8357a76e90fef9e01f3a200c67da7024deff1ca7f728df6` | `blood`, `frost`, `unholy` |
| `apl/apl_demon_hunter.cpp` | 56,505 | `c95ab0af6cfce46c64304903a7e8c65417beb01ff69f661beb727b9e23b4b389` | `havoc`, `devourer`, `vengeance` |
| `apl/apl_evoker.cpp` | 42,774 | `84086fb5b6c3e40e28859c2e4ca3ee13e70b8bee0ca64cab69fedd7819b93c4b` | `devastation` only (Preservation and Augmentation regions were not inspected) |
| `apl/apl_hunter.cpp` | 51,094 | `8d7b7273ac056d1b28154cd9342db48cd95c643c215e5731c6b770c2e49facbb` | `beast_mastery`, `marksmanship`, `survival` |
| `apl/apl_monk.cpp` | 39,549 | `a8b7e2afe48425089cdc97a369fc4abe87784a818d0423ba0706fb60f1f53c20` | `namespace brewmaster` (lines 12–128), `namespace windwalker` (130–346); no region markers — Mistweaver is not in this file |
| `apl/apl_priest.cpp` | 38,115 | `eff8fcc1db8f4ff8a992a48f7c66fc1595cd7b6ca7b0136b12020e9fd0540516` | `shadow` only (Discipline/Holy regions not inspected) |
| `apl/apl_shaman.cpp` | 25,414 | `71f38c728fdba909d3a807139c538aedad7a63bec56a15ad64647b5a29630f65` | `elemental` (the file holds no Enhancement list) |
| `sc_shaman.cpp` | 450,570 | `0ca278a862eb9ceb8aba2255bceb534955a9e5ed83c9b81ec35b2a0f86763bd0` | `shaman_t::init_action_list_enhancement()` (lines 13,379–13,525) |
| `apl/apl_warrior.cpp` | 30,516 | `bc9473e51e3d4d233793d6d165eb0165183f61eebde5c119ddd8aaa7b1202ec1` | `fury`, `arms`, `protection` |
| `apl/mage.cpp` | 40,053 | `b0310f97988f53af34507015d8adda68606c2401466f534430c876676b72c578` | `arcane`, `fire`, `frost` |
| `apl/warlock.cpp` | 33,759 | `09f2bb54304a3886a87aae18931bf2214f56882a88c074c7e77f730ed3e51bda` | `affliction`, `demonology`, `destruction` |
| `apl/druid/druid.cpp` | 926 | `dea8183f92e3a0da438e763355de6a41509d53930360287a05797994940ef28c` | the `#include` dispatch to the `.inc` lists |
| `apl/druid/feral_apl.inc` | 17,108 | `d4a1274f99c10bdde08d5a36832b2b20b898a09b35d2d10258aca3fa7b6fcbfb` | Feral |
| `apl/druid/balance_apl.inc` | 12,928 | `9b481c5f42e9671941adfabd44f6a02a3912b42dc5c2d191cc4629873aa54525` | Balance |
| `apl/druid/guardian_apl.inc` | 7,485 | `043060505e79c04478064a49ccbf3bb92f8b363bd4d88007d082c3966f44e5e7` | Guardian |
| `apl/retribution_apl.inc` | 6,195 | `22e21f1f56ce9152d9abd19a31b0c0cd12da857015236cea9648014a1ecd5239` | the human-edited source of the Retribution list (the compiled authority is the `apl_paladin.cpp` region below) |
| `paladin/sc_paladin_retribution.cpp` | 43,269 | `ea2e9c704ff6b5f1d67b9d5017a1362a3f8bd6e9d9cf96ebcf571dc43f70cfd9` | Retribution module: build-dependent `background` rules, `ready()` overrides |

Already local at the same pin and hash-verified again in A3 (not re-fetched):
`.probe/m10b-simc-apl_paladin.cpp` (10,081 B,
`ed3fb1ac5b1c6c83bf21abbcaff5afe282678a69d51bdc953cc9897dca94bc02`, the
`//retribution_apl_start .. //retribution_apl_end` region at lines 11–66 is
the Retribution authority), `.probe/m10b-simc-apl_rogue.cpp` (26,074 B,
`a74e4daa8376197d94f8449555035b3fd67634db450d2f7cb16bf84233939eb3`, Outlaw
and Subtlety regions), and the M10 pinned checkout `.probe/simc-33622e9d/`
(`sc_paladin.cpp` `519e69485c0efa9c9b51b2828a13c944b622c0c42f3f170b39e30b6ea5b36a85`,
`sc_paladin.hpp` `51fa0abc7fab5e433325c83a4115a7a73a2e57d93276265cf892abb894f56af1`,
`sc_spell_data.inc`, `util.cpp`, `player.cpp`), read for DBC rows and
module semantics.

`.probe/m11a3-authority-audit/` is ignored and non-production. M11-A4
creates the production artifact for the selected specialization through
`scripts/authority/extract-simc-apl.mjs` with a new `--target`, exactly as
M10-B did for Protection.

## 4. What the shared engine can do with a pinned list today

Read from `src/simc/` at the baseline — this is the yardstick every gate
below is measured against, and none of it changed in A3.

- **Parser** (`expression/parse.ts`, frozen by `m11a-parser-builtins-frozen`):
  exact built-ins `combo_points`, `combo_points.deficit`, `energy.pct`,
  `fight_remains`, `target.time_to_die`, `stealthed.rogue`,
  `variable.single_target`, `pmultiplier`, `remains`, `refreshable`; pattern
  built-ins `talent.<x>`, `buff.<x>.up|remains|stack|react`, `debuff.<x>.up`,
  `dot.<x>.ticking`, `cooldown.<x>.remains`; operators `& | !`, `>= > = < <=`,
  binary `+ - *`. Refused whole: `/ % %% != >? <? ^ @`, unary minus, every
  other identifier. A specialization admits further identifiers ONLY through
  `SpecAtomVocabulary` (BOOLEAN or NUMERIC, player- or target-scoped); a
  vocabulary can never shadow a built-in.
- **Evaluator** (`expression/evaluate.ts`): Kleene three-valued logic;
  unresolved BOOLEAN atoms are enumerated (correlated); magnitudes are
  `KNOWN`, `BOUNDED_NUMBER` (proven lower bound) or `UNKNOWN`. Three
  deliberate refusals matter for M11 lists: a bounded magnitude used as a
  bare truth is `UNKNOWN_STATE`; arithmetic on a bounded magnitude is
  `UNKNOWN`; `fight_remains`, `target.time_to_die`, `buff.<x>.remains`,
  `buff.<x>.stack` and `pmultiplier` have NO binding field and are always
  `UNKNOWN` (built-ins cannot be shadowed, so a specialization cannot bind
  them either).
- **Scan** (`nested-selection.ts`, `list-selection.ts`,
  `action-applicability.ts`): applicability → usability → condition, in the
  pinned order; `call_action_list` with an undecided gate explores both
  worlds; `run_action_list` BLOCKS unconditionally (`isUnmodelledDispatch`,
  checked before its gate); `swap_action_list` blocks; `cycle_targets` is
  settled only by a target-independent FALSE conjunct; `target_if` refuses
  outright; an unparseable condition on a GCD-consuming, applicable,
  not-proven-unusable entry BLOCKS the scan; on a NON_GCD entry it may be
  declared gate-irrelevant by the specialization with evidence.
- **First-GCD query** (`first-gcd-selection.ts`): NON_GCD actions fire and
  re-scan from the root under a reviewed transition contract (Δt = 0 only);
  a specialization may run the query once per correlated world (Protection
  runs it per race world) and converge.
- **Applicability/usability proofs** available to a specialization:
  `ITEM_NOT_EQUIPPED`, `NO_ON_USE_EFFECT`, `RACIAL_NOT_AVAILABLE_TO_RACE`,
  build-fact `background` (constructor site cited), `ACTIVE_COOLDOWN` (pinned
  base + reviewed modifier census + observed cast → proven lower bound),
  `INSUFFICIENT_RESOURCE` (KNOWN resource below pinned cost, free routes
  disproved), `REQUIRED_AURA_INACTIVE` (observed removal under coverage),
  `STATIC_READY_FALSE`, `SIMULATED_PREFIX_EXECUTION`.
- **Rejection** (`observed-comparison.ts`): `REJECTED` either by a definite
  different selection with the competitor PROVEN usable, or by
  unselectability — every entry naming the observed token background or
  gated FALSE in every world. The Protection unselectability module refuses
  a list WITH dispatch (`AUTHORITY_HAS_LIST_DISPATCH`); a nested-list version
  is sound as long as the authority has no `run_action_list` /
  `swap_action_list` (calls only add reachable entries) and is spec-owned
  work for any M11 spec.

## 5. Structural audit of all thirty ordinary M11 lists

Produced by a read-only parser over the `add_action` strings of each region
(audit tooling in `%TEMP%`, not committed). "Top-level dispatch" is what
sits in `default` between the entry and the rotation.

| specId | Evidence | Lists / entries | `run_action_list` | `call_action_list` gated on target count | Other structural facts |
| --- | --- | --- | --- | --- | --- |
| `paladin/retribution` | A7R6 6 (165 s), gtKb 23 (20 s) | 5 / 41 | **0** | none (`finishers` called on `holy_power`/Templar buff and unconditionally) | 7 `variable`s (6 precombat trinket math with `%`/`%%`, 1 `pre_es_wake` reset-only, 1 in-combat `ds_castable`); `raid_event.*` on `lights_judgment`, `wake_of_ashes`, `divine_toll`, `avenging_wrath`; `active_enemies` ONLY inside `ds_castable`; `cooldown.hammer_of_wrath.charges`; `gcd` arithmetic; no `target_if`/`cycle_targets`; no cast times |
| `demonhunter/havoc` | A7R6 18 (165 s) | 3 / 44 | 0 | none (single `default` list) | `retarget_auto_attack` ×2 with `target_if` and the `>?` operator at `default[1..2]`; `throw_glaive` at `default[14]` with `>?` and `active_enemies` — an unparseable GCD line ABOVE `eye_beam`, `death_sweep`, `blade_dance`, `annihilation`, `chaos_strike`; `action.<x>.demonsurge_available` on seven lines; `charges`/`full_recharge_time`; `gcd.max`/`gcd.remains` |
| `mage/arcane` | A7R6 3 (165 s), gtKb 1 (20 s) | 5 / 48 | 0 | `spellslinger`/`sunfury` gated on ONE talent (decidable) | cast-time spells (decision anchor = `begincast`, unmodelled); `mana.pct`; `prev_gcd.1.*` ×4; `charges_fractional` ×4; `set_bonus.*`; `equipped.*` ×66; `variable.aoe_count` with `active_enemies` throughout `sunfury`/`spellslinger` |
| `warlock/destruction` | A7R6 15, 12 (165 s) | 7 / 80 | 0 | `aoe_hc` on `active_enemies>=2&talent.wither`, `aoe_dia` on `active_enemies>=2&talent.diabolic_ritual` | cast times (`action.chaos_bolt.execute_time`, `in_flight`, `cast_time`); fractional `soul_shard`; `pet.infernal.active`; `demonic_art`; `variable.ritual_length` (sum of three `buff.diabolic_ritual_*.remains`); `floor`, `%`, `!=`, `<?` in variables |
| `warlock/demonology` | gtKb 10, 3, 7 (20 s) | 6 / 61 | 0 | none (`diabolist`/`soulharvest` on a talent) | pets (`pet.demonic_tyrant.active` ×11), cast times, `soul_shard`, `cooldown.*.remains_expected` |
| `hunter/beast_mastery` | A7R6 20 (165 s), gtKb 13 (20 s) | 8 / 55 | 0 | ALL four rotation lists gated on `active_enemies` (`drst`/`drcleave`/`st`/`cleave`) | `retarget,target_if=…,if=fight_style.dungeonroute` at `default[0]`; `barbed_shot,target_if=…` at the top of every ST list; pet-dependent `kill_command`; `full_recharge_time`, `charges_fractional`, `execute_time`, `howl_summon.ready`, `max_prio_damage` |
| `druid/feral` | A7R6 1 (165 s) | 8 / 67 | 0 | `finisher`/`aoe_finisher`/`builder`/`aoe_builder` gated on `spell_targets` | 15 `variable`s; `fight_style.*`; `<?`/`>?`/`!=`/`%`; `prowl`/`cat_form` state; energy + combo points; `target_if` ×10 |
| `warrior/arms` | A7R6 4 (165 s), gtKb 12, 5 (20 s) | 10 / 148 | **6** (`colossus_*`/`slayer_*` by hero talent × `active_enemies` × `variable.execute_phase`) | whole rotation behind `run_action_list`; `target_if` on the execute dispatch |
| `deathknight/blood` | A7R6 14 (165 s), gtKb 14 (20 s) | 6 / 65 | **3** (`deathbringer`/`san_gift`/`sanlayn` by hero tree) | rotation behind `run_action_list`; only `high_prio_actions` (4 entries: `raise_dead`, `death_strike` on Coagulopathy, 2× `dancing_rune_weapon`) is reachable; `rune`, `runic_power.deficit`, `drw.bp_ticking` |
| `deathknight/frost` | gtKb 26 (20 s) | 9 / 85 | **2** (`aoe` on `active_enemies>=2`, `single_target`) | 19 `variable`s (pooling, `sending_cds`); `target_if` ×7; `raid_event.*`; `death_knight.first_ams_cast` |
| `shaman/elemental` | A7R6 8, 16 (165 s), gtKb 19, 9 (20 s) | 4 / 80 | **2** (`aoe` on `spell_targets.chain_lightning>=3`, `single_target`) | cast times; `maelstrom`; `>?`; `target_if` ×9; `moving=1` |
| `mage/fire` | A7R6 17 (165 s) | 8 / 88 | **4** (`ff_combustion`/`sf_combustion`/`ff_filler`/`sf_filler`) | `action.<x>.executing`/`execute_remains`/`cast_time` ×68; `use_while_casting`; `prev_gcd`; `expected_combat_length`; `hot_streak_spells_in_flight` |
| `evoker/devastation` | A7R6 11 (165 s), gtKb 33 (20 s) | 8 / 86 | **2** (`sc` on a talent, `fs`) | 26 `variable`s; empower cast times; `target_if` ×13; `early_chain_if`; `<?`/`>?`/`%`; `raid_event.*` ×41 |
| `priest/shadow` | gtKb 29 (20 s) | 8 / 64 | **1** (`main`, unconditional) | everything rotational behind `run_action_list`; `target_if` ×18; `insanity.deficit`; pets; `raid_event.*`; DoT `active_dot.*` |
| `druid/balance` | gtKb 27 (20 s) | 8 / 101 | **6** (`opener`/`mini`/`cooldowns` on variables, `ec_st`/`kotg_st`/`aoe` on `spell_targets`) | `<?` ×12; `eclipse.*`; `astral_power` |
| `monk/brewmaster` | gtKb 4 (20 s) | 6 / 62 | **2** (`master_of_harmony`/`shado_pan` by hero tree) | `charges_fractional`; `buff.<x>.value`; `energy.regen`; `apex.N` |
| `demonhunter/devourer` | gtKb 32 (20 s) | 12 / 153 | **7** (four by hero tree × talent, three inside `voidscarred_melee` on `active_enemies`/Meta) | `action.reap.souls_consumed` ×20; `void_metamorphosis_base_drain_ps`; `soul_fragments`; `prev_gcd` |
| `warrior/fury` | none | 8 / 121 | **4** (`slayer`/`thane` × `active_enemies`) | `raid_event.movement.*`; `variable.on_gcd_racials` |
| `warrior/protection` | none | 7 / 71 | **4** (hero tree × `spell_targets.thunder_clap`) | `spell_targets.*` ×8 |
| `deathknight/unholy` | none | 7 / 64 | 0 | 15 `variable`s; pets ×6 (`pet.gargoyle.active`, `pet.army_ghoul.active`); `raid_event.*` ×31; `charges`/`max_charges` |
| `rogue/outlaw` | none | 5 / 48 | **1** (`finish` on `variable.finish_condition`) | `spell_targets.blade_flurry`; `raid_event.adds.*` |
| `rogue/subtlety` | none | 8 / 53 | 0 | 36 `variable` reads (`variable.stealth`, `variable.dance_condition`, `variable.priority_rotation`, …); `charges_fractional` |
| `shaman/enhancement` | none | 6 / 115 | 0 | ST lists gated on `active_enemies=1` × `talent.surging_totem`, `aoe` on `active_enemies>1`; `pet.surging_totem.active`; `action.<racial>.cooldown/duration`; `%`/`%%` |
| `monk/windwalker` | none | 7+ / 124 | 0 | `active_enemies` ×23; `full_recharge_time` ×12; `fight_style.castingpatchwerk`; `pet.xuen_the_white_tiger.active` |
| `hunter/marksmanship` | none | 7 / 74 | 0 | `action.aimed_shot.in_flight_to_target`, `cast_time`, `execute_time`; `raid_event.pull.*`; `%`/`%%` |
| `hunter/survival` | none | 6 / 55 | 0 | `active_enemies` ×5; `full_recharge_time` ×3 |
| `mage/frost` | none | 6 / 68 | **2** (`frostfire` on a talent, `spellslinger`) | cast times; `prev_gcd.2.glacial_spike`; `charges` |
| `warlock/affliction` | none | 13 / 94 | 0 | `pet.darkglare.*` ×15; `action.seed_of_corruption.in_flight`; `active_dot.agony`; `<?` |
| `druid/guardian` | none | 3+ / 53 | 0 | `active_enemies` ×13 |
| `demonhunter/vengeance` | none | 20+ / 138 | **2** (`ar`/`anni` by hero tree) | 63 `variable`s (209 reads); `action.sigil_of_flame.placed`; `<?` ×22; `charges` ×39 |

Seventeen of the thirty were inspected at the line level (the evidence-bearing
ones); the thirteen without evidence were structurally screened only. The
identifier census behind each row is reproducible from the pinned files
with the region coordinates in §3.

## 6. Engine-gap inventory

Every unsupported construct met, classified for the SELECTED first slice
(§8). Nothing here was implemented.

| Construct | Where met | Classification |
| --- | --- | --- |
| `run_action_list` (unmodelled, blocks before its gate) | Arms, Fury, Protection Warrior, Blood, Frost DK, Elemental, Fire, Frost Mage, Devastation, Shadow, Balance, Brewmaster, Devourer, Vengeance, Outlaw — 15 of 30 | DOES_NOT_BLOCK_FIRST_SLICE (Retribution has none). FUTURE_SHARED_ENGINE_CANDIDATE — two sound, bounded extensions would unlock most of the population: (a) skip a `run_action_list` whose gate is proven FALSE exactly as a FALSE `call_action_list` gate is skipped; (b) model a proven-TRUE `run_action_list` as "continue in the child, never return". Both are engine milestones, not spec work. |
| Target count (`active_enemies`, `spell_targets[.x]`, `active_dot.x`) | 28 of 30 (absent only from Subtlety's and Devourer's ST lists in places) | DOES_NOT_BLOCK_FIRST_SLICE only because Retribution reads it ONCE, inside `variable.ds_castable`, as one disjunct of a conjunction the other conjuncts can settle. FUTURE_SHARED_ENGINE_CANDIDATE (a target-count model with evidence, never a default). |
| `raid_event.*` (sim-only) | Retribution `lights_judgment`, `wake_of_ashes`, `divine_toll`, `avenging_wrath`; Arms, Fury, Frost DK, Unholy, Devastation, Shadow, Outlaw, Vengeance, Marksmanship | DOES_NOT_BLOCK_FIRST_SLICE for spender decisions (the four Retribution lines are eliminated by proven cooldowns most of the time and the scan ends inside `finishers`); BLOCKS every Wake of Ashes / Divine Toll / Execution Sentence / Avenging Wrath decision → expected `UNKNOWN`. Not an engine candidate: `raid_event` describes a simulation, not a log. |
| Generic `variable.<name>` (read) | every list except Blood, Guardian, Brewmaster, Survival | DOES_NOT_BLOCK_FIRST_SLICE: Retribution's in-combat variable `ds_castable` is bound by the specialization (its value expression is pinned text over atoms the spec binds); `pre_es_wake` is reset-only (`default=0`, never assigned in combat) and binds `KNOWN 0`; the six precombat trinket variables are read only by NON_GCD `use_item` lines. FUTURE_SHARED_ENGINE_CANDIDATE (generic in-scan variable execution). |
| `target_if` / `cycle_targets` | BM, Arms (execute dispatch), Frost DK, Elemental, Feral, Devastation, Shadow, Balance, Havoc (`retarget_auto_attack`), Destruction, Demonology | DOES_NOT_BLOCK_FIRST_SLICE (none in Retribution). |
| `prev_gcd.N.x` / `prev.x` | Fire, Arcane, Frost Mage, Balance, Feral, Devastation, Devourer, Affliction, Vengeance, Windwalker, BM, Destruction | DOES_NOT_BLOCK_FIRST_SLICE (Protection's `prev_gcd.1.divine_toll` precedent is a spec atom; Retribution has none). |
| Charges (`charges`, `charges_fractional`, `full_recharge_time`, `cooldown.x.charges`) | Retribution `cooldown.hammer_of_wrath.charges` (one line, Walk Into Light builds); BM, Fire, Arcane, Elemental, Feral, Balance, Brewmaster, Havoc, Frost DK, Unholy, Windwalker, Vengeance, Subtlety, Marksmanship, Survival | DOES_NOT_BLOCK_FIRST_SLICE structurally, but LIMITS it: under Avenging Wrath a Walk-Into-Light build's `hammer_of_wrath` becomes a competing candidate unless its charge state is proven (spec-owned, Protection `armament-state.ts` precedent). FUTURE_SHARED_ENGINE_CANDIDATE (charge engine). |
| Pets / guardians | Destruction, Demonology, Unholy, Affliction, Shadow, Enhancement, Windwalker, BM (implicit) | DOES_NOT_BLOCK_FIRST_SLICE (none in Retribution). |
| Cast / channel anchors (`action.x.cast_time`, `execute_time`, `executing`, `in_flight`, `channeling`, `use_while_casting`, `interrupt_if`, `early_chain_if`) | Fire, Arcane, Frost Mage, Destruction, Demonology, Affliction, Elemental, Shadow, Balance, Devastation, Marksmanship | BLOCKS the first slice of EVERY caster: the decision point of a cast-time spell is its `begincast`, and the shared observed-decision model anchors on `cast`. FUTURE_SHARED_ENGINE_CANDIDATE. |
| Unsupported operators `>?`, `<?`, `/`, `%`, `%%`, `!=`, `floor`, `min`, `max` | Havoc (`>?` on three rotation lines), Elemental, Feral, Balance, Destruction, Devastation, Vengeance, Shadow; Retribution only in precombat variables | DOES_NOT_BLOCK_FIRST_SLICE (Retribution's in-combat lines parse). Havoc's `default[14] throw_glaive` is a permanent parse blocker above its core rotation. |
| Bounded magnitude as a bare truth (`&cooldown.wake_of_ashes.remains`) | Retribution `generators[0]`; trinket lines elsewhere | DOES_NOT_BLOCK_FIRST_SLICE (the `generators[0]` gate is `UNKNOWN`, and `generators[5]` calls `finishers` unconditionally). FUTURE_SHARED_ENGINE_CANDIDATE (a proven lower bound above zero is a proven non-zero). |
| Arithmetic on a bounded magnitude (`gcd*2`, `gcd*1.5`) | Retribution `generators[0]`, `finishers[1]` (Templar line) | DOES_NOT_BLOCK_FIRST_SLICE for Herald of the Sun builds (the Templar line is background). FUTURE_SHARED_ENGINE_CANDIDATE (sign-aware bound propagation). |
| `buff.<x>.stack` / `buff.<x>.remains` unbindable built-ins | Retribution `buff.art_of_war.stack`, `buff.righteous_cause.stack`, `buff.avenging_wrath.stack` (Crusade), `buff.hammer_of_light_free.remains`, `buff.undisputed_ruling.remains`; nearly every other list | DOES_NOT_BLOCK_FIRST_SLICE (Blade of Justice's line is eliminated by `!buff.avenging_wrath.up` under wings for Walk-Into-Light builds, or by its own 12 s charge cooldown; otherwise it competes and the decision is `UNKNOWN`). FUTURE_SHARED_ENGINE_CANDIDATE — binding fields for aura stack and remaining reconstruction are the single most valuable shared addition for M11 coverage. |
| `gcd` as a magnitude | Retribution (×6), most lists | DOES_NOT_BLOCK_FIRST_SLICE; a spec may bind a proven lower bound (750 ms) or leave it unknown. |
| Race for a GCD-consuming racial line (`lights_judgment` with a `raid_event` gate at `cooldowns[7]`) | Retribution, Arms, Blood, Fury | LIMITS the first slice: MATCH via the scan needs the Lightforged world excluded; the gate-based REJECTED route does not. Not an engine gap — an identity fact (§7, G6). |
| Cooldown state at the pull | every spec | DOES_NOT_BLOCK: decisions before the first observed cast of each gated cooldown are expected `UNKNOWN` (M10-C5 precedent). |

## 7. G1–G7 matrix

Every audited candidate, independently. `UNKNOWN` means the audit could not
establish the gate either way from evidence; it is not a soft PASS.

| specId | G1 scope | G2 identity | G3 real evidence | G4 pinned authority | G5 expression/engine | G6 state | G7 real resolvability |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `paladin/retribution` | PASS (DPS, roster 70) | PASS (A7R6 actor 6 `Paladin`/`Retribution` from committed master data; SimC `PALADIN_RETRIBUTION` 70; both Herald of the Sun builds) | PASS for A4 evidence work (165 s + 20 s local raw; 69 spender decisions in 165 s); NOT sufficient for promotion until sanitized per-actor slices are committed | PASS (`apl_paladin.cpp` retribution region, hash above; `SIMC_APL_PALADIN_RETRIBUTION` would be a distinct authority id over shared provenance — the exact case `m11a2-decision-authority-ownership` already proves legal) | PASS — no `run_action_list`, no `target_if`, no cast times; needs vocabulary atoms, a scan-start boundary over `auto_attack`/`rebuke` (the Assassination `stealth`/`kick` precedent), a nested-list unselectability proof, transition contracts for `potion`/racials/on-use items; no shared-engine change | PASS with one identity dependency — Holy Power is on the wire at every costed spender (`classResources` type 9, pre-cost) and every gain is a `resourcechange` with `waste`; the auras the slice reads (Empyrean Legacy 387178, Divine Arbiter 1306161/1306162, Divine Purpose 408458, Avenging Wrath 31884, the Hammer of Wrath readiness aura 1241410) are observed with apply/remove under coverage; talents from `combatantinfo`; cooldowns from observed casts + DBC. RACE is not on the wire: the Lightforged world must be excluded (Horde faction + pinned `util::is_alliance`) for the scan route; the gate route needs no race | PASS — audit walk over actor 6's 69 spender decisions: 13 `REJECTED` by unselectability alone (Divine Storm cast while `!buff.empyrean_legacy.up` or `!buff.divine_arbiter_divine_storm.up` is FALSE), plus 6 `MATCH` / 2 `REJECTED` through the definite scan outside wings; details §8 |
| `demonhunter/havoc` | PASS | PASS (A7R6 actor 18; Fel-scarred build) | PASS for A4 evidence (165 s) | PASS (`apl_demon_hunter.cpp` havoc region) | PASS with a permanent ceiling: `default[1..2]` need a NON_GCD boundary proof for `retarget_auto_attack`; `default[14] throw_glaive` cannot parse (`>?`) and is a GCD line above Eye Beam, Blade Dance, Annihilation and Chaos Strike — those decisions can never resolve without a parser change | PASS/UNKNOWN — Fury on the wire (type 17 on every cast); `action.<x>.demonsurge_available` is novel spec state | UNKNOWN — Metamorphosis, The Hunt, Essence Break, and Death Sweep/Annihilation inside Essence Break windows are the only resolvable decisions; not demonstrated against evidence in A3 |
| `mage/arcane` | PASS | PASS | PASS for A4 evidence | PASS (`mage.cpp` arcane) | FAIL — cast-time decision anchors (`begincast`) are an unmodelled shared capability; `mana.pct`, `prev_gcd`, `charges_fractional`, `set_bonus` | FAIL (mana continuous, cast anchors) | FAIL for a first slice |
| `warlock/destruction` | PASS | PASS | PASS for A4 evidence | PASS (`warlock.cpp` destruction) | FAIL — cast anchors, fractional shards, pet state, `variable.ritual_length` arithmetic; `aoe_dia` call gated on `active_enemies` for Diabolist builds | FAIL | FAIL |
| `warlock/demonology` | PASS | PASS | PASS (20 s) | PASS | FAIL — pets and cast anchors | FAIL | FAIL |
| `hunter/beast_mastery` | PASS | PASS | PASS for A4 evidence | PASS | FAIL — every ST list opens with `barbed_shot,target_if=…`; `default[0]` `retarget,target_if` on `fight_style`; Kill Command is pet-dependent; all four rotation calls gated on `active_enemies` (both worlds explored, convergence needed) | FAIL (pet state, charges) | FAIL |
| `druid/feral` | PASS | PASS | PASS for A4 evidence | PASS | FAIL — builder/finisher calls gated on `spell_targets`; `tigers_fury` gate carries `fight_style.*` (unparseable) and blocks whenever Tiger's Fury is ready; energy + combo points | FAIL | FAIL |
| `warrior/arms` | PASS (sentinel migration would be required first) | PASS | PASS for A4 evidence (165 s + 2×20 s) | PASS | FAIL — the entire rotation is behind six `run_action_list` entries | — | FAIL |
| `deathknight/blood` | PASS | PASS | PASS for A4 evidence | PASS | FAIL for a rotational slice — rotation behind `run_action_list` by hero tree; only `high_prio_actions` is reachable | — | FAIL (Dancing Rune Weapon / Coagulopathy Death Strike would be the only resolvable lines) |
| `deathknight/frost` | PASS | PASS | PASS (20 s) | PASS | FAIL — `run_action_list` dispatch, pooling variables, `target_if` | — | FAIL |
| `shaman/elemental` | PASS | PASS | PASS for A4 evidence | PASS | FAIL — `run_action_list`, cast anchors, maelstrom | — | FAIL |
| `mage/fire` | PASS | PASS | PASS for A4 evidence | PASS | FAIL — `run_action_list`, cast anchors, `use_while_casting` | — | FAIL |
| `evoker/devastation` | PASS (ordinary M11 by declared classification; roster role UNKNOWN) | PASS | PASS for A4 evidence | PASS | FAIL — `run_action_list`, empower cast anchors, 26 variables | — | FAIL |
| `priest/shadow` | PASS | PASS | PASS (20 s) | PASS | FAIL — `run_action_list,name=main` unconditional | — | FAIL |
| `druid/balance` | PASS | PASS | PASS (20 s) | PASS | FAIL — six `run_action_list` | — | FAIL |
| `monk/brewmaster` | PASS | PASS | PASS (20 s) | PASS | FAIL — `run_action_list` by hero tree | — | FAIL |
| `demonhunter/devourer` | PASS | PASS | PASS (20 s) | PASS | FAIL — seven `run_action_list`, `action.reap.souls_consumed` | — | FAIL |
| the thirteen without evidence | PASS | PASS (roster) | FAIL (no known real evidence) | PASS (structurally screened) | not evaluated | — | FAIL (G3) |

The audit never widened past the evidence-bearing seventeen for line-level
inspection because one candidate passed all seven gates.

## 8. First-spec decision

```text
FIRST NEW SPEC: paladin/retribution
```

Exactly one candidate passes G1–G7; the tie-break sequence was not needed,
but for the record Retribution would also win it: strongest evidence (two
subjects, 185 s, both Herald of the Sun builds with Final Verdict, Crusading
Strikes, Divine Purpose and the Divine Arbiter set bonus), zero shared-engine
changes, the smallest spec-owned state surface (one discrete resource on the
wire, six auras, four cooldowns), the clearest authority path (no dispatch
other than `call_action_list`, no `target_if`, no cast times), and maximal
reuse of the onboarding architecture (roster row 70, Paladin datasets already
pinned by M10 for the same class file `apl_paladin.cpp`, the
`DUPLICATE_DECISION_AUTHORITY_BINDING` control case written for exactly this
sibling).

### 8.1 The authority path, read at the pin

`default`: `auto_attack`, `rebuke` (DBC gcd 0), `call_action_list,name=cooldowns`,
`call_action_list,name=generators`.

`cooldowns` (11): `use_item,name=algethar_puzzle_box` (item 193701 — neither
subject wears it), `potion` (NON_GCD), four `use_item,slot=trinketN` lines
whose gates read `trinket.*`/`variable.trinket_*` (NON_GCD; gear-proven
applicability or gate-irrelevance), `invoke_external_buff` (static ready
false), `lights_judgment` (Lightforged racial, DBC 255647 gcd 1,500 —
GCD-CONSUMING, `raid_event` gate), `fireblood` (Dark Iron, gcd 0),
`execution_sentence` (DBC cooldown 60,000; gate reads `target.time_to_die`,
`gcd`, `variable.pre_es_wake`), `avenging_wrath` (DBC cooldown 120,000, gcd 0;
gate reads `raid_event.adds.up`, `equipped.*`, `trinket.*`).

`generators` (14): `[0] call finishers,if=holy_power=5&cooldown.wake_of_ashes.remains|buff.hammer_of_light_free.remains<gcd*2`
(gate `UNKNOWN` under the shared evaluator — bounded bare truth, unbindable
`remains`, bounded arithmetic — so `finishers` is explored as possible, never
entered definitively here); `[1] wake_of_ashes` (DBC 1 charge / 30,000 ms,
`raid_event` gate); `[2] divine_toll` (60,000, `raid_event` gate);
`[3] blade_of_justice,if=(buff.art_of_war.stack=2|buff.righteous_cause.stack=2)&(!talent.walk_into_light|!buff.avenging_wrath.up)`
(12,000 ms charge cooldown; the stack atoms are unbindable, the second
conjunct is decidable); `[4] hammer_of_wrath,if=talent.walk_into_light&cooldown.hammer_of_wrath.charges=2`;
`[5] call_action_list,name=finishers` (UNCONDITIONAL — the definitive entry
to the spender decision); `[6..13]` generators.

`finishers` (4): `[0] variable,name=ds_castable,value=(active_enemies>=2|buff.divine_arbiter_verdict.up)&!buff.empyrean_legacy.up&!buff.divine_arbiter_divine_storm.up`;
`[1] hammer_of_light,if=…` (background unless the Templar tree is active —
`sc_paladin.cpp:2149`, the fact Protection already pins; both subjects are
Herald of the Sun); `[2] divine_storm,if=variable.ds_castable`;
`[3] templars_verdict` (unconditional; the action is Final Verdict 383328
when `talent.final_verdict` is taken — `sc_paladin_retribution.cpp:666-669`).

Pinned semantics the slice rests on (all at the pin):

- `hammer_of_wrath_t::action_ready()` = base `&& p()->buffs.hammer_of_wrath->up()`
  (`sc_paladin.cpp:1799-1802`); `judgment_t::action_ready()` = base
  `&& !p()->buffs.hammer_of_wrath->up()` (`:1536-1539`). The readiness buff
  is triggered on Avenging Wrath execute when `talents.hammer_of_wrath` is
  taken (`:313-315`) and expired by Avenging Wrath's expire callback
  (`:3631-3635`). SimC builds it from spell 1277026; the log emits aura
  **1241410** "Hammer of Wrath" applied and removed at exactly the Avenging
  Wrath timestamps on both subjects (A7R6 actor 6: `+0.710/+24.725`,
  `+63.341/+87.358`, `+127.413/+151.420`). The id correspondence is an
  evidence-backed binding A4 must record as such, not assume.
- Divine Arbiter (Midnight season 2 four-piece, `sc_paladin.hpp:1666-1716`):
  when Divine Purpose is consumed by a spender, the buff NAMED AFTER THAT
  SPENDER triggers — `divine_arbiter_verdict` (spell 1306161,
  `sc_paladin.cpp:4322`) after a Verdict, `divine_arbiter_divine_storm`
  (1306162, `:4320`) after a Divine Storm — and a DIFFERENT spender consumes
  it. The evidence shows exactly this alternation (Final Verdict free at
  `+68.175` → 1306161 applied `+68.176` → Divine Storm `+70.069` removes it).
- `crusader_strike` is background when Crusading Strikes or Templar Strikes
  is taken (`sc_paladin.cpp:1072-1075`); `templar_strike`/`templar_slash`
  background without Templar Strikes (`sc_paladin_retribution.cpp:962-963`);
  `divine_storm` background without the talent (`:549-550`).
- `variable.pre_es_wake` is `op=reset,default=0` in precombat and never
  assigned in combat (extractor-checkable), so it binds `KNOWN 0`.
- Light's Judgment (255647) and Fireblood (265221) are Alliance-only races
  in `util::is_alliance` (`util.cpp:3511-3524`); Arcane Torrent is Blood Elf.

### 8.2 The concrete G7 proof (audit walk, not the engine)

Actor 6, A7R6 fight 7, `+0` .. `+165 s`, 69 Holy Power spender casts
(26 Divine Storm, 43 Final Verdict; 17 + 34 carry Holy Power pre-cost on
the wire, the other 18 are Divine Purpose free casts).

`REJECTED` by unselectability, race-independent, needing only the
`ds_castable` binding and the aura intervals — 13 decisions:

| Time | Observed | Why the only `divine_storm` entry is gated FALSE |
| --- | --- | --- |
| `+1.604`, `+63.778` | Divine Storm (HP 3) | Empyrean Legacy 387178 up (applied with Avenging Wrath at `+0.711` / `+63.341`, removed at `+4.194` / `+66.027` by the next Verdict) → `!buff.empyrean_legacy.up` FALSE |
| `+37.582`, `+77.210`, `+83.136`, `+84.141`, `+100.569`, `+101.793`, `+134.689`, `+135.706`, `+137.742`, `+138.754`, `+139.777` | Divine Storm | `divine_arbiter_divine_storm` 1306162 up (applied by the preceding free Divine Storm, removed only by the next Verdict) → `!buff.divine_arbiter_divine_storm.up` FALSE |

`MATCH` / `REJECTED` through the definite scan (race world excluded, AW
modifier census bounding its cooldown at ≥ 60 s effective, Hammer of Wrath
readiness aura down or its charge state known) — 8 decisions:
`+38.477`, `+79.246`, `+104.407`, `+141.812` Final Verdict under 1306162 →
`ds_castable` FALSE → `templars_verdict` definite → MATCH; `+13.394`,
`+18.502` Divine Storm under 1306161 (`buff.divine_arbiter_verdict.up` TRUE
settles the disjunction whatever `active_enemies` is) → `divine_storm`
definite and PROVEN usable (HP 5 on the wire ≥ cost 3) → MATCH; `+11.431`,
`+16.524` Final Verdict under 1306161 → REJECTED (authority selected
`divine_storm`).

Expected `UNKNOWN` — 48 decisions, each with a named reason: `ds_castable`
undecidable when no arbiter/legacy aura is up (`active_enemies` unbound: 25);
Divine Toll, Wake of Ashes, Execution Sentence or Avenging Wrath possibly
ready — or not yet observed cast — with an unparseable `raid_event` gate
(13, including the three decisions before the first observed Divine Toll);
Hammer of Wrath competing under wings with unproven charges (3 on that
ground alone); Blade of Justice competing with unbindable stack atoms (1);
Divine Purpose free casts, which the audit walk counted as `UNKNOWN`
conservatively although a proven Divine Purpose aura is itself the usability
proof (6). Every one of these is a fail-closed refusal the shared model
already names, not a laundering risk.

These 21 resolvable decisions are what M11-A4 must reproduce with the real
engine; the corpus cases it commits must draw from this population.

## 9. Ritual Clipping ownership (mechanical facts only)

- Pinned Destruction region (`warlock.cpp` lines 278–378): seven references —
  `variables[1] variable,name=ritual_length,value=buff.diabolic_ritual_mother_of_chaos.remains+buff.diabolic_ritual_overlord.remains+buff.diabolic_ritual_pit_lord.remains`;
  `chaos_bolt,if=talent.diabolic_ritual&(demonic_art|(variable.ritual_length<action.chaos_bolt.execute_time))…`;
  `aoe_dia` called on `active_enemies>=2&talent.diabolic_ritual`.
- Pinned Demonology region (lines 199–276): one — `call_action_list,name=diabolist,if=talent.diabolic_ritual`.
- Pinned Affliction region (lines 59–197): zero.
- Real evidence: the three gtKb Demonology subjects (actors 3, 7, 10) emit
  `Diabolic Ritual: Overlord` 431944, `Diabolic Ritual: Mother of Chaos`
  432815, `Diabolic Ritual: Pit Lord` 432816 and `Demonic Art: *` 428524 /
  432794 aura events inside the 20 s opener. The two A7R6 Destruction
  subjects are Hellcaller builds (Wither) and emit none.

Ownership therefore resolves to **Warlock / Diabolist hero tree — reachable
from Destruction and Demonology, absent from Affliction; which
specialization module should own the analysis is UNRESOLVED**. The mechanic
itself (what a "clip" is, what a lost cycle is) is NOT established by APL
text and is left for a pinned mechanics read of `sc_warlock*.cpp` in the
owning milestone. Recorded in the inventory under both candidate owners.

## 10. Cohort reconciliation

30 ordinary M11 specializations before selection; 1 selected; 29 remaining;
7 healers to M12; Augmentation to M13. The audit re-grouped the remaining 29
by their STRUCTURAL blocker, because that — not melee/ranged — is what
decides the next engine milestone each cohort waits on. Every specialization
appears exactly once; `tests/contracts/m11a3-coaching-inventory.test.ts`
proves the partition against the roster.

| Cohort | Blocker the cohort shares | Members (29) |
| --- | --- | --- |
| B — instant-cast, no `run_action_list` | target-count gates and/or `target_if` on the ST lists; charges; pets | Havoc, Beast Mastery, Feral, Survival, Windwalker, Subtlety, Enhancement, Guardian |
| C — `run_action_list` dispatch, instant-cast | engine candidate (a): FALSE-gated `run_action_list` skip, then (b) TRUE-gated run | Arms, Fury, Protection Warrior, Blood, Frost DK, Brewmaster, Vengeance, Devourer, Outlaw |
| D — casters (cast/channel anchor model) | `begincast`-anchored decisions; continuous mana | Arcane, Fire, Frost Mage, Destruction, Affliction, Demonology, Elemental, Shadow, Balance, Devastation, Marksmanship |
| E — pet- and variable-heavy | pets + generic variables on top of C/D | Unholy |

Former "conventional melee" is split because Arms/Fury/Frost DK share the
dispatch blocker with the tanks, not with Outlaw/Subtlety's structure
(Outlaw has one `run_action_list`; Subtlety has none but 36 variable reads).
Retribution's former provisional status was not preserved; it was
re-derived and confirmed by the gates.

## 11. Scope audit

No new analyzer; no new `SpecId`; no public or internal support change; no
Warcraft Logs or rankings fetch; no shared-engine implementation; no schema
change; no supplemental analyzer implementation; no deployment; the Arms
sentinel is untouched. Repository changes are documents, one test-owned
data file and one contract test (see the closeout).
