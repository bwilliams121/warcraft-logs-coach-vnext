# SimulationCraft authority extraction

The analyzer has **no runtime dependency** on GitHub, the SimulationCraft site,
or the moving `midnight` branch. It imports committed JSON artifacts generated
from one exact commit. This directory holds the generators and the procedures.

Two artifacts, two different questions:

| Artifact | Question | Generator |
| --- | --- | --- |
| `src/simc/data/rogue-assassination.apl.json` | what should be done | `extract-simc-apl.mjs` |
| `src/data/game/rogue-gcd-semantics.json` | does doing it consume the rotational GCD | `extract-simc-gcd.mjs` |

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

## Re-pinning either artifact

1. Run the extractor with the new SHA and no `--expect-*` hashes.
2. Record the printed hashes here and in the command above.
3. Update the tables above.
4. Run `npm test`. `tests/contracts/m5-authority-artifact.test.ts` and
   `tests/contracts/m5c1-gcd-semantics.test.ts` re-assert every required fact
   against the committed files.
5. If a verdict changed, say so explicitly in the change description. A pinned
   authority moving is a behavioural change, not a refresh.
