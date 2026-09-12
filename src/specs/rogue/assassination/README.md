# Assassination Rogue — supported decision surface (M5-A)

`agent/architecture.md` requires a specialization to state what it supports.
"Works" is not a completion criterion. This is that statement.

## The one supported decision

> Can the pinned SimulationCraft Assassination APL select this observed Envenom
> at the proven combo-point state?

Nothing else. In particular this evaluator does **not** determine what should
have been cast instead. The globally ideal action is UNKNOWN and stays UNKNOWN.

## Supported

| | |
| --- | --- |
| Observed action | Envenom, matched by spell id `32645` |
| Cast phase | `COMPLETE` only |
| Resource | Combo points, via the version-scoped wire contract (`gameVersion` 1 / `logVersion` 17) |
| Accepted state | `EXACT` + `OBSERVED` + `PRE_COST`, read from the cast itself |
| Authority | The pinned SimulationCraft APL, one commit, committed as JSON |
| Authority surface | The `default` list's conditional call to `spend`, and nothing else |
| Expression subset | `!` `&` `\|` `>=` `=` `<` `( )`, non-negative integers, `combo_points`, `combo_points.deficit`, `buff.<name>.up` |
| Unresolved state | Unresolved boolean atoms, correlated, enumerated up to 4 atoms |
| Verdicts | `REJECTED_BY_AUTHORITY`, `UNKNOWN`, `NO_AUTHORITY_AVAILABLE` |

## Not supported

- Any action other than Envenom.
- Envenom's own `if=` conditions inside the `spend` list. They use
  `energy.pct`, `fight_remains`, `target.time_to_die` and
  `spell_targets.fan_of_knives`, none of which is in the supported subset.
- Higher-priority lines (`cds`, `core_dot`, `generate`) and therefore the
  question of which action the APL would actually select.
- The `generate` call condition. It uses `>`, which is outside the subset, so it
  would fail closed if ever evaluated.
- Aura state. Darkest Night is deliberately left unresolved; no aura query is
  made and no Darkest Night spell id is required.
- Talents, hero talents, actionability, encounter phase, cooldowns, multi-target.
- Automatic specialization dispatch. The caller names the actor and asserts the
  spec.

## Why there is no positive verdict

A FALSE gate proves unreachability outright: the `spend` list is never entered,
whatever the lines above it do, so Envenom cannot be selected. That inference
needs nothing else.

A TRUE gate proves almost nothing. It says the list may be entered. It does not
say the APL reaches that line, nor that Envenom's own conditions hold, nor that
Envenom is what would be selected. So a satisfiable gate resolves to
`UNKNOWN` / `ANALYZER_SURFACE_INCOMPLETE`, and there is no `CORRECT`.

## What REJECTED_BY_AUTHORITY means

> The pinned APL cannot select this observed action under every supported
> resolution of the evaluated authority state.

It does **not** mean the player made a mistake. Actionability is
`NOT_EVALUATED`, no replacement action is identified, and nothing is scored.

## Result map

| Observed state | Result |
| --- | --- |
| combo points < 5 (both resolutions fail) | `REJECTED_BY_AUTHORITY` |
| 5 ≤ combo points < max | `UNKNOWN` / `UNRESOLVED_AUTHORITY_STATE` |
| combo points == max | `UNKNOWN` / `ANALYZER_SURFACE_INCOMPLETE` |
| no combo-point entry on the cast | `UNKNOWN` / `EXACT_RESOURCE_UNAVAILABLE` |
| `STALE` or `EVENT_ASSOCIATED` observation | `UNKNOWN` / `EXACT_RESOURCE_UNAVAILABLE` |
| no observed maximum | `UNKNOWN` / `RESOURCE_MAX_UNKNOWN` |
| authority condition outside the subset | `UNKNOWN` / `UNSUPPORTED_AUTHORITY_EXPRESSION` |
| call graph does not prove a sole gate | `UNKNOWN` / `ACTION_REACHABILITY_NOT_PROVABLE` |
| no pinned APL for the spec | `NO_AUTHORITY_AVAILABLE` |
| incompatible parser version, or no ability identity | run is `NOT_EVALUATED` |

## A measured limit worth knowing

A full-fight census of the source capture found that combo points appear in
`classResources` **only on casts that spend them**. There is no generate-side
observation to read, and at least two real Envenom casts carry no combo-point
entry at all despite plainly happening. So:

- absence of a combo-point entry is never zero combo points, and
- `observedEnvenomCastsInScope` is a lower bound on Envenom casts, not a fight
  total.

## Production status

Not wired. `/v1/analysis` still returns `ANALYSIS_NOT_IMPLEMENTED`, no analyzer
is registered, and nothing is deployed.
