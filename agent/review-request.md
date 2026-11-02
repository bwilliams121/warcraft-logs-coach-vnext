# Review request

Rolling file: overwritten for each review cycle.

## Tranche

M13-B: Recipient specialization state in the combat model. Autopilot queue
entry M13-B. Branch `autopilot/m13-b`, from main at edb5f6e.

- **Direction** (queue entry): carry each friendly player's Warcraft
  Logs-stated specialization, from fight-context master data, into the
  normalized combat model as observed identity, so Augmentation support and
  other-healer coverage can read it without guessing from class. Fail closed;
  nothing inferred from abilities cast; bump the normalization revision if
  the repository's rules require it.
- **Public contract: NONE.** Nothing under `src/contracts/`, `src/api/` or
  `src/mcp/` changes. See "Revision" for the one value that moves.
- **Warcraft Logs requests: none.** The field is decoded from the fight
  context every ingestion already retrieves; tests use committed evidence and
  synthetic payloads.
- Queue bookkeeping: M12-C (#18), PREP-5 (#19), M12-D (#20), M12-E (#21)
  and M13-A (#22, edb5f6e) recorded MERGED with their merge SHAs; M13-B
  PR_OPEN. The diff also carries the owner's 2026-11-02 M11-G4-5 deferral
  text (architecture.md, follow-ups.md, queue entry M11-G4-5-R BLOCKED),
  which was written on main's working tree and is committed here unchanged.

## What it adds

**`CombatFight.friendlySpecializations`**
(`src/engine/normalization/friendly-specializations.ts`, types and lookup;
decoder `readFriendlySpecializations` in `fight-context.ts`). For every id in
the fight's `friendlyPlayers`:

- `STATED { specName, className, rosterIndex }`: the `friendlySpecs` entry at
  that player's index, verbatim, with the player's catalog class (one name
  is several specializations: "Restoration", "Holy", "Frost").
- `UNKNOWN { reason }`, never a default:
  - `NOT_STATED`: missing, blank, non-string, or WCL's literal "unknown";
  - `ROSTER_NOT_ALIGNED`: the arrays are not index-aligned, so EVERY player
    is refused (never zipped to the shorter list);
  - `DUPLICATE_PARTICIPANT`;
  - the shared actor-resolution failures: `NOT_IN_CATALOG` (the `-1`
    sentinel included), `AMBIGUOUS_ACTOR_ID`, `NOT_A_PLAYER`,
    `ACTOR_RECORD_MALFORMED`, `IDENTITY_UNUSABLE` (a player with no class);
  - `NOT_IN_FRIENDLY_ROSTER` from `statedSpecializationOf`, for a pet, an
    enemy or an absent player. A pet never inherits its owner's.

One set of rules: the decoder calls `report-roster-facts.ts`'s
`readFriendlyRoster`, `resolvePlayerActor` and `isUsableSpecName`, which the
identity preflight and roster discovery already share. A refused player
fails closed alone; ingestion never fails on this field; `friendlyPlayers`
is unchanged.

**Scope.** Report-context identity, like the actor catalog's class
(`subType`), which every view already holds for every actor. The same object
is on the core and on every focused view, under either scope. Scope fences
absence claims over ally EVENT state (`breadth`, `completeness`); a stated
specialization is neither.

**First consumer.** The Augmentation evaluator (revision `/2`): each ally
window carries `recipientSpecialization`. It is read in the specialization,
not in `src/support/`: the M13-A layering guard keeps specialization
vocabulary out of the shared role module, and this tranche leaves that guard
untouched. No coaching, role or verdict reads it.

**Not done** (follow-ups "After M13-B"): no specialization-to-role source
("who is a healer"), no class/specialization compatibility table (a stated
name that is not a specialization of the class is carried verbatim), no
public surface.

## Revision

`NORMALIZATION_REVISION` `m3.4` → `m3.5`: the repository contract
(`combat-fight.ts`) bumps on any additive shape change, and
`normalization-boundary.test.ts` pins it. As at the M11-G4-1 bump, the
intentional delta is the VALUE of every ANALYZED raid-night/1 cell's
`provenance.normalizationRevision`; the schema is `z.string()` and
unchanged, and analysis/1 carries no normalization revision.

## Tests

- New `tests/unit/m13b-friendly-specializations.test.ts`: every UNKNOWN
  reason above, isolation between players, actor id 0, pets and enemies,
  a cast never establishing a specialization, the same object on every view
  under both scopes through the real `ingestFightCore`, and the real
  committed M13-A fight context (all twenty players STATED with class).
- `augmentation-evoker-evaluator.test.ts`: on real evidence the thirteen
  Ebon Might recipients carry their stated specializations, a pet recipient
  is NOT_IN_FRIENDLY_ROSTER.
- Test support: synthetic builders default to no stated specialization;
  corpus bundles with a fight-context catalog decode it with the production
  rules.

## Validation

- Review cycle 2: the first local review APPROVED and noted that
  `ACTOR_RECORD_MALFORMED` had no explicit assertion. It now has one (an
  actor record with no `type`); the M13-B test file passes (10 tests).
- `npm run format:check`, `npm run typecheck`: clean.
- Focused: `m13b-friendly-specializations`, `augmentation-evoker-evaluator`,
  `support-primitives`, `m13a-support-layering`, `normalization-boundary`,
  `wcl-fight-context`: all pass.
- `npm test` (366 files, 11,259 tests): 11,245 pass. The 14 failures are 12
  five-second timeouts plus one temp-directory race, all on a heavily
  loaded machine. Rerun alone, 9 of the 11 files pass. The other 2
  (`runner-service-queue` W, `runner-service-security` O, simulation
  runner, untouched here) fail identically on an `origin/main` worktree
  under the same load. Four of the timed-out files were timed on both trees
  back to back, twice: 21.1 s / 21.6 s on the branch, 21.9 s / 21.8 s on
  main, all passing.
- `npm run test:corpus`: PASSED (183 cases / 778 assertions, two
  byte-identical workerd runs, committed report unchanged).
- `npm run test:evidence`: PASSED (16 cases / 42 assertions, committed
  report unchanged).
