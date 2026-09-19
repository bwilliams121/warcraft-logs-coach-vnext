# SimulationCraft authority extraction

## Specialization roster — pinned at M11-A2

`extract-simc-roster.mjs` produces `src/data/game/spec-roster.json`
(`SIMC_SPECIALIZATION_ROSTER`, revision `simc-33622e9d-1`): every PLAYABLE
specialization at the pinned commit, derived mechanically from three
sources — never from a remembered list.

| Source | Role | SHA-256 |
| --- | --- | --- |
| `engine/dbc/generated/specialization_spells.inc` | every (class, spec) row group; the spec passive named as the display name; the `Stat Negation Aura - <Stat> <Role>` passive | `514d7a509a3b95f130aadccb6a6f1a28c6f5f2568f211cd5139bb567b712e4fc` |
| `engine/util/util.cpp` | `spec_map[]` (enumerator ↔ display name), `translate_class_id`, `player_type_string(_long)` | `30737d317fa5d312985952fa2945093c523b583033b75d855dcf104141c14e4d` |
| `engine/dbc/generated/client_data_version.inc` | build `12.1.0.69587`, hotfix 2026-09-10 / 69587 | `226a0e619d6de3ff901652aa16ab4770c0acf26e6db5ae691ee8e026e1eac293` |

Playable = class id ≠ 0 (pet families excluded), no `Initial <Class>`
placeholder in the group, exactly one `spec_map` display name in the
group. Result at the pin: **40** playable specializations (25 DPS, 6 tank,
6 healer, 3 role-UNKNOWN — the Evoker specializations carry no role
passive), 3 pet families and 8 placeholders excluded and recorded. Role is
pinned only from the passive; nothing fills the Evoker gap. Deterministic:
two runs over identical bytes are byte-identical.

```bash
node scripts/authority/extract-simc-roster.mjs --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 \
  --extracted-on 2026-09-18 \
  --local-specializationSpells <checkout>/engine/dbc/generated/specialization_spells.inc \
  --local-util <checkout>/engine/util/util.cpp \
  --local-clientDataVersion <checkout>/engine/dbc/generated/client_data_version.inc
```

Then `npx prettier --write src/data/game/spec-roster.json`, exactly as the
corpus manifest is regenerated: the committed artifact is the extractor's
byte-identical output after the repository's formatter, and prettier is
idempotent, so regeneration is a no-op diff.

CI validates the committed artifact (`tests/contracts/m11a2-spec-roster.test.ts`)
and never needs the checkout. The roster is reference data, not support.

The analyzer has **no runtime dependency** on GitHub, the SimulationCraft site,
or the moving `midnight` branch. It imports committed JSON artifacts generated
from one exact commit. This directory holds the generators and the procedures.

Two artifacts, two different questions:

| Artifact | Question | Generator |
| --- | --- | --- |
| `src/simc/data/rogue-assassination.apl.json` | what should be done | `extract-simc-apl.mjs` |
| `src/data/game/rogue-gcd-semantics.json` | does doing it consume the rotational GCD | `extract-simc-gcd.mjs` |
| `src/data/game/rogue-talents.json` | which talent did the player actually take | `extract-simc-talents.mjs` |

They are pinned to the same commit and must be re-pinned together.

## APL authority — currently pinned

| | |
| --- | --- |
| Repository | `https://github.com/simulationcraft/simc` |
| Branch at capture | `midnight` |
| **Commit** | `33622e9d1662ff0e451691edf85a6b49cc9d11d9` |
| Commit date | 2026-09-12 |
| Source file | `engine/class_modules/apl/apl_rogue.cpp` |
| Source SHA-256 | `a74e4daa8376197d94f8449555035b3fd67634db450d2f7cb16bf84233939eb3` |
| Source bytes | 26,074 |
| Artifact | `src/simc/data/rogue-assassination.apl.json` |
| Extracted | 2026-09-12 |

## Reproduce

```bash
node scripts/authority/extract-simc-apl.mjs \
  --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 \
  --commit-date 2026-09-12 \
  --expect-sha256 a74e4daa8376197d94f8449555035b3fd67634db450d2f7cb16bf84233939eb3 \
  --out src/simc/data/rogue-assassination.apl.json
```

Deterministic: the same commit yields a byte-identical artifact apart from
`extractedOn`. `--file <path>` reads a local copy instead of fetching.

## Protection Paladin APL — pinned at M10-B, bound at M10-C, PUBLIC since M10-D

The same commit carries `engine/class_modules/apl/apl_paladin.cpp`, whose
`//protection_apl_start .. //protection_apl_end` region is the Protection
Paladin default action priority list (`void protection( player_t* p )`, two
lists: `default` with 30 actions, `precombat` with 6, no list dispatch).

| | |
| --- | --- |
| Source file | `engine/class_modules/apl/apl_paladin.cpp` |
| Source SHA-256 | `ed3fb1ac5b1c6c83bf21abbcaff5afe282678a69d51bdc953cc9897dca94bc02` |
| Source bytes | 10,081 |
| Artifact | `src/simc/data/paladin-protection.apl.json` (`SIMC_APL_PALADIN_PROTECTION`, revision `simc-33622e9d-1`) |
| Extracted | 2026-09-16, `--target paladin-protection` |
| Bound to | `OFFENSIVE_ROTATION` only, by `src/specs/paladin/protection/registration.ts` through the tree's own `pinned-authority.ts` loader. No other domain. The registration was INTERNAL_ONLY from M10-C and has been PUBLIC since M10-D; exposure changed nothing about what the artifact governs. |

It is OFFENSIVE authority only. It is a damage-priority list for a simulation:
it contains `shield_of_the_righteous` and `word_of_glory` as damage-ordered
lines and conditions nothing on incoming damage, health or a defensive plan.
M10-C bound it: the binding is `SIMC_APL` for `OFFENSIVE_ROTATION` and the
registry refuses any other domain (`PROVIDER_DOMAIN_COMPATIBILITY`).
`ACTIVE_MITIGATION`, `DEFENSIVE_COOLDOWN`, `SELF_HEALING`,
`RESOURCE_SPENDING` and `INTERRUPT` have NO pinned authority, and the
evaluator reports each as such.

Parser coverage measured at M10-B (pinned by
`tests/contracts/m10b-protection-paladin-authority.test.ts`): 16 unconditional
lines; of the 20 conditional lines 10 parse and 10 are refused as
`UNSUPPORTED_IDENTIFIER` at `next_armament` (×3), `consecration.up` (×2),
`talent.righteous_protector.enabled`, `prev_gcd.1.divine_toll`,
`hero_tree.lightsmith`, `apex.3` and `full_recharge_time`. That is STILL the
shared parser's answer without a vocabulary. M10-C admitted these identifiers
through the specialization seam (`src/simc/expression/spec-vocabulary.ts`,
declared in `src/specs/paladin/protection/vocabulary.ts`), never by relaxing
the shared parser: every conditional line now parses WITH the Protection
vocabulary, and the resolver binds a value only where the pinned data and the
evidence prove one.

### Protection Paladin game data — pinned at M10-C

Two further artifacts from the same commit, produced by the GCD and talent
extractors under a `--target paladin-protection` profile (the default target
stays `rogue-assassination`, and both Rogue artifacts regenerate byte for
byte through the refactored extractors):

| Artifact | Dataset | Contents |
| --- | --- | --- |
| `src/data/game/paladin-protection-gcd-semantics.json` | `SIMC_DBC_PALADIN_PROTECTION_GCD_SEMANTICS` | 20 machine-extracted `_gcd` records (the 15 APL actions, the 4 observed-only abilities Ardent Defender, Hand of Reckoning, Divine Steed, Blessing of Spellwarding, and since M10-C5 Phase B Sacred Weapon 432472 — the game records a Holy Armaments press under the armament it produced, so the `holy_armaments` token binds the SET {432459, 432472}), 14 hand-reviewed token bindings citing `sc_paladin.cpp` / `sc_paladin_protection.cpp` / `player.cpp` / `racial_spells.inc` by line, 4 meta-action lanes (`auto_attack` from the Paladin module, `use_item`, `use_items`, `potion`) |
| `src/data/game/paladin-protection-talents.json` | `SIMC_TRAIT_PALADIN_PROTECTION_TALENTS` | 7 talents (righteous_protector, sentinel, avenging_wrath, blessed_hammer, hammer_of_the_righteous — a choice node — the Protection row of divine_toll, and since M10-C5 Phase B the Lightsmith choice node blessed_assurance, whose alternative is Divine Guidance), the Templar (48) and Lightsmith (49) hero sub-trees with every entry each offers spec 66, and the three tiered `apex.N` traits in generated-table order |
| `src/data/game/paladin-protection-item-effects.json` (M10-C correction 1) | `SIMC_DBC_PALADIN_PROTECTION_ITEM_USE_EFFECTS` | the M10-B subject's complete worn equipment (17 items; the shirt slot is empty) plus `algethar_puzzle_box`, the one item the APL names; produced by `extract-simc-item-effects.mjs --target paladin-protection`, which drops the Rogue-only cooldown-modifier review (`NO_ROGUE_MODIFIER_APPLIES_TO_AN_ITEM_USE_COOLDOWN`) so a Paladin item cooldown stays MODIFIERS_POSSIBLE. Exactly one worn item is on-use: Voracious Heart of Ula'tek (270175, driver 1297761, cooldown 90,000 ms, gcd 0) |
| `src/data/game/paladin-protection-cooldowns.json` (M10-C5) | `SIMC_DBC_PALADIN_PROTECTION_ABILITY_COOLDOWNS` | the DBC cooldown records of Divine Toll (375576), both wings records (Sentinel 389539, Avenging Wrath 31884; one alias group), and since Phase B Avenger's Shield (31935) and Consecration (26573); a MACHINE CENSUS of every passive effect SimulationCraft's generic parser would apply to the cooldown — the Protection-selectable Paladin TRAITS as before, and since Phase B the SPEC passives (`specialization_spells.inc` rows with SX_PASSIVE) and CLASS passives (`class_spells.inc` `__passive_spells_data`) that `parse_all_class_passives` registers first (family flags for 107/108/416, labels for 218/219, category for 341/453/454/457/411, category type mask for 173/205, and A_HASTED_COOLDOWN by family flags) — Quickened Invocation −15,000 ms on Divine Toll, Righteous Protector −50% on wings, the spec passive "Protection Paladin" (137028) HASTED on Avenger's Shield and Consecration, the rank passive "Consecration" (327980) −50% on Consecration — each with its `origin` (TRAIT / SPEC_PASSIVE / CLASS_PASSIVE) and, for a trait, its entry, node and siblings; a hand-reviewed dynamic policy whose seven checks are re-run mechanically on every extraction and which, since Phase B, may DECLARE a dynamic mutation instead of asserting none (Avenger's Shield: `paladin_t::trigger_grand_crusader` resets it, observable as aura 85416 on the actor; Consecration: the precombat-only adjust), plus Consecration's pinned ground-effect duration (12,000 ms), its duration modifiers (Consecration in Flame +2,000 ms, P_DURATION) and its mechanically checked lifetime (`groundEffect.lifetime`: 1,000 ms base pulse hasted by SPELL_HASTE, NO_EXPIRATION_PULSE, alive until the last pulse); produced by the class-neutral `extract-simc-ability-cooldowns.mjs` |
| `src/data/game/paladin-protection-spender-costs.json` (M10-C4) | `SIMC_DBC_PALADIN_PROTECTION_SPENDER_COSTS` | the `__spellpower_data` rows of Shield of the Righteous (53600: Holy Power cost 3, and the aura-conditioned Instrument of the Divine variant) and Word of Glory (85673), with each spell's cooldown / GCD / charge / cast-time scalars and the `cost()` first-row rule; produced by the new class-neutral `extract-simc-power-costs.mjs`, which checks the `spellpower_data_t` layout and reads `POWER_HOLY_POWER` from `sc_enums.hpp` |
| `src/data/game/paladin-protection-enchant-effects.json` (M10-C correction 1) | `SIMC_DBC_PALADIN_PROTECTION_ENCHANT_USE_EFFECTS` | every permanent enchant (7961, 8031, 7987, 8159, 8019, 7967, 7981), temporary enchant (7143) and gem (240890 → enchant 8117, 240983 → 8552) the subject's combatant info reports, each pinned as NOT creating a use effect (`ench_type` never ITEM_ENCHANTMENT_USE_SPELL = 7, verified against `data_enums.hh`); produced by the new class-neutral `extract-simc-enchant-effects.mjs`, which checks the `item_enchantment_data_t` / `gem_property_data_t` / `dbc_item_data_t` / `temporary_enchant_entry_t` / `permanent_enchant_entry_t` layouts before reading a row and hashes `engine/item/enchants.cpp` for the hand-reviewed rule. M10-C2 added `useEffectUniverse`: a census of ALL 5,334 enchant rows — 39 create a use effect; 0 are temporary enchants, 18 are permanent enchants whose `permanent_enchant.inc` inventory-type mask is 0x10042 (waist, back, head), 7 are gem-borne, and 14 have no pinned placement at all — with every summary re-derived from the rows by the runtime validator. M10-C3 resolved every row's USE spell against `sc_spell_data.inc` (cooldown, internal cooldown, category, charges, GCD, cast time, effect rows and trigger spell), applied SimulationCraft's generic buff/action rules from `special_effect.cpp`, and censused `register_special_effect` across all seven `unique_gear*.cpp` modules: 5 rows have a USE spell absent from the pinned table, 6 are scripted, 19 are gem-borne once forward gem links are followed, 3 have no pinned placement |

Two facts a reader should not have to rediscover: Shield of the Righteous,
Avenging Wrath, Sentinel and Ardent Defender are all `_gcd` 0 (NON_GCD to the
first-GCD query); and `avenging_wrath` binds to TWO records (31884 and 389539)
because Protection's `create_action` substitutes `sentinel_t` when the
Sentinel talent is taken (`sc_paladin_protection.cpp:980-981`) — both lane 0,
so the token's lane holds without deciding the talent.

Why the enchant artifact exists at all: `use_items` with no `slots=` builds a
sub-action for every worn slot whose ITEM, GEM or ENCHANT carries a use effect
(`use_items_t::create_use_subactions`, player.cpp:10456-10463). The item
artifact answers the first source; without the other two, "exactly one
sub-action exists" would be a hope, and the `use_items` transition contract
could not be admitted.

What the universe census establishes, and what it cannot: an omitted
`temporaryEnchant` key on a Warcraft Logs gear row is irrelevant to the
sub-action set (no temporary enchant in the build creates a use effect). An
omitted `permanentEnchant` key is NOT closable by type — 3 use-producing rows
have no placement any pinned table states, and real permanent tinkers admit
the waist and back — and an omitted `gems` key is not closable without a
socket model. M10-C3 then asked whether the admitted candidates are at least
observationally equivalent (`src/simc/subaction-equivalence.ts`); they are
not, because the candidate sets contain rows whose USE spell is absent from
the pinned table, scripted rows, a row that casts for 500 ms, rows that deal
damage or heal (observable under the subject's Divine Inspiration), and rows
with no cooldown. Those omissions kept `default[2] use_items` unresolved on the M10-B subject
until M10-C4, when a written Warcraft Logs statement (2026-09-17: the fields
carry what its UI shows, omission means none, no further guarantee) was
adopted as the dated adapter contract `WCL_COMBATANT_INFO_GEAR_UI_SEMANTICS_
2026_09_17` in `combatant-info.ts` — a Warcraft Logs fact, not a
SimulationCraft one, and the census and equivalence proof still guard any
payload whose identities are present but unreadable.

NOT pinned at M10-C (after correction 1), and therefore refused rather than
modelled: any Paladin cooldown durations other than wings' base 120,000 ms,
the Holy Power cost of the spenders (the DBC power table was not extracted),
any Paladin aura identities (so every `buff.<name>.*` atom is enumerated,
except `buff.avenging_wrath.up` in a branch where wings has fired), and any
transition contract beyond `auto_attack`, `potion`, `fireblood`,
`avenging_wrath` and the one reviewed on-use driver 1297761
(`paladin-protection-transition-authority.ts`, which also cites
`unique_gear_midnight.cpp` for the scripted trinket).

```bash
node scripts/authority/extract-simc-gcd.mjs --target paladin-protection \
  --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 --extracted-on 2026-09-16
node scripts/authority/extract-simc-talents.mjs --target paladin-protection \
  --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 --extracted-on 2026-09-16
node scripts/authority/extract-simc-item-effects.mjs --target paladin-protection \
  --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 --extracted-on 2026-09-16
node scripts/authority/extract-simc-enchant-effects.mjs --target paladin-protection \
  --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 --extracted-on 2026-09-16
node scripts/authority/extract-simc-power-costs.mjs --target paladin-protection \
  --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 --extracted-on 2026-09-17
node scripts/authority/extract-simc-ability-cooldowns.mjs --target paladin-protection \
  --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 --extracted-on 2026-09-18
```

The cooldown extractor reads fifteen pinned files since M10-C5 Phase B2
(`specialization_spells.inc` and `class_spells.inc` joined the eleven of
Phase A, and the final audit added `engine/player/ground_aoe.hpp` and
`ground_aoe.cpp`, from which the ground-effect LIFETIME a `<x>.up`
expression reads is checked mechanically: the active pointer is cleared at
every pulse and re-set only while one hasted tick still fits, so the effect
dies at its last pulse and a consumer may claim TRUE only while
elapsed ≤ duration − 1,000 ms); every one may be supplied from a local checkout with a
`--local-<name>` flag, and the artifact records each file's SHA-256.

Reproduce:

```bash
node scripts/authority/extract-simc-apl.mjs --target paladin-protection   --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9   --commit-date 2026-09-12   --expect-sha256 ed3fb1ac5b1c6c83bf21abbcaff5afe282678a69d51bdc953cc9897dca94bc02   --out src/simc/data/paladin-protection.apl.json
```

## Retribution Paladin APL and game data — pinned at M11-A3/A4 (analyzer PUBLIC since M11-A5)

The `//retribution_apl_start .. //retribution_apl_end` region of the SAME
`apl_paladin.cpp` at the SAME commit (`void retribution( player_t* p )`,
five lists: `default` 4, `precombat` 8, `cooldowns` 11, `finishers` 4,
`generators` 14; `call_action_list` only — no `run_action_list`, no
`swap_action_list`, no `target_if`).

| | |
| --- | --- |
| Source file | `engine/class_modules/apl/apl_paladin.cpp` |
| Source SHA-256 | `ed3fb1ac5b1c6c83bf21abbcaff5afe282678a69d51bdc953cc9897dca94bc02` |
| Artifact | `src/simc/data/paladin-retribution.apl.json` (`SIMC_APL_PALADIN_RETRIBUTION`, revision `simc-33622e9d-1`) |
| Extracted | 2026-09-18, `--target paladin-retribution` (`RETRIBUTION_CALL_GRAPH` facts verified: `finishers` is called at `generators[0]` under a gate and at `generators[5]` unconditionally; each spender appears once; `ds_castable`'s value expression and `pre_es_wake`'s reset-only assignment are pinned) |
| Bound to | `OFFENSIVE_ROTATION` only, by `src/specs/paladin/retribution/registration.ts` through the tree's own `pinned-authority.ts`. A DISTINCT authority id from Protection's over the same file and commit; the registry's duplicate rule keys on the id and the domain. INTERNAL_ONLY. |

The game data, all `--target paladin-retribution` at the same pin:

| Artifact | Dataset id | Contents |
| --- | --- | --- |
| `src/data/game/paladin-retribution-gcd-semantics.json` | `SIMC_DBC_PALADIN_RETRIBUTION_GCD_SEMANTICS` | 29 `_gcd` records (every APL action and the observed-only abilities of the two subjects), 17 hand-reviewed token bindings (`templars_verdict` → {85256, 383328 Final Verdict}, `judgment` 20271, `hammer_of_wrath` 24275, `rebuke` 96231 gcd 0, the racials, …), 5 meta lanes (`auto_attack`, `use_item`, `use_items`, `potion`, `invoke_external_buff`) |
| `src/data/game/paladin-retribution-talents.json` | `SIMC_TRAIT_PALADIN_RETRIBUTION_TALENTS` | 18 talents including the Art of War / Righteous Cause choice node (81523), Radiant Glory (a NORMAL node — UNKNOWN when absent, never NOT_SELECTED), and the Templar (48) / Herald of the Sun (50) hero sub-trees for spec 70; no apex traits |
| `src/data/game/paladin-retribution-cooldowns.json` | `SIMC_DBC_PALADIN_RETRIBUTION_ABILITY_COOLDOWNS` | Wake of Ashes, Divine Toll, Execution Sentence, Avenging Wrath (constructor-only; the spec passive's −60,000 ms makes the effective base exactly 60 s) and Blade of Justice (HASTED, optional second charge — REFUSED by the bindings), with the machine census and three DECLARED Blade of Justice reset mutations under `AURA_APPLICATION_ON_ACTOR` / `AURA_STACK_CHANGE_ON_ACTOR` signatures; the extractor reads the spec module through a per-target `sourceOverrides` |
| `src/data/game/paladin-retribution-spender-costs.json` | `SIMC_DBC_PALADIN_RETRIBUTION_SPENDER_COSTS` | Divine Storm 53385, Templar's Verdict 85256 and Final Verdict 383328 — Holy Power cost 3 each, no cooldown of any kind (which is what lets a non-observed spender be PROVEN usable when the pool is KNOWN affordable) |
| `src/data/game/paladin-retribution-item-effects.json` | `SIMC_DBC_PALADIN_RETRIBUTION_ITEM_USE_EFFECTS` | the two subjects' main-hand weapons only (251230, 237846; `INVTYPE_2HWEAPON` = 17) — `templars_verdict_t` is background without a two-hander, and item USE effects are outside the rotational decision domain, so no trinket is pinned |

Hand-reviewed and hashed beside them:
`src/data/game/paladin-retribution-aura-authority.ts` (the eight aura
identities, including the Hammer of Wrath readiness aura the log emits as
1241410 where the module builds 1277026, and the producing talent of each
stack atom), `paladin-retribution-transition-authority.ts` (`auto_attack`,
`rebuke`) and `paladin-retribution-foreground-execution-authority.ts` (the
one FOREGROUND-ONLY execution fact: spell 31884 is executed only by the
foreground `avenging_wrath` constructor, the background/triggered wings
being 454351 — what lets an observed 31884 cast settle the Radiant Glory
guard that the three-way talent rule cannot). The shared parsers `spender-cost-artifact.ts` and
`ability-cooldown-artifact.ts` were factored out of the Protection modules
at A4 so both Paladin trees read one implementation; the Protection
artifacts regenerate byte for byte.

```bash
node scripts/authority/extract-simc-apl.mjs --target paladin-retribution \
  --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 --commit-date 2026-09-12 \
  --expect-sha256 ed3fb1ac5b1c6c83bf21abbcaff5afe282678a69d51bdc953cc9897dca94bc02 \
  --out src/simc/data/paladin-retribution.apl.json
node scripts/authority/extract-simc-gcd.mjs --target paladin-retribution \
  --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 --extracted-on 2026-09-18
node scripts/authority/extract-simc-talents.mjs --target paladin-retribution \
  --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 --extracted-on 2026-09-18
node scripts/authority/extract-simc-ability-cooldowns.mjs --target paladin-retribution \
  --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 --extracted-on 2026-09-18
node scripts/authority/extract-simc-power-costs.mjs --target paladin-retribution \
  --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 --extracted-on 2026-09-18
node scripts/authority/extract-simc-item-effects.mjs --target paladin-retribution \
  --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 --extracted-on 2026-09-18
```

Every file was supplied from the local pinned copies (`--file`,
`--file-<key>`, `--local-<key>`); no file outside the A3-named set was
fetched.

## Blood Death Knight APL and game data — pinned at M11-B2 (analyzer INTERNAL_ONLY)

The `C_RUN_ACTION_LIST_DISPATCH` cohort's representative specialization,
pinned as a MEASUREMENT slice: the first authority with `run_action_list`
entries the analyzer reads, and the first with client-version guards.

| | |
| --- | --- |
| Source file | `engine/class_modules/apl/apl_death_knight.cpp` |
| Source SHA-256 | `e381da691875ceecb8357a76e90fef9e01f3a200c67da7024deff1ca7f728df6` |
| Artifact | `src/simc/data/deathknight-blood.apl.json` (`SIMC_APL_DEATHKNIGHT_BLOOD`, revision `simc-33622e9d-1`) |
| Extracted | 2026-09-18, `--target deathknight-blood` from the local pinned copy under `.probe/m11a3-authority-audit/` (six lists, 56 actions; the `DISPATCH_GRAPH` facts verified: `default[13]` CALLS `high_prio_actions`, `default[14..16]` RUN `deathbringer` / `san_gift` / `sanlayn` under the pinned gates, no `swap_action_list`, no `target_if`) |
| Client-version guards | The target declares `clientVersion: [12, 1, 0]`; the region's twelve `p->sim->dbc->wowv()` guards were EVALUATED — five `< 12.1.0` branches dropped (nine statements, the Coagulopathy Death Strike line among them), seven `>= 12.1.0` branches kept (eight statements) — and every guard is recorded under `provenance.conditionalCompilation`, which `src/simc/authority-artifact.ts` validates |
| Bound to | `OFFENSIVE_ROTATION` only, by `src/specs/deathknight/blood/registration.ts` through the tree's own `pinned-authority.ts`. INTERNAL_ONLY: the five public sites are untouched. |

The game data, all `--target deathknight-blood` at the same pin:

| Artifact | Dataset id | Contents |
| --- | --- | --- |
| `src/data/game/deathknight-blood-gcd-semantics.json` | `SIMC_DBC_DEATHKNIGHT_BLOOD_GCD_SEMANTICS` | 24 `_gcd` records (every APL action and the observed-only abilities of the two subjects), 17 hand-reviewed token bindings (`heart_strike` → {206930, 433895 Vampiric Strike}, `any_dnd` → 43265 as the pinned alias of `death_and_decay`, `dancing_rune_weapon` 49028 gcd 1500, `raise_dead` 46585 gcd 0, `vampiric_blood` 55233 gcd 0, `consumption` 1263824 gcd 500, the racials, …), 4 meta lanes (`auto_attack`, `use_item`, `use_items`, `potion`); the extractor reads the class module only (no spec module exists for Death Knight) |
| `src/data/game/deathknight-blood-talents.json` | `SIMC_TRAIT_DEATHKNIGHT_BLOOD_TALENTS` | 13 talents (the action-building class/spec talents and the hero talents whose absence makes an aura impossible), all NORMAL nodes (absent → UNKNOWN, never NOT_SELECTED), and the San'layn (31) / Deathbringer (33) hero sub-trees for spec 250; the Warcraft Logs `nodeID` ↔ `id_node` equivalence recorded for actor 14 of both captures |
| `src/data/game/deathknight-blood-cooldowns.json` | `SIMC_DBC_DEATHKNIGHT_BLOOD_ABILITY_COOLDOWNS` | Dancing Rune Weapon ONLY: 120,000 ms, one censused passive (Insatiable Blade, −30,000 ms), no dynamic mutation; the extractor grew `moduleConventions` (no recharge-rate mechanism, no hasted-cooldown member) and nullable `sourceOverrides` so a class without a spec module is a generic target. Vampiric Blood is deliberately unpinned (Red Thirst adjusts it dynamically, sc_death_knight.cpp:13143-13147) |
| `src/data/game/deathknight-blood-spender-costs.json` | `SIMC_DBC_DEATHKNIGHT_BLOOD_SPENDER_COSTS` | Death Strike 49998 (450 tenths of Runic Power), Heart Strike 206930 and Vampiric Strike 433895 (1 Rune each), Marrowrend 195182 (2 Runes), Death's Caress 195292 (1 Rune, 6 s cooldown), Death and Decay 43265 (1 Rune); `POWER_RUNE` and `POWER_RUNIC_POWER` joined the power enumerators |

| `src/data/game/deathknight-blood-aura-durations.json` (M11-B4) | `SIMC_DBC_DEATHKNIGHT_BLOOD_AURA_DURATIONS` | The five auras the pinned list reads as `buff.<name>.remains`: `_duration`, every duration modifier matched as `parse_passive_effects` matches (class flags within the family, or label) with its applicability, the FINAL Blood duration, `_max_stack`, `_internal_cooldown`, the refresh attributes (`SX_REFRESH_EXTENDS_DURATION`, `SX_AURA_DOES_NOT_REFRESH`, periodic effects) and the remains model — Bone Shield 30,000 ms, Essence of the Blood Queen 20,000 + 5,000 (spell 137008 "Blood Death Knight", an SX_PASSIVE `specialization_spells.inc` entry, effect 1187090 by label 3134) = 25,000 ms, Crimson Scourge 15,000, Visceral Strength 12,000, Vampiric Strike PERMANENT (`_duration` −1). `extract-simc-blood-aura-durations.mjs` emits only `FIXED_DURATION_RESET_ON_GAIN` and `PERMANENT`; a pandemic / non-refreshing / ticking aura or a build-dependent (talent) modifier fails extraction. The enumerators are read from `data_enums.hh`, the row layouts from `spell_data.hpp`, and the Garrote / Rupture durations the DoT artifact pinned are re-read as column anchors |

Hand-reviewed and hashed beside them:
`src/data/game/deathknight-blood-aura-authority.ts` (thirteen aura
identities — the eight bound presence atoms, the three stack atoms, the two
`.remains`/debuff identities recorded so the measurement can name them — each
with its producing talent and, where every producer is a hero talent of one
sub-tree, the owning tree) and `deathknight-blood-transition-authority.ts`
(`auto_attack`, `vampiric_blood`, `raise_dead`). The Rune (5) and Runic
Power (6) wire contracts joined `src/data/wcl-wire/resource-types.ts`,
corroborated by the committed 45 s slice.

```bash
node scripts/authority/extract-simc-apl.mjs --target deathknight-blood \
  --file .probe/m11a3-authority-audit/apl_death_knight.cpp \
  --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 --commit-date 2026-09-12 \
  --expect-sha256 e381da691875ceecb8357a76e90fef9e01f3a200c67da7024deff1ca7f728df6 \
  --extracted-on 2026-09-18 --out src/simc/data/deathknight-blood.apl.json
node scripts/authority/extract-simc-gcd.mjs --target deathknight-blood \
  --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 --extracted-on 2026-09-18
node scripts/authority/extract-simc-talents.mjs --target deathknight-blood \
  --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 --extracted-on 2026-09-18 \
  --file-traitData .probe/simc-33622e9d/trait_data.inc \
  --file-traitLayout .probe/simc-33622e9d/trait_data.hpp \
  --file-clientDataVersion .probe/simc-33622e9d/client_data_version.inc
node scripts/authority/extract-simc-power-costs.mjs --target deathknight-blood \
  --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 --extracted-on 2026-09-18
node scripts/authority/extract-simc-ability-cooldowns.mjs --target deathknight-blood \
  --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 --extracted-on 2026-09-18
# M11-B4 (2026-09-19); every source may also be supplied locally with --local-<key>
# and pinned with --expect-<key>-sha256, as it was from the fetched pinned copies
node scripts/authority/extract-simc-blood-aura-durations.mjs \
  --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 \
  --out src/data/game/deathknight-blood-aura-durations.json
```

The Death Knight class module (`engine/class_modules/sc_death_knight.cpp`,
SHA-256 `beed4d7cffad6a548dc1791eef6f4208c308d53836b46d644e4e9c9c95058d39`),
`engine/dbc/spell_data.cpp` and `engine/dbc/generated/power_type_data.inc`
were fetched once at the pinned commit for the hand reviews and the
extractors' local-file flags; for M11-B4 `engine/buff/buff.cpp`,
`engine/dbc/data_enums.hh`, `engine/dbc/generated/sc_spell_data.inc` and
`engine/dbc/generated/specialization_spells.inc` were fetched the same way
(their hashes are recorded in the duration artifact, and the two generated
files' hashes equal the ones the Rogue DoT artifact records). None is
retained in the repository. The
three existing APL artifacts and both Paladin cooldown artifacts regenerate
byte for byte under the extended extractors.

## What the extractor guarantees

**It fails closed.** It is not a general C++ parser and does not pretend to be.
Inside the bounded region between `//assassination_apl_start` and
`//assassination_apl_end` it understands exactly four constructs:

- the `void assassination( player_t* p )` header, and braces
- `action_priority_list_t* NAME = p->get_action_priority_list( "listname" );`
- `NAME->add_action( "string" );`
- `NAME->add_action( "string", "comment" );`

Anything else inside that region is a hard failure with a line number. A silently
skipped line would produce an artifact that looks complete while missing an
action, and every reachability proof built on it would be void.

**It verifies the required authority facts against the pinned source**, not
against anyone's description of it. Extraction aborts unless all of these hold:

- entry list is `default`
- `default` calls `cds`, `core_dot`, `generate`, `spend` in that order
- the `spend` call condition is exactly
  `!buff.darkest_night.up&combo_points>=5|buff.darkest_night.up&combo_points.deficit=0`
- the `generate` call condition is exactly
  `!buff.darkest_night.up&combo_points<5|buff.darkest_night.up&combo_points.deficit>0`
- `envenom` appears in exactly one list, and that list is `spend`
- `crimson_tempest` appears in `generate`
- all nine Assassination lists are present

If a future commit fails one of these, **report the discrepancy**. Do not edit
the expectations until they match — that would be rewriting the rotation and
calling the rewrite the authority.

## What the artifact stores

`actionStringVerbatim` is the exact first string argument passed to
`add_action` in the source.

It is deliberately **not** a synthesized `actions+=/…` line. The source contains
no such line; it contains C++ `add_action(...)` calls. Calling a fabricated
string "verbatim" would be a false provenance claim.

Derived fields — `actionToken`, `conditionRaw`, `callsListName` — are **not**
stored. They are computed at load time from the verbatim string, so there is one
source of truth and derivation cannot drift. A contract test rejects an artifact
that stores them.

---

# GCD semantics extraction

`extract-simc-gcd.mjs` produces `src/data/game/rogue-gcd-semantics.json`: the
base GCD, in milliseconds, of each spell the supported Assassination slice needs.

## Why this artifact exists

SimulationCraft decides whether an executed foreground action consumed the
player's rotational GCD slot with exactly one predicate:

```cpp
// engine/player/player.cpp:7397
if ( action->trigger_gcd > timespan_t::zero() )
  prev_gcd_actions.push_back( action );
else
  off_gcdactions.push_back( action );
```

and for a spell-backed action `trigger_gcd` comes straight from spell data
(`action.cpp:645` → `spell_data.hpp:558` → `spell_data_t::_gcd`, milliseconds).
So the whole runtime primitive is one unsigned integer per numeric spell id.

**The artifact stores base GCD only.** The execution lane is `baseGcdMs > 0`,
derived at read time, and a validator rejects an artifact that stores a lane.

## Currently pinned

| | |
| --- | --- |
| **Commit** | `33622e9d1662ff0e451691edf85a6b49cc9d11d9` |
| Client build | `12.1.0.69587` |
| Hotfix date / build | 2026-09-10 / 69587 |
| Artifact | `src/data/game/rogue-gcd-semantics.json` |
| Extracted | 2026-09-12 |

| Source | Role | SHA-256 |
| --- | --- | --- |
| `engine/dbc/generated/sc_spell_data.inc` | parsed | `d8e3d1970520f2161de6d5a59aa5ea0e7c81eaef14c6bc980d5a208ed33b4c62` |
| `engine/dbc/generated/class_spells.inc` | parsed | `85ad0bcec9885423576d8945c74f1de212fe039bfee54bc725d1024509ae389b` |
| `engine/dbc/generated/client_data_version.inc` | parsed | `226a0e619d6de3ff901652aa16ab4770c0acf26e6db5ae691ee8e026e1eac293` |
| `engine/dbc/spell_data.hpp` | parsed (field order) | `ef81b1bb9a64f0605256b8889b55fff338229ecdb477a37f4a44bd487e5a390a` |
| `engine/class_modules/sc_rogue.cpp` | **hashed only, never parsed** | `209e95265aae4168cf7cda57d1b241dda6361971ba6849a9262bd933bff3e13e` |

## Reproduce

`sc_spell_data.inc` is ~29 MB, so fetching it is the slow part. Pass `--file-*`
to read local copies instead.

```bash
node scripts/authority/extract-simc-gcd.mjs \
  --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 \
  --extracted-on 2026-09-12 \
  --expect-spellData-sha256 d8e3d1970520f2161de6d5a59aa5ea0e7c81eaef14c6bc980d5a208ed33b4c62 \
  --expect-classSpells-sha256 85ad0bcec9885423576d8945c74f1de212fe039bfee54bc725d1024509ae389b \
  --expect-clientDataVersion-sha256 226a0e619d6de3ff901652aa16ab4770c0acf26e6db5ae691ee8e026e1eac293 \
  --expect-spellDataLayout-sha256 ef81b1bb9a64f0605256b8889b55fff338229ecdb477a37f4a44bd487e5a390a \
  --expect-rogueModule-sha256 209e95265aae4168cf7cda57d1b241dda6361971ba6849a9262bd933bff3e13e \
  --out src/data/game/rogue-gcd-semantics.json
```

Deterministic: the same commit yields a byte-identical artifact apart from
`extractedOn`, which `--extracted-on` pins.

## What this extractor guarantees

**The `_gcd` column index is derived, not assumed.** It reads the `spell_data_t`
definition out of `spell_data.hpp`, counts scalar members to `_gcd`, and aborts
if that index is not the one the row parser uses. An upstream field inserted
before `_gcd` fails loudly instead of silently shifting every value by one
column. It skips the forward declaration and strips trailing comments, because
both would otherwise make it read the wrong block.

**Three independently known GCDs are re-measured as sanity anchors** — Power
Word: Shield 1500 ms, Backstab 1000 ms, Frostbolt 1500 ms. They prove the column
without reference to anything this milestone is trying to establish, and they are
excluded from the runtime slice.

**A required id that is missing, renamed, or present twice is a hard failure.**
A repeated id is never reduced to one reading.

**Class-ability token bindings are cross-checked** against `class_spells.inc`.
That table is what settles that `ambush` is spell **8676** — this build contains
four spells named "Ambush", and the name alone cannot pick one.

**Every extracted value is compared against the recorded expectation.** If a
future pin disagrees, **report the discrepancy**. Do not edit the expectations
until they match.

## Two kinds of knowledge, labelled separately

The artifact carries two halves with **different** provenance, and says so:

| | Relation | Method | How |
| --- | --- | --- | --- |
| Ability data | spell id → `baseGcdMs` | `MACHINE_EXTRACTED_DBC_RECORD` | parsed from the generated DBC table |
| Token binding | token → candidate spell ids | `HAND_REVIEWED_CPP_CONTROL_FLOW` | a human read `sc_rogue.cpp` |

**This project does not parse C++ and will not.** `sc_rogue.cpp` is loaded and
hashed so a reviewer can confirm they are reading the exact bytes a binding rests
on, and it is never parsed. Each binding carries `method`, `sourcePath`,
`sourceSha256` (measured, not transcribed), `symbol`, `startLine`, `endLine`,
`sourceNote` and `crossCheck`.

`MACHINE_EXTRACTED_DBC_RECORD` is deliberately **not** a member of the binding
method union, so a hand-reviewed reading cannot be promoted by editing one
string.

The generator verifies that every id a hand-reviewed binding names is a real
record in the machine-extracted table, with the expected name and GCD. The
hand-reviewed half can never introduce a spell the DBC data does not carry.

## Token bindings are not one-to-one

A SimulationCraft token is not always one spell. `thistle_tea` binds through a
talent branch (`sc_rogue.cpp:10237-10238`, `rogue_t::init_spells`), so **both**
reachable records are recorded — 381623 and 469779 — and neither branch is
chosen. A token's execution lane is established only when every candidate agrees;
if they disagreed the answer would be `UNKNOWN_LANE`.

`crossCheck: CLASS_SPELLS` on the other five bindings means the id is
additionally confirmed against `class_spells.inc`. That corroborates that an id
IS a Rogue class ability; it never establishes that a given APL token uses it.
Only the C++ reading does that.

---

# Talent extraction

`extract-simc-talents.mjs` produces `src/data/game/rogue-talents.json`: the
numeric trait identities for the talents the pinned `default[4]` Ambush condition
names.

## Why the alternatives travel with the talent

A Warcraft Logs `combatantinfo` talent entry is `{ id, rank, nodeId }`. A CHOICE
node offers several entries and the player picked one, so **node presence is not
selection**. The real build this was verified against carries node 90692 — the
Improved Ambush node — with entry 117152, which is Tight Spender. Matching on
`nodeId` would have resolved `talent.improved_ambush` TRUE when it is FALSE.

So every talent carries its sibling entries, and selection is decided by ENTRY id:

| Observed | Result |
| --- | --- |
| the talent's own entry | `SELECTED` |
| a known sibling at that node | `NOT_SELECTED` |
| node present, entry unknown | `UNKNOWN` |
| node absent | `UNKNOWN` — **not** `NOT_SELECTED` |

## Currently pinned

| | |
| --- | --- |
| **Commit** | `33622e9d1662ff0e451691edf85a6b49cc9d11d9` |
| Client build | `12.1.0.69587` |
| Artifact | `src/data/game/rogue-talents.json` |
| Extracted | 2026-09-12 |

| Source | SHA-256 |
| --- | --- |
| `engine/dbc/generated/trait_data.inc` | `7818328b2f870167cffefcb4e6571ec582dc3399064ac9d69a390d9becaa66b2` |
| `engine/dbc/trait_data.hpp` | `87c5f11d99b9caae4f56839b0d0cfe89b64da4441017d5d066ba11be5b547e6b` |
| `engine/dbc/generated/client_data_version.inc` | `226a0e619d6de3ff901652aa16ab4770c0acf26e6db5ae691ee8e026e1eac293` |

```bash
node scripts/authority/extract-simc-talents.mjs \
  --sha 33622e9d1662ff0e451691edf85a6b49cc9d11d9 \
  --extracted-on 2026-09-12 \
  --expect-traitData-sha256 7818328b2f870167cffefcb4e6571ec582dc3399064ac9d69a390d9becaa66b2 \
  --expect-traitLayout-sha256 87c5f11d99b9caae4f56839b0d0cfe89b64da4441017d5d066ba11be5b547e6b \
  --expect-clientDataVersion-sha256 226a0e619d6de3ff901652aa16ab4770c0acf26e6db5ae691ee8e026e1eac293 \
  --out src/data/game/rogue-talents.json
```

## What this extractor guarantees

**The `trait_data_t` field order is verified, not assumed** — the first fourteen
members are checked against the pinned declaration before any row is read.

**Choice-node structure is verified both ways.** A `CHOICE` node with no siblings
is a hard failure, and so is a `NORMAL` node that shares its node with other
entries. Either would silently degrade selection into a node-presence rule.

**A spec-tree talent must be available to Assassination**, or extraction aborts —
a row scoped to other specs would not apply to the analyzed player.

**A duplicate or missing talent name is a hard failure**, never a pick.

## The Warcraft Logs id-space claim is scoped

The equivalence `WCL id == id_trait_node_entry` and `WCL nodeId == id_node` was
corroborated against **three independent selected entries for two actors** in one
report (Improved Garrote 112510/90625, Shrouded Suffocation 112669/90776, Tight
Spender 117152/90692). The artifact records that scope explicitly and does **not**
claim the mapping holds for Warcraft Logs in general. Widening the claim needs a
second independent report.

## Re-pinning either artifact

1. Run the extractor with the new SHA and no `--expect-*` hashes.
2. Record the printed hashes here and in the command above.
3. Update the tables above.
4. Run `npm test`. `tests/contracts/m5-authority-artifact.test.ts` and
   `tests/contracts/m5c1-gcd-semantics.test.ts` re-assert every required fact
   against the committed files.
5. If a verdict changed, say so explicitly in the change description. A pinned
   authority moving is a behavioural change, not a refresh.
