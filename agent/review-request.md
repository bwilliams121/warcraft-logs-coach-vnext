# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-D1P: Destruction Warlock (public). Branch `autopilot/onb-d1p`, from main at 6cdf7c7. **Outcome: not promoted. It stays INTERNAL_ONLY, because it cannot pass the rotational promotion gates.**

- **Warcraft Logs: NONE.** No request or probe. The census and replay read retained files offline, the replay through a fake transport.
- **Public contract: declared EXPECTED; actual change NONE, because nothing passes.** Nothing under `src/contracts/`, `src/api/` or `src/mcp/` changed. A public Warlock/Destruction request is SPEC_NOT_SUPPORTED, as before, with preparation still run and partial coverage disclosed.
- **Production code: NONE.** The only non-doc changes are one new row in a refusal test and one test comment.
- **Queue bookkeeping:** ONB-D1 is recorded MERGED (PR #69, 6cdf7c74…), and ONB-D1P is set to PR_OPEN. The supervisor's whole merged list was compared by script (see Validation).

## The thing to check first: is "not promoted" the right call, rather than an owner stop?

Onboarding rule 4: a specialization that cannot pass stays INTERNAL_ONLY, with its reason in the inventory. ONB-B1P, ONB-B3P and ONB-C1P decided the same shape. The decision that could change it, ONB-S3, is already queued as the owner's, so this tranche asks nothing new.

Please check that the gates are not weakened. They are not touched. OBSERVATION and DISCRIMINATION both start from a real resolved decision, and Destruction has none.

## The evidence

**Replay** (`.probe/onbd1p/m/`), at this base, through production ingestion and the facade:

| Subject | Build | Retained span | Result | Eligible | MATCH | REJECTED | UNKNOWN | Excluded |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| A7R6kxPJ1hC8YQ4w fight 7 actor 12 | Hellcaller | first 165.0 s of 424.5 s | ANALYZED | 115 | 0 | 0 | 115 | 21 |
| A7R6kxPJ1hC8YQ4w fight 7 actor 15 | Hellcaller | first 165.0 s of 424.5 s | ANALYZED | 105 | 0 | 0 | 105 | 12 |

The output file is identical, line for line, to ONB-D1's. Anchors: 103 instant, 4 Soul Fire with an observed begin, 111 Chaos Bolts and Incinerates ambiguous, 2 Soul Fires begun before the pull.

**Census** (`.probe/onbd1p/census.cjs`, `census.txt`, `actors.cjs`): 5,684 JSON files over 500 bytes under `.probe/` and `tests/`, skipping tool output and worktree copies; 5,683 parsed. It reads events of **any type and any source** for the ids the contexts' master data gives the family's ability names. ONB-D1's census read casts only. Positive control, Mortal Strike: 985 events, 559 casts.

Every source holding one of those casts was resolved against its report's actors. The other sources are Demonology players (Infernal Bolt, Ruination), one Affliction player (Wither, Malevolence), the subjects' own Overfiend pets (Chaos Bolt), and other players' pets (Immolate). The other two contexts naming a Destruction hold no event. So no third subject exists, and no Destruction Diabolist event is retained.

Limits: it does not read JSON files of 500 bytes or less, or log and text output. It matches named ability ids, so a file holding only other abilities would not appear.

## Decisions a reviewer might reject

1. **Not on ONB-EV.** Two subjects are retained, and even a whole-fight Diabolist capture would resolve nothing, because the enemy count comes first. Both are short prefixes of one fight, both Hellcaller, so a later promotion needs more than it has now; that is stated in architecture rather than raised as an evidence gap today.
2. **Two corrections to ONB-D1's records, made here.** A report code was misspelled (`LYwF6…`, the context says `LYwFG…`) in architecture and follow-ups. The inventory row's "nothing committed but its context rows" was too strong: Assassination fixtures from the same pull hold a few events of these actors, including two Chaos Bolt casts. Neither is a decision set, and the gate search still finds nothing. **The ONB-D1 architecture text itself still says "only their context rows are committed"**: left as that tranche's record, with the correction in "ONB-D1P".
3. **The refusal row is new.** ONB-D1 added the gate-search pin but no row in `analysis-composition-refusals`, so this tranche adds `["Warlock", "Destruction"]`. `Warlock` is what the registration's `wclClassName` and the wire use.

## What changed

- Docs: `agent/architecture.md` "ONB-D1P" and the report code in "ONB-D1", `agent/follow-ups.md` "After ONB-D1", `agent/testing.md`, `agent/spec-onboarding-inventory.md` (the note and the row; counts unchanged), `agent/autopilot-queue.md`, `src/specs/warlock/destruction/README.md`.
- Tests: `tests/unit/analysis-composition-refusals.test.ts` (new row), `tests/contracts/m11-promotion-evidence-gate.test.ts` (comment only).

## Validation run

- `npm run typecheck`: clean. `npm run format:check`: clean. `git diff --check`: clean.
- `npm run test:corpus`: PASSED. `npm run test:evidence`: PASSED. Both ran in sequence, with no suite beside them.
- Full suite, parallel, 60 s timeout: 15,569 tests, 15,567 passed, 2 failed. This change touches neither's code.
  - `m9b-corpus-harness` SPEC_PROTECTION_PALADIN, on the recorded list of parallel-load failures.
  - `simulation/runner-service-queue` W, "no job directory behind". It lists the shared OS temp directory for any new `wlc-simc-*` name, so a parallel test's directory would trip it. Its one leftover is consistent with that; I did not prove it.
  - Both pass rerun without the full suite beside them, so I infer load. The whole suite has not run clean in one pass.
- `m9b-corpus-harness`, `runner-service-queue`, `analysis-composition-refusals`, `m11-promotion-evidence-gate`, `onb-d1-destruction-warlock`, `m10d-public-registration` and `m10a-spec-partition` rerun together: 200 passed (200).
- Queue compared by script with the supervisor's whole merged list, including ONB-C2P and ONB-D1: 51 compared, 0 mismatched.
- No network to Warcraft Logs.

## What is not here

No promotion, no gate change, no public change, no new evidence, no production code, no Warcraft Logs request.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
