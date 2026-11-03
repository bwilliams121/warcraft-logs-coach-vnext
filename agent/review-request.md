# Review request

Rolling file: overwritten for each review cycle.

## Change

HEAL-B3: Discipline Priest (internal, own representative). Branch
`autopilot/heal-b3`, from main at 188fca2.

- **Warcraft Logs: NONE.** No request, probe or capture. Runtime data is
  extracted verbatim from the pinned SimulationCraft files already retained
  locally (`trait_data.inc`, `sc_spell_data.inc` at 33622e9d, hashes recorded);
  real-evidence tests read committed archive captures only.
- **Public contract: NONE.** Nothing under `src/contracts/`, `src/api/` or
  `src/mcp/` changes. `priest/discipline` joins `INTERNAL_ONLY_SPEC_IDS`; the
  identity table does not resolve Priest/Discipline; a public request stays
  `SPEC_NOT_SUPPORTED`.
- **Queue bookkeeping:** HEAL-B2P recorded MERGED (PR #50, 188fca2d…); HEAL-B3
  set PR_OPEN with branch and outcome; Discipline Priest appended to ONB-EV's
  evidence list. Every other merged tranche the supervisor listed was already
  recorded MERGED.

## The problem and the decision

Discipline heals through damage (Atonement), which the shared healing
primitives do not represent, and per-cast Atonement judgement has no approved
model. The tranche models only what Warcraft Logs reports, spec-owned, and
leaves the rest UNKNOWN (agent/architecture.md "HEAL-B3").

## Code

- `src/specs/priest/discipline/` (`discipline-priest-evaluator/1`): identity
  gate (stated Priest/Discipline; Holy/Shadow refused), the shared cooldown-use
  facts and plan rules unchanged, and `atonement.ts`.
- **Atonement observation** (attached to the evaluation as `atonement`, NOT a
  decision category, NOT a finding; the shared healer finding set is
  unchanged):
  - applications: `applybuff`/`refreshbuff` of 194384 whose reported source is
    the player or a stated pet, inside the encounter, with locators and
    per-target counts; stack changes (`applybuffstack`, normalized APPLIED
    with `isStackChange`) and removals not listed, no interval/uptime claimed;
  - healing as reported: `heal` events of 81751 from the same sources, counts
    only (no amount);
  - damage-to-heal link: always `UNKNOWN DAMAGE_EVENT_LINK_NOT_REPORTED`;
  - each listing COMPLETE only under the ACTOR-GLOBAL gate (`gateActorGlobalClaim`)
    over the encounter and with nothing unattributable (sourceless event of the
    id, ability-less subject event of the family, subject event of a pinned
    same-name unreviewed id); otherwise UNKNOWN with the reason and counts.
- **Runtime data**: `priest-discipline-healing-cooldowns.{json,ts}` (Power
  Word: Barrier 62618 + Ultimate Penitence 421453 on choice node 82564,
  Evangelism 472433; shared reader) and `priest-discipline-atonement.{json,ts}`
  (every pinned "Atonement" spell row: buff 194384, heal 81751, four
  SAME_NAME_UNIDENTIFIED; own small loader checking name/id/role coherence).
- **Registration**: the HEAL-B1 internal healer shape (provider-less families,
  FULL_RAID derived, never ANALYZED, no view/prose), declared categories add
  AURAS. Catalog twelve rows.
- **Corpus**: layer `SPEC_DISCIPLINE_PRIEST`, its executor, two cases
  (unstated subject; internal-only reachability); report regenerated.

## Real evidence (committed, raw-checked)

- M13-A Discipline Priest (actor 9): Evangelism 190,592 and 281,877, Ultimate
  Penitence 232,488; every listing UNKNOWN (filtered capture),
  ROSTER_NOT_IN_SCOPE overlap.
- G2 cohort246 fight 33, stated Discipline Priest actor 88: seven Atonement
  applications onto actor 7 (raw: 7 applybuff + 7 removebuff); application
  listing UNKNOWN INSUFFICIENT_COVERAGE; healing listing UNKNOWN and empty (the
  capture's query excluded heals), never "none".

## Tests

- `tests/unit/specs/heal-b3-discipline-priest.test.ts` (16): artifacts and
  their fail-closed parses; Atonement semantics on synthetic fights (sources,
  operations, stack change/debuff/removal/outside-encounter excluded, other priest excluded,
  pet listed under its source, scoped coverage INSUFFICIENT_SCOPE, gap
  INSUFFICIENT_COVERAGE, sourceless / ability-less / same-name UNKNOWN, no
  amount key, finding set unchanged); real evidence above; Holy/Shadow refused.
- Discipline Priest is a fifth case in `heal-b1-healer-evaluators` and
  `heal-b1-healer-registrations` (every shared healer case passes).
- Pin ripple (no assertion weakened): internal-only set, catalog rows and
  counts (11 to 12), registered trees, roster (28 unregistered), module
  conformance (identity evidence: M13-A context actor 9), counted catalogs,
  healing-consumer list, corpus counts (197 cases / 792 assertions).

## Validation

- `npm run typecheck`, `npx prettier --check .`: clean.
- Focused and affected suites: pass (heal-b3 17 tests, heal-b1 evaluators and
  registrations, all contracts, corpus harness/manifest, mixed raid nights,
  integration transports).
- Full `npx vitest run`: 12,715 passed, 19 failed, every one a 5-60 s timeout
  in load-sensitive suites (Protection projection, raid-night orchestration,
  simulation runner). Rerunning those 12 files at two workers: 352/355 pass;
  the remaining three (`m8g` byte-identical, simulation `U.` and `W.` job
  directory cleanup) also fail on a clean origin/main worktree under the same
  conditions (`W.` passed there), so they are pre-existing and unrelated.
- `node scripts/corpus/gate.mjs --write-report`: PASSED (double workerd run
  byte-identical); `--root evidence`: PASSED, committed report unchanged.

## Review cycle 1 correction

The first local review found `applybuffstack` (normalized APPLIED with
`isStackChange: true`) counted as an application. Fixed: stack changes are
excluded; the applications test now carries an `applybuffstack` and a
`removebuffstack` of 194384 and pins that only the applybuff/refreshbuff events
and their per-target counts appear.

## Not established (follow-ups "After HEAL-B3")

HEAL-B3P cannot pass the healer gate on committed evidence (no whole-fight
Discipline capture; fight 48 has none; appended to ONB-EV); the public
Atonement shape is HEAL-B3P's decision; no committed Atonement heal event yet;
same-name ids unreviewed; no Atonement interval; narrow cooldown selection;
the registration facade is copied once more (shared helper still its own
refactor).
