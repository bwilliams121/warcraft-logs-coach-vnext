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

---

# Milestone 5-E — the observed-decision comparison layer

M5-A above answers ONE question about ONE action. M5-E composes it with the
first-GCD authority selection into the surface a caller actually uses.

## `analyzeObservedAssassinationDecisions`

The stable internal facade (`observed-analysis.ts`). It takes an
ALREADY-INGESTED normalized fight and returns comparisons plus a coverage
disclosure. It performs no retrieval and knows nothing about HTTP.

Statuses are kept distinct rather than flattened: `ANALYZED`,
`SPEC_NOT_SUPPORTED`, `AUTHORITY_NOT_AVAILABLE`, `PROFILE_NOT_RESOLVED`,
`INSUFFICIENT_EVIDENCE`.

## The three comparison outcomes

| | |
| --- | --- |
| `MATCH` | the authority selection resolved to the SAME token that was observed |
| `REJECTED` | M5-A proved the observed action unselectable, OR the authority resolved a different token |
| `UNKNOWN` | the authority selection did not resolve, the two layers contradicted, or the model said "nothing" while a cast was observed |

**`MATCH` is `authority-compatible` and nothing more.** Not correct, not optimal,
not best play, not recommended, not what the player should have pressed. The
authority is one model of one simulated encounter.

Two things every MATCH carries, because both limit what it means:

- `selectionPrecision` — `EXACT_ENTRY` or `TOKEN_CONVERGED`. Only the first lets
  a consumer quote an authority entry.
- `usabilityProvenance` — normally `OBSERVED_EXECUTION`, because this build's
  only positive usability proof is that the cast fired. A MATCH usually depends
  on the very cast it is comparing against, and that is stated rather than
  implied.

## Eligibility, and why the denominator is small

A decision is eligible when it is an observed COMPLETE cast by the analysed
actor, its execution lane is proven `GCD_CONSUMING`, and it binds to a pinned
authority token. Everything else is EXCLUDED and COUNTED:

| reason | what lands there |
| --- | --- |
| `NON_GCD_ACTION` | proven off-GCD, so not a rotational decision at all |
| `EXECUTION_LANE_NOT_ESTABLISHED` | no pinned GCD record — melee autos, and the deferred builders |
| `NO_AUTHORITY_TOKEN_BINDING` | has a lane, binds to no authority token |

The exclusions are where M5's deferred debt is visible. Counting a builder as
UNKNOWN would claim it is a rotational decision we failed on; dropping it
silently would flatter the denominator.

## Coverage is not a score

`resolvedComparisons / eligibleDecisions` is RESOLVED COVERAGE — how often the
comparison reached any conclusion. There is deliberately no percentage field and
no field whose name could be printed as "percent correct".

## Production status

**PUBLIC.** The facade is bound at the single production composition root
(M6-E) through `registration.ts` (`rogue-assassination-observed-decisions`,
`rogue/assassination`, exposure `PUBLIC`) and is selected by the application
service, raid-night orchestration, REST (`POST /v1/analysis`) and MCP
(`analyze_warcraft_log`) for a resolved `Rogue/Assassination` identity. The
published document is `warcraft-logs-coach.analysis/1`, projected from the
registration's view; `rawBlocker`, the three-state `observedActionRejected`
flag and the per-decision actor id stay inside the payload. Nothing above
about the supported decision surface, the meaning of `MATCH`, or the
exclusions changed when the endpoint was wired. The M5-era record of why
wiring waited is in the Milestone 5 closeout of `agent/architecture.md`.
