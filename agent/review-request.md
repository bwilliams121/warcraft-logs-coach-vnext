# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-S2: shared APL variable combining operations. Branch `autopilot/onb-s2`,
from main at f1614c7.

- **Internal shared engine only.** No change under `src/contracts/`,
  `src/api/` or `src/mcp/`. No specialization module changes.
- **Warcraft Logs: NONE.** No request, probe or capture. (The pinned
  SimulationCraft `engine/util/util.hpp` was read from GitHub at 33622e9d to
  confirm `decplaces` defaults; nothing from Warcraft Logs.)
- Queue bookkeeping: ONB-S1 recorded MERGED (PR #40, f1614c70…); ONB-S2 set
  PR_OPEN. The other merged tranches the supervisor listed were already
  recorded MERGED with their pr and mergeSha.

## Direction

`agent/autopilot-queue.md` ONB-S2, from `agent/follow-ups.md` "After
M11-D3-C2" (combining operations): `add`, `sub`, `mul`, `div`, `pow`, `mod`,
`min`, `max`, `floor`, `ceil` and `cycling_variable` were not modelled; each
wrote UNKNOWN. Scope: model them with pinned semantics; an operand of unknown
value yields UNKNOWN, never a guessed value.

## Pinned semantics (SimulationCraft 33622e9d, local source slice)

- `variable_t::execute` (variable.cpp:260-333), on doubles:
  - add/sub/mul: `current += v`, `-= v`, `*= v`;
  - div: `v == 0` sets 0, else `current /= v` (:278-287);
  - mod: `v == 0` sets 0, else `std::fmod(current, v)` (:291-300; the value
    expression is evaluated twice, which reads the same state);
  - pow: `std::pow(current, v)`;
  - min/max: `std::min(current, v)`, `std::max(current, v)`;
  - floor/ceil: `util::floor(current)`, `util::ceil(current)`. util.hpp:308-309
    defaults `decplaces` to 0, so util.cpp:3131-3136 / 3161-3166 are `::floor`
    / `::ceil`. The constructor parses no `value=` for them (:135-136).
- `cycling_variable_t::execute` (:369-391): when the sim has more than one
  non-sleeping target, it runs the operation once per entry of the action's
  target list (`available_targets`: non-sleeping enemies, action.cpp:1729-1770)
  with `target` bound to each; otherwise once.

## Files

### `src/simc/variable-execution.ts`

- New `CombiningOperation` and `combineVariableValue(operation, current,
  operand)`:
  - UNKNOWN current or operand -> UNKNOWN with that reason (never the
    default, never 0).
  - BOUNDED in either -> UNKNOWN (`STATE_NOT_MODELLED`); bound arithmetic
    needs sign reasoning, as the expression evaluator already refuses.
  - Exact / ONE_OF: applied member by member when at most ONE side is a set
    (each member is one world's exact value). Two sets are never paired:
    `op=add,value=variable.x` reads the same unresolved value twice, so
    pairing would manufacture values -> UNKNOWN.
  - The result double is the engine's: IEEE `+ - * /` correctly rounded,
    `fmod` exact (JS `%`). min/max follow `std::min/max` tie rules. `pow` only
    when the exact result is a safe integer (integer base, non-negative
    integer exponent; BigInt), because libm `pow` is not correctly rounded
    everywhere; any other pow, and any non-finite input or result, is UNKNOWN.
- `executeVariableLine` routes the ten operations through it, reading the
  current value with the existing `variableValueBeforeWrite` (this scan's
  assignment, a carried precombat value / established default, else the
  unknown incoming value). The record is `ASSIGNED` with the operation name.
  A missing `value=` stays `NOT_MODELLED / MISSING_EXPRESSION`, as for set. An
  undecided `if=` joins with the prior value, as before.
- **Review cycle 1 fix (constant folding).** `floor` and `ceil` can be
  constant (variable.cpp:216-221), so SimulationCraft may fold their
  variable to its end-of-iteration-0 value. New
  `neverFoldedVariables(authority)` (memoised): names with a named
  `add`..`max` line carrying exactly one `op=` and a `value=` (never
  constant, variable.cpp:202-205; kept by the constructor, :52-98).
  `executeVariableLine` takes it as a new optional last parameter; `floor`
  / `ceil` on any other variable, or without the set, write UNKNOWN
  (`NOT_MODELLED / CONSTANT_FOLDING`). `nested-selection.ts` (new
  `variablesNeverFolded` context field) and `precombat-variables.ts` pass
  it.
- `cycling_variable` stays `NOT_MODELLED / CYCLING_VARIABLE` for every
  operation: the execution count and every per-target value depend on the
  enemy set, which has no authority (TARGET_COUNT, ONB-S3 owner decision).
  Header documents why.

### `src/simc/nested-selection.ts`, `src/simc/precombat-variables.ts`

Pass `neverFoldedVariables(authority)` to `executeVariableLine`; comment.

## Tests

- New `tests/unit/onb-s2-variable-combining.test.ts` (28 tests): every
  operation's pinned arithmetic; div/mod by zero; fmod sign; floor/ceil on
  negatives and ignoring `value=`; min/max ties; exact-only pow (2^0.5,
  2^-1, 1.5^2, 3^40 UNKNOWN); overflow UNKNOWN; unknown incoming value
  UNKNOWN (incl. `mul,value=0` and a `default=`); unknown/unsupported operand
  UNKNOWN; bounded UNKNOWN; set mapping and the two-set refusal; if= FALSE /
  undecided; cycling_variable UNKNOWN incl. the pinned Vengeance and
  Affliction lines; scan chains (reset->add->div->floor decides; Devourer
  `void_ray_count` shape KNOWN 0 only with metamorphosis proven down,
  UNKNOWN when up; Vengeance `%`+ceil shape UNKNOWN); precombat (talent-
  derived chain carries a set; Balance `on_use_trinket` UNKNOWN; add over the
  established default); and a guard that none of the five public authorities
  has a combining or cycling_variable line.
  Cycle 1 adds: `neverFoldedVariables` proof rules (add/max/cycling min
  prove; floor/ceil/reset/set/setif, background and repeated-option lines
  do not); floor/ceil without proof write UNKNOWN; the reviewer's scan
  (`x=1.5; floor|ceil; y,if=x=..; x=2; z`) is UNKNOWN for both; with an
  `add` line elsewhere they execute (floor -> y, ceil -> z); the Vengeance
  shape stays UNKNOWN with and without the proof.
- RE-POINTED (with in-file notes), because their old expectation was the
  pre-ONB-S2 "not modelled" behaviour this tranche replaces:
  - `m11d3c2-variable-execution.test.ts`: the not-modelled list drops `add`,
    `sub`, `max`, `floor` (kept cycling_variable, delay, malformed line_cd);
    the no-false-REJECTED case now uses `cycling_variable`, plus a new case
    for a combining line over the unknown incoming value.
  - `onb-s1-precombat-variables.test.ts`: the "unmodelled precombat
    operation" case now adds `combo_points` (pre-pull state, UNKNOWN) instead
    of the constant 1 (now an exact 2).

## Public re-measure

None of the five pinned public authorities (Blood, Brewmaster, Protection,
Retribution, Assassination) has a combining or `cycling_variable` line
(pinned by test), so no public decision changes. The full suite, including
the public corpus/determinism tests, passes unchanged.

## Constant folding: fixed for ONB-S2's operations, pre-existing gap recorded

SimulationCraft folds a variable whose every action is constant to its
end-of-iteration-0 value from iteration 1 on (action_variable.cpp:25-78,
player.cpp:6694-6697, 11959-11963; variable.cpp:174-187). A read between two
constant writes then sees the folded value, while the scan model reads the
earlier write.

- The first review correctly found that executing `floor`/`ceil` widened
  this: they can be constant. The earlier claim that ONB-S2 did not widen it
  was wrong. They are now gated on `neverFoldedVariables` (above).
- `add`..`max` are never constant (variable.cpp:202-205), so a variable
  with one never folds.
- The remaining gap predates ONB-S2 (`set`/`setif`/`reset` variables) and
  needs SimulationCraft's expression `is_constant` to fix. Audit: in the five public
authorities the only multi-write variable is Assassination
`trinket_sync_slot` (two precombat lines, no read between them), so no public
decision is affected. Recorded in `agent/follow-ups.md` with the rule it needs.

## Validation

- `npm run typecheck`: clean.
- Focused: onb-s2 (28), m11d3c2, onb-s1, m11d3c3, m11d1 — 133 pass.
- `npm test` (full, both projects, on this machine under load): 11,919
  passed, 20 failed (cycle 1 rerun; the first run was 11,914 / 21) — every failure a 5 s timeout or a temp-directory race
  in files this tranche does not touch (simulation runner service,
  Protection projection/corpus, raid-night orchestration). Each failing
  file passes when re-run alone (runner-service queue/security/hardening/
  parity, m11a4, m10d projection, m10c5b, m11g2, m9b, m7f single-player-
  truth, m10d second-registration). GitHub CI is the arbiter.
- `npx prettier --check` on changed files: clean.

## Docs

- `agent/architecture.md` "Since ONB-S2".
- `agent/follow-ups.md` "After M11-D3-C2": combining resolved; what remains
  (cycling_variable on ONB-S3, `%` and unary minus unparsed, bounds/two-set
  refusal, `op=report`).
- `agent/spec-onboarding-inventory.md` notes.
