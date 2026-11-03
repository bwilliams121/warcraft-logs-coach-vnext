# Review request

Rolling file: overwritten for each review cycle.

## Change

HEAL-B2: Holy Priest (internal). Branch `autopilot/heal-b2`, from main at
f066fd3.

- **Warcraft Logs: NONE.** No request, probe or capture. Real evidence is the
  committed M13-A capture and the committed fight-48 friendly-players window;
  the identity data is read from the pinned SimulationCraft `trait_data.inc`
  already used by HEAL-B1 (local copy `.probe/simc-33622e9d/`, sha256 as
  recorded in the artifact provenance).
- **Public contract: NONE.** Nothing under `src/contracts/`, `src/api/` or
  `src/mcp/` changes. `priest/holy` is INTERNAL_ONLY; a public Priest/Holy
  request stays SPEC_NOT_SUPPORTED with no dispatch.
- **Queue bookkeeping:** HEAL-B1P is recorded MERGED (PR #48, f066fd39…);
  HEAL-B2 is set PR_OPEN with its outcome. Every other merged tranche the
  supervisor listed was already recorded MERGED with its pr and mergeSha.

## Code

- **`src/specs/priest/holy/`** (`spec.ts`, `evaluator.ts`, `registration.ts`,
  `README.md`), revision `holy-priest-evaluator/1`. A copy of the Restoration
  Druid internal shape (HEAL-B1) with its own identity strings and data
  loader; the shared healer modules (`src/healing/cooldown-use-context.ts`,
  `src/findings/healer-assignment-execution.ts`,
  `src/findings/healer-finding-projection.ts`, the artifact reader) are
  consumed unchanged. Identity gate: stated Priest/Holy and a Priest player in
  the master data, else IDENTITY_REFUSED. Three provider-less families from
  `HOLY_PRIEST_REQUIRED_INPUTS` (FULL_RAID derived), no binding, never
  ANALYZED; HEALING_DECISION is NO_AUTHORITY_AVAILABLE; ASSIGNMENT is
  NO_AUTHORITY_AVAILABLE without a plan; COOLDOWN is observational.
- **`src/data/game/priest-holy-healing-cooldowns.{json,ts}`**: class 5, spec
  257, two verbatim spec-tree rows, both NORMAL, no `id_override_spell`:
  Divine Hymn 64843 and Apotheosis 200183. The pinned Holy tree has no Holy
  Word: Salvation row. Guardian Spirit (external), Symbol of Hope and hero-tree
  spells are not identified (a plan entry for one is ABILITY_NOT_REGISTERED).
  No cooldown, charge or duration claimed.
- **Divine Hymn's channel shape**: the committed capture records the 64843
  `cast` then 64844 pulse `cast`s. 64844 is not identified, so a pulse is never
  a use and a plan window holding only pulses is not MET (tested).
- **Registration**: `src/findings/spec-id.ts` (`SpecId`, `SPEC_IDS`,
  `INTERNAL_ONLY_SPEC_IDS` = `druid/restoration`, `priest/holy`) and the
  catalog row in `src/services/analyzer-registry.ts` (eleven rows). No
  identity-table, contract or exposure change.

## Real evidence (committed, raw-checked)

| Subject | Result |
| --- | --- |
| M13-A Holy Priest, actor 2 | Apotheosis 168,785; Divine Hymn 249,326; Apotheosis 289,544 (the only identified casts by actor 2 in both raw segments, asserted byte-for-byte). Filtered capture: listing UNKNOWN (INSUFFICIENT_COVERAGE), overlap ROSTER_NOT_IN_SCOPE |
| M13-A Discipline (9) and Shadow (10) Priests | IDENTITY_REFUSED NOT_THIS_SPECIALIZATION, NOT_ASSESSED |
| fight 48 Holy Priest, actor 2 | no cast in the committed window: no use, listing UNKNOWN, never "none used"; sources 2 and stated pet 94 |

## Tests

- New `tests/unit/specs/heal-b2-holy-priest.test.ts` (artifact contents,
  Divine Hymn pulses, the real-evidence rows above).
- Holy Priest added as a fourth case to the parametrized
  `heal-b1-healer-evaluators` and `heal-b1-healer-registrations` files (every
  shared healer case: identity refusals, no-plan NO_AUTHORITY_AVAILABLE, plan
  outcomes, CASTS gap UNKNOWN, roster scope, INTERNAL_ONLY reachability). The
  "another class" case now takes a per-case class (Priest for the three HEAL-B1
  healers, as before; Paladin for Holy Priest).
- `healing-cooldown-identity-artifact`: five artifacts; Discipline/Shadow spec
  ids refused; an entry claiming 64844 refused as PINNED_ROW_MISMATCH.
- Corpus: layer `SPEC_HOLY_PRIEST`, executor `spec-holy-priest.ts`, two cases
  (unstated subject INSUFFICIENT_EVIDENCE; INTERNAL_ONLY reachability).
- Pin ripple: registration counts and lists (ten to eleven rows, internal-only
  set, module and discovery snapshots, cross-spec trees and imports,
  authority-free trees, roster unregistered 30 to 29, m12a healing consumers,
  m11a2 identity evidence actor = b1pm fight 48 actor 2, counted-catalog maps
  in transport and raid-night tests). No assertion was weakened.

## Validation

- `npm run typecheck`: clean. `npm run format:check`: clean.
- `npm test` full run (node + workers): 12,592 passed, 20 failed, all 5 s
  timeouts in load-sensitive suites (simulation runner, Protection
  projection, m7f raid night, m9b harness, m11g2, m10c5b, m11a4 evaluator,
  m10d invariance). Rerun of those 14 files at two workers: 223 passed, 1
  failed: `m8g-encounter-context-composition` "byte-identical across…", which
  times out alone too and identically on a clean origin/main worktree on this
  machine. Not a regression.
- Focused: heal-b2 (8), heal-b1 evaluators/registrations and artifact reader,
  all pass.
- `npm run test:corpus -- --write-report`, then `npm run test:corpus`: PASSED
  (two byte-identical workerd runs, 195 cases, 790 assertions).
- `npm run test:evidence`: PASSED (20 cases, 54 assertions; unchanged).

## Not established (follow-ups "After HEAL-B2")

HEAL-B2P's gate needs the fight-48 Holy Priest's whole-fight casts, not yet
committed; the selection is narrow by design; the registration facade is
copied a fifth time. That copy was reconsidered as "After HEAL-B1" asked: a shared
helper would rewrite four reviewed registrations (two PUBLIC) in a
one-specialization internal tranche, so it is recorded as the change to make
before the next healer copies the shape.
