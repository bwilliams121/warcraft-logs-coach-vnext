# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-S1: shared precombat action-list execution for APL variables. Branch
`autopilot/onb-s1`, from main at 4115969.

- **Internal shared engine only.** No change under `src/contracts/`,
  `src/api/` or `src/mcp/`. No specialization module changes.
- **Warcraft Logs: NONE.** No request, probe or capture.
- Queue bookkeeping: M15-C recorded MERGED (PR #39, 41159692…); ONB-S1 set
  PR_OPEN.

## Direction

`agent/autopilot-queue.md` ONB-S1, from `agent/follow-ups.md` "After
M11-D3-C2" (precombat variables). Many Cohort A/B variables are assigned only
in precombat, so before this change every combat read of them was UNKNOWN.

## Pinned semantics (SimulationCraft 33622e9d, local source slice)

- Reset: every variable takes its `default_value_` (player.cpp:6727-6728),
  the `default=` of the FIRST variable action constructed for its name
  (variable.cpp:108-125). Construction order is precombat, default, then
  alphabetical (player.cpp:526-559, 4199-4243). A line made background by
  the constructor (no name, unknown op, missing value/condition/value_else,
  variable.cpp:52-98) creates no variable.
- `combat_begin` runs every ready precombat action in order
  (player.cpp:6150-6183). Once a harmful action enters combat
  (action.cpp:1841-1842) the walk breaks after the next channelled or
  zero-travel action (player.cpp:6180-6181).
- `op=reset` restores `var->default_value_` (variable.cpp:321-323), not the
  line's own `default=`.

## Files

### `src/simc/precombat-variables.ts` (new)

- `precombatBindings(bindings)`: talents and the spec vocabulary only.
  Resources are UNKNOWN; no buffs, DoTs, cooldowns or spec atom values. So
  pre-pull buff/resource-dependent values stay UNKNOWN (or a join), and
  talent-, constant- and default-derived values resolve.
- `executePrecombatVariables(authority, bindings)`: starts from the
  established defaults and runs each precombat variable line through the
  existing `executeVariableLine`.
  - A non-variable line that is not one of the pinned non-harmful core
    actions (`snapshot_stats`, `flask`, `food`, `augmentation`, `potion`;
    snapshot_stats.cpp:16-25, consumable.cpp:791-808) may stop the walk.
    Every later variable line's effect is then joined with the state before
    it.
  - A precombat list dispatch carries nothing.
  - It returns per-line steps (evidence) and a carry:
    `CARRIED { values, writtenInCombat }`, `NOT_CARRIED { reason }` or
    `NO_PRECOMBAT_VARIABLES`.
- Carried: only names that no combat list writes. A combat write means the
  incoming value is an earlier scan's, so it stays UNKNOWN as before. A
  malformed precombat line (taint), or a malformed combat variable line
  (unattributable write), carries nothing.
- `incomingScanVariables`: the memoised start state for combat scans.

### `src/simc/variable-execution.ts`

- `establishedVariableDefaults(authority)` (memoised) and
  `constructionOrder`. A malformed line gives an empty map (every default
  unestablished); an unreadable `default=` is UNKNOWN.
- `executeVariableLine` takes optional `defaults`. With them, reset restores
  the established default. `DEFAULT_LITERAL` now admits a leading minus
  (opt_float accepts one).

### `src/simc/nested-selection.ts`

`selectAcrossLists` and `resolveOneForegroundScan` start from
`incomingScanVariables(...)` instead of the empty state, and pass the
established defaults to variable execution. Joins and read precedence are
unchanged. A carried value is a scan assignment, so it takes precedence
over a spec seed. Retribution's `pre_es_wake` is KNOWN 0 either way.

## Public re-measure (no public decision may change without a reason)

The carried values on the five pinned public authorities:

- **Retribution:** `pre_es_wake` KNOWN 0 (identical to the seed),
  `trinket_*_buffs` UNKNOWN, `trinket_*_sync` one of {0.5, 1}, and
  `trinket_priority` one of {1, 2}.
- **Assassination:** `trinket_sync_slot` one of {0, 1, 2}.
- **Blood, Brewmaster, Protection:** no precombat variable.

Every combat read of a trinket variable is in a condition that also contains
unparsed `trinket.*`/`fight_remains`, which stays UNSUPPORTED. So no public
decision changes. Confirmed by the unchanged corpus, evidence and public
regression suites (below). These values are pinned in the new test.

## Tests

`tests/unit/onb-s1-precombat-variables.test.ts` (18):

- defaults (first-constructed wins across list order; background lines
  skipped; malformed gives empty; unreadable gives UNKNOWN);
- a constant carries;
- talent-derived resolves both ways, and an unknown talent gives
  {0, 1} → UNKNOWN decision;
- negative: the combat decision's known combo points or buff is NEVER read
  in precombat;
- reset uses the established default;
- harmful-break join versus the pinned non-harmful set;
- a combat-written variable is not carried (read UNKNOWN);
- malformed or dispatch → NOT_CARRIED;
- an unmodelled op → UNKNOWN, never the default;
- the five pinned public authorities' carried values.

## Validation

- `npx tsc --noEmit`: clean. `prettier --check .`: clean.
- `npm run test:evidence`: PASSED (byte-identical, committed report
  matches).
- `npm run test:corpus`: the workerd runs pass 780/780 twice. The Node
  layer's single failure was a Protection timeout under concurrent load (see
  below).
- Full `vitest run`: the first run was concurrent with the corpus gate, and
  22 failures were all load timeouts (Protection/simulation-runner heavy
  files). The same files pass in isolation, and a base-vs-candidate timing
  on the Protection corpus and projection files is identical (35.3 s main,
  35.0 s candidate).
- A second full run on its own: 11885 passed, 25 failed. 23 of the failures
  are `Test timed out` in the same Protection-heavy and simulation-runner
  files. The other two:
  - the M11-G3-5 runner-queue "no job directory left behind" check, which
    found leftover `wlc-simc-*` temp directories from timed-out runner tests.
    That code (`runner/`, the simulation service) is untouched here.
  - one workerd corpus-gate timeout.

  This workstation is slow under full-suite parallelism; GitHub CI is the
  clean-machine arbiter. `tests/unit/onb-s1-precombat-variables.test.ts`
  passes 18/18.
