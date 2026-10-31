# Review request

Rolling file: overwritten for each review cycle.

## Tranche

M12-A: Healer Foundation, death timelines (internal). Branch
`m12-a-healer-foundation`, from main at bbc02b3 (TEST-HYGIENE merged).

Owner choice: "Start Healer Foundation", the first tranche of Milestone 12.
The stated direction was an evidence-grounded first slice (death timelines,
raid damage events, healing cooldown coverage, other-healer coverage), with
per-cast healing staying NO_AUTHORITY_AVAILABLE and assignments needing a
supplied plan. This tranche delivers the first of those, as a shared fact
primitive with no public surface.

## Review cycle 2: response to CHANGES_REQUIRED (cycle 1)

1. **Tick provenance.**
   - Damage entries now carry `raw.tickField` (`TickFieldState`: TRUE,
     FALSE, NOT_SUPPLIED or UNUSABLE_VALUE) instead of the collapsed
     `isTick` boolean.
   - Healing entries carry no tick field at all. The healing decoder keeps
     only the collapsed boolean, which cannot tell absent from false.
   - New synthetic test: explicit `tick: false` gives FALSE, an absent key
     gives NOT_SUPPLIED, `tick: true` gives TRUE, and the heal raw keys hold
     neither `isTick` nor `tickField`.
   - New real-bytes test: the Warrior's 13 damage-taken entries are
     `{NOT_SUPPLIED: 6, TRUE: 7}`.
   - Mutation `tickField: event.isTick ? "TRUE" : "FALSE"`: both tests fail.
2. **Heal-absorb coverage.**
   - New synthetic `healabsorbed` case through the normalizer, using the
     audited fight-48 shape (source and target are the absorbed actor,
     `healerID`, `extraAbilityGameID`).
   - It asserts the HEAL_ABSORBED kind, the reported source, ability 448,005,
     raw `{amount, absorbedAbilityGameId: 139, attributedActorId: healer}`
     and COMPLETE ABSORBS.
   - Mutation, every absorb typed DAMAGE_ABSORBED: the case fails.

The focused files (death timeline, both layering guards) pass: 426 tests.
Typecheck and formatting are clean.

## What changed

- **`src/healing/death-timeline.ts` (new; the first module in
  `src/healing/`).**
  - `deathTimelinesOf(fight, actorId, lookbackMs = 10 000)` returns one
    timeline per positive death of the actor (M11-F `observedDeathsOf`).
    Revision `healing-death-timeline/1`, authority `WCL_OBSERVED_FACT`,
    `absenceSemantics: "NONE"`.
  - **Window.** `[death - lookback, death]`, clamped at the fight start and
    after the same instance's previous death (`clampedBy` records which).
  - **Entries.** Events TARGETING that exact actor instance: DAMAGE_TAKEN,
    HEALING_RECEIVED, DAMAGE_ABSORBED, HEAL_ABSORBED. Each carries:
    - raw fields verbatim;
    - the reported source;
    - `actorHealth`: a health snapshot only when Warcraft Logs attached one
      of that same actor instance, with its side. SOURCE appears only when
      the actor was its own source.
    - `atDeathTime` for the death's own millisecond.
  - **Coverage.** Per category (DAMAGE, HEALING, ABSORBS), from the shared
    `gateAbsenceClaim` over that actor and window. COMPLETE, or UNKNOWN with
    the gate's reason.
  - **Refusals.**
    - no totals (raw `amount` meaning is follow-up M1);
    - no events after the death;
    - no inferred killer;
    - no claim about unobserved deaths.
- **`tests/unit/healing/death-timeline.test.ts` (new, 25 tests).**
  - Synthetic raw WCL shapes through the real normalizer:
    - window bounds and direction (damage dealt and heals given by the actor
      are excluded);
    - the same-millisecond mark;
    - raw fields, and no total-like key anywhere in the report;
    - COMPLETE coverage under coverage, and three UNKNOWNs: a heal gap
      (`INSUFFICIENT_COVERAGE`, with the observed heals kept), an ally out of
      scope (`INSUFFICIENT_SCOPE`), and `CAPABILITY_UNVERIFIED`;
    - the fight-start clamp, the previous-death clamp, and instance keying;
    - another actor's snapshot is never the dying actor's health, while its
      own source-side snapshot (a self-heal) is;
    - no death means no timeline;
    - lookback validation.
  - The real death, read from the corpus:
    - 13 damage-taken, 38 healing-received and 3 absorb entries;
    - COMPLETE in all three categories;
    - killer 161 with ability 1,295,173;
    - a killing blow with raw overkill 81,824 and a TARGET snapshot of 0 hit
      points;
    - heal entries per source, the Warrior's 14 self-heals included.
- **`tests/contracts/m12a-healing-layering.test.ts` (new).**
  - `src/healing/` imports only `../engine/` and the capability vocabulary.
    The import detection also catches bare side-effect and dynamic imports.
  - It calls no clock, randomness or network primitive.
  - It declares no specialization or judgement word (spec/class names,
    should, expected, fail, blame, total, sum, hps, effective, alive, …).
  - Nothing in production imports it yet. This is a milestone guard,
    amended by name when the first consumer lands.
- **`tests/contracts/m11f-evidence-layering.test.ts`.** The reviewed
  importer list of `src/engine/state/death-state.ts` is amended explicitly to
  name `src/healing/death-timeline.ts`, with its reason, as M11-G2 did.
- **Corpus.** One SANITIZED_CAPTURE actor slice of the existing M11-E2
  capture: `wcl-b1pm-fight-48-warrior-5-death-5s`.
  - 103 events, 42,233 bytes, the 5 s up to actor 5's death; the only
    friendly player death in the capture.
  - Cut with `--families damage,extraattacks,heal,absorbed,healabsorbed,death`.
  - Grants DAMAGE, HEALING and ABSORBS for actor 5. DEATHS is NOT granted.
  - It has one normalization census case (three assertions).
  - Pins updated: 52 artifacts and 183 cases; 778 assertions; the actor-slice
    and coverage-retaining lists. `tests/corpus/report.json` was rewritten
    from an execution.
- **Docs.**
  - `agent/architecture.md`: a "M12-A" section.
  - `agent/testing.md`: healer damage-event tests.
  - `agent/follow-ups.md`: "After M12-A", covering no consumer or public
    surface, no corpus layer for `src/healing/`, one real death, the
    unregistered resurrect, raw amounts only, and the rest of the M12 list.
  - `tests/corpus/README.md`: "Contents after M12-A".

## Decisions made (please assess)

1. **Internal first, no consumer.** No analyzer declares FULL_RAID yet,
   because nothing consumes the primitive. Under PLAYER_CONTEXT an ally's
   categories are `INSUFFICIENT_SCOPE` through the shared gate, so the
   primitive needs no scope logic of its own. Wiring and FULL_RAID
   declaration belong to the consumer.
2. **One actor per call** (like the preparation producer), not "every
   friendly player". The core deliberately keeps no friendly roster role, and
   choosing whose deaths matter is the consumer's decision.
3. **No owning corpus layer for `src/healing/` yet.** The real-evidence
   assertions run in a unit test over a committed corpus artifact. This
   follows the M11-E1 combat-facts and M11-F death-state precedent.
4. **The health snapshot is keyed on actor identity, not side.** An earlier
   draft required TARGET side. A mutation showed the side check was
   redundant: another actor's snapshot is already rejected by identity.
   It was also wrong for self-heals, where the source-side snapshot is the
   actor's own health. Both directions are now tested.
5. **The default lookback is 10 s,** a reporting window and not a judgement
   threshold. The committed real slice is 5 s, because a 10 s slice (80 KB)
   would have crossed the owner's 5.5 MiB corpus line.

## Validation

- **Focused tests.** The death-timeline unit tests pass (22/22 at cycle 1, 25/25 now), and so does
  the layering guard.
- **Mutation proofs.** Each mutation was applied to
  `src/healing/death-timeline.ts`, run against its test, and restored from a
  copy, confirmed with `cmp`.
  - M1, coverage always COMPLETE: 3 caught (the heal gap, the out-of-scope
    ally, the unverified category).
  - M2, reading past the death: 4 caught.
  - M3, ignoring the actor instance: 1 caught (instance keying).
  - M4, health from any actor's snapshot: 1 caught (another actor's
    snapshot).
  - Layering: a spec-branching identifier, a bare `import
    "../specs/…"` and a dynamic `import("../services/…")` each fail the
    guard. The two import forms were uncaught by the M11-E1-style regex until
    it was widened in this test.
- **Corpus gate.** `npm run test:corpus -- --write-report` passed. Two
  workerd runs gave 183 cases and 778/778 assertions, with byte-identical
  reports. The manifest is current.

- **Static checks.** `npm run format:check` and `npm run typecheck` are clean.
- **Evidence archive.** `npm run test:evidence` passed. It loads the archive
  beside the corpus, so it re-checks the one-namespace and one-way-reference
  rules.
- **Full suite.** `npm test` on a heavily loaded machine reported 351 files
  and 10,497 tests, of which 15 tests failed.
  - **One real failure, fixed.** It was `m11f-evidence-layering`, the
    reviewed list of importers of `death-state.ts`. That guard is now
    amended explicitly, the way M11-G2 did: the death timeline reads
    `observedDeathsOf` only, is fact-only, and has no production importer.
  - **The other 14.** Twelve were timeout overruns (11 against 5 s, 1
    against 20 s) and two were the known `wlc-simc-*` shared-tmpdir races
    between parallel runner tests.
  - **Serial reruns.**
    - The 9 failing node files, the m11f guard included: 9/9 files and
      135/135 tests passed.
    - The 3 workers files: 38/39 passed. The one failure is the
      `m8g-encounter-context-composition` test, at 5.7 s against 5 s. It
      overruns the same way with main's config under this load (shown in
      TEST-HYGIENE), and CI passed it there.
  - Timeouts were not changed. CI is the authority for the unloaded run.

## External / network activity

None. No Warcraft Logs request was made. The slice was cut offline from the
gitignored M11-E2 capture (`.probe/m11e2/pages.json`), and no name appears
in the committed bytes.

## Known limitations

See `agent/follow-ups.md` "After M12-A".

## Staged / committed

Committed after the local review returned APPROVED (cycle 2). The committed files are:

- `src/healing/death-timeline.ts`
- `tests/unit/healing/death-timeline.test.ts`
- `tests/contracts/m12a-healing-layering.test.ts`,
  `tests/contracts/m11f-evidence-layering.test.ts`
- `tests/corpus/artifacts/wcl-events/wcl-b1pm-fight-48-warrior-5-death-5s.json`
- `scripts/corpus/build-manifest.mjs`, `tests/corpus/manifest.json`,
  `tests/corpus/report.json`, `tests/corpus/README.md`
- `tests/unit/m9b-corpus-manifest.test.ts`,
  `tests/unit/m9b-corpus-coverage-report.test.ts`,
  `tests/regression/m9b-corpus-gate.test.ts`
- `agent/architecture.md`, `agent/testing.md`, `agent/follow-ups.md`,
  `agent/review-request.md`

`.claude/` and the three local `scripts/probe/*.probe.ts` files stay excluded.
