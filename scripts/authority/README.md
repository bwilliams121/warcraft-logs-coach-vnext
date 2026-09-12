# SimulationCraft authority extraction

The analyzer has **no runtime dependency** on GitHub, the SimulationCraft site,
or the moving `midnight` branch. It imports a committed JSON artifact generated
from one exact commit. This directory holds the generator and the procedure.

## Currently pinned

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

## Re-pinning

1. Run the extractor with the new SHA and no `--expect-sha256`.
2. Record the printed `sourceSha256` here and in the command above.
3. Update the table above.
4. Run `npm test`. `tests/contracts/m5-authority-artifact.test.ts` re-asserts
   every required fact against the committed file.
5. If a verdict changed, say so explicitly in the change description. A pinned
   authority moving is a behavioural change, not a refresh.
