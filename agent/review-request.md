# Review request

Rolling file: overwritten for each review cycle.

## Tranche

M12-B: Healer Foundation, damage episodes (internal). Branch
`m12-b-raid-damage-events`, from main at 57d11f9 (M12-A merged).

## Review cycle 2: response to CHANGES_REQUIRED (cycle 1)

**The finding.** A damage hit with no ability id was counted in
`hitsWithoutAbility` but did not affect episode completeness. Fixed:

- `EpisodeCoverage` UNKNOWN now carries `unidentifiedHitsInSpan`.
- An episode is COMPLETE only when no unidentified hit on a roster player
  lies in `[first - gap, last + gap]`, because any one could be this
  ability's.
- **New tests:**
  - an unidentified hit inside the episode gives UNKNOWN, with 1;
  - the reviewed reproduction (ability 100 on player 5 at 50 s, an
    unidentified hit on player 9 at 51 s) is UNKNOWN, with 1;
  - unidentified hits beyond the margin on both sides (52,001 and 47,999)
    leave the episode COMPLETE.
- **Mutation.** Dropping the new condition fails the first two tests.
- **Real evidence.** The window has no unidentified hits
  (`hitsWithoutAbility` 0), so every pinned value is unchanged.
- **Focused tests.** The damage-episode file and the layering guard pass: 419
  tests, 20 of them in the damage-episode file. Typecheck and formatting are
  clean.

## Owner decision this tranche implements (2026-10-31)

The regression corpus stays at 5.5 MiB, and its remaining ~18.6 KB is treated
as exhausted.

- **Where evidence goes.**
  - The full real evidence needed to establish healer behavior goes to the
    evidence archive.
  - From that evidence, derive the smallest deterministic regression fixture
    that protects the proven behavior.
  - Do not weaken evidence or discard meaningful context to fit.
- **If fixtures do not fit.** When several M12 slices produce genuinely
  minimal fixtures that cannot fit, stop and bring a measured proposal. The
  limit is never raised preemptively for one tranche.
- **Where it is recorded.** `agent/architecture.md` "M12-B",
  `tests/evidence/README.md`, and the new `agent/follow-ups.md`
  "Regression-corpus ledger".

## What changed

- **`src/healing/damage-episodes.ts` (new).** `damageEpisodesOf(fight, gapMs
  = 2 000)`, revision `healing-damage-episodes/1`, authority
  `WCL_OBSERVED_FACT`.
  - **Grouping.** DAMAGE events whose target is in the declared friendly
    roster, grouped by ability into episodes of hits at most `gapMs` apart.
  - **Per episode:** first and last hit, hits, the reported sources,
    `hitsWithoutSource`, and per target the hits, first and last hit, and
    `lowestObservedHealth`. Health comes only from a snapshot of that same
    target instance.
  - **The roster** is `breadth.friendlyActorsInScope`, filled only under
    FULL_RAID. Without it the report is `ROSTER_NOT_IN_SCOPE`, with no
    episode list. This is the field's first reader.
  - **COMPLETE** requires DAMAGE coverage for EVERY roster player over
    `[first - gap, last + gap]`, and no ability-less hit on the roster in
    that span (review cycle 2). Otherwise the episode is UNKNOWN with
    `beyondFightEdge`, `uncoveredActors` (each with the shared gate's
    reason) and `unidentifiedHitsInSpan`.
  - **Never:** totals (follow-up M1), damage dealt by the raid, or any
    threshold called "raid-wide", "dangerous" or "healable".
- **`scripts/sanitize-probe.mjs` (revision bumped to `sanitize-probe-8`).**
  - A new `--friendly-players-slice <fightId> [<to>] --catalog <context>
    [--from] [--families]` mode.
  - `deriveFriendlyPlayerRoster` reads the fight's WCL `friendlyPlayers`
    from a committed fight context. It refuses a fight listed other than
    once, an empty roster, a duplicate, or an id that is not exactly one
    `Player`.
  - Earlier modes and their bytes are unchanged; typings are in
    `sanitize-probe.d.mts`.
- **Test support.**
  - `tests/support/corpus/contract.ts`: `actorSlice` is now a discriminated
    union of the existing `FOCUS_WITH_OWNED_PETS` and a new
    `FIGHT_FRIENDLY_PLAYERS`.
  - `loader.ts`: `friendlyRosterFromCatalog`, mirroring the slicer rule. It
    re-derives the scope per mode, including the slice's fight id. Every
    existing check (grant scope, families feeding categories, predicate,
    activity split) is shared.
  - `fight.ts`: a bundle of friendly-players slices requires every part to
    name the same roster. It builds a FULL_RAID fight with that roster in
    `friendlyActorsInScope`.
  - `synthetic-fight.ts`: a `friendlyActorsInScope` option, default `[]` as
    before.
- **Evidence archive.**
  - Three compact segments, `wcl-b1pm-fight-48-friendly-players.seg-*`:
    fight +69.5 s to +77.0 s, 2,474 events, 974,973 bytes, cut offline from
    the M11-E2 capture.
  - Families: damage, extraattacks, heal, absorbed, healabsorbed, death.
  - Grants: DAMAGE, HEALING and ABSORBS for the twenty-player roster.
  - Three normalization census cases.
  - Pins: ordinary archive growth is named and pinned in
    `m11c4e-evidence-archive.test.ts` (artifacts plus frames 18,038,979;
    without the M11-E2 and M11-G2 exceptions still under 4 MiB); the archive
    gate has 12 cases and 30 assertions; `tests/evidence/report.json` was
    rewritten from an execution.
- **Tests.**
  - `tests/unit/healing/damage-episodes.test.ts`: 20 tests, synthetic plus
    the real bundle.
  - `tests/unit/m12b-friendly-players-slice.test.ts`: 10 tests, covering
    slicer refusals, a byte-exact re-cut of the committed segments from
    their own bytes, and five loader `ACTOR_SLICE_INVALID` tamper cases.
  - Updated pins:
    - the healing layering guard lists both modules;
    - `m9c-sanitize-payloads` expects revision 8;
    - `m11e2-blood-dk-fixture` narrows the actor-slice union for its owned-pet
      re-cut.
- **Docs.**
  - `agent/architecture.md` "M12-B", including the owner decision.
  - `agent/follow-ups.md`: "Regression-corpus ledger" and "After M12-B".
  - `agent/testing.md`.
  - `tests/evidence/README.md`.

## Regression fixture: measured, not committed

- **What would fit the purpose.** The smallest fixture that proves one
  COMPLETE episode is 230,811 bytes: episode 1,282,525 with its ±2 s
  margin, damage and extraattacks for all 20 players, granted DAMAGE.
- **Why not smaller.** A grant-free fixture of only its 20 hits (~9 KB)
  cannot prove COMPLETE.
- **Why nothing was committed.** Neither fits the exhausted capacity, and
  this is one tranche, so the measurement is recorded in the ledger and no
  limit change is proposed.
- **What protects the behavior instead.** Unit tests that read the
  committed archive segments in every `npm test` (the M11-E2 precedent).

## Decisions made (please assess)

1. **A new slice mode, not 20 actor slices.** Separate actor slices would
   duplicate shared events. The bundle composer refuses that, and it is how
   a whole-raid claim can be granted.
2. **The window is chosen for what it evidences, not trimmed.** It is the
   7.5 s that holds the two raid-wide episodes whole with ≥2 s covered
   margin. It costs 975 KB of the archive's ~2.71 MB ordinary headroom; an
   11 s window was 1.41 MB.
3. **Heals and absorbs are retained** although this primitive reads only
   damage. They are "what covered it", the context the next healer tranche
   reads.
4. **The roster is players only.** That is WCL `friendlyPlayers`; pets are
   recorded in "After M12-B".
5. **Episodes are grouped by ability with a 2 s default gap.** It is a
   grouping parameter, not a threshold. Its effect on a ~2 s tick is
   documented.

## Validation

- **Real-evidence values.** They were derived from the raw segment bytes by
  an independent script before the primitive ran on them, then pinned:
  - 15 episodes, 5 COMPLETE;
  - 1,285,979: 7,508,081 to 7,511,098, 80 hits, 20 targets, source 180#1,
    lowest 560,336/907,160 (actor 16);
  - 1,282,525: 20 hits, source 161, one target with no own snapshot;
  - the first raid tick (1,284,561 at 7,506,237) UNKNOWN, `beyondFightEdge`.
- **Mutation proofs.** Each was applied to `src/healing/damage-episodes.ts`,
  run, and restored from a copy (confirmed with `cmp`). Every one is caught:
  - M1, coverage always COMPLETE: 5 failures, including the real counts.
  - M2, only hit targets coverage-checked: 2 failures (the out-of-scope
    player and the margin gap).
  - M3, any target counts: 2 failures (the roster filter and the real
    counts).
  - M4, any snapshot is health: 1 failure.
  - M5, the fight edge ignored: 3 failures.
  - M6, a roster without FULL_RAID: 1 failure.
- **Evidence gate.** `npm run test:evidence -- --write-report` passed: 12
  cases and 30/30 assertions in two workerd runs with byte-identical
  reports, and the manifest is current.
- **Focused suites pass:** damage episodes (17 at cycle 1, 20 now), friendly-players slice (10),
  the healing layering guard, the archive tests (22), the M11-E2 fixture,
  sanitize-probe, and m9c sanitize payloads.

- **Static checks.** `npm run format:check` and `npm run typecheck` are clean.
- **Corpus gate.** `npm run test:corpus` passed, unchanged: 183 cases and
  778 assertions. The loader and contract changes leave the regression corpus
  untouched.
- **Full suite.** `npm test` on a heavily loaded machine reported 353 files
  and 10,535 tests, of which 17 tests failed.
  - 15 were timeout overruns: 14 against 5 s and 1 against 20 s (the
    archive-reading `m11g2-comparison-evidence` re-cut).
  - 1 was the known `wlc-simc-*` shared-tmpdir race (runner-service-queue
    W).
  - Serial reruns: the 9 failing node files passed, 9/9 files and 134/134
    tests, `m11g2-comparison-evidence` included. The 4 workers files passed
    74/75; the one failure is the known `m8g-encounter-context-composition`
    overrun (5.79 s against 5 s), which also overruns with main's config
    under this load.
  - Timeouts were not changed. CI is the authority for the unloaded run.

## External / network activity

None. No Warcraft Logs request was made. Everything was cut offline from
the gitignored M11-E2 capture, and the committed bytes carry no names (the
catalog is the existing sanitized one).

## Staged / committed

Committed after the local review returned APPROVED (cycle 2). The committed files are:

- `src/healing/damage-episodes.ts`
- `scripts/sanitize-probe.mjs`, `scripts/sanitize-probe.d.mts`,
  `scripts/corpus/build-manifest.mjs`
- `tests/support/corpus/{contract,loader,fight}.ts`,
  `tests/support/synthetic-fight.ts`
- `tests/evidence/artifacts/wcl-events/wcl-b1pm-fight-48-friendly-players.seg-{69500-72500,72500-75500,75500-77000}.json`,
  `tests/evidence/manifest.json`, `tests/evidence/report.json`,
  `tests/evidence/README.md`
- `tests/unit/healing/damage-episodes.test.ts`,
  `tests/unit/m12b-friendly-players-slice.test.ts`
- `tests/unit/m11c4e-evidence-archive.test.ts`,
  `tests/regression/m11c4e-evidence-archive-gate.test.ts`,
  `tests/unit/m9c-sanitize-payloads.test.ts`,
  `tests/unit/m11e2-blood-dk-fixture.test.ts`,
  `tests/contracts/m12a-healing-layering.test.ts`
- `agent/architecture.md`, `agent/follow-ups.md`, `agent/testing.md`,
  `agent/review-request.md`

`.claude/` and the three local `scripts/probe/*.probe.ts` files stay excluded.
